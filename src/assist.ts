import { z } from 'zod'
import { catalog, DAY, dayOf, hour, minutes, skillLabel, type Language } from './domain'

// Shared contract for POST /api/assist/:kind. The server asks the LLM and validates the answer with these schemas;
// when the LLM is missing, slow or wrong, both server and browser answer with the deterministic fallback below.
// Nothing here ever chooses an assignee: the AI writes words, splits scope or reads a message. Rules and people decide.

const skillIds = catalog.map((item) => item.id) as [string, ...string[]]
const kinds = ['meeting', 'review', 'support', 'on-call', 'leave'] as const
export type CommitmentKind = typeof kinds[number]

/* ---------- Inputs (built in the browser; names and raw records never included) ---------- */
export type ExplainInput = {
  lang: Language; task: { title: string; effortMinutes: number; deadline: string | null; urgent: boolean }
  candidates: { label: string; score: number; finish: string; spareMinutes: number; blocks: number; rotation: boolean; urgentCount: number | null; factors: { id: string; weight: number; value: number }[] }[]
  usual: { label: string; usableMinutes: number; reason: string } | null
}
export type DecomposeInput = { lang: Language; title: string; text: string; skills: string[]; effortMinutes: number; deadline: string | null }
export type CommitmentsInput = { lang: Language; text: string; now: number }
export type BriefInput = {
  lang: Language; teamSize: number; urgentTotal: number; topTwoShare: number; urgentCounts: number[]; focusHours: number
  overlaps: number; fragmented: number; pendingReviews: number; singleOwnerSkills: string[]; lateRequests: number
}
export type AssistInputs = { explain: ExplainInput; decompose: DecomposeInput; commitments: CommitmentsInput; brief: BriefInput }
export type AssistKind = keyof AssistInputs

/* ---------- Outputs ---------- */
export const assistSchemas = {
  explain: z.object({ summary: z.string().min(1).max(500), tradeoff: z.string().max(400), watch: z.string().max(300).nullable().default(null) }),
  decompose: z.object({ parts: z.array(z.object({ title: z.string().min(1).max(100), skills: z.array(z.enum(skillIds)).max(4), minutes: z.number().int().min(15).max(60 * 16), handoff: z.string().max(200).nullable().default(null) })).min(2).max(4) }),
  commitments: z.object({ items: z.array(z.object({ title: z.string().min(1).max(80), kind: z.enum(kinds), start: z.string(), end: z.string() })).max(8) }),
  brief: z.object({ headline: z.string().min(1).max(200), points: z.array(z.string().max(260)).max(4), actions: z.array(z.string().max(220)).max(3) }),
}
export type AssistOutputs = { [K in AssistKind]: z.infer<typeof assistSchemas[K]> }
export type AssistResponse<K extends AssistKind> = { ok: true; mode: 'live' | 'fallback'; provider: string; model: string | null; fallbackReason: string | null; latencyMs: number; result: AssistOutputs[K] }

