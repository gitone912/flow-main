import { useEffect, useRef, useState, type ReactNode } from 'react'
import { ArrowRight, Bot, CalendarCheck2, Check, Database, EyeOff, FileSpreadsheet, Gauge, HeartHandshake, Loader2, Lock, Pause, Play, Scale, ServerCog, ShieldCheck, Sparkles, UserCheck, Users, Wand2 } from 'lucide-react'
import { extractViaApi, type Health } from './api'
import { catalog, displayTime, minutes, skillLabel, type Language, type Task } from './domain'
import type { ExtractResponse } from './extract'
import { exampleRequest } from './seed'
import { FloGuide } from './Mascot'
import { KoreanLaw } from './KoreanLaw'
import { Label, PanelTitle, PrivacyNote, useCountUp, type Translate } from './ui'

type Row = { icon: typeof Bot; title: string; body: string }
type Props = { t: Translate; lang: Language; health: Health | null; now: number; team: string; onDemo: () => void; onOpenApp: () => void; onEmployeeView: () => void; onUseRequest: (text: string) => void }

// Sections fade up as they scroll into view; reduced-motion users see them immediately.
function Reveal({ children, delay = 0 }: { children: ReactNode; delay?: number }) {
  const ref = useRef<HTMLDivElement>(null)
  const [shown, setShown] = useState(false)
  useEffect(() => {
    const node = ref.current
    if (!node || typeof IntersectionObserver === 'undefined') { setShown(true); return }
    const observer = new IntersectionObserver(([entry]) => { if (entry.isIntersecting) { setShown(true); observer.disconnect() } }, { threshold: 0.12 })
    observer.observe(node)
    return () => observer.disconnect()
  }, [])
  return <div ref={ref} className={'reveal' + (shown ? ' in' : '')} style={{ transitionDelay: delay + 'ms' }}>{children}</div>
}

function Stat({ value, label, suffix = '' }: { value: number; label: string; suffix?: string }) {
  const ref = useRef<HTMLDivElement>(null)
  const [target, setTarget] = useState(0)
  useEffect(() => {
    const node = ref.current
    if (!node || typeof IntersectionObserver === 'undefined') { setTarget(value); return }
    const observer = new IntersectionObserver(([entry]) => { if (entry.isIntersecting) { setTarget(value); observer.disconnect() } })
    observer.observe(node)
    return () => observer.disconnect()
  }, [value])
  const shown = useCountUp(target, 1100)
  return <div className="about-stat" ref={ref}><strong className="tabular">{Math.round(shown).toLocaleString()}{suffix}</strong><span>{label}</span></div>
}

const FACTORS = [
  { en: 'Skill fit', ko: '스킬 적합도', w: 25 }, { en: 'Relevant experience', ko: '관련 경험', w: 15 }, { en: 'Time left before deadline', ko: '마감 전 여유', w: 15 },
  { en: 'Workload after assignment', ko: '배정 후 업무량', w: 15 }, { en: 'Effect on existing deadlines', ko: '기존 마감 영향', w: 12 }, { en: 'Focus time', ko: '집중 시간', w: 10 }, { en: 'Recent repeated overload', ko: '최근 반복 과부하', w: 8 },
]

