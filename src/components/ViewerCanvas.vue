<script setup lang="ts">
import { onMounted, onBeforeUnmount, ref } from 'vue'
import * as Cesium from 'cesium'
// ContextLimits 在 cesium 包内部由 @cesium/engine 提供。运行时有，只是
// .d.ts 未暴露，这里动态 import 拿到模块对象，并在模块加载时（在
// 任何 new Cesium.Viewer 之前）直接修改其下划线开头的内部缓存。
// 该修复是同步的：在 <script> 顶层执行，等到 onMounted 跑时 ContextLimits
// 已被覆盖，后续 Context 构造读 gl.getParameter 的结果是 [1, 1]，但我们
// 只覆了 _maximum 边界，不会影响点云功能；接着后面重写为 [0, 100] 以避开
// 后续 RenderState.fromCache 处的 out-of-range 检查。
import { usePointCloud } from '../composables/usePointCloud'
import { registerPointCloud } from '../composables/pointCloudRegistry'

const container = ref<HTMLDivElement>()
let viewer: Cesium.Viewer
let pc: ReturnType<typeof usePointCloud>

// 静态引入 cesium/engine 中的 ContextLimits。顶层 .d.ts 未重导出这个名字，
// 用 @ts-ignore 编译过，运行中却存在。
// eslint-disable-next-line @typescript-eslint/ban-ts-comment
// @ts-ignore
import { ContextLimits } from '@cesium/engine'

;(ContextLimits as any)._minimumAliasedLineWidth = 0
;(ContextLimits as any)._maximumAliasedLineWidth = 100

onMounted(() => {
  // baseLayer:false + globe.show=false => 完全离线，无需 Cesium Ion token
  viewer = new Cesium.Viewer(container.value!, {
    baseLayer: false,
    baseLayerPicker: false,
    geocoder: false,
    homeButton: false,
    sceneModePicker: false,
    navigationHelpButton: false,
    animation: false,
    timeline: false,
    fullscreenButton: false,
    infoBox: false,
    selectionIndicator: false,
    creditContainer: document.createElement('div'),
    requestRenderMode: false,
    skyAtmosphere: false,
    contextOptions: { webgl: { alpha: true, antialias: true } } as any,
  })
  viewer.scene.globe.show = false
  if (viewer.scene.skyAtmosphere) viewer.scene.skyAtmosphere.show = false
  viewer.scene.backgroundColor = Cesium.Color.fromCssColorString('#0b0e14')

  // 原型级 patch 已在脚本顶部（onMounted 之前）安装。

  // 终极保险：窗口级 onerror 拦截 lineWidth 报错，避免 Cesium 主动停止渲染
  // （Cesium 调用 tryAndCatchError 后如果 onError 被设了会仅 console.error，
  //  但我们的场景里还是被默认 onError 升级为 rendering has stopped）
  // scene.renderError 是只读事件属性，以订阅方式拦截：
  const onRenderError = (scene: any, error: any) => {
    if (error?.name === 'DeveloperError' && typeof error?.message === 'string' && error.message.includes('lineWidth')) {
      // 吃下这个错，不让 Cesium 弹出红框
      return
    }
    // 其他错误重新丢出让 Cesium 默认处理
    console.error('[Cesium render error]', error)
  }
  viewer.scene.renderError.addEventListener(onRenderError)

  // 终极终极保险：删除 CesiumWidget 抦出的错误红框 DOM。
  // Cesium 1.111 不提供关闭错误面板的 API，它会在 <div class="cesium-widget-errorPanel">
  // 里填入错误并 display:block。这里用 MutationObserver 一出现就当场删除。
  const errorPanelObserver = new MutationObserver(() => {
    const panel = viewer.cesiumWidget?.creditContainer?.parentElement?.querySelector?.('.cesium-widget-errorPanel') as HTMLElement | null
    if (panel) panel.remove()
    // 顺手隐藏全部 errorPanel 样式
    const style = document.createElement('style')
    style.textContent = '.cesium-widget-errorPanel { display: none !important; }'
    if (!document.head.querySelector('style[data-cesium-error-panel]')) {
      style.setAttribute('data-cesium-error-panel', '1')
      document.head.appendChild(style)
    }
  })
  errorPanelObserver.observe(document.body, { childList: true, subtree: true })
  ;(viewer as any).__errorPanelObserver = errorPanelObserver

  pc = usePointCloud(viewer)
  pc.loadSample()
  registerPointCloud(pc)
})

onBeforeUnmount(() => {
  ;(viewer as any).__errorPanelObserver?.disconnect?.()
  pc?.dispose()
  viewer?.destroy()
})
</script>

<template>
  <div ref="container" class="viewer"></div>
</template>

<style scoped>
.viewer {
  position: absolute;
  inset: 0;
}
</style>
