# Forecast forcing and transport-impact screening

## Forecast decision

Use an archived ensemble forecast as the machine-readable bridge between
weather prediction and SFINCS. `naqsha.forecast` currently requests hourly
precipitation from the Open-Meteo Ensemble API using ECMWF IFS 0.25° members.
It preserves the provider request, requested and model-grid coordinates,
retrieval and validity times, member count, and totals.

The p10, p50, and p90 profiles are complete trajectories from real ensemble
members nearest the requested whole-event quantiles. They are not assembled by
mixing independent hourly percentiles, which could create a physically
incoherent storm. Hourly depths are converted to a piecewise-constant SFINCS
precipitation rate series and the model clock is anchored to the forecast valid
time.

The global weather grid is much coarser than either Lahore study area and may
miss or smooth monsoon convection. Forecast hydraulic outputs must therefore be
read as uncertainty scenarios. PMD products and local gauges/radar should
replace or bias-correct this input when a stable machine-readable feed becomes
available.

## Road and neighbourhood impacts

For every frame and OSM road segment, the pipeline samples all intersected
hydraulic cells at half-cell spacing. It stores:

- the maximum ensemble-median depth encountered along the segment;
- how many terrain members exceed 10 cm somewhere along it;
- exposed segment length and peak values.

The viewer aggregates named segments and ranks them by maximum sampled depth,
then exposed length. It also summarizes the maximum depth and fraction of wet
cells within 250 m of each mapped district label. These are useful for scenario
triage and field-validation planning, but the 28.65–28.66 m grid cannot resolve
lanes, kerbs, flyover decks, underpasses, or passable road width. A highlighted
road is not necessarily closed, and an unhighlighted route is not necessarily
safe.

## Operational sequence

```bash
make forecast-central-local
make forecast-hydraulic-build-local FORECAST_PROFILE=p90
make forecast-hydraulic-run FORECAST_PROFILE=p90
make forecast-hydraulic-results-local FORECAST_PROFILE=p90
```

Before publishing an operational forecast, add automated expiry checks,
scheduled refresh, solver failure alerts, gauge comparison, and a policy for
withholding maps when rainfall or terrain uncertainty is too high.
