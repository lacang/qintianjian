/**
 * `src/tz-data.ts` 的夏令时覆盖表对拍（用 Node Intl 当独立数据源）
 *
 * 为什么要有这个文件：覆盖表是手写数据，写错了不会报错，只会让整盘差 1 小时。
 * 这里用运行时自带的 ICU 数据库（与表的口径来源 IANA tzdata 不同路）交叉验证：
 *   1. 表说「有夏令时」的年份，窗口**中间**必须是 DST、窗口**之外**必须是标准时；
 *   2. 表说「没有夏令时」的年份，全年偏移必须恒定；
 *   3. 稳定规则（埃及 2023+、墨西哥 1996–2022、巴拉圭 2023、约旦/叙利亚固定）再核对**边界日**。
 * 对表内自述「近似 ±1 天」的时区（伊朗、黎巴嫩 2023、智利旧规则、摩洛哥斋月）只核对中段，
 * 不核边界 —— 这是数据本身的已知误差，写在 `note` 里由 warnings 提示。
 */
import { describe, it, expect } from 'vitest';
import {
  listTzOverrides, tzOverrideWindow, tzOverrideNote, hasTzOverride, TZ_DATA_VERSION, TZ_CHANGELOG,
  type TzDstWindow,
} from '../src/tz-data.js';

const HOUR = 3600_000;

/** 某 UTC 时刻在该时区的偏移（分钟） */
function offsetMinutesAt(tz: string, utcMs: number): number {
  const parts = new Intl.DateTimeFormat('en-US', { timeZone: tz, timeZoneName: 'longOffset' })
    .formatToParts(new Date(utcMs));
  const raw = parts.find((p) => p.type === 'timeZoneName')?.value ?? 'GMT';
  const m = /GMT([+-])(\d{1,2})(?::(\d{2}))?/.exec(raw);
  if (!m) return 0;
  const sign = m[1] === '-' ? -1 : 1;
  return sign * (Number(m[2]) * 60 + Number(m[3] ?? 0));
}

const mid = (w: TzDstWindow) => w.start + Math.round((w.end - w.start) / 2);

/** 表内自述只做近似（±1 天级）的时区，不核边界日 */
const APPROX = new Set(['Asia/Tehran', 'Asia/Beirut', 'America/Santiago', 'Africa/Casablanca']);

describe('tz-data 覆盖表自检', () => {
  it('表结构自洽：键是 IANA 名、since 是整数、清单与注册表一致', () => {
    const list = listTzOverrides();
    expect(list.length).toBeGreaterThanOrEqual(8);
    for (const { tz, since } of list) {
      expect(tz).toMatch(/^[A-Za-z]+\/[A-Za-z_]+$/);
      expect(hasTzOverride(tz)).toBe(true);
      expect(Number.isInteger(since)).toBe(true);
      expect(since).toBeGreaterThan(1950);
    }
    expect(TZ_DATA_VERSION).toMatch(/^\d{4}\.\d{2}$/);
    for (const c of TZ_CHANGELOG) expect(hasTzOverride(c.tz)).toBe(true);
  });

  it('窗口形状合法：start < end、跨年窗口不越 366 天、年份区间外返回 null', () => {
    for (const { tz, since } of listTzOverrides()) {
      for (const year of [since, since + 1, 2018, 2023, 2024, 2025]) {
        if (year < since) continue;
        const w = tzOverrideWindow(tz, year);
        if (!w) continue;
        expect(w.start).toBeLessThan(w.end);
        expect(w.end - w.start).toBeLessThan(366 * 24 * HOUR);
        // 窗口必须落在该年附近（允许跨年回拨到次年 1 月、或从上一年 10 月延续）
        expect(new Date(w.start).getUTCFullYear()).toBeGreaterThanOrEqual(year - 1);
        expect(new Date(w.end).getUTCFullYear()).toBeLessThanOrEqual(year + 1);
      }
      // 远早于 since 的年份：本表不管（undefined，不是 null）
      // —— 返回 null 会被当成「确定无夏令时」，1990 年代的约旦/贝鲁特就会被静默少算 1 小时
      expect(tzOverrideWindow(tz, since - 3)).toBeUndefined();
    }
  });

  it('不认识的时区返回 undefined（交给城市表的通用规则），不是 null', () => {
    expect(tzOverrideWindow('Europe/Berlin', 2024)).toBeUndefined();
    expect(tzOverrideNote('Europe/Berlin', 2024)).toBeNull();
  });
});

