import React from 'react';
import { useTranslation } from 'react-i18next';
import { HardDrive, Image, RefreshCw, TriangleAlert } from 'lucide-react';
import { ServerInfo } from '../types/dufs';
import { thumbsCapabilityEnabled } from '../services/dufsApi';
import { formatBytes } from '../utils/format';

/** 剩余可用低于这个绝对值就告警。没有配额概念，所以不看百分比（见下方注释）。 */
const LOW_SPACE_BYTES = 1024 * 1024 * 1024; // 1 GiB

/**
 * 已登录时才出现的服务端概况条：磁盘可用量 + 数据根占用 + 服务端能力（目前只有缩略图一项）。
 * 数据来自 Caddy 匹配 `/__lume__/info` 转发给极简 sh 脚本实时输出的 JSON（无落盘文件）。
 *
 * ⚠ 只显示「剩余可用」与「本目录已用」两个数，**不显示分区使用率**：`df` 的 total/used 是
 * 整个文件系统（含系统与别的软件）的占用，与网盘内容无关（实测：30 GiB 分区用了 11.4 GiB=38%，
 * 而数据根只有 1.42 GiB）——百分比条会让人以为网盘占了 38%。
 */
export const ServerInfoPanel: React.FC<{ status: ServerInfo; onRefresh?: () => void }> = ({
  status,
  onRefresh,
}) => {
  const { t, i18n } = useTranslation();

  const free = Math.max(0, status.free_bytes || 0);
  const dataBytes = typeof status.data_bytes === 'number' ? Math.max(0, status.data_bytes) : null;
  const lowSpace = free > 0 && free < LOW_SPACE_BYTES;
  const serverThumbs = thumbsCapabilityEnabled(status.thumbs);

  const generatedMs = Date.parse(status.generated_at || '');
  const updatedLabel = Number.isFinite(generatedMs)
    ? new Date(generatedMs).toLocaleString(
        i18n.language.startsWith('zh') ? 'zh-CN' : 'en-GB',
        { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit' }
      )
    : '—';

  const tone = lowSpace
    ? 'border-rose-500/35 bg-rose-500/10 text-rose-700 dark:text-rose-300'
    : 'border-slate-200/80 dark:border-slate-800/80 bg-white/70 dark:bg-slate-900/60 text-slate-600 dark:text-slate-300';

  return (
    <div
      className={`flex flex-wrap items-center gap-x-3 gap-y-1.5 px-3 sm:px-4 py-2 mb-3 rounded-2xl border text-[11px] sm:text-xs ${tone}`}
    >
      <span className="inline-flex items-center gap-1.5 font-semibold shrink-0">
        <HardDrive className="w-3.5 h-3.5 text-indigo-500 shrink-0" />
        <span>{t('disk.title')}</span>
      </span>

      <span className="font-mono tabular-nums shrink-0">
        {t('disk.fsFree', { free: formatBytes(free) })}
      </span>

      {dataBytes !== null && (
        <span
          className="font-mono tabular-nums shrink-0 opacity-80"
          title={status.path || undefined}
        >
          {t('disk.dataRoot', { size: formatBytes(dataBytes) })}
        </span>
      )}

      {/* 服务端能力位：只有扩展 API 明确注册了缩略图才亮，否则说明走的是前端原图预览 */}
      <span
        title={t(serverThumbs ? 'disk.capThumbsOn' : 'disk.capThumbsOff')}
        className={`inline-flex items-center gap-1 shrink-0 px-1.5 py-0.5 rounded-lg border font-medium ${
          serverThumbs
            ? 'border-emerald-500/30 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300'
            : 'border-slate-300/60 dark:border-slate-700/60 text-slate-400 dark:text-slate-500'
        }`}
      >
        <Image className="w-3 h-3 shrink-0" />
        <span>{t('disk.capThumbs')}</span>
      </span>

      <span className="inline-flex items-center gap-1.5 shrink-0 ml-auto opacity-75">
        {lowSpace && <TriangleAlert className="w-3.5 h-3.5 text-amber-500" />}
        <span>
          {lowSpace ? t('disk.lowSpace') : t('disk.updatedAt', { time: updatedLabel })}
        </span>
        {onRefresh && (
          <button
            type="button"
            onClick={onRefresh}
            title={t('disk.updatedAt', { time: updatedLabel })}
            className="p-1 rounded-lg hover:bg-black/5 dark:hover:bg-white/10 transition-colors"
          >
            <RefreshCw className="w-3 h-3" />
          </button>
        )}
      </span>
    </div>
  );
};