function Pipeline({ t, lang }: { t: Translate; lang: Language }) {
  const [active, setActive] = useState(0)
  const [playing, setPlaying] = useState(true)
  const steps = [
    { icon: Sparkles, tag: t('AI', 'AI'), tone: 'violet', title: t('Read the request', '요청 읽기'), body: t('An LLM turns a Korean or English message into a task draft. Zod rejects unknown skills, bad enums or ranges.', 'LLM이 한국어 또는 영어 메시지를 과제 초안으로 바꿉니다. Zod가 알 수 없는 스킬이나 잘못된 값을 거부합니다.') },
    { icon: UserCheck, tag: t('Human', '사람'), tone: 'green', title: t('Lead confirms', '리드 확인'), body: t('Every field is editable. Estimates are labeled and calibrated against similar finished work.', '모든 항목을 수정할 수 있습니다. 추정치는 표시되고, 비슷한 완료 업무로 보정됩니다.') },
    { icon: CalendarCheck2, tag: t('Rules', '규칙'), tone: 'neutral', title: t('Deterministic scheduler', '결정적 스케줄러'), body: t('Eligibility first, then 7 weighted factors out of 100. No AI, and every number is explained.', '먼저 자격을 확인하고, 7개 가중 요소로 100점 만점을 계산합니다. AI 없이, 모든 숫자에 이유가 있습니다.') },
    { icon: ShieldCheck, tag: t('Human', '사람'), tone: 'green', title: t('Approve and recheck', '승인 및 재확인'), body: t('The plan is rechecked against the latest calendar. A double-click cannot double-book.', '최신 캘린더로 계획을 다시 확인합니다. 두 번 눌러도 중복 예약되지 않습니다.') },
  ]
  useEffect(() => {
    if (!playing) return
    const timer = window.setTimeout(() => setActive((i) => (i + 1) % steps.length), 4200)
    return () => window.clearTimeout(timer)
  }, [active, playing, steps.length])
  const demo = [
    <div className="pipe-demo" key="0">
      <p className="pipe-quote">“{t('Fix the React dashboard filter before the 3 p.m. client demo… 3–4 hours, split into 1h+ blocks.', '오후 3시 고객사 데모 전에 React 대시보드 필터 오류 수정… 3~4시간, 1시간 이상 단위로 분할 가능.')}”</p>
      <div className="pipe-chips">{['React 3+', 'TypeScript 3+', t('3–4h', '3~4시간'), t('Urgent', '긴급'), t('Staging access', '스테이징 접근'), '15:00 KST'].map((chip, i) => <span key={chip} style={{ animationDelay: i * 90 + 'ms' }}>{chip}</span>)}</div>
    </div>,
    <ul className="pipe-checks" key="1">{[t('Upper effort 4h is used for booking', '최대 4시간 기준으로 예약'), t('Deadline 15:00 KST confirmed', '마감 15:00 KST 확인'), t('Skill thresholds reviewed', '스킬 기준 검토'), t('Staging access required', '스테이징 접근 필요')].map((item, i) => <li key={item} style={{ animationDelay: i * 120 + 'ms' }}><Check size={14} />{item}</li>)}</ul>,
    <div className="pipe-bars" key="2">{FACTORS.map((factor, i) => <div key={factor.en}><span>{lang === 'ko' ? factor.ko : factor.en}</span><i><b style={{ width: factor.w * 4 + '%', animationDelay: i * 80 + 'ms' }} /></i><em className="tabular">{factor.w}</em></div>)}</div>,
    <div className="pipe-demo" key="3"><div className="pipe-slots"><span className="busy">08–09</span><span className="book">09–12</span><span className="busy">12–13</span><span className="book">13–14</span><span className="free">14–15</span></div><p className="muted">{t('4h booked in two focus blocks · 1h spare before the demo · original calendar untouched until approval.', '집중 블록 2개에 4시간 예약 · 데모 전 1시간 여유 · 승인 전까지 기존 일정 유지.')}</p></div>,
  ]
  return <div className="pipeline">
    <div className="pipe-tabs" role="tablist" aria-label={t('How it works', '작동 방식')}>
      {steps.map(({ icon: Icon, tag, tone, title }, i) => <button key={title} role="tab" aria-selected={active === i} className={'pipe-tab' + (active === i ? ' active' : '') + (i < active ? ' past' : '')} onClick={() => { setActive(i); setPlaying(false) }}>
        <span className="pipe-num">{i < active ? <Check size={13} strokeWidth={3} /> : i + 1}</span><Icon size={16} aria-hidden="true" /><span className="pipe-title">{title}</span><Label tone={tone}>{tag}</Label>
        {active === i && playing && <span className="pipe-progress" key={active} />}
      </button>)}
    </div>
    <div className="pipe-panel" role="tabpanel" key={active}>
      <div className="pipe-text"><strong>{steps[active].title}</strong><p>{steps[active].body}</p>
        <button className="btn ghost slim" onClick={() => setPlaying(!playing)}>{playing ? <Pause size={13} /> : <Play size={13} />}{playing ? t('Pause', '일시정지') : t('Auto-play', '자동 재생')}</button></div>
      {demo[active]}
    </div>
  </div>
}

