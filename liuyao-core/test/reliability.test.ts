/**
 * 内校层（validate.ts）回归测试 —— 第三轮可靠性审计 P0/P1 缺陷的守卫
 *
 * 每条用例对应 fix_r1.md 里的一条缺陷：
 *   A. 非法日期不得静默滚动（2/30、4/31、13 月、日 > 31）
 *   B. 年份区间统一 + Date.UTC(0..99) → 1900+year 的偏移坑
 *   C. 时间脏值（null/''/false/缺省）与小数时间
 *   D. 性别枚举（八字与紫微必须一致）
 *   E. 坐标（成对、不夹紧、高纬降级）
 *   F. 数值起卦（正整数 ≤ 64）
 *   G. 历史时区（1912–1949 五时区，绝不静默 +8）
 *   H. 节气秒（P1-1）
 *   I. toDms 进位（P1-2）
 *   J. 跨世纪大运步数（P2）
 */
import { describe, it, expect } from 'vitest';
import { paiBazi } from '../src/bazi.js';
import { paiZiwei } from '../src/ziwei.js';
import { paipanXingpan, toDms } from '../src/astro.js';
import { paipanVedic } from '../src/vedic.js';
import { paipan } from '../src/paipan.js';
import { resolveTime } from '../src/timeContext.js';
import { solarToSiZhu, getDayCalendar } from '../src/calendar.js';
import { meiHuaByNumbers } from '../src/meihua.js';
import { castByTime } from '../src/timecast.js';
import { paiQiMen } from '../src/qimen.js';
import {
  validateDate, validateDateTime, validateGeo, utcMsOf,
  InvalidDateError, InvalidTimeError, OutOfRangeError, InvalidGenderError, InvalidNumberError,
} from '../src/validate.js';

const any = (x: unknown) => x as any;
const gz = (r: any) => [r.year.ganZhi, r.month.ganZhi, r.day.ganZhi, r.time.ganZhi].join(' ');
/** 断言抛错，并核对错误码与消息片段（错误分型供前端使用，不能只靠中文正则） */
function throwsWith(fn: () => unknown, code: string, msg?: RegExp) {
  let err: any = null;
  try { fn(); } catch (e) { err = e; }
  expect(err, '应当抛错但没有抛').not.toBeNull();
  expect(err.code).toBe(code);
  if (msg) expect(String(err.message)).toMatch(msg);
  return err as Error;
}

/* ============================================================
   A. 非法日期不静默滚动
   ============================================================ */
describe('A. 非法日期：抛错而不是静默滚动', () => {
  it('2 月 30 日被拒（旧实现滚成 3 月 2 日）', () => {
    throwsWith(() => validateDate(2026, 2, 30), 'INVALID_DATE', /不存在的日期 2026-02-30/);
    throwsWith(() => paiBazi(any({ year: 2026, month: 2, day: 30, hour: 12, gender: '男' })),
      'INVALID_DATE', /2026-02-30/);
  });

  it('4 月 31 日被拒（旧实现滚成 5 月 1 日）', () => {
    throwsWith(() => paiZiwei(any({ year: 2024, month: 4, day: 31, hour: 12, gender: '男' })),
      'INVALID_DATE', /不存在的日期 2024-04-31/);
  });

  it('13 月与日 > 31 被拒，错误消息含具体值', () => {
    throwsWith(() => solarToSiZhu(any({ year: 2024, month: 13, day: 1, hour: 12 })),
      'INVALID_DATE', /月份 13 越界/);
    throwsWith(() => getDayCalendar(any({ year: 2024, month: 1, day: 32, hour: 12 })),
      'INVALID_DATE', /日 32 越界/);
  });

  it('闰年边界仍然正确（2024-02-29 通过、2023/2100 的 2-29 被拒）', () => {
    expect(validateDate(2024, 2, 29)).toEqual({ year: 2024, month: 2, day: 29 });
    throwsWith(() => validateDate(2023, 2, 29), 'INVALID_DATE', /只有 28 天/);
    throwsWith(() => validateDate(2100, 2, 29), 'INVALID_DATE', /只有 28 天/);
  });

  it('非整数日期分量被拒（2.5 日不是「半天」）', () => {
    throwsWith(() => validateDate(2024, 1, 2.5), 'INVALID_DATE', /必须是整数/);
  });
});

/* ============================================================
   B. 年份区间 + Date.UTC 0–99 偏移
   ============================================================ */
