import * as THREE from 'three'

const TILE_SIZE = 256
const DEFAULT_TILE_TEMPLATE = 'https://tile.openstreetmap.org/{z}/{x}/{y}.png'

interface PixelPoint {
  x: number
  y: number
}

export interface TileCoverage {
  zoom: number
  westPixel: number
  northPixel: number
  eastPixel: number
  southPixel: number
  minTileX: number
  maxTileX: number
  minTileY: number
  maxTileY: number
  tileCount: number
}

function worldPixel(longitude: number, latitude: number, zoom: number): PixelPoint {
  const scale = TILE_SIZE * 2 ** zoom
  const latitudeRadians = latitude * Math.PI / 180
  return {
    x: (longitude + 180) / 360 * scale,
    y: (1 - Math.asinh(Math.tan(latitudeRadians)) / Math.PI) / 2 * scale,
  }
}

export function tileCoverage(bounds: number[], zoom = 15): TileCoverage {
  const [west, south, east, north] = bounds
  const northwest = worldPixel(west, north, zoom)
  const southeast = worldPixel(east, south, zoom)
  const minTileX = Math.floor(northwest.x / TILE_SIZE)
  const maxTileX = Math.floor((southeast.x - 1) / TILE_SIZE)
  const minTileY = Math.floor(northwest.y / TILE_SIZE)
  const maxTileY = Math.floor((southeast.y - 1) / TILE_SIZE)
  return {
    zoom,
    westPixel: northwest.x,
    northPixel: northwest.y,
    eastPixel: southeast.x,
    southPixel: southeast.y,
    minTileX,
    maxTileX,
    minTileY,
    maxTileY,
    tileCount: (maxTileX - minTileX + 1) * (maxTileY - minTileY + 1),
  }
}

function tileUrl(template: string, zoom: number, x: number, y: number): string {
  return template
    .replace('{z}', String(zoom))
    .replace('{x}', String(x))
    .replace('{y}', String(y))
}

async function loadTile(url: string): Promise<ImageBitmap> {
  const response = await fetch(url, { credentials: 'omit', mode: 'cors' })
  if (!response.ok) throw new Error(`Basemap tile failed: ${response.status}`)
  return createImageBitmap(await response.blob())
}

export async function loadOsmBasemapTexture(
  bounds: number[],
  zoom = 15,
  template = import.meta.env.VITE_OSM_TILE_URL || DEFAULT_TILE_TEMPLATE,
): Promise<THREE.CanvasTexture> {
  const coverage = tileCoverage(bounds, zoom)
  // This loader is intentionally bounded to the one visible AOI and one zoom
  // level. It must never become an offline or multi-zoom tile prefetcher.
  if (coverage.tileCount > 36) {
    throw new Error(`Refusing to prefetch ${coverage.tileCount} OSM tiles`)
  }
  const canvas = document.createElement('canvas')
  canvas.width = Math.ceil(coverage.eastPixel - coverage.westPixel)
  canvas.height = Math.ceil(coverage.southPixel - coverage.northPixel)
  const drawing = canvas.getContext('2d')!
  const requests: Promise<void>[] = []
  for (let x = coverage.minTileX; x <= coverage.maxTileX; x += 1) {
    for (let y = coverage.minTileY; y <= coverage.maxTileY; y += 1) {
      requests.push(
        loadTile(tileUrl(template, zoom, x, y)).then((tile) => {
          drawing.drawImage(
            tile,
            x * TILE_SIZE - coverage.westPixel,
            y * TILE_SIZE - coverage.northPixel,
          )
          tile.close()
        }),
      )
    }
  }
  await Promise.all(requests)
  drawing.fillStyle = 'rgba(5, 21, 26, 0.18)'
  drawing.fillRect(0, 0, canvas.width, canvas.height)
  const texture = new THREE.CanvasTexture(canvas)
  texture.colorSpace = THREE.SRGBColorSpace
  texture.minFilter = THREE.LinearMipmapLinearFilter
  texture.magFilter = THREE.LinearFilter
  return texture
}
