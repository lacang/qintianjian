import { describe, it, expect } from 'vitest';
import { paiBazi, liuNianGanZhiSequence } from '../src/bazi.js';
import type { BaziResult } from '../src/bazi.js';
import {
  baziShenSha, baziRelations, wangShuaiEvidence, liuNian, liuNianList, liuYueList,
  zhiRelations, ganRelations, naYinOf, baziExtra,
} from '../src/bazi-extra.js';

// ============================================================
// 对账用真实命例（四柱由 lunar-javascript 独立排出，另与史载命例比对）
// ============================================================

/** 本人：1994-08-01 11:45 → 甲戌 辛未 己未 庚午（日主己土，日空子丑） */
const BEN = paiBazi({ year: 1994, month: 8, day: 1, hour: 11, minute: 45, gender: '男' });

/** 乾隆：1711-09-25 00:30 → 辛卯 丁酉 庚午 丙子（《清高宗实录》载生辰，子午卯酉四正全） */
const QIANLONG = paiBazi({ year: 1711, month: 9, day: 25, hour: 0, minute: 30, gender: '男' });

/** 曾国藩：1811-11-26 22:30 → 辛未 己亥 丙辰 己亥（《曾国藩年谱》载嘉庆十六年十月十一日亥时） */
const ZENG = paiBazi({ year: 1811, month: 11, day: 26, hour: 22, minute: 30, gender: '男' });

/** 毛泽东：1893-12-26 07:30 → 癸巳 甲子 丁酉 甲辰（史载清光绪十九年十一月十九日辰时） */
const MAO = paiBazi({ year: 1893, month: 12, day: 26, hour: 7, minute: 30, gender: '男' });

/** 校验例：1985-01-03 10:00 → 甲子 丙子 壬寅 乙巳（日主壬水，日空辰巳，十项神煞同现） */
const CASE1985 = paiBazi({ year: 1985, month: 1, day: 3, hour: 10, minute: 0, gender: '男' });

/** 校验例：1985-01-12 10:00 → 甲子 丁丑 辛亥 癸巳（日主辛金，日空寅卯） */
const CASE1985B = paiBazi({ year: 1985, month: 1, day: 12, hour: 10, minute: 0, gender: '男' });

/** 校验例：1994-02-01 10:00（立春 02-04 之前）→ 癸酉 乙丑 戊午 丁巳 */
const BEFORE_LICHUN = paiBazi({ year: 1994, month: 2, day: 1, hour: 10, minute: 0, gender: '男' });

const names = (bz: BaziResult): string[] => baziShenSha(bz).present;
const hitsOf = (bz: BaziResult, name: string): string[] =>
  baziShenSha(bz).hits.filter((h) => h.name === name).map((h) => `${h.ref}${h.refValue}→${h.target}@${h.positions.join(',')}`);

