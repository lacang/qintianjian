// 141 条吉→凶 反事实归因核验（回答董事长 2026-10-29 P0 第 1、2 项）
//
// 目标：区分「必要因素 / 共同贡献 / 背景因素」，而不是把组合效应归给单一规则。
//
// 五个变体，每次只撤销一个因素：
//   F1 full      完整候选版本
//   F2 noRibo    撤销日破补休态（riPo 回旧公式 riChong && (死||囚)），保留月破失气
//   F3 noYuePo   撤销月破失气（lingTaiEff 不压旺），保留日破新公式
//   F4 noLiuhe   撤销六合名单修正（LIU_HE_GUA 回旧 8 卦）
//   F5 noChong   撤销六冲名单修正（LIU_CHONG_GUA 回旧 8 卦）
//
// 注：日破新增与暗动移除在 wangshuai 层不是两个独立开关——
//   anDong = riChong && (lingTaiEff 旺/相)
//   riPo   = riChong && !(lingTaiEff 旺/相)
//   「暗动消失」是 F3（月破压旺把旺变休）的后果，「日破出现」是 F2 的后果。
//   因此 F2/F3 已覆盖「撤销日破」与「恢复暗动」两种反事实。
//
// 判定口径：
//   必要因素   —— 撤销后不再发生吉→凶（levelPost 回到 >0 或 =0）
//   共同贡献   —— 撤销后仍是吉→凶，但分数变化
//   背景因素   —— 撤销后分数与档位都不变
//
// 输出：evidence/counterfactual-141.json / .txt

import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import fs from 'node:fs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '../../../..');
const EV = path.join(ROOT, 'tools/score-verify-v2/l1-review/evidence');

globalThis.document = {
  addEventListener() {}, querySelector: () => null, getElementById: () => null, querySelectorAll: () => [],
  head: { appendChild() {} },
  body: { appendChild() {}, classList: { add() {}, remove() {} } },
  createElement: () => ({ style: {}, classList: { add() {}, remove() {} }, appendChild() {}, setAttribute() {} }),
};
globalThis.window = globalThis;
globalThis.localStorage = { getItem: () => null, setItem() {}, removeItem() {} };

const VENDOR_PRE = '/tmp/vendor-pre.mjs';
const VENDOR_POST = path.join(ROOT, 'app/vendor/liuyao-core.js');
const VERDICT_PRE = path.join(ROOT, 'tools/score-verify-v2/l1-review/legacy/verdict-v2.mjs');
const VERDICT_POST = path.join(ROOT, 'app/js/verdict.js');

