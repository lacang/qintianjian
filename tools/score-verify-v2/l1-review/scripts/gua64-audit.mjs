// 64 卦六冲/六合 独立核对表 + verdict 实际触发验证（L1 复核 P0-1）
//
// 独立性声明：
//   六冲/六合判定**完全不读取**代码名单，走古法原始定义：
//     ① 六爻纳甲地支取自本文件手写京房纳甲表（NAJIA_INDEP，纳甲口诀，独立于
//        mingpan / tsumugi / constants.ts 任何代码数据）；
//     ② 六冲 = 初四/二五/三上 三对地支全冲（子午/丑未/寅申/卯酉/辰戌/巳亥）；
//     ③ 六合 = 三对地支全合（子丑/寅亥/卯戌/辰酉/巳申/午未）。
//   推导结果再与名单、specialType、verdict 实测触发三方对照。
//
// 概念区分（董事长特别指出）：
//   · 卦体分类：整卦六爻是否构成六冲/六合（②③）
//   · 世应关系：世爻与应爻两支是否相冲/相合（单独列，与卦体分类独立）
//
// 三基线触发对比：
//   legacy = V2 去重前（legacy/verdict.orig.mjs）
//   v2     = V2 后、L1 前（HEAD 版 verdict，l1-review/legacy/verdict-v2.mjs）
//   cur    = L1 后（当前 app/js/verdict.js）
//
// 输出：l1-review/evidence/gua64-audit.md / .json
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '../../../..');
const OUT = path.join(ROOT, 'tools/score-verify-v2/l1-review/evidence');

globalThis.document = {
  addEventListener() {}, querySelector: () => null, getElementById: () => null, querySelectorAll: () => [],
  head: { appendChild() {} },
  body: { appendChild() {}, classList: { add() {}, remove() {} } },
  createElement: () => ({ style: {}, classList: { add() {}, remove() {} }, appendChild() {}, setAttribute() {} }),
};
globalThis.window = globalThis;
globalThis.localStorage = { getItem: () => null, setItem() {}, removeItem() {} };

const core = await import(path.join(ROOT, 'app/vendor/liuyao-core.js'));
const { judgeNajia: judgeLegacy } = await import(path.join(ROOT, 'tools/score-verify-v2/legacy/verdict.orig.mjs'));
const { judgeNajia: judgeV2 } = await import(path.join(ROOT, 'tools/score-verify-v2/l1-review/legacy/verdict-v2.mjs'));
const { judgeNajia: judgeCur } = await import(path.join(ROOT, 'app/js/verdict.js'));

