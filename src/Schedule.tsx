import { useState } from 'react'
import { AlertTriangle, Briefcase, CalendarDays, ChevronLeft, ChevronRight, Clock3, Gauge, History, Plus, ShieldCheck, UserRound, Zap } from 'lucide-react'
import { Blocks, factorName } from './Compare'
import { DAY, dayOf, dateInput, displayDate, displayTime, fromInput, hour, intersects, minutes, span, type Assignment, type Block, type Employee, type Language, type Workspace } from './domain'
import { calendarOverlaps, effectivePerson, workload } from './scheduler'
import { SelfService } from './People'
import { MyData } from './MyData'
import { ScheduleFromMessage } from './AiTools'
import { existingTasks } from './seed'
import { Avatar, EmptyState, employmentStatus, Field, Label, Meter, Notice, PanelTitle, Select, nameOf, roleOf, useCountUp, type Translate } from './ui'

export function kindLabel(kind: Block['kind'], t: Translate) {
  return { work: t('Project work', '프로젝트 업무'), meeting: t('Meeting', '회의'), review: t('Code review', '코드 리뷰'), support: t('Support', '지원'), 'on-call': t('On-call', '온콜'), leave: t('Leave', '휴가'), reserve: t('Reserved', '예비 시간'), assignment: t('Assignment', '배정') }[kind]
}
type ScheduleProps = { workspace: Workspace; people: Employee[]; lang: Language; t: Translate; onEdit: (record: Assignment) => void; onCommitment: (personId?: string, block?: Block) => void }
export function Calendar({ workspace, people, lang, t, onEdit, onCommitment, onLog }: ScheduleProps & { onLog: () => void }) {
  const [day, setDay] = useState(dayOf(workspace.now))
  const [personFilter, setPersonFilter] = useState('')
  const [allHours, setAllHours] = useState(false)
  const displayed = people.filter((person) => !personFilter || person.id === personFilter)
  const dailyBlocks = workspace.blocks.filter((block) => intersects(block, span(day, day + DAY)))
  const from = allHours ? 0 : 8 * 60
  const to = allHours ? DAY : 19 * 60
  const range = to - from
  const marks = allHours ? Array.from({ length: 13 }, (_, i) => i * 2) : Array.from({ length: 12 }, (_, i) => i + 8)
  const conflicts = displayed.flatMap((person) => calendarOverlaps(dailyBlocks.filter((block) => block.employeeId === person.id)))
  const assignments = workspace.assignments.filter((item) => people.some(({ id }) => id === item.employeeId))
    .filter((item) => !personFilter || item.employeeId === personFilter)
  return <div className="stack page-stack">
    <section className="panel"><PanelTitle icon={CalendarDays} title={t('Team calendar', '팀 캘린더')} subtitle={t('Shared work blocks and commitments · Asia/Seoul', '공유 작업 블록 및 기존 일정 · Asia/Seoul')} actions={<button className="btn primary slim" onClick={() => onCommitment(personFilter || undefined)}><Plus size={16} />{t('Add commitment', '일정 추가')}</button>} />
      <div className="calendar-controls"><div className="day-switch"><button className="icon-button" aria-label={t('Previous day', '전날')} onClick={() => setDay(day - DAY)}><ChevronLeft size={19} /></button><strong>{displayDate(day, lang, true)}</strong><button className="icon-button" aria-label={t('Next day', '다음 날')} onClick={() => setDay(day + DAY)}><ChevronRight size={19} /></button><button className="btn secondary slim" onClick={() => setDay(dayOf(workspace.now))}>{t('Workspace day', '현재 기준일')}</button><button className={'btn secondary slim ' + (allHours ? 'chosen' : '')} aria-pressed={allHours} onClick={() => setAllHours(!allHours)}>{t('24 hours', '24시간')}</button></div><Select aria-label={t('Filter team member', '팀원 필터')} value={personFilter} onChange={(event) => { const id = event.target.value; setPersonFilter(id); if (people.find((person) => person.id === id)?.source?.shift === 'Night Shift') setAllHours(true) }}><option value="">{t('All team members', '모든 팀원')}</option>{people.map((person) => <option value={person.id} key={person.id}>{nameOf(person, lang)}</option>)}</Select></div>
      <div className="timeline-scroll"><div className="timeline">
        <div className="timeline-header"><span>{t('Team member', '팀원')}</span><div>{marks.map((n) => <span key={n} style={{ left: ((n * 60 - from) / range * 100) + '%' }}>{n}:00</span>)}</div></div>
        {displayed.map((person) => {
          const own = dailyBlocks.filter((block) => block.employeeId === person.id)
          const recurring = [
            ...(workspace.policy.breaks || []).map((block) => ({ start: day + block.start, end: day + block.end, label: t('Break', '휴식') })),
            ...((new Date((day + 540) * 60000).getUTCDay() === workspace.policy.reserveDay ? workspace.policy.reserve : []) || []).map((block) => ({ start: day + block.start, end: day + block.end, label: t('Reserve', '예비') })),
          ]
          return <div className="timeline-row" key={person.id}><div className="row-person"><Avatar person={person} size="small" /><span>{nameOf(person, lang)}{person.status && person.status !== 'active' && <small className="block text-[10px] font-normal text-slate-500">{employmentStatus(person, t)}</small>}</span></div>
            <div className="timeline-lane" style={{ backgroundSize: (100 / (marks.length - 1)) + '% 100%', minHeight: own.some((block, i) => own.slice(0, i).some((other) => intersects(block, other))) ? 66 : undefined }}>
              {recurring.map((block) => <div key={block.start + block.label} className="timeline-protect" title={block.label} style={{ left: ((block.start - day - from) / range * 100) + '%', width: ((block.end - block.start) / range * 100) + '%' }} />)}
              {own.filter((block) => intersects(block, span(day + from, day + to))).map((block, i) => {
                const start = Math.max(from, block.start - day)
                const end = Math.min(to, block.end - day)
                const assignment = block.kind === 'assignment' ? assignments.find((record) => record.task.id === block.taskId) : undefined
                return <button key={block.id} className={'timeline-block block-' + block.kind + (assignment?.pending ? ' pending' : '')} style={{ left: ((start - from) / range * 100) + '%', width: ((end - start) / range * 100) + '%', top: own.slice(0, i).some((other) => intersects(block, other)) ? 32 : 8 }} title={block.title + ' · ' + hour(block.start) + '–' + hour(block.end)} onClick={() => assignment ? onEdit(assignment) : onCommitment(person.id, block)}>{block.title}</button>
              })}
            </div>
          </div>
        })}
      </div></div>
      <div className="calendar-legend">{(['assignment', 'work', 'meeting', 'review', 'support', 'on-call', 'leave', 'reserve'] as const).map((kind) => <span key={kind}><i className={'block-' + kind} />{kindLabel(kind, t)}</span>)}</div>
    </section>
    {conflicts.length > 0 && <Notice><strong>{t('Overlapping commitments', '일정 중복')}</strong><ul>{conflicts.map(([a, b]) => <li key={a.id + b.id}>{a.title} · {b.title}</li>)}</ul></Notice>}
    <section className="panel"><PanelTitle icon={History} title={t('Assignment history', '배정 기록')} subtitle={t('Confirmed assignments and review requests stay in this workspace.', '확정된 배정과 검토 요청이 이 워크스페이스에 보관됩니다.')} actions={<button className="btn secondary slim" onClick={onLog}>{t('Open work log', '업무 기록 열기')}</button>} />
      <div className="panel-body stack">{assignments.length ? assignments.map((record) => <div className="result-row" key={record.task.id}><div><strong>{record.task.title}</strong><p>{nameOf(people.find(({ id }) => id === record.employeeId)!, lang)} · {record.task.deadline && displayTime(record.task.deadline, lang)}</p></div><Label tone={record.pending ? 'peach' : 'green'}>{record.pending ? t('Needs review', '검토 필요') : t('Confirmed', '확정')}</Label><button className="btn secondary slim" onClick={() => onEdit(record)}>{t('Details', '세부 정보')}</button></div>) : <p className="muted">{t('Confirmed assignments will appear here.', '확정된 배정이 여기에 표시됩니다.')}</p>}</div>
    </section>
  </div>
}

