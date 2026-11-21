/**
 * 紫微斗数审计修复回归（审计 D 组）
 *
 * 锁定四件事，每条都自带独立基准，不引用被测代码里的常量/表：
 *  1. 晚子时（23:00–23:59）换日补齐：农历日期 · 命宫所在月 · 日柱 三者与「次日 00:30」逐一相等；
 *     基准 = iztro 对「次日 + 早子时」的排盘（早子时口径上游是正确的，可作金标准）。
 *  2. 闰月后半月 + 23 点后绕过上游 bug：上游 timeIndex=12 时被 fixLunarMonthIndex 排除在
 *     「十六起归次月」之外（方向反了），本模块按次日折算后必须归次月。
 *  3. 大限四化：与「十干四化表 + 星曜落宫」手算对照，并与 iztro horoscope 的 decadal.mutagen 交叉验证。
 *  4. 流月：流月命宫 / 流月四化 / 农历月标签，含闰月十六起归次月。
 *  5. 安星回归：736 张随机盘，本模块输出 vs iztro 同参数排盘，逐宫逐星零差异。
 */
import { beforeAll, describe, expect, it } from 'vitest';
import { astro } from 'iztro';
import { paiZiwei, paiZiweiWithAstrolabe, ziweiYunXian } from '../src/ziwei.js';
import { paiBazi } from '../src/bazi.js';

/* ─────────────── 公共小工具 ─────────────── */

type AnyAstrolabe = ReturnType<typeof astro.bySolar>;

/** 阳历日 +1 天（UTC 算，避免宿主时区干扰） */
function nextDay(y: number, mo: number, d: number): [number, number, number] {
  const dt = new Date(Date.UTC(y, mo - 1, d));
  dt.setUTCDate(dt.getUTCDate() + 1);
  return [dt.getUTCFullYear(), dt.getUTCMonth() + 1, dt.getUTCDate()];
}

const pad = (n: number) => String(n).padStart(2, '0');
const ymd = (y: number, mo: number, d: number) => `${y}-${mo}-${d}`;

/** 命盘「安星核心」：紫微落宫、五行局、命身宫、四柱 —— 任何一项变都算安星差异 */
function coreOf(c: ReturnType<typeof paiZiwei>) {
  const ziwei = c.palaces.find((p) => p.majorStars.some((s) => s.name === '紫微'));
  return {
    lunar: c.lunarDate,
    siZhu: c.siZhu,
    soul: c.soulBranch,
    body: c.bodyBranch,
    ju: c.fiveElementsClass,
    ziwei: ziwei ? ziwei.earthlyBranch : '',
  };
}

/**
 * 十二宫星曜指纹：宫序按地支固定，逐宫串「宫名/宫干支/主星(亮/四化)/辅星/杂耀/大限区间」。
 * 既用于「晚子时 = 次日早子时」的全盘比对，也用于 736 盘对 iztro 的安星回归。
 */
function starPrint(c: ReturnType<typeof paiZiwei>): string {
  const order = ['子', '丑', '寅', '卯', '辰', '巳', '午', '未', '申', '酉', '戌', '亥'];
  const by = Object.fromEntries(c.palaces.map((p) => [p.earthlyBranch, p]));
  const st = (s: { name: string; brightness: string; mutagen: string }) => `${s.name}${s.brightness}${s.mutagen}`;
  return order
    .map((br) => {
      const p = by[br];
      return [
        br, p.name, p.ganZhi,
        p.majorStars.map(st).join(','),
        p.minorStars.map(st).join(','),
        p.adjectiveStars.map(st).join(','),
        `${p.decadalRange[0]}-${p.decadalRange[1]}`, p.decadalGanZhi,
      ].join('/');
    })
    .join('|');
}

/** 同一张盘用 iztro 直接读出来的星曜指纹（测试侧独立实现，不复用被测代码的转换逻辑） */
function starPrintOfIztro(a: AnyAstrolabe): string {
  const order = ['子', '丑', '寅', '卯', '辰', '巳', '午', '未', '申', '酉', '戌', '亥'];
  const by = Object.fromEntries(a.palaces.map((p: any) => [p.earthlyBranch, p]));
  const st = (s: any) => `${s.name}${s.brightness ?? ''}${s.mutagen ?? ''}`;
  return order
    .map((br) => {
      const p: any = by[br];
      return [
        br, p.name, `${p.heavenlyStem}${p.earthlyBranch}`,
        (p.majorStars ?? []).map(st).join(','),
        (p.minorStars ?? []).map(st).join(','),
        (p.adjectiveStars ?? []).map(st).join(','),
        `${p.decadal.range[0]}-${p.decadal.range[1]}`, `${p.decadal.heavenlyStem}${p.decadal.earthlyBranch}`,
      ].join('/');
    })
    .join('|');
}

