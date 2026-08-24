import { useSyncExternalStore } from 'react'
import { books, films, records } from '../data/collections'
import { notice } from './credit'

/**
 * Six small things worth doing in this room, and whether you have done them.
 *
 * Nothing here gates anything: the room is identical whether the case is full
 * or empty. It exists so that poking at everything is recorded rather than
 * forgotten, and so an unearned grey shape on a shelf can hint that there is
 * something left to find.
 */
export type TrophyId = 'books' | 'films' | 'records' | 'cat' | 'chair' | 'night'

/** Full turns of the desk chair. A good flick is worth a little over two. */
const CHAIR_TURNS = 10
/** Perches the cat knows. Mirrors `PERCHES` in `Cat.tsx`. */
const CAT_SPOTS = 4

export type Trophy = {
  id: TrophyId
  name: string
  /** Shown alongside the name when it is earned. */
  hint: string
  /** How many of a thing it takes. */
  goal: number
}

export const TROPHIES: Trophy[] = [
  { id: 'books', name: 'Bookworm', hint: 'Read every book off the shelf.', goal: books.length },
  { id: 'films', name: 'Double Feature', hint: 'Watched every film on the TV.', goal: films.length },
  { id: 'records', name: 'B-side', hint: 'Spun every record on the turntable.', goal: records.length },
  { id: 'cat', name: 'Cat Person', hint: `Got the cat to visit all ${CAT_SPOTS} spots.`, goal: CAT_SPOTS },
  { id: 'chair', name: 'Spin Doctor', hint: `Spun the chair ${CHAIR_TURNS} times.`, goal: CHAIR_TURNS },
  { id: 'night', name: 'Night Owl', hint: 'Turned the lamp on.', goal: 1 },
]

/**
 * Counted rather than flagged, because most of these are "all of them" and the
 * room has to know which ones you have already seen. The lists hold indices.
 */
type Progress = {
  books: number[]
  films: number[]
  records: number[]
  cat: number[]
  /** Whole turns, not radians — see `spin` below. */
  chair: number
  night: boolean
}

const EMPTY: Progress = { books: [], films: [], records: [], cat: [], chair: 0, night: false }

const KEY = 'room-trophies'
const listeners = new Set<() => void>()

function stored(): Progress {
  try {
    // `?trophies=` empties the case for good, not just for this load — the
    // only way to see the room the way a first visitor does.
    if (new URLSearchParams(location.search).has('trophies')) {
      localStorage.removeItem(KEY)
      return { ...EMPTY }
    }
    const saved = localStorage.getItem(KEY)
    if (!saved) return { ...EMPTY }
    const parsed = JSON.parse(saved) as Partial<Progress>
    // Hand-written into localStorage, edited between releases, or simply from
    // an older shape — every field is checked rather than trusted.
    return {
      books: Array.isArray(parsed.books) ? parsed.books : [],
      films: Array.isArray(parsed.films) ? parsed.films : [],
      records: Array.isArray(parsed.records) ? parsed.records : [],
      cat: Array.isArray(parsed.cat) ? parsed.cat : [],
      chair: typeof parsed.chair === 'number' ? parsed.chair : 0,
      night: parsed.night === true,
    }
  } catch {
    return { ...EMPTY }
  }
}

let progress: Progress = typeof document === 'undefined' ? { ...EMPTY } : stored()

function count(id: TrophyId) {
  if (id === 'chair') return progress.chair
  if (id === 'night') return progress.night ? 1 : 0
  return progress[id].length
}

export const isEarned = (id: TrophyId) =>
  count(id) >= (TROPHIES.find((trophy) => trophy.id === id)?.goal ?? Infinity)

/**
 * Recomputed on every change and handed out as a stable object, because
 * `useSyncExternalStore` compares snapshots by identity and would otherwise
 * loop forever on a fresh `Set` every render.
 */
let earned = new Set(TROPHIES.filter((trophy) => isEarned(trophy.id)).map((t) => t.id))

function save() {
  try {
    localStorage.setItem(KEY, JSON.stringify(progress))
  } catch {
    // Private browsing. The case simply will not outlive the visit.
  }
}

/** Announces anything that has just been earned, then republishes. */
function settle() {
  const next = new Set(TROPHIES.filter((trophy) => isEarned(trophy.id)).map((t) => t.id))
  for (const trophy of TROPHIES) {
    if (next.has(trophy.id) && !earned.has(trophy.id)) {
      notice({ title: trophy.name, subtitle: trophy.hint })
    }
  }
  earned = next
  save()
  for (const listener of listeners) listener()
}

/** One of a set: a book opened, a film played, the cat found somewhere. */
export function mark(id: Exclude<TrophyId, 'chair' | 'night'>, index: number) {
  if (progress[id].includes(index)) return
  progress = { ...progress, [id]: [...progress[id], index] }
  settle()
}

export function markNight() {
  if (progress.night) return
  progress = { ...progress, night: true }
  settle()
}

/**
 * Radians of chair, from wherever the chair happens to be turning.
 *
 * Deliberately does not notify per call: a drag reports every frame, and a
 * store that emitted at 60fps would re-render the whole room continuously —
 * the same reason `turntable.ts` publishes the platter's angle through a plain
 * mutable object instead of a store. Only a whole new turn is worth anyone's
 * attention, and past the goal nothing is worth counting at all.
 */
let radians = 0
export function spin(delta: number) {
  if (progress.chair >= CHAIR_TURNS) return
  radians += Math.abs(delta)
  const turns = Math.min(progress.chair + Math.floor(radians / (Math.PI * 2)), CHAIR_TURNS)
  if (turns === progress.chair) return
  radians %= Math.PI * 2
  progress = { ...progress, chair: turns }
  settle()
}

export function useTrophies() {
  return useSyncExternalStore(
    (listener) => {
      listeners.add(listener)
      return () => listeners.delete(listener)
    },
    () => earned,
    () => earned,
  )
}
