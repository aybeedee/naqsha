"""Intersect browser hydraulic timelines with mapped urban network lines."""

from __future__ import annotations

import argparse
import json
from pathlib import Path
from typing import Any

import numpy as np

from naqsha.web_export import write_float32, write_uint8, write_uint16

ROAD_CLASS_IDS = frozenset(range(7))
NODATA_DEPTH = np.iinfo("uint16").max
NODATA_COUNT = np.iinfo("uint8").max


def _line_cells(
    coordinates: np.ndarray,
    width: int,
    height: int,
    cell_size: float,
    active: np.ndarray,
    sample_spacing: float,
) -> np.ndarray:
    """Return unique active raster cells sampled along one local-coordinate line."""
    samples: list[tuple[float, float]] = []
    for index in range(len(coordinates) - 1):
        start = coordinates[index]
        stop = coordinates[index + 1]
        distance = float(np.linalg.norm(stop - start))
        steps = max(1, int(np.ceil(distance / sample_spacing)))
        for step in range(steps + 1):
            fraction = step / steps
            point = start + (stop - start) * fraction
            samples.append((float(point[0]), float(point[1])))
    if not samples:
        return np.empty(0, dtype="int64")
    points = np.asarray(samples)
    columns = np.rint(points[:, 0] / cell_size + (width - 1) / 2).astype("int64")
    rows = np.rint(points[:, 1] / cell_size + (height - 1) / 2).astype("int64")
    inside = (columns >= 0) & (columns < width) & (rows >= 0) & (rows < height)
    flat = rows[inside] * width + columns[inside]
    return np.unique(flat[active[flat]])


def road_impacts(
    timelines: np.ndarray,
    active: np.ndarray,
    network_coordinates: np.ndarray,
    network_index: np.ndarray,
    width: int,
    height: int,
    cell_size: float,
    agreement_threshold_mm: int = 100,
) -> tuple[np.ndarray, np.ndarray, np.ndarray]:
    """Return median depth, wet-member count, and length for each line and frame."""
    if timelines.ndim != 3 or timelines.shape[2] != width * height:
        raise ValueError("Timeline shape must be member × frame × grid cell")
    if active.size != width * height:
        raise ValueError("Active mask does not match grid")
    line_count = network_index.shape[0]
    frame_count = timelines.shape[1]
    depths = np.full((frame_count, line_count), NODATA_DEPTH, dtype="uint16")
    agreement = np.full((frame_count, line_count), NODATA_COUNT, dtype="uint8")
    lengths = np.zeros(line_count, dtype="float32")
    median_timeline = np.median(timelines, axis=0)

    for line, (offset, length, class_id) in enumerate(network_index):
        points = network_coordinates[offset : offset + length]
        if len(points) > 1:
            lengths[line] = np.sum(np.linalg.norm(np.diff(points, axis=0), axis=1))
        if int(class_id) not in ROAD_CLASS_IDS or len(points) < 2:
            continue
        cells = _line_cells(
            points,
            width,
            height,
            cell_size,
            active,
            sample_spacing=cell_size / 2,
        )
        if not cells.size:
            continue
        member_line_max = np.max(timelines[:, :, cells], axis=2)
        depths[:, line] = np.rint(np.max(median_timeline[:, cells], axis=1)).astype("uint16")
        agreement[:, line] = np.sum(
            member_line_max >= agreement_threshold_mm, axis=0
        ).astype("uint8")
    return depths, agreement, lengths


