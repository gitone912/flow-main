import { useEffect, useMemo, useRef, useState } from 'react'
import { ArrowRight, CalendarPlus, Check, Cpu, Lightbulb, ListChecks, Loader2, MessageSquareText, Plus, RefreshCw, Scissors, ShieldCheck, Sparkles, TriangleAlert, Wand2 } from 'lucide-react'
import { assistViaApi } from './api'
import { hiddenWork, labelTokens, type AssistInputs, type AssistKind, type AssistResponse, type CommitmentKind } from './assist'
import { displayTime, hour, minutes, skillLabel, type Block, type Employee, type Language, type Task, type Workspace } from './domain'
import { planTask, type PlanResult } from './scheduler'
import { recentUrgent } from './Timeline'
import { Avatar, Label, nameOf, type Translate } from './ui'

type Result<K extends AssistKind> = AssistResponse<K> & { offline: boolean }

// One hook for every AI helper: loading state, the validated result, and whether it came from the live model.
export function useAssist<K extends AssistKind>(kind: K, simulateFailure = false) {
  const [busy, setBusy] = useState(false)
  const [response, setResponse] = useState<Result<K>>()
  const controller = useRef<AbortController | null>(null)
  useEffect(() => () => controller.current?.abort(), [])
  async function run(input: AssistInputs[K]) {
    controller.current?.abort()
    const next = new AbortController()
    controller.current = next
    setBusy(true)
    try { const result = await assistViaApi(kind, input, { simulateFailure, signal: next.signal }); if (controller.current === next) setResponse(result) }
    catch { /* superseded or unmounted */ }
    finally { if (controller.current === next) setBusy(false) }
  }
  return { busy, response, run, reset: () => setResponse(undefined) }
}

export function AiBadge({ response, t }: { response?: { mode: 'live' | 'fallback'; provider: string; latencyMs: number }; t: Translate }) {
  if (!response) return null
  const live = response.mode === 'live'
  const provider = ({ groq: 'Groq', gemini: 'Gemini', openai: 'OpenAI' } as Record<string, string>)[response.provider] || response.provider
  return <span className={'ai-badge ' + (live ? 'live' : 'rule')} title={live ? undefined : t('AI unavailable — deterministic rules answered', 'AI 사용 불가 · 규칙 기반으로 답변')}>
    {live ? <Cpu size={11} /> : <ShieldCheck size={11} />}{live ? t('AI · ' + provider, 'AI · ' + provider) : t('Rule-based', '규칙 기반')}{response.latencyMs > 0 && <em>{(response.latencyMs / 1000).toFixed(1)}s</em>}
  </span>
}

// Reveals text word by word, like a model streaming; reduced-motion users get it at once.
export function TypeText({ text, speed = 22 }: { text: string; speed?: number }) {
  const [count, setCount] = useState(0)
  const words = useMemo(() => text.split(/(\s+)/), [text])
  useEffect(() => {
    if (matchMedia('(prefers-reduced-motion: reduce)').matches) { setCount(words.length); return }
    setCount(0)
    const timer = window.setInterval(() => setCount((n) => { if (n >= words.length) { window.clearInterval(timer); return n } return n + 1 }), speed)
    return () => window.clearInterval(timer)
  }, [words, speed])
  return <>{words.slice(0, count).join('')}{count < words.length && <span className="type-caret" aria-hidden="true" />}</>
}

function Thinking({ label }: { label: string }) {
  return <div className="ai-thinking" role="status"><span className="ai-orb" aria-hidden="true" /><span>{label}</span><span className="ai-dots" aria-hidden="true"><i /><i /><i /></span></div>
}

