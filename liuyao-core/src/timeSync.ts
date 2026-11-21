/**
 * 排盘时间同步层（timeSync）—— 供**前端独占盘**（大六壬等）复用的唯一时间入口
 *
 * 为什么要有这一层：
 *   第八轮审计（audit4/r2_crosspan）实测：大六壬是唯一没接统一时间层的盘。
 *   它在 `app/js/daliurenview.js` 里自己 `at.getHours()` 取钟面小时、直接喂
 *   `solarToSiZhu`，于是三件事一起错：
 *     1. 不折真太阳时（拉萨 12:00 课给壬午、八字给辛巳）；
 *     2. 按钟表 23:00 换日（拉萨 23:30 课已辛酉、八字仍庚申）；
 *     3. 盘内自相矛盾（沈阳 1988 夏令时 13:30：时支取钟面 13 → 未，
 *        时干支却按已减 1h 的 12:30 → 甲午）。
 *   根因不是算法，是「又写了一份时间逻辑」。这里把时间折算 + 四柱一次算完，
 *   前端只读结果，杜绝第二份口径。
 *
 * 口径（与 bazi.ts / calendar.ts 严格同源，勿改）：
 *   - 时区 / 历史时区（1912–1949 五时区）/ 夏令时 / 真太阳时：全部走 `civilForPaipan`
 *     → `resolveTime`。**不在本文件里做任何加减**。
 *   - 四柱：把折算后的钟面（`civilForPaipan` 的 civil）交给 `solarToSiZhu`，
 *     并且 **`applyChinaDst: false`** —— 夏令时已在 resolveTime 里扣过一次，
 *     再扣就是「减两遍」（老 bug 类型）。
 *   - 换日：`getDayInGanZhiExact` = **23:00 子初换日**，与八字/六爻/奇门/流注同一行代码。
 *   - 占时支**恒取时柱的地支**（不是从小时数除 2），所以日柱、时柱、占时三者必然同源。
 *   - 农历/建除/节气：`getDayCalendar` 吃同一份折算后钟面，不再二次折真太阳时。
 */
import { civilForPaipan } from './timeContext.js';
import type {
  CivilTime, LateZiMode, PaipanCivil, TimeResolution, TimeResolveInput,
} from './timeContext.js';
import { getDayCalendar, solarToSiZhu } from './calendar.js';
import type { DayCalendar } from './calendar.js';
import { mergeWarnings } from './validate.js';

const ZHI = ['子', '丑', '寅', '卯', '辰', '巳', '午', '未', '申', '酉', '戌', '亥'] as const;

export interface PaipanTimeState {
  /** 用户录入的民用钟面（夏令时未扣、未折真太阳时） */
  clock: CivilTime;
  /** 排盘该用的钟面：夏令时已还原、已折真太阳时（'00' 口径的 23:xx 已拨回同日 00:xx） */
  civil: PaipanCivil;
  /** 标准时（只扣夏令时） */
  standard: CivilTime | null;
  /** 真太阳时（未给经度时为 null） */
  trueSolar: CivilTime | null;
  /** UTC 绝对时刻（星历、太阳黄经、复现码一律用它） */
  utc: CivilTime | null;
  /** UTC 毫秒（无时区线索时为 null） */
  utcMs: number | null;
  /** 生效时区偏移（含夏令时，小时） */
  utcOffsetHours: number | null;
  /** 是否命中夏令时 */
  inDst: boolean;
  /** 是否用上了真太阳时 */
  usedTrueSolar: boolean;
  /** 折算后的日期是否已不是录入日期（真太阳时/标准时跨日） */
  crossedDay: boolean;
  /** 23:00 子初换日是否已把日柱推进到次日 */
  dayAdvanced: boolean;
  /** 是否按 0 点子正口径把 23:xx 拨回当日早子时 */
  lateZiApplied: boolean;
  /** 本次生效的换日口径 */
  lateZiMode: LateZiMode;

  // —— 四柱（与 paiBazi 同源同刻，逐字可对）——
  yearGanZhi: string;
  monthGanZhi: string;
  dayGanZhi: string;
  timeGanZhi: string;
  dayGan: string;
  dayZhi: string;
  /** 时支（字）—— 占时以此为准 */
  timeZhi: string;
  /** 时支序号 0=子 … 11=亥 */
  timeZhiIndex: number;

