import { useEffect, useRef } from 'react'
import { Icon } from './Icon'
import type { ScenarioData, UrbanContextData } from './types'

export function About({
  open,
  onClose,
  data,
  context,
}: {
  open: boolean
  onClose: () => void
  data: ScenarioData
  context: UrbanContextData
}) {
  const dialog = useRef<HTMLDialogElement>(null)
  const { scenario, timeline, grid } = data.metadata
  const forcing = scenario.forcing_metadata
  useEffect(() => {
    if (open) dialog.current?.showModal()
    else dialog.current?.close()
  }, [open])
  return (
    <dialog
      ref={dialog}
      className="about-dialog"
      aria-labelledby="about-title"
      onCancel={onClose}
      onClose={onClose}
      onClick={(event) => {
        if (event.target === event.currentTarget) onClose()
      }}
    >
      <article>
        <div className="dialog-heading">
          <p className="eyebrow">About Naqsha</p>
          <button className="icon-button" aria-label="Close about" onClick={onClose}>
            <Icon name="close" />
          </button>
        </div>
        <h2 id="about-title">
          A way to explore flooding
          <br />
          in a familiar city.
        </h2>
        <p>
          Naqsha puts a flood simulation on a map of Lahore. Follow the rain, look up a place, and
          compare what different terrain data say.
        </p>
        <h3>What you’re seeing</h3>
        <p>
          {forcing
            ? `This scenario uses an archived ${forcing.model ?? 'weather'} forecast.`
            : `The current example applies ${scenario.rainfall_total_mm} mm of rain evenly over ${scenario.rainfall_duration_minutes / 60} hours.`}{' '}
          The flood model runs in advance; playback shows its saved results every{' '}
          {timeline.intervalSeconds / 60} minutes. Changing layers or water height only changes the
          display.
        </p>
        <h3>How to read the result</h3>
        <p>
          The combined view takes the middle depth from three terrain models at each cell. “Whole
          event” shows the highest of those saved depths at each location; these peaks can happen at
          different times. Model agreement counts how many terrain models exceed 10 cm over the
          event. FABDEM derives from Copernicus, so these are not three independent measurements.
          Agreement is not a flood probability.
        </p>
        <h3>What limits the accuracy</h3>
        <p>
          The terrain is roughly {Math.round(grid.cellSizeMetres)} m per cell. Roads, drains, kerbs
          and underpasses need much finer surveys. Building footprints are real map data, but most
          heights are estimates and buildings do not yet act as hydraulic barriers. No calibration
          against a local flood event has been completed.
        </p>
        <h3>And future rainfall?</h3>
        <p>
          A separate pipeline can turn ECMWF ensemble forecasts into rainfall scenarios. This viewer
          does not refresh forecasts or run new simulations. The example storm should not be read as
          tomorrow’s conditions.
        </p>
        <details>
          <summary>Data & model settings</summary>
          <dl className="model-facts">
            <div>
              <dt>Flood solver</dt>
              <dd>SFINCS 2.4.0</dd>
            </div>
            <div>
              <dt>Elevation</dt>
              <dd>Copernicus GLO-30, FABDEM 1.2, SRTM-family</dd>
            </div>
            <div>
              <dt>Grid</dt>
              <dd>
                {grid.cellSizeMetres.toFixed(2)} m · {grid.crs}
              </dd>
            </div>
            <div>
              <dt>Effective loss assumption</dt>
              <dd>{scenario.effective_loss_rate_mm_per_hour} mm/h</dd>
            </div>
            <div>
              <dt>Manning roughness</dt>
              <dd>{scenario.manning_roughness}</dd>
            </div>
            <div>
              <dt>Boundary</dt>
              <dd>Open outflow at the model edge</dd>
            </div>
            <div>
              <dt>Buildings</dt>
              <dd>
                {context.metadata.buildings.count.toLocaleString()} footprints ·{' '}
                {context.metadata.buildings.inferredHeightMetres} m default height
              </dd>
            </div>
            <div>
              <dt>OpenStreetMap extract</dt>
              <dd>{context.metadata.provenance.osmTimestamp}</dd>
            </div>
            {forcing && (
              <>
                <div>
                  <dt>Forecast retrieved</dt>
                  <dd>{forcing.retrievedAtUtc ?? 'Unknown'}</dd>
                </div>
                <div>
                  <dt>Forecast valid through</dt>
                  <dd>{forcing.validThroughUtc ?? 'Unknown'}</dd>
                </div>
              </>
            )}
          </dl>
          <p className="fine-print">
            FABDEM is used under its non-commercial licence. The loss assumption is a simplified
            surface-loss term, not a measured drainage capacity.
          </p>
        </details>
        <p>
          <a className="text-button" href="/methodology">
            Read the methodology <Icon name="arrow" />
          </a>
        </p>
        <a
          className="text-button"
          href="https://github.com/aybeedee/naqsha"
          target="_blank"
          rel="noreferrer"
        >
          Source code & data notes <Icon name="arrow" />
        </a>
      </article>
    </dialog>
  )
}
