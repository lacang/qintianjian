/**
 * 西方古典占星 —— 本命盘（整宫制 · 七政 · 五项必然尊贵 · 昼夜 sect · 福点）
 *
 * 底座：
 * - caelus@0.25.0（MIT，纯 ESM，嵌入式星历，零星历文件）做整宫/尊贵/sect/福点；
 * - astronomy-engine@2.1.19（MIT，VSOP87 纯 JS）为底层（caelus/auseklis 共用）。
 * 精度：七政对 JPL 级 INPOP19 亚角分、ASC/MC 四路一致到 0.01 角分；
 *       详见 对标素材/引擎对账报告_占星.md。
 *
 * 口径要点（实测，勿改）：
 * 1. caelus chart() 吃【UT 墙钟分量】，不是本地钟；lat 在前、lonEast(东经为正)在后。
 * 2. 本命/事件用「本地墙钟 + 出生地时区」换算 UT，统一走 timeContext.resolveTime：
 *    显式 utcOffsetHours 优先，其次按城市查表，最后才兜底 +8（并回传 tzFallback 标记）。
 *    中国 1986–1991 夏令时、境外 DST 都在那一层还原，本文件不再自己算偏移。
 * 3. 行运/首页基于 new Date() 绝对时刻，库内部处理 UT/TDB，时区无关。
 * 4. 真太阳时（经度差 + 均时差）**只用于命理口径展示/四柱**，绝不参与本命盘换算：
 *    宫位/上升取决于真实 UT 瞬间 + 经纬度，拿真太阳时再折 UT 会把经度算两遍。
 *    本层把它算好放在 chart.time 里，前端标注「真太阳时 …（北京时 …，经度 +x 分、均时差 y 分）」。
 * 5. 只排盘报事实，不做吉凶解读。
 */
import { Engine } from 'caelus';
import { embeddedData } from 'caelus/data-embedded';
import {
  isDayChart,
  dignityScore,
  signRuler,
  lots,
  julianDay,
} from 'caelus';
import {
  PLANET_ORDER, SEVEN, PLANET_ZH, SIGN_ZH,
  type PlanetId,
} from './astro-constants.js';
import { resolveTime, type TimeResolution } from './timeContext.js';
import { validateDateTime, validateGeo, highLatitudeWarnings, mergeWarnings } from './validate.js';

// 模块级单例（与中式引擎一致），embeddedData 内联、约 378KB，随 bundle 永久离线。
let _engine: Engine | null = null;
function engine(): Engine {
  if (!_engine) _engine = new Engine(embeddedData as never);
  return _engine;
}

export interface AstroInput {
  /** 本地（出生时区）墙钟日期分量 */
  year: number;
  month: number;
  day: number;
  hour: number;       // 本地 0..23
  minute?: number;
  second?: number;
  /** 出生地纬度（北正）；兼容 latitude */
  lat?: number;
  latitude?: number;
  /** 出生地经度（东正东，沈阳 123.4328）；兼容 longitude */
  lonEast?: number;
  longitude?: number;
  /** 出生时区相对 UTC 的小时偏移（北京 +8）；不传则按 city/place 查表，最后兜底 +8 */
  utcOffsetHours?: number;
  /** 出生地（展示 + 城市查表；如「辽宁沈阳」「New York」） */
  place?: string;
  /** 出生地城市（查表主键，优先于 place） */
  city?: string;
  /** 是否计算真太阳时（默认 true；只影响 chart.time，不影响宫位排布） */
  trueSolarTime?: boolean;
}

export interface Dms {
  /** 星座内度数 0..29（已 floor 用于展示） */
  degree: number;
  minute: number;
  /** 0..359.999 绝对黄经 */
  lon: number;
}

export interface AstroBody {
  id: PlanetId;
  name: string;
  signIndex: number;   // 0..11
  signName: string;    // 中文星座
  dms: Dms;
  retrograde: boolean;
  speed: number;
  house: number;       // 整宫 1..12
}

export interface Dignity {
  rulership: number;
  exaltation: number;
  triplicity: number;
  term: number;
  face: number;
  detriment: number;
  fall: number;
  peregrine: boolean;
  total: number;
  termRuler: string | null;
  faceRuler: string | null;
}

