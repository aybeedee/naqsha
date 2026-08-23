# Naqsha

Naqsha is an experimental urban-flood planning tool for Lahore, Pakistan. The
first milestone is deliberately data-first: it tests whether freely available
terrain can support useful flood modelling over a 5–25 km² pilot before a 3D
application is built around it.

## Current vertical slice

The terrain audit:

1. validates a GeoJSON pilot boundary;
2. reads the public Copernicus GLO-30 terrain tile covering it;
3. clips and reprojects the terrain to UTM zone 43N;
4. writes a clipped GeoTIFF, hillshade, machine-readable metrics, and a short
   Markdown quality report;
5. compares the raw Copernicus surface against FABDEM's building/forest-removed
   derivative to measure how strongly conditioning changes local routing.

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
```

## Accuracy policy

Computational resolution is not evidence resolution. Copernicus GLO-30 is a
30 m digital surface model; interpolating it to a smaller cell size does not
create street-level elevation. Every exported result must retain source,
resolution, assumptions, and uncertainty metadata.
