import { Zip, ZipPassThrough } from 'fflate';
import { DufsPathItem, ZipJobProgress } from '../types/dufs';
import { isDirectory, joinUrlPath } from '../utils/format';
import { DufsAuthError, fetchDirectoryJson } from './dufsApi';

/**
 * 客户端打包：把「当前勾选的内容」压成一个 ZIP 下载。
 *
 * 为什么必须在浏览器里做：dufs 的 `?zip` 只能整目录打包，源码里
 * `handle_zip_dir(path)` 收的是**一个路径**（src/server.rs:670-707、1876-1930），
 * 没有任何"多个条目"的入口 ⇒ 勾选若干文件/目录要打包，只能前端自己拼 ZIP。
 *
 * 实现要点：
 * - `ZipPassThrough` = STORE（不压缩），边读边写，内存里只留当前 chunk；
 *   ZIP 的 CRC 由 fflate 算，用 data descriptor 回填，所以不需要预知大小。
 * - 输出走 `ReadableStream` → `Response.blob()`，大文件由浏览器落盘管理，
 *   不会把整个包攒在一个 JS 数组里。
 * - 目录用 `GET <dir>/?json` 递归展开（dufs 的 `?zip` 是递归的，勾选目录必须给同样的结果）。
 */

/** 递归展开的硬上限：超过就截断并提示用户减少勾选，避免把浏览器拖死 */
export const MAX_ZIP_ENTRIES = 2000;
const MAX_RECURSE_DEPTH = 8;

export interface ZipPlanItem {
  /** ZIP 内的相对路径，用 '/' 分隔（fflate 约定） */
  relPath: string;
  /** 取原始字节的完整 URL */
  url: string;
  size: number;
}

export interface ZipPlan {
  items: ZipPlanItem[];
  totalBytes: number;
  truncated: boolean;
}

async function expandDirectory(
  dirHref: string,
  relPrefix: string,
  depth: number,
  plan: ZipPlanItem[],
  state: { truncated: boolean }
): Promise<void> {
  if (state.truncated || depth > MAX_RECURSE_DEPTH) {
    state.truncated = true;
    return;
  }
  const data = await fetchDirectoryJson(dirHref);
  const children = [...(data.paths || [])].sort((a, b) => a.name.localeCompare(b.name));
  for (const child of children) {
    if (state.truncated) return;
    if (plan.length >= MAX_ZIP_ENTRIES) {
      state.truncated = true;
      return;
    }
    const childIsDir = isDirectory(child);
    const rel = `${relPrefix}${child.name}`;
    // dirHref 已带 uri_prefix ⇒ 这里前缀传空串，只追加名字（joinUrlPath 会 percent-encode）
    if (childIsDir) {
      await expandDirectory(
        joinUrlPath('', dirHref, child.name, true),
        `${rel}/`,
        depth + 1,
        plan,
        state
      );
    } else {
      plan.push({
        relPath: rel,
        url: joinUrlPath('', dirHref, child.name, false),
        size: child.size || 0,
      });
    }
  }
}

/**
 * 把勾选条目展开成"待打包文件清单"。
 * @param selectedItems 当前目录里被勾选的条目
 * @param currentHref   当前目录（绝对，形如 `/share/sub/`）
 * @param uriPrefix     dufs 的 uri_prefix
 */
export async function planSelectionZip(
  selectedItems: DufsPathItem[],
  currentHref: string,
  uriPrefix: string
): Promise<ZipPlan> {
  const items: ZipPlanItem[] = [];
  const state = { truncated: false };

  const sorted = [...selectedItems].sort((a, b) => a.name.localeCompare(b.name));
  for (const item of sorted) {
    if (state.truncated) break;
    if (items.length >= MAX_ZIP_ENTRIES) {
      state.truncated = true;
      break;
    }
    if (isDirectory(item)) {
      const dirHref = joinUrlPath(uriPrefix, currentHref, item.name, true);
      await expandDirectory(dirHref, `${item.name}/`, 1, items, state);
    } else {
      items.push({
        relPath: item.name,
        url: joinUrlPath(uriPrefix, currentHref, item.name, false),
        size: item.size || 0,
      });
    }
  }

  return {
    items,
    totalBytes: items.reduce((sum, it) => sum + it.size, 0),
    truncated: state.truncated,
  };
}

async function appendOneFile(zip: Zip, item: ZipPlanItem): Promise<void> {
  const res = await fetch(item.url, {
    method: 'GET',
    credentials: 'same-origin',
    redirect: 'manual',
  });
  if (res.type === 'opaqueredirect') {
    throw new DufsAuthError(302, `Authentication required for ${item.relPath}`);
  }
  if (!res.ok) {
    throw new Error(`HTTP ${res.status}: ${item.relPath}`);
  }

  const entry = new ZipPassThrough(item.relPath);
  zip.add(entry);

  if (!res.body || typeof res.body.getReader !== 'function') {
    const buf = new Uint8Array(await res.arrayBuffer());
    entry.push(buf, true);
    return;
  }

  const reader = res.body.getReader();
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    if (value && value.length > 0) entry.push(value, false);
  }
  entry.push(new Uint8Array(0), true);
}

/**
 * 按计划流式生成 ZIP blob。单个文件读失败只跳过并计数，不毁掉整包。
 */
export async function buildSelectionZipBlob(
  plan: ZipPlanItem[],
  onProgress: (p: ZipJobProgress) => void
): Promise<{ blob: Blob; skipped: number }> {
  let skipped = 0;
  let bytesOut = 0;

  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      const zip = new Zip((err, data) => {
        if (err) {
          controller.error(err);
          return;
        }
        bytesOut += data.length;
        controller.enqueue(data);
      });

      (async () => {
        let done = 0;
        for (const item of plan) {
          onProgress({ done, total: plan.length, bytes: bytesOut, current: item.relPath });
          try {
            await appendOneFile(zip, item);
          } catch {
            skipped += 1;
          }
          done += 1;
        }
        onProgress({ done, total: plan.length, bytes: bytesOut, current: '' });
        zip.end();
        controller.close();
      })().catch((err) => controller.error(err));
    },
  });

  const blob = await new Response(stream).blob();
  return { blob, skipped };
}

export function triggerBlobDownload(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 30000);
}

/** 打包文件名：文件分享-20260101-0835.zip */
export function buildZipFileName(now: Date = new Date()): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  return `文件分享-${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}-${pad(
    now.getHours()
  )}${pad(now.getMinutes())}.zip`;
}
