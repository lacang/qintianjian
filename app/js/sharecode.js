// 分享码：把一盘压成短码，粘贴即可复现。
// 结构：QT1-<base64url( 版本|类型 · 时间秒 · 类型数据 · 校验 )>
// 设计原则：
//   - 时间起卦类（梅花/奇门/天机六爻）只需时间即可完全复现，码极短。
//   - 六爻另带六爻值与所问；卡牌带牌阵与抽到的牌（真随机洗牌靠记录牌序复现）。
//   - 1 字节校验和，挡住手抄错字；码不含任何隐私以外信息，纯本地解码，无后端。

const PREFIX = 'QT1-';
const B64 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_';
const VERSION = 1;

export const KIND_ID = { liuyao: 1, meihua: 2, qimen: 3, bazi: 4, astro: 5, ziwei: 6, cards: 7, sky: 8 };
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

/* ---------------- 编码 ---------------- */
/**
 * @param {'liuyao'|'meihua'|'qimen'|'bazi'|'astro'|'ziwei'|'cards'} kind
 * @param {object} data { at, ...类型专属 }
 * @returns {string} 形如 QT1-xxxxxxxx
 */
export function encodeCode(kind, data = {}) {
  const id = KIND_ID[kind];
  if (!id) throw new Error('未知盘面类型');
  const w = new W();
  w.u8((VERSION << 4) | id);
  w.u32(Math.floor((data.at || Date.now()) / 1000)); // 秒级足够（时间起卦以时辰为单位）

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
  } else if (kind === 'astro') {
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
  // meihua / qimen：时间即全部

  const body = w.bytes();
  const out = new Uint8Array(body.length + 1);
  out.set(body, 0);
  out[body.length] = sum8(body);
  return PREFIX + b64url(out);
}

/* ---------------- 解码 ---------------- */
/**
 * @param {string} code
 * @returns {{kind:string, at:number, ...}} 各类型专属字段
 * @throws 码损坏 / 版本不支持 / 类型不认识
 */
export function decodeCode(code) {
  const raw = String(code || '').trim().replace(/\s+/g, '');
  if (!raw) throw new Error('请先输入码');
  const body = raw.startsWith(PREFIX) ? raw.slice(PREFIX.length) : raw;
  const bytes = b64urlDecode(body);
  if (bytes.length < 6) throw new Error('码不完整'); // 最短的梅花码 = 头1 + 时间4 + 校验1
  const check = bytes[bytes.length - 1];
  const data = bytes.slice(0, bytes.length - 1);
  if (sum8(data) !== check) throw new Error('码校验失败，可能抄错了');
  // 再挡一道：base64 末尾不足 6bit 的填充位必须为零，否则重编码对不上，说明抄错
  if (b64url(bytes) !== body) throw new Error('码校验失败，可能抄错了');

  const r = new R(data);
  const head = r.u8();
  const ver = head >> 4;
  const id = head & 15;
  if (ver !== VERSION) throw new Error(`码的版本 v${ver} 本版不支持`);
  const kind = ID_KIND[id];
  if (!kind) throw new Error('码的盘面类型不认识');

  const out = { kind, at: r.u32() * 1000 };
  if (kind === 'liuyao') {
    out.source = ['coins', 'tianji', 'manual', 'time'][r.u8() - 1] || 'manual';
    const packed = r.u16();
    out.yaoValues = Array.from({ length: 6 }, (_, i) => [6, 7, 8, 9][(packed >> (i * 2)) & 3]);
    out.question = r.left() > 0 ? r.str() : '';
  } else if (kind === 'bazi' || kind === 'ziwei') {
    out.gender = r.u8() === 0 ? '女' : '男';
  } else if (kind === 'astro') {
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
