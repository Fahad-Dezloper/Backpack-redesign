import { SlidersHorizontal, CalendarDays, Search } from 'lucide-react'
import { AccountHeader } from '../components/AccountHeader'
import { Sparkline } from '../components/Sparkline'
import { Coin } from '../components/Coin'
import { indices, gainers, losers, series } from '../data'

// 2-row column-flow grid: reorder so items read left-to-right across rows
const rowMajor = <T,>(a: T[]) => { const h = Math.ceil(a.length / 2); return Array.from({ length: h }, (_, i) => [a[i], a[i + h]]).flat().filter(Boolean) as T[] }

function Strip({ title, items }: { title: string; items: { sym: string; change: number }[] }) {
  return (
    <>
      <div className="section-head"><h2>{title}</h2><button className="link">See all</button></div>
      <div className="h-scroll grid-2row">
        {rowMajor(items).map(s => (
          <div className="stock-pill" key={s.sym}>
            <Coin sym={s.sym} size={28} />
            <b>{s.sym}</b>
            <span className={s.change >= 0 ? 'up' : 'down'}>{s.change >= 0 ? '+' : ''}{s.change.toFixed(2)}%</span>
          </div>
        ))}
      </div>
    </>
  )
}

export function StocksScreen() {
  return (
    <section>
      <AccountHeader>
        <button className="icon-btn"><SlidersHorizontal size={26} strokeWidth={1.75} /></button>
        <button className="icon-btn"><CalendarDays size={26} strokeWidth={1.75} /></button>
      </AccountHeader>
      <label className="search"><Search size={22} strokeWidth={1.75} /><input placeholder="Search stocks" /></label>
      <div className="section-head first"><h2>Market overview</h2><span className="premarket"><i />Pre-market</span></div>
      <div className="h-scroll">
        {indices.map((ix, i) => (
          <div className="index-card" key={ix.name}>
            <small>{ix.name}</small>
            <b>${ix.price.toFixed(2)}</b>
            <span className="up">+{ix.change.toFixed(2)}%</span>
            <div className="index-spark"><Sparkline data={series(i + 11, 24, 100, 0.02)} width={44} height={30} dot /></div>
          </div>
        ))}
      </div>
      <div className="section-head"><h2>Watchlist</h2><button className="link">See all</button></div>
      <div className="empty-card">Favorite a stock to add it to your watchlist</div>
      <Strip title="Top Gainers" items={gainers} />
      <Strip title="Top Losers" items={losers} />
    </section>
  )
}
