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
  getPreviewCategory,
  isDirectory,
  isSameOrUnder,
  joinUrlPath,
  normalizeDirHref,
} from './utils/format';
import { createDemoWavDataUri } from './utils/demoAssets';
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
  resolveBrandConfig,
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
import { LowSpaceBanner } from './components/ServerInfoPanel';
import { FileExplorer } from './components/FileExplorer';
import { MediaPreviewModal } from './components/MediaPreviewModal';
import { AuthPromptModal } from './components/AuthPromptModal';
import {
  AudioBridge,
  DeleteConfirmModal,
  DragDropOverlay,
  MiniAudioPlayer,
  NewFolderModal,
  PasteUploadModal,
  SandboxDisableConfirmModal,
  UploadQueuePanel,
} from './components/ModalsAndPanels';

const VIEW_MODE_KEY = 'dufs_lume_view_mode';
const THEME_KEY = 'dufs_lume_theme';
const HTML_SANDBOX_KEY = 'dufs_lume_html_sandbox';
const THUMB_PREF_KEY = 'dufs_lume_thumbs';
const ANON_ROOT_HREF = '/share/';

/** 上传并发度：dufs 单进程，2 路是「小文件不排队、大文件不饿死」的折中 */
const UPLOAD_CONCURRENCY = 2;

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
    // Ignore storage errors in restricted environments
  }
}

function getSystemDarkPreference(): boolean {
  if (typeof window === 'undefined' || !window.matchMedia) return false;
  return window.matchMedia('(prefers-color-scheme: dark)').matches;
}

