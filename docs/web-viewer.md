# Experimental 3D viewer

## Purpose

The viewer is a communication and model-diagnostics slice, not a public flood
warning product. It displays one precomputed synthetic storm over the central
Lahore candidate and makes terrain-source uncertainty the default view.

The default **Agreement** layer answers a narrow question: for each model cell,
how many of the Copernicus, FABDEM, and SRTM-family runs exceeded 10 cm maximum
depth? Coral cells occur in only one terrain realization, amber in two, and
teal in all three. A cell shown in one member is not a verified flooded place.

## Controls and guardrails

- Orbit, zoom, pan, and reset affect only the camera.
- Vertical exaggeration affects only rendering, never exported elevations or
  depths.
- The member-view depth slider hides values below a display threshold; it does
  not rerun or rescale the model.
- Agreement is fixed at the precomputed 10 cm threshold. The browser does not
  pretend it can recompute hydraulics from arbitrary rainfall inputs.
- Scenario forcing is shown read-only, with the experimental warning and
  evidence resolution always visible.

The current slice intentionally has no parcel lookup, street-level labels,
building extrusion, live forecast, drainage network, or authoritative basemap.
Those additions should follow terrain and drainage calibration rather than
making the experimental surface look more precise.

## Browser data contract

`python -m naqsha.web_export` writes a versioned `scenario.json` plus little-
endian row-major grid files:

| Asset | Encoding | Meaning |
| --- | --- | --- |
| `terrain-<member>.f32` | float32 metres | Model elevation for mesh vertices |
| `depth-<member>.f32` | float32 metres | Maximum simulated water depth |
| `active.u8` | uint8 boolean | Cells shared by all terrain realizations |
| `wet-member-count.u8` | uint8 0–3; 255 nodata | Members exceeding 10 cm |

The manifest carries grid dimensions, CRS, affine transform, bounds, scenario
forcing, member metrics, warning text, and solver provenance. The checked-in
scenario is about 0.6 MB, so a tile service is unnecessary at this scale.

## Run and verify

```bash
make web-install
make web-test
make web-build
make web-dev
```

For the containerized build:

```bash
docker compose up --build viewer
```

Then open `http://localhost:5173`. The static image serves the same precomputed
assets through nginx; no backend is required for this vertical slice.
