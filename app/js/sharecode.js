// 分享码：把一盘压成短码，粘贴即可复现。
//
// v3（QT2-）结构：
//   QT2-<base64url( 头 · 规则版本 · 时间戳 · 钟面分量 · 配置标志 · 时区偏移 · 城市 · 时区名
//                   · [经纬度] · [牌组] · 类型数据 · 校验 )>
// v2（QT1-）/ v1（无前缀）仍可解，但只带绝对时间戳，**不带时区与城市**，见 LEGACY_NOTICE。
//
// 设计原则（基线 §5.1「复现码 v2」+ r6_compat.md P0「跨时区不一致」）：
//   - 码 = 术数类型 + 原始输入 + 计算配置 + 规则版本 + 完整性校验，五者齐备才算可复现。
//   - **时间必须存两份**：绝对 Unix 秒（utcAt，排序/去重用）+ 钟面分量（y/mo/d/h/mi）。
//     v2 只存绝对秒，换台机器/换个时区打开，`new Date(at)` 的钟面就变了，
//     四柱、时柱、紫微十二宫整体错位且无任何提示（实测复制码在上海=巳时、纽约=戌时）。
//     钟面分量与设备时区完全无关，才是「用户当初输入的那个时间」。
//   - **时区必须写进码**：city（城市名或「未知」）、tz（IANA 名或 UTC±HH:MM）、
//     tzOffsetMinutes（含夏令时的生效偏移，分钟）、tzEstimated（估算标记）、
//     lat/lon（出生地经纬度，真太阳时/星盘/吠陀必需）。打开方一律按码内时区算，
//     不看自己设备的时区——这才叫「复现」。
//   - 坐标缺失或等于兜底值（120E/30N）时不许默默当成真实坐标：要么标记，
//     要么拒绝生成（见 buildCode 的 warnings）。
//   - 计算配置：晚子时流派（23/00 换日）、真太阳时开关、牌组 id —— 同一时刻不同开关
//     会算出不同的盘，必须随码携带。
//   - 规则版本：算法或规则表发生实质变化时 +1；解出的码若版本低于当前，提示结果可能略有差异。
//   - 1 字节校验和 + base64 规范化回比，挡住手抄错字；纯本地解码，无后端。

export const PREFIX = 'QT2-';
export const LEGACY_PREFIX = 'QT1-';
const B64 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_';
const VERSION = 3;        // 编码版本（写进头字节高 4 位）
const LEGACY_VERSIONS = [1, 2];
/**
 * 规则版本：术数规则表/算法实质变化时 +1（改这里要同步 CHANGELOG）。
 * v1 → v2：时区数据补齐埃及 2023 / 墨西哥 2022 / 伊朗 2022 / 约旦叙利亚 2022 /
 *          巴拉圭 2024 / 摩洛哥斋月 / 智利 2022（liuyao-core/src/tz-data.ts）
 */
export const RULE_VERSION = 2;

/** 旧码（QT1）缺少时区信息时，界面必须原样显示这句话 */
export const LEGACY_NOTICE = '此码不含时区信息，已按当前时区显示，可能与原盘不同';
/** 城市未知时的占位符 */
export const CITY_UNKNOWN = '未知';

export const KIND_ID = {
  liuyao: 1, meihua: 2, qimen: 3, bazi: 4, astro: 5, ziwei: 6, cards: 7, sky: 8,
  // v121 补齐：7 类此前无码的术数（head & 15 上限 15，已用满）
  daliuren: 9, xiaoliuren: 10, geomancy: 11, tibetan: 12, vedic: 13, yangzhai: 14, zhuyou: 15,
};
export const ID_KIND = Object.fromEntries(Object.entries(KIND_ID).map(([k, v]) => [v, k]));

/** 盘面依赖出生地经纬度的类型（缺经纬度 → 真太阳时/上升点必然不同） */
const GEO_KINDS = new Set(['bazi', 'ziwei', 'astro', 'vedic']);

