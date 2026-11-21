#!/usr/bin/env node
/**
 * check-vendor.mjs —— app/vendor/liuyao-core.js 的**行为级**校验器
 *
 * 为什么需要它：
 *   build-vendor.mjs 的 `--check` 只比对"重建结果与现文件是否逐字节相同"，这只能证明
 *   构建可复现，**不能证明产物正确**。v133 的紫微辅星全错位事故正是这样漏掉的：
 *   bundle 与错误构建逐字节一致，`--check` 一路绿灯，而 iztro 的 locale 被误裁后
 *   地支反查表缺失，辅星/杂曜全部落到同一宫。
 *
 * 本脚本做的是黑白分明的对拍：把 liuyao-core/src 编译出的参考实现与 vendor bundle
 * 分别 import，用同一批输入逐字段比较输出，任何一处不一致即退出码 1。
 *
 * 参考实现来源：直接用 esbuild 编译 src/index.ts（与 build-vendor 的 tsup 同一条
 * noExternal 内联链路、同一 platform/target），因此参考侧 = 源码真值，不含任何裁剪。
 *
 * 用法：
 *   node tools/check-vendor.mjs            全量校验
 *   node tools/check-vendor.mjs --quiet    只输出结论
 * 退出码：0 = 全部一致；1 = 存在不一致/异常。
 */
