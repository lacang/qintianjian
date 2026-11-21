/**
 * 大六壬 ↔ 八字 时间层同步回归（audit4 · r2_crosspan P0-1/2/3）
 *
 * 由来：第四轮跨盘审计实测大六壬是唯一没接统一时间层的盘——它在
 * `app/js/daliurenview.js` 里自己 `at.getHours()` + `solarToSiZhu`，于是
 *   · 不折真太阳时（拉萨 12:00 课给午、八字给巳）；
 *   · 按钟表 23:00 换日（拉萨 23:30 课已进辛酉、八字仍庚申）；
 *   · 盘内自相矛盾（沈阳 1988 DST 13:30：占时支午(钟面) vs 时柱甲午(已减1h)）。
 * 现在 qiKe 全部走内核 `resolvePaipanTime`，这份测试把「同日同时同分」钉死：
 *   30 个跨时区/历史时区/夏令时/换日临界点，大六壬的日柱、时柱、占时支
 *   必须与 `paiBazi` 逐字相同，旬空必须与八字旬空一致。
 *
 * 断言口子选在**产品入口 qiKe**（而不是 resolvePaipanTime）：
 * 只有这样才能拦住「哪天又有人在视图里自算一遍时间」这类回归。
 */
import { describe, expect, it } from 'vitest';
import { paiBazi } from '../src/index.js';
// 直接吃前端真实入口：视图若再自造时间逻辑，这里立刻红。
import { qiKe } from '../../app/js/daliurenview.js';

const ZHI = ['子', '丑', '寅', '卯', '辰', '巳', '午', '未', '申', '酉', '戌', '亥'];

/** 30 点与 audit4/probe_all.ts 的 POINTS 完全一致（跨盘对拍的同一张表） */
type Pt = {
  id: string; label: string;
  y: number; mo: number; d: number; h: number; mi: number;
  city?: string; lat?: number; lon?: number;
};
const POINTS: Pt[] = [
  { id: 'P01', label: '北京 正午', y: 2026, mo: 6, d: 15, h: 12, mi: 0, city: '北京' },
  { id: 'P02', label: '北京 23:30', y: 2026, mo: 6, d: 15, h: 23, mi: 30, city: '北京' },
  { id: 'P03', label: '北京 次日00:30（P02 的次日）', y: 2026, mo: 6, d: 16, h: 0, mi: 30, city: '北京' },
  { id: 'P04', label: '北京 23:59 夏至前夜', y: 2026, mo: 6, d: 20, h: 23, mi: 59, city: '北京' },
  { id: 'P05', label: '乌鲁木齐 12:00', y: 2026, mo: 6, d: 15, h: 12, mi: 0, city: '乌鲁木齐' },
  { id: 'P06', label: '拉萨 12:00', y: 2026, mo: 6, d: 15, h: 12, mi: 0, city: '拉萨' },
  { id: 'P07', label: '漠河 12:00（53.5N，无城市表 → 经纬度）', y: 2026, mo: 6, d: 15, h: 12, mi: 0, lat: 53.47, lon: 122.34 },
  { id: 'P08', label: '赫尔辛基 12:00（EU 夏令时）', y: 2026, mo: 6, d: 15, h: 12, mi: 0, city: '赫尔辛基' },
  { id: 'P09', label: '悉尼 12:00（南半球冬至，无 DST）', y: 2026, mo: 6, d: 15, h: 12, mi: 0, city: '悉尼' },
  { id: 'P10', label: '悉尼 12:00（1 月，AU 夏令时）', y: 2026, mo: 1, d: 15, h: 12, mi: 0, city: '悉尼' },
  { id: 'P11', label: '圣保罗 12:00', y: 2026, mo: 6, d: 15, h: 12, mi: 0, city: '圣保罗' },
  { id: 'P12', label: '奥克兰 12:00（7 月，无 DST）', y: 2026, mo: 6, d: 15, h: 12, mi: 0, city: '奥克兰' },
  { id: 'P13', label: '奥克兰 12:00（1 月，NZ 夏令时）', y: 2026, mo: 1, d: 15, h: 12, mi: 0, city: '奥克兰' },
  { id: 'P14', label: '檀香山 12:00（156W，跨日界西侧）', y: 2026, mo: 6, d: 15, h: 12, mi: 0, city: '檀香山' },
  { id: 'P15', label: '成都 1930-06-01 12:00（陇蜀 +7）', y: 1930, mo: 6, d: 1, h: 12, mi: 0, city: '成都' },
  { id: 'P16', label: '乌鲁木齐 1940-06-01 12:00（新藏 +6）', y: 1940, mo: 6, d: 1, h: 12, mi: 0, city: '乌鲁木齐' },
  { id: 'P17', label: '拉萨 1940-06-01 12:00（昆仑 +5.5）', y: 1940, mo: 6, d: 1, h: 12, mi: 0, city: '拉萨' },
  { id: 'P18', label: '沈阳 1988-07-15 13:30（中国夏令时）', y: 1988, mo: 7, d: 15, h: 13, mi: 30, city: '沈阳' },
  { id: 'P19', label: '沈阳 1988-07-15 23:30（DST+晚子时）', y: 1988, mo: 7, d: 15, h: 23, mi: 30, city: '沈阳' },
  { id: 'P20', label: '北京 2026-11-21 23:30', y: 2026, mo: 11, d: 21, h: 23, mi: 30, city: '北京' },
  { id: 'P21', label: '北京 2026-11-22 00:30（P20 的次日）', y: 2026, mo: 11, d: 22, h: 0, mi: 30, city: '北京' },
  { id: 'P22', label: '拉萨 23:30（真太阳时≈21:3x）', y: 2026, mo: 6, d: 15, h: 23, mi: 30, city: '拉萨' },
  { id: 'P23', label: '乌鲁木齐 23:30', y: 2026, mo: 6, d: 15, h: 23, mi: 30, city: '乌鲁木齐' },
  { id: 'P24', label: '赫尔辛基 23:30（DST）', y: 2026, mo: 6, d: 15, h: 23, mi: 30, city: '赫尔辛基' },
  { id: 'P25', label: '北京 冬至 12:00', y: 2026, mo: 12, d: 21, h: 12, mi: 0, city: '北京' },
  { id: 'P26', label: '北京 春分 12:00', y: 2026, mo: 3, d: 20, h: 12, mi: 0, city: '北京' },
  { id: 'P27', label: '悉尼 23:30（南半球换日）', y: 2026, mo: 6, d: 15, h: 23, mi: 30, city: '悉尼' },
  { id: 'P28', label: '檀香山 23:30（跨日界）', y: 2026, mo: 6, d: 15, h: 23, mi: 30, city: '檀香山' },
  { id: 'P29', label: '北京 1950-01-01 00:30（统一 +8 之后）', y: 1950, mo: 1, d: 1, h: 0, mi: 30, city: '北京' },
  { id: 'P30', label: '北京 正午（只给经纬度，不给城市）', y: 2026, mo: 6, d: 15, h: 12, mi: 0, lat: 39.9042, lon: 116.4074 },
];

