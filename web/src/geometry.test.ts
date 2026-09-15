import { describe, expect, it } from 'vitest'
import {
  buildAgreementGeometry,
  buildTerrainGeometry,
  buildWaterGeometry,
  waterColor,
} from './geometry'

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
    expect(geometry.getAttribute('uv').getX(0)).toBe(0.25)
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

  it('clips at the water-depth threshold instead of covering dry neighbours', () => {
    const geometry = buildWaterGeometry(options, new Float32Array([0.2, 0, 0, 0]), 0.1)
    const positions = geometry.getAttribute('position')
    for (let i = 0; i < positions.count; i += 1) {
      expect(positions.getX(i)).toBeLessThanOrEqual(0.00001)
      expect(positions.getZ(i)).toBeLessThanOrEqual(0.00001)
    }
    const shore = geometry.userData.shoreline as Float32Array
    expect(shore.length).toBe(18) // Only three exterior edges, not interior triangulation.
    for (let i = 0; i < shore.length; i += 3) {
      expect(shore[i]).toBeLessThanOrEqual(0.00001)
      expect(shore[i + 2]).toBeLessThanOrEqual(0.00001)
    }
  })

  it('uses fixed absolute colour stops across frames and clamps extreme depths', () => {
    expect(waterColor(0.3).getHexString()).toBe('48a4c8')
    expect(waterColor(1).getHexString()).toBe('236ca1')
    expect(waterColor(20).getHexString()).toBe(waterColor(2).getHexString())
  })
})
