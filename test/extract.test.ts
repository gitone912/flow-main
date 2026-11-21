import assert from 'node:assert/strict'
import test from 'node:test'
import { add } from '../src/domain'
import { calibrationFor, draftSchema, draftToTask, ruleExtract } from '../src/extract'
import { englishRequest, koreanRequest } from '../src/seed'

test('rule-based fallback extracts the signature demo in English and Korean', () => {
  for (const text of [englishRequest, koreanRequest]) {
    const draft = draftSchema.parse(ruleExtract(text))
    assert.deepEqual(draft.requiredSkills.map(({ id }) => id), ['react', 'typescript'])
    assert.equal(draft.estimatedMinMinutes, 180)
    assert.equal(draft.estimatedMaxMinutes, 240)
    assert.equal(draft.urgency, 'critical')
    assert.equal(draft.requiresStagingAccess, true)
    assert.equal(Math.floor(Date.parse(draft.deadline!) / 60000), add('2026-11-24', '15:00'))
  }
})

test('fallback keeps clauses out of the title and asks for missing essentials', () => {
  const draft = ruleExtract('Please optimize the slow SQL query on the invoices page, about 2 hours, important.')
  assert.equal(draft.title, 'Optimize the slow SQL query on the invoices page')
  assert.equal(draft.urgency, 'high')
  assert.equal(draft.estimatedMaxMinutes, 120)
  assert.ok(draft.questions.some((question) => /deadline/i.test(question)))
})

test('calibration uses the static benchmark and maps into an editable task', () => {
  const draft = ruleExtract(englishRequest)
  const calibration = calibrationFor(draft)
  assert.equal(calibration.samples, 6)
  assert.equal(calibration.calibratedMinutes, 255)
  const task = draftToTask(draft, 'team', englishRequest)
  assert.equal(task.priority, 'urgent')
  assert.deepEqual(task.access, ['staging'])
  assert.equal(task.max, 240)
})

test('LLM output that names an unknown skill or wrong urgency fails validation', () => {
  const base = { title: 'X', summary: 'Y', requiredSkills: [{ id: 'react', minLevel: null }], estimatedMinMinutes: 60, estimatedMaxMinutes: 120, deadline: null, urgency: 'critical', requiresStagingAccess: false }
  assert.equal(draftSchema.safeParse(base).success, true)
  assert.equal(draftSchema.safeParse({ ...base, requiredSkills: [{ id: 'cobol', minLevel: null }] }).success, false)
  assert.equal(draftSchema.safeParse({ ...base, urgency: 'urgent' }).success, false)
})
