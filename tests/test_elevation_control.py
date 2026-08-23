from pathlib import Path

import numpy as np
import pytest

from naqsha.elevation_control import atl08_url, centered_comparison, read_atl08


def test_atl08_url_contains_lahore_pass_parameters():
    url = atl08_url((74.305, 31.535, 74.345, 31.575), "2025-08-28", 1133)
    assert "/icesat2/atl08?" in url
    assert "trackId=1133" in url
    assert "date=2025-08-28" in url


def test_read_atl08_strips_openaltimetry_headers_and_fill_values(tmp_path: Path):
    source = tmp_path / "atl08.csv"
    source.write_text(
        "segment_id_beg, segment_id_end, longitude, latitude, h_te_best_fit, "
        "h_te_uncertainty, beam\n"
        "1,2,74.32,31.55,166.4,0.8,gt1r\n"
        "3,4,74.33,31.56,3.4028234663852886E38,3.4028234663852886E38,gt1l\n"
    )
    points = read_atl08(source)
    assert len(points) == 1
    assert points[0].beam == "gt1r"
    assert points[0].reported_uncertainty_m == pytest.approx(0.8)


def test_centered_comparison_removes_vertical_datum_offset():
    control = np.array([150.0, 151.0, 152.0, 153.0])
    surface = np.array([200.0, 201.0, 202.0, 203.0])
    metrics = centered_comparison(control, surface)
    assert metrics.median_vertical_offset_m == pytest.approx(-50)
    assert metrics.centered_root_mean_square_error_m == pytest.approx(0)
    assert metrics.elevation_correlation == pytest.approx(1)
