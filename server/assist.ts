import { Hono } from 'hono'
import { z } from 'zod'
import { assistFallback, assistPrompts, assistSchemas, assistUserPayload, normalizeAssist, type AssistInputs, type AssistKind, type AssistResponse } from '../src/assist'
import { completeJSON, llmConfig } from './llm'
import { logAiEvent } from './db'

// POST /api/assist/:kind — one LLM helper per kind, each validated with Zod and backed by a deterministic answer.
const lang = z.enum(['ko', 'en'])
const inputSchemas: Record<AssistKind, z.ZodType> = {
  explain: z.object({ lang, task: z.object({ title: z.string().max(200), effortMinutes: z.number(), deadline: z.string().nullable(), urgent: z.boolean() }),
    candidates: z.array(z.object({ label: z.string().regex(/^[A-Z]$/), score: z.number(), finish: z.string().max(20), spareMinutes: z.number(), blocks: z.number(), rotation: z.boolean(), urgentCount: z.number().nullable(), factors: z.array(z.object({ id: z.string().max(30), weight: z.number(), value: z.number() })).max(10) })).max(3),
    usual: z.object({ label: z.string().regex(/^[A-Z]$/), usableMinutes: z.number(), reason: z.string().max(200) }).nullable() }),
  decompose: z.object({ lang, title: z.string().max(200), text: z.string().max(6000), skills: z.array(z.string().max(40)).max(10), effortMinutes: z.number().int().min(30).max(60 * 40), deadline: z.string().nullable() }),
  commitments: z.object({ lang, text: z.string().min(1).max(2000), now: z.number() }),
  brief: z.object({ lang, teamSize: z.number(), urgentTotal: z.number(), topTwoShare: z.number(), urgentCounts: z.array(z.number()).max(50), focusHours: z.number(), overlaps: z.number(), fragmented: z.number(), pendingReviews: z.number(), singleOwnerSkills: z.array(z.string().max(60)).max(10), lateRequests: z.number() }),
}
const isKind = (value: string): value is AssistKind => value in assistSchemas

export const assistRoutes = new Hono()
assistRoutes.post('/assist/:kind', async (c) => {
  const kind = c.req.param('kind')
  if (!isKind(kind)) return c.json({ ok: false, error: 'Unknown assist kind', kinds: Object.keys(assistSchemas) }, 404)
  let body: { input?: unknown; simulateFailure?: unknown }
  try { body = await c.req.json() } catch { return c.json({ ok: false, error: 'Body must be JSON: { "input": {...} }' }, 400) }
  const parsed = inputSchemas[kind].safeParse(body.input)
  if (!parsed.success) return c.json({ ok: false, error: 'Invalid input', issues: parsed.error.issues.slice(0, 3).map((issue) => issue.path.join('.') + ' ' + issue.message) }, 400)
  const input = parsed.data as AssistInputs[typeof kind]
  const started = Date.now()
  const fallback = (reason: string): AssistResponse<typeof kind> => {
    logAiEvent({ kind, mode: 'fallback', provider: 'rule-fallback', latencyMs: Date.now() - started, fallbackReason: reason })
    return { ok: true, mode: 'fallback', provider: 'rule-fallback', model: null, fallbackReason: reason, latencyMs: Date.now() - started, result: assistFallback(kind, input) }
  }
  if (body.simulateFailure === true) return c.json(fallback('Simulated LLM failure (demo control)'))
  if (!llmConfig().configured) return c.json(fallback('LLM unavailable or unconfigured'))
  try {
    const { data, provider, model } = await completeJSON(assistPrompts[kind], assistUserPayload(kind, input))
    const result = assistSchemas[kind].safeParse(data)
    if (!result.success) return c.json(fallback('LLM JSON failed schema validation'))
    logAiEvent({ kind, mode: 'live', provider, model, latencyMs: Date.now() - started })
    return c.json({ ok: true, mode: 'live', provider, model, fallbackReason: null, latencyMs: Date.now() - started, result: normalizeAssist(kind, input, result.data as never) })
  } catch (error) {
    const reason = error instanceof Error && (error.name === 'TimeoutError' || error.name === 'AbortError') ? 'LLM timed out' : error instanceof SyntaxError ? 'LLM returned invalid JSON' : 'LLM request failed'
    console.warn('[flow] assist fallback (' + kind + '):', reason)
    return c.json(fallback(reason))
  }
})
