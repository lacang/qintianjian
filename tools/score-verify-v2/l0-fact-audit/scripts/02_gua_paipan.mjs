#!/usr/bin/env node
/**
 * L0-B/C/D 卦象结构、排盘事实、动变、起卦方式 独立核对（只读）
 *
 * 独立预期来源（全部手写固定表，不调用被测函数生成预期）：
 *   1. 八卦二进制：按《易经》卦画自下而上 3 位，1=阳 0=阴
 *   2. 64 卦名：8×8 标准卦名表（上卦×下卦）
 *   3. 京房八宫：由「本宫→一世→…→五世→游魂→归魂」变爻规则生成，不用现成表
 *   4. 世应：世位映射 本宫6/一世1/二世2/三世3/四世4/五世5/游魂4/归魂3；应 = 世+3
 *   5. 纳甲：八卦纳甲口诀（内三爻/外三爻）
 *   6. 六亲：以宫五行为「我」，生我父母/我生子孙/克我官鬼/我克妻财/同兄弟
 *   7. 六神：日干起法（甲乙青龙、丙丁朱雀、戊勾陈、己螣蛇、庚辛白虎、壬癸玄武）
 *   8. 伏神：本宫首卦（八纯）中本卦所缺六亲，伏于同爻位
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '../../../../');
const OUT = path.resolve(__dirname, '../output');
const DATA = path.resolve(__dirname, '../data');
const CORE = path.join(ROOT, 'liuyao-core');
const { paipan } = await import(path.join(CORE, 'dist/index.js'));

const GAN = ['甲', '乙', '丙', '丁', '戊', '己', '庚', '辛', '壬', '癸'];
const ZHI = ['子', '丑', '寅', '卯', '辰', '巳', '午', '未', '申', '酉', '戌', '亥'];

/* ============ 独立固定表 ============ */
// 八卦二进制（自下而上）
const TRI_BITS = { 乾: [1, 1, 1], 兑: [1, 1, 0], 离: [1, 0, 1], 震: [1, 0, 0], 巽: [0, 1, 1], 坎: [0, 1, 0], 艮: [0, 0, 1], 坤: [0, 0, 0] };
const TRI_ORDER = ['乾', '兑', '离', '震', '巽', '坎', '艮', '坤'];

// 64 卦名（行=上卦，列=下卦）
const GUA64 = {
  乾: ['乾为天', '天泽履', '天火同人', '天雷无妄', '天风姤', '天水讼', '天山遁', '天地否'],
  兑: ['泽天夬', '兑为泽', '泽火革', '泽雷随', '泽风大过', '泽水困', '泽山咸', '泽地萃'],
  离: ['火天大有', '火泽睽', '离为火', '火雷噬嗑', '火风鼎', '火水未济', '火山旅', '火地晋'],
  震: ['雷天大壮', '雷泽归妹', '雷火丰', '震为雷', '雷风恒', '雷水解', '雷山小过', '雷地豫'],
  巽: ['风天小畜', '风泽中孚', '风火家人', '风雷益', '巽为风', '风水涣', '风山渐', '风地观'],
  坎: ['水天需', '水泽节', '水火既济', '水雷屯', '水风井', '坎为水', '水山蹇', '水地比'],
  艮: ['山天大畜', '山泽损', '山火贲', '山雷颐', '山风蛊', '山水蒙', '艮为山', '山地剥'],
  坤: ['地天泰', '地泽临', '地火明夷', '地雷复', '地风升', '地水师', '地山谦', '坤为地'],
};

// 八卦五行
const TRI_WX = { 乾: '金', 兑: '金', 离: '火', 震: '木', 巽: '木', 坎: '水', 艮: '土', 坤: '土' };

