import { useMemo, useState } from 'react'
import { Area, Bar, BarChart, CartesianGrid, Cell, ComposedChart, Line, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { Activity, AlertTriangle, BarChart3, CalendarClock, FlaskConical, Sigma, Users, X } from 'lucide-react'
import { DAY, minutes, type Employee, type Language, type Workspace } from './domain'
import { effectivePerson, historySummary, simulate, workload } from './scheduler'
import { makeWorkspace, replayTasks } from './seed'
import { Avatar, Label, PanelTitle, nameOf, roleOf, useChartColors, type Translate } from './ui'
import { lorenz, summarize, topShare, type Summary } from './stats-math'

type Metric = 'util' | 'hours' | 'urgent'
type SortKey = 'name' | 'load'
type Row = {
  person: Employee; used: number; regular: number; ratio: number
  urgent30: number | null; weeks: number; overloaded: number
}
type Point = { id: string; label: string; value: number | null; over: boolean; row: Row }

const WEEK_REGULAR_H = 40 // Korean Labor Standards Act: 40h regular week
const WEEK_CAP_H = 52 // 40h regular + 12h overtime legal weekly cap
const fmt = (value: number, digits = 1) => Number.isFinite(value) ? value.toFixed(digits).replace(/\.0+$/, '') : '–'
const hours = (mins: number) => mins / 60

function Segmented<T extends string>({ value, options, onChange, label }: { value: T; options: { id: T; label: string }[]; onChange: (id: T) => void; label: string }) {
  return <div className="segmented" role="group" aria-label={label}>{options.map((option) => <button key={option.id} type="button" aria-pressed={value === option.id} onClick={() => onChange(option.id)}>{option.label}</button>)}</div>
}

export function Insights({ workspace, people, lang, t, team, onTools }: { workspace: Workspace; people: Employee[]; lang: Language; t: Translate; team: string; onTools: () => void }) {
  const colors = useChartColors()
  const anim = { isAnimationActive: colors.animate, animationDuration: 700, animationEasing: 'ease-out' as const }
  const [metric, setMetric] = useState<Metric>('util')
  const [sort, setSort] = useState<SortKey>('name')
  const [selected, setSelected] = useState<string | null>(null)
  const [lorenzOf, setLorenzOf] = useState<'urgent' | 'hours'>('urgent')
  const [hiddenSeries, setHiddenSeries] = useState<Record<string, boolean>>({})

  const active = people.filter((person) => !person.status || person.status === 'active')
  const since = workspace.now - 30 * DAY
  const rosterLoad: Row[] = active.map((person) => {
    const effective = effectivePerson(person, workspace)
    const urgent = effective.urgent
    return {
      person, ...workload(person, workspace), ...historySummary(person, workspace),
      urgent30: urgent ? urgent.filter((at) => at > since && at <= workspace.now).length : null,
    }
  })

  /* ---------- Workload chart data ---------- */
  const valueOf = (row: Row): number | null => metric === 'util' ? Math.round(row.ratio * 100) : metric === 'hours' ? Math.round(hours(row.used) * 10) / 10 : row.urgent30
  const points: Point[] = rosterLoad.map((row) => ({ id: row.person.id, label: row.person.initials, value: valueOf(row), over: metric !== 'urgent' && row.ratio > 1, row }))
  const sorted = [...points].sort((a, b) => sort === 'load' ? (b.value ?? -1) - (a.value ?? -1) : nameOf(a.row.person, lang).localeCompare(nameOf(b.row.person, lang), lang))
  const maxValue = Math.max(0, ...sorted.map((point) => point.value ?? 0))
  const tickStep = metric === 'util' ? 25 : metric === 'hours' ? 10 : Math.max(1, Math.ceil((maxValue + 1) / 5))
  const domainMax = metric === 'util' ? Math.max(125, Math.ceil((maxValue + 5) / 25) * 25) : metric === 'hours' ? Math.max(60, Math.ceil((maxValue + 2) / 10) * 10) : Math.max(4, Math.ceil((maxValue + 1) / tickStep) * tickStep)
  const yTicks = Array.from({ length: Math.round(domainMax / tickStep) + 1 }, (_, i) => i * tickStep)
  const unit = metric === 'util' ? '%' : metric === 'hours' ? 'h' : ''
  const metricName = metric === 'util' ? t('Utilization of regular capacity', '정규 근무 대비 업무 비율') : metric === 'hours' ? t('Scheduled hours this week', '이번 주 배정 시간') : t('Urgent tasks, last 30 days', '최근 30일 긴급 업무')
  const selectedRow = rosterLoad.find((row) => row.person.id === selected) || null
  const overCount = rosterLoad.filter((row) => row.ratio > 1).length
  const toggleSelect = (id: string) => setSelected((current) => current === id ? null : id)

  /* ---------- Distribution statistics ---------- */
  const urgentKnown = rosterLoad.filter((row) => row.urgent30 !== null)
  const urgentValues = urgentKnown.map((row) => row.urgent30 as number)
  const stats: { id: Metric; label: string; unit: string; s: Summary }[] = [
    { id: 'urgent', label: t('Urgent tasks (30 days)', '긴급 업무 (30일)'), unit: '', s: summarize(urgentValues) },
    { id: 'util', label: t('Utilization', '업무 비율'), unit: '%', s: summarize(rosterLoad.map((row) => row.ratio * 100)) },
    { id: 'hours', label: t('Scheduled hours', '배정 시간'), unit: 'h', s: summarize(rosterLoad.map((row) => hours(row.used))) },
  ]
  const describe = (g: number, n: number) => n < 2 ? t('Not enough people to compare.', '비교할 인원이 부족합니다.')
    : g < 0.2 ? t('evenly spread across the team', '팀 전체에 고르게 분산')
    : g < 0.35 ? t('somewhat uneven', '다소 불균형하게 분포')
    : g < 0.5 ? t('concentrated on part of the team', '일부 팀원에게 집중')
    : t('heavily concentrated on a few people', '소수 인원에게 크게 집중')
  const urgentTotal = urgentValues.reduce((sum, x) => sum + x, 0)
  const top20 = topShare(urgentValues, 0.2)
  const topK = Math.max(1, Math.ceil(urgentValues.length * 0.2))
  const urgentStat = stats[0].s
  const utilStat = stats[1].s
  const urgentLine = urgentStat.n < 2 ? describe(0, urgentStat.n)
    : urgentTotal === 0 ? t('No urgent tasks were recorded in the last 30 days.', '최근 30일간 기록된 긴급 업무가 없습니다.')
    : t(`Urgent work is ${describe(urgentStat.gini, urgentStat.n)} (Gini ${fmt(urgentStat.gini, 2)}): the busiest ${topK} of ${urgentStat.n} people handled ${Math.round(top20 * 100)}% of ${urgentTotal} urgent tasks.`,
      `긴급 업무는 ${describe(urgentStat.gini, urgentStat.n)}되어 있습니다 (지니 ${fmt(urgentStat.gini, 2)}): ${urgentStat.n}명 중 상위 ${topK}명이 긴급 업무 ${urgentTotal}건의 ${Math.round(top20 * 100)}%를 처리했습니다.`)
  const utilLine = utilStat.n < 2 ? describe(0, utilStat.n)
    : t(`This week's load is ${describe(utilStat.gini, utilStat.n)} (Gini ${fmt(utilStat.gini, 2)}); average utilization ${Math.round(utilStat.mean)}% ± ${Math.round(utilStat.sd)} pts.`,
      `이번 주 업무량은 ${describe(utilStat.gini, utilStat.n)}되어 있습니다 (지니 ${fmt(utilStat.gini, 2)}); 평균 업무 비율 ${Math.round(utilStat.mean)}% ± ${Math.round(utilStat.sd)}%p.`)

  const lorenzRows = lorenzOf === 'urgent' ? urgentKnown.map((row) => ({ row, v: row.urgent30 as number })) : rosterLoad.map((row) => ({ row, v: hours(row.used) }))
  const lorenzSorted = [...lorenzRows].sort((a, b) => a.v - b.v)
  const lorenzData = lorenz(lorenzSorted.map((item) => item.v)).map((point) => ({ ...point, person: point.index ? lorenzSorted[point.index - 1].row.person : null }))
  const lorenzGini = lorenzOf === 'urgent' ? urgentStat.gini : stats[2].s.gini
  const lorenzWhat = lorenzOf === 'urgent' ? t('urgent tasks', '긴급 업무') : t('scheduled hours', '배정 시간')

  /* ---------- Replay simulation (unchanged numbers) ---------- */
  const seed = useMemo(() => makeWorkspace(), [])
  const requests = useMemo(() => replayTasks(team), [team])
  const simulation = useMemo(() => simulate(team, requests, seed), [team, requests, seed])
  const labels = { onTime: t('On time', '기한 내 완료'), deferred: t('Deferred', '지연'), blocked: t('Blocked', '배정 불가') }
  const counts = (['onTime', 'deferred', 'blocked'] as const).map((id) => ({ name: labels[id], relay: simulation.relay[id], baseline: simulation.baseline[id] }))
  const n = requests.length
  const baselineName = t('Previous owner first', '이전 담당자 우선')
  const series = [{ id: 'relay', name: 'Flow', color: 'var(--primary)' }, { id: 'baseline', name: baselineName, color: colors.peach }]

  /* ---------- Pressure points ---------- */
  const multi = rosterLoad.filter((person) => person.overloaded >= 2).length
  const eligibleWeeks = rosterLoad.filter((row) => row.weeks >= 2).length
  const effective = active.map((person) => effectivePerson(person, workspace))
  const skillGaps = [...new Set(effective.flatMap((person) => Object.keys(person.skills)))].filter((id) => effective.filter((person) => (person.skills[id] || 0) >= 4).length === 1)
  const reqLate = requests.filter((task) => task.dependencies.some((dependency) => dependency.available !== null && task.deadline! - dependency.available < task.max!)).length
  const collisions = requests.filter((task, index) => requests.some((other, otherIndex) => otherIndex < index && Math.abs(task.deadline! - other.deadline!) <= 120)).length

  const tooltipBox = { background: 'transparent', border: 0, padding: 0 }
  const axisTick = { fontSize: 12, fill: colors.axis }
  const barFill = (point: Point) => point.over ? colors.amber : 'var(--primary)'

  return <div className="stack page-stack">
    {/* Team workload */}
    <section className="panel"><PanelTitle icon={Activity} title={t('Team workload', '팀 업무량')} subtitle={t('Live from the current schedule. Click a bar or a person to focus.', '현재 일정 기준 실시간 값입니다. 막대나 팀원을 눌러 강조하세요.')} actions={<button className="btn secondary slim" onClick={onTools}><Users size={15} />{t('Team tools', '팀 도구')}</button>} />
      <div className="panel-body chart-body">
        <div className="sx-controls">
          <Segmented label={t('Metric', '지표')} value={metric} onChange={setMetric} options={[{ id: 'util', label: t('Utilization %', '업무 비율 %') }, { id: 'hours', label: t('Hours', '시간') }, { id: 'urgent', label: t('Urgent · 30d', '긴급 · 30일') }]} />
          <Segmented label={t('Sort', '정렬')} value={sort} onChange={setSort} options={[{ id: 'name', label: t('By name', '이름순') }, { id: 'load', label: t('By load', '부하순') }]} />
        </div>
        <div className="sx-legend" aria-hidden="true">
          <span><i style={{ background: 'var(--primary)' }} />{metricName}</span>
          {metric !== 'urgent' && overCount > 0 && <span><i style={{ background: colors.amber }} /><AlertTriangle size={12} />{t('Above regular capacity', '정규 근무 시간 초과')}</span>}
          {metric === 'util' && <span><b className="sx-dash" />{t('100% = own regular hours', '100% = 본인 정규 근무')}</span>}
          {metric === 'hours' && <span><b className="sx-dash" />{t('40h regular · 52h legal weekly cap', '주 40시간 · 법정 상한 52시간')}</span>}
        </div>
        <figure className="chart-slot sx-figure" role="img" aria-label={metricName + ': ' + sorted.map((point) => nameOf(point.row.person, lang) + ' ' + (point.value === null ? t('no record', '기록 없음') : point.value + unit)).join(', ')}>
          <ResponsiveContainer width="100%" height={260}>
            <BarChart data={sorted} margin={{ top: 12, right: 8, bottom: 0, left: -8 }} barCategoryGap="22%">
              <CartesianGrid vertical={false} stroke={colors.grid} strokeDasharray="3 3" />
              <XAxis dataKey="label" tickLine={false} axisLine={false} tick={axisTick} interval={0} />
              <YAxis domain={[0, domainMax]} ticks={yTicks} allowDecimals={metric !== 'urgent'} tickFormatter={(v) => v + unit} tickLine={false} axisLine={false} tick={axisTick} width={44} />
              {metric === 'util' && <ReferenceLine y={100} stroke={colors.axis} strokeDasharray="5 4" label={{ value: '100%', position: 'insideTopRight', fill: colors.axis, fontSize: 12 }} />}
              {metric === 'hours' && <ReferenceLine y={WEEK_REGULAR_H} stroke={colors.axis} strokeDasharray="5 4" label={{ value: '40h', position: 'insideTopRight', fill: colors.axis, fontSize: 12 }} />}
              {metric === 'hours' && <ReferenceLine y={WEEK_CAP_H} stroke={colors.red} strokeDasharray="5 4" label={{ value: t('52h cap', '52시간 상한'), position: 'insideTopRight', fill: colors.red, fontSize: 12 }} />}
              <Tooltip cursor={{ fill: colors.cursor }} wrapperStyle={{ outline: 'none' }} contentStyle={tooltipBox} content={({ active: on, payload }) => {
                const point = on && payload?.[0]?.payload as Point | undefined
                if (!point) return null
                const row = point.row
                return <div className="chart-tooltip sx-tip">
                  <strong>{nameOf(row.person, lang)}</strong>
                  <div><b>{fmt(hours(row.used))}h</b><span>{t('scheduled of', '배정 /')} {fmt(hours(row.regular))}h {t('regular', '정규')}</span></div>
                  <div><b>{Math.round(row.ratio * 100)}%</b><span>{t('of regular capacity', '정규 근무 대비')}</span></div>
                  <div><b>{row.urgent30 ?? '–'}</b><span>{row.urgent30 === null ? t('urgent history not recorded', '긴급 업무 기록 없음') : t('urgent tasks in 30 days', '30일간 긴급 업무')}</span></div>
                </div>
              }} />
              <Bar dataKey="value" name={metricName} radius={[4, 4, 0, 0]} maxBarSize={44} {...anim} onClick={(_, index) => toggleSelect(sorted[index].id)} style={{ cursor: 'pointer' }}>
                {sorted.map((point) => <Cell key={point.id} fill={barFill(point)} fillOpacity={selected && selected !== point.id ? 0.28 : 1} stroke={selected === point.id ? 'var(--text)' : 'none'} strokeWidth={selected === point.id ? 1.5 : 0} />)}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </figure>
        {selectedRow && <div className="sx-detail" aria-live="polite">
          <Avatar person={selectedRow.person} />
          <div className="sx-detail-main"><strong>{nameOf(selectedRow.person, lang)}</strong><small>{roleOf(selectedRow.person, lang)}</small></div>
          <dl>
            <div><dt>{t('This week', '이번 주')}</dt><dd>{minutes(selectedRow.used, lang)} / {minutes(selectedRow.regular, lang)}</dd></div>
            <div><dt>{t('Utilization', '업무 비율')}</dt><dd>{Math.round(selectedRow.ratio * 100)}%{selectedRow.ratio > 1 && <> <AlertTriangle size={12} aria-label={t('above capacity', '초과')} /></>}</dd></div>
            <div><dt>{t('Urgent · 30d', '긴급 · 30일')}</dt><dd>{selectedRow.urgent30 ?? t('No record', '기록 없음')}{selectedRow.urgent30 !== null && urgentStat.n >= 2 && <small> ({t('team median', '팀 중앙값')} {fmt(urgentStat.median)})</small>}</dd></div>
            <div><dt>{t('Overload weeks', '과부하 주')}</dt><dd>{selectedRow.weeks ? `${selectedRow.overloaded} / ${selectedRow.weeks}` : t('No verified weeks', '검증된 주 없음')}</dd></div>
          </dl>
          <button className="btn ghost slim sx-close" onClick={() => setSelected(null)} aria-label={t('Clear selection', '선택 해제')}><X size={15} /></button>
        </div>}
        <div className="workload-list">{sorted.map(({ row }) => <button type="button" className={'workload-person sx-person' + (selected === row.person.id ? ' is-selected' : '') + (selected && selected !== row.person.id ? ' is-dim' : '')} key={row.person.id} aria-pressed={selected === row.person.id} onClick={() => toggleSelect(row.person.id)}><Avatar person={row.person} size="small" /><div><strong>{nameOf(row.person, lang)}</strong><small>{minutes(row.used, lang)} / {minutes(row.regular, lang)} · {Math.round(row.ratio * 100)}%</small></div></button>)}</div>
        {overCount > 0 && <p className="sx-note"><AlertTriangle size={13} />{t(`${overCount} of ${rosterLoad.length} people are scheduled above their own regular hours this week.`, `이번 주 ${rosterLoad.length}명 중 ${overCount}명이 본인 정규 근무 시간을 넘겨 배정되었습니다.`)}</p>}
      </div>
    </section>

    {/* Distribution statistics */}
    <section className="panel"><PanelTitle icon={Sigma} title={t('How evenly is work shared?', '업무는 얼마나 고르게 나뉘나요?')} subtitle={t('Descriptive statistics over active people in this team. Updates as assignments are approved.', '이 팀의 재직 인원 기준 기술 통계입니다. 배정이 승인되면 갱신됩니다.')} />
      <div className="panel-body chart-body">
        <div className="sx-insight">
          <p>{urgentLine}</p>
          <p>{utilLine}</p>
        </div>
        <div className="table-scroll"><table className="data-table sx-stats">
          <thead><tr><th>{t('Measure', '지표')}</th><th>n</th><th>{t('Mean', '평균')}</th><th>{t('Median', '중앙값')}</th><th>{t('Std. dev.', '표준편차')}</th><th>{t('Gini', '지니')}</th></tr></thead>
          <tbody>{stats.map(({ id, label, unit: u, s }) => <tr key={id}><th>{label}</th><td>{s.n}</td><td>{fmt(s.mean)}{u}</td><td>{fmt(s.median)}{u}</td><td>{fmt(s.sd)}{u}</td><td><span className="sx-gini"><i style={{ width: Math.round(s.gini * 100) + '%' }} /></span>{fmt(s.gini, 2)}</td></tr>)}</tbody>
        </table></div>
        <div className="sx-controls">
          <strong className="sx-subhead">{t('Lorenz curve', '로렌츠 곡선')}</strong>
          <Segmented label={t('Lorenz curve measure', '로렌츠 곡선 지표')} value={lorenzOf} onChange={setLorenzOf} options={[{ id: 'urgent', label: t('Urgent tasks', '긴급 업무') }, { id: 'hours', label: t('Scheduled hours', '배정 시간') }]} />
        </div>
        <div className="sx-legend" aria-hidden="true">
          <span><i style={{ background: 'var(--primary)' }} />{t('Actual share', '실제 분포')}</span>
          <span><b className="sx-dash" />{t('Perfect equality', '완전 균등')}</span>
          <span>{t('Gini', '지니')} {fmt(lorenzGini, 2)}</span>
        </div>
        <figure className="chart-slot sx-figure" role="img" aria-label={t(`Lorenz curve of ${lorenzWhat}. Gini ${fmt(lorenzGini, 2)}. The further the curve sags below the diagonal, the more concentrated the work.`, `${lorenzWhat} 로렌츠 곡선. 지니 ${fmt(lorenzGini, 2)}. 곡선이 대각선 아래로 처질수록 업무가 집중되어 있습니다.`)}>
          {lorenzRows.length < 2 ? <p className="muted sx-empty">{t('Need at least two people with records to draw a curve.', '곡선을 그리려면 기록이 있는 인원이 2명 이상 필요합니다.')}</p> :
          <ResponsiveContainer width="100%" height={260}>
            <ComposedChart data={lorenzData} margin={{ top: 12, right: 12, bottom: 4, left: -8 }}>
              <CartesianGrid stroke={colors.grid} strokeDasharray="3 3" />
              <XAxis type="number" dataKey="people" domain={[0, 100]} ticks={[0, 25, 50, 75, 100]} tickFormatter={(v) => v + '%'} tickLine={false} axisLine={false} tick={axisTick} />
              <YAxis type="number" domain={[0, 100]} ticks={[0, 25, 50, 75, 100]} tickFormatter={(v) => v + '%'} tickLine={false} axisLine={false} tick={axisTick} width={44} />
              <Tooltip cursor={{ stroke: colors.axis, strokeDasharray: '3 3' }} wrapperStyle={{ outline: 'none' }} contentStyle={tooltipBox} content={({ active: on, payload }) => {
                const point = on && payload?.[0]?.payload as (typeof lorenzData)[number] | undefined
                if (!point) return null
                if (!point.index) return <div className="chart-tooltip sx-tip"><strong>{t('Start', '시작')}</strong><div><span>0% / 0%</span></div></div>
                return <div className="chart-tooltip sx-tip">
                  <strong>{t(`Lightest ${point.index} of ${lorenzRows.length} people`, `가장 적은 ${lorenzRows.length}명 중 ${point.index}명`)}</strong>
                  <div><b>{Math.round(point.share)}%</b><span>{t('of', '/')} {lorenzWhat}</span></div>
                  <div><b>{Math.round(point.people)}%</b><span>{t('of people (equal share)', '인원 비율 (균등 기준)')}</span></div>
                  {point.person && <div><span>+ {nameOf(point.person, lang)}</span></div>}
                </div>
              }} />
              <Line dataKey="equal" stroke={colors.axis} strokeDasharray="5 4" strokeWidth={1.5} dot={false} activeDot={false} isAnimationActive={false} legendType="none" />
              <Area dataKey="share" type="linear" stroke="var(--primary)" strokeWidth={2} fill="var(--primary)" fillOpacity={0.12} dot={{ r: 4, fill: 'var(--primary)', stroke: colors.surface, strokeWidth: 2 }} activeDot={{ r: 6, fill: 'var(--primary)', stroke: colors.surface, strokeWidth: 2 }} {...anim} />
            </ComposedChart>
          </ResponsiveContainer>}
        </figure>
        <details className="inline-details"><summary>{t('How these numbers are calculated', '계산 방법')}</summary>
          <p>{t('Mean and median are over active people in the team. Standard deviation is the population form √(Σ(x−mean)²/n), because the team is the whole population. Gini = 2·Σ(i·xᵢ)/(n·Σx) − (n+1)/n with values sorted ascending; 0 means everyone carries the same amount and (n−1)/n means one person carries everything. The Lorenz curve plots the cumulative share of people (lightest first) against their cumulative share of the measure. Urgent tasks count recorded urgent assignments in the 30 days before now; people without an urgent-history record are left out rather than counted as zero. With small teams, a single task moves these numbers noticeably.', '평균과 중앙값은 팀의 재직 인원 기준입니다. 표준편차는 팀 전체를 모집단으로 보아 √(Σ(x−평균)²/n)으로 계산합니다. 지니 = 2·Σ(i·xᵢ)/(n·Σx) − (n+1)/n (오름차순 정렬)이며, 0은 모두 같은 양, (n−1)/n은 한 명이 전부를 맡은 상태입니다. 로렌츠 곡선은 적게 맡은 사람부터 누적한 인원 비율과 누적 업무 비율을 보여 줍니다. 긴급 업무는 현재 시점 이전 30일간 기록된 긴급 배정 수이며, 기록이 없는 인원은 0으로 세지 않고 제외합니다. 인원이 적으면 업무 1건으로도 수치가 크게 달라질 수 있습니다.')}</p>
          <table className="data-table"><thead><tr><th>{t('Person', '팀원')}</th><th>{t('Hours', '시간')}</th><th>{t('Utilization', '업무 비율')}</th><th>{t('Urgent · 30d', '긴급 · 30일')}</th></tr></thead>
            <tbody>{rosterLoad.map((row) => <tr key={row.person.id}><th>{nameOf(row.person, lang)}</th><td>{fmt(hours(row.used))}h / {fmt(hours(row.regular))}h</td><td>{Math.round(row.ratio * 100)}%</td><td>{row.urgent30 ?? t('No record', '기록 없음')}</td></tr>)}</tbody></table>
        </details>
      </div>
    </section>

    {/* Assignment replay */}
    <section className="panel"><PanelTitle icon={BarChart3} title={t('Assignment replay', '배정 시뮬레이션')} subtitle={t('Same request order, starting calendar, deadlines, and demo policy.', '요청 순서, 시작 캘린더, 마감 및 데모 정책이 동일합니다.')} actions={<Label tone="peach"><FlaskConical size={13} />{t('Simulated', '시뮬레이션')}</Label>} />
      <div className="panel-body chart-body">
        <div className="sx-legend sx-legend-toggle" role="group" aria-label={t('Show or hide series', '시리즈 표시/숨기기')}>
          {series.map((item) => <button key={item.id} type="button" aria-pressed={!hiddenSeries[item.id]} onClick={() => setHiddenSeries((current) => ({ ...current, [item.id]: !current[item.id] }))}><i style={{ background: item.color }} />{item.name}</button>)}
        </div>
        <figure className="chart-slot sx-figure" role="img" aria-label={t('Replay outcomes', '시뮬레이션 결과') + ': ' + counts.map((item) => `${item.name} Flow ${item.relay}/${n}, ${baselineName} ${item.baseline}/${n}`).join('; ')}>
          <ResponsiveContainer width="100%" height={255}>
            <BarChart data={counts} margin={{ top: 12, right: 8, bottom: 0, left: -8 }} barGap={2}>
              <CartesianGrid vertical={false} stroke={colors.grid} strokeDasharray="3 3" />
              <XAxis dataKey="name" tickLine={false} axisLine={false} tick={axisTick} />
              <YAxis allowDecimals={false} domain={[0, Math.max(1, n)]} ticks={Array.from({ length: Math.max(1, n) + 1 }, (_, i) => i)} tickLine={false} axisLine={false} tick={axisTick} width={44} />
              <Tooltip cursor={{ fill: colors.cursor }} wrapperStyle={{ outline: 'none' }} contentStyle={tooltipBox} content={({ active: on, payload, label }) => {
                if (!on || !payload?.length) return null
                return <div className="chart-tooltip sx-tip"><strong>{String(label)}</strong>
                  {payload.map((entry) => <div key={String(entry.dataKey)}><i className="sx-key" style={{ background: entry.dataKey === 'relay' ? 'var(--primary)' : colors.peach }} /><b>{String(entry.value)} / {n}</b><span>{String(entry.name)}</span></div>)}
                </div>
              }} />
              <Bar dataKey="relay" name="Flow" hide={!!hiddenSeries.relay} fill="var(--primary)" radius={[4, 4, 0, 0]} maxBarSize={48} activeBar={{ fillOpacity: 0.8 }} {...anim} />
              <Bar dataKey="baseline" name={baselineName} hide={!!hiddenSeries.baseline} fill={colors.peach} radius={[4, 4, 0, 0]} maxBarSize={48} activeBar={{ fillOpacity: 0.8 }} {...anim} />
            </BarChart>
          </ResponsiveContainer>
        </figure>
        <div className="table-scroll"><table className="data-table"><thead><tr><th>{t('Measure', '지표')}</th><th>Flow</th><th>{baselineName}</th></tr></thead><tbody>
          {counts.map((item) => <tr key={item.name}><th>{item.name}</th><td>{item.relay} / {n}</td><td>{item.baseline} / {n}</td></tr>)}
          <tr><th>{t('Capacity shortfall', '배정 시간 부족')}</th><td>{minutes(simulation.relay.shortfall, lang)}</td><td>{minutes(simulation.baseline.shortfall, lang)}</td></tr>
          <tr><th>{t('Projected overtime', '예상 초과근무')}</th><td>{minutes(simulation.relay.overtime, lang)} · {simulation.relay.overtimeCount}/{n} {t('requests', '요청')}</td><td>{minutes(simulation.baseline.overtime, lang)} · {simulation.baseline.overtimeCount}/{n} {t('requests', '요청')}</td></tr>
          <tr><th>{t('Repeated overload', '반복 과부하')}</th><td>{simulation.relay.repeat} / {simulation.relay.people} {t('employees', '명')}</td><td>{simulation.baseline.repeat} / {simulation.baseline.people} {t('employees', '명')}</td></tr>
        </tbody></table></div>
        <details className="inline-details"><summary>{t('Replay requests and outcomes', '시뮬레이션 요청 및 결과')}</summary><p>{t('Deferred means some effort fit before the deadline. Blocked means no work was booked. Overtime is projected only when an extended-hours plan can finish before the deadline. Repeated overload means at least two threshold weeks among people with at least two verified or projected weeks.', '지연은 마감 전 일부 작업만 가능하다는 뜻입니다. 배정 불가는 예약된 작업이 없는 경우입니다. 근무 외 시간을 사용해 마감 전에 완료할 수 있을 때 예상 초과근무를 표시합니다. 확인되거나 예상된 주가 2주 이상인 사람 중 2주 이상 기준치를 넘으면 반복 과부하로 계산합니다.')}</p><table className="data-table"><thead><tr><th>{t('Request', '요청')}</th><th>Flow</th><th>{baselineName}</th></tr></thead><tbody>{simulation.relay.rows.map((row, i) => <tr key={row.title}><th>{row.title}</th><td>{labels[row.outcome as keyof typeof labels]} · {minutes(row.shortfall, lang)}</td><td>{labels[simulation.baseline.rows[i].outcome as keyof typeof labels]} · {minutes(simulation.baseline.rows[i].shortfall, lang)}</td></tr>)}</tbody></table></details>
      </div>
    </section>

    <section className="panel"><PanelTitle icon={CalendarClock} title={t('Team pressure points', '팀 일정 부담 요인')} /><div className="panel-body stats-grid">
      <div><strong>{reqLate}/{n}</strong><span>{t('Late prerequisite windows', '늦은 선행 조건')}</span></div><div><strong>{collisions}/{n}</strong><span>{t('Deadlines within two hours of another', '다른 요청과 2시간 이내 마감')}</span></div><div><strong>{skillGaps.length}</strong><span>{t('Skills with one verified level 4+ owner', '레벨 4 이상 검증 담당자가 한 명인 스킬')}</span></div><div><strong>{multi}/{eligibleWeeks}</strong><span>{t('Employees with repeated overload', '반복 과부하 팀원')}</span></div>
    </div></section>
  </div>
}
