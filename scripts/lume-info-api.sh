#!/bin/sh
# dufs-lume-ui 扩展 API（单脚本两条路由，零落盘污染数据根）
#
#   GET /__lume__/info                     → 登录态探测 + 实时磁盘水位 + 服务端能力位（JSON）
#   GET /__lume__/thumb?path=/share/a.png&w=256&root=share → 缩放后的缩略图（image/jpeg|png）
#
# 由 socat 把 TCP 连接的管道交给本脚本（宿主机 127.0.0.1:8090；容器内 0.0.0.0:8090），
# 脚本从 stdin 读一个 HTTP 请求、往 stdout 写一个 HTTP 响应，用完即退。
#
# 环境变量：
#   DUFS_SERVE_PATH       : 数据根（默认 /data）—— 缩略图只允许取它以内的路径
#   DUFS_ANON_PREFIX      : 公开区前缀（默认 /share），root=share 时用它做前缀白名单
#   （无开关）data_bytes  : 默认输出，脚本每次请求跑一次 du -sk × 1024（实测数据根 0.002 s）
#   THUMB_CACHE_DIR       : 缩略图缓存目录（默认 /var/lib/lume/thumbs，在数据根之外）
#   THUMB_WIDTHS          : 允许的宽度档位（默认 "128 256 512"）
#   THUMB_MAX_SRC_BYTES   : 原图大小上限，超过直接 413（默认 67108864 = 64 MB）
#
# 详细部署与性能对比见 docs/deployment-and-lume-api.md

ROOT="${DUFS_SERVE_PATH:-/data}"
ANON_PREFIX="${DUFS_ANON_PREFIX:-/share}"
CACHE_DIR="${THUMB_CACHE_DIR:-/var/lib/lume/thumbs}"
WIDTHS="${THUMB_WIDTHS:-128 256 512}"
MAX_SRC="${THUMB_MAX_SRC_BYTES:-67108864}"

# ---------- 输出工具 ----------
respond() { # $1=status $2=reason $3=ctype $4=额外响应头(可空) $5=body
  LEN=$(printf '%s' "$5" | wc -c | tr -d ' ')
  printf 'HTTP/1.1 %s %s\r\n' "$1" "$2"
  printf 'Content-Type: %s\r\n' "$3"
  printf 'Cache-Control: no-store\r\n'
  [ -n "$4" ] && printf '%s' "$4"
  printf 'Content-Length: %s\r\n' "$LEN"
  printf 'Connection: close\r\n\r\n'
  printf '%s' "$5"
}

respond_file() { # $1=ctype $2=file —— 二进制直发，缓存命中时不重复生成
  LEN=$(wc -c < "$2" | tr -d ' ')
  printf 'HTTP/1.1 200 OK\r\n'
  printf 'Content-Type: %s\r\n' "$1"
  printf 'Cache-Control: public, max-age=86400\r\n'
  printf 'Content-Length: %s\r\n' "$LEN"
  printf 'Connection: close\r\n\r\n'
  cat "$2"
}

# ---------- 能力探测 ----------
# 精简系统里常常一个图像工具都没有；缺工具时能力位报 false，前端自然降级（不是故障）
# 装完 libvips-tools 之后这里才会自动亮起来 ⇒ 前端据此决定「服务器注册 ⇒ 用服务端预览」。
THUMB_TOOL=''
if command -v vipsthumbnail >/dev/null 2>&1; then
  THUMB_TOOL=vips
elif command -v convert >/dev/null 2>&1; then
  THUMB_TOOL=im
fi

thumbs_cap() {
  [ -z "$THUMB_TOOL" ] && { printf 'false'; return; }
  printf '{"enabled":true,"widths":[%s]}' "$(printf '%s' "$WIDTHS" | tr ' ' ',')"
}

# ---------- GET /__lume__/info ----------
serve_info() {
  # 只报两个数：文件系统剩余可用（= 这个目录还能写多少）与数据根自身占用。
  # 不输出 total_bytes/used_bytes —— 那两项反映整个分区的占用（含系统与别的软件），与网盘内容无关
  # 无关（实测：分区 11.4/30 GiB=38%，数据根只有 1.42 GiB），百分比条会误导。
  # 只用 POSIX df：GNU 的 -B1/--output 在 busybox(alpine) 上直接回空/usage ⇒ 基座不挑发行版。
  # -P -k 给 1024 块；乘 1024 交给 shell 算术，**不要**在 awk 里乘 —— mawk 会按 %g 输出
  # 成 3.16728e+10 这种科学计数法，既不是合法 JSON 整数又丢精度（容器实测）。
  set -- $(df -P -k "$ROOT" 2>/dev/null | tail -n 1)
  FREE=$(( ${4:-0} * 1024 ))
  NOW=$(date -Iseconds 2>/dev/null || date +"%Y-%m-%dT%H:%M:%S%z")
  CAP=$(thumbs_cap)
  # du -sk 每请求跑一次（实测数据根 0.002 s / 2 万文件 0.054 s）⇒ 默认输出，不做开关。
  KB=$(du -sk "$ROOT" 2>/dev/null | cut -f1)             # busybox du 没有 -b ⇒ 用 -sk 再乘 1024
  DATA=$(( ${KB:-0} * 1024 ))
  # 不输出 path：数据根的绝对路径对前端没有任何用处（它只喂过磁盘小部件的悬浮提示），
  # 却把宿主机/容器的文件系统布局告诉浏览器 ⇒ 少说一个字段更省事。
  BODY=$(printf '{"generated_at":"%s","free_bytes":%s,"data_bytes":%s,"thumbs":%s}' \
    "$NOW" "$FREE" "$DATA" "$CAP")
  respond 200 OK application/json '' "$BODY"
}

