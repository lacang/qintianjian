// 点读笔 + 解盘思路：全局「点哪解释哪」+ 每个盘顶部的引导块 + 分步导览
// 术语内容来自 glossary.js（通用术语）；元素对照含义来自 meaning.js（星曜/星座/宫位/相位/宫位…）。
import { GLOSSARY } from './glossary.js?v=120';
import { MEANING } from './meaning.js?v=120';
import { escapeHtml } from './state.js?v=120';

const ALL = Object.assign({}, GLOSSARY, MEANING);

let sheetEl = null, built = false;

function ensureSheet() {
  if (built) return;
  built = true;
  sheetEl = document.createElement('div');
  sheetEl.className = 'tip-sheet';
  sheetEl.innerHTML =
    '<div class="tip-mask" data-tip-close></div>' +
    '<div class="tip-card" role="dialog" aria-modal="true">' +
      '<div class="tip-head">' +
        '<span class="tip-kicker" id="tip-kicker">点读</span>' +
        '<span class="tip-term" id="tip-term"></span>' +
        '<button class="tip-x" type="button" data-tip-close aria-label="关闭">✕</button>' +
      '</div>' +
      '<div class="tip-body" id="tip-body"></div>' +
    '</div>';
  document.body.appendChild(sheetEl);
  sheetEl.addEventListener('click', (e) => {
    if (e.target.closest('[data-tip-close]')) { closeTip(); return; }
    const j = e.target.closest('[data-tip-jump]');
    if (j) openTip(j.getAttribute('data-tip-jump'));
  });
}

// key 支持组合：'pl-venus@sg-scorpio@pl-retro' -> 三层含义对照卡
export function openTip(key) {
  if (!key) return;
  ensureSheet();
  const termEl = sheetEl.querySelector('#tip-term');
  const bodyEl = sheetEl.querySelector('#tip-body');
  const kickEl = sheetEl.querySelector('#tip-kicker');

  if (key.indexOf('@') >= 0) {
    const segs = key.split('@').map((k) => ALL[k]).filter(Boolean);
    if (!segs.length) return;
    if (termEl) termEl.textContent = segs.map((s) => s.term).join(' · ');
    if (kickEl) kickEl.textContent = '对照';
    if (bodyEl) bodyEl.innerHTML = comboHTML(segs);
  } else {
    const g = ALL[key];
    if (!g) return;
    if (termEl) termEl.textContent = g.term;
    if (kickEl) kickEl.textContent = g.group || '点读';
    if (bodyEl) bodyEl.innerHTML = tipBodyHTML(g);
  }
  sheetEl.classList.add('open');
  const card = sheetEl.querySelector('.tip-card');
  if (card) card.scrollTop = 0;
}

export function closeTip() { if (sheetEl) sheetEl.classList.remove('open'); }

function relHTML(related) {
  const rel = (related || [])
    .map((k) => (ALL[k] ? '<button type="button" class="tip-rel" data-tip-jump="' + k + '">' + escapeHtml(ALL[k].term) + '</button>' : ''))
    .join('');
  return rel ? '<div class="tip-relwrap"><span>顺着点</span>' + rel + '</div>' : '';
}

// 一行「标签 + 值」，只在有值时才出现
function kv(label, val) {
  return val ? '<p class="tip-kv"><span>' + label + '</span>' + escapeHtml(val) + '</p>' : '';
}

function tipBodyHTML(g) {
  return (
    (g.brief ? '<p class="tip-brief">' + escapeHtml(g.brief) + '</p>' : '') +
    (g.detail ? '<p class="tip-detail">' + escapeHtml(g.detail) + '</p>' : '') +
    kv('性质', g.klass) +
    kv('对应身体', g.body) +
    kv('庙旺', g.rule) +
    kv('怎么用', g.use) +
    (g.quote ? '<blockquote class="tip-quote">' + escapeHtml(g.quote) + '</blockquote>' : '') +
    (g.src ? '<p class="tip-src"><span>出处</span>' + escapeHtml(g.src) + '</p>' : '') +
    relHTML(g.related)
  );
}