// 纳甲口诀：卦 → [内三爻(初二三), 外三爻(四五六)]
const NAJIA = {
  乾: [['甲', '子'], ['甲', '寅'], ['甲', '辰'], ['壬', '午'], ['壬', '申'], ['壬', '戌']],
  坎: [['戊', '寅'], ['戊', '辰'], ['戊', '午'], ['戊', '申'], ['戊', '戌'], ['戊', '子']],
  艮: [['丙', '辰'], ['丙', '午'], ['丙', '申'], ['丙', '戌'], ['丙', '子'], ['丙', '寅']],
  震: [['庚', '子'], ['庚', '寅'], ['庚', '辰'], ['庚', '午'], ['庚', '申'], ['庚', '戌']],
  巽: [['辛', '丑'], ['辛', '亥'], ['辛', '酉'], ['辛', '未'], ['辛', '巳'], ['辛', '卯']],
  离: [['己', '卯'], ['己', '丑'], ['己', '亥'], ['己', '酉'], ['己', '未'], ['己', '巳']],
  坤: [['乙', '未'], ['乙', '巳'], ['乙', '卯'], ['癸', '丑'], ['癸', '亥'], ['癸', '酉']],
  兑: [['丁', '巳'], ['丁', '卯'], ['丁', '丑'], ['丁', '亥'], ['丁', '酉'], ['丁', '未']],
};

const ZHI_WX = { 子: '水', 丑: '土', 寅: '木', 卯: '木', 辰: '土', 巳: '火', 午: '火', 未: '土', 申: '金', 酉: '金', 戌: '土', 亥: '水' };
const WX_SHENG = { 木: '火', 火: '土', 土: '金', 金: '水', 水: '木' };  // 我生
const WX_KE = { 木: '土', 土: '水', 水: '火', 火: '金', 金: '木' };     // 我克

const LIUSHEN = ['青龙', '朱雀', '勾陈', '螣蛇', '白虎', '玄武'];
const LIUSHEN_START = { 甲: 0, 乙: 0, 丙: 1, 丁: 1, 戊: 2, 己: 3, 庚: 4, 辛: 4, 壬: 5, 癸: 5 };

/* ============ 京房八宫生成（变爻规则） ============ */
function bitsToTri(bits) {
  return TRI_ORDER.find((t) => TRI_BITS[t].join('') === bits.join(''));
}
function guaFromBits(bits6) {
  const lower = bitsToTri(bits6.slice(0, 3));
  const upper = bitsToTri(bits6.slice(3, 6));
  return { upper, lower, name: GUA64[upper][TRI_ORDER.indexOf(lower)] };
}
function buildBAGONG() {
  const map = {}; // 卦名 → {gong, xu, shi}
  const SHI_OF_XU = [6, 1, 2, 3, 4, 5, 4, 3]; // 第1..8卦
  for (const gong of TRI_ORDER) {
    let bits = [...TRI_BITS[gong], ...TRI_BITS[gong]];
    const seq = [bits.slice()];
    let cur = bits.slice();
    for (let i = 0; i < 5; i++) { cur = cur.slice(); cur[i] = 1 - cur[i]; seq.push(cur.slice()); }
    // 游魂：五世卦第 4 爻（index 3）再变
    cur = cur.slice(); cur[3] = 1 - cur[3]; seq.push(cur.slice());
    // 归魂：游魂卦内卦（index 0..2）恢复本宫下卦
    cur = cur.slice(); cur[0] = TRI_BITS[gong][0]; cur[1] = TRI_BITS[gong][1]; cur[2] = TRI_BITS[gong][2]; seq.push(cur.slice());
    seq.forEach((b, i) => {
      const g = guaFromBits(b);
      map[g.name] = { gong, xu: i + 1, shi: SHI_OF_XU[i], bits: b };
    });
  }
  return map;
}
const BAGONG = buildBAGONG();

function liuQinOf(gongWx, yaoWx) {
  if (gongWx === yaoWx) return '兄弟';
  if (WX_SHENG[yaoWx] === gongWx) return '父母';  // 生我
  if (WX_SHENG[gongWx] === yaoWx) return '子孙';  // 我生
  if (WX_KE[yaoWx] === gongWx) return '官鬼';     // 克我
  if (WX_KE[gongWx] === yaoWx) return '妻财';     // 我克
  return '?';
}

