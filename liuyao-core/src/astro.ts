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
}

function toDms(lon: number): Dms {
  const norm = ((lon % 360) + 360) % 360;
  const signIndex = Math.floor(norm / 30);
  const inSign = norm - signIndex * 30;
  const degree = Math.floor(inSign);
  const minute = Math.round((inSign - degree) * 60);
  // 处理 59.9' 进位到整度
  if (minute >= 60) {
    return { degree: degree + 1 >= 30 ? 0 : degree + 1, minute: 0, lon: norm };
  }
  return { degree, minute, lon: norm };
}

const SIGN_ORDER = ['aries','taurus','gemini','cancer','leo','virgo','libra','scorpio','sagittarius','capricorn','aquarius','pisces'] as const;

/**
 * 入参归一化：兼容 lat/latitude、lonEast/longitude；时区走 timeContext（显式 > 城市 > +8 兜底）。
 * 返回里带 `time`（TimeResolution），调用方要 UT、夏令时、真太阳时都从这里取。
 */
export function normalizeAstroInput(input: AstroInput) {
  const latRaw = input.lat ?? input.latitude;
  const lonRaw = input.lonEast ?? input.longitude;
  const time = resolveTime({
    year: input.year, month: input.month, day: input.day,
    hour: input.hour, minute: input.minute, second: input.second,
    city: input.city ?? input.place,
    place: input.place,
    lat: latRaw,
    lonEast: lonRaw,
    utcOffsetHours: input.utcOffsetHours,
    trueSolarTime: input.trueSolarTime,
  });
  const lat = latRaw ?? time.latitude;
  const lonEast = lonRaw ?? time.longitude;
  if (lat == null || lonEast == null || !Number.isFinite(lat) || !Number.isFinite(lonEast)) {
    throw new Error('占星排盘缺少有效的出生地纬度/经度（lat/latitude、lonEast/longitude）');
  }
  return {
    year: input.year, month: input.month, day: input.day,
    hour: input.hour, minute: input.minute ?? 0, second: input.second ?? 0,
    lat, lonEast,
    // 生效偏移（含夏令时）：vedic 等直接吃这个字段的调用方因此自动拿到正确时区
    utcOffsetHours: time.utcOffsetHours,
    place: input.place ?? '',
    time,
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
  const ascIndex = Math.floor(((chart.angles.asc % 360) + 360) % 360 / 30);

  // 星体
  const bodies = {} as Record<PlanetId, AstroBody>;
  for (const id of PLANET_ORDER) {
    const raw = chart.bodies[id];
    if (!raw) continue;
    const signIndex = Math.floor(((raw.lon % 360) + 360) % 360 / 30);
    bodies[id] = {
      id,
      name: PLANET_ZH[id],
      signIndex,
      signName: SIGN_ZH[signIndex],
      dms: toDms(raw.lon),
      retrograde: !!raw.retrograde,
      speed: raw.speed,
      house: raw.house,
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
  };
}

export { SIGN_ORDER };
