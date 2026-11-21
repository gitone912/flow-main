import { calibrationFor, draftSchema, LLM_SYSTEM_PROMPT, llmUserPayload, ruleExtract, type ExtractResponse, type TaskDraft } from '../src/extract'
import { add } from '../src/domain'

// Fixture clock of the demo workspace; the client sends its own workspace clock when it has one.
const DEMO_NOW = add('2026-11-24', '09:00')

// The one live integration: server-side LLM calls (keys never reach the browser) with a deterministic fallback that always answers.
export type Provider = 'groq' | 'gemini' | 'openai'
const env = (name: string, fallback = '') => process.env[name]?.trim() || fallback

export function llmConfig() {
  const requested = env('LLM_PROVIDER', 'groq').toLowerCase() as Provider
  const provider: Provider = ['groq', 'gemini', 'openai'].includes(requested) ? requested : 'groq'
  const model = provider === 'groq' ? env('GROQ_MODEL', 'openai/gpt-oss-120b') : provider === 'gemini' ? env('GEMINI_MODEL', 'gemini-2.5-flash') : env('OPENAI_MODEL', 'gpt-4o-mini')
  const configured = !!env(provider.toUpperCase() + '_API_KEY')
  return { provider, model, configured, timeoutMs: Number(env('LLM_TIMEOUT_MS', '8000')) || 8000 }
}

class LlmError extends Error {}

async function post(url: string, body: unknown, headers: Record<string, string>, signal: AbortSignal) {
  const response = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json', ...headers }, body: JSON.stringify(body), signal })
  if (!response.ok) throw new LlmError('Provider returned HTTP ' + response.status)
  return response.json() as Promise<any>
}

async function callGemini(system: string, user: string, model: string, signal: AbortSignal) {
  const url = 'https://generativelanguage.googleapis.com/v1beta/models/' + encodeURIComponent(model) + ':generateContent'
  const data = await post(url, {
    systemInstruction: { parts: [{ text: system }] },
    contents: [{ role: 'user', parts: [{ text: user }] }],
    generationConfig: { temperature: 0, responseMimeType: 'application/json' },
  }, { 'x-goog-api-key': env('GEMINI_API_KEY') }, signal)
  const content = data?.candidates?.[0]?.content?.parts?.map((part: { text?: string }) => part.text || '').join('')
  if (!content) throw new LlmError('Gemini returned no content')
  return content as string
}

async function callOpenAI(system: string, user: string, model: string, signal: AbortSignal) {
  const data = await post('https://api.openai.com/v1/chat/completions', {
    model, temperature: 0, response_format: { type: 'json_object' },
    messages: [{ role: 'system', content: system }, { role: 'user', content: user }],
  }, { Authorization: 'Bearer ' + env('OPENAI_API_KEY') }, signal)
  const content = data?.choices?.[0]?.message?.content
  if (!content) throw new LlmError('OpenAI returned no content')
  return content as string
}

// Groq serves an OpenAI-compatible Chat Completions API with JSON mode.
async function callGroq(system: string, user: string, model: string, signal: AbortSignal) {
  const data = await post('https://api.groq.com/openai/v1/chat/completions', {
    model, temperature: 0, response_format: { type: 'json_object' },
    messages: [{ role: 'system', content: system }, { role: 'user', content: user }],
  }, { Authorization: 'Bearer ' + env('GROQ_API_KEY') }, signal)
  const content = data?.choices?.[0]?.message?.content
  if (!content) throw new LlmError('Groq returned no content')
  return content as string
}

// Models sometimes wrap JSON in a code fence; strip it before strict validation.
function parseDraft(content: string): TaskDraft {
  const cleaned = content.trim().replace(/^```(?:json)?\s*/i, '').replace(/```$/, '').trim()
  const parsed = draftSchema.safeParse(JSON.parse(cleaned))
  if (!parsed.success) throw new LlmError('LLM JSON failed schema validation: ' + parsed.error.issues.slice(0, 2).map((issue) => issue.path.join('.') + ' ' + issue.message).join('; '))
  const draft = parsed.data
  if (draft.deadline && !Number.isFinite(Date.parse(draft.deadline))) draft.deadline = null
  return draft
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))

export async function extract(text: string, options: { simulateFailure?: boolean; simulateDelayMs?: number; now?: number } = {}): Promise<ExtractResponse> {
  const started = Date.now()
  const now = Number.isFinite(options.now) ? Number(options.now) : DEMO_NOW
  const config = llmConfig()
  const lang = /[가-힣]/.test(text) ? 'ko' : 'en'
  const delay = Math.min(Math.max(Number(options.simulateDelayMs) || 0, 0), 15000)
  if (delay) await sleep(delay)
  const fallback = (reason: string): ExtractResponse => {
    const draft = ruleExtract(text)
    return { ok: true, mode: 'fallback', provider: 'rule-fallback', model: null, fallbackReason: reason, aiRole: 'task_extraction_only', schedulingEngine: 'deterministic_rules', latencyMs: Date.now() - started, draft, calibration: calibrationFor(draft, lang) }
  }
  if (options.simulateFailure) return fallback('Simulated LLM failure (demo control) — using deterministic parser')
  if (!config.configured) return fallback('LLM unavailable or unconfigured — using deterministic parser')
  try {
    const signal = AbortSignal.timeout(config.timeoutMs)
    const call = config.provider === 'groq' ? callGroq : config.provider === 'gemini' ? callGemini : callOpenAI
    const draft = parseDraft(await call(LLM_SYSTEM_PROMPT, llmUserPayload(text, now), config.model, signal))
    return { ok: true, mode: 'live', provider: config.provider, model: config.model, fallbackReason: null, aiRole: 'task_extraction_only', schedulingEngine: 'deterministic_rules', latencyMs: Date.now() - started, draft, calibration: calibrationFor(draft, lang) }
  } catch (error) {
    const reason = error instanceof Error && (error.name === 'TimeoutError' || error.name === 'AbortError') ? 'LLM timed out after ' + config.timeoutMs + ' ms'
      : error instanceof SyntaxError ? 'LLM returned invalid JSON'
        : error instanceof LlmError ? error.message : 'LLM request failed'
    console.warn('[flow] LLM fallback:', reason)
    return fallback(reason + ' — using deterministic parser')
  }
}

// Generic JSON completion for the assist endpoints. Throws on any failure so callers fall back to their deterministic answer.
export async function completeJSON(system: string, user: string): Promise<{ data: unknown; provider: Provider; model: string }> {
  const config = llmConfig()
  if (!config.configured) throw new LlmError('LLM unavailable or unconfigured')
  const call = config.provider === 'groq' ? callGroq : config.provider === 'gemini' ? callGemini : callOpenAI
  const content = await call(system, user, config.model, AbortSignal.timeout(config.timeoutMs))
  const cleaned = content.trim().replace(/^```(?:json)?\s*/i, '').replace(/```$/, '').trim()
  return { data: JSON.parse(cleaned), provider: config.provider, model: config.model }
}
