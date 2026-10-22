import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { Expand, Shrink, ChartCandlestick, ChartLine, TrendingUpDown, Eye, EyeOff } from 'lucide-react'
import { Coin } from './Coin'
import { CandleChart, type ChartLine as Line, type Candle } from './CandleChart'

export type ChartOpts = { kind: 'candles' | 'line'; ma: boolean; eye: boolean }

// The chart tools from Backpack's trade screen: expand, chart type, indicators and show/hide positions and orders.
export function ChartToolbar({ opts, set, onExpand, expanded = false }: { opts: ChartOpts; set: (o: ChartOpts) => void; onExpand: () => void; expanded?: boolean }) {
  return (
    <div className="ctools" role="toolbar" aria-label="Chart tools">
      <button className="ct" onClick={onExpand} aria-label={expanded ? 'Exit full screen chart' : 'Full screen chart'}>{expanded ? <Shrink size={16} strokeWidth={2} /> : <Expand size={16} strokeWidth={2} />}</button>
      <button className={`ct${opts.kind === 'line' ? ' on' : ''}`} onClick={() => set({ ...opts, kind: opts.kind === 'candles' ? 'line' : 'candles' })} aria-label={opts.kind === 'candles' ? 'Switch to line chart' : 'Switch to candles'} aria-pressed={opts.kind === 'line'}>
        {opts.kind === 'candles' ? <ChartCandlestick size={16} strokeWidth={2} /> : <ChartLine size={16} strokeWidth={2} />}
      </button>
      <button className={`ct${opts.ma ? ' on' : ''}`} onClick={() => set({ ...opts, ma: !opts.ma })} aria-label="Moving average" aria-pressed={opts.ma}><TrendingUpDown size={16} strokeWidth={2} /></button>
      <button className={`ct${opts.eye ? ' on' : ''}`} onClick={() => set({ ...opts, eye: !opts.eye })} aria-label={opts.eye ? 'Hide positions and orders' : 'Show positions and orders'} aria-pressed={opts.eye}>{opts.eye ? <Eye size={16} strokeWidth={2} /> : <EyeOff size={16} strokeWidth={2} />}</button>
    </div>
  )
}

// Full screen chart: takes the whole phone, with the same tools and timeframes.
export function ChartFull({ unit, sym, candles, last, dec, opts, set, lines, frames, frame, setFrame, onClose }: {
  unit: string; sym: string; candles: Candle[]; last: number; dec: number; opts: ChartOpts; set: (o: ChartOpts) => void; lines: Line[]
  frames: string[]; frame: string; setFrame: (f: string) => void; onClose: () => void
}) {
  const box = useRef<HTMLDivElement>(null)
  const [h, setH] = useState(400)
  const [out, setOut] = useState(false)
  useEffect(() => { const el = box.current; if (!el) return; const ro = new ResizeObserver(() => setH(Math.max(200, Math.floor(el.clientHeight) - 4))); ro.observe(el); return () => ro.disconnect() }, [])
  const host = document.querySelector('.device')
  if (!host) return null
  const leave = () => { setOut(true); setTimeout(onClose, 180) }
  return createPortal(
    <div className={`cfull${out ? ' out' : ''}`} role="dialog" aria-label="Full screen chart">
      <div className="cfull-top">
        <span className="cfull-pair"><Coin sym={unit} size={24} /><b>{sym}</b></span>
        <div className="frames2">{frames.map(f => <button key={f} className={frame === f ? 'on' : ''} onClick={() => setFrame(f)}>{f}</button>)}</div>
      </div>
      <div className="cfull-chart" ref={box}><ChartToolbar opts={opts} set={set} onExpand={leave} expanded /><CandleChart candles={candles} last={last} decimals={dec} axis={64} height={h} kind={opts.kind} ma={opts.ma} lines={opts.eye ? lines : []} /></div>
    </div>,
    host,
  )
}