function loc(p: Pt) {
  return p.city
    ? { city: p.city }
    : { lat: p.lat, latitude: p.lat, lon: p.lon, lonEast: p.lon, longitude: p.lon };
}

describe('大六壬 · 统一时间层同步（30 点对拍八字）', () => {
  for (const p of POINTS) {
    it(`${p.id} ${p.label}：日柱/时柱/占时支与八字同分钟`, () => {
      const base = { year: p.y, month: p.mo, day: p.d, hour: p.h, minute: p.mi };
      const L = loc(p);
      const bz = paiBazi({ ...base, ...L, gender: '男' } as never);
      // 浏览器的钟面：本地分量即「当地民用时」，与视图里 new Date() 同构
      const at = new Date(p.y, p.mo - 1, p.d, p.h, p.mi, 0, 0);
      const r = qiKe(at, L as never);

      expect(r.sz.dayGanZhi, `${p.id} 日柱`).toBe(bz.day.ganZhi);
      expect(r.sz.timeGanZhi, `${p.id} 时柱`).toBe(bz.time.ganZhi);
      // 盘内同源：占时支必须就是时柱地支（P0-2 自相矛盾的病根）
      expect(ZHI[r.t], `${p.id} 占时支`).toBe(bz.time.ganZhi[1]);
      // 旬空同源
      expect(r.xun.kong.map((z: number) => ZHI[z]).sort().join(''), `${p.id} 旬空`)
        .toBe(bz.xunKong.slice().sort().join(''));
      // 三传必须是三支，且都落在十二支里（起课本身没被时间层改坏）
      expect(r.chuan).toHaveLength(3);
      for (const c of r.chuan as Array<{ z: number }>) expect(c.z).toBeGreaterThanOrEqual(0);
    });
  }

  it('拉萨 12:00 折真太阳时（10:04）→ 巳时，不是钟面的午时', () => {
    const r = qiKe(new Date(2026, 5, 15, 12, 0, 0, 0), { city: '拉萨' } as never);
    expect(r.ts.usedTrueSolar).toBe(true);
    expect(r.ts.trueSolar && r.ts.trueSolar.hour).toBe(10);
    expect(ZHI[r.t]).toBe('巳');
  });

  it('拉萨 23:30 真太阳 21:34 → 不换日（八字仍是当日）', () => {
    const r = qiKe(new Date(2026, 5, 15, 23, 30, 0, 0), { city: '拉萨' } as never);
    expect(r.ts.trueSolar && r.ts.trueSolar.hour).toBe(21);
    expect(r.ts.dayAdvanced).toBe(false);
    expect(r.sz.dayGanZhi).toBe('庚申');
    expect(ZHI[r.t]).toBe('亥');
  });

  it('北京 23:30 真太阳 23:15 → 过 23:00 换日进次日（与八字同分钟）', () => {
    const r = qiKe(new Date(2026, 5, 15, 23, 30, 0, 0), { city: '北京' } as never);
    expect(r.ts.dayAdvanced).toBe(true);
    expect(r.sz.dayGanZhi).toBe('辛酉');
    expect(ZHI[r.t]).toBe('子');
  });

  it('沈阳 1988-07-15 13:30 夏令时：占时支与时柱同源（午/甲午）', () => {
    const r = qiKe(new Date(1988, 6, 15, 13, 30, 0, 0), { city: '沈阳' } as never);
    expect(r.ts.inDst).toBe(true);
    expect(r.sz.timeGanZhi).toBe('甲午');
    expect(ZHI[r.t]).toBe('午');
    expect(r.ts.clock.hour).toBe(13);
  });

  it('月将随中气过宫：冬至（太阳过 270°）当刻由寅换丑', () => {
    const a = qiKe(new Date(2026, 5, 15, 12, 0, 0, 0), { city: '北京' } as never);
    const b = qiKe(new Date(2026, 11, 21, 12, 0, 0, 0), { city: '北京' } as never); // 冬至前数小时
    const c = qiKe(new Date(2026, 11, 23, 12, 0, 0, 0), { city: '北京' } as never); // 冬至之后
    expect(ZHI[a.yj]).toBe('申'); // 太阳黄经≈84° · 实沈
    expect(ZHI[b.yj]).toBe('寅'); // 太阳黄经≈269.x° · 析木
    expect(ZHI[c.yj]).toBe('丑'); // 太阳黄经≈271.x° · 星纪
  });

  it('真太阳时开关关闭时：六壬与八字仍同步（一起退回标准时）', () => {
    const base = { year: 2026, month: 6, day: 15, hour: 12, minute: 0 };
    for (const flag of [true, false]) {
      const bz = paiBazi({ ...base, city: '拉萨', gender: '男', trueSolarTime: flag } as never);
      const r = qiKe(new Date(2026, 5, 15, 12, 0, 0, 0), { city: '拉萨', trueSolarTime: flag } as never);
      expect(r.sz.dayGanZhi, `flag=${flag} 日柱`).toBe(bz.day.ganZhi);
      expect(r.sz.timeGanZhi, `flag=${flag} 时柱`).toBe(bz.time.ganZhi);
    }
    // 关掉之后退到标准时 12:00 → 午时，而不是真太阳的巳时
    const off = qiKe(new Date(2026, 5, 15, 12, 0, 0, 0), { city: '拉萨', trueSolarTime: false } as never);
    expect(off.ts.usedTrueSolar).toBe(false);
    expect(ZHI[off.t]).toBe('午');
  });

  it('晚子时口径 0 点换日：与八字同口径', () => {
    const bz = paiBazi({ year: 2026, month: 11, day: 21, hour: 23, minute: 30, city: '北京', gender: '男', lateZiMode: '00' } as never);
    const r = qiKe(new Date(2026, 10, 21, 23, 30, 0, 0), { city: '北京', lateZiMode: '00' } as never);
    expect(r.sz.dayGanZhi).toBe(bz.day.ganZhi);
    expect(r.sz.timeGanZhi).toBe(bz.time.ganZhi);
    expect(ZHI[r.t]).toBe(bz.time.ganZhi[1]);
  });
});
