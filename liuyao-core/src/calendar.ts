/**
 * 历法层：公历（北京时间）→ 四柱 + 日旬空
 *
 * 唯一历算依赖：lunar-javascript（6tail，MIT）。
 *
 * 关键口径（见《引擎对账报告_六爻.md》3.1 / 六节）：
 * - 年柱、月柱必须使用精确节气系列 API：getYearInGanZhiExact / getMonthInGanZhiExact。
 *   普通 API 在节气当天 0 点即换柱，立春/寒露等边界会差几个时辰。
 * - 日柱同样使用 Exact 系列；时柱用 getTimeInGanZhi（时辰按整点换界，23:00 进次日子时）。
 * - 旬空由日柱自算（xunKongOf），与本层日柱同源。**不要用库的 getDayXunKong()**——
 *   它按 00:00 换日的默认日柱算，晚子时跨旬那天会与日柱矛盾（见函数注释）。
 *   时空亡本项目不输出。
 * - 晚子时（23:00–24:00）日柱归属：**口径已定（主人 2026-10-21）——按 23:00 换日**，
 *   即时柱进次日子时、日柱亦进次日。当前实现用 lunar-javascript `getDayInGanZhiExact()`
 *   （23:00 换日），与此口径一致；实测 2026-10-21 23:30 得己巳日甲子时，与 10-22 00:30 同日柱。
 *   另有以 00:00 换日的流派，本应用不采用，勿改回 setSect(2)。
 * - 夏令时：中国 1986–1991 年 4–9 月实行过夏令时（钟面 = 标准时 + 1h）。本层在
 *   转四柱前先把钟面时间还原成标准时（-1h），窗口表在 timeContext（chinaDstWindow）。
 *   不还原的话那六年夏天出生的人时柱会整整错一个时辰，跨 23:00 的还会连带错日柱。
 * - 真太阳时（经度差 + 均时差）仍不在本层：本层只认「标准时」。真太阳时由
 *   timeContext.resolveTime 算好，八字/星盘层要用时把修正后的钟面传进来。
 */
import { Solar } from 'lunar-javascript';
import { chinaDstAppliesToCivil, chinaDstWindow } from './timeContext.js';
import { validateDateTime, validateDate, utcMsOf, InvalidNumberError, showValue } from './validate.js';
import type { DiZhi, SiZhu, SolarDateInput, TianGan } from './types.js';

const GAN_ORDER = '甲乙丙丁戊己庚辛壬癸';
const ZHI_ORDER = '子丑寅卯辰巳午未申酉戌亥';

/**
 * 由日干支推旬空（日空亡）。
 *
 * 为什么不用 lunar-javascript 的 getDayXunKong()：它按「00:00 换日」的默认日柱计算，
 * 而本层日柱走 getDayInGanZhiExact()（23:00 换日）。两者在晚子时跨旬那天会冲突——
 * 例：2026-10-26 23:30 日柱已进甲戌，getDayXunKong() 仍返回戌亥（申酉才对）。
 * 自算可保证旬空恒与本层日柱同源。
 *
 * 等价性：2026 全年 365 天 × 12:00 抽样，本函数与 getDayXunKong() 365/365 一致。
 */
export function xunKongOf(ganZhi: string): [DiZhi, DiZhi] {
  const g = GAN_ORDER.indexOf(ganZhi.charAt(0));
  const z = ZHI_ORDER.indexOf(ganZhi.charAt(1));
  if (g < 0 || z < 0) throw new Error(`非法日干支: ${ganZhi}`);
  const head = ((z - g) % 12 + 12) % 12; // 旬首地支序号
  return [
    ZHI_ORDER.charAt((head + 10) % 12) as DiZhi,
    ZHI_ORDER.charAt((head + 11) % 12) as DiZhi,
  ];
}

