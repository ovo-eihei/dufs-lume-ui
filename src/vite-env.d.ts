/// <reference types="vite/client" />

/**
 * 样式按「副作用导入」写（`import './index.css'`），TS 7 开始会报
 * `TS2882: Cannot find module or type declarations for side-effect import`
 * —— 5.6 不报。这里显式给出环境模块声明，别去改 main.tsx 的写法。
 */
declare module '*.css';
