/* 前端冒烟：用真实 index.html 结构搭 DOM 桩，加载 main.js 后逐个点按钮，
   捕获任何运行时异常。这是抓「点一下就白屏」类 bug 的最低成本手段。 */
import fs from 'node:fs';
import { webcrypto } from 'node:crypto';

const VOID = new Set(['area','base','br','col','embed','hr','img','input','link','meta','param','source','track','wbr']);
const SELF = new Set(['input','img','br','hr','meta','link']);

/* ---------- 极简 HTML 片段解析（够用即可） ---------- */
function parseFragment(html, parent) {
  const out = [];
  const re = /<(\/?)([a-zA-Z][\w-]*)((?:\s+[^<>]*?)?)(\/?)>/g;
  const stack = [out];
  let m;
  while ((m = re.exec(html))) {
    const [, close, tag, attrs, selfClose] = m;
    const t = tag.toLowerCase();
    if (close) {
      if (stack.length > 1) stack.pop();
      continue;
    }
    const el = new El(t, parseAttrs(attrs), parent);
    stack[stack.length - 1].push(el);
    if (!VOID.has(t) && !selfClose) stack.push(el.children);
  }
  return out;
}
function parseAttrs(s) {
  const a = {};
  const re = /([a-zA-Z_:][\w:.-]*)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'=<>`]+)))?/g;
  let m;
  while ((m = re.exec(s))) a[m[1].toLowerCase()] = m[2] ?? m[3] ?? m[4] ?? '';
  return a;
}

