# Naqsha — Devpost submission kit

## Project name

Naqsha

## Tagline

A forecast-ready 3D urban flood twin that turns rainfall uncertainty into neighbourhood and road-impact screening for Lahore.

## One-line pitch

Naqsha combines public terrain, buildings, streets, weather ensembles, and SFINCS hydraulics to show how flooding could build up across Lahore—and which roads and neighbourhoods may be hit hardest.

## Short description

Naqsha is an interactive 3D urban-flood lab for Lahore, Pakistan. It animates real hydraulic-model output over recognizable city geometry, compares three public terrain models instead of hiding their disagreement, ranks exposed roads and neighbourhoods, and accepts ensemble rainfall forecasts for future flood scenarios.

## Inspiration

Lahore's monsoon flooding can turn a short storm into hours of disruption, but forecasts, terrain, roads, buildings, and flood models all live separately. We built Naqsha around one question: **what if a rainfall forecast could become a recognizable 3D flood scenario before the rain arrives?**

## What it does

Naqsha is a forecast-ready 3D urban-flood lab for Central Lahore and Gulberg–Liberty. It combines 43,661 public building footprints, 6,447 infrastructure segments, 746 map labels, three terrain models, and real SFINCS hydraulic output. Users can watch water build up and recede, compare terrain-dependent predictions, identify flooded neighbourhoods, and rank exposed named roads. A separate pipeline converts 51-member ECMWF rainfall forecasts into reproducible p10, p50, and p90 scenarios.

## How we built it

Our Python pipeline aligns Copernicus, FABDEM, and SRTM terrain; builds equivalent SFINCS flood models; runs rainfall scenarios; samples flood depth along mapped roads; and exports compact browser-ready grids. We add Overture buildings and OpenStreetMap roads, infrastructure, names, and POIs. React, TypeScript, Three.js, and WebGL render terrain, solid buildings, animated 3D flood volumes, road impacts, labels, and model-agreement layers.

## Challenges we ran into

Lahore is extremely flat, so small terrain errors can reverse predicted flow. Rather than choosing one convenient elevation source, we run all three and expose where they agree. Most buildings also lack measured heights, and the terrain grid is approximately 29 metres, so treating every footprint as a surveyed hydraulic wall would create false precision. Connecting raster flood depths to actual roads required a separate spatial-sampling pipeline across every hydraulic frame.

## What we learned

Our main lesson was: **computational resolution is not evidence resolution.** A model can calculate every cell without being authoritative. Public data can create a compelling visual twin, but a calibrated hydraulic twin still needs local terrain surveys, drainage infrastructure, rainfall gauges, and observed flood depths.

## What's next for Naqsha

Next we want to add high-resolution local terrain, drains, inlets, pumps, culverts, road levels, and historical flood observations; automate forecast refreshes; and expand into DHA, Johar Town, Model Town, and other Lahore flood hotspots. Naqsha is not yet a public warning system—it is a transparent, working foundation for one.

## Built with

`React` `TypeScript` `Three.js` `WebGL` `Vite` `Python` `NumPy` `Rasterio` `Shapely` `PyProj` `SFINCS` `Docker` `Colima` `OpenStreetMap` `Overture Maps` `Open-Meteo` `ECMWF` `Copernicus DEM` `FABDEM` `SRTM` `GeoJSON` `GIS` `Hydrology` `Cloudflare Pages` `Vitest`

## Links

- Demo: https://naqsha.brutefloat.com
- Source: https://github.com/aybeedee/naqsha

## Gallery captions

1. **Central Lahore** — “Central Lahore's 3D flood twin combines 19,329 building footprints, recognizable places, animated hydraulic depth, exposed-road highlighting, and neighbourhood impact summaries.”
2. **Gulberg–Liberty** — “Gulberg–Liberty demonstrates Naqsha's multi-district workflow with 24,332 building footprints, mapped flood buildup, road exposure rankings, and terrain-aware neighbourhood impacts.”
