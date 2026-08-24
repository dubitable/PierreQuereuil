import { Suspense, useEffect, useMemo, useRef, useState } from 'react'
import { books, films, records } from '../data/collections'
import { site } from '../data/site'
import { prefetchAlbums, useAlbums } from './appleMusic'
import { useIsTouch } from './useIsTouch'
import { stationById, useFocus } from './focus'
import { clearHovered, setHovered, setSelected, type Credit } from './credit'
import { prefetchArtwork, useArtwork, useArtworkOne } from './art'
import { useFilms } from './filmArt'
import { useBooks } from './bookArt'
import type { Film } from '../data/tmdb'
import type { Book } from '../data/openLibrary'
import type { Track } from './appleMusic'
import { play, stop } from './player'
import {
  BOOK,
  CASE,
  Cover,
  Portrait,
  ScreenGlow,
  SLEEVE,
  Swivel,
  TelevisionScreen,
  Turntable,
} from './Pieces'
import { Cat } from './Cat'
import { ScreenLinks } from './ScreenLinks'
import { lighting, night, palette } from './palette'
import { toggleTheme, useTheme } from './theme'
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
/**
 * Books stand cover-out, three to a shelf. The shelf boards run from local
 * x -0.18 to 0.18, so three jackets at this pitch span 0.355 of the 0.36
 * available — side by side with nothing to spare and nothing overlapping.
 */
const BOOK_PITCH = 0.115
/**
 * Depth offset per book. Three 0.125 jackets cannot fit 0.36 of shelf without
 * overlapping by about 10mm, so this has to clear a jacket's own 0.021
 * thickness or neighbours intersect. The result is a gentle fan.
 */
const BOOK_STEP = 0.024
/** Three jackets is what a 0.36 shelf holds at that pitch. */
const SHELF_CAPACITY = 3
/** Pulled out to the middle of the framed view, and big enough to read. */
const BOOK_PICKED_SCALE = 1.45

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
const CASE_PICKED_SCALE = 1.35
/**
 * Where a picked film parks: centred under the television's picture, out in
 * front of the cabinet. The screen's underside is at y 0.349 and a cover at
 * this scale reaches 0.261, so the two never overlap.
 */
const FILM_SHOWN: [number, number, number] = [-0.027, 0.19, 0.2]
/**
 * Milliseconds the cabinet stands empty between two films. Without the beat,
 * picking a second film sends one cover home while the next flies out, and the
 * two cross in mid-air. Sequencing them reads as changing the disc.
 */
const FILM_SWAP_MS = 200

const trackCredit = (track: Track): Credit => ({
  title: track.trackName,
  subtitle: track.artistName,
  href: track.storeUrl,
  source: 'Apple Music',
})

const bookCredit = (book: Book): Credit => ({
  title: book.title,
  subtitle: [book.author, book.year].filter(Boolean).join(' · '),
  href: book.olUrl,
  source: 'Open Library',
})

const filmCredit = (film: Film): Credit => ({
  title: film.title,
  subtitle: [film.director, film.year].filter(Boolean).join(' · '),
  href: film.tmdbUrl,
  source: 'TMDB',
})

