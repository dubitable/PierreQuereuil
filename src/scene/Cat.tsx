import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { useFrame, useLoader, useThree } from '@react-three/fiber'
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js'
import * as THREE from 'three'
import { stationById, useFocus, type StationId } from './focus'
import { useHoveredStation } from './hovered'
import { useIsTouch } from './useIsTouch'
import { platter } from './turntable'
import { approach, ease } from './Pieces'
import { TOP } from './useProp'

const FILE = '/models/cat.glb'

/**
 * Nose to tail-base, in room units — the one number to turn if the cat reads
 * too big or too small. The model measures 2.159 along its own length axis in
 * bind pose, but the scale is derived from its bounding box at load rather
 * than hard-coded, so this stays the size whatever model is behind it.
 */
const LENGTH = 0.18

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

type Perch = {
  station: StationId
  position: THREE.Vector3
  /** World yaw, radians. */
  yaw: number
  /** Turns with the record. Only the one on the platter does. */
  spins?: boolean
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
  spins = false,
): Perch {
  const host = stationById(station)
  const forward = new THREE.Vector3(Math.sin(host.rotation), 0, Math.cos(host.rotation))
  const right = new THREE.Vector3(Math.cos(host.rotation), 0, -Math.sin(host.rotation))
  const position = new THREE.Vector3(host.position[0], local[1], host.position[2])
    .addScaledVector(right, local[0])
    .addScaledVector(forward, local[2])
  return { station, position, yaw: host.rotation + yaw, spins }
}

/**
 * Everywhere the cat might be found. One is picked when the module first
 * loads, so it stays put for the visit and is somewhere else on the next one.
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
  perch('records', [-0.03, TURNTABLE_TOP, 0], 0.2, true),
]

const START = Math.floor(Math.random() * PERCHES.length)

/**
 * The room's resident. It sits perfectly still and costs nothing, waking for a
 * second or two at a time — the room renders on demand (`frameloop="demand"`),
 * and a pet that idled continuously would hold the loop open forever, which is
 * exactly the mobile cost the performance pass removed. So its movement is
 * scheduled: a beat every few seconds while the desk is the thing on screen,
 * and a headbutt when you click it. Nothing at all the rest of the time.
 */
export function Cat() {
  const focus = useFocus()
  const hovered = useHoveredStation()
  const touch = useIsTouch()
  const invalidate = useThree((state) => state.invalidate)
  const group = useRef<THREE.Group>(null)
  // Debugging: clicking the cat steps to the next perch, so all four can be
  // looked at without reloading. Where it starts is still the random pick.
  const [index, setIndex] = useState(START)
  const home = PERCHES[index % PERCHES.length]!

  const gltf = useLoader(GLTFLoader, FILE)

  // Kenney's props are corner-origin and `Prop` recentres them; this one is
  // centred already but arrives at a hundred times room scale, so it gets the
  // same treatment from its own bounding box: centred on its footprint, feet
  // on the ground, sized by its length.
  const fitted = useMemo(() => {
    const object = gltf.scene
    object.updateMatrixWorld(true)
    // Measured in the model's own frame rather than the world's: on a remount
    // this object is already parented to the group below, and its world matrix
    // would then fold in the very transform being computed here.
    const toLocal = new THREE.Matrix4().copy(object.matrixWorld).invert()
    const box = new THREE.Box3().setFromObject(object).applyMatrix4(toLocal)
    const size = box.getSize(new THREE.Vector3())
    const centre = box.getCenter(new THREE.Vector3())
    const scale = LENGTH / size.z

    // Where the cat's weight actually is, which is not where its bounding box
    // is: the box is centred between the nose and the tail, and the four paws
    // sit well behind that. Turning the cat about the box centre swung its
    // paws in a circle instead of turning it on the spot, which is what left
    // it looking off-centre on the record at some angles and not others.
    const paw = new THREE.Vector3()
    const paws = new THREE.Vector3()
    let legs = 0
    object.traverse((node) => {
      if (!/^(Front|Back)Leg\.[LR]$/.test(node.name)) return
      paws.add(paw.setFromMatrixPosition(node.matrixWorld).applyMatrix4(toLocal))
      legs += 1
    })

    return {
      object,
      scale,
      offset: [-centre.x * scale, -box.min.y * scale, -centre.z * scale] as [number, number, number],
      /** The middle of the paws, in the group's own space. Negative: behind. */
      pivot: legs > 0 ? (paws.z / legs - centre.z) * scale : 0,
      /** For the pointer target, which has to be reachable with a finger. */
      size: [size.x * scale, size.y * scale, size.z * scale] as [number, number, number],
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

  /** Animation seconds, which only advance while something is playing — real
   *  time is useless here, since the loop sleeps for minutes at a stretch. */
  const clock = useRef(0)
  /** Until when the mixer must keep being updated. */
  const until = useRef(0)
  /** When to blend back to the resting idle. */
  const resume = useRef(0)
  const playing = useRef<THREE.AnimationAction | null>(null)
  const lift = useRef(0)

  const idle = clips.actions.get('Idle')!

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

  // Is it in the frame anyone is looking at? Off-frame it does nothing at all.
  const watched = focus === null ? !touch : focus === home.station

  useEffect(() => {
    if (!watched) return
    let timer: ReturnType<typeof setTimeout>
    const next = () => {
      const roll = Math.random()
      // Half the time it simply breathes for a moment; the rest it does
      // something you might notice.
      if (roll < 0.5) run(1.6 + Math.random() * 1.8)
      else if (roll < 0.8) beat('Headbutt')
      else beat('Idle_Eating')
      timer = setTimeout(next, BEAT_MIN + Math.random() * BEAT_SPREAD)
    }
    timer = setTimeout(next, BEAT_MIN + Math.random() * BEAT_SPREAD)
    return () => clearTimeout(timer)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [watched])

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
    <group
      ref={group}
      position={home.position}
      rotation={[0, home.yaw, 0]}
      onPointerOver={(event) => {
        event.stopPropagation()
        document.body.style.cursor = 'pointer'
      }}
      onPointerOut={() => {
        document.body.style.cursor = 'auto'
      }}
      onClick={(event) => {
        event.stopPropagation()
        // Debugging: hop to the next perch. Swap this back to
        // `if (busy()) return; beat('Headbutt')` to make clicking pet it again.
        const next = (index + 1) % PERCHES.length
        const spot = PERCHES[next]!
        if (group.current) group.current.rotation.y = spot.yaw
        setIndex(next)
      }}
    >
      {/* Its own pointer target. A cat is 18cm of room and awkward to hit with
          a finger, and the raycaster skips invisible meshes, so this is a
          zero-opacity box rather than `visible={false}`. */}
      <mesh position={[0, height / 2, 0]}>
        <boxGeometry args={[width + 0.04, height, depth]} />
        <meshBasicMaterial transparent opacity={0} depthWrite={false} />
      </mesh>

      <primitive object={fitted.object} scale={fitted.scale} position={fitted.offset} />
    </group>
  )
}

useLoader.preload(GLTFLoader, FILE)
