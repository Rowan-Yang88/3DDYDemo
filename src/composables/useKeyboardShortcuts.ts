import { onMounted, onBeforeUnmount } from 'vue'
import { useAnnotationStore } from '../store/annotation'
import { getPointCloudApi } from './pointCloudRegistry'

/**
 * 键盘快捷键
 * - Ctrl+Z: 撤销
 * - Ctrl+Y / Ctrl+Shift+Z: 重做
 * - 1-6: 切换类别（对应 classes 数组顺序）
 * - E: 切换橡皮擦
 * - B / Shift+B: 循环切换笔刷大小
 */
export function useKeyboardShortcuts() {
  const store = useAnnotationStore()

  function onKeyDown(e: KeyboardEvent) {
    // Ctrl+Z: 撤销
    if (e.ctrlKey && e.key === 'z' && !e.shiftKey) {
      e.preventDefault()
      getPointCloudApi()?.undo()
      return
    }

    // Ctrl+Y 或 Ctrl+Shift+Z: 重做
    if ((e.ctrlKey && e.key === 'y') || (e.ctrlKey && e.shiftKey && e.key === 'z')) {
      e.preventDefault()
      getPointCloudApi()?.redo()
      return
    }

    // 1-6: 切换类别
    const numKey = parseInt(e.key)
    if (!e.ctrlKey && !e.altKey && !e.shiftKey && numKey >= 1 && numKey <= 6) {
      // classes 数组顺序：[地面/道路, 建筑, 植被, 车辆, 杆状物, 未标注]
      // 对应 id: [0, 1, 2, 3, 4, -1]
      const classIds = [0, 1, 2, 3, 4, -1]
      store.setCurrentClass(classIds[numKey - 1])
      return
    }

    // E: 切换橡皮擦
    if (e.key.toLowerCase() === 'e' && !e.ctrlKey && !e.altKey) {
      store.eraseMode = !store.eraseMode
      return
    }

    // B: 循环切换笔刷大小
    if (e.key.toLowerCase() === 'b' && !e.ctrlKey && !e.altKey) {
      const sizes = [6, 12, 20, 32] // S, M, L, XL
      const labels = ['S', 'M', 'L', 'XL']
      const currentIdx = sizes.indexOf(store.brushRadius)
      const nextIdx = e.shiftKey
        ? (currentIdx - 1 + sizes.length) % sizes.length // Shift+B: 往小
        : (currentIdx + 1) % sizes.length // B: 往大
      store.brushRadius = sizes[nextIdx]
      console.log(`笔刷: ${labels[nextIdx]}`)
      return
    }
  }

  onMounted(() => {
    window.addEventListener('keydown', onKeyDown)
  })

  onBeforeUnmount(() => {
    window.removeEventListener('keydown', onKeyDown)
  })
}
