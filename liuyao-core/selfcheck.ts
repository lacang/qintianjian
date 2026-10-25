/* eslint-disable no-console */
// 沙箱内 vitest 死锁，用 tsx + node:assert 跑与 test/najia-analysis.test.ts 等价的断言。
import assert from 'node:assert/strict';
import { castManual } from './src/input.js';
import { paipan } from './src/paipan.js';
import { solarToSiZhu } from './src/calendar.js';
import {
  WUXING_SHENG, WUXING_KE, relationOf, LIU_CHONG, LIU_HE,
  CHANG_SHENG, huaJinTui,
} from './src/wuxing-rel.js';
import { lingTaiOf, evalYao } from './src/wangshuai.js';
import { analyzeNajia } from './src/najiaAnalysis.js';
import type { DiZhi, Pan } from './src/types.js';

let pass = 0;
const ok = (name: string, fn: () => void) => { fn(); pass++; console.log('  ✓', name); };

const T = { year: 2024, month: 11, day: 15, hour: 10, minute: 30 };
function fuPan(): { pan: Pan; monthZhi: DiZhi; dayZhi: DiZhi } {
  const sz = solarToSiZhu(T);
  const pan = paipan({
    yaoValues: castManual([
      { yinYang: '阳', moving: true }, { yinYang: '阴' }, { yinYang: '阴' },
      { yinYang: '阴' }, { yinYang: '阳' }, { yinYang: '阴', moving: true },
    ]), ...T, gender: '男', question: '测财运',
  });
  return { pan, monthZhi: sz.monthZhi, dayZhi: sz.dayZhi };
}

console.log('五行关系基础表');
ok('相生相克链', () => {
  assert.deepEqual(WUXING_SHENG, { 金: '水', 水: '木', 木: '火', 火: '土', 土: '金' });
  assert.deepEqual(WUXING_KE, { 金: '木', 木: '土', 土: '水', 水: '火', 火: '金' });
});
ok('relationOf 五向', () => {
  assert.equal(relationOf('木', '火'), '生');
  assert.equal(relationOf('木', '土'), '克');
  assert.equal(relationOf('木', '木'), '同');
  assert.equal(relationOf('木', '水'), '被生');
  assert.equal(relationOf('木', '金'), '被克');
});
ok('六冲六合', () => {
  assert.equal(LIU_CHONG['子'], '午');
  assert.equal(LIU_CHONG[LIU_CHONG['卯']], '卯');
  assert.equal(LIU_HE['子'], '丑');
  assert.equal(LIU_HE['寅'], '亥');
});
ok('火土同宫长生墓绝', () => {
  assert.deepEqual(CHANG_SHENG['土'], { zhangsheng: '寅', diwang: '午', mu: '戌', jue: '亥' });
  assert.deepEqual(CHANG_SHENG['火'], CHANG_SHENG['土']);
});
ok('进神退神', () => {
  assert.equal(huaJinTui('寅', '卯'), '进神');
  assert.equal(huaJinTui('申', '酉'), '进神');
  assert.equal(huaJinTui('酉', '申'), '退神');
  assert.equal(huaJinTui('子', '午'), null);
});

console.log('月令旺衰');
ok('旺相休囚死', () => {
  assert.equal(lingTaiOf('水', '水'), '旺');
  assert.equal(lingTaiOf('木', '水'), '相');
  assert.equal(lingTaiOf('金', '水'), '休');
  assert.equal(lingTaiOf('土', '水'), '囚'); // 土克水，爻克令为囚
  assert.equal(lingTaiOf('火', '水'), '死'); // 水克火，令克爻为死
});

