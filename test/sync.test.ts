import { test } from 'node:test'
import assert from 'node:assert/strict'
import { diff } from '../src/sync'
import { makeWorkspace } from '../src/seed'

test('sync diff sends only what changed between two saves', () => {
  const before = makeWorkspace()
  assert.equal(diff(before, before), null)
  const moved = { ...before.blocks[0], title: 'Moved meeting' }
  const added = { id: 'new-block', employeeId: before.blocks[1].employeeId, title: 'Customer call', kind: 'meeting' as const, start: before.now + 300, end: before.now + 360 }
  const after = {
    ...before, version: before.version + 1,
    blocks: [moved, ...before.blocks.slice(2), added],
    verifications: { 'SR-0001': { skills: { react: 4 } } },
    scans: [{ id: 'scan-1', team: 'Product Platform', at: before.now, findings: [] }],
  }
  const ops = diff(before, after)!
  assert.deepEqual(ops.meta, { version: before.version + 1 })
  assert.deepEqual(ops.upsertBlocks?.map((b) => b.id).sort(), [moved.id, 'new-block'].sort())
  assert.deepEqual(ops.deleteBlocks, [before.blocks[1].id])
  assert.deepEqual(Object.keys(ops.upsertVerifications || {}), ['SR-0001'])
  assert.deepEqual(ops.upsertScans?.map((s) => s.id), ['scan-1'])
  assert.equal(ops.upsertAssignments, undefined)
  // A 3,500-block calendar edit stays a tiny payload.
  assert.ok(JSON.stringify(ops).length < 2000)
})
