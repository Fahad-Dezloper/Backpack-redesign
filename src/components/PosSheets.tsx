import { useState } from 'react'
import { useSheetDrag } from '../useSheetDrag'
import { createPortal } from 'react-dom'
import { Slider } from './Slider'
import { AutoClose, type AutoCloseValue } from './AutoClose'
import { buildCandles, type Candle } from './CandleChart'
import { fmtPrice, fmtQty, pairOf } from '../data'
import { useAcct, closePosition, placeOrder, setPosLevels, liqPrice, emitEvt, type Pos } from '../store'

// Sheets opened from a position card: Market Close (as in Backpack), Limit Close, and Set TP/SL (our Auto Close design).
const usd = (n: number) => `${n < 0 ? '-' : ''}$${Math.abs(n).toFixed(5)}`

function Sheet({ title, onClose, children }: { title: string; onClose: () => void; children: React.ReactNode }) {
  const [out, setOut] = useState(false)
  const host = document.querySelector('.device')
  if (!host) return null
  const leave = () => { setOut(true); setTimeout(onClose, 200) }
  const { bind, sheetStyle } = useSheetDrag(leave)
  return createPortal(
    <div className={`pp-wrap${out ? ' out' : ''}`} onClick={leave}>
      <div className="pp ps" style={sheetStyle} onClick={e => e.stopPropagation()} role="dialog" aria-label={title}>
        <div {...bind} className="sheet-grab-row"><div className="sheet-grab" /><h3 className="ps-title">{title}</h3></div>
        {children}
      </div>
    </div>, host)
}
const QtyRow = ({ p, qty, setQty }: { p: Pos; qty: number; setQty: (n: number) => void }) => (
  <>
    <label className="ps-l">Quantity</label>
    <div className="ps-field"><input value={String(Number(qty.toPrecision(8)))} inputMode="decimal" aria-label="Quantity" onChange={e => { const v = Number(e.target.value.replace(/[^0-9.]/g, '')); setQty(Math.min(p.qty, isNaN(v) ? 0 : v)) }} /><span>{p.sym}</span></div>
    <Slider value={Math.round((qty / p.qty) * 100 / 25) * 25} onChange={v => setQty((p.qty * v) / 100)} />
  </>
)

export function MarketClose({ p, price, onClose }: { p: Pos; price: number; onClose: () => void }) {
  const [qty, setQty] = useState(p.qty)
  const pnl = (price - p.entry) * qty * (p.long ? 1 : -1)
  return (
    <Sheet title="Market Close" onClose={onClose}>
      <QtyRow p={p} qty={qty} setQty={setQty} />
      <div className="ps-pnl"><span>Estimated PnL (without fee)</span><b className={pnl >= 0 ? 'up' : 'down'}>{usd(pnl)}</b></div>
      <button className={`ps-go ${p.long ? 'sell' : 'buy'}`} disabled={qty <= 0} onClick={() => { closePosition(p.id, qty / p.qty); onClose() }}>{p.long ? 'Sell / Short' : 'Buy / Long'}</button>
    </Sheet>
  )
}

export function LimitClose({ p, price, onClose }: { p: Pos; price: number; onClose: () => void }) {
  const d = pairOf(p.sym).dec
  const [qty, setQty] = useState(p.qty)
  const [lp, setLp] = useState(String(Number(price.toFixed(d))))
  const px = Number(lp) || 0
  const pnl = (px - p.entry) * qty * (p.long ? 1 : -1)
  const go = () => { const r = placeOrder({ sym: p.sym, fut: true, buy: !p.long, type: 'Limit', qty, px, fillPx: price, lev: p.lev, reduce: true, tp: null, sl: null }); emitEvt(r.evt); if (r.ok) onClose() }
  return (
    <Sheet title="Limit Close" onClose={onClose}>
      <label className="ps-l">Price</label>
      <div className="ps-field"><input value={lp} inputMode="decimal" aria-label="Limit price" onChange={e => setLp(e.target.value.replace(/[^0-9.]/g, ''))} /><span>USD</span></div>
      <QtyRow p={p} qty={qty} setQty={setQty} />
      <div className="ps-pnl"><span>Estimated PnL (without fee)</span><b className={pnl >= 0 ? 'up' : 'down'}>{usd(pnl)}</b></div>
      <button className={`ps-go ${p.long ? 'sell' : 'buy'}`} disabled={qty <= 0 || px <= 0} onClick={go}>{p.long ? 'Sell / Short' : 'Buy / Long'}</button>
    </Sheet>
  )
}

