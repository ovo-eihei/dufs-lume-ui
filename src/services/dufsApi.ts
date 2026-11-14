import {
  AuthState,
  DufsIndexData,
  DufsPathItem,
  LumeBrandConfig,
  ServerInfo,
  ThumbsCapability,
} from '../types/dufs';
import { joinUrlPath } from '../utils/format';

export class DufsAuthError extends Error {
  status: number;
  redirectUrl?: string;

  constructor(status: number, message: string, redirectUrl?: string) {
    super(message);
    this.name = 'DufsAuthError';
    this.status = status;
    this.redirectUrl = redirectUrl;
  }
}

/** Raised when a file upload is explicitly cancelled by the user (`xhr.abort()`). */
export class UploadCancelledError extends Error {
  constructor(message = 'Upload cancelled by user') {
    super(message);
    this.name = 'UploadCancelledError';
  }
}

export function describeError(err: unknown): string {
  if (err instanceof DufsAuthError) {
    return `HTTP ${err.status}`;
  }
  if (err instanceof Error && err.message) {
    return err.message;
  }
  return String(err);
}

/**
 * Resolves runtime branding configuration injected into `index.html` by `docker/entrypoint-ui.sh`
 * (or set via `window.__LUME_BRAND__`). Safely ignores the raw `__LUME_BRAND_JSON__` placeholder
 * when running outside Docker.
 */
export function resolveBrandConfig(): LumeBrandConfig {
  if (typeof window === 'undefined') return {};
  try {
    const rawBrand = window.__LUME_BRAND__;
    if (rawBrand && typeof rawBrand === 'object') {
      return rawBrand;
    }
    if (typeof rawBrand === 'string') {
      const trimmed = rawBrand.trim();
      if (!trimmed || trimmed.includes('__LUME_BRAND' + '_JSON__')) {
        return {};
      }
      const parsed = JSON.parse(trimmed) as unknown;
      if (parsed && typeof parsed === 'object') {
        return parsed as LumeBrandConfig;
      }
    }
  } catch {
    // Ignore malformed JSON and fall back to built-in locale defaults
  }
  return {};
}

/**
 * Decodes the Base64-encoded UTF-8 JSON payload (`__INDEX_DATA__`) injected by Dufs into `index.html`.
 */
export function decodeDufsIndexData(rawBase64?: string): DufsIndexData | null {
  if (!rawBase64 || rawBase64 === '__INDEX' + '_DATA__' || rawBase64.includes('__INDEX_DATA__')) {
    return null;
  }
  try {
    const binary = atob(rawBase64);
    const bytes = Uint8Array.from(binary, (c) => c.charCodeAt(0));
    const jsonStr = new TextDecoder('utf-8').decode(bytes);
    return JSON.parse(jsonStr) as DufsIndexData;
  } catch {
    try {
      return JSON.parse(decodeURIComponent(escape(atob(rawBase64)))) as DufsIndexData;
    } catch {
      return null;
    }
  }
}

/**
 * Checks whether a `fetch` response was intercepted by a reverse-proxy authentication gateway (e.g., Caddy + TinyAuth).
 */
export function checkResponseAuthIntercepted(res: Response): {
  intercepted: boolean;
  status: number;
  redirectUrl?: string;
} {
  if (
    res.type === 'opaqueredirect' ||
    res.status === 301 ||
    res.status === 302 ||
    res.status === 303 ||
    res.status === 307 ||
    res.status === 308
  ) {
    const location = res.headers.get('Location') || undefined;
    return { intercepted: true, status: 302, redirectUrl: location };
  }
  if (res.status === 401 || res.status === 403) {
    const location = res.headers.get('X-TinyAuth-Login') || res.headers.get('Location') || undefined;
    return { intercepted: true, status: res.status, redirectUrl: location };
  }
  if (res.redirected && res.url) {
    const lowerUrl = res.url.toLowerCase();
    if (
      lowerUrl.includes('tinyauth') ||
      lowerUrl.includes('/login') ||
      lowerUrl.includes('/api/auth')
    ) {
      return { intercepted: true, status: 302, redirectUrl: res.url };
    }
  }
  return { intercepted: false, status: res.status };
}

/**
 * Fetches directory listing metadata via `GET /path/?json`.
 */
