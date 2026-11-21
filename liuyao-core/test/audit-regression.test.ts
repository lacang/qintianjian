/**
 * 审计 B 组回归：5 条 bug 的「修复前失败 / 修复后通过」锁定测试。
 *
 * 每条都自带独立基准，不引用被测代码里的常量：
 *  - 奇门：测试内独立录入三元局数表 + 自算符头/元（只用 calendar.ts 的日柱作输入）；
 *  - 卦身：测试内按《增删卜易》口诀「阳爻持世子起、阴爻持世午起」重算，卦象用测试自带的
 *    三爻阴阳表搭 64 卦，世位取 guaTable（该字段已被 test/cross64.test.ts 用 tsumugi 独立锁定）；
 *  - 紫微/八字/梅花：走公开 API，断言具体的修前→修后数值（注释里写明修前值）。
 */
import { describe, expect, it } from 'vitest';
import { paiBazi } from '../src/bazi.js';
import { paiQiMen } from '../src/qimen.js';
import { castByTime } from '../src/timecast.js';
import { paipan } from '../src/paipan.js';
import { getGuaMeta } from '../src/guaTable.js';
import { solarToSiZhu } from '../src/calendar.js';
import { calcGuaShen } from '../src/guashen.js';
import { paiZiwei } from '../src/ziwei.js';
import type { BaGua, YaoValue, YinYang } from '../src/types.js';

/* ─────────────── 公共小工具 ─────────────── */

const GAN = '甲乙丙丁戊己庚辛壬癸';
const ZHI = '子丑寅卯辰巳午未申酉戌亥';
/** 60 甲子（index 0 = 甲子） */
const GZ60 = Array.from({ length: 60 }, (_, i) => GAN[i % 10] + ZHI[i % 12]);

/** 北京时间（UTC+8 墙钟）→ Date，供 castByTime 这类吃时刻的接口用 */
function bj(y: number, mo: number, d: number, h: number, mi: number): Date {
  return new Date(Date.UTC(y, mo - 1, d, h, mi) - 8 * 3600_000);
}

/* ─────────────── 1. 紫微流年：农历年而非公历年 ─────────────── */

describe('紫微流年按农历年（正月初一换年）', () => {
  let zw: typeof import('../../app/js/ziweiview.js').__zwTest;
  const chart = paiZiwei({ year: 1994, month: 8, day: 1, hour: 11, minute: 45, gender: '男' });

  it('加载 app/js/ziweiview.js 的真实实现', async () => {
    const m = await import('../../app/js/ziweiview.js');
    zw = m.__zwTest;
    expect(typeof zw.lunarYearInfo).toBe('function');
    expect(typeof zw.yunXianCard).toBe('function');
  });

  it('2026-01-15 属乙巳年（修前：公历年 → 丙午）', () => {
    const info = zw.lunarYearInfo(new Date(2026, 0, 15, 12, 0));
    expect(info).toEqual({ ganZhi: '乙巳', lunarYear: 2025, source: 'iztro' });
  });

  it('立春后、春节前（2026-02-10）仍属乙巳年：紫微流年不等于立春换年', () => {
    expect(zw.lunarYearInfo(new Date(2026, 1, 10, 12, 0)).ganZhi).toBe('乙巳');
  });

  it('春节当日（2026-02-17）进丙午年', () => {
    const info = zw.lunarYearInfo(new Date(2026, 1, 17, 12, 0));
    expect(info.ganZhi).toBe('丙午');
    expect(info.lunarYear).toBe(2026);
  });

  it('公历跨年日 2025-12-31 已属乙巳年（农历年先于公历年换）', () => {
    expect(zw.lunarYearInfo(new Date(2025, 11, 31, 12, 0))).toEqual({
      ganZhi: '乙巳', lunarYear: 2025, source: 'iztro',
    });
  });

  it('1994 年生人：2026-01-15 虚岁 32、流年命宫取巳（修前：丙午 / 虚岁 33 / 午）', () => {
    const html = zw.yunXianCard(chart, new Date(2026, 0, 15, 12, 0));
    expect(html).toContain('乙巳年 · 虚岁 32');
    expect(html).not.toContain('丙午年');
    // 流年命宫必须与同一张牌的流年干支同源（巳 → 本命官禄宫）
    const si = chart.palaces.find((p) => p.earthlyBranch === '巳')!;
    expect(html).toContain(`乙巳年年支巳 → 本命「${si.name}」`);
  });

  it('1994 年生人：春节后 2026-02-17 虚岁 33、流年命宫取午', () => {
    const html = zw.yunXianCard(chart, new Date(2026, 1, 17, 12, 0));
    expect(html).toContain('丙午年 · 虚岁 33');
    const wu = chart.palaces.find((p) => p.earthlyBranch === '午')!;
    expect(html).toContain(`丙午年年支午 → 本命「${wu.name}」`);
  });

  it('虚岁与大限同口径：虚岁 32 落在「田宅 32–41」大限内，卡上大限行一致', () => {
    const dp = chart.palaces.find((p) => p.decadalRange[0] <= 32 && 32 <= p.decadalRange[1])!;
    expect(dp.decadalRange).toEqual([32, 41]);
    expect(zw.yunXianCard(chart, new Date(2026, 0, 15, 12, 0))).toContain(`虚岁 32–41 · 走「${dp.name}」`);
  });

  it('lunarYearOfText 解析农历串（含 1900 前后段与非法输入）', () => {
    expect(zw.lunarYearOfText('一九九四年六月廿四')).toBe(1994);
    expect(zw.lunarYearOfText('二〇二五年腊月廿九')).toBe(2025);
    expect(zw.lunarYearOfText('')).toBe(null);
    expect(zw.lunarYearOfText('2026-01-15')).toBe(null);
  });
});

