import { useSyncExternalStore } from 'react'

/**
 * Day or night for the whole room, toggled by clicking the floor lamp.
 *
 * The 3D side reads this through `useTheme`; the page around it follows a
 * `data-theme` attribute on the document, so the masthead, credit panel and
 * loader all change with the CSS variables they already use.
 */
export type Theme = 'day' | 'night'

const KEY = 'room-theme'
const CHROME = { day: '#f4f1ea', night: '#14181b' }

const listeners = new Set<() => void>()

function remembered(): Theme | null {
  try {
    const saved = localStorage.getItem(KEY)
    return saved === 'day' || saved === 'night' ? saved : null
  } catch {
    return null
  }
}

/** Their own choice first, then whatever the system asks for. */
function preferred(): Theme {
  if (typeof document === 'undefined') return 'day'
  return (
    remembered() ??
    (matchMedia('(prefers-color-scheme: dark)').matches ? 'night' : 'day')
  )
}

let current: Theme = preferred()

function apply() {
  if (typeof document === 'undefined') return
  document.documentElement.dataset.theme = current
  // Keeps the phone's own browser chrome from staying pale over a dark room.
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content', CHROME[current])
}

apply()

export function toggleTheme() {
  current = current === 'day' ? 'night' : 'day'
  try {
    localStorage.setItem(KEY, current)
  } catch {
    // Private browsing. The choice simply will not outlive the visit.
  }
  apply()
  for (const listener of listeners) listener()
}

export function useTheme() {
  return useSyncExternalStore(
    (listener) => {
      listeners.add(listener)
      return () => listeners.delete(listener)
    },
    () => current,
    () => 'day' as Theme,
  )
}