export interface NatalChart {
  /** 世界时儒略日 */
  jdUt: number;
  /** 统一时间层解析结果：民用时/标准时/UT、夏令时、真太阳时、时区来源 */
  time: TimeResolution;
  /** 昼夜盘 */
  sect: '昼' | '夜';
  asc: Dms;
  mc: Dms;
  /** 上升星座序号 0..11（整宫一宫头） */
  ascSignIndex: number;
  ascSignName: string;
  /** 命主星（上升星座守护星）id/中文名 */
  chartRuler: PlanetId;
  chartRulerName: string;
  bodies: Record<PlanetId, AstroBody>;
  /** 整宫 1..12 → 宫内星体 id 列表 */
  houses: { house: number; signIndex: number; signName: string; lord: PlanetId; lordName: string; bodies: PlanetId[] }[];
  /** 七政五项必然尊贵 */
  dignities: Partial<Record<PlanetId, Dignity>>;
  /** 福点 Fortuna / 精神点 Spirit（绝对黄经） */
  lots: { fortune: Dms; spirit: Dms };
  /** 入参校验/口径提示（小数时间取整、高纬宫位降级、历史时区…），界面应显示 */
  warnings: string[];
}

/**
 * 绝对黄经 → 星座内度分。
 *
 * 进位规则与 vedic.ts 的 toDms 完全一致（P1-2）：分钟四舍五入到 60 时进整度；
 * 度进到 30 时必须**连星座一起进位**，并把返回的 lon 同步成「按分取整后的绝对黄经」，
 * 否则会出现「巨蟹 0°00′」实为巨蟹 29°59′57″ 的错位。
 */
export function toDms(lon: number): Dms {
  const norm = mod360(lon);
  let signIndex = Math.floor(norm / 30);
  const inSign = norm - signIndex * 30;
  let degree = Math.floor(inSign);
  let minute = Math.round((inSign - degree) * 60);
  if (minute >= 60) {
    minute = 0;
    degree += 1;
    if (degree >= 30) { degree = 0; signIndex = (signIndex + 1) % 12; }
  }
  const rounded = mod360(signIndex * 30 + degree + minute / 60);
  return { degree, minute, lon: rounded };
}

/** 角度归一到 [0, 360)：正数直接取模，避免 ((x%360)+360)%360 的 2e-14 级精度损失 */
function mod360(x: number): number {
  const r = x % 360;
  const v = r < 0 ? r + 360 : r;
  return v === 0 ? 0 : v;
}

const SIGN_ORDER = ['aries','taurus','gemini','cancer','leo','virgo','libra','scorpio','sagittarius','capricorn','aquarius','pisces'] as const;

/**
 * 入参归一化：兼容 lat/latitude、lonEast/longitude；时区走 timeContext（显式 > 城市 > +8 兜底）。
 * 返回里带 `time`（TimeResolution），调用方要 UT、夏令时、真太阳时都从这里取。
 */
export function normalizeAstroInput(input: AstroInput) {
  const latRaw = input.lat ?? input.latitude;
  const lonRaw = input.lonEast ?? input.longitude;
  // 统一校验（validate.ts）：西占用高精度星历，年份限 1600–2200（公元 1 年被 0–99→1900+
  // 的老坑误判，这里改由 validateDate 直接按区间拒，消息写明区间）；坐标成对、不夹紧。
  const v = validateDateTime(input as unknown as Record<string, unknown>, {
    yearRange: 'ephemeris',
    label: '出生时间',
  });
  const hasCity = !!(input.city ?? input.place);
  const geo = validateGeo(latRaw, lonRaw, { required: !hasCity, label: '出生地' });
  const time = resolveTime({
    year: v.year, month: v.month, day: v.day,
    hour: v.hour, minute: v.minute, second: v.second,
    city: input.city ?? input.place,
    place: input.place,
    lat: latRaw,
    lonEast: lonRaw,
    utcOffsetHours: input.utcOffsetHours,
    trueSolarTime: input.trueSolarTime,
  });
  const lat = geo ? geo.lat : time.latitude;
  const lonEast = geo ? geo.lon : time.longitude;
  if (lat == null || lonEast == null || !Number.isFinite(lat) || !Number.isFinite(lonEast)) {
    throw new Error('占星排盘缺少有效的出生地纬度/经度（lat/latitude、lonEast/longitude）');
  }
  return {
    year: v.year, month: v.month, day: v.day,
    hour: v.hour, minute: v.minute, second: v.second,
    lat, lonEast,
    // 生效偏移（含夏令时）：vedic 等直接吃这个字段的调用方因此自动拿到正确时区
    utcOffsetHours: time.utcOffsetHours,
    place: input.place ?? '',
    time,
    // 时间层的提示（时区估算/历史时区/夏令时近似…）必须并进来：
    // 只带 validate 的 warnings 会让西占/印度盘在「只给经纬度不给城市」时一声不响（审计 P2-6）。
    warnings: mergeWarnings(v.warnings, time.warnings),
  };
}

type NormInput = ReturnType<typeof normalizeAstroInput>;