/* ─────────────── 1. 晚子时换日：农历 / 命宫 / 日柱 三者一致 ─────────────── */

describe('晚子时（23:00–23:59）换日补齐：农历·命宫·日柱与次日 00:30 全等', () => {
  // 六个命例：含「农历三十跨月」「腊月三十跨年」「闰四月后半月」「月内普通日」
  const CASES: Array<{ title: string; y: number; mo: number; d: number; lunar: string }> = [
    { title: '腊月三十 → 正月初一（跨农历年）', y: 2024, mo: 2, d: 9, lunar: '二〇二四年正月初一' },
    { title: '十月三十 → 冬月初一', y: 2023, mo: 12, d: 12, lunar: '二〇二三年冬月初一' },
    { title: '九月三十 → 十月初一', y: 2025, mo: 11, d: 19, lunar: '二〇二五年十月初一' },
    { title: '闰四月十六 → 闰四月十七（闰月后半）', y: 2020, mo: 6, d: 7, lunar: '二〇二〇年闰四月十七' },
    { title: '闰四月廿五 → 闰四月廿六（闰月后半）', y: 2020, mo: 6, d: 16, lunar: '二〇二〇年闰四月廿六' },
    { title: '月内普通日（不跨月）', y: 2026, mo: 3, d: 20, lunar: '二〇二六年二月初三' },
  ];

  for (const t of CASES) {
    it(`${t.title}：${ymd(t.y, t.mo, t.d)} 23:30 ≡ 次日 00:30`, () => {
      const late = paiZiwei({ year: t.y, month: t.mo, day: t.d, hour: 23, minute: 30, gender: '男' });
      const [ny, nm, nd] = nextDay(t.y, t.mo, t.d);
      const early = paiZiwei({ year: ny, month: nm, day: nd, hour: 0, minute: 30, gender: '男' });

      // 三者一致（农历 / 命宫所在月 / 日柱 都走同一个「有效日」）
      expect(coreOf(late)).toEqual(coreOf(early));
      expect(starPrint(late)).toBe(starPrint(early));
      // 农历标签换到次日 —— 修前是当天（「三十·晚子时」自相矛盾）
      expect(late.lunarDate).toBe(t.lunar);
      expect(late.lunarDate).toBe(early.lunarDate);
      // 日柱同步进次日
      expect(late.dayGanZhi).toBe(early.dayGanZhi);
      expect(late.siZhu).toBe(early.siZhu);
      // 命宫所在月：同干支的命宫（命宫 = f(农历月, 时支)）
      expect(late.soulBranch).toBe(early.soulBranch);

      // 对外字段仍是「晚子时」，但注明有效排盘日
      expect(late.lateZi).toBe(true);
      expect(late.timeIndex).toBe(12);
      expect(late.time).toBe('晚子时');
      expect(late.timeRange).toBe('23:00~24:00');
      expect(late.solarDate).toBe(ymd(t.y, t.mo, t.d));
      expect(late.effectiveSolarDate).toBe(ymd(ny, nm, nd));
    });
  }

  it('农历三十 23:30 与次日 00:30 命宫同宫（修前：一个子、一个丑）', () => {
    // 2023-12-12 = 癸卯年十月三十；23:30 属冬月初一子时
    const late = paiZiwei({ year: 2023, month: 12, day: 12, hour: 23, minute: 30, gender: '女' });
    const early = paiZiwei({ year: 2023, month: 12, day: 13, hour: 0, minute: 30, gender: '女' });
    expect(late.soulBranch).toBe(early.soulBranch);
    // 修前 iztro 原生晚子时（命宫月停在前一月）会得到不同命宫，这里显式记录修前值
    const raw = astro.bySolar('2023-12-12', 12, '女', true, 'zh-CN');
    expect(raw.earthlyBranchOfSoulPalace).not.toBe(late.soulBranch);
  });

  it('腊月廿九 23:30（跨农历年）紫微与五行局同步进位', () => {
    // 2026-02-16 = 乙巳年腊月廿九；23:30 已是丙午年正月初一
    const late = paiZiwei({ year: 2026, month: 2, day: 16, hour: 23, minute: 30, gender: '男' });
    const early = paiZiwei({ year: 2026, month: 2, day: 17, hour: 0, minute: 30, gender: '男' });
    expect(coreOf(late)).toEqual(coreOf(early));
    expect(late.yearGanZhi).toBe('丙午'); // 修前：乙巳（年、月、局、紫微位置全错）
    expect(late.lunarDate).toBe('二〇二六年正月初一');
    expect(late.fiveElementsClass).toBe(early.fiveElementsClass);
  });

  it('非 23 点不受影响：同一时刻的排盘结果与旧口径逐字段相同', () => {
    // 22:30（亥时）不做换日折算
    const c = paiZiwei({ year: 2026, month: 2, day: 16, hour: 22, minute: 30, gender: '男' });
    expect(c.lateZi).toBe(false);
    expect(c.timeIndex).toBe(11);
    expect(c.solarDate).toBe('2026-2-16');
    expect(c.effectiveSolarDate).toBe(c.solarDate);
    expect(c.yearGanZhi).toBe('乙巳');
    const a = astro.bySolar('2026-2-16', 11, '男', true, 'zh-CN');
    expect(starPrint(c)).toBe(starPrintOfIztro(a));
  });

  it('00:30（早子时）与 23:30 的时辰地支同为子，但农历日不同', () => {
    const earlySameDay = paiZiwei({ year: 2023, month: 12, day: 12, hour: 0, minute: 30, gender: '男' });
    const lateSameDay = paiZiwei({ year: 2023, month: 12, day: 12, hour: 23, minute: 30, gender: '男' });
    expect(earlySameDay.lateZi).toBe(false);
    expect(lateSameDay.lateZi).toBe(true);
    // 同一天 00:30 属于前一天延续的「三十」，23:30 已进「冬月初一」
    expect(earlySameDay.lunarDate).toBe('二〇二三年十月三十');
    expect(lateSameDay.lunarDate).toBe('二〇二三年冬月初一');
    // 时支相同 → 时柱天干随日干走，因此时柱也不同
    expect(earlySameDay.timeGanZhi[1]).toBe('子');
    expect(lateSameDay.timeGanZhi[1]).toBe('子');
  });
});

