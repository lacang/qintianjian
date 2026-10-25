// 全局状态、本地配置与排盘时刻覆盖（纯 localStorage，无后端）
export const BIRTH = {
  year: 1994, month: 8, day: 1, hour: 11, minute: 45,
  gender: '男',
  longitude: 123.4328, // 沈阳（出生配置）
  latitude: 41.8057,
  place: '辽宁沈阳',
};

const CFG_KEY = 'qintian.cfg.v1';

export const cfg = loadCfg();
function loadCfg() {
  try {
    // 全局统一用北京时间（仅八字牌保留自身出生时间口径，与此开关无关）
    return { gender: '男', showShensha: true, showCangyao: true, lateZi: '23', apparentSolarTime: false, ...JSON.parse(localStorage.getItem(CFG_KEY) || '{}') };
  } catch {
    return { gender: '男', showShensha: true, showCangyao: true, lateZi: '23', apparentSolarTime: false };
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
  const geo = panAt.geo || {};
  return {
    ...BIRTH,
    ...geo,
    year: d.getFullYear(), month: d.getMonth() + 1, day: d.getDate(),
    hour: d.getHours(), minute: d.getMinutes(),
    ...extra,
  };
}

/** 当前生效的起盘时刻（梅花 / 奇门 / 天象） */
export function nowDate() {
  return panAt.now ? new Date(panAt.now) : new Date();
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
import { toTrueSolar } from './solartime.js';
export function resolveCastDate(date = new Date()) {
  const d = new Date(date.getTime());
  // v111：真太阳时按"当前观测地"经度校正（原来写死出生地沈阳）；观测地见 geo.js
  return cfg.apparentSolarTime ? toTrueSolar(d) : d;
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
