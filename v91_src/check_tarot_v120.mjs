// v120：删雷诺曼、回归纯塔罗后的桩测（冒烟 + 回归护栏）
// ①renderTarot/mountTarot 纯塔罗落座，不再有分类分流
// ②源码无 lenormand / data-tr-cat / catBar / curCat 残留
// ③v119 三按钮 pointer-events 修复不回归
// ④SW/import 闭包无悬挂的雷诺曼条目
import { readFileSync } from 'node:fs';
const APP = '/Coze/Drive/编程专家/每日六爻/app/';
const TMP = '/tmp/tarot120/app/';

let err = 0;
const chk = (c, m) => { if (!c) { console.log('❌', m); err++; } else console.log('✓', m); };

// ---------- 极简 DOM（够 tarotview 事件流跑） ----------
class El {
  constructor(id) { this.id = id || ''; this._cls = new Set(); this.attrs = {}; this._h = ''; this.children = []; this.value = ''; this.hidden = false; this.style = {}; }
  get classList() { const s = this._cls; return { add: (...c) => c.forEach(x => s.add(x)), remove: (...c) => c.forEach(x => s.delete(x)), toggle: x => s.has(x) ? s.delete(x) : s.add(x), contains: x => s.has(x) }; }
  set innerHTML(v) { this._h = String(v); this.children = []; }
  get innerHTML() { return this._h; }
  set textContent(v) { this._t = v; }
  get textContent() { return this._t || ''; }
  setAttribute(k, v) { this.attrs[k] = String(v); }
  removeAttribute(k) { delete this.attrs[k]; }
  getAttribute(k) { return this.attrs[k] ?? null; }
  closest(sel) { return match(this, sel) ? this : null; }
  appendChild(c) { this.children.push(c); if (c.id) byId[c.id] = c; return c; }
  addEventListener() {}
  removeEventListener() {}
  querySelector(sel) { if (sel.startsWith('#')) { const id = sel.slice(1); const e = this._h.includes(`id="${id}"`) ? new El(id) : null; return e; } return null; }
  querySelectorAll() { return []; }
  remove() {}
}
function match(el, sel) {
  if (sel.startsWith('#')) return el.id === sel.slice(1);
  if (sel.startsWith('[') && sel.endsWith(']')) { const k = sel.slice(1, -1); return el.attrs[k] != null; }
  return el._cls.has(sel.slice(1));
}
globalThis.__ls = {};
const byId = {};
const docListeners = { click: [], input: [] };
globalThis.document = {
  createElement: () => new El(),
  getElementById: i => byId[i] || (byId[i] = new El(i)),
  querySelector(sel) { if (sel.startsWith('#')) { const id = sel.slice(1); return byId[id] || (byId[id] = new El(id)); } return null; },
  addEventListener: (t, f) => { (docListeners[t] = docListeners[t] || []).push(f); },
  body: new El('body'),
};
globalThis.window = { innerWidth: 390, innerHeight: 780, addEventListener() {}, matchMedia: () => ({ matches: false }) };
globalThis.localStorage = {
  getItem: k => globalThis.__ls[k] ?? null,
  setItem: (k, v) => { globalThis.__ls[k] = String(v); },
  removeItem: k => { delete globalThis.__ls[k]; },
};
globalThis.requestAnimationFrame = cb => setTimeout(cb, 0);
globalThis.setTimeout = (fn) => { fn && fn(); return 0; };
globalThis.clearTimeout = () => {};
globalThis.getComputedStyle = () => ({ aspectRatio: '' });
let seed = 7;
globalThis.Math.random = () => { seed = (seed * 1103515245 + 12345) & 0x7fffffff; return seed / 0x7fffffff; };

const V = await import('file://' + TMP + 'js/tarotview.js?t=' + Date.now());

// 宿主挂点（同 main.js）
const body = new El('tarot-body');
byId['tarot-body'] = body;
const trResult = new El('tr-result');
byId['tr-result'] = trResult;
const tableMounted = () => /tr-table/.test(trResult.innerHTML);

// ============ 纯塔罗渲染契约 ============
const html0 = V.renderTarot();
chk(html0.includes('id="tr-result"'), 'renderTarot 产出纯塔罗壳（#tr-result）');
chk(!/tr-catbar|data-tr-cat/.test(html0), 'renderTarot 不再有分类条 / data-tr-cat');
chk(!/lenormand|雷诺曼/i.test(html0), 'renderTarot 输出不含任何雷诺曼字样');

V.initTarot();
body.innerHTML = V.renderTarot();
V.mountTarot();
chk(tableMounted(), 'mountTarot 直接落座牌桌（.tr-table 在 DOM）');
chk(!('qintian.cards.cat' in globalThis.__ls), '不再写分类状态键 qintian.cards.cat');

// ============ 源码无分类分流残留 ============
const src = readFileSync(TMP + 'js/tarotview.js', 'utf8');
chk(!/lenormand/i.test(src), 'tarotview.js 无 lenormand 字样');
chk(!/curCat|catBarHTML|CAT_KEY|data-tr-cat/.test(src), 'tarotview.js 无 curCat/catBar/CAT_KEY/分类委托');
chk(!/renderLenormand/.test(src), 'tarotview.js 不再 import/调用 renderLenormand');
chk(src.includes("closest('[data-tr-flipall]')") && src.includes('revealAll()'), '幕二全部翻开委托链完整（v119 不回归）');
chk(src.includes("closest('#trt-read')"), '开牌解局委托链完整（v119 不回归）');

// main.js 不再引用雷诺曼
const mainSrc = readFileSync(TMP + 'js/main.js', 'utf8');
chk(!/lenormand/i.test(mainSrc), 'main.js 无 lenormand 引用');

// ============ v119 按钮 pointer-events 修复不回归 ============
const css = readFileSync(APP + 'css/tarot.css', 'utf8');
chk(/\.trt-stagepos\{[^}]*pointer-events:none/.test(css), '舞台层仍 pointer-events:none（透传不回归）');
chk(/\.trt-flipallbtn\{pointer-events:auto/.test(css), '全部翻开按钮 pointer-events:auto');
chk(/\.trt-readbtn\{pointer-events:auto/.test(css), '开牌解局按钮 pointer-events:auto');
chk(!/tr-catbar|trm-cat/.test(css), 'tarot.css 已删 .tr-catbar / .trm-cat 样式');

// ============ SW 无悬挂雷诺曼条目 ============
const sw = readFileSync(APP + 'sw.js', 'utf8');
chk(!/lenormand|lendata|lenicons/i.test(sw), 'sw.js ASSETS 无悬挂的雷诺曼条目');

// vendor ANY_DIVINATION 已去 lenormand
const core = readFileSync(APP + 'vendor/liuyao-core.js', 'utf8');
chk(!/["']lenormand["']/.test(core), 'vendor ANY_DIVINATION 已去 lenormand');

console.log(err ? `\n❌ ${err} 项失败` : '\n✅ 全部通过');
process.exit(err ? 1 : 0);
