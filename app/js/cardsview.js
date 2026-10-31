// 通用可插拔卡牌框架 · 牌桌子视图（M7）
// 只给牌面/牌阵位置/中性牌义与可自问方向，不预测、不替用户断结果。
// 默认牌组：韦特塔罗 RWS（1909，Pamela Colman Smith 绘，美国公有领域），78 张牌图本地内置、离线可用。
// 牌阵：洗牌→扇形→点一张自动落到下一牌位；
// 自由：点扇形牌让它跳起来预览（可改选）→拖到任意位置松手落位，落好的牌还能再拖动。
import {
  listSpreads, getDeck, drawSpread, readingToText,
} from '../vendor/liuyao-core.js?v=125';
import { $ } from './state.js?v=125';
import { guideHTML, T } from './tipview.js?v=125';

function esc(s) {
  return String(s == null ? '' : s).replace(/[&<>"']/g, (c) => (
    { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]
  ));
}

const DECK_ID = 'rws';
const FREE_SPREAD_ID = '__free__';
const SCALE_MIN = 1;
const SCALE_MAX = 3;
const FREE_CARD_W = 13; // 自由牌宽占牌桌宽的百分比

// ---- 会话状态 ----
let spreads = [];
let spread = null;
let reading = null;
let question = '';
let reversalOn = true;
let mode = 'library';     // 'library' | 'table'
let deckOrder = [];       // 洗牌后的牌下标队列（牌堆顶在末尾）
let nextIdx = 0;          // 牌阵模式已落位张数
let revealed = [];
let ritual = 'intro';     // intro | shuffling | fan | done
const view = { scale: 1, x: 0, y: 0 };
let freeDrawn = [];       // 自由模式已落位 { cardIndex, reversed, nx, ny }
let candidate = null;     // 自由模式跳起来待放置 { k, cardIndex, reversed, x, y(px 相对牌桌) }
let candidateK = null;    // 当前候选在扇形中的序号
let locked = false;       // 自由牌阵锁定：锁定时已落位的牌不可拖动
const FREE_KEY = 'qt-cards-free-v1';

const freeSpread = {
  id: FREE_SPREAD_ID, name: '自由排阵', count: 78, type: '自由',
  intro: '不设牌位，按住扇形里的牌抽出，拖到你想放的位置松手落位。',
  reversal: true, deckKinds: ['tarot', 'oracle'],
  positions: [], free: true,
};

function deck() { return getDeck(DECK_ID); }
function isFree() { return !!spread?.free; }
function remain() { return deckOrder.length - (isFree() ? freeDrawn.length : nextIdx); }

// 自由牌阵持久化：排好的局存本地，回来可恢复；锁定后防误拖
function loadFree() { try { return JSON.parse(localStorage.getItem(FREE_KEY) || 'null'); } catch { return null; } }
function saveFree() {
  if (!isFree()) return;
  try {
    localStorage.setItem(FREE_KEY, JSON.stringify({ q: question, rev: reversalOn, locked, deckOrder, freeDrawn, savedAt: Date.now() }));
  } catch { /* 隐私模式等写入失败则静默 */ }
}
function clearFree() { try { localStorage.removeItem(FREE_KEY); } catch { /* */ } }

function shuffleOrder() {
  const n = deck().cards.length;
  const idx = Array.from({ length: n }, (_, i) => i);
  const rnd = (k) => { const a = new Uint32Array(1); crypto.getRandomValues(a); return a[0] % k; };
  for (let i = n - 1; i > 0; i--) {
    const j = rnd(i + 1);
    [idx[i], idx[j]] = [idx[j], idx[i]];
  }
  return idx;
}
function secureBit() { const a = new Uint32Array(1); crypto.getRandomValues(a); return a[0] % 2; }

function enterSpread(s) {
  spread = s;
  mode = 'table';
  reading = s.free ? null : drawSpread(deck(), s, { question, reversal: reversalOn });
  nextIdx = 0;
  revealed = s.free ? [] : s.positions.map(() => false);
  deckOrder = shuffleOrder();
  freeDrawn = [];
  candidate = null;
  candidateK = null;
  ritual = 'intro';
  view.scale = 1; view.x = 0; view.y = 0;
  // 自由牌阵：上次留有存档则直接恢复（不重洗），让排好的局不丢
  if (s.free) {
    const sv = loadFree();
    if (sv && Array.isArray(sv.freeDrawn) && sv.freeDrawn.length) {
      freeDrawn = sv.freeDrawn;
      if (Array.isArray(sv.deckOrder) && sv.deckOrder.length) deckOrder = sv.deckOrder;
      locked = !!sv.locked;
      if (typeof sv.q === 'string') question = sv.q;
      if (typeof sv.rev === 'boolean') reversalOn = sv.rev;
      ritual = 'done';
    }
  }
  renderCards();
}

