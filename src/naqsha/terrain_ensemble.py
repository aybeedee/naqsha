"""Measure broad terrain-screening stability across three open surfaces."""

from __future__ import annotations

import argparse
import json
import math
from dataclasses import asdict, dataclass
from pathlib import Path

import numpy as np
import rasterio

from naqsha.terrain import audit, read_aoi
from naqsha.terrain_compare import (
    _aligned_candidate,
    compare_surfaces,
    fabdem_url_for_bounds,
)

SRTM_BASE = "https://elevation-tiles-prod.s3.amazonaws.com/skadi"


@dataclass(frozen=True)
class EnsembleMetrics:
    valid_cell_count: int
    terrain_range_median_m: float
    terrain_range_p95_m: float
    copernicus_fabdem_hotspot_jaccard: float
    copernicus_srtm_hotspot_jaccard: float
    fabdem_srtm_hotspot_jaccard: float
    three_way_hotspot_jaccard: float
    copernicus_fabdem_depression_rank_correlation: float
    copernicus_srtm_depression_rank_correlation: float
    fabdem_srtm_depression_rank_correlation: float
    copernicus_srtm_flow_difference_over_45_percent: float
    fabdem_srtm_flow_difference_over_45_percent: float


def _coordinate_token(value: int, positive: str, negative: str, width: int) -> str:
    return f"{positive if value >= 0 else negative}{abs(value):0{width}d}"


def srtm_url_for_bounds(bounds: tuple[float, float, float, float]) -> str:
    minx, miny, maxx, maxy = bounds
    lon = math.floor(minx)
    lat = math.floor(miny)
    if math.floor(maxx) != lon or math.floor(maxy) != lat:
        raise ValueError("Multi-tile AOIs are not supported by the ensemble milestone")
    lat_token = _coordinate_token(lat, "N", "S", 2)
    tile = lat_token + _coordinate_token(lon, "E", "W", 3)
    url = f"{SRTM_BASE}/{lat_token}/{tile}.hgt.gz"
    return f"/vsigzip//vsicurl/{url}"


def local_depression_score(elevation: np.ndarray, radius_cells: int = 5) -> np.ndarray:
    """Return local-mean elevation minus cell elevation over a broad window."""
    if radius_cells < 1:
        raise ValueError("radius_cells must be positive")
    valid = np.isfinite(elevation)
    filled = np.where(valid, elevation, np.nanmedian(elevation[valid])).astype("float64")
    window = radius_cells * 2 + 1
    padded = np.pad(filled, radius_cells, mode="reflect")
    integral = np.pad(padded, ((1, 0), (1, 0)), mode="constant").cumsum(0).cumsum(1)
    window_sum = (
        integral[window:, window:]
        - integral[:-window, window:]
        - integral[window:, :-window]
        + integral[:-window, :-window]
    )
    score = window_sum / (window * window) - filled
    score[~valid] = np.nan
    return score.astype("float32")


def _top_mask(score: np.ndarray, valid: np.ndarray, fraction: float = 0.1) -> np.ndarray:
    threshold = np.percentile(score[valid], (1 - fraction) * 100)
    return valid & (score >= threshold)


def _jaccard(a: np.ndarray, b: np.ndarray) -> float:
    union = np.sum(a | b)
    return float(np.sum(a & b) / union) if union else 1.0


def _rank_correlation(a: np.ndarray, b: np.ndarray, valid: np.ndarray) -> float:
    def ranks(values: np.ndarray) -> np.ndarray:
        order = np.argsort(values, kind="stable")
        result = np.empty(order.size, dtype="float64")
        result[order] = np.arange(order.size)
        return result

    return float(np.corrcoef(ranks(a[valid]), ranks(b[valid]))[0, 1])


def ensemble_statistics(
    copernicus: np.ndarray, fabdem: np.ndarray, srtm: np.ndarray, cell_size: float
) -> tuple[EnsembleMetrics, np.ndarray]:
    valid = np.isfinite(copernicus) & np.isfinite(fabdem) & np.isfinite(srtm)
    if not np.any(valid):
        raise ValueError("Terrain surfaces contain no common valid cells")
    stack = np.stack([copernicus, fabdem, srtm])
    terrain_range = np.max(stack, axis=0) - np.min(stack, axis=0)
    terrain_range[~valid] = np.nan

    scores = [local_depression_score(surface) for surface in stack]
    masks = [_top_mask(score, valid) for score in scores]
    all_intersection = masks[0] & masks[1] & masks[2]
    all_union = masks[0] | masks[1] | masks[2]
    cop_fab = compare_surfaces(copernicus, fabdem, cell_size)
    cop_srtm = compare_surfaces(copernicus, srtm, cell_size)
    fab_srtm = compare_surfaces(fabdem, srtm, cell_size)

    metrics = EnsembleMetrics(
        valid_cell_count=int(np.sum(valid)),
        terrain_range_median_m=float(np.median(terrain_range[valid])),
        terrain_range_p95_m=float(np.percentile(terrain_range[valid], 95)),
        copernicus_fabdem_hotspot_jaccard=_jaccard(masks[0], masks[1]),
        copernicus_srtm_hotspot_jaccard=_jaccard(masks[0], masks[2]),
        fabdem_srtm_hotspot_jaccard=_jaccard(masks[1], masks[2]),
        three_way_hotspot_jaccard=(
            float(np.sum(all_intersection) / np.sum(all_union)) if np.any(all_union) else 1.0
        ),
        copernicus_fabdem_depression_rank_correlation=_rank_correlation(
            scores[0], scores[1], valid
        ),
        copernicus_srtm_depression_rank_correlation=_rank_correlation(
            scores[0], scores[2], valid
        ),
        fabdem_srtm_depression_rank_correlation=_rank_correlation(scores[1], scores[2], valid),
        copernicus_srtm_flow_difference_over_45_percent=(
            cop_srtm.flow_direction_difference_over_45_percent
        ),
        fabdem_srtm_flow_difference_over_45_percent=(
            fab_srtm.flow_direction_difference_over_45_percent
        ),
    )
    # Ensure the conditioning comparison is evaluated even though its metrics
    # are already versioned separately.
    if not np.isfinite(cop_fab.elevation_correlation):
        raise ValueError("Copernicus/FABDEM comparison is degenerate")
    return metrics, terrain_range


