# EGO_SHOW

EGO 轨迹展示网站。暖白与墨绿色的简洁研究页面，展示第一视角 RGB-D 的手—物体重建。

**网站地址：** https://xy144001.github.io/EGO_SHOW/

## 已实现

- 英文 / 中文切换，桌面与手机响应式布局。
- Three.js 三维预览：实际重建手网格、物体预览网格、场景点云和物体坐标原点轨迹；拖动旋转、缩放、视角重置、点云开关。
- 时间轴、播放/暂停、0.5× / 1× / 2× 播放；同步显示原始 RGB 录像。
- 两条现有 H2O 单物体示例，点击卡片查看录像，并切换到对应三维轨迹。
- 多部件交互单独显示为研究中的方向，没有伪装成已发布结果。
- 键盘可用的分类标签与弹窗；减少动画偏好；WebGL 不可用时提供原视频链接。

这是第一版前端，示例复用早期单物体基线，**并非后来瓶盖分离/接触保持优化的结果**。后续可替换为新跑的精选案例。

## 本地运行

无需 Node 或安装前端依赖：

```bash
python3 -m http.server 8000
```

打开 `http://localhost:8000`。不要双击 `index.html` 使用 file://；浏览器会限制模块脚本和 fetch。

## 文件结构

```text
index.html                 页面、弹窗和初始英文内容
styles.css                 桌面 / 手机样式
app.js                     播放器、Three.js、中文文案、界面交互
assets/vendor/             本地 Three.js 0.170.0 与 OrbitControls，无外部 CDN 运行依赖
assets/demos/catalog.json  展示资产的来源和元数据清单
assets/demos/{case}/
  scene.json               轻量网格、位姿、拓扑、点云、量化信息
  hands.bin.gz             量化并压缩的逐帧手顶点
  rgb.mp4                  展示用 RGB 视频
  poster.jpg               封面
```

目前卡片与文案在 `index.html` / `app.js` 中显式定义，catalog 是来源清单，不是自动生成页面的 CMS。增加案例时需同时添加资产、卡片、标题映射与相关来源信息。

## 展示数据与真实研究输出

源录像 30 fps / 150 帧 / 5 秒。网页手网格与物体位姿每 3 帧采样，**三维预览为 10 fps / 50 帧**；RGB 视频仍是完整源片段。手顶点逐轴 uint16 量化，物体网格使用确定性顶点聚类做展示 LOD。统一变换成浏览器坐标；网格颜色仅用于区分手和物体。

这些处理只用于浏览器展示，不改变原始轨迹、不回流数值评估，也不表示零误差。场景参考网格没有声称重力对齐。完整 NPZ、原始网格和封存包留在数据盘，不上传到展示仓库。

导出工具 `tools/export_previews.py` 读取原封存目录：

```bash
python tools/export_previews.py \
  --source /data1/xy/egohand/outputs/pipeline4_h2o_20261104 \
  --output /data1/xy/egohand/sites/ego-show/assets/demos
```

需要 numpy、trimesh、ffmpeg；所有大文件输出必须在 `/data1` 或 `/data2`。

## 部署

纯静态 GitHub Pages：Settings → Pages → Deploy from a branch → `main` / `(root)`。仓库包含 `.nojekyll`。若使用其它静态主机，同样直接发布仓库根目录即可。

`_headers` 不需要；服务端应正确提供 MP4、JSON、JS 和 `.gz`。压缩手数据由 JS 的 `DecompressionStream('gzip')` 显式解压，勿再把 `.bin.gz` 错误设置成自动解压的 Content-Encoding 后仍重复解压。

## 来源与许可

示例源数据为 [H2O](https://github.com/taeinkwon/h2odataset)，遵循原数据集要求。重建媒体由本项目已有流程产生；未使用 EgoXperience 的视频或三维资产。页面参考研究项目的展示组织方式，设计与实现独立完成，与 EgoXperience 无隶属关系。

Three.js / OrbitControls 保留 MIT 许可于 `assets/vendor/THREE-LICENSE.txt`。重建结果不是 ground truth。没有虚构论文、作者、精度指标或已完成的多部件展示。
