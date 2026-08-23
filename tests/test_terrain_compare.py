import numpy as np
import pytest

from naqsha.terrain_compare import compare_surfaces, fabdem_url_for_bounds


def test_fabdem_url_for_lahore():
    url = fabdem_url_for_bounds((74.329, 31.493, 74.371, 31.535))
    assert url.endswith(
        "/N30E070-N40E080_FABDEM_V1-2/N31E074_FABDEM_V1-2.tif"
    )


def test_compare_identical_surfaces():
    surface = np.add.outer(np.arange(4, dtype="float32"), np.arange(4, dtype="float32"))
    metrics = compare_surfaces(surface, surface.copy(), 30)
    assert metrics.rmse_m == pytest.approx(0)
    assert metrics.elevation_correlation == pytest.approx(1)
    assert metrics.flow_direction_difference_median_deg == pytest.approx(0)