// Numbers in the employee hero count up like the dashboard KPIs.
function Count({ value }: { value: number }) { return <>{Math.round(useCountUp(value, 900))}</> }

export function EmployeeView({ workspace, people, lang, t, personId, setPerson, onEdit, onCommitment, onSelfSave, onAddBlocks, llmFail = false }: ScheduleProps & { personId: string; setPerson: (id: string) => void; onAddBlocks: (blocks: Block[]) => void; llmFail?: boolean; onSelfSave: (id: string, skills: Employee['skills'], hours: Employee['hours']) => void }) {
  const person = people.find(({ id }) => id === personId) || people[0]
  const assignments = workspace.assignments.filter((record) => record.employeeId === person.id)
  const upcoming = workspace.blocks.filter((block) => block.employeeId === person.id && block.end > workspace.now).sort((a, b) => a.start - b.start).slice(0, 14)
  const load = workload(person, workspace)
  const threshold = workspace.policy.overload || .9
  const next = upcoming[0]
  const recentUrgent = (effectivePerson(person, workspace).urgent || []).filter((at) => at > workspace.now - 30 * DAY).length
  const pending = assignments.filter((record) => record.pending).length
  const days = [...new Set(upcoming.map((block) => dayOf(block.start)))]
  const today = dayOf(workspace.now)
  const dayName = (day: number) => day === today ? t('Today', '오늘') : day === today + DAY ? t('Tomorrow', '내일') : displayDate(day, lang, true)
  const jumpTo = (id: string) => document.getElementById(id)?.scrollIntoView({ behavior: 'smooth', block: 'start' })
  return <div className="stack page-stack ev">
    <section className="ev-hero">
      <div className="ev-hero-top">
        <span className="ev-eyebrow"><UserRound size={14} />{t('Employee view', '팀원 화면')} · {t('what this person sees', '팀원 본인에게 보이는 화면')}</span>
        <Select aria-label={t('View as employee', '팀원 선택')} value={person.id} onChange={(event) => setPerson(event.target.value)}>{people.map((employee) => <option key={employee.id} value={employee.id}>{nameOf(employee, lang)}</option>)}</Select>
      </div>
      <div className="ev-id">
        <Avatar person={person} size="xl" />
        <div>
          <h1>{t('Hi, ', '안녕하세요, ')}{nameOf(person, lang)}{t('', '님')}</h1>
          <p>{roleOf(person, lang)}{person.source?.department ? ' · ' + person.source.department : ''}{person.source?.shift ? ' · ' + person.source.shift : ''}</p>
        </div>
        {person.status && <Label tone={person.status === 'active' ? 'green' : 'peach'}>{employmentStatus(person, t)}</Label>}
      </div>
      <div className="ev-stats">
        <div className="ev-stat"><span className="ev-stat-label"><Gauge size={14} />{t('This week', '이번 주')}</span><strong><Count value={Math.round(load.ratio * 100)} /><small>%</small></strong><Meter ratio={load.ratio} hot={threshold} /><small>{minutes(load.used, lang)} / {minutes(load.regular, lang)}</small></div>
        <button className="ev-stat" onClick={() => jumpTo('ev-assignments')}><span className="ev-stat-label"><Briefcase size={14} />{t('Assignments', '배정')}</span><strong><Count value={assignments.length} /></strong><small>{pending ? t(pending + ' in review', '검토 중 ' + pending + '건') : t('All confirmed', '모두 확정')}</small></button>
        <button className="ev-stat" onClick={() => jumpTo('ev-agenda')}><span className="ev-stat-label"><Clock3 size={14} />{t('Up next', '다음 일정')}</span><strong className="ev-stat-text">{next ? next.title : t('Nothing scheduled', '일정 없음')}</strong><small>{next ? dayName(dayOf(next.start)) + ' · ' + hour(next.start) : '—'}</small></button>
        <div className="ev-stat"><span className="ev-stat-label"><Zap size={14} />{t('Urgent, 30 days', '최근 30일 긴급')}</span><strong><Count value={recentUrgent} /></strong><small>{t('Fewer goes first in rotation', '적은 사람부터 순환 배정')}</small></div>
      </div>
    </section>

    <div className="ev-grid">
      <div className="stack ev-main">
        <section className="panel" id="ev-assignments"><PanelTitle icon={Briefcase} title={t('My assignments', '내 배정')} subtitle={t('Booked by your lead. Ask for a review if something looks wrong.', '리드가 배정한 업무입니다. 문제가 있으면 검토를 요청하세요.')} />
          <div className="panel-body stack">{assignments.length ? assignments.map((record) => <article className={'ev-task' + (record.pending ? ' pending' : '')} key={record.task.id}>
            <div className="ev-task-head">
              <div><strong>{record.task.title}</strong><p>{record.task.deadline ? t('Due ', '마감 ') + displayTime(record.task.deadline, lang) : t('No deadline', '마감 없음')} · {record.reason === 'Urgent-work rotation' ? t('Urgent-work rotation', '긴급 업무 순환') : t('Calendar fit', '일정 적합도')}</p></div>
              <Label tone={record.pending ? 'peach' : 'green'}>{record.pending ? t('Needs review', '검토 필요') : t('Confirmed', '확정')}</Label>
            </div>
            <Blocks blocks={record.blocks} lang={lang} />
            <div className="ev-task-foot"><span className="muted">{t('Fit score', '적합도')} {record.score.toFixed(0)} / 100</span><button className="btn secondary slim" onClick={() => onEdit(record)}>{t('Details or request review', '상세 보기 · 검토 요청')}<ChevronRight size={14} /></button></div>
          </article>) : <EmptyState icon={Briefcase} title={t('No assignments yet', '배정된 업무가 없습니다')}><p className="muted">{t('Urgent work your lead approves for you shows up here.', '리드가 승인한 긴급 업무가 여기에 표시됩니다.')}</p></EmptyState>}</div>
        </section>

        <section className="panel" id="ev-agenda"><PanelTitle icon={CalendarDays} title={t('My agenda', '내 일정')} subtitle={t('Next commitments on the shared calendar · KST', '공유 캘린더의 다음 일정 · KST')} actions={<button className="btn secondary slim" onClick={() => onCommitment(person.id)}><Plus size={15} />{t('Report commitment', '누락 일정 신고')}</button>} />
          <div className="panel-body">{upcoming.length ? <div className="ev-agenda">{days.map((day) => <div className="ev-day" key={day}>
            <h4>{dayName(day)}</h4>
            <ul>{upcoming.filter((block) => dayOf(block.start) === day).map((block) => <li key={block.id} className={'ev-item k-' + block.kind}>
              <span className="ev-time">{hour(block.start)}<small>{hour(block.end)}</small></span>
              <span className="ev-bar" aria-hidden="true" />
              <span className="ev-what"><strong>{block.title}</strong><small>{kindLabel(block.kind, t)} · {minutes(block.end - block.start, lang)}</small></span>
            </li>)}</ul>
          </div>)}</div> : <EmptyState icon={CalendarDays} title={t('No upcoming commitments', '예정된 일정이 없습니다')} />}</div>
        </section>
      </div>

      <aside className="stack ev-side">
        <ScheduleFromMessage key={'msg:' + person.id} person={person} workspace={workspace} lang={lang} t={t} simulateFailure={llmFail} onAdd={onAddBlocks} />
        <div className="ev-promise">
          <ShieldCheck size={18} aria-hidden="true" />
          <div><strong>{t('Your data is used for one thing', '내 정보는 한 가지 목적으로만 사용됩니다')}</strong>
            <p>{t('Fair, sustainable work assignment. Never performance reviews, rankings or activity monitoring.', '공정하고 지속 가능한 업무 배분. 인사 평가, 순위, 활동 감시에는 사용하지 않습니다.')}</p>
            <button className="text-button" onClick={() => jumpTo('self-service')}>{t('Check and correct my details', '내 정보 확인 및 정정')}<ChevronRight size={13} /></button></div>
        </div>
      </aside>
    </div>

    <div className="ev-data">
      <MyData key={'data:' + person.id} person={person} workspace={workspace} lang={lang} t={t} onCorrect={() => jumpTo('self-service')} />
      <div id="self-service" className="scroll-target"><SelfService key={person.id + ':' + workspace.version} person={person} workspace={workspace} people={people} lang={lang} t={t} save={(skills, hours) => onSelfSave(person.id, skills, hours)} /></div>
    </div>
  </div>
}

