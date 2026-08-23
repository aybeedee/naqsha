COMPOSE := $(shell docker compose version >/dev/null 2>&1 && echo "docker compose" || echo "docker-compose")

.PHONY: build audit compare ensemble test audit-local compare-local ensemble-local test-local lint-local

build:
	$(COMPOSE) build terrain-audit

audit:
	$(COMPOSE) run --rm terrain-audit

compare:
	$(COMPOSE) run --rm terrain-audit python -m naqsha.terrain_compare --aoi data/aoi/pilot.geojson --output artifacts/terrain-comparison

ensemble:
	$(COMPOSE) run --rm terrain-audit python -m naqsha.terrain_ensemble --aoi data/aoi/pilot.geojson --output artifacts/terrain-ensemble

test:
	$(COMPOSE) run --rm terrain-audit pytest -q

audit-local:
	.venv/bin/python -m naqsha.terrain --aoi data/aoi/pilot.geojson --output artifacts/terrain

compare-local:
	.venv/bin/python -m naqsha.terrain_compare --aoi data/aoi/pilot.geojson --output artifacts/terrain-comparison

ensemble-local:
	.venv/bin/python -m naqsha.terrain_ensemble --aoi data/aoi/pilot.geojson --output artifacts/terrain-ensemble

test-local:
	.venv/bin/pytest -q

lint-local:
	.venv/bin/ruff check .
