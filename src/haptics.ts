// Haptics and sound, modelled on what the Backpack app does (measured from the phone's vibrator log while using the real app):
//   - every button / toggle / tab press: one short vibration, about 67 ms
//   - order placed / filled / position closed: that press, then a success pulse of about 197 ms
//   - cancel: the press only
// Sounds are short synthesized blips in the same notes as the app's own UI sounds (success: 557 Hz then 780 Hz; error: low 196 Hz).
let ctx: AudioContext | null = null
let idle: number | undefined
const soundOn = () => { try { return localStorage.getItem('tx-sound') !== 'off' } catch { return true } }
const canVibrate = () => typeof navigator !== 'undefined' && typeof navigator.vibrate === 'function'

function blip(freq: number, at: number, len = 0.09, gain = 0.11, type: OscillatorType = 'sine') {
  if (!ctx) return
  const t0 = ctx.currentTime + at, o = ctx.createOscillator(), g = ctx.createGain()
  o.type = type; o.frequency.value = freq
  g.gain.setValueAtTime(0.0001, t0); g.gain.exponentialRampToValueAtTime(gain, t0 + 0.008); g.gain.exponentialRampToValueAtTime(0.0001, t0 + len)
  o.connect(g).connect(ctx.destination); o.start(t0); o.stop(t0 + len + 0.02)
}
function audio(): boolean {
  if (!soundOn()) return false
  try {
    ctx = ctx ?? new (window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext)()
    if (ctx.state === 'suspended') void ctx.resume()
    window.clearTimeout(idle); idle = window.setTimeout(() => { void ctx?.suspend() }, 1800) // release the audio output when quiet
    return true
  } catch { return false }
}

export const haptics = {
  tap() { if (canVibrate()) navigator.vibrate(67) },
  success() { if (canVibrate()) navigator.vibrate([46, 54, 97]); if (audio()) { blip(557, 0, 0.1); blip(780, 0.09, 0.14) } },
  error() { if (canVibrate()) navigator.vibrate([70, 50, 70]); if (audio()) { blip(196, 0, 0.12, 0.14, 'triangle'); blip(196, 0.13, 0.12, 0.14, 'triangle') } },
}

// one listener gives every button the press haptic, as in the real app; sliders, drag handles and disabled buttons stay quiet
export function installPressHaptics(): () => void {
  const on = (e: PointerEvent) => {
    const b = (e.target as HTMLElement | null)?.closest?.('button') as HTMLButtonElement | null
    if (!b || b.disabled || b.closest('[data-nohaptic], .grip')) return
    haptics.tap()
  }
  document.addEventListener('pointerdown', on, { passive: true })
  return () => document.removeEventListener('pointerdown', on)
}
