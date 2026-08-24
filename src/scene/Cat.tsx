import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { useFrame, useLoader, useThree } from '@react-three/fiber'
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js'
import * as THREE from 'three'
import { stationById, useFocus, type StationId } from './focus'
import { useHoveredStation } from './hovered'
import { useIsTouch } from './useIsTouch'
import { platter } from './turntable'
import { approach, ease } from './Pieces'
import { Puff } from './Puff'
import { Zzz } from './Zzz'
import { TOP } from './useProp'

const FILE = '/models/cat.glb'

/**
 * Nose to tail-base, in room units — the one number to turn if the cat reads
 * too big or too small, and the only thing its size depends on. The model
 * measures 2.16 along its own length axis in bind pose, but the scale is
 * derived from its bounds at load rather than hard-coded, so this stays the
 * size whatever model is behind it.
 */
const LENGTH = 0.155

/** Matches the hover lift in `Station`, which the cat has to ride out. */
const LIFT = 0.028

/**
 * The face of the record, measured up through the turntable in `Pieces`: the
 * side table's top at 0.384, the platter sitting 0.044 above it, and the vinyl
 * 0.0005 above that. A whisker high rather than a whisker low, so an arriving
 * record passes under the paws instead of through them.
 */
const TURNTABLE_TOP = 0.4325

/** Gap between idle beats, in ms. */
const BEAT_MIN = 4500
const BEAT_SPREAD = 6000

/** Beats with nobody touching it before the cat gives up and goes to sleep. */
const DROWSY = 4

/**
 * How much slower than authored the lie-down plays. At full speed the clip is
 * a fall; at just over half it is a cat deciding to lie down.
 */
const SETTLE_SPEED = 0.55

/**
 * Coordinates in the model's 512×512 palette atlas, which is nothing but flat
 * swatches — the cat has four colours and every vertex points at one of them.
 * The dark swatch shows up as eight small blocks on the face: a pair per side
 * up at eye height, and a pair per side level with the nose, out on the
 * cheeks. Pointing the upper ones at the fur swatch shuts the eyes.
 */
const DARK_SWATCH = 0.5935
const FUR_SWATCH: [number, number] = [0.4114, 0.8482]
/**
 * Where the eyes stop and the whisker spots begin, on the mesh's own up axis
 * (its +z; the model is laid down by a -90° x on its parent). The eyes sit at
 * 61% of the head's height and the spots at 35%, so there is a lot of room
 * either side of this — raise it past 0.0106 to shut nothing, drop it below
 * 0.0082 to blank the whole face.
 */
const EYE_LINE = 0.0095

/** How often a pet turns out to be the last one. */
const LEAVE_ODDS = 1 / 2

/** The leaving sequence, in ms after the pet clip ends. */
const PUFF_AT = 0
/** Smoke covers the vanish rather than the vanish revealing smoke. */
const VANISH_AT = 140
/** A beat where the cat is simply nowhere, which is what sells the trick. */
const ARRIVE_AT = 440

type Perch = {
  station: StationId
  position: THREE.Vector3
  /** World yaw, radians. */
  yaw: number
  /** Turns with the record. Only the one on the platter does. */
  spins?: boolean
  /** Somewhere it can sit but not lie down. */
  noSleeping?: boolean
}

/**
 * A spot the cat can be, in the station's local space, using the same basis as
 * `focusPose` in `focus.ts` — so these numbers mean what the ones in `Room.tsx`
 * mean.
 *
 * Every one is projected through its own station's camera at 9:19, 3:4 and
 * 16:9 before being kept, the same check the floor lamp got. That rules out
 * most of the room: each station is framed tight on its furniture, so the
 * floor in front of it drops below the bottom edge on a desktop and the top of
 * the bookcase rises above the top edge. What is left is furniture a cat can
 * get onto, which is where a cat would be anyway.
 */
