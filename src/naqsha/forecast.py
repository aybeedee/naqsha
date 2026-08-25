"""Archive ensemble rainfall forecasts as reproducible hydraulic forcing profiles."""

from __future__ import annotations

import argparse
import json
import urllib.parse
import urllib.request
from dataclasses import asdict, dataclass
from datetime import UTC, datetime
from pathlib import Path
from typing import Any

import numpy as np

OPEN_METEO_ENSEMBLE_URL = "https://ensemble-api.open-meteo.com/v1/ensemble"


@dataclass(frozen=True)
class ForecastProfile:
    id: str
    quantile: float
    source_member: str
    total_mm: float
    hourly_mm: list[float]
    rate_series_mm_per_hour: list[tuple[int, float]]


def hourly_depths_to_rate_series(hourly_mm: list[float]) -> list[tuple[int, float]]:
    """Convert preceding-hour depths into a piecewise-constant SFINCS rate series."""
    if not hourly_mm:
        raise ValueError("Forecast contains no hourly precipitation")
    if any(value < 0 or not np.isfinite(value) for value in hourly_mm):
        raise ValueError("Hourly precipitation must be finite and non-negative")
    series: list[tuple[int, float]] = []
    for hour, depth_mm in enumerate(hourly_mm):
        start = hour * 3600
        series.extend(((start, float(depth_mm)), (start + 3599, float(depth_mm))))
    series.append((len(hourly_mm) * 3600, 0.0))
    return series


def parse_ensemble_response(payload: dict[str, Any]) -> tuple[list[str], dict[str, list[float]]]:
    hourly = payload.get("hourly") or {}
    times = hourly.get("time")
    if not isinstance(times, list) or not times:
        raise ValueError("Forecast response contains no hourly times")
    members = {
        key: [float(value) for value in values]
        for key, values in hourly.items()
        if key == "precipitation" or key.startswith("precipitation_member")
    }
    if len(members) < 2:
        raise ValueError("Forecast response does not contain an ensemble")
    if any(len(values) != len(times) for values in members.values()):
        raise ValueError("Forecast member length does not match hourly times")
    return [str(value) for value in times], members


def representative_profiles(
    members: dict[str, list[float]], quantiles: tuple[float, ...] = (0.1, 0.5, 0.9)
) -> list[ForecastProfile]:
    """Select real ensemble trajectories nearest requested total-rain quantiles."""
    names = list(members)
    totals = np.asarray([sum(members[name]) for name in names], dtype="float64")
    profiles: list[ForecastProfile] = []
    for quantile in quantiles:
        if not 0 <= quantile <= 1:
            raise ValueError("Forecast quantiles must be within [0, 1]")
        target = float(np.quantile(totals, quantile))
        index = int(np.argmin(np.abs(totals - target)))
        hourly = members[names[index]]
        profiles.append(
            ForecastProfile(
                id=f"p{round(quantile * 100):02d}",
                quantile=quantile,
                source_member=names[index],
                total_mm=float(totals[index]),
                hourly_mm=hourly,
                rate_series_mm_per_hour=hourly_depths_to_rate_series(hourly),
            )
        )
    return profiles


def request_ensemble(
    latitude: float,
    longitude: float,
    forecast_hours: int,
    model: str,
    timeout_seconds: int = 60,
) -> tuple[dict[str, Any], str]:
    if not -90 <= latitude <= 90 or not -180 <= longitude <= 180:
        raise ValueError("Invalid forecast coordinate")
    if not 1 <= forecast_hours <= 360:
        raise ValueError("Forecast horizon must be between 1 and 360 hours")
    query = urllib.parse.urlencode(
        {
            "latitude": latitude,
            "longitude": longitude,
            "hourly": "precipitation",
            "models": model,
            "forecast_hours": forecast_hours,
            "timezone": "UTC",
        }
    )
    url = f"{OPEN_METEO_ENSEMBLE_URL}?{query}"
    request = urllib.request.Request(url, headers={"User-Agent": "naqsha-forecast/0.1"})
    with urllib.request.urlopen(request, timeout=timeout_seconds) as response:
        return json.load(response), url


def archive_forecast(
    payload: dict[str, Any],
    output_path: Path,
    requested_latitude: float,
    requested_longitude: float,
    model: str,
    request_url: str,
    retrieved_at: datetime | None = None,
) -> dict[str, Any]:
    times, members = parse_ensemble_response(payload)
    profiles = representative_profiles(members)
    retrieved = retrieved_at or datetime.now(UTC)
    result = {
        "schemaVersion": 1,
        "provider": "Open-Meteo",
        "product": "Ensemble API",
        "model": model,
        "requestUrl": request_url,
        "requestedLocation": {
            "latitude": requested_latitude,
            "longitude": requested_longitude,
        },
        "modelGridLocation": {
            "latitude": payload.get("latitude"),
            "longitude": payload.get("longitude"),
            "elevationMetres": payload.get("elevation"),
        },
        "retrievedAtUtc": retrieved.isoformat().replace("+00:00", "Z"),
        "validFromUtc": f"{times[0]}:00Z",
        "validThroughUtc": f"{times[-1]}:00Z",
        "intervalSeconds": 3600,
        "memberCount": len(members),
        "profiles": [asdict(profile) for profile in profiles],
        "allMemberTotalsMm": {
            "minimum": min(sum(values) for values in members.values()),
            "median": float(np.median([sum(values) for values in members.values()])),
            "maximum": max(sum(values) for values in members.values()),
        },
        "warning": (
            "Global numerical-weather-model precipitation does not resolve neighbourhood-scale "
            "Lahore convection. Profiles are uncertainty scenarios, not deterministic rainfall."
        ),
    }
    output_path.parent.mkdir(parents=True, exist_ok=True)
    output_path.write_text(json.dumps(result, indent=2) + "\n")
    return result


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--latitude", type=float, required=True)
    parser.add_argument("--longitude", type=float, required=True)
    parser.add_argument("--forecast-hours", type=int, default=72)
    parser.add_argument("--model", default="ecmwf_ifs025")
    parser.add_argument("--output", type=Path, required=True)
    parser.add_argument("--input", type=Path, help="Parse a saved API response instead of fetching")
    return parser.parse_args()


def main() -> None:
    args = parse_args()
    if args.input:
        payload = json.loads(args.input.read_text())
        request_url = f"saved:{args.input}"
    else:
        payload, request_url = request_ensemble(
            args.latitude, args.longitude, args.forecast_hours, args.model
        )
    result = archive_forecast(
        payload,
        args.output,
        args.latitude,
        args.longitude,
        args.model,
        request_url,
    )
    print(
        json.dumps(
            {
                "output": str(args.output),
                "provider": result["provider"],
                "model": result["model"],
                "retrievedAtUtc": result["retrievedAtUtc"],
                "validFromUtc": result["validFromUtc"],
                "validThroughUtc": result["validThroughUtc"],
                "memberCount": result["memberCount"],
                "profileTotalsMm": {
                    profile["id"]: profile["total_mm"] for profile in result["profiles"]
                },
                "allMemberTotalsMm": result["allMemberTotalsMm"],
            },
            indent=2,
        )
    )


if __name__ == "__main__":
    main()
