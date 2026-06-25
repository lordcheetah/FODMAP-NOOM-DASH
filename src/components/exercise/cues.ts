/**
 * Opt-in audio + haptic cues for the routine player. ALL of this is best-effort
 * and degrades silently: browsers block `AudioContext` and `navigator.vibrate`
 * outside a user gesture (and iOS has no vibration), so the controller MUST be
 * created/`unlock()`ed from within the Start tap. The routine works fully muted.
 */

type AnyWindow = Window & {
  webkitAudioContext?: typeof AudioContext
}

export class CueController {
  private ctx: AudioContext | null = null
  private enabled = false

  /** Whether cues are currently on. */
  get isEnabled(): boolean {
    return this.enabled
  }

  /**
   * Initialize/resume audio from within a user gesture. Safe to call repeatedly.
   * Returns true if audio is usable afterwards.
   */
  unlock(): boolean {
    this.enabled = true
    try {
      if (!this.ctx) {
        const Ctor =
          window.AudioContext || (window as AnyWindow).webkitAudioContext
        if (Ctor) this.ctx = new Ctor()
      }
      if (this.ctx && this.ctx.state === 'suspended') void this.ctx.resume()
      return this.ctx != null
    } catch {
      return false
    }
  }

  setEnabled(on: boolean): void {
    this.enabled = on
    if (on) this.unlock()
  }

  /** Short beep. `kind` tweaks pitch/length for start vs. countdown ticks. */
  beep(kind: 'tick' | 'go' | 'done' = 'go'): void {
    if (!this.enabled || !this.ctx) return
    try {
      const ctx = this.ctx
      const osc = ctx.createOscillator()
      const gain = ctx.createGain()
      const freq = kind === 'tick' ? 660 : kind === 'done' ? 520 : 880
      const dur = kind === 'tick' ? 0.09 : 0.16
      osc.frequency.value = freq
      osc.type = 'sine'
      gain.gain.setValueAtTime(0.0001, ctx.currentTime)
      gain.gain.exponentialRampToValueAtTime(0.25, ctx.currentTime + 0.01)
      gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + dur)
      osc.connect(gain).connect(ctx.destination)
      osc.start()
      osc.stop(ctx.currentTime + dur + 0.02)
    } catch {
      /* ignore */
    }
  }

  /** Vibrate (phones only); silently ignored where unsupported. */
  vibrate(pattern: number | number[]): void {
    if (!this.enabled) return
    try {
      if (typeof navigator !== 'undefined' && 'vibrate' in navigator) {
        navigator.vibrate(pattern)
      }
    } catch {
      /* ignore */
    }
  }

  /** Cue fired when a step changes. */
  stepChange(): void {
    this.beep('go')
    this.vibrate(120)
  }

  /** Cue for one of the final countdown seconds. */
  countdownTick(): void {
    this.beep('tick')
  }

  /** Cue fired once the routine finishes. */
  finish(): void {
    this.beep('done')
    this.vibrate([120, 80, 120])
  }

  dispose(): void {
    try {
      void this.ctx?.close()
    } catch {
      /* ignore */
    }
    this.ctx = null
  }
}
