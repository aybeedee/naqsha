import { useEffect, useMemo, useState } from 'react'
import { loadScenario } from './data'
import { TerrainScene } from './TerrainScene'
import type { MemberGrid, ScenarioData, ViewId } from './types'

const viewOrder: ViewId[] = ['agreement', 'copernicus', 'fabdem', 'srtm']

function number(value: number, digits = 2): string {
  return value.toLocaleString('en-PK', {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  })
}

function memberFor(data: ScenarioData, view: ViewId): MemberGrid | undefined {
  return data.members.find((member) => member.id === view)
}

function viewLabel(data: ScenarioData, view: ViewId): string {
  return view === 'agreement' ? 'Agreement' : memberFor(data, view)?.label ?? view
}

export function App() {
  const [data, setData] = useState<ScenarioData | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [view, setView] = useState<ViewId>('agreement')
  const [threshold, setThreshold] = useState(0.1)
  const [verticalExaggeration, setVerticalExaggeration] = useState(4)
  const [showWater, setShowWater] = useState(true)
  const [resetNonce, setResetNonce] = useState(0)

  useEffect(() => {
    loadScenario().then(setData).catch((reason: unknown) => {
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
  if (!data) {
    return (
      <main className="center-state loading-state">
        <div className="loading-mark" />
        <p>Loading the Lahore ensemble…</p>
      </main>
    )
  }

  const agreement = data.metadata.agreement.metrics
  const selectedMetrics = selectedMember?.metrics
  const stats =
    view === 'agreement'
      ? [
          ['Wet union', `${number(agreement.union_flooded_area_over_10cm_km2)} km²`],
          ['Shared by all', `${number(agreement.intersection_flooded_area_over_10cm_km2)} km²`],
          ['Terrain-sensitive', `${number(agreement.terrain_sensitive_wet_fraction * 100, 1)}%`],
          ['P95 depth spread', `${number(agreement.depth_range_p95_in_union_m)} m`],
        ]
      : [
          ['Area over 10 cm', `${number(selectedMetrics!.flooded_area_over_10cm_km2)} km²`],
          ['Area over 30 cm', `${number(selectedMetrics!.flooded_area_over_30cm_km2)} km²`],
          ['Maximum depth', `${number(selectedMetrics!.maximum_depth_m)} m`],
          ['Wet-cell P95', `${number(selectedMetrics!.wet_cell_depth_p95_m)} m`],
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
        <button className="icon-button" onClick={() => setResetNonce((value) => value + 1)}>
          Reset view
        </button>
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
          <p className="helper-copy">Only precomputed scenarios are selectable. These controls do not rescale physics in the browser.</p>
        </section>

        <section className="panel-section">
          <div className="section-heading compact">
            <div>
              <p className="eyebrow">Compare</p>
              <h2>Terrain realization</h2>
            </div>
          </div>
          <div className="view-list" role="radiogroup" aria-label="Terrain view">
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
                {id === 'agreement' && <small>recommended</small>}
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
          <label className="range-control">
            <span><b>Vertical exaggeration</b><output>{verticalExaggeration}×</output></span>
            <input
              type="range"
              min="1"
              max="12"
              step="1"
              value={verticalExaggeration}
              onChange={(event) => setVerticalExaggeration(Number(event.target.value))}
            />
          </label>
          <label className="toggle-control">
            <span><b>Water overlay</b><small>Show modelled maximum extent</small></span>
            <input type="checkbox" checked={showWater} onChange={(event) => setShowWater(event.target.checked)} />
          </label>
        </section>

        <section className="provenance">
          <p>SFINCS 2.4.0 · EPSG:32643 · 28.66 m cells</p>
          <p>Evidence resolution ≈ 30 m · synthetic forcing</p>
        </section>
      </aside>

      <section className="viewport">
        <TerrainScene
          data={data}
          view={view}
          threshold={threshold}
          verticalExaggeration={verticalExaggeration}
          showWater={showWater}
          resetNonce={resetNonce}
        />
        <div className="viewport-title">
          <p className="eyebrow">Maximum inundation · {view === 'agreement' ? '10 cm threshold' : `${Math.round(threshold * 100)} cm display threshold`}</p>
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
              <p>Maximum depth</p>
              <div className="depth-ramp" />
              <div className="ramp-labels"><span>shallow</span><span>deep</span></div>
            </>
          )}
        </div>
        <div className="navigation-hint">Drag to orbit · Scroll to zoom · Right-drag to pan</div>
      </section>
    </main>
  )
}
