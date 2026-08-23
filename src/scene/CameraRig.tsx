import { useEffect, useRef } from 'react'
import { useFrame, useThree } from '@react-three/fiber'
import * as THREE from 'three'
import {
  fitDistance,
  focusPose,
  getFocus,
  ROOM,
  setFocus,
  stationById,
  stationIndex,
  STATIONS,
  useFocus,
} from './focus'

/** Where a touch visit begins, and how long the opening shot holds. */
const OPENING_STATION = 'desk'
const OPENING_ZOOM = 2.3
const OPENING_MS = 1400

/** Minimum horizontal travel for a swipe to count, in px. */
const SWIPE_MIN = 44

const prefersReducedMotion = () =>
  typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches

/** Frame-rate independent approach; higher lambda snaps faster. */
function damp(current: THREE.Vector3, goal: THREE.Vector3, lambda: number, dt: number) {
  current.lerp(goal, 1 - Math.exp(-lambda * dt))
}

export function CameraRig({ touch }: { touch: boolean }) {
  const focus = useFocus()
  const { camera, size } = useThree()
  const pointer = useRef({ x: 0, y: 0 })
  const goalPosition = useRef(new THREE.Vector3())
  const goalTarget = useRef(new THREE.Vector3())
  const target = useRef(ROOM.target.clone())
  const still = useRef(prefersReducedMotion())
  /** Eases from 1 to 0 across the opening shot. */
  const opening = useRef(0)

  // Pointer parallax, on pointer devices only. On touch `pointermove` fires
  // only while a finger is down and reports its absolute position, which makes
  // the room lurch to wherever you happen to tap.
  useEffect(() => {
    if (touch) return
    const onPointerMove = (event: PointerEvent) => {
      pointer.current.x = (event.clientX / window.innerWidth) * 2 - 1
      pointer.current.y = (event.clientY / window.innerHeight) * 2 - 1
    }
    window.addEventListener('pointermove', onPointerMove)
    return () => window.removeEventListener('pointermove', onPointerMove)
  }, [touch])

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && !touch) setFocus(null)
      if (event.key === 'ArrowLeft') step(-1)
      if (event.key === 'ArrowRight') step(1)
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [touch])

  // The opening shot: start pulled back on the desk, then settle in.
  useEffect(() => {
    if (!touch) return
    opening.current = 1
    setFocus(OPENING_STATION)
    const timer = setTimeout(() => {
      opening.current = 0
    }, OPENING_MS)
    return () => clearTimeout(timer)
  }, [touch])

  // Swipe between stations. They are declared left to right, so the order
  // matches the room and a swipe moves the way the scene does.
  useEffect(() => {
    if (!touch) return
    let startX = 0
    let startY = 0

    const onStart = (event: TouchEvent) => {
      const point = event.changedTouches[0]
      if (!point) return
      startX = point.clientX
      startY = point.clientY
    }
    const onEnd = (event: TouchEvent) => {
      const point = event.changedTouches[0]
      if (!point) return
      const dx = point.clientX - startX
      const dy = point.clientY - startY
      if (Math.abs(dx) < SWIPE_MIN || Math.abs(dx) <= Math.abs(dy)) return
      step(dx < 0 ? 1 : -1)
    }

    window.addEventListener('touchstart', onStart, { passive: true })
    window.addEventListener('touchend', onEnd, { passive: true })
    return () => {
      window.removeEventListener('touchstart', onStart)
      window.removeEventListener('touchend', onEnd)
    }
  }, [touch])

  useFrame((_, delta) => {
    const dt = Math.min(delta, 1 / 30)
    const aspect = size.width / size.height

    if (focus) {
      // Eases the opening shot's extra width away rather than cutting.
      opening.current = THREE.MathUtils.lerp(opening.current, 0, 1 - Math.exp(-1.6 * dt))
      const zoom = 1 + (OPENING_ZOOM - 1) * opening.current
      const pose = focusPose(stationById(focus), aspect, zoom)
      goalPosition.current.copy(pose.position)
      goalTarget.current.copy(pose.target)
    } else {
      const distance = fitDistance(ROOM.fit, aspect)
      const yaw = still.current ? 0 : pointer.current.x * ROOM.swing
      const lift = still.current ? 0 : pointer.current.y * 0.22

      goalPosition.current.set(
        ROOM.target.x + Math.sin(yaw) * distance * Math.cos(ROOM.elevation),
        ROOM.target.y + distance * Math.sin(ROOM.elevation) - lift,
        ROOM.target.z + Math.cos(yaw) * distance * Math.cos(ROOM.elevation),
      )
      goalTarget.current.copy(ROOM.target)
    }

    const lambda = focus ? 3.2 : 2.2
    damp(camera.position, goalPosition.current, lambda, dt)
    damp(target.current, goalTarget.current, lambda, dt)
    camera.lookAt(target.current)
  })

  return null
}

/** Moves focus along the row of stations, stopping at either end. */
function step(direction: number) {
  const focus = getFocus()
  const from = focus ? stationIndex(focus) : stationIndex('desk')
  const next = THREE.MathUtils.clamp(from + direction, 0, STATIONS.length - 1)
  setFocus(STATIONS[next]!.id)
}
