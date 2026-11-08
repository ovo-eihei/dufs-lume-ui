import React from 'react';
import { useTranslation } from 'react-i18next';
import { Archive, X } from 'lucide-react';

/**
 * 「打包下载」统一控件：
 * - 列表视图渲染在表头最后一列 (`variant="header"`)
 * - 网格视图渲染在面包屑行的排序栏右侧 (`variant="pill"`)
 * - 当 selectedCount > 0 时，高亮显示「打包 (N)」并提供一键清空勾选的 × 按钮
 */
export interface ZipControls {
  /** 当前目录已勾选条数；0 = 打包整个当前目录（dufs 服务端 ?zip） */
  selectedCount: number;
  /** 已勾选体积的展示串 */
  selectedSizeLabel: string;
  /** 正在浏览器里流式拼 ZIP */
  busy: boolean;
  done: number;
  total: number;
  onClick: () => void;
  onClear?: () => void;
}

export const ZipButton: React.FC<{
  variant: 'header' | 'pill';
  zip: ZipControls;
}> = ({ variant, zip }) => {
  const { t } = useTranslation();

  const hasSelection = zip.selectedCount > 0;

  const label = zip.busy
    ? t('selection.busyShort', { done: zip.done, total: zip.total })
    : hasSelection
    ? t('selection.zipShort', { count: zip.selectedCount })
    : t('toolbar.downloadZip');

  const title = zip.busy
    ? t('selection.busy', { done: zip.done, total: zip.total })
    : hasSelection
    ? t('selection.summary', { count: zip.selectedCount, size: zip.selectedSizeLabel })
    : t('toolbar.downloadZip');

  const isHeader = variant === 'header';

  return (
    <div className="inline-flex items-center justify-end gap-1 shrink-0 align-middle">
      <button
        type="button"
        onClick={zip.onClick}
        disabled={zip.busy}
        title={title}
        aria-label={title}
        className={`inline-flex items-center justify-center gap-1 shrink-0 transition-all disabled:opacity-60 disabled:cursor-progress leading-none ${
          hasSelection
            ? 'px-2 sm:px-2.5 py-1 rounded-lg text-[11px] sm:text-xs font-semibold bg-indigo-600 hover:bg-indigo-500 text-white shadow-sm shadow-indigo-500/20'
            : isHeader
            ? 'px-2 py-1 rounded-lg text-[11px] sm:text-xs font-semibold text-slate-600 dark:text-slate-300 hover:text-indigo-600 dark:hover:text-indigo-400 hover:bg-indigo-500/10'
            : 'px-2 sm:px-2.5 py-1 rounded-lg text-xs font-medium text-slate-600 dark:text-slate-300 bg-slate-100/80 dark:bg-slate-800/80 hover:bg-indigo-500/10 hover:text-indigo-600 dark:hover:text-indigo-400 border border-slate-200/70 dark:border-slate-700/70'
        }`}
      >
        <Archive className="w-3.5 h-3.5 shrink-0" />
        <span className="whitespace-nowrap">{label}</span>
      </button>

      {hasSelection && zip.onClear && !zip.busy && (
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            zip.onClear?.();
          }}
          title={t('selection.clear')}
          aria-label={t('selection.clear')}
          className="p-1 rounded-lg text-slate-400 hover:text-rose-500 hover:bg-rose-500/10 transition-colors leading-none"
        >
          <X className="w-3.5 h-3.5" />
        </button>
      )}
    </div>
  );
};