function TryIt({ t, lang, now, team, onUseRequest }: Pick<Props, 't' | 'lang' | 'now' | 'team' | 'onUseRequest'>) {
  const [text, setText] = useState(() => exampleRequest(lang))
  const [busy, setBusy] = useState(false)
  const [result, setResult] = useState<{ task: Task; meta: ExtractResponse; offline: boolean }>()
  const [elapsed, setElapsed] = useState(0)
  useEffect(() => { setText((current) => current === exampleRequest(lang === 'ko' ? 'en' : 'ko') ? exampleRequest(lang) : current) }, [lang])
  async function run() {
    if (busy || !text.trim()) return
    setBusy(true); setResult(undefined)
    const started = performance.now()
    try { setResult(await extractViaApi(text, team, now)) } finally { setElapsed(Math.round(performance.now() - started)); setBusy(false) }
  }
  const task = result?.task
  const priority = task?.priority ? ({ urgent: t('Urgent', '긴급'), high: t('High', '높음'), routine: t('Routine', '일반') } as Record<string, string>)[task.priority] : ''
  const fields: { label: string; value: string }[] = task ? [
    { label: t('Title', '제목'), value: task.title || '—' },
    { label: t('Required skills', '필수 스킬'), value: task.required.map((r) => skillLabel(r.id, lang) + (r.level ? ' ' + r.level + '+' : '')).join(', ') || '—' },
    { label: t('Effort', '예상 시간'), value: task.max ? (task.min && task.min !== task.max ? minutes(task.min, lang) + '–' : '') + minutes(task.max, lang) : '—' },
    { label: t('Deadline', '마감'), value: task.deadline ? displayTime(task.deadline, lang) : t('Needs a question', '질문 필요') },
    { label: t('Priority', '우선순위'), value: priority || '—' },
    { label: t('Split', '분할'), value: task.split === null ? '—' : task.split ? t('Yes', '가능') + (task.focus ? ' · ' + minutes(task.focus, lang) + '+' : '') : t('No', '불가') },
    { label: t('Access', '접근 권한'), value: task.access.join(', ') || '—' },
  ] : []
  return <div className="tryit">
    <div className="tryit-input">
      <div className="tryit-samples"><span className="muted">{t('Sample:', '예시:')}</span><button className="chip-button" onClick={() => setText(exampleRequest('ko'))}>한국어</button><button className="chip-button" onClick={() => setText(exampleRequest('en'))}>English</button><button className="chip-button" onClick={() => setText(t('Can someone write SQL for the monthly churn report by Friday 6pm? Probably 2 hours, not urgent.', '금요일 오후 6시까지 월간 이탈률 리포트용 SQL 작성 부탁드려요. 2시간 정도, 급하지 않아요.'))}>SQL</button></div>
      <textarea rows={5} value={text} onChange={(event) => setText(event.target.value)} aria-label={t('Work request', '업무 요청')} onKeyDown={(event) => { if ((event.ctrlKey || event.metaKey) && event.key === 'Enter') void run() }} />
      <div className="actions start"><button className="btn primary" onClick={() => void run()} disabled={busy || !text.trim()}>{busy ? <Loader2 size={15} className="spin" /> : <Wand2 size={15} />}{busy ? t('Reading…', '읽는 중…') : t('Draft with AI', 'AI로 초안 작성')}</button><span className="muted small">Ctrl + Enter · {t('Nothing is booked', '예약되지 않음')}</span></div>
    </div>
    <div className={'tryit-output' + (result ? ' ready' : '')} aria-live="polite">
      {!result && !busy && <p className="muted tryit-empty"><Sparkles size={16} />{t('The extracted task draft appears here.', '추출된 과제 초안이 여기에 표시됩니다.')}</p>}
      {busy && <div className="tryit-skeleton">{Array.from({ length: 6 }, (_, i) => <span key={i} className="sk sk-line" style={{ width: 40 + (i * 23) % 50 + '%' }} />)}</div>}
      {result && <>
        <div className="tryit-meta"><Label tone={result.meta.mode === 'live' ? 'green' : 'peach'}>{result.meta.mode === 'live' ? t('Live AI', '실시간 AI') + ' · ' + (result.meta.provider || '') : t('Rule-based fallback', '규칙 기반 대체')}</Label><span className="muted small tabular">{elapsed} ms</span></div>
        <dl className="tryit-fields">{fields.map((field, i) => <div key={field.label} style={{ animationDelay: i * 60 + 'ms' }}><dt>{field.label}</dt><dd>{field.value}</dd></div>)}</dl>
        {!!task?.questions.length && <div className="tryit-questions"><strong>{t('Questions for the lead', '리드에게 묻는 질문')}</strong><ul>{task.questions.map((q) => <li key={q}>{q}</li>)}</ul></div>}
        {result.meta.calibration?.calibrationNote && <p className="muted small">⟲ {result.meta.calibration.calibrationNote}</p>}
        <div className="actions start"><button className="btn secondary slim" onClick={() => onUseRequest(text)}>{t('Continue in the app', '앱에서 이어서 하기')}<ArrowRight size={14} /></button></div>
      </>}
    </div>
  </div>
}

