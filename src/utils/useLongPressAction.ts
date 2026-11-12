import { useEffect, useRef } from 'react';

/**
 * 触屏长按检测（默认 380ms），给「同一个按钮的第二动作」用：
 * 轻点 = 原动作，长按 = 另一个动作（例如复制链接 / 新窗口打开）。
 *
 * **动作在按住期间就执行**（定时器里直接调 `onLongPress`），不等抬手：手指按住不动是
 * 很难精确控制时长的，用户预期是「按够了就发生」，抬手才发生等于逼他猜阈值。
 *
 * 唯一的例外是弹窗拦截：`window.open` 只有在用户手势里发起才 guaranteed 不被拦，
 * 定时器里发起时部分内核会返回 `null`。所以 `onLongPress` 用返回值说话：
 * - 返回 `true` / `undefined` ⇒ 动作已完成，抬手补发的 click 被吞掉，不再重复执行；
 * - 返回 `false` ⇒ 动作没成功（典型就是被拦），于是把这次长按记下来，
 *   交给抬手后的 click 再试一次（那时它就在手势里了）。
 *
 * 桌面不需要它：Ctrl/⌘ + 点击本身就是手势，调用方自己判 e.ctrlKey 即可。
 */
export function useLongPressAction(
  onLongPress?: () => boolean | void,
  thresholdMs = 380
) {
  /** 长按已触发但动作被拦 ⇒ 等抬手后那次 click 补做 */
  const armed = useRef(false);
  /** 长按已成功执行过动作（抬手后的 click 要吞掉） */
  const fired = useRef(false);
  const timer = useRef<number | null>(null);

  const clear = () => {
    if (timer.current !== null) {
      window.clearTimeout(timer.current);
      timer.current = null;
    }
  };

  // 组件卸载时别留悬空定时器
  useEffect(() => clear, []);

  return {
    handlers: {
      onTouchStart: () => {
        clear();
        armed.current = false;
        fired.current = false;
        timer.current = window.setTimeout(() => {
          timer.current = null;
          const ok = onLongPress?.();
          if (ok === false) armed.current = true;
          else fired.current = true;
        }, thresholdMs);
      },
      // 手指移动 = 在滑列表/滚动，不算长按
      onTouchMove: () => {
        clear();
        armed.current = false;
        fired.current = false;
      },
      onTouchCancel: () => {
        clear();
        armed.current = false;
        fired.current = false;
      },
    },
    /** 长按成立但动作没做成：消费标记并返回 true，调用方据此在 click 里补做 */
    takeIfLongPress: () => {
      if (!armed.current) return false;
      armed.current = false;
      return true;
    },
    /** 长按已经在按住期间做过动作：吞掉抬手补发的 click */
    takeIfFired: () => {
      if (!fired.current) return false;
      fired.current = false;
      return true;
    },
  };
}
