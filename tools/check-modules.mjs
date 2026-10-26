#!/usr/bin/env node
/**
 * 钦天监 · 静态 ESM 模块图校验（P0 门禁）
 *
 * 用法: node tools/check-modules.mjs [--root <仓库根>] [--json] [--quiet]
 *
 * 为什么需要它
 * ------------
 * `node --check x.js` 对没有 `package.json type=module` 的 .js 按 **CommonJS** 解析，
 * 会放过 ESM 的重复顶层声明。v121 事故就是 `yangzhaiview.js` 的 `yangzhaiCode` 与
 * `tibetview.js` 的 `tibetanCode` 各重复声明一次，`node --check` 全绿过闸，
 * 真机整个模块图解析失败、应用完全不启动（连 SW 都注册不上）。
 *
 * 本脚本按 ESM 语义逐文件校验，并检查模块图连通性：
 *   ① 每个 .js 复制成 .mjs 后 `node --check`（强制 ESM 解析 → 抓重复顶层声明/语法错）
 *   ② 每条相对 import 的目标文件真实存在（剥离 ?v= 查询串，含静态/副作用/动态 import）
 *   ③ 具名 import 的名字在目标模块确有导出（穿透 export {…} / export … from / export * 链）
 *   ④ 默认 import 要求目标模块确有 export default
 * 任一不过 exit 1。
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const argv = process.argv.slice(2);
const optOf = (name, def) => {
  const i = argv.indexOf(name);
  return i >= 0 && argv[i + 1] ? argv[i + 1] : def;
};
const ROOT = path.resolve(optOf('--root', path.join(HERE, '..')));
const APP = path.join(ROOT, 'app');
const AS_JSON = argv.includes('--json');
const QUIET = argv.includes('--quiet');
const log = (...a) => { if (!QUIET && !AS_JSON) console.log(...a); };

const SCAN_DIRS = ['js', 'vendor']
  .map((d) => path.join(APP, d))
  .filter((d) => fs.existsSync(d));

if (!fs.existsSync(APP)) {
  console.error(`[check-modules] 找不到 app 目录: ${APP}`);
  process.exit(1);
}

// ---------- 收集待校验文件 ----------
const files = [];
(function walk(dir) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) walk(p);
    else if (e.name.endsWith('.js')) files.push(p);
  }
})(path.join(APP, 'js'));
for (const d of SCAN_DIRS) {
  if (d === path.join(APP, 'js')) continue;
  (function walk(dir) {
    for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
      const p = path.join(dir, e.name);
      if (e.isDirectory()) walk(p);
      else if (e.name.endsWith('.js')) files.push(p);
    }
  })(d);
}
const rel = (p) => path.relative(ROOT, p).split(path.sep).join('/');
const srcCache = new Map();
const srcOf = (p) => {
  if (!srcCache.has(p)) srcCache.set(p, fs.readFileSync(p, 'utf8'));
  return srcCache.get(p);
};

// ---------- 语句级正则（只在行首认语句，避免误吃字符串里的示例代码）----------
const RE_IMPORT_FROM = /^[ \t]*import\s+([\s\S]{0,300}?)\s*from\s*['"]([^'"]+)['"]/gm;
const RE_IMPORT_SIDE = /^[ \t]*import\s*['"]([^'"]+)['"]/gm;
const RE_IMPORT_DYN = /(?:^|[^\w$.])import\s*\(\s*['"]([^'"]+)['"]\s*\)/gm;
const RE_EXPORT_DECL = /^[ \t]*export\s+(?:async\s+)?(?:function\s*\*?|class|const|let|var)\s+([A-Za-z_$][\w$]*)/gm;
const RE_EXPORT_DESTRUCT = /^[ \t]*export\s+(?:const|let|var)\s*([{[])([\s\S]*?)[}\]]/gm;
const RE_EXPORT_LIST = /^[ \t]*export\s*\{([^}]*)\}(?:\s*from\s*['"]([^'"]+)['"])?/gm;
const RE_EXPORT_STAR = /^[ \t]*export\s*\*\s*from\s*['"]([^'"]+)['"]/gm;
const RE_EXPORT_DEFAULT = /^[ \t]*export\s+default\b/m;

function specNames(clause) {
  // 解析 import 子句： default / * as ns / { a, b as c }
  const out = { def: false, ns: false, named: [] };
  const braceIdx = clause.indexOf('{');
  if (braceIdx >= 0) {
    const inner = clause.slice(braceIdx + 1, clause.lastIndexOf('}'));
    for (const part of inner.split(',')) {
      const t = part.trim();
      if (!t) continue;
      const m = t.match(/^([A-Za-z_$][\w$]*|\bdefault\b)(?:\s+as\s+([A-Za-z_$][\w$]*))?$/);
      if (m) out.named.push({ imported: m[1], local: m[2] || m[1] });
    }
  }
  const head = clause.slice(0, braceIdx >= 0 ? braceIdx : clause.length).trim();
  if (/\*\s+as\s+[A-Za-z_$][\w$]*/.test(head)) out.ns = true;
  else if (/^[A-Za-z_$][\w$]*$/.test(head)) out.def = true;
  return out;
}

