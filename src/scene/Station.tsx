import { Suspense, useEffect, useRef, useState, type ReactNode } from 'react'
import { useFrame } from '@react-three/fiber'
import * as THREE from 'three'
import { toggleFocus, useFocus, type Station as StationConfig } from './focus'

/**
 * A clickable zone of the room. Hovering lifts it slightly, which is the only
 * affordance the scene needs; clicking hands the camera over to it.
 */
export function Station({
  station,
  children,
  detail,
}: {
  station: StationConfig
  /** The furniture. Lifts on hover and carries the click handler. */
  children: ReactNode
  /** The text that appears once focused. Sits outside the clickable group. */
  detail?: ReactNode
}) {
  const focus = useFocus()
  const [hovered, setHovered] = useState(false)
  const inner = useRef<THREE.Group>(null)

  const interactive = focus === null || focus === station.id
  const lifted = hovered && focus === null

  useFrame((state, delta) => {
    const node = inner.current
    if (!node) return
    const dt = Math.min(delta, 1 / 30)
    const goal = lifted ? 0.028 : 0
    const next = THREE.MathUtils.lerp(node.position.y, goal, 1 - Math.exp(-9 * dt))
    // Snap and stop asking once it has effectively arrived; under
    // `frameloop="demand"` an approach that never lands never stops drawing.
    if (Math.abs(goal - next) < 0.0005) {
      node.position.y = goal
      return
    }
    node.position.y = next
    state.invalidate()
  })

  useEffect(() => {
    setHovered(false)
    document.body.style.cursor = 'auto'
  }, [focus])

  const setCursor = (value: boolean) => {
    setHovered(value)
    document.body.style.cursor = value && interactive ? 'pointer' : 'auto'
  }

  return (
    <group position={station.position} rotation={[0, station.rotation, 0]}>
      <group
        ref={inner}
        onPointerOver={(event) => {
          event.stopPropagation()
          setCursor(true)
        }}
        onPointerOut={() => setCursor(false)}
        onClick={(event) => {
          event.stopPropagation()
          setCursor(false)
          toggleFocus(station.id)
        }}
      >
        {children}
      </group>
      {/* Its own boundary: the text suspends until its font loads, and the
          furniture should still be here if that font never arrives. */}
      <Suspense fallback={null}>{detail}</Suspense>
    </group>
  )
}
