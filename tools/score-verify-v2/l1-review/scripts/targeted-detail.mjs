// 判读级定向明细导出（PRE vs POST）
//
// 目的：回答董事长 P0 待办第 1、2 项 —— 导出 9,552 条行人域 xingren 明细、
//       3,617 条日破相关明细，并给出可交叉核验的统计单位。
//
// 与 full-enum-144.mjs 的区别：
//   后者只落汇总计数与每类首个样本；本脚本落**每一条**档位差异记录的完整证据链：
//     ① 判读坐标（域 / 月令 / 日辰 / mask / 卦名）
//     ② PRE/POST 的 score 与 level
//     ③ 全部信号变化（ruleId / Δw / 新增|移除|权重变化 / 变化前后文本）
//     ④ 六爻的事实状态（lingTai / yuePo / riChong / anDong / riPo 的 PRE 与 POST 具体值）
//     ⑤ 用神爻（people 域为应爻）的完整 PRE/POST 状态 —— 计分只认用神，这是归因关键
//
// 统计单位说明（直接回应董事长第 3 问）：
//   「1 条」= 1 个判读 = (mask × 月令 × 日辰 × 域) 的唯一组合。
//   它不是唯一排盘（同一 mask+月令 在 12 个日辰、8 个域下会各出现一次），
//   也不是规则变化数（1 条判读可同时含多条规则变化）。
//   脚本同时输出三套去重口径：唯一排盘数、唯一(mask,月令)数、唯一 mask 数。

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
  const out = path.join(ROOT, 'app/js', `.tmptgt-${tag}.mjs`);
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
    if (!m.has(key)) m.set(key, { key, w: 0, count: 0, texts: [], ruleId: s.rule?.id || null, src: s.src || null });
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
    out.push({
      ruleId: (y || x).ruleId, key: k, dw: wb - wa, wPre: wa, wPost: wb,
      countPre: x?.count || 0, countPost: y?.count || 0,
      textPre: x?.texts || [], textPost: y?.texts || [],
      kind: !x ? 'added' : !y ? 'removed' : 'weightChanged',
    });
  }
  return out;
}
const st = (s) => ({ lingTai: s.lingTai, yuePo: !!s.yuePo, riChong: !!s.riChong, anDong: !!s.anDong, riPo: !!s.riPo });
function factLines(anA, anB) {
  const mb = new Map(anB.lines.map((o) => [o.pos, o]));
  const out = [];
  for (const a of anA.lines) {
    const b = mb.get(a.pos); if (!b) continue;
    const sa = st(a.state || {}), sb = st(b.state || {});
    const changed = JSON.stringify(sa) !== JSON.stringify(sb);
    if (!changed) continue;
    out.push({ pos: a.pos, zhi: a.yao?.zhi, liuQin: a.liuQin, moving: !!a.moving, shi: !!a.shi, ying: !!a.ying, pre: sa, post: sb });
  }
  return out;
}

// 输出流
const EV = path.join(ROOT, 'tools/score-verify-v2/l1-review/evidence');
const fsX = fs.createWriteStream(path.join(EV, 'detail-xingren.jsonl'), { flags: 'w' });
const fsR = fs.createWriteStream(path.join(EV, 'detail-ribo.jsonl'), { flags: 'w' });

const S = {
  total: 0, levelDiff: 0,
  xingren: { records: 0, onlySignal: 0, scoreChanged: 0, levelChanged: 0, deltaScoreSum: 0,
    byGua: {}, byMonth: {}, byDay: {}, byFlow: {}, byOtherXingrenRules: {}, byDeltaScore: {},
    kindCount: {}, ruleIdPresent: {} },
  ribo: { records: 0, onlySignal: 0, scoreChanged: 0,
    withRiPoAdded: 0, withAnDongRemoved: 0, withBoth: 0, withRiPoAddedOnly: 0, withAnDongRemovedOnly: 0,
    byDomain: {}, byPreLingTai: {}, byFlow: {}, deltaScoreSum: 0 },
  uniq: { pan: new Set(), maskMonth: new Set(), mask: new Set() },
  uniqXingren: { pan: new Set(), maskMonth: new Set(), mask: new Set() },
  uniqRibo: { pan: new Set(), maskMonth: new Set(), mask: new Set() },
};

