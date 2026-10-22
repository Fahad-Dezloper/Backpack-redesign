import { useEffect, useMemo, useRef, useState } from 'react'
import { fmtPrice } from '../data'

// Candles are generated around anchor points so the chart has a believable shape and ends exactly at `last`.
function rng(seed: number) { let s = seed; return () => ((s = (s * 1664525 + 1013904223) % 4294967296) / 4294967296) }
const SHAPE: [number, number][] = [[0, 0.975], [0.14, 0.99], [0.17, 1.07], [0.3, 1.045], [0.5, 1.05], [0.52, 1.09], [0.57, 1.14], [0.6, 1.12], [0.65, 1.095], [0.72, 1.082], [1, 1.077]]
function closeAt(t: number) {
  for (let i = 1; i < SHAPE.length; i++) if (t <= SHAPE[i][0]) { const [t0, v0] = SHAPE[i - 1], [t1, v1] = SHAPE[i]; return v0 + ((t - t0) / (t1 - t0)) * (v1 - v0) }
  return SHAPE[SHAPE.length - 1][1]
}
export type Candle = { o: number; h: number; l: number; c: number; v: number }
export function buildCandles(seed: number, n: number, last: number) {
  const r = rng(seed), k = last / closeAt(1), out: Candle[] = []
  let prev = closeAt(0) * k
  for (let i = 0; i < n; i++) {
    const t = (i + 1) / n
    const c = i === n - 1 ? last : closeAt(t) * k * (1 + (r() - 0.5) * 0.026)
    const o = prev
    out.push({ o, c, h: Math.max(o, c) * (1 + r() * 0.009), l: Math.min(o, c) * (1 - r() * 0.009), v: 0.1 + r() * r() * 0.9 })
    prev = c
  }
  return out
}
function niceStep(range: number) {
  const raw = range / 4, p = Math.pow(10, Math.floor(Math.log10(raw))), m = raw / p
  return (m < 1.5 ? 1 : m < 3.5 ? 2 : m < 7.5 ? 5 : 10) * p
}