/* ─────────────── 2. 八字纳音/胎息与日柱同口径（23:00 换日） ─────────────── */

describe('八字纳音/胎息跟随 23:00 换日的日柱', () => {
  it('2026-02-20 23:30 日柱丙寅 → 纳音炉中火、胎息辛亥（修前：乙丑 / 海中金 / 庚子）', () => {
    const r = paiBazi({ year: 2026, month: 2, day: 20, hour: 23, minute: 30, gender: '男' });
    expect(r.day.ganZhi).toBe('丙寅');
    expect(r.day.naYin).toBe('炉中火');
    expect(r.taiXi).toBe('辛亥');
  });

  it('同一子时：23:30 与次日 00:30 的日柱/纳音/胎息完全一致', () => {
    const a = paiBazi({ year: 2026, month: 2, day: 20, hour: 23, minute: 30, gender: '男' });
    const b = paiBazi({ year: 2026, month: 2, day: 21, hour: 0, minute: 30, gender: '男' });
    expect(a.day.ganZhi).toBe(b.day.ganZhi);
    expect(a.day.naYin).toBe(b.day.naYin);
    expect(a.taiXi).toBe(b.taiXi);
  });

  it('白天时段不受影响：2026-02-20 22:30 仍乙丑 / 海中金 / 庚子', () => {
    const r = paiBazi({ year: 2026, month: 2, day: 20, hour: 22, minute: 30, gender: '男' });
    expect(r.day.ganZhi).toBe('乙丑');
    expect(r.day.naYin).toBe('海中金');
    expect(r.taiXi).toBe('庚子');
  });

  it('扫 6 个跨纳音边界的日子：23:30 与次日 00:30 的日柱口径恒一致', () => {
    const days: Array<[number, number]> = [[2, 20], [4, 21], [6, 20], [8, 19], [10, 18], [12, 17]];
    for (const [month, day] of days) {
      const a = paiBazi({ year: 2026, month, day, hour: 23, minute: 30, gender: '男' });
      const b = paiBazi({ year: 2026, month, day: day + 1, hour: 0, minute: 30, gender: '男' });
      expect({ gz: a.day.ganZhi, ny: a.day.naYin, tx: a.taiXi }).toEqual({
        gz: b.day.ganZhi, ny: b.day.naYin, tx: b.taiXi,
      });
    }
  });

  it('胎元/命宫/身宫不因换日口径而变（只该改日柱派生项）', () => {
    const a = paiBazi({ year: 2026, month: 2, day: 20, hour: 23, minute: 30, gender: '男' });
    const b = paiBazi({ year: 2026, month: 2, day: 21, hour: 0, minute: 30, gender: '男' });
    expect(a.taiYuan).toBe(b.taiYuan);
    expect(a.mingGong).toBe(b.mingGong);
    expect(a.shenGong).toBe(b.shenGong);
  });
});

