import * as THREE from 'three'

interface GeometryGrid {
  width: number
  height: number
  cellSizeMetres: number
}

interface SurfaceOptions {
  grid: GeometryGrid
  active: Uint8Array
  terrain: Float32Array
  verticalExaggeration: number
  terrainMinimum: number
  waterDepthExaggeration?: number
  waterBaseOffset?: number
}

interface VolumeTriangle {
  indices: number[]
  colorFor: (index: number) => THREE.Color
}

interface BoundaryEdge {
  first: number
  second: number
  count: number
  colorFor: (index: number) => THREE.Color
}

const terrainLow = new THREE.Color('#273f3d')
const terrainHigh = new THREE.Color('#b7b08d')
const shallowWater = new THREE.Color('#42d9d2')
const deepWater = new THREE.Color('#1766b1')
const agreementColors = [
  new THREE.Color('#000000'),
  new THREE.Color('#f06c5e'),
  new THREE.Color('#e9b949'),
  new THREE.Color('#43d5c5'),
]

function horizontalPosition(index: number, grid: GeometryGrid): [number, number] {
  const row = Math.floor(index / grid.width)
  const column = index % grid.width
  return [
    (column - (grid.width - 1) / 2) * grid.cellSizeMetres,
    (row - (grid.height - 1) / 2) * grid.cellSizeMetres,
  ]
}

function position(
  index: number,
  elevation: number,
  grid: GeometryGrid,
  terrainMinimum: number,
  verticalExaggeration: number,
): [number, number, number] {
  const [x, z] = horizontalPosition(index, grid)
  return [x, (elevation - terrainMinimum) * verticalExaggeration, z]
}

function appendSceneVertex(
  vertices: number[],
  colors: number[],
  index: number,
  y: number,
  color: THREE.Color,
  grid: GeometryGrid,
): void {
  const [x, z] = horizontalPosition(index, grid)
  vertices.push(x, y, z)
  colors.push(color.r, color.g, color.b)
}

function appendTriangle(
  vertices: number[],
  colors: number[],
  indices: number[],
  elevations: Float32Array,
  colorFor: (index: number) => THREE.Color,
  options: SurfaceOptions,
): void {
  for (const index of indices) {
    vertices.push(
      ...position(
        index,
        elevations[index],
        options.grid,
        options.terrainMinimum,
        options.verticalExaggeration,
      ),
    )
    const color = colorFor(index)
    colors.push(color.r, color.g, color.b)
  }
}

function appendSceneTriangle(
  vertices: number[],
  colors: number[],
  indices: number[],
  y: Float32Array,
  colorFor: (index: number) => THREE.Color,
  grid: GeometryGrid,
): void {
  for (const index of indices) {
    appendSceneVertex(vertices, colors, index, y[index], colorFor(index), grid)
  }
}

function finishGeometry(vertices: number[], colors: number[]): THREE.BufferGeometry {
  const geometry = new THREE.BufferGeometry()
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(vertices, 3))
  geometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3))
  geometry.computeVertexNormals()
  geometry.computeBoundingSphere()
  return geometry
}

function terrainSceneY(options: SurfaceOptions): Float32Array {
  const offset = options.waterBaseOffset ?? 0.35
  return options.terrain.map(
    (elevation) => (elevation - options.terrainMinimum) * options.verticalExaggeration + offset,
  )
}

function appendVolume(
  vertices: number[],
  colors: number[],
  triangles: VolumeTriangle[],
  groundY: Float32Array,
  topY: Float32Array,
  grid: GeometryGrid,
): void {
  const edges = new Map<string, BoundaryEdge>()
  for (const triangle of triangles) {
    appendSceneTriangle(vertices, colors, triangle.indices, topY, triangle.colorFor, grid)
    for (let index = 0; index < 3; index += 1) {
      const first = triangle.indices[index]
      const second = triangle.indices[(index + 1) % 3]
      const key = first < second ? `${first}:${second}` : `${second}:${first}`
      const existing = edges.get(key)
      if (existing) existing.count += 1
      else edges.set(key, { first, second, count: 1, colorFor: triangle.colorFor })
    }
  }
  for (const edge of edges.values()) {
    if (edge.count !== 1) continue
    const firstColor = edge.colorFor(edge.first).clone().multiplyScalar(0.62)
    const secondColor = edge.colorFor(edge.second).clone().multiplyScalar(0.62)
    appendSceneVertex(vertices, colors, edge.first, groundY[edge.first], firstColor, grid)
    appendSceneVertex(vertices, colors, edge.second, groundY[edge.second], secondColor, grid)
    appendSceneVertex(vertices, colors, edge.first, topY[edge.first], firstColor, grid)
    appendSceneVertex(vertices, colors, edge.first, topY[edge.first], firstColor, grid)
    appendSceneVertex(vertices, colors, edge.second, groundY[edge.second], secondColor, grid)
    appendSceneVertex(vertices, colors, edge.second, topY[edge.second], secondColor, grid)
  }
}

