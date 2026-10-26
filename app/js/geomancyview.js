// 阿拉伯地占 ʿIlm al-raml（Science of the Sand）/ 拉丁 Geomantia
// 钦天监·世界占卜典籍库 第一种。纯本地、随机撒点起卦，不接任何 AI。
//
// 红线（与全项目一致）：
//  - 只做「机器按古法规则机械演算 + 文献给原典 + 人判断」，不冒充命定。
//  - 16 符点型（四行奇偶）以 Unicode L2/23-218 提案码位（U+1CEE0–U+1CEEF，土行为最低位）
//    与普林斯顿中世纪地占数字化项目交叉核验；生成法＝母符（随机16行计数）→转置女符→
//    逐对同位 XOR 出侄符/证人/法官。法官必为偶数点（8 个 impartial 之一），否则判计算错误。
//  - 属性表（行星/星座/元素/吉凶/动静/出入）用现代通行的 Greer / Skinner 整理体系；
//    Martin of Spain《De geomantia》底本的系统性异文并列存档、绝不合成（见页底「流派」）。
//  - 象征义属地占公有领域传统（Agrippa 1533 / Cattan 1591 Turner 英译本 / Ibn Khaldun 1377），
//    现代整理本仅作编排参考。不拿现代流行网站规则冒充古原典。
import { $, escapeHtml, toast } from './state.js?v=121';

/* ============================ 16 符数据 ============================
 * rows = [火, 风, 水, 土]，自上而下；1=单点(奇/阳)，2=双点(偶/阴)。
 * v（Unicode 顺序值）= 土位*1 + 水*2 + 风*4 + 火*8（土行为最低位）。
 * gn 吉凶：+2 大吉 +1 吉 0 中性 -1 凶 -2 大凶；part 为局部例外说明。
 */