def _write_range(path: Path, values: np.ndarray, profile: dict) -> None:
    output_profile = profile.copy()
    output_profile.update(dtype="float32", nodata=-9999.0)
    with rasterio.open(path, "w", **output_profile) as target:
        target.write(np.where(np.isfinite(values), values, -9999).astype("float32"), 1)
        target.update_tags(
            quantity="Maximum elevation range across three terrain surfaces",
            units="metres",
            warning="This is input disagreement, not surveyed vertical error.",
        )


def _write_report(path: Path, metrics: EnsembleMetrics) -> None:
    path.write_text(
        "\n".join(
            [
                "# Three-surface terrain stability gate",
                "",
                (
                    "The top 10% broad local-depression cells are compared across Copernicus GLO-30, "
                    "FABDEM v1.2, and an SRTM-family surface. Jaccard values near 1 indicate stable "
                    "screening hotspots; values near 0 indicate source-controlled results."
                ),
                "",
                "## Metrics",
                "",
                f"- Median three-surface elevation range: {metrics.terrain_range_median_m:.2f} m",
                f"- 95th-percentile elevation range: {metrics.terrain_range_p95_m:.2f} m",
                (
                    "- Copernicus/FABDEM hotspot Jaccard: "
                    f"{metrics.copernicus_fabdem_hotspot_jaccard:.3f}"
                ),
                (
                    "- Copernicus/SRTM hotspot Jaccard: "
                    f"{metrics.copernicus_srtm_hotspot_jaccard:.3f}"
                ),
                f"- FABDEM/SRTM hotspot Jaccard: {metrics.fabdem_srtm_hotspot_jaccard:.3f}",
                f"- Three-way hotspot Jaccard: {metrics.three_way_hotspot_jaccard:.3f}",
                "",
                "## Interpretation",
                "",
                (
                    "This gate tests only broad terrain-screening stability. It does not validate "
                    "flood depth, drainage capacity, infiltration, or historical event performance."
                ),
                "",
            ]
        )
    )


def run_ensemble(aoi_path: Path, output_dir: Path) -> EnsembleMetrics:
    _, geometry = read_aoi(aoi_path)
    cop_dir = output_dir / "copernicus"
    fab_dir = output_dir / "fabdem"
    srtm_dir = output_dir / "srtm"
    audit(aoi_path, cop_dir)
    audit(
        aoi_path,
        fab_dir,
        fabdem_url_for_bounds(geometry.bounds),
        source_name="FABDEM v1.2",
        source_license="Non-Commercial Government Licence v2.0",
    )
    audit(
        aoi_path,
        srtm_dir,
        srtm_url_for_bounds(geometry.bounds),
        source_name="Mapzen SRTM-family HGT",
        source_license="AWS open terrain tiles attribution terms",
    )

    reference_path = cop_dir / "terrain-utm43n.tif"
    copernicus, fabdem, profile = _aligned_candidate(
        reference_path, fab_dir / "terrain-utm43n.tif"
    )
    _, srtm, _ = _aligned_candidate(reference_path, srtm_dir / "terrain-utm43n.tif")
    metrics, terrain_range = ensemble_statistics(
        copernicus, fabdem, srtm, abs(float(profile["transform"].a))
    )
    output_dir.mkdir(parents=True, exist_ok=True)
    _write_range(output_dir / "terrain-range.tif", terrain_range, profile)
    (output_dir / "metrics.json").write_text(json.dumps(asdict(metrics), indent=2) + "\n")
    _write_report(output_dir / "report.md", metrics)
    return metrics


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--aoi", type=Path, required=True)
    parser.add_argument("--output", type=Path, required=True)
    return parser.parse_args()


def main() -> None:
    args = parse_args()
    print(json.dumps(asdict(run_ensemble(args.aoi, args.output)), indent=2))


if __name__ == "__main__":
    main()
