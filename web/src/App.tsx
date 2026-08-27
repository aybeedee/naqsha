import { useEffect, useMemo, useState } from 'react'
import { loadCatalog, loadScenario, loadUrbanContext, timelineDepthForView } from './data'
import { TerrainScene } from './TerrainScene'
import type {
  Dimension,
  AreaCatalog,
  FloodMode,
  MemberGrid,
  ScenarioData,
  UrbanContextData,
  ViewId,
} from './types'

const viewOrder: ViewId[] = ['city', 'agreement', 'copernicus', 'fabdem', 'srtm']

function number(value: number, digits = 2): string {
  return value.toLocaleString('en-PK', {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  })
}

function memberFor(data: ScenarioData, view: ViewId): MemberGrid | undefined {
  const member = view === 'city' || view === 'agreement' ? 'fabdem' : view
  return data.members.find((candidate) => candidate.id === member)
}

function viewLabel(data: ScenarioData, view: ViewId): string {
  if (view === 'city') return 'City + ensemble median'
  if (view === 'agreement') return 'Terrain agreement'
  return memberFor(data, view)?.label ?? view
}

function Toggle({
  checked,
  label,
  helper,
  onChange,
}: {
  checked: boolean
  label: string
  helper: string
  onChange: (checked: boolean) => void
}) {
  return (
    <label className="toggle-control">
      <span><b>{label}</b><small>{helper}</small></span>
      <input type="checkbox" checked={checked} onChange={(event) => onChange(event.target.checked)} />
    </label>
  )
}

