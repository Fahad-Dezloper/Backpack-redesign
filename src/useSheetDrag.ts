import { useRef, useState } from 'react'
import type { CSSProperties, PointerEvent } from 'react'

// Drag a sheet down by its header to dismiss it. A short drag springs back; a long or fast one calls leave().
// Every bottom sheet in the app uses this, so they all behave the same.
export function useSheetDrag(leave: () => void) {
  const [dy, setDy] = useState(0)
  const [gone, setGone] = useState(false)
  const s = useRef<{ y: number; t: number } | null>(null)
  const bind = {
    onPointerDown: (e: PointerEvent<HTMLElement>) => {
      if ((e.target as HTMLElement).closest('button, input, select, textarea, a')) return
      s.current = { y: e.clientY, t: performance.now() }
      e.currentTarget.setPointerCapture(e.pointerId)
    },
    onPointerMove: (e: PointerEvent<HTMLElement>) => { if (s.current) setDy(Math.max(0, e.clientY - s.current.y)) },
    onPointerUp: (e: PointerEvent<HTMLElement>) => end(e),
    onPointerCancel: (e: PointerEvent<HTMLElement>) => end(e),
    style: { touchAction: 'none', cursor: 'grab' } as CSSProperties,
  }
  function end(e: PointerEvent<HTMLElement>) {
    const st = s.current; s.current = null
    if (!st) return
    const d = Math.max(0, e.clientY - st.y), v = d / Math.max(1, performance.now() - st.t)
    if (d > 110 || (d > 40 && v > 0.6)) { setGone(true); leave() } else setDy(0)
  }
  const sheetStyle: CSSProperties | undefined = gone ? { transform: 'translateY(100%)', transition: 'transform .2s ease-in' } : dy ? { transform: `translateY(${dy}px)`, transition: 'none' } : undefined
  return { bind, sheetStyle }
}
