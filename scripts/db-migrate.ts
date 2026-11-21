// Applies every SQL file in supabase/migrations (in name order) to the Supabase Postgres database.
// Usage: set SUPABASE_DB_URL in .env (Supabase dashboard → Connect → Session pooler URI, with your database password), then:
//   npm run db:migrate
// Each file runs in one transaction and is recorded in public.flow_migrations, so re-running skips what is already applied.
import { existsSync, readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import postgres from 'postgres'

for (const file of ['.env.local', '.env']) if (existsSync(file)) try { process.loadEnvFile(file) } catch { /* optional */ }

const url = process.env.SUPABASE_DB_URL?.trim()
if (!url) {
  console.error('SUPABASE_DB_URL is not set.\n  Supabase dashboard → Connect → "Session pooler" → copy the URI, replace [YOUR-PASSWORD], and add it to .env as SUPABASE_DB_URL=...\n  Or paste supabase/migrations/*.sql into the SQL Editor and click Run.')
  process.exit(1)
}

const sql = postgres(url, { ssl: 'require', max: 1, onnotice: () => {} })
const dir = 'supabase/migrations'
try {
  await sql`create table if not exists public.flow_migrations (name text primary key, applied_at timestamptz not null default now())`
  await sql`alter table public.flow_migrations enable row level security`
  const done = new Set((await sql<{ name: string }[]>`select name from public.flow_migrations`).map((row) => row.name))
  const files = readdirSync(dir).filter((name) => name.endsWith('.sql')).sort()
  for (const name of files) {
    if (done.has(name)) { console.log('✓ already applied', name); continue }
    await sql.begin(async (tx) => {
      await tx.unsafe(readFileSync(join(dir, name), 'utf8'))
      await tx`insert into public.flow_migrations (name) values (${name})`
    })
    console.log('✓ applied', name)
  }
  await sql`notify pgrst, 'reload schema'`   // make the new tables visible to the REST API immediately
  const tables = await sql<{ table_name: string }[]>`select table_name from information_schema.tables where table_schema = 'public' order by table_name`
  console.log('Tables:', tables.map((row) => row.table_name).join(', '))
} catch (error) {
  console.error('Migration failed:', error instanceof Error ? error.message : error)
  process.exitCode = 1
} finally {
  await sql.end()
}
