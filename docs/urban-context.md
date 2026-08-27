# Lahore urban context

## Decision

Use a frozen, local vector extract instead of a live third-party basemap for
the first recognizable city view. The 4 × 4 km AOI is small enough to deliver
each processed context in about 1.3–1.5 MB while the viewer remains usable
offline.

The central extract combines:

- **Overture Buildings** for footprint completeness: 19,329 clipped features;
- **OpenStreetMap** for 3,918 road, rail, waterway, and park-boundary segments;
- **OpenStreetMap names** for 407 retained map labels spanning districts,
  roads, transit, landmarks, education, healthcare, worship, government,
  shopping, food, hotels, parks, sports, and named buildings.

Only 27 buildings have a tagged height or floor count. The other 19,302 are
extruded to a uniform 8 m for visual separation. This is a declared rendering
proxy, not a claim about the Lahore skyline. The Overture building theme also
contains ML-derived roofprints; false positives, omissions, and outdated
features remain possible.

The Gulberg–Liberty expansion extract adds 24,332 footprints, 2,529 network
segments, and 339 retained map labels.
Of those buildings, 622 have a tagged height/floor-derived height and
23,710 use the same 8 m visual proxy. Both contexts now retain a per-segment OSM
name array so hydraulic exposure can be aggregated into named-road rankings.

## Reproduce the extract

Install the optional official Overture downloader, download the raw sources,
then export the browser assets:

```bash
make urban-context-install
make urban-context-download
make urban-context-export-local

make urban-context-gulberg-download
make urban-context-gulberg-export-local
```

Raw source downloads are ignored under `data/raw/urban-context/`. The exporter
projects the source geometry into UTM zone 43N, clips it to the hydraulic grid,
simplifies outlines by 0.8 m, and accepts OSM labels represented as nodes, ways,
or relations. The browser receives category, subtype, priority, and coordinates
for each retained label plus little-endian geometry arrays and `context.json`.

The OSM-only extracts can be refreshed without redownloading Overture buildings:

```bash
make osm-context-central-download
make osm-context-gulberg-download
```

## Interpretation boundary

The city layer makes the model geographically legible; it does not improve the
hydraulics by itself. Buildings are currently visual objects only. Their
footprints are not yet burned into the SFINCS obstacle grid, road crowns and
kerbs are not resolved, and the drainage network remains unknown.

Context data assets carry their own [ODbL notice](../web/public/context/central-lahore/LICENSE.md).
