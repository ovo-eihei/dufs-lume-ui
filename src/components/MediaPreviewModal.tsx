import React, { useEffect, useState, useMemo, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import {
  X,
  Download,
  Link2,
  Check,
  Code,
  BookOpen,
  Loader2,
  AlertCircle,
  ChevronLeft,
  ChevronRight,
  ShieldAlert,
  HelpCircle,
  Minimize2,
} from 'lucide-react';
import { DufsPathItem } from '../types/dufs';
import {
  formatBytes,
  formatDateTime,
  getPreviewCategory,
} from '../utils/format';
import { FileIconBadge } from './FileIconBadge';
import NameText from './NameText';
import { createDemoSvgDataUri, createDemoWavDataUri } from '../utils/demoAssets';
import { useModalTransition } from '../utils/useModalTransition';
import { useLongPressAction } from '../utils/useLongPressAction';

const SandboxHintBar: React.FC<{ onDisable: () => void }> = ({ onDisable }) => {
  const { t } = useTranslation();
  const [detailOpen, setDetailOpen] = useState(false);

  return (
    <div className="relative flex flex-wrap items-center gap-x-2 gap-y-1.5 px-3 sm:px-4 py-2 bg-amber-50/90 dark:bg-amber-500/10 border-b border-amber-500/25 text-[11px] sm:text-xs text-amber-800 dark:text-amber-200 shrink-0">
      <ShieldAlert className="w-3.5 h-3.5 shrink-0" />
      <span className="font-semibold">{t('sandbox.bannerTitle')}</span>

      <button
        type="button"
        aria-label={t('sandbox.bannerWhy')}
        aria-expanded={detailOpen}
        onMouseEnter={() => setDetailOpen(true)}
        onMouseLeave={() => setDetailOpen(false)}
        onFocus={() => setDetailOpen(true)}
        onBlur={() => setDetailOpen(false)}
        onClick={() => setDetailOpen((v) => !v)}
        className="inline-flex items-center justify-center w-5 h-5 rounded-full border border-amber-500/40 hover:bg-amber-500/15 shrink-0 cursor-pointer active:scale-90 transition-transform"
      >
        <HelpCircle className="w-3.5 h-3.5" />
      </button>

      <button
        type="button"
        onClick={onDisable}
        className="ml-auto shrink-0 px-2.5 py-1 rounded-lg font-semibold bg-amber-500/15 hover:bg-amber-500/25 border border-amber-500/30 active:scale-95 transition-all cursor-pointer"
      >
        {t('sandbox.disableBtn')}
      </button>

      {detailOpen && (
        <div
          className="absolute left-2 right-2 top-[calc(100%+6px)] z-10 rounded-xl border border-amber-500/30 bg-white dark:bg-slate-900 shadow-xl p-3 leading-relaxed text-slate-700 dark:text-slate-200 animate-fadeIn"
          onMouseLeave={() => setDetailOpen(false)}
        >
          {t('sandbox.bannerDetail')}
        </div>
      )}
    </div>
  );
};

interface MediaPreviewModalProps {
  item: DufsPathItem | null;
  fileUrl: string;
  isDemoMode: boolean;
  htmlSandbox?: boolean;
  onRequestDisableSandbox?: () => void;
  hasPrev?: boolean;
  hasNext?: boolean;
  onPrev?: () => void;
  onNext?: () => void;
  onClose: () => void;
  onMinimizeAudio?: (item: DufsPathItem, audioUrl: string, currentTime?: number) => void;
  /** 后台迷你播放器正在出声时置 true：弹窗里的音/视频不自动抢播 */
  blockAutoPlay?: boolean;
  /** 弹窗里的媒体真的开始播了（用来反向暂停迷你播放器，保证全局只有一个声音） */
  onMediaPlay?: () => void;
  onCopyLink: (item: DufsPathItem) => void;
  onDownload: (item: DufsPathItem) => void;
}

type TokenType =
  | 'plain'
  | 'comment'
  | 'string'
  | 'number'
  | 'keyword'
  | 'property'
  | 'directive'
  | 'heading'
  | 'punctuation';

interface SyntaxToken {
  type: TokenType;
  value: string;
}

const TOKEN_COLOR_CLASSES: Record<TokenType, string> = {
  plain: 'text-slate-800 dark:text-slate-200',
  comment: 'text-slate-400 dark:text-slate-500 italic',
  string: 'text-emerald-600 dark:text-emerald-400',
  number: 'text-amber-600 dark:text-amber-400',
  keyword: 'text-indigo-600 dark:text-indigo-400 font-semibold',
  property: 'text-sky-600 dark:text-sky-400',
  directive: 'text-purple-600 dark:text-purple-400 font-semibold',
  heading: 'text-rose-600 dark:text-rose-400 font-bold',
  punctuation: 'text-slate-500 dark:text-slate-400',
};

const CODE_KEYWORDS = new Set([
  'import', 'export', 'from', 'default', 'function', 'return', 'const', 'let', 'var',
  'if', 'else', 'for', 'while', 'do', 'switch', 'case', 'break', 'continue', 'new',
  'try', 'catch', 'finally', 'throw', 'async', 'await', 'class', 'extends', 'interface',
  'type', 'enum', 'implements', 'public', 'private', 'protected', 'readonly', 'static',
  'true', 'false', 'null', 'undefined', 'void', 'typeof', 'instanceof', 'in', 'of',
  'fn', 'pub', 'mod', 'use', 'struct', 'impl', 'trait', 'where', 'match', 'mut', 'ref',
  'def', 'elif', 'lambda', 'pass', 'with', 'yield', 'global', 'nonlocal', 'assert',
  'package', 'func', 'defer', 'go', 'select', 'chan', 'map',
  'services', 'volumes', 'environment', 'ports', 'image', 'container_name', 'restart',
  'command', 'depends_on', 'handle', 'reverse_proxy', 'forward_auth', 'encode', 'uri',
  'copy_headers', 'method',
]);

const MASTER_TOKEN_REGEX =
  /(#.*$|\/\/.*$|<!--[\s\S]*?-->)|("(?:\\.|[^"\\])*"|'(?:\\.|[^'\\])*'|`(?:\\.|[^`\\])*`)|^\s*(#{1,6}\s+.*)$|(@[a-zA-Z0-9_-]+|\$[a-zA-Z0-9_{}-]+)|(\b[a-zA-Z_][a-zA-Z0-9_-]*\b)(?=\s*[:=])|\b(\d+(?:\.\d+)?(?:px|rem|em|ms|s|%|vh|vw|b|kb|mb|gb)?)\b|\b([a-zA-Z_][a-zA-Z0-9_]*)\b|([{}()[\].,:;+-/*=<>!&|?~]+)/gm;

function tokenizeLine(line: string): SyntaxToken[] {
  if (!line) return [{ type: 'plain', value: '' }];

  const tokens: SyntaxToken[] = [];
  let lastIndex = 0;
  MASTER_TOKEN_REGEX.lastIndex = 0;

  let match: RegExpExecArray | null;
  while ((match = MASTER_TOKEN_REGEX.exec(line)) !== null) {
    if (match.index > lastIndex) {
      tokens.push({
        type: 'plain',
        value: line.slice(lastIndex, match.index),
      });
    }

    const [
      fullMatch,
      commentGrp,
      stringGrp,
      headingGrp,
      directiveGrp,
      propertyGrp,
      numberGrp,
      wordGrp,
      punctGrp,
    ] = match;

    if (commentGrp !== undefined) {
      tokens.push({ type: 'comment', value: fullMatch });
    } else if (stringGrp !== undefined) {
      tokens.push({ type: 'string', value: fullMatch });
    } else if (headingGrp !== undefined) {
      tokens.push({ type: 'heading', value: fullMatch });
    } else if (directiveGrp !== undefined) {
      tokens.push({ type: 'directive', value: fullMatch });
    } else if (propertyGrp !== undefined) {
      tokens.push({ type: 'property', value: fullMatch });
    } else if (numberGrp !== undefined) {
      tokens.push({ type: 'number', value: fullMatch });
    } else if (wordGrp !== undefined) {
      if (CODE_KEYWORDS.has(wordGrp)) {
        tokens.push({ type: 'keyword', value: fullMatch });
      } else if (/^[A-Z][A-Za-z0-9_]*$/.test(wordGrp)) {
        tokens.push({ type: 'directive', value: fullMatch });
      } else {
        tokens.push({ type: 'plain', value: fullMatch });
      }
    } else if (punctGrp !== undefined) {
      tokens.push({ type: 'punctuation', value: fullMatch });
    } else {
      tokens.push({ type: 'plain', value: fullMatch });
    }

    lastIndex = MASTER_TOKEN_REGEX.lastIndex;
  }

  if (lastIndex < line.length) {
    tokens.push({
      type: 'plain',
      value: line.slice(lastIndex),
    });
  }

  return tokens;
}

const SyntaxHighlightedCode: React.FC<{ code: string }> = ({ code }) => {
  const lines = useMemo(() => {
    const rawLines = code.replace(/\r\n/g, '\n').split('\n');
    return rawLines.map((line) => tokenizeLine(line));
  }, [code]);

  return (
    <div className="w-full flex-1 min-h-0 overflow-auto p-4 sm:p-6 bg-slate-50/50 dark:bg-slate-950/70 custom-scroll">
      <table className="w-full border-collapse font-mono text-xs leading-[1.25]">
        <tbody>
          {lines.map((lineTokens, idx) => (
            <tr
              key={idx}
              className="hover:bg-slate-200/40 dark:hover:bg-slate-800/40 transition-colors"
            >
              <td className="select-none pr-5 text-right text-slate-400 dark:text-slate-600 w-10 align-top">
                {idx + 1}
              </td>
              <td className="whitespace-pre pr-4">
                {lineTokens.map((tok, tIdx) => (
                  <span key={tIdx} className={TOKEN_COLOR_CLASSES[tok.type]}>
                    {tok.value}
                  </span>
                ))}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
};

function renderSimpleMarkdown(md: string): string {
  const escaped = md
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');

  const withCodeBlocks = escaped.replace(
    /```([a-zA-Z0-9_-]*)\n([\s\S]*?)```/g,
    (_match, lang, code) =>
      `<pre class="my-4 p-4 rounded-xl bg-slate-100 dark:bg-slate-950 text-slate-800 dark:text-slate-100 font-mono text-xs overflow-x-auto border border-slate-200 dark:border-slate-800"><div class="text-[10px] uppercase tracking-wider text-indigo-600 dark:text-indigo-400 font-semibold mb-1.5">${
        lang || 'code'
      }</div><code>${code.trim()}</code></pre>`
  );

  const lines = withCodeBlocks.split('\n');
  const htmlLines: string[] = [];
  let inList = false;

  for (const rawLine of lines) {
    const line = rawLine.trimEnd();
    if (line.startsWith('<pre ')) {
      if (inList) {
        htmlLines.push('</ul>');
        inList = false;
      }
      htmlLines.push(line);
      continue;
    }

    if (/^###\s+(.*)/.test(line)) {
      if (inList) {
        htmlLines.push('</ul>');
        inList = false;
      }
      htmlLines.push(
        `<h3 class="text-base font-bold text-slate-900 dark:text-white mt-5 mb-2">${RegExp.$1}</h3>`
      );
    } else if (/^##\s+(.*)/.test(line)) {
      if (inList) {
        htmlLines.push('</ul>');
        inList = false;
      }
      htmlLines.push(
        `<h2 class="text-lg font-bold text-slate-900 dark:text-white mt-6 mb-2.5 pb-1.5 border-b border-slate-200 dark:border-slate-800">${RegExp.$1}</h2>`
      );
    } else if (/^#\s+(.*)/.test(line)) {
      if (inList) {
        htmlLines.push('</ul>');
        inList = false;
      }
      htmlLines.push(
        `<h1 class="text-xl font-extrabold text-slate-900 dark:text-white mt-2 mb-3">${RegExp.$1}</h1>`
      );
    } else if (/^[-*]\s+(.*)/.test(line)) {
      if (!inList) {
        htmlLines.push('<ul class="list-disc pl-5 space-y-1.5 my-2.5 text-sm">');
        inList = true;
      }
      htmlLines.push(`<li>${formatInlineMarkdown(RegExp.$1)}</li>`);
    } else if (/^\d+\.\s+(.*)/.test(line)) {
      if (!inList) {
        htmlLines.push('<ul class="list-decimal pl-5 space-y-1.5 my-2.5 text-sm">');
        inList = true;
      }
      htmlLines.push(`<li>${formatInlineMarkdown(RegExp.$1)}</li>`);
    } else if (line.trim() === '') {
      if (inList) {
        htmlLines.push('</ul>');
        inList = false;
      }
      htmlLines.push('<div class="h-2"></div>');
    } else {
      htmlLines.push(
        `<p class="text-sm leading-relaxed my-1.5">${formatInlineMarkdown(line)}</p>`
      );
    }
  }

  if (inList) {
    htmlLines.push('</ul>');
  }

  return htmlLines.join('\n');
}

function formatInlineMarkdown(text: string): string {
  return text
    .replace(
      /`([^`]+)`/g,
      '<code class="px-1.5 py-0.5 rounded-md bg-slate-100 dark:bg-slate-800 text-indigo-600 dark:text-indigo-400 font-mono text-xs">$1</code>'
    )
    .replace(
      /\*\*([^*]+)\*\*/g,
      '<strong class="font-semibold text-slate-900 dark:text-white">$1</strong>'
    )
    .replace(/\*([^*]+)\*/g, '<em class="italic">$1</em>')
    .replace(
      /\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)/g,
      '<a href="$2" target="_blank" rel="noopener noreferrer" class="text-indigo-600 dark:text-indigo-400 underline hover:opacity-80">$1</a>'
    );
}

export const MediaPreviewModal: React.FC<MediaPreviewModalProps> = ({
  item,
  fileUrl,
  isDemoMode,
  htmlSandbox = true,
  onRequestDisableSandbox,
  hasPrev = false,
  hasNext = false,
  onPrev,
  onNext,
  onClose,
  onMinimizeAudio,
  blockAutoPlay = false,
  onMediaPlay,
  onCopyLink,
  onDownload,
}) => {
  const { t, i18n } = useTranslation();
  const [textContent, setTextContent] = useState<string>('');
  const [loading, setLoading] = useState<boolean>(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [mdMode, setMdMode] = useState<'rendered' | 'source'>('rendered');
  const [copied, setCopied] = useState(false);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  const { rendered, isClosing } = useModalTransition(!!item, 160);
  const [cachedItem, setCachedItem] = useState<DufsPathItem | null>(item);
  const [cachedUrl, setCachedUrl] = useState<string>(fileUrl);

  useEffect(() => {
    if (item) {
      setCachedItem(item);
      setCachedUrl(fileUrl);
    }
  }, [item, fileUrl]);

  const activeItem = item || cachedItem;
  const activeUrl = item ? fileUrl : cachedUrl;
  const category = activeItem ? getPreviewCategory(activeItem.name) : 'unsupported';

  useEffect(() => {
    if (!activeItem) return;
    const cat = getPreviewCategory(activeItem.name);
    setLoadError(null);
    setMdMode('rendered');

    if (cat === 'markdown' || cat === 'text' || cat === 'html') {
      if (activeItem.demoContent !== undefined) {
        setTextContent(activeItem.demoContent);
        setLoading(false);
        return;
      }

      setLoading(cat !== 'html' || htmlSandbox);
      fetch(activeUrl, { credentials: 'same-origin' })
        .then((res) => {
          if (!res.ok) throw new Error(`HTTP ${res.status}`);
          return res.text();
        })
        .then((txt) => {
          setTextContent(txt);
          setLoading(false);
        })
        .catch((err) => {
          if (cat !== 'html' || htmlSandbox) {
            setLoadError(err instanceof Error ? err.message : String(err));
          }
          setLoading(false);
        });
    }
  }, [activeItem, activeUrl, htmlSandbox]);

  const resolvedMediaSrc = useMemo(() => {
    if (!activeItem) return '';
    return (
      activeItem.demoMediaUrl ||
      (isDemoMode && category === 'image'
        ? createDemoSvgDataUri(activeItem.name)
        : isDemoMode && category === 'audio'
        ? createDemoWavDataUri(activeItem.name)
        : activeUrl)
    );
  }, [activeItem, isDemoMode, category, activeUrl]);

  const handleCloseOrMinimize = () => {
    if (
      activeItem &&
      category === 'audio' &&
      onMinimizeAudio &&
      audioRef.current &&
      !audioRef.current.paused
    ) {
      onMinimizeAudio(activeItem, resolvedMediaSrc, audioRef.current.currentTime);
      return;
    }
    onClose();
  };

  useEffect(() => {
    if (!rendered || isClosing) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        handleCloseOrMinimize();
      } else if (e.key === 'ArrowLeft' && hasPrev && onPrev) {
        e.preventDefault();
        onPrev();
      } else if (e.key === 'ArrowRight' && hasNext && onNext) {
        e.preventDefault();
        onNext();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  });

  // 必须在 early return 之前：hook 不能条件调用
  const copyLongPress = useLongPressAction();

  if (!rendered || !activeItem) return null;

  const handleCopy = (e?: React.MouseEvent) => {
    // 三个入口同一个动作：Ctrl/⌘ + 点击，或移动端长按。长按的执行放在抬手后的 click 里，
    // 因为 window.open 必须在用户手势里发起，定时器里弹会被浏览器当成弹窗拦掉。
    if (!isDemoMode && (copyLongPress.takeIfLongPress() || e?.ctrlKey || e?.metaKey)) {
      window.open(activeUrl, '_blank', 'noopener');
      return;
    }
    onCopyLink(activeItem);
    setCopied(true);
    setTimeout(() => setCopied(false), 1800);
  };

  const handleMinimizeToAudioPlayer = () => {
    if (category === 'audio' && onMinimizeAudio) {
      const curTime = audioRef.current ? audioRef.current.currentTime : 0;
      onMinimizeAudio(activeItem, resolvedMediaSrc, curTime);
    }
  };

  return (
    <div
      className={`fixed inset-0 z-50 flex items-center justify-center p-2 sm:p-6 bg-slate-950/75 backdrop-blur-md ${
        isClosing ? 'animate-fadeOut' : 'animate-fadeIn'
      }`}
      onClick={handleCloseOrMinimize}
    >
      <div
        className={`relative w-full max-w-5xl h-[92dvh] max-h-[92vh] sm:h-[90dvh] sm:max-h-[90vh] flex flex-col rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-2xl overflow-hidden ${
          isClosing ? 'animate-modalOut' : 'animate-modalIn'
        }`}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Top Header — 单行不换行：宽度不够时**名字截断**（全名另有 hover / 长按气泡），
            动作簇永远留在同一行右侧，上/下一项不再随文件名长短跳位；
            关闭按钮是簇里最后一个，靠 flex items-center 对齐，不会再和其他按钮垂直错位。 */}
        <div className="px-3 py-2.5 sm:px-5 sm:py-3 border-b border-slate-200 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-900/60 shrink-0">
          <div className="flex items-center gap-x-3">
            {/* Title block: icon + name, size/mtime directly under the name */}
            <div className="flex min-w-0 flex-1 items-center gap-2 sm:gap-2.5">
              <FileIconBadge item={activeItem} size="sm" />
              <div className="min-w-0">
                <NameText
                  as="h3"
                  toggleOnTap
                  text={activeItem.name}
                  className="font-semibold text-sm sm:text-base text-slate-900 dark:text-white"
                />
                <p className="no-callout mt-0.5 truncate whitespace-nowrap select-none text-xs text-slate-500 dark:text-slate-400">
                  {formatBytes(activeItem.size)} · {formatDateTime(activeItem.mtime, i18n.language)}
                </p>
              </div>
            </div>

            {/* Actions: 永远不换行、永远靠右；✕ 在簇尾（也就是右上角） */}
            <div className="flex shrink-0 items-center gap-1 sm:gap-1.5">
              {(hasPrev || hasNext) && (
                <div className="inline-flex items-center p-0.5 rounded-xl bg-slate-100 dark:bg-slate-800 border border-slate-200/60 dark:border-slate-700/60">
                  <button
                    type="button"
                    disabled={!hasPrev}
                    onClick={onPrev}
                    title={t('preview.prevFile')}
                    aria-label={t('preview.prevFile')}
                    className="p-1.5 rounded-lg text-slate-600 dark:text-slate-300 hover:bg-white dark:hover:bg-slate-900 disabled:opacity-35 disabled:pointer-events-none active:scale-90 transition-all"
                  >
                    <ChevronLeft className="w-4 h-4" />
                  </button>
                  <button
                    type="button"
                    disabled={!hasNext}
                    onClick={onNext}
                    title={t('preview.nextFile')}
                    aria-label={t('preview.nextFile')}
                    className="p-1.5 rounded-lg text-slate-600 dark:text-slate-300 hover:bg-white dark:hover:bg-slate-900 disabled:opacity-35 disabled:pointer-events-none active:scale-90 transition-all"
                  >
                    <ChevronRight className="w-4 h-4" />
                  </button>
                </div>
              )}

              {(category === 'markdown' || category === 'html') && (
                <div className="inline-flex p-0.5 rounded-xl bg-slate-200/70 dark:bg-slate-800">
                  <button
                    type="button"
                    onClick={() => setMdMode('rendered')}
                    className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-medium active:scale-95 transition-all ${
                      mdMode === 'rendered'
                        ? 'bg-white dark:bg-slate-900 text-indigo-600 dark:text-indigo-400 shadow-sm'
                        : 'text-slate-600 dark:text-slate-400'
                    }`}
                  >
                    <BookOpen className="w-3.5 h-3.5" />
                    <span className="hidden sm:inline">
                      {category === 'html' ? t('preview.htmlRendered') : t('preview.markdownRendered')}
                    </span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setMdMode('source')}
                    className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-medium active:scale-95 transition-all ${
                      mdMode === 'source'
                        ? 'bg-white dark:bg-slate-900 text-indigo-600 dark:text-indigo-400 shadow-sm'
                        : 'text-slate-600 dark:text-slate-400'
                    }`}
                  >
                    <Code className="w-3.5 h-3.5" />
                    <span className="hidden sm:inline">
                      {category === 'html' ? t('preview.htmlSource') : t('preview.markdownSource')}
                    </span>
                  </button>
                </div>
              )}

              {category === 'audio' && onMinimizeAudio && (
                <button
                  type="button"
                  onClick={handleMinimizeToAudioPlayer}
                  title={t('preview.minimizeToPlayer')}
                  className="inline-flex items-center gap-1.5 p-2 sm:px-2.5 sm:py-1.5 rounded-xl text-xs font-medium bg-indigo-500/10 text-indigo-600 dark:text-indigo-400 border border-indigo-500/20 hover:bg-indigo-500/20 active:scale-95 transition-all"
                >
                  <Minimize2 className="w-3.5 h-3.5" />
                  <span className="hidden lg:inline">{t('preview.minimizeToPlayer')}</span>
                </button>
              )}

              <button
                type="button"
                onClick={(e) => handleCopy(e)}
                {...copyLongPress.handlers}
                title={t('preview.copyDirectLinkHint')}
                aria-label={t('preview.copyDirectLink')}
                className="inline-flex items-center justify-center gap-1.5 p-1.5 sm:p-2 sm:px-3 sm:py-1.5 rounded-xl text-xs font-medium bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 active:scale-95 transition-all"
              >
                {copied ? (
                  <Check className="w-3.5 h-3.5 text-emerald-500" />
                ) : (
                  <Link2 className="w-3.5 h-3.5" />
                )}
                <span className="hidden md:inline">{t('preview.copyDirectLink')}</span>
              </button>

              <button
                type="button"
                onClick={() => onDownload(activeItem)}
                title={t('preview.downloadRaw')}
                className="inline-flex items-center justify-center gap-1.5 p-1.5 sm:p-2 sm:px-3 sm:py-1.5 rounded-xl text-xs font-semibold bg-indigo-600 hover:bg-indigo-500 text-white shadow-sm active:scale-95 transition-all"
              >
                <Download className="w-3.5 h-3.5" />
                <span className="hidden md:inline">{t('preview.downloadRaw')}</span>
              </button>

              <button
                type="button"
                onClick={handleCloseOrMinimize}
                title={t('preview.close')}
                aria-label={t('preview.close')}
                className="p-2 rounded-xl text-slate-500 hover:text-slate-900 dark:text-slate-400 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-slate-800 active:scale-90 transition-all"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          </div>
        </div>

        {/* Modal Body */}
        <div className="flex-1 min-h-0 overflow-y-auto flex flex-col bg-white dark:bg-slate-900">
          {loading ? (
            <div className="flex-1 flex flex-col items-center justify-center py-20 text-slate-500">
              <Loader2 className="w-7 h-7 animate-spin text-indigo-500 mb-3" />
              <p className="text-sm">{t('preview.loading')}</p>
            </div>
          ) : loadError ? (
            <div className="flex-1 flex flex-col items-center justify-center py-20 text-rose-500">
              <AlertCircle className="w-8 h-8 mb-2" />
              <p className="text-sm font-medium">{t('preview.loadError')}</p>
              <p className="text-xs text-slate-400 mt-1">{loadError}</p>
            </div>
          ) : category === 'image' ? (
            <div className="flex-1 min-h-0 flex items-center justify-center p-6 bg-slate-950/20 dark:bg-slate-950/50">
              <img
                src={resolvedMediaSrc}
                alt={activeItem.name}
                className="max-w-full max-h-full h-auto rounded-xl shadow-md object-contain animate-fadeIn"
              />
            </div>
          ) : category === 'video' ? (
            <div className="flex-1 min-h-0 flex items-center justify-center bg-black">
              <video
                src={resolvedMediaSrc}
                controls
                autoPlay={!blockAutoPlay}
                onPlay={onMediaPlay}
                className="max-w-full max-h-full w-full"
              />
            </div>
          ) : category === 'audio' ? (
            <div className="flex-1 min-h-0 flex flex-col items-center justify-center py-14 px-6 bg-slate-50/50 dark:bg-slate-950/50">
              <div className="w-20 h-20 rounded-3xl bg-gradient-to-tr from-pink-500 to-indigo-500 flex items-center justify-center text-white shadow-lg mb-5 animate-pulse">
                <FileIconBadge item={activeItem} size="lg" />
              </div>
              <p className="font-semibold text-base text-slate-900 dark:text-white mb-4">
                {activeItem.name}
              </p>
              <audio
                ref={audioRef}
                src={resolvedMediaSrc}
                controls
                autoPlay={!blockAutoPlay}
                onPlay={onMediaPlay}
                className="w-full max-w-md"
              />
              {blockAutoPlay && (
                <p className="-mt-1 mb-4 text-[11px] text-slate-400 dark:text-slate-500">
                  {t('preview.autoPlayBlocked')}
                </p>
              )}
              {onMinimizeAudio && (
                <button
                  type="button"
                  onClick={handleMinimizeToAudioPlayer}
                  className="mt-5 inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-semibold bg-indigo-500/10 text-indigo-600 dark:text-indigo-400 border border-indigo-500/25 hover:bg-indigo-500/20 active:scale-95 transition-all"
                >
                  <Minimize2 className="w-3.5 h-3.5" />
                  <span>{t('preview.minimizeToPlayer')}</span>
                </button>
              )}
            </div>
          ) : category === 'pdf' ? (
            <div className="flex-1 min-h-0 flex flex-col bg-white dark:bg-slate-900">
              {isDemoMode ? (
                <div className="h-full flex flex-col items-center justify-center p-8 text-center bg-slate-50/50 dark:bg-slate-950/50">
                  <FileIconBadge item={activeItem} size="lg" />
                  <h4 className="text-base font-semibold text-slate-900 dark:text-white mt-4">
                    {activeItem.name}
                  </h4>
                  <p className="text-xs sm:text-sm text-slate-500 dark:text-slate-400 max-w-md mt-2">
                    在真实 Dufs 环境下，此处通过内置 PDF 视图直接流式加载{' '}
                    <code className="px-1.5 py-0.5 rounded bg-slate-100 dark:bg-slate-800 font-mono">
                      {activeUrl}
                    </code>
                    。
                  </p>
                </div>
              ) : (
                <iframe src={activeUrl} title={activeItem.name} className="w-full flex-1 min-h-0 border-0" />
              )}
            </div>
          ) : category === 'markdown' ? (
            mdMode === 'rendered' ? (
              <div className="p-6 sm:p-8 bg-white dark:bg-slate-900 animate-fadeIn">
                <div
                  className="prose prose-slate dark:prose-invert max-w-none text-slate-800 dark:text-slate-200"
                  dangerouslySetInnerHTML={{ __html: renderSimpleMarkdown(textContent) }}
                />
              </div>
            ) : (
              <SyntaxHighlightedCode code={textContent} />
            )
          ) : category === 'html' ? (
            mdMode === 'rendered' ? (
              <div className="flex-1 min-h-0 flex flex-col bg-white dark:bg-slate-900 animate-fadeIn">
                {htmlSandbox ? (
                  <>
                    <SandboxHintBar onDisable={onRequestDisableSandbox ?? (() => {})} />
                    {textContent || activeItem.demoContent ? (
                      <iframe
                        title={activeItem.name}
                        srcDoc={textContent || activeItem.demoContent || ''}
                        sandbox="allow-scripts"
                        className="w-full flex-1 min-h-0 border-0 bg-white"
                      />
                    ) : (
                      <div className="flex-1 flex flex-col items-center justify-center py-20 text-slate-500">
                        <Loader2 className="w-7 h-7 animate-spin text-indigo-500 mb-3" />
                        <p className="text-sm">{t('preview.loading')}</p>
                      </div>
                    )}
                  </>
                ) : (
                  <iframe
                    title={activeItem.name}
                    src={isDemoMode ? undefined : activeUrl}
                    srcDoc={isDemoMode ? textContent || activeItem.demoContent || '' : undefined}
                    className="w-full flex-1 min-h-0 border-0 bg-white"
                  />
                )}
              </div>
            ) : (
              <SyntaxHighlightedCode code={textContent || activeItem.demoContent || ''} />
            )
          ) : category === 'text' ? (
            <SyntaxHighlightedCode code={textContent} />
          ) : (
            <div className="flex-1 min-h-0 flex flex-col items-center justify-center py-16 text-center bg-slate-50/50 dark:bg-slate-950/50">
              <FileIconBadge item={activeItem} size="lg" />
              <p className="text-sm text-slate-600 dark:text-slate-400 mt-4 max-w-md">
                {t('preview.unsupported')}
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