function perch(
  station: StationId,
  local: [number, number, number],
  yaw: number,
  extra: Omit<Perch, 'station' | 'position' | 'yaw'> = {},
): Perch {
  const host = stationById(station)
  const forward = new THREE.Vector3(Math.sin(host.rotation), 0, Math.cos(host.rotation))
  const right = new THREE.Vector3(Math.cos(host.rotation), 0, -Math.sin(host.rotation))
  const position = new THREE.Vector3(host.position[0], local[1], host.position[2])
    .addScaledVector(right, local[0])
    .addScaledVector(forward, local[2])
  return { station, position, yaw: host.rotation + yaw, ...extra }
}

/**
 * Everywhere the cat might be found. One is picked when the module first
 * loads, and it moves on whenever a pet is one pet too many.
 */
const PERCHES: Perch[] = [
  // The right end of the desk. The left end is the photograph's now, and a cat
  // sitting in front of it hid it. 10mm clear of the mouse, 48mm of the
  // monitor, and inside the desk's right edge.
  perch('desk', [0.3, TOP.desk, -0.06], -0.45),
  // The bookcase's top shelf, the only one your books leave empty: shelves 0
  // and 1 hold three jackets each and this one carries only the stack lying
  // flat at x 0.09, which the cat clears by 40mm. Shelf to case top is 0.27,
  // so a 0.156 cat sits up in it rather than wedging.
  perch('books', [-0.08, 0.61, -0.02], 0.15),
  // The right end of the television cabinet, the only clear stretch of that
  // surface: the set runs from x -0.185 to 0.225 and the DVD cases stand at
  // -0.295. Turned back toward the middle of the room, so it sits beside a
  // television that is on rather than staring out of the screen.
  perch('films', [0.3, TOP.cabinet, 0], -0.5),
  // On the record itself, dead centre of the platter, which is the only place
  // on that turntable a cat fits: the deck's free strip is 2mm narrower than
  // the cat and the floor around it is out of shot on one screen or another.
  // Centred on the spindle means turning in place and orbiting the platter are
  // the same motion, so it simply rotates with the record.
  //
  // The tonearm passes under it rather than through it. When a clip plays the
  // needle sits 70mm out from the spindle and 14mm above the record, while the
  // cat's front paws are 29mm out and its back paws 55mm — everything of it
  // that is low is inside the needle's radius, and everything of it that
  // reaches past that radius is its head and tail, well above the arm.
  //
  // That clearance is the whole reason it does not sleep here: lying down
  // turns its 156mm height into its width, which overhangs the 82mm platter,
  // and drops its whole silhouette under the needle.
  perch('records', [-0.03, TURNTABLE_TOP, 0], 0.2, { spins: true, noSleeping: true }),
]

const START = Math.floor(Math.random() * PERCHES.length)

const drift = new THREE.Vector3()

/**
 * The room's resident. It sits perfectly still and costs nothing, waking for a
 * second or two at a time — the room renders on demand (`frameloop="demand"`),
 * and a pet that idled continuously would hold the loop open forever, which is
 * exactly the mobile cost the performance pass removed. So everything it does
 * is scheduled: a beat every few seconds while it is the thing on screen, a
 * headbutt when you click it, and otherwise nothing at all.
 *
 * Left alone it falls asleep, which is cheaper still — a held pose with the
 * mixer stopped costs less than idling does.
 */
