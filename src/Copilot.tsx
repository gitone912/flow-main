import { useEffect, useLayoutEffect, useState } from 'react'
import { ArrowLeft, ArrowRight, Lightbulb, MessageSquareText, Scissors, Sparkles, X } from 'lucide-react'
import { ruleExtract, draftToTask } from './extract'
import { type Block, type Employee, type Language, type Task, type Workspace } from './domain'
import { ScheduleFromMessage, SplitPlanner, TeamBrief, briefInput } from './AiTools'
import { dayModel, FOCUS_MIN } from './Timeline'
import { intersects } from './domain'
import { Select, nameOf, type Translate } from './ui'

type Tab = 'brief' | 'schedule' | 'split'

// A side drawer that gathers every AI helper in one place (Ctrl+J). Each helper only drafts; people confirm.
export function Copilot({ open, close, workspace, people, team, lang, t, simulateFailure, onAddBlocks, onUseTask }: {
  open: boolean; close: () => void; workspace: Workspace; people: Employee[]; team: string; lang: Language; t: Translate; simulateFailure: boolean
  onAddBlocks: (blocks: Block[]) => void; onUseTask: (task: Task) => void
}) {
  const [tab, setTab] = useState<Tab>('brief')
  const [personId, setPersonId] = useState(people[0]?.id || '')
  const [text, setText] = useState('')
  const [splitTask, setSplitTask] = useState<Task>()
  const person = people.find(({ id }) => id === personId) || people[0]
  useEffect(() => {
    if (!open) return
    const key = (event: KeyboardEvent) => { if (event.key === 'Escape') close() }
    window.addEventListener('keydown', key)
    return () => window.removeEventListener('keydown', key)
  }, [open, close])
  const active = people.filter((p) => !p.status || p.status === 'active')
  const models = active.map((p) => dayModel(p, workspace, null))
  const focusHours = Math.round(models.reduce((sum, m) => sum + m.free.filter((w) => w.focus).reduce((acc, w) => acc + w.end - w.start, 0), 0) / 60)
  const overlaps = models.reduce((sum, m) => sum + m.busy.filter((b, i) => m.busy.slice(i + 1).some((o) => intersects(b, o))).length, 0)
  const fragmented = models.filter((m) => m.longest < FOCUS_MIN).length
  const tabs: { id: Tab; icon: typeof Sparkles; label: string }[] = [
    { id: 'brief', icon: Lightbulb, label: t('Team brief', '팀 브리핑') },
    { id: 'schedule', icon: MessageSquareText, label: t('Message → calendar', '메시지 → 일정') },
    { id: 'split', icon: Scissors, label: t('Split a task', '작업 나누기') },
  ]
  return <>
    <div className={'copilot-scrim' + (open ? ' open' : '')} onClick={close} aria-hidden="true" />
    <aside className={'copilot' + (open ? ' open' : '')} aria-label={t('AI assistant', 'AI 도우미')} aria-hidden={!open} inert={!open}>
      <header className="copilot-head"><span className="ai-icon"><Sparkles size={15} /></span><div><strong>{t('Flow AI assistant', 'Flow AI 도우미')}</strong><small>{t('Drafts only · you confirm everything', '초안만 작성 · 확정은 사람이')}</small></div><kbd>Ctrl J</kbd><button className="icon-button" onClick={close} aria-label={t('Close', '닫기')}><X size={17} /></button></header>
      <nav className="copilot-tabs" role="tablist">{tabs.map(({ id, icon: Icon, label }) => <button key={id} role="tab" aria-selected={tab === id} className={tab === id ? 'active' : ''} onClick={() => setTab(id)}><Icon size={14} />{label}</button>)}</nav>
      <div className="copilot-body" key={tab}>
        {tab === 'brief' && <TeamBrief input={briefInput(workspace, people, lang, focusHours, overlaps, fragmented)} t={t} simulateFailure={simulateFailure} auto={open} />}
        {tab === 'schedule' && person && <>
          <label className="copilot-field"><span>{t('Whose calendar', '누구의 일정')}</span><Select value={person.id} onChange={(event) => setPersonId(event.target.value)}>{people.map((p) => <option key={p.id} value={p.id}>{nameOf(p, lang)}</option>)}</Select></label>
          <ScheduleFromMessage key={person.id} person={person} workspace={workspace} lang={lang} t={t} simulateFailure={simulateFailure} onAdd={onAddBlocks} />
        </>}
        {tab === 'split' && <>
          <label className="copilot-field"><span>{t('Describe the work', '작업 설명')}</span><textarea rows={3} value={text} onChange={(event) => { setText(event.target.value); setSplitTask(undefined) }} placeholder={t('e.g. Build the new billing export with API, UI and QA by Friday, about 8 hours', '예: 금요일까지 API, 화면, QA를 포함한 새 정산 내보내기 기능 구현, 약 8시간')} /></label>
          {!splitTask ? <button className="btn secondary slim" disabled={!text.trim()} onClick={() => { const draft = ruleExtract(text); const task = draftToTask(draft, team, text); setSplitTask({ ...task, max: task.max || 480, confirmed: true }) }}><ArrowRight size={14} />{t('Continue', '계속')}</button>
            : <SplitPlanner key={splitTask.raw} task={splitTask} workspace={workspace} lang={lang} t={t} simulateFailure={simulateFailure} compact onUse={(part) => { onUseTask(part); close() }} />}
        </>}
      </div>
    </aside>
  </>
}

