# demo/ — 演示素材与 GitHub Pages 演示版

这个目录放**演示用的真实文件**：演示站要展示的是「一个真在用的文件服务器长什么样」，
所以素材得是真照片、真视频、真音频、真 PDF，而不是前端生成的占位 SVG。

- `media/` 实际素材（4.87 MB，17 个文件），许可逐条见下表
- `manifest.json` 每条素材的来源页 / 许可 / 作者 / 字节数 / sha256（脚本自动写，别手改）
- `fetch.py` 从 Wikimedia Commons 拉外部素材（**只取可再分发的许可**，不可再分发当场挡掉）
- `make-files.py` 本地生成 PDF / ZIP / tar.gz / CSV / 日志 / JSON（这几类要的是「类型齐全」，内容没人细看，自己造就没有许可问题）

## 1. 为什么素材从 Commons 取

Unsplash / Pexels 那类站点的许可**不允许把原图再分发进仓库**，文档里引用截图可以，把原文件提交进 git 不行。
Commons 每个文件都带机器可读的许可元数据，脚本能当场过滤（只留公有领域 / CC0 / CC-BY / CC-BY-SA / free use），
并把来源页与作者写进 `manifest.json` ⇒ 要署名就有据可查。

照片一律取 Commons 的 **1280 px 缩放版**而不是原图：原图普遍 4–12 MB，仓库和 Pages 都不该背这个体积；
缩放版 150–360 KB，界面上也够清楚。

## 2. 素材清单与许可

