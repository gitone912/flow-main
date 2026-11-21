import { Hono } from 'hono'

// OpenAPI 3.1 description of the Flow API, served at /api/openapi.json, with Swagger UI at /api/docs.
// Paths are relative to the server that serves the page, so the same docs work on localhost and behind the ngrok tunnel.

const json = (schema: object, example?: unknown) => ({ content: { 'application/json': { schema, ...(example === undefined ? {} : { example }) } } })
const ok = (description: string, schema: object, example?: unknown) => ({ description, ...json(schema, example) })
const error = { $ref: '#/components/responses/Error' }
const lang = { type: 'string', enum: ['en', 'ko'] }
const NOW = 29924640 // 24 Nov 2026 00:00 UTC (09:00 KST) in minutes since the Unix epoch: the demo's reference clock

const assistEnvelope = (result: object) => ({
  type: 'object', required: ['ok', 'mode', 'provider', 'latencyMs', 'result'],
  properties: {
    ok: { type: 'boolean' }, mode: { type: 'string', enum: ['live', 'fallback'], description: '`fallback` = answered by the deterministic rules (no key, timeout or invalid model output)' },
    provider: { type: 'string', example: 'groq' }, model: { type: ['string', 'null'] }, fallbackReason: { type: ['string', 'null'] }, latencyMs: { type: 'integer' }, result,
  },
})
const assistBody = (input: object, example: object) => ({
  required: true, ...json({ type: 'object', required: ['input'], properties: { input, simulateFailure: { type: 'boolean', description: 'Force the deterministic fallback (demo)' } } }, { input: example }),
})
const assistPath = (kind: string, summary: string, description: string, input: object, example: object, result: object) => ({
  post: {
    tags: ['AI'], operationId: 'assist' + kind[0].toUpperCase() + kind.slice(1), summary, description: description + '\n\nRate-limited per IP (default 40 requests per minute). Personal data is never sent to the model.',
    requestBody: assistBody(input, example),
    responses: { 200: ok('Live or fallback answer', assistEnvelope(result)), 400: error, 429: error },
  },
})

const stub = (tag: string, method: 'get' | 'post', summary: string, extra: object = {}) => ({
  [method]: { tags: [tag], summary, description: 'MVP stub: callable and documented, returns a fixed sample payload and changes nothing.', responses: { 200: ok('Sample payload', { type: 'object' }) }, ...extra },
})

