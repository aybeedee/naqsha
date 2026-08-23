# Central Lahore urban context

## Decision

Use a frozen, local vector extract instead of a live third-party basemap for
the first recognizable city view. The 4 × 4 km AOI is small enough to deliver
the processed context in about 1.2 MB and the viewer remains usable offline.

The extract combines:

- **Overture Buildings** for footprint completeness: 19,329 clipped features;
- **OpenStreetMap** for 3,914 road, rail, waterway, and park-boundary segments;
- **OpenStreetMap names** for a decluttered set of districts, stations, roads,
  civic sites, and landmarks.

Only 27 buildings have a tagged height or floor count. The other 19,302 are
extruded to a uniform 8 m for visual separation. This is a declared rendering
proxy, not a claim about the Lahore skyline. The Overture building theme also
contains ML-derived roofprints; false positives, omissions, and outdated
features remain possible.

## Reproduce the extract

Install the optional official Overture downloader, download the raw sources,
then export the browser assets:

```bash
make urban-context-install
make urban-context-download
make urban-context-export-local
```

Raw source downloads are ignored under `data/raw/urban-context/`. The exporter
projects the source geometry into UTM zone 43N, clips it to the hydraulic grid,
simplifies outlines by 0.8 m, selects labels, and writes little-endian binary
arrays plus `context.json`.

## Interpretation boundary

The city layer makes the model geographically legible; it does not improve the
hydraulics by itself. Buildings are currently visual objects only. Their
footprints are not yet burned into the SFINCS obstacle grid, road crowns and
kerbs are not resolved, and the drainage network remains unknown.

Context data assets carry their own [ODbL notice](../web/public/context/central-lahore/LICENSE.md).
