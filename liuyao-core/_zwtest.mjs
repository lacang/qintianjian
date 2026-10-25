// 紫微交互层单元测试（无 DOM：纯逻辑 + 字符串产物）
// 说明：FUSE 沙箱下 npm install rename 失败、jsdom 不可用，故只测可脱离真实 DOM 的部分：
//       M8-a：数据层 sanFang、三档高亮判定、棋盘/详情 HTML 结构、复制上下文文本。
//       M8-b：宫干四化（飞化）路径、飞入本宫、飞化高亮档位、双宫对照台与结构关系。
globalThis.localStorage = { getItem: () => null, setItem: () => {}, removeItem: () => {} };

let pass = 0, fail = 0;
const ok = (cond, msg) => { if (cond) { pass++; console.log('  ✓', msg); } else { fail++; console.log('  ✗', msg); } };

const { paiZiwei } = await import('../app/vendor/liuyao-core.js');
const { __zwTest } = await import('../app/js/ziweiview.js');
const {
  setChart, setCompare, detailHtml, copyPalaceContext, hlOf, hlFlyOf, flyPathOf,
  relateOf, compareHtml, copyCompareContext, boardHtml,
} = __zwTest;

// 主人本命：1994-08-01 11:45 沈阳 男（午时）
const CHART = paiZiwei({ year: 1994, month: 8, day: 1, hour: 11, minute: 45, gender: '男' });
setChart(CHART);
const at = (br) => CHART.palaces.find((p) => p.earthlyBranch === br);
const eq = (a, b) => JSON.stringify(a) === JSON.stringify(b);

console.log('【数据层 sanFang】');
ok(at('丑').sanFang.opposite === '未' && eq(at('丑').sanFang.sanhe, ['巳', '酉']), '丑(命宫) 对宫未 + 三合巳酉');
ok(at('未').sanFang.opposite === '丑', '对宫关系对称（未→丑）');
ok(at('子').sanFang.sanhe.includes('申') && at('子').sanFang.sanhe.includes('辰'), '申子辰三合（子）');
ok(at('巳').sanFang.sanhe.includes('酉') && at('巳').sanFang.sanhe.includes('丑'), '巳酉丑三合（巳）');
ok(at('寅').sanFang.sanhe.includes('午') && at('寅').sanFang.sanhe.includes('戌'), '寅午戌三合（寅）');
ok(at('亥').sanFang.sanhe.includes('卯') && at('亥').sanFang.sanhe.includes('未'), '亥卯未三合（亥）');
ok(at('卯').sanFang.opposite === '酉' && at('辰').sanFang.opposite === '戌', '六冲对宫（卯酉/辰戌）');

console.log('【三档高亮判定】');
ok(hlOf('丑', '丑') === 'self', '本宫 = self');
ok(hlOf('丑', '未') === 'opp', '对宫 = opp');
ok(hlOf('丑', '巳') === 'san' && hlOf('丑', '酉') === 'san', '三合 = san');
ok(hlOf('丑', '子') === 'dim', '其余 = dim');
ok(hlOf(null, '丑') === '', '未选中 = 无档');

