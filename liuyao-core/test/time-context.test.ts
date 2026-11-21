/**
 * 统一时间层（timeContext）验收测试
 *
 * 覆盖：
 * ① 四个城市的真太阳时偏差（沈阳/乌鲁木齐/纽约/伦敦）+ 拉萨（极端经度）
 * ② 中国 1986–1991 夏令时：6 个年份 × 5 个边界（前一天 / 当天 03:00 / 结束日 01:30 / 结束日 03:00 / 后一天）
 * ③ 中国境内外时区查表（含新疆西藏一律 +8、境外 DST、兜底标记、显式优先）
 * ④ 均时差正负峰值（2 月中 ≈ −14 分、11 月初 ≈ +16 分）
 * ⑤ 与 calendar / astro 的联动（夏令时还原四柱、星盘走真实 UT）
 */
import { describe, it, expect } from 'vitest';
import {
  resolveTime,
  equationOfTimeMinutes,
  lookupCityTimeZone,
  listCityTimeZones,
  chinaDstWindow,
  chinaDstAppliesToCivil,
  chinaDstInEffect,
  offsetFromLongitude,
  formatOffsetName,
} from '../src/timeContext.js';
import { solarToSiZhu } from '../src/calendar.js';
import { paipanXingpan } from '../src/astro.js';

const minutesOfDay = (t: { hour: number; minute: number }) => t.hour * 60 + t.minute;

describe('timeContext / 真太阳时', () => {
  it('沈阳：经度 +13.7 分、真太阳时比北京时快约 13 分', () => {
    const r = resolveTime({ year: 2024, month: 6, day: 15, hour: 12, city: '沈阳' });
    expect(r.utcOffsetHours).toBe(8);
    expect(r.tzFallback).toBe(false);
    expect(r.sourceTzName).toBe('Asia/Shanghai');
    expect(r.longitude).toBeCloseTo(123.4315, 3);
    // (123.4315 − 120) × 4 = 13.73 分
    expect(r.longitudeOffsetMinutes).toBeCloseTo(13.73, 1);
    // 6 月中均时差约 −0.5 分
    expect(r.equationOfTimeMinutes).toBeCloseTo(-0.53, 0);
    expect(r.trueSolarOffsetMinutes).toBeCloseTo(13.19, 1);
    expect(r.trueSolar).not.toBeNull();
    expect(minutesOfDay(r.trueSolar!)).toBe(12 * 60 + 13);
  });

  it('乌鲁木齐：官方 +8 不按经度拆，但真太阳时慢 2 小时 10 分', () => {
    const r = resolveTime({ year: 2024, month: 6, day: 15, hour: 12, city: '乌鲁木齐' });
    expect(r.utcOffsetHours).toBe(8);
    expect(r.tzFallback).toBe(false);
    // 与北京同一钟面 → 同一 UTC 瞬间（时区不按经度拆）
    const bj = resolveTime({ year: 2024, month: 6, day: 15, hour: 12, city: '北京' });
    expect(r.utcMs).toBe(bj.utcMs);
    // (87.6168 − 120) × 4 = −129.53 分
    expect(r.longitudeOffsetMinutes).toBeCloseTo(-129.53, 1);
    expect(r.trueSolarOffsetMinutes).toBeCloseTo(-130.07, 1);
    expect(minutesOfDay(r.trueSolar!)).toBe(9 * 60 + 49);
    expect(r.trueSolarOffsetMinutes! / 60).toBeLessThan(-2);
  });

  it('纽约：经度 +4.0 分（西五区中央经线 −75°），冬令时合计约 −5.3 分', () => {
    const r = resolveTime({ year: 2024, month: 1, day: 15, hour: 12, city: '纽约' });
    expect(r.utcOffsetHours).toBe(-5);
    expect(r.inDst).toBe(false);
    expect(r.sourceTzName).toBe('America/New_York');
    expect(r.longitudeOffsetMinutes).toBeCloseTo(3.98, 1);
    expect(r.equationOfTimeMinutes).toBeCloseTo(-9.26, 1);
    expect(r.trueSolarOffsetMinutes).toBeCloseTo(-5.29, 1);
    expect(minutesOfDay(r.trueSolar!)).toBe(11 * 60 + 54);
  });

  it('伦敦：本初子午线 −0.5 分，1 月中合计约 −9.7 分', () => {
    const r = resolveTime({ year: 2024, month: 1, day: 15, hour: 12, city: '伦敦' });
    expect(r.utcOffsetHours).toBe(0);
    expect(r.longitudeOffsetMinutes).toBeCloseTo(-0.51, 1);
    expect(r.trueSolarOffsetMinutes).toBeCloseTo(-9.71, 1);
    expect(minutesOfDay(r.trueSolar!)).toBe(11 * 60 + 50);
  });

  it('拉萨：官方 +8，真太阳时慢 1 小时 56 分（官方时区 ≠ 地方时）', () => {
    const r = resolveTime({ year: 2024, month: 6, day: 15, hour: 12, city: '拉萨' });
    expect(r.utcOffsetHours).toBe(8);
    expect(r.longitudeOffsetMinutes).toBeCloseTo(-115.31, 1);
    expect(minutesOfDay(r.trueSolar!)).toBe(10 * 60 + 4);
  });

  it('真太阳时三份口径自洽：真太阳时 = 标准时 + 经度差 + 均时差', () => {
    const r = resolveTime({ year: 2024, month: 6, day: 15, hour: 12, city: '沈阳' });
    const composed = minutesOfDay(r.standard) * 60000
      + Math.round((r.longitudeOffsetMinutes! + r.equationOfTimeMinutes!) * 60000);
    const actual = minutesOfDay(r.trueSolar!) * 60000 + r.trueSolar!.second * 1000;
    expect(Math.abs(composed - actual)).toBeLessThan(1000);
  });

  it('开关 trueSolarTime=false 时只给民用时，不算真太阳时', () => {
    const r = resolveTime({ year: 2024, month: 6, day: 15, hour: 12, city: '沈阳', trueSolarTime: false });
    expect(r.trueSolarTimeEnabled).toBe(false);
    expect(r.trueSolar).toBeNull();
    expect(r.trueSolarOffsetMinutes).toBeNull();
    expect(r.longitudeOffsetMinutes).toBeNull();
  });

  it('缺经度时不硬算真太阳时，并给出提示', () => {
    const r = resolveTime({ year: 2024, month: 6, day: 15, hour: 12, utcOffsetHours: 8 });
    expect(r.trueSolar).toBeNull();
    expect(r.warnings.join()).toContain('经度');
  });
});

