// askview.js — 「问问」：先选问题，再推荐用哪个盘
// 定位：独立入口，与「按术数选盘」并存；首版只做 选问题 → 推荐术数 → 跳转。
// 纯前端，无外部依赖；跳转通过 qintian:ask-goto 事件交回 main.js。

const QUESTIONS = [
  { id: 'wealth',   icon: '💰', name: '钱的事',     sub: '赚得到吗 · 该不该投',   primary: 'liuyao', alts: ['qimen', 'bazi'] },
  { id: 'career',   icon: '💼', name: '工作与学业', sub: '该不该换 · 考不考得上', primary: 'liuyao', alts: ['ziwei', 'bazi'] },
  { id: 'love',     icon: '❤️', name: '两个人的事', sub: '他/她怎么想 · 能不能成', primary: 'liuyao', alts: ['ziwei', 'astro'] },
  { id: 'health',   icon: '🩺', name: '身体与安危', sub: '这病好不好 · 有没有险', primary: 'liuyao', alts: ['ziwei', 'bazi'] },
  { id: 'decision', icon: '🚦', name: '去还是留',   sub: '该不该做 · 什么时候做', primary: 'qimen',  alts: ['liuyao', 'meihua'] },
  { id: 'life',     icon: '🧭', name: '我是什么命', sub: '这一生怎么走',          primary: 'bazi',   alts: ['ziwei', 'astro'] },
  { id: 'house',    icon: '🏠', name: '房子的事',   sub: '看房 · 搬家 · 安床安灶', primary: 'yangzhai', alts: ['qimen', 'bazi'] },
];

const MOTIVES = [
  { id: 'get',    name: '我想要',       line: '怎么才能拿到手' },
  { id: 'lose',   name: '我怕失去',     line: '风险在哪、怎么守住' },
  { id: 'decide', name: '我拿不定主意', line: '帮我在两条路里选一条' },
  { id: 'know',   name: '我就是想弄明白', line: '想看清整件事的全貌' },
];

const TOOLS = {
  liuyao: { name: '六爻',     ico: '⚊', view: 'cast',   why: '针对具体一件事，问「成不成、什么时候成」最贴题。' },
  qimen:  { name: '奇门遁甲', ico: '奇', view: 'qimen',  why: '擅长挑时机、挑方向——什么时候做、往哪边做。' },
  bazi:   { name: '八字',     ico: '命', view: 'bazi',   why: '看一生的格局与大运，回答「我这辈子财运、事业怎么走」。' },
  ziwei:  { name: '紫微斗数', ico: '紫', view: 'ziwei',  why: '十二宫细分，看「我在哪个领域强、哪个领域弱」。' },
  astro:  { name: '西方占星', ico: '星', view: 'astro',  why: '看性格底色与人生主题，回答「我是个什么样的人」。' },
  meihua: { name: '梅花易数', ico: '梅', view: 'meihua', why: '起卦最快，随手一问就能给个方向。' },
  yangzhai: { name: '阳宅风水', ico: '宅', view: 'yangzhai', why: '看房、搬家、安床安灶：这套房子对你吉不吉、门主卧厨房怎么摆，走四步就出结论。' },
};

// 动机只改推荐语，不改主推术数
const MOTIVE_HINT = {
  get:    { pre: '你想拿到它——', tail: '重点看「怎么使劲、往哪使劲」。' },
  lose:   { pre: '你怕失去——',   tail: '重点看「风险在哪、怎么守」。' },
  decide: { pre: '你拿不定主意——', tail: '重点看「两条路各自的走向」。' },
  know:   { pre: '你想弄明白——', tail: '重点看「这件事的全貌和来龙去脉」。' },
};

let STAGE = 'q'; // q=选问题 m=选动机 r=推荐
let QID = null, MID = null;

export function resetAsk() { STAGE = 'q'; QID = null; MID = null; }

const esc = (s) => String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

function head(kick, title, sub) {
  return `<div class="ask-head"><div class="ask-kick">${kick}</div><div class="ask-title">${title}</div>${sub ? `<div class="ask-sub">${sub}</div>` : ''}</div>`;
}

