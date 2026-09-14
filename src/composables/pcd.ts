// PCD 点云文件解析（支持 ASCII 与 binary_little_endian 两种 DATA 格式）
// 返回局部坐标（米）下的 xyz 点列表。真实激光雷达点云通常是局部坐标，
// 需要由调用方映射到 Cesium 世界坐标（见 usePointCloud.loadPcd）。
//
// 本文件是纯函数、不依赖 DOM，因此既能被主线程直接调用（降级路径），
// 也能被 src/workers/pcd.worker.ts 在 Worker 线程里复用（默认路径）。

export interface PcdData {
  positions: number[][] // [[x,y,z], ...] 局部坐标（米）
  count: number
}

/**
 * 解析 PCD 文件。
 * @param buffer 文件二进制内容（来自 File.arrayBuffer()）
 */
export function parsePcd(buffer: ArrayBuffer): PcdData {
  const bytes = new Uint8Array(buffer)
  const text = new TextDecoder('ascii')

  // 1) 逐行读 header，直到遇到 DATA 行
  const fields: string[] = []
  const types: string[] = []
  const sizes: number[] = []
  const counts: number[] = []
  let pointCount = 0
  let dataFormat = ''
  let headerEnd = 0

  {
    let i = 0
    let start = 0
    const lines: string[] = []
    while (i < bytes.length) {
      if (bytes[i] === 0x0a) {
        const ln = text.decode(bytes.subarray(start, i)).trim()
        lines.push(ln)
        start = i + 1
        if (ln.toUpperCase().startsWith('DATA')) {
          headerEnd = i + 1
          break
        }
      }
      i++
    }

    for (const ln of lines) {
      const parts = ln.split(/\s+/)
      const key = parts[0].toUpperCase()
      if (key === 'FIELDS') fields.push(...parts.slice(1))
      else if (key === 'TYPE') types.push(...parts.slice(1))
      else if (key === 'SIZE') sizes.push(...parts.slice(1).map(Number))
      else if (key === 'COUNT') counts.push(...parts.slice(1).map(Number))
      else if (key === 'POINTS') pointCount = Number(parts[1])
      else if (key === 'DATA') dataFormat = (parts[1] ?? '').toLowerCase()
    }
  }

  if (!fields.length) throw new Error('PCD 解析失败：未找到 FIELDS 字段')
  const xi = fields.indexOf('x')
  const yi = fields.indexOf('y')
  const zi = fields.indexOf('z')
  if (xi < 0 || yi < 0 || zi < 0) {
    throw new Error('PCD 解析失败：缺少 x/y/z 字段')
  }

  const positions: number[][] = []

  if (dataFormat === 'ascii') {
    const rest = text.decode(bytes.subarray(headerEnd))
    const dataLines = rest.split(/\r?\n/).filter(Boolean)
    const limit = pointCount > 0 ? pointCount : dataLines.length
    for (let p = 0; p < Math.min(limit, dataLines.length); p++) {
      const vals = dataLines[p].split(/\s+/).map(Number)
      positions.push([vals[xi], vals[yi], vals[zi]])
    }
  } else if (dataFormat === 'binary' || dataFormat === 'binary_little_endian') {
    if (pointCount <= 0) throw new Error('PCD 解析失败：binary 格式缺少 POINTS 数量')
    const view = new DataView(buffer)
    let pointSize = 0
    for (let i = 0; i < fields.length; i++) pointSize += sizes[i] * (counts[i] || 1)

    let off = headerEnd
    for (let p = 0; p < pointCount; p++) {
      let x = 0
      let y = 0
      let z = 0
      let foff = off
      for (let i = 0; i < fields.length; i++) {
        const t = types[i]
        const s = sizes[i]
        const c = counts[i] || 1
        for (let k = 0; k < c; k++) {
          let val = 0
          if (t === 'F') val = view.getFloat32(foff, true)
          else if (t === 'I' && s === 1) val = view.getInt8(foff)
          else if (t === 'I' && s === 2) val = view.getInt16(foff, true)
          else if (t === 'I' && s === 4) val = view.getInt32(foff, true)
          else if (t === 'U' && s === 1) val = view.getUint8(foff)
          else if (t === 'U' && s === 2) val = view.getUint16(foff, true)
          else if (t === 'U' && s === 4) val = view.getUint32(foff, true)
          foff += s
          if (i === xi) x = val
          else if (i === yi) y = val
          else if (i === zi) z = val
        }
      }
      off += pointSize
      positions.push([x, y, z])
    }
  } else {
    throw new Error(
      `不支持的 PCD DATA 格式: ${dataFormat}。请使用 ascii 或 binary（binary_compressed 暂不支持）`,
    )
  }

  return { positions, count: positions.length }
}

/**
 * 把 [[x,y,z], ...] 打包成连续的 Float32Array（[x,y,z,x,y,z,...]）。
 * 用途：跨线程传递时用 transfer 零拷贝传输，比传 number[][] 快得多。
 */
export function toFlatPositions(positions: number[][], count: number): Float32Array {
  const flat = new Float32Array(count * 3)
  for (let i = 0; i < count; i++) {
    const p = positions[i]
    const o = i * 3
    flat[o] = p[0]
    flat[o + 1] = p[1]
    flat[o + 2] = p[2]
  }
  return flat
}
