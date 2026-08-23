import { useEffect, useMemo, useRef, useState } from 'react'
import { books, films, records } from '../data/collections'
import { site } from '../data/site'
import { prefetchAlbums, useAlbums } from './appleMusic'
import { useIsTouch } from './useIsTouch'
import { stationById, useFocus } from './focus'
import { clearHovered, setHovered, setSelected, type Credit } from './credit'
import { useFilms, usePosters, useStill } from './filmArt'
import type { Film } from '../data/tmdb'
import type { Track } from './appleMusic'
import { play, stop } from './player'
import { CASE, Case, ScreenGlow, SLEEVE, Sleeve, Spine, TelevisionScreen, Turntable } from './Pieces'
import { ScreenLinks } from './ScreenLinks'
import { palette } from './palette'
import { Prop, TOP } from './useProp'
import { Station } from './Station'

/**
 * Measured off the models rather than eyeballed: the bookcase's shelf boards
 * and the TV cabinet's upper shelf, in model units from each piece's base.
 */
const SHELVES = [0.13, 0.37, 0.61]

/** Depth between sleeves once the records are focused. */
const SLEEVE_STEP = 0.052
/**
 * Sideways offset per sleeve. Viewed head-on, sleeves stacked purely in depth
 * hide one another completely, so this stagger is the only thing that leaves
 * each one something to show and something to click. Every sleeve keeps the
 * same angle, so the stack stays a stack rather than a splayed hand.
 */
const SLEEVE_STAGGER = 0.032
/** Wider on touch: a finger needs far more than the 14px this leaves on a phone. */
const SLEEVE_STAGGER_TOUCH = 0.075
const SPINE_PITCH = 0.028

/** Cases stand on the cabinet top, to the left of the television. */
const CASE_X = -0.295
/**
 * Sideways offset per case once focused, and the depth step behind it. The
 * television occupies x from -0.185 rightward and the cabinet top ends at
 * -0.4, so the fan has about 0.2 to work in on a pointer device.
 */
const CASE_STAGGER = 0.028
const CASE_STEP = 0.038
const CASE_FRONT = -0.05
/**
 * A finger needs far more room than the 11px the pointer stagger leaves on a
 * phone. The wider fan runs into the television, so on touch the whole thing
 * also comes forward past the set's front face rather than through it.
 */
const CASE_STAGGER_TOUCH = 0.046
const CASE_STEP_TOUCH = 0.05
const CASE_FRONT_TOUCH = 0.0
/** and shifts right, so the widest case still lands on the cabinet. */
const CASE_X_TOUCH = CASE_X + 0.035
/** Depth between cases in the resting stack. A case is 0.014 thick. */
const CASE_REST_STEP = 0.016
/** Enough to read as held up and looked at, not enough to read as a prop. */
const CASE_PICKED_SCALE = 1.25

const trackCredit = (track: Track): Credit => ({
  title: track.trackName,
  subtitle: track.artistName,
  href: track.storeUrl,
  source: 'Apple Music',
})

const filmCredit = (film: Film): Credit => ({
  title: film.title,
  subtitle: [film.director, film.year].filter(Boolean).join(' · '),
  href: film.tmdbUrl,
  source: 'TMDB',
})

function Bookcase() {
  const station = stationById('books')
  // Spread the list across the shelves rather than filling one and leaving two bare.
  const perShelf = Math.ceil(books.length / SHELVES.length)

  return (
    <Station station={station}>
      <Prop file="bookcaseOpen" />
      <Prop file="plantSmall1" position={[0.1, TOP.bookcase, 0]} />
      <Prop file="books" position={[0.09, SHELVES[2]!, 0.01]} rotation={[0, 0.3, 0]} />

      {books.map((entry, index) => {
        const shelf = Math.floor(index / perShelf)
        const row = Math.min(perShelf, books.length - shelf * perShelf)
        const slot = index % perShelf
        // The top shelf shares its space with the stack of books lying flat.
        const nudge = shelf === 2 ? -0.09 : 0
        const x = (slot - (row - 1) / 2) * SPINE_PITCH + nudge
        return (
          <Spine key={entry.title} entry={entry} index={index} position={[x, SHELVES[shelf]!, 0]} />
        )
      })}
    </Station>
  )
}