  /** 农历 / 建除 / 前后节气（吃同一份折算后钟面） */
  calendar: DayCalendar;
  /**
   * 与**日柱同一天**的历法（农历月/日、节气）。
   *
   * 与 `calendar` 的唯一差别：23:00 子初换日已把日柱推进次日时（`dayAdvanced`），
   * 这里给的也是次日的农历。小六壬按「农历月 + 农历日 + 时支」起课，日数必须与日柱同源，
   * 否则 23:30 会拿「初一」的日数配「初二」的日柱（差一天，课就不同）。
   * 不用 23 点换日的盘（以及 0 点子正口径）两者相等。
   */
  pillarCalendar: DayCalendar;
  /** 全部口径提示（校验 + 时区 + 历史时区 + 夏令时 + 经纬度冲突） */
  warnings: string[];
  /** 原始时间解析结果（无时区线索时为 null） */
  resolution: TimeResolution | null;
}

/**
 * 统一排盘时间解析：民用钟面 + 出生地 → 折算钟面 / UTC / 真太阳时 / 四柱 / 占时支。
 *
 * 纯函数：不读时钟、不读存储、不碰 DOM；同一入参永远同一结果。
 * 不带任何地点线索（city / place / utcOffsetHours / 经纬度）时，`civilForPaipan`
 * 原样返回录入钟面，行为与「不接时间层」的旧实现逐字节一致——保证既有调用方零影响。
 */
export function resolvePaipanTime(input: TimeResolveInput): PaipanTimeState {
  const eff = civilForPaipan(input, { yearRange: 'calendar', label: '排盘时间' });
  const civil = eff.civil;

  // 关键：civilForPaipan 交出来的钟面已经折过夏令时与真太阳时，
  // 这里必须关掉 solarToSiZhu 自带的中国夏令时还原，否则 DST 被减两遍。
  const sz = solarToSiZhu(civil, { applyChinaDst: false });

  // 当日自然日（12:00）的日柱：用来判断 23:00 换日是否已把日柱推进到次日。
  // 只在「折算后钟面时刻 ≥ 23 点」时才可能不同，其余情况跳过（省一次历算）。
  let dayAdvanced = false;
  if (civil.hour >= 23) {
    try {
      const base = solarToSiZhu({
        year: civil.year, month: civil.month, day: civil.day, hour: 12, minute: 0, second: 0,
      }, { applyChinaDst: false });
      dayAdvanced = base.dayGanZhi !== sz.dayGanZhi;
    } catch {
      dayAdvanced = false;
    }
  }

  const cal = getDayCalendar({
    year: civil.year, month: civil.month, day: civil.day,
    hour: civil.hour, minute: civil.minute ?? 0, second: civil.second ?? 0,
  });

  // 日柱所属日的历法：23:00 子初换日已把日柱归到次日时，农历月/日也要归次日。
  // 只推进「一整个自然日」（UTC 日粒度，不受本机时区与夏令时影响），不做任何时分折算。
  let pillarCal = cal;
  if (dayAdvanced) {
    const n = new Date(Date.UTC(civil.year, civil.month - 1, civil.day) + 86400000);
    pillarCal = getDayCalendar({
      year: n.getUTCFullYear(), month: n.getUTCMonth() + 1, day: n.getUTCDate(),
      hour: 12, minute: 0, second: 0,
    });
  }

  const r = eff.resolution;
  const clock: CivilTime = {
    year: Number(input.year), month: Number(input.month), day: Number(input.day),
    hour: Number(input.hour), minute: Number.isFinite(input.minute as number) ? (input.minute as number) : 0,
    second: Number.isFinite(input.second as number) ? (input.second as number) : 0,
  };

  return {
    clock,
    civil,
    standard: r ? r.standard : null,
    trueSolar: r ? r.trueSolar : null,
    utc: r ? r.utc : null,
    utcMs: r ? r.utcMs : null,
    utcOffsetHours: r ? r.utcOffsetHours : null,
    inDst: !!(r && r.inDst),
    usedTrueSolar: !!eff.usedTrueSolar,
    crossedDay: eff.crossedDay,
    dayAdvanced,
    lateZiApplied: eff.lateZiApplied,
    lateZiMode: eff.lateZiMode,
    yearGanZhi: sz.yearGanZhi,
    monthGanZhi: sz.monthGanZhi,
    dayGanZhi: sz.dayGanZhi,
    timeGanZhi: sz.timeGanZhi,
    dayGan: sz.dayGanZhi.charAt(0),
    dayZhi: sz.dayGanZhi.charAt(1),
    timeZhi: sz.timeGanZhi.charAt(1),
    timeZhiIndex: ZHI.indexOf(sz.timeGanZhi.charAt(1) as (typeof ZHI)[number]),
    calendar: cal,
    pillarCalendar: pillarCal,
    warnings: mergeWarnings(eff.warnings, r ? r.warnings : []),
    resolution: r,
  };
}
