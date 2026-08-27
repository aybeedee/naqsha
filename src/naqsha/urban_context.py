"""Build compact browser assets from public Lahore building and OSM extracts."""

from __future__ import annotations

import argparse
import json
from collections import Counter
from pathlib import Path
from typing import Any

import numpy as np
from pyproj import Transformer
from shapely.geometry import LineString, MultiLineString, MultiPolygon, Point, Polygon, box, shape
from shapely.ops import transform

from naqsha.web_export import write_float32, write_uint8

LINE_CLASSES = [
    {"id": 0, "name": "trunk", "widthMetres": 18, "colour": "#e1ad68"},
    {"id": 1, "name": "primary", "widthMetres": 14, "colour": "#d7a768"},
    {"id": 2, "name": "secondary", "widthMetres": 11, "colour": "#c9a270"},
    {"id": 3, "name": "tertiary", "widthMetres": 8, "colour": "#a99b7c"},
    {"id": 4, "name": "local", "widthMetres": 5, "colour": "#748889"},
    {"id": 5, "name": "service", "widthMetres": 3, "colour": "#536d72"},
    {"id": 6, "name": "pedestrian", "widthMetres": 2, "colour": "#496268"},
    {"id": 7, "name": "railway", "widthMetres": 5, "colour": "#bd8268"},
    {"id": 8, "name": "waterway", "widthMetres": 7, "colour": "#398da2"},
    {"id": 9, "name": "park", "widthMetres": 3, "colour": "#4f8b72"},
]

HIGHWAY_CLASS = {
    "motorway": 0,
    "motorway_link": 0,
    "trunk": 0,
    "trunk_link": 0,
    "primary": 1,
    "primary_link": 1,
    "secondary": 2,
    "secondary_link": 2,
    "tertiary": 3,
    "tertiary_link": 3,
    "residential": 4,
    "living_street": 4,
    "unclassified": 4,
    "service": 5,
    "footway": 6,
    "pedestrian": 6,
    "path": 6,
    "steps": 6,
    "cycleway": 6,
}


def write_uint32(path: Path, values: np.ndarray) -> None:
    path.write_bytes(np.asarray(values, dtype="<u4").tobytes(order="C"))


def _projector() -> Transformer:
    return Transformer.from_crs("EPSG:4326", "EPSG:32643", always_xy=True)


def _polygons(geometry: Any) -> list[Polygon]:
    if isinstance(geometry, Polygon):
        return [geometry]
    if isinstance(geometry, MultiPolygon):
        return list(geometry.geoms)
    return []


def _lines(geometry: Any) -> list[LineString]:
    if isinstance(geometry, LineString):
        return [geometry]
    if isinstance(geometry, MultiLineString):
        return list(geometry.geoms)
    return []


def _numeric(value: Any) -> float | None:
    if isinstance(value, int | float):
        return float(value)
    if isinstance(value, str):
        cleaned = value.lower().replace("metres", "").replace("meters", "").replace("m", "")
        try:
            return float(cleaned.strip())
        except ValueError:
            return None
    return None


def _building_height(properties: dict[str, Any]) -> tuple[float, bool]:
    height = _numeric(properties.get("height"))
    if height is not None and 2 <= height <= 120:
        return height, True
    floors = _numeric(properties.get("num_floors"))
    if floors is not None and 1 <= floors <= 40:
        return floors * 3.2, True
    # The footprints are observed, but this extrusion is intentionally uniform
    # so the scene does not invent a detailed skyline from missing attributes.
    return 8.0, False


def _source_id(properties: dict[str, Any]) -> tuple[int, str]:
    sources = properties.get("sources") or []
    dataset = str(sources[0].get("dataset", "Other")) if sources else "Other"
    if dataset == "OpenStreetMap":
        return 1, dataset
    if dataset == "Google Open Buildings":
        return 2, dataset
    if dataset == "Microsoft ML Buildings":
        return 3, dataset
    return 4, dataset


def _line_class(tags: dict[str, Any]) -> int | None:
    if tags.get("railway") and tags.get("railway") not in {"subway_entrance", "station"}:
        return 7
    if tags.get("waterway") or tags.get("natural") == "water":
        return 8
    if tags.get("leisure") == "park":
        return 9
    return HIGHWAY_CLASS.get(tags.get("highway"))


