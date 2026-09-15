import { describe, expect, it } from 'vitest'
import {
  buildPlaces,
  cellAt,
  floodedArea,
  formatDepth,
  roadSummary,
  sampledPeakDepth,
  searchPlaces,
} from './analysis'
import { smallContext, smallScenario } from './testFixtures'
import { readViewState, writeViewState } from './viewState'

describe('depth interpretation', () => {
  it('keeps inactive and out-of-bound cells distinct from dry cells', () => {
    const data = smallScenario()
    expect(cellAt(data, -15, -15)).toBe(0)
    expect(cellAt(data, 15, 15)).toBeNull()
    expect(cellAt(data, 10000, 0)).toBeNull()
  })
  it('counts only active cells, including float32 values on the threshold', () => {
    expect(floodedArea(smallScenario(), new Float32Array([0.3, 0.1, 0.05, 10]), 0.3)).toBeCloseTo(
      0.0009,
    )
    expect(floodedArea(smallScenario(), new Float32Array([0.3, 0.1, 0.05, 10]), 0.1)).toBeCloseTo(
      0.0018,
    )
  })
  it('does not replace peak of medians with median of peaks', () => {
    const data = smallScenario()
    data.members[0].timelineDepth = new Uint16Array([
      900, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0,
    ])
    data.members[1].timelineDepth = new Uint16Array([
      0, 0, 0, 0, 900, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0,
    ])
    data.members[2].timelineDepth = new Uint16Array(16)
    expect(sampledPeakDepth(data, 'city')[0]).toBe(0)
    expect(sampledPeakDepth(data, 'copernicus')[0]).toBeCloseTo(0.9)
  })
  it('uses human-sized depth units without implying millimetre accuracy', () => {
    expect(formatDepth(0)).toBe('0 cm')
    expect(formatDepth(0.008)).toBe('<1 cm')
    expect(formatDepth(0.284)).toBe('28 cm')
    expect(formatDepth(1.234)).toBe('1.2 m')
  })
})

describe('places and road exposure', () => {
  it('retains separate branches and searches original-language aliases', () => {
    const context = smallContext()
    const original = context.metadata.labels[0]
    context.metadata.labels = [
      { ...original, name: 'Branch', aliases: ['لاہور'], x: 0, z: 0 },
      { ...original, name: 'Branch', x: 400, z: 0 },
    ]
    const places = buildPlaces(context)
    expect(searchPlaces(places, 'branch')).toHaveLength(2)
    expect(searchPlaces(places, 'لاہور')[0].x).toBe(0)
  })
  it('ranks named roads by depth and ignores unavailable samples', () => {
    const result = roadSummary(smallScenario(), smallContext(), 2, false, 0.3)
    expect(result.segments).toBe(2)
    expect(result.totalSegments).toBe(2)
    expect(result.flaggedLengthKm).toBe(0.5)
    expect(result.named.map((road) => road.name)).toEqual(['Lawrence Road', 'Mall Road'])
    expect(roadSummary(smallScenario(), smallContext(), 0, false, 0.1).segments).toBe(0)
  })
  it('uses the active threshold for both road counts and rankings', () => {
    const result = roadSummary(smallScenario(), smallContext(), 2, false, 0.6)
    expect(result.segments).toBe(1)
    expect(result.named[0].name).toBe('Lawrence Road')
  })
  it('finds landmarks and named roads without including park lines as roads', () => {
    const places = buildPlaces(smallContext())
    expect(searchPlaces(places, '  MALL  ')[0].roadName).toBe('Mall Road')
    expect(searchPlaces(places, 'gpo')[0].name).toBe('GPO')
    expect(places.some((p) => p.name === 'Park')).toBe(false)
    expect(searchPlaces(places, 'unmapped')).toEqual([])
  })
})

describe('shared views', () => {
  it('round-trips the area, time, map, terrain and threshold', () => {
    const state = {
      view: 'srtm',
      dimension: '2d',
      mode: 'maximum',
      frame: 9,
      threshold: 0.3,
    } as const
    const link = writeViewState(new URL('https://example.com/'), 'gulberg-liberty', state)
    expect(new URL(link).searchParams.get('area')).toBe('gulberg-liberty')
    expect(readViewState(new URL(link).search, 25, 12)).toEqual(state)
  })
  it('rejects unsupported values and clamps bad timeline links', () => {
    expect(readViewState('?view=bad&t=500&depth=-50&map=4d', 25, 12)).toEqual({
      view: 'city',
      frame: 24,
      threshold: 0.1,
      dimension: '3d',
      mode: 'timeline',
    })
    expect(readViewState('?t=NaN', 25, 12).frame).toBe(12)
  })
})
