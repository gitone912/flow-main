# Flow

Flow helps a lead turn an English or Korean work request into a calendar assignment. The demo uses 1,000 employee rows across five departments and 58 skills. The fixture clock starts at 09:00 KST on 24 November 2026.

## Run locally

Use Node.js 22.12 or later. Run these commands from this directory.

~~~sh
npm ci
cp .env.example .env      # then paste your GROQ_API_KEY
npm run dev               # API on :3001 + Vite on :5173
~~~

Open [http://127.0.0.1:5173/](http://127.0.0.1:5173/). The app opens on the **How Flow works** landing page (theme fit, data sources, privacy); choose **Open app** for the **Dashboard** at `#/dashboard`. The **?** button in the top bar returns to the landing page. Use the sidebar (or **Ctrl K**) to reach every screen. Without an API key the app still works end to end: task drafts come from the deterministic rule-based parser.

For a single-process deployment, run `npm run build && npm start`. The API then also serves the built frontend from `dist/` on `PORT` (default 3001), so judges need only one URL. A frontend hosted elsewhere sets `VITE_API_BASE_URL` at build time and the server's `CORS_ORIGINS`.

## Architecture

| Layer | Technology | Role |
| --- | --- | --- |
| Frontend | React 19, TypeScript, Vite, Tailwind CSS 4, Recharts | Task intake, candidate comparison, approval, team calendar, employee self-correction |
| Scheduling engine | `src/scheduler.ts` (TypeScript, runs in the browser, unit tested) | Real availability (meetings, code reviews, on-call, breaks, focus blocks, buffer time), ranking, urgent-work rotation, deadline impact. **Deterministic rules, no AI.** |
| API server | Node + [Hono](https://hono.dev) (`server/`), run with `tsx` | One live endpoint plus documented static MVP stubs |
| LLM | **Groq** `openai/gpt-oss-120b` by default (Gemini / OpenAI adapters included) | **Drafting and explaining only**: task extraction, ranking explanations, task splits, schedule-from-message, weekly brief |
| Validation | Zod (`src/extract.ts`, shared by server and browser) | Rejects LLM JSON with unknown skills, bad enums or ranges |
| Effort calibration | Static benchmark in `src/estimates.ts` | Compares the AI estimate with estimated-vs-actual minutes of similar finished work |
| Data | Synthetic roster (1,000 rows), seeded calendar, browser storage | Preloaded demo data; no external integrations in the MVP |

**LLM call flow:** Frontend → `POST /api/intake/extract` → server calls Groq with a JSON-mode prompt (key never leaves the server) → Zod validation → static calibration → draft returned to the lead for review → deterministic scheduler compares candidates in the browser → lead approves.

If the key is missing, the call times out (`LLM_TIMEOUT_MS`, 15 s in `.env.example`), the provider errors, or the JSON fails validation, the server returns HTTP 200 with `mode: "fallback"` and a draft from the rule-based parser. If the API itself is unreachable, the browser runs the same parser locally. The demo never dead-ends.

| Endpoint | Status | Returns |
| --- | --- | --- |
| `GET /api/health` | Live | Service name, LLM provider/model, `llmConfigured`, live vs. stub endpoint list |
| `POST /api/intake/extract` | **Live (LLM)** | `{ mode, provider, fallbackReason, aiRole, schedulingEngine, draft, calibration }` |
| `POST /api/assist/explain` | **Live (LLM)** | Plain-language reason for the ranking. Candidates are sent as `[A]`, `[B]`, `[U]` with factor numbers only; the browser puts the names back |
| `POST /api/assist/decompose` | **Live (LLM)** | 2–4 handoff-ready parts that add up to the confirmed effort; the scheduler then plans each part in order |
| `POST /api/assist/commitments` | **Live (LLM)** | Calendar blocks read from an employee's own message ("내일 오후 2시~3시 고객 통화"), confirmed before saving |
| `POST /api/assist/brief` | **Live (LLM)** | Weekly fairness brief from team-level totals only |
| `POST /api/schedule/plan` | Static MVP stub | Signature comparison: usual assignee 1h fragmented vs. recommended teammate 5h free |
| `POST /api/schedule/alternatives` | Static MVP stub | Split into 2 × 2h blocks, or shift the deadline +4h |
| `POST /api/assignments/approve` | Static MVP stub | `status: approved`, `approvedBy: team_lead` |
| `POST /api/assignments/:id/review`, `POST /api/commitments` | Static MVP stub | `status: review_requested` plus privacy notice |
| `POST /api/integrations/sync` | Static MVP stub | Normalized blocks tagged `google-calendar`, `jira`, `github-reviews`, `on-call` |
| `GET /api/calibration/history` | Static MVP stub | Estimated vs. actual minutes behind effort calibration |

Request body for extraction: `{ "text": "...", "simulateFailure": false, "simulateDelayMs": 0 }`. **Settings → LLM API** shows the live/fallback status and has a **Simulate LLM failure** switch for demonstrating the fallback and **Retry live AI**.

Only the request text, the reference clock and the skill catalog are sent to the LLM. Employee data, calendars and scores never leave the browser. Workload data is used only for sustainable scheduling, never for HR evaluation.

## Supabase (shared database)

Without Supabase, everything is saved in the browser. With it, the lead and every employee device share one live workspace.

1. In `.env` set `SUPABASE_URL` and `SUPABASE_SECRET_KEY` (server-only — the browser never sees a database key).
2. Create the schema, either way:
   - **SQL Editor:** Supabase dashboard → SQL Editor → paste [supabase/migrations/20261121000000_flow_init.sql](supabase/migrations/20261121000000_flow_init.sql) → Run. Safe to run again.
   - **CLI:** set `SUPABASE_DB_URL` (Dashboard → Connect → Session pooler URI with your database password) and run `npm run db:migrate`.
3. Restart the API. It seeds the 1,000 employees on start-up, and the footer shows **Supabase 동기화됨 · rev N**.

| Table | Holds |
| --- | --- |
| `employees` | Roster reference data (Korean and romanized names, team, skills, working hours, access) |
| `workspaces` | One row per workspace: revision counter, fixture clock, policy |
| `calendar_blocks` | Every commitment and booked work block, with readable `starts_at` / `ends_at` |
| `assignments`, `assignment_events` | Confirmed assignments and their audit history (view: `assignment_overview`) |
| `verifications`, `schedule_scans` | Employee self-corrections and schedule-scan findings |
| `ai_events` | AI audit trail: kind, live or fallback, provider, latency. Never the request text or names |

Saves are incremental. The browser diffs each change and the server applies it in one transaction through `flow_apply`, with a revision check. If another device saved first, the browser pulls the latest copy instead of overwriting it, and it polls every 12 seconds for changes from other devices. Row Level Security is on with no public policies.

## Walk through the dashboard fix

1. Open **Assign Work** (or choose **Open demo task** on the Dashboard). Choose **Open demo task** for the reviewed example fields, or choose **Draft with AI** to send the displayed message to the LLM API. Review the mandatory skill levels and confirm the task.
2. Choose **Compare candidates**. Junho Park (박준호) has one usable hour and Seoyeon Lee (이서연)’s staging access requires verification. Minji Kim (김민지) can reserve 09:00–12:00 and 13:00–14:00. Her plan leaves 14:00–15:00 free before the demo.
3. Choose **Review approval**, then **Confirm assignment**. Both work blocks appear in **Team calendar** and Minji’s **Employee view**. Use **Download calendar** to save an iCalendar file for both blocks.
4. In the employee view, request a review or suggest a different upper effort. In the team calendar, open the task and choose **Plan replacement**. **Settings → Reset workspace** restores the seeded demo. The original blocks stay visible until the replacement is approved.
5. To try a no-fit case before approval, set **Focus mode** to **One continuous block**. Open **Simulate alternatives** to check revised constraints without booking anything.

## Team operations

- **Employees** is the searchable staff directory; select a row to open the profile panel. **Automation** runs the schedule scan; the bell in the header lists open reviews and the latest findings. Scan findings include overlapping commitments, tight deadlines, pending reviews, workload thresholds, and skills with a single verified owner.
- **Work Log** filters assignments by task, person, status, or priority and exports the matching audit history as CSV. Calendar export is also available for the filtered work log. [iCalendar format](https://www.rfc-editor.org/rfc/rfc5545)
- **Upload CSV** (also under **Settings**) accepts commitments or verified skill and work-window updates for existing synthetic IDs in the selected team. Download the template for its column names and KST format. Preview validates every row before applying the file. Skills and working windows replace the specified employee’s previous values.
- **Analytics** replays the same seeded requests and staffing policy with Flow and previous-owner-first. The replay defines deferred as partial capacity and blocked as zero booked minutes. It stays separate from the browser’s live demo calendar.

## Employee data

Every employee gets a synthetic Korean name (Hangul in the Korean UI, romanized in English, generated by `koreanName` in `src/profiles.ts`); the CSV's English names are not shown. The app retains the departments, manager groups, source job titles, employment types, shifts, and statuses from [fake_employee.csv](fake_employee.csv). The source row key gives every employee a unique workspace ID even when the source employee ID repeats. The default Product Platform squad brings together eight active people from the source roster. The other teams use the source department and manager groups.

Planning roles align with department responsibilities. The directory shows the original role alongside the enriched profile. Skill levels, work examples, access windows, calendar entries, and assignment histories are synthetic demo records. For example, frontend profiles pair React and TypeScript with browser testing and accessibility, and Finance profiles pair Excel and Power Query with reconciliation, forecasting, or budgeting. Rows with leave or ended employment stay in the directory and are excluded from new assignments.

Shift labels map to 09:00–17:00, 12:00–20:00, and 22:00–06:00 KST. The demo policy includes an overnight break from 00:00 to 00:30. Choose **24 hours** on the calendar to see overnight commitments.

Use `npm run data:sync` to regenerate the app’s roster and the [enriched profile CSV](data/employee_profiles.csv). To import profile edits back into the app, filter the CSV to the selected `workspace_team` first. The original CSV stays as supplied. Prior fixture bookings use a separate browser storage key because their employee IDs belong to the earlier roster.

## Verify and build

~~~sh
npm test
npm run build
npm run preview
~~~

The tests cover scheduling, focus and access constraints, rotation, stale and duplicate approvals, no-fit simulations, intake validation, local CSV operations, and calendar export.

## Banner art

The workspace banner was generated with built-in ImageGen using the prompt below. [relay-track.png](public/relay-track.png)

> Generate ONLY a wide 3:2 raster 3D illustration asset for the right edge of a premium web dashboard hero, no text, no letters or words. Scene: a monumental sculptural relay track, three interlocking parallel U-shaped tubular rails sculpted as a smooth flowing forward bend, travelling from lower left foreground into upper right, embossed concentric lanes with elegant polished glossy lavender, violet and silver pale lilac surfaces. The biggest bend sits on the right center. A small warm peach-orange sphere rests on one lane near the upper right bend; a small off-white ball in lower left, tiny single star-glint near upper center. Immaculate product visualization, a recognizable abstract relay, crisp and high-end, rich purple directional soft light, polished highlights. Background is entirely solid very dark aubergine #211638 with only a subtle violet bloom immediately around the sculpture; left quarter is empty aubergine dark space so it can fade into a CSS hero. Camera tilted isometric. Close crop, thick practical physical solid forms. Muted restrained premium editorial, no excess elements, no text, no fake UI. Website decorative hero abstract. Color accent peach exactly one sphere, core art vibrant pastel-violet with high contrast over deep aubergine.
