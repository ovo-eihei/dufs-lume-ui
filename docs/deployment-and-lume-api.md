# 部署进阶、扩展 API (`/__lume__/info` + `/__lume__/thumb`) 与性能分析

本文档整理了 **dufs-lume-ui** 在生产环境配合 [Dufs (`sigoden/dufs`)](https://github.com/sigoden/dufs)、[Caddy `forward_auth`](https://caddyserver.com/docs/caddyfile/directives/forward_auth) 与 [TinyAuth](https://tinyauth.app/docs/community/caddy/) 部署时的扩展接口方案、三种监听模式理论性能对比，以及运维实测避坑指南。

> **v1.3.0 变更**：`/__lume__/disk` → **`/__lume__/info`**（它返回的早已不只是磁盘水位），并新增 **`/__lume__/thumb`** 缩略图端点。**同一个脚本、同一个 socket 同时服务这两条路由**，按请求行分流。旧名 `/__lume__/disk` 已彻底废弃（前端拿到 404 会自动回退 `GET /?simple` 探登录态，功能不炸，只是没有磁盘水位与能力位）。

---

## 1. 为什么用 `/__lume__/info` 实时脚本取代落盘文件？

1. **零落盘文件污染**：不在 Dufs 数据目录写入任何隐藏文件（如 `.lume-disk.json`），保持网盘数据目录、备份与同步任务绝对干净。
2. **一次请求完成「登录态探测 + 磁盘空间读取 + 服务端能力发现」**：
   - `/__lume__/info` 部署在 Caddy 的 `@gated` 鉴权块之后；
   - **未登录访客**打开页面时，前端请求 `GET /__lume__/info` 在网关层即被 `302/401` 拦截（**根本不会触发脚本执行**），前端据此判定为未登录访客，自动隐藏上传/新建/删除入口并将浏览根目录锁定在 `/share/`；
   - **已登录管理员**打开页面（或上传/删除文件后），请求通过网关并由 `scripts/lume-info-api.sh` 实时返回 JSON，前端单次请求同时完成身份确认、磁盘水位展示与服务端能力发现。
3. **响应体**（`scripts/lume-info-api.sh` 实际输出）：
   ```json
   {
     "generated_at": "2026-01-01T09:00:00+08:00",
     "path": "/var/lib/dufs",
     "free_bytes": 18992562176,
     "data_bytes": 1529020057,
     "thumbs": false
   }
   ```
   - **只报两个数**：`free_bytes` = 文件系统剩余可用（dufs 没有配额概念，"这个目录还能写多少"就等于它），`data_bytes` = 数据根自身占用（`du -sk` × 1024，默认输出）。
   - ⚠ **不再输出 `total_bytes`/`used_bytes`**：那是整个分区的占用（含系统与别的软件），与网盘内容无关 —— 实测分区 11.4/30 GiB=38% 而数据根只有 1.42 GiB，显示百分比条会让人以为网盘占了 38%。前端告警改用绝对阈值（剩余 < 1 GiB）。
   - `thumbs` 是**能力位**：系统里没有图像工具链时为 `false`；装了 `libvips-tools`（或 ImageMagick）后自动变成 `{"enabled":true,"widths":[128,256,512]}`，**无需改任何配置**。
   - **装 `libvips-tools` 后即为 enabled**（Debian 12 = `8.14.x`，走 `THUMB_TOOL=vips` 分支；注意 libvips 只拖库、不提供 `convert`/`magick`/`ffmpeg`/`cwebp` CLI —— libvips 只拖进 `libmagickcore`，不带 CLI）。
   - 出图实测（真实数据根 + 真实 vips）：`share/Gemini_*.jpg` 1,423,169 B → **512×512 / 24,137 B**；`share/logo.png` 原图 **207×208**，请求 `w=200` 收敛到 256 档，`--size=256x256>` 的 `>` 语义**不放大** ⇒ 出图仍 207×208（11,925 B）。同参数第二次请求命中缓存、不再调工具链。

---

## 2. 为什么使用 Unix Domain Socket 而不是命名管道 (`mkfifo`)？

- **命名管道 (`mkfifo`) 的局限**：Linux FIFO 命名管道是**单向字节流**，无法在一个连接上既接收 HTTP 请求又将 JSON 响应写回给特定客户端，且 [Caddy `reverse_proxy`](https://caddyserver.com/docs/caddyfile/directives/reverse_proxy#addresses) 不支持挂载单向 FIFO 管道。
- **Unix Domain Socket（本地套接字文件，如 `/run/lume-info.sock`）的优势**：
  - 同样是**文件系统中的一个节点（不占用任何 TCP/UDP 端口、不经过网卡协议栈）**；
  - 支持**双向全双工通信**，Caddy 原生支持 `reverse_proxy unix//run/lume-info.sock`。

---

## 3. 方案 A / B / C 理论性能消耗对比

由于 `/__lume__/info` 位于 Caddy 鉴权层之后，只有已登录管理员刷新页面或上传/删除文件时才会触发调用：

| 评估维度 | 方案 A：`socat` + Unix Socket | 方案 B：`systemd.socket` 按需激活 | 方案 C：`socat`/`ncat` + TCP 端口 |
| :--- | :--- | :--- | :--- |
| **平时空闲内存 (Idle RAM)** | 约 **1.5 ~ 2.5 MB**（1 个常驻 `socat` 进程，PSS 极小） | **0 MB**（无任何常驻进程，套接字由 PID 1 `systemd` 顺带托管） | 约 **1.5 ~ 2.5 MB**（1 个常驻 `socat`/`ncat` 进程） |
| **平时空闲 CPU** | **0%**（阻塞在内核 `accept()` 上） | **0%**（由内核 `epoll` 监听） | **0%**（阻塞在内核 `accept()` 上） |
| **端口与协议栈开销** | **0 端口**，纯内核内存缓冲区拷贝，不走 TCP/IP 协议栈 | **0 端口**，纯内核内存缓冲区拷贝，不走 TCP/IP 协议栈 | 占用 1 个回环端口，需经过本地 TCP 三次握手、四次挥手及 `TIME_WAIT` 状态表 |
| **单次请求派生开销 (Fork)** | **极低**：`socat` 直接 `fork() + execve()` 拉起 `/bin/sh`，耗时约 **0.3 ~ 0.8 ms** | **中等**：`systemd` 需为每次连接动态实例化 `lume-info@xxx.service` 单元、建立 cgroup 并记录 journald 日志，耗时约 **3 ~ 8 ms** | **低**：`socat` `fork() + execve()` + 本地回环 TCP 握手，耗时约 **0.5 ~ 1.2 ms** |
| **脚本内部执行耗时** | `df -P -k`（系统调用 `statfs()`，**< 0.2 ms**）+ `du -sk`（见下） | 同左 | 同左 |

### 选型建议与 `du -sb` 性能说明

1. **追求单次响应最快、以后可能容器化**：选 **方案 A (`socat` + Unix Socket)**。直接 `fork()` 比初始化临时 systemd 单元快一个数量级，且同样不占 TCP 端口。⚠ 代价：`socat` 常需自行安装（Debian 12 候选版本 `1.7.4.4-2`）。
2. **追求 0 常驻进程、宿主机原生部署**：选 **方案 B (`systemd.socket`)**。平时 `ps aux` 中没有任何额外常驻进程，单次请求多出的几毫秒对人类完全无感，且**零新依赖**。
3. **`df` 与 `du` 的开销（实测，不是推测）**：
   - `df -P -k` 只读一次超级块（`statfs`），**< 0.2 ms**，与磁盘大小无关。
   - `du -sk` 要递归遍历 inode：数据根（12 文件）**0.002 s**；`/tmp` 造 **2 万文件 0.054 s** ⇒ 每请求跑一次完全可接受，所以 `data_bytes` **默认输出**，原先的 `ENABLE_DU_DATA_BYTES` 开关已删。文件数真到数十万级时再谈缓存。
   - ⚠ 用 `-sk` 而不是 `-sb`：busybox(alpine) 的 `du` 没有 `-b`；`df` 同理不用 GNU 的 `-B1/--output`，否则在 busybox 上直接回 usage。乘 1024 交给 shell 算术，**别在 awk 里乘**（mawk 按 `%g` 输出成 `3.16728e+10`，既不是合法 JSON 整数又丢精度）。

---

## 4. 方案 A 完整配置步骤

```bash
sudo apt install socat
sudo cp scripts/lume-info-api.sh /usr/local/sbin/lume-info-api.sh   # CONVENTIONS：脚本进 /usr/local/sbin/<service>-<verb>
sudo chmod 0755 /usr/local/sbin/lume-info-api.sh
```

`/etc/systemd/system/lume-info-api.service`：

```ini
[Unit]
Description=Dufs Lume UI extension API (/__lume__/info + /__lume__/thumb)
After=network.target

[Service]
Type=simple
Environment="DUFS_SERVE_PATH=/var/lib/dufs"
Environment="DUFS_ANON_PREFIX=/share"
Environment="THUMB_CACHE_DIR=/var/lib/lume/thumbs"
ExecStartPre=-/bin/rm -f /run/lume-info.sock
# ⚠ mode 用 0660 + 属组 caddy：caddy 要能连，但不该全世界可写（写成 0666 等于任意本地用户都能打这个 API）
ExecStart=/usr/bin/socat UNIX-LISTEN:/run/lume-info.sock,fork,reuseaddr,mode=0660,group=caddy EXEC:/usr/local/sbin/lume-info-api.sh
Restart=always
RestartSec=2
# 缩略图是 CPU/内存密集操作，2 GB 机器上给它一道上限
Nice=10
MemoryMax=192M
# ⚠ ProtectSystem 只能用 full，**不能用 strict**（实测）：
#   strict 把整个文件系统层级挂只读，**/run 也包括** ⇒ socat bind() 报
#   `E bind(5, {AF=1 "/run/lume-info.sock"}): Read-only file system`，服务卡 activating (auto-restart)。
#   ReadWritePaths=/var/lib/lume 救不了（那是另一个路径）。full = /usr /boot /efi /etc 只读，/run 与 /var 可写。
#   也没选 RuntimeDirectory= —— 那会把路径变成 /run/lume-info/…，要连带改 Caddyfile 与本文档。
ProtectSystem=full
NoNewPrivileges=yes
PrivateTmp=yes
ProtectHome=yes
ProtectKernelTunables=yes
ProtectControlGroups=yes

[Install]
WantedBy=multi-user.target
```

```bash
sudo systemctl daemon-reload && sudo systemctl enable --now lume-info-api.service
sudo mkdir -p /var/lib/lume/thumbs && sudo chown -R root:root /var/lib/lume && sudo chmod 0750 /var/lib/lume
```

> 方案 B（`systemd.socket` + `Accept=yes` + `StandardInput/Output=socket`，0 常驻进程、无需 `socat`）与方案 C（TCP 端口）的配置见本节末尾的旧版说明；**换方案只需换监听方式，脚本与 Caddy 路由不动**。

---

## 5. 缩略图端点 `/__lume__/thumb`

`GET /__lume__/thumb?path=<站内绝对路径>&w=<宽度>&root=<share|full>`

| 参数 | 含义 |
| :--- | :--- |
| `path` | **站内绝对路径**（百分号编码，如 `%2Fshare%2Fimg.png`），脚本把它拼到 `DUFS_SERVE_PATH` 下 |
| `w` | 期望宽度，脚本收敛到 `THUMB_WIDTHS` 档位表里最近的一档 |
| `root` | `share` ⇒ 硬拦在 `DUFS_ANON_PREFIX`（默认 `/share/`）子树内；缺省 = 不额外限制 |

**脚本自己做的安全约束**（全部实测通过，见 §7）：

1. `path` 必须是绝对路径；
2. 任何 `..` 段直接 **403**（`%2e%2e` 编码后同样被拒）；
3. 解码后含控制字符（换行会污染响应头）⇒ **400**；
4. `readlink -f` 后的真实路径必须仍在数据根内 ⇒ 软链接逃逸（`share/evil.png -> /etc/passwd`）**403**；
5. `root=share` 时路径不在公开区 ⇒ **403**（且这道判断在"文件是否存在"之前，未登录者连"这个门禁区路径存在吗"都问不出来）；
6. 扩展名白名单，非图像 ⇒ **415**；原图超过 `THUMB_MAX_SRC_BYTES` ⇒ **413**；
7. 缓存目录不可写 ⇒ **500**（不会把错误页当图片吐给浏览器）。

**缓存**：`THUMB_CACHE_DIR`（默认 `/var/lib/lume/thumbs`，**在数据根之外**，不污染网盘），键 = `真实路径|mtime|size|宽度` 的 cksum ⇒ 文件一改自动换键，无需清理逻辑；同一张同一档第二次请求**不再调用工具链**（实测生成次数 2 次 / 请求 4 次）。

**前端如何用它（v1.3.0 的三态偏好）**：

- 偏好存在 `localStorage['dufs_lume_thumbs']`，取值 `auto`（缺省 = 用户从没设置过）/ `on` / `off`；
- `auto` ⇒ **完全跟随能力位**：`thumbs.enabled` 为真才显示，且走服务端缩放；为假就干脆不显示；
- `on` ⇒ 用户明确要开：服务端支持走 `/__lume__/thumb`，**不支持就退回浏览器缩放原图**（能用，但每张吃原图带宽）；
- `off` ⇒ 无论服务端支不支持都不显示；**服务端能力变化不会改写用户设置**；
- 服务端图挂了（404/503/被网关弹走）⇒ 该张自动退回原图，原图也挂 ⇒ 退回文件图标，**不会无限重试**。

⚠ **未登录访客看不到服务端缩略图**：只要 `/__lume__/info` 与 `/__lume__/thumb` 都在鉴权之内，匿名请求就会被 302 弹到认证中心。这不是故障：前端 `auto` 态拿不到能力位 ⇒ 干脆不显示，不会发出注定失败的请求。要让公开区图片也有服务端缩略图，必须**额外**开一条匿名路由并**硬塞 `root=share`**（§6(4)），此时脚本的第 5 条约束就是唯一的门。

---

## 6. Caddyfile 需要配套的三处（v1.3.0）

### (1) 扩展 API：一个 socket 服务两条路由

```caddyfile
    handle @gated {
        forward_auth 127.0.0.1:3000 {
            uri /api/auth/caddy
            copy_headers Remote-User Remote-Email Remote-Name
        }

        handle /__lume__/* {
            reverse_proxy unix//run/lume-info.sock
        }

        reverse_proxy 127.0.0.1:5000
    }
```

`@gated` 的语义是「非 `/share*` 且非 `/__dufs_v*` 都要过 forward_auth」，所以 `/__lume__/*` 天然落在鉴权之后 —— 这正是「未登录探测被 302 弹走 ⇒ 前端判定为访客」的机制，**不要**把它挪到鉴权之外。

### (2) 未登录访问 `/` ⇒ 自动落到公开区（F3a）

**语义要求只有两条**：

- 未登录 + `GET /`（不带 `?login`）⇒ **302 `/share/`**
- 未登录 + `GET /?login=1` ⇒ **照旧弹认证中心**（这是前端 v1.3.0 登录按钮的新指向）
- 已登录 + `GET /` ⇒ 正常返回前端 HTML

Caddy 没有"未登录"这个匹配条件（登录态只有 tinyauth 知道）。**下面这个形状是实测可用的版本**。
2. **`?login` 必须留在鉴权之内** —— 它是唯一的登录入口，被豁免掉就再也登不进来（前端 `handleLoginClick` 指 `?login=1`）。写法用的是 `not query login=*`（**任意值**都留在鉴权内），比只匹配 `login=1` 稳。
3. 深链范围（门禁区路径如 `/easyrc.7z`、`/test/` 未登录时是否也跳 `/share/`）**用户尚未拍板** ⇒ 现状保持（302 到登录页），只处理根 `/`。

⚠ 两个容易踩的坑：

- **失败分支要匹配 401，不是 302**。`(tinyauth)` 片段若带 `header_up -User-Agent`，tinyauth 对**无 UA 的鉴权子请求恒回 401**（浏览器 UA 才回 302）⇒ 草稿里的 `handle_response 302` 在这台机器上永不命中。客户端看到的那个 302 是 Caddy 自己 `redir` 出来的，不是鉴权回包。
- **`redir /share/ 302` 会被静默编错**（Caddy v2.11.7，`adapt` 现场）：渲染成 `static_response{Location:"302"}` + 一条隐藏的 `match{path:["/share/"]}` —— **不报错但完全错**（`redir` 按参数数量判语义，两参数 = `(from, to)`）。`redir location /share/ 302` 报 `Not a supported redir code type`（本版本没有 `location` 关键字），单参数 `redir /share/` 报 `wrong argument count`。可用写法是 **`redir "{scheme}://{host}/share/" 302`**（代价：Location 是绝对 URL 而非相对）；想要相对形式可用 `redir / /share/ 302`，但那会多一条隐藏 path 匹配，将来放宽 `@rootLanding` 范围时会静默失效。
- 顺带：验证配置用 **`runuser -u caddy --preserve-environment -- caddy validate`**，别用 root 跑（root 会把缺失的日志文件建成 `root:root 0600`）。

### (3) 公开区照常反代 dufs（现状不变）

```caddyfile
    handle {
        reverse_proxy 127.0.0.1:5000
    }
```

### 可选 (4)：让未登录者也能用服务端缩略图

默认**不开**。现状是 `/__lume__/thumb` 在 `@gated` 之后 ⇒ 匿名请求被 302 弹走 ⇒ 未登录者网格视图没有缩略图（前端会安静地不显示，不是坏）。要开就把 thumb 单独提到鉴权之外，并**强制** `root=share`：

```caddyfile
    handle /__lume__/thumb {
        # 语义：无论调用方传什么，都把它锁在 /share 子树内 —— 这是唯一的门
        uri set_query root=share
        reverse_proxy unix//run/lume-info.sock
    }
```

⚠ 这条路由一旦开在鉴权之外，`root=share` 就是唯一防线：**必须保证调用方不能自己覆盖成 `root=full`**（`set_query` 是覆盖语义，`replace_query` 只替换已存在的参数 —— 前端 v1.3.0 在匿名态本来就会带 `root=share`，两种写法都对齐，但只有覆盖语义是安全的）。不确定就先别开，让匿名者保持"无缩略图"。

## 7. 发布与运维实测避坑指南

1. **资源前缀不是 `/assets/`**：Dufs 把 `--assets` 目录挂在 `/__dufs_v<版本>__/` 下（`/assets/` 直接 404），升级 Dufs 时版本号前缀会自动变化。因此源码中只使用 `__ASSETS_PREFIX__` 占位符，**绝不硬编码版本前缀**；Caddyfile 中使用 `not path /__dufs_v*` 通配豁免。
2. **更新前端产物后必须重启 Dufs**：Dufs 的 `Server::new()` 在启动时一次性执行 `read_to_string(assets/index.html)` 缓存在内存中（`src/server.rs:93`），而 JS/CSS 是每次请求直读磁盘。若只覆盖 `dist/*` 而不重启 Dufs，生产环境的 HTML 仍会引用上一版的 hashed JS/CSS 文件名。
3. **产物文件名必须带 Content Hash**：`/__dufs_v<版本>__/` 下的文件被 Dufs 标记为 `cache-control: public, max-age=31536000, immutable`，而 `index.html` 本身是 `no-cache`。本仓库构建配置固定输出 `lume-app.[hash].js` / `lume-[name].[hash][extname]`，发布时请使用 `rsync -a --delete dist/ /path/to/assets/` 整目录替换，避免旧 hash 文件堆积。
4. **用 `curl` 验证换皮必须带浏览器请求头**：Dufs 按 `Accept` 请求头分流——`Accept: */*`（`curl` 默认值）返回内置极简页，只有携带 `Accept: text/html,...` 与 `Mozilla/5.0` User-Agent 时才会返回自定义主题的 `index.html`。
5. **没有图像工具链**（`convert` / `magick` / `ffmpeg` / `vipsthumbnail` / `cwebp` 全部不存在）⇒ `/__lume__/thumb` 会返回 **503**、`info` 的 `thumbs` 会是 `false`。装 `libvips-tools` 后**无需改脚本或配置**，能力位自动亮起。
6. **品牌是运行时注入的，不是编译进去的**：`index.html` 里有一行 `window.__LUME_BRAND__ = '__LUME_BRAND_JSON__';`。docker 路径由 `docker/entrypoint-ui.sh` 填；**非 docker（rsync `dist/`）不会跑那个脚本**，占位符原样留着 ⇒ 前端 `resolveBrandConfig()` 当它未配置，用 locale 缺省值。要给自己实例带品牌，在 `rsync` 之后、`systemctl restart dufs` 之前把那个单引号字面量换成 JSON（**单引号**里才能放含双引号的 JSON；改完必须重启，理由同第 2 条）：

   ```bash
   BRAND='{"title":"我的盘","subtitle":"文件分享","icon":"","loginUrl":""}'
   awk -v b="$BRAND" '{gsub(/__LUME_BRAND_JSON__/, b); print}' /path/to/assets/index.html > /tmp/i && cat /tmp/i > /path/to/assets/index.html
   ```

   ⚠ 这里用 `gsub` 只能当品牌值不含 `&` 与反斜杠（`&` 在 gsub 替换串里 = 整段匹配）。entrypoint 脚本自己走的是 `index()`+`substr()` 拼接，不吃转义，已经用 `</script>` / `"` / `'` / `\` / `&` / `%` 的恶意值逐字节验过。

### 自检命令（脚本可脱离 socket 单测，管道进、管道出）

```bash
# 能力位与磁盘水位
printf 'GET /__lume__/info HTTP/1.1\r\nHost: x\r\n\r\n' | ./scripts/lume-info-api.sh

# 安全闸门（期望依次：200 / 403 / 403 / 403 / 415 / 400 / 403 / 400）
export DUFS_SERVE_PATH=/tmp/fakeroot THUMB_CACHE_DIR=/tmp/cache PATH=/tmp/fakebin:$PATH
for q in \
  '/__lume__/thumb?path=%2Fshare%2Fa.png&w=256&root=share' \
  '/__lume__/thumb?path=%2Fhidden.png&root=share' \
  '/__lume__/thumb?path=%2Fshare%2Fescape.png' \
  '/__lume__/thumb?path=%2Fshare%2F..%2Fhidden.png' \
  '/__lume__/thumb?path=%2Fshare%2Fnotes.txt' \
  '/__lume__/thumb?path=share%2Fa.png' \
  '/__lume__/thumb?path=%2Fshare%2Fa.png%0AInjected:%20yes' ; do
  printf '%b' "GET $q HTTP/1.1\r\n\r\n" | ./scripts/lume-info-api.sh | head -1
done
```

⚠ 上面这个循环**必须用 `printf '%b' "GET $q ..."`**，不能写 `printf 'GET %s ...' "$q"`：查询串里的 `%2F` 会被 `printf` 当成格式说明符吃掉（`%2F` → 宽度 2 的 `F` 转换），路径直接被破坏成 400。这个坑实测踩过。

> 这 7 条闸门用例的自测法：先用假 `vipsthumbnail`（固定输出）过一遍，再在真实数据根 + 真实 vips 上复测（`root=share` 打 `/test/` ⇒ 403、`..` ⇒ 403、`.7z` ⇒ 415、`%0A` ⇒ 400、未知路由 ⇒ 404）。真实缩放质量已由出图尺寸/字节验证（见 §1）。
