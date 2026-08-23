# Baseline terrain audit: provisional Gulberg–Liberty pilot

The first live data run completed against the public Copernicus GLO-30 Cloud
Optimized GeoTIFF on 2026-08-23.

## Observed metrics

| Metric | Result |
|---|---:|
| AOI area | 18.57 km² |
| Output cell size after UTM reprojection | 28.65 m |
| Valid cells | 22,560 |
| Elevation range | 31.59 m |
| Elevation standard deviation | 2.05 m |
| Median derived slope | 3.066% |
| 95th-percentile derived slope | 8.487% |
| 95th-percentile 3×3-cell relief | 5.91 m |

## Interpretation

The clipped product and pipeline are operational, but the local relief signal
is much too large to interpret as street grading. The source is a digital
surface model, so buildings, vegetation, and radar artefacts affect routing.
This confirms that the raw product is suitable only for screening until:

1. it is compared against an independently processed terrain product;
2. surface-object conditioning is tested without creating false precision;
3. reconstructed historical events show stable hotspot rankings.

The next data milestone is therefore a multi-DEM comparison and uncertainty
surface, not a hydraulic depth map.

Source tile:
`Copernicus_DSM_COG_10_N31_00_E074_00_DEM` from the public Copernicus DEM AWS
bucket.
