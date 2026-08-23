/**
 * One audio element for the whole room, with short volume ramps so clips do
 * not snap in and out. Playback is always started from a click, which keeps
 * browsers' autoplay rules happy.
 */
let element: HTMLAudioElement | null = null
let ramp: number | null = null

const FADE_MS = 320

function audio() {
  if (!element) {
    element = new Audio()
    element.preload = 'none'
  }
  return element
}

function fade(to: number, done?: () => void) {
  const node = audio()
  if (ramp !== null) clearInterval(ramp)
  const from = node.volume
  const start = performance.now()

  ramp = window.setInterval(() => {
    const t = Math.min((performance.now() - start) / FADE_MS, 1)
    node.volume = from + (to - from) * t
    if (t < 1) return
    if (ramp !== null) clearInterval(ramp)
    ramp = null
    done?.()
  }, 16)
}

export function play(url: string, onEnded?: () => void) {
  const node = audio()
  node.onended = onEnded ?? null
  node.src = url
  node.volume = 0
  const started = node.play()
  if (started) started.catch(() => undefined)
  fade(1)
}

export function stop() {
  if (!element) return
  const node = element
  fade(0, () => {
    node.pause()
    node.removeAttribute('src')
  })
}