const t0 = Date.now();
for (let mi = 0; mi < 12; mi++) {
  const mz = MONTH_ZHI[mi];
  for (let dj = 0; dj < 12; dj++) {
    const dz = MONTH_ZHI[dj];
    for (let mask = 0; mask < 4096; mask++) {
      for (let di = 0; di < 8; di++) {
        const domain = DOMAINS[di];
        const A = build(corePre, modPre, mask, mz, dz, domain);
        const B = build(corePost, modPost, mask, mz, dz, domain);
        S.total++;
        if (A.r.level === B.r.level) continue;
        S.levelDiff++;

        const deltas = diffSignals(A.r.signals, B.r.signals);
        const facts = factLines(A.an, B.an);
        const dScore = B.r.score - A.r.score;
        const guaBen = String(A.pan.benGua?.name ?? A.pan.benGuaName ?? '');
        const guaBian = String(A.pan.bianGua?.name ?? '');
        const panKey = `${mask}|${mz}`;
        S.uniq.pan.add(panKey); S.uniq.maskMonth.add(panKey); S.uniq.mask.add(mask);

        const yongA = A.an.ying?.occ, yongB = B.an.ying?.occ;

        const hasXingren = deltas.some((d) => d.ruleId === 'xingren');
        const hasRibo = deltas.some((d) => d.ruleId === 'ribo' || d.ruleId === 'andong');

        if (hasXingren) {
          const x = S.xingren;
          x.records++;
          S.uniqXingren.pan.add(panKey); S.uniqXingren.maskMonth.add(panKey); S.uniqXingren.mask.add(mask);
          if (dScore === 0) x.onlySignal++; else x.scoreChanged++;
          x.levelChanged++;
          x.deltaScoreSum += dScore;
          x.byDeltaScore[dScore] = (x.byDeltaScore[dScore] || 0) + 1;
          x.byGua[guaBen || '(未知)'] = (x.byGua[guaBen || '(未知)'] || 0) + 1;
          x.byMonth[mz] = (x.byMonth[mz] || 0) + 1;
          x.byDay[dz] = (x.byDay[dz] || 0) + 1;
          const flow = `${A.r.level}→${B.r.level}`;
          x.byFlow[flow] = (x.byFlow[flow] || 0) + 1;
          for (const d of deltas) {
            const rid = d.ruleId || d.key;
            x.ruleIdPresent[rid] = (x.ruleIdPresent[rid] || 0) + 1;
            if (rid !== 'xingren') x.byOtherXingrenRules[rid] = (x.byOtherXingrenRules[rid] || 0) + 1;
            x.kindCount[`${rid}:${d.kind}`] = (x.kindCount[`${rid}:${d.kind}`] || 0) + 1;
          }
          fsX.write(JSON.stringify({
            domain, domainCn: DOMAIN_CN[domain], month: mz, day: dz, mask,
            guaBen, guaBian,
            scorePre: A.r.score, scorePost: B.r.score, levelPre: A.r.level, levelPost: B.r.level,
            deltas, facts,
            yong: yongA ? { pos: yongA.pos, zhi: yongA.yao?.zhi, pre: st(yongA.state), post: yongB ? st(yongB.state) : null } : null,
          }) + '\n');
        }

        if (hasRibo) {
          const r = S.ribo;
          r.records++;
          S.uniqRibo.pan.add(panKey); S.uniqRibo.maskMonth.add(panKey); S.uniqRibo.mask.add(mask);
          if (dScore === 0) r.onlySignal++; else r.scoreChanged++;
          r.deltaScoreSum += dScore;
          r.byDomain[DOMAIN_CN[domain]] = (r.byDomain[DOMAIN_CN[domain]] || 0) + 1;
          const flow = `${A.r.level}→${B.r.level}`;
          r.byFlow[flow] = (r.byFlow[flow] || 0) + 1;
          const yPre = yongA ? st(yongA.state) : null;
          const yPost = yongB ? st(yongB.state) : null;
          const riPoAdded = !!(yPre && yPost && !yPre.riPo && yPost.riPo);
          const anDongRemoved = !!(yPre && yPost && yPre.anDong && !yPost.anDong);
          if (riPoAdded) r.withRiPoAdded++;
          if (anDongRemoved) r.withAnDongRemoved++;
          if (riPoAdded && anDongRemoved) r.withBoth++;
          if (riPoAdded && !anDongRemoved) r.withRiPoAddedOnly++;
          if (!riPoAdded && anDongRemoved) r.withAnDongRemovedOnly++;
          const lt = yPre ? yPre.lingTai : '(无用神)';
          r.byPreLingTai[lt] = (r.byPreLingTai[lt] || 0) + 1;
          fsR.write(JSON.stringify({
            domain, domainCn: DOMAIN_CN[domain], month: mz, day: dz, mask,
            guaBen, guaBian,
            scorePre: A.r.score, scorePost: B.r.score, levelPre: A.r.level, levelPost: B.r.level,
            riPoAdded, anDongRemoved,
            yong: yongA ? { pos: yongA.pos, zhi: yongA.yao?.zhi, pre: yPre, post: yPost } : null,
            deltas, facts,
          }) + '\n');
        }
      }
    }
  }
  process.stderr.write(`[${mi + 1}/12] ${mz} 月 累计档位差异 ${S.levelDiff} 已用 ${((Date.now() - t0) / 1000).toFixed(0)}s\n`);
}
fsX.end(); fsR.end();
await new Promise((res) => { let n = 2; const done = () => { if (--n === 0) res(); }; fsX.on('finish', done); fsR.on('finish', done); });

