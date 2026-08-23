FROM python:3.12-slim

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PIP_DISABLE_PIP_VERSION_CHECK=1

WORKDIR /workspace

RUN apt-get update \
    && apt-get install --yes --no-install-recommends libexpat1 \
    && rm -rf /var/lib/apt/lists/*

COPY pyproject.toml README.md ./
COPY src ./src
RUN pip install --no-cache-dir -e '.[dev]'

COPY data ./data
COPY tests ./tests

CMD ["python", "-m", "naqsha.terrain", "--aoi", "data/aoi/pilot.geojson", "--output", "artifacts/terrain"]