// 组合卡：把「星曜 + 星座 + 状态」三层含义摆在一起，让读者自己合起来看
function comboHTML(segs) {
  const blocks = segs.map((s) =>
    '<div class="tip-seg">' +
      '<div class="tip-seg-t">' + escapeHtml(s.term) + (s.group ? '<i>' + escapeHtml(s.group) + '</i>' : '') + '</div>' +
      (s.brief ? '<p class="tip-brief">' + escapeHtml(s.brief) + '</p>' : '') +
      (s.detail ? '<p class="tip-detail">' + escapeHtml(s.detail) + '</p>' : '') +
      kv('性质', s.klass) +
      kv('庙旺', s.rule) +
      kv('怎么用', s.use) +
    '</div>'
  ).join('');
  const allRel = [];
  segs.forEach((s) => (s.related || []).forEach((k) => { if (ALL[k] && allRel.indexOf(k) < 0) allRel.push(k); }));
  return '<p class="tip-note">下面把这一处的几层含义分开列出来，合起来就是它在这张盘上的意思。</p>' + blocks + relHTML(allRel);
}

// 生成一个「可点术语」：T('入宿度','rudu') -> 虚线可点文字
export function T(text, key) {
  return '<span class="gt" data-tip="' + key + '">' + escapeHtml(text) + '</span>';
}

// 生成一个「可点元素」（整块可点，用于盘上的星曜/宫位等）
export function M(inner, key) {
  return '<span class="gt gt-el" data-tip="' + key + '">' + inner + '</span>';
}

// 全局委托：任何 [data-tip] 点击即弹解释（冒泡阶段，不影响既有交互）
export function initTips() {
  ensureSheet();
  if (document.body.dataset.tipBound) return;
  document.body.dataset.tipBound = '1';
  document.addEventListener('click', (e) => {
    if (e.target.closest('[data-tip-close]')) { closeTip(); return; }
    const t = e.target.closest('[data-tip]');
    if (!t) return;
    e.preventDefault();
    openTip(t.getAttribute('data-tip'));
  });
}

/* ---------------- 解盘思路引导块 ---------------- */
// g = { title, intro, steps:[{t 标题, d 说明, tip 可点术语key, sel 高亮目标选择器}], note }
export function guideHTML(g) {
  if (!g) return '';
  const list = g.steps || [];
  const steps = list.map((s, i) =>
    '<li class="gd-step"' +
      ' data-t="' + escapeHtml(s.t || '') + '"' +
      ' data-d="' + escapeHtml(s.d || '') + '"' +
      (s.sel ? ' data-sel="' + escapeHtml(s.sel) + '"' : '') +
    '><span class="gd-n">' + (i + 1) + '</span>' +
    '<div class="gd-txt"><b>' + escapeHtml(s.t) + '</b>' + (s.d ? '<span>' + s.d + '</span>' : '') + '</div>' +
    (s.tip ? '<button type="button" class="gd-tip" data-tip="' + s.tip + '">?</button>' : '') +
    '</li>'
  ).join('');
  const hasSel = list.some((s) => s.sel);
  return (
    '<div class="gd-card" data-guide>' +
      '<button type="button" class="gd-head" data-guide-toggle>' +
        '<span class="gd-title">' + escapeHtml(g.title || '解盘思路') + '</span>' +
        '<span class="gd-caret">▾</span>' +
      '</button>' +
      '<div class="gd-body">' +
        (g.intro ? '<p class="gd-intro">' + g.intro + '</p>' : '') +
        (steps ? '<ol class="gd-steps">' + steps + '</ol>' : '') +
        (hasSel ? '<button type="button" class="gd-go" data-guide-go>▶ 带我一步步看这张盘</button>' : '') +
        (g.note ? '<p class="gd-note">' + escapeHtml(g.note) + '</p>' : '') +
      '</div>' +
    '</div>'
  );
}

