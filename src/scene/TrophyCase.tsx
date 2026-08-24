import { useEffect, useRef, useState } from 'react'
import * as THREE from 'three'
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js'
import { clearHovered, setHovered, type Credit } from './credit'
import { stationById, useFocus } from './focus'
import { KENNEY_MATERIALS, palette } from './palette'
import { Puff } from './Puff'
import { Station } from './Station'
import { TROPHIES, useTrophies, type TrophyId } from './trophies'

/**
 * The case. Built from primitives like the turntable and the picture frame —
 * the furniture kit has no display cabinet — and merged into one geometry,
 * since none of it ever moves relative to the rest.
 */
const CASE = {
  width: 0.42,
  depth: 0.18,
  /** Solid up to here; the shelves start above it. */
  plinth: 0.3,
  /** Clear height of one shelf. */
  shelf: 0.145,
  board: 0.014,
  side: 0.016,
}
/** The two surfaces things stand on. */
const SHELVES = [CASE.plinth, CASE.plinth + CASE.shelf + CASE.board]
/** Three slots to a shelf, a little forward of the back panel. */
const SLOTS = [-0.13, 0, 0.13]
const SLOT_Z = 0.01

type Part = {
  geometry: THREE.BufferGeometry
  position?: [number, number, number]
  rotation?: [number, number, number]
}

/**
 * Bakes a handful of primitives into a single geometry. Every trophy is three
 * or four boxes and cones that are rigidly attached to each other, so there is
 * no reason for any of them to be its own draw call — and one geometry means
 * earning a trophy is a single material swap.
 */
function merge(parts: Part[]) {
  const matrix = new THREE.Matrix4()
  const euler = new THREE.Euler()
  const shaped = parts.map(({ geometry, position, rotation }) => {
    const copy = geometry.clone()
    euler.set(...(rotation ?? [0, 0, 0]))
    matrix.compose(
      new THREE.Vector3(...(position ?? [0, 0, 0])),
      new THREE.Quaternion().setFromEuler(euler),
      new THREE.Vector3(1, 1, 1),
    )
    copy.applyMatrix4(matrix)
    return copy
  })
  // `false`: one group rather than one per source, so the result takes a
  // single material.
  const merged = mergeGeometries(shaped, false)
  for (const copy of shaped) copy.dispose()
  return merged
}

const box = (w: number, h: number, d: number) => new THREE.BoxGeometry(w, h, d)

const caseGeometry = merge([
  { geometry: box(CASE.width, CASE.plinth, CASE.depth), position: [0, CASE.plinth / 2, 0] },
  // Something for the trophies to read against, rather than the room behind.
  {
    geometry: box(CASE.width, CASE.shelf * 2 + CASE.board + CASE.side, 0.012),
    position: [0, 0.459, -CASE.depth / 2 + 0.006],
  },
  { geometry: box(CASE.side, 0.318, CASE.depth), position: [-0.202, 0.459, 0] },
  { geometry: box(CASE.side, 0.318, CASE.depth), position: [0.202, 0.459, 0] },
  { geometry: box(CASE.width, CASE.board, CASE.depth), position: [0, SHELVES[1]! - CASE.board / 2, 0] },
  { geometry: box(CASE.width, CASE.side, CASE.depth), position: [0, 0.61, 0] },
])

/**
 * The six of them, each standing on its own origin so it can be dropped
 * straight onto a shelf. None is taller than 80mm or wider than 60mm, which is
 * what the 143mm of clearance between the boards allows.
 */
