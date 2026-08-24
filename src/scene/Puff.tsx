import { useLayoutEffect, useMemo, useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import * as THREE from 'three'
import { palette } from './palette'

/** Blobs in a puff. Seven reads as a cloud; more just costs fill rate. */
const BLOBS = 7
/** How long the whole thing lasts, in seconds. */
const LIFE = 0.62
/** How far the blobs travel out from the centre, in room units. */
const SPREAD = 0.085
/** And how far the cloud drifts upward over its life. */
const RISE = 0.035
/** Radius of one blob at full size. A cat is 0.18 long and 0.156 tall. */
const BLOB = 0.05

const dummy = new THREE.Object3D()

/**
 * The cat leaving. Seven low-poly blobs that bloom out of a point, drift up and
 * fade — built from primitives and lit by the room like everything else, so it
 * darkens after dark instead of hanging there glowing.
 *
 * It is mounted only while it is playing: `Cat` renders it on a rising key so a
 * new puff remounts rather than resetting, and drops it on `onDone`. Between
 * puffs there is no mesh, no material and no draw call — which is what lets the
 * room go back to sleep under `frameloop="demand"`.
 */
export function Puff({
  position,
  onDone,
}: {
  /** Where it blooms from, in world space. */
  position: THREE.Vector3
  onDone: () => void
}) {
  const mesh = useRef<THREE.InstancedMesh>(null)
  const material = useRef<THREE.MeshStandardMaterial>(null)
  const age = useRef(0)
  const spent = useRef(false)

  // Fixed at mount: a sphere of directions squashed vertically and pushed
  // upward, so the cloud spreads sideways more than it climbs.
  const blobs = useMemo(() => {
    const golden = Math.PI * (3 - Math.sqrt(5))
    return Array.from({ length: BLOBS }, (_, i) => {
      const y = 1 - (i / (BLOBS - 1)) * 2
      const ring = Math.sqrt(Math.max(0, 1 - y * y))
      const theta = golden * i
      return {
        direction: new THREE.Vector3(
          Math.cos(theta) * ring,
          y * 0.5 + 0.4,
          Math.sin(theta) * ring,
        ).normalize(),
        // Uneven sizes and starting tilts, so seven copies of one icosahedron
        // do not read as seven copies of one icosahedron.
        size: 0.7 + Math.random() * 0.6,
        tilt: new THREE.Euler(Math.random() * Math.PI, Math.random() * Math.PI, 0),
      }
    })
  }, [])

  const layout = (t: number) => {
    const node = mesh.current
    if (!node) return
    // Out fast, then coasting — smoke has no second wind.
    const travel = 1 - (1 - t) * (1 - t)
    // Grows as it spreads and collapses at the end, so it thins out rather
    // than simply becoming a transparent cloud of the same size.
    const swell = (0.35 + 0.9 * travel) * (1 - t * t)
    for (let i = 0; i < BLOBS; i += 1) {
      const blob = blobs[i]!
      dummy.position
        .copy(blob.direction)
        .multiplyScalar(SPREAD * travel)
        .setY(blob.direction.y * SPREAD * travel + RISE * travel)
      dummy.rotation.set(blob.tilt.x, blob.tilt.y + travel * 0.7, blob.tilt.z)
      // Never exactly zero: a zero-scale instance is a degenerate matrix.
      dummy.scale.setScalar(Math.max(BLOB * blob.size * swell, 1e-4))
      dummy.updateMatrix()
      node.setMatrixAt(i, dummy.matrix)
    }
    node.instanceMatrix.needsUpdate = true
    if (material.current) material.current.opacity = 1 - t * t
  }

  // Instance matrices start as the identity, which would put seven unit-radius
  // blobs at the origin for one frame.
  useLayoutEffect(() => layout(0), [])

  useFrame((state, delta) => {
    if (spent.current) return
    age.current += Math.min(delta, 1 / 30)
    const t = Math.min(age.current / LIFE, 1)
    layout(t)
    if (t >= 1) {
      spent.current = true
      onDone()
      return
    }
    state.invalidate()
  })

  return (
    <instancedMesh
      ref={mesh}
      args={[undefined, undefined, BLOBS]}
      position={position}
      // The blobs move well outside the bounds three computes from the geometry
      // it was handed, and a puff culled halfway through is worse than a puff.
      frustumCulled={false}
    >
      <icosahedronGeometry args={[1, 0]} />
      <meshStandardMaterial
        ref={material}
        color={palette.smoke}
        flatShading
        roughness={1}
        metalness={0}
        transparent
        // Seven overlapping blobs sorted against each other punches holes in
        // the cloud; without depth writes they simply blend.
        depthWrite={false}
      />
    </instancedMesh>
  )
}
