# 图像工具链：如何选择与安装

`/__lume__/thumb` 把缩放交给**外部命令**完成，脚本本身不解码图像。装不装、装哪一个，决定三件事：
网格视图里有没有服务端缩略图、单个请求吃多少内存、以及一张大图能不能把整台机器拖垮。

脚本按固定顺序探测，**没有配置项**：

```
vipsthumbnail 存在  →  用 libvips
convert 存在        →  用 ImageMagick
两者都没有          →  能力位 thumbs = false，前端自动降级
```

本文所有数字都是实测，标注了测量方式与日期；跨工具对照的那张表在容器里跑（同一份脚本、同一批样本），
因为要在干净的基座上分别装两套工具。

---

## 1. 判据：先看数字

### 1.1 裸机（Debian 12，2 vCPU / 1 979 MB，libvips 8.14.1，2026-11-16）

样本 = 站内一张 355 KB / 1280×822 的 JPEG，直接调 `vipsthumbnail`，
计时与峰值 RSS 由 Python `resource.getrusage(RUSAGE_CHILDREN)` 采集：

| 目标宽度 | 耗时 | 峰值 RSS | 输出体积 |
| :--- | :--- | :--- | :--- |
| 128 px | 0.242 s | 35.8 MB | 4 302 B |
| 256 px | 0.163 s | 37.0 MB | 12 269 B |
| 512 px | 0.177 s | 38.3 MB | 40 838 B |

同一台机器上，把像素放大 **64 倍**（10240×6576 = 67 MP，文件只有 789 624 B）：

| 目标宽度 | 耗时 | 峰值 RSS |
| :--- | :--- | :--- |
| 512 px | 0.20 s | 37.0 MB |

**耗时与内存都不随像素增长**——libvips 缩图时走 JPEG 的 DCT 缩放解码（shrink-on-load，机制见 libvips 文档），
不需要把整张原图解进内存；上面那两行是实测数字。

走完整链路（`socat` 起进程 → 脚本 → libvips → 写缓存）：冷 **0.31 s**，缓存命中 **0.10 s**。

格式覆盖（同一台机器，`vips -l` 与逐格式实测）：`jpegload / pngload / webpload / tiffload / svgload /
heifload（AVIF）/ jxlload（JPEG XL）/ magickload` 全在，PNG/WebP/AVIF/TIFF/SVG 五种源图各出一张 256 px 缩略图全部成功。

### 1.2 两套工具对照（2026-11-08，容器内跑同一份脚本，`/usr/bin/time -f '%e %M'`，每格取 3 次最快）

左列 libvips、右列 ImageMagick；`alpine` = `alpine:3.22`，`debian` = `debian:12-slim`：

| 样本 | debian-vips | alpine-vips | debian-im (IM6) | alpine-im (IM7+delegate) |
| :--- | :--- | :--- | :--- | :--- |
| 进程启动本身（不读图） | 0.15 s / 32.6 MB | 0.07 s / 21 MB | 0.03 s / 9.5 MB | **0.01 s / 6.4 MB** |
| 17 KB PNG | 0.12 s / 36 MB | 0.05 s / 22 MB | **0.02 s / 10.8 MB** | **0.03 s / 8.5 MB** |
| 1.4 MB JPEG 2048² | 0.16 s / 38.7 MB | **0.09 s / 23.9 MB** | 0.55 s / 73.6 MB | 0.88 s / **122 MB** |
| 4 MB PNG 2662² | 0.27 s / 45 MB | **0.20 s / 33.6 MB** | 0.90 s / 117 MB | — |
| 24 MP JPEG | 0.19 s / 37 MB | **0.15 s / 25.8 MB** | 3.04 s / **378 MB** | 6.13 s / **667 MB** |
| 74 MP JPEG | 0.35 s / 39 MB | **0.31 s / 31 MB** | **失败**：`cache resources exhausted` | 33.7 s / **1 039 MB**（顶到 1 GB 内存上限） |
| 输出体积（512 px） | 24 KB | 24 KB | 119 KB | — |

三点结论：

- **只有源图小于约 100 KB 时 ImageMagick 更快**，赢的是 20–100 ms 的进程启动成本；libvips 的库更大、起进程更贵。
- 1 MB 起 libvips **快 3–10 倍、省 2–5 倍内存**；24 MP 以上差 **16–105 倍**。
- ImageMagick 的内存**随像素线性增长**（74 MP 吃到 1 GB），而 libvips 基本是平的。

