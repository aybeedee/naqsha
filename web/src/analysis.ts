import type { ScenarioData, UrbanContextData, UrbanLabel, ViewId } from './types'

export interface MapPlace {
  id: string
  name: string
  kind: string
  x: number
  z: number
  roadName?: string
  aliases?: string[]
}

export function formatDepth(metres: number): string {
  if (metres < 0.005) return '0 cm'
  if (metres < 0.01) return '<1 cm'
  return metres < 1 ? `${Math.round(metres * 100)} cm` : `${metres.toFixed(1)} m`
}

export function elapsedLabel(seconds: number): string {
  const minutes = Math.round(seconds / 60)
  return `${Math.floor(minutes / 60)}:${String(minutes % 60).padStart(2, '0')}`
}

export function cellAt(data: ScenarioData, x: number, z: number): number | null {
  const { width, height, cellSizeMetres } = data.metadata.grid
  const column = Math.round(x / cellSizeMetres + (width - 1) / 2)
  const row = Math.round(z / cellSizeMetres + (height - 1) / 2)
  if (column < 0 || row < 0 || column >= width || row >= height) return null
  const index = row * width + column
  return data.active[index] ? index : null
}

// Peak of the frame-by-frame median, matching the exported road timelines.
// Median of each model's independent maximum is a different statistic.
export function sampledPeakDepth(
  data: ScenarioData,
  view: Exclude<ViewId, 'agreement'>,
): Float32Array {
  const count = data.active.length
  const result = new Float32Array(count)
  const members =
    view === 'city' ? data.members : data.members.filter((member) => member.id === view)
  for (let frame = 0; frame < data.metadata.timeline.frameCount; frame += 1) {
    for (let cell = 0; cell < count; cell += 1) {
      const values = members
        .map((member) => member.timelineDepth[frame * count + cell])
        .sort((a, b) => a - b)
      const middle = Math.floor(values.length / 2)
      const median = values.length % 2 ? values[middle] : (values[middle - 1] + values[middle]) / 2
      result[cell] = Math.max(result[cell], median * data.metadata.timeline.depthScaleMetres)
    }
  }
  return result
}

export function floodedArea(data: ScenarioData, depths: Float32Array, threshold: number): number {
  let count = 0
  // Numerical tolerance compensates for float32 representation at the threshold.
  for (let i = 0; i < depths.length; i += 1) {
    if (data.active[i] && depths[i] + 1e-7 >= threshold) count += 1
  }
  return (count * data.metadata.grid.cellSizeMetres ** 2) / 1e6
}

export function buildPlaces(context: UrbanContextData): MapPlace[] {
  const places: MapPlace[] = []
  const used = new Set<string>()
  const labels = [...context.metadata.labels].sort((a, b) => b.priority - a.priority)
  for (const label of labels) {
    if (label.category === 'road') continue // Search uses the actual network below.
    const key = `${label.name.trim().toLocaleLowerCase()}:${Math.round(label.x / 25)}:${Math.round(label.z / 25)}`
    if (!label.name.trim() || used.has(key)) continue
    used.add(key)
    places.push({
      id: `label:${places.length}`,
      name: label.name,
      kind: label.category === 'district' ? 'Neighbourhood' : label.kind.replaceAll('_', ' '),
      x: label.x,
      z: label.z,
      aliases: label.aliases,
    })
  }
  const roads = new Map<string, { name: string; x: number; z: number; length: number }>()
  context.networkNames?.forEach((name, line) => {
    if (!name.trim() || context.networkIndex[line * 3 + 2] > 6) return
    const key = name.trim().toLocaleLowerCase()
    const offset = context.networkIndex[line * 3]
    const length = context.networkIndex[line * 3 + 1]
    let longest = 0
    let x = 0
    let z = 0
    for (let i = offset; i < offset + length - 1; i += 1) {
      const x1 = context.networkCoordinates[i * 2]
      const z1 = context.networkCoordinates[i * 2 + 1]
      const x2 = context.networkCoordinates[i * 2 + 2]
      const z2 = context.networkCoordinates[i * 2 + 3]
      const segment = Math.hypot(x2 - x1, z2 - z1)
      if (segment > longest) {
        longest = segment
        x = (x1 + x2) / 2
        z = (z1 + z2) / 2
      }
    }
    if (longest > (roads.get(key)?.length ?? 0))
      roads.set(key, { name: name.trim(), x, z, length: longest })
  })
  for (const road of roads.values()) {
    places.push({
      id: `road:${road.name}`,
      name: road.name,
      kind: 'Road',
      roadName: road.name,
      x: road.x,
      z: road.z,
    })
  }
  return places
}