def _label_category(tags: dict[str, Any]) -> tuple[str, int, str] | None:
    place = tags.get("place")
    if place in {"city", "town"}:
        return "district", 120, "City"
    if place == "suburb":
        return "district", 108, "District"
    if place in {"neighbourhood", "quarter"}:
        return "district", 96, "Neighbourhood"
    if place in {"locality", "village", "hamlet"}:
        return "district", 84, "Locality"
    if place == "square":
        return "landmark", 82, "Square"
    if tags.get("railway") == "station":
        return "transit", 100, "Railway station"
    if tags.get("railway") in {"halt", "stop"}:
        return "transit", 78, "Rail stop"
    if tags.get("amenity") == "bus_station" or tags.get("public_transport") == "station":
        return "transit", 88, "Transit station"
    if tags.get("tourism") == "museum":
        return "landmark", 96, "Museum"
    if tags.get("historic") in {"monument", "memorial", "tomb"}:
        return "landmark", 90, str(tags["historic"]).replace("_", " ").title()
    if tags.get("tourism") in {"attraction", "gallery", "viewpoint"}:
        return "landmark", 80, str(tags["tourism"]).replace("_", " ").title()
    amenity = tags.get("amenity")
    if amenity == "university":
        return "education", 94, "University"
    if amenity == "college":
        return "education", 88, "College"
    if amenity in {"school", "library"}:
        return "education", 72 if amenity == "school" else 78, amenity.title()
    if amenity in {"kindergarten", "training"}:
        return "education", 56, str(amenity).title()
    if amenity == "hospital":
        return "healthcare", 94, "Hospital"
    if amenity in {"clinic", "doctors", "pharmacy", "dentist"}:
        priority = {"clinic": 76, "doctors": 64, "pharmacy": 54, "dentist": 58}[amenity]
        return "healthcare", priority, str(amenity).title()
    if amenity == "place_of_worship":
        religion = str(tags.get("religion") or "Place of worship").title()
        return "worship", 76, religion
    government_priorities = {
        "townhall": 90,
        "courthouse": 88,
        "police": 78,
        "fire_station": 76,
        "post_office": 66,
        "community_centre": 62,
    }
    if amenity in government_priorities:
        return "government", government_priorities[amenity], str(amenity).replace("_", " ").title()
    if amenity in {"marketplace", "bank"}:
        return "shopping", 78 if amenity == "marketplace" else 58, str(amenity).title()
    if amenity in {"restaurant", "cafe", "fast_food", "food_court"}:
        return "food", 52, str(amenity).replace("_", " ").title()
    tourism = tags.get("tourism")
    if tourism in {"hotel", "guest_house", "hostel", "motel"}:
        return "hotel", 68 if tourism == "hotel" else 56, str(tourism).replace("_", " ").title()
    leisure = tags.get("leisure")
    if leisure in {"park", "garden", "nature_reserve", "playground"}:
        return "park", 76 if leisure in {"park", "nature_reserve"} else 62, str(leisure).replace("_", " ").title()
    if leisure in {"stadium", "sports_centre", "fitness_centre", "pitch"}:
        priority = 88 if leisure == "stadium" else 64
        return "sports", priority, str(leisure).replace("_", " ").title()
    if tags.get("shop"):
        shop = str(tags["shop"])
        priority = 72 if shop in {"mall", "department_store", "supermarket"} else 46
        return "shopping", priority, shop.replace("_", " ").title()
    if tags.get("office") == "government":
        return "government", 72, "Government office"
    if tags.get("office"):
        return "building", 44, "Office"
    if tags.get("aeroway") in {"terminal", "aerodrome"}:
        return "transit", 92, str(tags["aeroway"]).title()
    if tags.get("man_made") in {"tower", "water_tower"}:
        return "landmark", 62, str(tags["man_made"]).replace("_", " ").title()
    if tags.get("building") and tags.get("building") not in {"yes", "house", "residential"}:
        return "building", 48, str(tags["building"]).replace("_", " ").title()
    return None


def _local_xy(x: float, y: float, origin: tuple[float, float]) -> tuple[float, float]:
    return x - origin[0], origin[1] - y


