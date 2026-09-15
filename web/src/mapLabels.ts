import * as THREE from 'three'
import type { UrbanContextData, UrbanLabel } from './types'

export interface MapLabel extends UrbanLabel {
  end?: { x: number; z: number }
  span?: number
  roadName?: string
}
export interface LabelBox {
  left: number
  top: number
  right: number
  bottom: number
}
export interface PlacedLabel extends LabelBox {
  label: MapLabel
  x: number
  y: number
  anchorX: number
  anchorY: number
  angle: number
  font: string
  text: string
  dotOnly: boolean
}

const colours: Partial<Record<UrbanLabel['category'], string>> = {
  district: '#e9e8dc',
  road: '#d3c6ad',
  healthcare: '#f5a49f',
  park: '#98ceb0',
  worship: '#c5b4e3',
  education: '#accdeb',
  shopping: '#e6b1cc',
  transit: '#ebc486',
  food: '#dbbea0',
  landmark: '#f0d69a',
  sports: '#98ceb0',
}

/** Retain POIs; anchor street names along real road geometry, not area centroids. */
export function mapLabels(context: UrbanContextData): MapLabel[] {
  const labels: MapLabel[] = context.metadata.labels.filter((label) => label.category !== 'road')
  const roads: MapLabel[] = []
  context.networkNames?.forEach((rawName, line) => {
    const name = rawName.trim()
    const classId = context.networkIndex[line * 3 + 2]
    if (!name || classId > 6) return
    const start = context.networkIndex[line * 3]
    const count = context.networkIndex[line * 3 + 1]
    for (let i = start; i < start + count - 1; i++) {
      const x1 = context.networkCoordinates[i * 2],
        z1 = context.networkCoordinates[i * 2 + 1]
      const x2 = context.networkCoordinates[i * 2 + 2],
        z2 = context.networkCoordinates[i * 2 + 3]
      const length = Math.hypot(x2 - x1, z2 - z1)
      if (length < 20) continue
      const steps = Math.max(1, Math.floor(length / 350))
      for (let step = 0; step < steps; step++) {
        const t = (step + 0.5) / steps
        const x = x1 + (x2 - x1) * t,
          z = z1 + (z2 - z1) * t
        if (
          roads.some((label) => label.name === name && Math.hypot(label.x - x, label.z - z) < 300)
        )
          continue
        roads.push({
          name,
          roadName: name,
          category: 'road',
          kind: 'Road',
          priority: 88 - classId * 5,
          x,
          z,
          span: length / steps,
          end: { x: x + ((x2 - x1) / length) * 100, z: z + ((z2 - z1) / length) * 100 },
        })
      }
    }
  })
  // Old/custom context exports without network names still have useful labels.
  if (!context.networkNames)
    roads.push(...context.metadata.labels.filter((label) => label.category === 'road'))
  return [...labels, ...roads].sort(
    (a, b) => b.priority - a.priority || a.name.localeCompare(b.name),
  )
}

export function overlaps(a: LabelBox, b: LabelBox): boolean {
  return a.left < b.right && a.right > b.left && a.top < b.bottom && a.bottom > b.top
}

/** A small spatial hash avoids quadratic collision checks when an extract grows. */
class Occupancy {
  cells = new Map<string, LabelBox[]>()
  keys(box: LabelBox): string[] {
    const result: string[] = []
    for (let x = Math.floor(box.left / 64); x <= Math.floor(box.right / 64); x++)
      for (let y = Math.floor(box.top / 64); y <= Math.floor(box.bottom / 64); y++)
        result.push(`${x}:${y}`)
    return result
  }
  intersects(box: LabelBox) {
    return this.keys(box).some((key) => this.cells.get(key)?.some((other) => overlaps(box, other)))
  }
  add(box: LabelBox) {
    for (const key of this.keys(box)) {
      const cell = this.cells.get(key) ?? []
      cell.push(box)
      this.cells.set(key, cell)
    }
  }
}

export class MapLabelRenderer {
  placed: PlacedLabel[] = []
  private widths = new Map<string, number>()
  constructor(
    private canvas: HTMLCanvasElement,
    private labels: MapLabel[],
  ) {}

