import { defineConfig, Plugin } from 'vite';
import react from '@vitejs/plugin-react';

/**
 * Vite 插件：在构建产物 index.html 中将静态资源的相对路径转换为 Dufs 的 __ASSETS_PREFIX__ 占位符路径，
 * 并保持构建产物完全扁平化（无嵌套子文件夹），方便直接通过 `dufs --assets ./dist` 挂载使用。
 */
function dufsAssetsPrefixPlugin(): Plugin {
  return {
    name: 'vite-plugin-dufs-assets-prefix',
    enforce: 'post',
    transformIndexHtml(html) {
      return html
        .replace(/(href|src)="\.\/([^"]+)"/g, '$1="__ASSETS_PREFIX__$2"')
        .replace(/(href|src)="\/([^"_][^"]*)"/g, '$1="__ASSETS_PREFIX__$2"');
    },
  };
}

export default defineConfig({
  base: './',
  plugins: [react(), dufsAssetsPrefixPlugin()],
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
