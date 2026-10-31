// ritual.js — 三幕式排盘节奏（起盘门 → 盘面浮现 → 断语折叠）
// 钦天监核心体验：占不是"点开就出结果"，而是亲手把盘排出来——
// 幕一：进页只见起盘门（此刻时刻 + 起盘按钮），不动手不出盘；
// 幕二：点「起盘」后盘面逐块浮现（CSS stagger，爻落宫亮）；
// 幕三：盘面落定后，「观盘 · 看断语」折叠展开直断卡（复现码/历史路径可直入）。
import { $, nowDate, pad } from './state.js?v=124';

// 参与三幕式的页面（牌桌类有自己的起盘按钮，六爻摇钱本身就是仪式）
export const RITUAL_PAGES = ['meihua', 'qimen', 'daliuren', 'xiaoliuren', 'bazi', 'ziwei', 'astro', 'vedic'];

const GATES = {
  meihua: {
    glyph: '☳', title: '梅花易数', from: '宋 · 邵雍',
    how: '年月日时起数，除八得卦、除六取动爻——一念既动，以时成卦。',
    btn: '心念既动 · 以时起卦',
  },
  qimen: {
    glyph: '☷', title: '时家奇门', from: '《奇门遁甲统宗》',
    how: '节气定阴阳遁、时辰定局数，九宫飞布、三奇六仪各归其位。',
    btn: '焚香静气 · 起局',
  },
  daliuren: {
    glyph: '亥', title: '大六壬', from: '《六壬大全》',
    how: '月将加时，天地盘相错，四课既立而三传发用。',
    btn: '正时 · 起课',
  },
  xiaoliuren: {
    glyph: '🤏', title: '小六壬', from: '民间掌诀',
    how: '大安、留连、速喜、赤口、小吉、空亡——月、日、时三落指节。',
    btn: '掐指 · 起课',
  },
  bazi: {
    glyph: '甲', title: '八字命盘', from: '《渊海子平》',
    how: '以出生之年月日时排四柱、看大运——命盘由出生时刻而定，排盘即现。',
    btn: '排盘',
  },
  ziwei: {
    glyph: '紫', title: '紫微斗数', from: '《紫微斗数全书》',
    how: '依出生年月日时安命身、定五行局，百官朝拱各归其宫。',
    btn: '排盘',
  },
  astro: {
    glyph: '☉', title: '西洋占星', from: '古典占星 · Project Hindsight',
    how: '依出生时刻起十二宫，行星、星座、相位各归其位。',
    btn: '排盘',
  },
  vedic: {
    glyph: 'ॐ', title: '吠陀占星', from: 'Jyotiṣa · Parāśara',
    how: '恒星黄道（Lahiri ayanāṃśa），依出生时刻起 Rāśi 盘。',
    btn: '排盘',
  },
};

// 本会话已起盘标记（复现码/时间条路径可跳过门）
const casted = new Set();

export function isCasted(key) { return casted.has(key); }
export function castDone(key) { casted.add(key); }
export function resetGate(key) { casted.delete(key); }

function gateSub(key) {
  const d = nowDate();
  const hm = `${pad(d.getHours())}:${pad(d.getMinutes())}`;
  const isBirth = key === 'bazi' || key === 'ziwei' || key === 'astro' || key === 'vedic';
  return isBirth
    ? `<div class="rt-now">出生时刻已备 · 点下方起盘</div>`
    : `<div class="rt-now">此刻 · ${d.getFullYear()}年${d.getMonth() + 1}月${d.getDate()}日 ${hm}</div>`;
}

export function gateHTML(key) {
  const g = GATES[key];
  if (!g) return '';
  return `<div class="rt-gate glass-card" data-rt-gate="${key}">
    <div class="rt-glyph">${g.glyph}</div>
    <div class="rt-title">${g.title}</div>
    <div class="rt-from">${g.from}</div>
    <div class="rt-how">${g.how}</div>
    ${gateSub(key)}
    <button class="rt-castbtn" type="button" data-rt-start="${key}">${g.btn}</button>
    <div class="rt-tip">盘不虚起：点上方按钮，亲手把这一盘排出来</div>
  </div>`;
}

// 幕二包装：盘面逐块浮现；key 存在时顶部加「再起一盘」小栏
export function stage(html, key) {
  if (!html) return '';
  const bar = key ? `<div class="rt-stagebar"><button class="rt-recast" type="button" data-rt-recast="${key}">🜚 再起一盘</button></div>` : '';
  return `<div class="rt-stage">${bar}${html}</div>`;
}

// 幕三包装：断语折叠，默认收起
export function foldVerdict(html, label) {
  if (!html) return '';
  return `<details class="rt-verdict" data-rt-fold>
    <summary>${label || '观盘已毕 · 看断语'}</summary>
    <div class="rt-verdict-body">${html}</div>
  </details>`;
}

// 延迟浮现块（盘面之后、断语之前的解读内容）
export function late(html) {
  return html ? `<div class="rt-late">${html}</div>` : '';
}

export function initRitual(onStart) {
  document.addEventListener('click', (e) => {
    const b = e.target.closest('[data-rt-start]');
    if (b) {
      const key = b.getAttribute('data-rt-start');
      castDone(key);
      if (onStart) onStart(key);
      return;
    }
    const r = e.target.closest('[data-rt-recast]');
    if (r) {
      const key = r.getAttribute('data-rt-recast');
      resetGate(key);
      if (onStart) onStart(key, true);
    }
  });
}
