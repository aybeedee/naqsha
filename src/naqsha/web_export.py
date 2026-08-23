"""Export hydraulic ensemble rasters as compact, browser-native grid assets."""

from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

import numpy as np
import rasterio


def write_float32(path: Path, values: np.ndarray) -> None:
    path.write_bytes(np.asarray(values, dtype="<f4").tobytes(order="C"))


def write_uint8(path: Path, values: np.ndarray) -> None:
    path.write_bytes(np.asarray(values, dtype="uint8").tobytes(order="C"))


def _read_raster(path: Path) -> tuple[np.ndarray, dict]:
    with rasterio.open(path) as dataset:
        values = dataset.read(1, masked=True).astype("float32").filled(np.nan)
        metadata = {
            "width": dataset.width,
            "height": dataset.height,
            "crs": dataset.crs.to_string() if dataset.crs else None,
            "transform": list(dataset.transform)[:6],
            "bounds": list(dataset.bounds),
            "cellSizeMetres": abs(float(dataset.transform.a)),
        }
    return values, metadata


def export_web_scenario(model_root: Path, result_root: Path, output_dir: Path) -> dict:
    manifest = json.loads((model_root / "ensemble-manifest.json").read_text())
    metrics = json.loads((result_root / "metrics.json").read_text())
    names = manifest["terrain_members"]
    output_dir.mkdir(parents=True, exist_ok=True)

    grid_metadata: dict | None = None
    common_active: np.ndarray | None = None
    member_payload = []
    for name in names:
        model_metadata = json.loads((model_root / name / "model-metadata.json").read_text())
        terrain, terrain_grid = _read_raster(Path(model_metadata["terrain_path"]))
        depth, depth_grid = _read_raster(result_root / f"maximum-depth-{name}.tif")
        if terrain_grid != depth_grid:
            raise ValueError(f"Terrain and depth grids differ for {name}")
        if grid_metadata is None:
            grid_metadata = terrain_grid
        elif terrain_grid != grid_metadata:
            raise ValueError(f"Terrain member {name} is not aligned")
        active = np.isfinite(terrain) & np.isfinite(depth)
        common_active = active if common_active is None else common_active & active
        terrain_file = f"terrain-{name}.f32"
        depth_file = f"depth-{name}.f32"
        write_float32(output_dir / terrain_file, np.where(active, terrain, 0))
        write_float32(output_dir / depth_file, np.where(active, depth, 0))
        member_payload.append(
            {
                "id": name,
                "label": {
                    "copernicus": "Copernicus GLO-30",
                    "fabdem": "FABDEM v1.2",
                    "srtm": "SRTM-family",
                }.get(name, name.title()),
                "terrainFile": terrain_file,
                "depthFile": depth_file,
                "metrics": metrics["members"][name],
                "terrainMinimumMetres": float(np.min(terrain[active])),
                "terrainMaximumMetres": float(np.max(terrain[active])),
            }
        )
    assert grid_metadata is not None and common_active is not None

    wet_count, wet_grid = _read_raster(result_root / "wet-member-count.tif")
    if wet_grid != grid_metadata:
        raise ValueError("Wet-member agreement grid is not aligned")
    active_file = "active.u8"
    agreement_file = "wet-member-count.u8"
    write_uint8(output_dir / active_file, common_active)
    write_uint8(
        output_dir / agreement_file,
        np.where(common_active & np.isfinite(wet_count), wet_count, 255),
    )

    minx, miny, maxx, maxy = grid_metadata["bounds"]
    scenario_payload = {
        "schemaVersion": 1,
        "id": output_dir.name,
        "label": "100 mm / 2 h stress test",
        "status": "experimental_non_authoritative",
        "warning": (
            "Terrain-source disagreement dominates this experiment. Do not interpret mapped cells "
            "as authoritative street or property flood depths."
        ),
        "location": "Central Lahore — Lakshmi Chowk / GPO / Lawrence Road candidate",
        "grid": {
            **grid_metadata,
            "extentWidthMetres": maxx - minx,
            "extentHeightMetres": maxy - miny,
            "activeFile": active_file,
        },
        "scenario": manifest["scenario"],
        "members": member_payload,
        "agreement": {
            "file": agreement_file,
            "thresholdMetres": 0.1,
            "metrics": {
                key: value for key, value in metrics.items() if key != "members"
            },
        },
        "provenance": {
            "solverImage": manifest["solver_image"],
            "sourceModelDirectory": str(model_root),
            "sourceResultDirectory": str(result_root),
        },
    }
    (output_dir / "scenario.json").write_text(json.dumps(scenario_payload, indent=2) + "\n")
    return scenario_payload


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--models", type=Path, required=True)
    parser.add_argument("--results", type=Path, required=True)
    parser.add_argument("--output", type=Path, required=True)
    return parser.parse_args()


def main() -> None:
    args = parse_args()
    payload = export_web_scenario(args.models, args.results, args.output)
    json.dump(payload, sys.stdout, indent=2)
    print()


if __name__ == "__main__":
    main()
