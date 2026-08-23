import { setFocus, STATIONS, useFocus } from '../scene/focus'

/**
 * Position in the row of stations, and a way to jump between them. Shown only
 * on touch, where swiping replaces the pointer-driven room — without it there
 * is nothing to say the other three stations exist.
 */
export function StationDots() {
  const focus = useFocus()

  return (
    <nav className="dots" aria-label="Room">
      {STATIONS.map((station) => (
        <button
          key={station.id}
          type="button"
          className="dots__dot"
          data-active={focus === station.id || undefined}
          aria-label={station.label}
          aria-current={focus === station.id ? 'true' : undefined}
          onClick={() => setFocus(station.id)}
        />
      ))}
    </nav>
  )
}
