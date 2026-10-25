// 小雷诺曼 Petit Lenormand 主视图 · 钦天监·世界占卜典籍库 第三种
// 纯本地随机洗牌 + 编码好的古法读牌规则机械合参；不接任何 AI，不替人下最终判断。
import { $, escapeHtml as esc, toast } from './state.js?v=117';
import { LEN_CARDS, LEN_BY_N, significator, LEN_SOURCE } from './lendata.js?v=117';
import { lenIcon } from './lenicons.js?v=117';

export let lenormandCode = null;

const POS_3 = ['左 · 缘起 / 助力', '中 · 主题 / 当下', '右 · 走势 / 结果'];
const POS_5 = ['当下处境', '面临的障碍', '正在褪去的', '眼前这一步', '正在到来的'];
const POS_9 = [
  '左上 · 念头 / 将要来', '上中 · 当下的处境', '右上 · 助力 / 成果',
  '左中 · 过去 / 来源', '正中 · 核心主题', '右中 · 发展 / 未来',
  '左下 · 隐患 / 代价', '下中 · 落地 / 答案', '右下 · 结局 / 长远'
];

let state = {
  spread: 3, gender: 'm', question: '',
  mode: 'manual',               // v106：默认亲手抽牌（主人定调：尽可能让用户参与烹饪过程）；auto 自动抽牌为省事选项
  drawn: null,                  // 最终成阵的牌
  sig: 28,
  showGallery: false,
  pickDeck: null,               // 手动抽牌：牌堆（剩余）
  picked: [],                   // 手动抽牌：已抽
  revealing: null               // 翻牌阶段 {nums, flips}
};

const countOf = () => (state.spread === 36 ? 36 : state.spread);

