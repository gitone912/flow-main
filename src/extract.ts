import { z } from 'zod'
import { catalog, emptyTask, type Task } from './domain'
import { calibrate, pastTasks } from './estimates'
import { explicitFacts } from './intake'

// Wire contract for POST /api/intake/extract. Shared by the server (which produces it) and the browser (which maps it to a Task).
// The LLM only ever fills a TaskDraft; availability and candidate ranking stay in the deterministic scheduler.
const skillIds = catalog.map((item) => item.id) as [string, ...string[]]
const minutesField = z.number().int().positive().max(60 * 40).nullable()
export const draftSchema = z.object({
  title: z.string().min(1).max(140),
  summary: z.string().max(400),
  deliverable: z.string().max(600).nullable().default(null),
  requiredSkills: z.array(z.object({ id: z.enum(skillIds), minLevel: z.number().int().min(1).max(5).nullable().default(null) })).max(8),
  unmappedSkills: z.array(z.string()).max(8).default([]),
  estimatedMinMinutes: minutesField,
  estimatedMaxMinutes: minutesField,
  deadline: z.string().nullable(),
  deadlineLabel: z.string().nullable().default(null),
  urgency: z.enum(['critical', 'high', 'normal']),
  requiresStagingAccess: z.boolean(),
  splittable: z.boolean().nullable().default(null),
  minFocusMinutes: minutesField.default(null),
  questions: z.array(z.string()).max(6).default([]),
})
export type TaskDraft = z.infer<typeof draftSchema>

export type CalibrationInfo = {
  rawMaxMinutes: number | null; calibratedMinutes: number | null; ratio: number | null
  samples: number; calibrationNote: string; source: 'static-benchmark'
}
export type ExtractResponse = {
  ok: true; mode: 'live' | 'fallback'; provider: string; model: string | null; fallbackReason: string | null
  aiRole: 'task_extraction_only'; schedulingEngine: 'deterministic_rules'; latencyMs: number
  draft: TaskDraft; calibration: CalibrationInfo
}

export const LLM_SYSTEM_PROMPT = [
  'You are the task intake assistant for Flow, a workload-balancing tool for small IT teams.',
  'Your ONLY job is to extract task metadata from a raw Korean or English work request and return one JSON object.',
  'You must NEVER calculate employee availability, choose, rank or recommend assignees, or invent schedules, people or permissions. Deterministic code does all scheduling after a human team lead reviews your draft.',
  'Fields: title (concise, imperative, max 80 chars), summary (one sentence explaining what you extracted), deliverable (complete statement of the outcome),',
  'requiredSkills (array of {id, minLevel}; id MUST be one of the provided skill_catalog ids; minLevel 1-5 only if the request states a level, else null),',
  'unmappedSkills (capabilities with no catalog match), estimatedMinMinutes / estimatedMaxMinutes (integers in minutes, null if unknown; "3-4 hours" = 180/240),',
  'deadline (ISO 8601 with +09:00 Asia/Seoul offset, only if the request makes it unambiguous using reference_now, else null), deadlineLabel (the human phrase, e.g. "before the 3 p.m. client demo"),',
  'urgency ("critical" for urgent/ASAP/긴급/즉시, "high" for important, else "normal"), requiresStagingAccess (true if the work must be verified or deployed in staging),',
  'splittable (true/false/null), minFocusMinutes (minimum block length if stated, else null), questions (only unanswered essentials that affect assignment).',
  'Also look for hidden work the request implies but does not budget for (docs, tests, design or security sign-off, data migration, deployment, stakeholder review). Add each as a short question in questions, written in the language of the request (Korean request → Korean question, e.g. "문서 업데이트도 포함되나요?").',
  'Write human-readable fields in the language of the request. Output JSON only, no prose.',
].join('\n')

export const llmUserPayload = (text: string, now: number) => JSON.stringify({
  request_text: text, reference_now: new Date(now * 60000).toISOString(), timezone: 'Asia/Seoul',
  skill_catalog: catalog.map(({ id, en, aliases }) => ({ id, name: en, aliases })),
})

/* ---------- Deterministic rule-based extractor (the zero-failure fallback) ---------- */
const escape = (value: string) => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
const termPattern = (term: string) => /^[\x00-\x7f]+$/.test(term)
  ? new RegExp('(?:^|[^a-z0-9])' + escape(term.toLowerCase()) + '(?![a-z0-9])', 'i')
  : new RegExp(escape(term))
// Very short or generic aliases ("UI", "TS", "분석") would match almost anything, so the fallback requires a longer term.
const usable = (term: string) => term.length >= 3

export function ruleSkills(text: string) {
  const lower = text.normalize('NFKC')
  return catalog.filter((item) => [item.en, item.ko, ...(item.aliases || [])].filter(usable).some((term) => termPattern(term).test(lower)))
    .map((item) => item.id).slice(0, 6)
}

function ruleTitle(text: string) {
  const first = text.trim().split(/(?<=[.!?。])\s+|\n/)[0] || text.trim()
  const korean = /[가-힣]/.test(first)
  let title = korean ? first.replace(/^.*?(?:전에|까지)\s*/, '').replace(/(?:해\s*주세요|해주세요|바랍니다|부탁드립니다)[.!]?$/, '').trim()
    : first.replace(/\s+(?:before|by|due)\b.*$/i, '').replace(/^(?:please|can you|could you)\s+/i, '').trim()
  if (!title) title = first
  title = title.replace(/[.!?]+$/, '')
  // Trailing effort/priority clauses (", about 2 hours, important") belong in their own fields, not the title.
  if (!korean) title = title.replace(/,\s*(?:about|around|roughly|approx\.?|it should take|should take|takes?|urgent|important|asap)\b.*$/i, '').trim()
  return (title.length > 80 ? title.slice(0, 77).trimEnd() + '…' : title).replace(/^./, (c) => c.toUpperCase())
}

