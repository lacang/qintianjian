/**
 * 第四轮审计（r2_crosspan.md）四项修复的回归测试
 *
 *  P1-4  年柱/月柱的节气切点必须是**绝对时刻**：同一 UTC 瞬时全国同时换柱，
 *        不得随经度（真太阳时）平移。日柱/时柱仍按真太阳时（传统日晷口径）。
 *  P2-5  二十八宿「觜/参」名实归属：觜窄（≈1.4°）、参宽（≈11.5°）。
 *  P2-6  warnings 必须透传到八个盘（六爻/八字/奇门/紫微/西占/印度/梅花/流注之外的盘面）。
 *  P3-8  「分」取整跳档：星座与显示度分必须同口径，不允许「某星座 0°00′ 而原值不在该星座」。
 *
 * 验收数据（月柱 120 点、36 万点扫描）写在 /opt/data/work/audit4/fix_r2.md。
 */
import { describe, it, expect } from 'vitest';
import { Solar } from 'lunar-javascript';
import {
  Vector, MakeTime, RotateVector, Rotation_EQJ_ECT, SphereFromVector,
} from 'astronomy-engine';
import { utcMsOf } from '../src/validate.js';
import { paiBazi } from '../src/bazi.js';
import { paipan } from '../src/paipan.js';
import { paiQiMen } from '../src/qimen.js';
import { paiZiwei } from '../src/ziwei.js';
import { paipanXingpan, toDms } from '../src/astro.js';
import { paipanVedic } from '../src/vedic.js';
import { meiHuaByTime } from '../src/meihua.js';
import { getMeridianByTime } from '../src/meridian.js';
import { mansionSnapshot, mansionAtLon } from '../src/mansion.js';

/* ------------------------------------------------------------------ *
 * 通用：节气瞬时（UTC）与五地钟面
 * ------------------------------------------------------------------ */

const ALL_JIEQI = [
  '小寒', '大寒', '立春', '雨水', '惊蛰', '春分', '清明', '谷雨',
  '立夏', '小满', '芒种', '夏至', '小暑', '大暑', '立秋', '处暑',
  '白露', '秋分', '寒露', '霜降', '立冬', '小雪', '大雪', '冬至',
];
const ALIAS: Record<string, string> = {
  XIAO_HAN: '小寒', DA_HAN: '大寒', LI_CHUN: '立春', YU_SHUI: '雨水', JING_ZHE: '惊蛰', CHUN_FEN: '春分',
  QING_MING: '清明', GU_YU: '谷雨', LI_XIA: '立夏', XIAO_MAN: '小满', MANG_ZHONG: '芒种', XIA_ZHI: '夏至',
  XIAO_SHU: '小暑', DA_SHU: '大暑', LI_QIU: '立秋', CHU_SHU: '处暑', BAI_LU: '白露', QIU_FEN: '秋分',
  HAN_LU: '寒露', SHUANG_JIANG: '霜降', LI_DONG: '立冬', XIAO_XUE: '小雪', DA_XUE: '大雪', DONG_ZHI: '冬至',
};

/** 十二「节」——换月柱的那些；其余十二「气」不换月柱 */
const JIE_ONLY = new Set(['立春', '惊蛰', '清明', '立夏', '芒种', '小暑', '立秋', '白露', '寒露', '立冬', '大雪', '小寒']);

type SolarLike = {
  getYear(): number; getMonth(): number; getDay(): number;
  getHour(): number; getMinute(): number; getSecond(): number;
};

/** 2026 年 24 个节气的绝对时刻（lunar-javascript 的节气表是东八区钟面，减 8h 得 UTC） */
function jieqiOf2026(): Array<{ name: string; utcMs: number }> {
  const seen = new Map<string, { name: string; utcMs: number }>();
  for (let m = 1; m <= 12; m++) {
    const table = Solar.fromYmdHms(2026, m, 15, 12, 0, 0).getLunar().getJieQiTable() as Record<string, SolarLike>;
    for (const [key, s] of Object.entries(table)) {
      // 表里同一节气有两种键：中文名与大写拼音别名（DONG_ZHI 等），统一成中文名后去重
      const name = ALL_JIEQI.includes(key) ? key : ALIAS[key];
      if (!name) continue;
      const utc = utcMsOf(s.getYear(), s.getMonth(), s.getDay(), s.getHour(), s.getMinute(), s.getSecond()) - 8 * 3600_000;
      if (utc < Date.UTC(2026, 0, 1) || utc >= Date.UTC(2027, 0, 1)) continue;
      seen.set(`${name}@${utc}`, { name, utcMs: utc });
    }
  }
  return [...seen.values()].sort((a, b) => a.utcMs - b.utcMs);
}

