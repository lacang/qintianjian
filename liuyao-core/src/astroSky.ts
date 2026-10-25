/**
 * 西方古典占星 —— 钦天监首页「当下天象」
 *
 * - 当下七政/三王：星座、黄经、顺逆行（caelus chartAt，绝对时刻，时区无关）。
 * - 月相：照明度/月相名/下一四个月相时刻（auseklis getMoonPhase，内部转调 astronomy-engine）。
 * - 近期事件：未来 35 天太阳换座 + 水星留逆/留顺（auseklis events），时刻为 ISO(UTC)，
 *   展示层自行 toLocaleString('zh-CN', { timeZone: 'Asia/Shanghai' })。
 *
 * 全部离线可算、无星历文件、不联网。
 */
import { Engine } from 'caelus';
import { embeddedData } from 'caelus/data-embedded';
import { julianDay } from 'caelus';
import {
  getMoonPhase,
  findIngresses,
  findRetrogradePeriods,
} from 'auseklis/ephemeris/events';
import {
  PLANET_ORDER, PLANET_ZH, SIGN_ZH, moonPhaseName, QUARTER_ZH,
  type PlanetId,
} from './astro-constants.js';

let _engine: Engine | null = null;
function engine(): Engine {
  if (!_engine) _engine = new Engine(embeddedData as never);
  return _engine;
}

export interface SkyBody {
  id: PlanetId;
  name: string;
  signName: string;
  signIndex: number;
  lon: number;
  retrograde: boolean;
}

export interface QuarterEvent {
  name: string;       // 新月/上弦/满月/下弦
  iso: string;        // UTC ISO
}

export interface IngressEvent {
  body: string;
  bodyName: string;
  signName: string;
  direction: 'direct' | 'retrograde';
  iso: string;
}

export interface MercuryRetro {
  stationRetrogradeIso: string;  // 留→逆行
  stationDirectIso: string;      // 留→顺行
  startSignName: string;
  endSignName: string;
  /** 'now'=当前正在水逆；'upcoming'=窗口内即将开始 */
  status: 'now' | 'upcoming';
}

export interface Tianxiang {
  at: string;                 // 计算所用绝对时刻 ISO(UTC)
  bodies: SkyBody[];
  moon: {
    illumination: number;    // 0..1
    phaseName: string;        // 中文月相（按角距命名）
    angle: number;            // 日月黄经差
    phase01: number;          // 月相相位 0(朔)~0.5(望)~1，用于精确绘制月牙
    ageDays: number;          // 月龄（天，约 0~29.53）
    signName: string;
    nextQuarters: QuarterEvent[];
  };
  /** 未来 35 天太阳换座（含逆行换座如有） */
  ingresses: IngressEvent[];
  /** 当前水逆或下一次水逆窗口 */
  mercuryRetro: MercuryRetro | null;
}

/** 首页固定用沈阳坐标；首页只取星座/逆行，坐标对黄经无影响 */
const HOME_LAT = 41.8057;
const HOME_LON = 123.4328;

export function shouyeTianxiang(now: Date = new Date(), lookaheadDays = 35): Tianxiang {
  const eng = engine();
  const jd = julianDay(
    now.getUTCFullYear(), now.getUTCMonth() + 1, now.getUTCDate(),
    now.getUTCHours(), now.getUTCMinutes(), now.getUTCSeconds(),
  );
  const chart = eng.chartAt(jd, HOME_LAT, HOME_LON, 'whole_sign');

  const bodies: SkyBody[] = [];
  for (const id of PLANET_ORDER) {
    const raw = chart.bodies[id];
    if (!raw) continue;
    const lon = ((raw.lon % 360) + 360) % 360;
    bodies.push({
      id,
      name: PLANET_ZH[id],
      signName: SIGN_ZH[Math.floor(lon / 30)],
      signIndex: Math.floor(lon / 30),
      lon,
      retrograde: !!raw.retrograde,
    });
  }

  // 月相
  const mp = getMoonPhase(now);
  const sunLon = bodies.find((b) => b.id === 'sun')?.lon ?? 0;
  const moonLon = ((Number(mp.moonLongitude) % 360) + 360) % 360;
  const angle = ((moonLon - sunLon) % 360 + 360) % 360;

  const from = now;
  const to = new Date(now.getTime() + lookaheadDays * 86400000);

  // 太阳换座
  const ingresses: IngressEvent[] = findIngresses('Sun', from, to).map((e) => ({
    body: 'Sun',
    bodyName: '太阳',
    signName: SIGN_ZH[enSignIndex(e.enters)] ?? e.enters,
    direction: (e.direction as 'direct' | 'retrograde') ?? 'direct',
    iso: e.datetime,
  }));

  // 水星逆行：查过去 30 天 ~ 未来 35 天，判定当前是否在窗口内
  const mercuryRetro = (() => {
    const rFrom = new Date(now.getTime() - 30 * 86400000);
    const list = findRetrogradePeriods('Mercury', rFrom, to);
    if (!list.length) return null;
    const t = now.getTime();
    // 当前正在逆
    const cur = list.find((r) => new Date(r.stationRetrograde).getTime() <= t && t <= new Date(r.stationDirect).getTime());
    if (cur) {
      return mkMerc(cur, 'now');
    }
    // 下一次将开始
    const up = list
      .filter((r) => new Date(r.stationRetrograde).getTime() > t)
      .sort((a, b) => +new Date(a.stationRetrograde) - +new Date(b.stationRetrograde))[0];
    return up ? mkMerc(up, 'upcoming') : null;
  })();

  return {
    at: now.toISOString(),
    bodies,
    moon: {
      illumination: Number(mp.illumination),
      phaseName: moonPhaseName(angle),
      angle,
      phase01: angle / 360,
      ageDays: angle / 360 * 29.530588853,
      signName: SIGN_ZH[Math.floor(moonLon / 30)],
      nextQuarters: (mp.nextQuarters ?? []).map((q) => ({
        name: QUARTER_ZH[q.quarter] ?? q.quarter,
        iso: q.datetime,
      })),
    },
    ingresses,
    mercuryRetro,
  };
}

function enSignIndex(en: string): number {
  const map: Record<string, number> = {
    Aries: 0, Taurus: 1, Gemini: 2, Cancer: 3, Leo: 4, Virgo: 5,
    Libra: 6, Scorpio: 7, Sagittarius: 8, Capricorn: 9, Aquarius: 10, Pisces: 11,
  };
  return map[en] ?? 0;
}

function mkMerc(r: {
  stationRetrograde: string; stationDirect: string;
  startSign: string; endSign: string;
}, status: 'now' | 'upcoming'): MercuryRetro {
  return {
    stationRetrogradeIso: r.stationRetrograde,
    stationDirectIso: r.stationDirect,
    startSignName: SIGN_ZH[enSignIndex(r.startSign)] ?? r.startSign,
    endSignName: SIGN_ZH[enSignIndex(r.endSign)] ?? r.endSign,
    status,
  };
}
