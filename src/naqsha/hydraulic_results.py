"""Post-process SFINCS maximum-depth outputs into an uncertainty ensemble."""

from __future__ import annotations

import argparse
import json
from dataclasses import asdict, dataclass
from pathlib import Path

import numpy as np
import rasterio


@dataclass(frozen=True)
class FloodMemberMetrics:
    analysed_cell_count: int
    flooded_area_over_5cm_km2: float
    flooded_area_over_10cm_km2: float
    flooded_area_over_30cm_km2: float
    maximum_depth_m: float
    wet_cell_depth_p95_m: float
    integrated_maximum_depth_volume_proxy_m3: float


@dataclass(frozen=True)
class FloodEnsembleMetrics:
    member_count: int
    analysed_cell_count: int
    union_flooded_area_over_10cm_km2: float
    intersection_flooded_area_over_10cm_km2: float
    all_member_wet_jaccard: float
    terrain_sensitive_wet_fraction: float
    depth_range_p50_in_union_m: float
    depth_range_p95_in_union_m: float
    members: dict[str, FloodMemberMetrics]


def read_ascii_grid(path: Path, shape: tuple[int, int]) -> np.ndarray:
    values = np.loadtxt(path, dtype="float32")
    if values.shape != shape:
        raise ValueError(f"Expected SFINCS grid {shape}, got {values.shape} from {path}")
    # SFINCS ASCII starts at the southern row; raster files start at the northern row.
    return np.flipud(values)


def read_active_binary_grid(path: Path, sfincs_mask: np.ndarray) -> np.ndarray:
    """Read a SFINCS Fortran record and expand active values onto its regular grid."""
    payload = path.read_bytes()
    if len(payload) < 8:
        raise ValueError(f"SFINCS binary output is too short: {path}")
    leading = int.from_bytes(payload[:4], byteorder="little", signed=True)
    trailing = int.from_bytes(payload[-4:], byteorder="little", signed=True)
    if leading != trailing or leading != len(payload) - 8:
        raise ValueError(f"Invalid Fortran record markers in {path}")
    values = np.frombuffer(payload[4:-4], dtype="<f4")
    active = sfincs_mask.ravel(order="F") > 0
    if values.size != int(np.sum(active)):
        raise ValueError(
            f"Expected {int(np.sum(active))} active values, got {values.size} from {path}"
        )
    flattened = np.full(sfincs_mask.size, np.nan, dtype="float32")
    flattened[active] = values
    return flattened.reshape(sfincs_mask.shape, order="F")


def _expanded(mask: np.ndarray, radius: int) -> np.ndarray:
    if radius < 0:
        raise ValueError("radius cannot be negative")
    result = mask.copy()
    for _ in range(radius):
        padded = np.pad(result, 1, constant_values=False)
        neighbours = [
            padded[row : row + result.shape[0], col : col + result.shape[1]]
            for row in range(3)
            for col in range(3)
        ]
        result = np.logical_or.reduce(neighbours)
    return result


def analysis_mask(active: np.ndarray, sfincs_mask: np.ndarray, edge_buffer_cells: int) -> np.ndarray:
    return active & ~_expanded(sfincs_mask == 3, edge_buffer_cells)


def member_statistics(
    depth: np.ndarray, valid: np.ndarray, cell_area_m2: float
) -> FloodMemberMetrics:
    values = depth[valid]
    if values.size == 0:
        raise ValueError("No cells remain in the hydraulic analysis mask")
    if np.nanmax(values) > 20:
        raise ValueError("Maximum depth exceeds 20 m; check SFINCS stability and input orientation")
    wet = values > 0.05
    return FloodMemberMetrics(
        analysed_cell_count=int(values.size),
        flooded_area_over_5cm_km2=float(np.sum(values > 0.05) * cell_area_m2 / 1e6),
        flooded_area_over_10cm_km2=float(np.sum(values > 0.10) * cell_area_m2 / 1e6),
        flooded_area_over_30cm_km2=float(np.sum(values > 0.30) * cell_area_m2 / 1e6),
        maximum_depth_m=float(np.max(values)),
        wet_cell_depth_p95_m=float(np.percentile(values[wet], 95)) if np.any(wet) else 0,
        integrated_maximum_depth_volume_proxy_m3=float(
            np.sum(np.maximum(values, 0)) * cell_area_m2
        ),
    )


def ensemble_statistics(
    depths: dict[str, np.ndarray], valid: np.ndarray, cell_area_m2: float
) -> tuple[FloodEnsembleMetrics, np.ndarray, np.ndarray]:
    if len(depths) < 2:
        raise ValueError("An uncertainty ensemble needs at least two depth grids")
    stack = np.stack(list(depths.values())).astype("float32")
    common = valid & np.all(np.isfinite(stack), axis=0)
    if not np.any(common):
        raise ValueError("Depth outputs have no common analysed cells")
    wet = (stack > 0.10) & common
    wet_union = np.any(wet, axis=0)
    wet_intersection = np.all(wet, axis=0)
    union_count = int(np.sum(wet_union))
    intersection_count = int(np.sum(wet_intersection))
    depth_range = np.max(stack, axis=0) - np.min(stack, axis=0)
    depth_range[~common] = np.nan
    agreement_count = np.sum(wet, axis=0).astype("uint8")
    agreement_count[~common] = 255
    members = {
        name: member_statistics(depth, common, cell_area_m2)
        for name, depth in depths.items()
    }
    metrics = FloodEnsembleMetrics(
        member_count=len(depths),
        analysed_cell_count=int(np.sum(common)),
        union_flooded_area_over_10cm_km2=union_count * cell_area_m2 / 1e6,
        intersection_flooded_area_over_10cm_km2=intersection_count * cell_area_m2 / 1e6,
        all_member_wet_jaccard=intersection_count / union_count if union_count else 1,
        terrain_sensitive_wet_fraction=(
            (union_count - intersection_count) / union_count if union_count else 0
        ),
        depth_range_p50_in_union_m=(
            float(np.median(depth_range[wet_union])) if union_count else 0
        ),
        depth_range_p95_in_union_m=(
            float(np.percentile(depth_range[wet_union], 95)) if union_count else 0
        ),
        members=members,
    )
    return metrics, depth_range, agreement_count


