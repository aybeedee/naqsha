import numpy as np

from naqsha.road_impact import NODATA_COUNT, NODATA_DEPTH, road_impacts


def test_road_impacts_samples_depth_and_member_agreement():
    # Three members, two frames, and a 2 × 2 north-up/local-coordinate grid.
    timelines = np.array(
        [
            [[0, 0, 0, 0], [0, 120, 0, 0]],
            [[0, 0, 0, 0], [0, 160, 0, 0]],
            [[0, 0, 0, 0], [0, 80, 0, 0]],
        ],
        dtype="uint16",
    )
    coordinates = np.array([[-15, -15], [15, -15], [-15, 15], [15, 15]], dtype="float32")
    network_index = np.array([[0, 2, 1], [2, 2, 8]], dtype="uint32")
    depths, agreement, lengths = road_impacts(
        timelines,
        np.ones(4, dtype=bool),
        coordinates,
        network_index,
        width=2,
        height=2,
        cell_size=30,
    )
    assert depths[:, 0].tolist() == [0, 120]
    assert agreement[:, 0].tolist() == [0, 2]
    assert lengths.tolist() == [30, 30]
    assert depths[:, 1].tolist() == [NODATA_DEPTH, NODATA_DEPTH]
    assert agreement[:, 1].tolist() == [NODATA_COUNT, NODATA_COUNT]


def test_road_impacts_rejects_mismatched_grid():
    with np.testing.assert_raises(ValueError):
        road_impacts(
            np.zeros((3, 2, 5), dtype="uint16"),
            np.ones(4, dtype=bool),
            np.zeros((2, 2), dtype="float32"),
            np.array([[0, 2, 1]], dtype="uint32"),
            width=2,
            height=2,
            cell_size=30,
        )
