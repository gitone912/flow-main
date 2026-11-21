-- Flow · initial schema
-- Run once: Supabase dashboard → SQL Editor → paste this file → Run. It is idempotent (safe to run again).
-- Times in the app are "minutes since the Unix epoch"; every table also exposes a readable timestamptz column.
-- Row Level Security is enabled with NO policies: only the server's secret key (which bypasses RLS) can read or write.

create extension if not exists pgcrypto;

-- ───────────────────────── Reference data ─────────────────────────
create table if not exists public.employees (
  id            text primary key,                 -- SR-0001 …
  source_id     text,                             -- employee_id from fake_employee.csv
  name          text not null,                    -- romanized Korean name
  name_ko       text not null,                    -- Hangul name
  team          text not null,
  department    text,
  role          text,
  role_ko       text,
  status        text not null default 'active',
  shift         text,
  employment    text,
  skills        jsonb not null default '{}'::jsonb,
  work_hours    jsonb not null default '{}'::jsonb,
  access        jsonb not null default '{}'::jsonb,
  created_at    timestamptz not null default now()
);
create index if not exists employees_team_idx on public.employees (team);

-- ───────────────────────── Workspace state ─────────────────────────
create table if not exists public.workspaces (
  id              text primary key default 'default',
  rev             integer not null default 0,     -- bumps on every save; optimistic concurrency
  app_version     integer not null default 0,     -- the app's own calendar version counter
  now_min         bigint  not null,
  now_at          timestamptz generated always as (to_timestamp(now_min * 60)) stored,
  policy          jsonb   not null,
  verified_tasks  jsonb   not null default '[]'::jsonb,
  dataset         jsonb,
  updated_at      timestamptz not null default now()
);

create table if not exists public.calendar_blocks (
  workspace_id  text not null references public.workspaces (id) on delete cascade,
  id            text not null,
  employee_id   text not null,
  title         text not null,
  kind          text not null check (kind in ('work','meeting','review','support','on-call','leave','reserve','assignment')),
  start_min     bigint not null,
  end_min       bigint not null,
  starts_at     timestamptz generated always as (to_timestamp(start_min * 60)) stored,
  ends_at       timestamptz generated always as (to_timestamp(end_min * 60)) stored,
  task_id       text,
  primary key (workspace_id, id),
  check (end_min > start_min)
);
create index if not exists calendar_blocks_employee_idx on public.calendar_blocks (workspace_id, employee_id, start_min);

create table if not exists public.assignments (
  workspace_id  text not null references public.workspaces (id) on delete cascade,
  task_id       text not null,
  employee_id   text not null,
  title         text not null,
  priority      text,
  deadline_at   timestamptz,
  effort_min    integer,
  score         numeric(6,2),
  reason        text,
  pending       boolean not null default false,
  approval_id   text,
  data          jsonb not null,                   -- full assignment record as the app uses it
  updated_at    timestamptz not null default now(),
  primary key (workspace_id, task_id)
);
create index if not exists assignments_employee_idx on public.assignments (workspace_id, employee_id);

create table if not exists public.assignment_events (
  workspace_id  text not null,
  task_id       text not null,
  seq           integer not null,
  type          text not null,                    -- approval | replacement | review | effort | commitment | change
  note          text,
  at_min        bigint not null,
  at            timestamptz generated always as (to_timestamp(at_min * 60)) stored,
  primary key (workspace_id, task_id, seq),
  foreign key (workspace_id, task_id) references public.assignments (workspace_id, task_id) on delete cascade
);

create table if not exists public.verifications (
  workspace_id  text not null references public.workspaces (id) on delete cascade,
  employee_id   text not null,
  data          jsonb not null,                   -- self-reported skills / hours, verified access
  updated_at    timestamptz not null default now(),
  primary key (workspace_id, employee_id)
);

create table if not exists public.schedule_scans (
  workspace_id  text not null references public.workspaces (id) on delete cascade,
  id            text not null,
  team          text not null,
  at_min        bigint not null,
  at            timestamptz generated always as (to_timestamp(at_min * 60)) stored,
  findings      jsonb not null default '[]'::jsonb,
  primary key (workspace_id, id)
);

-- AI audit trail: metadata only — never request text, names or results.
create table if not exists public.ai_events (
  id          bigint generated always as identity primary key,
  kind        text not null,                      -- intake | explain | decompose | commitments | brief
  mode        text not null,                      -- live | fallback
  provider    text,
  model       text,
  latency_ms  integer,
  fallback_reason text,
  created_at  timestamptz not null default now()
);
create index if not exists ai_events_created_idx on public.ai_events (created_at desc);

