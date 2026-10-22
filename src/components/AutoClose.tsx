import { useEffect, useRef, useState } from 'react'
import type { PointerEvent as RPointerEvent } from 'react'
import { createPortal } from 'react-dom'
import { X, Plus } from 'lucide-react'
import { fmtPrice } from '../data'
import { useSheetDrag } from '../useSheetDrag'
import type { Candle } from './CandleChart'

// tp / sl: price-move %, in the position's favour (tp) / against it (sl). ref: the entry price they were measured from, fixed when the levels were set.
export type AutoCloseValue = { tp: number | null; sl: number | null; ref: number }

// Chart that shows where take profit and stop loss sit against the price action: a green zone up to the take profit, a red zone down to the
// stop loss (mirrored for a short), a pill on each line and the live price tag, so the numbers have a picture next to them.
function ZoneChart({ candles, entry, tpPx, slPx, dec, onToggle, onDrag }: {
  candles: Candle[]; entry: number; tpPx: number | null; slPx: number | null; dec: number; onToggle: (k: 'tp' | 'sl') => void; onDrag: (k: 'tp' | 'sl', price: number) => void
}) {
  const svg = useRef<SVGSVGElement>(null)
  const [frozen, setFrozen] = useState<{ lo: number; hi: number } | null>(null) // price scale holds still while a level is dragged
  // shorter phones get a shorter chart so the rulers and buttons stay on screen
  const devH = document.querySelector('.device')?.clientHeight ?? 890
  const W = 368, H = Math.max(150, Math.min(250, Math.round(devH * 0.27))), AX = 70, plotW = W - AX
  const data = candles.slice(-34)
  const prices = [...data.flatMap(d => [d.h, d.l]), entry, ...(tpPx ? [tpPx] : []), ...(slPx ? [slPx] : [])]
  const lo0 = Math.min(...prices), hi0 = Math.max(...prices), pad = (hi0 - lo0) * 0.1 || entry * 0.01
  const lo = frozen ? frozen.lo : lo0 - pad, hi = frozen ? frozen.hi : hi0 + pad
  const y = (v: number) => 12 + ((hi - v) / (hi - lo)) * (H - 24)
  const cw = (plotW * 0.9) / data.length
  const raw = (hi - lo) / 5, p = Math.pow(10, Math.floor(Math.log10(raw))), m = raw / p
  const step = (m < 1.5 ? 1 : m < 3.5 ? 2 : m < 7.5 ? 5 : 10) * p
  const ticks: number[] = []
  for (let v = Math.ceil(lo / step) * step; v <= hi; v += step) ticks.push(v)
  const grab = (k: 'tp' | 'sl') => ({
    onPointerDown: (e: RPointerEvent<SVGGElement>) => { e.currentTarget.setPointerCapture(e.pointerId); setFrozen({ lo, hi }) },
    onPointerMove: (e: RPointerEvent<SVGGElement>) => {
      if (!frozen || !svg.current) return
      const r = svg.current.getBoundingClientRect(), vy = ((e.clientY - r.top) / r.height) * H
      onDrag(k, hi - ((vy - 12) / (H - 24)) * (hi - lo))
    },
    onPointerUp: () => setFrozen(null), onPointerCancel: () => setFrozen(null),
  })
  const zone = (a: number, b: number, c: string) => <rect x="0" width={W} y={Math.min(y(a), y(b))} height={Math.abs(y(a) - y(b))} fill={c} />
  const tag = (v: number, c: string, key: string, drag?: 'tp' | 'sl') => (
    <g key={`tag-${key}`} className={drag ? 'ac-grab' : undefined} {...(drag ? grab(drag) : {})}>
      {drag && <rect x={W - 80} y={y(v) - 20} width="80" height="40" fill="transparent" />}<rect x={W - 74} y={y(v) - 11} width="74" height="22" rx="11" fill={c} /><text x={W - 37} y={y(v) + 4} textAnchor="middle" className="ac-tagtx">{fmtPrice(v, dec)}</text></g>
  )
  const pill = (k: 'tp' | 'sl', v: number, c: string, text: string) => (
    <g key={`pill-${k}`} className="ac-pill">
      <g className="ac-grab" {...grab(k)}>
        <rect x="8" y={y(v) - 18} width={text === 'Take Profit' ? 108 : 96} height="36" rx="18" fill="transparent" />
        <rect x="8" y={y(v) - 13} width={text === 'Take Profit' ? 108 : 96} height="26" rx="13" fill={c} />
        <text x="42" y={y(v) + 4.5} className="ac-pilltx">{text}</text>
      </g>
      <g onClick={() => onToggle(k)} role="button" aria-label={`Remove ${text}`} className="ac-x">
        <rect x="8" y={y(v) - 18} width="34" height="36" rx="12" fill="transparent" />
        <path d={`M20 ${y(v) - 4} l8 8 m0 -8 l-8 8`} stroke="#fff" strokeWidth="2" strokeLinecap="round" />
      </g>
    </g>
  )
  return (
    <svg ref={svg} viewBox={`0 0 ${W} ${H}`} width="100%" className="ac-chart" role="img" aria-label="Price chart with take profit and stop loss levels">
      {tpPx && zone(entry, tpPx, 'rgba(30,201,138,.13)')}
      {slPx && zone(entry, slPx, 'rgba(255,77,77,.13)')}
      {ticks.map(t => <g key={t}><line x1="0" x2={plotW} y1={y(t)} y2={y(t)} stroke="#ffffff0d" /><text x={W - 6} y={y(t) + 4} textAnchor="end" className="ac-ax">{fmtPrice(t, dec)}</text></g>)}
      {data.map((d, i) => {
        const up = d.c >= d.o, c = up ? 'var(--up)' : 'var(--down)', x = i * cw + cw / 2
        return <g key={i}><line x1={x} x2={x} y1={y(d.h)} y2={y(d.l)} stroke={c} /><rect x={x - cw * 0.34} y={y(Math.max(d.o, d.c))} width={cw * 0.68} height={Math.max(1.5, Math.abs(y(d.o) - y(d.c)))} fill={c} /></g>
      })}
      <line x1="0" x2={W} y1={y(entry)} y2={y(entry)} stroke="#c9cad3" strokeOpacity=".7" strokeWidth="1.2" />
      {tpPx && <line x1="0" x2={W} y1={y(tpPx)} y2={y(tpPx)} stroke="var(--up)" strokeWidth="1.5" />}
      {slPx && <line x1="0" x2={W} y1={y(slPx)} y2={y(slPx)} stroke="var(--down)" strokeWidth="1.5" />}
      <text x="8" y={y(entry) - 6} className="ac-ax">Entry</text>
      {tag(entry, '#3a3b45', 'e')}
      {tpPx && tag(tpPx, '#0d9f6b', 'tp', 'tp')}
      {slPx && tag(slPx, '#d63f4a', 'sl', 'sl')}
      {tpPx && pill('tp', tpPx, '#0d9f6b', 'Take Profit')}
      {slPx && pill('sl', slPx, '#d63f4a', 'Stop Loss')}
    </svg>
  )
}

