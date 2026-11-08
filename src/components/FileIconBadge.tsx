import React from 'react';
import {
  Folder,
  FileText,
  Image as ImageIcon,
  Film,
  Music,
  FileCode,
  FileSpreadsheet,
  Archive,
  File,
} from 'lucide-react';
import { DufsPathItem } from '../types/dufs';
import { getFileExtension, getPreviewCategory, isDirectory } from '../utils/format';

interface FileIconBadgeProps {
  item: DufsPathItem;
  size?: 'sm' | 'md' | 'lg';
}

export const FileIconBadge: React.FC<FileIconBadgeProps> = ({ item, size = 'md' }) => {
  const isDir = isDirectory(item);
  const category = getPreviewCategory(item.name);
  const ext = getFileExtension(item.name);

  const boxSizes = {
    sm: 'w-8 h-8 rounded-lg',
    md: 'w-10 h-10 rounded-xl',
    lg: 'w-14 h-14 rounded-2xl',
  };

  const iconSizes = {
    sm: 'w-4 h-4',
    md: 'w-5 h-5',
    lg: 'w-7 h-7',
  };

  if (isDir) {
    return (
      <div
        className={`${boxSizes[size]} bg-amber-500/10 dark:bg-amber-400/15 text-amber-600 dark:text-amber-400 flex items-center justify-center shrink-0 border border-amber-500/20`}
      >
        <Folder className={`${iconSizes[size]} fill-current`} />
      </div>
    );
  }

  if (category === 'image') {
    return (
      <div
        className={`${boxSizes[size]} bg-emerald-500/10 dark:bg-emerald-400/15 text-emerald-600 dark:text-emerald-400 flex items-center justify-center shrink-0 border border-emerald-500/20`}
      >
        <ImageIcon className={iconSizes[size]} />
      </div>
    );
  }

  if (category === 'video') {
    return (
      <div
        className={`${boxSizes[size]} bg-purple-500/10 dark:bg-purple-400/15 text-purple-600 dark:text-purple-400 flex items-center justify-center shrink-0 border border-purple-500/20`}
      >
        <Film className={iconSizes[size]} />
      </div>
    );
  }

  if (category === 'audio') {
    return (
      <div
        className={`${boxSizes[size]} bg-pink-500/10 dark:bg-pink-400/15 text-pink-600 dark:text-pink-400 flex items-center justify-center shrink-0 border border-pink-500/20`}
      >
        <Music className={iconSizes[size]} />
      </div>
    );
  }

  if (category === 'markdown' || category === 'pdf') {
    return (
      <div
        className={`${boxSizes[size]} bg-rose-500/10 dark:bg-rose-400/15 text-rose-600 dark:text-rose-400 flex items-center justify-center shrink-0 border border-rose-500/20`}
      >
        <FileText className={iconSizes[size]} />
      </div>
    );
  }

  if (['zip', 'tar', 'gz', '7z', 'rar', 'xz', 'bz2'].includes(ext)) {
    return (
      <div
        className={`${boxSizes[size]} bg-orange-500/10 dark:bg-orange-400/15 text-orange-600 dark:text-orange-400 flex items-center justify-center shrink-0 border border-orange-500/20`}
      >
        <Archive className={iconSizes[size]} />
      </div>
    );
  }

  if (['csv', 'xls', 'xlsx'].includes(ext)) {
    return (
      <div
        className={`${boxSizes[size]} bg-teal-500/10 dark:bg-teal-400/15 text-teal-600 dark:text-teal-400 flex items-center justify-center shrink-0 border border-teal-500/20`}
      >
        <FileSpreadsheet className={iconSizes[size]} />
      </div>
    );
  }

  if (category === 'text') {
    return (
      <div
        className={`${boxSizes[size]} bg-indigo-500/10 dark:bg-indigo-400/15 text-indigo-600 dark:text-indigo-400 flex items-center justify-center shrink-0 border border-indigo-500/20`}
      >
        <FileCode className={iconSizes[size]} />
      </div>
    );
  }

  return (
    <div
      className={`${boxSizes[size]} bg-slate-500/10 dark:bg-slate-400/15 text-slate-600 dark:text-slate-400 flex items-center justify-center shrink-0 border border-slate-500/20`}
    >
      <File className={iconSizes[size]} />
    </div>
  );
};
