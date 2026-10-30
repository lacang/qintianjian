#!/usr/bin/env node
/**
 * L0-E 前端展示一致性核对（计算 → 传递映射 → 展示 三分）
 * 只读：仅调用 dist 导出函数 + 静态读取 app/js 源码，不修改任何文件
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '../../../../');
const OUT = path.resolve(__dirname, '../output');
const DATA = path.resolve(__dirname, '../data');
const CORE = path.join(ROOT, 'liuyao-core');
const { paipan, getShouGuaPan, formatCopyText, formatScreen } = await import(path.join(CORE, 'dist/index.js'));

const TRI_BITS = { 乾: [1, 1, 1], 兑: [1, 1, 0], 离: [1, 0, 1], 震: [1, 0, 0], 巽: [0, 1, 1], 坎: [0, 1, 0], 艮: [0, 0, 1], 坤: [0, 0, 0] };

const cases = [];
let cid = 0;
function rec(category, input, expected, actual, note = '') {
  cid += 1;
  const pass = JSON.stringify(expected) === JSON.stringify(actual);
  cases.push({ id: `U${String(cid).padStart(4, '0')}`, category, input, expected, actual, pass, note });
  return pass;
}

function callPaipan(yaoValues, day = 27) {
  return paipan({ yaoValues, year: 2026, month: 10, day, hour: 10, minute: 38, gender: 1, question: '' });
}

/* ---------- U1 藏爻列（getShouGuaPan）阴阳 ---------- */
{
  let diff = 0;
  const rows = [];
  for (const gong of ['乾', '兑', '离', '震', '巽', '坎', '艮', '坤']) {
    const s = getShouGuaPan(gong);
    const act = s.yaoList.map((y) => (y.yinYang === '阳' ? 1 : 0));
    const exp = [...TRI_BITS[gong], ...TRI_BITS[gong]]; // 八纯卦：下三爻=上三爻=本宫
    const ok = rec('U1 藏爻阴阳', `宫=${gong}`, exp.join(''), act.join(''), `八纯卦${gong}为天/地`);
    if (!ok) diff += 1;
    rows.push({ gong, exp: exp.join(''), act: act.join(''), ok });
  }
  console.log(`U1 藏爻列阴阳：差异 ${diff}/8 宫`);
  fs.writeFileSync(path.join(DATA, 'ui_shougua_bits.json'), JSON.stringify(rows, null, 2));
}

/* ---------- U2 藏爻六亲/干支是否仍正确（错误是否只限阴阳） ---------- */
{
  // 八纯卦第 i 爻六亲应为：以本宫五行为「我」推
  const ZHI_WX = { 子: '水', 丑: '土', 寅: '木', 卯: '木', 辰: '土', 巳: '火', 午: '火', 未: '土', 申: '金', 酉: '金', 戌: '土', 亥: '水' };
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
  let diff = 0;
  for (const gong of Object.keys(NAJIA)) {
    const s = getShouGuaPan(gong);
    for (let i = 0; i < 6; i++) {
      const exp = `${NAJIA[gong][i][0]}${NAJIA[gong][i][1]}`;
      const act = `${s.yaoList[i].gan}${s.yaoList[i].zhi}`;
      if (!rec('U2 藏爻干支', `宫=${gong} 第${i + 1}爻`, exp, act)) diff += 1;
    }
  }
  console.log(`U2 藏爻干支：差异 ${diff}/48`);
}

/* ---------- U3 formatCopyText 藏爻段（showHidden=true） ---------- */
{
  let diff = 0;
  const samples = ['兑为泽', '巽为风', '震为雷', '艮为山', '乾为天', '坎为水'];
  const GUA64BITS = { 兑为泽: [1, 1, 0, 1, 1, 0], 巽为风: [0, 1, 1, 0, 1, 1], 震为雷: [1, 0, 0, 1, 0, 0], 艮为山: [0, 0, 1, 0, 0, 1], 乾为天: [1, 1, 1, 1, 1, 1], 坎为水: [0, 1, 0, 0, 1, 0] };
  const rows = [];
  for (const name of samples) {
    const bits = GUA64BITS[name];
    const p = callPaipan(bits.map((b) => (b ? 7 : 8)));
    const txt = formatCopyText(p, { showHidden: true });
    // 藏爻行格式：六亲干支 + 阴阳线（lineOf 输出 ▅▅▅ 或 ▅▅ ▅▅）
    const yangCount = (txt.match(/▅▅▅▅▅/g) || []).length;
    const yinCount = (txt.match(/▅▅　▅▅|▅▅ ▅▅/g) || []).length;
    rows.push({ name, yangCount, yinCount, sample: txt.split('\n').slice(0, 12) });
  }
  fs.writeFileSync(path.join(DATA, 'ui_copytext_sample.json'), JSON.stringify(rows, null, 2));
  console.log('U3 复制文本藏爻段：已取样（阴阳线统计见 data/ui_copytext_sample.json）');
}

