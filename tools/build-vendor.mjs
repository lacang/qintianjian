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
 *  1. app/vendor 的 bundle 需要**裁剪 iztro 的 locale**（zh-TW / en-US / ja-JP / ko-KR / vi-VN
 *     共 45 个 json 模块体，裁掉 43 块可省约 33KB 离线体积）。裁剪规则见 trimIztroLocales()。
 *     ⚠️ **白名单必须留：zh-CN/**（iztro 的中文输出全靠它）+ en-US/earthlyBranch.js、
 *     en-US/heavenlyStem.js（罗马字地支/天干反查表，kot() 用它把 'xu'/'chen' 翻回 key）。
 *     裁掉 en-US/earthlyBranch.js 会让紫微辅星全部错宫，详见 KEEP_LOCALES 注释。
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

/**
 * 需要保留的 locale（白名单）。
 *
 * ⚠️ **别退回"只保留 zh-CN"的写法**：iztro 的 kot()（Key of Translation）会遍历
 * **所有语言**的翻译表做"翻译值 → key"反查，`resources` 的遍历顺序是
 * en-US → ja-JP → ko-KR → zh-CN → zh-TW → vi-VN。紫微排盘里有一批地支是
 * **罗马字**（lunar-lite 侧口径 'xu'/'chen'/'woo'），只有 en-US 表能把它们反查回
 * 'xuEarthly'；en-US/earthlyBranch.js 一旦被清空，kot('xu','Earthly') 原样返回 'xu'，
 * utils/fixEarthlyBranchIndex 于是算成 fixIndex(-1-2)=9=亥宫，**辅星错宫、杂曜扎堆**。
 *
 * 这些文件各自有多必需，是实测出来的（tools/check-vendor.mjs 20 命例逐宫对拍）：
 *  - en-US/earthlyBranch.js  **必需**：裁掉 → 20/20 命例错、8053 / 26160 个叶子字段不一致
 *  - en-US/heavenlyStem.js   非必需（所有 Heavenly 反查传入的都是中文，zh-CN 就能命中），
 *                            但与 earthlyBranch 同属"罗马字反查表"，源码仅 340B，保留作防御
 *  - en-US/fiveElementsClass.js、star.js、mutagen.js、gender.js、palace.js、brightness.js、
 *    common.json、index.js  均非必需（实测 0 处差异），照裁
 */
const KEEP_LOCALES = ['zh-CN/', 'en-US/earthlyBranch.js', 'en-US/heavenlyStem.js'];

/** 裁剪块数下限：防止构建产物结构变化导致裁剪静默失效（45 块 - 2 块白名单 = 43）。 */
const MIN_TRIMMED = 40;

/** 白名单里必须真实存在的文件——iztro 升级改了路径时要报错，而不是静默裁光。 */
const MUST_EXIST = ['en-US/earthlyBranch.js', 'en-US/heavenlyStem.js'];

/** esbuild 是二进制，云盘挂载常丢可执行位；缺权限时构建会 EACCES。 */
function ensureExec(p) {
  if (existsSync(p)) {
    try { chmodSync(p, 0o755); } catch {}
  }
}

/**
 * 把 iztro 非白名单 locale 的 json 模块体清空为 {}。
 * 只动 `// node_modules/iztro/lib/i18n/locales/<lang>/...` 注释块内的
 * `module.exports = {...}` / `exports.default = {...}`，其余原样保留；
 * 白名单（zh-CN/** + KEEP_LOCALES）整块跳过。用括号计数定位对象字面量边界，
 * 避免手写正则截断多行对象。
 */
