// PCD 解析 Worker 的主线程包装。
//
// 职责：
//   1. 惰性创建单例 Worker（只在首次导入点云时才创建，不拖慢首屏）；
//   2. 用自增 id 把「一次请求」和「一次响应」配对成 Promise；
//   3. Worker 不可用（构造失败）时返回 null，由调用方降级为主线程同步解析。
//
// 这样 usePointCloud.loadPcd 就可以写成：先试 Worker，拿不到再退回同步，
// 既不阻塞 UI，也不会在老环境下直接不可用。

import type { PcdWorkerRequest, PcdWorkerResponse } from '../workers/pcd.worker'

let worker: Worker | null = null
let workerUnavailable = false
let seq = 0

const pending = new Map<
  number,
  { resolve: (flat: Float32Array) => void; reject: (err: Error) => void }
>()

function getWorker(): Worker | null {
  if (worker || workerUnavailable) return worker
  try {
    // Vite 原生支持该写法：自动把 worker 单独打包，并处理依赖图
    worker = new Worker(new URL('../workers/pcd.worker.ts', import.meta.url), {
      type: 'module',
    })
    worker.onmessage = (e: MessageEvent<PcdWorkerResponse>) => {
      const task = pending.get(e.data.id)
      if (!task) return
      pending.delete(e.data.id)
      if (e.data.ok) task.resolve(e.data.flat)
      else task.reject(new Error(e.data.error))
    }
    worker.onerror = () => {
      const err = new Error('PCD 解析 Worker 执行失败')
      pending.forEach((task) => task.reject(err))
      pending.clear()
    }
  } catch {
    workerUnavailable = true
    worker = null
  }
  return worker
}

/**
 * 在 Worker 中解析 PCD。
 * @returns Promise<Float32Array>；若 Worker 不可用则返回 null（调用方应降级为同步解析）。
 */
export function parsePcdInWorker(buffer: ArrayBuffer): Promise<Float32Array> | null {
  const w = getWorker()
  if (!w) return null

  const id = ++seq
  return new Promise<Float32Array>((resolve, reject) => {
    pending.set(id, { resolve, reject })
    const req: PcdWorkerRequest = { id, buffer }
    // buffer 以 transfer 转移给 Worker：大文件（几十 MB）不做结构化克隆拷贝
    w.postMessage(req, [buffer])
  })
}

/** 销毁 Worker（页面卸载 / 组件销毁时调用，避免泄漏） */
export function terminatePcdWorker() {
  worker?.terminate()
  worker = null
  workerUnavailable = false
  pending.clear()
}