function RecordPlayer() {
  const station = stationById('records')
  const focused = useFocus() === 'records'
  const touch = useIsTouch()
  const stagger = touch ? SLEEVE_STAGGER_TOUCH : SLEEVE_STAGGER
  const albums = useAlbums(records)
  const [picked, setPicked] = useState<number | null>(null)
  const playing = useRef<string | null>(null)

  // The credit panel compares by identity when a hover ends, so these have to
  // survive re-renders rather than being rebuilt inline.
  const credits = useMemo(
    () => albums.map((album) => (album ? trackCredit(album.track) : null)),
    [albums],
  )

  // Leaving the station puts the needle back up.
  useEffect(() => {
    if (focused) return
    setPicked(null)
    setHovered(null)
  }, [focused])

  useEffect(() => {
    const album = picked === null ? null : albums[picked]
    const url = album?.track.previewUrl ?? null
    // Albums resolve one by one, so only react when the actual clip changes.
    if (url === playing.current) return
    playing.current = url
    if (url && album) {
      play(url, () => setPicked(null))
      setSelected(credits[picked!] ?? null)
    } else {
      stop()
      setSelected(null)
    }
  }, [picked, albums, credits])

  useEffect(
    () => () => {
      stop()
      setSelected(null)
    },
    [],
  )

  const current = picked === null ? null : albums[picked]

  return (
    <Station station={station}>
      <Prop file="sideTable" />
      <Turntable
        position={[0, TOP.sideTable, 0]}
        active={current !== null}
        artwork={current?.texture ?? null}
      />
      <Prop file="speakerSmall" position={[0.33, 0, -0.2]} rotation={[0, -0.5, 0]} />

      {records.map((entry, index) => {
        const isPlaying = picked === index
        // Stacked in depth, the way records actually lean in a crate. Reach is
        // handled by the sleeve's oversized pointer target and its pop on
        // hover rather than by splaying them sideways.
        const position: [number, number, number] = isPlaying
          ? [0, 0.105, 0.3]
          : focused
            ? [
                -0.44 + (index - (records.length - 1) / 2) * stagger,
                0.095,
                -0.13 + index * SLEEVE_STEP,
              ]
            : [-0.35, 0.093, -0.05 + index * 0.028]
        const rotation: [number, number, number] = isPlaying
          ? [0, 0.02, -0.08]
          : focused
            ? [0, 0.1, -0.12]
            : [0, 0.12 + (index % 3) * 0.03, -0.14 + (index % 2) * 0.025]

        return (
          <Sleeve
            key={entry.title}
            entry={entry}
            index={index}
            texture={albums[index]?.texture ?? null}
            position={position}
            rotation={rotation}
            interactive={focused}
            reach={
              // Each sleeve is overlapped on its right by the one in front, so
              // its reachable strip is the stagger's width on its left edge.
              // The nearest sleeve is unobstructed and keeps a full target.
              focused && !isPlaying && index < records.length - 1
                ? { width: stagger, center: -SLEEVE / 2 + stagger / 2 }
                : undefined
            }
            onHover={(isHovered) => {
              const credit = credits[index]
              if (!credit) return
              if (isHovered) setHovered(credit)
              else clearHovered(credit)
            }}
            onSelect={() => setPicked(isPlaying ? null : index)}
          />
        )
      })}
    </Station>
  )
}

/**
 * The cabinet's own shelf is a closed compartment — the panel behind its front
 * face is solid wood — so the cases stand on top of it, beside the television,
 * where their covers are actually visible.
 */
const CASE_Y = TOP.cabinet + CASE.height / 2