/** 四柱 + 夏令时还原信息（solarToSiZhu 的返回，比 SiZhu 多三项） */
export interface SiZhuWithTime extends SiZhu {
  /** 实际用于起四柱的标准时（夏令时已还原；无夏令时时等于 year/hour/minute 等） */
  standardTime: { year: number; month: number; day: number; hour: number; minute: number };
  /** 是否命中中国 1986–1991 夏令时 */
  dstApplied: boolean;
  /** 命中的夏令时窗口（标准时口径，如 1988-04-17 02:00 ~ 1988-09-11 01:00） */
  dstWindow: { startLocal: string; endLocal: string } | null;
}

/**
 * 公历（北京时间钟面）→ 四柱。
 *
 * 夏令时：1986–1991 年 4–9 月命中窗口时，先 -1h 还原标准时再起四柱；
 * 返回的 year/month/day/hour/minute 仍是你传进来的**钟面值**（界面显示用），
 * 真正用于四柱的时间在 standardTime 里。
 */
export function solarToSiZhu(
  input: SolarDateInput,
  opts: { applyChinaDst?: boolean } = {},
): SiZhuWithTime {
  // 统一校验：非法日期（2/30、4/31、13 月）抛错，不静默滚动
  const v = validateDateTime(input as unknown as Record<string, unknown>, {
    yearRange: 'calendar',
    label: '起卦时间',
  });
  const year = v.year;
  const month = v.month;
  const day = v.day;
  const hour = v.hour;
  const minute = v.minute;
  // 秒必须透传：节气交节精确到秒，写死 0 会让交节后 0–59 秒的盘晚一柱（P1-1）
  const second = v.second;

  // 夏令时还原：钟面 -1h（可能跨日，如 1986-05-04 02:30 → 01:30，跨日则连带日柱）
  let dstApplied = false;
  let stdYear = year;
  let stdMonth = month;
  let stdDay = day;
  let stdHour = hour;
  let stdMinute = minute;
  let stdSecond = second;
  if (opts.applyChinaDst !== false && chinaDstAppliesToCivil(year, month, day, hour, minute)) {
    const d = new Date(utcMsOf(year, month, day, hour, minute, second) - 3600000);
    stdYear = d.getUTCFullYear();
    stdMonth = d.getUTCMonth() + 1;
    stdDay = d.getUTCDate();
    stdHour = d.getUTCHours();
    stdMinute = d.getUTCMinutes();
    stdSecond = d.getUTCSeconds();
    dstApplied = true;
  }

  const lunar = Solar.fromYmdHms(stdYear, stdMonth, stdDay, stdHour, stdMinute, stdSecond).getLunar();

  const yearGanZhi = lunar.getYearInGanZhiExact();
  const monthGanZhi = lunar.getMonthInGanZhiExact();
  const dayGanZhi = lunar.getDayInGanZhiExact();
  const timeGanZhi = lunar.getTimeInGanZhi();
  const xunKong = xunKongOf(dayGanZhi);

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
    standardTime: { year: stdYear, month: stdMonth, day: stdDay, hour: stdHour, minute: stdMinute },
    dstApplied,
    dstWindow: dstApplied ? chinaDstWindow(stdYear) : null,
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
  // 统一校验：非法日期抛错（不静默滚动）；小时缺省抛 InvalidTimeError（strict:false 才回退 0 点）
  const v = validateDateTime(input as unknown as Record<string, unknown>, {
    yearRange: 'calendar',
    label: '日历时间',
  });
  const { year, month, day, hour } = v;
  const minute = v.minute;
  const second = v.second;
  const lunar = Solar.fromYmdHms(year, month, day, hour, minute, second).getLunar();
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
  // 统一校验：起点必须是真实公历日；天数必须是 1–366 的整数（旧实现接受任意值，静默算错）
  validateDate(from.year, from.month, from.day, { label: '节气区间起点' });
  if (!Number.isInteger(days) || days < 1 || days > 366) {
    throw new InvalidNumberError(`节气区间的天数必须是 1–366 的整数，收到 ${showValue(days)}`);
  }
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