/* ─────────────── 3. 奇门拆补：23:00 换日只位移一次 ─────────────── */

// 三元局数表（《奇门遁甲统宗》通行表：每节气 上/中/下 三元）；测试独立录入，
// 已用既有金标准盘核对：寒露 上元6、春分 下元6、夏至 中元3、小暑 上元8。
const YANG_JU: Record<string, [number, number, number]> = {
  冬至: [1, 7, 4], 小寒: [2, 8, 5], 大寒: [3, 9, 6], 立春: [8, 5, 2],
  雨水: [9, 6, 3], 惊蛰: [1, 7, 4], 春分: [3, 9, 6], 清明: [4, 1, 7],
  谷雨: [5, 2, 8], 立夏: [4, 1, 7], 小满: [5, 2, 8], 芒种: [6, 3, 9],
};
const YIN_JU: Record<string, [number, number, number]> = {
  夏至: [9, 3, 6], 小暑: [8, 2, 5], 大暑: [7, 1, 4], 立秋: [2, 5, 8],
  处暑: [1, 4, 7], 白露: [9, 3, 6], 秋分: [7, 1, 4], 寒露: [6, 9, 3],
  霜降: [5, 8, 2], 立冬: [6, 9, 3], 小雪: [5, 8, 2], 大雪: [4, 7, 1],
};

/**
 * 独立基准：给定节气 + 「生效日」日干支，按拆补法算阴阳遁/局数/元。
 * 拆补规则：以当日所属「符头」（本节气内最近的甲日或己日，五天一元）定三元，
 *   符头支属 子午卯酉 → 上元，寅申巳亥 → 中元，辰戌丑未 → 下元。
 */
function chaiBuOracle(jieQi: string, effectiveDayGZ: string): { dun: string; ju: number; yuan: string } {
  const yang = YANG_JU[jieQi];
  const table = yang ?? YIN_JU[jieQi];
  if (!table) throw new Error(`节气无表: ${jieQi}`);
  const i = GZ60.indexOf(effectiveDayGZ);
  if (i < 0) throw new Error(`非 60 甲子: ${effectiveDayGZ}`);
  const fuTouZhi = ZHI[(i - (i % 5)) % 12];
  const yuanIdx = '子午卯酉'.includes(fuTouZhi) ? 0 : '寅申巳亥'.includes(fuTouZhi) ? 1 : 2;
  return {
    dun: yang ? '阳遁' : '阴遁',
    ju: table[yuanIdx]!,
    yuan: ['上元', '中元', '下元'][yuanIdx]!,
  };
}

/** 生效日（23:00 换日后的日柱）——取 calendar.ts 的 Exact 日柱作输入 */
function effectiveDayGZ(y: number, mo: number, d: number, h: number, mi: number): string {
  return solarToSiZhu({ year: y, month: mo, day: d, hour: h, minute: mi }).dayGanZhi;
}

