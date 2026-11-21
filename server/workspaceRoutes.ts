import { Hono } from 'hono'
import { applyOps, currentRev, dbStatus, DbError, initWorkspace, loadWorkspace, seedEmployees } from './db'

// Shared workspace persistence (Supabase). The browser keeps a local copy and syncs incremental change sets here.
export const workspaceRoutes = new Hono()

const fail = (error: unknown) => {
  const e = error as DbError
  return { body: { ok: false, error: e.message || 'Database error', code: e.code || null }, status: (e.status && e.status >= 400 && e.status < 600 ? e.status : 500) as 500 }
}
const isState = (value: unknown): value is { now: number; policy: unknown; blocks: unknown[] } =>
  !!value && typeof value === 'object' && Number.isFinite((value as { now?: unknown }).now) && Array.isArray((value as { blocks?: unknown }).blocks) && !!(value as { policy?: unknown }).policy

workspaceRoutes.get('/db/status', async (c) => c.json(await dbStatus()))

workspaceRoutes.post('/db/seed', async (c) => {
  try { return c.json({ ok: true, ...(await seedEmployees(true)) }) } catch (error) { const f = fail(error); return c.json(f.body, f.status) }
})

workspaceRoutes.get('/workspace', async (c) => {
  try {
    const data = await loadWorkspace()
    return data ? c.json({ ok: true, rev: data.rev, state: data.state }) : c.json({ ok: false, reason: 'missing' }, 404)
  } catch (error) { const f = fail(error); return c.json(f.body, f.status) }
})

workspaceRoutes.get('/workspace/rev', async (c) => {
  try { return c.json({ ok: true, rev: await currentRev() }) } catch (error) { const f = fail(error); return c.json(f.body, f.status) }
})

// Full replace: first sync from a browser, or "Reset workspace".
workspaceRoutes.put('/workspace', async (c) => {
  let body: { state?: unknown }
  try { body = await c.req.json() } catch { return c.json({ ok: false, error: 'Body must be JSON: { "state": {...} }' }, 400) }
  if (!isState(body.state)) return c.json({ ok: false, error: '"state" must be a Flow workspace' }, 400)
  try { return c.json({ ok: true, rev: await initWorkspace(body.state) }) } catch (error) { const f = fail(error); return c.json(f.body, f.status) }
})

// Incremental change set with optimistic concurrency: 409 tells the browser to pull the latest state first.
workspaceRoutes.post('/workspace/ops', async (c) => {
  let body: { baseRev?: unknown; ops?: unknown }
  try { body = await c.req.json() } catch { return c.json({ ok: false, error: 'Body must be JSON: { "baseRev": n, "ops": {...} }' }, 400) }
  if (!Number.isInteger(body.baseRev) || !body.ops || typeof body.ops !== 'object') return c.json({ ok: false, error: '"baseRev" (integer) and "ops" (object) are required' }, 400)
  try {
    const result = await applyOps(body.baseRev as number, body.ops)
    return result.ok ? c.json({ ok: true, rev: result.rev }) : c.json({ ok: false, rev: result.rev, reason: result.reason }, result.reason === 'missing' ? 404 : 409)
  } catch (error) { const f = fail(error); return c.json(f.body, f.status) }
})