export default function App() {
  const { t } = useTranslation();
  const brand = useMemo(() => resolveBrandConfig(), []);

  // 1. Decode Dufs __INDEX_DATA__ or fall back to interactive Demo Mode
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

  // Sync document title and favicon
  useEffect(() => {
    const customTitle = brand.title?.trim();
    const customSubtitle = brand.subtitle?.trim();
    if (customTitle) {
      document.title = customSubtitle ? `${customTitle} · ${customSubtitle}` : customTitle;
    } else {
      document.title = t('app.title');
    }
    const customIcon = brand.icon?.trim();
    if (customIcon) {
      const link = document.querySelector<HTMLLinkElement>('link[rel="icon"]');
      if (link) link.href = customIcon;
    }
  }, [brand, t]);

  // 2. View mode state ('list' | 'grid')
  const [viewMode, setViewMode] = useState<ViewMode>(() => {
    const saved = safeGetStorage(VIEW_MODE_KEY, 'list');
    return saved === 'grid' ? 'grid' : 'list';
  });

  const handleViewModeChange = (mode: ViewMode) => {
    setViewMode(mode);
    safeSetStorage(VIEW_MODE_KEY, mode);
  };

  // 3. Theme preference ('system' | 'light' | 'dark')
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

  // 4. Language preference ('system' | 'zh' | 'en')
  const [languagePreference, setLanguagePreference] = useState<LanguagePreference>(() =>
    getSavedLanguagePreference()
  );

  const handleLanguagePreferenceChange = (pref: LanguagePreference) => {
    setLanguagePreference(pref);
    setAppLanguagePreference(pref);
  };

  // 5. Search & sort state
  const [searchQuery, setSearchQuery] = useState('');
  const [sortField, setSortField] = useState<SortField>('name');
  const [sortOrder, setSortOrder] = useState<SortOrder>('asc');
  const searchInputRef = useRef<HTMLInputElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // 6. Modals, upload queue, toast, and auth interception state
  const [previewItem, setPreviewItem] = useState<DufsPathItem | null>(null);
  const [mkdirOpen, setMkdirOpen] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<DufsPathItem | null>(null);
  const [isDraggingOver, setIsDraggingOver] = useState(false);
  const dragCounter = useRef(0);

  // Creative Feature 1: Paste Upload Modal State
  const [pasteModalOpen, setPasteModalOpen] = useState(false);
  const [pastedFile, setPastedFile] = useState<File | null>(null);
  const [pasteSnippet, setPasteSnippet] = useState<string | undefined>();
  const [pastePreviewUrl, setPastePreviewUrl] = useState<string | undefined>();

  // Creative Feature 5: Background Mini Audio Player State
  const [activeAudioItem, setActiveAudioItem] = useState<DufsPathItem | null>(null);
  const [activeAudioUrl, setActiveAudioUrl] = useState<string>('');
  const [isAudioPlaying, setIsAudioPlaying] = useState(false);
  const [audioCurrentTime, setAudioCurrentTime] = useState(0);
  const [audioDuration, setAudioDuration] = useState(0);
  const globalAudioRef = useRef<HTMLAudioElement | null>(null);

  const [uploadTasks, setUploadTasks] = useState<UploadTask[]>([]);
  const [authError, setAuthError] = useState<AuthInterceptError | null>(null);
  const [simulateAuthIntercept, setSimulateAuthIntercept] = useState<boolean>(true);
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  // 7. Session auth state & Server Info (Way A: Silent updates on mutation)
  const [authState, setAuthState] = useState<AuthState>(isDemoMode ? 'authenticated' : 'checking');
  const anonRootNormalized = ANON_ROOT_HREF;

  const [serverInfo, setServerInfo] = useState<ServerInfo | null>(() =>
    isDemoMode
      ? {
          generated_at: new Date().toISOString(),
          path: '/var/lib/dufs',
          free_bytes: 68719476736, // 64 GiB
          data_bytes: 4294967296, // 4 GiB
          thumbs: { enabled: true, widths: [128, 256, 512] },
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

  /* ======================= 8. HTML Sandbox & Thumbnail Preferences ======================= */
  const [htmlSandbox, setHtmlSandbox] = useState<boolean>(
    () => safeGetStorage(HTML_SANDBOX_KEY, '1') !== '0'
  );
  const [sandboxConfirmOpen, setSandboxConfirmOpen] = useState(false);

  const applySandboxEnabled = useCallback((enabled: boolean) => {
    setHtmlSandbox(enabled);
    safeSetStorage(HTML_SANDBOX_KEY, enabled ? '1' : '0');
  }, []);

  const requestDisableSandbox = useCallback(() => setSandboxConfirmOpen(true), []);

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

  useEffect(() => {
    if (isDemoMode) {
      setIndexData((prev) => ({
        ...prev,
        paths: demoTree[prev.href] || [],
      }));
    }
  }, [isDemoMode, demoTree]);

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

  const handleNavigateParent = useCallback(() => {
    const current = normalizeDirHref(indexData.href);
    if (current === normalizeDirHref(rootHref)) return;
    const parts = current.split('/').filter(Boolean);
    parts.pop();
    const parentHref = parts.length === 0 ? '/' : `/${parts.join('/')}/`;
    navigateToDirectory(parentHref);
  }, [indexData.href, rootHref, navigateToDirectory]);

  useEffect(() => {
    if (isDemoMode) return;
    if (authState !== 'anonymous') return;
    if (!isSameOrUnder(indexData.href, anonRootNormalized)) {
      navigateToDirectory(anonRootNormalized, 'replace');
    }
  }, [isDemoMode, authState, indexData.href, anonRootNormalized, navigateToDirectory]);

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

  const handleChangeSort = (field: SortField) => {
    if (sortField === field) {
      setSortOrder((prev) => (prev === 'asc' ? 'desc' : 'asc'));
    } else {
      setSortField(field);
      setSortOrder('asc');
    }
  };

  // Filtered and sorted items
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

  // Feature 4: Detect whether current directory contains an HTML entrypoint
  const indexHtmlItem = useMemo(() => {
    return (
      filteredAndSortedItems.find(
        (item) =>
          !isDirectory(item) &&
          (item.name.toLowerCase() === 'index.html' ||
            item.name.toLowerCase() === 'index.htm' ||
            item.name.toLowerCase() === 'interactive-demo.html')
      ) || null
    );
  }, [filteredAndSortedItems]);

  const previewableItems = useMemo(
    () => filteredAndSortedItems.filter((item) => !isDirectory(item)),
    [filteredAndSortedItems]
  );

  const currentPreviewIndex = useMemo(() => {
    if (!previewItem) return -1;
    return previewableItems.findIndex((item) => item.name === previewItem.name);
  }, [previewItem, previewableItems]);

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

  /* ======================= Multi-Selection & Client Streaming ZIP ======================= */
  const [selectedNames, setSelectedNames] = useState<Set<string>>(() => new Set());
  const lastSelectedNameRef = useRef<string | null>(null);
  const [zipJob, setZipJob] = useState<ZipJobProgress | null>(null);

  useEffect(() => {
    setSelectedNames(new Set());
    lastSelectedNameRef.current = null;
    setZipJob(null);
  }, [indexData.href]);

  const selectedItems = useMemo(
    () => filteredAndSortedItems.filter((item) => selectedNames.has(item.name)),
    [filteredAndSortedItems, selectedNames]
  );
  const selectedBytes = useMemo(
    () => selectedItems.reduce((sum, item) => sum + (isDirectory(item) ? 0 : item.size || 0), 0),
    [selectedItems]
  );

  /* ======================= Keyboard Focus & macOS Space Quick Preview (Feature 3) ======================= */
  const [focusedIndex, setFocusedIndex] = useState<number>(-1);

  useEffect(() => {
    setFocusedIndex(-1);
  }, [indexData.href, searchQuery]);

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      const activeEl = document.activeElement as HTMLElement | null;
      const tag = activeEl?.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || activeEl?.isContentEditable) {
        return;
      }

      const anyOtherModalOpen =
        mkdirOpen ||
        !!deleteTarget ||
        sandboxConfirmOpen ||
        !!authError ||
        pasteModalOpen;

      if (anyOtherModalOpen) return;

      if (e.key === '/' && !previewItem) {
        e.preventDefault();
        searchInputRef.current?.focus();
        return;
      }

      if ((e.key === 'Backspace' || (e.altKey && e.key === 'ArrowUp')) && !previewItem) {
        const current = normalizeDirHref(indexData.href);
        if (current !== normalizeDirHref(rootHref)) {
          e.preventDefault();
          handleNavigateParent();
        }
        return;
      }

      // Space key: macOS Finder Quick Look toggle
      if (e.code === 'Space' || e.key === ' ') {
        if (tag === 'VIDEO' || tag === 'AUDIO') return;
        e.preventDefault();
        if (previewItem) {
          setPreviewItem(null);
          return;
        }
        let target: DufsPathItem | undefined =
          focusedIndex >= 0 && focusedIndex < filteredAndSortedItems.length
            ? filteredAndSortedItems[focusedIndex]
            : selectedItems[0];

        if (!target) {
          const firstFileIdx = filteredAndSortedItems.findIndex((it) => !isDirectory(it));
          if (firstFileIdx !== -1) {
            setFocusedIndex(firstFileIdx);
            target = filteredAndSortedItems[firstFileIdx];
          }
        }

        if (target) {
          if (isDirectory(target)) {
            const base = normalizeDirHref(indexData.href);
            navigateToDirectory(`${base}${target.name}/`);
          } else {
            setPreviewItem(target);
          }
        }
        return;
      }

      if (previewItem) return;

      // Enter key: open focused folder or preview focused file
      if (e.key === 'Enter' && tag !== 'BUTTON' && tag !== 'A') {
        if (focusedIndex >= 0 && focusedIndex < filteredAndSortedItems.length) {
          e.preventDefault();
          const item = filteredAndSortedItems[focusedIndex];
          if (isDirectory(item)) {
            const base = normalizeDirHref(indexData.href);
            navigateToDirectory(`${base}${item.name}/`);
          } else {
            setPreviewItem(item);
          }
        }
        return;
      }

      // Arrow keys navigation across List rows and Grid cards
      if (
        filteredAndSortedItems.length > 0 &&
        (e.key === 'ArrowDown' || e.key === 'ArrowUp' || e.key === 'ArrowRight' || e.key === 'ArrowLeft')
      ) {
        e.preventDefault();
        const cols =
          viewMode === 'grid'
            ? window.innerWidth >= 1024
              ? 4
              : window.innerWidth >= 768
              ? 3
              : window.innerWidth >= 640
              ? 2
              : 1
            : 1;

        setFocusedIndex((prev) => {
          const len = filteredAndSortedItems.length;
          let next = prev;
          if (prev < 0) {
            next = 0;
          } else if (e.key === 'ArrowDown') {
            next = Math.min(len - 1, prev + cols);
          } else if (e.key === 'ArrowUp') {
            next = Math.max(0, prev - cols);
          } else if (e.key === 'ArrowRight') {
            next = Math.min(len - 1, prev + 1);
          } else if (e.key === 'ArrowLeft') {
            next = Math.max(0, prev - 1);
          }

          setTimeout(() => {
            const el = document.querySelector(`[data-item-index="${next}"]`);
            el?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
          }, 10);
          return next;
        });
      }
    };

    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [
    previewItem,
    mkdirOpen,
    deleteTarget,
    sandboxConfirmOpen,
    authError,
    pasteModalOpen,
    focusedIndex,
    selectedItems,
    filteredAndSortedItems,
    viewMode,
    indexData.href,
    rootHref,
    handleNavigateParent,
    navigateToDirectory,
  ]);

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

  /* ======================= Uploads & Residue Cleanup ======================= */
  const uploadHandles = useRef(new Map<string, UploadHandle>());
  const uploadTargets = useRef(new Map<string, string>());
  /** 排队中被取消的任务：worker 取到就跳过，不发起 PUT，也不清理远端 */
  const cancelledTaskIds = useRef(new Set<string>());

  const handleFilesUpload = useCallback(
    async (files: FileList | File[]) => {
      const fileArray = Array.from(files);
      if (fileArray.length === 0) return;

      // 先把整批任务以 queued 状态落进面板，再由 worker 按并发度放行。
      // 旧写法是「上传完一个才创建下一个任务」，拖 10 个文件面板上永远只有一行。
      const batch = fileArray.map((file) => ({
        taskId: `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
        file,
        targetPath: joinUrlPath(indexData.uri_prefix, indexData.href, file.name, false),
      }));

      setUploadTasks((prev) => [
        ...batch.map(({ taskId, file, targetPath }): UploadTask => ({
          id: taskId,
          file,
          targetPath,
          progress: 0,
          status: 'queued',
        })),
        ...prev,
      ]);

      const markTask = (taskId: string, patch: Partial<UploadTask>) =>
        setUploadTasks((prev) =>
          prev.map((tItem) => (tItem.id === taskId ? { ...tItem, ...patch } : tItem))
        );

      /** 跑完一个文件；返回 'auth' 表示鉴权被拦，整批剩余任务不再发起 */
      const runOne = async (entry: (typeof batch)[number]): Promise<'ok' | 'auth'> => {
        const { taskId, file, targetPath } = entry;
        markTask(taskId, { status: 'uploading', progress: 0 });

        if (isDemoMode) {
          if (simulateAuthIntercept) {
            markTask(taskId, { status: 'auth_blocked', progress: 0 });
            setAuthError({
              status: 401,
              operation: 'upload',
              targetPath,
              retryCallback: () => handleFilesUpload([file]),
            });
            showToast(t('toast.authTriggered'));
            return 'auth';
          }

          await new Promise((r) => setTimeout(r, 200));
          markTask(taskId, { progress: 65 });

          let demoText: string | undefined;
          let demoMediaUrl: string | undefined;
          if (file.type.startsWith('image/')) {
            demoMediaUrl = URL.createObjectURL(file);
          } else if (file.size < 200 * 1024) {
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
            demoMediaUrl,
          };
          setDemoTree((prev) => {
            const existing = (prev[indexData.href] || []).filter((i) => i.name !== file.name);
            return { ...prev, [indexData.href]: [newItem, ...existing] };
          });

          await new Promise((r) => setTimeout(r, 350));
          markTask(taskId, { progress: 100, status: 'completed' });
          showToast(t('toast.uploadSuccess', { name: file.name }));
          reloadServerInfo();
          return 'ok';
        }

        const handle = uploadFileWithProgress(targetPath, file, (percent) =>
          markTask(taskId, { progress: percent })
        );
        uploadHandles.current.set(taskId, handle);
        uploadTargets.current.set(taskId, targetPath);

        try {
          await handle.promise;
          markTask(taskId, { progress: 100, status: 'completed' });
          showToast(t('toast.uploadSuccess', { name: file.name }));
          await refreshCurrentDirectory();
          reloadServerInfo();
        } catch (err) {
          if (err instanceof UploadCancelledError) {
            markTask(taskId, { status: 'cancelled' });
          } else if (err instanceof DufsAuthError) {
            markTask(taskId, { status: 'auth_blocked' });
            setAuthError({
              status: err.status,
              operation: 'upload',
              targetPath,
              redirectUrl: err.redirectUrl,
              retryCallback: () => handleFilesUpload([file]),
            });
            showToast(t('toast.authTriggered'));
            return 'auth';
          } else {
            markTask(taskId, {
              status: 'failed',
              errorMsg: err instanceof Error ? err.message : 'Upload failed',
            });
            showToast(t('toast.uploadFailed', { name: file.name, msg: describeError(err) }));
          }
        } finally {
          uploadHandles.current.delete(taskId);
          uploadTargets.current.delete(taskId);
          cancelledTaskIds.current.delete(taskId);
        }
        return 'ok';
      };

      let cursor = 0;
      let stopped = false;
      const worker = async () => {
        while (!stopped) {
          const idx = cursor++;
          if (idx >= batch.length) return;
          const entry = batch[idx];
          // 排队期间被取消的：不发 PUT、不清理远端，直接跳过
          if (cancelledTaskIds.current.delete(entry.taskId)) continue;
          if ((await runOne(entry)) === 'auth') stopped = true;
        }
      };
      await Promise.all(
        Array.from({ length: Math.min(UPLOAD_CONCURRENCY, batch.length) }, () => worker())
      );

      // 鉴权被拦后剩下的文件不会再传：把「排队中」结算成「已取消」，别在面板上挂一条假队列
      if (stopped) {
        const batchIds = new Set(batch.map((b) => b.taskId));
        setUploadTasks((prev) =>
          prev.map((tItem) =>
            batchIds.has(tItem.id) && tItem.status === 'queued'
              ? { ...tItem, status: 'cancelled' }
              : tItem
          )
        );
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
      // 排队中的任务还没有 handle：只登记取消，绝不 PUT、也绝不去删远端文件
      cancelledTaskIds.current.add(taskId);

      const handle = uploadHandles.current.get(taskId);
      const targetPath = uploadTargets.current.get(taskId);
      const inFlight = Boolean(handle);
      if (handle) handle.cancel();

      setUploadTasks((prev) =>
        prev.map((tItem) =>
          tItem.id === taskId && (tItem.status === 'uploading' || tItem.status === 'queued')
            ? { ...tItem, status: 'cancelled' }
            : tItem
        )
      );

      if (!inFlight || !targetPath || isDemoMode) return;

      try {
        await deleteFileOrDirectory(targetPath, true);
        showToast(t('toast.uploadCancelled'));
        await refreshCurrentDirectory();
        reloadServerInfo();
      } catch (err) {
        showToast(t('toast.uploadCancelledNoClean', { msg: describeError(err) }));
      }
    },
    [isDemoMode, refreshCurrentDirectory, reloadServerInfo, showToast, t]
  );

  /* ======================= Creative Feature 1: Global Clipboard Paste Upload ======================= */
  useEffect(() => {
    const handlePaste = (e: ClipboardEvent) => {
      if (!canWrite || pasteModalOpen) return;
      const tag = document.activeElement?.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA' || (document.activeElement as HTMLElement)?.isContentEditable) {
        return;
      }

      const items = e.clipboardData?.items;
      if (!items || items.length === 0) return;

      for (let i = 0; i < items.length; i++) {
        const it = items[i];
        if (it.type.startsWith('image/')) {
          const blob = it.getAsFile();
          if (blob) {
            e.preventDefault();
            const now = new Date();
            const pad = (n: number) => String(n).padStart(2, '0');
            const ts = `${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}-${pad(
              now.getHours()
            )}${pad(now.getMinutes())}${pad(now.getSeconds())}`;
            const ext = it.type === 'image/jpeg' ? 'jpg' : 'png';
            const name = `paste-${ts}.${ext}`;
            const file = new File([blob], name, { type: blob.type });

            const previewUrl = URL.createObjectURL(blob);
            setPastedFile(file);
            setPasteSnippet(undefined);
            setPastePreviewUrl(previewUrl);
            setPasteModalOpen(true);
            return;
          }
        }
      }

      const text = e.clipboardData?.getData('text/plain');
      if (text && text.trim().length > 0) {
        e.preventDefault();
        const now = new Date();
        const pad = (n: number) => String(n).padStart(2, '0');
        const ts = `${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}-${pad(
          now.getHours()
        )}${pad(now.getMinutes())}${pad(now.getSeconds())}`;
        const name = `snippet-${ts}.txt`;
        const blob = new Blob([text], { type: 'text/plain;charset=utf-8' });
        const file = new File([blob], name, { type: 'text/plain' });

        setPastedFile(file);
        setPasteSnippet(text);
        setPastePreviewUrl(undefined);
        setPasteModalOpen(true);
      }
    };

    window.addEventListener('paste', handlePaste);
    return () => window.removeEventListener('paste', handlePaste);
  }, [canWrite, pasteModalOpen]);

  const handleOpenPasteModalFromToolbar = useCallback(async () => {
    try {
      if (navigator.clipboard && navigator.clipboard.readText) {
        const txt = await navigator.clipboard.readText();
        if (txt && txt.trim()) {
          setPastedFile(null);
          setPasteSnippet(txt);
          setPastePreviewUrl(undefined);
          setPasteModalOpen(true);
          return;
        }
      }
    } catch {
      // Browser/iframe blocked programmatic clipboard read; open interactive modal
    }
    setPastedFile(null);
    setPasteSnippet('');
    setPastePreviewUrl(undefined);
    setPasteModalOpen(true);
  }, []);

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
      reloadServerInfo();
      return;
    }

    try {
      await createDirectoryMkcol(targetUrl);
      showToast(t('toast.mkdirSuccess', { name: folderName }));
      await refreshCurrentDirectory();
      reloadServerInfo();
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
      reloadServerInfo();
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

  /* ======================= Creative Feature 5: Background Mini Audio Player Logic ======================= */
  const resolveAudioSrc = useCallback(
    (item: DufsPathItem) => {
      if (item.demoMediaUrl) return item.demoMediaUrl;
      if (isDemoMode) return createDemoWavDataUri(item.name);
      return joinUrlPath(indexData.uri_prefix, indexData.href, item.name, false);
    },
    [isDemoMode, indexData.uri_prefix, indexData.href]
  );

  /** 换曲时是否要在 src 就绪后自动接上播放（元素上不再写 autoPlay，播放意图由我们控制） */
  const pendingPlayRef = useRef(false);

  /**
   * 全站唯一的音频引擎：迷你播放器与详情弹窗读的都是这一个 <audio> 的状态。
   * 同一首重复装载 = 什么都不做（位置与播放状态原样保留），所以「展开」不会从头播放。
   */
  const loadAudioTrack = useCallback(
    (item: DufsPathItem, autoplay: boolean) => {
      const el = globalAudioRef.current;
      if (activeAudioItem?.name === item.name && activeAudioUrl) {
        if (autoplay && el?.paused) el.play().catch(() => {});
        return;
      }
      setActiveAudioItem(item);
      setActiveAudioUrl(resolveAudioSrc(item));
      setAudioCurrentTime(0);
      setAudioDuration(0);
      pendingPlayRef.current = autoplay;
    },
    [activeAudioItem, activeAudioUrl, resolveAudioSrc]
  );

  // src 变更后按播放意图决定是否接上播
  useEffect(() => {
    const el = globalAudioRef.current;
    if (!el || !activeAudioUrl || !pendingPlayRef.current) return;
    pendingPlayRef.current = false;
    el.play().catch(() => {});
  }, [activeAudioUrl]);

  // 详情弹窗打开的是音频 ⇒ 把这一首装进播放器：之前正在播就继续播，没播就停在 0 等用户按
  const lastLoadedPreviewAudioRef = useRef<string | null>(null);
  useEffect(() => {
    const isAudio =
      !!previewItem && !isDirectory(previewItem) && getPreviewCategory(previewItem.name) === 'audio';
    if (!previewItem || !isAudio) {
      lastLoadedPreviewAudioRef.current = null;
      return;
    }
    if (lastLoadedPreviewAudioRef.current === previewItem.name) return;
    lastLoadedPreviewAudioRef.current = previewItem.name;
    loadAudioTrack(previewItem, Boolean(globalAudioRef.current && !globalAudioRef.current.paused));
  }, [previewItem, loadAudioTrack]);

  /** 关闭弹窗：只是点开看过、一帧没播 ⇒ 不把它留在后台播放器里 */
  const closePreview = useCallback(() => {
    setPreviewItem(null);
    const el = globalAudioRef.current;
    if (el && el.paused && el.currentTime === 0) {
      setActiveAudioItem(null);
      setActiveAudioUrl('');
      setAudioCurrentTime(0);
      setAudioDuration(0);
    }
  }, []);

  const toggleGlobalAudioPlay = () => {
    if (!globalAudioRef.current) return;
    if (isAudioPlaying) {
      globalAudioRef.current.pause();
      setIsAudioPlaying(false);
    } else {
      globalAudioRef.current.play().then(() => setIsAudioPlaying(true)).catch(() => {});
    }
  };

  /** 弹窗里的音/视频真的开始播了 → 暂停后台迷你播放器，保证全局只有一个声音 */
  const pauseGlobalAudio = useCallback(() => {
    if (globalAudioRef.current) globalAudioRef.current.pause();
  }, []);

  const audioFiles = useMemo(
    () =>
      filteredAndSortedItems.filter(
        (i) => !isDirectory(i) && getPreviewCategory(i.name) === 'audio'
      ),
    [filteredAndSortedItems]
  );

  const currentAudioIndex = useMemo(() => {
    if (!activeAudioItem) return -1;
    return audioFiles.findIndex((i) => i.name === activeAudioItem.name);
  }, [activeAudioItem, audioFiles]);

  const handlePrevAudio = () => {
    if (currentAudioIndex > 0) loadAudioTrack(audioFiles[currentAudioIndex - 1], true);
  };

  const handleNextAudio = () => {
    if (currentAudioIndex >= 0 && currentAudioIndex < audioFiles.length - 1) {
      loadAudioTrack(audioFiles[currentAudioIndex + 1], true);
    }
  };

  /**
   * 详情弹窗的音频面板 = 全站唯一引擎的遥控器。
   * 弹窗显示的不是音频时为 null（此时由迷你播放器接管显示，两者永远只有一个在展示同一首）。
   */
  const audioBridge: AudioBridge | null = useMemo(() => {
    if (!previewItem || isDirectory(previewItem) || getPreviewCategory(previewItem.name) !== 'audio') {
      return null;
    }
    return {
      trackName: previewItem.name,
      isPlaying: isAudioPlaying,
      currentTime: audioCurrentTime,
      duration: audioDuration,
      onTogglePlay: toggleGlobalAudioPlay,
      onSeek: (time: number) => {
        if (globalAudioRef.current) {
          globalAudioRef.current.currentTime = time;
          setAudioCurrentTime(time);
        }
      },
      onPrev: currentAudioIndex > 0 ? handlePrevAudio : undefined,
      onNext:
        currentAudioIndex >= 0 && currentAudioIndex < audioFiles.length - 1
          ? handleNextAudio
          : undefined,
    };
  }, [
    previewItem,
    isAudioPlaying,
    audioCurrentTime,
    audioDuration,
    toggleGlobalAudioPlay,
    currentAudioIndex,
    audioFiles,
    handlePrevAudio,
    handleNextAudio,
  ]);

  /* ======================= Auth Redirect & Session Check ======================= */
  const resolvedLoginUrl = useMemo(
    () => buildLoginUrl(joinUrlPath(indexData.uri_prefix, '/'), brand.loginUrl),
    [indexData.uri_prefix, brand.loginUrl]
  );

  const handleLoginClick = useCallback(() => {
    window.location.href = resolvedLoginUrl;
  }, [resolvedLoginUrl]);

  const handleRecheckAuth = useCallback(async () => {
    if (isDemoMode) return;
    setAuthState('checking');
    const { authState: nextState, serverInfo: nextInfo } = await probeAuthAndInfo(
      joinUrlPath(indexData.uri_prefix, '/')
    );
    setAuthState(nextState);
    setServerInfo(nextInfo);
  }, [isDemoMode, indexData.uri_prefix]);

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
    // `overflow-x-clip` 而不是 `overflow-x-hidden`：后者会让 overflow-y 按规范算成 auto ⇒ 这个 div
    // 自己变成滞动容器，里面的 `sticky` 顶栏就“跟着页面跑”（实测就是这个原因）。
    // `clip` 不建立滞动容器，sticky 仍以视口为参考。Safari <16 不认 clip ⇒ 声明被丢弃，
    // 代价只是可能多一条横向滚动条，不会弄坏顶栏。
    <div
      className="min-h-screen flex flex-col overflow-x-clip bg-slate-50 dark:bg-slate-950 text-slate-900 dark:text-slate-100"
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

      {/* Hidden Audio element for background Mini Player */}
      {activeAudioUrl && (
        <audio
          ref={globalAudioRef}
          src={activeAudioUrl}
          onTimeUpdate={(e) => setAudioCurrentTime(e.currentTarget.currentTime)}
          onLoadedMetadata={(e) => setAudioDuration(e.currentTarget.duration || 0)}
          onEnded={() => {
            if (currentAudioIndex >= 0 && currentAudioIndex < audioFiles.length - 1) {
              handleNextAudio();
            } else {
              setIsAudioPlaying(false);
            }
          }}
          onPlay={() => setIsAudioPlaying(true)}
          onPause={() => setIsAudioPlaying(false)}
        />
      )}

      <Navbar
        brand={brand}
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
        serverInfo={serverInfo}
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
        onOpenPasteModal={handleOpenPasteModalFromToolbar}
        onOpenMkdirModal={() => setMkdirOpen(true)}
        searchInputRef={searchInputRef}
      />

      <main className="flex-1 max-w-7xl w-full mx-auto px-3 sm:px-6 lg:px-8 min-w-0">
        <Breadcrumbs
          currentHref={indexData.href}
          rootHref={rootHref}
          onNavigate={(href) => navigateToDirectory(href)}
          onNavigateParent={handleNavigateParent}
          folderCount={stats.folders}
          fileCount={stats.files}
          totalBytes={stats.totalBytes}
          freeBytes={serverInfo?.free_bytes}
          viewMode={viewMode}
          sortField={sortField}
          sortOrder={sortOrder}
          onChangeSort={handleChangeSort}
          indexHtmlName={indexHtmlItem?.name}
          onLaunchSite={() => indexHtmlItem && setPreviewItem(indexHtmlItem)}
          showSelectAll={viewMode === 'grid'}
          allSelected={allVisibleSelected}
          someSelected={someVisibleSelected}
          totalSelectableCount={filteredAndSortedItems.length}
          onToggleSelectAll={handleToggleSelectAll}
          zipButton={
            viewMode === 'grid' && zipControls ? <ZipButton variant="pill" zip={zipControls} /> : null
          }
        />

        {/* Low Space Banner (Way A: 0 vertical height when storage is healthy) */}
        {serverInfo && authState === 'authenticated' && !publicAreaOnly && (
          <LowSpaceBanner status={serverInfo} />
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
          focusedIndex={focusedIndex}
          uriPrefix={indexData.uri_prefix}
          isDemoMode={isDemoMode}
          thumbsEnabled={thumbsEnabled}
          thumbSource={thumbSource}
          thumbScope={publicAreaOnly ? 'share' : 'full'}
          onToggleSelect={handleToggleSelect}
          onToggleSelectAll={handleToggleSelectAll}
          onItemClick={handleItemClick}
          onItemFocus={(idx) => setFocusedIndex(idx)}
          onNavigateParent={handleNavigateParent}
          onCopyDirectLink={handleCopyDirectLink}
          onDownloadItem={handleDownloadItem}
          onRequestDelete={(item) => setDeleteTarget(item)}
        />
      </main>

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
        navIndex={currentPreviewIndex}
        navCount={previewableItems.length}
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
        onClose={closePreview}
        blockAutoPlay={isAudioPlaying}
        onMediaPlay={pauseGlobalAudio}
        audio={audioBridge}
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

      {/* Paste Upload Confirmation Modal */}
      <PasteUploadModal
        isOpen={pasteModalOpen}
        initialFile={pastedFile}
        initialText={pasteSnippet}
        initialImagePreviewUrl={pastePreviewUrl}
        onCancel={() => {
          if (pastePreviewUrl) URL.revokeObjectURL(pastePreviewUrl);
          setPasteModalOpen(false);
          setPastedFile(null);
          setPasteSnippet(undefined);
          setPastePreviewUrl(undefined);
        }}
        onConfirm={(file) => {
          if (pastePreviewUrl) URL.revokeObjectURL(pastePreviewUrl);
          setPasteModalOpen(false);
          setPastedFile(null);
          setPasteSnippet(undefined);
          setPastePreviewUrl(undefined);
          handleFilesUpload([file]);
        }}
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
        loginUrl={resolvedLoginUrl}
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
            prev.filter((tItem) => tItem.status === 'uploading' || tItem.status === 'queued')
          )
        }
        onDismissTask={(id) =>
          setUploadTasks((prev) => prev.filter((tItem) => tItem.id !== id))
        }
        onCancelTask={handleCancelUpload}
      />

      {/* Floating Mini Audio Player —— 弹窗里有音频面板时不重复出现（同一个引擎、同一份状态） */}
      {!audioBridge && (
      <MiniAudioPlayer
        item={activeAudioItem}
        isPlaying={isAudioPlaying}
        currentTime={audioCurrentTime}
        duration={audioDuration}
        onSeek={(time) => {
          if (globalAudioRef.current) {
            globalAudioRef.current.currentTime = time;
            setAudioCurrentTime(time);
          }
        }}
        onTogglePlay={toggleGlobalAudioPlay}
        onPrev={currentAudioIndex > 0 ? handlePrevAudio : undefined}
        onNext={currentAudioIndex >= 0 && currentAudioIndex < audioFiles.length - 1 ? handleNextAudio : undefined}
        onExpand={() => {
          // 同一个引擎，展开只是换一套控件：不暂停、不重载、位置不动
          if (activeAudioItem) setPreviewItem(activeAudioItem);
        }}
        onClose={() => {
          if (globalAudioRef.current) globalAudioRef.current.pause();
          setIsAudioPlaying(false);
          setActiveAudioItem(null);
          setActiveAudioUrl('');
          setAudioCurrentTime(0);
          setAudioDuration(0);
        }}
      />
      )}

      {toastMessage && (
        <div className="fixed bottom-5 left-1/2 -translate-x-1/2 z-50 max-w-[90vw] truncate px-4 py-2.5 rounded-xl bg-slate-900 dark:bg-white text-white dark:text-slate-900 text-xs font-medium shadow-2xl border border-slate-700/50 animate-slideUp">
          {toastMessage}
        </div>
      )}
    </div>
  );
}
