// @vitest-environment jsdom
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { Explorer } from './Explorer'
import { smallCatalog, smallContext, smallScenario } from './testFixtures'

// UI state tests use a DOM, not a WebGL implementation. Geometry is tested separately.
vi.mock('./TerrainScene', () => ({
  TerrainScene: ({ onSelect }: { onSelect: (point: { x: number; z: number }) => void }) => (
    <button aria-label="Inspect test map cell" onClick={() => onSelect({ x: -15, z: -15 })}>
      Map
    </button>
  ),
}))
let container: HTMLDivElement
let root: Root
const changeArea = vi.fn()
function button(label: string) {
  const result = [...container.querySelectorAll('button')].find(
    (b) => b.getAttribute('aria-label') === label || b.textContent === label,
  )
  if (!result) throw new Error(`No button: ${label}`)
  return result
}
async function click(label: string) {
  await act(async () => button(label).click())
}
async function mount(search = '') {
  window.history.replaceState(null, '', `/${search}`)
  await act(async () =>
    root.render(
      <Explorer
        data={smallScenario()}
        context={smallContext()}
        catalog={smallCatalog}
        area={smallCatalog.areas[0]}
        onAreaChange={changeArea}
      />,
    ),
  )
}
beforeEach(() => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true)
  vi.stubGlobal('innerWidth', 1200)
  HTMLDialogElement.prototype.showModal = function () {
    this.open = true
  }
  HTMLDialogElement.prototype.close = function () {
    this.open = false
  }
  container = document.createElement('div')
  document.body.append(container)
  root = createRoot(container)
  changeArea.mockClear()
})
afterEach(async () => {
  await act(async () => root.unmount())
  container.remove()
  vi.useRealTimers()
  vi.unstubAllGlobals()
})

describe('explorer interactions', () => {
  it('makes the example storm explicit and keeps controls out of the default panel', async () => {
    await mount()
    const panel = container.querySelector('aside')!
    expect(panel.hidden).toBe(true)
    expect(container.querySelector('.scenario-caption')?.textContent).toContain(
      'not a live forecast',
    )
    await click('Storm')
    expect(panel.hidden).toBe(false)
    expect(panel.textContent).toContain('Simulated storm · not a live forecast')
    expect(panel.textContent).toContain('Road segments flagged')
    expect(panel.querySelectorAll('input').length).toBe(0)
    expect(container.querySelector('input[type="range"]')?.getAttribute('aria-label')).toBe(
      'Time since rainfall began',
    )
  })
  it('lets the city be revealed without opening a settings panel', async () => {
    await mount()
    const water = container.querySelector('.map-view-options button')!
    expect(water.getAttribute('aria-pressed')).toBe('true')
    await act(async () => (water as HTMLButtonElement).click())
    expect(water.getAttribute('aria-pressed')).toBe('false')
    expect(container.querySelector('aside')?.hidden).toBe(true)
    expect(container.querySelector('.map-caption')?.textContent).toContain('Water hidden')
  })
  it('stops at the final frame and replays from the beginning', async () => {
    vi.useFakeTimers()
    await mount('?t=2')
    await click('Play simulation')
    await act(async () => {
      vi.advanceTimersByTime(900)
    })
    expect((container.querySelector('input[type="range"]') as HTMLInputElement).value).toBe('3')
    expect(button('Replay simulation')).toBeTruthy()
    await act(async () => {
      vi.advanceTimersByTime(5000)
    })
    expect((container.querySelector('input[type="range"]') as HTMLInputElement).value).toBe('3')
    await click('Replay simulation')
    expect((container.querySelector('input[type="range"]') as HTMLInputElement).value).toBe('0')
  })
  it('opens roads, locates a ranked road and explains the sample', async () => {
    await mount()
    await click('Roads')
    const road = container.querySelector('.road-list button') as HTMLButtonElement
    expect(road.textContent).toContain('Lawrence Road')
    await act(async () => road.click())
    expect(container.querySelector('.selection-card')?.textContent).toContain(
      'highest sample along flagged segments',
    )
    await click('Close location details')
    expect(container.querySelector('.selection-card')).toBeNull()
  })
  it('supports keyboard search and treats nodata separately', async () => {
    await mount()
    const input = container.querySelector('[role="combobox"]') as HTMLInputElement
    await act(async () => input.focus())
    expect(container.querySelector('[role="listbox"]')).toBeTruthy()
    await act(async () =>
      input.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true })),
    )
    await act(async () =>
      input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true })),
    )
    expect(container.querySelector('.selection-card')?.textContent).toContain(
      'No depth estimate is available',
    )
    await click('Inspect test map cell')
    expect(container.querySelector('.selection-card')?.textContent).toContain('50 cm')
  })
  it('keeps area selection, roads, timeline and legend available on phones', async () => {
    vi.stubGlobal('innerWidth', 390)
    await mount()
    expect(container.querySelector('aside')?.hidden).toBe(true)
    expect(container.querySelector('[aria-label="Study area"]')).toBeTruthy()
    expect(container.querySelector('[aria-label="Map legend"]')).toBeTruthy()
    await click('Roads')
    expect(container.querySelector('aside')?.hidden).toBe(false)
    await act(async () =>
      (container.querySelector('.road-list button') as HTMLButtonElement).click(),
    )
    expect(container.querySelector('aside')?.hidden).toBe(true)
    const area = container.querySelector('[aria-label="Study area"]') as HTMLSelectElement
    await act(async () => {
      area.value = 'gulberg-liberty'
      area.dispatchEvent(new Event('change', { bubbles: true }))
    })
    expect(changeArea).toHaveBeenCalledWith('gulberg-liberty')
  })
  it('shares current settings and opens a dismissible about dialog', async () => {
    await mount('?view=fabdem&map=2d&t=1&depth=30')
    expect(window.location.search).toContain('view=fabdem')
    await click('About this model')
    expect(container.querySelector('dialog')?.open).toBe(true)
    await click('Close about')
    expect(container.querySelector('dialog')?.open).toBe(false)
  })
})