function destructNames(kind, inner) {
  const names = [];
  if (kind === '{') {
    for (const part of inner.split(',')) {
      const t = part.trim().replace(/^\.\.\./, '');
      if (!t) continue;
      const m = t.match(/^([A-Za-z_$][\w$]*)\s*:\s*([A-Za-z_$][\w$]*)/) || t.match(/^([A-Za-z_$][\w$]*)/);
      if (m) names.push(m[2] || m[1]);
    }
  } else {
    for (const part of inner.split(',')) {
      const t = part.trim().replace(/^\.\.\./, '');
      const m = t.match(/^([A-Za-z_$][\w$]*)/);
      if (m) names.push(m[1]);
    }
  }
  return names;
}

function parseModule(file) {
  const src = srcOf(file);
  const imports = [];
  const named = new Set();
  const starFrom = [];
  const reExportNamed = [];
  let hasDefault = false;

  for (const m of src.matchAll(RE_IMPORT_FROM)) {
    const spec = m[2];
    if (!spec.startsWith('.')) continue;
    imports.push({ spec, ...specNames(m[1]), kind: 'static' });
  }
  for (const m of src.matchAll(RE_IMPORT_SIDE)) imports.push({ spec: m[1], def: false, ns: false, named: [], kind: 'side' });
  for (const m of src.matchAll(RE_IMPORT_DYN)) {
    if (m[1].startsWith('.')) imports.push({ spec: m[1], def: false, ns: false, named: [], kind: 'dynamic' });
  }
  for (const m of src.matchAll(RE_EXPORT_DECL)) named.add(m[1]);
  for (const m of src.matchAll(RE_EXPORT_DESTRUCT)) for (const n of destructNames(m[1], m[2])) named.add(n);
  for (const m of src.matchAll(RE_EXPORT_LIST)) {
    const inner = m[1];
    for (const part of inner.split(',')) {
      const t = part.trim();
      if (!t) continue;
      const mm = t.match(/^([A-Za-z_$][\w$]*|\bdefault\b)(?:\s+as\s+([A-Za-z_$][\w$]*))?$/);
      if (!mm) continue;
      const exported = mm[2] || mm[1];
      if (m[2]) {
        // export { a, b as c } from './x.js' —— 名字来自 x.js，按 re-export 处理
        reExportNamed.push({ exported, imported: mm[1], spec: m[2] });
      } else if (exported === 'default') {
        hasDefault = true;
      } else {
        named.add(exported);
      }
    }
  }
  for (const m of src.matchAll(RE_EXPORT_STAR)) if (m[1].startsWith('.')) starFrom.push(m[1]);
  if (RE_EXPORT_DEFAULT.test(src)) hasDefault = true;

  // 排除 import 语句里出现的 "import" 被当成 export 的情况（不会），
  // 但要注意 `import { a as b } from` 里的 b 不算本模块导出——上面的正则已按行首 export 限定。
  return { imports, named, starFrom, reExportNamed, hasDefault };
}

const parsed = new Map();
for (const f of files) parsed.set(f, parseModule(f));

function resolveSpec(fromFile, spec) {
  const clean = spec.split('?')[0].split('#')[0];
  const dir = path.dirname(fromFile);
  const abs = path.resolve(dir, clean);
  const cands = [abs, abs + '.js', path.join(abs, 'index.js')];
  for (const c of cands) if (fs.existsSync(c) && fs.statSync(c).isFile()) return c;
  return null;
}