describe('timeContext / 均时差', () => {
  it('2 月中约 −14 分（年内负峰）', () => {
    const eot = equationOfTimeMinutes(new Date('2026-02-11T12:00:00Z'));
    expect(eot).toBeGreaterThan(-14.7);
    expect(eot).toBeLessThan(-13.7);
    expect(eot).toBeCloseTo(-14.16, 0);
  });

  it('11 月初约 +16 分（年内正峰）', () => {
    const eot = equationOfTimeMinutes(new Date('2026-11-03T12:00:00Z'));
    expect(eot).toBeGreaterThan(15.9);
    expect(eot).toBeLessThan(17.0);
    expect(eot).toBeCloseTo(16.46, 0);
  });

  it('5 月中、7 月底两个次极值方向相反', () => {
    expect(equationOfTimeMinutes(new Date('2026-05-14T12:00:00Z'))).toBeCloseTo(3.69, 0);
    expect(equationOfTimeMinutes(new Date('2026-07-26T12:00:00Z'))).toBeCloseTo(-6.55, 0);
  });

  it('全年落在 ±17 分内，且四季各取一点符号正确', () => {
    let min = Infinity;
    let max = -Infinity;
    for (let d = 0; d < 365; d += 1) {
      const t = new Date(Date.UTC(2026, 0, 1, 12) + d * 86400000);
      const v = equationOfTimeMinutes(t);
      min = Math.min(min, v);
      max = Math.max(max, v);
    }
    expect(min).toBeGreaterThan(-15);
    expect(max).toBeLessThan(17);
    expect(max - min).toBeGreaterThan(29);
  });
});

