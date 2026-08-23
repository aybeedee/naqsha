import type {
  MemberGrid,
  ScenarioData,
  ScenarioMetadata,
  UrbanContextData,
  UrbanContextMetadata,
} from './types'

const SCENARIO_ROOT = '/scenarios/rain100mm-2h-loss5'
const CONTEXT_ROOT = '/context/central-lahore'

async function fetchBuffer(path: string): Promise<ArrayBuffer> {
  const response = await fetch(path)
  if (!response.ok) throw new Error(`Could not load ${path}: ${response.status}`)
  return response.arrayBuffer()
}

export async function loadScenario(): Promise<ScenarioData> {
  const response = await fetch(`${SCENARIO_ROOT}/scenario.json`)
  if (!response.ok) throw new Error(`Could not load scenario metadata: ${response.status}`)
  const metadata = (await response.json()) as ScenarioMetadata
  const cellCount = metadata.grid.width * metadata.grid.height

  const [activeBuffer, agreementBuffer, ...memberBuffers] = await Promise.all([
    fetchBuffer(`${SCENARIO_ROOT}/${metadata.grid.activeFile}`),
    fetchBuffer(`${SCENARIO_ROOT}/${metadata.agreement.file}`),
    ...metadata.members.flatMap((member) => [
      fetchBuffer(`${SCENARIO_ROOT}/${member.terrainFile}`),
      fetchBuffer(`${SCENARIO_ROOT}/${member.depthFile}`),
    ]),
  ])

  const active = new Uint8Array(activeBuffer)
  const agreement = new Uint8Array(agreementBuffer)
  if (active.length !== cellCount || agreement.length !== cellCount) {
    throw new Error('Scenario mask dimensions do not match metadata')
  }

  const members: MemberGrid[] = metadata.members.map((member, index) => {
    const terrain = new Float32Array(memberBuffers[index * 2])
    const depth = new Float32Array(memberBuffers[index * 2 + 1])
    if (terrain.length !== cellCount || depth.length !== cellCount) {
      throw new Error(`Grid dimensions do not match metadata for ${member.id}`)
    }
    return { ...member, terrain, depth }
  })
  const maximumDepth = new Float32Array(cellCount)
  const medianDepth = new Float32Array(cellCount)
  for (let index = 0; index < cellCount; index += 1) {
    const values = members.map((member) => member.depth[index])
    maximumDepth[index] = Math.max(...values)
    medianDepth[index] = values.reduce((sum, value) => sum + value, 0)
      - Math.min(...values)
      - Math.max(...values)
  }
  return { metadata, active, agreement, members, maximumDepth, medianDepth }
}

export async function loadUrbanContext(): Promise<UrbanContextData> {
  const response = await fetch(`${CONTEXT_ROOT}/context.json`)
  if (!response.ok) throw new Error(`Could not load urban context metadata: ${response.status}`)
  const metadata = (await response.json()) as UrbanContextMetadata
  const [buildingCoordinates, buildingIndex, buildingHeights, buildingHeightSource,
    buildingSource, networkCoordinates, networkIndex] = await Promise.all([
    fetchBuffer(`${CONTEXT_ROOT}/${metadata.buildings.coordinateFile}`).then((value) => new Float32Array(value)),
    fetchBuffer(`${CONTEXT_ROOT}/${metadata.buildings.indexFile}`).then((value) => new Uint32Array(value)),
    fetchBuffer(`${CONTEXT_ROOT}/${metadata.buildings.heightFile}`).then((value) => new Float32Array(value)),
    fetchBuffer(`${CONTEXT_ROOT}/${metadata.buildings.heightSourceFile}`).then((value) => new Uint8Array(value)),
    fetchBuffer(`${CONTEXT_ROOT}/${metadata.buildings.sourceFile}`).then((value) => new Uint8Array(value)),
    fetchBuffer(`${CONTEXT_ROOT}/${metadata.network.coordinateFile}`).then((value) => new Float32Array(value)),
    fetchBuffer(`${CONTEXT_ROOT}/${metadata.network.indexFile}`).then((value) => new Uint32Array(value)),
  ])
  if (buildingIndex.length !== metadata.buildings.count * 2
    || buildingHeights.length !== metadata.buildings.count
    || buildingHeightSource.length !== metadata.buildings.count
    || buildingSource.length !== metadata.buildings.count) {
    throw new Error('Building asset dimensions do not match context metadata')
  }
  if (networkIndex.length !== metadata.network.count * 3) {
    throw new Error('Network asset dimensions do not match context metadata')
  }
  return {
    metadata,
    buildingCoordinates,
    buildingIndex,
    buildingHeights,
    buildingHeightSource,
    buildingSource,
    networkCoordinates,
    networkIndex,
  }
}
