import { useEffect, useState } from 'react'
import { LayoutList } from 'lucide-react'
import { fmtPrice } from '../data'

// Static snapshots copied from the original's screens; the last digit jitters to feel live.
export type L = [price: number, qty: number, label: string]
export const BOOKS = {
  futures: {
    asks: [[0.004443, 856100, '856.1K'], [0.0044426, 3e6, '3M'], [0.0044425, 466600, '466.6K'], [0.0044424, 800, '800'], [0.0044421, 112500, '112.5K'], [0.0044415, 831100, '831.1K']] as L[],
    bids: [[0.0044403, 135600, '135.6K'], [0.0044402, 116600, '116.6K'], [0.0044401, 1700, '1.7K'], [0.0044399, 465500, '465.5K'], [0.0044391, 480300, '480.3K'], [0.0044389, 1190000, '1.19M']] as L[],
  },
  spot: {
    asks: [[1.07837, 2, '2'], [1.07828, 1, '1'], [1.07799, 2, '2'], [1.07797, 159, '159'], [1.07792, 542, '542'], [1.0779, 2, '2']] as L[],
    bids: [[1.07701, 245, '245'], [1.07686, 2, '2'], [1.07672, 245, '245'], [1.07625, 2, '2'], [1.07619, 245, '245'], [1.07571, 245, '245']] as L[],
  },
}

export function OrderBook({ mode, mid, decimals, unit, up }: { mode: 'spot' | 'futures'; mid: number; decimals: number; unit: string; up: boolean }) {
  const [tick, setTick] = useState(0)
  useEffect(() => { const t = setInterval(() => setTick(x => x + 1), 1800); return () => clearInterval(t) }, [])
  const { asks, bids } = BOOKS[mode]
  const maxQ = Math.max(...asks.map(a => a[1]), ...bids.map(b => b[1]))
  // dim layer = cumulative depth measured outward from the spread; bright layer = this level's own size
  const cum = (rows: L[], fromEnd: boolean) => { const r = fromEnd ? [...rows].reverse() : rows; let a = 0; const m = r.map(l => (a += l[1])); return fromEnd ? m.reverse() : m }
  const askCum = cum(asks, true), bidCum = cum(bids, false)
  const maxTotal = Math.max(askCum[0], bidCum[bidCum.length - 1]) // both sides share one scale
  const jitter = (p: number, i: number) => p + (((tick + i) % 3) - 1) * 0 // keep prices exact; qty animates below
  const row = (l: L, side: 'ask' | 'bid', i: number, depth: number) => {
    const bump = ((tick * 7 + i * 13) % 5 === 0) ? 1.04 : 1
    return (
      <div className={`ob-row ${side}`} key={l[0]}>
        <span className="ob-bar" style={{ width: `${depth * 100}%` }} />
        <span className="ob-bar strong" style={{ width: `${Math.min(100, (l[1] * bump / maxQ) * 56)}%` }} />
        <span className="ob-price">{fmtPrice(jitter(l[0], i), decimals)}</span>
        <span className="ob-qty">{l[2]}</span>
      </div>
    )
  }
  return (
    <div className={`ob ${mode}`}>
      <div className="ob-head"><div><b>Price</b><small>USD</small></div><div style={{ textAlign: 'right' }}><b>Quantity</b><small>⇄ {unit}</small></div></div>
      {asks.map((a, i) => row(a, 'ask', i, askCum[i] / maxTotal))}
      <div className={`ob-mid ${up ? 'up' : ''}`}><b>{fmtPrice(mid, decimals)}</b>{mode === 'futures' && <span>{fmtPrice(0.0044413, decimals)}</span>}</div>
      {bids.map((b, i) => row(b, 'bid', i + 6, bidCum[i] / maxTotal))}
      <div className="ob-foot"><span className="ob-step">{mode === 'futures' ? '0.0000001' : '0.00001'}<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="m6 9 6 6 6-6" /></svg></span><span className="ob-mode"><LayoutList size={16} /></span></div>
    </div>
  )
}
