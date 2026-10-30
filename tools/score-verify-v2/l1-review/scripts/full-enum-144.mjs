// 全量影响面枚举：12 月令 × 12 日辰 × 4096 mask × 8 域 = 4,718,592 判读。
//
// 为什么必须做：
//   678 条口径固定日辰为「癸酉」，只覆盖了 1/12 的日辰。但本批两项改动都受日辰影响：
//     ① L1 第二项「休态静爻被日冲归日破」——riPo 判定直接依赖日辰
//     ② 名单修正经 verdict.js:423 六冲卦断语作用于行人域（ruleId=xingren），
//        与婚姻域 liuhunhun 是两条独立通道
//   单一日辰无法回答「本批到底改变了多少判读」。
//
// 归因口径：按信号变化的 ruleId + 文本特征互斥归类：
//   L 名单-婚姻   liuhunhun（六冲/六合卦名单）
//   X 名单-行人   xingren 且文本含「六冲卦」（不含具体措辞，避免文案修订后失配）
//   P 月破失气    wangxiang/shituo/chishi 因 lingTai 旺→休
//   R 日破        ribo 新增 / andong 移除（用神）
//   XA 暗动-行人  xingren 且文本含「暗动」
//   组合类按「同时出现」命名，异常（无信号差异 / Δscore≠ΣΔw）单独计数。

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
  const out = path.join(ROOT, 'app/js', `.tmpfull-${tag}.mjs`);
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

// 预计算 4096 mask 的六爻值，避免内层重复分配
const MASKVALS = [];
for (let mask = 0; mask < 4096; mask++) {
  const v = [];
  for (let i = 0; i < 6; i++) v.push([6, 7, 8, 9][(mask >> (i * 2)) & 3]);
  MASKVALS.push(v);
}

function build(core, verdict, mask, mz, dz, domain) {
  const pan = core.paipan({ yaoValues: MASKVALS[mask], gender: '男', question: 'x', year: 2026, month: 10, day: 26, hour: 17, minute: 35 });
  pan.siZhu.monthGanZhi = pan.siZhu.monthGanZhi[0] + mz;
  pan.siZhu.dayGanZhi = DAY_GAN[(mz.charCodeAt(0) + dz.charCodeAt(0)) % 10] + dz;
  const an = core.analyzeNajia(pan, { monthZhi: mz, dayZhi: dz, sex: '男' });
  const r = verdict.judgeNajia(pan, domain);
  return { pan, an, r };
}

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
  return out;
}
function factDiff(anA, anB) {
  const out = [];
  const mb = new Map(anB.lines.map((o) => [o.pos, o]));
  for (const a of anA.lines) {
    const b = mb.get(a.pos); if (!b) continue;
    const sa = a.state || {}, sb = b.state || {};
    const d = {};
    if (sa.lingTai !== sb.lingTai) d.lingTai = 1;
    if (!!sa.yuePo !== !!sb.yuePo) d.yuePo = 1;
    if (!!sa.riPo !== !!sb.riPo) d.riPo = 1;
    if (!!sa.anDong !== !!sb.anDong) d.anDong = 1;
    if (Object.keys(d).length) out.push({ pos: a.pos, ...d });
  }
  return out;
}

const S = {
  space: { months: 12, days: 12, masks: 4096, domains: 8, total: 0 },
  levelDiff: 0,
  byClass: {}, byFlow: {}, byDomain: {}, byMonthDay: {},
  anomaly: { dwMismatch: 0, noSignalDiff: 0, dwMismatchCases: [], noSignalDiffCases: [] },
  ruleFreq: {}, factShape: {},
  samples: {},
  xingrenSplit: { liuchong: 0, andong: 0, other: 0 },
};

function classify(deltas, facts) {
  const tags = new Set();
  for (const d of deltas) {
    const rid = d.ruleId || '';
    if (rid === 'liuhunhun') tags.add('L');
    else if (rid === 'xingren') {
      const tx = [...(d.textPre || []), ...(d.textPost || [])].join('|');
      if (tx.includes('六冲卦')) { tags.add('X'); S.xingrenSplit.liuchong++; }
      else if (tx.includes('暗动')) { tags.add('XA'); S.xingrenSplit.andong++; }
      else { tags.add('XO'); S.xingrenSplit.other++; }
    } else if (rid === 'ribo' || rid === 'andong') tags.add('R');
    else if (rid === 'wangxiang' || rid === 'shituo' || rid === 'chishi') tags.add('P');
    else tags.add(`?${rid || d.key}`);
  }
  if (!tags.size) return 'Z 无信号差异';
  return [...tags].sort().join('+');
}
const CLS_NAME = {
  P: '月破失气', L: '名单-婚姻', X: '名单-行人', R: '日破', XA: '暗动-行人',
  'P+L': '月破+名单婚姻', 'P+X': '月破+名单行人', 'P+R': '月破+日破', 'L+R': '名单婚姻+日破',
  'X+R': '名单行人+日破', 'L+X': '名单婚姻+名单行人',
  'P+L+R': '月破+名单婚姻+日破', 'P+X+R': '月破+名单行人+日破', 'L+X+R': '名单+日破',
  'P+L+X': '月破+名单(婚+行)', 'P+L+X+R': '月破+名单+日破',
  'XA+R': '暗动行人+日破', 'P+XA': '月破+暗动行人', 'P+XA+R': '月破+暗动行人+日破',
  'L+XA': '名单婚姻+暗动行人', 'X+XA': '名单行人+暗动行人',
};

