import { test } from 'node:test'
import assert from 'node:assert/strict'
import { assistFallback, assistSchemas, hiddenWork, labelTokens, normalizeAssist } from '../src/assist'
import { add, dayOf, DAY, hour } from '../src/domain'

const now = add('2026-11-24', '09:00') // Tuesday

test('commitment fallback reads Korean and English schedule messages into KST blocks', () => {
  const ko = assistFallback('commitments', { lang: 'ko', text: '내일 오후 2시~3시 고객 통화, 금요일 오후 반차', now })
  assert.equal(ko.items.length, 2)
  const [call, leave] = ko.items.map((item) => ({ ...item, s: Math.round(Date.parse(item.start) / 60000), e: Math.round(Date.parse(item.end) / 60000) }))
  assert.equal(call.kind, 'meeting'); assert.equal(dayOf(call.s), dayOf(now) + DAY); assert.equal(hour(call.s), '14:00'); assert.equal(hour(call.e), '15:00')
  assert.equal(leave.kind, 'leave'); assert.equal(dayOf(leave.s), dayOf(now) + 3 * DAY); assert.equal(hour(leave.s), '13:00')
  const en = assistFallback('commitments', { lang: 'en', text: 'Thu 10:00-11:30 code review', now })
  assert.equal(en.items[0].kind, 'review'); assert.equal(hour(Math.round(Date.parse(en.items[0].end) / 60000)), '11:30')
  assert.ok(assistSchemas.commitments.safeParse(ko).success)
})

test('decompose fallback and normalization keep parts summing to the confirmed effort', () => {
  const parts = assistFallback('decompose', { lang: 'en', title: 'Fix', text: 'Fix filter', skills: ['react', 'typescript', 'qa'], effortMinutes: 240, deadline: null })
  assert.equal(parts.parts.reduce((sum, part) => sum + part.minutes, 0), 240)
  assert.deepEqual(parts.parts[1].skills, ['qa'])
  const fixed = normalizeAssist('decompose', { lang: 'en', title: '', text: '', skills: [], effortMinutes: 300, deadline: null }, { parts: [{ title: 'a', skills: [], minutes: 100, handoff: null }, { title: 'b', skills: [], minutes: 100, handoff: null }] })
  assert.equal(fixed.parts.reduce((sum, part) => sum + part.minutes, 0), 300)
})

test('explain fallback cites labels, never names, and labels resolve locally', () => {
  const result = assistFallback('explain', { lang: 'en', task: { title: 'Fix', effortMinutes: 240, deadline: '15:00', urgent: true },
    candidates: [{ label: 'A', score: 82.4, finish: '14:00', spareMinutes: 60, blocks: 2, rotation: false, urgentCount: 1, factors: [{ id: 'skill', weight: 25, value: 0.9 }, { id: 'focus', weight: 10, value: 0.3 }] },
      { label: 'B', score: 79, finish: '15:00', spareMinutes: 0, blocks: 1, rotation: false, urgentCount: 3, factors: [] }], usual: { label: 'U', usableMinutes: 60, reason: 'capacity' } })
  assert.match(result.summary, /\[A\]/)
  assert.ok(result.watch)
  assert.equal(labelTokens('[A] beats [B]', { A: '김민지', B: '박준호' }), '김민지 beats 박준호')
})

test('brief fallback and hidden-work check stay team-level and bilingual', () => {
  const brief = assistFallback('brief', { lang: 'ko', teamSize: 8, urgentTotal: 10, topTwoShare: 60, urgentCounts: [4, 2, 1], focusHours: 12, overlaps: 1, fragmented: 2, pendingReviews: 0, singleOwnerSkills: ['Kubernetes'], lateRequests: 0 })
  assert.ok(assistSchemas.brief.safeParse(brief).success)
  assert.ok(brief.actions.some((action) => action.includes('Kubernetes')))
  assert.deepEqual(hiddenWork('Fix the filter and verify in staging before the client demo', 'en').map((item) => item.id), ['tests', 'stakeholder'])
})
