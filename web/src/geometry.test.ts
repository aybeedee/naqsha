import { describe, expect, it } from 'vitest'
import { buildAgreementGeometry, buildTerrainGeometry, buildWaterGeometry } from './geometry'

const grid = { width: 2, height: 2, cellSizeMetres: 30 }
const options = {
  grid,
  active: new Uint8Array([1, 1, 1, 1]),
  terrain: new Float32Array([100, 101, 102, 103]),
  terrainMinimum: 100,
  verticalExaggeration: 2,
}

describe('grid geometry', () => {
  it('builds two terrain triangles for one complete cell', () => {
    const geometry = buildTerrainGeometry(options)
    expect(geometry.getAttribute('position').count).toBe(6)
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
    expect(geometry.getAttribute('position').count).toBe(3)
  })
})
