import React from 'react';
import { useTranslation } from 'react-i18next';
import { Home, ChevronRight, ArrowUpDown, ArrowUp, ArrowDown, Check, Minus } from 'lucide-react';
import { SortField, SortOrder } from '../types/dufs';
import { formatBytes, toAbsoluteHref, toRelativeHref } from '../utils/format';

interface BreadcrumbsProps {
  currentHref: string;
  /** 当前登录态下的顶层目录：未登录 = 公开区（如 /share/），已登录 = '/' */
  rootHref: string;
  onNavigate: (targetHref: string) => void;
  folderCount: number;
  fileCount: number;
  totalBytes: number;
  sortField: SortField;
  sortOrder: SortOrder;
  onChangeSort: (field: SortField) => void;
  /** 网格视图没有表头 ⇒ 在排序栏提供「全选」与「打包下载」入口 */
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
  folderCount,
  fileCount,
  totalBytes,
  sortField,
  sortOrder,
  onChangeSort,
  showSelectAll = false,
  allSelected = false,
  someSelected = false,
  totalSelectableCount = 0,
  onToggleSelectAll,
  zipButton,
}) => {
  const { t } = useTranslation();

  // 面包屑只展示「相对顶层」的那一段：未登录时 /share/foo/ 显示为 根目录 > foo
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

  const renderSortPill = (field: SortField, label: string) => {
    const active = sortField === field;
    return (
      <button
        key={field}
        type="button"
        onClick={() => onChangeSort(field)}
        className={`inline-flex items-center gap-1 px-2 sm:px-2.5 py-1 rounded-lg text-xs font-medium transition-colors shrink-0 leading-none ${
          active
            ? 'bg-indigo-500/10 text-indigo-600 dark:text-indigo-400 border border-indigo-500/20'
            : 'text-slate-500 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800'
        }`}
      >
        <span>{label}</span>
        {active ? (
          sortOrder === 'asc' ? (
            <ArrowUp className="w-3.5 h-3.5" />
          ) : (
            <ArrowDown className="w-3.5 h-3.5" />
          )
        ) : (
          <ArrowUpDown className="w-3 h-3 opacity-50" />
        )}
      </button>
    );
  };

  const indeterminate = someSelected && !allSelected;

  return (
    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2.5 sm:gap-3 py-3 sm:py-4">
      {/* Breadcrumb Navigation Path */}
      <nav
        aria-label="Breadcrumb"
        className="flex items-center gap-1 text-xs sm:text-sm overflow-x-auto no-scrollbar py-0.5 min-w-0"
      >
        <button
          type="button"
          onClick={() => onNavigate(rootHref)}
          title={rootHref}
          className={`inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg font-medium transition-colors shrink-0 ${
            segments.length === 0
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
                className={`px-2.5 py-1.5 rounded-lg font-medium transition-colors max-w-[140px] sm:max-w-[200px] truncate shrink-0 ${
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
      </nav>

      {/* Right Summary & Sort Controls (+ Grid Select All & Zip Button) */}
      <div className="flex items-center justify-between sm:justify-end gap-2 sm:gap-2.5 text-xs text-slate-500 dark:text-slate-400 shrink-0 flex-wrap">
        <span className="text-[11px] sm:text-xs truncate hidden md:inline">
          {t('breadcrumb.itemCount', { folders: folderCount, files: fileCount })} ·{' '}
          {t('breadcrumb.totalSize', { size: formatBytes(totalBytes) })}
        </span>

        <div className="flex items-center gap-1 sm:gap-1.5 shrink-0 ml-auto sm:ml-0">
          {showSelectAll && onToggleSelectAll && totalSelectableCount > 0 && (
            <>
              <button
                type="button"
                onClick={onToggleSelectAll}
                title={t('file.selectAll')}
                className={`inline-flex items-center gap-1.5 px-2 sm:px-2.5 py-1 rounded-lg text-xs font-medium transition-colors shrink-0 leading-none ${
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
                    <Check className="w-2.5 h-2.5 stroke-[3]" />
                  ) : indeterminate ? (
                    <Minus className="w-2.5 h-2.5 stroke-[3]" />
                  ) : null}
                </span>
                <span>{t('file.selectAll')}</span>
              </button>
              <span className="h-3.5 w-px bg-slate-200 dark:bg-slate-800 mx-0.5" />
            </>
          )}

          {renderSortPill('name', t('sort.name'))}
          {renderSortPill('size', t('sort.size'))}
          {renderSortPill('mtime', t('sort.mtime'))}

          {zipButton && (
            <>
              <span className="h-3.5 w-px bg-slate-200 dark:bg-slate-800 mx-0.5" />
              {zipButton}
            </>
          )}
        </div>
      </div>
    </div>
  );
};
