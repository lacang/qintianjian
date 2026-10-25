/**
 * 西方古典占星 —— 古典推运：Profections（小限/年限）+ Firdaria（主限/次限）
 *
 * 底座 caelus@0.25.0（MIT）。只排时间线事实，不做吉凶推断。
 * - Profections：每年顺推一宫（整宫），年主星=所落星座守护星；另给当前月小限。
 * - Firdaria：昼盘日→金→水→月→土→木→火→北交→南交；夜盘月亮起。Chaldean 次限。
 */
import { Engine } from 'caelus';
import { embeddedData } from 'caelus/data-embedded';
import { profection, firdariaAt, firdariaSequence, julianDay } from 'caelus';
import { PLANET_ZH, SIGN_ZH } from './astro-constants.js';

let _engine: Engine | null = null;
function engine(): Engine {
  if (!_engine) _engine = new Engine(embeddedData as never);
  return _engine;
}

export interface TimingInput {
  /** 本命本地墙钟（同 AstroInput） */
  birth: {
    year: number; month: number; day: number;
    hour: number; minute?: number; second?: number;
    lat: number; lonEast: number; utcOffsetHours: number;
  };
  /** 目标时刻（任意绝对时刻；不传默认当前设备时间） */
  at?: Date;
}

/** 扁平出生入参（与 app BIRTH 配置一致） */
export interface FlatBirth {
  year: number; month: number; day: number;
  hour: number; minute?: number; second?: number;
  lat?: number; latitude?: number; lonEast?: number; longitude?: number;
  utcOffsetHours?: number;
}

export interface ProfectionInfo {
  ageYears: number;
  month: number;
  annual: { signName: string; house: number; lord: string; lordName: string };
  monthly: { signName: string; house: number; lord: string; lordName: string };
}

export interface FirdariaInfo {
  day: boolean;
  major: string;
  majorName: string;
  sub: string;
  subName: string;
}

/** 本地墙钟分量 + UTC 偏移 → UT 儒略日 */
function natalJdUt(i: TimingInput['birth']): number {
  const d = new Date(Date.UTC(i.year, i.month - 1, i.day, i.hour, i.minute ?? 0, i.second ?? 0));
  d.setUTCMinutes(d.getUTCMinutes() - i.utcOffsetHours * 60);
  return julianDay(d.getUTCFullYear(), d.getUTCMonth() + 1, d.getUTCDate(), d.getUTCHours(), d.getUTCMinutes(), d.getUTCSeconds());
}

const ZH = (id: string): string =>
  (Object.prototype.hasOwnProperty.call(PLANET_ZH, id) ? PLANET_ZH[id as keyof typeof PLANET_ZH] : id);

/** 兼容扁平入参（直接传出生字段，等同 BIRTH）与 {birth, at} 嵌套入参 */
function normalizeTiming(input: TimingInput | FlatBirth): { birth: TimingInput['birth']; at?: Date } {
  if ('birth' in input && input.birth) return input as TimingInput;
  const f = input as FlatBirth;
  const lat = f.lat ?? f.latitude;
  const lonEast = f.lonEast ?? f.longitude;
  return {
    birth: {
      year: f.year, month: f.month, day: f.day, hour: f.hour,
      minute: f.minute, second: f.second,
      lat: lat as number, lonEast: lonEast as number,
      utcOffsetHours: f.utcOffsetHours ?? 8,
    },
    at: undefined,
  };
}

export function guDianTuiYun(rawInput: TimingInput | FlatBirth): { profection: ProfectionInfo; firdaria: FirdariaInfo } {
  const input = normalizeTiming(rawInput);
  const eng = engine();
  const natal = natalJdUt(input.birth);

  const at = input.at ?? new Date();
  const atJd = julianDay(
    at.getUTCFullYear(), at.getUTCMonth() + 1, at.getUTCDate(),
    at.getUTCHours(), at.getUTCMinutes(), at.getUTCSeconds(),
  );

  // 上升星座序号：独立重算一次本命盘（轻量），ascSign 也可由调用方从 NatalChart 传入。
  const bd = input.birth;
  const nd = new Date(Date.UTC(bd.year, bd.month - 1, bd.day, bd.hour, bd.minute ?? 0, bd.second ?? 0));
  nd.setUTCMinutes(nd.getUTCMinutes() - bd.utcOffsetHours * 60);
  const natalChart = eng.chart(
    nd.getUTCFullYear(), nd.getUTCMonth() + 1, nd.getUTCDate(),
    nd.getUTCHours(), nd.getUTCMinutes(), nd.getUTCSeconds(),
    bd.lat, bd.lonEast, 'whole_sign',
  );
  const ascSign = Math.floor((((natalChart.angles.asc % 360) + 360) % 360) / 30);

  const p = profection(ascSign, natal, atJd);
  const f = firdariaAt(eng, natal, atJd, bd.lat, bd.lonEast);

  return {
    profection: {
      ageYears: p.age_years,
      month: p.month,
      annual: {
        signName: SIGN_ZH[p.annual.sign_index] ?? p.annual.sign,
        house: p.annual.house,
        lord: p.annual.lord ?? '',
        lordName: ZH(p.annual.lord ?? ''),
      },
      monthly: {
        signName: SIGN_ZH[p.monthly.sign_index] ?? p.monthly.sign,
        house: p.monthly.house,
        lord: p.monthly.lord ?? '',
        lordName: ZH(p.monthly.lord ?? ''),
      },
    },
    firdaria: {
      day: !!f.day,
      major: f.major ?? '',
      majorName: ZH(f.major ?? ''),
      sub: f.sub ?? '',
      subName: ZH(f.sub ?? ''),
    },
  };
}

// Firdaria 9 主限完整时间轴（从出生年开始）。
export interface FirdariaPeriod {
  lord: string;        // 英文 id (sun/moon/...)
  lordName: string;    // 中文名 (太阳/月亮/...)
  startYear: number;   // 起始年（出生起算）
  endYear: number;     // 终止年
  age: number;         // 起始年龄
  years: number;       // 持续年数
}
export function listFirdariaPeriods(day: boolean, birthYear: number): FirdariaPeriod[] {
  const seq = firdariaSequence(day); // Array<[string, number]>
  const out: FirdariaPeriod[] = [];
  let acc = 0;
  for (const [lord, years] of seq) {
    out.push({
      lord,
      lordName: ZH(lord),
      startYear: birthYear + acc,
      endYear: birthYear + acc + years,
      age: acc,
      years,
    });
    acc += years;
  }
  return out;
}

// Profection 年度宫位轮转（整宫法，从 ASC 宫位出发）。
// 返回每年对应的小限宫位（0=Aries 白羊）和宫主。
export function listProfectionYears(ascSignIndex: number, birthYear: number, fromAge = 0, toAge = 80): Array<{
  age: number;
  year: number;
  signName: string;
  signIndex: number;
}> {
  const out: Array<{ age: number; year: number; signName: string; signIndex: number }> = [];
  for (let age = fromAge; age <= toAge; age++) {
    const idx = (ascSignIndex + age) % 12;
    out.push({
      age,
      year: birthYear + age,
      signName: SIGN_ZH[idx] ?? String(idx),
      signIndex: idx,
    });
  }
  return out;
}
