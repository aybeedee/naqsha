// @vitest-environment jsdom
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { App } from './App'
import { smallCatalog, smallContext, smallScenario } from './testFixtures'
import { loadCatalog, loadScenario, loadUrbanContext } from './data'

vi.mock('./data', () => ({
  loadCatalog: vi.fn(),
  loadScenario: vi.fn(),
  loadUrbanContext: vi.fn(),
}))
vi.mock('./Explorer', () => ({
  Explorer: ({ area }: { area: { label: string } }) => <div data-explorer>{area.label}</div>,
}))
let root: Root
let node: HTMLDivElement
beforeEach(() => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true)
  window.history.replaceState(null, '', '/')
  node = document.createElement('div')
  document.body.append(node)
  root = createRoot(node)
  const scenario = smallScenario()
  scenario.roadImpact!.contextId = 'central-lahore'
  vi.mocked(loadCatalog).mockResolvedValue(smallCatalog)
  vi.mocked(loadScenario).mockResolvedValue(scenario)
  vi.mocked(loadUrbanContext).mockResolvedValue(smallContext())
})
afterEach(async () => {
  await act(async () => root.unmount())
  node.remove()
  vi.resetAllMocks()
  vi.unstubAllGlobals()
})

it('opens the default study area after its data loads', async () => {
  await act(async () => root.render(<App />))
  expect(node.querySelector('[data-explorer]')?.textContent).toBe('Central Lahore')
})
it('rejects mismatched road and city assets instead of displaying the wrong impacts', async () => {
  const scenario = smallScenario()
  scenario.roadImpact!.contextId = 'gulberg-liberty'
  vi.mocked(loadScenario).mockResolvedValue(scenario)
  await act(async () => root.render(<App />))
  expect(node.querySelector('[role="alert"]')?.textContent).toContain('Road data does not match')
  expect(node.querySelector('[data-explorer]')).toBeNull()
})
it('recovers from a failed load using Try again', async () => {
  vi.mocked(loadCatalog).mockRejectedValueOnce(new Error('Network unavailable'))
  await act(async () => root.render(<App />))
  expect(node.querySelector('[role="alert"]')).toBeTruthy()
  const retry = node.querySelector('button')!
  expect(retry.textContent).toBe('Try again')
  await act(async () => retry.click())
  expect(node.querySelector('[data-explorer]')?.textContent).toBe('Central Lahore')
})