def _write_float_raster(path: Path, values: np.ndarray, profile: dict, **tags: str) -> None:
    output_profile = profile.copy()
    output_profile.update(dtype="float32", count=1, nodata=-9999.0, compress="deflate")
    with rasterio.open(path, "w", **output_profile) as target:
        target.write(np.where(np.isfinite(values), values, -9999).astype("float32"), 1)
        target.update_tags(**tags)


def _write_agreement(path: Path, values: np.ndarray, profile: dict) -> None:
    output_profile = profile.copy()
    output_profile.update(dtype="uint8", count=1, nodata=255, compress="deflate")
    with rasterio.open(path, "w", **output_profile) as target:
        target.write(values, 1)
        target.update_tags(
            quantity="Number of terrain members with maximum flood depth over 0.10 m",
            warning="Experimental non-authoritative hydraulic ensemble",
        )


def _write_report(path: Path, metrics: FloodEnsembleMetrics) -> None:
    member_lines = [
        (
            f"- {name}: {member.flooded_area_over_10cm_km2:.2f} km² over 0.10 m; "
            f"maximum {member.maximum_depth_m:.2f} m"
        )
        for name, member in metrics.members.items()
    ]
    path.write_text(
        "\n".join(
            [
                "# Experimental hydraulic terrain ensemble",
                "",
                "## Result",
                "",
                (
                    f"Only {metrics.all_member_wet_jaccard:.1%} of the union of cells deeper than "
                    "0.10 m is shared by every terrain member."
                ),
                (
                    f"The terrain-sensitive wet fraction is "
                    f"{metrics.terrain_sensitive_wet_fraction:.1%}."
                ),
                "",
                "## Members",
                "",
                *member_lines,
                "",
                "## Guardrail",
                "",
                (
                    "Experimental screening result. Terrain-source disagreement dominates the "
                    "model. Do not interpret mapped cells as authoritative street or property flood "
                    "depths. Uniform rainfall, effective surface loss, generic roughness, missing "
                    "drainage, and artificial open AOI boundaries are uncalibrated assumptions."
                ),
                "",
            ]
        )
    )


def postprocess_ensemble(
    model_root: Path, output_dir: Path, edge_buffer_cells: int = 2
) -> FloodEnsembleMetrics:
    manifest = json.loads((model_root / "ensemble-manifest.json").read_text())
    names = manifest["terrain_members"]
    depths: dict[str, np.ndarray] = {}
    common_analysis: np.ndarray | None = None
    reference_profile: dict | None = None
    for name in names:
        member_dir = model_root / name
        metadata = json.loads((member_dir / "model-metadata.json").read_text())
        terrain_path = Path(metadata["terrain_path"])
        with rasterio.open(terrain_path) as terrain:
            active = ~terrain.read(1, masked=True).mask
            profile = terrain.profile
            shape = terrain.shape
        sfincs_mask = read_ascii_grid(member_dir / "sfincs.msk", shape).astype("uint8")
        member_analysis = analysis_mask(active, sfincs_mask, edge_buffer_cells)
        common_analysis = (
            member_analysis if common_analysis is None else common_analysis & member_analysis
        )
        # Grid inputs and active binary outputs use a southern first row. Decode
        # maximum water surface there, subtract the bed, then restore north-up.
        sfincs_mask_south = np.flipud(sfincs_mask)
        bed_south = np.loadtxt(member_dir / "sfincs.dep", dtype="float32")
        surface_south = read_active_binary_grid(member_dir / "zsmax.dat", sfincs_mask_south)
        depth = np.flipud(surface_south - bed_south)
        depth[(np.flipud(surface_south) < -100) | ~active] = np.nan
        depths[name] = np.maximum(depth, 0)
        reference_profile = profile
    assert common_analysis is not None and reference_profile is not None
    cell_area = abs(float(reference_profile["transform"].a * reference_profile["transform"].e))
    metrics, depth_range, agreement = ensemble_statistics(depths, common_analysis, cell_area)
    output_dir.mkdir(parents=True, exist_ok=True)
    for name, values in depths.items():
        _write_float_raster(
            output_dir / f"maximum-depth-{name}.tif",
            values,
            reference_profile,
            quantity="SFINCS maximum water depth",
            units="metres",
            status="experimental_non_authoritative",
        )
    _write_float_raster(
        output_dir / "maximum-depth-range.tif",
        depth_range,
        reference_profile,
        quantity="Maximum depth range across terrain members",
        units="metres",
        status="experimental_non_authoritative",
    )
    _write_agreement(output_dir / "wet-member-count.tif", agreement, reference_profile)
    (output_dir / "metrics.json").write_text(json.dumps(asdict(metrics), indent=2) + "\n")
    _write_report(output_dir / "report.md", metrics)
    return metrics


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--models", type=Path, required=True)
    parser.add_argument("--output", type=Path, required=True)
    parser.add_argument("--edge-buffer-cells", type=int, default=2)
    return parser.parse_args()


def main() -> None:
    args = parse_args()
    print(
        json.dumps(
            asdict(postprocess_ensemble(args.models, args.output, args.edge_buffer_cells)),
            indent=2,
        )
    )


if __name__ == "__main__":
    main()
