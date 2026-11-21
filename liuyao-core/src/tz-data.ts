/**
 * 时区 / 夏令时覆盖表（**数据文件**，不含排盘逻辑）
 *
 * 为什么要单独一份：`timeContext.ts` 里的城市表是 2019 年前后整理的，近年多国改过
 * 夏令时规则，而底层又没有 `Intl` 时区库可用（纯离线、跨端一致优先）。数据一过期，
 * 四柱 / 命宫就整体差 1 小时，**且不报任何错**——这是最坏的失败模式。
 *
 * 设计：
 *  - 键 = IANA 时区名；城市表里该城市的 `dst` 写成 `TZ:<IANA>`，注册表命中即接管。
 *  - 窗口口径与 `dstWindowForYear()` 一致：**标准时墙钟毫秒** `[start, end)`，
 *    即「拨快那一刻的标准时」到「回拨那一刻的标准时」。
 *  - 只登记**确知其修订**的时区；登记后仍给出 `note`，由 `resolveTime()` 推入 warnings，
 *    保证「用的不是精确时区」这件事永远在告警里出现，不靠用户猜。
 *  - 每一条都注明年份区间；区间外的年份返回 `null` 并配 `note`（宁可提示，不可静默）。
 *
 * 口径来源：IANA tzdata 2025b + 各国法令新闻（埃及 2023 恢复、墨西哥 2022 取消、
 * 巴拉圭 2024 固定 -3、伊朗 2022 取消、约旦/叙利亚 2022 固定 +3、摩洛哥斋月回拨）。
 * 校验：`test/tz-overrides.test.ts` 用 Node `Intl` 逐条对拍（无 ICU 的时区单独标注）。
 */

export const TZ_DATA_VERSION = '2026.11';

export interface TzDstWindow {
  /** 拨快那一刻（标准时墙钟毫秒，用 Date.UTC 口径装墙钟分量） */
  start: number;
  /** 回拨那一刻（标准时墙钟毫秒） */
  end: number;
}

export interface TzOverride {
  /** 本表接管的最早年份；更早的年份返回 null 并提示 */
  since: number;
  /** 该年的夏令时窗口；null = 该年无夏令时 */
  windows: (year: number) => TzDstWindow | null;
  /** 该年是否需要「近似 / 历史规则不同 / 表未覆盖」告警 */
  note?: (year: number) => string | null;
}

const HOUR = 3600000;

/* ---------------- 墙钟工具（与 timeContext 同口径，但本文件自足，避免循环依赖） ---------------- */

function wallEpoch(y: number, mo: number, d: number, h = 0, mi = 0): number {
  return Date.UTC(y, mo - 1, d, h, mi, 0);
}

/** 某年某月第 n 个周日（n=1..5） */
function nthSunday(year: number, month: number, n: number): number {
  const firstDow = new Date(Date.UTC(year, month - 1, 1)).getUTCDay();
  const firstSunday = 1 + ((7 - firstDow) % 7);
  return firstSunday + (n - 1) * 7;
}

/** 某年某月最后一个周日 */
function lastSunday(year: number, month: number): number {
  const lastDay = new Date(Date.UTC(year, month, 0)).getUTCDate();
  const lastDow = new Date(Date.UTC(year, month - 1, lastDay)).getUTCDay();
  return lastDay - lastDow;
}

/** 某年某月最后一个指定星期（dow：0=周日 … 6=周六） */
function lastWeekday(year: number, month: number, dow: number): number {
  const lastDay = new Date(Date.UTC(year, month, 0)).getUTCDate();
  const lastDow = new Date(Date.UTC(year, month - 1, lastDay)).getUTCDay();
  return lastDay - ((lastDow - dow + 7) % 7);
}

/* ============================================================
   一、埃及：2023 年恢复夏令时
   ------------------------------------------------------------
   2023-04 起：4 月最后一个周五 00:00 拨到 01:00，
   10 月最后一个周四 24:00 回拨到 23:00。
   2015–2022 明确无夏令时（2014 年及以前有，日期历年不同）。
   ============================================================ */
function egyptWindows(y: number): TzDstWindow | null {
  if (y < 2023) return null;
  return {
    start: wallEpoch(y, 4, lastWeekday(y, 4, 5), 0, 0), // 4 月最后一个周五 00:00 标准时
    end: wallEpoch(y, 10, lastWeekday(y, 10, 4), 23, 0), // 10 月最后一个周四 24:00 夏令时 = 23:00 标准时
  };
}

