from pathlib import Path

import numpy as np
import pytest

from naqsha.hydraulic_results import (
    analysis_mask,
    ensemble_statistics,
    read_active_binary_grid,
    read_active_binary_records,
    read_ascii_grid,
)


def test_read_ascii_grid_restores_north_up_order(tmp_path: Path):
    source = tmp_path / "result.asc"
    source.write_text("3 4\n1 2\n")
    assert read_ascii_grid(source, (2, 2)).tolist() == [[1, 2], [3, 4]]


def test_read_active_binary_grid_uses_sfincs_column_major_indexing(tmp_path: Path):
    source = tmp_path / "zsmax.dat"
    values = np.array([10, 20, 30], dtype="<f4")
    marker = (values.nbytes).to_bytes(4, byteorder="little", signed=True)
    source.write_bytes(marker + values.tobytes() + marker)
    mask = np.array([[1, 0], [1, 1]], dtype="uint8")
    result = read_active_binary_grid(source, mask)
    assert result[0, 0] == 10
    assert result[1, 0] == 20
    assert result[1, 1] == 30
    assert np.isnan(result[0, 1])


def test_read_active_binary_records_supports_float64_timelines(tmp_path: Path):
    source = tmp_path / "zs.dat"
    first = np.array([10, 20, 30], dtype="<f8")
    second = np.array([11, 21, 31], dtype="<f8")
    marker = first.nbytes.to_bytes(4, byteorder="little", signed=True)
    source.write_bytes(marker + first.tobytes() + marker + marker + second.tobytes() + marker)
    mask = np.array([[1, 0], [1, 1]], dtype="uint8")
    result = read_active_binary_records(source, mask, dtype="<f8")
    assert result.shape == (2, 2, 2)
    assert result[:, 1, 1].tolist() == [30, 31]
    assert np.all(np.isnan(result[:, 0, 1]))


def test_analysis_mask_excludes_outflow_buffer():
    active = np.ones((7, 7), dtype=bool)
    mask = np.ones((7, 7), dtype="uint8")
    mask[[0, -1], :] = 3
    mask[:, [0, -1]] = 3
    analysed = analysis_mask(active, mask, edge_buffer_cells=1)
    assert np.sum(analysed) == 9


def test_ensemble_statistics_quantifies_terrain_control():
    valid = np.ones((2, 3), dtype=bool)
    depths = {
        "a": np.array([[0.2, 0.2, 0], [0, 0, 0]], dtype="float32"),
        "b": np.array([[0.2, 0, 0], [0, 0, 0]], dtype="float32"),
        "c": np.array([[0.2, 0, 0], [0, 0, 0]], dtype="float32"),
    }
    metrics, depth_range, agreement = ensemble_statistics(depths, valid, 100)
    assert metrics.all_member_wet_jaccard == pytest.approx(0.5)
    assert metrics.terrain_sensitive_wet_fraction == pytest.approx(0.5)
    assert depth_range[0, 1] == pytest.approx(0.2)
    assert agreement[0, 0] == 3
