import type { AreaCatalog, ScenarioData, UrbanContextData } from './types'

export function smallScenario(): ScenarioData {
  return {
    metadata: {
      grid: {
        width: 2,
        height: 2,
        cellSizeMetres: 30,
        crs: 'EPSG:32643',
        extentWidthMetres: 60,
        extentHeightMetres: 60,
        geographicBounds: [74.3, 31.5, 74.31, 31.51],
      },
      scenario: {
        rainfall_total_mm: 100,
        rainfall_duration_minutes: 20,
        recession_minutes: 10,
        effective_loss_rate_mm_per_hour: 5,
        manning_roughness: 0.06,
      },
      timeline: {
        frameCount: 4,
        intervalSeconds: 600,
        durationSeconds: 1800,
        depthScaleMetres: 0.001,
      },
      agreement: { metrics: { intersection_flooded_area_over_10cm_km2: 0.1 } },
    },
    active: new Uint8Array([1, 1, 1, 0]),
    agreement: new Uint8Array([3, 2, 0, 255]),
    members: [
      {
        id: 'copernicus',
        label: 'Copernicus GLO-30',
        terrain: new Float32Array([100, 100, 100, 100]),
        terrainMinimumMetres: 100,
        depth: new Float32Array([0.8, 0.6, 0.03, 0]),
        timelineDepth: new Uint16Array([
          0, 0, 0, 0, 600, 300, 0, 0, 800, 600, 30, 0, 200, 100, 0, 0,
        ]),
      },
      {
        id: 'fabdem',
        label: 'FABDEM v1.2',
        terrain: new Float32Array([100, 100, 100, 100]),
        terrainMinimumMetres: 100,
        depth: new Float32Array([0.5, 0.5, 0.02, 0]),
        timelineDepth: new Uint16Array([
          0, 0, 0, 0, 400, 200, 0, 0, 500, 500, 20, 0, 100, 50, 0, 0,
        ]),
      },
      {
        id: 'srtm',
        label: 'SRTM-family',
        terrain: new Float32Array([100, 100, 100, 100]),
        terrainMinimumMetres: 100,
        depth: new Float32Array([0.3, 0.7, 0.01, 0]),
        timelineDepth: new Uint16Array([
          0, 0, 0, 0, 300, 100, 0, 0, 200, 700, 10, 0, 100, 150, 0, 0,
        ]),
      },
    ],
    roadImpact: {
      lineCount: 3,
      frameCount: 4,
      depthScaleMetres: 0.001,
      nodataDepth: 65535,
      memberCount: 3,
      timelineDepth: new Uint16Array([
        0, 0, 65535, 400, 100, 65535, 500, 600, 65535, 100, 50, 65535,
      ]),
      timelineAgreement: new Uint8Array([0, 0, 255, 3, 2, 255, 3, 3, 255, 3, 1, 255]),
      peakDepth: new Uint16Array([500, 600, 65535]),
      peakAgreement: new Uint8Array([3, 3, 255]),
      lengths: new Float32Array([200, 300, 500]),
    },
  } as unknown as ScenarioData
}

export function smallContext(): UrbanContextData {
  return {
    metadata: {
      buildings: { count: 1, inferredHeightMetres: 8 },
      network: {
        count: 3,
        classes: Array.from({ length: 9 }, (_, id) => ({
          id,
          name: 'road',
          widthMetres: 4,
          colour: '#ddddcc',
        })),
      },
      labels: [
        {
          name: 'Lakshmi Chowk',
          category: 'district',
          kind: 'neighbourhood',
          priority: 100,
          x: -15,
          z: -15,
        },
        { name: 'GPO', category: 'landmark', kind: 'post_office', priority: 80, x: 15, z: 15 },
      ],
      provenance: { osmTimestamp: '2026-08-27' },
    },
    networkNames: ['Mall Road', 'Lawrence Road', 'Park'],
    buildingIndex: new Uint32Array([0, 4]),
    buildingCoordinates: new Float32Array([-5, -5, 5, -5, 5, 5, -5, 5]),
    buildingHeights: new Float32Array([8]),
    buildingSource: new Uint8Array([1]),
    networkIndex: new Uint32Array([0, 2, 0, 2, 2, 1, 4, 2, 8]),
    networkCoordinates: new Float32Array([-15, -15, 15, -15, -15, 15, 15, 15, 0, 0, 10, 10]),
  } as unknown as UrbanContextData
}

export const smallCatalog: AreaCatalog = {
  schemaVersion: 1,
  defaultArea: 'central-lahore',
  areas: [
    {
      id: 'central-lahore',
      label: 'Central Lahore',
      location: 'Lakshmi Chowk',
      description: '',
      scenarioRoot: '/a',
      contextRoot: '/central-lahore',
      role: 'validation-benchmark',
    },
    {
      id: 'gulberg-liberty',
      label: 'Gulberg–Liberty',
      location: 'Liberty',
      description: '',
      scenarioRoot: '/b',
      contextRoot: '/gulberg-liberty',
      role: 'expansion-area',
    },
  ],
}
