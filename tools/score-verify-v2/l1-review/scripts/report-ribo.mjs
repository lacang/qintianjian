// 日破通道定向复核数据（回答董事长风险二）
//
// 空间：4096 mask × 12 月令 × 12 日辰 × 8 域 = 4,718,592 判读
// 对比：PRE（v121 verdict + V0 vendor）vs POST（current verdict + cur vendor）
//
// 输出证据：
//   ① riPo 新增 / anDong 移除 的判读级数量与互斥性
//   ② 纯日破 / 月破+日破共现 / 六合+日破共现 的数量关系（回答 2,913 / 571 分类）
//   ③ 用神爻 PRE 旺相休囚死分布
//   ④ 域分布、档位流转
//   ⑤ 可复算案例
//
// 关键代码事实（本脚本同时验证）：
//   verdict.js 中 ruleId='ribo' 的信号只出现在第 210-211 行的用神本体块内，
//   而该块被 skipYongBody = {health,decision,life,people} 排除；
//   people 域另用 408 行的 anDong +2（ruleId='xingren'），且 people 专项块内
//   没有任何 riPo 信号 —— 因此 people 域的 riPo 变化不产生任何信号或分数。

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
const DAY_GAN = ['甲', '乙', '丙', '丁', '戊', '己', '庚', '辛', '壬', '癸'];

const VENDOR_PRE = '/tmp/vendor-pre.mjs';
const VENDOR_POST = path.join(ROOT, 'app/vendor/liuyao-core.js');
const VERDICT_PRE = path.join(ROOT, 'tools/score-verify-v2/l1-review/legacy/verdict-v2.mjs');
const VERDICT_POST = path.join(ROOT, 'app/js/verdict.js');

function makeCombo(verdictPath, vendorPath, tag) {
  let src = fs.readFileSync(verdictPath, 'utf8');
  src = src.replace(/from '[^']*state\.js[^']*'/, `from './state.js?v=121'`);
  src = src.replace(/from '[^']*liuyao-core\.js[^']*'/, `from '${pathToFileURL(vendorPath).href}'`);
  const out = path.join(ROOT, 'app/js', `.tmprb-${tag}.mjs`);
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
  space: { masks: 4096, months: 12, days: 12, domains: 8, total: 4718592 },
  levelDiff: 0,
  ribo: { records: 0, byDomain: {}, pure: 0, withYuePo: 0, withLiuhe: 0, withOther: 0 },
  andong: { records: 0, byDomain: {}, pure: 0, withYuePo: 0 },
  riboAndAndong: 0,          // 同一记录同时出现两种变化
  riboWithAndongLevel: 0,    // 其中档位也变化的
  bothFlagged: 0,            // 同一爻 anDong 与 riPo 同时为真（理论恒 0）
  riboByFlow: {},
  riboByDirection: {},
  riboByPreLingTai: {},      // 用神爻 PRE lingTai 分布（按盘统计候选爻）
  riboByPostLingTai: {},
  riboByGua: {},
  yongCandidate: {           // 每盘候选爻计数（用于「用神/非用神」口径说明）
    preIdleRiChong: 0,       // PRE 休态待定爻（riChong 且 !anDong && !riPo）
    preAnDong: 0,
    preRiPo: 0,
  },
  cases: [],
  crossCheck: {},
};

function sigKey(signals) { return (signals || []).map((s) => `${s.w}|${s.text}`).sort().join('§'); }
function bump(o, k, n = 1) { o[k] = (o[k] || 0) + n; }
function hasRule(signals, id) { return (signals || []).some((s) => s.rule && s.rule.id === id); }

