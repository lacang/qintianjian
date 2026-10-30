// 塔罗 · 典籍库视图  钦天监·世界占卜典籍库
// v92：主体改为通行标准的韦特塔罗 RWS（1909 Rider–Waite–Smith，美国公有领域）。
//      78 张原版牌面本地内置（复用 vendor/liuyao-core 的 rws 牌组数据，不自行绘制），
//      画面描述 scene 与牌图严格对应；正/逆位中性牌义 + Waite 1910《Pictorial Key》原判词。
//      综合倾向由 tarotval_rws 的传统倾向惯例表机械合参，非命定；流派/史实分层，不接 AI。
import { $, escapeHtml as esc, toast } from './state.js?v=122';
import { getDeck, listDecks, BUILTIN_SPREADS } from '../vendor/liuyao-core.js?v=122';
import { rwsVal } from './tarotval_rws.js?v=122';
import { ensureSolaBusca } from './tarotdeck-sb.js?v=122';
import { ensureHistDecks } from './tarotdeck-hist.js?v=122';
ensureSolaBusca();
ensureHistDecks();

export let tarotCode = null;

const DECK_SHORT = {
  rws: '韦特 RWS·1909', sb: '索拉·布斯卡·1491',
  marseille: '马赛塔罗', vieville: '维埃维尔·1650', visconti: '维斯康提·1450', wirth: '维尔大牌·1889',
};
const HIST_SRC = {
  marseille: '牌面：经典马赛塔罗木刻版扫描（Wikimedia Commons，Public Domain；文件级溯源见 assets/cards-hist-manifest.json）。',
  vieville: '牌面：维埃维尔塔罗约 1650（巴黎国立图书馆藏，Public Domain；文件级溯源见 assets/cards-hist-manifest.json）。',
  visconti: '牌面：维斯康提-斯福尔扎塔罗约 1450–1470（AGMuller 复刻扫描，Public Domain；文件级溯源见 assets/cards-hist-manifest.json）。',
  wirth: '牌面：奥斯瓦尔德·维尔塔罗 1889（Public Domain；文件级溯源见 assets/cards-hist-manifest.json）。',
};
// v121：复制文本按实际牌组给出牌面出处（原先 6 副牌组里 4 副被误标「韦特」、且硬编码 RWS 1909）
const DECK_SRC = {
  rws: '牌面：韦特塔罗 RWS 1909 原版（美国公有领域）；牌义判词：Waite 1910《Pictorial Key to the Tarot》。',
  sb: '牌面：索拉·布斯卡塔罗 1491（米兰 Brera 美术馆藏原版真图，Public Domain）；牌义判词为现代通行对照。',
};
const HIST_NOTE = '牌义判词为 Waite 1910 现代对照。';
function deckSrc(id) { return DECK_SRC[id] || (HIST_SRC[id] ? HIST_SRC[id] + HIST_NOTE : ''); }
const DECK_SUB = {
  marseille: '所有现代塔罗的直系祖先（17–18 世纪木刻+stencil 上色）。小牌只画花色符号排列、不画场景——韦特之前全世界都这么画。大牌为历史序（VIII 正义、XI 力量），本页按牌面语义映射到韦特义位。牌义判词为 Waite 1910 现代对照。',
  vieville: '现存最早完整巴黎系塔罗（约 1650）。图式比马赛更古拙：愚人被狗追、月亮下两工匠。大牌为巴黎老序（VII 正义、IX 力量、XI 隐士），按牌面语义映射。牌义判词为 Waite 1910 现代对照。',
  visconti: '世上最古老塔罗之一（约 1450–1470，米兰公爵婚礼级手绘金卡，Bembo）。存世 73 张：恶魔、塔、钱币骑士、宝剑三、圣杯国王已佚，抽牌池少 5 张、成阵照常。牌义判词为 Waite 1910 现代对照。',
  wirth: '玫瑰十字会神秘学复刻马赛（1889，巴黎）：只画 22 张大牌，线条承马赛而图式带卡巴拉意图，是「神秘学塔罗」先声（早韦特二十年）。本副抽牌池仅 22 张大牌。牌义判词为 Waite 1910 现代对照。',
};
const DECK_KEY = 'qintian.tarot.deck';
function curDeckId() { try { return localStorage.getItem(DECK_KEY) || 'rws'; } catch { return 'rws'; } }
const deck = () => { ensureSolaBusca(); ensureHistDecks(); return getDeck(curDeckId()); };
const cards = () => deck().cards;
const byId = () => {
  if (!deck()._by) deck()._by = Object.fromEntries(deck().cards.map(c => [c.id, c]));
  return deck()._by;
};

// v108：牌阵全部改由 liuyao-core 的 BUILTIN_SPREADS 坐标数据驱动（M7 留的 9 经典阵：
// 单张日抽/三牌时间流/三牌现状建议结果/凯尔特十字/六芒星/关系双人/二择一/周运七牌/十二宫）。
// positions 归一化坐标直接驱动牌桌槽位与结果页阵图，新增牌阵只加数据不改引擎。
const TAROT_SPREADS = BUILTIN_SPREADS.filter(s => s.deckKinds && s.deckKinds.includes('tarot'));
const spreadObj = () => TAROT_SPREADS.find(s => s.id === state.spread) || TAROT_SPREADS[0];
const countOf = () => spreadObj().count;
const possArr = () => spreadObj().positions.map(p => p.label);
// 数据坐标 y∈[12,90] 压进牌桌 canvas 安全区（顶部 12% ~ 展牌区上方 8%）
const MAP_Y = y => 10 + (y - 8) * 0.66;
const TABLE_POS = () => spreadObj().positions.map(p => ({ x: p.x, y: MAP_Y(p.y), rot: p.rotate || 0, meaning: p.meaning }));
const LAYOUT_KEY = 'qintian.tarot.layout';
function curLayout() {
  try {
    const v = localStorage.getItem(LAYOUT_KEY) || 'fan';
    // v115 拱桥已撤下，旧用户若存了 bridge 回落到扇面
    return v === 'bridge' ? 'fan' : v;
  } catch { return 'fan'; }
}
const GROUPS = ['大阿尔卡那', '权杖', '圣杯', '宝剑', '星币'];

let state = {
  spread: 'three-time', question: '',
  useRev: true,
  mode: 'manual',
  layout: curLayout(),          // v108 展牌三式：stack 牌堆（可切牌）| fan 手上扇面 | bridge 赌神拱桥
  drawn: null,                  // [{id, rev}] 全部翻开后才成阵
  showGallery: false,
  showHist: false,
  pickDeck: null,               // 剩余待抽牌栈（切牌/抽出会真实改变它）
  picked: [],                   // 已落位的牌（按落位顺序）
  phase: null,                  // shuffling | table | revealing
  shufT: null,                  // 洗牌动画计时器
  revealing: null,              // { draw:[{id,rev}], flips:[bool] } 翻牌阶段
  tableSlots: null,             // 牌桌：按槽位下标存放的已落位牌（稀疏）
  tableFlip: null,              // 牌桌：各槽位是否已翻开
  tableUnbind: null,            // 牌桌事件解绑
  fanShift: 0,                  // 扇面整副角位移（deg）
  tablePick: null               // v110：点选待拖的牌 {idx}（只探出，不飞出）
};