function stageQ() {
  return `${head('问问', '你现在最想问什么？', '选一个最贴近的，我告诉你该用哪个盘看。')}
    <div class="ask-grid">
      ${QUESTIONS.map((q) => `<button type="button" class="ask-q" data-ask-q="${q.id}">
        <span class="aq-ico">${q.icon}</span>
        <span class="aq-name">${q.name}</span>
        <span class="aq-sub">${q.sub}</span>
      </button>`).join('')}
    </div>
    <div class="ask-note">不用懂术数。选完，我按古法推荐最贴题的盘。</div>`;
}

function stageM() {
  const q = QUESTIONS.find((x) => x.id === QID);
  return `${head('第二步 · 可跳过', `关于「${q ? q.name : ''}」，你现在是什么心情？`, '心情不影响用哪个盘，只影响我给你的提示。')}
    <div class="ask-motives">
      ${MOTIVES.map((m) => `<button type="button" class="ask-m" data-ask-m="${m.id}">
        <span class="am-name">${m.name}</span><span class="am-line">${m.line}</span>
      </button>`).join('')}
    </div>
    <div class="ask-actions">
      <button type="button" class="btn ghost" data-ask-back="1">‹ 重选问题</button>
      <button type="button" class="btn ghost" data-ask-skip="1">跳过，直接看推荐 ›</button>
    </div>`;
}

function toolCard(tid, isPrimary) {
  const t = TOOLS[tid];
  return `<div class="ask-tool ${isPrimary ? 'is-primary' : ''}">
    <div class="at-top">
      <span class="at-ico">${t.ico}</span>
      <span class="at-name">${t.name}</span>
      <span class="at-tag ${isPrimary ? '' : 'alt'}">${isPrimary ? '推荐' : '也可以'}</span>
    </div>
    <div class="at-why">${t.why}</div>
    <button type="button" class="btn ${isPrimary ? 'btn-primary' : ''} at-go" data-ask-open="${t.view}">现在就去 ›</button>
  </div>`;
}

function stageR() {
  const q = QUESTIONS.find((x) => x.id === QID);
  const hint = MID ? MOTIVE_HINT[MID] : null;
  return `${head('推荐', `关于「${q.name}」`, hint ? `${hint.pre}${hint.tail}` : '按古法，这件事最适合用下面这个盘来看。')}
    <div class="ask-main">${toolCard(q.primary, true)}</div>
    <div class="ask-alts">
      <div class="ask-alts-h">也可以看看</div>
      ${q.alts.map((a) => toolCard(a, false)).join('')}
    </div>
    <div class="ask-note">同一件事，不同术数看的角度不同——都看看，交叉印证更稳。</div>
    <div class="ask-actions">
      <button type="button" class="btn ghost" data-ask-reset="1">‹ 重新问一个</button>
    </div>`;
}

export function renderAsk() {
  const host = document.getElementById('ask-body');
  if (!host) return;
  host.innerHTML = STAGE === 'q' ? stageQ() : STAGE === 'm' ? stageM() : stageR();
}

export function bindAsk(root) {
  if (!root) return;
  root.addEventListener('click', (e) => {
    const q = e.target.closest('[data-ask-q]');
    if (q) { QID = q.dataset.askQ; STAGE = 'm'; renderAsk(); return; }
    const m = e.target.closest('[data-ask-m]');
    if (m) { MID = m.dataset.askM; STAGE = 'r'; renderAsk(); return; }
    if (e.target.closest('[data-ask-skip]')) { MID = null; STAGE = 'r'; renderAsk(); return; }
    if (e.target.closest('[data-ask-back]')) { STAGE = 'q'; renderAsk(); return; }
    if (e.target.closest('[data-ask-reset]')) { resetAsk(); renderAsk(); return; }
    const g = e.target.closest('[data-ask-open]');
    if (g) {
      document.dispatchEvent(new CustomEvent('qintian:ask-goto', { detail: { view: g.dataset.askOpen } }));
    }
  });
}
