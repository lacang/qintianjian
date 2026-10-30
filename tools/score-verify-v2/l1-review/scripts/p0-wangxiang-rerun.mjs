// P0 方案A 候选补丁 · 106 条逐条复核（董事长 2026-10-30 验收标准第 1 项）
//
// 三条路径对照：
//   A0  v121 基线      = legacy verdict + V0 vendor（月破不压旺、riPo=死||囚）
//   A1  现状（压旺版） = 当前 verdict + 当前 vendor + 注入「yuePo&&旺→休」
//   A2  候选（方案A）  = 当前 verdict + 当前 vendor（月破不改写本判旺衰）
//
// 输出：evidence/p0-wangxiang-106.txt / .json
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
const VENDOR_CUR = path.join(ROOT, 'app/vendor/liuyao-core.js');
const VERDICT_PRE = path.join(ROOT, 'tools/score-verify-v2/l1-review/legacy/verdict-v2.mjs');
const VERDICT_CUR = path.join(ROOT, 'app/js/verdict.js');

function mk(tag, verdictPath, vendorPath, injectMode) {
  let src = fs.readFileSync(verdictPath, 'utf8');
  src = src.replace(/from '[^']*state\.js[^']*'/, `from './state.js?v=121'`);
  src = src.replace(/from '[^']*liuyao-core\.js[^']*'/, `from '${pathToFileURL(vendorPath).href}'`);
  if (injectMode) {
    const inject = `
  { for (const __o of an.lines || []) { const __st = __o.state; if (!__st) continue;
      let __lt = __st.lingTai;
      if (${JSON.stringify(injectMode)} === 'reYuePo' && __st.yuePo && __lt === '旺') __lt = '休';
      const __wx = (__lt === '旺' || __lt === '相');
      __st.lingTai = __lt;
      __st.anDong = __st.riChong && __wx;
      __st.riPo = __st.riChong && !__wx;
    } }
`;
    src = src.replace(
      "  const an = analyzeNajia(pan, { monthZhi, dayZhi, sex: pan.gender === '女' ? '女' : '男' });",
      "  const an = analyzeNajia(pan, { monthZhi, dayZhi, sex: pan.gender === '女' ? '女' : '男' });" + inject);
  }
  const out = path.join(ROOT, 'app/js', `.tmpp0-${tag}.mjs`);
  fs.writeFileSync(out, src);
  return out;
}
const fA0 = mk('a0', VERDICT_PRE, VENDOR_PRE, null);
const fA1 = mk('a1', VERDICT_CUR, VENDOR_CUR, 'reYuePo');
const fA2 = mk('a2', VERDICT_CUR, VENDOR_CUR, null);
const mods = {
  A0: await import(pathToFileURL(fA0).href + '?t=' + Date.now()),
  A1: await import(pathToFileURL(fA1).href + '?t=' + Date.now()),
  A2: await import(pathToFileURL(fA2).href + '?t=' + Date.now()),
};
for (const f of [fA0, fA1, fA2]) fs.rmSync(f, { force: true });

const corePre = await import(pathToFileURL(VENDOR_PRE).href + '?t=' + Date.now());
const coreCur = await import(pathToFileURL(VENDOR_CUR).href + '?t=' + Date.now());

const DAY_GAN = ['甲', '乙', '丙', '丁', '戊', '己', '庚', '辛', '壬', '癸'];
const MASKVALS = [];
for (let mask = 0; mask < 4096; mask++) {
  const v = [];
  for (let i = 0; i < 6; i++) v.push([6, 7, 8, 9][(mask >> (i * 2)) & 3]);
  MASKVALS.push(v);
}
const PAN_PRE = [], PAN_CUR = [];
for (let mask = 0; mask < 4096; mask++) {
  const b = { yaoValues: MASKVALS[mask], gender: '男', question: 'x', year: 2026, month: 10, day: 26, hour: 17, minute: 35 };
  PAN_PRE.push(corePre.paipan(b)); PAN_CUR.push(coreCur.paipan(b));
}
function clonePan(src, mz, dz) {
  const pan = { ...src, siZhu: { ...src.siZhu } };
  pan.siZhu.monthGanZhi = pan.siZhu.monthGanZhi[0] + mz;
  pan.siZhu.dayGanZhi = DAY_GAN[(mz.charCodeAt(0) + dz.charCodeAt(0)) % 10] + dz;
  return pan;
}

const src141 = JSON.parse(fs.readFileSync(path.join(EV, 'counterfactual-141.json'), 'utf8'));
const targets = src141.records.filter((r) => r.cls && r.cls.yuePo === 'necessary');
console.log(`106 条目标：${targets.length}`);

