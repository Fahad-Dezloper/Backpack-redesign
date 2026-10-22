import { useState } from 'react'
import { ChevronDown, Newspaper, ChartCandlestick, Star } from 'lucide-react'
import { Avatar } from '../components/AccountHeader'
import { Coin } from '../components/Coin'
import { CandleChart } from '../components/CandleChart'
import { OrderBook } from '../components/OrderBook'
import { Slider } from '../components/Slider'
import { fmtPrice } from '../data'

type Mode = 'spot' | 'futures'
const frames = ['1m', '5m', '15m', '30m', '1h', '2h', '4h', '6h', '1D', '3D', '1W', '1M']
const lowerTabs = ['Balances', 'Positions', 'Open Orders', 'Borrows']

// first toggle icon in the original: a chart-in-frame with a caret
const ChartFrame = () => (
  <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
    <path d="M10 20H6a3 3 0 0 1-3-3V7a3 3 0 0 1 3-3h12a3 3 0 0 1 3 3v3" /><path d="m7 13 3-3 2.5 2L16 8" /><path d="m15 21 3-3 3 3" />
  </svg>
)
const Ring = ({ label, value }: { label: string; value: string }) =>
  <span className="ring-stat"><i className="ring" /><span><small>{label}</small><b className="up">{value}</b></span></span>

