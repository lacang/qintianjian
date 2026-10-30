// 导出「吉→凶」跨正负翻转明细（回答董事长风险 ②）
//
// 筛选条件：levelPre > 0 && levelPost < 0
//   levelPre = 1 或 2（小吉 / 大吉）  →  levelPost = -1 或 -2（小凶 / 大凶）
//
// 空间：4096 mask × 12 月令 × 12 日辰 × 8 域 = 4,718,592 判读
// 输出：evidence/flips-positive-to-negative.json
//       evidence/flips-positive-to-negative.txt（人读版）
//
// 每条记录列出：定位四元组、卦名、PRE/POST 分数与档位、信号差异（只列变动项）

import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import fs from 'node:fs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '../../../..');
const OUT_DIR = path.join(ROOT, 'tools/score-verify-v2/l1-review/evidence');

globalThis.document = {
  addEventListener() {}, querySelector: () => null, getElementById: () => null, querySelectorAll: () => [],
  head: { appendChild() {} },
  body: { appendChild() {}, classList: { add() {}, remove() {} } },
  createElement: () => ({ style: {}, classList: { add() {}, remove() {} }, appendChild() {}, setAttribute() {} }),
};
globalThis.window = globalThis;
globalThis.localStorage = { getItem: () => null, setItem() {}, removeItem() {} };

const DOMAINS = ['career', 'wealth', 'love', 'health', 'lost', 'decision', 'life', 'people'];
const MONTH_ZHI = ['寅', '卯', '辰', '巳', '午', '未', '申', '酉', '戌', '亥', '子', '丑'];
const DAY_GAN = ['甲', '乙', '丙', '丁', '戊', '己', '庚', '辛', '壬', '癸'];

const VENDOR_PRE = '/tmp/vendor-pre.mjs';
const VENDOR_POST = path.join(ROOT, 'app/vendor/liuyao-core.js');
const VERDICT_PRE = path.join(ROOT, 'tools/score-verify-v2/l1-review/legacy/verdict-v2.mjs');
const VERDICT_POST = path.join(ROOT, 'app/js/verdict.js');

function makeCombo(verdictPath, vendorPath, tag) {
  let src = fs.readFileSync(verdictPath, 'utf8');
  src = src.replace(/from '[^']*state\.js[^']*'/, `from './state.js?v=121'`);
  src = src.replace(/from '[^']*liuyao-core\.js[^']*'/, `from '${pathToFileURL(vendorPath).href}'`);
  const out = path.join(ROOT, 'app/js', `.tmpfl-${tag}.mjs`);
  fs.writeFileSync(out, src);
  return out;
}
const fPre = makeCombo(VERDICT_PRE, VENDOR_PRE, 'pre');
const fPost = makeCombo(VERDICT_POST, VENDOR_POST, 'post');
const modPre = await import(pathToFileURL(fPre).href + '?t=' + Date.now());
const modPost = await import(pathToFileURL(fPost).href + '?t=' + Date.now());
fs.rmSync(fPre, { force: true });
fs.rmSync(fPost, { force: true });
const corePre = await import(pathToFileURL(VENDOR_PRE).href + '?t=' + Date.now());
const corePost = await import(pathToFileURL(VENDOR_POST).href + '?t=' + Date.now());

const MASKVALS = [];
for (let mask = 0; mask < 4096; mask++) {
  const v = [];
  for (let i = 0; i < 6; i++) v.push([6, 7, 8, 9][(mask >> (i * 2)) & 3]);
  MASKVALS.push(v);
}
const BASE = (mask) => ({ yaoValues: MASKVALS[mask], gender: '男', question: 'x', year: 2026, month: 10, day: 26, hour: 17, minute: 35 });

const t0 = Date.now();
const PAN_PRE = [], PAN_POST = [];
for (let mask = 0; mask < 4096; mask++) {
  PAN_PRE.push(corePre.paipan(BASE(mask)));
  PAN_POST.push(corePost.paipan(BASE(mask)));
}
const panBuildMs = Date.now() - t0;

function clonePan(src, mz, dz) {
  const pan = { ...src, siZhu: { ...src.siZhu } };
  pan.siZhu.monthGanZhi = pan.siZhu.monthGanZhi[0] + mz;
  pan.siZhu.dayGanZhi = DAY_GAN[(mz.charCodeAt(0) + dz.charCodeAt(0)) % 10] + dz;
  return pan;
}

const S = {
  filter: 'levelPre>0 && levelPost<0',
  space: { masks: 4096, months: 12, days: 12, domains: 8, total: 4718592 },
  total: 0,
  byDomain: {},
  byFlow: {},
  byGua: {},
  byMonth: {},
  byMonthDay: {},
  byDScore: {},
  allFromRibo: 0,        // 全部由日破/暗动通道引发
  withAndong: 0,         // 同时含暗动变化
  onlyRibo: 0,           // 只有日破变化
  records: [],
};

function bump(o, k, n = 1) { o[k] = (o[k] || 0) + n; }
function hasRule(signals, id) { return (signals || []).some((s) => s.rule && s.rule.id === id); }
function sigMap(signals) {
  const m = new Map();
  for (const s of signals || []) {
    const k = `${s.w}|${s.text}`;
    m.set(k, (m.get(k) || 0) + 1);
  }
  return m;
}
function sigDiff(a, b) {
  const ma = sigMap(a), mb = sigMap(b);
  const removed = [], added = [];
  for (const [k, n] of ma) {
    const m = mb.get(k) || 0;
    if (m < n) { const [w, ...rest] = k.split('|'); for (let i = 0; i < n - m; i++) removed.push({ w: Number(w), text: rest.join('|') }); }
  }
  for (const [k, n] of mb) {
    const m = ma.get(k) || 0;
    if (m < n) { const [w, ...rest] = k.split('|'); for (let i = 0; i < n - m; i++) added.push({ w: Number(w), text: rest.join('|') }); }
  }
  return { removed, added };
}

