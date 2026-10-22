import { House, Repeat, Globe, Percent, ChartPie } from 'lucide-react'

// active Portfolio icon: outlined arc + solid slice (lucide's chart-pie, slice filled only)
const PieActive = () => (
  <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
    <path d="M21 12c.552 0 1.005-.449.95-.998a10 10 0 0 0-8.953-8.951c-.55-.055-.998.398-.998.95v8a1 1 0 0 0 1 1z" fill="currentColor" />
    <path d="M21.21 15.89A10 10 0 1 1 8 2.83" />
  </svg>
)

export type Tab = 'home' | 'trade' | 'stocks' | 'earn' | 'portfolio'
const items: { id: Tab; label: string; Icon: typeof House }[] = [
  { id: 'home', label: 'Home', Icon: House }, { id: 'trade', label: 'Trade', Icon: Repeat },
  { id: 'stocks', label: 'Stocks', Icon: Globe }, { id: 'earn', label: 'Earn', Icon: Percent },
  { id: 'portfolio', label: 'Portfolio', Icon: ChartPie },
]
export function TabBar({ tab, onChange, hidden = false }: { tab: Tab; onChange: (t: Tab) => void; hidden?: boolean }) {
  return (
    <nav className={`tabbar${hidden ? ' hidden' : ''}`} aria-hidden={hidden}>
      {items.map(({ id, label, Icon }) => (
        <button key={id} className={tab === id ? 'active' : ''} onClick={() => onChange(id)}>
          {tab === id && id === 'portfolio' ? <PieActive /> : <Icon size={26} strokeWidth={1.75} fill={tab === id && id === 'home' ? 'currentColor' : 'none'} />}
          <span>{label}</span>
        </button>
      ))}
    </nav>
  )
}
