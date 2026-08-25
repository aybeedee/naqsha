import type {
  AreaCatalog,
  MemberGrid,
  ScenarioData,
  ScenarioMetadata,
  UrbanContextData,
  UrbanContextMetadata,
  ViewId,
} from './types'

async function fetchBuffer(path: string): Promise<ArrayBuffer> {
  const response = await fetch(path)
  if (!response.ok) throw new Error(`Could not load ${path}: ${response.status}`)
  return response.arrayBuffer()
}

export async function loadCatalog(): Promise<AreaCatalog> {
  const response = await fetch('/catalog.json')
  if (!response.ok) throw new Error(`Could not load study-area catalog: ${response.status}`)
  const catalog = (await response.json()) as AreaCatalog
  if (!catalog.areas.length || !catalog.areas.some((area) => area.id === catalog.defaultArea)) {
    throw new Error('Study-area catalog has no valid default area')
  }
  return catalog
}

export async function loadScenario(scenarioRoot: string): Promise<ScenarioData> {
  const response = await fetch(`${scenarioRoot}/scenario.json`)
  if (!response.ok) throw new Error(`Could not load scenario metadata: ${response.status}`)
  const metadata = (await response.json()) as ScenarioMetadata
  const cellCount = metadata.grid.width * metadata.grid.height

  const [activeBuffer, agreementBuffer, ...memberBuffers] = await Promise.all([
    fetchBuffer(`${scenarioRoot}/${metadata.grid.activeFile}`),
    fetchBuffer(`${scenarioRoot}/${metadata.agreement.file}`),
    ...metadata.members.flatMap((member) => [
      fetchBuffer(`${scenarioRoot}/${member.terrainFile}`),
      fetchBuffer(`${scenarioRoot}/${member.depthFile}`),
      fetchBuffer(`${scenarioRoot}/${member.timelineFile}`),
    ]),
  ])

  const active = new Uint8Array(activeBuffer)
  const agreement = new Uint8Array(agreementBuffer)
  if (active.length !== cellCount || agreement.length !== cellCount) {
    throw new Error('Scenario mask dimensions do not match metadata')
  }

  const members: MemberGrid[] = metadata.members.map((member, index) => {
    const terrain = new Float32Array(memberBuffers[index * 3])
    const depth = new Float32Array(memberBuffers[index * 3 + 1])
    const timelineDepth = new Uint16Array(memberBuffers[index * 3 + 2])
    if (terrain.length !== cellCount || depth.length !== cellCount
      || timelineDepth.length !== cellCount * metadata.timeline.frameCount) {
      throw new Error(`Grid dimensions do not match metadata for ${member.id}`)
    }
    return { ...member, terrain, depth, timelineDepth }
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
  let roadImpact
  if (metadata.roadImpact) {
    const impact = metadata.roadImpact
    const [timelineDepth, timelineAgreement, peakDepth, peakAgreement, lengths] = await Promise.all([
      fetchBuffer(`${scenarioRoot}/${impact.timelineDepthFile}`).then((value) => new Uint16Array(value)),
      fetchBuffer(`${scenarioRoot}/${impact.timelineAgreementFile}`).then((value) => new Uint8Array(value)),
      fetchBuffer(`${scenarioRoot}/${impact.peakDepthFile}`).then((value) => new Uint16Array(value)),
      fetchBuffer(`${scenarioRoot}/${impact.peakAgreementFile}`).then((value) => new Uint8Array(value)),
      fetchBuffer(`${scenarioRoot}/${impact.lengthFile}`).then((value) => new Float32Array(value)),
    ])
    if (timelineDepth.length !== impact.frameCount * impact.lineCount
      || timelineAgreement.length !== impact.frameCount * impact.lineCount
      || peakDepth.length !== impact.lineCount || peakAgreement.length !== impact.lineCount
      || lengths.length !== impact.lineCount) {
      throw new Error('Road-impact dimensions do not match metadata')
    }
    roadImpact = {
      ...impact,
      timelineDepth,
      timelineAgreement,
      peakDepth,
      peakAgreement,
      lengths,
    }
  }
  return { metadata, active, agreement, members, maximumDepth, medianDepth, roadImpact }
}

export function timelineDepthForView(
  data: ScenarioData,
  view: Exclude<ViewId, 'agreement'>,
  frameIndex: number,
): Float32Array {
  const { frameCount, depthScaleMetres } = data.metadata.timeline
  if (!Number.isInteger(frameIndex) || frameIndex < 0 || frameIndex >= frameCount) {
    throw new RangeError(`Timeline frame ${frameIndex} is outside 0-${frameCount - 1}`)
  }
  const cellCount = data.metadata.grid.width * data.metadata.grid.height
  const offset = frameIndex * cellCount
  const result = new Float32Array(cellCount)
  if (view !== 'city') {
    const member = data.members.find((candidate) => candidate.id === view)
    if (!member) throw new Error(`No timeline data for ${view}`)
    for (let index = 0; index < cellCount; index += 1) {
      result[index] = member.timelineDepth[offset + index] * depthScaleMetres
    }
    return result
  }
  for (let index = 0; index < cellCount; index += 1) {
    const values = data.members.map((member) => member.timelineDepth[offset + index])
    result[index] = (values[0] + values[1] + values[2]
      - Math.min(...values) - Math.max(...values)) * depthScaleMetres
  }
  return result
}

export async function loadUrbanContext(contextRoot: string): Promise<UrbanContextData> {
  const response = await fetch(`${contextRoot}/context.json`)
  if (!response.ok) throw new Error(`Could not load urban context metadata: ${response.status}`)
  const metadata = (await response.json()) as UrbanContextMetadata
  const [buildingCoordinates, buildingIndex, buildingHeights, buildingHeightSource,
    buildingSource, networkCoordinates, networkIndex] = await Promise.all([
    fetchBuffer(`${contextRoot}/${metadata.buildings.coordinateFile}`).then((value) => new Float32Array(value)),
    fetchBuffer(`${contextRoot}/${metadata.buildings.indexFile}`).then((value) => new Uint32Array(value)),
    fetchBuffer(`${contextRoot}/${metadata.buildings.heightFile}`).then((value) => new Float32Array(value)),
    fetchBuffer(`${contextRoot}/${metadata.buildings.heightSourceFile}`).then((value) => new Uint8Array(value)),
    fetchBuffer(`${contextRoot}/${metadata.buildings.sourceFile}`).then((value) => new Uint8Array(value)),
    fetchBuffer(`${contextRoot}/${metadata.network.coordinateFile}`).then((value) => new Float32Array(value)),
    fetchBuffer(`${contextRoot}/${metadata.network.indexFile}`).then((value) => new Uint32Array(value)),
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
  let networkNames: string[] | undefined
  if (metadata.network.nameFile) {
    const namesResponse = await fetch(`${contextRoot}/${metadata.network.nameFile}`)
    if (!namesResponse.ok) throw new Error(`Could not load network names: ${namesResponse.status}`)
    networkNames = (await namesResponse.json()) as string[]
    if (networkNames.length !== metadata.network.count) {
      throw new Error('Network name count does not match context metadata')
    }
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
    networkNames,
  }
}
