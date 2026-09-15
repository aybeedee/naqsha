import { useEffect, useState } from 'react'
import { loadCatalog, loadScenario, loadUrbanContext } from './data'
import { Explorer } from './Explorer'
import type { AreaCatalog, ScenarioData, UrbanContextData } from './types'

export function Brand() {
  return (
    <a className="brand" href="/" aria-label="Naqsha home">
      <svg width="28" height="28" viewBox="0 0 28 28" fill="none" aria-hidden="true">
        <path d="m3 8 7-4 8 4 7-4v17l-7 4-8-4-7 4V8Z" stroke="currentColor" strokeWidth="1.5" />
        <path
          d="M10 4v17M18 8v17M4 16c5-5 8 5 13 0s5-3 8-4"
          stroke="currentColor"
          strokeWidth="1.5"
        />
      </svg>
      <span>
        Naqsha<small>Lahore flood explorer</small>
      </span>
    </a>
  )
}

export function App() {
  const [catalog, setCatalog] = useState<AreaCatalog | null>(null)
  const [areaId, setAreaId] = useState('')
  const [loaded, setLoaded] = useState<{
    data: ScenarioData
    context: UrbanContextData
    areaId: string
  } | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [retry, setRetry] = useState(0)
  useEffect(() => {
    let cancelled = false
    setError(null)
    loadCatalog()
      .then((next) => {
        if (cancelled) return
        setCatalog(next)
        const requested = new URLSearchParams(window.location.search).get('area')
        setAreaId(
          (current) =>
            current || (next.areas.some((a) => a.id === requested) ? requested! : next.defaultArea),
        )
      })
      .catch((reason: unknown) => {
        if (!cancelled) setError(String(reason))
      })
    return () => {
      cancelled = true
    }
  }, [retry])
  useEffect(() => {
    const area = catalog?.areas.find((candidate) => candidate.id === areaId)
    if (!area) return
    let cancelled = false
    setError(null)
    Promise.all([loadScenario(area.scenarioRoot), loadUrbanContext(area.contextRoot)])
      .then(([data, context]) => {
        if (cancelled) return
        if (
          data.roadImpact &&
          (data.roadImpact.lineCount !== context.metadata.network.count ||
            data.roadImpact.contextId !== area.contextRoot.split('/').pop() ||
            data.roadImpact.frameCount !== data.metadata.timeline.frameCount)
        ) {
          throw new Error('Road data does not match the selected map. Please reload.')
        }
        setLoaded({ data, context, areaId: area.id })
      })
      .catch((reason: unknown) => {
        if (!cancelled) setError(String(reason))
      })
    return () => {
      cancelled = true
    }
  }, [catalog, areaId, retry])
  const area = catalog?.areas.find((candidate) => candidate.id === areaId)
  if (error || !catalog || !loaded || !area || loaded.areaId !== areaId) {
    return (
      <main className="loading-page">
        <Brand />
        <div className="load-content" role={error ? 'alert' : 'status'}>
          {!error && (
            <div className="loading-map" aria-hidden="true">
              <span />
              <span />
              <span />
            </div>
          )}
          <h1>{error ? 'The map couldn’t load.' : `Opening ${area?.label ?? 'Lahore'}…`}</h1>
          <p>
            {error
              ? 'Check your connection and try again.'
              : 'Loading the city and its flood simulation.'}
          </p>
          {error && (
            <>
              <button className="primary-button" onClick={() => setRetry((value) => value + 1)}>
                Try again
              </button>
              <details>
                <summary>Error details</summary>
                <code>{error}</code>
              </details>
            </>
          )}
        </div>
        <p className="loading-foot">Public city data. Experimental flood modelling.</p>
      </main>
    )
  }
  return (
    <Explorer
      key={areaId}
      data={loaded.data}
      context={loaded.context}
      catalog={catalog}
      area={area}
      onAreaChange={(id) => {
        const url = new URL(window.location.href)
        url.search = new URLSearchParams({ area: id }).toString()
        window.history.replaceState(null, '', url)
        setAreaId(id)
      }}
    />
  )
}
