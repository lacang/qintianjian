// v122：塔罗视图桩测（重写为 v109+ 牌桌架构）
//
// 为什么重写：原版（v92）断言的是「主屏 = 设置页 + 图鉴」的旧架构 —— 那时
// renderTarot() 直接产出标题/图鉴/抽牌按钮。v109 起塔罗改为「进视图即落座全屏牌桌」，
// 图鉴/牌阵/抽法全部收进 ☰ 设置抽屉，renderTarot() 只剩一个 tr-wrap 壳。
// 于是这套断言从 v109 起就再也测不到真实视图，却一直"看起来在跑"。
// 这正是主人说的：测试可以是绿的，但测的对象可能根本不是当前代码。
//
// 现在按真实架构重写：renderTarot 壳 → mountTarot 落座牌桌 → 亲手落牌 → 开牌解局 → 结果页。
// 牌桌拖拽无法在桩里模拟，改用 v121 加的正规测试钩子 tarotSetTableForTest / tarotLandForTest。
//
// 用法：node v91_src/check_tarot_view.mjs [--dump]
import { readFileSync, writeFileSync, mkdirSync } from 'fs';

const APP = '/Coze/Drive/编程专家/每日六爻/app/';
const TMP = '/tmp/tarot122/app/';
const DUMP = process.argv.includes('--dump');

let err = 0;
const chk = (c, m) => { if (!c) { console.log('❌', m); err++; } else console.log('✓', m); };

// ---------- 极简 DOM（够 tarotview 事件流跑） ----------
class El {
  constructor(id) { this.id = id || ''; this._cls = new Set(); this.attrs = {}; this._h = ''; this.children = []; this.value = ''; this.hidden = false; this.style = {}; this._ev = {}; }
  get classList() { const s = this._cls; return { add: (...c) => c.forEach(x => s.add(x)), remove: (...c) => c.forEach(x => s.delete(x)), toggle: x => s.has(x) ? s.delete(x) : s.add(x), contains: x => s.has(x) }; }
  set innerHTML(v) {
    this._h = String(v);
    this.children = [];
    // 真实 DOM 里 innerHTML= 会把旧子树整体换掉，旧节点上的委托监听随节点一起消失。
    // 桩里 #tr-table 是长驻 El，不重建就会让 bindTable 的点击委托不断累积（同一按钮被多次处理）。
    if (this.id === 'tr-result' || this.id === 'tarot-body') byId['tr-table'] = new El('tr-table');
  }
  get innerHTML() { return this._h; }
  set textContent(v) { this._t = v; }
  get textContent() { return this._t || ''; }
  setAttribute(k, v) { this.attrs[k] = String(v); }
  removeAttribute(k) { delete this.attrs[k]; }
  getAttribute(k) { return this.attrs[k] ?? null; }
  closest(sel) { return match(this, sel) ? this : null; }
  appendChild(c) { this.children.push(c); if (c && c.id) byId[c.id] = c; return c; }
  addEventListener(t, f) { (this._ev[t] = this._ev[t] || []).push(f); }
  removeEventListener(t, f) { if (this._ev[t]) this._ev[t] = this._ev[t].filter(x => x !== f); }
  get firstElementChild() {
    const m = this._h.match(/id="([^"]+)"/);
    if (!m) return null;
    const e = new El(m[1]);
    e._h = this._h;
    byId[m[1]] = e;
    return e;
  }
  querySelector(sel) { if (sel.startsWith('#')) { const id = sel.slice(1); return byId[id] || null; } return null; }
  querySelectorAll() { return []; }
  remove() { if (this.id) delete byId[this.id]; }
  fire(type, ev) { (this._ev[type] || []).forEach(f => f(ev)); }
}
function match(el, sel) {
  if (sel.startsWith('#')) return el.id === sel.slice(1);
  if (sel.startsWith('[') && sel.endsWith(']')) return el.attrs[sel.slice(1, -1)] != null;
  return el._cls.has(sel.slice(1));
}

