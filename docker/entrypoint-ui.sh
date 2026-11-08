#!/bin/sh
# UI 容器启动：只做一件事 —— 把 .env 里的品牌写进 index.html，然后把控制权交给 dufs。
#
# 为什么必须在容器里改：dufs 只在 Server::new() 读一次 assets/index.html，之后每请求
# 直读 JS/CSS ⇒ 品牌只能在这份 index.html 落进磁盘之前写完，改完必须重启容器。
#
# 为什么这里不拼 dufs 的命令行：dufs 0.47 起**每个选项都能用 DUFS_ 前缀的环境变量给**
# （README §Environment variables），镜像里已把 serve 路径/监听/资产目录烘进 ENV，
# 用户在 .env 里写 DUFS_AUTH、DUFS_ALLOW_UPLOAD 即可，不需要本脚本代劳。
#
# 非 docker 部署（直接 rsync dist/ 给 dufs --assets）不会跑这个脚本，
# index.html 里会留下字面量 __LUME_BRAND_JSON__ ⇒ 前端把它当"未配置"处理，用内置默认值。

IDX=/assets/index.html
[ -f "$IDX" ] || { echo "找不到 $IDX（构建阶段没产出 dist？）" >&2; exit 1; }

# JSON 里只允许这些字符，把值里的双引号和反斜杠挡掉，别让人把 .env 写成注入点
esc() { printf '%s' "$1" | tr -d '\000-\037' | sed 's/\\/\\\\/g; s/"/\\"/g'; }

BRAND=$(printf '{"title":"%s","subtitle":"%s","icon":"%s","loginUrl":"%s"}' \
  "$(esc "${LUME_TITLE:-}")" "$(esc "${LUME_SUBTITLE:-}")" \
  "$(esc "${LUME_ICON:-}")" "$(esc "${LUME_LOGIN_URL:-}")")

sed -i "s|__LUME_BRAND_JSON__|$BRAND|" "$IDX"

exec dufs "$@"
