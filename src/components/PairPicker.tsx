import { useMemo, useState } from 'react'
import { createPortal } from 'react-dom'
import { Search, X } from 'lucide-react'
import { Coin } from './Coin'
import { pairs, pairLabel, fmtPrice } from '../data'
import { useAcct } from '../store'
import { useSheetDrag } from '../useSheetDrag'

// Market picker: search, then one row per market with the live price and the day's move.
export function PairPicker({ fut, current, onPick, onClose }: { fut: boolean; current: string; onPick: (sym: string) => void; onClose: () => void }) {
  const [q, setQ] = useState('')
  const [out, setOut] = useState(false)
  const a = useAcct()
  const list = useMemo(() => pairs.filter(p => (fut ? !p.spotOnly : true) && p.sym.toLowerCase().includes(q.trim().toLowerCase())), [fut, q])
  const host = document.querySelector('.device')
  if (!host) return null
  const leave = (fn: () => void) => { setOut(true); setTimeout(fn, 200) }
  const { bind, sheetStyle } = useSheetDrag(() => leave(onClose))
  return createPortal(
    <div className={`pp-wrap${out ? ' out' : ''}`} onClick={() => leave(onClose)}>
      <div className="pp" style={sheetStyle} onClick={e => e.stopPropagation()} role="dialog" aria-label="Select market">
        <div {...bind} className="sheet-grab-row"><div className="sheet-grab" /></div>
        <div {...bind} className="pp-head"><b>{fut ? 'Perpetuals' : 'Spot markets'}</b><button className="icon-x" onClick={() => leave(onClose)} aria-label="Close"><X size={20} strokeWidth={1.75} /></button></div>
        <label className="pp-search"><Search size={18} strokeWidth={1.75} /><input value={q} onChange={e => setQ(e.target.value)} placeholder="Search markets" aria-label="Search markets" /></label>
        <div className="pp-list">
          {list.map(p => {
            const price = a.prices[p.sym] ?? p.price, chg = p.change + ((price - p.price) / p.price) * 100
            return (
              <button key={p.sym} className={`pp-row${p.sym === current ? ' on' : ''}`} onClick={() => leave(() => onPick(p.sym))}>
                <Coin sym={p.sym} size={32} />
                <span className="pp-n"><b>{pairLabel(p, fut)}</b><small>{fut ? `${p.maxLev}x` : 'Spot'}</small></span>
                <span className="pp-p"><b>{fmtPrice(price, p.dec)}</b><small className={chg >= 0 ? 'up' : 'down'}>{chg >= 0 ? '+' : '−'}{Math.abs(chg).toFixed(2)}%</small></span>
              </button>
            )
          })}
          {!list.length && <div className="pp-empty">No markets match “{q}”</div>}
        </div>
      </div>
    </div>,
    host,
  )
}
