import { useState } from 'react'
import { BookOpen, ChevronDown, ListFilter } from 'lucide-react'
import { Coin } from './Coin'
import { fmtPrice, fmtQty, pairOf } from '../data'
import { useAcct, cancelOrder, cancelAll, editOrder, closePosition, liqPrice, posMargin, equity, available, unrealized, spotValue, type Acct, type Pos } from '../store'

// The tabs under the chart, driven by the mock account. One row = two lines, one action, so each reads at a glance.
const Empty = ({ text }: { text: string }) => <div className="empty3"><BookOpen size={44} strokeWidth={1.5} /><span>{text}</span></div>
const Chips = ({ items, on, set }: { items: string[]; on: string; set: (s: string) => void }) => (
  <div className="sub-chips">{items.map(i => <button key={i} className={on === i ? 'on' : ''} onClick={() => set(i)}>{i}</button>)}</div>
)
const Side = ({ long, fut }: { long: boolean; fut: boolean }) => <em className={`side-tag ${long ? 'up' : 'down'}`}>{fut ? (long ? 'Long' : 'Short') : (long ? 'Buy' : 'Sell')}</em>
const ago = (ts: number) => {
  const m = Math.round((Date.now() - ts) / 60000)
  return m < 1 ? 'just now' : m < 60 ? `${m}m ago` : m < 1440 ? `${Math.round(m / 60)}h ago` : `${Math.round(m / 1440)}d ago`
}
const usd = (n: number, sign = false) => `${sign ? (n >= 0 ? '+' : '−') : n < 0 ? '−' : ''}$${Math.abs(n).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
const px = (a: Acct, sym: string) => a.prices[sym] ?? pairOf(sym).price
const perp = (sym: string) => `${sym}-PERP`

function PosCard({ p, a, onOpen }: { p: Pos; a: Acct; onOpen: (sym: string) => void }) {
  const [more, setMore] = useState(false)
  const d = pairOf(p.sym).dec, mark = px(a, p.sym), dir = p.long ? 1 : -1
  const pnl = (mark - p.entry) * p.qty * dir, pct = (pnl / posMargin(p)) * 100
  const tp = a.orders.find(o => o.posId === p.id && o.trig === 'tp'), sl = a.orders.find(o => o.posId === p.id && o.trig === 'sl')
  // dollars and percent a level would realise, measured from entry
  const at = (price: number) => { const dollars = (price - p.entry) * p.qty * dir, move = ((price - p.entry) / p.entry) * 100 * dir; return `${usd(dollars, true)} (${move >= 0 ? '+' : '−'}${Math.abs(move).toFixed(1)}%)` }
  return (
    <div className="pos-card">
      <button className="pos-top" onClick={() => onOpen(p.sym)}>
        <span className="pos-name"><Coin sym={p.sym} size={22} />{perp(p.sym)} <em className={p.long ? 'tag-long' : 'tag-short'}>{p.long ? 'Long' : 'Short'} {p.lev}x</em></span>
        <span className={`pnl ${pnl >= 0 ? 'up' : 'down'}`}>{usd(pnl, true)} <small>({pct >= 0 ? '+' : '−'}{Math.abs(pct).toFixed(1)}%)</small></span>
      </button>
      <div className="pos-grid">
        <div><small>Size</small><b>{fmtQty(p.qty)} {p.sym}</b></div>
        <div><small>Entry</small><b>{fmtPrice(p.entry, d)}</b></div>
        {sl
          ? <div><small>Stop loss</small><b>{fmtPrice(sl.px, d)}</b><span className="sub">{at(sl.px)}</span></div>
          : <div><small>Liq. price</small><b>{fmtPrice(liqPrice(p), d)}</b></div>}
      </div>
      {more && (
        <div className="pos-more">
          {tp && <div><small>Take profit</small><b className="up">{fmtPrice(tp.px, d)}</b><span className="sub">{at(tp.px)}</span></div>}
          {sl && <div><small>Liq. price</small><b>{fmtPrice(liqPrice(p), d)}</b></div>}
          <div><small>Margin</small><b>{usd(posMargin(p))}</b></div>
          <div><small>Mark price</small><b>{fmtPrice(mark, d)}</b></div>
        </div>
      )}
      <div className="pos-foot">
        <button className="more-btn" aria-expanded={more} onClick={() => setMore(m => !m)}>{more ? 'Hide details' : 'More details'}<ChevronDown size={15} strokeWidth={2} style={{ transform: more ? 'rotate(180deg)' : 'none' }} /></button>
        <button className="pos-close" onClick={() => closePosition(p.id)}>Close</button>
      </div>
    </div>
  )
}

export function Positions({ onOpen }: { onOpen: (sym: string) => void }) {
  const a = useAcct()
  if (!a.pos.length) return <Empty text="No open positions" />
  return <div className="pos-list">{a.pos.map(p => <PosCard key={p.id} p={p} a={a} onOpen={onOpen} />)}</div>
}

// Open Orders, laid out like Backpack's: Open (n) / Conditional chips, Sort & Filter, Cancel All, then one card per order
// (coin + LIMIT + BUY tags, Filled / Quantity / Value, Price / Take Profit / Stop Loss, Edit and Cancel).
export function Orders() {
  const a = useAcct()
  const [sub, setSub] = useState<'Open' | 'Conditional'>('Open')
  const [newest, setNewest] = useState(true)
  const [editId, setEditId] = useState<number | null>(null)
  const [ep, setEp] = useState(''), [eq, setEq] = useState('')
  const open = a.orders.filter(o => o.kind === 'limit'), cond = a.orders.filter(o => o.kind === 'stop')
  const list = [...(sub === 'Open' ? open : cond)].sort((x, y) => (newest ? y.placed - x.placed : x.placed - y.placed))
  const dash = (n: number | null, d: number) => (n === null ? '-' : fmtPrice(n, d))
  const startEdit = (o: (typeof list)[number]) => { setEditId(o.id); setEp(String(Number(o.px.toFixed(pairOf(o.sym).dec)))); setEq(String(Number(o.qty.toPrecision(8)))) }
  return (
    <div>
      <div className="bo-bar">
        <div className="sub-chips">
          <button className={sub === 'Open' ? 'on' : ''} onClick={() => setSub('Open')}>Open{open.length ? ` (${open.length})` : ''}</button>
          <button className={sub === 'Conditional' ? 'on' : ''} onClick={() => setSub('Conditional')}>Conditional</button>
        </div>
        <button className="bo-sort" onClick={() => setNewest(n => !n)} aria-label={`Sort: ${newest ? 'newest' : 'oldest'} first`}>Sort &amp; Filter<ListFilter size={18} strokeWidth={1.75} /></button>
        <button className={`bo-cancelall${list.length ? '' : ' dim'}`} disabled={!list.length} onClick={() => cancelAll(sub === 'Open' ? 'limit' : 'stop')}>Cancel All</button>
      </div>
      {list.length === 0 ? <Empty text={sub === 'Open' ? "You don't have any open orders." : "You don't have any conditional orders."} /> : (
        <div className="bo-list">
          {list.map(o => {
            const d = pairOf(o.sym).dec, name = o.fut ? perp(o.sym) : o.sym, editing = editId === o.id
            const kind = o.kind === 'stop' ? (o.trig === 'tp' ? 'TAKE PROFIT' : 'STOP LOSS') : 'LIMIT'
            return (
              <div className="bo" key={o.id}>
                <div className="bo-head"><Coin sym={o.sym} size={34} /><b>{name}</b><span className="bo-tag">{kind}</span><span className={`bo-tag ${o.buy ? 'buy' : 'sell'}`}>{o.buy ? 'BUY' : 'SELL'}</span></div>
                <div className="bo-grid">
                  <div><small>Filled</small><b>0</b></div>
                  <div><small>Quantity</small><b>{fmtQty(o.qty)}</b></div>
                  <div className="r"><small>Value</small><b>{usd(o.qty * o.px)}</b></div>
                  <div><small>{o.kind === 'stop' ? 'Trigger' : 'Price'}</small><b>{fmtPrice(o.px, d)}</b></div>
                  <div><small>Take Profit</small><b>{dash(o.tp, d)}</b></div>
                  <div className="r"><small>Stop Loss</small><b>{dash(o.sl, d)}</b></div>
                </div>
                {editing ? (
                  <div className="bo-edit">
                    <label><small>{o.kind === 'stop' ? 'Trigger' : 'Price'}</small><input value={ep} inputMode="decimal" onChange={e => setEp(e.target.value.replace(/[^0-9.]/g, ''))} /></label>
                    <label><small>Quantity</small><input value={eq} inputMode="decimal" onChange={e => setEq(e.target.value.replace(/[^0-9.]/g, ''))} /></label>
                    <button onClick={() => setEditId(null)}>Back</button>
                    <button className="save" onClick={() => { if (editOrder(o.id, Number(ep), Number(eq))) setEditId(null) }}>Save</button>
                  </div>
                ) : (
                  <div className="bo-btns"><button onClick={() => startEdit(o)}>Edit</button><button onClick={() => cancelOrder(o.id)}>Cancel</button></div>
                )}
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}

export function Balances() {
  const a = useAcct()
  const holdings = Object.entries(a.spot)
  const eq = equity(a)
  return (
    <div className="rows">
      <div className="bal-sum"><div><small>Net equity</small><b>{usd(eq)}</b></div><div className="right"><small>Open PnL</small><b className={unrealized(a) >= 0 ? 'up' : 'down'}>{usd(unrealized(a), true)}</b></div></div>
      <div className="row2 bal-row">
        <Coin sym="USD" size={32} />
        <div className="row2-main"><div className="row2-t"><b>USD</b></div><div className="row2-s"><span>Available {usd(available(a))}</span></div></div>
        <div className="row2-r"><b>{usd(a.cash)}</b><small className="up">Lending</small></div>
      </div>
      {holdings.map(([sym, q]) => (
        <div className="row2 bal-row" key={sym}>
          <Coin sym={sym} size={32} />
          <div className="row2-main"><div className="row2-t"><b>{sym}</b></div><div className="row2-s"><span>{fmtQty(q)} {sym}</span></div></div>
          <div className="row2-r"><b>{usd(q * px(a, sym))}</b><small>@ {fmtPrice(px(a, sym), pairOf(sym).dec)}</small></div>
        </div>
      ))}
      {holdings.length > 0 && <div className="bal-note">Spot holdings {usd(spotValue(a))}</div>}
    </div>
  )
}

export function Borrows() {
  const a = useAcct()
  const limit = equity(a) * 0.4
  return (
    <div className="borrow">
      <div className="borrow-top"><div><small>Borrowed</small><b>$0.00</b></div><div className="right"><small>Borrow limit</small><b>{usd(limit)}</b></div></div>
      <div className="meter"><i style={{ width: '0%' }} /></div>
      <div className="borrow-foot"><span>0% of limit used</span><span>Rate 6.2% APR</span></div>
    </div>
  )
}

export function History() {
  const a = useAcct()
  const [sub, setSub] = useState('Fills')
  const when = (ts: number) => ago(ts)
  const kindText = (k: string) => (k === 'tp' ? 'Take profit' : k === 'sl' ? 'Stop loss' : k === 'liq' ? 'Liquidated' : k === 'close' ? 'Close' : 'Open')
  const closes = a.fills.filter(f => f.fut && f.pnl !== undefined)
  type Row = { id: number; ts: number; node: React.ReactNode }
  const orderRows: Row[] = [
    ...a.fills.map(f => ({ id: f.id, ts: f.ts, node: (
      <div className="row2" key={'f' + f.id}><div className="row2-main"><div className="row2-t"><Side long={f.buy} fut={f.fut} /><b>{f.fut ? perp(f.sym) : `${f.sym}/USD`}</b><small>{f.type}</small></div><div className="row2-s"><span className="up">Filled</span><span className="dot">·</span><span>{fmtQty(f.qty)} {f.sym}</span></div></div><div className="row2-r"><small>{when(f.ts)}</small></div></div>
    ) })),
    ...a.cancelled.map(c => ({ id: c.id, ts: c.ts, node: (
      <div className="row2" key={'c' + c.id}><div className="row2-main"><div className="row2-t"><Side long={c.buy} fut={c.fut} /><b>{c.fut ? perp(c.sym) : `${c.sym}/USD`}</b><small>{c.type}</small></div><div className="row2-s"><span>Cancelled</span><span className="dot">·</span><span>{fmtQty(c.qty)} {c.sym}</span></div></div><div className="row2-r"><small>{when(c.ts)}</small></div></div>
    ) })),
  ].sort((x, y) => y.ts - x.ts)
  return (
    <div>
      <div className="sub-row"><Chips items={['Fills', 'Orders', 'Positions']} on={sub} set={setSub} /></div>
      <div className="rows">
        {sub === 'Fills' && (a.fills.length ? a.fills.map(f => (
          <div className="row2" key={f.id}>
            <div className="row2-main">
              <div className="row2-t"><Side long={f.buy} fut={f.fut} /><b>{fmtQty(f.qty)} {f.sym}</b>{f.kind !== 'open' && <small>{kindText(f.kind)}</small>}</div>
              <div className="row2-s"><span>@ {fmtPrice(f.px, pairOf(f.sym).dec)}</span><span className="dot">·</span><span>Fee ${f.fee.toFixed(4)}</span></div>
            </div>
            <div className="row2-r">{f.pnl !== undefined ? <b className={f.pnl >= 0 ? 'up' : 'down'}>{usd(f.pnl, true)}</b> : null}<small>{when(f.ts)}</small></div>
          </div>
        )) : <Empty text="No fills yet" />)}
        {sub === 'Orders' && (orderRows.length ? orderRows.map(r => r.node) : <Empty text="No orders yet" />)}
        {sub === 'Positions' && (closes.length ? closes.map(f => (
          <div className="row2" key={f.id}>
            <div className="row2-main"><div className="row2-t"><Side long={!f.buy} fut /><b>{perp(f.sym)}</b><small>{kindText(f.kind)}</small></div><div className="row2-s"><span>Closed {fmtQty(f.qty)} {f.sym}</span><span className="dot">·</span><span>@ {fmtPrice(f.px, pairOf(f.sym).dec)}</span></div></div>
            <div className="row2-r"><b className={(f.pnl ?? 0) >= 0 ? 'up' : 'down'}>{usd(f.pnl ?? 0, true)}</b><small>{when(f.ts)}</small></div>
          </div>
        )) : <Empty text="No closed positions yet" />)}
      </div>
    </div>
  )
}
