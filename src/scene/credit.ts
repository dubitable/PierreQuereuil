import { useSyncExternalStore } from 'react'

/**
 * What the bottom-right panel should name. Both shelves feed it — a record
 * that is playing, a film whose case is out — so it stays deliberately neutral
 * about which. `source` names the service the link points at, which their
 * terms expect us to credit.
 */
export type Credit = {
  title: string
  subtitle: string
  href: string
  source: string
}

/**
 * Hovering previews something before you commit to it, so a hovered item takes
 * precedence over whatever is selected; letting go falls back to the selection.
 */
let selected: Credit | null = null
let hovered: Credit | null = null
const listeners = new Set<() => void>()

function emit() {
  for (const listener of listeners) listener()
}

export function setSelected(credit: Credit | null) {
  if (selected === credit) return
  selected = credit
  emit()
}

export function setHovered(credit: Credit | null) {
  if (hovered === credit) return
  hovered = credit
  emit()
}

/**
 * Only clears if this is still the hovered item — moving between neighbours can
 * deliver the new one's enter before the old one's leave. Compared by identity,
 * so callers must hand back the same object they hovered with.
 */
export function clearHovered(credit: Credit) {
  if (hovered !== credit) return
  hovered = null
  emit()
}

export function useCredit() {
  return useSyncExternalStore(
    (listener) => {
      listeners.add(listener)
      return () => listeners.delete(listener)
    },
    () => hovered ?? selected,
    () => null,
  )
}
