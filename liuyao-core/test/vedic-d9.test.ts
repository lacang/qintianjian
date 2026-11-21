/**
 * D9 上升 + 分盘十二宫 + Panchanga 五要素 + 合参接口 的核对测试
 *
 * 为什么这么测
 * ------------
 * 「印度占星看不准」的根子不在星历（行星/上升误差都在角分级），而在**分盘只有星座单字、
 * 没有 D9 上升、也没有 D9 十二宫**，用户无从核对。所以这里的测试都对着「能自己手算的东西」：
 *   ① 上升度数 → D9 星座：用**四元素起点规则**（动宫起本宫 / 不动宫起第 9 宫 / 双宫起第 5 宫）
 *      独立实现一遍，与库里「每 3°20′ 一分取模」的写法互校；
 *   ② 十二宫：每宫星座必须 = D9 上升 + i，九曜各落一宫且与自身 D9 星座自洽；
 *   ③ Panchanga：拿「新月 / 上弦 / 满月」三个真实月相时刻做锚（这些时刻与历法无关，可独立核），
 *      再验 Tithi/Karana 的整圈边界；
 *   ④ 合参：只验结构与该有的档位，不验吉凶话术。
 */
import { describe, it, expect } from 'vitest';
import { paipanVedic, navamshaSign, dasamsaSign, saptamsaSign, panchangaOf } from '../src/vedic.js';
import { comparePans, natalGradeOf } from '../../app/js/verdicts.js';

const BJ = { lat: 39.9042, lonEast: 116.4074, utcOffsetHours: 8 };

function chartAt(year: number, month: number, day: number, hour: number, minute = 0, place = BJ) {
  return paipanVedic({ year, month, day, hour, minute, ...place });
}
const norm360 = (x: number) => ((x % 360) + 360) % 360;

/**
 * D9 的经典「四元素起点」算法（独立实现）：
 *   动宫（白羊/巨蟹/天秤/摩羯）自本宫起数；不动宫（金牛/狮子/天蝎/水瓶）自第 9 宫起数；
 *   双宫（双子/处女/射手/双鱼）自第 5 宫起数。每宫 9 分、每分 3°20′。
 */
function navamsaByClassicRule(lon: number): number {
  const l = norm360(lon);
  const sign = Math.floor(l / 30);
  const into = l - sign * 30;
  const k = Math.min(8, Math.floor(into / (30 / 9)));
  const isMovable = sign % 3 === 0;                 // 0,3,6,9
  const isFixed = sign % 3 === 1;                    // 1,4,7,10
  const base = isMovable ? sign : isFixed ? (sign + 8) % 12 : (sign + 4) % 12;
  return (base + k) % 12;
}

