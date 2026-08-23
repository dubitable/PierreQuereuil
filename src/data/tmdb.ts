/**
 * Film metadata comes from TMDB, queried at build time so the API key never
 * reaches the browser and the room costs no extra requests at runtime.
 *
 * Apple cannot supply this: `media=movie` returns nothing at all, and
 * `media=all` mismatches badly — of the shelf below it matched only one title,
 * turning *Paprika* into "Applause" and *La Haine* into "The Desperados!".
 */
import type { Entry } from './collections'

export type Film = {
  title: string
  director: string
  year: string
  /** ~18KB. Small enough to load every one eagerly. */
  posterUrl: string
  /** ~110KB. Loaded only when a case is picked. */
  stillUrl: string
  tmdbUrl: string
}

const API = 'https://api.themoviedb.org/3'
const IMAGE = 'https://image.tmdb.org/t/p'
/** `image.tmdb.org` sends `access-control-allow-origin: *`, so both work as WebGL textures. */
const POSTER_SIZE = 'w342'
const STILL_SIZE = 'w780'
/** How many search hits to check credits for before giving up on the director. */
const CANDIDATES = 4

type SearchHit = {
  id: number
  title?: string
  release_date?: string
  poster_path?: string | null
  backdrop_path?: string | null
}

const norm = (value: string) =>
  value
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z ]/g, '')
    .trim()

/**
 * Surnames, loosely. Transliterations disagree on endings often enough that an
 * exact match is too strict — "Shepitkov" and TMDB's "Shepitko" are the same
 * person — so a shared five-letter stem counts.
 */
function sameDirector(a: string, b: string) {
  const left = norm(a).split(' ').filter(Boolean).pop()
  const right = norm(b).split(' ').filter(Boolean).pop()
  if (!left || !right) return false
  if (left === right) return true
  const stem = 5
  return (
    (left.length >= stem && right.startsWith(left.slice(0, stem))) ||
    (right.length >= stem && left.startsWith(right.slice(0, stem)))
  )
}

async function json<T>(url: string): Promise<T | null> {
  try {
    const response = await fetch(url, { signal: AbortSignal.timeout(10000) })
    if (!response.ok) return null
    return (await response.json()) as T
  } catch {
    return null
  }
}

async function directorOf(id: number, key: string): Promise<string> {
  const credits = await json<{ crew?: { job?: string; name?: string }[] }>(
    `${API}/movie/${id}/credits?api_key=${key}`,
  )
  return credits?.crew?.find((member) => member.job === 'Director')?.name ?? ''
}

async function lookupFilm(entry: Entry, key: string): Promise<Film | null> {
  const results = await json<{ results?: SearchHit[] }>(
    `${API}/search/movie?api_key=${key}&query=${encodeURIComponent(entry.title)}`,
  )
  const hits = (results?.results ?? []).filter((hit) => hit.poster_path)
  if (!hits.length) return null

  // TMDB sorts by popularity, which is the wrong answer for anything that
  // shares a title with a remake — searching "Solaris" hands back Soderbergh's
  // before Tarkovsky's — so the director on the shelf decides.
  let chosen = hits[0]!
  let director = ''
  for (const hit of hits.slice(0, CANDIDATES)) {
    const credited = await directorOf(hit.id, key)
    if (sameDirector(credited, entry.by)) {
      chosen = hit
      director = credited
      break
    }
    if (hit === hits[0]) director = credited
  }

  return {
    title: chosen.title ?? entry.title,
    director: director || entry.by,
    year: chosen.release_date?.slice(0, 4) ?? '',
    posterUrl: `${IMAGE}/${POSTER_SIZE}${chosen.poster_path}`,
    stillUrl: chosen.backdrop_path ? `${IMAGE}/${STILL_SIZE}${chosen.backdrop_path}` : '',
    tmdbUrl: `https://www.themoviedb.org/movie/${chosen.id}`,
  }
}

/**
 * Resolves the shelf. Every failure — no key, no network, no match — yields a
 * null entry rather than throwing: the station has to keep working as plain
 * coloured cases, and a build must never fail over a film poster.
 */
export async function resolveFilms(entries: Entry[]): Promise<(Film | null)[]> {
  const key = import.meta.env.TMDB_API_KEY
  if (!key) return entries.map(() => null)

  return Promise.all(
    entries.map(async (entry) => {
      try {
        return await lookupFilm(entry, key)
      } catch {
        return null
      }
    }),
  )
}
