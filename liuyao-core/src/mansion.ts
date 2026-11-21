/**
 * 实时中国传统星象 —— 二十八宿躔次引擎（纯天文历法事实，不作吉凶）
 *
 * 能力：
 * - 给定时刻，把 28 颗距星由 J2000 平位置旋转到当日真赤道（EQD）/真黄道（ECT）；
 * - 计算七政（日月五星，可选三王）各自躔何宿、宿内入宿度（赤道、黄道两套并列）；
 * - 日躔、月离、值宿（月离所居/值日宿）、昏明中星（南中天之宿）；
 * - 宿内度数同时给 360° 制与《授时历》古度（365.2575 制），并并列《授时历》文献宿度对照。
 *
 * 七政位置复用 caelus 单时刻多体 chartAt：其 ChartBody 已带
 *   lon/lat（当日真黄道，true ecliptic of date）
 *   ra/dec（当日真赤道，true equinox of date）
 * 距星则用 astronomy-engine 的 Rotation_EQJ_EQD / Rotation_EQJ_ECT 自行旋转，
 * 保证恒星与行星处在完全同一「当日真」坐标架内，分区无系统偏差。
 *
 * 觜参现代逆序由实测坐标自然产生；但**段落的宿名归属**按传统宿度（觜窄参宽）纠正：
 * 升序里「参紧接觜」的逆序相邻对，其两段名称互换（详见 mansionLabels），
 * 否则 3.2% 的黄道位置会把觜/参叫反（审计 P2-5）。距星本身的元数据不改。
 */
import { Engine } from 'caelus';
import { embeddedData } from 'caelus/data-embedded';
import { julianDay } from 'caelus';
import { InvalidDateError } from './validate.js';
import {
  Vector, MakeTime, RotationMatrix, RotateVector,
  Rotation_EQJ_EQD, Rotation_EQJ_ECT, Rotation_EQD_EQJ,
  SiderealTime, SphereFromVector, EquatorFromVector,
} from 'astronomy-engine';
import {
  MANSIONS, GU_DU_ZHOUTIAN,
  type MansionMeta, type SiShou,
} from './mansions-data.js';
import { PLANET_ORDER, PLANET_ZH, SEVEN, type PlanetId } from './astro-constants.js';

let _engine: Engine | null = null;
function engine(): Engine {
  if (!_engine) _engine = new Engine(embeddedData as never);
  return _engine;
}

const DEG = Math.PI / 180;
function mod360(x: number): number {
  return ((x % 360) + 360) % 360;
}

/** 观测地理坐标（默认北京/沈阳一带；仅中星/南中天与升起有关，入宿本身与地点无关） */
export interface MansionObserver {
  lat: number;
  lonEast: number;
}
const DEFAULT_OBS: MansionObserver = { lat: 39.9042, lonEast: 116.4074 }; // 北京

export interface MansionBoundary {
  /** 宿名（传统序名） */
  name: string;
  /** 该宿距星在指定坐标架内的经度（赤经或黄经，度） */
  boundaryLon: number;
}

export interface MansionFrame {
  /** 'eqd'=当日真赤道（传统正朔）；'ect'=当日真黄道（七政四余） */
  frame: 'eqd' | 'ect';
  /** 28 宿按本坐标架内经度【升序】排列后的西界经度（度，0..360） */
  ordered: Array<{ meta: MansionMeta; lon: number }>;
  /** 与 ordered 平行的「该段归属宿名」：觜参逆序对已互换，其余与 meta.name 相同 */
  labels: string[];
}

export interface BodyInMansion {
  id: PlanetId;
  name: string;
  /** 所躔宿（传统宿名） */
  mansion: string;
  /** 所属四象 */
  sishou: SiShou;
  /** 经度（赤经或黄经，度） */
  lon: number;
  /** 入宿度：自本宿距星起向东的角距（度，360 制） */
  ruDu: number;
  /** 入宿度（古度，365.2575 制），即传统「宿内 X 度」 */
  ruGuDu: number;
  /** 顺/逆行（行星；日、月恒为顺） */
  retrograde: boolean;
  /** 是否落于觜参逆序区（现代实测） */
  inverted: boolean;
}