export async function fetchDirectoryJson(dirUrl: string): Promise<DufsIndexData> {
  const sep = dirUrl.includes('?') ? '&' : '?';
  let res: Response;
  try {
    res = await fetch(`${dirUrl}${sep}json`, {
      method: 'GET',
      headers: { Accept: 'application/json' },
      credentials: 'same-origin',
      redirect: 'manual',
      cache: 'no-store',
    });
  } catch {
    throw new DufsAuthError(302, 'Gateway redirect or network error while listing directory');
  }
  const authCheck = checkResponseAuthIntercepted(res);
  if (authCheck.intercepted) {
    throw new DufsAuthError(authCheck.status, 'Authentication required', authCheck.redirectUrl);
  }
  if (!res.ok) {
    throw new Error(`HTTP ${res.status}: ${res.statusText}`);
  }
  const data = (await res.json()) as DufsIndexData;
  // 盖一条「我在哪个目录」⇒ 之后所有 URL 由它拼，不再跟着当前页跑（跨目录播放/预览时当前页会变）
  const base = joinUrlPath(data.uri_prefix ?? '', data.href);
  return {
    ...data,
    paths: (data.paths ?? []).map((p) => ({ ...p, originBase: base })),
  };
}

/** Extension API endpoint for session verification, storage metrics, and capability discovery. */
export const LUME_INFO_API_PATH = '__lume__/info';

/** Extension API endpoint for on-demand server-side image thumbnail generation. */
export const LUME_THUMB_API_PATH = '__lume__/thumb';

/**
 * Query parameter appended when initiating sign-in (`/?login=1`).
 * Ensures the request remains routed through the reverse-proxy auth handler even when bare `GET /` redirects guests to `/share/`.
 */
export const LOGIN_QUERY_PARAM = 'login';

export function buildLoginUrl(rootUrl: string, customLoginUrl?: string): string {
  const trimmed = customLoginUrl?.trim();
  if (trimmed) return trimmed;
  const sep = rootUrl.includes('?') ? '&' : '?';
  return `${rootUrl}${sep}${LOGIN_QUERY_PARAM}=1`;
}

export function hasLoginQueryParam(): boolean {
  try {
    return new URL(window.location.href).searchParams.has(LOGIN_QUERY_PARAM);
  } catch {
    return false;
  }
}

export function stripLoginQueryParam(): void {
  try {
    const url = new URL(window.location.href);
    if (!url.searchParams.has(LOGIN_QUERY_PARAM)) return;
    url.searchParams.delete(LOGIN_QUERY_PARAM);
    const next = `${url.pathname}${url.search}${url.hash}`;
    window.history.replaceState(window.history.state, '', next);
  } catch {
    // Ignore in environments without History API support
  }
}

export function thumbsCapabilityEnabled(
  thumbs: ThumbsCapability | undefined | null
): boolean {
  if (thumbs === true) return true;
  if (thumbs && typeof thumbs === 'object' && thumbs.enabled === true) return true;
  return false;
}

function parseServerInfoPayload(data: unknown): ServerInfo | null {
  if (!data || typeof data !== 'object') return null;
  const cand = data as ServerInfo;
  if (typeof cand.free_bytes !== 'number') {
    return null;
  }
  return cand;
}

/**
 * Refreshes server storage metrics and capability flags (`GET /__lume__/info`).
 */
export async function fetchServerInfo(rootUrl: string): Promise<ServerInfo | null> {
  const normalizedRoot = rootUrl.endsWith('/') ? rootUrl : `${rootUrl}/`;
  try {
    const res = await fetch(`${normalizedRoot}${LUME_INFO_API_PATH}`, {
      method: 'GET',
      headers: { Accept: 'application/json' },
      credentials: 'same-origin',
      redirect: 'manual',
      cache: 'no-store',
    });
    if (checkResponseAuthIntercepted(res).intercepted) return null;
    if (!res.ok) return null;
    const data = (await res.json()) as unknown;
    return parseServerInfoPayload(data);
  } catch {
    return null;
  }
}

/**
 * Builds the request URL for `/__lume__/thumb`.
 * `absPath` is the site-relative path starting with `/` (excluding `uriPrefix`).
 */
export function buildThumbUrl(
  uriPrefix: string,
  absPath: string,
  width?: number,
  scope?: 'share' | 'full'
): string {
  const cleanPrefix = uriPrefix.endsWith('/') ? uriPrefix.slice(0, -1) : uriPrefix;
  const query = `path=${encodeURIComponent(absPath)}${
    width && width > 0 ? `&w=${width}` : ''
  }${scope === 'share' ? '&root=share' : ''}`;
  return `${cleanPrefix}/${LUME_THUMB_API_PATH}?${query}`;
}

