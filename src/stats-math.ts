/* Pure descriptive statistics for the Reports page. No React, no DOM. */

const finite = (values: readonly number[]) => values.filter((value) => Number.isFinite(value))

export function mean(values: readonly number[]): number {
  const xs = finite(values)
  return xs.length ? xs.reduce((sum, x) => sum + x, 0) / xs.length : 0
}

export function median(values: readonly number[]): number {
  const xs = finite(values).sort((a, b) => a - b)
  if (!xs.length) return 0
  const mid = xs.length >> 1
  return xs.length % 2 ? xs[mid] : (xs[mid - 1] + xs[mid]) / 2
}

/** Population standard deviation: sqrt(sum((x - mean)^2) / n). The team is the whole population, not a sample. */
export function stdDev(values: readonly number[]): number {
  const xs = finite(values)
  if (xs.length < 2) return 0
  const m = mean(xs)
  return Math.sqrt(xs.reduce((sum, x) => sum + (x - m) ** 2, 0) / xs.length)
}

/**
 * Gini coefficient for non-negative values, sorted ascending (1-indexed i):
 *   G = (2 * sum(i * x_i)) / (n * sum(x)) - (n + 1) / n
 * 0 = perfectly even, (n - 1) / n = one person holds everything. Returns 0 for empty, single or all-zero input.
 */
export function gini(values: readonly number[]): number {
  const xs = finite(values).map((x) => Math.max(0, x)).sort((a, b) => a - b)
  const n = xs.length
  const total = xs.reduce((sum, x) => sum + x, 0)
  if (n < 2 || total <= 0) return 0
  const weighted = xs.reduce((sum, x, i) => sum + (i + 1) * x, 0)
  return Math.max(0, (2 * weighted) / (n * total) - (n + 1) / n)
}

export type LorenzPoint = { people: number; share: number; equal: number; index: number }

/** Lorenz curve: cumulative % of people (poorest first) vs cumulative % of the total. Empty or all-zero input yields the equality line. */
export function lorenz(values: readonly number[]): LorenzPoint[] {
  const xs = finite(values).map((x) => Math.max(0, x)).sort((a, b) => a - b)
  const n = xs.length
  const total = xs.reduce((sum, x) => sum + x, 0)
  const points: LorenzPoint[] = [{ people: 0, share: 0, equal: 0, index: 0 }]
  let running = 0
  xs.forEach((x, i) => {
    running += x
    const people = ((i + 1) / n) * 100
    points.push({ people, share: total > 0 ? (running / total) * 100 : people, equal: people, index: i + 1 })
  })
  return points
}

/** Share of the total held by the top `fraction` of people (rounded up to at least one person). */
export function topShare(values: readonly number[], fraction: number): number {
  const xs = finite(values).map((x) => Math.max(0, x)).sort((a, b) => b - a)
  const total = xs.reduce((sum, x) => sum + x, 0)
  if (!xs.length || total <= 0) return 0
  const k = Math.max(1, Math.ceil(xs.length * fraction))
  return xs.slice(0, k).reduce((sum, x) => sum + x, 0) / total
}

export type Summary = { n: number; mean: number; median: number; sd: number; gini: number }
export const summarize = (values: readonly number[]): Summary => ({ n: finite(values).length, mean: mean(values), median: median(values), sd: stdDev(values), gini: gini(values) })
