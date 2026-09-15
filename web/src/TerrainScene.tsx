import { useEffect, useRef, useState } from 'react'
import * as THREE from 'three'
import { OrbitControls } from 'three/addons/controls/OrbitControls.js'
import { loadOsmBasemapTexture } from './basemap'
import { buildAgreementGeometry, buildTerrainGeometry, buildWaterGeometry } from './geometry'
import { buildBuildingGeometry, buildNetworkGeometry, elevationAt } from './urbanGeometry'
import type { Dimension, ScenarioData, UrbanContextData, UrbanLabel, ViewId } from './types'
import type { MapPlace } from './analysis'
import type { MapAction } from './Explorer'

interface Props {
  data: ScenarioData
  displayDepth: Float32Array
  context: UrbanContextData
  view: ViewId
  dimension: Dimension
  threshold: number
  verticalExaggeration: number
  waterDepthExaggeration: number
  showWater: boolean
  showBasemap: boolean
  showBuildings: boolean
  showNetwork: boolean
  showRoadImpacts: boolean
  roadImpactDepth?: Uint16Array
  roadImpactAgreement?: Uint8Array
  showLabels: boolean
  action: MapAction
  focus: MapPlace | null
  selected: MapPlace | null
  onSelect: (point: { x: number; z: number }) => void
}
type GroupName = 'terrain' | 'water' | 'buildings' | 'network' | 'impacts' | 'labels' | 'selection'
interface SceneState {
  scene: THREE.Scene
  camera: THREE.PerspectiveCamera
  renderer: THREE.WebGLRenderer
  controls: OrbitControls
  groups: Record<GroupName, THREE.Group>
  frame: number
  invalidate: () => void
}

function disposeGroup(group: THREE.Group): void {
  for (const child of [...group.children]) {
    group.remove(child)
    if ('geometry' in child && child.geometry instanceof THREE.BufferGeometry)
      child.geometry.dispose()
    if ('material' in child) {
      const material = child.material as THREE.Material | THREE.Material[]
      for (const item of Array.isArray(material) ? material : [material]) {
        // The basemap is shared with the React texture lifecycle, not owned by a mesh.
        if (child instanceof THREE.Sprite)
          item instanceof THREE.SpriteMaterial && item.map?.dispose()
        item.dispose()
      }
    }
  }
}

function resetCamera(state: SceneState, data: ScenarioData, dimension: Dimension) {
  const { camera, controls } = state
  const { extentWidthMetres: width, extentHeightMetres: height } = data.metadata.grid
  const fit =
    Math.max(width / camera.aspect, height * (dimension === '2d' ? 1 : 0.82)) /
    (2 * Math.tan(THREE.MathUtils.degToRad(camera.fov / 2)))
  const distance = Math.min(fit * 1.15, 20000)
  controls.target.set(0, 0, 0)
  if (dimension === '2d') {
    controls.screenSpacePanning = true
    camera.up.set(0, 0, -1)
    camera.position.set(0, distance, 0.01)
    controls.enableRotate = false
    controls.mouseButtons.LEFT = THREE.MOUSE.PAN
    controls.touches.ONE = THREE.TOUCH.PAN
  } else {
    controls.screenSpacePanning = false
    camera.up.set(0, 1, 0)
    camera.position.copy(new THREE.Vector3(0.22, 0.92, 0.7).normalize().multiplyScalar(distance))
    controls.enableRotate = true
    controls.mouseButtons.LEFT = THREE.MOUSE.ROTATE
    controls.touches.ONE = THREE.TOUCH.ROTATE
  }
  controls.touches.TWO = THREE.TOUCH.DOLLY_PAN
  camera.lookAt(controls.target)
  controls.update()
  state.invalidate()
}

