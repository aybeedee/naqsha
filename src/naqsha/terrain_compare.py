"""Compare Copernicus GLO-30 with its FABDEM bare-earth derivative."""

from __future__ import annotations

import argparse
import json
import math
from dataclasses import asdict, dataclass
from pathlib import Path

import numpy as np
import rasterio
from rasterio.warp import Resampling, reproject

from naqsha.terrain import audit, read_aoi

FABDEM_BASE = "https://huggingface.co/buckets/links-ads/fabdem/resolve/tiles"


@dataclass(frozen=True)
class ComparisonMetrics:
    valid_cell_count: int
    mean_fabdem_minus_copernicus_m: float
    median_fabdem_minus_copernicus_m: float
    rmse_m: float
    absolute_difference_p95_m: float
    absolute_difference_max_m: float
    elevation_correlation: float
    flow_direction_difference_median_deg: float
    flow_direction_difference_p95_deg: float
    flow_direction_difference_over_45_percent: float


def _coordinate_token(value: int, positive: str, negative: str, width: int) -> str:
    return f"{positive if value >= 0 else negative}{abs(value):0{width}d}"


def fabdem_url_for_bounds(bounds: tuple[float, float, float, float]) -> str:
    minx, miny, maxx, maxy = bounds
    lon = math.floor(minx)
    lat = math.floor(miny)
    if math.floor(maxx) != lon or math.floor(maxy) != lat:
        raise ValueError("Multi-tile AOIs are not supported by the comparison milestone")

    group_lon = math.floor(lon / 10) * 10
    group_lat = math.floor(lat / 10) * 10
    lower = _coordinate_token(group_lat, "N", "S", 2) + _coordinate_token(
        group_lon, "E", "W", 3
    )
    upper = _coordinate_token(group_lat + 10, "N", "S", 2) + _coordinate_token(
        group_lon + 10, "E", "W", 3
    )
    tile = _coordinate_token(lat, "N", "S", 2) + _coordinate_token(lon, "E", "W", 3)
    group_name = f"{lower}-{upper}_FABDEM_V1-2"
    tile_name = f"{tile}_FABDEM_V1-2.tif"
    return f"{FABDEM_BASE}/{group_name}/{tile_name}"


def _direction_degrees(elevation: np.ndarray, cell_size: float) -> tuple[np.ndarray, np.ndarray]:
    valid = np.isfinite(elevation)
    filled = np.where(valid, elevation, np.nanmedian(elevation[valid]))
    dy, dx = np.gradient(filled, cell_size, cell_size)
    magnitude = np.hypot(dx, dy)
    return np.arctan2(-dy, -dx), magnitude


def compare_surfaces(
    copernicus: np.ndarray, fabdem: np.ndarray, cell_size: float
) -> ComparisonMetrics:
    valid = np.isfinite(copernicus) & np.isfinite(fabdem)
    if not np.any(valid):
        raise ValueError("Terrain surfaces contain no overlapping valid cells")
    difference = fabdem[valid] - copernicus[valid]
    direction_a, magnitude_a = _direction_degrees(copernicus, cell_size)
    direction_b, magnitude_b = _direction_degrees(fabdem, cell_size)
    directional_valid = valid & (magnitude_a > 0.001) & (magnitude_b > 0.001)
    angular = np.abs(
        np.arctan2(
            np.sin(direction_a[directional_valid] - direction_b[directional_valid]),
            np.cos(direction_a[directional_valid] - direction_b[directional_valid]),
        )
    )
    angular_deg = np.rad2deg(angular)
    return ComparisonMetrics(
        valid_cell_count=int(np.sum(valid)),
        mean_fabdem_minus_copernicus_m=float(np.mean(difference)),
        median_fabdem_minus_copernicus_m=float(np.median(difference)),
        rmse_m=float(np.sqrt(np.mean(np.square(difference)))),
        absolute_difference_p95_m=float(np.percentile(np.abs(difference), 95)),
        absolute_difference_max_m=float(np.max(np.abs(difference))),
        elevation_correlation=float(np.corrcoef(copernicus[valid], fabdem[valid])[0, 1]),
        flow_direction_difference_median_deg=float(np.median(angular_deg)),
        flow_direction_difference_p95_deg=float(np.percentile(angular_deg, 95)),
        flow_direction_difference_over_45_percent=float(np.mean(angular_deg > 45) * 100),
    )


