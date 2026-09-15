import type { Dimension, FloodMode, ViewId } from './types'

export interface ViewState {
  view: ViewId
  dimension: Dimension
  mode: FloodMode
  frame: number
  threshold: number
}

export function readViewState(search: string, frameCount: number, defaultFrame: number): ViewState {
  const params = new URLSearchParams(search)
  const views: ViewId[] = ['city', 'agreement', 'copernicus', 'fabdem', 'srtm']
  const frame = Number(params.get('t') ?? defaultFrame)
  const threshold = Number(params.get('depth') ?? 10)
  return {
    view: views.includes(params.get('view') as ViewId) ? (params.get('view') as ViewId) : 'city',
    dimension: params.get('map') === '2d' ? '2d' : '3d',
    mode: params.get('time') === 'peak' ? 'maximum' : 'timeline',
    frame: Number.isInteger(frame) ? Math.max(0, Math.min(frame, frameCount - 1)) : defaultFrame,
    threshold: [5, 10, 30, 50, 100].includes(threshold) ? threshold / 100 : 0.1,
  }
}

export function writeViewState(url: URL, area: string, state: ViewState): string {
  url.search = ''
  url.searchParams.set('area', area)
  url.searchParams.set('t', String(state.frame))
  if (state.view !== 'city') url.searchParams.set('view', state.view)
  if (state.dimension !== '3d') url.searchParams.set('map', state.dimension)
  if (state.mode === 'maximum') url.searchParams.set('time', 'peak')
  if (state.threshold !== 0.1)
    url.searchParams.set('depth', String(Math.round(state.threshold * 100)))
  return url.toString()
}