/* ---------------- base64url（无填充） ---------------- */
function b64url(bytes) {
  let out = '';
  for (let i = 0; i < bytes.length; i += 3) {
    const b0 = bytes[i];
    const b1 = bytes[i + 1];
    const b2 = bytes[i + 2];
    out += B64[b0 >> 2];
    out += B64[((b0 & 3) << 4) | ((b1 === undefined ? 0 : b1) >> 4)];
    if (b1 === undefined) break;
    out += B64[((b1 & 15) << 2) | ((b2 === undefined ? 0 : b2) >> 6)];
    if (b2 === undefined) break;
    out += B64[b2 & 63];
  }
  return out;
}

function b64urlDecode(s) {
  const idx = Object.create(null);
  for (let i = 0; i < B64.length; i++) idx[B64[i]] = i;
  const out = [];
  let buf = 0;
  let bits = 0;
  for (const ch of s) {
    const v = idx[ch];
    if (v === undefined) throw new Error('码里有不认识的字符');
    buf = (buf << 6) | v;
    bits += 6;
    if (bits >= 8) { bits -= 8; out.push((buf >> bits) & 0xff); }
  }
  return new Uint8Array(out);
}

/* ---------------- 字节读写 ---------------- */
class W {
  constructor() { this.a = []; }
  u8(v) { this.a.push(v & 0xff); }
  u16(v) { this.a.push((v >> 8) & 0xff, v & 0xff); }
  i16(v) { this.u16(v < 0 ? v + 65536 : v); }
  u32(v) { this.a.push((v >>> 24) & 0xff, (v >>> 16) & 0xff, (v >>> 8) & 0xff, v & 0xff); }
  str(s) {
    const e = new TextEncoder().encode(String(s || ''));
    this.u16(e.length);
    for (const b of e) this.u8(b);
  }
  bytes() { return new Uint8Array(this.a); }
}

class R {
  constructor(b) { this.b = b; this.i = 0; }
  need(n) { if (this.i + n > this.b.length) throw new Error('码不完整或已损坏'); }
  u8() { this.need(1); return this.b[this.i++]; }
  u16() { this.need(2); return (this.b[this.i++] << 8) | this.b[this.i++]; }
  i16() { const v = this.u16(); return v > 32767 ? v - 65536 : v; }
  u32() { this.need(4); return (((this.b[this.i++] << 24) | (this.b[this.i++] << 16) | (this.b[this.i++] << 8) | this.b[this.i++]) >>> 0); }
  str() {
    const n = this.u16();
    this.need(n);
    const s = new TextDecoder().decode(this.b.slice(this.i, this.i + n));
    this.i += n;
    return s;
  }
  left() { return this.b.length - this.i; }
}

const sum8 = (bytes) => bytes.reduce((a, b) => (a + b) & 0xff, 0);
/** 小整数集合 → 位掩码（阳宅的九宫方位、门外形势勾选都用得上） */
const mask9 = (arr) => (arr || []).reduce((m, ix) => (Number.isInteger(ix) && ix >= 0 && ix < 16 ? (m | (1 << ix)) : m), 0);

/* ---------------- 配置标志位 ---------------- */
const F_LATE_ZI = 1;      // 1 = 子正（0 点）换日；0 = 晚子时（23 点）换日
const F_TST = 2;          // 真太阳时校正
const F_GEO = 4;          // 随码携带经纬度
const F_DECK = 8;         // 随码携带牌组 id（cards 型）
const F_TZ_EST = 16;      // 时区是估算值（未命中城市表）
const F_GEO_FALLBACK = 32; // 经纬度是默认兜底值（120E/30N），不是真实出生地
const F_CITY_UNKNOWN = 64; // 城市未知
const F_DST = 128;         // 该时刻当地在夏令时内（钟面即夏令时时钟）

/* ---------------- 钟面工具 ---------------- */

