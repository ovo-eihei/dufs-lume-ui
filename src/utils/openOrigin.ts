/**
 * 「原地展开」动画的来源矩形：点击列表行/格子时记下**被点的那一格**（有缩略图就用缩略图自己的盒子），
 * 详情弹窗在打开的那一帧取走，用它算 FLIP 的起点。
 *
 * 为什么是一个模块级单例而不是 props：`setPreviewItem` 在 `App.tsx` 里有十处（键盘巡航、上一个/下一个、
 * 迷你播放器回填、index.html 入口…），逐条串一个 `origin` 状态既啰嗦又容易漏 ⇒ 只有「鼠标/手指点开的」
 * 这一条路径会留下来源，其余路径取到 null ⇒ 走原来的 modalIn 淡入，不强行加戏。
 *
 * 取用即清空（`take`），所以键盘打开不会捡到上一次点击的旧矩形。
 */
export interface OpenOrigin {
  /** 视口坐标，和 getBoundingClientRect 同口径（弹窗也是 fixed 定位 ⇒ 可直接相减） */
  x: number;
  y: number;
  w: number;
  h: number;
  /** 缩略图的 src；拿得到就让飞行途中显示它，视觉上就是那张图在放大 */
  image?: string;
}

let last: OpenOrigin | null = null;

export function rememberOpenOrigin(origin: OpenOrigin | null): void {
  last = origin;
}

export function takeOpenOrigin(): OpenOrigin | null {
  const value = last;
  last = null;
  return value;
}