/**
 * Combined startup probe (`GET /__lume__/info`):
 * 1. Requests `/__lume__/info` behind the auth gateway:
 *    - 302/401 interception -> `authState = 'anonymous'`
 *    - 200 OK JSON -> `authState = 'authenticated'` + populates `serverInfo`
 * 2. If `/__lume__/info` returns 404 (extension API not deployed), falls back to `GET /?simple` to determine session status.
 */
export async function probeAuthAndInfo(
  rootUrl: string
): Promise<{ authState: AuthState; serverInfo: ServerInfo | null }> {
  const normalizedRoot = rootUrl.endsWith('/') ? rootUrl : `${rootUrl}/`;
  try {
    const res = await fetch(`${normalizedRoot}${LUME_INFO_API_PATH}`, {
      method: 'GET',
      headers: { Accept: 'application/json' },
      credentials: 'same-origin',
      redirect: 'manual',
      cache: 'no-store',
    });
    if (checkResponseAuthIntercepted(res).intercepted) {
      return { authState: 'anonymous', serverInfo: null };
    }
    if (res.ok) {
      let info: ServerInfo | null = null;
      try {
        info = parseServerInfoPayload(await res.json());
      } catch {
        info = null;
      }
      return { authState: 'authenticated', serverInfo: info };
    }
    const sep = normalizedRoot.includes('?') ? '&' : '?';
    const fallbackRes = await fetch(`${normalizedRoot}${sep}simple`, {
      method: 'GET',
      credentials: 'same-origin',
      redirect: 'manual',
      cache: 'no-store',
    });
    if (checkResponseAuthIntercepted(fallbackRes).intercepted) {
      return { authState: 'anonymous', serverInfo: null };
    }
    return { authState: 'authenticated', serverInfo: null };
  } catch {
    return { authState: 'unknown', serverInfo: null };
  }
}

export interface UploadHandle {
  promise: Promise<void>;
  cancel: () => void;
}

export function uploadFileWithProgress(
  targetFileUrl: string,
  file: File,
  onProgress: (percent: number) => void
): UploadHandle {
  const xhr = new XMLHttpRequest();
  let aborted = false;
  let settled = false;

  const promise = new Promise<void>((resolve, reject) => {
    xhr.open('PUT', targetFileUrl, true);
    xhr.withCredentials = true;

    xhr.upload.onprogress = (event) => {
      if (event.lengthComputable && event.total > 0) {
        const percent = Math.round((event.loaded / event.total) * 100);
        onProgress(percent);
      }
    };

    xhr.onload = () => {
      if (settled) return;
      settled = true;
      const responseURL = xhr.responseURL || '';
      const isRedirectedToAuth =
        responseURL &&
        (responseURL.toLowerCase().includes('tinyauth') ||
          responseURL.toLowerCase().includes('/login') ||
          responseURL.toLowerCase().includes('/auth'));

      if (xhr.status === 401 || xhr.status === 403 || xhr.status === 302 || isRedirectedToAuth) {
        reject(
          new DufsAuthError(
            xhr.status === 200 ? 302 : xhr.status,
            'Auth intercepted',
            responseURL || undefined
          )
        );
        return;
      }

      if (xhr.status >= 200 && xhr.status < 300) {
        onProgress(100);
        resolve();
      } else {
        reject(new Error(`HTTP ${xhr.status}: ${xhr.statusText || 'Upload failed'}`));
      }
    };

    xhr.onabort = () => {
      if (settled) return;
      settled = true;
      reject(new UploadCancelledError());
    };

    xhr.onerror = () => {
      if (settled) return;
      if (aborted) {
        settled = true;
        reject(new UploadCancelledError());
        return;
      }
      reject(new DufsAuthError(302, 'Gateway redirect or network error during write operation'));
    };

    xhr.send(file);
  });

  return {
    promise,
    cancel: () => {
      if (settled) return;
      aborted = true;
      try {
        xhr.abort();
      } catch {
        // ignore
      }
    },
  };
}

/**
 * Creates a directory via WebDAV `MKCOL`.
 */
