import { useEffect, useState } from 'react'
import * as THREE from 'three'
import type { Entry } from '../data/collections'

/**
 * Clips come from Apple's public preview endpoints — the same ones the Apple
 * Music web player uses. Nothing is copied or hosted here: we look up a track
 * by artist and album at runtime and stream Apple's own 30-second preview,
 * linking back to the store as their terms expect.
 */
export type Track = {
  previewUrl: string
  artworkUrl: string
  trackName: string
  artistName: string
  albumName: string
  storeUrl: string
}

export type Album = { track: Track; texture: THREE.Texture | null }

/**
 * Anisotropic filtering costs a sample per tap. Worth it on a desktop where a
 * cover is seen at an angle; not on a phone. Matches the query `useIsTouch`
 * uses, but these are plain modules with no hook to call.
 */
const coarse = () =>
  typeof matchMedia === 'function' && matchMedia('(pointer: coarse)').matches

const SEARCH = 'https://itunes.apple.com/search'
const ARTWORK_SIZE = '300x300bb'
const lookups = new Map<string, Promise<Track | null>>()
const textures = new Map<string, Promise<THREE.Texture | null>>()

type SearchResult = {
  previewUrl?: string
  artworkUrl100?: string
  trackName?: string
  artistName?: string
  collectionName?: string
  trackViewUrl?: string
  collectionViewUrl?: string
}

function lookupTrack(entry: Entry): Promise<Track | null> {
  const key = `${entry.by}|${entry.title}`
  const cached = lookups.get(key)
  if (cached) return cached

  const request = (async (): Promise<Track | null> => {
    try {
      const term = encodeURIComponent(`${entry.by} ${entry.title}`)
      const response = await fetch(`${SEARCH}?term=${term}&entity=song&limit=8`, {
        signal: AbortSignal.timeout(8000),
      })
      if (!response.ok) return null
      const { results = [] } = (await response.json()) as { results?: SearchResult[] }

      const wanted = entry.title.toLowerCase()
      const hit =
        results.find(
          (result) => result.previewUrl && result.collectionName?.toLowerCase().includes(wanted),
        ) ?? results.find((result) => result.previewUrl)
      if (!hit?.previewUrl) return null

      return {
        previewUrl: hit.previewUrl,
        // The API hands back a 100px thumbnail; the same path serves any size.
        // A sleeve is ~67px on screen at rest and ~200px focused, so 300 is
        // ample — 600 would be three times the bytes for no visible gain.
        artworkUrl: (hit.artworkUrl100 ?? '').replace('100x100bb', ARTWORK_SIZE),
        trackName: hit.trackName ?? entry.title,
        artistName: hit.artistName ?? entry.by,
        albumName: hit.collectionName ?? entry.title,
        storeUrl: hit.trackViewUrl ?? hit.collectionViewUrl ?? '',
      }
    } catch {
      return null
    }
  })()

  lookups.set(key, request)
  return request
}

function loadArtwork(url: string): Promise<THREE.Texture | null> {
  if (!url) return Promise.resolve(null)
  const cached = textures.get(url)
  if (cached) return cached

  const request = new THREE.TextureLoader()
    .loadAsync(url)
    .then((texture) => {
      texture.colorSpace = THREE.SRGBColorSpace
      texture.anisotropy = coarse() ? 1 : 4
      return texture
    })
    .catch(() => null)

  textures.set(url, request)
  return request
}

/**
 * Starts resolving the shelf immediately, without waiting for a component to
 * mount. Called at module scope so covers download alongside the models rather
 * than only after the room has finished loading.
 */
export function prefetchAlbums(entries: Entry[]) {
  for (const entry of entries) {
    lookupTrack(entry).then((track) => track && loadArtwork(track.artworkUrl))
  }
}

/**
 * Resolves the shelf against Apple Music. Both the lookups and the textures are
 * promise-cached by module, so this picks up whatever `prefetchAlbums` already
 * started and fills results in as they arrive.
 */
export function useAlbums(entries: Entry[], enabled = true) {
  const [albums, setAlbums] = useState<(Album | null)[]>(() => entries.map(() => null))

  useEffect(() => {
    if (!enabled) return
    let live = true

    entries.forEach(async (entry, index) => {
      const track = await lookupTrack(entry)
      if (!live || !track) return
      const texture = await loadArtwork(track.artworkUrl)
      if (!live) return
      setAlbums((current) => {
        const next = current.slice()
        next[index] = { track, texture }
        return next
      })
    })

    return () => {
      live = false
    }
  }, [entries, enabled])

  return albums
}