export function CommitmentForm({ personId, people, workspace, block, lang, t, save, remove, employee }: {
  personId?: string; people: Employee[]; workspace: Workspace; block?: Block; lang: Language; t: Translate; save: (result: Block) => void; remove: () => void; employee: boolean;
}) {
  const [person, setPerson] = useState(block?.employeeId || personId || people[0].id)
  const [title, setTitle] = useState(block?.title || '')
  const [kind, setKind] = useState<Block['kind']>(block?.kind || 'meeting')
  const [start, setStart] = useState(dateInput(block?.start ?? workspace.now))
  const [end, setEnd] = useState(dateInput(block?.end ?? workspace.now + 30))
  const [taskId, setTask] = useState(block?.taskId || '')
  const startTime = fromInput(start)
  const endTime = fromInput(end)
  return <form className="stack" onSubmit={(event) => {
    event.preventDefault()
    if (startTime === null || endTime === null || endTime <= startTime || !title.trim()) return
    save({ id: block?.id || crypto.randomUUID(), employeeId: person, title: title.trim(), kind, start: startTime, end: endTime, taskId: kind === 'work' && taskId ? taskId : undefined })
  }}>
    <Field label={t('Team member', '팀원')}><Select value={person} disabled={employee} onChange={(event) => { setPerson(event.target.value); setTask('') }}>{people.map((item) => <option value={item.id} key={item.id}>{nameOf(item, lang)}</option>)}</Select></Field>
    <Field label={t('Commitment name', '일정 이름')}><input value={title} required onChange={(event) => setTitle(event.target.value)} /></Field>
    <Field label={t('Type', '유형')}><Select value={kind} onChange={(event) => setKind(event.target.value as Block['kind'])}>{(['meeting', 'work', 'review', 'support', 'on-call', 'leave', 'reserve'] as const).map((item) => <option key={item} value={item}>{kindLabel(item, t)}</option>)}</Select></Field>
    {kind === 'work' && !employee && <Field label={t('Link to active work', '진행 중인 작업 연결')}><Select value={taskId} onChange={(event) => setTask(event.target.value)}><option value="">{t('No linked task', '연결된 과제 없음')}</option>{existingTasks.filter((item) => item.employeeId === person).map((item) => <option key={item.id} value={item.id}>{item.title}</option>)}</Select></Field>}
    <div className="form-grid"><Field label={t('Start · KST', '시작 · KST')}><input type="datetime-local" required value={start} onChange={(event) => setStart(event.target.value)} /></Field><Field label={t('End · KST', '종료 · KST')}><input type="datetime-local" required value={end} onChange={(event) => setEnd(event.target.value)} /></Field></div>
    {startTime !== null && endTime !== null && endTime <= startTime && <Notice tone="red">{t('End time must be after start time.', '종료 시간이 시작 시간보다 늦어야 합니다.')}</Notice>}
    <div className="actions">{block && !employee && <button className="btn secondary danger" type="button" onClick={remove}>{t('Remove commitment', '일정 삭제')}</button>}<button className="btn primary" type="submit">{employee ? t('Report commitment', '일정 신고') : t('Save commitment', '일정 저장')}</button></div>
  </form>
}