const rows = [];
for (const t of targets) {
  const panPre = clonePan(PAN_PRE[t.mask], t.monthZhi, t.dayZhi);
  const panCur = clonePan(PAN_CUR[t.mask], t.monthZhi, t.dayZhi);
  // 用神爻事实（取候选版，与 A2 一致；A1 只在压旺时不同）
  const anPre = corePre.analyzeNajia(panPre, { monthZhi: t.monthZhi, dayZhi: t.dayZhi, sex: '男' });
  const anCur = coreCur.analyzeNajia(panCur, { monthZhi: t.monthZhi, dayZhi: t.dayZhi, sex: '男' });
  // 找用神爻：与 verdict 同口径（第一条用神出现）
  const yPre = anPre.lines.find((o) => o.isYongShen) || anPre.lines[0];
  const yCur = anCur.lines.find((o) => o.isYongShen) || anCur.lines[0];
  const r = { key: t.key, mask: t.mask, mz: t.monthZhi, dz: t.dayZhi, dom: t.domain, gua: t.benGua,
    yao: yCur.yao.zhi, qin: yCur.yao.liuQin,
    A0: null, A1: null, A2: null };
  for (const [k, mod, pan] of [['A0', mods.A0, panPre], ['A1', mods.A1, panCur], ['A2', mods.A2, panCur]]) {
    const v = mod.judgeNajia(pan, t.domain);
    r[k] = { score: v.score, level: v.level };
  }
  // 三条路径下的用神爻状态
  const st0 = yPre.state, stC = yCur.state;
  r.st = {
    lt0: st0.lingTai, yp0: st0.yuePo, rc0: st0.riChong, ad0: st0.anDong, rp0: st0.riPo,
    ltA1: (stC.yuePo && stC.lingTai === '旺') ? '休' : stC.lingTai,
    ltA2: stC.lingTai,
    adA1: stC.riChong && (((stC.yuePo && stC.lingTai === '旺') ? '休' : stC.lingTai) === '旺' || ((stC.yuePo && stC.lingTai === '旺') ? '休' : stC.lingTai) === '相'),
    rpA1: stC.riChong && !((((stC.yuePo && stC.lingTai === '旺') ? '休' : stC.lingTai)) === '旺' || (((stC.yuePo && stC.lingTai === '旺') ? '休' : stC.lingTai)) === '相'),
    adA2: stC.anDong, rpA2: stC.riPo, yp: stC.yuePo, rc: stC.riChong,
  };
  rows.push(r);
}

// 统计
const dist = (f) => { const m = {}; for (const r of rows) { const v = r[f].score; m[v] = (m[v] || 0) + 1; } return m; };
const lv = (f) => { const m = {}; for (const r of rows) { const v = r[f].level; m[v] = (m[v] || 0) + 1; } return m; };
const L = [];
L.push('P0 方案A 候选补丁 · 106 条逐条复核');
L.push('生成时间：' + new Date().toISOString());
L.push('');
L.push('路径定义：');
L.push('  A0 v121 基线     = legacy verdict + V0 vendor');
L.push('  A1 现状（压旺）  = 当前 verdict + 当前 vendor + 注入 yuePo&&旺→休');
L.push('  A2 候选（方案A） = 当前 verdict + 当前 vendor（月破不改写本判旺衰）');
L.push('');
L.push(`条数 ${rows.length}`);
L.push('');
L.push('【档位分布】');
L.push(`  A0 ${JSON.stringify(lv('A0'))}`);
L.push(`  A1 ${JSON.stringify(lv('A1'))}`);
L.push(`  A2 ${JSON.stringify(lv('A2'))}`);
L.push('');
L.push('【分数分布】');
L.push(`  A0 ${JSON.stringify(dist('A0'))}`);
L.push(`  A1 ${JSON.stringify(dist('A1'))}`);
L.push(`  A2 ${JSON.stringify(dist('A2'))}`);
L.push('');
const cnt = (pred) => rows.filter(pred).length;
L.push('【关键计数】');
L.push(`  A1 为凶（level<=-1）: ${cnt(r => r.A1.level <= -1)}`);
L.push(`  A2 为凶（level<=-1）: ${cnt(r => r.A2.level <= -1)}`);
L.push(`  A1 为吉（level>=1） : ${cnt(r => r.A1.level >= 1)}`);
L.push(`  A2 为吉（level>=1） : ${cnt(r => r.A2.level >= 1)}`);
L.push(`  A2 回到 L0（临界）  : ${cnt(r => r.A2.level === 0)}`);
L.push(`  A0 与 A2 完全一致    : ${cnt(r => r.A0.score === r.A2.score && r.A0.level === r.A2.level)}`);
L.push(`  A1 与 A2 分数不同    : ${cnt(r => r.A1.score !== r.A2.score)}`);
L.push(`  分数回升 Δ=${'?'}       : 见下表`);
L.push('');
const dset = {}; for (const r of rows) { const d = r.A2.score - r.A1.score; dset[d] = (dset[d] || 0) + 1; }
L.push(`  A2 - A1 分数差分布   : ${JSON.stringify(dset)}`);
L.push('');
const lvset = {}; for (const r of rows) { const d = `${r.A1.level}→${r.A2.level}`; lvset[d] = (lvset[d] || 0) + 1; }
L.push(`  A1→A2 档位迁移       : ${JSON.stringify(lvset)}`);
L.push('');
L.push('【逐条明细】');
L.push('序号 | mask | 月 | 日 | 域 | 卦 | 用神爻 | 本判旺衰 | 月破 | 日冲 | A0分数/档 | A1旺衰/暗动/日破 分数/档 | A2旺衰/暗动/日破 分数/档');
rows.forEach((r, i) => {
  L.push([
    i + 1, r.mask, r.mz, r.dz, r.dom, r.gua, `${r.qin}${r.yao}`,
    r.st.lt0, r.st.yp ? '是' : '否', r.st.rc ? '是' : '否',
    `${r.A0.score}/${r.A0.level}`,
    `${r.st.ltA1}/${r.st.adA1 ? '暗' : '-'}/${r.st.rpA1 ? '破' : '-'} ${r.A1.score}/${r.A1.level}`,
    `${r.st.ltA2}/${r.st.adA2 ? '暗' : '-'}/${r.st.rpA2 ? '破' : '-'} ${r.A2.score}/${r.A2.level}`,
  ].join(' | '));
});

fs.writeFileSync(path.join(EV, 'p0-wangxiang-106.txt'), L.join('\n'), 'utf8');
fs.writeFileSync(path.join(EV, 'p0-wangxiang-106.json'), JSON.stringify({ rows, dset, lvset }, null, 1), 'utf8');
console.log(L.slice(0, 40).join('\n'));
console.log('\n输出 evidence/p0-wangxiang-106.txt / .json');
