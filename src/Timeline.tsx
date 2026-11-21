import { type CSSProperties } from 'react'
import { DAY, dayOf, duration, hour, intersects, merge, span, subtract, total, weekday, type Block, type Employee, type Interval, type Workspace } from './domain'
import { effectivePerson } from './scheduler'
import { existingTasks } from './seed'

// A contiguous free window at least this long reads as deep-focus time; anything shorter is a fragmented gap.
export const FOCUS_MIN = 120
const relative = (list: Interval[], day: number) => list.map(({ start, end }) => span(day + start, day + end))

export type DayModel = {
  range: Interval; day: number; busy: Block[]; breaks: Interval[]; free: (Interval & { focus: boolean })[]
  workable: number; longest: number; deadline: number | null
}

// Visual model of one person's working day: what is booked, what is open, and how much of it lands before the deadline.
export function dayModel(base: Employee, workspace: Workspace, deadline: number | null, ignoreTask?: string): DayModel {
  const person = effectivePerson(base, workspace)
  const day = dayOf(workspace.now)
  const shift = relative(person.hours[weekday(day)] || [span(540, 1020)], day).filter((window) => window.end > window.start)
  const shiftStart = Math.min(...shift.map(({ start }) => start), day + 540)
  const shiftEnd = Math.max(...shift.map(({ end }) => end), deadline && dayOf(deadline) === day ? deadline : 0, day + 1020)
  const range = span(Math.min(shiftStart, workspace.now), Math.min(day + DAY, shiftEnd))
  const breaks = relative(workspace.policy.breaks || [], day).filter((item) => intersects(item, range))
  const busy = workspace.blocks
    .filter((block) => block.employeeId === person.id && block.kind !== 'reserve' && (!ignoreTask || block.taskId !== ignoreTask) && intersects(block, range))
    .sort((a, b) => a.start - b.start)
  const cutoff = deadline ?? range.end
  const open = subtract(shift, [...breaks, ...busy]).flatMap((window) => {
    const clipped = span(Math.max(window.start, workspace.now), window.end)
    if (clipped.end <= clipped.start) return []
    // Split at the deadline so the part before it is judged on its own.
    return clipped.start < cutoff && clipped.end > cutoff ? [span(clipped.start, cutoff), span(cutoff, clipped.end)] : [clipped]
  })
  const free = open.map((window) => ({ ...window, focus: duration(window) >= FOCUS_MIN }))
  const before = free.filter((window) => window.end <= cutoff)
  return { range, day, busy, breaks, free, workable: total(before), longest: Math.max(0, ...before.map(duration)), deadline }
}

// Where a new task would land for someone it does not fit: the slot ending at the deadline, so the collision is visible.
export function collisionPreview(model: DayModel, effort: number): Interval[] {
  const end = model.deadline ?? model.range.end
  return [span(Math.max(model.range.start, end - effort), end)]
}
export function collisions(model: DayModel, preview: Interval[]) {
  const hit = model.busy.filter((block) => preview.some((slot) => intersects(slot, block)))
  const deadlines = new Set(hit.filter((block) => block.taskId && existingTasks.some((task) => task.id === block.taskId && task.deadline !== null)).map((block) => block.taskId))
  return { blocks: hit, deadlines: deadlines.size, late: preview.some((slot) => model.deadline !== null && slot.end > model.deadline) }
}

export function recentUrgent(person: Employee, workspace: Workspace) {
  const start = workspace.now - 30 * DAY
  const seeded = person.urgent?.filter((stamp) => stamp >= start && stamp < workspace.now).length ?? 0
  const booked = workspace.assignments.filter((record) => record.employeeId === person.id && record.task.priority === 'urgent' && record.history[0]?.at >= start).length
  return seeded + booked
}
export const urgentTone = (count: number) => count >= 3 ? 'risk' : count === 2 ? 'gap' : 'focus'

export function UrgentDots({ count, max = 5, label }: { count: number; max?: number; label: string }) {
  const tone = urgentTone(count)
  return <span className={'urgent-dots tone-' + tone} title={label} aria-label={label}>
    {Array.from({ length: max }, (_, i) => <i key={i} className={i < count ? 'on' : ''} style={{ '--i': i } as CSSProperties} />)}
    {count > max && <b>+{count - max}</b>}
  </span>
}

const kindTone: Partial<Record<Block['kind'], string>> = { leave: 'leave', assignment: 'assigned' }

export function DayTimeline({ model, preview = [], tone = 'fit', active = false, locked = false, compact = false, labels, deadlineLabel }: {
  model: DayModel; preview?: Interval[]; tone?: 'fit' | 'clash'; active?: boolean; locked?: boolean; compact?: boolean
  labels: { task: string; focus: string; gap: string }; deadlineLabel?: string
}) {
  const { range } = model
  const length = duration(range)
  const pos = (from: number, to: number): CSSProperties => ({
    left: ((Math.max(from, range.start) - range.start) / length * 100) + '%',
    width: ((Math.min(to, range.end) - Math.max(from, range.start)) / length * 100) + '%',
  })
  const firstHour = Math.ceil(range.start / 60) * 60
  const ticks: number[] = []
  for (let time = firstHour; time <= range.end; time += compact ? 240 : 120) ticks.push(time)
  const lanes = merge(model.busy).length !== model.busy.length
  let index = 0
  const stagger = () => ({ '--i': index++ } as CSSProperties)
  return <div className={'day-timeline' + (compact ? ' compact' : '') + (active ? ' active' : '') + (locked ? ' locked' : '')}>
    <div className="dt-track">
      {model.deadline !== null && model.deadline < range.end && <span className="dt-after" style={pos(model.deadline, range.end)} />}
      {model.breaks.map((item) => <span key={'b' + item.start} className="dt-break" style={pos(item.start, item.end)} />)}
      {model.free.map((window) => {
        const after = model.deadline !== null && window.start >= model.deadline
        return <span key={'f' + window.start} className={'dt-seg dt-free ' + (after ? 'late' : window.focus ? 'focus' : 'gap')} style={{ ...pos(window.start, window.end), ...stagger() }}
          title={(window.focus ? labels.focus : labels.gap) + ' · ' + hour(window.start) + '–' + hour(window.end)} />
      })}
      {model.busy.map((block, i) => {
        const overlapsEarlier = lanes && model.busy.slice(0, i).some((other) => intersects(other, block))
        return <span key={block.id} className={'dt-seg dt-busy ' + (kindTone[block.kind] || 'busy') + (overlapsEarlier ? ' stacked' : '')} style={{ ...pos(block.start, block.end), ...stagger() }}
          title={block.title + ' · ' + hour(block.start) + '–' + hour(block.end)} />
      })}
      {preview.map((slot, i) => <span key={'p' + slot.start} className={'dt-task ' + tone} style={{ ...pos(slot.start, slot.end), '--i': i } as CSSProperties} title={labels.task + ' · ' + hour(slot.start) + '–' + hour(slot.end)}>
        {!compact && i === 0 && <em>{labels.task}</em>}
      </span>)}
    </div>
    {model.deadline !== null && model.deadline > range.start && model.deadline <= range.end && <span className="dt-deadline" style={{ left: ((model.deadline - range.start) / length * 100) + '%' }}>{!compact && deadlineLabel && <small>{deadlineLabel}</small>}</span>}
    {!compact && <div className="dt-ticks">{ticks.map((time) => <span key={time} style={{ left: ((time - range.start) / length * 100) + '%' }}>{Number(hour(time).slice(0, 2))}</span>)}</div>}
  </div>
}
