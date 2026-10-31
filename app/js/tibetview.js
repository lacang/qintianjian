// 敦煌古藏文占卜 · 钦天监·世界占卜典籍库 第二种
// 两套独立的敦煌藏经洞手稿：
//  ① 骰占 IOL Tib J 740：三枚四面骰，62繇（含重卦、5式不载）—— 完整自译
//  ② 金钱神课 PT1055 + IOL Tib J 744：8铜钱符号演64卦，汉藏合流 —— 符号/演法/源流，繇辞复用64卦体系
// 纯本地、随机起卦，不接任何 AI。只做「机器按古法机械演卦 + 文献给原典 + 人判断」。
// 繇辞据 OTDO 公开古藏文转写自译，参考英译理解、陈践/格桑央京中译校读，不照抄单一译本；
// 原卷残缺处如实标「手稿不载/残」，绝不臆补。
import { $, escapeHtml, toast } from './state.js?v=123';
import { DICE_ORACLES, DICE_MISSING, DICE_SOURCE, diceGod } from './tibetdata_dice.js?v=123';
import { COIN_MARKS, COIN_RULE, COIN_SOURCE, coinTonePair } from './tibetdata_coin.js?v=123';

let inited = false;
let mode = 'dice';        // 'dice' | 'coin'
let question = '';
let lastDice = null;       // 当前掷出的骰式 [a,b,c]
let lastCoin = null;       // 当前铜钱两符号 [a,b]

/* ============================ 工具 ============================ */
const r4 = () => 1 + Math.floor(Math.random() * 4);
const r8 = () => 1 + Math.floor(Math.random() * 8);
const esc = escapeHtml;

// 骰式 → 繇数组（重卦可能多条）
function diceFind(face) {
  return DICE_ORACLES.filter(o => o[0] === face);
}
const G = { g: { word: '吉', cls: 'v-good' }, n: { word: '平', cls: 'v-flat' }, b: { word: '凶', cls: 'v-bad' } };

// 骰面 SVG（四面骰传统点数 1–4）
function dieSvg(p, size) {
  const s = size || 46;
  const dots = {
    1: [[50, 50]],
    2: [[32, 32], [68, 68]],
    3: [[30, 30], [50, 50], [70, 70]],
    4: [[32, 32], [68, 32], [32, 68], [68, 68]]
  }[p];
  const ds = dots.map(([x, y]) => `<circle cx="${x}" cy="${y}" r="8.5" fill="currentColor"/>`).join('');
  return `<svg class="tb-die" width="${s}" height="${s}" viewBox="0 0 100 100" aria-label="${p}点">
    <rect x="4" y="4" width="92" height="92" rx="16" fill="rgba(120,72,20,.12)" stroke="currentColor" stroke-width="3"/>${ds}</svg>`;
}

/* ============================ 骰占：单繇详情 ============================ */
function diceVerdict(face) {
  const list = diceFind(face);
  if (!list.length) return null;
  // 重卦时两繇并列，不合成；取倾向时两条都给，方向取首条并提示有两繇
  return list;
}

function diceCard(o, showFace) {
  const [face, gk, text, lvl, line, note] = o;
  const g = G[lvl];
  const god = gk ? diceGod(gk) : '';
  return `
  <div class="tb-ocard glass-card ${g.cls}">
    <div class="tb-ohead">
      ${showFace ? `<span class="tb-oface">${dieSvg(+face.split('-')[0], 30)}${dieSvg(+face.split('-')[1], 30)}${dieSvg(+face.split('-')[2], 30)}</span>` : ''}
      <span class="tb-olvl">${g.word}</span>
      ${note ? `<span class="tb-otag">${esc(note)}</span>` : ''}
      <span class="tb-oline">${DICE_SOURCE.ms.split('，')[0]} 第${line}行</span>
    </div>
    <div class="tb-otext">${esc(text)}</div>
    ${god ? `<div class="tb-ogod">发言神灵：${esc(god)}</div>` : ''}
  </div>`;
}

