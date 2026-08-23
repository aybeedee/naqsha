# Experimental 3D viewer

## Purpose

The viewer is a communication and model-diagnostics slice, not a public flood
warning product. It displays one precomputed synthetic storm over the central
Lahore candidate. Its default **City** view combines a conditioned FABDEM ground
surface, an ensemble-median maximum-depth display, public building footprints,
the OSM street/infrastructure network, and recognizable place labels.

The separate **Terrain agreement** layer answers a narrow question: for each model cell,
how many of the Copernicus, FABDEM, and SRTM-family runs exceeded 10 cm maximum
depth? Coral cells occur in only one terrain realization, amber in two, and
teal in all three. A cell shown in one member is not a verified flooded place.

## Controls and guardrails

- Orbit, zoom, pan, and reset affect only the camera.
- The 2D switch creates a flat, north-up map; 3D restores building extrusion
  and the ground surface at the selected vertical exaggeration.
- Vertical exaggeration affects only rendering, never exported elevations or
  depths.
- The member-view depth slider hides values below a display threshold; it does
  not rerun or rescale the model.
- Agreement is fixed at the precomputed 10 cm threshold. The browser does not
  pretend it can recompute hydraulics from arbitrary rainfall inputs.
- Scenario forcing is shown read-only, with the experimental warning and
  evidence resolution always visible.
- Buildings, network, labels, and flood depth can be hidden independently.

Building footprints and streets are real public map features, but nearly all
building heights are an 8 m rendering proxy. Buildings are not yet hydraulic
obstacles. The current slice intentionally has no parcel lookup, live forecast,
known drainage network, surveyed kerbs, or authoritative imagery. Those
additions should follow terrain and drainage calibration rather than making the
experimental surface look more precise.

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

The parallel urban-context contract contains binary footprint rings, per-
building height/source arrays, network polylines with class/width metadata, and
decluttered labels. It is about 1.2 MB. Its acquisition, interpretation limits,
and ODbL obligations are documented in [the urban-context decision](urban-context.md).

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
