import { describe, expect, it } from 'vitest'
import { buildAgreementGeometry, buildTerrainGeometry, buildWaterGeometry } from './geometry'

const grid = { width: 2, height: 2, cellSizeMetres: 30 }
const options = {
  grid,
  active: new Uint8Array([1, 1, 1, 1]),
  terrain: new Float32Array([100, 101, 102, 103]),
  terrainMinimum: 100,
  verticalExaggeration: 2,
  waterDepthExaggeration: 6,
}

describe('grid geometry', () => {
  it('builds two terrain triangles for one complete cell', () => {
    const geometry = buildTerrainGeometry(options)
    expect(geometry.getAttribute('position').count).toBe(6)
    expect(geometry.getAttribute('uv').count).toBe(6)
  })

  it('omits water below the selected threshold', () => {
    const geometry = buildWaterGeometry(options, new Float32Array([0.05, 0.05, 0, 0]), 0.1)
    expect(geometry.getAttribute('position').count).toBe(0)
  })

  it('renders agreement when at least one terrain is wet', () => {
    const geometry = buildAgreementGeometry(
      options,
      new Float32Array([0.2, 0, 0, 0]),
      new Uint8Array([1, 0, 0, 0]),
    )
    expect(geometry.getAttribute('position').count).toBe(21)
  })

  it('closes flood geometry with vertically exaggerated boundary walls', () => {
    const geometry = buildWaterGeometry(
      { ...options, terrain: new Float32Array([100, 100, 100, 100]) },
      new Float32Array([0.2, 0, 0, 0]),
      0.1,
    )
    const positions = geometry.getAttribute('position')
    const elevations = Array.from({ length: positions.count }, (_, index) => positions.getY(index))
    expect(Math.max(...elevations)).toBeCloseTo(1.55)
    expect(Math.min(...elevations)).toBeCloseTo(0.35)
  })
})
