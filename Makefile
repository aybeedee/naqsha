COMPOSE := $(shell docker compose version >/dev/null 2>&1 && echo "docker compose" || echo "docker-compose")

.PHONY: build audit compare ensemble central-ensemble elevation-control forecast-central-local forecast-hydraulic-build-local forecast-hydraulic-run forecast-hydraulic-results-local hydraulic-build hydraulic-run hydraulic-results hydraulic-gulberg-build-local hydraulic-gulberg-run hydraulic-gulberg-results-local road-impact-local road-impact-gulberg-local osm-context-central-download osm-context-gulberg-download urban-context-install urban-context-download urban-context-gulberg-download urban-context-export-local urban-context-gulberg-export-local web-export web-export-local web-export-gulberg-local web-install web-dev web-test web-build test audit-local compare-local ensemble-local central-ensemble-local elevation-control-local hydraulic-build-local hydraulic-results-local test-local lint-local

HYDRAULIC_MODELS := artifacts/hydraulic-ensemble/rain100mm-2h-loss5
HYDRAULIC_RESULTS := artifacts/hydraulic-results/rain100mm-2h-loss5
SFINCS_IMAGE := deltares/sfincs-cpu:sfincs-v2.4.0-Galibier-Release
WEB_SCENARIO := web/public/scenarios/rain100mm-2h-loss5
URBAN_RAW := data/raw/urban-context
URBAN_CONTEXT := web/public/context/central-lahore
FORECAST_ARCHIVE := artifacts/forecasts/central-lahore-latest.json
FORECAST_PROFILE ?= p90
FORECAST_HYDRAULIC_MODELS := artifacts/hydraulic-forecast/central-lahore-$(FORECAST_PROFILE)
FORECAST_HYDRAULIC_RESULTS := artifacts/hydraulic-forecast-results/central-lahore-$(FORECAST_PROFILE)
GULBERG_HYDRAULIC_MODELS := artifacts/hydraulic-ensemble/gulberg-rain100mm-2h-loss5
GULBERG_HYDRAULIC_RESULTS := artifacts/hydraulic-results/gulberg-rain100mm-2h-loss5
GULBERG_WEB_SCENARIO := web/public/scenarios/gulberg-rain100mm-2h-loss5
GULBERG_URBAN_RAW := data/raw/urban-context-gulberg
GULBERG_URBAN_CONTEXT := web/public/context/gulberg-liberty

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

forecast-central-local:
	.venv/bin/python -m naqsha.forecast --latitude 31.555 --longitude 74.325 --forecast-hours 72 --output $(FORECAST_ARCHIVE)

forecast-hydraulic-build-local:
	.venv/bin/python -m naqsha.hydraulic_model --forecast $(FORECAST_ARCHIVE) --forecast-profile $(FORECAST_PROFILE) --output $(FORECAST_HYDRAULIC_MODELS) --surface copernicus=artifacts/central-lahore-terrain-ensemble/copernicus/terrain-utm43n.tif --surface fabdem=artifacts/central-lahore-terrain-ensemble/fabdem/terrain-utm43n.tif --surface srtm=artifacts/central-lahore-terrain-ensemble/srtm/terrain-utm43n.tif

forecast-hydraulic-run:
	docker run --rm --platform linux/amd64 -v "$(CURDIR)/$(FORECAST_HYDRAULIC_MODELS)/copernicus:/data" $(SFINCS_IMAGE)
	docker run --rm --platform linux/amd64 -v "$(CURDIR)/$(FORECAST_HYDRAULIC_MODELS)/fabdem:/data" $(SFINCS_IMAGE)
	docker run --rm --platform linux/amd64 -v "$(CURDIR)/$(FORECAST_HYDRAULIC_MODELS)/srtm:/data" $(SFINCS_IMAGE)

forecast-hydraulic-results-local:
	.venv/bin/python -m naqsha.hydraulic_results --models $(FORECAST_HYDRAULIC_MODELS) --output $(FORECAST_HYDRAULIC_RESULTS)

hydraulic-build:
	$(COMPOSE) run --rm terrain-audit python -m naqsha.hydraulic_model --output $(HYDRAULIC_MODELS) --surface copernicus=artifacts/central-lahore-terrain-ensemble/copernicus/terrain-utm43n.tif --surface fabdem=artifacts/central-lahore-terrain-ensemble/fabdem/terrain-utm43n.tif --surface srtm=artifacts/central-lahore-terrain-ensemble/srtm/terrain-utm43n.tif

