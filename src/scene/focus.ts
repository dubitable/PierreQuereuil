import { useSyncExternalStore } from 'react'
import * as THREE from 'three'

export type StationId = 'books' | 'trophies' | 'records' | 'films' | 'desk'

let current: StationId | null = null
const listeners = new Set<() => void>()

export function setFocus(id: StationId | null) {
  if (current === id) return
  current = id
  for (const listener of listeners) listener()
}

export function toggleFocus(id: StationId) {
  setFocus(current === id ? null : id)
}

export function getFocus() {
  return current
}

export function useFocus() {
  return useSyncExternalStore(
    (listener) => {
      listeners.add(listener)
      return () => listeners.delete(listener)
    },
    () => current,
    () => null,
  )
}

type Vec3 = [number, number, number]

/** Must match the Canvas camera. */
export const FOV = 32
const HALF_TAN = Math.tan((FOV * Math.PI) / 360)

/** The box a station needs to show, in metres of model space. */
type Fit = { width: number; height: number }

/**
 * Distance at which `fit` exactly fills the frame. Deriving this from the
 * viewport instead of clamping a fixed distance is what makes portrait work:
 * a phone is far too narrow for any hand-tuned number, and the old clamps
 * bottomed out well before the content actually fit.
 */
export function fitDistance(fit: Fit, aspect: number) {
  const byWidth = fit.width / (2 * HALF_TAN * aspect)
  const byHeight = fit.height / (2 * HALF_TAN)
  return Math.max(byWidth, byHeight)
}

type Frame = {
  /** Aim point, in the station's local space. */
  look: Vec3
  fit: Fit
  /** How far above the aim point the camera rides, in radians. */
  elevation: number
}

export type Station = {
  id: StationId
  label: string
  position: Vec3
  /** Yaw, radians. */
  rotation: number
  frame: Frame
}

export const STATIONS: Station[] = [
  {
    id: 'books',
    label: 'Bookcase',
    position: [-1.5, 0, -0.18],
    rotation: 0.4,
    frame: { look: [0, 0.5, 0], fit: { width: 0.55, height: 1.05 }, elevation: 0.063 },
  },
  {
    id: 'trophies',
    label: 'Trophies',
    // The gap between the bookcase and the desk, set back against the rear of
    // the room. Chosen by projecting the case's eight corners through every
    // camera in the room at 9:19, 3:4 and 16:9: it clears the bookcase by
    // 210mm, stands in front of nothing, and keeps 0.40 of margin inside the
    // wide shot at every parallax yaw — which is what makes it clickable
    // without arrowing to it. The near corner of the room, which reads better,
    // falls off the bottom of the wide shot the way a floor-standing cat did.
    position: [-0.9, 0, -0.8],
    rotation: 0.2,
    frame: { look: [0, 0.46, 0], fit: { width: 0.5, height: 0.42 }, elevation: 0.1 },
  },
  {
    id: 'records',
    label: 'Records',
    position: [-0.75, 0, 0.62],
    rotation: 0.22,
    // Aimed 0.06 higher than the turntable alone needs, so a cat sitting on
    // the platter keeps its head inside the frame on a 16:9 screen. Nothing
    // else moves out of shot: the bottom edge still falls below the floor.
    frame: { look: [-0.2, 0.3, 0], fit: { width: 0.9, height: 0.66 }, elevation: 0.172 },
  },
  {
    id: 'desk',
    label: 'Desk',
    position: [0.1, 0, 0],
    rotation: 0,
    frame: { look: [0, 0.42, 0], fit: { width: 0.95, height: 0.85 }, elevation: 0.132 },
  },
  {
    id: 'films',
    label: 'Films',
    position: [1.15, 0, 0.42],
    rotation: -0.32,
    frame: { look: [0, 0.32, 0], fit: { width: 0.95, height: 0.78 }, elevation: 0.147 },
  },
]

export const stationById = (id: StationId) => STATIONS.find((station) => station.id === id)!
export const stationIndex = (id: StationId) => STATIONS.findIndex((station) => station.id === id)

/**
 * Camera pose that frames a station. `zoom` widens the fit box — used for the
 * opening shot on touch, which starts pulled back and settles in.
 */
export function focusPose(station: Station, aspect: number, zoom = 1) {
  const { look, fit, elevation } = station.frame
  const [x, , z] = station.position
  const forward = new THREE.Vector3(Math.sin(station.rotation), 0, Math.cos(station.rotation))
  const right = new THREE.Vector3(Math.cos(station.rotation), 0, -Math.sin(station.rotation))

  const target = new THREE.Vector3(x, 0, z)
    .addScaledVector(right, look[0])
    .addScaledVector(forward, look[2])
  target.y = look[1]

  const distance = fitDistance(
    { width: fit.width * zoom, height: fit.height * zoom },
    aspect,
  )
  const position = target
    .clone()
    .addScaledVector(forward, distance * Math.cos(elevation))
  position.y = target.y + distance * Math.sin(elevation)

  return { position, target }
}

/** The whole room, for the idle view on pointer devices. */
export const ROOM = {
  target: new THREE.Vector3(0, 0.46, 0.1),
  fit: { width: 4, height: 1.45 },
  elevation: 0.21,
  /** Half the idle orbit, radians (~15°). */
  swing: 0.26,
}
