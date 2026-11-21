/**
 * 全盘时间层同步回归（audit4 · fix_r4）
 *
 * 由来：大六壬修好之后复查发现**同病数处**——
 *   1. 小六壬 `app/js/xiaoliurenview.js`：`solarToSiZhu(钟面)` + `shichenIdx(getHours())`，
 *      与改造前的大六壬逐行同构：不折真太阳时、不认历史时区、不认夏令时；
 *      且「钟面小时÷2」让 23:00–00:59 挤成一个时辰、23:30 不换日。
 *   2. 奇门 `app/js/qimenview.js`：给内核传 `trueSolarTime:false`，只认 `cfg.apparentSolarTime`（默认关）。
 *      拉萨 23:30 奇门页辛酉戊子、八字/大六壬页庚申丁亥——同一时刻两个答案，盘上还没有任何提示。
 *   3. 六爻（`cast.js` / `main.js`）、梅花（`meihuaview.js`）、首页（`qintian.js`）、
 *      今日日课（`todaycard.js`）、合参（`hecanview.js`）：各自 `resolveCastDate` / 钟面分量，不看观测地。
 *
 * 现在这些入口全部走 `panTimeArgs()` → 内核 `civilForPaipan`（同一行代码：真太阳时 / 五时区 /
 * 夏令时 / 23 点换日）。本测试在 r2 报告的 30 个点上钉死「同分钟同盘」：
 *   小六壬的日柱与时支、奇门的四柱、六爻的日柱与时柱、梅花的时支与农历日，必须与 `paiBazi` 逐字一致。
 *
 * 断言口子一律选**前端真实入口**（xiaoLiuRenPan / currentQiMen / paipanZi / currentMeiHua），
 * 不是复刻内核调用——哪天线又被接回「钟面小时÷2」或「trueSolarTime:false」，这里立刻红。
 */
import { describe, expect, it } from 'vitest';
import { Solar } from 'lunar-javascript';
import { paiBazi, resolvePaipanTime } from '../src/index.js';
// 前端真实入口
import { xiaoLiuRenPan } from '../../app/js/xiaoliurenview.js';
import { currentQiMen } from '../../app/js/qimenview.js';
import { currentMeiHua } from '../../app/js/meihuaview.js';
import { paipanZi } from '../../app/js/zischool.js';
import { panTimeArgs } from '../../app/js/state.js';

const ZHI = ['子', '丑', '寅', '卯', '辰', '巳', '午', '未', '申', '酉', '戌', '亥'];

/** 30 点与 audit4/probe_all.ts、test/daliuren-sync.test.ts 的 POINTS 完全一致（跨盘对拍的同一张表） */
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

function loc(p: Pt): Record<string, unknown> {
  return p.city
    ? { city: p.city }
    : { lat: p.lat, latitude: p.lat, lon: p.lon, lonEast: p.lon, longitude: p.lon };
}

/** 浏览器的钟面：本地分量即「当地民用时」，与视图里 new Date() 同构 */
function clockOf(p: Pt) {
  return new Date(p.y, p.mo - 1, p.d, p.h, p.mi, 0, 0);
}

/** 独立于 timeSync 的农历复算：以「日柱所属日」为基准（23 点换日 → 次日） */
function lunarOfPillarDay(p: Pt, city: string | undefined, advanced: boolean) {
  const base = Solar.fromYmd(p.y, p.mo, p.d);
  return advanced ? base.next(1).getLunar() : base.getLunar();
}

