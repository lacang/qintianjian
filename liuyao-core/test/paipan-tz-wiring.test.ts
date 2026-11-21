
import { describe, it, expect } from 'vitest';
import { paiBazi } from '../src/bazi.js';
import { paiZiwei } from '../src/ziwei.js';
import { resolveTime } from '../src/timeContext.js';

/**
 * 接线守卫：四柱与紫微必须走 timeContext（时区 / 夏令时 / 真太阳时）。
 * 这两条以前断过——星盘接了、四柱紫微没接，导致夏令时命例差一个时辰。
 */
const gz = (r: any) => [r.year.ganZhi, r.month.ganZhi, r.day.ganZhi, r.time.ganZhi].join(' ');
const SHENYANG = { city: '沈阳', lat: 41.8, lonEast: 123.43 };

describe('四柱与紫微的时间层接线', () => {
  it('不传地点时行为与旧实现一致（向后兼容）', () => {
    const base = { year: 1994, month: 8, day: 1, hour: 12, minute: 0, gender: '男' as const };
    expect(gz(paiBazi(base as any))).toBe('甲戌 辛未 己未 庚午');
  });

  it('1988 夏令时：扣 1 小时 + 真太阳时后时柱应进午时', () => {
    const base = { year: 1988, month: 7, day: 15, hour: 13, minute: 30, gender: '男' as const };
    const off = paiBazi(base as any);
    const on = paiBazi({ ...base, ...SHENYANG } as any);
    // 未接线：13:30 直接当本地时 → 未时
    expect(off.time.ganZhi).toBe('乙未');
    // 已接线：13:30 扣夏令时 → 12:30，加真太阳 +7.8 分 → 12:37 → 午时
    expect(on.time.ganZhi).toBe('甲午');
    const r = resolveTime({ year: 1988, month: 7, day: 15, hour: 13, minute: 30, ...SHENYANG });
    expect(r.inDst).toBe(true);
    expect(r.standard.hour).toBe(12);
    expect(r.trueSolar!.hour).toBe(12);
    expect(r.trueSolar!.minute).toBe(37);
  });

  it('紫微同样吃到时间层（时辰从 未时 变 午时）', () => {
    const base = { year: 1988, month: 7, day: 15, hour: 13, minute: 30, gender: '男' as const };
    expect((paiZiwei(base as any) as any).time).toBe('未时');
    expect((paiZiwei({ ...base, ...SHENYANG } as any) as any).time).toBe('午时');
  });

  it('非东八区：纽约出生不能按 +8 算', () => {
    const base = { year: 1994, month: 8, day: 1, hour: 12, minute: 0, gender: '男' as const };
    const ny = paiBazi({ ...base, city: '纽约', lat: 40.71, lonEast: -74.01 } as any);
    const cn = paiBazi({ ...base, ...SHENYANG } as any);
    expect(gz(ny)).not.toBe(gz(cn));
  });
});
