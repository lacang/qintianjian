import { defineConfig } from 'tsup';

export default defineConfig({
  entry: ['src/index.ts'],
  format: ['esm', 'cjs'],
  dts: true,
  sourcemap: true,
  clean: true,
  // mingpan 为 CJS、lunar-javascript 为 UMD/CJS：打进单 bundle，
  // caelus/auseklis 为纯 ESM（embedded 星历内联、零星历文件）：同样打进单 bundle，
  // 浏览器 <script type=module> / import 均可离线使用，无需 Node 内置模块。
  // iztro（紫微，MIT）及其运行时依赖 lunar-typescript/lunar-lite/dayjs/i18next 一并内联，
  // 保证单 bundle 离线；与 lunar-javascript（八字/六爻历算）是两个独立包，故分别列出。
  noExternal: [
    /mingpan/,
    /lunar-javascript/,
    /caelus/,
    /astronomy-engine/,
    /auseklis/,
    /iztro/,
    /lunar-typescript/,
    /lunar-lite/,
    /dayjs/,
    /i18next/,
  ],
  target: 'es2020',
  platform: 'browser',
});
