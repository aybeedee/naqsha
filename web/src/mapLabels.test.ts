// @vitest-environment jsdom
import { afterEach, expect, it, vi } from 'vitest'
import * as THREE from 'three'
import { MapLabelRenderer, mapLabels, overlaps } from './mapLabels'
import type { MapLabel } from './mapLabels'
import { smallContext } from './testFixtures'
import { readFileSync } from 'node:fs'
import { fileURLToPath, URL as NodeURL } from 'node:url'
import { loadUrbanContext } from './data'
const publicRoot = fileURLToPath(new NodeURL('../public/', import.meta.url))

afterEach(() => {
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
})

function canvas() {
  const ctx = {
    setTransform: vi.fn(),
    clearRect: vi.fn(),
    font: '',
    measureText: (text: string) => ({ width: text.length * 6 }),
    beginPath: vi.fn(),
    arc: vi.fn(),
    fill: vi.fn(),
    stroke: vi.fn(),
    save: vi.fn(),
    translate: vi.fn(),
    rotate: vi.fn(),
    strokeText: vi.fn(),
    fillText: vi.fn(),
    restore: vi.fn(),
  }
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(
    ctx as unknown as CanvasRenderingContext2D,
  )
  return document.createElement('canvas')
}
function camera(width = 1200, height = 750) {
  const result = new THREE.PerspectiveCamera(38, width / height, 2, 45000)
  result.position.set(500, 5200, 4100)
  result.lookAt(0, 0, 0)
  result.updateMatrixWorld()
  return result
}

it('anchors names on streets and never creates names for anonymous buildings', () => {
  const context = smallContext()
  const labels = mapLabels(context)
  expect(labels.filter((l) => l.category === 'road').every((l) => l.roadName && l.end)).toBe(true)
  expect(labels.filter((l) => l.category !== 'road')).toHaveLength(context.metadata.labels.length)
})

it('fits text around collisions, reserves UI space and lets dots reveal their names', () => {
  const labels: MapLabel[] = Array.from({ length: 100 }, (_, i) => ({
    name: `Place ${i}`,
    category: 'shopping',
    kind: 'Shop',
    priority: 46,
    x: (i % 10) * 90 - 450,
    z: Math.floor(i / 10) * 90 - 450,
  }))
  const renderer = new MapLabelRenderer(canvas(), labels)
  const blocked = { left: 0, right: 300, top: 0, bottom: 200 }
  renderer.draw(camera(), 1200, 750, () => 0, [blocked], true, null, null)
  const names = renderer.placed.filter((item) => !item.dotOnly)
  expect(names.length).toBeGreaterThan(10)
  expect(renderer.placed.every((item) => !overlaps(item, blocked))).toBe(true)
  for (let i = 0; i < names.length; i++)
    for (let j = i + 1; j < names.length; j++) expect(overlaps(names[i], names[j])).toBe(false)
  const dot = renderer.placed.find((item) => item.dotOnly)!
  expect(dot).toBeTruthy()
  const label = renderer.hit(dot.anchorX, dot.anchorY)
  expect(label).toBe(dot.label)
  renderer.draw(camera(), 1200, 750, () => 0, [], true, label, null)
  expect(renderer.placed[0].dotOnly).toBe(false)
  expect(renderer.hit(dot.anchorX, dot.anchorY)).toBe(label) // No hover flicker after revealing text.
  renderer.draw(camera(), 1200, 750, () => 0, [], false, null, null)
  expect(renderer.placed).toHaveLength(0)
})

it('keeps dense, non-overlapping labels in both shipped districts on desktop and mobile', async () => {
  vi.stubGlobal('fetch', async (path: string) => {
    const file = readFileSync(`${publicRoot}${path}`)
    return {
      ok: true,
      json: async () => JSON.parse(file.toString()),
      arrayBuffer: async () => new Uint8Array(file).buffer,
    }
  })
  for (const area of ['central-lahore', 'gulberg-liberty']) {
    const context = await loadUrbanContext(`/context/${area}`)
    expect(context.metadata.labels.length).toBeGreaterThan(1000)
    const labels = mapLabels(context)
    for (const [width, height] of [
      [1200, 750],
      [390, 600],
    ]) {
      const renderer = new MapLabelRenderer(canvas(), labels)
      renderer.draw(camera(width, height), width, height, () => 0, [], true, null, null)
      const visible = renderer.placed.filter((item) => !item.dotOnly)
      expect(visible.length).toBeGreaterThan(width > 400 ? 80 : 30)
      for (let i = 0; i < visible.length; i++)
        for (let j = i + 1; j < visible.length; j++)
          expect(overlaps(visible[i], visible[j])).toBe(false)
    }
  }
})
