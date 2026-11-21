import { useCallback, useEffect, useLayoutEffect, useRef, useState, type KeyboardEvent, type PointerEvent } from 'react'
import { createPortal } from 'react-dom'

/* ---------- Shared floating tooltip ----------
   Rendered into <body> with position: fixed, so overflow:hidden cards never clip it.
   It is aria-hidden: every value it shows is also in the anchor's aria-label or a live region. */
export type TipRow = { label: string; value: string; tone?: 'primary' | 'focus' | 'risk' | 'gap' | 'neutral' }
export type TipState = { x: number; top: number; bottom: number; title: string; rows: TipRow[] } | null

export function anchorOf(element: Element, x?: number, y?: number) {
  const rect = element.getBoundingClientRect()
  return { x: x ?? rect.left + rect.width / 2, top: y ?? rect.top, bottom: y ?? rect.bottom }
}

export function LiveTip({ tip }: { tip: TipState }) {
  const ref = useRef<HTMLDivElement>(null)
  const [pos, setPos] = useState({ left: 0, top: 0, ready: false })
  useLayoutEffect(() => {
    if (!tip || !ref.current) { setPos((p) => p.ready ? { ...p, ready: false } : p); return }
    const box = ref.current.getBoundingClientRect()
    const left = Math.max(8, Math.min(window.innerWidth - box.width - 8, tip.x - box.width / 2))
    let top = tip.top - box.height - 10
    if (top < 8) top = Math.min(window.innerHeight - box.height - 8, tip.bottom + 10)
    setPos({ left, top, ready: true })
  }, [tip])
  if (!tip || typeof document === 'undefined') return null
  return createPortal(<div ref={ref} className={'lc-tip' + (pos.ready ? ' on' : '')} aria-hidden="true" style={{ transform: `translate(${Math.round(pos.left)}px, ${Math.round(pos.top)}px)` }}>
    <span className="lc-tip-title">{tip.title}</span>
    {tip.rows.map((row) => <span className="lc-tip-row" key={row.label}><i className={'lc-key tone-' + (row.tone || 'neutral')} /><b className="tabular">{row.value}</b><span>{row.label}</span></span>)}
  </div>, document.body)
}

/** One tooltip per chart; hides itself on scroll/resize so it never floats away from its anchor. */
export function useTip() {
  const [tip, setTip] = useState<TipState>(null)
  useEffect(() => {
    if (!tip) return
    const hide = () => setTip(null)
    window.addEventListener('scroll', hide, true)
    window.addEventListener('resize', hide)
    return () => { window.removeEventListener('scroll', hide, true); window.removeEventListener('resize', hide) }
  }, [tip])
  return [tip, setTip] as const
}

/** Returns a counter that increments whenever `signature` changes after the first render — used to replay pulse animations. */
export function useChangeTick(signature: string) {
  const previous = useRef(signature)
  const [tick, setTick] = useState(0)
  useEffect(() => {
    if (previous.current === signature) return
    previous.current = signature
    setTick((n) => n + 1)
  }, [signature])
  return tick
}

/** True for `ms` after `tick` changes (never on first render). */
export function useFlash(tick: number, ms = 1600) {
  const [on, setOn] = useState(false)
  useEffect(() => {
    if (!tick) return
    setOn(true)
    const timer = window.setTimeout(() => setOn(false), ms)
    return () => window.clearTimeout(timer)
  }, [tick, ms])
  return on
}

/** False on the first frame, then true: lets CSS transitions grow marks from zero on mount. */
export function useMounted() {
  const [ready, setReady] = useState(false)
  useEffect(() => { const frame = requestAnimationFrame(() => setReady(true)); return () => cancelAnimationFrame(frame) }, [])
  return ready
}

/* ---------- Interactive sparkline ---------- */
type SparkProps = { values: number[]; labels: string[]; tone?: string; label: string; unit?: string; format?: (v: number) => string; hint: string; onActivate?: () => void }

