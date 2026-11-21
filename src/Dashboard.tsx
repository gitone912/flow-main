import { useEffect, useMemo, useState, type CSSProperties } from 'react'
import { Activity, ArrowRight, CalendarClock, CheckCircle2, ClipboardCheck, Flame, Grid3x3, Layers, Plus, Scale, Sparkles, Timer, Zap } from 'lucide-react'
import { DAY, dayOf, displayDate, displayTime, hour, intersects, minutes, weekday, type Assignment, type Employee, type Language, type Workspace } from './domain'
import { dayModel, DayTimeline, FOCUS_MIN, recentUrgent } from './Timeline'
import { briefInput, TeamBrief } from './AiTools'
import { Avatar, EmptyState, nameOf, useCountUp, type Translate } from './ui'
import { LiveSpark, useChangeTick, useFlash } from './livechart-kit'
import { LiveClock, LiveHeatmap, LiveLoad, useKstHour } from './livechart-panels'

type Props = {
  workspace: Workspace; people: Employee[]; lang: Language; t: Translate; demoTeam: boolean
  onNavigate: (view: 'workspace' | 'calendar' | 'employees' | 'automation' | 'worklog' | 'workload') => void
  onNewRequest: () => void; onDemo: () => void; onAssignment: (record: Assignment) => void; onPerson: (id: string) => void; llmFail?: boolean
}

// 1 − Gini coefficient of urgent assignments: 100 means urgent work is shared perfectly evenly.
function fairnessIndex(counts: number[]) {
  const n = counts.length
  const mean = counts.reduce((sum, x) => sum + x, 0) / (n || 1)
  if (!n || !mean) return 100
  let diff = 0
  for (const a of counts) for (const b of counts) diff += Math.abs(a - b)
  return Math.round((1 - diff / (2 * n * n * mean)) * 100)
}

// The next five working days starting today, each as a workspace whose clock sits at that day's 09:00 (today keeps the real clock).
function workdays(now: number) {
  const days: number[] = []
  for (let day = dayOf(now); days.length < 5; day += DAY) if (weekday(day) >= 1 && weekday(day) <= 5) days.push(day)
  return days
}

type Spark = { values: number[]; labels: string[]; label: string; unit?: string }

// KPI tile: the whole card is one button (stretched), and the sparkline sits above it as its own focusable, inspectable chart.
function Metric({ icon: Icon, label, value, suffix, sub, spark, tone, index, hint, onClick }: { icon: typeof Timer; label: string; value: number; suffix?: string; sub: string; spark?: Spark; tone: string; index: number; hint: string; onClick?: () => void }) {
  const shown = useCountUp(value, 900)
  const tick = useChangeTick(String(value))
  return <div className="metric lc-metric" data-tone={tone} style={{ '--i': index } as CSSProperties}>
    <button type="button" className="lc-metric-hit" onClick={onClick} aria-label={label + ': ' + value + (suffix || '') + ' · ' + sub} />
    <span className="metric-head" aria-hidden="true"><span className="metric-icon"><Icon size={16} /></span><span className="metric-label">{label}</span><ArrowRight size={14} className="metric-go" /></span>
    <span className="metric-row"><strong key={tick} className={'metric-value tabular' + (tick ? ' lc-bump' : '')} aria-hidden="true">{Math.round(shown)}<small>{suffix}</small></strong>
      {spark && <LiveSpark values={spark.values} labels={spark.labels} unit={spark.unit} tone={tone} label={spark.label} hint={hint} onActivate={onClick} />}</span>
    <span className="metric-sub" aria-hidden="true">{sub}</span>
  </div>
}

