import type { MemberGrid, ScenarioData, ScenarioMetadata } from './types'

const SCENARIO_ROOT = '/scenarios/rain100mm-2h-loss5'

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
  for (let index = 0; index < cellCount; index += 1) {
    maximumDepth[index] = Math.max(...members.map((member) => member.depth[index]))
  }
  return { metadata, active, agreement, members, maximumDepth }
}
