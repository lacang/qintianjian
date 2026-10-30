// 678 条跨吉凶分界归因（对应董事长 2026-10-28 10:24 批复「P0 审核 678 条跨吉凶分界案例」）
//
// 问题：候选（cur verdict + cur vendor）相对本地 main（V2 verdict + V0 vendor）有 678 条
//       判读从「吉倾向」跨到「凶倾向」（1→-1 / 1→-2 / 2→-1）。这些变化是否全部由预期规则导致？
//
// 方法：不预设答案，让数据说话。
//   1. 逐条对比 PRE / POST 的完整 signals 集合（按 rule.id 归并，无 rule 时用 text），
//      算出每个规则的分数增量 Δw；
//   2. 记录每条判读的排盘事实差异（lingTai / yuePo / riPo / 动静 / 世应），
//      确认分数变化的机制来源；
//   3. 校验 Δscore == ΣΔw，不等则记为「无法归因异常」；
//   4. 按「发生变化的规则集合」聚类，输出各类计数与代表案例。
//
// 枚举空间与 combine-matrix.mjs / score-regression.mjs 一致：4096 mask × 12 月令 × 8 域。
//
// 用法：node tools/score-verify-v2/l1-review/scripts/attribution-678.mjs --out=path.json

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

const arg = (n) => { const a = process.argv.find((x) => x.startsWith(`--${n}=`)); return a ? a.split('=').slice(1).join('=') : null; };

const DOMAINS = ['career', 'wealth', 'love', 'health', 'lost', 'decision', 'life', 'people'];
const DOMAIN_CN = { career: '事业', wealth: '财运', love: '婚姻', health: '疾病', lost: '失物', decision: '决策', life: '生活', people: '行人' };
const MONTH_ZHI = ['寅', '卯', '辰', '巳', '午', '未', '申', '酉', '戌', '亥', '子', '丑'];
const N = 4096 * 12 * 8;

const VENDOR_PRE = '/tmp/vendor-pre.mjs';                        // V0 = 0ed9e89 线上基线
const VENDOR_POST = path.join(ROOT, 'app/vendor/liuyao-core.js'); // cur = L0+L1
const VERDICT_PRE = path.join(ROOT, 'tools/score-verify-v2/l1-review/legacy/verdict-v2.mjs');
const VERDICT_POST = path.join(ROOT, 'app/js/verdict.js');

for (const p of [VENDOR_PRE, VENDOR_POST, VERDICT_PRE, VERDICT_POST]) {
  if (!fs.existsSync(p)) { console.error(`❌ 缺少依赖：${p}`); process.exit(2); }
}