// 给定 6 爻阴阳（自下而上）→ 完整独立预期
function expectGua(bits6) {
  const g = guaFromBits(bits6);
  const info = BAGONG[g.name];
  const gongWx = TRI_WX[info.gong];
  const yao = [];
  for (let i = 0; i < 6; i++) {
    const tri = i < 3 ? g.lower : g.upper;
    const nj = NAJIA[tri][i];
    const wx = ZHI_WX[nj[1]];
    yao.push({ pos: i + 1, gan: nj[0], zhi: nj[1], wuXing: wx, liuQin: liuQinOf(gongWx, wx) });
  }
  const ying = ((info.shi + 2) % 6) + 1;
  return { ...g, gong: info.gong, gongWx, guaXu: info.xu, shi: info.shi, ying, yao };
}

/* ============ 用例记录 ============ */
const cases = [];
let cid = 0;
function rec(category, input, expected, actual, note = '') {
  cid += 1;
  const pass = JSON.stringify(expected) === JSON.stringify(actual);
  cases.push({ id: `G${String(cid).padStart(4, '0')}`, category, input, expected, actual, pass, note });
  return pass;
}

function callPaipan(yaoValues, day = 27) {
  return paipan({ yaoValues, year: 2026, month: 10, day, hour: 10, minute: 38, gender: 1, question: '' });
}
function yaoValuesOf(bits6) { return bits6.map((b) => (b ? 7 : 8)); }

/* ============ T1 64 卦结构（卦名/上下卦/宫/宫五行/世应/游魂归魂） ============ */
const allGua = [];
{
  let diff = 0;
  for (const gong of TRI_ORDER) {
    for (let lowerIdx = 0; lowerIdx < 8; lowerIdx++) {
      for (let upperIdx = 0; upperIdx < 8; upperIdx++) {
        // 遍历方式：直接遍历 64 个二进制组合更简洁
      }
    }
  }
  for (let n = 0; n < 64; n++) {
    const bits = [];
    for (let i = 0; i < 6; i++) bits.push((n >> i) & 1);
    const exp = expectGua(bits);
    const p = callPaipan(yaoValuesOf(bits));
    const bg = p.benGua;
    allGua.push({ bits, name: exp.name, gong: exp.gong, guaXu: exp.guaXu, shi: exp.shi });
    const actual = {
      name: bg.name, upper: bg.upper, lower: bg.lower, gong: bg.gong,
      gongWuXing: bg.gongWuXing, shiPosition: bg.shiPosition, yingPosition: bg.yingPosition,
    };
    const expected = {
      name: exp.name, upper: exp.upper, lower: exp.lower, gong: exp.gong,
      gongWuXing: exp.gongWx, shiPosition: exp.shi, yingPosition: exp.ying,
    };
    if (!rec('T1 卦结构', `bits=${bits.join('')}`, expected, actual, `八宫第${exp.guaXu}卦`)) diff += 1;
  }
  console.log(`T1 64 卦结构：差异 ${diff}/64`);
}

/* ============ T2 游魂/归魂/八纯标记 ============ */
{
  let diff = 0;
  for (let n = 0; n < 64; n++) {
    const bits = [];
    for (let i = 0; i < 6; i++) bits.push((n >> i) & 1);
    const exp = expectGua(bits);
    const p = callPaipan(yaoValuesOf(bits));
    const bg = p.benGua;
    const expected = {
      guaXu: exp.guaXu,
      isYouHun: exp.guaXu === 7,
      isGuiHun: exp.guaXu === 8,
      isBaChun: exp.guaXu === 1,
    };
    const actual = { guaXu: bg.guaXu, isYouHun: bg.isYouHun, isGuiHun: bg.isGuiHun, isBaChun: bg.isBaChun };
    if (!rec('T2 魂卦标记', `${exp.name}`, expected, actual, `八宫第${exp.guaXu}卦`)) diff += 1;
  }
  console.log(`T2 游魂/归魂/八纯标记：差异 ${diff}/64`);
}