describe('B. 年份区间统一、Date.UTC(0..99) 偏移坑已修', () => {
  it('utcMsOf 不再把 50 年当成 1950 年', () => {
    expect(new Date(utcMsOf(50, 6, 1, 0, 0, 0)).getUTCFullYear()).toBe(50);
    expect(new Date(utcMsOf(1, 1, 1, 0, 0, 0)).getUTCFullYear()).toBe(1);
    expect(new Date(utcMsOf(-50, 12, 31, 0, 0, 0)).getUTCFullYear()).toBe(-50);
    // 对照：原生 Date.UTC 的老坑（说明为什么要绕开它）
    expect(new Date(Date.UTC(50, 0, 1)).getUTCFullYear()).toBe(1950);
  });

  it('公元 1 年在历法类入口可用（旧行为：被当成 1901 或直接拒）', () => {
    const r = validateDateTime(any({ year: 1, month: 6, day: 1, hour: 12 }), { yearRange: 'calendar' });
    expect(r.year).toBe(1);
    expect(() => solarToSiZhu(any({ year: 1, month: 6, day: 1, hour: 12 }))).not.toThrow();
  });

  it('西占吃高精度星历：1600–2200 之外抛 OutOfRangeError，消息写明区间', () => {
    const base = { month: 6, day: 1, hour: 12, lat: 39.9, lonEast: 116.4, utcOffsetHours: 8 };
    throwsWith(() => paipanXingpan(any({ ...base, year: 1 })), 'OUT_OF_RANGE', /1600–2200/);
    throwsWith(() => paipanXingpan(any({ ...base, year: 1500 })), 'OUT_OF_RANGE', /1600–2200/);
    throwsWith(() => paipanXingpan(any({ ...base, year: 2201 })), 'OUT_OF_RANGE', /1600–2200/);
    expect(() => paipanXingpan(any({ ...base, year: 1600 }))).not.toThrow();
    expect(() => paipanVedic(any({ ...base, year: 2200 }))).not.toThrow();
  });

  it('负数年 / 0 年一律拒（旧实现负数年反而能排）', () => {
    throwsWith(() => solarToSiZhu(any({ year: 0, month: 1, day: 1, hour: 0 })), 'OUT_OF_RANGE', /0001–9999/);
    throwsWith(() => paiBazi(any({ year: -5, month: 1, day: 1, hour: 0, gender: '男' })), 'OUT_OF_RANGE');
    throwsWith(() => paipanXingpan(any({ year: -5, month: 1, day: 1, hour: 0, lat: 0, lonEast: 0 })),
      'OUT_OF_RANGE', /1600–2200/);
  });

  it('紫微按 iztro 星表区间 1900–2100 拒（不排空盘）', () => {
    throwsWith(() => paiZiwei(any({ year: 1899, month: 6, day: 1, hour: 12, gender: '男' })),
      'OUT_OF_RANGE', /1900–2100/);
    expect(() => paiZiwei(any({ year: 1900, month: 6, day: 1, hour: 12, gender: '男' }))).not.toThrow();
  });
});

/* ============================================================
   C. 时间脏值 / 小数时间
   ============================================================ */
