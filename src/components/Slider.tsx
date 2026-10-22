// 5-stop order-size slider (0/25/50/75/100), matches the original's dotted track.
export function Slider({ value, onChange }: { value: number; onChange: (v: number) => void }) {
  return (
    <div className="slider">
      <div className="slider-track" />
      {[0, 25, 50, 75, 100].map(s => <i key={s} className={`slider-dot ${value >= s ? 'on' : ''}`} style={{ left: `${s}%` }} />)}
      <span className="slider-thumb" style={{ left: `${value}%` }} />
      <input type="range" min={0} max={100} step={25} value={value} onChange={e => onChange(+e.target.value)} />
    </div>
  )
}