export async function createDirectoryMkcol(targetDirUrl: string): Promise<void> {
  let res: Response;
  try {
    res = await fetch(targetDirUrl, {
      method: 'MKCOL',
      redirect: 'manual',
      credentials: 'same-origin',
    });
  } catch {
    throw new DufsAuthError(302, 'Gateway redirect intercepted during MKCOL');
  }

  const authCheck = checkResponseAuthIntercepted(res);
  if (authCheck.intercepted) {
    throw new DufsAuthError(
      authCheck.status,
      'Authentication required for MKCOL',
      authCheck.redirectUrl
    );
  }

  if (!res.ok && res.status !== 201) {
    throw new Error(`HTTP ${res.status}: ${res.statusText}`);
  }
}

/**
 * Deletes a file or directory via `HTTP DELETE`.
 */
export async function deleteFileOrDirectory(
  targetUrl: string,
  ignoreNotFound = false
): Promise<void> {
  let res: Response;
  try {
    res = await fetch(targetUrl, {
      method: 'DELETE',
      redirect: 'manual',
      credentials: 'same-origin',
    });
  } catch {
    throw new DufsAuthError(302, 'Gateway redirect intercepted during DELETE');
  }

  if (ignoreNotFound && res.status === 404) {
    return;
  }

  const authCheck = checkResponseAuthIntercepted(res);
  if (authCheck.intercepted) {
    throw new DufsAuthError(
      authCheck.status,
      'Authentication required for DELETE',
      authCheck.redirectUrl
    );
  }

  if (!res.ok && res.status !== 204) {
    throw new Error(`HTTP ${res.status}: ${res.statusText}`);
  }
}

/**
 * Virtual directory tree used when running in interactive Demo Mode.
 */
