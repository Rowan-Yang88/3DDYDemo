# 3D 点云语义分割标注平台

面向**地图 / 测绘 / 高精地图**场景的 3D 点云语义分割标注工具。
技术栈：**Vue 3 + TypeScript + Vite + Cesium + Pinia**。

### 功能演示

- 🎯 支持 6 类语义标注：地面/道路、建筑、植被、车辆、杆状物、未标注
- 🖌️ **涂鸦模式** / **相机模式** 自由切换，左键拖动连续涂色
- 🖊️ **笔刷大小可调**（S / M / L / XL），适应精细标注或大范围涂抹
- 📊 右侧面板实时显示各类别点数统计
- 📤 一键导出标注结果（JSON，含经纬度高程）
- ⚙️ 支持加载真实 .pcd / .las 转出的 3D Tiles 点云

> 内置示例点云，开箱即跑，**无需 Cesium Ion token**。

### 技术栈

| 类别 | 技术 |
|------|------|
| 前端框架 | Vue 3 (Composition API) + TypeScript |
| 构建工具 | Vite 5 |
| 状态管理 | Pinia |
| 3D 渲染引擎 | CesiumJS 1.144 |
| 样式 | 原生 CSS（无 UI 框架依赖） |

### 键盘快捷键

| 操作 | 说明 |
|------|------|
| 默认左键拖 | 旋转视角 |
| 涂鸦模式下左键拖 | 连续标注（笔刷半径内所有点） |
| 涂鸦模式下左键单击 | 单点标注 |
| 右键拖 | 平移视角 |
| 滚轮 | 缩放 |

## 快速开始

```bash
# 需要 Node.js 20.x LTS，并安装 pnpm
npm install -g pnpm

cd point-cloud-annotator
pnpm install
pnpm run dev      # 自动打开 http://localhost:5173
```

界面出来后：
- 鼠标拖拽旋转 / 滚轮缩放查看点云
- 顶部工具栏选一个语义类别（如「建筑」）
- 调节笔刷大小（S 精细 → XL 大范围）
- **按住左键在点云上拖动**即可把经过的点染成当前类别
- 右侧面板实时显示各类别点数
- 点「导出 JSON」下载标注结果（id + 类别 + 经纬度高程）

## 目录结构

```
point-cloud-annotator/
├── index.html
├── vite.config.ts          # Vite + vite-plugin-cesium
├── tsconfig.json
└── src/
    ├── main.ts             # 入口：挂载 Vue + Pinia
    ├── App.vue             # 布局：画布 + 工具栏 + 类别面板
    ├── styles/main.css
    ├── types/index.ts      # SemanticClass / PointRecord 类型
    ├── store/annotation.ts # Pinia：类别、当前类别、笔刷半径、计数
    ├── composables/
    │   ├── usePointCloud.ts      # 核心：点云加载 + 拾取上色 + 导出
    │   └── pointCloudRegistry.ts # 跨组件共享点云 API
    └── components/
        ├── ViewerCanvas.vue # Cesium Viewer 挂载 + 示例点云
        ├── Toolbar.vue      # 类别选择 + 笔刷大小 + 导出
        └── ClassPanel.vue   # 类别列表 + 计数
```

## 接入真实点云（.pcd / .las）

Cesium 渲染点云的标准方式是 **3D Tiles (pnts)**。需要先把你的点云转成 pnts：

**方式 A：py3dtiles（本地，免费）**
```bash
pip install py3dtiles
py3dtiles translate your_scan.pcd ./tileset --format pnts
# 或 .las/.laz
```
然后把生成的 `tileset` 目录放到 `public/`，在 `usePointCloud.ts` 里调用：
```ts
await pc.loadTileset('/tileset/tileset.json')
```

**方式 B：Cesium Ion（在线，免费额度）**
把点云上传到 Cesium Ion，用 assetId 加载：
```ts
await Cesium.Cesium3DTileset.fromIonAssetId(ASSET_ID)
```

真实点云的拾取对象类型是 `Cesium3DTilePointFeature`（而非示例里的 `PointPrimitive`），
按 feature 批量上色即可，思路与本 starter 一致。

## 下一步可扩展（简历亮点）

1. **真实 .pcd 加载** + 点云分块 / LOD（3D Tiles 天然支持）
2. **撤销 / 重做**：维护操作栈，支持 Ctrl+Z 回退
3. **其他标注类型**：3D 包围盒、矢量线/面（道路边界、车道线 —— 高精地图核心）
4. **工程化**：标注结果持久化（IndexedDB / 后端）、多人协作、快捷键、类别可配置
5. **README + GitHub**：把仓库推上去，简历直接贴链接

## 常用命令

```bash
pnpm run dev      # 本地开发
pnpm run build   # 类型检查 + 生产构建
pnpm run preview # 预览构建产物
```