function egyptNote(y: number): string | null {
  if (y < 1990) return null;
  if (y < 2015) return '埃及 2014 年及以前有夏令时（起止日期历年不同），本表只覆盖 2023 年后规则，此年可能差 1 小时';
  if (y <= 2022) return null; // 2015–2022 确实没有夏令时，不必打扰
  return '埃及 2023 年恢复夏令时（4 月最后一个周五起、10 月最后一个周四止），已按恢复后规则计算';
}

/* ============================================================
   二、摩洛哥：2018 年起常年 UTC+1，仅斋月回拨到 UTC+0
   ------------------------------------------------------------
   城市表里卡萨布兰卡的标准偏移记 0，用一个「跨年窗口」代表**非斋月**那一段
   （[上一年斋月结束, 本年斋月开始)），于是斋月里 inDst=false → UTC+0，
   其余时间 inDst=true → UTC+1。与「常年 +1 + 斋月 -1」等价，
   因为引擎只会 +1，不会 -1。
   ============================================================ */
/** 斋月（公历，含首尾日；±1 天属正常教法差异） */
const RAMADAN: Record<number, [number, number, number, number]> = {
  // 年: [起月, 起日, 止月, 止日]
  2019: [5, 6, 6, 4],
  2020: [4, 24, 5, 23],
  2021: [4, 13, 5, 12],
  2022: [4, 2, 5, 1],
  2023: [3, 23, 4, 20],
  2024: [3, 11, 4, 9],
  2025: [3, 1, 3, 30],
  2026: [2, 18, 3, 19],
  2027: [2, 8, 3, 9],
  2028: [1, 28, 2, 26],
  2029: [1, 16, 2, 14],
  2030: [1, 5, 2, 3],
};
const RAMADAN_MIN = 2019;
const RAMADAN_MAX = 2030;

function moroccoWindows(y: number): TzDstWindow | null {
  if (y <= RAMADAN_MIN || y > RAMADAN_MAX) {
    // 只有 2019 之后的年份才拿得到「上一年斋月结束」
    return null;
  }
  const prev = RAMADAN[y - 1];
  const cur = RAMADAN[y];
  if (!prev || !cur) return null;
  return {
    start: wallEpoch(y - 1, prev[2], prev[3], 2, 0), // 斋月结束回拨到 +1 的那一刻（标准时 02:00）
    end: wallEpoch(y, cur[0], cur[1], 3, 0), // 斋月开始回拨到 +0 的那一刻（标准时 03:00）
  };
}

function moroccoNote(y: number): string | null {
  if (y < RAMADAN_MIN + 1) {
    return '摩洛哥 2018 年起为「常年 UTC+1、斋月回拨 UTC+0」；2018 年前是 UTC+0 加 3–10 月夏令时，此年可能差 1 小时';
  }
  if (y > RAMADAN_MAX) return '摩洛哥斋月表只覆盖到 2030 年，此后斋月回拨未纳入，可能差 1 小时';
  return '摩洛哥常年 UTC+1，斋月期间回拨 UTC+0（斋月起止按公历表，与实际公告可能差 1 天）';
}

/* ============================================================
   三、墨西哥：2022 年 10 月起取消全国夏令时（边境城市仍随美国）
   ============================================================ */
function mexicoWindows(y: number): TzDstWindow | null {
  if (y >= 2023) return null; // 取消后
  return {
    start: wallEpoch(y, 4, nthSunday(y, 4, 1), 2, 0), // 4 月第一个周日 02:00 标准时
    end: wallEpoch(y, 10, lastSunday(y, 10), 1, 0), // 10 月最后一个周日 02:00 夏令时 = 01:00 标准时
  };
}

function mexicoNote(y: number): string | null {
  if (y >= 2023) return '墨西哥 2022 年 10 月起取消全国夏令时（仅北部边境城市仍随美国）';
  if (y < 1996) return '墨西哥 1996 年前夏令时起止不同，本表按 1996–2022 规则近似，可能差 1 小时';
  return '墨西哥 2023 年前有夏令时（4 月第一个周日—10 月最后一个周日），已按旧规则计算';
}

/* ============================================================
   四、伊朗：2022 年起取消夏令时（此前 3/21–9/21 近似）
   ============================================================ */
