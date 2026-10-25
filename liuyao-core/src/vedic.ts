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
import {
  normalizeAstroInput,
  type AstroInput, type Dms,
} from './astro.js';

/** 绝对黄经 → 星座内度分（与 astro.ts 同口径） */
function toDms(lon: number): Dms {
  const norm = ((lon % 360) + 360) % 360;
  const signIndex = Math.floor(norm / 30);
  const inSign = norm - signIndex * 30;
  const degree = Math.floor(inSign);
  const minute = Math.round((inSign - degree) * 60);
  if (minute >= 60) return { degree: degree + 1 >= 30 ? 0 : degree + 1, minute: 0, lon: norm };
  return { degree, minute, lon: norm };
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
  { zh: '柳宿', sa: 'Pushya', lord: 'saturn' },
  { zh: '星宿', sa: 'Ashlesha', lord: 'mercury' },
  { zh: '张宿', sa: 'Magha', lord: 'ketu' },
  { zh: '翼宿', sa: 'Purva Phalguni', lord: 'venus' },
  { zh: '轸宿', sa: 'Uttara Phalguni', lord: 'sun' },
  { zh: '角宿', sa: 'Hasta', lord: 'moon' },
  { zh: '亢宿', sa: 'Chitra', lord: 'mars' },
  { zh: '氐宿', sa: 'Swati', lord: 'rahu' },
  { zh: '房宿', sa: 'Vishakha', lord: 'jupiter' },
  { zh: '心宿', sa: 'Anuradha', lord: 'saturn' },
  { zh: '尾宿', sa: 'Jyeshtha', lord: 'mercury' },
  { zh: '箕宿', sa: 'Mula', lord: 'ketu' },
  { zh: '斗宿', sa: 'Purva Ashadha', lord: 'venus' },
  { zh: '牛宿', sa: 'Uttara Ashadha', lord: 'sun' },
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
  /** 日/月合相（Amavasya 判定） */
  isNewMoonConj: boolean;
}

const mod360 = (x: number) => ((x % 360) + 360) % 360;
const signOf = (lon: number) => Math.floor(mod360(lon) / 30);

/** Navamsha（D9）星座序号：每宿 3°20′，从白羊起算；罗计同法 */
function navamshaSign(lon: number): number {
  return Math.floor(mod360(lon) / (30 / 9)) % 12;
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

  // 出生小限：在当前大运内按各星年限比例（年限/120）分配，从大运主星起轮转
  const mdIdx = NAK_LORD_SEQ.indexOf(md.graha);
  let ad: DasaPeriod = { graha: md.graha, name: md.name, startYear: md.startYear, endYear: md.endYear, years: md.years };
  let ac = md.startYear;
  for (let k = 0; k < 9; k++) {
    const g = NAK_LORD_SEQ[(mdIdx + k) % 9];
    const len = MDASA_YEARS[g] / 120 * MDASA_YEARS[md.graha];
    const s = ac, e = ac + len;
    if (0 >= s && 0 < e) {
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
  const d = new Date(Date.UTC(input.year, input.month - 1, input.day, input.hour, input.minute, input.second));
  d.setUTCMinutes(d.getUTCMinutes() - input.utcOffsetHours * 60);
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
  const ascSignIndex = signOf(ascLon);

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
    const sIndex = signOf(lon);
    const house = ((sIndex - ascSignIndex + 12) % 12) + 1;
    bodies[id] = {
      id,
      name: GRAHA_ZH[id],
      sa: GRAHA_SANSKRIT[id],
      short: GRAHA_SHORT[id],
      lon,
      dms: toDms(lon),
      signIndex: sIndex,
      signName: ['白羊', '金牛', '双子', '巨蟹', '狮子', '处女', '天秤', '天蝎', '射手', '摩羯', '水瓶', '双鱼'][sIndex],
      rashiSa: RASHI_SANSKRIT[sIndex],
      house,
      retrograde: id === 'ketu' ? true : (id === 'rahu' ? !!rahuP?.retrograde : !!chart.bodies[id]?.retrograde),
      dignity: dignityOf(id, sIndex),
      navamshaSign: navamshaSign(lon),
    };
  }

  // 十二宫（整宫，从上升起）
  const SIGN_ZH = ['白羊', '金牛', '双子', '巨蟹', '狮子', '处女', '天秤', '天蝎', '射手', '摩羯', '水瓶', '双鱼'];
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
  let isNewMoonConj = false;
  if (sidLon.sun != null && sidLon.moon != null) {
    const sep = 180 - Math.abs(((sidLon.moon - sidLon.sun + 540) % 360) - 180); // 0=合 180=冲
    isNewMoonConj = sep <= 6;
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

  return {
    jdUt,
    ayanamsaName: 'Lahiri',
    ayanamsaDeg: +ayan.toFixed(4),
    asc: toDms(ascLon),
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
    isNewMoonConj,
  };
}
