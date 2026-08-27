<script setup lang="ts">
import ViewerCanvas from './components/ViewerCanvas.vue'
import Toolbar from './components/Toolbar.vue'
import ClassPanel from './components/ClassPanel.vue'
</script>

<template>
  <div class="app">
    <ViewerCanvas />
    <Toolbar />
    <ClassPanel />
  </div>
</template>

<style scoped>
.app {
  position: relative;
  width: 100%;
  height: 100%;
}
</style>
