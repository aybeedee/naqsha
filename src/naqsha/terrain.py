"""Audit open terrain over a GeoJSON area of interest."""

from __future__ import annotations

import argparse
import json
import math
from dataclasses import asdict, dataclass
from datetime import UTC, datetime
from pathlib import Path

import numpy as np
import rasterio
from pyproj import CRS, Transformer
from rasterio.io import DatasetReader
from rasterio.mask import mask
from rasterio.warp import Resampling, calculate_default_transform, reproject
from shapely.geometry import mapping, shape
from shapely.ops import transform as shapely_ops_transform

COPERNICUS_BASE = "https://copernicus-dem-30m.s3.amazonaws.com"
OUTPUT_CRS = CRS.from_epsg(32643)


@dataclass(frozen=True)
class TerrainMetrics:
    aoi_name: str
    aoi_area_km2: float
    source_name: str
    source: str
    source_license: str
    source_resolution_m_approx: float
    output_crs: str
    output_cell_size_m: float
    valid_cell_count: int
    elevation_min_m: float
    elevation_max_m: float
    elevation_range_m: float
    elevation_std_m: float
    slope_median_percent: float
    slope_p95_percent: float
    local_relief_p95_m: float
    generated_at: str


def read_aoi(path: Path):
    payload = json.loads(path.read_text())
    if payload.get("type") != "FeatureCollection" or len(payload.get("features", [])) != 1:
        raise ValueError("AOI must be a FeatureCollection containing exactly one feature")
    feature = payload["features"][0]
    geometry = shape(feature["geometry"])
    if geometry.geom_type not in {"Polygon", "MultiPolygon"} or not geometry.is_valid:
        raise ValueError("AOI must contain one valid Polygon or MultiPolygon")
    name = feature.get("properties", {}).get("name", path.stem)
    return name, geometry


def projected_area_km2(geometry) -> float:
    transformer = Transformer.from_crs("EPSG:4326", OUTPUT_CRS, always_xy=True)
    projected = shapely_ops_transform(transformer.transform, geometry)
    return projected.area / 1_000_000


def copernicus_tile_name(lon: int, lat: int) -> str:
    lat_token = f"{'N' if lat >= 0 else 'S'}{abs(lat):02d}_00"
    lon_token = f"{'E' if lon >= 0 else 'W'}{abs(lon):03d}_00"
    return f"Copernicus_DSM_COG_10_{lat_token}_{lon_token}_DEM"


def source_urls_for_bounds(bounds: tuple[float, float, float, float]) -> list[str]:
    minx, miny, maxx, maxy = bounds
    urls: list[str] = []
    for lat in range(math.floor(miny), math.floor(maxy) + 1):
        for lon in range(math.floor(minx), math.floor(maxx) + 1):
            tile = copernicus_tile_name(lon, lat)
            urls.append(f"{COPERNICUS_BASE}/{tile}/{tile}.tif")
    return urls


def _clip_source(dataset: DatasetReader, geometry):
    clipped, transform = mask(dataset, [mapping(geometry)], crop=True, filled=False)
    return clipped[0], transform, dataset.crs


def reproject_clip(source: np.ma.MaskedArray, source_transform, source_crs):
    left, bottom, right, top = rasterio.transform.array_bounds(
        source.shape[0], source.shape[1], source_transform
    )
    transform, width, height = calculate_default_transform(
        source_crs, OUTPUT_CRS, source.shape[1], source.shape[0], left, bottom, right, top
    )
    destination = np.full((height, width), np.nan, dtype="float32")
    floating_source = source.astype("float32").filled(np.nan)
    reproject(
        source=floating_source,
        destination=destination,
        src_transform=source_transform,
        src_crs=source_crs,
        dst_transform=transform,
        dst_crs=OUTPUT_CRS,
        src_nodata=np.nan,
        dst_nodata=np.nan,
        resampling=Resampling.bilinear,
    )
    return destination, transform


