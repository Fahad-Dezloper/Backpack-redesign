// Small maths toolkit for the journey animation: bezier paths with constant-speed (arc-length) motion, easing, and helpers.
export type Pt = { x: number; y: number }
export const clamp01 = (v: number) => (v < 0 ? 0 : v > 1 ? 1 : v)
export const lerp = (a: number, b: number, t: number) => a + (b - a) * t
export const seg = (t: number, a: number, b: number) => clamp01((t - a) / (b - a))

/** CSS-style cubic-bezier easing, solved with Newton-Raphson (bisection fallback). */
export function cubicBezier(x1: number, y1: number, x2: number, y2: number) {
  const cx = 3 * x1, bx = 3 * (x2 - x1) - cx, ax = 1 - cx - bx, cy = 3 * y1, by = 3 * (y2 - y1) - cy, ay = 1 - cy - by
  const X = (t: number) => ((ax * t + bx) * t + cx) * t, Y = (t: number) => ((ay * t + by) * t + cy) * t, dX = (t: number) => (3 * ax * t + 2 * bx) * t + cx
  return (x: number) => {
    if (x <= 0) return 0; if (x >= 1) return 1
    let t = x
    for (let i = 0; i < 8; i++) { const e = X(t) - x; if (Math.abs(e) < 1e-5) return Y(t); const d = dX(t); if (Math.abs(d) < 1e-6) break; t -= e / d }
    let lo = 0, hi = 1; t = x
    for (let i = 0; i < 24; i++) { const e = X(t) - x; if (Math.abs(e) < 1e-5) break; if (e > 0) hi = t; else lo = t; t = (lo + hi) / 2 }
    return Y(t)
  }
}
export const easeOut = cubicBezier(0.23, 1, 0.32, 1)       // entering things
export const easeInOut = cubicBezier(0.77, 0, 0.175, 1)    // on-screen movement

export type Cubic = [Pt, Pt, Pt, Pt]
const bez = (c: Cubic, t: number): Pt => { const u = 1 - t, a = u * u * u, b = 3 * u * u * t, d = 3 * u * t * t, e = t * t * t; return { x: a * c[0].x + b * c[1].x + d * c[2].x + e * c[3].x, y: a * c[0].y + b * c[1].y + d * c[2].y + e * c[3].y } }

/** A path made of cubic segments, sampled once into an arc-length table so a packet moves at constant speed. */
export class Path {
  pts: Pt[] = []; cum: number[] = []; length = 0; d = ''
  constructor(segs: Cubic[], per = 40) {
    segs.forEach((c, si) => { for (let i = si ? 1 : 0; i <= per; i++) this.pts.push(bez(c, i / per)) })
    this.cum = [0]; for (let i = 1; i < this.pts.length; i++) { const a = this.pts[i - 1], b = this.pts[i]; this.cum.push(this.cum[i - 1] + Math.hypot(b.x - a.x, b.y - a.y)) }
    this.length = this.cum[this.cum.length - 1]
    this.d = segs.map((c, i) => `${i ? '' : `M${c[0].x},${c[0].y} `}C${c[1].x},${c[1].y} ${c[2].x},${c[2].y} ${c[3].x},${c[3].y}`).join(' ')
  }
  /** point at fraction u (0..1) of the total length */
  at(u: number): Pt {
    const s = clamp01(u) * this.length; let lo = 0, hi = this.cum.length - 1
    while (hi - lo > 1) { const m = (lo + hi) >> 1; if (this.cum[m] <= s) lo = m; else hi = m }
    const span = this.cum[hi] - this.cum[lo] || 1, f = (s - this.cum[lo]) / span, a = this.pts[lo], b = this.pts[hi]
    return { x: lerp(a.x, b.x, f), y: lerp(a.y, b.y, f) }
  }
  /** fraction of the path at which a given distance from the start sits */
  frac(dist: number) { return clamp01(dist / this.length) }
}
export const line = (a: Pt, b: Pt): Cubic => [a, { x: lerp(a.x, b.x, 1 / 3), y: lerp(a.y, b.y, 1 / 3) }, { x: lerp(a.x, b.x, 2 / 3), y: lerp(a.y, b.y, 2 / 3) }, b]

/** deterministic hash -> 0..1, so the same address always lights the same cell */
export function hash01(s: string, salt = 0) { let h = 2166136261 ^ salt; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619) } return ((h >>> 0) % 100000) / 100000 }
export const fmt = (n: number) => n.toLocaleString('en-US')
