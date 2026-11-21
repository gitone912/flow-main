import type { Workspace } from './domain'
import { readWorkspace, setSaveHook, WORKSPACE_KEY } from './storage'
import { API_HEADERS } from './api'

// Browser ↔ Supabase sync (through the Flow API; the browser never holds a database key).
// Local storage stays the instant source for the UI; every save is diffed and sent as one atomic change set.
// The server keeps a revision number: a stale revision (another device saved first) pulls the latest state instead of overwriting it.
const BASE = (import.meta.env?.VITE_API_BASE_URL || '').replace(/\/$/, '')
const POLL_MS = 12_000

export type SyncMode = 'local' | 'connecting' | 'synced' | 'syncing' | 'offline' | 'schema-missing' | 'error'
export type SyncStatus = { mode: SyncMode; rev: number | null; at: number | null; message?: string }

let status: SyncStatus = { mode: 'local', rev: null, at: null }
const listeners = new Set<(s: SyncStatus) => void>()
const setStatus = (next: Partial<SyncStatus>) => { status = { ...status, ...next }; listeners.forEach((fn) => fn(status)) }
export const getSyncStatus = () => status
export function onSyncStatus(fn: (s: SyncStatus) => void) { listeners.add(fn); fn(status); return () => { listeners.delete(fn) } }

let rev: number | null = null
let enabled = false
let dirty = false            // a local save failed to reach the server; push the full state when back online
let queue: Promise<unknown> = Promise.resolve()
let applyRemote: (state: Workspace) => void = () => {}
let poller = 0

async function api<T>(path: string, init: RequestInit = {}): Promise<{ status: number; body: T }> {
  const response = await fetch(BASE + '/api/' + path, { ...init, headers: { 'Content-Type': 'application/json', ...API_HEADERS, ...(init.headers || {}) }, signal: init.signal ?? AbortSignal.timeout(20000) })
  const text = await response.text()
  return { status: response.status, body: (text ? JSON.parse(text) : null) as T }
}

type Ops = {
  meta?: Partial<Pick<Workspace, 'version' | 'now' | 'policy' | 'verifiedTasks' | 'dataset'>>
  upsertBlocks?: Workspace['blocks']; deleteBlocks?: string[]
  upsertAssignments?: Workspace['assignments']; deleteAssignments?: string[]
  upsertVerifications?: NonNullable<Workspace['verifications']>; deleteVerifications?: string[]
  upsertScans?: NonNullable<Workspace['scans']>; deleteScans?: string[]
}

// Smallest change set that turns `before` into `after`; null when nothing persisted changed.
export function diff(before: Workspace, after: Workspace): Ops | null {
  const ops: Ops = {}
  const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b)
  const meta: Ops['meta'] = {}
  if (before.version !== after.version) meta.version = after.version
  if (before.now !== after.now) meta.now = after.now
  if (!same(before.policy, after.policy)) meta.policy = after.policy
  if (!same(before.verifiedTasks || [], after.verifiedTasks || [])) meta.verifiedTasks = after.verifiedTasks || []
  if (!same(before.dataset ?? null, after.dataset ?? null)) meta.dataset = after.dataset
  if (Object.keys(meta).length) ops.meta = meta
  const byKey = <T>(list: T[], key: (item: T) => string) => new Map(list.map((item) => [key(item), item]))
  const changes = <T>(a: T[], b: T[], key: (item: T) => string) => {
    const left = byKey(a, key), right = byKey(b, key)
    return { upsert: [...right].filter(([k, v]) => !left.has(k) || !same(left.get(k), v)).map(([, v]) => v), remove: [...left.keys()].filter((k) => !right.has(k)) }
  }
  const blocks = changes(before.blocks, after.blocks, (b) => b.id)
  if (blocks.upsert.length) ops.upsertBlocks = blocks.upsert
  if (blocks.remove.length) ops.deleteBlocks = blocks.remove
  const assignments = changes(before.assignments, after.assignments, (a) => a.task.id)
  if (assignments.upsert.length) ops.upsertAssignments = assignments.upsert
  if (assignments.remove.length) ops.deleteAssignments = assignments.remove
  const vBefore = before.verifications || {}, vAfter = after.verifications || {}
  const upsertV = Object.fromEntries(Object.entries(vAfter).filter(([k, v]) => !same(vBefore[k], v)))
  const deleteV = Object.keys(vBefore).filter((k) => !(k in vAfter))
  if (Object.keys(upsertV).length) ops.upsertVerifications = upsertV
  if (deleteV.length) ops.deleteVerifications = deleteV
  const scans = changes(before.scans || [], after.scans || [], (s) => s.id)
  if (scans.upsert.length) ops.upsertScans = scans.upsert
  if (scans.remove.length) ops.deleteScans = scans.remove
  return Object.keys(ops).length ? ops : null
}

