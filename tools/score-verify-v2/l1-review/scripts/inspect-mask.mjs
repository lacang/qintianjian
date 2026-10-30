// mask 2565 / 3601 逐项复核（回答董事长问题二、问题三）
// 输出：完整排盘、规则触发、名单判定、前后分数、逐项反事实与权重拆解

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

const VENDOR_PRE = '/tmp/vendor-pre.mjs';
const VENDOR_POST = path.join(ROOT, 'app/vendor/liuyao-core.js');
const corePre = await import(pathToFileURL(VENDOR_PRE).href);
const corePost = await import(pathToFileURL(VENDOR_POST).href);

const DAY_GAN = ['甲', '乙', '丙', '丁', '戊', '己', '庚', '辛', '壬', '癸'];

async function makeMod(file, vendorPath, tag, mode) {
  let src = fs.readFileSync(file, 'utf8');
  src = src.replace(/from '[^']*state\.js[^']*'/, `from './state.js?v=121'`);
  src = src.replace(/from '[^']*liuyao-core\.js[^']*'/, `from '${pathToFileURL(vendorPath).href}'`);
  if (mode) {
    const inject = `
  { const __mode = ${JSON.stringify(mode)};
    for (const __o of an.lines || []) { const __st = __o.state; if (!__st) continue;
      let __lt = __st.lingTai;
      if (__mode === 'noYuePo' && __st.yuePo && __lt === '休') __lt = '旺';
      const __wx = (__lt === '旺' || __lt === '相');
      __st.lingTai = __lt;
      __st.anDong = __st.riChong && __wx;
      __st.riPo = (__mode === 'noRibo') ? (__st.riChong && (__lt === '死' || __lt === '囚')) : (__st.riChong && !__wx);
    } }
`;
    src = src.replace(
      "  const an = analyzeNajia(pan, { monthZhi, dayZhi, sex: pan.gender === '女' ? '女' : '男' });",
      "  const an = analyzeNajia(pan, { monthZhi, dayZhi, sex: pan.gender === '女' ? '女' : '男' });" + inject);
  }
  const out = path.join(ROOT, 'app/js', `.tmpins-${tag}.mjs`);
  fs.writeFileSync(out, src);
  return out;
}
const preSrcTxt = fs.readFileSync(path.join(ROOT, 'tools/score-verify-v2/l1-review/legacy/verdict-v2.mjs'), 'utf8');
const postSrcTxt = fs.readFileSync(path.join(ROOT, 'app/js/verdict.js'), 'utf8');
const OLD_CHONG = JSON.parse(preSrcTxt.match(/const LIU_CHONG_GUA = (\[[^\]]*\]);/)[1].replace(/'/g, '"'));
const OLD_HE = JSON.parse(preSrcTxt.match(/const LIU_HE_GUA = (\[[^\]]*\]);/)[1].replace(/'/g, '"'));
const NEW_CHONG = JSON.parse(postSrcTxt.match(/const LIU_CHONG_GUA = (\[[^\]]*\]);/)[1].replace(/'/g, '"'));
const NEW_HE = JSON.parse(postSrcTxt.match(/const LIU_HE_GUA = (\[[^\]]*\]);/)[1].replace(/'/g, '"'));

function makeVariant(tag, opts) {
  let src = postSrcTxt;
  src = src.replace(/from '[^']*state\.js[^']*'/, `from './state.js?v=121'`);
  src = src.replace(/from '[^']*liuyao-core\.js[^']*'/, `from '${pathToFileURL(VENDOR_POST).href}'`);
  if (opts.oldHe) src = src.replace(/const LIU_HE_GUA = \[[^\]]*\];/, `const LIU_HE_GUA = ${JSON.stringify(OLD_HE)};`);
  if (opts.oldChong) src = src.replace(/const LIU_CHONG_GUA = \[[^\]]*\];/, `const LIU_CHONG_GUA = ${JSON.stringify(OLD_CHONG)};`);
  const out = path.join(ROOT, 'app/js', `.tmpv-${tag}.mjs`);
  fs.writeFileSync(out, src);
  return out;
}

const files = {
  pre: await makeMod(path.join(ROOT, 'tools/score-verify-v2/l1-review/legacy/verdict-v2.mjs'), VENDOR_PRE, 'pre'),
  full: await makeMod(path.join(ROOT, 'app/js/verdict.js'), VENDOR_POST, 'full'),
  noRibo: await makeMod(path.join(ROOT, 'app/js/verdict.js'), VENDOR_POST, 'noribo', 'noRibo'),
  noYuePo: await makeMod(path.join(ROOT, 'app/js/verdict.js'), VENDOR_POST, 'noyuepo', 'noYuePo'),
  noHe: makeVariant('nohe', { oldHe: true }),
  noChong: makeVariant('nochong', { oldChong: true }),
  oldBoth: makeVariant('oldboth', { oldHe: true, oldChong: true }),
};
const M = {};
for (const [k, f] of Object.entries(files)) M[k] = await import(pathToFileURL(f).href + '?t=' + Date.now());
for (const f of Object.values(files)) fs.rmSync(f, { force: true });

function yaoVals(mask) { const v = []; for (let i = 0; i < 6; i++) v.push([6, 7, 8, 9][(mask >> (i * 2)) & 3]); return v; }
function mkPan(core, mask, mz, dz) {
  const pan = core.paipan({ yaoValues: yaoVals(mask), gender: '男', question: 'x', year: 2026, month: 10, day: 26, hour: 17, minute: 35 });
  pan.siZhu.monthGanZhi = pan.siZhu.monthGanZhi[0] + mz;
  pan.siZhu.dayGanZhi = DAY_GAN[(mz.charCodeAt(0) + dz.charCodeAt(0)) % 10] + dz;
  return pan;
}
function aggW(signals) {
  const m = new Map();
  for (const s of signals || []) { const id = (s.rule && s.rule.id) || 'none'; const e = m.get(id) || 0; m.set(id, e + s.w); }
  return m;
}
function diffW(a, b) {
  const ma = aggW(a), mb = aggW(b), out = {};
  for (const id of new Set([...ma.keys(), ...mb.keys()])) {
    const wa = ma.get(id) || 0, wb = mb.get(id) || 0;
    if (wa !== wb) out[id] = wa - wb;
  }
  return out;
}
function dumpLine(o, i) {
  const s = o.state || {};
  const tags = [];
  if (o.moving) tags.push('动');
  if (s.yuePo) tags.push('月破');
  if (s.riChong) tags.push('日冲');
  if (s.anDong) tags.push('暗动');
  if (s.riPo) tags.push('日破');
  if (s.xunKong) tags.push('旬空');
  if (s.yueHe) tags.push('月合');
  if (s.riHe) tags.push('日合');
  if (o.shi) tags.push('世');
  if (o.ying) tags.push('应');
  return `  ${i + 1}爻 ${o.zhi || ''}${o.wuXing || ''} ${o.liuQin || ''} 旺衰=${s.lingTai || ''} ${tags.join('/')}`;
}

const CASES = [
  { mask: 2565, mz: '寅', dz: '巳', dom: 'love' },
  { mask: 3601, mz: '寅', dz: '午', dom: 'love' },
  { mask: 3601, mz: '卯', dz: '午', dom: 'love' },
];

const L = [];
L.push('mask 2565 / 3601 逐项复核');
L.push('='.repeat(78));
L.push(`六合名单  旧 ${OLD_HE.length} 卦: ${OLD_HE.join('、')}`);
L.push(`          新 ${NEW_HE.length} 卦: ${NEW_HE.join('、')}`);
L.push(`          移出: ${OLD_HE.filter((g) => !NEW_HE.includes(g)).join('、') || '无'}`);
L.push(`          移入: ${NEW_HE.filter((g) => !OLD_HE.includes(g)).join('、') || '无'}`);
L.push(`六冲名单  旧 ${OLD_CHONG.length} 卦: ${OLD_CHONG.join('、')}`);
L.push(`          新 ${NEW_CHONG.length} 卦: ${NEW_CHONG.join('、')}`);
L.push(`          移入: ${NEW_CHONG.filter((g) => !OLD_CHONG.includes(g)).join('、') || '无'}`);
L.push('');

for (const c of CASES) {
  const panPost = mkPan(corePost, c.mask, c.mz, c.dz);
  const panPre = mkPan(corePre, c.mask, c.mz, c.dz);
  const anPost = corePost.analyzeNajia(panPost, { monthZhi: c.mz, dayZhi: c.dz, sex: '男' });
  const rPre = M.pre.judgeNajia(panPre, c.dom);
  const rFull = M.full.judgeNajia(panPost, c.dom);
  const rNoRibo = M.noRibo.judgeNajia(panPost, c.dom);
  const rNoYuePo = M.noYuePo.judgeNajia(panPost, c.dom);
  const rNoHe = M.noHe.judgeNajia(panPost, c.dom);
  const rNoChong = M.noChong.judgeNajia(panPost, c.dom);
  const rOldBoth = M.oldBoth.judgeNajia(panPost, c.dom);

  L.push('─'.repeat(78));
  L.push(`【mask ${c.mask}】${c.mz}月 ${c.dz}日 ${c.dom} 域　动爻值 ${yaoVals(c.mask).join(',')}`);
  const bn = panPost.benGua && panPost.benGua.name;
  const bi = panPost.bianGua && panPost.bianGua.name;
  const bnPre = panPre.benGua && panPre.benGua.name;
  const biPre = panPre.bianGua && panPre.bianGua.name;
  L.push(`  本卦 ${bn}　变卦 ${bi}${panPost.bianGua && panPost.bianGua.specialType ? '（' + panPost.bianGua.specialType + '）' : ''}`);
  L.push('  六爻：');
  for (let i = 0; i < (anPost.lines || []).length; i++) L.push(dumpLine(anPost.lines[i], i));
  if (anPost.shi) L.push(`  世爻: ${anPost.shi.pos} 爻`);
  if (anPost.yongshen) L.push(`  用神: ${JSON.stringify(anPost.yongshen).slice(0, 200)}`);
  L.push('');
  L.push('  名单判定：');
  L.push(`    本卦 ${bn}　旧六合=${OLD_HE.includes(bn) ? '是' : '否'}　新六合=${NEW_HE.includes(bn) ? '是' : '否'}　旧六冲=${OLD_CHONG.includes(bn) ? '是' : '否'}　新六冲=${NEW_CHONG.includes(bn) ? '是' : '否'}`);
  if (bi) L.push(`    变卦 ${bi}　旧六合=${OLD_HE.includes(bi) ? '是' : '否'}　新六合=${NEW_HE.includes(bi) ? '是' : '否'}　旧六冲=${OLD_CHONG.includes(bi) ? '是' : '否'}　新六冲=${NEW_CHONG.includes(bi) ? '是' : '否'}`);
  L.push('');
  L.push('  分数与档位：');
  L.push(`    PRE（v121 基线）        ${rPre.score} (L${rPre.level})`);
  L.push(`    POST（完整候选）        ${rFull.score} (L${rFull.level})`);
  L.push(`    撤销日破                ${rNoRibo.score} (L${rNoRibo.level})   Δw=${JSON.stringify(diffW(rFull.signals, rNoRibo.signals))}`);
  L.push(`    撤销月破失气            ${rNoYuePo.score} (L${rNoYuePo.level})   Δw=${JSON.stringify(diffW(rFull.signals, rNoYuePo.signals))}`);
  L.push(`    撤销六合名单修正        ${rNoHe.score} (L${rNoHe.level})   Δw=${JSON.stringify(diffW(rFull.signals, rNoHe.signals))}`);
  L.push(`    撤销六冲名单修正        ${rNoChong.score} (L${rNoChong.level})   Δw=${JSON.stringify(diffW(rFull.signals, rNoChong.signals))}`);
  L.push(`    撤销两份名单修正(真实v121) ${rOldBoth.score} (L${rOldBoth.level})   Δw=${JSON.stringify(diffW(rFull.signals, rOldBoth.signals))}`);
  L.push('');
  L.push('  各变体 liuhunhun 信号：');
  for (const [tag, r] of [['PRE', rPre], ['full', rFull], ['noHe', rNoHe], ['noChong', rNoChong], ['oldBoth', rOldBoth]]) {
    const ls = (r.signals || []).filter((x) => (x.rule && x.rule.id) === 'liuhunhun');
    L.push(`    ${tag.padEnd(8)} ${ls.length ? ls.map((x) => x.w + ':' + x.text.slice(0, 34)).join(' | ') : '(无)'}`);
  }
  L.push('');
  L.push('  PRE 信号：');
  for (const s of rPre.signals || []) L.push(`    ${String(s.w).padStart(3)}  [${(s.rule && s.rule.id) || 'none'}] ${s.text.slice(0, 60)}`);
  L.push('  POST 信号：');
  for (const s of rFull.signals || []) L.push(`    ${String(s.w).padStart(3)}  [${(s.rule && s.rule.id) || 'none'}] ${s.text.slice(0, 60)}`);
  L.push('');
}
fs.writeFileSync(path.join(ROOT, 'tools/score-verify-v2/l1-review/evidence/inspect-mask.txt'), L.join('\n'), 'utf8');
console.log(L.join('\n'));
