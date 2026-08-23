COMPOSE := $(shell docker compose version >/dev/null 2>&1 && echo "docker compose" || echo "docker-compose")

.PHONY: build audit compare ensemble central-ensemble elevation-control hydraulic-build hydraulic-run hydraulic-results web-export web-export-local web-install web-dev web-test web-build test audit-local compare-local ensemble-local central-ensemble-local elevation-control-local hydraulic-build-local hydraulic-results-local test-local lint-local

HYDRAULIC_MODELS := artifacts/hydraulic-ensemble/rain100mm-2h-loss5
HYDRAULIC_RESULTS := artifacts/hydraulic-results/rain100mm-2h-loss5
SFINCS_IMAGE := deltares/sfincs-cpu:sfincs-v2.4.0-Galibier-Release
WEB_SCENARIO := web/public/scenarios/rain100mm-2h-loss5

build:
	$(COMPOSE) build terrain-audit

audit:
	$(COMPOSE) run --rm terrain-audit

compare:
	$(COMPOSE) run --rm terrain-audit python -m naqsha.terrain_compare --aoi data/aoi/pilot.geojson --output artifacts/terrain-comparison

ensemble:
	$(COMPOSE) run --rm terrain-audit python -m naqsha.terrain_ensemble --aoi data/aoi/pilot.geojson --output artifacts/terrain-ensemble

central-ensemble:
	$(COMPOSE) run --rm terrain-audit python -m naqsha.terrain_ensemble --aoi data/aoi/central-lahore-candidate.geojson --output artifacts/central-lahore-terrain-ensemble

elevation-control:
	$(COMPOSE) run --rm terrain-audit python -m naqsha.elevation_control --aoi data/aoi/central-lahore-candidate.geojson --input data/raw/icesat2/ATL08_2025-08-28_RGT1133.csv --output artifacts/central-lahore-elevation-control --download --surface copernicus=artifacts/central-lahore-terrain-ensemble/copernicus/terrain-utm43n.tif --surface fabdem=artifacts/central-lahore-terrain-ensemble/fabdem/terrain-utm43n.tif --surface srtm=artifacts/central-lahore-terrain-ensemble/srtm/terrain-utm43n.tif

hydraulic-build:
	$(COMPOSE) run --rm terrain-audit python -m naqsha.hydraulic_model --output $(HYDRAULIC_MODELS) --surface copernicus=artifacts/central-lahore-terrain-ensemble/copernicus/terrain-utm43n.tif --surface fabdem=artifacts/central-lahore-terrain-ensemble/fabdem/terrain-utm43n.tif --surface srtm=artifacts/central-lahore-terrain-ensemble/srtm/terrain-utm43n.tif

hydraulic-run:
	docker run --rm --platform linux/amd64 -v "$(CURDIR)/$(HYDRAULIC_MODELS)/copernicus:/data" $(SFINCS_IMAGE)
	docker run --rm --platform linux/amd64 -v "$(CURDIR)/$(HYDRAULIC_MODELS)/fabdem:/data" $(SFINCS_IMAGE)
	docker run --rm --platform linux/amd64 -v "$(CURDIR)/$(HYDRAULIC_MODELS)/srtm:/data" $(SFINCS_IMAGE)

hydraulic-results:
	$(COMPOSE) run --rm terrain-audit python -m naqsha.hydraulic_results --models $(HYDRAULIC_MODELS) --output $(HYDRAULIC_RESULTS)

web-export:
	$(COMPOSE) run --rm terrain-audit python -m naqsha.web_export --models $(HYDRAULIC_MODELS) --results $(HYDRAULIC_RESULTS) --output $(WEB_SCENARIO)

web-export-local:
	.venv/bin/python -m naqsha.web_export --models $(HYDRAULIC_MODELS) --results $(HYDRAULIC_RESULTS) --output $(WEB_SCENARIO)

web-install:
	npm --prefix web ci

web-dev:
	npm --prefix web run dev

web-test:
	npm --prefix web test

web-build:
	npm --prefix web run build

test:
	$(COMPOSE) run --rm terrain-audit pytest -q

audit-local:
	.venv/bin/python -m naqsha.terrain --aoi data/aoi/pilot.geojson --output artifacts/terrain

compare-local:
	.venv/bin/python -m naqsha.terrain_compare --aoi data/aoi/pilot.geojson --output artifacts/terrain-comparison

ensemble-local:
	.venv/bin/python -m naqsha.terrain_ensemble --aoi data/aoi/pilot.geojson --output artifacts/terrain-ensemble

central-ensemble-local:
	.venv/bin/python -m naqsha.terrain_ensemble --aoi data/aoi/central-lahore-candidate.geojson --output artifacts/central-lahore-terrain-ensemble

elevation-control-local:
	.venv/bin/python -m naqsha.elevation_control --aoi data/aoi/central-lahore-candidate.geojson --input data/raw/icesat2/ATL08_2025-08-28_RGT1133.csv --output artifacts/central-lahore-elevation-control --download --surface copernicus=artifacts/central-lahore-terrain-ensemble/copernicus/terrain-utm43n.tif --surface fabdem=artifacts/central-lahore-terrain-ensemble/fabdem/terrain-utm43n.tif --surface srtm=artifacts/central-lahore-terrain-ensemble/srtm/terrain-utm43n.tif

hydraulic-build-local:
	.venv/bin/python -m naqsha.hydraulic_model --output $(HYDRAULIC_MODELS) --surface copernicus=artifacts/central-lahore-terrain-ensemble/copernicus/terrain-utm43n.tif --surface fabdem=artifacts/central-lahore-terrain-ensemble/fabdem/terrain-utm43n.tif --surface srtm=artifacts/central-lahore-terrain-ensemble/srtm/terrain-utm43n.tif

hydraulic-results-local:
	.venv/bin/python -m naqsha.hydraulic_results --models $(HYDRAULIC_MODELS) --output $(HYDRAULIC_RESULTS)

test-local:
	.venv/bin/pytest -q

lint-local:
	.venv/bin/ruff check .
