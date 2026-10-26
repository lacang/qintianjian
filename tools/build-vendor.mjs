#!/usr/bin/env node
/**
 * build-vendor.mjs —— 重建 app/vendor/liuyao-core.js
 *
 * 职责：把 liuyao-core/src/** 重新打包成 app 侧离线单 bundle（ESM 单文件）。
 * 底本/来源：liuyao-core（本仓核心计算层；tsup + esbuild，noExternal 内联所有运行期依赖）。
 * 对外接口：`node tools/build-vendor.mjs` 构建并写入；`--check` 只比对不写入（退出码 1 = 需重建）。
 * 副作用：写入 app/vendor/liuyao-core.js。
 *
 * 为什么需要脚本而不是直接 cp liuyao-core/dist/index.js：
 *  1. app/vendor 的 bundle 需要**裁剪 iztro 的非中文 locale**（zh-TW / en-US / ja-JP / ko-KR / vi-VN
 *     共 45 个 json 模块体），可省约 33KB 离线体积。裁剪规则见 trimIztroLocales()。
 *     ⚠️ **zh-CN 必须保留**：iztro 用 zh-CN locale 把星曜/宫位/五行局等 key 翻成中文，
 *     裁掉会让紫微页整页显示 key 而非中文名。
 *  2. 历史上 vendor 是手工产物，曾出现 src 与 vendor 漂移（v120 删小雷诺曼时只落了 vendor，
 *     src/cards/spreads.ts 仍含 lenormand，一旦重建就会把已删牌组带回来）。
 *     本脚本让"重建"可复现、可自检，避免同类漂移。
 */
import { spawnSync } from 'node:child_process';
import { chmodSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { tmpdir } from 'node:os';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const CORE = join(ROOT, 'liuyao-core');
const TARGET = join(ROOT, 'app', 'vendor', 'liuyao-core.js');
const OUT_DIR = join(tmpdir(), 'qintian-vendor-build');
const CHECK_ONLY = process.argv.includes('--check');

/** 需要保留的 locale：iztro 的中文输出全靠它。 */
const KEEP_LOCALE = 'zh-CN/';
/** 裁剪块数下限：防止构建产物结构变化导致裁剪静默失效。 */
const MIN_TRIMMED = 40;

/** esbuild 是二进制，云盘挂载常丢可执行位；缺权限时构建会 EACCES。 */
function ensureExec(p) {
  if (existsSync(p)) {
    try { chmodSync(p, 0o755); } catch {}
  }
}

/**
 * 把 iztro 非中文 locale 的 json 模块体清空为 {}。
 * 只动 `// node_modules/iztro/lib/i18n/locales/<lang>/...` 注释块内的
 * `module.exports = {...}` / `exports.default = {...}`，其余原样保留；
 * zh-CN 目录整块跳过。用括号计数定位对象字面量边界，避免手写正则截断多行对象。
 */
function trimIztroLocales(src) {
  const lines = src.split('\n');
  const out = [];
  let inLocale = false;
  let trimmed = 0;
  let i = 0;
  while (i < lines.length) {
    const line = lines[i];
    if (/^\/\/ /.test(line)) {
      const m = /iztro\/lib\/i18n\/locales\/(.*)$/.exec(line);
      inLocale = !!m && !m[1].startsWith(KEEP_LOCALE);
    }
    if (inLocale) {
      const m = /^(\s*)(module\.exports|exports\.default) = \{/.exec(line);
      if (m) {
        let depth = 0;
        let j = i;
        for (; j < lines.length; j++) {
          for (const ch of lines[j]) {
            if (ch === '{') depth++;
            else if (ch === '}') depth--;
          }
          if (depth <= 0) break;
        }
        if (depth !== 0) throw new Error(`locale 对象括号不闭合，起始行 ${i + 1}`);
        out.push(`${m[1]}${m[2]} = {};`);
        trimmed++;
        i = j + 1;
        continue;
      }
    }
    out.push(line);
    i++;
  }
  return { src: out.join('\n'), trimmed };
}

function build() {
  ensureExec(join(CORE, 'node_modules', '@esbuild', 'linux-x64', 'bin', 'esbuild'));
  mkdirSync(OUT_DIR, { recursive: true });
  const cli = join(CORE, 'node_modules', 'tsup', 'dist', 'cli-default.js');
  const r = spawnSync(process.execPath, [cli, 'src/index.ts', '--format', 'esm', '--out-dir', OUT_DIR], {
    cwd: CORE,
    stdio: 'inherit',
  });
  if (r.status !== 0) throw new Error(`tsup 构建失败，退出码 ${r.status}`);
  return readFileSync(join(OUT_DIR, 'index.js'), 'utf8');
}

const raw = build();
const { src, trimmed } = trimIztroLocales(raw);
if (trimmed < MIN_TRIMMED) throw new Error(`iztro locale 裁剪块数异常：${trimmed}（预期 >= ${MIN_TRIMMED}，构建产物结构可能变了）`);
const bytes = Buffer.byteLength(src, 'utf8');

if (CHECK_ONLY) {
  const cur = existsSync(TARGET) ? readFileSync(TARGET, 'utf8') : '';
  const curBytes = Buffer.byteLength(cur, 'utf8');
  console.log(`[build-vendor] check: 裁剪 ${trimmed} 块 / ${bytes} 字节；当前 vendor ${curBytes} 字节`);
  console.log(cur === src ? '[build-vendor] 一致 ✅' : '[build-vendor] 不一致 ❌（需重建）');
  process.exit(cur === src ? 0 : 1);
}

writeFileSync(TARGET, src);
console.log(`[build-vendor] 已写入 ${TARGET}`);
console.log(`[build-vendor] 裁剪 iztro 非中文 locale ${trimmed} 块，产物 ${bytes} 字节`);
