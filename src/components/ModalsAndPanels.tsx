import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  FolderPlus,
  UploadCloud,
  CheckCircle2,
  AlertTriangle,
  ShieldAlert,
  Ban,
  X,
  Trash2,
  Loader2,
} from 'lucide-react';
import { DufsPathItem, UploadTask } from '../types/dufs';
import { formatBytes } from '../utils/format';

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

  if (!isOpen) return null;

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
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/70 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        className="w-full max-w-md rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-xl p-6"
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
            className="p-1.5 rounded-lg text-slate-400 hover:text-slate-700 dark:hover:text-slate-200"
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
              className="w-full px-3.5 py-2.5 text-sm rounded-xl bg-slate-100 dark:bg-slate-800 text-slate-900 dark:text-white border border-slate-200 dark:border-slate-700 focus:outline-none focus:border-indigo-500"
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
              className="px-4 py-2 rounded-xl text-xs font-medium text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800"
            >
              {t('mkdir.cancel')}
            </button>
            <button
              type="submit"
              className="px-4 py-2 rounded-xl text-xs font-semibold bg-indigo-600 hover:bg-indigo-500 text-white shadow-sm"
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
  if (!targetItem) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/70 backdrop-blur-sm"
      onClick={onCancel}
    >
      <div
        className="w-full max-w-sm rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-xl p-6"
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
          {t('file.deleteConfirmDesc', { name: targetItem.name })}
        </p>
        <div className="flex items-center justify-end gap-2">
          <button
            type="button"
            onClick={onCancel}
            className="px-4 py-2 rounded-xl text-xs font-medium text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800"
          >
            {t('file.cancel')}
          </button>
          <button
            type="button"
            onClick={() => onConfirm(targetItem)}
            className="px-4 py-2 rounded-xl text-xs font-semibold bg-rose-600 hover:bg-rose-500 text-white shadow-sm"
          >
            {t('file.confirmDelete')}
          </button>
        </div>
      </div>
    </div>
  );
};

/* ======================= 3. 全屏拖拽上传覆盖层 ======================= */
interface DragDropOverlayProps {
  active: boolean;
  currentHref: string;
}

export const DragDropOverlay: React.FC<DragDropOverlayProps> = ({ active, currentHref }) => {
  const { t } = useTranslation();
  if (!active) return null;

  return (
    <div className="fixed inset-0 z-50 pointer-events-none bg-indigo-950/60 backdrop-blur-md flex items-center justify-center p-6">
      <div className="w-full max-w-xl rounded-3xl border-2 border-dashed border-indigo-400 bg-slate-900/90 p-12 text-center shadow-2xl">
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

/* ======================= 4. 悬浮上传任务进度面板 ======================= */
interface UploadQueuePanelProps {
  tasks: UploadTask[];
  onClearCompleted: () => void;
  onDismissTask: (id: string) => void;
  /** 取消正在上传的任务：abort XHR + 删除服务端残留 */
  onCancelTask: (id: string) => void;
}

export const UploadQueuePanel: React.FC<UploadQueuePanelProps> = ({
  tasks,
  onClearCompleted,
  onDismissTask,
  onCancelTask,
}) => {
  const { t } = useTranslation();
  if (tasks.length === 0) return null;

  return (
    <div className="fixed bottom-3 inset-x-3 sm:inset-x-auto sm:bottom-4 sm:right-4 z-40 sm:w-96 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-2xl overflow-hidden">
      <div className="flex items-center justify-between px-4 py-3 bg-slate-50 dark:bg-slate-800/80 border-b border-slate-200 dark:border-slate-800">
        <span className="text-xs font-bold text-slate-800 dark:text-slate-200">
          {t('upload.panelTitle')} ({tasks.length})
        </span>
        <button
          type="button"
          onClick={onClearCompleted}
          className="text-[11px] font-medium text-indigo-600 dark:text-indigo-400 hover:underline"
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
                {task.status === 'completed' && (
                  <CheckCircle2 className="w-4 h-4 text-emerald-500" />
                )}
                {task.status === 'failed' && <AlertTriangle className="w-4 h-4 text-rose-500" />}
                {task.status === 'auth_blocked' && (
                  <ShieldAlert className="w-4 h-4 text-amber-500" />
                )}
                {task.status === 'cancelled' && <Ban className="w-4 h-4 text-slate-400" />}
                {task.status === 'uploading' ? (
                  <button
                    type="button"
                    onClick={() => onCancelTask(task.id)}
                    title={t('upload.cancelBtn')}
                    className="px-1.5 py-0.5 rounded-md text-[11px] font-medium text-rose-600 dark:text-rose-400 hover:bg-rose-50 dark:hover:bg-rose-950/40 transition-colors"
                  >
                    {t('upload.cancelBtn')}
                  </button>
                ) : (
                <button
                  type="button"
                  onClick={() => onDismissTask(task.id)}
                  className="text-slate-400 hover:text-slate-600"
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

/* ======================= 5. 关闭 HTML 预览沙箱的二次确认 ======================= */
/**
 * 「关闭沙箱」的唯一确认入口：设置面板的开关与预览提示条上的按钮都调用同一个
 * `onRequestDisableSandbox()`，因此只有一份弹窗、只有一条关闭路径。
 * 必须勾选「我已了解上述风险」才能点确认（防手滑）。
 */
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

  if (!isOpen) return null;

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
      className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-slate-950/70 backdrop-blur-sm"
      onClick={handleCancel}
    >
      <div
        className="w-full max-w-lg rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-xl p-6"
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
            className="px-4 py-2 rounded-xl text-xs font-medium text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800"
          >
            {t('sandbox.keepSandbox')}
          </button>
          <button
            type="button"
            disabled={!acknowledged}
            onClick={handleConfirm}
            className="px-4 py-2 rounded-xl text-xs font-semibold bg-amber-600 hover:bg-amber-500 text-white shadow-sm disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:bg-amber-600 transition-colors"
          >
            {t('sandbox.confirmDisable')}
          </button>
        </div>
      </div>
    </div>
  );
};