/* ---------- 1 · Explain the ranking in plain words ---------- */
export function ExplainCard({ task, plan, lang, t, simulateFailure }: { task: Task; plan: PlanResult; lang: Language; t: Translate; simulateFailure: boolean }) {
  const { busy, response, run } = useAssist('explain', simulateFailure)
  const top = plan.ranked.slice(0, 3)
  const usual = plan.rejected.find((item) => item.employee.id === task.previousOwner)
  const names: Record<string, string> = Object.fromEntries([...top.map((c, i) => [String.fromCharCode(65 + i), nameOf(c.employee, lang)]), ...(usual ? [['U', nameOf(usual.employee, lang)]] : [])])
  const key = top.map((c) => c.employee.id + c.score.toFixed(2)).join('|') + lang
  const input: AssistInputs['explain'] = {
    lang, task: { title: task.title, effortMinutes: task.max || 0, deadline: task.deadline ? hour(task.deadline) : null, urgent: task.priority === 'urgent' },
    candidates: top.map((c, i) => ({ label: String.fromCharCode(65 + i), score: Math.round(c.score * 10) / 10, finish: hour(c.finish), spareMinutes: Math.round(c.free), blocks: c.blocks.length, rotation: c.rotation, urgentCount: c.urgentCount, factors: c.factors.map((f) => ({ id: f.id, weight: f.weight, value: Math.round(f.value * 100) / 100 })) })),
    usual: usual ? { label: 'U', usableMinutes: Math.round(usual.available), reason: usual.issues.map((issue) => issue.code).join(', ') } : null,
  }
  // Re-explains only when the ranking or language actually changes.
  useEffect(() => { if (top.length) void run(input) }, [key]) // eslint-disable-line react-hooks/exhaustive-deps
  if (!top.length) return null
  const result = response?.result
  return <section className="ai-card explain" aria-live="polite">
    <header><span className="ai-icon"><Sparkles size={15} /></span><strong>{t('Why this ranking', '이 순위의 이유')}</strong><AiBadge response={response} t={t} />
      <button className="icon-button small" aria-label={t('Explain again', '다시 설명')} onClick={() => void run(input)} disabled={busy}><RefreshCw size={13} className={busy ? 'spin' : ''} /></button></header>
    {busy && !result ? <Thinking label={t('Reading the factor scores…', '요소별 점수를 읽는 중…')} /> : result && <div className="ai-body" key={response?.latencyMs}>
      <p><TypeText text={labelTokens(result.summary, names)} /></p>
      {result.tradeoff && <p className="muted">{labelTokens(result.tradeoff, names)}</p>}
      {result.watch && <p className="ai-watch"><TriangleAlert size={13} />{labelTokens(result.watch, names)}</p>}
    </div>}
    <footer>{t('Names are replaced by labels before anything is sent. The ranking itself comes from deterministic rules.', '전송 전에 이름은 기호로 바뀝니다. 순위 자체는 결정적 규칙으로 계산됩니다.')}</footer>
  </section>
}

