import json
from pathlib import Path

import numpy as np

from naqsha.urban_context import export_urban_context


def _write(path: Path, payload: dict) -> Path:
    path.write_text(json.dumps(payload))
    return path


def test_context_export_encodes_buildings_network_and_labels(tmp_path: Path):
    scenario = {
        "grid": {
            "crs": "EPSG:32643",
            "bounds": [433900, 3489000, 438000, 3494000],
        }
    }
    buildings = {
        "features": [
            {
                "type": "Feature",
                "geometry": {
                    "type": "Polygon",
                    "coordinates": [
                        [[74.32, 31.55], [74.3202, 31.55], [74.3202, 31.5502], [74.32, 31.55]]
                    ],
                },
                "properties": {
                    "height": 12,
                    "sources": [{"dataset": "OpenStreetMap"}],
                },
            }
        ]
    }
    osm = {
        "osm3s": {"timestamp_osm_base": "2026-01-01T00:00:00Z"},
        "elements": [
            {
                "type": "way",
                "geometry": [
                    {"lon": 74.323, "lat": 31.55},
                    {"lon": 74.325, "lat": 31.55},
                ],
                "tags": {"highway": "primary", "name": "Test Road"},
            },
            {
                "type": "node",
                "lon": 74.32,
                "lat": 31.55,
                "tags": {"place": "suburb", "name": "Test Place"},
            },
        ],
    }
    output = tmp_path / "output"
    payload = export_urban_context(
        _write(tmp_path / "buildings.json", buildings),
        _write(tmp_path / "osm.json", osm),
        _write(tmp_path / "scenario.json", scenario),
        output,
    )

    assert payload["buildings"]["count"] == 1
    assert payload["buildings"]["measuredOrTaggedHeightCount"] == 1
    assert payload["network"]["count"] == 1
    assert {label["name"] for label in payload["labels"]} == {"Test Place", "Test Road"}
    assert np.frombuffer((output / "buildings.height.f32").read_bytes(), dtype="<f4").tolist() == [12]
    assert np.frombuffer((output / "network.index.u32").read_bytes(), dtype="<u4").tolist() == [0, 2, 1]
