# EGO_SHOW

EGO 轨迹展示网站。暖白与墨绿色的简洁研究页面，展示第一视角 RGB-D 的手—物体重建。

**网站地址：** https://xy144001.github.io/EGO_SHOW/

## 最新轨迹集（2026-11-13）

直接打开 [互动轨迹集](https://xy144001.github.io/EGO_SHOW/#data)。新增 12 个场景、13 条物体轨迹、1,740 个场景帧（1,890 个物体帧），均为 30 fps 完整序列。

- 三批结果：原始 3 条、随后 6 场景 / 7 物体、最后一批中的乳液瓶 / 喷雾瓶 / 薯片筒。
- 采用已归档的 `projective_guard`（渲染深度 + 轮廓保护）结果；不采用实验尺度校准。不发布尺度偏差明显的 `s1h1milk_move`。
- 六个独立复选框：Scene、Left hand、Right hand、Object mesh、6DoF axes、Camera。物体网格与坐标轴分别控制；双物体场景一起控制两件物体。
- 逐帧、播放 / 暂停、0.25× / 0.5× / 1× / 2×、旋转 / 缩放 / 复位，与原始 RGB 同步。图层选择在切换场景后保留。
- Scene 为实测 RGB-D 多关键帧背景点云，排除物体 mask 与投影手网格；Camera 为标定视锥和轨迹。不是完整场景网格，仍可能含深度噪声与动态残留。
- 旧首页播放器与两个旧示例入口已移除。双物体场景中的杯子在桌上，不代表双手分别持有独立物体。

新播放器：`trajectories.js` / `trajectories.css`。场景与卡片由 `assets/trajectories/catalog.json` 自动生成。每场景含 `scene.json.gz`、`hands.bin.gz`、`rgb.mp4`、`poster.jpg`。

手顶点逐轴 uint16 量化；物体使用显示代理网格。原始网格、尺度、SE(3)、手和相机结果未修改。各原输入 SHA-256、显示面数、代理误差与手量化误差随场景元数据记录。三维帧和 RGB 均无抽帧。

导出依赖原研究工作区中的病例登记模块，以及 numpy / trimesh / Open3D / OpenCV / ffmpeg：

```bash
PYTHONPATH=/home/xy/EGO /data1/xy/egohand/venv_object/bin/python tools/export_contour_guard.py \
  --output /data1/xy/egohand/sites/ego-show/assets/trajectories \
  --qa /data1/xy/egohand/sites/ego-show-qa/20261113
```

## 加载与兼容性修复

- 原视频独立加载并提供原生播放控件；视频失败不会阻止三维展示，三维失败也不会阻止原视频播放。
- 三维资源会自动重试临时网络失败，页面提供单独的三维/视频重载按钮。
- 使用本地固定版本 fflate 0.8.2 解码 gzip，根据实际文件头识别是否已经由服务器解压，不依赖浏览器的 DecompressionStream。
- 默认使用 Three.js r170 / WebGL 2；只有 WebGL 1 时按需加载 r160 兼容渲染器。两个版本均本地托管。浏览器完全禁用图形时显示具体原因，原视频仍可播放。
- 首页只保留一个实际轨迹播放器；旧占位视频及旧示例资源从当前网站移除，数据盘备份和 Git 历史仍保留。

## 本地运行

静态网站，无需构建。使用支持 HTTP Range 的静态服务预览视频，例如 `python tools/serve_preview.py`，打开 `http://127.0.0.1:8765`。

## 文件结构

`index.html` / `styles.css` / `app.js` 负责页面与语言；`trajectories.js` / `trajectories.css` 负责互动播放器。资产位于 `assets/trajectories`，依赖和许可证位于 `assets/vendor`。

## 部署

纯静态 GitHub Pages：Settings → Pages → Deploy from a branch → `main` / `(root)`。仓库包含 `.nojekyll`。若使用其它静态主机，同样直接发布仓库根目录即可。

`_headers` 不需要；服务端应正确提供 MP4、JSON、JS 和 `.gz`。压缩数据由页面检查 gzip 文件头后解码，也兼容服务端已进行 HTTP 解压的响应。

## 来源与许可

示例源数据为 [H2O](https://github.com/taeinkwon/h2odataset)，遵循原数据集要求。重建媒体由本项目已有流程产生；未使用 EgoXperience 的视频或三维资产。页面参考研究项目的展示组织方式，设计与实现独立完成，与 EgoXperience 无隶属关系。

Three.js / OrbitControls 与 fflate 均保留各自的 MIT 许可证于 `assets/vendor/`。重建结果不是 ground truth。没有虚构论文、作者、精度指标或已完成的多部件展示。

## 重建渲染器模块

两个渲染器入口打包为各一个独立 ESM 模块，避免失败的共享依赖被浏览器缓存后无法重试。使用固定版本 esbuild，生成物本地托管：

```bash
NPM_CONFIG_CACHE=/data1/xy/egohand/cache/npm npx --yes esbuild@0.25.12 assets/vendor/renderer-webgl2.entry.js --bundle --format=esm --minify --target=es2020 --outfile=assets/vendor/renderer-webgl2.module.js
NPM_CONFIG_CACHE=/data1/xy/egohand/cache/npm npx --yes esbuild@0.25.12 assets/vendor/renderer-webgl1.entry.js --bundle --format=esm --minify --target=es2020 --outfile=assets/vendor/renderer-webgl1.module.js
```