const labelColors: Partial<Record<UrbanLabel['category'], string>> = {
  district: '#294b3e',
  road: '#655c49',
  healthcare: '#9c554c',
  park: '#467850',
  worship: '#7f6689',
  education: '#466e88',
  shopping: '#855d75',
  transit: '#84683e',
}
function createLabel(label: UrbanLabel): THREE.Sprite {
  const district = label.category === 'district'
  const canvas = document.createElement('canvas')
  const drawing = canvas.getContext('2d')!
  const font = `${district ? 650 : 550} ${district ? 34 : 30}px -apple-system, BlinkMacSystemFont, sans-serif`
  drawing.font = font
  const text = label.name.length > 42 ? `${label.name.slice(0, 40)}…` : label.name
  canvas.width = Math.ceil(Math.min(drawing.measureText(text).width, 600)) + 26
  canvas.height = 52
  drawing.font = font
  drawing.textAlign = 'center'
  drawing.textBaseline = 'middle'
  drawing.lineJoin = 'round'
  drawing.strokeStyle = '#fffffff0'
  drawing.lineWidth = 7
  drawing.strokeText(text, canvas.width / 2, 27, canvas.width - 20)
  drawing.fillStyle = labelColors[label.category] ?? '#526653'
  drawing.fillText(text, canvas.width / 2, 27, canvas.width - 20)
  const texture = new THREE.CanvasTexture(canvas)
  texture.colorSpace = THREE.SRGBColorSpace
  const sprite = new THREE.Sprite(
    new THREE.SpriteMaterial({
      map: texture,
      transparent: true,
      depthTest: false,
      depthWrite: false,
      toneMapped: false,
    }),
  )
  sprite.userData = {
    pixelWidth: canvas.width / 2.4,
    pixelHeight: canvas.height / 2.4,
    priority: label.priority,
    district,
  }
  sprite.renderOrder = 20
  return sprite
}