describe('D9 Navamsha Lagna：与手算对照（四元素起点规则）', () => {
  it('六个边界度数逐一手算：动宫起本宫 / 不动宫起第 9 宫 / 双宫起第 5 宫', () => {
    const cases: [number, string, number][] = [
      [14, '白羊 14°（动宫，自白羊起）第 5 分', 4],          // 白羊+4 = 狮子
      [57, '金牛 27°（不动宫，自摩羯起）第 9 分', 5],        // 摩羯+8 = 处女
      [32, '金牛 2°（不动宫，自摩羯起）第 1 分', 9],         // 摩羯
      [142, '狮子 22°（不动宫，自白羊起）第 7 分', 6],       // 白羊+6 = 天秤
      [68, '双子 8°（双宫，自天秤起）第 3 分', 8],           // 天秤+2 = 射手
      [359, '双鱼 29°（双宫，自巨蟹起）第 9 分', 11],        // 巨蟹+8 = 双鱼
    ];
    for (const [lon, why, want] of cases) {
      expect(navamshaSign(lon), why).toBe(want);
      expect(navamsaByClassicRule(lon), why).toBe(want);
    }
  });

  it('整圈 3600 个采样点，两种算法处处一致（差一度都不行）', () => {
    for (let i = 0; i < 3600; i++) {
      const lon = i / 10;
      expect(navamshaSign(lon), `${lon}°`).toBe(navamsaByClassicRule(lon));
    }
  });

  it('六个不同上升度数的真实命例：D9 上升 = 手算值（覆盖四元素与三种宫性）', () => {
    // 同一日不同时辰，上升分别落在白羊/金牛/双子/巨蟹/天蝎/双子；
    // D9 上升按上面那套规则手算，全部写死在此，防止「公式与实现一起错」。
    const cases: { hour: number; d1: string; d9: string; d9Idx: number; rule: string }[] = [
      { hour: 13, d1: '白羊', d9: '巨蟹', d9Idx: 3, rule: '动宫 白羊 12° → 自白羊起第 4 分 = 巨蟹' },
      { hour: 14, d1: '金牛', d9: '摩羯', d9Idx: 9, rule: '不动宫 金牛 2° → 自摩羯起第 1 分 = 摩羯' },
      { hour: 16, d1: '双子', d9: '天蝎', d9Idx: 7, rule: '双宫 双子 4° → 自天秤起第 2 分 = 天蝎' },
      { hour: 19, d1: '巨蟹', d9: '天秤', d9Idx: 6, rule: '动宫 巨蟹 12° → 自巨蟹起第 4 分 = 天秤' },
      { hour: 6, d1: '天蝎', d9: '水瓶', d9Idx: 10, rule: '不动宫 天蝎 23° → 自巨蟹起第 8 分 = 水瓶' },
      { hour: 17, d1: '双子', d9: '双鱼', d9Idx: 11, rule: '双宫 双子 18° → 自天秤起第 6 分 = 双鱼' },
    ];
    const seen = new Set<number>();
    for (const c of cases) {
      const ch = chartAt(1990, 1, 1, c.hour, 0);
      expect(ch.ascSignName, `h=${c.hour} 的 D1 上升`).toBe(c.d1);
      const d9 = ch.navamsha;
      expect(d9.varga).toBe('D9');
      expect(d9.lagnaSignName, `${c.rule}（D1 上升 ${ch.ascSignName} ${ch.asc.degree}°）`).toBe(c.d9);
      expect(d9.lagnaSignIndex).toBe(c.d9Idx);
      // 与上升原始黄经再算一遍必须同值
      expect(d9.lagnaSignIndex).toBe(navamsaByClassicRule(ch.asc.lon));
      expect(d9.lagnaSignIndex).toBe(navamshaSign(ch.asc.lon));
      seen.add(d9.lagnaSignIndex);
    }
    expect(seen.size, '六个命例的 D9 上升应有 6 种不同结果').toBe(6);
  });

  it('D9 上升度数：落在该分盘星座内，且保留原分段内的进度', () => {
    const ch = chartAt(1990, 1, 1, 13, 0);
    const d9 = ch.navamsha;
    expect(d9.lagnaDms.lon).toBeGreaterThanOrEqual(d9.lagnaSignIndex * 30);
    expect(d9.lagnaDms.lon).toBeLessThan((d9.lagnaSignIndex + 1) * 30);
    const into = ch.asc.lon - Math.floor(ch.asc.lon / 30) * 30;
    const partSpan = 30 / 9;
    const frac = (into % partSpan) / partSpan;
    const gotFrac = (d9.lagnaDms.lon - d9.lagnaSignIndex * 30) / 30;
    expect(gotFrac).toBeCloseTo(frac, 2); // lagnaDms 只到分，允许 1′ 级舍入
    expect(d9.lagnaSignIndex).not.toBe(ch.ascSignIndex);
  });
});