// ============================================================
// 一、神煞（逐项 2 正例 + 1 反例）
// ============================================================
describe('神煞 · 十二项口诀对账', () => {
  it('命例四柱先自洽（对账前提）', () => {
    expect(QIANLONG.year.ganZhi + QIANLONG.month.ganZhi + QIANLONG.day.ganZhi + QIANLONG.time.ganZhi)
      .toBe('辛卯丁酉庚午丙子');
    expect(ZENG.year.ganZhi + ZENG.month.ganZhi + ZENG.day.ganZhi + ZENG.time.ganZhi)
      .toBe('辛未己亥丙辰己亥');
    expect(MAO.year.ganZhi + MAO.month.ganZhi + MAO.day.ganZhi + MAO.time.ganZhi)
      .toBe('癸巳甲子丁酉甲辰');
    expect(BEN.year.ganZhi + BEN.month.ganZhi + BEN.day.ganZhi + BEN.time.ganZhi)
      .toBe('甲戌辛未己未庚午');
  });

  it('1 天乙贵人：甲戊庚牛羊、乙己鼠猴乡、丙丁猪鸡位、壬癸兔蛇藏、六辛逢马虎', () => {
    // 正例①乾隆：年干辛 → 午、寅，日支午命中
    expect(hitsOf(QIANLONG, '天乙贵人')).toContain('年干辛→午@day');
    // 正例②曾国藩：日干丙 → 亥、酉，月时两亥命中
    expect(hitsOf(ZENG, '天乙贵人')).toContain('日干丙→亥@month,time');
    // 正例③毛泽东：日干丁 → 亥、酉，日支酉命中
    expect(hitsOf(MAO, '天乙贵人')).toContain('日干丁→酉@day');
    // 反例：本人日干己 → 子申、年干甲 → 丑未，四柱无子申丑未（有未！→ 命中）
    expect(names(BEN)).toContain('天乙贵人'); // 年干甲见未
    // 反例：乾隆日干庚 → 丑未，四柱无丑未
    expect(hitsOf(QIANLONG, '天乙贵人').every((s) => !s.startsWith('日干庚'))).toBe(true);
  });

  it('2 文昌：甲乙巳午、丙戊申、丁己酉、庚亥、辛子、壬寅、癸卯', () => {
    expect(hitsOf(QIANLONG, '文昌')).toContain('年干辛→子@time'); // 正例①
    expect(hitsOf(MAO, '文昌')).toContain('日干丁→酉@day');      // 正例②
    expect(hitsOf(CASE1985, '文昌')).toContain('日干壬→寅@day'); // 正例③
    expect(names(ZENG)).not.toContain('文昌');                    // 反例：丙→申、辛→子，俱无
  });

  it('3 驿马：申子辰马在寅、寅午戌马在申、巳酉丑马在亥、亥卯未马在巳', () => {
    expect(hitsOf(CASE1985, '驿马')).toContain('年支子→寅@day');   // 正例①
    expect(names(CASE1985B)).toContain('驿马');                    // 正例②：日支亥→巳、年支子→寅
    expect(names(QIANLONG)).not.toContain('驿马');                 // 反例：午→申、卯→巳，俱无
    expect(names(MAO)).not.toContain('驿马');                      // 反例：酉→亥、巳→亥，俱无
  });

  it('4 桃花（咸池）：申子辰在酉、寅午戌在卯、巳酉丑在午、亥卯未在子', () => {
    expect(hitsOf(QIANLONG, '桃花')).toContain('日支午→卯@year');  // 正例①（四正全，子午卯酉）
    expect(hitsOf(QIANLONG, '桃花')).toContain('年支卯→子@time');  // 正例②
    expect(hitsOf(CASE1985B, '桃花')).toContain('日支亥→子@year'); // 正例③（亥卯未在子）
    expect(names(ZENG)).not.toContain('桃花');                     // 反例：辰→酉、未→子，俱无
  });

  it('5 羊刃（取禄前一位）：甲卯 乙辰 丙戊午 丁己未 庚酉 辛戌 壬子 癸丑', () => {
    expect(hitsOf(QIANLONG, '羊刃')).toContain('日干庚→酉@month');  // 正例①
    expect(hitsOf(CASE1985, '羊刃')).toContain('日干壬→子@year,month'); // 正例②
    expect(hitsOf(BEN, '羊刃')).toContain('日干己→未@month,day');   // 正例③（阴干亦有刃说）
    expect(names(ZENG)).not.toContain('羊刃');                     // 反例：丙→午、辛→戌，俱无
    // 与六爻神煞层共用一张表（shensha.ts YANG_REN）；子平论刃只以日干，年干不再并列
    const spec = baziShenSha(BEN).specs.find((s) => s.name === '羊刃')!;
    expect(spec.refs).toEqual(['日干']);
    expect(spec.rule).toContain('禄前一辰');
    expect(spec.note).toContain('YANG_REN');
  });

  it('6 空亡（旬空）：甲子旬戌亥、甲戌旬申酉、甲申旬午未、甲午旬辰巳、甲辰旬寅卯、甲寅旬子丑', () => {
    expect(names(MAO)).toContain('空亡');                          // 正例①：丁酉属甲午旬，年月支巳、时支辰俱空
    expect(hitsOf(MAO, '空亡')[0]).toBe('日柱丁酉→巳、辰@year,time');
    expect(hitsOf(CASE1985, '空亡')[0]).toBe('日柱壬寅→巳@time');   // 正例②：壬寅属甲午旬
    expect(names(BEN)).not.toContain('空亡');                      // 反例：己未属甲寅旬，空子丑，四柱无子丑
  });

  it('7 孤辰 / 寡宿：三会方进一辰为孤、退一辰为寡', () => {
    // 孤辰正例：1985 年支子（亥子丑）→ 寅；日支寅（寅卯辰）→ 巳
    expect(hitsOf(CASE1985, '孤辰')).toEqual(['年支子→寅@day', '日支寅→巳@time']);
    // 孤辰正例②：1994-02-01 年支酉（申酉戌）→ 亥，四柱无亥 → 取 1985-02-21 例
    const c19852 = paiBazi({ year: 1985, month: 2, day: 21, hour: 10, minute: 0, gender: '男' });
    expect(names(c19852)).toContain('孤辰');
    // 寡宿正例①：本人年支戌（申酉戌）→ 未，月日两未见
    expect(hitsOf(BEN, '寡宿')).toEqual(['年支戌→未@month,day']);
    // 寡宿正例②：曾国藩年支未（巳午未）→ 辰，日支辰见
    expect(hitsOf(ZENG, '寡宿')).toEqual(['年支未→辰@day']);
    // 反例：曾国藩孤辰（未→申）、日支辰（辰→巳）俱无
    expect(names(ZENG)).not.toContain('孤辰');
  });

  it('8 丧门 / 吊客：太岁前二辰为丧门、后二辰为吊客', () => {
    // 丧门正例①：1985 年支子 → 寅（日支）
    expect(hitsOf(CASE1985, '丧门')).toEqual(['年支子→寅@day']);
    // 丧门正例②：1985-02-21 年支丑 → 卯（日支）
    const c19852 = paiBazi({ year: 1985, month: 2, day: 21, hour: 10, minute: 0, gender: '男' });
    expect(hitsOf(c19852, '丧门')).toEqual(['年支丑→卯@day']);
    // 吊客正例：1985-05-12 年支丑 → 亥（日支）
    const c1985c = paiBazi({ year: 1985, month: 5, day: 12, hour: 10, minute: 0, gender: '男' });
    expect(hitsOf(c1985c, '吊客')).toEqual(['年支丑→亥@day']);
    // 反例：乾隆年支卯 → 丧门巳、吊客丑，四柱卯酉午子俱无
    expect(names(QIANLONG)).not.toContain('丧门');
    expect(names(QIANLONG)).not.toContain('吊客');
  });

  it('9 天德 / 月德：正丁二申三壬四辛五亥六甲七癸八寅九丙十乙冬巳腊庚；寅午戌丙、申子辰壬、亥卯未甲、巳酉丑庚', () => {
    // 天德正例①：1985-01-03 月支子（冬月）→ 巳，时支见
    expect(hitsOf(CASE1985, '天德')).toEqual(['月支子→巳@time']);
    // 天德正例②：本人月支未（六月）→ 甲，年干见
    expect(hitsOf(BEN, '天德')).toEqual(['月支未→甲@year']);
    // 天德反例：乾隆月支酉（八月）→ 寅，四柱无寅
    expect(names(QIANLONG)).not.toContain('天德');
    // 月德正例①：本人未月（亥卯未）→ 甲，年干见；②乾隆酉月（巳酉丑）→ 庚，日干见
    expect(hitsOf(BEN, '月德')).toEqual(['月支未→甲@year']);
    expect(hitsOf(QIANLONG, '月德')).toEqual(['月支酉→庚@day']);
    // 月德反例：曾国藩亥月（亥卯未）→ 甲，四柱无甲
    expect(names(ZENG)).not.toContain('月德');
  });

  it('10 华盖：三合局墓位', () => {
    // 正例①：本人日支未→未（自坐）、年支戌→戌（自坐）
    expect(hitsOf(BEN, '华盖')).toEqual(['日支未→未@month,day', '年支戌→戌@year']);
    // 正例②：曾国藩日支辰→辰、年支未→未
    expect(hitsOf(ZENG, '华盖')).toEqual(['日支辰→辰@day', '年支未→未@year']);
    // 反例：乾隆日支午→戌、年支卯→未，四柱无戌未
    expect(names(QIANLONG)).not.toContain('华盖');
  });

  it('11 将星：三合局帝旺', () => {
    expect(hitsOf(QIANLONG, '将星')).toEqual(['日支午→午@day', '年支卯→卯@year']); // 正例①
    expect(hitsOf(CASE1985, '将星')).toEqual(['年支子→子@year,month']);            // 正例②
    expect(names(ZENG)).not.toContain('将星');                                     // 反例：辰→子、未→卯，俱无
  });

  it('12 金舆（禄前二位）：甲辰 乙巳 丙戊未 丁己申 庚戌 辛亥 壬丑 癸寅', () => {
    expect(hitsOf(ZENG, '金舆')).toEqual(['日干丙→未@year', '年干辛→亥@month,time']); // 正例①
    expect(hitsOf(CASE1985B, '金舆')).toContain('日干辛→亥@day');                     // 正例②
    expect(names(BEN)).not.toContain('金舆');                                        // 反例：己→申、甲→辰，俱无
  });

  it('神煞汇总：1985-01-03 十项同现（含落空标记）', () => {
    const ss = baziShenSha(CASE1985);
    expect(ss.present.sort()).toEqual(
      ['天乙贵人', '天德', '将星', '文昌', '月德', '羊刃', '空亡', '驿马', '孤辰', '丧门'].sort(),
    );
    expect(ss.absent.sort()).toEqual(['华盖', '吊客', '寡宿', '桃花', '金舆'].sort());
    // absent 逐名列出：孤辰见、寡宿未见，两者互不吞并
    expect(ss.absent).toContain('寡宿');
    expect(ss.absent).not.toContain('孤辰');
    // 月德甲?? 本例月德在日干壬 → 不落空；天乙在时支巳 → 落空（甲午旬空辰巳）
    expect(ss.byName['天乙贵人'][0].luoKong).toBe(true);
    expect(ss.byName['月德'][0].luoKong).toBe(false);
  });

  it('神煞定义表齐全：12 项 / 15 名，每项带出处与口诀', () => {
    const specs = baziShenSha(BEN).specs;
    expect(specs.map((s) => s.name)).toEqual([
      '天乙贵人', '文昌', '驿马', '桃花', '羊刃', '空亡', '孤辰', '寡宿',
      '丧门', '吊客', '天德', '月德', '华盖', '将星', '金舆',
    ]);
    for (const s of specs) {
      expect(s.rule.length).toBeGreaterThan(8);
      expect(s.source).toMatch(/《(渊海子平|三命通会|协纪辨方书)/);
    }
  });
});