/* ============================ 骰占主面板 ============================ */
function renderDice() {
  const face = lastDice ? lastDice.join('-') : null;
  const oracles = face ? diceVerdict(face) : null;
  const isMissing = face && DICE_MISSING.includes(face);

  let result = '';
  if (face) {
    if (isMissing) {
      result = `
      <div class="tb-result glass-card v-flat">
        <div class="tb-diceface">${lastDice.map(p => dieSvg(p, 56)).join('')}</div>
        <div class="dv-title">骰式 ${face}</div>
        <div class="dv-desc">此三骰组合在 IOL Tib J 740 手稿中<b>不载繇辞</b>（全卷 64 式缺 5 式：${DICE_MISSING.join('、')}）。这是手稿原貌，本典籍库不臆补。可再掷一次，或在下方查阅已有繇辞的骰式。</div>
      </div>`;
    } else if (oracles) {
      const multi = oracles.length > 1;
      const dir = { g: '吉', n: '平（中）', b: '凶' }[oracles[0][3]];
      const dirCls = G[oracles[0][3]].cls;
      result = `
      <div class="tb-result glass-card ${dirCls}">
        <div class="tb-diceface">${lastDice.map(p => dieSvg(p, 56)).join('')}</div>
        <div class="dv-title">骰式 ${face} · ${dir}${multi ? `　<span class="tb-multi">此式手稿载 ${oracles.length} 繇，并列如下、不作合一</span>` : ''}</div>
      </div>
      <div class="tb-olist">${oracles.map(o => diceCard(o, false)).join('')}</div>`;
    }
  }

  // 查阅网格：59唯一骰式
  const uniq = [...new Map(DICE_ORACLES.map(o => [o[0], o])).values()];
  const cells = uniq.map(o => {
    const [f, , , lvl] = o;
    const cnt = DICE_ORACLES.filter(x => x[0] === f).length;
    return `<button type="button" class="tb-cell ${G[lvl].cls}" data-tb-face="${f}">
      <span class="tb-cf">${f}</span>${cnt > 1 ? `<i class="tb-cn">${cnt}繇</i>` : ''}</button>`;
  }).join('');

  return `
  <div class="tb-intro glass-card">
    <div class="tb-introt">三面骰 · 四面骰卜 <span>mo gshag｜ITJ 740</span></div>
    <p>吐蕃时期盛行的占卜：掷<b>三枚四面骰</b>（点 1–4），共 64 种组合，按骰式查繇辞。繇辞多托为苯教山神、精怪之口，末以「吉／凶／平」断之。本卷是现存最完整的古藏文骰占，藏于大英图书馆，敦煌藏经洞出土。</p>
  </div>

  <div class="tb-cast glass-card">
    <input id="tb-question" class="tb-qinput" type="text" maxlength="60" placeholder="心中所问（可留空）……" value="${esc(question)}">
    <button id="tb-roll" class="tb-castbtn" type="button">⚄ 凝神掷骰</button>
    <div class="tb-castmeta">三枚四面骰（点1–4）· 64式 · 手稿存繇62条（3式重卦、5式不载）</div>
  </div>

  ${result}

  <div class="tb-section glass-card">
    <div class="tb-sectitle">骰繇查阅 <span>按骰式检索 59 式 · 色块为该式吉凶</span></div>
    <div class="tb-grid">${cells}</div>
    <div class="tb-legend"><i class="lg g"></i>吉 ${DICE_ORACLES.filter(o => o[3] === 'g').length} 条　<i class="lg b"></i>凶 ${DICE_ORACLES.filter(o => o[3] === 'b').length} 条　<i class="lg n"></i>平 ${DICE_ORACLES.filter(o => o[3] === 'n').length} 条　合计 ${DICE_ORACLES.length} 繇</div>
  </div>

  <div class="tb-section glass-card">
    <div class="tb-sectitle">手稿 · 源流 <span>Fact / Tradition 分层</span></div>
    <div class="tb-src">
      <p><b>【手稿·可核验】</b>${esc(DICE_SOURCE.ms)}；${esc(DICE_SOURCE.lib)}；${esc(DICE_SOURCE.date)}。古藏文拉丁转写见 OTDO（东京外大亚非语言文化研究所）：${esc(DICE_SOURCE.otdo)}。</p>
      <p><b>【演法】</b>四面骰卜（藏 mo）源出印度、经西域于阗一线入吐蕃；骰组以 @ 符号记于繇前，繇辞先述象、次列所问（寿／行人／敌／财／病……）、末断吉凶。本页把原卷按所问混排的繇辞译为整条白话，未强行拆门类。</p>
      <p><b>【研究】</b>${esc(DICE_SOURCE.refs)}。Dotson 指出本卷与 PT1055 金钱神课同属一套 64 卦繇体系，8 世纪藏人已知 64 卦之制。</p>
      <p><b>【翻译声明】</b>繇辞为本典籍库据 OTDO 古藏文转写自译，参 Good Works Library 英译与陈践等中译校读，不照抄任何单一译本；神灵名保留藏文 Wylie 转写并括注意译。原卷残缺、虫蛀处如实标注，不作补字。</p>
    </div>
  </div>`;
}

