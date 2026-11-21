import { Hono } from 'hono'
import { alternativesPayload, approvePayload, commitmentPayload, historyPayload, planPayload, reviewPayload, syncPayload } from './staticData'

// Everything except intake extraction is a static stub: callable, documented, and deliberately stateless for the MVP.
export const STATIC_ENDPOINTS = [
  'POST /api/schedule/plan', 'POST /api/schedule/alternatives', 'POST /api/assignments/approve',
  'POST /api/assignments/:id/review', 'POST /api/commitments', 'POST /api/integrations/sync', 'GET /api/calibration/history',
]

const body = async (c: { req: { json: () => Promise<unknown> } }) => {
  try { const value = await c.req.json(); return value && typeof value === 'object' ? value as Record<string, unknown> : {} } catch { return {} }
}

export const staticRoutes = new Hono()
  .post('/schedule/plan', (c) => c.json(planPayload))
  .post('/schedule/alternatives', (c) => c.json(alternativesPayload))
  .post('/assignments/approve', async (c) => c.json(approvePayload(await body(c))))
  .post('/assignments/:id/review', async (c) => c.json(reviewPayload(c.req.param('id'), await body(c))))
  .post('/commitments', async (c) => c.json(commitmentPayload(await body(c))))
  .post('/integrations/sync', (c) => c.json(syncPayload))
  .get('/calibration/history', (c) => c.json(historyPayload))