def export_road_impacts(
    scenario_dir: Path,
    context_dir: Path,
    agreement_threshold_metres: float = 0.1,
) -> dict[str, Any]:
    scenario_path = scenario_dir / "scenario.json"
    scenario = json.loads(scenario_path.read_text())
    context = json.loads((context_dir / "context.json").read_text())
    width = int(scenario["grid"]["width"])
    height = int(scenario["grid"]["height"])
    frame_count = int(scenario["timeline"]["frameCount"])
    cell_count = width * height
    active = np.fromfile(scenario_dir / scenario["grid"]["activeFile"], dtype="uint8").astype(bool)
    timelines = np.stack(
        [
            np.fromfile(scenario_dir / member["timelineFile"], dtype="<u2").reshape(
                frame_count, cell_count
            )
            for member in scenario["members"]
        ]
    )
    network_coordinates = np.fromfile(
        context_dir / context["network"]["coordinateFile"], dtype="<f4"
    ).reshape(-1, 2)
    network_index = np.fromfile(
        context_dir / context["network"]["indexFile"], dtype="<u4"
    ).reshape(-1, 3)
    if network_index.shape[0] != context["network"]["count"]:
        raise ValueError("Network index count does not match context metadata")

    scale = float(scenario["timeline"]["depthScaleMetres"])
    threshold_mm = round(agreement_threshold_metres / scale)
    timeline_depth, timeline_agreement, lengths = road_impacts(
        timelines,
        active,
        network_coordinates,
        network_index,
        width,
        height,
        float(scenario["grid"]["cellSizeMetres"]),
        threshold_mm,
    )
    peak_depth = np.max(
        np.where(timeline_depth == NODATA_DEPTH, 0, timeline_depth), axis=0
    ).astype("uint16")
    peak_agreement = np.max(
        np.where(timeline_agreement == NODATA_COUNT, 0, timeline_agreement), axis=0
    ).astype("uint8")
    valid_lines = np.any(timeline_depth != NODATA_DEPTH, axis=0)
    peak_depth[~valid_lines] = NODATA_DEPTH
    peak_agreement[~valid_lines] = NODATA_COUNT

    files = {
        "timelineDepthFile": "road-impact-depth.u16",
        "timelineAgreementFile": "road-impact-agreement.u8",
        "peakDepthFile": "road-impact-peak-depth.u16",
        "peakAgreementFile": "road-impact-peak-agreement.u8",
        "lengthFile": "road-impact-length.f32",
    }
    write_uint16(scenario_dir / files["timelineDepthFile"], timeline_depth)
    write_uint8(scenario_dir / files["timelineAgreementFile"], timeline_agreement)
    write_uint16(scenario_dir / files["peakDepthFile"], peak_depth)
    write_uint8(scenario_dir / files["peakAgreementFile"], peak_agreement)
    write_float32(scenario_dir / files["lengthFile"], lengths)

    valid_peak = peak_depth != NODATA_DEPTH
    ten_cm = round(0.1 / scale)
    thirty_cm = round(0.3 / scale)
    payload = {
        **files,
        "contextId": context_dir.name,
        "lineCount": int(network_index.shape[0]),
        "frameCount": frame_count,
        "depthScaleMetres": scale,
        "nodataDepth": int(NODATA_DEPTH),
        "nodataAgreement": int(NODATA_COUNT),
        "agreementThresholdMetres": agreement_threshold_metres,
        "memberCount": int(timelines.shape[0]),
        "roadClassIds": sorted(ROAD_CLASS_IDS),
        "peakSummary": {
            "roadLengthOver10cmKm": float(
                np.sum(lengths[valid_peak & (peak_depth >= ten_cm)]) / 1000
            ),
            "roadLengthOver30cmKm": float(
                np.sum(lengths[valid_peak & (peak_depth >= thirty_cm)]) / 1000
            ),
            "mappedRoadLengthKm": float(np.sum(lengths[valid_peak]) / 1000),
        },
        "warning": (
            "Screening exposure sampled from a terrain-uncertain 28.66 m grid. It is not a road "
            "closure or safe-routing determination."
        ),
    }
    scenario["roadImpact"] = payload
    scenario_path.write_text(json.dumps(scenario, indent=2) + "\n")
    return payload


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--scenario", type=Path, required=True)
    parser.add_argument("--context", type=Path, required=True)
    parser.add_argument("--agreement-threshold-metres", type=float, default=0.1)
    return parser.parse_args()


def main() -> None:
    args = parse_args()
    print(
        json.dumps(
            export_road_impacts(args.scenario, args.context, args.agreement_threshold_metres),
            indent=2,
        )
    )


if __name__ == "__main__":
    main()
