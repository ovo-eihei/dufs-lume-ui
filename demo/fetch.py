#!/usr/bin/env python3
"""
下载演示素材到 demo/media/，供 README 截图与 GitHub Pages 演示版使用。

为什么从 Wikimedia Commons 取：这里的文件带机器可读的许可元数据，脚本能当场把
「不可再分发」的挡掉（只留公有领域 / CC0 / CC-BY / CC-BY-SA / free use），并把来源页、
许可、作者写进 demo/manifest.json ⇒ README 要署名就有据可查。
Unsplash / Pexels 那类站点的许可不允许把原图再分发进仓库 ⇒ 不用。

照片一律取 Commons 的 **1280 px 缩放版**（不是原图）：原图普遍 4–12 MB，仓库和 Pages
都不该背这个体积；1280 px 的 JPEG 约 150–300 KB，截图里也够清楚。

用法：
    python3 demo/fetch.py                # 全量（已存在且非 --force 的跳过）
    python3 demo/fetch.py --force        # 全部重下
    python3 demo/fetch.py --list         # 只解析候选、不下载
    python3 demo/fetch.py photos/aurora  # 只处理目标路径前缀匹配的条目

对 Commons 客气：每次 API 调用之间 sleep(API_SLEEP)，别拿并发去打它（429 会被限流）。
"""

from __future__ import annotations

import argparse
import hashlib
import json
import re
import sys
import time
import urllib.parse
import urllib.request
from pathlib import Path

API = "https://commons.wikimedia.org/w/api.php"
UA = "dufs-lume-ui demo assets (repo ovo-eihei/dufs-lume-ui)"
API_SLEEP = 2.5  # 秒；实测连打三次就会被 429
THUMB_WIDTH = 1280

# 允许再分发的许可（按 LicenseShortName 前缀，小写比较）
ALLOWED = ("public domain", "pd", "cc0", "cc0 released", "cc by", "cc-by", "cc by-sa", "cc-by-sa",
           "cc synthesis", "copyrighted free use", "free use", "gfdl")

# 素材清单。title = 钉死的 Commons 文件名（可复核、可重跑）；没有 title 就退回 search 现搜。
TARGETS: list[dict] = [
    {"path": "photos/aurora-norway.jpg", "kind": "image",
     "title": "File:Aurora Borealis NO.JPG"},
    {"path": "photos/tokyo-night.jpg", "kind": "image",
     "title": "File:Tokyo night view 1 (cropped).jpg"},
    {"path": "photos/namib-dunes.jpg", "kind": "image",
     "title": "File:Sossusvlei Dune Namib Desert Namibia Luca Galuzzi 2004.JPG"},
    {"path": "photos/forest-fog.jpg", "kind": "image",
     "search": "filetype:bitmap forest path fog morning trees"},
    {"path": "photos/macro-wing.jpg", "kind": "image",
     "title": "File:Broken Wing (178594907).jpeg"},
    {"path": "photos/mountain-lake.jpg", "kind": "image",
     "title": "File:Riffel Lake and Monte Rosa, Valais, Alps of, Switzerland.jpg"},
    {"path": "photos/cat-eye.jpg", "kind": "image",
     "title": "File:Blue cat eye close up.jpg"},
    {"path": "photos/spiral-staircase.jpg", "kind": "image",
     "title": "File:Spiral Staircase (227905273).jpeg"},
    {"path": "video/traffic-light.webm", "kind": "video", "max_bytes": 3_000_000,
     "title": "File:Cyclist-controlled traffic light phases.webm"},
    {"path": "audio/orchestra-1910.ogg", "kind": "audio", "max_bytes": 2_000_000,
     "title": "File:Victor Herbert Orchestra - 13 - 1910 - Spanish.ogg"},
    {"path": "audio/piano-phrase.wav", "kind": "audio", "max_bytes": 1_000_000,
     "title": "File:Piano-phrase.wav"},
]


def api(params: dict) -> dict:
    """一次 Commons API GET（带 UA、429/网络错误重试两次）。"""
    url = API + "?" + urllib.parse.urlencode({"format": "json", **params})
    req = urllib.request.Request(url, headers={"User-Agent": UA})
    for attempt in (1, 2, 3):
        try:
            with urllib.request.urlopen(req, timeout=40) as resp:
                time.sleep(API_SLEEP)
                return json.load(resp)
        except Exception as err:  # noqa: BLE001
            if attempt == 3:
                print(f"    ! API 失败：{err}", file=sys.stderr)
                return {}
            time.sleep(API_SLEEP * attempt * 2)
    return {}


def strip_html(value: str) -> str:
    return re.sub(r"<[^>]+>", "", value or "").strip()


def to_candidate(page: dict) -> dict | None:
    """把一条查询结果整理成候选；许可不可再分发就返回 None。"""
    infos = page.get("imageinfo") or []
    if not infos:
        return None
    info = infos[0]
    meta = info.get("extmetadata") or {}
    license_short = strip_html((meta.get("LicenseShortName") or {}).get("value", ""))
    if not any(license_short.lower().startswith(k) for k in ALLOWED):
        return None
    return {
        "title": page.get("title", ""),
        "url": info.get("url", ""),
        "page": info.get("descriptionurl", ""),
        "mime": info.get("mime", ""),
        "bytes": int(info.get("size") or 0),
        "license": license_short or "（未标注）",
        "author": strip_html((meta.get("Artist") or {}).get("value", "")),
    }


