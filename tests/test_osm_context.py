import pytest

from naqsha.osm_context import NAMED_PLACE_KEYS, overpass_queries


def test_overpass_query_includes_network_geometry_and_named_places():
    network_query, place_query = overpass_queries((74.3, 31.5, 74.4, 31.6))

    assert "way[highway](31.5,74.3,31.6,74.4)" in network_query
    assert network_query.endswith("out geom;")
    assert 'nwr["name"]["amenity"](31.5,74.3,31.6,74.4)' in place_query
    assert all(f'["{key}"]' in place_query for key in NAMED_PLACE_KEYS)
    assert place_query.endswith("out center;")


def test_overpass_query_rejects_reversed_bbox():
    with pytest.raises(ValueError, match="WEST,SOUTH,EAST,NORTH"):
        overpass_queries((74.4, 31.5, 74.3, 31.6))
