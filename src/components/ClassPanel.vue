<script setup lang="ts">
import { useAnnotationStore } from '../store/annotation'

const store = useAnnotationStore()
</script>

<template>
  <div class="panel">
    <h3>语义类别</h3>
    <ul>
      <li v-for="c in store.classes" :key="c.id">
        <span class="dot" :style="{ background: c.color }"></span>
        <span class="name">{{ c.name }}</span>
        <span class="count">{{ store.counts[c.id] ?? 0 }}</span>
      </li>
    </ul>
    <div class="total">总点数：{{ store.totalPoints }}</div>
  </div>
</template>

<style scoped>
.panel {
  position: absolute;
  top: 12px;
  right: 12px;
  width: 200px;
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
  margin-bottom: 8px;
}
.panel ul {
  list-style: none;
  display: flex;
  flex-direction: column;
  gap: 6px;
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
.panel .total {
  margin-top: 10px;
  padding-top: 8px;
  border-top: 1px solid #2a3140;
  color: #9ca3af;
}
</style>
