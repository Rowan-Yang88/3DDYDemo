// 卫星影像底图：直接返回 ArcGIS World_Imagery 图层数组。
// 启用后 Cesium 会自动拉 https://server.arcgisonline.com 的瓦片，免 key、免 token。
// 本文件没有探测 / 降级逻辑：用户明确表态「不联网就让它不显示」，这里只负责出图层。
import * as Cesium from 'cesium'

/**
 * 构造 ArcGIS World Imagery 卫星影像图层。
 * 顺序：[底图影像, 注记]。注记层可按需去掉，但加上能让地名更清晰。
 */
export function createArcGisImageryLayers(): Cesium.ImageryLayer[] {
  const imagery = new Cesium.UrlTemplateImageryProvider({
    url: 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',
    maximumLevel: 19,
    credit: 'Imagery © Esri',
  })
  return [new Cesium.ImageryLayer(imagery)]
}