describe('C. 时间入参：缺省脏值抛错、小数时间向下取整并写 warning', () => {
  const base = { year: 1994, month: 8, day: 1, minute: 0, gender: '男' as const };

  it('缺小时抛 InvalidTimeError（旧行为：静默按 0 点或 12 点）', () => {
    throwsWith(() => paiBazi(any({ ...base })), 'INVALID_TIME', /未提供小时/);
    throwsWith(() => solarToSiZhu(any({ year: 1994, month: 8, day: 1 })), 'INVALID_TIME');
  });

  it('null / 空串 / false 都算「没给」，一律抛错', () => {
    for (const bad of [null, '', false]) {
      throwsWith(() => solarToSiZhu(any({ year: 1994, month: 8, day: 1, hour: bad })), 'INVALID_TIME');
    }
  });

  it('strict: false 时回退 0 点并把口径写进 warnings', () => {
    const r = solarToSiZhu(any({ year: 1994, month: 8, day: 1, strict: false }));
    expect(r.timeGanZhi).toBe(solarToSiZhu(any({ year: 1994, month: 8, day: 1, hour: 0 })).timeGanZhi);
    const b = paiBazi(any({ ...base, strict: false }));
    expect(b.warnings.join()).toContain('未提供小时，按 0 点计');
  });

  it('hour: 3.9 向下取整为 3 点（寅时），并写 warning', () => {
    const dec = paiBazi(any({ ...base, hour: 3.9 }));
    const int = paiBazi(any({ ...base, hour: 3 }));
    expect(gz(dec)).toBe(gz(int));
    expect(dec.warnings.join()).toMatch(/小时 3\.9 不是整数，已向下取整为 3/);
    expect(int.warnings.join()).not.toMatch(/向下取整/);
  });

  it('minute: 30.7 向下取整为 30 分，并写 warning', () => {
    const r = validateDateTime(any({ year: 1994, month: 8, day: 1, hour: 3, minute: 30.7 }));
    expect(r.minute).toBe(30);
    expect(r.warnings.join()).toMatch(/分钟 30\.7 不是整数/);
  });

  it('越界/非数值时间抛错（24 点、NaN、字符串）', () => {
    throwsWith(() => validateDateTime(any({ year: 1994, month: 8, day: 1, hour: 24 })), 'INVALID_TIME', /越界/);
    throwsWith(() => validateDateTime(any({ year: 1994, month: 8, day: 1, hour: NaN })), 'INVALID_TIME', /必须是/);
    throwsWith(() => validateDateTime(any({ year: 1994, month: 8, day: 1, hour: '12' })), 'INVALID_TIME', /必须是/);
    throwsWith(() => validateDateTime(any({ year: 1994, month: 8, day: 1, hour: 1, minute: 60 })), 'INVALID_TIME', /越界/);
  });

  it('秒透传：second 参与日柱/交节判定', () => {
    const r = validateDateTime(any({ year: 1994, month: 8, day: 1, hour: 3, minute: 0, second: 45 }));
    expect(r.second).toBe(45);
  });
});

/* ============================================================
   D. 性别
   ============================================================ */
describe('D. 性别枚举：六种写法归一，八字与紫微一致', () => {
  const b = { year: 1994, month: 8, day: 1, hour: 12, minute: 0 };

  it('八字与紫微对同一非法值抛同样的错', () => {
    const e1 = throwsWith(() => paiBazi(any({ ...b, gender: 'x' })), 'INVALID_GENDER', /只接受 男\/女/);
    const e2 = throwsWith(() => paiZiwei(any({ ...b, gender: 'x' })), 'INVALID_GENDER', /只接受 男\/女/);
    expect(e1.message).toBe(e2.message);
  });

  it('缺性别：八字与紫微都抛（旧行为：八字默认女命、紫微报错）', () => {
    throwsWith(() => paiBazi(any({ ...b })), 'INVALID_GENDER', /缺少性别/);
    throwsWith(() => paiZiwei(any({ ...b })), 'INVALID_GENDER', /缺少性别/);
  });

  it("'M' / 'male' / '男' 三者同解（旧行为：'M' 在八字被当成女命）", () => {
    const a = paiBazi(any({ ...b, gender: 'M' }));
    const c = paiBazi(any({ ...b, gender: 'male' }));
    const d = paiBazi(any({ ...b, gender: '男' }));
    expect(a.gender).toBe('男');
    expect(gz(a)).toBe(gz(c));
    expect(gz(a)).toBe(gz(d));
    expect(a.daYun.direction).toBe(d.daYun.direction);
    expect(paiZiwei(any({ ...b, gender: 'f' })).gender).toBe('女');
  });

  it('非字符串性别（数字/对象）被拒', () => {
    throwsWith(() => paiBazi(any({ ...b, gender: 1 })), 'INVALID_GENDER', /必须是字符串/);
  });
});

/* ============================================================
   E. 坐标
   ============================================================ */
