import { useEffect, useRef, useState } from 'react'
import { useFrame, useThree } from '@react-three/fiber'

/**
 * Opt-in performance readout, shown only when the URL carries `?stats`.
 *
 * It exists because the interesting case — a phone in low power mode — is the
 * one place none of this can be measured from a desktop. Under
 * `frameloop="demand"` the number to watch is FPS: a still room should sit at
 * zero, and anything else means an animation is asking for frames it does not
 * need.
 */
export const wantsStats = () =>
  typeof location !== 'undefined' && new URLSearchParams(location.search).has('stats')

type Sample = { fps: number; calls: number; tris: number; programs: number }

export function Stats({ onSample }: { onSample: (sample: Sample) => void }) {
  const gl = useThree((state) => state.gl)
  const frames = useRef(0)
  const since = useRef(performance.now())

  useFrame(() => {
    frames.current += 1
    const now = performance.now()
    const elapsed = now - since.current
    if (elapsed < 500) return
    onSample({
      fps: Math.round((frames.current * 1000) / elapsed),
      calls: gl.info.render.calls,
      tris: gl.info.render.triangles,
      programs: gl.info.programs?.length ?? 0,
    })
    frames.current = 0
    since.current = now
  })

  return null
}

/**
 * The panel itself. Lives outside the canvas, and polls on a timer so that it
 * still reports zero once the demand loop has gone quiet — a readout driven
 * only by rendered frames would freeze on its last value and look alive.
 */
export function StatsPanel({ sample }: { sample: Sample | null }) {
  const [idle, setIdle] = useState(false)
  const seen = useRef(0)

  useEffect(() => {
    seen.current = performance.now()
    setIdle(false)
  }, [sample])

  useEffect(() => {
    const timer = setInterval(() => {
      setIdle(performance.now() - seen.current > 900)
    }, 300)
    return () => clearInterval(timer)
  }, [])

  const fps = idle ? 0 : (sample?.fps ?? 0)

  return (
    <div
      style={{
        position: 'fixed',
        left: 12,
        bottom: 12,
        zIndex: 10,
        font: '11px/1.5 ui-monospace, SFMono-Regular, Menlo, monospace',
        color: '#3d3a34',
        background: 'rgba(255,255,255,0.82)',
        border: '1px solid rgba(0,0,0,0.08)',
        borderRadius: 6,
        padding: '6px 9px',
        pointerEvents: 'none',
        whiteSpace: 'pre',
      }}
    >
      {`fps      ${fps}${idle ? '  (idle)' : ''}
calls    ${sample?.calls ?? 0}
tris     ${sample?.tris ?? 0}
programs ${sample?.programs ?? 0}`}
    </div>
  )
}