-- ───────────────────────── Security ─────────────────────────
alter table public.employees         enable row level security;
alter table public.workspaces        enable row level security;
alter table public.calendar_blocks   enable row level security;
alter table public.assignments       enable row level security;
alter table public.assignment_events enable row level security;
alter table public.verifications     enable row level security;
alter table public.schedule_scans    enable row level security;
alter table public.ai_events         enable row level security;

-- ───────────────────────── Helpers ─────────────────────────
create or replace function public.flow_put_assignment(p_ws text, a jsonb) returns void
language plpgsql set search_path = public as $$
begin
  insert into assignments (workspace_id, task_id, employee_id, title, priority, deadline_at, effort_min, score, reason, pending, approval_id, data, updated_at)
  values (p_ws, a->'task'->>'id', a->>'employeeId', coalesce(a->'task'->>'title', ''), nullif(a->'task'->>'priority', ''),
          case when a->'task'->>'deadline' is null then null else to_timestamp((a->'task'->>'deadline')::bigint * 60) end,
          (a->'task'->>'max')::integer, (a->>'score')::numeric, a->>'reason', coalesce((a->>'pending')::boolean, false), a->>'approvalId', a, now())
  on conflict (workspace_id, task_id) do update set
    employee_id = excluded.employee_id, title = excluded.title, priority = excluded.priority, deadline_at = excluded.deadline_at,
    effort_min = excluded.effort_min, score = excluded.score, reason = excluded.reason, pending = excluded.pending,
    approval_id = excluded.approval_id, data = excluded.data, updated_at = now();
  delete from assignment_events where workspace_id = p_ws and task_id = a->'task'->>'id';
  insert into assignment_events (workspace_id, task_id, seq, type, note, at_min)
  select p_ws, a->'task'->>'id', (e.ord - 1)::integer, e.value->>'type', e.value->>'note', (e.value->>'at')::bigint
  from jsonb_array_elements(coalesce(a->'history', '[]'::jsonb)) with ordinality as e(value, ord);
end $$;

create or replace function public.flow_put_blocks(p_ws text, blocks jsonb) returns void
language sql set search_path = public as $$
  insert into calendar_blocks (workspace_id, id, employee_id, title, kind, start_min, end_min, task_id)
  select p_ws, b->>'id', b->>'employeeId', b->>'title', b->>'kind', (b->>'start')::bigint, (b->>'end')::bigint, b->>'taskId'
  from jsonb_array_elements(coalesce(blocks, '[]'::jsonb)) as b
  on conflict (workspace_id, id) do update set
    employee_id = excluded.employee_id, title = excluded.title, kind = excluded.kind,
    start_min = excluded.start_min, end_min = excluded.end_min, task_id = excluded.task_id;
$$;

-- ───────────────────────── API (called by the Flow server via PostgREST /rpc) ─────────────────────────
-- Load the whole workspace as the app's JSON shape.
create or replace function public.flow_load(p_ws text default 'default') returns jsonb
language sql stable set search_path = public as $$
  select case when w.id is null then null else jsonb_build_object(
    'rev', w.rev,
    'state', jsonb_build_object(
      'version', w.app_version, 'now', w.now_min, 'policy', w.policy, 'verifiedTasks', w.verified_tasks, 'dataset', w.dataset,
      'blocks', coalesce((select jsonb_agg(jsonb_strip_nulls(jsonb_build_object('id', b.id, 'employeeId', b.employee_id, 'title', b.title, 'kind', b.kind, 'start', b.start_min, 'end', b.end_min, 'taskId', b.task_id)) order by b.start_min, b.id)
                          from calendar_blocks b where b.workspace_id = w.id), '[]'::jsonb),
      'assignments', coalesce((select jsonb_agg(a.data order by a.updated_at) from assignments a where a.workspace_id = w.id), '[]'::jsonb),
      'verifications', coalesce((select jsonb_object_agg(v.employee_id, v.data) from verifications v where v.workspace_id = w.id), '{}'::jsonb),
      'scans', coalesce((select jsonb_agg(jsonb_build_object('id', s.id, 'team', s.team, 'at', s.at_min, 'findings', s.findings) order by s.at_min desc) from schedule_scans s where s.workspace_id = w.id), '[]'::jsonb)
    )) end
  from (select 1) one left join workspaces w on w.id = p_ws;
$$;