/* ─────────────── 2. 闰月后半月 + 23 点后（绕过上游 bug） ─────────────── */

describe('闰月后半月 + 23 点后：十六起归次月（上游 timeIndex=12 排除，方向反了）', () => {
  // 2020 年闰四月（公历 5/23 起，29 天）
  const CASES: Array<{ label: string; y: number; mo: number; d: number; lunar: string }> = [
    { label: '闰四月十六 23:30', y: 2020, mo: 6, d: 7, lunar: '二〇二〇年闰四月十七' },
    { label: '闰四月十七 23:30', y: 2020, mo: 6, d: 8, lunar: '二〇二〇年闰四月十八' },
    { label: '闰四月廿五 23:30', y: 2020, mo: 6, d: 16, lunar: '二〇二〇年闰四月廿六' },
  ];

  for (const t of CASES) {
    it(`${t.label}：命宫月与次日早子时一致，且与上游原生晚子时不同`, () => {
      const late = paiZiwei({ year: t.y, month: t.mo, day: t.d, hour: 23, minute: 30, gender: '女' });
      const [ny, nm, nd] = nextDay(t.y, t.mo, t.d);
      const early = paiZiwei({ year: ny, month: nm, day: nd, hour: 0, minute: 30, gender: '女' });

      expect(late.soulBranch).toBe(early.soulBranch);
      expect(late.fiveElementsClass).toBe(early.fiveElementsClass);
      expect(coreOf(late)).toEqual(coreOf(early));
      expect(late.lunarDate).toBe(t.lunar);

      // 上游原生晚子时：命宫月停在闰四月（未归次月）→ 命宫与次日早子时不同，正是被绕过的 bug
      const raw = astro.bySolar(ymd(t.y, t.mo, t.d), 12, '女', true, 'zh-CN');
      expect(raw.earthlyBranchOfSoulPalace).not.toBe(late.soulBranch);
    });
  }

  it('闰月初三 23:30 仍归本月（十六才是分界，不能一律归次月）', () => {
    // 2020-05-25 = 闰四月初三
    const late = paiZiwei({ year: 2020, month: 5, day: 25, hour: 23, minute: 30, gender: '男' });
    const early = paiZiwei({ year: 2020, month: 5, day: 26, hour: 0, minute: 30, gender: '男' });
    expect(late.lunarDate).toBe('二〇二〇年闰四月初四');
    expect(late.soulBranch).toBe(early.soulBranch);
    // 与「闰四月十六之后」的命宫不同：说明分界确实在十六，不是一刀切
    const later = paiZiwei({ year: 2020, month: 6, day: 7, hour: 23, minute: 30, gender: '男' });
    expect(later.soulBranch).not.toBe(late.soulBranch);
  });

  it('闰月十四 → 十五 → 十六：分界在十六，十五当晚已归次月', () => {
    const d14 = paiZiwei({ year: 2020, month: 6, day: 5, hour: 23, minute: 30, gender: '男' });
    const d15 = paiZiwei({ year: 2020, month: 6, day: 6, hour: 23, minute: 30, gender: '男' });
    const d16 = paiZiwei({ year: 2020, month: 6, day: 7, hour: 23, minute: 30, gender: '男' });
    // 十四 23:30 → 闰四月十五：未过十六 → 仍归闰四月
    expect(d14.lunarDate).toBe('二〇二〇年闰四月十五');
    // 十五 23:30 → 闰四月十六：已到十六 → 归次月（五月），命宫随之改变
    expect(d15.lunarDate).toBe('二〇二〇年闰四月十六');
    expect(d15.soulBranch).not.toBe(d14.soulBranch);
    // 十六之后同属次月：十七、十八命宫与十六一致
    expect(d16.lunarDate).toBe('二〇二〇年闰四月十七');
    expect(d16.soulBranch).toBe(d15.soulBranch);
  });
});

