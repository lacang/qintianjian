// 补充验证：678 条口径固定日辰为「癸酉」，但月破失气还可能通过 anDong 影响判读。
//
// 数学前提：
//   月破只发生在 爻支 = 冲(月令)，且「旺+破」只在辰戌/丑未比和时出现 → 月破爻支 ∈ {辰,戌,丑,未}
//   日冲只发生在 爻支 = 冲(日辰)，且须静爻
//   两者同时成立 ⟺ 冲(月令) = 冲(日辰) ⟺ 月令 = 日辰
//
// 所以 678 条（日辰固定酉，月令遍历 12 支，月令≠酉 时不可能撞上）中 anDong 变化必为 0；
// 但「月令 = 日辰」的 12 组组合未被 678 条口径覆盖，需单独枚举确认其判读影响。
//
// 本脚本枚举 月令=日辰 的 12 组 × 4096 mask × 8 域 = 393216 判读，
// 统计：anDong 变化条数、riPo 变化条数、判读差异条数、以及这些差异能否被现有规则解释。

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

const DOMAINS = ['career', 'wealth', 'love', 'health', 'lost', 'decision', 'life', 'people'];
const MONTH_ZHI = ['寅', '卯', '辰', '巳', '午', '未', '申', '酉', '戌', '亥', '子', '丑'];
const CHONG = { 子: '午', 午: '子', 丑: '未', 未: '丑', 寅: '申', 申: '寅', 卯: '酉', 酉: '卯', 辰: '戌', 戌: '辰', 巳: '亥', 亥: '巳' };

const VENDOR_PRE = '/tmp/vendor-pre.mjs';
const VENDOR_POST = path.join(ROOT, 'app/vendor/liuyao-core.js');
const VERDICT_PRE = path.join(ROOT, 'tools/score-verify-v2/l1-review/legacy/verdict-v2.mjs');
const VERDICT_POST = path.join(ROOT, 'app/js/verdict.js');

function makeCombo(verdictPath, vendorPath, tag) {
  let src = fs.readFileSync(verdictPath, 'utf8');
  src = src.replace(/from '[^']*state\.js[^']*'/, `from './state.js?v=121'`);
  src = src.replace(/from '[^']*liuyao-core\.js[^']*'/, `from '${pathToFileURL(vendorPath).href}'`);
  const out = path.join(ROOT, 'app/js', `.tmpanDong-${tag}.mjs`);
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

const DAY_GAN = ['甲', '乙', '丙', '丁', '戊', '己', '庚', '辛', '壬', '癸'];

function runOne(core, verdict, mask, mi, dz, domain) {
  const vals = [];
  for (let i = 0; i < 6; i++) vals.push([6, 7, 8, 9][(mask >> (i * 2)) & 3]);
  const pan = core.paipan({ yaoValues: vals, gender: '男', question: 'x', year: 2026, month: 10, day: 26, hour: 17, minute: 35 });
  const dayGan = DAY_GAN[(mi * 3) % 10];
  pan.siZhu.monthGanZhi = pan.siZhu.monthGanZhi[0] + MONTH_ZHI[mi];
  pan.siZhu.dayGanZhi = dayGan + dz;
  const an = core.analyzeNajia(pan, { monthZhi: MONTH_ZHI[mi], dayZhi: dz, sex: '男' });
  const r = verdict.judgeNajia(pan, domain);
  return { an, r };
}

function factMap(an) {
  const m = new Map();
  for (const o of an.lines || []) {
    const s = o.state || {};
    m.set(o.pos, { lingTai: s.lingTai, yuePo: !!s.yuePo, riPo: !!s.riPo, anDong: !!s.anDong, riChong: !!s.riChong, xunKong: !!s.xunKong });
  }
  return m;
}

const stats = {
  total: 0,
  anDongChanged: 0, riPoChanged: 0, lingTaiChanged: 0,
  levelDiff: 0,
  anDongAndLevelDiff: 0,
  byFlow: {},
  samples: [],
};
const t0 = Date.now();

for (let mi = 0; mi < 12; mi++) {
  const mz = MONTH_ZHI[mi];
  const dz = mz; // 月令 = 日辰，这是唯一能让「月破爻」同时被日冲的组合
  for (let mask = 0; mask < 4096; mask++) {
    for (let di = 0; di < 8; di++) {
      const domain = DOMAINS[di];
      const A = runOne(corePre, modPre, mask, mi, dz, domain);
      const B = runOne(corePost, modPost, mask, mi, dz, domain);
      stats.total++;
      const fa = factMap(A.an), fb = factMap(B.an);
      let adChg = 0, rpChg = 0, ltChg = 0;
      for (const [pos, a] of fa) {
        const b = fb.get(pos);
        if (a.anDong !== b.anDong) adChg++;
        if (a.riPo !== b.riPo) rpChg++;
        if (a.lingTai !== b.lingTai) ltChg++;
      }
      if (adChg) stats.anDongChanged++;
      if (rpChg) stats.riPoChanged++;
      if (ltChg) stats.lingTaiChanged++;
      if (A.r.level !== B.r.level) {
        stats.levelDiff++;
        const key = `${A.r.level}→${B.r.level}`;
        stats.byFlow[key] = (stats.byFlow[key] || 0) + 1;
        if (adChg) stats.anDongAndLevelDiff++;
        if (stats.samples.length < 6) {
          const dS = B.r.score - A.r.score;
          const dW = (B.r.signals || []).reduce((s, x) => s + x.w, 0) - (A.r.signals || []).reduce((s, x) => s + x.w, 0);
          stats.samples.push({ mask, monthIdx: mi, monthZhi: mz, dayZhi: dz, domain, levelPre: A.r.level, levelPost: B.r.level, scorePre: A.r.score, scorePost: B.r.score, dScore: dS, sumDw: dW, adChg, rpChg, ltChg });
        }
      }
    }
  }
}

stats.elapsedMs = Date.now() - t0;
const out = path.join(ROOT, 'tools/score-verify-v2/l1-review/evidence/anddang-month-eq-day.json');
fs.writeFileSync(out, JSON.stringify(stats, null, 2));
console.log('════ 月令=日辰 专项枚举（anDong 通道）════');
console.log(JSON.stringify(stats, null, 2));
