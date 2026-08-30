# Naqsha — Devpost submission kit

Replace only the bracketed fields. Everything else is paste-ready.

## Project name

Naqsha

## Tagline

A forecast-ready 3D urban flood twin that turns rainfall uncertainty into neighbourhood and road-impact screening for Lahore.

## One-line pitch

Naqsha combines public terrain, buildings, streets, weather ensembles, and SFINCS hydraulics to show how flooding could build up across Lahore—and which roads and neighbourhoods may be hit hardest.

## Short description

Naqsha is an interactive 3D urban-flood lab for Lahore, Pakistan. It animates real hydraulic-model output over recognizable city geometry, compares three public terrain models instead of hiding their disagreement, ranks exposed roads and neighbourhoods, and accepts ensemble rainfall forecasts for future flood scenarios.

## Inspiration

Urban flooding in Lahore can turn a short monsoon storm into hours of disruption. Yet the information people need is fragmented: rainfall forecasts live in one place, terrain and buildings in another, drainage knowledge is often unavailable, and conventional flood-model outputs are difficult for non-specialists to interpret.

We wanted to explore a simple question: **what if a forecast could become an understandable, street-aware 3D flood scenario before the rain arrives?**

That idea came with an important constraint. Public global elevation data is not accurate enough to claim property-level flood depths in a flat city like Lahore. Instead of hiding that limitation behind a polished visualization, Naqsha makes uncertainty part of the product.

## What it does

Naqsha provides a browser-based 2D/3D digital view of two Lahore study areas:

- Central Lahore around Lakshmi Chowk, GPO, and Lawrence Road
- Gulberg–Liberty, including nearby commercial and residential districts

Users can:

- explore 43,661 real public building footprints and 6,447 mapped road, rail, water, and park segments;
- navigate 746 categorized map labels for neighbourhoods, roads, hospitals, universities, markets, parks, landmarks, and other POIs;
- play, pause, and scrub through 25 real hydraulic output frames at 10-minute intervals;
- see water represented as raised 3D flood volumes rather than a flat decorative overlay;
- compare Copernicus, FABDEM, and SRTM-family terrain realizations;
- inspect where all three terrain models agree—or where the prediction is terrain-sensitive;
- colour roads by sampled flood exposure and rank the most affected named roads;
- identify high-depth neighbourhood-label vicinities;
- switch between a time-varying flood and the maximum-depth envelope; and
- ingest 51-member ECMWF rainfall ensembles as reproducible p10, p50, and p90 hydraulic forcing scenarios.

The checked demo uses a transparent 100 mm / 2 hour design storm followed by two hours of recession. The forecast pipeline is separate and records the weather provider, model, retrieval time, model grid point, validity period, ensemble member, and every hourly rainfall value.

## How we built it

The modelling pipeline is written in Python and produces compact, browser-native assets:

1. Define and validate a bounded Lahore study area.
2. Retrieve and align Copernicus GLO-30, FABDEM, and SRTM-family elevation surfaces in UTM Zone 43N.
3. Build three equivalent SFINCS 2.4.0 pluvial-flood models using a pinned official Deltares container.
4. Run the storm through every terrain member and export instantaneous and maximum water depths.
5. Quantize the timeline into compact binary grids for fast browser loading.
6. Retrieve Overture building footprints and OpenStreetMap streets, infrastructure, names, and POIs.
7. Sample every hydraulic frame along mapped roads to calculate depth, exposed length, and cross-terrain agreement.
8. Render the result with React, TypeScript, Three.js, and WebGL.

The client constructs terrain meshes, solid building extrusions, street geometry, animated flood surfaces and walls, category-aware labels, and uncertainty layers. A live OpenStreetMap raster can be draped onto the model, while the checked local vectors keep the city recognizable if live tiles are unavailable.

For forecasting, the pipeline archives complete ECMWF ensemble-member rainfall trajectories nearest the whole-event p10, p50, and p90 totals. We deliberately avoid combining independent hourly percentiles, which could invent an incoherent storm.

## Challenges we ran into

### Public elevation is not street-grade terrain

Lahore is flat enough that small elevation errors can reverse inferred flow direction. Our three public terrain sources disagree substantially. The easy option would have been to choose the prettiest result. Instead, we built a three-member hydraulic ensemble and exposed agreement directly in the interface.

### A believable city is not automatically a hydraulic city

Public footprints make the scene recognizable, but most buildings lack measured heights and the model grid is about 29 metres. Burning every footprint into that grid as a solid wall would block entire streets and create false precision. Buildings are therefore real footprints with explicitly marked proxy heights, but are not yet presented as surveyed hydraulic obstacles.

### Rendering water buildup clearly in 3D

A flat blue texture looked like puddles painted onto the ground. We switched to actual raised flood geometry with perimeter walls, while clearly disclosing the visual height exaggeration. The timeline uses genuine solver frames rather than interpolated animation.

### Turning model cells into transport impacts

Hydraulic rasters do not naturally answer “which road is affected?” We built a spatial sampling pipeline that intersects each frame with OSM network geometry, aggregates named segments, and retains terrain-member agreement. It is useful for screening, but intentionally not labelled as safe routing or a closure decision.

### Map labels in a dense 3D scene

Simple labels quickly became unreadable. We added a broad OSM POI taxonomy, category-specific styling, zoom/distance thresholds, priority ranking, and runtime screen-space collision filtering.

