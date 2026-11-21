import { assistFallback, type AssistInputs, type AssistKind, type AssistResponse } from './assist'
import { calibrationFor, draftToTask, ruleExtract, type ExtractResponse } from './extract'
import type { Task } from './domain'

// Same-origin /api by default (Vite proxy in dev, `npm start` in production); a separately hosted frontend sets VITE_API_BASE_URL.
const BASE = (import.meta.env?.VITE_API_BASE_URL || '').replace(/\/$/, '')
// A separately hosted API behind an ngrok tunnel answers browsers with an interstitial page unless this header is sent.
export const API_HEADERS: Record<string, string> = BASE ? { 'ngrok-skip-browser-warning': 'true' } : {}

export type Health = {
  status: 'ok'; service: string; llmProvider: string; llmModel: string | null; llmConfigured: boolean
  endpoints: { live: string[]; staticStub: string[] }
}
export async function fetchHealth(signal?: AbortSignal): Promise<Health> {
  const response = await fetch(BASE + '/api/health', { headers: API_HEADERS, cache: 'no-store', signal: signal ?? AbortSignal.timeout(3500) })
  if (!response.ok) throw new Error('health ' + response.status)
  return response.json()
}

export type IntakeResult = { task: Task; meta: ExtractResponse; offline: boolean }

// The only live backend call. If the API itself is unreachable, the browser runs the same deterministic parser locally,
// so the demo never dead-ends on a network problem.
export async function extractViaApi(text: string, team: string, now: number, options: { simulateFailure?: boolean; simulateDelayMs?: number; signal?: AbortSignal } = {}): Promise<IntakeResult> {
  const timeout = AbortSignal.timeout(30000)
  try {
    const response = await fetch(BASE + '/api/intake/extract', {
      method: 'POST', headers: { 'Content-Type': 'application/json', ...API_HEADERS },
      signal: options.signal ? AbortSignal.any([options.signal, timeout]) : timeout,
      body: JSON.stringify({ text, now, simulateFailure: !!options.simulateFailure, simulateDelayMs: options.simulateDelayMs || 0 }),
    })
    if (!response.ok) throw new Error('extract ' + response.status)
    const meta = await response.json() as ExtractResponse
    return { task: draftToTask(meta.draft, team, text), meta, offline: false }
  } catch (error) {
    if (options.signal?.aborted) throw error
    const draft = ruleExtract(text)
    const meta: ExtractResponse = {
      ok: true, mode: 'fallback', provider: 'rule-fallback', model: null, aiRole: 'task_extraction_only', schedulingEngine: 'deterministic_rules', latencyMs: 0,
      fallbackReason: 'Flow API unreachable — parsed in the browser with the deterministic parser', draft, calibration: calibrationFor(draft, /[가-힣]/.test(text) ? 'ko' : 'en'),
    }
    return { task: draftToTask(draft, team, text), meta, offline: true }
  }
}

// AI helpers (explain, decompose, commitments, brief). Offline or failing, the browser answers with the same deterministic fallback.
export async function assistViaApi<K extends AssistKind>(kind: K, input: AssistInputs[K], options: { simulateFailure?: boolean; signal?: AbortSignal } = {}): Promise<AssistResponse<K> & { offline: boolean }> {
  const started = performance.now()
  try {
    const response = await fetch(BASE + '/api/assist/' + kind, {
      method: 'POST', headers: { 'Content-Type': 'application/json', ...API_HEADERS }, signal: options.signal ?? AbortSignal.timeout(20000),
      body: JSON.stringify({ input, simulateFailure: !!options.simulateFailure }),
    })
    if (!response.ok) throw new Error('assist ' + response.status)
    return { ...(await response.json() as AssistResponse<K>), offline: false }
  } catch (error) {
    if (options.signal?.aborted) throw error
    return { ok: true, mode: 'fallback', provider: 'rule-fallback', model: null, fallbackReason: 'Flow API unreachable — answered in the browser', latencyMs: Math.round(performance.now() - started), result: assistFallback(kind, input), offline: true }
  }
}