/* ---------- 2 · Split a task into handoff-ready parts, each planned by the scheduler ---------- */
export function SplitPlanner({ task, workspace, lang, t, simulateFailure, onUse, compact = false }: { task: Task; workspace: Workspace; lang: Language; t: Translate; simulateFailure: boolean; onUse: (part: Task) => void; compact?: boolean }) {
  const { busy, response, run } = useAssist('decompose', simulateFailure)
  const effort = task.max || 240
  const start = () => void run({ lang, title: task.title, text: task.raw || task.deliverable || task.title, skills: task.required.map((r) => r.id), effortMinutes: effort, deadline: task.deadline ? new Date(task.deadline * 60000).toISOString() : null })
  // Each part becomes a real Task: required skills subset, its share of effort, and a dependency on the previous part's planned finish.
  const parts = useMemo(() => {
    if (!response) return []
    let available: number | null = null
    return response.result.parts.map((part, i) => {
      const required = part.skills.length ? part.skills.map((id) => ({ id, level: task.required.find((r) => r.id === id)?.level ?? 2 })) : task.required
      const draft: Task = { ...task, id: task.id + ':part' + (i + 1), title: part.title, required, max: part.minutes, min: part.minutes, split: true, focus: Math.min(task.focus || 60, part.minutes),
        dependencies: [...task.dependencies, ...(available !== null ? [{ name: t('Part ' + i + ' handoff', (i) + '단계 인계'), available }] : [])], confirmed: true, previousOwner: '' }
      const best = planTask(draft, workspace).ranked[0]
      available = best ? best.finish : available
      return { part, draft, best }
    })
  }, [response, workspace]) // eslint-disable-line react-hooks/exhaustive-deps
  const allFit = parts.length > 0 && parts.every((p) => p.best)
  return <section className={'ai-card split' + (compact ? ' compact' : '')}>
    <header><span className="ai-icon"><Scissors size={15} /></span><strong>{t('Split into handoff-ready parts', '인계 가능한 단계로 나누기')}</strong><AiBadge response={response} t={t} /></header>
    {!response && !busy && <div className="ai-cta"><p className="muted">{t('AI proposes 2–4 parts with handoffs; the scheduler then finds who can do each part, in order.', 'AI가 인계 지점이 있는 2~4단계를 제안하고, 스케줄러가 단계별로 맡을 사람을 순서대로 찾습니다.')}</p><button className="btn secondary slim" onClick={start}><Wand2 size={14} />{t('Split with AI', 'AI로 나누기')}</button></div>}
    {busy && <Thinking label={t('Finding clean handoff points…', '인계 지점을 찾는 중…')} />}
    {response && !busy && <>
      <ol className="split-parts">{parts.map(({ part, draft, best }, i) => <li key={i} style={{ animationDelay: i * 90 + 'ms' }}>
        <div className="split-head"><span className="split-num">{i + 1}</span><strong>{part.title}</strong><Label tone="neutral">{minutes(part.minutes, lang)}</Label></div>
        <div className="split-skills">{part.skills.map((id) => <span key={id}>{skillLabel(id, lang)}</span>)}</div>
        {best ? <div className="split-fit"><Avatar person={best.employee} size="small" /><span><b>{nameOf(best.employee, lang)}</b> · {t('done by ', '')}{displayTime(best.finish, lang)}{t('', ' 완료')}</span><button className="btn ghost slim" onClick={() => onUse(draft)}>{t('Plan this part', '이 단계 계획')}<ArrowRight size={13} /></button></div>
          : <p className="split-none"><TriangleAlert size={13} />{t('Nobody fits this part before the deadline', '마감 전에 이 단계를 맡을 사람이 없습니다')}</p>}
        {part.handoff && <p className="split-handoff">↳ {part.handoff}</p>}
      </li>)}</ol>
      <div className="split-foot"><Label tone={allFit ? 'green' : 'peach'}>{allFit ? <><Check size={11} />{t('Every part fits before the deadline', '모든 단계가 마감 전에 가능')}</> : t('Some parts still need a change', '일부 단계는 조정 필요')}</Label><button className="btn ghost slim" onClick={start}><RefreshCw size={13} />{t('Try another split', '다르게 나누기')}</button></div>
    </>}
  </section>
}

