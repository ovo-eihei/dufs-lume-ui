import React, { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import {
  FolderPlus,
  UploadCloud,
  ClipboardPaste,
  CheckCircle2,
  AlertTriangle,
  ShieldAlert,
  Ban,
  X,
  Trash2,
  Loader2,
  Clock,
  Music,
  Play,
  Pause,
  SkipBack,
  SkipForward,
  Maximize2,
} from 'lucide-react';
import { DufsPathItem, UploadTask } from '../types/dufs';
import { formatBytes } from '../utils/format';
import { useModalTransition } from '../utils/useModalTransition';

function buildTimestampName(prefix: string, ext: string): string {
  const now = new Date();
  const pad = (n: number) => String(n).padStart(2, '0');
  const ts = `${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}-${pad(
    now.getHours()
  )}${pad(now.getMinutes())}${pad(now.getSeconds())}`;
  return `${prefix}-${ts}.${ext}`;
}

/* ======================= 1. 新建文件夹弹窗 ======================= */
interface NewFolderModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSubmit: (folderName: string) => void;
}

export const NewFolderModal: React.FC<NewFolderModalProps> = ({
  isOpen,
  onClose,
  onSubmit,
}) => {
  const { t } = useTranslation();
  const [folderName, setFolderName] = useState('');
  const [error, setError] = useState<string | null>(null);
  const { rendered, isClosing } = useModalTransition(isOpen, 160);

  if (!rendered) return null;

  const handleCreate = (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = folderName.trim();
    if (!trimmed || trimmed.includes('/') || trimmed.includes('\\') || trimmed === '..') {
      setError(t('mkdir.invalidName'));
      return;
    }
    setError(null);
    setFolderName('');
    onSubmit(trimmed);
  };

  return (
    <div
      className={`fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/70 backdrop-blur-sm ${
        isClosing ? 'animate-fadeOut' : 'animate-fadeIn'
      }`}
      onClick={onClose}
    >
      <div
        className={`w-full max-w-md rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-2xl p-6 ${
          isClosing ? 'animate-modalOut' : 'animate-modalIn'
        }`}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-xl bg-indigo-500/10 text-indigo-600 dark:text-indigo-400 flex items-center justify-center">
              <FolderPlus className="w-5 h-5" />
            </div>
            <h3 className="font-bold text-base text-slate-900 dark:text-white">
              {t('mkdir.title')}
            </h3>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 rounded-lg text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 active:scale-90 transition-transform"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <form onSubmit={handleCreate} className="space-y-4">
          <div>
            <input
              type="text"
              autoFocus
              value={folderName}
              onChange={(e) => {
                setFolderName(e.target.value);
                if (error) setError(null);
              }}
              placeholder={t('mkdir.placeholder')}
              className="w-full px-3.5 py-2.5 text-sm rounded-xl bg-slate-100 dark:bg-slate-800 text-slate-900 dark:text-white border border-slate-200 dark:border-slate-700 focus:outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/20 transition-all"
            />
            {error ? (
              <p className="text-xs text-rose-500 mt-1.5">{error}</p>
            ) : (
              <p className="text-xs text-slate-400 mt-1.5">{t('mkdir.hint')}</p>
            )}
          </div>

          <div className="flex items-center justify-end gap-2 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 rounded-xl text-xs font-medium text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 active:scale-95 transition-all"
            >
              {t('mkdir.cancel')}
            </button>
            <button
              type="submit"
              className="px-4 py-2 rounded-xl text-xs font-semibold bg-indigo-600 hover:bg-indigo-500 text-white shadow-sm active:scale-95 transition-all"
            >
              {t('mkdir.create')}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

/* ======================= 2. 删除确认弹窗 ======================= */
interface DeleteConfirmModalProps {
  targetItem: DufsPathItem | null;
  onCancel: () => void;
  onConfirm: (item: DufsPathItem) => void;
}

export const DeleteConfirmModal: React.FC<DeleteConfirmModalProps> = ({
  targetItem,
  onCancel,
  onConfirm,
}) => {
  const { t } = useTranslation();
  const { rendered, isClosing } = useModalTransition(!!targetItem, 160);
  const [cachedItem, setCachedItem] = useState<DufsPathItem | null>(targetItem);

  useEffect(() => {
    if (targetItem) setCachedItem(targetItem);
  }, [targetItem]);

  if (!rendered || !cachedItem) return null;

  return (
    <div
      className={`fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/70 backdrop-blur-sm ${
        isClosing ? 'animate-fadeOut' : 'animate-fadeIn'
      }`}
      onClick={onCancel}
    >
      <div
        className={`w-full max-w-sm rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-2xl p-6 ${
          isClosing ? 'animate-modalOut' : 'animate-modalIn'
        }`}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center gap-3 mb-3">
          <div className="w-10 h-10 rounded-xl bg-rose-500/10 text-rose-600 dark:text-rose-400 flex items-center justify-center shrink-0">
            <Trash2 className="w-5 h-5" />
          </div>
          <h3 className="font-bold text-base text-slate-900 dark:text-white">
            {t('file.deleteConfirmTitle')}
          </h3>
        </div>
        <p className="text-xs sm:text-sm text-slate-600 dark:text-slate-300 leading-relaxed mb-5">
          {t('file.deleteConfirmDesc', { name: cachedItem.name })}
        </p>
        <div className="flex items-center justify-end gap-2">
          <button
            type="button"
            onClick={onCancel}
            className="px-4 py-2 rounded-xl text-xs font-medium text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 active:scale-95 transition-all"
          >
            {t('file.cancel')}
          </button>
          <button
            type="button"
            onClick={() => onConfirm(cachedItem)}
            className="px-4 py-2 rounded-xl text-xs font-semibold bg-rose-600 hover:bg-rose-500 text-white shadow-sm active:scale-95 transition-all"
          >
            {t('file.confirmDelete')}
          </button>
        </div>
      </div>
    </div>
  );
};

/* ======================= 3. 剪贴板粘贴上传弹窗 (Feature 1) ======================= */
interface PasteUploadModalProps {
  isOpen: boolean;
  initialFile: File | null;
  initialText?: string;
  initialImagePreviewUrl?: string;
  onCancel: () => void;
  onConfirm: (file: File) => void;
}

export const PasteUploadModal: React.FC<PasteUploadModalProps> = ({
  isOpen,
  initialFile,
  initialText,
  initialImagePreviewUrl,
  onCancel,
  onConfirm,
}) => {
  const { t } = useTranslation();
  const [fileName, setFileName] = useState('');
  const [textContent, setTextContent] = useState('');
  const [imageBlob, setImageBlob] = useState<File | null>(null);
  const [imageUrl, setImageUrl] = useState<string | undefined>(undefined);
  const { rendered, isClosing } = useModalTransition(isOpen, 160);

  useEffect(() => {
    if (!isOpen) return;
    if (initialFile && initialImagePreviewUrl) {
      setImageBlob(initialFile);
      setImageUrl(initialImagePreviewUrl);
      setTextContent('');
      setFileName(initialFile.name);
    } else if (initialText !== undefined && initialText.length > 0) {
      setImageBlob(null);
      setImageUrl(undefined);
      setTextContent(initialText);
      setFileName(initialFile?.name || buildTimestampName('snippet', 'txt'));
    } else {
      setImageBlob(null);
      setImageUrl(undefined);
      setTextContent('');
      setFileName(buildTimestampName('snippet', 'txt'));
    }
  }, [isOpen, initialFile, initialText, initialImagePreviewUrl]);

  if (!rendered) return null;

  const handleModalPaste = (e: React.ClipboardEvent) => {
    const items = e.clipboardData?.items;
    if (!items) return;
    for (let i = 0; i < items.length; i++) {
      const it = items[i];
      if (it.type.startsWith('image/')) {
        const blob = it.getAsFile();
        if (blob) {
          e.preventDefault();
          const ext = it.type === 'image/jpeg' ? 'jpg' : 'png';
          const name = buildTimestampName('paste', ext);
          const file = new File([blob], name, { type: blob.type });
          if (imageUrl && imageUrl !== initialImagePreviewUrl) {
            URL.revokeObjectURL(imageUrl);
          }
          setImageBlob(file);
          setImageUrl(URL.createObjectURL(blob));
          setFileName(name);
          return;
        }
      }
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const targetName = (fileName.trim() || buildTimestampName('snippet', 'txt')).replace(/[\\/]/g, '-');
    if (imageBlob) {
      const finalFile = new File([imageBlob], targetName, {
        type: imageBlob.type,
        lastModified: Date.now(),
      });
      onConfirm(finalFile);
      return;
    }
    const content = textContent;
    if (!content.trim()) return;
    const blob = new Blob([content], { type: 'text/plain;charset=utf-8' });
    const finalFile = new File([blob], targetName, {
      type: 'text/plain',
      lastModified: Date.now(),
    });
    onConfirm(finalFile);
  };

  const canSubmit = !!imageBlob || textContent.trim().length > 0;

  return (
    <div
      className={`fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/70 backdrop-blur-sm ${
        isClosing ? 'animate-fadeOut' : 'animate-fadeIn'
      }`}
      onClick={onCancel}
    >
      <div
        onPaste={handleModalPaste}
        className={`w-full max-w-lg rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-2xl p-6 ${
          isClosing ? 'animate-modalOut' : 'animate-modalIn'
        }`}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-xl bg-indigo-500/10 text-indigo-600 dark:text-indigo-400 flex items-center justify-center">
              <ClipboardPaste className="w-5 h-5" />
            </div>
            <div>
              <h3 className="font-bold text-base text-slate-900 dark:text-white">
                {t('paste.title')}
              </h3>
              <p className="text-[11px] text-slate-400">
                {imageBlob
                  ? t('paste.imageSnippet', { size: formatBytes(imageBlob.size) })
                  : t('paste.textSnippet', {
                      bytes: formatBytes(new Blob([textContent]).size),
                    })}
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onCancel}
            className="p-1.5 rounded-lg text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 active:scale-90 transition-transform"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1.5">
              {t('paste.previewLabel')}
            </label>
            {imageUrl ? (
              <div className="relative flex items-center justify-center max-h-52 overflow-hidden rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-900/5 dark:bg-slate-950 p-2">
                <img
                  src={imageUrl}
                  alt="Paste Preview"
                  className="max-h-48 w-auto object-contain rounded-lg"
                />
                <button
                  type="button"
                  onClick={() => {
                    setImageBlob(null);
                    setImageUrl(undefined);
                    setFileName(buildTimestampName('snippet', 'txt'));
                  }}
                  className="absolute top-2 right-2 p-1 rounded-lg bg-slate-900/70 text-white hover:bg-slate-900 text-xs"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              </div>
            ) : (
              <textarea
                rows={5}
                autoFocus={!initialText}
                value={textContent}
                onChange={(e) => setTextContent(e.target.value)}
                placeholder={t('paste.placeholder')}
                className="w-full px-3.5 py-2.5 text-xs font-mono leading-relaxed rounded-xl bg-slate-50 dark:bg-slate-950/70 text-slate-800 dark:text-slate-200 border border-slate-200 dark:border-slate-800 focus:outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/20 transition-all resize-y"
              />
            )}
          </div>

          <div>
            <label className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1.5">
              {t('paste.fileNameLabel')}
            </label>
            <input
              type="text"
              autoFocus={!!initialText || !!imageUrl}
              value={fileName}
              onChange={(e) => setFileName(e.target.value)}
              className="w-full px-3.5 py-2 text-xs sm:text-sm rounded-xl bg-slate-100 dark:bg-slate-800 text-slate-900 dark:text-white border border-slate-200 dark:border-slate-700 focus:outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/20 transition-all font-mono"
            />
          </div>

          <div className="flex items-center justify-end gap-2 pt-1">
            <button
              type="button"
              onClick={onCancel}
              className="px-4 py-2 rounded-xl text-xs font-medium text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 active:scale-95 transition-all"
            >
              {t('paste.cancelBtn')}
            </button>
            <button
              type="submit"
              disabled={!canSubmit}
              className="px-4 py-2 rounded-xl text-xs font-semibold bg-indigo-600 hover:bg-indigo-500 text-white shadow-sm disabled:opacity-40 disabled:cursor-not-allowed active:scale-95 transition-all"
            >
              {t('paste.confirmBtn')}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

/* ======================= 4. 全屏拖拽上传覆盖层 ======================= */
interface DragDropOverlayProps {
  active: boolean;
  currentHref: string;
}

export const DragDropOverlay: React.FC<DragDropOverlayProps> = ({ active, currentHref }) => {
  const { t } = useTranslation();
  if (!active) return null;

  return (
    <div className="fixed inset-0 z-50 pointer-events-none bg-indigo-950/60 backdrop-blur-md flex items-center justify-center p-6 animate-fadeIn">
      <div className="w-full max-w-xl rounded-3xl border-2 border-dashed border-indigo-400 bg-slate-900/90 p-12 text-center shadow-2xl animate-modalIn">
        <div className="w-16 h-16 rounded-2xl bg-indigo-500/20 text-indigo-400 flex items-center justify-center mx-auto mb-4 animate-bounce">
          <UploadCloud className="w-9 h-9" />
        </div>
        <h3 className="text-xl font-bold text-white mb-2">{t('upload.dropOverlayTitle')}</h3>
        <p className="text-sm text-indigo-200 font-mono">
          {t('upload.dropOverlaySubtitle', { path: currentHref })}
        </p>
      </div>
    </div>
  );
};

/* ======================= 5. 悬浮上传任务进度面板 ======================= */
interface UploadQueuePanelProps {
  tasks: UploadTask[];
  onClearCompleted: () => void;
  onDismissTask: (id: string) => void;
  onCancelTask: (id: string) => void;
}

export const UploadQueuePanel: React.FC<UploadQueuePanelProps> = ({
  tasks,
  onClearCompleted,
  onDismissTask,
  onCancelTask,
}) => {
  const { t } = useTranslation();

  // 未结算的任务 = 还在队列里；排队项显示「第 N 位」，N 按发起顺序数
  const pending = tasks.filter((task) => task.status === 'uploading' || task.status === 'queued');
  const waitingCount = tasks.filter((task) => task.status === 'queued').length;

  if (tasks.length === 0) return null;

  return (
    <div className="fixed bottom-3 inset-x-3 sm:inset-x-auto sm:bottom-4 sm:right-4 z-40 sm:w-96 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-2xl overflow-hidden animate-slideUp">
      <div className="flex items-center justify-between px-4 py-3 bg-slate-50 dark:bg-slate-800/80 border-b border-slate-200 dark:border-slate-800">
        <span className="flex items-baseline gap-2 text-xs font-bold text-slate-800 dark:text-slate-200">
          <span>
            {t('upload.panelTitle')} ({tasks.length})
          </span>
          {waitingCount > 0 && (
            <span className="font-normal text-[11px] text-slate-400">
              {t('upload.queueSummary', { active: pending.length - waitingCount, waiting: waitingCount })}
            </span>
          )}
        </span>
        <button
          type="button"
          onClick={onClearCompleted}
          className="text-[11px] font-medium text-indigo-600 dark:text-indigo-400 hover:underline active:scale-95 transition-transform"
        >
          {t('upload.clearCompleted')}
        </button>
      </div>

      <div className="max-h-60 overflow-y-auto divide-y divide-slate-100 dark:divide-slate-800">
        {tasks.map((task) => (
          <div key={task.id} className="p-3 text-xs space-y-1.5">
            <div className="flex items-center justify-between gap-2">
              <span className="font-medium text-slate-800 dark:text-slate-200 truncate">
                {task.file.name}
              </span>
              <div className="flex items-center gap-1.5 shrink-0">
                {task.status === 'uploading' && (
                  <Loader2 className="w-3.5 h-3.5 animate-spin text-indigo-500" />
                )}
                {task.status === 'queued' && <Clock className="w-4 h-4 text-slate-400" />}
                {task.status === 'completed' && (
                  <CheckCircle2 className="w-4 h-4 text-emerald-500" />
                )}
                {task.status === 'failed' && <AlertTriangle className="w-4 h-4 text-rose-500" />}
                {task.status === 'auth_blocked' && (
                  <ShieldAlert className="w-4 h-4 text-amber-500" />
                )}
                {task.status === 'cancelled' && <Ban className="w-4 h-4 text-slate-400" />}
                {task.status === 'uploading' || task.status === 'queued' ? (
                  <button
                    type="button"
                    onClick={() => onCancelTask(task.id)}
                    title={t('upload.cancelBtn')}
                    className="px-1.5 py-0.5 rounded-md text-[11px] font-medium text-rose-600 dark:text-rose-400 hover:bg-rose-50 dark:hover:bg-rose-950/40 active:scale-90 transition-all"
                  >
                    {t('upload.cancelBtn')}
                  </button>
                ) : (
                  <button
                    type="button"
                    onClick={() => onDismissTask(task.id)}
                    className="text-slate-400 hover:text-slate-600 active:scale-90 transition-transform"
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                )}
              </div>
            </div>

            <div className="w-full h-1.5 rounded-full bg-slate-100 dark:bg-slate-800 overflow-hidden">
              <div
                className={`h-full transition-all duration-200 ${
                  task.status === 'completed'
                    ? 'bg-emerald-500'
                    : task.status === 'queued'
                    ? 'bg-slate-300 dark:bg-slate-600'
                    : task.status === 'auth_blocked'
                    ? 'bg-amber-500'
                    : task.status === 'cancelled'
                    ? 'bg-slate-400'
                    : task.status === 'failed'
                    ? 'bg-rose-500'
                    : 'bg-indigo-500'
                }`}
                style={{ width: `${task.progress}%` }}
              />
            </div>

            <div className="flex items-center justify-between text-[11px] text-slate-400">
              <span>{formatBytes(task.file.size)}</span>
              <span>
                {task.status === 'uploading' && `${task.progress}%`}
                {task.status === 'queued' &&
                  t('upload.queued', { n: pending.findIndex((p) => p.id === task.id) + 1 })},
                {task.status === 'completed' && t('upload.completed')}
                {task.status === 'auth_blocked' && t('upload.authBlocked')}
                {task.status === 'cancelled' && t('upload.cancelled')}
                {task.status === 'failed' && (task.errorMsg || t('upload.failed'))}
              </span>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};

/* ======================= 6. 后台悬浮迷你音频播放器 (Feature 5) ======================= */
function formatAudioSeconds(sec: number): string {
  if (!Number.isFinite(sec) || sec < 0) return '00:00';
  const m = Math.floor(sec / 60);
  const s = Math.floor(sec % 60);
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

interface MiniAudioPlayerProps {
  item: DufsPathItem | null;
  isPlaying: boolean;
  currentTime: number;
  duration: number;
  onSeek: (time: number) => void;
  onTogglePlay: () => void;
  onPrev: () => void;
  onNext: () => void;
  hasPrev: boolean;
  hasNext: boolean;
  onExpand: () => void;
  onClose: () => void;
}

export const MiniAudioPlayer: React.FC<MiniAudioPlayerProps> = ({
  item,
  isPlaying,
  currentTime,
  duration,
  onSeek,
  onTogglePlay,
  onPrev,
  onNext,
  hasPrev,
  hasNext,
  onExpand,
  onClose,
}) => {
  const { t } = useTranslation();
  if (!item) return null;

  const progressPercent = duration > 0 ? Math.min(100, (currentTime / duration) * 100) : 0;

  return (
    <div className="fixed bottom-4 left-3 sm:left-6 z-40 w-[calc(100vw-1.5rem)] sm:w-80 rounded-2xl bg-white/95 dark:bg-slate-900/95 backdrop-blur-md border border-slate-200/90 dark:border-slate-800 shadow-2xl p-3 animate-slideUp">
      <div className="flex items-center gap-2.5">
        <div
          onClick={onExpand}
          className="w-9 h-9 rounded-xl bg-gradient-to-tr from-pink-500 to-indigo-500 flex items-center justify-center text-white shrink-0 shadow-sm cursor-pointer"
        >
          <Music className={`w-4 h-4 ${isPlaying ? 'animate-pulse' : ''}`} />
        </div>

        <div className="min-w-0 flex-1 cursor-pointer" onClick={onExpand}>
          <p className="text-xs font-semibold text-slate-900 dark:text-white truncate" title={item.name}>
            {item.name}
          </p>
          <p className="text-[10px] font-mono text-slate-400 truncate">
            {formatAudioSeconds(currentTime)} / {formatAudioSeconds(duration)} ·{' '}
            {isPlaying ? t('player.nowPlaying') : t('player.paused')}
          </p>
        </div>

        <div className="flex items-center gap-0.5 shrink-0">
          {/* 四个按钮常驻，到头时只置灰 —— 条件渲染会让整行左右跳 */}
          <button
            type="button"
            disabled={!hasPrev}
            onClick={onPrev}
            title={t('player.prevTrack')}
            aria-label={t('player.prevTrack')}
            className="p-1.5 rounded-lg text-slate-500 hover:text-slate-800 dark:text-slate-400 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 active:scale-90 disabled:opacity-35 disabled:pointer-events-none transition-all"
          >
            <SkipBack className="w-3.5 h-3.5" />
          </button>
          <button
            type="button"
            onClick={onTogglePlay}
            title={isPlaying ? t('player.pause') : t('player.play')}
            className="p-1.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white shadow-sm active:scale-90 transition-all"
          >
            {isPlaying ? <Pause className="w-3.5 h-3.5" /> : <Play className="w-3.5 h-3.5" />}
          </button>
          <button
            type="button"
            disabled={!hasNext}
            onClick={onNext}
            title={t('player.nextTrack')}
            aria-label={t('player.nextTrack')}
            className="p-1.5 rounded-lg text-slate-500 hover:text-slate-800 dark:text-slate-400 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 active:scale-90 disabled:opacity-35 disabled:pointer-events-none transition-all"
          >
            <SkipForward className="w-3.5 h-3.5" />
          </button>
          <button
            type="button"
            onClick={onExpand}
            title={t('player.expand')}
            className="p-1.5 rounded-lg text-slate-400 hover:text-slate-600 dark:hover:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 active:scale-90 transition-all"
          >
            <Maximize2 className="w-3.5 h-3.5" />
          </button>
          <button
            type="button"
            onClick={onClose}
            title={t('player.close')}
            className="p-1.5 rounded-lg text-slate-400 hover:text-slate-600 dark:hover:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 active:scale-90 transition-all"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      <div className="mt-2 flex items-center">
        <input
          type="range"
          min={0}
          max={duration > 0 ? duration : 1}
          step={0.05}
          value={currentTime}
          onChange={(e) => onSeek(parseFloat(e.target.value))}
          aria-label="Audio Seek"
          style={{
            background: `linear-gradient(to right, #6366f1 ${progressPercent}%, rgba(148,163,184,0.25) ${progressPercent}%)`,
          }}
          className="w-full h-1.5 rounded-full appearance-none cursor-pointer accent-indigo-600"
        />
      </div>
    </div>
  );
};

/* ======================= 7. 关闭 HTML 预览沙箱的二次确认 ======================= */
interface SandboxDisableConfirmModalProps {
  isOpen: boolean;
  onCancel: () => void;
  onConfirm: () => void;
}

export const SandboxDisableConfirmModal: React.FC<SandboxDisableConfirmModalProps> = ({
  isOpen,
  onCancel,
  onConfirm,
}) => {
  const { t } = useTranslation();
  const [acknowledged, setAcknowledged] = useState(false);
  const { rendered, isClosing } = useModalTransition(isOpen, 160);

  if (!rendered) return null;

  const handleCancel = () => {
    setAcknowledged(false);
    onCancel();
  };

  const handleConfirm = () => {
    if (!acknowledged) return;
    setAcknowledged(false);
    onConfirm();
  };

  return (
    <div
      className={`fixed inset-0 z-[60] flex items-center justify-center p-4 bg-slate-950/70 backdrop-blur-sm ${
        isClosing ? 'animate-fadeOut' : 'animate-fadeIn'
      }`}
      onClick={handleCancel}
    >
      <div
        className={`w-full max-w-lg rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-2xl p-6 ${
          isClosing ? 'animate-modalOut' : 'animate-modalIn'
        }`}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center gap-3 mb-4">
          <div className="w-10 h-10 rounded-xl bg-amber-500/10 text-amber-600 dark:text-amber-400 flex items-center justify-center shrink-0">
            <ShieldAlert className="w-5 h-5" />
          </div>
          <h3 className="font-bold text-base sm:text-lg text-slate-900 dark:text-white">
            {t('sandbox.confirmTitle')}
          </h3>
        </div>

        <p className="text-xs sm:text-sm text-slate-600 dark:text-slate-300 leading-relaxed">
          {t('sandbox.confirmBody', { host: window.location.host })}
        </p>

        <ul className="mt-3 space-y-1.5 text-xs sm:text-sm text-slate-600 dark:text-slate-300">
          {t('sandbox.confirmBullets')
            .split('|')
            .map((line) => (
              <li key={line} className="flex items-start gap-2">
                <AlertTriangle className="w-3.5 h-3.5 mt-0.5 shrink-0 text-amber-500" />
                <span>{line.trim()}</span>
              </li>
            ))}
        </ul>

        <label className="mt-4 flex items-start gap-2.5 p-3 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/60 cursor-pointer select-none">
          <input
            type="checkbox"
            checked={acknowledged}
            onChange={(e) => setAcknowledged(e.target.checked)}
            className="mt-0.5 w-4 h-4 accent-indigo-600 shrink-0 cursor-pointer"
          />
          <span className="text-xs sm:text-sm font-medium text-slate-700 dark:text-slate-200">
            {t('sandbox.confirmAck')}
          </span>
        </label>

        <div className="flex items-center justify-end gap-2 pt-4">
          <button
            type="button"
            onClick={handleCancel}
            className="px-4 py-2 rounded-xl text-xs font-medium text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 active:scale-95 transition-all"
          >
            {t('sandbox.keepSandbox')}
          </button>
          <button
            type="button"
            disabled={!acknowledged}
            onClick={handleConfirm}
            className="px-4 py-2 rounded-xl text-xs font-semibold bg-amber-600 hover:bg-amber-500 text-white shadow-sm disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:bg-amber-600 active:scale-95 transition-all"
          >
            {t('sandbox.confirmDisable')}
          </button>
        </div>
      </div>
    </div>
  );
};

/* ======================= 8. 详情弹窗里的音频面板（受控 UI，不自建 <audio>） ======================= */

/**
 * 全站只有 App 根部那一个 <audio> 元素在播（迷你播放器与弹窗共用它）。
 * 弹窗这边只画控件、只读状态、只发指令，所以「展开/收起」不会重头播放。
 */
export interface AudioBridge {
  trackName: string;
  isPlaying: boolean;
  currentTime: number;
  duration: number;
  onTogglePlay: () => void;
  onSeek: (time: number) => void;
  onPrev: () => void;
  onNext: () => void;
  hasPrev: boolean;
  hasNext: boolean;
}

export const AudioPlayerCard: React.FC<{ bridge: AudioBridge }> = ({ bridge }) => {
  const { t } = useTranslation();
  const total = bridge.duration > 0 ? bridge.duration : 0;
  const value = Math.min(bridge.currentTime, total);

  return (
    <div className="flex-1 min-h-0 flex flex-col items-center justify-center gap-5 px-6 py-10 bg-slate-50/50 dark:bg-slate-950/50">
      <div className="w-24 h-24 rounded-3xl bg-gradient-to-tr from-pink-500 to-indigo-500 flex items-center justify-center text-white shadow-lg">
        <Music className={`w-10 h-10 ${bridge.isPlaying ? 'animate-pulse' : ''}`} />
      </div>
      <p className="max-w-full truncate font-semibold text-base text-slate-900 dark:text-white">
        {bridge.trackName}
      </p>

      <div className="w-full max-w-md flex flex-col gap-1">
        <input
          type="range"
          min={0}
          max={total || 0}
          step={0.1}
          value={value}
          disabled={!total}
          onChange={(e) => bridge.onSeek(Number(e.target.value))}
          aria-label={t('player.seek')}
          className="w-full accent-indigo-600 disabled:opacity-40"
        />
        <div className="flex items-center justify-between text-[11px] font-mono text-slate-400">
          <span>{formatAudioSeconds(value)}</span>
          <span className="font-sans">{bridge.isPlaying ? t('player.playing') : t('player.paused')}</span>
          <span>{formatAudioSeconds(total)}</span>
        </div>
      </div>

      <div className="flex items-center gap-3">
        {/* 到头时只置灰不隐藏：少一个按钮会让播放键在行里左右跳 */}
        <button
          type="button"
          disabled={!bridge.hasPrev}
          onClick={bridge.onPrev}
          title={t('player.prevTrack')}
          aria-label={t('player.prevTrack')}
          className="p-2.5 rounded-xl text-slate-500 hover:text-slate-800 dark:text-slate-400 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 active:scale-90 disabled:opacity-35 disabled:pointer-events-none transition-all"
        >
          <SkipBack className="w-5 h-5" />
        </button>
        <button
          type="button"
          onClick={bridge.onTogglePlay}
          title={bridge.isPlaying ? t('player.pause') : t('player.play')}
          aria-label={bridge.isPlaying ? t('player.pause') : t('player.play')}
          className="p-4 rounded-2xl bg-indigo-600 hover:bg-indigo-500 text-white shadow-md active:scale-90 transition-all"
        >
          {bridge.isPlaying ? <Pause className="w-6 h-6" /> : <Play className="w-6 h-6" />}
        </button>
        <button
          type="button"
          disabled={!bridge.hasNext}
          onClick={bridge.onNext}
          title={t('player.nextTrack')}
          aria-label={t('player.nextTrack')}
          className="p-2.5 rounded-xl text-slate-500 hover:text-slate-800 dark:text-slate-400 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 active:scale-90 disabled:opacity-35 disabled:pointer-events-none transition-all"
        >
          <SkipForward className="w-5 h-5" />
        </button>
      </div>
    </div>
  );
};
