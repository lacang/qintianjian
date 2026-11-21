/**
 * 印度吠陀占星（Jyotisha / Vedic Astrology）—— 本命 Rashi 盘（D1）+ Navamsha（D9）
 *
 * 天文底座与西方盘同一个 caelus（MIT），但口径全部按印度传统：
 * - 恒星黄道（Sidereal Zodiac），岁差用 Lahiri（印度政府标准，caelus 内置，随时间岁差推演）；
 * - 整宫制：上升所在星座即第 1 宫，之后整宫顺延（Parashari 通行的 Rashi chart 就是整宫）；
 * - 九曜 Graha：日月、火、水、木、金、土 七政 + 罗睺 Rahu（北交）+ 计都 Ketu（南交）；
 *   不用三王（天王/海王/冥王），古典印度占星无此概念；
 * - 罗睺取 mean_node（平均交点，Parashari 通行），计都 = 罗睺 +180°；
 * - 27 宿 Nakshatra（每宿 13°20′，分 4 足 pada）、九分盘 Navamsha、Vimshottari 大运（120 年）。
 *
 * 口径提醒（勿改）：
 * 1. 与西方盘共用 caelus.chart 的 UT 换算（本地墙钟 + utcOffsetHours → UT，北京 +8）。
 * 2. 调 chart() 用 opts 对象 { houseSystem:'whole_sign', zodiac:'sidereal:lahiri' }；
 *    caelus 会把上升、宫位、行星全部减岁差并以恒星上升重建整宫。
 * 3. 只排盘报事实 + 标注传统所主张的含义（明确是印度传统说法），不做宿命断言。
 */
import { Engine } from 'caelus';
import { embeddedData } from 'caelus/data-embedded';
import { julianDay } from 'caelus';
import { Body, MakeTime, Observer, SearchRiseSet } from 'astronomy-engine';
import {
  normalizeAstroInput,
  type AstroInput, type Dms,
} from './astro.js';
import { utcMsOf, highLatitudeWarnings, mergeWarnings } from './validate.js';

/**
 * 绝对黄经 → 星座内度分（与 astro.ts 同口径）
 * 分钟四舍五入到 60 时进位到整度；度进位到 30 时须进到下一星座 0°0′，
 * 所以这里连 signIndex 一起进位，并把返回的 lon 同步成「按分取整后的绝对黄经」，
 * 供调用方用 signOf(dms.lon) 反推星座，避免出现「29°59.5′ → 同星座 0°00′」的 30° 错位。
 */
export function toDms(lon: number): Dms {
  const norm = ((lon % 360) + 360) % 360;
  let signIndex = Math.floor(norm / 30);
  const inSign = norm - signIndex * 30;
  let degree = Math.floor(inSign);
  let minute = Math.round((inSign - degree) * 60);
  if (minute >= 60) {
    minute = 0;
    degree += 1;
    if (degree >= 30) { degree = 0; signIndex = (signIndex + 1) % 12; }
  }
  const rounded = ((signIndex * 30 + degree + minute / 60) % 360 + 360) % 360;
  return { degree, minute, lon: rounded };
}

let _engine: Engine | null = null;
function engine(): Engine {
  if (!_engine) _engine = new Engine(embeddedData as never);
  return _engine;
}

/** 九曜（Parashari 传统顺序：日月火水木金土 + 罗睺计都） */
export type GrahaId =
  | 'sun' | 'moon' | 'mars' | 'mercury' | 'jupiter'
  | 'venus' | 'saturn' | 'rahu' | 'ketu';

export const GRAHA_ORDER: GrahaId[] = [
  'sun', 'moon', 'mars', 'mercury', 'jupiter', 'venus', 'saturn', 'rahu', 'ketu',
];

/** 九曜中文名 / 梵名 / 单字简写（盘面用） */
export const GRAHA_ZH: Record<GrahaId, string> = {
  sun: '太阳', moon: '月亮', mars: '火星', mercury: '水星', jupiter: '木星',
  venus: '金星', saturn: '土星', rahu: '罗睺', ketu: '计都',
};
export const GRAHA_SANSKRIT: Record<GrahaId, string> = {
  sun: 'Surya', moon: 'Chandra', mars: 'Mangala', mercury: 'Budha', jupiter: 'Guru',
  venus: 'Shukra', saturn: 'Shani', rahu: 'Rahu', ketu: 'Ketu',
};
export const GRAHA_SHORT: Record<GrahaId, string> = {
  sun: '日', moon: '月', mars: '火', mercury: '水', jupiter: '木',
  venus: '金', saturn: '土', rahu: '罗', ketu: '计',
};

/** 12 宫 Rashi 梵名（白羊=Mesha…双鱼=Meena） */
export const RASHI_SANSKRIT = [
  'Mesha', 'Vrishabha', 'Mithuna', 'Karka', 'Simha', 'Kanya',
  'Tula', 'Vrishchika', 'Dhanu', 'Makara', 'Kumbha', 'Meena',
];