/** 本地 Date → 钟面分量（用户看到的时间；编码时用） */
export function civilFromAt(at) {
  const d = new Date(Number(at) || 0);
  return { y: d.getFullYear(), mo: d.getMonth() + 1, d: d.getDate(), h: d.getHours(), mi: d.getMinutes() };
}

/** 钟面分量 → 该设备上的本地 Date（解码时用：与设备时区无关的钟面） */
export function civilDate(civil) {
  if (!civil) return null;
  const d = new Date(civil.y, civil.mo - 1, civil.d, civil.h, civil.mi, 0, 0);
  return Number.isNaN(d.getTime()) ? null : d;
}

/** 钟面分量 → 「墙钟当 UTC」毫秒（纯比较用，与设备时区无关） */
function wallMs(c) { return Date.UTC(c.y, c.mo - 1, c.d, c.h, c.mi, 0, 0); }

/** UTC 偏移（分）→ UTC+08:00 / UTC-03:30 */
export function fmtTzOffset(min) {
  const m = Math.round(Number(min) || 0);
  const sign = m < 0 ? '-' : '+';
  const a = Math.abs(m);
  return `UTC${sign}${String(Math.floor(a / 60)).padStart(2, '0')}:${String(a % 60).padStart(2, '0')}`;
}

const isNum = (v) => typeof v === 'number' && Number.isFinite(v);
const near = (a, b, eps = 0.01) => Math.abs(a - b) < eps;

/* ---------------- 编码 ---------------- */
/**
 * 生成码，并把「这个码哪里不精确」一并返回（界面必须显示，不许静默）。
 * @param {string} kind
 * @param {object} data { at, civil?, city?, tz?, tzOffsetMinutes?, tzEstimated?,
 *                        lon?, lat?, geoFallback?, lateZi?, apparentSolarTime?, deckId?, ...类型专属 }
 * @returns {{code:string, warnings:string[]}}
 */
