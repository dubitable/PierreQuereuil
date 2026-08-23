import { useEffect, useState, useSyncExternalStore } from 'react'
import * as THREE from 'three'
import type { Film } from '../data/tmdb'

/**
 * Holds the film data resolved at build time. It arrives as a prop on the
 * island and only one station needs it, so a module store keeps it out of the
 * props of everything between `Scene` and the cabinet.
 */
let films: (Film | null)[] = []
const listeners = new Set<() => void>()
const empty: (Film | null)[] = []

export function setFilms(next: (Film | null)[]) {
  films = next
  for (const listener of listeners) listener()
}

export function useFilms() {
  return useSyncExternalStore(
    (listener) => {
      listeners.add(listener)
      return () => listeners.delete(listener)
    },
    () => films,
    () => empty,
  )
}

const textures = new Map<string, Promise<THREE.Texture | null>>()

/**
 * Deliberately imperative rather than drei's `useTexture`: that suspends, and a
 * poster that stalls would take the whole room's Suspense boundary down with
 * it. A missing texture just leaves a flat case.
 */
function loadImage(url: string): Promise<THREE.Texture | null> {
  if (!url) return Promise.resolve(null)
  const cached = textures.get(url)
  if (cached) return cached

  const request = new THREE.TextureLoader()
    .loadAsync(url)
    .then((texture) => {
      texture.colorSpace = THREE.SRGBColorSpace
      texture.anisotropy = 4
      return texture
    })
    .catch(() => null)

  textures.set(url, request)
  return request
}

/**
 * Centre-crops a texture to fill a face of a different shape. Posters are 2:3
 * and stills are 16:9, and neither matches what they have to sit on, so
 * without this they arrive stretched.
 *
 * Safe to mutate in place only because each URL has exactly one consumer in
 * the scene — a poster is only ever on its own case.
 */
export function cover(texture: THREE.Texture | null, aspect: number) {
  const image = texture?.image as { width?: number; height?: number } | undefined
  if (!texture || !image?.width || !image.height) return
  const source = image.width / image.height
  if (source > aspect) {
    texture.repeat.set(aspect / source, 1)
    texture.offset.set((1 - aspect / source) / 2, 0)
  } else {
    texture.repeat.set(1, source / aspect)
    texture.offset.set(0, (1 - source / aspect) / 2)
  }
  texture.needsUpdate = true
}

/** Every poster, eagerly: they are ~18KB each and they dress the shelf at rest. */
export function usePosters(entries: (Film | null)[]) {
  const [posters, setPosters] = useState<(THREE.Texture | null)[]>([])

  useEffect(() => {
    let live = true
    setPosters(entries.map(() => null))

    entries.forEach(async (film, index) => {
      if (!film?.posterUrl) return
      const texture = await loadImage(film.posterUrl)
      if (!live || !texture) return
      setPosters((current) => {
        const next = current.slice()
        next[index] = texture
        return next
      })
    })

    return () => {
      live = false
    }
  }, [entries])

  return posters
}

/** One still, on demand: at ~110KB each, loading all of them upfront is not worth it. */
export function useStill(url: string | null) {
  const [still, setStill] = useState<THREE.Texture | null>(null)

  useEffect(() => {
    if (!url) {
      setStill(null)
      return
    }
    let live = true
    loadImage(url).then((texture) => {
      if (live) setStill(texture)
    })
    return () => {
      live = false
    }
  }, [url])

  return still
}
