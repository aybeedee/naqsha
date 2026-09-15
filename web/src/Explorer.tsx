import { lazy, Suspense, useEffect, useMemo, useRef, useState } from 'react'
import { timelineDepthForView } from './data'
import { Brand } from './App'
import { About } from './About'
import { MapBoundary } from './MapBoundary'
import { Icon } from './Icon'
import {
  buildPlaces,
  cellAt,
  elapsedLabel,
  floodedArea,
  formatDepth,
  neighbourhoodSummary,
  roadSummary,
  sampledPeakDepth,
  searchPlaces,
} from './analysis'
import type { MapPlace } from './analysis'
import { readViewState, writeViewState } from './viewState'
import type {
  AreaCatalog,
  AreaCatalogEntry,
  Dimension,
  FloodMode,
  ScenarioData,
  UrbanContextData,
  ViewId,
} from './types'

type Panel = 'storm' | 'roads' | 'layers'
const TerrainScene = lazy(() =>
  import('./TerrainScene').then((module) => ({ default: module.TerrainScene })),
)
export type MapAction = { type: 'reset' | 'in' | 'out' | 'north'; nonce: number }
const fmt = (value: number, digits = 1) =>
  value.toLocaleString('en-PK', { maximumFractionDigits: digits })

export function Explorer({
  data,
  context,
  catalog,
  area,
  onAreaChange,
}: {
  data: ScenarioData
  context: UrbanContextData
  catalog: AreaCatalog
  area: AreaCatalogEntry
  onAreaChange: (id: string) => void
}) {
  const { scenario, timeline } = data.metadata
  const initial = useMemo(
    () =>
      readViewState(
        window.location.search,
        timeline.frameCount,
        Math.min(
          Math.round((scenario.rainfall_duration_minutes * 60) / timeline.intervalSeconds),
          timeline.frameCount - 1,
        ),
      ),
    [scenario, timeline],
  )
  const [view, setView] = useState<ViewId>(initial.view)
  const [dimension, setDimension] = useState<Dimension>(initial.dimension)
  const [mode, setMode] = useState<FloodMode>(initial.mode)
  const [frame, setFrame] = useState(initial.frame)
  const [playing, setPlaying] = useState(false)
  const [threshold, setThreshold] = useState(initial.threshold)
  const [panel, setPanel] = useState<Panel>('storm')
  const [panelOpen, setPanelOpen] = useState(false)
  const [layers, setLayers] = useState({
    buildings: true,
    network: true,
    labels: true,
    water: true,
    basemap: true,
    roads: false,
  })
  const [waterScale, setWaterScale] = useState(6)
  const [query, setQuery] = useState('')
  const [searchOpen, setSearchOpen] = useState(false)
  const [searchIndex, setSearchIndex] = useState(0)
  const [selected, setSelected] = useState<MapPlace | null>(null)
  const [focus, setFocus] = useState<MapPlace | null>(null)
  const [mapAction, setMapAction] = useState<MapAction>({ type: 'reset', nonce: 0 })
  const [toast, setToast] = useState('')
  const [about, setAbout] = useState(false)
  const searchRef = useRef<HTMLInputElement>(null)
  const peak = mode === 'maximum' || view === 'agreement'
  const modelView = view === 'agreement' ? 'city' : view
  const places = useMemo(() => buildPlaces(context), [context])
  const results = useMemo(() => searchPlaces(places, query), [places, query])
  const peakDepth = useMemo(() => sampledPeakDepth(data, modelView), [data, modelView])
  const displayDepth = useMemo(
    () => (peak ? peakDepth : timelineDepthForView(data, modelView, frame)),
    [data, modelView, frame, peak, peakDepth],
  )
  const roadInfo = useMemo(
    () => roadSummary(data, context, frame, peak, threshold),
    [data, context, frame, peak, threshold],
  )
  const neighbourhoods = useMemo(
    () => neighbourhoodSummary(data, context, displayDepth, threshold),
    [data, context, displayDepth, threshold],
  )
  const floodArea = useMemo(
    () => floodedArea(data, displayDepth, threshold),
    [data, displayDepth, threshold],
  )
  const roadDepth = useMemo(
    () =>
      data.roadImpact &&
      (peak
        ? data.roadImpact.peakDepth
        : data.roadImpact.timelineDepth.subarray(
            frame * data.roadImpact.lineCount,
            (frame + 1) * data.roadImpact.lineCount,
          )),
    [data, frame, peak],
  )
  const roadAgreement = useMemo(
    () =>
      data.roadImpact &&
      (peak
        ? data.roadImpact.peakAgreement
        : data.roadImpact.timelineAgreement.subarray(
            frame * data.roadImpact.lineCount,
            (frame + 1) * data.roadImpact.lineCount,
          )),
    [data, frame, peak],
  )
  const elapsed = frame * timeline.intervalSeconds
  const rainStop = scenario.rainfall_duration_minutes * 60
  const atEnd = frame === timeline.frameCount - 1
  const phase =
    elapsed === 0
      ? 'Before the rain'
      : elapsed < rainStop
        ? 'Rain falling'
        : elapsed === rainStop
          ? 'Rain stops'
          : 'After the rain'
  const forcing = scenario.forcing_metadata
  const forecastExpired = forcing?.validThroughUtc
    ? Date.parse(forcing.validThroughUtc) < Date.now()
    : false
  const selectedCell = selected ? cellAt(data, selected.x, selected.z) : null
  const selectedRoad = selected?.roadName
    ? roadInfo.named.find((road) => road.name === selected.roadName)
    : undefined
  const selectedValues = useMemo(
    () =>
      selectedCell === null
        ? []
        : data.members.map((member) => ({
            name: member.label,
            value: peak
              ? member.depth[selectedCell]
              : member.timelineDepth[frame * data.active.length + selectedCell] *
                timeline.depthScaleMetres,
          })),
    [data, selectedCell, peak, frame, timeline.depthScaleMetres],
  )

  function openPanel(next: Panel) {
    setPanel(next)
    setPanelOpen(true)
    if (next === 'roads') {
      setView('city')
      setLayers((current) => ({ ...current, network: true, roads: true }))
    }
  }
  function choosePlace(place: MapPlace) {
    setSelected(place)
    setFocus({ ...place })
    setQuery('')
    setSearchOpen(false)
    searchRef.current?.blur()
    if (window.innerWidth <= 760) setPanelOpen(false)
  }
  function togglePlayback() {
    if (view === 'agreement') setView('city')
    setMode('timeline')
    if (atEnd) setFrame(0)
    setPlaying((current) => !current)
  }
  function command(type: MapAction['type']) {
    setMapAction((current) => ({ type, nonce: current.nonce + 1 }))
  }
  useEffect(() => {
    if (!playing || peak) return
    if (atEnd) {
      setPlaying(false)
      return
    }
    const timer = window.setTimeout(
      () => setFrame((current) => Math.min(current + 1, timeline.frameCount - 1)),
      800,
    )
    return () => window.clearTimeout(timer)
  }, [playing, peak, atEnd, frame, timeline.frameCount])
  useEffect(() => {
    window.history.replaceState(
      null,
      '',
      writeViewState(new URL(window.location.href), area.id, {
        view,
        dimension,
        mode,
        frame,
        threshold,
      }),
    )
  }, [area.id, view, dimension, mode, frame, threshold])
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.ctrlKey || event.metaKey || event.altKey || about) return
      const element = event.target as HTMLElement
      if (element.closest('input, select, textarea, button, a, [contenteditable="true"]')) return
      if (event.key === '/') {
        event.preventDefault()
        searchRef.current?.focus()
      }
      if (event.code === 'Space') {
        event.preventDefault()
        togglePlayback()
      }
      if (event.key === 'Escape') {
        setSelected(null)
        setSearchOpen(false)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  })
  useEffect(() => {
    if (!toast) return
    const timer = window.setTimeout(() => setToast(''), 3500)
    return () => window.clearTimeout(timer)
  }, [toast])

  return (
    <main className={`app-shell ${panelOpen ? 'panel-open' : ''}`}>
      <header className="topbar">
        <Brand />
        <div className="area-picker">
          <Icon name="pin" />
          <select
            aria-label="Study area"
            value={area.id}
            onChange={(event) => onAreaChange(event.target.value)}
          >
            {catalog.areas.map((entry) => (
              <option key={entry.id} value={entry.id}>
                {entry.label}
              </option>
            ))}
          </select>
        </div>
        <div
          className="search-box"
          onBlur={(event) => {
            if (!event.currentTarget.contains(event.relatedTarget)) setSearchOpen(false)
          }}
        >
          <Icon name="search" />
          <input
            ref={searchRef}
            role="combobox"
            aria-label="Search places and roads"
            aria-controls="place-results"
            aria-expanded={searchOpen}
            aria-autocomplete="list"
            aria-activedescendant={
              searchOpen && results[searchIndex] ? `place-${searchIndex}` : undefined
            }
            placeholder="Find a place or road"
            value={query}
            onFocus={() => setSearchOpen(true)}
            onChange={(event) => {
              setQuery(event.target.value)
              setSearchIndex(0)
              setSearchOpen(true)
            }}
            onKeyDown={(event) => {
              if (event.key === 'ArrowDown') {
                event.preventDefault()
                setSearchIndex((current) => Math.max(0, Math.min(current + 1, results.length - 1)))
                setSearchOpen(true)
              }
              if (event.key === 'ArrowUp') {
                event.preventDefault()
                setSearchIndex((current) => Math.max(current - 1, 0))
              }
              if (event.key === 'Enter' && results[searchIndex]) {
                event.preventDefault()
                choosePlace(results[searchIndex])
              }
              if (event.key === 'Escape') {
                setSearchOpen(false)
                searchRef.current?.blur()
              }
            }}
          />
          <kbd>/</kbd>
          {searchOpen && (
            <div
              className="search-results"
              id="place-results"
              role="listbox"
              aria-label="Places in this study area"
            >
              <p>{query.trim() ? 'In this study area' : 'Explore nearby'}</p>
              {results.length ? (
                results.map((place, index) => (
                  <button
                    key={place.id}
                    id={`place-${index}`}
                    role="option"
                    aria-selected={index === searchIndex}
                    onMouseDown={(event) => event.preventDefault()}
                    onClick={() => choosePlace(place)}
                  >
                    <Icon name={place.roadName ? 'roads' : 'pin'} />
                    <span>
                      {place.name}
                      <small>{place.kind}</small>
                    </span>
                    <Icon name="arrow" />
                  </button>
                ))
              ) : (
                <div className="search-empty">
                  No match in {area.label}. Try another name or switch study area.
                </div>
              )}
            </div>
          )}
        </div>
        <div className="header-actions">
          <button
            className="quiet-button share-button"
            onClick={() => {
              navigator.clipboard
                ?.writeText(window.location.href)
                .then(() => setToast('Link copied · area, time and map view'))
                .catch(() => setToast('Copy the link from your address bar.'))
              if (!navigator.clipboard) setToast('Copy the link from your address bar.')
            }}
          >
            <Icon name="share" />
            <span>Share view</span>
          </button>
          <button
            className="quiet-button"
            onClick={() => {
              setAbout(true)
              setPlaying(false)
            }}
            aria-label="About this model"
          >
            <Icon name="info" />
            <span>About</span>
          </button>
        </div>
      </header>

      <section className="workspace" aria-label="Flood explorer">
        <nav className="panel-tabs" aria-label="Explorer panels">
          {(
            [
              ['storm', 'rain', 'Storm'],
              ['roads', 'roads', 'Roads'],
              ['layers', 'layers', 'Layers'],
            ] as const
          ).map(([id, icon, label]) => (
            <button
              key={id}
              aria-pressed={panelOpen && panel === id}
              onClick={() => (panelOpen && panel === id ? setPanelOpen(false) : openPanel(id))}
            >
              <Icon name={icon} />
              <span>{label}</span>
            </button>
          ))}
        </nav>
        <aside className="sidebar" aria-label={`${panel} panel`} hidden={!panelOpen}>
          <div className="panel-heading">
            <span>
              {panel === 'storm'
                ? 'The rainfall scenario'
                : panel === 'roads'
                  ? 'Road exposure'
                  : 'Map layers'}
            </span>
            <button
              className="icon-button"
              aria-label="Close panel"
              onClick={() => setPanelOpen(false)}
            >
              <Icon name="close" />
            </button>
          </div>
          <div className="panel-body">
            {panel === 'storm' && (
              <>
                <p className="eyebrow">
                  {forcing
                    ? forecastExpired
                      ? 'Archived forecast'
                      : 'Forecast scenario'
                    : 'Example storm'}
                </p>
                <h1 className="storm-title">
                  {fmt(scenario.rainfall_total_mm)} <span>mm of rain</span>
                  <br />
                  <span>over </span>
                  {fmt(scenario.rainfall_duration_minutes / 60)} <span>hours</span>
                </h1>
                <p className="body-copy">
                  {forcing
                    ? 'A saved rainfall forecast run through the flood model.'
                    : `An example of heavy rain across this area, followed by ${fmt(scenario.recession_minutes / 60)} hours without rain.`}
                </p>
                <div className="scenario-note">
                  <span className="status-dot" />
                  {forcing
                    ? `${forecastExpired ? 'Expired · ' : ''}${forcing.model ?? 'Weather forecast'} · ${forcing.profile?.id ?? 'scenario'}`
                    : 'Simulated storm · not a live forecast'}
                </div>
                <div className="divider" />
                <div className="section-label">
                  <h2>
                    {view === 'agreement'
                      ? 'Where models agree'
                      : peak
                        ? 'Across the whole event'
                        : `At ${elapsedLabel(elapsed)} after rain begins`}
                  </h2>
                </div>
                {view === 'agreement' ? (
                  <>
                    <div className="big-stat">
                      {fmt(
                        data.metadata.agreement.metrics.intersection_flooded_area_over_10cm_km2,
                        2,
                      )}{' '}
                      <span>km²</span>
                    </div>
                    <p className="body-copy">
                      Shown as wet by all three terrain models. Agreement shows consistency between
                      these models; it does not establish accuracy.
                    </p>
                  </>
                ) : (
                  <>
                    <div className="summary-grid">
                      <div>
                        <strong>
                          {fmt(floodArea, 2)} <small>km²</small>
                        </strong>
                        <span>Water ≥{Math.round(threshold * 100)} cm</span>
                      </div>
                      <div>
                        <strong>{view === 'city' ? fmt(roadInfo.segments, 0) : '—'}</strong>
                        <span>Road segments flagged</span>
                      </div>
                    </div>
                    <p className="fine-print">
                      {view === 'city'
                        ? 'Depth uses the middle of three terrain-model results at each map cell.'
                        : `Showing the ${data.members.find((member) => member.id === view)?.label} model. Road results use the combined view.`}
                    </p>
                    {neighbourhoods.length > 0 && (
                      <div className="neighbourhoods">
                        <h2>Water around these places</h2>
                        {neighbourhoods.map(({ label, fraction }) => (
                          <button
                            key={label.name}
                            className="place-row"
                            onClick={() =>
                              choosePlace({
                                id: label.name,
                                name: label.name,
                                kind: 'Neighbourhood',
                                x: label.x,
                                z: label.z,
                              })
                            }
                          >
                            <span>
                              {label.name}
                              <span className="mini-bar">
                                <i style={{ width: `${fraction * 100}%` }} />
                              </span>
                            </span>
                            <strong>{fmt(fraction * 100, 0)}%</strong>
                            <Icon name="chevron" />
                          </button>
                        ))}
                        <p className="fine-print">
                          Share of modelled ground with water ≥{Math.round(threshold * 100)} cm
                          within 250 m of each place label.
                        </p>
                      </div>
                    )}
                    <button className="text-button" onClick={() => openPanel('roads')}>
                      Explore affected roads <Icon name="arrow" />
                    </button>
                  </>
                )}
                <div className="model-note">
                  <Icon name="info" />
                  <div>
                    <strong>Experimental results</strong>
                    <p>
                      Street levels and drains are missing. Use this to explore possible patterns,
                      not to choose a safe route.
                    </p>
                    <button
                      onClick={() => {
                        setAbout(true)
                        setPlaying(false)
                      }}
                    >
                      How to read this map
                    </button>
                  </div>
                </div>
              </>
            )}
            {panel === 'roads' && (
              <>
                <p className="body-copy">
                  Roads with a modelled depth of at least {Math.round(threshold * 100)} cm somewhere
                  along them.
                </p>
                <div className="road-summary">
                  <strong>{fmt(roadInfo.segments, 0)}</strong>
                  <span>
                    flagged segments <small>of {fmt(roadInfo.totalSegments, 0)} sampled</small>
                  </span>
                </div>
                <div className="section-label">
                  <h2>Named roads</h2>
                  <span>{peak ? 'Event maximum' : elapsedLabel(elapsed)}</span>
                </div>
                {roadInfo.named.length ? (
                  <ol className="road-list">
                    {roadInfo.named.slice(0, 20).map((road, index) => (
                      <li key={road.name}>
                        <button
                          onClick={() =>
                            choosePlace({
                              id: road.name,
                              name: road.name,
                              roadName: road.name,
                              kind: 'Road',
                              x: road.x,
                              z: road.z,
                            })
                          }
                        >
                          <span className="road-rank">{index + 1}</span>
                          <span className="road-name">
                            {road.name}
                            <small>
                              {road.segments} flagged {road.segments === 1 ? 'segment' : 'segments'}
                            </small>
                          </span>
                          <strong className={road.depth >= 0.3 ? 'depth-severe' : 'depth-moderate'}>
                            {formatDepth(road.depth)}
                          </strong>
                          <Icon name="chevron" />
                        </button>
                      </li>
                    ))}
                  </ol>
                ) : (
                  <div className="empty-state">
                    <Icon name="roads" />
                    <h3>
                      {roadInfo.segments
                        ? 'No named roads at this depth'
                        : 'No road segments flagged'}
                    </h3>
                    <p>Move through the timeline or lower the display threshold in Layers.</p>
                  </div>
                )}
                <p className="fine-print">
                  Ranked by the highest sampled depth. A flagged segment can be only partly wet.
                  Road heights, bridges and underpasses are unresolved.
                </p>
                <div className="road-key">
                  <span>
                    <i className="road-moderate" />
                    10–30 cm
                  </span>
                  <span>
                    <i className="road-severe" />
                    30+ cm
                  </span>
                </div>
              </>
            )}
            {panel === 'layers' && (
              <>
                <h2>Flood result</h2>
                <div className="view-options" role="group" aria-label="Flood result">
                  {(
                    [
                      ['city', 'Combined result', 'Middle depth from three models'],
                      ['agreement', 'Model agreement', 'Where terrain models show water'],
                    ] as const
                  ).map(([id, title, detail]) => (
                    <button
                      key={id}
                      aria-pressed={view === id}
                      onClick={() => {
                        setView(id)
                        setPlaying(false)
                      }}
                    >
                      <span>
                        {title}
                        <small>{detail}</small>
                      </span>
                      {view === id && <Icon name="check" />}
                    </button>
                  ))}
                </div>
                <label className="select-control">
                  <span>Minimum water depth</span>
                  <select
                    value={view === 'agreement' ? 0.1 : threshold}
                    disabled={view === 'agreement'}
                    onChange={(event) => setThreshold(Number(event.target.value))}
                  >
                    {[5, 10, 30, 50, 100].map((cm) => (
                      <option key={cm} value={cm / 100}>
                        {cm} cm
                      </option>
                    ))}
                  </select>
                </label>
                <p className="fine-print">
                  Filters the map and summaries. Rainfall and calculated depths stay the same.
                </p>
                <div className="divider" />
                <h2>City detail</h2>
                {(
                  [
                    ['water', 'Water'],
                    ['buildings', 'Buildings'],
                    ['network', 'Streets & parks'],
                    ['labels', 'Place labels'],
                    ['basemap', 'OpenStreetMap basemap'],
                    ['roads', 'Highlight affected roads'],
                  ] as const
                ).map(([key, label]) => (
                  <label className="toggle-control" key={key}>
                    <span>{label}</span>
                    <input
                      type="checkbox"
                      checked={layers[key]}
                      onChange={(event) => {
                        const checked = event.target.checked
                        setLayers((current) => ({
                          ...current,
                          [key]: checked,
                          ...(key === 'roads' && checked ? { network: true } : {}),
                        }))
                        if (key === 'roads' && checked) setView('city')
                      }}
                    />
                  </label>
                ))}
                <details className="advanced">
                  <summary>Compare terrain & adjust height</summary>
                  <label className="select-control">
                    <span>Terrain model</span>
                    <select
                      aria-label="Terrain model"
                      value={view}
                      onChange={(event) => {
                        setView(event.target.value as ViewId)
                        setPlaying(false)
                      }}
                    >
                      <option value="city">Combined result</option>
                      <option value="agreement">Model agreement</option>
                      {data.members.map((member) => (
                        <option key={member.id} value={member.id}>
                          {member.label}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label className="range-control">
                    <span>
                      Water height in 3D <output>{waterScale}×</output>
                    </span>
                    <input
                      aria-label="Water height exaggeration"
                      type="range"
                      min="1"
                      max="12"
                      step="1"
                      disabled={dimension === '2d'}
                      value={waterScale}
                      onChange={(event) => setWaterScale(Number(event.target.value))}
                    />
                  </label>
                  <p className="fine-print">
                    Height is exaggerated to make shallow water visible. All numbers show calculated
                    depth.
                  </p>
                </details>
              </>
            )}
          </div>
        </aside>

        <section className="map-stage" aria-label="Interactive flood map">
          <MapBoundary>
            <Suspense
              fallback={
                <div className="scene-error" role="status">
                  <p>Preparing the map…</p>
                </div>
              }
            >
              <TerrainScene
                data={data}
                context={context}
                displayDepth={displayDepth}
                view={view}
                dimension={dimension}
                threshold={threshold}
                verticalExaggeration={1}
                waterDepthExaggeration={waterScale}
                showWater={layers.water}
                showBasemap={layers.basemap}
                showBuildings={layers.buildings}
                showNetwork={layers.network}
                showRoadImpacts={layers.roads}
                roadImpactDepth={roadDepth}
                roadImpactAgreement={roadAgreement}
                showLabels={layers.labels}
                action={mapAction}
                focus={focus}
                selected={selected}
                onSelect={(point) => {
                  setSelected({
                    id: 'point',
                    name: 'Selected location',
                    kind: 'Map cell',
                    ...point,
                  })
                  setSearchOpen(false)
                }}
              />
            </Suspense>
          </MapBoundary>
          <div className="map-caption">
            <span>{area.label}</span>
            <small>
              {view === 'agreement'
                ? 'Agreement across three terrain models'
                : view === 'city'
                  ? 'Combined flood result'
                  : data.members.find((member) => member.id === view)?.label}
              {!layers.water ? ' · Water hidden' : ''}
            </small>
            <small className="scenario-caption">
              {forcing
                ? forecastExpired
                  ? 'Archived forecast · expired'
                  : 'Forecast scenario · not live'
                : `${scenario.rainfall_total_mm} mm example storm · not a live forecast`}
            </small>
          </div>
          <div className="map-view-options" role="group" aria-label="Quick map layers">
            <button
              aria-pressed={layers.water}
              onClick={() => setLayers((current) => ({ ...current, water: !current.water }))}
            >
              Water
            </button>
            <button
              aria-pressed={layers.labels}
              onClick={() => setLayers((current) => ({ ...current, labels: !current.labels }))}
            >
              Places
            </button>
          </div>
          <div className="map-tools">
            <div className="dimension-switch" role="group" aria-label="Map dimension">
              {(['2d', '3d'] as const).map((value) => (
                <button
                  key={value}
                  aria-pressed={dimension === value}
                  onClick={() => setDimension(value)}
                >
                  {value.toUpperCase()}
                </button>
              ))}
            </div>
            <div className="zoom-tools">
              <button aria-label="Zoom in" onClick={() => command('in')}>
                <Icon name="plus" />
              </button>
              <button aria-label="Zoom out" onClick={() => command('out')}>
                <Icon name="minus" />
              </button>
            </div>
            <button
              className="map-tool"
              aria-label="Reset map view"
              onClick={() => {
                command('reset')
                setSelected(null)
                setFocus(null)
              }}
            >
              <Icon name="home" />
            </button>
            <button
              className="map-tool north-button"
              aria-label="Point map north"
              onClick={() => command('north')}
            >
              <Icon name="north" />
              <span>N</span>
            </button>
          </div>
          {selected && (
            <section className="selection-card" aria-label="Location details">
              <div className="selection-heading">
                <div>
                  <p className="eyebrow">{selected.kind}</p>
                  <h2>{selected.name}</h2>
                </div>
                <button
                  className="icon-button"
                  aria-label="Close location details"
                  onClick={() => setSelected(null)}
                >
                  <Icon name="close" />
                </button>
              </div>
              {selected.roadName && view !== 'city' ? (
                <>
                  <p className="body-copy">
                    Road samples use the combined result from all three terrain models.
                  </p>
                  <button className="text-button" onClick={() => setView('city')}>
                    Show combined road result <Icon name="arrow" />
                  </button>
                </>
              ) : selected.roadName && selectedRoad ? (
                <>
                  <div className="selected-depth">
                    {formatDepth(selectedRoad.depth)}
                    <span>highest sample along flagged segments</span>
                  </div>
                  <p className="fine-print">
                    {selectedRoad.segments} flagged{' '}
                    {selectedRoad.segments === 1 ? 'segment' : 'segments'} ·{' '}
                    {peak ? 'maximum across saved frames' : `at ${elapsedLabel(elapsed)}`}
                  </p>
                </>
              ) : selected.roadName ? (
                <p className="body-copy">
                  This road has no flagged samples at the current time and depth filter. That does
                  not establish that it is passable.
                </p>
              ) : selectedCell === null ? (
                <p className="body-copy">
                  Outside the analysed flood grid. No depth estimate is available here.
                </p>
              ) : (
                <>
                  {view === 'agreement' ? (
                    <div className="selected-depth">
                      {data.agreement[selectedCell]} of 3
                      <span>terrain models exceed 10 cm here during the event</span>
                    </div>
                  ) : (
                    <div className="selected-depth">
                      {formatDepth(displayDepth[selectedCell])}
                      <span>
                        {peak
                          ? 'highest depth across saved frames'
                          : `modelled depth at ${elapsedLabel(elapsed)}`}
                      </span>
                    </div>
                  )}
                  <details>
                    <summary>Compare the three terrain models</summary>
                    <dl className="depth-comparison">
                      {selectedValues.map(({ name, value }) => (
                        <div key={name}>
                          <dt>{name}</dt>
                          <dd>{formatDepth(value)}</dd>
                        </div>
                      ))}
                    </dl>
                    {peak && (
                      <p className="fine-print">
                        Comparisons use solver event maxima; the main depth uses saved ten-minute
                        frames.
                      </p>
                    )}
                  </details>
                  <p className="fine-print">
                    One roughly {Math.round(data.metadata.grid.cellSizeMetres)} m cell. This is not
                    a measured property depth.
                  </p>
                </>
              )}
            </section>
          )}
          <div className="map-bottom">
            <div className="legend" aria-label="Map legend">
              {view === 'agreement' ? (
                <>
                  <strong>Models showing ≥10 cm</strong>
                  <div className="agreement-key">
                    <span>
                      <i style={{ background: '#dc806b' }} />1
                    </span>
                    <span>
                      <i style={{ background: '#d2b66c' }} />2
                    </span>
                    <span>
                      <i style={{ background: '#62b9a1' }} />3
                    </span>
                  </div>
                </>
              ) : (
                <>
                  <strong>Water depth</strong>
                  <div className="depth-ramp" />
                  <div className="depth-labels">
                    <span>0</span>
                    <span>30 cm</span>
                    <span>1 m</span>
                    <span>2 m+</span>
                  </div>
                </>
              )}
              {dimension === '3d' && layers.water && (
                <small>{waterScale}× height for visibility</small>
              )}
            </div>
            <span className="navigation-hint">
              {dimension === '2d'
                ? 'Drag to pan · Scroll to zoom'
                : 'Drag to pan · Right-drag to orbit'}
            </span>
          </div>
        </section>

        <footer className="timeline-bar">
          <div className="timeline-title">
            <span>{peak ? 'Whole event' : phase}</span>
            <strong>
              {peak ? 'Maximum' : elapsedLabel(elapsed)}
              <small>{peak ? '' : ' elapsed'}</small>
            </strong>
          </div>
          <button
            className="play-button"
            aria-label={
              playing
                ? 'Pause simulation'
                : atEnd && !peak
                  ? 'Replay simulation'
                  : 'Play simulation'
            }
            onClick={togglePlayback}
          >
            <Icon name={playing ? 'pause' : atEnd && !peak ? 'replay' : 'play'} />
          </button>
          <div className="timeline-track">
            <div className="rain-band">
              <span style={{ width: `${Math.min(rainStop / timeline.durationSeconds, 1) * 100}%` }}>
                Rain falling
              </span>
            </div>
            <input
              type="range"
              min="0"
              max={timeline.frameCount - 1}
              step="1"
              value={frame}
              aria-label="Time since rainfall began"
              aria-valuetext={`${elapsedLabel(elapsed)} after rainfall began`}
              onChange={(event) => {
                setFrame(Number(event.target.value))
                setPlaying(false)
                setMode('timeline')
                if (view === 'agreement') setView('city')
              }}
            />
            <div className="time-labels">
              <span>0:00</span>
              <span>{elapsedLabel(rainStop)} · rain stops</span>
              <span>{elapsedLabel(timeline.durationSeconds)}</span>
            </div>
          </div>
          <button
            className="peak-button"
            aria-pressed={peak}
            onClick={() => {
              setMode(peak ? 'timeline' : 'maximum')
              setPlaying(false)
              if (view === 'agreement') setView('city')
            }}
          >
            Whole event<small>Highest water at each cell</small>
          </button>
        </footer>
        <div className="attribution">
          <span>
            Experimental ·{' '}
            {forcing
              ? forecastExpired
                ? 'Archived forecast'
                : 'Forecast scenario'
              : 'Example rainfall'}
          </span>
          <span>
            Buildings:{' '}
            <a href="https://overturemaps.org/" target="_blank" rel="noreferrer">
              Overture
            </a>
            , Google & Microsoft ·{' '}
            <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noreferrer">
              © OpenStreetMap contributors
            </a>
          </span>
        </div>
      </section>
      {toast && (
        <div className="toast" role="status">
          <Icon name="check" />
          {toast}
        </div>
      )}
      <About open={about} onClose={() => setAbout(false)} data={data} context={context} />
    </main>
  )
}