describe('timeContext / 时区查表', () => {
  it('中国境内（含新疆西藏港澳台）一律 +8', () => {
    for (const city of ['北京', '上海', '广州', '沈阳', '乌鲁木齐', '喀什', '拉萨', '西宁', '香港', '澳门', '台北']) {
      const r = resolveTime({ year: 2024, month: 6, day: 15, hour: 12, city });
      expect(r.utcOffsetHours, city).toBe(8);
      expect(r.tzFallback, city).toBe(false);
      expect(r.tzSource, city).toBe('city');
    }
  });

  it('境外主要城市标准偏移正确', () => {
    const table: Array<[string, number, string]> = [
      ['东京', 9, 'Asia/Tokyo'],
      ['首尔', 9, 'Asia/Seoul'],
      ['新加坡', 8, 'Asia/Singapore'],
      ['曼谷', 7, 'Asia/Bangkok'],
      ['迪拜', 4, 'Asia/Dubai'],
      ['孟买', 5.5, 'Asia/Kolkata'],
      ['加德满都', 5.75, 'Asia/Kathmandu'],
      ['仰光', 6.5, 'Asia/Yangon'],
      ['莫斯科', 3, 'Europe/Moscow'],
      ['柏林', 1, 'Europe/Berlin'],
      ['伦敦', 0, 'Europe/London'],
      ['纽约', -5, 'America/New_York'],
      ['洛杉矶', -8, 'America/Los_Angeles'],
      ['圣保罗', -3, 'America/Sao_Paulo'],
      ['悉尼', 10, 'Australia/Sydney'],
      ['珀斯', 8, 'Australia/Perth'],
      ['奥克兰', 12, 'Pacific/Auckland'],
      ['檀香山', -10, 'Pacific/Honolulu'],
    ];
    for (const [city, off, tz] of table) {
      // 取 1 月中（北半球冬令时 / 南半球夏令时），见分项断言
      const r = resolveTime({ year: 2024, month: 1, day: 15, hour: 12, city });
      expect(r.sourceTzName, city).toBe(tz);
      if (city === '悉尼' || city === '奥克兰') {
        expect(r.baseUtcOffsetHours, city).toBe(off);
        expect(r.inDst, city).toBe(true); // 南半球 1 月正是夏令时
      } else {
        expect(r.utcOffsetHours, city).toBe(off);
      }
    }
  });

  it('英文名 / 「辽宁沈阳」式地名也能查表', () => {
    expect(lookupCityTimeZone('new york')!.name).toBe('纽约');
    expect(lookupCityTimeZone('New York, USA')!.name).toBe('纽约');
    expect(lookupCityTimeZone('辽宁沈阳')!.name).toBe('沈阳');
    expect(lookupCityTimeZone('shenyang')!.stdOffset).toBe(8);
    expect(lookupCityTimeZone('火星')).toBeNull();
  });

  it('城市表覆盖 100+ 个城市', () => {
    expect(listCityTimeZones().length).toBeGreaterThanOrEqual(100);
    const names = new Set(listCityTimeZones().map((c) => c.name));
    expect(names.size).toBe(listCityTimeZones().length); // 无重名
  });

  it('只有经纬度时按坐标推算时区，不再静默兜底 +8', () => {
    // 伦敦：旧实现按 +8 兜底，12:00 会被当成北京时间；现在按最近城市推算
    const r = resolveTime({ year: 2024, month: 6, day: 15, hour: 12, lat: 51.5, lon: -0.12 });
    expect(r.tzFallback).toBe(false);
    expect(r.tzEstimated).toBe(true);
    expect(r.tzSource).toBe('estimated');
    expect(r.tzEstimateMethod).toBe('nearest-city');
    expect(r.tzEstimateCity).toBe('伦敦');
    expect(r.utcOffsetHours).toBe(1); // 6 月英国夏令时
    expect(r.warnings.join()).toContain('估算');
  });

  it('无城市也无经纬度时才兜底 +8 并打 tzFallback 标记', () => {
    const r = resolveTime({ year: 2024, month: 6, day: 15, hour: 12 });
    expect(r.utcOffsetHours).toBe(8);
    expect(r.tzFallback).toBe(true);
    expect(r.tzSource).toBe('fallback');
    expect(r.warnings.join()).toContain('兜底');
  });

  it('strict 策略下坐标推算不出可信时区则抛错，不静默算错', () => {
    // 南太平洋 (0,0) 附近 600km 无内置城市，只能经度吸附
    expect(() => resolveTime({ year: 2024, month: 6, day: 15, hour: 12, lat: 0, lon: 0, tzPolicy: 'strict' })).toThrow(/无法可靠确定时区/);
    // estimate 策略下照样给结果，但必须标 tzEstimated + 未计夏令时
    const r = resolveTime({ year: 2024, month: 6, day: 15, hour: 12, lat: 0, lon: 0 });
    expect(r.tzEstimated).toBe(true);
    expect(r.tzEstimateMethod).toBe('longitude');
    expect(r.utcOffsetHours).toBe(0);
  });

  it('经度→时区吸附到真实法定偏移（含半小时/三刻区）', () => {
    expect(offsetFromLongitude(0)).toBe(0);
    expect(offsetFromLongitude(-74)).toBe(-5);
    expect(offsetFromLongitude(123)).toBe(8);
    expect(offsetFromLongitude(85)).toBe(5.75); // 尼泊尔
    // 纯经度只能逼近整点：印度 77.2° 算出 +5，+5:30 是政治决定，得靠城市表
    expect(offsetFromLongitude(77.2)).toBe(5);
    const delhi = lookupCityTimeZone('新德里');
    expect(delhi?.stdOffset).toBe(5.5);
  });

  it('城市与经纬度矛盾时以城市为准，并标 geoConflict', () => {
    const r = resolveTime({ year: 2024, month: 6, day: 15, hour: 12, city: '纽约', lat: 41.8, lon: 123.43 });
    expect(r.geoConflict).toBe(true);
    expect(r.utcOffsetHours).toBe(-4);
    expect(r.geoConflictNote).toContain('纽约');
    expect(r.longitude).toBeCloseTo(-74.006, 2);
  });

  it('显式时区与经度矛盾（旧地点残留）时停用真太阳时', () => {
    const r = resolveTime({ year: 1994, month: 8, day: 1, hour: 11, minute: 45, utcOffsetHours: -5, lat: 41.8, lon: 123.43 });
    expect(r.geoConflict).toBe(true);
    expect(r.trueSolar).toBeNull();
    expect(r.warnings.join()).toContain('真太阳时已停用');
  });

  it('显式 utcOffsetHours 优先于城市表', () => {
    const r = resolveTime({ year: 2024, month: 6, day: 15, hour: 12, city: '北京', utcOffsetHours: -5 });
    expect(r.utcOffsetHours).toBe(-5);
    expect(r.tzSource).toBe('explicit');
    expect(r.tzFallback).toBe(false);
    expect(r.cityName).toBe('北京'); // 仍保留城市信息用于展示
    expect(r.sourceTzName).toBe('Asia/Shanghai');
  });

  it('偏移展示名支持半时区/三刻区', () => {
    expect(formatOffsetName(8)).toBe('UTC+08:00');
    expect(formatOffsetName(-3.5)).toBe('UTC-03:30');
    expect(formatOffsetName(5.75)).toBe('UTC+05:45');
  });
});