// ---------- 牌阵库 ----------
const CD_GUIDE = {
  title: '塔罗怎么玩',
  intro: '塔罗是一套 78 张牌的图像体系。先在心里默想所问，再洗牌、扇形摊开，由你亲手抽牌。',
  steps: [
    { t: '先选一个牌阵', d: '牌阵是固定的牌位布局，每个位置有特定含义。', tip: 'paizhen', sel: '.cd-grid' },
    { t: '78 张牌', d: '＝22 张大阿卡那（人生大主题）＋56 张小阿卡那（日常情境）。', tip: 'tarot', sel: '.cd-grid' },
    { t: '正位 / 逆位', d: '牌面朝上是正位，颠倒过来是逆位，通常表示该含义受阻或转向。', tip: 'zhengniwei', sel: '.cd-grid' },
    { t: '洗牌后扇形摊开', d: '从扇形里点选／拖出你要的牌，松手即翻开。', sel: '.cd-fan' },
    { t: '自由排阵', d: '按住扇形里的牌拖到牌桌任意位置，随心排布，不限张数。可点「锁定」防误拖，排好的局会自动存下来。', sel: '.cd-bar' },
    { t: '牌义', d: '点开任一张牌可看它的名称与含义；本盘只列牌义，不下断语。', sel: '.cd-grid' },
  ],
  note: '默认牌组为韦特 RWS（1909，公有领域），牌图本地内置、离线可用。',
};

function libraryHtml() {
  const chips = spreads.map((s, i) => `
    <button class="cd-card" data-spread="${i}">
      <div class="cd-card-top"><span class="cd-count">${s.count} 张</span><span class="cd-type">${esc(s.type)}</span></div>
      <div class="cd-name">${esc(s.name)}</div>
      <div class="cd-intro">${esc(s.intro)}</div>
    </button>`).join('');
  return `
    ${guideHTML(CD_GUIDE)}
    <div class="cd-hint">选一个牌阵，或进入自由排阵。所有牌阵抽牌前都会先洗牌、再扇形摊开由你任选。</div>
    <div class="cd-q">
      <input id="cd-question" class="cd-input" type="text" placeholder="可填所问（不填也能抽）" value="${esc(question)}" />
      <label class="cd-switch"><input type="checkbox" id="cd-reversal" ${reversalOn ? 'checked' : ''}/>正逆位</label>
    </div>
    <div class="cd-grid">
      ${chips}
      <button class="cd-card is-free" data-spread="free">
        <div class="cd-card-top"><span class="cd-count">∞</span><span class="cd-type">自由</span></div>
        <div class="cd-name">✦ 自由排阵</div>
        <div class="cd-intro">按住扇形里的牌抽出，拖到牌桌任意位置松手即翻开，随心排布。</div>
      </button>
    </div>
    <div class="cd-foot">默认牌组：韦特塔罗 RWS（22 大阿尔卡那＋四花色 56 张，共 78 张，1909 年 Pamela Colman Smith 绘，美国公有领域；牌图本地内置、离线可用）。</div>`;
}

// ---------- 顶栏 ----------
function barHtml() {
  const dealt = isFree() ? freeDrawn.length : nextIdx;
  return `
    <div class="cd-bar">
      <button class="cd-mini" id="cd-back-lib">← 牌阵库</button>
      <button class="cd-mini" id="cd-redraw">↻ 重新洗牌</button>
      <span class="cd-spacer"></span>
      <span class="cd-progress">${esc(spread.name)} · 已抽 <b>${dealt}</b>${isFree() ? '' : ` / ${spread.count}`} · 牌堆剩 <b>${remain()}</b></span>
      ${isFree() ? `<button class="cd-mini ${locked ? 'on' : ''}" id="cd-lock">${locked ? '🔒 已锁' : '🔓 锁定'}</button><button class="cd-mini" id="cd-clear">清空</button>` : ''}
    </div>`;
}

// ---------- 仪式层 ----------
function pileHtml() {
  const cards = Array.from({ length: 18 }, (_, i) =>
    `<div class="cd-pile-card" data-i="${i}" style="transform:translate(${(i - 9) * 0.35}px,${i * 0.45}px) rotate(${(i - 9) * 0.25}deg)"></div>`).join('');
  const top = '<div class="cd-pile-card is-top">✦</div>';
  if (ritual === 'intro') {
    return `<div class="cd-ritual">
      <div class="cd-pile"><div class="cd-pilemeta">RWS · 78 张</div>${cards}${top}</div>
      <button class="cd-btn-shuffle" id="cd-shuffle">✦ 开始洗牌</button>
      <div class="cd-ritual-sub">静心，默念所问，然后洗牌</div>
    </div>`;
  }
  return `<div class="cd-ritual">
    <div class="cd-pile" id="cd-pile"><div class="cd-pilemeta">正在洗牌…</div>${cards}${top}</div>
    <div class="cd-ritual-title">洗牌中</div></div>`;
}

// 扇形一次最多摊开的张数：78 张全摊会挤成一团、牌又小又难点；
// 只摊开最上面 FAN_MAX 张（够抽任何牌阵），每张牌更大、更好点选。
const FAN_MAX = 30;