hydraulic-run:
	docker run --rm --platform linux/amd64 -v "$(CURDIR)/$(HYDRAULIC_MODELS)/copernicus:/data" $(SFINCS_IMAGE)
	docker run --rm --platform linux/amd64 -v "$(CURDIR)/$(HYDRAULIC_MODELS)/fabdem:/data" $(SFINCS_IMAGE)
	docker run --rm --platform linux/amd64 -v "$(CURDIR)/$(HYDRAULIC_MODELS)/srtm:/data" $(SFINCS_IMAGE)

hydraulic-gulberg-build-local:
	.venv/bin/python -m naqsha.hydraulic_model --output $(GULBERG_HYDRAULIC_MODELS) --surface copernicus=artifacts/terrain-ensemble/copernicus/terrain-utm43n.tif --surface fabdem=artifacts/terrain-ensemble/fabdem/terrain-utm43n.tif --surface srtm=artifacts/terrain-ensemble/srtm/terrain-utm43n.tif

hydraulic-gulberg-run:
	docker run --rm --platform linux/amd64 -v "$(CURDIR)/$(GULBERG_HYDRAULIC_MODELS)/copernicus:/data" $(SFINCS_IMAGE)
	docker run --rm --platform linux/amd64 -v "$(CURDIR)/$(GULBERG_HYDRAULIC_MODELS)/fabdem:/data" $(SFINCS_IMAGE)
	docker run --rm --platform linux/amd64 -v "$(CURDIR)/$(GULBERG_HYDRAULIC_MODELS)/srtm:/data" $(SFINCS_IMAGE)

hydraulic-gulberg-results-local:
	.venv/bin/python -m naqsha.hydraulic_results --models $(GULBERG_HYDRAULIC_MODELS) --output $(GULBERG_HYDRAULIC_RESULTS)

hydraulic-results:
	$(COMPOSE) run --rm terrain-audit python -m naqsha.hydraulic_results --models $(HYDRAULIC_MODELS) --output $(HYDRAULIC_RESULTS)

urban-context-install:
	.venv/bin/pip install -e '.[dev,context]'

urban-context-download:
	mkdir -p $(URBAN_RAW)
	.venv/bin/overturemaps download --bbox=74.305,31.535,74.345,31.575 -f geojson --type=building -o $(URBAN_RAW)/buildings.geojson
	$(MAKE) osm-context-central-download

osm-context-central-download:
	.venv/bin/python -m naqsha.osm_context --bbox 74.305,31.535,74.345,31.575 --output $(URBAN_RAW)/osm-context.json

urban-context-gulberg-download:
	mkdir -p $(GULBERG_URBAN_RAW)
	.venv/bin/overturemaps download --bbox=74.329,31.493,74.371,31.535 -f geojson --type=building -o $(GULBERG_URBAN_RAW)/buildings.geojson
	$(MAKE) osm-context-gulberg-download

osm-context-gulberg-download:
	.venv/bin/python -m naqsha.osm_context --bbox 74.329,31.493,74.371,31.535 --output $(GULBERG_URBAN_RAW)/osm-context.json

urban-context-export-local:
	.venv/bin/python -m naqsha.urban_context --buildings $(URBAN_RAW)/buildings.geojson --osm $(URBAN_RAW)/osm-context.json --scenario $(WEB_SCENARIO)/scenario.json --output $(URBAN_CONTEXT)

urban-context-gulberg-export-local:
	.venv/bin/python -m naqsha.urban_context --buildings $(GULBERG_URBAN_RAW)/buildings.geojson --osm $(GULBERG_URBAN_RAW)/osm-context.json --scenario $(GULBERG_WEB_SCENARIO)/scenario.json --output $(GULBERG_URBAN_CONTEXT)

road-impact-local:
	.venv/bin/python -m naqsha.road_impact --scenario $(WEB_SCENARIO) --context $(URBAN_CONTEXT)

road-impact-gulberg-local:
	.venv/bin/python -m naqsha.road_impact --scenario $(GULBERG_WEB_SCENARIO) --context $(GULBERG_URBAN_CONTEXT)

web-export:
	$(COMPOSE) run --rm terrain-audit python -m naqsha.web_export --models $(HYDRAULIC_MODELS) --results $(HYDRAULIC_RESULTS) --output $(WEB_SCENARIO)

web-export-local:
	.venv/bin/python -m naqsha.web_export --models $(HYDRAULIC_MODELS) --results $(HYDRAULIC_RESULTS) --output $(WEB_SCENARIO)

web-export-gulberg-local:
	.venv/bin/python -m naqsha.web_export --models $(GULBERG_HYDRAULIC_MODELS) --results $(GULBERG_HYDRAULIC_RESULTS) --output $(GULBERG_WEB_SCENARIO) --location "Gulberg–Liberty — provisional expansion area"

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