function makeCombo(verdictPath, vendorPath, tag) {
  let src = fs.readFileSync(verdictPath, 'utf8');
  const vendorUrl = pathToFileURL(vendorPath).href;
  const before = src;
  src = src.replace(/from '[^']*state\.js[^']*'/, `from './state.js?v=121'`);
  src = src.replace(/from '[^']*liuyao-core\.js[^']*'/, `from '${vendorUrl}'`);
  if (src === before) throw new Error(`verdict 源码里未找到 vendor import：${verdictPath}`);
  const out = path.join(ROOT, 'app/js', `.tmpattr-${tag}.mjs`);
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

// ── signals 归并：按 rule.id 聚合；无 rule 的按 text 前缀区分 ──
function groupSignals(signals) {
  const m = new Map();
  for (const s of signals || []) {
    const key = s.rule?.id ? `rule:${s.rule.id}` : `text:${(s.text || '').slice(0, 24)}`;
    if (!m.has(key)) m.set(key, { key, w: 0, count: 0, texts: [], book: s.rule?.book || s.src || '', ruleId: s.rule?.id || null });
    const g = m.get(key);
    g.w += s.w; g.count += 1;
    if (!g.texts.includes(s.text)) g.texts.push(s.text);
  }
  return m;
}

function diffSignals(preSignals, postSignals) {
  const A = groupSignals(preSignals), B = groupSignals(postSignals);
  const keys = new Set([...A.keys(), ...B.keys()]);
  const out = [];
  for (const k of keys) {
    const a = A.get(k), b = B.get(k);
    const wa = a ? a.w : 0, wb = b ? b.w : 0;
    if (wa === wb && (a?.count || 0) === (b?.count || 0)) continue;
    out.push({
      key: k, ruleId: (b || a).ruleId, book: (b || a).book,
      wPre: wa, wPost: wb, dw: wb - wa,
      countPre: a?.count || 0, countPost: b?.count || 0,
      textPre: a?.texts || [], textPost: b?.texts || [],
      kind: !a ? 'added' : !b ? 'removed' : 'weightChanged',
    });
  }
  out.sort((x, y) => Math.abs(y.dw) - Math.abs(x.dw));
  return out;
}

// ── 排盘事实快照（用于把分数变化回连到事实层）──
function factOf(an) {
  // 实测结构（app/vendor/liuyao-core.js analyzeNajia）：
  //   an.lines[] 每项 = { pos, yao:{yinYang,zhi,wuXing,moving,shiYing}, moving, shi, ying, hidden, state:{wuXing,lingTai,yuePo,riPo,riChong,xunKong,...} }
  if (!an || !Array.isArray(an.lines)) return null;
  return an.lines.map((o) => ({
    pos: o.pos,
    yin: o.yao?.yinYang || '',
    zhi: o.yao?.zhi || '',
    wx: o.state?.wuXing || o.yao?.wuXing || '',
    lingTai: o.state?.lingTai || '',
    yuePo: !!o.state?.yuePo,
    riPo: !!o.state?.riPo,
    riChong: !!o.state?.riChong,
    dong: !!o.moving,
    shi: !!o.shi,
    ying: !!o.ying,
    hidden: !!o.hidden,
    xunKong: !!o.state?.xunKong,
  }));
}

function factDelta(fPre, fPost) {
  if (!fPre || !fPost) return null;
  const out = [];
  for (let i = 0; i < Math.min(fPre.length, fPost.length); i++) {
    const a = fPre[i], b = fPost[i];
    if (a.lingTai !== b.lingTai || a.yuePo !== b.yuePo || a.riPo !== b.riPo) {
      out.push({ pos: a.pos, yin: a.yin, zhi: a.zhi, wx: a.wx, shi: a.shi, ying: a.ying, dong: a.dong,
        lingTai: `${a.lingTai}→${b.lingTai}`, yuePo: `${a.yuePo}→${b.yuePo}`, riPo: `${a.riPo}→${b.riPo}`,
        riChong: `${a.riChong}→${b.riChong}`, xunKong: `${a.xunKong}→${b.xunKong}` });
    }
  }
  return out;
}

// ── 主循环 ──
const hits = [];
let judged = 0, skipped = 0;

for (let mask = 0; mask < 4096; mask++) {
  const vals = [];
  for (let i = 0; i < 6; i++) vals.push([6, 7, 8, 9][(mask >> (i * 2)) & 3]);
  let probe;
  try { probe = corePost.paipan({ yaoValues: vals, gender: '男', question: 'x', year: 2026, month: 10, day: 26, hour: 17, minute: 35 }); } catch { skipped++; continue; }
  if (!probe?.benGua?.name) { skipped++; continue; }
  const dayGan = probe.siZhu.dayGanZhi[0], dayZhi = probe.siZhu.dayGanZhi[1];

  for (let mi = 0; mi < 12; mi++) {
    const monthZhi = MONTH_ZHI[mi];
    let panPre, panPost;
    try {
      panPre = corePre.paipan({ yaoValues: vals, gender: '男', question: 'x', year: 2026, month: 10, day: 26, hour: 17, minute: 35 });
      panPost = corePost.paipan({ yaoValues: vals, gender: '男', question: 'x', year: 2026, month: 10, day: 26, hour: 17, minute: 35 });
    } catch { skipped += 8; continue; }
    for (const pan of [panPre, panPost]) {
      pan.siZhu.monthGanZhi = pan.siZhu.monthGanZhi[0] + monthZhi;
      pan.siZhu.dayGanZhi = dayGan + dayZhi;
    }
    let anPre, anPost;
    try {
      anPre = corePre.analyzeNajia(panPre, { monthZhi, dayZhi, sex: '男' });
      anPost = corePost.analyzeNajia(panPost, { monthZhi, dayZhi, sex: '男' });
    } catch { skipped += 8; continue; }

    for (let di = 0; di < 8; di++) {
      const dom = DOMAINS[di];
      let rPre, rPost;
      try { rPre = modPre.judgeNajia(panPre, dom); } catch { skipped++; continue; }
      try { rPost = modPost.judgeNajia(panPost, dom); } catch { skipped++; continue; }
      if (!rPre || !rPost) { skipped++; continue; }
      judged++;

      // 只关心「吉 → 凶」跨分界
      if (!(rPre.level > 0 && rPost.level < 0)) continue;

      const deltas = diffSignals(rPre.signals, rPost.signals);
      const dScore = rPost.score - rPre.score;
      const sumDw = deltas.reduce((s, d) => s + d.dw, 0);
      const fd = factDelta(factOf(anPre), factOf(anPost));

      hits.push({
        idx: (mask * 12 + mi) * 8 + di,
        mask, monthIdx: mi, monthZhi, domain: dom, domainCn: DOMAIN_CN[dom],
        benGua: panPost.benGua?.name || '', bianGua: panPost.bianGua?.name || '',
        scorePre: rPre.score, levelPre: rPre.level,
        scorePost: rPost.score, levelPost: rPost.level,
        dScore, sumDw, dwMatch: dScore === sumDw,
        deltas, factDelta: fd,
        // 变化涉及的规则 id 集合（排序后作为聚类键）
        ruleKey: deltas.map((d) => d.ruleId || d.key).sort().join('+') || '(无信号差异)',
        factKey: (fd || []).map((f) => `${f.lingTai}|yp${f.yuePo}|rp${f.riPo}`).sort().join(';'),
      });
    }
  }
}

console.error(`[attr] 判读 ${judged}，跳过 ${skipped}，跨吉凶分界 ${hits.length}`);

// ── 归因汇总 ──
const byRule = {};
const byFact = {};
const byFlow = {};
const ruleFreq = {};
for (const h of hits) {
  byRule[h.ruleKey] = (byRule[h.ruleKey] || 0) + 1;
  byFact[h.factKey] = (byFact[h.factKey] || 0) + 1;
  const k = `${h.levelPre}→${h.levelPost}`;
  byFlow[k] = (byFlow[k] || 0) + 1;
  for (const d of h.deltas) {
    const rid = d.ruleId || d.key;
    if (!ruleFreq[rid]) ruleFreq[rid] = { count: 0, totalDw: 0, books: new Set(), kinds: {} };
    ruleFreq[rid].count++;
    ruleFreq[rid].totalDw += d.dw;
    if (d.book) ruleFreq[rid].books.add(d.book);
    ruleFreq[rid].kinds[d.kind] = (ruleFreq[rid].kinds[d.kind] || 0) + 1;
  }
}
const ruleFreqOut = {};
for (const [k, v] of Object.entries(ruleFreq)) {
  ruleFreqOut[k] = { count: v.count, totalDw: v.totalDw, books: [...v.books], kinds: v.kinds };
}

const dwMismatch = hits.filter((h) => !h.dwMatch);
const noSignalDiff = hits.filter((h) => h.deltas.length === 0);

// 代表案例：每个 ruleKey 取分数变化最典型（|dScore| 最大）的一条
const reps = {};
for (const h of hits) {
  if (!reps[h.ruleKey] || Math.abs(h.dScore) > Math.abs(reps[h.ruleKey].dScore)) reps[h.ruleKey] = h;
}

const out = {
  generatedAt: new Date().toISOString(),
  space: { N, masks: 4096, months: 12, domains: 8, judged, skipped },
  pre: { verdict: 'legacy/verdict-v2.mjs (V2)', vendor: '/tmp/vendor-pre.mjs (V0 = 0ed9e89)' },
  post: { verdict: 'app/js/verdict.js (V2 + 新名单)', vendor: 'app/vendor/liuyao-core.js (L0+L1)' },
  total: hits.length,
  byFlow,
  byRuleKey: byRule,
  byFactKey: byFact,
  ruleFreq: ruleFreqOut,
  anomaly: {
    dwMismatch: dwMismatch.length,
    noSignalDiff: noSignalDiff.length,
    dwMismatchCases: dwMismatch.slice(0, 20).map((h) => ({ idx: h.idx, domain: h.domain, scorePre: h.scorePre, scorePost: h.scorePost, dScore: h.dScore, sumDw: h.sumDw, ruleKey: h.ruleKey })),
    noSignalDiffCases: noSignalDiff.slice(0, 20).map((h) => ({ idx: h.idx, domain: h.domain, scorePre: h.scorePre, scorePost: h.scorePost })),
  },
  representatives: Object.fromEntries(Object.entries(reps).map(([k, h]) => [k, h])),
  hits,
};

const target = arg('out');
if (target) { fs.writeFileSync(target, JSON.stringify(out, null, 1)); console.error(`[attr] 已写出 ${target}`); }

// ── 控制台摘要 ──
console.log('════ 678 条跨吉凶分界归因摘要 ════');
console.log(`判读总数 ${judged} / 跳过 ${skipped} / 跨分界 ${hits.length}`);
console.log(`档位流向 ${JSON.stringify(byFlow)}`);
console.log('');
console.log('── 按变化规则集合聚类 ──');
for (const [k, v] of Object.entries(byRule).sort((a, b) => b[1] - a[1])) console.log(`  ${String(v).padStart(5)}  ${k}`);
console.log('');
console.log('── 按排盘事实变化聚类 ──');
for (const [k, v] of Object.entries(byFact).sort((a, b) => b[1] - a[1]).slice(0, 15)) console.log(`  ${String(v).padStart(5)}  ${k}`);
console.log('');
console.log('── 规则命中频次 ──');
for (const [k, v] of Object.entries(ruleFreqOut).sort((a, b) => b[1].count - a[1].count)) {
  console.log(`  ${String(v.count).padStart(5)} 次  Δw合计=${String(v.totalDw).padStart(7)}  ${k}  [${v.books.join(' / ')}]  ${JSON.stringify(v.kinds)}`);
}
console.log('');
console.log(`── 异常 ──`);
console.log(`  Δscore ≠ ΣΔw：${dwMismatch.length}`);
console.log(`  无信号差异却有档位变化：${noSignalDiff.length}`);