const FIGURES = [
  { v: 0, la: 'Populus', zh: '民众', en: 'the People', rows: [2, 2, 2, 2],
    planet: '月（盈）', sign: '巨蟹宫', inner: '水', outer: '水',
    gn: 0, stable: true, move: 'both', impartial: true, speed: '较快',
    mean: '人群、聚集、顺势。事多系于周遭众人与环境，非一人可独决；宜守正随众、静待其成。',
    note: '偶数点，客观之符；上下对称，出入两可。' },
  { v: 1, la: 'Tristitia', zh: '愁苦', en: 'Sorrow', rows: [2, 2, 2, 1],
    planet: '土星（顺）', sign: '宝瓶宫', inner: '土', outer: '风',
    gn: -1, stable: true, move: 'enter', impartial: false, speed: '迟慢',
    mean: '忧伤、迟滞、收缩、下沉。所问多阻而缓；宜踏实忍耐，不宜躁进。',
    note: '奇数点，主观之符；点势向下为入、主稳。' },
  { v: 2, la: 'Albus', zh: '洁白', en: 'White', rows: [2, 2, 1, 2],
    planet: '水星（顺）', sign: '双子宫', inner: '水', outer: '风',
    gn: 1, stable: true, move: 'enter', impartial: false, speed: '快速',
    mean: '清白、智慧、平和、小有所得。宜文书、谋划、和谈，利冷静筹算之事。',
    note: '奇数点，主观之符；点势向下为入、主稳。' },
  { v: 3, la: 'Fortuna Major', zh: '大吉运', en: 'Greater Fortune', rows: [2, 2, 1, 1],
    planet: '太阳（北赤·昼）', sign: '狮子宫', inner: '土', outer: '火',
    gn: 2, stable: true, move: 'enter', impartial: true, speed: '中等',
    mean: '大吉。凭自身实力而得的厚福，强盛、根基厚，往往先艰而后大成；吉由自力，非倖致。',
    note: '偶数点，客观之符；点势向下为入、主稳而长久。' },
  { v: 4, la: 'Rubeus', zh: '赤红', en: 'Red', rows: [2, 1, 2, 2],
    planet: '火星（逆）', sign: '天蝎宫', inner: '风', outer: '水',
    gn: -2, stable: false, move: 'exit', impartial: false, speed: '快速',
    mean: '暴烈、情欲、凶险、暗冲。古法：若此符落在第 1 宫（问卜者自身），此占当止、宜另择时而重问。',
    note: '奇数点，主观之符；点势向上为出、主动而速。' },
  { v: 5, la: 'Acquisitio', zh: '获得', en: 'Gain', rows: [2, 1, 2, 1],
    planet: '木星（顺）', sign: '人马宫', inner: '风', outer: '火',
    gn: 1, stable: true, move: 'enter', impartial: true, speed: '迟慢',
    mean: '获得、增益、进纳、成功。两峰向内如收纳，所问多主有所得、宜进取。',
    note: '偶数点，客观之符；点势向下为入、主稳。' },
  { v: 6, la: 'Conjunctio', zh: '结合', en: 'Conjunction', rows: [2, 1, 1, 2],
    planet: '水星（逆）', sign: '室女宫', inner: '风', outer: '土',
    gn: 0, stable: false, move: 'both', impartial: true, speed: '快速',
    mean: '结合、会合、复原。事物合而又分、失而复得；宜合作、中介、牵合，结果随所合对象而定。',
    note: '偶数点，客观之符；上下对称，出入两可。' },
  { v: 7, la: 'Caput Draconis', zh: '龙首', en: 'Head of the Dragon（北交点）', rows: [2, 1, 1, 1],
    planet: '北交点', sign: '人马宫', inner: '土', outer: '火',
    gn: 1, stable: true, move: 'enter', impartial: false, speed: '中等',
    mean: '开端、进入、上升。如新事登门而入；宜创始、入门、立足，利初不利终。',
    note: '奇数点，主观之符；点势向下为入、主稳。' },
  { v: 8, la: 'Laetitia', zh: '欢乐', en: 'Joy', rows: [1, 2, 2, 2],
    planet: '木星（逆）', sign: '双鱼宫', inner: '火', outer: '水',
    gn: 1, stable: false, move: 'exit', impartial: false, speed: '迟慢',
    mean: '喜乐、升高、意外之欢、和谐。事主愉快而向上，有渐入佳境之象。',
    note: '奇数点，主观之符；点势向上为出、主动。' },
  { v: 9, la: 'Carcer', zh: '牢狱', en: 'Prison', rows: [1, 2, 2, 1],
    planet: '土星（逆）', sign: '摩羯宫', inner: '土', outer: '土',
    gn: -1, stable: true, move: 'both', impartial: true, speed: '迟慢',
    mean: '拘束、限制、迟缓、固定。动则受困；唯问「求安稳、保现状」反主吉，宜守不宜动。',
    note: '偶数点，客观之符；上下对称，出入两可。' },
  { v: 10, la: 'Amissio', zh: '损失', en: 'Loss', rows: [1, 2, 1, 2],
    planet: '金星（逆）', sign: '金牛宫', inner: '火', outer: '土',
    gn: -1, stable: false, move: 'exit', impartial: true, speed: '中等',
    mean: '损失、支出、耗散。两峰向外如付出，所问多主失；唯问爱情（金星本宫）或盼摆脱之物，反可为吉。',
    note: '偶数点，客观之符；点势向上为出、主动而散。' },
  { v: 11, la: 'Puella', zh: '少女', en: 'Girl', rows: [1, 2, 1, 1],
    planet: '金星（顺）', sign: '天秤宫', inner: '水', outer: '风',
    gn: 1, stable: true, move: 'enter', impartial: false, speed: '中等',
    mean: '少女、和谐、美丽、善意。宜和合、美事、人际；略偏被动接纳，不宜强攻。',
    note: '奇数点，主观之符；点势向下为入、主稳。' },
  { v: 12, la: 'Fortuna Minor', zh: '小吉运', en: 'Lesser Fortune', rows: [1, 1, 2, 2],
    planet: '太阳（南赤·夜）', sign: '狮子宫', inner: '火', outer: '火',
    gn: 1, stable: false, move: 'exit', impartial: true, speed: '中等',
    mean: '小吉、短暂的成功，多赖外力相助。吉而不稳、速来速去；宜借势，不宜恃为久长。',
    note: '偶数点，客观之符；点势向上为出、主动而暂。' },
  { v: 13, la: 'Puer', zh: '少男', en: 'Boy', rows: [1, 1, 2, 1],
    planet: '火星（顺）', sign: '白羊宫', inner: '风', outer: '火',
    gn: -1, stable: false, move: 'exit', impartial: false, speed: '快速',
    mean: '少男、冲动、争斗、欲速。多主冲突与莽撞；唯问征战、竞赛、主动求爱可转为吉。',
    note: '奇数点，主观之符；点势向上为出、主动而速。' },
  { v: 14, la: 'Cauda Draconis', zh: '龙尾', en: 'Tail of the Dragon（南交点）', rows: [1, 1, 1, 2],
    planet: '南交点', sign: '室女宫', inner: '土', outer: '土',
    gn: -2, stable: false, move: 'exit', impartial: false, speed: '中等',
    mean: '结尾、退出、下降。不宜创始、谋新；唯宜了结、终止旧务、干净收尾。',
    note: '奇数点，主观之符；点势向上为出、主散。' },
  { v: 15, la: 'Via', zh: '道路', en: 'the Way', rows: [1, 1, 1, 1],
    planet: '月（亏）', sign: '巨蟹宫', inner: '水', outer: '水',
    gn: 0, stable: false, move: 'both', impartial: true, speed: '较快',
    mean: '道路、变化、流动。事在中途、多变而少定；问行旅、推进、疏通则吉。',
    note: '偶数点，客观之符；上下对称，出入两可。' },
];
const FIG_BY_V = FIGURES;

