import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { loadCatalog, loadScenario, loadUrbanContext, timelineDepthForView } from './data'
import { buildPlaces, floodedArea, roadSummary, sampledPeakDepth } from './analysis'

const publicRoot = fileURLToPath(new URL('../public/', import.meta.url))
afterEach(() => vi.unstubAllGlobals())

describe('shipped study areas', () => {
  it('loads both areas and keeps timeline, peak, road and map summaries consistent', async () => {
    vi.stubGlobal('fetch', async (path: string) => {
      const file = readFileSync(`${publicRoot}${path}`)
      return {
        ok: true,
        json: async () => JSON.parse(file.toString()),
        arrayBuffer: async () => new Uint8Array(file).buffer,
      }
    })
    const catalog = await loadCatalog()
    expect(catalog.areas).toHaveLength(2)
    for (const area of catalog.areas) {
      const [data, context] = await Promise.all([
        loadScenario(area.scenarioRoot),
        loadUrbanContext(area.contextRoot),
      ])
      expect(data.roadImpact?.lineCount).toBe(context.metadata.network.count)
      expect(data.roadImpact?.frameCount).toBe(data.metadata.timeline.frameCount)
      expect(data.roadImpact?.contextId).toBe(area.id)
      expect(buildPlaces(context).length).toBeGreaterThan(150)
      const zero = timelineDepthForView(data, 'city', 0)
      expect(floodedArea(data, zero, 0.1)).toBe(0)
      expect(roadSummary(data, context, 0, false, 0.1).segments).toBe(0)
      const peak = sampledPeakDepth(data, 'city')
      const index = 12
      const frame = timelineDepthForView(data, 'city', index)
      expect(floodedArea(data, peak, 0.1)).toBeGreaterThanOrEqual(floodedArea(data, frame, 0.1))
      expect(roadSummary(data, context, index, false, 0.1).named.length).toBeGreaterThan(5)
      expect(roadSummary(data, context, index, true, 0.1).flaggedLengthKm).toBeCloseTo(
        data.roadImpact!.peakSummary.roadLengthOver10cmKm,
        3,
      )
      for (let cell = 0; cell < peak.length; cell += 1) {
        expect(Number.isFinite(peak[cell])).toBe(true)
        expect(peak[cell]).toBeGreaterThanOrEqual(frame[cell])
      }
    }
  })
})
