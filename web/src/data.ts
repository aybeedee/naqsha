import type {
  MemberGrid,
  ScenarioData,
  ScenarioMetadata,
  UrbanContextData,
  UrbanContextMetadata,
  ViewId,
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
      fetchBuffer(`${SCENARIO_ROOT}/${member.timelineFile}`),
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
      fetchBuffer(`${SCENARIO_ROOT}/${impact.timelineDepthFile}`).then((value) => new Uint16Array(value)),
      fetchBuffer(`${SCENARIO_ROOT}/${impact.timelineAgreementFile}`).then((value) => new Uint8Array(value)),
      fetchBuffer(`${SCENARIO_ROOT}/${impact.peakDepthFile}`).then((value) => new Uint16Array(value)),
      fetchBuffer(`${SCENARIO_ROOT}/${impact.peakAgreementFile}`).then((value) => new Uint8Array(value)),
      fetchBuffer(`${SCENARIO_ROOT}/${impact.lengthFile}`).then((value) => new Float32Array(value)),
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