/* ---------- 3 · Turn an employee's message into calendar blocks ---------- */
const kindTone: Record<CommitmentKind, string> = { meeting: 'neutral', review: 'violet', support: 'peach', 'on-call': 'red', leave: 'green' }
export function ScheduleFromMessage({ person, workspace, lang, t, simulateFailure, onAdd }: { person: Employee; workspace: Workspace; lang: Language; t: Translate; simulateFailure: boolean; onAdd: (blocks: Block[]) => void }) {
  const { busy, response, run, reset } = useAssist('commitments', simulateFailure)
  const [text, setText] = useState('')
  const [skip, setSkip] = useState<number[]>([])
  const samples = lang === 'ko' ? ['내일 오후 2시~3시 고객 통화, 금요일 오후 반차', '목요일 10:00-11:30 코드 리뷰'] : ['Customer call tomorrow 2-3pm, and Friday afternoon off', 'Thu 10:00-11:30 code review']
  const kindName = (kind: CommitmentKind) => ({ meeting: t('Meeting', '회의'), review: t('Code review', '코드 리뷰'), support: t('Support', '지원'), 'on-call': t('On-call', '온콜'), leave: t('Leave', '휴가') })[kind]
  const items = response?.result.items || []
  const chosen = items.filter((_, i) => !skip.includes(i))
  return <section className="ai-card schedule-ai">
    <header><span className="ai-icon"><MessageSquareText size={15} /></span><strong>{t('Tell Flow about your week', '내 일정 말로 알려주기')}</strong><AiBadge response={response} t={t} /></header>
    <p className="muted">{t('Write it the way you would message your lead. AI reads it into calendar blocks you confirm.', '리드에게 메시지 보내듯 적어 주세요. AI가 캘린더 일정으로 바꾸고, 확인 후 추가됩니다.')}</p>
    <div className="tryit-samples">{samples.map((sample) => <button key={sample} className="chip-button" onClick={() => { setText(sample); reset(); setSkip([]) }}>{sample}</button>)}</div>
    <textarea rows={2} value={text} onChange={(event) => setText(event.target.value)} placeholder={samples[0]} aria-label={t('Schedule message', '일정 메시지')} onKeyDown={(event) => { if ((event.ctrlKey || event.metaKey) && event.key === 'Enter' && text.trim()) { setSkip([]); void run({ lang, text, now: workspace.now }) } }} />
    <div className="actions start"><button className="btn secondary slim" disabled={busy || !text.trim()} onClick={() => { setSkip([]); void run({ lang, text, now: workspace.now }) }}>{busy ? <Loader2 size={14} className="spin" /> : <Wand2 size={14} />}{t('Read with AI', 'AI로 읽기')}</button></div>
    {busy && <Thinking label={t('Reading dates and times…', '날짜와 시간을 읽는 중…')} />}
    {response && !busy && (items.length ? <>
      <ul className="ai-blocks">{items.map((item, i) => { const off = skip.includes(i); return <li key={i} className={off ? 'off' : ''} style={{ animationDelay: i * 80 + 'ms' }}>
        <label><input type="checkbox" checked={!off} onChange={() => setSkip(off ? skip.filter((n) => n !== i) : [...skip, i])} /><span><strong>{item.title}</strong><small>{displayTime(Math.round(Date.parse(item.start) / 60000), lang)}–{hour(Math.round(Date.parse(item.end) / 60000))}</small></span><Label tone={kindTone[item.kind]}>{kindName(item.kind)}</Label></label>
      </li> })}</ul>
      <div className="actions start"><button className="btn primary slim" disabled={!chosen.length} onClick={() => { onAdd(chosen.map((item) => ({ id: crypto.randomUUID(), employeeId: person.id, title: item.title, kind: item.kind, start: Math.round(Date.parse(item.start) / 60000), end: Math.round(Date.parse(item.end) / 60000) }))); reset(); setText('') }}><CalendarPlus size={14} />{t('Add ' + chosen.length + ' to my calendar', chosen.length + '건 캘린더에 추가')}</button></div>
    </> : <p className="muted">{t('No clear dates or times found. Try “tomorrow 2–3pm meeting”.', '날짜나 시간을 찾지 못했습니다. “내일 오후 2시~3시 회의”처럼 적어 보세요.')}</p>)}
  </section>
}

