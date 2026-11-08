# ✨ dufs-lume-ui

**dufs-lume-ui** 是一个专为 Rust 轻量级静态文件服务器 [Dufs (`sigoden/dufs`)](https://github.com/sigoden/dufs) 设计的现代化、极简、美观的独立前端主题。它通过 Dufs 原生提供的 `--assets` 静态资源覆盖机制运行，无需修改或重新编译 Dufs 源码即可完全替换其默认的原生界面，并针对 [Caddy](https://caddyserver.com/docs/caddyfile/directives/forward_auth) + [TinyAuth](https://tinyauth.app/docs/community/caddy/) 反向代理鉴权架构进行了深度优化。

## 🌟 核心特性

- **双视图自由切换 (List & Grid View)**：支持传统表格列表视图与现代网格卡片视图一键切换，偏好自动持久化至 `localStorage`。
- **丝滑浏览与快捷键多选**：
  - 响应式面包屑导航（未登录访客自动锁定公开区 `/share/` 为顶层根）、快捷键 `/` 实时搜索过滤、按文件名/大小/修改时间升降序排列。
  - 支持自定义居中复选框、网格卡片角标勾选与网格全选胶囊；支持 **`Ctrl` / `Cmd` + 点击**直接切换选择、**`Shift` + 点击**连续区间多选。
  - 未勾选时走服务端 `?zip` 打包整目录；有勾选时在浏览器端基于 [fflate](https://github.com/1000tb/fflate) `ZipPassThrough` (STORE) 流式打包所选内容。
  - 全屏拖拽流式上传（`HTTP PUT`），支持中途取消并自动补发 `DELETE` 清理大文件残留。
- **在线富媒体与静态网站内嵌预览**：
  - 支持图片、视频、音频、Markdown（渲染/源码双视图）、PDF 与代码/纯文本（深浅双色自适应语法高亮）弹窗预览，支持键盘 **`←` / `→` 方向键**快速切换上/下一个文件。
  - `.html` / `.htm` 默认在**浏览器沙箱**内渲染（`srcdoc` + `sandbox="allow-scripts"`，不含 `allow-same-origin`）⇒ 页面脚本拿不到本站登录态与门禁区文件。要浏览依赖同目录资源的完整静态站点，可在提示条或偏好设置里**显式关闭沙箱**（需勾选确认，选择只存在当前浏览器）。
  - 支持键盘 **`←` / `→` 方向键**快速切换上/下一个文件，Markdown/PDF/代码/纯文本（深浅双色自适应语法高亮）同样在弹窗内渲染。
- **网格缩略图（服务端优先，前端兜底）**：偏好三态 `跟随服务器 / 始终显示 / 不显示`（存 `localStorage`）。
  - 服务器在 `/__lume__/info` 里注册了 `thumbs` 能力 ⇒ 走 `/__lume__/thumb` 服务端缩放图；没注册 ⇒ 「始终显示」退回浏览器缩放原图（更耗流量），「跟随服务器」则不显示。
  - **服务端能力变化不会改写用户设置**：只有从没设置过（`auto`）时才由能力位决定默认值。
- **单次合并请求：登录态感知 + 实时磁盘空间 + 服务端能力位 (`/__lume__/info`)**：
  - 启动时仅发送 **1 次 `GET /__lume__/info`**：被网关 `302/401` 拦截即判定为未登录访客；返回 `200 JSON` 则同时完成登录态确认、磁盘水位展示与能力发现（零落盘文件污染）。扩展 API 未部署时自动回退 `GET /?simple` 只探登录态。
- **未登录自动进公开区**：配合 Caddy 把裸 `GET /` 的未登录请求 302 到 `/share/`，登录按钮指向 **`/?login=1`**（这个查询让请求保持受保护 ⇒ 由网关弹认证中心）。
- **多语言 (i18n) 与系统主题跟随**：右上角齿轮设置面板内置中/英双语与亮色/暗黑模式，默认自动跟随系统。

## 📁 项目目录结构

```text
dufs-lume-ui/
├── index.html                        # HTML 入口（内置 __INDEX_DATA__ 与 __ASSETS_PREFIX__ 注入点）
├── package.json                      # 依赖管理与构建脚本
├── vite.config.ts                    # Vite 扁平化构建（含 content hash）与 __ASSETS_PREFIX__ 插件
├── public/
│   └── favicon.svg                   # 通用站点图标（映射至 __ASSETS_PREFIX__favicon.svg；部署方可用同名文件覆盖成自己的品牌）
├── scripts/
│   └── lume-info-api.sh              # 极简扩展 API 脚本（/__lume__/info + /__lume__/thumb 共用一条管道）
├── docs/
│   └── deployment-and-lume-api.md    # 进阶部署、Unix Socket 配置、缩略图端点安全约束与理论性能分析
└── src/
    ├── App.tsx                       # 主应用状态编排：合并探测、目录约束、多选与上传管理
    ├── i18n.ts                       # i18next 初始化与系统语言自动检测
    ├── locales/                      # 简体中文 (zh.json) 与英文 (en.json) 语言包
    ├── types/dufs.ts                 # Dufs 数据结构、登录态与磁盘水位类型定义
    ├── utils/format.ts               # 字节/时间格式化、预览分类、目录路径归一化
    ├── services/
    │   ├── dufsApi.ts                # Base64 解码、HTTP/WebDAV 接口、/__lume__/info 合并探测与缩略图 URL
    │   └── zipSelection.ts           # 客户端流式 ZIP：勾选条目递归展开 + fflate STORE 打包
    └── components/                   # Navbar / Breadcrumbs / ZipButton / FileExplorer / MediaPreviewModal 等
```

## 🚀 本地开发与构建命令

```bash
# 1. 安装依赖
pnpm install

# 2. 启动本地开发服务器（自动进入内置可交互演示模式）
pnpm run dev

# 3. 编译生产环境静态资源包（输出至 ./dist 目录）
pnpm run build
```

## 📦 快速部署（Dufs + Caddy + TinyAuth）

1. **启动 Dufs 并挂载构建产物**：
   ```bash
   dufs /var/lib/dufs -A --assets /path/to/dufs-lume-ui/dist -p 5000
   ```
2. **启动扩展 API 脚本（Unix Domain Socket 零端口占用）**：
   ```bash
   sudo cp scripts/lume-info-api.sh /usr/local/sbin/lume-info-api.sh
   sudo chmod 0755 /usr/local/sbin/lume-info-api.sh
   DUFS_SERVE_PATH=/var/lib/dufs THUMB_CACHE_DIR=/var/lib/lume/thumbs \
     socat UNIX-LISTEN:/run/lume-info.sock,fork,reuseaddr,mode=0660,group=caddy \
     EXEC:/usr/local/sbin/lume-info-api.sh
   ```
   > 缩略图需要系统里有图像工具链（`libvips-tools` 或 ImageMagick）。没有时 `/__lume__/thumb` 返回 503、`info` 的 `thumbs` 自动报 `false`，前端退回原图预览，**不用改任何配置**。
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

           # info 与 thumb 共用一个 socket，脚本按请求行分流
           handle /__lume__/* {
               reverse_proxy unix//run/lume-info.sock
           }

           reverse_proxy dufs:5000
       }

       handle {
           reverse_proxy dufs:5000
       }
   }
   ```

> 📖 **进阶文档**：关于 **扩展 API 能力位与缩略图端点的安全约束**、**方案 A (`socat` + Unix Socket)**、**方案 B (`systemd.socket` 0 常驻进程按需激活)**、**方案 C（TCP 端口）** 的详细配置步骤、**理论性能消耗对比（含 `df -B1` vs `du -sb` 开销解析）** 以及 **Dufs 换皮发布避坑指南**，请查阅 **[`docs/deployment-and-lume-api.md`](./docs/deployment-and-lume-api.md)**。

## 📄 开源协议

本项目遵循 [MIT License](./LICENSE) 开源协议。
