import { useEffect, useRef, useState } from 'react'
import * as THREE from 'three'
import { OrbitControls } from 'three/addons/controls/OrbitControls.js'
import { loadOsmBasemapTexture } from './basemap'
import { buildAgreementGeometry, buildTerrainGeometry, buildWaterGeometry } from './geometry'
import {
  buildBuildingGeometry,
  buildBuildingEdges,
  buildLandcoverGeometry,
  buildNetworkGeometry,
  elevationAt,
} from './urbanGeometry'
import { mapLabels, MapLabelRenderer } from './mapLabels'
import type { MapLabel } from './mapLabels'
import type { Dimension, ScenarioData, UrbanContextData, ViewId } from './types'
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
  onSelect: (point: {
    x: number
    z: number
    name?: string
    kind?: string
    roadName?: string
  }) => void
}
type GroupName = 'terrain' | 'water' | 'buildings' | 'network' | 'impacts' | 'selection'
interface SceneState {
  scene: THREE.Scene
  camera: THREE.PerspectiveCamera
  renderer: THREE.WebGLRenderer
  controls: OrbitControls
  groups: Record<GroupName, THREE.Group>
  frame: number
  invalidate: () => void
  flyTo: (position: THREE.Vector3, target: THREE.Vector3) => void
  stopMotion: () => void
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
  state.stopMotion()
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
    controls.mouseButtons.RIGHT = THREE.MOUSE.PAN
    controls.touches.ONE = THREE.TOUCH.PAN
  } else {
    controls.screenSpacePanning = false
    camera.up.set(0, 1, 0)
    camera.position.copy(new THREE.Vector3(0.22, 0.92, 0.7).normalize().multiplyScalar(distance))
    controls.enableRotate = true
    controls.mouseButtons.LEFT = THREE.MOUSE.PAN
    controls.mouseButtons.RIGHT = THREE.MOUSE.ROTATE
    controls.touches.ONE = THREE.TOUCH.PAN
  }
  controls.touches.TWO = THREE.TOUCH.DOLLY_PAN
  camera.lookAt(controls.target)
  controls.update()
  state.invalidate()
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
  const labelOptions = useRef({ showLabels, selected })
  labelOptions.current = { showLabels, selected }
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
    renderer.toneMappingExposure = 0.95
    renderer.shadowMap.enabled = true
    renderer.shadowMap.type = THREE.PCFSoftShadowMap
    renderer.shadowMap.autoUpdate = false
    renderer.domElement.setAttribute(
      'aria-label',
      'Lahore flood map. Drag to pan, right-drag to orbit. Click a place name or the map to inspect.',
    )
    renderer.domElement.tabIndex = 0
    host.appendChild(renderer.domElement)
    const labelCanvas = document.createElement('canvas')
    labelCanvas.className = 'map-label-canvas'
    labelCanvas.setAttribute('aria-hidden', 'true')
    host.appendChild(labelCanvas)
    const labels = new MapLabelRenderer(labelCanvas, mapLabels(context))
    const scale = document.createElement('div')
    scale.className = 'map-scale'
    scale.title = 'Approximate scale at the centre of the view'
    host.appendChild(scale)
    let hovered: MapLabel | null = null
    const scene = new THREE.Scene()
    scene.background = new THREE.Color('#101c25')
    scene.fog = new THREE.Fog('#101c25', 14000, 28000)
    const camera = new THREE.PerspectiveCamera(
      38,
      host.clientWidth / Math.max(host.clientHeight, 1),
      2,
      45000,
    )
    const controls = new OrbitControls(camera, renderer.domElement)
    const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches
    controls.enableDamping = !reducedMotion
    controls.dampingFactor = 0.12
    controls.minDistance = 100
    controls.maxDistance = 22000
    controls.maxPolarAngle = Math.PI * 0.46
    controls.zoomToCursor = true
    controls.screenSpacePanning = false
    scene.add(new THREE.HemisphereLight('#cbe2f2', '#17242a', 1.65))
    const sun = new THREE.DirectionalLight('#ffefd3', 2.4)
    sun.position.set(-2600, 3200, -1700)
    sun.castShadow = true
    sun.shadow.mapSize.set(2048, 2048)
    const shadowExtent =
      Math.max(data.metadata.grid.extentWidthMetres, data.metadata.grid.extentHeightMetres) * 0.72
    Object.assign(sun.shadow.camera, {
      left: -shadowExtent,
      right: shadowExtent,
      top: shadowExtent,
      bottom: -shadowExtent,
      near: 100,
      far: 12000,
    })
    sun.shadow.camera.updateProjectionMatrix()
    sun.shadow.normalBias = 1.2
    sun.shadow.bias = -0.0001
    sun.shadow.intensity = 0.45
    scene.add(sun)
    const groups = Object.fromEntries(
      (['terrain', 'water', 'buildings', 'network', 'impacts', 'selection'] as const).map(
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
      flyTo: () => {},
      stopMotion: () => {},
    }
    let flight: {
      position: THREE.Vector3
      target: THREE.Vector3
      to: THREE.Vector3
      lookAt: THREE.Vector3
      start: number
    } | null = null
    state.stopMotion = () => {
      flight = null
    }
    controls.addEventListener('start', state.stopMotion)
    state.flyTo = (position, target) => {
      if (reducedMotion) {
        camera.position.copy(position)
        controls.target.copy(target)
        controls.update()
      } else
        flight = {
          position: camera.position.clone(),
          target: controls.target.clone(),
          to: position.clone(),
          lookAt: target.clone(),
          start: performance.now(),
        }
      state.invalidate()
    }
    const render = () => {
      state.frame = 0
      if (flight) {
        const progress = Math.min(1, (performance.now() - flight.start) / 420)
        const ease = 1 - (1 - progress) ** 3
        camera.position.lerpVectors(flight.position, flight.to, ease)
        controls.target.lerpVectors(flight.target, flight.lookAt, ease)
        if (progress >= 1) flight = null
        else state.invalidate()
      }
      controls.update()
      camera.updateMatrixWorld()
      const width = host.clientWidth
      const height = host.clientHeight
      const focal = height / (2 * Math.tan(THREE.MathUtils.degToRad(camera.fov / 2)))
      const marker = groups.selection.children.find((child) => child.userData.marker)
      if (marker)
        marker.scale.setScalar(((camera.position.distanceTo(marker.position) / focal) * 12) / 23)
      const rect = host.getBoundingClientRect()
      const blocked = [
        ...(host
          .closest('.workspace')
          ?.querySelectorAll(
            '.map-caption,.map-tools,.selection-card,.legend,.navigation-hint,.map-view-options,.sidebar:not([hidden])',
          ) ?? []),
      ].map((element) => {
        const b = element.getBoundingClientRect()
        return {
          left: b.left - rect.left - 5,
          right: b.right - rect.left + 5,
          top: b.top - rect.top - 5,
          bottom: b.bottom - rect.top + 5,
        }
      })
      blocked.push({ left: width - 130, right: width, top: height - 40, bottom: height })
      const s = surface.current
      labels.draw(
        camera,
        width,
        height,
        (x, z) =>
          elevationAt(x, z, {
            grid: data.metadata.grid,
            terrain: s.member.terrain,
            terrainMinimum: s.member.terrainMinimumMetres,
            verticalExaggeration: s.exaggeration,
            flat: s.dimension === '2d',
          }),
        blocked,
        labelOptions.current.showLabels,
        hovered,
        labelOptions.current.selected,
      )
      const metresPerPixel = camera.position.distanceTo(controls.target) / focal
      const power = 10 ** Math.floor(Math.log10(metresPerPixel * 100))
      const length = [5, 2, 1].map((v) => v * power).find((v) => v / metresPerPixel <= 110) ?? power
      scale.textContent = length >= 1000 ? `${length / 1000} km` : `${length} m`
      scale.style.width = `${length / metresPerPixel}px`
      const bearing = Math.atan2(
        camera.position.x - controls.target.x,
        camera.position.z - controls.target.z,
      )
      host.parentElement?.style.setProperty('--bearing', `${-bearing}rad`)
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
      flight = null
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
      if (event.buttons) return
      const bounds = renderer.domElement.getBoundingClientRect()
      const next = labels.hit(event.clientX - bounds.left, event.clientY - bounds.top)
      if (next !== hovered) {
        hovered = next
        renderer.domElement.style.cursor = hovered ? 'pointer' : 'grab'
        renderer.domElement.title = hovered ? `${hovered.name} · ${hovered.kind}` : ''
        state.invalidate()
      }
    }
    const up = (event: PointerEvent) => {
      if (dragged || event.pointerId !== primaryPointer) return
      const bounds = renderer.domElement.getBoundingClientRect()
      const label = labels.hit(event.clientX - bounds.left, event.clientY - bounds.top)
      if (label) {
        selectRef.current({
          x: label.x,
          z: label.z,
          name: label.name,
          kind: label.kind,
          roadName: label.roadName,
        })
        return
      }
      raycaster.setFromCamera(
        new THREE.Vector2(
          ((event.clientX - bounds.left) / bounds.width) * 2 - 1,
          (-(event.clientY - bounds.top) / bounds.height) * 2 + 1,
        ),
        camera,
      )
      const hit = raycaster.intersectObjects(
        groups.terrain.children.filter((child) => child instanceof THREE.Mesh),
      )[0]
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
      sun.shadow.map?.dispose()
      renderer.dispose()
      renderer.domElement.remove()
      labelCanvas.remove()
      scale.remove()
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
        color: mapped || view !== 'city' ? '#ffffff' : '#1e3038',
        vertexColors: !mapped && view !== 'city',
        map: mapped,
        roughness: 1,
        side: THREE.DoubleSide,
      }),
    )
    mesh.receiveShadow = true
    state.groups.terrain.add(mesh)
    // A quiet, explicit study boundary; outside this area no result is implied.
    const grid = data.metadata.grid
    const boundary: THREE.Vector3[] = []
    const halfX = ((grid.width - 1) * grid.cellSizeMetres) / 2
    const halfZ = ((grid.height - 1) * grid.cellSizeMetres) / 2
    for (const [x, z] of [
      [-halfX, -halfZ],
      [halfX, -halfZ],
      [halfX, halfZ],
      [-halfX, halfZ],
      [-halfX, -halfZ],
    ])
      boundary.push(
        new THREE.Vector3(
          x,
          elevationAt(x, z, {
            grid,
            terrain: member.terrain,
            terrainMinimum: member.terrainMinimumMetres,
            verticalExaggeration: exaggeration,
            flat: dimension === '2d',
          }) + 2,
          z,
        ),
      )
    const line = new THREE.Line(
      new THREE.BufferGeometry().setFromPoints(boundary),
      new THREE.LineDashedMaterial({
        color: '#668b92',
        transparent: true,
        opacity: 0.55,
        dashSize: 24,
        gapSize: 16,
        toneMapped: false,
      }),
    )
    line.computeLineDistances()
    state.groups.terrain.add(line)
    state.renderer.shadowMap.needsUpdate = true
    state.invalidate()
  }, [data, member, exaggeration, texture, showBasemap, view, dimension])

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
      if (view !== 'agreement' && geometry.userData.shoreline?.length) {
        const shore = new THREE.BufferGeometry()
        shore.setAttribute('position', new THREE.BufferAttribute(geometry.userData.shoreline, 3))
        const outline = new THREE.LineSegments(
          shore,
          new THREE.LineBasicMaterial({
            color: '#b5e6eb',
            transparent: true,
            opacity: 0.32,
            depthWrite: false,
            toneMapped: false,
          }),
        )
        outline.renderOrder = 6
        state.groups.water.add(outline)
      }
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
      const mesh = new THREE.Mesh(
        geometry,
        new THREE.MeshStandardMaterial({
          vertexColors: true,
          roughness: 0.84,
          side: THREE.DoubleSide,
        }),
      )
      mesh.castShadow = dimension === '3d'
      mesh.receiveShadow = true
      state.groups.buildings.add(mesh)
      const edges = new THREE.LineSegments(
        buildBuildingEdges({
          context,
          grid: data.metadata.grid,
          terrain: member.terrain,
          terrainMinimum: member.terrainMinimumMetres,
          verticalExaggeration: exaggeration,
          flat: dimension === '2d',
        }),
        new THREE.LineBasicMaterial({
          color: '#99b1b4',
          transparent: true,
          opacity: dimension === '2d' ? 0.22 : 0.3,
          toneMapped: false,
        }),
      )
      state.groups.buildings.add(edges)
    }
    state.renderer.shadowMap.needsUpdate = true
    state.invalidate()
  }, [data, context, member, exaggeration, dimension, showBuildings])

  useEffect(() => {
    const state = sceneRef.current
    if (!state) return
    disposeGroup(state.groups.network)
    if (showNetwork) {
      const options = {
        context,
        grid: data.metadata.grid,
        terrain: member.terrain,
        terrainMinimum: member.terrainMinimumMetres,
        verticalExaggeration: exaggeration,
        flat: dimension === '2d',
      }
      const geometry = buildNetworkGeometry(options)
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
      const casing = new THREE.Mesh(
        buildNetworkGeometry(options, undefined, undefined, 3, 0.05, false, true),
        new THREE.MeshBasicMaterial({
          vertexColors: true,
          side: THREE.DoubleSide,
          toneMapped: false,
        }),
      )
      casing.renderOrder = 2
      const land = new THREE.Mesh(
        buildLandcoverGeometry(options),
        new THREE.MeshBasicMaterial({
          vertexColors: true,
          side: THREE.DoubleSide,
          toneMapped: false,
        }),
      )
      land.renderOrder = 1
      state.groups.network.add(casing, land)
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
    sceneRef.current?.invalidate()
  }, [showLabels])

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
          color: '#e6d08f',
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
          new THREE.LineBasicMaterial({ color: '#f1d993', depthTest: false, toneMapped: false }),
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
      state.flyTo(
        controls.target.clone().add(new THREE.Vector3(0, delta.y, Math.hypot(delta.x, delta.z))),
        controls.target,
      )
    } else {
      const delta = camera.position.clone().sub(controls.target)
      const distance = THREE.MathUtils.clamp(
        delta.length() * (action.type === 'in' ? 0.7 : 1.4),
        controls.minDistance,
        controls.maxDistance,
      )
      state.flyTo(controls.target.clone().add(delta.setLength(distance)), controls.target)
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
    const target = new THREE.Vector3(focus.x, y, focus.z)
    state.flyTo(target.clone().add(offset), target)
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