// A ruler you drag sideways under a fixed pointer. The badge above the pointer shows the move in %, the ticks (0.1% each, a long one per 1%) slide past it.
function Ruler({ label, kind, value, min, max, on, onChange, onEnable, sign }: {
  label: string; kind: 'tp' | 'sl'; value: number; min: number; max: number; on: boolean; onChange: (v: number) => void; onEnable: () => void; sign: '+' | '−'
}) {
  const ref = useRef<HTMLDivElement>(null)
  const drag = useRef<{ x: number; v: number } | null>(null)
  const [w, setW] = useState(368)
  const PPP = 40, STEP = 0.1, P = 0.76 // px per 1%, tick spacing in %, pointer position
  useEffect(() => {
    const el = ref.current; if (!el) return
    const ro = new ResizeObserver(() => setW(el.clientWidth)); ro.observe(el); return () => ro.disconnect()
  }, [])
  const px = w * P
  const first = Math.max(Math.ceil((value - px / PPP) / STEP), Math.round(min / STEP)), last = Math.min(Math.floor((value + (w - px) / PPP) / STEP), Math.round(max / STEP))
  const ticks = []
  for (let k = first; k <= last; k++) ticks.push(k)
  const down = (e: RPointerEvent) => {
    if (!on) return
    drag.current = { x: e.clientX, v: value }; e.currentTarget.setPointerCapture(e.pointerId)
  }
  const move = (e: RPointerEvent) => {
    const d = drag.current; if (!d) return
    const next = d.v - (e.clientX - d.x) / PPP // dragging right slides lower values under the pointer
    onChange(Math.round(Math.max(min, Math.min(max, next)) / STEP) * STEP)
  }
  const up = () => { drag.current = null }
  const col = kind === 'tp' ? 'var(--up)' : 'var(--down)', bg = kind === 'tp' ? '#0d9f6b' : '#d63f4a'
  return (
    <div className={`ruler ${kind}${on ? '' : ' off'}`}>
      <div className="ruler-h">
        <span className="ruler-l">{label}</span>
        {!on && <button className={`ruler-add ${kind}`} onClick={onEnable}><Plus size={15} strokeWidth={2.5} />Add {label}</button>}
      </div>
      <div className="ruler-track" ref={ref} aria-hidden={!on} tabIndex={on ? 0 : -1} onPointerDown={down} onPointerMove={move} onPointerUp={up} onPointerCancel={up} role="slider" aria-label={label}
        aria-valuemin={min} aria-valuemax={max} aria-valuenow={Number(value.toFixed(1))}
        onKeyDown={e => { if (e.key === 'ArrowRight') onChange(Math.max(min, value - STEP)); if (e.key === 'ArrowLeft') onChange(Math.min(max, value + STEP)) }}>
        {on && ticks.map(k => {
          const v = k * STEP, major = k % 10 === 0, mid = k % 5 === 0
          return <i key={k} className={major ? 'M' : mid ? 'm' : ''} style={{ left: px + (v - value) * PPP, background: col }} />
        })}
        {on
          ? <><b className="ruler-badge" style={{ left: px, background: bg }}>{sign}{value.toFixed(1)}%</b><u className="ruler-ptr" style={{ left: px, background: col }} /></>
          : null}
      </div>
    </div>
  )
}

