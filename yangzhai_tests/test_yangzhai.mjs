// 阳宅视图桩测：桩 state.js + 极简 DOM，走完全部 5 步并断言结果
import { pathToFileURL } from 'node:url';
import path from 'node:path';

const APP = process.argv[2] || path.resolve('.');
const STATE_STUB = pathToFileURL(path.join(APP, 'yz_test/state-stub.mjs')).href;

class El {
  constructor(id, tag = 'div') {
    this.id = id || ''; this.tagName = tag.toUpperCase();
    this._innerHTML = ''; this.textContent = ''; this.value = '';
    this.disabled = false; this.checked = false;
    this.style = {}; this.dataset = {};
    this.classList = makeClassList(this);
    this._listeners = {};
    this.children = [];
  }
  get innerHTML() { return this._innerHTML; }
  set innerHTML(v) {
    this._innerHTML = v == null ? '' : String(v);
    this._gen = (this._gen || 0) + 1;
    // 容器整体替换：旧子树标记失效（浏览器里旧节点已脱离文档）
    (this._nodes || []).forEach((n) => { n._dead = true; });
    parseHTML(this, this._innerHTML);
  }
  addEventListener(type, fn) { (this._listeners[type] ||= []).push(fn); }
  dispatch(ev) { (this._listeners[ev.type] || []).forEach((fn) => fn(ev)); }
  fire(type, target) { this.dispatch({ type, target }); }
  // 容器级委托：在 root 上根据选择器找元素
  querySelector(sel) { return findOne(this, sel); }
  querySelectorAll(sel) { return findAll(this, sel); }
  set className(v) { String(v || '').split(/\s+/).forEach((c) => c && this.classList.add(c)); }
  get className() { return [...this.classList._set].join(' '); }
  remove() { this._dead = true; if (this._host) this._host._nodes = (this._host._nodes || []).filter((n) => n !== this); }
  appendChild(n) { (this._nodes = this._nodes || []).push(n); n._host = this; return n; }
  closest(sel) {
    const ok = !sel || sel.split(',').map((s) => s.trim()).some((s) => matchNode(this, s));
    if (ok) return this;
    if (this._host && this._host.closest) return this._host.closest(sel);
    return null;
  }
  contains() { return false; }
  scrollIntoView() {}
}

function makeClassList(el) {
  const set = new Set();
  return {
    add: (c) => set.add(c),
    remove: (c) => set.delete(c),
    toggle: (c, force) => { const on = force === undefined ? !set.has(c) : !!force; on ? set.add(c) : set.delete(c); return on; },
    contains: (c) => set.has(c),
    _set: set,
  };
}

// 极简 HTML 解析：记录标签/id/data-*/class，供测试点击与断言（不追求完整 DOM）
function collectNodes(node, out) {
  (node._nodes || []).forEach((n) => { if (!n._dead) { out.push(n); collectNodes(n, out); } });
}
function allNodes(host) { const out = []; collectNodes(host, out); return out; }
function parseHTML(host, html) {
  const nodes = [];
  const re = /<(button|input|select|label|div|details|summary|span|p|b|h2|h4)\b([^>]*?)(\/?)>/g;
  let m;
  while ((m = re.exec(html))) {
    const tag = m[1]; const attrs = m[2];
    const node = new El('', tag);
    const idm = attrs.match(/\bid="([^"]+)"/); if (idm) node.id = idm[1];
    const dm = attrs.match(/\bdata-([a-z-]+)="([^"]*)"/g);
    if (dm) dm.forEach((p) => { const mm = p.match(/data-([a-z-]+)="([^"]*)"/); node.dataset[camel(mm[1])] = mm[2]; });
    const cm = attrs.match(/\bclass="([^"]+)"/); if (cm) cm[1].split(/\s+/).forEach((c) => c && node.classList.add(c));
    const vm = attrs.match(/\bvalue="([^"]*)"/); if (vm) node.value = vm[1];
    if (/checked/.test(attrs)) node.checked = true;
    node._host = host;
    node.closest = (sel) => {
      const ok = sel.split(',').map((s) => s.trim()).some((s) => matchNode(node, s));
      return ok ? node : null;
    };
    if (node.id) {
      // 模拟浏览器：display:none 容器内的元素不作为当前命中目标（panel 每次整体替换）
      const hidden = /display:\s*none/.test(attrs);
      if (!(hidden && (node.tagName === 'DIV' || node.tagName === 'INPUT'))) live.set(node.id, node);
    }
    nodes.push(node);
  }
  host._nodes = nodes;
  return nodes;
}
function camel(s) { return s.replace(/-([a-z])/g, (_, c) => c.toUpperCase()); }
function matchNode(n, sel) {
  if (!sel) return false;
  if (sel.startsWith('#')) return n.id && n.id === sel.slice(1);
  if (sel.startsWith('[')) {
    const m = sel.match(/^\[data-([a-z-]+)\]$/);
    if (m) return n.dataset[camel(m[1])] != null;
    return false;
  }
  if (sel.startsWith('.')) return sel.split('.').filter(Boolean).every((c) => n.classList.contains(c));
  return n.tagName === sel.toUpperCase();
}
function findOne(host, sel) {
  if (host.id && matchNode(host, sel)) return host;
  return allNodes(host).find((n) => matchNode(n, sel)) || null;
}
function findAll(host, sel) {
  const out = [];
  if (host.id && matchNode(host, sel)) out.push(host);
  allNodes(host).forEach((n) => { if (matchNode(n, sel)) out.push(n); });
  return out;
}