// 偶数点 impartial 集（唯此 8 符可做法官）：Pop/Via/Carcer/Conj/Amissio/Acq/FMaj/FMin
const IMPARTIAL_V = FIGURES.filter((f) => f.impartial).map((f) => f.v);

/* 12 宫（借中世纪占星，右到左编号）。q 为内置问事域，供用户选「所问归哪一宫」。 */
const HOUSES = [
  { n: 1, la: 'Vita', zh: '命宫', en: 'Life', topic: '问卜者本人、总体、自身处境' },
  { n: 2, la: 'Lucrum', zh: '财帛', en: 'Riches', topic: '求财、交易、动产、失物价值' },
  { n: 3, la: 'Fratres', zh: '兄弟', en: 'Brothers', topic: '兄弟姐妹、邻里、短途往来、书信' },
  { n: 4, la: 'Genitor', zh: '田宅', en: 'Father', topic: '父母、田宅、根基、祖业、旧事收尾' },
  { n: 5, la: 'Nati', zh: '男女', en: 'Sons', topic: '子女、创作、娱乐、桃花、孕事' },
  { n: 6, la: 'Valetudo', zh: '奴仆', en: 'Health', topic: '疾病健康、劳碌、下属、日常琐事' },
  { n: 7, la: 'Uxor', zh: '夫妻', en: 'Wife', topic: '婚姻、合伙、契约、对手、公开的他人' },
  { n: 8, la: 'Mors', zh: '疾厄', en: 'Death', topic: '危机、债务、恐惧、死亡、他人之财' },
  { n: 9, la: 'Itineris', zh: '迁移', en: 'Journeys', topic: '远行、高等学问、信仰、梦、远行归否' },
  { n: 10, la: 'Regnum', zh: '官禄', en: 'Kings', topic: '事业、官非、荣誉、名位、上司' },
  { n: 11, la: 'Benefacta', zh: '福德', en: 'Good Fortune', topic: '朋友、盟友、愿望、福德、靠山' },
  { n: 12, la: 'Carcer', zh: '玄秘', en: 'Prison', topic: '隐忧、囚禁、暗中之敌、隐秘事、医院' },
];

/* ============================ 起卦算法 ============================ */
function randRows() {
  // 古法：随手撒一行点（通常≥12 个），不预数；二二数尽，余一单则单点、尽则双点。
  // 每行点数取 12..27 的随机整数，奇偶即得单/双点。用 crypto 强化随机性（不可用时退回 Math.random）。
  const n = 12 + Math.floor(rand() * 16);
  return n % 2 === 1 ? 1 : 2;
}
function rand() {
  try {
    if (globalThis.crypto && globalThis.crypto.getRandomValues) {
      const a = new Uint32Array(1);
      globalThis.crypto.getRandomValues(a);
      return a[0] / 4294967296;
    }
  } catch (_) { /* 桩环境无 crypto */ }
  return Math.random();
}
// 行值：单点=1(bit1)、双点=2(bit0)；土行为最低位（Unicode L2/23-218 码位口径）
function rowsValue(rows) {
  return (rows[3] === 1 ? 1 : 0) + (rows[2] === 1 ? 2 : 0) +
         (rows[1] === 1 ? 4 : 0) + (rows[0] === 1 ? 8 : 0);
}
function figByRows(rows) { return FIG_BY_V[rowsValue(rows)]; }
// 同位相加＝逐行 XOR：两行皆单(1+1=2偶)或皆双(2+2=4偶)→双点2；一单一双(奇)→单点1
function addFigs(a, b) {
  return figByRows(a.rows.map((x, i) => ((x + b.rows[i]) % 2 === 0 ? 2 : 1)));
}

