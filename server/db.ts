import { roster } from '../src/seed'

// Supabase access for the Flow server. Uses PostgREST over fetch with the SECRET key (server-only; bypasses RLS).
// Every workspace write goes through SQL functions (flow_init / flow_apply) so it is one transaction with a revision check.
const env = (name: string) => process.env[name]?.trim() || ''
export const WORKSPACE_ID = 'default'

export function dbConfig() {
  const url = env('SUPABASE_URL').replace(/\/$/, '')
  const key = env('SUPABASE_SECRET_KEY')
  return { url, key, configured: !!(url && key) }
}

export class DbError extends Error { constructor(message: string, public status = 500, public code = '') { super(message) } }

async function rest(path: string, init: RequestInit & { prefer?: string } = {}) {
  const { url, key, configured } = dbConfig()
  if (!configured) throw new DbError('Supabase is not configured', 503, 'unconfigured')
  const response = await fetch(url + '/rest/v1/' + path, {
    ...init,
    headers: { apikey: key, 'Content-Type': 'application/json', Accept: 'application/json', ...(init.prefer ? { Prefer: init.prefer } : {}), ...(init.headers || {}) },
    signal: init.signal ?? AbortSignal.timeout(20000),
  })
  const text = await response.text()
  const body = text ? JSON.parse(text) : null
  if (!response.ok) throw new DbError(body?.message || 'Supabase HTTP ' + response.status, response.status, body?.code || '')
  return body
}
const rpc = (fn: string, args: Record<string, unknown>) => rest('rpc/' + fn, { method: 'POST', body: JSON.stringify(args) })

export type DbStatus = { configured: boolean; schema: 'ok' | 'missing' | 'error' | 'unconfigured'; message?: string; rev?: number | null; employees?: number }
export async function dbStatus(): Promise<DbStatus> {
  if (!dbConfig().configured) return { configured: false, schema: 'unconfigured' }
  try {
    const rev = await rpc('flow_rev', { p_ws: WORKSPACE_ID })
    const count = await fetch(dbConfig().url + '/rest/v1/employees?select=id&limit=1', { headers: { apikey: dbConfig().key, Prefer: 'count=exact' }, signal: AbortSignal.timeout(10000) })
    const employees = Number(count.headers.get('content-range')?.split('/')[1]) || 0
    return { configured: true, schema: 'ok', rev, employees }
  } catch (error) {
    const e = error as DbError
    const missing = e.code === 'PGRST202' || e.code === 'PGRST205' || e.code === '42P01'
    return { configured: true, schema: missing ? 'missing' : 'error', message: missing ? 'Run supabase/migrations/20261121000000_flow_init.sql' : e.message }
  }
}

export const loadWorkspace = () => rpc('flow_load', { p_ws: WORKSPACE_ID }) as Promise<{ rev: number; state: unknown } | null>
export const initWorkspace = (state: unknown) => rpc('flow_init', { p_ws: WORKSPACE_ID, p_state: state }) as Promise<number>
export const applyOps = (baseRev: number, ops: unknown) => rpc('flow_apply', { p_ws: WORKSPACE_ID, p_base_rev: baseRev, p_ops: ops }) as Promise<{ ok: boolean; rev: number | null; reason?: string }>
export const currentRev = () => rpc('flow_rev', { p_ws: WORKSPACE_ID }) as Promise<number | null>

// AI audit trail: metadata only. Failures never affect the AI response.
export function logAiEvent(event: { kind: string; mode: string; provider?: string | null; model?: string | null; latencyMs?: number; fallbackReason?: string | null }) {
  if (!dbConfig().configured) return
  void rest('ai_events', { method: 'POST', prefer: 'return=minimal', body: JSON.stringify({ kind: event.kind, mode: event.mode, provider: event.provider ?? null, model: event.model ?? null, latency_ms: event.latencyMs ?? null, fallback_reason: event.fallbackReason ?? null }) })
    .catch(() => { /* audit is best-effort */ })
}

// Seeds the employees reference table from the synthetic roster when it is empty (1,000 rows, batches of 250).
export async function seedEmployees(force = false) {
  const status = await dbStatus()
  if (status.schema !== 'ok') return { seeded: 0, reason: status.schema }
  if (!force && (status.employees || 0) >= roster.length) return { seeded: 0, reason: 'already seeded' }
  const rows = roster.map((p) => ({
    id: p.id, source_id: p.source?.id ?? null, name: p.name, name_ko: p.korean, team: p.team, department: p.source?.department ?? null,
    role: p.role, role_ko: p.roleKo ?? null, status: p.status || 'active', shift: p.source?.shift ?? null, employment: p.source?.employment ?? null,
    skills: p.skills, work_hours: p.hours, access: p.access,
  }))
  for (let i = 0; i < rows.length; i += 250) await rest('employees?on_conflict=id', { method: 'POST', prefer: 'resolution=merge-duplicates,return=minimal', body: JSON.stringify(rows.slice(i, i + 250)) })
  return { seeded: rows.length, reason: 'ok' }
}