function Films() {
  const station = stationById('films')
  const focused = useFocus() === 'films'
  const touch = useIsTouch()
  const stagger = touch ? CASE_STAGGER_TOUCH : CASE_STAGGER
  const step = touch ? CASE_STEP_TOUCH : CASE_STEP
  const front = touch ? CASE_FRONT_TOUCH : CASE_FRONT
  const fanX = touch ? CASE_X_TOUCH : CASE_X
  // Resolved at build time; empty until the island hydrates, and permanently
  // empty when no TMDB key was set. Both cases leave plain coloured cases.
  const resolved = useFilms()
  const posters = usePosters(resolved)
  const [picked, setPicked] = useState<number | null>(null)
  const current = picked === null ? null : (resolved[picked] ?? null)
  // Only the film that is up on the television, at ~110KB a still.
  const still = useStill(current?.stillUrl ?? null)
  const shown = useRef<Credit | null>(null)

  const credits = useMemo(
    () => resolved.map((film) => (film ? filmCredit(film) : null)),
    [resolved],
  )

  useEffect(() => {
    if (focused) return
    setPicked(null)
    setHovered(null)
  }, [focused])

  useEffect(() => {
    const credit = picked === null ? null : (credits[picked] ?? null)
    // The records share this panel, so never write to it unless this station's
    // own selection actually changed.
    if (credit === shown.current) return
    shown.current = credit
    setSelected(credit)
  }, [picked, credits])

  useEffect(
    () => () => {
      if (shown.current) setSelected(null)
    },
    [],
  )

  return (
    <Station station={station}>
      <Prop file="cabinetTelevision" />
      <Prop file="televisionVintage" position={[0.02, TOP.cabinet, 0]} rotation={[0, 0.06, 0]} />
      <TelevisionScreen
        position={[0.02, TOP.cabinet, 0]}
        rotation={[0, 0.06, 0]}
        still={still}
        active={picked !== null}
      />

      {films.map((entry, index) => {
        const isPicked = picked === index
        const position: [number, number, number] = isPicked
          ? // Out in front of the cabinet and clear of the screen, so the
            // cover and the still can be read at the same time.
            [CASE_X, CASE_Y + 0.075, 0.26]
          : focused
            ? [
                fanX + (index - (films.length - 1) / 2) * stagger,
                CASE_Y,
                front + index * step,
              ]
            : [CASE_X, CASE_Y, -0.04 + index * CASE_REST_STEP]
        const rotation: [number, number, number] = isPicked
          ? [0, 0.02, -0.02]
          : focused
            ? [0, 0.08, -0.03]
            : [0, 0.1 + (index % 3) * 0.02, -0.04 + (index % 2) * 0.02]

        return (
          <Case
            key={entry.title}
            entry={entry}
            index={index}
            texture={posters[index] ?? null}
            position={position}
            rotation={rotation}
            scale={isPicked ? CASE_PICKED_SCALE : 1}
            interactive={focused}
            reach={
              // Same geometry as the sleeves: each case is overlapped on its
              // right by the one in front of it, leaving a strip on the left.
              focused && !isPicked && index < films.length - 1
                ? { width: stagger, center: -CASE.width / 2 + stagger / 2 }
                : undefined
            }
            onHover={(isHovered) => {
              const credit = credits[index]
              if (!credit) return
              if (isHovered) setHovered(credit)
              else clearHovered(credit)
            }}
            onSelect={() => setPicked(isPicked ? null : index)}
          />
        )
      })}
    </Station>
  )
}

function Desk() {
  const station = stationById('desk')
  const focused = useFocus() === 'desk'

  return (
    <Station station={station}>
      <Prop file="desk" />
      <Prop file="computerScreen" position={[0, TOP.desk, -0.1]} />
      <ScreenGlow position={[0, TOP.desk + 0.172, -0.085]} />
      <ScreenLinks
        active={focused}
        links={site.links}
        position={[0, TOP.desk + 0.172, -0.083]}
      />
      <Prop file="computerKeyboard" position={[0, TOP.desk, 0.075]} />
      <Prop file="computerMouse" position={[0.21, TOP.desk, 0.075]} rotation={[0, -0.15, 0]} />
      <Prop
        file="chairDesk"
        position={[0.4, 0, 0.55]}
        rotation={[0, Math.PI * 0.82, 0]}
        scale={0.95}
        materials={{ carpet: '#c2bcae', carpetDarker: '#a9a396' }}
      />
    </Station>
  )
}

export function Room() {
  return (
    <>
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.001, 0]} receiveShadow>
        <planeGeometry args={[80, 80]} />
        <meshStandardMaterial color={palette.floor} roughness={1} metalness={0} />
      </mesh>

      <Prop file="rugRound" position={[0.1, 0, 0.36]} scale={1.7} />
      <Prop file="lampRoundFloor" position={[1.98, 0, -0.2]} rotation={[0, -0.5, 0]} />

      <Bookcase />
      <RecordPlayer />
      <Desk />
      <Films />
    </>
  )
}

// Covers start downloading as soon as the island hydrates, in parallel with
// the models, so the shelf is dressed by the time the room appears.
prefetchAlbums(records)