// ---------- 洗牌 ----------
function shuffled() {
  const a = LEN_CARDS.map(c => c.n);
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

// ---------- 倾向五档 ----------
function verdictOf(score) {
  if (score >= 0.45) return { cls: 'v-good', t: '吉 · 顺势而为', d: '牌面明朗，多数牌象相互扶持，宜抓住势头、主动推进。' };
  if (score >= 0.16) return { cls: 'v-mild', t: '小吉 · 缓进可期', d: '整体偏正面，间有小阻，宜稳步、借势，不必冒进。' };
  if (score <= -0.45) return { cls: 'v-bad', t: '滞 · 宜守不宜进', d: '牌面阻滞较多，雷诺曼只呈当下之势；宜收束、规避、另待时机。' };
  if (score <= -0.16) return { cls: 'v-warn', t: '谨慎 · 多有周折', d: '障碍与变数偏多，须先处理隐患，重大决定宜缓。' };
  return { cls: 'v-flat', t: '平 · 吉凶未定', d: '牌象彼此牵制，势尚未定，取决于你接下来的选择。' };
}

// ---------- 牌面：Dondorf 印制 Gibson 版历史真图（1920s，wopc.co.uk 收藏扫描，36 张全套无水印）----------
const LN_IMG = (n) => `./assets/lenormand-gibson/len-${String(n).padStart(2, '0')}.jpg`;
function cardSVG(n, big) {
  return `<img class="ln-img ${big ? 'ln-img-big' : ''}" src="${LN_IMG(n)}" alt="${esc(LEN_BY_N[n].zh)}" loading="lazy" draggable="false"/>`;
}

// 单张牌（结果/牌阵里）
function cardHTML(n, pos, idx) {
  const c = LEN_BY_N[n];
  return `<button class="ln-card dv-cell" data-ln-card="${n}" data-ln-idx="${idx}">
    ${pos ? `<span class="ln-pos">${esc(pos)}</span>` : ''}
    <span class="ln-num">${c.n}</span>
    <span class="ln-skat">${c.skat}</span>
    <span class="ln-ic">${cardSVG(n)}</span>
    <span class="ln-name">${esc(c.zh)}</span>
  </button>`;
}

// 抽牌中空位
function slotHTML(pos, idx) {
  return `<button class="ln-card ln-slot" data-ln-pick="1" data-ln-idx="${idx}">
    ${pos ? `<span class="ln-pos">${esc(pos)}</span>` : ''}
    <span class="ln-slotmark">？</span><span class="ln-name ln-slotname">待抽</span></button>`;
}

// 相邻两牌古法组合
function pairNote(a, b) {
  const ca = LEN_BY_N[a], cb = LEN_BY_N[b];
  return `<span class="ln-pair">${esc(ca.zh)} <em>遇</em> ${esc(cb.zh)}：${esc(ca.kw[0])}之事，受「${esc(cb.kw[0])}」影响——${esc(cb.core)}</span>`;
}

function verdictHTML(v) {
  return `<div class="ln-verdict dv-verdict ${v.cls}"><span class="dv-arrow">◆</span>
    <div><div class="dv-title">${esc(v.t)}</div><div class="dv-detail">${esc(v.d)}</div></div></div>`;
}

function oneCardLine(n, pos) {
  const c = LEN_BY_N[n];
  return `<div class="ln-line"><div class="ln-line-h"><span class="ln-line-ic">${cardSVG(n)}</span>
    <span><b>${c.n}. ${esc(c.zh)}</b><span class="ln-line-pos">${esc(pos)}</span></span>
    <span class="ln-tag ${c.val > 0 ? 'tg-g' : c.val < 0 ? 'tg-b' : 'tg-n'}">${c.val > 0 ? '吉' : c.val < 0 ? '滞' : '中'}</span></div>
    <p class="ln-line-core">${esc(c.core)}</p><p class="ln-line-old">${esc(c.old)}</p></div>`;
}

function possArr() {
  return state.spread === 3 ? POS_3 : state.spread === 5 ? POS_5 : state.spread === 9 ? POS_9 : null;
}

// ---------- 线性牌阵（3 / 5） ----------
function readLinear(nums) {
  const poss = nums.length === 3 ? POS_3 : POS_5;
  let score = 0, wsum = 0;
  const w = nums.length === 3 ? [1, 2, 1] : [1, 1, 1, 2, 2];
  nums.forEach((n, i) => { score += LEN_BY_N[n].val * w[i]; wsum += w[i]; });
  const v = verdictOf(score / wsum);
  const cards = `<div class="ln-row ln-row${nums.length}">` + nums.map((n, i) => cardHTML(n, poss[i], i)).join('') + '</div>';
  let pairs = '<div class="ln-pairs"><div class="ln-blk-t">牌与牌之间（古法以相邻牌「名词＋修饰」连读）</div><div class="ln-pairlist">';
  for (let i = 0; i < nums.length - 1; i++) pairs += pairNote(nums[i], nums[i + 1]);
  pairs += '</div></div>';
  const detail = '<div class="ln-detail"><div class="ln-blk-t">逐张牌义</div>' + nums.map((n, i) => oneCardLine(n, poss[i])).join('') + '</div>';
  return { v, html: cards + pairs + detail + verdictHTML(v) };
}

// ---------- 9 宫 ----------
function readNine(nums) {
  const center = nums[4];
  let score = LEN_BY_N[center].val * 3, wsum = 3;
  [1, 2, 5, 8, 7, 6].forEach(i => { const w = (i === 2 || i === 5 || i === 8) ? 1.4 : 1; score += LEN_BY_N[nums[i]].val * w; wsum += w; });
  const v = verdictOf(score / wsum);
  const grid = '<div class="ln-grid9">' + nums.map((n, i) => cardHTML(n, POS_9[i], i)).join('') + '</div>';
  const cc = LEN_BY_N[center];
  const theme = `<div class="ln-nine-theme"><div class="ln-blk-t">正中主题牌</div>
    <div class="ln-nine-c"><span class="ln-line-ic">${cardSVG(center)}</span>
    <div><b>${cc.n}. ${esc(cc.zh)}</b><p>${esc(cc.core)}</p></div></div></div>`;
  const lines = '<div class="ln-pairs"><div class="ln-blk-t">对角（古法以斜线上的牌看贯穿之势）</div><div class="ln-pairlist">'
    + pairNote(nums[0], nums[4]) + pairNote(nums[4], nums[8])
    + pairNote(nums[2], nums[4]) + pairNote(nums[4], nums[6]) + '</div></div>';
  const detail = '<div class="ln-detail"><div class="ln-blk-t">逐张牌义</div>' + nums.map((n, i) => oneCardLine(n, POS_9[i])).join('') + '</div>';
  return { v, html: theme + grid + lines + detail + verdictHTML(v) };
}

// ---------- 大桌布 Grand Tableau（4×9 全 36 张） ----------
function readGT(nums) {
  const sigN = state.sig;
  const sIdx = nums.indexOf(sigN);
  const sr = Math.floor(sIdx / 9), sc = sIdx % 9;
  const above = [], below = [], left = [], right = [];
  nums.forEach((n, i) => {
    const r = Math.floor(i / 9), c = i % 9;
    if (r < sr) above.push(n);
    if (r > sr) below.push(n);
    if (r === sr && c < sc) left.push(n);
    if (r === sr && c > sc) right.push(n);
  });
  let score = 0, wsum = 0;
  nums.forEach((n, i) => {
    const r = Math.floor(i / 9), c = i % 9;
    let w = 1;
    if (c > sc) w += 0.6;
    if (r > sr) w += 0.4;
    score += LEN_BY_N[n].val * w; wsum += w;
  });
  const v = verdictOf(score / wsum);
  const keySpec = [[24, '心 · 感情'], [25, '戒指 · 承诺'], [27, '信 · 消息'], [1, '骑手 · 新消息'], [34, '鱼 · 财'], [33, '钥匙 · 解决'], [31, '太阳 · 成功'], [23, '鼠 · 损耗'], [8, '棺材 · 终结'], [21, '山 · 阻碍'], [36, '十字 · 重担']];
  const keys = keySpec.map(([kn, label]) => {
    const idx = nums.indexOf(kn);
    const kr = Math.floor(idx / 9), kc = idx % 9;
    const dist = Math.abs(kr - sr) + Math.abs(kc - sc);
    return { kn, label, dist, dir: kr < sr ? '上方' : kr > sr ? '下方' : kc < sc ? '左方' : '右方' };
  }).filter(k => k.kn !== sigN).sort((a, b) => a.dist - b.dist).slice(0, 6);

  let board = '<div class="ln-gt">';
  nums.forEach((n, i) => {
    const isSig = n === sigN, c = LEN_BY_N[n];
    board += `<button class="ln-gtc ${isSig ? 'ln-sig' : ''}" data-ln-card="${n}" data-ln-idx="${i}">
      <span class="ln-gtc-n">${c.n}</span><span class="ln-gtc-ic">${cardSVG(n)}</span>
      <span class="ln-gtc-z">${esc(c.zh)}</span></button>`;
  });
  board += '</div>';
  const sigC = LEN_BY_N[sigN];
  const zones = `<div class="ln-zones">
    <div class="ln-blk-t">求问者牌「${sigC.zh}」位于第 ${sr + 1} 行第 ${sc + 1} 列——古法以它为坐标读全盘</div>
    <div class="ln-zone"><b>上方（明处 · 正在影响）</b><span>${above.map(n => esc(LEN_BY_N[n].zh)).join('、') || '—'}</span></div>
    <div class="ln-zone"><b>下方（暗处 · 正在沉淀）</b><span>${below.map(n => esc(LEN_BY_N[n].zh)).join('、') || '—'}</span></div>
    <div class="ln-zone"><b>左方（过去 · 来路）</b><span>${left.map(n => esc(LEN_BY_N[n].zh)).join('、') || '—'}</span></div>
    <div class="ln-zone"><b>右方（未来 · 去向）</b><span>${right.map(n => esc(LEN_BY_N[n].zh)).join('、') || '—'}</span></div>
    <div class="ln-blk-t" style="margin-top:10px">关键牌距求问者（间隔越近越切要）</div>
    ${keys.map(k => `<div class="ln-zone"><b>${esc(k.label)}</b><span>${k.dir} · 相隔 ${k.dist} 格${k.dist <= 3 ? '（很近，切要）' : k.dist >= 8 ? '（较远，事缓）' : ''}</span></div>`).join('')}
    </div>`;
  const note = `<div class="ln-gtnote">大桌布源自 Hechtel 桌游的 6×6 棋盘，后世占卜多改为 4×9 横铺；这里用 4×9。原典为 6×6 走棋（#1 骑手起、#35 锚「希望」终），两种摆法同属一套 36 牌。</div>`;
  return { v, html: board + zones + note + verdictHTML(v) };
}

// ---------- 抽牌中（手动模式） ----------
function pickingHTML() {
  const total = countOf(), got = state.picked.length;
  const poss = possArr();
  const cell = (i) => i < got
    ? (state.spread === 36 ? gtCellHTML(state.picked[i], i) : cardHTML(state.picked[i], poss ? poss[i] : '', i))
    : (state.spread === 36 ? gtSlotHTML(i) : slotHTML(poss ? poss[i] : '', i));
  let grid;
  if (state.spread === 36) grid = `<div class="ln-gt">${[...Array(36)].map((_, i) => cell(i)).join('')}</div>`;
  else if (state.spread === 9) grid = `<div class="ln-grid9">${[...Array(9)].map((_, i) => cell(i)).join('')}</div>`;
  else grid = `<div class="ln-row ln-row${state.spread}">${[...Array(state.spread)].map((_, i) => cell(i)).join('')}</div>`;

  const remain = state.pickDeck.length;
  return `<div class="ln-picking">
    <div class="ln-pickbar">
      <button class="ln-deck" data-ln-pick="1" aria-label="从牌堆抽一张">
        <span class="ln-deckpat">✦</span>
        <span class="ln-decknum">余 ${remain}</span>
      </button>
      <div class="ln-pickinfo">
        <div class="ln-pickprog">已抽 <b>${got}</b> / ${total}</div>
        <div class="ln-pickhint">默念所问，点牌堆（或虚线空位）逐张抽牌${total === 36 ? '；36 张较多，也可一键铺满' : ''}</div>
      </div>
    </div>
    <div class="ln-pickactions">
      ${got < total ? `<button class="ln-fillbtn" data-ln-fill="1">${total === 36 ? '一键铺满 36 张' : '补齐剩余'}</button>` : ''}
      <button class="ln-resetbtn" data-ln-reset="1">重新洗牌</button>
    </div>
    ${grid}
  </div>`;
}
function gtCellHTML(n, i) {
  const isSig = n === state.sig, c = LEN_BY_N[n];
  return `<button class="ln-gtc ${isSig ? 'ln-sig' : ''}" data-ln-card="${n}" data-ln-idx="${i}">
    <span class="ln-gtc-n">${c.n}</span><span class="ln-gtc-ic">${cardSVG(n)}</span>
    <span class="ln-gtc-z">${esc(c.zh)}</span></button>`;
}
function gtSlotHTML(i) {
  return `<button class="ln-gtc ln-gtslot" data-ln-pick="1" data-ln-idx="${i}"><span class="ln-slotmark sm">？</span></button>`;
}

// ---------- 成阵 ----------
function readResult(nums) {
  if (state.spread === 36) return readGT(nums);
  if (state.spread === 9) return readNine(nums);
  return readLinear(nums);
}
function finalize(nums) {
  state.pickDeck = null;
  state.sig = significator(state.gender);
  state.revealing = { nums, flips: nums.map(() => false) };   // 幕二：牌背落阵，逐张手翻
  paintReveal();
}
function revealCount() { return state.revealing ? state.revealing.flips.filter(Boolean).length : 0; }
function revealDone() {
  const r = state.revealing; if (!r) return;
  state.drawn = r.nums; state.revealing = null;
  lenormandCode = lenCodeText(r.nums);
  toast('牌阵已成');
  paintResult((state.question ? `<div class="ln-q">所问：${esc(state.question)}</div>` : '') + readResult(r.nums).html);
}
function revealClick(idx) {
  const r = state.revealing; if (!r || r.flips[idx]) return;
  r.flips[idx] = true;
  const el = document.querySelector(`[data-ln-flip="${idx}"]`);
  if (el) { el.classList.add('flip'); el.removeAttribute('data-ln-flip'); el.setAttribute('data-ln-card', r.nums[idx]); }
  const cnt = $('#ln-reveal-count');
  if (cnt) cnt.textContent = `已翻 ${revealCount()} / ${r.nums.length}`;
  if (r.flips.every(Boolean)) setTimeout(revealDone, 450);
}
function revealAll() {
  const r = state.revealing; if (!r) return;
  let d = 0;
  r.nums.forEach((_, i) => { if (r.flips[i]) return; setTimeout(() => revealClick(i), d * 110); d++; });
}
function paintResult(inner) {
  const out = $('#ln-result');
  if (out) out.innerHTML = inner;
}
function paintPicking() {
  paintResult(pickingHTML());
}

// ---------- 开始 / 抽牌动作 ----------
function syncQuestion() {
  const input = $('#ln-question');
  if (input) state.question = input.value.trim();
}
function startDraw() {
  syncQuestion();
  state.sig = significator(state.gender);
  state.drawn = null;
  if (state.mode === 'manual') {
    state.pickDeck = shuffled();
    state.picked = [];
    paintPicking();
  } else {
    state.pickDeck = null;
    state.picked = [];
    finalize(shuffled().slice(0, countOf()));
  }
}
function pickOne() {
  if (!state.pickDeck) return;
  if (state.picked.length >= countOf()) return;
  state.picked.push(state.pickDeck.pop());
  if (state.picked.length >= countOf()) finalize(state.picked.slice());
  else paintPicking();
}
function fillAll() {
  if (!state.pickDeck) return;
  while (state.picked.length < countOf() && state.pickDeck.length) state.picked.push(state.pickDeck.pop());
  finalize(state.picked.slice());
}
function resetDraw() {
  state.drawn = null; state.pickDeck = null; state.picked = []; state.revealing = null;
  paintResult('');
}

// ---------- 幕二：牌背落阵 · 逐张手翻 ----------
function revealCell(i) {
  const r = state.revealing;
  const n = r.nums[i], flipped = r.flips[i];
  const c = LEN_BY_N[n];
  const poss = possArr();
  const label = poss ? poss[i] : `${Math.floor(i / 9) + 1}行${i % 9 + 1}列`;
  const cls = state.spread === 36 ? 'gts' : '';
  const inner = flipped
    ? `<span class="fcb-face"><img src="${LN_IMG(n)}" alt="${esc(c.zh)}" draggable="false"/><span class="fcb-label">${c.n} ${esc(c.zh)}</span></span>`
    : `<span class="fcb-face"><span class="fcb-hint">翻开</span></span>`;
  return `<button class="fcb ${cls} ${flipped ? 'flip' : ''}" ${flipped ? `data-ln-card="${n}"` : `data-ln-flip="${i}"`} aria-label="${flipped ? esc(c.zh) : '点击翻开'}">
    <span class="fcb-inner">
      <span class="fcb-back"></span>
      ${inner}
    </span>
    <span class="tr-slotname" style="font-size:10px;color:#8a94ac;margin-top:3px;text-align:center;line-height:1.25">${esc(label)}</span>
  </button>`;
}
function revealHTML() {
  const r = state.revealing, total = r.nums.length, got = revealCount();
  const grid = `<div class="fcb-wrap">${[...Array(total)].map((_, i) => revealCell(i)).join('')}</div>`;
  const allDone = got >= total;
  return `<div class="ln-reveal glass-card">
    <div class="tr-reveal-head">牌已落阵 · 都还扣着</div>
    <div class="fcb-count" id="ln-reveal-count">已翻 ${got} / ${total} · 逐张点牌翻开${total === 36 ? '，或一键全开' : ''}</div>
    <div class="fcbbar">
      <button type="button" data-ln-flipall="1" ${allDone ? 'disabled' : ''}>全部翻开</button>
      <button type="button" data-ln-reset="1">重新洗牌</button>
    </div>
    ${grid}
  </div>`;
}
function paintReveal() { paintResult(revealHTML()); }

// ---------- 弹层（动态挂 body，复用全局 .tip-sheet/.tip-card） ----------
function ensureSheet() {
  if (document.getElementById('ln-sheet')) return;
  const el = document.createElement('div');
  el.className = 'tip-sheet';
  el.id = 'ln-sheet';
  el.innerHTML =
    '<div class="tip-mask" data-ln-close></div>' +
    '<div class="tip-card" role="dialog" aria-modal="true">' +
      '<div class="tip-head"><span class="tip-kicker">雷诺曼牌</span><span class="tip-term" id="ln-term"></span>' +
      '<button class="tip-x" type="button" data-ln-close aria-label="关闭">✕</button></div>' +
      '<div class="tip-body" id="ln-body"></div></div>';
  document.body.appendChild(el);
}
function openCard(n) {
  const c = LEN_BY_N[n];
  ensureSheet();
  $('#ln-term').textContent = `${c.n} · ${c.zh} · ${c.en}`;
  const valTag = c.val > 0 ? '<span class="tg-g">吉</span>' : c.val < 0 ? '<span class="tg-b">滞</span>' : '<span class="tg-n">中</span>';
  $('#ln-body').innerHTML = `<div class="lnf-head"><div class="lnf-ic">${cardSVG(n, true)}</div>
    <div class="lnf-meta">
      <div class="lnf-names"><b>${c.n}. ${esc(c.zh)}</b> ${valTag}</div>
      <div class="lnf-sub">${esc(c.de)} · ${esc(c.en)}</div>
      <div class="lnf-skat">牌面扑克：${c.skat}</div>
    </div></div>
    <div class="lnf-sec"><div class="ln-blk-t">关键词</div><div class="lnf-kws">${c.kw.map(k => `<span class="lnf-kw">${esc(k)}</span>`).join('')}</div></div>
    <div class="lnf-sec"><div class="ln-blk-t">传统牌义</div><p>${esc(c.core)}</p></div>
    <div class="lnf-sec"><div class="ln-blk-t">1799 桌游本义 / 古法</div><p class="ln-line-old">${esc(c.old)}</p></div>`;
  $('#ln-sheet').classList.add('open');
}
function closeSheet() { const s = $('#ln-sheet'); if (s) s.classList.remove('open'); }

// ---------- 主渲染 ----------
export function renderLenormand() {
  return `<div class="ln-wrap">
    <div class="glass-card ln-intro">
      <h2>小雷诺曼 · Petit Lenormand</h2>
      <p class="ln-sub">36 张牌的欧陆纸牌占卜。心中默念所问，洗牌、抽牌，按位置与相邻牌连读。</p>
      <div class="ln-hist">
        <p><b>它与「勒诺曼女士」无关。</b>历史上的 Marie-Anne Lenormand（1772–1843）是拿破仑时代巴黎名占卜师，但这套牌并非她所作。底本是纽伦堡人 <b>Johann Kaspar Hechtel</b> 于约 <b>1799</b> 年出版的桌游《<b>希望游戏 Das Spiel der Hoffnung</b>》——36 张牌摆 6×6 棋盘、掷两枚骰走棋（#1 骑手起、#35 锚「希望」终，#8 棺材、#36 十字为困格），牌面上半兼印德式扑克牌。她死后出版商借其名号改成占卜牌，风行19世纪欧洲。</p>
        <p class="ln-readm">读法：牌义<b>没有逆位</b>，不靠单牌、而靠<b>相邻牌「名词＋修饰词」连读造句</b>；具体取舍由所问决定。用全部36张者称「大桌布 Grand Tableau」。</p>
      </div>
    </div>

    <div class="glass-card ln-ctl">
      <label class="ln-qlabel">所问（可留空）
        <input id="ln-question" class="ln-qinput" type="text" maxlength="40" placeholder="例：这份新工作值不值得去？" value="${esc(state.question)}"/>
      </label>
      <div class="ln-ctlrow">
        <div class="ln-seg" id="ln-gender">
          <button data-ln-gender="m" class="${state.gender === 'm' ? 'on' : ''}">为男士占</button>
          <button data-ln-gender="f" class="${state.gender === 'f' ? 'on' : ''}">为女士占</button>
        </div>
      </div>
      <div class="ln-ctlrow"><span class="ln-grp">牌阵</span>
        <div class="ln-seg ln-spreads" id="ln-spread">
          <button data-ln-spread="3" class="${state.spread === 3 ? 'on' : ''}">三牌</button>
          <button data-ln-spread="5" class="${state.spread === 5 ? 'on' : ''}">五牌</button>
          <button data-ln-spread="9" class="${state.spread === 9 ? 'on' : ''}">九宫</button>
          <button data-ln-spread="36" class="${state.spread === 36 ? 'on' : ''}">大桌布 36</button>
        </div>
      </div>
      <div class="ln-ctlrow"><span class="ln-grp">抽法</span>
        <div class="ln-seg ln-modes" id="ln-mode">
          <button data-ln-mode="auto" class="${state.mode === 'auto' ? 'on' : ''}">自动抽牌</button>
          <button data-ln-mode="manual" class="${state.mode === 'manual' ? 'on' : ''}">亲手抽牌</button>
        </div>
      </div>
      <button class="ln-castbtn" id="ln-draw">${state.mode === 'manual' ? '🜨 洗牌 · 开始抽牌' : '🜨 洗牌 · 自动抽牌'}</button>
    </div>

    <div id="ln-result" class="ln-result"></div>

    <div class="glass-card ln-gal">
      <button class="ln-galtoggle" id="ln-galtoggle">${state.showGallery ? '▾ 收起 36 牌图鉴' : '▸ 展开 36 牌图鉴（牌名 · 扑克 · 牌义）'}</button>
      <div class="ln-galbody" ${state.showGallery ? '' : 'hidden'}>
        <div class="ln-galgrid">${LEN_CARDS.map(c => `
          <button class="ln-galcard" data-ln-card="${c.n}">
            <span class="ln-gnum">${c.n}</span><span class="ln-gskat">${c.skat}</span>
            <span class="ln-gic">${cardSVG(c.n)}</span>
            <span class="ln-gname">${esc(c.zh)}</span>
          </button>`).join('')}
        </div>
        <p class="ln-src">牌名、牌序（1–36）、牌面扑克（红桃/方块/梅花/黑桃 6–A）与传统关键词属公有领域，据 Hechtel 1799《希望游戏》及19世纪德、法、英通行的小雷诺曼传统编排；「现代引申」与古法分层标出。${esc(LEN_SOURCE.pd)}。</p>
      </div>
    </div>
  </div>`;
}

// ---------- 复制 ----------
function lenCodeText(drawn) {
  const q = state.question ? `所问：${state.question}\n` : '';
  const spreadName = state.spread === 36 ? '大桌布' : state.spread === 9 ? '九宫' : `${state.spread}牌阵`;
  const poss = possArr();
  return `【钦天监·小雷诺曼 ${spreadName}】\n${q}` +
    drawn.map((n, i) => {
      const c = LEN_BY_N[n];
      return `${i + 1}. ${c.n} ${c.zh}（${c.skat}）${poss ? ' ' + poss[i].split(' · ')[0] : ''}`;
    }).join('\n') +
    `\n（小雷诺曼据 Hechtel 约1799《希望游戏》，借勒诺曼名号传世；牌义无逆位，相邻牌连读。结论为机械古法合参，取舍由人。）`;
}
export function lenormandCopyText() {
  if (!state.drawn) {
    toast('先洗牌铺牌');
    return '钦天监 · 小雷诺曼（尚未成阵）';
  }
  return lenCodeText(state.drawn);
}

// ---------- 重渲染并恢复结果区 ----------
function rerender() {
  // 三合一：雷诺曼可能显示在 view-tarot 的 #tarot-body 里（catBar 分流），
  // 也可能在独立的 #lenormand-body。必须写进「当前可见」的那个容器，
  // 否则交互会刷新到隐藏容器，界面看起来完全没反应（v100 真机 bug）。
  const cands = [$('#lenormand-body'), $('#tarot-body'), $('#ln-root')].filter(Boolean);
  let body = cands.find((el) => el.closest && el.closest('.view.active'));
  if (!body) body = cands[0];
  if (!body) return;
  body.innerHTML = renderLenormand();
  // 恢复输入焦点内容已在模板 value 中；恢复进行中/翻牌中/已成阵的结果区
  if (state.pickDeck) paintPicking();
  else if (state.revealing) paintReveal();
  else if (state.drawn) paintResult((state.question ? `<div class="ln-q">所问：${esc(state.question)}</div>` : '') + readResult(state.drawn).html);
}

// ---------- 事件：document 委托（弹层挂在 body） ----------
export function initLenormand() {
  document.addEventListener('click', (e) => {
    const close = e.target.closest('[data-ln-close]');
    if (close) { closeSheet(); return; }
    const card = e.target.closest('[data-ln-card]');
    if (card) { openCard(parseInt(card.getAttribute('data-ln-card'), 10)); return; }
    const fl = e.target.closest('[data-ln-flip]');
    if (fl) { revealClick(parseInt(fl.getAttribute('data-ln-flip'), 10)); return; }
    if (e.target.closest('[data-ln-flipall]')) { revealAll(); return; }
    const pick = e.target.closest('[data-ln-pick]');
    if (pick) { pickOne(); return; }
    const fill = e.target.closest('[data-ln-fill]');
    if (fill) { fillAll(); return; }
    const reset = e.target.closest('[data-ln-reset]');
    if (reset) { resetDraw(); return; }
    const draw = e.target.closest('#ln-draw');
    if (draw) { startDraw(); return; }
    const gal = e.target.closest('#ln-galtoggle');
    if (gal) { state.showGallery = !state.showGallery; rerender(); return; }
    const g = e.target.closest('[data-ln-gender]');
    if (g) { syncQuestion(); state.gender = g.getAttribute('data-ln-gender'); rerender(); return; }
    const md = e.target.closest('[data-ln-mode]');
    if (md) { syncQuestion(); state.mode = md.getAttribute('data-ln-mode'); resetDraw(); rerender(); return; }
    const sp = e.target.closest('[data-ln-spread]');
    if (sp) { syncQuestion(); state.spread = parseInt(sp.getAttribute('data-ln-spread'), 10); resetDraw(); rerender(); }
  });
  document.addEventListener('input', (e) => {
    if (e.target && e.target.id === 'ln-question') state.question = e.target.value;
  });
}
