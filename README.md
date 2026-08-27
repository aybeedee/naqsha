# Naqsha

Naqsha is an experimental urban-flood planning tool for Lahore, Pakistan. The
first milestones are deliberately data-first: they test whether freely
available terrain can support useful flood modelling over a 5–25 km² pilot,
then expose the resulting uncertainty in an interactive 3D viewer.

## Current vertical slice

The terrain audit:

1. validates a GeoJSON pilot boundary;
2. reads the public Copernicus GLO-30 terrain tile covering it;
3. clips and reprojects the terrain to UTM zone 43N;
4. writes a clipped GeoTIFF, hillshade, machine-readable metrics, and a short
   Markdown quality report;
5. compares the raw Copernicus surface against FABDEM's building/forest-removed
   derivative to measure how strongly conditioning changes local routing;
6. tests all three surfaces against the one public ICESat-2 ATL08 pass found
   crossing the central Lahore candidate;
7. runs the same synthetic storm through three pinned SFINCS 2.4.0 models and
   exports 10-minute water-depth timelines, maximum-depth rasters, and
   terrain-agreement rasters;
8. packages those grids into compact browser assets and presents them in an
   uncertainty-first Three.js viewer;
9. adds frozen public-data city layers for central Lahore and Gulberg–Liberty,
   together containing 43,661 building footprints and 6,447 mapped
   road/rail/water/park segments;
10. optionally drapes live OSM cartography over the terrain and renders either
    instantaneous or peak flood depth as an explicitly display-exaggerated 3D
    volume;
11. intersects every hydraulic frame with the mapped road network, colours
    exposed segments, and ranks named roads and neighbourhood-label vicinities;
12. archives 51-member weather-model rainfall forecasts as reproducible
    p10/p50/p90 forcing trajectories accepted directly by SFINCS.

The app includes two deliberately different areas: central Lahore is the
evidence-led validation benchmark; Gulberg–Liberty is a provisional expansion
area. Neither has passed the accuracy gate for authoritative depths.

## Run

Docker is the only host dependency for the reproducible path:

```bash
make build
make audit
```

Outputs are written to `artifacts/terrain/`. The first run needs internet
access to read the public Copernicus Cloud Optimized GeoTIFF.

Run the conditioning comparison with `make compare` (container) or
`make compare-local` (local virtual environment). FABDEM is licensed for
non-commercial use; it is an evaluation input, not yet an unconditional
production dependency.

Run the three-surface screening-stability gate with `make ensemble` or
`make ensemble-local`. This adds the AWS open SRTM-family terrain surface and
reports whether broad low-area rankings persist across all three inputs.

After generating the central Lahore terrain ensemble, run
`make elevation-control-local` to download and audit the 28 August 2025
ICESat-2 pass. The raw CSV and generated outputs are ignored; the retrieval and
quality-gate logic are versioned. Only eight in-bound estimates meet the
liberal 5 m reported-uncertainty filter, so this is independent context rather
than a substitute for a local DTM.

The first experimental hydraulic slice is fully runnable with Colima/Docker:

```bash
make central-ensemble-local
make hydraulic-build-local
make hydraulic-run
make hydraulic-results-local
```

It applies 100 mm over two hours, followed by two hours of recession, with a
uniform 5 mm/h effective surface-loss sensitivity. These are synthetic,
uncalibrated assumptions. Results are written under
`artifacts/hydraulic-results/rain100mm-2h-loss5/`; see the
[hydraulic ensemble decision](docs/experimental-hydraulic-ensemble.md) before
interpreting them.

The precomputed 3D viewer can then be run locally:

```bash
make web-install
make web-dev
```

Open `http://localhost:5174`. The checked-in scenario assets are enough to use
the viewer without rerunning SFINCS. Select either district in the top bar, or
open `?area=gulberg-liberty` directly. To regenerate them from local hydraulic
artifacts, run `make web-export-local`. A containerized production build is
available with `docker compose up --build viewer` (or `docker-compose` on an
older Compose installation). See the [viewer design and data contract](docs/web-viewer.md)
and the [Google Photorealistic 3D Tiles decision](docs/google-photorealistic-3d-tiles.md).

The checked-in city extract is sufficient to run the app. To reproduce it from
the public Overture and OpenStreetMap sources, follow the
[urban-context decision](docs/urban-context.md) or run the three
`make urban-context-*` targets documented there.

## Forecast-to-flood workflow

The forecast path is operational but intentionally does not treat one weather
model as certainty. It archives actual ensemble-member trajectories nearest
the whole-event p10, p50, and p90 rainfall totals:

```bash
make forecast-central-local
make forecast-hydraulic-build-local FORECAST_PROFILE=p90
make forecast-hydraulic-run FORECAST_PROFILE=p90
make forecast-hydraulic-results-local FORECAST_PROFILE=p90
```

The archive records provider, model, grid point, retrieval time, valid period,
member count, and every hourly forcing value. The current command uses the
ECMWF IFS ensemble through Open-Meteo over a 72-hour horizon. This global model
does not resolve neighbourhood convection, so results remain scenario bands,
not a deterministic warning. See [forecast and road impacts](docs/forecast-and-road-impacts.md).

Run the automated tests with:

```bash
make test
```

For local development with Python 3.12 or newer, create `.venv`, install with
`pip install -e '.[dev]'`, then use `make test-local` or `make audit-local`.

## Repository layout

```text
data/aoi/             versioned study boundaries
docs/                 architecture and data decisions
src/naqsha/           reproducible data/model tooling
tests/                offline automated tests
artifacts/             generated reports and rasters (ignored)
web/                   React/Three.js viewer and compact scenario assets
```

## Accuracy policy

Computational resolution is not evidence resolution. Copernicus GLO-30 is a
30 m digital surface model; interpolating it to a smaller cell size does not
create street-level elevation. Every exported result must retain source,
resolution, assumptions, and uncertainty metadata.
