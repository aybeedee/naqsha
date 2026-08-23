COMPOSE := $(shell docker compose version >/dev/null 2>&1 && echo "docker compose" || echo "docker-compose")

.PHONY: build audit compare ensemble elevation-control test audit-local compare-local ensemble-local elevation-control-local test-local lint-local

build:
	$(COMPOSE) build terrain-audit

audit:
	$(COMPOSE) run --rm terrain-audit

compare:
	$(COMPOSE) run --rm terrain-audit python -m naqsha.terrain_compare --aoi data/aoi/pilot.geojson --output artifacts/terrain-comparison

ensemble:
	$(COMPOSE) run --rm terrain-audit python -m naqsha.terrain_ensemble --aoi data/aoi/pilot.geojson --output artifacts/terrain-ensemble

elevation-control:
	$(COMPOSE) run --rm terrain-audit python -m naqsha.elevation_control --aoi data/aoi/central-lahore-candidate.geojson --input data/raw/icesat2/ATL08_2025-08-28_RGT1133.csv --output artifacts/central-lahore-elevation-control --download --surface copernicus=artifacts/central-lahore-terrain-ensemble/copernicus/terrain-utm43n.tif --surface fabdem=artifacts/central-lahore-terrain-ensemble/fabdem/terrain-utm43n.tif --surface srtm=artifacts/central-lahore-terrain-ensemble/srtm/terrain-utm43n.tif

test:
	$(COMPOSE) run --rm terrain-audit pytest -q

audit-local:
	.venv/bin/python -m naqsha.terrain --aoi data/aoi/pilot.geojson --output artifacts/terrain

compare-local:
	.venv/bin/python -m naqsha.terrain_compare --aoi data/aoi/pilot.geojson --output artifacts/terrain-comparison

ensemble-local:
	.venv/bin/python -m naqsha.terrain_ensemble --aoi data/aoi/pilot.geojson --output artifacts/terrain-ensemble

elevation-control-local:
	.venv/bin/python -m naqsha.elevation_control --aoi data/aoi/central-lahore-candidate.geojson --input data/raw/icesat2/ATL08_2025-08-28_RGT1133.csv --output artifacts/central-lahore-elevation-control --download --surface copernicus=artifacts/central-lahore-terrain-ensemble/copernicus/terrain-utm43n.tif --surface fabdem=artifacts/central-lahore-terrain-ensemble/fabdem/terrain-utm43n.tif --surface srtm=artifacts/central-lahore-terrain-ensemble/srtm/terrain-utm43n.tif

test-local:
	.venv/bin/pytest -q

lint-local:
	.venv/bin/ruff check .
