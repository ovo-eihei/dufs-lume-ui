import React, { useEffect, useState, useMemo } from 'react';
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
import { createDemoSvgDataUri } from '../utils/demoAssets';

/**
 * 沙箱提示条（D2）：正式解释放在「?」里 —— 桌面悬停显示，移动端点击显示/隐藏，
 * 两种输入都能读到全文，同时提示条本身保持一行高度不吃掉预览空间。
 */
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
        className="inline-flex items-center justify-center w-5 h-5 rounded-full border border-amber-500/40 hover:bg-amber-500/15 shrink-0 cursor-pointer"
      >
        <HelpCircle className="w-3.5 h-3.5" />
      </button>

      <button
        type="button"
        onClick={onDisable}
        className="ml-auto shrink-0 px-2.5 py-1 rounded-lg font-semibold bg-amber-500/15 hover:bg-amber-500/25 border border-amber-500/30 transition-colors cursor-pointer"
      >
        {t('sandbox.disableBtn')}
      </button>

      {detailOpen && (
        <div
          className="absolute left-2 right-2 top-[calc(100%+6px)] z-10 rounded-xl border border-amber-500/30 bg-white dark:bg-slate-900 shadow-xl p-3 leading-relaxed text-slate-700 dark:text-slate-200"
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
  /** HTML 预览是否在沙箱内渲染（缺省 true）。关掉沙箱的路径只有一条：`onRequestDisableSandbox` */
  htmlSandbox?: boolean;
  /** 打开「关闭沙箱」二次确认弹窗（与设置面板共用同一个函数） */
  onRequestDisableSandbox?: () => void;
  hasPrev?: boolean;
  hasNext?: boolean;
  onPrev?: () => void;
  onNext?: () => void;
  onClose: () => void;
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
    <div className="w-full h-full flex-1 overflow-auto p-4 sm:p-6 bg-slate-50/50 dark:bg-slate-950/70 custom-scroll">
      <table className="w-full border-collapse font-mono text-xs leading-6">
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

function createDemoWavDataUri(): string {
  const sampleRate = 22050;
  const durationSeconds = 3;
  const numSamples = sampleRate * durationSeconds;
  const buffer = new ArrayBuffer(44 + numSamples * 2);
  const view = new DataView(buffer);

  const writeString = (offset: number, str: string) => {
    for (let i = 0; i < str.length; i++) {
      view.setUint8(offset + i, str.charCodeAt(i));
    }
  };

  writeString(0, 'RIFF');
  view.setUint32(4, 36 + numSamples * 2, true);
  writeString(8, 'WAVE');
  writeString(12, 'fmt ');
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, 1, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * 2, true);
  view.setUint16(32, 2, true);
  view.setUint16(34, 16, true);
  writeString(36, 'data');
  view.setUint32(40, numSamples * 2, true);

  for (let i = 0; i < numSamples; i++) {
    const t = i / sampleRate;
    const envelope = Math.exp(-t * 0.9) * Math.min(1, t * 15);
    const wave =
      Math.sin(2 * Math.PI * 440 * t) * 0.5 +
      Math.sin(2 * Math.PI * 554.37 * t) * 0.3 +
      Math.sin(2 * Math.PI * 659.25 * t) * 0.2;
    const sample = Math.max(-1, Math.min(1, wave * envelope * 0.5));
    view.setInt16(44 + i * 2, sample * 32767, true);
  }

  const bytes = new Uint8Array(buffer);
  let binary = '';
  for (let i = 0; i < bytes.byteLength; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return `data:audio/wav;base64,${btoa(binary)}`;
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
  onCopyLink,
  onDownload,
}) => {
  const { t, i18n } = useTranslation();
  const [textContent, setTextContent] = useState<string>('');
  const [loading, setLoading] = useState<boolean>(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [mdMode, setMdMode] = useState<'rendered' | 'source'>('rendered');
  const [copied, setCopied] = useState(false);

  // 支持 ESC 关闭、左右方向键 ← / → 切换上一个/下一个可预览文件
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose();
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
  }, [onClose, hasPrev, hasNext, onPrev, onNext]);

  useEffect(() => {
    if (!item) return;
    const category = getPreviewCategory(item.name);
    setLoadError(null);
    setMdMode('rendered');

    if (category === 'markdown' || category === 'text' || category === 'html') {
      if (item.demoContent !== undefined) {
        setTextContent(item.demoContent);
        setLoading(false);
        return;
      }

      // HTML 文本一律抓：源码视图要用；沙箱渲染更是只能靠 srcdoc。
      // 未开沙箱时抓失败不算错（<iframe src> 仍能工作），开了沙箱就抓不到内容就没东西可渲染。
      setLoading(category !== 'html' || htmlSandbox);
      fetch(fileUrl, { credentials: 'same-origin' })
        .then((res) => {
          if (!res.ok) throw new Error(`HTTP ${res.status}`);
          return res.text();
        })
        .then((txt) => {
          setTextContent(txt);
          setLoading(false);
        })
        .catch((err) => {
          if (category !== 'html' || htmlSandbox) {
            setLoadError(err instanceof Error ? err.message : String(err));
          }
          setLoading(false);
        });
    }
  }, [item, fileUrl, htmlSandbox]);

  if (!item) return null;

  const category = getPreviewCategory(item.name);

  const handleCopy = () => {
    onCopyLink(item);
    setCopied(true);
    setTimeout(() => setCopied(false), 1800);
  };

  const resolvedMediaSrc =
    item.demoMediaUrl ||
    (isDemoMode && category === 'image'
      ? createDemoSvgDataUri(item.name)
      : isDemoMode && category === 'audio'
      ? createDemoWavDataUri()
      : fileUrl);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-2 sm:p-6 bg-slate-950/75 backdrop-blur-md animate-fadeIn"
      onClick={onClose}
    >
      <div
        className="relative w-full max-w-5xl max-h-[92vh] sm:max-h-[90vh] flex flex-col rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-2xl overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Top Header */}
        <div className="flex items-center justify-between gap-2 sm:gap-3 px-3 sm:px-5 py-2.5 sm:py-3.5 border-b border-slate-200 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-900/60 shrink-0">
          <div className="flex items-center gap-2 sm:gap-3 min-w-0 flex-1">
            <FileIconBadge item={item} size="sm" />
            <div className="min-w-0">
              <h3 className="font-semibold text-sm sm:text-base text-slate-900 dark:text-white truncate">
                {item.name}
              </h3>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                {formatBytes(item.size)} · {formatDateTime(item.mtime, i18n.language)}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-1 sm:gap-1.5 shrink-0">
            {/* 上一个 / 下一个切换按钮组 (支持键盘 ← / →) */}
            {(hasPrev || hasNext) && (
              <div className="inline-flex items-center p-0.5 rounded-xl bg-slate-100 dark:bg-slate-800 border border-slate-200/60 dark:border-slate-700/60 mr-0.5">
                <button
                  type="button"
                  disabled={!hasPrev}
                  onClick={onPrev}
                  title={t('preview.prevFile')}
                  aria-label={t('preview.prevFile')}
                  className="p-1.5 rounded-lg text-slate-600 dark:text-slate-300 hover:bg-white dark:hover:bg-slate-900 disabled:opacity-35 disabled:pointer-events-none transition-all"
                >
                  <ChevronLeft className="w-4 h-4" />
                </button>
                <button
                  type="button"
                  disabled={!hasNext}
                  onClick={onNext}
                  title={t('preview.nextFile')}
                  aria-label={t('preview.nextFile')}
                  className="p-1.5 rounded-lg text-slate-600 dark:text-slate-300 hover:bg-white dark:hover:bg-slate-900 disabled:opacity-35 disabled:pointer-events-none transition-all"
                >
                  <ChevronRight className="w-4 h-4" />
                </button>
              </div>
            )}

            {(category === 'markdown' || category === 'html') && (
              <div className="inline-flex p-0.5 rounded-xl bg-slate-200/70 dark:bg-slate-800 mr-1">
                <button
                  type="button"
                  onClick={() => setMdMode('rendered')}
                  className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-medium transition-colors ${
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
                  className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-medium transition-colors ${
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

            <button
              type="button"
              onClick={handleCopy}
              title={t('preview.copyDirectLink')}
              className="inline-flex items-center justify-center gap-1.5 p-2 sm:px-3 sm:py-1.5 rounded-xl text-xs font-medium bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 transition-colors"
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
              onClick={() => onDownload(item)}
              title={t('preview.downloadRaw')}
              className="inline-flex items-center justify-center gap-1.5 p-2 sm:px-3 sm:py-1.5 rounded-xl text-xs font-medium bg-indigo-600 hover:bg-indigo-500 text-white transition-colors"
            >
              <Download className="w-3.5 h-3.5" />
              <span className="hidden md:inline">{t('preview.downloadRaw')}</span>
            </button>

            {!isDemoMode && (
              <a
                href={fileUrl}
                target="_blank"
                rel="noopener noreferrer"
                title={t('preview.openInNewTab')}
                className="p-2 rounded-xl text-slate-500 hover:text-slate-800 dark:text-slate-400 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800"
              >
                <ExternalLink className="w-4 h-4" />
              </a>
            )}

            <button
              type="button"
              onClick={onClose}
              title={t('preview.close')}
              className="p-2 rounded-xl text-slate-500 hover:text-slate-900 dark:text-slate-400 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-slate-800"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* 弹窗主体内容 */}
        <div className="flex-1 overflow-y-auto min-h-[320px] flex flex-col bg-white dark:bg-slate-900">
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
            <div className="flex-1 flex items-center justify-center p-6 bg-slate-950/20 dark:bg-slate-950/50">
              <img
                src={resolvedMediaSrc}
                alt={item.name}
                className="max-w-full max-h-[72vh] h-auto rounded-xl shadow-md object-contain"
              />
            </div>
          ) : category === 'video' ? (
            <div className="flex-1 flex items-center justify-center bg-black">
              <video
                src={resolvedMediaSrc}
                controls
                autoPlay
                className="max-w-full max-h-[75vh] w-full"
              />
            </div>
          ) : category === 'audio' ? (
            <div className="flex-1 flex flex-col items-center justify-center py-16 px-6 bg-slate-50/50 dark:bg-slate-950/50">
              <div className="w-20 h-20 rounded-3xl bg-gradient-to-tr from-pink-500 to-indigo-500 flex items-center justify-center text-white shadow-lg mb-6">
                <FileIconBadge item={item} size="lg" />
              </div>
              <p className="font-semibold text-base text-slate-900 dark:text-white mb-4">
                {item.name}
              </p>
              <audio src={resolvedMediaSrc} controls autoPlay className="w-full max-w-md" />
            </div>
          ) : category === 'pdf' ? (
            <div className="flex-1 min-h-[70vh] bg-white dark:bg-slate-900">
              {isDemoMode ? (
                <div className="h-[65vh] flex flex-col items-center justify-center p-8 text-center bg-slate-50/50 dark:bg-slate-950/50">
                  <FileIconBadge item={item} size="lg" />
                  <h4 className="text-base font-semibold text-slate-900 dark:text-white mt-4">
                    {item.name}
                  </h4>
                  <p className="text-xs sm:text-sm text-slate-500 dark:text-slate-400 max-w-md mt-2">
                    在真实 Dufs 环境下，此处通过内置 PDF 视图直接流式加载{' '}
                    <code className="px-1.5 py-0.5 rounded bg-slate-100 dark:bg-slate-800 font-mono">
                      {fileUrl}
                    </code>
                    。
                  </p>
                </div>
              ) : (
                <iframe src={fileUrl} title={item.name} className="w-full h-[75vh] border-0" />
              )}
            </div>
          ) : category === 'markdown' ? (
            mdMode === 'rendered' ? (
              <div className="p-6 sm:p-8 bg-white dark:bg-slate-900">
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
              <div className="flex-1 flex flex-col bg-white dark:bg-slate-900">
                {htmlSandbox ? (
                  <>
                    {/*
                      受限预览：srcdoc + sandbox="allow-scripts"（**不含** allow-same-origin）
                      ⇒ 页面 JS 在 opaque origin 上执行，拿不到本站登录态，也 fetch 不到同目录资源；
                      相对路径的 CSS/图片/脚本照常加载（那些请求由浏览器发出，不受同源策略限制）。
                      要浏览"依赖同目录 fetch 的完整静态站"，用户需显式关闭沙箱（走二次确认）。
                    */}
                    <SandboxHintBar onDisable={onRequestDisableSandbox ?? (() => {})} />
                    {textContent || item.demoContent ? (
                      <iframe
                        title={item.name}
                        srcDoc={textContent || item.demoContent || ''}
                        sandbox="allow-scripts"
                        className="w-full flex-1 min-h-[72vh] border-0 bg-white"
                      />
                    ) : (
                      <div className="flex-1 flex flex-col items-center justify-center py-20 text-slate-500">
                        <Loader2 className="w-7 h-7 animate-spin text-indigo-500 mb-3" />
                        <p className="text-sm">{t('preview.loading')}</p>
                      </div>
                    )}
                  </>
                ) : (
                  /*
                    用户已显式关闭沙箱：原生无限制 <iframe>，直接内嵌浏览静态网站，
                    完整执行 JavaScript 并加载同目录相对资源（知情同意，非访问控制）。
                  */
                  <iframe
                    title={item.name}
                    src={isDemoMode ? undefined : fileUrl}
                    srcDoc={isDemoMode ? textContent || item.demoContent || '' : undefined}
                    className="w-full flex-1 min-h-[72vh] border-0 bg-white"
                  />
                )}
              </div>
            ) : (
              <SyntaxHighlightedCode code={textContent || item.demoContent || ''} />
            )
          ) : category === 'text' ? (
            <SyntaxHighlightedCode code={textContent} />
          ) : (
            <div className="flex-1 flex flex-col items-center justify-center py-16 text-center bg-slate-50/50 dark:bg-slate-950/50">
              <FileIconBadge item={item} size="lg" />
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
