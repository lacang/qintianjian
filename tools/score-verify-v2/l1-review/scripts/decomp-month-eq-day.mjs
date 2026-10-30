// 月令 = 日辰 场景的 8711 条档位差异 —— 完整归因分解。
//
// 背景：678 条口径固定日辰为「癸酉」，此时月破爻（支∈{辰,戌,丑,未}）不可能被日冲（冲酉=卯），
//   所以「月破失气」与「休态归日破」不会落在同一爻上，两项改动互不叠加。
//   但真实占卜中月建与日辰同支很常见（每月约 2–3 天）。此时：
//     月破爻支 = 冲(月令) = 冲(日辰) = 日冲爻支
//   → 同一爻先被月破失气压为休，再因「休态静爻被日冲」归日破，两项叠加。
//   本脚本枚举 12 组「月令=日辰」× 4096 mask × 8 域 = 393216，对每条档位差异做互斥归因。

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
const DOMAIN_CN = { career: '事业', wealth: '财运', love: '婚姻', health: '疾病', lost: '失物', decision: '决策', life: '生活', people: '行人' };
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
  const out = path.join(ROOT, 'app/js', `.tmpdecomp-${tag}.mjs`);
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

function groupSignals(signals) {
  const m = new Map();
  for (const s of signals || []) {
    const key = s.rule?.id ? `rule:${s.rule.id}` : `text:${(s.text || '').slice(0, 24)}`;
    if (!m.has(key)) m.set(key, { key, w: 0, count: 0, texts: [], ruleId: s.rule?.id || null });
    const g = m.get(key); g.w += s.w; g.count += 1;
    if (!g.texts.includes(s.text)) g.texts.push(s.text);
  }
  return m;
}
function diffSignals(a, b) {
  const A = groupSignals(a), B = groupSignals(b);
  const out = [];
  for (const k of new Set([...A.keys(), ...B.keys()])) {
    const x = A.get(k), y = B.get(k);
    const wa = x ? x.w : 0, wb = y ? y.w : 0;
    if (wa === wb && (x?.count || 0) === (y?.count || 0)) continue;
    out.push({ ruleId: (y || x).ruleId, key: k, dw: wb - wa, wPre: wa, wPost: wb,
      countPre: x?.count || 0, countPost: y?.count || 0,
      textPre: x?.texts || [], textPost: y?.texts || [],
      kind: !x ? 'added' : !y ? 'removed' : 'weightChanged' });
  }
  out.sort((p, q) => Math.abs(q.dw) - Math.abs(p.dw));
  return out;
}

function build(core, verdict, mask, mi, dz, domain) {
  const vals = [];
  for (let i = 0; i < 6; i++) vals.push([6, 7, 8, 9][(mask >> (i * 2)) & 3]);
  const pan = core.paipan({ yaoValues: vals, gender: '男', question: 'x', year: 2026, month: 10, day: 26, hour: 17, minute: 35 });
  pan.siZhu.monthGanZhi = pan.siZhu.monthGanZhi[0] + MONTH_ZHI[mi];
  pan.siZhu.dayGanZhi = DAY_GAN[(mi * 3) % 10] + dz;
  const an = core.analyzeNajia(pan, { monthZhi: MONTH_ZHI[mi], dayZhi: dz, sex: '男' });
  const r = verdict.judgeNajia(pan, domain);
  return { pan, an, r };
}

function factDiff(anA, anB) {
  const out = [];
  const mb = new Map(anB.lines.map((o) => [o.pos, o]));
  for (const a of anA.lines) {
    const b = mb.get(a.pos); if (!b) continue;
    const sa = a.state || {}, sb = b.state || {};
    const d = {};
    if (sa.lingTai !== sb.lingTai) d.lingTai = `${sa.lingTai}→${sb.lingTai}`;
    if (!!sa.yuePo !== !!sb.yuePo) d.yuePo = `${!!sa.yuePo}→${!!sb.yuePo}`;
    if (!!sa.riPo !== !!sb.riPo) d.riPo = `${!!sa.riPo}→${!!sb.riPo}`;
    if (!!sa.anDong !== !!sb.anDong) d.anDong = `${!!sa.anDong}→${!!sb.anDong}`;
    if (!!sa.riChong !== !!sb.riChong) d.riChong = `${!!sa.riChong}→${!!sb.riChong}`;
    if (Object.keys(d).length) out.push({ pos: a.pos, zhi: a.yao?.zhi || '', shi: !!a.shi, ying: !!a.ying, moving: !!a.moving, ...d });
  }
  return out;
}

const stats = {
  space: { months: 12, masks: 4096, domains: 8, total: 0 },
  levelDiff: 0,
  byFlow: {},
  byClass: {},
  byClassFlow: {},
  anomaly: { dwMismatch: 0, noSignalDiff: 0 },
  samples: {},
  ruleFreq: {},
  factShape: {},
};

