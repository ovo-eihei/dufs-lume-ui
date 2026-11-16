# ✨ dufs-lume-ui

[简体中文](./README.md) · [English](./README.en.md)

> ⚠️ **这是一个 AI 开发的项目。** 代码与文档主要由 AI 助手编写，人类负责提需求、做决策与验收；**没有经过严格的安全审计，也没有系统性的代码审查**。请把它当作一份可运行、可参考的实现，而不是经过验证的成品。详细说明见 [AI 开发说明与安全边界](./docs/ai-development-notes.md)。

**dufs-lume-ui** 是一个专为轻量级静态文件服务器 [Dufs (`sigoden/dufs`)](https://github.com/sigoden/dufs) 设计的现代化、响应式独立前端主题。它基于 Dufs 原生提供的 `--assets` 静态资源覆盖机制运行，无需修改或重新编译 Dufs 源码即可替换默认界面，并支持通过轻量级扩展接口（`/__lume__/info` 与 `/__lume__/thumb`）实现实时存储空间监控、服务端缩略图生成以及 [Caddy](https://caddyserver.com/docs/caddyfile/directives/forward_auth) + [TinyAuth](https://tinyauth.app/docs/community/caddy/) 反向代理鉴权集成。

## 🌟 核心特性

- **双视图无缝切换 (List & Grid View)**：
  - 支持表格列表视图与现代网格卡片视图一键切换，偏好自动持久化至 `localStorage`。
  - 面包屑导航栏内置快捷「返回上级」按钮（支持键盘 `Backspace` / `Alt + ↑`），未登录访客自动锁定公开目录（默认 `/share/`）为顶层根路径。
  - **极致精简与空间释放**：列表视图下隐藏面包屑重复排序按钮，网格视图下收敛为单个极简排序胶囊；存储容量融入面包屑统计，仅在空间紧张时弹出告警条，释放大量导航宽度。
- **快捷键交互与全能多选**：
  - **键盘巡航与 Space 瞬时预览**：支持方向键 `↑ / ↓ / ← / →` 在文件项之间无缝移动焦点（自动滚动可视区），按 **`Space`（空格键）** 一秒打开/关闭预览弹窗，按 `Enter` 快速打开。
  - **剪贴板直接粘贴上传 (`Ctrl / Cmd + V`)**：页面任意位置复制截图或文本代码后按快捷键，自动弹出重命名与预览对话框，确认后直接流式上传。
  - 支持表头全选、半选状态、网格全选胶囊以及 `Ctrl` / `Cmd` + 点击单选、`Shift` + 点击连续区间多选。
  - 未勾选条目时调用 Dufs 原生 `?zip` 打包当前目录；勾选条目后在浏览器端基于 [fflate](https://github.com/1000tb/fflate) `ZipPassThrough` (STORE) 流式生成 ZIP 归档。
  - 全屏拖拽流式上传（`HTTP PUT`），中途取消上传时自动补发 `HTTP DELETE` 清理服务端未完成的残留文件。
- **富媒体、沙箱隔离与音频迷你播放器**：
  - **后台悬浮迷你音频播放器**：试听音频文件时可一键收起至右下角悬浮播放胶囊（支持暂停、同目录自动切歌与展开），跨目录浏览不中断。
  - **静态网站「一键浏览站点」**：当前目录包含 `index.html` 时自动在面包屑旁高亮展示「浏览站点」按钮，一键进入网页视图。
  - 内置图片、视频、音频、Markdown（渲染/源码双视图）、PDF 与代码语法高亮预览弹窗，支持键盘 **`←` / `→` 方向键**快速切换上/下一个文件。
  - `.html` / `.htm` 默认在**隔离沙箱**内渲染（`srcdoc` + `sandbox="allow-scripts"`，不含 `allow-same-origin`），防止不可信页面脚本访问站点凭据或私有文件；如需浏览依赖同目录相对资源的完整静态站点，可在预览提示条或偏好设置中经二次确认后关闭沙箱。
- **自适应图片缩略图（自动 / 开启 / 关闭）**：
  - 偏好设置提供 `自动 / 开启 / 关闭` 三态切换（持久化于 `localStorage`），并在标题右侧对齐内嵌当前服务端的处理能力状态（服务端缩放 / 仅原图缩放）。
  - 当服务端 `/__lume__/info` 注册了缩略图能力时，自动通过 `/__lume__/thumb` 加载轻量化缩放图；未配置图像工具链时可按需回退至浏览器原图缩放或仅展示文件图标。
- **单次合并探测 (`/__lume__/info`)**：
  - 页面初始化时仅发送 **1 次 `GET /__lume__/info`**：若被鉴权网关拦截（`302/401`）则自动切换为公开只读访客模式；若返回 `200 JSON` 则同时完成登录态确认、实时磁盘可用空间展示与服务端能力发现，不在数据目录写入任何隐藏文件。上传与删除操作后自动静默更新。
- **现代微动效与运行时品牌定制**：
  - 弹窗、下拉菜单与 Toast 均采用 `cubic-bezier(0.16, 1, 0.3, 1)` 物理曲线过渡，支持卡片悬浮上浮与图片缩放动效。
  - 支持通过 Docker 环境变量（`LUME_TITLE`、`LUME_SUBTITLE`、`LUME_ICON`、`LUME_LOGIN_URL`）在容器启动时注入站点品牌信息，无需重新编译前端。
  - 内置简体中文 / 英文双语及浅色 / 深色主题，默认跟随系统设置。

## 📁 项目目录结构

```text
dufs-lume-ui/
├── index.html                        # HTML 入口（含 Dufs 注入占位符与运行时品牌配置节点）
├── package.json                      # 依赖管理与构建脚本
├── vite.config.ts                    # Vite 构建配置与 __ASSETS_PREFIX__ 路径重写插件
├── public/
│   └── favicon.svg                   # 默认站点图标
├── docker/
│   ├── compose.yaml                  # Docker Compose 一键编排（Dufs + 扩展 API + Caddy 同源入口）
│   ├── Dockerfile.ui                 # 前端构建与 Dufs 运行时镜像定义
│   ├── Dockerfile.api                # 扩展 API（socat + libvips/ImageMagick）镜像定义
│   ├── entrypoint-ui.sh              # 容器启动品牌注入脚本
│   ├── Caddyfile                     # 容器内同源反代配置
│   └── .env.example                  # 环境变量配置模板
├── scripts/
│   └── lume-info-api.sh              # POSIX sh 扩展接口脚本（服务 /__lume__/info 与 /__lume__/thumb）
├── docs/
│   ├── deployment-and-lume-api.md    # 进阶部署、扩展 API 响应规范、安全约束与运维清单
│   ├── image-toolchain.md            # 图像工具链选型与安装（libvips / ImageMagick / 不装）
│   ├── ai-development-notes.md       # AI 开发说明与安全边界（中文）
│   └── ai-development-notes.en.md    # 同上，英文版
└── src/
    ├── App.tsx                       # 主应用状态编排：合并探测、键盘巡航、粘贴上传与迷你播放器
    ├── i18n.ts                       # i18next 国际化初始化
    ├── locales/                      # 简体中文 (zh.json) 与英文 (en.json) 语言包
    ├── types/dufs.ts                 # TypeScript 类型定义
    ├── utils/format.ts               # 字节/时间格式化、文件分类与路径归一化工具
    ├── services/
    │   ├── dufsApi.ts                # Dufs 接口封装、合并探测与缩略图 URL 构建
    │   └── zipSelection.ts           # 客户端流式 ZIP 归档实现
    └── components/                   # 界面组件（Navbar / Breadcrumbs / FileExplorer / MediaPreviewModal 等）
```

## 🚀 本地开发与构建

```bash
# 1. 安装依赖
pnpm install

# 2. 启动开发服务器（自动进入内置可交互演示模式）
pnpm run dev

# 3. 构建生产环境静态资源（输出至 ./dist 目录）
pnpm run build
```

## 🐳 Docker Compose 快速部署

`docker/` 目录提供了开箱即用的三容器同源编排方案（`dufs` + `lume-info-api` + `caddy`）：

> 需要 **Docker Engine 20.10+ 与 Compose v2.24+**（`env_file.required` 字段自 v2.24 起支持）；
> 旧版会直接报 `unknown field "required"`。先 `docker compose version` 确认。

```bash
cd docker
cp .env.example .env
# 编辑 .env 中的 DATA_DIR（宿主机数据目录）与 LUME_HTTP_PORT（对外端口）
docker compose up -d --build
```

- **品牌定制**：在 `.env` 中设置 `LUME_TITLE`、`LUME_SUBTITLE`、`LUME_ICON`、`LUME_LOGIN_URL`，重启容器即可生效，无需重新编译前端。
- **Dufs 原生参数透传**：Dufs 0.47+ 支持通过 `DUFS_*` 环境变量配置所有命令行参数（如 `DUFS_ALLOW_UPLOAD=true`、`DUFS_ALLOW_DELETE=true`、`DUFS_ALLOW_SEARCH=true`、`DUFS_ALLOW_ARCHIVE=true`）。⚠ 这类变量“设了就有值”，**不要用空值**：留一行 `DUFS_AUTH=` 会被 dufs 当成一条鉴权规则，匿名请求全站 401。要么注释掉，要么给真值。
- **默认档不带鉴权**：bundle 里没有 tinyauth，`LUME_BIND` 默认 `127.0.0.1`（只绑回环，等你前面的 TLS 反代）。⚠ **不要**在没做任何鉴权的情况下把 `LUME_BIND` 改成 `0.0.0.0` 再叠加 `DUFS_ALLOW_UPLOAD=true` —— 那等于任何人都能往你的网盘上传文件。要直接对外请先上 HTTPS（Caddy 自带证书只需去掉 `auto_https off` 并填域名）并至少配一条 `DUFS_AUTH`。
- **容器内以 root 跑 dufs**：开启写权限后，上传产生的文件属主是 root。要避开了就用 compose 的 `user:` 映射你自己的 UID/GID，并保证 `DATA_DIR` 对该 UID 可写。

## 📦 宿主机原生部署（Dufs + Caddy + TinyAuth）

1. **启动 Dufs 并挂载构建产物**：
   ```bash
   dufs /data -A --assets /path/to/dufs-lume-ui/dist -p 5000
   ```
2. **启动扩展接口服务（`socat` 监听 `127.0.0.1:8090`）**：
   ```bash
   sudo cp scripts/lume-info-api.sh /usr/local/sbin/lume-info-api.sh
   sudo chmod 0755 /usr/local/sbin/lume-info-api.sh
   DUFS_SERVE_PATH=/data THUMB_CACHE_DIR=/var/lib/lume/thumbs \
     socat TCP-LISTEN:8090,bind=127.0.0.1,reuseaddr,fork \
     EXEC:/usr/local/sbin/lume-info-api.sh
   ```
   > 服务端缩略图依赖 `libvips-tools`（`vipsthumbnail`）或 ImageMagick（`convert`）。若宿主机未安装图像工具链，`/__lume__/info` 中的 `thumbs` 字段将自动返回 `false`，前端将平滑降级，无需修改任何配置。
3. **配置 `Caddyfile`**：
   ```caddyfile
   files.example.com {
       encode zstd gzip

       @gated {
           not path /share* /__dufs_v*
       }

       handle @gated {
           forward_auth tinyauth:3000 {
               uri /api/auth/caddy
               copy_headers Remote-User Remote-Email Remote-Name
           }

           handle /__lume__/* {
               reverse_proxy 127.0.0.1:8090
           }

           reverse_proxy dufs:5000
       }

       handle {
           reverse_proxy dufs:5000
       }
   }
   ```

> 📖 **进阶部署文档**：关于扩展 API 响应规范、缩略图安全边界、systemd 单元写法与运维注意事项，请参阅 **[`docs/deployment-and-lume-api.md`](./docs/deployment-and-lume-api.md)**；
> 缩略图那一步要装什么图像工具（libvips 还是 ImageMagick，各自代价与安装命令），见 **[`docs/image-toolchain.md`](./docs/image-toolchain.md)**。

## 📄 开源协议

本项目基于 [MIT License](./LICENSE) 开源发布。
