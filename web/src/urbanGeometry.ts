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

const sourceColours = [
  new THREE.Color('#99a7a1'),
  new THREE.Color('#c1c6ba'),
  new THREE.Color('#aebbb3'),
  new THREE.Color('#9eaaa4'),
  new THREE.Color('#adb0a2'),
]

const roadImpactColours = {
  shallow: new THREE.Color('#e2d263'),
  moderate: new THREE.Color('#f19a4b'),
  severe: new THREE.Color('#ed5d55'),
  uncertain: new THREE.Color('#9b7565'),
}

export function roadImpactColour(
  depthMillimetres: number,
  wetMemberCount: number,
  memberCount: number,
  fallback: THREE.Color,
): THREE.Color {
  if (depthMillimetres === 65535 || depthMillimetres < 50) return fallback
  const risk = depthMillimetres >= 300
    ? roadImpactColours.severe
    : depthMillimetres >= 100 ? roadImpactColours.moderate : roadImpactColours.shallow
  if (depthMillimetres >= 100 && wetMemberCount < memberCount) {
    return risk.clone().lerp(roadImpactColours.uncertain, 0.42)
  }
  return risk
}

function terrainY(x: number, z: number, options: UrbanGeometryOptions): number {
  if (options.flat) return 0
  const column = Math.round(x / options.grid.cellSizeMetres + (options.grid.width - 1) / 2)
  const row = Math.round(z / options.grid.cellSizeMetres + (options.grid.height - 1) / 2)
  if (column < 0 || row < 0 || column >= options.grid.width || row >= options.grid.height) return 0
  const elevation = options.terrain[row * options.grid.width + column]
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
    const source = Math.min(context.buildingSource[building], sourceColours.length - 1)
    const colour = sourceColours[source]
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
    for (let point = 0; point < points.length; point += 1) {
      const current = points[point]
      const next = points[(point + 1) % points.length]
      appendVertex(vertices, colours, current.x, base, current.y, colour)
      appendVertex(vertices, colours, next.x, base, next.y, colour)
      appendVertex(vertices, colours, current.x, base + height, current.y, colour)
      appendVertex(vertices, colours, current.x, base + height, current.y, colour)
      appendVertex(vertices, colours, next.x, base, next.y, colour)
      appendVertex(vertices, colours, next.x, base + height, next.y, colour)
    }
  }
  return finish(vertices, colours)
}

export function buildNetworkGeometry(
  options: UrbanGeometryOptions,
  impactDepth?: Uint16Array,
  impactAgreement?: Uint8Array,
  memberCount = 3,
): THREE.BufferGeometry {
  const { context } = options
  const vertices: number[] = []
  const colours: number[] = []
  for (let line = 0; line < context.metadata.network.count; line += 1) {
    const offset = context.networkIndex[line * 3]
    const length = context.networkIndex[line * 3 + 1]
    const classId = context.networkIndex[line * 3 + 2]
    const style = context.metadata.network.classes[classId]
    const colour = impactDepth && impactAgreement
      ? roadImpactColour(impactDepth[line], impactAgreement[line], memberCount, new THREE.Color(style.colour))
      : new THREE.Color(style.colour)
    const halfWidth = style.widthMetres / 2
    for (let point = 0; point < length - 1; point += 1) {
      const first = (offset + point) * 2
      const second = first + 2
      const x1 = context.networkCoordinates[first]
      const z1 = context.networkCoordinates[first + 1]
      const x2 = context.networkCoordinates[second]
      const z2 = context.networkCoordinates[second + 1]
      const segmentLength = Math.hypot(x2 - x1, z2 - z1)
      if (segmentLength === 0) continue
      const nx = -(z2 - z1) / segmentLength * halfWidth
      const nz = (x2 - x1) / segmentLength * halfWidth
      const y1 = terrainY(x1, z1, options) + (options.flat ? 2.3 : 1.2)
      const y2 = terrainY(x2, z2, options) + (options.flat ? 2.3 : 1.2)
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

export function elevationAt(
  x: number,
  z: number,
  options: Omit<UrbanGeometryOptions, 'context'>,
): number {
  return terrainY(x, z, { ...options, context: {} as UrbanContextData })
}
