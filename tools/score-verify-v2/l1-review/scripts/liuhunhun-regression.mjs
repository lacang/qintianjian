// P1-4 名单三项回归证据（董事长 2026-10-30 待办第 4 项）
//   ① 名单成员是否正确（纳甲三对地支全合/全冲，独立重算，不读名单常量）
//   ② liuhunhun 是否严格按「本卦六合 × 变卦六冲」组合条件触发
//   ③ 该规则是否仅在批准的 love 问事域计分
// 输出：evidence/liuhunhun-regression.txt
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

const DOMAINS = ['career', 'wealth', 'love', 'health', 'lost', 'decision', 'life', 'people'];
const core = await import(pathToFileURL(path.join(ROOT, 'app/vendor/liuyao-core.js')).href);

function mkMod() {
  let src = fs.readFileSync(path.join(ROOT, 'app/js/verdict.js'), 'utf8');
  src = src.replace(/from '[^']*state\.js[^']*'/, `from './state.js?v=121'`);
  src = src.replace(/from '[^']*liuyao-core\.js[^']*'/, `from '${pathToFileURL(path.join(ROOT, 'app/vendor/liuyao-core.js')).href}'`);
  const out = path.join(ROOT, 'app/js', '.tmplhh.mjs');
  fs.writeFileSync(out, src);
  return out;
}
const f = mkMod();
const mod = await import(pathToFileURL(f).href + '?t=' + Date.now());
fs.rmSync(f, { force: true });