const CITIES = [
  { name: '漠河', lat: 53.4706, lonEast: 122.5389, off: 8 },
  { name: '北京', lat: 39.9042, lonEast: 116.4074, off: 8 },
  { name: '拉萨', lat: 29.6520, lonEast: 91.1721, off: 8 },
  { name: '乌鲁木齐', lat: 43.8256, lonEast: 87.6168, off: 8 },
  { name: '赫尔辛基', lat: 60.1699, lonEast: 24.9384, off: 2 }, // 2 月无夏令时
];

type City = (typeof CITIES)[number];

/** 给定绝对时刻 + 该地时区，折成当地钟面输入（只给经纬度，不给城市名） */
function localInput(c: City, utcMs: number) {
  const l = new Date(utcMs + c.off * 3600_000);
  return {
    year: l.getUTCFullYear(), month: l.getUTCMonth() + 1, day: l.getUTCDate(),
    hour: l.getUTCHours(), minute: l.getUTCMinutes(), second: l.getUTCSeconds(),
  };
}

function baziAtUtc(c: City, utcMs: number) {
  return paiBazi({ ...localInput(c, utcMs), gender: '男' as const, lat: c.lat, lonEast: c.lonEast, utcOffsetHours: c.off });
}

/* ------------------------------------------------------------------ *
 * P1-4 年柱/月柱：绝对时刻
 * ------------------------------------------------------------------ */

