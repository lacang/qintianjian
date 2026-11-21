// 全局状态、本地配置与排盘时刻覆盖（纯 localStorage，无后端）
export const BIRTH = {
  year: 1994, month: 8, day: 1, hour: 11, minute: 45,
  gender: '男',
  longitude: 123.4328, // 沈阳（出生配置）
  latitude: 41.8057,
  place: '辽宁沈阳',
  city: '沈阳', // 时区查表主键：核心按它决定 UTC 偏移（境外出生改这里，别再写死 +8）
  trueSolarTime: true, // 真太阳时（经度差 + 均时差）默认开，只影响展示/四柱口径，不改宫位
};

const CFG_KEY = 'qintian.cfg.v1';

export const cfg = loadCfg();
function loadCfg() {
  try {
    // 全局统一用北京时间（仅八字牌保留自身出生时间口径，与此开关无关）
    return { gender: '男', showShensha: true, showCangyao: true, lateZi: '23', apparentSolarTime: false, trueSolarTime: true, ...JSON.parse(localStorage.getItem(CFG_KEY) || '{}') };
  } catch {
    return { gender: '男', showShensha: true, showCangyao: true, lateZi: '23', apparentSolarTime: false, trueSolarTime: true };
  }
}
export function saveCfg() {
  localStorage.setItem(CFG_KEY, JSON.stringify(cfg));
}

// 当前正在查看的盘（内存）
export const current = { pan: null, meta: null, caseId: null };

/* ============================================================
   排盘时刻覆盖：让每一个盘都能"输入时间"
   - panAt.birth：本命类（八字 / 星盘 / 紫微）覆盖出生时刻
   - panAt.now  ：当下类（梅花 / 奇门 / 天象）覆盖起盘时刻
   - panAt.geo  ：星盘的经纬度与地点覆盖（分享码里带出来时用）
   都为 null 时走默认值（BIRTH / 此刻）
   ============================================================ */
export const panAt = { birth: null, now: null, geo: null };

export function defaultBirthDate() {
  return new Date(BIRTH.year, BIRTH.month - 1, BIRTH.day, BIRTH.hour, BIRTH.minute, 0, 0);
}

/** 当前生效的出生时刻 */
export function birthDate() {
  return panAt.birth ? new Date(panAt.birth) : defaultBirthDate();
}

/** 八字 / 星盘 / 紫微 用的完整出生参数（已应用时刻与经纬度覆盖） */
export function birthArgs(extra = {}) {
  const d = birthDate();
  const geo = panAt.geo || null;
  const out = {
    ...BIRTH,
    ...(geo ? normalizeGeo(geo) : {}),
    year: d.getFullYear(), month: d.getMonth() + 1, day: d.getDate(),
    hour: d.getHours(), minute: d.getMinutes(),
    ...extra,
  };
  // 只给了经纬度没说城市：默认出生地的城市必须清掉，否则核心会拿沈阳的时区去纠正纽约的经度
  if (geo && !(geo.city || geo.place)) { delete out.city; delete out.place; }
  // 真太阳时开关：默认开（配置里显式关掉才关）
  if (out.trueSolarTime === undefined) out.trueSolarTime = cfg.trueSolarTime !== false;
  // 晚子时换日口径：界面上的切换要真的传到核心，否则四家各按各的默认算
  if (out.lateZiMode === undefined) out.lateZiMode = cfg.lateZi === '00' ? '00' : '23';
  // 时区偏移：只有真给了数值才传，否则让核心按 city/place 查表（境外出生全靠这一步）
  if (!Number.isFinite(out.utcOffsetHours)) delete out.utcOffsetHours;
  return out;
}

/**
 * 地理参数归一：一次覆盖必须是「一整套」，绝不能和默认出生地混搭。
 *
 * 旧实现的坑：birthArgs 是 {...BIRTH, ...geo} 的浅合并——只覆盖 city（广州）时
 * 沈阳的经纬度还留着，只覆盖经纬度时城市的时区还留着，于是出现
 * 「主盘纽约 + 副盘广州」或「选了纽约、经纬度还是沈阳（差 793 分钟）」。
 * 现在的规则：
 *   · 覆盖里有 city → 经纬度只认覆盖里的；没给就从城市表补（核心也会补）
 *   · 覆盖里只有经纬度 → 丢掉默认出生地的 city/place，让核心按经纬度推算时区
 *   · 两套字段名（lat/lonEast 与 latitude/longitude）一起写，避免新旧字段各读一半
 */
