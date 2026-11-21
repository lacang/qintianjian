/**
 * 统一入参校验层（内校层）
 *
 * 存在理由：审计三轮实测发现，各排盘入口各自容错，导致「能跑但结果是错的」——
 *  - `new Date(2026, 1, 30)` 静默滚成 3 月 2 日（2 月 30 日的盘被当成 3 月排）；
 *  - `Date.UTC(0..99, ...)` 把公元 50 年当成 1950 年（ES 规范的历史行为），
 *    于是公元 1 年在西占被「不存在的日期」拒掉，而负数年反而能排；
 *  - `hour: null / '' / NaN` 被当成 0 点或 12 点；`hour: 3.9` 被静默当成某个时辰；
 *  - `gender: 'M'` 在八字按女命算、在紫微直接抛错；
 *  - 坐标越界被夹紧成 ±90，只给 lat 不给 lon 时 lon 默认 0（几内亚湾）。
 *
 * 本文件是**唯一**的校验实现，所有公开排盘入口都必须先过这里（见各入口开头的
 * `validateDateTime` / `validateGeo` / `normalizeGender` 调用），不得各写一套。
 *
 * 错误类型（都带 `code`，便于前端分型提示）：
 *  - InvalidDateError   日期不构成真实公历日、或不是整数
 *  - InvalidTimeError   时/分/秒缺省（strict）或越界、非数值、非整数
 *  - OutOfRangeError    年、纬度、经度等超出自述支持区间
 *  - InvalidGenderError 性别不在白名单
 *  - InvalidNumberError 起卦数字不合法
 *
 * 小数时间取整规则（全库统一）：**向下取整**（`Math.floor`），并写一条 warning。
 * `hour: 3.9` → 3 点（寅时），`minute: 30.7` → 30 分。理由：钟面读数一般不精确到
 * 分秒，向下取整不会把 22:59 的盘误推成次日 0 点；且与「时辰按整点分界」的既有
 * 口径一致（22:59 → 亥时）。
 */
/** 性别（对内统一成中文两值；对外接受中英六种写法） */
export type Gender = '男' | '女';

/** 支持的年区间（各入口按自己需要的精度选一个，不许各写各的数字） */
export const YEAR_RANGES = {
  /** 纯历法（八字四柱、六爻、梅花、奇门、建除、节气名）：干支/农历可推到两端 */
  calendar: { min: 1, max: 9999, label: '0001–9999', note: '纯历法换算' },
  /** 需要高精度星历（西占、吠陀、推运）：caelus/VSOP87 在此外推可靠 */
  ephemeris: { min: 1600, max: 2200, label: '1600–2200', note: '高精度星历' },
  /** 紫微：iztro 的星曜数据表只覆盖 1900–2100 */
  ziwei: { min: 1900, max: 2100, label: '1900–2100', note: 'iztro 星表覆盖范围' },
} as const;

export type YearRangeId = keyof typeof YEAR_RANGES;

/**
 * 合并多组 warning，去掉重复项（保序）。
 *
 * 为什么需要：同一次调用里 `civilForPaipan` 与 `resolveTime` 都会跑一遍
 * `validateDateTime`（前者为了拿规整后的钟面值，后者为了拿时区），两边都会产出
 * 同一条「小数时间已取整」之类的提示。直接展开相加会让前端重复显示，故统一在此去重。
 */
export function mergeWarnings(...lists: Array<string[] | null | undefined>): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  for (const list of lists) {
    if (!list) continue;
    for (const w of list) {
      if (!w || seen.has(w)) continue;
      seen.add(w);
      out.push(w);
    }
  }
  return out;
}

/** 校验错误基类：`code` 供前端分型（不再靠正则匹配中文消息） */
export class InputValidationError extends Error {
  readonly code: string;
  constructor(code: string, message: string) {
    super(message);
    this.name = new.target.name;
    this.code = code;
    // 继承内置 Error 后 instanceof 仍可靠（tsc target < ES2015 时需要）
    Object.setPrototypeOf(this, new.target.prototype);
  }
}

export class InvalidDateError extends InputValidationError {
  constructor(message: string) { super('INVALID_DATE', message); }
}

export class InvalidTimeError extends InputValidationError {
  constructor(message: string) { super('INVALID_TIME', message); }
}

export class OutOfRangeError extends InputValidationError {
  constructor(message: string) { super('OUT_OF_RANGE', message); }
}

export class InvalidGenderError extends InputValidationError {
  constructor(message: string) { super('INVALID_GENDER', message); }
}