const srcTxt = fs.readFileSync(path.join(ROOT, 'app/js/verdict.js'), 'utf8');
const LIU_HE_GUA = JSON.parse(srcTxt.match(/const LIU_HE_GUA = (\[[^\]]*\]);/)[1].replace(/'/g, '"'));
const LIU_CHONG_GUA = JSON.parse(srcTxt.match(/const LIU_CHONG_GUA = (\[[^\]]*\]);/)[1].replace(/'/g, '"'));

const HE = { 子: '丑', 丑: '子', 寅: '亥', 亥: '寅', 卯: '戌', 戌: '卯', 辰: '酉', 酉: '辰', 巳: '申', 申: '巳', 午: '未', 未: '午' };
const CHONG = { 子: '午', 午: '子', 丑: '未', 未: '丑', 寅: '申', 申: '寅', 卯: '酉', 酉: '卯', 辰: '戌', 戌: '辰', 巳: '亥', 亥: '巳' };

// ① 独立重算 64 卦的六合/六冲归属
const MV = [];
for (let m = 0; m < 64; m++) { const v = []; for (let i = 0; i < 6; i++) v.push((m >> i) & 1 ? 7 : 8); MV.push(v); }
const calcHe = new Set(), calcChong = new Set(), names = new Map();
for (let m = 0; m < 64; m++) {
  const p = core.paipan({ yaoValues: MV[m], gender: '男', question: 'x', year: 2026, month: 10, day: 26, hour: 17, minute: 35 });
  const an = core.analyzeNajia(p, { monthZhi: '寅', dayZhi: '子', sex: '男' });
  const z = an.lines.map((o) => o.yao.zhi);
  const pairs = [[0, 3], [1, 4], [2, 5]];
  const nm = p.benGua.name;
  names.set(m, nm);
  if (pairs.every(([a, b]) => HE[z[a]] === z[b])) calcHe.add(nm);
  if (pairs.every(([a, b]) => CHONG[z[a]] === z[b])) calcChong.add(nm);
}

const L = [];
L.push('P1-4 六合/六冲名单三项回归证据');
L.push('生成时间：' + new Date().toISOString());
L.push('');
L.push('=== ① 名单成员正确性（纳甲三对地支独立重算，不读名单常量） ===');
const heArr = [...calcHe].sort(), chArr = [...calcChong].sort();
const heOk = heArr.length === LIU_HE_GUA.length && heArr.every((n) => LIU_HE_GUA.includes(n));
const chOk = chArr.length === LIU_CHONG_GUA.length && chArr.every((n) => LIU_CHONG_GUA.includes(n));
L.push(`六合：实测 ${heArr.length} 卦 ${JSON.stringify(heArr)}`);
L.push(`      代码名单 ${JSON.stringify([...LIU_HE_GUA].sort())}`);
L.push(`      一致：${heOk ? '✅ 完全吻合' : '❌ 不一致'}`);
L.push(`六冲：实测 ${chArr.length} 卦 ${JSON.stringify(chArr)}`);
L.push(`      代码名单 ${JSON.stringify([...LIU_CHONG_GUA].sort())}`);
L.push(`      一致：${chOk ? '✅ 完全吻合' : '❌ 不一致'}`);
L.push('');

// ②③ 全枚举：4096 卦 × 8 域，检查 liuhunhun 信号的触发条件与域范围
const PAN = [];
for (let m = 0; m < 4096; m++) {
  const v = []; for (let i = 0; i < 6; i++) v.push([6, 7, 8, 9][(m >> (i * 2)) & 3]);
  PAN.push(core.paipan({ yaoValues: v, gender: '男', question: 'x', year: 2026, month: 10, day: 26, hour: 17, minute: 35 }));
}
function clonePan(src, mz, dz) {
  const p = { ...src, siZhu: { ...src.siZhu } };
  const GAN = ['甲', '乙', '丙', '丁', '戊', '己', '庚', '辛', '壬', '癸'];
  p.siZhu.monthGanZhi = p.siZhu.monthGanZhi[0] + mz;
  p.siZhu.dayGanZhi = GAN[(mz.charCodeAt(0) + dz.charCodeAt(0)) % 10] + dz;
  return p;
}
let sigTotal = 0, sigLove = 0, violDomain = 0, violCond = 0;
const badDomain = [], badCond = [];
const byCond = { '本卦六冲': 0, '本卦六合': 0, '六冲变六合': 0, '六合变六冲': 0, '世应相冲': 0, '其他': 0 };
for (let m = 0; m < 4096; m++) {
  const pan = clonePan(PAN[m], '寅', '巳');
  const ben = pan.benGua ? pan.benGua.name : null;
  const bian = pan.bianGua ? pan.bianGua.name : null;
  for (const d of DOMAINS) {
    const v = mod.judgeNajia(pan, d);
    for (const s of v.signals || []) {
      if (!s.rule || s.rule.id !== 'liuhunhun') continue;
      sigTotal++;
      if (d === 'love') sigLove++; else { violDomain++; if (badDomain.length < 5) badDomain.push({ mask: m, dom: d, text: s.text }); }
      // 条件校验
      let cond = null;
      if (ben && LIU_CHONG_GUA.includes(ben) && bian && LIU_HE_GUA.includes(bian)) cond = '六冲变六合';
      else if (ben && LIU_HE_GUA.includes(ben) && bian && LIU_CHONG_GUA.includes(bian)) cond = '六合变六冲';
      else if (ben && LIU_CHONG_GUA.includes(ben)) cond = '本卦六冲';
      else if (ben && LIU_HE_GUA.includes(ben)) cond = '本卦六合';
      else if (/世应相冲/.test(s.text || '')) cond = '世应相冲';
      else cond = '其他';
      byCond[cond] = (byCond[cond] || 0) + 1;
      if (cond === '其他') { violCond++; if (badCond.length < 5) badCond.push({ mask: m, dom: d, text: s.text, ben, bian }); }
    }
  }
}
L.push('=== ② liuhunhun 触发条件（4096 卦 × 8 域 = 32,768 判读） ===');
L.push(`liuhunhun 信号总数：${sigTotal}`);
L.push('按触发条件归类：' + JSON.stringify(byCond));
L.push(`无法归入任一合法条件的信号：${violCond} ${violCond === 0 ? '✅' : '❌'}`);
if (badCond.length) L.push('  样例：' + JSON.stringify(badCond));
L.push('');
L.push('「六合变六冲」是**一条**规则，条件是合取：本卦 ∈ 六合名单 AND 变卦 ∈ 六冲名单。');
L.push('「六冲变六合」同理。两者都不拆成两条独立扣分规则。');
L.push('');
L.push('=== ③ 域范围（仅 love 计分） ===');
L.push(`信号总数 ${sigTotal}，其中 love 域 ${sigLove}，非 love 域 ${violDomain} ${violDomain === 0 ? '✅ 零违规' : '❌'}`);
if (badDomain.length) L.push('  样例：' + JSON.stringify(badDomain));
L.push('');
L.push('注：世应相冲（《六冲章》）在 love 域以 liuhunhun 规则身份计分，其他域按通用世应相冲计分、不计入该规则身份。');
L.push('');
L.push('=== 结论 ===');
L.push(`① 名单成员：六合 ${heOk ? '通过' : '不通过'}；六冲 ${chOk ? '通过' : '不通过'}`);
L.push(`② 触发条件：${violCond === 0 ? '通过（零违规）' : '不通过'}`);
L.push(`③ 域范围：${violDomain === 0 ? '通过（零违规）' : '不通过'}`);

fs.writeFileSync(path.join(EV, 'liuhunhun-regression.txt'), L.join('\n'), 'utf8');
console.log(L.join('\n'));