export function TerrainScene(props: Props) {
  const {
    data,
    context,
    displayDepth,
    view,
    dimension,
    threshold,
    verticalExaggeration,
    waterDepthExaggeration,
    showWater,
    showBasemap,
    showBuildings,
    showNetwork,
    showLabels,
    showRoadImpacts,
    roadImpactDepth,
    roadImpactAgreement,
    action,
    focus,
    selected,
    onSelect,
  } = props
  const hostRef = useRef<HTMLDivElement>(null)
  const sceneRef = useRef<SceneState | null>(null)
  const selectRef = useRef(onSelect)
  selectRef.current = onSelect
  const [texture, setTexture] = useState<THREE.CanvasTexture | null>(null)
  const [basemapFailed, setBasemapFailed] = useState(false)
  const [webglError, setWebglError] = useState(false)
  const [contextLost, setContextLost] = useState(false)
  const member =
    data.members.find(
      (item) => item.id === (view === 'city' || view === 'agreement' ? 'fabdem' : view),
    ) ?? data.members[0]
  const exaggeration = dimension === '2d' ? 0 : verticalExaggeration
  const surface = useRef({ dimension, member, exaggeration })
  surface.current = { dimension, member, exaggeration }

  useEffect(() => {
    if (!showBasemap) return
    const controller = new AbortController()
    let loaded: THREE.CanvasTexture | null = null
    setBasemapFailed(false)
    loadOsmBasemapTexture(data.metadata.grid.geographicBounds, 15, undefined, controller.signal)
      .then((next) => {
        if (controller.signal.aborted) {
          next.dispose()
          return
        }
        loaded = next
        setTexture(next)
      })
      .catch(() => {
        if (!controller.signal.aborted) setBasemapFailed(true)
      })
    return () => {
      controller.abort()
      loaded?.dispose()
      setTexture(null)
    }
  }, [data, showBasemap])

  useEffect(() => {
    const host = hostRef.current
    if (!host) return
    let renderer: THREE.WebGLRenderer
    try {
      renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false })
    } catch {
      setWebglError(true)
      return
    }
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2))
    renderer.setSize(host.clientWidth, host.clientHeight, false)
    renderer.outputColorSpace = THREE.SRGBColorSpace
    renderer.toneMapping = THREE.ACESFilmicToneMapping
    renderer.toneMappingExposure = 1.05
    renderer.domElement.setAttribute(
      'aria-label',
      'Lahore flood map. Drag to move. Click to inspect a location.',
    )
    renderer.domElement.tabIndex = 0
    host.appendChild(renderer.domElement)
    const scene = new THREE.Scene()
    scene.background = new THREE.Color('#e5ebe2')
    scene.fog = new THREE.Fog('#e5ebe2', 18000, 34000)
    const camera = new THREE.PerspectiveCamera(
      38,
      host.clientWidth / Math.max(host.clientHeight, 1),
      2,
      45000,
    )
    const controls = new OrbitControls(camera, renderer.domElement)
    controls.enableDamping = !window.matchMedia('(prefers-reduced-motion: reduce)').matches
    controls.dampingFactor = 0.12
    controls.minDistance = 180
    controls.maxDistance = 22000
    controls.maxPolarAngle = Math.PI * 0.46
    controls.zoomToCursor = true
    controls.screenSpacePanning = false
    scene.add(new THREE.HemisphereLight('#ffffff', '#899987', 2.0))
    const sun = new THREE.DirectionalLight('#fffae7', 2.5)
    sun.position.set(-2600, 4200, -1700)
    scene.add(sun)
    const groups = Object.fromEntries(
      (['terrain', 'water', 'buildings', 'network', 'impacts', 'labels', 'selection'] as const).map(
        (name) => [name, new THREE.Group()],
      ),
    ) as Record<GroupName, THREE.Group>
    Object.values(groups).forEach((group) => scene.add(group))
    const state: SceneState = {
      scene,
      camera,
      renderer,
      controls,
      groups,
      frame: 0,
      invalidate: () => {},
    }
    const projected = new THREE.Vector3()
    const cameraSpace = new THREE.Vector3()
    const render = () => {
      state.frame = 0
      controls.update()
      camera.updateMatrixWorld()
      const occupied: { left: number; right: number; top: number; bottom: number }[] = []
      const width = host.clientWidth
      const height = host.clientHeight
      const focal = height / (2 * Math.tan(THREE.MathUtils.degToRad(camera.fov / 2)))
      const marker = groups.selection.children.find((child) => child.userData.marker)
      if (marker)
        marker.scale.setScalar(((camera.position.distanceTo(marker.position) / focal) * 12) / 23)
      for (const child of groups.labels.children as THREE.Sprite[]) {
        cameraSpace.copy(child.position).applyMatrix4(camera.matrixWorldInverse)
        const distance = -cameraSpace.z
        const priority = child.userData.priority as number
        const maxDistance =
          priority >= 95
            ? 22000
            : priority >= 85
              ? 13000
              : priority >= 70
                ? 8000
                : priority >= 55
                  ? 4500
                  : 2300
        projected.copy(child.position).project(camera)
        if (
          distance < 0 ||
          distance > maxDistance ||
          Math.abs(projected.x) > 1 ||
          Math.abs(projected.y) > 1 ||
          projected.z > 1
        ) {
          child.visible = false
          continue
        }
        const pw = child.userData.pixelWidth as number
        const ph = child.userData.pixelHeight as number
        child.scale.set((pw * distance) / focal, (ph * distance) / focal, 1)
        const x = ((projected.x + 1) * width) / 2
        const y = ((1 - projected.y) * height) / 2
        const box = {
          left: x - pw / 2 - 4,
          right: x + pw / 2 + 4,
          top: y - ph / 2 - 3,
          bottom: y + ph / 2 + 3,
        }
        const overlaps = occupied.some(
          (other) =>
            box.left < other.right &&
            box.right > other.left &&
            box.top < other.bottom &&
            box.bottom > other.top,
        )
        child.visible =
          !overlaps &&
          box.left > 8 &&
          box.right < width - 8 &&
          box.top > 8 &&
          box.bottom < height - 8 &&
          !(box.top < 90 && box.left < 260) &&
          !(box.right > width - 105 && box.top < 250) &&
          !(box.bottom > height - 120 && box.left < 230)
        if (child.visible) occupied.push(box)
      }
      renderer.render(scene, camera)
    }
    state.invalidate = () => {
      if (!state.frame && !renderer.getContext().isContextLost())
        state.frame = requestAnimationFrame(render)
    }
    sceneRef.current = state
    controls.addEventListener('change', state.invalidate)
    const observer = new ResizeObserver(() => {
      const w = host.clientWidth
      const h = host.clientHeight
      if (!w || !h) return
      renderer.setSize(w, h, false)
      camera.aspect = w / h
      camera.updateProjectionMatrix()
      state.invalidate()
    })
    observer.observe(host)
    const pointerStart = new THREE.Vector2()
    const raycaster = new THREE.Raycaster()
    let dragged = false
    let primaryPointer = -1
    const down = (event: PointerEvent) => {
      if (!event.isPrimary) {
        dragged = true
        return
      }
      primaryPointer = event.pointerId
      pointerStart.set(event.clientX, event.clientY)
      dragged = event.button !== 0
    }
    const move = (event: PointerEvent) => {
      if (Math.hypot(event.clientX - pointerStart.x, event.clientY - pointerStart.y) > 5)
        dragged = true
    }
    const up = (event: PointerEvent) => {
      if (dragged || event.pointerId !== primaryPointer) return
      const bounds = renderer.domElement.getBoundingClientRect()
      raycaster.setFromCamera(
        new THREE.Vector2(
          ((event.clientX - bounds.left) / bounds.width) * 2 - 1,
          (-(event.clientY - bounds.top) / bounds.height) * 2 + 1,
        ),
        camera,
      )
      const hit = raycaster.intersectObjects(groups.terrain.children)[0]
      if (hit) selectRef.current({ x: hit.point.x, z: hit.point.z })
    }
    const lost = (event: Event) => {
      event.preventDefault()
      setContextLost(true)
    }
    const restored = () => {
      setContextLost(false)
      state.invalidate()
    }
    renderer.domElement.addEventListener('pointerdown', down)
    renderer.domElement.addEventListener('pointermove', move)
    renderer.domElement.addEventListener('pointerup', up)
    renderer.domElement.addEventListener('webglcontextlost', lost)
    renderer.domElement.addEventListener('webglcontextrestored', restored)
    resetCamera(state, data, surface.current.dimension)
    return () => {
      state.invalidate = () => {}
      cancelAnimationFrame(state.frame)
      observer.disconnect()
      controls.dispose()
      renderer.domElement.removeEventListener('pointerdown', down)
      renderer.domElement.removeEventListener('pointermove', move)
      renderer.domElement.removeEventListener('pointerup', up)
      renderer.domElement.removeEventListener('webglcontextlost', lost)
      renderer.domElement.removeEventListener('webglcontextrestored', restored)
      Object.values(groups).forEach(disposeGroup)
      renderer.dispose()
      renderer.domElement.remove()
      sceneRef.current = null
    }
  }, [data, context])

  useEffect(() => {
    const state = sceneRef.current
    if (!state) return
    disposeGroup(state.groups.terrain)
    const geometry = buildTerrainGeometry({
      grid: data.metadata.grid,
      active: data.active,
      terrain: member.terrain,
      terrainMinimum: member.terrainMinimumMetres,
      verticalExaggeration: exaggeration,
    })
    const mapped = showBasemap ? texture : null
    if (mapped) mapped.anisotropy = state.renderer.capabilities.getMaxAnisotropy()
    const mesh = new THREE.Mesh(
      geometry,
      new THREE.MeshStandardMaterial({
        color: mapped ? '#ffffff' : '#bfcdb6',
        vertexColors: !mapped && view !== 'city',
        map: mapped,
        roughness: 1,
        side: THREE.DoubleSide,
      }),
    )
    state.groups.terrain.add(mesh)
    state.invalidate()
  }, [data, member, exaggeration, texture, showBasemap, view])

  useEffect(() => {
    const state = sceneRef.current
    if (!state) return
    disposeGroup(state.groups.water)
    if (showWater) {
      const options = {
        grid: data.metadata.grid,
        active: data.active,
        terrain: member.terrain,
        terrainMinimum: member.terrainMinimumMetres,
        verticalExaggeration: exaggeration,
        waterDepthExaggeration: dimension === '2d' ? 0 : waterDepthExaggeration,
        waterBaseOffset: dimension === '2d' ? 4 : 0.4,
      }
      const geometry =
        view === 'agreement'
          ? buildAgreementGeometry(options, data.maximumDepth, data.agreement)
          : buildWaterGeometry(options, displayDepth, threshold)
      // Unlit colours keep the legend meaningful at every angle and time.
      const mesh = new THREE.Mesh(
        geometry,
        new THREE.MeshBasicMaterial({
          vertexColors: true,
          transparent: true,
          opacity: view === 'agreement' ? 0.76 : 0.78,
          side: THREE.DoubleSide,
          depthWrite: false,
          toneMapped: false,
        }),
      )
      mesh.renderOrder = 5
      state.groups.water.add(mesh)
    }
    state.invalidate()
  }, [
    data,
    member,
    exaggeration,
    waterDepthExaggeration,
    dimension,
    view,
    displayDepth,
    threshold,
    showWater,
  ])

  // Buildings and labels deliberately do not depend on the flood frame.
  useEffect(() => {
    const state = sceneRef.current
    if (!state) return
    disposeGroup(state.groups.buildings)
    if (showBuildings) {
      const geometry = buildBuildingGeometry({
        context,
        grid: data.metadata.grid,
        terrain: member.terrain,
        terrainMinimum: member.terrainMinimumMetres,
        verticalExaggeration: exaggeration,
        flat: dimension === '2d',
      })
      state.groups.buildings.add(
        new THREE.Mesh(
          geometry,
          new THREE.MeshStandardMaterial({
            vertexColors: true,
            roughness: 0.95,
            side: THREE.DoubleSide,
          }),
        ),
      )
    }
    state.invalidate()
  }, [data, context, member, exaggeration, dimension, showBuildings])

  useEffect(() => {
    const state = sceneRef.current
    if (!state) return
    disposeGroup(state.groups.network)
    if (showNetwork) {
      const geometry = buildNetworkGeometry({
        context,
        grid: data.metadata.grid,
        terrain: member.terrain,
        terrainMinimum: member.terrainMinimumMetres,
        verticalExaggeration: exaggeration,
        flat: dimension === '2d',
      })
      const mesh = new THREE.Mesh(
        geometry,
        new THREE.MeshBasicMaterial({
          vertexColors: true,
          side: THREE.DoubleSide,
          toneMapped: false,
        }),
      )
      mesh.renderOrder = 3
      state.groups.network.add(mesh)
    }
    state.invalidate()
  }, [data, context, member, exaggeration, dimension, showNetwork])

  useEffect(() => {
    const state = sceneRef.current
    if (!state) return
    disposeGroup(state.groups.impacts)
    if (showNetwork && showRoadImpacts && view === 'city') {
      const geometry = buildNetworkGeometry(
        {
          context,
          grid: data.metadata.grid,
          terrain: member.terrain,
          terrainMinimum: member.terrainMinimumMetres,
          verticalExaggeration: exaggeration,
          flat: dimension === '2d',
        },
        roadImpactDepth,
        roadImpactAgreement,
        data.roadImpact?.memberCount,
        threshold,
        true,
      )
      const mesh = new THREE.Mesh(
        geometry,
        new THREE.MeshBasicMaterial({
          vertexColors: true,
          side: THREE.DoubleSide,
          toneMapped: false,
          depthTest: false,
          depthWrite: false,
        }),
      )
      mesh.renderOrder = 7
      state.groups.impacts.add(mesh)
    }
    state.invalidate()
  }, [
    data,
    context,
    member,
    exaggeration,
    dimension,
    view,
    showNetwork,
    showRoadImpacts,
    roadImpactDepth,
    roadImpactAgreement,
    threshold,
  ])

  useEffect(() => {
    const state = sceneRef.current
    if (!state) return
    disposeGroup(state.groups.labels)
    if (showLabels) {
      for (const label of [...context.metadata.labels].sort((a, b) => b.priority - a.priority)) {
        const sprite = createLabel(label)
        const y = elevationAt(label.x, label.z, {
          grid: data.metadata.grid,
          terrain: member.terrain,
          terrainMinimum: member.terrainMinimumMetres,
          verticalExaggeration: exaggeration,
          flat: dimension === '2d',
        })
        sprite.position.set(label.x, y + (dimension === '2d' ? 8 : 22), label.z)
        state.groups.labels.add(sprite)
      }
    }
    state.invalidate()
  }, [data, context, member, exaggeration, dimension, showLabels])

  useEffect(() => {
    const state = sceneRef.current
    if (!state) return
    disposeGroup(state.groups.selection)
    if (selected) {
      const options = {
        grid: data.metadata.grid,
        terrain: member.terrain,
        terrainMinimum: member.terrainMinimumMetres,
        verticalExaggeration: exaggeration,
        flat: dimension === '2d',
      }
      const ring = new THREE.Mesh(
        new THREE.RingGeometry(17, 23, 48),
        new THREE.MeshBasicMaterial({
          color: '#224f42',
          side: THREE.DoubleSide,
          depthTest: false,
          toneMapped: false,
        }),
      )
      ring.rotation.x = -Math.PI / 2
      ring.position.set(selected.x, elevationAt(selected.x, selected.z, options) + 6, selected.z)
      ring.renderOrder = 19
      ring.userData.marker = true
      state.groups.selection.add(ring)
      if (selected.roadName && context.networkNames) {
        const points: THREE.Vector3[] = []
        context.networkNames.forEach((name, line) => {
          if (name.trim() !== selected.roadName) return
          const start = context.networkIndex[line * 3]
          const length = context.networkIndex[line * 3 + 1]
          for (let i = start; i < start + length - 1; i += 1) {
            for (const p of [i, i + 1]) {
              const x = context.networkCoordinates[p * 2]
              const z = context.networkCoordinates[p * 2 + 1]
              points.push(new THREE.Vector3(x, elevationAt(x, z, options) + 5, z))
            }
          }
        })
        const line = new THREE.LineSegments(
          new THREE.BufferGeometry().setFromPoints(points),
          new THREE.LineBasicMaterial({ color: '#254e3d', depthTest: false, toneMapped: false }),
        )
        line.renderOrder = 18
        state.groups.selection.add(line)
      }
    }
    state.invalidate()
  }, [selected, data, context, member, exaggeration, dimension])

  useEffect(() => {
    if (sceneRef.current) resetCamera(sceneRef.current, data, dimension)
  }, [data, dimension])
  useEffect(() => {
    const state = sceneRef.current
    if (!state) return
    const { camera, controls } = state
    if (action.type === 'reset') resetCamera(state, data, dimension)
    else if (action.type === 'north') {
      const delta = camera.position.clone().sub(controls.target)
      camera.position
        .copy(controls.target)
        .add(new THREE.Vector3(0, delta.y, Math.hypot(delta.x, delta.z)))
    } else {
      const delta = camera.position.clone().sub(controls.target)
      const distance = THREE.MathUtils.clamp(
        delta.length() * (action.type === 'in' ? 0.7 : 1.4),
        controls.minDistance,
        controls.maxDistance,
      )
      camera.position.copy(controls.target).add(delta.setLength(distance))
    }
    controls.update()
    state.invalidate()
    // A command should not replay when an unrelated view property changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [action])
  useEffect(() => {
    const state = sceneRef.current
    if (!state || !focus) return
    const { camera, controls } = state
    const offset = camera.position
      .clone()
      .sub(controls.target)
      .setLength(Math.min(camera.position.distanceTo(controls.target), 1600))
    const { member: terrain, exaggeration: ex, dimension: dim } = surface.current
    const y = elevationAt(focus.x, focus.z, {
      grid: data.metadata.grid,
      terrain: terrain.terrain,
      terrainMinimum: terrain.terrainMinimumMetres,
      verticalExaggeration: ex,
      flat: dim === '2d',
    })
    controls.target.set(focus.x, y, focus.z)
    camera.position.copy(controls.target).add(offset)
    controls.update()
    state.invalidate()
  }, [focus, data])

  return (
    <>
      <div className="scene" ref={hostRef} />
      {(webglError || contextLost) && (
        <div className="scene-error" role="alert">
          <h2>{contextLost ? 'The map paused.' : '3D graphics are unavailable.'}</h2>
          <p>
            {contextLost
              ? 'Your browser released the graphics context. Reload to restore the map.'
              : 'Try a browser with WebGL enabled. You can still explore the storm and road summaries.'}
          </p>
          <button className="primary-button" onClick={() => window.location.reload()}>
            Reload map
          </button>
        </div>
      )}
      {basemapFailed && showBasemap && (
        <div className="map-status" role="status">
          Basemap unavailable. Local buildings, roads and labels are still shown.
        </div>
      )}
    </>
  )
}