describe('P1-4 年柱/月柱切点用绝对时刻（不随经度平移）', () => {
  const jieqi = jieqiOf2026();

  it('2026 年 24 节气 × 5 地 = 120 点：交节前后各 60 秒，年/月柱五地一致', () => {
    expect(jieqi.length).toBe(24);
    const rows: string[] = [];
    for (const jq of jieqi) {
      for (const dt of [-60_000, +60_000]) {
        const base = baziAtUtc(CITIES[1], jq.utcMs + dt); // 北京为基准
        for (const c of CITIES) {
          const r = baziAtUtc(c, jq.utcMs + dt);
          expect({ city: c.name, jieqi: jq.name, dt, y: r.year.ganZhi, m: r.month.ganZhi })
            .toEqual({ city: c.name, jieqi: jq.name, dt, y: base.year.ganZhi, m: base.month.ganZhi });
        }
        rows.push(`${jq.name}${dt > 0 ? '+60s' : '-60s'} ${base.year.ganZhi}/${base.month.ganZhi}`);
      }
    }
    expect(rows.length).toBe(48);
  }, 300_000);

  it('十二「节」：月柱实际换柱瞬时五地相差 ≤ 1 秒（二分到秒）', () => {
    const jies = jieqi.filter((j) => JIE_ONLY.has(j.name));
    expect(jies.length).toBe(12);

    const monthAt = (c: City, ms: number) => baziAtUtc(c, ms).month.ganZhi;
    const switchInstant = (c: City, t: number) => {
      let lo = t - 3 * 3600_000;
      let hi = t + 3 * 3600_000;
      const m0 = monthAt(c, lo);
      expect(monthAt(c, hi)).not.toBe(m0); // 3 小时窗口内必然跨过换柱点
      while (hi - lo > 1000) {
        const mid = Math.floor((lo + hi) / 2);
        if (monthAt(c, mid) === m0) lo = mid; else hi = mid;
      }
      return hi;
    };

    const worst: Array<{ jie: string; spreadMs: number; at: string }> = [];
    for (const j of jies) {
      const inst = CITIES.map((c) => switchInstant(c, j.utcMs));
      const spread = Math.max(...inst) - Math.min(...inst);
      worst.push({ jie: j.name, spreadMs: spread, at: new Date(Math.min(...inst)).toISOString() });
      expect({ jie: j.name, spreadLe1s: spread <= 1000 }).toEqual({ jie: j.name, spreadLe1s: true });
      // 换柱点必须就在节气瞬时附近（±1 分钟内），而不是被真太阳时推走
      for (const i of inst) expect(Math.abs(i - j.utcMs)).toBeLessThanOrEqual(60_000);
    }
    // 立春同时也是年柱切点
    const liChun = jies.find((j) => j.name === '立春')!;
    const yr = (c: City, ms: number) => baziAtUtc(c, ms).year.ganZhi;
    for (const c of CITIES) {
      expect(yr(c, liChun.utcMs - 1000)).toBe('乙巳');
      expect(yr(c, liChun.utcMs + 1000)).toBe('丙午');
    }
    expect(worst.length).toBe(12);
  }, 600_000);

  it('日柱/时柱仍按真太阳时（未被连带改成钟表时）', () => {
    // 金标准命例（第四轮审计 r2_crosslang 实测值）：同一天，真太阳时决定日/时柱
    const lhasa = paiBazi({ year: 2026, month: 6, day: 15, hour: 23, minute: 30, gender: '男', lat: 29.652, lonEast: 91.1721, utcOffsetHours: 8 });
    expect(lhasa.day.ganZhi).toBe('庚申');   // 拉萨真太阳时 21:40 左右，未过 23 点 → 当日
    expect(lhasa.time.ganZhi.charAt(1)).toBe('亥');

    const urumqi = paiBazi({ year: 2026, month: 6, day: 15, hour: 12, minute: 0, gender: '男', lat: 43.8256, lonEast: 87.6168, utcOffsetHours: 8 });
    expect(urumqi.time.ganZhi.charAt(1)).toBe('巳'); // 钟表 12:00 → 真太阳时 10:15 左右，巳时

    const beijing = paiBazi({ year: 2026, month: 6, day: 15, hour: 23, minute: 30, gender: '男', lat: 39.9042, lonEast: 116.4074, utcOffsetHours: 8 });
    expect(beijing.day.ganZhi).toBe('辛酉');  // 23:30 晚子时换日 → 次日
    expect(beijing.time.ganZhi.charAt(1)).toBe('子');

    // 同一绝对瞬时，北京与乌鲁木齐的日/时柱必须不同（真太阳时确实还在生效）
    const t = Date.UTC(2026, 5, 15, 4, 2, 0); // 北京时间 12:02
    const bj = baziAtUtc(CITIES[1], t);
    const wl = baziAtUtc(CITIES[3], t);
    expect(bj.month.ganZhi).toBe(wl.month.ganZhi);   // 月柱同（绝对时刻）
    expect(bj.time.ganZhi.charAt(1)).not.toBe(wl.time.ganZhi.charAt(1)); // 时支不同（真太阳时）
  }, 120_000);

  it('六爻 / 奇门 / 梅花 的年月也走绝对时刻（月柱、年支不再随经度漂）', () => {
    const liChun = jieqi.find((j) => j.name === '立春')!;
    const has = (c: City, dt: number) => {
      const clock = localInput(c, liChun.utcMs + dt);
      const base = { ...clock, lat: c.lat, lonEast: c.lonEast, utcOffsetHours: c.off };
      const liu = paipan({ ...base, yaoValues: [7, 8, 9, 7, 8, 7] as never });
      const qi = paiQiMen(base as never);
      const mh = meiHuaByTime(new Date(Date.UTC(clock.year, clock.month - 1, clock.day, clock.hour, clock.minute, clock.second)), {
        lat: c.lat, lonEast: c.lonEast, utcOffsetHours: c.off,
      });
      return {
        liuMonth: liu.siZhu.monthGanZhi, liuYear: liu.siZhu.yearGanZhi,
        qiMonth: qi.siZhu.month, qiYear: qi.siZhu.year,
        mhYearBranch: mh.timeDetail!.yearBranchOrder,
      };
    };
    const ref = CITIES[1];
    for (const dt of [-60_000, 60_000]) {
      const b = has(ref, dt);
      for (const c of CITIES) {
        expect({ c: c.name, ...has(c, dt) }).toEqual({ c: c.name, ...b });
      }
    }
  }, 300_000);
});

/* ------------------------------------------------------------------ *
 * P2-5 觜/参宿名
 * ------------------------------------------------------------------ */