function fanCount() { return Math.min(remain(), FAN_MAX); }
// 拱桥弧几何：n 张牌沿一段圆弧排开，牌底汇聚于枢轴、牌顶连成拱形；角度随张数自适应
function fanGeom() {
  const n = fanCount();
  if (n <= 1) return { n, start: 0, step: 0 };
  const maxDeg = Math.min(150, 22 + n * 5.2);
  return { n, start: -maxDeg / 2, step: maxDeg / (n - 1) };
}

function fanHtml() {
  const { n, start, step } = fanGeom();
  if (!n) return '';
  const cards = Array.from({ length: n }, (_, k) => {
    const ang = start + step * k;
    const hl = candidateK === k ? ' is-hl' : '';
    return `<button class="cd-fan-card${hl}" data-k="${k}" style="--a:${ang.toFixed(2)}deg" aria-label="选第${k + 1}张"></button>`;
  }).join('');
  const more = remain() > n ? ` · 牌堆还有 ${remain() - n} 张` : '';
  const meta = isFree()
    ? (candidate ? '拖到想放的位置松手落下（牌背）· 拖回扇形放回' : '按住一张牌抽出，松手落在牌桌（牌背朝下），再点它翻开')
    : `凭直觉选一张牌（第 ${Math.min(nextIdx + 1, spread.count)} 位）`;
  return `<div class="cd-fanmeta">${meta}${more}</div><div class="cd-fan" id="cd-fan">${cards}</div>`;
}

// 扇形枢轴就是 .cd-fan 那个 0 尺寸点（牌底汇聚处）；
// 按"点击方向的角度"就近取牌，牌叠在一起也点得准，不用去戳几像素的缝。
function fanPickK(clientX, clientY) {
  const { n, start, step } = fanGeom();
  if (!n) return null;
  const f = document.getElementById('cd-fan');
  if (!f) return null;
  const p = f.getBoundingClientRect();
  const dx = clientX - p.left, dy = clientY - p.top;
  if (dy >= 0) return null;                        // 枢轴下方，不在扇形内
  const card = document.querySelector('.cd-fan-card');
  const h = card ? (card.offsetHeight || 150) : 150;
  if (Math.hypot(dx, dy) > h * 1.12) return null;  // 超出扇形半径
  const deg = Math.atan2(dx, -dy) * 180 / Math.PI;
  const half = n > 1 ? ((n - 1) * step) / 2 : 0;
  if (deg < -half - 9 || deg > half + 9) return null;
  if (n === 1) return 0;
  return Math.max(0, Math.min(n - 1, Math.round((deg - start) / step)));
}

function highlightFan(k) {
  document.querySelectorAll('#cd-fan .cd-fan-card').forEach((el) => {
    el.classList.toggle('is-hl', Number(el.dataset.k) === k);
  });
}
function clearFanHighlight() {
  document.querySelectorAll('#cd-fan .cd-fan-card.is-hl').forEach((el) => el.classList.remove('is-hl'));
}

// ---------- 牌阵牌位 ----------
function spreadSlotsHtml() {
  return spread.positions.map((p, i) => {
    let inner;
    let cls = 'cd-slot';
    if (!revealed[i]) {
      const isCur = i === nextIdx && ritual !== 'done';
      inner = `<div class="cd-cardback">✦</div>`;
      cls += isCur ? ' is-current' : ' is-empty';
    } else {
      const d = reading.positions[i].drawn;
      inner = `<div class="cd-cardface ${d.reversed ? 'is-rev' : ''}"><img src="${esc(d.card.image || '')}" alt=""/></div>`;
      cls += ' is-dealt';
    }
    return `<button class="${cls}" data-spread-slot="${i}" style="left:${p.x}%;top:${p.y}%;${p.rotate ? `--slot-rot:${p.rotate}deg;` : ''}">
      ${inner}<span class="cd-poslabel">${esc(p.label)}</span></button>`;
  }).join('');
}

// ---------- 自由牌（任意位置） ----------
function freeCardsHtml() {
  return freeDrawn.map((d, i) => {
    // 松手落位仍是牌背，点击后才翻开
    if (!d.faceUp) {
      return `<div class="cd-fcard2 is-down" data-free-slot="${i}"
        style="left:${d.nx}%;top:${d.ny}%"><div class="cd-fcard-back"><span>✦</span></div></div>`;
    }
    const c = deck().cards[d.cardIndex];
    return `<div class="cd-fcard2 is-dealt ${d.reversed ? 'is-rev' : ''}" data-free-slot="${i}"
      style="left:${d.nx}%;top:${d.ny}%"><img src="${esc(c.image || '')}" alt=""/></div>`;
  }).join('');
}

function flipFree(i) {
  const d = freeDrawn[i];
  if (!d || d.faceUp) return;
  d.faceUp = true;
  const el = document.querySelector(`.cd-stage [data-free-slot="${i}"]`);
  if (!el) return;
  const c = deck().cards[d.cardIndex];
  el.classList.remove('is-down');
  el.classList.add('is-dealt');
  if (d.reversed) el.classList.add('is-rev');
  el.innerHTML = `<img src="${esc(c.image || '')}" alt=""/>`;
  saveFree();
}