function FairnessRing({ score, t }: { score: number; t: Translate }) {
  const [target, setTarget] = useState(0)
  useEffect(() => { const timer = window.setTimeout(() => setTarget(score), 120); return () => window.clearTimeout(timer) }, [score])
  const shown = useCountUp(target, 1200)
  const r = 54, c = 2 * Math.PI * r
  const tone = score >= 75 ? 'good' : score >= 55 ? 'warn' : 'risk'
  return <div className={'fair-ring ' + tone}>
    <svg viewBox="0 0 132 132" aria-hidden="true">
      <circle cx="66" cy="66" r={r} className="ring-track" />
      <circle cx="66" cy="66" r={r} className="ring-value" strokeDasharray={c} strokeDashoffset={c * (1 - target / 100)} />
    </svg>
    <div className="ring-center"><strong className="tabular">{Math.round(shown)}</strong><span>{t('of 100', '/ 100')}</span></div>
  </div>
}

export function Dashboard({ workspace, people, lang, t, demoTeam, onNavigate, onNewRequest, onDemo, onAssignment, onPerson, llmFail = false }: Props) {
  const active = people.filter((person) => !person.status || person.status === 'active')
  const urgent = active.map((person) => ({ person, count: recentUrgent(person, workspace) })).sort((a, b) => b.count - a.count)
  const counts = urgent.map(({ count }) => count)
  const urgentTotal = counts.reduce((sum, n) => sum + n, 0)
  const maxUrgent = Math.max(1, ...counts)
  const topTwo = counts.slice(0, 2).reduce((sum, n) => sum + n, 0)
  const concentration = urgentTotal ? Math.round(topTwo / urgentTotal * 100) : 0
  const fairness = fairnessIndex(counts)

  // Five-day capacity grid: open hours per person per working day, and team-level trends for the sparklines.
  const days = useMemo(() => workdays(workspace.now), [workspace.now])
  const grid = useMemo(() => active.map((person) => ({ person, cells: days.map((day, i) => {
    const model = dayModel(person, i === 0 ? workspace : { ...workspace, now: day + 540 }, null)
    const focus = model.free.filter((w) => w.focus).reduce((sum, w) => sum + w.end - w.start, 0)
    const overlaps = model.busy.filter((block, j) => model.busy.slice(j + 1).some((other) => intersects(block, other))).length
    return { day, workable: model.workable, focus, longest: model.longest, overlaps, model }
  }) })), [workspace, people]) // eslint-disable-line react-hooks/exhaustive-deps
  const today = grid.map(({ person, cells }) => ({ person, ...cells[0] }))
  const focusTrend = days.map((_, i) => Math.round(grid.reduce((sum, row) => sum + row.cells[i].focus, 0) / 60))
  const overlapTrend = days.map((_, i) => grid.reduce((sum, row) => sum + row.cells[i].overlaps, 0))
  const urgentTrend = [3, 2, 1, 0].map((w) => active.reduce((sum, p) => sum + (p.urgent || []).filter((at) => at >= workspace.now - (w + 1) * 7 * DAY && at < workspace.now - w * 7 * DAY).length, 0))
  const fragmented = today.filter((row) => row.longest < FOCUS_MIN).length
  const hotspots = [...today].sort((a, b) => b.overlaps - a.overlaps || Number(b.longest < FOCUS_MIN) - Number(a.longest < FOCUS_MIN) || a.workable - b.workable).slice(0, 4)
  const pending = workspace.assignments.filter((record) => record.pending && people.some(({ id }) => id === record.employeeId))
  const feed = workspace.assignments.filter((record) => people.some(({ id }) => id === record.employeeId))
    .flatMap((record) => record.history.map((entry) => ({ record, entry }))).sort((a, b) => b.entry.at - a.entry.at).slice(0, 6)
  // Greeting follows the real time in Seoul (the live clock), not the fixed demo reference time.
  const hourNow = useKstHour()
  const greeting = hourNow < 5 ? t('Working late', '늦은 시간까지 수고 많으세요') : hourNow < 12 ? t('Good morning', '좋은 아침입니다') : hourNow < 18 ? t('Good afternoon', '좋은 오후입니다') : hourNow < 22 ? t('Good evening', '좋은 저녁입니다') : t('Working late', '늦은 시간까지 수고 많으세요')
  const repeated = urgent.filter(({ count }) => count >= 3).length
  const dayLabel = (day: number, i: number) => i === 0 ? t('Today', '오늘') : new Intl.DateTimeFormat(lang === 'ko' ? 'ko-KR' : 'en-GB', { timeZone: 'Asia/Seoul', weekday: 'short' }).format(day * 60000)
  const heat = (focus: number, workable: number) => focus >= 240 ? 4 : focus >= FOCUS_MIN ? 3 : workable >= 90 ? 2 : workable > 0 ? 1 : 0
  const feedLabel = (type: string) => ({ approval: t('Assigned', '배정'), replacement: t('Reassigned', '재배정'), review: t('Review requested', '검토 요청'), effort: t('Effort corrected', '시간 정정'), commitment: t('Commitment reported', '일정 신고'), change: t('Change flagged', '변경 확인') } as Record<string, string>)[type] || type
  const labels = { task: '', focus: t('Focus block', '집중 가능 시간'), gap: t('Short gap', '짧은 빈 시간') }
  const dayPoints = days.map((day, i) => dayLabel(day, i) + ' ' + new Date((day + 540) * 60000).getUTCDate() + t('', '일'))
  const weekPoints = [3, 2, 1, 0].map((w) => w ? t(w + (w > 1 ? ' weeks' : ' week') + ' ago', w + '주 전') : t('This week', '이번 주'))
  const sparkHint = t('Use arrow keys to read each point.', '방향키로 각 지점 값을 확인하세요.')
  const urgentMean = active.length ? urgentTotal / active.length : 0

  // Live: everything above derives from props. When an approval changes the numbers, pulse the live badge once.
  const liveSignature = [fairness, urgentTotal, concentration, repeated, pending.length, focusTrend.join(','), overlapTrend.join(','), counts.join(',')].join('|')
  const liveTick = useChangeTick(liveSignature)
  const liveFlash = useFlash(liveTick)

  return <div className="dash2 flow-step">
    <div className="bento">
      <section className="hero2 b-8">
        <img src="/relay-track.png" alt="" className="hero2-art" aria-hidden="true" />
        <div className="hero2-body">
          <span className="lc-hero-times">
            <LiveClock lang={lang} t={t} />
            <span className="hero2-eyebrow lc-demo-time"><span className="lc-time-label">{t('Demo reference time', '데모 기준 시각')}</span>{displayDate(workspace.now, lang, true)} · {hour(workspace.now)} KST</span>
          </span>
          <h1>{greeting}</h1>
          <p>{repeated
            ? t(repeated + (repeated > 1 ? ' people are' : ' person is') + ' absorbing repeated urgent work. Route the next one to someone with real focus time.', repeated + '명이 긴급 업무를 반복해서 맡고 있습니다. 다음 업무는 실제로 집중할 시간이 있는 팀원에게 연결하세요.')
            : t('Urgent work is spread evenly. Keep it that way — every assignment is checked against real calendars.', '긴급 업무가 고르게 나뉘어 있습니다. 모든 배정은 실제 일정으로 확인됩니다.')}</p>
          <div className="hero2-actions">
            <button className="btn hero-primary lg" onClick={onNewRequest}><Plus size={17} />{t('New urgent task', '새 긴급 업무')}</button>
            {demoTeam && <button className="btn hero-ghost lg" onClick={onDemo}><Zap size={16} />{t('Run the 4h demo', '4시간 데모 실행')}</button>}
          </div>
        </div>
      </section>

      <section className="card2 fair b-4">
        <header className="card2-head"><span className="card2-icon tone-primary"><Scale size={15} /></span><div><h2>{t('Fairness index', '공정성 지수')}</h2><p>{t('How evenly urgent work is shared · 30 days', '긴급 업무 분배 균형 · 최근 30일')}</p></div>
          <span className={'lc-live' + (liveFlash ? ' pulse' : '')} role="status"><i aria-hidden="true" />{liveFlash ? t('Updated', '방금 갱신') : t('Live', '실시간')}</span></header>
        <div className="fair-body">
          <FairnessRing score={fairness} t={t} />
          <ul className="fair-facts">
            <li><b className="tabular">{concentration}%</b><span>{t('on the top 2 people', '상위 2명 비중')}</span></li>
            <li><b className="tabular">{urgentTotal}</b><span>{t('urgent tasks', '긴급 업무')}</span></li>
            <li><b className="tabular">{repeated}</b><span>{t('with 3+ urgent', '3건 이상 담당')}</span></li>
          </ul>
        </div>
      </section>

      <div className="metrics b-12">
        <Metric index={0} icon={Timer} tone="focus" hint={sparkHint} label={t('Focus time today', '오늘 집중 시간')} value={focusTrend[0]} suffix="h" spark={{ values: focusTrend, labels: dayPoints, unit: 'h', label: t('Team focus hours', '팀 집중 시간') }} sub={t('Unbroken 2h+ windows · next 5 days →', '2시간+ 연속 시간 · 향후 5일 →')} onClick={() => onNavigate('calendar')} />
        <Metric index={1} icon={Flame} tone={concentration >= 50 ? 'risk' : 'primary'} hint={sparkHint} label={t('Urgent tasks · 30 days', '긴급 업무 · 30일')} value={urgentTotal} spark={{ values: urgentTrend, labels: weekPoints, unit: t('', '건'), label: t('Urgent tasks per week', '주별 긴급 업무') }} sub={t('Per week, last 4 weeks', '최근 4주 주별 추이')} onClick={() => onNavigate('workload')} />
        <Metric index={2} icon={Layers} tone={overlapTrend[0] ? 'gap' : 'neutral'} hint={sparkHint} label={t('Overlapping commitments', '겹치는 일정')} value={overlapTrend[0]} spark={{ values: overlapTrend, labels: dayPoints, unit: t('', '건'), label: t('Overlaps per day', '일별 일정 중복') }} sub={t(fragmented + ' people with a fragmented day', '일정이 조각난 팀원 ' + fragmented + '명')} onClick={() => onNavigate('automation')} />
        <Metric index={3} icon={ClipboardCheck} tone={pending.length ? 'gap' : 'neutral'} hint={sparkHint} label={t('Reviews requested', '검토 요청')} value={pending.length} sub={pending.length ? t('Employee corrections waiting', '팀원 정정 대기 중') : t('Nothing waiting', '대기 중인 요청 없음')} onClick={() => onNavigate('worklog')} />
      </div>

      {pending.length > 0 && <button className="review-banner b-12" onClick={() => onAssignment(pending[0])}><ClipboardCheck size={16} /><span>{t(pending.length + ' assignment' + (pending.length > 1 ? 's need' : ' needs') + ' re-review after a schedule change', '일정 변경으로 ' + pending.length + '건의 배정 재검토 필요')}</span><ArrowRight size={15} /></button>}

      <div className="b-12"><TeamBrief input={briefInput(workspace, people, lang, focusTrend[0], overlapTrend[0], fragmented)} t={t} simulateFailure={llmFail} /></div>

      <section className="card2 b-8">
        <header className="card2-head"><span className="card2-icon tone-focus"><Grid3x3 size={15} /></span><div><h2>{t('Team capacity · next 5 days', '팀 가용 시간 · 향후 5일')}</h2><p>{t('Open hours per person; darker cells hold a 2h+ focus block · tap a name or day to highlight', '팀원별 남은 시간 · 진한 칸은 2시간+ 집중 블록 · 이름이나 요일을 눌러 강조')}</p></div>
          <button className="btn ghost slim" onClick={() => onNavigate('calendar')}>{t('Schedule', '일정')}<ArrowRight size={14} /></button></header>
        <LiveHeatmap grid={grid} days={days} lang={lang} t={t} dayLabel={dayLabel} heat={heat} onPerson={onPerson} />
      </section>

      <section className="card2 b-4">
        <header className="card2-head"><span className="card2-icon tone-risk"><Flame size={15} /></span><div><h2>{t('Urgent load', '긴급 업무 부담')}</h2><p>{t('Last 30 days · tap a person', '최근 30일 · 눌러서 프로필')}</p></div></header>
        <LiveLoad rows={urgent.slice(0, 7)} mean={urgentMean} max={maxUrgent} lang={lang} t={t} onPerson={onPerson} />
      </section>

      <section className="card2 b-7">
        <header className="card2-head"><span className="card2-icon tone-gap"><CalendarClock size={15} /></span><div><h2>{t('Today’s collision hotspots', '오늘의 일정 충돌 지점')}</h2><p>{t('Tightest days first', '가장 빠듯한 일정 순')}</p></div></header>
        {hotspots.length ? <ul className="hotspot-list">{hotspots.map((row, i) => {
          const label = row.overlaps ? { tone: 'risk', text: t(row.overlaps + ' overlap' + (row.overlaps > 1 ? 's' : ''), '중복 ' + row.overlaps + '건') }
            : row.longest < FOCUS_MIN ? { tone: 'gap', text: t('Fragmented · longest ' + minutes(row.longest, lang), '조각난 일정 · 최장 ' + minutes(row.longest, lang)) }
              : { tone: 'busy', text: t(minutes(row.workable, lang) + ' open', minutes(row.workable, lang) + ' 여유') }
          return <li key={row.person.id} style={{ '--i': i } as CSSProperties}><button onClick={() => onPerson(row.person.id)}>
            <span className="hotspot-top"><Avatar person={row.person} size="small" /><strong>{nameOf(row.person, lang)}</strong><span className={'impact-pill small tone-' + label.tone}>{label.text}</span></span>
            <DayTimeline model={row.model} compact labels={labels} />
          </button></li>
        })}</ul> : <EmptyState icon={CalendarClock} title={t('No active teammates', '활동 중인 팀원 없음')} />}
      </section>

      <section className="card2 b-5">
        <header className="card2-head"><span className="card2-icon tone-primary"><Activity size={15} /></span><div><h2>{t('Activity', '최근 활동')}</h2><p>{t('Assignments, reviews and corrections', '배정, 검토, 정정 기록')}</p></div>
          {feed.length > 0 && <button className="btn ghost slim" onClick={() => onNavigate('worklog')}>{t('All', '전체')}<ArrowRight size={14} /></button>}</header>
        {feed.length ? <ol className="feed">{feed.map(({ record, entry }, i) => {
          const person = people.find(({ id }) => id === record.employeeId)
          return <li key={record.task.id + entry.at + i} style={{ '--i': i } as CSSProperties}><button onClick={() => onAssignment(record)}>
            <span className={'feed-dot t-' + entry.type}>{entry.type === 'approval' || entry.type === 'replacement' ? <CheckCircle2 size={13} /> : <ClipboardCheck size={13} />}</span>
            <span className="feed-text"><strong>{feedLabel(entry.type)} · {record.task.title}</strong><small>{person ? nameOf(person, lang) + ' · ' : ''}{displayTime(entry.at, lang)}</small></span>
          </button></li>
        })}</ol> : <div className="feed-empty"><Sparkles size={18} /><p>{t('No activity yet. Assign the first urgent task — it appears here with its full audit trail.', '아직 활동이 없습니다. 첫 긴급 업무를 배정하면 감사 기록과 함께 여기에 표시됩니다.')}</p><button className="btn secondary slim" onClick={demoTeam ? onDemo : onNewRequest}><Zap size={14} />{demoTeam ? t('Run the demo', '데모 실행') : t('New urgent task', '새 긴급 업무')}</button></div>}
      </section>
    </div>
  </div>
}
