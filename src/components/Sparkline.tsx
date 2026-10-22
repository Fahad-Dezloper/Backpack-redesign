// width given -> fixed-px svg (with optional end dot); otherwise stretches to its container.
export function Sparkline({ data, up = true, height = 60, fill = true, color, width, dot = false }:
  { data: number[]; up?: boolean; height?: number; fill?: boolean; color?: string; width?: number; dot?: boolean }) {
  const w = width ?? 200, min = Math.min(...data), max = Math.max(...data)
  const pts = data.map((v, i) => [(i / (data.length - 1)) * (w - (dot ? 4 : 0)), height - 4 - ((v - min) / (max - min || 1)) * (height - 12)])
  const line = pts.map(([x, y], i) => `${i ? 'L' : 'M'}${x.toFixed(1)},${y.toFixed(1)}`).join(' ')
  const col = color ?? (up ? 'var(--up)' : 'var(--down)')
  const [lx, ly] = pts[pts.length - 1]
  return (
    <svg viewBox={`0 0 ${w} ${height}`} width={width ?? '100%'} height={height} preserveAspectRatio={width ? 'xMinYMin meet' : 'none'}>
      <defs><linearGradient id={`g${w}${height}`} x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor={col} stopOpacity=".22" /><stop offset="1" stopColor={col} stopOpacity="0" /></linearGradient></defs>
      {fill && <path d={`${line} L${lx},${height} L0,${height} Z`} fill={`url(#g${w}${height})`} />}
      <path d={line} fill="none" stroke={col} strokeWidth="1.5" vectorEffect="non-scaling-stroke" />
      {dot && <circle cx={lx} cy={ly} r="3" fill={col} />}
    </svg>
  )
}
