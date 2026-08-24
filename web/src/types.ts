export type MemberId = 'copernicus' | 'fabdem' | 'srtm'
export type ViewId = MemberId | 'agreement' | 'city'
export type Dimension = '2d' | '3d'
export type FloodMode = 'timeline' | 'maximum'

export interface MemberMetrics {
  analysed_cell_count: number
  flooded_area_over_5cm_km2: number
  flooded_area_over_10cm_km2: number
  flooded_area_over_30cm_km2: number
  maximum_depth_m: number
  wet_cell_depth_p95_m: number
  integrated_maximum_depth_volume_proxy_m3: number
}

export interface MemberMetadata {
  id: MemberId
  label: string
  terrainFile: string
  depthFile: string
  timelineFile: string
  metrics: MemberMetrics
  terrainMinimumMetres: number
  terrainMaximumMetres: number
}

export interface GridMetadata {
  width: number
  height: number
  crs: string
  transform: number[]
  bounds: number[]
  geographicBounds: number[]
  cellSizeMetres: number
  extentWidthMetres: number
  extentHeightMetres: number
  activeFile: string
}

export interface AgreementMetrics {
  member_count: number
  analysed_cell_count: number
  union_flooded_area_over_10cm_km2: number
  intersection_flooded_area_over_10cm_km2: number
  all_member_wet_jaccard: number
  terrain_sensitive_wet_fraction: number
  depth_range_p50_in_union_m: number
  depth_range_p95_in_union_m: number
}

export interface ScenarioMetadata {
  schemaVersion: number
  id: string
  label: string
  status: string
  warning: string
  location: string
  grid: GridMetadata
  scenario: {
    rainfall_total_mm: number
    rainfall_duration_minutes: number
    recession_minutes: number
    effective_loss_rate_mm_per_hour: number
    manning_roughness: number
    output_interval_seconds: number
  }
  timeline: {
    frameCount: number
    intervalSeconds: number
    durationSeconds: number
    depthScaleMetres: number
    quantity: 'instantaneous_water_depth'
  }
  members: MemberMetadata[]
  agreement: {
    file: string
    thresholdMetres: number
    metrics: AgreementMetrics
  }
  provenance: {
    solverImage: string
    sourceModelDirectory: string
    sourceResultDirectory: string
  }
}

export interface MemberGrid extends MemberMetadata {
  terrain: Float32Array
  depth: Float32Array
  timelineDepth: Uint16Array
}

export interface ScenarioData {
  metadata: ScenarioMetadata
  active: Uint8Array
  agreement: Uint8Array
  members: MemberGrid[]
  maximumDepth: Float32Array
  medianDepth: Float32Array
}

export interface LineClass {
  id: number
  name: string
  widthMetres: number
  colour: string
}

export interface UrbanLabel {
  name: string
  category: 'district' | 'road' | 'civic' | 'landmark' | 'station'
  priority: number
  x: number
  z: number
}

export interface UrbanContextMetadata {
  schemaVersion: number
  crs: string
  origin: { easting: number; northing: number }
  buildings: {
    count: number
    coordinateFile: string
    indexFile: string
    heightFile: string
    heightSourceFile: string
    sourceFile: string
    sourceCounts: Record<string, number>
    measuredOrTaggedHeightCount: number
    inferredHeightCount: number
    inferredHeightMetres: number
  }
  network: {
    count: number
    coordinateFile: string
    indexFile: string
    classes: LineClass[]
  }
  labels: UrbanLabel[]
  provenance: {
    overtureRelease: string
    osmTimestamp: string
    buildingThemeLicense: string
    buildingSources: string[]
    networkSource: string
    networkLicense: string
    warning: string
  }
}

export interface UrbanContextData {
  metadata: UrbanContextMetadata
  buildingCoordinates: Float32Array
  buildingIndex: Uint32Array
  buildingHeights: Float32Array
  buildingHeightSource: Uint8Array
  buildingSource: Uint8Array
  networkCoordinates: Float32Array
  networkIndex: Uint32Array
}
