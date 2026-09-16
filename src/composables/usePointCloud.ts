import * as Cesium from 'cesium'
import { ref } from 'vue'
import { useAnnotationStore } from '../store/annotation'
import { parsePcd, toFlatPositions } from './pcd'
import { parsePcdInWorker, terminatePcdWorker } from './pcdWorker'

// 点云 ENU 原点相对椭球面的抬升量（米）。
// 卫星底图启用后地面点在 h=0 会与地球表面共面，出现 z-fighting（点忽隐忽现），
// 因此把整个 ENU 原点统一抬升一点。真实带高程的点云也会被同步抬升 2m，
// 这是固定偏移、已记录在 README「已知限制」。
const GROUND_CLEARANCE = 2

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
  // 鼠标按下时的"相机距离基准"（通过 pickPosition 获得）
  // 涂色时：候选点的相机距离 ≤ 基准 → 可见；> 基准 → 被前方物体遮挡，跳过
  let refDepth = 0
  let hasRefDepth = false
  // 上一帧鼠标位置（用于拖动路径补偿，避免快速拖动漏涂）
  let lastPaintPos: Cesium.Cartesian2 | null = null
  // 当前拖动操作累积的变更记录（用于撤销重做）
  // 格式：{ pointId: { old, new } }，记录每个点被改前后的类别
  let pendingChanges: Record<number, { old: number; new: number }> = {}
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
  }

  // 撤销：恢复历史记录中记录的旧类别
  function undo() {
    const changes = store.getUndoChanges()
    if (!changes) return
    for (const [idStr, entry] of Object.entries(changes)) {
      const id = Number(idStr)
      const rec = records.get(id)
      if (rec) {
        rec.classId = entry.old
        rec.prim.color = cssToColor(store.colorOf(entry.old))
      }
    }
    store.moveBack()
    recalcCounts()
  }

  // 重做：重新应用被撤销的操作
  function redo() {
    const changes = store.getRedoChanges()
    if (!changes) return
    for (const [idStr, entry] of Object.entries(changes)) {
      const id = Number(idStr)
      const rec = records.get(id)
      if (rec) {
        rec.classId = entry.new
        rec.prim.color = cssToColor(store.colorOf(entry.new))
      }
    }
    store.moveForward()
    recalcCounts()
  }

  // 静默版：批量上色时跳过逐次计数，只在最后统一算一次
  // 同时记录旧类别和新类别到 pendingChanges（用于撤销重做）
  function setClassQuiet(id: number, classId: number) {
    const rec = records.get(id)
    if (!rec) return
    // 记录旧值和新值（只在本次拖动中第一次被改时记录）
    if (!(id in pendingChanges)) {
      pendingChanges[id] = { old: rec.classId, new: classId }
    } else {
      // 已记录过，只更新 new 值
      pendingChanges[id].new = classId
    }
    rec.classId = classId
    rec.prim.color = cssToColor(store.colorOf(classId))
  }

  // 感知深度遮挡的批量上色。
  // 原理：每个点都有一个"相机距离"（离相机多远）。
  // 鼠标按下时 pickPosition 得到"鼠标处实际渲染面的相机距离"作为基准 refDepth。
  // 涂色时：候选点的相机距离 ≤ refDepth → 可见；> refDepth → 被前方物体遮挡，跳过。
  function paintRadius(windowPos: Cesium.Cartesian2, silent = false, erase = false): number[] {
    const r2 = store.brushRadius * store.brushRadius
    const tmp = new Cesium.Cartesian3()
    const hit: number[] = []

    // 鼠标处的相机距离（由 LEFT_DOWN 时 pickPosition 填充）
    const mouseDepth = hasRefDepth ? refDepth : 0
    // 橡皮擦模式下，目标类别固定为 -1（未标注）
    const targetClassId = erase ? -1 : store.currentClassId

    for (const [id, rec] of records) {
      // 投影到屏幕坐标
      const sp = Cesium.SceneTransforms.worldToWindowCoordinates(
        viewer.scene,
        rec.prim.position as Cesium.Cartesian3,
        tmp,
      )
      // 不在屏幕内的点不涂（worldToWindowCoordinates 返回 undefined）
      if (!sp) continue

      // 屏幕距离过滤：候选点必须在笔刷半径内
      const dx = sp.x - windowPos.x
      const dy = sp.y - windowPos.y
      if (dx * dx + dy * dy > r2) continue

      // 深度遮挡：只有开关打开时才比较相机距离
      // candidateDepth > mouseDepth → 候选点在鼠标点击物的后方，被遮挡，跳过
      if (hasRefDepth && store.depthOcclusion) {
        const camPos = viewer.camera.positionWC
        const px = rec.prim.position.x - camPos.x
        const py = rec.prim.position.y - camPos.y
        const pz = rec.prim.position.z - camPos.z
        const candidateDepth = Math.sqrt(px * px + py * py + pz * pz)
        if (candidateDepth > mouseDepth + store.brushDepthTolerance) continue
      }

      if (silent) {
        setClassQuiet(id, targetClassId)
      } else {
        setClass(id, targetClassId)
      }
      hit.push(id)
    }
    return hit
  }

  const handler = new Cesium.ScreenSpaceEventHandler(viewer.scene.canvas)
  // 左键按下：捕获"鼠标处的相机距离"作为深度基准
  handler.setInputAction((m: any) => {
    if (store.paintMode) {
      const picked = viewer.scene.pickPosition(m.position)
      if (Cesium.defined(picked) && !isOrigin(picked)) {
        const camPos = viewer.camera.positionWC
        const dx = picked.x - camPos.x
        const dy = picked.y - camPos.y
        const dz = picked.z - camPos.z
        refDepth = Math.sqrt(dx * dx + dy * dy + dz * dz)
        hasRefDepth = true
      }

      painting.value = true
      ;(viewer.scene.screenSpaceCameraController as any).enableInputs = false
      lastPaintPos = m.position.clone()
      paintRadius(m.position, true, store.eraseMode)
    }
  }, Cesium.ScreenSpaceEventType.LEFT_DOWN)
  handler.setInputAction((m: any) => {
    if (!painting.value) return
    // 路径补偿：从上次位置到当前位置按笔刷直径等距插值
    // 避免快速拖动时两次 move 事件跨度超过笔刷直径而出现漏涂
    if (lastPaintPos) {
      const dx = m.endPosition.x - lastPaintPos.x
      const dy = m.endPosition.y - lastPaintPos.y
      const dist = Math.sqrt(dx * dx + dy * dy)
      const step = Math.max(1, store.brushRadius * 0.5) // 步长为笔刷半径一半
      const steps = Math.max(1, Math.ceil(dist / step))
      for (let i = 1; i <= steps; i++) {
        const t = i / steps
        const px = lastPaintPos.x + dx * t
        const py = lastPaintPos.y + dy * t
        const interpPos = new Cesium.Cartesian2(px, py)
        // 路径上每点重新 pick 深度（适应拖动时场景深度变化）
        const picked = viewer.scene.pickPosition(interpPos)
        if (Cesium.defined(picked) && !isOrigin(picked)) {
          const camPos = viewer.camera.positionWC
          const ddx = picked.x - camPos.x
          const ddy = picked.y - camPos.y
          const ddz = picked.z - camPos.z
          refDepth = Math.sqrt(ddx * ddx + ddy * ddy + ddz * ddz)
          hasRefDepth = true
        } else {
          hasRefDepth = false
        }
        paintRadius(interpPos, true, store.eraseMode)
      }
    } else {
      paintRadius(m.endPosition, true)
    }
    lastPaintPos = m.endPosition.clone()
  }, Cesium.ScreenSpaceEventType.MOUSE_MOVE)
  // 判断 pickPosition 结果是否为无效的 (0,0,0)（Cesium 在空地/天空处返回）
  function isOrigin(c: Cesium.Cartesian3): boolean {
    return Math.abs(c.x) < 1e-6 && Math.abs(c.y) < 1e-6 && Math.abs(c.z) < 1e-6
  }

  handler.setInputAction(() => {
    if (painting.value) {
      recalcCounts()
      // 如果有累积的变更，推入历史栈
      if (Object.keys(pendingChanges).length > 0) {
        store.pushHistory(pendingChanges)
        pendingChanges = {}
      }
    }
    painting.value = false
    hasRefDepth = false
    lastPaintPos = null
    ;(viewer.scene.screenSpaceCameraController as any).enableInputs = true
  }, Cesium.ScreenSpaceEventType.LEFT_UP)
  // 左键单击：每次重新 pick 深度基准
  handler.setInputAction((m: any) => {
    const picked = viewer.scene.pickPosition(m.position)
    if (Cesium.defined(picked) && !isOrigin(picked)) {
      const camPos = viewer.camera.positionWC
      const dx = picked.x - camPos.x
      const dy = picked.y - camPos.y
      const dz = picked.z - camPos.z
      refDepth = Math.sqrt(dx * dx + dy * dy + dz * dz)
      hasRefDepth = true
    }
    paintRadius(m.position, false, store.eraseMode)
    // 单击后提交历史
    if (Object.keys(pendingChanges).length > 0) {
      store.pushHistory(pendingChanges)
      pendingChanges = {}
    }
    hasRefDepth = false
  }, Cesium.ScreenSpaceEventType.LEFT_CLICK)

  // 生成示例点云（地面 + 几栋建筑方块 + 散点植被），无任何外部依赖
  function loadSample() {
    const lon = 116.391
    const lat = 39.907
    const base = Cesium.Cartesian3.fromDegrees(lon, lat, GROUND_CLEARANCE)
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
   * 加载真实 .pcd 点云（前端直接解析，复用 PointPrimitiveCollection 标注链路）。
   *
   * 性能设计：解析在 Web Worker 中完成，主线程只负责把返回的坐标映射到 Cesium
   * 世界坐标，因此大文件解析期间 UI 不会冻结（按钮/面板仍可响应）。Worker 不可用时
   * 自动降级为主线程同步解析，保证功能不缺失。坐标数组以 transfer 方式跨线程传递，
   * 避免结构化克隆的额外拷贝。
   *
   * 解析得到局部坐标后，用 ENU（以固定原点为基准）映射到 Cesium 世界坐标，
   * 然后逐点加入 collection，与示例点云走完全相同的 paintRadius / 撤销重做 / 导出逻辑。
   *
   * 适合作品集演示（数千~数十万点，超 6 万点自动降采样）。
   * 规模更大（百万级以上）建议改用 3D Tiles(pnts)，见 README。
   */
  async function loadPcd(buffer: ArrayBuffer) {
    // ---- 1) 解析：优先 Worker（不阻塞主线程），Worker 不可用时降级为同步解析 ----
    let flat: Float32Array
    const task = parsePcdInWorker(buffer)
    if (task) {
      flat = await task
    } else {
      const pcd = parsePcd(buffer)
      flat = toFlatPositions(pcd.positions, pcd.count)
    }

    const total = flat.length / 3
    if (total === 0) throw new Error('PCD 文件无有效点')

    // ---- 2) 过滤 NaN / Infinity 的非法点 ----
    // 真实数据偶尔会有，必须跳过，否则相机坐标变 NaN，
    // Cesium 渲染时矩阵长度变 NaN 直接崩溃。
    const validIdx: number[] = []
    for (let i = 0; i < total; i++) {
      const x = flat[i * 3]
      const y = flat[i * 3 + 1]
      const z = flat[i * 3 + 2]
      if (Number.isFinite(x) && Number.isFinite(y) && Number.isFinite(z)) validIdx.push(i)
    }
    if (validIdx.length === 0) throw new Error('PCD 有效点为 0（坐标全为 NaN/Infinity）')

    // ---- 3) 降采样：过大点云逐点建图元会卡，均匀降到上限以内 ----
    const MAX_POINTS = 60000
    let picked = validIdx
    if (validIdx.length > MAX_POINTS) {
      const step = Math.ceil(validIdx.length / MAX_POINTS)
      picked = validIdx.filter((_, i) => i % step === 0)
    }

    // 清空示例/上一轮点云
    collection.removeAll()
    records.clear()
    nextId = 0
    pendingChanges = {}
    refDepth = 0
    hasRefDepth = false

    // ---- 4) ENU 原点 -> 世界坐标（默认北京；真实数据可换成点云实际经纬度）----
    const lon = store.pcdOrigin?.lon ?? 116.391
    const lat = store.pcdOrigin?.lat ?? 39.907
    const base = Cesium.Cartesian3.fromDegrees(lon, lat, GROUND_CLEARANCE)
    const enu = Cesium.Transforms.eastNorthUpToFixedFrame(base)

    // 包围盒，用于自动飞到合适视角（基于已过滤的有效点）
    let minX = Infinity, minY = Infinity, minZ = Infinity
    let maxX = -Infinity, maxY = -Infinity, maxZ = -Infinity
    for (const i of validIdx) {
      const x = flat[i * 3]
      const y = flat[i * 3 + 1]
      const z = flat[i * 3 + 2]
      if (x < minX) minX = x
      if (x > maxX) maxX = x
      if (y < minY) minY = y
      if (y > maxY) maxY = y
      if (z < minZ) minZ = z
      if (z > maxZ) maxZ = z
    }
    const cx = (minX + maxX) / 2
    const cy = (minY + maxY) / 2
    const cz = (minZ + maxZ) / 2
    const span = Math.max(maxX - minX, maxY - minY, maxZ - minZ, 1)

    // ---- 5) 逐点映射并加入图元集合 ----
    for (const i of picked) {
      const x = flat[i * 3]
      const y = flat[i * 3 + 1]
      const z = flat[i * 3 + 2]
      const p = Cesium.Matrix4.multiplyByPoint(
        enu,
        new Cesium.Cartesian4(x, y, z, 1),
        new Cesium.Cartesian3(),
      )
      addPoint(p, -1) // 真实点云默认全部未标注，等用户标注
    }

    recalcCounts()

    // 自动飞向真实点云（动画飞行，确保点云一定进入视野）
    const centerWorld = Cesium.Matrix4.multiplyByPoint(
      enu,
      new Cesium.Cartesian4(cx, cy, cz, 1),
      new Cesium.Cartesian3(),
    )
    const radius = (span / 2) * Math.SQRT2 + 10
    viewer.camera.flyToBoundingSphere(
      new Cesium.BoundingSphere(centerWorld, radius),
      { duration: 1.2 },
    )
    // 反馈：控制台确认导入成功（点数 + 包围盒半径）
    console.log(
      `[point-cloud-annotator] 已加载真实点云：${validIdx.length} 个点（默认全部未标注灰，可涂色）`,
    )
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
    terminatePcdWorker()
  }

  return { loadSample, loadTileset, loadPcd, paintRadius, exportAnnotations, dispose, collection, undo, redo }
}