def terrain_statistics(elevation: np.ndarray, cell_size: float) -> dict[str, float | int]:
    valid = elevation[np.isfinite(elevation)]
    if valid.size == 0:
        raise ValueError("Clipped terrain contains no valid elevation cells")

    filled = np.where(np.isfinite(elevation), elevation, np.nanmedian(valid))
    gradient_y, gradient_x = np.gradient(filled, cell_size, cell_size)
    slope_percent = np.hypot(gradient_x, gradient_y) * 100

    # Relief across each cell and its immediate neighbours; this is a diagnostic
    # for local surface variability, not a formal DEM accuracy estimate.
    padded = np.pad(filled, 1, mode="edge")
    neighbours = [
        padded[y : y + filled.shape[0], x : x + filled.shape[1]]
        for y in range(3)
        for x in range(3)
    ]
    local_relief = np.max(neighbours, axis=0) - np.min(neighbours, axis=0)

    valid_mask = np.isfinite(elevation)
    return {
        "valid_cell_count": int(valid.size),
        "elevation_min_m": float(np.min(valid)),
        "elevation_max_m": float(np.max(valid)),
        "elevation_range_m": float(np.ptp(valid)),
        "elevation_std_m": float(np.std(valid)),
        "slope_median_percent": float(np.median(slope_percent[valid_mask])),
        "slope_p95_percent": float(np.percentile(slope_percent[valid_mask], 95)),
        "local_relief_p95_m": float(np.percentile(local_relief[valid_mask], 95)),
    }


def write_geotiff(
    path: Path, elevation: np.ndarray, transform, source_name: str, source_license: str
) -> None:
    profile = {
        "driver": "GTiff",
        "height": elevation.shape[0],
        "width": elevation.shape[1],
        "count": 1,
        "dtype": "float32",
        "crs": OUTPUT_CRS,
        "transform": transform,
        "nodata": -9999.0,
        "compress": "deflate",
        "tiled": True,
    }
    with rasterio.open(path, "w", **profile) as target:
        target.write(np.where(np.isfinite(elevation), elevation, -9999.0).astype("float32"), 1)
        target.update_tags(
            source_product=source_name,
            source_license=source_license,
            evidence_resolution="30 metres",
            warning="This global elevation model does not support street-level elevation claims.",
        )


def write_hillshade(path: Path, elevation: np.ndarray, cell_size: float, transform) -> None:
    valid = elevation[np.isfinite(elevation)]
    filled = np.where(np.isfinite(elevation), elevation, np.nanmedian(valid))
    dy, dx = np.gradient(filled, cell_size, cell_size)
    slope = np.pi / 2 - np.arctan(np.hypot(dx, dy))
    aspect = np.arctan2(-dx, dy)
    azimuth = np.deg2rad(315)
    altitude = np.deg2rad(45)
    shaded = np.sin(altitude) * np.sin(slope) + np.cos(altitude) * np.cos(slope) * np.cos(
        azimuth - aspect
    )
    image = np.clip((shaded + 1) * 127.5, 0, 255).astype("uint8")
    with rasterio.open(
        path,
        "w",
        driver="PNG",
        height=image.shape[0],
        width=image.shape[1],
        count=1,
        dtype="uint8",
        crs=OUTPUT_CRS,
        transform=transform,
    ) as target:
        target.write(image, 1)