console.log('【棋盘渲染结构】');
const bh = boardHtml(CHART);
ok((bh.match(/class="zw-cell(?=[ "])/g) || []).length === 12, '12 宫格');
ok((bh.match(/data-br="/g) || []).length === 12, '12 个 data-br');
ok(bh.includes('grid-area:center') && bh.includes('紫微斗数 · 天盘'), '中宫存在');

console.log('【详情面板 detailHtml】');
const d = detailHtml(at('丑'));
ok(d.includes('命宫'), '宫名');
ok(d.includes('紫微') && d.includes('破军'), '主星紫微/破军');
ok((d.match(/data-goto="/g) || []).length >= 3, '三方四正跳转按钮 ≥3');
ok(d.includes('data-goto="未"') && d.includes('data-goto="巳"') && d.includes('data-goto="酉"'), '跳转目标=未/巳/酉');
ok(d.includes('大限'), '大限区间');
ok(d.includes('生年四化'), '生年四化行');
ok(d.includes('zw-copy-palace'), '复制本宫按钮');

console.log('【空宫借对宫】');
const empty = CHART.palaces.find((p) => p.isEmpty);
ok(!!empty, `存在空宫（${empty ? empty.earthlyBranch : '-'}）`);
if (empty) {
  const de = detailHtml(empty);
  ok(de.includes('借对宫'), '空宫提示借对宫');
}

console.log('【M8-b 数据层：宫干四化 flyHua】');
const fh = at('丑').flyHua;
ok(fh.length === 4 && fh.map((f) => f.mutagen).join('') === '禄权科忌', '每宫 4 条且顺序 禄权科忌');
ok(
  fh.map((f) => `${f.mutagen}${f.star}→${f.toBranch}`).join(' ') === '禄太阴→辰 权天同→申 科天机→子 忌巨门→午',
  '命宫丁丑 飞出 禄太阴→辰 权天同→申 科天机→子 忌巨门→午',
);
ok(fh[3].toPalaceName === '仆役', '命宫化忌巨门 落 仆役宫（午）');
ok(at('申').flyHua[0].isSelf === true && at('申').flyHua[0].star === '天梁', '疾厄壬申 禄天梁 自化');
ok(at('戌').flyHua[3].isSelf === true && at('戌').flyHua[3].star === '太阳', '子女甲戌 忌太阳 自化');
ok(CHART.palaces.every((p) => p.flyHua.length === 4 && p.flyHua.every((f) => f.toBranch)), '全盘每宫 4 条且落宫均可定位');
ok(CHART.palaces.every((p) => p.flyHua.every((f) => f.isSelf === (f.toBranch === p.earthlyBranch))), 'isSelf 与落回本宫严格一致');

console.log('【M8-b 数据层：飞入本宫 flyIn】');
const fi = at('丑').flyIn;
ok(
  fi.map((x) => `${x.fromBranch}${x.mutagen}${x.star}`).join(' ') === '申权紫微 酉禄破军 戌权破军 亥科紫微',
  '命宫丑 飞入：申权紫微 酉禄破军 戌权破军 亥科紫微',
);
const byBr = Object.fromEntries(CHART.palaces.map((p) => [p.earthlyBranch, p]));
let reverseOk = true;
for (const a of CHART.palaces) {
  for (const f of a.flyHua) {
    if (!f.toBranch) continue;
    const hit = byBr[f.toBranch].flyIn.some((x) => x.fromBranch === a.earthlyBranch && x.mutagen === f.mutagen && x.star === f.star);
    if (!hit) reverseOk = false;
  }
}
ok(reverseOk, 'flyHua / flyIn 全盘双向一致（穷举 12×4 条）');
ok(CHART.palaces.every((p) => p.flyIn.every((x) => x.isSelf === (x.fromBranch === p.earthlyBranch))), 'flyIn.isSelf 仅本宫自化成立');

console.log('【M8-b 飞化高亮档位】');
ok(hlFlyOf({ fromBr: '丑', toBr: '午' }, '丑') === 'fly-from', '起点 = fly-from');
ok(hlFlyOf({ fromBr: '丑', toBr: '午' }, '午') === 'fly-to', '落点 = fly-to');
ok(hlFlyOf({ fromBr: '丑', toBr: '午' }, '子') === 'dim', '其余 = dim');
ok(hlFlyOf({ fromBr: '申', toBr: '申' }, '申') === 'fly-self', '自化 = fly-self');
ok(hlFlyOf(null, '丑') === '', '无路径 = 无档');

console.log('【M8-b 路径对象 flyPathOf】');
const p0 = flyPathOf(at('丑'), at('丑').flyHua[3]);
ok(p0 && p0.fromBr === '丑' && p0.mutagen === '忌' && p0.star === '巨门' && p0.toBr === '午', '命宫化忌巨门 → 路径 {丑,忌,巨门,午}');
ok(flyPathOf(at('丑'), { mutagen: '禄', star: '太阴', toBranch: '' }) === null, '落宫为空时不生成路径');

console.log('【M8-b 详情面板含飞化区】');
ok(d.includes('宫干四化'), '详情含「宫干四化」区');
ok((d.match(/data-fly="/g) || []).length === 4, '4 条飞化按钮');
ok(d.includes('data-fly="3"') && d.includes('巨门'), '化忌巨门条目存在');
ok(d.includes('飞入本宫'), '命宫含「飞入本宫」清单');
ok(d.includes('zw-cmp-add') && d.includes('加入对照'), '含「加入对照」按钮');
ok(!detailHtml(at('亥')).includes('飞入本宫'), '无飞入的宫位不渲染该行（亥）');

console.log('【M8-b 双宫对照台】');
setCompare(['丑', '酉']);
const cmp = compareHtml();
ok(cmp.includes('对照台') && cmp.includes('zw-cmp-tb'), '对照台结构');
ok(cmp.includes('命宫') && cmp.includes('财帛宫'), '两宫宫职并列');
ok(cmp.includes('宫干四化') && cmp.includes('三方四正') && cmp.includes('大限'), '含宫干四化/三方四正/大限行');
ok(cmp.includes('zw-cmp-rel') && cmp.includes('结构关系'), '含结构关系行');
const rel = relateOf(at('丑'), at('酉'));
ok(rel.includes('互为三合'), '命宫丑 ⇄ 财帛酉 互为三合');
ok(rel.includes('飞化入'), '含客观飞化往来陈述');
ok(relateOf(at('丑'), at('未')).includes('互为对宫'), '命宫丑 ⇄ 迁移未 互为对宫');
ok(relateOf(at('丑'), at('丑')) === '同一宫位', '同宫');
const ccp = copyCompareContext();
ok(ccp.includes('双宫对照') && ccp.includes('结构关系') && ccp.split('\n').length >= 12, `对照复制文本（${ccp.split('\n').length} 行）`);
setCompare([]);
ok(compareHtml() === '', '清空对照台后不渲染');

console.log('【复制本宫上下文】');
const cp = copyPalaceContext('丑');
ok(cp.includes('命宫') && cp.includes('三方四正') && cp.includes('大限'), '含宫名/三方四正/大限');
ok(cp.includes('四柱'), '含四柱');
ok(cp.includes('宫干四化') && cp.includes('巨门'), '含宫干四化路径');
ok(cp.includes('飞入本宫'), '含飞入本宫');
ok(cp.split('\n').length >= 8, `结构化多行（${cp.split('\n').length} 行）`);
console.log(cp.split('\n').map((l) => '  | ' + l).join('\n'));

console.log(`\n总计 ${pass + fail} 项：通过 ${pass}，失败 ${fail}`);
process.exit(fail ? 1 : 0);