describe('分盘十二宫：整宫排布与落宫', () => {
  const GRahas = ['sun', 'moon', 'mars', 'mercury', 'jupiter', 'venus', 'saturn', 'rahu', 'ketu'] as const;

  it('D9 十二宫：每宫星座 = D9 上升 + i，宫号 1..12 无缺', () => {
    for (const hour of [6, 13, 14, 16, 17, 19]) {
      const d9 = chartAt(1990, 1, 1, hour, 0).navamsha;
      expect(d9.houses).toHaveLength(12);
      d9.houses.forEach((h, i) => {
        expect(h.house).toBe(i + 1);
        expect(h.signIndex).toBe((d9.lagnaSignIndex + i) % 12);
      });
      expect(new Set(d9.houses.map((h) => h.signIndex)).size).toBe(12);
    }
  });

  it('D9 落宫：九曜各出现一次，且所在宫星座 = 该星 D9 星座', () => {
    const ch = chartAt(1990, 1, 1, 13, 0);
    const d9 = ch.navamsha;
    const placed: string[] = [];
    for (const h of d9.houses) for (const id of h.bodies) placed.push(id);
    expect(placed.sort()).toEqual([...GRahas].sort());
    for (const id of GRahas) {
      const b = ch.bodies[id];
      const h = d9.houses.find((x) => x.bodies.includes(id))!;
      expect(h.signIndex, `${b.name} 的 D9 星座`).toBe(b.navamshaSign);
      expect(h.signIndex).toBe(navamshaSign(b.lon));
    }
  });

  it('D10 / D7：与手算规则一致（阳宫起本宫，阴宫起第 9 / 第 7 宫）', () => {
    // D10：白羊 27°（第 10 分）→ 摩羯；金牛 0°（第 1 分）→ 摩羯；金牛 3°（第 2 分）→ 水瓶
    expect(dasamsaSign(27)).toBe(9);
    expect(dasamsaSign(30)).toBe(9);
    expect(dasamsaSign(33)).toBe(10);
    // D7：白羊 0°（第 1 分）→ 白羊；金牛 0°（第 1 分）→ 天蝎；金牛 4.3°（第 2 分）→ 射手
    expect(saptamsaSign(0)).toBe(0);
    expect(saptamsaSign(30)).toBe(7);
    expect(saptamsaSign(34.3)).toBe(8);

    const ch = chartAt(1990, 1, 1, 13, 0);
    for (const v of [ch.dasamsa, ch.saptamsa]) {
      expect(v.houses).toHaveLength(12);
      v.houses.forEach((h, i) => expect(h.signIndex).toBe((v.lagnaSignIndex + i) % 12));
      expect(v.lagnaSignIndex).toBe(
        v.varga === 'D10' ? dasamsaSign(ch.asc.lon) : saptamsaSign(ch.asc.lon),
      );
      const placed = v.houses.flatMap((h) => h.bodies);
      expect(placed.sort()).toEqual([...GRahas].sort());
    }
  });
});

