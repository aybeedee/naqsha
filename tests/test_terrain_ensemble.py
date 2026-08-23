import numpy as np
import pytest

from naqsha.terrain_ensemble import (
    ensemble_statistics,
    local_depression_score,
    srtm_url_for_bounds,
)


def test_srtm_url_for_lahore():
    url = srtm_url_for_bounds((74.329, 31.493, 74.371, 31.535))
    assert url.endswith("/skadi/N31/N31E074.hgt.gz")
    assert url.startswith("/vsigzip//vsicurl/https://")


def test_local_depression_score_finds_bowl_center():
    surface = np.full((11, 11), 10, dtype="float32")
    surface[5, 5] = 0
    score = local_depression_score(surface, radius_cells=2)
    assert np.unravel_index(np.nanargmax(score), score.shape) == (5, 5)


def test_identical_ensemble_is_stable():
    surface = np.add.outer(np.arange(20, dtype="float32"), np.arange(20, dtype="float32"))
    surface[10, 10] -= 5
    metrics, terrain_range = ensemble_statistics(surface, surface.copy(), surface.copy(), 30)
    assert np.nanmax(terrain_range) == pytest.approx(0)
    assert metrics.three_way_hotspot_jaccard == pytest.approx(1)
    assert metrics.copernicus_srtm_depression_rank_correlation == pytest.approx(1)