function normalizeGeo(geo) {
  const lon = geo.lonEast ?? geo.lon ?? geo.longitude;
  const lat = geo.lat ?? geo.latitude;
  const hasCity = !!(geo.city || geo.place);
  const out = {};
  if (hasCity) { out.city = geo.city || geo.place; out.place = geo.place || geo.city; }
  if (Number.isFinite(lat) && Number.isFinite(lon)) {
    out.lat = lat; out.latitude = lat;
    out.lonEast = lon; out.lon = lon; out.longitude = lon;
  }
  if (Number.isFinite(geo.utcOffsetHours)) out.utcOffsetHours = geo.utcOffsetHours;
  return out;
}

/**
 * 出生地覆盖（地点 + 城市 + 时区）。
 * 传 null 恢复默认出生地；传 { city, place, lat, lonEast, utcOffsetHours } 覆盖。
 * 经纬度两套字段名都写，兼顾核心（lat/lonEast/longitude）与老代码（latitude/longitude）。
 */
export function setGeoOverride(geo) {
  panAt.geo = geo ? { ...geo } : null;
  return panAt.geo;
}
export function getGeoOverride() {
  return panAt.geo ? { ...panAt.geo } : null;
}

/** 当前生效的起盘时刻（梅花 / 奇门 / 天象） */
export function nowDate() {
  return panAt.now ? new Date(panAt.now) : new Date();
}

/**
 * 「此刻」类盘面（奇门 / 梅花 / 子午流注 / 天象）用的地理参数：
 * 取地点中心的当前所在地（geo.js），一整套 city + 经纬度一起给，
 * 让核心扣夏令时、算真太阳时、定境外时区，不再默认按北京时间硬算。
 */
export function nowGeoArgs() {
  // 复现码/观测地覆盖优先：码里带的城市时区必须能左右时刻换算，
  // 否则「同一张奇门盘」换个时区打开，节气与局数会变。
  const o = panAt.geo || null;
  if (o && (o.city || o.place || Number.isFinite(o.lonEast) || Number.isFinite(o.lon))) return normalizeGeo(o);
  const p = getPlace();
  return {
    city: p.name,
    place: p.prov ? `${p.prov}${p.name}` : p.name,
    lat: p.lat, latitude: p.lat,
    lon: p.lon, lonEast: p.lon, longitude: p.lon,
  };
}

/* ============================ 时区快照（复现码 QT2 用） ============================ */

/**
 * 钟面 + 时区 + 经纬度的快照：**这就是「这个盘是在哪里、按哪个时区排的」的完整描述**。
 * QT2 码把它整份写进去，打开方不再依赖本机时区（r6_compat.md P0）。
 * @param {{y:number,mo:number,d:number,h:number,mi:number}} civil
 * @param {object} geoArgs birthplace args（city/place/lat/lonEast/…）
 */
export function tzSnapshotOfCivil(civil, geoArgs = {}) {
  const g = geoArgs || {};
  let r = null;
  try {
    r = resolveTime({
      ...g,
      year: civil.y, month: civil.mo, day: civil.d, hour: civil.h, minute: civil.mi,
    });
  } catch { r = null; }
  const pick = (...xs) => (xs.find((v) => Number.isFinite(v)) ?? null);
  const lon = r && Number.isFinite(r.longitude) ? r.longitude : pick(g.lonEast, g.lon, g.longitude);
  const lat = r && Number.isFinite(r.latitude) ? r.latitude : pick(g.lat, g.latitude);
  const offsetMinutes = r && Number.isFinite(r.utcOffsetHours) ? Math.round(r.utcOffsetHours * 60) : null;
  return {
    civil: { ...civil },
    city: (r && r.cityName) || g.city || g.place || '',
    tz: (r && r.sourceTzName) || '',
    tzOffsetMinutes: offsetMinutes,
    // 只有在「命中城市表」时才算精确；估算 / 兜底一律标记，界面必须据此告警
    tzEstimated: !r || r.tzSource !== 'city' || !!r.tzEstimated || !!r.tzFallback,
    // 该时刻当地是否在夏令时内：写进码里，打开方才知道这盘的钟面是夏令时时钟
    inDst: !!(r && r.inDst),
    lon, lat,
    warnings: r ? (r.warnings || []).slice() : ['无法解析时区'],
  };
}