/** 由 4 母符（各 4 行）推出整盘：女=转置、侄=同位相加、证人/法官逐级相加。法官非偶点返回 null。 */
function chartFromMothers(mothers) {
  // 4 女：母符各行横向转置。女 d 第 r 行 = 第 r 母的第 d 行（d,r 皆 0..3）
  const daughters = [0, 1, 2, 3].map((d) => [0, 1, 2, 3].map((r) => mothers[r][d]));
  const f = [...mothers, ...daughters].map(figByRows); // f[0..3] 母, f[4..7] 女
  // 4 侄
  f[8] = addFigs(f[0], f[1]);
  f[9] = addFigs(f[2], f[3]);
  f[10] = addFigs(f[4], f[5]);
  f[11] = addFigs(f[6], f[7]);
  // 证人、法官
  f[12] = addFigs(f[8], f[9]);   // 右证人 Witness 1
  f[13] = addFigs(f[10], f[11]); // 左证人 Witness 2
  f[14] = addFigs(f[12], f[13]); // 法官 Judge
  f[15] = addFigs(f[0], f[14]);  // 超级法官 Super Judge（古法或用）
  if (!f[14].impartial) return null; // 法官必偶，否则重算
  return buildChart(f);
}

export function castGeomancy() {
  for (let attempt = 0; attempt < 64; attempt++) {
    // 4 母：每母由 4 随机行（火风水土）组成
    const mothers = [0, 1, 2, 3].map(() => [randRows(), randRows(), randRows(), randRows()]);
    const chart = chartFromMothers(mothers);
    if (chart) return chart;
  }
  throw new Error('地占：无法生成合法法官（偶数点），已重试 64 次');
}

// 宫位 -> 符（Greer 通行填法，经普林斯顿盾形盘布局核对）：
// H1=女4 f7 H2=女3 f6 H3=女2 f5 H4=女1 f4 H5=母4 f3 H6=母3 f2
// H7=母2 f1 H8=母1 f0 H9=侄4 f11 H10=侄3 f10 H11=侄2 f9 H12=侄1 f8
const HOUSE_FIG_IDX = [7, 6, 5, 4, 3, 2, 1, 0, 11, 10, 9, 8];
function buildChart(f) {
  const houseOf = {}; // 宫号 1..12 -> 符
  HOUSES.forEach((h, i) => { houseOf[h.n] = f[HOUSE_FIG_IDX[i]]; });
  return {
    figures: f,
    mothers: f.slice(0, 4), daughters: f.slice(4, 8), nieces: f.slice(8, 12),
    witnessR: f[12], witnessL: f[13], judge: f[14], superJudge: f[15],
    houseOf,
    rubeusFirst: houseOf[1].v === 4,
  };
}

/* ============================ 方向（古法机械合参） ============================ */
const GN_WORD = { 2: '大吉', 1: '吉', 0: '中性', [-1]: '凶', [-2]: '大凶' };
function judgeDirection(chart, qHouse) {
  const j = chart.judge, qf = chart.houseOf[qHouse], self = chart.houseOf[1];
  const w1 = chart.witnessR, w2 = chart.witnessL;
  // 机械加权：法官（总纲）与所问宫（此事）各 3 分，命宫与两证人各 1 分
  const score = j.gn * 3 + qf.gn * 3 + self.gn * 1 + w1.gn * 1 + w2.gn * 1;
  let cls, k, d;
  if (score >= 6) { cls = 'good'; k = '大有所得'; d = '诸象多吉，所问顺势可成。'; }
  else if (score >= 2) { cls = 'mild'; k = '偏吉'; d = '吉象居多，可行而仍需尽力。'; }
  else if (score >= -1) { cls = 'flat'; k = '两可难定'; d = '吉凶相抵，事在人为、宜再观望。'; }
  else if (score >= -5) { cls = 'warn'; k = '偏谨慎'; d = '阻象居多，宜缓、宜守、慎防失。'; }
  else { cls = 'bad'; k = '大不利'; d = '诸象多凶，此时强为恐有大损，宜止。'; }
  return { score, cls, k, d, j, qf, self, w1, w2 };
}