export interface MansionSnapshot {
  at: string;                     // ISO(UTC)
  frame: 'eqd' | 'ect';
  /** 七政（及扩展体）躔宿结果 */
  bodies: BodyInMansion[];
  /** 日躔所在宿 */
  sunMansion: string;
  /** 月离所在宿 */
  moonMansion: string;
  /** 此刻南中天（子午线上）之宿名——「中星」 */
  meridianMansion: string;
  /** 南中天真经度（赤经或黄经，随 frame，度），供绘制中星指针 */
  meridianLon: number;
  /** 28 宿此刻各距星经度（随所选 frame），供绘图 */
  boundaries: Array<{ name: string; lon: number; sishou: SiShou; label?: string }>;
  /** 现代赤经升序是否与传统序相反的宿（觜参标记） */
  invertedPairs: string[];
  observer: MansionObserver;
}

/** 构造 28 距星 J2000 赤道单位向量（dist=1） */
function eqjVector(ra0: number, dec0: number): Vector {
  const a = ra0 * DEG;
  const d = dec0 * DEG;
  return new Vector(Math.cos(d) * Math.cos(a), Math.cos(d) * Math.sin(a), Math.sin(d), MakeTime(new Date(0)));
}

const META_BY_NAME = new Map<string, MansionMeta>(MANSIONS.map((m) => [m.name, m]));

/**
 * 觜/参 名实归属（岁差造成的距星逆序，不是数据笔误）
 *
 * 二十八宿的传统次序是「…毕、觜、参、井…」，且觜宿极窄、参宿很宽：
 * 《授时历》宿度觜 0.05 古度、参 10.28 古度（本模块 mansions-data 同此值），
 * 现代实测觜宿距星 λ Ori 赤经约 0.9°、黄经约 1.4° 的窄缝。
 *
 * 但约 13 世纪后觜宿距星 λ Ori 的赤经反超参宿距星 δ Ori，于是「按实测经度升序」
 * 排出来的相邻段变成 [δ Ori, λ Ori) 与 [λ Ori, 井)，若照「东界归本距星」直接命名，
 * 会把 0.9° 的窄缝判给参、把 11.5° 的宽带判给觜 —— 两者名实互换（审计 P2-5 实测）：
 * 黄道上约 3.2%（11.5°/360）的位置宿名错。
 *
 * 修法（只动这一对，不换整套宿度表）：段落的西界距星仍按实测升序排，
 * 但升序中「参紧接觜」这种逆序相邻对的两段名称互换，即
 *   窄缝 [δ Ori, λ Ori) → 觜；宽带 [λ Ori, 井) → 参。
 * 与 mansions-data 的宿度文献值、模块自注（觜 赤道约 0.9°、黄道约 1.4°）一致。
 * 若某历元两星尚未逆序（参前觜后的升序不成立），不做任何互换。
 */
function mansionLabels(ordered: Array<{ meta: MansionMeta; lon: number }>): string[] {
  const labels = ordered.map((o) => o.meta.name);
  for (let i = 0; i < ordered.length; i++) {
    const j = (i + 1) % ordered.length;
    if (ordered[i].meta.name === '参' && ordered[j].meta.name === '觜') {
      labels[i] = '觜';
      labels[j] = '参';
    }
  }
  return labels;
}

/** 计算指定时刻、指定坐标架下，28 距星的经度并按升序排好（圆周分区间表） */
function buildFrame(now: Date, frame: 'eqd' | 'ect'): MansionFrame {
  const t = MakeTime(now);
  const rot: RotationMatrix = frame === 'eqd' ? Rotation_EQJ_EQD(t) : Rotation_EQJ_ECT(t);
  const ordered = MANSIONS.map((meta) => {
    const v = eqjVector(meta.star.ra0, meta.star.dec0);
    const vr = RotateVector(rot, v);
    const lon = frame === 'eqd'
      ? mod360(EquatorFromVector(vr).ra * 15)
      : mod360(SphereFromVector(vr).lon);
    return { meta, lon };
  });
  ordered.sort((a, b) => a.lon - b.lon);
  return { frame, ordered, labels: mansionLabels(ordered) };
}

