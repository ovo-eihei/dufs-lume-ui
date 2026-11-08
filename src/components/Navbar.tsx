import React, { useState, useRef, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import {
  Search,
  X,
  Upload,
  FolderPlus,
  LayoutList,
  LayoutGrid,
  Sun,
  Moon,
  Monitor,
  Globe,
  ShieldAlert,
  ShieldCheck,
  Settings,
  LogIn,
  RefreshCw,
  ImageIcon,
  ShieldQuestion,
  Sparkles,
} from 'lucide-react';
import { AuthState, LanguagePreference, ThemePreference, ThumbPreference, ViewMode } from '../types/dufs';

interface NavbarProps {
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
  /** dufs 允许写 且 已登录 —— 上传/新建文件夹按钮只在它为 true 时出现 */
  canWrite: boolean;
  authState: AuthState;
  onLoginClick: () => void;
  onRecheckAuth: () => void;
  /** 缩略图偏好（auto = 用户从没设置过 ⇒ 跟随服务端能力） */
  thumbPreference: ThumbPreference;
  onThumbPreferenceChange: (pref: ThumbPreference) => void;
  /** 服务端 `/__lume__/info` 是否注册了缩略图能力 */
  serverThumbsAvailable: boolean;
  /** HTML 预览沙箱是否开启（缺省开） */
  htmlSandbox: boolean;
  onEnableSandbox: () => void;
  /** 关闭沙箱的唯一入口：打开二次确认弹窗，不直接改状态 */
  onRequestDisableSandbox: () => void;
  isDemoMode: boolean;
  simulateAuthIntercept: boolean;
  onToggleSimulateAuth: () => void;
  onTriggerUploadClick: () => void;
  onOpenMkdirModal: () => void;
  searchInputRef: React.RefObject<HTMLInputElement>;
}

export const Navbar: React.FC<NavbarProps> = ({
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
  onOpenMkdirModal,
  searchInputRef,
}) => {
  const { t } = useTranslation();
  const [settingsOpen, setSettingsOpen] = useState(false);
  const settingsDropdownRef = useRef<HTMLDivElement>(null);

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
          {/* 品牌标记 = 通用图标（渐变块 + 星芒），与 public/favicon.svg 同一套形状 */}
          <div className="w-9 h-9 sm:w-10 sm:h-10 rounded-xl bg-gradient-to-br from-indigo-500 to-violet-600 flex items-center justify-center text-white shadow-md shadow-indigo-500/20 shrink-0">
            <Sparkles className="w-4 h-4 sm:w-5 sm:h-5" />
          </div>
          <div className="min-w-0">
            <div className="flex items-center gap-1.5 sm:gap-2">
              <span className="font-bold text-sm sm:text-base tracking-tight text-slate-900 dark:text-white truncate">
                {t('app.title')}
              </span>
              {isDemoMode && (
                <span className="text-[10px] sm:text-[11px] font-medium px-1.5 sm:px-2 py-0.5 rounded-full bg-indigo-500/10 text-indigo-600 dark:text-indigo-400 border border-indigo-500/20 shrink-0">
                  {t('app.demoBadge')}
                </span>
              )}
            </div>
            <p className="text-xs text-slate-500 dark:text-slate-400 hidden sm:block truncate">
              {t('app.subtitle')}
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
                className="absolute right-2.5 p-1 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 rounded-md"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            )}
          </div>
        </div>

        {/* Right Controls: Actions, View Mode, Gear Settings */}
        <div className="order-2 md:order-3 flex items-center gap-1 sm:gap-2 shrink-0">
          {/* Demo Mode Auth Guard Simulator Toggle (Desktop shortcut) */}
          {isDemoMode && (
            <button
              type="button"
              onClick={onToggleSimulateAuth}
              title={simulateAuthIntercept ? t('auth.demoToggleOn') : t('auth.demoToggleOff')}
              className={`hidden lg:inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-xl text-xs font-medium border transition-all ${
                simulateAuthIntercept
                  ? 'bg-amber-500/10 text-amber-700 dark:text-amber-300 border-amber-500/30'
                  : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 border-transparent hover:border-slate-300 dark:hover:border-slate-700'
              }`}
            >
              <ShieldAlert className="w-3.5 h-3.5" />
              <span>{t('toolbar.simulateAuth')}</span>
            </button>
          )}

          {/* Upload Button —— 只在登录且 dufs 允许写时出现 */}
          {allowUpload && canWrite && (
            <button
              type="button"
              onClick={onTriggerUploadClick}
              title={t('toolbar.upload')}
              className="inline-flex items-center justify-center gap-1.5 p-2 sm:px-3 sm:py-2 rounded-xl text-xs sm:text-sm font-medium bg-indigo-600 hover:bg-indigo-500 text-white shadow-sm shadow-indigo-500/20 transition-all cursor-pointer"
            >
              <Upload className="w-4 h-4 shrink-0" />
              <span className="hidden lg:inline">{t('toolbar.upload')}</span>
            </button>
          )}

          {/* New Folder Button —— 同上 */}
          {allowUpload && canWrite && (
            <button
              type="button"
              onClick={onOpenMkdirModal}
              title={t('toolbar.newFolder')}
              className="inline-flex items-center justify-center gap-1.5 p-2 sm:px-2.5 sm:py-2 rounded-xl text-xs sm:text-sm font-medium bg-slate-100 hover:bg-slate-200/80 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 transition-colors"
            >
              <FolderPlus className="w-4 h-4 shrink-0" />
              <span className="hidden xl:inline">{t('toolbar.newFolder')}</span>
            </button>
          )}

          <div className="h-5 w-px bg-slate-200 dark:bg-slate-800 mx-0.5 hidden sm:block" />

          {/* List / Grid View Switcher (Persisted in localStorage) */}
          <div className="inline-flex items-center p-0.5 sm:p-1 rounded-xl bg-slate-100 dark:bg-slate-800 border border-slate-200/60 dark:border-slate-700/60">
            <button
              type="button"
              onClick={() => onViewModeChange('list')}
              title={t('toolbar.viewList')}
              aria-label={t('toolbar.viewList')}
              className={`p-1.5 rounded-lg transition-all ${
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
              className={`p-1.5 rounded-lg transition-all ${
                viewMode === 'grid'
                  ? 'bg-white dark:bg-slate-900 text-indigo-600 dark:text-indigo-400 shadow-sm'
                  : 'text-slate-500 hover:text-slate-800 dark:text-slate-400 dark:hover:text-slate-200'
              }`}
            >
              <LayoutGrid className="w-4 h-4" />
            </button>
          </div>

          {/* Gear Icon Settings Menu (Consolidates Language, Appearance Theme & Sign-In Status) */}
          <div className="relative" ref={settingsDropdownRef}>
            <button
              type="button"
              onClick={() => setSettingsOpen((prev) => !prev)}
              title={t('toolbar.settings')}
              aria-label={t('toolbar.settings')}
              aria-expanded={settingsOpen}
              className={`p-2 rounded-xl border transition-all ${
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
              <div className="absolute right-0 mt-2 w-64 max-w-[calc(100vw-1.5rem)] rounded-2xl bg-white dark:bg-slate-900 shadow-xl border border-slate-200/90 dark:border-slate-800 p-3.5 z-50 space-y-4">
                {/* Language Section: 系统 / 中文 / EN */}
                <div className="space-y-2">
                  <div className="flex items-center gap-1.5 text-xs font-semibold text-slate-500 dark:text-slate-400 px-0.5">
                    <Globe className="w-3.5 h-3.5 text-indigo-500" />
                    <span>{t('toolbar.language')}</span>
                  </div>
                  <div className="grid grid-cols-3 gap-1 p-1 rounded-xl bg-slate-100 dark:bg-slate-800/90 border border-slate-200/60 dark:border-slate-700/60">
                    <button
                      type="button"
                      onClick={() => onLanguagePreferenceChange('system')}
                      className={`py-1.5 px-2 rounded-lg text-xs font-medium transition-all text-center ${
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
                      className={`py-1.5 px-2 rounded-lg text-xs font-medium transition-all text-center ${
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
                      className={`py-1.5 px-2 rounded-lg text-xs font-medium transition-all text-center ${
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

                {/* Theme Section: 系统 / 亮色 / 暗黑 */}
                <div className="space-y-2">
                  <div className="flex items-center gap-1.5 text-xs font-semibold text-slate-500 dark:text-slate-400 px-0.5">
                    <Monitor className="w-3.5 h-3.5 text-indigo-500" />
                    <span>{t('toolbar.theme')}</span>
                  </div>
                  <div className="grid grid-cols-3 gap-1 p-1 rounded-xl bg-slate-100 dark:bg-slate-800/90 border border-slate-200/60 dark:border-slate-700/60">
                    <button
                      type="button"
                      onClick={() => onThemePreferenceChange('system')}
                      className={`py-1.5 px-2 rounded-lg text-xs font-medium inline-flex items-center justify-center gap-1 transition-all ${
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
                      className={`py-1.5 px-2 rounded-lg text-xs font-medium inline-flex items-center justify-center gap-1 transition-all ${
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
                      className={`py-1.5 px-2 rounded-lg text-xs font-medium inline-flex items-center justify-center gap-1 transition-all ${
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

                {/* Preview & Safety Section: 缩略图（能力驱动）+ HTML 预览沙箱 */}
                <div className="space-y-2">
                  <div className="flex items-center gap-1.5 text-xs font-semibold text-slate-500 dark:text-slate-400 px-0.5">
                    <ImageIcon className="w-3.5 h-3.5 text-indigo-500" />
                    <span>{t('preview.sectionTitle')}</span>
                  </div>

                  <div className="grid grid-cols-3 gap-1 p-1 rounded-xl bg-slate-100 dark:bg-slate-800/90 border border-slate-200/60 dark:border-slate-700/60">
                    {(['auto', 'on', 'off'] as const).map((mode) => (
                      <button
                        key={mode}
                        type="button"
                        onClick={() => onThumbPreferenceChange(mode)}
                        className={`py-1.5 px-1.5 rounded-lg text-xs font-medium transition-all text-center ${
                          thumbPreference === mode
                            ? 'bg-white dark:bg-slate-900 text-indigo-600 dark:text-indigo-400 shadow-sm font-semibold'
                            : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
                        }`}
                      >
                        {t(`thumbs.mode_${mode}`)}
                      </button>
                    ))}
                  </div>
                  <p className="text-[11px] leading-relaxed text-slate-400 dark:text-slate-500 px-0.5">
                    {t(
                      thumbPreference === 'off'
                        ? 'thumbs.hintOff'
                        : serverThumbsAvailable
                        ? 'thumbs.hintServer'
                        : thumbPreference === 'auto'
                        ? 'thumbs.hintAutoNoServer'
                        : 'thumbs.hintClient'
                    )}
                  </p>

                  <button
                    type="button"
                    onClick={() => {
                      if (htmlSandbox) {
                        onRequestDisableSandbox();
                      } else {
                        onEnableSandbox();
                      }
                    }}
                    className={`w-full flex items-center justify-between gap-2 px-3 py-2 rounded-xl text-xs font-medium border transition-all ${
                      htmlSandbox
                        ? 'bg-emerald-500/10 text-emerald-700 dark:text-emerald-300 border-emerald-500/30'
                        : 'bg-amber-500/10 text-amber-700 dark:text-amber-300 border-amber-500/30'
                    }`}
                  >
                    <span className="inline-flex items-center gap-1.5 min-w-0">
                      <ShieldQuestion className="w-3.5 h-3.5 shrink-0" />
                      <span className="truncate">{t('sandbox.settingLabel')}</span>
                    </span>
                    <span className="shrink-0 font-semibold">{t(htmlSandbox ? 'sandbox.stateOn' : 'sandbox.stateOff')}</span>
                  </button>
                  <p className="text-[11px] leading-relaxed text-slate-400 dark:text-slate-500 px-0.5">
                    {t(htmlSandbox ? 'sandbox.hintOn' : 'sandbox.hintOff')}
                  </p>
                </div>

                <div className="border-t border-slate-100 dark:border-slate-800" />

                {/* Access & Sign-In Section (Clean: Status Badge + Re-check + Sign-In Button) */}
                <div className="space-y-2">
                  <div className="flex items-center gap-1.5 text-xs font-semibold text-slate-500 dark:text-slate-400 px-0.5">
                    <ShieldCheck className="w-3.5 h-3.5 text-indigo-500" />
                    <span>{t('access.sectionTitle')}</span>
                  </div>

                  <div
                    className={`flex items-center justify-between gap-2 px-3 py-2 rounded-xl border text-xs font-medium ${accessStateTone}`}
                  >
                    <span className="inline-flex items-center gap-1.5 min-w-0">
                      <span className="w-2 h-2 rounded-full bg-current shrink-0" />
                      <span className="truncate">{accessStateLabel}</span>
                    </span>
                    {!isDemoMode && (
                      <button
                        type="button"
                        onClick={onRecheckAuth}
                        title={t('access.recheck')}
                        className="p-1 rounded-lg hover:bg-black/5 dark:hover:bg-white/10 shrink-0"
                      >
                        <RefreshCw className="w-3.5 h-3.5" />
                      </button>
                    )}
                  </div>

                  {(!isDemoMode ? authState === 'anonymous' : false) && (
                    <button
                      type="button"
                      onClick={onLoginClick}
                      className="w-full inline-flex items-center justify-center gap-1.5 px-3 py-2 rounded-xl text-xs font-semibold bg-indigo-600 hover:bg-indigo-500 text-white shadow-sm transition-colors"
                    >
                      <LogIn className="w-3.5 h-3.5" />
                      <span>{t('access.loginBtn')}</span>
                    </button>
                  )}
                </div>

                {/* Mobile Demo Mode Auth Toggle inside Gear Settings */}
                {isDemoMode && (
                  <>
                    <div className="border-t border-slate-100 dark:border-slate-800 lg:hidden" />
                    <div className="lg:hidden">
                      <button
                        type="button"
                        onClick={onToggleSimulateAuth}
                        className={`w-full flex items-center justify-between px-3 py-2 rounded-xl text-xs font-medium border transition-all ${
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
