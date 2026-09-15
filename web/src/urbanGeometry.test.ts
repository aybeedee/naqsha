import { describe, expect, it } from 'vitest'
import * as THREE from 'three'
import type { UrbanContextData } from './types'
import {
  buildBuildingGeometry,
  buildBuildingEdges,
  buildLandcoverGeometry,
  buildNetworkGeometry,
  elevationAt,
  roadImpactColour,
} from './urbanGeometry'

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
  it('interpolates display elevations on the actual terrain triangles', () => {
    const surface = { ...options, terrain: new Float32Array([100, 110, 120, 130]) }
    expect(elevationAt(0, 0, surface)).toBeCloseTo(15)
    expect(elevationAt(-15, -15, surface)).toBe(0)
    expect(elevationAt(15, 15, surface)).toBe(30)
    expect(elevationAt(1000, 1000, surface)).toBe(0)
  })
  it('keeps roof outlines at the provided footprint and height', () => {
    const geometry = buildBuildingEdges(options)
    const positions = geometry.getAttribute('position')
    expect(positions.count).toBe(8)
    for (let i = 0; i < positions.count; i++) {
      expect(Math.abs(positions.getX(i))).toBe(5)
      expect(Math.abs(positions.getZ(i))).toBe(5)
      expect(positions.getY(i)).toBeCloseTo(8.76)
    }
  })
  it('preserves courtyards / inner rings when drawing mapped parks', () => {
    const land = buildLandcoverGeometry({
      ...options,
      flat: true,
      context: {
        ...context,
        metadata: {
          ...context.metadata,
          landcover: [
            {
              kind: 'park',
              rings: [
                [
                  [-10, -10],
                  [10, -10],
                  [10, 10],
                  [-10, 10],
                  [-10, -10],
                ],
                [
                  [-5, -5],
                  [-5, 5],
                  [5, 5],
                  [5, -5],
                  [-5, -5],
                ],
              ],
            },
          ],
        },
      },
    })
    const positions = land.getAttribute('position')
    let area = 0
    for (let i = 0; i < positions.count; i += 3) {
      const ax = positions.getX(i + 1) - positions.getX(i),
        az = positions.getZ(i + 1) - positions.getZ(i)
      const bx = positions.getX(i + 2) - positions.getX(i),
        bz = positions.getZ(i + 2) - positions.getZ(i)
      area += Math.abs(ax * bz - az * bx) / 2
    }
    expect(area).toBeCloseTo(300)
  })
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

  it('keeps road depth colours consistent and leaves dry or missing samples uncoloured', () => {
    const fallback = new THREE.Color('#ffffff')
    const shared = roadImpactColour(400, 3, 3, fallback)
    const uncertain = roadImpactColour(400, 1, 3, fallback)
    expect(shared.getHexString()).toBe(uncertain.getHexString())
    expect(roadImpactColour(20, 0, 3, fallback).getHexString()).toBe('ffffff')
    expect(roadImpactColour(65535, 255, 3, fallback).getHexString()).toBe('ffffff')
  })

  it('limits road overlays to segments meeting the active display threshold', () => {
    const geometry = buildNetworkGeometry(
      options,
      new Uint16Array([200]),
      new Uint8Array([3]),
      3,
      0.3,
      true,
    )
    expect(geometry.getAttribute('position').count).toBe(0)
  })
})
