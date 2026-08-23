import { useLayoutEffect, useMemo, useRef, useState } from 'react'
import { useFrame } from '@react-three/fiber'
import * as THREE from 'three'
import { palette, spineColor } from './palette'
import { cover } from './filmArt'
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

/** Case dimensions: a DVD keep case, cover-out. */
export const CASE = { width: 0.09, height: 0.105, depth: 0.014 }
const CASE_ASPECT = CASE.width / CASE.height

/**
 * A DVD case, cover-out. Same deal as `Sleeve`: it eases toward whatever the
 * shelf hands it, so one component covers sitting in the stack, fanning out
 * when the station is focused, and standing out front while its film is up on
 * the television.
 */
export function Case({
  entry,
  index,
  texture,
  position,
  rotation,
  scale = 1,
  interactive,
  reach,
  onHover,
  onSelect,
}: {
  entry: Entry
  index: number
  texture: THREE.Texture | null
  /** The case's centre, not the surface it stands on. */
  position: [number, number, number]
  rotation: [number, number, number]
  scale?: number
  interactive: boolean
  /** The strip of this case left visible by the one in front. See `Sleeve`. */
  reach?: { width: number; center: number }
  onHover?: (hovered: boolean) => void
  onSelect: () => void
}) {
  const group = useRef<THREE.Group>(null)
  const front = useRef<THREE.MeshStandardMaterial>(null)
  const [hovered, setHovered] = useState(false)

  // Posters land long after the material compiled, and three will not sample a
  // map that appeared afterwards until the material is flagged for recompile.
  useLayoutEffect(() => {
    cover(texture, CASE_ASPECT)
    if (front.current) front.current.needsUpdate = true
  }, [texture])

  useFrame((_, delta) => {
    const node = group.current
    if (!node) return
    const k = approach(9, Math.min(delta, 1 / 30))
    const raised = hovered && interactive
    scratch.set(
      position[0],
      position[1] + (raised ? 0.012 : 0),
      position[2] + (raised ? 0.014 : 0),
    )
    node.position.lerp(scratch, k)
    node.rotation.x += (rotation[0] - node.rotation.x) * k
    node.rotation.y += (rotation[1] - node.rotation.y) * k
    node.rotation.z += (rotation[2] - node.rotation.z) * k
    const s = node.scale.x + (scale - node.scale.x) * k
    node.scale.setScalar(s)
  })

  const hover = (value: boolean) => {
    setHovered(value)
    if (interactive) document.body.style.cursor = value ? 'pointer' : 'auto'
    onHover?.(value)
  }

  const flat = entry.color ?? spineColor(index + 4)
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
      {/* Pointer target. The raycaster skips invisible meshes, so this is a
          zero-opacity material rather than `visible={false}`. */}
      <mesh position={[reach ? reach.center : 0, 0, 0.012]}>
        <boxGeometry
          args={[reach ? reach.width : CASE.width, CASE.height + 0.02, 0.03]}
        />
        <meshBasicMaterial transparent opacity={0} depthWrite={false} />
      </mesh>

      <mesh castShadow receiveShadow>
        <boxGeometry args={[CASE.width, CASE.height, CASE.depth]} />
        {faces.map((face) => (
          <meshStandardMaterial
            key={face}
            ref={face === 4 ? front : undefined}
            attach={`material-${face}`}
            color={face === 4 && texture ? '#ffffff' : flat}
            map={face === 4 ? texture : null}
            roughness={0.9}
            metalness={0}
          />
        ))}
      </mesh>
    </group>
  )
}

/**
 * The vintage television's picture, measured off the GLB rather than guessed:
 * the recessed screen sits at model z -0.020 spanning x[0.035..0.267] and
 * y[0.034..0.236]. `Prop` recentres the model by x -0.205 and z +0.135, which
 * puts the picture's centre at the offset below. The plane is a shade smaller
 * than the recess so the bezel still frames it and nothing z-fights.
 */
const SCREEN = {
  width: 0.222,
  height: 0.192,
  offset: [-0.054, 0.135, 0.116] as [number, number, number],
}
const SCREEN_ASPECT = SCREEN.width / SCREEN.height
/** The tube when it is off, and the light it comes up to when it is on. */
const SCREEN_OFF = new THREE.Color('#33383a')
const SCREEN_ON = new THREE.Color('#d9e6e1')
const glow = new THREE.Color()

/**
 * The television, switching on. There is no trailer playback anywhere in this:
 * no provider serves direct trailer files, TMDB hands back YouTube keys, and a
 * cross-origin iframe cannot become a WebGL texture. So it shows a still — and
 * with no still to show it simply lights up, which is the no-API-key case.
 */
export function TelevisionScreen({
  position,
  rotation,
  still,
  active,
}: {
  /** The television's own placement; the screen rides along inside it. */
  position: [number, number, number]
  rotation: [number, number, number]
  still: THREE.Texture | null
  active: boolean
}) {
  const tube = useRef<THREE.MeshBasicMaterial>(null)
  const picture = useRef<THREE.MeshBasicMaterial>(null)
  const cue = useRef(0)

  useLayoutEffect(() => {
    cover(still, SCREEN_ASPECT)
    if (picture.current) picture.current.needsUpdate = true
  }, [still])

  useFrame((_, delta) => {
    const dt = Math.min(delta, 1 / 30)
    cue.current = THREE.MathUtils.lerp(cue.current, active ? 1 : 0, approach(4, dt))
    const c = cue.current
    if (tube.current) tube.current.color.copy(glow.copy(SCREEN_OFF).lerp(SCREEN_ON, c))
    if (picture.current) picture.current.opacity = still ? c : 0
  })

  return (
    <group position={position} rotation={rotation}>
      <mesh position={SCREEN.offset}>
        <planeGeometry args={[SCREEN.width, SCREEN.height]} />
        <meshBasicMaterial ref={tube} color={SCREEN_OFF} toneMapped={false} />
      </mesh>
      <mesh
        position={[SCREEN.offset[0], SCREEN.offset[1], SCREEN.offset[2] + 0.0006]}
      >
        <planeGeometry args={[SCREEN.width, SCREEN.height]} />
        <meshBasicMaterial
          ref={picture}
          map={still}
          transparent
          opacity={0}
          toneMapped={false}
        />
      </mesh>
    </group>
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