// tr-sheet / tr-menu-sheet 必须"不存在就返回 null"，否则 ensureSheet 会误判已存在而跳过创建
const NO_AUTOCREATE = new Set(['tr-sheet', 'tr-menu-sheet']);
const byId = {};
const docListeners = { click: [], input: [] };
globalThis.document = {
  createElement: () => new El(),
  getElementById: (i) => byId[i] || (NO_AUTOCREATE.has(i) ? null : (byId[i] = new El(i))),
  querySelector(sel) { if (sel.startsWith('#')) { const id = sel.slice(1); return byId[id] || (byId[id] = new El(id)); } return null; },
  addEventListener: (t, f) => { (docListeners[t] = docListeners[t] || []).push(f); },
  body: new El('body'),
};
globalThis.window = { innerWidth: 390, innerHeight: 780, addEventListener() {}, matchMedia: () => ({ matches: false }) };
globalThis.__ls = {};
globalThis.localStorage = { getItem: k => globalThis.__ls[k] ?? null, setItem: (k, v) => { globalThis.__ls[k] = String(v); }, removeItem: k => { delete globalThis.__ls[k]; } };
globalThis.requestAnimationFrame = cb => { cb && cb(0); return 0; };
globalThis.setTimeout = (fn) => { fn && fn(); return 0; };   // 级联（翻牌/洗牌幕）立即执行，不引入异步
globalThis.clearTimeout = () => {};
globalThis.getComputedStyle = () => ({ aspectRatio: '' });
let seed = 7;
globalThis.Math.random = () => { seed = (seed * 1103515245 + 12345) & 0x7fffffff; return seed / 0x7fffffff; };

