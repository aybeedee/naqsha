from pathlib import Path

import numpy as np

from naqsha.web_export import write_float32, write_uint8


def test_float32_web_asset_is_little_endian_row_major(tmp_path: Path):
    path = tmp_path / "grid.f32"
    write_float32(path, np.array([[1, 2], [3, 4]], dtype="float64"))
    decoded = np.frombuffer(path.read_bytes(), dtype="<f4")
    assert decoded.tolist() == [1, 2, 3, 4]


def test_uint8_web_asset_preserves_mask_values(tmp_path: Path):
    path = tmp_path / "mask.u8"
    write_uint8(path, np.array([[0, 1], [2, 255]], dtype="uint8"))
    assert list(path.read_bytes()) == [0, 1, 2, 255]
