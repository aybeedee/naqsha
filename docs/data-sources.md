# Initial open-data register

| Need | MVP source | Effective resolution | Important limitation |
|---|---|---:|---|
| Terrain | Copernicus GLO-30 DSM | 30 m | Surface heights and vertical noise; not street-grade DTM |
| Conditioned terrain | FABDEM 1.2 | 30 m | Derived from Copernicus; non-commercial licence and not an independent survey |
| Independent terrain lineage | AWS Terrain Tiles SRTM-family HGT | 30 m | Radar surface model; urban objects and void-filling artefacts remain |
| Sparse vertical context | NASA ICESat-2 ATL08 via OpenAltimetry | 100 m segments along satellite beams | One near-collinear pass; urban classification and vertical datum require caution |
| Land cover | ESA WorldCover 2021 | 10 m | Global classes need local imperviousness checks |
| Buildings | OpenStreetMap / open building footprints | feature-level | Completeness and offsets vary |
| Roads/water | OpenStreetMap / HDX extracts | feature-level | Drainage network is likely incomplete |
| Historical rain | NASA GPM IMERG | ~10 km, 30 min | Too coarse for neighbourhood rain variation |
| Forecast rain | Open-Meteo model ensemble | model-dependent | Treat pilot rainfall as uniform without local radar |
| Official context | PMD published records | station/event | Public archives may not expose sub-hourly series |

No source is silently substituted. Changes to source, version, or licensing
must update this register and the generated model metadata.

FABDEM is used only to test sensitivity to machine-learned building and forest
removal. A production/commercial deployment must confirm licensing or replace
it with an appropriately licensed terrain source.

The public-elevation search and the ICESat-2 acceptance decision are recorded
in [`public-elevation-search.md`](public-elevation-search.md).