  draw(
    camera: THREE.PerspectiveCamera,
    width: number,
    height: number,
    elevation: (x: number, z: number) => number,
    blocked: LabelBox[],
    enabled: boolean,
    hovered: MapLabel | null,
    selected: { x: number; z: number } | null,
  ) {
    const ctx = this.canvas.getContext('2d')
    if (!ctx || !width || !height) return
    const dpr = Math.min(window.devicePixelRatio || 1, 2)
    if (
      this.canvas.width !== Math.round(width * dpr) ||
      this.canvas.height !== Math.round(height * dpr)
    ) {
      this.canvas.width = Math.round(width * dpr)
      this.canvas.height = Math.round(height * dpr)
    }
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
    ctx.clearRect(0, 0, width, height)
    this.placed = []
    if (!enabled) return
    const occupied = new Occupancy()
    blocked.forEach((box) => occupied.add(box))
    const project = new THREE.Vector3()
    const endpoint = new THREE.Vector3()
    const hidden: PlacedLabel[] = []
    const candidates = hovered
      ? [hovered, ...this.labels.filter((label) => label !== hovered)]
      : this.labels
    for (const label of candidates) {
      const district = label.category === 'district'
      const road = label.category === 'road'
      project.set(label.x, elevation(label.x, label.z) + (road ? 3 : 18), label.z).project(camera)
      if (project.z < -1 || project.z > 1 || Math.abs(project.x) > 1 || Math.abs(project.y) > 1)
        continue
      const anchorX = ((project.x + 1) * width) / 2,
        anchorY = ((1 - project.y) * height) / 2
      const highlighted =
        label === hovered ||
        (selected && Math.hypot(selected.x - label.x, selected.z - label.z) < 1)
      const size = district ? 14 : road ? 10.5 : highlighted ? 12 : 11
      const font = `${district || highlighted ? 650 : 500} ${size}px -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif`
      const text = label.name.length > 48 ? `${label.name.slice(0, 46)}…` : label.name
      ctx.font = font
      const cacheKey = `${font}:${text}`
      let textWidth = this.widths.get(cacheKey)
      if (textWidth === undefined) {
        textWidth = ctx.measureText(text).width
        this.widths.set(cacheKey, textWidth)
      }
      let angle = 0
      if (label.end) {
        endpoint
          .set(label.end.x, elevation(label.end.x, label.end.z) + 3, label.end.z)
          .project(camera)
        const roadPixels =
          (Math.hypot(
            ((endpoint.x - project.x) * width) / 2,
            ((endpoint.y - project.y) * height) / 2,
          ) *
            (label.span ?? 100)) /
          100
        if (textWidth > roadPixels * 1.5 && !highlighted) continue
        angle = Math.atan2(-(endpoint.y - project.y) * height, (endpoint.x - project.x) * width)
        if (angle > Math.PI / 2) angle -= Math.PI
        if (angle < -Math.PI / 2) angle += Math.PI
      }
      const tw = textWidth + 7,
        th = size + 6
      const bw = Math.abs(tw * Math.cos(angle)) + Math.abs(th * Math.sin(angle))
      const bh = Math.abs(tw * Math.sin(angle)) + Math.abs(th * Math.cos(angle))
      const offsets =
        district || road
          ? [[0, 0]]
          : [
              [0, -13],
              [textWidth / 2 + 9, 0],
              [-textWidth / 2 - 9, 0],
              [0, 14],
            ]
      let placed = false
      for (const [dx, dy] of offsets) {
        const x = anchorX + dx,
          y = anchorY + dy
        const box = { left: x - bw / 2, right: x + bw / 2, top: y - bh / 2, bottom: y + bh / 2 }
        if (
          box.left < 6 ||
          box.right > width - 6 ||
          box.top < 6 ||
          box.bottom > height - 6 ||
          occupied.intersects(box)
        )
          continue
        occupied.add(box)
        if (!road && !district)
          occupied.add({
            left: anchorX - 4,
            right: anchorX + 4,
            top: anchorY - 4,
            bottom: anchorY + 4,
          })
        this.placed.push({
          ...box,
          label,
          x,
          y,
          anchorX,
          anchorY,
          angle,
          font,
          text,
          dotOnly: false,
        })
        placed = true
        break
      }
      if (!placed && !district && !road)
        hidden.push({
          label,
          x: anchorX,
          y: anchorY,
          anchorX,
          anchorY,
          left: anchorX - 4,
          right: anchorX + 4,
          top: anchorY - 4,
          bottom: anchorY + 4,
          angle: 0,
          font,
          text,
          dotOnly: true,
        })
    }
    for (const dot of hidden) {
      if (!occupied.intersects(dot)) {
        this.placed.push(dot)
        occupied.add(dot)
      }
    }
    // Dots remain discoverable, but never obscure a higher-priority name.
    for (const item of this.placed) {
      const { label } = item
      const poi = label.category !== 'district' && label.category !== 'road'
      const colour = colours[label.category] ?? '#bbcbd0'
      if (poi) {
        ctx.beginPath()
        ctx.arc(item.anchorX, item.anchorY, item.dotOnly ? 2 : 3, 0, Math.PI * 2)
        ctx.fillStyle = colour
        ctx.fill()
        ctx.strokeStyle = '#101c25'
        ctx.lineWidth = 1.5
        ctx.stroke()
      }
      if (item.dotOnly) continue
      ctx.save()
      ctx.translate(item.x, item.y)
      ctx.rotate(item.angle)
      ctx.font = item.font
      ctx.textAlign = 'center'
      ctx.textBaseline = 'middle'
      ctx.lineJoin = 'round'
      ctx.strokeStyle = '#101c25ee'
      ctx.lineWidth = 4
      ctx.strokeText(item.text, 0, 0)
      ctx.fillStyle = colour
      ctx.fillText(item.text, 0, 0)
      ctx.restore()
    }
  }

  hit(x: number, y: number): MapLabel | null {
    return (
      this.placed.find(
        (item) =>
          (x >= item.left - 3 &&
            x <= item.right + 3 &&
            y >= item.top - 3 &&
            y <= item.bottom + 3) ||
          (item.label.category !== 'road' && Math.hypot(x - item.anchorX, y - item.anchorY) < 6),
      )?.label ?? null
    )
  }
}