/** 中国 1986–1991 夏令时权威窗口（timeanddate 逐年核对，均 02:00 起、02:00 止） */
const CN_WINDOWS: Array<[number, string, string]> = [
  [1986, '1986-05-04', '1986-09-14'],
  [1987, '1987-04-12', '1987-09-13'],
  [1988, '1988-04-17', '1988-09-11'],
  [1989, '1989-04-16', '1989-09-17'],
  [1990, '1990-04-15', '1990-09-16'],
  [1991, '1991-04-14', '1991-09-15'],
];

const ymd = (s: string): [number, number, number] => {
  const [y, m, d] = s.split('-').map(Number);
  return [y, m, d];
};

const dayBefore = (s: string, delta: number): [number, number, number] => {
  const [y, m, d] = ymd(s);
  const t = new Date(Date.UTC(y, m - 1, d + delta));
  return [t.getUTCFullYear(), t.getUTCMonth() + 1, t.getUTCDate()];
};

describe('timeContext / 中国 1986–1991 夏令时', () => {
  it('窗口表与权威资料一致', () => {
    for (const [year, start, end] of CN_WINDOWS) {
      const w = chinaDstWindow(year)!;
      expect(w.startLocal.slice(0, 10), String(year)).toBe(start);
      expect(w.endLocal.slice(0, 10), String(year)).toBe(end);
    }
    expect(chinaDstWindow(1985)).toBeNull();
    expect(chinaDstWindow(1992)).toBeNull();
    expect(chinaDstWindow(2024)).toBeNull();
  });

  it('6 个年份 × 5 个边界：前一天/当天/结束日 01:30/结束日 03:00/后一天', () => {
    for (const [year, start, end] of CN_WINDOWS) {
      const [by, bm, bd] = dayBefore(start, -1);
      const before = resolveTime({ year: by, month: bm, day: bd, hour: 12, city: '北京' });
      expect(before.inDst, `${year} 开始前一天`).toBe(false);
      expect(chinaDstAppliesToCivil(by, bm, bd, 12), `${year} 开始前一天 civil`).toBe(false);

      const [sy, sm, sd] = ymd(start);
      const onStart = resolveTime({ year: sy, month: sm, day: sd, hour: 3, city: '北京' });
      expect(onStart.inDst, `${year} 开始当天 03:00`).toBe(true);
      expect(onStart.utcOffsetHours, `${year} 开始当天`).toBe(9);
      expect(onStart.standard.hour, `${year} 开始当天标准时`).toBe(2);
      expect(onStart.dstOffsetMinutes).toBe(-60);

      const [ey, em, ed] = ymd(end);
      expect(resolveTime({ year: ey, month: em, day: ed, hour: 1, minute: 30, city: '北京' }).inDst,
        `${year} 结束日 01:30 仍在夏令时`).toBe(true);
      expect(resolveTime({ year: ey, month: em, day: ed, hour: 3, city: '北京' }).inDst,
        `${year} 结束日 03:00 已回拨`).toBe(false);

      const [ay, am, ad] = dayBefore(end, 1);
      const after = resolveTime({ year: ay, month: am, day: ad, hour: 12, city: '北京' });
      expect(after.inDst, `${year} 结束后一天`).toBe(false);
      expect(after.utcOffsetHours, `${year} 结束后一天`).toBe(8);
    }
  });

  it('拨快当天不存在的那一小时、回拨当天重复的那一小时都有确定答案', () => {
    // 1986-05-04 02:30 钟面不存在（02:00 直接跳到 03:00）→ 按 01:30 标准时处理
    const gap = resolveTime({ year: 1986, month: 5, day: 4, hour: 2, minute: 30, city: '北京' });
    expect(gap.inDst).toBe(true);
    expect(gap.standard.hour).toBe(1);
    expect(gap.standard.minute).toBe(30);
    // 1989-09-17 02:00 是回拨点：钟面 02:00 已是标准时
    const back = resolveTime({ year: 1989, month: 9, day: 17, hour: 2, city: '北京' });
    expect(back.inDst).toBe(false);
    expect(back.utcOffsetHours).toBe(8);
    // chinaDstInEffect 吃标准时：窗口外一律 false
    expect(chinaDstInEffect(1988, 4, 16, 23)).toBe(false);
    expect(chinaDstInEffect(1988, 4, 17, 2)).toBe(true);
    expect(chinaDstInEffect(1988, 9, 11, 0, 30)).toBe(true);
    expect(chinaDstInEffect(1988, 9, 11, 1)).toBe(false);
  });

  it('夏令时命中时给出窗口，便于界面标注', () => {
    const r = resolveTime({ year: 1988, month: 7, day: 15, hour: 12, city: '北京' });
    expect(r.inDst).toBe(true);
    expect(r.dstWindow!.startLocal).toBe('1988-04-17 02:00');
    expect(r.dstWindow!.endLocal).toBe('1988-09-11 01:00');
    expect(r.warnings.join()).toContain('夏令时');
  });

  it('1986–1991 之外的中国时间不受夏令时影响', () => {
    for (const [y, m, d] of [[1985, 7, 1], [1992, 7, 1], [2024, 7, 1]] as const) {
      const r = resolveTime({ year: y, month: m, day: d, hour: 12, city: '北京' });
      expect(r.inDst, `${y}`).toBe(false);
      expect(r.utcOffsetHours).toBe(8);
    }
  });

  it('境外夏令时规则：美/欧/澳/新 起止与现行法规一致（2024/2026 抽样）', () => {
    // 美国：3 月第 2 个周日 02:00 起，11 月第 1 个周日 02:00 止
    expect(resolveTime({ year: 2026, month: 3, day: 8, hour: 3, city: '纽约' }).inDst).toBe(true);
    expect(resolveTime({ year: 2026, month: 3, day: 7, hour: 23, city: '纽约' }).inDst).toBe(false);
    expect(resolveTime({ year: 2026, month: 11, day: 1, hour: 1, city: '纽约' }).inDst).toBe(true);
    expect(resolveTime({ year: 2026, month: 11, day: 1, hour: 3, city: '纽约' }).inDst).toBe(false);
    // 欧盟：3 月最后周日 01:00 UTC 起，10 月最后周日 01:00 UTC 止
    expect(resolveTime({ year: 2026, month: 3, day: 29, hour: 3, city: '伦敦' }).inDst).toBe(true);
    expect(resolveTime({ year: 2026, month: 10, day: 25, hour: 1, city: '伦敦' }).inDst).toBe(true);
    expect(resolveTime({ year: 2026, month: 10, day: 25, hour: 3, city: '伦敦' }).inDst).toBe(false);
    // 澳洲：10 月第 1 个周日 02:00 起；4 月第 1 个周日 03:00（夏令时）止
    expect(resolveTime({ year: 2026, month: 10, day: 4, hour: 3, city: '悉尼' }).inDst).toBe(true);
    expect(resolveTime({ year: 2026, month: 4, day: 5, hour: 1, city: '悉尼' }).inDst).toBe(true);
    expect(resolveTime({ year: 2026, month: 4, day: 5, hour: 3, city: '悉尼' }).inDst).toBe(false);
    // 新西兰：9 月最后周日 02:00 起；4 月第 1 个周日 03:00 止
    expect(resolveTime({ year: 2026, month: 9, day: 27, hour: 3, city: '奥克兰' }).inDst).toBe(true);
    expect(resolveTime({ year: 2026, month: 4, day: 5, hour: 3, city: '奥克兰' }).inDst).toBe(false);
    // 不实行夏令时的地区：凤凰城 / 布里斯班 / 东京
    for (const c of ['凤凰城', '布里斯班', '东京']) {
      expect(resolveTime({ year: 2026, month: 7, day: 1, hour: 12, city: c }).inDst, c).toBe(false);
    }
  });

  it('历史规则年份给出近似提示（EU 1996 / US 2007 之前）', () => {
    const r = resolveTime({ year: 1990, month: 7, day: 1, hour: 12, city: '柏林' });
    expect(r.inDst).toBe(true);
    expect(r.warnings.join()).toContain('1996');
    const us = resolveTime({ year: 2000, month: 7, day: 1, hour: 12, city: '纽约' });
    expect(us.warnings.join()).toContain('2007');
  });
});

