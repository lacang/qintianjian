import { describe, it, expect } from 'vitest';
import { castByTime, toApparentSolarTime } from '../src/timecast.js';
import { paipan } from '../src/paipan.js';

// 先天卦序：乾1 兑2 离3 震4 巽5 坎6 艮7 坤8
describe('梅花易数·时间起卦 castByTime', () => {
  it('2026-10-18 04:06（北京时间，戊寅时）= 上乾下雷 天雷无妄，四爻动', () => {
    // 农历九月初九，年支午7，寅时3；(7+9+9)=25→上1；(25+3)=28→下4；动 28%6=4
    const r = castByTime(new Date(2026, 9, 18, 4, 6, 0));
    expect(r.upperNumber).toBe(1);
    expect(r.lowerNumber).toBe(4);
    expect(r.movingPosition).toBe(4);
    expect(r.lunarMonth).toBe(9);
    expect(r.lunarDay).toBe(9);
    expect(r.hourBranchOrder).toBe(3);
    // 与 paipan 联动：上乾下震 = 天雷无妄，四爻动变 风雷益
    const p = paipan({
      yaoValues: r.cast.yaoValues,
      year: 2026, month: 10, day: 18, hour: 4, minute: 6,
    });
    expect(p.benGua.name).toBe('天雷无妄');
    expect(p.bianGua?.name).toBe('风雷益');
    expect(r.cast.movingPositions).toEqual([4]);
  });

  it('2026-10-18 02:46（丁丑时）= 上乾下火 天火同人，三爻动', () => {
    // (25+2)=27→下3；动 27%6=3
    const r = castByTime(new Date(2026, 9, 18, 2, 46, 0));
    expect(r.upperNumber).toBe(1);
    expect(r.lowerNumber).toBe(3);
    expect(r.movingPosition).toBe(3);
    const p = paipan({
      yaoValues: r.cast.yaoValues,
      year: 2026, month: 10, day: 18, hour: 2, minute: 46,
    });
    expect(p.benGua.name).toBe('天火同人');
    expect(p.bianGua?.name).toBe('天雷无妄');
  });

  it('同一时辰内（分钟不同）卦象不变，跨时辰交界换卦', () => {
    // 丑时 02:46 vs 02:50 应相同
    const a = castByTime(new Date(2026, 9, 18, 2, 46, 0));
    const b = castByTime(new Date(2026, 9, 18, 2, 50, 0));
    expect(a.upperNumber).toBe(b.upperNumber);
    expect(a.lowerNumber).toBe(b.lowerNumber);
    expect(a.movingPosition).toBe(b.movingPosition);
    // 3:00 整进入寅时，下卦与动爻应变（上卦仍同：年月日未变）
    const c = castByTime(new Date(2026, 9, 18, 3, 0, 0));
    expect(c.hourBranchOrder).toBe(3);
    expect(c.lowerNumber).not.toBe(a.lowerNumber);
  });

  it('同一时刻结果完全确定、可复现', () => {
    const t = new Date(2026, 9, 18, 12, 34, 56);
    const x = castByTime(t);
    const y = castByTime(new Date(t.getTime()));
    expect(x.cast.yaoValues).toEqual(y.cast.yaoValues);
    expect(x.movingPosition).toBe(y.movingPosition);
  });

  it('成卦值只有一个动爻，且 6 爻合法（6/7/8/9）', () => {
    for (let m = 0; m < 24; m++) {
      const r = castByTime(new Date(2026, 9, 18, m, 5, 0));
      expect(r.cast.yaoValues).toHaveLength(6);
      for (const v of r.cast.yaoValues) expect([6, 7, 8, 9]).toContain(v);
      const moving = r.cast.yaoValues.filter((v) => v === 6 || v === 9);
      expect(moving).toHaveLength(1);
    }
  });

  it('真太阳时校正：沈阳经度 123.43°E 加约 +13.7 分钟', () => {
    const base = new Date(2026, 9, 18, 2, 46, 0);
    const apparent = toApparentSolarTime(base, 123.4328);
    expect((apparent.getTime() - base.getTime()) / 60000).toBeCloseTo(13.73, 1);
    // 传入经度后内部使用真太阳时；02:46 北京 +13.7 分仍在丑时，故与未校正同卦
    const r1 = castByTime(base, { longitude: 123.4328 });
    const r2 = castByTime(base);
    expect(r1.lowerNumber).toBe(r2.lowerNumber);
    expect(r1.apparentSolarTime.getTime()).toBeGreaterThan(base.getTime());
  });

  it('真太阳时可把时辰边界附近的时刻推入下一辰（02:48+13.7分 过 3:00）', () => {
    // 北京 02:48 属丑时；沈阳真太阳时 ≈03:01.7 进寅时
    const bj = castByTime(new Date(2026, 9, 18, 2, 48, 0));
    const sy = castByTime(new Date(2026, 9, 18, 2, 48, 0), { longitude: 123.4328 });
    expect(bj.hourBranchOrder).toBe(2); // 丑
    expect(sy.hourBranchOrder).toBe(3); // 寅
    expect(sy.lowerNumber).not.toBe(bj.lowerNumber);
  });
});