export function App() {
  const [catalog, setCatalog] = useState<AreaCatalog | null>(null)
  const [selectedAreaId, setSelectedAreaId] = useState<string | null>(null)
  const [data, setData] = useState<ScenarioData | null>(null)
  const [context, setContext] = useState<UrbanContextData | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [view, setView] = useState<ViewId>('city')
  const [dimension, setDimension] = useState<Dimension>('3d')
  const [floodMode, setFloodMode] = useState<FloodMode>('timeline')
  const [frameIndex, setFrameIndex] = useState(0)
  const [playing, setPlaying] = useState(false)
  const [threshold, setThreshold] = useState(0.1)
  const [verticalExaggeration, setVerticalExaggeration] = useState(1)
  const [waterDepthExaggeration, setWaterDepthExaggeration] = useState(6)
  const [showWater, setShowWater] = useState(true)
  const [showBasemap, setShowBasemap] = useState(true)
  const [showBuildings, setShowBuildings] = useState(true)
  const [showNetwork, setShowNetwork] = useState(true)
  const [showRoadImpacts, setShowRoadImpacts] = useState(true)
  const [showLabels, setShowLabels] = useState(true)
  const [resetNonce, setResetNonce] = useState(0)

  useEffect(() => {
    loadCatalog()
      .then((nextCatalog) => {
        setCatalog(nextCatalog)
        const requestedArea = new URLSearchParams(window.location.search).get('area')
        setSelectedAreaId(
          requestedArea && nextCatalog.areas.some((area) => area.id === requestedArea)
            ? requestedArea
            : nextCatalog.defaultArea,
        )
      })
      .catch((reason: unknown) => {
        setError(reason instanceof Error ? reason.message : String(reason))
      })
  }, [])

  useEffect(() => {
    if (!selectedAreaId) return
    const url = new URL(window.location.href)
    url.searchParams.set('area', selectedAreaId)
    window.history.replaceState(null, '', url)
  }, [selectedAreaId])

  useEffect(() => {
    const area = catalog?.areas.find((candidate) => candidate.id === selectedAreaId)
    if (!area) return
    let cancelled = false
    setData(null)
    setContext(null)
    setError(null)
    setPlaying(false)
    Promise.all([loadScenario(area.scenarioRoot), loadUrbanContext(area.contextRoot)])
      .then(([scenario, urbanContext]) => {
        if (cancelled) return
        setData(scenario)
        setContext(urbanContext)
        setFrameIndex(Math.min(
          Math.round(
            scenario.metadata.scenario.rainfall_duration_minutes * 60
              / scenario.metadata.timeline.intervalSeconds,
          ),
          scenario.metadata.timeline.frameCount - 1,
        ))
      })
      .catch((reason: unknown) => {
        if (cancelled) return
        setError(reason instanceof Error ? reason.message : String(reason))
      })
    return () => { cancelled = true }
  }, [catalog, selectedAreaId])

  const selectedMember = useMemo(
    () => (data ? memberFor(data, view) : undefined),
    [data, view],
  )

  useEffect(() => {
    if (!data || !playing || floodMode !== 'timeline' || view === 'agreement') return
    const timer = window.setInterval(() => {
      setFrameIndex((current) => (current + 1) % data.metadata.timeline.frameCount)
    }, 600)
    return () => window.clearInterval(timer)
  }, [data, floodMode, playing, view])

  useEffect(() => {
    if (view === 'agreement') setPlaying(false)
  }, [view])

  if (error) {
    return (
      <main className="center-state">
        <p className="eyebrow">Viewer unavailable</p>
        <h1>Scenario data could not be loaded.</h1>
        <code>{error}</code>
      </main>
    )
  }
  if (!catalog || !data || !context) {
    return (
      <main className="center-state loading-state">
        <div className="loading-mark" />
        <p>Loading the Lahore city model…</p>
      </main>
    )
  }

  const selectedArea = catalog.areas.find((area) => area.id === selectedAreaId)!
  const forecastForcing = data.metadata.scenario.forcing_metadata

  const agreement = data.metadata.agreement.metrics
  const selectedMetrics = selectedMember!.metrics
  const timelineActive = floodMode === 'timeline' && view !== 'agreement'
  const displayDepth = timelineActive
    ? timelineDepthForView(data, view as Exclude<ViewId, 'agreement'>, frameIndex)
    : view === 'city' ? data.medianDepth : selectedMember!.depth
  const elapsedSeconds = frameIndex * data.metadata.timeline.intervalSeconds
  const rainDurationSeconds = data.metadata.scenario.rainfall_duration_minutes * 60
  const phase = elapsedSeconds <= rainDurationSeconds ? 'Rainfall' : 'Recession'
  const elapsedLabel = `${Math.floor(elapsedSeconds / 3600)}:${String((elapsedSeconds % 3600) / 60).padStart(2, '0')}`
  const cellAreaKm2 = data.metadata.grid.cellSizeMetres ** 2 / 1_000_000
  const roadImpact = data.roadImpact
  const roadOffset = frameIndex * (roadImpact?.lineCount ?? 0)
  const roadImpactDepth = roadImpact
    ? timelineActive
      ? roadImpact.timelineDepth.subarray(roadOffset, roadOffset + roadImpact.lineCount)
      : roadImpact.peakDepth
    : undefined
  const roadImpactAgreement = roadImpact
    ? timelineActive
      ? roadImpact.timelineAgreement.subarray(roadOffset, roadOffset + roadImpact.lineCount)
      : roadImpact.peakAgreement
    : undefined
  let roadLengthOver10cmKm = 0
  let roadLengthOver30cmKm = 0
  let sharedRoadLengthKm = 0
  const namedExposure = new Map<string, { maximumDepth: number; exposedLengthKm: number }>()
  if (roadImpact && roadImpactDepth && roadImpactAgreement) {
    for (let line = 0; line < roadImpact.lineCount; line += 1) {
      const depthMetres = roadImpactDepth[line] * roadImpact.depthScaleMetres
      if (roadImpactDepth[line] === roadImpact.nodataDepth) continue
      if (depthMetres >= 0.1) roadLengthOver10cmKm += roadImpact.lengths[line] / 1000
      if (depthMetres >= 0.3) roadLengthOver30cmKm += roadImpact.lengths[line] / 1000
      if (depthMetres >= 0.1 && roadImpactAgreement[line] === roadImpact.memberCount) {
        sharedRoadLengthKm += roadImpact.lengths[line] / 1000
      }
      const roadName = context.networkNames?.[line]?.trim()
      if (roadName && depthMetres >= 0.1) {
        const current = namedExposure.get(roadName) ?? { maximumDepth: 0, exposedLengthKm: 0 }
        current.maximumDepth = Math.max(current.maximumDepth, depthMetres)
        current.exposedLengthKm += roadImpact.lengths[line] / 1000
        namedExposure.set(roadName, current)
      }
    }
  }
  const mostImpactedRoads = [...namedExposure.entries()]
    .sort((first, second) => second[1].maximumDepth - first[1].maximumDepth
      || second[1].exposedLengthKm - first[1].exposedLengthKm)
    .slice(0, 5)
  const hotspotRadiusCells = Math.ceil(250 / data.metadata.grid.cellSizeMetres)
  const neighbourhoodCandidates = context.metadata.labels
    .filter((label) => label.category === 'district')
    .map((label) => {
      const centreColumn = Math.round(
        label.x / data.metadata.grid.cellSizeMetres + (data.metadata.grid.width - 1) / 2,
      )
      const centreRow = Math.round(
        label.z / data.metadata.grid.cellSizeMetres + (data.metadata.grid.height - 1) / 2,
      )
      let maximumDepth = 0
      let activeCells = 0
      let wetCells = 0
      for (let row = centreRow - hotspotRadiusCells; row <= centreRow + hotspotRadiusCells; row += 1) {
        for (let column = centreColumn - hotspotRadiusCells; column <= centreColumn + hotspotRadiusCells; column += 1) {
          if (row < 0 || column < 0 || row >= data.metadata.grid.height || column >= data.metadata.grid.width) continue
          if ((row - centreRow) ** 2 + (column - centreColumn) ** 2 > hotspotRadiusCells ** 2) continue
          const index = row * data.metadata.grid.width + column
          if (!data.active[index]) continue
          activeCells += 1
          maximumDepth = Math.max(maximumDepth, displayDepth[index])
          if (displayDepth[index] >= 0.1) wetCells += 1
        }
      }
      return {
        name: label.name,
        maximumDepth,
        wetFraction: activeCells ? wetCells / activeCells : 0,
      }
    })
    .filter((hotspot) => hotspot.maximumDepth >= 0.1)
  const neighbourhoodByName = new Map<string, (typeof neighbourhoodCandidates)[number]>()
  for (const hotspot of neighbourhoodCandidates) {
    const existing = neighbourhoodByName.get(hotspot.name)
    if (!existing || hotspot.maximumDepth > existing.maximumDepth
      || (hotspot.maximumDepth === existing.maximumDepth
        && hotspot.wetFraction > existing.wetFraction)) {
      neighbourhoodByName.set(hotspot.name, hotspot)
    }
  }
  const neighbourhoodHotspots = [...neighbourhoodByName.values()]
    .sort((first, second) => second.maximumDepth - first.maximumDepth
      || second.wetFraction - first.wetFraction)
    .slice(0, 3)
  let medianWetCells = 0
  for (let index = 0; index < displayDepth.length; index += 1) {
    if (data.active[index] && displayDepth[index] >= 0.1) medianWetCells += 1
  }
  const stats = timelineActive
    ? [
        ['Elapsed', elapsedLabel],
        ['Flood area >10 cm', `${number(medianWetCells * cellAreaKm2)} km²`],
        ['Roads >10 cm', `${number(roadLengthOver10cmKm, 1)} km`],
        ['Roads >30 cm', `${number(roadLengthOver30cmKm, 1)} km`],
      ]
    : view === 'city'
    ? [
        ['Building footprints', context.metadata.buildings.count.toLocaleString('en-PK')],
        ['Mapped segments', context.metadata.network.count.toLocaleString('en-PK')],
        ['Median over 10 cm', `${number(medianWetCells * cellAreaKm2)} km²`],
        ['Terrain-sensitive', `${number(agreement.terrain_sensitive_wet_fraction * 100, 1)}%`],
      ]
    : view === 'agreement'
      ? [
          ['Wet union', `${number(agreement.union_flooded_area_over_10cm_km2)} km²`],
          ['Shared by all', `${number(agreement.intersection_flooded_area_over_10cm_km2)} km²`],
          ['Terrain-sensitive', `${number(agreement.terrain_sensitive_wet_fraction * 100, 1)}%`],
          ['P95 depth spread', `${number(agreement.depth_range_p95_in_union_m)} m`],
        ]
      : [
          ['Area over 10 cm', `${number(selectedMetrics.flooded_area_over_10cm_km2)} km²`],
          ['Area over 30 cm', `${number(selectedMetrics.flooded_area_over_30cm_km2)} km²`],
          ['Maximum depth', `${number(selectedMetrics.maximum_depth_m)} m`],
          ['Wet-cell P95', `${number(selectedMetrics.wet_cell_depth_p95_m)} m`],
        ]

  return (
    <main className="app-shell">
      <header className="topbar">
        <div className="brand-lockup">
          <div className="brand-mark" aria-hidden="true"><span /></div>
          <div>
            <strong>Naqsha</strong>
            <small>Urban flood lab</small>
          </div>
        </div>
        <div className="location-lockup">
          <span className="live-dot" />
          <div>
            <small>Study area</small>
            <select
              aria-label="Study area"
              value={selectedArea.id}
              onChange={(event) => setSelectedAreaId(event.target.value)}
            >
              {catalog.areas.map((area) => (
                <option key={area.id} value={area.id}>{area.label}</option>
              ))}
            </select>
            <span>{selectedArea.location}</span>
          </div>
        </div>
        <div className="topbar-actions">
          <div className="dimension-switch" role="group" aria-label="Map dimension">
            {(['2d', '3d'] as Dimension[]).map((mode) => (
              <button
                key={mode}
                className={dimension === mode ? 'active' : ''}
                onClick={() => setDimension(mode)}
              >
                {mode.toUpperCase()}
              </button>
            ))}
          </div>
          <button className="icon-button" onClick={() => setResetNonce((value) => value + 1)}>
            Reset view
          </button>
        </div>
      </header>

      <aside className="sidebar">
        <section className="warning-card">
          <span className="warning-icon">!</span>
          <div>
            <p>Experimental screening</p>
            <span>{data.metadata.warning}</span>
          </div>
        </section>

        <section className="panel-section">
          <div className="section-heading">
            <div>
              <p className="eyebrow">{forecastForcing ? 'Forecast scenario' : 'Design stress scenario'}</p>
              <h2>{data.metadata.label}</h2>
            </div>
            <span className="status-chip">{forecastForcing?.profile?.id ?? 'Computed'}</span>
          </div>
          <div className="scenario-grid">
            <div><span>Rain</span><strong>{data.metadata.scenario.rainfall_total_mm} mm</strong></div>
            <div><span>Duration</span><strong>{data.metadata.scenario.rainfall_duration_minutes / 60} h</strong></div>
            <div><span>Loss proxy</span><strong>{data.metadata.scenario.effective_loss_rate_mm_per_hour} mm/h</strong></div>
            <div><span>Recession</span><strong>{data.metadata.scenario.recession_minutes / 60} h</strong></div>
          </div>
          {forecastForcing ? (
            <p className="helper-copy">
              {forecastForcing.provider} {forecastForcing.model} · {forecastForcing.memberCount} members ·{' '}
              retrieved {forecastForcing.retrievedAtUtc ? new Date(forecastForcing.retrievedAtUtc).toLocaleString('en-PK') : 'time unavailable'}.
            </p>
          ) : (
            <p className="helper-copy">Precomputed design forcing. Display controls never rescale the model physics.</p>
          )}
        </section>

        <section className="panel-section timeline-section">
          <div className="section-heading compact">
            <div>
              <p className="eyebrow">Flood evolution</p>
              <h2>{timelineActive ? `${phase} · ${elapsedLabel}` : 'Peak envelope'}</h2>
            </div>
            {timelineActive && <span className="status-chip">10 min steps</span>}
          </div>
          <div className="mode-switch" role="group" aria-label="Flood time mode">
            <button className={floodMode === 'timeline' ? 'active' : ''} onClick={() => setFloodMode('timeline')}>Timeline</button>
            <button className={floodMode === 'maximum' ? 'active' : ''} onClick={() => { setFloodMode('maximum'); setPlaying(false) }}>Peak envelope</button>
          </div>
          <div className={timelineActive ? 'timeline-controls' : 'timeline-controls disabled'}>
            <button
              className="play-button"
              disabled={!timelineActive}
              onClick={() => setPlaying((current) => !current)}
              aria-label={playing ? 'Pause flood timeline' : 'Play flood timeline'}
            >
              {playing ? 'Pause' : 'Play'}
            </button>
            <input
              aria-label="Flood timeline"
              type="range"
              min="0"
              max={data.metadata.timeline.frameCount - 1}
              step="1"
              value={frameIndex}
              disabled={!timelineActive}
              onChange={(event) => { setFrameIndex(Number(event.target.value)); setPlaying(false) }}
            />
            <output>{elapsedLabel}</output>
          </div>
          {view === 'agreement' && <p className="helper-copy">Agreement is a peak-depth analysis; choose a city or terrain view for playback.</p>}
        </section>

        <section className="panel-section">
          <div className="section-heading compact">
            <div>
              <p className="eyebrow">View</p>
              <h2>City and terrain</h2>
            </div>
          </div>
          <div className="view-list" role="radiogroup" aria-label="Map view">
            {viewOrder.map((id) => (
              <button
                className={view === id ? 'view-option active' : 'view-option'}
                key={id}
                role="radio"
                aria-checked={view === id}
                onClick={() => setView(id)}
              >
                <span className={`view-swatch ${id}`} />
                <span>{viewLabel(data, id)}</span>
                {id === 'city' && <small>recommended</small>}
                {id === 'agreement' && <small>analysis</small>}
              </button>
            ))}
          </div>
        </section>

        <section className="panel-section controls-section">
          <label className={view === 'agreement' ? 'range-control disabled' : 'range-control'}>
            <span><b>Visible depth</b><output>{view === 'agreement' ? '10 cm fixed' : `${Math.round(threshold * 100)} cm`}</output></span>
            <input
              type="range"
              min="0.05"
              max="0.5"
              step="0.05"
              value={view === 'agreement' ? 0.1 : threshold}
              disabled={view === 'agreement'}
              onChange={(event) => setThreshold(Number(event.target.value))}
            />
          </label>
          <label className={dimension === '2d' ? 'range-control disabled' : 'range-control'}>
            <span><b>Vertical exaggeration</b><output>{dimension === '2d' ? 'flat' : `${verticalExaggeration}×`}</output></span>
            <input
              type="range"
              min="1"
              max="8"
              step="1"
              value={verticalExaggeration}
              disabled={dimension === '2d'}
              onChange={(event) => setVerticalExaggeration(Number(event.target.value))}
            />
          </label>
          <label className={dimension === '2d' ? 'range-control disabled' : 'range-control'}>
            <span>
              <b>Flood height display</b>
              <output>{dimension === '2d' ? 'plan view' : `${waterDepthExaggeration}× visual`}</output>
            </span>
            <input
              type="range"
              min="1"
              max="12"
              step="1"
              value={waterDepthExaggeration}
              disabled={dimension === '2d'}
              onChange={(event) => setWaterDepthExaggeration(Number(event.target.value))}
            />
          </label>
          <div className="layer-controls">
            <Toggle checked={showBasemap} label="OSM basemap" helper="Live, browser-cached tiles" onChange={setShowBasemap} />
            <Toggle checked={showWater} label="Flood depth" helper={timelineActive ? `Instantaneous · ${elapsedLabel}` : 'Modelled peak envelope'} onChange={setShowWater} />
            <Toggle checked={showBuildings} label="Buildings" helper="Footprints; proxy heights" onChange={setShowBuildings} />
            <Toggle checked={showNetwork} label="Street network" helper="Roads, rail and water" onChange={setShowNetwork} />
            <Toggle checked={showRoadImpacts} label="Road impacts" helper="Depth + terrain agreement" onChange={setShowRoadImpacts} />
            <Toggle checked={showLabels} label="Map labels" helper="Places, roads, landmarks and POIs" onChange={setShowLabels} />
          </div>
        </section>

        <section className="provenance">
          <p>{data.metadata.location}</p>
          <p>SFINCS 2.4.0 · {data.metadata.grid.crs} · {number(data.metadata.grid.cellSizeMetres, 2)} m cells</p>
          <p>Flood volume height is display-exaggerated in 3D</p>
          <p>{context.metadata.buildings.inferredHeightCount.toLocaleString('en-PK')} building heights are an 8 m visual proxy</p>
        </section>
      </aside>

      <section className="viewport">
        <TerrainScene
          data={data}
          displayDepth={displayDepth}
          context={context}
          view={view}
          dimension={dimension}
          threshold={threshold}
          verticalExaggeration={verticalExaggeration}
          waterDepthExaggeration={waterDepthExaggeration}
          showWater={showWater}
          showBasemap={showBasemap}
          showBuildings={showBuildings}
          showNetwork={showNetwork}
          showRoadImpacts={showRoadImpacts}
          roadImpactDepth={roadImpactDepth}
          roadImpactAgreement={roadImpactAgreement}
          showLabels={showLabels}
          resetNonce={resetNonce}
        />
        <div className="viewport-title">
          <p className="eyebrow">
            {view === 'city'
              ? `Urban context · ensemble median ${timelineActive ? `at ${elapsedLabel}` : 'peak envelope'} · ${Math.round(threshold * 100)} cm threshold${dimension === '3d' ? ` · flood height ${waterDepthExaggeration}× visual` : ''}`
              : `${timelineActive ? `Instantaneous inundation at ${elapsedLabel}` : 'Maximum inundation'} · ${view === 'agreement' ? '10 cm agreement threshold' : `${Math.round(threshold * 100)} cm display threshold`}`}
          </p>
          <h1>{viewLabel(data, view)}</h1>
        </div>
        <div className="metric-row">
          {stats.map(([label, value]) => (
            <div className="metric-card" key={label}>
              <span>{label}</span>
              <strong>{value}</strong>
            </div>
          ))}
        </div>
        <div className="legend-card">
          {view === 'agreement' ? (
            <>
              <p>Terrain members above 10 cm</p>
              <div className="legend-items">
                <span><i className="legend-one" />1 · source-specific</span>
                <span><i className="legend-two" />2 · partial</span>
                <span><i className="legend-three" />3 · shared</span>
              </div>
            </>
          ) : (
            <>
              <p>{timelineActive ? `Instantaneous depth · ${phase.toLowerCase()}` : view === 'city' ? 'Ensemble median peak depth' : 'Peak depth envelope'}</p>
              <div className="depth-ramp" />
              <div className="ramp-labels"><span>shallow</span><span>deep</span></div>
            </>
          )}
        </div>
        {view === 'city' && showRoadImpacts && roadImpact && (
          <div className="road-impact-card">
            <p>Road exposure · screening only</p>
            <div className="road-risk-ramp">
              <span><i className="road-shallow" />5–10 cm</span>
              <span><i className="road-moderate" />10–30 cm</span>
              <span><i className="road-severe" />30+ cm</span>
            </div>
            <small>{number(sharedRoadLengthKm, 1)} km over 10 cm in all terrain members</small>
          </div>
        )}
        {view === 'city' && showRoadImpacts && mostImpactedRoads.length > 0 && (
          <div className="road-ranking-card">
            <p>Most impacted named roads</p>
            <ol>
              {mostImpactedRoads.map(([name, exposure]) => (
                <li key={name}>
                  <span>{name}</span>
                  <strong>{number(exposure.maximumDepth)} m · {number(exposure.exposedLengthKm, 1)} km</strong>
                </li>
              ))}
            </ol>
            <small>Ranked by sampled maximum depth; not a closure or safe-routing decision.</small>
            {neighbourhoodHotspots.length > 0 && (
              <div className="hotspot-ranking">
                <p>Highest-depth label vicinities</p>
                {neighbourhoodHotspots.map((hotspot) => (
                  <div key={hotspot.name}>
                    <span>{hotspot.name}</span>
                    <strong>{number(hotspot.maximumDepth)} m · {number(hotspot.wetFraction * 100, 0)}% wet</strong>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
        <div className="navigation-hint">
          {dimension === '2d' ? 'Drag to pan · Scroll to zoom · North is up' : 'Drag to orbit · Scroll to zoom · Right-drag to pan'}
        </div>
        <div className="map-attribution">
          Buildings © <a href="https://overturemaps.org/" target="_blank" rel="noreferrer">Overture Maps Foundation</a>
          {' · '}Google Open Buildings · Microsoft Global ML Building Footprints · <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noreferrer">OpenStreetMap contributors</a> · ODbL
        </div>
      </section>
    </main>
  )
}