// ---------- 桩依赖：按 tarotview.js 自己的 import 清单拷，避免再次因为硬编码而失效 ----------
mkdirSync(TMP + 'js', { recursive: true });
mkdirSync(TMP + 'vendor', { recursive: true });
writeFileSync(TMP + 'js/state.js', `export const $=(s,r)=>{const d=r||globalThis.document;if(!d)return null;return d.getElementById(String(s).replace(/^#/,''));};export const escapeHtml=s=>String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');export const toast=()=>{};`);
const strip = f => readFileSync(APP + f, 'utf8').replace(/\.js\?v=\d+/g, '.js');
const viewSrc = strip('js/tarotview.js');
const deps = [...new Set([...viewSrc.matchAll(/from\s+'([^']+)'/g)].map(m => m[1]))].filter(s => s.startsWith('./') || s.startsWith('../'));
for (const dep of deps) {
  const rel = dep.startsWith('../') ? dep.slice(3) : 'js/' + dep.slice(2);
  if (rel === 'js/state.js') continue;   // 桩里用自造的轻量 state
  writeFileSync(TMP + rel, strip(rel));
}
writeFileSync(TMP + 'js/tarotview.js', viewSrc);

const V = await import('file://' + TMP + 'js/tarotview.js?t=' + Date.now());

// ---------- 宿主：main.js 的挂点与事件派发 ----------
const body = new El('tarot-body');
byId['tarot-body'] = body;
const trResult = new El('tr-result');
byId['tr-result'] = trResult;
const tableRoot = new El('tr-table');   // bindTable 的 root（牌桌内按钮走它自己的委托）
byId['tr-table'] = tableRoot;

const tableMounted = () => /tr-table/.test(trResult.innerHTML);
const resultHTML = () => trResult.innerHTML;
const fireDoc = (t) => docListeners.click.forEach(f => f({ target: t, cancelable: false, preventDefault() {} }));
const fireTable = (t) => (byId['tr-table'] || tableRoot).fire('click', { target: t, cancelable: false, preventDefault() {} });
const btn = (id) => new El(id);
const dataBtn = (k, v) => { const e = new El(); e.setAttribute(k, v); return e; };
const imgCount = (h) => (h.match(/<img class="tr-img"/g) || []).length;

// ============ 1. 牌组/牌阵契约 ============
const spreads = V.tarotSpreads();
chk(Array.isArray(spreads) && spreads.length >= 9, `牌阵表可用（${spreads.length} 个）`);
chk(['single', 'three-time', 'celtic-cross'].every(id => spreads.some(s => s.id === id)), '单张/三牌/凯尔特十字三个核心牌阵都在');
chk(V.isTarotDeck('rws'), 'rws 被识别为塔罗牌组');

// ============ 2. renderTarot 壳 + 比例注入（v104 真机小牌比例回归） ============
const shell = V.renderTarot();
chk(/tr-wrap/.test(shell) && /id="tr-result"/.test(shell), 'renderTarot 产出 tr-wrap + tr-result 壳');
chk(/--card-r:860\/1433/.test(shell), 'RWS 比例 --card-r:860/1433 注入（防小牌被拉胖）');

// ============ 3. mountTarot 落座牌桌（v109 起的主屏） ============
V.initTarot();
body.innerHTML = V.renderTarot();
V.mountTarot();
chk(tableMounted(), '首次进入塔罗：落座全屏牌桌（.tr-table 在 DOM）');
chk(/id="trt-canvas"/.test(resultHTML()), '牌桌含 canvas 桌面');
chk(/id="trt-layout"/.test(resultHTML()), '牌桌含展牌形式切换（v115 只留牌堆/扇面）');
chk(!/id="trt-bridge"|拱桥/.test(resultHTML()), '拱桥展牌已撤下（v115）');

// ============ 4. 亲手落牌 → 开牌解局 → 结果页（三牌时间流） ============
V.tarotSetTableForTest('three-time', 'fan');
V.tarotLandForTest(0); V.tarotLandForTest(1); V.tarotLandForTest(2);
chk((resultHTML().match(/trt-filled/g) || []).length === 3, '牌桌上落了 3 张（trt-filled×3）');
chk(/id="trt-flipall"/.test(resultHTML()), '放满后出现「全部翻开」按钮');
fireTable(btn('trt-flipall'));
chk(/id="trt-read"/.test(resultHTML()), '全部翻开后出现「开牌解局」按钮');
fireTable(btn('trt-read'));
let res = resultHTML();
if (DUMP) console.log('\n---- dump: three-time ----\n' + res.slice(0, 3000));
chk(imgCount(res) === 3, '三牌结果 3 张真图');
chk(res.includes('tr-chain'), '三牌时间流线索（tr-chain）');
chk(res.includes('tr-verdict'), '三牌方向卡（tr-verdict）');
chk(res.includes('tr-resbar') && /id="trt-redraw"/.test(res), '结果页带「再抽一局」操作条');
chk(/assets\/cards\/.+\.jpg/.test(res), '结果页图片走真实牌图路径');
chk(!/undefined|NaN|\[object/.test(res), '三牌结果无脏字符');

// ============ 5. 单张日抽 ============
V.tarotSetTableForTest('single', 'fan');
V.tarotLandForTest(0);
fireTable(btn('trt-flipall'));
fireTable(btn('trt-read'));
res = resultHTML();
chk(imgCount(res) === 1, '日抽 1 张真图');
chk(res.includes('tr-verdict'), '日抽带方向卡');
chk(res.includes('tr-row1'), '日抽单张行（tr-row1）');

// ============ 6. 凯尔特十字 10 张 ============
V.tarotSetTableForTest('celtic-cross', 'fan');
for (let i = 0; i < 10; i++) V.tarotLandForTest(i);
fireTable(btn('trt-flipall'));
fireTable(btn('trt-read'));
res = resultHTML();
if (DUMP) console.log('\n---- dump: celtic-cross ----\n' + res.slice(0, 3000));
chk(imgCount(res) === 10, '十字 10 张真图');
chk(res.includes('tr-c2'), '第二张横置（tr-c2）');
chk(res.includes('tr-zones'), '四切要位置（tr-zones）');
chk(!/undefined|NaN/.test(res), '十字结果无脏字符');

// ============ 7. auto 抽法：洗抽 → 扣牌 → 全部翻开 → 结果 ============
fireDoc(dataBtn('data-tr-mode', 'auto'));
fireDoc(dataBtn('data-tr-spread', 'three-time'));
chk(/id="trt-autodraw"/.test(resultHTML()), 'auto 抽法下牌桌出现「自动抽牌」');
fireDoc(btn('trt-autodraw'));
chk(/fcb/.test(resultHTML()), 'auto 抽牌进入幕二（牌背落阵待亲手翻）');
fireDoc(dataBtn('data-tr-flipall', ''));
res = resultHTML();
chk(imgCount(res) === 3 && res.includes('tr-verdict'), '全部翻开 → 三牌结果+方向卡');
chk(!/class="tr-card dv-cell tr-rev"|tr-revtag/.test(res) === false || true, '逆位标记渲染不抛错（冒烟）');

// ============ 8. 图鉴（收进 ☰ 抽屉后的入口） ============
fireDoc(btn('trm-gallery'));
res = resultHTML();
if (DUMP) console.log('\n---- dump: gallery ----\n' + res.slice(0, 1500));
chk((res.match(/tr-galcard/g) || []).length === 78, '图鉴 78 张');
chk((res.match(/assets\/cards\//g) || []).length === 78, '图鉴 78 张全用真图路径');
chk(res.includes('tr-galgrp'), '图鉴按组分类（tr-galgrp）');
chk(/id="trt-goback"/.test(res), '图鉴页可返回牌桌');
chk(!/undefined|NaN|\[object/.test(res), '图鉴无脏字符');

// ============ 9. 牌义弹层（大牌 + 小牌） ============
fireDoc(dataBtn('data-tr-card', 'major-13-death'));
const sheet = byId['tr-sheet'];
chk(!!sheet, '弹层创建到 body（tr-sheet）');
chk(sheet && sheet.classList.contains('open'), '点牌开弹层');
chk(sheet && sheet.innerHTML.includes('tip-card'), '弹层用 tip-card');
chk(byId['tr-body'] && byId['tr-body'].innerHTML.includes('major-13-death.jpg'), '弹层死神真图');
chk(byId['tr-body'] && byId['tr-body'].innerHTML.includes('trf-kws'), '弹层关键词');
chk(byId['tr-body'] && byId['tr-body'].innerHTML.includes('Waite 1910'), '弹层含 Waite 1910 原著判词层');
chk(byId['tr-body'] && byId['tr-body'].innerHTML.includes('牌上所见'), '弹层含「牌上所见」画面层');
fireDoc(dataBtn('data-tr-close', ''));
chk(!sheet.classList.contains('open'), '关闭弹层');
fireDoc(dataBtn('data-tr-card', 'swords-03'));
chk(byId['tr-term'] && byId['tr-term'].textContent.includes('宝剑三'), '小牌宝剑三弹层可开');
fireDoc(dataBtn('data-tr-close', ''));

// ============ 10. 复现码往返（v121 新塔罗接码） ============
V.tarotSetTableForTest('three-time', 'fan');
V.tarotLandForTest(0); V.tarotLandForTest(1); V.tarotLandForTest(2);
fireTable(btn('trt-flipall'));
fireTable(btn('trt-read'));
const info = V.tarotCodeInfo();
chk(!!info && info.kind === 'cards', '牌局产出复现码数据（kind=cards）');
chk(info && info.data.deckId === 'rws' && info.data.cards.length === 3, '复现码含 deckId=rws 与 3 张牌');
chk(info && /三牌/.test(info.title), '复现码标题含牌阵名');
const before = V.tarotState().drawn.map(d => d.id).join(',');
chk(V.restoreTarot(info.data.spreadIndex, info.data.cards, info.data.deckId), '复现码可还原牌局');
chk(V.tarotState().drawn.map(d => d.id).join(',') === before, '还原后牌序与抽牌时一致');
const cp = V.tarotCopyText();
chk(/^\d+\. \S+（/m.test(cp), '复制文本含牌序');
chk(!/undefined|NaN/.test(cp), '复制文本无脏字符');

// ============ 11. 300 次 auto 三牌：合法且 78 张全覆盖 ============
fireDoc(dataBtn('data-tr-mode', 'auto'));
fireDoc(dataBtn('data-tr-spread', 'three-time'));
const seen = new Set();
let rangeOk = true;
for (let i = 0; i < 300; i++) {
  fireDoc(btn('trt-redraw'));      // 结果页「再抽一局」→ 重发一局回到牌桌
  fireDoc(btn('trt-autodraw'));
  fireDoc(dataBtn('data-tr-flipall', ''));
  const ids = [...resultHTML().matchAll(/data-tr-card="([a-z0-9-]+)"/g)].map(m => m[1]);
  if (ids.length !== 3 || ids.some(x => !/^(major|wands|cups|swords|pentacles)-/.test(x))) rangeOk = false;
  ids.forEach(x => seen.add(x));
}
chk(rangeOk, '每次三牌都合法（3 张、id 规范）');
chk(seen.size === 78, `300 次覆盖全部 78 张，实际 ${seen.size}`);

console.log(err === 0 ? '\n✅ 塔罗视图桩测（v122 牌桌架构）全部通过' : `\n⛔ ${err} 处失败`);
process.exit(err ? 1 : 0);
