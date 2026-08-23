# Initial open-data register

| Need | MVP source | Effective resolution | Important limitation |
|---|---|---:|---|
| Terrain | Copernicus GLO-30 DSM | 30 m | Surface heights and vertical noise; not street-grade DTM |
| Land cover | ESA WorldCover 2021 | 10 m | Global classes need local imperviousness checks |
| Buildings | OpenStreetMap / open building footprints | feature-level | Completeness and offsets vary |
| Roads/water | OpenStreetMap / HDX extracts | feature-level | Drainage network is likely incomplete |
| Historical rain | NASA GPM IMERG | ~10 km, 30 min | Too coarse for neighbourhood rain variation |
| Forecast rain | Open-Meteo model ensemble | model-dependent | Treat pilot rainfall as uniform without local radar |
| Official context | PMD published records | station/event | Public archives may not expose sub-hourly series |

No source is silently substituted. Changes to source, version, or licensing
must update this register and the generated model metadata.