export function searchPlaces(places: MapPlace[], query: string): MapPlace[] {
  const text = query.normalize('NFKC').trim().toLocaleLowerCase()
  if (!text) return places.filter((place) => place.kind !== 'Road').slice(0, 6)
  return places
    .filter((place) =>
      [place.name, ...(place.aliases ?? [])].some((name) =>
        name.normalize('NFKC').toLocaleLowerCase().includes(text),
      ),
    )
    .sort(
      (a, b) =>
        Number(b.name.toLocaleLowerCase().startsWith(text)) -
        Number(a.name.toLocaleLowerCase().startsWith(text)),
    )
    .slice(0, 8)
}

export function roadSummary(
  data: ScenarioData,
  context: UrbanContextData,
  frame: number,
  peak: boolean,
  threshold: number,
) {
  const impact = data.roadImpact
  if (!impact) return { named: [], segments: 0, totalSegments: 0, flaggedLengthKm: 0 }
  const offset = frame * impact.lineCount
  const depths = peak
    ? impact.peakDepth
    : impact.timelineDepth.subarray(offset, offset + impact.lineCount)
  const agreement = peak
    ? impact.peakAgreement
    : impact.timelineAgreement.subarray(offset, offset + impact.lineCount)
  const named = new Map<
    string,
    { name: string; depth: number; segments: number; agreement: number; x: number; z: number }
  >()
  let segments = 0
  let totalSegments = 0
  let flaggedLengthKm = 0
  for (let line = 0; line < impact.lineCount; line += 1) {
    if (depths[line] === impact.nodataDepth) continue
    totalSegments += 1
    const depth = depths[line] * impact.depthScaleMetres
    if (depth + 1e-7 < threshold) continue
    segments += 1
    flaggedLengthKm += impact.lengths[line] / 1000
    const name = context.networkNames?.[line]?.trim()
    if (!name) continue
    const current = named.get(name) ?? { name, depth: -1, segments: 0, agreement: 0, x: 0, z: 0 }
    current.segments += 1
    if (depth > current.depth) {
      current.depth = depth
      current.agreement = agreement[line]
      // A point on the worst segment is more useful than the centroid of a long road.
      const start = context.networkIndex[line * 3]
      const length = context.networkIndex[line * 3 + 1]
      const point = start + Math.floor(length / 2)
      current.x = context.networkCoordinates[point * 2]
      current.z = context.networkCoordinates[point * 2 + 1]
    }
    named.set(name, current)
  }
  return {
    named: [...named.values()].sort((a, b) => b.depth - a.depth || b.segments - a.segments),
    segments,
    totalSegments,
    flaggedLengthKm,
  }
}

export function neighbourhoodSummary(
  data: ScenarioData,
  context: UrbanContextData,
  depth: Float32Array,
  threshold: number,
) {
  const { cellSizeMetres, width, height } = data.metadata.grid
  const radius = 250 / cellSizeMetres
  const results = new Map<string, { label: UrbanLabel; fraction: number }>()
  for (const label of context.metadata.labels.filter((label) => label.category === 'district')) {
    const cx = label.x / cellSizeMetres + (width - 1) / 2
    const cz = label.z / cellSizeMetres + (height - 1) / 2
    let total = 0
    let wet = 0
    for (
      let row = Math.max(0, Math.ceil(cz - radius));
      row <= Math.min(height - 1, Math.floor(cz + radius));
      row += 1
    ) {
      for (
        let column = Math.max(0, Math.ceil(cx - radius));
        column <= Math.min(width - 1, Math.floor(cx + radius));
        column += 1
      ) {
        const i = row * width + column
        if (!data.active[i] || (column - cx) ** 2 + (row - cz) ** 2 > radius ** 2) continue
        total += 1
        if (depth[i] + 1e-7 >= threshold) wet += 1
      }
    }
    const fraction = total ? wet / total : 0
    if (fraction > (results.get(label.name)?.fraction ?? 0))
      results.set(label.name, { label, fraction })
  }
  return [...results.values()].sort((a, b) => b.fraction - a.fraction).slice(0, 3)
}
