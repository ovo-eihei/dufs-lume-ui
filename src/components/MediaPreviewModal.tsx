import React, { useEffect, useState, useMemo, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import {
  X,
  Download,
  Link2,
  Check,
  ExternalLink,
  Code,
  BookOpen,
  Loader2,
  AlertCircle,
  ChevronLeft,
  ChevronRight,
  ShieldAlert,
  HelpCircle,
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
import { AudioPlayerCard, AudioBridge } from './ModalsAndPanels';

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
  /** 可预览序列里的位置与总数：>1 时 ◀▶ 组**常驻**并显示「当前 / 总数」，到首末项只置灰不消失 */
  navCount?: number;
  onPrev?: () => void;
  onNext?: () => void;
  onClose: () => void;
  /** 全站唯一的音频引擎（App 根部那个 <audio>）的受控接口；弹窗不再自带播放器 */
  audio?: AudioBridge | null;
  /** 后台正在出声时置 true：弹窗里的视频不自动抢播 */
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
  navCount = 0,
  onPrev,
  onNext,
  onClose,
  audio = null,
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

  // 音频由全站唯一的 <audio> 播放，关闭弹窗不打断它 —— 原来的「收起为迷你播放器」
  // 和「关闭」因此是同一件事，不需要再区分。
  const handleCloseOrMinimize = () => {
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
  // 按住 Ctrl/⌘ 期间，「复制直链」按钮就地变成「新窗口打开」：提示与动作始终一致
  const [ctrlHeld, setCtrlHeld] = useState(false);
  useEffect(() => {
    const down = (e: KeyboardEvent) => {
      if (e.ctrlKey || e.metaKey) setCtrlHeld(true);
    };
    const up = (e: KeyboardEvent) => {
      if (!e.ctrlKey && !e.metaKey) setCtrlHeld(false);
    };
    const reset = () => setCtrlHeld(false);
    window.addEventListener('keydown', down);
    window.addEventListener('keyup', up);
    window.addEventListener('blur', reset);
    return () => {
      window.removeEventListener('keydown', down);
      window.removeEventListener('keyup', up);
      window.removeEventListener('blur', reset);
    };
  }, []);

  /**
   * 长按的第二动作 = 新窗口打开直链，**在按住期间就发起**（不等抬手）：手指按住不动很难
   * 精确卡时长，抬手才发生等于逼用户猜阈值。定时器里发起 window.open 在部分内核会被弹窗
   * 拦截器挡掉（返回 null），此时返回 false ⇒ 交给抬手后那次真手势里的 click 补做。
   */
  const openDirectLink = () => {
    if (isDemoMode) return false; // 演示模式的直链是 data: URI，顶层导航会被 Chrome 拦
    return window.open(activeUrl, '_blank', 'noopener') !== null;
  };

  const copyLongPress = useLongPressAction(openDirectLink);

  if (!rendered || !activeItem) return null;

  // 演示模式的直链是 data: URI，顶层导航会被 Chrome 拦 ⇒ 只在真实部署里给「打开」
  const showOpen = ctrlHeld && !isDemoMode;

  const handleCopy = (e?: React.MouseEvent) => {
    // 三个入口同一个动作：Ctrl/⌘ + 点击，或移动端长按（后者已在按住期间开好了窗口，
    // 抬手补发的这次 click 直接吞掉，不重复动作、也不去复制链接）。
    if (copyLongPress.takeIfFired()) return;
    if (!isDemoMode && (copyLongPress.takeIfLongPress() || e?.ctrlKey || e?.metaKey)) {
      window.open(activeUrl, '_blank', 'noopener');
      return;
    }
    onCopyLink(activeItem);
    setCopied(true);
    setTimeout(() => setCopied(false), 1800);
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
        {/* Top Header — 名字与元信息各自单行截断（全名走 hover / 长按气泡），所以顶栏高度与
            文件名长短无关。桌面一行；窄屏（<sm）是两列网格：左列一个放大到整块顶栏高度的图标
            （xl，跨两行垂直居中），右列上格 = 动作簇（右上角对齐），下格 = 文件名与大小/日期（左对齐）。 */}
        <div className="px-3 py-2.5 sm:px-5 sm:py-3 border-b border-slate-200 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-900/60 shrink-0">
          <div className="grid grid-cols-[auto_minmax(0,1fr)] items-center gap-x-2.5 gap-y-1 sm:flex sm:flex-nowrap sm:items-center sm:gap-x-3">
            {/* 图标：窄屏占满左列并跨两行垂直居中（xl ≈ 整块顶栏的高度），桌面维持 sm */}
            <span className="col-start-1 row-start-1 row-span-2 self-center sm:hidden">
              <FileIconBadge item={activeItem} size="xl" />
            </span>
            <span className="hidden sm:order-1 sm:block sm:shrink-0">
              <FileIconBadge item={activeItem} size="sm" />
            </span>

            {/* 身份 + **只在某些文件类型出现的控件**（渲染/源码切换）。
                宽度可变的组放这边，名字先截断吸收掉，动作簇因此恒定；
                窄屏它是网格的右下格（左对齐），桌面回到图标右侧占满剩余。 */}
            <div className="col-start-2 row-start-2 flex min-w-0 items-center gap-2 sm:order-2 sm:flex-1 sm:gap-2.5">
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

              {(category === 'markdown' || category === 'html') && (
                <div className="shrink-0 inline-flex p-0.5 rounded-xl bg-slate-200/70 dark:bg-slate-800">
                  <button
                    type="button"
                    onClick={() => setMdMode('rendered')}
                    title={category === 'html' ? t('preview.htmlRendered') : t('preview.markdownRendered')}
                    className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-medium active:scale-95 transition-all ${
                      mdMode === 'rendered'
                        ? 'bg-white dark:bg-slate-900 text-indigo-600 dark:text-indigo-400 shadow-sm'
                        : 'text-slate-600 dark:text-slate-400'
                    }`}
                  >
                    <BookOpen className="w-3.5 h-3.5" />
                    <span className="hidden lg:inline">
                      {category === 'html' ? t('preview.htmlRendered') : t('preview.markdownRendered')}
                    </span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setMdMode('source')}
                    title={category === 'html' ? t('preview.htmlSource') : t('preview.markdownSource')}
                    className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-medium active:scale-95 transition-all ${
                      mdMode === 'source'
                        ? 'bg-white dark:bg-slate-900 text-indigo-600 dark:text-indigo-400 shadow-sm'
                        : 'text-slate-600 dark:text-slate-400'
                    }`}
                  >
                    <Code className="w-3.5 h-3.5" />
                    <span className="hidden lg:inline">
                      {category === 'html' ? t('preview.htmlSource') : t('preview.markdownSource')}
                    </span>
                  </button>
                </div>
              )}
            </div>

            {/* 右：恒定动作簇。里面每一段的宽度都只跟**视口**有关、不跟文件类型或名字有关，
                ◀▶ 组在多条可预览时常驻（首末项只置灰），所以按上/下一项时它一格都不移动。 */}
            <div className="col-start-2 row-start-1 flex shrink-0 items-center justify-self-end gap-1 sm:order-3 sm:gap-1.5">
              <button
                type="button"
                onClick={(e) => handleCopy(e)}
                {...copyLongPress.handlers}
                title={t('preview.copyDirectLinkHint')}
                aria-label={showOpen ? t('preview.openDirectLink') : t('preview.copyDirectLink')}
                className={`inline-flex items-center justify-center gap-1.5 p-1.5 sm:p-2 sm:px-3 sm:py-1.5 rounded-xl text-xs font-medium active:scale-95 transition-all ${
                  showOpen
                    ? 'bg-indigo-500/15 text-indigo-600 dark:text-indigo-300 hover:bg-indigo-500/25'
                    : 'bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200'
                }`}
              >
                {showOpen ? (
                  <ExternalLink className="w-3.5 h-3.5" />
                ) : copied ? (
                  <Check className="w-3.5 h-3.5 text-emerald-500" />
                ) : (
                  <Link2 className="w-3.5 h-3.5" />
                )}
                {/* 标签槽位定宽：文案从「复制直链」变「新窗口打开」时不把自己撑宽 */}
                <span className="hidden md:inline w-[4.75rem] text-left">
                  {showOpen ? t('preview.openDirectLink') : t('preview.copyDirectLink')}
                </span>
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

              {navCount > 1 && (
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
            <AudioPlayerCard
              bridge={
                audio ?? {
                  trackName: activeItem.name,
                  isPlaying: false,
                  currentTime: 0,
                  duration: 0,
                  onTogglePlay: () => {},
                  onSeek: () => {},
                }
              }
            />
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