function candidateHtml() {
  if (!candidate) return '';
  // 抽牌阶段只见牌背，落位松手后才翻开（抽牌而非挑牌）
  return `<div class="cd-candidate" id="cd-candidate"
    style="left:${candidate.x.toFixed(2)}%;top:${candidate.y.toFixed(2)}%" data-k="${candidate.k}">
    <div class="cd-cand-back"><span>✦</span></div>
  </div>`;
}

// 舞台层：只有已落位的牌，跟随平移/缩放
function boardHtml() {
  return isFree() ? freeCardsHtml() : spreadSlotsHtml();
}

// 固定浮层：牌叠/扇形/提示，不随牌桌平移缩放
function overlayHtml() {
  let inner = '';
  if (ritual === 'intro' || ritual === 'shuffling') inner += pileHtml();
  if (ritual === 'fan') inner += fanHtml();
  if (ritual !== 'fan') {
    let hint;
    if (ritual === 'done') hint = '牌已落位 · 点任意牌查看牌义与典籍原文';
    else if (isFree()) hint = candidate
      ? '松手落在牌桌（牌背）· 拖回底部扇形放回 · 点已落下的牌翻开'
      : '按住扇形里的牌抽出 · 松手落在牌桌（牌背朝下）· 点牌翻开 · 双指缩放';
    else hint = '点扇形中的一张牌抽出 · 双指/滚轮缩放，单指拖动牌桌';
    inner += `<div class="cd-taphint">${hint}</div>`;
  }
  return inner;
}

function tableHtml() {
  return `
    ${barHtml()}
    <div class="cd-tablewrap" id="cd-tablewrap">
      <div class="cd-stage" id="cd-stage">${boardHtml()}</div>
      <div class="cd-overlay" id="cd-overlay">${overlayHtml()}</div>
      ${candidate ? `<div class="cd-candidate-layer" id="cd-candidate-layer">${candidateHtml()}</div>` : ''}
      <div class="cd-zoomctl">
        <button id="cd-zoomin" aria-label="放大">＋</button>
        <button id="cd-zoomreset" aria-label="复位" style="font-size:14px">⊙</button>
        <button id="cd-zoomout" aria-label="缩小">－</button>
      </div>
    </div>`;
}

// 只重绘舞台与浮层（保留缩放）；候选牌在独立浮层单独刷新
function paintStage() {
  const stage = $('#cd-stage');
  if (stage) { stage.innerHTML = boardHtml(); applyView(); }
  const ov = $('#cd-overlay');
  if (ov) ov.innerHTML = overlayHtml();
  const wrap = $('#cd-tablewrap');
  if (wrap) {
    let layer = $('#cd-candidate-layer', wrap);
    if (candidate) {
      if (!layer) {
        layer = document.createElement('div');
        layer.className = 'cd-candidate-layer';
        layer.id = 'cd-candidate-layer';
        wrap.insertBefore(layer, wrap.querySelector('.cd-zoomctl'));
      }
      layer.innerHTML = candidateHtml();
    } else if (layer) layer.remove();
  }
}

function startShuffle() {
  ritual = 'shuffling';
  renderCards();
  const pile = $('#cd-pile');
  if (pile) {
    pile.querySelectorAll('.cd-pile-card').forEach((c) => {
      const i = Number(c.dataset.i || 0);
      c.style.setProperty('--sx', `${(Math.random() - 0.5) * 220}px`);
      c.style.setProperty('--sy', `${-20 - Math.random() * 70}px`);
      c.style.setProperty('--sr', `${(Math.random() - 0.5) * 60}deg`);
      setTimeout(() => c.classList.add('shuffling'), i * 22);
    });
  }
  setTimeout(() => {
    deckOrder = shuffleOrder();
    freeDrawn = []; candidate = null; candidateK = null; locked = false;
    clearFree();
    if (!isFree()) { nextIdx = 0; revealed = spread.positions.map(() => false); }
    ritual = 'fan';
    renderCards();
  }, 1150);
}

// ---------- 牌阵模式：点扇形自动落位 ----------
function spreadDraw(k) {
  if (k < 0 || k >= remain()) return;
  const cardIndex = deckOrder[nextIdx + k];
  deckOrder.splice(nextIdx + k, 1);
  const rev = reversalOn && deck().cards[cardIndex].reversible && secureBit() === 1;
  const rp = reading.positions[nextIdx];
  rp.drawn = { cardIndex, card: deck().cards[cardIndex], reversed: rev };
  revealed[nextIdx] = true;
  nextIdx++;
  if (nextIdx >= spread.count || remain() === 0) ritual = 'done';
  renderCards();
}