/* ============================ 金钱神课面板 ============================ */
function renderCoin() {
  const pair = lastCoin;
  let result = '';
  if (pair) {
    const [a, b] = pair;
    const tone = coinTonePair(a, b);
    const g = G[tone.lvl];
    const ma = COIN_MARKS[a - 1], mb = COIN_MARKS[b - 1];
    // 复用同卦骰占繇（若该8进制式不直接对应骰式，则只给总断，不硬牵）
    result = `
    <div class="tb-result glass-card ${g.cls}">
      <div class="tb-coins">
        <span class="tb-coin">${esc(ma.mark)}<i>${esc(ma.zh)}</i></span>
        <span class="tb-coinplus">＋</span>
        <span class="tb-coin">${esc(mb.mark)}<i>${esc(mb.zh)}</i></span>
      </div>
      <div class="dv-title">第 ${a * 8 + b - 8} 卦 · 总断倾向：${tone.zh}</div>
      <div class="dv-desc">上「${esc(ma.mean)}」、下「${esc(mb.mean)}」。此总断由两枚铜钱符号的古象倾向<b>机械合参</b>而成，仅示方向；原卷各门类细判多残缺，不臆补。</div>
      <div class="tb-coinnote">${esc(ma.zh)}：${esc(ma.note)}<br>${esc(mb.zh)}：${esc(mb.note)}</div>
    </div>`;
  }

  const marks = COIN_MARKS.map((m, i) => `
    <button type="button" class="tb-mark glass-card" data-tb-coin="${i + 1}">
      <span class="tb-mark-glyph ${m.tone === '+' ? 'p' : m.tone === '-' ? 'm' : ''}">${esc(m.mark)}</span>
      <span class="tb-mark-zh">${esc(m.zh)}</span>
      <span class="tb-mark-mean">${esc(m.mean)}</span>
    </button>`).join('');

  return `
  <div class="tb-intro glass-card">
    <div class="tb-introt">金钱神课 <span>dngul smyug g.yes／PT 1055 + ITJ 744</span></div>
    <p>敦煌汉藏占卜合流的实物。卷首题「金钱神课，王法本者」，以 <b>8 枚铜钱符号</b>（夏、冬、天、玉、金、帛、孔、鬼）配卦数演 <b>8×8＝64 卦</b>，且出现尊<b>孔子（Kong-rtse）</b>为占卜之祖、<b>鬼王（Ki-wang）</b>主丧亡等汉地名号。原卷撕裂为二，分藏巴黎与伦敦。</p>
  </div>

  <div class="tb-cast glass-card">
    <input id="tb-question" class="tb-qinput" type="text" maxlength="60" placeholder="心中所问（可留空）……" value="${esc(question)}">
    <button id="tb-coinroll" class="tb-castbtn" type="button">◉ 凝神掷钱（取二符成卦）</button>
    <div class="tb-castmeta">8铜钱符号取二 · 64卦 · 原卷门类细判残缺，仅总断</div>
  </div>

  ${result}

  <div class="tb-section glass-card">
    <div class="tb-sectitle">八铜钱符号 <span>点符看象义</span></div>
    <div class="tb-marks">${marks}</div>
  </div>

  <div class="tb-section glass-card">
    <div class="tb-sectitle">${esc(COIN_RULE.title)} <span>演法与体例</span></div>
    <div class="tb-src">${COIN_RULE.body.map(p => `<p>${esc(p)}</p>`).join('')}</div>
  </div>

  <div class="tb-section glass-card">
    <div class="tb-sectitle">手稿 · 源流 <span>撕裂分藏两馆</span></div>
    <div class="tb-src">
      <p><b>【手稿·可核验】</b>${esc(COIN_SOURCE.ms)}；${esc(COIN_SOURCE.lib)}；${esc(COIN_SOURCE.date)}。OTDO 转写：${esc(COIN_SOURCE.otdo)}。</p>
      <p><b>【研究】</b>${esc(COIN_SOURCE.refs)}。</p>
      <p><b>【文化层】</b>${esc(COIN_SOURCE.note)}</p>
    </div>
  </div>`;
}

