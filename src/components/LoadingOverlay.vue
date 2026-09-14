<script setup lang="ts">
import { useAnnotationStore } from '../store/annotation'

const store = useAnnotationStore()
</script>

<template>
  <Transition name="fade">
    <div v-if="store.parsing" class="mask">
      <div class="card">
        <span class="spinner"></span>
        <div class="title">{{ store.parsingText || '解析中…' }}</div>
        <div class="hint">解析在 Web Worker 中执行，主线程不阻塞</div>
      </div>
    </div>
  </Transition>
</template>

<style scoped>
.mask {
  position: absolute;
  inset: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  background: rgba(11, 14, 20, 0.55);
  backdrop-filter: blur(3px);
  z-index: 50;
}
.card {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 12px;
  padding: 22px 30px;
  background: rgba(20, 24, 33, 0.95);
  border: 1px solid #2a3140;
  border-radius: 12px;
  box-shadow: 0 10px 30px rgba(0, 0, 0, 0.45);
}
.spinner {
  width: 28px;
  height: 28px;
  border: 3px solid #2a3140;
  border-top-color: #3b82f6;
  border-radius: 50%;
  animation: spin 0.8s linear infinite;
}
.title {
  font-size: 14px;
  color: #e6e6e6;
}
.hint {
  font-size: 12px;
  color: #9ca3af;
}
@keyframes spin {
  to {
    transform: rotate(360deg);
  }
}
.fade-enter-active,
.fade-leave-active {
  transition: opacity 0.18s ease;
}
.fade-enter-from,
.fade-leave-to {
  opacity: 0;
}
</style>