/** UT 墙钟分量：直接用统一时间层算好的绝对时刻，避免各处再减一次偏移 */
function toUtParts(input: NormInput) {
  const u = input.time.utc;
  return { y: u.year, mo: u.month, day: u.day, h: u.hour, mi: u.minute, s: u.second };
}

export function paipanXingpan(rawInput: AstroInput): NatalChart {
  const input = normalizeAstroInput(rawInput);
  const ut = toUtParts(input);
  const eng = engine();
  const jdUt = julianDay(ut.y, ut.mo, ut.day, ut.h, ut.mi, ut.s);
  const chart = eng.chart(ut.y, ut.mo, ut.day, ut.h, ut.mi, ut.s, input.lat, input.lonEast, 'whole_sign');

  const day = isDayChart(eng, jdUt, input.lat, input.lonEast);
  // 上升星座一律按「四舍五入后的度分」反推，避免 asc=29°59′57″ 时星座下标仍停在旧星座
  const ascDms = toDms(chart.angles.asc);
  const ascIndex = Math.floor(mod360(ascDms.lon) / 30);
  // 高纬提示：|lat| > 66.5° 时上升点速率剧变（实测 66.5°N 达 16°/10s、66.6°N 起 180° 跳变），
  // whole_sign 宫位仍有定义，但必须在 warnings 里降级标注（P1-3）。
  const warnings = mergeWarnings(input.warnings, highLatitudeWarnings(input.lat));

  // 星体
  const bodies = {} as Record<PlanetId, AstroBody>;
  for (const id of PLANET_ORDER) {
    const raw = chart.bodies[id];
    if (!raw) continue;
    // 星座与显示度分必须同口径：先按「分取整」得到 dms，再由 dms.lon 反推星座。
    // 旧写法用 raw.lon 反推星座、另用 toDms 显示度分，119.998°（月亮）就输出
    // 「巨蟹 0°00′」——星座是狮子（分进位到 30° 已跨宫），同一行自相矛盾（审计 P3-8）。
    const dms = toDms(raw.lon);
    const signIndex = Math.floor(mod360(dms.lon) / 30);
    bodies[id] = {
      id,
      name: PLANET_ZH[id],
      signIndex,
      signName: SIGN_ZH[signIndex],
      dms,
      retrograde: !!raw.retrograde,
      speed: raw.speed,
      // 整宫宫位也跟着进位后的星座走，否则会出现「狮子座 0° 落巨蟹宫」
      house: ((signIndex - ascIndex + 12) % 12) + 1,
    };
  }

  // 整宫十二宫：从上升星座起算，宫序 = (signIndex - ascIndex + 12) % 12 + 1
  const houses = Array.from({ length: 12 }, (_, i) => {
    const signIndex = (ascIndex + i) % 12;
    const lordEn = signRuler(signIndex) as PlanetId;
    return {
      house: i + 1,
      signIndex,
      signName: SIGN_ZH[signIndex],
      lord: lordEn,
      lordName: PLANET_ZH[lordEn] ?? lordEn,
      bodies: [] as PlanetId[],
    };
  });
  for (const id of PLANET_ORDER) {
    const b = bodies[id];
    if (b && houses[b.house - 1]) houses[b.house - 1].bodies.push(id);
  }

  // 七政五项必然尊贵
  const dignities: Partial<Record<PlanetId, Dignity>> = {};
  for (const id of SEVEN) {
    const b = bodies[id];
    if (!b) continue;
    const ds = dignityScore(id, b.dms.lon, day ? 'day' : 'night');
    dignities[id] = {
      rulership: ds.rulership,
      exaltation: ds.exaltation,
      triplicity: ds.triplicity,
      term: ds.term,
      face: ds.face,
      detriment: ds.detriment,
      fall: ds.fall,
      peregrine: !!ds.peregrine,
      total: ds.total,
      termRuler: ds.term_ruler ?? null,
      faceRuler: ds.face_ruler ?? null,
    };
  }

  // 福点
  const lot = lots(eng, jdUt, input.lat, input.lonEast);

  const ruler = signRuler(ascIndex) as PlanetId;

  return {
    jdUt,
    time: input.time,
    sect: day ? '昼' : '夜',
    asc: toDms(chart.angles.asc),
    mc: toDms(chart.angles.mc),
    ascSignIndex: ascIndex,
    ascSignName: SIGN_ZH[ascIndex],
    chartRuler: ruler,
    chartRulerName: PLANET_ZH[ruler] ?? ruler,
    bodies,
    houses,
    dignities,
    lots: { fortune: toDms(lot.fortune), spirit: toDms(lot.spirit) },
    warnings,
  };
}

export { SIGN_ORDER };
