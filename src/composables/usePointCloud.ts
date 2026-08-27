import * as Cesium from 'cesium'
import { ref } from 'vue'
import { useAnnotationStore } from '../store/annotation'

// 单点标注 API（供 Toolbar / ClassPanel 通过 registry 调用）
export type PointCloudApi = ReturnType<typeof usePointCloud>

/**
 * 点云语义分割核心逻辑。
 * 当前实现用 Cesium.PointPrimitiveCollection 承载示例点云（开箱即跑、无需外部资源）。
 * 真实业务请改用 loadTileset() 加载由 .pcd/.las 转出的 3D Tiles(pnts)，详见 README。
 */
export function usePointCloud(viewer: Cesium.Viewer) {
  const store = useAnnotationStore()

  const collection = viewer.scene.primitives.add(
    // blendOption: OPAQUE_AND_TRANSLUCENT 保证混合选择更宽，避免 Cesium 选择
    // 需要 lineWidth>1 的“带轮廓”渲染路径（部分 Windows 显卡上会抱错）。
    new Cesium.PointPrimitiveCollection({
      blendOption: Cesium.BlendOption.OPAQUE,
    } as any),
  )
  // id -> { 图元, 类别 }
  const records = new Map<number, { prim: Cesium.PointPrimitive; classId: number }>()
  let nextId = 0
  const painting = ref(false)

  function cssToColor(hex: string): Cesium.Color {
    return Cesium.Color.fromCssColorString(hex)
  }

  function recalcCounts() {
    const c: Record<number, number> = {}
    records.forEach((r) => {
      c[r.classId] = (c[r.classId] ?? 0) + 1
    })
    store.setCounts(c)
    store.setTotal(records.size)
  }

  function addPoint(position: Cesium.Cartesian3, classId: number): number {
    const prim = collection.add({
      position,
      color: cssToColor(store.colorOf(classId)),
      pixelSize: 3.5,
    })
    const id = nextId++
    prim.id = id
    records.set(id, { prim, classId })
    return id
  }

  function setClass(id: number, classId: number) {
    const rec = records.get(id)
    if (!rec) return
    rec.classId = classId
    rec.prim.color = cssToColor(store.colorOf(classId))
    recalcCounts()
  }

  // 在屏幕坐标处拾取最近点并上色（核心交互）
  // scene.pick() 对 PointPrimitive 极不可靠（点太小容易 miss），
  // 改用手动最近点搜索：投影所有点到屏幕，取鼠标半径 radius 内最近的点。
  const PICK_RADIUS = 8 // 屏幕像素容差

  function paintAt(windowPos: Cesium.Cartesian2) {
    const picked = viewer.scene.pick(windowPos)
    // 优先用 Cesium 官方拾取（精确命中时）
    if (
      picked &&
      picked.primitive === collection &&
      typeof picked.id === 'number'
    ) {
      setClass(picked.id as number, store.currentClassId)
      return
    }
    // 兜底：手动最近点搜索
    const w = viewer.scene.canvas.clientWidth
    const h = viewer.scene.canvas.clientHeight
    let bestId: number | undefined
    let bestDist2 = PICK_RADIUS * PICK_RADIUS
    const tmp = new Cesium.Cartesian3()
    for (const [id, rec] of records) {
      const sp = Cesium.SceneTransforms.worldToWindowCoordinates(
        viewer.scene,
        rec.prim.position as Cesium.Cartesian3,
        tmp,
      )
      if (!sp) continue
      const dx = sp.x - windowPos.x
      const dy = sp.y - windowPos.y
      const d2 = dx * dx + dy * dy
      if (d2 < bestDist2) {
        bestDist2 = d2
        bestId = id
      }
    }
    if (bestId !== undefined) setClass(bestId, store.currentClassId)
  }

  const handler = new Cesium.ScreenSpaceEventHandler(viewer.scene.canvas)
  // 左键拖动 → paintMode=true 时只涂鸦，paintMode=false 时走默认相机旋转
  handler.setInputAction((m: any) => {
    if (store.paintMode) {
      painting.value = true
      ;(viewer.scene.screenSpaceCameraController as any).enableInputs = false
      paintAt(m.position)
    }
  }, Cesium.ScreenSpaceEventType.LEFT_DOWN)
  handler.setInputAction((m: any) => {
    if (painting.value) paintAt(m.endPosition)
  }, Cesium.ScreenSpaceEventType.MOUSE_MOVE)
  handler.setInputAction(() => {
    painting.value = false
    ;(viewer.scene.screenSpaceCameraController as any).enableInputs = true
  }, Cesium.ScreenSpaceEventType.LEFT_UP)
  // 左键单击（不放拖）→ 始终拾取单点，不影响相机
  handler.setInputAction((m: any) => {
    paintAt(m.position)
  }, Cesium.ScreenSpaceEventType.LEFT_CLICK)

  // 生成示例点云（地面 + 几栋建筑方块 + 散点植被），无任何外部依赖
  function loadSample() {
    const lon = 116.391
    const lat = 39.907
    const base = Cesium.Cartesian3.fromDegrees(lon, lat, 0)
    const enu = Cesium.Transforms.eastNorthUpToFixedFrame(base)
    const step = 12 // 米
    const n = 50

    // 地面网格
    for (let i = 0; i < n; i++) {
      for (let j = 0; j < n; j++) {
        const x = (i - n / 2) * step
        const y = (j - n / 2) * step
        const h = Math.sin(i * 0.3) * Math.cos(j * 0.3) * 1.5
        const p = Cesium.Matrix4.multiplyByPoint(
          enu,
          new Cesium.Cartesian4(x, y, h, 1),
          new Cesium.Cartesian3(),
        )
        // 大部分地面预标为类别0，少量留作未标注供练习
        addPoint(p, (i + j) % 7 === 0 ? -1 : 0)
      }
    }

    // 几栋“建筑”方块
    const buildings: number[][] = [
      [-60, -40, 40, 30, 50],
      [40, -50, 35, 35, 45],
      [10, 60, 30, 30, 40],
    ]
    buildings.forEach(([cx, cy, wx, wy, wz]) => {
      for (let a = 0; a < wx; a += 4)
        for (let b = 0; b < wy; b += 4)
          for (let c = 0; c < wz; c += 4) {
            const x = cx - wx / 2 + a
            const y = cy - wy / 2 + b
            const h = c
            const p = Cesium.Matrix4.multiplyByPoint(
              enu,
              new Cesium.Cartesian4(x, y, h, 1),
              new Cesium.Cartesian3(),
            )
            addPoint(p, 1)
          }
    })

    // 散点“植被”
    for (let k = 0; k < 200; k++) {
      const x = (Math.random() - 0.5) * n * step
      const y = (Math.random() - 0.5) * n * step
      const h = Math.random() * 25
      const p = Cesium.Matrix4.multiplyByPoint(
        enu,
        new Cesium.Cartesian4(x, y, h, 1),
        new Cesium.Cartesian3(),
      )
      addPoint(p, 2)
    }

    recalcCounts()

    viewer.camera.setView({
      destination: Cesium.Cartesian3.fromDegrees(lon, lat, 400),
      orientation: { heading: 0, pitch: -0.7, roll: 0 },
    })
  }

  /**
   * 加载真实点云（由 .pcd / .las 转出的 3D Tiles pnts）。
   * 转换方式见 README（py3dtiles 或 Cesium Ion）。
   * 真实点云的拾取对象为 Cesium3DTilePointFeature，可按 features 批量上色，
   * 思路与此处的 PointPrimitive 一致，仅拾取返回类型不同。
   */
  async function loadTileset(url: string) {
    const tileset = await Cesium.Cesium3DTileset.fromUrl(url)
    viewer.scene.primitives.add(tileset)
    // 全局按类别上色可用：tileset.style = new Cesium.Cesium3DTileStyle({ color: "..." })
  }

  // 导出标注结果（id + 类别 + 经纬度高程）
  function exportAnnotations() {
    const data = [...records.entries()].map(([id, r]) => {
      const cart = Cesium.Cartographic.fromCartesian(r.prim.position)
      return {
        id,
        classId: r.classId,
        lon: +Cesium.Math.toDegrees(cart.longitude).toFixed(6),
        lat: +Cesium.Math.toDegrees(cart.latitude).toFixed(6),
        height: +cart.height.toFixed(3),
      }
    })
    const blob = new Blob([JSON.stringify(data, null, 2)], {
      type: 'application/json',
    })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = 'annotations.json'
    a.click()
    URL.revokeObjectURL(url)
  }

  function dispose() {
    handler.destroy()
    viewer.scene.primitives.remove(collection)
  }

  return { loadSample, loadTileset, paintAt, exportAnnotations, dispose, collection }
}
