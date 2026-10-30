// 爻级日破/暗动状态矩阵（PRE vs POST）
//
// 目的：直接回答董事长风险二的第 2、4 问
//   Q2 riPo 新增与 anDong 移除是否严格对应同一批爻
//   Q4 2,913 / 571 的分类关系，是否有重复计数
//
// 做法：枚举 4096 mask × 12 月令 × 12 日辰 = 589,824 次 analyzeNajia（不跑 verdict），
//       逐爻比对 PRE/POST 的 lingTai / yuePo / riChong / anDong / riPo，
//       统计每个状态转移的爻数，并按 PRE lingTai 分桶。
//
// 与判读级的区别：这里是「爻」为单位，判读级是「盘 × 域」为单位。
//   同一爻在 8 个域里可能被多次引用，爻级统计不带域权重，是去重后的物理事实。

import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import fs from 'node:fs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '../../../..');

globalThis.document = {
  addEventListener() {}, querySelector: () => null, getElementById: () => null, querySelectorAll: () => [],
  head: { appendChild() {} },
  body: { appendChild() {}, classList: { add() {}, remove() {} } },
  createElement: () => ({ style: {}, classList: { add() {}, remove() {} }, appendChild() {}, setAttribute() {} }),
};
globalThis.window = globalThis;
globalThis.localStorage = { getItem: () => null, setItem() {}, removeItem() {} };

const MONTH_ZHI = ['寅', '卯', '辰', '巳', '午', '未', '申', '酉', '戌', '亥', '子', '丑'];
const DAY_GAN = ['甲', '乙', '丙', '丁', '戊', '己', '庚', '辛', '壬', '癸'];

const VENDOR_PRE = '/tmp/vendor-pre.mjs';
const VENDOR_POST = path.join(ROOT, 'app/vendor/liuyao-core.js');

const corePre = await import(pathToFileURL(VENDOR_PRE).href + '?t=' + Date.now());
const corePost = await import(pathToFileURL(VENDOR_POST).href + '?t=' + Date.now());

const MASKVALS = [];
for (let mask = 0; mask < 4096; mask++) {
  const v = [];
  for (let i = 0; i < 6; i++) v.push([6, 7, 8, 9][(mask >> (i * 2)) & 3]);
  MASKVALS.push(v);
}

// 状态转移键：PRE 的 (lingTai, yuePo, riChong, anDong, riPo) → POST 的
const trans = new Map();          // key -> count
const transByPreLingTai = new Map(); // `${preLingTai}|${key}` -> count
let yaoTotal = 0;

// 重点四类
const T = {
  riPoAdded: 0,            // PRE riPo=false → POST riPo=true
  riPoAddedFromAnDong: 0,  // 其中 PRE anDong=true（即 anDong 移除 + riPo 新增 同一爻）
  riPoAddedFromIdle: 0,    // 其中 PRE anDong=false（原本休态待定）
  anDongRemoved: 0,        // PRE anDong=true → POST anDong=false
  anDongRemovedToRiPo: 0,  // 其中 POST riPo=true
  anDongRemovedToNeither: 0, // 其中 POST riPo=false（理论应为 0）
  riPoRemoved: 0,          // PRE riPo=true → POST riPo=false（理论应为 0）
  bothFlagged: 0,          // PRE 或 POST 任一侧 anDong 与 riPo 同时为真（理论恒 0）
  preRiChongIdle: 0,       // PRE riChong=true 且 anDong=false 且 riPo=false（「休态待定」）
};

// 按 PRE lingTai 分桶的 riPo 新增
const riPoAddedByPreLingTai = {};
const anDongRemovedByPreLingTai = {};
// 按 POST lingTai 分桶
const riPoAddedByPostLingTai = {};

// 六冲对分布（冲的是哪一对）
const LIU_CHONG_PAIRS = { 子: '午', 午: '子', 丑: '未', 未: '丑', 寅: '申', 申: '寅', 卯: '酉', 酉: '卯', 辰: '戌', 戌: '辰', 巳: '亥', 亥: '巳' };
const riPoAddedByPair = {};

