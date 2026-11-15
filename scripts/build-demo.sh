#!/usr/bin/env bash
# 构建 GitHub Pages 用的演示版，输出到 dist-demo/（**不碰 dist/**）。
#
# 为什么要单独一个目录：线上发布走的是 `rsync -a --delete dist/ <你的 --assets 目录>/`，
# 素材一旦混进 dist/，下次发版就把几 MB 照片推到生产资源目录里去了。
#
# 与生产构建的三处差别：
#   1. index.html 里的 __ASSETS_PREFIX__ 换成 ./ —— 没有 dufs 来替换它，留着就是 404 白屏；
#   2. 拷入 demo/media → dist-demo/demo-media（演示目录树里的 demoMediaUrl 指的就是这里）；
#   3. 放一个 .nojekyll，免得 Pages 的 Jekyll 处理把下划线开头的文件吞掉。
#   window.__DUFS_RAW_INDEX_DATA__ 保持字面量 "__INDEX_DATA__" ⇒ 前端判定为演示模式（App.tsx 的 isDemoMode）。
#
# 用法：
#   scripts/build-demo.sh            # 构建
#   scripts/build-demo.sh --serve    # 构建完顺手起一个本地预览（127.0.0.1:8099）
set -euo pipefail

cd "$(dirname "$0")/.."
SRC=dist
OUT=dist-demo

command -v pnpm >/dev/null || { echo "! 没找到 pnpm" >&2; exit 1; }

echo "· 构建生产产物（dist/）……"
PATH="$PATH" pnpm build

echo "· 生成 $OUT/ ……"
rm -rf "$OUT"
cp -r "$SRC" "$OUT"

# 1) 资源前缀占位符 → 相对路径（Pages 可能挂在 /<repo>/ 子路径下，相对写法两边都对）
sed -i 's/__ASSETS_PREFIX__/.\//g' "$OUT/index.html"
if grep -q "__ASSETS_PREFIX__" "$OUT/index.html"; then
  echo "! index.html 里还残留 __ASSETS_PREFIX__" >&2
  exit 1
fi

# 2) 素材
if [ -d demo/media ] && [ -n "$(ls -A demo/media 2>/dev/null)" ]; then
  rm -rf "$OUT/demo-media"
  cp -r demo/media "$OUT/demo-media"
else
  echo "! demo/media 不存在或为空 ⇒ 演示目录树里的照片/视频/音频会 404（先跑 python3 demo/fetch.py 与 demo/make-files.py）" >&2
fi

# 3) Pages 需要的标记
: > "$OUT/.nojekyll"

# 4) 自检：目录树里声明的每个 demoMediaUrl 都得真在产物里
python3 - "$OUT" <<'PY'
import re, sys, pathlib
out = pathlib.Path(sys.argv[1])
html = (out / "index.html").read_text(encoding="utf-8")
js = next(iter(sorted(out.glob("lume-app.*.js"))), None)
if js is None:
    print("! 找不到 lume-app.*.js", file=sys.stderr); sys.exit(1)
src = js.read_text(encoding="utf-8", errors="ignore")
urls = set(re.findall(r"demo-media/[A-Za-z0-9._/\-]+", src))
missing = [u for u in sorted(urls) if not (out / u).exists()]
print(f"· 产物里引用 {len(urls)} 个素材路径，缺失 {len(missing)} 个")
for m in missing:
    print(f"  ! 缺 {m}", file=sys.stderr)
# index.html 的引用也要能落地（占位符已换成 ./）
for ref in re.findall(r'(?:href|src)="\.\/([^"]+)"', html):
    ref = ref.split("?")[0]
    if not (out / ref).exists():
        print(f"  ! index.html 指向的 {ref} 不在产物里", file=sys.stderr)
sys.exit(1 if missing else 0)
PY

total=$(du -sh "$OUT" | cut -f1)
echo "✓ 演示版就绪：$OUT/（$total）"
echo "  本地预览：python3 -m http.server --bind 127.0.0.1 8099 --directory $OUT"
echo "  部署：scripts/deploy-demo.sh <owner>/<repo>（该仓库必须已开 Pages，且是 public）"

if [ "${1:-}" = "--serve" ]; then
  echo "· 起本地预览 http://127.0.0.1:8099/ （Ctrl-C 结束）"
  exec python3 -m http.server --bind 127.0.0.1 8099 --directory "$OUT"
fi