export function buildCode(kind, data = {}) {
  const id = KIND_ID[kind];
  if (!id) throw new Error('未知盘面类型');
  const warnings = [];

  // ---- 时间：钟面分量是主数据，绝对时刻由「钟面 − 偏移」推出 ----
  const civil = normalizeCivil(data.civil) || civilFromAt(data.at ?? Date.now());

  // ---- 时区 ----
  let offsetMin = isNum(data.tzOffsetMinutes) ? Math.round(data.tzOffsetMinutes) : null;
  if (offsetMin == null) {
    // 没有时区信息时只能借设备时区——这是 v2 的老毛病，明确标记并告警
    offsetMin = -new Date(wallMs(civil)).getTimezoneOffset();
    warnings.push(`未取得城市时区，已按本机时区 ${fmtTzOffset(offsetMin)} 写入；换时区打开可能不同`);
  }
  offsetMin = Math.max(-14 * 60, Math.min(14 * 60, offsetMin));

  const cityRaw = String(data.city || '').trim();
  const cityUnknown = !cityRaw || cityRaw === CITY_UNKNOWN;
  const city = cityUnknown ? '' : cityRaw.slice(0, 24);
  if (cityUnknown) warnings.push('未记录城市名，码内城市为「未知」（时区仍随码携带）');

  const tzName = String(data.tz || '').trim() || fmtTzOffset(offsetMin);
  const tzEstimated = !!data.tzEstimated;
  if (tzEstimated) warnings.push('时区是估算值（未命中城市表），与实际可能差 1 小时');

  const utcSec = Math.round((wallMs(civil) - offsetMin * 60000) / 1000);

  // ---- 经纬度 ----
  let lon = isNum(data.lon) ? data.lon : (isNum(data.lonEast) ? data.lonEast : null);
  let lat = isNum(data.lat) ? data.lat : (isNum(data.latitude) ? data.latitude : null);
  let geoFallback = !!data.geoFallback;
  if (lon != null && lat != null && near(lon, 120) && near(lat, 30)) {
    geoFallback = true; // 兜底坐标：不许当成真实出生地
  }
  if (geoFallback && lon != null && lat != null) {
    warnings.push(`经纬度是默认兜底值（${lon.toFixed(1)}E/${lat.toFixed(1)}N），不是真实出生地，星盘/真太阳时会偏`);
  }
  const hasGeo = lon != null && lat != null;
  if (!hasGeo && GEO_KINDS.has(kind)) {
    warnings.push('此码不含经纬度，打开方将用自己的默认出生地，真太阳时/上升点可能不同');
  }

  const hasDeck = kind === 'cards' && !!data.deckId;
  let flags = 0;
  if (data.lateZi === '00' || data.lateZi === 0) flags |= F_LATE_ZI;
  if (data.apparentSolarTime) flags |= F_TST;
  if (hasGeo) flags |= F_GEO;
  if (hasDeck) flags |= F_DECK;
  if (tzEstimated) flags |= F_TZ_EST;
  if (geoFallback) flags |= F_GEO_FALLBACK;
  if (cityUnknown) flags |= F_CITY_UNKNOWN;
  if (data.inDst) flags |= F_DST;

  const w = new W();
  w.u8((VERSION << 4) | id);
  w.u8(RULE_VERSION);
  w.u32(utcSec);                       // 绝对时刻（UTC 秒）
  w.u16(civil.y); w.u8(civil.mo); w.u8(civil.d); w.u8(civil.h); w.u8(civil.mi);
  w.u8(flags);
  w.i16(offsetMin);
  w.str(city);
  w.str(tzName);
  if (hasGeo) { w.i16(Math.round(lon * 100)); w.i16(Math.round(lat * 100)); }
  if (hasDeck) w.str(String(data.deckId));

  if (kind === 'liuyao') {
    // source 同时接受字符串（coins/tianji/manual/time）与数字（1..4）
    const srcMap = { coins: 1, tianji: 2, manual: 3, time: 4 };
    const srcNum = typeof data.source === 'number' ? data.source : srcMap[data.source];
    const src = srcNum >= 1 && srcNum <= 4 ? srcNum : 3;
    w.u8(src);
    let packed = 0;
    const ys = data.yaoValues || [];
    for (let i = 0; i < 6; i++) {
      const v = ys[i];
      const c = v === 6 ? 0 : v === 7 ? 1 : v === 8 ? 2 : 3;
      packed |= c << (i * 2);
    }
    w.u16(packed);
    w.str(data.question || '');
  } else if (kind === 'bazi' || kind === 'ziwei') {
    w.u8(data.gender === '女' ? 0 : 1);
  } else if (kind === 'astro' || kind === 'vedic') {
    // 经纬度已在上面的公共地理块里，这里不再重复（v2 是重复存的）
    w.u8(data.gender === '女' ? 0 : 1);
  } else if (kind === 'cards') {
    w.u8((data.spreadIndex ?? 0) & 0xff);
    const cards = data.cards || [];
    w.u8(cards.length & 0xff);
    for (const c of cards) {
      w.u8((c.index ?? 0) & 0x7f);
      w.u8(c.reversed ? 1 : 0);
    }
  }
  else if (kind === 'geomancy') {
    // 地占：随机撒点，母符 4×4 行的奇偶（1=单点/奇，2=双点/偶）打包 16 位；女/侄/证人/法官皆可由此推出
    w.u16((data.mothers ?? 0) & 0xffff);
    w.u8((data.qHouse ?? 1) & 0x0f);
    w.str(data.question || '');
  } else if (kind === 'tibetan') {
    const isCoin = data.mode === 'coin';
    w.u8(isCoin ? 1 : 0);
    if (isCoin) {
      const c = data.coin || [1, 1];
      w.u8((((c[0] - 1) & 7) << 3) | ((c[1] - 1) & 7));
    } else {
      const d3 = data.dice || [1, 1, 1];
      w.u8((((d3[0] - 1) & 3) << 4) | (((d3[1] - 1) & 3) << 2) | ((d3[2] - 1) & 3));
    }
    w.str(data.question || '');
  } else if (kind === 'yangzhai') {
    // 阳宅：坐向（0.1°）+ 六类房间的九宫掩码 + 建房年 + 居住人 + 门外形势勾选
    w.u16(Math.round((data.facingDeg ?? 0) * 10) & 0xffff);
    for (const k of ['door', 'master', 'second', 'living', 'kitchen', 'bath']) {
      w.u16((data.rooms && data.rooms[k]) ? mask9(data.rooms[k]) : 0);
    }
    w.u8(((data.built ?? 1800) - 1800) & 0xff);
    w.u8(((data.personY ?? 1994) - 1800) & 0xff);
    w.u8(data.personG === 'f' ? 0 : 1);
    w.u16(mask9(data.shapes || []));
  }
  // meihua / qimen / sky / daliuren / xiaoliuren / zhuyou：时间（+配置）即全部

  const body = w.bytes();
  const out = new Uint8Array(body.length + 1);
  out.set(body, 0);
  out[body.length] = sum8(body);
  return { code: PREFIX + b64url(out), warnings };
}