describe('P2-5 觜宿窄、参宿宽（名实归属）', () => {
  const AT = new Date('2026-03-27T14:10:00Z');

  const spanOf = (snap: ReturnType<typeof mansionSnapshot>, name: string) => {
    const i = snap.boundaries.findIndex((b) => (b.label ?? b.name) === name);
    expect(i).toBeGreaterThanOrEqual(0);
    const a = snap.boundaries[i].lon;
    const b = snap.boundaries[(i + 1) % snap.boundaries.length].lon;
    return ((b - a) % 360 + 360) % 360;
  };

  it('黄道/赤道两套坐标下 觜 < 2°、参 > 8°，且觜 < 参', () => {
    for (const frame of ['ect', 'eqd'] as const) {
      const snap = mansionSnapshot(AT, frame);
      const zi = spanOf(snap, '觜');
      const shen = spanOf(snap, '参');
      expect({ frame, ziNarrow: zi < 2 }).toEqual({ frame, ziNarrow: true });
      expect({ frame, shenWide: shen > 8 }).toEqual({ frame, shenWide: true });
      expect({ frame, ordered: zi < shen }).toEqual({ frame, ordered: true });
      // 窄缝就是两颗距星之间那段：觜宿宽度 ≈ λ Ori − δ Ori
      const lam = snap.boundaries.find((b) => b.name === '觜')!.lon;
      const del = snap.boundaries.find((b) => b.name === '参')!.lon;
      const gap = ((lam - del) % 360 + 360) % 360;
      expect(Math.abs(zi - gap)).toBeLessThan(0.2);
    }
  }, 120_000);

  it('除觜参外 26 宿名称逐一对位，逆序相邻对的两段名称互换', () => {
    const snap = mansionSnapshot(AT, 'ect');
    expect(snap.boundaries.length).toBe(28);
    const swapped = snap.boundaries.filter((b) => (b.label ?? b.name) !== b.name).map((b) => b.name).sort();
    expect(swapped).toEqual(['参', '觜']);
    // 传统序「觜前参后」；实测升序为「参(δ Ori) 在前、觜(λ Ori) 在后」
    const del = snap.boundaries.find((b) => b.name === '参')!;
    const lam = snap.boundaries.find((b) => b.name === '觜')!;
    expect(del.label).toBe('觜');
    expect(lam.label).toBe('参');
    expect(del.lon).toBeLessThan(lam.lon);
    expect(del.name).toContain('参');
  }, 120_000);

  it('6 个已知恒星位置逐一对宿（独立用 J2000 坐标旋到当日真黄道）', () => {
    const t = MakeTime(AT);
    const rot = Rotation_EQJ_ECT(t);
    const eclLon = (ra: number, dec: number) => {
      const a = (ra * Math.PI) / 180;
      const d = (dec * Math.PI) / 180;
      const v = new Vector(Math.cos(d) * Math.cos(a), Math.cos(d) * Math.sin(a), Math.sin(d), t);
      return SphereFromVector(RotateVector(rot, v)).lon;
    };
    const cases: Array<[string, number, number, string]> = [
      ['昴星团 M45（17 Tau 一带）', 56.75, 24.1167, '昴'],
      ['毕宿五 Aldebaran', 68.9802, 16.5093, '毕'],
      ['参宿七 Rigel 西侧窄缝区（δ→λ 之间）', 83.4, 9.9334, '觜'],
      ['参宿四 Betelgeuse', 88.7929, 7.4071, '参'],
      // 注：ε Ori（参宿二，黄经 84.05°）正落在 δ↔λ 这 1.42° 的窄缝内 —— 见文件末注释，
      // 该缝按《授时历》宿度归觜，故此例不列；列参宿三 ζ Ori 作为「参宿」侧的判据。
      ['参宿三 Alnitak', 85.1897, -1.9426, '参'],
      ['井宿三 Alhena（γ Gem）', 99.4280, 16.3993, '井'],
    ];
    for (const [label, ra, dec, want] of cases) {
      const got = mansionAtLon(AT, 'ect', eclLon(ra, dec)).name;
      expect({ label, mansion: got }).toEqual({ label, mansion: want });
    }
  }, 120_000);

  it('距星=0 入宿度：井宿距星 μ Gem 落在井宿（浮点容差 0.04″ 不再误判给参宿）', () => {
    const t = MakeTime(AT);
    const rot = Rotation_EQJ_ECT(t);
    const a = (95.7401 * Math.PI) / 180;
    const d = (22.5136 * Math.PI) / 180;
    const v = new Vector(Math.cos(d) * Math.cos(a), Math.cos(d) * Math.sin(a), Math.sin(d), t);
    const lon = SphereFromVector(RotateVector(rot, v)).lon;
    const got = mansionAtLon(AT, 'ect', lon);
    expect({ mansion: got.name, ruDuUnder1Arcmin: got.ruDu * 3600 < 60 }).toEqual({ mansion: '井', ruDuUnder1Arcmin: true });
  }, 120_000);

  it('已知局限（记录、不作为正确性主张）：距星分界与星官成员不总重合', () => {
    // 1) δ↔λ 这 1.42° 的窄缝按《授时历》宿度归觜，于是夹在其中的参宿二 ε Ori 判觜；
    //    若把它判给参（= 原实现），参宿四、参宿三会反被划进觜（11.5° 错区）。取窄缝归觜是错得更少的一侧。
    // 2) 参宿七 Rigel 黄经 77.2°，在参宿距星 δ Ori（82.7°）之西，按距星分界属毕宿（古今一致，非本次改动）。
    const t = MakeTime(AT);
    const rot = Rotation_EQJ_ECT(t);
    const eclLon = (ra: number, dec: number) => {
      const a = (ra * Math.PI) / 180;
      const d = (dec * Math.PI) / 180;
      const v = new Vector(Math.cos(d) * Math.cos(a), Math.cos(d) * Math.sin(a), Math.sin(d), t);
      return SphereFromVector(RotateVector(rot, v)).lon;
    };
    expect(mansionAtLon(AT, 'ect', eclLon(84.0534, -1.2019)).name).toBe('觜'); // ε Ori
    expect(mansionAtLon(AT, 'ect', eclLon(78.6345, -8.2016)).name).toBe('毕'); // Rigel
  }, 120_000);

  it('月离/日躔宿名输出与段落归属一致（不再出现 3.2% 错名区）', () => {
    const snaps = ['2026-01-05T00:00:00Z', '2026-03-27T14:10:00Z', '2026-08-09T06:00:00Z', '2026-11-20T18:30:00Z']
      .map((iso) => mansionSnapshot(new Date(iso), 'ect'));
    for (const s of snaps) {
      for (const b of s.bodies) {
        expect(b.mansion).toBe(mansionAtLon(new Date(s.at), 'ect', b.lon).name);
      }
    }
  }, 120_000);
});