describe('E. 坐标：成对、不夹紧、高纬降级', () => {
  const t = { year: 1990, month: 6, day: 1, hour: 12, minute: 0, utcOffsetHours: 8 };

  it('纬度/经度越界抛错，不夹紧成 ±90/±180', () => {
    throwsWith(() => validateGeo(100, 120), 'OUT_OF_RANGE', /\[-90, 90\]/);
    throwsWith(() => validateGeo(30, 200), 'OUT_OF_RANGE', /\[-180, 180\]/);
    throwsWith(() => paipanXingpan(any({ ...t, lat: 91, lonEast: 116 })), 'OUT_OF_RANGE');
  });

  it('只给一个坐标抛错（旧行为：lon 默认 0，盘算在几内亚湾）', () => {
    throwsWith(() => validateGeo(30, undefined), 'OUT_OF_RANGE', /必须成对给出/);
    throwsWith(() => validateGeo(undefined, 120), 'OUT_OF_RANGE', /必须成对给出/);
    throwsWith(() => paipanXingpan(any({ ...t, lat: 30 })), 'OUT_OF_RANGE', /必须成对给出/);
    throwsWith(() => paiBazi(any({ year: 1990, month: 6, day: 1, hour: 12, gender: '男', lat: 30 })),
      'OUT_OF_RANGE', /必须成对给出/);
  });

  it('赤道/本初子午线的 0 是合法值', () => {
    expect(validateGeo(0, 0)).toEqual({ lat: 0, lon: 0 });
    expect(() => paipanXingpan(any({ ...t, lat: 0, lonEast: 0 }))).not.toThrow();
  });

  it('|lat| > 66.5 时 warnings 标注高纬宫位降级', () => {
    const hi = paipanXingpan(any({ ...t, lat: 70, lonEast: 20 }));
    expect(hi.warnings.join()).toMatch(/高纬宫位已降级/);
    const hiVedic = paipanVedic(any({ ...t, lat: 70, lonEast: 20 }));
    expect(hiVedic.warnings.join()).toMatch(/高纬宫位已降级/);
    const normal = paipanXingpan(any({ ...t, lat: 39.9, lonEast: 116.4 }));
    expect(normal.warnings.join()).not.toMatch(/高纬/);
  });
});

/* ============================================================
   F. 数值起卦
   ============================================================ */
describe('F. 数值起卦：1–64 的正整数', () => {
  it('0 / 负数 / 小数 / 字符串 / > 64 全部抛错', () => {
    throwsWith(() => meiHuaByNumbers(0, 5), 'INVALID_NUMBER', /1–64/);
    throwsWith(() => meiHuaByNumbers(-3, 5), 'INVALID_NUMBER', /1–64/);
    throwsWith(() => meiHuaByNumbers(3.5, 5), 'INVALID_NUMBER', /必须是整数/);
    throwsWith(() => meiHuaByNumbers(any('3'), 5), 'INVALID_NUMBER', /必须是数值/);
    throwsWith(() => meiHuaByNumbers(65, 5), 'INVALID_NUMBER', /1–64/);
    throwsWith(() => meiHuaByNumbers(5, NaN), 'INVALID_NUMBER');
  });

  it('合法范围内结果不变（8,8 仍为上坤下坤）', () => {
    const r = any(meiHuaByNumbers(8, 8));
    expect(r).toBeTruthy();
  });

  it('非法 Date / NaN 时间戳的时间起卦被拒', () => {
    throwsWith(() => castByTime(new Date(NaN)), 'INVALID_DATE', /起卦时刻无效/);
    throwsWith(() => castByTime(Number.NaN), 'INVALID_DATE');
  });
});

/* ============================================================
   G. 历史时区 1912–1949
   ============================================================ */
