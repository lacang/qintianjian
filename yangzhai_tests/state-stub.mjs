// 轻桩：替代 js/state.js，只提供阳宅视图用到的导出
export const cfg = { gender: '男' };
export function birthDate() { return new Date(1994, 7, 1, 11, 45); }
export function $(sel) { return document.querySelector(sel); }
export function $$(sel) {
  if (typeof sel === 'string') return Array.from(document.querySelectorAll(sel));
  return Array.from(sel || []);
}
export function escapeHtml(s) {
  return String(s == null ? '' : s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}