console.log('水雷屯之风地观（乙亥月癸未日，空申酉）');
const { pan, monthZhi, dayZhi } = fuPan();
const an = analyzeNajia(pan, { monthZhi, dayZhi, sex: '男' });
ok('历法锚点 亥月未日空申酉', () => {
  assert.equal(monthZhi, '亥');
  assert.equal(dayZhi, '未');
  assert.deepEqual(pan.xunKong, ['申', '酉']);
});
ok('卦宫五行与世应', () => {
  assert.equal(pan.benGua.name, '水雷屯');
  assert.equal(pan.benGua.gongWuXing, '水');
  assert.equal(an.meta.shiPos, 2);
  assert.equal(an.meta.yingPos, 5);
  assert.equal(pan.bianGua?.name, '风地观');
});
ok('六爻纳甲六亲六神', () => {
  const got = an.lines.map((l) => `${l.pos}:${l.naJia}${l.liuQin}${l.liuShen}${l.moving ? '动' : ''}${l.shi ? '世' : ''}${l.ying ? '应' : ''}`);
  assert.deepEqual(got, [
    '1:庚子兄弟玄武动', '2:庚寅子孙青龙世', '3:庚辰官鬼朱雀',
    '4:戊申父母勾陈', '5:戊戌官鬼螣蛇应', '6:戊子兄弟白虎动',
  ]);
});
ok('二爻寅木子孙持世 相于月/月合/长生/入墓/克日', () => {
  const s = an.shiState!;
  assert.equal(s.lingTai, '相');
  assert.equal(s.yueHe, true);      // 寅亥合
  assert.equal(s.changSheng, true); // 木长生在亥
  assert.equal(s.ruMu, true);       // 木墓在未（日辰）
  assert.equal(s.riRole, '爻克日建'); // 寅木克未土
});
ok('初爻子水兄弟动化未土官鬼=回头克', () => {
  const d1 = an.dong.find((d) => d.pos === 1)!;
  assert.equal(d1.bian?.zhi, '未');
  assert.equal(d1.bian?.wuXing, '土');
  assert.equal(d1.state.huaTouKe, true);
  assert.equal(d1.state.huaTouSheng, false);
});
ok('上爻子水兄弟动化卯木子孙=非回头克生', () => {
  const d6 = an.dong.find((d) => d.pos === 6)!;
  assert.equal(d6.bian?.zhi, '卯');
  assert.equal(d6.state.huaTouKe, false);
  assert.equal(d6.state.huaTouSheng, false);
});
ok('四爻申金父母旬空', () => {
  const c4 = an.lines[3];
  assert.equal(c4.liuQin, '父母');
  assert.equal(c4.state.xunKong, true);
});
ok('妻财不上卦，戊午火伏三爻官鬼下，月破+日合+伏生飞', () => {
  assert.equal(an.byLiuQin['妻财'].filter((o) => !o.hidden).length, 0);
  const fu = an.byLiuQin['妻财'].filter((o) => o.hidden);
  assert.equal(fu.length, 1);
  const f = fu[0];
  assert.equal(f.pos, 3);
  assert.equal(f.naJia, '戊午');
  assert.equal(f.hiddenUnder, '庚辰官鬼');
  assert.equal(f.feiFuRelation, '伏生飞');
  assert.equal(f.state.fengJue, true);  // 火绝于亥（火土同宫）
  assert.equal(f.state.lingTai, '死');  // 亥水克午火，令克爻为死
  assert.equal(f.state.yuePo, false);   // 亥月冲巳不冲午，午不破
  assert.equal(f.state.riHe, true);     // 午未日合
});
ok('动爻两位 初/上', () => {
  assert.deepEqual(an.dong.map((d) => d.pos).sort(), [1, 6]);
});
ok('财运用神妻财 不上卦→absent且列伏神', () => {
  const y = an.yongshen['财运'];
  assert.deepEqual(y.primary, ['妻财']);
  assert.equal(y.useYing, false);
  assert.equal(y.absent, false); // 有伏神，occurrences 非空
  assert.equal(y.occurrences[0].hidden, true);
  assert.ok(y.note.join('').includes('伏神') || y.occurrences.length >= 1);
});
ok('感情 男财女官', () => {
  assert.deepEqual(analyzeNajia(pan, { monthZhi, dayZhi, sex: '男' }).yongshen['感情'].primary, ['妻财']);
  assert.deepEqual(analyzeNajia(pan, { monthZhi, dayZhi, sex: '女' }).yongshen['感情'].primary, ['官鬼']);
});
ok('合作以应为用=五爻官鬼', () => {
  const y = an.yongshen['合作'];
  assert.equal(y.useYing, true);
  assert.equal(y.occurrences[0].pos, 5);
});
ok('关系文案为中性关系句', () => {
  const desc = an.relations.map((r) => r.desc).join('\n');
  assert.ok(desc.includes('克 世爻') || desc.includes('生 世爻') || desc.includes('比和'));
  assert.ok(!/被[生克]世爻/.test(desc)); // 不得再有"X被生世爻"这种别扭语序
});

console.log('伏吟反吟');
ok('化同位=伏吟 化冲=反吟', () => {
  const base = { wuXing: '木' as const, monthZhi: '卯' as DiZhi, dayZhi: '子' as DiZhi, xunKong: ['戌', '亥'] as [DiZhi, DiZhi] };
  const fy = evalYao({ ...base, zhi: '卯', moving: true, bianZhi: '卯' });
  const fan = evalYao({ ...base, zhi: '卯', moving: true, bianZhi: '酉' });
  assert.equal(fy.fuYin, true);
  assert.equal(fan.fanYin, true);
  assert.equal(fan.fuYin, false);
});

console.log(`\n全部通过：${pass} 项断言`);
