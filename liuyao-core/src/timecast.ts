/**
 * 天时起卦层：梅花易数·时间起卦（正统）
 *
 * 规则（先天八卦数）：
 *   年数 = 年支序数（子1…亥12）
 *   月数 = 农历月（正1…腊12；闰月按当月，lunar-javascript getMonth 含正负，取绝对值）
 *   日数 = 农历日（1…30）
 *   时数 = 时辰支序数（子1…亥12）
 *   上卦 = (年+月+日) % 8，余 0 作 8
 *   下卦 = (年+月+日+时) % 8，余 0 作 8
 *   动爻 = (年+月+日+时) % 6，余 0 作 6（自下而上第几位）
 * 先天卦序：乾1 兑2 离3 震4 巽5 坎6 艮7 坤8
 *
 * 口径说明：
 * - 这是"按天时成卦"，结果只取决于时刻，不含随机数；一时辰内卦象不变，在时辰交界换卦。
 * - 年月日时取"真太阳时"后再排（默认不校正；上层可先做经度校正再传入，或给 longitude）。
 * - 晚子时(23-24)：按 23:00 换日——时辰进次日子时，农历月日亦整体进次日
 *   （与 calendar.ts 已定口径一致；另有 00:00 换日流派，本应用不采用）。
 */
import { Solar } from 'lunar-javascript';
import type { CastResult, YaoValue } from './types.js';
import { normalizeValuesToCast } from './input.js';
import {
  civilForPaipan, lateZiLabel,
  type LateZiMode, type PaipanCivil, type TimeResolveInput,
} from './timeContext.js';
import { InvalidDateError, mergeWarnings } from './validate.js';

export interface TimeCastOptions {
  /** 出生地/所在地经度（东经为正）。传入则先做真太阳时校正再排卦。 */
  longitude?: number;
  /** 已校正过的真太阳时可直接传 true 关闭内部二次校正。默认 false。 */
  alreadyApparent?: boolean;
  /** 以下为「接统一时间层」用：给了就按城市/经纬度/显式时区整体折算（含夏令时） */
  city?: string;
  place?: string;
  lat?: number;
  latitude?: number;
  lon?: number;
  lonEast?: number;
  utcOffsetHours?: number;
  tzPolicy?: 'estimate' | 'strict';
  lateZiMode?: LateZiMode;
}

export interface TimeCastResult {
  cast: CastResult;
  upperNumber: number; // 上卦先天数 1-8
  lowerNumber: number; // 下卦先天数 1-8
  movingPosition: number; // 动爻 1-6（自下而上）
  yearBranchOrder: number;
  lunarMonth: number;
  lunarDay: number;
  hourBranchOrder: number;
  apparentSolarTime: Date; // 实际用于起卦的真太阳时（未校正则等于传入时刻）
  /** 实际用于起卦的钟面时间（接统一时间层时给出） */
  civil?: PaipanCivil;
  /** 换日口径标注 */
  dayBoundary?: string;
  /** 时间口径提示（时区估算、冲突、夏令时） */
  timeWarnings?: string[];
  /** 入参校验/口径提示（小数时间取整、历史时区、strict:false 的 0 点回退） */
  warnings?: string[];
}


const ZHI_ORDER: Record<string, number> = {
  子: 1, 丑: 2, 寅: 3, 卯: 4, 辰: 5, 巳: 6,
  午: 7, 未: 8, 申: 9, 酉: 10, 戌: 11, 亥: 12,
};

// 先天八卦数 → 该经卦自下而上三爻（index0=初爻；true 阳 / false 阴）
const XIANTIAN_LINES: Record<number, boolean[]> = {
  1: [true, true, true],    // 乾 ☰ 111
  2: [true, true, false],   // 兑 ☱ 110（上缺）
  3: [true, false, true],   // 离 ☲ 101（中虚）
  4: [true, false, false],  // 震 ☳ 100（仰盂，初爻阳）
  5: [false, true, true],   // 巽 ☴ 011（下断）
  6: [false, true, false],  // 坎 ☵ 010（中满）
  7: [false, false, true],  // 艮 ☶ 001（覆碗，上爻阳）
  8: [false, false, false], // 坤 ☷ 000
};