export function Cat() {
  const focus = useFocus()
  const hovered = useHoveredStation()
  const touch = useIsTouch()
  const invalidate = useThree((state) => state.invalidate)
  const group = useRef<THREE.Group>(null)
  const [index, setIndex] = useState(START)
  const [asleep, setAsleep] = useState(false)
  const [away, setAway] = useState(false)
  const [puff, setPuff] = useState<{ key: number; at: THREE.Vector3 } | null>(null)
  const puffs = useRef(0)
  const home = PERCHES[index % PERCHES.length]!

  const gltf = useLoader(GLTFLoader, FILE)

  // Kenney's props are corner-origin and `Prop` recentres them; this one is
  // centred already but arrives at a hundred times room scale, so it gets the
  // same treatment from its own bounds: centred on its footprint, feet on the
  // ground, sized by its length.
  const fitted = useMemo(() => {
    const object = gltf.scene

    // Measured by walking down from the model rather than by reading world
    // matrices. `Box3.setFromObject` returns a box aligned to the *world* axes,
    // and pulling that back into the model's frame re-fits it a second time —
    // and a re-fitted box is always bigger. How much bigger depends on the yaw
    // it happened to be sitting at, so the cat came out at 85% of its size at
    // one perch, 89% at another and full size before it was ever parented. Its
    // size now depends on nothing but `LENGTH`.
    const box = new THREE.Box3()
    const bounds = new THREE.Box3()
    const paws = new THREE.Vector3()
    const paw = new THREE.Vector3()
    let legs = 0

    const walk = (node: THREE.Object3D, above: THREE.Matrix4) => {
      node.updateMatrix()
      const here = new THREE.Matrix4().multiplyMatrices(above, node.matrix)
      const geometry = (node as THREE.Mesh).geometry as THREE.BufferGeometry | undefined
      if (geometry) {
        if (!geometry.boundingBox) geometry.computeBoundingBox()
        // A skinned mesh's geometry bounds are its bind pose, which is the
        // whole point: the cat must not resize itself when it lies down.
        if (geometry.boundingBox) box.union(bounds.copy(geometry.boundingBox).applyMatrix4(here))
      }
      if (/^(Front|Back)Leg\.[LR]$/.test(node.name)) {
        paws.add(paw.setFromMatrixPosition(here))
        legs += 1
      }
      for (const child of node.children) walk(child, here)
    }
    // From the identity rather than the model's own matrix: everything below is
    // in the model's own frame, which is where `scale` and `offset` are applied.
    for (const child of object.children) walk(child, new THREE.Matrix4())

    const size = box.getSize(new THREE.Vector3())
    const centre = box.getCenter(new THREE.Vector3())
    const scale = LENGTH / size.z

    // Where the cat's weight actually is, which is not where its bounding box
    // is: the box is centred between the nose and the tail, and the four paws
    // sit well behind that. Turning the cat about the box centre swung its
    // paws in a circle instead of turning it on the spot, which is what left
    // it looking off-centre on the record at some angles and not others.
    //
    // The root bone and its rest position come along too. The lie-down clip
    // walks the whole armature 69mm sideways as it rolls over, which would
    // slide the cat off whatever it is lying on; holding on to where the root
    // belongs lets that be cancelled every frame. Read generically rather than
    // as a number: only three of the eight clips touch the root at all, and we
    // play one of them.
    const root = object.getObjectByName('All')

    return {
      object,
      scale,
      offset: [-centre.x * scale, -box.min.y * scale, -centre.z * scale] as [number, number, number],
      /** The middle of the paws, in the group's own space. Negative: behind. */
      pivot: legs > 0 ? (paws.z / legs - centre.z) * scale : 0,
      /** For the pointer target, which has to be reachable with a finger. */
      size: [size.x * scale, size.y * scale, size.z * scale] as [number, number, number],
      root,
      armature: root?.parent ?? null,
      rootRest: root ? root.position.clone() : null,
      head: object.getObjectByName('Head'),
    }
  }, [gltf])

  useLayoutEffect(() => {
    gltf.scene.traverse((object) => {
      const mesh = object as THREE.SkinnedMesh
      if (!mesh.isMesh) return
      mesh.castShadow = true
      mesh.receiveShadow = true
      // A skinned mesh keeps its bind-pose bounds, so an animated one gets
      // culled at the edge of the frame while it is plainly still on screen.
      mesh.frustumCulled = false
      const material = mesh.material as THREE.MeshStandardMaterial
      // Converted from FBX, so it arrives half-metal and glossy. The room is
      // flat-shaded matte throughout.
      material.metalness = 0
      material.roughness = 0.9
      if (material.map) material.map.anisotropy = 4
    })
  }, [gltf])

  const clips = useMemo(() => {
    const mixer = new THREE.AnimationMixer(gltf.scene)
    const actions = new Map<string, THREE.AnimationAction>()
    for (const clip of gltf.animations) {
      // Exported as "AnimalArmature|AnimalArmature|AnimalArmature|Idle".
      actions.set(clip.name.split('|').pop() ?? clip.name, mixer.clipAction(clip))
    }
    return { mixer, actions }
  }, [gltf])

  const idle = clips.actions.get('Idle')!
  /**
   * The lie-down. The model ships no sleep clip; this is the one the pack
   * calls `Death`, which is an animal rolling onto its side with its top two
   * legs folded in front of its chest and its tail dropping flat — a cat
   * asleep, once it stops arriving at the speed of a fall.
   */
  const settling = clips.actions.get('Death')

  /**
   * The vertices that make up the eyes, and the atlas coordinates they point
   * at while they are open. Found once, by colour and by height on the face.
   */
  const eyes = useMemo(() => {
    const skin = gltf.scene.getObjectByProperty('isMesh', true) as THREE.Mesh | undefined
    const uv = skin?.geometry.getAttribute('uv') as THREE.BufferAttribute | undefined
    const position = skin?.geometry.getAttribute('position') as THREE.BufferAttribute | undefined
    if (!uv || !position) return null
    const lids: number[] = []
    for (let i = 0; i < uv.count; i += 1) {
      if (Math.abs(uv.getX(i) - DARK_SWATCH) > 1e-3) continue
      if (position.getZ(i) < EYE_LINE) continue
      lids.push(i)
    }
    return { uv, lids, open: lids.map((i) => [uv.getX(i), uv.getY(i)] as const) }
  }, [gltf])

  /** Twice a sleep, not once a frame — this rewrites a buffer attribute. */
  const shutEyes = (closed: boolean) => {
    if (!eyes) return
    eyes.lids.forEach((vertex, n) => {
      const [u, v] = closed ? FUR_SWATCH : eyes.open[n]!
      eyes.uv.setXY(vertex, u, v)
    })
    eyes.uv.needsUpdate = true
    invalidate()
  }

  /** Animation seconds, which only advance while something is playing — real
   *  time is useless here, since the loop sleeps for minutes at a stretch. */
  const clock = useRef(0)
  /** Until when the mixer must keep being updated. */
  const until = useRef(0)
  /** When to blend back to the resting idle. */
  const resume = useRef(0)
  const playing = useRef<THREE.AnimationAction | null>(null)
  const lift = useRef(0)
  /** Beats since anyone last touched it. */
  const beats = useRef(0)
  /** Set for the length of a leaving, when clicks should do nothing. */
  const leaving = useRef(false)

  const timers = useRef<ReturnType<typeof setTimeout>[]>([])
  const later = (ms: number, run: () => void) => {
    timers.current.push(setTimeout(run, ms))
  }
  useEffect(
    () => () => {
      for (const timer of timers.current) clearTimeout(timer)
      timers.current = []
    },
    [],
  )

  const fadeTo = (action: THREE.AnimationAction | undefined, seconds = 0.25) => {
    if (!action || action === playing.current) return
    action.reset()
    action.enabled = true
    action.fadeIn(seconds)
    action.play()
    playing.current?.fadeOut(seconds)
    playing.current = action
  }

  const run = (seconds: number) => {
    until.current = Math.max(until.current, clock.current + seconds)
    invalidate()
  }

  const busy = () => until.current > clock.current

  /** A clip that plays once and hands back to the idle. */
  const beat = (name: string) => {
    const action = clips.actions.get(name)
    if (!action) return
    action.setLoop(THREE.LoopOnce, 1)
    action.clampWhenFinished = true
    fadeTo(action)
    resume.current = clock.current + action.getClip().duration
    run(action.getClip().duration + 0.5)
  }

  // The resting pose. Held at a random point in the idle so the cat is not
  // caught mid-stretch on arrival, and left frozen there between beats: with
  // the mixer stopped the skeleton simply stays put, which is what makes doing
  // nothing genuinely free.
  useLayoutEffect(() => {
    idle.setLoop(THREE.LoopRepeat, Infinity)
    idle.time = Math.random() * idle.getClip().duration
    idle.play()
    playing.current = idle
    clips.mixer.update(0)
    return () => {
      clips.mixer.stopAllAction()
    }
  }, [clips, idle])

  /** Lies down and stays there. Nothing is scheduled after this. */
  const settle = () => {
    if (!settling) return
    settling.setLoop(THREE.LoopOnce, 1)
    settling.clampWhenFinished = true
    settling.timeScale = SETTLE_SPEED
    resume.current = 0
    fadeTo(settling, 0.4)
    shutEyes(true)
    setAsleep(true)
    // A shade past the end of the clip, so the last of the fade lands while
    // the mixer is still running: once it stops, whatever pose the skeleton
    // last held is the one it keeps.
    run(settling.getClip().duration / SETTLE_SPEED + 0.4)
  }

  /** Gets up. The mixer slerps the bones upright, which reads as a stretch. */
  const wake = () => {
    resume.current = 0
    idle.setLoop(THREE.LoopRepeat, Infinity)
    fadeTo(idle, 0.6)
    shutEyes(false)
    beats.current = 0
    setAsleep(false)
    run(1.8)
  }

  const smoke = (at: THREE.Vector3) => {
    puffs.current += 1
    setPuff({ key: puffs.current, at: at.clone().setY(at.y + fitted.size[1] * 0.45) })
    invalidate()
  }

  /** Petted once too often: a puff of smoke, and it turns up somewhere else. */
  const leave = () => {
    leaving.current = true
    const from = group.current ? group.current.position.clone() : home.position.clone()
    later(PUFF_AT, () => smoke(from))
    later(VANISH_AT, () => {
      setAway(true)
      document.body.style.cursor = 'auto'
      invalidate()
    })
    later(ARRIVE_AT, () => {
      // Anywhere but here — half the point is that it is somewhere new.
      const step = 1 + Math.floor(Math.random() * (PERCHES.length - 1))
      const next = (index + step) % PERCHES.length
      const spot = PERCHES[next]!
      if (group.current) {
        group.current.position.copy(spot.position)
        group.current.rotation.y = spot.yaw
      }
      setIndex(next)
      setAway(false)
      leaving.current = false
      smoke(spot.position)
    })
  }

  const click = () => {
    if (leaving.current || away) return
    if (asleep) {
      wake()
      return
    }
    if (busy()) return
    beats.current = 0
    beat('Headbutt')
    if (Math.random() >= LEAVE_ODDS) return
    const clip = clips.actions.get('Headbutt')?.getClip().duration ?? 0.625
    later(clip * 1000, leave)
  }

  // Is it in the frame anyone is looking at? Off-frame it does nothing at all.
  const watched = focus === null ? !touch : focus === home.station

  useEffect(() => {
    // Asleep there is nothing to schedule, which is the cheapest the cat ever
    // gets: no timer, no mixer, no frames.
    if (!watched || asleep) return
    let timer: ReturnType<typeof setTimeout>
    const next = () => {
      beats.current += 1
      if (beats.current > DROWSY && !home.noSleeping) {
        settle()
        return
      }
      // Most of the time it simply breathes for a moment; the rest it does
      // something you might notice. The headbutt is not in here — it belongs to
      // the click, and a cat that does it unprompted makes petting feel like
      // nothing happened.
      if (Math.random() < 0.7) run(1.6 + Math.random() * 1.8)
      else beat('Idle_Eating')
      timer = setTimeout(next, BEAT_MIN + Math.random() * BEAT_SPREAD)
    }
    timer = setTimeout(next, BEAT_MIN + Math.random() * BEAT_SPREAD)
    return () => clearTimeout(timer)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [watched, asleep, index])

  useFrame((state, delta) => {
    const node = group.current
    if (!node) return
    const dt = Math.min(delta, 1 / 30)
    let moving = false

    if (busy()) {
      clock.current += dt
      if (resume.current && clock.current >= resume.current) {
        resume.current = 0
        idle.setLoop(THREE.LoopRepeat, Infinity)
        fadeTo(idle, 0.3)
      }
      clips.mixer.update(dt)
      moving = true
    }

    // The lie-down walks the whole armature sideways as it rolls. Undoing it
    // turns that into a roll on the spot, so the cat stays on whatever it went
    // to sleep on. Every frame rather than only the ones the mixer wrote: this
    // is an absolute correction, not a cumulative one, and a re-render while
    // the cat is asleep puts `offset` back on the primitive declaratively.
    const { root, rootRest, armature, offset } = fitted
    if (root && rootRest && armature) {
      drift
        .copy(root.position)
        .sub(rootRest)
        .applyQuaternion(armature.quaternion)
        .multiplyScalar(armature.scale.x * fitted.scale)
      fitted.object.position.set(offset[0] - drift.x, offset[1] - drift.y, offset[2] - drift.z)
    }

    // The furniture lifts on hover and the cat is not parented to it, so it
    // has to rise by the same amount or get swallowed by the surface.
    const goal = hovered === home.station && focus === null ? LIFT : 0
    const raised = ease(lift.current, goal, approach(9, dt))
    lift.current = raised.value
    moving = moving || raised.moving
    node.position.set(home.position.x, home.position.y + lift.current, home.position.z)

    // Turning with the record. The perch is the spindle, so the group is
    // pushed off it by however far the paws sit behind the origin — which
    // leaves the paws exactly on the spindle at every angle, and the cat
    // turning on the spot rather than orbiting.
    //
    // The turntable is already asking for frames for as long as the clip runs,
    // so this rides along on those and never asks for one of its own.
    if (home.spins) {
      const angle = home.yaw + platter.spin
      node.rotation.y = angle
      node.position.x -= Math.sin(angle) * fitted.pivot
      node.position.z -= Math.cos(angle) * fitted.pivot
    }

    if (moving) state.invalidate()
  })

  const [width, height, depth] = fitted.size

  return (
    <>
      <group
        ref={group}
        position={home.position}
        rotation={[0, home.yaw, 0]}
        visible={!away}
        onPointerOver={(event) => {
          event.stopPropagation()
          document.body.style.cursor = 'pointer'
        }}
        onPointerOut={() => {
          document.body.style.cursor = 'auto'
        }}
        onClick={(event) => {
          event.stopPropagation()
          click()
        }}
      >
        {/* Its own pointer target. A cat is 18cm of room and awkward to hit with
            a finger, so this is a zero-opacity box a shade wider than it is.
            Unmounted rather than merely hidden while the cat is away: three
            raycasts invisible objects quite happily, and an empty perch that
            still shows a pointer cursor and swallows clicks is worse than no
            perch at all. */}
        {!away && (
          <mesh position={[0, height / 2, 0]}>
            <boxGeometry args={[width + 0.04, height, depth]} />
            <meshBasicMaterial transparent opacity={0} depthWrite={false} />
          </mesh>
        )}

        <primitive object={fitted.object} scale={fitted.scale} position={fitted.offset} />
      </group>

      {/* Outside the group on purpose: the cat moves, the smoke it left does
          not. A new key remounts rather than resets. */}
      {puff && (
        <Puff key={puff.key} position={puff.at} onDone={() => setPuff(null)} />
      )}

      {/* Also outside it, so the Zs stay upright while the cat lies on its
          side. Mounted only while the sleeping cat is actually in the frame
          you are looking at — this is the room's one continuous animation, and
          off-screen it should cost nothing. */}
      {asleep && watched && !away && fitted.head && <Zzz anchor={fitted.head} />}
    </>
  )
}

useLoader.preload(GLTFLoader, FILE)
