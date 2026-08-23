import { useMemo, useRef, useState } from 'react'
import { Billboard, Text } from '@react-three/drei'
import { useFrame } from '@react-three/fiber'
import * as THREE from 'three'
import type { Entry } from '../data/collections'
import type { Link } from '../data/site'
import { palette, spineColor } from './palette'

const FONT = '/fonts/inter-400.woff'
const LINE = 0.088
const TITLE_SIZE = 0.045
const BY_SIZE = 0.031

/**
 * Fades a group of in-scene text in and out. Troika exposes `fillOpacity` on
 * the text mesh itself, and the backing card is tagged in userData, so the
 * whole panel can be driven by walking the subtree rather than threading refs
 * through every line.
 */
function useFade(active: boolean) {
  const group = useRef<THREE.Group>(null)
  const opacity = useRef(0)

  useFrame((_, delta) => {
    const node = group.current
    if (!node) return
    const dt = Math.min(delta, 1 / 30)
    opacity.current = THREE.MathUtils.lerp(
      opacity.current,
      active ? 1 : 0,
      1 - Math.exp(-(active ? 7 : 12) * dt),
    )
    const value = opacity.current
    node.visible = value > 0.01
    node.position.y = (1 - value) * -0.035
    node.traverse((child) => {
      if ('fillOpacity' in child) {
        ;(child as unknown as { fillOpacity: number }).fillOpacity = value
      }
      const mesh = child as THREE.Mesh
      if (mesh.isMesh && mesh.userData.fade) {
        const material = mesh.material as THREE.Material & { opacity: number }
        material.opacity = value * (mesh.userData.fade as number)
      }
    })
  })

  return group
}

function roundedRect(width: number, height: number, radius: number) {
  const shape = new THREE.Shape()
  const x = -width / 2
  const y = -height / 2
  shape.moveTo(x + radius, y)
  shape.lineTo(x + width - radius, y)
  shape.quadraticCurveTo(x + width, y, x + width, y + radius)
  shape.lineTo(x + width, y + height - radius)
  shape.quadraticCurveTo(x + width, y + height, x + width - radius, y + height)
  shape.lineTo(x + radius, y + height)
  shape.quadraticCurveTo(x, y + height, x, y + height - radius)
  shape.lineTo(x, y + radius)
  shape.quadraticCurveTo(x, y, x + radius, y)
  return shape
}

/**
 * A soft card behind the text. It is a real mesh in the room rather than an
 * overlay, and it guarantees the list stays legible wherever it happens to sit
 * against the furniture.
 */
function Card({
  width,
  height,
  position,
}: {
  width: number
  height: number
  position: [number, number, number]
}) {
  const geometry = useMemo(
    () => new THREE.ShapeGeometry(roundedRect(width, height, 0.035), 8),
    [width, height],
  )

  return (
    <mesh geometry={geometry} position={position} userData={{ fade: 0.94 }}>
      <meshBasicMaterial color={palette.background} transparent opacity={0} toneMapped={false} />
    </mesh>
  )
}

/** Rough advance width; Inter sits close to half the em on average. */
const textWidth = (value: string, size: number) => value.length * size * 0.53

type DetailProps = {
  active: boolean
  heading: string
  items: Entry[]
  position: [number, number, number]
}

export function Detail({ active, heading, items, position }: DetailProps) {
  const group = useFade(active)

  const width = useMemo(
    () =>
      Math.max(
        0.42,
        ...items.map((item) =>
          Math.max(textWidth(item.title, TITLE_SIZE), textWidth(item.by, BY_SIZE)),
        ),
      ) + 0.14,
    [items],
  )
  const height = items.length * LINE + 0.2

  return (
    <Billboard position={position}>
      <group ref={group}>
        <Card
          width={width + 0.12}
          height={height}
          position={[width / 2 - 0.11, 0.055, -0.012]}
        />

        <Text
          font={FONT}
          fontSize={0.05}
          color={palette.inkSoft}
          anchorX="left"
          anchorY="middle"
          letterSpacing={0.14}
          position={[0, LINE * ((items.length - 1) / 2) + 0.115, 0]}
        >
          {heading.toUpperCase()}
        </Text>

        {items.map((item, index) => {
          const y = LINE * ((items.length - 1) / 2 - index)
          return (
            <group key={item.title} position={[0, y, 0]}>
              <mesh position={[-0.037, 0.002, 0]} userData={{ fade: 1 }}>
                <circleGeometry args={[0.011, 16]} />
                <meshBasicMaterial
                  color={item.color ?? spineColor(index)}
                  transparent
                  opacity={0}
                  toneMapped={false}
                />
              </mesh>
              <Text
                font={FONT}
                fontSize={TITLE_SIZE}
                color={palette.ink}
                anchorX="left"
                anchorY="middle"
                position={[0, 0.013, 0]}
              >
                {item.title}
              </Text>
              <Text
                font={FONT}
                fontSize={BY_SIZE}
                color={palette.inkSoft}
                anchorX="left"
                anchorY="middle"
                position={[0, -0.031, 0]}
              >
                {item.by}
              </Text>
            </group>
          )
        })}
      </group>
    </Billboard>
  )
}

/** The computer's link list — the only text in the room you can click. */
export function Links({
  active,
  links,
  position,
}: {
  active: boolean
  links: readonly Link[]
  position: [number, number, number]
}) {
  const group = useFade(active)
  const [hovered, setHovered] = useState<string | null>(null)
  const pitch = LINE * 1.25

  const hover = (label: string | null) => {
    setHovered(label)
    document.body.style.cursor = label && active ? 'pointer' : 'auto'
  }

  return (
    <Billboard position={position}>
      <group ref={group}>
        <Card width={0.62} height={links.length * pitch + 0.12} position={[0, 0, -0.012]} />

        {links.map((link, index) => (
          <Text
            key={link.label}
            font={FONT}
            fontSize={0.055}
            color={hovered === link.label ? palette.accent : palette.ink}
            anchorX="center"
            anchorY="middle"
            letterSpacing={0.02}
            position={[0, pitch * ((links.length - 1) / 2 - index), 0]}
            onPointerOver={(event) => {
              event.stopPropagation()
              if (active) hover(link.label)
            }}
            onPointerOut={() => hover(null)}
            onClick={(event) => {
              event.stopPropagation()
              if (!active) return
              const external = !link.href.startsWith('mailto:')
              window.open(link.href, external ? '_blank' : '_self', 'noopener,noreferrer')
            }}
          >
            {link.label}
          </Text>
        ))}
      </group>
    </Billboard>
  )
}
