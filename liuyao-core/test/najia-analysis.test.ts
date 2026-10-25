/**
 * M7 纳甲断卦·事实分析层验收（najiaAnalysis + wangshuai + wuxing-rel）。
 *
 * 红线：只输出《增删卜易》体系下的确定性盘面事实（旺衰/月破/旬空/墓绝/
 *      动变回头生克/进退神/类神定位/世应关系），绝不下吉凶、成败、应期断语。
 *
 * 对账卦例：2024-11-15 10:30（乙亥月 癸未日，旬空申酉），
 *   六爻自下而上 castManual 阳动/阴/阴/阴/阳静/阴动 → yaoValues 9/8/8/8/7/6，
 *   得水雷屯（坎宫水）之风地观，初爻、上爻动。
 *   本卦纳甲六亲：初 庚子 兄弟(动) 二 庚寅 子孙(世) 三 庚辰 官鬼
 *               四 戊申 父母(旬空) 五 戊戌 官鬼(应) 上 戊子 兄弟(动)
 *   妻财不上卦，戊午火伏三爻庚辰官鬼之下（伏生飞），午火绝亥、死于月、日合未。
 */
import { describe, expect, it } from 'vitest';
import { castManual, paipan, solarToSiZhu } from '../src/index.js';
import {
  WUXING_SHENG, WUXING_KE, relationOf, LIU_CHONG, LIU_HE,
  CHANG_SHENG, huaJinTui,
} from '../src/wuxing-rel.js';
import { lingTaiOf, evalYao } from '../src/wangshuai.js';
import { analyzeNajia } from '../src/najiaAnalysis.js';
import type { DiZhi, Pan } from '../src/types.js';

const T = { year: 2024, month: 11, day: 15, hour: 10, minute: 30 };

function fuPan(): { pan: Pan; monthZhi: DiZhi; dayZhi: DiZhi } {
  const sz = solarToSiZhu(T);
  const pan = paipan({
    yaoValues: castManual([
      { yinYang: '阳', moving: true }, // 初 老阳9
      { yinYang: '阴' },               // 二 少阴8
      { yinYang: '阴' },               // 三
      { yinYang: '阴' },               // 四
      { yinYang: '阳' },               // 五 少阳7（静）
      { yinYang: '阴', moving: true }, // 上 老阴6
    ]),
    ...T,
    gender: '男',
    question: '测财运',
  });
  return { pan, monthZhi: sz.monthZhi, dayZhi: sz.dayZhi };
}

describe('五行关系基础表', () => {
  it('相生相克链正确', () => {
    expect(WUXING_SHENG).toEqual({ 金: '水', 水: '木', 木: '火', 火: '土', 土: '金' });
    expect(WUXING_KE).toEqual({ 金: '木', 木: '土', 土: '水', 水: '火', 火: '金' });
  });
  it('relationOf 五向', () => {
    expect(relationOf('木', '火')).toBe('生');
    expect(relationOf('木', '土')).toBe('克');
    expect(relationOf('木', '木')).toBe('同');
    expect(relationOf('木', '水')).toBe('被生');
    expect(relationOf('木', '金')).toBe('被克');
  });
  it('六冲六合对称', () => {
    (['子', '卯', '寅', '巳', '辰', '丑'] as DiZhi[]).forEach((z) => {
      expect(LIU_CHONG[LIU_CHONG[z]]).toBe(z);
    });
    expect(LIU_CHONG['子']).toBe('午');
    expect(LIU_HE['子']).toBe('丑');
    expect(LIU_HE['寅']).toBe('亥');
  });
  it('火土同宫：土长生寅、帝旺午、墓戌、绝亥', () => {
    expect(CHANG_SHENG['土']).toEqual({ zhangsheng: '寅', diwang: '午', mu: '戌', jue: '亥' });
    expect(CHANG_SHENG['火']).toEqual(CHANG_SHENG['土']);
  });
  it('进神退神（同类五行顺/逆）', () => {
    expect(huaJinTui('寅', '卯')).toBe('进神');
    expect(huaJinTui('申', '酉')).toBe('进神');
    expect(huaJinTui('酉', '申')).toBe('退神');
    expect(huaJinTui('子', '午')).toBeNull();
  });
});

describe('月令旺衰', () => {
  it('当令旺、令生相、生令休、克令囚、令克死', () => {
    expect(lingTaiOf('水', '水')).toBe('旺'); // 亥月子水当令
    expect(lingTaiOf('木', '水')).toBe('相'); // 令生爻
    expect(lingTaiOf('金', '水')).toBe('休'); // 爻生令
    expect(lingTaiOf('土', '水')).toBe('囚'); // 爻克令
    expect(lingTaiOf('火', '水')).toBe('死'); // 令克爻
  });
});