/* ---------- U4 行序：展示自上而下 position 6 → 1 ---------- */
{
  const p = callPaipan([7, 8, 7, 9, 7, 6]);
  const vm = formatScreen(p, { showHidden: false });
  const order = vm.lines.map((l) => l.position);
  rec('U4 行序', '泽火革', [6, 5, 4, 3, 2, 1], order, '上爻在最上，初爻在最下');
  // 静态确认 panview 循环
  const pv = fs.readFileSync(path.join(ROOT, 'app/js/panview.js'), 'utf8');
  const loopOk = /for \(let pos = 6; pos >= 1; pos--\)/.test(pv);
  rec('U4 行序(静态)', 'panview.js 循环', true, loopOk);
  console.log(`U4 行序：formatScreen=${JSON.stringify(order)}，panview 循环 6→1=${loopOk}`);
}

/* ---------- U5 变卦列：非动爻不显示六亲干支 ---------- */
{
  const p = callPaipan([7, 8, 7, 9, 7, 6]); // 泽火革，4、6 爻动
  const vm = formatScreen(p, { showHidden: false });
  const bianRest = vm.lines.filter((l) => !l.bian || !l.bian.liuQin).map((l) => l.position);
  // 动爻为 4、6，其余 1/2/3/5 应变卦无六亲
  rec('U5 变卦非动爻', '泽火革 动4、6', [1, 2, 3, 5], bianRest.sort((a, b) => a - b), '非动爻不显示变卦六亲');
  console.log(`U5 变卦非动爻：${JSON.stringify(bianRest.sort((a, b) => a - b))}`);
}

/* ---------- U6 头部标签组合（归魂 + 世位是否自相矛盾） ---------- */
{
  const rows = [];
  for (const [name, bits] of [['雷火丰', [1, 0, 1, 1, 0, 0]], ['地火明夷', [1, 0, 1, 0, 0, 0]], ['地水师', [0, 1, 0, 0, 0, 0]]]) {
    const p = callPaipan(bits.map((b) => (b ? 7 : 8)));
    const tags = [];
    if (p.benGua.specialType) tags.push(p.benGua.specialType);
    if (p.benGua.isGuiHun) tags.push('归魂');
    if (p.benGua.isYouHun) tags.push('游魂');
    if (p.benGua.isBaChun) tags.push('八纯');
    // header 模板严格照抄 app/js/panview.js:53 的真实拼接（无标签时不出括号）
    rows.push({ name, guaXu: p.benGua.guaXu, shi: p.benGua.shiPosition, ying: p.benGua.yingPosition, isGuiHun: p.benGua.isGuiHun, tags, header: `${p.benGua.gong}宫：${p.benGua.name}${tags.length ? `（${tags.join('·')}）` : ''}` });
  }
  fs.writeFileSync(path.join(DATA, 'ui_header_tags.json'), JSON.stringify(rows, null, 2));
  // 预期来源（不调用被测代码）：坎宫八序由「本宫→一世…五世→游魂→归魂」变爻规则现场推出：
  //   坎为水(八纯) → 水雷屯(一世) → 水泽节(二世) → 水地比(三世) → 泽地萃(四世)
  //   → 泽火革(五世) → 雷火丰(游魂) → 地火明夷(归魂)
  // 古法口径（《增删卜易·归魂游魂章》「归魂卦为各宫之第八卦」）：
  //   雷火丰 = 坎宫第六卦（五世）→ 世五应二，不标归魂；
  //   地火明夷 = 坎宫第七卦 → 游魂，世四应一；
  //   地水师  = 坎宫第八卦 → 归魂，世三应六。
  // 【本轮修正】原断言 rec(..., '归魂卦应为八宫第8卦', `第${guaXu}卦`) 的 expected 是描述句、
  //   actual 是「第N卦」，两串恒不相等（设计缺陷，与产品对错无关）。现改为同型可判定断言，
  //   并把覆盖从 1 卦扩展到魂卦三态（更严，非放宽）。
  const EXPECT = [
    { name: '雷火丰', guaXu: 6, shi: 5, ying: 2, tags: [] },
    { name: '地火明夷', guaXu: 7, shi: 4, ying: 1, tags: ['游魂'] },
    { name: '地水师', guaXu: 8, shi: 3, ying: 6, tags: ['归魂'] },
  ];
  for (let i = 0; i < EXPECT.length; i++) {
    const e = EXPECT[i];
    const a = rows[i];
    const fmt = (o) => `${o.guaXu}卦/${o.shi}世${o.ying}应/${o.tags.join('·') || '无魂标签'}`;
    rec('U6 魂卦三态', e.name, fmt(e), fmt(a), `header=${a.header}`);
  }
  console.log('U6 头部标签：', JSON.stringify(rows.map((r) => r.header)));
}