/* ---------------- 分步导览：牵着走 ---------------- */
let tour = null;

function tourBar() {
  let el = document.getElementById('tour-bar');
  if (el) return el;
  el = document.createElement('div');
  el.id = 'tour-bar';
  el.className = 'tour-bar';
  el.innerHTML =
    '<div class="tour-top">' +
      '<span class="tour-n"></span>' +
      '<span class="tour-t"></span>' +
      '<button type="button" class="tour-x" data-tour-x>结束</button>' +
    '</div>' +
    '<p class="tour-d"></p>' +
    '<div class="tour-nav">' +
      '<button type="button" class="tour-btn" data-tour-prev>上一步</button>' +
      '<button type="button" class="tour-btn primary" data-tour-next>下一步</button>' +
    '</div>';
  document.body.appendChild(el);
  el.addEventListener('click', (e) => {
    if (e.target.closest('[data-tour-x]')) { endTour(); return; }
    if (e.target.closest('[data-tour-prev]')) { tourGo((tour ? tour.i : 0) - 1); return; }
    if (e.target.closest('[data-tour-next]')) { tourGo((tour ? tour.i : 0) + 1); return; }
  });
  return el;
}

function clearHL() {
  document.querySelectorAll('.gd-hl').forEach((n) => n.classList.remove('gd-hl'));
}

export function startTour(card) {
  if (!card) return;
  const steps = Array.prototype.slice.call(card.querySelectorAll('.gd-step')).map((li) => ({
    t: li.dataset.t || '', d: li.dataset.d || '', sel: li.dataset.sel || '',
  }));
  if (!steps.length) return;
  card.classList.add('open');
  tour = { steps, i: -1, card };
  tourBar().classList.add('show');
  tourGo(0);
}

function tourGo(i) {
  if (!tour) return;
  if (i < 0) i = 0;
  if (i >= tour.steps.length) { endTour(); return; }
  clearHL();
  tour.i = i;
  const st = tour.steps[i];
  const bar = tourBar();
  const q = (s) => bar.querySelector(s);
  if (q('.tour-n')) q('.tour-n').textContent = '第 ' + (i + 1) + ' / ' + tour.steps.length + ' 步';
  if (q('.tour-t')) q('.tour-t').textContent = st.t;
  if (q('.tour-d')) q('.tour-d').textContent = st.d;
  if (q('[data-tour-prev]')) q('[data-tour-prev]').disabled = (i === 0);
  if (q('[data-tour-next]')) q('[data-tour-next]').textContent = (i === tour.steps.length - 1) ? '完成' : '下一步';
  Array.prototype.forEach.call(tour.card.querySelectorAll('.gd-step'), (li, k) => li.classList.toggle('on', k === i));
  if (st.sel) {
    const target = document.querySelector(st.sel);
    if (target) {
      target.classList.add('gd-hl');
      try { target.scrollIntoView({ behavior: 'smooth', block: 'center' }); }
      catch (err) { if (target.scrollIntoView) target.scrollIntoView(); }
    }
  }
}

export function endTour() {
  clearHL();
  const bar = document.getElementById('tour-bar');
  if (bar) bar.classList.remove('show');
  if (tour && tour.card) {
    Array.prototype.forEach.call(tour.card.querySelectorAll('.gd-step'), (li) => li.classList.remove('on'));
  }
  tour = null;
}

export function initGuides() {
  if (document.body.dataset.gdBound) return;
  document.body.dataset.gdBound = '1';
  document.addEventListener('click', (e) => {
    const go = e.target.closest('[data-guide-go]');
    if (go) { startTour(go.closest('.gd-card')); return; }
    const h = e.target.closest('[data-guide-toggle]');
    if (h) h.parentElement.classList.toggle('open');
  });
}
