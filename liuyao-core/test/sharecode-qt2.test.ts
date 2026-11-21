/**
 * 复现码时区一致性验收（r6_compat.md P0）
 *
 * 被审计抓到的事实：码 `QT1-JgEmVfMYAAGu` 在上海打开 = 庚午 辛巳 乙酉 辛巳（巳时），
 * 在纽约打开 = 庚午 辛巳 甲申 甲戌（戌时），紫微十二宫整体错位，**且没有任何提示**。
 * 根因：v2 码只存绝对 Unix 秒，不存时区/城市，紫微码连经纬度都不存。
 *
 * 这里的验收办法是「同一个码，两个 TZ 子进程各算一遍，逐字段比对」：
 *   1. QT2 码自带 city/tz/offset/lat/lon，两地的四柱、紫微（含大限/流年四化）、星盘、
 *      吠陀（含 Panchanga）、六爻必须**完全一致**；
 *   2. 同一出生输入在两个 TZ 下生成的码必须**逐字节相同**（码里不能残留设备时区）；
 *   3. 旧 QT1 码仍可解，但必须带「不含时区信息」告警；
 *   4. 兜底经纬度（120E/30N）与城市未知必须被标记，不许默默当真。
 */
import { describe, it, expect } from 'vitest';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

import {
  buildCode, decodeCode, describeCode, fmtTzOffset, looksLikeCode,
  LEGACY_NOTICE, CITY_UNKNOWN, PREFIX, RULE_VERSION,
} from '../../app/js/sharecode.js';
import { civilInCity, tzSnapshotOfCivil } from '../../app/js/state.js';

const ENC = fileURLToPath(new URL('./fixtures/qt2-encode.mjs', import.meta.url));
const PLATE = fileURLToPath(new URL('./fixtures/qt2-plate.mjs', import.meta.url));

const SH = { city: '上海', place: '上海', lat: 31.2304, lonEast: 121.4737 };
const TZS = ['Asia/Shanghai', 'America/New_York'];

function node(file: string, args: string[], tz: string): string {
  return execFileSync(process.execPath, [file, ...args], {
    env: { ...process.env, TZ: tz, NODE_NO_WARNINGS: '1' },
    encoding: 'utf8',
    maxBuffer: 32 * 1024 * 1024,
  });
}

function encodeIn(tz: string, kind = 'ziwei', city = '上海', civil = [1990, 5, 20, 10, 30]): {
  code: string; warnings: string[]; snap: { tz: string; offsetMinutes: number; inDst: boolean };
} {
  const out = node(ENC, [kind, city, ...civil.map(String), JSON.stringify(city === '上海' ? SH : {})], tz);
  return JSON.parse(out);
}

function plateIn(tz: string, code: string) {
  return JSON.parse(node(PLATE, [code], tz));
}

/** 逐字段比对的盘面（去掉 deviceTz，它就是我们要证明「无关」的那个量） */
function plateOf(r: any) {
  return JSON.stringify(r.plate);
}