const SHAPES: Record<TrophyId, THREE.BufferGeometry> = {
  // A book, leaning the way one does.
  books: merge([{ geometry: box(0.042, 0.06, 0.014), position: [0, 0.03, 0] }]),
  // A clapperboard, its arm up.
  films: merge([
    { geometry: box(0.056, 0.042, 0.008), position: [0, 0.021, 0] },
    { geometry: box(0.056, 0.01, 0.008), position: [0.004, 0.05, 0], rotation: [0, 0, 0.3] },
  ]),
  // A record stood upright in a block, with a raised hub.
  records: merge([
    { geometry: box(0.034, 0.014, 0.02), position: [0, 0.007, 0] },
    {
      geometry: new THREE.CylinderGeometry(0.032, 0.032, 0.005, 32),
      position: [0, 0.046, 0],
      rotation: [Math.PI / 2, 0, 0],
    },
    {
      geometry: new THREE.CylinderGeometry(0.01, 0.01, 0.007, 16),
      position: [0, 0.046, 0],
      rotation: [Math.PI / 2, 0, 0],
    },
  ]),
  // A cat's head on a short neck. Four-sided cones for ears, so they read as
  // low-poly rather than smooth, like everything else in the room.
  cat: merge([
    { geometry: new THREE.CylinderGeometry(0.016, 0.02, 0.012, 8), position: [0, 0.006, 0] },
    { geometry: box(0.042, 0.038, 0.036), position: [0, 0.031, 0] },
    {
      geometry: new THREE.ConeGeometry(0.011, 0.02, 4),
      position: [-0.013, 0.06, 0],
      rotation: [0, Math.PI / 4, 0],
    },
    {
      geometry: new THREE.ConeGeometry(0.011, 0.02, 4),
      position: [0.013, 0.06, 0],
      rotation: [0, Math.PI / 4, 0],
    },
    { geometry: box(0.016, 0.011, 0.008), position: [0, 0.024, 0.022] },
  ]),
  // A spinning top. Tilted at the group below rather than here, so its point
  // stays on the shelf.
  chair: merge([
    {
      geometry: new THREE.ConeGeometry(0.026, 0.038, 12),
      position: [0, 0.019, 0],
      rotation: [Math.PI, 0, 0],
    },
    { geometry: new THREE.CylinderGeometry(0.005, 0.005, 0.018, 8), position: [0, 0.047, 0] },
  ]),
  // A bulb, turned on a lathe rather than assembled: a sphere stuck on a peg
  // reads as a sphere stuck on a peg, and the whole silhouette of a bulb is
  // the neck between the glass and the base. Revolving a profile gets all of
  // it — envelope, pinch, flare, screw base — out of one geometry.
  night: merge([
    {
      geometry: new THREE.LatheGeometry(
        [
          [0, 0],
          [0.009, 0],
          [0.009, 0.013],
          [0.011, 0.017],
          [0.008, 0.023],
          [0.015, 0.031],
          [0.021, 0.043],
          [0.019, 0.055],
          [0.012, 0.065],
          [0, 0.07],
        ].map(([x, y]) => new THREE.Vector2(x, y)),
        16,
      ),
    },
  ]),
}

/** Where a trophy stands, and where its smoke blooms from. */
function slot(index: number): [number, number, number] {
  return [SLOTS[index % SLOTS.length]!, SHELVES[Math.floor(index / SLOTS.length)]!, SLOT_Z]
}

/**
 * The cat's smoke, cut down. Its defaults envelop a 155mm cat and would burst
 * out of the case around a 60mm trophy.
 */
const PUFF_SCALE = 0.42
/** Roughly the middle of a trophy, so the cloud is centred on it. */
const PUFF_LIFT = 0.032

/** How each one is set down, beyond the slot it stands in. */
const POSE: Partial<Record<TrophyId, [number, number, number]>> = {
  books: [0, 0.25, 0.05],
  chair: [0, 0, 0.18],
  cat: [0, -0.12, 0],
}

/**
 * The pointer target, shared by all six and only rendered while the case is
 * focused. A trophy is 60mm of room and impossible to hit otherwise, but six
 * zero-opacity boxes are six real draw calls the rest of the time — and the
 * raycaster ignores neither.
 */
const targetGeometry = new THREE.BoxGeometry(0.1, 0.12, 0.09)

const woodMaterial = new THREE.MeshStandardMaterial({
  color: new THREE.Color(KENNEY_MATERIALS.wood),
  roughness: 0.9,
  metalness: 0,
})

