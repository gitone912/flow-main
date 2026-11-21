import { useCallback, useEffect, useId, useLayoutEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { ArrowRight, ChevronLeft, ChevronRight, Pause, Play, Sparkles, X } from 'lucide-react'
import type { Translate } from './ui'
import './mascot.css'

// "Flo" (플로): the peach relay ball from Flow's relay-track artwork, wearing the brand's lilac lane
// stripes and carrying the relay baton (the urgent task it hands to the right person).
export type Mood = 'wave' | 'point' | 'think' | 'shield' | 'cheer'

export function FlowMascot({ mood = 'wave', size = 220, title = 'Flo' }: { mood?: Mood; size?: number; title?: string }) {
  const id = useId().replace(/:/g, '')
  const g = (name: string) => `${name}-${id}`
  const armUp = mood === 'cheer'
  return <svg className={'flo flo-' + mood} viewBox="0 0 220 240" width={size} height={size * 240 / 220} role="img" aria-label={title}>
    <defs>
      <radialGradient id={g('body')} cx="38%" cy="30%" r="75%">
        <stop offset="0" stopColor="#FFD2B8" /><stop offset=".45" stopColor="#FFA77C" /><stop offset="1" stopColor="#E8673F" />
      </radialGradient>
      <linearGradient id={g('lane')} x1="0" x2="1"><stop offset="0" stopColor="#CFC6FF" /><stop offset="1" stopColor="#9C8CF5" /></linearGradient>
      <linearGradient id={g('baton')} x1="0" x2="1"><stop offset="0" stopColor="#6B5BE0" /><stop offset="1" stopColor="#4655D4" /></linearGradient>
      <clipPath id={g('clip')}><circle cx="110" cy="118" r="66" /></clipPath>
    </defs>

    <ellipse className="flo-shadow" cx="110" cy="222" rx="50" ry="8" fill="#1D1233" opacity=".18" />

    <g className="flo-float">
      {/* feet */}
      <ellipse cx="88" cy="186" rx="15" ry="9" fill="#E8673F" />
      <ellipse cx="132" cy="186" rx="15" ry="9" fill="#E8673F" />

      {/* back arm (left, holds the baton) */}
      <g className={'flo-arm-left' + (armUp ? ' up' : '')}>
        <path d="M52 128 Q34 140 34 156" stroke="#E8673F" strokeWidth="11" strokeLinecap="round" fill="none" />
        {mood !== 'shield' && <g className="flo-baton"><rect x="18" y="150" width="34" height="13" rx="6.5" fill={`url(#${g('baton')})`} transform="rotate(-24 35 156)" /><rect x="40" y="141" width="6" height="13" rx="3" fill="#FFD2B8" opacity=".9" transform="rotate(-24 35 156)" /></g>}
      </g>

      {/* body */}
      <circle cx="110" cy="118" r="66" fill={`url(#${g('body')})`} />
      <g clipPath={`url(#${g('clip')})`} opacity=".9">
        <path d="M30 150 C80 120 140 168 200 128" stroke={`url(#${g('lane')})`} strokeWidth="12" fill="none" />
        <path d="M30 170 C80 140 140 188 200 148" stroke={`url(#${g('lane')})`} strokeWidth="7" fill="none" opacity=".7" />
      </g>
      <ellipse cx="86" cy="80" rx="22" ry="13" fill="#fff" opacity=".55" transform="rotate(-24 86 80)" />
      <circle cx="70" cy="98" r="4" fill="#fff" opacity=".7" />

      {/* face */}
      <g className={'flo-eyes' + (mood === 'think' ? ' look-up' : '')}>
        <ellipse cx="92" cy="112" rx="7.5" ry="9.5" fill="#1D1233" />
        <ellipse cx="128" cy="112" rx="7.5" ry="9.5" fill="#1D1233" />
        <circle cx="94.5" cy="108" r="2.6" fill="#fff" /><circle cx="130.5" cy="108" r="2.6" fill="#fff" />
      </g>
      <ellipse cx="78" cy="128" rx="9" ry="5.5" fill="#FF6F8E" opacity=".35" />
      <ellipse cx="142" cy="128" rx="9" ry="5.5" fill="#FF6F8E" opacity=".35" />
      {mood === 'cheer' ? <path d="M96 128 Q110 146 124 128 Z" fill="#7A2A3A" />
        : mood === 'think' ? <path d="M102 133 Q110 129 118 133" stroke="#7A2A3A" strokeWidth="3.5" strokeLinecap="round" fill="none" />
        : <path d="M98 128 Q110 140 122 128" stroke="#7A2A3A" strokeWidth="3.8" strokeLinecap="round" fill="none" />}

      {/* front arm (right): waves, points, scratches head or raises */}
      <g className={'flo-arm-right flo-arm-' + mood}>
        <path d="M168 124 Q188 112 192 94" stroke="#E8673F" strokeWidth="11" strokeLinecap="round" fill="none" />
        <circle cx="192" cy="92" r="8" fill="#FFA77C" />
      </g>

      {mood === 'shield' && <g className="flo-shield">
        <path d="M30 128 L52 120 L74 128 L74 146 Q74 164 52 172 Q30 164 30 146 Z" fill="#0F8A6B" stroke="#fff" strokeWidth="3" />
        <path d="M42 146 L50 154 L64 138" stroke="#fff" strokeWidth="4.5" strokeLinecap="round" strokeLinejoin="round" fill="none" />
      </g>}
      {mood === 'think' && <g className="flo-thought" fill="#B9ADFF"><circle cx="170" cy="58" r="5" /><circle cx="184" cy="42" r="7" /><circle cx="202" cy="22" r="10" /></g>}
    </g>

    {mood === 'cheer' && <g className="flo-sparkles" fill="#FFC857">
      <path d="M38 52 l4 10 10 4 -10 4 -4 10 -4 -10 -10 -4 10 -4z" /><path d="M182 40 l3 7 7 3 -7 3 -3 7 -3 -7 -7 -3 7 -3z" /><path d="M196 150 l3 7 7 3 -7 3 -3 7 -3 -7 -7 -3 7 -3z" />
    </g>}
  </svg>
}

type Step = { mood: Mood; target: string; kicker: string; title: string; body: string; action?: 'demo' }

const reduceMotion = () => typeof matchMedia !== 'undefined' && matchMedia('(prefers-reduced-motion: reduce)').matches

function tourSteps(t: Translate): Step[] {
  return [
    { mood: 'wave', target: 'about-hero', kicker: t('Hello', '안녕하세요'), title: t('I’m Flo, the relay ball.', '저는 릴레이 공, 플로예요.'), body: t('Flow routes urgent work to whoever has real focus time — not whoever answers first. Let me show you each part.', 'Flow는 긴급 업무를 먼저 답한 사람이 아니라, 실제로 집중할 시간이 있는 사람에게 전달해요. 하나씩 보여 드릴게요.') },
    { mood: 'point', target: 'about-stats', kicker: t('At a glance', '한눈에 보기'), title: t('Real scale, honest numbers.', '실제 규모, 정직한 숫자.'), body: t('A 1,000-person roster, 58 skills, and the 52-hour legal limit that every plan respects.', '1,000명 명단, 58개 스킬, 그리고 모든 계획이 지키는 주 52시간 법정 한도예요.') },
    { mood: 'point', target: 'about-try', kicker: t('Feature 1 · AI intake', '기능 1 · AI 요청 분석'), title: t('Paste a message, get a task draft.', '메시지를 붙여넣으면 업무 초안이 나와요.'), body: t('Type any request in Korean or English. The AI drafts skills, deadline and effort — only a draft; the lead checks every field.', '한국어나 영어로 아무 요청이나 입력해 보세요. AI가 스킬, 마감, 예상 시간을 초안으로 만들어요. 초안일 뿐, 모든 항목은 리드가 확인해요.') },
    { mood: 'think', target: 'about-theme', kicker: t('Why it matters', '왜 필요할까요'), title: t('Urgent work piles on the same people.', '긴급 업무는 늘 같은 사람에게 몰려요.'), body: t('Flow checks real calendars, rotates urgent work fairly and never plans overtime.', 'Flow는 실제 캘린더를 확인하고, 긴급 업무를 공정하게 순환하며, 초과 근무를 계획하지 않아요.') },
    { mood: 'point', target: 'about-how', kicker: t('Feature 2 · Rules, then people', '기능 2 · 규칙, 그리고 사람'), title: t('AI drafts, rules rank, people approve.', 'AI는 초안, 규칙은 순위, 사람은 승인.'), body: t('Click each step here to see who does what. The final decision is always a person’s.', '여기서 각 단계를 눌러 누가 무엇을 하는지 보세요. 최종 결정은 언제나 사람이 해요.') },
    { mood: 'think', target: 'about-data', kicker: t('Feature 3 · Data sources', '기능 3 · 데이터 출처'), title: t('Every number has a source.', '모든 숫자에는 출처가 있어요.'), body: t('The supplied roster plus synthetic skills and calendars. Nothing here is a real person’s record.', '제공된 명단과 합성 스킬·캘린더를 써요. 실제 개인의 기록은 없어요.') },
    { mood: 'shield', target: 'about-privacy', kicker: t('Feature 4 · Privacy', '기능 4 · 개인정보'), title: t('Your data has one job.', '내 정보는 한 가지 목적으로만 쓰여요.'), body: t('Names and records never reach the AI model; nothing is used for reviews or monitoring.', '이름과 직원 기록은 AI 모델로 보내지 않고, 평가나 감시에 쓰지 않아요.') },
    { mood: 'shield', target: 'about-law', kicker: t('Feature 5 · Korean law', '기능 5 · 한국 법 준수'), title: t('Designed around Korean law.', '한국 법을 지키도록 설계했어요.'), body: t('The 52-hour week and break rules, PIPA rights on automated decisions and data access, the AI Basic Act’s human oversight, and no worker monitoring.', '주 52시간과 휴게 규정, 자동화된 결정·열람에 관한 개인정보 보호법의 권리, 인공지능 기본법의 사람 개입, 그리고 근로자 감시 없음.') },
    { mood: 'cheer', target: 'about-hero', kicker: t('Your turn', '이제 직접 해 볼까요'), title: t('Let’s relay a real urgent task.', '실제 긴급 업무를 함께 전달해 봐요.'), body: t('Run the 4-hour urgent demo and watch me find the right person in a few seconds.', '4시간 긴급 데모를 실행하면, 제가 몇 초 만에 알맞은 사람을 찾아 드릴게요.'), action: 'demo' },
  ]
}

type Box = { top: number; left: number; width: number; height: number }

// Spotlight tour: dims the page, cuts a lit window around one feature at a time, and parks Flo beside it.
function SpotlightTour({ t, steps, index, setIndex, onClose, onDemo }: { t: Translate; steps: Step[]; index: number; setIndex: (i: number) => void; onClose: () => void; onDemo: () => void }) {
  const step = steps[index]
  const [box, setBox] = useState<Box | null>(null)
  const [playing, setPlaying] = useState(false)
  const card = useRef<HTMLDivElement>(null)
  const last = index === steps.length - 1

  // Scroll the feature into view, then follow it every frame (smooth scrolling, resizing, late layout).
  useLayoutEffect(() => {
    const node = document.getElementById(step.target)
    if (!node) return
    const tall = node.getBoundingClientRect().height > innerHeight * 0.6
    node.scrollIntoView({ behavior: reduceMotion() ? 'auto' : 'smooth', block: tall ? 'start' : 'center' })
    let frame = 0
    const follow = () => {
      const r = node.getBoundingClientRect(), pad = 10
      const next = { top: r.top - pad, left: r.left - pad, width: r.width + pad * 2, height: Math.min(r.height + pad * 2, innerHeight - 24) }
      setBox((prev) => prev && Math.abs(prev.top - next.top) < .5 && Math.abs(prev.left - next.left) < .5 && Math.abs(prev.width - next.width) < .5 && Math.abs(prev.height - next.height) < .5 ? prev : next)
      frame = requestAnimationFrame(follow)
    }
    follow()
    return () => cancelAnimationFrame(frame)
  }, [step.target])

  useEffect(() => { card.current?.focus({ preventScroll: true }) }, [index])
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose()
      if (event.key === 'ArrowRight' && !last) setIndex(index + 1)
      if (event.key === 'ArrowLeft' && index > 0) setIndex(index - 1)
    }
    addEventListener('keydown', onKey)
    return () => removeEventListener('keydown', onKey)
  }, [index, last, onClose, setIndex])
  useEffect(() => {
    if (!playing || last) return
    const timer = window.setTimeout(() => setIndex(index + 1), 6000)
    return () => window.clearTimeout(timer)
  }, [playing, index, last, setIndex])
  useEffect(() => { document.documentElement.classList.add('flo-touring'); return () => document.documentElement.classList.remove('flo-touring') }, [])

  // The card sits below the lit area if it fits, otherwise above, otherwise it docks at the bottom.
  const cardW = Math.min(400, innerWidth - 24), cardH = 250
  let place: React.CSSProperties = { left: 12, right: 12, bottom: 12 }
  if (box && innerWidth > 640) {
    const below = box.top + box.height + 14, above = box.top - cardH - 14
    const left = Math.max(12, Math.min(box.left, innerWidth - cardW - 12))
    if (below + cardH < innerHeight) place = { top: below, left, width: cardW }
    else if (above > 12) place = { top: above, left, width: cardW }
    else place = { bottom: 16, left: Math.max(12, innerWidth - cardW - 24), width: cardW }
  }

  return createPortal(<div className="flo-tour" role="dialog" aria-modal="true" aria-label={t('Tour with Flo', '플로와 함께 둘러보기')}>
    <div className="flo-tour-scrim" onClick={onClose} />
    {box && <div className="flo-spot" style={{ top: box.top, left: box.left, width: box.width, height: box.height }} aria-hidden="true" />}
    <div className="flo-tour-card" ref={card} tabIndex={-1} style={place}>
      <div className="flo-tour-mascot" aria-hidden="true"><FlowMascot mood={step.mood} size={92} /></div>
      <div className="flo-tour-text" key={index} aria-live="polite">
        <span className="flo-kicker">{step.kicker} · {index + 1}/{steps.length}</span>
        <h2>{step.title}</h2>
        <p>{step.body}</p>
      </div>
      <button className="icon-button flo-tour-close" onClick={onClose} aria-label={t('Close tour', '투어 닫기')}><X size={16} /></button>
      <div className="flo-tour-nav">
        <div className="flo-dots" aria-hidden="true">{steps.map((_, i) => <span key={i} className={i === index ? 'on' : ''} />)}</div>
        {!reduceMotion() && !last && <button className="btn ghost slim" onClick={() => setPlaying(!playing)} aria-pressed={playing}>{playing ? <Pause size={13} /> : <Play size={13} />}{playing ? t('Pause', '일시정지') : t('Auto', '자동')}</button>}
        <button className="btn secondary slim" onClick={() => setIndex(index - 1)} disabled={index === 0}><ChevronLeft size={14} />{t('Back', '이전')}</button>
        {last
          ? <button className="btn primary slim" onClick={() => { onClose(); onDemo() }}>{t('Run the 4h demo', '4시간 데모 실행')}<ArrowRight size={14} /></button>
          : <button className="btn primary slim" onClick={() => setIndex(index + 1)}>{t('Next', '다음')}<ChevronRight size={14} /></button>}
      </div>
    </div>
  </div>, document.body)
}