# ---------- GET /__lume__/thumb ----------
# %XX 解码：mawk 没有 strtonum ⇒ 手算十六进制；顺带把 '+' 还原成空格
url_decode() {
  printf '%s' "$1" | awk '{
    s=$0; out=""; i=1; H="0123456789ABCDEF"
    while (i <= length(s)) {
      c = substr(s, i, 1)
      if (c == "%") {
        h = toupper(substr(s, i + 1, 2))
        p = index(H, substr(h, 1, 1)); q = index(H, substr(h, 2, 1))
        if (length(h) == 2 && p > 0 && q > 0) { out = out sprintf("%c", (p - 1) * 16 + (q - 1)); i += 3; continue }
        out = out c; i += 1; continue
      }
      if (c == "+") { out = out " "; i += 1; continue }
      out = out c; i += 1
    }
    # 必须写 printf "%s", out。写成 printf out 时 out 被当格式串：路径里带裸 %
    # （如 /share/100%.png）在 mawk(Debian) 下报 run time error 并把路径截成 /share/100，
    # busybox awk 则不报错 —— 所以这个差异只在换基座时暴露（容器实测）。
    printf "%s", out
  }'
}

# 查询串里取参数值（只取第一个匹配）
query_get() { # $1=query（不含前导 ?） $2=key
  # 统一补上 '?' 前缀与 '&' 结尾，这样每个参数前面都有分隔符可锚定
  printf '?%s&' "$1" | sed -n "s/.*[?&]$2=\([^&]*\).*/\1/p"
}

pick_width() { # 把请求宽度收到档位表里最接近的一档
  req=${1:-256}
  case "$req" in
    ''|*[!0-9]*) req=256 ;;
  esac
  best=0
  for w in $WIDTHS; do
    if [ "$req" -le "$w" ]; then best=$w; break; fi
    best=$w
  done
  printf '%s' "$best"
}

# 原图扩展名 → 输出格式（只放行图像类，别的直接 415）
thumb_format() {
  case "$(printf '%s' "$1" | tr 'A-Z' 'a-z')" in
    jpg|jpeg) printf 'jpg' ;;
    png)      printf 'png' ;;
    webp)     printf 'webp' ;;
    gif)      printf 'gif' ;;
    svg)      printf 'jpg' ;;
    avif|tiff|tif|bmp|ico|jxl) printf 'jpg' ;;
    *)        printf '' ;;
  esac
}

ctype_of() {
  case "$1" in
    jpg)  printf 'image/jpeg' ;;
    png)  printf 'image/png' ;;
    webp) printf 'image/webp' ;;
    gif)  printf 'image/gif' ;;
    *)    printf 'application/octet-stream' ;;
  esac
}

