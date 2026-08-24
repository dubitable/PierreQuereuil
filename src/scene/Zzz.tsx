import { useMemo, useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import * as THREE from 'three'
import { palette } from './palette'

/** Zs in the air at once. */
const COUNT = 3
/** How long one Z takes to rise and fade, in seconds. */
const PERIOD = 2.4
/** How far it climbs over that, in room units. */
const RISE = 0.1
/** And how far it wanders sideways. */
const DRIFT = 0.035
/** A Z at full size. The cat it comes out of is 0.18 long. */
const SIZE = 0.03
/** Clearance above whatever it is anchored to. */
const GAP = 0.035

const base = new THREE.Vector3()
const right = new THREE.Vector3()

/**
 * One Z, drawn as three flat bars rather than text: no font to load, no SDF
 * shader, and at 30mm on screen a glyph would be indistinguishable from this
 * anyway. Built once and shared by every Z in the air.
 */
function zGeometry() {
  const bar = (
    cx: number,
    cy: number,
    length: number,
    thickness: number,
    angle: number,
  ) => {
    const cos = Math.cos(angle)
    const sin = Math.sin(angle)
    const hx = length / 2
    const hy = thickness / 2
    // The four corners, rotated about the bar's own centre.
    const corner = (sx: number, sy: number) => [
      cx + sx * hx * cos - sy * hy * sin,
      cy + sx * hx * sin + sy * hy * cos,
      0,
    ]
    const a = corner(-1, -1)
    const b = corner(1, -1)
    const c = corner(1, 1)
    const d = corner(-1, 1)
    return [...a, ...b, ...c, ...a, ...c, ...d]
  }

  const geometry = new THREE.BufferGeometry()
  geometry.setAttribute(
    'position',
    new THREE.Float32BufferAttribute(
      [
        ...bar(0, 0.39, 0.9, 0.18, 0),
        ...bar(0, -0.39, 0.9, 0.18, 0),
        // Corner to corner, so it meets both bars at their ends.
        ...bar(0, 0, Math.hypot(0.9, 0.6), 0.18, Math.atan2(0.6, 0.9)),
      ],
      3,
    ),
  )
  return geometry
}

/**
 * The cat, asleep. Zs rise from its head one after another, each fading as it
 * climbs, all of them turned to face the camera.
 *
 * This is the one thing in the room that runs continuously, so it is kept on a
 * short leash: it only exists while the cat is both asleep *and* in the frame
 * you are looking at, and it unmounts the moment either stops being true —
 * which puts the render loop straight back to sleep. Three meshes, one
 * geometry, no texture.
 */
export function Zzz({ anchor }: { anchor: THREE.Object3D }) {
  const slots = useRef<(THREE.Mesh | null)[]>([])
  const time = useRef(0)
  const geometry = useMemo(zGeometry, [])
  // One material each, because each Z is at a different point in its own fade.
  const materials = useMemo(
    () =>
      Array.from(
        { length: COUNT },
        () =>
          new THREE.MeshBasicMaterial({
            color: palette.inkSoft,
            transparent: true,
            opacity: 0,
            depthWrite: false,
          }),
      ),
    [],
  )

  useFrame((state, delta) => {
    time.current += Math.min(delta, 1 / 30)
    anchor.getWorldPosition(base)
    // Sideways means sideways *on screen*: the cat sleeps at whatever angle it
    // happens to be lying, and Zs that drifted along its own axis would head
    // straight into the camera at some perches.
    right.setFromMatrixColumn(state.camera.matrixWorld, 0)

    for (let i = 0; i < COUNT; i += 1) {
      const mesh = slots.current[i]
      const material = materials[i]
      if (!mesh || !material) continue
      // Evenly spaced around one cycle, so a Z leaves every PERIOD/COUNT.
      const t = ((time.current / PERIOD) + i / COUNT) % 1
      const sway = DRIFT * t + Math.sin(t * 5.5) * 0.006
      mesh.position
        .copy(base)
        .addScaledVector(right, sway)
        .setY(base.y + GAP + RISE * t)
      mesh.scale.setScalar(SIZE * (0.55 + 0.75 * t))
      mesh.quaternion.copy(state.camera.quaternion)
      // In quickly, out over the whole climb.
      material.opacity = Math.min(t / 0.15, 1) * (1 - t) * (1 - t)
    }
    state.invalidate()
  })

  return (
    <>
      {materials.map((material, i) => (
        <mesh
          key={i}
          ref={(node) => {
            slots.current[i] = node
          }}
          geometry={geometry}
          material={material}
          frustumCulled={false}
        />
      ))}
    </>
  )
}
