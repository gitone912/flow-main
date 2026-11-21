import { useEffect, useRef, useState, type DragEvent, type KeyboardEvent, type PointerEvent, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { CalendarClock, Clock3, GripVertical, X } from 'lucide-react'
import { type Translate } from './ui'

// Drag-to-assign for team leads. A drop only *selects* a candidate (the same as clicking a card);
// booking still happens in the existing approve step, which re-checks the latest calendar.
// Mouse uses native HTML5 drag and drop, touch/pen use pointer events, keyboard uses pick-up / arrows / Enter.

export type DropTarget = { id: string; name: string; ok: boolean; note: string }
type Mode = 'mouse' | 'touch' | 'keyboard'

// Keeps the touch ghost on screen: near the finger, never past the right edge.
const ghostAt = ({ x, y }: { x: number; y: number }) => 'translate3d(' + Math.max(8, Math.min(x - 40, window.innerWidth - Math.min(300, window.innerWidth * 0.8) - 8)) + 'px,' + (y - 28) + 'px,0)'
const reducedMotion = () => typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches

export function useAssignDrag({ targets, initial, onDrop, t }: { targets: DropTarget[]; initial?: string; onDrop: (id: string) => void; t: Translate }) {
  const [mode, setMode] = useState<Mode | null>(null)
  const [over, setOverState] = useState('')
  const [message, setMessage] = useState('')
  const modeRef = useRef<Mode | null>(null)
  const overRef = useRef('')
  const dropped = useRef(false)
  const suppressClick = useRef(false)
  const touch = useRef<{ id: number; x: number; y: number; live: boolean } | null>(null)
  const point = useRef({ x: 0, y: 0 })
  const ghost = useRef<HTMLDivElement>(null)
  const targetsRef = useRef(targets)
  targetsRef.current = targets
  const onDropRef = useRef(onDrop)
  onDropRef.current = onDrop

  const find = (id: string) => targetsRef.current.find((item) => item.id === id)
  const eligible = () => targetsRef.current.filter((item) => item.ok)
  const say = (text: string) => setMessage((prev) => prev === text ? text + '​' : text)
  const describe = (target: DropTarget) => target.ok ? target.name + ' · ' + target.note : target.name + ' · ' + t('Cannot assign', '배정 불가') + ' · ' + target.note
  const setMode2 = (next: Mode | null) => { modeRef.current = next; setMode(next) }
  const setOver = (id: string, announce = true) => {
    if (overRef.current === id) return
    overRef.current = id
    setOverState(id)
    const target = find(id)
    if (target && announce) say(describe(target))
    if (target && modeRef.current === 'keyboard') document.querySelector('[data-drop-id="' + CSS.escape(id) + '"]')?.scrollIntoView({ block: 'nearest', behavior: reducedMotion() ? 'auto' : 'smooth' })
  }
  const start = (next: Mode) => {
    dropped.current = false
    setMode2(next)
    say(next === 'keyboard'
      ? t('Task picked up. Use the arrow keys to choose a person, Enter to assign, Escape to cancel.', '업무를 집었습니다. 화살표 키로 담당자를 고르고 Enter로 배정, Esc로 취소합니다.')
      : t('Task picked up. Drop it on a person to assign.', '업무를 집었습니다. 담당자 카드에 놓아 배정하세요.'))
  }
  const end = () => { setMode2(null); overRef.current = ''; setOverState(''); touch.current = null }
  const cancel = (announce = true) => {
    if (!modeRef.current) return
    end()
    if (announce) say(t('Drag cancelled. Nothing was assigned.', '끌기를 취소했습니다. 배정되지 않았습니다.'))
  }
  const drop = (id: string) => {
    const target = find(id)
    if (!target) { cancel(); return false }
    if (!target.ok) { say(describe(target)); if (modeRef.current !== 'keyboard') end(); return false }
    dropped.current = true
    end()
    say(t('Dropped on ' + target.name + '. Confirm to continue to approval.', target.name + '님에게 놓았습니다. 확인하면 승인 단계로 이동합니다.'))
    onDropRef.current(id)
    return true
  }

  // Escape cancels any drag mode; touch drags auto-scroll near the viewport edges.
  useEffect(() => {
    if (!mode) return
    const key = (event: globalThis.KeyboardEvent) => { if (event.key === 'Escape') { event.preventDefault(); cancel() } }
    window.addEventListener('keydown', key)
    let frame = 0
    if (mode === 'touch') {
      const loop = () => {
        const { y } = point.current
        const top = 90, bottom = window.innerHeight - 150
        const delta = y < top ? -(top - y) / 5 : y > bottom ? (y - bottom) / 5 : 0
        if (delta) { window.scrollBy(0, Math.max(-24, Math.min(24, delta))); hitTest() }
        frame = requestAnimationFrame(loop)
      }
      frame = requestAnimationFrame(loop)
    }
    return () => { window.removeEventListener('keydown', key); cancelAnimationFrame(frame) }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode])

  function hitTest() {
    const { x, y } = point.current
    const el = document.elementFromPoint(x, y)?.closest<HTMLElement>('[data-drop-id]')
    setOver(el?.dataset.dropId || '')
  }
  function moveGhost() {
    if (ghost.current) ghost.current.style.transform = ghostAt(point.current)
  }

  const token = {
    role: 'button', tabIndex: 0, draggable: true,
    'aria-pressed': mode === 'keyboard',
    onClick: () => {
      if (suppressClick.current) { suppressClick.current = false; return }
      if (!modeRef.current) { start('keyboard'); const first = find(initial || '')?.ok ? initial! : eligible()[0]?.id || ''; overRef.current = ''; setOver(first) }
      else if (modeRef.current === 'keyboard' && overRef.current) drop(overRef.current)
    },
    onKeyDown: (event: KeyboardEvent<HTMLElement>) => {
      if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); (event.currentTarget as HTMLElement).click(); return }
      if (modeRef.current !== 'keyboard') return
      const list = eligible()
      if (!list.length) return
      const step = event.key === 'ArrowDown' || event.key === 'ArrowRight' ? 1 : event.key === 'ArrowUp' || event.key === 'ArrowLeft' ? -1 : 0
      if (!step) return
      event.preventDefault()
      const index = list.findIndex((item) => item.id === overRef.current)
      setOver(list[(index + step + list.length) % list.length].id)
    },
    onDragStart: (event: DragEvent<HTMLElement>) => {
      event.dataTransfer.setData('text/plain', 'flow-task')
      event.dataTransfer.effectAllowed = 'move'
      start('mouse')
    },
    onDragEnd: () => { if (!dropped.current) cancel(); else end() },
    onPointerDown: (event: PointerEvent<HTMLElement>) => {
      if (event.pointerType === 'mouse') return
      suppressClick.current = false
      touch.current = { id: event.pointerId, x: event.clientX, y: event.clientY, live: false }
      try { event.currentTarget.setPointerCapture(event.pointerId) } catch { /* capture is best-effort */ }
    },
    onPointerMove: (event: PointerEvent<HTMLElement>) => {
      const state = touch.current
      if (!state || state.id !== event.pointerId) return
      point.current = { x: event.clientX, y: event.clientY }
      if (!state.live) {
        if (Math.hypot(event.clientX - state.x, event.clientY - state.y) < 8) return
        state.live = true
        suppressClick.current = true
        if (modeRef.current) end()
        touch.current = state
        start('touch')
      }
      moveGhost()
      hitTest()
    },
    onPointerUp: (event: PointerEvent<HTMLElement>) => {
      const state = touch.current
      if (!state || state.id !== event.pointerId) return
      touch.current = null
      if (!state.live) return
      if (overRef.current) drop(overRef.current)
      else cancel()
    },
    onPointerCancel: () => { if (touch.current?.live) cancel(); touch.current = null },
  }

  const card = (id: string) => {
    const target = find(id)
    return {
      'data-drop-id': id,
      onDragEnter: (event: DragEvent<HTMLElement>) => { if (modeRef.current !== 'mouse') return; setOver(id); if (target?.ok) event.preventDefault() },
      onDragOver: (event: DragEvent<HTMLElement>) => {
        if (modeRef.current !== 'mouse') return
        setOver(id)
        if (target?.ok) { event.preventDefault(); event.dataTransfer.dropEffect = 'move' } else event.dataTransfer.dropEffect = 'none'
      },
      onDragLeave: (event: DragEvent<HTMLElement>) => {
        if (modeRef.current !== 'mouse' || event.currentTarget.contains(event.relatedTarget as Node | null)) return
        if (overRef.current === id) { overRef.current = ''; setOverState('') }
      },
      onDrop: (event: DragEvent<HTMLElement>) => { if (modeRef.current !== 'mouse') return; event.preventDefault(); drop(id) },
    }
  }

  const state = (id: string) => !mode ? '' : (find(id)?.ok ? ' dnd-ok' : ' dnd-blocked') + (over === id ? ' dnd-over' : '')
  const live = <div className="sr-only" role="status" aria-live="polite">{message}</div>
  return { mode, active: !!mode, over, token, card, state, drop, cancel, live, ghost, point }
}