describe('全盘时间层同步：小六壬 / 奇门 / 六爻 / 梅花 ↔ 八字（30 点）', () => {
  for (const p of POINTS) {
    it(`${p.id} ${p.label}`, () => {
      const L = loc(p) as never;
      const base = { year: p.y, month: p.mo, day: p.d, hour: p.h, minute: p.mi };
      const at = clockOf(p);
      // 基准盘：八字（已接入统一时间层的参照）
      const bz = paiBazi({ ...base, ...L, gender: '男' } as never);
      const bzZhi = bz.time.ganZhi.charAt(1);

      // ---- 1) 小六壬：日柱 + 时支（三数里的「日」与「时」）----
      const xl = xiaoLiuRenPan(at, L);
      expect(xl.ts.dayGanZhi, `${p.id} 小六壬 日柱`).toBe(bz.day.ganZhi);
      expect(ZHI[xl.hIdx], `${p.id} 小六壬 时支`).toBe(bzZhi);
      expect(xl.ts.timeGanZhi, `${p.id} 小六壬 时柱`).toBe(bz.time.ganZhi);
      // 农历月/日必须与日柱同一天（23:00 换日后日数跟日柱一起进次日）
      const ln = lunarOfPillarDay(p, p.city, xl.ts.dayAdvanced);
      expect(xl.month, `${p.id} 小六壬 农历月`).toBe(Math.abs(ln.getMonth()));
      expect(xl.day, `${p.id} 小六壬 农历日`).toBe(ln.getDay());

      // ---- 2) 奇门：四柱（时家奇门按四柱定局）----
      const qm = currentQiMen(at, L);
      expect(qm.q.siZhu.day, `${p.id} 奇门 日柱`).toBe(bz.day.ganZhi);
      expect(qm.q.siZhu.time, `${p.id} 奇门 时柱`).toBe(bz.time.ganZhi);
      expect(qm.q.siZhu.year, `${p.id} 奇门 年柱`).toBe(bz.year.ganZhi);
      expect(qm.q.siZhu.month, `${p.id} 奇门 月柱`).toBe(bz.month.ganZhi);
      // 盘面「时间口径」那行用的 ts 与真正排局的 civil 必须同源（同一次折算）
      expect(qm.ts.timeZhi, `${p.id} 奇门 口径行时支`).toBe(bzZhi);
      expect(qm.q.civil.hour, `${p.id} 奇门 折算后钟面`).toBe(qm.ts.civil.hour);
      expect(qm.q.civil.minute, `${p.id} 奇门 折算后分钟`).toBe(qm.ts.civil.minute);

      // ---- 3) 六爻：排盘入口（goPan 的做法：paipanZi + panTimeArgs）----
      const ly = paipanZi({
        ...panTimeArgs(at, L),
        yaoValues: [7, 8, 7, 8, 7, 8],
        gender: '男',
        question: '同步验收',
      } as never);
      expect(ly.siZhu.dayGanZhi, `${p.id} 六爻 日柱`).toBe(bz.day.ganZhi);
      expect(ly.siZhu.timeGanZhi, `${p.id} 六爻 时柱`).toBe(bz.time.ganZhi);

      // ---- 4) 梅花：时支序数（1–12）+ 农历日 ----
      const mh = currentMeiHua(at, L);
      const td = mh.result.timeDetail!;
      expect(td.hourBranchOrder, `${p.id} 梅花 时支`).toBe(ZHI.indexOf(bzZhi) + 1);
      expect(td.lunarDay, `${p.id} 梅花 农历日`).toBe(ln.getDay());
      expect(td.lunarMonth, `${p.id} 梅花 农历月`).toBe(Math.abs(ln.getMonth()));
      expect(mh.ts.timeZhi, `${p.id} 梅花 口径行时支`).toBe(bzZhi);
    });
  }
});