describe('奇门拆补：晚子时只位移一次（23:30 与次日 00:30 同局）', () => {
  const rows: Array<{ m: number; d: number; jieQi: string; note: string }> = [
    { m: 1, d: 28, jieQi: '大寒', note: '修前 阳遁6局下元 → 修后 阳遁9局中元' },
    { m: 4, d: 18, jieQi: '清明', note: '修前 阳遁4局上元 → 修后 阳遁7局下元' },
    { m: 10, d: 25, jieQi: '霜降', note: '修前 阴遁2局下元 → 修后 阴遁8局中元' },
  ];

  for (const row of rows) {
    it(`2026-${row.m}-${row.d} 23:30（${row.jieQi}，癸日）：${row.note}`, () => {
      const q = paiQiMen({ year: 2026, month: row.m, day: row.d, hour: 23, minute: 30 });
      const oracle = chaiBuOracle(row.jieQi, effectiveDayGZ(2026, row.m, row.d, 23, 30));
      expect(q.jieQi).toBe(row.jieQi);
      expect({ dun: q.dun, ju: q.ju, yuan: q.yuan }).toEqual(oracle);
      // 同一子时的次日 00:30 必须同局同元
      const n = paiQiMen({ year: 2026, month: row.m, day: row.d + 1, hour: 0, minute: 30 });
      expect({ dun: n.dun, ju: n.ju, yuan: n.yuan }).toEqual(oracle);
      expect(n.siZhu).toEqual(q.siZhu);
    });

    it(`2026-${row.m}-${row.d} 22:30（亥时，未换日）与 23:30 日柱不同、各按自己的符头取局`, () => {
      const q22 = paiQiMen({ year: 2026, month: row.m, day: row.d, hour: 22, minute: 30 });
      const q23 = paiQiMen({ year: 2026, month: row.m, day: row.d, hour: 23, minute: 30 });
      expect(q22.jieQi).toBe(row.jieQi);
      expect(q22.siZhu.day).not.toBe(q23.siZhu.day);
      expect({ dun: q22.dun, ju: q22.ju, yuan: q22.yuan })
        .toEqual(chaiBuOracle(row.jieQi, effectiveDayGZ(2026, row.m, row.d, 22, 30)));
    });
  }

  it('节气内连扫 10 天：23:30 与次日 00:30 恒同局（2026-05-08..17 小满前）', () => {
    for (let d = 8; d <= 17; d++) {
      const a = paiQiMen({ year: 2026, month: 5, day: d, hour: 23, minute: 30 });
      const b = paiQiMen({ year: 2026, month: 5, day: d + 1, hour: 0, minute: 30 });
      expect({ dun: a.dun, ju: a.ju, yuan: a.yuan, siZhu: a.siZhu })
        .toEqual({ dun: b.dun, ju: b.ju, yuan: b.yuan, siZhu: b.siZhu });
    }
  });
});

/* ─────────────── 4. 梅花立春前夜不越界 ─────────────── */

describe('梅花时间起卦：立春前夜不越界（取次日 00:00 而非次日 23:30）', () => {
  it('2026-02-03 23:30 年支为巳（乙巳年）：修前午(7) → 修后巳(6)', () => {
    const r = castByTime(bj(2026, 2, 3, 23, 30));
    expect(r.yearBranchOrder).toBe(6); // 巳
    // 修前：年支午(7) → sum 36 → 上4 下5 动1；修后：sum 35 → 上3 下4 动6
    expect({ up: r.upperNumber, low: r.lowerNumber, mv: r.movingPosition })
      .toEqual({ up: 3, low: 4, mv: 6 });
    expect({ m: r.lunarMonth, d: r.lunarDay }).toEqual({ m: 12, d: 17 });
  });

  it('立春（2026-02-04 04:02）之后同日 05:00 才进午 — 边界仍按时刻判', () => {
    expect(castByTime(bj(2026, 2, 4, 3, 30)).yearBranchOrder).toBe(6);
    expect(castByTime(bj(2026, 2, 4, 5, 30)).yearBranchOrder).toBe(7);
  });

  it('立春当日晚子时 2026-02-04 23:30 已进丙午（归次日 00:00 仍在立春后）', () => {
    expect(castByTime(bj(2026, 2, 4, 23, 30)).yearBranchOrder).toBe(7);
  });

  it('农历月日仍随 23:00 换日进次日（2026-02-03 22:30 = 十六，23:30 = 十七）', () => {
    expect(castByTime(bj(2026, 2, 3, 22, 30))).toMatchObject({ lunarMonth: 12, lunarDay: 16, yearBranchOrder: 6 });
    expect(castByTime(bj(2026, 2, 3, 23, 30))).toMatchObject({ lunarMonth: 12, lunarDay: 17, yearBranchOrder: 6 });
  });
});

/* ─────────────── 5. 卦身：阳爻持世子起、阴爻持世午起 ─────────────── */

