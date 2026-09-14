# 3D 点云语义分割标注平台

面向**地图 / 测绘 / 高精地图**场景的 3D 点云语义分割标注工具。
技术栈：**Vue 3 + TypeScript + Vite + Cesium + Pinia + ECharts**。

### 功能演示

- 🎯 支持 6 类语义标注：地面/道路、建筑、植被、车辆、杆状物、未标注
- 🖌️ **涂鸦模式** / **相机模式** 自由切换，左键拖动连续涂色
- 🖊️ **笔刷大小可调**（S / M / L / XL），适应精细标注或大范围涂抹
- 🧽 **橡皮擦**：误涂点一键擦回「未标注」
- 🔍 **深度遮挡**：只涂相机可见的点，不误涂被建筑遮挡的背面点
- 🌊 **路径补偿**：快速拖动时沿轨迹插值，避免漏涂
- ↩️ **撤销 / 重做**：操作历史栈（上限 100 步），支持 `Ctrl+Z` / `Ctrl+Y`
- ⌨️ **键盘快捷键**：`1`-`6` 切类别、`E` 橡皮擦、`B` 笔刷循环（详见下方）
- 📂 **直接导入 .pcd**：解析跑在 **Web Worker**，大文件不卡界面
- ⏳ **解析中 loading 遮罩**：导入时全屏提示，解析全程可继续操作视角
- 📊 右侧面板 **ECharts 环形图** 实时展示类别占比，下方附精确点数列表
- 📤 一键导出标注结果（JSON，含经纬度高程）
- ⚙️ 支持加载真实 .pcd / .las 转出的 3D Tiles 点云

> 内置示例点云，开箱即跑，**无需 Cesium Ion token**。

### 技术栈

| 类别 | 技术 |
|------|------|
| 前端框架 | Vue 3 (Composition API, `<script setup>`) + TypeScript |
| 构建工具 | Vite 5 |
| 状态管理 | Pinia |
| 3D 渲染引擎 | CesiumJS 1.144 |
| 图表 | ECharts 6（按需引入，tree-shaking） |
| 多线程 | 原生 Web Worker（Vite 原生 `new URL(...)` 语法） |
| 样式 | 原生 CSS（无 UI 框架依赖） |

### 键盘快捷键

| 快捷键 | 操作 |
|--------|------|
| `Ctrl+Z` | 撤销 |
| `Ctrl+Y` / `Ctrl+Shift+Z` | 重做 |
| `1`-`6` | 切换类别（1=地面/道路, 2=建筑, 3=植被, 4=车辆, 5=杆状物, 6=未标注） |
| `E` | 切换橡皮擦 |
| `B` | 笔刷往大循环（S→M→L→XL） |
| `Shift+B` | 笔刷往小循环（XL→L→M→S） |
| 涂鸦模式下左键拖 | 连续标注 |
| 涂鸦模式下左键单击 | 单点标注 |
| 右键拖 | 平移视角 |
| 滚轮 | 缩放 |

笔刷半径档位：`S=6` / `M=12` / `L=20` / `XL=32`（单位为点云世界坐标，米）。

## 快速开始

```bash
# 需要 Node.js 20.x LTS
cd point-cloud-annotator
npm install
npm run dev      # 自动打开 http://localhost:5173
```

> 也支持 pnpm：`pnpm install && pnpm run dev`。

界面出来后：
- 鼠标拖拽旋转 / 滚轮缩放查看点云
- 顶部工具栏选一个语义类别（如「建筑」）
- 调节笔刷大小（S 精细 → XL 大范围）
- **按住左键在点云上拖动**即可把经过的点染成当前类别
- 右侧环形图与计数列表实时更新
- 点「导入点云」可载入自己的 `.pcd`（解析期间会显示 loading 遮罩）
- 点「导出 JSON」下载标注结果（id + 类别 + 经纬度高程）

## 目录结构

```
point-cloud-annotator/
├── index.html
├── vite.config.ts              # Vite + vite-plugin-cesium
├── tsconfig.json
└── src/
    ├── main.ts                 # 入口：挂载 Vue + Pinia
    ├── App.vue                 # 布局：画布 + 工具栏 + 类别面板 + loading 遮罩
    ├── styles/main.css
    ├── types/index.ts          # SemanticClass / PointRecord 类型
    ├── store/annotation.ts     # Pinia：类别、当前类别、笔刷半径、计数、parsing 状态
    ├── composables/
    │   ├── usePointCloud.ts        # 核心：点云加载 + 拾取上色 + 导出 + 撤销重做
    │   ├── pcdWorker.ts            # Worker 封装：惰性单例 + id 配对 + 不可用时降级
    │   ├── pointCloudRegistry.ts   # 跨组件共享点云 API
    │   ├── pcd.ts                  # .pcd 解析（ASCII / binary_little_endian）
    │   └── useKeyboardShortcuts.ts # 键盘快捷键
    ├── workers/
    │   └── pcd.worker.ts       # 解析 Worker：结果零拷贝 transfer 回主线程
    └── components/
        ├── ViewerCanvas.vue    # Cesium Viewer 挂载 + 示例点云
        ├── Toolbar.vue         # 类别选择 + 笔刷大小 + 导入 / 导出
        ├── ClassPanel.vue      # ECharts 环形图 + 类别计数列表
        └── LoadingOverlay.vue  # 解析中全屏遮罩
```