export function ruleExtract(text: string): TaskDraft {
  const facts = explicitFacts(text)
  const lower = text.toLowerCase()
  let effort = facts.effort
  if (!effort) {
    const loose = lower.match(/(\d+(?:\.\d+)?)\s*(?:[-–—~]|to)\s*(\d+(?:\.\d+)?)\s*(hours?|hrs?|시간)/) || null
    const single = lower.match(/(?:about|around|roughly|약|대략)?\s*(\d+(?:\.\d+)?)\s*(hours?|hrs?|시간)(?:\s*(?:of work|정도|작업))?/)
    if (loose) effort = { min: Math.round(Number(loose[1]) * 60), max: Math.round(Number(loose[2]) * 60) }
    else if (single && !/(?:at least|최소)\s*$/.test(lower.slice(0, single.index))) effort = { min: Math.round(Number(single[1]) * 60), max: Math.round(Number(single[1]) * 60) }
  }
  const urgency: TaskDraft['urgency'] = facts.urgent || /\burgent\b|\basap\b|immediately|긴급|즉시|당장/.test(lower) ? 'critical' : /\bimportant\b|\bhigh priority\b|중요|우선/.test(lower) ? 'high' : 'normal'
  const skills = ruleSkills(text)
  const korean = /[가-힣]/.test(text)
  const deadline = facts.deadline === null ? null : new Date(facts.deadline * 60000).toISOString()
  const questions: string[] = []
  if (!deadline) questions.push(korean ? '마감 시각이 언제인가요?' : 'When is the deadline?')
  if (!effort) questions.push(korean ? '예상 소요 시간은 얼마인가요?' : 'How long should this take?')
  return {
    title: ruleTitle(text),
    summary: korean ? '규칙 기반 파서가 요청에서 스킬 ' + skills.length + '개, 시간, 마감을 추출했습니다. 리드가 검토해 주세요.' : 'Rule-based parser extracted ' + skills.length + ' skill(s), effort and deadline from the request. Please review.',
    deliverable: text.trim().slice(0, 600) || null,
    requiredSkills: skills.slice(0, 3).map((id) => ({ id, minLevel: null })),
    unmappedSkills: [],
    estimatedMinMinutes: effort?.min ?? null,
    estimatedMaxMinutes: effort?.max ?? null,
    deadline, deadlineLabel: null, urgency,
    requiresStagingAccess: /staging|스테이징/.test(lower),
    splittable: /split|blocks? of|나눠|나누어|분할/.test(lower) ? true : null,
    minFocusMinutes: facts.focus,
    questions,
  }
}

/* ---------- Calibration (static benchmark of estimated vs. actual durations) ---------- */
export function calibrationFor(draft: TaskDraft, lang: 'en' | 'ko' = 'en'): CalibrationInfo {
  const raw = draft.estimatedMaxMinutes
  const probe = { ...emptyTask(''), required: draft.requiredSkills.map(({ id }) => ({ id, level: null })), max: raw }
  const result = calibrate(probe)
  if (!raw || !result || !result.enough) return {
    rawMaxMinutes: raw, calibratedMinutes: raw, ratio: null, samples: result?.matches.length ?? 0, source: 'static-benchmark',
    calibrationNote: lang === 'ko' ? '유사한 과거 과제가 부족해 예상 시간을 그대로 사용합니다 (MVP 정적 기준).' : 'Not enough similar past tasks — estimate used as-is (MVP static benchmark).',
  }
  const pct = Math.round((result.ratio - 1) * 100)
  const signed = (pct > 0 ? '+' : '') + pct + '%'
  return {
    rawMaxMinutes: raw, calibratedMinutes: result.suggested, ratio: Number(result.ratio.toFixed(3)), samples: result.matches.length, source: 'static-benchmark',
    calibrationNote: lang === 'ko' ? '유사 완료 과제 ' + result.matches.length + '건 기준으로 ' + signed + ' 보정 (MVP 정적 기준).' : 'Adjusted ' + signed + ' based on ' + result.matches.length + ' similar finished tasks (MVP static benchmark).',
  }
}
export const calibrationHistory = pastTasks

/* ---------- Browser mapping: TaskDraft → editable Task ---------- */
export function draftToTask(draft: TaskDraft, team: string, raw: string): Task {
  const deadline = draft.deadline ? Math.floor(Date.parse(draft.deadline) / 60000) : null
  const min = draft.estimatedMinMinutes, max = draft.estimatedMaxMinutes
  const facts = explicitFacts(raw)
  return {
    ...emptyTask(team, raw),
    title: draft.title, deliverable: draft.deliverable || draft.summary,
    required: draft.requiredSkills.map(({ id, minLevel }) => ({ id, level: minLevel })),
    unmapped: draft.unmappedSkills,
    min: facts.effort?.min ?? (min && max ? Math.min(min, max) : min ?? max),
    max: facts.effort?.max ?? (min && max ? Math.max(min, max) : max ?? min),
    source: facts.effort ? 'explicit' : min || max ? 'estimate' : 'manual',
    deadline: facts.deadline ?? (deadline !== null && Number.isFinite(deadline) ? deadline : null),
    priority: draft.urgency === 'critical' ? 'urgent' : draft.urgency === 'high' ? 'high' : 'routine',
    split: draft.splittable, focus: facts.focus ?? draft.minFocusMinutes,
    access: draft.requiresStagingAccess ? ['staging'] : [],
    questions: draft.questions,
    assumptions: draft.deadlineLabel ? [draft.deadlineLabel] : [],
  }
}