export function TradeClassic({ initialMode = 'futures', initialView = 'book' }: { initialMode?: Mode; initialView?: 'book' | 'chart' }) {
  const [mode, setMode] = useState<Mode>(initialMode)
  const [chart, setChart] = useState(initialView === 'chart')
  const [side, setSide] = useState<'a' | 'b'>(initialMode === 'futures' ? 'b' : 'a') // a=Buy/Long, b=Sell/Short
  const [type, setType] = useState(initialMode === 'futures' ? 'Market' : 'Limit')
  const [qty, setQty] = useState(initialMode === 'futures' ? '0' : '')
  const [pct, setPct] = useState(0)
  const [frame, setFrame] = useState('1h')
  const [lower, setLower] = useState('Balances')
  const [opts, setOpts] = useState<Record<string, boolean>>({})

  const fut = mode === 'futures'
  const sym = fut ? 'PUMP-PERP' : 'BP/USD'
  const unit = fut ? 'PUMP' : 'BP'
  const mid = fut ? 0.0044407 : 1.07705
  const dec = fut ? 7 : 5
  const buy = side === 'a'
  const sideLabels = fut ? ['Long', 'Short'] : ['Buy', 'Sell']
  const verb = sideLabels[buy ? 0 : 1]
  const toggles = fut ? ['Reduce Only', 'TP/SL'] : ['Post Only', 'IOC', 'Margin']
  const flip = (m: Mode) => { setMode(m); setSide(m === 'futures' ? 'b' : 'a'); setType(m === 'futures' ? 'Market' : 'Limit'); setQty(m === 'futures' ? '0' : '') }

  return (
    <section>
      <div className="trade-top">
        <div className="mode-tabs">
          {(['spot', 'futures'] as const).map(m => (
            <button key={m} className={mode === m ? 'on' : ''} onClick={() => flip(m)}>{m === 'spot' ? 'Spot' : 'Futures'}</button>
          ))}
        </div>
        <Avatar />
      </div>

      <div className="pair-row">
        <button className="pair">
          <Coin sym={fut ? 'PUMP' : 'BP'} size={20} />
          <b>{sym}</b>{fut && <em className="lev blue">5x</em>}<ChevronDown size={20} strokeWidth={1.75} />
        </button>
        <div className="view-toggle">
          <div className="vt-group">
            <button className="vt"><ChartFrame /></button><i className="vt-div" />
            <button className="vt on"><Newspaper size={22} strokeWidth={1.75} /></button>
          </div>
          <button className={`vt ${chart ? 'on' : ''}`} onClick={() => setChart(c => !c)}><ChartCandlestick size={22} strokeWidth={1.75} /></button>
        </div>
      </div>

      {chart && (
        <div className="chart-block">
          <div className="frames">{frames.map(f => <button key={f} className={frame === f ? 'on' : ''} onClick={() => setFrame(f)}>{f}</button>)}</div>
          <div className="chart-wrap">
            <div className="chart-ohlc down">{fmtPrice(mid, dec)}&nbsp; -0.00087 (-0.08%)</div>
            <CandleChart seed={fut ? 21 : 7} last={mid} decimals={dec} />
          </div>
        </div>
      )}

      <div className="trade-stats">
        <div className="stats-left">
          <button className="acct-pill"><small>Account</small><b>5x <ChevronDown size={11} strokeWidth={2.5} /></b></button>
          <div className="risk"><Ring label="IMR" value="0%" /><Ring label="MMR" value="0%" /></div>
        </div>
        {fut
          ? <div className="funding">Funding / Countdown<br /><span><b className="warn">-0.0056%</b> / 00:48:03</span></div>
          : <div className="funding vol"><span>24h Vol<br /><b>985.69K</b></span><Star size={26} strokeWidth={1.75} /></div>}
      </div>

      <div className="trade-grid">
        <div className="form">
          <div className="kv avail"><span>{fut ? 'Available Equity' : 'Available'}</span><b>{fut ? '$3.06' : '3.05543 USD'}</b></div>
          <div className="side-seg">
            <button className={buy ? (fut ? 'long' : 'buy') : ''} onClick={() => setSide('a')}>{sideLabels[0]}</button>
            <button className={!buy ? (fut ? 'short' : 'sell') : ''} onClick={() => setSide('b')}>{sideLabels[1]}</button>
          </div>
          <label className="field select">
            <select value={type} onChange={e => setType(e.target.value)}><option>Market</option><option>Limit</option></select>
            <ChevronDown size={20} strokeWidth={1.75} />
          </label>
          {type === 'Limit' && <div className="field two"><small>Limit Price</small><div className="field-row"><input defaultValue={fmtPrice(mid, dec)} inputMode="decimal" /><span>BBO</span></div></div>}
          <div className={`field two ${qty ? '' : 'empty'}`}>
            {qty ? <small>Quantity</small> : null}
            <div className="field-row"><input placeholder="Quantity" value={qty} inputMode="decimal" onChange={e => setQty(e.target.value.replace(/[^0-9.]/g, ''))} /><span>⇄ {unit}</span></div>
          </div>
          <div className="approx">≈ {(Number(qty || 0) * mid).toFixed(2)} USD</div>
          <Slider value={pct} onChange={setPct} />
          <div className="checks">
            {toggles.map(t => (
              <label key={t}><input type="checkbox" checked={!!opts[t]} onChange={() => setOpts({ ...opts, [t]: !opts[t] })} /><i />{t}</label>
            ))}
          </div>
          {fut && <div className="meta"><div className="kv"><span>Max Slippage</span><b className="blue">1%</b></div><div className="kv"><span>Margin req.</span><b>$0.00</b></div><div className="kv"><span>Est. Liq. Price</span><b>-</b></div></div>}
          <button className={`cta ${buy ? 'up' : 'down'}`}>{verb} {fut ? sym : unit}</button>
        </div>
        <OrderBook mode={mode} mid={mid} decimals={dec} unit={unit} up={fut} />
      </div>

      <div className="lower-tabs">{lowerTabs.map(t => <button key={t} className={lower === t ? 'on' : ''} onClick={() => setLower(t)}>{t}</button>)}</div>
      {lower === 'Balances'
        ? <div className="bal-card">
            <div className="bal-top"><span className="usd"><Coin sym="USD" size={24} />USD</span><span className="right"><small>Value</small><b>$3.06</b></span></div>
            <div className="bal-cols"><div><small>Total</small><b>3.0554323</b></div><div><small>Available</small><b>0</b></div><div className="right"><small>Lend &amp; Borrow</small><b className="up">3.0554323</b></div></div>
          </div>
        : <div className="empty-card">No {lower.toLowerCase()}</div>}
    </section>
  )
}
