# Google Photorealistic 3D Tiles decision

## Decision

Do not integrate Google Photorealistic 3D Tiles into the Lahore MVP now.

As of 25 August 2026, Google's country coverage table lists Pakistan with 2D
Map Tiles but not 3D Map Tiles, and lists Maps JavaScript 3D as unavailable.
Adding a renderer and API key therefore cannot provide the requested Lahore
building mesh today.

This is also a visualization-only source. Google explicitly prohibits using
Map Tiles API content for machine interpretation, object detection, geodata
extraction, or tracing/deriving overlay geometry from Photorealistic 3D Tiles.
It cannot legally become the building-obstacle input to SFINCS. Hydraulic
obstacles must continue to come from independently licensed vector footprints,
surveyed terrain/kerbs, drainage data, or a separately licensed surface model.

Sources:

- [Google Maps Platform coverage details](https://developers.google.com/maps/coverage)
- [Map Tiles API policies](https://developers.google.com/maps/documentation/tile/policies)
- [Work with a 3D Tiles renderer](https://developers.google.com/maps/documentation/tile/use-renderer)
- [Map Tiles API pricing](https://developers.google.com/maps/billing-and-pricing/pricing)

## Why it is not an MVP dependency

The current viewer uses a local UTM 43N coordinate frame in Three.js. Google's
tiles are a streamed global 3D Tiles/glTF hierarchy normally rendered with
CesiumJS or deck.gl. A correct integration would add Earth-centred coordinate
conversion, streamed level-of-detail management, terrain/water occlusion,
dynamic attribution aggregation, and a second camera/rendering integration.
That effort would improve realism only where detailed surface coverage exists;
it would not improve the flood calculation.

The API also requires a billing-enabled Google Cloud project and a restricted
API key. Photorealistic 3D Tiles currently have a 1,000-event monthly free cap,
then start at USD 6 per 1,000 billable events. Google attribution and per-tile
data credits must remain visible, and Google content cannot be prefetched or
packaged for offline use.

## Future integration boundary

Reconsider a visual-only **Photorealistic backdrop** when all of these are true:

1. Google's live coverage tool shows 3D surface coverage for the exact Lahore
   pilot;
2. a billing-enabled, browser-restricted key and conservative quota are ready;
3. a CesiumJS or deck.gl spike can align Naqsha's water overlay to the same
   vertical datum without hiding required credits; and
4. the UI clearly attributes Google only for the backdrop and Naqsha's own
   sources for flood, buildings, and network layers.

The hydraulic pipeline must remain independent. Overture/OSM or better local
building polygons can be rasterized into a solver obstruction/subgrid product
under their own licences. The Google mesh may be displayed behind that result,
but must never be sampled, traced, cached, or converted into model geometry.
