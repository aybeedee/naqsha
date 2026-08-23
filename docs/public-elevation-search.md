# Public local-elevation search: central Lahore

Search completed on 2026-08-23. No downloadable local LiDAR point cloud,
drone-derived DTM, road-level survey, civil contour set, or RTK/GNSS control
network was found for the candidate area.

## Places checked

- The [Punjab PULSE ArcGIS directory](https://gismaps.pulse.gop.pk/arcgis/rest/services/)
  exposes folders named `Drone_Mapping`, `Raster_Services`, `WASA`, and
  `3D_Services`, but the drone service requires an ArcGIS login. The public
  [Lahore folder](https://gismaps.pulse.gop.pk/arcgis/rest/services/Lahore)
  contains cadastral/property rasters rather than a downloadable terrain model.
- The [Survey of Pakistan 2026–2030 strategy](https://www.surveyofpakistan.gov.pk/Detail/ZmU3MTg4NWYtNGRlYy00M2UyLWJkOTMtNDNhOTAwMDQ1Yjli)
  lists LiDAR/drone 3D models for Lahore and 5–10 cm DEM modernization as
  future actions. It does not expose a current Lahore point cloud or DTM.
- Searches of established open-data catalogues and research repositories found
  global 30 m products and papers using them, but no local downloadable survey.
  A separate open-source [Lahore digital twin](https://github.com/siddiqss/lahore-digital-twin)
  reached the same practical limitation for flood modelling.

Absence from this search is not proof that no government, university, or
consultant dataset exists. It means no suitably licensed, downloadable source
was found for a reproducible open MVP.

## Public source retained: ICESat-2 ATL08

[NASA states that ICESat-2 data are free and public](https://icesat-2.gsfc.nasa.gov/icesat-2-data),
and [OpenAltimetry](https://nsidc.org/data/user-resources/help-center/how-use-openaltimetry-icesat-2-data-products)
provides browser/API access. NASA's dated orbit archive and the API confirm
that reference ground track 1133 crossed Lahore on 2025-08-28. Two beams enter
the central candidate.

The versioned audit retrieves the ATL08 CSV and applies the AOI and reported
uncertainty filters:

| Measure | Result |
|---|---:|
| Finite API ground estimates in query envelope | 229 |
| Estimates inside candidate | 26 |
| Reported uncertainty ≤1 m | 1 |
| Reported uncertainty ≤2 m | 4 |
| Reported uncertainty ≤5 m | 8 |
| Retained beams | 2 |

ATL08 ground/canopy values are produced over 100 m land segments. They are not
road shots, and urban roofs, trees, and classification errors can contaminate
them. The height field used here is ellipsoidal, whereas the three raster DEMs
use geoid-based vertical references. The audit therefore removes each DEM's
median vertical offset before reporting descriptive residuals.

## Decision

The pass fails the local-terrain validation gate: four points at ≤2 m reported
uncertainty, from one nearly collinear overpass, cannot validate a 16.83 km²
two-dimensional hydraulic surface. Even the liberal ≤5 m set contains only
eight points. Its centered residuals must not be used to rank the DEMs.

We will retain ICESat-2 as sparse independent context and proceed with the
explicitly experimental three-terrain hydraulic ensemble. Outputs must carry
this guardrail:

> Experimental screening result. Terrain-source disagreement dominates the
> model. Do not interpret mapped cells as authoritative street or property
> flood depths.

The next material accuracy upgrade remains local bare-earth elevation plus
distributed road/drain invert controls and observed flooded/non-flooded event
data.
