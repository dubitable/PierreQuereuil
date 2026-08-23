import { useMemo } from 'react'
import { useLoader } from '@react-three/fiber'
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js'
import type { ThreeElements } from '@react-three/fiber'
import * as THREE from 'three'
import { KENNEY_MATERIALS } from './palette'

/**
 * Materials are cached by source name so every prop that uses `wood` shares one
 * material instance — consistent colour, fewer draw calls.
 */
const themed = new Map<string, THREE.MeshStandardMaterial>()

export type MaterialOverrides = Record<string, string>

function themedMaterial(source: THREE.Material, overrides?: MaterialOverrides): THREE.Material {
  const name = source.name
  const hex = overrides?.[name] ?? KENNEY_MATERIALS[name]
  if (!hex) return source
  // Keyed by colour as well as name, so overridden props get their own
  // material while everything else keeps sharing one.
  const key = `${name}|${hex}`
  let material = themed.get(key)
  if (!material) {
    material = new THREE.MeshStandardMaterial({
      color: new THREE.Color(hex),
      roughness: name === 'metal' || name === 'metalDark' ? 0.55 : 0.9,
      metalness: 0,
      // The lampshade reads as lit rather than merely pale.
      emissive: new THREE.Color(name === 'lamp' ? '#ffe9b0' : '#000000'),
      emissiveIntensity: name === 'lamp' ? 0.55 : 0,
    })
    material.name = name
    themed.set(key, material)
  }
  return material
}

/** Loads a Kenney `.glb`, recolours it, and returns a clonable object3D. */
export function useProp(file: string, overrides?: MaterialOverrides) {
  // three's own loader rather than drei's `useGLTF`: that one statically
  // imports DRACOLoader, KTX2Loader and MeshoptDecoder, all of which ended up
  // in the bundle even though we pass `false, false` to switch them off. These
  // models are plain, uncompressed glTF.
  const { scene } = useLoader(GLTFLoader, `/models/${file}.glb`)
  const key = overrides ? JSON.stringify(overrides) : ''
  return useMemo(() => {
    const root = scene.clone(true)
    root.traverse((object) => {
      const mesh = object as THREE.Mesh
      if (!mesh.isMesh) return
      mesh.castShadow = true
      mesh.receiveShadow = true
      mesh.material = Array.isArray(mesh.material)
        ? mesh.material.map((material) => themedMaterial(material, overrides))
        : themedMaterial(mesh.material, overrides)
    })
    return root
  }, [scene, key])
}

/**
 * Kenney models sit in a corner-origin box (x from 0, z to 0) rather than being
 * centred, so we measure each one and recentre it on its own footprint. Local
 * coordinates in the room then mean what they look like they mean, and the
 * model keeps its feet on y = 0.
 */
export function Prop({
  file,
  center = true,
  materials,
  ...props
}: { file: string; center?: boolean; materials?: MaterialOverrides } & ThreeElements['group']) {
  const object = useProp(file, materials)
  const offset = useMemo<[number, number, number]>(() => {
    if (!center) return [0, 0, 0]
    object.updateWorldMatrix(true, true)
    const box = new THREE.Box3().setFromObject(object)
    return [-(box.min.x + box.max.x) / 2, 0, -(box.min.z + box.max.z) / 2]
  }, [object, center])

  return (
    <group {...props}>
      <primitive object={object} position={offset} />
    </group>
  )
}

/** Heights of the surfaces we stand things on, in model units. */
export const TOP = {
  desk: 0.384,
  sideTable: 0.384,
  cabinet: 0.31,
  bookcase: 0.88,
} as const

export const PROPS = [
  'bookcaseOpen',
  'desk',
  'chairDesk',
  'computerScreen',
  'computerKeyboard',
  'computerMouse',
  'cabinetTelevision',
  'televisionVintage',
  'sideTable',
  'speakerSmall',
  'rugRound',
  'plantSmall1',
  'lampRoundFloor',
  'books',
] as const

PROPS.forEach((file) => useLoader.preload(GLTFLoader, `/models/${file}.glb`))