/* ---------- Prompts ---------- */
const common = 'You are an assistant inside Flow, a workload-balancing tool for small IT teams in Seoul. Deterministic code has already done all scheduling and ranking; you never change, invent or override numbers, people or decisions. Reply in the requested language ("ko" = Korean, "en" = English). Return one JSON object only.'
export const assistPrompts: Record<AssistKind, string> = {
  explain: common + '\nWrite a short explanation of a ranking for the team lead. Refer to candidates ONLY by their bracketed label such as [A] or [U], never by name. Use the given factor names and percent values; never mention internal ids or 0-1 decimals. Fields: summary (2 sentences: who ranks first and the 1-2 factors that decided it, citing the given numbers), tradeoff (1 sentence on what the choice costs: spare time, focus blocks, urgent-work rotation), watch (1 short caution if any factor value is below 0.4, else null).',
  decompose: common + '\nSplit one work request into 2-4 sequential parts that different people could do with clean handoffs. Fields: parts[] with title (imperative, short), skills (ids from skill_catalog only, subset relevant to that part), minutes (integer; the parts must sum to effort_minutes), handoff (what the next person receives, or null for the last part). Do not assign people.',
  commitments: common + '\nRead an employee\'s message about their own schedule and list the calendar commitments it states. Fields: items[] with title (short), kind (meeting | review | support | on-call | leave), start and end (ISO 8601 with +09:00 offset, resolved against reference_now; "afternoon" = 13:00-18:00, "morning" = 09:00-12:00, "day off" = 09:00-18:00). Only include what the message clearly states.',
  brief: common + '\nWrite a weekly fairness brief for the team lead from aggregated team numbers (no individuals are named). Fields: headline (1 sentence), points (2-4 short observations citing the numbers), actions (1-3 concrete, kind suggestions such as pairing on a single-owner skill or protecting focus time). Never suggest evaluating or ranking people. The headline must agree with urgent_work_is_concentrated. Keep the time units exactly as named (focus hours are for today, not the week).',
}
export function assistUserPayload<K extends AssistKind>(kind: K, input: AssistInputs[K]) {
  if (kind === 'decompose') return JSON.stringify({ ...input, effort_minutes: (input as DecomposeInput).effortMinutes, skill_catalog: catalog.map(({ id, en }) => ({ id, name: en })) })
  // A ready-made date table: models resolve "Friday" far more reliably from a lookup than from weekday arithmetic.
  if (kind === 'commitments') {
    const value = input as CommitmentsInput
    const days = Array.from({ length: 14 }, (_, i) => {
      const day = dayOf(value.now) + i * DAY
      const date = new Date((day + 540) * 60000)
      return { date: date.toISOString().slice(0, 10), weekday: ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'][date.getUTCDay()], weekday_ko: ['일요일', '월요일', '화요일', '수요일', '목요일', '금요일', '토요일'][date.getUTCDay()], relative: i === 0 ? 'today/오늘' : i === 1 ? 'tomorrow/내일' : i === 2 ? '모레' : null }
    })
    return JSON.stringify({ lang: value.lang, message: value.text, reference_now_kst: days[0].date + 'T' + hour(value.now) + ':00+09:00', timezone: 'Asia/Seoul', calendar: days, rule: 'A bare weekday means its NEXT occurrence in this calendar table (never today).' })
  }
  // Readable factor names and percentages instead of internal ids and 0–1 values.
  if (kind === 'explain') {
    const value = input as ExplainInput
    return JSON.stringify({ ...value, candidates: value.candidates.map((c) => ({ ...c, factors: c.factors.map((f) => ({ factor: factorName(f.id, value.lang), weight: f.weight, percent: Math.round(f.value * 100) })) })) })
  }
  // Explicit units and a pre-computed verdict so the brief cannot contradict its own numbers.
  if (kind === 'brief') {
    const value = input as BriefInput
    return JSON.stringify({ lang: value.lang, team_size: value.teamSize, urgent_tasks_last_30_days: value.urgentTotal, share_of_urgent_work_on_top_2_people_percent: value.topTwoShare,
      urgent_work_is_concentrated: value.topTwoShare >= 50, urgent_counts_per_person_sorted_anonymous: value.urgentCounts, unbroken_focus_hours_open_today_whole_team: value.focusHours,
      overlapping_commitments_today: value.overlaps, people_with_fragmented_day_today: value.fragmented, assignments_waiting_for_review: value.pendingReviews, skills_with_only_one_verified_owner: value.singleOwnerSkills })
  }
  return JSON.stringify(input)
}

/* ---------- Deterministic fallbacks ---------- */
const factorNames: Record<string, [string, string]> = {
  skill: ['skill fit', '스킬 적합도'], experience: ['relevant experience', '관련 경험'], slack: ['time left before the deadline', '마감 전 여유'], buffer: ['time left before the deadline', '마감 전 여유'],
  workload: ['workload after assignment', '배정 후 업무량'], deadlines: ['effect on existing deadlines', '기존 마감 영향'], impact: ['effect on existing deadlines', '기존 마감 영향'], focus: ['focus time', '집중 시간'], overload: ['recent overload', '최근 과부하'],
}
const factorName = (id: string, lang: Language) => (factorNames[id] || [id, id])[lang === 'ko' ? 1 : 0]

function explainFallback(input: ExplainInput): AssistOutputs['explain'] {
  const ko = input.lang === 'ko'
  const [first, second] = input.candidates
  if (!first) return { summary: ko ? '마감 전에 이 작업을 맡을 수 있는 후보가 없습니다.' : 'No candidate can fit this work before the deadline.', tradeoff: ko ? '작업 분할이나 마감 조정을 시도해 보세요.' : 'Try splitting the work or moving the deadline.', watch: null }
  const top = [...first.factors].sort((a, b) => b.weight * b.value - a.weight * a.value).slice(0, 2)
  const reasons = top.map((f) => factorName(f.id, input.lang) + ' ' + Math.round(f.value * 100) + '%').join(ko ? ', ' : ' and ')
  const gap = second ? Math.round((first.score - second.score) * 10) / 10 : null
  const summary = ko
    ? `[${first.label}]이(가) ${first.score.toFixed(1)}점으로 1순위입니다. 결정 요인은 ${reasons}입니다.` + (gap !== null ? ` [${second!.label}]와 ${gap}점 차이입니다.` : '')
    : `[${first.label}] ranks first at ${first.score.toFixed(1)}, decided mainly by ${reasons}.` + (gap !== null ? ` [${second!.label}] is ${gap} points behind.` : '')
  const tradeoff = (first.rotation ? (ko ? '긴급 업무 순환으로 순서가 바뀌었습니다. ' : 'Urgent-work rotation changed the order. ') : '')
    + (ko ? `${first.finish}에 끝나고 마감 전 ${minutes(first.spareMinutes, 'ko')} 여유가 남으며, 집중 블록 ${first.blocks}개를 씁니다.` : `Finishes at ${first.finish} with ${minutes(first.spareMinutes)} spare, using ${first.blocks} focus block${first.blocks > 1 ? 's' : ''}.`)
    + (input.usual ? (ko ? ` 기존 담당자 [${input.usual.label}]는 ${minutes(input.usual.usableMinutes, 'ko')}만 가능합니다.` : ` The usual owner [${input.usual.label}] has only ${minutes(input.usual.usableMinutes)} usable.`) : '')
  const weak = first.factors.filter((f) => f.value < 0.4).sort((a, b) => a.value - b.value)[0]
  const watch = weak ? (ko ? `${factorName(weak.id, 'ko')} 점수가 ${Math.round(weak.value * 100)}%로 낮습니다. 배정 후 확인하세요.` : `${factorName(weak.id, 'en')} is low at ${Math.round(weak.value * 100)}% — check in after assigning.`) : null
  return { summary, tradeoff, watch }
}

const round30 = (value: number) => Math.max(30, Math.round(value / 30) * 30)
function decomposeFallback(input: DecomposeInput): AssistOutputs['decompose'] {
  const ko = input.lang === 'ko'
  const build = input.skills.filter((id) => id !== 'qa')
  const verify = input.skills.includes('qa') ? ['qa'] : build.slice(0, 1)
  const first = round30(input.effortMinutes * 0.65)
  const second = Math.max(15, input.effortMinutes - first)
  return { parts: [
    { title: ko ? '핵심 구현' : 'Build the core change', skills: (build.length ? build : input.skills).slice(0, 4), minutes: first, handoff: ko ? '변경 사항과 확인 방법 메모' : 'The change plus a short note on how to check it' },
    { title: ko ? '검증 및 마무리' : 'Verify and wrap up', skills: verify.slice(0, 4), minutes: second, handoff: null },
  ] }
}

// Small bilingual schedule reader: "tomorrow 2-3pm customer call", "금요일 오후 반차", "Thu 10:00-11:30 review".
const dayWords: [RegExp, (now: number) => number][] = [
  [/(today|오늘)/i, () => 0], [/(tomorrow|내일)/i, () => 1], [/(모레|day after tomorrow)/i, () => 2],
  ...(['sun|일요일', 'mon|월요일', 'tue|화요일', 'wed|수요일', 'thu|목요일', 'fri|금요일', 'sat|토요일'].map((words, target) => [new RegExp('(' + words.split('|').map((w) => /^[a-z]/.test(w) ? '\\b' + w + '[a-z]*' : w).join('|') + ')', 'i'), (now: number) => {
    const today = ((Math.floor((dayOf(now) + 540) / DAY) + 4) % 7 + 7) % 7
    return ((target - today) + 7) % 7 || 7
  }] as [RegExp, (now: number) => number])),
]
const kindWords: [RegExp, CommitmentKind][] = [
  [/(off|leave|vacation|holiday|sick|휴가|반차|연차|병가|휴무)/i, 'leave'], [/(on-?call|온콜|당직)/i, 'on-call'], [/(review|리뷰)/i, 'review'], [/(support|지원|고객 문의)/i, 'support'], [/(call|meeting|sync|1:1|회의|미팅|통화|면담)/i, 'meeting'],
]
function commitmentsFallback(input: CommitmentsInput): AssistOutputs['commitments'] {
  const ko = input.lang === 'ko'
  const items: AssistOutputs['commitments']['items'] = []
  for (const sentence of input.text.split(/[.\n;]|,\s|그리고|\band\b|하고\s/).map((s) => s.trim()).filter(Boolean)) {
    const dayMatch = dayWords.find(([pattern]) => pattern.test(sentence))
    const offset = dayMatch ? dayMatch[1](input.now) : 0
    const base = dayOf(input.now) + offset * DAY
    const pm = /(pm|오후|afternoon)/i.test(sentence)
    let range: [number, number] | null = null
    const times = [...sentence.matchAll(/(\d{1,2})(?::(\d{2}))?\s*(am|pm|시)?(?:\s*(\d{2})분)?/gi)].map((m) => {
      let h = Number(m[1]); const min = Number(m[2] || m[4] || 0)
      if (h > 23) return null
      if ((m[3]?.toLowerCase() === 'pm' || (pm && h < 12)) && h < 12) h += 12
      else if (!m[3] && !pm && h >= 1 && h <= 7) h += 12
      return h * 60 + min
    }).filter((v): v is number => v !== null)
    if (times.length >= 2 && times[1] > times[0]) range = [times[0], times[1]]
    else if (times.length === 1) range = [times[0], times[0] + 60]
    else if (/(morning|오전)/i.test(sentence)) range = [540, 720]
    else if (/(afternoon|오후|반차)/i.test(sentence)) range = [780, 1080]
    else if (/(all day|day off|off|종일|하루|휴가|연차|병가)/i.test(sentence)) range = [540, 1080]
    if (!range) continue
    const kind = kindWords.find(([pattern]) => pattern.test(sentence))?.[1] || 'meeting'
    const label = { meeting: ko ? '회의' : 'Meeting', review: ko ? '리뷰' : 'Review', support: ko ? '지원' : 'Support', 'on-call': ko ? '온콜' : 'On-call', leave: ko ? '휴가' : 'Leave' }[kind]
    const cleaned = sentence.replace(/\d{1,2}(:\d{2})?\s*(am|pm|시)?(\s*\d{2}분)?|[~–-]|부터|까지|today|tomorrow|오늘|내일|모레|오전|오후|morning|afternoon/gi, ' ').replace(/\s+/g, ' ').trim()
    const title = cleaned.length >= 2 && cleaned.length <= 60 ? cleaned : label
    const iso = (value: number) => new Date((base + value) * 60000).toISOString()
    items.push({ title, kind, start: iso(range[0]), end: iso(range[1]) })
  }
  return { items: items.slice(0, 8) }
}

function briefFallback(input: BriefInput): AssistOutputs['brief'] {
  const ko = input.lang === 'ko'
  const concentrated = input.topTwoShare >= 50
  const points = [
    ko ? `최근 30일 긴급 업무 ${input.urgentTotal}건 중 ${input.topTwoShare}%를 상위 2명이 맡았습니다.` : `Of ${input.urgentTotal} urgent tasks in 30 days, the top 2 people took ${input.topTwoShare}%.`,
    ko ? `오늘 팀 전체 집중 가능 시간은 ${input.focusHours}시간이고, 일정이 조각난 팀원은 ${input.fragmented}명입니다.` : `The team has ${input.focusHours}h of unbroken focus time today; ${input.fragmented} people have a fragmented day.`,
    input.overlaps ? (ko ? `겹치는 일정이 ${input.overlaps}건 있습니다.` : `${input.overlaps} commitments overlap.`) : '',
    input.singleOwnerSkills.length ? (ko ? `검증된 담당자가 1명뿐인 스킬: ${input.singleOwnerSkills.slice(0, 3).join(', ')}.` : `Skills with a single verified owner: ${input.singleOwnerSkills.slice(0, 3).join(', ')}.`) : '',
  ].filter(Boolean).slice(0, 4)
  const actions = [
    concentrated ? (ko ? '다음 긴급 업무는 최근 긴급 업무가 적은 팀원에게 우선 배정하세요.' : 'Route the next urgent task to someone with fewer recent urgent assignments.') : '',
    input.singleOwnerSkills.length ? (ko ? `${input.singleOwnerSkills[0]} 페어링 세션을 잡아 담당자를 늘리세요.` : `Schedule a pairing session on ${input.singleOwnerSkills[0]} to add a second owner.`) : '',
    input.fragmented ? (ko ? '조각난 일정의 팀원에게 2시간 집중 블록을 보호해 주세요.' : 'Protect a 2-hour focus block for people with fragmented days.') : '',
    input.pendingReviews ? (ko ? `대기 중인 검토 ${input.pendingReviews}건을 먼저 처리하세요.` : `Clear the ${input.pendingReviews} pending reviews first.`) : '',
  ].filter(Boolean).slice(0, 3)
  return {
    headline: concentrated ? (ko ? '긴급 업무가 소수에게 몰리고 있습니다. 이번 주는 분산이 우선입니다.' : 'Urgent work is concentrating on a few people. Spreading it is this week’s priority.') : (ko ? '긴급 업무가 비교적 고르게 분산되어 있습니다.' : 'Urgent work is spread fairly evenly this week.'),
    points, actions: actions.length ? actions : [ko ? '현재 방식을 유지하고 다음 주에 다시 확인하세요.' : 'Keep the current approach and check again next week.'],
  }
}

export function assistFallback<K extends AssistKind>(kind: K, input: AssistInputs[K]): AssistOutputs[K] {
  const result = kind === 'explain' ? explainFallback(input as ExplainInput) : kind === 'decompose' ? decomposeFallback(input as DecomposeInput) : kind === 'commitments' ? commitmentsFallback(input as CommitmentsInput) : briefFallback(input as BriefInput)
  return result as AssistOutputs[K]
}

// Post-validation fixes that keep the AI honest: parts must add up to the confirmed effort, times must parse.
export function normalizeAssist<K extends AssistKind>(kind: K, input: AssistInputs[K], result: AssistOutputs[K]): AssistOutputs[K] {
  if (kind === 'decompose') {
    const value = result as AssistOutputs['decompose']; const effort = (input as DecomposeInput).effortMinutes
    const sum = value.parts.reduce((acc, part) => acc + part.minutes, 0)
    if (sum !== effort && sum > 0) { const scaled = value.parts.map((part) => ({ ...part, minutes: Math.max(15, Math.round(part.minutes * effort / sum / 15) * 15) })); scaled[scaled.length - 1].minutes = Math.max(15, effort - scaled.slice(0, -1).reduce((acc, part) => acc + part.minutes, 0)); return { parts: scaled } as AssistOutputs[K] }
  }
  if (kind === 'commitments') {
    const value = result as AssistOutputs['commitments']
    return { items: value.items.filter((item) => Number.isFinite(Date.parse(item.start)) && Date.parse(item.end) > Date.parse(item.start)) } as AssistOutputs[K]
  }
  return result
}

/* ---------- Hidden work: instant rule check on the request text (the LLM also adds questions) ---------- */
const hiddenRules: { id: string; pattern: RegExp; en: string; ko: string }[] = [
  { id: 'docs', pattern: /(docs?|documentation|readme|guide|문서|가이드)/i, en: 'Does this include updating the docs?', ko: '문서 업데이트도 포함되나요?' },
  { id: 'tests', pattern: /(test|qa|regression|verify|검증|테스트|확인)/i, en: 'Are tests or a QA pass part of the estimate?', ko: '테스트나 QA 시간이 예상 시간에 포함되나요?' },
  { id: 'deploy', pattern: /(deploy|release|ship|배포|릴리스|출시)/i, en: 'Who handles the deployment and when?', ko: '배포는 누가, 언제 진행하나요?' },
  { id: 'design', pattern: /(design|figma|ux|ui review|디자인|시안)/i, en: 'Is design sign-off needed before or after?', ko: '디자인 승인이 먼저 필요한가요?' },
  { id: 'security', pattern: /(security|auth|login|permission|token|개인정보|보안|인증|권한)/i, en: 'Does this need a security review?', ko: '보안 검토가 필요한가요?' },
  { id: 'data', pattern: /(migrat|schema|database|backfill|마이그레이션|스키마|데이터베이스)/i, en: 'Is a data migration or backfill involved?', ko: '데이터 마이그레이션이나 백필이 필요한가요?' },
  { id: 'stakeholder', pattern: /(client|customer|stakeholder|demo|고객|데모|보고)/i, en: 'Does someone need to review it with the client first?', ko: '고객 확인이나 리뷰가 먼저 필요한가요?' },
]
export function hiddenWork(text: string, lang: Language) {
  return hiddenRules.filter((rule) => rule.pattern.test(text)).map((rule) => ({ id: rule.id, question: lang === 'ko' ? rule.ko : rule.en }))
}

export const labelTokens = (text: string, names: Record<string, string>) => text.replace(/\[([A-Z])\]/g, (match, label: string) => names[label] || match)
export const clockLabel = (time: number | null) => time === null ? null : hour(time) + ' KST'
export const skillNames = (ids: string[], lang: Language) => ids.map((id) => skillLabel(id, lang)).join(', ')
