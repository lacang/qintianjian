/**
 * 印度占星（vedic）回归测试 —— 覆盖 v132 修复的 5 条缺陷中的 4 条内核项：
 *  ① 27 宿中文名与梵名映射（宿曜经以来通行对应，不可整段错位）
 *  ② 新月（Amavasya）合相判定：距 0°≤6° 为合，而不是距 180°
 *  ③ 出生小限 Antardasha 起点在出生前（真实大运起点），出生小限不再恒等于大运主星
 *  ④ 度数 toDms 的 60′ 进位须连带星座进位（29°59.5′ → 下一星座 0°0′）
 *
 * 时间基准（外部真值，timeanddate / StarWalk，2026 年 11 月）：
 *   新月 2026-11-09 07:02 UTC；上弦 2026-11-17 11:48 UTC；满月 2026-11-24 14:53 UTC。
 */
import { describe, it, expect } from 'vitest';
import { NAKSHATRAS, paipanVedic, toDms, type GrahaId } from '../src/vedic.js';

/** 以 UT 直接入参（utcOffsetHours=0），便于用天文真值时刻直接排盘 */
function chartAtUtc(iso: string, lat = 39.9, lonEast = 116.4) {
  const d = new Date(iso);
  return paipanVedic({
    year: d.getUTCFullYear(), month: d.getUTCMonth() + 1, day: d.getUTCDate(),
    hour: d.getUTCHours(), minute: d.getUTCMinutes(), second: d.getUTCSeconds(),
    lat, lonEast, utcOffsetHours: 0,
  });
}

// ───────────────────────── ① 27 宿中英对照 ─────────────────────────
// 27 宿 = 二十八宿去「牛宿」；顺序自 Ashwini(娄) 起，不可变。
const CANON: [string, string][] = [
  ['Ashwini', '娄宿'], ['Bharani', '胃宿'], ['Krittika', '昴宿'], ['Rohini', '毕宿'],
  ['Mrigashira', '觜宿'], ['Ardra', '参宿'], ['Punarvasu', '井宿'], ['Pushya', '鬼宿'],
  ['Ashlesha', '柳宿'], ['Magha', '星宿'], ['Purva Phalguni', '张宿'], ['Uttara Phalguni', '翼宿'],
  ['Hasta', '轸宿'], ['Chitra', '角宿'], ['Swati', '亢宿'], ['Vishakha', '氐宿'],
  ['Anuradha', '房宿'], ['Jyeshtha', '心宿'], ['Mula', '尾宿'], ['Purva Ashadha', '箕宿'],
  ['Uttara Ashadha', '斗宿'], ['Shravana', '女宿'], ['Dhanishta', '虚宿'], ['Shatabhisha', '危宿'],
  ['Purva Bhadrapada', '室宿'], ['Uttara Bhadrapada', '壁宿'], ['Revati', '奎宿'],
];

