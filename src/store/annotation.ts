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
  const counts = reactive<Record<number, number>>({})
  const totalPoints = ref<number>(0)

  function setCurrentClass(id: number) {
    currentClassId.value = id
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

  return {
    classes,
    currentClassId,
    paintMode,
    counts,
    totalPoints,
    setCurrentClass,
    setCounts,
    setTotal,
    colorOf,
  }
})