/** 星座守护星（Parashari，id 与 caelus 一致；罗计不主星座） */
const SIGN_LORD: GrahaId[] = [
  'mars', 'venus', 'mercury', 'moon', 'sun', 'mercury',
  'venus', 'mars', 'jupiter', 'saturn', 'saturn', 'jupiter',
];
/** 高庙 Uccha（exaltation）星座序号 0..11；罗计高庙流派分歧，v1 不标 */
const EXALT_SIGN: Partial<Record<GrahaId, number>> = {
  sun: 0, moon: 1, mars: 9, mercury: 5, jupiter: 3, venus: 11, saturn: 6,
};
/** 陷落 Neecha（debilitation）= 高庙对宫 */
function debilSign(g: GrahaId): number | null {
  const e = EXALT_SIGN[g];
  return e == null ? null : (e + 6) % 12;
}
/** 本宫 Svasthana（庙旺的"庙"）星座，多数星有两个 */
const OWN_SIGNS: Record<Exclude<GrahaId, 'rahu' | 'ketu'>, number[]> = {
  sun: [4], moon: [3], mars: [0, 7], mercury: [2, 5],
  jupiter: [8, 11], venus: [1, 6], saturn: [9, 10],
};

/** 27 宿（Nakshatra）中文名 + 梵名 + 主星（Vimshottari 顺序） */
export interface NakshatraInfo { zh: string; sa: string; lord: GrahaId }
const NAK_LORD_SEQ: GrahaId[] = ['ketu', 'venus', 'sun', 'moon', 'mars', 'rahu', 'jupiter', 'saturn', 'mercury'];
export const NAKSHATRAS: NakshatraInfo[] = [
  { zh: '娄宿', sa: 'Ashwini', lord: 'ketu' },
  { zh: '胃宿', sa: 'Bharani', lord: 'venus' },
  { zh: '昴宿', sa: 'Krittika', lord: 'sun' },
  { zh: '毕宿', sa: 'Rohini', lord: 'moon' },
  { zh: '觜宿', sa: 'Mrigashira', lord: 'mars' },
  { zh: '参宿', sa: 'Ardra', lord: 'rahu' },
  { zh: '井宿', sa: 'Punarvasu', lord: 'jupiter' },
  { zh: '鬼宿', sa: 'Pushya', lord: 'saturn' },
  { zh: '柳宿', sa: 'Ashlesha', lord: 'mercury' },
  { zh: '星宿', sa: 'Magha', lord: 'ketu' },
  { zh: '张宿', sa: 'Purva Phalguni', lord: 'venus' },
  { zh: '翼宿', sa: 'Uttara Phalguni', lord: 'sun' },
  { zh: '轸宿', sa: 'Hasta', lord: 'moon' },
  { zh: '角宿', sa: 'Chitra', lord: 'mars' },
  { zh: '亢宿', sa: 'Swati', lord: 'rahu' },
  { zh: '氐宿', sa: 'Vishakha', lord: 'jupiter' },
  { zh: '房宿', sa: 'Anuradha', lord: 'saturn' },
  { zh: '心宿', sa: 'Jyeshtha', lord: 'mercury' },
  { zh: '尾宿', sa: 'Mula', lord: 'ketu' },
  { zh: '箕宿', sa: 'Purva Ashadha', lord: 'venus' },
  { zh: '斗宿', sa: 'Uttara Ashadha', lord: 'sun' },
  { zh: '女宿', sa: 'Shravana', lord: 'moon' },
  { zh: '虚宿', sa: 'Dhanishta', lord: 'mars' },
  { zh: '危宿', sa: 'Shatabhisha', lord: 'rahu' },
  { zh: '室宿', sa: 'Purva Bhadrapada', lord: 'jupiter' },
  { zh: '壁宿', sa: 'Uttara Bhadrapada', lord: 'saturn' },
  { zh: '奎宿', sa: 'Revati', lord: 'mercury' },
];

/** Vimshottari 各大运年限（年），顺序 = NAK_LORD_SEQ */
const MDASA_YEARS: Record<GrahaId, number> = {
  ketu: 7, venus: 20, sun: 6, moon: 10, mars: 7,
  rahu: 18, jupiter: 16, saturn: 19, mercury: 17,
};

/* ============================ Panchanga 五要素 ============================ */
/*
 * 印度历（Panchanga）五要素：Tithi（月相日）· Nakshatra（宿）· Yoga（瑜伽）· Karana（半天）· Vara（七曜日）。
 * 全部用同一个恒星黄经（Lahiri）算，公式为通行经典式：
 *   Tithi    = floor((月−日黄经差 mod 360) / 12) + 1        → 1..30（白分 1–15、黑分 1–15）
 *   Yoga     = floor((日+月黄经和 mod 360) / (360/27)) + 1   → 1..27
 *   Karana   = floor((月−日黄经差 mod 360) / 6) + 1          → 1..60（一个 Tithi = 两个 Karana）
 *   Vara     = 七曜日，以日出为一日之始（日出前仍算前一日）
 */

/** 30 个 Tithi 的梵名（白分 1–15 / 黑分 1–15，第 15 个分别是满月与朔日） */
export const TITHI_SA = [
  'Pratipada', 'Dwitiya', 'Tritiya', 'Chaturthi', 'Panchami',
  'Shashthi', 'Saptami', 'Ashtami', 'Navami', 'Dashami',
  'Ekadashi', 'Dwadashi', 'Trayodashi', 'Chaturdashi', 'Purnima',
  'Pratipada', 'Dwitiya', 'Tritiya', 'Chaturthi', 'Panchami',
  'Shashthi', 'Saptami', 'Ashtami', 'Navami', 'Dashami',
  'Ekadashi', 'Dwadashi', 'Trayodashi', 'Chaturdashi', 'Amavasya',
];
/** 月内日序（初一…十五） */
export const TITHI_ZH_NUM = [
  '初一', '初二', '初三', '初四', '初五', '初六', '初七', '初八', '初九', '初十',
  '十一', '十二', '十三', '十四', '十五',
];