function writeLocal(state: Workspace) {
  try { localStorage.setItem(WORKSPACE_KEY, JSON.stringify(state)) } catch { /* the UI still updates from memory */ }
  applyRemote(state)
}

async function pull() {
  const { status: code, body } = await api<{ ok: boolean; rev: number; state: Workspace }>('workspace')
  if (code !== 200 || !body?.ok) throw new Error('pull ' + code)
  rev = body.rev
  writeLocal(body.state)
  setStatus({ mode: 'synced', rev, at: Date.now(), message: undefined })
}

async function pushFull(state: Workspace) {
  const { status: code, body } = await api<{ ok: boolean; rev: number; error?: string }>('workspace', { method: 'PUT', body: JSON.stringify({ state }) })
  if (code !== 200 || !body?.ok) throw new Error(body?.error || 'push ' + code)
  rev = body.rev
  dirty = false
  setStatus({ mode: 'synced', rev, at: Date.now(), message: undefined })
}

function pushChange(before: Workspace, after: Workspace) {
  if (!enabled) return
  const ops = diff(before, after)
  if (!ops) return
  queue = queue.then(async () => {
    setStatus({ mode: 'syncing' })
    try {
      if (dirty || rev === null) { await pushFull(readWorkspace()); return }
      const { status: code, body } = await api<{ ok: boolean; rev: number; reason?: string }>('workspace/ops', { method: 'POST', body: JSON.stringify({ baseRev: rev, ops }) })
      if (code === 200 && body?.ok) { rev = body.rev; setStatus({ mode: 'synced', rev, at: Date.now(), message: undefined }); return }
      if (code === 409) { await pull(); setStatus({ message: 'conflict' }); return }       // someone else saved first: theirs wins, ours is re-applied by the user
      if (code === 404) { await pushFull(readWorkspace()); return }
      throw new Error('ops ' + code)
    } catch {
      dirty = true
      setStatus({ mode: 'offline', message: 'pending' })
    }
  })
}

async function poll() {
  if (!enabled) return
  try {
    const { status: code, body } = await api<{ ok: boolean; rev: number | null }>('workspace/rev', { signal: AbortSignal.timeout(8000) })
    if (code !== 200) throw new Error('rev ' + code)
    if (dirty) { queue = queue.then(() => pushFull(readWorkspace()).catch(() => setStatus({ mode: 'offline' }))); return }
    if (body.rev !== null && rev !== null && body.rev > rev) queue = queue.then(() => pull().catch(() => setStatus({ mode: 'offline' })))
    else if (status.mode === 'offline') setStatus({ mode: 'synced', at: Date.now() })
  } catch { setStatus({ mode: 'offline' }) }
}

// Connects once at start-up. Higher app version wins between this browser and the server; ties take the server copy.
export async function startSync(onRemote: (state: Workspace) => void) {
  applyRemote = onRemote
  setSaveHook(pushChange)
  setStatus({ mode: 'connecting' })
  try {
    const { body: db } = await api<{ configured: boolean; schema: string; message?: string }>('db/status', { signal: AbortSignal.timeout(8000) })
    if (!db?.configured) { setStatus({ mode: 'local', message: undefined }); return }
    if (db.schema === 'missing') { setStatus({ mode: 'schema-missing', message: db.message }); return }
    if (db.schema !== 'ok') { setStatus({ mode: 'error', message: db.message }); return }
    const local = readWorkspace()
    const { status: code, body } = await api<{ ok: boolean; rev: number; state: Workspace }>('workspace')
    if (code === 404) await pushFull(local)
    else if (code === 200 && body?.ok) {
      rev = body.rev
      if (local.version > (body.state.version || 0)) await pushFull(local)
      else { writeLocal(body.state); setStatus({ mode: 'synced', rev, at: Date.now() }) }
    } else throw new Error('load ' + code)
    enabled = true
    window.clearInterval(poller)
    poller = window.setInterval(() => { if (document.visibilityState === 'visible') void poll() }, POLL_MS)
  } catch (error) {
    setStatus({ mode: 'offline', message: error instanceof Error ? error.message : undefined })
  }
}

// "Reset workspace" replaces the shared copy too.
export function resetRemote(state: Workspace) {
  if (!enabled) return
  queue = queue.then(() => pushFull(state).catch(() => { dirty = true; setStatus({ mode: 'offline' }) }))
}