describe('水雷屯之风地观（乙亥月癸未日，空申酉）', () => {
  const { pan, monthZhi, dayZhi } = fuPan();
  const an = analyzeNajia(pan, { monthZhi, dayZhi, sex: '男' });

  it('历法锚点', () => {
    expect(monthZhi).toBe('亥');
    expect(dayZhi).toBe('未');
    expect(pan.xunKong).toEqual(['申', '酉']);
  });

  it('卦宫五行与世应', () => {
    expect(pan.benGua.name).toBe('水雷屯');
    expect(pan.benGua.gongWuXing).toBe('水');
    expect(pan.benGua.shiPosition).toBe(2);
    expect(pan.benGua.yingPosition).toBe(5);
    expect(pan.bianGua?.name).toBe('风地观');
    expect(an.meta.shiPos).toBe(2);
    expect(an.meta.yingPos).toBe(5);
  });

  it('本卦纳甲六亲六神自下而上', () => {
    const got = an.lines.map((l) => `${l.pos}:${l.naJia}${l.liuQin}${l.liuShen}${l.moving ? '动' : ''}${l.shi ? '世' : ''}${l.ying ? '应' : ''}`);
    expect(got).toEqual([
      '1:庚子兄弟玄武动',
      '2:庚寅子孙青龙世',
      '3:庚辰官鬼朱雀',
      '4:戊申父母勾陈',
      '5:戊戌官鬼螣蛇应',
      '6:戊子兄弟白虎动',
    ]);
  });

  it('二爻寅木子孙持世：相于月、月合、长生、入墓、爻克日', () => {
    const s = an.shiState!;
    expect(s.lingTai).toBe('相');
    expect(s.yueHe).toBe(true);    // 寅亥合
    expect(s.changSheng).toBe(true); // 木长生在亥
    expect(s.ruMu).toBe(true);     // 木墓在未
    expect(s.riRole).toBe('爻克日建');
  });

  it('初爻子水兄弟动化未土官鬼=回头克', () => {
    const d1 = an.dong.find((d) => d.pos === 1)!;
    expect(d1.bian?.zhi).toBe('未');
    expect(d1.bian?.wuXing).toBe('土');
    expect(d1.state.huaTouKe).toBe(true);
    expect(d1.state.huaTouSheng).toBe(false);
  });

  it('上爻子水兄弟动化卯木子孙，非回头生克', () => {
    const d6 = an.dong.find((d) => d.pos === 6)!;
    expect(d6.bian?.zhi).toBe('卯');
    expect(d6.state.huaTouKe).toBe(false);
    expect(d6.state.huaTouSheng).toBe(false);
  });

  it('四爻申金父母旬空', () => {
    expect(an.lines[3].liuQin).toBe('父母');
    expect(an.lines[3].state.xunKong).toBe(true);
  });

  it('妻财不上卦，戊午火伏三爻官鬼之下，绝亥、死于月、日合未、伏生飞', () => {
    expect(an.byLiuQin['妻财'].filter((o) => !o.hidden)).toHaveLength(0);
    const fu = an.byLiuQin['妻财'].filter((o) => o.hidden);
    expect(fu).toHaveLength(1);
    const f = fu[0];
    expect(f.pos).toBe(3);
    expect(f.naJia).toBe('戊午');
    expect(f.hiddenUnder).toBe('庚辰官鬼');
    expect(f.feiFuRelation).toBe('伏生飞');
    expect(f.state.fengJue).toBe(true); // 火绝于亥
    expect(f.state.lingTai).toBe('死'); // 亥水克午火
    expect(f.state.yuePo).toBe(false);  // 亥冲巳不冲午
    expect(f.state.riHe).toBe(true);    // 午未合
  });

  it('动爻恰两位（初、上）', () => {
    expect(an.dong.map((d) => d.pos).sort()).toEqual([1, 6]);
  });

  it('财运用神=妻财，明现不上卦而以伏神呈现', () => {
    const y = an.yongshen['财运'];
    expect(y.primary).toEqual(['妻财']);
    expect(y.useYing).toBe(false);
    expect(y.occurrences).toHaveLength(1);
    expect(y.occurrences[0].hidden).toBe(true);
  });

  it('感情域男占取妻财、女占取官鬼', () => {
    const male = analyzeNajia(pan, { monthZhi, dayZhi, sex: '男' }).yongshen['感情'];
    const female = analyzeNajia(pan, { monthZhi, dayZhi, sex: '女' }).yongshen['感情'];
    expect(male.primary).toEqual(['妻财']);
    expect(female.primary).toEqual(['官鬼']);
  });

  it('合作域以应爻为用神（五爻官鬼）', () => {
    const y = an.yongshen['合作'];
    expect(y.useYing).toBe(true);
    expect(y.occurrences[0].pos).toBe(5);
  });

  it('关系文案为中性关系句，无"被生世爻"式拗口语序', () => {
    const desc = an.relations.map((r) => r.desc).join('\n');
    expect(/被[生克]世爻/.test(desc)).toBe(false);
  });
});

describe('伏吟反吟与静卦', () => {
  it('动而化同位地支=伏吟；化冲=反吟', () => {
    const base = { wuXing: '木' as const, monthZhi: '卯' as DiZhi, dayZhi: '子' as DiZhi, xunKong: ['戌', '亥'] as [DiZhi, DiZhi] };
    const fy = evalYao({ ...base, zhi: '卯', moving: true, bianZhi: '卯' });
    const fan = evalYao({ ...base, zhi: '卯', moving: true, bianZhi: '酉' });
    expect(fy.fuYin).toBe(true);
    expect(fan.fanYin).toBe(true);
    expect(fan.fuYin).toBe(false);
  });
});
