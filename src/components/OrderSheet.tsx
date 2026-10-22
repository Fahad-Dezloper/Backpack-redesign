import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import type { PointerEvent as RPointerEvent } from 'react'
import { createPortal } from 'react-dom'
import { ChevronDown, X, Check, ArrowLeftRight, Pencil } from 'lucide-react'
import { Coin } from './Coin'
import { AutoClose, type AutoCloseValue } from './AutoClose'
import type { Candle } from './CandleChart'
import { fmtPrice, fmtQty, pairLabel, type Pair } from '../data'
import { useAcct, available, placeOrder, type Evt } from '../store'

export type OrderMode = 'spot' | 'futures'
export type OrderSide = 'buy' | 'sell'
export type Live = { mid: number; mark: number; bid: number; ask: number; dir: 1 | -1; candles: Candle[] }
export type Notice = Evt

// five leverage stops from 1x to the market's maximum (a 5x market gets 1-2-3-4-5)
export const levStops = (max: number) => {
  if (max <= 5) return Array.from({ length: max }, (_, i) => i + 1)
  const round = (v: number) => (v > 20 ? Math.round(v / 5) * 5 : Math.round(v))
  return [...new Set([1, 5, round(max * 0.3), round(max * 0.6), max])].sort((x, y) => x - y)
}

const TPSL = 'Take profit / Stop loss'

// Leverage slider with the same dotted look as Backpack's order-size slider, only larger so the stops are easy to hit.
function LevSlider({ stops, value, onChange }: { stops: number[]; value: number; onChange: (v: number) => void }) {
  const R = 13 // knob radius: the track is inset by it so the knob never leaves the row
  const n = stops.length - 1, idx = Math.max(0, stops.indexOf(value))
  const pos = (i: number) => `calc(${R}px + (100% - ${R * 2}px) * ${n ? i / n : 0})`
  return (
    <div className="lslider" style={{ ['--r' as string]: `${R}px` }}>
      <div className="lslider-track"><i style={{ width: `${n ? (idx / n) * 100 : 0}%` }} /></div>
      {stops.map((st, i) => <span key={st} className={`lslider-dot${idx > i ? ' on' : ''}`} style={{ left: pos(i) }} />)}
      <span className="lslider-knob" style={{ left: pos(idx) }} />
      <input type="range" min={0} max={n} step={1} value={idx} aria-label="Leverage" onChange={e => onChange(stops[+e.target.value])} />
    </div>
  )
}