-- Replace the whole workspace (first sync, or "Reset workspace").
create or replace function public.flow_init(p_ws text, p_state jsonb) returns integer
language plpgsql set search_path = public as $$
declare next_rev integer;
begin
  select coalesce(max(rev), 0) + 1 into next_rev from workspaces where id = p_ws;
  delete from workspaces where id = p_ws;                    -- cascades to every child table
  insert into workspaces (id, rev, app_version, now_min, policy, verified_tasks, dataset)
  values (p_ws, next_rev, coalesce((p_state->>'version')::integer, 0), (p_state->>'now')::bigint, p_state->'policy',
          coalesce(p_state->'verifiedTasks', '[]'::jsonb), p_state->'dataset');
  perform flow_put_blocks(p_ws, p_state->'blocks');
  perform flow_put_assignment(p_ws, a) from jsonb_array_elements(coalesce(p_state->'assignments', '[]'::jsonb)) as a;
  insert into verifications (workspace_id, employee_id, data)
  select p_ws, key, value from jsonb_each(coalesce(p_state->'verifications', '{}'::jsonb));
  insert into schedule_scans (workspace_id, id, team, at_min, findings)
  select p_ws, s->>'id', s->>'team', (s->>'at')::bigint, coalesce(s->'findings', '[]'::jsonb)
  from jsonb_array_elements(coalesce(p_state->'scans', '[]'::jsonb)) as s;
  return next_rev;
end $$;

-- Apply one incremental change set atomically. Returns {ok, rev}; ok=false means the caller's base revision is stale.
create or replace function public.flow_apply(p_ws text, p_base_rev integer, p_ops jsonb) returns jsonb
language plpgsql set search_path = public as $$
declare current_rev integer;
begin
  select rev into current_rev from workspaces where id = p_ws for update;
  if current_rev is null then return jsonb_build_object('ok', false, 'rev', null, 'reason', 'missing'); end if;
  if current_rev <> p_base_rev then return jsonb_build_object('ok', false, 'rev', current_rev, 'reason', 'stale'); end if;

  update workspaces set
    rev = current_rev + 1,
    app_version = coalesce((p_ops->'meta'->>'version')::integer, app_version),
    now_min = coalesce((p_ops->'meta'->>'now')::bigint, now_min),
    policy = coalesce(p_ops->'meta'->'policy', policy),
    verified_tasks = coalesce(p_ops->'meta'->'verifiedTasks', verified_tasks),
    dataset = case when p_ops->'meta' ? 'dataset' then p_ops->'meta'->'dataset' else dataset end,
    updated_at = now()
  where id = p_ws;

  delete from calendar_blocks where workspace_id = p_ws and id in (select jsonb_array_elements_text(coalesce(p_ops->'deleteBlocks', '[]'::jsonb)));
  perform flow_put_blocks(p_ws, p_ops->'upsertBlocks');

  delete from assignments where workspace_id = p_ws and task_id in (select jsonb_array_elements_text(coalesce(p_ops->'deleteAssignments', '[]'::jsonb)));
  perform flow_put_assignment(p_ws, a) from jsonb_array_elements(coalesce(p_ops->'upsertAssignments', '[]'::jsonb)) as a;

  delete from verifications where workspace_id = p_ws and employee_id in (select jsonb_array_elements_text(coalesce(p_ops->'deleteVerifications', '[]'::jsonb)));
  insert into verifications (workspace_id, employee_id, data, updated_at)
  select p_ws, key, value, now() from jsonb_each(coalesce(p_ops->'upsertVerifications', '{}'::jsonb))
  on conflict (workspace_id, employee_id) do update set data = excluded.data, updated_at = now();

  delete from schedule_scans where workspace_id = p_ws and id in (select jsonb_array_elements_text(coalesce(p_ops->'deleteScans', '[]'::jsonb)));
  insert into schedule_scans (workspace_id, id, team, at_min, findings)
  select p_ws, s->>'id', s->>'team', (s->>'at')::bigint, coalesce(s->'findings', '[]'::jsonb)
  from jsonb_array_elements(coalesce(p_ops->'upsertScans', '[]'::jsonb)) as s
  on conflict (workspace_id, id) do update set team = excluded.team, at_min = excluded.at_min, findings = excluded.findings;

  return jsonb_build_object('ok', true, 'rev', current_rev + 1);
end $$;

-- Cheap poll for other devices' changes.
create or replace function public.flow_rev(p_ws text default 'default') returns integer
language sql stable set search_path = public as $$ select rev from workspaces where id = p_ws $$;

-- Only the server (service role / secret key) may call these.
revoke all on function public.flow_load(text), public.flow_init(text, jsonb), public.flow_apply(text, integer, jsonb), public.flow_rev(text),
                       public.flow_put_assignment(text, jsonb), public.flow_put_blocks(text, jsonb) from public, anon, authenticated;
grant execute on function public.flow_load(text), public.flow_init(text, jsonb), public.flow_apply(text, integer, jsonb), public.flow_rev(text),
                                public.flow_put_assignment(text, jsonb), public.flow_put_blocks(text, jsonb) to service_role;

-- Readable views for the dashboard's Table Editor.
create or replace view public.assignment_overview with (security_invoker = true) as
  select a.task_id, a.title, a.priority, e.name_ko as assignee, e.name as assignee_en, a.deadline_at, a.effort_min, a.score, a.pending, a.updated_at
  from public.assignments a left join public.employees e on e.id = a.employee_id;