/** 在已排序的圆周界表上，定位某经度所居宿及入宿度 */
function locate(frame: MansionFrame, lon: number): {
  meta: MansionMeta; ruDu: number; boundaryLon: number;
} {
  const arr = frame.ordered;
  const labels = frame.labels ?? arr.map((o) => o.meta.name);
  // 找最后一个 boundaryLon <= lon 的距星（跨 0° 时回绕）。
  // 容差 1e-4°（0.36″）：距星自身必须落在本宿 0 入宿度，而「星位→黄经」两次浮点运算
  // 会有 1e-5° 量级的抖动（如 μ Gem 与井宿距星实测差 0.04″），1e-9 的容差会把它判给前一宿。
  let idx = -1;
  for (let i = 0; i < arr.length; i++) {
    if (arr[i].lon <= lon + 1e-4) idx = i;
    else break;
  }
  if (idx === -1) idx = arr.length - 1; // lon 在 0° 与最西界之间，归最后一宿（回绕）
  const cur = arr[idx];
  const next = arr[(idx + 1) % arr.length];
  // 段名取 labels（觜参已按名实归属纠正），入宿度仍自本段西界距星起算
  const meta = META_BY_NAME.get(labels[idx]) ?? cur.meta;
  const boundaryLon = cur.lon;
  const span = mod360(next.lon - cur.lon);
  // 入宿度自本段西界距星起算；容差内（距星自身）按 0 计，否则按圆周差再取模
  let ruDu = lon - cur.lon;
  if (ruDu < 0) ruDu = ruDu > -1e-4 ? 0 : mod360(ruDu);
  if (ruDu > span) ruDu = span; // 数值保护
  return { meta, ruDu, boundaryLon };
}

const INV_NOTE = new Set(['觜', '参']);

/**
 * 实时二十八宿躔次主入口。
 * @param now    绝对时刻（new Date()，时区无关）
 * @param frame  'eqd' 赤道宿度（默认，传统正朔）｜'ect' 黄道宿度（七政四余）
 * @param bodies 参与计算的星体，默认七政；可传 PLANET_ORDER 含三王/北交
 * @param observer 观测地，影响中星；默认北京
 */
export function mansionSnapshot(
  now: Date = new Date(),
  frame: 'eqd' | 'ect' = 'eqd',
  bodies: PlanetId[] = SEVEN,
  observer: MansionObserver = DEFAULT_OBS,
): MansionSnapshot {
  // 统一校验：NaN / 非 Date 的快照时刻会静默算成无效儒略日
  if (!(now instanceof Date) || !Number.isFinite(now.getTime())) {
    throw new InvalidDateError('星宿快照时刻无效：需要一个有效 Date');
  }
  const eng = engine();
  const jd = julianDay(
    now.getUTCFullYear(), now.getUTCMonth() + 1, now.getUTCDate(),
    now.getUTCHours(), now.getUTCMinutes(), now.getUTCSeconds(),
  );
  const chart = eng.chartAt(jd, observer.lat, observer.lonEast, 'whole_sign');
  const fr = buildFrame(now, frame);

  const out: BodyInMansion[] = [];
  for (const id of bodies) {
    const raw = chart.bodies[id];
    if (!raw) continue;
    const lon = mod360(frame === 'eqd' ? raw.ra : raw.lon);
    const loc = locate(fr, lon);
    out.push({
      id,
      name: PLANET_ZH[id],
      mansion: loc.meta.name,
      sishou: loc.meta.sishou,
      lon,
      ruDu: loc.ruDu,
      ruGuDu: loc.ruDu * (GU_DU_ZHOUTIAN / 360),
      retrograde: !!raw.retrograde,
      inverted: INV_NOTE.has(loc.meta.name),
    });
  }

  const byId = new Map(out.map((b) => [b.id, b]));
  const sun = byId.get('sun');
  const moon = byId.get('moon');

  // 中星：此刻本地恒星时（GAST×15+东经）即南中天真赤经，定位其宿
  const gastHours = SiderealTime(now);
  const lmst = mod360(gastHours * 15 + observer.lonEast);
  const merLon = frame === 'eqd' ? lmst : eqToEclApprox(now, lmst, observer);
  const meridian = locate(fr, merLon).meta.name;

  // 传统相邻两宿在「实测经度升序」中若前后颠倒，即岁差/自行导致的逆序（主要为觜参）
  const posInSorted = new Map<string, number>();
  fr.ordered.forEach((o, i) => posInSorted.set(o.meta.name, i));
  const invertedPairs: string[] = [];
  for (let i = 0; i < MANSIONS.length; i++) {
    const a = MANSIONS[i].name;
    const b = MANSIONS[(i + 1) % MANSIONS.length].name;
    const pa = posInSorted.get(a)!;
    const pb = posInSorted.get(b)!;
    // 升序中 b 恰在 a 的「前一位」（圆周回绕）才算真正逆序，而非仅整体错位
    if (pb === (pa - 1 + MANSIONS.length) % MANSIONS.length) invertedPairs.push(`${a}${b}`);
  }

  return {
    at: now.toISOString(),
    frame,
    bodies: out,
    sunMansion: sun?.mansion ?? '',
    moonMansion: moon?.mansion ?? '',
    meridianMansion: meridian,
    meridianLon: merLon,
    boundaries: fr.ordered.map((o, i) => ({ name: o.meta.name, lon: o.lon, sishou: o.meta.sishou, label: fr.labels[i] })),
    invertedPairs,
    observer,
  };
}

