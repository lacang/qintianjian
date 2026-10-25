import { describe, it, expect } from 'vitest';
import {
  paipanXingpan,
  guDianTuiYun,
  shouyeTianxiang,
  SIGN_ZH,
} from '../src/index.js';

// 金标准：caelus / astronomy-engine / auseklis / Swiss Ephemeris(Moshier) + IMCCE INPOP19
// 五路口径对拍（报告 对标素材/引擎对账报告_占星.md §2/§3）：ASC/MC 一致到 0.01 角分，
// 七政对 JPL 级 INPOP19 亚角分。出生：1994-08-01 11:45 沈阳（UT 03:45）。
const BIRTH = {
  year: 1994, month: 8, day: 1, hour: 11, minute: 45,
  lat: 41.8057, lonEast: 123.4328, utcOffsetHours: 8,
};

const closeTo = (got: number, want: number, tolDeg = 0.05) =>
  expect(got).toBeGreaterThan(want - tolDeg);

describe('西方古典占星 · 本命盘（整宫）', () => {
  const n = paipanXingpan(BIRTH);

  it('角点：ASC 天蝎0°39′、MC 狮子6°49′（容差 0.05°）', () => {
    expect(n.asc.lon).toBeGreaterThan(210.60);
    expect(n.asc.lon).toBeLessThan(210.72);
    expect(n.ascSignIndex).toBe(7); // 天蝎
    expect(n.ascSignName).toBe('天蝎');
    expect(n.mc.lon).toBeGreaterThan(126.75);
    expect(n.mc.lon).toBeLessThan(126.90);
  });

  it('昼盘、命主星火星', () => {
    expect(n.sect).toBe('昼');
    expect(n.chartRuler).toBe('mars');
    expect(n.chartRulerName).toBe('火星');
  });

  it('七政黄经（报告 §2.2）', () => {
    const b = n.bodies;
    // 太阳狮子 128.68 / 月亮金牛 56.37 / 水星巨蟹 115.88 / 金星处女 173.12
    expect(b.sun.signName).toBe('狮子');
    expect(b.sun.dms.lon).toBeGreaterThan(128.5);
    expect(b.sun.dms.lon).toBeLessThan(128.9);
    expect(b.moon.signName).toBe('金牛');    expect(b.moon.dms.lon).toBeGreaterThan(56.0);
    expect(b.mercury.signName).toBe('巨蟹');
    expect(b.mercury.house).toBe(9);
    expect(b.mercury.retrograde).toBe(false); // 当日水星顺行（非逆行）
    expect(b.venus.signName).toBe('处女');
    expect(b.mars.signName).toBe('双子');
    expect(b.jupiter.signName).toBe('天蝎');
    expect(b.jupiter.house).toBe(1);
    expect(b.saturn.retrograde).toBe(true);   // 土星逆行
    expect(b.pluto.signName).toBe('天蝎');
    expect(b.pluto.retrograde).toBe(true);
  });

  it('整宫十二宫：1宫天蝎起，月亮落7宫、太阳落10宫、水星落9宫', () => {
    expect(n.houses[0].signName).toBe('天蝎');
    expect(n.houses[0].lordName).toBe('火星');
    expect(n.houses[6].bodies).toContain('moon');    // 7宫
    expect(n.houses[9].bodies).toContain('sun');     // 10宫
    expect(n.houses[8].bodies).toContain('mercury'); // 9宫
  });

  it('必然尊贵：太阳庙+三分 total=8 且为七政最强；月亮旺；水星游民', () => {
    const d = n.dignities;
    expect(d.sun?.rulership).toBe(5);
    expect(d.sun?.triplicity).toBe(3);
    expect(d.sun?.total).toBe(8);
    expect(d.moon?.exaltation).toBe(4);
    expect(d.mercury?.peregrine).toBe(true);
  });

  it('福点 Fortuna 狮子18°21′、精神点 Spirit 摩羯12°58′', () => {
    expect(n.lots.fortune.lon).toBeGreaterThan(138.0);
    expect(n.lots.fortune.lon).toBeLessThan(138.7);
    expect(Math.floor(n.lots.fortune.lon / 30)).toBe(4); // 狮子
    expect(n.lots.spirit.lon).toBeGreaterThan(282.5);
    expect(n.lots.spirit.lon).toBeLessThan(283.4);
    expect(Math.floor(n.lots.spirit.lon / 30)).toBe(9); // 摩羯
  });
});

