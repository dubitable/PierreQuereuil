import { useSyncExternalStore } from 'react'
import type { Track } from './appleMusic'

/**
 * Which record the credit panel should describe. Hovering a sleeve previews it
 * before you commit to playing it, so a hovered sleeve takes precedence over
 * whatever is currently playing; letting go falls back to the playing track.
 */
let playing: Track | null = null
let hovered: Track | null = null
const listeners = new Set<() => void>()

function emit() {
  for (const listener of listeners) listener()
}

export function setPlaying(track: Track | null) {
  if (playing === track) return
  playing = track
  emit()
}

export function setHovered(track: Track | null) {
  if (hovered === track) return
  hovered = track
  emit()
}

/**
 * Only clears if this is still the hovered track — moving between sleeves can
 * deliver the new sleeve's enter before the old one's leave.
 */
export function clearHovered(track: Track) {
  if (hovered !== track) return
  hovered = null
  emit()
}

export function useCredit() {
  return useSyncExternalStore(
    (listener) => {
      listeners.add(listener)
      return () => listeners.delete(listener)
    },
    () => hovered ?? playing,
    () => null,
  )
}
