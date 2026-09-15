import * as THREE from 'three'
import type { GridMetadata, UrbanContextData } from './types'

interface UrbanGeometryOptions {
  context: UrbanContextData
  grid: GridMetadata
  terrain: Float32Array
  terrainMinimum: number
  verticalExaggeration: number
  flat: boolean
}

const buildingColour = new THREE.Color('#62777e')
const streetColours = [
  '#b6a77c',
  '#a59676',
  '#8d856e',
  '#717c7d',
  '#52656e',
  '#42545e',
  '#3b5157',
  '#947b73',
  '#295567',
  '#355e4e',
]

const roadImpactColours = {
  shallow: new THREE.Color('#c8b363'),
  moderate: new THREE.Color('#dc9849'),
  severe: new THREE.Color('#cb624d'),
}

export function roadImpactColour(
  depthMillimetres: number,
  _wetMemberCount: number,
  _memberCount: number,
  fallback: THREE.Color,
): THREE.Color {
  if (depthMillimetres === 65535 || depthMillimetres < 50) return fallback
  const risk =
    depthMillimetres >= 300
      ? roadImpactColours.severe
      : depthMillimetres >= 100
        ? roadImpactColours.moderate
        : roadImpactColours.shallow
  // Depth colours stay fixed. Terrain disagreement has its own map layer.
  return risk
}

function terrainY(x: number, z: number, options: UrbanGeometryOptions): number {
  if (options.flat) return 0
  const { width, height, cellSizeMetres } = options.grid
  const gx = x / cellSizeMetres + (width - 1) / 2
  const gz = z / cellSizeMetres + (height - 1) / 2
  if (gx < -0.5 || gz < -0.5 || gx > width - 0.5 || gz > height - 0.5) return 0
  if (width < 2 || height < 2)
    return Math.max(0, (options.terrain[0] - options.terrainMinimum) * options.verticalExaggeration)
  const cx = THREE.MathUtils.clamp(gx, 0, width - 1),
    cz = THREE.MathUtils.clamp(gz, 0, height - 1)
  const column = Math.min(Math.floor(cx), width - 2),
    row = Math.min(Math.floor(cz), height - 2)
  const fx = cx - column,
    fz = cz - row
  const i = row * width + column
  const a = options.terrain[i],
    b = options.terrain[i + 1],
    c = options.terrain[i + width],
    d = options.terrain[i + width + 1]
  // Match the two triangles of the visible terrain, not a nearest-cell stair step.
  // This is display interpolation only; road hydraulic samples are unchanged.
  const elevation =
    fx + fz <= 1 ? a + (b - a) * fx + (c - a) * fz : d + (c - d) * (1 - fx) + (b - d) * (1 - fz)
  return Math.max(0, (elevation - options.terrainMinimum) * options.verticalExaggeration)
}

function finish(vertices: number[], colours: number[]): THREE.BufferGeometry {
  const geometry = new THREE.BufferGeometry()
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(vertices, 3))
  geometry.setAttribute('color', new THREE.Float32BufferAttribute(colours, 3))
  geometry.computeVertexNormals()
  geometry.computeBoundingSphere()
  return geometry
}

function appendVertex(
  vertices: number[],
  colours: number[],
  x: number,
  y: number,
  z: number,
  colour: THREE.Color,
): void {
  vertices.push(x, y, z)
  colours.push(colour.r, colour.g, colour.b)
}

export function buildBuildingGeometry(options: UrbanGeometryOptions): THREE.BufferGeometry {
  const { context } = options
  const vertices: number[] = []
  const colours: number[] = []
  for (let building = 0; building < context.metadata.buildings.count; building += 1) {
    const offset = context.buildingIndex[building * 2]
    const length = context.buildingIndex[building * 2 + 1]
    const points: THREE.Vector2[] = []
    let centreX = 0
    let centreZ = 0
    for (let point = 0; point < length; point += 1) {
      const index = (offset + point) * 2
      const x = context.buildingCoordinates[index]
      const z = context.buildingCoordinates[index + 1]
      points.push(new THREE.Vector2(x, z))
      centreX += x
      centreZ += z
    }
    if (points.length < 3) continue
    centreX /= points.length
    centreZ /= points.length
    const base = terrainY(centreX, centreZ, options) + (options.flat ? 1.2 : 0.7)
    const height = options.flat ? 0.8 : context.buildingHeights[building]
    const colour = buildingColour
    const triangles = THREE.ShapeUtils.triangulateShape(points, [])
    for (const triangle of triangles) {
      // ShapeUtils triangles face -Y when its XY contour is mapped into our XZ
      // ground plane. Reverse them so roof normals face upward and are not
      // removed by normal front-face culling.
      for (const index of [...triangle].reverse()) {
        const point = points[index]
        appendVertex(vertices, colours, point.x, base + height, point.y, colour)
      }
    }
    const wallColour = colour.clone().multiplyScalar(0.58)
    for (let point = 0; point < points.length; point += 1) {
      const current = points[point]
      const next = points[(point + 1) % points.length]
      appendVertex(vertices, colours, current.x, base, current.y, wallColour)
      appendVertex(vertices, colours, next.x, base, next.y, wallColour)
      appendVertex(vertices, colours, current.x, base + height, current.y, wallColour)
      appendVertex(vertices, colours, current.x, base + height, current.y, wallColour)
      appendVertex(vertices, colours, next.x, base, next.y, wallColour)
      appendVertex(vertices, colours, next.x, base + height, next.y, wallColour)
    }
  }
  return finish(vertices, colours)
}