// ---- 全局桩 ----
const root = new El('yangzhai-body');
const bodyEl = new El('body');
// live 槽：按 id 始终指向"最新一次被赋 innerHTML 的容器"，模拟浏览器里同一个元素被复用
const live = new Map();
const origSet = Object.getOwnPropertyDescriptor(El.prototype, 'innerHTML').set;
function byId(id) {
  if (id === 'yangzhai-body') return root;
  const lv = live.get(id);
  if (lv && !lv._dead) return lv;
  // 深搜：root 直接子树 + 每个容器（如 #yz-panel）的嵌套子树
  const deep = (n) => {
    for (const c of (n._nodes || [])) {
      if (c._dead) continue;
      if (c.id === id) return c;
      const hit = deep(c);
      if (hit) return hit;
    }
    return null;
  };
  return deep(root);
}
globalThis.document = {
  body: bodyEl,
  createElement: (tag) => new El('', tag),
  getElementById: byId,
  querySelector: (s) => findOne(root, s),
  querySelectorAll: (s) => findAll(root, s),
  addEventListener() {},
};
globalThis.window = {
  isSecureContext: false,
  addEventListener() {}, scrollTo() {},
};

// 点击：事件从目标冒泡到 root（视图在 root 上委托）
function click(node) {
  const ev = { type: 'click', target: node };
  root.dispatch(ev);
}
function clickById(id) {
  const n = byId(id);
  if (!n) throw new Error('找不到按钮 #' + id);
  click(n); return n;
}
// 重新解析当前 DOM 树，避免点击重渲染后拿到旧节点
function liveNodeByData(key, val) {
  return allNodes(root).find((x) => x.dataset[key] != null && (val === undefined || x.dataset[key] === String(val)));
}
function clickByData(key, val) {
  const n = liveNodeByData(key, val);
  if (!n) throw new Error(`找不到 data-${key}=${val}`);
  click(n); return n;
}
// 选九宫格：先选功能（会重渲染），再在新树里点格子
function pickRoom(kind, ix) {
  clickByData('func', kind);
  const cell = allNodes(root).find((x) => x.classList.contains('yz-cell') && x.dataset.ix === String(ix));
  if (!cell) throw new Error(`找不到九宫格 ix=${ix}`);
  click(cell);
}
function setInput(id, value) {
  const n = byId(id); n.value = value;
  root.dispatch({ type: 'input', target: n });
}
function setSelect(id, value) {
  const n = byId(id); n.value = value;
  root.dispatch({ type: 'change', target: n });
}
function checkShape(name) {
  const n = allNodes(root).find((x) => x.tagName === 'INPUT' && x.dataset.shape === name);
  n.checked = true;
  root.dispatch({ type: 'change', target: n });
}

// ---- loader 注入 state 桩 ----
const { register } = await import('./loader-hooks.mjs');
register((spec) => {
  if (spec.includes('/state.js')) return STATE_STUB;
  return null;
});

const mod = await import(pathToFileURL(path.join(APP, 'js/yangzhai/yangzhaiview.js')).href);
root.innerHTML = mod.renderYangzhai();
mod.initYangzhai();
const assert = (c, msg) => { if (!c) { console.error('❌', msg); process.exitCode = 1; } else console.log('✔', msg); };

const html = () => {
  // 只取当前活动面板：从根骨架里找到 id=yz-panel 的容器，读它当前 innerHTML；
  // 找不到（重测回到 step1 前的瞬态）则退化为根骨架
  const panel = byId('yz-panel');
  return panel ? (panel._innerHTML || '') : (root._innerHTML || '');
};
const dirty = ['undefined', 'NaN', '[object Object]', 'null分'];

