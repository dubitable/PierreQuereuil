import { useEffect, useLayoutEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { useFrame, useThree, type ThreeElements, type ThreeEvent } from '@react-three/fiber'
import * as THREE from 'three'
import { palette, spineColor } from './palette'
import { cover } from './art'
import { setGrabbing } from './grabbing'
import { platter } from './turntable'
import type { Entry } from '../data/collections'

/** Frame-rate independent approach toward a target. */
export const approach = (lambda: number, dt: number) => 1 - Math.exp(-lambda * dt)

/**
 * How close counts as arrived. Easing approaches its goal without ever
 * reaching it, and under `frameloop="demand"` that would mean asking for
 * another frame forever, so every animation snaps once it is this close.
 */
const SETTLED = 0.0005

/** Eases a number toward a goal, returning whether it is still on its way. */
export function ease(current: number, goal: number, k: number) {
  const next = current + (goal - current) * k
  return Math.abs(goal - next) < SETTLED
    ? { value: goal, moving: false }
    : { value: next, moving: true }
}

export type Size = [number, number, number]

/** Album sleeve, DVD case, book jacket: width, height, thickness. */
export const SLEEVE: Size = [0.185, 0.185, 0.007]
export const CASE: Size = [0.09, 0.105, 0.014]
export const BOOK: Size = [0.125, 0.177, 0.021]
/** How far a hovered object lifts and comes forward. */
type Lift = { y: number; z: number }

const scratch = new THREE.Vector3()

/**
 * Anything on a shelf with artwork on its face. One component covers all three
 * shelves: a record sleeve, a DVD case and a book are the same object at
 * different sizes, and they behave identically — they ease toward whatever the
 * shelf hands them, lift on hover, and hand back a click.
 */
export function Cover({
  entry,
  index,
  texture,
  size,
  position,
  rotation,
  scale = 1,
  lift,
  interactive,
  reach,
  onHover,
  onSelect,
}: {
  entry: Entry
  index: number
  texture: THREE.Texture | null
  size: Size
  position: [number, number, number]
  rotation: [number, number, number]
  scale?: number
  lift: Lift
  interactive: boolean
  /**
   * The band of this object that is actually visible past the one in front, as
   * { width, center } in local units. Sizing the collider to the strip is what
   * makes the ones behind reachable: a full-width collider on the front sleeve
   * would catch every ray aimed at the ones behind it. Objects standing side by
   * side rather than stacked in depth do not need it.
   */
  reach?: { width: number; center: number }
  onHover?: (hovered: boolean) => void
  onSelect: () => void
}) {
  const group = useRef<THREE.Group>(null)
  const front = useRef<THREE.MeshStandardMaterial>(null)
  const [hovered, setHovered] = useState(false)
  const [width, height, depth] = size

  // Artwork lands long after the material compiled, and three will not sample a
  // map that appeared afterwards until the material is flagged for recompile.
  // React Three Fiber does not do this for us.
  useLayoutEffect(() => {
    cover(texture, width / height)
    if (front.current) front.current.needsUpdate = true
  }, [texture, width, height])

  useFrame((state, delta) => {
    const node = group.current
    if (!node) return
    const k = approach(9, Math.min(delta, 1 / 30))
    // Enough to read as picked out of the row, not enough to jump.
    const raised = hovered && interactive
    scratch.set(
      position[0],
      position[1] + (raised ? lift.y : 0),
      position[2] + (raised ? lift.z : 0),
    )

    let moving = node.position.distanceToSquared(scratch) > SETTLED * SETTLED
    if (moving) node.position.lerp(scratch, k)
    else node.position.copy(scratch)

    for (const axis of ['x', 'y', 'z'] as const) {
      const turn = ease(node.rotation[axis], rotation[axis === 'x' ? 0 : axis === 'y' ? 1 : 2], k)
      node.rotation[axis] = turn.value
      moving = moving || turn.moving
    }

    const sized = ease(node.scale.x, scale, k)
    node.scale.setScalar(sized.value)
    moving = moving || sized.moving

    if (moving) state.invalidate()
  })

  const hover = (value: boolean) => {
    setHovered(value)
    if (interactive) document.body.style.cursor = value ? 'pointer' : 'auto'
    onHover?.(value)
  }

  const flat = entry.color ?? spineColor(index + 2)

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
      {/* Pointer target, and only while the station is focused — nothing else
          can be clicked, and this is a real draw call the rest of the time.
          The raycaster skips invisible meshes, hence a zero-opacity material
          rather than `visible={false}`. */}
      {interactive && (
        <mesh position={[reach ? reach.center : 0, 0, depth]}>
          <boxGeometry args={[reach ? reach.width : width, height + 0.03, 0.03]} />
          <meshBasicMaterial transparent opacity={0} depthWrite={false} />
        </mesh>
      )}

      {/* The object itself carries one material rather than one per face. A
          six-material box is six draw calls, and these are the most numerous
          things in the room. Artwork rides on its own plane instead.
          Casting is off: a card this thin contributes almost no shadow, and
          sixteen of them dominated the shadow pass. */}
      <mesh receiveShadow>
        <boxGeometry args={size} />
        <meshStandardMaterial color={flat} roughness={0.93} metalness={0} />
      </mesh>

      <mesh position={[0, 0, depth / 2 + 0.0004]}>
        <planeGeometry args={[width, height]} />
        <meshStandardMaterial
          ref={front}
          color={texture ? '#ffffff' : flat}
          map={texture}
          roughness={0.93}
          metalness={0}
        />
      </mesh>
    </group>
  )
}