describe('Panchanga 五要素：与天文锚点手算对照', () => {
  const UTC0 = { lat: 39.9042, lonEast: 116.4074, utcOffsetHours: 0 };
  const utcChart = (iso: string) => {
    const d = new Date(iso);
    return paipanVedic({
      year: d.getUTCFullYear(), month: d.getUTCMonth() + 1, day: d.getUTCDate(),
      hour: d.getUTCHours(), minute: d.getUTCMinutes(), second: d.getUTCSeconds(), ...UTC0,
    });
  };

  it('新月后 30 分钟：白分初一（Shukla Pratipada）+ 第 1 个 Karana（Kimstughna）', () => {
    // 2026-11-09 07:02 UTC 朔；07:32 时黄经差约 0.24°，落在第 1 个 Tithi 开头
    const p = utcChart('2026-11-09T07:32:00Z').panchanga;
    expect(p.elongation).toBeGreaterThan(0);
    expect(p.elongation).toBeLessThan(12);
    expect(p.tithi.num).toBe(1);
    expect(p.tithi.paksha).toBe('shukla');
    expect(p.tithi.name).toBe('白月初一');
    expect(p.tithi.sa).toBe('Shukla Pratipada');
    expect(p.karana.num).toBe(1);
    expect(p.karana.sa).toBe('Kimstughna');
  });

  it('上弦（2026-11-17 11:48 UTC，黄经差 90°）：白分初八 + 第 16 个 Karana（Bava）', () => {
    const p = utcChart('2026-11-17T11:48:00Z').panchanga;
    expect(p.elongation).toBeCloseTo(90, 1);
    expect(p.tithi.num).toBe(8);          // floor(90/12)+1 = 8
    expect(p.tithi.sa).toBe('Shukla Ashtami');
    expect(p.karana.num).toBe(16);        // floor(90/6)+1 = 16
    expect(p.karana.sa).toBe('Bava');     // (16-2) mod 7 = 0 → Bava
  });

  it('满月后 30 分钟（2026-11-24 15:23 UTC，黄经差 180.3°）：黑分初一 + 第 31 个 Karana（Balava）', () => {
    const p = utcChart('2026-11-24T15:23:00Z').panchanga;
    expect(p.elongation).toBeGreaterThan(180);
    expect(p.tithi.num).toBe(16);         // floor(180.3/12)+1 = 16
    expect(p.tithi.paksha).toBe('krishna');
    expect(p.tithi.name).toBe('黑月初一');
    expect(p.karana.num).toBe(31);
    expect(p.karana.sa).toBe('Balava');   // (31-2) mod 7 = 1
  });

  it('Tithi / Yoga / Karana 与底层黄经差的公式关系处处成立', () => {
    for (const [y, m, d, h] of [[2026, 11, 21, 4], [1994, 8, 1, 11], [2000, 2, 29, 20], [1985, 6, 15, 2]]) {
      const ch = chartAt(y, m, d, h, 30);
      const p = ch.panchanga;
      const elong = norm360(ch.bodies.moon.lon - ch.bodies.sun.lon);
      expect(p.elongation).toBeCloseTo(elong, 6);
      expect(p.tithi.num).toBe(Math.floor(elong / 12) + 1);
      expect(p.yoga.num).toBe(Math.floor(norm360(ch.bodies.sun.lon + ch.bodies.moon.lon) / (360 / 27)) + 1);
      expect(p.karana.num).toBe(Math.floor(elong / 6) + 1);
      expect(p.nakshatra.index).toBe(ch.moonNakshatra.index);
    }
  });

  it('Karana 整圈 60 个：1 固定、2–57 七名循环、58–60 三个固定名', () => {
    // 直接对 panchangaOf 喂合成黄经：sun=0、moon=k*6+1 → 第 k+1 个 Karana
    const CLOCK = { year: 2026, month: 11, day: 21, hour: 12, minute: 0, second: 0, ...UTC0 };
    const KARANA = ['Kimstughna', 'Bava', 'Balava', 'Kaulava', 'Taitila', 'Gara', 'Vanija', 'Vishti'];
    const KARANA_TAIL = ['Shakuni', 'Chatushpada', 'Naga'];
    for (let k = 0; k < 60; k++) {
      const p = panchangaOf(0, k * 6 + 1, CLOCK);
      const want = k === 0 ? KARANA[0] : k >= 57 ? KARANA_TAIL[k - 57] : KARANA[1 + ((k - 1) % 7)];
      expect(p.karana.num, `第 ${k + 1} 个 Karana`).toBe(k + 1);
      expect(p.karana.sa, `第 ${k + 1} 个 Karana`).toBe(want);
    }
  });

  it('Tithi 整圈 30 个：白分 1–15、黑分 1–15，满月/朔日在第 15 位', () => {
    const CLOCK = { year: 2026, month: 11, day: 21, hour: 12, minute: 0, second: 0, ...UTC0 };
    for (let i = 0; i < 30; i++) {
      const p = panchangaOf(0, i * 12 + 0.5, CLOCK);
      expect(p.tithi.num).toBe(i + 1);
      expect(p.tithi.paksha).toBe(i < 15 ? 'shukla' : 'krishna');
      if (i === 14) expect(p.tithi.sa).toBe('Shukla Purnima');
      if (i === 29) expect(p.tithi.sa).toBe('Krishna Amavasya');
    }
  });

  it('Vara 以日出换日：同日 03:00 记前一日（金曜），12:00 记当日（土曜）', () => {
    // 2026-11-21 为周六；北京该日日出约 07:05
    const early = chartAt(2026, 11, 21, 3, 0);
    const noon = chartAt(2026, 11, 21, 12, 0);
    expect(noon.panchanga.vara.name).toBe('土曜日');
    expect(early.panchanga.vara.name).toBe('金曜日');
    expect(early.panchanga.vara.basis).toBe('sunrise');
    expect(noon.panchanga.vara.sunrise).toMatch(/^\d{2}:\d{2}$/);
    expect(noon.panchanga.vara.lord).toBe('saturn');
    expect(early.panchanga.vara.lord).toBe('venus');
  });
});

