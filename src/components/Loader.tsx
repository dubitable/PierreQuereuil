import { useProgress } from '@react-three/drei'

/**
 * A hairline that fills as the room loads. It has to be DOM rather than an
 * in-scene effect: nothing can be drawn in the canvas until three itself is
 * up, which is most of what we are waiting for.
 */
export function Loader({ done }: { done: boolean }) {
  const { progress } = useProgress()

  return (
    <div className="loader" data-done={done || undefined} aria-hidden="true">
      <div className="loader__track">
        <div className="loader__fill" style={{ transform: `scaleX(${progress / 100})` }} />
      </div>
    </div>
  )
}
