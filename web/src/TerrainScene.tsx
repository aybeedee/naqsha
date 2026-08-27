import { useEffect, useRef, useState } from 'react'
import * as THREE from 'three'
import { OrbitControls } from 'three/addons/controls/OrbitControls.js'
import { loadOsmBasemapTexture } from './basemap'
import { buildAgreementGeometry, buildTerrainGeometry, buildWaterGeometry } from './geometry'
import type { Dimension, ScenarioData, UrbanContextData, UrbanLabel, ViewId } from './types'
import { buildBuildingGeometry, buildNetworkGeometry, elevationAt } from './urbanGeometry'

interface TerrainSceneProps {
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
  resetNonce: number
}

interface SceneState {
  scene: THREE.Scene
  camera: THREE.PerspectiveCamera
  renderer: THREE.WebGLRenderer
  controls: OrbitControls
  terrainModel: THREE.Group
  waterModel: THREE.Group
  contextModel: THREE.Group
  resizeObserver: ResizeObserver
  frame: number
}

const LABEL_STYLES: Record<UrbanLabel['category'], { accent: string; marker: string }> = {
  district: { accent: '#43d5c5', marker: '◆' },
  road: { accent: '#d6b879', marker: '━' },
  transit: { accent: '#ed9c67', marker: 'T' },
  landmark: { accent: '#e8c45f', marker: '★' },
  education: { accent: '#86bfe0', marker: 'E' },
  healthcare: { accent: '#ed7770', marker: '+' },
  worship: { accent: '#bba8dc', marker: 'W' },
  government: { accent: '#aabbb8', marker: 'G' },
  shopping: { accent: '#dc91c8', marker: 'S' },
  food: { accent: '#e7a766', marker: 'F' },
  hotel: { accent: '#a2ace1', marker: 'H' },
  park: { accent: '#75bc83', marker: 'P' },
  sports: { accent: '#74c5a7', marker: '●' },
  building: { accent: '#9eb2ae', marker: 'B' },
}

function labelMaximumDistance(priority: number): number {
  if (priority >= 100) return 18000
  if (priority >= 88) return 12000
  if (priority >= 76) return 8400
  if (priority >= 64) return 5700
  if (priority >= 52) return 3800
  return 2400
}

function resetCamera(state: SceneState, data: ScenarioData, dimension: Dimension): void {
  const span = Math.max(data.metadata.grid.extentWidthMetres, data.metadata.grid.extentHeightMetres)
  if (dimension === '2d') {
    state.camera.up.set(0, 0, -1)
    state.camera.position.set(0, span * 1.85, 0.01)
    state.controls.target.set(0, 0, 0)
    state.controls.enableRotate = false
  } else {
    state.camera.up.set(0, 1, 0)
    state.camera.position.set(span * 0.78, span * 0.64, span * 0.9)
    state.controls.target.set(0, 60, 0)
    state.controls.enableRotate = true
  }
  state.camera.lookAt(state.controls.target)
  state.controls.update()
}

function disposeMaterial(material: THREE.Material, disposeMap = true): void {
  const mapped = material as THREE.Material & { map?: THREE.Texture | null }
  if (disposeMap) mapped.map?.dispose()
  material.dispose()
}

function disposeGroup(group: THREE.Group, disposeMaps = true): void {
  for (const child of [...group.children]) {
    group.remove(child)
    if ('geometry' in child && child.geometry instanceof THREE.BufferGeometry) {
      child.geometry.dispose()
    }
    if ('material' in child) {
      const material = child.material as THREE.Material | THREE.Material[]
      const materials = Array.isArray(material) ? material : [material]
      materials.forEach((material) => disposeMaterial(material, disposeMaps))
    }
  }
}

