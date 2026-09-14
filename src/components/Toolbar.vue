<script setup lang="ts">
import { nextTick, ref } from 'vue'
import { useAnnotationStore } from '../store/annotation'
import { getPointCloudApi } from '../composables/pointCloudRegistry'

const store = useAnnotationStore()

const brushOptions = [
  { label: 'S', value: 6 },
  { label: 'M', value: 12 },
  { label: 'L', value: 20 },
  { label: 'XL', value: 32 },
]

const fileInput = ref<HTMLInputElement>()
async function onPcdSelected(e: Event) {
  const input = e.target as HTMLInputElement
  const file = input.files?.[0]
  if (!file) return
  input.value = '' // 允许重复选择同一文件

  const sizeMb = (file.size / 1024 / 1024).toFixed(2)
  try {
    store.setParsing(true, `正在解析 ${file.name}（${sizeMb} MB）…`)
    // 先让 Vue 把 loading 遮罩渲染出来，再开始读取/解析，否则小文件看不到反馈
    await nextTick()
    const buf = await file.arrayBuffer()
    // loadPcd 为 async：解析在 Web Worker 中完成，不阻塞主线程
    await getPointCloudApi()?.loadPcd(buf)
  } catch (err) {
    alert('点云加载失败：' + (err as Error).message)
  } finally {
    store.setParsing(false)
  }
}

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
    <button
      :class="['erase', { active: store.eraseMode }]"
      @click="store.eraseMode = !store.eraseMode"
      :disabled="!store.paintMode"
      :title="store.paintMode ? '进入涂鸦模式后可启用橡皮擦' : '需先开启涂鸦模式'"
    >
      {{ store.eraseMode ? '橡皮擦：开' : '橡皮擦' }}
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
    <span class="history-btns">
      <button
        class="undo"
        @click="getPointCloudApi()?.undo()"
        :disabled="store.historyIndex < 0"
        title="撤销 (Ctrl+Z)"
      >撤销</button>
      <button
        class="redo"
        @click="getPointCloudApi()?.redo()"
        :disabled="store.historyIndex >= store.history.length - 1"
        title="重做 (Ctrl+Y)"
      >重做</button>
    </span>
    <button class="export" @click="exportAnnotations">导出 JSON</button>
    <input
      ref="fileInput"
      type="file"
      accept=".pcd"
      style="display: none"
      @change="onPcdSelected"
    />
    <button class="import" @click="fileInput?.click()">导入点云</button>
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
  gap: 10px;
  padding: 8px 14px;
  background: rgba(20, 24, 33, 0.85);
  border: 1px solid #2a3140;
  border-radius: 10px;
  backdrop-filter: blur(6px);
  z-index: 10;
  width: max-content;
  max-width: 95vw;
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
.toolbar .erase {
  background: #161b24;
}
.toolbar .erase:disabled {
  opacity: 0.4;
  cursor: not-allowed;
}
.toolbar .erase.active {
  background: #ef4444;
  border-color: #ef4444;
  color: #fff;
}
.toolbar .export {
  background: #2563eb;
  border-color: #2563eb;
}
.toolbar .import {
  background: #16a34a;
  border-color: #16a34a;
}
.toolbar .import:hover {
  background: #22c55e;
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
.toolbar .history-btns {
  display: flex;
  gap: 4px;
  padding-left: 8px;
  border-left: 1px solid #2a3140;
}
.toolbar .undo,
.toolbar .redo {
  background: #161b24;
  min-width: 48px;
}
.toolbar .undo:disabled,
.toolbar .redo:disabled {
  opacity: 0.4;
  cursor: not-allowed;
}
.toolbar .undo:not(:disabled):hover,
.toolbar .redo:not(:disabled):hover {
  background: #2a3140;
}
</style>
