/**
 * 历法层：公历（北京时间）→ 四柱 + 日旬空
 *
 * 唯一历算依赖：lunar-javascript（6tail，MIT）。
 *
 * 关键口径（见《引擎对账报告_六爻.md》3.1 / 六节）：
 * - 年柱、月柱必须使用精确节气系列 API：getYearInGanZhiExact / getMonthInGanZhiExact。
 *   普通 API 在节气当天 0 点即换柱，立春/寒露等边界会差几个时辰。
 * - 日柱同样使用 Exact 系列；时柱用 getTimeInGanZhi（时辰按整点换界，23:00 进次日子时）。
 * - 旬空用 getDayXunKong()（日空亡；时空亡本项目不输出）。
 * - 晚子时（23:00–24:00）日柱归属：**口径已定（主人 2026-10-21）——按 23:00 换日**，
 *   即时柱进次日子时、日柱亦进次日。当前实现用 lunar-javascript `getDayInGanZhiExact()`
 *   （23:00 换日），与此口径一致；实测 2026-10-21 23:30 得己巳日甲子时，与 10-22 00:30 同日柱。
 *   另有以 00:00 换日的流派，本应用不采用，勿改回 setSect(2)。
 * - 真太阳时/经度校正不在本层处理，留给上层（UI/八字模块）。
 */
import { Solar } from 'lunar-javascript';
import type { DiZhi, SiZhu, SolarDateInput, TianGan } from './types.js';

export function solarToSiZhu(input: SolarDateInput): SiZhu {
  const { year, month, day, hour } = input;
  const minute = input.minute ?? 0;

  const lunar = Solar.fromYmdHms(year, month, day, hour, minute, 0).getLunar();

  const yearGanZhi = lunar.getYearInGanZhiExact();
  const monthGanZhi = lunar.getMonthInGanZhiExact();
  const dayGanZhi = lunar.getDayInGanZhiExact();
  const timeGanZhi = lunar.getTimeInGanZhi();
  const xk = lunar.getDayXunKong();
  const xunKong = [xk.charAt(0), xk.charAt(1)] as [DiZhi, DiZhi];

  return {
    year,
    month,
    day,
    hour,
    minute,
    lunarText: lunar.toString(),
    yearGanZhi,
    monthGanZhi,
    dayGanZhi,
    timeGanZhi,
    dayGan: dayGanZhi.charAt(0) as TianGan,
    dayZhi: dayGanZhi.charAt(1) as DiZhi,
    monthZhi: monthGanZhi.charAt(1) as DiZhi,
    xunKong,
  };
}

/** 钦天监首页日历摘要：农历串、建除、上一/下一节气 */
export interface DayCalendar {
  nongli: string;         // 如 丙午年九月初九
  jianchu: string;        // 建除十二神：建/除/满…
  prevJieqi: string;      // 上一节气名
  nextJieqi: string;      // 下一节气名
  nextJieqiDate: string;  // 下一节气公历日期 YYYY-MM-DD
  daysToNextJieqi: number;// 距下一节气的整天数（今日为0，明日为1…）
  nextIsJie: boolean;     // 下一节气是「节」（月建分界）还是「气」（月中）
  yearGanZhiExact: string;
  monthGanZhiExact: string;
}

export function getDayCalendar(input: SolarDateInput): DayCalendar {
  const { year, month, day, hour } = input;
  const minute = input.minute ?? 0;
  const lunar = Solar.fromYmdHms(year, month, day, hour, minute, 0).getLunar();
  const prev = lunar.getPrevJieQi();
  const next = lunar.getNextJieQi();
  // lunar-typescript 的 JieQi 类型声明未暴露 getSolar/isJie，运行时可用，做断言
  const nextAny = next as unknown as {
    getSolar(): { getYear(): number; getMonth(): number; getDay(): number };
    isJie(): boolean;
  };
  const nextSolar = nextAny.getSolar();
  const nextDate = new Date(nextSolar.getYear(), nextSolar.getMonth() - 1, nextSolar.getDay());
  const todayDate = new Date(year, month - 1, day);
  // 整天差：按公历日期相减（与具体时分无关），今日交节为 0
  const daysToNextJieqi = Math.round((nextDate.getTime() - todayDate.getTime()) / 86400000);
  return {
    nongli: `${lunar.getYearInGanZhiExact()}年${lunar.getMonthInChinese()}月${lunar.getDayInChinese()}`,
    jianchu: lunar.getZhiXing(),
    prevJieqi: prev.getName(),
    nextJieqi: next.getName(),
    nextJieqiDate: `${nextSolar.getYear()}-${String(nextSolar.getMonth()).padStart(2, '0')}-${String(nextSolar.getDay()).padStart(2, '0')}`,
    daysToNextJieqi,
    nextIsJie: nextAny.isJie(),
    yearGanZhiExact: lunar.getYearInGanZhiExact(),
    monthGanZhiExact: lunar.getMonthInGanZhiExact(),
  };
}

// 未来 N 天内的所有节气（节+气）时间线。
export interface JieqiItem {
  name: string;          // 节气名 (立春/雨水/...)
  kind: 'jie' | 'qi';   // 节 (single month start) or 气 (mid-month)
  solarDate: string;     // YYYY-MM-DD
  jd: number;            // 近似儒略日（用 Solar.toYmd 推算，精度到天）
  isToday: boolean;
}
export function listJieqiInRange(from: { year: number; month: number; day: number }, days: number): JieqiItem[] {
  const fromDate = new Date(from.year, from.month - 1, from.day);
  const toDate = new Date(fromDate.getTime() + days * 86400000);
  const items: JieqiItem[] = [];

  // 起点前推15天确保能 catch 到第一个节气
  const anchor = new Date(fromDate.getTime() - 15 * 86400000);

  // 逐步迭代：每次取当前 Lunar 的 nextJieQi，取到后跳到该节气后一天重新取 Lunar
  const seen = new Set<string>();
  let curYear = anchor.getFullYear();
  let curMonth = anchor.getMonth() + 1;
  let curDay = anchor.getDate();

  for (let i = 0; i < 30; i++) {
    const lunar = Solar.fromYmdHms(curYear, curMonth, curDay, 12, 0, 0).getLunar();
    const nextJq: any = lunar.getNextJieQi();
    if (!nextJq) break;
    const name: string = nextJq.getName();
    const solarObj = nextJq.getSolar();
    const dateStr: string = solarObj.toYmd(); // "2024-01-06" or "20240106" depending on version
    if (seen.has(dateStr + name)) {
      // 已经见过，跳到下一天重试
      const d = new Date(curYear, curMonth - 1, curDay + 1);
      curYear = d.getFullYear(); curMonth = d.getMonth() + 1; curDay = d.getDate();
      continue;
    }
    seen.add(dateStr + name);
    // 解析日期：兼容 "2024-01-06" 和 "20240106" 两种格式
    const parts = dateStr.includes('-') ? dateStr.split('-') : [dateStr.slice(0,4), dateStr.slice(4,6), dateStr.slice(6,8)];
    const [y, m, d] = parts.map(Number);
    const dt = new Date(y, m - 1, d);
    if (dt > toDate) break;
    if (dt >= fromDate) {
      items.push({
        name,
        kind: nextJq.isJie() ? 'jie' : 'qi',
        solarDate: `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`,
        jd: 0,
        isToday: y === from.year && m === from.month && d === from.day,
      });
    }
    // 跳到该节气后一天继续
    const nd = new Date(y, m - 1, d + 1);
    curYear = nd.getFullYear(); curMonth = nd.getMonth() + 1; curDay = nd.getDate();
  }
  return items;
}
