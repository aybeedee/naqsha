# First experimental hydraulic ensemble

The first end-to-end hydraulic run completed on 2026-08-24 with the official
Deltares SFINCS 2.4.0 Galibier CPU image, pinned as
`deltares/sfincs-cpu:sfincs-v2.4.0-Galibier-Release`. The release is documented
by [Deltares](https://github.com/Deltares/SFINCS/releases/tag/v2.4.0_Galibier_release),
and the [SFINCS manual](https://sfincs.readthedocs.io/en/latest/) defines the
rainfall, regular-grid, infiltration, roughness, and outflow inputs used here.

## Synthetic scenario

| Input | Value |
|---|---:|
| Uniform rainfall total | 100 mm |
| Rainfall duration | 2 hours |
| Recession after rain | 2 hours |
| Uniform effective loss rate | 5 mm/h |
| Uniform Manning roughness | 0.06 s/m¹ᐟ³ |
| Terrain cell size | 28.66 m |
| Active cells per member | 20,342 |
| Open outflow cells | 567 |

The loss parameter uses SFINCS's constant infiltration term as a sensitivity
proxy for unresolved surface losses. It is not a claim about soil infiltration
or sewer capacity. The rain is a stress-test hyetograph, not a reconstructed
historic Lahore event.

Every active cell beside an inactive/AOI cell is an open, zero-depth outflow
boundary. Post-processing excludes a two-cell buffer around these boundaries,
leaving 18,659 cells, but this does not repair an arbitrary boundary that omits
the contributing catchment.

## Results

| Terrain member | Area >0.10 m | Area >0.30 m | Maximum depth |
|---|---:|---:|---:|
| Copernicus GLO-30 | 2.40 km² | 1.54 km² | 2.54 m |
| FABDEM v1.2 | 4.13 km² | 1.04 km² | 2.34 m |
| SRTM-family | 1.63 km² | 1.23 km² | 4.66 m |

Across the three members:

- the union of cells deeper than 0.10 m is 6.56 km²;
- the all-member intersection is only 0.15 km²;
- all-member wet Jaccard is 0.023;
- 97.7% of the wet union is terrain-sensitive;
- within the wet union, the median member depth range is 0.28 m and the
  95th-percentile range is 1.13 m.

The extreme maximum depths are additional warning signals: isolated terrain
artefacts at 30 m can create deep numerical storage. They are not plausible
street-depth claims without surveyed terrain and event validation.

## Decision

The solver and reproducible workflow work. The resulting map does not pass an
accuracy gate. It is useful for testing scenario orchestration, output tiling,
uncertainty communication, and the future web interaction, but not for public
safety decisions or site-level intervention design.

Every downstream view must lead with:

> Experimental screening result. Terrain-source disagreement dominates the
> model. Do not interpret mapped cells as authoritative street or property
> flood depths.

The next model work should add loss-rate/rainfall sensitivities and historical
point validation while preserving all three terrain members. A meaningful
accuracy upgrade still requires a local bare-earth surface and drainage/road
controls.
