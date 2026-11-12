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
 * Runtime brand customization injected into index.html by docker/entrypoint-ui.sh
 * (or set via window.__LUME_BRAND__). Empty strings fall back to locale defaults.
 */
export interface LumeBrandConfig {
  title?: string;
  subtitle?: string;
  icon?: string;
  loginUrl?: string;
}

/**
 * Server-side thumbnail capability reported by `/__lume__/info`.
 * - `false`      Server thumbnail toolchain is not installed; client falls back to original images
 * - `true` / `{ enabled: true, widths }` Server supports `/__lume__/thumb` at specified width tiers
 * - `undefined`  Extension API is not deployed
 */
export type ThumbsCapability = boolean | { enabled: true; widths?: number[] };

/**
 * Payload returned by `GET /__lume__/info` (served via Caddy + POSIX shell script without writing files to disk).
 * Placed behind the Caddy `@gated` authentication block so a single request at startup
 * simultaneously verifies authentication status, reads storage metrics, and discovers server capabilities.
 */
export interface ServerInfo {
  /** ISO-8601 timestamp when metrics were generated */
  generated_at: string;
  /** Absolute path of the Dufs data root on the host/container */
  path: string;
  /** Available free bytes on the underlying filesystem */
  free_bytes: number;
  /** Total bytes used by the Dufs data directory itself (`du -sk` * 1024) */
  data_bytes?: number;
  /** Server-side thumbnail capability flag and supported width tiers */
  thumbs?: ThumbsCapability;
}

/**
 * User preference for image thumbnails (persisted in localStorage):
 * - `auto` (default): Enabled automatically when the server advertises thumbnail support
 * - `on`:             Always show thumbnails (uses server endpoint if available, otherwise scales originals)
 * - `off`:            Never load image thumbnails
 */
export type ThumbPreference = 'auto' | 'on' | 'off';

export type ViewMode = 'list' | 'grid';
export type ThemePreference = 'system' | 'light' | 'dark';
export type LanguagePreference = 'system' | 'zh' | 'en';

/**
 * Session authentication state resolved via `/__lume__/info` (or `/?simple` fallback):
 * - `anonymous`     Unauthenticated guest: scoped to the public `/share/` directory, read-only
 * - `authenticated` Signed-in user: full access according to Dufs permissions
 * - `checking`      Initial probe in progress
 * - `unknown`       No auth gateway detected; defaults to full access
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
  status: 'queued' | 'uploading' | 'completed' | 'failed' | 'auth_blocked' | 'cancelled';
  errorMsg?: string;
}

/** Progress snapshot for client-side streaming ZIP creation */
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
    __LUME_BRAND__?: LumeBrandConfig | string;
  }
}