/* ─────────────── 3. 大限四化（手算对照） ─────────────── */

describe('大限四化：大限宫天干 + 十干四化表 + 星曜落宫', () => {
  const ME = paiZiwei({ year: 1994, month: 8, day: 1, hour: 11, minute: 45, gender: '男' });
  const byRange = (a: number, b: number) => ME.palaces.find((p) => p.decadalRange[0] === a && p.decadalRange[1] === b)!;
  const fmt = (p: ReturnType<typeof byRange>) => p.decadalHua.map((h) => `${h.mutagen}${h.star}→${h.toPalaceName}(${h.toBranch})`);

  it('田宅宫 32–41（戊辰）：戊干 贪狼禄 / 太阴权 / 右弼科 / 天机忌', () => {
    const p = byRange(32, 41);
    expect(p.name).toBe('田宅');
    expect(p.decadalGanZhi).toBe('戊辰');
    // 手算：戊【贪月弼机】—— 贪狼在巳(官禄)、太阴在辰(田宅，自化权)、右弼在巳(官禄)、天机在子(兄弟)
    expect(fmt(p)).toEqual([
      '禄贪狼→官禄(巳)', '权太阴→田宅(辰)', '科右弼→官禄(巳)', '忌天机→兄弟(子)',
    ]);
  });

  it('官禄宫 42–51（己巳）：己干 武曲禄 / 贪狼权 / 天梁科 / 文曲忌', () => {
    const p = byRange(42, 51);
    expect(p.name).toBe('官禄');
    expect(p.decadalGanZhi).toBe('己巳');
    // 手算：己【武贪梁曲】—— 武曲在酉(财帛)、贪狼在巳(官禄，自化权)、天梁在申(疾厄)、文曲在戌(子女)
    expect(fmt(p)).toEqual([
      '禄武曲→财帛(酉)', '权贪狼→官禄(巳)', '科天梁→疾厄(申)', '忌文曲→子女(戌)',
    ]);
  });

  it('福德宫 22–31（丁卯）：丁干 太阴禄 / 天同权 / 天机科 / 巨门忌', () => {
    const p = byRange(22, 31);
    expect(p.name).toBe('福德');
    expect(p.decadalGanZhi).toBe('丁卯');
    // 手算：丁【阴同机巨】—— 太阴在辰(田宅)、天同在申(疾厄)、天机在子(兄弟)、巨门在午(仆役)
    expect(fmt(p)).toEqual([
      '禄太阴→田宅(辰)', '权天同→疾厄(申)', '科天机→兄弟(子)', '忌巨门→仆役(午)',
    ]);
  });

  it('与 iztro horoscope 的 decadal.mutagen 交叉验证（独立数据源）', () => {
    const a = astro.bySolar('1994-8-1', 6, '男', true, 'zh-CN');
    for (const range of [[12, 21], [32, 41], [52, 61]]) {
      const p = ME.palaces.find((x) => x.decadalRange[0] === range[0])!;
      const age = range[0]; // 该大限首年
      const h = a.horoscope(`${2000 + age - 1}-06-01`, 6);
      expect(h.decadal.heavenlyStem).toBe(p.decadalGanZhi[0]);
      // iztro 的 mutagen 顺序即 禄/权/科/忌
      expect(p.decadalHua.map((x) => x.star)).toEqual(h.decadal.mutagen);
      // 与 ziweiYunXian 的同层四化必须一致（同一张盘，两条取数路径）
      const yx = ziweiYunXian({ year: 1994, month: 8, day: 1, hour: 11, minute: 45, gender: '男' },
        { year: 2000 + age - 1, month: 6, day: 1 });
      if (yx.decadal.index === p.index) {
        expect(yx.decadal.hua.map((x) => `${x.mutagen}${x.star}`))
          .toEqual(p.decadalHua.map((x) => `${x.mutagen}${x.star}`));
      }
    }
  });
});

