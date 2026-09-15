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

const terrainLow = new THREE.Color('#b7c9b0')
const terrainHigh = new THREE.Color('#d7cdb3')
const waterStops = [0, 0.3, 1, 2]
const waterColors = ['#90cee0', '#48a4c8', '#236ca1', '#173a6b'].map((hex) => new THREE.Color(hex))
export function waterColor(depth: number): THREE.Color {
  const value = THREE.MathUtils.clamp(depth, 0, 2)
  for (let stop = 1; stop < waterStops.length; stop += 1) {
    if (value <= waterStops[stop])
      return waterColors[stop - 1]
        .clone()
        .lerp(
          waterColors[stop],
          (value - waterStops[stop - 1]) / (waterStops[stop] - waterStops[stop - 1]),
        )
  }
  return waterColors[3].clone()
}
const agreementColors = [
  new THREE.Color('#000000'),
  new THREE.Color('#dc806b'),
  new THREE.Color('#d2b66c'),
  new THREE.Color('#62b9a1'),
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
      appendTriangle(
        vertices,
        colors,
        [corners[0], corners[2], corners[1]],
        terrain,
        colorFor,
        options,
      )
      appendTriangle(
        vertices,
        colors,
        [corners[1], corners[2], corners[3]],
        terrain,
        colorFor,
        options,
      )
    }
  }
  const geometry = finishGeometry(vertices, colors)
  const positions = geometry.getAttribute('position')
  // Geographic bounds cover cell edges; mesh vertices are cell centres.
  const extentX = Math.max(grid.width * grid.cellSizeMetres, 1)
  const extentZ = Math.max(grid.height * grid.cellSizeMetres, 1)
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
  const topY = groundY.map(
    (value, index) => value + Math.max(depth[index], 0.01) * depthExaggeration,
  )
  type Vertex = { key: string; x: number; z: number; base: number; top: number; depth: number }
  const points = new Map<number, Vertex>()
  const edges = new Map<string, { first: Vertex; second: Vertex; count: number }>()
  const vertexAt = (index: number): Vertex => {
    let point = points.get(index)
    if (!point) {
      const [x, z] = horizontalPosition(index, grid)
      point = {
        key: String(index),
        x,
        z,
        base: groundY[index],
        top: topY[index],
        depth: depth[index],
      }
      points.set(index, point)
    }
    return point
  }
  const append = (point: Vertex, base = false) => {
    vertices.push(point.x, base ? point.base : point.top, point.z)
    const color = waterColor(point.depth)
    if (base) color.multiplyScalar(0.8)
    colors.push(color.r, color.g, color.b)
  }
  const intersect = (first: Vertex, second: Vertex): Vertex => {
    const fraction = (threshold - first.depth) / (second.depth - first.depth)
    if (fraction <= 1e-7) return first
    if (fraction >= 1 - 1e-7) return second
    const mix = (a: number, b: number) => a + (b - a) * fraction
    return {
      key: [first.key, second.key].sort().join(':'),
      x: mix(first.x, second.x),
      z: mix(first.z, second.z),
      base: mix(first.base, second.base),
      top: mix(first.top, second.top),
      depth: threshold,
    }
  }

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
        if (!indices.some((index) => depth[index] + 1e-7 >= threshold)) continue
        // Clip the displayed surface at the depth filter. A single wet vertex
        // must not paint its dry neighbours as flooded ground.
        const polygon: Vertex[] = []
        for (let i = 0; i < 3; i += 1) {
          const first = vertexAt(indices[i])
          const second = vertexAt(indices[(i + 1) % 3])
          const firstWet = first.depth + 1e-7 >= threshold
          const secondWet = second.depth + 1e-7 >= threshold
          if (firstWet !== secondWet) polygon.push(intersect(first, second))
          if (secondWet) polygon.push(second)
        }
        const unique = polygon.filter(
          (point, i) => polygon.findIndex((other) => other.key === point.key) === i,
        )
        if (unique.length < 3) continue
        for (let i = 1; i < unique.length - 1; i += 1) {
          append(unique[0])
          append(unique[i])
          append(unique[i + 1])
        }
        for (let i = 0; i < unique.length; i += 1) {
          const first = unique[i]
          const second = unique[(i + 1) % unique.length]
          const key = [first.key, second.key].sort().join('|')
          const existing = edges.get(key)
          if (existing) existing.count += 1
          else edges.set(key, { first, second, count: 1 })
        }
      }
    }
  }
  for (const edge of edges.values()) {
    if (edge.count !== 1) continue
    append(edge.first, true)
    append(edge.second, true)
    append(edge.first)
    append(edge.first)
    append(edge.second, true)
    append(edge.second)
  }
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
