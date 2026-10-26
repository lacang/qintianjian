// v92：RWS 真图版塔罗视图桩
import { readFileSync, writeFileSync, mkdirSync, copyFileSync } from 'fs';
const APP = '/Coze/Drive/编程专家/每日六爻/app/';
const TMP = '/tmp/tarot92/app/';
mkdirSync(TMP + 'js', { recursive: true });
mkdirSync(TMP + 'vendor', { recursive: true });
writeFileSync(TMP + 'js/state.js', `export const $=(s,r)=>{const d=r||globalThis.document;if(!d)return null;return d.getElementById(String(s).replace(/^#/,''));};export const escapeHtml=s=>String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');export const toast=()=>{};`);
// 真 vendor bundle
copyFileSync(APP + 'vendor/liuyao-core.js', TMP + 'vendor/liuyao-core.js');
const strip = f => readFileSync(APP + f, 'utf8').replace(/\.js\?v=\d+/g, '.js');
writeFileSync(TMP + 'js/tarotval_rws.js', strip('js/tarotval_rws.js'));
writeFileSync(TMP + 'js/tarotview.js', strip('js/tarotview.js'));

let err = 0;
const chk = (c, m) => { if (!c) { console.log('❌', m); err++; } else console.log('✓', m); };

class El {
  constructor() { this._cls = new Set(); this.attrs = {}; this._h = ''; this.children = []; this.value = ''; this.id = ''; this._ev = {}; }
  get classList() { const s = this._cls; return { add: (...c) => c.forEach(x => s.add(x)), remove: (...c) => c.forEach(x => s.delete(x)), toggle: x => s.has(x) ? s.delete(x) : s.add(x), contains: x => s.has(x) }; }
  set innerHTML(v) { this._h = v; } get innerHTML() { return this._h; }
  set textContent(v) { this._t = v; } get textContent() { return this._t || ''; }
  setAttribute(k, v) { this.attrs[k] = String(v); }
  getAttribute(k) { return this.attrs[k] ?? null; }
  appendChild(c) { this.children.push(c); if (c.id && globalThis.__byId) globalThis.__byId[c.id] = c; return c; }
  addEventListener(t, f) { (this._ev[t] = this._ev[t] || []).push(f); }
}
globalThis.__byId = {};
const byId = globalThis.__byId;
const docListeners = { click: [], input: [] };
const bodyEl = new El();
bodyEl.appendChild = function (c) { this.children.push(c); if (c.id) byId[c.id] = c; return c; };
globalThis.document = {
  createElement: () => new El(),
  getElementById: i => { if (i === 'tr-sheet' && !byId[i]) return null; return byId[i] || (byId[i] = new El()); },
  addEventListener: (t, f) => docListeners[t] && docListeners[t].push(f),
  body: bodyEl
};
globalThis.Math.random = (() => { let s = 7; return () => { s = (s * 1103515245 + 12345) & 0x7fffffff; return s / 0x7fffffff; }; })();