/** 只要码（旧接口）：告警请改用 buildCode() 拿 */
export function encodeCode(kind, data = {}) {
  return buildCode(kind, data).code;
}

/** 钟面校正（非法值返回 null，交给 civilFromAt 兜底） */
function normalizeCivil(c) {
  if (!c || typeof c !== 'object') return null;
  const y = Number(c.y), mo = Number(c.mo), d = Number(c.d), h = Number(c.h), mi = Number(c.mi);
  if (![y, mo, d, h, mi].every(Number.isInteger)) return null;
  if (y < 1600 || y > 2200 || mo < 1 || mo > 12 || d < 1 || d > 31 || h < 0 || h > 23 || mi < 0 || mi > 59) return null;
  return { y, mo, d, h, mi };
}

/* ---------------- 解码 ---------------- */
/**
 * @param {string} code
 * @returns {{kind:string, version:number, ruleVersion:number, ruleStale:boolean, at:number,
 *            legacy:boolean, tzKnown:boolean, civil:object|null, utcAt:number|null,
 *            city:string, tz:string, tzOffsetMinutes:number|null, tzEstimated:boolean,
 *            geoFallback:boolean, lon:number|null, lat:number|null, warnings:string[], ...类型数据}}
 * @throws 码损坏 / 版本不支持 / 类型不认识
 */
