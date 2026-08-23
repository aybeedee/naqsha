import { useEffect, useRef } from 'react'
import * as THREE from 'three'
import { OrbitControls } from 'three/addons/controls/OrbitControls.js'
import { buildAgreementGeometry, buildTerrainGeometry, buildWaterGeometry } from './geometry'
import type { ScenarioData, ViewId } from './types'

interface TerrainSceneProps {
  data: ScenarioData
  view: ViewId
  threshold: number
  verticalExaggeration: number
  showWater: boolean
  resetNonce: number
}

interface SceneState {
  scene: THREE.Scene
  camera: THREE.PerspectiveCamera
  renderer: THREE.WebGLRenderer
  controls: OrbitControls
  model: THREE.Group
  resizeObserver: ResizeObserver
  frame: number
}

function resetCamera(state: SceneState, data: ScenarioData): void {
  const span = Math.max(data.metadata.grid.extentWidthMetres, data.metadata.grid.extentHeightMetres)
  state.camera.position.set(span * 0.78, span * 0.64, span * 0.9)
  state.controls.target.set(0, 80, 0)
  state.controls.update()
}

function disposeGroup(group: THREE.Group): void {
  for (const child of [...group.children]) {
    group.remove(child)
    if (child instanceof THREE.Mesh) {
      child.geometry.dispose()
      const materials = Array.isArray(child.material) ? child.material : [child.material]
      materials.forEach((material) => material.dispose())
    }
  }
}

export function TerrainScene({
  data,
  view,
  threshold,
  verticalExaggeration,
  showWater,
  resetNonce,
}: TerrainSceneProps) {
  const hostRef = useRef<HTMLDivElement>(null)
  const sceneRef = useRef<SceneState | null>(null)

  useEffect(() => {
    const host = hostRef.current
    if (!host) return

    const scene = new THREE.Scene()
    scene.background = new THREE.Color('#08161d')
    scene.fog = new THREE.FogExp2('#08161d', 0.00016)
    const camera = new THREE.PerspectiveCamera(38, 1, 5, 40000)
    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false })
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2))
    renderer.outputColorSpace = THREE.SRGBColorSpace
    renderer.toneMapping = THREE.ACESFilmicToneMapping
    renderer.toneMappingExposure = 1.05
    renderer.shadowMap.enabled = true
    host.appendChild(renderer.domElement)

    const controls = new OrbitControls(camera, renderer.domElement)
    controls.enableDamping = true
    controls.dampingFactor = 0.07
    controls.maxPolarAngle = Math.PI * 0.48
    controls.minDistance = 500
    controls.maxDistance = 14000
    controls.zoomToCursor = true

    scene.add(new THREE.HemisphereLight('#b8ecff', '#203125', 2.2))
    const sun = new THREE.DirectionalLight('#fff3d1', 3.4)
    sun.position.set(-2400, 4200, -1800)
    sun.castShadow = true
    scene.add(sun)

    const gridHelper = new THREE.GridHelper(6000, 12, '#385a5c', '#19353d')
    gridHelper.position.y = -5
    scene.add(gridHelper)
    const model = new THREE.Group()
    scene.add(model)

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
      model,
      resizeObserver,
      frame: 0,
    }
    sceneRef.current = state
    resetCamera(state, data)

    const render = () => {
      state.frame = requestAnimationFrame(render)
      controls.update()
      renderer.render(scene, camera)
    }
    render()

    return () => {
      cancelAnimationFrame(state.frame)
      resizeObserver.disconnect()
      controls.dispose()
      disposeGroup(model)
      renderer.dispose()
      renderer.domElement.remove()
      sceneRef.current = null
    }
  }, [data])

  useEffect(() => {
    const state = sceneRef.current
    if (!state) return
    disposeGroup(state.model)
    const selected =
      data.members.find((member) => member.id === view) ?? data.members[0]
    const options = {
      grid: data.metadata.grid,
      active: data.active,
      terrain: selected.terrain,
      terrainMinimum: selected.terrainMinimumMetres,
      verticalExaggeration,
    }
    const terrainGeometry = buildTerrainGeometry(options)
    const terrainMaterial = new THREE.MeshStandardMaterial({
      vertexColors: true,
      roughness: 0.92,
      metalness: 0,
      side: THREE.DoubleSide,
    })
    const terrainMesh = new THREE.Mesh(terrainGeometry, terrainMaterial)
    terrainMesh.receiveShadow = true
    state.model.add(terrainMesh)

    if (showWater) {
      const geometry =
        view === 'agreement'
          ? buildAgreementGeometry(options, data.maximumDepth, data.agreement)
          : buildWaterGeometry(options, selected.depth, threshold)
      const material = new THREE.MeshPhysicalMaterial({
        vertexColors: true,
        transparent: true,
        opacity: view === 'agreement' ? 0.9 : 0.78,
        roughness: 0.2,
        metalness: 0,
        clearcoat: 0.35,
        side: THREE.DoubleSide,
        depthWrite: false,
      })
      const waterMesh = new THREE.Mesh(geometry, material)
      waterMesh.renderOrder = 2
      state.model.add(waterMesh)
    }
  }, [data, showWater, threshold, verticalExaggeration, view])

  useEffect(() => {
    if (sceneRef.current) resetCamera(sceneRef.current, data)
  }, [data, resetNonce])

  return <div className="scene" ref={hostRef} aria-label="Interactive 3D flood terrain" />
}