function iranWindows(y: number): TzDstWindow | null {
  if (y >= 2022) return null;
  if (y < 1979) return null;
  return {
    start: wallEpoch(y, 3, 21, 0, 0), // 伊朗历 1 月 1 日 ≈ 3/21
    end: wallEpoch(y, 9, 21, 0, 0), // 伊朗历 6 月末 ≈ 9/21
  };
}

function iranNote(y: number): string | null {
  if (y >= 2022) return '伊朗 2022 年起取消夏令时（全年 UTC+03:30）';
  if (y < 1979) return null;
  return '伊朗 2022 年前有夏令时；起止随伊朗历浮动，本表按 3/21–9/21 近似（±1 天）';
}

/* ============================================================
   五、约旦 / 叙利亚：2022 年 10 月起固定 UTC+3
   ============================================================ */
function levantWindows(y: number): TzDstWindow | null {
  // 2022 年 10 月起约旦/叙利亚全年固定 +3，表内 base 就是 +3，故不再有夏令时窗口。
  // 2022 年之前是「+2 冬季 / +3 夏令时」，而本模型的窗口只能表达「base+1」，
  // 用 base=+3 硬套会把冬夏各推高 1 小时——宁可不回溯，只在 note 里说清楚（见 levantNote）。
  if (y >= 2022) return null;
  return null;
}

function levantNote(place: string) {
  return (y: number): string | null => {
    if (y >= 2022) return `${place} 2022 年 10 月起固定 UTC+3（取消夏令时）`;
    return `${place} 2022 年前为 UTC+2 + 夏令时，本表未回溯该规则：此年偏移可能差 1 小时，请按当地历史法规核对`;
  };
}

/* ============================================================
   六、巴拉圭：2024 年 10 月起永久 UTC-3（原本 -4 + 夏令时 -3）
   ============================================================ */
function paraguayWindows(y: number): TzDstWindow | null {
  if (y >= 2025) return { start: wallEpoch(y, 1, 1), end: wallEpoch(y + 1, 1, 1) }; // 全年 +1
  if (y === 2024) return { start: wallEpoch(2024, 10, nthSunday(2024, 10, 1), 0), end: wallEpoch(2025, 1, 1) };
  return {
    start: wallEpoch(y, 10, nthSunday(y, 10, 1), 0, 0),
    end: wallEpoch(y + 1, 3, nthSunday(y + 1, 3, 4), 0, 0),
  };
}

function paraguayNote(y: number): string | null {
  if (y >= 2025) return '巴拉圭 2024 年 10 月起永久 UTC-3（不再回拨），本表按全年夏令时口径处理';
  if (y < 2013) return '巴拉圭 2013 年前夏令时起止不同，本表按 2013–2023 规则近似，可能差 1 小时';
  return '巴拉圭 2023 年前为 UTC-4 + 夏令时（10 月第一个周日—次年 3 月第四个周日）';
}

/* ============================================================
   七、智利：2022 年起规则稳定（此前 2016–2021 多次调整）
   ============================================================ */
function chileWindows(y: number): TzDstWindow | null {
  return {
    start: wallEpoch(y, 9, nthSunday(y, 9, 1), 0, 0), // 9 月第一个周六 24:00 = 周日 00:00
    end: wallEpoch(y + 1, 4, nthSunday(y + 1, 4, 1), 0, 0), // 4 月第一个周六 24:00
  };
}

function chileNote(y: number): string | null {
  if (y < 2022) return '智利 2016–2021 夏令时起止多次调整，本表按 2022 年后规则近似，可能差 1 小时';
  return '智利夏令时：9 月第一个周六 24:00 起、次年 4 月第一个周六 24:00 止';
}

/* ============================================================
   八、黎巴嫩：随欧盟规则，但 2023 年 3 月曾短暂取消
   ============================================================ */
function lebanonWindows(y: number): TzDstWindow | null {
  const h = 3; // 01:00 UTC + UTC+2 = 03:00 标准时墙钟
  return {
    start: wallEpoch(y, 3, lastSunday(y, 3), h, 0),
    end: wallEpoch(y, 10, lastSunday(y, 10), h, 0),
  };
}

function lebanonNote(y: number): string | null {
  if (y === 2023) return '黎巴嫩 2023 年 3 月 26–29 日曾单方面推迟夏令时又撤销，本表按常规欧盟规则处理（仅影响这 3 天）';
  if (y < 1993) return null;
  return '黎巴嫩随欧盟夏令时规则（3 月最后一个周日—10 月最后一个周日）';
}

