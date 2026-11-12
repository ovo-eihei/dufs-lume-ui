# 部署进阶与扩展 API (`/__lume__/info` + `/__lume__/thumb`)

本文给出 **dufs-lume-ui** 在生产环境配合 [Dufs (`sigoden/dufs`)](https://github.com/sigoden/dufs)、[Caddy `forward_auth`](https://caddyserver.com/docs/caddyfile/directives/forward_auth) 与 [TinyAuth](https://tinyauth.app/docs/community/caddy/) 部署扩展接口的做法，以及运维避坑清单。

> `/__lume__/info` 与 `/__lume__/thumb` 由**同一个脚本**服务，按请求行分流；前端只用这两条扩展路由，其余全部走 Dufs 原生接口。
>
> 扩展接口由 `socat` 常驻承载：宿主机原生部署监听 `127.0.0.1:8090`，`docker/` 的 Compose 编排监听容器网络内的 `8090`。

---

## 1. 响应规范

### (1) `GET /__lume__/info`

由 `scripts/lume-info-api.sh` 实时生成，无缓存：

```json
{
  "generated_at": "2026-01-01T09:00:00+08:00",
  "path": "/var/lib/dufs",
  "free_bytes": 18992562176,
  "data_bytes": 1529020057,
  "thumbs": false
}
```

- **只报两个数**：`free_bytes` = 文件系统剩余可用（Dufs 没有配额概念，"这个目录还能写多少"就等于它），`data_bytes` = 数据根自身占用（`du -sk` × 1024）。**不要**加 `total_bytes`/`used_bytes`：那两项反映整个分区（含操作系统与别的软件），画成百分比进度条会让人误以为网盘占了分区那么大。前端告警用绝对阈值（剩余 < 1 GiB）。
- `thumbs` 是**能力位**：系统里没有图像工具链时为 `false`；装了 `libvips-tools`（或 ImageMagick）后自动变成 `{"enabled":true,"widths":[128,256,512]}`，**无需改任何配置**。libvips 与 ImageMagick 是两套独立工具链：只装 libvips 时系统里不会有 `convert`/`magick`/`cwebp` 这些 CLI。
- 这条路由**必须放在鉴权之内**（见 §4(1)）：未登录访客请求它会被网关 `302/401` 拦下，**根本不会触发脚本执行**，前端据此判定为访客并隐藏上传/新建/删除入口、把浏览根目录锁定在 `/share/`。已登录管理员打开页面（或上传/删除后）才真正执行脚本。

### (2) `GET /__lume__/thumb?path=<站内绝对路径>&w=<宽度>&root=<share|full>`

| 参数 | 含义 |
| :--- | :--- |
| `path` | **站内绝对路径**（百分号编码，如 `%2Fshare%2Fimg.png`），脚本把它拼到 `DUFS_SERVE_PATH` 下 |
| `w` | 期望宽度，脚本收敛到 `THUMB_WIDTHS` 档位表里最近的一档 |
| `root` | `share` ⇒ 硬拦在 `DUFS_ANON_PREFIX`（默认 `/share/`）子树内；缺省 = 不额外限制 |

**脚本自己做的安全约束**（全部实测通过，见 §6）：

1. `path` 必须是绝对路径；
2. 任何 `..` 段直接 **403**（`%2e%2e` 编码后同样被拒）；
3. 解码后含控制字符（换行会污染响应头）⇒ **400**；
4. `readlink -f` 后的真实路径必须仍在数据根内 ⇒ 软链接逃逸（`share/evil.png -> /etc/passwd`）**403**；
5. `root=share` 时路径不在公开区 ⇒ **403**（且这道判断在"文件是否存在"之前，未登录者连"这个门禁区路径存在吗"都问不出来）；
6. 扩展名白名单，非图像 ⇒ **415**；原图超过 `THUMB_MAX_SRC_BYTES` ⇒ **413**；
7. 缓存目录不可写 ⇒ **500**（不会把错误页当图片吐给浏览器）。

**缓存**：`THUMB_CACHE_DIR`（默认 `/var/lib/lume/thumbs`，**在数据根之外**，不污染网盘），键 = `真实路径|mtime|size|宽度` 的 cksum ⇒ 文件一改自动换键，无需清理逻辑；同一张同一档第二次请求**不再调用工具链**。

**前端如何用它（三态偏好）**：

- 偏好存在 `localStorage['dufs_lume_thumbs']`，取值 `auto`（缺省 = 用户从没设置过）/ `on` / `off`；
- `auto` ⇒ **完全跟随能力位**：`thumbs.enabled` 为真才显示，且走服务端缩放；为假就干脆不显示；
- `on` ⇒ 用户明确要开：服务端支持走 `/__lume__/thumb`，**不支持就退回浏览器缩放原图**（能用，但每张吃原图带宽）；
- `off` ⇒ 无论服务端支不支持都不显示；**服务端能力变化不会改写用户设置**；
- 服务端图挂了（404/503/被网关弹走）⇒ 该张自动退回原图，原图也挂 ⇒ 退回文件图标，**不会无限重试**。

⚠ **未登录访客看不到服务端缩略图**：只要两条路由都在鉴权之内，匿名请求就会被 302 弹到认证中心。这不是故障：前端 `auto` 态拿不到能力位 ⇒ 干脆不显示，不会发出注定失败的请求。要让公开区图片也有服务端缩略图，必须**额外**开一条匿名路由并**硬塞 `root=share`**（§4 可选 (4)），此时脚本的第 5 条约束就是唯一的门。

### (3) 脚本内部的取值约束

- `df -P -k` 只读一次超级块（`statfs`），与磁盘大小无关；`du -sk` 要递归遍历 inode：数据根 12 个文件 **0.002 s**，造 2 万个文件 **0.054 s** ⇒ 每请求跑一次完全可接受，所以 `data_bytes` **默认输出**。文件数到数十万级时才需要考虑缓存。
- ⚠ 用 `-sk` 而不是 `-sb`：busybox(alpine) 的 `du` 没有 `-b`；`df` 同理不用 GNU 的 `-B1/--output`，否则在 busybox 上直接回 usage。乘 1024 交给 shell 算术，**别在 awk 里乘**（mawk 按 `%g` 输出成 `3.16728e+10`，既不是合法 JSON 整数又丢精度）。

---

## 2. 宿主机原生部署

```bash
sudo apt install socat
sudo cp scripts/lume-info-api.sh /usr/local/sbin/lume-info-api.sh   # 约定：脚本进 /usr/local/sbin/<service>-<verb>
sudo chmod 0755 /usr/local/sbin/lume-info-api.sh
sudo mkdir -p /var/lib/lume/thumbs && sudo chown -R root:root /var/lib/lume && sudo chmod 0750 /var/lib/lume
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
# 只绑回环：8090 不对任何外部接口暴露，入口层（Caddy）之外没人能连
ExecStart=/usr/bin/socat TCP-LISTEN:8090,bind=127.0.0.1,reuseaddr,fork EXEC:/usr/local/sbin/lume-info-api.sh
Restart=always
RestartSec=2
# 缩略图是 CPU/内存密集操作，2 GB 机器上给它一道上限
Nice=10
MemoryMax=192M
# ⚠ ProtectSystem 用 full，不要用 strict：strict 把 /var 一并挂成只读 ⇒ 缩略图缓存写不进去，
#   脚本按第 7 条约束回 500。full = /usr /boot /efi /etc 只读，/var 与 /run 可写。
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
curl -s http://127.0.0.1:8090/__lume__/info | head -c 200
```

---

## 3. Docker Compose 部署

`docker/` 目录已经内置好，**不需要自己写 unit**：`lume-info-api` 容器里的 `socat` 监听 `0.0.0.0:8090`（容器网络内部），`expose` 只在 compose 网络里可见、**不对宿主发布端口**，Caddy 容器写 `reverse_proxy lume-info-api:8090`。

```bash
cd docker && cp .env.example .env   # 改 DATA_DIR 与 LUME_HTTP_PORT
docker compose up -d --build
```

细节见 [`README.md` 的 Docker 一节](../README.md#-docker-compose-快速部署) 与 `docker/compose.yaml` 注释。

---

## 4. Caddyfile 需要配套的三处

### (1) 扩展 API：一个服务两条路由

```caddyfile
    handle @gated {
        forward_auth 127.0.0.1:3000 {
            uri /api/auth/caddy
            copy_headers Remote-User Remote-Email Remote-Name
        }

        handle /__lume__/* {
            reverse_proxy 127.0.0.1:8090
        }

        reverse_proxy 127.0.0.1:5000
    }
```

`@gated` 的语义是「非 `/share*` 且非 `/__dufs_v*` 都要过 forward_auth」，所以 `/__lume__/*` 天然落在鉴权之后 —— 这正是「未登录探测被 302 弹走 ⇒ 前端判定为访客」的机制，**不要**把它挪到鉴权之外。

### (2) 未登录访问 `/` ⇒ 自动落到公开区

**语义要求只有两条**：

- 未登录 + `GET /`（不带 `?login`）⇒ **302 `/share/`**
- 未登录 + `GET /?login=1` ⇒ **照旧弹认证中心**（前端登录按钮就指这个查询串）
- 已登录 + `GET /` ⇒ 正常返回前端 HTML

Caddy 没有"未登录"这个匹配条件（登录态只有 tinyauth 知道）。**下面这个形状是实测可用的版本**。
2. **`?login` 必须留在鉴权之内** —— 它是唯一的登录入口，被豁免掉就再也登不进来（前端 `handleLoginClick` 指 `?login=1`）。写法用的是 `not query login=*`（**任意值**都留在鉴权内），比只匹配 `login=1` 稳。
3. 深链范围（门禁区路径未登录时是否也跳 `/share/`）本文不处理：下面的写法只管根 `/`，其余路径照旧 302 到认证中心。

⚠ 两个容易踩的坑：

- **失败分支要匹配 401，不是 302**。`(tinyauth)` 片段若带 `header_up -User-Agent`，tinyauth 对**无 UA 的鉴权子请求恒回 401**（浏览器 UA 才回 302）⇒ 草稿里的 `handle_response 302` 在这台机器上永不命中。客户端看到的那个 302 是 Caddy 自己 `redir` 出来的，不是鉴权回包。
- **`redir /share/ 302` 会被静默编错**（Caddy v2.11.7，`adapt` 现场）：渲染成 `static_response{Location:"302"}` + 一条隐藏的 `match{path:["/share/"]}` —— **不报错但完全错**（`redir` 按参数数量判语义，两参数 = `(from, to)`）。`redir location /share/ 302` 报 `Not a supported redir code type`（本版本没有 `location` 关键字），单参数 `redir /share/` 报 `wrong argument count`。可用写法是 **`redir "{scheme}://{host}/share/" 302`**（代价：Location 是绝对 URL 而非相对）；想要相对形式可用 `redir / /share/ 302`，但那会多一条隐藏 path 匹配，将来放宽 `@rootLanding` 范围时会静默失效。
- 顺带：验证配置用 **`runuser -u caddy --preserve-environment -- caddy validate`**，别用 root 跑（root 会把缺失的日志文件建成 `root:root 0600`）。

### (3) 公开区照常反代 dufs

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
        reverse_proxy 127.0.0.1:8090
    }
```

（`set_query` 是覆盖语义，`replace_query` 只替换已存在的参数 —— 前端在匿名态本来就会带 `root=share`，但只有覆盖语义是安全的）

---

## 5. 部署与运维注意事项

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

---

## 6. 自检命令（脚本可脱离监听单测，管道进、管道出）

```bash
# 能力位与磁盘水位
printf 'GET /__lume__/info HTTP/1.1\r\nHost: x\r\n\r\n' | ./scripts/lume-info-api.sh

# 安全闸门（期望依次：200 / 403 / 403 / 403 / 415 / 400 / 403）
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

⚠ 上面这个循环**必须用 `printf '%b' "GET $q ..."`**，不能写 `printf 'GET %s ...' "$q"`：查询串里的 `%2F` 会被 `printf` 当成格式说明符吃掉（`%2F` → 宽度 2 的 `F` 转换），路径直接被破坏成 400。

> 这 7 条闸门用例可以脱离监听单测：先用假 `vipsthumbnail`（固定输出）过一遍形状，再在装了真图像工具的机器上复测（`root=share` 打门禁区路径 ⇒ 403、`..` ⇒ 403、非图像扩展名 ⇒ 415、`%0A` ⇒ 400、未知路由 ⇒ 404）。缩放质量由出图尺寸与字节数验证：`a.jpg` 1,423,169 B → **512×512 / 24,137 B**；`logo.png` 原图 **207×208**，请求 `w=200` 收敛到 256 档，而 `--size=256x256>` 的 `>` 语义**不放大** ⇒ 出图仍是 207×208。