// What a trader checks while opening a position: the live price, the price they would actually get, the margin it ties up,
// where liquidation sits, and what it costs. The sheet fits its content, can be dragged down from its handle, and stays open after an order.
export function OrderSheet({ mode, side: side0, live, pair, onClose, onPlacing, onDone }: {
  mode: OrderMode; side: OrderSide; live: Live; pair: Pair; onClose: () => void; onPlacing: () => void; onDone: (n: Notice) => void
}) {
  const fut = mode === 'futures'
  const unit = pair.sym, dec = pair.dec, sym = pairLabel(pair, fut)
  const acct = useAcct()
  const stops = levStops(Math.max(1, pair.maxLev))
  const MAX_LEV = stops[stops.length - 1]
  const { mid, mark, bid, ask, dir, candles } = live
  const [side, setSide] = useState<OrderSide>(side0)
  const [type, setType] = useState<'Market' | 'Limit'>(fut ? 'Market' : 'Limit')
  const [lev, setLev] = useState(() => (stops.includes(5) ? 5 : MAX_LEV))
  const [maxH, setMaxH] = useState<number | undefined>()
  const [usd, setUsd] = useState('')
  const [limit, setLimit] = useState(fmtPrice(mid, dec).replace(/,/g, ''))
  const [adv, setAdv] = useState(false)
  const [flags, setFlags] = useState<Record<string, boolean>>({})
  const [auto, setAuto] = useState<AutoCloseValue | null>(null) // take profit / stop loss, set in the Auto Close screen
  const [acOpen, setAcOpen] = useState(false)
  const [inUsd, setInUsd] = useState(true)
  const [phase, setPhase] = useState<'idle' | 'loading'>('idle')
  const [drag, setDrag] = useState(0)
  const [closing, setClosing] = useState(false)
  const bodyRef = useRef<HTMLDivElement>(null)
  const start = useRef<{ y: number; t: number } | null>(null)

  // never rise over the page's big price; while the sheet is open the page's stats row fades out
  useLayoutEffect(() => {
    const dev = document.querySelector('.device'), hs = document.querySelector('.hero-price')
    if (!dev) return
    const r = dev.getBoundingClientRect(), top = hs ? hs.getBoundingClientRect().bottom - r.top + 12 : 232
    setMaxH(Math.round(r.height - Math.max(top, 110)))
  }, [])
  useEffect(() => {
    const stats = document.querySelector('.hero-stats')
    stats?.classList.add('stats-off')
    return () => stats?.classList.remove('stats-off')
  }, [])
  // opening Advanced or Take profit / Stop loss reveals rows below the fold: bring them into view
  const tpslOn = !!flags[TPSL]
  useEffect(() => {
    if (adv || tpslOn) requestAnimationFrame(() => requestAnimationFrame(() => bodyRef.current?.scrollTo({ top: bodyRef.current.scrollHeight, behavior: 'smooth' })))
  }, [adv, tpslOn, auto])

  const buy = side === 'buy'
  const label = fut ? (buy ? 'Long' : 'Short') : (buy ? 'Buy' : 'Sell')
  const entry = type === 'Limit' ? Number(limit) || mid : buy ? ask : bid // market orders fill at the opposite side of the book
  const slip = type === 'Market' ? (Math.abs(entry - mid) / mid) * 100 : 0
  const availUsd = available(acct), held = acct.spot[unit] ?? 0
  const power = fut ? availUsd * lev : buy ? availUsd : held * entry // spot sell is limited by what you hold
  const val = Number(usd) || 0
  const orderUsd = inUsd ? val : val * entry
  const tokens = entry ? orderUsd / entry : 0
  const tooBig = orderUsd > power + 1e-9
  const margin = fut ? orderUsd / lev : orderUsd
  const liq = fut ? entry * (buy ? 1 - 0.9 / lev : 1 + 0.9 / lev) : 0
  const liqDist = liq ? (Math.abs(liq - entry) / entry) * 100 : 0
  const fee = orderUsd * (type === 'Market' ? 0.0005 : 0.0002)
  const setPct = (p: number) => {
    const u = (power * p) / 100
    setUsd(inUsd ? u.toFixed(2) : (u / entry).toPrecision(5).replace(/\.?0+$/, ''))
  }
  const notional = orderUsd || power // the dollar figures on the take profit / stop loss tiles use your order size, or max size when none is typed
  const busy = phase !== 'idle'
  const cta = !orderUsd ? 'Enter amount' : tooBig ? (fut || buy ? 'Exceeds buying power' : `Not enough ${unit}`) : `${label} ${unit}`
  const flagList = fut ? ['Reduce only', TPSL] : ['Post only', 'IOC']
  const qty = fmtQty

  const submit = () => {
    setPhase('loading'); onPlacing() // the banner reads "Placing your order..." until the result replaces it
    const refPx = auto?.ref ?? entry
    const tpPx = auto?.tp != null ? refPx * (1 + ((buy ? 1 : -1) * auto.tp) / 100) : null
    const slPx = auto?.sl != null ? refPx * (1 - ((buy ? 1 : -1) * auto.sl) / 100) : null
    setTimeout(() => {
      const res = placeOrder({ sym: unit, fut, buy, type, qty: tokens, px: Number(limit) || mid, fillPx: buy ? ask : bid, lev: fut ? lev : 1, reduce: !!flags['Reduce only'], tp: fut ? tpPx : null, sl: fut ? slPx : null })
      setPhase('idle'); onDone(res.evt)
      if (res.ok) { setUsd(''); setAuto(null); setFlags(f => ({ ...f, [TPSL]: false })) } // sheet stays open, ready for the next order
    }, 950)
  }

  // drag the handle (or header) down to dismiss; a short drag springs back
  const close = () => { setClosing(true); setTimeout(onClose, 220) }
  const down = (e: RPointerEvent) => {
    if ((e.target as HTMLElement).closest('button')) return
    start.current = { y: e.clientY, t: performance.now() }
    e.currentTarget.setPointerCapture(e.pointerId)
  }
  const move = (e: RPointerEvent) => { if (start.current) setDrag(Math.max(0, e.clientY - start.current.y)) }
  const up = (e: RPointerEvent) => {
    const s = start.current; start.current = null
    if (!s) return
    const dy = Math.max(0, e.clientY - s.y), v = dy / Math.max(1, performance.now() - s.t)
    if (dy > 110 || (dy > 40 && v > 0.6)) close(); else setDrag(0)
  }

  useEffect(() => { document.body.style.overflow = 'hidden'; return () => { document.body.style.overflow = '' } }, [])
  const host = document.querySelector('.device')
  if (!host) return null
  const dragging = start.current !== null
  return createPortal(
    <div className={`sheet-wrap${closing ? ' out' : ''}`} onClick={close}>
      <div className={`sheet${dragging ? ' dragging' : ''}`} style={{ maxHeight: maxH, transform: closing ? 'translateY(100%)' : drag ? `translateY(${drag}px)` : undefined }}
        onClick={e => e.stopPropagation()} role="dialog" aria-label="Order ticket"
        // Android keeps a text field focused after the keyboard is dismissed, so the next tap anywhere re-opens it.
        // Touching anything that is not a text field drops that focus first.
        onPointerDownCapture={e => { const a = document.activeElement as HTMLElement | null; if (a && a.tagName === 'INPUT' && (a as HTMLInputElement).type !== 'range' && !(e.target as HTMLElement).closest('.big-field, .trig-row')) a.blur() }}>
        <div className="sheet-top" onPointerDown={down} onPointerMove={move} onPointerUp={up} onPointerCancel={up}>
          <div className="sheet-grab" />
          <div className="sheet-head">
            <div className="sheet-pair"><Coin sym={unit} size={22} /><b>{sym}</b>{fut && <em className="lev blue">{lev}x</em>}</div>
            <button className="icon-x" onClick={close} aria-label="Close"><X size={20} strokeWidth={1.75} /></button>
          </div>
        </div>

        <div className={`sheet-body${busy ? ' busy' : ''}`} ref={bodyRef}>
          <div className="side-pick">
            <button className={buy ? 'on buy' : ''} onClick={() => setSide('buy')}>{fut ? 'Long' : 'Buy'}</button>
            <button className={!buy ? 'on sell' : ''} onClick={() => setSide('sell')}>{fut ? 'Short' : 'Sell'}</button>
          </div>

          <div className="type-pick">
            {(['Market', 'Limit'] as const).map(t => <button key={t} className={type === t ? 'on' : ''} onClick={() => setType(t)}>{t}</button>)}
            <span className="avail">Available <b>{!fut && !buy ? `${fmtQty(held)} ${unit}` : `$${availUsd.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`}</b></span>
          </div>

          {type === 'Limit' && (
            <div className="big-field">
              <small>Limit price</small>
              <div><input value={limit} inputMode="decimal" aria-label="Limit price" onChange={e => setLimit(e.target.value.replace(/[^0-9.]/g, ''))} /><button className="mini" onClick={() => setLimit(fmtPrice(mid, dec).replace(/,/g, ''))}>Last</button></div>
            </div>
          )}

          <label className={`big-field ${tooBig ? 'bad' : ''}`}>
            <small>Amount</small>
            <div>
              <input placeholder="0" value={usd} inputMode="decimal" enterKeyHint="done" onKeyDown={e => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur() }} onChange={e => setUsd(e.target.value.replace(/[^0-9.]/g, ''))} />
              <button className="mini swap" onClick={e => { e.preventDefault(); setInUsd(v => !v); setUsd('') }}>{inUsd ? 'USD' : unit}<ArrowLeftRight size={13} strokeWidth={2} /></button>
            </div>
            <em>{inUsd ? `≈ ${tokens ? qty(tokens) : 0} ${unit}` : `≈ $${orderUsd.toFixed(2)}`}</em>
          </label>

          <div className="pct-row">{[25, 50, 75, 100].map(p => <button key={p} onClick={() => setPct(p)}>{p === 100 ? 'Max' : `${p}%`}</button>)}</div>

          {type === 'Market' && slip >= 0.05 && <p className="slip-note">Slippage {slip.toFixed(2)}%</p>}
          <div className="sum-top">
            <div><small>{type === 'Market' ? 'Est. entry' : 'Entry price'}</small><b>{fmtPrice(entry, dec)}</b></div>
            <div className="r"><small>Fee</small><b>${fee.toFixed(4)}</b></div>
          </div>

          <div className="sum-main">
            <div><span>{fut ? 'Margin required' : 'Order value'}</span><b key={margin.toFixed(2)} className="chg">${margin.toFixed(2)}</b></div>
            {fut && <div><span>Est. liquidation</span><b key={fmtPrice(liq, dec)} className="chg">{fmtPrice(liq, dec)}<i>{liqDist.toFixed(1)}% away</i></b></div>}
          </div>

          {fut && (
            <div className="lev-row">
              <div className="lev-row-h"><span>Leverage</span><b>{lev}x</b></div>
              <LevSlider stops={stops} value={lev} onChange={setLev} />
            </div>
          )}

          <button className="adv-toggle" aria-expanded={adv} onClick={() => setAdv(a => !a)}>Advanced <ChevronDown size={16} style={{ transform: adv ? 'rotate(180deg)' : 'none' }} /></button>
          {adv && (
            <div className="adv">
              {flagList.map(f => (
                <div key={f} className="flag-row"><label><input type="checkbox" checked={!!flags[f]} onChange={() => { const on = !flags[f]; setFlags({ ...flags, [f]: on }); if (f === TPSL) { if (on) setAcOpen(true); else setAuto(null) } }} /><i><Check size={12} strokeWidth={3} /></i>{f}</label>{f === TPSL && fut && tpslOn && auto && <button className="tile-edit" onClick={() => setAcOpen(true)} aria-label="Edit take profit and stop loss"><Pencil size={15} strokeWidth={2} /></button>}</div>
              ))}
              {fut && tpslOn && auto && (
                <div className="auto-tiles">
                  {auto.tp !== null && (
                    <span className="tile tp"><small>Take profit</small><b>{fmtPrice(auto.ref * (1 + ((buy ? 1 : -1) * auto.tp) / 100), dec)}</b><em>+${((notional * auto.tp) / 100).toFixed(2)} <i>(+{auto.tp.toFixed(1)}%)</i></em></span>
                  )}
                  {auto.sl !== null && (
                    <span className="tile sl"><small>Stop loss</small><b>{fmtPrice(auto.ref * (1 - ((buy ? 1 : -1) * auto.sl) / 100), dec)}</b><em>−${((notional * auto.sl) / 100).toFixed(2)} <i>(−{auto.sl.toFixed(1)}%)</i></em></span>
                  )}
                </div>
              )}
            </div>
          )}
        </div>

        <div className="sheet-foot">
          <button className={`submit ${buy ? 'buy' : 'sell'} ${phase}`} disabled={busy || !orderUsd || tooBig} onClick={submit}>
            {cta}{phase === 'loading' && <span className="spin" aria-hidden="true" />}
          </button>
        </div>
      </div>
      {acOpen && <AutoClose buy={buy} entry={entry} candles={candles} dec={dec} notional={notional} maxLoss={liqDist} initial={auto}
        onSet={v => { setAuto(v); setAcOpen(false); if (v.tp === null && v.sl === null) setFlags(f => ({ ...f, [TPSL]: false })) }}
        onCancel={() => { setAcOpen(false); if (!auto) setFlags(f => ({ ...f, [TPSL]: false })) }} />}
    </div>,
    host,
  )
}
