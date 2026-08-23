import { useEffect, useState, useSyncExternalStore } from 'react'
import * as THREE from 'three'

/**
 * Artwork for the shelves — album covers, film posters and stills, book
 * jackets. All of it arrives from someone else's CDN long after the materials
 * using it have compiled, which is what most of this file exists to handle.
 */

const textures = new Map<string, Promise<THREE.Texture | null>>()

/**
 * Deliberately imperative rather than drei's `useTexture`: that suspends, and a
 * cover that stalls would take the whole room's Suspense boundary down with it.
 * A missing texture just leaves a flat object.
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
 * Starts a download without waiting for it. Used on hover, so the larger
 * artwork has landed by the time the click that needs it arrives.
 */
export function prefetchArtwork(url: string | null | undefined) {
  if (url) loadImage(url)
}

/**
 * Centre-crops a texture to fill a face of a different shape. Album covers are
 * square, posters 2:3, stills 16:9, jackets about 1:1.4, and none of those
 * matches what they sit on, so without this they arrive stretched.
 *
 * Safe to mutate in place only because each URL has exactly one consumer in the
 * scene — a poster is only ever on its own case.
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

/** A whole shelf at once, for artwork small enough to load eagerly. */
export function useArtwork(urls: (string | null | undefined)[]) {
  const [loaded, setLoaded] = useState<(THREE.Texture | null)[]>([])
  // Keyed on the URLs themselves so callers need not memoise the array they
  // build, which every one of them would otherwise have to.
  const key = urls.join('|')

  useEffect(() => {
    let live = true
    setLoaded(urls.map(() => null))

    urls.forEach(async (url, index) => {
      if (!url) return
      const texture = await loadImage(url)
      if (!live || !texture) return
      setLoaded((current) => {
        const next = current.slice()
        next[index] = texture
        return next
      })
    })

    return () => {
      live = false
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key])

  return loaded
}

/** One piece, on demand — for artwork too heavy to fetch until it is wanted. */
export function useArtworkOne(url: string | null | undefined) {
  const [loaded, setLoaded] = useState<THREE.Texture | null>(null)

  useEffect(() => {
    if (!url) {
      setLoaded(null)
      return
    }
    let live = true
    loadImage(url).then((texture) => {
      if (live) setLoaded(texture)
    })
    return () => {
      live = false
    }
  }, [url])

  return loaded
}

/**
 * A shelf's worth of build-time data, handed to the island as a prop. Keeping
 * it in a module store rather than props means it does not have to be drilled
 * through `Room` when only one station wants it.
 */
export function createShelfStore<T>() {
  let items: T[] = []
  const empty: T[] = []
  const listeners = new Set<() => void>()

  return {
    set(next: T[]) {
      items = next
      for (const listener of listeners) listener()
    },
    use() {
      return useSyncExternalStore(
        (listener) => {
          listeners.add(listener)
          return () => listeners.delete(listener)
        },
        () => items,
        () => empty,
      )
    },
  }
}