// ---------- 洗牌（78 张，带随机正逆） ----------
function shuffled() {
  const dk = deck();
  const useRev = state.useRev && dk.allowsReversal;
  const a = dk.cards.map(c => ({ id: c.id, rev: useRev && !!c.reversible && Math.random() < 0.5 }));
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

// ---------- 倾向五档（传统倾向惯例表机械合参） ----------
function verdictOf(score) {
  if (score >= 0.8) return { cls: 'v-good', t: '吉 · 势头明朗', d: '牌象相互扶持，倾向积极，宜顺势主动。塔罗所示为当下之势与功课，非定命。' };
  if (score >= 0.25) return { cls: 'v-mild', t: '小吉 · 缓进可期', d: '整体偏正面，间有阻滞，宜稳步推进、留意提示的功课。' };
  if (score <= -0.8) return { cls: 'v-bad', t: '滞 · 宜守待时', d: '牌象呈阻滞或收束之象，宜谨慎、先理隐患、另待时机。' };
  if (score <= -0.25) return { cls: 'v-warn', t: '谨慎 · 多有周折', d: '变数与牵绊偏多，重大决定宜缓，先看清局面。' };
  return { cls: 'v-flat', t: '平 · 吉凶未定', d: '牌象彼此牵制，走向取决于你接下来的选择，勿急于下定论。' };
}

// ---------- 牌面（原版真图） ----------
function revMark(d) { return d.rev ? '<span class="tr-revtag">逆</span>' : ''; }
function cardHTML(d, pos, idx, extra) {
  const c = byId()[d.id];
  return `<button class="tr-card dv-cell ${d.rev ? 'tr-rev' : ''} ${extra || ''}" data-tr-card="${c.id}" data-tr-idx="${idx}">
    <span class="tr-pos">${esc(pos)}</span>
    <img class="tr-img" src="${esc(c.image)}" alt="${esc(c.name)}" loading="lazy" draggable="false"/>
    <span class="tr-name">${esc(c.name)}</span>${revMark(d)}</button>`;
}
function slotHTML(pos, idx, extra) {
  return `<button class="tr-card tr-slot ${extra || ''}" data-tr-pick="1" data-tr-idx="${idx}">
    <span class="tr-pos">${esc(pos)}</span><span class="tr-slotmark">？</span><span class="tr-name tr-slotname">待抽</span></button>`;
}
function verdictHTML(v) {
  return `<div class="tr-verdict dv-verdict ${v.cls}"><span class="dv-arrow">◆</span>
    <div><div class="dv-title">${esc(v.t)}</div><div class="dv-detail">${esc(v.d)}</div></div></div>`;
}

// 单张逐义
function oneCardLine(d, pos) {
  const c = byId()[d.id];
  const m = c.meaning || {};
  const val = rwsVal(c.id, d.rev);
  const valTag = val > 0.25 ? '<span class="tg-g">偏吉</span>' : val < -0.25 ? '<span class="tg-b">偏滞</span>' : '<span class="tg-n">中性</span>';
  const head = state.useRev && d.rev ? '逆位 · 传统义' : '正位 · 传统义';
  const arr = state.useRev && d.rev ? (m.reversed || m.upright) : m.upright;
  return `<div class="tr-line"><div class="tr-line-h"><img class="tr-line-img ${d.rev ? 'is-rev' : ''}" src="${esc(c.image)}" alt=""/>
    <span><b>${esc(c.name)}</b> <span class="tr-alt">${esc(c.nameAlt || '')}</span><span class="tr-line-pos">${esc(pos)}</span></span>
    <span class="tr-line-tags">${valTag}${state.useRev && d.rev ? '<span class="tg-n">逆位</span>' : ''}</span></div>
    <p class="tr-line-icon"><em>牌上所见：</em>${esc(m.scene || '')}</p>
    <p class="tr-line-mean"><em>${head}：</em>${(arr || []).map(esc).join('；')}。</p>
    ${m.classicText ? `<p class="tr-line-old"><em>Waite 1910 原判词：</em>${esc(m.classicText)}</p>` : ''}</div>`;
}

// ---------- 日抽 ----------
function readOne(draw) {
  const pos = possArr()[0];
  const d = draw[0], c = byId()[d.id];
  const v = verdictOf(rwsVal(c.id, d.rev));
  return { v, html: `<div class="tr-row tr-row1">${cardHTML(d, pos, 0)}</div>` +
    `<div class="tr-detail"><div class="tr-blk-t">牌义与画面</div>${oneCardLine(d, pos)}</div>` + verdictHTML(v) };
}

// ---------- 三牌（时间流 / 现状·建议·结果 双阵共用，位置名随牌阵） ----------
function readThree(draw) {
  const poss = possArr();
  const w = [1, 2, 1];
  let score = 0, ws = 0;
  draw.forEach((d, i) => { score += rwsVal(d.id, d.rev) * w[i]; ws += w[i]; });
  const v = verdictOf(score / ws);
  const [a, b, cc] = draw.map(d => byId()[d.id]);
  const nm = i => `${byId()[draw[i].id].name}${state.useRev && draw[i].rev ? '（逆）' : ''}`;
  const chain = state.spread === 'three-guidance'
    ? `<div class="tr-pairs"><div class="tr-blk-t">一条线索</div>
      <p class="tr-chain">「${esc(a.name)}」所示的现状下，「${esc(b.name)}」给出可参考的方向，若依此而行，趋向「${esc(cc.name)}」所示的结果。三张牌的张力比单张更要紧。</p></div>`
    : `<div class="tr-pairs"><div class="tr-blk-t">一条线索（时间流）</div>
      <p class="tr-chain">由「${esc(nm(0))}」起，落到当下的「${esc(nm(1))}」，趋向「${esc(nm(2))}」。三张牌的张力比单张更要紧。</p></div>`;
  return { v, html: `<div class="tr-row tr-row3">${draw.map((d, i) => cardHTML(d, poss[i], i)).join('')}</div>` +
    chain + `<div class="tr-detail"><div class="tr-blk-t">逐张牌义</div>${draw.map((d, i) => oneCardLine(d, poss[i])).join('')}</div>` + verdictHTML(v) };
}

// ---------- 凯尔特十字（专用经典版式，第二张横压） ----------
function readCross(draw) {
  const poss = possArr();
  const w = [2, 1.4, 1, 1, 1, 1.4, 1, 1, 1, 2.2];
  let score = 0, ws = 0;
  draw.forEach((d, i) => { score += rwsVal(d.id, d.rev) * w[i]; ws += w[i]; });
  const v = verdictOf(score / ws);
  const central = `<div class="tr-cross-c">
      <div class="tr-cross-stack">${cardHTML(draw[0], poss[0], 0, 'tr-c1')}${cardHTML(draw[1], poss[1], 1, 'tr-c2')}</div>
      <div class="tr-cross-below">${[2,3,4,5].map(i => cardHTML(draw[i], poss[i], i)).join('')}</div></div>`;
  const staff = `<div class="tr-cross-s">${[6,7,8,9].map(i => cardHTML(draw[i], poss[i], i)).join('')}</div>`;
  const key = (i, label) => { const c = byId()[draw[i].id]; return `<div class="tr-zone"><b>${esc(label)}</b><span>${esc(c.name)}${state.useRev && draw[i].rev ? '（逆）' : ''}</span></div>`; };
  const zones = `<div class="tr-zones"><div class="tr-blk-t">凯尔特十字 · 四个切要位置</div>
    ${key(0, '现状')}${key(1, '横置 · 阻碍/助力')}${key(5, '近未来')}${key(9, '最终结果')}
    <p class="tr-crossnote">第二张横置于现状牌之上，传统作"阻碍或助力"，读其与现状牌的关系；此为通行机械读法，取舍由人。</p></div>`;
  return { v, html: `<div class="tr-cross">${central}${staff}</div>` + zones +
    `<div class="tr-detail"><div class="tr-blk-t">逐位牌义</div>${draw.map((d, i) => oneCardLine(d, poss[i])).join('')}</div>` + verdictHTML(v) };
}

// ---------- v108 通用坐标阵（六芒星/关系/二择一/周运/十二宫）：归一化阵图 + 逐位牌义 ----------
function readGeneric(draw) {
  const sp = spreadObj(), poss = possArr();
  let score = 0;
  draw.forEach(d => { score += rwsVal(d.id, d.rev); });
  const v = verdictOf(score / draw.length);
  const boardH = sp.count >= 12 ? 430 : 300;
  const cell = sp.count >= 12 ? 44 : 60;
  const cells = sp.positions.map((p, i) => {
    const d = draw[i], c = byId()[d.id];
    return `<button class="trb-cell ${d.rev ? 'tr-rev' : ''}" style="left:${p.x}%;top:${p.y}%;--cw:${cell}px${p.rotate ? `;transform:translate(-50%,-50%) rotate(${p.rotate}deg)` : ''}" data-tr-card="${c.id}">
      <img src="${esc(c.image)}" alt="${esc(c.name)}" loading="lazy" draggable="false"/>
      <span class="trb-lab">${esc(p.label)}</span></button>`;
  }).join('');
  return { v, html: `<div class="tr-board" style="height:${boardH}px">${cells}</div>` +
    `<div class="tr-detail"><div class="tr-blk-t">${esc(sp.name)} · 逐位牌义</div>${draw.map((d, i) => oneCardLine(d, poss[i])).join('')}</div>` + verdictHTML(v) };
}

function readResult(draw) {
  const n = countOf();
  if (n === 1) return readOne(draw);
  if (n === 3) return readThree(draw);
  if (state.spread === 'celtic-cross') return readCross(draw);
  return readGeneric(draw);
}

// ---------- v108 占星猫式牌桌：全屏星绒桌 · 三种展牌形式 · 拖拽落位 · 点牌 3D 翻开 ----------
// 槽位淡虚线水印给位置语义（坐标取自 BUILTIN_SPREADS），落位随机微旋；可拖任意空槽。
// 展牌三式（右下角圆钮切换）：stack 牌堆（点一下切牌、按住拖牌）/ fan 手上扇面（固定圆心、
// 整扇刚体横拖、点牌抽出）/ bridge 赌神拱桥（长列横拖浏览、点牌抽出）。
// v115：展牌两式：stack 牌堆（点一下有切牌动画、按住拖牌）| fan 手上扇面（整扇刚体横拖、点牌抽出）。
// 原 bridge 赌神拱桥主人要求撤下。
const LAYOUTS = [
  { id: 'stack',  name: '牌堆' },
  { id: 'fan',    name: '扇面' },
];
const tablePlaced = () => state.tableSlots.filter(Boolean).length;
function cardW(n) {
  const vw = Math.min(window.innerWidth || 390, 560);
  const px = n <= 3 ? Math.min(86, vw * .24) : n <= 7 ? Math.min(58, vw * .155) : Math.min(46, vw * .125);
  return { css: px + 'px', px: Math.round(px) };
}
function tableHTML() {
  const n = countOf(), anchors = TABLE_POS(), poss = possArr();
  const { css: cw, px: cwPx } = cardW(n);
  const slots = anchors.map((an, i) => {
    const used = state.tableSlots[i];
    if (used) {
      const c = byId()[used.id], flipped = !!state.tableFlip[i];
      const rot = flipped ? (an.rot || 0) : (used._rot || 0);
      return `<div class="trt-slot trt-filled ${flipped ? 'is-flip' : ''}" style="left:${an.x}%;top:${an.y}%;--rot:${rot}deg" data-trt-slot="${i}">
        <span class="fcb trt-card ${flipped ? 'flip' : ''}">
          <span class="fcb-inner">
            <span class="fcb-back trt-back trpc"></span>
            <span class="fcb-face ${used.rev ? 'trt-revface' : ''}"><img src="${esc(c.image)}" alt="${esc(c.name)}" draggable="false"/></span>
          </span>
        </span>
        <span class="trt-poslabel">${esc(poss[i])}</span></div>`;
    }
    return `<div class="trt-slot" style="left:${an.x}%;top:${an.y}%;--rot:${an.rot || 0}deg" data-trt-slot="${i}">
      <span class="trt-slotmark ${an.rot ? 'is-h' : ''}"></span><span class="trt-poslabel">${esc(poss[i])}</span></div>`;
  }).join('');
  const placed = tablePlaced(), full = placed >= n, flipped = state.tableFlip.filter(Boolean).length;
  const allFlip = full && flipped >= n;
  const layoutName = (LAYOUTS.find(l => l.id === state.layout) || LAYOUTS[1]).name;
  const hint = !full ? `点选一张牌，亲手拖到发光的位置 · ${placed}/${n}（展牌：${layoutName}）`
    : !allFlip ? `牌已放好，点桌面上的牌逐张翻开（已翻 ${flipped}/${n}）`
    : '牌已全部翻开 · 开牌解局';

  // ----- 展牌区 -----
  const m = state.pickDeck ? state.pickDeck.length : 0;
  let stage;
  const pk = state.tablePick;
  if (state.layout === 'fan') {
    // v110/v112：基角 0=中牌竖直向上，圆心=底部正中；只画 ±72° 弧内的牌，其余左右滑出
    // v115：主人定——选中只「轻轻抬起」一点（7vh/上限46px），且保持该牌自身扇面角度不变
    const R = Math.round(Math.min((window.innerHeight || 700) * .22, cwPx * 1.35));
    const pickLift = Math.min(46, Math.round((window.innerHeight || 700) * .07));
    const dA = 2.1, mid = (m - 1) / 2, sh = state.fanShift || 0;
    const items = state.pickDeck.map((_, i) => {
      const a = (i - mid) * dA + sh;
      if (a < -72 || a > 72) return '';
      const cls = 'trf-item' + (pk && pk.idx === i ? ' is-pick' : '');
      return `<span class="${cls}" data-pidx="${i}" style="--a:${a.toFixed(2)}deg;--R:${R}px"><span class="trf-card trpc"></span></span>`;
    }).join('');
    stage = `<div class="trt-stage trt-stage-fan" id="trt-fan" style="--cw:${cw};--pick-lift:${pickLift}px">${items}
      <div class="trt-stage-label">点一张牌选它（轻轻抬起）· 拖到发光位置；空白处左右滑动整副</div></div>`;
  } else {
    const topCls = 'trt-stacktop trpc' + (pk ? ' is-pick' : '');
    stage = `<div class="trt-stage trt-stage-stack" id="trt-stack-stage" style="--cw:${cw}">
      <div class="trt-stack" id="trt-stack">
        <span class="trt-stackc trpc"></span><span class="trt-stackc trpc"></span><span class="trt-stackc trpc"></span><span class="${topCls}"></span>
      </div>
      <div class="trt-stage-label">${full ? '已放满' : '点牌堆切牌（一张牌从上面切到底下）· 把牌拖到发光位置'}</div></div>`;
  }

  const autoBtn = state.mode === 'auto' && !full
    ? '<button class="trt-flipallbtn" id="trt-autodraw">🜨 自动抽牌</button>' : '';

  return `<div class="tr-table" id="tr-table" style="--trt-w:${cw}">
    <button class="trt-exit" id="trt-menu" aria-label="牌桌设置">☰</button>
    <div class="trt-topbar">${state.question ? esc(state.question) : '深呼吸，在心里默念你要问的事'}</div>
    <button class="trt-reshuffle" data-tr-reshuffle aria-label="重新发牌">↺</button>
    <div class="trt-canvas" id="trt-canvas"><div class="trt-moon">🌙</div>${slots}</div>
    <div class="trt-hint"><span>${hint}</span></div>
    <div class="trt-stagepos" id="trt-stagepos">
      ${allFlip ? '<button class="trt-readbtn" id="trt-read">☯ 开牌解局</button>'
        : full ? '<button class="trt-flipallbtn" id="trt-flipall">✦ 全部翻开</button>'
        : (autoBtn || stage)}
    </div>
    <button class="trt-roundbtn trt-layoutbtn" id="trt-layout" aria-label="切换展牌形式"><span>⇄</span><small>${layoutName}</small></button>
    <div class="trt-drag" id="trt-drag" hidden><div class="trt-dragcard trpc"></div></div>
  </div>`;
}

// v109：牌桌设置抽屉（牌组 / 牌阵 / 抽法 / 逆位 / 所问 / 典籍说明 / 图鉴）
function menuHTML() {
  const dk = deck();
  const deckBtns = listDecks().filter(x => x.kind === 'tarot').map(x =>
    `<button data-tr-deck="${x.id}" class="${curDeckId() === x.id ? 'on' : ''}">${DECK_SHORT[x.id] || esc(x.name)}</button>`).join('');
  const spreadBtns = TAROT_SPREADS.map(s =>
    `<button data-tr-spread="${s.id}" class="${state.spread === s.id ? 'on' : ''}" title="${esc(s.intro)}">${esc(s.name)}</button>`).join('');
  return `<div class="tip-sheet" id="tr-menu-sheet">
    <div class="tip-mask" data-tr-menuclose></div>
    <div class="tip-card tr-menu" role="dialog" aria-modal="true">
      <div class="tip-head"><span class="tip-kicker">牌桌设置</span><span class="tip-term">钦天监 · 塔罗</span>
        <button class="tip-x" type="button" data-tr-menuclose aria-label="关闭">✕</button></div>
      <div class="tip-body">
        <div class="trm-sec"><div class="tr-blk-t">牌组</div><div class="tr-seg trm-wrap">${deckBtns}</div></div>
        <div class="trm-sec"><div class="tr-blk-t">牌阵</div><div class="tr-seg trm-wrap">${spreadBtns}</div></div>
        <div class="trm-sec"><div class="tr-blk-t">抽法</div><div class="tr-seg">
          <button data-tr-mode="auto" class="${state.mode === 'auto' ? 'on' : ''}">自动抽牌</button>
          <button data-tr-mode="manual" class="${state.mode === 'manual' ? 'on' : ''}">亲手抽牌</button>
          ${dk.allowsReversal ? `<button class="tr-revtoggle ${state.useRev ? 'on' : ''}" id="tr-revtoggle" type="button">逆位 ${state.useRev ? '开' : '关'}</button>`
            : '<span class="tr-revoff">此牌组无逆位</span>'}
        </div></div>
        <div class="trm-sec"><div class="tr-blk-t">所问（可留空）</div>
          <input id="tr-question" class="tr-qinput trm-q" type="text" maxlength="40" placeholder="例：这段关系接下来该怎么走？" value="${esc(state.question)}"/></div>
        <div class="trm-sec trm-links">
          <button id="trm-gallery" type="button">▸ 78 张全牌图鉴</button>
          <button id="trm-about" type="button">▸ 这套牌的读法与典籍依据</button>
        </div>
      </div>
    </div>
  </div>`;
}
function openMenu() {
  closeSheet();
  let sheet = document.getElementById('tr-menu-sheet');
  if (sheet) sheet.remove();
  const wrap = document.createElement('div');
  wrap.innerHTML = menuHTML();
  sheet = wrap.firstElementChild;
  document.body.appendChild(sheet);
  requestAnimationFrame(() => sheet.classList.add('open'));
}
function closeMenu() { const s = document.getElementById('tr-menu-sheet'); if (s) s.classList.remove('open'); }
function showGalleryPage() {
  if (state.tableUnbind) { try { state.tableUnbind(); } catch {} state.tableUnbind = null; }
  state.phase = 'gallery';
  paintResult(`<div class="glass-card tr-galpage">
    <div class="tr-galpage-h"><button class="tr-galback" id="trt-goback" type="button">‹ 返回牌桌</button><h2>${esc(deck().name)} · 全牌图鉴</h2></div>
    ${galleryHTML()}
    <p class="tr-src">${HIST_SRC[curDeckId()] || (curDeckId() === 'sb' ? '牌面：Sola Busca 塔罗 1491（米兰，Brera 美术馆藏，Public Domain）。' : '牌面：Rider–Waite–Smith 1909（Pamela Colman Smith 绘，美国公有领域）。')}</p>
  </div>`);
  closeMenu();
}
function showAboutPage() {
  const d = deck();
  if (state.tableUnbind) { try { state.tableUnbind(); } catch {} state.tableUnbind = null; }
  state.phase = 'about';
  paintResult(`<div class="glass-card tr-aboutpage">
    <div class="tr-galpage-h"><button class="tr-galback" id="trt-goback" type="button">‹ 返回牌桌</button><h2>塔罗 · ${esc(d.name)}</h2></div>
    <p class="tr-sub">${DECK_SUB[curDeckId()] || esc(d.description || '')}</p>
    <div class="tr-histbody" style="display:block">
      <p><b>关于这套牌。</b>${esc(d.description)}</p>
      <p><b>先有牌，后有算命。</b>塔罗 15 世纪起源于意大利北部，本是 tarocchi 打牌游戏；系统用于占卜是 18 世纪法国（Etteilla）以后，韦特（1909）是现代神秘学塔罗集大成者。本页三层分开：①牌上所见＝与牌面严格对应的画面；②正/逆位传统义＝通行中性整理；③Waite 1910 原判词＝英文原著，凡有据者逐张附上。</p>
      <p><b>正逆位：</b>韦特传统正逆异读，默认随机倒转给逆位义；关掉「逆位」则全正立。倾向由传统吉凶惯例机械合参，只给当下之势，不是命定。</p>
      <p class="tr-src">${esc(d.source || '')}</p>
    </div>
    <button class="tr-castbtn" id="trt-goback2" type="button">‹ 返回牌桌</button>
  </div>`);
  closeMenu();
}
function paintTable() { paintResult(tableHTML()); bindTable(); }
// 从剩余牌栈抽出第 pidx 张落到槽位（pidx 缺省取牌堆顶=下一空槽）
function landFromTable(pidx, slotIdx) {
  const n = countOf();
  if (tablePlaced() >= n || !state.pickDeck || !state.pickDeck.length) return false;
  let idx = pidx;
  if (idx == null || idx < 0 || idx >= state.pickDeck.length) idx = 0;
  let si = slotIdx;
  if (si == null || state.tableSlots[si]) {
    si = state.tableSlots.findIndex(x => !x);
    if (si < 0) return false;
  }
  const card = state.pickDeck.splice(idx, 1)[0];
  card._rot = ((Math.random() * 10 - 5) | 0);
  state.picked.push(card);
  state.tableSlots[si] = card;
  state.fanShift = 0; state.tablePick = null;
  paintTable();
  return true;
}

function finalize(draw) {
  state.pickDeck = null;
  state.revealing = { draw, flips: draw.map(() => false) };   // 幕二：牌背落阵，等主人亲手翻
  // v106：主人定调「尽可能让用户参与烹饪过程」——日抽一张同样保留
  // 扣牌待翻，亲手翻开那一下是抽牌体验的一部分，不跳幕直出。
  paintReveal();
}
function revealCount() { return state.revealing ? state.revealing.flips.filter(Boolean).length : 0; }
function revealDone() {
  const r = state.revealing; if (!r) return;
  state.drawn = r.draw; state.revealing = null;
  tarotCode = tarotCodeText(state.drawn);
  toast('牌阵已成');
  paintResult(resultWrap((state.question ? `<div class="tr-q">所问：${esc(state.question)}</div>` : '') + readResult(state.drawn).html));
}
function revealClick(idx) {
  const r = state.revealing; if (!r || r.flips[idx]) return;
  r.flips[idx] = true;
  const el = document.querySelector(`[data-tr-flip="${idx}"]`);
  if (el) { el.classList.add('flip', 'flipped'); el.removeAttribute('data-tr-flip'); el.setAttribute('data-tr-card', r.draw[idx].id); }
  const cnt = $('#tr-reveal-count');
  if (cnt) cnt.textContent = `已翻 ${revealCount()} / ${r.draw.length}`;
  if (r.flips.every(Boolean)) setTimeout(revealDone, 450);
}
function revealAll() {
  const r = state.revealing; if (!r) return;
  r.draw.forEach((_, i) => {
    if (r.flips[i]) return;
    setTimeout(() => revealClick(i), i * 130);
  });
}
const paintResult = inner => { const out = $('#tr-result'); if (out) out.innerHTML = inner; };

function syncQuestion() { const i = $('#tr-question'); if (i) state.question = i.value.trim(); }
function startDraw() {
  syncQuestion(); state.drawn = null; state.picked = []; state.revealing = null;
  enterShuffling();
}
function enterShuffling() {
  // 幕一：洗牌动画（先洗后抽，抽的过程中可再洗）
  if (state.shufT) { clearTimeout(state.shufT); state.shufT = null; }
  state.phase = 'shuffling';
  state.pickDeck = null;
  paintShuffling();
  state.shufT = setTimeout(() => {
    state.shufT = null;
    if (state.phase !== 'shuffling') return;
    if (state.mode === 'manual') {
      state.pickDeck = shuffled(); state.picked = [];
      state.tableSlots = new Array(countOf()).fill(null);
      state.tableFlip = new Array(countOf()).fill(false);
      state.phase = 'table'; paintTable();
    } else {
      state.picked = []; state.phase = null; finalize(shuffled().slice(0, countOf()));
    }
  }, 1750);
}
function paintShuffling() {
  const CARDS = 12;
  let cards = '';
  for (let i = 0; i < CARDS; i++) {
    const dx = (Math.sin(i * 2.399) * 46).toFixed(1), dy = (Math.cos(i * 1.913) * 20 - 6).toFixed(1);
    cards += `<span class="tr-shufcard" style="--dx:${dx}px;--dy:${dy}px;--i:${i}"></span>`;
  }
  paintResult(`<div class="tr-shuffling glass-card">
    <div class="tr-shuf-stage">${cards}</div>
    <div class="tr-shuf-text">洗牌中 · 凝神默念所问……</div>
    <div class="fcbbar"><button type="button" data-tr-reshuffle="1">↺ 再洗一遍</button></div>
  </div>`);
}
function resetDraw() {
  if (state.shufT) { clearTimeout(state.shufT); state.shufT = null; }
  if (state.tableUnbind) { try { state.tableUnbind(); } catch {} state.tableUnbind = null; }
  state.drawn = null; state.pickDeck = null; state.picked = []; state.revealing = null; state.phase = null;
  state.tableSlots = null; state.tableFlip = null; state.fanShift = 0;
  paintResult('');
}

// v109：进塔罗直接落座牌桌（不再先设置页→点「洗牌」跳进来）。
// 新起一局：洗好一叠等主人亲手抽；牌组/牌阵/抽法变更后也走这里重发。
function freshTable() {
  if (state.shufT) { clearTimeout(state.shufT); state.shufT = null; }
  if (state.tableUnbind) { try { state.tableUnbind(); } catch {} state.tableUnbind = null; }
  state.drawn = null; state.picked = []; state.revealing = null;
  state.pickDeck = shuffled();
  state.tableSlots = new Array(countOf()).fill(null);
  state.tableFlip = new Array(countOf()).fill(false);
  state.fanShift = 0; state.tablePick = null;
  state.phase = 'table';
}
function enterTable() { freshTable(); paintTable(); }
// auto 抽法：一键洗抽，仍落到「扣牌待亲手翻」幕（保留参与感，不直出结果）
function autoDraw() {
  if (state.tableUnbind) { try { state.tableUnbind(); } catch {} state.tableUnbind = null; }
  state.phase = null;
  finalize(state.pickDeck.slice(0, countOf()));
  paintReveal();
}

// ---------- 幕二：牌背落阵 · 逐张手翻 ----------
function revealCell(i, extra) {
  const r = state.revealing;
  const d = r.draw[i], flipped = r.flips[i];
  const c = byId()[d.id];
  const poss = possArr();
  const inner = flipped
    ? `<span class="fcb-face"><img src="${esc(c.image)}" alt="${esc(c.name)}" draggable="false"/><span class="fcb-label">${esc(c.name)}${state.useRev && d.rev ? ' · 逆' : ''}</span></span>`
    : `<span class="fcb-face"><span class="fcb-hint">点我翻开</span></span>`;
  return `<button class="fcb ${flipped ? 'flip' : ''} ${d.rev && flipped ? 'tr-rev' : ''} ${extra || ''}" ${flipped ? `data-tr-card="${c.id}"` : `data-tr-flip="${i}"`} aria-label="${flipped ? esc(c.name) : '第' + (i + 1) + '张，点击翻开'}">
    <span class="fcb-inner">
      <span class="fcb-back"></span>
      ${inner}
    </span>
    <span class="tr-slotname" style="font-size:10px;color:#8a94ac;margin-top:4px;text-align:center">${esc(poss[i])}</span>
  </button>`;
}
function revealHTML() {
  const r = state.revealing, total = r.draw.length, got = revealCount();
  let grid;
  if (state.spread === 'celtic-cross') {
    grid = `<div class="tr-cross"><div class="tr-cross-c">
      <div class="tr-cross-stack">${revealCell(0, 'tr-c1')}${revealCell(1, 'tr-c2')}</div>
      <div class="tr-cross-below">${[2, 3, 4, 5].map(i => revealCell(i)).join('')}</div></div>
      <div class="tr-cross-s">${[6, 7, 8, 9].map(i => revealCell(i)).join('')}</div></div>`;
  } else {
    grid = `<div class="fcb-wrap">${[...Array(total)].map((_, i) => revealCell(i)).join('')}</div>`;
  }
  const allDone = got >= total;
  return `<div class="tr-reveal glass-card">
    <div class="tr-reveal-head">牌已落阵 · 都还扣着</div>
    <div class="fcb-count" id="tr-reveal-count">已翻 ${got} / ${total} · 逐张点牌翻开${state.spread === 'celtic-cross' ? '，或一键全开' : ''}</div>
    <div class="fcbbar">
      <button type="button" data-tr-flipall="1" ${allDone ? 'disabled' : ''}>全部翻开</button>
      <button type="button" data-tr-reshuffle="1">↺ 重洗 · 重抽</button>
    </div>
    ${grid}
  </div>`;
}
function paintReveal() { paintResult(revealHTML()); }

// ---------- 弹层（挂 body，复用 .tip-sheet/.tip-card） ----------
function ensureSheet() {
  if (document.getElementById('tr-sheet')) return;
  const el = document.createElement('div');
  el.className = 'tip-sheet'; el.id = 'tr-sheet';
  el.innerHTML =
    '<div class="tip-mask" data-tr-close></div>' +
    '<div class="tip-card" role="dialog" aria-modal="true">' +
      '<div class="tip-head"><span class="tip-kicker">韦特塔罗 RWS</span><span class="tip-term" id="tr-term"></span>' +
      '<button class="tip-x" type="button" data-tr-close aria-label="关闭">✕</button></div>' +
      '<div class="tip-body" id="tr-body"></div></div>';
  document.body.appendChild(el);
}
function openCard(id) {
  const c = byId()[id]; if (!c) return;
  const m = c.meaning || {};
  ensureSheet();
  const val = rwsVal(c.id, false);
  const valTag = val > 0.25 ? '<span class="tg-g">偏吉</span>' : val < -0.25 ? '<span class="tg-b">偏滞</span>' : '<span class="tg-n">中性</span>';
  $('#tr-term').textContent = `${c.name} · ${c.nameAlt || ''}`;
  $('#tr-body').innerHTML = `<div class="trf-head"><img class="trf-img" src="${esc(c.image)}" alt="${esc(c.name)}"/>
    <div class="trf-meta">
      <div class="trf-names"><b>${esc(c.name)}</b> ${valTag}</div>
      <div class="trf-sub">${esc(c.nameAlt || '')}</div>
      <div class="trf-old">${esc(c.group)}${c.label ? ' · ' + esc(c.label) : ''}</div>
    </div></div>
    <div class="trf-sec"><div class="tr-blk-t">关键词</div><div class="trf-kws">${(m.keywords || []).map(k => `<span class="trf-kw">${esc(k)}</span>`).join('')}</div></div>
    <div class="trf-sec"><div class="tr-blk-t">牌上所见（与牌面对应）</div><p>${esc(m.scene || '')}</p></div>
    <div class="trf-sec"><div class="tr-blk-t">正位 · 传统义</div><p>${(m.upright || []).map(esc).join('；')}。</p></div>
    <div class="trf-sec"><div class="tr-blk-t">逆位 · 传统义</div><p>${(m.reversed || []).map(esc).join('；')}。</p></div>
    ${m.classicText ? `<div class="trf-sec"><div class="tr-blk-t">Waite 1910 原判词（英文，公有领域）</div><p class="tr-line-old">${esc(m.classicText)}</p></div>` : ''}
    ${c.sbNote ? `<div class="trf-sec"><div class="tr-blk-t">Sola Busca 源流（1491）</div><p>原图为 <b>${esc(c.sbNote[0])}</b>（1491 年米兰制，Brera 美术馆藏，Public Domain）。对应依据：${esc(c.sbNote[1])}。1491 年原版王牌序列与现代塔罗不同，此图按学术研究映射到「${esc(c.name)}」；牌义判词为现代对照，非当年语境。</p></div>` : ''}
    <p class="trf-note">${curDeckId() === 'sb' ? '牌面为 1491 年 Sola Busca 塔罗原版真图（Wikimedia Commons，PD；经 GitHub TarotCards 仓库获取，逐张校验）。' : '牌面为 1909 Rider–Waite–Smith 原版（Pamela Colman Smith 绘，美国公有领域）；'}结构化正逆位牌义为自建中性整理，非现代版权译本。综合倾向表只是读牌惯例，非命定。</p>`;
  $('#tr-sheet').classList.add('open');
}
function closeSheet() { const s = $('#tr-sheet'); if (s) s.classList.remove('open'); }

// ---------- 图鉴 ----------
function galleryHTML() {
  return GROUPS.map(g => {
    const list = cards().filter(c => c.group === g);
    return `<div class="tr-galgrp"><div class="tr-galgrp-t">${esc(g)}（${list.length}）</div>
      <div class="tr-galgrid">${list.map(c => `
        <button class="tr-galcard" data-tr-card="${c.id}">
          <img class="tr-gimg" src="${esc(c.image)}" alt="${esc(c.name)}" loading="lazy" draggable="false"/>
          <span class="tr-gname">${esc(c.name)}</span>
        </button>`).join('')}</div></div>`;
  }).join('');
}

// ---------- 主渲染 ----------
// v104：各牌组扫描比例不同（RWS 860/1433、SB 474/877、Marseille 463/880、
// Visconti 440/880、Wirth 521/880、Vieville 487/880），此前 CSS 硬编码 860/1433，
// 切历史牌组后小牌被 object-fit:cover 拉胖裁切（真机「小牌比例不对」根因）。
// 现按牌组把真实比例注入 --card-r，所有牌面容器统一 aspect-ratio:var(--card-r)。
const DECK_R = { rws: '860/1433', sb: '474/877', marseille: '463/880', vieville: '487/880', visconti: '440/880', wirth: '521/880' };
// v109：塔罗主屏不再是设置页——进视图即落座全屏牌桌；牌组/牌阵/抽法/逆位/提问/图鉴
// 全部在牌桌顶栏 ☰ 设置抽屉里。主屏文档流只留 #tr-result 承载结果页 / 图鉴页 / 说明页。
export function renderTarot() {
  return `<div class="tr-wrap" style="--card-r:${DECK_R[curDeckId()] || '860/1433'}">
    <div id="tr-result" class="tr-result"></div>
  </div>`;
}

// 结果页统一包一条「再抽一局 / 牌桌设置」操作条
function resultWrap(inner) {
  return `<div class="tr-resbar">
      <button class="tr-resbtn" id="trt-redraw" type="button">🜨 再抽一局</button>
      <button class="tr-resbtn tr-resbtn-ghost" id="trt-menu2" type="button">☰ 牌组 · 牌阵</button>
    </div>` + inner;
}

// ---------- 复制 ----------
function tarotCodeText(draw) {
  const id = curDeckId();
  const q = state.question ? `所问：${state.question}\n` : '';
  const spreadName = spreadObj().name;
  const poss = possArr();
  const dkName = DECK_SHORT[id] || deck().name;
  const src = deckSrc(id);
  return `【钦天监·${dkName} ${spreadName}】\n${q}` +
    draw.map((d, i) => { const c = byId()[d.id]; return `${i + 1}. ${c.name}（${c.nameAlt}）${state.useRev && d.rev ? ' · 逆位' : ''} — ${poss[i]}`; }).join('\n') +
    `\n（${src}倾向为读牌惯例机械合参，非命定，取舍由人。）`;
}
export function tarotCopyText() {
  if (!state.drawn) { toast('先洗牌开牌'); return `钦天监 · ${DECK_SHORT[curDeckId()] || '塔罗'}（尚未成阵）`; }
  return tarotCodeText(state.drawn);
}

// ---------- v121 复现码：牌局 ↔ 码（B-P2-03 新塔罗接码） ----------
// 新塔罗的牌局用 kind='cards' 的码承载，靠 deckId 与旧卡牌视图（无 deckId）区分双轨。
export function isTarotDeck(id) {
  ensureSolaBusca(); ensureHistDecks();
  return listDecks().some((x) => x.id === id && x.kind === 'tarot');
}

/** 当前牌局 → 复现码数据 */
export function tarotCodeInfo() {
  if (!state.drawn || !state.drawn.length) return null;
  const id = curDeckId();
  const dk = deck();
  const idxOf = (cardId) => dk.cards.findIndex((c) => c.id === cardId);
  const cardsArr = state.drawn.map((d) => ({ index: Math.max(0, idxOf(d.id)), reversed: !!d.rev }));
  const sp = spreadObj();
  const si = Math.max(0, TAROT_SPREADS.indexOf(sp));
  const dkName = DECK_SHORT[id] || dk.name;
  return {
    kind: 'cards',
    data: { at: Date.now(), spreadIndex: si, cards: cardsArr, deckId: id },
    title: `${dkName} · ${sp.name}`,
    sub: `${sp.name} · ${state.drawn.length} 张${state.question ? ' · ' + state.question : ''}`,
  };
}

/** 复现码 → 牌局（牌组、牌阵、牌序、逆位全还原） */
export function restoreTarot(spreadIndex, cardsArr, deckId) {
  const dkId = isTarotDeck(deckId) ? deckId : curDeckId();
  try { localStorage.setItem(DECK_KEY, dkId); } catch {}
  ensureSolaBusca(); ensureHistDecks();
  const dk = getDeck(dkId);
  const sp = TAROT_SPREADS[spreadIndex] || TAROT_SPREADS[0];
  if (!dk || !sp || !Array.isArray(cardsArr) || cardsArr.length !== sp.count) return false;
  const drawn = [];
  for (const c of cardsArr) {
    const card = dk.cards[c.index];
    if (!card) return false;
    drawn.push({ id: card.id, rev: !!c.reversed });
  }
  state.spread = sp.id;
  state.drawn = drawn;
  state.revealing = null;
  state.picked = [];
  state.pickDeck = null;
  state.phase = null;
  state.tableSlots = null;
  state.tableFlip = null;
  tarotCode = tarotCodeText(drawn);
  return true;
}

// v109：菜单内改设置后，牌桌仍在 fixed 覆盖层，只重绘画布即可，不整体重挂。
function rerender() {
  if (state.phase === 'table' && state.pickDeck) { paintTable(); return; }
  const body = $('#tarot-body');
  if (!body) return;
  body.innerHTML = renderTarot();
  if (state.phase === 'shuffling') enterShuffling();
  else if (state.phase === 'table' && state.pickDeck) paintTable();
  else if (state.revealing) paintReveal();
  else if (state.drawn) paintResult(resultWrap((state.question ? `<div class="tr-q">所问：${esc(state.question)}</div>` : '') + readResult(state.drawn).html));
}

// v109 首次切到塔罗视图：直接落座牌桌（无已开结果/未在特殊页时）。
// 由 main.js 在渲染塔罗视图后调用。
export function mountTarot() {
  if (state.phase === 'table' && state.pickDeck) { paintTable(); return; }
  if (state.phase === 'gallery' || state.phase === 'about' || state.phase === 'shuffling' || state.revealing) {
    rerender(); return;
  }
  if (state.drawn) {
    paintResult(resultWrap((state.question ? `<div class="tr-q">所问：${esc(state.question)}</div>` : '') + readResult(state.drawn).html));
    return;
  }
  enterTable();
}

// ---------- v108 牌桌交互：三式展牌 + 拖拽落位（touch / mouse 统一） ----------
function bindTable() {
  if (state.tableUnbind) { try { state.tableUnbind(); } catch {} state.tableUnbind = null; }
  const root = document.getElementById('tr-table');
  const canvas = document.getElementById('trt-canvas');
  const drag = document.getElementById('trt-drag');
  const stackEl = document.getElementById('trt-stack');
  const fanEl = document.getElementById('trt-fan');
  if (!root || !canvas || !drag) return;

  // v110 交互（主人定）：点牌=选它，牌只微微探出（is-pick），绝不自动飞；
  // 随后手指把这张牌拖到发光空槽（或任意位置松手）放下。空白处横滑=整副平移。
  let downKind = null, downIdx = null, sx = 0, sy = 0;
  let decision = null, moved = false, suppress = false, startSh = 0;
  let nearEl = null;

  function pos(e) { return e.touches ? e.touches[0] : e; }
  function endPos(e) { return (e.changedTouches && e.changedTouches[0]) || e; }
  function nearSlotClear() { if (nearEl) { nearEl.classList.remove('is-near'); nearEl = null; } }
  function nearestFree(x, y) {
    let best = null, bestD = 1e12;
    canvas.querySelectorAll('.trt-slot').forEach(el => {
      const i = parseInt(el.getAttribute('data-trt-slot'), 10);
      if (state.tableSlots[i]) return;
      const r = el.getBoundingClientRect();
      const cx = r.left + r.width / 2, cy = r.top + r.height / 2;
      const dist = Math.hypot(x - cx, y - cy);
      const hitR = Math.hypot(r.width, r.height) / 2 + 34;
      if (dist < hitR && dist < bestD) { best = { i, el, dist }; bestD = dist; }
    });
    return best;
  }
  // v115 切牌动画：一张牌从牌堆顶抬起、划弧绕到堆底落下，随后才轮转 pickDeck 重绘
  let cutting = false;
  function playCutAnim(cb) {
    if (cutting) return;
    cutting = true;
    const top = root.querySelector('.trt-stacktop');
    const stackRect = stackEl ? stackEl.getBoundingClientRect() : null;
    let fly;
    if (top && stackRect) {
      const r = top.getBoundingClientRect();
      fly = document.createElement('div');
      fly.className = 'trt-cutfly trpc';
      fly.style.left = r.left + 'px';
      fly.style.top = r.top + 'px';
      fly.style.width = r.width + 'px';
      fly.style.aspectRatio = getComputedStyle(top).aspectRatio || '860/1433';
      document.body.appendChild(fly);
      requestAnimationFrame(() => {
        fly.classList.add('is-cut');
        fly.style.setProperty('--cut-dx', (stackRect.width * 0.5 + 26) + 'px');
        fly.style.setProperty('--cut-dy', (r.height * 0.22) + 'px');
      });
      setTimeout(() => { fly.remove(); }, 620);
    }
    setTimeout(() => { cutting = false; cb && cb(); }, 480);
  }
  // 已选中的牌对应的舞台元素（拖起时把原位藏掉）
  function pickedStageEl() {
    if (!state.tablePick) return null;
    if (state.layout === 'stack') return root.querySelector('.trt-stacktop');
    return root.querySelector(`[data-pidx="${state.tablePick.idx}"]`);
  }

  function onDown(e) {
    if (tablePlaced() >= countOf()) return;
    const t = e.target;
    const stack = t.closest('#trt-stack');
    const item = t.closest('[data-pidx]');
    if (!stack && !item) return;
    if (e.cancelable) e.preventDefault();
    const p = pos(e);
    downKind = stack ? 'stack' : 'card';
    downIdx = item ? parseInt(item.getAttribute('data-pidx'), 10) : null;
    sx = p.clientX; sy = p.clientY; moved = false; decision = null;
    startSh = state.fanShift || 0;
    drag.hidden = true; nearSlotClear();
  }
  function onMove(e) {
    if (!downKind) return;
    const p = pos(e);
    const dx = p.clientX - sx, dy = p.clientY - sy;
    if (!moved && Math.abs(dx) + Math.abs(dy) < 8) return;
    if (!moved) {
      moved = true;
      // 判定：①手里已有选中牌 → 拖的就是它；②点在具体牌上且横向为主 → 整副平移；③否则抽/拖单张
      if (state.tablePick) decision = 'pull';
      else if (downKind === 'card' && (fanEl || bridgeEl) && Math.abs(dx) > Math.abs(dy)) decision = 'pan';
      else decision = 'pull';
      if (decision === 'pull') {
        // 本次真正要拖的牌：已选优先；点在具体牌上=该牌；牌堆=牌堆顶
        let takeIdx = state.tablePick ? state.tablePick.idx
          : (downKind === 'card' ? downIdx : 0);
        state.tablePick = { idx: takeIdx };
        const src = pickedStageEl();
        if (src) src.classList.add('is-hidden');
        drag.hidden = false;
        drag.style.left = p.clientX + 'px'; drag.style.top = p.clientY + 'px';
        drag.style.transform = '';
      }
    }
    if (e.cancelable) e.preventDefault();
    if (decision === 'pan') {
      if (fanEl) {
        const ns = Math.max(-72, Math.min(72, startSh + dx * .3));
        state.fanShift = ns;
        fanEl.querySelectorAll('.trf-item').forEach(el => {
          const i = parseInt(el.getAttribute('data-pidx'), 10);
          const mm = state.pickDeck.length, mid = (mm - 1) / 2;
          const a = (i - mid) * 2.1 + ns;
          el.style.setProperty('--a', a.toFixed(2) + 'deg');
          el.style.display = (a < -72 || a > 72) ? 'none' : '';
        });
      }
    } else if (decision === 'pull') {
      // 物理跟手：每帧把牌心放到手指下（只改 transform 不够，left/top 必须每帧跟手，否则牌卡在按下点原地不动）
      drag.style.left = p.clientX + 'px';
      drag.style.top = p.clientY + 'px';
      drag.style.transform = `translate(-50%,-62%) rotate(${Math.max(-14, Math.min(14, dx * .03))}deg) scale(1.08)`;
      const hit = nearestFree(p.clientX, p.clientY);
      if (!hit) nearSlotClear();
      else if (!nearEl || nearEl !== hit.el) { nearSlotClear(); nearEl = hit.el; nearEl.classList.add('is-near'); }
    }
  }
  function onUp(e) {
    if (!downKind) return;
    const kind = downKind, idx = downIdx;
    downKind = null;
    const p = endPos(e);
    if (!moved) {
      drag.hidden = true; nearSlotClear();
      if (kind === 'stack') {
        // 点牌堆：有选中→取消选中；无选中→切牌（一张牌从上面切到底下，带动画）
        if (state.tablePick) { state.tablePick = null; paintTable(); }
        else if (state.pickDeck && state.pickDeck.length > 1) {
          playCutAnim(() => {
            state.pickDeck.push(state.pickDeck.shift());
            paintTable();
          });
        }
      } else {
        // 点牌=只选中（微微探出）；再点同一张=取消；点别的=换选。绝不自动飞
        suppress = true; setTimeout(() => { suppress = false; }, 300);
        if (state.tablePick && state.tablePick.idx === idx) state.tablePick = null;
        else state.tablePick = { idx };
        paintTable();
      }
      decision = null;
      return;
    }
    if (decision === 'pull') {
      drag.hidden = true; drag.style.transform = ''; nearSlotClear();
      suppress = true; setTimeout(() => { suppress = false; }, 300);
      const hit = nearestFree(p.clientX, p.clientY);
      const takeIdx = state.tablePick ? state.tablePick.idx : idx;
      if (hit) landFromTable(takeIdx, hit.i);             // 对准发光空槽→亲手放下
      else { state.tablePick = null; paintTable(); }      // 任意位置松手/没对准→牌回原位
    }
    decision = null;
  }

  root.addEventListener('touchstart', onDown, { passive: false });
  root.addEventListener('touchmove', onMove, { passive: false });
  root.addEventListener('touchend', onUp);
  root.addEventListener('touchcancel', onUp);
  root.addEventListener('mousedown', onDown);
  document.addEventListener('mousemove', onMove);
  document.addEventListener('mouseup', onUp);

  // 点桌面上的槽位牌：未翻→3D 翻开；已翻→开牌义弹层
  canvas.addEventListener('click', (e) => {
    if (suppress) return;
    const slotEl = e.target.closest('.trt-slot');
    if (!slotEl) return;
    const i = parseInt(slotEl.getAttribute('data-trt-slot'), 10);
    if (!state.tableSlots[i]) return;
    if (!state.tableFlip[i]) {
      state.tableFlip[i] = true;
      slotEl.classList.add('is-flip');
      const fcb = slotEl.querySelector('.fcb'); if (fcb) fcb.classList.add('flip');
      if (state.tableFlip.every(Boolean)) { paintTable(); }
      else {
        const h = canvas.parentElement.querySelector('.trt-hint span');
        if (h) h.textContent = `牌已放好，点桌面上的牌逐张翻开（已翻 ${state.tableFlip.filter(Boolean).length}/${countOf()}）`;
      }
    } else {
      openCard(state.tableSlots[i].id);
    }
  });
  // 全开 / 开牌解局 / 展牌形式切换
  root.addEventListener('click', (e) => {
    if (e.target.closest('#trt-flipall')) { state.tableFlip = state.tableSlots.map(Boolean); paintTable(); return; }
    if (e.target.closest('#trt-layout')) {
      const order = LAYOUTS.map(l => l.id);
      const cur = order.indexOf(state.layout);
      state.layout = order[(cur + 1) % order.length];
      state.fanShift = 0;
      try { localStorage.setItem(LAYOUT_KEY, state.layout); } catch {}
      paintTable();
      return;
    }
    if (e.target.closest('#trt-read')) {
      // 玩家已在牌桌上亲手逐张翻开看过，直接按槽位顺序成阵出结果，不再过 reveal 幕
      const draw = state.tableSlots.map(c => ({ id: c.id, rev: c.rev }));
      if (state.tableUnbind) { try { state.tableUnbind(); } catch {} state.tableUnbind = null; }
      state.phase = null; state.pickDeck = null; state.tableSlots = null; state.tableFlip = null;
      state.drawn = draw;
      tarotCode = tarotCodeText(draw);
      toast('牌阵已成');
      paintResult(resultWrap((state.question ? `<div class="tr-q">所问：${esc(state.question)}</div>` : '') + readResult(draw).html));
    }
  });
  state.tableUnbind = () => {
    root.removeEventListener('touchstart', onDown);
    root.removeEventListener('touchmove', onMove);
    root.removeEventListener('touchend', onUp);
    root.removeEventListener('touchcancel', onUp);
    root.removeEventListener('mousedown', onDown);
    document.removeEventListener('mousemove', onMove);
    document.removeEventListener('mouseup', onUp);
    state.tableUnbind = null;
  };
}

// ---------- 事件：document 委托 ----------
export function initTarot() {
  document.addEventListener('click', (e) => {
    // 牌义弹层
    if (e.target.closest('[data-tr-close]')) { closeSheet(); return; }
    // 设置抽屉关闭 / 图鉴·说明页返回
    if (e.target.closest('[data-tr-menuclose]')) { closeMenu(); return; }
    if (e.target.closest('#trt-goback') || e.target.closest('#trt-goback2')) {
      closeMenu(); state.phase = null; enterTable(); return;
    }
    // 牌桌顶栏 ☰ / 结果页「牌组·牌阵」→ 开设置抽屉
    if (e.target.closest('#trt-menu') || e.target.closest('#trt-menu2')) { syncQuestion(); openMenu(); return; }
    if (e.target.closest('#trm-gallery')) { syncQuestion(); showGalleryPage(); return; }
    if (e.target.closest('#trm-about')) { syncQuestion(); showAboutPage(); return; }
    // 结果页「再抽一局」
    if (e.target.closest('#trt-redraw')) { state.phase = null; enterTable(); return; }
    // auto 抽法一键抽
    if (e.target.closest('#trt-autodraw')) { autoDraw(); return; }
    // 牌卡弹层（牌桌/图鉴/结果页通用）
    const card = e.target.closest('[data-tr-card]');
    if (card) { openCard(card.getAttribute('data-tr-card')); return; }
    const fl = e.target.closest('[data-tr-flip]');
    if (fl) { revealClick(parseInt(fl.getAttribute('data-tr-flip'), 10)); return; }
    if (e.target.closest('[data-tr-flipall]')) { revealAll(); return; }
    // 牌桌 ↺ 重新发牌（直接重洗落座，不走全屏洗牌幕）
    if (e.target.closest('[data-tr-reshuffle]')) { enterTable(); return; }
    if (e.target.closest('[data-tr-reset]')) { resetDraw(); return; }
    if (e.target.closest('#tr-revtoggle')) { state.useRev = !state.useRev; try { localStorage.setItem('qintian.tarot.rev', state.useRev ? '1' : '0'); } catch {} closeMenu(); enterTable(); return; }
    // 改牌组/牌阵/抽法：关抽屉，重发一局
    const dk = e.target.closest('[data-tr-deck]');
    if (dk) {
      try { localStorage.setItem(DECK_KEY, dk.getAttribute('data-tr-deck')); } catch {}
      closeMenu(); state.phase = null; enterTable(); return;
    }
    const md = e.target.closest('[data-tr-mode]');
    if (md) { state.mode = md.getAttribute('data-tr-mode'); closeMenu(); state.phase = null; enterTable(); return; }
    const sp = e.target.closest('[data-tr-spread]');
    if (sp) { state.spread = sp.getAttribute('data-tr-spread'); closeMenu(); state.phase = null; enterTable(); return; }
  });
  document.addEventListener('input', (e) => {
    if (e.target && e.target.id === 'tr-question') state.question = e.target.value;
  });
}

// v107 牌桌纯渲染/状态导出（供渲染桩测；运行时无副作用）
export { tableHTML };
export const tarotState = () => state;
export function tarotSetTableForTest(spreadId, layout) {
  state.mode = 'manual'; state.spread = spreadId; state.useRev = true;
  state.phase = 'table'; state.layout = layout || 'fan';
  const dk = deck();
  const useRev = dk.allowsReversal;
  const pool = dk.cards.map(c => ({ id: c.id, rev: useRev && !!c.reversible && false }));
  state.pickDeck = pool;
  state.tableSlots = new Array(countOf()).fill(null);
  state.tableFlip = new Array(countOf()).fill(false);
  state.fanShift = 0;
}
export function tarotLandForTest(slotIdx) {
  landFromTable(null, slotIdx);
}
export const tarotSpreads = () => TAROT_SPREADS;
export { readResult, menuHTML };
