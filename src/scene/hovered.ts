import { useSyncExternalStore } from 'react'
import type { StationId } from './focus'

/**
 * Which station the pointer is over. `Station` keeps its own hover state for
 * its own lift, but anything standing *on* a station without being parented to
 * it has to know too: the cat sits on the desk in world space, and would be
 * swallowed as the desk rises under it.
 */
let hovered: StationId | null = null
const listeners = new Set<() => void>()

export function setHoveredStation(id: StationId | null) {
  if (hovered === id) return
  hovered = id
  for (const listener of listeners) listener()
}

/** Only clears if that station is still the one hovered. */
export function clearHoveredStation(id: StationId) {
  if (hovered === id) setHoveredStation(null)
}

export function useHoveredStation() {
  return useSyncExternalStore(
    (listener) => {
      listeners.add(listener)
      return () => listeners.delete(listener)
    },
    () => hovered,
    () => null,
  )
}