/* ---------- 元素 ---------- */
class El {
  constructor(tag, attrs = {}, parent = null) {
    this.tagName = tag.toUpperCase();
    this.attrs = attrs;
    this.parentNode = parent;
    this.children = [];
    this.id = attrs.id || '';
    this._classes = new Set((attrs.class || '').split(/\s+/).filter(Boolean));
    this.dataset = {};
    for (const [k, v] of Object.entries(attrs)) {
      if (k.startsWith('data-')) this.dataset[k.slice(5).replace(/-([a-z])/g, (_, c) => c.toUpperCase())] = v;
    }
    this.style = {};
    this.value = attrs.value || '';
    this.checked = false;
    this.disabled = false;
    this._text = '';
    this._listeners = {};
    this._dom = null;
    const self = this;
    this.classList = {
      add: (...c) => c.forEach((x) => self._classes.add(x)),
      remove: (...c) => c.forEach((x) => self._classes.delete(x)),
      contains: (c) => self._classes.has(c),
      toggle: (c, force) => {
        const want = force === undefined ? !self._classes.has(c) : !!force;
        if (want) self._classes.add(c); else self._classes.delete(c);
        return want;
      },
    };
  }
  get className() { return [...this._classes].join(' '); }
  set className(v) { this._classes = new Set(String(v).split(/\s+/).filter(Boolean)); }
  get innerHTML() { return this._html || ''; }
  set innerHTML(v) {
    this._html = String(v ?? '');
    this.children = parseFragment(this._html, this);
  }
  get textContent() { return this._text || (this.children.length ? this.children.map((c) => c.textContent).join('') : ''); }
  set textContent(v) { this._text = String(v ?? ''); this.children = []; }
  addEventListener(t, fn) { (this._listeners[t] = this._listeners[t] || []).push(fn); }
  removeEventListener(t, fn) { this._listeners[t] = (this._listeners[t] || []).filter((f) => f !== fn); }
  dispatch(type, ev = {}) {
    const e = { type, target: this, currentTarget: this, preventDefault() {}, stopPropagation() {}, ...ev };
    for (const fn of this._listeners[type] || []) fn(e);
    // 冒泡
    let p = this.parentNode;
    while (p) {
      for (const fn of p._listeners[type] || []) fn({ ...e, currentTarget: p });
      p = p.parentNode;
    }
    return e;
  }
  _all(acc = []) { acc.push(this); for (const c of this.children) c._all(acc); return acc; }
  _match(sel) {
    sel = sel.trim();
    if (sel.startsWith('#')) return this.id === sel.slice(1);
    if (sel.startsWith('.')) return this._classes.has(sel.slice(1));
    const am = sel.match(/^\[([\w-]+)(?:=["']?([^"'\]]*)["']?)?\]$/);
    if (am) {
      const key = am[1].replace(/-([a-z])/g, (_, c) => c.toUpperCase());
      if (am[2] === undefined) return key in this.dataset || key in this.attrs;
      return (this.dataset[key] ?? this.attrs[am[1]]) === am[2];
    }
    const tm = sel.match(/^([a-zA-Z][\w-]*)(?:#([\w-]+))?(?:\.([\w-]+))?$/);
    if (tm) {
      if (tm[1].toLowerCase() !== this.tagName.toLowerCase()) return false;
      if (tm[2] && this.id !== tm[2]) return false;
      if (tm[3] && !this._classes.has(tm[3])) return false;
      return true;
    }
    return false;
  }
  querySelectorAll(sel) {
    const parts = sel.trim().split(/\s+/);
    const last = parts[parts.length - 1];
    return this._all().slice(1).filter((e) => e._match(last));
  }
  querySelector(sel) { return this.querySelectorAll(sel)[0] || null; }
  closest(sel) { let n = this; while (n) { if (n._match && n._match(sel)) return n; n = n.parentNode; } return null; }
  appendChild(c) { c.parentNode = this; this.children.push(c); return c; }
  removeChild(c) { this.children = this.children.filter((x) => x !== c); return c; }
  remove() { if (this.parentNode) this.parentNode.removeChild(this); }
  setAttribute(k, v) { this.attrs[k] = String(v); if (k === 'id') this.id = String(v); if (k === 'class') this.className = v; }
  getAttribute(k) { return this.attrs[k] ?? null; }
  hasAttribute(k) { return k in this.attrs; }
  focus() {}
  click() { this.dispatch('click'); }
  getBoundingClientRect() { return { left: 0, top: 0, width: 100, height: 100, right: 100, bottom: 100 }; }
}

/* ---------- document ---------- */
const tree = JSON.parse(fs.readFileSync('/tmp/dom.json', 'utf8'));
function build(node, parent) {
  const el = new El(node.tag, node.attrs || {}, parent);
  el._text = node.text || '';
  for (const c of node.children || []) el.children.push(build(c, el));
  return el;
}
const documentEl = build(tree, null);
documentEl.children = (tree.children || []).map((c) => build(c, documentEl));
documentEl.tagName = '#DOCUMENT';

const document = {
  documentElement: documentEl,
  body: documentEl.querySelector('body') || documentEl,
  head: documentEl.querySelector('head') || documentEl,
  querySelector: (s) => documentEl.querySelector(s),
  querySelectorAll: (s) => documentEl.querySelectorAll(s),
  getElementById: (id) => documentEl.querySelector('#' + id),
  createElement: (t) => new El(t),
  createElementNS: (ns, t) => new El(t),
  addEventListener: () => {},
  removeEventListener: () => {},
  cookie: '',
  hidden: false,
  visibilityState: 'visible',
};
// Node 22 里 navigator/crypto 等是只读 getter，统一用 defineProperty 覆盖
function def(k, v) { Object.defineProperty(globalThis, k, { value: v, writable: true, configurable: true }); }
def('document', document);
def('window', globalThis);
def('navigator', { userAgent: 'node-smoke', language: 'zh-CN', serviceWorker: { addEventListener() {}, register: () => Promise.resolve({}) } });
def('location', { href: 'https://x/index.html', hash: '', reload() {}, search: '' });
def('crypto', webcrypto);
def('confirm', () => true);
def('alert', () => {});
def('requestAnimationFrame', (fn) => setTimeout(fn, 0));
def('cancelAnimationFrame', () => {});
def('matchMedia', () => ({ matches: false, addEventListener() {}, addListener() {} }));
def('getComputedStyle', () => ({ getPropertyValue: () => '' }));
def('devicePixelRatio', 2);
def('innerWidth', 390);
def('innerHeight', 844);
def('scrollTo', () => {});
def('addEventListener', () => {});
def('removeEventListener', () => {});
def('HTMLCanvasElement', class {});
def('Image', class { constructor() { this.onload = null; } set src(v) {} });
def('setInterval', () => 0); // 不让定时器挂住进程
def('clearInterval', () => {});

const store = new Map();
globalThis.localStorage = {
  getItem: (k) => (store.has(k) ? store.get(k) : null),
  setItem: (k, v) => store.set(k, String(v)),
  removeItem: (k) => store.delete(k),
  clear: () => store.clear(),
  key: (i) => [...store.keys()][i] ?? null,
  get length() { return store.size; },
};

/* ---------- 冒烟 ---------- */
const errors = [];
const steps = [];
function step(name, fn) {
  try { fn(); steps.push(['✓', name]); }
  catch (e) { steps.push(['✗', name + ' → ' + (e && e.message)]); errors.push([name, e]); }
}

// 必须 await：bind() 在模块顶层执行，不等它完成后续点击全是空转
try {
  await import('/tmp/smoke/js/main.js');
  steps.push(['✓', 'import main.js（bind/updateHome/时间条同步）']);
} catch (e) {
  steps.push(['✗', 'import main.js → ' + (e && e.message)]);
  errors.push(['import main.js', e]);
  console.log('\n--- import 失败栈 ---\n' + (e && e.stack));
  process.exit(1);
}

const $ = (s) => document.querySelector(s);
const $$ = (s) => document.querySelectorAll(s);

// 底部 tab
for (const t of $$('.tabbar .tab')) step(`点击 tab ${t.dataset.view}`, () => t.dispatch('click'));

// 七个盘的入口（openSubview → 渲染 → 自动留档）
for (const b of $$('.quick-btn')) step(`打开盘面 ${b.dataset.open}`, () => b.dispatch('click'));

// 首页按钮
step('首页「看此卦完整排盘」', () => $('#btn-cast-now').dispatch('click'));
step('排盘页返回', () => $('#pan-back').dispatch('click'));

// 码面板
step('排盘页「码」按钮', () => $('#btn-code-pan').dispatch('click'));
step('复制本盘码', () => $('#cs-copy').dispatch('click'));
step('星标当前盘', () => $('#cs-pin').dispatch('click'));
for (const b of $$('.code-btn')) step(`盘面「码」按钮 ${b.dataset.code}`, () => b.dispatch('click'));
step('关闭码面板', () => $('#cs-close').dispatch('click'));
step('遮罩关闭码面板', () => $('#cs-mask').dispatch('click'));

// 时间条：每个盘 默认/此刻 + 排盘
for (const bar of $$('.time-bar')) {
  const name = bar.id.replace('tb-', '');
  step(`时间条 ${name} 重置`, () => bar.querySelector('[data-act="reset"]').dispatch('click'));
  step(`时间条 ${name} 排盘`, () => {
    const inp = bar.querySelector('.tb-input');
    inp.value = '1990-05-20T08:30';
    bar.querySelector('[data-act="go"]').dispatch('click');
  });
  step(`时间条 ${name} 非法输入`, () => {
    const inp = bar.querySelector('.tb-input');
    inp.value = '不是时间';
    bar.querySelector('[data-act="go"]').dispatch('click');
  });
}

// 案例库
step('切到案例页', () => $$('.tabbar .tab').find((t) => t.dataset.view === 'history').dispatch('click'));
const stat = $('#case-stat').textContent;
const items = $$('.h-item');
console.log(`  案例页渲染：${items.length} 条 · 统计「${stat}」`);
step('案例页有内容（自动留档生效）', () => { if (!items.length) throw new Error('案例列表为空'); });
if (items.length) {
  step('点案例卡片复现', () => items[0].dispatch('click'));
  step('案例星标切换', () => { items[0].querySelector('[data-act="pin"]').dispatch('click'); });
  step('案例复制码', () => { items[0].querySelector('[data-act="code"]').dispatch('click'); });
  step('案例筛选条', () => { const c = $$('.cf-chip')[1]; if (c) c.dispatch('click'); });
}
step('清未星标', () => $('#case-clear').dispatch('click'));

// 粘贴码复现（用刚生成的码，覆盖 8 类）
const sharecode = await import('/tmp/smoke/js/sharecode.js');
const codeCases = [
  ['liuyao', { at: Date.now(), source: 'coins', yaoValues: [7, 8, 9, 7, 8, 6], question: '冒烟测试' }],
  ['meihua', { at: Date.now() }],
  ['qimen', { at: Date.now() }],
  ['bazi', { at: 706000000000, gender: '男' }],
  ['astro', { at: 706000000000, gender: '男', lon: 123.43, lat: 41.81 }],
  ['ziwei', { at: 706000000000, gender: '男' }],
  ['sky', { at: Date.now() }],
  ['cards', { at: Date.now(), spreadIndex: 0, cards: [{ index: 0, reversed: false }, { index: 5, reversed: true }, { index: 9, reversed: false }] }],
];
for (const [kind, data] of codeCases) {
  const c = sharecode.encodeCode(kind, data);
  step(`粘贴 ${kind} 码复现（${c.length} 字符）`, () => {
    $('#cs-input').value = c;
    $('#cs-open').dispatch('click');
  });
}
step('粘贴非法码', () => { $('#cs-input').value = 'QT1-!!!'; $('#cs-open').dispatch('click'); });
step('粘贴中文乱码', () => { $('#cs-input').value = '这不是码'; $('#cs-open').dispatch('click'); });
step('粘贴空码', () => { $('#cs-input').value = ''; $('#cs-open').dispatch('click'); });

// 性别 / 开关 / 复制
step('切换性别 女', () => $('#gender-female').dispatch('click'));
step('切换性别 男', () => $('#gender-male').dispatch('click'));
step('切换神煞', () => $('#toggle-shensha').dispatch('click'));
step('切换藏爻', () => $('#toggle-cangyao').dispatch('click'));
step('复制本盘', () => $('#btn-copy').dispatch('click'));
step('星标留存按钮', () => $('#btn-pin').dispatch('click'));
step('查看案例按钮', () => $('#btn-goto-cases').dispatch('click'));
step('所问输入', () => { $('#question-input').value = '冒烟问句'; $('#question-input').dispatch('input', { target: $('#question-input') }); });

// 各页复制按钮
for (const id of ['copy-home','copy-bazi','copy-meihua','copy-qimen','copy-astro','copy-ziwei','copy-cards','copy-sky']) {
  const el = document.getElementById(id);
  if (el) step(`复制按钮 ${id}`, () => el.dispatch('click'));
}

/* ---------- 语义断言：不只看不报错，还要结果对 ---------- */
const state = await import('/tmp/smoke/js/state.js');
const casesMod = await import('/tmp/smoke/js/cases.js');
const core = await import('/tmp/smoke/vendor/liuyao-core.js');
const sem = [];
const A = (name, cond, extra = '') => sem.push([cond ? '✓' : '✗', cond ? name : `${name} → ${extra}`]);

// 1) 六爻码复现结果必须与直接排盘逐字段一致
{
  const yao = [7, 8, 9, 7, 8, 6];
  const at = new Date(2026, 9, 21, 10, 30).getTime();
  $('#cs-input').value = sharecode.encodeCode('liuyao', { at, source: 'coins', yaoValues: yao, question: '换工作' });
  $('#cs-open').dispatch('click');
  const got = state.current.pan;
  const want = core.paipan({ yaoValues: yao, year: 2026, month: 10, day: 21, hour: 10, minute: 30, gender: '男', question: '换工作' });
  A('六爻码复现：本卦一致', got && got.benGua.name === want.benGua.name, `${got && got.benGua.name} vs ${want.benGua.name}`);
  A('六爻码复现：变卦一致', got && got.bianGua.name === want.bianGua.name);
  A('六爻码复现：动爻一致', got && JSON.stringify(got.movingPositions) === JSON.stringify(want.movingPositions));
  A('六爻码复现：问句还原', got && got.question === '换工作', got && got.question);
  A('六爻码复现：来源标记', state.current.meta && state.current.meta.source === 'coins');
  A('六爻码复现：自动留档并绑定 caseId', !!state.current.caseId && !!casesMod.loadCase(state.current.caseId));
}

// 2) 时间条真的改到盘面（出生类）
{
  state.setPanAt('birth', new Date(1990, 4, 20, 8, 30));
  state.panAt.geo = null;
  const html = (await import('/tmp/smoke/js/baziview.js')).renderBazi();
  A('八字：改出生时间后盘面含新年份', html.includes('1990'), html.slice(0, 80));
  A('八字：默认时刻已被覆盖', state.birthDate().getFullYear() === 1990, String(state.birthDate().getFullYear()));
  state.resetPanAt('birth');
  A('八字：重置回默认出生时刻', state.birthDate().getFullYear() === 1994, String(state.birthDate().getFullYear()));
}

// 3) 时间条真的改到盘面（此刻类）
{
  const t = new Date(2027, 0, 1, 0, 20);
  state.setPanAt('now', t);
  const html = (await import('/tmp/smoke/js/meihuaview.js')).renderMeiHua();
  A('梅花：改起盘时间后盘面变化', typeof html === 'string' && html.length > 200);
  A('梅花：nowDate 生效', state.nowDate().getTime() === t.getTime());
  const c1 = (await import('/tmp/smoke/js/meihuaview.js')).meiHuaCode();
  state.setPanAt('now', new Date(2027, 0, 1, 0, 20));
  const c2 = (await import('/tmp/smoke/js/meihuaview.js')).meiHuaCode();
  A('梅花：同一时刻重复排盘得到同一码（可复现）', sharecode.encodeCode('meihua', c1.data) === sharecode.encodeCode('meihua', c2.data));
  state.resetPanAt('now');
}

// 4) 星标与顶掉：星标案例不被清掉
{
  localStorage.clear();
  for (let i = 0; i < 40; i++) casesMod.saveCase({ kind: 'meihua', code: sharecode.encodeCode('meihua', { at: 1700000000000 + i * 1000 }), title: `T${i}`, castAt: i });
  const before = casesMod.loadCases();
  A('自动留档：40 条后只留 30 条', before.length === 30, String(before.length));
  const pinId = before[0].id;
  casesMod.togglePin(pinId);
  for (let i = 40; i < 80; i++) casesMod.saveCase({ kind: 'meihua', code: sharecode.encodeCode('meihua', { at: 1700000000000 + i * 1000 }), title: `T${i}`, castAt: i });
  const after = casesMod.loadCases();
  A('星标案例始终保留', after.some((c) => c.id === pinId));
  A('总数 = 星标 + 30', after.length === 31, String(after.length));
  const n = casesMod.clearUnpinned();
  A('清未星标后只剩星标', casesMod.loadCases().length === 1 && n === 30, `${n} / ${casesMod.loadCases().length}`);
  localStorage.clear();
}

// 5) 码面板的码与各盘渲染同源
{
  for (const [kind, mod, fn] of [
    ['bazi', 'baziview.js', 'baziCode'],
    ['meihua', 'meihuaview.js', 'meiHuaCode'],
    ['qimen', 'qimenview.js', 'qiMenCode'],
    ['astro', 'astroview.js', 'astroCode'],
    ['ziwei', 'ziweiview.js', 'ziweiCode'],
    ['sky', 'skyview.js', 'skyCode'],
  ]) {
    const info = (await import(`/tmp/smoke/js/${mod}`))[fn]();
    A(`码数据可用：${kind}`, !!info && info.kind === kind, JSON.stringify(info && info.kind));
    if (info) {
      const back = sharecode.decodeCode(sharecode.encodeCode(info.kind, info.data));
      A(`码往返一致：${kind}`, back.kind === kind && back.at === info.data.at);
    }
  }
}

// 6) 同码重复复现不重复入库；复现后再次生成码必须与原码一致
{
  localStorage.clear();
  const yao = [7, 7, 8, 8, 9, 6];
  const at = new Date(2026, 9, 21, 14, 5).getTime();
  const code = sharecode.encodeCode('liuyao', { at, source: 'tianji', yaoValues: yao, question: '' });
  $('#cs-input').value = code;
  $('#cs-open').dispatch('click');
  const id1 = state.current.caseId;
  const pan1 = state.current.pan.benGua.name;
  $('#cs-input').value = code;
  $('#cs-open').dispatch('click');
  A('同码重复复现不新增案例', casesMod.loadCases().length === 1, String(casesMod.loadCases().length));
  A('同码重复复现复用同一 caseId', state.current.caseId === id1);
  A('复现后 meta 完整（yaoValues）', JSON.stringify(state.current.meta.yaoValues) === JSON.stringify(yao));
  A('复现后盘面稳定', state.current.pan.benGua.name === pan1);
  $('#btn-code-pan').dispatch('click');
  A('复现后再次生成码 = 原码（闭环）', $('#cs-cur').textContent === code, `${$('#cs-cur').textContent} vs ${code}`);
  localStorage.clear();
}

console.log('\n--- 语义断言明细 ---');
for (const [m, n] of sem) if (m === '✗') console.log(`  ${m} ${n}`);
const semFail = sem.filter(([m]) => m === '✗').length;
console.log(`语义断言 ${sem.length} 项：通过 ${sem.length - semFail}，失败 ${semFail}`);
steps.push(...sem);

console.log('\n--- 冒烟明细 ---');
const failed = steps.filter(([s]) => s === '✗');
for (const [s, n] of steps) if (s === '✗') console.log(`  ${s} ${n}`);
console.log(`\n共 ${steps.length} 步：通过 ${steps.length - failed.length}，失败 ${failed.length}`);
if (failed.length) {
  console.log('\n--- 首个异常栈 ---');
  console.log(failed[0] && errors[0] && errors[0][1] && errors[0][1].stack);
}
process.exit(failed.length ? 1 : 0);