const t0 = Date.now();
for (let mi = 0; mi < 12; mi++) {
  const mz = MONTH_ZHI[mi];
  for (let dj = 0; dj < 12; dj++) {
    const dz = MONTH_ZHI[dj];
    for (let mask = 0; mask < 4096; mask++) {
      const pan = corePre.paipan({ yaoValues: MASKVALS[mask], gender: '男', question: 'x', year: 2026, month: 10, day: 26, hour: 17, minute: 35 });
      pan.siZhu.monthGanZhi = pan.siZhu.monthGanZhi[0] + mz;
      pan.siZhu.dayGanZhi = DAY_GAN[(mz.charCodeAt(0) + dz.charCodeAt(0)) % 10] + dz;
      const a = corePre.analyzeNajia(pan, { monthZhi: mz, dayZhi: dz, sex: '男' });
      const b = corePost.analyzeNajia(pan, { monthZhi: mz, dayZhi: dz, sex: '男' });
      const mb = new Map(b.lines.map((o) => [o.pos, o]));
      for (const la of a.lines) {
        const lb = mb.get(la.pos); if (!lb) continue;
        const sa = la.state || {}, sb = lb.state || {};
        yaoTotal++;
        if (sa.anDong && sa.riPo) T.bothFlagged++;
        if (sb.anDong && sb.riPo) T.bothFlagged++;
        if (sa.riChong && !sa.anDong && !sa.riPo) T.preRiChongIdle++;

        const key = `${sa.lingTai}|${!!sa.yuePo}|${!!sa.riChong}|${!!sa.anDong}|${!!sa.riPo}→${sb.lingTai}|${!!sb.yuePo}|${!!sb.riChong}|${!!sb.anDong}|${!!sb.riPo}`;
        trans.set(key, (trans.get(key) || 0) + 1);
        const k2 = `${sa.lingTai}|${key}`;
        transByPreLingTai.set(k2, (transByPreLingTai.get(k2) || 0) + 1);

        if (!sa.riPo && sb.riPo) {
          T.riPoAdded++;
          riPoAddedByPreLingTai[sa.lingTai] = (riPoAddedByPreLingTai[sa.lingTai] || 0) + 1;
          riPoAddedByPostLingTai[sb.lingTai] = (riPoAddedByPostLingTai[sb.lingTai] || 0) + 1;
          const pair = `${la.yao.zhi}/${LIU_CHONG_PAIRS[la.yao.zhi]}`;
          riPoAddedByPair[pair] = (riPoAddedByPair[pair] || 0) + 1;
          if (sa.anDong) T.riPoAddedFromAnDong++;
          else T.riPoAddedFromIdle++;
        }
        if (sa.anDong && !sb.anDong) {
          T.anDongRemoved++;
          anDongRemovedByPreLingTai[sa.lingTai] = (anDongRemovedByPreLingTai[sa.lingTai] || 0) + 1;
          if (sb.riPo) T.anDongRemovedToRiPo++;
          else T.anDongRemovedToNeither++;
        }
        if (sa.riPo && !sb.riPo) T.riPoRemoved++;
      }
    }
  }
  process.stderr.write(`[${mi + 1}/12] ${mz} 月 爻数 ${yaoTotal} 已用 ${((Date.now() - t0) / 1000).toFixed(0)}s\n`);
}

// 排序输出
const sortObj = (o) => Object.fromEntries(Object.entries(o).sort((x, y) => y[1] - x[1]));
const topTrans = [...trans.entries()].sort((x, y) => y[1] - x[1]).slice(0, 40);

const out = {
  space: { masks: 4096, months: 12, days: 12, analyses: 589824, yaoRecords: yaoTotal },
  elapsedSec: Math.round((Date.now() - t0) / 1000),
  T,
  riPoAddedByPreLingTai: sortObj(riPoAddedByPreLingTai),
  riPoAddedByPostLingTai: sortObj(riPoAddedByPostLingTai),
  anDongRemovedByPreLingTai: sortObj(anDongRemovedByPreLingTai),
  riPoAddedByPair: sortObj(riPoAddedByPair),
  transitionsTop40: topTrans.map(([k, v]) => ({ key: k, count: v })),
};

const outPath = path.join(ROOT, 'tools/score-verify-v2/l1-review/evidence/yao-ridiff-matrix.json');
fs.writeFileSync(outPath, JSON.stringify(out, null, 2));

console.log('════ 爻级日破/暗动状态矩阵 ════');
console.log(`空间 4096 mask × 12 月 × 12 日 = 589,824 次排盘 / ${yaoTotal} 条爻记录，耗时 ${out.elapsedSec}s`);
console.log('');
console.log('── 重点四类 ──');
console.log(`  riPo 新增（false→true）          ${T.riPoAdded}`);
console.log(`    其中 PRE anDong=true           ${T.riPoAddedFromAnDong}   ← 暗动移除 + 日破新增 同一爻`);
console.log(`    其中 PRE anDong=false          ${T.riPoAddedFromIdle}   ← 原本「休态待定」归入日破`);
console.log(`  anDong 移除（true→false）        ${T.anDongRemoved}`);
console.log(`    其中 POST riPo=true            ${T.anDongRemovedToRiPo}`);
console.log(`    其中 POST riPo=false           ${T.anDongRemovedToNeither}   ← 理论应为 0`);
console.log(`  riPo 移除（true→false）          ${T.riPoRemoved}   ← 理论应为 0`);
console.log(`  anDong 与 riPo 同时为真（任一侧）${T.bothFlagged}   ← 理论恒 0（严格互斥）`);
console.log(`  PRE「日冲但休态待定」爻          ${T.preRiChongIdle}   ← 本批第二项改动的直接对象`);
console.log('');
console.log('── riPo 新增：按 PRE lingTai ──');
for (const [k, v] of Object.entries(out.riPoAddedByPreLingTai)) console.log(`  ${k.padEnd(4)} ${v}`);
console.log('── riPo 新增：按 POST lingTai ──');
for (const [k, v] of Object.entries(out.riPoAddedByPostLingTai)) console.log(`  ${k.padEnd(4)} ${v}`);
console.log('── anDong 移除：按 PRE lingTai ──');
for (const [k, v] of Object.entries(out.anDongRemovedByPreLingTai)) console.log(`  ${k.padEnd(4)} ${v}`);
console.log('── riPo 新增：按六冲对 ──');
for (const [k, v] of Object.entries(out.riPoAddedByPair)) console.log(`  ${k.padEnd(8)} ${v}`);
console.log('');
console.log('── 状态转移 Top 20 ──');
console.log('  PRE(lingTai|yuePo|riChong|anDong|riPo) → POST(...)');
for (const [key, count] of topTrans.slice(0, 20)) console.log(`  ${String(count).padStart(7)}  ${key}`);
console.log('');
console.log(`已写出 ${outPath}`);