describe('西方古典占星 · 古典推运（目标 2026-10-18）', () => {
  const t = guDianTuiYun({
    birth: BIRTH,
    at: new Date(Date.UTC(2026, 9, 18, 4, 0, 0)), // 北京 12:00
  });

  it('32岁年小限：巨蟹9宫，年主月亮；当前月小限处女11宫主水星', () => {
    expect(t.profection.ageYears).toBe(32);
    expect(t.profection.annual.signName).toBe('巨蟹');
    expect(t.profection.annual.house).toBe(9);
    expect(t.profection.annual.lord).toBe('moon');
    expect(t.profection.monthly.signName).toBe('处女');
    expect(t.profection.monthly.lord).toBe('mercury');
  });

  it('Firdaria 昼盘，当前「月亮 · 月亮」主限次限', () => {
    expect(t.firdaria.day).toBe(true);
    expect(t.firdaria.major).toBe('moon');
    expect(t.firdaria.sub).toBe('moon');
    expect(t.firdaria.majorName).toBe('月亮');
  });
});

describe('西方古典占星 · 钦天监首页天象', () => {
  it('2026-10-18 12:00 北京：太阳天秤、月亮摩羯、金星逆行、月相近上弦照明≈0.45', () => {
    const tx = shouyeTianxiang(new Date(Date.UTC(2026, 9, 18, 4, 0, 0)));
    const sun = tx.bodies.find((x) => x.id === 'sun')!;
    const moon = tx.bodies.find((x) => x.id === 'moon')!;
    const venus = tx.bodies.find((x) => x.id === 'venus')!;
    expect(sun.signName).toBe('天秤');
    expect(moon.signName).toBe('摩羯');
    expect(venus.retrograde).toBe(true);
    expect(tx.moon.illumination).toBeGreaterThan(0.40);
    expect(tx.moon.illumination).toBeLessThan(0.52);
    // 下一四个月相里应含上弦与满月
    const names = tx.moon.nextQuarters.map((q) => q.name);
    expect(names).toContain('上弦');
    expect(names).toContain('满月');
  });

  it('太阳 2026-10-23 换天蝎；水星 10-24 留逆 / 11-13 留顺（当前临近即将水逆）', () => {
    const tx = shouyeTianxiang(new Date(Date.UTC(2026, 9, 18, 4, 0, 0)));
    const toScorpio = tx.ingresses.find((e) => e.signName === '天蝎');
    expect(toScorpio).toBeTruthy();
    // 10-23T09:38Z
    expect(toScorpio!.iso.startsWith('2026-10-23')).toBe(true);
    expect(tx.mercuryRetro).toBeTruthy();
    expect(tx.mercuryRetro!.stationRetrogradeIso.startsWith('2026-10-24')).toBe(true);
    expect(tx.mercuryRetro!.stationDirectIso.startsWith('2026-11-13')).toBe(true);
  });

  it('水逆进行中能判定 status=now（2026-11-01）', () => {
    const tx = shouyeTianxiang(new Date(Date.UTC(2026, 10, 1, 4, 0, 0)));
    expect(tx.mercuryRetro?.status).toBe('now');
  });

  it('SIGN_ZH 顺序正确', () => {
    expect(SIGN_ZH[0]).toBe('白羊');
    expect(SIGN_ZH[7]).toBe('天蝎');
    expect(SIGN_ZH[11]).toBe('双鱼');
  });
});