/** 27 瑜伽（Nitya Yoga）梵名 + 通行汉译简义 */
export const YOGA_NAMES: { sa: string; zh: string }[] = [
  { sa: 'Vishkambha', zh: '障碍' }, { sa: 'Priti', zh: '喜' }, { sa: 'Ayushman', zh: '寿' },
  { sa: 'Saubhagya', zh: '福' }, { sa: 'Shobhana', zh: '光' }, { sa: 'Atiganda', zh: '大障' },
  { sa: 'Sukarman', zh: '善业' }, { sa: 'Dhriti', zh: '坚' }, { sa: 'Shula', zh: '矛' },
  { sa: 'Ganda', zh: '障' }, { sa: 'Vriddhi', zh: '增' }, { sa: 'Dhruva', zh: '定' },
  { sa: 'Vyaghata', zh: '打击' }, { sa: 'Harshana', zh: '喜' }, { sa: 'Vajra', zh: '金刚' },
  { sa: 'Siddhi', zh: '成就' }, { sa: 'Vyatipata', zh: '大凶' }, { sa: 'Variyan', zh: '安' },
  { sa: 'Parigha', zh: '障碍' }, { sa: 'Shiva', zh: '吉' }, { sa: 'Siddha', zh: '成就' },
  { sa: 'Sadhya', zh: '可成' }, { sa: 'Shubha', zh: '吉' }, { sa: 'Shukla', zh: '白' },
  { sa: 'Brahma', zh: '梵' }, { sa: 'Indra', zh: '帝' }, { sa: 'Vaidhriti', zh: '凶' },
];

/** 11 个 Karana：1 = Kimstughna（固定），2–57 = 七名循环 8 轮，58–60 = 三个固定名 */
export const KARANA_NAMES: { sa: string; zh: string }[] = [
  { sa: 'Kimstughna', zh: '金思图格那' },
  { sa: 'Bava', zh: '巴瓦' }, { sa: 'Balava', zh: '巴拉瓦' }, { sa: 'Kaulava', zh: '高拉瓦' },
  { sa: 'Taitila', zh: '泰提拉' }, { sa: 'Gara', zh: '伽罗' }, { sa: 'Vanija', zh: '瓦尼伽' },
  { sa: 'Vishti', zh: '毗湿底' },
  { sa: 'Shakuni', zh: '沙库尼' }, { sa: 'Chatushpada', zh: '察图什帕达' }, { sa: 'Naga', zh: '那伽' },
];

/** 七曜日（Vara）：0=日曜 … 6=土曜，主星与西方星期主星同序 */
export const VARA_NAMES: { zh: string; sa: string; lord: GrahaId }[] = [
  { zh: '日曜日', sa: 'Ravivara', lord: 'sun' },
  { zh: '月曜日', sa: 'Somavara', lord: 'moon' },
  { zh: '火曜日', sa: 'Mangalavara', lord: 'mars' },
  { zh: '水曜日', sa: 'Budhavara', lord: 'mercury' },
  { zh: '木曜日', sa: 'Guruvara', lord: 'jupiter' },
  { zh: '金曜日', sa: 'Shukravara', lord: 'venus' },
  { zh: '土曜日', sa: 'Shanivara', lord: 'saturn' },
];

export interface TithiInfo {
  num: number;              // 1..30
  index: number;            // 0..29
  name: string;             // 白月初八 / 黑月十四
  sa: string;               // Shukla Ashtami
  paksha: 'shukla' | 'krishna';
  pakshaZh: string;         // 白分（上弦半月）/ 黑分（下弦半月）
  /** 本 Tithi 已走过的比例 0..1 */
  elapsed: number;
}
export interface YogaPos { index: number; num: number; name: string; sa: string; zh: string; elapsed: number }
export interface KaranaPos { index: number; num: number; name: string; sa: string; zh: string }
export interface VaraPos { index: number; name: string; sa: string; lord: GrahaId; lordName: string; basis: 'sunrise' | 'clock'; sunrise: string | null }
export interface Panchanga {
  tithi: TithiInfo;
  nakshatra: NakshatraPos;
  yoga: YogaPos;
  karana: KaranaPos;
  vara: VaraPos;
  /** 月−日 黄经差（0..360），五要素的底层量，便于核对 */
  elongation: number;
}

export interface Graha {
  id: GrahaId;
  name: string;          // 中文名
  sa: string;            // 梵名
  short: string;         // 盘面单字
  lon: number;           // 恒星黄经 0..360
  dms: Dms;              // 星座内度数
  signIndex: number;     // Rashi 0..11
  signName: string;
  rashiSa: string;
  house: number;         // 整宫 1..12（从上升起）
  retrograde: boolean;
  /** 印度尊贵状态（庙旺落陷；罗计 v1 归 neutral） */
  dignity: 'exalted' | 'own' | 'debilitated' | 'neutral';
  /** 九分盘 D9 星座序号 */
  navamshaSign: number;
  /** 十分盘 D10 星座序号（事业） */
  dasamsaSign: number;
  /** 七分盘 D7 星座序号（子女） */
  saptamsaSign: number;
}

export interface GrahaDrishti {
  from: GrahaId; to: GrahaId; house: number;
}
export interface NakshatraPos {
  index: number;         // 0..26
  zh: string; sa: string; lord: GrahaId;
  pada: number;          // 1..4 足
  /** 在本宿已走过的比例 0..1 */
  elapsed: number;
}
export interface DasaPeriod { graha: GrahaId; name: string; startYear: number; endYear: number; years: number }
export interface Vimshottari {
  birthStar: NakshatraPos;
  /** 当前大运（按实足年龄 ageYears，缺省 0 出生时） */
  mahadasha: { graha: GrahaId; name: string; startYear: number; endYear: number };
  /** 当前小限（Antardasha） */
  antardasha: { graha: GrahaId; name: string; startYear: number; endYear: number };
  /** 九步大运全表（按出生点对齐，第一段为出生时余量） */
  sequence: DasaPeriod[];
}
export interface YogaInfo { key: string; sa: string; zh: string; present: boolean; members: GrahaId[]; note: string }