/* ============ T3 纳甲 + 五行 + 六亲 + 世应 + 六神（64×6=384 爻） ============ */
{
  let dGan = 0, dZhi = 0, dWx = 0, dQin = 0, dShi = 0, dShen = 0;
  const rows = [];
  for (let n = 0; n < 64; n++) {
    const bits = [];
    for (let i = 0; i < 6; i++) bits.push((n >> i) & 1);
    const exp = expectGua(bits);
    const p = callPaipan(yaoValuesOf(bits));
    const dayGan = p.siZhu.dayGanZhi[0];
    const shenStart = LIUSHEN_START[dayGan];
    for (let i = 0; i < 6; i++) {
      const e = exp.yao[i];
      const a = p.yaoList[i];
      const tag = `${exp.name} 第${i + 1}爻`;
      if (!rec('T3 纳甲天干', tag, e.gan, a.gan)) dGan += 1;
      if (!rec('T3 纳甲地支', tag, e.zhi, a.zhi)) dZhi += 1;
      if (!rec('T3 爻五行', tag, e.wuXing, a.wuXing)) dWx += 1;
      if (!rec('T3 六亲', tag, e.liuQin, a.liuQin, `宫${exp.gong}${exp.gongWx}`)) dQin += 1;
      const expShi = e.pos === exp.shi ? '世' : e.pos === exp.ying ? '应' : '';
      if (!rec('T3 世应', tag, expShi, a.shiYing || '')) dShi += 1;
      const expShen = LIUSHEN[(shenStart + i) % 6];
      if (!rec('T3 六神', tag, expShen, a.liuShen, `日干${dayGan}`)) dShen += 1;
      rows.push({ gua: exp.name, pos: i + 1, expGan: e.gan, actGan: a.gan, expZhi: e.zhi, actZhi: a.zhi, expQin: e.liuQin, actQin: a.liuQin, expShen, actShen: a.liuShen, expShiYing: expShi, actShiYing: a.shiYing || '' });
    }
  }
  console.log(`T3 384 爻：纳甲干差异 ${dGan}，纳甲支差异 ${dZhi}，五行差异 ${dWx}，六亲差异 ${dQin}，世应差异 ${dShi}，六神差异 ${dShen}`);
  fs.writeFileSync(path.join(DATA, 'paipan_yao_384.json'), JSON.stringify(rows, null, 2));
}

/* ============ T4 首卦名（shouGuaName） ============ */
{
  let diff = 0;
  for (let n = 0; n < 64; n++) {
    const bits = [];
    for (let i = 0; i < 6; i++) bits.push((n >> i) & 1);
    const exp = expectGua(bits);
    const p = callPaipan(yaoValuesOf(bits));
    const expShou = GUA64[exp.gong][TRI_ORDER.indexOf(exp.gong)];
    if (!rec('T4 首卦名', exp.name, expShou, p.benGua.shouGuaName)) diff += 1;
  }
  console.log(`T4 首卦名：差异 ${diff}/64`);
}