/* ---------- U7 旬空展示：仅日空 ---------- */
{
  const p = callPaipan([7, 7, 7, 7, 7, 7]);
  const txt = formatCopyText(p, { showHidden: false });
  const hasXunKong = /旬空/.test(txt);
  const m = txt.match(/旬空：([^\s）)]+)/);
  rec('U7 旬空展示', '2026-10-27', '申酉', m ? m[1] : null, `仅日旬空，未输出时空亡`);
  console.log(`U7 旬空展示：${m ? m[1] : '(未找到)'}，仅日空=${!!m}`);
}

/* ---------- U8 伏神飞伏关系（64 卦全量） ---------- */
{
  const WX_SHENG = { 木: '火', 火: '土', 土: '金', 金: '水', 水: '木' };
  const WX_KE = { 木: '土', 土: '水', 水: '火', 火: '金', 金: '木' };
  let diff = 0;
  const rows = [];
  for (let n = 0; n < 64; n++) {
    const bits = [];
    for (let i = 0; i < 6; i++) bits.push((n >> i) & 1);
    const p = callPaipan(bits.map((b) => (b ? 7 : 8)));
    for (const f of p.fuShenList || []) {
      const fei = p.yaoList[f.position - 1].wuXing;
      const fu = f.wuXing;
      let exp;
      if (fei === fu) exp = '比和';
      else if (WX_KE[fei] === fu) exp = '飞克伏';
      else if (WX_KE[fu] === fei) exp = '伏克飞';
      else if (WX_SHENG[fei] === fu) exp = '飞生伏';
      else if (WX_SHENG[fu] === fei) exp = '伏生飞';
      else exp = '?';
      const ok = rec('U8 飞伏关系', `${p.benGua.name} 第${f.position}爻 飞${fei}/伏${fu}`, exp, f.relation);
      if (!ok) diff += 1;
      rows.push({ gua: p.benGua.name, pos: f.position, fei, fu, exp, act: f.relation, ok });
    }
  }
  console.log(`U8 飞伏关系：差异 ${diff}/${rows.length}`);
  fs.writeFileSync(path.join(DATA, 'ui_fushen_relation.json'), JSON.stringify(rows, null, 2));
}

/* ---------- 汇总 ---------- */
const byCat = {};
for (const c of cases) {
  byCat[c.category] = byCat[c.category] || { total: 0, fail: 0 };
  byCat[c.category].total += 1;
  if (!c.pass) byCat[c.category].fail += 1;
}
const fails = cases.filter((c) => !c.pass);
fs.writeFileSync(path.join(OUT, '03_ui.json'), JSON.stringify({
  generatedAt: new Date().toISOString(), summary: byCat,
  totalCases: cases.length, totalFail: fails.length, failures: fails,
}, null, 2));
const csv = ['id,category,input,expected,actual,pass,note'];
for (const c of cases) {
  const esc = (s) => `"${String(s).replace(/"/g, '""')}"`;
  csv.push([c.id, esc(c.category), esc(c.input), esc(c.expected), esc(c.actual), c.pass, esc(c.note)].join(','));
}
fs.writeFileSync(path.join(DATA, '03_ui_cases.csv'), csv.join('\n'));

console.log('\n=== 分类汇总 ===');
for (const [k, v] of Object.entries(byCat)) console.log(`${k}: ${v.total - v.fail}/${v.total} 通过, 差异 ${v.fail}`);
console.log(`\n总用例 ${cases.length}，差异 ${fails.length}`);
