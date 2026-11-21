import { type Workspace } from './domain'
import { makeWorkspace } from './seed'

// The CSV roster uses its own namespace so prior demo records keep their original identities.
export const WORKSPACE_KEY = 'flow.workspace.csv.v1'
export function readWorkspace(): Workspace {
  try {
    const raw = localStorage.getItem(WORKSPACE_KEY)
    if (raw) {
      const state: Workspace = JSON.parse(raw)
      if (Array.isArray(state.assignments) && Array.isArray(state.blocks) && Number.isFinite(state.now) && state.policy?.timezone === 'Asia/Seoul') return state
    }
  } catch {
    // A fresh fixture remains usable after a corrupt or unavailable persisted snapshot.
  }
  return makeWorkspace()
}

// Called after every local save with the before/after states (the Supabase sync registers here).
let saveHook: ((before: Workspace, after: Workspace) => void) | null = null
export function setSaveHook(hook: typeof saveHook) { saveHook = hook }

export async function transact<T>(apply: (latest: Workspace) => { state: Workspace; result: T }) {
  const save = () => {
    const latest = readWorkspace()
    const { state, result } = apply(latest)
    if (state !== latest) { localStorage.setItem(WORKSPACE_KEY, JSON.stringify(state)); saveHook?.(latest, state) }
    return { state, result }
  }
  return navigator.locks ? navigator.locks.request(WORKSPACE_KEY, save) : save()
}

export function getPref(key: string, fallback: string) {
  try { return localStorage.getItem('flow.' + key) || fallback } catch { return fallback }
}
export function setPref(key: string, value: string) {
  try { localStorage.setItem('flow.' + key, value) } catch { /* Preferences are optional. */ }
}
