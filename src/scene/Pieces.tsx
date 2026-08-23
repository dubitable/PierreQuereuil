import { useLayoutEffect, useMemo, useRef, useState } from 'react'
import { useFrame } from '@react-three/fiber'
import * as THREE from 'three'
import { palette, spineColor } from './palette'
import type { Entry } from '../data/collections'

/** Deterministic jitter so the room looks hand-arranged but never reshuffles. */
const wobble = (seed: number) => (Math.sin(seed * 12.9898) * 43758.5453) % 1

/** Frame-rate independent approach toward a target. */
const approach = (lambda: number, dt: number) => 1 - Math.exp(-lambda * dt)

/** A book standing on a shelf, tilted a little. */
export function Spine({
  entry,
  index,
  position,
}: {
  entry: Entry
  index: number
  position: [number, number, number]
}) {
  const height = 0.15 + Math.abs(wobble(index + 1)) * 0.05
  const tilt = Math.abs(wobble(index + 4)) > 0.72 ? wobble(index + 4) * 0.16 : 0

  return (
    <group position={position} rotation={[0, 0, tilt]}>
      <mesh position={[0, height / 2, 0]} castShadow receiveShadow>
        <boxGeometry args={[0.021, height, 0.125]} />
        <meshStandardMaterial
          color={entry.color ?? spineColor(index)}
          roughness={0.92}
          metalness={0}
        />
      </mesh>
    </group>
  )
}

export const SLEEVE = 0.185
const scratch = new THREE.Vector3()

/**
 * A record sleeve. It eases toward whatever position the shelf hands it, so
 * the same component covers sitting in the stack, fanning out when the station
 * is focused, and standing out front while its clip plays.
 */
export function Sleeve({
  entry,
  index,
  texture,
  position,
  rotation,
  interactive,
  reach,
  onHover,
  onSelect,
}: {
  entry: Entry
  index: number
  texture: THREE.Texture | null
  position: [number, number, number]
  rotation: [number, number, number]
  interactive: boolean
  /**
   * The band of this sleeve that is actually visible past the one in front,
   * as { width, center } in local units. Sizing the collider to the strip is
   * what makes the sleeves behind reachable: a full-width collider on the
   * front sleeve would catch every ray aimed at the ones behind it.
   */
  reach?: { width: number; center: number }
  onHover?: (hovered: boolean) => void
  onSelect: () => void
}) {
  const group = useRef<THREE.Group>(null)
  const front = useRef<THREE.MeshStandardMaterial>(null)
  const [hovered, setHovered] = useState(false)

  // Artwork arrives after the material has already compiled, and in three a
  // material that gained a map needs recompiling before it will sample it.
  // React Three Fiber does not flag this for us.
  useLayoutEffect(() => {
    if (front.current) front.current.needsUpdate = true
  }, [texture])

  useFrame((_, delta) => {
    const node = group.current
    if (!node) return
    const k = approach(9, Math.min(delta, 1 / 30))
    // Hovering nudges the sleeve up and forward — enough to read as picked
    // out of the row, not enough to jump.
    const raised = hovered && interactive
    scratch.set(
      position[0],
      position[1] + (raised ? 0.014 : 0),
      position[2] + (raised ? 0.016 : 0),
    )
    node.position.lerp(scratch, k)
    node.rotation.x += (rotation[0] - node.rotation.x) * k
    node.rotation.y += (rotation[1] - node.rotation.y) * k
    node.rotation.z += (rotation[2] - node.rotation.z) * k
  })

  const hover = (value: boolean) => {
    setHovered(value)
    if (interactive) document.body.style.cursor = value ? 'pointer' : 'auto'
    onHover?.(value)
  }

  const flat = entry.color ?? spineColor(index + 2)
  // Only the front face carries artwork; the edges stay paper.
  const faces = [0, 1, 2, 3, 4, 5]

  return (
    <group
      ref={group}
      onPointerOver={(event) => {
        if (!interactive) return
        event.stopPropagation()
        hover(true)
      }}
      onPointerOut={() => hover(false)}
      onClick={(event) => {
        if (!interactive) return
        event.stopPropagation()
        hover(false)
        onSelect()
      }}
    >
      {/* Pointer target. Invisible meshes are skipped by the raycaster, hence
          a zero-opacity material rather than `visible={false}`. */}
      <mesh position={[reach ? reach.center : 0, 0.025, 0.012]}>
        <boxGeometry args={[reach ? reach.width : SLEEVE, SLEEVE + 0.06, 0.03]} />
        <meshBasicMaterial transparent opacity={0} depthWrite={false} />
      </mesh>

      <mesh castShadow receiveShadow>
        <boxGeometry args={[SLEEVE, SLEEVE, 0.007]} />
        {faces.map((face) => (
          <meshStandardMaterial
            key={face}
            ref={face === 4 ? front : undefined}
            attach={`material-${face}`}
            color={face === 4 && texture ? '#ffffff' : flat}
            map={face === 4 ? texture : null}
            roughness={0.95}
            metalness={0}
          />
        ))}
      </mesh>
    </group>
  )
}

