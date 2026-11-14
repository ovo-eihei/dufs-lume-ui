import React, { useCallback, useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { TransformComponent, TransformWrapper, type ReactZoomPanPinchRef } from 'react-zoom-pan-pinch';
import { AlertCircle, Expand, Maximize, Minimize, RefreshCw, ZoomIn, ZoomOut } from 'lucide-react';

/**
 * 缩放范围按**原始像素**算（他 11-15 定的口径）：10% ~ 800%，1:1 就是 100%。
 *
 * ⚠ 这个口径能直接成立，是因为图片在 `TransformComponent` 里按**原始尺寸**布局
 * （内容盒 = fit-content，不给 img 加 max-w-full），所以库的 scale 就是「一个图片像素
 * 对几个 CSS 像素」。别给 img 加 `max-w-full` —— 那样 scale 会变成「相对适应窗口」，
 * 百分比和 1:1 就全错位了。
 */
const MIN_SCALE = 0.1;
const MAX_SCALE = 8;
/** 按钮/键盘的倍率步进（乘法：0.23 → 0.30 → 0.39…，加法在小倍率下会一步跳没） */
const STEP = 1.3;
/** 滚轮一格 = ×1.15。比按钮小一档：滚轮能连续滚，跳太猛会直接滚过头 */
const WHEEL_STEP = 1.15;

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

interface ImageViewerProps {
  /** 已经拼好的绝对 URL 路径（由 joinItemPath / originBase 负责，这里不再拼路径） */
  src: string;
  alt: string;
}

/**
 * 弹窗里的图片查看器：缩放 / 平移 / 双指捏合交给 `react-zoom-pan-pinch`，
 * 外壳（工具条、加载与失败态、全屏）是我们的 —— 其它文件类型的预览仍走同一套弹窗。
 *
 * 为什么不用自己写的 transform：0.5.0 那版在缩到比窗口还小时，平移钳位的上下界会反向
 * （`-(w*z-fw)/2 > (w*z-fw)/2`），钳出来恒等于那个负的界 ⇒ 图被顶到左上角。库把这种
 * 「内容小于视口」的情形交给 `centerZoomedOut` + 边界计算，再叠上下面那个「松手回中心」；
 * 顺带白拿双指捏合、惯性平移与光标锚定缩放。
 *
 * 三条本仓库的硬约束：
 * - 视角属于「这一张图」⇒ `src` 一变整块重挂（key），状态自然归零；
 * - 工具条按钮**一律常驻**，不可用时只置灰（不做条件渲染 ⇒ 界面不跳）；
 * - 百分比槽位定宽，`23%` 变到 `800%` 不撑宽自己。
 *
 * 有意没做：旋转、裁剪、EXIF、缩略图条（要的话是另一个功能，不是这个查看器的补丁）。
 */
export const ImageViewer: React.FC<ImageViewerProps> = ({ src, alt }) => {
  const { t } = useTranslation();
  const frameRef = useRef<HTMLDivElement>(null);
  const imgRef = useRef<HTMLImageElement>(null);
  const rzRef = useRef<ReactZoomPanPinchRef>(null);

  const [scale, setScale] = useState(1);
  const [natural, setNatural] = useState<{ w: number; h: number } | null>(null);
  const [status, setStatus] = useState<'loading' | 'ok' | 'error'>('loading');
  const [attempt, setAttempt] = useState(0);
  const [isFullscreen, setIsFullscreen] = useState(false);

  /** 适应窗口 = 装下整张图，但**不超过 100%**（小图不放大，避免糊） */
  const applyFit = useCallback(() => {
    void rzRef.current?.fitToView({ mode: 'contain', maxScale: 1, animationTime: 200 });
  }, []);

  /** 倍率变化：以视口中心为锚点，钳在 10%~800% 内 */
  const zoomTo = useCallback((next: number) => {
    void rzRef.current?.centerView(clamp(next, MIN_SCALE, MAX_SCALE), 200);
  }, []);

  const stepZoom = useCallback(
    (factor: number) => {
      const cur = rzRef.current?.instance.state.scale ?? 1;
      zoomTo(cur * factor);
    },
    [zoomTo]
  );

  /** 1:1 = 一个图片像素对一个 CSS 像素 */
  const toActualSize = useCallback(() => {
    if (natural?.w) zoomTo(1);
  }, [natural, zoomTo]);

  /**
   * 整张图都装得下时把它送回正中间。
   *
   * 库的 `centerZoomedOut` 只把位置**钳**在 `[-留白/2, +留白/2]`（以光标为锚缩放时，图可以停在
   * 偏一侧），并不保证居中；而 0.5.0 自己写的那版更狠 —— 缩到比窗口还小时钳位的上下界反向
   * （`-(w*z-fw)/2 > (w*z-fw)/2`），钳出来恒等于那个负的界 ⇒ 顶死左上角。
   * 查看器的常规行为（macOS 预览 / Google Photos）：图小于视口就不许把它推偏，松手回中心。
   * 只要有一个轴还超出视口就不插手，那是他真的要平移的情形。
   */
  const recenterIfFullyVisible = useCallback(() => {
    const inst = rzRef.current?.instance;
    const wrapper = inst?.wrapperComponent;
    const content = inst?.contentComponent;
    if (!inst || !wrapper || !content) return;
    const s = inst.state.scale;
    const w = content.offsetWidth * s;
    const h = content.offsetHeight * s;
    if (w > wrapper.clientWidth + 1 || h > wrapper.clientHeight + 1) return;
    const offX = Math.abs(inst.state.positionX - (wrapper.clientWidth - w) / 2);
    const offY = Math.abs(inst.state.positionY - (wrapper.clientHeight - h) / 2);
    if (offX < 1 && offY < 1) return; // 已经居中 ⇒ 不再起动画（本函数也由 transform 驱动，别自激）
    void rzRef.current?.centerView(s, 150);
  }, []);

  /** 双击：在「适应窗口」与「1:1」之间切 */
  const toggleFit = useCallback(() => {
    const cur = rzRef.current?.instance.state.scale ?? 1;
    if (Math.abs(cur - 1) < 0.005) applyFit();
    else toActualSize();
  }, [applyFit, toActualSize]);

  const onImageReady = useCallback(
    (el: HTMLImageElement) => {
      setNatural({ w: el.naturalWidth, h: el.naturalHeight });
      setStatus('ok');
      applyFit();
    },
    [applyFit]
  );

  // 缓存命中的图有可能在 React 挂上 onLoad 之前就已 complete ⇒ 补一次判定，否则会卡在「加载中」
  useEffect(() => {
    const el = imgRef.current;
    if (status === 'loading' && el?.complete && el.naturalWidth > 0) onImageReady(el);
  }, [onImageReady, status, attempt, src]);

  // 滚轮 = 以光标为锚的**乘法**缩放。库自带的滚轮是加法（`scale + step × |deltaY|`，缺省 step 0.015
  // ⇒ Chrome 一格 deltaY=100 就是 +1.5 倍），在 10%~800% 这种对数跨度上没法用：小倍率一格翻十倍、
  // 大倍率一格没反应。所以 `wheel.disabled` 关掉它，自己走 zoomToPoint。
  const recenterTimer = useRef<number | null>(null);
  useEffect(
    () => () => {
      if (recenterTimer.current) window.clearTimeout(recenterTimer.current);
    },
    []
  );
  useEffect(() => {
    const el = frameRef.current;
    if (!el || status !== 'ok') return;
    const onWheel = (e: WheelEvent) => {
      e.preventDefault(); // 图片区没有别的东西可滚 ⇒ 滚轮归缩放，不把弹窗滚走
      const cur = rzRef.current?.instance.state.scale ?? 1;
      const next = clamp(cur * (e.deltaY < 0 ? WHEEL_STEP : 1 / WHEEL_STEP), MIN_SCALE, MAX_SCALE);
      void rzRef.current?.zoomToPoint(next, e.clientX, e.clientY, 100);
    };
    el.addEventListener('wheel', onWheel, { passive: false }); // React 的 onWheel 是被动监听，preventDefault 会被忽略
    return () => el.removeEventListener('wheel', onWheel);
  }, [status, attempt, src]);

  // 键盘：+/- 缩放、0 适应窗口、1 = 100%。库自带的键盘平移**没开**（keyboard.disabled 缺省 true），
  // 因为 ←/→ 在本弹窗是「上/下一个文件」（MediaPreviewModal 的 window 监听），不能抢。
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.ctrlKey || e.metaKey || e.altKey) return;
      const tag = (e.target as HTMLElement | null)?.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;
      if (e.key === '+' || e.key === '=') {
        e.preventDefault();
        stepZoom(STEP);
      } else if (e.key === '-' || e.key === '_') {
        e.preventDefault();
        stepZoom(1 / STEP);
      } else if (e.key === '0') {
        e.preventDefault();
        applyFit();
      } else if (e.key === '1') {
        e.preventDefault();
        toActualSize();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [applyFit, stepZoom, toActualSize]);

  // 全屏：目标是**图片区本身**（不是整个弹窗）⇒ 不用给弹窗的 max-w/h 写 :fullscreen 覆盖，
  // 顶栏的下载/翻页仍在外面；←/→ 是 window 监听，全屏里照样能翻页。
  const canFullscreen =
    typeof document !== 'undefined' && typeof document.documentElement.requestFullscreen === 'function';

  const toggleFullscreen = useCallback(() => {
    const el = frameRef.current;
    if (!el) return;
    if (document.fullscreenElement) {
      void document.exitFullscreen().catch(() => {});
    } else {
      void el.requestFullscreen().catch(() => {});
    }
  }, []);

  useEffect(() => {
    const onChange = () => {
      setIsFullscreen(!!document.fullscreenElement);
      // 视口换了尺寸：库的 resize 对齐只重钳边界、不重算适应 ⇒ 下一帧（新尺寸已生效）补一次 fit
      requestAnimationFrame(applyFit);
    };
    document.addEventListener('fullscreenchange', onChange);
    return () => document.removeEventListener('fullscreenchange', onChange);
  }, [applyFit]);

  const percent = scale;
  const atMin = percent <= MIN_SCALE + 0.005;
  const atMax = percent >= MAX_SCALE - 0.005;

  const toolButton =
    'inline-flex items-center justify-center p-1.5 rounded-lg text-white/85 hover:text-white hover:bg-white/10 ' +
    'active:scale-90 disabled:opacity-35 disabled:pointer-events-none transition-all';

  return (
    <div
      ref={frameRef}
      className={`relative flex-1 min-h-0 overflow-hidden ${
        isFullscreen ? 'bg-slate-950' : 'bg-slate-950/20 dark:bg-slate-950/50'
      }`}
    >
      {status === 'loading' && (
        <div className="absolute inset-0 flex flex-col items-center justify-center text-slate-500 pointer-events-none">
          <ZoomIn className="w-6 h-6 mb-2 animate-pulse text-indigo-500" />
          <p className="text-sm">{t('imageViewer.loading')}</p>
        </div>
      )}

      {status === 'error' ? (
        <div className="absolute inset-0 flex flex-col items-center justify-center text-rose-500">
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
      ) : (
        // key 变化 = 换图或重试 ⇒ 整块重挂，缩放/平移状态与库的内部测量一起归零
        <TransformWrapper
          key={`${src}#${attempt}`}
          ref={rzRef}
          minScale={MIN_SCALE}
          maxScale={MAX_SCALE}
          // 内容比视口小时允许停在留白内的任意位置（居中由上面那个“松手回中心”兜底）
          centerZoomedOut
          wheel={{ disabled: true }} // 见上面的自定滚轮
          panning={{ allowRightClickPan: false }}
          doubleClick={{ disabled: true }} // 双击自己接：库的 toggle 只在 1 倍上下跳，不管适应窗口
          onTransform={(_ref, state) => {
            // 每帧都回调 ⇒ 只在百分比整数位变化时才重渲染（工具条那个数字是唯一消费者）
            setScale((prev) => (Math.round(prev * 100) === Math.round(state.scale * 100) ? prev : state.scale));
            // 手势结束 220ms 后把完全可见的图拉回中心（滚轮/捏合/平移/按钮都走这一条路径）
            if (recenterTimer.current) window.clearTimeout(recenterTimer.current);
            recenterTimer.current = window.setTimeout(recenterIfFullyVisible, 220);
          }}
        >
          <TransformComponent
            wrapperClass="cursor-grab active:cursor-grabbing"
            wrapperStyle={{ width: '100%', height: '100%' }}
            wrapperProps={{ onDoubleClick: toggleFit }}
          >
            <img
              ref={imgRef}
              src={src}
              alt={alt}
              draggable={false}
              onLoad={(e) => onImageReady(e.currentTarget)}
              onError={() => setStatus('error')}
              className="block max-w-none select-none rounded-xl shadow-md animate-fadeIn"
            />
          </TransformComponent>
        </TransformWrapper>
      )}

      {status === 'ok' && (
        <div className="absolute bottom-3 left-1/2 -translate-x-1/2 flex items-center gap-0.5 px-1 py-1 rounded-xl bg-slate-900/70 dark:bg-black/60 backdrop-blur-md border border-white/10 shadow-lg">
          <button
            type="button"
            onClick={() => stepZoom(1 / STEP)}
            disabled={atMin}
            title={t('imageViewer.zoomOut')}
            aria-label={t('imageViewer.zoomOut')}
            className={toolButton}
          >
            <ZoomOut className="w-4 h-4" />
          </button>
          {/* 定宽槽位：23% → 800% 不会把工具条撑得左右跳 */}
          <span className="w-[3.75rem] text-center text-[11px] font-mono tabular-nums text-white/80">
            {Math.round(percent * 100)}%
          </span>
          <button
            type="button"
            onClick={() => stepZoom(STEP)}
            disabled={atMax}
            title={t('imageViewer.zoomIn')}
            aria-label={t('imageViewer.zoomIn')}
            className={toolButton}
          >
            <ZoomIn className="w-4 h-4" />
          </button>
          <button
            type="button"
            onClick={applyFit}
            title={t('imageViewer.fit')}
            aria-label={t('imageViewer.fit')}
            className={toolButton}
          >
            <Maximize className="w-4 h-4" />
          </button>
          <button
            type="button"
            onClick={toActualSize}
            disabled={!natural?.w}
            title={t('imageViewer.actual')}
            aria-label={t('imageViewer.actual')}
            className={`${toolButton} px-2 text-[11px] font-semibold`}
          >
            1:1
          </button>
          {canFullscreen && (
            <button
              type="button"
              onClick={toggleFullscreen}
              title={isFullscreen ? t('imageViewer.exitFullscreen') : t('imageViewer.fullscreen')}
              aria-label={isFullscreen ? t('imageViewer.exitFullscreen') : t('imageViewer.fullscreen')}
              className={toolButton}
            >
              {isFullscreen ? <Minimize className="w-4 h-4" /> : <Expand className="w-4 h-4" />}
            </button>
          )}
        </div>
      )}
    </div>
  );
};
