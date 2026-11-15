#!/usr/bin/env bash
# 把 dist-demo/ 推到某个仓库的 gh-pages 分支（GitHub Pages 静态站点）。
#
# ⚠ 前置：目标仓库必须是 **public** 且开了 Pages（Pages 的源 = Deploy from a branch / gh-pages）。
#   源仓库 ovo-eihei/dufs-lume-ui 只要本身是 public，就直接推它自己的 gh-pages；也可以另建一个
#   只放演示站的公开仓库（例如 ovo-eihei/lume-demo）。
#   脚本会当场查一次可见性，private 就直接拒绝，不会把东西推上去。
#
# 用法：
#   scripts/deploy-demo.sh ovo-eihei/lume-demo            # 构建（若缺产物）+ 推 gh-pages
#   scripts/deploy-demo.sh ovo-eihei/lume-demo --dry-run  # 只打印将要做什么
set -euo pipefail

cd "$(dirname "$0")/.."
REPO="${1:-}"
DRY="${2:-}"

[ -n "$REPO" ] || { echo "用法：$0 <owner>/<repo> [--dry-run]" >&2; exit 2; }
[[ "$REPO" == */* ]] || { echo "! 要给全名，例如 ovo-eihei/lume-demo" >&2; exit 2; }

vis=$(gh api "repos/$REPO" --jq '.private' 2>/dev/null) || {
  echo "! 读不到 $REPO（不存在，或 token 没权限）" >&2; exit 1;
}
if [ "$vis" = "true" ]; then
  echo "! $REPO 是 private ⇒ GitHub Pages（免费版）不会公开渲染，推上去也看不到。换一个 public 仓库。" >&2
  exit 1
fi

if [ ! -f dist-demo/index.html ]; then
  echo "· 没有 dist-demo/，先构建……"
  [ "$DRY" = "--dry-run" ] || scripts/build-demo.sh
fi

say() { echo "${DRY:+[dry-run] }$*"; }

TMP=$(mktemp -d)
trap 'rm -rf "$TMP"' EXIT

say "初始化 $TMP（gh-pages 孤儿分支）"
[ "$DRY" = "--dry-run" ] || {
  git -C "$TMP" init -q
  git -C "$TMP" config user.name ovo-agentx
  git -C "$TMP" config user.email 351813579+ovo-agentx@users.noreply.github.com
  cp -r dist-demo/. "$TMP"/
  rm -rf "$TMP/.git"
  git -C "$TMP" checkout -q -b gh-pages
  git -C "$TMP" add -A
  git -C "$TMP" commit -q -m "演示版 $(date -u +%Y-%m-%dT%H:%MZ)（$(git rev-parse --short HEAD) 的产物）"
}

say "推送 $(git -C "$TMP" rev-parse --short HEAD) → github.com/$REPO 的 gh-pages"
if [ "$DRY" = "--dry-run" ]; then
  echo "  将推送的文件数：$(find dist-demo -type f | wc -l)，体积 $(du -sh dist-demo | cut -f1)"
  echo "  （--dry-run 不写任何东西）"
  exit 0
fi
git -C "$TMP" push -q --force "https://x-access-token:$(gh auth token)@github.com/$REPO.git" gh-pages:gh-pages

owner="${REPO%/*}"; name="${REPO#*/}"
html=$(gh api "repos/$REPO/pages" --jq '.html_url' 2>/dev/null || true)
if [ -n "$html" ]; then
  echo "✓ 已推 gh-pages（$(git -C "$TMP" rev-parse --short HEAD)），站点：$html"
else
  echo "✓ 已推 gh-pages，但该仓库还没开 Pages。开法二选一："
  echo "  · 网页：Settings → Pages → Source = Deploy from a branch → 分支 gh-pages / 根目录"
  echo "  · 命令：gh api -X POST repos/$REPO/pages -f 'source[branch]=gh-pages' -f 'source[path]=/'"
  echo "  开好后地址一般是 https://$owner.github.io/$name/"
fi