describe('① 27 宿中文名 ↔ 梵名映射', () => {
  it('共 27 宿，逐条与通行对应表一致（娄宿 Ashwini … 奎宿 Revati）', () => {
    expect(NAKSHATRAS).toHaveLength(27);
    CANON.forEach(([sa, zh], i) => {
      expect(NAKSHATRAS[i].sa, `第 ${i + 1} 宿梵名`).toBe(sa);
      expect(NAKSHATRAS[i].zh, `第 ${i + 1} 宿（${sa}）中文名`).toBe(zh);
    });
  });

  it('Pushya/Ashlesha 一带有「鬼宿」，且 27 宿里没有「牛宿」', () => {
    // 旧表自 Pushya 起整段前移一宿，Pushya 被写成柳宿、全表漏鬼宿、末段多出牛宿
    expect(NAKSHATRAS.find(n => n.sa === 'Pushya')!.zh).toBe('鬼宿');
    expect(NAKSHATRAS.find(n => n.sa === 'Ashlesha')!.zh).toBe('柳宿');
    expect(NAKSHATRAS.some(n => n.zh === '牛宿')).toBe(false);
    expect(NAKSHATRAS.some(n => n.zh === '鬼宿')).toBe(true);
  });

  it('每宿中文名、梵名均唯一（错位会造成重复/缺失）', () => {
    expect(new Set(NAKSHATRAS.map(n => n.zh)).size).toBe(27);
    expect(new Set(NAKSHATRAS.map(n => n.sa)).size).toBe(27);
  });

  it('宿主星仍是 Vimshottari 九星循环（计都起、按 7/20/6/10/7/18/16/19/17 年轮转）', () => {
    const seq: GrahaId[] = ['ketu', 'venus', 'sun', 'moon', 'mars', 'rahu', 'jupiter', 'saturn', 'mercury'];
    NAKSHATRAS.forEach((n, i) => expect(n.lord, `第 ${i + 1} 宿主星`).toBe(seq[i % 9]));
  });

  it('排盘输出的月宿中文名与本表同源（1994-08-01 沈阳例：昴宿/Krittika）', () => {
    const c = paipanVedic({
      year: 1994, month: 8, day: 1, hour: 11, minute: 45,
      lat: 41.8057, lonEast: 123.4328, utcOffsetHours: 8,
    });
    const ns = c.moonNakshatra;
    expect(ns.sa).toBe('Krittika');
    expect(ns.zh).toBe('昴宿');
    expect(NAKSHATRAS[ns.index].zh).toBe(ns.zh);
  });
});

// ───────────────────────── ② 新月/满月合相判定 ─────────────────────────
describe('② isNewMoonConj（日月合相 ≤6°）', () => {
  it('正例：2026-11-09 07:02 UTC 真实新月 → true', () => {
    const c = chartAtUtc('2026-11-09T07:02:00Z');
    const d = ((c.bodies.moon.lon - c.bodies.sun.lon) % 360 + 360) % 360;
    expect(Math.min(d, 360 - d)).toBeLessThan(0.2);
    expect(c.isNewMoonConj).toBe(true);
  });

  it('正例：新月前 4 小时（距合 ≈1.9°）→ true', () => {
    const c = chartAtUtc('2026-11-09T03:02:00Z');
    const d = ((c.bodies.moon.lon - c.bodies.sun.lon) % 360 + 360) % 360;
    expect(Math.min(d, 360 - d)).toBeLessThan(6);
    expect(c.isNewMoonConj).toBe(true);
  });

  it('反例：2026-11-24 14:53 UTC 真实满月 → false（旧写法在此误判为 true）', () => {
    const c = chartAtUtc('2026-11-24T14:53:00Z');
    const d = ((c.bodies.moon.lon - c.bodies.sun.lon) % 360 + 360) % 360;
    expect(Math.abs(d - 180)).toBeLessThan(0.2);
    expect(c.isNewMoonConj).toBe(false);
  });

  it('反例：2026-11-17 11:48 UTC 上弦（距合 90°）→ false', () => {
    expect(chartAtUtc('2026-11-17T11:48:00Z').isNewMoonConj).toBe(false);
  });

  it('边界：新月后 13 小时（距合 ≈6.15°）超出 6° → false；+8 小时（≈3.8°）→ true', () => {
    expect(chartAtUtc('2026-11-09T20:02:00Z').isNewMoonConj).toBe(false);
    expect(chartAtUtc('2026-11-09T15:02:00Z').isNewMoonConj).toBe(true);
  });
});

// ───────────────────────── ③ 出生小限起点 ─────────────────────────
const MD_YEARS: Record<GrahaId, number> = {
  ketu: 7, venus: 20, sun: 6, moon: 10, mars: 7, rahu: 18, jupiter: 16, saturn: 19, mercury: 17,
};
const LORD_SEQ: GrahaId[] = ['ketu', 'venus', 'sun', 'moon', 'mars', 'rahu', 'jupiter', 'saturn', 'mercury'];