/** 分盘（Varga）十二宫：整宫制，第 1 宫 = 该盘上升所在星座，逐宫顺延 */
export interface VargaHouse {
  house: number;
  signIndex: number;
  signName: string;
  rashiSa: string;
  lord: GrahaId;
  lordName: string;
  bodies: GrahaId[];
}
export interface VargaChart {
  varga: 'D9' | 'D10' | 'D7';
  vargaZh: string;
  /** 该盘上升（D9 = Navamsa Lagna） */
  lagnaSignIndex: number;
  lagnaSignName: string;
  /** 上升点在该分盘星座内的度数（原始黄经按分盘比例映射后的位置，展示用） */
  lagnaDms: Dms;
  houses: VargaHouse[];
}

export interface VedicChart {
  jdUt: number;
  ayanamsaName: 'Lahiri';
  ayanamsaDeg: number;
  asc: Dms;
  ascSignIndex: number;
  ascSignName: string;
  /** Lagnesh 上升守护星 */
  lagnaLord: GrahaId;
  lagnaLordName: string;
  bodies: Record<GrahaId, Graha>;
  /** 1..12 宫：星座、守护星、宫内九曜 */
  houses: { house: number; signIndex: number; signName: string; rashiSa: string; lord: GrahaId; lordName: string; bodies: GrahaId[] }[];
  moonSignIndex: number;
  moonNakshatra: NakshatraPos;
  vimshottari: Vimshottari;
  aspects: GrahaDrishti[];
  yogas: YogaInfo[];
  /** 分盘：九分盘 D9（含 Navamsa Lagna 与十二宫） */
  navamsha: VargaChart;
  /** 十分盘 D10（事业） */
  dasamsa: VargaChart;
  /** 七分盘 D7（子女） */
  saptamsa: VargaChart;
  /** Panchanga 五要素（Tithi / Nakshatra / Yoga / Karana / Vara） */
  panchanga: Panchanga;
  /** 日/月合相（Amavasya 判定） */
  isNewMoonConj: boolean;
  /** 入参校验/口径提示（高纬宫位降级、历史时区、小数时间取整…） */
  warnings: string[];
}

const mod360 = (x: number) => { const r = x % 360; const v = r < 0 ? r + 360 : r; return v === 0 ? 0 : v; };
const signOf = (lon: number) => Math.floor(mod360(lon) / 30);

/** 12 星座中文名（白羊=0 … 双鱼=11） */
const SIGN_ZH = ['白羊', '金牛', '双子', '巨蟹', '狮子', '处女', '天秤', '天蝎', '射手', '摩羯', '水瓶', '双鱼'];

/**
 * Navamsha（D9）星座序号：每 3°20′ 一分，自白羊连续计数。
 *
 * 与经典分盘规则等价（故不必分动/不动/双宫写）：把黄道按 3°20′ 等分 108 段，
 * 第 n 段落 (n mod 12) 星座。白羊 0–3°20′→白羊、金牛 0–3°20′→摩羯（不动宫起第 9 宫）、
 * 双子 0–3°20′→天秤（双宫起第 5 宫），逐段对得上。testing 里用「四元素起点规则」独立复算。
 */
export function navamshaSign(lon: number): number {
  return Math.floor(mod360(lon) / (30 / 9)) % 12;
}

/**
 * Dasamsa（D10，事业）星座序号：每 3° 一分，共 10 分。
 * 经典规则（BPHS）：阳宫（白羊/双子/狮子/天秤/射手/水瓶，0 基序号为偶）自本宫起数，
 * 阴宫自第 9 宫起数；不能像 D9 那样用「连续 3° 取模」代替——白羊 0–3°→白羊，
 * 金牛 0–3°→摩羯（第 9 宫），若用取模会错成水瓶。
 */
export function dasamsaSign(lon: number): number {
  const l = mod360(lon);
  const s = Math.floor(l / 30);
  const into = l - s * 30;
  const k = Math.floor(into / 3);           // 0..9
  const base = s % 2 === 0 ? s : (s + 8) % 12; // 阳宫起本宫，阴宫起第 9 宫
  return (base + k) % 12;
}

/**
 * Saptamsa（D7，子女）星座序号：每 30/7 = 4°17′8.57″ 一分，共 7 分。
 * 经典规则（BPHS）：阳宫自本宫起数，阴宫自第 7 宫起数。
 */
export function saptamsaSign(lon: number): number {
  const l = mod360(lon);
  const s = Math.floor(l / 30);
  const into = l - s * 30;
  const k = Math.floor(into / (30 / 7));     // 0..6
  const base = s % 2 === 0 ? s : (s + 6) % 12; // 阳宫起本宫，阴宫起第 7 宫
  return (base + k) % 12;
}

function dignityOf(g: GrahaId, s: number): Graha['dignity'] {
  if (g === 'rahu' || g === 'ketu') return 'neutral'; // 罗计庙旺流派分歧，v1 不判
  if (EXALT_SIGN[g] === s) return 'exalted';
  if (debilSign(g) === s) return 'debilitated';
  if ((OWN_SIGNS[g as Exclude<GrahaId, 'rahu' | 'ketu'>] || []).includes(s)) return 'own';
  return 'neutral';
}