// Set TP/SL reuses the Auto Close screen from the order sheet and applies the levels to this position.
export function SetTpSl({ p, candles, onClose }: { p: Pos; candles: Candle[] | null; onClose: () => void }) {
  const a = useAcct()
  const dir = p.long ? 1 : -1, mark = a.prices[p.sym] ?? pairOf(p.sym).price
  const tp = a.orders.find(o => o.posId === p.id && o.trig === 'tp'), sl = a.orders.find(o => o.posId === p.id && o.trig === 'sl')
  const initial: AutoCloseValue | null = tp || sl
    ? { tp: tp ? (dir * (tp.px - p.entry) / p.entry) * 100 : null, sl: sl ? (dir * (p.entry - sl.px) / p.entry) * 100 : null, ref: p.entry } : null
  const c = candles ?? buildCandles(p.id + 3, 52, mark)
  return (
    <AutoClose buy={p.long} entry={p.entry} candles={c} dec={pairOf(p.sym).dec} notional={p.qty * p.entry} maxLoss={Math.abs(liqPrice(p) - p.entry) / p.entry * 100} initial={initial}
      onCancel={onClose}
      onSet={v => { setPosLevels(p.id, v.tp !== null ? p.entry * (1 + (dir * v.tp) / 100) : null, v.sl !== null ? p.entry * (1 - (dir * v.sl) / 100) : null); onClose() }} />
  )
}

export const closeHint = (p: Pos) => `${fmtQty(p.qty)} ${p.sym}`

export type Basis = 'Mark Price' | 'Last Price' | 'BBO'
// "Position PnL" sheet: choose the price used to view PnL, with this position's open / closed / all-time PnL (as in Backpack).
export function PnlSheet({ p, basis, setBasis, price, onClose }: { p: Pos; basis: Basis; setBasis: (b: Basis) => void; price: number; onClose: () => void }) {
  const a = useAcct()
  const open = (price - p.entry) * p.qty * (p.long ? 1 : -1)
  const closed = a.fills.filter(f => f.sym === p.sym && f.fut && f.pnl !== undefined && f.ts >= p.opened).reduce((t, f) => t + (f.pnl ?? 0), 0)
  const money = (n: number) => `${n < 0 ? '-' : ''}$${Math.abs(n).toFixed(2)}`
  const cls = (n: number) => (n > 0.004 ? 'up' : n < -0.004 ? 'down' : '')
  return (
    <Sheet title="" onClose={onClose}>
      <div className="seg3">{(['Mark Price', 'Last Price', 'BBO'] as Basis[]).map(b => <button key={b} className={basis === b ? 'on' : ''} onClick={() => setBasis(b)}>{b}</button>)}</div>
      <p className="ps-note">ROI = PnL / Initial Margin. You may switch the price basis used to view your PnL, but all margin calculations use mark price.</p>
      <h4 className="ps-h">Position PnL Breakdown</h4>
      <div className="ps-row"><span>Open PnL</span><b className={cls(open)}>{money(open)}</b></div>
      <div className="ps-row"><span>Closed PnL</span><b className={cls(closed)}>{money(closed)}</b></div>
      <div className="ps-row top"><span>All time PnL</span><b className={cls(open + closed)}>{money(open + closed)}</b></div>
    </Sheet>
  )
}
