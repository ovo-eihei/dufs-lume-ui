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

/** 请求服务端缩略图时想要的宽度（能力位里的档位由脚本自己挑最近的） */
/** 网格卡片：缩略图铺满卡片顶部，取 256 档 */
const GRID_THUMB_WIDTH = 256;
/** 列表行：只有 40px 见方，取 128 档省带宽（服务端按宽度分档缓存，两者互不冲突） */
const LIST_THUMB_WIDTH = 128;

/**
 * 现代自定义勾选框（支持全选、半选 indeterminate、单选与 Shift 区间连选）：
 * 采用 inline-flex items-center justify-center 代替浏览器原生 <input type="checkbox">，
 * 彻底解决原生表单控件在表头 <th> 与行 <td> 中因 baseline 基线偏移导致上下不居中的问题。
 */
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
      className={`inline-flex items-center justify-center w-4 h-4 rounded-[5px] border transition-all shrink-0 select-none focus:outline-none focus:ring-2 focus:ring-indigo-500/30 disabled:opacity-40 disabled:cursor-not-allowed ${
        active
          ? 'bg-indigo-600 border-indigo-600 text-white shadow-sm shadow-indigo-500/20'
          : 'bg-white dark:bg-slate-900 border-slate-300 dark:border-slate-600 hover:border-indigo-500 dark:hover:border-indigo-400'
      } ${className}`}
    >
      {checked ? (
        <Check className="w-3 h-3 stroke-[3]" />
      ) : isSemi ? (
        <Minus className="w-3 h-3 stroke-[3]" />
      ) : null}
    </button>
  );
};