describe('QT2 复现码：码内自包含时区与地理', () => {
  it('码里带 city / tz / 偏移 / 经纬度，解出来逐项对得上', () => {
    const { code } = encodeIn('Asia/Shanghai');
    expect(code.startsWith(PREFIX)).toBe(true);
    expect(looksLikeCode(code)).toBe(true);

    const d = decodeCode(code);
    expect(d.version).toBe(3);
    expect(d.legacy).toBe(false);
    expect(d.tzKnown).toBe(true);
    expect(d.city).toBe('上海');
    expect(d.tz).toBe('Asia/Shanghai');
    expect(d.tzOffsetMinutes).toBe(540);     // 1990-05-20 上海在夏令时里，生效偏移是 +9
    expect(d.lon).toBeCloseTo(121.47, 2);
    expect(d.lat).toBeCloseTo(31.23, 2);
    expect(d.civil).toEqual({ y: 1990, mo: 5, d: 20, h: 10, mi: 30 });
    expect(d.gender).toBe('男');
    expect(d.inDst).toBe(true);
  });

  it('描述串能一眼看出「哪里、几点、UTC 几」', () => {
    const d = decodeCode(encodeIn('Asia/Shanghai').code);
    expect(describeCode(d)).toBe('1990-05-20 10:30 · 上海 Asia/Shanghai');
    expect(fmtTzOffset(-210)).toBe('UTC-03:30');
    expect(fmtTzOffset(345)).toBe('UTC+05:45');
  });

  it('同一出生输入，上海与纽约生成的码逐字节相同', () => {
    for (const kind of ['ziwei', 'bazi', 'astro', 'vedic', 'liuyao', 'qimen', 'meihua']) {
      const a = encodeIn('Asia/Shanghai', kind);
      const b = encodeIn('America/New_York', kind);
      expect(a.code, `${kind} 的码不应依赖设备时区`).toBe(b.code);
    }
  });
});

describe('QT2 复现码：跨时区解出完全相同的盘', () => {
  const KINDS = ['ziwei', 'bazi', 'astro', 'vedic', 'liuyao'] as const;

  for (const kind of KINDS) {
    it(`${kind}：TZ=Asia/Shanghai 与 TZ=America/New_York 盘面逐字段一致`, () => {
      const { code } = encodeIn('Asia/Shanghai', kind);
      const [sh, ny] = TZS.map((tz) => plateIn(tz, code));
      expect(sh.error ?? null).toBe(null);
      expect(ny.error ?? null).toBe(null);
      // 设备时区确实不同（否则这个测试什么都没证明）
      expect(sh.deviceTz).toBe('Asia/Shanghai');
      expect(ny.deviceTz).toBe('America/New_York');
      // 钟面也一致
      expect(sh.civil).toEqual(ny.civil);
      expect(sh.tzOffsetMinutes).toBe(ny.tzOffsetMinutes);
      // 盘面逐字段一致（含紫微大限流年四化、八字神煞、吠陀 Panchanga）
      expect(plateOf(sh)).toBe(plateOf(ny));
    });
  }

  it('紫微：十二宫、大限、流年四化都随码复现（不是空壳）', () => {
    const { code } = encodeIn('Asia/Shanghai', 'ziwei');
    const p = plateIn('America/New_York', code).plate;
    expect(p.ziwei.palaces.length).toBe(12);
    expect(p.ziwei.palaces.every((x: any) => Array.isArray(x.majorStars))).toBe(true);
    expect(p.yun.decadal).toBeTruthy();
    expect(p.yun.yearly).toBeTruthy();
  });

  it('吠陀：Panchanga 与九分盘随码复现', () => {
    const { code } = encodeIn('Asia/Shanghai', 'vedic');
    const p = plateIn('America/New_York', code).plate;
    expect(p.vedic.panchanga).toBeTruthy();
    expect(JSON.stringify(p.vedic)).toContain('tithi');
  });
});