// ============================================================
// 二、刑冲合害（全组合穷举）
// ============================================================
describe('刑冲合害 · 全组合', () => {
  const rel = (a: any, b: any) => zhiRelations([{ pos: 'year', zhi: a }, { pos: 'month', zhi: b }]);
  const kinds = (a: any, b: any) => rel(a, b).map((r) => r.kind).sort();

  it('六冲 6 对，双向互冲', () => {
    const pairs: Array<[any, any]> = [['子', '午'], ['丑', '未'], ['寅', '申'], ['卯', '酉'], ['辰', '戌'], ['巳', '亥']];
    for (const [a, b] of pairs) {
      expect(kinds(a, b), `${a}${b}`).toContain('六冲');
      expect(kinds(b, a), `${b}${a}`).toContain('六冲');
    }
    expect(kinds('子', '丑')).not.toContain('六冲');
  });

  it('六合 6 对，各带化气', () => {
    const pairs: Array<[any, any, string]> = [
      ['子', '丑', '土'], ['寅', '亥', '木'], ['卯', '戌', '火'],
      ['辰', '酉', '金'], ['巳', '申', '水'], ['午', '未', '土'],
    ];
    for (const [a, b, wx] of pairs) {
      const r = rel(a, b).find((x) => x.kind === '六合')!;
      expect(r, `${a}${b}`).toBeTruthy();
      expect(r.huaWuXing).toBe(wx);
      expect(rel(b, a).some((x) => x.kind === '六合')).toBe(true);
    }
    expect(kinds('子', '午')).not.toContain('六合');
  });

  it('六害 6 对（子未 丑午 寅巳 卯辰 申亥 酉戌）', () => {
    const pairs: Array<[any, any]> = [['子', '未'], ['丑', '午'], ['寅', '巳'], ['卯', '辰'], ['申', '亥'], ['酉', '戌']];
    for (const [a, b] of pairs) {
      expect(kinds(a, b), `${a}${b}`).toContain('六害');
      expect(kinds(b, a), `${b}${a}`).toContain('六害');
    }
    expect(kinds('子', '丑')).not.toContain('六害');
  });

  it('相破 6 对（子酉 丑辰 寅亥 卯午 巳申 未戌）', () => {
    const pairs: Array<[any, any]> = [['子', '酉'], ['丑', '辰'], ['寅', '亥'], ['卯', '午'], ['巳', '申'], ['未', '戌']];
    for (const [a, b] of pairs) {
      expect(kinds(a, b), `${a}${b}`).toContain('相破');
      expect(kinds(b, a), `${b}${a}`).toContain('相破');
    }
    expect(kinds('子', '午')).not.toContain('相破');
  });

  it('相刑两两：寅巳 巳申 寅申（无恩）、丑戌 戌未 丑未（恃势）、子卯（无礼）', () => {
    const pairs: Array<[any, any, string]> = [
      ['寅', '巳', '无恩之刑'], ['巳', '申', '无恩之刑'], ['寅', '申', '无恩之刑'],
      ['丑', '戌', '恃势之刑'], ['戌', '未', '恃势之刑'], ['丑', '未', '恃势之刑'],
      ['子', '卯', '无礼之刑'],
    ];
    for (const [a, b, label] of pairs) {
      const r = rel(a, b).find((x) => x.kind === '相刑')!;
      expect(r, `${a}${b}`).toBeTruthy();
      expect(r.name).toContain(label);
    }
    // 回归：同支不得误判相刑（未未 曾误输出恃势之刑）
    expect(rel('未', '未').some((x) => x.kind === '相刑')).toBe(false);
    expect(rel('戌', '戌').some((x) => x.kind === '相刑')).toBe(false);
  });

  it('自刑：辰午酉亥，两见即自刑；其余支不自刑', () => {
    for (const z of ['辰', '午', '酉', '亥'] as const) {
      const r = rel(z, z).find((x) => x.kind === '自刑')!;
      expect(r, `${z}${z}`).toBeTruthy();
      expect(r.name).toBe(`${z}${z}自刑`);
    }
    for (const z of ['子', '丑', '寅', '卯', '巳', '未', '申', '戌'] as const) {
      expect(rel(z, z).some((x) => x.kind === '自刑'), `${z}${z}`).toBe(false);
    }
  });

  it('三合局 4 组：申子辰水、亥卯未木、寅午戌火、巳酉丑金', () => {
    const groups: Array<[any[], string]> = [
      [['申', '子', '辰'], '水'], [['亥', '卯', '未'], '木'],
      [['寅', '午', '戌'], '火'], [['巳', '酉', '丑'], '金'],
    ];
    for (const [zs, wx] of groups) {
      const r = zhiRelations(zs.map((z, i) => ({ pos: (['year', 'month', 'day'] as const)[i], zhi: z as any })))
        .find((x) => x.kind === '三合')!;
      expect(r, zs.join('')).toBeTruthy();
      expect(r.huaWuXing).toBe(wx);
      expect(r.positions.sort()).toEqual(['day', 'month', 'year']);
    }
  });

  it('半合（见中神）8 组 / 拱合（无中神）4 组', () => {
    const ban: any[][] = [
      ['申', '子'], ['子', '辰'], ['亥', '卯'], ['卯', '未'],
      ['寅', '午'], ['午', '戌'], ['巳', '酉'], ['酉', '丑'],
    ];
    for (const [a, b] of ban) {
      expect(kinds(a, b), `${a}${b}`).toContain('半合');
      expect(kinds(a, b), `${a}${b}`).not.toContain('拱合');
    }
    const gong: any[][] = [['申', '辰'], ['亥', '未'], ['寅', '戌'], ['巳', '丑']];
    for (const [a, b] of gong) {
      expect(kinds(a, b), `${a}${b}`).toContain('拱合');
      expect(kinds(a, b), `${a}${b}`).not.toContain('半合');
    }
  });

  it('三刑齐全：寅巳申、丑戌未', () => {
    const g1 = zhiRelations([
      { pos: 'year', zhi: '寅' }, { pos: 'month', zhi: '巳' }, { pos: 'day', zhi: '申' },
    ]);
    expect(g1.some((r) => r.kind === '三刑' && r.name.includes('无恩之刑'))).toBe(true);
    const g2 = zhiRelations([
      { pos: 'year', zhi: '丑' }, { pos: 'month', zhi: '戌' }, { pos: 'day', zhi: '未' },
    ]);
    expect(g2.some((r) => r.kind === '三刑' && r.name.includes('恃势之刑'))).toBe(true);
  });

  it('天干五合 5 对（甲己土 乙庚金 丙辛水 丁壬木 戊癸火）', () => {
    const pairs: Array<[any, any, string]> = [
      ['甲', '己', '土'], ['乙', '庚', '金'], ['丙', '辛', '水'], ['丁', '壬', '木'], ['戊', '癸', '火'],
    ];
    for (const [a, b, wx] of pairs) {
      const r = ganRelations([{ pos: 'year', gan: a }, { pos: 'day', gan: b }]).find((x) => x.kind === '五合')!;
      expect(r, `${a}${b}`).toBeTruthy();
      expect(r.huaWuXing).toBe(wx);
      expect(r.positions).toEqual(['year', 'day']);
    }
    expect(ganRelations([{ pos: 'year', gan: '甲' }, { pos: 'day', gan: '乙' }]).length).toBe(0);
  });

  it('天干相冲 4 对（甲庚 乙辛 丙壬 丁癸），戊己居中不冲', () => {
    const pairs: Array<[any, any]> = [['甲', '庚'], ['乙', '辛'], ['丙', '壬'], ['丁', '癸']];
    for (const [a, b] of pairs) {
      const r = ganRelations([{ pos: 'year', gan: a }, { pos: 'time', gan: b }]).find((x) => x.kind === '相冲')!;
      expect(r, `${a}${b}`).toBeTruthy();
      expect(r.name).toBe(`${a}${b}冲`);
    }
    for (const g of ['戊', '己'] as any[]) {
      expect(ganRelations([{ pos: 'year', gan: g }, { pos: 'time', gan: '甲' }]).some((x) => x.kind === '相冲')).toBe(false);
    }
  });

  it('原局连线：本人 甲戌/辛未/己未/庚午', () => {
    const r = baziRelations(BEN);
    const zhi = r.zhi.map((x) => `${x.name}@${x.positions.join('-')}`);
    expect(zhi).toContain('年柱戌月柱未相破@year-month');
    expect(zhi).toContain('年柱戌月柱未相刑（恃势之刑）@year-month');
    expect(zhi).toContain('月柱未时柱午合土@month-time');
    expect(zhi).toContain('日柱未时柱午合土@day-time');
    expect(zhi).toContain('午戌半合火局@time-year');
    const gan = r.gan.map((x) => `${x.name}@${x.positions.join('-')}`);
    expect(gan).toContain('甲己合土@year-day');
    expect(gan).toContain('甲庚冲@year-time');
  });

  it('原局连线：曾国藩 亥未拱木、亥亥自刑、辛丙合水', () => {
    const r = baziRelations(ZENG);
    expect(r.zhi.map((x) => x.name)).toContain('亥未拱木局');
    expect(r.zhi.map((x) => x.kind)).toContain('自刑');
    expect(r.gan.map((x) => x.name)).toContain('辛丙合水');
  });

  it('乾隆 子午卯酉四正：卯酉冲、子午冲、卯午破、子卯刑、酉子破', () => {
    const r = baziRelations(QIANLONG);
    const names = r.zhi.map((x) => x.name);
    expect(names).toContain('年柱卯月柱酉冲');
    expect(names).toContain('日柱午时柱子冲');
    expect(names).toContain('年柱卯日柱午相破');
    expect(names).toContain('年柱卯时柱子相刑（无礼之刑）');
    expect(names).toContain('月柱酉时柱子相破');
  });
});