export type ChartLine = { p: number; label: string; color: string; pin?: boolean } // pin: always shown (take profit / stop loss), even off-scale
export function CandleChart({ seed = 7, last, decimals = 5, axis = 52, height = 179, candles, kind = 'candles', ma = false, lines = [] }: { seed?: number; last: number; decimals?: number; axis?: number; height?: number; candles?: Candle[]; kind?: 'candles' | 'line'; ma?: boolean; lines?: ChartLine[] }) {
  // draw at the real pixel width so a wider phone never stretches the chart past its pane
  const wrap = useRef<HTMLDivElement>(null)
  const [W, setW] = useState(368)
  useEffect(() => { const el = wrap.current; if (!el) return; const ro = new ResizeObserver(() => setW(Math.max(240, Math.round(el.clientWidth)))); ro.observe(el); setW(Math.max(240, Math.round(el.clientWidth))); return () => ro.disconnect() }, [])
  const built = useMemo(() => buildCandles(seed, 52, last), [seed, last])
  const data = candles ?? built
  const vmax = Math.max(...data.map(d => d.v))
  const lastUp = data[data.length - 1].c >= data[data.length - 1].o
  const H = height, AX = axis, PH = H - 26, VH = Math.round(34 * (H / 179)), plotW = W - AX, used = plotW * 0.8
  // position / order lines only widen the range when they are near the price, so a far-away level never flattens the candles
  const near = lines.filter(l => Math.abs(l.p - last) / last < (l.pin ? 0.15 : 0.06))
  const hi = Math.max(...data.map(d => d.h), ...near.map(l => l.p * 1.004)) * 1.012, lo = Math.min(...data.map(d => d.l), ...near.map(l => l.p * 0.996)) * 0.99
  const y = (v: number) => 15 + ((hi - v) / (hi - lo)) * (PH - 22)
  const cw = used / data.length
  const step = niceStep(hi - lo)
  const ticks: number[] = []
  for (let v = Math.ceil(lo / step) * step; v <= hi; v += step) ticks.push(v)
  const xs = (i: number) => i * cw + cw / 2
  const maPts = data.map((_, i) => (i < 8 ? null : `${xs(i)},${y(data.slice(i - 8, i + 1).reduce((a, d) => a + d.c, 0) / 9)}`)).filter(Boolean).join(' ')
  const linePts = data.map((d, i) => `${xs(i)},${y(d.c)}`).join(' ')
  const lc = lastUp ? 'var(--up)' : 'var(--down)'
  return (
    <div ref={wrap} style={{ width: '100%', height: H }}><svg viewBox={`0 0 ${W} ${H}`} width={W} height={H} className="candles" role="img" aria-label="price chart">
      {ticks.map(t => (
        <g key={t}><line x1="0" x2={plotW} y1={y(t)} y2={y(t)} stroke="#17181e" /><text x={plotW + 8} y={y(t) + 4} className="ax">{fmtPrice(t, decimals)}</text></g>
      ))}
      <text x={plotW * 0.45} y={PH * 0.62} textAnchor="middle" className="wm">Backpack</text>
      {data.map((d, i) => {
        const up = d.c >= d.o, col = up ? 'var(--up)' : 'var(--down)', x = xs(i)
        return (
          <g key={i}>
            <rect x={x - cw * 0.36} y={PH - (d.v / vmax) * VH} width={cw * 0.72} height={(d.v / vmax) * VH} fill={col} opacity="0.3" />
            {kind === 'candles' && <><line x1={x} x2={x} y1={y(d.h)} y2={y(d.l)} stroke={col} strokeWidth="1" /><rect x={x - cw * 0.36} y={y(Math.max(d.o, d.c))} width={cw * 0.72} height={Math.max(1.5, Math.abs(y(d.o) - y(d.c)))} fill={col} /></>}
          </g>
        )
      })}
      {kind === 'line' && (
        <g>
          <defs><linearGradient id="lnfill" x1="0" x2="0" y1="0" y2="1"><stop offset="0" stopColor={lc} stopOpacity=".28" /><stop offset="1" stopColor={lc} stopOpacity="0" /></linearGradient></defs>
          <polygon points={`${xs(0)},${PH} ${linePts} ${xs(data.length - 1)},${PH}`} fill="url(#lnfill)" />
          <polyline points={linePts} fill="none" stroke={lc} strokeWidth="1.8" strokeLinejoin="round" strokeLinecap="round" />
          <circle cx={xs(data.length - 1)} cy={y(data[data.length - 1].c)} r="3.5" fill={lc} />
        </g>
      )}
      {ma && <polyline points={maPts} fill="none" stroke="var(--warn)" strokeWidth="1.4" strokeLinejoin="round" />}
      <line x1="0" x2={plotW} y1={y(last)} y2={y(last)} stroke={lastUp ? "var(--up)" : "var(--down)"} strokeDasharray="1.5 2.5" />
      <rect x={plotW + 2} y={y(last) - 9} width={AX - 4} height="18" rx="3" fill={lastUp ? "var(--up)" : "var(--down)"} />
      <text x={plotW + 6} y={y(last) + 4} className="tag">{fmtPrice(last, decimals)}</text>
      {lines.filter(l => l.pin && !(l.p > lo && l.p < hi)).map(l => {
        const up = l.p >= hi, w = (l.label.length + 3) * 6.2 + 14, yy = up ? 11 : PH - 7
        return (
          <g key={l.label + 'edge'}>
            <rect x="4" y={yy - 9} width={w} height="18" rx="9" fill={l.color} />
            <text x="11" y={yy + 3.6} className="tag">{l.label} {up ? '↑' : '↓'}</text>
          </g>
        )
      })}
      {lines.filter(l => l.p > lo && l.p < hi).map(l => {
        const w = l.label.length * 6.2 + 14
        return (
          <g key={l.label}>
            <line x1="0" x2={plotW} y1={y(l.p)} y2={y(l.p)} stroke={l.color} strokeWidth="1.2" strokeDasharray="5 4" />
            <rect x="4" y={y(l.p) - 9} width={w} height="18" rx="9" fill={l.color} />
            <text x="11" y={y(l.p) + 3.6} className="tag">{l.label}</text>
          </g>
        )
      })}
      {[['18', 0.1], ['12:00', 0.26], ['19', 0.5], ['12:00', 0.68]].map(([t, p]) => (
        <text key={String(t) + p} x={plotW * (p as number)} y={H - 4} textAnchor="middle" className={`ax x ${/^\d\d$/.test(String(t)) ? 'bold' : ''}`}>{t}</text>
      ))}
    </svg></div>
  )
}