export function AssignmentDetails({ record, person, lang, t, employee, replace, update, propose }: {
  record: Assignment; person: Employee; lang: Language; t: Translate; employee: boolean; replace: () => void;
  update: (note: string, effort: number | null) => void; propose: (task: Assignment['task']) => void;
}) {
  const [note, setNote] = useState('')
  const [effort, setEffort] = useState('')
  const [deadline, setDeadline] = useState(dateInput(record.proposed?.deadline ?? record.task.deadline))
  const [newUpper, setNewUpper] = useState(record.proposed?.max ?? record.task.max!)
  return <div className="stack">
    <div className="person-line"><Avatar person={person} /><div><h3>{nameOf(person, lang)}</h3><p>{record.reason === 'Urgent-work rotation' ? t('Urgent-work rotation', '긴급 업무 순환') : t('Calendar fit and weighted ranking', '일정 적합도와 가중 점수')}</p></div><Label tone={record.pending ? 'peach' : 'green'}>{record.pending ? t('Needs review', '검토 필요') : t('Confirmed', '확정')}</Label></div>
    <Blocks blocks={record.blocks} lang={lang} />
    <details className="inline-details"><summary>{t('Assignment reason', '배정 이유')} · {record.score.toFixed(1)} / 100</summary><ul>{record.reasons.map((item) => <li key={item.id}>{factorName(item.id, t)} · {lang === 'ko' ? item.detailKo : item.detail}</li>)}</ul></details>
    <div><h3 className="small-heading">{t('History', '기록')}</h3><ul className="history-list">{record.history.map((entry, index) => <li key={index}><strong>{({ approval: t('Approved', '승인'), replacement: t('Replacement approved', '재배정 승인'), review: t('Review requested', '검토 요청'), effort: t('Effort correction', '작업 시간 정정'), commitment: t('Commitment reported', '일정 신고'), change: t('Change flagged', '변경 확인 필요') })[entry.type]}</strong><span>{displayTime(entry.at, lang)} · {entry.note}</span></li>)}</ul></div>
    {record.pending && <Notice>{t('Original booked blocks stay on the calendar during review.', '검토 중에는 기존 예약 블록이 캘린더에 유지됩니다.')}</Notice>}
    {employee ? <form className="stack" onSubmit={(event) => { event.preventDefault(); if (note.trim()) update(note.trim(), effort ? Number(effort) : null) }}><Field label={t('Reason for review', '검토 요청 사유')}><textarea required rows={2} value={note} onChange={(event) => setNote(event.target.value)} /></Field><Field label={t('Suggested upper effort (minutes) · optional', '제안 최대 작업 시간 (분) · 선택')}><input type="number" min={1} value={effort} onChange={(event) => setEffort(event.target.value)} /></Field><div className="actions"><button type="submit" className="btn primary">{t('Request review', '검토 요청')}</button></div></form>
      : <><form className="stack" onSubmit={(event) => { event.preventDefault(); const next = fromInput(deadline); if (next && newUpper > 0) propose({ ...(record.proposed || record.task), max: newUpper, min: Math.min(record.task.min || newUpper, newUpper), deadline: next, confirmed: false }) }}><div className="form-grid"><Field label={t('Revised deadline · KST', '변경 마감 · KST')}><input type="datetime-local" required value={deadline} onChange={(event) => setDeadline(event.target.value)} /></Field><Field label={t('Revised upper effort · minutes', '변경 최대 예상 작업 · 분')}><input type="number" required min={1} value={newUpper} onChange={(event) => setNewUpper(Number(event.target.value))} /></Field></div><div className="actions"><button className="btn secondary" type="submit">{t('Flag task update', '과제 변경 표시')}</button><button type="button" className="btn primary" onClick={replace}>{t('Plan replacement', '재배정 계획')}</button></div></form></>}
  </div>
}