const t0 = Date.now();
for (let mi = 0; mi < 12; mi++) {
  const mz = MONTH_ZHI[mi], dz = mz;
  for (let mask = 0; mask < 4096; mask++) {
    for (let di = 0; di < 8; di++) {
      const domain = DOMAINS[di];
      const A = build(corePre, modPre, mask, mi, dz, domain);
      const B = build(corePost, modPost, mask, mi, dz, domain);
      stats.space.total++;
      if (A.r.level === B.r.level) continue;
      stats.levelDiff++;
      const flow = `${A.r.level}→${B.r.level}`;
      stats.byFlow[flow] = (stats.byFlow[flow] || 0) + 1;

      const deltas = diffSignals(A.r.signals, B.r.signals);
      const facts = factDiff(A.an, B.an);
      const dScore = B.r.score - A.r.score;
      const sumDw = deltas.reduce((s, x) => s + x.dw, 0);
      if (dScore !== sumDw) stats.anomaly.dwMismatch++;
      if (!deltas.length) stats.anomaly.noSignalDiff++;

      const ruleIds = new Set(deltas.map((x) => x.ruleId).filter(Boolean));
      const hasLHH = ruleIds.has('liuhunhun');
      const hasYuePoEffect = facts.some((f) => f.lingTai);
      const hasRiPoEffect = facts.some((f) => f.riPo || f.anDong);
      let cls;
      if (hasLHH && hasRiPoEffect) cls = 'D 名单+日破';
      else if (hasLHH && hasYuePoEffect) cls = 'C 名单+月破';
      else if (hasLHH) cls = 'B 纯名单';
      else if (hasRiPoEffect && hasYuePoEffect) cls = 'F 月破+日破叠加';
      else if (hasRiPoEffect) cls = 'E 纯日破';
      else if (hasYuePoEffect) cls = 'A 纯月破失气';
      else cls = 'Z 无法归因';
      stats.byClass[cls] = (stats.byClass[cls] || 0) + 1;
      const ck = `${cls}|${flow}`;
      stats.byClassFlow[ck] = (stats.byClassFlow[ck] || 0) + 1;

      for (const d of deltas) {
        const k = d.ruleId || d.key;
        if (!stats.ruleFreq[k]) stats.ruleFreq[k] = { count: 0, totalDw: 0, kinds: {} };
        stats.ruleFreq[k].count++;
        stats.ruleFreq[k].totalDw += d.dw;
        stats.ruleFreq[k].kinds[d.kind] = (stats.ruleFreq[k].kinds[d.kind] || 0) + 1;
      }

      const fk = facts.map((f) => Object.keys(f).filter((k) => !['pos', 'zhi', 'shi', 'ying', 'moving'].includes(k)).sort().join('+')).sort().join(' ; ') || '无';
      stats.factShape[fk] = (stats.factShape[fk] || 0) + 1;

      if (!stats.samples[cls]) {
        stats.samples[cls] = { mask, monthIdx: mi, monthZhi: mz, dayZhi: dz, domain, domainCn: DOMAIN_CN[domain],
          benGua: B.pan.benGua?.name, bianGua: B.pan.bianGua?.name, levelPre: A.r.level, levelPost: B.r.level,
          scorePre: A.r.score, scorePost: B.r.score, dScore, sumDw, deltas: deltas.map((x) => ({ ruleId: x.ruleId, dw: x.dw, kind: x.kind, wPre: x.wPre, wPost: x.wPost, textPre: x.textPre, textPost: x.textPost })), facts };
      }
    }
  }
}
stats.elapsedMs = Date.now() - t0;

const out = path.join(ROOT, 'tools/score-verify-v2/l1-review/evidence/decomp-month-eq-day.json');
fs.writeFileSync(out, JSON.stringify(stats, null, 2));

console.log('════ 月令=日辰 档位差异 · 互斥归因 ════');
console.log(`判读总数 ${stats.space.total}   档位差异 ${stats.levelDiff}   耗时 ${(stats.elapsedMs / 1000).toFixed(1)}s`);
console.log('\n异常:', JSON.stringify(stats.anomaly));
console.log('\n──── 按类（互斥）────');
for (const [k, v] of Object.entries(stats.byClass).sort((a, b) => b[1] - a[1])) console.log(`  ${k.padEnd(18)} ${v}`);
console.log('\n──── 档位流向 ────');
for (const [k, v] of Object.entries(stats.byFlow).sort((a, b) => b[1] - a[1])) console.log(`  ${k.padEnd(10)} ${v}`);
console.log('\n──── 类 × 流向 ────');
for (const [k, v] of Object.entries(stats.byClassFlow).sort((a, b) => b[1] - a[1])) console.log(`  ${k.padEnd(26)} ${v}`);
console.log('\n──── 规则频次 ────');
for (const [k, v] of Object.entries(stats.ruleFreq).sort((a, b) => b[1].count - a[1].count)) console.log(`  ${k.padEnd(14)} ${String(v.count).padStart(6)} 次  ΣΔw=${String(v.totalDw).padStart(7)}  ${JSON.stringify(v.kinds)}`);
console.log('\n──── 事实变化形态 ────');
for (const [k, v] of Object.entries(stats.factShape).sort((a, b) => b[1] - a[1])) console.log(`  ${k.padEnd(50)} ${v}`);
console.log('\n──── 各类样本 ────');
for (const [k, s] of Object.entries(stats.samples)) {
  console.log(`\n  [${k}] mask=${s.mask} 月${s.monthZhi} 日${s.dayZhi} ${s.domainCn} ${s.benGua}→${s.bianGua} ${s.levelPre}→${s.levelPost} (${s.scorePre}→${s.scorePost}, Δ=${s.dScore}, ΣΔw=${s.sumDw})`);
  for (const d of s.deltas) console.log(`      ${String(d.dw).padStart(4)}  ${d.ruleId || '-'}  ${d.kind}  ${d.wPre}→${d.wPost}  ${(d.textPre[0] || '').slice(0, 30)} → ${(d.textPost[0] || '').slice(0, 30)}`);
  for (const f of s.facts) console.log(`      事实 第${f.pos}爻 ${f.zhi}${f.shi ? '世' : f.ying ? '应' : ''}${f.moving ? '动' : '静'}  ${JSON.stringify(f).replace(/[{}"]/g, '').replace(/pos:\d+,zhi:\w+,?(shi:true,)?(ying:true,)?(moving:true,)?/, '')}`);
}