def _declutter_labels(labels: list[dict[str, Any]], minimum_distance: float = 45) -> list[dict]:
    selected: list[dict[str, Any]] = []
    seen: set[tuple[str, int, int]] = set()
    category_counts: Counter[str] = Counter()
    category_limits = {
        "district": 25,
        "road": 30,
        "transit": 20,
        "landmark": 30,
        "education": 40,
        "healthcare": 35,
        "worship": 35,
        "government": 30,
        "shopping": 45,
        "food": 35,
        "hotel": 25,
        "park": 30,
        "sports": 25,
        "building": 45,
    }
    for label in sorted(labels, key=lambda item: (-item["priority"], item["name"])):
        key = (
            label["name"].casefold(),
            round(label["x"] / 200),
            round(label["z"] / 200),
        )
        category = label["category"]
        if key in seen or category_counts[category] >= category_limits.get(category, 5):
            continue
        if any(
            label["category"] == other["category"]
            and label["priority"] < 85
            and other["priority"] < 85
            and
            (label["x"] - other["x"]) ** 2 + (label["z"] - other["z"]) ** 2
            < minimum_distance**2
            for other in selected
        ):
            continue
        selected.append(label)
        seen.add(key)
        category_counts[category] += 1
    return selected


def _element_point(element: dict[str, Any], projector: Transformer) -> Point | None:
    if element.get("type") == "node" and "lon" in element and "lat" in element:
        x, y = projector.transform(element["lon"], element["lat"])
        return Point(x, y)
    center = element.get("center")
    if center and "lon" in center and "lat" in center:
        x, y = projector.transform(center["lon"], center["lat"])
        return Point(x, y)
    coordinates = [
        projector.transform(point["lon"], point["lat"])
        for point in element.get("geometry", [])
        if "lon" in point and "lat" in point
    ]
    if len(coordinates) >= 4 and coordinates[0] == coordinates[-1]:
        return Polygon(coordinates).representative_point()
    if len(coordinates) >= 2:
        return LineString(coordinates).interpolate(0.5, normalized=True)
    return None


def _overture_release(buildings_path: Path) -> str:
    state_path = Path(f"{buildings_path}.state")
    if not state_path.exists():
        return "unknown"
    try:
        return str(json.loads(state_path.read_text()).get("last_release", "unknown"))
    except (json.JSONDecodeError, OSError):
        return "unknown"


