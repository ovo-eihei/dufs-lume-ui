import React from 'react';
import { useTranslation } from 'react-i18next';
import { HardDrive, TriangleAlert } from 'lucide-react';
import { ServerInfo } from '../types/dufs';
import { formatBytes } from '../utils/format';

/** Low disk space threshold (1 GiB) */
export const LOW_SPACE_BYTES = 1024 * 1024 * 1024;

/**
 * Low space banner (Way A):
 * Displays only when available space is low (< 1 GiB), taking 0 vertical height otherwise.
 */
export const LowSpaceBanner: React.FC<{ status: ServerInfo }> = ({ status }) => {
  const { t } = useTranslation();
  const free = Math.max(0, status.free_bytes || 0);
  const lowSpace = free > 0 && free < LOW_SPACE_BYTES;

  if (!lowSpace) return null;

  return (
    <div className="flex items-center justify-between gap-3 px-3.5 py-2 mb-3 rounded-2xl border border-rose-500/35 bg-rose-500/10 text-rose-700 dark:text-rose-300 text-xs animate-fadeIn">
      <span className="inline-flex items-center gap-2 font-medium min-w-0">
        <TriangleAlert className="w-4 h-4 text-rose-500 shrink-0" />
        <span className="truncate">{t('disk.lowSpace')}</span>
      </span>
      <span className="font-mono tabular-nums shrink-0 font-semibold text-rose-600 dark:text-rose-400">
        {t('disk.fsFree', { free: formatBytes(free) })}
      </span>
    </div>
  );
};
