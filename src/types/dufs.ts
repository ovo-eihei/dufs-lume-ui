export type DufsPathType = 'Dir' | 'File' | 'SymlinkDir' | 'SymlinkFile';

export interface DufsPathItem {
  name: string;
  path_type: DufsPathType;
  mtime: number; // Unix timestamp in milliseconds
  size?: number; // Size in bytes (undefined or 0 for directories)
  /** Optional inline mock content for demo preview mode */
  demoContent?: string;
  demoMediaUrl?: string;
}

export interface DufsIndexData {
  href: string;
  uri_prefix: string;
  kind: 'Index' | 'Edit' | 'View';
  paths: DufsPathItem[];
  allow_upload: boolean;
  allow_delete: boolean;
  allow_search: boolean;
  allow_archive: boolean;
  dir_exists: boolean;
  auth: boolean;
  user: string | null;
}

/**
 * 缩略图能力位（由扩展 API 的 `thumbs` 字段给出）。
 * - `false`      服务端未注册缩略图能力 ⇒ 只能用前端（原图）预览
 * - `true`       服务端已注册，`widths` 为可用宽度档位
 * - `undefined`  扩展 API 未部署（旧版脚本 / 404 回退）⇒ 视为不支持
 */
export type ThumbsCapability = boolean | { enabled: true; widths?: number[] };

/**
 * 扩展 API `/__lume__/info` 的响应（由 Caddy 反代极简 sh 脚本实时返回 JSON，无需落盘文件）。
 * 该路由位于 Caddy `@gated` 鉴权保护之下：
 * - 未登录访问 `/__lume__/info` 返回 302/401；
 * - 已登录访问返回 200 + 实时磁盘容量 + 能力位 JSON；
 * 前端启动时仅需请求一次即可同时完成「登录态探测 + 磁盘水位读取 + 服务端能力发现」。
 */
export interface ServerInfo {
  /** ISO8601，生成时刻 */
  generated_at: string;
  /** 数据根绝对路径，如 /var/lib/dufs */
  path: string;
  /** 文件系统剩余可用 = 这个目录还能写多少（dufs 没有配额概念） */
  free_bytes: number;
  /** 数据根自身占用（脚本 `du -sk` × 1024）；旧脚本可能不输出，故仍为可选 */
  data_bytes?: number;
  /** 服务端缩略图能力；缺省 = 不支持 */
  thumbs?: ThumbsCapability;
}

/**
 * 缩略图显示偏好（存 localStorage，三态）：
 * - `auto` 跟随服务端能力：服务器注册了缩略图就用服务端预览，没注册就用前端（原图）预览；
 *   服务端能力变化时 `auto` 自动跟着变，**不会写回用户的设置**
 * - `on`   用户明确要开：服务端支持走服务端，不支持退回前端原图
 * - `off`  用户明确关：无论服务端支不支持都不显示
 * 「只有用户没有设置过才根据服务器能力提供」= 缺省值就是 `auto`。
 */
export type ThumbPreference = 'auto' | 'on' | 'off';

export type ViewMode = 'list' | 'grid';
export type ThemePreference = 'system' | 'light' | 'dark';
export type LanguagePreference = 'system' | 'zh' | 'en';

/**
 * 登录态：优先由 `/__lume__/info` 扩展 API 探测得出（若未部署扩展 API 则自动回退至 `/?simple`）。
 * - `anonymous`     未登录：以公开区为根目录，隐藏所有写操作入口
 * - `authenticated` 已登录
 * - `checking`      探测进行中（首帧不闪现按钮）
 * - `unknown`       探测本身失败（网络错误等）⇒ 乐观地按已登录处理
 */
export type AuthState = 'unknown' | 'checking' | 'anonymous' | 'authenticated';

export type SortField = 'name' | 'size' | 'mtime';
export type SortOrder = 'asc' | 'desc';

export type PreviewCategory =
  | 'image'
  | 'video'
  | 'audio'
  | 'markdown'
  | 'pdf'
  | 'html'
  | 'text'
  | 'unsupported';

export interface UploadTask {
  id: string;
  file: File;
  targetPath: string;
  progress: number;
  status: 'uploading' | 'completed' | 'failed' | 'auth_blocked' | 'cancelled';
  errorMsg?: string;
}

/** 客户端打包（勾选内容）的进度快照 */
export interface ZipJobProgress {
  done: number;
  total: number;
  bytes: number;
  current: string;
}

export interface AuthInterceptError {
  status: number;
  operation: 'upload' | 'mkdir' | 'delete';
  targetPath: string;
  redirectUrl?: string;
  retryCallback?: () => void;
}

declare global {
  interface Window {
    __DUFS_RAW_INDEX_DATA__?: string;
    __DUFS_ASSETS_PREFIX__?: string;
  }
}