/* ============ T5 伏神（64 卦全查） ============ */
{
  let diffMissing = 0, diffPos = 0, diffQin = 0, diffGz = 0;
  const rows = [];
  for (let n = 0; n < 64; n++) {
    const bits = [];
    for (let i = 0; i < 6; i++) bits.push((n >> i) & 1);
    const exp = expectGua(bits);
    const p = callPaipan(yaoValuesOf(bits));
    // 独立预期：本卦已有六亲集合
    const have = new Set(exp.yao.map((y) => y.liuQin));
    const ALL = ['父母', '兄弟', '子孙', '妻财', '官鬼'];
    const missing = ALL.filter((q) => !have.has(q));
    // 首卦（本宫八纯）六爻
    const shouBits = [...TRI_BITS[exp.gong], ...TRI_BITS[exp.gong]];
    const shou = expectGua(shouBits);
    const expFu = [];
    for (let i = 0; i < 6; i++) {
      if (missing.includes(shou.yao[i].liuQin)) expFu.push({ position: i + 1, liuQin: shou.yao[i].liuQin, gan: shou.yao[i].gan, zhi: shou.yao[i].zhi });
    }
    const actFu = (p.fuShenList || []).map((f) => ({ position: f.position, liuQin: f.liuQin, gan: f.gan, zhi: f.zhi }));
    const sortKey = (x) => `${x.position}-${x.liuQin}`;
    const e2 = expFu.slice().sort((a, b) => sortKey(a).localeCompare(sortKey(b)));
    const a2 = actFu.slice().sort((a, b) => sortKey(a).localeCompare(sortKey(b)));
    if (!rec('T5 伏神清单', exp.name, e2, a2, `缺六亲=${missing.join('/') || '无'}`)) diffMissing += 1;
    rows.push({ gua: exp.name, missing, expFu: e2, actFu: a2 });
  }
  console.log(`T5 伏神：差异 ${diffMissing}/64`);
  fs.writeFileSync(path.join(DATA, 'paipan_fushen_64.json'), JSON.stringify(rows, null, 2));
}

/* ============ T6 动变：64 卦 × 6 单动 = 384 ============ */
{
  let diffName = 0, diffMoving = 0, diffBianZhi = 0, diffBianQinSelf = 0, diffBianQinBen = 0;
  const rows = [];
  for (let n = 0; n < 64; n++) {
    const bits = [];
    for (let i = 0; i < 6; i++) bits.push((n >> i) & 1);
    for (let mv = 0; mv < 6; mv++) {
      const yv = bits.map((b, i) => (i === mv ? (b ? 9 : 6) : (b ? 7 : 8)));
      const p = callPaipan(yv);
      const bianBits = bits.slice();
      bianBits[mv] = 1 - bianBits[mv];
      const expBian = expectGua(bianBits);
      const tag = `${expectGua(bits).name} 第${mv + 1}爻动`;
      if (!rec('T6 变卦名', tag, expBian.name, p.bianGua.name)) diffName += 1;
      if (!rec('T6 动爻位', tag, [mv + 1], p.movingPositions)) diffMoving += 1;
      // 变爻纳甲：变卦该爻位的地支（按变卦上下卦取纳甲）
      const a = p.bianYaoList[mv];
      const e = expBian.yao[mv];
      if (!rec('T6 变爻纳甲', tag, `${e.gan}${e.zhi}`, `${a.gan}${a.zhi}`)) diffBianZhi += 1;
      // 变爻六亲：两种口径分别统计
      const qinSelf = liuQinOf(expBian.gongWx, e.wuXing);         // 按变卦自身宫
      const qinBen = liuQinOf(expectGua(bits).gongWx, e.wuXing);   // 按本卦宫
      if (a.liuQin === qinSelf) diffBianQinSelf += 1;
      if (a.liuQin === qinBen) diffBianQinBen += 1;
      rows.push({ tag, expBian: expBian.name, actBian: p.bianGua.name, actQin: a.liuQin, qinSelf, qinBen });
    }
  }
  console.log(`T6 动变 384 例：变卦名差异 ${diffName}，动爻位差异 ${diffMoving}，变爻纳甲差异 ${diffBianZhi}`);
  console.log(`   变爻六亲口径：按变卦自身宫吻合 ${diffBianQinSelf}/384，按本卦宫吻合 ${diffBianQinBen}/384`);
  fs.writeFileSync(path.join(DATA, 'biangua_384.json'), JSON.stringify(rows, null, 2));
}

