import React, { useCallback, useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { AlertCircle, Maximize, RefreshCw, ZoomIn, ZoomOut } from 'lucide-react';

const MIN_ZOOM = 0.2;
const MAX_ZOOM = 12;
const STEP = 1.3;

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

interface ImageViewerProps {
  /** 已经拼好的绝对 URL 路径（由 joinItemPath / originBase 负责，这里不再拼路径） */
  src: string;
  alt: string;
}

/**
 * 最基本的图片查看器：以「适应窗口」为 1 倍，可放大缩小、放大后拖拽平移、一键回到 1:1 原始像素。
 *
 * 三条硬约束（都是这个仓库里踩过的坑）：
 * - 缩放与平移属于「这一张图」的状态 ⇒ `src` 一变就复位，别把上一张的视角带过来；
 * - 工具条上的按钮**一律常驻**，不可用时只置灰（`disabled`），不做条件渲染 ⇒ 界面不跳；
 * - 百分比槽位定宽，数字从 `100%` 变到 `1200%` 不撑宽自己。
 *
 * 有意没做：旋转、裁剪、双指捏合缩放（移动端交给浏览器原生 pinch，见下面 touch-action 的注释）、EXIF 面板。
 */
export const ImageViewer: React.FC<ImageViewerProps> = ({ src, alt }) => {
  const { t } = useTranslation();
  const frameRef = useRef<HTMLDivElement>(null);
  const imgRef = useRef<HTMLImageElement>(null);
  const zoomRef = useRef(1);
  const dragRef = useRef<{ id: number; fromX: number; fromY: number; baseX: number; baseY: number } | null>(null);

  const [zoom, setZoom] = useState(1);
  const [offset, setOffset] = useState({ x: 0, y: 0 });
  const [natural, setNatural] = useState<{ w: number; h: number } | null>(null);
  const [status, setStatus] = useState<'loading' | 'ok' | 'error'>('loading');
  const [attempt, setAttempt] = useState(0);
  const [dragging, setDragging] = useState(false);

  zoomRef.current = zoom;

  // 换图 = 新的一张，视角与状态全部归零
  useEffect(() => {
    setZoom(1);
    setOffset({ x: 0, y: 0 });
    setNatural(null);
    setStatus('loading');
  }, [src]);

  /**
   * 1 倍（适应窗口）时图片占的盒子。
   * ⚠ 读的是 `clientWidth`：布局盒**不受自身 transform 影响**，所以缩放中量到的仍是 1 倍尺寸。
   */
  const fitBox = () => {
    const el = imgRef.current;
    const frame = frameRef.current;
    if (!el || !frame) return null;
    return { w: el.clientWidth, h: el.clientHeight, frameW: frame.clientWidth, frameH: frame.clientHeight };
  };

  /** 平移上限：图片放大后的半边超出盒子的部分，超出去就把图拖丢了 */
  const clampOffset = useCallback((x: number, y: number, z: number) => {
    const box = fitBox();
    if (!box) return { x: 0, y: 0 };
    return {
      x: clamp(x, -(box.w * z - box.frameW) / 2, (box.w * z - box.frameW) / 2),
      y: clamp(y, -(box.h * z - box.frameH) / 2, (box.h * z - box.frameH) / 2),
    };
  }, []);

  const applyZoom = useCallback(
    (next: number, resetOffset = false) => {
      const z = clamp(next, MIN_ZOOM, MAX_ZOOM);
      setZoom(z);
      setOffset((prev) => (resetOffset ? { x: 0, y: 0 } : clampOffset(prev.x, prev.y, z)));
    },
    [clampOffset]
  );

  /** 1:1 = 一个图片像素对一个 CSS 像素，与窗口大小无关 */
  const toActualSize = useCallback(() => {
    const box = fitBox();
    if (!box || !natural || !natural.w || !box.w) return;
    applyZoom(natural.w / box.w, true);
  }, [applyZoom, natural]);

  const toggleFit = useCallback(() => {
    if (Math.abs(zoomRef.current - 1) < 0.001) {
      toActualSize();
    } else {
      applyZoom(1, true);
    }
  }, [applyZoom, toActualSize]);

  // 滚轮缩放：必须用原生监听，React 的 onWheel 是被动监听，preventDefault 会被忽略
  useEffect(() => {
    const frame = frameRef.current;
    if (!frame) return;
    const onWheel = (e: WheelEvent) => {
      e.preventDefault(); // 图片区域没有别的东西可滚 ⇒ 滚轮归缩放，不把弹窗滚走
      applyZoom(zoomRef.current * (e.deltaY < 0 ? STEP : 1 / STEP));
    };
    frame.addEventListener('wheel', onWheel, { passive: false });
    return () => frame.removeEventListener('wheel', onWheel);
  }, [applyZoom]);

  // 键盘：+/- 缩放、0 适应、1 原始像素（与弹窗的 ←/→ 翻页、Esc 互不干涉）
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.ctrlKey || e.metaKey || e.altKey) return;
      const tag = (e.target as HTMLElement | null)?.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;
      if (e.key === '+' || e.key === '=') {
        e.preventDefault();
        applyZoom(zoomRef.current * STEP);
      } else if (e.key === '-' || e.key === '_') {
        e.preventDefault();
        applyZoom(zoomRef.current / STEP);
      } else if (e.key === '0') {
        e.preventDefault();
        applyZoom(1, true);
      } else if (e.key === '1') {
        e.preventDefault();
        toActualSize();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [applyZoom, toActualSize]);

  const onPointerDown = (e: React.PointerEvent<HTMLImageElement>) => {
    if (zoom <= 1 || status !== 'ok') return; // 没放大就没有可平移的
    e.currentTarget.setPointerCapture?.(e.pointerId);
    dragRef.current = { id: e.pointerId, fromX: e.clientX, fromY: e.clientY, baseX: offset.x, baseY: offset.y };
    setDragging(true);
  };

  const onPointerMove = (e: React.PointerEvent<HTMLImageElement>) => {
    const d = dragRef.current;
    if (!d || d.id !== e.pointerId) return;
    setOffset(clampOffset(d.baseX + (e.clientX - d.fromX), d.baseY + (e.clientY - d.fromY), zoom));
  };

  const endDrag = (e: React.PointerEvent<HTMLImageElement>) => {
    if (dragRef.current?.id === e.pointerId) {
      dragRef.current = null;
      setDragging(false);
    }
  };

  const toolButton =
    'inline-flex items-center justify-center p-1.5 rounded-lg text-white/85 hover:text-white hover:bg-white/10 ' +
    'active:scale-90 disabled:opacity-35 disabled:pointer-events-none transition-all';

  return (
    <div
      ref={frameRef}
      className="relative flex-1 min-h-0 flex items-center justify-center p-6 bg-slate-950/20 dark:bg-slate-950/50 overflow-hidden"
    >
      {status === 'loading' && (
        <div className="absolute inset-0 flex flex-col items-center justify-center text-slate-500">
          <ZoomIn className="w-6 h-6 mb-2 animate-pulse text-indigo-500" />
          <p className="text-sm">{t('imageViewer.loading')}</p>
        </div>
      )}

      {status === 'error' && (
        <div className="flex flex-col items-center justify-center py-20 text-rose-500">
          <AlertCircle className="w-8 h-8 mb-2" />
          <p className="text-sm font-medium">{t('imageViewer.failed')}</p>
          <p className="text-xs text-slate-400 mt-1 mb-4">{t('imageViewer.failedHint')}</p>
          <button
            type="button"
            onClick={() => {
              setStatus('loading');
              setAttempt((a) => a + 1);
            }}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold bg-indigo-600 hover:bg-indigo-500 text-white active:scale-95 transition-all"
          >
            <RefreshCw className="w-3.5 h-3.5" />
            {t('imageViewer.retry')}
          </button>
        </div>
      )}

      {status !== 'error' && (
        <img
          // attempt 变化 ⇒ 重挂一次元素去重新请求（失败响应浏览器不会留在缓存里）
          key={`${src}#${attempt}`}
          ref={imgRef}
          src={src}
          alt={alt}
          draggable={false}
          onLoad={(e) => {
            const el = e.currentTarget;
            setNatural({ w: el.naturalWidth, h: el.naturalHeight });
            setStatus('ok');
          }}
          onError={() => setStatus('error')}
          onDoubleClick={toggleFit}
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={endDrag}
          onPointerCancel={endDrag}
          className={`max-w-full max-h-full w-auto h-auto rounded-xl shadow-md object-contain select-none ${
            status === 'ok' ? 'animate-fadeIn' : ''
          } ${zoom > 1 ? (dragging ? 'cursor-grabbing' : 'cursor-grab') : 'cursor-zoom-in'}`}
          style={{
            transform: `translate3d(${offset.x}px, ${offset.y}px, 0) scale(${zoom})`,
            // 单指留给我们的拖拽，双指仍走浏览器原生 pinch（本项目不做捏合缩放）
            touchAction: zoom > 1 ? 'none' : 'pinch-zoom',
          }}
        />
      )}

      {status === 'ok' && (
        <div className="absolute bottom-3 left-1/2 -translate-x-1/2 flex items-center gap-0.5 px-1 py-1 rounded-xl bg-slate-900/70 dark:bg-black/60 backdrop-blur-md border border-white/10 shadow-lg">
          <button
            type="button"
            onClick={() => applyZoom(zoom / STEP)}
            disabled={zoom <= MIN_ZOOM}
            title={t('imageViewer.zoomOut')}
            aria-label={t('imageViewer.zoomOut')}
            className={toolButton}
          >
            <ZoomOut className="w-4 h-4" />
          </button>
          {/* 定宽槽位：100% → 1200% 不会把工具条撑得左右跳 */}
          <span className="w-[3.75rem] text-center text-[11px] font-mono tabular-nums text-white/80">
            {Math.round(zoom * 100)}%
          </span>
          <button
            type="button"
            onClick={() => applyZoom(zoom * STEP)}
            disabled={zoom >= MAX_ZOOM}
            title={t('imageViewer.zoomIn')}
            aria-label={t('imageViewer.zoomIn')}
            className={toolButton}
          >
            <ZoomIn className="w-4 h-4" />
          </button>
          <button
            type="button"
            onClick={() => applyZoom(1, true)}
            disabled={zoom === 1 && offset.x === 0 && offset.y === 0}
            title={t('imageViewer.fit')}
            aria-label={t('imageViewer.fit')}
            className={toolButton}
          >
            <Maximize className="w-4 h-4" />
          </button>
          <button
            type="button"
            onClick={toActualSize}
            disabled={!natural || !natural.w}
            title={t('imageViewer.actual')}
            aria-label={t('imageViewer.actual')}
            className={`${toolButton} px-2 text-[11px] font-semibold`}
          >
            1:1
          </button>
        </div>
      )}
    </div>
  );
};