// ---------- 自由模式：候选（跳起来 / 改选） ----------
// 自由抽牌：手指按住扇形里的牌，直接把它（牌背朝上）抽起来跟手
function beginDraw(k, clientX, clientY) {
  if (k < 0 || k >= remain()) return null;
  const r = $('#cd-tablewrap').getBoundingClientRect();
  const cardIndex = deckOrder[freeDrawn.length + k];
  const rev = reversalOn && deck().cards[cardIndex].reversible && secureBit() === 1;
  const wPx = r.width * CAND_W / 100;
  const hPx = wPx * 1433 / 860;
  const grab = { x: wPx / 2, y: hPx / 2 }; // 以牌中心跟手
  candidate = {
    k, cardIndex, reversed: rev,
    x: ((clientX - r.left - grab.x) / r.width) * 100,
    y: ((clientY - r.top - grab.y) / r.height) * 100,
  };
  candidateK = k;
  paintStage();
  return grab;
}
const CAND_W = 14;

function cancelCandidate() {
  candidate = null; candidateK = null;
  paintStage();
}

// 把候选放到归一化坐标（牌桌舞台 %），落位并从扇形移除
function placeCandidate(sx, sy) {
  if (!candidate) return;
  const r = $('#cd-tablewrap').getBoundingClientRect();
  const wPct = FREE_CARD_W;
  const hPct = FREE_CARD_W * 1433 / 860 * (r.width / r.height);
  const nx = Math.max(0, Math.min(100 - wPct, sx));
  const ny = Math.max(0, Math.min(100 - hPct, sy));
  deckOrder.splice(freeDrawn.length + candidate.k, 1);
  freeDrawn.push({ cardIndex: candidate.cardIndex, reversed: candidate.reversed, nx, ny, faceUp: false });
  candidate = null; candidateK = null;
  if (remain() === 0) ritual = 'done';
  saveFree();
  renderCards();
}
// 候选层为牌桌百分比且不缩放，坐标即舞台归一化坐标
function placeCandidateAtScreen(sx, sy) {
  placeCandidate(sx, sy);
}

// ---------- 详情 ----------
function drawnAt(i) {
  if (isFree()) {
    const d0 = freeDrawn[i];
    return d0 ? { ...d0, card: deck().cards[d0.cardIndex] } : null;
  }
  return reading.positions[i].drawn;
}
function openDetail(i) {
  const d = drawnAt(i);
  if (!d) return;
  const c = d.card, m = c.meaning;
  const pos = isFree()
    ? { label: `第 ${i + 1} 张`, meaning: '自由排阵，凭直觉落子，这张牌此刻让你联想到什么？' }
    : (() => { const p = reading.positions[i].position; return { label: p.label, meaning: p.meaning }; })();
  const pick = d.reversed ? m.reversed : m.upright;
  const wrap = document.createElement('div');
  wrap.innerHTML = `
    <div class="cd-modal-mask">
      <div class="cd-modal">
        <button class="cd-modal-x" aria-label="关闭">×</button>
        <div class="cd-modal-pos">第 ${i + 1} 位 · ${esc(pos.label)}</div>
        <div class="cd-modal-posmean">此位看：${esc(pos.meaning)}</div>
        <div class="cd-modal-card ${d.reversed ? 'is-rev' : ''}">
          ${c.image ? `<img src="${esc(c.image)}" alt="${esc(c.name)}"/>` : ''}
          <div class="cd-modal-cname">${esc(c.name)} <span class="cd-modal-alt">${esc(c.nameAlt || '')}</span></div>
          <div class="cd-crev">${d.reversed ? '逆位' : '正位'}</div>
        </div>
        <div class="cd-sec"><h4>牌面</h4><p>${esc(m.scene)}</p></div>
        <div class="cd-sec"><h4>关键词</h4><p>${m.keywords.map((kw) => `<span class="cd-kw">${esc(kw)}</span>`).join('')}</p></div>
        <div class="cd-sec"><h4>${d.reversed ? '逆位牌义' : '正位牌义'}</h4><ul>${pick.map((x) => `<li>${esc(x)}</li>`).join('')}</ul></div>
        ${m.classicText ? `<div class="cd-sec"><h4>典籍原文</h4><p style="font-style:italic;color:#9a8c66">${esc(m.classicText)}</p>${m.classicSource ? `<p style="font-size:10px;color:var(--ink-faint);margin-top:4px">${esc(m.classicSource)}</p>` : ''}</div>` : ''}
        ${!isFree() ? `<div class="cd-sec cd-ask"><h4>可自问</h4><p>结合「${esc(pos.label)}」这一位置，上面哪一点最贴近你当下的处境？它让你想到哪件具体的事？</p></div>` : ''}
      </div>
    </div>`;
  const mask = wrap.firstElementChild;
  document.body.appendChild(mask);
  const close = () => mask.remove();
  mask.querySelector('.cd-modal-x').addEventListener('click', close);
  mask.addEventListener('click', (e) => { if (e.target === mask) close(); });
}

