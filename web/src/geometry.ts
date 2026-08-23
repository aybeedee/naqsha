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

function position(
  index: number,
  elevation: number,
  grid: GeometryGrid,
  terrainMinimum: number,
  verticalExaggeration: number,
): [number, number, number] {
  const row = Math.floor(index / grid.width)
  const column = index % grid.width
  return [
    (column - (grid.width - 1) / 2) * grid.cellSizeMetres,
    (elevation - terrainMinimum) * verticalExaggeration,
    (row - (grid.height - 1) / 2) * grid.cellSizeMetres,
  ]
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

function finishGeometry(vertices: number[], colors: number[]): THREE.BufferGeometry {
  const geometry = new THREE.BufferGeometry()
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(vertices, 3))
  geometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3))
  geometry.computeVertexNormals()
  geometry.computeBoundingSphere()
  return geometry
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
  return finishGeometry(vertices, colors)
}

export function buildWaterGeometry(
  options: SurfaceOptions,
  depth: Float32Array,
  threshold: number,
): THREE.BufferGeometry {
  const { grid, active, terrain } = options
  const vertices: number[] = []
  const colors: number[] = []
  const waterElevation = terrain.map((value, index) => value + Math.max(depth[index], 0.01))
  let maximumDepth = threshold
  for (const value of depth) maximumDepth = Math.max(maximumDepth, value)
  const colorFor = (index: number) =>
    shallowWater.clone().lerp(deepWater, Math.min(depth[index] / maximumDepth, 1))

  for (let row = 0; row < grid.height - 1; row += 1) {
    for (let column = 0; column < grid.width - 1; column += 1) {
      const northwest = row * grid.width + column
      const corners = [northwest, northwest + 1, northwest + grid.width, northwest + grid.width + 1]
      if (!corners.every((index) => active[index])) continue
      const triangles = [
        [corners[0], corners[2], corners[1]],
        [corners[1], corners[2], corners[3]],
      ]
      for (const triangle of triangles) {
        if (!triangle.some((index) => depth[index] >= threshold)) continue
        appendTriangle(vertices, colors, triangle, waterElevation, colorFor, options)
      }
    }
  }
  return finishGeometry(vertices, colors)
}

export function buildAgreementGeometry(
  options: SurfaceOptions,
  maximumDepth: Float32Array,
  agreement: Uint8Array,
): THREE.BufferGeometry {
  const { grid, active, terrain } = options
  const vertices: number[] = []
  const colors: number[] = []
  const waterElevation = terrain.map((value, index) => value + Math.max(maximumDepth[index], 0.02))
  for (let row = 0; row < grid.height - 1; row += 1) {
    for (let column = 0; column < grid.width - 1; column += 1) {
      const northwest = row * grid.width + column
      const corners = [northwest, northwest + 1, northwest + grid.width, northwest + grid.width + 1]
      if (!corners.every((index) => active[index])) continue
      const triangles = [
        [corners[0], corners[2], corners[1]],
        [corners[1], corners[2], corners[3]],
      ]
      for (const triangle of triangles) {
        const counts = triangle
          .map((index) => agreement[index])
          .filter((count) => count > 0 && count < 255)
        if (!counts.length) continue
        // Classify the face conservatively: never paint a triangle as broadly
        // agreed when any of its wet vertices is source-specific.
        const faceColor = agreementColors[Math.min(...counts)]
        appendTriangle(vertices, colors, triangle, waterElevation, () => faceColor, options)
      }
    }
  }
  return finishGeometry(vertices, colors)
}