// ============================================================
// 三、流年
// ============================================================
describe('流年 · 三命例对账', () => {
  it('与 liuNianGanZhiSequence 同源（不另造表）', () => {
    for (const y of [1984, 1994, 2026, 2027, 2028, 2040]) {
      expect(liuNian(BEN, y).ganZhi).toBe(liuNianGanZhiSequence(y, 1)[0].ganZhi);
    }
  });

  it('命例①本人：2026 丙午 / 2027 丁未 / 2028 戊申', () => {
    const y26 = liuNian(BEN, 2026);
    expect(y26.ganZhi).toBe('丙午');
    expect(y26.ganTenGod).toBe('正印'); // 丙火生己土，异性
    expect(y26.zhiTenGod).toBe('偏印'); // 午本气丁，丁火生己土，同性
    expect(y26.naYin).toBe('天河水');
    expect(y26.xunKong).toEqual(['寅', '卯']); // 丙午属甲辰旬
    expect(y26.taiSui.kinds).toEqual([]); // 午与生年戌：无值冲刑害破合
    expect(y26.zhiRelations.map((r) => r.name)).toContain('月柱未流年午合土');
    expect(y26.zhiRelations.map((r) => r.name)).toContain('午午自刑');
    expect(y26.ganRelations.map((r) => r.name)).toContain('辛丙合水');

    const y27 = liuNian(BEN, 2027);
    expect(y27.ganZhi).toBe('丁未');
    expect(y27.ganTenGod).toBe('偏印');
    expect(y27.zhiTenGod).toBe('比肩');
    expect(y27.taiSui.kinds).toEqual(['刑太岁', '破太岁']); // 未戌 既刑又破
    expect(y27.zhiRelations.map((r) => r.name)).toContain('年柱戌流年未相破');

    const y28 = liuNian(BEN, 2028);
    expect(y28.ganZhi).toBe('戊申');
    expect(y28.ganTenGod).toBe('劫财');
    expect(y28.zhiTenGod).toBe('伤官');
    expect(y28.naYin).toBe('大驿土');
  });

  it('命例②乾隆：2026 丙午（七杀/正官，卯午破、子午冲）', () => {
    const y = liuNian(QIANLONG, 2026);
    expect(y.ganZhi).toBe('丙午');
    expect(y.ganTenGod).toBe('七杀'); // 丙火克庚金，同性
    expect(y.zhiTenGod).toBe('正官'); // 丁火克庚金，异性
    expect(y.taiSui.kinds).toEqual(['破太岁']); // 午与生年卯
    const zn = y.zhiRelations.map((r) => r.name);
    expect(zn).toContain('年柱卯流年午相破');
    expect(zn).toContain('时柱子流年午冲');
    expect(zn).toContain('午午自刑'); // 日支午与流年午
    expect(y.ganRelations.map((r) => r.name)).toContain('辛丙合水');
  });

  it('命例③曾国藩：2026 丙午（合太岁）、2027 丁未（值太岁）', () => {
    const y26 = liuNian(ZENG, 2026);
    expect(y26.ganZhi).toBe('丙午');
    expect(y26.ganTenGod).toBe('比肩');
    expect(y26.zhiTenGod).toBe('劫财');
    expect(y26.taiSui.kinds).toEqual(['合太岁']); // 午未合
    expect(y26.zhiRelations.map((r) => r.name)).toContain('年柱未流年午合土');

    const y27 = liuNian(ZENG, 2027);
    expect(y27.ganZhi).toBe('丁未');
    expect(y27.taiSui.kinds).toEqual(['值太岁']);
  });

  it('流年藏干十神与旬空自洽', () => {
    const y = liuNian(MAO, 2026);
    expect(y.hidden.map((h) => h.gan + h.tenGod)).toEqual(['丁比肩', '己食神']); // 午藏丁己，日主丁
    expect(y.xunKong).toEqual(['寅', '卯']);
    expect(naYinOf('丙午')).toBe('天河水');
    expect(naYinOf('甲子')).toBe('海中金');
    expect(naYinOf('癸亥')).toBe('大海水');
  });

  it('liuNianList 连续且跨年干支不跳', () => {
    const list = liuNianList(BEN, 2024, 4).map((x) => x.ganZhi);
    expect(list).toEqual(['甲辰', '乙巳', '丙午', '丁未']);
  });

  it('岁运并临：流年干支与本步大运相同则标记', () => {
    // 本人 2026 大运乙亥；找一步与流年重合的年份不必然出现，故只校验标记逻辑自洽
    const y = liuNian(BEN, 2026);
    expect(y.suiYunBingLin).toBe(!!y.daYun && y.daYun.ganZhi === y.ganZhi);
  });
});