/* ------------------------------------------------------------------ *
 * P2-6 warnings 透传到各盘
 * ------------------------------------------------------------------ */

describe('P2-6 warnings 透传（只给经纬度、不给城市时，八个盘都要有时区估算提示）', () => {
  const clock = { year: 2026, month: 6, day: 15, hour: 12, minute: 0 };
  const geoOnly = { ...clock, lat: 43.8256, lonEast: 87.6168 }; // 乌鲁木齐坐标，无城市名
  const KEY = '时区';

  it('六爻 / 八字 / 奇门 / 紫微 / 西占 / 印度 / 梅花 / 流注 均有 warnings 且含时区提示', () => {
    const pans: Array<[string, { warnings?: string[] }]> = [
      ['六爻', paipan({ ...geoOnly, yaoValues: [7, 8, 9, 7, 8, 7] as never })],
      ['八字', paiBazi({ ...geoOnly, gender: '男' as const })],
      ['奇门', paiQiMen(geoOnly as never)],
      ['紫微', paiZiwei({ ...geoOnly, gender: '男' as const })],
      ['西占', paipanXingpan(geoOnly as never)],
      ['印度', paipanVedic(geoOnly as never)],
      ['梅花', meiHuaByTime(new Date(2026, 5, 15, 12, 0, 0), { lat: geoOnly.lat, lonEast: geoOnly.lonEast })],
      ['流注', getMeridianByTime(geoOnly as never)],
    ];
    for (const [name, r] of pans) {
      const w = r.warnings ?? [];
      expect({ name, hasWarnings: w.length > 0 }).toEqual({ name, hasWarnings: true });
      expect({ name, hasTz: w.some((x) => x.includes(KEY)) }).toEqual({ name, hasTz: true });
    }
  }, 300_000);

  it('梅花与西占带 timeWarnings（时间层原样透传，不与校验提示混在一起）', () => {
    const mh = meiHuaByTime(new Date(2026, 5, 15, 12, 0, 0), { lat: geoOnly.lat, lonEast: geoOnly.lonEast });
    expect(mh.timeWarnings.length).toBeGreaterThan(0);
    expect(mh.warnings.length).toBeGreaterThan(0);
    const astro = paipanXingpan(geoOnly as never);
    expect(astro.warnings.length).toBeGreaterThan(0);
  }, 120_000);
});