interface FileExplorerProps {
  items: DufsPathItem[];
  currentHref: string;
  /** 顶层目录（未登录时为公开区）；到底就不再显示「返回上级」 */
  rootHref: string;
  viewMode: ViewMode;
  sortField: SortField;
  sortOrder: SortOrder;
  onChangeSort: (field: SortField) => void;
  searchQuery: string;
  allowDelete: boolean;
  allowArchive: boolean;
  /** 打包入口（原顶栏按钮移到此）；null = dufs 未开 allow_archive，表头最后一列留空 */
  zip: ZipControls | null;
  /** 已勾选条目的 name 集合（选择只在当前目录内有效，所以用 name 当键） */
  selectedNames: Set<string>;
  /** dufs 的 uri_prefix（拼缩略图 URL 要用） */
  uriPrefix?: string;
  /** 是否显示缩略图：由 App 按「用户偏好 + 服务端能力」算出来 */
  thumbsEnabled?: boolean;
  /** 缩略图来源：`server` = 走 `/__lume__/thumb`；`client` = 直接拿原图让浏览器缩放 */
  thumbSource?: 'server' | 'client';
  /** 未登录访客 ⇒ 请求里带 `root=share`，服务端据此硬拦在公开区子树 */
  thumbScope?: 'share' | 'full';
  isDemoMode?: boolean;
  onToggleSelect: (item: DufsPathItem, shiftKey?: boolean) => void;
  onToggleSelectAll: () => void;
  onItemClick: (item: DufsPathItem) => void;
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
  uriPrefix = '',
  thumbsEnabled = false,
  thumbSource = 'client',
  thumbScope = 'full',
  isDemoMode = false,
  onToggleSelect,
  onToggleSelectAll,
  onItemClick,
  onNavigateParent,
  onCopyDirectLink,
  onDownloadItem,
  onRequestDelete,
}) => {
  const { t, i18n } = useTranslation();
  const [copiedName, setCopiedName] = useState<string | null>(null);
  /**
   * 缩略图加载失败的降级表（按文件名记）：
   * 服务端档位挂了 ⇒ 先退原图；原图也挂了 ⇒ 退回文件图标。
   * 切目录时组件不重挂载，所以键用 name 就够（同目录内 name 唯一）。
   */
  const [thumbFallbacks, setThumbFallbacks] = useState<Record<string, 'client' | 'none'>>({});

  /** 算出某个条目的缩略图 <img src>；不该显示时返回 null */
  const resolveThumbSrc = (
    item: DufsPathItem,
    width = GRID_THUMB_WIDTH,
  ): string | null => {
    if (isDirectory(item) || getPreviewCategory(item.name) !== 'image') return null;
    if (isDemoMode) return createDemoSvgDataUri(item.name);
    const clientUrl = joinUrlPath(uriPrefix, currentHref, item.name, false);
    const fallback = thumbFallbacks[item.name];
    // 两级降级都失败过 ⇒ 不再发请求，卡片退回文件图标
    if (fallback === 'none') return null;
    if (thumbSource === 'server') {
      if (fallback === 'client') return clientUrl;
      // 传给端点的 path 是「站内绝对路径」（不含 uri_prefix），由脚本自己锁在数据根内
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

  /**
   * 统一处理行/卡片点击：
   * - 按住 Ctrl / Cmd (metaKey) 点击：直接切换当前项的勾选状态（不弹窗预览、不进入目录）
   * - 按住 Shift 点击：直接触发从上一个勾选项到当前项的连续区间勾选
   * - 普通点击：进入子目录或打开富媒体预览弹窗
   */
  const handleRowOrCardClick = (e: React.MouseEvent, item: DufsPathItem) => {
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
      <div className="rounded-2xl border border-dashed border-slate-300 dark:border-slate-800 bg-white/60 dark:bg-slate-900/50 p-8 sm:p-12 text-center my-4">
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
            className="mt-5 inline-flex items-center gap-1.5 px-4 py-2 rounded-xl text-xs font-medium bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 transition-colors"
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
      <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3 sm:gap-3.5 pb-12">
        {!isRoot && (
          <button
            type="button"
            onClick={onNavigateParent}
            className="group flex items-center gap-3.5 p-3.5 sm:p-4 rounded-2xl bg-white/80 dark:bg-slate-900/80 border border-slate-200/80 dark:border-slate-800/80 hover:border-indigo-500/40 dark:hover:border-indigo-500/40 hover:shadow-md transition-all text-left"
          >
            <div className="w-11 h-11 sm:w-12 sm:h-12 rounded-2xl bg-slate-100 dark:bg-slate-800 text-slate-500 dark:text-slate-400 flex items-center justify-center shrink-0 group-hover:bg-indigo-500/10 group-hover:text-indigo-500 transition-colors">
              <CornerLeftUp className="w-5 h-5" />
            </div>
            <div className="min-w-0 flex-1">
              <p className="font-medium text-sm text-slate-800 dark:text-slate-200 truncate">..</p>
              <p className="text-xs text-slate-500 dark:text-slate-400 truncate">
                {t('file.parentDir')}
              </p>
            </div>
          </button>
        )}

        {items.map((item) => {
          const isDir = isDirectory(item);
          const isCopied = copiedName === item.name;
          const isSelected = selectedNames.has(item.name);

          /** 缩略图（E2）：图片类条目用它**替换**大图标；null = 非图片、关闭或服务端无能力 */
          const thumbSrc = thumbsEnabled ? resolveThumbSrc(item, GRID_THUMB_WIDTH) : null;

          /** 勾选框：非图片卡片挂在图标左上角，图片卡片浮在缩略图左上角 */
          const checkboxChip = (floating: boolean) => (
            <div
              onClick={(e) => e.stopPropagation()}
              className={`${floating ? '' : 'absolute -top-1.5 -left-1.5 z-10'} p-0.5 rounded-[7px] bg-white/85 dark:bg-slate-900/75 backdrop-blur-sm shadow-sm transition-opacity ${
                isSelected || anySelectedMode
                  ? 'opacity-100'
                  : 'opacity-100 sm:opacity-0 sm:group-hover:opacity-100'
              }`}
            >
              <SelectionCheckbox
                checked={isSelected}
                label={t('file.select')}
                onChange={(shiftKey) => onToggleSelect(item, shiftKey)}
              />
            </div>
          );

          /** 快捷操作组：非图片卡片排在右侧，图片卡片浮在缩略图右上角 */
          const quickActions = (
            <div
              className="flex items-center gap-0.5 sm:gap-1 shrink-0 rounded-xl opacity-100 sm:opacity-0 sm:group-hover:opacity-100 transition-opacity"
              onClick={(e) => e.stopPropagation()}
            >
              <button
                type="button"
                onClick={(e) => handleCopy(e, item)}
                title={t('file.copyLink')}
                className="p-1.5 rounded-lg text-slate-500 hover:text-indigo-600 dark:text-slate-400 dark:hover:text-indigo-400 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
              >
                {isCopied ? (
                  <Check className="w-4 h-4 text-emerald-500" />
                ) : (
                  <Link2 className="w-4 h-4" />
                )}
              </button>
              {(!isDir || allowArchive) && (
                <button
                  type="button"
                  onClick={() => onDownloadItem(item)}
                  title={isDir ? t('file.zipDownload') : t('file.download')}
                  className="p-1.5 rounded-lg text-slate-500 hover:text-indigo-600 dark:text-slate-400 dark:hover:text-indigo-400 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
                >
                  {isDir ? <Archive className="w-4 h-4" /> : <Download className="w-4 h-4" />}
                </button>
              )}
              {allowDelete && (
                <button
                  type="button"
                  onClick={() => onRequestDelete(item)}
                  title={t('file.delete')}
                  className="p-1.5 rounded-lg text-slate-500 hover:text-rose-600 dark:text-slate-400 dark:hover:text-rose-400 hover:bg-rose-50 dark:hover:bg-rose-950/40 transition-colors"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              )}
            </div>
          );

          return (
            <div
              key={item.name}
              onClick={(e) => handleRowOrCardClick(e, item)}
              className={`group relative flex flex-col rounded-2xl border overflow-hidden transition-all cursor-pointer select-none min-w-0 ${
                isSelected
                  ? 'bg-indigo-50/75 dark:bg-indigo-950/35 border-indigo-500 dark:border-indigo-500/80 ring-1 ring-indigo-500/30 shadow-md shadow-indigo-500/5'
                  : 'bg-white dark:bg-slate-900/90 border-slate-200/80 dark:border-slate-800/80 hover:border-indigo-500/50 dark:hover:border-indigo-500/50 hover:shadow-lg hover:shadow-indigo-500/5'
              }`}
            >
              {/* 图片类条目：缩略图贴边铺满卡片顶部，大图标不再显示；控件浮在图上 */}
              {thumbSrc ? (
                <div className="relative shrink-0">
                  <img
                    src={thumbSrc}
                    alt=""
                    loading="lazy"
                    decoding="async"
                    onError={() => handleThumbError(item)}
                    className="block w-full h-32 sm:h-36 object-cover bg-slate-100 dark:bg-slate-800"
                  />
                  <div className="absolute inset-x-0 top-0 flex items-start justify-between gap-2 p-2">
                    {checkboxChip(true)}
                    <div className="bg-white/85 dark:bg-slate-900/75 backdrop-blur-sm shadow-sm rounded-xl">
                      {quickActions}
                    </div>
                  </div>
                </div>
              ) : null}

              {/* 非图片卡片：保持原来的大图标 + 右侧操作组 */}
              {!thumbSrc ? (
                <div className="flex items-start justify-between gap-2 px-3.5 sm:px-4 pt-3.5 sm:pt-4">
                  <div className="relative inline-flex shrink-0">
                    <FileIconBadge item={item} size="lg" />
                    {checkboxChip(false)}
                  </div>
                  {quickActions}
                </div>
              ) : null}

              <div className="mt-auto min-w-0 px-3.5 sm:px-4 pt-3 pb-3.5 sm:pb-4">
                <h4
                  className="font-medium text-sm text-slate-900 dark:text-slate-100 truncate group-hover:text-indigo-600 dark:group-hover:text-indigo-400 transition-colors"
                  title={item.name}
                >
                  {item.name}
                </h4>
                <div className="flex items-center justify-between gap-2 text-xs text-slate-500 dark:text-slate-400 mt-1.5">
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

  /* ======================= LIST VIEW (Fixed Table Layout on Mobile & Desktop) ======================= */
  return (
    <div className="rounded-2xl bg-white dark:bg-slate-900/90 border border-slate-200/80 dark:border-slate-800/80 shadow-sm overflow-hidden mb-12">
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
                className="inline-flex items-center gap-1 hover:text-slate-900 dark:hover:text-white align-middle leading-none"
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
                className="inline-flex items-center justify-end gap-1 hover:text-slate-900 dark:hover:text-white ml-auto align-middle leading-none"
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
                className="inline-flex items-center justify-end gap-1 hover:text-slate-900 dark:hover:text-white ml-auto align-middle leading-none"
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
              {/*
                ⚠ 这一行**禁止用 colSpan**（原 89f86b2 的修复，v1.2.2 合并时重新落到他的 v1.2.x 结构上）。
                表是 `table-fixed`，列宽取第一行（表头）；但 <768px 时表头的「大小」`hidden sm:table-cell`、
                「时间」`hidden md:table-cell` 是 display:none ⇒ 表头只剩 3~4 格，而 `colSpan={5}` 会按
                最大列跨度撑出 1~2 个**没有宽度来源的「幽灵列」**，它们照样参与瓜分宽度 ⇒ 名称列被压成零头，
                行内容只占左半截（只在 `!isRoot` 时出现，看起来像「登录后才有的 bug」）。
                要加整行元素：放 `<table>` 外面，或照表头格数补空 td（就是这里的做法）。
              */}
              <td className="py-2.5 sm:py-3 pl-3 sm:pl-4 pr-0 w-10 align-middle" />
              <td className="py-2.5 sm:py-3 pl-1.5 sm:pl-2 pr-2 min-w-0 align-middle">
                <div className="flex items-center gap-2.5 sm:gap-3 min-w-0">
                  <div className="w-9 h-9 rounded-xl bg-slate-100 dark:bg-slate-800 text-slate-500 dark:text-slate-400 flex items-center justify-center group-hover:bg-indigo-500/10 group-hover:text-indigo-500 transition-colors shrink-0">
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

          {items.map((item) => {
            const isDir = isDirectory(item);
            const isCopied = copiedName === item.name;
            const isSelected = selectedNames.has(item.name);
            /** 列表行也用缩略图**替换**文件图标（40px 见方，取 128 档） */
            const listThumb = thumbsEnabled ? resolveThumbSrc(item, LIST_THUMB_WIDTH) : null;

            return (
              <tr
                key={item.name}
                onClick={(e) => handleRowOrCardClick(e, item)}
                className={`group transition-colors cursor-pointer select-none ${
                  isSelected
                    ? 'bg-indigo-50/70 dark:bg-indigo-950/30'
                    : 'hover:bg-indigo-50/40 dark:hover:bg-slate-800/60'
                }`}
              >
                <td className="py-2.5 sm:py-3 pl-3 sm:pl-4 pr-0 w-10 align-middle">
                  <div className="flex items-center justify-center">
                    <SelectionCheckbox
                      checked={isSelected}
                      label={t('file.select')}
                      onChange={(shiftKey) => onToggleSelect(item, shiftKey)}
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
                        className="w-10 h-10 rounded-xl object-cover shrink-0 border border-slate-200/80 dark:border-slate-800/80 bg-slate-100 dark:bg-slate-800"
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
                      <p className="text-[11px] text-slate-400 dark:text-slate-500 sm:hidden mt-0.5 truncate">
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
                      className="p-1.5 rounded-lg text-slate-500 hover:text-indigo-600 dark:text-slate-400 dark:hover:text-indigo-400 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
                    >
                      {isCopied ? (
                        <Check className="w-4 h-4 text-emerald-500" />
                      ) : (
                        <Link2 className="w-4 h-4" />
                      )}
                    </button>
                    {(!isDir || allowArchive) && (
                      <button
                        type="button"
                        onClick={() => onDownloadItem(item)}
                        title={isDir ? t('file.zipDownload') : t('file.download')}
                        className="p-1.5 rounded-lg text-slate-500 hover:text-indigo-600 dark:text-slate-400 dark:hover:text-indigo-400 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
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
                        className="p-1.5 rounded-lg text-slate-500 hover:text-rose-600 dark:text-slate-400 dark:hover:text-rose-400 hover:bg-rose-50 dark:hover:bg-rose-950/40 transition-colors"
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