// ============================================================
// 四、流月
// ============================================================
describe('流月 · 五虎遁与节气月', () => {
  it('2026（丙午年）十二月：庚寅…辛丑，五虎遁丙辛起庚寅', () => {
    const ly = liuYueList(BEN, 2026);
    expect(ly).toHaveLength(12);
    expect(ly.map((m) => m.ganZhi)).toEqual([
      '庚寅', '辛卯', '壬辰', '癸巳', '甲午', '乙未',
      '丙申', '丁酉', '戊戌', '己亥', '庚子', '辛丑',
    ]);
    expect(ly.map((m) => m.zhi)).toEqual(['寅', '卯', '辰', '巳', '午', '未', '申', '酉', '戌', '亥', '子', '丑']);
    expect(ly.map((m) => m.jieqi)).toEqual(['立春', '惊蛰', '清明', '立夏', '芒种', '小暑', '立秋', '白露', '寒露', '立冬', '大雪', '小寒']);
  });

  it('交节日取自精确节气（立春 2026-02-04、小寒 2027-01-05）', () => {
    const ly = liuYueList(BEN, 2026);
    expect(ly[0].startDate).toBe('2026-02-04');
    expect(ly[11].startDate).toBe('2027-01-05');
    // 每个月的交节日都在该月内，且逐月递增
    const days = ly.map((m) => m.startDate);
    expect([...days].sort()).toEqual(days);
  });

  it('流月十神与关系：本人庚寅月（伤官/正官，寅午戌三合火局、甲庚冲）', () => {
    const m = liuYueList(BEN, 2026)[0];
    expect(m.ganZhi).toBe('庚寅');
    expect(m.ganTenGod).toBe('伤官'); // 庚金被己土生？否：己土生庚金 → 我生者为伤官
    expect(m.zhiTenGod).toBe('正官'); // 寅本气甲，甲木克己土，异性
    expect(m.naYin).toBe('松柏木');
    expect(m.zhiRelations.map((r) => r.name)).toContain('寅午戌三合火局');
    expect(m.ganRelations.map((r) => r.name)).toContain('甲庚冲');
  });

  it('流月与原局六合/相破同现（曾国藩 2026 寅月：亥寅合又破）', () => {
    const m = liuYueList(ZENG, 2026)[0];
    expect(m.ganZhi).toBe('庚寅');
    const zn = m.zhiRelations.map((r) => r.name);
    expect(zn).toContain('月柱亥流月寅合木');
    expect(zn).toContain('月柱亥流月寅相破');
  });

  it('跨年年干口径：流年按立春，2026-01-20 仍属乙巳年', () => {
    expect(liuNianGanZhiSequence(2026, 1)[0].ganZhi).toBe('丙午'); // 序列按年给干支
    // 立春前的公历日期在 FourPillars 里落到上一年，这里验证 1994-02-01 的盘
    expect(BEFORE_LICHUN.year.ganZhi).toBe('癸酉'); // 1994 立春前仍属癸酉
  });
});