const tRun = Date.now();
for (let mi = 0; mi < 12; mi++) {
  const mz = MONTH_ZHI[mi];
  for (let dj = 0; dj < 12; dj++) {
    const dz = MONTH_ZHI[dj];
    for (let mask = 0; mask < 4096; mask++) {
      const panPre = clonePan(PAN_PRE[mask], mz, dz);
      const panPost = clonePan(PAN_POST[mask], mz, dz);
      const anPre = corePre.analyzeNajia(panPre, { monthZhi: mz, dayZhi: dz, sex: '男' });
      const anPost = corePost.analyzeNajia(panPost, { monthZhi: mz, dayZhi: dz, sex: '男' });

      // 盘级候选爻统计（只算一次，不按域重复）
      let idle = 0, preAd = 0, preRp = 0;
      const mb = new Map((anPost.lines || []).map((o) => [o.pos, o]));
      for (const la of anPre.lines || []) {
        const sa = la.state || {};
        const lb = mb.get(la.pos);
        const sb = (lb && lb.state) || {};
        if (sa.anDong && sa.riPo) S.bothFlagged++;
        if (sb.anDong && sb.riPo) S.bothFlagged++;
        if (sa.riChong && !sa.anDong && !sa.riPo) idle++;
        if (sa.anDong) preAd++;
        if (sa.riPo) preRp++;
      }
      if (idle) S.yongCandidate.preIdleRiChong += idle;
      if (preAd) S.yongCandidate.preAnDong += preAd;
      if (preRp) S.yongCandidate.preRiPo += preRp;

      for (const domain of DOMAINS) {
        const rPre = modPre.judgeNajia(panPre, domain);
        const rPost = modPost.judgeNajia(panPost, domain);
        if (rPre.level === rPost.level && rPre.score === rPost.score && sigKey(rPre.signals) === sigKey(rPost.signals)) continue;
        const levelChanged = rPre.level !== rPost.level;
        if (levelChanged) S.levelDiff++;

        const riboPre = hasRule(rPre.signals, 'ribo'), riboPost = hasRule(rPost.signals, 'ribo');
        const adPre = hasRule(rPre.signals, 'andong'), adPost = hasRule(rPost.signals, 'andong');
        const yuepoPre = hasRule(rPre.signals, 'wangxiang') || (rPre.signals || []).some((s) => /月破/.test(s.text || ''));
        const yuepoPost = hasRule(rPost.signals, 'wangxiang') || (rPost.signals || []).some((s) => /月破/.test(s.text || ''));
        const chYuePo = yuepoPre !== yuepoPost;
        const lhPre = hasRule(rPre.signals, 'liuhunhun'), lhPost = hasRule(rPost.signals, 'liuhunhun');

        const chRibo = riboPre !== riboPost;
        const chAd = adPre !== adPost;

        if (chRibo && chAd) S.riboAndAndong++;

        if (chRibo) {
          S.ribo.records++;
          bump(S.ribo.byDomain, domain);
          const dScore = rPost.score - rPre.score;
          bump(S.riboByDirection, String(dScore));
          bump(S.riboByFlow, `${rPre.level}→${rPost.level}`);
          bump(S.riboByGua, panPost.benGua?.name || 'unknown');

          const yp = chYuePo;
          const lh = lhPre !== lhPost;
          if (levelChanged) {
            if (lh) S.ribo.withLiuhe++;
            else if (yp) S.ribo.withYuePo++;
            else S.ribo.pure++;
            if (chAd) S.riboWithAndongLevel++;
          }

          // 用神爻 PRE 状态：取本盘 PRE 中「riChong 且 !anDong」的爻（即本批归入日破的候选）
          const cand = (anPre.lines || []).filter((o) => o.state && o.state.riChong && !o.state.anDong);
          for (const c of cand) bump(S.riboByPreLingTai, c.state.lingTai);
          const candPost = (anPost.lines || []).filter((o) => o.state && o.state.riChong && o.state.riPo);
          for (const c of candPost) bump(S.riboByPostLingTai, c.state.lingTai);

          if (S.cases.length < 500) {
            S.cases.push({
              mask, monthZhi: mz, dayZhi: dz, domain,
              benGua: panPost.benGua?.name,
              change: riboPost ? 'ribo_added' : 'ribo_removed',
              scorePre: rPre.score, scorePost: rPost.score, dScore,
              levelPre: rPre.level, levelPost: rPost.level,
              withYuePo: yp, withLiuhe: lh,
              riboPre, riboPost,
              preLingTaiOfCandidates: cand.map((c) => c.state.lingTai),
              riboTexts: (rPost.signals || []).filter((s) => s.rule && s.rule.id === 'ribo').map((s) => ({ w: s.w, text: s.text })),
            });
          }
        }

        if (chAd) {
          S.andong.records++;
          bump(S.andong.byDomain, domain);
          const yp = chYuePo;
          if (levelChanged) { if (yp) S.andong.withYuePo++; else S.andong.pure++; }
          if (S.cases.length < 500) {
            S.cases.push({
              mask, monthZhi: mz, dayZhi: dz, domain,
              benGua: panPost.benGua?.name,
              change: adPost ? 'andong_added' : 'andong_removed',
              scorePre: rPre.score, scorePost: rPost.score, dScore: rPost.score - rPre.score,
              levelPre: rPre.level, levelPost: rPost.level,
              withYuePo: yp, withLiuhe: false,
              adPre, adPost,
              preLingTaiOfCandidates: [],
              riboTexts: (rPost.signals || []).filter((s) => s.rule && s.rule.id === 'andong').map((s) => ({ w: s.w, text: s.text })),
            });
          }
        }
      }
    }
  }
  process.stderr.write(`[${mi + 1}/12] ${mz} 月 已用 ${((Date.now() - tRun) / 1000).toFixed(0)}s levelDiff=${S.levelDiff} ribo=${S.ribo.records} ad=${S.andong.records}\n`);
}