def export_urban_context(
    buildings_path: Path,
    osm_path: Path,
    scenario_path: Path,
    output_dir: Path,
) -> dict[str, Any]:
    scenario = json.loads(scenario_path.read_text())
    bounds = scenario["grid"]["bounds"]
    origin = ((bounds[0] + bounds[2]) / 2, (bounds[1] + bounds[3]) / 2)
    clip = box(*bounds)
    projector = _projector()

    building_data = json.loads(buildings_path.read_text())
    building_coordinates: list[float] = []
    building_index: list[int] = []
    heights: list[float] = []
    measured_height: list[int] = []
    source_ids: list[int] = []
    source_counts: Counter[str] = Counter()
    for feature in building_data.get("features", []):
        properties = feature.get("properties") or {}
        projected = transform(projector.transform, shape(feature["geometry"]))
        clipped = projected.intersection(clip)
        for polygon in _polygons(clipped):
            polygon = polygon.simplify(0.8, preserve_topology=True)
            if polygon.area < 12:
                continue
            coordinates = list(polygon.exterior.coords)[:-1]
            if len(coordinates) < 3:
                continue
            offset = len(building_coordinates) // 2
            for x, y in coordinates:
                local_x, local_z = _local_xy(x, y, origin)
                building_coordinates.extend((local_x, local_z))
            building_index.extend((offset, len(coordinates)))
            height, is_measured = _building_height(properties)
            heights.append(height)
            measured_height.append(int(is_measured))
            source_id, source_name = _source_id(properties)
            source_ids.append(source_id)
            source_counts[source_name] += 1

    osm = json.loads(osm_path.read_text())
    line_coordinates: list[float] = []
    line_index: list[int] = []
    line_names: list[str] = []
    label_candidates: list[dict[str, Any]] = []
    named_roads: set[str] = set()
    for element in osm.get("elements", []):
        tags = element.get("tags") or {}
        display_name = tags.get("name:en") or tags.get("name")
        if display_name:
            category = _label_category(tags)
            if category:
                point = _element_point(element, projector)
                if point and clip.covers(point):
                    local_x, local_z = _local_xy(point.x, point.y, origin)
                    label_candidates.append(
                        {
                            "name": str(display_name),
                            "category": category[0],
                            "priority": category[1],
                            "kind": category[2],
                            "x": round(local_x, 2),
                            "z": round(local_z, 2),
                        }
                    )
        if element.get("type") == "node":
            continue
        if element.get("type") != "way" or len(element.get("geometry", [])) < 2:
            continue
        class_id = _line_class(tags)
        if class_id is None:
            continue
        coordinates = [(point["lon"], point["lat"]) for point in element["geometry"]]
        projected = transform(projector.transform, LineString(coordinates)).intersection(clip)
        pieces = _lines(projected)
        name = tags.get("name:en") or tags.get("name") or ""
        for line in pieces:
            line = line.simplify(0.8)
            if line.length < 3:
                continue
            points = list(line.coords)
            offset = len(line_coordinates) // 2
            for x, y in points:
                local_x, local_z = _local_xy(x, y, origin)
                line_coordinates.extend((local_x, local_z))
            line_index.extend((offset, len(points), class_id))
            line_names.append(str(name))
        if name and class_id <= 3 and name.casefold() not in named_roads and pieces:
            midpoint = max(pieces, key=lambda part: part.length).interpolate(0.5, normalized=True)
            local_x, local_z = _local_xy(midpoint.x, midpoint.y, origin)
            label_candidates.append(
                {
                    "name": name,
                    "category": "road",
                    "priority": 76 - class_id * 7,
                    "kind": "Major road",
                    "x": round(local_x, 2),
                    "z": round(local_z, 2),
                }
            )
            named_roads.add(name.casefold())

    output_dir.mkdir(parents=True, exist_ok=True)
    write_float32(output_dir / "buildings.xy.f32", np.asarray(building_coordinates))
    write_uint32(output_dir / "buildings.index.u32", np.asarray(building_index))
    write_float32(output_dir / "buildings.height.f32", np.asarray(heights))
    write_uint8(output_dir / "buildings.height-source.u8", np.asarray(measured_height))
    write_uint8(output_dir / "buildings.source.u8", np.asarray(source_ids))
    write_float32(output_dir / "network.xy.f32", np.asarray(line_coordinates))
    write_uint32(output_dir / "network.index.u32", np.asarray(line_index))
    (output_dir / "network.names.json").write_text(
        json.dumps(line_names, ensure_ascii=False) + "\n"
    )

    measured_count = sum(measured_height)
    selected_labels = _declutter_labels(label_candidates)
    payload = {
        "schemaVersion": 3,
        "crs": scenario["grid"]["crs"],
        "origin": {"easting": origin[0], "northing": origin[1]},
        "buildings": {
            "count": len(heights),
            "coordinateFile": "buildings.xy.f32",
            "indexFile": "buildings.index.u32",
            "heightFile": "buildings.height.f32",
            "heightSourceFile": "buildings.height-source.u8",
            "sourceFile": "buildings.source.u8",
            "sourceCounts": dict(sorted(source_counts.items())),
            "measuredOrTaggedHeightCount": measured_count,
            "inferredHeightCount": len(heights) - measured_count,
            "inferredHeightMetres": 8,
        },
        "network": {
            "count": len(line_index) // 3,
            "coordinateFile": "network.xy.f32",
            "indexFile": "network.index.u32",
            "nameFile": "network.names.json",
            "classes": LINE_CLASSES,
        },
        "labels": selected_labels,
        "labelCounts": dict(sorted(Counter(label["category"] for label in selected_labels).items())),
        "provenance": {
            "overtureRelease": _overture_release(buildings_path),
            "osmTimestamp": osm.get("osm3s", {}).get("timestamp_osm_base"),
            "buildingThemeLicense": "ODbL-1.0",
            "buildingSources": [
                "OpenStreetMap contributors",
                "Google Open Buildings",
                "Microsoft Global ML Building Footprints",
                "Overture Maps Foundation",
            ],
            "networkSource": "OpenStreetMap contributors",
            "networkLicense": "ODbL-1.0",
            "warning": (
                "Building footprints are public map/ML observations. Most extrusion heights are "
                "an explicit 8 m visual proxy and are not surveyed building heights."
            ),
        },
    }
    (output_dir / "context.json").write_text(json.dumps(payload, indent=2) + "\n")
    return payload


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--buildings", type=Path, required=True)
    parser.add_argument("--osm", type=Path, required=True)
    parser.add_argument("--scenario", type=Path, required=True)
    parser.add_argument("--output", type=Path, required=True)
    return parser.parse_args()


def main() -> None:
    args = parse_args()
    payload = export_urban_context(args.buildings, args.osm, args.scenario, args.output)
    print(json.dumps(payload, indent=2))


if __name__ == "__main__":
    main()