上游也确认过这个形状：[libvips issue #3654](https://github.com/libvips/libvips/issues/3654) ——
小图上 `vipsthumbnail` 比 `convert` 慢且吃内存，原因是进程启动；批量摊薄后 0.012 s/张。

---

## 2. 怎么选

| 选择 | 什么时候选它 | 代价 |
| :--- | :--- | :--- |
| **libvips**（默认推荐） | 只要数据根里可能出现几 MB 以上或高像素的图，或者机器内存 ≤ 2 GB —— 这是唯一安全选项 | 装得多（见 §3.1）；每张比 IM 多 20–100 ms 启动开销 |
| **ImageMagick** | 机器上本来就有它、图基本都是百 KB 以内的小图、且不打算装第二套工具 | 见下面的"内存形状"警告；发行版打包容易缺解码器 |
| **都不装** | 只放文档/压缩包/音频，或者你不想在服务器上装图像库 | 能力位 `false`；网格视图不显示缩略图（`auto`），或浏览器自己缩放原图（`on`，每张都要下载原图） |

⚠ **选 ImageMagick 前必须知道的一件事**：扩展 API 脚本的闸门 `THUMB_MAX_SRC_BYTES` 默认 64 MB，卡的是**文件字节数**，
不是像素数。§1.1 里那张 67 MP 的图只有 0.79 MB —— 一张几 MB 的高像素 JPEG 轻松过闸，而 ImageMagick 处理它
需要按像素分配内存。在 2 GB 的机器上，**单个请求**就足以把整机打到 OOM。libvips 在同样这张图上是 0.20 s / 37 MB。

---

## 3. 怎么装

装完**不需要重启任何服务、不需要改任何配置**：扩展 API 每个请求都新起一个脚本进程，
下一次请求能力位就跟着变（实测）。

### 3.1 Debian 12 / Ubuntu

```bash
sudo apt install libvips-tools        # 推荐：Debian 12 的候选版本是 8.14.1-3+deb12u3
# 或
sudo apt install imagemagick          # 6.9.11.60+dfsg-1.6+deb12u15
```

安装代价（`apt` 元数据实测：硬依赖闭包的 `Installed-Size` 累加，全新机器口径）：

| 包 | 闭包包装数 | 闭包合计 |
| :--- | :--- | :--- |
| `libvips-tools` | 209 | 420 MB |
| `imagemagick` | 150 | 289 MB |

⚠ 这是**干净机器**上的数字。已经装过其中一套的机器，另一套的边际代价小得多（实测：已装 libvips 的 Debian 12 上
装 `imagemagick` 只需新增 4 个包）。

### 3.2 Alpine

```bash
sudo apk add vips-tools               # 推荐：镜像体积实测 88.3 MB
# 或（注意下面这条，不能只装 imagemagick）
sudo apk add imagemagick imagemagick-jpeg imagemagick-webp imagemagick-tiff
```

⚠ Alpine 把 ImageMagick 的解码器拆成子包：**只装 `imagemagick` 时 JPEG 直接报 `no decode delegate`**（实测），
于是每一张 `.jpg` 的缩略图都静默变成 500。上面那行是可用下限。

### 3.3 Docker（本仓库自带的编排）

```bash
docker build -f docker/Dockerfile.api -t lume-info-api:local .                    # 默认 libvips
docker build -f docker/Dockerfile.api --build-arg IMAGE_TOOL=im -t lume-info-api:im .
docker build -f docker/Dockerfile.api --build-arg IMAGE_TOOL=none -t lume-info-api:none .
```

`Dockerfile.api` 在**构建期**就断言 JPEG 解码器存在（`vips -l | grep jpegload` /
`convert -list format | grep JPEG`），缺了直接构建失败，不会让坏镜像跑起来。

### 3.4 不装

什么都不用做。能力位回 `false`，前端按用户偏好降级：`auto` 干脆不显示缩略图，`on` 退回浏览器缩放原图。
这不是故障状态，`/__lume__/info` 与 `/__lume__/thumb` 本身也不需要图像工具才存在。

---

## 4. 装完怎么验证

```bash
# 1) 机器上到底装了哪个（能力位只报 enabled，不报工具名）
command -v vipsthumbnail convert

# 2) 能力位
curl -s http://127.0.0.1:8090/__lume__/info
#   → {"free_bytes":…,"data_bytes":…,"thumbs":{"enabled":true,"widths":[128,256,512]}}

# 3) 真出一张图：第一次冷做，第二次应当明显更快（命中缓存）
curl -s -o /dev/null -w '%{time_total} s  %{size_download} B\n' \
     "http://127.0.0.1:8090/__lume__/thumb?path=%2Fshare%2F<站内相对路径>&w=256"
curl -s -o /dev/null -w '%{time_total} s  %{size_download} B\n' \
     "http://127.0.0.1:8090/__lume__/thumb?path=%2Fshare%2F<站内相对路径>&w=256"
```

⚠ **换过工具之后要手动清缓存**：缓存键 = `真实路径|mtime|大小|宽度`，**不含工具名**，
所以从 ImageMagick 换成 libvips（或反之）时，已经生成过的缩略图不会自动重做：

```bash
sudo rm -f /var/lib/lume/thumbs/*        # 目录由 THUMB_CACHE_DIR 决定，默认就是这个
```

---

## 5. 其余实测注意事项

- **AVIF / HEIF**：Debian 的 libvips 自带 `heifload`（实测能直接解 `.avif`）。Alpine 的 `vips` 包**不带**，
  要额外 `apk add libheif`，实测镜像从 88.2 MB 涨到 124 MB —— 数据根里没有 `.avif` 就别花这 36 MB。
- **JPEG XL**：Debian 8.14.1 带 `jxlload`；Alpine 的包没编进去，加包也解不开（实测）。
- **SVG**：走 `svgload`（librsvg），实测能出图；脚本把 `.svg` 的输出格式定为 `jpg`。
- **`convert` 与 `magick`**：脚本只认 `convert`（ImageMagick 6 与 7 都会提供这个兼容命令）。
  机器上只有 `magick` 而没有 `convert` 时，能力位仍然是 `false`。
- **格式白名单在脚本里，不在工具链里**：`jpg/png/webp/gif/svg/avif/tif/bmp/jxl` 之外的扩展名直接 415，
  装什么工具都不会改变；`avif/tif/bmp/jxl` 会被转成 `jpg` 输出。
- 想改档位表（默认 `128 256 512`）或原图上限（默认 64 MB），用环境变量 `THUMB_WIDTHS` /
  `THUMB_MAX_SRC_BYTES` 覆盖，见 [`deployment-and-lume-api.md`](./deployment-and-lume-api.md) §1(2)。