export function AutoClose({ buy, entry: liveEntry, candles, dec, notional, maxLoss, initial, onSet, onCancel }: {
  buy: boolean; entry: number; candles: Candle[]; dec: number; notional: number; maxLoss: number; initial: AutoCloseValue | null
  onSet: (v: AutoCloseValue) => void; onCancel: () => void
}) {
  // the entry price is frozen when this screen opens, so the take-profit and stop-loss prices stay put while the market ticks
  const [entry] = useState(initial?.ref ?? liveEntry)
  const [tpOn, setTpOn] = useState(initial ? initial.tp !== null : true)
  const [slOn, setSlOn] = useState(initial ? initial.sl !== null : true)
  const [tp, setTp] = useState(initial?.tp ?? 5)
  const [sl, setSl] = useState(initial?.sl ?? 2)
  const [out, setOut] = useState(false)
  const dir = buy ? 1 : -1
  const tpPx = tpOn ? entry * (1 + (dir * tp) / 100) : null
  const slPx = slOn ? entry * (1 - (dir * sl) / 100) : null
  const win = (notional * tp) / 100, loss = (notional * sl) / 100
  const slMax = Math.max(0.5, Math.floor(maxLoss * 0.95 * 10) / 10) // keep the stop inside the liquidation price
  const leave = (fn: () => void) => { setOut(true); setTimeout(fn, 200) }
  const { bind, sheetStyle } = useSheetDrag(() => leave(onCancel))
  const host = document.querySelector('.device')
  if (!host) return null
  const msg = tpOn && slOn ? <>Make <b className="up">+${win.toFixed(2)}</b> at TP or lose <b className="down">−${loss.toFixed(2)}</b> at SL</>
    : tpOn ? <>Make <b className="up">+${win.toFixed(2)}</b> at take profit</> : slOn ? <>Lose <b className="down">−${loss.toFixed(2)}</b> at stop loss</> : <>No levels set</>
  return createPortal(
    <div className={`ac-wrap${out ? ' out' : ''}`} onClick={() => leave(onCancel)}>
      <div className="ac" style={sheetStyle} onClick={e => e.stopPropagation()} role="dialog" aria-label="Auto close">
        <div {...bind} className="sheet-grab-row" style={{ ...bind.style, paddingTop: 8 }}><div className="sheet-grab" /></div>
        <div {...bind} className="ac-head"><b>Auto Close</b><button className="icon-x" onClick={() => leave(onCancel)} aria-label="Close"><X size={20} strokeWidth={1.75} /></button></div>
        <ZoneChart candles={candles} entry={entry} tpPx={tpPx} slPx={slPx} dec={dec} onToggle={k => (k === 'tp' ? setTpOn(false) : setSlOn(false))} onDrag={(k, price) => {
          const move = (dir * (price - entry)) / entry * 100 // % in the position's favour
          if (k === 'tp') setTp(Math.round(Math.max(0.1, Math.min(100, move)) * 10) / 10)
          else setSl(Math.round(Math.max(0.1, Math.min(slMax, -move)) * 10) / 10)
        }} />
        <div className="rulers">
          <Ruler label="Stop Loss" kind="sl" value={sl} min={0.1} max={slMax} on={slOn} onChange={setSl} onEnable={() => setSlOn(true)} sign="−" />
          <Ruler label="Take Profit" kind="tp" value={tp} min={0.1} max={100} on={tpOn} onChange={setTp} onEnable={() => setTpOn(true)} sign="+" />
        </div>
        <div className="ac-btns">
          <button className="ac-cancel" onClick={() => leave(onCancel)}>Cancel</button>
          <button className={`ac-set ${buy ? 'buy' : 'sell'}`} onClick={() => leave(() => onSet({ tp: tpOn ? tp : null, sl: slOn ? sl : null, ref: entry }))}>Set</button>
        </div>
        <p className="ac-msg">{msg}</p>
      </div>
    </div>,
    host,
  )
}
