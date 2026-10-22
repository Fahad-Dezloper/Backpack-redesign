import { useState } from 'react'
import { ArrowDownUp, ArrowUpDown, ArrowLeftRight, SquareArrowOutUpRight, SlidersHorizontal, BookOpen } from 'lucide-react'
import { Coin } from './Coin'
import { fmtPrice, fmtQty, pairOf } from '../data'
import { useAcct, closePosition, liqPrice, posMargin, type Acct, type Pos } from '../store'
import { MarketClose, LimitClose, SetTpSl, PnlSheet, type Basis } from './PosSheets'
import type { Candle } from './CandleChart'

// Positions and History laid out exactly like the Backpack app (captured from a real account), driven by the mock account.
const usd = (n: number, d = 2) => `${n < 0 ? '-' : ''}$${Math.abs(n).toLocaleString('en-US', { minimumFractionDigits: d, maximumFractionDigits: d })}`
const px = (a: Acct, sym: string) => a.prices[sym] ?? pairOf(sym).price
const perp = (s: string) => `${s}-PERP`
const ago = (ts: number) => {
  const sec = Math.round((Date.now() - ts) / 1000)
  return sec < 60 ? `${sec} seconds ago` : sec < 3600 ? `${Math.round(sec / 60)} minutes ago` : sec < 86400 ? `${Math.round(sec / 3600)} hours ago` : `${Math.round(sec / 86400)} days ago`
}
const Empty = ({ text }: { text: string }) => <div className="empty3"><BookOpen size={44} strokeWidth={1.5} /><span>{text}</span></div>
const Lbl = ({ t, i }: { t: string; i?: 'swap' | 'out' }) => <small>{t}{i === 'swap' && <ArrowLeftRight size={13} strokeWidth={2} />}{i === 'out' && <SquareArrowOutUpRight size={13} strokeWidth={2} />}</small>
const Tag = ({ t, c }: { t: string; c?: 'buy' | 'sell' | 'ok' }) => <span className={`bo-tag ${c ?? ''}`}>{t}</span>