export function LiveSpark({ values, labels, tone = 'primary', label, unit = '', format = (v) => String(v), hint, onActivate }: SparkProps) {
  const w = 120, h = 34
  const [active, setActive] = useState<number | null>(null)
  const [tip, setTip] = useTip()
  const wrap = useRef<HTMLSpanElement>(null)
  const pointer = useRef('mouse') // touch taps inspect a point; mouse clicks open the related view
  const max = Math.max(...values, 1), min = Math.min(...values, 0)
  const points = values.map((v, i) => [values.length > 1 ? i * w / (values.length - 1) : w / 2, h - 3 - (v - min) / (max - min || 1) * (h - 8)] as const)
  const line = points.map(([x, y], i) => (i ? 'L' : 'M') + x.toFixed(1) + ' ' + y.toFixed(1)).join(' ')
  const id = 'lsp-' + label.replace(/\W/g, '')
  const tipTone = (tone === 'focus' || tone === 'risk' || tone === 'gap' || tone === 'neutral' ? tone : 'primary') as TipRow['tone']

  const show = useCallback((index: number | null) => {
    setActive(index)
    if (index === null || !wrap.current) { setTip(null); return }
    const rect = wrap.current.getBoundingClientRect()
    const [px, py] = points[index]
    const sx = rect.left + px / w * rect.width, sy = rect.top + py / h * rect.height
    setTip({ x: sx, top: Math.min(sy, rect.top) - 2, bottom: rect.bottom, title: labels[index] || '', rows: [{ label, value: format(values[index]) + unit, tone: tipTone }] })
  }, [points, labels, label, values, unit, format, tipTone, setTip])

  const nearest = (event: PointerEvent) => {
    const rect = event.currentTarget.getBoundingClientRect()
    const ratio = (event.clientX - rect.left) / (rect.width || 1)
    return Math.max(0, Math.min(values.length - 1, Math.round(ratio * (values.length - 1))))
  }
  const onKey = (event: KeyboardEvent) => {
    const last = values.length - 1
    const current = active ?? last
    const next = event.key === 'ArrowRight' || event.key === 'ArrowUp' ? Math.min(last, current + 1)
      : event.key === 'ArrowLeft' || event.key === 'ArrowDown' ? Math.max(0, current - 1)
        : event.key === 'Home' ? 0 : event.key === 'End' ? last : null
    if (next !== null) { event.preventDefault(); show(next) }
    else if ((event.key === 'Enter' || event.key === ' ') && onActivate) { event.preventDefault(); onActivate() }
    else if (event.key === 'Escape') show(null)
  }
  const shownPoint = active ?? values.length - 1
  const summary = values.map((v, i) => (labels[i] || '') + ' ' + format(v) + unit).join(', ')

  return <span ref={wrap} className="lc-spark" data-tone={tone} tabIndex={0} role="group"
    aria-label={label + ': ' + summary + '. ' + hint}
    onPointerMove={(event) => show(nearest(event))} onPointerLeave={() => show(null)} onPointerDown={(event) => { pointer.current = event.pointerType; if (event.pointerType !== 'mouse') show(nearest(event)) }}
    onFocus={() => show(active ?? values.length - 1)} onBlur={() => show(null)} onKeyDown={onKey}
    onClick={() => { if (pointer.current === 'mouse') onActivate?.() }}>
    <svg viewBox={`0 0 ${w} ${h}`} preserveAspectRatio="none" aria-hidden="true">
      <defs><linearGradient id={id} x1="0" x2="0" y1="0" y2="1"><stop offset="0" stopColor="currentColor" stopOpacity=".26" /><stop offset="1" stopColor="currentColor" stopOpacity="0" /></linearGradient></defs>
      <g key={line} className="lc-spark-shape">
        <path d={line + ` L${w} ${h} L0 ${h} Z`} fill={`url(#${id})`} />
        <path d={line} fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" vectorEffect="non-scaling-stroke" />
      </g>
      <line className={'lc-cross' + (active !== null ? ' on' : '')} x1="0" x2="0" y1="0" y2={h} style={{ transform: `translateX(${points[shownPoint]?.[0] ?? 0}px)` }} vectorEffect="non-scaling-stroke" />
    </svg>
    {/* The marker lives in HTML so it stays round under preserveAspectRatio="none"; it glides via transform when data changes. */}
    {points[shownPoint] && <i className={'lc-spark-dot' + (active !== null ? ' active' : '')} style={{ transform: `translate(${points[shownPoint][0] / w * 100}cqw, ${points[shownPoint][1] / h * 100}cqh)` }} />}
    <span className="sr-only" aria-live="polite">{active !== null ? (labels[active] || '') + ': ' + format(values[active]) + unit : ''}</span>
    <LiveTip tip={tip} />
  </span>
}
