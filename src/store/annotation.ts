import { defineStore } from 'pinia'
import { ref, reactive } from 'vue'
import type { SemanticClass } from '../types'

// 标注状态中心：语义类别、当前选中类别、各类别计数
export const useAnnotationStore = defineStore('annotation', () => {
  // 默认语义类别（面向地图 / 测绘 / 高精地图场景）
  const classes = ref<SemanticClass[]>([
    { id: 0, name: '地面/道路', color: '#6b7280' },
    { id: 1, name: '建筑', color: '#f59e0b' },
    { id: 2, name: '植被', color: '#22c55e' },
    { id: 3, name: '车辆', color: '#ef4444' },
    { id: 4, name: '杆状物', color: '#3b82f6' },
    { id: -1, name: '未标注', color: '#9ca3af' },
  ])

  const currentClassId = ref<number>(1)
  // true = 左键涂鸦（相机不动），false = 左键拖动相机（不涂鸦）
  const paintMode = ref<boolean>(false)
  // 笔刷半径（屏幕像素），影响拖动涂色时一次性能覆盖多少个点
  const brushRadius = ref<number>(12)
  // 当前笔刷在世界空间的深度容差（米）。
  // 涂色时：候选点必须落在鼠标点击处的 3D 半径范围内，才视为"可见点"，否则跳过（被前方物体遮挡）。
  const brushDepthTolerance = ref<number>(1.5)
  // 橡皮擦开关：true 时拖动会把命中点改回 classId -1（未标注）
  const eraseMode = ref<boolean>(false)
  const counts = reactive<Record<number, number>>({})
  const totalPoints = ref<number>(0)
  // 真实点云原点经纬度（ENU 映射基准），为 null 时用北京默认原点
  const pcdOrigin = ref<{ lon: number; lat: number } | null>(null)

  // 解析中状态：大文件 PCD 在 Worker 中解析期间，由 LoadingOverlay 展示遮罩
  const parsing = ref<boolean>(false)
  const parsingText = ref<string>('')

  // 撤销重做栈
  // history: Array<操作记录>，每条记录是 { pointId: { old, new } } 的对象
  // 比如一次拖动涂了 50 个点，就是一条记录包含 50 个键值对
  type HistoryEntry = Record<number, { old: number; new: number }>
  const history = ref<Array<HistoryEntry>>([])
  const historyIndex = ref<number>(-1) // 当前指针：-1 表示在栈底
  const maxHistory = 100 // 最多保留 100 步

  function setCurrentClass(id: number) {
    currentClassId.value = id
  }
  function setParsing(v: boolean, text = '') {
    parsing.value = v
    parsingText.value = v ? text : ''
  }
  function toggleErase() {
    eraseMode.value = !eraseMode.value
  }
  function setCounts(c: Record<number, number>) {
    // Vue3 reactive 支持动态新增 key
    for (const k of Object.keys(counts)) delete counts[Number(k)]
    Object.assign(counts, c)
  }
  function setTotal(n: number) {
    totalPoints.value = n
  }
  function colorOf(id: number): string {
    return classes.value.find((c) => c.id === id)?.color ?? '#9ca3af'
  }

  // 撤销重做逻辑
  // 记录一次操作：changes = { pointId: { old, new }, ... }
  function pushHistory(changes: HistoryEntry) {
    // 如果当前不在栈顶，丢弃后面的记录（新操作覆盖重做历史）
    if (historyIndex.value < history.value.length - 1) {
      history.value = history.value.slice(0, historyIndex.value + 1)
    }
    // 压入新记录
    history.value.push(changes)
    // 超出上限时删除最早的记录
    if (history.value.length > maxHistory) {
      history.value.shift()
    } else {
      historyIndex.value++
    }
  }
  // 撤销：返回需要恢复的点 { pointId: oldClassId }，由调用方执行恢复
  function canUndo(): boolean {
    return historyIndex.value >= 0
  }
  function canRedo(): boolean {
    return historyIndex.value < history.value.length - 1
  }
  function getUndoChanges(): HistoryEntry | null {
    if (!canUndo()) return null
    return history.value[historyIndex.value]
  }
  function getRedoChanges(): HistoryEntry | null {
    if (!canRedo()) return null
    return history.value[historyIndex.value + 1]
  }
  function moveBack() {
    if (canUndo()) historyIndex.value--
  }
  function moveForward() {
    if (canRedo()) historyIndex.value++
  }

  return {
    classes,
    currentClassId,
    paintMode,
    brushRadius,
    brushDepthTolerance,
    eraseMode,
    counts,
    totalPoints,
    pcdOrigin,
    parsing,
    parsingText,
    setParsing,
    setCurrentClass,
    setCounts,
    setTotal,
    toggleErase,
    colorOf,
    // 撤销重做
    history,
    historyIndex,
    pushHistory,
    canUndo,
    canRedo,
    getUndoChanges,
    getRedoChanges,
    moveBack,
    moveForward,
  }
})
