import { existsSync } from 'node:fs'
import { serve } from '@hono/node-server'
import { serveStatic } from '@hono/node-server/serve-static'
import { Hono } from 'hono'
import { cors } from 'hono/cors'
import { bodyLimit } from 'hono/body-limit'
import { secureHeaders } from 'hono/secure-headers'
import type { MiddlewareHandler } from 'hono'
import { getConnInfo } from '@hono/node-server/conninfo'
import { extract, llmConfig } from './llm'
import { STATIC_ENDPOINTS, staticRoutes } from './staticRoutes'
import { assistRoutes } from './assist'
import { workspaceRoutes } from './workspaceRoutes'
import { docsRoutes } from './openapi'
import { dbConfig, dbStatus, logAiEvent, seedEmployees } from './db'

// Load .env / .env.local when present (Node 20.12+); real environment variables win.
for (const file of ['.env.local', '.env']) if (existsSync(file)) try { process.loadEnvFile(file) } catch { /* optional */ }

const app = new Hono()
const origins = (process.env.CORS_ORIGINS || '').split(',').map((item) => item.trim()).filter(Boolean)
// CORS_ORIGINS: comma-separated exact origins and/or wildcard hosts, e.g. "https://flow.vercel.app,https://*.vercel.app".
const allowOrigin = (origin: string) => origins.some((rule) => {
  if (!rule.includes('*')) return rule === origin
  const [scheme, host] = rule.split('://')
  try { const url = new URL(origin); return url.protocol === scheme + ':' && url.hostname.endsWith(host.replace(/^\*/, '')) } catch { return false }
})
app.use('/api/*', cors({
  origin: origins.length ? (origin) => (allowOrigin(origin) ? origin : null) : '*',
  allowMethods: ['GET', 'POST', 'PUT', 'OPTIONS'], allowHeaders: ['Content-Type', 'ngrok-skip-browser-warning'], maxAge: 86400,
}))

// Baseline hardening: security headers on every response, small JSON bodies, and a per-IP cap on the LLM-backed routes.
app.use('*', secureHeaders({ crossOriginEmbedderPolicy: false, contentSecurityPolicy: undefined, referrerPolicy: 'strict-origin-when-cross-origin' }))
// Small bodies everywhere except the workspace sync, which can carry a full calendar (~0.5 MB) on first sync or reset.
const smallBody = bodyLimit({ maxSize: 64 * 1024, onError: (c) => c.json({ ok: false, error: 'Request body too large (64 KB max)' }, 413) })
const syncBody = bodyLimit({ maxSize: 4 * 1024 * 1024, onError: (c) => c.json({ ok: false, error: 'Request body too large (4 MB max)' }, 413) })
app.use('/api/*', (c, next) => (c.req.path.startsWith('/api/workspace') ? syncBody : smallBody)(c, next))
const RATE_LIMIT = Number(process.env.AI_RATE_LIMIT_PER_MIN) || 40
const hits = new Map<string, { start: number; count: number }>()
const limitAi: MiddlewareHandler = async (c, next) => {
  let ip = c.req.header('x-forwarded-for')?.split(',')[0].trim() || ''
  if (!ip) try { ip = getConnInfo(c).remote.address || 'local' } catch { ip = 'local' }
  const now = Date.now()
  const entry = hits.get(ip)
  const window = entry && now - entry.start < 60_000 ? entry : { start: now, count: 0 }
  window.count += 1
  hits.set(ip, window)
  if (hits.size > 5000) for (const [key, value] of hits) if (now - value.start >= 60_000) hits.delete(key)
  c.header('X-RateLimit-Limit', String(RATE_LIMIT))
  c.header('X-RateLimit-Remaining', String(Math.max(0, RATE_LIMIT - window.count)))
  if (window.count > RATE_LIMIT) {
    c.header('Retry-After', String(Math.ceil((window.start + 60_000 - now) / 1000)))
    return c.json({ ok: false, error: 'Too many AI requests — try again in a minute' }, 429)
  }
  await next()
}
app.use('/api/intake/*', limitAi)
app.use('/api/assist/*', limitAi)

app.get('/api/health', (c) => {
  const config = llmConfig()
  const db = dbConfig()
  return c.json({
    status: 'ok', service: 'Flow', version: '0.2.0', llmProvider: config.provider, llmModel: config.model || null, llmConfigured: config.configured, database: db.configured ? 'supabase' : 'browser-only',
    aiRole: 'drafting_and_explaining_only', schedulingEngine: 'deterministic_rules',
    endpoints: { live: ['POST /api/intake/extract', 'POST /api/assist/explain', 'POST /api/assist/decompose', 'POST /api/assist/commitments', 'POST /api/assist/brief'], staticStub: STATIC_ENDPOINTS, meta: ['GET /api/health'], database: ['GET /api/db/status', 'GET /api/workspace', 'GET /api/workspace/rev', 'PUT /api/workspace', 'POST /api/workspace/ops', 'POST /api/db/seed'] },
  })
})

app.post('/api/intake/extract', async (c) => {
  let input: { text?: unknown; simulateFailure?: unknown; simulateDelayMs?: unknown; now?: unknown }
  try { input = await c.req.json() } catch { return c.json({ ok: false, error: 'Body must be JSON: { "text": "..." }' }, 400) }
  const text = typeof input.text === 'string' ? input.text.trim() : ''
  if (!text) return c.json({ ok: false, error: '"text" is required' }, 400)
  if (text.length > 6000) return c.json({ ok: false, error: '"text" must be 6,000 characters or fewer' }, 413)
  const result = await extract(text, { simulateFailure: input.simulateFailure === true, simulateDelayMs: Number(input.simulateDelayMs) || 0, now: typeof input.now === 'number' ? input.now : undefined })
  logAiEvent({ kind: 'intake', mode: result.mode, provider: result.provider, model: result.model, latencyMs: result.latencyMs, fallbackReason: result.fallbackReason })
  return c.json(result)
})

app.route('/api', docsRoutes)
app.route('/api', assistRoutes)
app.route('/api', workspaceRoutes)
app.route('/api', staticRoutes)
app.all('/api/*', (c) => c.json({ ok: false, error: 'Unknown endpoint', endpoints: ['GET /api/health', 'POST /api/intake/extract', ...STATIC_ENDPOINTS] }, 404))

// `npm start` serves the built frontend from the same origin, so one process is enough to deploy.
if (existsSync('dist/index.html')) {
  app.use('/*', serveStatic({ root: './dist' }))
  app.get('*', serveStatic({ path: './dist/index.html' }))
}

const port = Number(process.env.PORT) || 3001
serve({ fetch: app.fetch, port }, () => {
  const config = llmConfig()
  console.log('[flow] API on http://localhost:' + port + ' · LLM ' + config.provider + (config.configured ? ' (' + config.model + ')' : ' — not configured, rule-based fallback'))
  if (!dbConfig().configured) { console.log('[flow] Database: browser-only (set SUPABASE_URL and SUPABASE_SECRET_KEY to enable Supabase)'); return }
  void dbStatus().then(async (status) => {
    if (status.schema !== 'ok') { console.warn('[flow] Supabase schema ' + status.schema + (status.message ? ' — ' + status.message : '')); return }
    const seed = await seedEmployees()
    console.log('[flow] Supabase connected · workspace rev ' + (status.rev ?? 'none') + ' · employees ' + (seed.seeded ? 'seeded ' + seed.seeded : status.employees))
  }).catch((error) => console.warn('[flow] Supabase check failed:', error instanceof Error ? error.message : error))
})
