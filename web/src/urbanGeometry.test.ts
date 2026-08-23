import { describe, expect, it } from 'vitest'
import type { UrbanContextData } from './types'
import { buildBuildingGeometry, buildNetworkGeometry } from './urbanGeometry'

const context = {
  metadata: {
    buildings: { count: 1 },
    network: {
      count: 1,
      classes: [{ id: 0, name: 'road', widthMetres: 4, colour: '#ffffff' }],
    },
  },
  buildingCoordinates: new Float32Array([-5, -5, 5, -5, 5, 5, -5, 5]),
  buildingIndex: new Uint32Array([0, 4]),
  buildingHeights: new Float32Array([8]),
  buildingSource: new Uint8Array([1]),
  networkCoordinates: new Float32Array([-10, 0, 10, 0]),
  networkIndex: new Uint32Array([0, 2, 0]),
} as unknown as UrbanContextData

const options = {
  context,
  grid: {
    width: 2,
    height: 2,
    cellSizeMetres: 30,
    crs: 'EPSG:32643',
    transform: [30, 0, 0, 0, -30, 0],
    bounds: [0, 0, 60, 60],
    geographicBounds: [74.3, 31.5, 74.4, 31.6],
    extentWidthMetres: 60,
    extentHeightMetres: 60,
    activeFile: 'active.u8',
  },
  terrain: new Float32Array([100, 100, 100, 100]),
  terrainMinimum: 100,
  verticalExaggeration: 1,
  flat: false,
}

describe('urban geometry', () => {
  it('extrudes a building footprint', () => {
    const geometry = buildBuildingGeometry(options)
    expect(geometry.getAttribute('position').count).toBeGreaterThan(6)
    const normals = geometry.getAttribute('normal')
    expect(normals.getY(0)).toBeGreaterThan(0.9)
  })

  it('turns a mapped line into a visible ribbon', () => {
    const geometry = buildNetworkGeometry(options)
    expect(geometry.getAttribute('position').count).toBe(6)
  })
})