/* ============================ 顶层渲染 ============================ */
export function renderTibetan() {
  return `
  <div class="tb-wrap">
    <div class="tb-tabs">
      <button type="button" class="tb-tab ${mode === 'dice' ? 'on' : ''}" data-tb-tab="dice">四面骰占 · ITJ 740</button>
      <button type="button" class="tb-tab ${mode === 'coin' ? 'on' : ''}" data-tb-tab="coin">金钱神课 · PT1055</button>
    </div>
    ${mode === 'dice' ? renderDice() : renderCoin()}
  </div>`;
}

/* ============================ v121 复现码 ============================ */
// 骰式与钱式都是随机结果，直接记录即可完整复现（判词由结果查表得出，无二次随机）
export function tibetanCode() {
  if (mode === 'coin') {
    if (!lastCoin) return null;
    return {
      kind: 'tibetan',
      data: { at: Date.now(), mode: 'coin', coin: lastCoin.slice(), question },
      title: '敦煌藏占 · 金钱神课',
      sub: `铜钱 ${lastCoin.map((i) => (COIN_MARKS[i - 1] || {}).mark || '?').join(' ＋ ')}`,
    };
  }
  if (!lastDice) return null;
  return {
    kind: 'tibetan',
    data: { at: Date.now(), mode: 'dice', dice: lastDice.slice(), question },
    title: '敦煌藏占 · 四面骰占',
    sub: `骰式 ${lastDice.join('-')}`,
  };
}

export function restoreTibetan(m, dice, coin, q) {
  mode = m === 'coin' ? 'coin' : 'dice';
  if (mode === 'coin') {
    if (!Array.isArray(coin) || coin.length !== 2) return false;
    lastCoin = coin.slice();
  } else {
    if (!Array.isArray(dice) || dice.length !== 3) return false;
    lastDice = dice.slice();
  }
  question = q || '';
  paint();
  return true;
}

/* ============================ 弹层 ============================ */
function ensureSheet() {
  if (document.getElementById('tb-sheet')) return;
  const el = document.createElement('div');
  el.className = 'tip-sheet';
  el.id = 'tb-sheet';
  el.innerHTML =
    '<div class="tip-mask" data-tb-close></div>' +
    '<div class="tip-card" role="dialog" aria-modal="true">' +
      '<div class="tip-head"><span class="tip-kicker">敦煌藏占</span><span class="tip-term" id="tb-term"></span>' +
      '<button class="tip-x" type="button" data-tb-close aria-label="关闭">✕</button></div>' +
      '<div class="tip-body" id="tb-body"></div></div>';
  document.body.appendChild(el);
}
function openOracles(face) {
  const list = diceFind(face);
  if (!list.length) return;
  ensureSheet();
  $('#tb-term').textContent = `骰式 ${face}${list.length > 1 ? ` · ${list.length}繇` : ''}`;
  $('#tb-body').innerHTML = list.map(o => diceCard(o, true)).join('') +
    `<div class="tb-sheet-src">${esc(DICE_SOURCE.ms)}｜OTDO: ${esc(DICE_SOURCE.otdo)}</div>`;
  $('#tb-sheet').classList.add('open');
}
function openCoinMark(idx) {
  const m = COIN_MARKS[idx - 1];
  if (!m) return;
  ensureSheet();
  $('#tb-term').textContent = m.zh;
  const toneZh = m.tone === '+' ? '偏吉' : m.tone === '-' ? '偏凶' : '平';
  $('#tb-body').innerHTML = `
    <div class="tb-mark-lg ${m.tone === '+' ? 'p' : m.tone === '-' ? 'm' : ''}">${esc(m.mark)}</div>
    <div class="tbf-name">${esc(m.zh)} <i>${esc(m.wylie)}</i></div>
    <div class="tbf-row"><span>象义</span><b>${esc(m.mean)}</b></div>
    <div class="tbf-row"><span>倾向</span><b>${toneZh}</b></div>
    <div class="tbf-note">${esc(m.note)}</div>
    <div class="tb-sheet-src">PT 1055 + IOL Tib J 744｜OTDO: ${esc(COIN_SOURCE.otdo)}</div>`;
  $('#tb-sheet').classList.add('open');
}
function closeSheet() { const s = $('#tb-sheet'); if (s) s.classList.remove('open'); }
function paint() { const b = $('#tibetan-body'); if (b) b.innerHTML = renderTibetan(); }