/* ─────────────── 4. 流月 ─────────────── */

describe('流月：流月命宫 · 流月四化 · 农历月标签', () => {
  const ME = { year: 1994, month: 8, day: 1, hour: 11, minute: 45, gender: '男' as const };

  it('2026-03-15（农历正月廿七）：流月命宫与本命「迁移」重合，庚干 阳武阴同', () => {
    const yx = ziweiYunXian(ME, { year: 2026, month: 3, day: 15 });
    expect(yx.lunarDate).toBe('二〇二六年正月廿七');
    expect(yx.monthly.lunarMonth).toBe(1);
    expect(yx.monthly.isLeapMonth).toBe(false);
    expect(yx.monthly.monthLabel).toBe('正月');
    expect(yx.monthly.ganZhi).toBe('庚寅');
    expect(yx.monthly.palaceName).toBe('迁移');
    expect(yx.monthly.branch).toBe('未');
    // 手算：庚【阳武阴同】
    expect(yx.monthly.hua.map((h) => `${h.mutagen}${h.star}→${h.toPalaceName}`)).toEqual([
      '禄太阳→子女', '权武曲→财帛', '科太阴→田宅', '忌天同→疾厄',
    ]);
  });

  it('流月随农历月推进：2026-03-25（二月初七）换月，命宫与四化同换', () => {
    const a = ziweiYunXian(ME, { year: 2026, month: 3, day: 15 }); // 正月
    const b = ziweiYunXian(ME, { year: 2026, month: 3, day: 25 }); // 二月
    expect(b.monthly.monthLabel).toBe('二月');
    expect(b.monthly.lunarMonth).toBe(2);
    expect(b.monthly.ganZhi).toBe('辛卯');
    expect(b.monthly.index).not.toBe(a.monthly.index);
    expect(b.monthly.hua.map((h) => h.star)).not.toEqual(a.monthly.hua.map((h) => h.star));
  });

  it('年/月 只给年月时默认取 15 日，农历月标签随实际落点给（不误报成公历月）', () => {
    const yx = ziweiYunXian(ME, { year: 2026, month: 2 });
    expect(yx.solarDate).toBe('2026-2-15');
    expect(yx.monthly.monthLabel).toBe('腊月'); // 2026-02-15 = 乙巳年腊月廿八
    expect(yx.monthly.lunarMonth).toBe(12);
  });

  it('闰四月廿五：标签仍是「闰四月」，但流月宫按十六起归次月（与五月同宫）', () => {
    const birth = { year: 1990, month: 5, day: 5, hour: 11, minute: 0, gender: '男' as const };
    const leap = ziweiYunXian(birth, { year: 2020, month: 6, day: 16 }); // 闰四月廿五
    const may = ziweiYunXian(birth, { year: 2020, month: 7, day: 5 }); // 五月十五
    expect(leap.monthly.isLeapMonth).toBe(true);
    expect(leap.monthly.monthLabel).toBe('闰四月');
    expect(leap.monthly.lunarDay).toBe(25);
    // 后半月归次月 → 流月宫与五月同
    expect(leap.monthly.index).toBe(may.monthly.index);
    expect(leap.monthly.ganZhi).toBe(may.monthly.ganZhi);
    // 闰月初三仍在四月
    const early = ziweiYunXian(birth, { year: 2020, month: 5, day: 25 });
    expect(early.monthly.monthLabel).toBe('闰四月');
    expect(early.monthly.index).not.toBe(leap.monthly.index);
  });

  it('流年与大限同一次调用给出，且与本命盘一致（不重复排盘）', () => {
    const yx = ziweiYunXian(ME, { year: 2026, month: 3, day: 15 });
    expect(yx.yearly.ganZhi).toBe('丙午');
    expect(yx.yearly.index).toBe(4);
    expect(yx.decadal.ganZhi).toBe('戊辰');
    expect(yx.decadal.range).toEqual([32, 41]);
    expect(yx.nominalAge).toBe(33);
    // 传回的 chart 必须与 paiZiwei 逐字段相同
    const own = paiZiwei(ME);
    expect(yx.chart.siZhu).toBe(own.siZhu);
    expect(starPrint(yx.chart)).toBe(starPrint(own));
  });
});

