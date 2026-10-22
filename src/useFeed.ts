import { useEffect, useRef, useState } from 'react'
import { buildCandles, type Candle } from './components/CandleChart'
import { setPrice } from './store'

// Mock live market: a mean-reverting random walk drives price, candles, a tight two-sided book and the trade tape.
export type Lvl = [price: number, qty: number, label: string]
export type Tape = { id: number; t: string; p: number; q: number; up: boolean }
export type Snap = { price: number; dir: 1 | -1; candles: Candle[]; bids: Lvl[]; asks: Lvl[]; tape: Tape[] }

const TICK_MS = 650
const TICKS_PER_CANDLE = 14
const LEVELS = 10
const r = Math.random
const ri = (a: number, b: number) => a + Math.floor(r() * (b - a + 1))
const fmtQ = (n: number) =>
  n >= 1e6 ? `${(n / 1e6).toFixed(2).replace(/\.?0+$/, '')}M`
  : n >= 1e3 ? `${(n / 1e3).toFixed(1).replace(/\.0$/, '')}K`
  : n >= 100 ? String(Math.round(n)) : String(Number(n.toPrecision(3)))
// quantities scale with the price so every market shows believable sizes (about $100 of resting size per level)
const rq = (n: number) => (n >= 100 ? Math.round(n) : Number(n.toPrecision(3)))

// typical resting size per level, in tokens
const target = (S: number) => Math.exp(Math.log(S) + r() * 2.3)
const gap = () => (r() < 0.55 ? 1 : r() < 0.7 ? 2 : 3) // price steps between neighbouring levels, in ticks

type Core = {
  p: number; candles: Candle[]; n: number; id: number; dir: 1 | -1
  s: number; k: number            // spread in ticks, and how far the last trade sits above the best bid
  gB: number[]; gA: number[]      // gaps between levels (ticks)
  tB: number[]; tA: number[]      // resting-size targets
  bidQ: number[]; askQ: number[]
  tape: Tape[]
}

function init(base: number, dec: number, fut: boolean, seed: number): Core {
  const S = 130 / base
  const tB = Array.from({ length: LEVELS }, () => target(S)), tA = Array.from({ length: LEVELS }, () => target(S))
  return {
    p: base, candles: buildCandles(seed, 52, base), n: 0, id: 150, dir: 1,
    tape: Array.from({ length: 150 }, (_, i) => ({ id: i, t: new Date(Date.now() - (i + 1) * 1100).toTimeString().slice(0, 8), p: Number((base * (1 + (r() - 0.5) * 0.0008)).toFixed(dec)), q: rq(Math.exp(Math.log(4 / base) + r() * 4.5)), up: r() < 0.5 })),
    s: 1, k: 0, gB: Array.from({ length: LEVELS }, gap), gA: Array.from({ length: LEVELS }, gap),
    tB, tA, bidQ: [...tB], askQ: [...tA],
  }
}

function snap(c: Core, dec: number): Snap {
  const tick = Math.pow(10, -dec), px = (v: number) => Number(v.toFixed(dec))
  const bestBid = c.p - c.k * tick, bestAsk = bestBid + c.s * tick
  let a = 0, b = 0
  const bids: Lvl[] = c.gB.map((g, i) => { if (i) b += g; return [px(bestBid - b * tick), c.bidQ[i], fmtQ(c.bidQ[i])] })
  const asks: Lvl[] = c.gA.map((g, i) => { if (i) a += g; return [px(bestAsk + a * tick), c.askQ[i], fmtQ(c.askQ[i])] })
  return { price: c.p, dir: c.dir, candles: c.candles.map(x => ({ ...x })), bids, asks: asks.reverse(), tape: c.tape }
}

export function useFeed(sym: string, base: number, dec: number, fut: boolean, seed: number): Snap {
  const [s, setS] = useState(() => snap(init(base, dec, fut, seed), dec))
  useEffect(() => {
    const c = init(base, dec, fut, seed)
    setS(snap(c, dec))
    const t = setInterval(() => {
      const prev = c.p
      c.p = Number((c.p + (base - c.p) * 0.03 + (r() - 0.5) * base * 0.0012 + (r() < 0.06 ? (r() - 0.5) * base * 0.004 : 0)).toFixed(dec))
      c.dir = c.p >= prev ? 1 : -1
      setPrice(sym, c.p)
      c.n++

      const last = c.candles[c.candles.length - 1]
      if (c.n % TICKS_PER_CANDLE === 0) { c.candles.push({ o: c.p, c: c.p, h: c.p, l: c.p, v: 0.04 }); c.candles.shift() }
      else { last.c = c.p; last.h = Math.max(last.h, c.p); last.l = Math.min(last.l, c.p); last.v += r() * 0.03 }

      // spread stays 1 tick almost always, occasionally 2; the last trade sits on the bid or the ask
      if (r() < 0.08) c.s = r() < 0.85 ? 1 : 2
      if (r() < 0.35) c.k = r() < 0.5 ? 0 : c.s
      c.k = Math.min(c.k, c.s)
      if (r() < 0.12) c.gB[ri(1, LEVELS - 1)] = gap()
      if (r() < 0.12) c.gA[ri(1, LEVELS - 1)] = gap()

      // every size moves every tick: random walk pulled toward a slowly changing target
      for (const [q, tg] of [[c.bidQ, c.tB], [c.askQ, c.tA]] as const) for (let i = 0; i < LEVELS; i++) {
        if (r() < 0.06) tg[i] = target(130 / base)
        q[i] = Math.max(2.6 / base, q[i] * (0.82 + r() * 0.36) + (tg[i] - q[i]) * 0.12)
      }
      // keep the book balanced: bid share drifts only a couple of points around 50%
      const share = 0.5 + 0.02 * Math.sin(c.n / 7) + (r() - 0.5) * 0.01
      const aSum = c.askQ.reduce((x, y) => x + y, 0), bSum = c.bidQ.reduce((x, y) => x + y, 0)
      const f = (aSum * share) / (1 - share) / bSum
      for (let i = 0; i < LEVELS; i++) { c.bidQ[i] *= f; c.bidQ[i] = rq(c.bidQ[i]); c.askQ[i] = rq(c.askQ[i]) }

      for (let m = r() < 0.2 ? 2 : r() < 0.85 ? 1 : 0; m > 0; m--)
        c.tape.unshift({ id: ++c.id, t: new Date().toTimeString().slice(0, 8), p: c.p, q: rq(Math.exp(Math.log(4 / base) + r() * 4.5)), up: r() < (c.dir > 0 ? 0.6 : 0.4) })
      c.tape = c.tape.slice(0, 150)
      setS(snap(c, dec))
    }, TICK_MS)
    return () => clearInterval(t)
  }, [sym, base, dec, fut, seed])
  return s
}

// Mark price trails the last trade, like an index-based mark.
export function useMark(price: number, dec: number): number {
  const ref = useRef(price)
  ref.current += (price - ref.current) * 0.08
  return Number(ref.current.toFixed(dec))
}