// ---------- 渲染 ----------
export function renderCards() {
  const body = $('#cards-body');
  if (!spreads.length) spreads = listSpreads('tarot');
  if (mode === 'library' || !spread) {
    document.getElementById('view-cards')?.classList.remove('cd-fullscreen');
    body.innerHTML = libraryHtml();
    body.querySelectorAll('[data-spread]').forEach((b) => {
      b.addEventListener('click', () => {
        const q = $('#cd-question'); question = q ? q.value.trim() : '';
        const rv = $('#cd-reversal'); reversalOn = rv ? rv.checked : true;
        const v = b.dataset.spread;
        enterSpread(v === 'free' ? freeSpread : spreads[Number(v)]);
      });
    });
    return;
  }
  body.innerHTML = tableHtml();
  document.getElementById('view-cards')?.classList.add('cd-fullscreen');
  bindTable(body);
}

function exitTable() {
  mode = 'library'; spread = null; reading = null; freeDrawn = []; candidate = null;
  document.getElementById('view-cards')?.classList.remove('cd-fullscreen');
  renderCards();
}

function updateBar() {
  const el = document.querySelector('.cd-progress');
  if (el) {
    const dealt = isFree() ? freeDrawn.length : nextIdx;
    el.innerHTML = `${esc(spread.name)} · 已抽 <b>${dealt}</b>${isFree() ? '' : ` / ${spread.count}`} · 牌堆剩 <b>${remain()}</b>`;
  }
}

function bindTable(body) {
  $('#cd-back-lib', body).addEventListener('click', exitTable);
  $('#cd-redraw', body).addEventListener('click', () => enterSpread(spread));
  $('#cd-zoomin', body).addEventListener('click', () => zoomBy(1.25));
  $('#cd-zoomout', body).addEventListener('click', () => zoomBy(0.8));
  $('#cd-zoomreset', body).addEventListener('click', () => { view.scale = 1; view.x = 0; view.y = 0; applyView(); });
  const sh = $('#cd-shuffle', body);
  if (sh) sh.addEventListener('click', startShuffle);
  const lk = $('#cd-lock', body);
  if (lk) lk.addEventListener('click', () => { locked = !locked; saveFree(); renderCards(); });
  const clr = $('#cd-clear', body);
  if (clr) clr.addEventListener('click', () => {
    if (window.confirm('清空当前自由牌阵？已排好的牌会全部移除。')) {
      freeDrawn = []; candidate = null; candidateK = null; locked = false;
      clearFree();
      ritual = remain() > 0 ? 'fan' : 'done';
      renderCards();
    }
  });
  bindGestures(body.querySelector('#cd-tablewrap'));
}

