# Terrain conditioning comparison: provisional pilot

On 2026-08-23, the terrain pipeline compared Copernicus GLO-30 against FABDEM
v1.2 over the same 18.57 km² grid. FABDEM derives from Copernicus but applies
machine-learned removal of building and forest height biases, so this measures
conditioning sensitivity rather than independent measurement error.

## Results

| Metric | Result |
|---|---:|
| Valid overlapping cells | 22,560 |
| Mean FABDEM − Copernicus | −2.39 m |
| Median FABDEM − Copernicus | −2.25 m |
| Elevation RMSE | 2.90 m |
| 95th-percentile absolute difference | 5.23 m |
| Maximum absolute difference | 19.90 m |
| Elevation correlation | 0.598 |
| Median derived flow-direction difference | 73.6° |
| 95th-percentile flow-direction difference | 170.0° |
| Cells with a flow-direction change over 45° | 65.9% |

## Release-gate decision

The disagreement is material: terrain conditioning changes the inferred
direction of descent by more than 45° across roughly two-thirds of cells. A
single surface cannot support authoritative street-level flood routing.

Before hydraulic depths are exposed to users, the project must:

1. add a separate SRTM-family surface;
2. test whether broad depression/hotspot rankings persist across all surfaces;
3. reconstruct historical floods and measure discrimination of observed
   flooded versus non-flooded locations;
4. show terrain-induced uncertainty directly in any prototype output.

FABDEM is licensed under the Non-Commercial Government Licence v2.0 and is an
evaluation input only unless the deployment remains compatible or obtains
other terms.