export function decodeCode(code) {
  const raw = String(code || '').trim().replace(/\s+/g, '');
  if (!raw) throw new Error('请先输入码');
  const body = raw.startsWith(PREFIX) ? raw.slice(PREFIX.length)
    : raw.startsWith(LEGACY_PREFIX) ? raw.slice(LEGACY_PREFIX.length)
      : raw;
  const bytes = b64urlDecode(body);
  if (bytes.length < 6) throw new Error('码不完整'); // 最短的 v1 码 = 头1 + 时间4 + 校验1
  const check = bytes[bytes.length - 1];
  const data = bytes.slice(0, bytes.length - 1);
  if (sum8(data) !== check) throw new Error('码校验失败，可能抄错了');
  // 再挡一道：base64 末尾不足 6bit 的填充位必须为零，否则重编码对不上，说明抄错
  if (b64url(bytes) !== body) throw new Error('码校验失败，可能抄错了');

  const r = new R(data);
  const head = r.u8();
  const ver = head >> 4;
  const id = head & 15;
  if (ver !== VERSION && !LEGACY_VERSIONS.includes(ver)) throw new Error(`码的版本 v${ver} 本版不支持`);
  const kind = ID_KIND[id];
  if (!kind) throw new Error('码的盘面类型不认识');

  const out = {
    kind, version: ver, ruleVersion: 0, ruleStale: false, at: 0,
    legacy: ver !== VERSION, tzKnown: ver >= 3,
    civil: null, utcAt: null, city: '', tz: '', tzOffsetMinutes: null,
    tzEstimated: false, geoFallback: false, lon: null, lat: null, warnings: [],
  };

  if (ver >= 3) {
    out.ruleVersion = r.u8();
    const utcSec = r.u32();
    const civil = { y: r.u16(), mo: r.u8(), d: r.u8(), h: r.u8(), mi: r.u8() };
    if (!normalizeCivil(civil)) throw new Error('码内时间不合法');
    const flags = r.u8();
    out.tzOffsetMinutes = r.i16();
    if (out.tzOffsetMinutes < -14 * 60 || out.tzOffsetMinutes > 14 * 60) throw new Error('码内时区不合法');
    out.city = r.str().slice(0, 24);
    out.tz = r.str().slice(0, 40);
    out.lateZi = (flags & F_LATE_ZI) ? '00' : '23';
    out.apparentSolarTime = !!(flags & F_TST);
    out.tzEstimated = !!(flags & F_TZ_EST);
    out.geoFallback = !!(flags & F_GEO_FALLBACK);
    if (flags & F_GEO) { out.lon = r.i16() / 100; out.lat = r.i16() / 100; }
    if (flags & F_DECK) out.deckId = r.str();
    out.inDst = !!(flags & F_DST);
    out.civil = civil;
    // 绝对时刻以「钟面 − 偏移」为准（唯一能跨时区复现的定义）；码里的 u32 只做交叉校验
    const derived = Math.round((wallMs(civil) - out.tzOffsetMinutes * 60000) / 1000);
    out.utcAt = derived * 1000;
    if (utcSec !== derived) {
      out.warnings.push('码内时间戳与钟面不一致（可能被改过），已按钟面时间复现');
    }
    // at 保持「墙钟伪时刻」：所有既有展示/排序（fmtMoment、案例列表）都按它算，
    // 这样任何时区打开都显示同一个钟面。
    const d = civilDate(civil);
    out.at = d ? d.getTime() : derived * 1000;
    if (out.tzEstimated) out.warnings.push('此码的时区是估算值（未命中城市表），可能与实际差 1 小时');
    if (out.geoFallback) out.warnings.push('此码经纬度是默认兜底值（120E/30N），不是真实出生地，星盘/真太阳时会偏');
    if (out.inDst) out.warnings.push('该时刻当地在夏令时内：钟面时间是夏令时时钟，时柱/日柱按标准时定');
    if (!out.city) out.warnings.push('此码未记录城市（城市=未知），只能按码内时区复现');
    if (out.lon == null && GEO_KINDS.has(kind)) out.warnings.push('此码不含经纬度，真太阳时/上升点按本机默认出生地计');
    out.ruleStale = out.ruleVersion !== RULE_VERSION;
  } else if (ver === 2) {
    out.ruleVersion = r.u8();
    out.at = r.u32() * 1000;
    const flags = r.u8();
    out.lateZi = (flags & F_LATE_ZI) ? '00' : '23';
    out.apparentSolarTime = !!(flags & F_TST);
    if (flags & F_GEO) out.geo = { lon: r.i16() / 100, lat: r.i16() / 100 };
    if (flags & F_DECK) out.deckId = r.str();
    out.ruleStale = out.ruleVersion !== RULE_VERSION;
  } else {
    // v1：无规则版本与配置块，按默认配置复现
    out.at = r.u32() * 1000;
    out.ruleStale = true;
  }

  if (out.legacy) {
    out.warnings.unshift(LEGACY_NOTICE);
    // 旧码的地理块（v2 的 astro/vedic 直接内嵌经纬度，见下）
  }

  if (kind === 'liuyao') {
    out.source = ['coins', 'tianji', 'manual', 'time'][r.u8() - 1] || 'manual';
    const packed = r.u16();
    out.yaoValues = Array.from({ length: 6 }, (_, i) => [6, 7, 8, 9][(packed >> (i * 2)) & 3]);
    out.question = r.left() > 0 ? r.str() : '';
  } else if (kind === 'bazi' || kind === 'ziwei') {
    out.gender = r.u8() === 0 ? '女' : '男';
  } else if (kind === 'astro' || kind === 'vedic') {
    out.gender = r.u8() === 0 ? '女' : '男';
    if (out.legacy) {
      // v2：经纬度内嵌在类型数据里（且缺省写死 120/30）
      out.lon = r.i16() / 100;
      out.lat = r.i16() / 100;
      if (near(out.lon, 120) && near(out.lat, 30)) out.geoFallback = true;
    }
  } else if (kind === 'cards') {
    out.spreadIndex = r.u8();
    const n = r.u8();
    out.cards = [];
    for (let i = 0; i < n; i++) {
      const index = r.u8();
      const reversed = r.u8() === 1;
      out.cards.push({ index, reversed });
    }
  } else if (kind === 'geomancy') {
    out.mothers = r.u16();
    out.qHouse = r.u8() || 1;
    out.question = r.left() > 0 ? r.str() : '';
  } else if (kind === 'tibetan') {
    out.mode = r.u8() === 1 ? 'coin' : 'dice';
    const b = r.u8();
    if (out.mode === 'coin') out.coin = [((b >> 3) & 7) + 1, (b & 7) + 1];
    else out.dice = [((b >> 4) & 3) + 1, ((b >> 2) & 3) + 1, (b & 3) + 1];
    out.question = r.left() > 0 ? r.str() : '';
  } else if (kind === 'yangzhai') {
    out.facingDeg = r.u16() / 10;
    out.rooms = {};
    for (const k of ['door', 'master', 'second', 'living', 'kitchen', 'bath']) {
      const m = r.u16();
      out.rooms[k] = [...Array(9).keys()].filter((i) => m & (1 << i));
    }
    out.built = r.u8() + 1800;
    out.personY = r.u8() + 1800;
    out.personG = r.u8() === 0 ? 'f' : 'm';
    const sm = r.u16();
    out.shapes = [...Array(9).keys()].filter((i) => sm & (1 << i));
  }
  // 旧码 v2 的地理块由上面的 flags & F_GEO 读入（out.geo）；v3 已并入 lon/lat
  if (out.geo && out.lon == null) { out.lon = out.geo.lon; out.lat = out.geo.lat; }
  return out;
}