describe('合参面板接口：分轨对照的返回结构', () => {
  const mk = (key: string, track: 'question' | 'natal', stance: 'yes' | 'no' | 'flat' | null, grade: 'strong' | 'mid' | 'weak' | null) =>
    ({ key, name: key, track, answered: true, stance, grade, level: null });

  it('结构齐全：tracks 两轨、三态数组、强度与理由', () => {
    const r = comparePans([mk('梅花', 'question', 'yes', null), mk('奇门', 'question', 'yes', null)]);
    expect(r.tracks.map((t) => t.key)).toEqual(['question', 'natal']);
    for (const t of r.tracks) {
      expect(t).toHaveProperty('answered');
      expect(t).toHaveProperty('pairs');
      expect(Array.isArray(t.same)).toBe(true);
      expect(Array.isArray(t.none)).toBe(true);
      expect(Array.isArray(t.clash)).toBe(true);
      expect(['强', '中', '弱']).toContain(t.strength);
    }
    expect(r).toHaveProperty('strength');
    expect(r).toHaveProperty('why');
    expect(Array.isArray(r.same)).toBe(true);
    expect(Array.isArray(r.none)).toBe(true);
    expect(Array.isArray(r.clash)).toBe(true);
  });

  it('问事轨两盘同向 → 中；只有一盘 → 弱且记「无法交叉」', () => {
    const two = comparePans([mk('梅花', 'question', 'yes', null), mk('奇门', 'question', 'yes', null)]);
    expect(two.tracks[0].strength).toBe('中');
    expect(two.tracks[0].same).toHaveLength(1);

    const one = comparePans([mk('梅花', 'question', 'yes', null)]);
    expect(one.tracks[0].strength).toBe('弱');
    expect(one.tracks[0].none[0]).toContain('无法交叉');
    expect(one.strength).toBe('弱');
  });

  it('方向相反 → 冲突，强度不得为强或中', () => {
    const r = comparePans([mk('梅花', 'question', 'yes', null), mk('奇门', 'question', 'no', null)]);
    expect(r.tracks[0].clash).toHaveLength(1);
    expect(r.tracks[0].strength).toBe('弱');
    expect(r.strength).toBe('弱');
  });

  it('本命轨三盘档位一致 → 最高只记「中」，并说明三盘同源非独立互证', () => {
    const pans = [
      mk('八字', 'natal', null, 'strong'),
      mk('紫微', 'natal', null, 'strong'),
      mk('西方', 'natal', null, 'strong'),
    ];
    const r = comparePans(pans);
    const natal = r.tracks.find((t) => t.key === 'natal')!;
    expect(natal.same).toHaveLength(3);
    expect(natal.strength).toBe('中');            // 同源三盘不得抬到「强」
    expect(natal.why).toContain('独立');
    expect(r.strength).toBe('中');
    expect(r.strongest).toBe('本命轨');
    // 跨轨不混：问事轨无结果，仍记弱
    expect(r.tracks.find((t) => t.key === 'question')!.strength).toBe('弱');
  });

  it('本命轨一强一弱 → 冲突；有中平的一对记无关', () => {
    const c = comparePans([mk('八字', 'natal', null, 'strong'), mk('紫微', 'natal', null, 'weak')]);
    expect(c.tracks[1].clash).toHaveLength(1);
    const n = comparePans([mk('八字', 'natal', null, 'strong'), mk('紫微', 'natal', null, 'mid')]);
    expect(n.tracks[1].clash).toHaveLength(0);
    expect(n.tracks[1].none.join()).toContain('中平');
  });

  it('两盘都判「平」记同向（无明显方向），吉对平记无关而非冲突', () => {
    const flat = comparePans([mk('梅花', 'question', 'flat', null), mk('奇门', 'question', 'flat', null)]);
    expect(flat.tracks[0].same).toHaveLength(1);
    expect(flat.tracks[0].same[0]).toContain('平');
    expect(flat.tracks[0].clash).toHaveLength(0);
    const mix = comparePans([mk('梅花', 'question', 'yes', null), mk('奇门', 'question', 'flat', null)]);
    expect(mix.tracks[0].clash).toHaveLength(0);
    expect(mix.tracks[0].none).toHaveLength(1);
    expect(mix.tracks[0].strength).toBe('弱');
  });

  it('未接入（answered=false）的盘不进任何一轨计数', () => {
    const r = comparePans([
      mk('梅花', 'question', 'yes', null),
      { key: '六爻', name: '六爻', track: 'question', answered: false, stance: null, grade: null, level: null },
    ]);
    expect(r.tracks[0].answered).toBe(1);
    expect(r.tracks[0].same).toHaveLength(0);
  });

  it('natalGradeOf：结论档位 → 命轨可比档', () => {
    expect(natalGradeOf(2)).toBe('strong');
    expect(natalGradeOf(1)).toBe('strong');
    expect(natalGradeOf(0)).toBe('mid');
    expect(natalGradeOf(-1)).toBe('weak');
    expect(natalGradeOf(null)).toBeNull();
  });
});
