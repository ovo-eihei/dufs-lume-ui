import { DufsPathItem, PreviewCategory } from '../types/dufs';

export function isDirectory(item: DufsPathItem): boolean {
  return item.path_type === 'Dir' || item.path_type === 'SymlinkDir';
}

export function formatBytes(bytes?: number): string {
  if (bytes === undefined || bytes === null || isNaN(bytes)) return '—';
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  const val = bytes / Math.pow(k, i);
  return `${val.toFixed(i === 0 ? 0 : val >= 100 ? 0 : 1)} ${sizes[i]}`;
}

export function formatDateTime(mtimeMs: number, locale: string = 'zh-CN'): string {
  if (!mtimeMs) return '—';
  // Dufs mtime is in milliseconds (if seconds, normalize)
  const ms = mtimeMs < 1e11 ? mtimeMs * 1000 : mtimeMs;
  const d = new Date(ms);
  const pad = (n: number) => String(n).padStart(2, '0');
  const yyyy = d.getFullYear();
  const mm = pad(d.getMonth() + 1);
  const dd = pad(d.getDate());
  const hh = pad(d.getHours());
  const min = pad(d.getMinutes());
  return locale.startsWith('zh')
    ? `${yyyy}-${mm}-${dd} ${hh}:${min}`
    : `${yyyy}-${mm}-${dd} ${hh}:${min}`;
}

export function getFileExtension(name: string): string {
  const idx = name.lastIndexOf('.');
  if (idx <= 0 || idx === name.length - 1) return '';
  return name.slice(idx + 1).toLowerCase();
}

const IMAGE_EXTS = new Set(['jpg', 'jpeg', 'png', 'gif', 'webp', 'svg', 'bmp', 'ico', 'avif']);
const VIDEO_EXTS = new Set(['mp4', 'webm', 'ogg', 'mov', 'm4v', 'mkv']);
const AUDIO_EXTS = new Set(['mp3', 'wav', 'flac', 'aac', 'm4a', 'oga', 'opus']);
const MARKDOWN_EXTS = new Set(['md', 'markdown', 'mdx']);
const PDF_EXTS = new Set(['pdf']);
const TEXT_EXTS = new Set([
  'txt', 'log', 'json', 'yaml', 'yml', 'toml', 'xml', 'csv', 'ini', 'conf', 'env',
  'js', 'jsx', 'ts', 'tsx', 'py', 'rs', 'go', 'c', 'cpp', 'h', 'java', 'sh', 'bash',
  'zsh', 'css', 'scss', 'sql', 'dockerfile', 'makefile', 'gitignore'
]);

// HTML 单独成类：以前归在 text 里只能看源码，现在默认当网页沙箱渲染（可切回源码）
const HTML_EXTS = new Set(['html', 'htm']);

export function getPreviewCategory(name: string): PreviewCategory {
  const ext = getFileExtension(name);
  const lower = name.toLowerCase();
  if (IMAGE_EXTS.has(ext)) return 'image';
  if (VIDEO_EXTS.has(ext)) return 'video';
  if (AUDIO_EXTS.has(ext)) return 'audio';
  if (MARKDOWN_EXTS.has(ext)) return 'markdown';
  if (PDF_EXTS.has(ext)) return 'pdf';
  if (HTML_EXTS.has(ext)) return 'html';
  if (TEXT_EXTS.has(ext) || lower === 'dockerfile' || lower === 'makefile' || lower === 'license' || lower === 'caddyfile') {
    return 'text';
  }
  return 'unsupported';
}

export function joinUrlPath(uriPrefix: string, href: string, itemName?: string, isDir?: boolean): string {
  const cleanPrefix = uriPrefix.endsWith('/') ? uriPrefix.slice(0, -1) : uriPrefix;
  const cleanHref = href.startsWith('/') ? href : `/${href}`;
  const normalizedHref = cleanHref.endsWith('/') ? cleanHref : `${cleanHref}/`;
  if (!itemName) {
    return `${cleanPrefix}${normalizedHref}`;
  }
  const encodedName = encodeURIComponent(itemName);
  const trailing = isDir ? '/' : '';
  return `${cleanPrefix}${normalizedHref}${encodedName}${trailing}`;
}

export function buildAbsoluteUrl(relativePath: string): string {
  try {
    return new URL(relativePath, window.location.origin).toString();
  } catch {
    return relativePath;
  }
}

/* ======================= 目录路径工具 ======================= */

/**
 * dufs 注入的 `href` 对子目录**不带尾斜杠**（实测 `GET /share/` 返回 `"href":"/share"`，
 * 根目录才是 `"/"`）⇒ 任何路径比较都必须先归一化，别直接拼字符串比。
 */
export function normalizeDirHref(href: string): string {
  const withLeading = href.startsWith('/') ? href : `/${href}`;
  return withLeading.endsWith('/') ? withLeading : `${withLeading}/`;
}

/** path 是否就是 root 或在 root 之下（两者都按目录语义比较，忽略尾斜杠差异） */
export function isSameOrUnder(path: string, root: string): boolean {
  const p = normalizeDirHref(path);
  const r = normalizeDirHref(root);
  return p === r || p.startsWith(r);
}

/** 把绝对目录路径换成「相对 root」的形式：root 本身 → '/'，root/a/b → '/a/b/' */
export function toRelativeHref(path: string, root: string): string {
  const p = normalizeDirHref(path);
  const r = normalizeDirHref(root);
  if (p === r) return '/';
  if (p.startsWith(r)) return `/${p.slice(r.length)}`;
  return p;
}

/** 把「相对 root」的路径还原成站点绝对路径 */
export function toAbsoluteHref(relHref: string, root: string): string {
  const r = normalizeDirHref(root);
  const rel = normalizeDirHref(relHref);
  if (r === '/') return rel;
  if (rel === '/') return r;
  return `${r}${rel.replace(/^\//, '')}`;
}

/**
 * 把用户输入的公开区路径整理成合法目录：补前导/尾斜杠，去掉连续斜杠与 '.' 段。
 * 空输入退化为 '/'（等于不限制）。
 */
export function sanitizeRootPath(input: string): string {
  const cleaned = (input || '')
    .split('/')
    .filter((seg) => seg.length > 0 && seg !== '.')
    .join('/');
  return cleaned ? `/${cleaned}/` : '/';
}

/**
 * 主题静态资源（public/ 下的文件）的 URL。
 * dufs 会把 index.html 里的 `__ASSETS_PREFIX__` 换成 `/__dufs_v<版本>__/`，运行时读
 * `window.__DUFS_ASSETS_PREFIX__`；vite dev / 演示模式没有被替换 ⇒ 回落成根路径（public/ 直接可取）。
 */
export function assetUrl(fileName: string): string {
  const raw = typeof window === 'undefined' ? undefined : window.__DUFS_ASSETS_PREFIX__;
  if (typeof raw === 'string' && raw.length > 0 && !raw.includes('__ASSETS_PREFIX__')) {
    return `${raw}${fileName}`;
  }
  return `/${fileName}`;
}
