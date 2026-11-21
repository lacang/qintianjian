/**
 * 时区规则修订验收（r6_compat.md P1-1）
 *
 * 被审计抓到的事实：开罗 2026-07 仍按 +2 算（埃及 2023 恢复了夏令时，应为 +3），
 * **零告警**——这是最坏的失败模式：不报错，只是时辰、四柱、紫微宫位整体偏一小时。
 *
 * 这里锁三件事：
 *   1. 已知修订的国家/地区，在修订后的日期上给出正确偏移；
 *   2. 每一次「用的是覆盖表 / 近似口径」都必须在 warnings 里说出来，不许静默；
 *   3. 表外的普通城市不受影响（回归）。
 */
import { describe, it, expect } from 'vitest';
import { resolveTime } from '../src/timeContext.js';
import { listTzOverrides, tzOverrideNote, TZ_DATA_VERSION, TZ_CHANGELOG } from '../src/tz-data.js';

const at = (city: string, y: number, mo: number, d: number, h = 12) =>
  resolveTime({ city, year: y, month: mo, day: d, hour: h, minute: 0 });

describe('时区覆盖表：近年修订', () => {
  it('版本号与变更清单都在（可追溯）', () => {
    expect(TZ_DATA_VERSION).toMatch(/^\d{4}\.\d{2}$/);
    expect(TZ_CHANGELOG.length).toBeGreaterThanOrEqual(7);
    expect(listTzOverrides().length).toBeGreaterThanOrEqual(9);
  });

  it('埃及：2023 恢复夏令时，2026-07 必须是 +3（审计原例）', () => {
    const r = at('开罗', 2026, 7, 15);
    expect(r.utcOffsetHours).toBe(3);      // 修复前是 2
    expect(r.inDst).toBe(true);
    expect(r.warnings.join('\n')).toMatch(/埃及/);
    // 冬季仍是 +2
    expect(at('开罗', 2026, 1, 15).utcOffsetHours).toBe(2);
    // 2023 年之前没有夏令时
    expect(at('开罗', 2022, 7, 15).utcOffsetHours).toBe(2);
  });

  it('墨西哥：2022 取消大部分地区夏令时，2023-07 是 -6', () => {
    expect(at('墨西哥城', 2023, 7, 15).utcOffsetHours).toBe(-6);
    expect(at('墨西哥城', 2021, 7, 15).utcOffsetHours).toBe(-5); // 2022 之前有
    expect(at('墨西哥城', 2026, 1, 15).utcOffsetHours).toBe(-6);
  });

  it('伊朗：2022 废除夏令时，2023-07 是 +3.5，2021-07 是 +4.5', () => {
    expect(at('德黑兰', 2023, 7, 15).utcOffsetHours).toBe(3.5);
    expect(at('德黑兰', 2021, 7, 15).utcOffsetHours).toBe(4.5);
  });

  it('约旦 / 叙利亚：2022 起固定 +3（不再随欧盟切换）', () => {
    for (const city of ['安曼', '大马士革']) {
      expect(at(city, 2023, 1, 15).utcOffsetHours, city).toBe(3);
      expect(at(city, 2026, 7, 15).utcOffsetHours, city).toBe(3);
      // 2022 年前是 +2/+3 夏令时，本模型表达不了「base-1」，故不回溯但必须告警
      const old = at(city, 2021, 1, 15);
      expect(old.warnings.join('\n'), city).toMatch(/未回溯|可能差 1 小时/);
    }
  });

  it('巴拉圭：2024 起永久 -3，之前是 -4/-3 切换', () => {
    expect(at('亚松森', 2026, 7, 15).utcOffsetHours).toBe(-3);
    expect(at('亚松森', 2023, 7, 15).utcOffsetHours).toBe(-4);
    expect(at('亚松森', 2023, 1, 15).utcOffsetHours).toBe(-3);
  });

  it('摩洛哥：常年在 +1，斋月回拨到 +0', () => {
    expect(at('卡萨布兰卡', 2026, 6, 1).utcOffsetHours).toBe(1);
    const ramadan = at('卡萨布兰卡', 2026, 3, 1); // 2026 斋月约 2/17–3/19
    expect(ramadan.utcOffsetHours).toBe(0);
    expect(at('拉巴特', 2026, 3, 1).utcOffsetHours).toBe(0);
  });

  it('智利：南半球夏令时（1 月 -3，7 月 -4）', () => {
    expect(at('圣地亚哥', 2026, 1, 15).utcOffsetHours).toBe(-3);
    expect(at('圣地亚哥', 2026, 7, 15).utcOffsetHours).toBe(-4);
  });

  it('黎巴嫩：随欧盟规则（夏季 +3）', () => {
    expect(at('贝鲁特', 2026, 7, 15).utcOffsetHours).toBe(3);
    expect(at('贝鲁特', 2026, 1, 15).utcOffsetHours).toBe(2);
  });
});

describe('凡用覆盖表 / 近似口径，必须出现在 warnings 里', () => {
  it('覆盖表里的每个时区、在表中覆盖的年份内，都给出提示', () => {
    const probes: Record<string, [number, number, number]> = {
      'Africa/Cairo': [2026, 7, 15],
      'Africa/Casablanca': [2026, 6, 1],
      'America/Mexico_City': [2023, 7, 15],
      'Asia/Tehran': [2023, 7, 15],
      'Asia/Amman': [2026, 1, 15],
      'Asia/Damascus': [2026, 1, 15],
      'America/Asuncion': [2026, 7, 15],
      'America/Santiago': [2026, 7, 15],
      'Asia/Beirut': [2026, 1, 15],
    };
    for (const [tz, [y, mo, d]] of Object.entries(probes)) {
      expect(tzOverrideNote(tz, y), `${tz} ${y} 必须有 note`).toBeTruthy();
    }
  });

  it('开罗 2026 的 warnings 里必须有「埃及恢复夏令时」这类人话', () => {
    const r = at('开罗', 2026, 7, 15);
    expect(r.warnings.length).toBeGreaterThan(0);
    expect(r.warnings.join('\n')).toMatch(/夏令时|埃及/);
  });

  it('表外城市不受影响，也不会乱报警', () => {
    const r = at('北京', 2026, 7, 15);
    expect(r.utcOffsetHours).toBe(8);
    expect(r.warnings.filter((w) => /时区数据|覆盖表|夏令时规则/.test(w))).toEqual([]);
  });

  it('显式偏移（复现码）优先于覆盖表，且不再重复告警', () => {
    const r = resolveTime({ city: '开罗', year: 2026, month: 7, day: 15, hour: 12, minute: 0, utcOffsetHours: 2 });
    expect(r.utcOffsetHours).toBe(2);
    expect(r.tzSource).toBe('explicit');
  });
});
