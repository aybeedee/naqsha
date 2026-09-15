// @vitest-environment jsdom
import { act } from 'react'
import { createRoot } from 'react-dom/client'
import { afterEach, expect, it, vi } from 'vitest'
import { TerrainScene } from './TerrainScene'
import { smallContext, smallScenario } from './testFixtures'
import { timelineDepthForView } from './data'
import * as urban from './urbanGeometry'
import { MapLabelRenderer } from './mapLabels'

const render = vi.hoisted(() => vi.fn())
const dispose = vi.hoisted(() => vi.fn())
vi.mock('three', async (importOriginal) => {
  const original = await importOriginal<typeof import('three')>()
  return {
    ...original,
    WebGLRenderer: class {
      domElement = document.createElement('canvas')
      capabilities = { getMaxAnisotropy: () => 1 }
      shadowMap = { enabled: false, type: 0, autoUpdate: true, needsUpdate: false }
      setPixelRatio() {}
      setSize() {}
      render = render
      dispose = dispose
      getContext() {
        return { isContextLost: () => false }
      }
    },
  }
})
vi.mock('three/addons/controls/OrbitControls.js', async () => {
  const { Vector3 } = await import('three')
  return {
    OrbitControls: class {
      target = new Vector3()
      mouseButtons: Record<string, unknown> = {}
      touches: Record<string, unknown> = {}
      update() {
        return false
      }
      addEventListener() {}
      dispose() {}
    },
  }
})

afterEach(() => {
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
  document.body.innerHTML = ''
})

it('preserves city geometry and uses one label canvas during playback, rendering only on demand', async () => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true)
  vi.stubGlobal(
    'ResizeObserver',
    class {
      observe() {}
      disconnect() {}
    },
  )
  vi.stubGlobal('matchMedia', () => ({ matches: false }))
  vi.spyOn(HTMLElement.prototype, 'clientWidth', 'get').mockReturnValue(1000)
  vi.spyOn(HTMLElement.prototype, 'clientHeight', 'get').mockReturnValue(700)
  const queue: FrameRequestCallback[] = []
  vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) => {
    queue.push(callback)
    return queue.length
  })
  vi.stubGlobal('cancelAnimationFrame', vi.fn())
  const context2d = {
    font: '',
    measureText: () => ({ width: 100 }),
    strokeText: vi.fn(),
    fillText: vi.fn(),
    setTransform: vi.fn(),
    clearRect: vi.fn(),
    beginPath: vi.fn(),
    arc: vi.fn(),
    fill: vi.fn(),
    stroke: vi.fn(),
    save: vi.fn(),
    translate: vi.fn(),
    rotate: vi.fn(),
    restore: vi.fn(),
  }
  const canvases = vi
    .spyOn(HTMLCanvasElement.prototype, 'getContext')
    .mockImplementation(() => context2d as unknown as CanvasRenderingContext2D)
  const buildings = vi.spyOn(urban, 'buildBuildingGeometry')
  const streets = vi.spyOn(urban, 'buildNetworkGeometry')
  const data = smallScenario()
  const context = smallContext()
  const node = document.createElement('div')
  document.body.append(node)
  const root = createRoot(node)
  const props = {
    data,
    context,
    dimension: '3d' as const,
    view: 'city' as const,
    threshold: 0.1,
    verticalExaggeration: 1,
    waterDepthExaggeration: 6,
    showWater: true,
    showBasemap: false,
    showBuildings: true,
    showNetwork: true,
    showLabels: true,
    showRoadImpacts: false,
    action: { type: 'reset' as const, nonce: 0 },
    focus: null,
    selected: null,
    onSelect: vi.fn(),
  }
  await act(async () =>
    root.render(<TerrainScene {...props} displayDepth={timelineDepthForView(data, 'city', 1)} />),
  )
  expect(buildings).toHaveBeenCalledTimes(1)
  expect(streets).toHaveBeenCalledTimes(2) // foreground and casing
  expect(node.querySelectorAll('canvas')).toHaveLength(2) // WebGL + single label overlay
  queue.shift()!(0)
  expect(canvases).toHaveBeenCalledTimes(1)
  expect(render).toHaveBeenCalledTimes(1)
  expect(queue).toHaveLength(0)
  const label = {
    name: 'Test landmark',
    category: 'landmark' as const,
    kind: 'Landmark',
    priority: 90,
    x: 10,
    z: 20,
  }
  vi.spyOn(MapLabelRenderer.prototype, 'hit').mockReturnValue(label)
  const map = node.querySelector('canvas')!
  await act(async () => {
    for (const type of ['pointerdown', 'pointerup']) {
      const event = new MouseEvent(type, { clientX: 500, clientY: 350 })
      Object.defineProperties(event, { isPrimary: { value: true }, pointerId: { value: 1 } })
      map.dispatchEvent(event)
    }
  })
  expect(props.onSelect).toHaveBeenCalledWith({
    x: 10,
    z: 20,
    name: 'Test landmark',
    kind: 'Landmark',
    roadName: undefined,
  })
  await act(async () =>
    root.render(<TerrainScene {...props} displayDepth={timelineDepthForView(data, 'city', 2)} />),
  )
  expect(buildings).toHaveBeenCalledTimes(1)
  expect(streets).toHaveBeenCalledTimes(2)
  expect(node.querySelectorAll('canvas')).toHaveLength(2)
  queue.shift()!(1)
  expect(canvases).toHaveBeenCalledTimes(2)
  expect(render).toHaveBeenCalledTimes(2)
  expect(queue).toHaveLength(0)
  await act(async () => root.unmount())
  expect(dispose).toHaveBeenCalledOnce()
  expect(node.querySelector('canvas')).toBeNull()
})