/**
 * 真太阳时校正（经度均时差近似版）。
 * 只校正经度差；不做 equation-of-time 精修（年内 ±16 分钟，对"时辰换界"只在边界几分钟有影响，
 * 排八字/占星模块可再精修）。东经为正，标准经线按 UTC+8 = 120°。
 */
export function toApparentSolarTime(date: Date, longitude: number, standardMeridian = 120): Date {
  const offsetMin = (longitude - standardMeridian) * 4; // 1° = 4 分钟
  return new Date(date.getTime() + offsetMin * 60_000);
}

/** 梅花易数·时间起卦。date 为该时刻（默认按北京时间解释；给 longitude 则先做真太阳时校正）。 */
export function castByTime(dateInput: number | Date, options: TimeCastOptions = {}): TimeCastResult {
  const original = typeof dateInput === 'number' ? new Date(dateInput) : dateInput;
  // 统一校验：非法时刻（NaN / 非 Date）直接拒，不静默变成 1970 或 Invalid Date 的各字段 NaN
  if (!(original instanceof Date) || !Number.isFinite(original.getTime())) {
    throw new InvalidDateError(`起卦时刻无效：收到 ${String(dateInput)}（需要有效的 Date 或毫秒时间戳）`);
  }

  // ---- 新路径：给了城市/经纬度/显式时区 → 整体走统一时间层（含夏令时、时区推算）----
  const hasTzLayer = options.city != null || options.place != null
    || options.utcOffsetHours != null
    || [options.lat, options.latitude, options.lon, options.lonEast].some((v) => typeof v === 'number' && Number.isFinite(v));
  if (hasTzLayer) {
    const eff = civilForPaipan({
      year: original.getFullYear(),
      month: original.getMonth() + 1,
      day: original.getDate(),
      hour: original.getHours(),
      minute: original.getMinutes(),
      second: original.getSeconds(),
      city: options.city,
      place: options.place,
      lat: options.lat,
      latitude: options.latitude,
      lon: options.lon ?? options.longitude,
      lonEast: options.lonEast,
      utcOffsetHours: options.utcOffsetHours,
      // 调用方已做过真太阳时校正（applyTst/applyTstAt）时，别二次校正
      trueSolarTime: options.alreadyApparent ? false : undefined,
      tzPolicy: options.tzPolicy,
      lateZiMode: options.lateZiMode,
    }, { yearRange: 'calendar', label: '起卦时间' });
    const c = eff.civil;
    const core = castFromClock(c.year, c.month, c.day, c.hour, c.minute ?? 0, c.second ?? 0, eff.lateZiMode, eff.switchCivil);
    // 展示用的「真太阳时」：把折算后的墙钟重新装成 Date（仅供界面显示，不参与计算）
    const shown = new Date(c.year, c.month - 1, c.day, c.hour, c.minute ?? 0, 0);
    return {
      ...core,
      apparentSolarTime: shown,
      civil: c,
      dayBoundary: lateZiLabel(eff.lateZiMode),
      timeWarnings: eff.resolution ? eff.resolution.warnings : [],
      warnings: mergeWarnings(eff.warnings, eff.resolution?.warnings),
    };
  }

  const apparent =
    options.longitude !== undefined && !options.alreadyApparent
      ? toApparentSolarTime(original, options.longitude)
      : new Date(original.getTime());

  // 用校正在同一 UTC+8 时区下表达：lunar-javascript 按"本地时钟分量"取年月日时，
  // 运行环境时区可能不是东八区，因此显式按 +8 取墙钟分量。
  const bj = new Date(apparent.getTime() + 8 * 3600_000);
  const core = castFromClock(
    bj.getUTCFullYear(), bj.getUTCMonth() + 1, bj.getUTCDate(),
    bj.getUTCHours(), bj.getUTCMinutes(), bj.getUTCSeconds(),
    options.lateZiMode,
  );
  return { ...core, apparentSolarTime: apparent };
}

