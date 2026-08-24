import { describe, expect, it } from 'vitest'
import { timelineDepthForView } from './data'
import type { ScenarioData } from './types'

function timelineFixture(): ScenarioData {
  return {
    metadata: {
      grid: { width: 2, height: 1 },
      timeline: { frameCount: 2, depthScaleMetres: 0.1 },
    },
    members: [
      { id: 'copernicus', timelineDepth: new Uint16Array([1, 9, 3, 6]) },
      { id: 'fabdem', timelineDepth: new Uint16Array([2, 8, 4, 5]) },
      { id: 'srtm', timelineDepth: new Uint16Array([3, 7, 5, 4]) },
    ],
  } as unknown as ScenarioData
}

describe('timelineDepthForView', () => {
  it('decodes a member frame using the manifest scale', () => {
    expect(Array.from(timelineDepthForView(timelineFixture(), 'copernicus', 0)))
      .toEqual([0.10000000149011612, 0.8999999761581421])
  })

  it('computes the three-member median at the selected frame', () => {
    expect(Array.from(timelineDepthForView(timelineFixture(), 'city', 1)))
      .toEqual([0.4000000059604645, 0.5])
  })

  it('rejects a frame outside the exported timeline', () => {
    expect(() => timelineDepthForView(timelineFixture(), 'city', 2)).toThrow(RangeError)
  })
})
