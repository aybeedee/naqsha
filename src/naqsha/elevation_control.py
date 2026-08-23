"""Audit sparse ICESat-2 ATL08 ground estimates against local terrain inputs."""

from __future__ import annotations

import argparse
import csv
import json
import math
import urllib.parse
import urllib.request
from dataclasses import asdict, dataclass
from pathlib import Path

import numpy as np
import rasterio
from pyproj import Transformer
from shapely.geometry import Point, mapping

from naqsha.terrain import read_aoi

OPENALTIMETRY_ENDPOINT = (
    "https://openaltimetry.earthdatacloud.nasa.gov/data/api/icesat2/atl08"
)
ATL08_FILL_VALUE = 3.4028234663852886e38


@dataclass(frozen=True)
class ControlPoint:
    longitude: float
    latitude: float
    ellipsoidal_ground_height_m: float
    reported_uncertainty_m: float
    beam: str
    segment_id_beg: int
    segment_id_end: int


@dataclass(frozen=True)
class SurfaceComparison:
    point_count: int
    median_vertical_offset_m: float
    centered_median_absolute_error_m: float
    centered_root_mean_square_error_m: float
    elevation_correlation: float | None
    control_elevation_span_m: float
    surface_elevation_span_m: float


@dataclass(frozen=True)
class ControlAuditMetrics:
    source_product: str
    acquisition_date: str
    reference_ground_track: int
    api_point_count: int
    points_inside_aoi: int
    points_uncertainty_le_1m: int
    points_uncertainty_le_2m: int
    points_uncertainty_le_5m: int
    retained_point_count: int
    retained_beams: list[str]
    maximum_retained_uncertainty_m: float
    validation_gate_passed: bool
    comparisons: dict[str, SurfaceComparison]


def atl08_url(
    bounds: tuple[float, float, float, float], acquisition_date: str, track_id: int
) -> str:
    minx, miny, maxx, maxy = bounds
    query = urllib.parse.urlencode(
        {
            "minx": minx,
            "miny": miny,
            "maxx": maxx,
            "maxy": maxy,
            "trackId": track_id,
            "outputFormat": "csv",
            "date": acquisition_date,
            "client": "portal",
        }
    )
    return f"{OPENALTIMETRY_ENDPOINT}?{query}"


def download_atl08(
    path: Path,
    bounds: tuple[float, float, float, float],
    acquisition_date: str,
    track_id: int,
) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    request = urllib.request.Request(
        atl08_url(bounds, acquisition_date, track_id),
        headers={"User-Agent": "naqsha-terrain-audit/0.1"},
    )
    with urllib.request.urlopen(request, timeout=180) as response:
        path.write_bytes(response.read())


def read_atl08(path: Path) -> list[ControlPoint]:
    points: list[ControlPoint] = []
    with path.open(newline="") as source:
        for raw in csv.DictReader(source):
            row = {key.strip(): value.strip() for key, value in raw.items()}
            height = float(row["h_te_best_fit"])
            uncertainty = float(row["h_te_uncertainty"])
            if not all(map(math.isfinite, (height, uncertainty))):
                continue
            if height >= ATL08_FILL_VALUE / 2 or uncertainty >= ATL08_FILL_VALUE / 2:
                continue
            points.append(
                ControlPoint(
                    longitude=float(row["longitude"]),
                    latitude=float(row["latitude"]),
                    ellipsoidal_ground_height_m=height,
                    reported_uncertainty_m=uncertainty,
                    beam=row["beam"],
                    segment_id_beg=int(row["segment_id_beg"]),
                    segment_id_end=int(row["segment_id_end"]),
                )
            )
    return points


def centered_comparison(control: np.ndarray, surface: np.ndarray) -> SurfaceComparison:
    valid = np.isfinite(control) & np.isfinite(surface)
    if not np.any(valid):
        raise ValueError("No common valid control and terrain elevations")
    control = control[valid].astype("float64")
    surface = surface[valid].astype("float64")
    difference = control - surface
    offset = float(np.median(difference))
    residual = difference - offset
    correlation = float(np.corrcoef(control, surface)[0, 1]) if control.size > 1 else None
    if correlation is not None and not math.isfinite(correlation):
        correlation = None
    return SurfaceComparison(
        point_count=int(control.size),
        median_vertical_offset_m=offset,
        centered_median_absolute_error_m=float(np.median(np.abs(residual))),
        centered_root_mean_square_error_m=float(np.sqrt(np.mean(residual**2))),
        elevation_correlation=correlation,
        control_elevation_span_m=float(np.ptp(control)),
        surface_elevation_span_m=float(np.ptp(surface)),
    )


def sample_surface(path: Path, points: list[ControlPoint]) -> np.ndarray:
    with rasterio.open(path) as dataset:
        transformer = Transformer.from_crs("EPSG:4326", dataset.crs, always_xy=True)
        coordinates = [transformer.transform(point.longitude, point.latitude) for point in points]
        values = np.asarray([sample[0] for sample in dataset.sample(coordinates)], dtype="float64")
        if dataset.nodata is not None:
            values[np.isclose(values, dataset.nodata)] = np.nan
    return values


def _write_points(path: Path, points: list[ControlPoint]) -> None:
    features = []
    for point in points:
        properties = asdict(point)
        properties.pop("longitude")
        properties.pop("latitude")
        features.append(
            {
                "type": "Feature",
                "geometry": mapping(Point(point.longitude, point.latitude)),
                "properties": properties,
            }
        )
    path.write_text(json.dumps({"type": "FeatureCollection", "features": features}, indent=2) + "\n")


