<script setup lang="ts">
import { useAnnotationStore } from '../store/annotation'
import { getPointCloudApi } from '../composables/pointCloudRegistry'

const store = useAnnotationStore()

const brushOptions = [
  { label: 'S', value: 6 },
  { label: 'M', value: 12 },
  { label: 'L', value: 20 },
  { label: 'XL', value: 32 },
]

function exportAnnotations() {
  getPointCloudApi()?.exportAnnotations()
}
</script>

<template>
  <div class="toolbar">
    <span class="title">语义分割标注</span>
    <div class="classes">
      <button
        v-for="c in store.classes"
        :key="c.id"
        :class="{ active: store.currentClassId === c.id }"
        :style="store.currentClassId === c.id ? { borderColor: c.color } : {}"
        @click="store.setCurrentClass(c.id)"
      >
        <span class="dot" :style="{ background: c.color }"></span>{{ c.name }}
      </button>
    </div>
    <button
      :class="['paint', { active: store.paintMode }]"
      @click="store.paintMode = !store.paintMode"
    >
      {{ store.paintMode ? '涂鸦中' : '相机模式' }}
    </button>
    <span class="brush-size">
      <span class="brush-label">笔刷</span>
      <button
        v-for="opt in brushOptions"
        :key="opt.value"
        :class="{ active: store.brushRadius === opt.value }"
        @click="store.brushRadius = opt.value"
        :title="opt.label"
      >{{ opt.label }}</button>
    </span>
    <button class="export" @click="exportAnnotations">导出 JSON</button>
  </div>
</template>

<style scoped>
.toolbar {
  position: absolute;
  top: 12px;
  left: 50%;
  transform: translateX(-50%);
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 8px 12px;
  background: rgba(20, 24, 33, 0.85);
  border: 1px solid #2a3140;
  border-radius: 10px;
  backdrop-filter: blur(6px);
  z-index: 10;
}
.toolbar .title {
  font-weight: 600;
  font-size: 14px;
}
.toolbar .classes {
  display: flex;
  gap: 6px;
  flex-wrap: wrap;
}
.toolbar button {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 6px 10px;
  font-size: 13px;
  color: #e6e6e6;
  background: #161b24;
  border: 1px solid #2a3140;
  border-radius: 8px;
  cursor: pointer;
}
.toolbar button.active {
  border-width: 2px;
  background: #1d2430;
}
.toolbar .dot {
  width: 10px;
  height: 10px;
  border-radius: 50%;
  display: inline-block;
}
.toolbar .paint {
  background: #161b24;
}
.toolbar .paint.active {
  background: #f59e0b;
  border-color: #f59e0b;
  color: #fff;
}
.toolbar .export {
  background: #2563eb;
  border-color: #2563eb;
}
.toolbar .brush-size {
  display: flex;
  align-items: center;
  gap: 4px;
  padding-left: 8px;
  border-left: 1px solid #2a3140;
}
.toolbar .brush-label {
  font-size: 12px;
  color: #888;
}
.toolbar .brush-size button {
  padding: 4px 8px;
  font-size: 12px;
}
.toolbar .brush-size button.active {
  background: #1d2430;
  border-color: #f59e0b;
}
</style>
