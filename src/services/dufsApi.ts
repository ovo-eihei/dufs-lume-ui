import { AuthState, DufsIndexData, DufsPathItem, ServerInfo, ThumbsCapability } from '../types/dufs';

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

/** 用户主动取消上传（XHR abort）—— 与鉴权拦截、网络错误分开，调用方才能只清理残留而不弹登录引导 */
export class UploadCancelledError extends Error {
  constructor(message = 'Upload cancelled by user') {
    super(message);
    this.name = 'UploadCancelledError';
  }
}

/**
 * 把任意异常换成能给人看的短句（带 HTTP 状态码）。
 */
export function describeError(err: unknown): string {
  if (err instanceof DufsAuthError) {
    return `HTTP ${err.status} 需要登录`;
  }
  if (err instanceof Error && err.message) {
    return err.message;
  }
  return String(err);
}

/**
 * 解码 Dufs 注入到 index.html 中的 Base64 UTF-8 JSON 数据 (`__INDEX_DATA__`)
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
 * 判断 fetch 响应是否被 Caddy + TinyAuth 反向代理鉴权拦截
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
 * 获取指定目录的 JSON 数据 (`GET /path/?json`)
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
  return (await res.json()) as DufsIndexData;
}

/**
 * 扩展 API 路由：由 Caddy 匹配 `/__lume__/info` 并反代至宿主/容器内极简 sh 脚本实时输出 JSON。
 * v1.2.x 叫 `/__lume__/disk`；v1.3.0 改名 —— 它返回的不只是磁盘水位，而是「服务端概况 + 能力位」。
 */
export const LUME_INFO_API_PATH = '__lume__/info';

/** 服务端缩略图端点（同一个扩展脚本按请求行分流） */
export const LUME_THUMB_API_PATH = '__lume__/thumb';

/**
 * 登录入口查询参数（F3a）：
 * Caddy 把未登录的 `GET /` 直接 302 到公开区 `/share/`，所以“去登录”不能再靠“访问 `/`”，
 * 必须带 `?login=1` 让这个请求保持受保护 ⇒ 由 forward_auth 弹给认证中心。
 */
export const LOGIN_QUERY_PARAM = 'login';

/** 把站点根 URL 换成“登录入口” URL（带 `?login=1`） */
export function buildLoginUrl(rootUrl: string): string {
  const sep = rootUrl.includes('?') ? '&' : '?';
  return `${rootUrl}${sep}${LOGIN_QUERY_PARAM}=1`;
}

/** 当前地址栏是否带着登录入口参数（app 启动后会把 URL 洗回去） */
export function hasLoginQueryParam(): boolean {
  try {
    return new URL(window.location.href).searchParams.has(LOGIN_QUERY_PARAM);
  } catch {
    return false;
  }
}

/** 把 URL 里的登录入口参数抹掉（只改地址栏，不重新拉取页面） */
export function stripLoginQueryParam(): void {
  try {
    const url = new URL(window.location.href);
    if (!url.searchParams.has(LOGIN_QUERY_PARAM)) return;
    url.searchParams.delete(LOGIN_QUERY_PARAM);
    const next = `${url.pathname}${url.search}${url.hash}`;
    window.history.replaceState(window.history.state, '', next);
  } catch {
    // 不支持 URL/History 的环境：什么都不做，参数留着也不影响功能
  }
}

/** 把 `thumbs` 能力位归一化成布尔（兼容 `true` / `{enabled:true}` / 缺省=不支持） */
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
 * 单独刷新服务端概况（磁盘面板上的刷新按钮调用）。
 * 被网关拦（未登录）时返回 null，调用方自己处理“没数据”。
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
 * 拼服务端缩略图 URL。`absPath` = 以 `/` 开头的站内绝对路径（不含 uri_prefix）。
 * “锁在数据根内 + `root=share` 时只允许 `/share/` 子树”由扩展脚本自己把关，前端只负责把路径递过去。
 */
