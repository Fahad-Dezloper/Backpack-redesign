import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { ChevronDown, PanelBottomClose, PanelBottomOpen, Star, Check, X, Info } from 'lucide-react'
import type { PointerEvent as RPointerEvent } from 'react'
import { Avatar } from '../components/AccountHeader'
import { Coin } from '../components/Coin'
import { CandleChart, type ChartLine } from '../components/CandleChart'
import { ChartToolbar, ChartFull, type ChartOpts } from '../components/ChartTools'
import { BookTrades, SplitIcon } from '../components/SplitView'
import { Orders, Balances, Borrows } from '../components/LowerPanel'
import { PairPicker } from '../components/PairPicker'
import { ClassicPositions, ClassicHistory } from '../components/ClassicPanels'
import { fmtPrice, pairOf, pairLabel } from '../data'
import { useFeed, useMark } from '../useFeed'
import { onEvent, startSim, setActive, useAcct, liqPrice, type Evt } from '../store'
import { haptics } from '../haptics'
import { OrderSheet } from '../components/OrderSheet'
import '../trade.css'

type Mode = 'spot' | 'futures'
type Side = 'buy' | 'sell'
const frames = ['5m', '15m', '1h', '4h', '1D']

// ---------- screen ----------
// Futures only: the redesign covers the perpetuals trade flow, so there is no Spot mode here.
export function TradeScreen({ sym: symF, onSym: setSymF, tabsHidden = false, onToggleTabs = () => {} }: { sym: string; onSym: (s: string) => void; tabsHidden?: boolean; onToggleTabs?: () => void }) {
  const mode: Mode = 'futures'
  const [picker, setPicker] = useState(false)
  const [view, setView] = useState<'Chart' | 'Book' | 'Trades'>('Chart')
  const [split, setSplit] = useState(false) // Book and Trades together
  const [anim, setAnim] = useState(false) // slide animation only when the split icon is tapped
  const [frame, setFrame] = useState('1h')
  const [lower, setLower] = useState<string>('')
  const [ticket, setTicket] = useState<Side | null>(null)
  // one banner at the top, like Backpack's: grey "Placing your order..." that cross-fades into the green (or red) result
  const [toast, setToast] = useState<{ text: string; kind: 'success' | 'error' | 'info'; id: number } | null>(null)
  const [bnOut, setBnOut] = useState(false)
  const show = (e: Evt) => {
    const kind = e.kind ?? 'success'
    setBnOut(false)
    setToast(prev => ({ text: e.text, kind, id: prev && prev.kind === 'info' ? prev.id : Date.now() + Math.random() }))
    if (!e.quiet && kind === 'success') haptics.success()
    if (kind === 'error') haptics.error()
  }
  const [fav, setFav] = useState(false)
  const [copts, setCopts] = useState<ChartOpts>({ kind: 'candles', ma: false, eye: true })
  const [full, setFull] = useState(false)
  useEffect(() => { if (!anim) return; const t = setTimeout(() => setAnim(false), 520); return () => clearTimeout(t) }, [anim, split])
  const paneRef = useRef<HTMLDivElement>(null)
  const lowerRef = useRef<HTMLDivElement>(null)
  const [custom, setCustom] = useState<number | null>(null) // user-dragged pane height; null = fill all free space
  const drag = useRef<{ y: number; h: number; max: number } | null>(null)
  const onDown = (e: RPointerEvent) => {
    const pane = paneRef.current, low = lowerRef.current; if (!pane || !low) return
    drag.current = { y: e.clientY, h: pane.clientHeight, max: Math.max(180, (pane.closest('.screen') as HTMLElement).clientHeight - 150) }
    e.currentTarget.setPointerCapture(e.pointerId); e.preventDefault()
  }
  const onMove = (e: RPointerEvent) => { const d = drag.current; if (d) setCustom(Math.round(Math.max(130, Math.min(d.max, d.h + e.clientY - d.y)))) }
  const onUp = () => { drag.current = null }
  const [paneH, setPaneH] = useState(179)
  // the chart keeps one height on every tab; the lower section scrolls the page instead of resizing it
  const [screenH, setScreenH] = useState(800)
  useEffect(() => {
    const el = document.querySelector('.screen') as HTMLElement | null; if (!el) return
    const ro = new ResizeObserver(() => setScreenH(el.clientHeight)); ro.observe(el); setScreenH(el.clientHeight); return () => ro.disconnect()
  }, [])
  const defH = Math.max(190, Math.min(340, Math.round(screenH * 0.32)))
  useEffect(() => {
    const el = paneRef.current; if (!el) return
    const ro = new ResizeObserver(() => setPaneH(Math.max(110, Math.min(560, Math.floor(el.clientHeight) - 4))))
    ro.observe(el); return () => ro.disconnect()
  }, [])

  const fut = true
  const pair = pairOf(symF)
  const unit = pair.sym, base = pair.price, dec = pair.dec
  const sym = pairLabel(pair, fut)
  const feed = useFeed(unit, base, dec, fut, (fut ? 21 : 7) + frames.indexOf(frame) + unit.length)
  const mid = feed.price
  const mark = useMark(mid, dec)
  const change = pair.change + ((mid - base) / base) * 100
  const acct = useAcct()
  useEffect(() => { setActive(unit); startSim() }, [unit])
  useEffect(() => onEvent(show), []) // eslint-disable-line react-hooks/exhaustive-deps
  const lowerTabs = fut ? ['Positions', 'Open Orders', 'Balances', 'Borrows', 'History'] : ['Balances', 'Orders', 'Borrows', 'History']
  const openCount = acct.pos.length
  const clines: ChartLine[] = [
    ...acct.pos.filter(p => p.sym === unit).flatMap(p => [{ p: p.entry, label: `${p.long ? 'Long' : 'Short'} entry`, color: '#7b7d8e' }, { p: liqPrice(p), label: 'Liq.', color: '#f5a524' }]),
    ...acct.orders.filter(o => o.sym === unit).map(o => ({ p: o.px, label: o.kind === 'stop' ? (o.trig === 'tp' ? 'TP' : 'SL') : `Limit ${o.buy ? 'buy' : 'sell'}`, color: o.trig === 'tp' ? '#0d9f6b' : o.trig === 'sl' ? '#d63f4a' : '#4d94ff', pin: !!o.trig })),
  ]
  const tab = lower && lowerTabs.includes(lower) ? lower : lowerTabs[0]
  useEffect(() => {
    if (!toast) return
    const t1 = setTimeout(() => setBnOut(true), toast.kind === 'info' ? 12000 : 3000)
    const t2 = setTimeout(() => setToast(null), (toast.kind === 'info' ? 12000 : 3000) + 220)
    return () => { clearTimeout(t1); clearTimeout(t2) }
  }, [toast])

  const stats = fut
    ? [['24h Volume', pair.vol], ['Funding · 48m', '−0.0056%'], ['Open interest', '$2.1M']]
    : [['24h High', fmtPrice(base * 1.024, dec)], ['24h Low', fmtPrice(base * 0.973, dec)], ['24h Volume', pair.vol]]

  return (
    <section className="tx">
      <div className="tx-top">
        <div className="mode-seg"><button className="on" aria-current="page">Futures</button></div>
        <Avatar />
      </div>

      <div className="hero">
        <div className="hero-row">
          <button className="hero-pair" onClick={() => setPicker(true)} aria-label="Change market" aria-haspopup="dialog"><Coin sym={unit} size={28} /><b data-sym={unit}>{sym}</b>{fut && <em className="lev blue">{pair.maxLev}x</em>}<ChevronDown size={18} strokeWidth={1.75} /></button>
          <button className={`star ${fav ? 'on' : ''}`} onClick={() => setFav(f => !f)} aria-label="Favourite"><Star size={22} strokeWidth={1.75} fill={fav ? 'currentColor' : 'none'} /></button>
        </div>
        <div className="hero-price">
          <b className={feed.dir > 0 ? 'up' : 'down'}>{fmtPrice(mid, dec)}</b>
          <span className={`chg ${change < 0 ? 'down' : 'up'}`}>{change > 0 ? '+' : ''}{change.toFixed(2)}%</span>
        </div>
        <div className="hero-stats">{stats.map(([k, v]) => <div key={k}><small>{k}</small><b className={k.startsWith('Funding') ? 'warn' : ''}>{v}</b></div>)}</div>
      </div>

      <div className="seg-tabs">
        {(['Chart', 'Book', 'Trades'] as const).map(v => <button key={v} className={split ? (v !== 'Chart' ? 'on' : '') : view === v ? 'on' : ''} onClick={() => { setAnim(false); setView(v); setSplit(false) }}>{v}</button>)}
        {view !== 'Chart' && <button className={`split-btn${split ? ' on' : ''}`} aria-label="Show book and trades together" aria-pressed={split} onClick={() => { setAnim(true); setSplit(s => !s); setView(v => (v === 'Chart' ? 'Book' : v)) }}><SplitIcon /></button>}
        {view === 'Chart' && <div className="frames2">{frames.map(f => <button key={f} className={frame === f ? 'on' : ''} onClick={() => setFrame(f)}>{f}</button>)}</div>}
      </div>

      <div className="view-pane" ref={paneRef} style={{ height: custom ?? defH }}>
        {view === 'Chart' && <><ChartToolbar opts={copts} set={setCopts} onExpand={() => setFull(true)} /><CandleChart candles={feed.candles} last={mid} decimals={dec} axis={64} height={paneH} kind={copts.kind} ma={copts.ma} lines={copts.eye ? clines : []} /></>}
        {view !== 'Chart' && <BookTrades fut={fut} mark={mark} anim={anim} mode={split ? 'split' : view === 'Trades' ? 'trades' : 'book'} bids={feed.bids} asks={feed.asks} tape={feed.tape} mid={mid} dec={dec} dir={feed.dir} />}
        <button className="grip" aria-label="Drag to resize" onPointerDown={onDown} onPointerMove={onMove} onPointerUp={onUp} onPointerCancel={onUp} onDoubleClick={() => setCustom(null)}>
          <svg width="18" height="18" viewBox="0 0 18 18" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ display: 'block' }}><path d="M17 6v11H6" /><path d="M17 12l-5 5" /></svg>
        </button>
      </div>

      <div className="lower" ref={lowerRef}>
        <div className="lower-tabs2">{lowerTabs.map(t => <button key={t} className={tab === t ? 'on' : ''} onClick={() => setLower(t)}>{t}{t === 'Positions' && openCount > 0 ? <em className="cnt">{openCount}</em> : null}{t === 'Open Orders' && acct.orders.filter(o => o.kind === 'limit').length > 0 ? <em className="cnt">{acct.orders.filter(o => o.kind === 'limit').length}</em> : null}</button>)}</div>
        {tab === 'Positions' && <ClassicPositions candles={feed.candles} candleSym={unit} />}
        {tab === 'Open Orders' && <Orders />}
        {tab === 'Borrows' && <Borrows />}
        {tab === 'History' && <ClassicHistory />}
        {tab === 'Balances' && <Balances />}
      </div>

      <div className={`dock${tabsHidden ? ' flush' : ''}`}>
        <div className="dock-body">
          <button className="act buy" onClick={() => setTicket('buy')}>{fut ? 'Long' : 'Buy'}</button>
          <button className="act sell" onClick={() => setTicket('sell')}>{fut ? 'Short' : 'Sell'}</button>
          <button className="dock-handle" aria-label={tabsHidden ? 'Show navigation bar' : 'Hide navigation bar'} aria-expanded={!tabsHidden} onClick={onToggleTabs}>
            {tabsHidden ? <PanelBottomOpen size={22} strokeWidth={1.75} /> : <PanelBottomClose size={22} strokeWidth={1.75} />}
          </button>
        </div>
      </div>

      {ticket && <OrderSheet key={mode + ticket + unit} mode={mode} side={ticket} live={{ mid, mark, bid: feed.bids[0][0], ask: feed.asks[feed.asks.length - 1][0], dir: feed.dir, candles: feed.candles }} pair={pair} onClose={() => setTicket(null)} onPlacing={() => show({ text: 'Placing your order...', kind: 'info' })} onDone={show} />}
      {full && <ChartFull unit={unit} sym={sym} candles={feed.candles} last={mid} dec={dec} opts={copts} set={setCopts} lines={clines} frames={frames} frame={frame} setFrame={setFrame} onClose={() => setFull(false)} />}
      {picker && <PairPicker fut={fut} current={unit} onPick={setSymF} onClose={() => setPicker(false)} />}
      {toast && document.querySelector('.device') && createPortal(
        <div key={toast.id} className={`bn ${toast.kind}${bnOut ? ' out' : ''}`} role="status" onClick={() => setBnOut(true)}>
          <span className="bn-ic">{toast.kind === 'info' ? <Info size={20} strokeWidth={1.6} /> : toast.kind === 'error' ? <X size={20} strokeWidth={2.25} /> : <Check size={22} strokeWidth={2.4} style={{ margin: '0 -1px' }} />}</span>
          <span className="bn-tx">{toast.text}</span>
        </div>, document.querySelector('.device')!)}
    </section>
  )
}