import { createRequire } from 'node:module';
import { existsSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const CORE = join(ROOT, 'liuyao-core');
const SRC_ENTRY = join(CORE, 'src', 'index.ts');
const VENDOR = join(ROOT, 'app', 'vendor', 'liuyao-core.js');
const QUIET = process.argv.includes('--quiet');

/* ------------------------------------------------------------------ 工具 */

/** 稳定序列化：对象键排序，便于生成可读的差异定位。 */
function stable(v) {
  if (v === null || typeof v !== 'object') {
    if (typeof v === 'number' && Object.is(v, -0)) return '-0';
    return v;
  }
  if (v instanceof Date) return { __date: v.toISOString() };
  if (Array.isArray(v)) return v.map(stable);
  const out = {};
  for (const k of Object.keys(v).sort()) out[k] = stable(v[k]);
  return out;
}

/**
 * 逐字段比较，返回差异路径列表（最多 max 条）。
 * 数值用 Object.is 比较：NaN===NaN 视为一致，-0 与 0 视为不同（星历计算里不可混用）。
 */
function diff(a, b, path = '', acc = [], max = 200) {
  if (acc.length >= max) return acc;
  if (Object.is(a, b)) return acc;
  const ta = a === null ? 'null' : typeof a;
  const tb = b === null ? 'null' : typeof b;
  if (ta !== tb) { acc.push(`${path}: 类型 ${ta} vs ${tb}`); return acc; }
  if (ta !== 'object') {
    acc.push(`${path}: ${JSON.stringify(a)} vs ${JSON.stringify(b)}`);
    return acc;
  }
  if (a instanceof Date || b instanceof Date) {
    const x = a instanceof Date ? a.getTime() : NaN;
    const y = b instanceof Date ? b.getTime() : NaN;
    if (!Object.is(x, y)) acc.push(`${path}: Date ${x} vs ${y}`);
    return acc;
  }
  const aa = Array.isArray(a), ab = Array.isArray(b);
  if (aa !== ab) { acc.push(`${path}: 数组 vs 对象`); return acc; }
  if (aa) {
    if (a.length !== b.length) { acc.push(`${path}.length: ${a.length} vs ${b.length}`); }
    for (let i = 0; i < Math.min(a.length, b.length); i++) diff(a[i], b[i], `${path}[${i}]`, acc, max);
    return acc;
  }
  const ka = Object.keys(a), kb = Object.keys(b);
  for (const k of ka) {
    if (!(k in b)) acc.push(`${path}.${k}: 仅参考实现有`);
    else diff(a[k], b[k], `${path}.${k}`, acc, max);
    if (acc.length >= max) return acc;
  }
  for (const k of kb) if (!(k in a)) acc.push(`${path}.${k}: 仅 vendor 有`);
  return acc;
}

/* ------------------------------------------------------- 参考实现：编译 src */

async function buildReference() {
  const require = createRequire(join(CORE, 'package.json'));
  const esbuild = require('esbuild');
  const dir = mkdtempSync(join(tmpdir(), 'qintian-check-vendor-'));
  const outfile = join(dir, 'ref.mjs');
  await esbuild.build({
    entryPoints: [SRC_ENTRY],
    bundle: true,            // 与 tsup noExternal 一致：所有运行期依赖内联
    format: 'esm',
    platform: 'browser',
    target: 'es2020',
    outfile,
    logLevel: 'warning',
  });
  const mod = await import(pathToFileURL(outfile).href);
  return { mod, cleanup: () => rmSync(dir, { recursive: true, force: true }) };
}

/* --------------------------------------------------------------- 用例池 */

/** 把种子日按固定步长推进，保证年/月/日组合合法且覆盖四季与各年代。 */
function dateAt(i, base = Date.UTC(1940, 0, 5)) {
  const step = 1493; // 约 4 年 1 个月，故意与 60 甲子和 12 年周期错开
  const d = new Date(base + i * step * 86400000);
  return { year: d.getUTCFullYear(), month: d.getUTCMonth() + 1, day: d.getUTCDate() };
}

const HOURS = [0, 1, 3, 5, 7, 9, 11, 12, 13, 15, 17, 19, 21, 22, 23, 4, 6, 8, 10, 20];
const GENDERS = ['男', '女'];

/** 20 个日期时辰用例（六爻/八字/奇门/紫微/西学共用）。 */
const DATE_CASES = HOURS.map((hour, i) => ({
  ...dateAt(i), hour, minute: (i * 7) % 60, gender: GENDERS[i % 2],
}));

/** 20 组六爻爻值（自下而上，覆盖老阴/少阳/少阴/老阳的各种组合）。 */
const YAO_CASES = [
  [7, 8, 9, 6, 7, 8], [8, 8, 8, 8, 8, 8], [7, 7, 7, 7, 7, 7], [9, 9, 9, 9, 9, 9],
  [6, 6, 6, 6, 6, 6], [6, 7, 8, 9, 6, 7], [9, 6, 8, 7, 9, 6], [7, 6, 9, 8, 7, 6],
  [8, 9, 6, 7, 8, 9], [6, 8, 7, 9, 6, 8], [9, 7, 6, 8, 9, 7], [8, 6, 9, 7, 8, 6],
  [7, 9, 8, 6, 7, 9], [6, 7, 6, 7, 6, 7], [9, 8, 9, 8, 9, 8], [7, 6, 8, 9, 7, 6],
  [8, 7, 9, 6, 8, 7], [9, 9, 6, 6, 8, 8], [6, 6, 9, 9, 7, 7], [7, 8, 9, 6, 8, 9],
];

/** 20 组梅花数字。 */
const NUM_CASES = [
  [1, 1], [8, 8], [17, 23], [3, 5], [64, 9], [12, 34], [99, 7], [2, 6], [25, 13], [7, 8],
  [33, 44], [5, 12], [10, 10], [81, 3], [6, 17], [19, 28], [4, 9], [56, 21], [11, 22], [13, 29],
];

/* ------------------------------------------------ 通用逐函数对拍（≥15 个） */

/**
 * 每个函数 20 组输入。input(i) 返回该次调用的实参数组。
 * 所有输入都是确定的字面量，不依赖当前时间/随机数，保证可复现。
 */
const FUNCTIONS = {
  // —— 紫微（详见下方 ziwei 专项） ——
  ziweiYunXian: {
    label: '紫微运限（大限/流年/流月 + 四化）',
    input: (i) => [DATE_CASES[i], { year: 1995 + i * 2, month: (i % 12) + 1, day: (i % 27) + 1, hour: HOURS[i] }],
  },
  // —— 西学（本命 / 古典推运 / 星空） ——
  paipanXingpan: {
    label: '西方本命盘',
    input: (i) => [{ ...DATE_CASES[i], lat: 20 + i * 1.7, lonEast: 95 + i * 2.3, utcOffsetHours: i % 5 === 0 ? -5 : 8 }],
  },
  guDianTuiYun: {
    label: '古典推运（小限 + 法达）',
    input: (i) => [{ year: DATE_CASES[i].year, month: DATE_CASES[i].month, day: DATE_CASES[i].day, hour: HOURS[i], lat: 20 + i * 1.7, lonEast: 95 + i * 2.3, utcOffsetHours: 8, at: new Date(Date.UTC(2000 + i, i % 12, 10, 12)) }],
  },
  listFirdariaPeriods: { label: '法达星限表', input: (i) => [i % 2 === 0, 1950 + i * 3] },
  listProfectionYears: { label: '小限年表', input: (i) => [i % 12, 1950 + i * 3, i % 5, 40 + i] },
  shouyeTianxiang: {
    label: '守夜天象',
    input: (i) => [new Date(Date.UTC(2005 + i, i % 12, (i % 27) + 1, i % 24)), 7 + i * 3],
  },
  // —— 印度 ——
  paipanVedic: {
    label: '印度吠陀盘',
    input: (i) => [{ ...DATE_CASES[i], lat: 8 + i * 2.1, lonEast: 70 + i * 2, utcOffsetHours: 5.5 }],
  },
  // —— 八字 ——
  paiBazi: { label: '八字四柱', input: (i) => [DATE_CASES[i]] },
  baziExtra: { label: '八字神煞/关系/纳音合集', input: (i) => [DATE_CASES[i]] },
  baziShenSha: { label: '八字神煞', input: (i) => [DATE_CASES[i]] },
  baziRelations: { label: '八字刑冲合害', input: (i) => [DATE_CASES[i]] },
  tenGod: { label: '十神', input: (i) => [['甲', '乙', '丙', '丁', '戊', '己', '庚', '辛', '壬', '癸'][i % 10], ['癸', '壬', '辛', '庚', '己', '戊', '丁', '丙', '乙', '甲'][(i * 3) % 10]] },
  liuNianGanZhiSequence: { label: '流年干支序列', input: (i) => [1900 + i * 6, 5 + i * 4] },
  // —— 奇门 ——
  paiQiMen: { label: '奇门遁甲', input: (i) => [DATE_CASES[i]] },
  // —— 梅花 ——
  meiHuaByNumbers: { label: '梅花易数（数字）', input: (i) => NUM_CASES[i] },
  meiHuaByTime: { label: '梅花易数（时间）', input: (i) => [new Date(Date.UTC(DATE_CASES[i].year, DATE_CASES[i].month - 1, DATE_CASES[i].day, HOURS[i], (i * 11) % 60))] },
  // —— 六爻 ——
  paipan: { label: '六爻装卦', input: (i) => [{ ...DATE_CASES[i], yaoValues: YAO_CASES[i], question: '校验用' }] },
  analyzeNajia: {
    label: '六爻纳甲分析',
    input: (i) => [null, { monthZhi: ['寅', '卯', '辰', '巳', '午', '未', '申', '酉', '戌', '亥', '子', '丑'][i % 12], dayZhi: ['子', '丑', '寅', '卯', '辰', '巳', '午', '未', '申', '酉', '戌', '亥'][(i * 5) % 12], sex: GENDERS[i % 2] }],
    /** args[0] 是卦盘：两侧各用自家 paipan 装一次，避免把 paipan 的差异混进来判 analyzeNajia */
    needsPan: true,
  },
  getFullNajia: {
    label: '纳甲全表',
    input: (i) => [['乾', '兑', '离', '震', '巽', '坎', '艮', '坤'][i % 8], ['坤', '艮', '坎', '巽', '震', '离', '兑', '乾'][(i * 3) % 8]],
  },
  calcShenSha: {
    label: '六爻神煞',
    input: (i) => [
      ['甲', '乙', '丙', '丁', '戊', '己', '庚', '辛', '壬', '癸'][i % 10],
      ['子', '丑', '寅', '卯', '辰', '巳', '午', '未', '申', '酉', '戌', '亥'][(i * 7) % 12],
      ['寅', '卯', '辰', '巳', '午', '未', '申', '酉', '戌', '亥', '子', '丑'][(i * 5) % 12],
    ],
  },
  calcGuaShen: { label: '卦身', input: (i) => [(i % 6) + 1, i % 2 === 0 ? '阳' : '阴'] },
  castByTime: { label: '时间起卦', input: (i) => [new Date(Date.UTC(DATE_CASES[i].year, DATE_CASES[i].month - 1, DATE_CASES[i].day, HOURS[i], (i * 13) % 60))] },
  // —— 历法 / 星次 ——
  getDayCalendar: { label: '日历（农历/节气）', input: (i) => [DATE_CASES[i]] },
  solarToSiZhu: { label: '阳历转四柱', input: (i) => [DATE_CASES[i]] },
  resolveTime: {
    label: '时间口径解析（真太阳时/夏令时）',
    input: (i) => [{ ...DATE_CASES[i], city: ['沈阳', '北京', '上海', '广州', '乌鲁木齐', '成都'][i % 6] }],
  },
  mansionSnapshot: {
    label: '二十八宿快照',
    input: (i) => [new Date(Date.UTC(2000 + i, i % 12, (i % 27) + 1, i % 24)), i % 2 === 0 ? 'eqd' : 'ect'],
  },
  riChan: { label: '日躔', input: (i) => [new Date(Date.UTC(2000 + i, i % 12, (i % 27) + 1, i % 24)), i % 2 === 0 ? 'eqd' : 'ect'] },
  yueLi: { label: '月离', input: (i) => [new Date(Date.UTC(2000 + i, i % 12, (i % 27) + 1, i % 24)), i % 2 === 0 ? 'eqd' : 'ect'] },
  zhiSu: { label: '值宿', input: (i) => [new Date(Date.UTC(2000 + i, i % 12, (i % 27) + 1, i % 24))] },
};

/* ------------------------------------------------------------ 主流程 */

const failures = [];
function fail(scope, detail) {
  failures.push({ scope, detail });
  if (!QUIET) {
    console.log(`  ✗ ${scope}`);
    for (const d of detail.slice(0, 4)) console.log(`      ${d}`);
    if (detail.length > 4) console.log(`      … 另有 ${detail.length - 4} 处`);
  }
}

const cleanupList = [];
try {
  if (!existsSync(VENDOR)) throw new Error(`找不到 vendor：${VENDOR}`);
  if (!QUIET) console.log('[check-vendor] 编译参考实现（liuyao-core/src/index.ts）…');
  const refBuild = await buildReference();
  cleanupList.push(refBuild.cleanup);
  const ref = refBuild.mod;
  if (!QUIET) console.log('[check-vendor] 载入 vendor bundle…');
  const cand = await import(pathToFileURL(VENDOR).href);

  /* 1. 导出面：vendor 不得少导出任何 src 导出（否则页面会拿到 undefined） */
  const refKeys = Object.keys(ref).sort();
  const candKeys = new Set(Object.keys(cand));
  const missing = refKeys.filter((k) => !candKeys.has(k));
  if (missing.length) fail('导出面', [`缺失导出：${missing.join(', ')}`]);
  else if (!QUIET) console.log(`[check-vendor] 导出面：${refKeys.length} 个导出全部存在`);

  /* 2. 逐函数 × 20 组输入，逐字段对拍 */
  const entries = Object.entries(FUNCTIONS).filter(([k]) => !k.startsWith('_'));
  if (entries.length < 15) throw new Error(`对拍函数只有 ${entries.length} 个，少于 15 个下限`);
  let comparedCalls = 0;
  let comparedFields = 0;
  for (const [name, spec] of entries) {
    if (typeof ref[name] !== 'function' || typeof cand[name] !== 'function') {
      fail(name, [`函数不存在（ref=${typeof ref[name]} vendor=${typeof cand[name]}）`]);
      continue;
    }
    const bad = [];
    for (let i = 0; i < 20; i++) {
      const args = spec.input(i);
      let argsRef = args, argsCand = args;
      if (spec.needsPan) {
        // 两侧各用自家 paipan 装盘：把差异归因到 analyzeNajia 本身，而非 paipan
        const panIn = { ...DATE_CASES[i], yaoValues: YAO_CASES[i] };
        argsRef = [ref.paipan(panIn), ...args.slice(1)];
        argsCand = [cand.paipan(panIn), ...args.slice(1)];
      }
      let ra, rb;
      try { ra = ref[name](...argsRef); } catch (e) { ra = { __throw: String(e && e.message) }; }
      try { rb = cand[name](...argsCand); } catch (e) { rb = { __throw: String(e && e.message) }; }
      comparedCalls++;
      const d = diff(stable(ra), stable(rb), `${name}#${i}`);
      if (d.length) { bad.push(...d); if (bad.length >= 200) break; }
      else {
        // 计数：把每个调用展开的叶子字段数累加，用 JSON 长度近似衡量覆盖量
        comparedFields += JSON.stringify(stable(ra)).length > 0 ? countLeaves(ra) : 0;
      }
    }
    if (bad.length) fail(`${name}（${spec.label}）`, bad);
    else if (!QUIET) console.log(`[check-vendor] ${name.padEnd(22)} 20/20 一致（${spec.label}）`);
  }

  /* 3. 紫微专项：20 命例逐宫逐星 + 分布合理性 */
  const ZW = [];
  for (let i = 0; i < 20; i++) ZW.push(DATE_CASES[i]);
  let zwBad = 0, palacesChecked = 0, starsChecked = 0;
  let maxAdj = 0, minMinorTotal = Infinity;
  for (let i = 0; i < ZW.length; i++) {
    const inp = ZW[i];
    const a = ref.paiZiwei(inp), b = cand.paiZiwei(inp);
    palacesChecked += a.palaces.length;
    starsChecked += a.palaces.reduce((n, p) => n + p.majorStars.length + p.minorStars.length + p.adjectiveStars.length, 0);
    const d = diff(stable(a), stable(b), `ziwei#${i}`);
    if (d.length) { zwBad++; fail(`paiZiwei#${i} ${inp.year}-${inp.month}-${inp.day} ${inp.hour}时`, d); continue; }
    if (a.palaces.length !== 12) fail(`paiZiwei#${i}`, [`宫位数 ${a.palaces.length} ≠ 12`]);
    for (const p of a.palaces) {
      maxAdj = Math.max(maxAdj, p.adjectiveStars.length);
      if (!p.name || !p.ganZhi) fail(`paiZiwei#${i} 宫${p.index}`, ['宫名/宫干支为空']);
      if (p.isEmpty !== (p.majorStars.length === 0)) fail(`paiZiwei#${i} 宫${p.index}`, ['isEmpty 与主星数不符']);
      for (const s of [...p.majorStars, ...p.minorStars, ...p.adjectiveStars]) {
        if (!s.name) fail(`paiZiwei#${i} 宫${p.index}`, ['无名星曜']);
      }
    }
    const minorTotal = a.palaces.reduce((n, p) => n + p.minorStars.length, 0);
    minMinorTotal = Math.min(minMinorTotal, minorTotal);
    // 命宫/身宫必须落在合法宫位且各自唯一
    const soul = a.palaces.filter((p) => p.isSoulPalace);
    const body = a.palaces.filter((p) => p.isBodyPalace);
    if (soul.length !== 1) fail(`paiZiwei#${i}`, [`命宫数为 ${soul.length}`]);
    if (body.length !== 1) fail(`paiZiwei#${i}`, [`身宫数为 ${body.length}`]);
    if (soul[0] && soul[0].earthlyBranch !== a.soulBranch) fail(`paiZiwei#${i}`, ['soulBranch 与命宫地支不符']);
    if (body[0] && body[0].earthlyBranch !== a.bodyBranch) fail(`paiZiwei#${i}`, ['bodyBranch 与身宫地支不符']);
  }
  // 分布合理性：误裁 locale 时杂曜会全部挤进宫（历史故障为单宫 17~18 颗）
  if (maxAdj > 12) fail('ziwei 分布合理性', [`单宫杂曜最多 ${maxAdj} 颗（>12，疑似落宫错乱）`]);
  if (minMinorTotal < 12) fail('ziwei 分布合理性', [`辅星总数最少 ${minMinorTotal} 颗（<12，疑似丢失）`]);
  if (!QUIET) console.log(`[check-vendor] 紫微专项：20 命例 / ${palacesChecked} 宫 / ${starsChecked} 颗星逐字段对拍，${20 - zwBad} 命例一致`);

  /* 4. 结论 */
  if (failures.length) {
    console.log(`\n[check-vendor] ❌ ${failures.length} 组不一致`);
    for (const f of failures) {
      console.log(`  - ${f.scope}（${f.detail.length} 处${f.detail.length >= 200 ? '+' : ''}）`);
    }
    process.exitCode = 1;
  } else {
    console.log(`\n[check-vendor] ✅ 全部一致：${comparedCalls} 次调用 / ${entries.length} 个函数 / 20 个紫微命例 / 累计 ${comparedFields.toLocaleString('en-US')} 个叶子字段，参考侧与 vendor 逐字段相同`);
  }
} catch (e) {
  console.error(`[check-vendor] 执行失败：${e && e.stack ? e.stack : e}`);
  process.exitCode = 1;
} finally {
  for (const fn of cleanupList) { try { fn(); } catch {} }
}

/** 统计对象叶子字段数，用于报告覆盖量。 */
function countLeaves(v, n = 0) {
  if (v === null || typeof v !== 'object') return n + 1;
  if (Array.isArray(v)) { for (const x of v) n = countLeaves(x, n); return n; }
  for (const k of Object.keys(v)) n = countLeaves(v[k], n);
  return n;
}