/* ---------- First-visit guided tour: a spotlight that walks through the key controls ---------- */
type Stop = { selector: string; title: string; body: string }
export function Tour({ stops, done, t }: { stops: Stop[]; done: () => void; t: Translate }) {
  const [index, setIndex] = useState(0)
  const [rect, setRect] = useState<DOMRect | null>(null)
  const stop = stops[index]
  useLayoutEffect(() => {
    // A selector list may name a fallback (e.g. the menu button on phones, where the sidebar is off-canvas): use the first one actually on screen.
    const measure = () => {
      const onScreen = stop.selector.split(',').flatMap((selector) => [...document.querySelectorAll(selector.trim())]).map((node) => node.getBoundingClientRect())
        .find((r) => r.width > 0 && r.height > 0 && r.right > 0 && r.left < window.innerWidth && r.bottom > 0 && r.top < window.innerHeight)
      setRect(onScreen || null)
    }
    measure()
    window.addEventListener('resize', measure)
    window.addEventListener('scroll', measure, true)
    return () => { window.removeEventListener('resize', measure); window.removeEventListener('scroll', measure, true) }
  }, [stop.selector])
  useEffect(() => {
    const key = (event: KeyboardEvent) => { if (event.key === 'Escape') done(); if (event.key === 'ArrowRight') next(); if (event.key === 'ArrowLeft') setIndex((i) => Math.max(0, i - 1)) }
    window.addEventListener('keydown', key)
    return () => window.removeEventListener('keydown', key)
  })
  const next = () => index + 1 < stops.length ? setIndex(index + 1) : done()
  const pad = 6
  const box = rect ? { top: rect.top - pad, left: rect.left - pad, width: rect.width + pad * 2, height: rect.height + pad * 2 } : null
  const below = !box || box.top + box.height + 200 < window.innerHeight
  const cardStyle = box ? { top: below ? box.top + box.height + 12 : Math.max(12, box.top - 12), left: Math.min(Math.max(12, box.left), window.innerWidth - 332), transform: below ? undefined : 'translateY(-100%)' } : { top: '50%', left: '50%', transform: 'translate(-50%, -50%)' }
  return <div className="tour" role="dialog" aria-modal="true" aria-label={stop.title}>
    {box ? <div className="tour-spot" style={box} /> : <div className="tour-dim" />}
    <div className="tour-card" style={cardStyle} key={index}>
      <span className="tour-step">{index + 1} / {stops.length}</span>
      <strong>{stop.title}</strong><p>{stop.body}</p>
      <div className="tour-dots">{stops.map((_, i) => <i key={i} className={i === index ? 'on' : ''} />)}</div>
      <div className="tour-actions"><button className="btn ghost slim" onClick={done}>{t('Skip', '건너뛰기')}</button>{index > 0 && <button className="btn secondary slim" onClick={() => setIndex(index - 1)}><ArrowLeft size={13} /></button>}<button className="btn primary slim" onClick={next}>{index + 1 < stops.length ? <>{t('Next', '다음')}<ArrowRight size={13} /></> : t('Start', '시작하기')}</button></div>
    </div>
  </div>
}

/* ---------- Celebration burst after a confirmed assignment ---------- */
export function Confetti() {
  const [pieces] = useState(() => Array.from({ length: 26 }, (_, i) => ({ x: (Math.random() - 0.5) * 520, y: -120 - Math.random() * 220, r: Math.random() * 540, d: Math.random() * 120, c: i % 4 })))
  if (typeof matchMedia !== 'undefined' && matchMedia('(prefers-reduced-motion: reduce)').matches) return null
  return <div className="confetti" aria-hidden="true">{pieces.map((p, i) => <i key={i} className={'c' + p.c} style={{ '--x': p.x + 'px', '--y': p.y + 'px', '--r': p.r + 'deg', animationDelay: p.d + 'ms' } as React.CSSProperties} />)}</div>
}