/**
 * A photograph in a frame, standing on a desk. Built the same way as a cover —
 * one box, one material, and the picture on its own plane a hair in front —
 * except that the box is a shade bigger than the picture on every side, which
 * is what makes it read as a frame with a rebate rather than a floating photo.
 *
 * The group's origin is the bottom of the frame, so it can be dropped straight
 * onto a surface and leaned back from there.
 */
const FRAME: Size = [0.1, 0.136, 0.009]
const PHOTO: [number, number] = [0.078, 0.112]

export function Portrait({
  photo,
  position,
  rotation,
}: {
  photo: THREE.Texture | null
  position: [number, number, number]
  rotation: [number, number, number]
}) {
  const front = useRef<THREE.MeshStandardMaterial>(null)

  // Same recompile every other late-arriving image needs, plus the centre-crop
  // that keeps a portrait from being squashed into the opening.
  useLayoutEffect(() => {
    cover(photo, PHOTO[0] / PHOTO[1])
    if (front.current) front.current.needsUpdate = true
  }, [photo])

  return (
    <group position={position} rotation={rotation}>
      <mesh position={[0, FRAME[1] / 2, 0]} castShadow receiveShadow>
        <boxGeometry args={FRAME} />
        <meshStandardMaterial color={palette.frame} roughness={0.85} metalness={0} />
      </mesh>

      <mesh position={[0, FRAME[1] / 2, FRAME[2] / 2 + 0.0004]}>
        <planeGeometry args={PHOTO} />
        <meshStandardMaterial
          ref={front}
          color={photo ? '#ffffff' : palette.inkSoft}
          map={photo}
          roughness={0.9}
          metalness={0}
        />
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
  // Overshoots the 0.232 x 0.202 recess on purpose. The picture sits at the
  // bottom of a 20mm-deep well, so the surplus is hidden behind the front face
  // — and covering the corners matters more than matching the opening, which
  // at the exact size left the model's dark screen showing at the edges.
  width: 0.24,
  height: 0.21,
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

  useFrame((state, delta) => {
    const dt = Math.min(delta, 1 / 30)
    const lit = ease(cue.current, active ? 1 : 0, approach(4, dt))
    cue.current = lit.value
    const c = cue.current
    if (tube.current) tube.current.color.copy(glow.copy(SCREEN_OFF).lerp(SCREEN_ON, c))
    if (picture.current) picture.current.opacity = still ? c : 0
    if (lit.moving) state.invalidate()
  })

  return (
    <group position={position} rotation={rotation}>
      <mesh position={SCREEN.offset}>
        <planeGeometry args={[SCREEN.width, SCREEN.height]} />
        <meshBasicMaterial ref={tube} color={SCREEN_OFF} toneMapped={false} />
      </mesh>
      <mesh position={[SCREEN.offset[0], SCREEN.offset[1], SCREEN.offset[2] + 0.0006]}>
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
/** How far above the platter the record starts and returns to. */
const DISC_LIFT = 0.05
/**
 * The record is fully solid above this much of the cue and fades below it, so
 * it arrives and leaves instead of blinking into being at the top of its lift.
 */
const DISC_FADE = 0.45

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
  const vinyl = useRef<THREE.MeshStandardMaterial>(null)
  const cue = useRef(0)
  const spin = useRef(0)
  const dark = useMemo(() => ({ color: palette.vinyl, roughness: 0.7 }), [])

  // Same recompile the sleeves need when their cover lands.
  useLayoutEffect(() => {
    if (label.current) label.current.needsUpdate = true
  }, [artwork])

  useFrame((state, delta) => {
    const dt = Math.min(delta, 1 / 30)
    const cued = ease(cue.current, active ? 1 : 0, approach(5, dt))
    cue.current = cued.value
    const c = cue.current
    // Unlike everything else here the record does not settle: it turns for as
    // long as the clip plays, so it has to keep asking for frames.
    if (cued.moving || active) state.invalidate()

    if (disc.current) {
      // Fades as it lifts. Cutting on a visibility threshold left the record
      // disappearing while still high above the platter, which read as it
      // popping out of the air.
      const solid = Math.min(c / DISC_FADE, 1)
      disc.current.visible = solid > 0.004
      disc.current.position.y = PLATTER_Y + (1 - c) * DISC_LIFT
      if (vinyl.current) vinyl.current.opacity = solid
      if (label.current) label.current.opacity = solid
      // Spins up only once it has settled, and coasts down as it lifts away.
      if (c > 0.75) spin.current += dt * 3.6 * ((c - 0.75) / 0.25)
      disc.current.rotation.y = spin.current
      // Published for the cat, which may be sitting on the record.
      platter.spin = spin.current
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
          <meshStandardMaterial ref={vinyl} {...dark} metalness={0} transparent opacity={0} />
        </mesh>
        <mesh position={[0, 0.003, 0]} rotation={[-Math.PI / 2, 0, 0]}>
          <circleGeometry args={[0.026, 32]} />
          <meshStandardMaterial
            ref={label}
            color={artwork ? '#ffffff' : palette.label}
            map={artwork}
            roughness={0.9}
            metalness={0}
            transparent
            opacity={0}
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

/**
 * Radians of turn per pixel dragged. Deliberately screen-space rather than
 * intersecting the pointer ray with a horizontal plane through the pivot: the
 * desk camera rides at about 7.6 degrees, where that plane is so grazing the
 * mapping goes unstable a few centimetres out from the axis.
 */
const DRAG_TURN = 0.011
/** Ceiling on a flick, radians per second, past which it reads as a fan. */
const FLICK_MAX = 13
/** A release this long after the last movement is a set-down, not a flick. */
const FLICK_STALE = 90
/** Pixels of travel before a press counts as a drag rather than a click. */
const DRAG_SLOP = 3
/** Coasts down over a few seconds, the way a real castor chair does. */
const SPIN_DRAG = 0.85
const SPIN_STOP = 0.05

/**
 * Anything you can take hold of and spin. Press and it follows your hand;
 * let go while still moving and it carries on and winds down; let go after
 * holding it still and it stays where you put it.
 *
 * The spin lives on an inner group so it survives re-renders: the outer group
 * takes its placement declaratively, and React Three Fiber would reset a
 * rotation it also manages from props.
 */
export function Swivel({
  children,
  capture,
  ...props
}: {
  children: ReactNode
  /**
   * Swallow a click rather than letting the station behind it act. Set once
   * the station is focused, where its own handler would toggle focus back off
   * — unfocused, a click should still bring the camera in. A drag always
   * swallows it, whatever this says.
   */
  capture?: boolean
} & ThreeElements['group']) {
  const spin = useRef<THREE.Group>(null)
  // A drag writes straight to the group, outside any frame loop, so it has to
  // ask for the redraw itself.
  const invalidate = useThree((state) => state.invalidate)
  const velocity = useRef(0)
  const moved = useRef(0)
  const flick = useRef<{ speed: number; time: number } | null>(null)
  const release = useRef<(() => void) | null>(null)

  // A drag that outlives its component would leave listeners on the window.
  useEffect(() => () => release.current?.(), [])

  useFrame((state, delta) => {
    const node = spin.current
    if (!node || velocity.current === 0) return
    const dt = Math.min(delta, 1 / 30)
    node.rotation.y += velocity.current * dt
    velocity.current *= Math.exp(-SPIN_DRAG * dt)
    if (Math.abs(velocity.current) < SPIN_STOP) velocity.current = 0
    // Coasting down; the drag itself invalidates through its own handler.
    if (velocity.current !== 0) state.invalidate()
  })

  const grab = (event: ThreeEvent<PointerEvent>) => {
    const node = spin.current
    // A press can arrive more than once: the chair is two meshes, and a ray
    // through both gives two intersections that resolve to this same group.
    // Without this the second call would orphan the first drag's listeners and
    // the chair would follow the cursor for good.
    if (!node || release.current) return
    velocity.current = 0
    moved.current = 0
    flick.current = null
    setGrabbing(true)
    document.body.style.cursor = 'grabbing'

    // Tracked on the window rather than the mesh so the chair keeps following
    // once your hand has left it, which is most of any real drag.
    let last = { x: event.nativeEvent.clientX, time: performance.now() }

    const move = (native: PointerEvent) => {
      // Releasing outside the window never delivers a pointerup, so the next
      // move with no button down is the drag's real end.
      if (native.pointerType === 'mouse' && native.buttons === 0) {
        up()
        return
      }
      const now = performance.now()
      const dx = native.clientX - last.x
      const dt = Math.max(now - last.time, 1) / 1000
      last = { x: native.clientX, time: now }
      moved.current += Math.abs(dx)
      node.rotation.y += dx * DRAG_TURN
      invalidate()
      const instant = (dx * DRAG_TURN) / dt
      // Smoothed, so one stuttered frame at the end does not decide the flick.
      flick.current = {
        speed: flick.current ? flick.current.speed * 0.4 + instant * 0.6 : instant,
        time: now,
      }
    }

    // Each drag tears down its own listeners rather than whatever the ref
    // happens to hold, so a stray second press can never unhook the live one.
    const stop = () => {
      window.removeEventListener('pointermove', move)
      window.removeEventListener('pointerup', up)
      window.removeEventListener('pointercancel', up)
      if (release.current === stop) release.current = null
      setGrabbing(false)
      document.body.style.cursor = 'auto'
    }

    const up = () => {
      stop()
      const thrown = flick.current
      if (thrown && performance.now() - thrown.time < FLICK_STALE) {
        velocity.current = THREE.MathUtils.clamp(thrown.speed, -FLICK_MAX, FLICK_MAX)
      }
      flick.current = null
    }

    release.current = stop
    window.addEventListener('pointermove', move)
    window.addEventListener('pointerup', up)
    window.addEventListener('pointercancel', up)
  }

  return (
    <group {...props}>
      <group
        ref={spin}
        onPointerOver={(event) => {
          event.stopPropagation()
          if (!release.current) document.body.style.cursor = 'grab'
        }}
        onPointerOut={() => {
          if (!release.current) document.body.style.cursor = 'auto'
        }}
        onPointerDown={grab}
        onClick={(event) => {
          // A drag is never also a click on the station behind it.
          if (capture || moved.current > DRAG_SLOP) event.stopPropagation()
        }}
      >
        {children}
      </group>
    </group>
  )
}
