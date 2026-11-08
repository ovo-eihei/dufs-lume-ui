import React, { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { ZipButton, ZipControls } from './components/ZipButton';
import {
  AuthInterceptError,
  AuthState,
  ServerInfo,
  DufsIndexData,
  DufsPathItem,
  LanguagePreference,
  SortField,
  SortOrder,
  ThemePreference,
  ThumbPreference,
  UploadTask,
  ViewMode,
  ZipJobProgress,
} from './types/dufs';
import {
  buildAbsoluteUrl,
  formatBytes,
  isDirectory,
  isSameOrUnder,
  joinUrlPath,
  normalizeDirHref,
  sanitizeRootPath,
} from './utils/format';
import {
  createDirectoryMkcol,
  decodeDufsIndexData,
  deleteFileOrDirectory,
  DEMO_DIRECTORY_TREE,
  describeError,
  DufsAuthError,
  buildLoginUrl,
  fetchDirectoryJson,
  fetchServerInfo,
  hasLoginQueryParam,
  probeAuthAndInfo,
  stripLoginQueryParam,
  thumbsCapabilityEnabled,
  UploadCancelledError,
  uploadFileWithProgress,
  UploadHandle,
} from './services/dufsApi';
import {
  buildSelectionZipBlob,
  buildZipFileName,
  MAX_ZIP_ENTRIES,
  planSelectionZip,
  triggerBlobDownload,
} from './services/zipSelection';
import {
  getSavedLanguagePreference,
  setAppLanguagePreference,
} from './i18n';
import { Navbar } from './components/Navbar';
import { Breadcrumbs } from './components/Breadcrumbs';
import { ServerInfoPanel } from './components/ServerInfoPanel';
import { FileExplorer } from './components/FileExplorer';
import { MediaPreviewModal } from './components/MediaPreviewModal';
import { AuthPromptModal } from './components/AuthPromptModal';
import {
  DeleteConfirmModal,
  DragDropOverlay,
  NewFolderModal,
  SandboxDisableConfirmModal,
  UploadQueuePanel,
} from './components/ModalsAndPanels';

const VIEW_MODE_KEY = 'dufs_lume_view_mode';
const THEME_KEY = 'dufs_lume_theme';
/**
 * HTML 预览沙箱开关：`'1'`（缺省）= 沙箱内渲染；`'0'` = 用户在二次确认后主动关闭。
 * 只存浏览器 ⇒ 它是「知情同意」不是访问控制：换设备或清站点数据会自动回到安全的开。
 */
const HTML_SANDBOX_KEY = 'dufs_lume_html_sandbox';
/** 缩略图偏好：`auto`（缺省，用户没设置过）/ `on` / `off` */
const THUMB_PREF_KEY = 'dufs_lume_thumbs';
/** 未登录访客的公开只读根目录 */
const ANON_ROOT_HREF = '/share/';

function safeGetStorage(key: string, fallback: string): string {
  try {
    return localStorage.getItem(key) || fallback;
  } catch {
    return fallback;
  }
}

function safeSetStorage(key: string, value: string): void {
  try {
    localStorage.setItem(key, value);
  } catch {
    // ignore storage errors in restricted environments
  }
}

function getSystemDarkPreference(): boolean {
  if (typeof window === 'undefined' || !window.matchMedia) return false;
  return window.matchMedia('(prefers-color-scheme: dark)').matches;
}

export default function App() {
  const { t } = useTranslation();

  // 1. 解析 Dufs 注入的 __INDEX_DATA__，若不存在则自动进入可交互演示模式 (Demo Mode)
  const initialInjected = useMemo(
    () => decodeDufsIndexData(window.__DUFS_RAW_INDEX_DATA__),
    []
  );
  const isDemoMode = !initialInjected;

  const [demoTree, setDemoTree] = useState<Record<string, DufsPathItem[]>>(() => ({
    ...DEMO_DIRECTORY_TREE,
  }));

  const [indexData, setIndexData] = useState<DufsIndexData>(() => {
    if (initialInjected) return initialInjected;
    return {
      href: '/',
      uri_prefix: '',
      kind: 'Index',
      paths: DEMO_DIRECTORY_TREE['/'] || [],
      allow_upload: true,
      allow_delete: true,
      allow_search: true,
      allow_archive: true,
      dir_exists: true,
      auth: false,
      user: null,
    };
  });

  // 2. 视图切换状态 (List / Grid) 并持久化至 localStorage
  const [viewMode, setViewMode] = useState<ViewMode>(() => {
    const saved = safeGetStorage(VIEW_MODE_KEY, 'list');
    return saved === 'grid' ? 'grid' : 'list';
  });

  const handleViewModeChange = (mode: ViewMode) => {
    setViewMode(mode);
    safeSetStorage(VIEW_MODE_KEY, mode);
  };

  // 3. 外观主题偏好 ('system' | 'light' | 'dark')
  const [themePreference, setThemePreference] = useState<ThemePreference>(() => {
    const saved = safeGetStorage(THEME_KEY, 'system');
    if (saved === 'light' || saved === 'dark' || saved === 'system') {
      return saved;
    }
    return 'system';
  });

  const [systemIsDark, setSystemIsDark] = useState<boolean>(() => getSystemDarkPreference());

  useEffect(() => {
    if (typeof window === 'undefined' || !window.matchMedia) return;
    const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)');
    const handleChange = (e: MediaQueryListEvent) => {
      setSystemIsDark(e.matches);
    };
    if (mediaQuery.addEventListener) {
      mediaQuery.addEventListener('change', handleChange);
      return () => mediaQuery.removeEventListener('change', handleChange);
    }
  }, []);

  const resolvedDarkMode =
    themePreference === 'system' ? systemIsDark : themePreference === 'dark';

  useEffect(() => {
    const rootEl = document.documentElement;
    if (resolvedDarkMode) {
      rootEl.classList.add('dark');
    } else {
      rootEl.classList.remove('dark');
    }
  }, [resolvedDarkMode]);

  const handleThemePreferenceChange = (pref: ThemePreference) => {
    setThemePreference(pref);
    safeSetStorage(THEME_KEY, pref);
  };

  // 4. 语言偏好 ('system' | 'zh' | 'en')
  const [languagePreference, setLanguagePreference] = useState<LanguagePreference>(() =>
    getSavedLanguagePreference()
  );

  const handleLanguagePreferenceChange = (pref: LanguagePreference) => {
    setLanguagePreference(pref);
    setAppLanguagePreference(pref);
  };

  // 5. 搜索、排序状态
  const [searchQuery, setSearchQuery] = useState('');
  const [sortField, setSortField] = useState<SortField>('name');
  const [sortOrder, setSortOrder] = useState<SortOrder>('asc');
  const searchInputRef = useRef<HTMLInputElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // 6. 模态框、上传队列、Toast、Caddy + TinyAuth 鉴权状态
  const [previewItem, setPreviewItem] = useState<DufsPathItem | null>(null);
  const [mkdirOpen, setMkdirOpen] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<DufsPathItem | null>(null);
  const [isDraggingOver, setIsDraggingOver] = useState(false);
  const dragCounter = useRef(0);

  const [uploadTasks, setUploadTasks] = useState<UploadTask[]>([]);
  const [authError, setAuthError] = useState<AuthInterceptError | null>(null);
  const [simulateAuthIntercept, setSimulateAuthIntercept] = useState<boolean>(true);
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  // 7. 登录态 + 服务端概况（磁盘水位与能力位，通过 `/__lume__/info` 极简 sh 扩展 API 一次请求同时获取）
  const [authState, setAuthState] = useState<AuthState>(isDemoMode ? 'authenticated' : 'checking');
  const anonRootNormalized = ANON_ROOT_HREF;

  const [serverInfo, setServerInfo] = useState<ServerInfo | null>(() =>
    isDemoMode
      ? {
          generated_at: new Date().toISOString(),
          path: '/var/lib/dufs',
          free_bytes: 68719476736, // 64 GB
          data_bytes: 4294967296, // 4 GB
          thumbs: { enabled: true, widths: [256] },
        }
      : null
  );

  const reloadServerInfo = useCallback(() => {
    if (isDemoMode) {
      setServerInfo((prev) =>
        prev ? { ...prev, generated_at: new Date().toISOString() } : null
      );
      return;
    }
    fetchServerInfo(joinUrlPath(indexData.uri_prefix, '/')).then(setServerInfo);
  }, [isDemoMode, indexData.uri_prefix]);

  /**
   * 启动时发送单次合并探测 `GET /__lume__/info`：
   * - 未登录：Caddy `@gated` 返回 302/401 ⇒ `authState = 'anonymous'`，`serverInfo = null`
   * - 已登录：返回 200 JSON ⇒ `authState = 'authenticated'`，并直接填入磁盘水位与服务端能力位
   */
  useEffect(() => {
    if (isDemoMode) return;
    let cancelled = false;
    (async () => {
      const { authState: nextState, serverInfo: nextInfo } = await probeAuthAndInfo(
        joinUrlPath(indexData.uri_prefix, '/')
      );
      if (!cancelled) {
        setAuthState(nextState);
        setServerInfo(nextInfo);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [isDemoMode, indexData.uri_prefix]);

  /* ======================= 8. 沙箱与缩略图偏好 ======================= */
  const [htmlSandbox, setHtmlSandbox] = useState<boolean>(
    () => safeGetStorage(HTML_SANDBOX_KEY, '1') !== '0'
  );
  const [sandboxConfirmOpen, setSandboxConfirmOpen] = useState(false);

  const applySandboxEnabled = useCallback((enabled: boolean) => {
    setHtmlSandbox(enabled);
    safeSetStorage(HTML_SANDBOX_KEY, enabled ? '1' : '0');
  }, []);

  /** 唯一的「关闭沙箱」入口：设置面板的开关与预览提示条上的按钮都走这里（同一个确认弹窗） */
  const requestDisableSandbox = useCallback(() => setSandboxConfirmOpen(true), []);

  /**
   * 缩略图：`auto` = 用户从没设置过 ⇒ 完全跟随服务端能力（服务器注册了才默认开）；
   * `on` = 用户明确要开 ⇒ 服务端支持就走服务端，不支持就退回前端（原图）预览；
   * `off` = 用户明确关。服务端能力变化**不会改写用户设置**。
   */
  const [thumbPreference, setThumbPreference] = useState<ThumbPreference>(() => {
    const saved = safeGetStorage(THUMB_PREF_KEY, 'auto');
    return saved === 'on' || saved === 'off' ? saved : 'auto';
  });

  const serverThumbsAvailable = thumbsCapabilityEnabled(serverInfo?.thumbs);
  const thumbsEnabled =
    thumbPreference === 'off'
      ? false
      : thumbPreference === 'on'
      ? true
      : serverThumbsAvailable;
  const thumbSource: 'server' | 'client' = serverThumbsAvailable ? 'server' : 'client';

  const handleThumbPreferenceChange = useCallback((pref: ThumbPreference) => {
    setThumbPreference(pref);
    safeSetStorage(THUMB_PREF_KEY, pref);
  }, []);

  // 登录入口参数 `?login=1`（F3a）只是给 Caddy 看的，app 一起来就把它从地址栏洗掉
  useEffect(() => {
    if (hasLoginQueryParam()) stripLoginQueryParam();
  }, []);

  const publicAreaOnly =
    authState === 'anonymous' ||
    (authState === 'checking' && isSameOrUnder(indexData.href, anonRootNormalized));
  const rootHref = publicAreaOnly ? anonRootNormalized : '/';
  const canWrite = indexData.allow_upload && !publicAreaOnly;

  const rootHrefRef = useRef(rootHref);
  const authStateRef = useRef(authState);
  useEffect(() => {
    rootHrefRef.current = rootHref;
  }, [rootHref]);
  useEffect(() => {
    authStateRef.current = authState;
  }, [authState]);

  const showToast = useCallback((msg: string) => {
    setToastMessage(msg);
    setTimeout(() => {
      setToastMessage((prev) => (prev === msg ? null : prev));
    }, 2800);
  }, []);

  // 快捷键 `/` 聚焦搜索框
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (
        e.key === '/' &&
        document.activeElement?.tagName !== 'INPUT' &&
        document.activeElement?.tagName !== 'TEXTAREA'
      ) {
        e.preventDefault();
        searchInputRef.current?.focus();
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, []);

  // 同步演示模式目录内容
  useEffect(() => {
    if (isDemoMode) {
      setIndexData((prev) => ({
        ...prev,
        paths: demoTree[prev.href] || [],
      }));
    }
  }, [isDemoMode, demoTree]);

  // 导航到指定目录
  const navigateToDirectory = useCallback(
    async (targetHref: string, historyMode: 'push' | 'replace' | 'none' = 'push') => {
      const normalized = targetHref.startsWith('/') ? targetHref : `/${targetHref}`;
      let cleanHref = normalized.endsWith('/') ? normalized : `${normalized}/`;

      setSearchQuery('');

      if (isDemoMode) {
        setIndexData((prev) => ({
          ...prev,
          href: cleanHref,
          paths: demoTree[cleanHref] || [],
        }));
        return;
      }

      const root = rootHrefRef.current;
      if (authStateRef.current === 'anonymous' && !isSameOrUnder(cleanHref, root)) {
        cleanHref = root;
      }

      const fullUrl = joinUrlPath(indexData.uri_prefix, cleanHref);
      try {
        const nextData = await fetchDirectoryJson(fullUrl);
        setIndexData(nextData);
        if (historyMode === 'push') {
          window.history.pushState({ href: nextData.href }, '', fullUrl);
        } else if (historyMode === 'replace') {
          window.history.replaceState({ href: nextData.href }, '', fullUrl);
        }
      } catch (err) {
        if (err instanceof DufsAuthError) {
          setAuthState('anonymous');
          setServerInfo(null);
          showToast(t('toast.authTriggered'));
          if (cleanHref !== root) {
            try {
              const fallbackUrl = joinUrlPath(indexData.uri_prefix, root);
              const fallbackData = await fetchDirectoryJson(fallbackUrl);
              setIndexData(fallbackData);
              window.history.replaceState({ href: fallbackData.href }, '', fallbackUrl);
            } catch {
              // ignore
            }
          }
          return;
        }
        window.location.href = fullUrl;
      }
    },
    [isDemoMode, demoTree, indexData.uri_prefix, showToast, t]
  );

  useEffect(() => {
    if (isDemoMode) return;
    if (authState !== 'anonymous') return;
    if (!isSameOrUnder(indexData.href, anonRootNormalized)) {
      navigateToDirectory(anonRootNormalized, 'replace');
    }
  }, [isDemoMode, authState, indexData.href, anonRootNormalized, navigateToDirectory]);

  // 监听浏览器前进/后退
  useEffect(() => {
    if (isDemoMode) return;
    const handlePopState = () => {
      const prefix = indexData.uri_prefix || '';
      let path = window.location.pathname;
      if (prefix && path.startsWith(prefix)) {
        path = path.slice(prefix.length) || '/';
      }
      navigateToDirectory(path, 'none');
    };
    window.addEventListener('popstate', handlePopState);
    return () => window.removeEventListener('popstate', handlePopState);
  }, [isDemoMode, indexData.uri_prefix, navigateToDirectory]);

  const refreshCurrentDirectory = useCallback(async () => {
    if (isDemoMode) return;
    const fullUrl = joinUrlPath(indexData.uri_prefix, indexData.href);
    try {
      const refreshed = await fetchDirectoryJson(fullUrl);
      setIndexData(refreshed);
    } catch (err) {
      if (err instanceof DufsAuthError) {
        setAuthState('anonymous');
        setServerInfo(null);
        return;
      }
      window.location.reload();
    }
  }, [isDemoMode, indexData.uri_prefix, indexData.href]);

  // 处理列排序点击
  const handleChangeSort = (field: SortField) => {
    if (sortField === field) {
      setSortOrder((prev) => (prev === 'asc' ? 'desc' : 'asc'));
    } else {
      setSortField(field);
      setSortOrder('asc');
    }
  };

  // 计算过滤与排序后的文件列表（文件夹始终置顶）
  const filteredAndSortedItems = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    const filtered = indexData.paths.filter((item) =>
      q ? item.name.toLowerCase().includes(q) : true
    );

    return [...filtered].sort((a, b) => {
      const aDir = isDirectory(a);
      const bDir = isDirectory(b);
      if (aDir !== bDir) return aDir ? -1 : 1;

      let cmp = 0;
      if (sortField === 'name') {
        cmp = a.name.localeCompare(b.name, undefined, { numeric: true, sensitivity: 'base' });
      } else if (sortField === 'size') {
        cmp = (a.size ?? 0) - (b.size ?? 0);
      } else if (sortField === 'mtime') {
        cmp = (a.mtime ?? 0) - (b.mtime ?? 0);
      }
      return sortOrder === 'asc' ? cmp : -cmp;
    });
  }, [indexData.paths, searchQuery, sortField, sortOrder]);

  // 当前目录下所有非文件夹条目（供预览弹窗内 ← / → 切换上一个/下一个文件）
  const previewableItems = useMemo(
    () => filteredAndSortedItems.filter((item) => !isDirectory(item)),
    [filteredAndSortedItems]
  );

  const currentPreviewIndex = useMemo(() => {
    if (!previewItem) return -1;
    return previewableItems.findIndex((item) => item.name === previewItem.name);
  }, [previewItem, previewableItems]);

  // 统计当前目录文件夹数、文件数与总大小
  const stats = useMemo(() => {
    let folders = 0;
    let files = 0;
    let totalBytes = 0;
    for (const item of indexData.paths) {
      if (isDirectory(item)) {
        folders++;
      } else {
        files++;
        totalBytes += item.size || 0;
      }
    }
    return { folders, files, totalBytes };
  }, [indexData.paths]);

  /* ======================= 勾选与打包（支持 Ctrl/Cmd 单击与 Shift 区间连选） ======================= */
  const [selectedNames, setSelectedNames] = useState<Set<string>>(() => new Set());
  const lastSelectedNameRef = useRef<string | null>(null);
  const [zipJob, setZipJob] = useState<ZipJobProgress | null>(null);

  useEffect(() => {
    setSelectedNames(new Set());
    lastSelectedNameRef.current = null;
    setZipJob(null);
  }, [indexData.href]);

  const selectedItems = useMemo(
    () => indexData.paths.filter((item) => selectedNames.has(item.name)),
    [indexData.paths, selectedNames]
  );
  const selectedBytes = useMemo(
    () => selectedItems.reduce((sum, item) => sum + (isDirectory(item) ? 0 : item.size || 0), 0),
    [selectedItems]
  );

  const handleToggleSelect = useCallback(
    (item: DufsPathItem, shiftKey = false) => {
      setSelectedNames((prev) => {
        const next = new Set(prev);
        const lastName = lastSelectedNameRef.current;

        if (shiftKey && lastName && lastName !== item.name) {
          const idxA = filteredAndSortedItems.findIndex((i) => i.name === lastName);
          const idxB = filteredAndSortedItems.findIndex((i) => i.name === item.name);
          if (idxA !== -1 && idxB !== -1) {
            const [start, end] = idxA < idxB ? [idxA, idxB] : [idxB, idxA];
            const shouldSelect = !prev.has(item.name);
            for (let i = start; i <= end; i++) {
              const targetName = filteredAndSortedItems[i].name;
              if (shouldSelect) {
                next.add(targetName);
              } else {
                next.delete(targetName);
              }
            }
            lastSelectedNameRef.current = item.name;
            return next;
          }
        }

        if (next.has(item.name)) {
          next.delete(item.name);
        } else {
          next.add(item.name);
        }
        lastSelectedNameRef.current = item.name;
        return next;
      });
    },
    [filteredAndSortedItems]
  );

  const handleToggleSelectAll = useCallback(() => {
    setSelectedNames((prev) => {
      const next = new Set(prev);
      const everySelected =
        filteredAndSortedItems.length > 0 &&
        filteredAndSortedItems.every((item) => next.has(item.name));
      for (const item of filteredAndSortedItems) {
        if (everySelected) {
          next.delete(item.name);
        } else {
          next.add(item.name);
        }
      }
      return next;
    });
  }, [filteredAndSortedItems]);

  // 下载单个文件或将目录打包为 ?zip 下载
  const handleDownloadItem = (item: DufsPathItem) => {
    const isDir = isDirectory(item);
    const basePath = joinUrlPath(indexData.uri_prefix, indexData.href, item.name, isDir);
    const downloadUrl = isDir ? `${basePath}?zip` : basePath;

    if (isDemoMode) {
      showToast(t('toast.zipTriggered', { name: isDir ? `${item.name}.zip` : item.name }));
      if (item.demoContent) {
        const blob = new Blob([item.demoContent], { type: 'text/plain;charset=utf-8' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = item.name;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
      }
      return;
    }

    const a = document.createElement('a');
    a.href = downloadUrl;
    if (!isDir) a.download = item.name;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  };

  const handleZipSelection = useCallback(async () => {
    if (zipJob) return;
    if (selectedItems.length === 0) return;

    if (isDemoMode) {
      showToast(t('toast.zipTriggered', { name: buildZipFileName() }));
      return;
    }

    try {
      const plan = await planSelectionZip(selectedItems, indexData.href, indexData.uri_prefix);
      if (plan.truncated) {
        showToast(t('selection.tooMany', { max: MAX_ZIP_ENTRIES }));
        return;
      }
      if (plan.items.length === 0) {
        showToast(t('file.emptyTitle'));
        return;
      }
      const { blob, skipped } = await buildSelectionZipBlob(plan.items, (p) => setZipJob(p));
      const fileName = buildZipFileName();
      triggerBlobDownload(blob, fileName);
      showToast(
        t('selection.done', {
          name: fileName,
          count: plan.items.length - skipped,
          size: formatBytes(blob.size),
        })
      );
      if (skipped > 0) {
        showToast(t('selection.skipped', { count: skipped }));
      }
    } catch (err) {
      showToast(t('selection.failed', { msg: describeError(err) }));
    } finally {
      setZipJob(null);
    }
  }, [zipJob, selectedItems, isDemoMode, indexData.href, indexData.uri_prefix, showToast, t]);

  const handleDownloadCurrentDirZip = useCallback(() => {
    if (selectedNames.size > 0) {
      handleZipSelection();
      return;
    }
    const basePath = joinUrlPath(indexData.uri_prefix, indexData.href);
    const zipUrl = `${basePath}?zip`;
    if (isDemoMode) {
      const folderName =
        normalizeDirHref(indexData.href) === '/'
          ? 'root.zip'
          : `${indexData.href.replace(/^\/|\/$/g, '').split('/').pop()}.zip`;
      showToast(t('toast.zipTriggered', { name: folderName }));
      return;
    }
    window.location.href = zipUrl;
  }, [
    selectedNames.size,
    handleZipSelection,
    indexData.uri_prefix,
    indexData.href,
    isDemoMode,
    showToast,
    t,
  ]);

  const handleItemClick = (item: DufsPathItem) => {
    if (isDirectory(item)) {
      const base = normalizeDirHref(indexData.href);
      navigateToDirectory(`${base}${item.name}/`);
      return;
    }
    setPreviewItem(item);
  };

  const handleNavigateParent = () => {
    const current = normalizeDirHref(indexData.href);
    if (current === normalizeDirHref(rootHref)) return;
    const parts = current.split('/').filter(Boolean);
    parts.pop();
    const parentHref = parts.length === 0 ? '/' : `/${parts.join('/')}/`;
    navigateToDirectory(parentHref);
  };

  /* ======================= 上传（含取消与残留清理） ======================= */
  const uploadHandles = useRef(new Map<string, UploadHandle>());
  const uploadTargets = useRef(new Map<string, string>());

  const handleFilesUpload = useCallback(
    async (files: FileList | File[]) => {
      const fileArray = Array.from(files);
      if (fileArray.length === 0) return;

      for (const file of fileArray) {
        const taskId = `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
        const targetPath = joinUrlPath(indexData.uri_prefix, indexData.href, file.name, false);

        const newTask: UploadTask = {
          id: taskId,
          file,
          targetPath,
          progress: 0,
          status: 'uploading',
        };
        setUploadTasks((prev) => [newTask, ...prev]);

        if (isDemoMode) {
          if (simulateAuthIntercept) {
            setUploadTasks((prev) =>
              prev.map((tItem) =>
                tItem.id === taskId ? { ...tItem, status: 'auth_blocked', progress: 0 } : tItem
              )
            );
            setAuthError({
              status: 401,
              operation: 'upload',
              targetPath,
              retryCallback: () => handleFilesUpload([file]),
            });
            showToast(t('toast.authTriggered'));
            return;
          }

          setTimeout(() => {
            setUploadTasks((prev) =>
              prev.map((tItem) => (tItem.id === taskId ? { ...tItem, progress: 65 } : tItem))
            );
          }, 200);

          setTimeout(async () => {
            let demoText: string | undefined;
            if (file.size < 200 * 1024) {
              try {
                demoText = await file.text();
              } catch {
                // ignore
              }
            }
            const newItem: DufsPathItem = {
              name: file.name,
              path_type: 'File',
              size: file.size,
              mtime: Date.now(),
              demoContent: demoText,
            };
            setDemoTree((prev) => {
              const existing = (prev[indexData.href] || []).filter(
                (i) => i.name !== file.name
              );
              return {
                ...prev,
                [indexData.href]: [newItem, ...existing],
              };
            });
            setUploadTasks((prev) =>
              prev.map((tItem) =>
                tItem.id === taskId
                  ? { ...tItem, progress: 100, status: 'completed' }
                  : tItem
              )
            );
            showToast(t('toast.uploadSuccess', { name: file.name }));
          }, 550);
          continue;
        }

        const handle = uploadFileWithProgress(targetPath, file, (percent) => {
          setUploadTasks((prev) =>
            prev.map((tItem) =>
              tItem.id === taskId ? { ...tItem, progress: percent } : tItem
            )
          );
        });
        uploadHandles.current.set(taskId, handle);
        uploadTargets.current.set(taskId, targetPath);

        try {
          await handle.promise;
          setUploadTasks((prev) =>
            prev.map((tItem) =>
              tItem.id === taskId
                ? { ...tItem, progress: 100, status: 'completed' }
                : tItem
            )
          );
          showToast(t('toast.uploadSuccess', { name: file.name }));
          await refreshCurrentDirectory();
          reloadServerInfo();
        } catch (err) {
          if (err instanceof UploadCancelledError) {
            setUploadTasks((prev) =>
              prev.map((tItem) =>
                tItem.id === taskId ? { ...tItem, status: 'cancelled' } : tItem
              )
            );
          } else if (err instanceof DufsAuthError) {
            setUploadTasks((prev) =>
              prev.map((tItem) =>
                tItem.id === taskId ? { ...tItem, status: 'auth_blocked' } : tItem
              )
            );
            setAuthError({
              status: err.status,
              operation: 'upload',
              targetPath,
              redirectUrl: err.redirectUrl,
              retryCallback: () => handleFilesUpload([file]),
            });
            showToast(t('toast.authTriggered'));
            break;
          } else {
            setUploadTasks((prev) =>
              prev.map((tItem) =>
                tItem.id === taskId
                  ? {
                      ...tItem,
                      status: 'failed',
                      errorMsg: err instanceof Error ? err.message : 'Upload failed',
                    }
                  : tItem
              )
            );
            showToast(t('toast.uploadFailed', { name: file.name, msg: describeError(err) }));
          }
        } finally {
          uploadHandles.current.delete(taskId);
          uploadTargets.current.delete(taskId);
        }
      }
    },
    [
      indexData.uri_prefix,
      indexData.href,
      isDemoMode,
      simulateAuthIntercept,
      refreshCurrentDirectory,
      reloadServerInfo,
      showToast,
      t,
    ]
  );

  const handleCancelUpload = useCallback(
    async (taskId: string) => {
      const handle = uploadHandles.current.get(taskId);
      const targetPath = uploadTargets.current.get(taskId);
      if (handle) handle.cancel();

      setUploadTasks((prev) =>
        prev.map((tItem) =>
          tItem.id === taskId && tItem.status === 'uploading'
            ? { ...tItem, status: 'cancelled' }
            : tItem
        )
      );

      if (!targetPath || isDemoMode) return;

      try {
        await deleteFileOrDirectory(targetPath, true);
        showToast(t('toast.uploadCancelled'));
        await refreshCurrentDirectory();
      } catch (err) {
        showToast(t('toast.uploadCancelledNoClean', { msg: describeError(err) }));
      }
    },
    [isDemoMode, refreshCurrentDirectory, showToast, t]
  );

  // 执行新建文件夹 (WebDAV MKCOL)
  const handleCreateFolder = async (folderName: string) => {
    setMkdirOpen(false);
    const targetUrl = joinUrlPath(indexData.uri_prefix, indexData.href, folderName, true);

    if (isDemoMode) {
      if (simulateAuthIntercept) {
        setAuthError({
          status: 401,
          operation: 'mkdir',
          targetPath: targetUrl,
          retryCallback: () => handleCreateFolder(folderName),
        });
        showToast(t('toast.authTriggered'));
        return;
      }

      const newFolderItem: DufsPathItem = {
        name: folderName,
        path_type: 'Dir',
        mtime: Date.now(),
      };
      const childHref = `${indexData.href}${folderName}/`;
      setDemoTree((prev) => ({
        ...prev,
        [indexData.href]: [
          newFolderItem,
          ...(prev[indexData.href] || []).filter((i) => i.name !== folderName),
        ],
        [childHref]: prev[childHref] || [],
      }));
      showToast(t('toast.mkdirSuccess', { name: folderName }));
      return;
    }

    try {
      await createDirectoryMkcol(targetUrl);
      showToast(t('toast.mkdirSuccess', { name: folderName }));
      await refreshCurrentDirectory();
    } catch (err) {
      if (err instanceof DufsAuthError) {
        setAuthError({
          status: err.status,
          operation: 'mkdir',
          targetPath: targetUrl,
          redirectUrl: err.redirectUrl,
          retryCallback: () => handleCreateFolder(folderName),
        });
        showToast(t('toast.authTriggered'));
      } else {
        showToast(t('toast.opFailed', { msg: describeError(err) }));
      }
    }
  };

  // 执行删除文件或目录 (HTTP DELETE)
  const handleConfirmDelete = async (item: DufsPathItem) => {
    setDeleteTarget(null);
    const targetUrl = joinUrlPath(
      indexData.uri_prefix,
      indexData.href,
      item.name,
      isDirectory(item)
    );

    if (isDemoMode) {
      if (simulateAuthIntercept) {
        setAuthError({
          status: 302,
          operation: 'delete',
          targetPath: targetUrl,
          retryCallback: () => handleConfirmDelete(item),
        });
        showToast(t('toast.authTriggered'));
        return;
      }

      setDemoTree((prev) => ({
        ...prev,
        [indexData.href]: (prev[indexData.href] || []).filter((i) => i.name !== item.name),
      }));
      showToast(t('toast.deleteSuccess', { name: item.name }));
      return;
    }

    try {
      await deleteFileOrDirectory(targetUrl);
      setSelectedNames((prev) => {
        if (!prev.has(item.name)) return prev;
        const next = new Set(prev);
        next.delete(item.name);
        return next;
      });
      showToast(t('toast.deleteSuccess', { name: item.name }));
      await refreshCurrentDirectory();
      reloadServerInfo();
    } catch (err) {
      if (err instanceof DufsAuthError) {
        setAuthError({
          status: err.status,
          operation: 'delete',
          targetPath: targetUrl,
          redirectUrl: err.redirectUrl,
          retryCallback: () => handleConfirmDelete(item),
        });
        showToast(t('toast.authTriggered'));
      } else {
        showToast(t('toast.opFailed', { msg: describeError(err) }));
      }
    }
  };

  /* ======================= 登录入口与重新探测 ======================= */
  const handleLoginClick = useCallback(() => {
    // 带 `?login=1` 导航到站点根：这个查询让 Caddy 保持该请求受保护（未登录的裸 `/` 会被直接 302 到公开区），
    // 于是 forward_auth 把请求弹给认证中心，登录后自动带回本站。
    window.location.href = buildLoginUrl(joinUrlPath(indexData.uri_prefix, '/'));
  }, [indexData.uri_prefix]);

  const handleRecheckAuth = useCallback(async () => {
    if (isDemoMode) return;
    setAuthState('checking');
    const { authState: nextState, serverInfo: nextInfo } = await probeAuthAndInfo(
      joinUrlPath(indexData.uri_prefix, '/')
    );
    setAuthState(nextState);
    setServerInfo(nextInfo);
  }, [isDemoMode, indexData.uri_prefix]);

  // 全局拖拽事件监听
  const handleDragEnter = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (!canWrite) return;
    dragCounter.current += 1;
    if (e.dataTransfer.items && e.dataTransfer.items.length > 0) {
      setIsDraggingOver(true);
    }
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (!canWrite) return;
    dragCounter.current -= 1;
    if (dragCounter.current <= 0) {
      dragCounter.current = 0;
      setIsDraggingOver(false);
    }
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    dragCounter.current = 0;
    setIsDraggingOver(false);
    if (!canWrite) return;
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      handleFilesUpload(e.dataTransfer.files);
      e.dataTransfer.clearData();
    }
  };

  // 复制公共直链
  const handleCopyDirectLink = (item: DufsPathItem) => {
    const relPath = joinUrlPath(
      indexData.uri_prefix,
      indexData.href,
      item.name,
      isDirectory(item)
    );
    const fullUrl = buildAbsoluteUrl(relPath);

    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(fullUrl).catch(() => {
        fallbackCopyText(fullUrl);
      });
    } else {
      fallbackCopyText(fullUrl);
    }
    showToast(t('file.copied'));
  };

  function fallbackCopyText(text: string) {
    const textarea = document.createElement('textarea');
    textarea.value = text;
    textarea.style.position = 'fixed';
    textarea.style.opacity = '0';
    document.body.appendChild(textarea);
    textarea.select();
    try {
      document.execCommand('copy');
    } catch {
      // ignore
    }
    document.body.removeChild(textarea);
  }

  const allVisibleSelected =
    filteredAndSortedItems.length > 0 &&
    filteredAndSortedItems.every((item) => selectedNames.has(item.name));
  const someVisibleSelected = filteredAndSortedItems.some((item) =>
    selectedNames.has(item.name)
  );

  const zipControls: ZipControls | null = indexData.allow_archive
    ? {
        selectedCount: selectedNames.size,
        selectedSizeLabel: formatBytes(selectedBytes),
        busy: !!zipJob,
        done: zipJob?.done ?? 0,
        total: zipJob?.total ?? 0,
        onClick: handleDownloadCurrentDirZip,
        onClear: () => setSelectedNames(new Set()),
      }
    : null;

  return (
    <div
      className="min-h-screen flex flex-col overflow-x-hidden bg-slate-50 dark:bg-slate-950 text-slate-900 dark:text-slate-100"
      onDragEnter={handleDragEnter}
      onDragLeave={handleDragLeave}
      onDragOver={handleDragOver}
      onDrop={handleDrop}
    >
      <input
        ref={fileInputRef}
        type="file"
        multiple
        className="hidden"
        onChange={(e) => {
          if (e.target.files) {
            handleFilesUpload(e.target.files);
            e.target.value = '';
          }
        }}
      />

      <Navbar
        searchQuery={searchQuery}
        onSearchChange={setSearchQuery}
        viewMode={viewMode}
        onViewModeChange={handleViewModeChange}
        themePreference={themePreference}
        resolvedDarkMode={resolvedDarkMode}
        onThemePreferenceChange={handleThemePreferenceChange}
        languagePreference={languagePreference}
        onLanguagePreferenceChange={handleLanguagePreferenceChange}
        allowUpload={indexData.allow_upload}
        canWrite={canWrite}
        authState={authState}
        onLoginClick={handleLoginClick}
        onRecheckAuth={handleRecheckAuth}
        thumbPreference={thumbPreference}
        onThumbPreferenceChange={handleThumbPreferenceChange}
        serverThumbsAvailable={serverThumbsAvailable}
        htmlSandbox={htmlSandbox}
        onEnableSandbox={() => {
          applySandboxEnabled(true);
          showToast(t('sandbox.reEnabled'));
        }}
        onRequestDisableSandbox={requestDisableSandbox}
        isDemoMode={isDemoMode}
        simulateAuthIntercept={simulateAuthIntercept}
        onToggleSimulateAuth={() => setSimulateAuthIntercept((v) => !v)}
        onTriggerUploadClick={() => fileInputRef.current?.click()}
        onOpenMkdirModal={() => setMkdirOpen(true)}
        searchInputRef={searchInputRef}
      />

      <main className="flex-1 max-w-7xl w-full mx-auto px-3 sm:px-6 lg:px-8 min-w-0">
        <Breadcrumbs
          currentHref={indexData.href}
          rootHref={rootHref}
          onNavigate={(href) => navigateToDirectory(href)}
          folderCount={stats.folders}
          fileCount={stats.files}
          totalBytes={stats.totalBytes}
          sortField={sortField}
          sortOrder={sortOrder}
          onChangeSort={handleChangeSort}
          showSelectAll={viewMode === 'grid'}
          allSelected={allVisibleSelected}
          someSelected={someVisibleSelected}
          totalSelectableCount={filteredAndSortedItems.length}
          onToggleSelectAll={handleToggleSelectAll}
          zipButton={
            viewMode === 'grid' && zipControls ? <ZipButton variant="pill" zip={zipControls} /> : null
          }
        />

        {/*
          ⚠ 服务端概况（磁盘水位 + 能力位）只对已登录者展示：
          `/__lume__/info` 在 `@gated` 之后，未登录探测必然被 302 弹走 ⇒ `publicAreaOnly` 为真时
          这里要么不渲染、要么显示成"服务器不可读"的误导状态。数据根路径也不该向匿名者暴露。
        */}
        {serverInfo && authState === 'authenticated' && !publicAreaOnly && (
          <ServerInfoPanel status={serverInfo} onRefresh={reloadServerInfo} />
        )}

        <FileExplorer
          items={filteredAndSortedItems}
          currentHref={indexData.href}
          rootHref={rootHref}
          viewMode={viewMode}
          sortField={sortField}
          sortOrder={sortOrder}
          onChangeSort={handleChangeSort}
          searchQuery={searchQuery}
          allowDelete={indexData.allow_delete && canWrite}
          allowArchive={indexData.allow_archive}
          zip={zipControls}
          selectedNames={selectedNames}
          uriPrefix={indexData.uri_prefix}
          isDemoMode={isDemoMode}
          thumbsEnabled={thumbsEnabled}
          thumbSource={thumbSource}
          thumbScope={publicAreaOnly ? 'share' : 'full'}
          onToggleSelect={handleToggleSelect}
          onToggleSelectAll={handleToggleSelectAll}
          onItemClick={handleItemClick}
          onNavigateParent={handleNavigateParent}
          onCopyDirectLink={handleCopyDirectLink}
          onDownloadItem={handleDownloadItem}
          onRequestDelete={(item) => setDeleteTarget(item)}
        />
      </main>

      <footer className="py-5 border-t border-slate-200/60 dark:border-slate-800/60 text-center text-xs text-slate-400 dark:text-slate-500">
        <span>{t('app.poweredBy')}</span>
      </footer>

      <MediaPreviewModal
        item={previewItem}
        fileUrl={
          previewItem
            ? joinUrlPath(indexData.uri_prefix, indexData.href, previewItem.name, false)
            : ''
        }
        isDemoMode={isDemoMode}
        htmlSandbox={htmlSandbox}
        onRequestDisableSandbox={requestDisableSandbox}
        hasPrev={currentPreviewIndex > 0}
        hasNext={currentPreviewIndex >= 0 && currentPreviewIndex < previewableItems.length - 1}
        onPrev={() => {
          if (currentPreviewIndex > 0) {
            setPreviewItem(previewableItems[currentPreviewIndex - 1]);
          }
        }}
        onNext={() => {
          if (currentPreviewIndex >= 0 && currentPreviewIndex < previewableItems.length - 1) {
            setPreviewItem(previewableItems[currentPreviewIndex + 1]);
          }
        }}
        onClose={() => setPreviewItem(null)}
        onCopyLink={handleCopyDirectLink}
        onDownload={handleDownloadItem}
      />

      <NewFolderModal
        isOpen={mkdirOpen}
        onClose={() => setMkdirOpen(false)}
        onSubmit={handleCreateFolder}
      />

      <DeleteConfirmModal
        targetItem={deleteTarget}
        onCancel={() => setDeleteTarget(null)}
        onConfirm={handleConfirmDelete}
      />

      <SandboxDisableConfirmModal
        isOpen={sandboxConfirmOpen}
        onCancel={() => setSandboxConfirmOpen(false)}
        onConfirm={() => {
          setSandboxConfirmOpen(false);
          applySandboxEnabled(false);
          showToast(t('toast.sandboxDisabled'));
        }}
      />

      <AuthPromptModal
        authError={authError}
        loginUrl={buildLoginUrl(joinUrlPath(indexData.uri_prefix, '/'))}
        onClose={() => setAuthError(null)}
        isDemoMode={isDemoMode}
        onSimulateLoginSuccess={() => {
          setSimulateAuthIntercept(false);
          const retry = authError?.retryCallback;
          setAuthError(null);
          retry?.();
        }}
        onLoginSuccess={() => handleRecheckAuth()}
      />

      <DragDropOverlay active={isDraggingOver} currentHref={indexData.href} />

      <UploadQueuePanel
        tasks={uploadTasks}
        onClearCompleted={() =>
          setUploadTasks((prev) =>
            prev.filter((tItem) => tItem.status === 'uploading')
          )
        }
        onDismissTask={(id) =>
          setUploadTasks((prev) => prev.filter((tItem) => tItem.id !== id))
        }
        onCancelTask={handleCancelUpload}
      />

      {toastMessage && (
        <div className="fixed bottom-5 left-1/2 -translate-x-1/2 z-50 max-w-[90vw] truncate px-4 py-2.5 rounded-xl bg-slate-900 dark:bg-white text-white dark:text-slate-900 text-xs font-medium shadow-xl border border-slate-700/50">
          {toastMessage}
        </div>
      )}
    </div>
  );
}
