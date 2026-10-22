import { useSyncExternalStore } from 'react'
import { pairs, pairOf } from './data'

// Mock exchange account. Nothing here is real: orders fill against the demo feed's prices, and the account lives only in memory.
export type Pos = { id: number; sym: string; long: boolean; qty: number; entry: number; lev: number; opened: number }
export type Ord = {
  id: number; sym: string; fut: boolean; buy: boolean; kind: 'limit' | 'stop'; qty: number; px: number; lev: number; reduce: boolean; placed: number
  tp: number | null; sl: number | null            // levels attached to a resting limit order, armed when it fills
  posId?: number; trig?: 'tp' | 'sl'                // a conditional order guards one position
}
export type Fill = { id: number; sym: string; fut: boolean; buy: boolean; qty: number; px: number; fee: number; ts: number; kind: 'open' | 'close' | 'tp' | 'sl' | 'liq'; type: 'Market' | 'Limit' | 'Trigger'; pnl?: number }
export type Cancelled = { id: number; sym: string; fut: boolean; buy: boolean; qty: number; px: number; ts: number; type: string }
export type Acct = { cash: number; spot: Record<string, number>; pos: Pos[]; orders: Ord[]; fills: Fill[]; cancelled: Cancelled[]; prices: Record<string, number>; v: number }
export type Req = { sym: string; fut: boolean; buy: boolean; type: 'Market' | 'Limit'; qty: number; px: number; fillPx: number; lev: number; reduce: boolean; tp: number | null; sl: number | null }
// one-line banner text, worded like Backpack's ("PUMP-PERP order filled", "BP order accepted", "Order cancelled!")
export type Evt = { text: string; kind?: 'success' | 'error' | 'info'; quiet?: boolean }

const FEE_MKT = 0.0005, FEE_LMT = 0.0002
const MIN = 60_000, now = Date.now()
let seq = 100
let S: Acct = {
  cash: 2500, spot: { SOL: 5 },
  prices: Object.fromEntries(pairs.map(p => [p.sym, p.price])),
  pos: [{ id: 1, sym: 'SOL', long: false, qty: 20, entry: 105.9, lev: 5, opened: now - 38 * MIN }],
  orders: [{ id: 2, sym: 'SOL', fut: true, buy: false, kind: 'stop', qty: 20, px: 108.5, lev: 5, reduce: true, placed: now - 37 * MIN, tp: null, sl: null, posId: 1, trig: 'sl' }],
  fills: [
    { id: 3, sym: 'SOL', fut: true, buy: false, qty: 20, px: 105.9, fee: 1.06, ts: now - 38 * MIN, kind: 'open', type: 'Market' },
    { id: 4, sym: 'PUMP', fut: true, buy: false, qty: 1800, px: 0.004441, fee: 0.004, ts: now - 26 * 3600_000, kind: 'close', type: 'Market', pnl: 0.77 },
    { id: 5, sym: 'SOL', fut: false, buy: true, qty: 5, px: 101.2, fee: 0.253, ts: now - 52 * 3600_000, kind: 'open', type: 'Limit' },
  ],
  cancelled: [{ id: 6, sym: 'SOL', fut: true, buy: true, qty: 2, px: 96.5, ts: now - 30 * 3600_000, type: 'Limit' }],
  v: 0,
}
// Demo mode (?clean=1): the starting short sits on ETH-PERP, so a first SOL trade opens a brand-new position instead of netting against the old SOL short.
if (typeof location !== 'undefined' && /[?&]clean=1/.test(location.search)) {
  S = { ...S, pos: [{ id: 1, sym: 'ETH', long: false, qty: 2, entry: 2440, lev: 5, opened: now - 38 * MIN }],
    orders: [{ ...S.orders[0], sym: 'ETH', qty: 2, px: 2480 }],
    fills: S.fills.map(f => f.id === 3 ? { ...f, sym: 'ETH', qty: 2, px: 2440, fee: 2.44 } : f) }
}
const subs = new Set<() => void>(), evs = new Set<(e: Evt) => void>()
const emit = (next: Acct) => { S = { ...next, v: S.v + 1 }; subs.forEach(f => f()) }
const notify = (e: Evt) => evs.forEach(f => f(e))
export const emitEvt = (e: Evt) => notify(e)
export const onEvent = (f: (e: Evt) => void) => { evs.add(f); return () => { evs.delete(f) } }
export const useAcct = () => useSyncExternalStore(f => { subs.add(f); return () => { subs.delete(f) } }, () => S)

