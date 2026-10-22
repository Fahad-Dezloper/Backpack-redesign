import type { Lvl, Tape } from '../useFeed'
import { memo, useEffect, useRef, useState } from 'react'
import { ArrowUp } from 'lucide-react'
import { fmtPrice, fmtQty } from '../data'

// Book and Trades share one row. Every book level is one element that moves between two layouts, so in
// book -> split the numbers you were reading travel to their new place instead of being swapped:
//   wide:    bids left / asks right, best price at the top of each column
//   stacked: asks above, bids below, best prices meeting in the middle
// Trades are a separate column that slides in from the right (push) and out again.
// a trade never changes once printed, so rows are memoised and only the new one renders
const TapeRow = memo(function TapeRow({ t, dec }: { t: Tape; dec: number }) {
  return <div className="tc-row"><b className={t.up ? 'up' : 'down'}>{fmtPrice(t.p, dec)}</b><span>{fmtQty(t.q)}</span><span>{t.t}</span></div>
})

export type BTMode = 'book' | 'trades' | 'split'
const GAP = 14, SPLIT_L = 1.08, INS = 4 // INS: text inset inside a level // split widths: book 1.08 : trades 1

export function BookTrades({ anim, mode, bids, asks, tape, mid, mark, dec, dir, fut }: { fut: boolean; mark: number; anim: boolean; mode: BTMode; bids: Lvl[]; asks: Lvl[]; tape: Tape[]; mid: number; dec: number; dir: 1 | -1 }) {
  const root = useRef<HTMLDivElement>(null)
  const list = useRef<HTMLDivElement>(null)
  const [dim, setDim] = useState({ W: 368, H: 256 })
  const [showTop, setShowTop] = useState(false)
  useEffect(() => {
    const el = root.current; if (!el) return
    const ro = new ResizeObserver(() => setDim({ W: el.clientWidth, H: el.clientHeight }))
    ro.observe(el); return () => ro.disconnect()
  }, [])
  const { W, H } = dim
  const Wb = Math.round(((W - GAP) * SPLIT_L) / (SPLIT_L + 1)), Wt = W - GAP - Wb
  const FOOT_W = 38, FOOT_S = 20 // footer height: ratio + spread when wide, ratio only when split
  const Rs = Math.max(3, Math.min(8, Math.floor((H - 22 - 30 - FOOT_S) / 2 / 20)))
  const Rw = Math.max(Rs, Math.min(10, Math.floor((H - 24 - FOOT_W) / 26)))
  const bid = bids.slice(0, Rw), ask = asks.slice().reverse().slice(0, Rw) // both best-first
  const max = Math.max(...bid.map(x => x[1]), ...ask.map(x => x[1]))
  const wide = mode === 'book'
  const bidTotal = bids.reduce((a, x) => a + x[1], 0), askTotal = asks.reduce((a, x) => a + x[1], 0)
  const bidPct = Math.round((bidTotal / (bidTotal + askTotal)) * 100)

  const wcell = (W - 4) / 2, wrh = (H - 24 - FOOT_W) / Rw
  const srh = (H - 22 - 30 - FOOT_S) / (2 * Rs)
  const cell = (side: 'a' | 'b', i: number) => {
    if (wide) return { x: side === 'b' ? 0 : wcell + 4, y: 24 + i * wrh, w: wcell, h: wrh, o: 1 }
    const on = i < Rs
    const y = side === 'a' ? (on ? 22 + (Rs - 1 - i) * srh : 22 + Rs * srh - srh) : (on ? 22 + Rs * srh + 30 + i * srh : 22 + Rs * srh + 30)
    return { x: 0, y, w: Wb, h: srh, o: on ? 1 : 0 }
  }
  // a label is positioned by its left edge; right-aligned ones are shifted back by their own width
  const at = (px: number, right: boolean): React.CSSProperties => ({ left: px, transform: `translateX(${right ? '-100%' : '0'})` })
  const level = (l: Lvl, side: 'a' | 'b', i: number) => {
    const c = cell(side, i)
    const priceRight = wide && side === 'b', sizeLeft = wide && side === 'b'
    return (
      <div key={side + i} className={`lv ${side === 'a' ? 'ask' : 'bid'}`} style={{ transform: `translate(${c.x}px, ${c.y}px)`, width: c.w, height: c.h, opacity: c.o }}>
        <i style={{ width: c.w, transform: `scaleX(${l[1] / max})`, transformOrigin: wide && side === 'a' ? 'left' : 'right' }} />
        <b style={priceRight ? at(c.w - INS, true) : at(INS, false)}>{fmtPrice(l[0], dec)}</b>
        <span style={sizeLeft ? at(INS, false) : at(c.w - INS, true)}>{l[2]}</span>
      </div>
    )
  }
  const onScroll = () => setShowTop((list.current?.scrollTop ?? 0) > 60)
  const tw = mode === 'trades' ? W : Wt

  return (
    <div ref={root} className={`bt ${mode}${anim ? ' anim' : ''}`}>
      <div className="bt-book" style={{ width: wide ? W : Wb, transform: `translateX(${mode === 'trades' ? -(Wb + 24) : 0}px)` }}>
        <div className="hd" style={{ opacity: wide ? 1 : 0, height: 24 }}>
          <span style={at(INS, false)}>Size</span><span style={at(wcell - INS, true)}>Bid</span><span style={at(wcell + 4 + INS, false)}>Ask</span><span style={at(W - INS, true)}>Size</span>
        </div>
        <div className="hd" style={{ opacity: wide ? 0 : 1, height: 22 }}><span style={at(INS, false)}>Price</span><span style={at(Wb - INS, true)}>Size</span></div>
        {bid.map((l, i) => level(l, 'b', i))}
        {ask.map((l, i) => level(l, 'a', i))}
        <div className={`mid ${dir > 0 ? 'up' : 'down'}`} style={{ opacity: wide ? 0 : 1, transform: `translateY(${22 + Rs * srh}px)`, width: Wb }}>{fmtPrice(mid, dec)}{fut && <em>{fmtPrice(mark, dec)}</em>}</div>
        <div className="foot" style={{ transform: `translateY(${H - (wide ? FOOT_W : FOOT_S)}px)`, width: wide ? W : Wb }}>
          <div className="ratio"><span className="up">{bidPct}%</span><div><i style={{ transform: `scaleX(${bidPct / 100})` }} /></div><span className="down">{100 - bidPct}%</span></div>
          <div className="spr" style={{ opacity: wide ? 1 : 0 }}><b className={dir > 0 ? 'up' : 'down'}>{fmtPrice(mid, dec)}</b>{fut && <em>{fmtPrice(mark, dec)}</em>}</div>
        </div>
      </div>
      <div className="bt-trades" style={{ width: tw, transform: `translateX(${mode === 'book' ? Wt + 24 : 0}px)` }}>
        <div className="tape-c">
          <div className="tc-head"><span>Price</span><span>Size</span><span>Time</span></div>
          <div className="tc-rows" ref={list} onScroll={onScroll}>
            {tape.map(t => <TapeRow key={t.id} t={t} dec={dec} />)}
          </div>
          <button className={`to-top${showTop ? ' show' : ''}`} aria-label="Back to latest trades" tabIndex={showTop ? 0 : -1} onClick={() => list.current?.scrollTo({ top: 0, behavior: 'smooth' })}><ArrowUp size={16} strokeWidth={2.25} /></button>
        </div>
      </div>
    </div>
  )
}

