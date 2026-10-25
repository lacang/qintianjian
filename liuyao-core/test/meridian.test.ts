import { describe, it, expect } from 'vitest';
import { getMeridian, shichenIndex } from '../src/meridian.js';

describe('子午流注（纳子法）shichenIndex', () => {
  it('23 点与 0 点都属子(0)', () => {
    expect(shichenIndex(23)).toBe(0);
    expect(shichenIndex(0)).toBe(0);
    expect(shichenIndex(0, 40)).toBe(0);
  });
  it('各时辰边界', () => {
    expect(shichenIndex(1)).toBe(1); // 丑
    expect(shichenIndex(3)).toBe(2); // 寅
    expect(shichenIndex(5)).toBe(3); // 卯
    expect(shichenIndex(11)).toBe(6); // 午
    expect(shichenIndex(21)).toBe(11); // 亥
  });
});

describe('当令经络 getMeridian', () => {
  it('寅时（3-5）= 手太阴肺经，金，表里手阳明大肠经', () => {
    const m = getMeridian(new Date(2026, 9, 18, 3, 30));
    expect(m.zhi).toBe('寅');
    expect(m.jing).toBe('肺');
    expect(m.meridian).toBe('手太阴肺经');
    expect(m.wuXing).toBe('金');
    expect(m.paired).toBe('手阳明大肠经');
    expect(m.nextZhi).toBe('卯');
    expect(m.minutesToNext).toBe(90);
  });

  it('午时（11-13）= 手少阴心经', () => {
    const m = getMeridian(new Date(2026, 9, 18, 11, 45));
    expect(m.jing).toBe('心');
    expect(m.meridian).toBe('手少阴心经');
    expect(m.wuXing).toBe('火');
    expect(m.minutesToNext).toBe(75);
  });

  it('子时跨日：23:20 属胆，距 1 点换肝经 100 分钟', () => {
    const m = getMeridian(new Date(2026, 9, 18, 23, 20));
    expect(m.zhi).toBe('子');
    expect(m.jing).toBe('胆');
    expect(m.nextZhi).toBe('丑');
    expect(m.minutesToNext).toBe(100);
  });

  it('酉时 = 足少阴肾经（水）', () => {
    const m = getMeridian(new Date(2026, 9, 18, 17, 5));
    expect(m.meridian).toBe('足少阴肾经');
    expect(m.wuXing).toBe('水');
  });
});