// 代码名单从各版本源码解析（被测对象真实数据）
const grabLists = (file) => {
  const src = fs.readFileSync(file, 'utf8');
  const grab = (n) => {
    const m = src.match(new RegExp(`const\\s+${n}\\s*=\\s*\\[([^\\]]*)\\]`));
    if (!m) throw new Error(`未找到 ${n} in ${file}`);
    return m[1].split(',').map((s) => s.trim().replace(/^['"]|['"]$/g, '')).filter(Boolean);
  };
  return { chong: grab('LIU_CHONG_GUA'), he: grab('LIU_HE_GUA') };
};
const LISTS = {
  legacy: grabLists(path.join(ROOT, 'tools/score-verify-v2/legacy/verdict.orig.mjs')),
  v2: grabLists(path.join(ROOT, 'tools/score-verify-v2/l1-review/legacy/verdict-v2.mjs')),
  cur: grabLists(path.join(ROOT, 'app/js/verdict.js')),
};

// ---------- 独立数据：京房纳甲（手写口诀）----------
const NAJIA_INDEP = {
  乾: { inner: ['子', '寅', '辰'], outer: ['午', '申', '戌'] },
  坎: { inner: ['寅', '辰', '午'], outer: ['申', '戌', '子'] },
  艮: { inner: ['辰', '午', '申'], outer: ['戌', '子', '寅'] },
  震: { inner: ['子', '寅', '辰'], outer: ['午', '申', '戌'] },
  巽: { inner: ['丑', '亥', '酉'], outer: ['未', '巳', '卯'] },
  离: { inner: ['卯', '丑', '亥'], outer: ['酉', '未', '巳'] },
  坤: { inner: ['未', '巳', '卯'], outer: ['丑', '亥', '酉'] },
  兑: { inner: ['巳', '卯', '丑'], outer: ['亥', '酉', '未'] },
};
const CHONG_PAIRS = [['子', '午'], ['丑', '未'], ['寅', '申'], ['卯', '酉'], ['辰', '戌'], ['巳', '亥']];
const HE_PAIRS = [['子', '丑'], ['寅', '亥'], ['卯', '戌'], ['辰', '酉'], ['巳', '申'], ['午', '未']];
const isPair = (pairs, a, b) => pairs.some(([x, y]) => (x === a && y === b) || (x === b && y === a));
const isChong = (a, b) => isPair(CHONG_PAIRS, a, b);
const isHe = (a, b) => isPair(HE_PAIRS, a, b);

const DAY = { year: 2026, month: 10, day: 26, hour: 17, minute: 35 };
const panOf = (mask, day = DAY) => {
  const vals = [];
  for (let i = 0; i < 6; i++) vals.push((mask >> i) & 1 ? 7 : 8);
  return core.paipan({ yaoValues: vals, ...day, gender: '男' });
};
const panOfMoving = (baseMask, movMask, day = DAY) => {
  // baseMask: 6 位阴阳；movMask: 6 位动爻标记 → 老阳(9)/老阴(6)
  const vals = [];
  for (let i = 0; i < 6; i++) {
    const yang = (baseMask >> i) & 1;
    const moving = (movMask >> i) & 1;
    vals.push(yang ? (moving ? 9 : 7) : (moving ? 6 : 8));
  }
  return core.paipan({ yaoValues: vals, ...day, gender: '男' });
};

// ---------- 64 卦静态核对 ----------
const rows = [];
for (let mask = 0; mask < 64; mask++) {
  const pan = panOf(mask);
  const bg = pan.benGua;
  const name = bg.name;

  const indepZhi = [...NAJIA_INDEP[bg.lower].inner, ...NAJIA_INDEP[bg.upper].outer];
  const engineZhi = pan.yaoList.map((y) => y.zhi);
  const najiaMatch = indepZhi.every((z, i) => z === engineZhi[i]);

  const pairs = [0, 1, 2].map((i) => [indepZhi[i], indepZhi[i + 3]]);
  const allChong = pairs.every(([a, b]) => isChong(a, b));
  const allHe = pairs.every(([a, b]) => isHe(a, b));
  const indepType = allChong ? '六冲' : allHe ? '六合' : '';

  const shiPos = bg.shiPosition, yingPos = bg.yingPosition;
  const shiZhi = engineZhi[shiPos - 1], yingZhi = engineZhi[yingPos - 1];
  const shiYingChong = isChong(shiZhi, yingZhi);
  const shiYingHe = isHe(shiZhi, yingZhi);

  const inList = (L) => ({ chong: L.chong.includes(name), he: L.he.includes(name) });
  const tl = inList(LISTS.legacy), tv = inList(LISTS.v2), tc = inList(LISTS.cur);

  // 实测触发：love 本卦规则带去重闸门（六冲需 !世应冲、六合需 !世应合）
  const runLove = (fn) => {
    const v = fn(pan, 'love');
    const txt = v.signals.map((s) => s.text).join('｜');
    return { chong: /本卦是六冲卦/.test(txt), he: /本卦是六合卦/.test(txt), score: v.score };
  };
  const rl = runLove(judgeLegacy), rv = runLove(judgeV2), rc = runLove(judgeCur);

  // people 行人六冲（无去重闸门）
  const runPeople = (fn) => {
    const v = fn(pan, 'people');
    const txt = v.signals.map((s) => s.text).join('｜');
    return { chong: /六冲/.test(txt), score: v.score };
  };
  const pl = runPeople(judgeLegacy), pv = runPeople(judgeV2), pc = runPeople(judgeCur);

  rows.push({
    mask, name, upper: bg.upper, lower: bg.lower, palace: bg.gong, shiPos, yingPos,
    guaXu: bg.guaXu, isGuiHun: bg.isGuiHun, isYouHun: bg.isYouHun, isBaChun: bg.isBaChun,
    engineZhi, indepZhi, najiaMatch, pairs, allChong, allHe, indepType,
    metaType: bg.specialType || '',
    listLegacy: tl, listV2: tv, listCur: tc,
    shiZhi, yingZhi, shiYingChong, shiYingHe,
    love: { legacy: rl, v2: rv, cur: rc },
    people: { legacy: pl, v2: pv, cur: pc },
  });
}

// ---------- 变卦走向规则验证（六冲变六合 +2 / 六合变六冲 -2）----------
// 枚举 64 本卦 × 63 种动爻组合，看规则是否严格按名单触发（该规则无去重闸门）
const bianRows = [];
let bianMismatch = 0;
const bianDetail = [];
for (let baseMask = 0; baseMask < 64; baseMask++) {
  const basePan = panOf(baseMask);
  const benName = basePan.benGua.name;
  for (let movMask = 1; movMask < 64; movMask++) {
    const pan = panOfMoving(baseMask, movMask);
    const ben = pan.benGua.name, bian = pan.bianGua ? pan.bianGua.name : null;
    if (!bian) continue;
    const expectPlus = LISTS.cur.chong.includes(ben) && LISTS.cur.he.includes(bian);
    const expectMinus = LISTS.cur.he.includes(ben) && LISTS.cur.chong.includes(bian);
    const v = judgeCur(pan, 'love');
    const txt = v.signals.map((s) => s.text).join('｜');
    const gotPlus = /六冲变六合/.test(txt), gotMinus = /六合变六冲/.test(txt);
    if (gotPlus !== expectPlus || gotMinus !== expectMinus) {
      bianMismatch++;
      if (bianDetail.length < 10) bianDetail.push({ ben, bian, movMask, expectPlus, expectMinus, gotPlus, gotMinus });
    }
    if (expectPlus || expectMinus) bianRows.push({ ben, bian, plus: expectPlus, minus: expectMinus });
  }
}

// ---------- 汇总核验 ----------
const indepChong = rows.filter((r) => r.indepType === '六冲').map((r) => r.name);
const indepHe = rows.filter((r) => r.indepType === '六合').map((r) => r.name);
const eq = (a, b) => a.length === b.length && [...a].sort().every((x, i) => x === [...b].sort()[i]);
const curChong = rows.filter((r) => r.listCur.chong).map((r) => r.name);
const curHe = rows.filter((r) => r.listCur.he).map((r) => r.name);
const metaChong = rows.filter((r) => r.metaType === '六冲').map((r) => r.name);
const metaHe = rows.filter((r) => r.metaType === '六合').map((r) => r.name);

// 触发一致性：严格按「在名单 && 闸门未抑制」判据
const triggerCheck = rows.every((r) => {
  const expectLoveChong = r.listCur.chong && !r.shiYingChong;
  const expectLoveHe = r.listCur.he && !r.shiYingHe;
  return r.love.cur.chong === expectLoveChong && r.love.cur.he === expectLoveHe
    && r.people.cur.chong === r.listCur.chong;
});

const checks = {
  najiaTableAllMatch: rows.every((r) => r.najiaMatch),
  indepCount: { chong: indepChong.length, he: indepHe.length },
  indepEqualsCurList: { chong: eq(indepChong, curChong), he: eq(indepHe, curHe) },
  indepEqualsMeta: { chong: eq(indepChong, metaChong), he: eq(indepHe, metaHe) },
  overlapChongHe: rows.filter((r) => r.indepType === '六冲' && r.indepType === '六合').length,
  bothInCurList: rows.filter((r) => r.listCur.chong && r.listCur.he).map((r) => r.name),
  // 六冲卦世应是否必然相冲；六合卦世应是否必然相合（决定去重闸门是否永久抑制本卦规则）
  chongGuaShiYingAllChong: rows.filter((r) => r.listCur.chong).every((r) => r.shiYingChong),
  heGuaShiYingAllHe: rows.filter((r) => r.listCur.he).every((r) => r.shiYingHe),
  triggerConsistent: triggerCheck,
  bianRuleMismatch: bianMismatch,
  bianRuleCases: bianRows.length,
};

// ---------- 输出 Markdown ----------
const L = [];
L.push('# 64 卦六冲 / 六合 独立核对表');
L.push('');
L.push('**独立性**：六冲/六合由本脚本手写京房纳甲表（纳甲口诀，独立于任何代码数据）+');
L.push('古法「三对爻全冲/全合」定义推导，不读取代码名单；再与名单、specialType、verdict 实测三方对照。');
L.push('');
L.push('**概念区分**：「卦体分类」= 整卦三对爻是否全冲/全合；「世应关系」= 世支与应支是否冲/合。');
L.push('两者独立：世应相冲不等于卦体六冲（例如 46 个普通卦中多卦世应相冲/相合）。');
L.push('');
L.push('## 汇总核验');
L.push('');
L.push('| 核验项 | 结果 |');
L.push('|---|---|');
L.push(`| 手写纳甲表 vs 引擎排盘地支（64 卦 × 6 爻 = 384 爻） | ${checks.najiaTableAllMatch ? '全部一致 ✅' : '有不一致 ❌'} |`);
L.push(`| 独立推导六冲/六合卦数 | ${checks.indepCount.chong} / ${checks.indepCount.he} |`);
L.push(`| 独立推导 vs 当前 LIU_CHONG_GUA / LIU_HE_GUA | ${checks.indepEqualsCurList.chong && checks.indepEqualsCurList.he ? '集合完全相同 ✅' : '不一致 ❌'} |`);
L.push(`| 独立推导 vs getGuaMeta.specialType | ${checks.indepEqualsMeta.chong && checks.indepEqualsMeta.he ? '集合完全相同 ✅' : '不一致 ❌'} |`);
L.push(`| 六冲与六合互斥 | ${checks.overlapChongHe === 0 && checks.bothInCurList.length === 0 ? '互斥 ✅' : '重叠 ❌'} |`);
L.push(`| 六冲卦世应是否必然相冲 | ${checks.chongGuaShiYingAllChong ? '10/10 必然相冲 ✅' : '存在不冲 ❌'} |`);
L.push(`| 六合卦世应是否必然相合 | ${checks.heGuaShiYingAllHe ? '8/8 必然相合 ✅' : '存在不合 ❌'} |`);
L.push(`| verdict 触发是否符合「在名单 && 闸门未抑制」 | ${checks.triggerConsistent ? '64 卦全部一致 ✅' : '有不一致 ❌'} |`);
L.push(`| 变卦走向规则（六冲变六合/六合变六冲）枚举 64×63 | ${checks.bianRuleMismatch === 0 ? `全部一致 ✅（命中 ${checks.bianRuleCases} 例）` : `不一致 ${checks.bianRuleMismatch} 例 ❌`} |`);
L.push('');
L.push('> **重要实际行为**：love 域本卦六冲 −1 / 六合 +1 两条规则带 V2 去重闸门');
L.push('> （六冲需 `!世应相冲`、六合需 `!世应相合`）。由上表两行可知：六冲卦世应必然相冲、');
L.push('> 六合卦世应必然相合，因此这两条规则对「真正的六冲/六合卦」**恒不触发**（死代码），');
L.push('> 其效果由世应相冲 −2 / 相合 +1 承担。名单修正对 love 的实际影响只通过「变卦走向」');
L.push('> 规则（+2/−2，无闸门）体现；对 people 行人六冲（无闸门）直接体现。');
L.push('');
L.push('## 六冲卦（10）');
L.push('');
L.push('| 卦名 | 上下卦 | 宫 | 世应 | 六爻地支（初→上） | 初四/二五/三上 | 世支·应支 | 世应关系 | V2前触发 love | V2后·L1前 | L1后 love | L1后 people |');
L.push('|---|---|---|---|---|---|---|---|---|---|---|---|');
const fmt = (b) => (b ? '●' : '—');
for (const r of rows.filter((x) => x.listCur.chong)) {
  L.push(`| ${r.name} | ${r.upper}上${r.lower}下 | ${r.palace} | ${r.shiPos}/${r.yingPos} | ${r.engineZhi.join('')} | ${r.pairs.map((p) => p.join('')).join(' / ')} 全冲 | ${r.shiZhi}·${r.yingZhi} | ${r.shiYingChong ? '冲' : r.shiYingHe ? '合' : '无'} | ${fmt(r.love.legacy.chong)} | ${fmt(r.love.v2.chong)} | ${fmt(r.love.cur.chong)} | ${fmt(r.people.cur.chong)} |`);
}
L.push('');
L.push('## 六合卦（8）');
L.push('');
L.push('| 卦名 | 上下卦 | 宫 | 世应 | 六爻地支 | 三对关系 | 世支·应支 | 世应关系 | V2前触发 love | V2后·L1前 | L1后 love |');
L.push('|---|---|---|---|---|---|---|---|---|---|---|');
for (const r of rows.filter((x) => x.listCur.he)) {
  L.push(`| ${r.name} | ${r.upper}上${r.lower}下 | ${r.palace} | ${r.shiPos}/${r.yingPos} | ${r.engineZhi.join('')} | ${r.pairs.map((p) => p.join('')).join(' / ')} 全合 | ${r.shiZhi}·${r.yingZhi} | ${r.shiYingChong ? '冲' : r.shiYingHe ? '合' : '无'} | ${fmt(r.love.legacy.he)} | ${fmt(r.love.v2.he)} | ${fmt(r.love.cur.he)} |`);
}
L.push('');
L.push('## 名单变更涉及的 5 个卦（旧名单误列/遗漏，需单列观察）');
L.push('');
L.push('| 卦名 | 卦体（独立推导） | 旧名单 | 新名单 | 世应关系 | 说明 |');
L.push('|---|---|---|---|---|---|');
for (const n of ['火地晋', '山雷颐', '地泽临', '山火贲', '火山旅', '天地否', '天雷无妄', '雷天大壮']) {
  const r = rows.find((x) => x.name === n);
  if (!r) continue;
  const oldT = r.listLegacy.chong ? '六冲' : r.listLegacy.he ? '六合' : '—';
  const newT = r.listCur.chong ? '六冲' : r.listCur.he ? '六合' : '—';
  const reason = r.indepType === '' ? '三对爻并非全冲/全合（原名单误列）' : `独立推导确认${r.indepType}（原名单遗漏）`;
  L.push(`| ${n} | ${r.indepType || '普通卦'} | ${oldT} | ${newT} | ${r.shiYingChong ? '冲' : r.shiYingHe ? '合' : '无'} | ${reason} |`);
}
L.push('');
L.push('## 其余 46 卦（独立推导与名单均排除，展示世应关系可独立存在）');
L.push('');
L.push('| 卦名 | 上下卦 | 宫 | 世应 | 六爻地支 | 三对关系 | 世应关系 |');
L.push('|---|---|---|---|---|---|---|');
for (const r of rows.filter((x) => !x.listCur.chong && !x.listCur.he)) {
  L.push(`| ${r.name} | ${r.upper}上${r.lower}下 | ${r.palace} | ${r.shiPos}/${r.yingPos} | ${r.engineZhi.join('')} | ${r.pairs.map((p) => (isChong(...p) ? '冲' : isHe(...p) ? '合' : '—')).join(' / ')} | ${r.shiYingChong ? '冲' : r.shiYingHe ? '合' : '无'} |`);
}
L.push('');
L.push('## 变卦走向规则命中明细（L1 后，love 域，无去重闸门）');
L.push('');
L.push('| 本卦 | 变卦 | 规则 |');
L.push('|---|---|---|');
for (const b of bianRows.slice(0, 40)) L.push(`| ${b.ben} | ${b.bian} | ${b.plus ? '六冲变六合 +2' : '六合变六冲 −2'} |`);
L.push('');
if (bianRows.length > 40) L.push(`> 其余 ${bianRows.length - 40} 例略，见 JSON。`);
L.push('');

fs.mkdirSync(OUT, { recursive: true });
fs.writeFileSync(path.join(OUT, 'gua64-audit.md'), L.join('\n'));
fs.writeFileSync(path.join(OUT, 'gua64-audit.json'), JSON.stringify({
  checks, lists: LISTS, rows, bian: { total: bianRows.length, mismatch: bianMismatch, detail: bianDetail, cases: bianRows },
}, null, 1));

console.log('=== 汇总核验 ===');
console.log(JSON.stringify(checks, null, 1));
console.log('\n六冲(独立推导):', indepChong.join('、'));
console.log('六合(独立推导):', indepHe.join('、'));
console.log('\n变卦走向命中:', bianRows.length, '例，不一致:', bianMismatch);
console.log('输出:', path.join(OUT, 'gua64-audit.md'));
