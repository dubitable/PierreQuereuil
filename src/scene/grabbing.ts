/**
 * True while something in the room is being dragged directly — the desk chair,
 * for now. The touch gesture that moves between stations is bound to the
 * window, so without this a horizontal drag on the chair would also throw the
 * camera to the next station.
 *
 * Cleared on a timeout rather than immediately: `touchend` and `pointerup`
 * arrive in an order that varies by browser, and the swipe has to still see the
 * grab when it checks.
 */
let grabbing = false

export function setGrabbing(value: boolean) {
  if (value) {
    grabbing = true
    return
  }
  setTimeout(() => {
    grabbing = false
  }, 0)
}

export const isGrabbing = () => grabbing
