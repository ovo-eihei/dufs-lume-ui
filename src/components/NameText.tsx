import React, { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';

/**
 * 文件名文本：只有在真的被省略号截断时才提示全名。
 * 桌面 = 鼠标悬停，触屏 = 长按（380ms）或轻点。长按不会触发系统选中/菜单。
 * 气泡用 fixed + portal 画到 body，避免表格/卡片的 overflow 与 transform 影响定位。
 */

const LONG_PRESS_MS = 380;
/** 触屏没有“移开鼠标”，气泡显示后自动收起 */
const TOUCH_AUTOHIDE_MS = 2600;
const VIEWPORT_PAD = 8;

type Tip = { text: string; left: number; maxWidth: number; top: number; above: boolean };

const isEllipsized = (el: HTMLElement) => el.scrollWidth > el.clientWidth + 1;

function place(el: HTMLElement, text: string): Tip {
  const r = el.getBoundingClientRect();
  const vw = window.innerWidth;
  const vh = window.innerHeight;
  const left = Math.min(Math.max(r.left, VIEWPORT_PAD), Math.max(vw - VIEWPORT_PAD - 160, VIEWPORT_PAD));
  const above = r.bottom > vh - 140;
  return {
    text,
    left,
    maxWidth: Math.max(Math.min(r.width + 64, vw - VIEWPORT_PAD - left), 120),
    top: above ? r.top - 6 : r.bottom + 6,
    above,
  };
}

export function useNameTooltip(text: string, toggleOnTap = false) {
  const [tip, setTip] = useState<Tip | null>(null);
  const pressTimer = useRef<number | null>(null);
  const hideTimer = useRef<number | null>(null);
  const swallowClick = useRef(false);
  const touching = useRef(false);

  const clearTimers = () => {
    if (pressTimer.current !== null) {
      window.clearTimeout(pressTimer.current);
      pressTimer.current = null;
    }
    if (hideTimer.current !== null) {
      window.clearTimeout(hideTimer.current);
      hideTimer.current = null;
    }
  };

  useEffect(() => clearTimers, []);

  // 换文件时立刻收起，别把上一个名字的气泡留在屏幕上
  useEffect(() => {
    setTip(null);
    clearTimers();
    swallowClick.current = false;
  }, [text]);

  useEffect(() => {
    if (!tip) return;
    const hide = () => setTip(null);
    const hideOnScroll = () => setTip(null);
    // pointerdown 而非 click：长按那一下发生在显示之前，不会被自己关掉
    document.addEventListener('pointerdown', hide, true);
    window.addEventListener('scroll', hideOnScroll, true);
    window.addEventListener('resize', hide);
    return () => {
      document.removeEventListener('pointerdown', hide, true);
      window.removeEventListener('scroll', hideOnScroll, true);
      window.removeEventListener('resize', hide);
    };
  }, [tip]);

  const show = (el: HTMLElement, fromTouch: boolean) => {
    if (!isEllipsized(el)) return false;
    setTip(place(el, text));
    if (fromTouch) hideTimer.current = window.setTimeout(() => setTip(null), TOUCH_AUTOHIDE_MS);
    return true;
  };

  const handlers: React.DOMAttributes<HTMLElement> = {
    onMouseEnter: (e) => {
      if (touching.current) return;
      show(e.currentTarget as HTMLElement, false);
    },
    onMouseLeave: () => {
      if (!touching.current) setTip(null);
    },
    onTouchStart: (e) => {
      touching.current = true;
      const el = e.currentTarget as HTMLElement;
      clearTimers();
      pressTimer.current = window.setTimeout(() => {
        pressTimer.current = null;
        if (show(el, true)) swallowClick.current = true;
      }, LONG_PRESS_MS);
    },
    onTouchMove: () => {
      // 手指滑动 = 在滚动列表，不算长按
      if (pressTimer.current !== null) {
        window.clearTimeout(pressTimer.current);
        pressTimer.current = null;
      }
    },
    onTouchEnd: () => {
      if (pressTimer.current !== null) {
        window.clearTimeout(pressTimer.current);
        pressTimer.current = null;
      }
      window.setTimeout(() => {
        touching.current = false;
      }, 400);
    },
    onTouchCancel: () => {
      clearTimers();
      touching.current = false;
    },
    onContextMenu: (e) => {
      if (touching.current) e.preventDefault();
    },
    onClick: (e) => {
      const el = e.currentTarget as HTMLElement;
      if (swallowClick.current) {
        swallowClick.current = false;
        e.preventDefault();
        e.stopPropagation();
        return;
      }
      if (toggleOnTap) {
        clearTimers();
        if (tip) setTip(null);
        else show(el, true);
        return;
      }
      setTip(null);
    },
  };

  const node = tip
    ? createPortal(
        <div
          className="pointer-events-none fixed z-[80] max-h-40 overflow-hidden rounded-xl border border-slate-200 bg-white/95 px-3 py-2 text-xs font-medium text-slate-800 shadow-lg backdrop-blur dark:border-slate-700 dark:bg-slate-800/95 dark:text-slate-100"
          style={
            tip.above
              ? { left: tip.left, maxWidth: tip.maxWidth, bottom: window.innerHeight - tip.top }
              : { left: tip.left, maxWidth: tip.maxWidth, top: tip.top }
          }
        >
          <span className="break-all" dir="auto">
            {tip.text}
          </span>
        </div>,
        document.body,
      )
    : null;

  return { handlers, node };
}

type NameTextProps = {
  text: string;
  className?: string;
  as?: 'p' | 'h3' | 'h4';
  /** 轻点也切换气泡（弹窗里没有别的点击语义，列表里轻点要留给“打开预览”） */
  toggleOnTap?: boolean;
};

const NameText: React.FC<NameTextProps> = ({ text, className = '', as = 'p', toggleOnTap = false }) => {
  const { handlers, node } = useNameTooltip(text, toggleOnTap);
  const El = as as 'p';
  return (
    <El dir="auto" {...handlers} className={`no-callout select-none truncate ${className}`.trim()}>
      {text}
      {node}
    </El>
  );
};

export default NameText;