// ---------- 牌桌手势：平移/缩放 + 自由拖牌（统一指针状态机） ----------
// mode: null | 'pan' | 'zoom' | 'candidate' | 'freecard'
function bindGestures(wrap) {
  if (!wrap) return;
  const pointers = new Map();
  let mode = null;
  let start = null;       // {x,y}
  let moved = false;
  let dragIdx = -1;       // freecard 索引
  let grabOff = null;     // 候选/自由牌抓取点相对牌左上角 px
  let lastDist = 0;
  let pendingFanK = null; // 牌阵模式：按下的那张扇形牌，松手未移动即落位

  const stageNorm = (clientX, clientY) => {
    const r = wrap.getBoundingClientRect();
    const px = clientX - r.left, py = clientY - r.top;
    const sx = (px - r.width / 2 - view.x) / view.scale + r.width / 2;
    const sy = (py - r.height / 2 - view.y) / view.scale + r.height / 2;
    return { nx: (sx / r.width) * 100, ny: (sy / r.height) * 100, px, py, r };
  };

  wrap.addEventListener('pointerdown', (e) => {
    if (e.target.closest('.cd-zoomctl')) return;
    wrap.setPointerCapture(e.pointerId);
    pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
    start = { x: e.clientX, y: e.clientY };
    moved = false;

    if (pointers.size >= 2) { mode = 'zoom'; lastDist = pdist(); return; }

    const fanEl = e.target.closest('.cd-fan-card');
    const freeEl = e.target.closest('[data-free-slot]');

    // 扇形取牌：优先按"角度就近"判定（牌叠在一起也点得准）；只在没点到
    // 牌位/自由牌/缩放控件时，才把这次按下当成扇形操作。
    let fk = null;
    if (fanEl) fk = fanPickK(e.clientX, e.clientY);
    else if (!freeEl && !e.target.closest('.cd-slot') && !e.target.closest('.cd-zoomctl')) {
      fk = fanPickK(e.clientX, e.clientY);
    }
    if (fk == null && fanEl) fk = Number(fanEl.dataset.k);

    if (fk != null) {
      if (isFree()) {
        // 自由模式：按住即把这张牌（牌背）抽起跟手，松手落位时才翻开
        const g = beginDraw(fk, e.clientX, e.clientY);
        if (g) {
          mode = 'candidate'; grabOff = g;
          const src = document.querySelector(`#cd-fan .cd-fan-card[data-k="${fk}"]`);
          if (src) src.style.opacity = '0';
        }
        return;
      }
      mode = 'fan';
      pendingFanK = fk;
      highlightFan(fk);
      return;
    }
    if (freeEl && isFree() && !locked) {
      mode = 'freecard';
      dragIdx = Number(freeEl.dataset.freeSlot);
      const w = freeEl.getBoundingClientRect();
      grabOff = { x: e.clientX - w.left, y: e.clientY - w.top };
      freeEl.classList.add('dragging');
      return;
    }
    mode = 'pan';
  });

  wrap.addEventListener('pointermove', (e) => {
    if (!pointers.has(e.pointerId)) return;
    const prev = pointers.get(e.pointerId);
    pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });

    if (pointers.size >= 2) {
      mode = 'zoom'; moved = true;
      const nd = pdist();
      if (lastDist > 0) zoomBy(nd / lastDist, pmid().x, pmid().y);
      lastDist = nd;
      return;
    }
    const dx = e.clientX - prev.x, dy = e.clientY - prev.y;
    if (Math.abs(e.clientX - start.x) + Math.abs(e.clientY - start.y) > 6) moved = true;

    if (mode === 'pan') { view.x += dx; view.y += dy; applyView(); }
    else if (mode === 'candidate' && candidate) {
      const r = wrap.getBoundingClientRect();
      candidate.x = ((e.clientX - r.left - grabOff.x) / r.width) * 100;
      candidate.y = ((e.clientY - r.top - grabOff.y) / r.height) * 100;
      const el = $('#cd-candidate');
      if (el) { el.style.left = candidate.x.toFixed(2) + '%'; el.style.top = candidate.y.toFixed(2) + '%'; el.classList.add('dragging'); }
    } else if (mode === 'freecard' && dragIdx >= 0) {
      const r = wrap.getBoundingClientRect();
      const hPct = FREE_CARD_W * 1433 / 860 * (r.width / r.height);
      const g = stageNorm(e.clientX, e.clientY);
      // grabOff 为屏幕像素，回到舞台坐标需除以 scale
      const nx = g.nx - (grabOff.x / view.scale / r.width) * 100;
      const ny = g.ny - (grabOff.y / view.scale / r.height) * 100;
      const d0 = freeDrawn[dragIdx];
      d0.nx = Math.max(0, Math.min(100 - FREE_CARD_W, nx));
      d0.ny = Math.max(0, Math.min(100 - hPct, ny));
      const el = wrap.querySelector(`[data-free-slot="${dragIdx}"]`);
      if (el) { el.style.left = d0.nx + '%'; el.style.top = d0.ny + '%'; }
    }
  });

  const finish = (e) => {
    const wasMode = mode;
    const wasMoved = moved;
    const target = e.target;
    pointers.delete(e.pointerId);
    if (pointers.size < 2) lastDist = 0;

    if (pointers.size === 0) {
      if (!wasMoved) {
        // 轻触判定
        if (wasMode === 'fan') {
          // 牌阵模式：点一张自动落位；自由模式只靠拖拽抽牌，轻点不触发
          if (!isFree() && pendingFanK != null) spreadDraw(pendingFanK);
        } else if (wasMode === 'candidate') {
          // 自由模式按住后没拖动就松手：把牌放回扇形
          cancelCandidate();
        } else if (wasMode === 'freecard') {
          const d = freeDrawn[dragIdx];
          if (d && !d.faceUp) flipFree(dragIdx);
          else openDetail(dragIdx);
        } else if (wasMode === 'pan') {
          // 固定牌阵：点已翻开的牌看详情
          const s = target.closest('[data-spread-slot]');
          if (s && s.classList.contains('is-dealt')) openDetail(Number(s.dataset.spreadSlot));
        }
      } else if (wasMode === 'candidate') {
        // 抽出后拖动：拖回底部扇形区域放回，否则在松手处落位并翻开
        if (candidate.y > 68) cancelCandidate();
        else placeCandidateAtScreen(candidate.x, candidate.y);
      }
      mode = null; dragIdx = -1; grabOff = null; pendingFanK = null;
      clearFanHighlight();
      wrap.querySelectorAll('.dragging').forEach((n) => n.classList.remove('dragging'));
    } else if (pointers.size === 1) {
      mode = 'pan';
    }
  };
  wrap.addEventListener('pointerup', finish);
  wrap.addEventListener('pointercancel', finish);
  wrap.addEventListener('wheel', (e) => { e.preventDefault(); zoomBy(e.deltaY < 0 ? 1.12 : 0.89, e.clientX, e.clientY); }, { passive: false });

  function pdist() {
    const p = [...pointers.values()];
    if (p.length < 2) return 0;
    return Math.hypot(p[0].x - p[1].x, p[0].y - p[1].y);
  }
  function pmid() {
    const p = [...pointers.values()];
    return { x: (p[0].x + p[1].x) / 2, y: (p[0].y + p[1].y) / 2 };
  }
}