describe('tz-data 与 Node Intl 对拍', () => {
  it('表说有夏令时的年份：窗口内是 DST、窗口外是标准时', () => {
    const failures: string[] = [];
    for (const { tz, since } of listTzOverrides()) {
      for (const year of [since, since + 1, 2018, 2022, 2024, 2025]) {
        if (year < since) continue;
        const w = tzOverrideWindow(tz, year);
        if (!w) continue;
        // 全年窗口（巴拉圭 2025 起永久 -3 之类）：没有「窗口外」可对照，跳过
        if (w.end - w.start > 340 * 24 * HOUR) continue;
        const dst = offsetMinutesAt(tz, mid(w));
        const outsideBefore = offsetMinutesAt(tz, w.start - 30 * 24 * HOUR);
        const outsideAfter = offsetMinutesAt(tz, w.end + 30 * 24 * HOUR);
        const outside = Math.min(outsideBefore, outsideAfter) === outsideBefore ? outsideBefore : outsideAfter;
        if (dst === outside) {
          failures.push(`${tz} ${year}: 窗口内 ${dst} 与窗口外 ${outside} 相同（表说这段是夏令时）`);
        }
      }
    }
    expect(failures).toEqual([]);
  });

  it('表说没有夏令时的年份：全年偏移恒定', () => {
    const failures: string[] = [];
    for (const { tz, since } of listTzOverrides()) {
      for (const year of [since - 2, 2023, 2024, 2025]) {
        if (tzOverrideWindow(tz, year) !== null) continue;
        const offsets = new Set<number>();
        for (let mo = 0; mo < 12; mo++) {
          offsets.add(offsetMinutesAt(tz, Date.UTC(year, mo, 15, 12)));
        }
        if (offsets.size !== 1) {
          failures.push(`${tz} ${year}: 表说无夏令时，Intl 却有 ${offsets.size} 种偏移 ${[...offsets].join('/')}`);
        }
      }
    }
    expect(failures).toEqual([]);
  });

  it('稳定规则的时区：边界日 ±1 天偏移必须真的切换', () => {
    const cases: [string, number][] = [
      ['Africa/Cairo', 2024],
      ['America/Mexico_City', 2021],
      ['America/Asuncion', 2023],
    ];
    for (const [tz, year] of cases) {
      const w = tzOverrideWindow(tz, year);
      expect(w, `${tz} ${year} 应有窗口`).toBeTruthy();
      if (!w || APPROX.has(tz)) continue;
      const before = offsetMinutesAt(tz, w.start - 2 * 24 * HOUR);
      const after = offsetMinutesAt(tz, w.start + 2 * 24 * HOUR);
      const endBefore = offsetMinutesAt(tz, w.end - 2 * 24 * HOUR);
      const endAfter = offsetMinutesAt(tz, w.end + 2 * 24 * HOUR);
      expect(after, `${tz} ${year} 起报应拨快`).not.toBe(before);
      expect(endAfter, `${tz} ${year} 回拨应拨慢`).not.toBe(endBefore);
      // 两处必须成对（起报拨快量 = 回拨拨慢量）
      expect(after - before).toBe(endBefore - endAfter);
    }
  });

  it('每条 note 都能落成一句人话（不是空串/undefined）', () => {
    for (const { tz, since } of listTzOverrides()) {
      for (const year of [since, 2024, 2031]) {
        const note = tzOverrideNote(tz, year);
        if (note === null) continue;
        expect(typeof note).toBe('string');
        expect(note.length).toBeGreaterThan(8);
      }
    }
  });
});
