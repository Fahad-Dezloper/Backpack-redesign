import { useState } from 'react'
import { ChartNoAxesColumn, History, EllipsisVertical, Plus, Minus, ArrowDownToLine, ArrowUpFromLine, ChevronRight, Sparkles, ArrowDownUp } from 'lucide-react'
import { AccountHeader } from '../components/AccountHeader'
import { Coin } from '../components/Coin'
import { Sparkline } from '../components/Sparkline'
import { portfolio as p, series } from '../data'

const ranges = ['1H', '1D', '1W', '1M', '6M']
export function PortfolioScreen() {
  const [range, setRange] = useState('1W')
  const [filter, setFilter] = useState('All')
  return (
    <section>
      <AccountHeader>
        <button className="icon-btn"><ChartNoAxesColumn size={26} strokeWidth={1.75} /></button>
        <button className="icon-btn"><History size={26} strokeWidth={1.75} /></button>
        <button className="icon-btn"><EllipsisVertical size={26} strokeWidth={1.75} fill="currentColor" /></button>
      </AccountHeader>
      <div className="balance">
        <small>Total Balance</small>
        <div className="balance-row">
          <h2>${p.total.toFixed(2)}</h2>
          <span className="delta"><ArrowDownUp size={16} strokeWidth={2} /> ${p.delta.toFixed(5)} +{p.deltaPct.toFixed(2)}%</span>
        </div>
      </div>
      <div className="stats">
        <div className="ring" /><div><small>MMR</small><b>{p.mmr}%</b></div>
        <div><small>Net Equity</small><b>${p.netEquity.toFixed(2)}</b></div>
        <div><small>Open PnL</small><b>${p.openPnl.toFixed(2)}</b></div>
        <div><small>Borrow Lend APY</small><b className="up">{p.apy}%</b></div>
      </div>
      <div className="big-chart"><Sparkline data={[...series(5 + ranges.indexOf(range), 80, 100, 0.016), 130]} color="var(--accent)" height={127} /></div>
      <div className="seg-row">
        {ranges.map(r => <button key={r} className={`seg ${range === r ? 'on' : ''}`} onClick={() => setRange(r)}>{r}</button>)}
      </div>
      <div className="actions">
        {[['Buy', Plus], ['Sell', Minus], ['Deposit', ArrowDownToLine], ['Withdraw', ArrowUpFromLine]].map(([l, I]) => {
          const Icon = I as typeof Plus
          return <button key={l as string} className="action"><Icon size={24} strokeWidth={1.75} color="var(--accent)" /><span>{l as string}</span></button>
        })}
      </div>
      <div className="promo">
        <Coin sym="BP" size={36} />
        <div><b>BP Staking</b><p>Unlock lower fee tiers and exclusive benefits by staking BP.</p></div>
        <ChevronRight size={22} strokeWidth={1.75} color="var(--text-dim)" />
      </div>
      <div className="chips flat">
        {['All', 'Crypto', 'Stocks'].map(c => <button key={c} className={`chip ${filter === c ? 'on' : ''}`} onClick={() => setFilter(c)}>{c}</button>)}
      </div>
      {p.assets.map(a => (
        <div className="asset-row" key={a.sym}>
          <Coin sym={a.token} size={32} />
          <div><b>{a.sym} <em className="apy">{a.apy}% APY</em></b><small>{a.amount}</small></div>
          <b className="asset-val">${a.value.toFixed(2)}</b>
        </div>
      ))}
      <div className="dust"><Sparkles size={20} strokeWidth={1.75} /><span>Dust</span><b>${p.dust.toFixed(2)}</b></div>
    </section>
  )
}
