import { useEffect, useState } from 'react'

const QUERY = '(pointer: coarse)'

/**
 * Touch capability rather than screen width: a small desktop window still
 * wants the pointer-driven room, and a large tablet still wants the carousel.
 */
export function useIsTouch() {
  // Read on the first render: this island is client-only, so there is no
  // server/client mismatch, and the Canvas mounts with the right settings.
  const [touch, setTouch] = useState(
    () => typeof matchMedia === 'function' && matchMedia(QUERY).matches,
  )

  useEffect(() => {
    if (typeof matchMedia !== 'function') return
    const query = matchMedia(QUERY)
    const update = () => setTouch(query.matches)
    update()
    query.addEventListener('change', update)
    return () => query.removeEventListener('change', update)
  }, [])

  return touch
}
