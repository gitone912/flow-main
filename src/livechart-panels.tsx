import { useEffect, useMemo, useRef, useState, type CSSProperties, type KeyboardEvent } from 'react'
import { ArrowUpRight } from 'lucide-react'
import { minutes, type Employee, type Language } from './domain'
import type { DayModel } from './Timeline'
import { Avatar, nameOf, roleOf, type Translate } from './ui'
import { anchorOf, LiveTip, useChangeTick, useMounted, useTip } from './livechart-kit'

/* ---------- Live KST clock ----------
   Real wall-clock time, independent of workspace.now (the demo reference time that scheduling uses). */
export function LiveClock({ lang, t }: { lang: Language; t: Translate }) {
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    let timer = 0
    const tick = () => {
      window.clearTimeout(timer)
      if (document.hidden) return
      setNow(Date.now())
      timer = window.setTimeout(tick, 1000 - (Date.now() % 1000) + 5) // aligned to the next second
    }
    const onVisible = () => { if (!document.hidden) tick() }
    tick()
    document.addEventListener('visibilitychange', onVisible)
    return () => { window.clearTimeout(timer); document.removeEventListener('visibilitychange', onVisible) }
  }, [])
  const locale = lang === 'ko' ? 'ko-KR' : 'en-GB'
  const date = useMemo(() => new Intl.DateTimeFormat(locale, lang === 'ko'
    ? { timeZone: 'Asia/Seoul', year: 'numeric', month: 'long', day: 'numeric', weekday: 'short' }
    : { timeZone: 'Asia/Seoul', weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' }), [locale, lang])
  const time = useMemo(() => new Intl.DateTimeFormat('en-GB', { timeZone: 'Asia/Seoul', hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23' }), [])
  const parts = date.formatToParts(now)
  const part = (type: Intl.DateTimeFormatPartTypes) => parts.find((p) => p.type === type)?.value || ''
  const dateText = lang === 'ko'
    ? `${part('year')}년 ${part('month')} ${part('day')}일 (${part('weekday')})`
    : `${part('weekday')}, ${part('day')} ${part('month')} ${part('year')}`
  const iso = new Date(now).toISOString()
  return <span className="lc-clock">
    <span className="lc-clock-label"><span className="lc-clock-dot" aria-hidden="true" />{t('Now (live)', '지금 (실시간)')}</span>
    <time dateTime={iso} className="tabular">{dateText} · {time.format(now)} KST</time>
  </span>
}

/* ---------- Interactive 5-day capacity heatmap ---------- */
export type HeatCell = { day: number; workable: number; focus: number; longest: number; overlaps: number; model: DayModel }
type HeatProps = {
  grid: { person: Employee; cells: HeatCell[] }[]; days: number[]; lang: Language; t: Translate
  dayLabel: (day: number, i: number) => string; heat: (focus: number, workable: number) => number; onPerson: (id: string) => void
}

const hm = (m: number, lang: Language) => m ? minutes(m, lang) : lang === 'ko' ? '0분' : '0m'

export function LiveHeatmap({ grid, days, lang, t, dayLabel, heat, onPerson }: HeatProps) {
  const [tip, setTip] = useTip()
  const [row, setRow] = useState<string | null>(null)
  const [col, setCol] = useState<number | null>(null)
  const [levels, setLevels] = useState<number[]>([])
  const [clashOnly, setClashOnly] = useState(false)
  const [cursor, setCursor] = useState({ r: 0, c: 0 })
  const gridRef = useRef<HTMLDivElement>(null)

  // Live: remember each cell's numbers; cells whose numbers change after an approval pulse once.
  const memory = useRef(new Map<string, string>())
  const [changed, setChanged] = useState<Set<string>>(new Set())
  const signature = grid.map(({ person, cells }) => person.id + cells.map((c) => `${c.workable}.${c.focus}.${c.overlaps}`).join(',')).join('|')
  useEffect(() => {
    const next = new Map<string, string>(), diff = new Set<string>()
    for (const { person, cells } of grid) for (const cell of cells) {
      const key = person.id + ':' + cell.day, value = `${cell.workable}.${cell.focus}.${cell.overlaps}`
      next.set(key, value)
      if (memory.current.size && memory.current.get(key) !== undefined && memory.current.get(key) !== value) diff.add(key)
    }
    memory.current = next
    if (!diff.size) return
    setChanged(diff)
    const timer = window.setTimeout(() => setChanged(new Set()), 1800)
    return () => window.clearTimeout(timer)
  }, [signature]) // eslint-disable-line react-hooks/exhaustive-deps

  const under2h = [0, 1, 2]
  const under2hOn = levels.length === 3 && under2h.every((n) => levels.includes(n))
  const matches = (cell: HeatCell) => (!levels.length || levels.includes(heat(cell.focus, cell.workable))) && (!clashOnly || cell.overlaps > 0)
  const total = grid.length * days.length
  const shown = grid.reduce((sum, { cells }) => sum + cells.filter(matches).length, 0)
  const filtering = levels.length > 0 || clashOnly
  const selecting = row !== null || col !== null
  const toggleLevel = (n: number) => setLevels((current) => current.includes(n) ? current.filter((x) => x !== n) : [...current, n].sort())
  const levelName = [t('No open time', '여유 없음'), t('Under 90m open', '여유 90분 미만'), t('90m+ open, no 2h block', '90분+ 여유 · 2시간 블록 없음'), t('2h+ focus block', '2시간+ 집중 블록'), t('4h+ focus time', '4시간+ 집중 시간')]

  const r = Math.min(cursor.r, Math.max(0, grid.length - 1)), c = Math.min(cursor.c, days.length - 1)
  const moveTo = (nr: number, nc: number) => {
    const target = { r: Math.max(0, Math.min(grid.length - 1, nr)), c: Math.max(0, Math.min(days.length - 1, nc)) }
    setCursor(target)
    gridRef.current?.querySelector<HTMLElement>(`[data-cell="${target.r}-${target.c}"]`)?.focus()
  }
  const onCellKey = (event: KeyboardEvent, ri: number, ci: number, id: string) => {
    const moves: Record<string, [number, number]> = { ArrowRight: [ri, ci + 1], ArrowLeft: [ri, ci - 1], ArrowDown: [ri + 1, ci], ArrowUp: [ri - 1, ci], Home: [ri, 0], End: [ri, days.length - 1] }
    if (moves[event.key]) { event.preventDefault(); moveTo(...moves[event.key]) }
    else if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); pin(id, ci) }
    else if (event.key === 'Escape') { setRow(null); setCol(null); setTip(null) }
  }
  const pin = (id: string, ci: number) => {
    if (row === id && col === ci) { setRow(null); setCol(null) } else { setRow(id); setCol(ci) }
  }
  const describe = (person: Employee, cell: HeatCell, i: number) => {
    const meetings = cell.model.busy.filter((block) => block.kind === 'meeting').length
    return {
      title: nameOf(person, lang) + ' · ' + dayLabel(cell.day, i) + ' ' + new Date((cell.day + 540) * 60000).getUTCDate() + t('', '일'),
      rows: [
        { label: t('free focus time (2h+ blocks)', '집중 가능 시간 (2시간+ 블록)'), value: hm(cell.focus, lang), tone: 'focus' as const },
        { label: t('open in total', '전체 여유 시간'), value: hm(cell.workable, lang), tone: 'neutral' as const },
        { label: t('longest open block', '가장 긴 빈 시간'), value: hm(cell.longest, lang), tone: 'neutral' as const },
        { label: t('meetings', '회의'), value: String(meetings) + t('', '건'), tone: 'primary' as const },
        ...(cell.overlaps ? [{ label: t('overlapping commitments', '겹치는 일정'), value: String(cell.overlaps) + t('', '건'), tone: 'risk' as const }] : []),
      ],
    }
  }

  return <div className="lc-heat">
    <div className="heat" role="grid" aria-label={t('Team capacity, next 5 days. Arrow keys move between cells; Enter highlights the row and column.', '팀 가용 시간, 향후 5일. 방향키로 칸 이동, Enter로 행과 열 강조.')} ref={gridRef}
      data-selecting={selecting || undefined} onPointerLeave={() => setTip(null)}>
      <div className="heat-row heat-head" role="row">
        <span role="columnheader" className="lc-corner">{selecting && <button type="button" className="lc-clear" onClick={() => { setRow(null); setCol(null) }}>{t('Clear', '해제')}</button>}</span>
        {days.map((day, i) => <span role="columnheader" key={day} className={(i === 0 ? 'today' : '') + (col === i ? ' lc-on' : '')}>
          <button type="button" className="lc-day" aria-pressed={col === i} aria-label={t('Highlight ', '강조: ') + dayLabel(day, i)} onClick={() => { setCol(col === i ? null : i); setRow(null) }}>
            {dayLabel(day, i)}<small>{new Date((day + 540) * 60000).getUTCDate()}</small>
          </button>
        </span>)}
      </div>
      {grid.map(({ person, cells }, ri) => <div className={'heat-row' + (row === person.id ? ' lc-row-on' : '')} role="row" key={person.id} style={{ '--r': ri } as CSSProperties}>
        <span role="rowheader" className="lc-rowhead">
          <button type="button" className="heat-person" aria-pressed={row === person.id} onClick={() => { setRow(row === person.id ? null : person.id); setCol(null) }}
            aria-label={t('Highlight ', '강조: ') + nameOf(person, lang)}>
            <Avatar person={person} size="small" /><span>{nameOf(person, lang)}</span>
          </button>
          {row === person.id && <button type="button" className="lc-open" onClick={() => onPerson(person.id)} aria-label={t('Open profile: ', '프로필 열기: ') + nameOf(person, lang)} title={t('Open profile', '프로필 열기')}><ArrowUpRight size={14} /></button>}
        </span>
        {cells.map((cell, i) => {
          const level = heat(cell.focus, cell.workable)
          const key = person.id + ':' + cell.day
          const lit = !selecting || row === person.id || col === i
          const info = describe(person, cell, i)
          return <div role="gridcell" key={cell.day} data-cell={ri + '-' + i} tabIndex={ri === r && i === c ? 0 : -1}
            aria-selected={selecting ? row === person.id && col === i : undefined}
            aria-label={info.title + ': ' + info.rows.map((x) => x.label + ' ' + x.value).join(', ') + (matches(cell) ? '' : t(' (filtered out)', ' (필터 제외)'))}
            className={'heat-cell lc-cell h' + level + (cell.overlaps ? ' clash' : '') + (lit ? '' : ' lc-dim') + (matches(cell) ? '' : ' lc-out') + (changed.has(key) ? ' lc-changed' : '') + (row === person.id && col === i ? ' lc-pin' : '')}
            style={{ '--c': i } as CSSProperties}
            onPointerEnter={(event) => setTip({ ...anchorOf(event.currentTarget), ...info })}
            onFocus={(event) => { setCursor({ r: ri, c: i }); setTip({ ...anchorOf(event.currentTarget), ...info }) }} onBlur={() => setTip(null)}
            onClick={() => pin(person.id, i)} onKeyDown={(event) => onCellKey(event, ri, i, person.id)}>
            <b className="tabular" aria-hidden="true">{cell.workable >= 60 ? Math.floor(cell.workable / 60) + 'h' : cell.workable ? cell.workable + 'm' : '–'}</b>
          </div>
        })}
      </div>)}
    </div>
    <div className="lc-legend" role="group" aria-label={t('Legend and filter', '범례 및 필터')}>
      <span className="lc-legend-scale">
        <span>{t('Less', '적음')}</span>
        {[0, 1, 2, 3, 4].map((n) => <button type="button" key={n} className={'lc-swatch' + (levels.includes(n) ? ' on' : '')} aria-pressed={levels.includes(n)} aria-label={t('Show only: ', '이것만 보기: ') + levelName[n]} title={levelName[n]} onClick={() => toggleLevel(n)}><i className={'heat-cell h' + n} /></button>)}
        <span>{t('More focus', '집중 많음')}</span>
      </span>
      <button type="button" className={'lc-chip' + (under2hOn ? ' on' : '')} aria-pressed={under2hOn} onClick={() => setLevels(under2hOn ? [] : under2h)}>{t('Under 2h focus', '집중 2시간 미만')}</button>
      <button type="button" className={'lc-chip' + (clashOnly ? ' on' : '')} aria-pressed={clashOnly} onClick={() => setClashOnly(!clashOnly)}><i className="lc-clash-dot" aria-hidden="true" />{t('Overlap', '일정 중복')}</button>
      <span className="lc-count tabular" role="status">{filtering ? t(`${shown} of ${total} cells`, `${total}칸 중 ${shown}칸`) : ''}</span>
      {filtering && <button type="button" className="lc-chip ghost" onClick={() => { setLevels([]); setClashOnly(false) }}>{t('Reset', '초기화')}</button>}
    </div>
    <LiveTip tip={tip} />
  </div>
}

/* ---------- Interactive urgent-load bars with a team-mean marker ---------- */
type LoadProps = { rows: { person: Employee; count: number }[]; mean: number; max: number; lang: Language; t: Translate; onPerson: (id: string) => void }

export function LiveLoad({ rows, mean, max, lang, t, onPerson }: LoadProps) {
  const [tip, setTip] = useTip()
  const [hover, setHover] = useState<string | null>(null)
  const ready = useMounted()
  const memory = useRef(new Map<string, number>())
  const signature = rows.map(({ person, count }) => person.id + ':' + count).join('|')
  const tick = useChangeTick(signature)
  const [bumped, setBumped] = useState<Set<string>>(new Set())
  useEffect(() => {
    const diff = new Set<string>()
    if (memory.current.size) for (const { person, count } of rows) if (memory.current.has(person.id) && memory.current.get(person.id) !== count) diff.add(person.id)
    memory.current = new Map(rows.map(({ person, count }) => [person.id, count]))
    if (!diff.size) return
    setBumped(diff)
    const timer = window.setTimeout(() => setBumped(new Set()), 1800)
    return () => window.clearTimeout(timer)
  }, [tick]) // eslint-disable-line react-hooks/exhaustive-deps

  const meanText = mean.toFixed(1)
  const delta = (count: number) => {
    const d = count - mean
    return (d >= 0 ? '+' : '−') + Math.abs(d).toFixed(1)
  }
  const info = (person: Employee, count: number) => ({
    title: nameOf(person, lang),
    rows: [
      { label: t('urgent tasks · 30 days', '긴급 업무 · 30일'), value: String(count) + t('', '건'), tone: (count >= 3 ? 'risk' : count === 2 ? 'gap' : 'focus') as 'risk' | 'gap' | 'focus' },
      { label: t('team mean', '팀 평균'), value: meanText, tone: 'neutral' as const },
      { label: t('vs mean', '평균 대비'), value: delta(count), tone: 'neutral' as const },
    ],
  })

  return <div className="lc-load" data-hovering={hover !== null || undefined} style={{ '--m': max ? Math.min(1, mean / max) : 0 } as CSSProperties}>
    <ul className="load-bars">{rows.map(({ person, count }, i) => <li key={person.id} style={{ '--i': i } as CSSProperties} className={(hover === person.id ? 'lc-hot' : '') + (bumped.has(person.id) ? ' lc-bumped' : '')}>
      <button type="button" onClick={() => onPerson(person.id)}
        aria-label={t(`${nameOf(person, lang)}: ${count} urgent tasks in 30 days, team mean ${meanText} (${delta(count)}). Open profile`, `${nameOf(person, lang)}: 30일간 긴급 업무 ${count}건, 팀 평균 ${meanText} (${delta(count)}). 프로필 열기`)}
        onPointerEnter={(event) => { setHover(person.id); setTip({ ...anchorOf(event.currentTarget.querySelector('.lc-track-wrap') || event.currentTarget), ...info(person, count) }) }}
        onPointerLeave={() => { setHover(null); setTip(null) }}
        onFocus={(event) => { setHover(person.id); setTip({ ...anchorOf(event.currentTarget.querySelector('.lc-track-wrap') || event.currentTarget), ...info(person, count) }) }}
        onBlur={() => { setHover(null); setTip(null) }}>
        <span className="load-name"><Avatar person={person} size="small" /><span><strong>{nameOf(person, lang)}</strong><small>{roleOf(person, lang)}</small></span></span>
        <span className="lc-track-wrap" aria-hidden="true">
          <span className="load-track lc-track"><span className={'lc-fill ' + (count >= 3 ? 'risk' : count === 2 ? 'gap' : 'focus')} style={{ '--w': ready && max ? count / max : 0 } as CSSProperties} /></span>
          <span className="lc-mean" />
        </span>
        <b className="tabular" aria-hidden="true">{count}</b>
      </button>
    </li>)}</ul>
    <p className="lc-mean-key"><i aria-hidden="true" />{t('Team mean', '팀 평균')} <b className="tabular">{meanText}</b>{t(' urgent tasks per person', '건 / 인')}</p>
    <LiveTip tip={tip} />
  </div>
}

/* Current hour in Seoul (0–23), re-checked every minute, for time-of-day wording such as the greeting. */
export function useKstHour() {
  const read = () => Number(new Intl.DateTimeFormat('en-GB', { timeZone: 'Asia/Seoul', hour: '2-digit', hourCycle: 'h23' }).format(Date.now()))
  const [hourNow, setHourNow] = useState(read)
  useEffect(() => {
    const timer = window.setInterval(() => setHourNow(read()), 60_000)
    return () => window.clearInterval(timer)
  }, [])
  return hourNow
}