// ---------- 缩放 / 平移 ----------
function applyView() {
  const stage = $('#cd-stage');
  if (stage) stage.style.transform = `translate(calc(-50% + ${view.x}px), calc(-50% + ${view.y}px)) scale(${view.scale})`;
}
function zoomBy(f, cx, cy) {
  const wrap = $('#cd-tablewrap');
  if (!wrap) return;
  const r = wrap.getBoundingClientRect();
  const px = cx == null ? r.width / 2 : cx - r.left;
  const py = cy == null ? r.height / 2 : cy - r.top;
  const old = view.scale;
  const ns = Math.max(SCALE_MIN, Math.min(SCALE_MAX, old * f));
  if (ns === old) return;
  view.x = px - r.width / 2 - ((px - r.width / 2 - view.x) / old) * ns;
  view.y = py - r.height / 2 - ((py - r.height / 2 - view.y) / old) * ns;
  view.scale = ns;
  applyView();
}

// ---------- 一键复制 ----------
export function cardsCopyText() {
  if (mode === 'library' || !spread) return '尚未抽牌（牌阵库阶段无需复制）。';
  if (isFree()) {
    const L = [`【自由排阵】${new Date().toLocaleString()}`, `所问：${question || '（未填）'}`, ''];
    freeDrawn.forEach((d0, i) => {
      const c = deck().cards[d0.cardIndex], m = c.meaning;
      L.push(`${i + 1}. ${c.name}${d0.reversed ? '（逆位）' : '（正位）'}`);
      const pick = d0.reversed ? m.reversed : m.upright;
      if (pick && pick.length) L.push(`   ${d0.reversed ? '逆位' : '正位'}牌义：${pick.join('、')}`);
      if (m.keywords && m.keywords.length) L.push(`   关键词：${m.keywords.join('、')}`);
      if (m.scene) L.push(`   牌面：${m.scene}`);
      L.push('');
    });
    if (!freeDrawn.length) L.push('（桌面暂无牌）');
    return L.join('\n');
  }
  return reading ? readingToText(reading) : '尚未抽牌。';
}

/* ============================================================
   牌局复现码（v47）：牌阵 + 每张牌的牌序与正逆
   塔罗是真随机洗牌（crypto.getRandomValues），复现靠把抽到的牌记进码里；
   别人拿到码粘进来即可看到同一副牌局。
   ============================================================ */
const FREE_SPREAD_CODE = 255;

/** 当前牌局的码数据；牌没抽出来时返回 null */
export function cardsCode() {
  if (!spread) return null;
  const freeMode = isFree();
  const cards = freeMode
    ? freeDrawn.map((d) => ({ index: d.cardIndex, reversed: !!d.reversed }))
    : (reading && reading.positions ? reading.positions : [])
        .map((p) => p.drawn).filter(Boolean)
        .map((d) => ({ index: d.cardIndex, reversed: !!d.reversed }));
  if (!cards.length) return null;
  const si = freeMode ? FREE_SPREAD_CODE : Math.max(0, spreads.indexOf(spread));
  const names = cards.map((c) => {
    const card = deck().cards[c.index];
    return `${card ? card.name : '?'}${c.reversed ? '(逆)' : ''}`;
  });
  return {
    kind: 'cards',
    data: { at: Date.now(), spreadIndex: si, cards },
    title: `${spread.name} · ${cards.length} 张`,
    sub: names.slice(0, 6).join('、') + (names.length > 6 ? '…' : ''),
  };
}

/** 按码还原牌局（spreadIndex=255 表示自由排阵） */
export function restoreCards(spreadIndex, cards) {
  if (!spreads.length) spreads = listSpreads('tarot');
  const s = spreadIndex === FREE_SPREAD_CODE ? freeSpread : spreads[spreadIndex];
  if (!s || !cards || !cards.length) return false;
  const total = deck().cards.length;

  spread = s;
  mode = 'table';
  candidate = null;
  candidateK = null;
  view.scale = 1; view.x = 0; view.y = 0;

  const used = new Set(cards.map((c) => c.index));
  deckOrder = Array.from({ length: total }, (_, i) => i).filter((i) => !used.has(i));

  if (s.free) {
    reading = null;
    nextIdx = 0;
    revealed = [];
    freeDrawn = cards.map((c, i) => ({
      cardIndex: c.index,
      reversed: !!c.reversed,
      nx: 18 + (i % 5) * 16,
      ny: 24 + Math.floor(i / 5) * 20,
      faceUp: true,
    }));
  } else {
    reading = drawSpread(deck(), s, { question: '', reversal: reversalOn });
    revealed = s.positions.map(() => false);
    reading.positions.forEach((p) => { p.drawn = null; });
    cards.slice(0, s.positions.length).forEach((c, i) => {
      const rp = reading.positions[i];
      if (!rp) return;
      rp.drawn = { cardIndex: c.index, card: deck().cards[c.index], reversed: !!c.reversed };
      revealed[i] = true;
    });
    nextIdx = 0;
  }
  ritual = 'done';
  renderCards();
  return true;
}
