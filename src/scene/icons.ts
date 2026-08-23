import * as THREE from 'three'

/**
 * Icons are drawn to a canvas at load and used as textures, so they are crisp
 * at any zoom and cost nothing to load. Everything is authored in a 24-unit
 * box, matching the usual icon viewBox.
 */
const BOX = 24
const SIZE = 256

/**
 * GitHub's mark, from Simple Icons (CC0). LinkedIn's was withdrawn from that
 * set at LinkedIn's request, so the profile link uses a neutral glyph rather
 * than a reconstruction of their logo.
 */
const GITHUB =
  'M12 .297c-6.63 0-12 5.373-12 12 0 5.303 3.438 9.8 8.205 11.385.6.113.82-.258.82-.577 0-.285-.01-1.04-.015-2.04-3.338.724-4.042-1.61-4.042-1.61C4.422 18.07 3.633 17.7 3.633 17.7c-1.087-.744.084-.729.084-.729 1.205.084 1.838 1.236 1.838 1.236 1.07 1.835 2.809 1.305 3.495.998.108-.776.417-1.305.76-1.605-2.665-.3-5.466-1.332-5.466-5.93 0-1.31.465-2.38 1.235-3.22-.135-.303-.54-1.523.105-3.176 0 0 1.005-.322 3.3 1.23.96-.267 1.98-.399 3-.405 1.02.006 2.04.138 3 .405 2.28-1.552 3.285-1.23 3.285-1.23.645 1.653.24 2.873.12 3.176.765.84 1.23 1.91 1.23 3.22 0 4.61-2.805 5.625-5.475 5.92.42.36.81 1.096.81 2.22 0 1.606-.015 2.896-.015 3.286 0 .315.21.69.825.57C20.565 22.092 24 17.592 24 12.297c0-6.627-5.373-12-12-12'

type Draw = (ctx: CanvasRenderingContext2D) => void

const github: Draw = (ctx) => ctx.fill(new Path2D(GITHUB))

/** A person, for the profile link. */
const person: Draw = (ctx) => {
  ctx.beginPath()
  ctx.arc(12, 8, 3.7, 0, Math.PI * 2)
  ctx.fill()
  ctx.beginPath()
  ctx.roundRect(4.4, 13.8, 15.2, 7.2, [7, 7, 1.6, 1.6])
  ctx.fill()
}

/** An envelope: a filled body with the flap cut back out of it. */
const mail: Draw = (ctx) => {
  ctx.beginPath()
  ctx.roundRect(2.4, 5, 19.2, 14, 2.4)
  ctx.fill()

  ctx.globalCompositeOperation = 'destination-out'
  ctx.lineWidth = 2.1
  ctx.lineJoin = 'round'
  ctx.lineCap = 'round'
  ctx.beginPath()
  ctx.moveTo(4.6, 7.4)
  ctx.lineTo(12, 13.2)
  ctx.lineTo(19.4, 7.4)
  ctx.stroke()
  ctx.globalCompositeOperation = 'source-over'
}

const DRAW: Record<string, Draw> = { github, person, mail }

export type IconName = keyof typeof DRAW

/** Picks an icon from a link's label, falling back to the profile glyph. */
export function iconFor(label: string, href: string): IconName {
  const key = label.toLowerCase()
  if (href.startsWith('mailto:') || key.includes('mail') || key.includes('email')) return 'mail'
  if (key.includes('github')) return 'github'
  return 'person'
}

const cache = new Map<IconName, THREE.Texture>()

/**
 * White on transparent, so a single texture can be tinted by the material and
 * recoloured on hover without redrawing.
 */
export function iconTexture(name: IconName) {
  const cached = cache.get(name)
  if (cached) return cached

  const canvas = document.createElement('canvas')
  canvas.width = SIZE
  canvas.height = SIZE
  const ctx = canvas.getContext('2d')!
  ctx.scale(SIZE / BOX, SIZE / BOX)
  ctx.fillStyle = '#ffffff'
  ctx.strokeStyle = '#ffffff'
  DRAW[name]!(ctx)

  const texture = new THREE.CanvasTexture(canvas)
  texture.colorSpace = THREE.SRGBColorSpace
  texture.anisotropy = 4
  cache.set(name, texture)
  return texture
}
