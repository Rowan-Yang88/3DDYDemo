<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref, watch } from 'vue'
import * as echarts from 'echarts/core'
import { PieChart } from 'echarts/charts'
import { TitleComponent, TooltipComponent } from 'echarts/components'
import { CanvasRenderer } from 'echarts/renderers'
import type { ComposeOption } from 'echarts/core'
import type { PieSeriesOption } from 'echarts/charts'
import type { TitleComponentOption, TooltipComponentOption } from 'echarts/components'
import { useAnnotationStore } from '../store/annotation'

// 按需引入：只注册环形图 + 用到的组件，避免把 echarts 全量包（约 1MB）打进产物。
// 这是 echarts 官方推荐的 tree-shaking 用法。
echarts.use([PieChart, TooltipComponent, TitleComponent, CanvasRenderer])

type ECOption = ComposeOption<PieSeriesOption | TooltipComponentOption | TitleComponentOption>

const store = useAnnotationStore()
const chartEl = ref<HTMLDivElement>()
let chart: echarts.EChartsType | null = null

/** 构造环形图配置：按语义类别展示占比，中心显示总点数 */
function buildOption(): ECOption {
  const data = store.classes.map((c) => ({
    name: c.name,
    value: store.counts[c.id] ?? 0,
    itemStyle: { color: c.color },
  }))

  return {
    animationDuration: 300,
    animationDurationUpdate: 300,
    tooltip: {
      trigger: 'item',
      formatter: '{b}<br/>{c} 点（{d}%）',
      backgroundColor: 'rgba(20,24,33,0.95)',
      borderColor: '#2a3140',
      textStyle: { color: '#e6e6e6', fontSize: 12 },
    },
    title: {
      text: store.totalPoints.toLocaleString(),
      subtext: '总点数',
      left: 'center',
      top: '37%',
      textStyle: { color: '#e6e6e6', fontSize: 18, fontWeight: 'bold' },
      subtextStyle: { color: '#9ca3af', fontSize: 11 },
    },
    series: [
      {
        type: 'pie',
        radius: ['56%', '80%'],
        center: ['50%', '50%'],
        avoidLabelOverlap: false,
        itemStyle: { borderColor: '#141821', borderWidth: 2 },
        label: { show: false },
        labelLine: { show: false },
        emphasis: { scale: true },
        data,
      },
    ],
  }
}

function refresh() {
  // notMerge=true：类别/计数变化时整体替换，避免残留上一次的数据项
  chart?.setOption(buildOption(), { notMerge: true })
}

function onResize() {
  chart?.resize()
}

onMounted(() => {
  if (!chartEl.value) return
  chart = echarts.init(chartEl.value, undefined, { renderer: 'canvas' })
  refresh()
  window.addEventListener('resize', onResize)
})

onBeforeUnmount(() => {
  window.removeEventListener('resize', onResize)
  chart?.dispose()
  chart = null
})

// counts 是 reactive 对象，watch 会深度追踪；totalPoints 单独监听。
// 于是涂色 / 橡皮擦 / 撤销重做 / 导入点云后，图表都会自动更新。
watch(store.counts, refresh)
watch(() => store.totalPoints, refresh)
</script>

<template>
  <div class="panel">
    <h3>语义类别</h3>
    <div ref="chartEl" class="chart"></div>
    <ul>
      <li v-for="c in store.classes" :key="c.id">
        <span class="dot" :style="{ background: c.color }"></span>
        <span class="name">{{ c.name }}</span>
        <span class="count">{{ (store.counts[c.id] ?? 0).toLocaleString() }}</span>
      </li>
    </ul>
  </div>
</template>

<style scoped>
.panel {
  position: absolute;
  top: 12px;
  right: 12px;
  width: 232px;
  padding: 12px;
  background: rgba(20, 24, 33, 0.85);
  border: 1px solid #2a3140;
  border-radius: 10px;
  backdrop-filter: blur(6px);
  z-index: 10;
  font-size: 13px;
}
.panel h3 {
  font-size: 14px;
  margin-bottom: 4px;
}
.panel .chart {
  width: 100%;
  height: 150px;
}
.panel ul {
  list-style: none;
  display: flex;
  flex-direction: column;
  gap: 6px;
  margin-top: 6px;
  padding-top: 8px;
  border-top: 1px solid #2a3140;
}
.panel li {
  display: flex;
  align-items: center;
  gap: 8px;
}
.panel .dot {
  width: 10px;
  height: 10px;
  border-radius: 50%;
}
.panel .name {
  flex: 1;
}
.panel .count {
  color: #9ca3af;
  font-variant-numeric: tabular-nums;
}
</style>
