import { z } from 'zod'
import { accessId, add, catalog, dateInput, emptyTask, type Task } from './domain'

// Legacy snake_case draft contract (kept for validateExtraction and its tests) plus the explicit-fact parsers
// that the live API path (src/extract.ts) reuses for its deterministic fallback.

const ids = catalog.map((item) => item.id)
const skill = z.enum(ids)
const positive = z.number().int().positive()
const nullableText = z.string().nullable()
const strings = z.array(z.string())
const extraction = z.object({
  title: nullableText,
  deliverable: nullableText,
  required_skills: z.array(z.object({ id: skill, min_level: z.number().int().min(1).max(5).nullable() })),
  preferred_skill_ids: z.array(skill),
  unmapped_skills: strings,
  effort_minutes: z.object({ min: positive, max: positive, source: z.enum(['explicit', 'estimate']) }).nullable(),
  deadline_at: z.iso.datetime({ offset: true }).nullable(),
  priority: z.enum(['routine', 'high', 'urgent']).nullable(),
  splittable: z.boolean().nullable(),
  min_focus_minutes: positive.nullable(),
  dependencies: strings,
  required_access: strings,
  assumptions: strings,
  questions: strings,
}).strict()
export type IntakeFailure = 'offline' | 'malformed' | 'no-model'
export class IntakeError extends Error {
  constructor(readonly kind: IntakeFailure) { super(kind) }
}

const numberWords: Record<string, number> = { a: 1, an: 1, one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, half: .5 }
const numberPattern = '(\\d+(?:\\.\\d+)?|a|an|one|two|three|four|five|six|half)'
const unitPattern = '(hours?|hrs?|minutes?|mins?|시간|분)'
const toMinutes = (quantity: string, unit: string) => {
  const amount = numberWords[quantity] ?? Number(quantity)
  const value = amount * (/^(?:h|시간)/.test(unit) ? 60 : 1)
  return Number.isInteger(value) && value > 0 ? value : null
}

const months = ['january', 'february', 'march', 'april', 'may', 'june', 'july', 'august', 'september', 'october', 'november', 'december']
function explicitDeadline(text: string) {
  const dates: number[] = []
  const record = (y: string, m: string | number, d: string, h: string, minute = '0', period = '') => {
    const hour = Number(h)
    if (period && (hour < 1 || hour > 12)) return
    const adjusted = period ? hour % 12 + (period.startsWith('p') || period === '오후' ? 12 : 0) : hour
    const digits = (value: string | number) => String(value).padStart(2, '0')
    const date = y + '-' + digits(m) + '-' + digits(d)
    const time = digits(adjusted) + ':' + digits(minute)
    const timestamp = add(date, time)
    if (Number.isFinite(timestamp) && dateInput(timestamp) === date + 'T' + time) dates.push(timestamp)
  }
  for (const match of text.matchAll(/(\d{4})\s*년\s*(\d{1,2})\s*월\s*(\d{1,2})\s*일\s*(?:(오전|오후)\s*)?(\d{1,2})\s*시(?:\s*(\d{1,2})\s*분)?\s*(?:\(kst\)|kst)?[^\n.!?]{0,70}?(?:전에|까지|마감)/g)) {
    record(match[1], match[2], match[3], match[5], match[6], match[4])
  }
  const monthPattern = months.join('|')
  const english = new RegExp('\\b(?:by|before|due)\\b[^!\\n?]{0,60}?(\\d{1,2})(?::(\\d{2}))?\\s*([ap]\\.?m\\.?)\\s*(?:kst\\s*)?(?:on\\s+)?(' + monthPattern + ')\\s+(\\d{1,2}),?\\s+(\\d{4})', 'g')
  for (const match of text.matchAll(english)) record(match[6], months.indexOf(match[4]) + 1, match[5], match[1], match[2], match[3])
  const exact = [...new Set(dates)]
  return exact.length === 1 ? exact[0] : null
}

// Explicit quantities remain distinct from inferred estimates and focus requirements.
export function explicitFacts(raw: string) {
  const text = raw.normalize('NFKC').toLowerCase()
  const prefix = '(?:should take|will take|expected to take|estimated (?:effort|duration|time)(?: is)?|effort(?: estimate)?(?: is)?|예상\\s*(?:소요|작업)\\s*시간(?:은|이)?)'
  const ranges = [...text.matchAll(new RegExp(prefix + '\\s*:?\\s*' + numberPattern + '\\s*(?:[-–—~]|to)\\s*' + numberPattern + '\\s*' + unitPattern, 'g'))]
  const focusPrefix = '(?:blocks? of at least|min(?:imum)? (?:focus(?: time)?|block length)(?: of| is)?|최소(?:\\s*집중\\s*시간(?:은|이)?)?)'
  const focuses = [...text.matchAll(new RegExp(focusPrefix + '\\s*:?\\s*' + numberPattern + '[\\s-]*' + unitPattern, 'g'))]
  const pairs = ranges.map((match) => ({ min: toMinutes(match[1], match[3]), max: toMinutes(match[2], match[3]) })).filter(({ min, max }) => min && max && min <= max)
  const distinctFocus = [...new Set(focuses.map((match) => toMinutes(match[1], match[2])).filter((value) => value !== null))]
  const explicitUrgent = /\b(?:this|it) is urgent\b|긴급\s*(?:건|요청|업무)(?:이고|입니다|이며|이에요)/.test(text)
  return { effort: pairs.length === 1 ? pairs[0] : null, focus: distinctFocus.length === 1 ? distinctFocus[0] : null, urgent: explicitUrgent, deadline: explicitDeadline(text) }
}
export function validateExtraction(content: string, team: string, raw: string): Task {
  try {
    const parsed = extraction.parse(JSON.parse(content))
    const effort = parsed.effort_minutes
    if (effort && effort.min > effort.max) throw new Error('Effort range')
    const timestamp = parsed.deadline_at ? Math.floor(Date.parse(parsed.deadline_at) / 60000) : null
    if (timestamp !== null && !Number.isFinite(timestamp)) throw new Error('Deadline')
    const required = new Map<string, number | null>()
    const explicit = explicitFacts(raw)
    for (const { id, min_level } of parsed.required_skills) {
      const previous = required.get(id)
      required.set(id, previous === undefined ? min_level : previous === null || min_level === null ? null : Math.max(previous, min_level))
    }
    return {
      ...emptyTask(team, raw), title: parsed.title?.trim() || '', deliverable: parsed.deliverable?.trim() || '',
      required: [...required].map(([id, level]) => ({ id, level })),
      preferred: [...new Set(parsed.preferred_skill_ids)].filter((id) => !required.has(id)),
      unmapped: parsed.unmapped_skills, min: explicit.effort?.min ?? effort?.min ?? null, max: explicit.effort?.max ?? effort?.max ?? null,
      source: explicit.effort ? 'explicit' : effort?.source || 'manual',
      deadline: explicit.deadline ?? timestamp, priority: explicit.urgent ? 'urgent' : parsed.priority || '', split: parsed.splittable, focus: explicit.focus ?? parsed.min_focus_minutes,
      dependencies: parsed.dependencies.filter((name) => name.trim()).map((name) => ({ name, available: null })),
      access: [...new Set(parsed.required_access.map(accessId).filter(Boolean))],
      assumptions: parsed.assumptions, questions: parsed.questions,
    }
  } catch {
    throw new IntakeError('malformed')
  }
}