// 八卦三爻（自下而上；true=阳）——测试自带，不引 src 常量
const TRIGRAM_LINES: Record<BaGua, [boolean, boolean, boolean]> = {
  乾: [true, true, true], 兑: [true, true, false], 离: [true, false, true], 震: [true, false, false],
  巽: [false, true, true], 坎: [false, true, false], 艮: [false, false, true], 坤: [false, false, false],
};
const DIZHI12 = ['子', '丑', '寅', '卯', '辰', '巳', '午', '未', '申', '酉', '戌', '亥'];

/** 独立基准：卦身 = (世位-1) + (世爻为阳 ? 0 : 6)，0-based 地支序 */
function guaShenOracle(shiPosition: number, shiIsYang: boolean): string {
  return DIZHI12[(shiPosition - 1 + (shiIsYang ? 0 : 6)) % 12]!;
}

describe('卦身按世爻阴阳（不是世位奇偶）', () => {
  it('64 卦全量：以六爻盘实算的卦身，逐卦等于独立基准', () => {
    const mismatches: string[] = [];
    let legacyDiff = 0;
    for (const up of Object.keys(TRIGRAM_LINES) as BaGua[]) {
      for (const lo of Object.keys(TRIGRAM_LINES) as BaGua[]) {
        const lines = [...TRIGRAM_LINES[lo], ...TRIGRAM_LINES[up]]; // 初爻→上爻
        const values = lines.map((isYang) => (isYang ? 7 : 8)) as YaoValue[];
        const meta = getGuaMeta(up, lo);
        const pan = paipan({ yaoValues: values, year: 2026, month: 5, day: 1, hour: 12, minute: 0, gender: '男' });
        const shiYang = lines[meta.shiPosition - 1]!;
        const want = guaShenOracle(meta.shiPosition, shiYang);
        if (pan.guaShen !== want) mismatches.push(`${meta.name}: ${pan.guaShen} != ${want}`);
        // 旧口径（世位奇偶）与本基准不同的卦应恰为 32 卦
        const legacy = DIZHI12[meta.shiPosition % 2 === 1 ? meta.shiPosition - 1 : meta.shiPosition + 5]!;
        if (legacy !== want) legacyDiff++;
      }
    }
    expect(mismatches).toEqual([]);
    expect(legacyDiff).toBe(32);
  });

  it('天风姤（世在初爻、阴爻）卦身为午：修前子 → 修后午', () => {
    // 姤 = 乾上巽下，初爻阴
    const pan = paipan({ yaoValues: [8, 7, 7, 7, 7, 7] as YaoValue[], year: 2026, month: 5, day: 1, hour: 12, minute: 0, gender: '男' });
    expect(pan.benGua.name).toBe('天风姤');
    expect(pan.benGua.shiPosition).toBe(1);
    expect(pan.guaShen).toBe('午');
  });

  it('八纯卦：乾（世6、阳爻）卦身巳，坤（世6、阴爻）卦身亥', () => {
    const qian = paipan({ yaoValues: [7, 7, 7, 7, 7, 7] as YaoValue[], year: 2026, month: 5, day: 1, hour: 12, minute: 0, gender: '男' });
    const kun = paipan({ yaoValues: [8, 8, 8, 8, 8, 8] as YaoValue[], year: 2026, month: 5, day: 1, hour: 12, minute: 0, gender: '男' });
    expect([qian.benGua.name, qian.guaShen]).toEqual(['乾为天', '巳']);
    expect([kun.benGua.name, kun.guaShen]).toEqual(['坤为地', '亥']);
  });

  it('calcGuaShen 直接调用：阳世子起、阴世午起', () => {
    expect(calcGuaShen(1, '阳')).toBe('子');
    expect(calcGuaShen(6, '阳')).toBe('巳');
    expect(calcGuaShen(1, '阴')).toBe('午');
    expect(calcGuaShen(2, '阴')).toBe('未');
    expect(calcGuaShen(6, '阴')).toBe('亥');
  });

  it('calcGuaShen 参数校验：越界世位/非法阴阳都报错', () => {
    expect(() => calcGuaShen(0, '阳')).toThrow('世爻位置越界');
    expect(() => calcGuaShen(7, '阳')).toThrow('世爻位置越界');
    expect(() => calcGuaShen(1, '阳阳' as unknown as YinYang)).toThrow('世爻阴阳非法');
  });
});
