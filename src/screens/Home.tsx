import { useState } from 'react'
import { Gift, Search, Bell } from 'lucide-react'
import { AccountHeader } from '../components/AccountHeader'
import { Coin } from '../components/Coin'
import { markets, fmtPrice } from '../data'

export function HomeScreen({ onOpen }: { onOpen: (sym: string) => void }) {
  const [filter, setFilter] = useState<'All' | 'Crypto' | 'TradFi'>('All')
  const list = markets.filter(m => filter === 'All' || (filter === 'TradFi' ? m.sym === 'MU' : m.sym !== 'MU'))
  return (
    <section>
      <AccountHeader>
        <button className="icon-btn" style={{ color: 'var(--up)' }}><Gift size={26} strokeWidth={1.75} /></button>
        <button className="icon-btn"><Search size={26} strokeWidth={1.75} /></button>
        <button className="icon-btn badge-wrap"><Bell size={26} strokeWidth={1.75} /><i className="badge">1</i></button>
      </AccountHeader>
      <div className="chips">
        {(['All', 'Crypto', 'TradFi'] as const).map(c => (
          <button key={c} className={`chip ${filter === c ? 'on' : ''}`} onClick={() => setFilter(c)}>{c}</button>
        ))}
      </div>
      <div className="table-head"><span>Markets</span><span>Price</span><span>Change</span></div>
      {list.map(m => (
        <button className="market-row" key={m.sym} onClick={() => onOpen(m.sym)} aria-label={`Trade ${m.sym}-PERP`}>
          <Coin sym={m.sym} size={32} />
          <div className="market-name">
            <b>{m.sym}-PERP <em className="lev">{m.lev}x</em></b>
            <small>Vol: {m.vol}</small>
          </div>
          <div className="market-price">${fmtPrice(m.price, m.decimals)}</div>
          <div className={`pill ${m.change >= 0 ? 'up' : 'down'}`}>{m.change >= 0 ? '' : '-'}{Math.abs(m.change).toFixed(2)}%</div>
        </button>
      ))}
    </section>
  )
}
