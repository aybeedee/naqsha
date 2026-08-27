"""Download a reproducible OSM transport and named-place extract from Overpass."""

from __future__ import annotations

import argparse
import json
import urllib.parse
import urllib.request
from pathlib import Path

OVERPASS_URL = "https://overpass-api.de/api/interpreter"
NETWORK_SELECTORS = (
    "way[highway]",
    "way[railway]",
    "way[waterway]",
    "way[natural=water]",
    "way[leisure=park]",
)
NAMED_PLACE_KEYS = (
    "place",
    "amenity",
    "tourism",
    "historic",
    "shop",
    "leisure",
    "office",
    "building",
    "public_transport",
    "railway",
    "aeroway",
    "man_made",
)


def overpass_queries(bbox: tuple[float, float, float, float]) -> tuple[str, str]:
    west, south, east, north = bbox
    if not (-180 <= west < east <= 180 and -90 <= south < north <= 90):
        raise ValueError("bbox must be WEST,SOUTH,EAST,NORTH")
    overpass_bbox = f"{south},{west},{north},{east}"
    network_selectors = [f"{selector}({overpass_bbox});" for selector in NETWORK_SELECTORS]
    place_selectors = [
        f'nwr["name"]["{key}"]({overpass_bbox});' for key in NAMED_PLACE_KEYS
    ]
    return (
        f'[out:json][timeout:120];({"".join(network_selectors)});out geom;',
        f'[out:json][timeout:120];({"".join(place_selectors)});out center;',
    )


def overpass_query(bbox: tuple[float, float, float, float]) -> str:
    """Return both query parts for diagnostics and backwards-compatible tests."""
    return "\n".join(overpass_queries(bbox))


def _request_overpass(query: str, timeout_seconds: int) -> dict:
    body = urllib.parse.urlencode({"data": query}).encode()
    request = urllib.request.Request(
        OVERPASS_URL,
        data=body,
        headers={
            "Content-Type": "application/x-www-form-urlencoded",
            "User-Agent": "naqsha-urban-context/0.1",
        },
    )
    with urllib.request.urlopen(request, timeout=timeout_seconds) as response:
        return json.load(response)


def download_osm_context(
    bbox: tuple[float, float, float, float],
    output_path: Path,
    timeout_seconds: int = 240,
) -> dict:
    network, places = (
        _request_overpass(query, timeout_seconds) for query in overpass_queries(bbox)
    )
    # Prefer the network copy where an element appears in both responses because
    # it carries complete geometry rather than only a centre point.
    elements = {
        (element["type"], element["id"]): element
        for element in places.get("elements", [])
    }
    elements.update(
        {
            (element["type"], element["id"]): element
            for element in network.get("elements", [])
        }
    )
    payload = {
        **network,
        "osm3s": places.get("osm3s") or network.get("osm3s"),
        "elements": list(elements.values()),
    }
    output_path.parent.mkdir(parents=True, exist_ok=True)
    output_path.write_text(json.dumps(payload, ensure_ascii=False) + "\n")
    return payload


def _bbox(value: str) -> tuple[float, float, float, float]:
    try:
        values = tuple(float(part) for part in value.split(","))
    except ValueError as error:
        raise argparse.ArgumentTypeError("bbox must be WEST,SOUTH,EAST,NORTH") from error
    if len(values) != 4:
        raise argparse.ArgumentTypeError("bbox must be WEST,SOUTH,EAST,NORTH")
    return values  # type: ignore[return-value]


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--bbox", type=_bbox, required=True)
    parser.add_argument("--output", type=Path, required=True)
    return parser.parse_args()


def main() -> None:
    args = parse_args()
    payload = download_osm_context(args.bbox, args.output)
    print(
        json.dumps(
            {
                "output": str(args.output),
                "elements": len(payload.get("elements", [])),
                "timestamp": payload.get("osm3s", {}).get("timestamp_osm_base"),
            },
            indent=2,
        )
    )


if __name__ == "__main__":
    main()
