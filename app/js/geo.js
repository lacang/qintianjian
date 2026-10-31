// 地点中心 · 定位 / 拼音搜城市 / 当前地点 —— 全盘面共用一个真相源
// 为什么要它：v111 之前经纬度写死沈阳（solartime / globe / 二十八宿 / 占星城市表各写一份），
// 主人要求"地址不能写死沈阳"、"所有命盘里都可以选地址"。这里统一收口：
//   · 定位优先（navigator.geolocation，失败可退回手选）
//   · 手动拼音/中文搜城市（离线城市库 citydata.js，无任何网络请求）
//   · 当前地点持久化在 localStorage，变更时广播，页面按需重渲染
// 边界：本命出生地仍用 state.BIRTH（沈阳），不受这里影响；这里只管"此刻在哪"这类排盘/天象用。
import { CITIES } from './citydata.js?v=125';

const KEY = 'qintian.place.v1';
const listeners = [];

// 未选择时的兜底＝主人的出生地（显式标 src='default'，界面会提示"未设置"）
export const DEFAULT_PLACE = { name: '沈阳', prov: '辽宁', lat: 41.8057, lon: 123.4328, src: 'default' };

function readPlace() {
  try {
    const p = JSON.parse(localStorage.getItem(KEY) || 'null');
    if (p && p.name && isFinite(p.lat) && isFinite(p.lon)) return { prov: '', src: 'manual', ...p };
  } catch { /* 隐私模式：读不到就用默认 */ }
  return { ...DEFAULT_PLACE };
}
let cur = readPlace();

export function getPlace() { return cur; }
export function isPlaceSet() { return cur.src !== 'default'; }

export function setPlace(p) {
  cur = { name: p.name, prov: p.prov || '', lat: +p.lat, lon: +p.lon, src: p.src || 'manual' };
  try { localStorage.setItem(KEY, JSON.stringify(cur)); } catch { /* 隐私模式：不落盘也能用 */ }
  listeners.forEach(fn => { try { fn(cur); } catch { /* 单个订阅失败不影响其它 */ } });
  return cur;
}
export function resetPlace() { return setPlace({ ...DEFAULT_PLACE }); }
export function onPlaceChange(fn) { listeners.push(fn); return () => { const i = listeners.indexOf(fn); if (i >= 0) listeners.splice(i, 1); }; }

// ---------- 检索（拼音全拼 / 拼音首字母 / 中文） ----------
function norm(s) { return String(s || '').toLowerCase().replace(/[\s·・'’\-]/g, ''); }

export function searchCity(q, limit = 40) {
  const s = norm(q);
  if (!s) return [];
  const out = [];
  for (const c of CITIES) {
    let score = 0;
    if (c.n === q) score = 100;
    else if (norm(c.n) === s) score = 98;
    else if (norm(c.n).startsWith(s)) score = 90;
    else if (c.py === s) score = 88;
    else if (c.py.startsWith(s)) score = 82;
    else if (c.ini === s) score = 80;
    else if (c.ini.startsWith(s)) score = 74;
    else if (norm(c.n).includes(s)) score = 60;
    else if (c.py.includes(s)) score = 50;
    else if (norm(c.prov || '').includes(s)) score = 30;
    if (score) out.push({ c, score });
  }
  out.sort((a, b) => b.score - a.score || a.c.n.localeCompare(b.c.n, 'zh'));
  return out.slice(0, limit).map(x => x.c);
}

// 定位反查：找最近的城市（粗略，仅用于给定位结果起个名字）
export function nearestCity(lat, lon) {
  let best = null, bd = Infinity;
  for (const c of CITIES) {
    const dx = (c.lon - lon) * Math.cos((lat + c.lat) * Math.PI / 360);
    const dy = c.lat - lat;
    const d = Math.hypot(dx, dy);
    if (d < bd) { bd = d; best = c; }
  }
  return best ? { city: best, km: bd * 111 } : null;
}

// ---------- 浏览器定位 ----------
export function locate({ timeout = 8000 } = {}) {
  return new Promise((resolve, reject) => {
    if (typeof navigator === 'undefined' || !navigator.geolocation) return reject(new Error('本机浏览器不支持定位'));
    let done = false;
    const t = setTimeout(() => { if (!done) { done = true; reject(new Error('定位超时，可改用手动搜城市')); } }, timeout);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        if (done) return; done = true; clearTimeout(t);
        const lat = pos.coords.latitude, lon = pos.coords.longitude;
        resolve({ lat, lon, near: nearestCity(lat, lon), accuracy: pos.coords.accuracy });
      },
      (err) => {
        if (done) return; done = true; clearTimeout(t);
        const denied = err && (err.code === 1 || /denied/i.test(err.message || ''));
        reject(new Error(denied ? '你拒绝了定位权限，可改用手动搜城市' : ('定位失败：' + ((err && err.message) || '未知原因'))));
      },
      { enableHighAccuracy: false, timeout, maximumAge: 60000 }
    );
  });
}

// 刷新定位：仅当当前观测地来源是"定位"时重新取一次（起卦当时要"那一刻的位置"）
// 手选城市尊重用户选择，不覆盖。
export async function refreshLocatedPlace({ timeout = 6000 } = {}) {
  if (cur.src !== 'locate') return cur;
  try {
    const r = await locate({ timeout });
    const nm = r.near ? r.near.city.n : '当前位置';
    return setPlace({ name: nm, prov: r.near ? r.near.city.prov : '', lat: r.lat, lon: r.lon, src: 'locate' });
  } catch { /* 拿不到就沿用上次的定位 */ return cur; }
}

// ---------- 展示辅助 ----------
export function fmtCoord(p) {
  const ns = p.lat >= 0 ? 'N' : 'S', ew = p.lon >= 0 ? 'E' : 'W';
  return `${Math.abs(p.lat).toFixed(2)}°${ns} ${Math.abs(p.lon).toFixed(2)}°${ew}`;
}
export function placeLabel(p) {
  const tag = p.src === 'locate' ? '定位' : (p.src === 'default' ? '未设置' : '手选');
  return `${p.name} · ${tag}`;
}