function createLabelSprite(label: UrbanLabel): THREE.Sprite {
  const canvas = document.createElement('canvas')
  canvas.width = 512
  canvas.height = 128
  const drawing = canvas.getContext('2d')!
  const style = LABEL_STYLES[label.category]
  drawing.fillStyle = label.category === 'district'
    ? 'rgba(5, 18, 24, .78)'
    : 'rgba(5, 18, 24, .9)'
  drawing.beginPath()
  drawing.roundRect(2, 2, 508, 124, 13)
  drawing.fill()
  drawing.strokeStyle = style.accent
  drawing.lineWidth = label.category === 'district' ? 4 : 2
  drawing.stroke()
  drawing.fillStyle = style.accent
  drawing.beginPath()
  drawing.arc(38, 64, 25, 0, Math.PI * 2)
  drawing.fill()
  drawing.fillStyle = '#07141b'
  drawing.font = '700 25px sans-serif'
  drawing.textAlign = 'center'
  drawing.textBaseline = 'middle'
  drawing.fillText(style.marker, 38, 65)
  drawing.fillStyle = '#edf3ee'
  drawing.font = label.category === 'district' ? '650 57px sans-serif' : '600 45px sans-serif'
  drawing.textAlign = 'left'
  drawing.textBaseline = 'middle'
  const text = label.name.length > 28 ? `${label.name.slice(0, 26)}…` : label.name
  drawing.fillText(text, 76, label.category === 'district' || label.category === 'road' ? 64 : 47)
  if (label.category !== 'district' && label.category !== 'road') {
    drawing.fillStyle = '#8da5a5'
    drawing.font = '500 28px sans-serif'
    drawing.fillText(label.kind, 76, 92)
  }
  const texture = new THREE.CanvasTexture(canvas)
  texture.colorSpace = THREE.SRGBColorSpace
  const material = new THREE.SpriteMaterial({ map: texture, transparent: true, depthTest: false })
  const sprite = new THREE.Sprite(material)
  const width = label.category === 'district' ? 480 : label.category === 'road' ? 430 : 400
  sprite.scale.set(width, width * 128 / 512, 1)
  sprite.userData.baseLabelWidth = width
  sprite.userData.labelPriority = label.priority
  sprite.renderOrder = 10
  return sprite
}