function Payload({ t, lang }: { t: Translate; lang: Language }) {
  const [open, setOpen] = useState(false)
  const sample = JSON.stringify({ text: exampleRequest(lang).slice(0, 60) + '…', now: '2026-11-24T09:00:00+09:00', timezone: 'Asia/Seoul', skill_catalog: [...catalog.slice(0, 3).map((item): Record<string, string> => ({ id: item.id, en: item.en, ko: item.ko })), { more: '+' + (catalog.length - 3) }] }, null, 2)
  return <div className="payload">
    <button className={'btn secondary slim' + (open ? ' chosen' : '')} aria-expanded={open} onClick={() => setOpen(!open)}><Bot size={14} />{open ? t('Hide the AI payload', 'AI 전송 내용 숨기기') : t('Show exactly what the AI receives', 'AI가 받는 내용 그대로 보기')}</button>
    <div className={'expand' + (open ? ' open' : '')}><div><pre className="payload-code">{sample}</pre><p className="muted small">{t('No names, calendars, skill levels or scores are in this request.', '이 요청에는 이름, 캘린더, 스킬 레벨, 점수가 포함되지 않습니다.')}</p></div></div>
  </div>
}

// The landing page: why Flow fits the theme, a live AI sample, where every number comes from, and what stays private.
export function About({ t, lang, health, now, team, onDemo, onOpenApp, onEmployeeView, onUseRequest }: Props) {
  const theme: Row[] = [
    { icon: Gauge, title: t('Urgent work lands on whoever answers first', '급한 일은 먼저 응답한 사람에게 몰립니다'), body: t('Leads usually hand urgent requests to the previous owner, even when that person has one free hour. Flow checks real calendars and finds who can actually finish on time.', '리드는 보통 이전 담당자에게 급한 일을 맡깁니다. 그 사람이 한 시간밖에 여유가 없어도요. Flow는 실제 캘린더를 확인해 제시간에 끝낼 수 있는 사람을 찾습니다.') },
    { icon: Scale, title: t('Fair rotation, not a leaderboard', '순위표가 아닌 공정한 순환'), body: t('When candidates score within 5 points, the person with fewer recent urgent assignments goes first. The repeat burden spreads across the team.', '후보 점수 차이가 5점 이내이면 최근 긴급 업무가 적은 사람이 먼저 배정됩니다. 반복되는 부담이 팀 전체에 나뉩니다.') },
    { icon: HeartHandshake, title: t('Sustainable pace by design', '지속 가능한 업무 속도'), body: t('Breaks, reserve time, daily and weekly limits and existing deadlines are hard constraints. Flow never fills a plan with overtime.', '휴식, 예비 시간, 일·주 단위 근무 한도, 기존 마감은 반드시 지켜야 하는 제약입니다. Flow는 초과 근무로 계획을 채우지 않습니다.') },
    { icon: UserCheck, title: t('People stay in control', '결정은 사람이 합니다'), body: t('AI only drafts and explains. The lead confirms every field and approves the assignment. Employees can see why they were chosen, correct their data and request a review.', 'AI는 초안 작성과 설명만 합니다. 리드가 모든 항목을 확인하고 배정을 승인합니다. 팀원은 배정 이유를 확인하고, 본인 정보를 정정하고, 검토를 요청할 수 있습니다.') },
  ]
  const sources: { icon: typeof Bot; name: string; kind: string; tone: string; detail: string }[] = [
    { icon: FileSpreadsheet, name: t('Employee roster', '직원 명단'), kind: t('Supplied CSV', '제공된 CSV'), tone: 'neutral', detail: t('fake_employee.csv · 1,000 rows: name, department, manager group, job title, employment type, shift, status.', 'fake_employee.csv · 1,000행: 이름, 부서, 관리 그룹, 직무, 고용 형태, 근무조, 재직 상태.') },
    { icon: Users, name: t('Skill profiles', '스킬 프로필'), kind: t('Synthetic', '합성'), tone: 'violet', detail: t('58 skills, levels 1–5, work examples and access windows, generated per department by scripts/prepare-roster.ts.', '58개 스킬, 1–5 레벨, 업무 사례, 접근 권한 시간대를 scripts/prepare-roster.ts가 부서별로 생성합니다.') },
    { icon: CalendarCheck2, name: t('Calendar and history', '캘린더 및 이력'), kind: t('Synthetic', '합성'), tone: 'violet', detail: t('Seeded meetings, reviews, on-call, leave and past urgent work, anchored to 24 Nov 2026 09:00 KST.', '2026년 11월 24일 09:00 KST 기준으로 생성된 회의, 리뷰, 온콜, 휴가, 과거 긴급 업무.') },
    { icon: Database, name: t('Effort benchmark', '작업 시간 기준'), kind: t('Static', '정적'), tone: 'neutral', detail: t('Estimated vs. actual minutes of finished tasks (src/estimates.ts), used to calibrate AI estimates.', '완료 과제의 예상·실제 시간(src/estimates.ts)으로 AI 추정치를 보정합니다.') },
    { icon: Bot, name: t('Language model', '언어 모델'), kind: health?.llmConfigured ? t('Live', '연결됨') : t('Fallback', '대체 모드'), tone: health?.llmConfigured ? 'green' : 'peach', detail: health?.llmConfigured ? t('Server-side ' + (health.llmProvider || 'LLM') + ' · ' + (health.llmModel || '') + '. The API key never reaches the browser.', '서버 측 ' + (health.llmProvider || 'LLM') + ' · ' + (health.llmModel || '') + '. API 키는 브라우저로 전달되지 않습니다.') : t('No key or API offline: a rule-based parser drafts the task instead. The flow still works end to end.', '키가 없거나 API가 오프라인이면 규칙 기반 파서가 초안을 작성합니다. 전체 흐름은 그대로 동작합니다.') },
    { icon: ServerCog, name: t('Integrations', '외부 연동'), kind: t('MVP stub', 'MVP 스텁'), tone: 'neutral', detail: t('Google Calendar, Jira, GitHub reviews and on-call sync are documented static endpoints. Nothing connects to a real account.', 'Google Calendar, Jira, GitHub 리뷰, 온콜 동기화는 문서화된 정적 엔드포인트입니다. 실제 계정과 연결되지 않습니다.') },
  ]
  const sent = [t('The request or message text you typed', '입력한 요청·메시지 문장'), t('The reference clock and skill catalog', '기준 시각과 스킬 목록'), t('Factor numbers with labels like [A] — never names', '[A] 같은 기호와 요소 점수 — 이름 없음'), t('Team-level totals for the weekly brief', '주간 브리핑용 팀 단위 합계')]
  const kept = [t('Names and employee records', '이름과 직원 기록'), t('Calendars and commitments', '캘린더와 일정'), t('Skill levels and scores', '스킬 레벨과 점수'), t('Workload and urgent history', '업무량과 긴급 업무 이력')]
  const never = [t('HR evaluation or performance review', '인사 평가 또는 성과 평가'), t('Activity monitoring or keystroke data', '활동 감시 또는 입력 기록'), t('Health data or inferred stress', '건강 정보 또는 추정 스트레스'), t('Age, gender or other personal attributes', '나이, 성별 등 개인 속성')]
  const [source, setSource] = useState(0)

  return <div className="stack page-stack about">
    <section className="hero2 landing-hero" id="about-hero">
      <img src="/relay-track.png" alt="" className="hero2-art" aria-hidden="true" />
      <div className="hero2-body">
        <span className="hero2-eyebrow"><span className="live-dot" />{t('Fair routing for urgent work · Seoul', '긴급 업무 공정 배분 · 서울')}</span>
        <h1>{t('Urgent work goes to whoever has real focus time — not whoever answers first.', '긴급 업무는 먼저 답한 사람이 아니라, 실제로 집중할 시간이 있는 사람에게.')}</h1>
        <p>{t('AI reads the request and explains the choice. Transparent rules check real calendars, fair rotation and the 52-hour week. The lead approves; the employee can see why.', 'AI는 요청을 읽고 선택을 설명합니다. 투명한 규칙이 실제 일정, 공정한 순환, 주 52시간을 확인합니다. 승인은 리드가, 이유는 팀원도 봅니다.')}</p>
        <div className="hero2-actions"><button className="btn hero-primary lg" onClick={onDemo}>{t('Try the 4h urgent demo', '4시간 긴급 데모 실행')}<ArrowRight size={15} /></button><button className="btn hero-ghost lg" onClick={onOpenApp}>{t('Open the dashboard', '대시보드 열기')}</button></div>
        <button className="hero2-link" onClick={onEmployeeView}>{t('See what an employee sees →', '팀원이 보는 화면 보기 →')}</button>
      </div>
    </section>
    <div className="about-stats" id="about-stats"><Stat value={1000} label={t('employees in the roster', '명단 속 직원')} /><Stat value={58} label={t('skills in the catalog', '스킬 목록')} /><Stat value={52} suffix="h" label={t('weekly legal limit, always respected', '주 법정 한도 · 항상 준수')} /><Stat value={5} label={t('AI helpers · drafts only', 'AI 도우미 · 초안만 작성')} /></div>

    <FloGuide t={t} onDemo={onDemo} onOpenApp={onOpenApp} />

    <Reveal><section className="panel" id="about-try"><PanelTitle icon={Wand2} title={t('Try the AI intake', 'AI 요청 분석 체험')} subtitle={t('Type any request in Korean or English. Flow drafts the task; you would review it before anything is booked.', '한국어나 영어로 아무 요청이나 입력해 보세요. Flow가 과제 초안을 만들고, 예약 전에 리드가 검토합니다.')} />
      <div className="panel-body"><TryIt t={t} lang={lang} now={now} team={team} onUseRequest={onUseRequest} /></div>
    </section></Reveal>

    <Reveal><section className="panel" id="about-theme"><PanelTitle icon={HeartHandshake} title={t('Theme fit', '주제 적합성')} subtitle={t('The problem and how Flow answers it', '해결하려는 문제와 Flow의 답')} />
      <div className="panel-body about-grid">{theme.map(({ icon: Icon, title, body }) => <div className="about-card" key={title}><Icon size={18} aria-hidden="true" /><strong>{title}</strong><p>{body}</p></div>)}</div>
    </section></Reveal>

    <Reveal><section className="panel" id="about-how"><PanelTitle icon={Sparkles} title={t('How it works', '작동 방식')} subtitle={t('Click a step — AI drafts, rules decide, people approve', '단계를 눌러 보세요 — AI는 초안, 규칙은 계산, 사람은 승인')} />
      <div className="panel-body"><Pipeline t={t} lang={lang} /></div>
    </section></Reveal>

    <Reveal><section className="panel" id="about-data"><PanelTitle icon={Database} title={t('Data sources', '데이터 출처')} subtitle={t('Every record in this demo is synthetic or supplied', '이 데모의 모든 기록은 합성 데이터이거나 제공된 데이터입니다')} />
      <div className="panel-body about-sources-grid">
        <div className="source-list" role="tablist" aria-label={t('Data sources', '데이터 출처')}>{sources.map(({ icon: Icon, name, kind, tone }, i) => <button key={name} role="tab" aria-selected={source === i} className={'source-item' + (source === i ? ' active' : '')} onClick={() => setSource(i)} onMouseEnter={() => setSource(i)}><Icon size={16} aria-hidden="true" /><span>{name}</span><Label tone={tone}>{kind}</Label></button>)}</div>
        <div className="source-detail" role="tabpanel" key={source}>{(() => { const { icon: Icon, name, detail } = sources[source]; return <><Icon size={22} aria-hidden="true" /><strong>{name}</strong><p>{detail}</p></> })()}</div>
      </div>
    </section></Reveal>

    <Reveal><section className="panel" id="about-privacy"><PanelTitle icon={Lock} title={t('Privacy', '개인정보 보호')} subtitle={t('What leaves the browser, what stays, and what Flow never uses', '브라우저 밖으로 나가는 것, 남는 것, 절대 쓰지 않는 것')} />
      <div className="panel-body stack">
        <div className="about-columns">
          <div><h3 className="small-heading"><Bot size={14} />{t('Sent to the LLM', 'LLM으로 전송')}</h3><ul className="about-list">{sent.map((item) => <li key={item}>{item}</li>)}</ul></div>
          <div><h3 className="small-heading"><Lock size={14} />{t('Stays in your browser', '브라우저에만 저장')}</h3><ul className="about-list">{kept.map((item) => <li key={item}>{item}</li>)}</ul></div>
          <div><h3 className="small-heading"><EyeOff size={14} />{t('Never used', '절대 사용하지 않음')}</h3><ul className="about-list never">{never.map((item) => <li key={item}>{item}</li>)}</ul></div>
        </div>
        <Payload t={t} lang={lang} />
        <ul className="compliance-strip" aria-label={t('Compliance principles', '준수 원칙')}>
          {[
            [t('PIPA · data minimisation', '개인정보보호법 · 최소 수집'), t('Only scheduling data; no health, age or gender', '일정 데이터만 · 건강·나이·성별 미사용')],
            [t('PIPA · purpose limitation', '개인정보보호법 · 목적 제한'), t('Workload balance only, never HR evaluation', '업무 분배에만 · 인사 평가 미사용')],
            [t('Right to access & correct', '열람·정정권'), t('Employees see, correct and export their data', '팀원이 직접 열람·정정·내보내기')],
            [t('52-hour workweek', '주 52시간 근무제'), t('Plans stay inside 40h regular + 12h extended', '정규 40시간 + 연장 12시간 이내로 계획')],
          ].map(([title, body]) => <li key={title}><ShieldCheck size={15} aria-hidden="true" /><span><strong>{title}</strong><small>{body}</small></span></li>)}
        </ul>
        <PrivacyNote t={t} />
      </div>
    </section></Reveal>

    <Reveal><KoreanLaw t={t} /></Reveal>
  </div>
}