def _write_report(path: Path, metrics: ControlAuditMetrics) -> None:
    comparison_lines = []
    for name, comparison in metrics.comparisons.items():
        comparison_lines.append(
            f"- {name}: {comparison.point_count} points; centered median absolute residual "
            f"{comparison.centered_median_absolute_error_m:.2f} m"
        )
    path.write_text(
        "\n".join(
            [
                "# ICESat-2 elevation-control audit",
                "",
                "## Decision",
                "",
                (
                    "The pass is retained as sparse, independent context but fails the local-DTM "
                    "validation gate. It must not be used to calibrate or certify street flood depth."
                ),
                "",
                "## Coverage",
                "",
                f"- Acquisition: {metrics.acquisition_date}, RGT {metrics.reference_ground_track}",
                f"- API points: {metrics.api_point_count}",
                f"- Points inside the AOI: {metrics.points_inside_aoi}",
                f"- Reported uncertainty at most 1 m: {metrics.points_uncertainty_le_1m}",
                f"- Reported uncertainty at most 2 m: {metrics.points_uncertainty_le_2m}",
                f"- Reported uncertainty at most 5 m: {metrics.points_uncertainty_le_5m}",
                f"- Retained beams: {', '.join(metrics.retained_beams)}",
                "",
                "## Centered surface checks",
                "",
                *comparison_lines,
                "",
                "## Guardrails",
                "",
                (
                    "ATL08 reports 100 m land/vegetation segments and was not designed as an urban "
                    "road survey. Roofs, vegetation, and photon classification can contaminate its "
                    "ground estimate. The height is ellipsoidal, while the DEMs use geoid-based "
                    "vertical references, so the comparison removes each surface's median offset."
                ),
                "",
                (
                    "Centered residuals from this one nearly collinear pass are descriptive only. "
                    "They cannot rank the terrain products or establish two-dimensional hydraulic skill."
                ),
                "",
            ]
        )
    )


def run_control_audit(
    aoi_path: Path,
    input_path: Path,
    output_dir: Path,
    surfaces: dict[str, Path],
    acquisition_date: str,
    track_id: int,
    maximum_uncertainty_m: float = 5,
    download: bool = False,
) -> ControlAuditMetrics:
    _, geometry = read_aoi(aoi_path)
    if download:
        download_atl08(input_path, geometry.bounds, acquisition_date, track_id)
    if not input_path.exists():
        raise FileNotFoundError(f"ATL08 input does not exist: {input_path}")

    all_points = read_atl08(input_path)
    inside = [point for point in all_points if geometry.covers(Point(point.longitude, point.latitude))]
    retained = [point for point in inside if point.reported_uncertainty_m <= maximum_uncertainty_m]
    if not retained:
        raise ValueError("No ATL08 points passed the AOI and uncertainty filters")

    control = np.asarray([point.ellipsoidal_ground_height_m for point in retained])
    comparisons = {
        name: centered_comparison(control, sample_surface(path, retained))
        for name, path in surfaces.items()
    }
    # A street-terrain validation set needs distributed two-dimensional coverage,
    # not a handful of 100 m estimates from one satellite line. This numerical
    # threshold is necessary but intentionally not sufficient.
    gate_passed = (
        sum(point.reported_uncertainty_m <= 2 for point in inside) >= 30
        and len({point.beam for point in retained}) >= 3
    )
    metrics = ControlAuditMetrics(
        source_product="NASA ICESat-2 ATL08 land and vegetation height",
        acquisition_date=acquisition_date,
        reference_ground_track=track_id,
        api_point_count=len(all_points),
        points_inside_aoi=len(inside),
        points_uncertainty_le_1m=sum(point.reported_uncertainty_m <= 1 for point in inside),
        points_uncertainty_le_2m=sum(point.reported_uncertainty_m <= 2 for point in inside),
        points_uncertainty_le_5m=sum(point.reported_uncertainty_m <= 5 for point in inside),
        retained_point_count=len(retained),
        retained_beams=sorted({point.beam for point in retained}),
        maximum_retained_uncertainty_m=maximum_uncertainty_m,
        validation_gate_passed=gate_passed,
        comparisons=comparisons,
    )
    output_dir.mkdir(parents=True, exist_ok=True)
    (output_dir / "metrics.json").write_text(json.dumps(asdict(metrics), indent=2) + "\n")
    _write_points(output_dir / "retained-points.geojson", retained)
    _write_report(output_dir / "report.md", metrics)
    return metrics


def _surface_argument(value: str) -> tuple[str, Path]:
    try:
        name, path = value.split("=", 1)
    except ValueError as error:
        raise argparse.ArgumentTypeError("surface must be NAME=PATH") from error
    if not name or not path:
        raise argparse.ArgumentTypeError("surface must be NAME=PATH")
    return name, Path(path)


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--aoi", type=Path, required=True)
    parser.add_argument("--input", type=Path, required=True)
    parser.add_argument("--output", type=Path, required=True)
    parser.add_argument("--date", default="2025-08-28")
    parser.add_argument("--track", type=int, default=1133)
    parser.add_argument("--maximum-uncertainty", type=float, default=5)
    parser.add_argument("--download", action="store_true")
    parser.add_argument("--surface", action="append", type=_surface_argument, default=[])
    return parser.parse_args()


def main() -> None:
    args = parse_args()
    metrics = run_control_audit(
        args.aoi,
        args.input,
        args.output,
        dict(args.surface),
        args.date,
        args.track,
        args.maximum_uncertainty,
        args.download,
    )
    print(json.dumps(asdict(metrics), indent=2))


if __name__ == "__main__":
    main()