/** 出生盘此刻的快照（写码用） */
export function birthTzSnapshot() {
  return tzSnapshotFor(birthDate(), birthArgs());
}

/** 此刻 / 观测地 的快照（写码用） */
export function nowTzSnapshot() {
  return tzSnapshotFor(nowDate(), nowGeoArgs());
}

/** 本地 Date → 快照 */
export function tzSnapshotFor(date, geoArgs = {}) {
  const d = new Date(Number(date) || Date.now());
  return tzSnapshotOfCivil(
    { y: d.getFullYear(), mo: d.getMonth() + 1, d: d.getDate(), h: d.getHours(), mi: d.getMinutes() },
    geoArgs,
  );
}

/**
 * 把「绝对时刻 + 城市」反解成该城市的钟面（旧 QT1 码补时区时用）。
 * 时区随夏令时变化，所以要迭代到不动点；4 轮足够，边界处取最后一次。
 * @returns {{civil:object, offsetMinutes:number, tz:string, tzEstimated:boolean, warnings:string[]}|null}
 */
export function civilInCity(utcMs, city) {
  const t0 = Number(utcMs);
  if (!Number.isFinite(t0)) return null;
  let offHours = 0;
  let last = null;
  for (let i = 0; i < 4; i++) {
    const t = new Date(t0 + offHours * 3600000);
    const civil = {
      y: t.getUTCFullYear(), mo: t.getUTCMonth() + 1, d: t.getUTCDate(),
      h: t.getUTCHours(), mi: t.getUTCMinutes(),
    };
    let r = null;
    try {
      r = resolveTime({ city, year: civil.y, month: civil.mo, day: civil.d, hour: civil.h, minute: civil.mi });
    } catch { return last; }
    if (!r || !Number.isFinite(r.utcOffsetHours)) return last;
    last = {
      civil,
      offsetMinutes: Math.round(r.utcOffsetHours * 60),
      tz: r.sourceTzName || '',
      tzEstimated: r.tzSource !== 'city' || !!r.tzEstimated || !!r.tzFallback,
      inDst: !!r.inDst,
      warnings: (r.warnings || []).slice(),
    };
    if (Math.abs(r.utcOffsetHours - offHours) < 1e-6) return last;
    offHours = r.utcOffsetHours;
  }
  return last;
}

export function setPanAt(scope, date) {
  panAt[scope] = date ? new Date(date).getTime() : null;
}
export function resetPanAt(scope) {
  panAt[scope] = null;
}
export function clearPanAt() {
  panAt.birth = null; panAt.now = null; panAt.geo = null;
}

// 排盘所用时刻：默认全应用统一北京时间；开「真太阳时」后，起卦/起盘时刻按均时差+经度差校正
// （NOAA 算法见 solartime.js；只作用于起卦时刻，八字/星盘出生时间仍按钟面时刻，牌面另有口径标注）
import { toTrueSolar } from './solartime.js?v=133';
import { getPlace } from './geo.js?v=133';
// 时区解析（QT2 码要把「这里的时区」写进码里；单机离线，无 Intl 时区库）
import { resolveTime } from '../vendor/liuyao-core.js?v=133';
export function resolveCastDate(date = new Date()) {
  const d = new Date(date.getTime());
  // v111：真太阳时按"当前观测地"经度校正（原来写死出生地沈阳）；观测地见 geo.js
  return cfg.apparentSolarTime ? toTrueSolar(d) : d;
}

/**
 * **视图层唯一的时间入口**：把「浏览器钟面 + 观测地」装成内核
 * `resolvePaipanTime()` / `paiQiMen()` / `paipan()` / `meiHuaByTime()` 都吃的那份入参。
 *
 * 为什么要有它（audit4 · fix_r4）：大六壬/小六壬/奇门/梅花/六爻曾各自决定「折不折真太阳时、
 * 按哪个时区、要不要夏令时」。口径开关只该有一个来源（`cfg`），地点只该有一个来源
 * （`nowGeoArgs()`），于是统一在这里拼一次；视图里不许再出现 `at.getHours()` 之类的时间推算。
 *
 * 口径开关与八字完全同源：
 *   - 真太阳时 → `cfg.trueSolarTime !== false`（默认开；旧的 `cfg.apparentSolarTime` 只管起卦输入框的
 *     即时预览，不再决定任何盘的排盘口径）
 *   - 晚子时换日 → `cfg.lateZi === '00' ? '00' : '23'`
 * 显式传入的 geo 字段优先于全局配置（便于测试与复现码调用）。
 *
 * @param {Date} date 浏览器本地钟面（`panAt.now` 或 `new Date()`）
 * @param {object} geo 观测地参数（city/place/lat/lonEast/…），默认 `nowGeoArgs()`
 */