// 案例精选：按 change + 是否共现 分组，每组 3 例
const picks = {};
for (const c of S.cases) {
  const k = `${c.change}|yuepo${c.withYuePo ? 1 : 0}|liuhe${c.withLiuhe ? 1 : 0}`;
  picks[k] = picks[k] || [];
  if (picks[k].length < 3) picks[k].push(c);
}
const caseOut = [];
for (const [k, arr] of Object.entries(picks)) for (const c of arr) caseOut.push({ group: k, ...c });

const out = {
  meta: {
    generatedAt: new Date().toISOString(),
    space: S.space, panBuildMs, runMs: Date.now() - tRun,
    note: '8 域全量枚举，PRE=v121 verdict+V0 vendor，POST=current verdict+cur vendor',
  },
  levelDiff: S.levelDiff,
  ribo: S.ribo,
  andong: S.andong,
  riboAndAndong: S.riboAndAndong,
  riboWithAndongLevel: S.riboWithAndongLevel,
  bothFlagged: S.bothFlagged,
  riboByFlow: S.riboByFlow,
  riboByDirection: S.riboByDirection,
  riboByPreLingTai: S.riboByPreLingTai,
  riboByPostLingTai: S.riboByPostLingTai,
  riboByGua: S.riboByGua,
  yongCandidate: S.yongCandidate,
  cases: caseOut,
};
const outPath = path.join(ROOT, 'tools/score-verify-v2/l1-review/evidence/report-ribo.json');
fs.writeFileSync(outPath, JSON.stringify(out, null, 2));

console.log('════ 日破通道定向复核数据 ════');
console.log(`空间 ${S.space.total} 判读，档位变化 ${S.levelDiff} 条`);
console.log(`paipan 缓存 ${panBuildMs}ms，主循环 ${((Date.now() - tRun) / 1000).toFixed(1)}s`);
console.log('\n── ribo 通道 ──');
console.log(`  记录数 ${S.ribo.records}`);
console.log(`  纯日破 ${S.ribo.pure}  月破共现 ${S.ribo.withYuePo}  六合共现 ${S.ribo.withLiuhe}`);
console.log('  按域: ' + Object.entries(S.ribo.byDomain).map(([k, v]) => `${k}=${v}`).join(' '));
console.log('\n── andong 通道 ──');
console.log(`  记录数 ${S.andong.records}  纯 ${S.andong.pure}  月破共现 ${S.andong.withYuePo}`);
console.log('  按域: ' + Object.entries(S.andong.byDomain).map(([k, v]) => `${k}=${v}`).join(' '));
console.log(`\n── 同一记录同时含 ribo+andong 变化 ── ${S.riboAndAndong}（其中档位也变 ${S.riboWithAndongLevel}）`);
console.log(`── 同一爻 anDong 与 riPo 同时为真 ── ${S.bothFlagged}（理论恒 0）`);
console.log('\n── ribo 记录：用神候选爻 PRE lingTai ──');
for (const [k, v] of Object.entries(S.riboByPreLingTai)) console.log(`  ${k} ${v}`);
console.log('── ribo 记录：用神候选爻 POST lingTai ──');
for (const [k, v] of Object.entries(S.riboByPostLingTai)) console.log(`  ${k} ${v}`);
console.log('\n── ribo Δscore 分布 ──');
for (const [k, v] of Object.entries(S.riboByDirection).sort((a, b) => Number(a[0]) - Number(b[0]))) console.log(`  Δ${k.padStart(3)}  ${v}`);
console.log('\n── ribo 档位流转 ──');
for (const [k, v] of Object.entries(S.riboByFlow).sort((a, b) => b[1] - a[1])) console.log(`  ${k.padEnd(8)} ${v}`);
console.log(`\n── 盘级候选爻累计（含域重复前的物理量）──`);
console.log(`  PRE 休态待定爻 ${S.yongCandidate.preIdleRiChong}  PRE 暗动爻 ${S.yongCandidate.preAnDong}  PRE 日破爻 ${S.yongCandidate.preRiPo}`);
console.log(`\n输出 ${outPath}`);