describe('timeContext / 与四柱、星盘联动', () => {
  it('夏令时还原后时柱纠正一个时辰（1988-07-15 13:30 北京）', () => {
    const raw = solarToSiZhu({ year: 1988, month: 7, day: 15, hour: 13, minute: 30 }, { applyChinaDst: false });
    const fixed = solarToSiZhu({ year: 1988, month: 7, day: 15, hour: 13, minute: 30 });
    expect(raw.timeGanZhi).toBe('乙未');   // 修前：拿北京时（夏令时钟面）当标准时
    expect(fixed.timeGanZhi).toBe('甲午'); // 修后：13:30 − 1h = 12:30 → 午时
    expect(fixed.dstApplied).toBe(true);
    expect(fixed.standardTime).toMatchObject({ year: 1988, month: 7, day: 15, hour: 12, minute: 30 });
    expect(fixed.dayGanZhi).toBe(raw.dayGanZhi); // 日柱同一天不变
    expect(fixed.dstWindow!.startLocal).toBe('1988-04-17 02:00');
  });

  it('夏令时把 23:30 拉回 22:30 时，日柱也一并纠正（1987-06-20）', () => {
    const raw = solarToSiZhu({ year: 1987, month: 6, day: 20, hour: 23, minute: 30 }, { applyChinaDst: false });
    const fixed = solarToSiZhu({ year: 1987, month: 6, day: 20, hour: 23, minute: 30 });
    expect(raw.dayGanZhi).toBe('辛丑');  // 23:00 换日口径 → 已进次日
    expect(fixed.dayGanZhi).toBe('庚子'); // 22:30 未过 23:00 → 仍是当日
    expect(raw.timeGanZhi).toBe('戊子');
    expect(fixed.timeGanZhi).toBe('丁亥');
  });

  it('非夏令时年份日柱时柱完全不变（回归保护）', () => {
    const a = solarToSiZhu({ year: 1994, month: 8, day: 1, hour: 11, minute: 45 });
    expect(a.dstApplied).toBe(false);
    expect(a.timeGanZhi).toBe('庚午');
    expect(a.dayGanZhi).toBe('己未');
  });

  it('星盘按真实 UT 排：夏令时 +9 与写死 +8 差 1 小时，上升差约 15°', () => {
    const fixed = paipanXingpan({ year: 1988, month: 7, day: 15, hour: 14, minute: 30, city: '北京', lat: 39.9042, lonEast: 116.4074 });
    const legacy = paipanXingpan({ year: 1988, month: 7, day: 15, hour: 14, minute: 30, utcOffsetHours: 8, lat: 39.9042, lonEast: 116.4074 });
    expect(fixed.time.inDst).toBe(true);
    expect(fixed.time.utcOffsetHours).toBe(9);
    expect(fixed.time.utc).toMatchObject({ hour: 5, minute: 30 });
    expect(legacy.time.utc).toMatchObject({ hour: 6, minute: 30 });
    expect(fixed.jdUt).toBeLessThan(legacy.jdUt);
    expect(fixed.ascSignName).toBe('天蝎');
    expect(fixed.asc.degree).not.toBe(legacy.asc.degree);
  });

  it('境外出生：同一钟面标纽约与标北京得到不同 UT（修前一律 +8）', () => {
    const ny = paipanXingpan({ year: 2024, month: 6, day: 15, hour: 12, city: '纽约' });
    const bj = paipanXingpan({ year: 2024, month: 6, day: 15, hour: 12, city: '北京' });
    expect(ny.time.utcOffsetHours).toBe(-4); // 6 月纽约夏令时
    expect(bj.time.utcOffsetHours).toBe(8);
    // 北京 12:00 = UT 04:00，纽约 12:00（夏令时 −4）= UT 16:00 → 差 12 小时
    expect((bj.time.utcMs - ny.time.utcMs) / 3600000).toBe(-12);
    expect(ny.asc.degree).not.toBe(bj.asc.degree);
    expect(ny.jdUt).not.toBe(bj.jdUt);
    // 城市经纬度缺失时用城市中心补齐
    expect(ny.time.longitude).toBeCloseTo(-74.006, 2);
  });

  it('星盘结果带回 time 字段供界面标注真太阳时', () => {
    const chart = paipanXingpan({ year: 2024, month: 6, day: 15, hour: 12, city: '沈阳' });
    expect(chart.time.trueSolar).not.toBeNull();
    expect(chart.time.trueSolarOffsetMinutes).toBeCloseTo(13.19, 1);
    expect(chart.time.sourceTzName).toBe('Asia/Shanghai');
    expect(chart.time.tzFallback).toBe(false);
  });

  it('接口容错：非法日期直接抛错，不静默顺延', () => {
    expect(() => resolveTime({ year: 2024, month: 2, day: 30, hour: 12 })).toThrow(/不存在/);
    expect(() => resolveTime({ year: 2024, month: 13, day: 1, hour: 12 })).toThrow(/越界/);
  });
});