// Step1: 选 8 方位"南"(data-deg=180)，next 应可点
clickByData('deg', 180);
assert(/朝<b>南/.test(html()), 'step1 锁定朝向=南');
assert(/坐<b>北/.test(html()), 'step1 坐山=北');
clickById('yz-next');

// Step2: 标 门8(东南) 主5(东) 灶0(西北)
pickRoom('door', 8);
pickRoom('master', 5);
pickRoom('kitchen', 0);
// 点空白处结束"正在标"态不是必须；直接看下一步按钮是否启用 + 九宫出现门/主/灶 chip
assert(byId('yz-next').disabled === false, 'step2 填齐门主卧厨房后 下一步启用');
assert(/yz-chip yz-door/.test(html()) && /yz-chip yz-master/.test(html()) && /yz-chip yz-kitchen/.test(html()), 'step2 九宫出现大门/主卧/厨房标记');
// 再点一次当前功能键，结束"正在标"态，让提示回到"已齐"
clickByData('func', 'kitchen');
assert(/门 \/ 主卧 \/ 厨房已齐/.test(html()), 'step2 提示已齐');

// 拼豆模式：直接点中宫 → 弹选单 → 放客厅 → 中宫实时显示（修复旧bug：中宫不显示）
{
  const cell4 = allNodes(root).find((x) => x.classList.contains('yz-cell') && x.dataset.ix === '4');
  click(cell4);
  let sheet = (bodyEl._nodes || []).find((n) => n.classList.contains('yz-sheet-mask'));
  assert(!!sheet, '点中宫弹出拼豆选单');
  const living = allNodes(sheet).find((n) => n.dataset.sk === 'living');
  sheet.dispatch({ type: 'click', target: living });
  const chips4 = byId('yz-chips-4');
  assert(chips4 && /客厅/.test(chips4.innerHTML) && /yz-chip yz-living/.test(chips4.innerHTML), '中宫客厅chip实时显示（bug已修）');
  sheet = (bodyEl._nodes || []).find((n) => n.classList.contains('yz-sheet-mask'));
  sheet.dispatch({ type: 'click', target: sheet });
  assert(!(bodyEl._nodes || []).some((n) => n.classList.contains('yz-sheet-mask')), '点遮罩关闭选单');
  assert(/yz-chip yz-living/.test(html()), '中宫客厅在九宫保持显示');
}
clickById('yz-next');

// Step3: 居住者（state 桩默认已给 1994 男）。命卦提示由 renderMingHint 动态写入，
// 这里直接用同一引擎断言命卦，避免极简 DOM 桩不解析动态 innerHTML 的局限。
const lg3 = (await import(pathToFileURL(path.join(APP, 'vendor/bazhai-core.js')).href)).lifeGua(1994, 'male');
assert(lg3.name === '乾' && lg3.group === 'west', `step3 1994男命卦=${lg3.name}/${lg3.group}（应 乾/西四）`);
const mingBox = byId('yz-ming');
assert(mingBox && mingBox.classList.contains('yz-okbox'), 'step3 命卦提示容器 yz-ming 存在');
clickById('yz-next');

// Step4: 勾一个凶形势 路冲
checkShape('路冲');
const nextBtn = clickById('yz-next'); // 文案"看结果"→进 step5

// Step5 结果
const h = html();
assert(/yz-score-num/.test(h), 'step5 出分数卡');
const scoreM = h.match(/yz-score-num">(\d+)<span>分/);
assert(scoreM && +scoreM[1] >= 0 && +scoreM[1] <= 100, 'step5 分数在0-100：' + (scoreM && scoreM[1]));
assert(/生气|延年|天医|伏位/.test(h), 'step5 含四吉星');
assert(/绝命|五鬼|六煞|祸害/.test(h), 'step5 含四凶星');
assert(/坎宅/.test(h), 'step5 标 坎宅（坐北朝南）');
assert(/路冲/.test(h), 'step5 含门外形势·路冲');
assert(/依据：/.test(h), '结论挂典籍依据');
assert(/八宅明镜|阳宅三要/.test(h), '依据含《八宅明镜》《阳宅三要》');

// 脏值扫描
const found = dirty.filter((d) => h.includes(d));
assert(found.length === 0, '结果页无脏值 ' + (found.join(',') || '✔'));

// 复制文本
const txt = mod.yangzhaiCopyText();
assert(/钦天监·阳宅直断/.test(txt) && /坎宅/.test(txt) && !txt.includes('undefined'), '复制文本正常无 undefined');

// 重新测一套
clickById('yz-restart');
assert(/yz-sel8/.test(html()) && !/yz-score-num/.test(html()), '重新测一套回到 step1 且清空结果');

console.log(process.exitCode ? '\n[FAIL]' : '\n[PASS] 阳宅视图全流程通过');