function trimIztroLocales(src) {
  const lines = src.split('\n');
  const out = [];
  let inLocale = false;
  let trimmed = 0;
  const seen = new Set();
  const trimmedSet = new Set();
  let curFile = '';
  let i = 0;
  while (i < lines.length) {
    const line = lines[i];
    if (/^\/\/ /.test(line)) {
      const m = /iztro\/lib\/i18n\/locales\/(.*)$/.exec(line);
      if (m) { seen.add(m[1]); curFile = m[1]; }
      inLocale = !!m && !KEEP_LOCALES.some((k) => m[1] === k || m[1].startsWith(k));
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
        trimmedSet.add(curFile);
        i = j + 1;
        continue;
      }
    }
    out.push(line);
    i++;
  }
  // 白名单文件必须真在产物里：iztro 升级换路径时立刻报错，别静默裁成空表
  for (const must of MUST_EXIST) {
    if (!seen.has(must)) {
      throw new Error(`白名单 locale 未出现在 bundle 中：${must}（iztro 版本或打包结构变了？）`);
    }
  }
  const kept = [...seen].filter((f) => KEEP_LOCALES.some((k) => f === k || f.startsWith(k))).length;
  // 非白名单里没被裁掉的只剩各语言的 index.js —— 它们是 `exports.default = __assign({}, …)`
  // 的组装器（不是对象字面量），本来就不在裁剪范围内，留着才能把上面的表拼成 resources。
  const untouched = [...seen].filter(
    (f) => !KEEP_LOCALES.some((k) => f === k || f.startsWith(k)) && !trimmedSet.has(f),
  );
  const odd = untouched.filter((f) => !f.endsWith('/index.js'));
  if (odd.length) {
    throw new Error(`以下 locale 块既不在白名单也没被裁掉：${odd.join(', ')}（裁剪规则可能失效）`);
  }
  if (trimmed + kept + untouched.length !== seen.size) {
    throw new Error(`locale 计数不自洽：裁 ${trimmed} + 留 ${kept} + 免裁 ${untouched.length} ≠ 共 ${seen.size}`);
  }
  return { src: out.join('\n'), trimmed, total: seen.size, kept, untouched: untouched.length };
}

function build() {
  ensureExec(join(CORE, 'node_modules', '@esbuild', 'linux-x64', 'bin', 'esbuild'));
  mkdirSync(OUT_DIR, { recursive: true });
  const cli = join(CORE, 'node_modules', 'tsup', 'dist', 'cli-default.js');
  // --no-dts：vendor 只需要 JS 单文件，.d.ts 产物对浏览器无意义；
  // 让 DTS 一起跑会把"src 里的类型错误"变成 vendor 重建的硬阻塞
  // （类型检查是 `npm run typecheck` / CI 的职责，不该挡离线包构建）。
  const r = spawnSync(process.execPath, [cli, 'src/index.ts', '--format', 'esm', '--out-dir', OUT_DIR, '--no-dts'], {
    cwd: CORE,
    stdio: 'inherit',
  });
  if (r.status !== 0) throw new Error(`tsup 构建失败，退出码 ${r.status}`);
  return readFileSync(join(OUT_DIR, 'index.js'), 'utf8');
}

const raw = build();
const { src, trimmed, total, kept } = trimIztroLocales(raw);
if (trimmed < MIN_TRIMMED) throw new Error(`iztro locale 裁剪块数异常：${trimmed}（预期 >= ${MIN_TRIMMED}，构建产物结构可能变了）`);
const bytes = Buffer.byteLength(src, 'utf8');

/**
 * --check 只回答"现文件是不是这次重建的产物"（漂移检测）。
 * 产物**对不对**不由字节比对保证——v133 的紫微辅星事故就是字节全一致但语义全错。
 * 所以字节一致之后必须再过一遍 tools/check-vendor.mjs 的行为对拍。
 */
if (CHECK_ONLY) {
  const cur = existsSync(TARGET) ? readFileSync(TARGET, 'utf8') : '';
  const curBytes = Buffer.byteLength(cur, 'utf8');
  console.log(`[build-vendor] check: locale ${total} 块（裁 ${trimmed} / 留 ${kept}）/ ${bytes} 字节；当前 vendor ${curBytes} 字节`);
  if (cur !== src) {
    console.log('[build-vendor] 重建结果与现有 vendor 不一致 ❌（需执行 node tools/build-vendor.mjs 重建）');
    process.exit(1);
  }
  console.log('[build-vendor] 字节一致 ✅ → 继续行为对拍（tools/check-vendor.mjs）');
  const r = spawnSync(process.execPath, [join(ROOT, 'tools', 'check-vendor.mjs')], { stdio: 'inherit' });
  process.exit(r.status === 0 ? 0 : 1);
}

writeFileSync(TARGET, src);
console.log(`[build-vendor] 已写入 ${TARGET}`);
console.log(`[build-vendor] iztro locale ${total} 块：保留 ${kept}（zh-CN + 罗马字反查表）/ 裁空 ${trimmed}，产物 ${bytes} 字节`);
console.log('[build-vendor] 提示：跑 node tools/check-vendor.mjs 做行为对拍（字节一致 ≠ 语义正确）');
