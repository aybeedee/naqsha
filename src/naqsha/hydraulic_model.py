"""Build a transparent SFINCS pluvial-flood ensemble from aligned terrain rasters."""

from __future__ import annotations

import argparse
import json
import math
from dataclasses import asdict, dataclass
from datetime import UTC, datetime, timedelta
from pathlib import Path

import numpy as np
import rasterio

SFINCS_IMAGE = "deltares/sfincs-cpu:sfincs-v2.4.0-Galibier-Release"


@dataclass(frozen=True)
class HydraulicScenario:
    rainfall_total_mm: float
    rainfall_duration_minutes: int
    recession_minutes: int
    effective_loss_rate_mm_per_hour: float
    manning_roughness: float = 0.06
    output_interval_seconds: int = 600

    @property
    def rainfall_rate_mm_per_hour(self) -> float:
        return self.rainfall_total_mm / (self.rainfall_duration_minutes / 60)

    @property
    def simulation_seconds(self) -> int:
        return (self.rainfall_duration_minutes + self.recession_minutes) * 60


@dataclass(frozen=True)
class ModelGrid:
    width: int
    height: int
    x0: float
    y0: float
    dx: float
    dy: float
    crs: str
    active_cells: int
    outflow_cells: int


def validate_scenario(scenario: HydraulicScenario) -> None:
    if scenario.rainfall_total_mm <= 0:
        raise ValueError("rainfall_total_mm must be positive")
    if scenario.rainfall_duration_minutes <= 0 or scenario.recession_minutes < 0:
        raise ValueError("rainfall duration must be positive and recession cannot be negative")
    if scenario.effective_loss_rate_mm_per_hour < 0:
        raise ValueError("effective loss rate cannot be negative")
    if not 0 < scenario.output_interval_seconds <= scenario.simulation_seconds:
        raise ValueError("output interval must be within the simulation duration")
    if not 0 < scenario.manning_roughness <= 0.1:
        raise ValueError("Manning roughness must be in (0, 0.1]")


def outflow_mask(valid: np.ndarray) -> np.ndarray:
    """Return an active mask with AOI-edge cells marked as open outflow."""
    if valid.ndim != 2:
        raise ValueError("valid mask must be two-dimensional")
    active = valid.astype(bool)
    mask = active.astype("uint8")
    padded = np.pad(active, 1, constant_values=False)
    interior = active.copy()
    for row_offset, col_offset in ((-1, 0), (1, 0), (0, -1), (0, 1)):
        neighbour = padded[
            1 + row_offset : 1 + row_offset + active.shape[0],
            1 + col_offset : 1 + col_offset + active.shape[1],
        ]
        interior &= neighbour
    mask[active & ~interior] = 3
    return mask


def write_ascii_grid(path: Path, values: np.ndarray, integer: bool = False) -> None:
    """Write west-to-east rows starting at the southern SFINCS grid edge."""
    formatter = "%d" if integer else "%.4f"
    np.savetxt(path, np.flipud(values), fmt=formatter)


def precipitation_series(scenario: HydraulicScenario) -> list[tuple[int, float]]:
    duration_seconds = scenario.rainfall_duration_minutes * 60
    stop_seconds = scenario.simulation_seconds
    rate = scenario.rainfall_rate_mm_per_hour
    series = [(0, rate), (duration_seconds, rate)]
    if stop_seconds > duration_seconds:
        series.extend([(duration_seconds + 1, 0.0), (stop_seconds, 0.0)])
    return series


def _write_precipitation(path: Path, scenario: HydraulicScenario) -> None:
    path.write_text(
        "".join(f"{seconds} {rate:.6f}\n" for seconds, rate in precipitation_series(scenario))
    )


def _write_sfincs_input(path: Path, grid: ModelGrid, scenario: HydraulicScenario) -> None:
    start = datetime(2025, 1, 1, tzinfo=UTC)
    stop = start + timedelta(seconds=scenario.simulation_seconds)
    parameters = [
        ("mmax", grid.width),
        ("nmax", grid.height),
        ("dx", f"{grid.dx:.8f}"),
        ("dy", f"{grid.dy:.8f}"),
        ("x0", f"{grid.x0:.8f}"),
        ("y0", f"{grid.y0:.8f}"),
        ("rotation", 0),
        ("epsg", 32643),
        ("inputformat", "asc"),
        ("outputformat", "bin"),
        ("depfile", "sfincs.dep"),
        ("mskfile", "sfincs.msk"),
        ("precipfile", "sfincs.prcp"),
        ("hmaxfile", "sfincs.hmax"),
        ("zsfile", "zs.dat"),
        ("tref", "20250101 000000"),
        ("tstart", "20250101 000000"),
        ("tstop", stop.strftime("%Y%m%d %H%M%S")),
        ("dtout", scenario.output_interval_seconds),
        ("dtmaxout", scenario.simulation_seconds),
        ("manning", f"{scenario.manning_roughness:.4f}"),
        ("qinf", f"{scenario.effective_loss_rate_mm_per_hour:.4f}"),
        ("qinf_zmin", -1000),
        ("huthresh", 0.02),
        ("storecumprcp", 1),
        ("storetwet", 1),
        ("twet_threshold", 0.05),
    ]
    path.write_text("".join(f"{key:<16} = {value}\n" for key, value in parameters))