export function ClassicPositions({ candles = null, candleSym = '' }: { candles?: Candle[] | null; candleSym?: string }) {
  const a = useAcct()
  const [desc, setDesc] = useState(true)
  const [sheet, setSheet] = useState<{ kind: 'tpsl' | 'limit' | 'market' | 'pnl'; id: number } | null>(null)
  const [basis, setBasis] = useState<Basis>('Mark Price')
  // PnL is viewed against the chosen price basis; margin maths always use mark
  const viewPx = (p: Pos) => { const m = px(a, p.sym); return basis === 'Mark Price' ? m : basis === 'Last Price' ? m * 1.00004 : m * (p.long ? 0.99998 : 1.00002) }
  const sp = sheet ? a.pos.find(x => x.id === sheet.id) ?? null : null
  const list = [...a.pos].sort((x, y) => (desc ? y.opened - x.opened : x.opened - y.opened))
  const card = (p: Pos) => {
    const d = pairOf(p.sym).dec, mark = px(a, p.sym), pnl = (viewPx(p) - p.entry) * p.qty * (p.long ? 1 : -1), pct = (pnl / posMargin(p)) * 100
    const col = pnl >= 0 ? 'up' : 'down'
    const tp = a.orders.find(o => o.posId === p.id && o.trig === 'tp'), sl = a.orders.find(o => o.posId === p.id && o.trig === 'sl')
    return (
      <div className="bo cp" key={p.id}>
        <div className="bo-head"><Coin sym={p.sym} size={34} /><b>{perp(p.sym)}</b><Tag t={p.long ? 'LONG' : 'SHORT'} c={p.long ? 'buy' : 'sell'} />
          <div className="cp-pnl"><Lbl t="PnL" /><b className={col}>{pnl < 0 ? '-' : ''}${Math.abs(pnl).toFixed(2)} ({pct < 0 ? '-' : ''}{Math.abs(pct).toFixed(2)}%)</b></div></div>
        <div className="bo-grid">
          <div><Lbl t="Quantity" i="swap" /><b>{fmtQty(p.qty)}</b></div>
          <div><Lbl t="Initial Margin" /><b>{usd(posMargin(p))}</b></div>
          <div className="r"><Lbl t="Funding" /><b>$0.00</b></div>
          <div><Lbl t="Entry Price" i="swap" /><b>{fmtPrice(p.entry, d)}</b></div>
          <div><Lbl t="Mark Price" /><b>{fmtPrice(mark, d)}</b></div>
          <div className="r"><Lbl t="Est. Liq. Price" /><b>{fmtPrice(liqPrice(p), d)}</b></div>
        </div>
        {(tp || sl) && (
          <div className="bo-grid cp-lv">
            {([['Take Profit', tp, 'take profit'], ['Stop Loss', sl, 'stop loss']] as const).map(([label, o, noun], i) => {
              if (!o) return <button key={label} className={`lv-set${i === 1 ? ' r' : ''}`} onClick={() => setSheet({ kind: 'tpsl', id: p.id })}><Lbl t={label} /><b>Set {noun}</b></button>
              const away = ((o.px - mark) / mark) * 100, reach = (o.px - mark) * (p.long ? 1 : -1)
              const ahead = label === 'Take Profit' ? reach > 0 : reach < 0
              return <div key={label} className={i === 1 ? 'r' : ''}><Lbl t={label} /><b>{fmtPrice(o.px, d)}</b><span className={`sub ${label === 'Take Profit' ? 'up' : 'down'}`}>{Math.abs(away).toFixed(2)}% {ahead ? 'away' : 'passed'}</span></div>
            })}
          </div>
        )}
        <div className="cp-btns"><button onClick={() => setSheet({ kind: 'tpsl', id: p.id })}>Set TP/SL</button><button onClick={() => setSheet({ kind: 'limit', id: p.id })}>Limit Close</button><button onClick={() => setSheet({ kind: 'market', id: p.id })}>Market Close</button><button className="ic" aria-label="Position PnL settings" onClick={() => setSheet({ kind: 'pnl', id: p.id })}><SlidersHorizontal size={19} strokeWidth={1.75} /></button></div>
      </div>
    )
  }
  return (
    <div>
      <div className="bo-bar"><button className="bo-sort left" onClick={() => setDesc(v => !v)}>Sort{desc ? <ArrowDownUp size={18} strokeWidth={1.75} /> : <ArrowUpDown size={18} strokeWidth={1.75} />}</button>
        <button className={`bo-cancelall${list.length ? '' : ' dim'}`} style={{ marginLeft: 'auto' }} disabled={!list.length} onClick={() => list.forEach(p => closePosition(p.id))}>Close All</button></div>
      {list.length ? <div className="bo-list">{list.map(card)}</div> : <Empty text="You don't have any open positions." />}
      {sp && sheet?.kind === 'market' && <MarketClose p={sp} price={px(a, sp.sym)} onClose={() => setSheet(null)} />}
      {sp && sheet?.kind === 'limit' && <LimitClose p={sp} price={px(a, sp.sym)} onClose={() => setSheet(null)} />}
      {sp && sheet?.kind === 'pnl' && <PnlSheet p={sp} basis={basis} setBasis={setBasis} price={viewPx(sp)} onClose={() => setSheet(null)} />}
      {sp && sheet?.kind === 'tpsl' && <SetTpSl p={sp} candles={sp.sym === candleSym ? candles : null} onClose={() => setSheet(null)} />}
    </div>
  )
}