/* ============================ 点符 SVG ============================ */
export function figSVG(rows, extra = '') {
  const cys = [6, 14, 22, 30];
  let dots = '';
  rows.forEach((p, i) => {
    if (p === 1) dots += `<circle class="gm-dot" cx="12" cy="${cys[i]}" r="2.5"/>`;
    else dots += `<circle class="gm-dot" cx="7.6" cy="${cys[i]}" r="2.1"/><circle class="gm-dot" cx="16.4" cy="${cys[i]}" r="2.1"/>`;
  });
  return `<svg class="gm-fig ${extra}" viewBox="0 0 24 36" aria-hidden="true">${dots}</svg>`;
}

/* ============================ 渲染 ============================ */
let cur = null;     // 当前盾形盘
let qHouse = 1;     // 当前所问宫
let question = '';  // 默念之问题（仅记录展示，不参与随机）
let inited = false;

export function renderGeomancy() {
  if (!cur) cur = castGeomancy();
  const dir = judgeDirection(cur, qHouse);
  const qh = HOUSES[qHouse - 1];

  const chips = HOUSES.map((h) =>
    `<button class="gm-qchip ${h.n === qHouse ? 'on' : ''}" data-gm-q="${h.n}">${h.n}·${h.zh}</button>`).join('');

  // 盾形盘：8 列网格。顶行显示 House8→1（最右即 H1）。
  const cell = (fig, label, cls, style, tip) =>
    `<div class="gm-cell ${cls}" style="${style}" data-gm-fig="${fig.v}" ${tip ? `data-gm-tip="${tip}"` : ''}>
       ${figSVG(fig.rows)}
       <div class="gm-cname">${fig.zh}</div>
       <div class="gm-clabel">${label}</div>
     </div>`;

  const topRow = [8, 7, 6, 5, 4, 3, 2, 1].map((n) => {
    const hl = cur.houseOf[1].v === 4 && n === 1 ? ' gm-alert' : '';
    return cell(cur.houseOf[n], `第${n}宫·${HOUSES[n - 1].zh}`, 'gm-top' + hl, '', '');
  }).join('');

  const shield = `
    <div class="gm-shield">
      ${topRow}
      ${cell(cur.houseOf[12], '第12宫', 'gm-mid', 'grid-column:1 / span 2')}
      ${cell(cur.houseOf[11], '第11宫', 'gm-mid', 'grid-column:3 / span 2')}
      ${cell(cur.houseOf[10], '第10宫', 'gm-mid', 'grid-column:5 / span 2')}
      ${cell(cur.houseOf[9], '第9宫', 'gm-mid', 'grid-column:7 / span 2')}
      ${cell(cur.witnessL, '左证人', 'gm-wit', 'grid-column:2 / span 2')}
      ${cell(cur.witnessR, '右证人', 'gm-wit', 'grid-column:6 / span 2')}
      ${cell(cur.judge, '法官', 'gm-judge', 'grid-column:4 / span 2')}
    </div>`;

  const reasons = [
    { tag: `法官 · ${dir.j.zh}`, cls: `gn${dir.j.gn}`, text: `总纲之符，主全盘归宿。${dir.j.mean}` },
    { tag: `所问 · 第${qHouse}宫${qh.zh} · ${dir.qf.zh}`, cls: `gn${dir.qf.gn}`, text: qh.topic + '。' + dir.qf.mean },
    { tag: `自身 · 第1宫命宫 · ${dir.self.zh}`, cls: `gn${dir.self.gn}`, text: `主问卜者当下状态。${dir.self.mean}` },
    { tag: `右证人 · ${dir.w1.zh}`, cls: `gn${dir.w1.gn}`, text: `主事情的经过与外象。${dir.w1.mean}` },
    { tag: `左证人 · ${dir.w2.zh}`, cls: `gn${dir.w2.gn}`, text: `主问卜者一方与内因。${dir.w2.mean}` },
  ].map((r) =>
    `<div class="gm-reason"><span class="gm-rtag ${r.cls}">${r.tag}</span><span class="gm-rtext">${r.text}</span></div>`
  ).join('');

  const rubeusWarn = cur.rubeusFirst
    ? `<div class="gm-warnbox">古法警戒：赤红（Rubeus）落第 1 宫。Cattan 等传统主张此占心绪不宁、当止，宜凝神后另择时再问。</div>` : '';

  // 12 宫简表
  const houseTable = HOUSES.map((h) => {
    const f = cur.houseOf[h.n];
    return `<button class="gm-hrow" data-gm-fig="${f.v}">
      <span class="gm-hn">${h.n}</span>
      <span class="gm-hfig">${figSVG(f.rows, 'sm')}</span>
      <span class="gm-hmeta"><b>${h.zh}</b><i>${h.la}</i></span>
      <span class="gm-hf ${`gn${f.gn}`}">${f.zh}</span>
    </button>`;
  }).join('');

  // 16 符图鉴
  const gallery = FIGURES.map((f) =>
    `<button class="gm-gcard" data-gm-fig="${f.v}">
       ${figSVG(f.rows, 'sm')}
       <span class="gm-gzh">${f.zh}</span>
       <span class="gm-gla">${f.la}</span>
     </button>`).join('');

  return `
  <div class="gm-wrap">
    <div class="gm-intro glass-card">
      <div class="gm-title">阿拉伯地占 <span lang="ar">علم الرمل</span></div>
      <div class="gm-sub">ʿIlm al-raml「沙之科学」· Geomantia —— 默念所问，随手撒点成符，十六符推演成盾形之盘</div>
    </div>

    <div class="gm-cast glass-card">
      <label class="gm-qlabel">① 心中默念所问（可不填，仅自记）</label>
      <input id="gm-question" class="gm-qinput" type="text" maxlength="60" placeholder="例如：此事能成吗？" value="${escapeHtml(question)}"/>
      <label class="gm-qlabel">② 这事归到哪一宫（点选）</label>
      <div class="gm-qchips">${chips}</div>
      <button id="gm-cast-btn" class="gm-castbtn" type="button">✦ 凝神撒点 · 重排一盘</button>
      <div class="gm-castmeta">母符 4 · 女符 4（母符转置）· 侄符 4 · 证人 2 · 法官 1 · 超级法官 1，同位奇偶相加而成</div>
    </div>

    <div class="gm-verdict glass-card v-${dir.cls}">
      <div class="dv-title">这一占的倾向</div>
      <div class="dv-level">${dir.k}</div>
      <div class="dv-desc">${dir.d}</div>
      ${rubeusWarn}
      <div class="gm-reasons">${reasons}</div>
      <div class="gm-foot">综合倾向由「法官＋所问第${qHouse}宫＋命宫＋左右证人」的吉凶按古法机械合参（合参分 ${dir.score}），只给方向、不是命定；点任一符可看其星曜属性与原典象征。</div>
    </div>

    <div class="gm-section glass-card">
      <div class="gm-sectitle">盾形盘 <span>Shield Chart · 第1宫在最右，宫位自右向左数</span></div>
      ${shield}
      <div class="gm-shield-meta">
        超级法官（第1符＋法官）：<b data-gm-fig="${cur.superJudge.v}" class="gm-link">${cur.superJudge.zh} ${cur.superJudge.la}</b>
        ｜法官校验：${IMPARTIAL_V.includes(cur.judge.v) ? '<span class="gm-ok">偶数点 ✓ 计算合法</span>' : '<span class="gm-bad">非法</span>'}
      </div>
    </div>

    <div class="gm-section glass-card">
      <div class="gm-sectitle">十二宫落符 <span>借中世纪占星，宫位自右向左</span></div>
      <div class="gm-houses">${houseTable}</div>
    </div>

    <div class="gm-section glass-card">
      <div class="gm-sectitle">十六符图鉴 <span>点符查看属性与象征</span></div>
      <div class="gm-gallery">${gallery}</div>
    </div>

    <div class="gm-section glass-card">
      <div class="gm-sectitle">起卦法 · 源流 <span>Fact / Tradition 分层</span></div>
      <div class="gm-src">
        <p><b>【起卦法·可核验】</b>凝神于一问，在沙上（或纸上）由右向左随手画 16 行点，每行不预数、通常不少于 12 点；4 行为一组，二二数尽，余一单为单点、数尽为双点，得 4「母符 Matres」。取四母各行横读转置得 4「女符 Filiae」；相邻两符逐行奇偶相加（同为偶、异为奇）得 4「侄符 Neptes」；再两两相加得右、左「证人 Testes」，两证人相加得「法官 Iudex」。法官必含偶数点，否则加法有误须重算（此页已自动校验）。或再以第 1 符加法官为「超级法官」。</p>
        <p><b>【史实】</b>地占为阿拉伯传统 ʿIlm al-raml，12 世纪经 Gerard of Cremona 等译为拉丁文传入欧洲；Ibn Khaldun《历史绪论 Muqaddimah》(1377) 有专论。文艺复兴名家有 Agrippa《神秘哲学 De Occulta Philosophia》(1533)、Cattan《地占学 La Géomancie》(1553，1591 Turner 英译本)。本页算法与盾形盘底本据 Princeton 大学 Elizabeth Z. Bennett「Medieval Geomancy」数字化项目（含 Martin of Spain《De geomantia》中古文与 Turner 译本）。</p>
        <p><b>【传统解释】</b>16 符的行星、星座、元素、吉凶配属及宫位主事，属公有领域传统；本页属性表采用现代通行的 Greer / Skinner 整理体系编排，点型以 Unicode 提案 L2/23-218 分配码位（U+1CEE0–U+1CEEF，土行为最低位）交叉核验。</p>
      </div>
    </div>

    <div class="gm-section glass-card">
      <div class="gm-sectitle">流派异文 · 并列不合成 <span>Martin of Spain 底本 vs 现代体系</span></div>
      <div class="gm-src">
        <p>16 符的<b>点型</b>各流派一致；分歧在<b>星座／行星／昼夜／吉凶</b>的配属。普林斯顿所藏 Martin of Spain《De geomantia》中古英译本与现代 Greer 体系系统性不同，例如：道路 Via 现代属巨蟹宫，Martin 本作狮子宫；龙首 Caput 与龙尾 Cauda 的星座在两体系恰好互换；牢狱 Carcer 现代属摩羯宫，Martin 本作双鱼宫；大吉／小吉的太阳星座亦异。</p>
        <p>本盘演算与属性以现代通行体系为准，Martin 异文仅作并列存档，<b>不强行合一、不互相覆盖</b>；后续版本会把两套配属做成可切换对照。</p>
      </div>
    </div>
  </div>`;
}

