import json
from pathlib import Path

import numpy as np
import pytest
import rasterio
from rasterio.transform import from_origin

from naqsha.terrain import audit, copernicus_tile_name, read_aoi, terrain_statistics


def test_copernicus_tile_name_for_lahore():
    assert copernicus_tile_name(74, 31) == "Copernicus_DSM_COG_10_N31_00_E074_00_DEM"


def test_terrain_statistics_on_plane():
    elevation = np.add.outer(np.arange(4, dtype="float32"), np.arange(4, dtype="float32"))
    stats = terrain_statistics(elevation, cell_size=10)
    assert stats["valid_cell_count"] == 16
    assert stats["elevation_range_m"] == pytest.approx(6)
    assert stats["slope_median_percent"] == pytest.approx(np.sqrt(2) * 10)


def test_read_aoi_rejects_multiple_features(tmp_path: Path):
    path = tmp_path / "aoi.geojson"
    path.write_text(json.dumps({"type": "FeatureCollection", "features": [{}, {}]}))
    with pytest.raises(ValueError, match="exactly one"):
        read_aoi(path)


def test_audit_with_local_synthetic_raster(tmp_path: Path):
    aoi = tmp_path / "aoi.geojson"
    aoi.write_text(
        json.dumps(
            {
                "type": "FeatureCollection",
                "features": [
                    {
                        "type": "Feature",
                        "properties": {"name": "Synthetic Lahore pilot"},
                        "geometry": {
                            "type": "Polygon",
                            "coordinates": [
                                [
                                    [74.33, 31.49],
                                    [74.37, 31.49],
                                    [74.37, 31.54],
                                    [74.33, 31.54],
                                    [74.33, 31.49],
                                ]
                            ],
                        },
                    }
                ],
            }
        )
    )
    source = tmp_path / "source.tif"
    values = np.linspace(200, 210, 200 * 200, dtype="float32").reshape(200, 200)
    with rasterio.open(
        source,
        "w",
        driver="GTiff",
        height=200,
        width=200,
        count=1,
        dtype="float32",
        crs="EPSG:4326",
        transform=from_origin(74.30, 31.57, 0.0004, 0.0004),
    ) as dataset:
        dataset.write(values, 1)

    output = tmp_path / "output"
    metrics = audit(aoi, output, str(source))
    assert 5 <= metrics.aoi_area_km2 <= 25
    assert metrics.valid_cell_count > 0
    assert (output / "terrain-utm43n.tif").exists()
    assert (output / "hillshade.png").exists()
    assert (output / "metrics.json").exists()
    assert (output / "report.md").exists()
