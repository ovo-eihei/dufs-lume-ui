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
# index.html 里会留下字面量占位符 ⇒ 前端把它当"未配置"处理，用内置默认值。
# （自己 rsync 又想带品牌的，在 rsync 之后、重启 dufs 之前把 assets/index.html 里那个
#  单引号字面量换成 '{"title":"…","subtitle":"…","icon":"","loginUrl":""}'，再 systemctl restart dufs
#  —— dufs 只在启动时读一次 index.html，改完必须重启。）

IDX=/assets/index.html
[ -f "$IDX" ] || { echo "找不到 $IDX（构建阶段没产出 dist？）" >&2; exit 1; }

# 值要穿两层：① JSON 字符串（`\`→`\\`、`"`→`\"`、`<`→`\u003c`，防 `</script>` 提前结束脚本块）；
# ② JS 单引号字面量（`\`→`\\`、`'`→`\'`）。控制字符直接删，别让人把 .env 写成注入点。
# 顺序不能倒：先 esc 造出合法 JSON，再 jsq 把 JSON 里的反斜杠抬一层。
esc() { printf '%s' "$1" | tr -d '\000-\037' | sed -e 's/\\/\\\\/g' -e 's/"/\\"/g' -e 's/</\\u003c/g'; }
jsq() { printf '%s' "$1" | sed -e 's/\\/\\\\/g' -e "s/'/\\\\'/g"; }
b() { jsq "$(esc "$1")"; }   # b = brand field

BRAND=$(printf '{"title":"%s","subtitle":"%s","icon":"%s","loginUrl":"%s"}' \
  "$(b "${LUME_TITLE:-}")" "$(b "${LUME_SUBTITLE:-}")" \
  "$(b "${LUME_ICON:-}")" "$(b "${LUME_LOGIN_URL:-}")")

# 替换占位符：用 awk 逐行拼接，**不用 sed**。
# sed 的替换串自己还要吃一层转义（`\\`→`\`、`\'`→`'`、`&`→整段匹配），
# 上面 esc() 做的转义会被它原样吐掉，品牌里带引号/反斜杠/& 时直接产出非法 JS，
# 而整个 <script> 块一旦语法错误，连 __INDEX_DATA__ 的赋值一起失效（页面退化成演示模式）。
# awk 的 substr 拼接不看替换串里的反斜杠；品牌值走 getline 从临时文件读，全程字面量。
TMP=$(mktemp) || exit 1
printf '%s' "$BRAND" > "$TMP"
awk -v bf="$TMP" '
  BEGIN { getline brand < bf; close(bf); tok = "__LUME_BRAND_JSON__"; n = length(tok) }
  {
    p = index($0, tok)
    if (p) printf "%s%s%s\n", substr($0, 1, p - 1), brand, substr($0, p + n)
    else print
  }
' "$IDX" > "$IDX.awk-tmp" || { rm -f "$TMP"; exit 1; }
cat "$IDX.awk-tmp" > "$IDX"
rm -f "$IDX.awk-tmp" "$TMP"

exec dufs "$@"
