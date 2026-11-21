import { useEffect, useRef, useState, type FormEvent } from 'react'
import { AlertTriangle, CalendarCheck, Gauge, History, CalendarClock, Check, ChevronDown, ChevronRight, Clock3, Download, PencilLine, RefreshCw, Scissors, Sparkles, UserRoundCheck, Users } from 'lucide-react'
import { DAY, displayDate, displayTime, hour, minutes, skillLabel, span, total, type Assignment, type Block, type Candidate, type Employee, type Issue, type Language, type Task, type Workspace } from './domain'
import { feasibleAlternatives, planTask, type PlanResult } from './scheduler'
import { collisionPreview, collisions, dayModel, DayTimeline, FOCUS_MIN, recentUrgent, UrgentDots, type DayModel } from './Timeline'
import { AnalysisLoader, Avatar, Disclosure, Label, Notice, nameOf, roleOf, type Translate } from './ui'
import { issueText } from './Request'
import { calibrate, MIN_SAMPLES } from './estimates'
import { ExplainCard, SplitPlanner } from './AiTools'
import { Confetti } from './Copilot'
import { WeekHours, weekHours } from './Compliance'
import { DropNote, TaskToken, useAssignDrag, type AssignDrag, type DropTarget } from './dnd-assign'
import './dnd.css'

export const priorityName = (priority: Task['priority'], t: Translate) => ({ routine: t('Routine', '일반'), high: t('High', '높음'), urgent: t('Urgent', '긴급'), '': t('Unconfirmed', '미확인') })[priority]
export const factorName = (factor: string, t: Translate) => ({
  skill: t('Skill fit', '스킬 적합도'), experience: t('Relevant experience', '관련 경험'),
  buffer: t('Time after finish', '완료 후 여유 시간'), workload: t('Workload after assignment', '배정 후 업무량'),
  deadlines: t('Existing deadlines', '기존 마감 영향'), focus: t('Focus time', '집중 시간'), overload: t('Recent repeated overload', '최근 반복 과부하'),
})[factor] || factor
export function reasonText(issue: Issue, t: Translate, lang: Language) {
  const item = issue.detail.split(' ')[0]
  const label = item === 'staging' ? t('Staging', '스테이징') : issue.detail
  switch (issue.code) {
    case 'status': return issue.detail === 'leave' ? t('On leave in the source roster.', '원본 인원 명단에서 휴직 중입니다.') : t('Employment has ended in the source roster.', '원본 인원 명단에서 고용이 종료되었습니다.')
    case 'skill': return t('Required skill below threshold', '필수 스킬 기준 미달') + ' · ' + skillLabel(item, lang) + ' ' + issue.detail.split(' ').slice(1).join(' ')
    case 'access-unknown': return t(label + ' access requires verification', label + ' 권한 확인 필요')
    case 'access': return t(label + ' access missing', label + ' 권한 없음')
    case 'schedule': return t('Schedule requires verification', '일정 확인 필요') + ' · ' + issue.detail
    case 'focus': return t('Available time is split into windows that do not meet the focus requirement.', '빈 시간이 최소 집중 기준을 충족하지 않습니다.')
    case 'capacity': return t('Insufficient usable minutes before the deadline.', '마감 전 배정 가능한 시간이 부족합니다.')
    case 'dependency': return t('Prerequisite arrives too late.', '선행 조건 완료가 너무 늦습니다.') + ' ' + issue.detail
    default: return t('Policy is incomplete', '정책 정보가 부족합니다') + ' · ' + issue.detail
  }
}

export function Blocks({ blocks, lang }: { blocks: Candidate['blocks']; lang: Language }) {
  return <div className="block-chips">{blocks.map((block) => <span key={block.start}><CalendarClock size={14} />{displayDate(block.start, lang)} · {hour(block.start)}–{hour(block.end)}</span>)}</div>
}

export const timelineLabels = (t: Translate, task?: Task, lang: Language = 'en') => ({
  task: t('New ', '새 과제 ') + (task?.max ? minutes(task.max, lang) : '') + t(' task', ''),
  focus: t('Focus block', '집중 가능 시간'), gap: t('Short gap', '짧은 빈 시간'),
})
const hours = (value: number, lang: Language) => minutes(Math.round(value / 30) * 30, lang)

function FactorBars({ candidate, t, lang }: { candidate: Candidate; t: Translate; lang: Language }) {
  return <div className="factor-list">{candidate.factors.map((factor) => <div className="factor-line" key={factor.id}>
    <div><strong>{factorName(factor.id, t)}</strong><span>{lang === 'ko' ? factor.detailKo : factor.detail}</span></div>
    <div className="mini-progress"><span style={{ width: (factor.value * 100) + '%' }} /></div>
  </div>)}</div>
}