const tRun = Date.now();
for (let mi = 0; mi < 12; mi++) {
  const mz = MONTH_ZHI[mi];
  for (let dj = 0; dj < 12; dj++) {
    const dz = MONTH_ZHI[dj];
    for (let mask = 0; mask < 4096; mask++) {
      const panPre = clonePan(PAN_PRE[mask], mz, dz);
      const panPost = clonePan(PAN_POST[mask], mz, dz);
      const anPre = corePre.analyzeNajia(panPre, { monthZhi: mz, dayZhi: dz, sex: '男' });

      for (const domain of DOMAINS) {
        const rPre = modPre.judgeNajia(panPre, domain);
        if (!(rPre.level > 0)) continue;            // 前置过滤：必须 PRE 为吉
        const rPost = modPost.judgeNajia(panPost, domain);
        if (!(rPost.level < 0)) continue;           // 必须 POST 为凶

        const riboPre = hasRule(rPre.signals, 'ribo'), riboPost = hasRule(rPost.signals, 'ribo');
        const adPre = hasRule(rPre.signals, 'andong'), adPost = hasRule(rPost.signals, 'andong');
        const chRibo = riboPre !== riboPost;
        const chAd = adPre !== adPost;

        S.total++;
        bump(S.byDomain, domain);
        bump(S.byFlow, `${rPre.level}→${rPost.level}`);
        bump(S.byGua, panPost.benGua?.name || 'unknown');
        bump(S.byMonth, mz);
        bump(S.byMonthDay, `${mz}/${dz}`);
        bump(S.byDScore, String(rPost.score - rPre.score));
        if (chRibo) S.allFromRibo++;
        if (chAd) S.withAndong++;
        if (chRibo && !chAd) S.onlyRibo++;

        const cand = (anPre.lines || []).filter((o) => o.state && o.state.riChong && !o.state.anDong);
        S.records.push({
          mask, monthZhi: mz, dayZhi: dz, domain,
          benGua: panPost.benGua?.name,
          bianGua: panPost.bianGua?.name || null,
          scorePre: rPre.score, scorePost: rPost.score, dScore: rPost.score - rPre.score,
          levelPre: rPre.level, levelPost: rPost.level,
          chRibo, chAd, riboPre, riboPost, adPre, adPost,
          preLingTaiOfCandidates: cand.map((c) => c.state.lingTai),
          sigDiff: sigDiff(rPre.signals, rPost.signals),
        });
      }
    }
  }
}
const runMs = Date.now() - tRun;

const out = { ...S, panBuildMs, runMs, elapsedMs: Date.now() - t0 };
fs.mkdirSync(OUT_DIR, { recursive: true });
fs.writeFileSync(path.join(OUT_DIR, 'flips-positive-to-negative.json'), JSON.stringify(out, null, 1), 'utf8');

// 人读版
const L = [];
L.push('吉→凶 跨正负翻转明细（levelPre>0 且 levelPost<0）');
L.push('='.repeat(72));
L.push(`总数 ${S.total} 条`);
L.push(`全部由日破/暗动通道引发：${S.allFromRibo} 条（${(S.allFromRibo / S.total * 100).toFixed(1)}%）`);
L.push(`  其中同时含暗动变化：${S.withAndong} 条`);
L.push(`  只有日破变化：${S.onlyRibo} 条`);
L.push('');
L.push('按域');
for (const [k, v] of Object.entries(S.byDomain).sort((a, b) => b[1] - a[1])) L.push(`  ${k.padEnd(10)} ${v}`);
L.push('');
L.push('按档位流转');
for (const [k, v] of Object.entries(S.byFlow).sort((a, b) => b[1] - a[1])) L.push(`  ${k.padEnd(10)} ${v}`);
L.push('');
L.push('按卦名');
for (const [k, v] of Object.entries(S.byGua).sort((a, b) => b[1] - a[1])) L.push(`  ${k.padEnd(12)} ${v}`);
L.push('');
L.push('按月令');
for (const [k, v] of Object.entries(S.byMonth).sort((a, b) => b[1] - a[1])) L.push(`  ${k} ${v}`);
L.push('');
L.push('按分数变化');
for (const [k, v] of Object.entries(S.byDScore).sort((a, b) => Number(a[0]) - Number(b[0]))) L.push(`  Δ${k.padStart(3)}  ${v}`);
L.push('');
L.push('前 30 条明细');
L.push('-'.repeat(72));
for (const r of S.records.slice(0, 30)) {
  L.push(`[${r.mask}] ${r.monthZhi}月 ${r.dayZhi}日 ${r.domain} ${r.benGua}`);
  L.push(`  ${r.scorePre}(L${r.levelPre}) → ${r.scorePost}(L${r.levelPost})  Δ${r.dScore}`);
  L.push(`  日破变化=${r.chRibo} 暗动变化=${r.chAd}`);
  for (const s of r.sigDiff.removed) L.push(`  - [${s.w}] ${s.text}`);
  for (const s of r.sigDiff.added) L.push(`  + [${s.w}] ${s.text}`);
  L.push('');
}
fs.writeFileSync(path.join(OUT_DIR, 'flips-positive-to-negative.txt'), L.join('\n'), 'utf8');

console.log(L.slice(0, 60).join('\n'));
console.log(`\npaipan 缓存 ${panBuildMs}ms，主循环 ${(runMs / 1000).toFixed(1)}s，总计 ${((Date.now() - t0) / 1000).toFixed(1)}s`);
console.log(`输出 ${OUT_DIR}/flips-positive-to-negative.json / .txt`);