/** 月（或任意恒星黄经）所在 27 宿与足 */
function nakshatraOf(lon: number): NakshatraPos {
  const span = 360 / 27; // 13°20′
  const into = mod360(lon) / span;
  const index = Math.floor(into) % 27;
  const frac = into - Math.floor(into);
  const info = NAKSHATRAS[index];
  return { index, zh: info.zh, sa: info.sa, lord: info.lord, pada: Math.floor(frac * 4) + 1, elapsed: frac };
}

/* ---------------- 分盘（Varga）十二宫 ---------------- */

/**
 * 按「整宫制 + 该盘上升」排出分盘十二宫，并把九曜按各自分盘星座落宫。
 * 第 i 宫星座 = (分盘上升星座 + i) mod 12 —— 分盘同样整宫，不按度数切宫。
 */
function makeVarga(
  varga: VargaChart['varga'],
  vargaZh: string,
  lagnaLon: number,
  partSpan: number,
  lagnaSignIndex: number,
  signOfBody: (id: GrahaId) => number,
  present: GrahaId[],
): VargaChart {
  const into = mod360(lagnaLon) % 30;
  // 分盘内度数：本分段内的进度按比例拉到 30°，仅作展示（不影响宫位）
  const degInSign = (into % partSpan) * (30 / partSpan);
  const lagnaDms = toDms(lagnaSignIndex * 30 + degInSign);

  const houses: VargaHouse[] = Array.from({ length: 12 }, (_, i) => {
    const sIndex = (lagnaSignIndex + i) % 12;
    const lord = SIGN_LORD[sIndex];
    return {
      house: i + 1,
      signIndex: sIndex,
      signName: SIGN_ZH[sIndex],
      rashiSa: RASHI_SANSKRIT[sIndex],
      lord,
      lordName: GRAHA_ZH[lord],
      bodies: [] as GrahaId[],
    };
  });
  for (const id of present) {
    const h = ((signOfBody(id) - lagnaSignIndex + 12) % 12) + 1;
    houses[h - 1].bodies.push(id);
  }
  return {
    varga, vargaZh,
    lagnaSignIndex,
    lagnaSignName: SIGN_ZH[lagnaSignIndex],
    lagnaDms,
    houses,
  };
}

/* ---------------- Panchanga ---------------- */

/**
 * 计算 Panchanga 五要素。
 * 传入了 lat/lon 与本地钟面时刻时，Vara 按「日出换日」定（出生在日出前算前一日）；
 * 取不到日出（极区等）时退回钟面日期，并在 basis 上标明 'clock'。
 */
export function panchangaOf(
  sunLon: number,
  moonLon: number,
  clock: { year: number; month: number; day: number; hour: number; minute: number; second: number; lat: number; lonEast: number; utcOffsetHours: number },
): Panchanga {
  const elong = mod360(moonLon - sunLon);

  // Tithi：每 12° 一日，1..30
  const tithiNum = Math.floor(elong / 12) + 1;
  const isShukla = tithiNum <= 15;
  const paksha: 'shukla' | 'krishna' = isShukla ? 'shukla' : 'krishna';
  const numInPaksha = isShukla ? tithiNum : tithiNum - 15;
  const tithi: TithiInfo = {
    num: tithiNum,
    index: tithiNum - 1,
    name: `${isShukla ? '白月' : '黑月'}${TITHI_ZH_NUM[numInPaksha - 1]}`,
    sa: `${isShukla ? 'Shukla' : 'Krishna'} ${TITHI_SA[tithiNum - 1]}`,
    paksha,
    pakshaZh: isShukla ? '白分（上弦半月）' : '黑分（下弦半月）',
    elapsed: (elong % 12) / 12,
  };

  // Yoga：日+月黄经和，每 13°20′ 一个，1..27
  const sum = mod360(sunLon + moonLon);
  const yogaSpan = 360 / 27;
  const yogaIndex = Math.floor(sum / yogaSpan) % 27;
  const yoga: YogaPos = {
    index: yogaIndex,
    num: yogaIndex + 1,
    name: YOGA_NAMES[yogaIndex].sa,
    sa: YOGA_NAMES[yogaIndex].sa,
    zh: YOGA_NAMES[yogaIndex].zh,
    elapsed: (sum % yogaSpan) / yogaSpan,
  };

  // Karana：半个 Tithi = 6°，1..60
  const k = Math.floor(elong / 6); // 0..59
  const karanaNum = k + 1;
  let kNamed: number; // KARANA_NAMES 下标
  if (k === 0) kNamed = 0;                       // 1 Kimstughna
  else if (k >= 57) kNamed = 8 + (k - 57);       // 58 Shakuni / 59 Chatushpada / 60 Naga
  else kNamed = 1 + ((k - 1) % 7);               // 2..57 七名循环
  const karana: KaranaPos = {
    index: kNamed,
    num: karanaNum,
    name: KARANA_NAMES[kNamed].zh,
    sa: KARANA_NAMES[kNamed].sa,
    zh: KARANA_NAMES[kNamed].zh,
  };

  // Vara：七曜日，以日出为一日之始
  const civilWeekday = new Date(Date.UTC(clock.year, clock.month - 1, clock.day)).getUTCDay(); // 0=周日
  // 钟面时刻按「本地墙钟」编码成毫秒（不加时差）；sunriseLocalMs 同样已换算到本地墙钟，两者可直接比大小
  const birthLocalMs = Date.UTC(clock.year, clock.month - 1, clock.day, clock.hour, clock.minute, clock.second);
  const riseMs = sunriseLocalMs(clock);
  let varaIdx = civilWeekday;
  let basis: 'sunrise' | 'clock' = 'clock';
  let sunriseText: string | null = null;
  if (riseMs != null) {
    basis = 'sunrise';
    const rl = new Date(riseMs);
    sunriseText = `${String(rl.getUTCHours()).padStart(2, '0')}:${String(rl.getUTCMinutes()).padStart(2, '0')}`;
    if (birthLocalMs < riseMs) varaIdx = (civilWeekday + 6) % 7;
  }
  const vara: VaraPos = {
    index: varaIdx,
    name: VARA_NAMES[varaIdx].zh,
    sa: VARA_NAMES[varaIdx].sa,
    lord: VARA_NAMES[varaIdx].lord,
    lordName: GRAHA_ZH[VARA_NAMES[varaIdx].lord],
    basis,
    sunrise: sunriseText,
  };

  return { tithi, nakshatra: nakshatraOf(moonLon), yoga, karana, vara, elongation: elong };
}

