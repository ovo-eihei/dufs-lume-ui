/**
 * 演示模式的占位图（本地 dev / 无 dufs 注入时没有真实图片文件）。
 * 预览弹窗与网格缩略图共用，两边看到的"图"才是同一张。
 */
export function createDemoSvgDataUri(title: string): string {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 960 540" width="960" height="540">
    <defs>
      <linearGradient id="bg" x1="0%" y1="0%" x2="100%" y2="100%">
        <stop offset="0%" stop-color="#0f172a"/>
        <stop offset="50%" stop-color="#1e1b4b"/>
        <stop offset="100%" stop-color="#311042"/>
      </linearGradient>
      <radialGradient id="glow1" cx="25%" cy="30%" r="45%">
        <stop offset="0%" stop-color="#6366f1" stop-opacity="0.55"/>
        <stop offset="100%" stop-color="#6366f1" stop-opacity="0"/>
      </radialGradient>
      <radialGradient id="glow2" cx="75%" cy="70%" r="45%">
        <stop offset="0%" stop-color="#ec4899" stop-opacity="0.45"/>
        <stop offset="100%" stop-color="#ec4899" stop-opacity="0"/>
      </radialGradient>
    </defs>
    <rect width="960" height="540" fill="url(#bg)"/>
    <circle cx="240" cy="160" r="320" fill="url(#glow1)"/>
    <circle cx="720" cy="380" r="320" fill="url(#glow2)"/>
    <rect x="280" y="170" width="400" height="200" rx="24" fill="#ffffff" fill-opacity="0.06" stroke="#ffffff" stroke-opacity="0.18"/>
    <text x="480" y="258" text-anchor="middle" fill="#ffffff" font-family="Inter, sans-serif" font-size="28" font-weight="700">${title}</text>
    <text x="480" y="298" text-anchor="middle" fill="#94a3b8" font-family="Inter, sans-serif" font-size="14">Dufs Lume UI · Rich Media Preview</text>
  </svg>`;
  return `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`;
}
