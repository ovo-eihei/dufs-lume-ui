import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  CornerLeftUp,
  Download,
  Link2,
  Check,
  Minus,
  Trash2,
  Archive,
  FolderOpen,
  ArrowUp,
  ArrowDown,
} from 'lucide-react';
import { DufsPathItem, SortField, SortOrder, ViewMode } from '../types/dufs';
import { ZipButton, ZipControls } from './ZipButton';
import {
  formatBytes,
  formatDateTime,
  getPreviewCategory,
  isDirectory,
  joinUrlPath,
  normalizeDirHref,
} from '../utils/format';
import { buildThumbUrl } from '../services/dufsApi';
import { createDemoSvgDataUri } from '../utils/demoAssets';
import { FileIconBadge } from './FileIconBadge';

const GRID_THUMB_WIDTH = 256;
const LIST_THUMB_WIDTH = 128;

export const SelectionCheckbox: React.FC<{
  checked: boolean;
  indeterminate?: boolean;
  disabled?: boolean;
  label: string;
  onChange: (shiftKey: boolean) => void;
  className?: string;
}> = ({ checked, indeterminate = false, disabled = false, label, onChange, className = '' }) => {
  const isSemi = indeterminate && !checked;
  const active = checked || isSemi;

  return (
    <button
      type="button"
      role="checkbox"
      aria-checked={isSemi ? 'mixed' : checked}
      aria-label={label}
      title={label}
      disabled={disabled}
      onClick={(e) => {
        e.stopPropagation();
        if (!disabled) onChange(e.shiftKey);
      }}
      className={`inline-flex items-center justify-center w-4 h-4 rounded-[5px] border active:scale-90 transition-all duration-150 shrink-0 select-none focus:outline-none focus:ring-2 focus:ring-indigo-500/30 disabled:opacity-40 disabled:cursor-not-allowed ${
        active
          ? 'bg-indigo-600 border-indigo-600 text-white shadow-sm shadow-indigo-500/20'
          : 'bg-white dark:bg-slate-900 border-slate-300 dark:border-slate-600 hover:border-indigo-500 dark:hover:border-indigo-400'
      } ${className}`}
    >
      {checked ? (
        <Check className="w-3 h-3 stroke-[3] animate-checkPop" />
      ) : isSemi ? (
        <Minus className="w-3 h-3 stroke-[3] animate-checkPop" />
      ) : null}
    </button>
  );
};

interface FileExplorerProps {
  items: DufsPathItem[];
  currentHref: string;
  rootHref: string;
  viewMode: ViewMode;
  sortField: SortField;
  sortOrder: SortOrder;
  onChangeSort: (field: SortField) => void;
  searchQuery: string;
  allowDelete: boolean;
  allowArchive: boolean;
  zip: ZipControls | null;
  selectedNames: Set<string>;
  focusedIndex: number;
  uriPrefix?: string;
  thumbsEnabled?: boolean;
  thumbSource?: 'server' | 'client';
  thumbScope?: 'share' | 'full';
  isDemoMode?: boolean;
  onToggleSelect: (item: DufsPathItem, shiftKey?: boolean) => void;
  onToggleSelectAll: () => void;
  onItemClick: (item: DufsPathItem) => void;
  onItemFocus: (index: number) => void;
  onNavigateParent: () => void;
  onCopyDirectLink: (item: DufsPathItem) => void;
  onDownloadItem: (item: DufsPathItem) => void;
  onRequestDelete: (item: DufsPathItem) => void;
}