const px = (sym: string, a = S) => a.prices[sym] ?? pairOf(sym).price
const fmt = (n: number, sym: string) => n.toLocaleString('en-US', { minimumFractionDigits: pairOf(sym).dec, maximumFractionDigits: pairOf(sym).dec })
const q2 = (n: number) => (n >= 100 ? Math.round(n).toLocaleString('en-US') : Number(n.toPrecision(3)).toString())
const posPnl = (p: Pos, price: number) => (price - p.entry) * p.qty * (p.long ? 1 : -1)
export const posMargin = (p: Pos) => (p.qty * p.entry) / p.lev
export const liqPrice = (p: Pos) => p.entry * (p.long ? 1 - 0.9 / p.lev : 1 + 0.9 / p.lev)

// ---- account numbers ----
export const unrealized = (a: Acct) => a.pos.reduce((t, p) => t + posPnl(p, px(p.sym, a)), 0)
export const spotValue = (a: Acct) => Object.entries(a.spot).reduce((t, [s, q]) => t + q * px(s, a), 0)
export const marginUsed = (a: Acct) => a.pos.reduce((t, p) => t + posMargin(p), 0)
export const reserved = (a: Acct) => a.orders.filter(o => o.kind === 'limit' && !o.reduce).reduce((t, o) => t + (o.qty * o.px) / (o.fut ? o.lev : 1), 0)
export const equity = (a: Acct) => a.cash + unrealized(a) + spotValue(a)
export const available = (a: Acct) => Math.max(0, a.cash + unrealized(a) - marginUsed(a) - reserved(a))

// ---- mutation helpers (work on a draft copy, then emit once) ----
type D = { cash: number; spot: Record<string, number>; pos: Pos[]; orders: Ord[]; fills: Fill[]; cancelled: Cancelled[]; evts: Evt[] }
const draft = (): D => ({ cash: S.cash, spot: { ...S.spot }, pos: S.pos.map(p => ({ ...p })), orders: [...S.orders], fills: [...S.fills], cancelled: [...S.cancelled], evts: [] })
const commit = (d: D) => { emit({ ...S, cash: d.cash, spot: d.spot, pos: d.pos, orders: d.orders, fills: d.fills, cancelled: d.cancelled }); d.evts.forEach(notify) }

function arm(d: D, p: Pos, tp: number | null, sl: number | null) {
  d.orders = d.orders.filter(o => !(o.posId === p.id && (o.trig === 'tp' || o.trig === 'sl') && ((tp !== null && o.trig === 'tp') || (sl !== null && o.trig === 'sl'))))
  const add = (trig: 'tp' | 'sl', level: number) => d.orders.push({ id: ++seq, sym: p.sym, fut: true, buy: !p.long, kind: 'stop', qty: p.qty, px: level, lev: p.lev, reduce: true, placed: Date.now(), tp: null, sl: null, posId: p.id, trig })
  if (tp !== null) add('tp', tp)
  if (sl !== null) add('sl', sl)
}

function fillFut(d: D, o: { sym: string; buy: boolean; qty: number; lev: number; reduce: boolean; tp: number | null; sl: number | null }, price: number, type: Fill['type'], kind: Fill['kind'] = 'open') {
  const fee = o.qty * price * (type === 'Limit' ? FEE_LMT : type === 'Trigger' ? FEE_MKT : FEE_MKT)
  d.cash -= fee
  const ex = d.pos.find(p => p.sym === o.sym)
  let left = o.qty
  if (ex && ex.long !== o.buy) {
    const c = Math.min(left, ex.qty), pnl = (price - ex.entry) * c * (ex.long ? 1 : -1)
    d.cash += pnl; ex.qty -= c; left -= c
    d.fills.unshift({ id: ++seq, sym: o.sym, fut: true, buy: o.buy, qty: c, px: price, fee, ts: Date.now(), kind: kind === 'open' ? 'close' : kind, type, pnl })
    d.orders = d.orders.map(x => (x.posId === ex.id && x.trig ? { ...x, qty: ex.qty } : x))
    if (ex.qty <= 1e-12) { d.pos = d.pos.filter(p => p !== ex); d.orders = d.orders.filter(x => x.posId !== ex.id) }
  }
  if (left > 1e-12 && !o.reduce) {
    const cur = d.pos.find(p => p.sym === o.sym && p.long === o.buy)
    if (cur) { cur.entry = (cur.entry * cur.qty + price * left) / (cur.qty + left); cur.qty += left; cur.lev = o.lev; d.orders = d.orders.map(x => (x.posId === cur.id && x.trig ? { ...x, qty: cur.qty, lev: cur.lev } : x)) }
    else d.pos.push({ id: ++seq, sym: o.sym, long: o.buy, qty: left, entry: price, lev: o.lev, opened: Date.now() })
    const p = d.pos.find(x => x.sym === o.sym && x.long === o.buy)!
    d.fills.unshift({ id: ++seq, sym: o.sym, fut: true, buy: o.buy, qty: left, px: price, fee: ex && ex.long !== o.buy ? 0 : fee, ts: Date.now(), kind: 'open', type })
    if (o.tp !== null || o.sl !== null) arm(d, p, o.tp, o.sl)
  }
}

