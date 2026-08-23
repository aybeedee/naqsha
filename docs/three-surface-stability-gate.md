# Three-surface stability gate: provisional pilot

On 2026-08-23, the pipeline evaluated broad local-depression rankings over the
same 18.57 km² grid using Copernicus GLO-30, FABDEM v1.2, and an AWS-hosted
SRTM-family surface.

The screening hotspot definition is the top 10% of cells by elevation below a
roughly 300 m local mean. It intentionally tests broader depressions than an
individual 30 m cell.

## Results

| Metric | Result |
|---|---:|
| Common valid cells | 22,560 |
| Median three-surface elevation range | 3.46 m |
| 95th-percentile elevation range | 7.83 m |
| Copernicus/FABDEM hotspot Jaccard | 0.178 |
| Copernicus/SRTM hotspot Jaccard | 0.097 |
| FABDEM/SRTM hotspot Jaccard | 0.089 |
| Three-way hotspot Jaccard | 0.027 |
| Copernicus/FABDEM depression-rank correlation | 0.193 |
| Copernicus/SRTM depression-rank correlation | 0.159 |
| FABDEM/SRTM depression-rank correlation | 0.065 |
| Copernicus/SRTM flow-direction change over 45° | 70.1% |
| FABDEM/SRTM flow-direction change over 45° | 73.6% |

## Decision

The public global elevation products fail the screening-stability gate for the
provisional area. Only 2.7% Jaccard overlap remains when the three top-hotspot
sets are compared together, and pairwise rank correlations are weak.

Consequences:

- do not publish street/property flood depths from these inputs;
- do not pick intervention sites based on one terrain product;
- an experimental hydraulic ensemble may still be built to quantify how much
  predictions diverge, but it must not be presented as actionable truth;
- the next defensible data route is a local DTM or surveyed control elevations;
- historical flooded/non-flooded observations are needed to test whether one
  conditioned surface nonetheless has empirical skill.

This result applies to the provisional Gulberg–Liberty test boundary. A final
pilot may perform differently, but it must pass the same automated gate.