describe('重点点位逐个写死（回归时一眼看得出错在哪）', () => {
  it('拉萨 12:00：真太阳 10:04 → 巳时（八字/奇门/小六壬/梅花/六爻同一答案）', () => {
    const at = new Date(2026, 5, 15, 12, 0, 0, 0);
    const L = { city: '拉萨' } as never;
    const bz = paiBazi({ year: 2026, month: 6, day: 15, hour: 12, minute: 0, city: '拉萨', gender: '男' } as never);
    expect(bz.time.ganZhi).toBe('辛巳');
    expect(xiaoLiuRenPan(at, L).ts.timeGanZhi).toBe(bz.time.ganZhi);
    expect(currentQiMen(at, L).q.siZhu.time).toBe(bz.time.ganZhi);
    expect(currentMeiHua(at, L).result.timeDetail!.hourBranchOrder).toBe(ZHI.indexOf('巳') + 1);
    // 而钟面 12:00 若按旧算法就是午时 —— 这正是改前的错法
    expect(currentQiMen(at, L).ts.usedTrueSolar).toBe(true);
  });

  it('拉萨 23:30：真太阳 21:34，未到子初 → 庚申日、亥时（奇门不再给辛酉戊子）', () => {
    const at = new Date(2026, 5, 15, 23, 30, 0, 0);
    const L = { city: '拉萨' } as never;
    const bz = paiBazi({ year: 2026, month: 6, day: 15, hour: 23, minute: 30, city: '拉萨', gender: '男' } as never);
    expect(bz.day.ganZhi).toBe('庚申');
    expect(bz.time.ganZhi).toBe('丁亥');
    const qm = currentQiMen(at, L);
    expect(qm.q.siZhu.day).toBe('庚申');
    expect(qm.q.siZhu.time).toBe('丁亥');
    expect(qm.ts.dayAdvanced).toBe(false);
    const xl = xiaoLiuRenPan(at, L);
    expect(xl.ts.dayGanZhi).toBe('庚申');
    expect(ZHI[xl.hIdx]).toBe('亥');
    // 农历日 = 五月初一（日未换，日数也不进）
    expect(xl.day).toBe(1);
  });

  it('乌鲁木齐 12:00：真太阳 09:50 → 巳时', () => {
    const at = new Date(2026, 5, 15, 12, 0, 0, 0);
    const L = { city: '乌鲁木齐' } as never;
    const bz = paiBazi({ year: 2026, month: 6, day: 15, hour: 12, minute: 0, city: '乌鲁木齐', gender: '男' } as never);
    expect(bz.time.ganZhi.charAt(1)).toBe('巳');
    expect(currentQiMen(at, L).q.siZhu.time).toBe(bz.time.ganZhi);
    expect(xiaoLiuRenPan(at, L).ts.timeGanZhi).toBe(bz.time.ganZhi);
  });

  it('1930 成都（陇蜀时区 +7）：历史时区不被当成 +8', () => {
    const at = new Date(1930, 5, 1, 12, 0, 0, 0);
    const L = { city: '成都' } as never;
    const bz = paiBazi({ year: 1930, month: 6, day: 1, hour: 12, minute: 0, city: '成都', gender: '男' } as never);
    const qm = currentQiMen(at, L);
    expect(qm.ts.utcOffsetHours).toBe(7);
    expect(qm.q.siZhu.day).toBe(bz.day.ganZhi);
    expect(qm.q.siZhu.time).toBe(bz.time.ganZhi);
    expect(xiaoLiuRenPan(at, L).ts.timeGanZhi).toBe(bz.time.ganZhi);
  });

  it('沈阳 1988-07-15 13:30（夏令时 +9）：减 1 小时后真太阳 12:37 → 午时', () => {
    const at = new Date(1988, 6, 15, 13, 30, 0, 0);
    const L = { city: '沈阳' } as never;
    const bz = paiBazi({ year: 1988, month: 7, day: 15, hour: 13, minute: 30, city: '沈阳', gender: '男' } as never);
    const qm = currentQiMen(at, L);
    expect(qm.ts.inDst).toBe(true);
    expect(qm.ts.trueSolar && qm.ts.trueSolar.hour).toBe(12);
    expect(qm.q.siZhu.time).toBe(bz.time.ganZhi);
    expect(xiaoLiuRenPan(at, L).ts.timeGanZhi).toBe(bz.time.ganZhi);
    // 同刻若按钟面 13:30 直算会给未时——改前就是这样
    expect(bz.time.ganZhi.charAt(1)).toBe('午');
  });

  it('北京 23:30：真太阳 23:15 已过子初 → 日柱进次日，小六壬农历日同步进次日', () => {
    const at = new Date(2026, 5, 15, 23, 30, 0, 0);
    const L = { city: '北京' } as never;
    const bz = paiBazi({ year: 2026, month: 6, day: 15, hour: 23, minute: 30, city: '北京', gender: '男' } as never);
    const xl = xiaoLiuRenPan(at, L);
    expect(xl.ts.dayAdvanced).toBe(true);
    expect(xl.ts.dayGanZhi).toBe(bz.day.ganZhi);
    expect(ZHI[xl.hIdx]).toBe(bz.time.ganZhi.charAt(1));
    // 农历 五月初一 → 五月初二（日数与日柱同源，改前会停在初一）
    expect(xl.day).toBe(2);
    expect(currentQiMen(at, L).q.siZhu.day).toBe(bz.day.ganZhi);
  });
});