/**
 * The gold is not a metal: `metalness: 1` takes nearly all of its colour from
 * an environment map, and this room deliberately has none, so a real metal
 * would render close to black. A warm colour with a little emissive behind it
 * does the job under the room's own lights and still reads as gold once the
 * lamp is the only thing lit.
 */
const goldMaterial = new THREE.MeshStandardMaterial({
  color: new THREE.Color(palette.gold),
  roughness: 0.35,
  metalness: 0,
  emissive: new THREE.Color(palette.gold),
  emissiveIntensity: 0.22,
})

/**
 * Built once and reused, because the panel compares by identity when a hover
 * ends.
 */
const CREDITS = new Map<TrophyId, Credit>()
function credit(id: TrophyId, name: string, hint: string): Credit {
  let existing = CREDITS.get(id)
  if (!existing) {
    existing = { title: name, subtitle: hint }
    CREDITS.set(id, existing)
  }
  return existing
}

/**
 * A record of everything worth doing in this room. Nothing is on the shelves
 * until you have earned it, so the case starts empty and gives nothing away —
 * it fills up as you go, and what is missing is missing rather than greyed out.
 */
export function TrophyCase() {
  const station = stationById('trophies')
  const focused = useFocus() === 'trophies'
  const earned = useTrophies()
  /** What was on the shelves last time, so a new arrival can be spotted. */
  const before = useRef<Set<TrophyId> | null>(null)
  const [arriving, setArriving] = useState<{ key: number; at: THREE.Vector3 }[]>([])
  const clouds = useRef(0)

  useEffect(() => {
    const previous = before.current
    before.current = earned
    // Nothing puffs on the first render: trophies restored from a previous
    // visit are simply already there, and should not all detonate at once.
    if (!previous) return
    const landed = TROPHIES.map((trophy, index) => ({ trophy, index })).filter(
      ({ trophy }) => earned.has(trophy.id) && !previous.has(trophy.id),
    )
    if (landed.length === 0) return
    setArriving((current) => [
      ...current,
      ...landed.map(({ index }) => {
        const [x, y, z] = slot(index)
        clouds.current += 1
        return { key: clouds.current, at: new THREE.Vector3(x, y + PUFF_LIFT, z) }
      }),
    ])
  }, [earned])

  return (
    <Station station={station}>
      <mesh geometry={caseGeometry} material={woodMaterial} castShadow receiveShadow />

      {TROPHIES.map((trophy, index) => {
        // Unearned trophies are not on the shelf at all. Each keeps its slot,
        // so the ones you do have never shuffle around as the case fills.
        if (!earned.has(trophy.id)) return null
        const place = slot(index)
        const card = credit(trophy.id, trophy.name, trophy.hint)

        return (
          <group
            key={trophy.id}
            position={place}
            rotation={POSE[trophy.id] ?? [0, 0, 0]}
            onPointerOver={(event) => {
              if (!focused) return
              event.stopPropagation()
              setHovered(card)
            }}
            onPointerOut={() => clearHovered(card)}
            onClick={(event) => {
              // Swallowed once the case is focused: the shiny things are the
              // ones you reach for, and a click on the station behind them
              // would fly the camera straight back out again.
              if (focused) event.stopPropagation()
            }}
          >
            <mesh geometry={SHAPES[trophy.id]} material={goldMaterial} castShadow />
            {focused && (
              <mesh geometry={targetGeometry} position={[0, 0.055, 0]}>
                <meshBasicMaterial transparent opacity={0} depthWrite={false} />
              </mesh>
            )}
          </group>
        )
      })}

      {/* The same smoke the cat leaves in, at a third the size. It blooms as
          the trophy appears rather than before it, which is how the cat's
          arrival works too. Mounted here rather than at room level because
          these coordinates are the station's own. */}
      {arriving.map(({ key, at }) => (
        <Puff
          key={key}
          position={at}
          scale={PUFF_SCALE}
          onDone={() => setArriving((current) => current.filter((cloud) => cloud.key !== key))}
        />
      ))}
    </Station>
  )
}