/* ============================ 点符详情弹层 ============================ */
function figDetailHTML(f) {
  const gnCls = `gn${f.gn}`;
  const row = (k, v) => `<div class="gmf-row"><span>${k}</span><b>${v}</b></div>`;
  return `
    <div class="gmf-fig">${figSVG(f.rows, 'lg')}</div>
    <div class="gmf-name">${f.zh} <i>${f.la}</i></div>
    <div class="gmf-en">${f.en}</div>
    <div class="gmf-gn ${gnCls}">吉凶：${GN_WORD[f.gn]}</div>
    <div class="gmf-grid">
      ${row('行星', f.planet)}
      ${row('星座', f.sign)}
      ${row('主元素', f.inner)}
      ${row('外元素(据星座)', f.outer)}
      ${row('动静', f.stable ? '稳定 Stable' : '移动 Mobile')}
      ${row('出入', f.move === 'enter' ? '入 Entering（点势向下）' : f.move === 'exit' ? '出 Exiting（点势向上）' : '两可 Both（对称）')}
      ${row('主客观', f.impartial ? '偶数点·客观 Impartial' : '奇数点·主观 Partial')}
      ${row('传统迟速', f.speed + '（相对，非定数）')}
    </div>
    <div class="gmf-mean">${f.mean}</div>
    <div class="gmf-note">${f.note}</div>
    ${f.impartial ? '<div class="gmf-tag">偶数点，可充任法官。</div>' : '<div class="gmf-tag">奇数点，不能做法官。</div>'}`;
}

