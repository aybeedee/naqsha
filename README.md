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
   exports maximum-depth and terrain-agreement rasters;
8. packages those grids into compact browser assets and presents them in an
   uncertainty-first Three.js viewer.

The included boundary is a **provisional technical test area** around the
Gulberg–Liberty corridor. It is not yet the final hydraulic pilot.

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

Open `http://localhost:5173`. The checked-in scenario assets are enough to use
the viewer without rerunning SFINCS. To regenerate them from local hydraulic
artifacts, run `make web-export-local`. A containerized production build is
available with `docker compose up --build viewer` (or `docker-compose` on an
older Compose installation). See the [viewer design and data contract](docs/web-viewer.md).

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