export function VerificationForm({ person, workspace, lang, t, save }: { person: Employee; workspace: Workspace; lang: Language; t: Translate; save: (schedule: boolean, access: string, value: Block | 'unknown' | null, tasks: string[]) => void }) {
  const effective = effectivePerson(person, workspace)
  const [schedule, setSchedule] = useState(effective.scheduleVerified)
  const [access, setAccess] = useState('staging')
  const [accessState, setAccessState] = useState('')
  const [start, setStart] = useState(dateInput(workspace.now))
  const [end, setEnd] = useState(dateInput(workspace.now + DAY))
  const [tasks, setTasks] = useState<string[]>(workspace.verifiedTasks || [])
  const active = existingTasks.filter((item) => item.employeeId === person.id && !item.verified)
  return <form className="stack" onSubmit={(event) => {
    event.preventDefault()
    let interval: Block | 'unknown' | null = null
    if (accessState === 'verified') {
      const s = fromInput(start), e = fromInput(end)
      if (s === null || e === null || e <= s || !access.trim()) return
      interval = { start: s, end: e, title: '', kind: 'reserve', employeeId: person.id, id: '' }
    }
    if (accessState === 'unknown') interval = 'unknown'
    save(schedule, accessState ? access : '', interval, tasks)
  }}>
    <div className="person-line"><Avatar person={person} /><div><h3>{nameOf(person, lang)}</h3><p>{roleOf(person, lang)}</p></div></div>
    <label className="confirm-box"><input type="checkbox" checked={schedule} onChange={(event) => setSchedule(event.target.checked)} />{t('Working windows have been verified', '근무 시간 확인 완료')}</label>
    {active.map((item) => <label className="confirm-box" key={item.id}><input type="checkbox" checked={tasks.includes(item.id)} onChange={(event) => setTasks(event.target.checked ? [...tasks, item.id] : tasks.filter((id) => id !== item.id))} />{item.title} · {minutes(item.remaining, lang)} {t('linked on calendar', '캘린더에 연결됨')}</label>)}
    <div className="form-grid"><Field label={t('Access requirement', '필요 권한')}><input value={access} onChange={(event) => setAccess(event.target.value)} /></Field><Field label={t('Access verification', '권한 확인')}><Select value={accessState} onChange={(event) => setAccessState(event.target.value)}><option value="">{t('Keep current access', '현재 권한 유지')}</option><option value="verified">{t('Verified window', '확인된 권한 시간')}</option><option value="missing">{t('Missing', '권한 없음')}</option><option value="unknown">{t('Requires verification', '확인 필요')}</option></Select></Field></div>
    {accessState === 'verified' && <div className="form-grid"><Field label={t('Access start · KST', '권한 시작 · KST')}><input required type="datetime-local" value={start} onChange={(event) => setStart(event.target.value)} /></Field><Field label={t('Access end · KST', '권한 종료 · KST')}><input required type="datetime-local" value={end} onChange={(event) => setEnd(event.target.value)} /></Field></div>}
    <div className="actions"><button className="btn primary" type="submit">{t('Save verification', '확인 정보 저장')}</button></div>
  </form>
}