function ensureSheet() {
  if (document.getElementById('gm-sheet')) return;
  const el = document.createElement('div');
  el.className = 'tip-sheet';
  el.id = 'gm-sheet';
  el.innerHTML =
    '<div class="tip-mask" data-gm-close></div>' +
    '<div class="tip-card" role="dialog" aria-modal="true">' +
      '<div class="tip-head"><span class="tip-kicker">地占符</span><span class="tip-term" id="gm-term"></span>' +
      '<button class="tip-x" type="button" data-gm-close aria-label="关闭">✕</button></div>' +
      '<div class="tip-body" id="gm-body"></div></div>';
  document.body.appendChild(el);
}
function openFig(v) {
  const f = FIG_BY_V[v];
  if (!f) return;
  ensureSheet();
  $('#gm-term').textContent = `${f.zh} · ${f.la}`;
  $('#gm-body').innerHTML = figDetailHTML(f);
  $('#gm-sheet').classList.add('open');
}
function closeFig() { const s = $('#gm-sheet'); if (s) s.classList.remove('open'); }

/* 容器级委托：重撒点、选宫、点符看详情。重渲染后监听不丢，只绑一次。 */
export function initGeomancy() {
  if (inited) return;
  inited = true;
  document.addEventListener('click', (e) => {
    const close = e.target.closest('[data-gm-close]');
    if (close) { closeFig(); return; }
    const castBtn = e.target.closest('#gm-cast-btn');
    if (castBtn) {
      cur = castGeomancy();
      paint();
      try { toast('已重排一盘'); } catch (_) {}
      return;
    }
    const qchip = e.target.closest('[data-gm-q]');
    if (qchip) {
      qHouse = parseInt(qchip.getAttribute('data-gm-q'), 10);
      paint();
      return;
    }
    const fig = e.target.closest('[data-gm-fig]');
    if (fig) { openFig(parseInt(fig.getAttribute('data-gm-fig'), 10)); }
  });
  document.addEventListener('input', (e) => {
    if (e.target && e.target.id === 'gm-question') question = e.target.value;
  });
}
function paint() {
  const body = $('#geomancy-body');
  if (body) body.innerHTML = renderGeomancy();
}