## 性能设计

大数据量点云的三处关键处理：

1. **Web Worker 解析**：`.pcd` 的字节解析全部在 `src/workers/pcd.worker.ts` 里完成。
   主线程只负责 `file.arrayBuffer()` 和接收结果，解析期间界面完全不阻塞
   （可以在 loading 遮罩下继续旋转/缩放视角）。
   `ArrayBuffer` 与回传的 `Float32Array` 都用 **transferable 零拷贝**传递。
   若浏览器不支持 Worker 或构造失败，`pcdWorker.ts` 返回 `null`，
   调用方自动降级为主线程同步解析，功能不受影响。
2. **降采样上限**：逐点构建 `PointPrimitive` 在超大点云上会明显卡顿，
   因此超过 **60,000 点**会按步长均匀降采样到上限以内
   （Worker 仍会解析全部点，只是渲染上限受控）。
3. **Cesium 外链**：Cesium 由 `vite-plugin-cesium` 输出为独立静态资源，
   不打进 app bundle，因此业务代码的产物体积可控（约 524 kB / gzip 185 kB，
   其中主要是 ECharts）。

## 接入真实点云（.pcd / .las）

本 starter 支持**两种方式**加载真实点云：

### 方式 A：直接导入 .pcd（推荐先试，零依赖）
点击工具栏「导入点云」按钮选一个 `.pcd` 文件即可。
前端用 `src/composables/pcd.ts` 解析（支持 ASCII / binary_little_endian），
解析在 Web Worker 中执行，把局部坐标经 ENU 映射到 Cesium 世界坐标后，
复用 `PointPrimitiveCollection` 标注链路
（笔刷、橡皮擦、深度遮挡、撤销重做、导出全部通用）。

- 适合作品集演示（数千~数十万点，超 6 万点会自动降采样）
- 默认原点为北京（116.391, 39.907），可在 `store.pcdOrigin` 改成点云实际经纬度
- 不支持 `binary_compressed` 格式，请用 `binary` / `binary_little_endian` 或 `ascii` 导出

### 方式 B：3D Tiles (pnts)（生产级，百万级点）
Cesium 渲染大规模点云的标准方式是 **3D Tiles (pnts)**。先把点云转成 pnts：

**py3dtiles（本地，免费）**
```bash
pip install py3dtiles
py3dtiles translate your_scan.pcd ./tileset --format pnts
# 或 .las/.laz
```
把生成的 `tileset` 目录放到 `public/`，调用：
```ts
await pc.loadTileset('/tileset/tileset.json')
```

**Cesium Ion（在线，免费额度）**
```ts
await Cesium.Cesium3DTileset.fromIonAssetId(ASSET_ID)
```

真实 3D Tiles 点云的拾取对象类型是 `Cesium3DTilePointFeature`（而非示例的 `PointPrimitive`），
按 feature 批量上色即可，思路与本项目一致。

## 仓库内的示例点云

| 文件 | 点数 | 大小 | 格式 | 用途 |
|------|------|------|------|------|
| `sample_cloud.pcd` | 2,624 | 43 KB | ASCII | 内置示例，开箱即用 |
| `big_cloud.pcd` | 800,000 | 9.16 MB | binary_little_endian | 大文件测试用，验证 Worker 解析与 loading 态 |

`big_cloud.pcd`（`FIELDS x y z`，每个 float32）由 `gen_big_pcd.js` 合成生成，可随时重新生成。

## 已知限制

- `.pcd` 的 `binary_compressed`（zlib 压缩体）格式不支持
- 3D Tiles 目前为「可加载」级别，按类别批量上色尚未实现
- 标注结果只导出 JSON，未做持久化（刷新即丢失）
- 语义类别为代码内固定 6 类，暂未开放配置

## 下一步可扩展（简历亮点）

1. **真实大规模点云**：当前直接导入 .pcd 适合作品集（数万点）；百万级激光雷达建议走 3D Tiles(pnts) + LOD 流式加载（接口 `loadTileset` 已预留）
2. **其他标注类型**：3D 包围盒、矢量线/面（道路边界、车道线 —— 高精地图核心）
3. **工程化**：标注结果持久化（IndexedDB / 后端）、多人协作、类别可配置
4. **智能填充 / 插值**：相邻点大概率同类，自动补缝隙（替代手动涂鸦的漏涂）
5. **统计增强**：标注完成度百分比、导出 CSV / Label Studio 格式
   （各类别占比环形图已实现，见 `ClassPanel.vue`）

## 常用命令

```bash
npm run dev      # 本地开发
npm run build    # 类型检查（vue-tsc --noEmit）+ 生产构建
npm run preview  # 预览构建产物
```
