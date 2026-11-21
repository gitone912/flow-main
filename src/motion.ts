import { flushSync } from 'react-dom'

// Shared motion helpers. Every effect degrades to an instant update when the browser lacks the
// View Transitions API or the person prefers reduced motion.

type ViewTransitionDoc = Document & { startViewTransition?: (update: () => void) => { ready: Promise<void>; finished: Promise<void> } }

export const prefersReducedMotion = () => typeof matchMedia !== 'undefined' && matchMedia('(prefers-reduced-motion: reduce)').matches

// Runs a React state update inside a view transition so the old and new screens cross-fade and the
// sidebar's active pill slides between items (both are named in motion.css).
export function withViewTransition(update: () => void) {
  const doc = document as ViewTransitionDoc
  if (!doc.startViewTransition || prefersReducedMotion()) { update(); return }
  doc.startViewTransition(() => flushSync(update))
}

// Theme switch that grows the new theme out of the clicked button as a circle.
export function switchTheme(toggle: () => void, event?: { clientX: number; clientY: number }) {
  const doc = document as ViewTransitionDoc
  if (!doc.startViewTransition || prefersReducedMotion()) { toggle(); return }
  const x = event?.clientX ?? innerWidth - 40
  const y = event?.clientY ?? 28
  const radius = Math.hypot(Math.max(x, innerWidth - x), Math.max(y, innerHeight - y))
  document.documentElement.classList.add('theme-transition')
  const transition = doc.startViewTransition(() => flushSync(toggle))
  transition.ready.then(() => {
    document.documentElement.animate(
      { clipPath: [`circle(0px at ${x}px ${y}px)`, `circle(${radius}px at ${x}px ${y}px)`] },
      { duration: 520, easing: 'cubic-bezier(0.22, 1, 0.36, 1)', pseudoElement: '::view-transition-new(root)' },
    )
  }).catch(() => {})
  transition.finished.finally(() => document.documentElement.classList.remove('theme-transition'))
}