def build_model(
    terrain_path: Path,
    output_dir: Path,
    terrain_name: str,
    scenario: HydraulicScenario,
) -> ModelGrid:
    validate_scenario(scenario)
    with rasterio.open(terrain_path) as dataset:
        if dataset.crs is None or dataset.crs.to_epsg() != 32643:
            raise ValueError("Terrain must use EPSG:32643")
        transform = dataset.transform
        if not math.isclose(transform.b, 0) or not math.isclose(transform.d, 0):
            raise ValueError("Rotated terrain rasters are not supported")
        if transform.a <= 0 or transform.e >= 0:
            raise ValueError("Terrain must be north-up")
        if not math.isclose(transform.a, abs(transform.e), rel_tol=1e-5):
            raise ValueError("SFINCS milestone requires square terrain cells")
        elevation = dataset.read(1, masked=True).filled(np.nan).astype("float32")
        valid = np.isfinite(elevation)
        grid = ModelGrid(
            width=dataset.width,
            height=dataset.height,
            x0=float(transform.c),
            y0=float(transform.f + dataset.height * transform.e),
            dx=float(transform.a),
            dy=float(abs(transform.e)),
            crs=dataset.crs.to_string(),
            active_cells=int(np.sum(valid)),
            outflow_cells=int(np.sum(outflow_mask(valid) == 3)),
        )
    if not np.any(valid):
        raise ValueError("Terrain contains no valid cells")

    output_dir.mkdir(parents=True, exist_ok=True)
    # Inactive values are ignored by SFINCS but must remain finite in the ASCII grid.
    write_ascii_grid(output_dir / "sfincs.dep", np.where(valid, elevation, 0))
    write_ascii_grid(output_dir / "sfincs.msk", outflow_mask(valid), integer=True)
    _write_precipitation(output_dir / "sfincs.prcp", scenario)
    _write_sfincs_input(output_dir / "sfincs.inp", grid, scenario)
    (output_dir / "model-metadata.json").write_text(
        json.dumps(
            {
                "status": "experimental_non_authoritative",
                "solver_image": SFINCS_IMAGE,
                "terrain_name": terrain_name,
                "terrain_path": str(terrain_path),
                "scenario": asdict(scenario),
                "grid": asdict(grid),
                "boundary_assumption": (
                    "All active cells adjacent to the rectangular/AOI edge are zero-depth outflow "
                    "cells. Results near the edge are not valid without a contributing catchment."
                ),
                "loss_assumption": (
                    "qinf is an effective uniform surface-loss sensitivity. It is not a mapped sewer "
                    "or soil-infiltration model."
                ),
                "warning": (
                    "Terrain-source disagreement dominates this experiment. Do not interpret mapped "
                    "cells as authoritative street or property flood depths."
                ),
            },
            indent=2,
        )
        + "\n"
    )
    return grid


def build_ensemble(
    surfaces: dict[str, Path], output_dir: Path, scenario: HydraulicScenario
) -> dict[str, ModelGrid]:
    if len(surfaces) < 2:
        raise ValueError("An uncertainty ensemble needs at least two terrain surfaces")
    grids = {
        name: build_model(path, output_dir / name, name, scenario)
        for name, path in surfaces.items()
    }
    first = next(iter(grids.values()))
    for name, grid in grids.items():
        if (grid.width, grid.height, grid.x0, grid.y0, grid.dx, grid.dy) != (
            first.width,
            first.height,
            first.x0,
            first.y0,
            first.dx,
            first.dy,
        ):
            raise ValueError(f"Terrain grid {name} is not aligned with the ensemble")
    (output_dir / "ensemble-manifest.json").write_text(
        json.dumps(
            {
                "status": "experimental_non_authoritative",
                "solver_image": SFINCS_IMAGE,
                "scenario": asdict(scenario),
                "terrain_members": list(surfaces),
            },
            indent=2,
        )
        + "\n"
    )
    return grids


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
    parser.add_argument("--surface", action="append", type=_surface_argument, required=True)
    parser.add_argument("--output", type=Path, required=True)
    parser.add_argument("--rainfall-total-mm", type=float, default=100)
    parser.add_argument("--rainfall-duration-minutes", type=int, default=120)
    parser.add_argument("--recession-minutes", type=int, default=120)
    parser.add_argument("--effective-loss-rate", type=float, default=5)
    parser.add_argument("--manning", type=float, default=0.06)
    parser.add_argument("--output-interval-seconds", type=int, default=600)
    return parser.parse_args()


def main() -> None:
    args = parse_args()
    scenario = HydraulicScenario(
        rainfall_total_mm=args.rainfall_total_mm,
        rainfall_duration_minutes=args.rainfall_duration_minutes,
        recession_minutes=args.recession_minutes,
        effective_loss_rate_mm_per_hour=args.effective_loss_rate,
        manning_roughness=args.manning,
        output_interval_seconds=args.output_interval_seconds,
    )
    grids = build_ensemble(dict(args.surface), args.output, scenario)
    print(json.dumps({name: asdict(grid) for name, grid in grids.items()}, indent=2))


if __name__ == "__main__":
    main()