/* ─────────────── 5. 年柱口径标注 ─────────────── */

describe('年柱口径：紫微用农历年（春节），八字用立春 —— 不统一，但必须标注', () => {
  // 2026-02-10：已过立春（2/4），未到春节（2/17）
  const input = { year: 2026, month: 2, day: 10, hour: 12, minute: 0 };

  it('紫微取农历年 → 乙巳；八字取立春 → 丙午（两者冲突是预期的）', () => {
    const zw = paiZiwei({ ...input, gender: '男' });
    const bz = paiBazi({ ...input, gender: '男' });
    expect(zw.yearGanZhi).toBe('乙巳');
    expect(bz.year.ganZhi).toBe('丙午');
    expect(zw.yearGanZhi).not.toBe(bz.year.ganZhi);
  });

  it('盘面标注行：年柱：乙巳（农历年，春节为界；四柱另有立春口径）', () => {
    const zw = paiZiwei({ ...input, gender: '男' });
    expect(zw.yearGanZhiNote).toBe('年柱：乙巳（农历年，春节为界；四柱另有立春口径）');
  });

  it('春节（2026-02-17）之后两者一致，标注行随干支变', () => {
    const zw = paiZiwei({ year: 2026, month: 2, day: 20, hour: 12, minute: 0, gender: '男' });
    const bz = paiBazi({ year: 2026, month: 2, day: 20, hour: 12, minute: 0, gender: '男' });
    expect(zw.yearGanZhi).toBe('丙午');
    expect(bz.year.ganZhi).toBe('丙午');
    expect(zw.yearGanZhiNote).toContain('年柱：丙午');
  });
});

/* ─────────────── 6. 安星回归：736 盘 vs iztro 零差异 ─────────────── */