/** 码是否形似本应用的分享码（用于粘贴时快速判断） */
export function looksLikeCode(s) {
  const t = String(s || '').trim();
  if (!t) return false;
  const body = t.startsWith(PREFIX) ? t.slice(PREFIX.length)
    : t.startsWith(LEGACY_PREFIX) ? t.slice(LEGACY_PREFIX.length)
      : t;
  if (body.length < 6) return false;
  return /^[A-Za-z0-9_-]+$/.test(body);
}

/** 码的「读得懂」摘要：2026-07-15 12:00 · 上海 UTC+08:00（旧码显示「时区未知」） */
export function describeCode(d) {
  if (!d) return '';
  const c = d.civil;
  const when = c
    ? `${c.y}-${String(c.mo).padStart(2, '0')}-${String(c.d).padStart(2, '0')} ${String(c.h).padStart(2, '0')}:${String(c.mi).padStart(2, '0')}`
    : `按本机时区 ${fmtOffsetOfLocal(d.at)}`;
  const place = d.tzKnown
    ? `${d.city || CITY_UNKNOWN} ${d.tz || fmtTzOffset(d.tzOffsetMinutes)}`
    : '时区未知（旧码）';
  return `${when} · ${place}`;
}

function fmtOffsetOfLocal(at) {
  return fmtTzOffset(-new Date(Number(at) || 0).getTimezoneOffset());
}