/** 当日日出（本地时刻毫秒）；极区或库异常时返回 null */
function sunriseLocalMs(clock: { year: number; month: number; day: number; lat: number; lonEast: number; utcOffsetHours: number }): number | null {
  try {
    const obs = new Observer(clock.lat, clock.lonEast, 0);
    // 从前一日正午起找，保证拿到的是「本地这一日」的日出（当天 0 点起找会因已过日出而顺延到次日）
    const localNoonUtc = Date.UTC(clock.year, clock.month - 1, clock.day, 12, 0, 0) - clock.utcOffsetHours * 3600000;
    const start = MakeTime(new Date(localNoonUtc - 86400000));
    const rise = SearchRiseSet(Body.Sun, obs, +1, start, 2);
    if (!rise) return null;
    return rise.date.getTime() + clock.utcOffsetHours * 3600000;
  } catch {
    return null;
  }
}

/** Vimshottari 大运：从出生宿主星起、按 NAK_LORD_SEQ 轮转，第一段取出生余量 */
function vimshottari(moonLon: number): Vimshottari {
  const ns = nakshatraOf(moonLon);
  // 出生宿还剩的比例 → 出生时大运主星剩余年限
  const startLord = ns.lord;
  const startIdx = NAK_LORD_SEQ.indexOf(startLord);
  const firstFull = MDASA_YEARS[startLord];
  const firstRemain = firstFull * (1 - ns.elapsed);

  const sequence: DasaPeriod[] = [];
  // 以「出生=0岁」为零点：出生即走出生宿主星大运，时长为该宿剩余比例；之后按序列接完整大运
  let cursor = 0;
  for (let k = 0; k < 9; k++) {
    const g = NAK_LORD_SEQ[(startIdx + k) % 9];
    const years = k === 0 ? firstRemain : MDASA_YEARS[g];
    sequence.push({
      graha: g, name: GRAHA_ZH[g],
      startYear: +cursor.toFixed(3), endYear: +(cursor + years).toFixed(3), years: +years.toFixed(3),
    });
    cursor += years;
  }
  const at = (age: number) => sequence.find(p => age >= p.startYear && age < p.endYear) ?? sequence[sequence.length - 1];
  const md = at(0);

  // 出生小限 Antardasha：
  // 大运的真实起点在出生之前——出生时月亮已走完本宿 elapsed 比例，即本运已走了
  // MDASA_YEARS[lord]×elapsed 年（真实起点 = -full×elapsed，与上面 startYear=0 的
  // 出生对齐表只差一个常量偏移，故 sequence 语义不变）。
  // 小限必须从「出生前那个真实起点」按各星年限/120 的比例切分，再找包含 age=0 的那一段；
  // 若从 0 起切，age=0 恒落在第一段，小限就恒等于大运主星（旧 bug）。
  const mdIdx = NAK_LORD_SEQ.indexOf(md.graha);
  const mdFull = MDASA_YEARS[md.graha];
  const realStart = -mdFull * ns.elapsed;
  let ad: DasaPeriod = {
    graha: md.graha, name: md.name,
    startYear: +realStart.toFixed(3), endYear: +(realStart + mdFull).toFixed(3), years: +mdFull.toFixed(3),
  };
  let ac = realStart;
  for (let k = 0; k < 9; k++) {
    const g = NAK_LORD_SEQ[(mdIdx + k) % 9];
    const len = MDASA_YEARS[g] / 120 * mdFull;
    const s = ac, e = ac + len;
    if (0 >= s - 1e-9 && 0 < e + 1e-9) {
      ad = { graha: g, name: GRAHA_ZH[g], startYear: +s.toFixed(3), endYear: +e.toFixed(3), years: +len.toFixed(3) };
      break;
    }
    ac = e;
  }

  return {
    birthStar: ns,
    mahadasha: { graha: md.graha, name: md.name, startYear: md.startYear, endYear: md.endYear },
    antardasha: { graha: ad.graha, name: ad.name, startYear: ad.startYear, endYear: ad.endYear },
    sequence,
  };
}

/** 特殊相位（除普遍第7宫外）：火 4/8、木 5/9、土 3/10；罗计 v1 只取第7宫 */
const SPECIAL_DRISHTI: Partial<Record<GrahaId, number[]>> = {
  mars: [4, 8],
  jupiter: [5, 9],
  saturn: [3, 10],
};

