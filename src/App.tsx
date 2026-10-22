import { useEffect, useState } from 'react'
import { installPressHaptics } from './haptics'
import { TabBar, Tab } from './components/TabBar'
import { HomeScreen } from './screens/Home'
import { TradeScreen } from './screens/Trade'
import { TradeClassic } from './screens/TradeClassic'
import { StocksScreen } from './screens/Stocks'
import { EarnScreen } from './screens/Earn'
import { PortfolioScreen } from './screens/Portfolio'

export default function App() {
  // deep links: #home | #stocks | #portfolio | #trade/spot | #trade/futures/chart
  const [h0, h1, h2] = location.hash.slice(1).split('/')
  useEffect(() => installPressHaptics(), [])
  const [tab, setTab] = useState<Tab>((h0 as Tab) || 'trade')
  const [tradeSym, setTradeSym] = useState('SOL')
  const openMarket = (sym: string) => { setTradeSym(sym); setTab('trade') }
  const untouched = tab === 'stocks' || tab === 'earn' || tab === 'portfolio' // not part of this redesign
  // the bottom tab bar can be tucked away on the Trade screen for extra room
  const [tabsOff, setTabsOff] = useState(() => { try { return localStorage.getItem('tx-tabs') === 'off' } catch { return false } })
  const toggleTabs = () => setTabsOff(v => { const n = !v; try { localStorage.setItem('tx-tabs', n ? 'off' : 'on') } catch { /* private mode */ } return n })
  const hideTabs = tabsOff && tab === 'trade'
  return (
    <div className="device">
      <main className={`screen${tab === 'trade' ? ' fit' : ''}`}>
        {tab === 'home' && <HomeScreen onOpen={openMarket} />}
        {(h0 as string) === 'classic' && <TradeClassic initialMode={h1 === 'spot' ? 'spot' : 'futures'} initialView={h2 === 'chart' ? 'chart' : 'book'} />}
        {tab === 'trade' && (h0 as string) !== 'classic' &&<TradeScreen sym={tradeSym} onSym={setTradeSym} tabsHidden={hideTabs} onToggleTabs={toggleTabs} />}
        {tab === 'stocks' && <StocksScreen />}
        {tab === 'earn' && <EarnScreen />}
        {tab === 'portfolio' && <PortfolioScreen />}
      </main>
      {untouched && <div className="untouched" role="note">Original Backpack screen · not part of this redesign</div>}
      <TabBar tab={tab} onChange={setTab} hidden={hideTabs} />
    </div>
  )
}