describe('G. 历史时区：1912–1949 分五时区，绝不静默 +8', () => {
  const at = (city: string, year: number, month = 6, day = 1) =>
    resolveTime({ year, month, day, hour: 12, minute: 0, city } as any);

  it('成都 1930 按陇蜀时区 +7（旧行为：+8，错一个时辰，warnings 为空）', () => {
    const r = at('成都', 1930);
    expect(r.baseUtcOffsetHours).toBe(7);
    expect(r.warnings.join()).toMatch(/陇蜀时区/);
    expect(r.warnings.join()).toMatch(/历史时区/);
  });

  it('重庆 1930 属中原标准时区 +8，但仍要写历史口径 warning', () => {
    const r = at('重庆', 1930);
    expect(r.baseUtcOffsetHours).toBe(8);
    expect(r.warnings.join()).toMatch(/中原标准时区/);
  });

  it('乌鲁木齐 1940 按新藏时区 +6、拉萨 1940 按昆仑时区 +5.5', () => {
    const w = at('乌鲁木齐', 1940);
    expect(w.baseUtcOffsetHours).toBe(6);
    expect(w.warnings.join()).toMatch(/新藏时区/);
    const l = at('拉萨', 1940);
    expect(l.baseUtcOffsetHours).toBe(5.5);
    expect(l.warnings.join()).toMatch(/昆仑时区/);
  });

  it('昆明 / 西安 1930 同属陇蜀 +7；上海 1930 属中原 +8', () => {
    expect(at('昆明', 1930).baseUtcOffsetHours).toBe(7);
    expect(at('西安', 1930).baseUtcOffsetHours).toBe(7);
    expect(at('上海', 1930).baseUtcOffsetHours).toBe(8);
  });

  it('1949-10-01 起全国统一 +8，不再出现历史时区 warning', () => {
    const later = at('成都', 1950);
    expect(later.baseUtcOffsetHours).toBe(8);
    expect(later.warnings.join()).not.toMatch(/陇蜀时区/);
  });

  it('显式 utcOffsetHours 是用户权威，不被历史表覆盖', () => {
    const r = resolveTime({ year: 1930, month: 6, day: 1, hour: 12, minute: 0, city: '成都', utcOffsetHours: 8 } as any);
    expect(r.utcOffsetHours).toBe(8);
    expect(r.warnings.join()).not.toMatch(/陇蜀时区/);
  });

  it('紫微 / 奇门 / 六爻 也把历史时区 warning 回写到 result.warnings', () => {
    const zw = paiZiwei(any({ year: 1930, month: 6, day: 1, hour: 12, minute: 0, gender: '男', city: '成都' }));
    expect(zw.warnings.join()).toMatch(/陇蜀时区/);
    const qm = paiQiMen(any({ year: 1930, month: 6, day: 1, hour: 12, minute: 0, city: '成都' }));
    expect(qm.warnings.join()).toMatch(/陇蜀时区/);
    const ly = paipan(any({
      year: 1930, month: 6, day: 1, hour: 12, minute: 0, city: '成都', yaoValues: [7, 8, 7, 8, 7, 8],
    }));
    expect((ly.warnings ?? []).join()).toMatch(/陇蜀时区/);
  });

  it('八字入口拿到同一历史时区：成都 1930 按 +7 与强按 +8 差一个时辰', () => {
    const cd = paiBazi(any({ year: 1930, month: 6, day: 1, hour: 12, minute: 0, gender: '男', city: '成都' }));
    const cd8 = paiBazi(any({
      year: 1930, month: 6, day: 1, hour: 12, minute: 0, gender: '男', city: '成都', utcOffsetHours: 8,
    }));
    expect(cd.warnings.join()).toMatch(/陇蜀时区/);
    // 旧实现一律 +8 → 真太阳时 11:04 属巳时；按陇蜀 +7 → 11:56 属午时（差一个时辰）
    expect(cd.time.zhi).toBe('午');
    expect(cd8.time.zhi).toBe('巳');
    expect(cd.time.ganZhi).not.toBe(cd8.time.ganZhi);
    // warnings 不得重复（校验层与时间层各产一条，合并后要有去重口径）
    const all = paiBazi(any({
      year: 1930, month: 6, day: 1, hour: 12.5, minute: 0, gender: '男', city: '成都',
    })).warnings;
    expect(new Set(all).size).toBe(all.length);
    expect(all.length).toBeGreaterThanOrEqual(2);
  });
});

/* ============================================================
   H. 节气秒（P1-1）
   ============================================================ */
describe('H. 节气交节精确到秒：不再把秒硬置 0', () => {
  // 小寒 2026-01-05 16:23:10 → 该分钟第 10 秒才换月柱（旧实现 16:23:00 就换，晚 0–59 秒）
  it('交节当秒的盘归新月柱，前一秒仍属旧月柱', () => {
    const after = solarToSiZhu(any({ year: 2026, month: 1, day: 5, hour: 16, minute: 23, second: 10 }));
    const before = solarToSiZhu(any({ year: 2026, month: 1, day: 5, hour: 16, minute: 23, second: 9 }));
    expect(after.monthGanZhi).toBe('己丑');
    expect(before.monthGanZhi).toBe('戊子');
  });

  it('八字入口同样按秒判定', () => {
    const r = paiBazi(any({
      year: 2026, month: 1, day: 5, hour: 16, minute: 23, second: 10, gender: '男',
    }));
    expect(r.month.ganZhi).toBe('己丑');
    const r0 = paiBazi(any({
      year: 2026, month: 1, day: 5, hour: 16, minute: 23, second: 0, gender: '男',
    }));
    expect(r0.month.ganZhi).toBe('戊子');
  });

  it('getDayCalendar 也保留秒（节气列表同一口径）', () => {
    expect(() => getDayCalendar(any({ year: 2026, month: 1, day: 5, hour: 16, minute: 23, second: 10 })))
      .not.toThrow();
  });
});

