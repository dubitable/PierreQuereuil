import { useState } from 'react'
import type { Link } from '../data/site'
import { iconFor, iconTexture } from './icons'
import { palette } from './palette'

const ICON = 0.05
const GAP = 0.076

/**
 * The links, sitting on the monitor as part of the scene rather than as an
 * overlay. They only take clicks once the desk is focused, so from the wide
 * room a click still falls through and focuses the station.
 */
export function ScreenLinks({
  active,
  links,
  position,
}: {
  active: boolean
  links: readonly Link[]
  position: [number, number, number]
}) {
  const [hovered, setHovered] = useState<string | null>(null)

  const hover = (label: string | null) => {
    setHovered(label)
    document.body.style.cursor = label ? 'pointer' : 'auto'
  }

  return (
    <group position={position}>
      {links.map((link, index) => {
        const offset = (index - (links.length - 1) / 2) * GAP
        const lit = hovered === link.label

        return (
          <mesh
            key={link.label}
            position={[offset, 0, 0]}
            onPointerOver={(event) => {
              if (!active) return
              event.stopPropagation()
              hover(link.label)
            }}
            onPointerOut={() => hover(null)}
            onClick={(event) => {
              if (!active) return
              event.stopPropagation()
              hover(null)
              const external = !link.href.startsWith('mailto:')
              window.open(link.href, external ? '_blank' : '_self', 'noopener,noreferrer')
            }}
          >
            <planeGeometry args={[ICON, ICON]} />
            <meshBasicMaterial
              map={iconTexture(iconFor(link.label, link.href))}
              color={lit ? palette.accent : palette.ink}
              transparent
              toneMapped={false}
            />
          </mesh>
        )
      })}
    </group>
  )
}
