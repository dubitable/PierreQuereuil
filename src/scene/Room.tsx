import { useEffect, useRef, useState } from 'react'
import { books, films, records } from '../data/collections'
import { prefetchAlbums, useAlbums } from './appleMusic'
import { useIsTouch } from './useIsTouch'
import { stationById, useFocus } from './focus'
import { clearHovered, setHovered, setPlaying } from './nowPlaying'
import { play, stop } from './player'
import { Case, ScreenGlow, SLEEVE, Sleeve, Spine, Turntable } from './Pieces'
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
const CABINET_SHELF = 0.185
const SPINE_PITCH = 0.028

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
  const [selected, setSelected] = useState<number | null>(null)
  const playing = useRef<string | null>(null)

  // Leaving the station puts the needle back up.
  useEffect(() => {
    if (focused) return
    setSelected(null)
    setHovered(null)
  }, [focused])

  useEffect(() => {
    const album = selected === null ? null : albums[selected]
    const url = album?.track.previewUrl ?? null
    // Albums resolve one by one, so only react when the actual clip changes.
    if (url === playing.current) return
    playing.current = url
    if (url && album) {
      play(url, () => setSelected(null))
      setPlaying(album.track)
    } else {
      stop()
      setPlaying(null)
    }
  }, [selected, albums])

  useEffect(
    () => () => {
      stop()
      setPlaying(null)
    },
    [],
  )

  const current = selected === null ? null : albums[selected]

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
        const isPlaying = selected === index
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
              const track = albums[index]?.track
              if (!track) return
              if (isHovered) setHovered(track)
              else clearHovered(track)
            }}
            onSelect={() => setSelected(isPlaying ? null : index)}
          />
        )
      })}
    </Station>
  )
}

function Films() {
  const station = stationById('films')

  return (
    <Station station={station}>
      <Prop file="cabinetTelevision" />
      <Prop file="televisionVintage" position={[0.02, TOP.cabinet, 0]} rotation={[0, 0.06, 0]} />

      {films.map((entry, index) => (
        <Case
          key={entry.title}
          entry={entry}
          index={index}
          position={[-0.29 + index * 0.019, CABINET_SHELF, 0]}
        />
      ))}
    </Station>
  )
}

function Desk() {
  const station = stationById('desk')

  return (
    <Station station={station}>
      <Prop file="desk" />
      <Prop file="computerScreen" position={[0, TOP.desk, -0.1]} />
      <ScreenGlow position={[0, TOP.desk + 0.172, -0.085]} />
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