// ============================================================
// 五、旺衰依据
// ============================================================
describe('旺衰依据 · 逐条可指认', () => {
  it('本人：得令（未月同气）+ 得地（坐未）→ 偏旺，得生 1 得助 3', () => {
    const ws = wangShuaiEvidence(BEN);
    expect(ws.monthState.zhi).toBe('未');
    expect(ws.monthState.state).toBe('旺');
    expect(ws.deling.hit).toBe(true);
    expect(ws.deling.score).toBe(2);
    expect(ws.dedi.hit).toBe(true);
    expect(ws.score).toBe(3);
    expect(ws.conclusion).toBe('偏旺');
    expect(ws.counts).toEqual({ 得令: 1, 得地: 1, 得生: 1, 得助: 3 });
    expect(ws.tongGen).toBe(3); // 未 未 戌
    expect(ws.consistent).toBe(true);
    // 依据可追到具体柱位
    const sheng = ws.items.filter((i) => i.label === '得生');
    expect(sheng.map((i) => `${i.pillar}${i.char}`)).toContain('time午');
  });

  it('乾隆：酉月金旺得令、坐午失地 → 仍偏旺（得令 2 分抵消）', () => {
    const ws = wangShuaiEvidence(QIANLONG);
    expect(ws.monthState.state).toBe('旺');
    expect(ws.deling.hit).toBe(true);
    expect(ws.dedi.hit).toBe(false);
    expect(ws.dedi.text).toContain('日支克日主');
    expect(ws.score).toBe(2);
    expect(ws.conclusion).toBe('偏旺');
    expect(ws.counts).toEqual({ 得令: 1, 得地: 0, 得生: 0, 得助: 2 });
  });

  it('曾国藩：亥月火死、坐辰泄气 → 偏弱', () => {
    const ws = wangShuaiEvidence(ZENG);
    expect(ws.monthState.state).toBe('死');
    expect(ws.deling.hit).toBe(false);
    expect(ws.deling.score).toBe(-2);
    expect(ws.dedi.hit).toBe(false);
    expect(ws.score).toBe(-2);
    expect(ws.conclusion).toBe('偏弱');
    expect(ws.counts['得令']).toBe(0);
  });

  it('月令生我必须判得令（丙火生卯月：木生火）——「生」两支方向的回归锚', () => {
    const bz = paiBazi({ year: 1990, month: 4, day: 1, hour: 10, minute: 0, gender: '男' });
    expect(bz.dayMaster).toBe('丙');
    expect(bz.month.zhi).toBe('卯');
    const ws = wangShuaiEvidence(bz);
    expect(ws.deling.hit).toBe(true);
    expect(ws.deling.text).toContain('月令生我（得令）');
    expect(ws.deling.text).toContain('木生火');
    expect(ws.conclusion).toBe('偏旺');
    // verdicts.js 已修正为「月令生我也 +2」；两处公式同向，consistent 应为 true。
    // 若此处变成 false，说明 app 侧公式又分叉了（探针报错），不是流派差异。
    expect(ws.legacyConclusion).toBe('偏旺');
    expect(ws.consistent).toBe(true);
    expect(ws.note).toContain('judgeBazi');
  });

  it('我生月令必须判泄气（丁火生丑月：火生土）', () => {
    const bz = paiBazi({ year: 1990, month: 2, day: 1, hour: 10, minute: 0, gender: '男' });
    expect(bz.dayMaster).toBe('丁');
    expect(bz.month.zhi).toBe('丑');
    const ws = wangShuaiEvidence(bz);
    expect(ws.deling.hit).toBe(false);
    expect(ws.deling.text).toContain('我生月令（泄气）');
    expect(ws.conclusion).toBe('偏弱');
    expect(ws.legacyConclusion).toBe('偏弱'); // verdicts.js 已同向（我生 −1）
    expect(ws.consistent).toBe(true);
  });

  it('批量自证：248 盘（1980–2010 各季）consistent 全为 true，且结论与独立算式一致', () => {
    // 独立算式（不引用被测模块的表）：月令同气/生我 +2、我生/我克 −1、克我 −2；日支同气/生我 +1
    const SHENG: Record<string, string> = { 木: '火', 火: '土', 土: '金', 金: '水', 水: '木' };
    const KE: Record<string, string> = { 木: '土', 土: '水', 水: '火', 火: '金', 金: '木' };
    const ZHI_WX: Record<string, string> = { 子: '水', 丑: '土', 寅: '木', 卯: '木', 辰: '土', 巳: '火', 午: '火', 未: '土', 申: '金', 酉: '金', 戌: '土', 亥: '水' };
    let n = 0;
    const bad: string[] = [];
    for (let y = 1980; y <= 2010; y++) for (const m of [2, 5, 8, 11]) for (const d of [7, 21]) {
      const bz = paiBazi({ year: y, month: m, day: d, hour: 10, minute: 0, gender: '女' });
      const me = bz.dayMasterWuXing;
      const mw = ZHI_WX[bz.month.zhi], dw = ZHI_WX[bz.day.zhi];
      const deling = mw === me || SHENG[mw] === me ? 2 : SHENG[me] === mw || KE[me] === mw ? -1 : -2;
      const dedi = dw === me || SHENG[dw] === me ? 1 : 0;
      const expectConc = deling + dedi > 0 ? '偏旺' : '偏弱';
      const ws = wangShuaiEvidence(bz);
      n++;
      if (!ws.consistent || ws.conclusion !== expectConc) {
        bad.push(`${bz.year.ganZhi}${bz.month.ganZhi}${bz.day.ganZhi} 库=${ws.conclusion} 算=${expectConc} consistent=${ws.consistent}`);
      }
    }
    expect(n).toBe(248);
    expect(bad).toEqual([]);
  });

  it('结论文本与月令状态自洽，且不改断语卡结论字段', () => {
    for (const bz of [BEN, QIANLONG, ZENG, MAO, CASE1985]) {
      const ws = wangShuaiEvidence(bz);
      expect(['偏旺', '偏弱']).toContain(ws.conclusion);
      expect(ws.conclusionText).toContain(ws.conclusion === '偏旺' ? '喜财' : '喜印');
      expect(ws.monthState.text).toContain(ws.monthState.state);
      expect(ws.items.length).toBeGreaterThanOrEqual(3);
    }
  });
});