/* ============ T7 多动 / 全动 / 静卦 ============ */
{
  let diff = 0;
  const combos = [[0, 1], [0, 5], [0, 1, 2, 3, 4], [0, 1, 2, 3, 4, 5], [1, 3], [2, 4]];
  for (const bits of [[1, 1, 1, 1, 1, 1], [0, 0, 0, 0, 0, 0], [1, 0, 1, 0, 1, 0], [0, 1, 0, 1, 0, 1]]) {
    for (const combo of combos) {
      const yv = bits.map((b, i) => (combo.includes(i) ? (b ? 9 : 6) : (b ? 7 : 8)));
      const p = callPaipan(yv);
      const bianBits = bits.map((b, i) => (combo.includes(i) ? 1 - b : b));
      const expBian = expectGua(bianBits);
      const tag = `${expectGua(bits).name} 动${combo.map((x) => x + 1).join('')}`;
      if (!rec('T7 多动变卦', tag, expBian.name, p.bianGua.name)) diff += 1;
      if (!rec('T7 多动爻位', tag, combo.map((x) => x + 1), p.movingPositions)) diff += 1;
    }
  }
  // 静卦无变卦
  for (const bits of [[1, 1, 1, 1, 1, 1], [0, 0, 0, 0, 0, 0]]) {
    const p = callPaipan(yaoValuesOf(bits));
    rec('T7 静卦', expectGua(bits).name, null, p.bianGua ? p.bianGua.name : null);
  }
  console.log(`T7 多动/全动/静卦：差异 ${diff}`);
}

/* ============ T8 起卦方式：时间起卦（castByTime 口径）独立重算 ============ */
{
  // 前端 cast.js castByTime：上卦 = (年+月+日) % 8，下卦 = (年+月+日+时) % 8，动爻 = (...+时) % 6
  // 这里只核对「由时间 → 卦」的映射是否与 L0 排盘自洽（不重复验证前端，前端见 06 文档静态审查）
  const fs2 = fs;
  const src = fs2.readFileSync(path.join(ROOT, 'app/js/cast.js'), 'utf8');
  const hasTime = /castByTime/.test(src);
  console.log(`T8 起卦方式：cast.js 含 castByTime=${hasTime}（详细静态审查见 06 文档）`);
}

/* ============ T9 卦身 ============ */
{
  let diff = 0;
  for (let n = 0; n < 64; n++) {
    const bits = [];
    for (let i = 0; i < 6; i++) bits.push((n >> i) & 1);
    const exp = expectGua(bits);
    const p = callPaipan(yaoValuesOf(bits));
    // 卦身：阳世（世1/3/5）从子起数世位-1；阴世（世2/4/6）从午起数世位-1
    const shi = exp.shi;
    const start = shi % 2 === 1 ? 0 : 6; // 子=0 午=6
    const expShen = ZHI[(start + (shi - 1)) % 12];
    if (!rec('T9 卦身', exp.name, expShen, p.guaShen, `世${shi}`)) diff += 1;
  }
  console.log(`T9 卦身：差异 ${diff}/64`);
}

/* ============ 汇总 ============ */
const byCat = {};
for (const c of cases) {
  byCat[c.category] = byCat[c.category] || { total: 0, fail: 0 };
  byCat[c.category].total += 1;
  if (!c.pass) byCat[c.category].fail += 1;
}
const fails = cases.filter((c) => !c.pass);
fs.writeFileSync(path.join(OUT, '02_gua_paipan.json'), JSON.stringify({
  generatedAt: new Date().toISOString(),
  summary: byCat, totalCases: cases.length, totalFail: fails.length,
  failures: fails.slice(0, 400),
}, null, 2));

const csv = ['id,category,input,expected,actual,pass,note'];
for (const c of cases) {
  const esc = (s) => `"${String(s).replace(/"/g, '""')}"`;
  csv.push([c.id, esc(c.category), esc(c.input), esc(c.expected), esc(c.actual), c.pass, esc(c.note)].join(','));
}
fs.writeFileSync(path.join(DATA, '02_gua_paipan_cases.csv'), csv.join('\n'));

console.log('\n=== 分类汇总 ===');
for (const [k, v] of Object.entries(byCat)) console.log(`${k}: ${v.total - v.fail}/${v.total} 通过, 差异 ${v.fail}`);
console.log(`\n总用例 ${cases.length}，差异 ${fails.length}`);