/** 从第一原理独立重算「出生小限」：真实起点 = -full×elapsed，按 年限/120 比例切 9 段 */
function expectedAntardasha(elapsed: number, mdLord: GrahaId): GrahaId {
  const full = MD_YEARS[mdLord];
  let ac = -full * elapsed;
  const i0 = LORD_SEQ.indexOf(mdLord);
  for (let k = 0; k < 9; k++) {
    const g = LORD_SEQ[(i0 + k) % 9];
    const e = ac + MD_YEARS[g] / 120 * full;
    if (0 >= ac - 1e-9 && 0 < e + 1e-9) return g;
    ac = e;
  }
  return mdLord;
}

const CASES = [
  { label: '1994-08-01 11:45 沈阳（昴宿，elapsed 0.444）', inp: { year: 1994, month: 8, day: 1, hour: 11, minute: 45, lat: 41.8057, lonEast: 123.4328, utcOffsetHours: 8 } },
  { label: '2008-04-18 19:40 北京（轸宿，elapsed 0.223）', inp: { year: 2008, month: 4, day: 18, hour: 19, minute: 40, lat: 39.9, lonEast: 116.4, utcOffsetHours: 8 } },
  { label: '1966-11-27 05:15 北京（胃宿，elapsed 0.986）', inp: { year: 1966, month: 11, day: 27, hour: 5, minute: 15, lat: 39.9, lonEast: 116.4, utcOffsetHours: 8 } },
];

describe('③ 出生小限 Antardasha 起点在出生前', () => {
  it('三个不同月宿进度的命例：出生小限都落在包含 age=0 的段内', () => {
    for (const { label, inp } of CASES) {
      const v = paipanVedic(inp).vimshottari;
      const ad = v.antardasha;
      expect(ad.startYear, label).toBeLessThanOrEqual(0);
      expect(ad.endYear, label).toBeGreaterThan(0);
      expect(ad.endYear - ad.startYear, label).toBeGreaterThan(0);
    }
  });

  it('三个命例：出生小限不再恒等于大运主星（旧 bug 三者皆相等）', () => {
    const got = CASES.map(({ inp }) => {
      const v = paipanVedic(inp).vimshottari;
      return { md: v.mahadasha.graha, ad: v.antardasha.graha };
    });
    // 旧实现：0 岁永远落在自己大运的第一段 → 三者 ad===md
    got.forEach(g => expect(g.ad).not.toBe(g.md));
    // 且三例小限互不相同，说明确实按各命例的 elapsed 分别切开
    expect(new Set(got.map(g => g.ad)).size).toBeGreaterThan(1);
  });

  it('三个命例：小限主星与第一原理独立重算一致', () => {
    for (const { label, inp } of CASES) {
      const v = paipanVedic(inp).vimshottari;
      expect(v.antardasha.graha, label).toBe(expectedAntardasha(v.birthStar.elapsed, v.mahadasha.graha));
    }
  });

  it('小限九段连续、总长 = 该大运年限，且终点与出生对齐表首运终点吻合', () => {
    for (const { label, inp } of CASES) {
      const v = paipanVedic(inp).vimshottari;
      const md = v.mahadasha.graha;
      const full = MD_YEARS[md];
      const elapsed = v.birthStar.elapsed;
      // 真实起点 → 出生对齐表首运终点（firstRemain）应恰好等于 full×(1-elapsed)
      const realStart = -full * elapsed;
      const firstRemain = v.sequence[0].endYear;
      expect(full - elapsed * full, label).toBeCloseTo(firstRemain, 2);
      // 小限段自 md 主星起轮转，长度 = 年限/120×大运年限
      const i0 = LORD_SEQ.indexOf(md);
      let ac = realStart;
      for (let k = 0; k < 9; k++) {
        ac += MD_YEARS[LORD_SEQ[(i0 + k) % 9]] / 120 * full;
      }
      // sequence[0].endYear 已按 toFixed(3) 取整，比较到 0.01 年即可
      expect(ac, label).toBeCloseTo(firstRemain, 2);
    }
  });

  it('大运 sequence / mahadasha 语义不变：首运仍以出生=0 岁对齐（UI 依赖）', () => {
    const v = paipanVedic(CASES[0].inp).vimshottari;
    expect(v.sequence[0].startYear).toBe(0);
    expect(v.mahadasha.startYear).toBe(0);
    expect(v.mahadasha.graha).toBe(v.sequence[0].graha);
    expect(v.mahadasha.endYear).toBe(v.sequence[0].endYear);
    // 九步大运首尾相接、总长 = 120 年（含出生时余量）
    for (let i = 1; i < v.sequence.length; i++) {
      expect(v.sequence[i].startYear).toBeCloseTo(v.sequence[i - 1].endYear, 3);
    }
  });

  it('出生正落在某小限段中段时，允许小限主星 = 大运主星（不过度矫正）', () => {
    // 1985-03-15：金星大运，elapsed≈0.157 < 20/120 ⇒ 出生时仍在金星小限内
    const v = paipanVedic({
      year: 1985, month: 3, day: 15, hour: 6, minute: 20, lat: 39.9, lonEast: 116.4, utcOffsetHours: 8,
    }).vimshottari;
    expect(v.mahadasha.graha).toBe('venus');
    expect(v.antardasha.graha).toBe(expectedAntardasha(v.birthStar.elapsed, 'venus'));
    expect(v.antardasha.graha).toBe('venus');
    expect(v.antardasha.startYear).toBeLessThan(0);
    expect(v.antardasha.endYear).toBeGreaterThan(0);
  });
});