const correctionKinds = ['meeting', 'review', 'work', 'on-call', 'support', 'leave'] as const
function CorrectionDrawer({ open, person, model, t, lang, onSave, onClose }: {
  open: boolean; person: Employee; model: DayModel; t: Translate; lang: Language; onSave: (block: Block) => Promise<boolean>; onClose: () => void
}) {
  const [title, setTitle] = useState('')
  const [kind, setKind] = useState<Block['kind']>('meeting')
  const [start, setStart] = useState('10:00')
  const [end, setEnd] = useState('11:00')
  const [saving, setSaving] = useState(false)
  const toMinute = (value: string) => { const [h, m] = value.split(':').map(Number); return model.day + h * 60 + m }
  const invalid = !title.trim() || !start || !end || toMinute(end) <= toMinute(start)
  async function submit(event: FormEvent) {
    event.preventDefault()
    if (invalid || saving) return
    setSaving(true)
    const ok = await onSave({ id: crypto.randomUUID(), employeeId: person.id, title: title.trim(), kind, start: toMinute(start), end: toMinute(end) })
    setSaving(false)
    if (ok) { setTitle(''); onClose() }
  }
  const kindName = (item: Block['kind']) => ({ meeting: t('Meeting', '회의'), review: t('Code review', '코드 리뷰'), work: t('Untracked task', '누락된 업무'), 'on-call': t('On-call', '온콜'), support: t('Support', '지원'), leave: t('Time off', '휴가') } as Record<string, string>)[item]
  return <div className={'expand' + (open ? ' open' : '')} aria-hidden={!open}>
    <div><form className="correction" onSubmit={submit} onClick={(event) => event.stopPropagation()}>
      <div className="correction-head"><strong>{t('Correct ', '')}{nameOf(person, lang)}{t('’s day', '님의 일정 정정')}</strong><span>{displayDate(model.day, lang)}</span></div>
      <input aria-label={t('What is missing?', '누락된 일정')} placeholder={t('What’s missing? e.g. Vendor call', '누락된 일정 · 예: 협력사 통화')} value={title} onChange={(event) => setTitle(event.target.value)} tabIndex={open ? 0 : -1} />
      <div className="correction-row">
        <span className="select-wrap"><select aria-label={t('Type', '유형')} value={kind} onChange={(event) => setKind(event.target.value as Block['kind'])} tabIndex={open ? 0 : -1}>{correctionKinds.map((item) => <option key={item} value={item}>{kindName(item)}</option>)}</select><ChevronDown size={15} aria-hidden="true" /></span>
        <input type="time" aria-label={t('Start', '시작')} value={start} onChange={(event) => setStart(event.target.value)} tabIndex={open ? 0 : -1} />
        <span className="muted">–</span>
        <input type="time" aria-label={t('End', '종료')} value={end} onChange={(event) => setEnd(event.target.value)} tabIndex={open ? 0 : -1} />
      </div>
      <div className="correction-actions"><button type="button" className="btn ghost slim" onClick={onClose} tabIndex={open ? 0 : -1}>{t('Cancel', '취소')}</button><button type="submit" className="btn primary slim" disabled={invalid || saving} tabIndex={open ? 0 : -1}>{saving ? t('Updating…', '반영 중…') : t('Update schedule', '일정 반영')}</button></div>
    </form></div>
  </div>
}

type CardProps = {
  person: Employee; model: DayModel; task: Task; t: Translate; lang: Language; badge?: { label: string; tone: string }
  preview: { slots: { start: number; end: number }[]; tone: 'fit' | 'clash'; show: boolean }
  impact: { tone: 'fit' | 'gap' | 'risk'; text: string }; rationale: string; urgent: number; experience: string
  selected?: boolean; dimmed?: boolean; corrected?: boolean; selectable: boolean; employeeView: boolean; index: number; version: number
  onSelect: () => void; onHover: (on: boolean) => void; onCorrection: (block: Block) => Promise<boolean>; details?: React.ReactNode; week?: React.ReactNode
  drop?: ReturnType<AssignDrag['card']>; dropClass?: string; dropNote?: React.ReactNode
}
function CandidateCard({ person, model, task, t, lang, badge, preview, impact, rationale, urgent, experience, selected, dimmed, corrected, selectable, employeeView, index, version, onSelect, onHover, onCorrection, details, week, drop, dropClass = '', dropNote }: CardProps) {
  const [correcting, setCorrecting] = useState(false)
  const matched = task.required.map(({ id }) => ({ id, level: person.skills[id] || 0 }))
  const deadline = task.deadline ? hour(task.deadline) : ''
  return <article className={'cand' + (selected ? ' selected' : '') + (dimmed ? ' dimmed' : '') + (selectable ? '' : ' unselectable') + dropClass} style={{ '--i': index } as React.CSSProperties}
    {...drop} onMouseEnter={() => onHover(true)} onMouseLeave={() => onHover(false)} onFocus={() => onHover(true)} onBlur={() => onHover(false)}>
    <button className="cand-hit" aria-pressed={selectable ? !!selected : undefined} onClick={onSelect} aria-label={(selectable ? t('Select ', '선택 · ') : t('Preview ', '미리보기 · ')) + nameOf(person, lang)} />
    <div className="cand-identity">
      <Avatar person={person} />
      <div className="cand-name"><h3>{nameOf(person, lang)}</h3><p>{roleOf(person, lang)}</p></div>
      {badge && <Label tone={badge.tone}>{badge.label}</Label>}
    </div>
    {dropNote}
    <section className="cand-sec">
      <span className="cand-sec-label"><b>1</b>{t('Experience', '경험')}</span>
      <div className="cand-fit">
        <div className="skill-pills">{matched.map(({ id, level }) => <span key={id} className={'skill-pill' + (level >= (task.required.find((r) => r.id === id)?.level || 1) ? '' : ' short')}>{skillLabel(id, lang)}<b>{level}</b></span>)}</div>
        <UrgentDots count={urgent} label={t(urgent + ' urgent tasks in 30 days', '최근 30일 긴급 업무 ' + urgent + '건')} />
      </div>
      <p className="cand-exp"><History size={12} />{experience}<span> · {t(urgent + ' urgent in 30 days', '30일 내 긴급 ' + urgent + '건')}</span></p>
    </section>
    <section className="cand-sec">
      <span className="cand-sec-label"><b>2</b>{t('Real availability before ' + deadline, deadline + ' 전 실제 가용 시간')}</span>
      <div className="cand-readout">
        <span className="cand-stat"><strong className="tabular" key={version}>{hours(model.workable, lang)}</strong><small>{t('total free', '총 여유')}</small></span>
        <span className={'cand-stat ' + (model.longest >= FOCUS_MIN ? 'good' : 'warn')}><strong className="tabular" key={'l' + version}>{hours(model.longest, lang)}</strong><small>{t('longest unbroken', '최장 연속')}</small></span>
        {corrected && <Label tone="green"><RefreshCw size={11} />{t('Re-review updated', '재검토 반영')}</Label>}
      </div>
      <DayTimeline key={version} model={model} preview={preview.show ? preview.slots : []} tone={preview.tone} active={preview.show} labels={timelineLabels(t, task, lang)} deadlineLabel={deadline} />
    </section>
    <section className="cand-sec">
      <span className="cand-sec-label"><b>3</b>{t('Impact if assigned', '배정 시 영향')}</span>
      <div className={'impact-pill tone-' + impact.tone}>{impact.tone === 'fit' ? <Check size={14} /> : <AlertTriangle size={14} />}<span>{impact.text}</span></div>
      {week}
    </section>
    <div className="cand-foot">
      <p>{rationale}</p>
      <button className={'text-button' + (employeeView ? ' strong' : '')} onClick={(event) => { event.stopPropagation(); setCorrecting(!correcting) }} aria-expanded={correcting}><PencilLine size={13} />{t('Report missing task / Correct hours', '누락 업무 신고 · 시간 정정')}</button>
    </div>
    <CorrectionDrawer open={correcting} person={person} model={model} t={t} lang={lang} onSave={onCorrection} onClose={() => setCorrecting(false)} />
    {details}
  </article>
}