export function buildTerrainGeometry(options: SurfaceOptions): THREE.BufferGeometry {
  const { grid, active, terrain } = options
  const vertices: number[] = []
  const colors: number[] = []
  let maximum = options.terrainMinimum
  for (let index = 0; index < terrain.length; index += 1) {
    if (active[index]) maximum = Math.max(maximum, terrain[index])
  }
  const span = Math.max(maximum - options.terrainMinimum, 1)
  const colorFor = (index: number) =>
    terrainLow.clone().lerp(terrainHigh, (terrain[index] - options.terrainMinimum) / span)

  for (let row = 0; row < grid.height - 1; row += 1) {
    for (let column = 0; column < grid.width - 1; column += 1) {
      const northwest = row * grid.width + column
      const corners = [northwest, northwest + 1, northwest + grid.width, northwest + grid.width + 1]
      if (!corners.every((index) => active[index])) continue
      appendTriangle(vertices, colors, [corners[0], corners[2], corners[1]], terrain, colorFor, options)
      appendTriangle(vertices, colors, [corners[1], corners[2], corners[3]], terrain, colorFor, options)
    }
  }
  const geometry = finishGeometry(vertices, colors)
  const positions = geometry.getAttribute('position')
  const extentX = Math.max((grid.width - 1) * grid.cellSizeMetres, 1)
  const extentZ = Math.max((grid.height - 1) * grid.cellSizeMetres, 1)
  const uvs: number[] = []
  for (let index = 0; index < positions.count; index += 1) {
    uvs.push(
      (positions.getX(index) + extentX / 2) / extentX,
      1 - (positions.getZ(index) + extentZ / 2) / extentZ,
    )
  }
  geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2))
  return geometry
}

export function buildWaterGeometry(
  options: SurfaceOptions,
  depth: Float32Array,
  threshold: number,
): THREE.BufferGeometry {
  const { grid, active } = options
  const vertices: number[] = []
  const colors: number[] = []
  const groundY = terrainSceneY(options)
  const depthExaggeration = options.waterDepthExaggeration ?? 1
  const topY = groundY.map((value, index) => value + Math.max(depth[index], 0.01) * depthExaggeration)
  let maximumDepth = threshold
  for (const value of depth) maximumDepth = Math.max(maximumDepth, value)
  const colorFor = (index: number) =>
    shallowWater.clone().lerp(deepWater, Math.min(depth[index] / maximumDepth, 1))
  const rendered: VolumeTriangle[] = []

  for (let row = 0; row < grid.height - 1; row += 1) {
    for (let column = 0; column < grid.width - 1; column += 1) {
      const northwest = row * grid.width + column
      const corners = [northwest, northwest + 1, northwest + grid.width, northwest + grid.width + 1]
      if (!corners.every((index) => active[index])) continue
      const triangles = [
        [corners[0], corners[2], corners[1]],
        [corners[1], corners[2], corners[3]],
      ]
      for (const indices of triangles) {
        if (indices.some((index) => depth[index] >= threshold)) {
          rendered.push({ indices, colorFor })
        }
      }
    }
  }
  appendVolume(vertices, colors, rendered, groundY, topY, grid)
  return finishGeometry(vertices, colors)
}

export function buildAgreementGeometry(
  options: SurfaceOptions,
  maximumDepth: Float32Array,
  agreement: Uint8Array,
): THREE.BufferGeometry {
  const { grid, active } = options
  const vertices: number[] = []
  const colors: number[] = []
  const groundY = terrainSceneY(options)
  const depthExaggeration = options.waterDepthExaggeration ?? 1
  const topY = groundY.map(
    (value, index) => value + Math.max(maximumDepth[index], 0.02) * depthExaggeration,
  )
  const rendered: VolumeTriangle[] = []
  for (let row = 0; row < grid.height - 1; row += 1) {
    for (let column = 0; column < grid.width - 1; column += 1) {
      const northwest = row * grid.width + column
      const corners = [northwest, northwest + 1, northwest + grid.width, northwest + grid.width + 1]
      if (!corners.every((index) => active[index])) continue
      const triangles = [
        [corners[0], corners[2], corners[1]],
        [corners[1], corners[2], corners[3]],
      ]
      for (const indices of triangles) {
        const counts = indices
          .map((index) => agreement[index])
          .filter((count) => count > 0 && count < 255)
        if (!counts.length) continue
        // Classify the face conservatively: never paint a triangle as broadly
        // agreed when any of its wet vertices is source-specific.
        const faceColor = agreementColors[Math.min(...counts)]
        rendered.push({ indices, colorFor: () => faceColor })
      }
    }
  }
  appendVolume(vertices, colors, rendered, groundY, topY, grid)
  return finishGeometry(vertices, colors)
}