export function panTimeArgs(date = nowDate(), geo = nowGeoArgs()) {
  const d = new Date(date && date.getTime ? date.getTime() : date);
  return {
    trueSolarTime: cfg.trueSolarTime !== false,
    lateZiMode: cfg.lateZi === '00' ? '00' : '23',
    ...(geo || {}),
    year: d.getFullYear(), month: d.getMonth() + 1, day: d.getDate(),
    hour: d.getHours(), minute: d.getMinutes(), second: d.getSeconds(),
  };
}


// 通用一键复制：优先 Clipboard API（微信内置浏览器等需用户手势触发），失败降级 execCommand
export async function copyText(text, btnEl = null) {
  let done = false;
  try {
    await navigator.clipboard.writeText(text); done = true;
  } catch {
    try {
      const ta = document.createElement('textarea');
      ta.value = text;
      ta.style.position = 'fixed';
      ta.style.opacity = '0';
      document.body.appendChild(ta);
      ta.focus(); ta.select();
      done = document.execCommand('copy');
      ta.remove();
    } catch { done = false; }
  }
  if (done) flashCopyBtn(btnEl); else toast('复制失败，请长按选择');
  return done;
}

// 复制成功反馈：按钮瞬时变“✓ 已复制”金色，1.3s 后还原；无按钮则退化为 toast
export function flashCopyBtn(btn) {
  if (!btn) { toast('已复制'); return; }
  if (btn.dataset._busy) return;
  const old = btn.textContent;
  btn.dataset._busy = '1';
  btn.classList.add('copied');
  btn.textContent = '✓ 已复制';
  setTimeout(() => { btn.textContent = old; btn.classList.remove('copied'); btn.dataset._busy = ''; }, 1300);
}

export function $(sel, root = document) { return root.querySelector(sel); }
export function $$(sel, root = document) { return Array.from(root.querySelectorAll(sel)); }

export function toast(msg) {
  const t = $('#toast');
  if (!t) { alert(msg); return; }
  t.textContent = msg;
  t.classList.add('show');
  clearTimeout(t._timer);
  t._timer = setTimeout(() => t.classList.remove('show'), 1800);
}

// 时刻归一到整秒：复现码以秒为精度，盘面时刻与码里的时刻必须同源
export function toSec(ms) { return Math.floor((Number(ms) || 0) / 1000) * 1000; }

export function pad(n) { return String(n).padStart(2, '0'); }

export function escapeHtml(s) {
  return String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

// 解析 <input type="datetime-local"> 的值（YYYY-MM-DDTHH:mm，可带 :ss）为本地时刻；非法或越界返回 null
export function parseLocalDateTime(str) {
  // 兼容分钟精度与 step="1" 的秒精度两种格式
  const m = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})(?::(\d{2}))?/.exec(String(str || ''));
  if (!m) return null;
  const y = +m[1], mo = +m[2], d = +m[3], h = +m[4], mi = +m[5], s = m[6] ? +m[6] : 0;
  if (mo < 1 || mo > 12 || d < 1 || d > 31 || h > 23 || mi > 59 || s > 59) return null;
  const dt = new Date(y, mo - 1, d, h, mi, s, 0);
  // 回读校验，挡住 2026-02-30 这类不存在的日期
  if (dt.getFullYear() !== y || dt.getMonth() !== mo - 1 || dt.getDate() !== d) return null;
  return dt;
}

// 本地时刻 → datetime-local 输入框的值（withSeconds=true 用于 step="1" 的秒精度输入）
export function toLocalInputValue(date = new Date(), withSeconds = false) {
  const base = `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
  return withSeconds ? `${base}:${pad(date.getSeconds())}` : base;
}

/** 时刻 → 2026-11-11 10:00 这类可读文本 */
export function fmtMoment(date) {
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}`;
}