export const FileExplorer: React.FC<FileExplorerProps> = ({
  items,
  currentHref,
  rootHref,
  viewMode,
  sortField,
  sortOrder,
  onChangeSort,
  searchQuery,
  allowDelete,
  allowArchive,
  zip,
  selectedNames,
  focusedIndex,
  uriPrefix = '',
  thumbsEnabled = false,
  thumbSource = 'client',
  thumbScope = 'full',
  isDemoMode = false,
  onToggleSelect,
  onToggleSelectAll,
  onItemClick,
  onItemFocus,
  onNavigateParent,
  onCopyDirectLink,
  onDownloadItem,
  onRequestDelete,
}) => {
  const { t, i18n } = useTranslation();
  const [copiedName, setCopiedName] = useState<string | null>(null);
  const [thumbFallbacks, setThumbFallbacks] = useState<Record<string, 'client' | 'none'>>({});

  const resolveThumbSrc = (
    item: DufsPathItem,
    width = GRID_THUMB_WIDTH,
  ): string | null => {
    if (isDirectory(item) || getPreviewCategory(item.name) !== 'image') return null;
    if (isDemoMode) return createDemoSvgDataUri(item.name);
    const clientUrl = joinUrlPath(uriPrefix, currentHref, item.name, false);
    const fallback = thumbFallbacks[item.name];
    if (fallback === 'none') return null;
    if (thumbSource === 'server') {
      if (fallback === 'client') return clientUrl;
      const absPath = joinUrlPath('', currentHref, item.name, false);
      return buildThumbUrl(uriPrefix, absPath, width, thumbScope);
    }
    return clientUrl;
  };

  React.useEffect(() => {
    setThumbFallbacks({});
  }, [currentHref]);

  const handleThumbError = (item: DufsPathItem) => {
    setThumbFallbacks((prev) => {
      const current = prev[item.name];
      if (thumbSource === 'server' && current !== 'client') {
        return { ...prev, [item.name]: 'client' };
      }
      return { ...prev, [item.name]: 'none' };
    });
  };

  const isRoot = normalizeDirHref(currentHref) === normalizeDirHref(rootHref);
  const allSelected = items.length > 0 && items.every((i) => selectedNames.has(i.name));
  const someSelected = items.some((i) => selectedNames.has(i.name));

  const handleCopy = (e: React.MouseEvent, item: DufsPathItem) => {
    e.stopPropagation();
    onCopyDirectLink(item);
    setCopiedName(item.name);
    setTimeout(() => {
      setCopiedName((prev) => (prev === item.name ? null : prev));
    }, 1800);
  };

  const handleRowOrCardClick = (e: React.MouseEvent, item: DufsPathItem, index: number) => {
    onItemFocus(index);
    if (e.ctrlKey || e.metaKey || e.shiftKey) {
      e.preventDefault();
      window.getSelection?.()?.removeAllRanges();
      onToggleSelect(item, e.shiftKey);
      return;
    }
    onItemClick(item);
  };

  if (items.length === 0) {
    return (
      <div className="rounded-2xl border border-dashed border-slate-300 dark:border-slate-800 bg-white/60 dark:bg-slate-900/50 p-8 sm:p-12 text-center my-4 animate-fadeIn">
        <div className="w-12 h-12 sm:w-14 sm:h-14 rounded-2xl bg-indigo-500/10 text-indigo-500 flex items-center justify-center mx-auto mb-4">
          <FolderOpen className="w-6 h-6 sm:w-7 sm:h-7" />
        </div>
        {searchQuery ? (
          <p className="text-sm sm:text-base font-medium text-slate-700 dark:text-slate-300">
            {t('file.noSearchMatch', { query: searchQuery })}
          </p>
        ) : (
          <>
            <h3 className="text-sm sm:text-base font-semibold text-slate-800 dark:text-slate-200 mb-1">
              {t('file.emptyTitle')}
            </h3>
            <p className="text-xs sm:text-sm text-slate-500 dark:text-slate-400 max-w-md mx-auto">
              {t('file.emptyHint')}
            </p>
          </>
        )}
        {!isRoot && (
          <button
            type="button"
            onClick={onNavigateParent}
            className="mt-5 inline-flex items-center gap-1.5 px-4 py-2 rounded-xl text-xs font-medium bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 active:scale-95 transition-all"
          >
            <CornerLeftUp className="w-4 h-4" />
            <span>{t('file.parentDir')}</span>
          </button>
        )}
      </div>
    );
  }

  /* ======================= GRID VIEW ======================= */
  if (viewMode === 'grid') {
    const anySelectedMode = someSelected;

    return (
      <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3 sm:gap-3.5 pb-16 animate-fadeIn">
        {items.map((item, idx) => {
          const isDir = isDirectory(item);
          const isCopied = copiedName === item.name;
          const isSelected = selectedNames.has(item.name);
          const isFocused = focusedIndex === idx;
          const thumbSrc = thumbsEnabled ? resolveThumbSrc(item, GRID_THUMB_WIDTH) : null;

          const checkboxChip = (floating: boolean) => (
            <div
              onClick={(e) => e.stopPropagation()}
              className={`${
                floating ? '' : 'absolute -top-1.5 -left-1.5 z-10'
              } inline-flex items-center justify-center w-6 h-6 rounded-lg leading-none bg-white/90 dark:bg-slate-900/85 backdrop-blur-sm shadow-sm ring-1 ring-slate-900/5 dark:ring-white/10 transition-all ${
                isSelected || anySelectedMode
                  ? 'opacity-100'
                  : 'opacity-100 sm:opacity-0 sm:group-hover:opacity-100 focus-within:opacity-100'
              }`}
            >
              <SelectionCheckbox
                checked={isSelected}
                label={t('file.select')}
                onChange={(shiftKey) => {
                  onItemFocus(idx);
                  onToggleSelect(item, shiftKey);
                }}
              />
            </div>
          );

          const quickActions = (floating: boolean) => (
            <div
              onClick={(e) => e.stopPropagation()}
              className={`inline-flex items-center gap-0.5 p-0.5 rounded-lg shrink-0 opacity-100 sm:opacity-0 sm:group-hover:opacity-100 focus-within:opacity-100 transition-opacity ${
                floating
                  ? 'bg-white/90 dark:bg-slate-900/85 backdrop-blur-sm shadow-sm ring-1 ring-slate-900/5 dark:ring-white/10'
                  : 'bg-slate-100/80 dark:bg-slate-800/70'
              }`}
            >
              <button
                type="button"
                onClick={(e) => handleCopy(e, item)}
                title={t('file.copyLink')}
                className="inline-flex items-center justify-center w-7 h-7 rounded-md text-slate-500 hover:text-indigo-600 dark:text-slate-400 dark:hover:text-indigo-400 hover:bg-white dark:hover:bg-slate-700/80 active:scale-90 transition-all"
              >
                {isCopied ? (
                  <Check className="w-3.5 h-3.5 text-emerald-500 animate-checkPop" />
                ) : (
                  <Link2 className="w-3.5 h-3.5" />
                )}
              </button>
              {(!isDir || allowArchive) && (
                <button
                  type="button"
                  onClick={() => onDownloadItem(item)}
                  title={isDir ? t('file.zipDownload') : t('file.download')}
                  className="inline-flex items-center justify-center w-7 h-7 rounded-md text-slate-500 hover:text-indigo-600 dark:text-slate-400 dark:hover:text-indigo-400 hover:bg-white dark:hover:bg-slate-700/80 active:scale-90 transition-all"
                >
                  {isDir ? (
                    <Archive className="w-3.5 h-3.5" />
                  ) : (
                    <Download className="w-3.5 h-3.5" />
                  )}
                </button>
              )}
              {allowDelete && (
                <button
                  type="button"
                  onClick={() => onRequestDelete(item)}
                  title={t('file.delete')}
                  className="inline-flex items-center justify-center w-7 h-7 rounded-md text-slate-500 hover:text-rose-600 dark:text-slate-400 dark:hover:text-rose-400 hover:bg-rose-50 dark:hover:bg-rose-950/50 active:scale-90 transition-all"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              )}
            </div>
          );

          return (
            <div
              key={item.name}
              data-item-index={idx}
              onClick={(e) => handleRowOrCardClick(e, item, idx)}
              className={`group relative flex flex-col rounded-2xl border overflow-hidden transition-all duration-200 cursor-pointer select-none min-w-0 hover:-translate-y-0.5 hover:shadow-lg ${
                isSelected
                  ? 'bg-indigo-50/75 dark:bg-indigo-950/35 border-indigo-500 dark:border-indigo-500/80 ring-2 ring-indigo-500/30 shadow-md shadow-indigo-500/5'
                  : isFocused
                  ? 'bg-slate-50 dark:bg-slate-800/80 border-indigo-500 dark:border-indigo-400 ring-2 ring-indigo-500/35 shadow-md'
                  : 'bg-white dark:bg-slate-900/90 border-slate-200/80 dark:border-slate-800/80 hover:border-indigo-500/50 dark:hover:border-indigo-500/50 hover:shadow-indigo-500/5'
              }`}
            >
              {thumbSrc ? (
                <div className="relative shrink-0 overflow-hidden">
                  <img
                    src={thumbSrc}
                    alt=""
                    loading="lazy"
                    decoding="async"
                    onError={() => handleThumbError(item)}
                    className="block w-full h-32 sm:h-36 object-cover bg-slate-100 dark:bg-slate-800 transition-transform duration-300 ease-out group-hover:scale-[1.03]"
                  />
                  <div className="absolute inset-x-0 top-0 flex items-start justify-between gap-2 p-2">
                    {checkboxChip(true)}
                    {quickActions(true)}
                  </div>
                </div>
              ) : (
                <div className="flex items-start justify-between gap-2 px-3.5 sm:px-4 pt-3.5 sm:pt-4">
                  <div className="relative inline-flex shrink-0">
                    <FileIconBadge item={item} size="lg" />
                    {checkboxChip(false)}
                  </div>
                  {quickActions(false)}
                </div>
              )}

              <div className="mt-auto min-w-0 px-3.5 sm:px-4 pt-3 pb-3.5 sm:pb-4">
                <h4
                  className="font-medium text-sm text-slate-900 dark:text-slate-100 truncate group-hover:text-indigo-600 dark:group-hover:text-indigo-400 transition-colors"
                  title={item.name}
                >
                  {item.name}
                </h4>
                <div className="flex items-center justify-between gap-2 text-xs text-slate-500 dark:text-slate-400 mt-1.5 font-mono">
                  <span className="shrink-0">{isDir ? t('file.folder') : formatBytes(item.size)}</span>
                  <span className="truncate">{formatDateTime(item.mtime, i18n.language)}</span>
                </div>
              </div>
            </div>
          );
        })}
      </div>
    );
  }

  /* ======================= LIST VIEW ======================= */
  return (
    <div className="rounded-2xl bg-white dark:bg-slate-900/90 border border-slate-200/80 dark:border-slate-800/80 shadow-sm overflow-hidden mb-16 animate-fadeIn">
      <table className="w-full table-fixed text-left border-collapse">
        <thead>
          <tr className="border-b border-slate-200/80 dark:border-slate-800/80 text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400 bg-slate-50/70 dark:bg-slate-900/50">
            <th className="py-3 sm:py-3.5 pl-3 sm:pl-4 pr-0 w-10 align-middle">
              <div className="flex items-center justify-center">
                <SelectionCheckbox
                  checked={allSelected}
                  indeterminate={someSelected}
                  disabled={items.length === 0}
                  label={t('file.selectAll')}
                  onChange={() => onToggleSelectAll()}
                />
              </div>
            </th>
            <th className="py-3 sm:py-3.5 pl-1.5 sm:pl-2 pr-2 align-middle">
              <button
                type="button"
                onClick={() => onChangeSort('name')}
                className="inline-flex items-center gap-1 hover:text-slate-900 dark:hover:text-white align-middle leading-none active:scale-95 transition-transform"
              >
                <span>{t('sort.name')}</span>
                {sortField === 'name' &&
                  (sortOrder === 'asc' ? (
                    <ArrowUp className="w-3.5 h-3.5 text-indigo-500" />
                  ) : (
                    <ArrowDown className="w-3.5 h-3.5 text-indigo-500" />
                  ))}
              </button>
            </th>
            <th className="py-3 sm:py-3.5 px-3 w-28 hidden sm:table-cell text-right align-middle">
              <button
                type="button"
                onClick={() => onChangeSort('size')}
                className="inline-flex items-center justify-end gap-1 hover:text-slate-900 dark:hover:text-white ml-auto align-middle leading-none active:scale-95 transition-transform"
              >
                <span>{t('sort.size')}</span>
                {sortField === 'size' &&
                  (sortOrder === 'asc' ? (
                    <ArrowUp className="w-3.5 h-3.5 text-indigo-500" />
                  ) : (
                    <ArrowDown className="w-3.5 h-3.5 text-indigo-500" />
                  ))}
              </button>
            </th>
            <th className="py-3 sm:py-3.5 px-3 w-44 hidden md:table-cell text-right align-middle">
              <button
                type="button"
                onClick={() => onChangeSort('mtime')}
                className="inline-flex items-center justify-end gap-1 hover:text-slate-900 dark:hover:text-white ml-auto align-middle leading-none active:scale-95 transition-transform"
              >
                <span>{t('sort.mtime')}</span>
                {sortField === 'mtime' &&
                  (sortOrder === 'asc' ? (
                    <ArrowUp className="w-3.5 h-3.5 text-indigo-500" />
                  ) : (
                    <ArrowDown className="w-3.5 h-3.5 text-indigo-500" />
                  ))}
              </button>
            </th>
            <th className="py-2.5 sm:py-3 pl-1 pr-3 sm:pr-4 w-[124px] sm:w-40 text-right align-middle">
              <div className="flex items-center justify-end">
                {zip ? <ZipButton variant="header" zip={zip} /> : null}
              </div>
            </th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-200/60 dark:divide-slate-800/60 text-sm">
          {!isRoot && (
            <tr
              onClick={onNavigateParent}
              className="group hover:bg-slate-50/90 dark:hover:bg-slate-800/50 transition-colors cursor-pointer"
            >
              <td className="py-2.5 sm:py-3 pl-3 sm:pl-4 pr-0 w-10 align-middle" />
              <td className="py-2.5 sm:py-3 pl-1.5 sm:pl-2 pr-2 min-w-0 align-middle">
                <div className="flex items-center gap-2.5 sm:gap-3 min-w-0">
                  <div className="w-9 h-9 rounded-xl bg-slate-100 dark:bg-slate-800 text-slate-500 dark:text-slate-400 flex items-center justify-center group-hover:bg-indigo-500/10 group-hover:text-indigo-500 active:scale-90 transition-all shrink-0">
                    <CornerLeftUp className="w-4 h-4" />
                  </div>
                  <div className="min-w-0 truncate">
                    <span className="font-medium text-slate-800 dark:text-slate-200">..</span>
                    <span className="ml-2 text-xs text-slate-500 dark:text-slate-400">
                      ({t('file.parentDir')})
                    </span>
                  </div>
                </div>
              </td>
              <td className="py-2.5 sm:py-3 px-3 hidden sm:table-cell align-middle" />
              <td className="py-2.5 sm:py-3 px-3 hidden md:table-cell align-middle" />
              <td className="py-2.5 sm:py-3 pl-1 pr-2.5 sm:pr-4 text-right align-middle" />
            </tr>
          )}

          {items.map((item, idx) => {
            const isDir = isDirectory(item);
            const isCopied = copiedName === item.name;
            const isSelected = selectedNames.has(item.name);
            const isFocused = focusedIndex === idx;
            const listThumb = thumbsEnabled ? resolveThumbSrc(item, LIST_THUMB_WIDTH) : null;

            return (
              <tr
                key={item.name}
                data-item-index={idx}
                onClick={(e) => handleRowOrCardClick(e, item, idx)}
                className={`group transition-all duration-150 cursor-pointer select-none ${
                  isSelected
                    ? 'bg-indigo-50/75 dark:bg-indigo-950/35 ring-1 ring-inset ring-indigo-500/30'
                    : isFocused
                    ? 'bg-indigo-50/45 dark:bg-slate-800/75 ring-1 ring-inset ring-indigo-500/50'
                    : 'hover:bg-indigo-50/30 dark:hover:bg-slate-800/50'
                }`}
              >
                <td className="py-2.5 sm:py-3 pl-3 sm:pl-4 pr-0 w-10 align-middle">
                  <div className="flex items-center justify-center">
                    <SelectionCheckbox
                      checked={isSelected}
                      label={t('file.select')}
                      onChange={(shiftKey) => {
                        onItemFocus(idx);
                        onToggleSelect(item, shiftKey);
                      }}
                    />
                  </div>
                </td>
                <td className="py-2.5 sm:py-3 pl-1.5 sm:pl-2 pr-2 min-w-0 align-middle">
                  <div className="flex items-center gap-2.5 sm:gap-3 min-w-0">
                    {listThumb ? (
                      <img
                        src={listThumb}
                        alt=""
                        loading="lazy"
                        decoding="async"
                        onError={() => handleThumbError(item)}
                        className="w-10 h-10 rounded-xl object-cover shrink-0 border border-slate-200/80 dark:border-slate-800/80 bg-slate-100 dark:bg-slate-800 shadow-sm"
                      />
                    ) : (
                      <FileIconBadge item={item} size="md" />
                    )}
                    <div className="min-w-0 flex-1">
                      <p
                        className="font-medium text-slate-900 dark:text-slate-100 truncate group-hover:text-indigo-600 dark:group-hover:text-indigo-400 transition-colors"
                        title={item.name}
                      >
                        {item.name}
                      </p>
                      <p className="text-[11px] text-slate-400 dark:text-slate-500 sm:hidden mt-0.5 truncate font-mono">
                        {isDir ? t('file.folder') : formatBytes(item.size)} ·{' '}
                        {formatDateTime(item.mtime, i18n.language)}
                      </p>
                    </div>
                  </div>
                </td>
                <td className="py-2.5 sm:py-3 px-3 text-right font-mono text-xs text-slate-500 dark:text-slate-400 hidden sm:table-cell whitespace-nowrap align-middle">
                  {isDir ? '—' : formatBytes(item.size)}
                </td>
                <td className="py-2.5 sm:py-3 px-3 text-right font-mono text-xs text-slate-500 dark:text-slate-400 hidden md:table-cell whitespace-nowrap align-middle">
                  {formatDateTime(item.mtime, i18n.language)}
                </td>
                <td
                  className="py-2.5 sm:py-3 pl-1 pr-2.5 sm:pr-4 text-right whitespace-nowrap align-middle"
                  onClick={(e) => e.stopPropagation()}
                >
                  <div className="inline-flex items-center justify-end gap-0.5 sm:gap-1 align-middle">
                    <button
                      type="button"
                      onClick={(e) => handleCopy(e, item)}
                      title={t('file.copyLink')}
                      className="p-1.5 rounded-lg text-slate-500 hover:text-indigo-600 dark:text-slate-400 dark:hover:text-indigo-400 hover:bg-slate-100 dark:hover:bg-slate-800 active:scale-90 transition-all"
                    >
                      {isCopied ? (
                        <Check className="w-4 h-4 text-emerald-500 animate-checkPop" />
                      ) : (
                        <Link2 className="w-4 h-4" />
                      )}
                    </button>
                    {(!isDir || allowArchive) && (
                      <button
                        type="button"
                        onClick={() => onDownloadItem(item)}
                        title={isDir ? t('file.zipDownload') : t('file.download')}
                        className="p-1.5 rounded-lg text-slate-500 hover:text-indigo-600 dark:text-slate-400 dark:hover:text-indigo-400 hover:bg-slate-100 dark:hover:bg-slate-800 active:scale-90 transition-all"
                      >
                        {isDir ? (
                          <Archive className="w-4 h-4" />
                        ) : (
                          <Download className="w-4 h-4" />
                        )}
                      </button>
                    )}
                    {allowDelete && (
                      <button
                        type="button"
                        onClick={() => onRequestDelete(item)}
                        title={t('file.delete')}
                        className="p-1.5 rounded-lg text-slate-500 hover:text-rose-600 dark:text-slate-400 dark:hover:text-rose-400 hover:bg-rose-50 dark:hover:bg-rose-950/40 active:scale-90 transition-all"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    )}
                  </div>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
};