/* ============================================================
   注册表
   ============================================================ */
export const TZ_OVERRIDES: Record<string, TzOverride> = {
  'Africa/Cairo': { since: 2023, windows: egyptWindows, note: egyptNote },
  'Africa/Casablanca': { since: 2018, windows: moroccoWindows, note: moroccoNote },
  'Africa/El_Aaiun': { since: 2018, windows: moroccoWindows, note: moroccoNote },
  'America/Mexico_City': { since: 1996, windows: mexicoWindows, note: mexicoNote },
  'America/Monterrey': { since: 1996, windows: mexicoWindows, note: mexicoNote },
  'Asia/Tehran': { since: 1979, windows: iranWindows, note: iranNote },
  'Asia/Amman': { since: 2014, windows: levantWindows, note: levantNote('约旦') },
  'Asia/Damascus': { since: 2014, windows: levantWindows, note: levantNote('叙利亚') },
  'America/Asuncion': { since: 2013, windows: paraguayWindows, note: paraguayNote },
  'America/Santiago': { since: 2022, windows: chileWindows, note: chileNote },
  'Asia/Beirut': { since: 1993, windows: lebanonWindows, note: lebanonNote },
};

/** 是否有该时区的覆盖数据（没有 = 城市表里的通用规则） */
export function hasTzOverride(tz: string): boolean {
  return Object.prototype.hasOwnProperty.call(TZ_OVERRIDES, tz);
}

/**
 * 该时区该年的夏令时窗口（标准时墙钟口径）。
 * - 返回 `undefined`：**本表不管**这个时区/这个年份（调用方应回落到通用规则）
 * - 返回 `null`：该年**确定**没有夏令时（例如伊朗 2022 年起取消、约旦 2022 起固定 +3）
 *
 * 注意 `since` 之前的年份必须返回 `undefined` 而不是 `null`：1990 年代各国夏令时规则
 * 与今天不同，本表没有那一段数据。若返回 `null`，调用方会当成「确定没有夏令时」，
 * 于是 2012 年的约旦、1991 年的贝鲁特全都会被静默少算 1 小时。
 */
export function tzOverrideWindow(tz: string, year: number): TzDstWindow | null | undefined {
  const o = TZ_OVERRIDES[tz];
  if (!o) return undefined;
  if (year < o.since) return undefined;
  return o.windows(year);
}

/** 该时区该年是否要提示「不是精确时区」；无覆盖数据时返回 null */
export function tzOverrideNote(tz: string, year: number): string | null {
  const o = TZ_OVERRIDES[tz];
  if (!o) return null;
  if (year < o.since) {
    return `${tz} 在 ${year} 年不在夏令时覆盖表区间（本表自 ${o.since} 年起），该年夏令时未纳入，可能差 1 小时`;
  }
  if (!o.note) return null;
  return o.note(year);
}

/** 覆盖表清单（界面/自检用）：[{ tz, since }] */
export function listTzOverrides(): { tz: string; since: number }[] {
  return Object.keys(TZ_OVERRIDES).map((tz) => ({ tz, since: TZ_OVERRIDES[tz].since }));
}

/** 近年时区变更记录（写报告 / 自检对照用，不参与计算） */
export const TZ_CHANGELOG: { tz: string; from: string; change: string }[] = [
  { tz: 'Africa/Cairo', from: '2023-04', change: '恢复夏令时：4 月最后一个周五 → 10 月最后一个周四' },
  { tz: 'America/Mexico_City', from: '2022-10', change: '取消全国夏令时（北部边境城市除外）' },
  { tz: 'America/Asuncion', from: '2024-10', change: '永久 UTC-3，不再回拨 UTC-4' },
  { tz: 'America/Santiago', from: '2022-09', change: '夏令时起止稳定为 9 月/4 月第一个周六 24:00' },
  { tz: 'Africa/Casablanca', from: '2018-10', change: '常年 UTC+1，仅斋月回拨 UTC+0' },
  { tz: 'Asia/Tehran', from: '2022-03', change: '取消夏令时，全年 UTC+03:30' },
  { tz: 'Asia/Amman', from: '2022-10', change: '固定 UTC+3，取消夏令时' },
  { tz: 'Asia/Damascus', from: '2022-10', change: '固定 UTC+3，取消夏令时' },
  { tz: 'Asia/Beirut', from: '2023-03', change: '夏令时推迟 3 天后撤销，回归欧盟规则' },
];