/** 由已定好的钟面分量起卦（castByTime 的内部实现） */
function castFromClock(
  y: number, mo: number, d: number, hh: number, mm: number, ss: number,
  lateZiMode?: LateZiMode,
  /** 年支判定用的绝对时刻钟面（东八区）。传了就按它取年支（不随经度平移、不做 23 点进位） */
  jqClock?: PaipanCivil,
): Omit<TimeCastResult, 'apparentSolarTime' | 'civil' | 'dayBoundary' | 'timeWarnings'> {
  const solar = Solar.fromYmdHms(y, mo, d, hh, mm, ss);
  const lunar = solar.getLunar();

  // 晚子时换日：'23' 口径下年支与农历月日整体进次日（与日柱口径一致），
  // 时支仍取本时刻（lunar-javascript 已按 23:00 进子时，时干按次日日干）。
  // 取次日时必须把时分归零：solar.next(1) 会保留 23:30，得到的是「次日 23:30」，
  // 立春前夜（如 2026-02-03 23:30）就此越过立春，年支错成丙午。
  // 归零到次日 00:00 才是「归属次日」的本义，立春前仍属前一年（乙巳）。
  // '00' 口径（子正换日）下调用方已把 23:xx 拨成同日 00:xx，这里不能再进次日。
  const rollDay = hh === 23 && lateZiMode !== '00';
  const lunarBase = rollDay
    ? Solar.fromYmdHms(y, mo, d, 0, 0, 0).next(1).getLunar()
    : lunar;
  // 年支（立春为界）是节气量：给了绝对时刻钟面就按它判，否则退回旧的本机钟面口径
  const yearZhi = jqClock
    ? Solar.fromYmdHms(jqClock.year, jqClock.month, jqClock.day, jqClock.hour,
        jqClock.minute ?? 0, jqClock.second ?? 0).getLunar().getYearInGanZhiExact().charAt(1)
    : lunarBase.getYearInGanZhiExact().charAt(1);
  const hourZhi = lunar.getTimeInGanZhi().charAt(1);

  const yearBranchOrder = ZHI_ORDER[yearZhi];
  const lunarMonth = Math.abs(lunarBase.getMonth()); // 闰月按当月数
  const lunarDay = lunarBase.getDay();
  const hourBranchOrder = ZHI_ORDER[hourZhi];

  const sum = yearBranchOrder + lunarMonth + lunarDay;
  const upperNumber = sum % 8 === 0 ? 8 : sum % 8;
  const lowerRaw = (sum + hourBranchOrder) % 8;
  const lowerNumber = lowerRaw === 0 ? 8 : lowerRaw;
  const movingRaw = (sum + hourBranchOrder) % 6;
  const movingPosition = movingRaw === 0 ? 6 : movingRaw;

  // 拼六爻（自下而上）：下卦三爻 + 上卦三爻
  const lower = XIANTIAN_LINES[lowerNumber];
  const upper = XIANTIAN_LINES[upperNumber];
  const lines = [...lower, ...upper]; // index 0=初爻 … 5=上爻

  const yaoValues: YaoValue[] = lines.map((isYang, i) => {
    const isMoving = i + 1 === movingPosition;
    if (isYang) return (isMoving ? 9 : 7) as YaoValue;
    return (isMoving ? 6 : 8) as YaoValue;
  });

  const cast = normalizeValuesToCast(yaoValues, 'time');

  return {
    cast,
    upperNumber,
    lowerNumber,
    movingPosition,
    yearBranchOrder,
    lunarMonth,
    lunarDay,
    hourBranchOrder,
  };
}
