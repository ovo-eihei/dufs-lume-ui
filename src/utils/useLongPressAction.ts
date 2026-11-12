import { useEffect, useRef } from 'react';

/**
 * 触屏长按检测（默认 380ms），给「同一个按钮的第二动作」用：
 * 轻点 = 原动作，长按 = 另一个动作（例如复制链接 / 新窗口打开）。
 *
 * 这里**只负责判定**，不在定时器里执行动作：`window.open` 之类的操作必须在用户手势
 * 里发起，setTimeout 回调不算手势，会被弹窗拦截器静默丢掉。所以长按只把 armed 立起来，
 * 由抬手后浏览器补发的那次 click 执行 —— 调用方在 onClick 里先问 `takeIfLongPress()`。
 *
 * 桌面不需要它：Ctrl/⌘ + 点击本身就是手势，调用方自己判 e.ctrlKey 即可。
 */
export function useLongPressAction(thresholdMs = 380) {
  const armed = useRef(false);
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
        timer.current = window.setTimeout(() => {
          armed.current = true;
          timer.current = null;
        }, thresholdMs);
      },
      // 手指移动 = 在滑列表/滚动，不算长按
      onTouchMove: () => {
        clear();
        armed.current = false;
      },
      // 不清 armed：抬手后的 click 才是执行点
      onTouchCancel: () => {
        clear();
        armed.current = false;
      },
    },
    /** 长按成立则消费掉这次标记，返回 true（调用方据此走第二动作） */
    takeIfLongPress: () => {
      if (!armed.current) return false;
      armed.current = false;
      return true;
    },
  };
}
