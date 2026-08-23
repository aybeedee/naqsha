import { describe, expect, it } from 'vitest'
import { tileCoverage } from './basemap'

describe('OSM basemap coverage', () => {
  it('requests only one bounded zoom for the Lahore model extent', () => {
    const coverage = tileCoverage([74.30456, 31.53453, 74.34532, 31.57536], 15)
    expect(coverage.tileCount).toBeGreaterThan(10)
    expect(coverage.tileCount).toBeLessThanOrEqual(36)
    expect(coverage.maxTileX).toBeGreaterThan(coverage.minTileX)
    expect(coverage.maxTileY).toBeGreaterThan(coverage.minTileY)
  })
})