// Toggle icon: two-pane frame. Left = book (red asks over green bids), right = trades (green, green, red, green).
// The frame is a fixed muted grey in both states so the chip highlight is the only active cue.
export const SplitIcon = () => {
  const L = (x: number, y: number, w: number, c: string) => <rect key={y} x={11.5 - w} y={y} width={w} height="1.6" rx=".8" fill={c} />
  return (
    <svg width="31" height="22" viewBox="0 0 28 20" fill="none" aria-hidden="true" style={{ display: 'block' }}>
      <rect x=".6" y=".6" width="26.8" height="18.8" rx="4.6" stroke="var(--label)" strokeOpacity=".65" strokeWidth="1.2" />
      <path d="M14 .6v18.8" stroke="var(--label)" strokeOpacity=".65" strokeWidth="1.2" />
      {L(0, 3, 5, 'var(--down)')}{L(0, 5.5, 7, 'var(--down)')}{L(0, 8, 4, 'var(--down)')}
      {L(0, 10.4, 4.5, 'var(--up)')}{L(0, 12.9, 7, 'var(--up)')}{L(0, 15.4, 5.5, 'var(--up)')}
      <rect x="16.5" y="3.4" width="8" height="1.6" rx=".8" fill="var(--up)" /><rect x="16.5" y="7.4" width="8" height="1.6" rx=".8" fill="var(--up)" />
      <rect x="16.5" y="11.4" width="8" height="1.6" rx=".8" fill="var(--down)" /><rect x="16.5" y="15.4" width="8" height="1.6" rx=".8" fill="var(--up)" />
    </svg>
  )
}
