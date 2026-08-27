import type { PointCloudApi } from './usePointCloud'

// 跨组件共享点云 API 的轻量注册表
// （ViewerCanvas 创建后注册，Toolbar/ClassPanel 通过 getPointCloudApi() 调用导出等能力）
let api: PointCloudApi | null = null

export function registerPointCloud(a: PointCloudApi) {
  api = a
}

export function getPointCloudApi(): PointCloudApi | null {
  return api
}
