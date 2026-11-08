import React, { useState, useRef, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import {
  Home,
  ChevronRight,
  CornerLeftUp,
  ArrowUp,
  ArrowDown,
  Check,
  Minus,
  Globe,
} from 'lucide-react';
import { SortField, SortOrder, ViewMode } from '../types/dufs';
import { formatBytes, toAbsoluteHref, toRelativeHref } from '../utils/format';

interface BreadcrumbsProps {
  currentHref: string;
  rootHref: string;
  onNavigate: (targetHref: string) => void;
  onNavigateParent?: () => void;
  folderCount: number;
  fileCount: number;
  totalBytes: number;
  freeBytes?: number;
  viewMode: ViewMode;
  sortField: SortField;
  sortOrder: SortOrder;
  onChangeSort: (field: SortField) => void;
  indexHtmlName?: string;
  onLaunchSite?: () => void;
  showSelectAll?: boolean;
  allSelected?: boolean;
  someSelected?: boolean;
  totalSelectableCount?: number;
  onToggleSelectAll?: () => void;
  zipButton?: React.ReactNode;
}

export const Breadcrumbs: React.FC<BreadcrumbsProps> = ({
  currentHref,
  rootHref,
  onNavigate,
  onNavigateParent,
  folderCount,
  fileCount,
  totalBytes,
  freeBytes,
  viewMode,
  sortField,
  sortOrder,
  onChangeSort,
  indexHtmlName,
  onLaunchSite,
  showSelectAll = false,
  allSelected = false,
  someSelected = false,
  totalSelectableCount = 0,
  onToggleSelectAll,
  zipButton,
}) => {
  const { t } = useTranslation();
  const [sortDropdownOpen, setSortDropdownOpen] = useState(false);
  const sortMenuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (sortMenuRef.current && !sortMenuRef.current.contains(e.target as Node)) {
        setSortDropdownOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const relHref = toRelativeHref(currentHref, rootHref);
  const segments = relHref
    .split('/')
    .filter(Boolean)
    .map((seg, index, arr) => {
      const relPath = '/' + arr.slice(0, index + 1).join('/') + '/';
      let decoded = seg;
      try {
        decoded = decodeURIComponent(seg);
      } catch {
        // ignore decode error
      }
      return { name: decoded, path: toAbsoluteHref(relPath, rootHref) };
    });

  const isRoot = segments.length === 0;
  const indeterminate = someSelected && !allSelected;

  const sortLabels: Record<SortField, string> = {
    name: t('sort.name'),
    size: t('sort.size'),
    mtime: t('sort.mtime'),
  };

  return (
    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2.5 sm:gap-3 py-3 sm:py-3.5">
      {/* Breadcrumb Navigation Path + Up Button */}
      <nav
        aria-label="Breadcrumb"
        className="flex items-center gap-1 text-xs sm:text-sm overflow-x-auto no-scrollbar py-0.5 min-w-0 flex-1"
      >
        {!isRoot && onNavigateParent && (
          <>
            <button
              type="button"
              onClick={onNavigateParent}
              title={`${t('file.parentDir')} (Backspace)`}
              aria-label={t('file.parentDir')}
              className="inline-flex items-center gap-1 px-2 py-1.5 rounded-lg font-medium text-slate-600 dark:text-slate-300 bg-slate-100/90 hover:bg-slate-200/80 dark:bg-slate-800/80 dark:hover:bg-slate-700/80 active:scale-95 transition-all shrink-0"
            >
              <CornerLeftUp className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-indigo-500 shrink-0" />
              <span className="hidden sm:inline">{t('breadcrumb.parent')}</span>
            </button>
            <span className="h-4 w-px bg-slate-200 dark:bg-slate-800 mx-0.5 shrink-0" />
          </>
        )}

        <button
          type="button"
          onClick={() => onNavigate(rootHref)}
          title={rootHref}
          className={`inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg font-medium active:scale-95 transition-all shrink-0 ${
            isRoot
              ? 'bg-slate-200/70 dark:bg-slate-800 text-slate-900 dark:text-white'
              : 'text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800/60'
          }`}
        >
          <Home className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-indigo-500 shrink-0" />
          <span>{t('breadcrumb.root')}</span>
        </button>

        {segments.map((seg, idx) => {
          const isLast = idx === segments.length - 1;
          return (
            <React.Fragment key={seg.path}>
              <ChevronRight className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-slate-400 shrink-0" />
              <button
                type="button"
                onClick={() => onNavigate(seg.path)}
                className={`px-2.5 py-1.5 rounded-lg font-medium active:scale-95 transition-all max-w-[160px] sm:max-w-[240px] truncate shrink-0 ${
                  isLast
                    ? 'bg-slate-200/70 dark:bg-slate-800 text-slate-900 dark:text-white'
                    : 'text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800/60'
                }`}
              >
                {seg.name}
              </button>
            </React.Fragment>
          );
        })}

        {/* Feature 4: View Static Site Entry Button (when index.html is detected) */}
        {indexHtmlName && onLaunchSite && (
          <button
            type="button"
            onClick={onLaunchSite}
            title={t('breadcrumb.launchSiteTooltip', { name: indexHtmlName })}
            className="ml-1 inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-semibold bg-indigo-500/10 text-indigo-600 dark:text-indigo-400 border border-indigo-500/25 hover:bg-indigo-500/20 active:scale-95 transition-all shrink-0 animate-fadeIn"
          >
            <Globe className="w-3.5 h-3.5 text-indigo-500 shrink-0" />
            <span>{t('breadcrumb.launchSite')}</span>
          </button>
        )}
      </nav>

      {/* Right Toolbar Controls */}
      <div className="flex items-center justify-between sm:justify-end gap-2 text-xs text-slate-500 dark:text-slate-400 shrink-0 flex-wrap">
        <span className="text-[11px] sm:text-xs truncate hidden md:inline">
          {t('breadcrumb.itemCount', { folders: folderCount, files: fileCount })} ·{' '}
          {formatBytes(totalBytes)}
          {typeof freeBytes === 'number' && freeBytes > 0 && (
            <span className="text-slate-400 dark:text-slate-500">
              {' · '}
              {t('breadcrumb.freeSpace', { free: formatBytes(freeBytes) })}
            </span>
          )}
        </span>

        <div className="flex items-center gap-1 sm:gap-1.5 shrink-0 ml-auto sm:ml-0">
          {showSelectAll && onToggleSelectAll && totalSelectableCount > 0 && (
            <>
              <button
                type="button"
                onClick={onToggleSelectAll}
                title={t('file.selectAll')}
                className={`inline-flex items-center gap-1.5 px-2 sm:px-2.5 py-1 rounded-lg text-xs font-medium active:scale-95 transition-all shrink-0 leading-none ${
                  allSelected || indeterminate
                    ? 'bg-indigo-500/10 text-indigo-600 dark:text-indigo-400 border border-indigo-500/20'
                    : 'text-slate-500 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800'
                }`}
              >
                <span
                  className={`w-3.5 h-3.5 rounded-[4px] flex items-center justify-center border transition-colors ${
                    allSelected || indeterminate
                      ? 'bg-indigo-600 border-indigo-600 text-white'
                      : 'border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-900'
                  }`}
                >
                  {allSelected ? (
                    <Check className="w-2.5 h-2.5 stroke-[3] animate-checkPop" />
                  ) : indeterminate ? (
                    <Minus className="w-2.5 h-2.5 stroke-[3] animate-checkPop" />
                  ) : null}
                </span>
                <span>{t('file.selectAll')}</span>
              </button>
              <span className="h-3.5 w-px bg-slate-200 dark:bg-slate-800 mx-0.5" />
            </>
          )}

          {/* Grid View: Compact unified sort capsule [ SortField | ↑/↓ ] */}
          {viewMode === 'grid' && (
            <div className="relative inline-flex items-center" ref={sortMenuRef}>
              <div className="inline-flex items-center rounded-lg border border-slate-200/80 dark:border-slate-700/80 bg-white dark:bg-slate-900 overflow-hidden text-xs">
                <button
                  type="button"
                  onClick={() => setSortDropdownOpen((v) => !v)}
                  title={t('sort.sortMenu')}
                  className="px-2 py-1 text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 active:scale-95 transition-all flex items-center gap-1"
                >
                  <span>{sortLabels[sortField]}</span>
                </button>
                <button
                  type="button"
                  onClick={() => onChangeSort(sortField)}
                  title={sortOrder === 'asc' ? t('sort.asc') : t('sort.desc')}
                  className="p-1 border-l border-slate-200/80 dark:border-slate-700/80 text-indigo-600 dark:text-indigo-400 hover:bg-slate-100 dark:hover:bg-slate-800 active:scale-90 transition-all"
                >
                  {sortOrder === 'asc' ? (
                    <ArrowUp className="w-3.5 h-3.5" />
                  ) : (
                    <ArrowDown className="w-3.5 h-3.5" />
                  )}
                </button>
              </div>

              {sortDropdownOpen && (
                <div className="absolute right-0 top-full mt-1.5 w-28 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-xl p-1 z-30 animate-dropdownIn origin-top-right">
                  {(['name', 'size', 'mtime'] as const).map((field) => (
                    <button
                      key={field}
                      type="button"
                      onClick={() => {
                        onChangeSort(field);
                        setSortDropdownOpen(false);
                      }}
                      className={`w-full flex items-center justify-between px-2.5 py-1.5 rounded-lg text-xs font-medium active:scale-95 transition-all ${
                        sortField === field
                          ? 'bg-indigo-500/10 text-indigo-600 dark:text-indigo-400 font-semibold'
                          : 'text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800'
                      }`}
                    >
                      <span>{sortLabels[field]}</span>
                      {sortField === field && (
                        sortOrder === 'asc' ? (
                          <ArrowUp className="w-3 h-3" />
                        ) : (
                          <ArrowDown className="w-3 h-3" />
                        )
                      )}
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}

          {zipButton && (
            <>
              {viewMode === 'grid' && <span className="h-3.5 w-px bg-slate-200 dark:bg-slate-800 mx-0.5" />}
              {zipButton}
            </>
          )}
        </div>
      </div>
    </div>
  );
};