def resolve(targets: list[dict], dry: bool) -> dict[str, dict]:
    """按 title 批量解析（一次 API 调用能带 50 个标题），search 条目单独搜。"""
    out: dict[str, dict] = {}
    titles = {t["title"]: t for t in targets if t.get("title")}
    if titles:
        data = api({
            "action": "query",
            "titles": "|".join(titles),
            "prop": "imageinfo",
            "iiprop": "url|size|mime|extmetadata",
            "redirects": 1,
        })
        for page in (data.get("query") or {}).get("pages", {}).values():
            want = page.get("title", "")
            cand = to_candidate(page)
            if cand and want in titles:
                out[titles[want]["path"]] = cand
            elif page.get("missing") is not None:
                print(f"    ! 标题不存在：{want}")

    for t in targets:
        if t["path"] in out or not t.get("search"):
            continue
        data = api({
            "action": "query",
            "generator": "search",
            "gsrsearch": t["search"],
            "gsrlimit": 12,
            "gsrnamespace": 6,
            "prop": "imageinfo",
            "iiprop": "url|size|mime|extmetadata",
        })
        cands = [c for c in (to_candidate(p) for p in (data.get("query") or {}).get("pages", {}).values()) if c]
        if t["kind"] == "image":
            cands = [c for c in cands if c["mime"] == "image/jpeg"]
        elif t["kind"] == "video":
            cands = [c for c in cands if c["mime"] in ("video/webm", "video/mp4")]
        else:
            cands = [c for c in cands if c["mime"].startswith("audio/")]
        if t.get("max_bytes"):
            cands = [c for c in cands if c["bytes"] <= t["max_bytes"]]
        if not cands:
            continue
        # 照片挑最接近 300 KB 的（原图大小和缩放版大小强相关），音视频挑最小的
        cands.sort(key=lambda c: abs(c["bytes"] - 300_000) if t["kind"] == "image" else c["bytes"])
        out[t["path"]] = cands[0]
    return out


def thumb_url(title: str) -> str | None:
    """照片取 1280 px 缩放版的地址（省体积，也免得把几 MB 原图塞进仓库）。"""
    data = api({
        "action": "query",
        "titles": title,
        "prop": "imageinfo",
        "iiprop": "url",
        "iiurlwidth": THUMB_WIDTH,
    })
    for page in (data.get("query") or {}).get("pages", {}).values():
        info = (page.get("imageinfo") or [{}])[0]
        if info.get("thumburl"):
            return info["thumburl"]
    return None


def download(url: str, dest: Path) -> tuple[int, str]:
    req = urllib.request.Request(url, headers={"User-Agent": UA})
    try:
        with urllib.request.urlopen(req, timeout=120) as resp:
            blob = resp.read()
    except Exception as err:  # noqa: BLE001
        print(f"    ! 下载失败：{err}", file=sys.stderr)
        return 0, ""
    if not blob:
        return 0, ""
    dest.parent.mkdir(parents=True, exist_ok=True)
    dest.write_bytes(blob)
    time.sleep(1.0)
    return len(blob), hashlib.sha256(blob).hexdigest()


def main() -> int:
    ap = argparse.ArgumentParser(description="下载演示素材（Wikimedia Commons，只取可再分发许可）")
    ap.add_argument("--force", action="store_true", help="已存在的文件也重下")
    ap.add_argument("--list", action="store_true", dest="dry", help="只解析候选，不下载")
    ap.add_argument("only", nargs="?", help="只处理目标路径前缀匹配的条目，例如 photos/aurora")
    args = ap.parse_args()

    root = Path(__file__).resolve().parent
    media = root / "media"
    targets = [t for t in TARGETS if not args.only or t["path"].startswith(args.only)]

    manifest: dict = {}
    if (root / "manifest.json").exists():
        manifest = json.loads((root / "manifest.json").read_text(encoding="utf-8"))

    need = [t for t in targets if not (media / t["path"]).exists() or args.force]
    if need:
        print(f"解析 {len(need)} 条素材的来源……")
        resolved = resolve(need, args.dry)
    else:
        resolved = {}

    total = 0
    for t in targets:
        dest = media / t["path"]
        cand = resolved.get(t["path"])
        if dest.exists() and not (args.force and cand):
            blob = dest.read_bytes()
            print(f"= {t['path']} 已存在（{len(blob):,} B）")
            total += len(blob)
            continue
        if not cand:
            print(f"✗ {t['path']}：没解析到可再分发的来源")
            continue
        if t["kind"] == "image":
            url = thumb_url(cand["title"]) or cand["url"]
            dest = dest.with_suffix(".jpg")
        else:
            url = cand["url"]
            ext = Path(urllib.parse.urlparse(cand["url"]).path).suffix
            if ext:
                dest = dest.with_suffix(ext)
        if args.dry:
            print(f"· {t['path']} → {dest.name} ← {cand['title']}（{cand['license']}，原图 {cand['bytes']:,} B）")
            continue
        size, sha = download(url, dest)
        if not size:
            continue
        if t.get("max_bytes") and size > t["max_bytes"]:
            print(f"    ! 落地 {size:,} B 超过上限，删除")
            dest.unlink()
            continue
        rel = str(dest.relative_to(media))
        manifest[rel] = {
            "source_title": cand["title"],
            "page": cand["page"],
            "original": cand["url"],
            "license": cand["license"],
            "author": cand["author"],
            "mime": cand["mime"],
            "bytes": size,
            "sha256": sha,
        }
        print(f"✓ {rel}  {size:,} B  ← {cand['title']}（{cand['license']}）")
        total += size

    if not args.dry:
        (root / "manifest.json").write_text(
            json.dumps(manifest, ensure_ascii=False, indent=2, sort_keys=True) + "\n", encoding="utf-8"
        )
        print(f"\ndemo/media 合计 {total:,} B，清单 {len(manifest)} 条 → demo/manifest.json")
    return 0


if __name__ == "__main__":
    sys.exit(main())