describe('口径开关只有一个来源（视图不得自行加减 8 或强关真太阳时）', () => {
  it('trueSolarTime:false 时五盘一起退回标准时（不是只有奇门退）', () => {
    const base = { year: 2026, month: 6, day: 15, hour: 12, minute: 0 };
    const off = { city: '拉萨', trueSolarTime: false } as never;
    const bz = paiBazi({ ...base, city: '拉萨', gender: '男', trueSolarTime: false } as never);
    const at = new Date(2026, 5, 15, 12, 0, 0, 0);
    const qm = currentQiMen(at, off);
    expect(qm.ts.usedTrueSolar).toBe(false);
    expect(qm.q.siZhu.time).toBe(bz.time.ganZhi);
    expect(xiaoLiuRenPan(at, off).ts.timeGanZhi).toBe(bz.time.ganZhi);
    expect(currentMeiHua(at, off).result.timeDetail!.hourBranchOrder).toBe(ZHI.indexOf(bz.time.ganZhi.charAt(1)) + 1);
    // 关掉后是钟面 12:00 的午时，而不是真太阳的巳时
    expect(bz.time.ganZhi.charAt(1)).toBe('午');
  });

  it('默认（不传 trueSolarTime）就是折真太阳时——奇门不再默认关', () => {
    const at = new Date(2026, 5, 15, 12, 0, 0, 0);
    const qm = currentQiMen(at, { city: '拉萨' } as never);
    expect(qm.ts.usedTrueSolar).toBe(true);
    expect(qm.q.siZhu.time.charAt(1)).toBe('巳');
  });

  it('lateZiMode:00 时五盘一起按子正换日', () => {
    const at = new Date(2026, 10, 21, 23, 30, 0, 0);
    const L = { city: '北京', lateZiMode: '00' } as never;
    const bz = paiBazi({ year: 2026, month: 11, day: 21, hour: 23, minute: 30, city: '北京', gender: '男', lateZiMode: '00' } as never);
    const qm = currentQiMen(at, L);
    expect(qm.q.siZhu.day).toBe(bz.day.ganZhi);
    expect(qm.q.siZhu.time).toBe(bz.time.ganZhi);
    expect(xiaoLiuRenPan(at, L).ts.dayGanZhi).toBe(bz.day.ganZhi);
    // 0 点口径下不换日 → 小六壬的农历日仍停在当日
    expect(xiaoLiuRenPan(at, L).ts.dayAdvanced).toBe(false);
  });

  it('resolvePaipanTime 的 pillarCalendar 只在换日时与 calendar 不同', () => {
    const beijing = resolvePaipanTime({ year: 2026, month: 6, day: 15, hour: 23, minute: 30, city: '北京' } as never);
    expect(beijing.pillarCalendar.nongli).not.toBe(beijing.calendar.nongli);
    const lhasa = resolvePaipanTime({ year: 2026, month: 6, day: 15, hour: 23, minute: 30, city: '拉萨' } as never);
    expect(lhasa.pillarCalendar.nongli).toBe(lhasa.calendar.nongli);
  });
});