describe('安星回归：736 张抽样盘对 iztro 逐宫逐星零差异', () => {
  /** 确定性 PRNG（mulberry32），保证抽样可复现 */
  function mulberry32(seed: number) {
    let a = seed >>> 0;
    return () => {
      a = (a + 0x6d2b79f5) >>> 0;
      let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  const rnd = mulberry32(20261121);
  const SAMPLE = Array.from({ length: 736 }, () => {
    const year = 1950 + Math.floor(rnd() * 86); // 1950–2035
    const month = 1 + Math.floor(rnd() * 12);
    const day = 1 + Math.floor(rnd() * 28); // 1–28 全域合法
    const hour = Math.floor(rnd() * 24);
    const gender = rnd() < 0.5 ? ('男' as const) : ('女' as const);
    return { year, month, day, hour, gender };
  });

  /** 有效排盘日（与被测实现无关的独立推导：只有 23 点进位） */
  function effectiveOf(t: { year: number; month: number; day: number; hour: number }) {
    if (t.hour < 23) return { solar: ymd(t.year, t.month, t.day), ti: Math.floor((t.hour + 1) / 2) };
    const [y, m, d] = nextDay(t.year, t.month, t.day);
    return { solar: ymd(y, m, d), ti: 0 };
  }

  it('736 盘全部非 23 点：星曜指纹与 iztro 同参数排盘完全一致', () => {
    const sub = SAMPLE.filter((t) => t.hour < 23);
    let checked = 0;
    for (const t of sub) {
      // 一次排盘同时拿到「本模块星盘」与「iztro 原始星盘」，逐字段比对映射层是否忠实
      const { chart: c, astrolabe: a } = paiZiweiWithAstrolabe({ ...t, minute: 0 });
      const expectTi = Math.floor((t.hour + 1) / 2);
      const label = `${ymd(t.year, t.month, t.day)} ${t.hour}时`;
      expect(c.lateZi, label).toBe(false);
      expect(c.effectiveSolarDate, label).toBe(ymd(t.year, t.month, t.day));
      expect(c.timeIndex, label).toBe(expectTi);
      expect(a.time, label).toBe(c.time);
      expect(c.siZhu, label).toBe(a.chineseDate);
      expect(c.fiveElementsClass, label).toBe(a.fiveElementsClass);
      expect(c.soulBranch, label).toBe(a.earthlyBranchOfSoulPalace);
      expect(c.bodyBranch, label).toBe(a.earthlyBranchOfBodyPalace);
      expect(starPrint(c), label).toBe(starPrintOfIztro(a));
      checked++;
    }
    expect(checked).toBe(sub.length);
    expect(checked).toBeGreaterThan(650);
  }, 240_000);

  it('736 盘中 23 点者：等价于 iztro「次日 + 早子时」，且差异仅出现在跨月/闰月后半', () => {
    const sub = SAMPLE.filter((t) => t.hour >= 23);
    let monthRoll = 0;
    let leapRoll = 0;
    for (const t of sub) {
      const eff = effectiveOf(t);
      const { chart: c, astrolabe: a } = paiZiweiWithAstrolabe({ ...t, minute: 0 });
      // ① 传入 iztro 的就是「次日 + 早子时」
      expect(c.lateZi).toBe(true);
      expect(c.effectiveSolarDate).toBe(eff.solar);
      expect(c.timeIndex).toBe(12); // 对外的时辰索引仍是晚子时
      expect(a.time).toBe('早子时'); // 传给 iztro 的确实是早子时
      // ② 排盘结果 = 该有效日的 iztro 星盘（零差异）
      expect(starPrint(c)).toBe(starPrintOfIztro(a));
      expect(c.siZhu).toBe(a.chineseDate);

      // ③ 与「上游原生晚子时」的差异只应来自换日：跨农历月 或 闰月十六起
      const rawDay = astro.bySolar(ymd(t.year, t.month, t.day), 0, t.gender, true, 'zh-CN');
      const lunar = (rawDay as any).rawDates.lunarDate;
      const nextLunarDay = (a as any).rawDates.lunarDate.lunarDay;
      const crossesMonth = nextLunarDay === 1 && lunar.lunarDay !== 1;
      const crossesLeapHalf = !!lunar.isLeap && lunar.lunarDay >= 15;
      const raw = astro.bySolar(ymd(t.year, t.month, t.day), 12, t.gender, true, 'zh-CN');
      const differs = raw.earthlyBranchOfSoulPalace !== a.earthlyBranchOfSoulPalace
        || raw.fiveElementsClass !== a.fiveElementsClass;
      if (differs) {
        expect(crossesMonth || crossesLeapHalf, `${ymd(t.year, t.month, t.day)} 23 时出现非换日类差异`).toBe(true);
        if (crossesMonth) monthRoll++;
        if (crossesLeapHalf) leapRoll++;
      } else {
        // 未跨月时，本模块结果与上游原生晚子时也必须一致（说明只补了换日，没动安星）
        expect(starPrint(c)).toBe(starPrintOfIztro(raw));
      }
    }
    expect(sub.length).toBeGreaterThan(20);
    // 随机抽样里月末/闰月后半命中率约 1/29 + 1/30，几十例中通常命中 1–3 例；
    // 边界命例的密集覆盖交给前两节（10 个具名命例），这里只确保抽样里确实出现过换日差异。
    expect(monthRoll + leapRoll).toBeGreaterThanOrEqual(1);
  });

  it('抽样的取值域覆盖四柱/五行局/紫微落宫（防止退化成同一张盘）', () => {
    const sig = new Set<string>();
    for (const t of SAMPLE.slice(0, 60)) {
      const c = paiZiwei({ ...t, minute: 0 });
      const ziwei = c.palaces.find((p) => p.majorStars.some((s) => s.name === '紫微'))!;
      sig.add(`${c.fiveElementsClass}-${ziwei.earthlyBranch}`);
    }
    expect(sig.size).toBeGreaterThan(15);
  });
});

/* ─────────────── 7. 视图接线（app/js/ziweiview.js 真实实现） ─────────────── */

describe('视图接线：大限四化 / 流月 / 年柱口径确实出现在盘面上', () => {
  let zw: any;
  let mod: any;
  beforeAll(async () => {
    mod = await import('../../app/js/ziweiview.js');
    zw = mod.__zwTest;
  });

  const strip = (html: string) => html.replace(/<[^>]+>/g, '').replace(/\s+/g, ' ');

  it('盘中心标注年柱口径（丙午/乙巳 冲突的那一行）', () => {
    const c = paiZiwei({ year: 2026, month: 2, day: 10, hour: 12, minute: 0, gender: '男' });
    const text = strip(zw.centerHtml(c));
    expect(text).toContain('年柱：乙巳（农历年，春节为界；四柱另有立春口径）');
  });

  it('晚子时盘面标注「按次日排」，非晚子时不显示该行', () => {
    const late = paiZiwei({ year: 2026, month: 2, day: 16, hour: 23, minute: 30, gender: '男' });
    const noon = paiZiwei({ year: 2026, month: 2, day: 16, hour: 12, minute: 0, gender: '男' });
    expect(strip(zw.centerHtml(late))).toContain('晚子时（23:00–23:59）按次日排');
    expect(strip(zw.centerHtml(noon))).not.toContain('晚子时');
  });

  it('运限卡出现「大限四化」四条，落宫与 core 的 decadalHua 一致', () => {
    const c = paiZiwei({ year: 1994, month: 8, day: 1, hour: 11, minute: 45, gender: '男' });
    const html = zw.yunXianCard(c, new Date(2026, 5, 15, 12, 0)); // 虚岁 33 → 32-41 大限
    const text = strip(html);
    expect(text).toContain('大限四化');
    const dp = c.palaces.find((p) => p.decadalRange[0] === 32 && p.decadalRange[1] === 41)!;
    expect(text).toContain(`虚岁 32–41 · 走「${dp.name}」（${dp.ganZhi}）`);
    for (const h of dp.decadalHua) {
      const to = c.palaces.find((p) => p.earthlyBranch === h.toBranch)!;
      expect(text).toContain(`${h.mutagen}${h.star} → ${to.name}（${to.ganZhi}）`);
    }
  });

  it('运限卡出现「流月命宫」「流月四化」，与本命盘同源', () => {
    const c = paiZiwei({ year: 1994, month: 8, day: 1, hour: 11, minute: 45, gender: '男' });
    const text = strip(zw.yunXianCard(c, new Date(2026, 5, 15, 12, 0)));
    const yx = ziweiYunXian({ year: 1994, month: 8, day: 1, hour: 11, minute: 45, gender: '男' },
      { year: 2026, month: 6, day: 15 });
    expect(text).toContain('流月命宫');
    expect(text).toContain('流月四化');
    expect(text).toContain(`农历${yx.monthly.monthLabel}（${yx.monthly.ganZhi}）→ 本命「${yx.monthly.palaceName}」（${yx.monthly.palaceGanZhi}）`);
  });

  it('流月与本命盘不同源时宁可不显示（防张冠李戴）', () => {
    // 用别人的盘喂给卡：siZhu 不符 → liuYueOf 返回 null → 不渲染流月
    const other = paiZiwei({ year: 1988, month: 3, day: 3, hour: 9, minute: 0, gender: '女' });
    const html = zw.yunXianCard(other, new Date(2026, 5, 15, 12, 0));
    // 说明文字里也含「流月命宫」四字，故按行标签判断
    expect(html).not.toContain('流月命宫</span>');
    expect(html).not.toContain('流月四化</span>');
  });

  it('复制文本包含年柱口径行与大限四化分节', () => {
    const c = paiZiwei({ year: 1994, month: 8, day: 1, hour: 11, minute: 45, gender: '男' });
    zw.setChart(c);
    const txt = mod.ziweiCopyText();
    expect(txt).toContain('年柱：甲戌（农历年，春节为界；四柱另有立春口径）');
    expect(txt).toContain('大限四化');
  });
});
