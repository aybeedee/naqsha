# Architecture decision record: data-first vertical slice

## Decision

Start with a reproducible terrain audit, then add hydraulics, scenario
precomputation, and finally the interactive 3D client.

The production shape is expected to be:

```text
open geodata -> versioned ETL -> hydraulic model -> scenario cube
                                                   |
                                      object storage / tile API
                                                   |
                                         Cesium web client
```

## Why terrain comes first

Lahore is flat and urban flood routing is controlled by small elevation
differences. Global terrain products can support a screening model, but their
nominal cell size and vertical uncertainty do not justify street- or
property-level depth claims. The terrain audit is a release gate, not merely
data preparation.

## Intended modelling boundary

- Surface/pluvial flooding over one 5–25 km² pilot.
- Rainfall is represented by total, duration, and temporal profile.
- Unknown underground drainage is represented by explicit sensitivity cases,
  not an invented network.
- SFINCS is the planned primary solver; precomputed results provide instant UI
  response.
- Predefined surface and pump interventions are precomputed for the MVP.

## Provenance rules

Every derived artifact must include:

- source URL and product name;
- retrieval or processing timestamp;
- source and output CRS;
- source and output cell size;
- processing parameters;
- a warning when output resolution exceeds evidence resolution.