/* ============================ 事件委托 ============================ */
export function initTibetan() {
  if (inited) return;
  inited = true;
  document.addEventListener('click', (e) => {
    if (e.target.closest('[data-tb-close]')) { closeSheet(); return; }

    const tab = e.target.closest('[data-tb-tab]');
    if (tab) { mode = tab.getAttribute('data-tb-tab'); paint(); return; }

    const roll = e.target.closest('#tb-roll');
    if (roll) {
      lastDice = [r4(), r4(), r4()];
      paint();
      try { toast('已掷骰：' + lastDice.join('-')); } catch (_) {}
      return;
    }
    const coinroll = e.target.closest('#tb-coinroll');
    if (coinroll) {
      lastCoin = [r8(), r8()];
      paint();
      try { toast(`铜钱：${COIN_MARKS[lastCoin[0] - 1].mark} ＋ ${COIN_MARKS[lastCoin[1] - 1].mark}`); } catch (_) {}
      return;
    }
    const cell = e.target.closest('[data-tb-face]');
    if (cell) { openOracles(cell.getAttribute('data-tb-face')); return; }

    const coin = e.target.closest('[data-tb-coin]');
    if (coin) { openCoinMark(parseInt(coin.getAttribute('data-tb-coin'), 10)); }
  });
  document.addEventListener('input', (e) => {
    if (e.target && e.target.id === 'tb-question') question = e.target.value;
  });
}

/* ============================ 复制 ============================ */
export function tibetanCopyText() {
  const L = ['【钦天监 · 敦煌古藏文占卜】'];
  if (question) L.push('所问：' + question);
  if (mode === 'dice') {
    L.push('〔四面骰占 · IOL Tib J 740〕');
    if (lastDice) {
      const face = lastDice.join('-');
      L.push('骰式：' + face);
      const list = diceFind(face);
      if (!list.length) L.push('此式手稿不载繇辞（缺5式之一），不臆补。');
      else list.forEach((o, i) => {
        if (list.length > 1) L.push(`—— 第${i + 1}繇（${o[5] || '重卦'}）——`);
        L.push(`【${{ g: '吉', n: '平', b: '凶' }[o[3]]}】${o[2]}`);
        if (o[1]) L.push('发言神灵：' + diceGod(o[1]));
        L.push(`（${DICE_SOURCE.ms.split('，')[0]} 第${o[4]}行）`);
      });
    } else L.push('（尚未掷骰）');
  } else {
    L.push('〔金钱神课 · PT1055 + ITJ 744〕');
    if (lastCoin) {
      const [a, b] = lastCoin, t = coinTonePair(a, b);
      L.push(`第 ${a * 8 + b - 8} 卦：${COIN_MARKS[a - 1].zh} ＋ ${COIN_MARKS[b - 1].zh}，总断倾向：${t.zh}`);
      L.push('（原卷门类细判残缺，仅给符号古象合参之总断，不臆补）');
    } else L.push('（尚未掷钱）');
  }
  L.push('—— 底本 OTDO 古藏文转写自译；敦煌藏经洞，约9–10世纪。机器机械演卦，只给方向、不是命定。');
  return L.join('\n');
}