export function paipanVedic(rawInput: AstroInput): VedicChart {
  const input = normalizeAstroInput(rawInput);
  // 用 utcMsOf 而不是 Date.UTC：后者把 0–99 年映射成 1900+year（虽已由入口年份区间拦住）
  const d = new Date(utcMsOf(input.year, input.month, input.day, input.hour, input.minute, input.second)
    - input.utcOffsetHours * 3600000);
  const y = d.getUTCFullYear(), mo = d.getUTCMonth() + 1, day = d.getUTCDate();
  const h = d.getUTCHours(), mi = d.getUTCMinutes(), s = d.getUTCSeconds();

  const eng = engine();
  const jdUt = julianDay(y, mo, day, h, mi, s);
  const chart = eng.chart(y, mo, day, h, mi, s, input.lat, input.lonEast, {
    houseSystem: 'whole_sign',
    zodiac: 'sidereal:lahiri',
  });

  // 岁差值（展示用）：用太阳的回归-恒星黄经差反推 Lahiri 岁差，不依赖库内部 jdTT
  let ayan = 0;
  try {
    const sunTrop = eng.position('sun', jdUt, { zodiac: 'tropical' });
    const sunSid = eng.position('sun', jdUt, { zodiac: 'sidereal:lahiri' });
    ayan = mod360(sunTrop.lon - sunSid.lon);
  } catch { ayan = 0; }

  const ascLon = mod360(chart.angles.asc);
  const ascDms = toDms(ascLon);
  const ascSignIndex = signOf(ascDms.lon); // 同口径：分钟进位跨星座时上升点一起进

  // 九曜：七政 + 罗睺(mean_node) + 计都(+180)
  const bodies = {} as Record<GrahaId, Graha>;
  const sidLon: Partial<Record<GrahaId, number>> = {};
  for (const id of ['sun', 'moon', 'mars', 'mercury', 'jupiter', 'venus', 'saturn'] as GrahaId[]) {
    const p = chart.bodies[id];
    if (p) sidLon[id] = mod360(p.lon);
  }
  const rahuP = chart.bodies['mean_node'];
  if (rahuP) {
    sidLon.rahu = mod360(rahuP.lon);
    sidLon.ketu = mod360(rahuP.lon + 180);
  }

  for (const id of GRAHA_ORDER) {
    const lon = sidLon[id];
    if (lon == null) continue;
    const dms = toDms(lon);
    const sIndex = signOf(dms.lon); // 与展示的度分同口径（分钟进位到 30° 时星座同步进一）
    const house = ((sIndex - ascSignIndex + 12) % 12) + 1;
    bodies[id] = {
      id,
      name: GRAHA_ZH[id],
      sa: GRAHA_SANSKRIT[id],
      short: GRAHA_SHORT[id],
      lon,
      dms,
      signIndex: sIndex,
      signName: ['白羊', '金牛', '双子', '巨蟹', '狮子', '处女', '天秤', '天蝎', '射手', '摩羯', '水瓶', '双鱼'][sIndex],
      rashiSa: RASHI_SANSKRIT[sIndex],
      house,
      retrograde: id === 'ketu' ? true : (id === 'rahu' ? !!rahuP?.retrograde : !!chart.bodies[id]?.retrograde),
      dignity: dignityOf(id, sIndex),
      navamshaSign: navamshaSign(lon),
      dasamsaSign: dasamsaSign(lon),
      saptamsaSign: saptamsaSign(lon),
    };
  }

  // 十二宫（整宫，从上升起）
  const houses = Array.from({ length: 12 }, (_, i) => {
    const sIndex = (ascSignIndex + i) % 12;
    const lord = SIGN_LORD[sIndex];
    return {
      house: i + 1,
      signIndex: sIndex,
      signName: SIGN_ZH[sIndex],
      rashiSa: RASHI_SANSKRIT[sIndex],
      lord,
      lordName: GRAHA_ZH[lord],
      bodies: [] as GrahaId[],
    };
  });
  for (const id of GRAHA_ORDER) {
    const b = bodies[id];
    if (b) houses[b.house - 1].bodies.push(id);
  }

  const lagnaLord = SIGN_LORD[ascSignIndex];
  const moonLon = sidLon.moon ?? 0;
  const moonSignIndex = signOf(moonLon);
  const moonNakshatra = nakshatraOf(moonLon);
  const vim = vimshottari(moonLon);

  // Graha Drishti 相位（只记录"某星照到某星"，普遍第7宫 + 特殊相位）
  const aspects: GrahaDrishti[] = [];
  const present = GRAHA_ORDER.filter(g => bodies[g]);
  for (const from of present) {
    const fromH = bodies[from].house;
    const targets = new Set<number>([7, ...(SPECIAL_DRISHTI[from] ?? [])]);
    for (const to of present) {
      if (to === from) continue;
      const diff = ((bodies[to].house - fromH + 12) % 12) + 1; // 被照到的宫序数 1..12
      if (targets.has(diff)) aspects.push({ from, to, house: diff });
    }
  }

  // 日月合朔（Amavasya，合相近 ≤6°）：仅作客观天象标记，不下吉凶
  // 判定口径：黄经差 = 月亮 - 太阳 归一化到 0..360，距 0°（合相）不超过 6° 即新月；
  // 归一化后取 min(差, 360-差) 得到与 0° 的角距（旧写法算的是距 180° 的角距，把满月判成新月）。
  let isNewMoonConj = false;
  if (sidLon.sun != null && sidLon.moon != null) {
    const elong = mod360(sidLon.moon - sidLon.sun);
    const sepFromConj = Math.min(elong, 360 - elong);
    isNewMoonConj = sepFromConj <= 6;
  }

  // 瑜伽（Parashari 经典组合；present=false 时供 UI 显示"未构成"）
  const kendra = new Set([1, 4, 7, 10]); // 角宫
  const trikona = new Set([1, 5, 9]);    // 三角宫
  const conj = (a: GrahaId, b: GrahaId) => !!bodies[a] && !!bodies[b] && bodies[a].signIndex === bodies[b].signIndex;
  // Gajakesari：月与木互成角宫（1/4/7/10）
  const gajakesari = bodies.moon && bodies.jupiter &&
    kendra.has(((bodies.jupiter.house - bodies.moon.house + 12) % 12) + 1);
  // Budhaditya：日水同宫
  const budhaditya = conj('sun', 'mercury');
  // Neecha Bhanga（简化）：某星陷落，但其星座守护星在角宫或三角宫（强位）
  let nbMembers: GrahaId[] = [];
  (['mars', 'mercury', 'jupiter', 'venus', 'saturn', 'moon', 'sun'] as GrahaId[]).forEach(g => {
    if (bodies[g]?.dignity === 'debilitated') {
      const lord = SIGN_LORD[bodies[g].signIndex];
      if (bodies[lord] && (kendra.has(bodies[lord].house) || trikona.has(bodies[lord].house))) nbMembers.push(g);
    }
  });
  // Raja Yoga（简化）：角宫主与三角宫主同宫或互照（命主=1宫主天然角宫主）
  const lordOfHouse = (n: number) => SIGN_LORD[(ascSignIndex + n - 1) % 12];
  const kendraLords = new Set([1, 4, 7, 10].map(lordOfHouse));
  const trikonaLords = new Set([1, 5, 9].map(lordOfHouse));
  let rajaMembers: GrahaId[] = [];
  const grahaSet = present.filter(g => g !== 'rahu' && g !== 'ketu');
  for (const a of grahaSet) for (const b of grahaSet) {
    if (a >= b) continue;
    const aK = kendraLords.has(a), aT = trikonaLords.has(a);
    const bK = kendraLords.has(b), bT = trikonaLords.has(b);
    if ((aK && bT) || (aT && bK)) {
      if (bodies[a].signIndex === bodies[b].signIndex) {
        if (!rajaMembers.includes(a)) rajaMembers.push(a);
        if (!rajaMembers.includes(b)) rajaMembers.push(b);
      }
    }
  }

  const yogas: YogaInfo[] = [
    { key: 'gajakesari', sa: 'Gajakesari Yoga', zh: '象狮瑜伽', present: !!gajakesari, members: ['moon', 'jupiter'],
      note: '月亮与木星互居角宫（1/4/7/10）。传统称利名声、智慧与稳境。出《Brihat Parashara Hora Shastra》。' },
    { key: 'budhaditya', sa: 'Budhaditya Yoga', zh: '日水瑜伽', present: budhaditya, members: ['sun', 'mercury'],
      note: '太阳与水星同宫。传统称利才智、学识、表达。出《Brihat Parashara Hora Shastra》。' },
    { key: 'neecha_bhanga', sa: 'Neecha Bhanga Raja Yoga', zh: '破陷转贵', present: nbMembers.length > 0, members: nbMembers,
      note: '有星陷落（Neecha），但其星座守护星落角宫/三角宫，传统认为困局可被取消、转为助力（规则取通行简化版）。' },
    { key: 'raja', sa: 'Raja Yoga（简化判定）', zh: '王瑜伽', present: rajaMembers.length > 0, members: rajaMembers,
      note: '角宫主与三角宫主同宫（通行简化版；严格判定另有互照/交换等多条）。传统称利成就与地位。' },
  ];

  // 分盘：D9 / D10 / D7 —— 各自以「上升在该分盘的星座」为第 1 宫，整宫顺延
  const d9Lagna = navamshaSign(ascLon);
  const d10Lagna = dasamsaSign(ascLon);
  const d7Lagna = saptamsaSign(ascLon);
  const navamsha = makeVarga('D9', '九分盘 Navamsha（婚姻/内在力量）', ascLon, 30 / 9, d9Lagna,
    (id) => bodies[id].navamshaSign, present);
  const dasamsa = makeVarga('D10', '十分盘 Dasamsa（事业）', ascLon, 3, d10Lagna,
    (id) => bodies[id].dasamsaSign, present);
  const saptamsa = makeVarga('D7', '七分盘 Saptamsa（子女）', ascLon, 30 / 7, d7Lagna,
    (id) => bodies[id].saptamsaSign, present);

  // Panchanga 五要素（用同一个恒星黄经口径）
  const panchanga = panchangaOf(
    sidLon.sun ?? 0, moonLon,
    {
      year: input.year, month: input.month, day: input.day,
      hour: input.hour, minute: input.minute, second: input.second,
      lat: input.lat, lonEast: input.lonEast, utcOffsetHours: input.utcOffsetHours,
    },
  );

  return {
    jdUt,
    ayanamsaName: 'Lahiri',
    ayanamsaDeg: +ayan.toFixed(4),
    asc: ascDms,
    ascSignIndex,
    ascSignName: SIGN_ZH[ascSignIndex],
    lagnaLord,
    lagnaLordName: GRAHA_ZH[lagnaLord],
    bodies,
    houses,
    moonSignIndex,
    moonNakshatra,
    vimshottari: vim,
    aspects,
    yogas,
    navamsha,
    dasamsa,
    saptamsa,
    panchanga,
    isNewMoonConj,
    warnings: mergeWarnings(input.warnings, highLatitudeWarnings(input.lat)),
  };
}