/* ============================================================
   I. toDms 进位（P1-2）
   ============================================================ */
describe('I. toDms 进位：29°59′57″ 不得显示成 0°00′ 却停在原星座', () => {
  it('分钟内进位跨 30° 时连星座一起进（lon 同步回写）', () => {
    expect(toDms(29.99999)).toMatchObject({ degree: 0, minute: 0 });
    expect(toDms(29.99999).lon).toBeCloseTo(30, 6);
    expect(toDms(59.99999)).toMatchObject({ degree: 0, minute: 0 });
    expect(toDms(59.99999).lon).toBeCloseTo(60, 6);
  });

  it('跨 360° 回绕到 0（白羊 0°）', () => {
    expect(toDms(359.99999)).toMatchObject({ degree: 0, minute: 0 });
    expect(toDms(359.99999).lon).toBeCloseTo(0, 6);
  });

  it('常规值不产生偏移（29°30′ = 29.5）', () => {
    expect(toDms(29.5)).toMatchObject({ degree: 29, minute: 30 });
    expect(toDms(29.5).lon).toBeCloseTo(29.5, 9);
  });

  it('星座内的度分必须与回写的 lon 自洽（±1′）', () => {
    for (const lon of [0, 15.25, 89.99, 119.9999, 179.5, 269.99999, 300.0166]) {
      const d = toDms(lon);
      const sign = Math.floor(d.lon / 30);
      expect(sign * 30 + d.degree + d.minute / 60).toBeCloseTo(d.lon, 6);
      expect(d.degree).toBeGreaterThanOrEqual(0);
      expect(d.degree).toBeLessThanOrEqual(29);
      expect(d.minute).toBeGreaterThanOrEqual(0);
      expect(d.minute).toBeLessThanOrEqual(59);
    }
  });
});

/* ============================================================
   J. 跨世纪大运（P2）
   ============================================================ */
describe('J. 大运覆盖 200 年（旧实现 10 步止于约 107 岁）', () => {
  it('1900 年生的大运排到 110 岁以后', () => {
    const r = paiBazi(any({ year: 1900, month: 3, day: 5, hour: 8, minute: 0, gender: '男' }));
    expect(r.daYun.list.length).toBe(20);
    const last = r.daYun.list[r.daYun.list.length - 1];
    expect(last.endAge).toBeGreaterThan(110);
  });
});

/* ============================================================
   K. 各入口一致性（同一套校验）
   ============================================================ */
describe('K. 所有排盘入口共用同一套校验', () => {
  it('2/30 在八字、紫微、奇门、六爻、西占、吠陀全部抛 InvalidDateError', () => {
    const bad = { year: 2026, month: 2, day: 30, hour: 12, minute: 0 };
    throwsWith(() => paiBazi(any({ ...bad, gender: '男' })), 'INVALID_DATE');
    throwsWith(() => paiZiwei(any({ ...bad, gender: '男' })), 'INVALID_DATE');
    throwsWith(() => paiQiMen(any({ ...bad })), 'INVALID_DATE');
    throwsWith(() => paipan(any({ ...bad, yaoValues: [7, 8, 7, 8, 7, 8] })), 'INVALID_DATE');
    throwsWith(() => paipanXingpan(any({ ...bad, lat: 30, lonEast: 120 })), 'INVALID_DATE');
    throwsWith(() => paipanVedic(any({ ...bad, lat: 30, lonEast: 120 })), 'INVALID_DATE');
  });

  it('缺小时的错误类型在所有入口一致', () => {
    const noHour = { year: 1994, month: 8, day: 1, minute: 0 };
    throwsWith(() => paiBazi(any({ ...noHour, gender: '男' })), 'INVALID_TIME');
    throwsWith(() => paiQiMen(any({ ...noHour })), 'INVALID_TIME');
    throwsWith(() => paipanXingpan(any({ ...noHour, lat: 30, lonEast: 120 })), 'INVALID_TIME');
  });

  it('错误类都继承 InputValidationError 且带 code（前端可分层提示）', () => {
    for (const Err of [InvalidDateError, InvalidTimeError, OutOfRangeError, InvalidGenderError, InvalidNumberError]) {
      const e = new (Err as any)('x');
      expect(e).toBeInstanceOf(Error);
      expect(typeof e.code).toBe('string');
      expect(e.code.length).toBeGreaterThan(3);
    }
  });
});