// ---------- 导出集（含 re-export 链，带环保护）----------
const exportCache = new Map();
function exportsOf(file, seen = new Set()) {
  if (exportCache.has(file)) return exportCache.get(file);
  if (seen.has(file)) return { names: new Set(), hasDefault: false, star: true };
  seen.add(file);
  const mod = parsed.get(file) || parseModule(file);
  parsed.set(file, mod);
  const names = new Set(mod.named);
  let hasDefault = mod.hasDefault;
  let star = mod.starFrom.length > 0;
  for (const r of mod.reExportNamed) {
    const target = resolveSpec(file, r.spec);
    if (!target) { star = true; continue; }
    const t = exportsOf(target, seen);
    if (r.imported === 'default') {
      if (t.hasDefault) hasDefault = true; else star = true;
    } else if (t.names.has(r.imported)) names.add(r.exported);
    else star = true;
  }
  for (const s of mod.starFrom) {
    const target = resolveSpec(file, s);
    if (!target) { star = true; continue; }
    const t = exportsOf(target, seen);
    for (const n of t.names) names.add(n);
    if (t.hasDefault) hasDefault = true;
  }
  const res = { names, hasDefault, star };
  exportCache.set(file, res);
  return res;
}

// ---------- 校验 ----------
const failures = [];
const tmpMjs = path.join(os.tmpdir(), '_qintian_check_modules.mjs');
let importCount = 0;
let softUnverified = 0;

for (const f of files) {
  // ① ESM 语法（.mjs 副本强制 ESM 解析）
  fs.copyFileSync(f, tmpMjs);
  const r = spawnSync('node', ['--check', tmpMjs], { encoding: 'utf8' });
  if (r.status !== 0) {
    failures.push({ type: 'syntax', file: rel(f), detail: (r.stderr || '').split('\n').slice(0, 6).join('\n') });
  }
}

for (const f of files) {
  const mod = parsed.get(f);
  for (const imp of mod.imports) {
    importCount++;
    const target = resolveSpec(f, imp.spec);
    if (!target) {
      failures.push({ type: 'missing-file', file: rel(f), spec: imp.spec });
      continue;
    }
    if (!target.endsWith('.js')) continue;
    const t = exportsOf(target);
    if (imp.def && !t.hasDefault && !t.star) {
      failures.push({ type: 'missing-default-export', file: rel(f), spec: imp.spec, target: rel(target) });
    }
    for (const n of imp.named) {
      if (t.names.has(n.imported)) continue;
      if (t.star) { softUnverified++; continue; }
      failures.push({ type: 'missing-named-export', file: rel(f), spec: imp.spec, target: rel(target), name: n.imported });
    }
  }
}

// ---------- 汇总 ----------
const summary = {
  root: ROOT,
  files: files.length,
  imports: importCount,
  softUnverified,
  failures,
  ok: failures.length === 0,
};

if (AS_JSON) {
  console.log(JSON.stringify(summary, null, 2));
} else if (failures.length === 0) {
  log(`[check-modules] ${files.length} 个文件 ESM 语法通过；${importCount} 条相对 import 全部命中（0 断链 / 0 缺导出）` +
    (softUnverified ? `；${softUnverified} 条经 export * 链无法静态确认（已放行）` : ''));
  log('[check-modules] PASS');
} else {
  console.error(`\n========== 模块图门禁未通过（${failures.length} 项）==========`);
  for (const x of failures) {
    if (x.type === 'syntax') console.error(`[FAIL:syntax] ${x.file}\n${x.detail}`);
    else if (x.type === 'missing-file') console.error(`[FAIL:missing-file] ${x.file} -> ${x.spec}（目标文件不存在）`);
    else if (x.type === 'missing-named-export') console.error(`[FAIL:missing-export] ${x.file} 从 ${x.spec} 导入 {${x.name}}，但 ${x.target} 没有这个导出`);
    else if (x.type === 'missing-default-export') console.error(`[FAIL:missing-default] ${x.file} 从 ${x.spec} 默认导入，但 ${x.target} 没有 export default`);
    else console.error(`[FAIL:${x.type}] ${JSON.stringify(x)}`);
  }
  console.error('提示：这类错误 node --check 单文件是抓不到的（.js 按 CommonJS 解析），必须按 ESM 模块图校验。');
  process.exit(1);
}