export const openapi = {
  openapi: '3.1.0',
  info: {
    title: 'Flow API',
    version: '0.2.0',
    description: [
      'Backend for **Flow**, the fair urgent-work assignment assistant.',
      '',
      '- The **AI** only drafts tasks and explains rankings. Candidate ranking runs in deterministic rules in the browser, and a person approves every assignment.',
      '- The **workspace** endpoints persist the shared team workspace in Supabase (Postgres) with optimistic concurrency (revision numbers).',
      '- Times inside the workspace are **minutes since the Unix epoch**; the demo clock is 24 Nov 2026 09:00 KST.',
      '',
      'When called through the public ngrok tunnel from a script, send the header `ngrok-skip-browser-warning: true` (this page adds it for you).',
    ].join('\n'),
  },
  servers: [{ url: '/', description: 'This server' }],
  tags: [
    { name: 'System', description: 'Health and configuration' },
    { name: 'AI', description: 'LLM-backed helpers with deterministic fallbacks' },
    { name: 'Workspace', description: 'Shared workspace sync (Supabase)' },
    { name: 'Database', description: 'Database status and seeding' },
    { name: 'Scheduling (stub)', description: 'Documented MVP stubs' },
    { name: 'Integrations (stub)', description: 'Documented MVP stubs' },
  ],
  paths: {
    '/api/health': {
      get: {
        tags: ['System'], operationId: 'health', summary: 'Service health and configuration',
        responses: { 200: ok('Service is up', { $ref: '#/components/schemas/Health' }) },
      },
    },
    '/api/intake/extract': {
      post: {
        tags: ['AI'], operationId: 'extractTask', summary: 'Draft a task from a request message',
        description: 'Turns a Korean or English request into a task draft: title, deliverable, skills, effort range, deadline, priority, questions. Falls back to the rule-based parser when the model is unavailable. Rate-limited per IP.',
        requestBody: {
          required: true,
          ...json({
            type: 'object', required: ['text'],
            properties: {
              text: { type: 'string', maxLength: 6000 }, now: { type: 'integer', description: 'Reference clock, minutes since the Unix epoch' },
              simulateFailure: { type: 'boolean' }, simulateDelayMs: { type: 'integer' },
            },
          }, { text: '내일 오후 3시까지 결제 페이지 오류 긴급 수정 부탁드립니다. React 가능한 분, 2~3시간 예상', now: NOW }),
        },
        responses: { 200: ok('Task draft', { $ref: '#/components/schemas/ExtractResponse' }), 400: error, 413: error, 429: error },
      },
    },
    '/api/assist/explain': assistPath('explain', 'Explain the candidate ranking',
      'Plain-language explanation of why the top candidate ranks first. Candidates are anonymous labels ([A], [B]) with factor numbers, never names.',
      {
        type: 'object', required: ['lang', 'task', 'candidates', 'usual'],
        properties: {
          lang, task: { type: 'object', properties: { title: { type: 'string' }, effortMinutes: { type: 'number' }, deadline: { type: ['string', 'null'] }, urgent: { type: 'boolean' } } },
          candidates: { type: 'array', maxItems: 3, items: { type: 'object', properties: { label: { type: 'string', pattern: '^[A-Z]$' }, score: { type: 'number' }, finish: { type: 'string' }, spareMinutes: { type: 'number' }, blocks: { type: 'number' }, rotation: { type: 'boolean' }, urgentCount: { type: ['number', 'null'] }, factors: { type: 'array', items: { type: 'object', properties: { id: { type: 'string' }, weight: { type: 'number' }, value: { type: 'number' } } } } } } },
          usual: { type: ['object', 'null'], properties: { label: { type: 'string' }, usableMinutes: { type: 'number' }, reason: { type: 'string' } } },
        },
      },
      {
        lang: 'ko', task: { title: '결제 페이지 오류 긴급 수정', effortMinutes: 180, deadline: '11/25 15:00', urgent: true },
        candidates: [
          { label: 'A', score: 82, finish: '11/24 16:30', spareMinutes: 1350, blocks: 2, rotation: false, urgentCount: 1, factors: [{ id: 'skills', weight: 35, value: 0.9 }, { id: 'capacity', weight: 25, value: 0.8 }] },
          { label: 'B', score: 74, finish: '11/25 11:00', spareMinutes: 240, blocks: 3, rotation: false, urgentCount: 5, factors: [{ id: 'skills', weight: 35, value: 1 }, { id: 'capacity', weight: 25, value: 0.4 }] },
        ],
        usual: { label: 'B', usableMinutes: 30, reason: 'Only 30 minutes free before the deadline' },
      },
      { type: 'object', properties: { summary: { type: 'string' }, tradeoff: { type: 'string' }, watch: { type: ['string', 'null'] } } }),
    '/api/assist/decompose': assistPath('decompose', 'Split a task into handoff parts',
      'Suggests 2–4 parts with skills and minutes so a large task can be shared.',
      { type: 'object', required: ['lang', 'title', 'text', 'skills', 'effortMinutes', 'deadline'], properties: { lang, title: { type: 'string' }, text: { type: 'string' }, skills: { type: 'array', items: { type: 'string' } }, effortMinutes: { type: 'integer', minimum: 30 }, deadline: { type: ['string', 'null'] } } },
      { lang: 'en', title: 'Fix checkout page error', text: 'Checkout fails on submit; fix, test and deploy by tomorrow 3pm.', skills: ['react', 'typescript'], effortMinutes: 240, deadline: '11/25 15:00' },
      { type: 'object', properties: { parts: { type: 'array', items: { type: 'object', properties: { title: { type: 'string' }, skills: { type: 'array', items: { type: 'string' } }, minutes: { type: 'integer' }, handoff: { type: ['string', 'null'] } } } } } }),
    '/api/assist/commitments': assistPath('commitments', 'Read commitments from a message',
      'Turns an employee’s plain message (“customer call tomorrow 2–3pm”) into calendar commitments for them to confirm.',
      { type: 'object', required: ['lang', 'text', 'now'], properties: { lang, text: { type: 'string', maxLength: 2000 }, now: { type: 'integer', description: 'Minutes since the Unix epoch' } } },
      { lang: 'ko', text: '내일 오후 2시~3시 고객 통화, 금요일 오후 반차', now: NOW },
      { type: 'object', properties: { items: { type: 'array', items: { type: 'object', properties: { title: { type: 'string' }, kind: { type: 'string' }, start: { type: 'string' }, end: { type: 'string' } } } } } }),
    '/api/assist/brief': assistPath('brief', 'Weekly fairness brief',
      'Team-level weekly summary built only from aggregate numbers; no one is named or rated.',
      { type: 'object', required: ['lang', 'teamSize', 'urgentTotal', 'topTwoShare', 'urgentCounts', 'focusHours', 'overlaps', 'fragmented', 'pendingReviews', 'singleOwnerSkills', 'lateRequests'], properties: { lang, teamSize: { type: 'number' }, urgentTotal: { type: 'number' }, topTwoShare: { type: 'number' }, urgentCounts: { type: 'array', items: { type: 'number' } }, focusHours: { type: 'number' }, overlaps: { type: 'number' }, fragmented: { type: 'number' }, pendingReviews: { type: 'number' }, singleOwnerSkills: { type: 'array', items: { type: 'string' } }, lateRequests: { type: 'number' } } },
      { lang: 'ko', teamSize: 8, urgentTotal: 13, topTwoShare: 0.54, urgentCounts: [5, 2, 2, 2, 1, 1, 0, 0], focusHours: 25, overlaps: 0, fragmented: 3, pendingReviews: 0, singleOwnerSkills: ['Kubernetes'], lateRequests: 1 },
      { type: 'object', properties: { headline: { type: 'string' }, points: { type: 'array', items: { type: 'string' } }, actions: { type: 'array', items: { type: 'string' } } } }),

    '/api/db/status': {
      get: { tags: ['Database'], operationId: 'dbStatus', summary: 'Supabase connection and schema status', responses: { 200: ok('Status', { $ref: '#/components/schemas/DbStatus' }) } },
    },
    '/api/db/seed': {
      post: { tags: ['Database'], operationId: 'dbSeed', summary: 'Re-seed the 1,000-employee reference table', description: 'Upserts the synthetic roster into `employees` (idempotent).', responses: { 200: ok('Seeded', { type: 'object', properties: { ok: { type: 'boolean' }, seeded: { type: 'integer' }, reason: { type: 'string' } } }), 500: error, 503: error } },
    },
    '/api/workspace': {
      get: {
        tags: ['Workspace'], operationId: 'loadWorkspace', summary: 'Load the shared workspace',
        responses: { 200: ok('Workspace and its revision', { type: 'object', properties: { ok: { type: 'boolean' }, rev: { type: 'integer' }, state: { $ref: '#/components/schemas/Workspace' } } }), 404: ok('No workspace yet', { type: 'object', properties: { ok: { type: 'boolean' }, reason: { const: 'missing' } } }), 500: error },
      },
      put: {
        tags: ['Workspace'], operationId: 'replaceWorkspace', summary: 'Replace the whole workspace',
        description: '**Destructive.** Used on first sync and by “Reset workspace”. Replaces every block, assignment, verification and scan, and returns the next revision.',
        requestBody: { required: true, ...json({ type: 'object', required: ['state'], properties: { state: { $ref: '#/components/schemas/Workspace' } } }) },
        responses: { 200: ok('Replaced', { $ref: '#/components/schemas/Rev' }), 400: error, 500: error },
      },
    },
    '/api/workspace/rev': {
      get: { tags: ['Workspace'], operationId: 'workspaceRev', summary: 'Current revision (polled every 12 s by browsers)', responses: { 200: ok('Revision, or null when no workspace exists', { type: 'object', properties: { ok: { type: 'boolean' }, rev: { type: ['integer', 'null'] } } }, { ok: true, rev: 3 }), 500: error } },
    },
    '/api/workspace/ops': {
      post: {
        tags: ['Workspace'], operationId: 'applyOps', summary: 'Apply an incremental change set',
        description: 'Atomic change set with optimistic concurrency. `409` means another device saved first: load the workspace again, then retry.',
        requestBody: {
          required: true,
          ...json({
            type: 'object', required: ['baseRev', 'ops'],
            properties: {
              baseRev: { type: 'integer' },
              ops: {
                type: 'object', description: 'Only the keys that changed',
                properties: {
                  meta: { type: 'object', description: 'Any of version, now, policy, verifiedTasks, dataset' },
                  upsertBlocks: { type: 'array', items: { $ref: '#/components/schemas/Block' } }, deleteBlocks: { type: 'array', items: { type: 'string' } },
                  upsertAssignments: { type: 'array', items: { type: 'object' } }, deleteAssignments: { type: 'array', items: { type: 'string' } },
                  upsertVerifications: { type: 'object', description: 'Employee id → verification record' }, deleteVerifications: { type: 'array', items: { type: 'string' } },
                  upsertScans: { type: 'array', items: { type: 'object' } }, deleteScans: { type: 'array', items: { type: 'string' } },
                },
              },
            },
          }, { baseRev: 3, ops: { meta: { version: 12 }, upsertBlocks: [{ id: 'blk-demo-1', employeeId: 'SR-0327', title: 'Customer call', kind: 'meeting', start: NOW + 300, end: NOW + 360 }] } }),
        },
        responses: {
          200: ok('Applied', { $ref: '#/components/schemas/Rev' }),
          404: ok('No workspace yet', { type: 'object', properties: { ok: { const: false }, rev: { type: 'null' }, reason: { const: 'missing' } } }),
          409: ok('Stale base revision', { type: 'object', properties: { ok: { const: false }, rev: { type: 'integer' }, reason: { const: 'stale' } } }),
          400: error, 500: error,
        },
      },
    },

    '/api/schedule/plan': stub('Scheduling (stub)', 'post', 'Sample scheduling plan'),
    '/api/schedule/alternatives': stub('Scheduling (stub)', 'post', 'Sample alternative plans'),
    '/api/assignments/approve': stub('Scheduling (stub)', 'post', 'Sample approval receipt', { requestBody: json({ type: 'object' }, { taskId: 'dashboard-demo', employeeId: 'SR-0327' }) }),
    '/api/assignments/{id}/review': stub('Scheduling (stub)', 'post', 'Sample review request', { parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' }, example: 'dashboard-demo' }], requestBody: json({ type: 'object' }, { note: 'Deadline conflicts with my on-call shift' }) }),
    '/api/commitments': stub('Scheduling (stub)', 'post', 'Sample commitment report', { requestBody: json({ type: 'object' }, { title: 'Customer call', start: NOW + 840, end: NOW + 900 }) }),
    '/api/calibration/history': stub('Scheduling (stub)', 'get', 'Effort-estimate calibration history'),
    '/api/integrations/sync': stub('Integrations (stub)', 'post', 'Calendar / Jira / GitHub sync (not connected)'),
  },
  components: {
    responses: {
      Error: { description: 'Error', ...json({ type: 'object', properties: { ok: { const: false }, error: { type: 'string' }, code: { type: ['string', 'null'] } } }) },
    },
    schemas: {
      Health: {
        type: 'object',
        properties: {
          status: { const: 'ok' }, service: { type: 'string' }, version: { type: 'string' }, llmProvider: { type: 'string' }, llmModel: { type: ['string', 'null'] }, llmConfigured: { type: 'boolean' },
          database: { type: 'string', enum: ['supabase', 'browser-only'] }, aiRole: { type: 'string' }, schedulingEngine: { type: 'string' }, endpoints: { type: 'object' },
        },
      },
      ExtractResponse: {
        type: 'object',
        properties: {
          ok: { type: 'boolean' }, mode: { type: 'string', enum: ['live', 'fallback'] }, provider: { type: 'string' }, model: { type: ['string', 'null'] },
          aiRole: { const: 'task_extraction_only' }, schedulingEngine: { const: 'deterministic_rules' }, latencyMs: { type: 'integer' }, fallbackReason: { type: ['string', 'null'] },
          draft: { type: 'object', description: 'Title, deliverable, skills, effort range, deadline, priority, questions …' }, calibration: { type: ['object', 'null'] },
        },
      },
      DbStatus: { type: 'object', properties: { configured: { type: 'boolean' }, schema: { type: 'string', enum: ['ok', 'missing', 'error', 'unconfigured'] }, message: { type: 'string' }, rev: { type: ['integer', 'null'] }, employees: { type: 'integer' } } },
      Rev: { type: 'object', properties: { ok: { type: 'boolean' }, rev: { type: 'integer' } }, example: { ok: true, rev: 4 } },
      Block: {
        type: 'object', required: ['id', 'employeeId', 'title', 'kind', 'start', 'end'],
        properties: { id: { type: 'string' }, employeeId: { type: 'string' }, title: { type: 'string' }, kind: { type: 'string', enum: ['work', 'meeting', 'review', 'support', 'on-call', 'leave', 'reserve', 'assignment'] }, start: { type: 'integer', description: 'Minutes since the Unix epoch' }, end: { type: 'integer' }, taskId: { type: 'string' } },
      },
      Workspace: {
        type: 'object', required: ['now', 'policy', 'blocks'],
        properties: { version: { type: 'integer' }, now: { type: 'integer' }, policy: { type: 'object' }, blocks: { type: 'array', items: { $ref: '#/components/schemas/Block' } }, assignments: { type: 'array', items: { type: 'object' } }, verifications: { type: 'object' }, scans: { type: 'array', items: { type: 'object' } }, verifiedTasks: { type: 'array', items: { type: 'string' } }, dataset: { type: 'object' } },
      },
    },
  },
}

const page = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Flow API · Swagger</title>
<link rel="icon" href="data:,">
<link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/swagger-ui-dist@5.17.14/swagger-ui.css">
<style>body { margin: 0; background: #fafafa; } .topbar { display: none; }</style>
</head>
<body>
<div id="swagger"></div>
<script src="https://cdn.jsdelivr.net/npm/swagger-ui-dist@5.17.14/swagger-ui-bundle.js" crossorigin></script>
<script>
  window.ui = SwaggerUIBundle({
    url: 'openapi.json', dom_id: '#swagger', deepLinking: true, tryItOutEnabled: true, displayRequestDuration: true, docExpansion: 'list',
    // The ngrok free tier shows an interstitial page unless this header is present.
    requestInterceptor: (request) => { request.headers['ngrok-skip-browser-warning'] = 'true'; return request },
  })
</script>
</body>
</html>`

export const docsRoutes = new Hono()
  .get('/openapi.json', (c) => c.json(openapi))
  .get('/docs', (c) => c.html(page))
  .get('/docs/', (c) => c.redirect('/api/docs'))