const V = await import('file://' + TMP + 'js/tarotview.js?x' + Date.now());
const doc = globalThis.document;
doc.getElementById('tarot-body').innerHTML = V.renderTarot();
const html = doc.getElementById('tarot-body').innerHTML;
chk(html.includes('韦特塔罗'), '标题 RWS');
chk(html.includes('Pamela Colman Smith'), '史实作者');
chk(html.includes('亲手抽牌'), '有亲手抽牌');
chk((html.match(/tr-galcard/g) || []).length === 78, '图鉴78张');
chk((html.match(/assets\/cards\//g) || []).length === 78, '78张全用真图路径');
chk(html.includes('tr-galgrp'), '图鉴分组（大牌+四花色）');
chk(!/undefined|NaN|\[object/.test(html), '无脏字符');

V.initTarot();
function click(attrs) {
  const tgt = { attrs, getAttribute(k) { if (k === 'id') return this.attrs.id ?? null; return k in this.attrs ? this.attrs[k] : this.attrs['data-' + k] ?? null; }, closest(sel) { if (sel.startsWith('#')) return this.attrs.id === sel.slice(1) ? this : null; const key = sel.replace(/[\[\]]/g, ''); return key in this.attrs ? this : null; } };
  docListeners.click.forEach(fn => fn({ target: tgt }));
}

// 日抽
click({ 'data-tr-spread': '1' }); click({ id: 'tr-draw' });
let res = doc.getElementById('tr-result').innerHTML;
chk((res.match(/<img class="tr-img"/g) || []).length === 1, '日抽1张真图');
chk(res.includes('tr-verdict'), '日抽方向卡');
chk(/assets\/cards\/.+\.jpg/.test(res), '结果含真图');

// 三牌
click({ 'data-tr-spread': '3' }); click({ id: 'tr-draw' });
res = doc.getElementById('tr-result').innerHTML;
chk((res.match(/<img class="tr-img"/g) || []).length === 3, '三牌3张真图');
chk(res.includes('tr-chain'), '三牌时间流');

// 凯尔特十字
click({ 'data-tr-spread': '10' }); click({ id: 'tr-draw' });
res = doc.getElementById('tr-result').innerHTML;
chk(res.includes('tr-c2'), '第二张横置');
chk((res.match(/<img class="tr-img"/g) || []).length === 10, '十字10张真图');
chk(res.includes('tr-zones'), '四切要位置');

// 弹层：死神真图 + scene + classicText
click({ 'data-tr-card': 'major-13-death' });
const sheet = doc.getElementById('tr-sheet');
chk(sheet && doc.body.children.some(c => c.id === 'tr-sheet'), '弹层挂 body');
chk(sheet.classList.contains('open'), '点牌开弹层');
chk(sheet.innerHTML.includes('tip-card'), '弹层用 tip-card');
chk(doc.getElementById('tr-body').innerHTML.includes('major-13-death.jpg'), '弹层死神真图');
chk(doc.getElementById('tr-body').innerHTML.includes('trf-kws'), '弹层关键词');
chk(doc.getElementById('tr-body').innerHTML.includes('Waite 1910'), '弹层原著判词层');
click({ 'data-tr-close': '' });
chk(!sheet.classList.contains('open'), '关弹层');
// 小牌也能开
click({ 'data-tr-card': 'swords-03' });
chk(doc.getElementById('tr-term').textContent.includes('宝剑三'), '小牌宝剑三弹层');
click({ 'data-tr-close': '' });

// 逆位关闭
click({ 'data-tr-spread': '3' });
click({ id: 'tr-revtoggle' });
click({ id: 'tr-draw' });
res = doc.getElementById('tr-result').innerHTML;
chk(!/class="tr-img[^"]*"[^>]*is-rev|tr-card tr-rev/.test(res) && !res.includes('tr-revtag'), '关逆位后无逆位');
click({ id: 'tr-revtoggle' });

// 亲手抽牌
click({ 'data-tr-mode': 'manual' });
click({ 'data-tr-spread': '3' });
click({ id: 'tr-draw' });
res = doc.getElementById('tr-result').innerHTML;
chk(res.includes('tr-deck'), '手动牌堆');
click({ 'data-tr-pick': '1' });
res = doc.getElementById('tr-result').innerHTML;
chk((res.match(/<img class="tr-img"/g) || []).length === 1, '抽1翻1真图');
chk(res.includes('余 77'), '牌堆余77');
click({ 'data-tr-fill': '1' });
res = doc.getElementById('tr-result').innerHTML;
chk((res.match(/<img class="tr-img"/g) || []).length === 3 && res.includes('tr-verdict'), '补齐3张+解读');

// 手动十字铺满10
click({ 'data-tr-spread': '10' }); click({ id: 'tr-draw' });
click({ 'data-tr-fill': '1' });
res = doc.getElementById('tr-result').innerHTML;
chk((res.match(/<img class="tr-img"/g) || []).length === 10 && res.includes('tr-zones'), '铺满10真图+解读');

// 复制
const cp = V.tarotCopyText();
chk(/凯尔特十字/.test(cp) && /^\d+\. \S+（/m.test(cp), '复制含牌阵与牌');
chk(!/undefined|NaN/.test(cp), '复制无脏字符');

// 300次三牌：合法且78张全覆盖
click({ 'data-tr-mode': 'auto' }); click({ 'data-tr-spread': '3' });
const seen = new Set(); let rangeOk = true;
for (let i = 0; i < 300; i++) {
  click({ id: 'tr-draw' });
  const ids = [...doc.getElementById('tr-result').innerHTML.matchAll(/data-tr-card="([a-z0-9-]+)"/g)].map(m => m[1]);
  if (ids.length !== 3 || ids.some(x => !/^(major|wands|cups|swords|pentacles)-/.test(x))) rangeOk = false;
  ids.forEach(x => seen.add(x));
}
chk(rangeOk, '每次三牌合法');
chk(seen.size === 78, `300次覆盖78张，实际${seen.size}`);

console.log(err === 0 ? '\n✅ RWS 塔罗视图桩测全部通过' : `\n⛔ ${err} 处失败`);
process.exit(err ? 1 : 0);