export function buildNetworkGeometry(
  options: UrbanGeometryOptions,
  impactDepth?: Uint16Array,
  impactAgreement?: Uint8Array,
  memberCount = 3,
  threshold = 0.05,
  onlyImpacted = false,
  casing = false,
): THREE.BufferGeometry {
  const { context } = options
  const vertices: number[] = []
  const colours: number[] = []
  for (let line = 0; line < context.metadata.network.count; line += 1) {
    const offset = context.networkIndex[line * 3]
    const length = context.networkIndex[line * 3 + 1]
    const classId = context.networkIndex[line * 3 + 2]
    const style = context.metadata.network.classes[classId]
    const baseColour = new THREE.Color(
      casing ? '#14232b' : (streetColours[classId] ?? style.colour),
    )
    const flagged =
      impactDepth &&
      impactDepth[line] !== 65535 &&
      impactDepth[line] >= Math.round(threshold * 1000)
    if (onlyImpacted && !flagged) continue
    const colour =
      impactDepth && impactAgreement
        ? roadImpactColour(
            flagged ? impactDepth[line] : 0,
            impactAgreement[line],
            memberCount,
            baseColour,
          )
        : baseColour
    const halfWidth = style.widthMetres / 2 + (casing ? 1.5 : 0)
    for (let point = 0; point < length - 1; point += 1) {
      const first = (offset + point) * 2
      const second = first + 2
      const x1 = context.networkCoordinates[first]
      const z1 = context.networkCoordinates[first + 1]
      const x2 = context.networkCoordinates[second]
      const z2 = context.networkCoordinates[second + 1]
      const segmentLength = Math.hypot(x2 - x1, z2 - z1)
      if (segmentLength === 0) continue
      const nx = (-(z2 - z1) / segmentLength) * halfWidth
      const nz = ((x2 - x1) / segmentLength) * halfWidth
      const y1 = terrainY(x1, z1, options) + (options.flat ? 2.3 : 1.2) - (casing ? 0.15 : 0)
      const y2 = terrainY(x2, z2, options) + (options.flat ? 2.3 : 1.2) - (casing ? 0.15 : 0)
      appendVertex(vertices, colours, x1 + nx, y1, z1 + nz, colour)
      appendVertex(vertices, colours, x1 - nx, y1, z1 - nz, colour)
      appendVertex(vertices, colours, x2 + nx, y2, z2 + nz, colour)
      appendVertex(vertices, colours, x2 + nx, y2, z2 + nz, colour)
      appendVertex(vertices, colours, x1 - nx, y1, z1 - nz, colour)
      appendVertex(vertices, colours, x2 - nx, y2, z2 - nz, colour)
    }
  }
  return finish(vertices, colours)
}

/** Roof outlines follow the supplied footprints and heights exactly. */
export function buildBuildingEdges(options: UrbanGeometryOptions): THREE.BufferGeometry {
  const vertices: number[] = []
  const { context } = options
  for (let building = 0; building < context.metadata.buildings.count; building++) {
    const start = context.buildingIndex[building * 2],
      count = context.buildingIndex[building * 2 + 1]
    if (count < 3) continue
    let x = 0,
      z = 0
    for (let i = start; i < start + count; i++) {
      x += context.buildingCoordinates[i * 2]
      z += context.buildingCoordinates[i * 2 + 1]
    }
    const y =
      terrainY(x / count, z / count, options) +
      (options.flat ? 2 : 0.7 + context.buildingHeights[building]) +
      0.06
    for (let i = 0; i < count; i++) {
      for (const p of [start + i, start + ((i + 1) % count)])
        vertices.push(context.buildingCoordinates[p * 2], y, context.buildingCoordinates[p * 2 + 1])
    }
  }
  const geometry = new THREE.BufferGeometry()
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(vertices, 3))
  return geometry
}

/** Mapped landcover, including inner rings; not a hydraulic surface alteration. */
export function buildLandcoverGeometry(options: UrbanGeometryOptions): THREE.BufferGeometry {
  const vertices: number[] = [],
    colours: number[] = []
  const appendDraped = (
    a: THREE.Vector2,
    b: THREE.Vector2,
    c: THREE.Vector2,
    colour: THREE.Color,
    level = 0,
  ): void => {
    const edges = [a.distanceToSquared(b), b.distanceToSquared(c), c.distanceToSquared(a)]
    const longest = Math.max(...edges)
    if (!options.flat && longest > options.grid.cellSizeMetres ** 2 && level < 16) {
      const index = edges.indexOf(longest)
      const p = [a, b, c]
      const first = p[index],
        second = p[(index + 1) % 3],
        third = p[(index + 2) % 3]
      const middle = first.clone().add(second).multiplyScalar(0.5)
      appendDraped(first, middle, third, colour, level + 1)
      appendDraped(middle, second, third, colour, level + 1)
      return
    }
    for (const p of [a, b, c])
      appendVertex(
        vertices,
        colours,
        p.x,
        terrainY(p.x, p.y, options) + (options.flat ? 0.6 : 0.2),
        p.y,
        colour,
      )
  }
  for (const area of options.context.metadata.landcover ?? []) {
    const rings = area.rings.map((ring) =>
      ring.slice(0, -1).map(([x, z]) => new THREE.Vector2(x, z)),
    )
    if (!rings[0] || rings[0].length < 3) continue
    const triangles = THREE.ShapeUtils.triangulateShape(rings[0], rings.slice(1))
    const points = rings.flat()
    const colour = new THREE.Color(area.kind === 'park' ? '#244b3e' : '#21434f')
    for (const [a, b, c] of triangles) appendDraped(points[c], points[b], points[a], colour)
  }
  return finish(vertices, colours)
}

export function elevationAt(
  x: number,
  z: number,
  options: Omit<UrbanGeometryOptions, 'context'>,
): number {
  return terrainY(x, z, { ...options, context: {} as UrbanContextData })
}