// ============================================================
// 六、年柱口径标注
// ============================================================
describe('年柱口径 · 立春为界', () => {
  it('标注文本带立春口径与紫微对照', () => {
    expect(baziExtra(BEN).yearPillarNote).toBe('年柱：甲戌（立春为界；紫微另有春节口径）');
    expect(baziExtra(QIANLONG).yearPillarNote).toContain('年柱：辛卯');
  });

  it('立春前出生仍属上一年干支（1994-02-01 → 癸酉，立春 02-04）', () => {
    expect(BEFORE_LICHUN.year.ganZhi).toBe('癸酉');
    expect(baziExtra(BEFORE_LICHUN).yearPillarNote).toBe('年柱：癸酉（立春为界；紫微另有春节口径）');
    // 对照：1994-02-10 已过立春 → 甲戌
    const after = paiBazi({ year: 1994, month: 2, day: 10, hour: 10, minute: 0, gender: '男' });
    expect(after.year.ganZhi).toBe('甲戌');
  });

  it('baziExtra 一次性聚合四块信息', () => {
    const e = baziExtra(BEN);
    expect(e.shenSha.present.length).toBeGreaterThan(3);
    expect(e.relations.zhi.length).toBeGreaterThan(0);
    expect(e.wangShuai.counts['得令']).toBe(1);
    expect(e.yearPillarNote).toContain('立春');
  });
});