export function TerrainScene({
  data,
  displayDepth,
  context,
  view,
  dimension,
  threshold,
  verticalExaggeration,
  waterDepthExaggeration,
  showWater,
  showBasemap,
  showBuildings,
  showNetwork,
  showRoadImpacts,
  roadImpactDepth,
  roadImpactAgreement,
  showLabels,
  resetNonce,
}: TerrainSceneProps) {
  const hostRef = useRef<HTMLDivElement>(null)
  const sceneRef = useRef<SceneState | null>(null)
  const [basemapTexture, setBasemapTexture] = useState<THREE.CanvasTexture | null>(null)

  useEffect(() => {
    let cancelled = false
    if (!showBasemap) {
      setBasemapTexture((current) => {
        current?.dispose()
        return null
      })
      return
    }
    loadOsmBasemapTexture(data.metadata.grid.geographicBounds)
      .then((texture) => {
        if (cancelled) texture.dispose()
        else setBasemapTexture((current) => {
          current?.dispose()
          return texture
        })
      })
      .catch((reason: unknown) => {
        console.warn('OSM basemap unavailable; retaining local vector context.', reason)
      })
    return () => {
      cancelled = true
    }
  }, [data.metadata.grid.geographicBounds, showBasemap])

  useEffect(() => {
    const host = hostRef.current
    if (!host) return

    const scene = new THREE.Scene()
    scene.background = new THREE.Color('#08161d')
    scene.fog = new THREE.FogExp2('#08161d', 0.00013)
    const camera = new THREE.PerspectiveCamera(38, 1, 5, 40000)
    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false })
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2))
    renderer.outputColorSpace = THREE.SRGBColorSpace
    renderer.toneMapping = THREE.ACESFilmicToneMapping
    renderer.toneMappingExposure = 1.08
    host.appendChild(renderer.domElement)

    const controls = new OrbitControls(camera, renderer.domElement)
    controls.enableDamping = true
    controls.dampingFactor = 0.07
    controls.maxPolarAngle = Math.PI * 0.48
    controls.minDistance = 500
    controls.maxDistance = 14000
    controls.zoomToCursor = true
    controls.screenSpacePanning = true

    scene.add(new THREE.HemisphereLight('#c8ecf1', '#25362f', 2.4))
    const sun = new THREE.DirectionalLight('#fff0ce', 3.1)
    sun.position.set(-2400, 4200, -1800)
    scene.add(sun)

    const base = new THREE.Mesh(
      new THREE.PlaneGeometry(7000, 7000),
      new THREE.MeshStandardMaterial({ color: '#0b2027', roughness: 1 }),
    )
    base.rotation.x = -Math.PI / 2
    base.position.y = -8
    scene.add(base)
    const gridHelper = new THREE.GridHelper(7000, 28, '#28474d', '#152f37')
    gridHelper.position.y = -6
    scene.add(gridHelper)

    const terrainModel = new THREE.Group()
    const waterModel = new THREE.Group()
    const contextModel = new THREE.Group()
    scene.add(terrainModel, waterModel, contextModel)

    const resizeObserver = new ResizeObserver(() => {
      const width = host.clientWidth
      const height = host.clientHeight
      renderer.setSize(width, height, false)
      camera.aspect = width / Math.max(height, 1)
      camera.updateProjectionMatrix()
    })
    resizeObserver.observe(host)

    const state: SceneState = {
      scene,
      camera,
      renderer,
      controls,
      terrainModel,
      waterModel,
      contextModel,
      resizeObserver,
      frame: 0,
    }
    sceneRef.current = state
    resetCamera(state, data, dimension)

    let renderCount = 0
    const render = () => {
      state.frame = requestAnimationFrame(render)
      controls.update()
      renderCount += 1
      const sprites = contextModel.children
        .filter((child): child is THREE.Sprite => child instanceof THREE.Sprite)
        .sort((first, second) => (second.userData.labelPriority as number)
          - (first.userData.labelPriority as number))
      const occupied: Array<{ left: number; right: number; top: number; bottom: number }> = []
      const focalPixels = host.clientHeight / (2 * Math.tan(THREE.MathUtils.degToRad(camera.fov / 2)))
      const layoutLabels = renderCount % 3 === 0
      for (const child of sprites) {
        const width = child.userData.baseLabelWidth as number
        const priority = child.userData.labelPriority as number
        const distance = camera.position.distanceTo(child.position)
        const distanceScale = THREE.MathUtils.clamp(distance / 6000, 0.24, 1.2)
        child.scale.set(width * distanceScale, width * 128 / 512 * distanceScale, 1)
        if (!layoutLabels) continue
        const projected = child.position.clone().project(camera)
        if (distance > labelMaximumDistance(priority)
          || projected.z < -1 || projected.z > 1
          || Math.abs(projected.x) > 1.08 || Math.abs(projected.y) > 1.08) {
          child.visible = false
          continue
        }
        const centreX = (projected.x + 1) * host.clientWidth / 2
        const centreY = (1 - projected.y) * host.clientHeight / 2
        const pixelWidth = width * distanceScale / distance * focalPixels
        const pixelHeight = pixelWidth * 128 / 512
        const rectangle = {
          left: centreX - pixelWidth / 2 - 3,
          right: centreX + pixelWidth / 2 + 3,
          top: centreY - pixelHeight / 2 - 2,
          bottom: centreY + pixelHeight / 2 + 2,
        }
        if (rectangle.right > host.clientWidth - 255 || rectangle.bottom > host.clientHeight - 96) {
          child.visible = false
          continue
        }
        const overlaps = occupied.some((other) => rectangle.left < other.right
          && rectangle.right > other.left && rectangle.top < other.bottom
          && rectangle.bottom > other.top)
        child.visible = !overlaps
        if (!overlaps) occupied.push(rectangle)
      }
      renderer.render(scene, camera)
    }
    render()

    return () => {
      cancelAnimationFrame(state.frame)
      resizeObserver.disconnect()
      controls.dispose()
      disposeGroup(terrainModel, false)
      disposeGroup(waterModel)
      disposeGroup(contextModel)
      base.geometry.dispose()
      disposeMaterial(base.material)
      renderer.dispose()
      renderer.domElement.remove()
      sceneRef.current = null
    }
  }, [data, context])

  const selected =
    data.members.find((member) => member.id === (view === 'city' || view === 'agreement' ? 'fabdem' : view))
    ?? data.members[0]
  const renderExaggeration = dimension === '2d' ? 0 : verticalExaggeration

  useEffect(() => {
    const state = sceneRef.current
    if (!state) return
    disposeGroup(state.terrainModel, false)
    const options = {
      grid: data.metadata.grid,
      active: data.active,
      terrain: selected.terrain,
      terrainMinimum: selected.terrainMinimumMetres,
      verticalExaggeration: renderExaggeration,
    }
    const terrainGeometry = buildTerrainGeometry(options)
    if (basemapTexture) {
      basemapTexture.anisotropy = state.renderer.capabilities.getMaxAnisotropy()
    }
    const mappedCity = view === 'city' && showBasemap ? basemapTexture : null
    const terrainMaterial = new THREE.MeshStandardMaterial({
      vertexColors: view !== 'city',
      color: view === 'city' ? (mappedCity ? '#b8c2ba' : '#29413e') : '#ffffff',
      map: mappedCity || null,
      roughness: 0.96,
      metalness: 0,
      side: THREE.DoubleSide,
    })
    state.terrainModel.add(new THREE.Mesh(terrainGeometry, terrainMaterial))

  }, [
    basemapTexture,
    data,
    dimension,
    renderExaggeration,
    selected,
    showBasemap,
    view,
  ])

  useEffect(() => {
    const state = sceneRef.current
    if (!state) return
    disposeGroup(state.waterModel)
    if (!showWater) return
    const options = {
      grid: data.metadata.grid,
      active: data.active,
      terrain: selected.terrain,
      terrainMinimum: selected.terrainMinimumMetres,
      verticalExaggeration: renderExaggeration,
      waterDepthExaggeration,
      waterBaseOffset: dimension === '2d' ? 4 : 0.35,
    }
    const geometry = view === 'agreement'
      ? buildAgreementGeometry(options, data.maximumDepth, data.agreement)
      : buildWaterGeometry(options, displayDepth, threshold)
    const material = new THREE.MeshPhysicalMaterial({
      vertexColors: true,
      transparent: true,
      opacity: view === 'agreement' ? 0.88 : 0.72,
      roughness: 0.16,
      clearcoat: 0.4,
      side: THREE.DoubleSide,
      depthWrite: false,
    })
    const waterMesh = new THREE.Mesh(geometry, material)
    waterMesh.renderOrder = 5
    state.waterModel.add(waterMesh)
  }, [
    data,
    dimension,
    displayDepth,
    renderExaggeration,
    selected,
    showWater,
    threshold,
    view,
    waterDepthExaggeration,
  ])

  useEffect(() => {
    const state = sceneRef.current
    if (!state) return
    disposeGroup(state.contextModel)
    const urbanOptions = {
      context,
      grid: data.metadata.grid,
      terrain: selected.terrain,
      terrainMinimum: selected.terrainMinimumMetres,
      verticalExaggeration: renderExaggeration,
      flat: dimension === '2d',
    }
    if (showBuildings) {
      const geometry = buildBuildingGeometry(urbanOptions)
      const material = new THREE.MeshStandardMaterial({
        vertexColors: true,
        roughness: 0.88,
        metalness: 0,
        side: THREE.DoubleSide,
      })
      state.contextModel.add(new THREE.Mesh(geometry, material))
    }
    if (showNetwork) {
      const useImpact = showRoadImpacts && view === 'city'
      const geometry = buildNetworkGeometry(
        urbanOptions,
        useImpact ? roadImpactDepth : undefined,
        useImpact ? roadImpactAgreement : undefined,
        data.roadImpact?.memberCount,
      )
      const material = new THREE.MeshStandardMaterial({
        vertexColors: true,
        roughness: 0.9,
        side: THREE.DoubleSide,
      })
      const network = new THREE.Mesh(geometry, material)
      network.renderOrder = 3
      state.contextModel.add(network)
    }
    if (showLabels) {
      const elevationOptions = {
        grid: data.metadata.grid,
        terrain: selected.terrain,
        terrainMinimum: selected.terrainMinimumMetres,
        verticalExaggeration: renderExaggeration,
        flat: dimension === '2d',
      }
      for (const label of context.metadata.labels) {
        const sprite = createLabelSprite(label)
        const y = elevationAt(label.x, label.z, elevationOptions) + (dimension === '2d' ? 9 : 28)
        sprite.position.set(label.x, y, label.z)
        state.contextModel.add(sprite)
      }
    }
  }, [
    context,
    data,
    dimension,
    renderExaggeration,
    roadImpactAgreement,
    roadImpactDepth,
    selected,
    showBuildings,
    showLabels,
    showNetwork,
    showRoadImpacts,
    view,
  ])

  useEffect(() => {
    if (sceneRef.current) resetCamera(sceneRef.current, data, dimension)
  }, [data, dimension, resetNonce])

  return <div className="scene" ref={hostRef} aria-label="Interactive Lahore flood map" />
}