function fillSpot(d: D, o: { sym: string; buy: boolean; qty: number }, price: number, type: Fill['type']) {
  const fee = o.qty * price * (type === 'Limit' ? FEE_LMT : FEE_MKT)
  if (o.buy) { d.cash -= o.qty * price + fee; d.spot[o.sym] = (d.spot[o.sym] ?? 0) + o.qty } else { d.cash += o.qty * price - fee; d.spot[o.sym] = (d.spot[o.sym] ?? 0) - o.qty }
  if ((d.spot[o.sym] ?? 0) < 1e-12) delete d.spot[o.sym]
  d.fills.unshift({ id: ++seq, sym: o.sym, fut: false, buy: o.buy, qty: o.qty, px: price, fee, ts: Date.now(), kind: 'open', type })
}

// ---- public actions ----
export function placeOrder(r: Req): { ok: boolean; evt: Evt } {
  const name = r.fut ? `${r.sym}-PERP` : `${r.sym}/USD`, verb = r.fut ? (r.buy ? 'Long' : 'Short') : (r.buy ? 'Buy' : 'Sell')
  const reject = (sub: string) => ({ ok: false, evt: { text: sub, kind: 'error' as const } })
  if (!(r.qty > 0)) return reject('Enter an amount')
  const notional = r.qty * (r.type === 'Limit' ? r.px : r.fillPx)
  if (r.fut) {
    const ex = S.pos.find(p => p.sym === r.sym)
    if (r.reduce && (!ex || ex.long === r.buy)) return reject('Reduce only: no position to reduce')
    const closing = ex && ex.long !== r.buy ? Math.min(ex.qty, r.qty) * (r.type === 'Limit' ? r.px : r.fillPx) : 0
    if (!r.reduce && (notional - closing) / r.lev > available(S) + 1e-9) return reject('Not enough margin')
  } else if (r.buy) { if (notional > available(S) + 1e-9) return reject('Not enough USD') } else if ((S.spot[r.sym] ?? 0) + 1e-12 < r.qty) return reject(`Not enough ${r.sym}`)
  const marketable = r.type === 'Market' || (r.buy ? r.px >= r.fillPx : r.px <= r.fillPx)
  const d = draft()
  if (marketable) {
    const price = r.type === 'Market' ? r.fillPx : r.fillPx
    if (r.fut) fillFut(d, r, price, 'Market'); else fillSpot(d, r, price, 'Market')
    commit(d)
    return { ok: true, evt: { text: `${name} order filled` } }
  }
  d.orders.push({ id: ++seq, sym: r.sym, fut: r.fut, buy: r.buy, kind: 'limit', qty: r.qty, px: r.px, lev: r.lev, reduce: r.reduce, placed: Date.now(), tp: r.tp, sl: r.sl })
  commit(d)
  return { ok: true, evt: { text: `${name} order accepted` } }
}

export function closePosition(id: number, fraction = 1) {
  const p = S.pos.find(x => x.id === id); if (!p) return
  const d = draft(), price = px(p.sym)
  fillFut(d, { sym: p.sym, buy: !p.long, qty: p.qty * fraction, lev: p.lev, reduce: true, tp: null, sl: null }, price, 'Market', 'close')
  const pnl = d.fills[0]?.pnl ?? 0
  d.evts.push({ text: `${p.sym}-PERP order filled` })
  commit(d)
}

