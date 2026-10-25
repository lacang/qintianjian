/**
 * 验收 4：节气边界必须用 lunar-javascript 的 Exact API。
 * 数据来源：引擎对账报告实测（立春 2026-02-04 04:02 换年/月柱；寒露 2026-10-08）。
 */
import { describe, expect, it } from 'vitest';
import { solarToSiZhu } from '../src/calendar.js';

describe('lunar Exact 节气边界', () => {
  it('立春前一刻：仍属上一年（乙巳年 己丑月）', () => {
    const sz = solarToSiZhu({ year: 2026, month: 2, day: 4, hour: 3, minute: 0 });
    expect(sz.yearGanZhi).toBe('乙巳');
    expect(sz.monthGanZhi).toBe('己丑');
  });

  it('立春 2026-02-04 04:02 换柱：05:00 入丙午年 庚寅月', () => {
    const sz = solarToSiZhu({ year: 2026, month: 2, day: 4, hour: 5, minute: 0 });
    expect(sz.yearGanZhi).toBe('丙午');
    expect(sz.monthGanZhi).toBe('庚寅');
  });

  it('换柱点分钟级敏感（04:01 vs 04:03 分属两侧）', () => {
    const before = solarToSiZhu({ year: 2026, month: 2, day: 4, hour: 4, minute: 1 });
    const after = solarToSiZhu({ year: 2026, month: 2, day: 4, hour: 4, minute: 3 });
    expect(before.yearGanZhi).toBe('乙巳');
    expect(after.yearGanZhi).toBe('丙午');
    expect(after.monthGanZhi).toBe('庚寅');
  });

  it('寒露 2026-10-08 14:30 换月柱：前丁酉、后戊戌', () => {
    // 实测 lunar-javascript@1.7.7 精确节气时刻：寒露交节约当日 14:30
    // （对账报告只测到"10-08 已入戊戌"，本测试按 Exact 分钟边界补严）
    const before = solarToSiZhu({ year: 2026, month: 10, day: 8, hour: 14, minute: 29 });
    const after = solarToSiZhu({ year: 2026, month: 10, day: 8, hour: 14, minute: 30 });
    expect(before.monthGanZhi).toBe('丁酉');
    expect(after.monthGanZhi).toBe('戊戌');
    expect(after.yearGanZhi).toBe('丙午');
  });

  it('日柱与旬空：2026-10-18 为乙丑日，旬空戌亥', () => {
    const sz = solarToSiZhu({ year: 2026, month: 10, day: 18, hour: 2, minute: 46 });
    expect(sz.dayGanZhi).toBe('乙丑');
    expect(sz.xunKong).toEqual(['戌', '亥']);
  });

  it('时柱：02:46→丁丑，04:06→戊寅', () => {
    expect(solarToSiZhu({ year: 2026, month: 10, day: 18, hour: 2, minute: 46 }).timeGanZhi).toBe('丁丑');
    expect(solarToSiZhu({ year: 2026, month: 10, day: 18, hour: 4, minute: 6 }).timeGanZhi).toBe('戊寅');
  });
});