describe('旧码 QT1：仍可解，但必须明说不含时区', () => {
  const OLD = 'QT1-JgEmVfMYAAGu';

  it('能解出类型与时刻，不带 civil/tz，且首条告警就是那句话', () => {
    const d = decodeCode(OLD);
    expect(d.kind).toBe('ziwei');
    expect(d.legacy).toBe(true);
    expect(d.version).toBe(2);
    expect(d.civil).toBe(null);
    expect(d.tzKnown).toBe(false);
    expect(d.tzOffsetMinutes).toBe(null);
    expect(d.city).toBe('');
    expect(d.warnings[0]).toBe(LEGACY_NOTICE);
    expect(LEGACY_NOTICE).toBe('此码不含时区信息，已按当前时区显示，可能与原盘不同');
  });

  it('旧码正是 P0 那个 bug：两个时区解出的盘确实不同（所以提示必不可少）', () => {
    // 旧码没有经纬度（v2 紫微不存），子进程各按本机时区还原钟面
    const sh = plateIn('Asia/Shanghai', OLD);
    const ny = plateIn('America/New_York', OLD);
    expect(sh.error ?? null).toBe(null);
    expect(plateOf(sh)).not.toBe(plateOf(ny));
  });

  it('补上出生城市后重算：得到 QT2 码，两地一致', () => {
    const old = decodeCode(OLD);
    // 旧码存的是绝对秒；按上海反解钟面
    const r = civilInCity(old.at, '上海');
    expect(r).toBeTruthy();
    const rebuilt = buildCode('ziwei', {
      civil: r!.civil,
      city: '上海',
      tz: r!.tz,
      tzOffsetMinutes: r!.offsetMinutes,
      tzEstimated: r!.tzEstimated,
      inDst: r!.inDst,
      gender: old.gender,
      lon: SH.lonEast,
      lat: SH.lat,
    }).code;
    const sh = plateIn('Asia/Shanghai', rebuilt);
    const ny = plateIn('America/New_York', rebuilt);
    expect(plateOf(sh)).toBe(plateOf(ny));
    expect(decodeCode(rebuilt).city).toBe('上海');
    // 重算按「上海这一刻的真实钟面」，与旧码在本机按 +8 显示的结果不必然是同一钟面
    expect(decodeCode(rebuilt).tzOffsetMinutes).toBe(r!.offsetMinutes);
  });
});

describe('不许把兜底值当真：坐标 / 城市 / 时区缺失都要标记', () => {
  it('经纬度等于兜底值 120E/30N → 标记 fallback 并告警', () => {
    const b = buildCode('ziwei', {
      civil: { y: 2000, mo: 1, d: 1, h: 12, mi: 0 },
      city: CITY_UNKNOWN,
      tzEstimated: true,
      lon: 120,
      lat: 30,
    });
    expect(b.warnings.join('；')).toContain('兜底值');
    const d = decodeCode(b.code);
    expect(d.geoFallback).toBe(true);
    expect(d.warnings.join('；')).toContain('兜底值');
    expect(d.city).toBe('');
    expect(d.warnings.join('；')).toContain('未记录城市');
  });

  it('出生盘缺经纬度 → 明确告警（真太阳时会偏）', () => {
    const b = buildCode('bazi', {
      civil: { y: 2000, mo: 1, d: 1, h: 12, mi: 0 },
      city: '测试城',
      tzOffsetMinutes: 480,
    });
    expect(b.warnings.join('；')).toContain('不含经纬度');
  });

  it('没给时区偏移 → 用本机时区并告警（不允许静默）', () => {
    const b = buildCode('meihua', { civil: { y: 2026, mo: 7, d: 15, h: 12, mi: 0 } });
    expect(b.warnings.join('；')).toContain('本机时区');
  });
});

describe('码的完整性', () => {
  it('抄错一个字符 → 校验失败而不是解出乱七八糟的盘', () => {
    const { code } = encodeIn('Asia/Shanghai');
    const bad = code.slice(0, -1) + (code.slice(-1) === 'A' ? 'B' : 'A');
    expect(() => decodeCode(bad)).toThrow(/校验失败|不完整/);
  });

  it('规则版本随码携带，旧规则码会标 ruleStale', () => {
    const d = decodeCode(encodeIn('Asia/Shanghai').code);
    expect(d.ruleVersion).toBe(RULE_VERSION);
    expect(d.ruleStale).toBe(false);
  });

  it('时区快照对 1990 年上海给出 +9（夏令时），对 2026 年给出 +8', () => {
    expect(tzSnapshotOfCivil({ y: 1990, mo: 5, d: 20, h: 10, mi: 30 }, SH).tzOffsetMinutes).toBe(540);
    expect(tzSnapshotOfCivil({ y: 2026, mo: 7, d: 15, h: 10, mi: 30 }, SH).tzOffsetMinutes).toBe(480);
  });
});