/**
 * `scope` = 期望的作用域：`share` 表示"我是未登录访客，只准取公开区"。
 * 脚本对 `root=share` 的请求会硬拦在 `DUFS_ANON_PREFIX` 子树内，所以这个参数
 * 是给服务端看的约束声明，不是权限凭证（真权限仍由 Caddy 的 handle 决定）。
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
 * 启动时的单次合并探测 `GET /__lume__/info`：
 * 1. 先请求受网关保护的 `/__lume__/info`：
 *    - 被 302/401 拦截 ⇒ 直接判定 `anonymous`（未登录），无需第二次请求；
 *    - 返回 200 JSON ⇒ 判定 `authenticated`，同时拿到磁盘水位与服务端能力位，一次请求三件事；
 * 2. 返回 404 说明当前站点尚未在 Caddy 中配置 `/__lume__/info` 扩展脚本，
 *    自动回退请求一次轻量 `GET /?simple` 判断登录态。
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
    // 404 等状态说明未配置 /__lume__/info 扩展 API，回退至 /?simple 轻量探测
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
 * 通过 WebDAV MKCOL 方法创建新目录
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
 * 通过 HTTP DELETE 删除文件或目录
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
 * 本地开发与演示环境的虚拟目录树
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
      demoContent: `# dufs-lume-ui

欢迎使用 **dufs-lume-ui**！这是一个专为 Rust 静态文件服务器 [Dufs](https://github.com/sigoden/dufs) 打造的极简、优雅、响应式前端主题。

## 核心亮点

- **双视图自由切换**：支持传统表格列表视图（List View）与现代网格卡片视图（Grid View），状态自动持久化至 \`localStorage\`。
- **快捷键增强多选**：支持 \`Ctrl/Cmd + 点击\` 直接切换选择而不打开预览弹窗，支持 \`Shift + 点击\` 连续区间多选。
- **富媒体与交互式网页预览**：支持图片、音视频、Markdown、代码语法高亮与原生 \`<iframe>\` 静态网站浏览（支持执行 JS 与弹窗内左右切换上一项/下一项）。
- **Caddy + 极简 sh 扩展 API**：通过 \`/__lume__/info\` 一次请求同时完成登录态探测、实时磁盘空间读取与服务端能力发现（缩略图），零落盘文件污染。
`,
    },
    {
      name: 'interactive-demo.html',
      path_type: 'File',
      size: 2480,
      mtime: 1762458000000,
      demoContent: `<!DOCTYPE html>
<html lang="zh-CN">
<head>
  <meta charset="UTF-8" />
  <title>Interactive Static Site Preview</title>
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
    <h2>✨ 静态网站原生 Iframe 预览</h2>
    <p>当前 HTML 在完整功能的 <code>&lt;iframe&gt;</code> 中运行，JavaScript、Canvas 与同目录相对资源均可正常执行。</p>
    <p id="counter">点击计数：0</p>
    <button onclick="window.count = (window.count || 0) + 1; document.getElementById('counter').textContent = '点击计数：' + window.count;">
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
      demoContent: `# Caddy + TinyAuth + 极简 sh 扩展 API 推荐配置示例
files.example.com {
    encode zstd gzip

    # 匹配受保护路径（非 /share 公开区、非静态资源前缀）
    @gated {
        not path /share* /__dufs_v*
    }

    handle @gated {
        forward_auth tinyauth:3000 {
            uri /api/auth/caddy
            copy_headers Remote-User Remote-Email Remote-Name
        }

        # 扩展 API：实时执行极简 sh 脚本返回磁盘水位 JSON（无落盘文件）
        handle /__lume__/info {
            reverse_proxy unix//run/lume-info.sock
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
      demoContent: `# Caddy + TinyAuth + 极简 sh 扩展 API 说明

1. **零落盘文件**：不再向数据目录写入 \`.lume-disk.json\`，而是由 Caddy 拦截 \`/__lume__/*\` 转发给极简 \`sh\` 脚本实时执行 \`df -B1\` 输出 JSON。
2. **一次请求完成三件事**：前端启动时仅请求一次 \`GET /__lume__/info\`，若返回 \`302/401\` 即判定为未登录访客；若返回 \`200\` 则同时完成已登录认证、磁盘容量读取与**服务端能力发现**（\`thumbs\` 能力位决定网格缩略图走服务端缩放还是退回原图）。`,
    },
    {
      name: 'lume-info-api.sh',
      path_type: 'File',
      size: 960,
      mtime: 1762400000000,
      demoContent: `#!/bin/sh
# 极简扩展 API 响应脚本（配合 socat Unix Socket；/__lume__/info 与 /__lume__/thumb 同一条管道）
ROOT="\${DUFS_SERVE_PATH:-/var/lib/dufs}"
set -- $(df -P -k "$ROOT" | tail -n 1)
FREE=$(( \${4:-0} * 1024 ))
DATA=$(( $(du -sk "$ROOT" 2>/dev/null | cut -f1) * 1024 ))
NOW=$(date -Iseconds)

BODY=$(printf '{"generated_at":"%s","path":"%s","free_bytes":%s,"data_bytes":%s}' \\
  "$NOW" "$ROOT" "$FREE" "\${DATA:-0}")

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
      demoContent: `Dufs Lume UI v1.2.0 Release Notes
=================================
- Removed .lume-disk.json file dependency; switched to real-time /__lume__/info sh API
- Combined auth state probe & disk space fetch into a single request
- Full-bleed brand logo without padding or border ring
- Full-featured <iframe> preview for HTML static sites with JS execution
- Added Ctrl/Cmd + Click to toggle selection and Shift + Click range selection
- Added Prev/Next navigation (buttons + Left/Right arrow keys) in preview modal`,
    },
  ],
  '/releases/': [
    {
      name: 'dufs-lume-ui-v1.2.0-dist.zip',
      path_type: 'File',
      size: 189440,
      mtime: 1762280000000,
    },
    {
      name: 'checksums.sha256',
      path_type: 'File',
      size: 256,
      mtime: 1762279000000,
      demoContent: `e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855  dufs-lume-ui-v1.2.0-dist.zip`,
    },
  ],
};
