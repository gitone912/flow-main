import { calibrationHistory } from '../src/extract'

// Static MVP payloads. They document the API contract with the signature demo (24 Nov 2026, KST):
// a 4h urgent dashboard fix due 15:00; the usual assignee has ~1h of fragmented time, the recommended teammate has 5h free.
// The browser computes the same comparison live with the deterministic scheduler in src/scheduler.ts.
export const MODE = 'static-mvp' as const
const day = '2026-11-24'
const at = (time: string) => day + 'T' + time + ':00+09:00'

export const demoTask = {
  id: 'dashboard-demo', title: 'Fix dashboard filter', urgency: 'critical',
  requiredSkills: [{ id: 'react', minLevel: 4 }, { id: 'typescript', minLevel: 4 }],
  estimatedMinMinutes: 180, estimatedMaxMinutes: 240, deadline: at('15:00'), requiresStagingAccess: true, splittable: true, minFocusMinutes: 60,
}

export const planPayload = {
  mode: MODE, engine: 'deterministic_rules', task: demoTask,
  note: 'Static stub. The live comparison runs client-side in src/scheduler.ts using the same rules.',
  candidates: [
    {
      employeeId: 'recommended', name: 'Minji Kim', role: 'Frontend Engineer', badge: 'recommended',
      experience: { comparableTasks12m: 3, skills: { react: 5, typescript: 4 } },
      availability: { freeMinutesBeforeDeadline: 300, longestUnbrokenMinutes: 180, windows: [{ start: at('09:00'), end: at('12:00'), kind: 'focus' }, { start: at('13:00'), end: at('15:00'), kind: 'focus' }] },
      recentUrgentTasks30d: 1,
      proposedBlocks: [{ start: at('09:00'), end: at('12:00') }, { start: at('13:00'), end: at('14:00') }],
      impact: { finishesAt: at('14:00'), spareBeforeDeadlineMinutes: 60, impactedDeadlines: 0, summary: 'Zero deadline impact' },
    },
    {
      employeeId: 'usual-owner', name: 'Junho Park', role: 'Frontend Engineer', badge: 'usual_assignee',
      experience: { comparableTasks12m: 5, skills: { react: 5, typescript: 5 } },
      availability: { freeMinutesBeforeDeadline: 60, longestUnbrokenMinutes: 30, windows: [{ start: at('10:30'), end: at('11:00'), kind: 'gap' }, { start: at('13:30'), end: at('14:00'), kind: 'gap' }] },
      recentUrgentTasks30d: 4,
      proposedBlocks: [],
      impact: { finishesAt: null, spareBeforeDeadlineMinutes: -180, impactedDeadlines: 2, summary: 'Only 1h free · collides with code review and on-call' },
    },
  ],
  excluded: [{ employeeId: 'unverified', name: 'Seoyeon Lee', reasons: ['Staging access requires verification'] }],
}

export const alternativesPayload = {
  mode: MODE, reason: 'No candidate has enough focus time before the deadline',
  options: [
    { id: 'split', label: 'Split into 2 × 2h blocks', task: { ...demoTask, splittable: true, minFocusMinutes: 120 }, blocks: [{ start: at('09:00'), end: at('11:00') }, { start: at('13:00'), end: at('15:00') }], fits: 'Minji Kim' },
    { id: 'deadline', label: 'Shift deadline by +4h', task: { ...demoTask, deadline: at('19:00') }, fits: 'Junho Park', note: 'Requires client confirmation' },
  ],
}

export const approvePayload = (body: Record<string, unknown>) => ({
  mode: MODE, status: 'approved', approvedBy: 'team_lead', taskId: body.taskId ?? demoTask.id, employeeId: body.employeeId ?? 'recommended',
  impactedDeadlines: 0, approvedAt: new Date().toISOString(),
  message: 'Static MVP stub — assignment recorded locally in client',
})

export const privacyNotice = 'Workload data is strictly for sustainable scheduling, never HR evaluation'
export const reviewPayload = (id: string, body: Record<string, unknown>) => ({
  mode: MODE, status: 'review_requested', assignmentId: id, note: body.note ?? null, proposedMaxMinutes: body.effort ?? null,
  nextStep: 'Team lead re-runs the comparison; the original booking stays visible until a replacement is approved.', privacyNotice,
})
export const commitmentPayload = (body: Record<string, unknown>) => ({
  mode: MODE, status: 'review_requested', commitment: { employeeId: body.employeeId ?? null, title: body.title ?? null, kind: body.kind ?? 'meeting', start: body.start ?? null, end: body.end ?? null },
  nextStep: 'Affected assignments are flagged for re-review.', privacyNotice,
})

export const syncPayload = {
  mode: MODE, syncedAt: at('08:55'),
  note: 'Illustrative normalized blocks. Real connectors (OAuth + webhooks) are post-MVP; the demo uses preloaded synthetic data.',
  sources: [
    { id: 'google-calendar', provides: 'meetings, time off', status: 'planned' },
    { id: 'jira', provides: 'open tasks, deadlines, remaining estimates', status: 'planned' },
    { id: 'github-reviews', provides: 'requested code reviews', status: 'planned' },
    { id: 'on-call', provides: 'on-call rotations (PagerDuty/Opsgenie)', status: 'planned' },
    { id: 'csv-upload', provides: 'commitments, verified skills, working windows', status: 'live-in-client' },
  ],
  blocks: [
    { employeeId: 'usual-owner', source: 'google-calendar', kind: 'meeting', title: 'Sprint planning', start: at('09:00'), end: at('10:30') },
    { employeeId: 'usual-owner', source: 'github-reviews', kind: 'review', title: 'Review PR #482 · payments', start: at('11:00'), end: at('12:00') },
    { employeeId: 'usual-owner', source: 'on-call', kind: 'on-call', title: 'Primary on-call', start: at('14:00'), end: at('17:00') },
    { employeeId: 'usual-owner', source: 'jira', kind: 'work', title: 'FLOW-219 Release notes', start: at('13:00'), end: at('13:30'), deadline: at('17:00') },
    { employeeId: 'recommended', source: 'google-calendar', kind: 'meeting', title: 'Design sync', start: at('15:00'), end: at('15:30') },
  ],
}

export const historyPayload = {
  mode: MODE, source: 'static-benchmark',
  note: 'Estimated vs. actual minutes of finished work. Flow uses the ratio for similar skills to calibrate new AI estimates.',
  rows: calibrationHistory.map(({ id, title, skills, estimate, actual, daysAgo }) => ({ id, title, skills, estimatedMinutes: estimate, actualMinutes: actual, overrunPct: Math.round((actual / estimate - 1) * 100), daysAgo })),
}