/**
 * 中星的黄道近似：由本地子午圈赤经 LMST 与赤道点（dec≈0）旋转到当日真黄道。
 * 南中天真位置：赤道坐标 (RA=LMST, dec=0)，转 EQJ 再转 ECT。为避免多一层逆旋转，
 * 直接构造当日真赤道向量后用 ECT 与 EQD 之差旋转；这里采用 astronomy-engine 的
 * 逆矩阵 Rotation_ECT_EQD（若可用），否则退回以赤道中星（足够展示）。
 */
function eqToEclApprox(now: Date, lmstDeg: number, _obs: MansionObserver): number {
  const t = MakeTime(now);
  const a = lmstDeg * DEG;
  // 当日真赤道单位向量（x 春分点, y 夏至点方向, z 北天极）
  const eqd = new Vector(Math.cos(a), Math.sin(a), 0, t);
  // EQD -> EQJ -> ECT
  const back = RotateVector(Rotation_EQD_EQJ(t), eqd);
  const ect = RotateVector(Rotation_EQJ_ECT(t), back);
  return mod360(SphereFromVector(ect).lon);
}

/** 便捷：指定经度落在哪一宿（供测试与「点黄道看宿名」用；口径同 mansionSnapshot 的 boundaries） */
export function mansionAtLon(
  now: Date, frame: 'eqd' | 'ect', lon: number,
): { name: string; ruDu: number; boundaryLon: number; boundaryStar: string } {
  const fr = buildFrame(now, frame);
  const loc = locate(fr, mod360(lon));
  return {
    name: loc.meta.name,
    ruDu: loc.ruDu,
    boundaryLon: loc.boundaryLon,
    boundaryStar: loc.meta.star.western,
  };
}

/** 便捷：日躔宿 + 入宿度 */
export function riChan(now: Date = new Date(), frame: 'eqd' | 'ect' = 'eqd'): BodyInMansion {
  return mansionSnapshot(now, frame, ['sun']).bodies[0];
}

/** 便捷：月离宿 + 入宿度 */
export function yueLi(now: Date = new Date(), frame: 'eqd' | 'ect' = 'eqd'): BodyInMansion {
  return mansionSnapshot(now, frame, ['moon']).bodies[0];
}

/**
 * 值宿（传统「值宿/直宿」）。
 * 古历以朔日夜半月离宿为该朔「直宿」，每日递一宿；此处给实时口径：
 * 返回当下月离所居宿作为「即时值宿」，并给按日序数推得的「值日宿」
 * （以 2000-01-07 为角宿值宿的锚日，28 宿日序循环；锚日为公开历算常用参照）。
 */
export interface ZhiSu {
  /** 即时月离宿 */
  yueli: string;
  /** 值日宿（28 宿日序） */
  zhiri: string;
  /** 距下一值日宿轮换的天数序号 0..27 */
  index: number;
}
const ZHISU_ANCHOR = Date.UTC(2000, 0, 7); // 锚：该日值日角宿
export function zhiSu(now: Date = new Date()): ZhiSu {
  const yl = yueLi(now, 'eqd').mansion;
  const days = Math.floor((now.getTime() - ZHISU_ANCHOR) / 86400000);
  const idx = ((days % 28) + 28) % 28;
  return { yueli: yl, zhiri: MANSIONS[idx].name, index: idx };
}

export { MANSIONS, PLANET_ORDER, GU_DU_ZHOUTIAN };
