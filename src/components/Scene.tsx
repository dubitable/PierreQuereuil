import { Suspense, useEffect, useState } from 'react'
import { Canvas } from '@react-three/fiber'
import { Preload } from '@react-three/drei'
import { setFocus } from '../scene/focus'
import { setFilms } from '../scene/filmArt'
import { setBooks } from '../scene/bookArt'
import type { Film } from '../data/tmdb'
import type { Book } from '../data/openLibrary'
import { palette } from '../scene/palette'
import { Room } from '../scene/Room'
import { CameraRig } from '../scene/CameraRig'
import { Loader } from './Loader'
import { Credit } from './Credit'
import { StationDots } from './StationDots'
import { useIsTouch } from '../scene/useIsTouch'

/** How long the room is held back even if it loads instantly, in ms. */
const MIN_LOADING = 420
/** Never hide the room longer than this, however loading goes. */
const MAX_LOADING = 8000

/**
 * Mounts only once its Suspense siblings have resolved, which makes it an
 * exact "the room is ready" signal — more reliable than watching load
 * progress, which can miss assets that were already cached.
 */
function Ready({ onReady }: { onReady: () => void }) {
  useEffect(onReady, [onReady])
  return null
}

/**
 * Both shelves are resolved at build time and handed in as props: TMDB so the
 * API key stays on the server, Open Library so the room makes no metadata
 * requests of its own. Only the artwork itself is fetched by the browser.
 */
export default function Scene({
  films = [],
  books = [],
}: {
  films?: (Film | null)[]
  books?: (Book | null)[]
}) {
  const touch = useIsTouch()
  // Before first paint, so neither shelf renders a frame of blank covers when
  // the data was there all along.
  useState(() => {
    setFilms(films)
    setBooks(books)
  })
  const [loaded, setLoaded] = useState(false)
  const [waited, setWaited] = useState(false)
  const [timedOut, setTimedOut] = useState(false)

  useEffect(() => {
    const min = setTimeout(() => setWaited(true), MIN_LOADING)
    const max = setTimeout(() => setTimedOut(true), MAX_LOADING)
    return () => {
      clearTimeout(min)
      clearTimeout(max)
    }
  }, [])

  const revealed = (loaded && waited) || timedOut

  return (
    <>
      <Canvas
        // `flat` keeps tone mapping off, so the palette renders as authored.
        flat
        shadows="percentage"
        // Phone GPUs do not need a 2x buffer under 2048px shadows.
        dpr={touch ? [1, 1.5] : [1, 2]}
        camera={{ fov: 32, position: [0, 1.2, 3.5], near: 0.1, far: 60 }}
        gl={{ antialias: true }}
        // On touch there is no wide view to return to: the carousel always
        // rests on a station.
        onPointerMissed={touch ? undefined : () => setFocus(null)}
        style={{
          opacity: revealed ? 1 : 0,
          transition: 'opacity 900ms cubic-bezier(0.22, 1, 0.36, 1)',
        }}
      >
        <color attach="background" args={[palette.background]} />
        {/* Fades the floor into the background so its edge never reads as a horizon. */}
        <fog attach="fog" args={[palette.background, 7, 16]} />

        <ambientLight intensity={1.4} />
        <hemisphereLight args={['#fffaf0', '#cfc6b4', 0.7]} />
        <directionalLight
          position={[2.6, 4.2, 3.2]}
          intensity={1.9}
          castShadow
          shadow-mapSize={touch ? [1024, 1024] : [2048, 2048]}
          shadow-bias={-0.0004}
          shadow-normalBias={0.015}
          // Softens the shadow edge under PCF. Deliberately not drei's
          // <SoftShadows>: that patches three's shadow shader chunk globally,
          // which races material compilation and can leave every lit material
          // failing to draw while unlit ones still render.
          shadow-radius={3}
        >
          <orthographicCamera attach="shadow-camera" args={[-3.5, 3.5, 3.5, -3.5, 0.1, 14]} />
        </directionalLight>
        <directionalLight position={[-3.4, 2.2, -1.6]} intensity={0.5} />

        <Suspense fallback={null}>
          <Room />
          <Preload all />
          <Ready onReady={() => setLoaded(true)} />
        </Suspense>

        <CameraRig touch={touch} />
      </Canvas>

      <Loader done={revealed} />
      <Credit />
      {touch && <StationDots />}
    </>
  )
}