def _aligned_candidate(reference_path: Path, candidate_path: Path):
    with rasterio.open(reference_path) as reference:
        ref = reference.read(1, masked=True).filled(np.nan).astype("float32")
        profile = reference.profile
    with rasterio.open(candidate_path) as candidate:
        aligned = np.full(ref.shape, np.nan, dtype="float32")
        reproject(
            source=candidate.read(1),
            destination=aligned,
            src_transform=candidate.transform,
            src_crs=candidate.crs,
            src_nodata=candidate.nodata,
            dst_transform=profile["transform"],
            dst_crs=profile["crs"],
            dst_nodata=np.nan,
            resampling=Resampling.bilinear,
        )
    return ref, aligned, profile


def _write_difference(path: Path, difference: np.ndarray, profile: dict) -> None:
    output_profile = profile.copy()
    output_profile.update(dtype="float32", nodata=-9999.0)
    with rasterio.open(path, "w", **output_profile) as target:
        target.write(np.where(np.isfinite(difference), difference, -9999).astype("float32"), 1)
        target.update_tags(
            quantity="FABDEM minus Copernicus elevation",
            units="metres",
            warning="This is model sensitivity, not surveyed error.",
        )


def _write_report(path: Path, metrics: ComparisonMetrics, fabdem_url: str) -> None:
    path.write_text(
        "\n".join(
            [
                "# Terrain conditioning comparison",
                "",
                (
                    "FABDEM is derived from Copernicus GLO-30 by removing estimated building and "
                    "forest biases. This comparison measures conditioning sensitivity; the products "
                    "are not independent surveys."
                ),
                "",
                "## Metrics",
                "",
                f"- Mean FABDEM − Copernicus: {metrics.mean_fabdem_minus_copernicus_m:.2f} m",
                f"- Median FABDEM − Copernicus: {metrics.median_fabdem_minus_copernicus_m:.2f} m",
                f"- Elevation RMSE: {metrics.rmse_m:.2f} m",
                f"- 95th-percentile absolute difference: {metrics.absolute_difference_p95_m:.2f} m",
                f"- Elevation correlation: {metrics.elevation_correlation:.3f}",
                (
                    "- Median derived flow-direction difference: "
                    f"{metrics.flow_direction_difference_median_deg:.1f}°"
                ),
                (
                    "- Cells with derived flow-direction difference >45°: "
                    f"{metrics.flow_direction_difference_over_45_percent:.1f}%"
                ),
                "",
                "## Decision rule",
                "",
                (
                    "If conditioning changes a large share of derived flow directions, neither "
                    "surface may be treated as street-level truth. Hydraulic hotspot rankings must "
                    "be tested across both surfaces and a separate SRTM-family source."
                ),
                "",
                "## Licence",
                "",
                (
                    "FABDEM v1.2 is non-commercial-use data. It is included only as an evaluation "
                    "source unless the eventual deployment has compatible terms or obtains another "
                    "licence."
                ),
                "",
                f"FABDEM source: `{fabdem_url}`",
                "",
            ]
        )
    )


def run_comparison(aoi_path: Path, output_dir: Path) -> ComparisonMetrics:
    _, geometry = read_aoi(aoi_path)
    fabdem_url = fabdem_url_for_bounds(geometry.bounds)
    copernicus_dir = output_dir / "copernicus"
    fabdem_dir = output_dir / "fabdem"
    audit(aoi_path, copernicus_dir)
    audit(
        aoi_path,
        fabdem_dir,
        fabdem_url,
        source_name="FABDEM v1.2",
        source_license="Non-Commercial Government Licence v2.0",
    )
    reference, candidate, profile = _aligned_candidate(
        copernicus_dir / "terrain-utm43n.tif", fabdem_dir / "terrain-utm43n.tif"
    )
    metrics = compare_surfaces(reference, candidate, abs(float(profile["transform"].a)))
    output_dir.mkdir(parents=True, exist_ok=True)
    _write_difference(output_dir / "fabdem-minus-copernicus.tif", candidate - reference, profile)
    (output_dir / "metrics.json").write_text(json.dumps(asdict(metrics), indent=2) + "\n")
    _write_report(output_dir / "report.md", metrics, fabdem_url)
    return metrics


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--aoi", type=Path, required=True)
    parser.add_argument("--output", type=Path, required=True)
    return parser.parse_args()


def main() -> None:
    args = parse_args()
    print(json.dumps(asdict(run_comparison(args.aoi, args.output)), indent=2))


if __name__ == "__main__":
    main()