export type AnalysisState = { run: number; done: number; attempt: number; failed: boolean }
export type AiMode = 'off' | 'delay' | 'fail'
export const analysisSteps = (t: Translate) => [t('Extracting skills', '스킬 추출'), t('Mapping focus blocks', '집중 시간 분석'), t('Checking deadline impact', '마감 영향 확인')]

export function Compare({ task, plan, current, replacement, lang, t, selected, select, onEdit, onNext, onRetask, onSettings, onRefresh, stale, onVerify, onCorrection, corrected, analysis, aiMode, onAnalysisDone, onRetry, employeeView, setEmployeeView, llmFail = false, onUsePart }: {
  task: Task; plan: PlanResult; current: Workspace; replacement: boolean; lang: Language; t: Translate; selected: string
  select: (id: string) => void; onEdit: () => void; onNext: () => void; onRetask: (task: Task) => void; onSettings: () => void
  onRefresh: () => void; stale: boolean; onVerify: (personId: string) => void; onCorrection: (block: Block) => Promise<boolean>; corrected: string[]
  analysis: AnalysisState; aiMode: AiMode; onAnalysisDone: (failed: boolean) => void; onRetry: () => void
  employeeView: boolean; setEmployeeView: (on: boolean) => void; llmFail?: boolean; onUsePart: (part: Task) => void
}) {
  const [hovered, setHovered] = useState('')
  const [usualPreview, setUsualPreview] = useState(false)
  const [phase, setPhase] = useState(0)
  const timers = useRef<number[]>([])
  const running = analysis.run !== analysis.done
  useEffect(() => {
    if (!running) return
    const step = aiMode === 'delay' ? 1300 : 480
    setPhase(0)
    timers.current = [1, 2, 3].map((n) => window.setTimeout(() => n < 3 ? setPhase(n) : onAnalysisDone(aiMode === 'fail' && analysis.attempt === 0), step * n))
    return () => timers.current.forEach((id) => window.clearTimeout(id))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [analysis.run])

  const displayed = plan.ranked.slice(0, 3)
  const previous = plan.rejected.find((item) => item.employee.id === task.previousOwner)
  const chosen = displayed.find((candidate) => candidate.employee.id === selected)
  const deadline = task.deadline ? hour(task.deadline) : ''
  const effort = task.max || 0
  const labels = { recommended: { label: t('Recommended', '추천'), tone: 'focus' }, usual: { label: t('Usual assignee', '기존 담당자'), tone: 'neutral' } }
  const focusLabel = (candidate: Candidate, model: DayModel) => candidate.blocks.length === 1
    ? t('Fits one ' + hours(model.longest, lang) + ' focus block', hours(model.longest, lang) + ' 집중 블록에 배정')
    : t('Fits ' + hours(total(candidate.blocks), lang) + ' across ' + candidate.blocks.length + ' focus blocks', '집중 블록 ' + candidate.blocks.length + '개에 ' + hours(total(candidate.blocks), lang) + ' 배정')
  const deadlineText = (count: number) => count ? t('Pushes ' + count + ' deadline' + (count > 1 ? 's' : ''), '기존 마감 ' + count + '건 지연') : t('Zero deadline impact', '기존 마감 영향 없음')

  // The usual owner is shown for context but cannot take the task; computed once for the card and the drop state.
  const usual = previous ? (() => {
    const model = dayModel(previous.employee, current, task.deadline, replacement ? task.id : undefined)
    const slots = collisionPreview(model, effort)
    const hit = collisions(model, slots)
    const blockers = previous.issues.filter(({ code }) => code !== 'capacity' && code !== 'focus')
    const text = blockers.length ? reasonText(blockers[0], t, lang)
      : t('Only ' + hours(model.workable, lang) + ' free · ', hours(model.workable, lang) + '만 가능 · ') + (hit.deadlines ? deadlineText(hit.deadlines) : t('Collides with ' + hit.blocks.length + ' commitments', '일정 ' + hit.blocks.length + '건과 충돌'))
    return { model, slots, hit, text }
  })() : undefined
  // Drag-to-assign targets: the live preview comes from the same deterministic plan the cards show.
  const dropTargets: DropTarget[] = employeeView ? [] : [
    ...displayed.map((candidate) => {
      const week = weekHours(candidate.employee, current, total(candidate.blocks))
      const weekText = t('week ' + Math.round(week.total / 6) / 10 + 'h / 52h', '주 ' + Math.round(week.total / 6) / 10 + '시간 / 52시간')
      const ok = week.status !== 'over'
      return { id: candidate.employee.id, name: nameOf(candidate.employee, lang), ok,
        note: ok ? t('Done by ' + hour(candidate.finish) + ' · ' + candidate.blocks.length + ' block' + (candidate.blocks.length > 1 ? 's' : '') + ' · ' + hours(candidate.free, lang) + ' spare · ' + weekText, hour(candidate.finish) + ' 완료 · 블록 ' + candidate.blocks.length + '개 · 여유 ' + hours(candidate.free, lang) + ' · ' + weekText)
          : t('Over the 52h weekly limit', '주 52시간 한도 초과') + ' · ' + weekText }
    }),
    ...(previous && usual ? [{ id: previous.employee.id, name: nameOf(previous.employee, lang), ok: false, note: usual.text }] : []),
  ]
  const [confirmId, setConfirmId] = useState('')
  const confirmRef = useRef<HTMLButtonElement>(null)
  const drag = useAssignDrag({ targets: dropTargets, initial: selected, t, onDrop: (id) => { select(id); setConfirmId(id) } })
  useEffect(() => { if (confirmId) confirmRef.current?.focus({ preventScroll: true }) }, [confirmId])
  useEffect(() => { if (employeeView) { drag.cancel(false); setConfirmId('') } }, [employeeView]) // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { if (confirmId && selected !== confirmId) setConfirmId('') }, [selected]) // eslint-disable-line react-hooks/exhaustive-deps
  const confirming = !!confirmId && chosen?.employee.id === confirmId
  const dragging = drag.active
  const dropProps = (id: string) => ({ drop: drag.card(id), dropClass: drag.state(id), dropNote: <DropNote target={dropTargets.find((item) => item.id === id)} show={dragging} t={t} /> })

  if (running) return <div className="stack flow-step">
    <CompareHead task={task} t={t} lang={lang} onEdit={onEdit} employeeView={employeeView} setEmployeeView={setEmployeeView} />
    <AnalysisLoader steps={analysisSteps(t)} phase={phase} title={t('Finding the best fit…', '최적의 담당자를 찾는 중…')} cards={3} />
  </div>

  const alternatives = !displayed.length && !plan.issues.length ? [
    { id: 'split', icon: Scissors, label: t('Split task', '작업 분할'), task: { ...task, split: true, focus: Math.min(task.focus || 60, 30) } },
    { id: 'deadline', icon: CalendarClock, label: t('Adjust deadline', '마감 조정'), task: { ...task, deadline: task.deadline! + DAY } },
  ].map((item) => ({ ...item, fit: planTask(item.task, current, replacement ? task.id : undefined).ranked[0] })) : []

  return <div className="stack flow-step">
    <CompareHead task={task} t={t} lang={lang} onEdit={onEdit} employeeView={employeeView} setEmployeeView={setEmployeeView} />
    {analysis.failed && <div className="fallback-banner" role="status"><Sparkles size={16} /><div><strong>{t('AI analysis didn’t respond', 'AI 분석이 응답하지 않았습니다')}</strong><span>{t('Showing the rule-based comparison — same calendar data, deterministic ranking.', '규칙 기반 비교를 표시합니다 · 동일한 일정 데이터, 결정적 순위.')}</span></div><button className="btn secondary slim" onClick={onRetry}><RefreshCw size={14} />{t('Retry', '다시 시도')}</button></div>}
    {stale && <Notice><div className="notice-action">{t('The calendar changed after these plans were generated.', '이 계획을 계산한 후 캘린더가 변경되었습니다.')}<button className="text-button" onClick={onRefresh}>{t('Refresh plans', '계획 새로고침')}</button></div></Notice>}
    {plan.issues.length > 0 && <Notice tone="red"><ul>{plan.issues.map((id) => <li key={id}>{issueText(id, t)}</li>)}</ul>{plan.issues.some((id) => id.startsWith('policy')) && <button className="text-button" onClick={onSettings}>{t('Open policy settings', '정책 설정 열기')}</button>}</Notice>}
    {employeeView && <div className="view-note"><UserRoundCheck size={15} />{t('Employee view · teammates correct their own day. The lead sees the update instantly.', '팀원 화면 · 팀원이 직접 일정을 정정하면 리드에게 즉시 반영됩니다.')}</div>}

    {(displayed.length > 0 || previous) && <TimelineLegend t={t} />}
    {displayed.length > 0 && !employeeView && <TaskToken drag={drag} title={task.title} effort={task.max ? minutes(task.max, lang) : ''} due={task.deadline ? t('Due ', '마감 ') + hour(task.deadline) : ''} t={t} />}
    {(displayed.length > 0 || previous) && <div className={'cand-grid' + (dragging ? ' dnd-dragging' : '')}>
      {displayed.map((candidate, i) => {
        const model = dayModel(candidate.employee, current, task.deadline, replacement ? task.id : undefined)
        const reduced = candidate.impacts.filter((item) => item.after < item.before && item.before > 0)
        const isSelected = selected === candidate.employee.id
        const show = isSelected || hovered === candidate.employee.id || drag.over === candidate.employee.id
        const rationale = (candidate.rotation ? t('Moved up by urgent-work rotation. ', '긴급 업무 순환으로 순위 상승. ') : '') + t('Done by ' + hour(candidate.finish) + ' · keeps ' + hours(candidate.free, lang) + ' spare before the deadline.', hour(candidate.finish) + ' 완료 · 마감 전 ' + hours(candidate.free, lang) + ' 여유.')
        const exp = candidate.factors.find(({ id }) => id === 'experience')
        const experience = !exp || exp.missing ? t('No verified history yet', '검증된 이력 없음') : t(Math.round(exp.value * 5) + ' similar tasks in 12 months', '12개월 내 유사 과제 ' + Math.round(exp.value * 5) + '건')
        return <CandidateCard key={candidate.employee.id} index={i} experience={experience} person={candidate.employee} model={model} task={task} t={t} lang={lang} version={current.version}
          badge={i === 0 ? labels.recommended : undefined} urgent={candidate.urgentCount ?? 0}
          preview={{ slots: candidate.blocks, tone: 'fit', show }} impact={{ tone: reduced.length ? 'gap' : 'fit', text: focusLabel(candidate, model) + ' · ' + deadlineText(reduced.length) }}
          rationale={rationale} selected={isSelected} dimmed={!dragging && !!selected && !isSelected} corrected={corrected.includes(candidate.employee.id)} selectable={!employeeView} employeeView={employeeView}
          {...dropProps(candidate.employee.id)}
          onSelect={() => { if (dragging) { drag.drop(candidate.employee.id); return } if (!employeeView) select(candidate.employee.id) }} onHover={(on) => setHovered(on ? candidate.employee.id : '')} onCorrection={onCorrection}
          details={<Disclosure label={t('Why this match', '추천 이유')}><FactorBars candidate={candidate} t={t} lang={lang} /></Disclosure>}
          week={<WeekHours person={candidate.employee} workspace={current} add={total(candidate.blocks)} t={t} />} />
      })}
      {previous && usual && (() => {
        const { model, slots, hit, text } = usual
        return <CandidateCard key={previous.employee.id} index={displayed.length} person={previous.employee} model={model} task={task} t={t} lang={lang} version={current.version}
          badge={labels.usual} urgent={recentUrgent(previous.employee, current)} experience={t('Usual owner of this work', '이 업무의 기존 담당자')}
          preview={{ slots, tone: 'clash', show: usualPreview || hovered === previous.employee.id }} impact={{ tone: 'risk', text }}
          rationale={t('Usually owns this work, but the day is fragmented by ' + hit.blocks.map((block) => block.title).join(', ') + '.', '평소 담당자이지만 ' + hit.blocks.map((block) => block.title).join(', ') + ' 일정으로 시간이 나뉘어 있습니다.')}
          dimmed={!dragging && !!selected && !usualPreview} corrected={corrected.includes(previous.employee.id)} selectable={false} employeeView={employeeView}
          {...(employeeView ? {} : dropProps(previous.employee.id))}
          onSelect={() => { if (dragging) { drag.drop(previous.employee.id); return } setUsualPreview(!usualPreview) }} onHover={(on) => setHovered(on ? previous.employee.id : '')} onCorrection={onCorrection}
          week={<WeekHours person={previous.employee} workspace={current} t={t} />} />
      })()}
    </div>}

    {displayed.length > 0 && !employeeView && <ExplainCard task={task} plan={plan} lang={lang} t={t} simulateFailure={llmFail} />}
    <EstimateCheck task={task} t={t} lang={lang} onApply={onRetask} />

    {alternatives.length > 0 && <section className="pivot">
      <div className="pivot-head"><AlertTriangle size={18} /><div><h3>{t('Nobody fits this cleanly before ' + deadline, deadline + ' 전에 무리 없이 맡을 사람이 없습니다')}</h3><p>{t('Try one change — the timelines re-check instantly.', '한 가지를 바꿔 보세요 · 일정이 즉시 다시 계산됩니다.')}</p></div></div>
      <div className="pivot-actions">{alternatives.map(({ id, icon: Icon, label, task: revised, fit }) => <button key={id} className="pivot-pill" onClick={() => onRetask(revised)}>
        <Icon size={16} /><span><strong>{label}</strong><small>{id === 'split' ? t('Blocks of ' + minutes(revised.focus!, lang) + '+', minutes(revised.focus!, lang) + ' 이상 블록') : displayTime(revised.deadline!, lang)} · {fit ? t(nameOf(fit.employee, lang) + ' fits', nameOf(fit.employee, lang) + ' 가능') : t('still tight', '여전히 빠듯함')}</small></span><ChevronRight size={15} />
      </button>)}</div>
      <MoreAlternatives task={task} plan={plan} current={current} replacement={replacement} lang={lang} t={t} onRetask={onRetask} />
      <SplitPlanner task={task} workspace={current} lang={lang} t={t} simulateFailure={llmFail} onUse={onUsePart} />
    </section>}
    {displayed.length > 0 && !employeeView && (task.max || 0) >= 180 && <Disclosure className='ai-disclosure' label={<span className='disc-label'><Scissors size={14} />{t('Split into parts with AI', 'AI로 단계 나누기')}</span>}><SplitPlanner task={task} workspace={current} lang={lang} t={t} simulateFailure={llmFail} onUse={onUsePart} /></Disclosure>}

    {displayed.length > 0 && !employeeView && <div className={'decision-dock' + (chosen ? ' ready' : '') + (confirming ? ' dnd-confirm' : '')} role='region' aria-label={t('Decision', '결정')}>
      {confirming && chosen ? <><Avatar person={chosen.employee} size='small' /><div className='dock-text'><strong>{t('Assign to ' + nameOf(chosen.employee, lang) + '?', nameOf(chosen.employee, lang) + '에게 배정할까요?')}</strong><span>{t('Next you review it against the latest calendar — nothing is booked yet.', '다음 단계에서 최신 캘린더로 다시 확인합니다 · 아직 예약되지 않았습니다.')}</span></div>
        <div className='dnd-confirm-actions'><button className='btn ghost slim' onClick={() => setConfirmId('')}>{t('Cancel', '취소')}</button><button ref={confirmRef} className='btn primary' onClick={() => { setConfirmId(''); onNext() }}><Check size={16} />{t('Confirm', '확인')}</button></div></>
        : chosen ?<><Avatar person={chosen.employee} size='small' /><div className='dock-text'><strong>{nameOf(chosen.employee, lang)}</strong><span>{t('Done by ' + hour(chosen.finish) + ' · ' + chosen.blocks.length + ' focus block' + (chosen.blocks.length > 1 ? 's' : '') + ' · ' + hours(chosen.free, lang) + ' spare', hour(chosen.finish) + ' 완료 · 집중 블록 ' + chosen.blocks.length + '개 · 여유 ' + hours(chosen.free, lang))}</span></div></>
        : <div className='dock-text'><strong>{t('Select a candidate', '후보를 선택하세요')}</strong><span>{t('Nothing is booked until you approve.', '승인 전에는 예약되지 않습니다.')}</span></div>}
      {!confirming && <button className="btn primary lg" disabled={!chosen} onClick={onNext}>{t('Review & approve', '검토 후 승인')}<ChevronRight size={17} /></button>}
    </div>}

    {plan.rejected.length > 0 && <Disclosure className="exclusions" label={t('Not considered', '제외된 후보') + ' · ' + plan.rejected.length}>
      <div className="exclusion-list">{plan.rejected.map(({ employee, issues, available }) => <div className="excluded-row" key={employee.id}><Avatar person={employee} size="small" /><div><strong>{nameOf(employee, lang)}</strong><p>{issues.map((issue) => reasonText(issue, t, lang)).join(' · ')}{available > 0 && ' · ' + hours(available, lang) + t(' usable', ' 가능')}</p></div>{issues.some(({ code }) => code === 'access' || code === 'access-unknown' || code === 'schedule') && <button className="btn ghost slim" onClick={() => onVerify(employee.id)}>{t('Verify', '확인')}</button>}</div>)}</div>
    </Disclosure>}
  </div>
}

export function TimelineLegend({ t }: { t: Translate }) {
  return <div className="tl-legend" aria-label={t('Timeline legend', '타임라인 범례')}>
    <span><i className="sw focus" />{t('Focus block · 2h+ unbroken', '집중 블록 · 2시간+ 연속')}</span>
    <span><i className="sw gap" />{t('Short gap between meetings', '회의 사이 짧은 빈 시간')}</span>
    <span><i className="sw busy" />{t('Meeting · review · on-call', '회의 · 리뷰 · 온콜')}</span>
    <span><i className="sw task" />{t('New task preview', '새 업무 미리보기')}</span>
    <span><i className="sw deadline" />{t('Deadline', '마감')}</span>
    <span className="tl-hint">{t('Hover a card to preview where the task lands', '카드에 마우스를 올리면 배정 위치를 미리 봅니다')}</span>
  </div>
}

// Marks a task whose effort was already calibrated, so the check never compounds its own suggestion.
const CALIBRATED = '⟲ '
function EstimateCheck({ task, t, lang, onApply }: { task: Task; t: Translate; lang: Language; onApply: (task: Task) => void }) {
  const [hidden, setHidden] = useState(false)
  const result = calibrate(task)
  if (!result || hidden || !task.max) return null
  const max = task.max
  const applied = task.assumptions.some((item) => item.startsWith(CALIBRATED))
  const pct = Math.round((result.ratio - 1) * 100)
  const close = Math.abs(pct) < 4 || result.suggested === max
  const top = Math.max(...result.matches.map((item) => Math.max(item.estimate, item.actual)), 1)
  const signed = (pct > 0 ? '+' : '') + pct + '%'
  const apply = () => onApply({ ...task, max: result.suggested, min: Math.min(task.min || result.suggested, result.suggested),
    assumptions: [...task.assumptions, CALIBRATED + t('Effort calibrated from ' + result.matches.length + ' similar finished tasks (' + signed + ').', '유사 완료 과제 ' + result.matches.length + '건 기준으로 예상 시간 보정 (' + signed + ').')] })
  const state = !result.enough ? 'thin' : applied ? 'applied' : close ? 'match' : 'drift'
  return <section className={'estimate-check is-' + state}>
    <div className="estimate-head">
      <span className="card-icon tone-violet"><Gauge size={16} /></span>
      <div><h3>{t('Estimate check', '예상 시간 검증')}</h3>
        <p>{t('AI drafts the effort. Flow checks it against how long similar finished work really took.', 'AI가 예상 시간을 작성하면 Flow가 유사 완료 업무의 실제 소요 시간과 비교합니다.')}</p></div>
      {state !== 'drift' && <Label tone={state === 'thin' ? 'neutral' : 'green'}>{state === 'thin' ? t('Limited history', '이력 부족') : state === 'applied' ? t('Calibrated', '보정됨') : t('On track', '정상')}</Label>}
    </div>
    <div className="estimate-verdict">
      <span className="estimate-num"><small>{applied ? t('Calibrated estimate', '보정된 예상') : t('Current estimate', '현재 예상')}</small><strong>{minutes(max, lang)}</strong></span>
      {state === 'drift' && <><ChevronRight size={18} className="estimate-arrow" />
        <span className="estimate-num"><small>{t('Similar work ran ' + signed, '유사 업무 실제 ' + signed)}</small><strong className={pct > 0 ? 'text-gap' : 'text-focus'}>{minutes(result.suggested, lang)}</strong></span></>}
      <p className="estimate-note">{state === 'thin' ? t('Only ' + result.matches.length + ' similar finished task' + (result.matches.length === 1 ? '' : 's') + ' — the lead’s estimate is used as-is.', '유사 완료 과제가 ' + result.matches.length + '건뿐이라 리드의 예상치를 그대로 사용합니다.')
        : state === 'applied' ? t('Candidates were re-checked with the calibrated effort.', '보정된 시간으로 후보를 다시 계산했습니다.')
          : state === 'match' ? t('Matches ' + result.matches.length + ' similar finished tasks (' + signed + ').', '유사 완료 과제 ' + result.matches.length + '건과 일치합니다 (' + signed + ').')
            : t(result.withinTen + ' of ' + result.matches.length + ' similar tasks landed within ±10%. Using history avoids a plan that overruns.', '유사 과제 ' + result.matches.length + '건 중 ' + result.withinTen + '건이 ±10% 이내였습니다. 이력을 반영하면 계획 초과를 줄일 수 있습니다.')}</p>
      {state === 'drift' && <div className="estimate-actions"><button className="btn primary slim" onClick={apply}>{t('Use ' + minutes(result.suggested, lang), minutes(result.suggested, lang) + ' 적용')}</button><button className="btn ghost slim" onClick={() => setHidden(true)}>{t('Keep ' + minutes(max, lang), minutes(max, lang) + ' 유지')}</button></div>}
    </div>
    {result.matches.length > 0 && <Disclosure label={t('Similar finished tasks · ' + result.matches.length, '유사 완료 과제 · ' + result.matches.length + '건')}>
      <ul className="estimate-bars">{result.matches.slice(0, 6).map((item) => <li key={item.id}>
        <span className="eb-title">{lang === 'ko' ? item.titleKo : item.title}<small>{t(item.daysAgo + ' days ago', item.daysAgo + '일 전')}</small></span>
        <span className="eb-track" aria-hidden="true"><i className="eb-est" style={{ width: item.estimate / top * 100 + '%' }} /><i className={'eb-act' + (item.actual > item.estimate * 1.1 ? ' over' : '')} style={{ width: item.actual / top * 100 + '%' }} /></span>
        <span className="eb-val tabular">{minutes(item.estimate, lang)} → <b>{minutes(item.actual, lang)}</b></span>
      </li>)}</ul>
      <p className="estimate-foot"><span className="eb-key est" />{t('Estimated', '예상')}<span className="eb-key act" />{t('Actual', '실제')} · {t('Rows come from closed issues joined with the calendar time their blocks used; each approved assignment adds one when it closes.', '완료 이슈와 실제 사용한 캘린더 시간을 결합한 기록이며, 승인된 배정이 완료될 때마다 추가됩니다.')}</p>
    </Disclosure>}
  </section>
}

function CompareHead({ task, t, lang, onEdit, employeeView, setEmployeeView }: { task: Task; t: Translate; lang: Language; onEdit: () => void; employeeView: boolean; setEmployeeView: (on: boolean) => void }) {
  return <div className="compare-head">
    <div><h2>{task.title}</h2><div className="meta-chips">
      {task.priority === 'urgent' && <span className="meta-chip risk">{priorityName(task.priority, t)}</span>}
      {task.max && <span className="meta-chip"><Clock3 size={13} />{minutes(task.max, lang)}</span>}
      {task.deadline && <span className="meta-chip"><CalendarClock size={13} />{t('Due ', '마감 ') + hour(task.deadline)}</span>}
    </div></div>
    <div className="compare-tools">
      <div className="segmented" role="group" aria-label={t('Perspective', '보기')}><button aria-pressed={!employeeView} onClick={() => setEmployeeView(false)}><Users size={13} />{t('Lead', '리드')}</button><button aria-pressed={employeeView} onClick={() => setEmployeeView(true)}><UserRoundCheck size={13} />{t('Employee', '팀원')}</button></div>
      <button className="btn ghost slim" onClick={onEdit}><PencilLine size={14} />{t('Edit', '수정')}</button>
    </div>
  </div>
}

function ImpactStrip({ candidate, t, lang }: { candidate: Candidate; t: Translate; lang: Language }) {
  const shifted = candidate.impacts.filter((item) => item.after < item.before && item.before > 0)
  return <div className="impact-strip">
    <div className={'impact-strip-main ' + (shifted.length ? 'gap' : 'fit')}>{shifted.length ? <AlertTriangle size={16} /> : <Check size={16} />}
      <strong>{shifted.length ? t(shifted.length + ' deadline buffer' + (shifted.length > 1 ? 's' : '') + ' shrink', '마감 여유 ' + shifted.length + '건 감소') : t('No deadlines affected', '영향받는 마감 없음')}</strong>
      {shifted.length > 0 && <span>{shifted.map((item) => item.title + ' −' + minutes(item.before - item.after, lang)).join(' · ')}</span>}
    </div>
    <span className="impact-strip-meta"><Avatar person={candidate.employee} size="small" />{nameOf(candidate.employee, lang)} · {candidate.blocks.map((block) => hour(block.start) + '–' + hour(block.end)).join(', ')}</span>
    <span className="impact-strip-meta muted">{t('You make the final call — nothing is booked until you approve.', '최종 결정은 리드가 합니다 · 승인 전에는 예약되지 않습니다.')}</span>
  </div>
}

function MoreAlternatives({ task, plan, current, replacement, lang, t, onRetask }: { task: Task; plan: PlanResult; current: Workspace; replacement: boolean; lang: Language; t: Translate; onRetask: (task: Task) => void }) {
  const [open, setOpen] = useState(false)
  const items = open ? feasibleAlternatives(task, current, replacement ? task.id : undefined).filter(({ id }) => id === 'scope' || id.startsWith('access') || id.startsWith('work')) : []
  return <Disclosure label={t('More options', '다른 방법')} onToggle={setOpen}>
    {items.map(({ id, task: revised, candidate }) => {
      const [kind, target] = id.split(':')
      const label = kind === 'scope' ? t('Smaller scope', '범위 축소') + ' · ' + minutes(revised.max!, lang) : kind === 'access' ? t('Verify access', '권한 확인') + ' · ' + (plan.rejected.find((item) => item.employee.id === target) ? nameOf(plan.rejected.find((item) => item.employee.id === target)!.employee, lang) : target) : t('Move existing work', '기존 작업 이동') + ' · ' + target
      return <div className="result-row" key={id}><div><strong>{label}</strong><p>{candidate ? nameOf(candidate.employee, lang) + ' · ' + displayTime(candidate.finish, lang) : t('Still blocked in this simulation.', '시뮬레이션에서도 배정할 수 없습니다.')}</p></div>{candidate && kind === 'scope' && <button className="btn secondary slim" onClick={() => onRetask(revised)}>{t('Apply', '적용')}</button>}{kind !== 'scope' && <Label tone="peach">{t('Lead confirmation', '리드 확인')}</Label>}</div>
    })}
  </Disclosure>
}

export function Approval({ task, candidate, replacement, confirmed, confirmedEmployee, stale, busy, workspace, onApprove, onCompare, onCalendar, onDownload, onNew, t, lang }: {
  task: Task; candidate?: Candidate; replacement: boolean; confirmed?: Assignment; confirmedEmployee?: Employee; stale: string[] | null; busy: boolean; workspace: Workspace
  onApprove: () => void; onCompare: () => void; onCalendar: () => void; onDownload: () => void; onNew: () => void; t: Translate; lang: Language
}) {
  const booked = confirmed || candidate
  const person = confirmedEmployee || candidate?.employee
  const review = confirmed?.task || task
  if (!booked || !person) return <Notice>{t('Pick a candidate first.', '먼저 후보를 선택하세요.')}</Notice>
  const model = dayModel(person, workspace, review.deadline, review.id)
  return <div className="stack flow-step">
    {confirmed && <Confetti key={confirmed.task.id} />}
    <section className={'approve-card' + (confirmed ? ' done' : '')}>
      {confirmed ? <div className="celebrate">
        <svg className="check-draw" viewBox="0 0 52 52" aria-hidden="true"><circle cx="26" cy="26" r="23" /><path d="M15 27.5 22.5 35 37.5 18.5" /></svg>
        <div><h2>{t('Assigned to ', '')}{nameOf(person, lang)}{t('', '님에게 배정 완료')}</h2><p>{t(booked.blocks.length + ' focus block' + (booked.blocks.length > 1 ? 's' : '') + ' locked on the team calendar.', '집중 블록 ' + booked.blocks.length + '개가 팀 캘린더에 확정되었습니다.')}</p></div>
      </div> : <div className="approve-head"><span className="eyebrow">{replacement ? t('Replacement', '재배정') : t('Final check', '최종 확인')}</span><h2>{review.title}</h2></div>}
      <div className="approve-person"><Avatar person={person} /><div><h3>{nameOf(person, lang)}</h3><p>{roleOf(person, lang)}</p></div>
        <div className="meta-chips"><span className="meta-chip"><Clock3 size={13} />{minutes(total(booked.blocks), lang)}</span><span className="meta-chip"><CalendarCheck size={13} />{t('Done by ', '완료 ') + hour(booked.blocks.at(-1)!.end)}</span></div></div>
      <DayTimeline model={model} preview={booked.blocks.map(({ start, end }) => span(start, end))} tone="fit" active locked={!!confirmed} labels={timelineLabels(t, review, lang)} deadlineLabel={review.deadline ? hour(review.deadline) : ''} />
      {stale && <Notice tone="red">{t('This plan changed on the latest calendar. Refresh the comparison and confirm a fresh set of blocks.', '최신 캘린더에서 계획이 변경되었습니다. 후보를 다시 비교하고 새 블록을 확인하세요.')}{stale.length > 0 && <p>{t('Conflicting commitments', '겹치는 일정')} · {stale.join(' · ')}</p>}</Notice>}
      {replacement && !confirmed && !stale && <Notice tone="violet">{t('The original booking remains visible until you confirm the replacement.', '교체를 확정할 때까지 기존 예약이 유지됩니다.')}</Notice>}
      {!confirmed && candidate && <ImpactStrip candidate={candidate} t={t} lang={lang} />}
      <div className="actions">{confirmed
        ? <><button className="btn ghost" onClick={onDownload}><Download size={16} />{t('Download .ics', '.ics 다운로드')}</button><button className="btn secondary" onClick={onCalendar}><CalendarCheck size={16} />{t('View schedule', '일정 보기')}</button><button className="btn primary" onClick={onNew}>{t('New urgent task', '새 긴급 업무')}</button></>
        : <><button className="btn ghost" onClick={onCompare}>{stale ? t('Refresh comparison', '비교 새로고침') : t('Back', '이전')}</button><button className="btn primary lg" disabled={!candidate || !!stale || busy} onClick={onApprove}><Check size={17} />{busy ? t('Approving…', '승인 중…') : replacement ? t('Approve replacement', '재배정 승인') : t('Approve assignment', '배정 승인')}</button></>}</div>
    </section>
  </div>
}