// Landing-page card: Flo says hello and starts the feature-by-feature spotlight tour.
export function FloGuide({ t, onDemo, onOpenApp }: { t: Translate; onDemo: () => void; onOpenApp: () => void }) {
  const steps = tourSteps(t)
  const [tour, setTour] = useState<number | null>(null)
  const close = useCallback(() => setTour(null), [])
  const setIndex = useCallback((i: number) => setTour(Math.max(0, Math.min(steps.length - 1, i))), [steps.length])
  const chapters = steps.slice(1, -1)
  return <section className="flo-guide" aria-label={t('Tour with Flo', '플로와 함께 둘러보기')}>
    <div className="flo-stage" aria-hidden="true">
      <div className="flo-halo" />
      <FlowMascot mood="wave" size={210} title={t('Flo, the Flow relay ball', '플로, Flow의 릴레이 공')} />
    </div>
    <div className="flo-talk">
      <div className="flo-bubble">
        <span className="flo-kicker">{t('Hello', '안녕하세요')}</span>
        <h2>{t('I’m Flo — let me introduce every feature, one by one.', '저는 플로예요. 기능을 하나씩 소개해 드릴게요.')}</h2>
        <p>{t('I’ll light up each part of this page and explain it in a sentence or two. Use the arrow keys, or press Esc any time.', '이 페이지의 각 부분을 하나씩 비추며 짧게 설명할게요. 방향키로 넘기고, 언제든 Esc로 닫을 수 있어요.')}</p>
        <div className="flo-actions">
          <button className="btn primary" onClick={() => setTour(0)}><Sparkles size={15} />{t('Start the tour', '투어 시작')}</button>
          <button className="btn secondary" onClick={onOpenApp}>{t('Skip to the app', '바로 앱 열기')}</button>
        </div>
      </div>
      <ol className="flo-chapters">{chapters.map((item, i) => <li key={item.target}><button onClick={() => setTour(i + 1)}><span>{i + 1}</span>{item.kicker.replace(/^.*· /, '')}</button></li>)}</ol>
    </div>
    {tour !== null && <SpotlightTour t={t} steps={steps} index={tour} setIndex={setIndex} onClose={close} onDemo={onDemo} />}
  </section>
}
