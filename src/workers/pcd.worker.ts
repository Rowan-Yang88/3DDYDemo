// PCD 解析 Worker —— 在后台线程解析点云文件，避免大文件解析阻塞主线程导致页面卡死。
//
// 与 src/composables/pcd.ts 的 parsePcd 复用同一套解析逻辑（ASCII / binary_little_endian），
// 保证 Worker 路径与降级路径行为完全一致。
//
// 通信协议：
//   主线程 -> Worker  { id, buffer }            （buffer 以 transfer 方式转移，零拷贝）
//   Worker -> 主线程  { id, ok: true, flat, count } （flat 为 [x,y,z,...] 的 Float32Array，transfer 回传）
//                    { id, ok: false, error }

import { parsePcd, toFlatPositions } from '../composables/pcd'

export interface PcdWorkerRequest {
  id: number
  buffer: ArrayBuffer
}

export type PcdWorkerResponse =
  | { id: number; ok: true; flat: Float32Array; count: number }
  | { id: number; ok: false; error: string }

// 在 Worker 上下文中 self 是 DedicatedWorkerGlobalScope。
// 这里用局部结构类型描述，避免与 tsconfig 中的 DOM lib 产生声明冲突。
const ctx = self as unknown as {
  onmessage: ((e: MessageEvent<PcdWorkerRequest>) => void) | null
  postMessage: (message: PcdWorkerResponse, transfer?: Transferable[]) => void
}

ctx.onmessage = (e: MessageEvent<PcdWorkerRequest>) => {
  const { id, buffer } = e.data
  try {
    const { positions, count } = parsePcd(buffer)
    // 打包为连续 Float32Array，配合 transfer 实现零拷贝回传主线程
    const flat = toFlatPositions(positions, count)
    ctx.postMessage({ id, ok: true, flat, count }, [flat.buffer])
  } catch (err) {
    ctx.postMessage({ id, ok: false, error: (err as Error).message })
  }
}
