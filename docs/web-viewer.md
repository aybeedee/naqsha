# Lahore flood explorer

The viewer presents an experimental flood scenario in Central Lahore and
Gulberg–Liberty. Both areas have a precomputed example storm: 100 mm over two
hours, then two hours without rain. It does not fetch live weather or run a
solver in the browser.

The combined result uses FABDEM for the visible ground and the median of
three terrain-model depths at each cell and time. Buildings use public
footprints and estimated heights where measurements are missing. They are
not hydraulic obstacles.

## Using the explorer

The dark map opens full-width; panels stay closed until needed. **Water** and
**Places** on the map toggle those layers without opening settings.

- **Storm** explains the rainfall and shows flooded area, flagged road segments
  and the wet fraction within 250 m of neighbourhood labels.
- **Roads** ranks named roads by their highest sampled depth. Selecting a road
  focuses on one of its flagged segments and highlights its mapped geometry.
  Counts are whole flagged segments, not measured flooded length.
- **Layers** contains the water threshold, city layers, agreement view and
  individual terrain models. The same threshold applies to displayed water,
  road flags, area totals and neighbourhood summaries.
- Search finds local places, supplied Urdu/alternate names and named roads. Separate
  branches of the same business remain searchable. Arrow keys and Enter select a
  result. `/` focuses search; Space plays or pauses outside form controls.
- Clicking a label or its dot inspects that named place; clicking bare ground shows
  a cell estimate and optional model comparison.
  Unavailable cells are distinguished from dry cells. Search results can lie
  outside the analysed hydraulic mask and must not be reported as dry.
- Drag to pan in both views. Right-drag orbits in 3D. Search and zoom controls
  move the camera smoothly unless reduced motion is requested. North rotates the
  map back; the compass follows the current bearing. The scale bar is approximate
  at the centre of the view, not everywhere in an oblique perspective.
- 2D creates a flat, north-up map. Water height exaggeration only changes the drawing.
- Playback uses 25 saved solver frames, stops at the end, and can be replayed.
  The rain band separates rainfall from the later recession period.
- **Whole event** takes the maximum of each cell's saved depth sequence. For
  the combined view this is the peak of the instantaneous medians, matching
  the road export, rather than the median of independent model peaks. Those
  quantities differ when terrain models peak at different times. Individual
  solver maxima remain available in the location comparison; they can exceed
  the sampled maxima between saved frames. Peaks are not simultaneous.
- **Model agreement** counts terrain models exceeding 10 cm in their solver
  event maxima. Coral represents one, amber two and green three. Agreement is
  consistency, not probability or validation. FABDEM and Copernicus are
  related products. Individual terrain views do not show combined road flags.
- **Share view** copies the area, frame, dimension, result and threshold in the
  URL. It does not save camera position or layer visibility.
- Phones retain area selection, search, road results, legend and timeline.
  The three panels open over the map as needed.
- **About** explains the model, missing drainage, forecast limitations and
  interpretation. Archived forecast metadata appears when present; expired
  forecasts are marked. The checked-in examples are synthetic storms.

## Rendering

Water has a fixed colour scale at 0, 0.3, 1 and 2 m; its colour does not change
meaning with the maximum depth of a frame. The displayed mesh is clipped at
the threshold, rather than colouring an entire triangle when only one vertex
is wet. This is visual interpolation of the coarse grid, not additional
hydraulic resolution. Flood geometry includes perimeter walls and a subtle edge
following that same clipped surface. No waves or flow vectors are invented.

Buildings have distinct roofs, darker walls, footprint-following roof outlines and
soft directional shadows. Heights and footprints have not changed. Shadows are a
visual depth cue, not a sun-position or surveyed-height calculation. Roads have
dark casings and a hierarchy of widths/colours. Mapped park and permanent-water
polygons retain inner rings and are draped over the visual terrain. None of these
visual improvements alter the hydraulic grids or road samples.

Buildings, streets, labels, road overlays and water have separate lifecycles.
Changing a frame rebuilds water and enabled road overlays, leaving static
geometry intact. Labels use one screen-space canvas instead of one GPU sprite per
place. Frames are drawn on demand, including
camera damping; an idle map does not continuously redraw. Geometry and GPU
resources are disposed on area changes and unmount.

There are 1,127 Central Lahore and 1,057 Gulberg–Liberty labels from the existing
public extracts. The exporter no longer drops nearby businesses or imposes category
quotas. The map repeats road names along real street segments; text rotates with
the streets. Small place labels try four positions, avoid actual UI bounds and
other names, and leave hoverable/clickable dots when text cannot fit. Names remain
available in search regardless of visibility. Not all 2,184 names can be readable
at once, and unnamed buildings are not given fabricated labels.

Basemap requests have timeouts and are cancelled when disabled.
Missing tiles preserve the local map; graphics failures preserve the readable
summaries. The graphics module loads separately from the interface.

## Browser data contract

`python -m naqsha.web_export` writes a versioned `scenario.json` and little-
endian, row-major grids:

| Asset | Encoding | Meaning |
| --- | --- | --- |
| `terrain-<member>.f32` | float32 metres | Model elevations |
| `depth-<member>.f32` | float32 metres | Solver maximum depths |
| `timeline-depth-<member>.u16` | uint16 millimetres | Instantaneous saved depths |
| `active.u8` | uint8 boolean | Common analysed cells |
| `wet-member-count.u8` | uint8 0–3; 255 nodata | Members exceeding 10 cm |
| `road-impact-depth.u16` | uint16 millimetres; 65535 nodata | Highest median sample per segment and frame |
| `road-impact-agreement.u8` | uint8 0–3; 255 nodata | Models exceeding 10 cm somewhere along a segment |

The manifest retains dimensions, CRS, transform, bounds, forcing, cadence,
scale, metrics and provenance. The context assets contain footprint rings,
height/source arrays, road geometry, names and prioritised labels. The loader
checks array dimensions and the scenario/context identity before showing
road results. A study area is roughly 5 MB, so no tile server is required.

## Basemap

The default template is `https://tile.openstreetmap.org/{z}/{x}/{y}.png`.
`VITE_OSM_TILE_URL` can replace it at build time. The viewer requests at most
36 tiles for the selected study area at one zoom, leaves browser HTTP caching
intact and displays attribution. The raster is muted into a night palette beneath
the foreground vectors. It does not download tiles for offline use
or redistribute them in the repository. See the [OSM tile usage policy](https://operations.osmfoundation.org/policies/tiles/).

Geographic bounds cover cell edges; texture coordinates account for terrain
vertices being cell centres. The projected-to-geographic drape is a bounded
local approximation. Disable **OpenStreetMap basemap** to use packaged data
alone. Building-source and OSM licence notes are in [urban context](urban-context.md).

## Run and verify

```bash
make web-install
make web-test
make web-build
make web-dev
```

Open `http://localhost:5174`. A container build is available through
`docker compose up --build viewer`. The production viewer is static; only
the optional basemap uses an external runtime service.

Tests cover data loading against both shipped areas, median/peak ordering,
threshold and nodata handling, search, shared links, playback, mobile control
availability, location inspection, geometry and rendering lifecycle. DOM
tests do not verify pixels, browser GPU drivers or responsive visual layout;
those require a real-browser review.
