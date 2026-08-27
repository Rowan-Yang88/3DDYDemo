import type { Cartesian3 } from 'cesium'

// 一个语义类别（地图/测绘场景的默认类别见 store）
export interface SemanticClass {
  id: number
  name: string
  color: string // 十六进制，如 '#22c55e'
}

// 单点记录：用于导出标注结果
export interface PointRecord {
  id: number
  position: Cartesian3
  classId: number
}
