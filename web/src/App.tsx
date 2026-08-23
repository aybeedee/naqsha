import { useEffect, useMemo, useState } from 'react'
import { loadScenario, loadUrbanContext } from './data'
import { TerrainScene } from './TerrainScene'
import type {
  Dimension,
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
  const [data, setData] = useState<ScenarioData | null>(null)
  const [context, setContext] = useState<UrbanContextData | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [view, setView] = useState<ViewId>('city')
  const [dimension, setDimension] = useState<Dimension>('3d')
  const [threshold, setThreshold] = useState(0.1)
  const [verticalExaggeration, setVerticalExaggeration] = useState(1)
  const [waterDepthExaggeration, setWaterDepthExaggeration] = useState(6)
  const [showWater, setShowWater] = useState(true)
  const [showBasemap, setShowBasemap] = useState(true)
  const [showBuildings, setShowBuildings] = useState(true)
  const [showNetwork, setShowNetwork] = useState(true)
  const [showLabels, setShowLabels] = useState(true)
  const [resetNonce, setResetNonce] = useState(0)

  useEffect(() => {
    Promise.all([loadScenario(), loadUrbanContext()])
      .then(([scenario, urbanContext]) => {
        setData(scenario)
        setContext(urbanContext)
      })
      .catch((reason: unknown) => {
        setError(reason instanceof Error ? reason.message : String(reason))
      })
  }, [])

  const selectedMember = useMemo(
    () => (data ? memberFor(data, view) : undefined),
    [data, view],
  )

  if (error) {
    return (
      <main className="center-state">
        <p className="eyebrow">Viewer unavailable</p>
        <h1>Scenario data could not be loaded.</h1>
        <code>{error}</code>
      </main>
    )
  }
  if (!data || !context) {
    return (
      <main className="center-state loading-state">
        <div className="loading-mark" />
        <p>Loading the Lahore city model…</p>
      </main>
    )
  }

  const agreement = data.metadata.agreement.metrics
  const selectedMetrics = selectedMember!.metrics
  const cellAreaKm2 = data.metadata.grid.cellSizeMetres ** 2 / 1_000_000
  let medianWetCells = 0
  for (let index = 0; index < data.medianDepth.length; index += 1) {
    if (data.active[index] && data.medianDepth[index] >= 0.1) medianWetCells += 1
  }
  const stats = view === 'city'
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
            <strong>Central Lahore, Pakistan</strong>
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
              <p className="eyebrow">Scenario 01</p>
              <h2>{data.metadata.label}</h2>
            </div>
            <span className="status-chip">Computed</span>
          </div>
          <div className="scenario-grid">
            <div><span>Rain</span><strong>{data.metadata.scenario.rainfall_total_mm} mm</strong></div>
            <div><span>Duration</span><strong>{data.metadata.scenario.rainfall_duration_minutes / 60} h</strong></div>
            <div><span>Loss proxy</span><strong>{data.metadata.scenario.effective_loss_rate_mm_per_hour} mm/h</strong></div>
            <div><span>Recession</span><strong>{data.metadata.scenario.recession_minutes / 60} h</strong></div>
          </div>
          <p className="helper-copy">Precomputed forcing only. Display controls never rescale the model physics.</p>
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
            <Toggle checked={showWater} label="Flood depth" helper="Modelled maximum" onChange={setShowWater} />
            <Toggle checked={showBuildings} label="Buildings" helper="Footprints; proxy heights" onChange={setShowBuildings} />
            <Toggle checked={showNetwork} label="Street network" helper="Roads, rail and water" onChange={setShowNetwork} />
            <Toggle checked={showLabels} label="Place labels" helper="Districts and landmarks" onChange={setShowLabels} />
          </div>
        </section>

        <section className="provenance">
          <p>SFINCS 2.4.0 · EPSG:32643 · 28.66 m cells</p>
          <p>Flood volume height is display-exaggerated in 3D</p>
          <p>19,302 building heights are an 8 m visual proxy</p>
        </section>
      </aside>

      <section className="viewport">
        <TerrainScene
          data={data}
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
          showLabels={showLabels}
          resetNonce={resetNonce}
        />
        <div className="viewport-title">
          <p className="eyebrow">
            {view === 'city'
              ? `Urban context · ensemble median · ${Math.round(threshold * 100)} cm threshold${dimension === '3d' ? ` · flood height ${waterDepthExaggeration}× visual` : ''}`
              : `Maximum inundation · ${view === 'agreement' ? '10 cm agreement threshold' : `${Math.round(threshold * 100)} cm display threshold`}`}
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
              <p>{view === 'city' ? 'Ensemble median maximum depth' : 'Maximum depth'}</p>
              <div className="depth-ramp" />
              <div className="ramp-labels"><span>shallow</span><span>deep</span></div>
            </>
          )}
        </div>
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
