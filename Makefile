COMPOSE := $(shell docker compose version >/dev/null 2>&1 && echo "docker compose" || echo "docker-compose")

.PHONY: build audit compare test audit-local compare-local test-local lint-local

build:
	$(COMPOSE) build terrain-audit

audit:
	$(COMPOSE) run --rm terrain-audit

compare:
	$(COMPOSE) run --rm terrain-audit python -m naqsha.terrain_compare --aoi data/aoi/pilot.geojson --output artifacts/terrain-comparison

test:
	$(COMPOSE) run --rm terrain-audit pytest -q

audit-local:
	.venv/bin/python -m naqsha.terrain --aoi data/aoi/pilot.geojson --output artifacts/terrain

compare-local:
	.venv/bin/python -m naqsha.terrain_compare --aoi data/aoi/pilot.geojson --output artifacts/terrain-comparison

test-local:
	.venv/bin/pytest -q

lint-local:
	.venv/bin/ruff check .