## Accomplishments that we're proud of

- Completed an end-to-end, reproducible rainfall-to-3D-flood workflow.
- Ran six hydraulic models across two Lahore districts and three terrain realizations.
- Made terrain uncertainty visible rather than presenting one model as truth.
- Rendered actual time-varying hydraulic buildup as 3D volume geometry.
- Connected flood grids to named roads and neighbourhood-level screening metrics.
- Built a forecast forcing path from a 51-member weather ensemble to SFINCS.
- Kept the full browser experience fast using compact binary assets and precomputed scenarios.
- Added strong provenance and interpretation guardrails throughout the interface.
- Backed the project with 34 Python tests, 11 viewer tests, linting, and production builds.

## What we learned

The largest lesson was that **computational resolution is not evidence resolution**. A model can produce a value for every cell without that value being authoritative. For urban-flood products, uncertainty communication is not a disclaimer added at the end—it has to shape data selection, scenario design, interface defaults, and the claims the product makes.

We also learned that a digital twin has two distinct layers: a recognizable visual twin and a calibrated hydraulic twin. Public maps can make the first surprisingly compelling. The second requires local terrain, road levels, drains, inlets, pumps, storage assets, rainfall gauges, and observed flood depths.

## What's next for Naqsha

- Add a local bare-earth DTM from LiDAR, drone photogrammetry, RTK/GNSS, or civil survey data.
- Couple the 2D surface model to WASA/DHA drains, inlets, manholes, culverts, pumps, outfalls, and storage tanks.
- Add sub-grid building, wall, kerb, underpass, and road-crown controls where evidence supports them.
- Calibrate against timestamped rain gauges, flooded and non-flooded observations, and measured depths.
- Schedule forecast refreshes, automatically run p10/p50/p90 scenarios, and expire stale forecasts.
- Add uncertainty-aware route and critical-facility impact analysis—without calling a route safe unless the data supports that claim.
- Expand to DHA, Johar Town, Model Town, and other Lahore flood hotspots.

## Built with

Use these as Devpost technology tags:

`React` `TypeScript` `Three.js` `WebGL` `Vite` `Python` `NumPy` `Rasterio` `Shapely` `PyProj` `SFINCS` `Docker` `Colima` `OpenStreetMap` `Overture Maps` `Open-Meteo` `ECMWF` `Copernicus DEM` `FABDEM` `SRTM` `GeoJSON` `GIS`

## Links

- Demo: `[https://naqsha.brutefloat.com]`
- Source: `[https://github.com/aybeedee/naqsha]`

## 60-second demo narration

> Lahore's monsoon flooding is a physical problem, but its data is fragmented and its model outputs are hard to understand. Naqsha turns that information into a forecast-ready 3D urban flood twin.
>
> Here is Central Lahore, built from more than nineteen thousand public building footprints, current OpenStreetMap streets, and hundreds of recognizable labels. This is not an animated texture: as I scrub the timeline, these are real ten-minute SFINCS hydraulic frames showing water building up and receding.
>
> Naqsha samples that flooding along the street network, colours exposed roads, ranks the most affected named routes, and summarizes neighbourhood hotspots.
>
> But public terrain is uncertain, especially in a flat city. So instead of showing one confident answer, Naqsha runs Copernicus, FABDEM, and SRTM terrain models and shows where they agree.
>
> We can switch instantly to our second twin in Gulberg–Liberty, and the same pipeline also accepts 51-member ECMWF rainfall forecasts as p10, p50, and p90 scenarios.
>
> Naqsha is not yet a public warning system. It is a working, transparent foundation for one—ready to improve with local terrain, drainage, gauges, and observed flood data.

## 90-second demo shot list

1. **0–8 sec:** Title card: “Naqsha — forecast-ready urban flood intelligence for Lahore.”
2. **8–20 sec:** Orbit Central Lahore; point out real buildings, roads, labels, and OSM basemap.
3. **20–35 sec:** Press Play or scrub 0:00 → 2:00; show the raised water buildup.
4. **35–48 sec:** Show yellow/orange/red road exposure, named-road ranking, and neighbourhood hotspots.
5. **48–60 sec:** Switch to Terrain agreement, then briefly click individual terrain members.
6. **60–72 sec:** Switch study area to Gulberg–Liberty.
7. **72–82 sec:** Show the forecast workflow/provenance in code or a terminal screenshot.
8. **82–90 sec:** End card: “Transparent today. Calibrated tomorrow. Safer Lahore.”

## Recommended Devpost gallery captions

1. **Central Lahore overview** — “A recognizable 3D city context with animated ensemble-median flood depth and road exposure.”
2. **Flood evolution** — “Twenty-five genuine SFINCS frames show rainfall buildup and recession at ten-minute intervals.”
3. **Road impacts** — “Mapped roads are coloured by sampled depth and ranked by name; results remain screening-only.”
4. **Terrain agreement** — “Naqsha shows where three public terrain realizations agree instead of hiding model uncertainty.”
5. **Gulberg–Liberty** — “The same catalog-driven workflow powers a second Lahore district with 24,332 building footprints.”

Upload-ready images are available at:

- [`devpost-assets/central-lahore.png`](devpost-assets/central-lahore.png)
- [`devpost-assets/gulberg-liberty.png`](devpost-assets/gulberg-liberty.png)