export function ClassicHistory() {
  const a = useAcct()
  const [sub, setSub] = useState<'Fill History' | 'Order History' | 'Position History'>('Fill History')
  const fills = a.fills.filter(f => f.fut)
  const nm = (f: { fut: boolean; sym: string }) => (f.fut ? perp(f.sym) : f.sym)
  const side = (buy: boolean) => <Tag t={buy ? 'LONG' : 'SHORT'} c={buy ? 'buy' : 'sell'} />
  return (
    <div>
      <div className="ch-tabs">{(['Fill History', 'Order History', 'Position History'] as const).map(t => <button key={t} className={sub === t ? 'on' : ''} onClick={() => setSub(t)}>{t}</button>)}</div>
      <div className="bo-list">
        {sub === 'Fill History' && (fills.length ? fills.map(f => (
          <div className="bo" key={f.id}>
            <div className="bo-head"><Coin sym={f.sym} size={34} /><b>{nm(f)}</b><span style={{ marginLeft: 'auto' }}>{side(f.buy)}</span></div>
            <div className="bo-grid">
              <div><Lbl t="Price" /><b>{fmtPrice(f.px, pairOf(f.sym).dec)} USD</b></div>
              <div><Lbl t="Quantity" /><b>{fmtQty(f.qty)} {f.sym}</b></div>
              <div className="r"><Lbl t="Maker/Taker" /><b>{f.type === 'Limit' ? 'Maker' : 'Taker'}</b></div>
              <div><Lbl t="Notional" /><b>{(f.qty * f.px).toFixed(2)} USD</b></div>
              <div><Lbl t="Fee" /><b>{f.fee.toFixed(6)} USD</b></div>
              <div className="r"><Lbl t="Created" /><b>{ago(f.ts)}</b></div>
            </div>
          </div>)) : <Empty text="You don't have any fills." />)}
        {sub === 'Order History' && ([
          ...fills.map(f => ({ id: f.id, ts: f.ts, sym: f.sym, buy: f.buy, status: 'FILLED', filled: f.qty, total: f.qty, px: f.px, type: f.type })),
          ...a.cancelled.filter(c => c.fut).map(c => ({ id: c.id, ts: c.ts, sym: c.sym, buy: c.buy, status: 'CANCELLED', filled: 0, total: c.qty, px: c.px, type: 'Limit' })),
        ].sort((x, y) => y.ts - x.ts).map(o => (
          <div className="bo" key={o.id}>
            <div className="bo-head"><Coin sym={o.sym} size={34} /><b>{perp(o.sym)}</b>{side(o.buy)}<div className="cp-pnl"><Lbl t="Trigger Price" /><b>N/A</b></div></div>
            <div className="bo-grid">
              <div><Lbl t="Status" /><Tag t={o.status} c={o.status === 'FILLED' ? 'ok' : undefined} /></div>
              <div><Lbl t="Filled/Total" /><b>{fmtQty(o.filled)}/{o.total.toFixed(2)}</b></div>
              <div className="r"><Lbl t="Filled Notional" /><b>{(o.filled * o.px).toFixed(5)}</b></div>
              <div><Lbl t="Avg. Fill Price" /><b>{o.filled ? fmtPrice(o.px, pairOf(o.sym).dec) : '-'}</b></div>
              <div><Lbl t="Price" /><b>{o.type === 'Limit' ? fmtPrice(o.px, pairOf(o.sym).dec) : 'Market'}</b></div>
              <div className="r"><Lbl t="Time In Force" /><b>GTC</b></div>
            </div>
          </div>)))}
        {sub === 'Position History' && (fills.filter(f => f.pnl !== undefined).length ? fills.filter(f => f.pnl !== undefined).map(f => {
          const pnl = f.pnl ?? 0, entry = f.px, notional = f.qty * f.px
          return (
            <div className="bo" key={f.id}>
              <div className="bo-head"><Coin sym={f.sym} size={34} /><b>{perp(f.sym)}</b>{side(!f.buy)}<div className="cp-pnl"><Lbl t="Realized PnL" /><b className={pnl >= 0 ? 'up' : 'down'}>{pnl < 0 ? '-' : ''}${Math.abs(pnl).toFixed(2)} ({pnl < 0 ? '-' : ''}{Math.abs((pnl / Math.max(notional / 5, 1e-9)) * 100).toFixed(2)}%)</b></div></div>
              <div className="bo-grid">
                <div><Lbl t="Value" i="swap" /><b>{usd(notional)}</b></div>
                <div><Lbl t="Entry Price" /><b>{fmtPrice(entry - (pnl / f.qty) * (f.buy ? -1 : 1), pairOf(f.sym).dec)}</b></div>
                <div className="r"><Lbl t="Close Price" /><b>{fmtPrice(f.px, pairOf(f.sym).dec)}</b></div>
                <div><Lbl t="Funding" /><b>0</b></div>
                <div><Lbl t="Interest" /><b>0</b></div>
                <div className="r"><Lbl t="Open &amp; Close Fees" i="swap" /><b>{f.fee.toFixed(6)}</b></div>
              </div>
            </div>)
        }) : <Empty text="You don't have any closed positions." />)}
      </div>
    </div>
  )
}
