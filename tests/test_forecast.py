from datetime import UTC, datetime
from pathlib import Path

import pytest

from naqsha.forecast import (
    archive_forecast,
    hourly_depths_to_rate_series,
    parse_ensemble_response,
    representative_profiles,
)


def _response() -> dict:
    return {
        "latitude": 31.5,
        "longitude": 74.25,
        "elevation": 219,
        "hourly": {
            "time": ["2026-08-26T00:00", "2026-08-26T01:00"],
            "precipitation": [0, 1],
            "precipitation_member01": [1, 2],
            "precipitation_member02": [2, 4],
            "precipitation_member03": [5, 5],
        },
    }


def test_hourly_depths_become_piecewise_constant_rates():
    assert hourly_depths_to_rate_series([2, 5]) == [
        (0, 2),
        (3599, 2),
        (3600, 5),
        (7199, 5),
        (7200, 0),
    ]


def test_representative_profiles_preserve_real_member_trajectories():
    _, members = parse_ensemble_response(_response())
    profiles = representative_profiles(members)
    assert [profile.id for profile in profiles] == ["p10", "p50", "p90"]
    assert all(profile.hourly_mm in members.values() for profile in profiles)
    assert profiles[0].total_mm <= profiles[1].total_mm <= profiles[2].total_mm


def test_archive_forecast_retains_provenance(tmp_path: Path):
    output = tmp_path / "forecast.json"
    result = archive_forecast(
        _response(),
        output,
        31.55,
        74.34,
        "test-model",
        "https://example.test/forecast",
        datetime(2026, 8, 26, tzinfo=UTC),
    )
    assert result["memberCount"] == 4
    assert result["validFromUtc"] == "2026-08-26T00:00:00Z"
    assert result["retrievedAtUtc"] == "2026-08-26T00:00:00Z"
    assert output.exists()


def test_parse_rejects_deterministic_only_response():
    with pytest.raises(ValueError, match="ensemble"):
        parse_ensemble_response(
            {"hourly": {"time": ["2026-01-01T00:00"], "precipitation": [1]}}
        )