export type AssignDrag = ReturnType<typeof useAssignDrag>

export function TaskToken({ drag, title, effort, due, t }: { drag: AssignDrag; title: string; effort: string; due: string; t: Translate }) {
  const picked = drag.mode === 'keyboard'
  const body = <>
    <span className="dnd-grip" aria-hidden="true"><GripVertical size={18} /></span>
    <span className="dnd-token-main">
      <strong>{title}</strong>
      <span className="dnd-token-meta">{effort && <span><Clock3 size={12} aria-hidden="true" />{effort}</span>}{due && <span><CalendarClock size={12} aria-hidden="true" />{due}</span>}</span>
    </span>
  </>
  return <div className={'dnd-token-row' + (drag.active ? ' is-active' : '')}>
    <div {...drag.token} className={'dnd-token' + (drag.active ? ' is-lifted' : '')} aria-describedby="dnd-token-help"
      aria-label={t('Task card: ' + title + '. Drag onto a person to assign, or press Space to pick up.', '업무 카드: ' + title + '. 담당자 카드로 끌어다 놓아 배정하거나 Space로 집으세요.')}>
      {body}
      <span className="dnd-token-hint">{picked ? t('Arrows to choose · Enter to assign', '화살표로 선택 · Enter로 배정') : t('Drag onto a person to assign', '담당자 카드로 끌어다 놓아 배정')}</span>
    </div>
    {drag.mode === 'keyboard' && <button type="button" className="btn ghost slim dnd-cancel" onClick={() => drag.cancel()}><X size={14} />{t('Cancel', '취소')}</button>}
    <span id="dnd-token-help" className="sr-only">{t('Space or Enter picks up the task. Arrow keys move between eligible people, Enter assigns, Escape cancels. Nothing is booked until you approve.', 'Space 또는 Enter로 업무를 집고, 화살표 키로 배정 가능한 담당자 사이를 이동하며, Enter로 배정, Esc로 취소합니다. 승인 전에는 예약되지 않습니다.')}</span>
    {drag.live}
    {drag.mode === 'touch' && createPortal(<div ref={drag.ghost} className="dnd-ghost" aria-hidden="true"
      style={{ transform: ghostAt(drag.point.current) }}><div className="dnd-token is-ghost">{body}</div></div>, document.body)}
  </div>
}

export function DropNote({ target, show, t }: { target?: DropTarget; show: boolean; t: Translate }): ReactNode {
  if (!show || !target) return null
  return <p className={'dnd-note ' + (target.ok ? 'ok' : 'blocked')} aria-hidden="true">
    {target.ok ? <><b>{t('Drop to assign', '놓으면 배정')}</b>{target.note}</> : <><b>{t('Cannot assign', '배정 불가')}</b>{target.note}</>}
  </p>
}
