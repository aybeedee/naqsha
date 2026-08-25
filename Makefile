COMPOSE := $(shell docker compose version >/dev/null 2>&1 && echo "docker compose" || echo "docker-compose")

.PHONY: build audit compare ensemble central-ensemble elevation-control forecast-central-local hydraulic-build hydraulic-run hydraulic-results road-impact-local urban-context-install urban-context-download urban-context-export-local web-export web-export-local web-install web-dev web-test web-build test audit-local compare-local ensemble-local central-ensemble-local elevation-control-local hydraulic-build-local hydraulic-results-local test-local lint-local

HYDRAULIC_MODELS := artifacts/hydraulic-ensemble/rain100mm-2h-loss5
HYDRAULIC_RESULTS := artifacts/hydraulic-results/rain100mm-2h-loss5
SFINCS_IMAGE := deltares/sfincs-cpu:sfincs-v2.4.0-Galibier-Release
WEB_SCENARIO := web/public/scenarios/rain100mm-2h-loss5
URBAN_RAW := data/raw/urban-context
URBAN_CONTEXT := web/public/context/central-lahore
FORECAST_ARCHIVE := artifacts/forecasts/central-lahore-latest.json

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

hydraulic-build:
	$(COMPOSE) run --rm terrain-audit python -m naqsha.hydraulic_model --output $(HYDRAULIC_MODELS) --surface copernicus=artifacts/central-lahore-terrain-ensemble/copernicus/terrain-utm43n.tif --surface fabdem=artifacts/central-lahore-terrain-ensemble/fabdem/terrain-utm43n.tif --surface srtm=artifacts/central-lahore-terrain-ensemble/srtm/terrain-utm43n.tif

hydraulic-run:
	docker run --rm --platform linux/amd64 -v "$(CURDIR)/$(HYDRAULIC_MODELS)/copernicus:/data" $(SFINCS_IMAGE)
	docker run --rm --platform linux/amd64 -v "$(CURDIR)/$(HYDRAULIC_MODELS)/fabdem:/data" $(SFINCS_IMAGE)
	docker run --rm --platform linux/amd64 -v "$(CURDIR)/$(HYDRAULIC_MODELS)/srtm:/data" $(SFINCS_IMAGE)

hydraulic-results:
	$(COMPOSE) run --rm terrain-audit python -m naqsha.hydraulic_results --models $(HYDRAULIC_MODELS) --output $(HYDRAULIC_RESULTS)

urban-context-install:
	.venv/bin/pip install -e '.[dev,context]'

urban-context-download:
	mkdir -p $(URBAN_RAW)
	.venv/bin/overturemaps download --bbox=74.305,31.535,74.345,31.575 -f geojson --type=building -o $(URBAN_RAW)/buildings.geojson
	curl --fail --silent --show-error --request POST --data-urlencode 'data=[out:json][timeout:180];(way[highway](31.535,74.305,31.575,74.345);way[railway](31.535,74.305,31.575,74.345);way[waterway](31.535,74.305,31.575,74.345);way[natural=water](31.535,74.305,31.575,74.345);way[leisure=park](31.535,74.305,31.575,74.345);node[name](31.535,74.305,31.575,74.345););out geom;' https://overpass-api.de/api/interpreter --output $(URBAN_RAW)/osm-context.json

urban-context-export-local:
	.venv/bin/python -m naqsha.urban_context --buildings $(URBAN_RAW)/buildings.geojson --osm $(URBAN_RAW)/osm-context.json --scenario $(WEB_SCENARIO)/scenario.json --output $(URBAN_CONTEXT)

road-impact-local:
	.venv/bin/python -m naqsha.road_impact --scenario $(WEB_SCENARIO) --context $(URBAN_CONTEXT)

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
