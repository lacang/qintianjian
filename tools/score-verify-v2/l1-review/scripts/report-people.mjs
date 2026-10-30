// 行人域定向复核数据（回答董事长风险一）
//
// 空间：4096 mask × 12 月令 × 12 日辰 = 589,824 判读，仅 people 域
// 对比：PRE（v121 verdict + V0 vendor）vs POST（current verdict + cur vendor）
//
// 输出证据：
//   ① 9,552 条六冲通道的卦名构成（新增 2 卦 vs 原有 8 卦）
//   ② 变化类型拆分：仅信号 / 分数变 / 档位变
//   ③ 按月令×日辰分组（144 组合）
//   ④ 与其他行人规则的共现分析（同一记录里 xingren 规则条数）
//   ⑤ 可复算案例（含完整 mask/月/日，可用 repro-case.mjs 独立验证）
//
// 性能：paipan 只依赖 mask，缓存 4096×2（PRE/POST 各一份，因 paipan.ts 也有改动），
//       每次只重置 siZhu，避免 58 万次重复构造。

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
const VERDICT_PRE = path.join(ROOT, 'tools/score-verify-v2/l1-review/legacy/verdict-v2.mjs');
const VERDICT_POST = path.join(ROOT, 'app/js/verdict.js');

function makeCombo(verdictPath, vendorPath, tag) {
  let src = fs.readFileSync(verdictPath, 'utf8');
  src = src.replace(/from '[^']*state\.js[^']*'/, `from './state.js?v=121'`);
  src = src.replace(/from '[^']*liuyao-core\.js[^']*'/, `from '${pathToFileURL(vendorPath).href}'`);
  const out = path.join(ROOT, 'app/js', `.tmprp-${tag}.mjs`);
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

// paipan 缓存：PRE / POST 各一份（paipan.ts 在本批也有改动，不能共用）
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

// ---------- 统计容器 ----------
const S = {
  space: { masks: 4096, months: 12, days: 12, domain: 'people', total: 4096 * 144 },
  changed: 0,
  textOnly: 0,   // 仅文案措辞变化，规则与权重一致（不计入影响面）              // 任一维度（信号/分数/档位）有差异的记录数
  byChangeType: {},        // signalOnly / scoreOnly / levelChange / levelAndScore
  byDirection: {},         // dScore 分布
  byFlow: {},              // levelPre→levelPost
  xingrenChannel: { liuchong: 0, andong: 0, both: 0, other: 0 },
  byGua: {},               // 卦名 -> {count, dScoreSum, lvUp, lvDown, signalOnly, scoreOnly}
  liuchongNewVsOld: { added2: 0, original8: 0, other: 0 },
  byMonthDay: {},
  byMonth: {},
  byDay: {},
  cooccur: {},             // 同一记录 xingren 规则条数 -> 次数
  cooccurDetail: {},       // 共现的规则文本指纹组合 -> 次数
  cases: [],               // 代表案例
  anomaly: { scoreMismatch: 0, noSignalDiff: 0, cases: [] },
};

const NEW2 = new Set(['天雷无妄', '雷天大壮']);
const LIU_CHONG_OLD8 = new Set(['乾为天', '坤为地', '坎为水', '离为火', '震为雷', '艮为山', '巽为风', '兑为泽']);

function sigKey(signals) {
  return (signals || []).map((s) => `${s.w}|${s.text}`).sort().join('§');
}
// 口径键：只按「规则身份 + 权重」比较，忽略文案措辞。
// 用于区分「文案修订」与「真正的信号增删」——2026-10-29 行人域断语改中性表述后，
// 六冲信号的 text 必然 PRE≠POST，但规则与权重完全一致，不应计入信号变化。
function ruleKey(signals) {
  return (signals || []).map((s) => `${s.w}|${(s.rule && s.rule.id) || ''}`).sort().join('§');
}

function bump(o, k, n = 1) { o[k] = (o[k] || 0) + n; }

const tRun = Date.now();
for (let mi = 0; mi < 12; mi++) {
  const mz = MONTH_ZHI[mi];
  for (let dj = 0; dj < 12; dj++) {
    const dz = MONTH_ZHI[dj];
    const mdKey = `${mz}/${dz}`;
    for (let mask = 0; mask < 4096; mask++) {
      const panPre = clonePan(PAN_PRE[mask], mz, dz);
      const panPost = clonePan(PAN_POST[mask], mz, dz);
      const rPre = modPre.judgeNajia(panPre, 'people');
      const rPost = modPost.judgeNajia(panPost, 'people');

      const sigPre = ruleKey(rPre.signals), sigPost = ruleKey(rPost.signals);
      const sigChanged = sigPre !== sigPost;
      const textChanged = sigKey(rPre.signals) !== sigKey(rPost.signals);
      const scoreChanged = rPre.score !== rPost.score;
      const levelChanged = rPre.level !== rPost.level;
      if (textChanged && !sigChanged && !scoreChanged && !levelChanged) { S.textOnly++; continue; }
      if (!sigChanged && !scoreChanged && !levelChanged) continue;

      S.changed++;
      bump(S.byMonthDay, mdKey);
      bump(S.byMonth, mz);
      bump(S.byDay, dz);

      const dScore = rPost.score - rPre.score;
      bump(S.byDirection, String(dScore));
      bump(S.byFlow, `${rPre.level}→${rPost.level}`);

      // 变化类型（互斥）
      let ctype;
      if (levelChanged) ctype = scoreChanged ? 'levelAndScore' : 'levelOnly';
      else if (scoreChanged) ctype = 'scoreOnly';
      else ctype = 'signalOnly';
      bump(S.byChangeType, ctype);

      // 通道识别：对比 deltas 里 xingren 规则文本
      const xrPre = (rPre.signals || []).filter((s) => s.rule && s.rule.id === 'xingren');
      const xrPost = (rPost.signals || []).filter((s) => s.rule && s.rule.id === 'xingren');
      const hasLiuchongPre = xrPre.some((s) => s.text.includes('六冲卦'));
      const hasLiuchongPost = xrPost.some((s) => s.text.includes('六冲卦'));
      const hasAnDongPre = xrPre.some((s) => s.text.includes('暗动'));
      const hasAnDongPost = xrPost.some((s) => s.text.includes('暗动'));

      const chLiuchong = hasLiuchongPre !== hasLiuchongPost;
      const chAnDong = hasAnDongPre !== hasAnDongPost;
      let chan;
      if (chLiuchong && chAnDong) { chan = 'both'; S.xingrenChannel.both++; }
      else if (chLiuchong) { chan = 'liuchong'; S.xingrenChannel.liuchong++; }
      else if (chAnDong) { chan = 'andong'; S.xingrenChannel.andong++; }
      else { chan = 'other'; S.xingrenChannel.other++; }

      // 卦名分组
      const gua = panPost.benGua?.name || 'unknown';
      if (!S.byGua[gua]) S.byGua[gua] = { count: 0, dScoreSum: 0, lvUp: 0, lvDown: 0, signalOnly: 0, scoreOnly: 0, levelChange: 0, liuchong: 0, andong: 0 };
      const g = S.byGua[gua];
      g.count++;
      g.dScoreSum += dScore;
      if (rPost.level > rPre.level) g.lvUp++;
      if (rPost.level < rPre.level) g.lvDown++;
      if (ctype === 'signalOnly') g.signalOnly++;
      if (ctype === 'scoreOnly') g.scoreOnly++;
      if (ctype === 'levelAndScore' || ctype === 'levelOnly') g.levelChange++;
      if (chan === 'liuchong') g.liuchong++;
      if (chan === 'andong') g.andong++;

      // 新增 2 卦 vs 原有 8 卦（仅六冲通道）
      if (chan === 'liuchong') {
        if (NEW2.has(gua)) S.liuchongNewVsOld.added2++;
        else if (LIU_CHONG_OLD8.has(gua)) S.liuchongNewVsOld.original8++;
        else S.liuchongNewVsOld.other++;
      }

      // 共现分析：同一记录里 xingren 规则条数（取 POST 侧）
      const n = xrPost.length;
      bump(S.cooccur, String(n));
      const fp = xrPost.map((s) => s.text.slice(0, 6)).sort().join('+');
      bump(S.cooccurDetail, fp);

      // 代表案例：按「档位变化且方向明确」优先取样
      if (S.cases.length < 400 && (levelChanged || Math.abs(dScore) >= 2)) {
        S.cases.push({
          mask, monthZhi: mz, dayZhi: dz,
          benGua: gua,
          channel: chan,
          changeType: ctype,
          scorePre: rPre.score, scorePost: rPost.score, dScore,
          levelPre: rPre.level, levelPost: rPost.level,
          xingrenPre: xrPre.map((s) => ({ w: s.w, text: s.text })),
          xingrenPost: xrPost.map((s) => ({ w: s.w, text: s.text })),
          xingrenCount: n,
        });
      }
    }
  }
  process.stderr.write(`[${mi + 1}/12] ${mz} 月 已用 ${((Date.now() - tRun) / 1000).toFixed(0)}s 变化 ${S.changed}\n`);
}

function sumDelta(r) { return (r.signals || []).reduce((a, s) => a + (s.w || 0), 0); }

// 案例精选：每种通道 × 每种变化类型 各取 3 例
const picks = {};
for (const c of S.cases) {
  const k = `${c.channel}|${c.changeType}`;
  picks[k] = picks[k] || [];
  if (picks[k].length < 3) picks[k].push(c);
}
const caseOut = [];
for (const [k, arr] of Object.entries(picks)) {
  for (const c of arr) caseOut.push({ group: k, ...c });
}

// 卦名排序输出
const guaSorted = Object.entries(S.byGua).sort((a, b) => b[1].count - a[1].count);

const out = {
  meta: {
    generatedAt: new Date().toISOString(),
    space: S.space,
    panBuildMs,
    runMs: Date.now() - tRun,
    note: 'people 域单域枚举，PRE=v121 verdict+V0 vendor，POST=current verdict+cur vendor',
  },
  changed: S.changed,
  byChangeType: S.byChangeType,
  byDirection: S.byDirection,
  byFlow: S.byFlow,
  xingrenChannel: S.xingrenChannel,
  liuchongNewVsOld: S.liuchongNewVsOld,
  byGua: Object.fromEntries(guaSorted),
  byMonthDay: S.byMonthDay,
  byMonth: S.byMonth,
  byDay: S.byDay,
  cooccur: S.cooccur,
  cooccurDetail: S.cooccurDetail,
  cases: caseOut,
  anomaly: S.anomaly,
};
const outPath = path.join(ROOT, 'tools/score-verify-v2/l1-review/evidence/report-people.json');
fs.writeFileSync(outPath, JSON.stringify(out, null, 2));

console.log('════ 行人域定向复核数据 ════');
console.log(`空间 ${S.space.total} 判读，有差异 ${S.changed} 条（${((S.changed / S.space.total) * 100).toFixed(3)}%）`);
console.log(`paipan 缓存 ${panBuildMs}ms，主循环 ${((Date.now() - tRun) / 1000).toFixed(1)}s`);
console.log('\n── 变化类型 ──');
for (const [k, v] of Object.entries(S.byChangeType)) console.log(`  ${k.padEnd(14)} ${v}`);
console.log('\n── 通道 ──');
for (const [k, v] of Object.entries(S.xingrenChannel)) console.log(`  ${k.padEnd(10)} ${v}`);
console.log('\n── 六冲通道：新增2卦 vs 原8卦 ──');
for (const [k, v] of Object.entries(S.liuchongNewVsOld)) console.log(`  ${k.padEnd(10)} ${v}`);
console.log('\n── 卦名 Top15 ──');
for (const [gua, g] of guaSorted.slice(0, 15)) {
  console.log(`  ${gua.padEnd(6)} 计数${String(g.count).padStart(5)} Δ分合计${String(g.dScoreSum).padStart(6)} 升档${String(g.lvUp).padStart(4)} 降档${String(g.lvDown).padStart(4)} 仅信号${String(g.signalOnly).padStart(5)} 六冲通道${String(g.liuchong).padStart(5)}`);
}
console.log('\n── Δscore 分布 ──');
for (const [k, v] of Object.entries(S.byDirection).sort((a, b) => Number(a[0]) - Number(b[0]))) console.log(`  Δ${k.padStart(3)}  ${v}`);
console.log('\n── 档位流转 ──');
for (const [k, v] of Object.entries(S.byFlow).sort((a, b) => b[1] - a[1])) console.log(`  ${k.padEnd(8)} ${v}`);
console.log('\n── 同记录 xingren 规则条数 ──');
for (const [k, v] of Object.entries(S.cooccur).sort((a, b) => Number(a[0]) - Number(b[0]))) console.log(`  ${k} 条  ${v}`);
console.log('\n── 共现文本组合 Top10 ──');
for (const [k, v] of Object.entries(S.cooccurDetail).sort((a, b) => b[1] - a[1]).slice(0, 10)) console.log(`  ${String(v).padStart(6)}  ${k}`);
console.log(`\n输出 ${outPath}`);