export function cancelOrder(id: number) {
  const o = S.orders.find(x => x.id === id); if (!o) return
  const d = draft(); d.orders = d.orders.filter(x => x.id !== id)
  d.evts.push({ text: 'Order cancelled!', quiet: true }) // Backpack shows the banner without the success buzz
  if (o.kind === 'limit') d.cancelled.unshift({ id: o.id, sym: o.sym, fut: o.fut, buy: o.buy, qty: o.qty, px: o.px, ts: Date.now(), type: 'Limit' })
  commit(d)
}
export function editOrder(id: number, px: number, qty: number) {
  const o = S.orders.find(x => x.id === id); if (!o || !(px > 0) || !(qty > 0)) return false
  const d = draft(); d.orders = d.orders.map(x => (x.id === id ? { ...x, px, qty } : x)); commit(d); return true
}
export const cancelAll = (kind: Ord['kind']) => S.orders.filter(o => o.kind === kind).forEach(o => cancelOrder(o.id))
// replace a position's take profit / stop loss; null removes that level
export function setPosLevels(posId: number, tp: number | null, sl: number | null) {
  const p = S.pos.find(x => x.id === posId); if (!p) return
  const d = draft(); d.orders = d.orders.filter(o => !(o.posId === posId && o.trig)); arm(d, d.pos.find(x => x.id === posId)!, tp, sl); commit(d)
}
export const setLevels = (posId: number, tp: number | null, sl: number | null) => { const p = S.pos.find(x => x.id === posId); if (!p) return; const d = draft(); arm(d, d.pos.find(x => x.id === posId)!, tp, sl); commit(d) }

// ---- price feed: the active market pushes real ticks; the rest drift on their own ----
export function setPrice(sym: string, price: number) {
  if (S.prices[sym] === price) return
  const d = draft()
  let changed = false
  // resting limit orders fill when the market reaches them
  for (const o of S.orders.filter(o => o.kind === 'limit' && o.sym === sym)) {
    if (o.buy ? price <= o.px : price >= o.px) {
      d.orders = d.orders.filter(x => x.id !== o.id); changed = true
      if (o.fut) fillFut(d, o, o.px, 'Limit'); else fillSpot(d, o, o.px, 'Limit')
      d.evts.push({ text: `${o.fut ? sym + '-PERP' : sym} order filled` })
    }
  }
  // take profit / stop loss, then liquidation
  for (const p of [...d.pos].filter(p => p.sym === sym)) {
    const liq = liqPrice(p), hitLiq = p.long ? price <= liq : price >= liq
    const trig = d.orders.find(o => o.posId === p.id && o.trig && (p.long ? (o.trig === 'tp' ? price >= o.px : price <= o.px) : (o.trig === 'tp' ? price <= o.px : price >= o.px)))
    if (!trig && !hitLiq) continue
    const at = trig ? trig.px : liq, kind: Fill['kind'] = trig ? trig.trig! : 'liq'
    changed = true
    fillFut(d, { sym, buy: !p.long, qty: p.qty, lev: p.lev, reduce: true, tp: null, sl: null }, at, 'Trigger', kind)
    const pnl = d.fills[0]?.pnl ?? 0
    d.evts.push(kind === 'tp' ? { text: 'Take profit triggered' } : { text: kind === 'sl' ? 'Stop loss triggered' : 'Position liquidated', kind: 'error' })
  }
  const prices = { ...S.prices, [sym]: price }
  if (changed) emit({ ...S, cash: d.cash, spot: d.spot, pos: d.pos, orders: d.orders, fills: d.fills, cancelled: d.cancelled, prices })
  else emit({ ...S, prices })
  d.evts.forEach(notify)
}

let sim: number | undefined, active = ''
export const setActive = (sym: string) => { active = sym }
export function startSim() {
  if (sim) return
  sim = window.setInterval(() => {
    const a = active, next: Record<string, number> = {}
    for (const p of pairs) { if (p.sym === a) continue; const cur = S.prices[p.sym] ?? p.price; next[p.sym] = Number((cur + (p.price - cur) * 0.03 + (Math.random() - 0.5) * p.price * 0.0012).toFixed(p.dec)) }
    for (const [s, v] of Object.entries(next)) setPrice(s, v)
  }, 900)
}
export const getAcct = () => S