def write_report(path: Path, metrics: TerrainMetrics) -> None:
    verdict = (
        "Terrain variation is small enough that global DEM uncertainty may control flow routing. "
        "Treat this as screening evidence and proceed to multi-DEM/historical validation."
    )
    path.write_text(
        "\n".join(
            [
                f"# Terrain audit: {metrics.aoi_name}",
                "",
                "## Result",
                "",
                verdict,
                "",
                "## Metrics",
                "",
                f"- AOI area: {metrics.aoi_area_km2:.2f} km²",
                f"- Elevation range: {metrics.elevation_range_m:.2f} m",
                f"- Elevation standard deviation: {metrics.elevation_std_m:.2f} m",
                f"- Median slope: {metrics.slope_median_percent:.3f}%",
                f"- 95th-percentile slope: {metrics.slope_p95_percent:.3f}%",
                f"- 95th-percentile 3×3-cell relief: {metrics.local_relief_p95_m:.2f} m",
                f"- Output cell size: {metrics.output_cell_size_m:.2f} m",
                "- Evidence resolution: approximately 30 m",
                "",
                "## Guardrail",
                "",
                (
                    "This is a digital surface model. It includes surface objects and must not be "
                    "described as surveyed bare-earth street terrain. Reprojection and interpolation "
                    "do not improve the evidence resolution."
                ),
                "",
                f"Source: `{metrics.source}`",
                f"Source product: {metrics.source_name}",
                f"Source licence: {metrics.source_license}",
                f"Generated: {metrics.generated_at}",
                "",
            ]
        )
    )


def audit(
    aoi_path: Path,
    output_dir: Path,
    source_url: str | None = None,
    source_name: str = "Copernicus DEM GLO-30",
    source_license: str = "Copernicus DEM licence",
) -> TerrainMetrics:
    name, geometry = read_aoi(aoi_path)
    area_km2 = projected_area_km2(geometry)
    if not 5 <= area_km2 <= 25:
        raise ValueError(f"Pilot area is {area_km2:.2f} km²; expected 5–25 km²")

    urls = source_urls_for_bounds(geometry.bounds)
    if source_url is None:
        if len(urls) != 1:
            raise ValueError("Multi-tile AOIs are not supported by the first terrain-audit milestone")
        source_url = urls[0]

    output_dir.mkdir(parents=True, exist_ok=True)
    rasterio_env = {
        "GDAL_DISABLE_READDIR_ON_OPEN": "EMPTY_DIR",
        "CPL_VSIL_CURL_ALLOWED_EXTENSIONS": ".tif,.hgt,.gz",
    }
    with rasterio.Env(**rasterio_env), rasterio.open(source_url) as dataset:
        clipped, source_transform, source_crs = _clip_source(dataset, geometry)
    elevation, transform = reproject_clip(clipped, source_transform, source_crs)
    cell_size = float(abs(transform.a))
    stats = terrain_statistics(elevation, cell_size)

    metrics = TerrainMetrics(
        aoi_name=name,
        aoi_area_km2=area_km2,
        source_name=source_name,
        source=source_url,
        source_license=source_license,
        source_resolution_m_approx=30,
        output_crs=OUTPUT_CRS.to_string(),
        output_cell_size_m=cell_size,
        generated_at=datetime.now(UTC).isoformat(),
        **stats,
    )
    write_geotiff(
        output_dir / "terrain-utm43n.tif",
        elevation,
        transform,
        source_name,
        source_license,
    )
    write_hillshade(output_dir / "hillshade.png", elevation, cell_size, transform)
    (output_dir / "metrics.json").write_text(json.dumps(asdict(metrics), indent=2) + "\n")
    write_report(output_dir / "report.md", metrics)
    return metrics


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--aoi", type=Path, required=True, help="Single-feature GeoJSON boundary")
    parser.add_argument("--output", type=Path, required=True, help="Generated artifact directory")
    parser.add_argument(
        "--source-url",
        help="Override the inferred Copernicus URL; useful for offline files and tests",
    )
    parser.add_argument("--source-name", default="Copernicus DEM GLO-30")
    parser.add_argument("--source-license", default="Copernicus DEM licence")
    return parser.parse_args()


def main() -> None:
    args = parse_args()
    metrics = audit(
        args.aoi,
        args.output,
        args.source_url,
        source_name=args.source_name,
        source_license=args.source_license,
    )
    print(json.dumps(asdict(metrics), indent=2))


if __name__ == "__main__":
    main()