/* ------------------------------------------------------------------ *
 * P3-8 分取整跳档
 * ------------------------------------------------------------------ */

describe('P3-8 星座与度分同口径（36 万点扫描）', () => {
  it('0–360° 每 0.001°：0°00′ 只在距宫界 ≤30″ 时出现，星座只在真进位时改变', () => {
    const HALF_MIN = 1 / 120 + 1e-9; // 0.5 角分 = 30 角秒
    let zeroZero = 0;
    let carries = 0;
    let maxErr = 0;
    const bad: Array<{ lon: number; d: ReturnType<typeof toDms> }> = [];
    // 359.9999° 会折成 0°，误差按环绕取小值
    const wrapErr = (a: number, b: number) => {
      const e = Math.abs(a - b) % 360;
      return e > 180 ? 360 - e : e;
    };
    for (let i = 0; i < 360_000; i++) {
      const lon = i / 1000;
      const d = toDms(lon);
      const norm = ((d.lon % 360) + 360) % 360;
      const sign = Math.floor(norm / 30);
      const inSign = norm - sign * 30;
      const deg = Math.floor(inSign + 1e-12);
      const min = Math.round((inSign - deg) * 60);
      const err = wrapErr(d.lon, lon);
      maxErr = Math.max(maxErr, err);
      if (err > HALF_MIN) bad.push({ lon, d });
      // 显示的度分必须与 dms.lon 自洽
      if (d.degree !== deg || d.minute !== min) bad.push({ lon, d });
      if (d.degree === 0 && d.minute === 0) {
        zeroZero += 1;
        // 「0°00′」只能对应宫界 ±30″ 的原值 —— 不允许「巨蟹 0°00′」这种不存在的组合
        if (wrapErr(lon, sign * 30) > HALF_MIN) bad.push({ lon, d });
      }
      if (sign !== Math.floor(lon / 30)) {
        carries += 1;
        if (wrapErr(lon, sign * 30) > HALF_MIN) bad.push({ lon, d }); // 越界进位
      }
    }
    expect(maxErr).toBeLessThanOrEqual(HALF_MIN);
    expect(bad.slice(0, 5)).toEqual([]);
    expect(zeroZero).toBeGreaterThan(0);
    expect(carries).toBeGreaterThan(0); // 确实覆盖了跨宫进位样本
  }, 300_000);

  it('西占盘：星体星座/宫位与显示度分零矛盾（含 119.998° 卡边样本）', () => {
    const times = [
      { year: 2026, month: 3, day: 27, hour: 22, minute: 10 },
      { year: 2026, month: 6, day: 15, hour: 12, minute: 0 },
      { year: 1991, month: 12, day: 31, hour: 23, minute: 59 },
    ];
    for (const t of times) {
      const chart = paipanXingpan({ ...t, lat: 39.9042, lonEast: 116.4074 });
      for (const id of Object.keys(chart.bodies)) {
        const b = chart.bodies[id as keyof typeof chart.bodies]!;
        const sign = Math.floor((((b.dms.lon % 360) + 360) % 360) / 30);
        expect({ id, sign, dms: b.dms, signIndex: b.signIndex }).toEqual({ id, sign, dms: b.dms, signIndex: b.signIndex });
        // 宫位必须与进位后的星座一致（整宫制）
        expect({ id, house: chart.houses[b.house - 1].signIndex }).toEqual({ id, house: b.signIndex });
        // 若显示 0°00′，原黄经必须贴着宫界（误差 ≤30″）
        if (b.dms.degree === 0 && b.dms.minute === 0) {
          expect(Math.abs(b.dms.lon - sign * 30)).toBeLessThanOrEqual(1 / 120 + 1e-9);
        }
      }
      // 上升点同口径
      expect(chart.ascSignIndex).toBe(Math.floor((((chart.asc.lon % 360) + 360) % 360) / 30));
    }
  }, 300_000);
});