const t0 = Date.now();
for (let mi = 0; mi < 12; mi++) {
  const mz = MONTH_ZHI[mi];
  for (let dj = 0; dj < 12; dj++) {
    const dz = MONTH_ZHI[dj];
    const mdKey = `${mz}/${dz}`;
    let mdDiff = 0;
    for (let mask = 0; mask < 4096; mask++) {
      for (let di = 0; di < 8; di++) {
        const domain = DOMAINS[di];
        const A = build(corePre, modPre, mask, mz, dz, domain);
        const B = build(corePost, modPost, mask, mz, dz, domain);
        S.space.total++;
        if (A.r.level === B.r.level) continue;
        S.levelDiff++; mdDiff++;
        const flow = `${A.r.level}→${B.r.level}`;
        S.byFlow[flow] = (S.byFlow[flow] || 0) + 1;
        S.byDomain[domain] = (S.byDomain[domain] || 0) + 1;

        const deltas = diffSignals(A.r.signals, B.r.signals);
        const facts = factDiff(A.an, B.an);
        const dScore = B.r.score - A.r.score;
        const sumDw = deltas.reduce((s, x) => s + x.dw, 0);
        if (dScore !== sumDw) {
          S.anomaly.dwMismatch++;
          if (S.anomaly.dwMismatchCases.length < 10) S.anomaly.dwMismatchCases.push({ mask, mz, dz, domain, dScore, sumDw });
        }
        if (!deltas.length) {
          S.anomaly.noSignalDiff++;
          if (S.anomaly.noSignalDiffCases.length < 10) S.anomaly.noSignalDiffCases.push({ mask, mz, dz, domain, levelPre: A.r.level, levelPost: B.r.level });
        }

        const cls = classify(deltas, facts);
        S.byClass[cls] = (S.byClass[cls] || 0) + 1;

        for (const d of deltas) {
          const k = d.ruleId || d.key;
          if (!S.ruleFreq[k]) S.ruleFreq[k] = { count: 0, totalDw: 0, kinds: {} };
          S.ruleFreq[k].count++; S.ruleFreq[k].totalDw += d.dw;
          S.ruleFreq[k].kinds[d.kind] = (S.ruleFreq[k].kinds[d.kind] || 0) + 1;
        }
        const fk = facts.length ? facts.map((f) => Object.keys(f).filter((k) => k !== 'pos').sort().join('+')).sort().join(';') : '无';
        S.factShape[fk] = (S.factShape[fk] || 0) + 1;

        if (!S.samples[cls] && Object.keys(S.samples).length < 40) {
          S.samples[cls] = { mask, monthZhi: mz, dayZhi: dz, domain, domainCn: DOMAIN_CN[domain],
            benGua: B.pan.benGua?.name, bianGua: B.pan.bianGua?.name,
            levelPre: A.r.level, levelPost: B.r.level, scorePre: A.r.score, scorePost: B.r.score, dScore, sumDw,
            deltas: deltas.map((x) => ({ ruleId: x.ruleId, dw: x.dw, kind: x.kind, wPre: x.wPre, wPost: x.wPost, textPre: x.textPre, textPost: x.textPost })),
            facts };
        }
      }
    }
    if (mdDiff) S.byMonthDay[mdKey] = mdDiff;
  }
  process.stderr.write(`[${mi + 1}/12] ${mz} 月 累计差异 ${S.levelDiff}  已用 ${((Date.now() - t0) / 1000).toFixed(0)}s\n`);
}
S.elapsedMs = Date.now() - t0;

const out = path.join(ROOT, 'tools/score-verify-v2/l1-review/evidence/full-enum-144.json');
fs.writeFileSync(out, JSON.stringify(S, null, 2));

console.log('\n════ 全量影响面（12 月令 × 12 日辰 × 4096 × 8 = 4,718,592）════');
console.log(`档位差异 ${S.levelDiff}   耗时 ${(S.elapsedMs / 1000).toFixed(0)}s`);
console.log('\n异常:', JSON.stringify({ dwMismatch: S.anomaly.dwMismatch, noSignalDiff: S.anomaly.noSignalDiff }));
console.log('\n──── 按归因类（互斥）────');
const clsSorted = Object.entries(S.byClass).sort((a, b) => b[1] - a[1]);
for (const [k, v] of clsSorted) console.log(`  ${(CLS_NAME[k] || k).padEnd(24)} ${String(v).padStart(7)}   [${k}]`);
console.log('\n──── 规则频次 ────');
for (const [k, v] of Object.entries(S.ruleFreq).sort((a, b) => b[1].count - a[1].count))
  console.log(`  ${k.padEnd(12)} ${String(v.count).padStart(7)} 次  ΣΔw=${String(v.totalDw).padStart(8)}  ${JSON.stringify(v.kinds)}`);
console.log('\n──── 档位流向 Top15 ────');
for (const [k, v] of Object.entries(S.byFlow).sort((a, b) => b[1] - a[1]).slice(0, 15)) console.log(`  ${k.padEnd(10)} ${v}`);
console.log('\n──── 域分布 ────');
for (const [k, v] of Object.entries(S.byDomain).sort((a, b) => b[1] - a[1])) console.log(`  ${DOMAIN_CN[k] || k} ${v}`);
console.log('\n──── 事实变化形态 ────');
for (const [k, v] of Object.entries(S.factShape).sort((a, b) => b[1] - a[1]).slice(0, 12)) console.log(`  ${k.padEnd(42)} ${v}`);
console.log('\n──── xingren 拆分 ────', JSON.stringify(S.xingrenSplit));