// ───────────────────────── ④ toDms 进位换星座 ─────────────────────────
const SIGN_ZH = ['白羊', '金牛', '双子', '巨蟹', '狮子', '处女', '天秤', '天蝎', '射手', '摩羯', '水瓶', '双鱼'];

describe('④ toDms 分钟进位必须连带星座进位', () => {
  it('29°59.5′ → 下一星座 0°00′（旧实现给同星座 0°00′，差 30°）', () => {
    const d = toDms(29.9917); // 白羊末 29°59.5′
    expect(d.degree).toBe(0);
    expect(d.minute).toBe(0);
    expect(Math.floor(d.lon / 30)).toBe(1); // 金牛
    expect(SIGN_ZH[Math.floor(d.lon / 30)]).toBe('金牛');
  });

  it('各星座末尾都进到下一星座 0°0′，双鱼末回到白羊 0°0′', () => {
    for (let s = 0; s < 12; s++) {
      const d = toDms(s * 30 + 29.9917);
      expect(d.degree, `第 ${s + 1} 星座末`).toBe(0);
      expect(d.minute).toBe(0);
      expect(Math.floor(d.lon / 30)).toBe((s + 1) % 12);
    }
    expect(Math.floor(toDms(359.9917).lon / 30)).toBe(0);
  });

  it('不越界：29°59′ 不进位；29°30′、0°、30° 保持原状', () => {
    expect(toDms(29.9833)).toMatchObject({ degree: 29, minute: 59 });
    expect(toDms(29.5)).toMatchObject({ degree: 29, minute: 30 });
    expect(toDms(0)).toMatchObject({ degree: 0, minute: 0 });
    expect(toDms(30)).toMatchObject({ degree: 0, minute: 0 });
    expect(Math.floor(toDms(30).lon / 30)).toBe(1);
  });

  it('排盘出口自洽：每个九曜/上升的 dms 与 signIndex 同星座（旧实现在末 0.5′ 会错位一格）', () => {
    const c = paipanVedic({
      year: 1994, month: 8, day: 1, hour: 11, minute: 45,
      lat: 41.8057, lonEast: 123.4328, utcOffsetHours: 8,
    });
    for (const b of Object.values(c.bodies)) {
      if (!b) continue;
      expect(Math.floor(b.dms.lon / 30), `${b.name} 星座一致性`).toBe(b.signIndex);
      expect(b.dms.degree).toBeGreaterThanOrEqual(0);
      expect(b.dms.degree).toBeLessThan(30);
      expect(b.dms.minute).toBeLessThan(60);
    }
    expect(Math.floor(c.asc.lon / 30)).toBe(c.ascSignIndex);
    expect(c.asc.degree).toBeLessThan(30);
  });
});
