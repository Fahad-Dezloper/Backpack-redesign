import { useState } from 'react'

// Real token art lives in /public/tokens/<SYM>.png. Falls back to a letter disc.
export function Coin({ sym, size = 32 }: { sym: string; size?: number }) {
  const [broken, setBroken] = useState(false)
  if (broken) return <span className="coin-fallback" style={{ width: size, height: size, fontSize: size * 0.45 }}>{sym[0]}</span>
  return <img className="coin" src={`/tokens/${sym}.png`} width={size} height={size} alt={sym} onError={() => setBroken(true)} draggable={false} />
}