export class InvalidNumberError extends InputValidationError {
  constructor(message: string) { super('INVALID_NUMBER', message); }
}

/** 入参回显：把任意脏值打印成可读片段（字符串带引号，便于区分 "12" 与 12） */
export function showValue(v: unknown): string {
  if (typeof v === 'string') return `"${v}"`;
  if (v === null) return 'null';
  if (v === undefined) return 'undefined';
  if (typeof v === 'number' && Number.isNaN(v)) return 'NaN';
  if (typeof v === 'object') return JSON.stringify(v);
  return String(v);
}

/* ============================================================
   一、日期
   ============================================================ */

const DAYS_IN_MONTH = [31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31] as const;

/** 公历闰年（格里历，1582 年后与儒略历一致；本项目 1600 起不外推儒略历） */
export function isLeapYear(year: number): boolean {
  return (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0;
}

/** 某年某月的天数（month 1–12） */
export function daysInMonth(year: number, month: number): number {
  if (month === 2) return isLeapYear(year) ? 29 : 28;
  return DAYS_IN_MONTH[month - 1] ?? 31;
}

/**
 * 墙钟分量 → 毫秒（**当 UTC 用**），绕开 `Date.UTC(0..99)` 把年份映射成 1900+year 的坑。
 * 时间层、历法层所有内部日期算术都必须走这里，不许直接 `Date.UTC`。
 */
export function utcMsOf(y: number, mo: number, d: number, h = 0, mi = 0, s = 0): number {
  const dt = new Date(0);
  dt.setUTCFullYear(y, mo - 1, d);
  dt.setUTCHours(h, mi, s, 0);
  return dt.getTime();
}

export interface DateParts { year: number; month: number; day: number }

export interface ValidateDateOptions {
  /** 年份支持区间，默认 'calendar'（0001–9999） */
  yearRange?: YearRangeId;
  /** 消息前缀，如「出生日期」「起卦时间」 */
  label?: string;
}

function requireInt(v: unknown, name: string, label: string): number {
  if (typeof v !== 'number' || !Number.isFinite(v)) {
    throw new InvalidDateError(`${label}的 ${name} 必须是数值，收到 ${showValue(v)}`);
  }
  if (!Number.isInteger(v)) {
    throw new InvalidDateError(`${label}的 ${name} 必须是整数，收到 ${v}（不允许小时级别的「半天」日期）`);
  }
  return v;
}

/**
 * 校验公历年月日：越界即抛，**绝不静默滚动**（2/30、4/31、13 月、日>31 全部拒）。
 */
export function validateDate(year: unknown, month: unknown, day: unknown, opts: ValidateDateOptions = {}): DateParts {
  const label = opts.label ?? '日期';
  const rangeId = opts.yearRange ?? 'calendar';
  const range = YEAR_RANGES[rangeId];
  const y = requireInt(year, '年份', label);
  const mo = requireInt(month, '月份', label);
  const d = requireInt(day, '日', label);

  if (y < range.min || y > range.max) {
    throw new OutOfRangeError(
      `${label}的年份 ${y} 超出支持区间 ${range.label}（${range.note}）；`
      + `本入口只受理 ${range.min}–${range.max} 年，超出请改用对应级别的入口`,
    );
  }
  if (mo < 1 || mo > 12) {
    throw new InvalidDateError(`${label}的月份 ${mo} 越界（应为 1–12）：${y}-${mo}-${d}`);
  }
  const dim = daysInMonth(y, mo);
  if (d < 1 || d > dim) {
    throw new InvalidDateError(
      `${label}的日 ${d} 越界：不存在的日期 ${y}-${pad2(mo)}-${pad2(d)}`
      + `（${y} 年 ${mo} 月只有 ${dim} 天）`,
    );
  }
  return { year: y, month: mo, day: d };
}

function pad2(n: number): string { return String(n).padStart(2, '0'); }

/* ============================================================
   二、时间（时/分/秒）
   ============================================================ */

/** 脏值判定：缺省、null、空串、false 一律视为「没给」 */
export function isMissingTimeValue(v: unknown): boolean {
  return v === undefined || v === null || v === '' || v === false;
}

export interface HourCheckOptions {
  /** 数值名（用于消息），如「小时」 */
  name?: string;
  /** 回退值的单位（「点」「分」「秒」），用于「按 0 点计」这类可读提示 */
  unit?: string;
  label?: string;
  /** 允许的最大值（hour 23 / minute 59 / second 59） */
  max: number;
  /** strict=false 时回退的值 */
  fallback: number;
  /** 是否允许缺省（minute/second 缺省按 0 是既有 API 约定，不打扰用户） */
  optional?: boolean;
  strict: boolean;
  warnings: string[];
}

/** 单个时间分量的校验与取整（内部用；对外请走 validateDateTime） */
export function validateTimeField(raw: unknown, opts: HourCheckOptions): number {
  const name = opts.name ?? '时间';
  const label = opts.label ?? '';
  if (isMissingTimeValue(raw)) {
    if (opts.optional) return opts.fallback;
    if (!opts.strict) {
      opts.warnings.push(`未提供${name}，按 ${opts.fallback} ${opts.unit ?? '点'}计`);
      return opts.fallback;
    }
    throw new InvalidTimeError(
      `${label}未提供${name}：请给出 0–${opts.max} 的整数；`
      + `若确需按 ${opts.fallback} 计，请显式传值或传 strict: false`,
    );
  }
  if (typeof raw !== 'number' || !Number.isFinite(raw)) {
    throw new InvalidTimeError(`${label}${name}必须是 0–${opts.max} 的整数，收到 ${showValue(raw)}`);
  }
  let v = raw;
  if (!Number.isInteger(v)) {
    const floor = Math.floor(v);
    opts.warnings.push(`${name} ${v} 不是整数，已向下取整为 ${floor}（小数时间全库统一向下取整）`);
    v = floor;
  }
  if (v < 0 || v > opts.max) {
    throw new InvalidTimeError(`${label}${name} ${raw} 越界（应为 0–${opts.max}）`);
  }
  return v;
}

/* ============================================================
   三、日期时间（入口唯一入口）
   ============================================================ */

export interface DateTimeLike {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute?: number;
  second?: number;
  /** 缺省 strict=true：hour 缺失即抛；false 时回退 0 点并写 warning */
  strict?: boolean;
}

export interface ValidateDateTimeOptions {
  yearRange?: YearRangeId;
  label?: string;
  /**
   * hour 是否必须：
   *  - 'require'（默认）缺 hour 抛 InvalidTimeError；
   *  - 'optional' 缺 hour 按 0 点（并写 warning）——给「只关心日柱/日历」的历法入口用。
   */
  hour?: 'require' | 'optional';
  /** 覆盖入参里的 strict（一般不用） */
  strict?: boolean;
}

export interface ValidatedDateTime {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
  second: number;
  warnings: string[];
}

/**
 * 排盘入口通用校验：日期越界抛错、时间缺省/脏值抛错（strict=false 回退并写 warning）、
 * 小数时间向下取整并写 warning。返回**可直接下传**的规整值与 warnings。
 */
export function validateDateTime(
  input: DateTimeLike | Record<string, unknown>,
  opts: ValidateDateTimeOptions = {},
): ValidatedDateTime {
  const label = opts.label ?? '时间';
  const src = input as Record<string, unknown>;
  const date = validateDate(src.year, src.month, src.day, { yearRange: opts.yearRange, label });
  const strict = typeof opts.strict === 'boolean'
    ? opts.strict
    : (typeof src.strict === 'boolean' ? src.strict : true);
  const warnings: string[] = [];
  const hourOptional = opts.hour === 'optional';
  const hour = validateTimeField(src.hour, {
    name: '小时', unit: '点', label, max: 23, fallback: 0, strict, warnings, optional: hourOptional,
  });
  const minute = validateTimeField(src.minute, {
    name: '分钟', unit: '分', label, max: 59, fallback: 0, strict, warnings, optional: true,
  });
  const second = validateTimeField(src.second, {
    name: '秒', unit: '秒', label, max: 59, fallback: 0, strict, warnings, optional: true,
  });
  return { ...date, hour, minute, second, warnings };
}

/* ============================================================
   四、地理坐标
   ============================================================ */

export interface GeoPoint { lat: number; lon: number }

export interface ValidateGeoOptions {
  /** true（默认）= 必须成对给出；false = 全缺时返回 null */
  required?: boolean;
  label?: string;
}

/**
 * 经纬度校验：只给一个即抛（不许默认 0），越界即抛（**不夹紧**）。
 * 注意：赤道/本初子午线的 0 是合法值，所以判「缺省」不能靠真值判断，只能靠 null/undefined/NaN。
 */
export function validateGeo(lat: unknown, lon: unknown, opts: ValidateGeoOptions = {}): GeoPoint | null {
  const label = opts.label ?? '';
  const latMissing = lat === undefined || lat === null;
  const lonMissing = lon === undefined || lon === null;
  if (latMissing && lonMissing) {
    if (opts.required === false) return null;
    throw new OutOfRangeError(`${label}缺少经纬度：请同时给出 lat/latitude 与 lon/lonEast/longitude`);
  }
  if (latMissing) {
    throw new OutOfRangeError(`${label}经纬度必须成对给出：缺纬度 lat/latitude（收到经度 ${showValue(lon)}）`);
  }
  if (lonMissing) {
    throw new OutOfRangeError(`${label}经纬度必须成对给出：缺经度 lon/lonEast/longitude（收到纬度 ${showValue(lat)}）`);
  }
  const la = lat as number;
  const lo = lon as number;
  if (typeof la !== 'number' || !Number.isFinite(la)) {
    throw new OutOfRangeError(`${label}纬度必须是数值，收到 ${showValue(lat)}`);
  }
  if (typeof lo !== 'number' || !Number.isFinite(lo)) {
    throw new OutOfRangeError(`${label}经度必须是数值，收到 ${showValue(lon)}`);
  }
  if (la < -90 || la > 90) {
    throw new OutOfRangeError(`${label}纬度 ${la} 超出 [-90, 90]（超范围一律报错，不做夹紧）`);
  }
  if (lo < -180 || lo > 180) {
    throw new OutOfRangeError(`${label}经度 ${lo} 超出 [-180, 180]（超范围一律报错，不做夹紧）`);
  }
  return { lat: la, lon: lo };
}

/** 极圈阈值：超过此纬度时整宫/上升在数学上跳变，必须在 result.warnings 里标注 */
export const POLAR_LATITUDE = 66.5;

/** 高纬提示（|lat| > 66.5° 宫位降级；>= 89° 上升点无定义） */
export function highLatitudeWarnings(lat: number | null | undefined): string[] {
  if (typeof lat !== 'number' || !Number.isFinite(lat)) return [];
  const abs = Math.abs(lat);
  if (abs <= POLAR_LATITUDE) return [];
  const out = [
    `出生地纬度 ${lat.toFixed(2)}° 已在极圈内（|lat| > ${POLAR_LATITUDE}）：whole_sign 宫位仍有定义，`
    + '但上升点随黄道升落速率剧变、可出现 180° 跳变，高纬宫位已降级为「仅参考」，判读请谨慎',
  ];
  if (abs >= 89) {
    out.push(`纬度 ${lat.toFixed(2)}° 贴近极点：上升点/中天在数学上无定义，宫位结果不可用`);
  }
  return out;
}

/* ============================================================
   五、性别 / 起卦数字
   ============================================================ */

const GENDER_MAP: Record<string, Gender> = {
  男: '男', 女: '女',
  male: '男', female: '女',
  m: '男', f: '女',
};

export interface GenderOptions {
  /** true = 缺省即抛（八字/紫微必须一致）；false = 缺省取 fallback */
  required?: boolean;
  fallback?: Gender;
}

/**
 * 性别归一：只接受 男/女/male/female/m/f（英文大小写不敏感）。
 * 八字与紫微共用本函数，缺省时两者行为必须一致（都为 required）。
 */
export function normalizeGender(raw: unknown, opts: GenderOptions = {}): Gender {
  const required = opts.required !== false;
  const missing = raw === undefined || raw === null || (typeof raw === 'string' && raw.trim() === '');
  if (missing) {
    if (!required) return opts.fallback ?? '男';
    throw new InvalidGenderError('缺少性别（gender）：只接受 男/女/male/female/m/f');
  }
  if (typeof raw !== 'string') {
    throw new InvalidGenderError(`性别必须是字符串，收到 ${showValue(raw)}（只接受 男/女/male/female/m/f）`);
  }
  const key = raw.trim().toLowerCase();
  const hit = GENDER_MAP[key];
  if (!hit) {
    throw new InvalidGenderError(`性别「${raw}」非法：只接受 男/女/male/female/m/f`);
  }
  return hit;
}

/**
 * 数值起卦校验：必须是 1–64 的正整数。
 * 上限 64 取「卦数六十四」（梅花/六爻的数值起卦都不该超出卦数范围）。
 */
export function validateCastNumber(n: unknown, label = '起卦数'): number {
  if (typeof n !== 'number' || !Number.isFinite(n)) {
    throw new InvalidNumberError(`${label}必须是数值，收到 ${showValue(n)}`);
  }
  if (!Number.isInteger(n)) {
    throw new InvalidNumberError(`${label}必须是整数，收到 ${n}`);
  }
  if (n < 1 || n > 64) {
    throw new InvalidNumberError(`${label}必须是 1–64 的正整数，收到 ${n}`);
  }
  return n;
}