serve_thumb() { # $1=查询串（不含前导 ?，也不含结尾的 " HTTP/1.1"）
  if [ -z "$THUMB_TOOL" ]; then
    respond 503 'Service Unavailable' application/json '' '{"error":"no image toolchain on this host"}'
    return
  fi

  RAW_PATH=$(query_get "$1" path)
  WANT_W=$(query_get "$1" w)
  SCOPE=$(query_get "$1" root)

  [ -n "$RAW_PATH" ] || { respond 400 'Bad Request' application/json '' '{"error":"missing path"}'; return; }
  DECODED=$(url_decode "$RAW_PATH")

  # 安全闸门（顺序不能换）：必须绝对路径 ⇒ 不许出现 ".." 段 ⇒ 必须落在数据根内
  case "$DECODED" in
    /*) ;;
    *) respond 400 'Bad Request' application/json '' '{"error":"path must be absolute"}'; return ;;
  esac
  case "/$DECODED/" in
    */../*) respond 403 Forbidden application/json '' '{"error":"dotdot segment rejected"}'; return ;;
  esac
  # 控制字符必须挡掉：换行会污染我们随后要写的响应头。
  # 两个坑：① 别用 $(printf '\n') 存换行 —— 命令替换会吃掉尾随换行，条件恒真；
  #        ② 别用 grep '[[:cntrl:]]' —— 它是逐行匹配的，看不见"换行本身"。
  # 直接把控制字符删掉再比长度，才是可靠的判据。
  CTRL_CHECK=$(printf '%s' "$DECODED" | tr -d '\000-\037')
  if [ "$CTRL_CHECK" != "$DECODED" ]; then
    respond 400 'Bad Request' application/json '' '{"error":"control char"}'
    return
  fi

  # root=share ⇒ 只允许公开区子树（Caddy 在匿名侧的 handle 里硬塞这个参数，见 docs §4 可选 (4)）。
  # 放在"文件是否存在"之前：未登录者连"这个门禁区路径存在吗"都问不出来。
  case "$ANON_PREFIX" in
    /*) ;;
    *) ANON_PREFIX="/$ANON_PREFIX" ;;
  esac
  if [ "$SCOPE" = "share" ]; then
    case "$DECODED" in
      "$ANON_PREFIX"/*) ;;
      *) respond 403 Forbidden application/json '' '{"error":"outside public area"}'; return ;;
    esac
  fi

  TARGET="$ROOT$DECODED"
  if [ ! -f "$TARGET" ]; then
    respond 404 'Not Found' application/json '' '{"error":"no such file"}'
    return
  fi
  # 软链接也必须落在数据根内（escape.png -> /etc/passwd 这种直接拒）
  REAL=$(readlink -f -- "$TARGET" 2>/dev/null)
  case "$REAL" in
    "$ROOT"/*) ;;
    *) respond 403 Forbidden application/json '' '{"error":"outside data root"}'; return ;;
  esac

  EXT=${DECODED##*.}
  FMT=$(thumb_format "$EXT")
  [ -n "$FMT" ] || { respond 415 'Unsupported Media Type' application/json '' '{"error":"not an image"}'; return; }

  SIZE=$(wc -c < "$TARGET" | tr -d ' ')
  if [ "$SIZE" -gt "$MAX_SRC" ]; then
    respond 413 'Payload Too Large' application/json '' '{"error":"source too large"}'
    return
  fi

  W=$(pick_width "$WANT_W")
  MTIME=$(stat -c %Y -- "$TARGET" 2>/dev/null || printf '0')
  KEY=$(printf '%s|%s|%s|%s' "$REAL" "$MTIME" "$SIZE" "$W" | cksum | tr -dc '0-9')
  OUT="$CACHE_DIR/${KEY}.${FMT}"

  mkdir -p "$CACHE_DIR" 2>/dev/null || {
    respond 500 'Internal Server Error' application/json '' '{"error":"cache dir not writable"}'
    return
  }

  if [ ! -s "$OUT" ]; then
    TMP="$CACHE_DIR/.tmp-$$-${RANDOM:-0}.$FMT"
    case "$THUMB_TOOL" in
      vips)
        # vipsthumbnail：等比缩到 W 宽以内（">" = 不放大小图）；输出格式由 $TMP 扩展名决定
        vipsthumbnail "$REAL" --size="${W}x${W}>" -o "$TMP" >/dev/null 2>&1 ;;
      im)
        convert "$REAL" -background white -flatten -resize "${W}x${W}>" "$TMP" >/dev/null 2>&1 ;;
    esac
    if [ -s "$TMP" ]; then
      mv -f "$TMP" "$OUT" 2>/dev/null || { rm -f "$TMP"; }
    else
      rm -f "$TMP"
      respond 500 'Internal Server Error' application/json '' '{"error":"thumbnail generation failed"}'
      return
    fi
  fi

  respond_file "$(ctype_of "$FMT")" "$OUT"
}

# ---------- 读请求行 + 丢弃请求头 ----------
# 必须把头部读干净，否则连接提前重置（浏览器表现为图片裂开）。
IFS= read -r REQUEST_LINE
REQUEST_LINE=$(printf '%s' "$REQUEST_LINE" | tr -d '\r')
while IFS= read -r HEADER; do
  HEADER=$(printf '%s' "$HEADER" | tr -d '\r')
  [ -z "$HEADER" ] && break
done

# "GET /__lume__/thumb?path=%2Fa.png&w=256 HTTP/1.1" → 方法 / 纯路径 / 查询串三段
METHOD=${REQUEST_LINE%% *}
TARGET=${REQUEST_LINE#* }
TARGET=${TARGET%% *}
RAW_PATH=${TARGET%%\?*}
if [ "$TARGET" = "$RAW_PATH" ]; then QUERY=''; else QUERY=${TARGET#*\?}; fi

# 只接受 GET /__lume__/xxx
case "$METHOD $RAW_PATH" in
  'GET /__lume__/info')   serve_info ;;
  'GET /__lume__/thumb')  serve_thumb "$QUERY" ;;
  'GET /__lume__/'*)      respond 404 'Not Found' application/json '' '{"error":"unknown lume endpoint"}' ;;
  'GET '*)                respond 404 'Not Found' application/json '' '{"error":"not a lume endpoint"}' ;;
  *)                      respond 400 'Bad Request' application/json '' '{"error":"malformed request"}' ;;
esac
