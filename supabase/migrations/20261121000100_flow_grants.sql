-- Flow · API grants
-- Newer Supabase projects no longer grant the Data API roles access to new tables automatically.
-- Only the server role (used by SUPABASE_SECRET_KEY) gets access; anon and authenticated get nothing, and RLS stays on.
-- Safe to run again.

grant usage on schema public to service_role;

grant select, insert, update, delete on
  public.employees, public.workspaces, public.calendar_blocks, public.assignments,
  public.assignment_events, public.verifications, public.schedule_scans, public.ai_events
to service_role;
grant select on public.assignment_overview to service_role;
grant usage, select on all sequences in schema public to service_role;

grant execute on function
  public.flow_load(text), public.flow_init(text, jsonb), public.flow_apply(text, integer, jsonb), public.flow_rev(text),
  public.flow_put_assignment(text, jsonb), public.flow_put_blocks(text, jsonb)
to service_role;

-- Keep the public roles locked out explicitly.
revoke all on
  public.employees, public.workspaces, public.calendar_blocks, public.assignments,
  public.assignment_events, public.verifications, public.schedule_scans, public.ai_events, public.assignment_overview
from anon, authenticated;

-- Tables created later in this schema by the same owner get the same server-only access.
alter default privileges in schema public grant select, insert, update, delete on tables to service_role;
alter default privileges in schema public grant usage, select on sequences to service_role;

notify pgrst, 'reload schema';
