// 分享码：把一盘压成短码，粘贴即可复现。
// v2 结构：QT1-<base64url( 头 · 规则版本 · 时间秒 · 配置标志 · [观测地] · [牌组] · 类型数据 · 校验 )>
// 设计原则（基线 §5.1「复现码 v2」）：
//   - 码 = 术数类型 + 原始输入 + 计算配置 + 规则版本 + 完整性校验，五者齐备才算可复现。
//   - 原始输入：时间起卦类（梅花/奇门/天象/大六壬/小六壬/符箓）时间即全部；六爻带六爻值与所问；
//     卡牌带牌阵与牌序；地占带母符奇偶；藏占带骰式/钱式；吠陀带出生时刻与经纬度；阳宅带宅盘输入。
//   - 计算配置：晚子时流派（23/00 换日）、真太阳时开关、观测地经纬度、牌组 id —— 同一时刻不同开关
//     会算出不同的盘，必须随码携带，否则「复现」出来的不是同一盘。
//   - 规则版本：算法或规则表发生实质变化时 +1；解出的码若版本低于当前，提示结果可能略有差异。
//   - 1 字节校验和 + base64 规范化回比，挡住手抄错字；纯本地解码，无后端。
// v1 码（无规则版本、无配置标志）仍可解，只是按默认配置复现。

const PREFIX = 'QT1-';
const B64 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_';
const VERSION = 2;        // 编码版本（写进头字节高 4 位）
/** 规则版本：术数规则表/算法实质变化时 +1（改这里要同步 CHANGELOG） */
export const RULE_VERSION = 1;

export const KIND_ID = {
  liuyao: 1, meihua: 2, qimen: 3, bazi: 4, astro: 5, ziwei: 6, cards: 7, sky: 8,
  // v121 补齐：7 类此前无码的术数（head & 15 上限 15，已用满）
  daliuren: 9, xiaoliuren: 10, geomancy: 11, tibetan: 12, vedic: 13, yangzhai: 14, zhuyou: 15,
};
export const ID_KIND = Object.fromEntries(Object.entries(KIND_ID).map(([k, v]) => [v, k]));

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
const F_GEO = 4;          // 随码携带观测地（astro 自带经纬度，不置此位）
const F_DECK = 8;         // 随码携带牌组 id（cards 型）

/* ---------------- 编码 ---------------- */
/**
 * @param {'liuyao'|'meihua'|'qimen'|'bazi'|'astro'|'ziwei'|'cards'|'sky'|'daliuren'|'xiaoliuren'|'geomancy'|'tibetan'|'vedic'|'yangzhai'|'zhuyou'} kind
 * @param {object} data { at, lateZi?, apparentSolarTime?, lon?, lat?, deckId?, ...类型专属 }
 * @returns {string} 形如 QT1-xxxxxxxx
 */
export function encodeCode(kind, data = {}) {
  const id = KIND_ID[kind];
  if (!id) throw new Error('未知盘面类型');
  const w = new W();
  w.u8((VERSION << 4) | id);
  w.u8(RULE_VERSION);
  w.u32(Math.floor((data.at || Date.now()) / 1000)); // 秒级足够（时间起卦以时辰为单位）

  // 计算配置块
  const isGeoCarrier = kind === 'astro' || kind === 'vedic'; // 经纬度是本体数据，不另置标志位
  const hasGeo = !isGeoCarrier && Number.isFinite(data.lon) && Number.isFinite(data.lat);
  const hasDeck = kind === 'cards' && !!data.deckId;
  let flags = 0;
  if (data.lateZi === '00' || data.lateZi === 0) flags |= F_LATE_ZI;
  if (data.apparentSolarTime) flags |= F_TST;
  if (hasGeo) flags |= F_GEO;
  if (hasDeck) flags |= F_DECK;
  w.u8(flags);
  if (hasGeo) { w.i16(Math.round(data.lon * 100)); w.i16(Math.round(data.lat * 100)); }
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
    w.u8(data.gender === '女' ? 0 : 1);
    w.i16(Math.round((data.lon ?? 120) * 100));
    w.i16(Math.round((data.lat ?? 30) * 100));
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
  return PREFIX + b64url(out);
}

/* ---------------- 解码 ---------------- */
/**
 * @param {string} code
 * @returns {{kind:string, version:number, ruleVersion:number, ruleStale:boolean, at:number, ...}}
 * @throws 码损坏 / 版本不支持 / 类型不认识
 */
export function decodeCode(code) {
  const raw = String(code || '').trim().replace(/\s+/g, '');
  if (!raw) throw new Error('请先输入码');
  const body = raw.startsWith(PREFIX) ? raw.slice(PREFIX.length) : raw;
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
  if (ver !== 1 && ver !== 2) throw new Error(`码的版本 v${ver} 本版不支持`);
  const kind = ID_KIND[id];
  if (!kind) throw new Error('码的盘面类型不认识');

  const out = { kind, version: ver, ruleVersion: 0, ruleStale: false, at: 0 };
  if (ver === 2) {
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
    out.lon = r.i16() / 100;
    out.lat = r.i16() / 100;
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
  return out;
}

/** 码是否形似本应用的分享码（用于粘贴时快速判断） */
export function looksLikeCode(s) {
  const t = String(s || '').trim();
  if (!t) return false;
  const body = t.startsWith(PREFIX) ? t.slice(PREFIX.length) : t;
  if (body.length < 5) return false;
  return /^[A-Za-z0-9_-]+$/.test(body);
}
