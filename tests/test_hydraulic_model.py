from pathlib import Path

import numpy as np

from naqsha.hydraulic_model import (
    HydraulicScenario,
    outflow_mask,
    precipitation_series,
    validate_scenario,
    write_ascii_grid,
)


def test_outflow_mask_marks_active_aoi_edge_only():
    valid = np.zeros((5, 5), dtype=bool)
    valid[1:4, 1:4] = True
    mask = outflow_mask(valid)
    assert mask[2, 2] == 1
    assert np.sum(mask == 3) == 8
    assert np.sum(mask == 0) == 16


def test_precipitation_series_preserves_requested_total():
    scenario = HydraulicScenario(100, 120, 120, 5)
    series = precipitation_series(scenario)
    assert series == [(0, 50), (7200, 50), (7201, 0), (14400, 0)]
    assert scenario.rainfall_rate_mm_per_hour * 2 == 100


def test_ascii_grid_starts_at_southern_row(tmp_path: Path):
    values = np.array([[1, 2], [3, 4]])
    output = tmp_path / "grid.asc"
    write_ascii_grid(output, values, integer=True)
    assert output.read_text().splitlines() == ["3 4", "1 2"]


def test_forecast_rate_series_replaces_synthetic_block():
    series = ((0, 2.0), (3599, 2.0), (3600, 0.0))
    scenario = HydraulicScenario(
        2,
        60,
        120,
        5,
        rainfall_rate_series_mm_per_hour=series,
        start_time_utc="2026-08-26T00:00:00Z",
    )
    validate_scenario(scenario)
    assert precipitation_series(scenario) == list(series)


def test_zero_rain_is_only_valid_for_an_explicit_forecast():
    with np.testing.assert_raises(ValueError):
        validate_scenario(HydraulicScenario(0, 60, 120, 5))
    validate_scenario(
        HydraulicScenario(
            0,
            60,
            120,
            5,
            rainfall_rate_series_mm_per_hour=((0, 0), (3600, 0)),
        )
    )