function Bookcase() {
  const station = stationById('books')
  const focused = useFocus() === 'books'
  // Resolved at build time; empty until the island hydrates, and permanently
  // empty with no network at build. Both leave plain coloured jackets.
  const resolved = useBooks()
  const jackets = useArtwork(resolved.map((book) => book?.coverUrl))
  const [picked, setPicked] = useState<number | null>(null)
  const current = picked === null ? null : (resolved[picked] ?? null)
  // The big scan, only for the book actually in hand.
  const large = useArtworkOne(current?.largeUrl)
  const shown = useRef<Credit | null>(null)

  // Fill shelves to capacity and centre the rows in the case, rather than
  // spreading thin: three books make one row on the middle shelf, not three
  // lonely singletons. Seven would fill all three shelves from the bottom.
  const rows = Math.ceil(books.length / SHELF_CAPACITY)
  const firstShelf = Math.max(0, Math.floor((SHELVES.length - rows) / 2))

  const credits = useMemo(
    () => resolved.map((book) => (book ? bookCredit(book) : null)),
    [resolved],
  )

  useEffect(() => {
    if (focused) return
    setPicked(null)
    setHovered(null)
  }, [focused])

  useEffect(() => {
    const credit = picked === null ? null : (credits[picked] ?? null)
    // Every station shares this panel, so only write to it when this one's own
    // selection actually changed.
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
      <Prop file="bookcaseOpen" />
      <Prop file="plantSmall1" position={[0.1, TOP.bookcase, 0]} />
      <Prop file="books" position={[0.09, SHELVES[2]!, 0.01]} rotation={[0, 0.3, 0]} />

      {books.map((entry, index) => {
        const isPicked = picked === index
        const rowIndex = Math.floor(index / SHELF_CAPACITY)
        const shelf = Math.min(firstShelf + rowIndex, SHELVES.length - 1)
        const row = Math.min(SHELF_CAPACITY, books.length - rowIndex * SHELF_CAPACITY)
        const slot = index % SHELF_CAPACITY
        // The top shelf shares its space with the stack of books lying flat.
        const nudge = shelf === 2 ? -0.09 : 0
        const x = (slot - (row - 1) / 2) * BOOK_PITCH + nudge

        const position: [number, number, number] = isPicked
          ? // Dead centre of the framed view: the station aims at [0, 0.5, 0].
            [0, 0.5, 0.3]
          : [x, SHELVES[shelf]! + BOOK[1] / 2, slot * BOOK_STEP]
        const rotation: [number, number, number] = isPicked
          ? [0, 0.02, 0]
          : [0, 0.04 - (index % 3) * 0.03, 0]

        return (
          <Cover
            key={entry.title}
            entry={entry}
            index={index}
            texture={(isPicked ? large : null) ?? jackets[index] ?? null}
            size={BOOK}
            position={position}
            rotation={rotation}
            scale={isPicked ? BOOK_PICKED_SCALE : 1}
            lift={{ y: 0.008, z: 0.02 }}
            interactive={focused}
            onHover={(isHovered) => {
              // Side by side on the shelf, so nothing needs a trimmed collider.
              if (isHovered) prefetchArtwork(resolved[index]?.largeUrl)
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
          ? [0, 0.15, 0.3]
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
          <Cover
            key={entry.title}
            entry={entry}
            index={index}
            texture={albums[index]?.texture ?? null}
            size={SLEEVE}
            position={position}
            rotation={rotation}
            lift={{ y: 0.014, z: 0.016 }}
            interactive={focused}
            reach={
              // Each sleeve is overlapped on its right by the one in front, so
              // its reachable strip is the stagger's width on its left edge.
              // The nearest sleeve is unobstructed and keeps a full target.
              focused && !isPlaying && index < records.length - 1
                ? { width: stagger, center: -SLEEVE[0] / 2 + stagger / 2 }
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
const CASE_Y = TOP.cabinet + CASE[1] / 2

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
  const posters = useArtwork(resolved.map((film) => film?.posterUrl))
  const [picked, setPicked] = useState<number | null>(null)
  // What the cabinet is actually showing, which lags the selection during a
  // swap so one cover is home before the next sets off.
  const [onScreen, setOnScreen] = useState<number | null>(null)
  const onScreenRef = useRef<number | null>(null)
  const current = onScreen === null ? null : (resolved[onScreen] ?? null)
  // Only the film that is up on the television, at ~110KB a still.
  const still = useArtworkOne(current?.stillUrl)
  const credited = useRef<Credit | null>(null)

  const credits = useMemo(
    () => resolved.map((film) => (film ? filmCredit(film) : null)),
    [resolved],
  )

  useEffect(() => {
    if (focused) return
    setPicked(null)
    setHovered(null)
  }, [focused])

  // Depends on `picked` alone: reading `onScreen` here would let the effect
  // re-fire the moment it clears and skip the pause it just scheduled.
  useEffect(() => {
    const from = onScreenRef.current
    if (picked === from) return

    if (picked === null || from === null) {
      onScreenRef.current = picked
      setOnScreen(picked)
      return
    }

    onScreenRef.current = null
    setOnScreen(null)
    const timer = setTimeout(() => {
      onScreenRef.current = picked
      setOnScreen(picked)
    }, FILM_SWAP_MS)
    return () => clearTimeout(timer)
  }, [picked])

  // The panel follows the click rather than the animation: naming the film you
  // just asked for should not wait on a cover flying home.
  useEffect(() => {
    const credit = picked === null ? null : (credits[picked] ?? null)
    // The other stations share this panel, so never write to it unless this
    // station's own selection actually changed.
    if (credit === credited.current) return
    credited.current = credit
    setSelected(credit)
  }, [picked, credits])

  useEffect(
    () => () => {
      if (credited.current) setSelected(null)
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
        active={onScreen !== null}
      />

      {films.map((entry, index) => {
        const isPicked = onScreen === index
        const position: [number, number, number] = isPicked
          ? FILM_SHOWN
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
          <Cover
            key={entry.title}
            entry={entry}
            index={index}
            texture={posters[index] ?? null}
            size={CASE}
            position={position}
            rotation={rotation}
            scale={isPicked ? CASE_PICKED_SCALE : 1}
            lift={{ y: 0.012, z: 0.014 }}
            interactive={focused}
            reach={
              // Same geometry as the sleeves: each case is overlapped on its
              // right by the one in front of it, leaving a strip on the left.
              focused && !isPicked && index < films.length - 1
                ? { width: stagger, center: -CASE[0] / 2 + stagger / 2 }
                : undefined
            }
            onHover={(isHovered) => {
              if (isHovered) prefetchArtwork(resolved[index]?.stillUrl)
              const credit = credits[index]
              if (!credit) return
              if (isHovered) setHovered(credit)
              else clearHovered(credit)
            }}
            onSelect={() => setPicked(picked === index ? null : index)}
          />
        )
      })}
    </Station>
  )
}

/** Downscaled from the original so the desk costs 56KB rather than 6.4MB. */
const PORTRAIT = '/images/portrait-desk.jpg'

function Desk() {
  const station = stationById('desk')
  const focused = useFocus() === 'desk'
  const portrait = useArtworkOne(PORTRAIT)

  return (
    <Station station={station}>
      <Prop file="desk" />
      {/* Left of the monitor, leaning back the way a photograph on a desk
          does. 33mm clear of the screen and 37mm inside the desk's edge. */}
      <Portrait photo={portrait} position={[-0.28, TOP.desk, -0.11]} rotation={[-0.15, 0.3, 0]} />
      <Prop file="computerScreen" position={[0, TOP.desk, -0.1]} />
      <ScreenGlow position={[0, TOP.desk + 0.172, -0.085]} />
      <ScreenLinks
        active={focused}
        links={site.links}
        position={[0, TOP.desk + 0.172, -0.083]}
      />
      <Prop file="computerKeyboard" position={[0, TOP.desk, 0.075]} />
      <Prop file="computerMouse" position={[0.21, TOP.desk, 0.075]} rotation={[0, -0.15, 0]} />
      {/* The model's own swivel column lands within 3mm of where `Prop`
          centres it, so the group's Y axis is already the right pivot. */}
      <Swivel position={[0.4, 0, 0.55]} rotation={[0, Math.PI * 0.82, 0]} capture={focused}>
        <Prop
          file="chairDesk"
          scale={0.95}
          materials={{ carpet: '#c2bcae', carpetDarker: '#a9a396' }}
        />
      </Swivel>
    </Station>
  )
}

/**
 * Measured off the GLB: the shade spans y 0.682 to 0.860 and sits on the
 * lamp's own axis once `Prop` has recentred it, so the bulb belongs here.
 */
const BULB: [number, number, number] = [0, 0.771, 0]

/** The floor lamp, which is also the switch for the whole room. */
function Lamp() {
  const theme = useTheme()
  const dark = theme === 'night'

  return (
    <group
      // Behind the desk rather than out at the room's right edge, where it
      // sat outside every framed view: the wide shot cropped it at x +/-2 and
      // the camera's parallax swung it in and out, and on touch there is no
      // wide shot at all. Here it stands inside the desk station — the one the
      // room opens on — clear of the desk's own back edge at z -0.278, with
      // the shade rising above the monitor.
      position={[0.45, 0, -0.62]}
      rotation={[0, -0.5, 0]}
      // Keeps the top of the shade inside the desk frame, which ends at y 0.81
      // on a 16:9 screen. Scales the bulb along with it.
      scale={0.92}
      onPointerOver={(event) => {
        event.stopPropagation()
        document.body.style.cursor = 'pointer'
      }}
      onPointerOut={() => {
        document.body.style.cursor = 'auto'
      }}
      onClick={(event) => {
        event.stopPropagation()
        document.body.style.cursor = 'auto'
        toggleTheme()
      }}
    >
      <Prop
        file="lampRoundFloor"
        materials={dark ? { lamp: { color: '#fff3d0', glow: 1.9 } } : undefined}
      />
      {/* Not a shadow caster: a point light costs six shadow renders, and the
          room already has a key light doing that job. */}
      {dark && (
        <pointLight
          position={BULB}
          intensity={lighting.night.lamp}
          distance={5}
          decay={2}
          color="#ffd8a0"
        />
      )}
    </group>
  )
}

export function Room() {
  const theme = useTheme()

  return (
    <>
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.001, 0]} receiveShadow>
        <planeGeometry args={[80, 80]} />
        <meshStandardMaterial
          color={theme === 'night' ? night.floor : palette.floor}
          roughness={1}
          metalness={0}
        />
      </mesh>

      <Prop file="rugRound" position={[0.1, 0, 0.36]} scale={1.7} />
      <Lamp />

      {/* Its own boundary: 233KB of cat should not hold back the reveal of the
          room. It turns up a moment after everything else. */}
      <Suspense fallback={null}>
        <Cat />
      </Suspense>

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
prefetchArtwork(PORTRAIT)