const uniqOut = (u) => ({ panMaskMonth: u.pan.size, maskMonth: u.maskMonth.size, mask: u.mask.size });
const out = {
  elapsedSec: Math.round((Date.now() - t0) / 1000),
  space: { total: S.total, levelDiff: S.levelDiff },
  unitDefinition: '「1 条」= 1 个判读 = (mask × 月令 × 日辰 × 域) 唯一组合；非唯一排盘，非规则变化数',
  uniqAll: uniqOut(S.uniq),
  uniqXingren: uniqOut(S.uniqXingren),
  uniqRibo: uniqOut(S.uniqRibo),
  xingren: { ...S.xingren, byGua: sortObj(S.xingren.byGua), byMonth: sortObj(S.xingren.byMonth), byDay: sortObj(S.xingren.byDay), byFlow: sortObj(S.xingren.byFlow), byDeltaScore: sortObj(S.xingren.byDeltaScore), byOtherXingrenRules: sortObj(S.xingren.byOtherXingrenRules), kindCount: sortObj(S.xingren.kindCount), ruleIdPresent: sortObj(S.xingren.ruleIdPresent) },
  ribo: { ...S.ribo, byDomain: sortObj(S.ribo.byDomain), byPreLingTai: sortObj(S.ribo.byPreLingTai), byFlow: sortObj(S.ribo.byFlow) },
};
function sortObj(o) { return Object.fromEntries(Object.entries(o).sort((x, y) => y[1] - x[1])); }
fs.writeFileSync(path.join(EV, 'targeted-detail-summary.json'), JSON.stringify(out, null, 2));

console.log('════ 判读级定向明细 ════');
console.log(`耗时 ${out.elapsedSec}s  判读 ${S.total}  档位差异 ${S.levelDiff}`);
console.log('');
console.log('── 统计单位去重 ──');
console.log(`  全部档位差异：判读 ${S.levelDiff} / 唯一(mask,月令) ${S.uniq.pan.size} / 唯一 mask ${S.uniq.mask.size}`);
console.log(`  行人域 xingren：判读 ${S.xingren.records} / 唯一(mask,月令) ${S.uniqXingren.pan.size} / 唯一 mask ${S.uniqXingren.mask.size}`);
console.log(`  日破相关：判读 ${S.ribo.records} / 唯一(mask,月令) ${S.uniqRibo.pan.size} / 唯一 mask ${S.uniqRibo.mask.size}`);
console.log('');
console.log('── 行人域 xingren ──');
console.log(`  记录 ${S.xingren.records}  仅信号变化 ${S.xingren.onlySignal}  分数变化 ${S.xingren.scoreChanged}  ΣΔscore ${S.xingren.deltaScoreSum}`);
console.log('  Δscore 分布：', JSON.stringify(out.xingren.byDeltaScore));
console.log('  档位流向：', JSON.stringify(out.xingren.byFlow));
console.log('  共现的其他规则：', JSON.stringify(out.xingren.byOtherXingrenRules));
console.log('  按卦名 Top15：', JSON.stringify(Object.entries(out.xingren.byGua).slice(0, 15)));
console.log('  按日辰：', JSON.stringify(out.xingren.byDay));
console.log('');
console.log('── 日破相关 ──');
console.log(`  记录 ${S.ribo.records}  仅信号 ${S.ribo.onlySignal}  分数变化 ${S.ribo.scoreChanged}  ΣΔscore ${S.ribo.deltaScoreSum}`);
console.log(`  riPo 新增 ${S.ribo.withRiPoAdded}   anDong 移除 ${S.ribo.withAnDongRemoved}   两者同时 ${S.ribo.withBoth}`);
console.log(`  仅 riPo 新增 ${S.ribo.withRiPoAddedOnly}   仅 anDong 移除 ${S.ribo.withAnDongRemovedOnly}`);
console.log('  按域：', JSON.stringify(out.ribo.byDomain));
console.log('  用神 PRE lingTai：', JSON.stringify(out.ribo.byPreLingTai));
console.log('  档位流向：', JSON.stringify(out.ribo.byFlow));
console.log('');
console.log('已写出 detail-xingren.jsonl / detail-ribo.jsonl / targeted-detail-summary.json');