/* ============================ 复制纯文本 ============================ */
export function geomancyCopyText() {
  if (!cur) cur = castGeomancy();
  const dir = judgeDirection(cur, qHouse);
  const L = [];
  L.push('【钦天监 · 阿拉伯地占 ʿIlm al-raml】');
  if (question) L.push('所问：' + question);
  L.push(`所归：第${qHouse}宫 ${HOUSES[qHouse - 1].zh}（${HOUSES[qHouse - 1].topic}）`);
  L.push(`倾向：${dir.k}（合参分 ${dir.score}）—— ${dir.d}`);
  L.push('');
  L.push('盾形盘（宫位自右向左，第1宫最右）');
  [8, 7, 6, 5, 4, 3, 2, 1].forEach((n) => { L.push(`  第${n}宫 ${HOUSES[n - 1].zh}：${cur.houseOf[n].zh} ${cur.houseOf[n].la}`); });
  [12, 11, 10, 9].forEach((n) => { L.push(`  第${n}宫 ${HOUSES[n - 1].zh}：${cur.houseOf[n].zh} ${cur.houseOf[n].la}`); });
  L.push(`  左证人：${cur.witnessL.zh} ${cur.witnessL.la}`);
  L.push(`  右证人：${cur.witnessR.zh} ${cur.witnessR.la}`);
  L.push(`  法官：${cur.judge.zh} ${cur.judge.la}（${cur.judge.impartial ? '偶数点·合法' : '非法'}）`);
  L.push(`  超级法官：${cur.superJudge.zh} ${cur.superJudge.la}`);
  L.push('');
  L.push(`法官${dir.j.zh}：${dir.j.mean}`);
  L.push(`所问宫${dir.qf.zh}：${dir.qf.mean}`);
  L.push(`命宫${dir.self.zh}：${dir.self.mean}`);
  L.push('—— 古法机械合参，只给方向、不是命定。底本：Princeton Medieval Geomancy / Agrippa / Cattan / Ibn Khaldun。');
  return L.join('\n');
}

// v121 复现码：地占虽为随机撒点起卦，但母符 4×4 行的奇偶一旦记下，女/侄/证人/法官皆可重推
function mothersBits(chart) {
  let bits = 0;
  chart.mothers.forEach((f, i) => f.rows.forEach((rv, r) => { if (rv === 1) bits |= 1 << (i * 4 + r); }));
  return bits;
}
export function geomancyCode() {
  if (!cur) return null;
  return {
    kind: 'geomancy',
    data: { at: Date.now(), mothers: mothersBits(cur), qHouse, question },
    title: '地占 · 盾形盘',
    sub: `所问第${qHouse}宫·${HOUSES[qHouse - 1].zh} · 法官 ${cur.judge.zh}`,
  };
}
export function restoreGeomancy(bits, house, q) {
  const mothers = [0, 1, 2, 3].map((i) => [0, 1, 2, 3].map((r) => (((bits >> (i * 4 + r)) & 1) ? 1 : 2)));
  const chart = chartFromMothers(mothers);
  if (!chart) return false;
  cur = chart;
  qHouse = Number.isInteger(house) && house >= 1 && house <= 12 ? house : 1;
  question = q || '';
  return true;
}