/** A DVD case standing in the cabinet. */
export function Case({
  entry,
  index,
  position,
}: {
  entry: Entry
  index: number
  /** Position is the shelf the case stands on, not the case's centre. */
  position: [number, number, number]
}) {
  return (
    <mesh
      position={[position[0], position[1] + 0.0525, position[2]]}
      castShadow
      receiveShadow
    >
      <boxGeometry args={[0.014, 0.105, 0.09]} />
      <meshStandardMaterial
        color={entry.color ?? spineColor(index + 4)}
        roughness={0.9}
        metalness={0}
      />
    </mesh>
  )
}

const PLATTER_Y = 0.046
const ARM_PARKED = 0.5
const ARM_PLAYING = 0.02
const ARM_Y = 0.048

/**
 * Built from primitives rather than sourced — the furniture kit has no record
 * player. When a clip starts, the record lowers onto the platter, spins up and
 * the arm swings across; stopping reverses it.
 */
export function Turntable({
  position,
  active,
  artwork,
}: {
  position: [number, number, number]
  active: boolean
  artwork: THREE.Texture | null
}) {
  const disc = useRef<THREE.Group>(null)
  const arm = useRef<THREE.Group>(null)
  const label = useRef<THREE.MeshStandardMaterial>(null)
  const cue = useRef(0)
  const spin = useRef(0)
  const dark = useMemo(() => ({ color: palette.vinyl, roughness: 0.7 }), [])

  // Same recompile the sleeves need when their cover lands.
  useLayoutEffect(() => {
    if (label.current) label.current.needsUpdate = true
  }, [artwork])

  useFrame((_, delta) => {
    const dt = Math.min(delta, 1 / 30)
    cue.current = THREE.MathUtils.lerp(cue.current, active ? 1 : 0, approach(5, dt))
    const c = cue.current

    if (disc.current) {
      disc.current.visible = c > 0.02
      disc.current.position.y = PLATTER_Y + (1 - c) * 0.1
      // Spins up only once it has settled, and coasts down as it lifts away.
      if (c > 0.75) spin.current += dt * 3.6 * ((c - 0.75) / 0.25)
      disc.current.rotation.y = spin.current
    }

    if (arm.current) {
      arm.current.rotation.y = THREE.MathUtils.lerp(ARM_PARKED, ARM_PLAYING, c)
      arm.current.position.y = ARM_Y + (1 - c) * 0.006
    }
  })

  return (
    <group position={position}>
      <mesh position={[0, 0.018, 0]} castShadow receiveShadow>
        <boxGeometry args={[0.3, 0.036, 0.2]} />
        <meshStandardMaterial color="#e2ddd2" roughness={0.85} metalness={0} />
      </mesh>

      <mesh position={[-0.03, 0.04, 0]} castShadow>
        <cylinderGeometry args={[0.082, 0.082, 0.008, 40]} />
        <meshStandardMaterial color="#b8b2a6" roughness={0.8} metalness={0} />
      </mesh>

      {/* The record itself, which only exists while something is playing. */}
      <group ref={disc} position={[-0.03, PLATTER_Y, 0]} visible={false}>
        <mesh castShadow>
          <cylinderGeometry args={[0.078, 0.078, 0.004, 40]} />
          <meshStandardMaterial {...dark} metalness={0} />
        </mesh>
        <mesh position={[0, 0.003, 0]} rotation={[-Math.PI / 2, 0, 0]}>
          <circleGeometry args={[0.026, 32]} />
          <meshStandardMaterial
            ref={label}
            color={artwork ? '#ffffff' : palette.label}
            map={artwork}
            roughness={0.9}
            metalness={0}
          />
        </mesh>
      </group>

      <mesh position={[-0.03, 0.052, 0]}>
        <cylinderGeometry args={[0.004, 0.004, 0.012, 12]} />
        <meshStandardMaterial color="#9a948a" roughness={0.6} metalness={0} />
      </mesh>

      <group ref={arm} position={[0.112, ARM_Y, 0.058]} rotation={[0, ARM_PARKED, 0]}>
        <mesh castShadow>
          <cylinderGeometry args={[0.014, 0.016, 0.022, 16]} />
          <meshStandardMaterial color="#9a948a" roughness={0.6} metalness={0} />
        </mesh>
        <mesh position={[-0.05, 0.014, -0.05]} rotation={[0, Math.PI / 4, 0]} castShadow>
          <boxGeometry args={[0.145, 0.006, 0.006]} />
          <meshStandardMaterial color="#c4bfb4" roughness={0.6} metalness={0} />
        </mesh>
      </group>
    </group>
  )
}

/** Soft glow on the monitor so the computer reads as switched on. */
export function ScreenGlow({ position }: { position: [number, number, number] }) {
  return (
    <mesh position={position}>
      <planeGeometry args={[0.315, 0.175]} />
      <meshBasicMaterial color="#d9e6e1" toneMapped={false} />
    </mesh>
  )
}