/* ---------- 4 · Weekly fairness brief from aggregated, anonymous team numbers ---------- */
export function briefInput(workspace: Workspace, people: Employee[], lang: Language, focusHours: number, overlaps: number, fragmented: number): AssistInputs['brief'] {
  const active = people.filter((person) => !person.status || person.status === 'active')
  const counts = active.map((person) => recentUrgent(person, workspace)).sort((a, b) => b - a)
  const total = counts.reduce((sum, n) => sum + n, 0)
  const owners = new Map<string, number>()
  active.forEach((person) => Object.entries(person.skills).forEach(([id, level]) => { if ((level || 0) >= 3) owners.set(id, (owners.get(id) || 0) + 1) }))
  return {
    lang, teamSize: active.length, urgentTotal: total, topTwoShare: total ? Math.round((counts[0] + (counts[1] || 0)) / total * 100) : 0, urgentCounts: counts,
    focusHours, overlaps, fragmented, pendingReviews: workspace.assignments.filter((record) => record.pending && active.some(({ id }) => id === record.employeeId)).length,
    singleOwnerSkills: [...owners].filter(([, n]) => n === 1).map(([id]) => skillLabel(id, lang)).slice(0, 6), lateRequests: 0,
  }
}
export function TeamBrief({ input, t, simulateFailure, auto = false }: { input: AssistInputs['brief']; t: Translate; simulateFailure: boolean; auto?: boolean }) {
  const { busy, response, run } = useAssist('brief', simulateFailure)
  const key = JSON.stringify(input)
  useEffect(() => { if (auto) void run(input) }, [auto, key]) // eslint-disable-line react-hooks/exhaustive-deps
  const result = response?.result
  return <section className="ai-card brief">
    <header><span className="ai-icon"><Lightbulb size={15} /></span><strong>{t('AI weekly brief', 'AI 주간 브리핑')}</strong><AiBadge response={response} t={t} />
      {result && <button className="icon-button small" aria-label={t('Regenerate', '다시 생성')} onClick={() => void run(input)} disabled={busy}><RefreshCw size={13} className={busy ? 'spin' : ''} /></button>}</header>
    {!result && !busy && <div className="ai-cta"><p className="muted">{t('A short fairness summary from team-level numbers only — nobody is named or scored.', '팀 단위 숫자만으로 만든 공정성 요약입니다. 누구도 이름이 거론되거나 평가되지 않습니다.')}</p><button className="btn secondary slim" onClick={() => void run(input)}><Sparkles size={14} />{t('Write this week’s brief', '이번 주 브리핑 작성')}</button></div>}
    {busy && <Thinking label={t('Looking at this week’s patterns…', '이번 주 패턴을 살펴보는 중…')} />}
    {result && !busy && <div className="ai-body">
      <p className="brief-headline"><TypeText text={result.headline} /></p>
      <ul className="brief-points">{result.points.map((point, i) => <li key={i} style={{ animationDelay: 300 + i * 120 + 'ms' }}>{point}</li>)}</ul>
      {result.actions.length > 0 && <div className="brief-actions"><strong><ListChecks size={14} />{t('Suggested this week', '이번 주 제안')}</strong><ul>{result.actions.map((action, i) => <li key={i} style={{ animationDelay: 600 + i * 120 + 'ms' }}>{action}</li>)}</ul></div>}
    </div>}
  </section>
}

/* ---------- 5 · Hidden work the request implies ---------- */
export function HiddenWorkCheck({ task, lang, t, onAdd }: { task: Task; lang: Language; t: Translate; onAdd: (question: string) => void }) {
  const found = hiddenWork(task.raw || task.deliverable || '', lang).filter((item) => !task.questions.includes(item.question))
  if (!found.length) return null
  return <section className="hidden-work" aria-label={t('Possible hidden work', '숨은 작업 가능성')}>
    <span className="ai-icon small"><Lightbulb size={13} /></span>
    <div><strong>{t('Possible hidden work', '숨은 작업이 있을 수 있어요')}</strong><p>{t('These are often missed in the estimate. Add one as a question to confirm it.', '예상 시간에서 자주 빠지는 항목입니다. 눌러서 확인 질문으로 추가하세요.')}</p>
      <div className="hidden-chips">{found.map((item, i) => <button key={item.id} className="hidden-chip" style={{ animationDelay: i * 70 + 'ms' }} onClick={() => onAdd(item.question)}><Plus size={12} />{item.question}</button>)}</div></div>
  </section>
}
