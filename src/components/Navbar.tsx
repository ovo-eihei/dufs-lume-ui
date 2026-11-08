import React, { useState, useRef, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import {
  Search,
  X,
  Upload,
  ClipboardPaste,
  FolderPlus,
  LayoutList,
  LayoutGrid,
  Sun,
  Moon,
  Monitor,
  Globe,
  ShieldAlert,
  Settings,
  LogIn,
  RefreshCw,
  ImageIcon,
  ShieldQuestion,
  Sparkles,
  HardDrive,
} from 'lucide-react';
import {
  AuthState,
  LanguagePreference,
  LumeBrandConfig,
  ServerInfo,
  ThemePreference,
  ThumbPreference,
  ViewMode,
} from '../types/dufs';
import { formatBytes } from '../utils/format';

interface NavbarProps {
  brand?: LumeBrandConfig;
  searchQuery: string;
  onSearchChange: (q: string) => void;
  viewMode: ViewMode;
  onViewModeChange: (mode: ViewMode) => void;
  themePreference: ThemePreference;
  resolvedDarkMode: boolean;
  onThemePreferenceChange: (pref: ThemePreference) => void;
  languagePreference: LanguagePreference;
  onLanguagePreferenceChange: (pref: LanguagePreference) => void;
  allowUpload: boolean;
  canWrite: boolean;
  authState: AuthState;
  onLoginClick: () => void;
  onRecheckAuth: () => void;
  serverInfo?: ServerInfo | null;
  thumbPreference: ThumbPreference;
  onThumbPreferenceChange: (pref: ThumbPreference) => void;
  serverThumbsAvailable: boolean;
  htmlSandbox: boolean;
  onEnableSandbox: () => void;
  onRequestDisableSandbox: () => void;
  isDemoMode: boolean;
  simulateAuthIntercept: boolean;
  onToggleSimulateAuth: () => void;
  onTriggerUploadClick: () => void;
  onOpenPasteModal: () => void;
  onOpenMkdirModal: () => void;
  searchInputRef: React.RefObject<HTMLInputElement>;
}

export const Navbar: React.FC<NavbarProps> = ({
  brand,
  searchQuery,
  onSearchChange,
  viewMode,
  onViewModeChange,
  themePreference,
  onThemePreferenceChange,
  languagePreference,
  onLanguagePreferenceChange,
  allowUpload,
  canWrite,
  authState,
  onLoginClick,
  onRecheckAuth,
  serverInfo,
  thumbPreference,
  onThumbPreferenceChange,
  serverThumbsAvailable,
  htmlSandbox,
  onEnableSandbox,
  onRequestDisableSandbox,
  isDemoMode,
  simulateAuthIntercept,
  onToggleSimulateAuth,
  onTriggerUploadClick,
  onOpenPasteModal,
  onOpenMkdirModal,
  searchInputRef,
}) => {
  const { t } = useTranslation();
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [iconLoadFailed, setIconLoadFailed] = useState(false);
  const [sandboxHintOpen, setSandboxHintOpen] = useState(false);
  const settingsDropdownRef = useRef<HTMLDivElement>(null);

  const brandTitle = brand?.title?.trim() || t('app.title');
  const brandSubtitle = brand?.subtitle?.trim() || t('app.subtitle');
  const brandIconUrl = brand?.icon?.trim() || '';

  useEffect(() => {
    setIconLoadFailed(false);
  }, [brandIconUrl]);

  const accessStateLabel = isDemoMode
    ? t('app.demoBadge')
    : authState === 'anonymous'
    ? t('access.stateAnonymous')
    : authState === 'authenticated'
    ? t('access.stateAuthenticated')
    : authState === 'checking'
    ? t('access.stateChecking')
    : t('access.stateUnknown');
  const accessStateTone =
    authState === 'anonymous' || authState === 'checking'
      ? 'bg-amber-500/10 text-amber-700 dark:text-amber-300 border-amber-500/30'
      : 'bg-emerald-500/10 text-emerald-700 dark:text-emerald-300 border-emerald-500/30';

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (
        settingsDropdownRef.current &&
        !settingsDropdownRef.current.contains(e.target as Node)
      ) {
        setSettingsOpen(false);
      }
    };
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setSettingsOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    window.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, []);

  return (
    <header className="sticky top-0 z-30 backdrop-blur-xl bg-white/85 dark:bg-slate-900/85 border-b border-slate-200/80 dark:border-slate-800/80 transition-colors">
      <div className="max-w-7xl mx-auto px-3 sm:px-6 lg:px-8 py-2.5 md:py-0 md:h-16 flex flex-wrap md:flex-nowrap items-center justify-between gap-2.5 md:gap-4">
        {/* Brand Logo & Title */}
        <div className="flex items-center gap-2.5 sm:gap-3 shrink-0 min-w-0">
          {brandIconUrl && !iconLoadFailed ? (
            <img
              src={brandIconUrl}
              alt={brandTitle}
              onError={() => setIconLoadFailed(true)}
              className="w-9 h-9 sm:w-10 sm:h-10 rounded-xl object-cover shrink-0 shadow-sm transition-transform active:scale-95"
            />
          ) : (
            <div className="w-9 h-9 sm:w-10 sm:h-10 rounded-xl bg-gradient-to-br from-indigo-500 to-violet-600 flex items-center justify-center text-white shadow-md shadow-indigo-500/20 shrink-0 transition-transform active:scale-95">
              <Sparkles className="w-4 h-4 sm:w-5 sm:h-5" />
            </div>
          )}
          <div className="min-w-0">
            <div className="flex items-center gap-1.5 sm:gap-2">
              <span className="font-bold text-sm sm:text-base tracking-tight text-slate-900 dark:text-white truncate">
                {brandTitle}
              </span>
              {isDemoMode && (
                <span className="text-[10px] sm:text-[11px] font-medium px-1.5 sm:px-2 py-0.5 rounded-full bg-indigo-500/10 text-indigo-600 dark:text-indigo-400 border border-indigo-500/20 shrink-0">
                  {t('app.demoBadge')}
                </span>
              )}
            </div>
            <p className="text-xs text-slate-500 dark:text-slate-400 hidden sm:block truncate">
              {brandSubtitle}
            </p>
          </div>
        </div>

        {/* Search Input Bar */}
        <div className="order-3 md:order-2 w-full md:w-auto md:flex-1 md:max-w-xl md:mx-2">
          <div className="relative flex items-center">
            <Search className="w-4 h-4 text-slate-400 absolute left-3.5 pointer-events-none" />
            <input
              ref={searchInputRef}
              type="text"
              value={searchQuery}
              onChange={(e) => onSearchChange(e.target.value)}
              placeholder={t('toolbar.searchPlaceholder')}
              className="w-full pl-9 pr-8 py-2 text-xs sm:text-sm rounded-xl bg-slate-100/90 dark:bg-slate-800/90 text-slate-900 dark:text-slate-100 placeholder-slate-400 dark:placeholder-slate-500 border border-transparent focus:border-indigo-500 focus:bg-white dark:focus:bg-slate-900 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 transition-all"
            />
            {searchQuery && (
              <button
                type="button"
                onClick={() => onSearchChange('')}
                title={t('toolbar.clearSearch')}
                className="absolute right-2.5 p-1 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 rounded-md active:scale-90 transition-transform"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            )}
          </div>
        </div>

        {/* Right Controls: Actions, View Mode, Gear Settings */}
        <div className="order-2 md:order-3 flex items-center gap-1 sm:gap-1.5 shrink-0">
          {/* Demo Mode Auth Guard Simulator Toggle */}
          {isDemoMode && (
            <button
              type="button"
              onClick={onToggleSimulateAuth}
              title={simulateAuthIntercept ? t('auth.demoToggleOn') : t('auth.demoToggleOff')}
              className={`hidden xl:inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-xl text-xs font-medium border active:scale-95 transition-all ${
                simulateAuthIntercept
                  ? 'bg-amber-500/10 text-amber-700 dark:text-amber-300 border-amber-500/30'
                  : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 border-transparent hover:border-slate-300 dark:hover:border-slate-700'
              }`}
            >
              <ShieldAlert className="w-3.5 h-3.5" />
              <span>{t('toolbar.simulateAuth')}</span>
            </button>
          )}

          {/* Upload Button */}
          {allowUpload && canWrite && (
            <button
              type="button"
              onClick={onTriggerUploadClick}
              title={t('toolbar.upload')}
              className="inline-flex items-center justify-center gap-1.5 p-2 sm:px-3 sm:py-2 rounded-xl text-xs sm:text-sm font-medium bg-indigo-600 hover:bg-indigo-500 text-white shadow-sm shadow-indigo-500/20 active:scale-95 transition-all cursor-pointer"
            >
              <Upload className="w-4 h-4 shrink-0" />
              <span className="hidden lg:inline">{t('toolbar.upload')}</span>
            </button>
          )}

          {/* Paste Upload Button (Feature 1: Ctrl+V or Click) */}
          {allowUpload && canWrite && (
            <button
              type="button"
              onClick={onOpenPasteModal}
              title={t('toolbar.pasteUpload')}
              aria-label={t('toolbar.pasteUpload')}
              className="inline-flex items-center justify-center gap-1.5 p-2 sm:px-2.5 sm:py-2 rounded-xl text-xs sm:text-sm font-medium bg-slate-100 hover:bg-slate-200/80 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 active:scale-95 transition-all"
            >
              <ClipboardPaste className="w-4 h-4 shrink-0" />
            </button>
          )}

          {/* New Folder Button */}
          {allowUpload && canWrite && (
            <button
              type="button"
              onClick={onOpenMkdirModal}
              title={t('toolbar.newFolder')}
              className="inline-flex items-center justify-center gap-1.5 p-2 sm:px-2.5 sm:py-2 rounded-xl text-xs sm:text-sm font-medium bg-slate-100 hover:bg-slate-200/80 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 active:scale-95 transition-all"
            >
              <FolderPlus className="w-4 h-4 shrink-0" />
              <span className="hidden xl:inline">{t('toolbar.newFolder')}</span>
            </button>
          )}

          <div className="h-5 w-px bg-slate-200 dark:bg-slate-800 mx-0.5 hidden sm:block" />

          {/* List / Grid View Switcher */}
          <div className="inline-flex items-center p-0.5 sm:p-1 rounded-xl bg-slate-100 dark:bg-slate-800 border border-slate-200/60 dark:border-slate-700/60">
            <button
              type="button"
              onClick={() => onViewModeChange('list')}
              title={t('toolbar.viewList')}
              aria-label={t('toolbar.viewList')}
              className={`p-1.5 rounded-lg active:scale-90 transition-all ${
                viewMode === 'list'
                  ? 'bg-white dark:bg-slate-900 text-indigo-600 dark:text-indigo-400 shadow-sm'
                  : 'text-slate-500 hover:text-slate-800 dark:text-slate-400 dark:hover:text-slate-200'
              }`}
            >
              <LayoutList className="w-4 h-4" />
            </button>
            <button
              type="button"
              onClick={() => onViewModeChange('grid')}
              title={t('toolbar.viewGrid')}
              aria-label={t('toolbar.viewGrid')}
              className={`p-1.5 rounded-lg active:scale-90 transition-all ${
                viewMode === 'grid'
                  ? 'bg-white dark:bg-slate-900 text-indigo-600 dark:text-indigo-400 shadow-sm'
                  : 'text-slate-500 hover:text-slate-800 dark:text-slate-400 dark:hover:text-slate-200'
              }`}
            >
              <LayoutGrid className="w-4 h-4" />
            </button>
          </div>

          {/* Preferences Dropdown Menu */}
          <div className="relative" ref={settingsDropdownRef}>
            <button
              type="button"
              onClick={() => setSettingsOpen((prev) => !prev)}
              title={t('toolbar.settings')}
              aria-label={t('toolbar.settings')}
              aria-expanded={settingsOpen}
              className={`p-2 rounded-xl border active:scale-95 transition-all ${
                settingsOpen
                  ? 'bg-indigo-500/10 text-indigo-600 dark:text-indigo-400 border-indigo-500/30'
                  : 'bg-slate-100 hover:bg-slate-200/80 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 border-transparent'
              }`}
            >
              <Settings
                className={`w-4 h-4 transition-transform duration-200 ${
                  settingsOpen ? 'rotate-45' : ''
                }`}
              />
            </button>

            {settingsOpen && (
              <div className="absolute right-0 mt-2 w-64 max-w-[calc(100vw-1.5rem)] rounded-2xl bg-white dark:bg-slate-900 shadow-xl border border-slate-200/90 dark:border-slate-800 p-3 z-50 space-y-2.5 origin-top-right animate-dropdownIn">
                {/* 1. Language Section: 系统 / 中文 / EN */}
                <div className="space-y-1.5">
                  <div className="flex items-center gap-1.5 text-xs font-semibold text-slate-500 dark:text-slate-400 px-0.5">
                    <Globe className="w-3.5 h-3.5 text-indigo-500 shrink-0" />
                    <span>{t('toolbar.language')}</span>
                  </div>
                  <div className="grid grid-cols-3 gap-1 p-1 rounded-xl bg-slate-100 dark:bg-slate-800/90 border border-slate-200/60 dark:border-slate-700/60">
                    <button
                      type="button"
                      onClick={() => onLanguagePreferenceChange('system')}
                      className={`py-1 px-1.5 rounded-lg text-xs font-medium whitespace-nowrap active:scale-95 transition-all text-center ${
                        languagePreference === 'system'
                          ? 'bg-white dark:bg-slate-900 text-indigo-600 dark:text-indigo-400 shadow-sm font-semibold'
                          : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
                      }`}
                    >
                      {t('toolbar.langSystem')}
                    </button>
                    <button
                      type="button"
                      onClick={() => onLanguagePreferenceChange('zh')}
                      className={`py-1 px-1.5 rounded-lg text-xs font-medium whitespace-nowrap active:scale-95 transition-all text-center ${
                        languagePreference === 'zh'
                          ? 'bg-white dark:bg-slate-900 text-indigo-600 dark:text-indigo-400 shadow-sm font-semibold'
                          : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
                      }`}
                    >
                      {t('toolbar.langZh')}
                    </button>
                    <button
                      type="button"
                      onClick={() => onLanguagePreferenceChange('en')}
                      className={`py-1 px-1.5 rounded-lg text-xs font-medium whitespace-nowrap active:scale-95 transition-all text-center ${
                        languagePreference === 'en'
                          ? 'bg-white dark:bg-slate-900 text-indigo-600 dark:text-indigo-400 shadow-sm font-semibold'
                          : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
                      }`}
                    >
                      {t('toolbar.langEn')}
                    </button>
                  </div>
                </div>

                <div className="border-t border-slate-100 dark:border-slate-800" />

                {/* 2. Appearance Section: 系统 / 浅色 / 深色 */}
                <div className="space-y-1.5">
                  <div className="flex items-center gap-1.5 text-xs font-semibold text-slate-500 dark:text-slate-400 px-0.5">
                    <Monitor className="w-3.5 h-3.5 text-indigo-500 shrink-0" />
                    <span>{t('toolbar.theme')}</span>
                  </div>
                  <div className="grid grid-cols-3 gap-1 p-1 rounded-xl bg-slate-100 dark:bg-slate-800/90 border border-slate-200/60 dark:border-slate-700/60">
                    <button
                      type="button"
                      onClick={() => onThemePreferenceChange('system')}
                      className={`py-1 px-1.5 rounded-lg text-xs font-medium whitespace-nowrap inline-flex items-center justify-center gap-1 active:scale-95 transition-all ${
                        themePreference === 'system'
                          ? 'bg-white dark:bg-slate-900 text-indigo-600 dark:text-indigo-400 shadow-sm font-semibold'
                          : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
                      }`}
                    >
                      <Monitor className="w-3 h-3 shrink-0" />
                      <span>{t('toolbar.themeSystem')}</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => onThemePreferenceChange('light')}
                      className={`py-1 px-1.5 rounded-lg text-xs font-medium whitespace-nowrap inline-flex items-center justify-center gap-1 active:scale-95 transition-all ${
                        themePreference === 'light'
                          ? 'bg-white dark:bg-slate-900 text-indigo-600 dark:text-indigo-400 shadow-sm font-semibold'
                          : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
                      }`}
                    >
                      <Sun className="w-3 h-3 shrink-0" />
                      <span>{t('toolbar.themeLight')}</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => onThemePreferenceChange('dark')}
                      className={`py-1 px-1.5 rounded-lg text-xs font-medium whitespace-nowrap inline-flex items-center justify-center gap-1 active:scale-95 transition-all ${
                        themePreference === 'dark'
                          ? 'bg-white dark:bg-slate-900 text-indigo-600 dark:text-indigo-400 shadow-sm font-semibold'
                          : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
                      }`}
                    >
                      <Moon className="w-3 h-3 shrink-0" />
                      <span>{t('toolbar.themeDark')}</span>
                    </button>
                  </div>
                </div>

                <div className="border-t border-slate-100 dark:border-slate-800" />

                {/* 3. Image Thumbnails Section (Embedded server capability status on header) */}
                <div className="space-y-1.5">
                  <div className="flex items-center justify-between text-xs px-0.5">
                    <span className="inline-flex items-center gap-1.5 font-semibold text-slate-500 dark:text-slate-400">
                      <ImageIcon className="w-3.5 h-3.5 text-indigo-500 shrink-0" />
                      <span>{t('thumbs.sectionTitle')}</span>
                    </span>
                    <span
                      title={t(
                        thumbPreference === 'off'
                          ? 'thumbs.hintOff'
                          : serverThumbsAvailable
                          ? 'thumbs.hintServer'
                          : 'thumbs.hintClient'
                      )}
                      className="inline-flex items-center gap-1 text-[11px] text-slate-400 dark:text-slate-500"
                    >
                      <span
                        className={`w-1.5 h-1.5 rounded-full shrink-0 ${
                          serverThumbsAvailable
                            ? 'bg-emerald-500/80'
                            : 'bg-slate-300 dark:bg-slate-600'
                        }`}
                      />
                      <span>{t(serverThumbsAvailable ? 'disk.capThumbsOn' : 'disk.capThumbsOff')}</span>
                    </span>
                  </div>

                  <div className="grid grid-cols-3 gap-1 p-1 rounded-xl bg-slate-100 dark:bg-slate-800/90 border border-slate-200/60 dark:border-slate-700/60">
                    {(['auto', 'on', 'off'] as const).map((mode) => (
                      <button
                        key={mode}
                        type="button"
                        onClick={() => onThumbPreferenceChange(mode)}
                        className={`py-1 px-1.5 rounded-lg text-xs font-medium whitespace-nowrap active:scale-95 transition-all text-center ${
                          thumbPreference === mode
                            ? 'bg-white dark:bg-slate-900 text-indigo-600 dark:text-indigo-400 shadow-sm font-semibold'
                            : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
                        }`}
                      >
                        {t(`thumbs.mode_${mode}`)}
                      </button>
                    ))}
                  </div>
                </div>

                <div className="border-t border-slate-100 dark:border-slate-800" />

                {/* 4. HTML Preview Sandbox Section (Compact single-row layout) */}
                <div className="relative">
                  <div className="flex items-center justify-between gap-2 px-0.5 py-0.5">
                    <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-slate-500 dark:text-slate-400">
                      <ShieldQuestion className="w-3.5 h-3.5 text-indigo-500 shrink-0" />
                      <span>{t('sandbox.settingLabel')}</span>
                      <button
                        type="button"
                        onClick={() => setSandboxHintOpen((v) => !v)}
                        onMouseEnter={() => setSandboxHintOpen(true)}
                        onMouseLeave={() => setSandboxHintOpen(false)}
                        className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-200"
                        title={t('sandbox.bannerWhy')}
                      >
                        <span className="inline-flex items-center justify-center w-3.5 h-3.5 rounded-full border border-current text-[10px] leading-none">
                          ?
                        </span>
                      </button>
                    </span>

                    <button
                      type="button"
                      onClick={() => {
                        if (htmlSandbox) {
                          onRequestDisableSandbox();
                        } else {
                          onEnableSandbox();
                        }
                      }}
                      className={`px-2 py-0.5 rounded-lg text-xs font-semibold active:scale-95 transition-all border ${
                        htmlSandbox
                          ? 'bg-emerald-500/10 text-emerald-700 dark:text-emerald-300 border-emerald-500/30'
                          : 'bg-amber-500/10 text-amber-700 dark:text-amber-300 border-amber-500/30'
                      }`}
                    >
                      {t(htmlSandbox ? 'sandbox.stateOn' : 'sandbox.stateOff')}
                    </button>
                  </div>

                  {sandboxHintOpen && (
                    <div className="absolute left-0 right-0 top-full mt-1.5 p-2.5 rounded-xl bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 shadow-xl text-[11px] leading-relaxed text-slate-600 dark:text-slate-300 z-20 animate-fadeIn">
                      {t(htmlSandbox ? 'sandbox.hintOn' : 'sandbox.hintOff')}
                    </div>
                  )}
                </div>

                <div className="border-t border-slate-100 dark:border-slate-800" />

                {/* 5. Compact Session Status & Storage Metrics */}
                <div className="space-y-1.5">
                  <div
                    className={`flex items-center justify-between gap-1.5 px-2.5 py-1.5 rounded-xl border text-xs font-medium ${accessStateTone}`}
                  >
                    <span className="inline-flex items-center gap-1.5 min-w-0">
                      <span className="w-1.5 h-1.5 rounded-full bg-current shrink-0" />
                      <span className="truncate">{accessStateLabel}</span>
                    </span>

                    <div className="flex items-center gap-1 shrink-0">
                      {(!isDemoMode ? authState === 'anonymous' : false) && (
                        <button
                          type="button"
                          onClick={onLoginClick}
                          className="px-2 py-0.5 rounded-lg text-xs font-semibold bg-indigo-600 hover:bg-indigo-500 text-white shadow-sm active:scale-95 transition-all inline-flex items-center gap-1"
                        >
                          <LogIn className="w-3 h-3" />
                          <span>{t('access.loginBtn')}</span>
                        </button>
                      )}
                      {!isDemoMode && (
                        <button
                          type="button"
                          onClick={onRecheckAuth}
                          title={t('access.recheck')}
                          className="p-1 rounded-lg hover:bg-black/5 dark:hover:bg-white/10 active:scale-90 transition-transform shrink-0"
                        >
                          <RefreshCw className="w-3 h-3" />
                        </button>
                      )}
                    </div>
                  </div>

                  {serverInfo && typeof serverInfo.free_bytes === 'number' && authState === 'authenticated' && (
                    <div
                      title={serverInfo.path || undefined}
                      className="flex items-center gap-1.5 px-1 text-[11px] font-mono text-slate-400 dark:text-slate-500"
                    >
                      <HardDrive className="w-3 h-3 text-indigo-500 shrink-0" />
                      <span className="truncate">
                        {t('disk.compactMetric', {
                          free: formatBytes(serverInfo.free_bytes),
                          used: formatBytes(serverInfo.data_bytes ?? 0),
                        })}
                      </span>
                    </div>
                  )}
                </div>

                {/* Mobile Demo Mode Auth Toggle */}
                {isDemoMode && (
                  <>
                    <div className="border-t border-slate-100 dark:border-slate-800 xl:hidden" />
                    <div className="xl:hidden">
                      <button
                        type="button"
                        onClick={onToggleSimulateAuth}
                        className={`w-full flex items-center justify-between px-2.5 py-1.5 rounded-xl text-xs font-medium border active:scale-95 transition-all ${
                          simulateAuthIntercept
                            ? 'bg-amber-500/10 text-amber-700 dark:text-amber-300 border-amber-500/30'
                            : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 border-transparent'
                        }`}
                      >
                        <span className="inline-flex items-center gap-1.5">
                          <ShieldAlert className="w-3.5 h-3.5" />
                          <span>{t('toolbar.simulateAuth')}</span>
                        </span>
                        <span
                          className={`w-2 h-2 rounded-full ${
                            simulateAuthIntercept ? 'bg-amber-500' : 'bg-slate-400'
                          }`}
                        />
                      </button>
                    </div>
                  </>
                )}
              </div>
            )}
          </div>
        </div>
      </div>
    </header>
  );
};
