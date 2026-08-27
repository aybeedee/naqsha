# Experimental 3D viewer

## Purpose

The viewer is a communication and model-diagnostics slice, not a public flood
warning product. Its area catalog currently switches between central Lahore
and Gulberg–Liberty; direct links can use `?area=<area-id>`. Each area displays
the same precomputed synthetic storm. Its default **City** view combines a conditioned FABDEM ground
surface, a time-varying ensemble-median depth display, public building footprints,
the OSM street/infrastructure network, and recognizable place labels. A separate
peak-envelope mode retains the maximum-depth diagnostic.

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
- The flood timeline exposes 25 solver snapshots at 10-minute intervals. Play,
  pause, and scrub select actual instantaneous SFINCS output; they do not
  interpolate or synthesize water motion between frames.
- Peak envelope is the maximum reached at each cell, not a claim that every
  displayed cell peaks simultaneously.
- Agreement is fixed at the precomputed 10 cm threshold. The browser does not
  pretend it can recompute hydraulics from arbitrary rainfall inputs.
- Scenario forcing is shown read-only, with the experimental warning and
  evidence resolution always visible.
- Buildings, network, labels, and flood depth can be hidden independently.
- Map labels use category-specific markers, names, and subtypes. The checked
  contexts contain 407 central-Lahore and 339 Gulberg–Liberty labels. Runtime
  distance thresholds reveal more detail while zooming, and screen-space
  collision filtering preserves a readable overview.
- Road exposure colours and totals are computed for every hydraulic frame.
  Named-road rankings aggregate OSM segments, while district summaries sample
  a 250 m vicinity around map labels; neither is a safe-routing decision.
- The optional OSM Carto basemap loads only the displayed AOI at one zoom.
  Browser HTTP caching is respected; failure falls back to local vector data.
- Three-dimensional flood areas have raised surfaces and darker perimeter
  walls. Flood-height exaggeration is display-only, is disclosed in the
  viewport, and never changes stored depths.

Building footprints and streets are real public map features, but nearly all
building heights are an 8 m rendering proxy. Buildings are not yet hydraulic
obstacles. The current slice intentionally has no parcel lookup, live forecast,
known drainage network, surveyed kerbs, or authoritative imagery. Those
additions should follow terrain and drainage calibration rather than making the
experimental surface look more precise. Forecast metadata is displayed when a
scenario was generated from an archived ensemble forcing.

## Browser data contract

`python -m naqsha.web_export` writes a versioned `scenario.json` plus little-
endian row-major grid files:

| Asset | Encoding | Meaning |
| --- | --- | --- |
| `terrain-<member>.f32` | float32 metres | Model elevation for mesh vertices |
| `depth-<member>.f32` | float32 metres | Maximum simulated water depth |
| `timeline-depth-<member>.u16` | uint16 millimetres | 25 instantaneous depth frames |
| `active.u8` | uint8 boolean | Cells shared by all terrain realizations |
| `wet-member-count.u8` | uint8 0–3; 255 nodata | Members exceeding 10 cm |
| `road-impact-depth.u16` | uint16 millimetres | Median sampled road depth by frame |
| `road-impact-agreement.u8` | uint8 0–3; 255 nodata | Terrain members exceeding 10 cm on each road |

The manifest carries grid dimensions, CRS, affine transform, bounds, scenario
forcing, timeline cadence and scale, member metrics, warning text, and solver
provenance. The checked-in hydraulic scenario is about 3.6 MB, so a tile service
is unnecessary at this scale.

The parallel urban-context contract contains binary footprint rings, per-
building height/source arrays, network polylines with class/width/name metadata,
and prioritized map labels. Each context is about 1.3–1.5 MB. Its acquisition, interpretation limits,
and ODbL obligations are documented in [the urban-context decision](urban-context.md).

`grid.geographicBounds` georeferences the optional browser basemap to the UTM
terrain mesh. Rendered OSM tiles are not downloaded into or redistributed with
the repository.

## Live basemap policy

The default template is `https://tile.openstreetmap.org/{z}/{x}/{y}.png`. It
can be replaced at build time with `VITE_OSM_TILE_URL`; the URL is not used for
offline prefetching. The viewer requests at most 36 tiles for this fixed AOI
and one zoom, sends normal browser identification/referrer headers, leaves HTTP
caching intact, and keeps attribution visible. This follows the
[OpenStreetMap tile usage policy](https://operations.osmfoundation.org/policies/tiles/).

Enabling the layer contacts OpenStreetMap's tile service from the user's
browser. Disable **OSM basemap** to use only locally packaged context data.

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

Then open `http://localhost:5174`. The static image serves the same precomputed
assets through nginx; no Naqsha backend is required. Only the optional OSM
basemap uses an external runtime service.
