import type { Lvl } from '../useFeed'
import { fmtPrice } from '../data'

// Side-by-side book: bids left, asks right, best prices meet in the middle. Half the height of a stacked book.
export function DepthBook({ bids: allBids, asks: allAsks, mid, decimals, rows }: { bids: Lvl[]; asks: Lvl[]; mid: number; decimals: number; rows: number }) {
  const bids = allBids.slice(0, rows), asks = allAsks.slice(allAsks.length - rows)
  const bestAsk = asks[asks.length - 1], bestBid = bids[0]
  const max = Math.max(...asks.map(a => a[1]), ...bids.map(b => b[1]))
  const bidTotal = bids.reduce((s, b) => s + b[1], 0), askTotal = asks.reduce((s, a) => s + a[1], 0)
  const bidPct = Math.round((bidTotal / (bidTotal + askTotal)) * 100)
  const spread = ((bestAsk[0] - bestBid[0]) / mid) * 100
  return (
    <div className="depth">
      <div className="depth-cols"><div><span>Size</span><span>Bid</span></div><div><span>Ask</span><span>Size</span></div></div>
      <div className="depth-rows">
      {Array.from({ length: rows }, (_, i) => {
        const b = bids[i], a = asks[asks.length - 1 - i]
        return (
          <div className="depth-row" key={i}>
            <div className="dcell bid">
              <i style={{ transform: `scaleX(${b[1] / max})` }} /><span>{b[2]}</span><b>{fmtPrice(b[0], decimals)}</b>
            </div>
            <div className="dcell ask">
              <i style={{ transform: `scaleX(${a[1] / max})` }} /><b>{fmtPrice(a[0], decimals)}</b><span>{a[2]}</span>
            </div>
          </div>
        )
      })}
      </div>
      <div className="depth-ratio" aria-label={`${bidPct}% bids`}>
        <span className="up">{bidPct}%</span>
        <div><i style={{ transform: `scaleX(${bidPct / 100})` }} /></div>
        <span className="down">{100 - bidPct}%</span>
      </div>
      <div className="depth-spread">Spread {spread.toFixed(3)}%</div>
    </div>
  )
}