| 文件 | 字节 | 许可 | 作者 | 来源 |
|---|---|---|---|---|
| `photos/aurora-norway.jpg` | 245,465 | CC BY 2.5 | Rafal Konieczny | [File:Aurora Borealis NO.JPG](https://commons.wikimedia.org/wiki/File:Aurora_Borealis_NO.JPG) |
| `photos/tokyo-night.jpg` | 355,548 | CC BY-SA 2.0 | imut（Flickr） | [File:Tokyo night view 1 (cropped).jpg](https://commons.wikimedia.org/wiki/File:Tokyo_night_view_1_(cropped).jpg) |
| `photos/namib-dunes.jpg` | 256,535 | CC BY-SA 2.5 | Luca Galuzzi | [File:Sossusvlei Dune Namib Desert Namibia Luca Galuzzi 2004.JPG](https://commons.wikimedia.org/wiki/File:Sossusvlei_Dune_Namib_Desert_Namibia_Luca_Galuzzi_2004.JPG) |
| `photos/mountain-lake.jpg` | 208,163 | Public domain | — | [File:Riffel Lake and Monte Rosa, Valais, Alps of, Switzerland.jpg](https://commons.wikimedia.org/wiki/File:Riffel_Lake_and_Monte_Rosa,_Valais,_Alps_of,_Switzerland.jpg) |
| `photos/forest-fog.jpg` | 172,694 | CC BY-SA 4.0 | Dietmar Rabich | [File:Dülmen, Wildpark -- 2015 -- 8792.jpg](https://commons.wikimedia.org/wiki/File:D%C3%BClmen,_Wildpark_--_2015_--_8792.jpg) |
| `photos/macro-wing.jpg` | 188,916 | CC0 | Benjamin Balazs | [File:Broken Wing (178594907).jpeg](https://commons.wikimedia.org/wiki/File:Broken_Wing_(178594907).jpeg) |
| `photos/cat-eye.jpg` | 213,876 | CC BY-SA 4.0 | Kipcurry | [File:Blue cat eye close up.jpg](https://commons.wikimedia.org/wiki/File:Blue_cat_eye_close_up.jpg) |
| `photos/spiral-staircase.jpg` | 278,829 | CC BY 3.0 | Martin Kopta | [File:Spiral Staircase (227905273).jpeg](https://commons.wikimedia.org/wiki/File:Spiral_Staircase_(227905273).jpeg) |
| `video/traffic-light.webm` | 1,485,512 | CC BY 4.0 | Marnanel | [File:Cyclist-controlled traffic light phases.webm](https://commons.wikimedia.org/wiki/File:Cyclist-controlled_traffic_light_phases.webm) |
| `audio/orchestra-1910.ogg` | 1,097,472 | CC0 | Victor Herbert Orchestra（1910 录音） | [File:Victor Herbert Orchestra - 13 - 1910 - Spanish.ogg](https://commons.wikimedia.org/wiki/File:Victor_Herbert_Orchestra_-_13_-_1910_-_Spanish.ogg) |
| `audio/piano-phrase.wav` | 339,244 | CC BY 3.0 | Xavier-Serra | [File:Piano-phrase.wav](https://commons.wikimedia.org/wiki/File:Piano-phrase.wav) |
| `docs/dufs-deployment-guide.pdf` | 1,480 | MIT（本仓库生成） | — | `make-files.py` |
| `archives/lume-dist-sample.zip` | 743 | MIT（本仓库生成） | — | `make-files.py` |
| `archives/site-backup.tar.gz` | 289 | MIT（本仓库生成） | — | `make-files.py` |
| `data/access-sample.csv` | 10,851 | MIT（本仓库生成） | — | `make-files.py` |
| `data/dufs-access.log` | 18,732 | MIT（本仓库生成） | — | `make-files.py` |
| `data/lume-config.json` | 340 | MIT（本仓库生成） | — | `make-files.py` |

> CC BY / CC BY-SA 要求署名。只要展示了这些素材，就得加一句「演示素材来自 Wikimedia Commons，许可见 `demo/manifest.json`」即可覆盖；
> 逐条署名（作者 + 许可）在 `manifest.json` 里都有。

## 3. 重新生成

```bash
python3 demo/fetch.py            # 外部素材（已存在的跳过）
python3 demo/fetch.py --force    # 全部重下
python3 demo/fetch.py photos     # 只重下某一类
python3 demo/make-files.py       # 本地那批
```

⚠ Commons 会限流：连打三次 API 就回 429（实测）。脚本里 `API_SLEEP = 2.5` 就是为这个，
别改成并发。文件名以 `manifest.json` 的 key 为准。

## 4. 演示版怎么接这些素材

演示模式（`App.tsx` 的 `isDemoMode` = index.html 里 `__INDEX_DATA__` 没被替换）读的是
`src/services/dufsApi.ts` 的 `DEMO_DIRECTORY_TREE`。带真实文件的条目多写一个字段：

```ts
{ name: 'aurora-norway.jpg', path_type: 'File', size: 245465, mtime: …,
  demoMediaUrl: 'demo-media/photos/aurora-norway.jpg' }
```

- **`demoMediaUrl` 一律写相对路径**（不带开头 `/`）⇒ Pages 挂在 `/<repo>/` 子路径下也能解析。
- 预览：`MediaPreviewModal.resolvedMediaSrc` 优先取它（图片/视频/PDF 都走这一条）。
- 缩略图：`FileExplorer.resolveThumbSrc` 也优先取它 ⇒ 网格视图里是**真照片**，不是占位 SVG。
- 没有 `demoMediaUrl` 的条目（比如只给 `demoContent` 的文本文件）照旧走内联内容或生成的占位图。

## 5. 构建与部署到 GitHub Pages

```bash
scripts/build-demo.sh              # → dist-demo/（5.3 MB，含 demo-media/）
scripts/build-demo.sh --serve      # 顺手起本地预览 http://127.0.0.1:8099/
scripts/deploy-demo.sh <owner>/<repo>       # 推 dist-demo/ 到该仓库的 gh-pages 分支
scripts/deploy-demo.sh <owner>/<repo> --dry-run
```

三条硬要求：

1. **产物在 `dist-demo/`，不是 `dist/`**。`dist/` 是要同步到 dufs `--assets` 目录的那一份，
   素材混进 `dist/` 就等于把几 MB 照片推到生产资源目录。
2. **目标仓库必须 public**。免费版 Pages 不会渲染 private 仓库，`deploy-demo.sh` 会先查可见性、
   private 直接拒绝。源仓库本身 public 之后可以直接推它自己的 `gh-pages`
   （`scripts/deploy-demo.sh ovo-eihei/dufs-lume-ui`）；也可以另建一个只放演示站的公开仓库。
3. Pages 的源要指到 `gh-pages` 分支根目录（脚本末尾会打印两种开法）。

与生产构建的差别只有三处：`__ASSETS_PREFIX__` → `./`（顺带让运行时 `assetUrl()` 也走相对路径，
子路径下不坏）、拷入 `demo-media/`、加 `.nojekyll`。

本地预览的两个已知限制（都是 `python3 -m http.server` 的锅，Pages 上没这问题）：
- 它不响应 `Range` 请求 ⇒ 视频拖进度条可能不动；
- 它不压缩 ⇒ 首屏比部署环境慢一点。

## 6. 演示版里能直接看到的界面形态

| 看什么 | 怎么走到那一步 |
|---|---|
| 根目录（列表视图） | 打开演示首页即是 |
| 网格视图 + 真缩略图 | 进 `photos/`，顶栏切到网格 |
| 图片查看器 | `photos/aurora-norway.jpg` 点开（首帧就是适应居中的） |
| 视频预览 | `video/traffic-light.webm` |
| 音频 + 迷你播放器 | `audio/orchestra-1910.ogg` 播放后关掉弹窗 |
| PDF 内置预览 | `docs/dufs-deployment-guide.pdf` |
| 代码高亮 / CSV | `data/dufs-access.log`、`data/access-sample.csv` |
| Markdown 渲染 | 根目录 `README.md` |
| 沙箱 HTML 预览 | 根目录 `index.html` |
| 多选 + 打包下载 | 在 `photos/` 里勾几个，工具栏 ZIP |
| 深色模式 | 设置面板切主题 |
