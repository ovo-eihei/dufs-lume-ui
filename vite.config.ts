import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { defineConfig, Plugin } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

/**
 * favicon 的缓存键 = 文件内容的 sha256 前 8 位。
 * 为什么 js/css 用文件名带 hash、favicon 只能用查询串：品牌「同名覆盖」那一步
 * （把站点自己的 svg 覆盖到 assets/favicon.svg）依赖固定文件名，改成哈希名就会把那条流程打断。
 * 而 dufs 给 --assets 下所有文件 `cache-control: public, max-age=31536000, immutable`（实测），
 * 固定名换内容 ⇒ 浏览器一年内不会再要一次 ⇒ 换图标在生产环境永远"不生效"。
 */
function faviconCacheKey(root: string): string {
  try {
    return createHash('sha256').update(readFileSync(resolve(root, 'public/favicon.svg'))).digest('hex').slice(0, 8);
  } catch {
    return ''; // 没有 favicon（比如被裁掉的私有品牌）⇒ 不加查询串，别把构建搞挂
  }
}

/**
 * Vite 插件：在构建产物 index.html 中将静态资源的相对路径转换为 Dufs 的 __ASSETS_PREFIX__ 占位符路径，
 * 并保持构建产物完全扁平化（无嵌套子文件夹），方便直接通过 `dufs --assets ./dist` 挂载使用。
 */
function dufsAssetsPrefixPlugin(): Plugin {
  let root = '';
  return {
    name: 'vite-plugin-dufs-assets-prefix',
    enforce: 'post',
    configResolved(cfg) {
      root = cfg.root;
    },
    transformIndexHtml(html) {
      const out = html
        .replace(/(href|src)="\.\/([^"]+)"/g, '$1="__ASSETS_PREFIX__$2"')
        .replace(/(href|src)="\/([^"_][^"]*)"/g, '$1="__ASSETS_PREFIX__$2"');
      const key = faviconCacheKey(root);
      if (!key) return out;
      // 只给 favicon.svg 加，别的资源已经是哈希名了
      return out.replace(/(href="__ASSETS_PREFIX__favicon\.svg)(")/, `$1?v=${key}$2`);
    },
  };
}

export default defineConfig({
  base: './',
  plugins: [react(), tailwindcss(), dufsAssetsPrefixPlugin()],
  build: {
    outDir: 'dist',
    assetsDir: '',
    cssCodeSplit: false,
    rollupOptions: {
      // ⚠ 产物文件名必须带 content hash：dufs 把 --assets 挂在 /__dufs_v<版本>__/ 下并给出
      // `cache-control: public, max-age=31536000, immutable`（实测）。index.html 是 no-cache，
      // 但固定名 lume-app.js 一旦换内容，浏览器仍会吃一年期的旧缓存 ⇒ 换皮改完看不到效果。
      // 前缀里的 dufs 版本只在升级 dufs 时变，救不了同版本内的重新发布。
      output: {
        entryFileNames: 'lume-app.[hash].js',
        chunkFileNames: 'lume-[name].[hash].js',
        assetFileNames: 'lume-[name].[hash][extname]',
      },
    },
  },
});