export const DEMO_DIRECTORY_TREE: Record<string, DufsPathItem[]> = {
  '/': [
    {
      name: 'architecture-docs',
      path_type: 'Dir',
      mtime: 1762420800000,
    },
    {
      name: 'media-showcase',
      path_type: 'Dir',
      mtime: 1762395000000,
    },
    {
      name: 'releases',
      path_type: 'Dir',
      mtime: 1762280000000,
    },
    {
      name: 'README.md',
      path_type: 'File',
      size: 4820,
      mtime: 1762462000000,
      demoContent: `# Dufs Lume UI

**dufs-lume-ui** 是一个专为轻量级静态文件服务器 [Dufs](https://github.com/sigoden/dufs) 设计的现代化前端主题，通过 \`--assets\` 静态资源覆盖机制即插即用。

## 核心特性

- **双视图切换**：支持列表视图（List View）与网格卡片视图（Grid View），面包屑导航栏内置快捷返回上级按钮。
- **快捷键与批量打包**：支持 \`Ctrl/Cmd + 点击\` 切换选择、\`Shift + 点击\` 连续区间多选，以及客户端流式 ZIP 打包下载。
- **富媒体与沙箱网页预览**：支持图片、音视频、Markdown、PDF、代码高亮与默认沙箱隔离的 HTML 静态网页预览。
- **轻量级扩展接口**：通过 \`/__lume__/info\` 与 \`/__lume__/thumb\` 实现单次请求会话探测、存储空间统计与服务端缩略图按需生成。
`,
    },
    {
      name: 'index.html',
      path_type: 'File',
      size: 2480,
      mtime: 1762458000000,
      demoContent: `<!DOCTYPE html>
<html lang="zh-CN">
<head>
  <meta charset="UTF-8" />
  <title>Static Web Page Preview</title>
  <style>
    body {
      margin: 0;
      font-family: system-ui, -apple-system, sans-serif;
      background: linear-gradient(135deg, #0f172a 0%, #1e1b4b 100%);
      color: #f8fafc;
      min-height: 100vh;
      display: flex;
      align-items: center;
      justify-content: center;
    }
    .card {
      background: rgba(255, 255, 255, 0.07);
      border: 1px solid rgba(255, 255, 255, 0.15);
      border-radius: 20px;
      padding: 32px;
      max-width: 440px;
      text-align: center;
      box-shadow: 0 20px 50px rgba(0,0,0,0.4);
    }
    button {
      margin-top: 16px;
      padding: 10px 20px;
      border-radius: 12px;
      border: none;
      background: #6366f1;
      color: white;
      font-weight: 600;
      cursor: pointer;
    }
    button:hover { background: #4f46e5; }
  </style>
</head>
<body>
  <div class="card">
    <h2>HTML 静态页面内嵌预览</h2>
    <p>默认运行于隔离沙箱环境以保护站点凭据；关闭沙箱后可完整加载同目录相对资源。</p>
    <p id="counter">交互计数：0</p>
    <button onclick="window.count = (window.count || 0) + 1; document.getElementById('counter').textContent = '交互计数：' + window.count;">
      点我测试 JS 执行
    </button>
  </div>
</body>
</html>`,
    },
    {
      name: 'Caddyfile.conf',
      path_type: 'File',
      size: 1640,
      mtime: 1762410000000,
      demoContent: `# Caddy + TinyAuth + Lume 扩展接口配置示例
files.example.com {
    encode zstd gzip

    @gated {
        not path /share* /__dufs_v*
    }

    handle @gated {
        forward_auth tinyauth:3000 {
            uri /api/auth/caddy
            copy_headers Remote-User Remote-Email Remote-Name
        }

        handle /__lume__/* {
            reverse_proxy lume-info-api:8090
        }

        reverse_proxy dufs:5000
    }

    handle {
        reverse_proxy dufs:5000
    }
}
`,
    },
    {
      name: 'lume-wallpaper.svg',
      path_type: 'File',
      size: 28490,
      mtime: 1762350000000,
    },
    {
      name: 'synth-ambient-demo.wav',
      path_type: 'File',
      size: 384512,
      mtime: 1762310000000,
    },
    {
      name: 'lofi-chime-loop.wav',
      path_type: 'File',
      size: 512000,
      mtime: 1762305000000,
    },
    {
      name: 'dufs-deployment-guide.pdf',
      path_type: 'File',
      size: 1258291,
      mtime: 1762210000000,
    },
  ],
  '/architecture-docs/': [
    {
      name: 'auth-flow.md',
      path_type: 'File',
      size: 2310,
      mtime: 1762420800000,
      demoContent: `# 网关鉴权与扩展接口架构说明

1. **零数据目录写入**：扩展接口由 Caddy 将 \`/__lume__/*\` 转发至 POSIX \`sh\` 脚本实时返回数据，不在 Dufs 数据目录生成任何隐藏文件。
2. **单次合并探测**：前端启动时仅请求一次 \`GET /__lume__/info\`，既可根据网关 \`302/401\` 响应识别公开访客，也可在已登录时一次性获取磁盘可用容量与服务端缩略图能力。`,
    },
    {
      name: 'lume-info-api.sh',
      path_type: 'File',
      size: 960,
      mtime: 1762400000000,
      demoContent: `#!/bin/sh
# Lume 扩展接口示例（同时服务 /__lume__/info 与 /__lume__/thumb）
ROOT="\${DUFS_SERVE_PATH:-/data}"
set -- $(df -P -k "$ROOT" | tail -n 1)
FREE=$(( \${4:-0} * 1024 ))
DATA=$(( $(du -sk "$ROOT" 2>/dev/null | cut -f1) * 1024 ))

BODY=$(printf '{"free_bytes":%s,"data_bytes":%s}' "$FREE" "\${DATA:-0}")

printf "HTTP/1.1 200 OK\\r\\nContent-Type: application/json; charset=utf-8\\r\\nCache-Control: no-store\\r\\nContent-Length: %d\\r\\nConnection: close\\r\\n\\r\\n%s" \\
  "\${#BODY}" "$BODY"
`,
    },
  ],
  '/media-showcase/': [
    {
      name: 'aurora-poster.svg',
      path_type: 'File',
      size: 45120,
      mtime: 1762395000000,
    },
    {
      name: 'lofi-chime-loop.wav',
      path_type: 'File',
      size: 512000,
      mtime: 1762380000000,
    },
    {
      name: 'release-notes.txt',
      path_type: 'File',
      size: 980,
      mtime: 1762360000000,
      demoContent: `Dufs Lume UI v0.1.0 Release Notes
=================================
- Initial public release of Dufs Lume UI
- Responsive List and Grid views with parent directory navigation in breadcrumbs
- Real-time /__lume__/info and /__lume__/thumb extension APIs via POSIX shell script
- Sandboxed HTML preview mode with explicit user consent before同源 execution
- Client-side streaming ZIP packaging for multi-item selections
- Runtime branding customization via Docker environment variables`,
    },
  ],
  '/releases/': [
    {
      name: 'dufs-lume-ui-v0.1.0-dist.zip',
      path_type: 'File',
      size: 189440,
      mtime: 1762280000000,
    },
    {
      name: 'checksums.sha256',
      path_type: 'File',
      size: 256,
      mtime: 1762279000000,
      demoContent: `e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855  dufs-lume-ui-v0.1.0-dist.zip`,
    },
  ],
};