// 旧名单（v121 基线，从 legacy 模块中读取，不硬编码）
const preSrc = fs.readFileSync(VERDICT_PRE, 'utf8');
const OLD_CHONG = JSON.parse(preSrc.match(/const LIU_CHONG_GUA = (\[[^\]]*\]);/)[1].replace(/'/g, '"'));
const OLD_HE = JSON.parse(preSrc.match(/const LIU_HE_GUA = (\[[^\]]*\]);/)[1].replace(/'/g, '"'));
const postSrc = fs.readFileSync(VERDICT_POST, 'utf8');
const NEW_CHONG = JSON.parse(postSrc.match(/const LIU_CHONG_GUA = (\[[^\]]*\]);/)[1].replace(/'/g, '"'));
const NEW_HE = JSON.parse(postSrc.match(/const LIU_HE_GUA = (\[[^\]]*\]);/)[1].replace(/'/g, '"'));

// 注入式变体：在 verdict 内部 analyzeNajia 返回后，按 mode 重算 anDong/riPo。
// 这样反事实才真正进入判读链路（judgeNajia 自己会调 analyzeNajia，外部 patch 无效）。
function makeMod(tag, opts = {}) {
  let src = postSrc;
  src = src.replace(/from '[^']*state\.js[^']*'/, `from './state.js?v=121'`);
  src = src.replace(/from '[^']*liuyao-core\.js[^']*'/, `from '${pathToFileURL(VENDOR_POST).href}'`);
  if (opts.oldHe) src = src.replace(/const LIU_HE_GUA = \[[^\]]*\];/, `const LIU_HE_GUA = ${JSON.stringify(OLD_HE)};`);
  if (opts.oldChong) src = src.replace(/const LIU_CHONG_GUA = \[[^\]]*\];/, `const LIU_CHONG_GUA = ${JSON.stringify(OLD_CHONG)};`);
  if (opts.mode) {
    const inject = `
  // —— 反事实注入（mode=${opts.mode}）——
  {
    const __mode = ${JSON.stringify(opts.mode)};
    for (const __o of an.lines || []) {
      const __st = __o.state;
      if (!__st) continue;
      let __lt = __st.lingTai;
      if (__mode === 'noYuePo') {
        // 撤销月破压旺：把 lingTaiEff 还原为未压的原始值。
        // 原始值 = 该爻五行在月令下的本判旺衰，可由 yuePo 与压旺规则反推：
        // POST 只在 (yuePo && 原旺) 时压成休，故此处把「月破且当前为休」还原为旺。
        if (__st.yuePo && __lt === '休') __lt = '旺';
      }
      const __wx = (__lt === '旺' || __lt === '相');
      __st.lingTai = __lt;
      __st.anDong = __st.riChong && __wx;
      __st.riPo = (__mode === 'noRibo')
        ? (__st.riChong && (__lt === '死' || __lt === '囚'))
        : (__st.riChong && !__wx);
    }
  }
  // —— 反事实注入结束 ——
`;
    src = src.replace(
      "  const an = analyzeNajia(pan, { monthZhi, dayZhi, sex: pan.gender === '女' ? '女' : '男' });",
      "  const an = analyzeNajia(pan, { monthZhi, dayZhi, sex: pan.gender === '女' ? '女' : '男' });" + inject
    );
  }
  const out = path.join(ROOT, 'app/js', `.tmpcf-${tag}.mjs`);
  fs.writeFileSync(out, src);
  return out;
}

const fPre = (() => {
  let src = fs.readFileSync(VERDICT_PRE, 'utf8');
  src = src.replace(/from '[^']*state\.js[^']*'/, `from './state.js?v=121'`);
  src = src.replace(/from '[^']*liuyao-core\.js[^']*'/, `from '${pathToFileURL(VENDOR_PRE).href}'`);
  const out = path.join(ROOT, 'app/js', '.tmpcf-pre.mjs');
  fs.writeFileSync(out, src);
  return out;
})();

const fFull = makeMod('full');
const fNoHe = makeMod('nohe', { oldHe: true });
const fNoChong = makeMod('nochong', { oldChong: true });
const fNoRibo = makeMod('noribo', { mode: 'noRibo' });
const fNoYuePo = makeMod('noyuepo', { mode: 'noYuePo' });

const modPre = await import(pathToFileURL(fPre).href + '?t=' + Date.now());
const modFull = await import(pathToFileURL(fFull).href + '?t=' + Date.now());
const modNoHe = await import(pathToFileURL(fNoHe).href + '?t=' + Date.now());
const modNoChong = await import(pathToFileURL(fNoChong).href + '?t=' + Date.now());
const modNoRibo = await import(pathToFileURL(fNoRibo).href + '?t=' + Date.now());
const modNoYuePo = await import(pathToFileURL(fNoYuePo).href + '?t=' + Date.now());
for (const f of [fPre, fFull, fNoHe, fNoChong, fNoRibo, fNoYuePo]) fs.rmSync(f, { force: true });

const corePre = await import(pathToFileURL(VENDOR_PRE).href + '?t=' + Date.now());
const corePost = await import(pathToFileURL(VENDOR_POST).href + '?t=' + Date.now());

const MONTH_ZHI = ['寅', '卯', '辰', '巳', '午', '未', '申', '酉', '戌', '亥', '子', '丑'];
const DAY_GAN = ['甲', '乙', '丙', '丁', '戊', '己', '庚', '辛', '壬', '癸'];
const MASKVALS = [];
for (let mask = 0; mask < 4096; mask++) {
  const v = [];
  for (let i = 0; i < 6; i++) v.push([6, 7, 8, 9][(mask >> (i * 2)) & 3]);
  MASKVALS.push(v);
}
const BASE = (mask) => ({ yaoValues: MASKVALS[mask], gender: '男', question: 'x', year: 2026, month: 10, day: 26, hour: 17, minute: 35 });
const PAN_PRE = [], PAN_POST = [];
for (let mask = 0; mask < 4096; mask++) {
  PAN_PRE.push(corePre.paipan(BASE(mask)));
  PAN_POST.push(corePost.paipan(BASE(mask)));
}
function clonePan(src, mz, dz) {
  const pan = { ...src, siZhu: { ...src.siZhu } };
  pan.siZhu.monthGanZhi = pan.siZhu.monthGanZhi[0] + mz;
  pan.siZhu.dayGanZhi = DAY_GAN[(mz.charCodeAt(0) + dz.charCodeAt(0)) % 10] + dz;
  return pan;
}

// 反事实 patch：原地改 state，保持 an.shi.occ.state 与 lines[].state 的引用一致
function patchState(stPost, lingTaiOrig, mode) {
  let lt = stPost.lingTai;
  if (mode === 'noYuePo') lt = lingTaiOrig;          // 撤销月破压旺
  const wx = lt === '旺' || lt === '相';
  stPost.lingTai = lt;
  stPost.anDong = stPost.riChong && wx;
  stPost.riPo = (mode === 'noRibo')
    ? (stPost.riChong && (lt === '死' || lt === '囚'))  // 旧公式
    : (stPost.riChong && !wx);
}



// 读取 141 条目标
const flips = JSON.parse(fs.readFileSync(path.join(EV, 'flips-positive-to-negative.json'), 'utf8'));
const targets = flips.records.filter((r) => r.chRibo);
console.log(`目标记录 ${targets.length} 条`);

const OUT = [];
const stat = {
  total: targets.length,
  byFactor: { ribo: { necessary: 0, joint: 0, background: 0 }, yuePo: { necessary: 0, joint: 0, background: 0 }, liuhe: { necessary: 0, joint: 0, background: 0 }, chong: { necessary: 0, joint: 0, background: 0 } },
};

// 按规则身份汇总权重（用于逐项拆解，避免把组合效应归给单条规则）
function aggW(signals) {
  const m = new Map();
  for (const s of signals || []) {
    const id = (s.rule && s.rule.id) || 'none';
    const e = m.get(id) || { w: 0, n: 0 };
    e.w += s.w; e.n++;
    m.set(id, e);
  }
  return m;
}
function diffW(a, b) {
  // a=full, b=撤销后；返回 {ruleId: Δw}（正=撤销后减少的分）
  const ma = aggW(a), mb = aggW(b);
  const out = {};
  for (const id of new Set([...ma.keys(), ...mb.keys()])) {
    const wa = (ma.get(id) || { w: 0 }).w;
    const wb = (mb.get(id) || { w: 0 }).w;
    if (wa !== wb) out[id] = wa - wb;
  }
  return out;
}

function classify(base, alt) {
  // base 是完整候选（吉→凶）；alt 是撤销某因素后的结果
  if (alt.level >= 0) return 'necessary';        // 撤销后不再跨档为凶
  if (alt.score !== base.score) return 'joint';  // 仍为凶，但分数变化
  return 'background';                           // 分数档位都不变
}

for (const t of targets) {
  const panPost = clonePan(PAN_POST[t.mask], t.monthZhi, t.dayZhi);
  const panPre = clonePan(PAN_PRE[t.mask], t.monthZhi, t.dayZhi);
  const dom = t.domain;

  const rFull = modFull.judgeNajia(panPost, dom);
  const rNoHe = modNoHe.judgeNajia(panPost, dom);
  const rNoChong = modNoChong.judgeNajia(panPost, dom);
  const rNoRibo = modNoRibo.judgeNajia(panPost, dom);
  const rNoYuePo = modNoYuePo.judgeNajia(panPost, dom);

  // 变体自身必须与完整版本在「非撤销因素」上一致，否则说明 patch 有副作用
  const rec = {
    key: `${t.mask}|${t.monthZhi}|${t.dayZhi}|${dom}`,
    mask: t.mask, monthZhi: t.monthZhi, dayZhi: t.dayZhi, domain: dom, benGua: t.benGua,
    full: { score: rFull.score, level: rFull.level },
    noRibo: { score: rNoRibo.score, level: rNoRibo.level },
    noYuePo: { score: rNoYuePo.score, level: rNoYuePo.level },
    noLiuhe: { score: rNoHe.score, level: rNoHe.level },
    noChong: { score: rNoChong.score, level: rNoChong.level },
    dW: {
      ribo: diffW(rFull.signals, rNoRibo.signals),
      yuePo: diffW(rFull.signals, rNoYuePo.signals),
      liuhe: diffW(rFull.signals, rNoHe.signals),
      chong: diffW(rFull.signals, rNoChong.signals),
    },
    dScore: {
      ribo: rFull.score - rNoRibo.score,
      yuePo: rFull.score - rNoYuePo.score,
      liuhe: rFull.score - rNoHe.score,
      chong: rFull.score - rNoChong.score,
    },
  };
  rec.cls = {
    ribo: classify(rFull, rNoRibo),
    yuePo: classify(rFull, rNoYuePo),
    liuhe: classify(rFull, rNoHe),
    chong: classify(rFull, rNoChong),
  };
  for (const k of Object.keys(rec.cls)) stat.byFactor[k][rec.cls[k]]++;
  OUT.push(rec);
}

// 分数贡献分布（证明「Δ总分」不等于「单规则扣分」）
const dist = { ribo: {}, yuePo: {}, liuhe: {}, chong: {} };
for (const r of OUT) {
  for (const k of Object.keys(dist)) {
    const v = r.dScore[k];
    dist[k][v] = (dist[k][v] || 0) + 1;
  }
}
stat.dScoreDist = dist;

// 规则级权重贡献分布（按 rule id）
const ruleDist = { ribo: {}, yuePo: {}, liuhe: {}, chong: {} };
for (const r of OUT) {
  for (const k of Object.keys(ruleDist)) {
    const d = r.dW[k];
    const sig = Object.keys(d).length === 0 ? '(无规则权重变化)' : Object.entries(d).map(([id, w]) => `${id}:${w > 0 ? '+' : ''}${w}`).join(',');
    ruleDist[k][sig] = (ruleDist[k][sig] || 0) + 1;
  }
}
stat.ruleDist = ruleDist;

// 交叉矩阵：哪些因素同时是必要因素
const combo = {};
for (const r of OUT) {
  const nec = Object.entries(r.cls).filter(([, v]) => v === 'necessary').map(([k]) => k).sort();
  const key = nec.length ? nec.join('+') : '(无单独必要因素)';
  combo[key] = (combo[key] || 0) + 1;
}
stat.combo = combo;

// 与旧组合归因交叉（106 = 月破必要 / 35 = 六合必要）
stat.cross106 = OUT.filter((r) => r.cls.yuePo === 'necessary').length;
stat.cross35 = OUT.filter((r) => r.cls.liuhe === 'necessary').length;

fs.writeFileSync(path.join(EV, 'counterfactual-141.json'), JSON.stringify({ stat, records: OUT }, null, 1), 'utf8');

const L = [];
L.push('141 条吉→凶 反事实归因核验');
L.push('='.repeat(76));
L.push(`目标 ${stat.total} 条（完整候选版本下 levelPre>0 且 levelPost<0，且日破通道参与）`);
L.push('');
L.push('撤销单个因素后的结果分类：');
L.push('  necessary  必要因素 —— 撤销后不再吉→凶');
L.push('  joint      共同贡献 —— 撤销后仍吉→凶，但分数变化');
L.push('  background 背景因素 —— 撤销后分数档位都不变');
L.push('');
for (const [k, v] of Object.entries(stat.byFactor)) {
  const label = { ribo: '撤销日破新增', yuePo: '撤销月破失气', liuhe: '撤销六合名单', chong: '撤销六冲名单' }[k];
  L.push(`${label.padEnd(14)} 必要 ${String(v.necessary).padStart(4)} | 共同 ${String(v.joint).padStart(4)} | 背景 ${String(v.background).padStart(4)}`);
}
L.push('');
L.push('── 分数贡献分布（撤销单因素后 full.score - 变体.score）──');
for (const k of ['ribo', 'yuePo', 'liuhe', 'chong']) {
  const label = { ribo: '日破新增', yuePo: '月破失气', liuhe: '六合名单', chong: '六冲名单' }[k];
  const d = dist[k];
  const parts = Object.keys(d).map(Number).sort((a, b) => a - b).map((v) => `${v > 0 ? '+' : ''}${v}分×${d[v]}`);
  L.push(`  ${label.padEnd(8)} ${parts.join('  ')}`);
}
L.push('');
L.push('── 规则级权重贡献（Δw 拆解，证明总分差 ≠ 单规则扣分）──');
for (const k of ['ribo', 'yuePo', 'liuhe', 'chong']) {
  const label = { ribo: '撤销日破', yuePo: '撤销月破失气', liuhe: '撤销六合名单', chong: '撤销六冲名单' }[k];
  L.push(`  ${label}`);
  for (const [sig, n] of Object.entries(ruleDist[k]).sort((a, b) => b[1] - a[1])) {
    L.push(`    ${String(n).padStart(4)} 条  Δw={${sig}}`);
  }
}
L.push('');
L.push('── 必要因素组合分布 ──');
for (const [k, n] of Object.entries(combo).sort((a, b) => b[1] - a[1])) {
  L.push(`  ${String(n).padStart(4)} 条  必要因素={${k}}`);
}
L.push('');
L.push(`── 与旧组合归因交叉 ──`);
L.push(`  月破失气为必要因素 ${stat.cross106} 条（旧分组 106）`);
L.push(`  六合名单为必要因素 ${stat.cross35} 条（旧分组 35）`);
L.push('');
L.push('── 撤销日破后仍为凶的 108 条（共同贡献）示例 ──');
for (const r of OUT.filter((x) => x.cls.ribo === 'joint').slice(0, 6)) {
  L.push(`  [${r.mask}] ${r.monthZhi}/${r.dayZhi} ${r.domain} ${r.benGua}  full ${r.full.score}(L${r.full.level}) → noRibo ${r.noRibo.score}(L${r.noRibo.level})  Δw={${JSON.stringify(r.dW.ribo)}}`);
}
L.push('');
L.push('逐条明细（前 40 条）：');
L.push('-'.repeat(76));
for (const r of OUT.slice(0, 40)) {
  L.push(`[${r.mask}] ${r.monthZhi}/${r.dayZhi} ${r.domain} ${r.benGua}`);
  L.push(`  full ${r.full.score}(L${r.full.level})  noRibo ${r.noRibo.score}(L${r.noRibo.level})  noYuePo ${r.noYuePo.score}(L${r.noYuePo.level})  noLiuhe ${r.noLiuhe.score}(L${r.noLiuhe.level})  noChong ${r.noChong.score}(L${r.noChong.level})`);
  L.push(`  归因: ribo=${r.cls.ribo} yuePo=${r.cls.yuePo} liuhe=${r.cls.liuhe} chong=${r.cls.chong}`);
}
fs.writeFileSync(path.join(EV, 'counterfactual-141.txt'), L.join('\n'), 'utf8');
console.log(L.slice(0, 20).join('\n'));
console.log(`\n输出 ${EV}/counterfactual-141.json / .txt`);
