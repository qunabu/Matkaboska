// Tiny Web Audio "chime" for new notifications — no audio asset, and respects a
// user mute preference. The AudioContext is created lazily and resumed on demand
// (browsers require a prior user gesture, which the app always has by then).
let ctx: AudioContext | null = null

const KEY = 'mbl-sound'
export function soundEnabled(): boolean {
  try { return localStorage.getItem(KEY) !== 'off' } catch { return true }
}
export function setSoundEnabled(on: boolean) {
  try { localStorage.setItem(KEY, on ? 'on' : 'off') } catch { /* ignore */ }
}

export function playChime() {
  if (!soundEnabled()) return
  try {
    const AC = window.AudioContext || (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext
    if (!AC) return
    if (!ctx) ctx = new AC()
    if (ctx.state === 'suspended') void ctx.resume()
    const now = ctx.currentTime
    // A5 → D6, soft sine tones with a quick decay.
    const notes: Array<[number, number]> = [[880, 0], [1174.66, 0.11]]
    for (const [freq, offset] of notes) {
      const osc = ctx.createOscillator()
      const gain = ctx.createGain()
      osc.type = 'sine'
      osc.frequency.value = freq
      osc.connect(gain)
      gain.connect(ctx.destination)
      const start = now + offset
      gain.gain.setValueAtTime(0.0001, start)
      gain.gain.linearRampToValueAtTime(0.16, start + 0.02)
      gain.gain.exponentialRampToValueAtTime(0.0001, start + 0.34)
      osc.start(start)
      osc.stop(start + 0.4)
    }
  } catch { /* audio best-effort */ }
}
