// 小六壬 · 掐指课：以农历月、日、时辰三数顺数六宫，取落宫断吉凶。
// 底本：民间通行本《小六壬》（旧题诸葛武侯《马前课》系统，属掌诀，无宋以前官定底本）。
// 红线：只用课法本身推导，不掺现代心理话术；流派分歧并列，不合成。
import { $, nowDate } from './state.js?v=117';
import { gateHTML, stage, foldVerdict, isCasted } from './ritual.js?v=117';
import { getDayCalendar, solarToSiZhu } from '../vendor/liuyao-core.js?v=117';
import { T } from './tipview.js?v=117';

const ZHI = ['子', '丑', '寅', '卯', '辰', '巳', '午', '未', '申', '酉', '戌', '亥'];

// 六宫：宫名 · 五行 · 掌诀（六神）· 吉凶 · 方位 · 占数 · 掌诀原文 · 断语 · 宜忌
// 数据本诸民间通行本《小六壬》各宫「诀曰」原文（方位、颜色、占数亦从通行本）
const GONG = [
  {
    name: '大安', wuxing: '木', shen: '青龙', luck: '吉', hue: 138,
    fang: '东方', se: '青', shu: '一、五、七',
    jue: '身不动时',
    song: '大安事事昌，求谋在东方，失物去不远，宅舍保安康。行人身未动，病者主无妨。',
    duan: '凡事主安稳，宜守不宜动。求财在东方，失物不远，行人即至，病者无妨，田宅可保。',
    yi: '谋定后动、守成、长线事',
    ji: '急进、强出头、临时改主意',
  },
  {
    name: '留连', wuxing: '水', shen: '玄武', luck: '凶', hue: 208,
    fang: '北方', se: '黑', shu: '二、八、十',
    jue: '卒未归时',
    song: '留连事难成，求谋日未明。官事只宜缓，去者来回程，失物南方见，急讨方遂心。',
    duan: '凡事主迟滞反复，纠缠难了。求谋日未明，去者未回，失物南方见，急讨方称心。',
    yi: '拖一拖、再打听、缓办',
    ji: '催逼、定死期限、签长约',
  },
  {
    name: '速喜', wuxing: '火', shen: '朱雀', luck: '吉', hue: 8,
    fang: '南方', se: '赤', shu: '三、六、九',
    jue: '人便至时',
    song: '速喜喜来临，求财向南行。失物申未午，逢人路上寻。官事有福德，病者无祸侵。',
    duan: '凡事主迅速得成，喜信将至。求财向南行，失物申未午，行人路上寻，病者无妨。',
    yi: '速办速决、主动出击、传递消息',
    ji: '拖延、观望、反复掂量',
  },
  {
    name: '赤口', wuxing: '金', shen: '白虎', luck: '凶', hue: 0,
    fang: '西方', se: '白', shu: '四、七、十',
    jue: '官事凶时',
    song: '赤口主口舌，官非切要防。失物急去寻，行人有惊慌。鸡犬多作怪，病者出西方。',
    duan: '凡事主口舌争执，官非惊恐。失物急去寻，行人有惊慌，病者出西方，忌争讼。',
    yi: '止争、留字据、避是非场合',
    ji: '当面争执、诉讼、酒后定事',
  },
  {
    name: '小吉', wuxing: '木', shen: '六合', luck: '大吉', hue: 96,
    fang: '东北', se: '黄', shu: '一、五、七',
    jue: '人来喜时',
    song: '小吉最吉昌，路上好商量。阴人来报喜，失物在坤方。行人即便至，交易甚是强。',
    duan: '凡事主和合顺遂，贵人相助。路上好商量，阴人来报喜，失物在坤方，行人即便至，交易甚是强。',
    yi: '谈合作、托人、成亲交易',
    ji: '独断、排斥中间人',
  },
  {
    name: '空亡', wuxing: '土', shen: '勾陈', luck: '大凶', hue: 42,
    fang: '中央', se: '黄', shu: '三、六、九',
    jue: '音信稀时',
    song: '空亡事不祥，阴人多乖张。求财无利益，行人有灾殃。失物寻不见，官事有刑伤。',
    duan: '凡事主落空无果，音信不通。求财无利益，行人有灾殃，失物寻不见，官事有刑伤。',
    yi: '先搁置、换方案、重立新起头',
    ji: '追加投入、指望旧人旧信、硬扛',
  },
];

// 六神主事（通行本配属）
const SHEN_MEAN = {
  青龙: '主喜庆财帛、贵人相助，事多顺遂',
  玄武: '主暗昧盗失、隐情不明，宜防小人',
  朱雀: '主口舌文书、消息往来，宜缄口慎言',
  白虎: '主凶伤道路、刚猛急切，宜避其锋芒',
  六合: '主和合成事、中介说合，宜托人斡旋',
  勾陈: '主迟滞勾连、田土纠缠，宜缓图勿急',
};
const WX_MEAN = {
  木: '木主生发条达，事有生长之机', 火: '火主炎上急迫，事多速来速去',
  土: '土主厚重迟滞，事体拖沓难起', 金: '金主肃杀决断，事多刚硬生变',
  水: '水主流动隐伏，事多迂回难测',
};
const LUCK_VAL = { 大吉: 2, 吉: 1, 凶: -1, 大凶: -2 };
const LUCK_CLS = { 大吉: 'best', 吉: 'good', 凶: 'bad', 大凶: 'worst' };

const CN_NUM = { 一: 1, 二: 2, 三: 3, 四: 4, 五: 5, 六: 6, 七: 7, 八: 8, 九: 9, 十: 10 };
const CN_MON = { 正: 1, 冬: 11, 腊: 12 };

function parseNongli(s) {
  const i = s.indexOf('年'), j = s.indexOf('月', i + 1);
  if (i < 0 || j < 0) return { month: 1, day: 1 };
  let mt = s.slice(i + 1, j);
  if (mt.length > 1) mt = mt[mt.length - 1]; // 闰月取末字
  const dt = s.slice(j + 1);
  return { month: CN_MON[mt] || CN_NUM[mt] || 1, day: cnDay(dt) };
}

function cnDay(t) {
  if (!t) return 1;
  if (t[0] === '初') return t.length === 1 ? 1 : (t[1] === '十' ? 10 : CN_NUM[t[1]] || 1);
  if (t[0] === '十') return 10 + (CN_NUM[t[1]] || 0);
  if (t[0] === '廿') return 20 + (CN_NUM[t[1]] || 0);
  if (t[0] === '二' && t[1] === '十') return 20 + (CN_NUM[t[2]] || 0);
  if (t[0] === '三' && t[1] === '十') return 30;
  return CN_NUM[t[0]] || 1;
}

function shichenIdx(h) { return Math.floor(((h + 1) % 24) / 2); }

// 起课：大安起月，月落宫起日，日落宫起时；三数顺数，末落之宫即课。
function cast(month, day, hIdx) {
  const step = (from, n) => ((from + n - 1) % 6 + 6) % 6;
  const a = step(0, month);
  const b = step(a, day);
  const c = step(b, hIdx + 1);
  return { a, b, c };
}

function ringSVG(month, day, hIdx, res) {
  const C = 108, R = 78;
  let g = '';
  for (let i = 0; i < 6; i++) {
    const ang = -Math.PI / 2 + i * Math.PI / 3;
    const cx = C + R * Math.cos(ang), cy = C + R * Math.sin(ang);
    const gi = GONG[i];
    const on = i === res.c;
    const passed = i === res.a || i === res.b;
    g += `<g class="xl-node${on ? ' on' : ''}${passed ? ' pass' : ''}" data-tip="xl-${i}">
      <circle class="xl-halo" cx="${cx.toFixed(1)}" cy="${cy.toFixed(1)}" r="${on ? 32 : 27}"/>
      <circle class="xl-disc" cx="${cx.toFixed(1)}" cy="${cy.toFixed(1)}" r="${on ? 29 : 25}"
        style="--h:${gi.hue}"/>
      <text class="xl-name" x="${cx.toFixed(1)}" y="${(cy - 3).toFixed(1)}">${gi.name}</text>
      <text class="xl-sub" x="${cx.toFixed(1)}" y="${(cy + 13).toFixed(1)}">${gi.wuxing}·${gi.shen}</text>
    </g>`;
  }
  const core = GONG[res.c];
  return `<svg class="xl-ring" viewBox="0 0 216 216" aria-hidden="true">
    <circle class="xl-orbit" cx="${C}" cy="${C}" r="${R}"/>
    ${g}
    <circle class="xl-core" cx="${C}" cy="${C}" r="30" style="--h:${core.hue}"/>
    <text class="xl-core-t" x="${C}" y="${C - 2}">${core.name}</text>
    <text class="xl-core-s" x="${C}" y="${C + 15}">落宫 · ${core.luck}</text>
  </svg>`;
}

// 三步落宫的吉凶走向
function readPath(res) {
  const vs = [GONG[res.a], GONG[res.b], GONG[res.c]].map((g) => LUCK_VAL[g.luck] || 0);
  const d1 = vs[1] - vs[0], d2 = vs[2] - vs[1];
  if (d1 <= 0 && d2 <= 0 && (d1 < 0 || d2 < 0)) return '三数一路走低：开头尚有指望，中途生变、末后落空。宜早收、勿恋战，别把本钱押到最后。';
  if (d1 >= 0 && d2 >= 0 && (d1 > 0 || d2 > 0)) return '三数一路走高：起手平平，越往后越见转机。宜耐住性子往前推，别在开头就放弃。';
  if (d1 > 0 && d2 < 0) return '先升后降：开局顺、中后段生阻。宜在顺的时候收手，拖久了反而不美。';
  if (d1 < 0 && d2 > 0) return '先降后升：开局受阻、后段转好。宜先忍后动，别在低谷里做决定。';
  return '三数平走，吉凶不显，事在人为。宜守常待时，不必强求。';
}

// 总方向：落宫吉凶为主，叠三数走向升降
function verdictXl(res) {
  const g = GONG[res.c];
  const v = [GONG[res.a], GONG[res.b], GONG[res.c]].map((x) => LUCK_VAL[x.luck] || 0);
  let s = v[2];
  if (v[2] > v[0]) s += 0.5;
  else if (v[2] < v[0]) s -= 0.5;
  const level = s >= 2.5 ? { k: '可进', d: '六宫里最吉的宫，且越走越顺。可以主动出手，托人、谈合作、办喜事都合宜。', cls: 'good' }
    : s >= 1 ? { k: '可行', d: '落宫属吉，大方向是顺的。按部就班往前推就好，别自己加戏。', cls: 'mild' }
      : s >= 0 ? { k: '宜守', d: '吉凶两平。守住手上的事、别开新摊子，等下一课再看。', cls: 'flat' }
        : s >= -2 ? { k: '宜缓', d: '落宫属凶。这事现在办不顺，宜缓一缓、先探清情况再动。', cls: 'warn' }
          : { k: '宜止', d: '落到最凶的宫，且一路走低。这事眼下不宜推进，先搁置、换方案、重立新起头。', cls: 'bad' };
  return { level, score: s };
}

export function renderXiaoLiuRen(at = nowDate()) {
  if (!isCasted('xiaoliuren')) return gateHTML('xiaoliuren');
  const cal = getDayCalendar({
    year: at.getFullYear(), month: at.getMonth() + 1, day: at.getDate(),
    hour: at.getHours(), minute: at.getMinutes(),
  });
  const sz = solarToSiZhu({
    year: at.getFullYear(), month: at.getMonth() + 1, day: at.getDate(),
    hour: at.getHours(), minute: at.getMinutes(),
  });
  const { month, day } = parseNongli(cal.nongli);
  const hIdx = shichenIdx(at.getHours());
  const res = cast(month, day, hIdx);
  const g = GONG[res.c];
  const vd = verdictXl(res);

  const steps = [
    { k: '起月', v: `正月起大安，顺数至${month}月`, land: GONG[res.a], n: res.a },
    { k: '起日', v: `自${GONG[res.a].name}起初一，数至初${day}`, land: GONG[res.b], n: res.b },
    { k: '起时', v: `自${GONG[res.b].name}起子时，数至${ZHI[hIdx]}时`, land: GONG[res.c], n: res.c },
  ];

  const threeHtml = steps.map((s) => `<div class="xl-three" data-tip="xl-${s.n}">
      <span class="xl3-k">${s.k}</span>
      <span class="xl3-n">${s.land.name}</span>
      <span class="xl3-l luck-${LUCK_CLS[s.land.luck]}">${s.land.luck}</span>
      <span class="xl3-j">「${s.land.jue}」</span>
    </div>`).join('');

  const allHtml = GONG.map((x, i) => `<div class="xl-all-row${i === res.c ? ' on' : ''}" data-tip="xl-${i}">
      <span class="xla-n">${x.name}</span>
      <span class="xla-w">${x.wuxing}·${x.shen}</span>
      <span class="xla-l luck-${LUCK_CLS[x.luck]}">${x.luck}</span>
      <span class="xla-s">占数 ${x.shu} · ${x.fang}</span>
    </div>`).join('');

  const vdBlock = `
    <div class="xl-verdict glass-card v-${vd.level.cls}">
      <div class="dv-top">
        <span class="dv-k">这一课的方向</span>
        <span class="dv-level">${vd.level.k}</span>
      </div>
      <p class="dv-main">${vd.level.d}</p>
      <p class="dv-rhythm"><b>落宫</b>${g.name}（${g.wuxing}·${g.shen}·${g.luck}）——「${g.jue}」</p>
      <p class="dv-rhythm"><b>节奏</b>${readPath(res)}</p>
      <div class="dv-io">
        <div class="xlr-io yi"><span class="xl-iok yi">宜</span>${g.yi}</div>
        <div class="xlr-io ji"><span class="xl-iok ji">忌</span>${g.ji}</div>
      </div>
      <p class="dv-src">此方向由落宫吉凶（民间通行本《小六壬》各宫断语）叠三数走向升降得出，只作倾向。</p>
    </div>`;

  const html = `
  <div class="xl-wrap">

    <div class="xl-head glass-card">
      <div class="xl-head-top">
        <span class="xl-tag">小六壬 · 掐指课</span>
        <span class="xl-time">${fmt(at)}</span>
      </div>
      <div class="xl-meta">
        <span>农历 <b>${cal.nongli}</b></span>
        <span class="dot">·</span>
        <span>${ZHI[hIdx]}时（${String(at.getHours()).padStart(2, '0')}:${String(at.getMinutes()).padStart(2, '0')}）</span>
      </div>
      <div class="xl-meta dim">
        <span>四柱 ${sz.yearGanZhi} ${sz.monthGanZhi} ${sz.dayGanZhi} ${sz.timeGanZhi}</span>
      </div>
    </div>

    <div class="xl-ring-card glass-card">
      ${ringSVG(month, day, hIdx, res)}
      <div class="xl-ring-hint">六宫固定排布，高亮者为最终落宫。<b>点任一宫看详解。</b></div>
    </div>

    <div class="xl-steps glass-card">
      ${steps.map((s) => `<div class="xl-step">
        <span class="xl-sk">${s.k}</span>
        <span class="xl-sv">${s.v}</span>
        <span class="xl-sland">${s.land.name}</span>
      </div>`).join('')}
    </div>

    <div class="xl-sec">三宫分看</div>
    <div class="xl-three-wrap glass-card">${threeHtml}</div>
    <div class="xl-note">月→日→时三步各自落宫，末落之宫为主断，前二宫是这件事的来路。点任一行看该宫详解。</div>

    <div class="xl-sec">这一课说了什么</div>
    <div class="xl-read glass-card">
      <div class="xlr">
        <span class="xlr-ph">路</span>
        <div class="xlr-body">
          <b>月落${T(GONG[res.a].name, 'xl-' + res.a)} → 日落${T(GONG[res.b].name, 'xl-' + res.b)} → 时落${T(GONG[res.c].name, 'xl-' + res.c)}</b>
          <p>${readPath(res)}</p>
        </div>
      </div>
      <div class="xlr">
        <span class="xlr-ph">宫</span>
        <div class="xlr-body">
          <b>落${T(g.name, 'xl-' + res.c)}（${T(g.wuxing, 'xl-wx-' + g.wuxing)} · ${T(g.shen, 'xl-shen-' + g.shen)} · ${T(g.luck, 'xl-luck-' + g.luck)}）——「${g.jue}」</b>
          <p>${g.duan}</p>
          <p class="dim">掌诀诀曰：${g.song}</p>
        </div>
      </div>
      <div class="xlr">
        <span class="xlr-ph">神</span>
        <div class="xlr-body">
          <b>${T(g.shen, 'xl-shen-' + g.shen)}当值 · 五行属${T(g.wuxing, 'xl-wx-' + g.wuxing)} · 方位${g.fang} · 色${g.se}</b>
          <p>${SHEN_MEAN[g.shen]}；${WX_MEAN[g.wuxing]}。</p>
        </div>
      </div>
      <div class="xlr">
        <span class="xlr-ph">数</span>
        <div class="xlr-body">
          <b>本宫占数：${g.shu}</b>
          <p>通行本以小六壬六宫配数，落宫之数即所应之数（如占数、期日、方位之数）。此为掌诀配属，非官定底本。</p>
        </div>
      </div>
      <div class="xlr">
        <span class="xlr-ph">行</span>
        <div class="xlr-body">
          <div class="xlr-io yi"><span class="xl-iok yi">宜</span>${g.yi}</div>
          <div class="xlr-io ji"><span class="xl-iok ji">忌</span>${g.ji}</div>
        </div>
      </div>
      <div class="xl-read-src">读法：落宫断语与掌诀取民间通行本《小六壬》（旧题诸葛武侯《马前课》），属掌诀，非官定底本；六神配属、方位颜色、占数各家小异，此处从通行本。吉凶走向由月—日—时三宫吉凶值的升降推出，供参详。</div>
    </div>

    <div class="xl-sec">六宫一览</div>
    <div class="xl-all glass-card">${allHtml}</div>
    <div class="xl-note">六宫按「大安→留连→速喜→赤口→小吉→空亡」顺序循环。点任一宫看它主什么。</div>

    <div class="xl-foot">掌诀只按「月—日—时」三数落宫，不含随机；同一时辰必得同一宫。</div>
  </div>`;
  return html;
}

function fmt(d) {
  const p = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`;
}

export function xiaoLiuRenCopyText(at = nowDate()) {
  const cal = getDayCalendar({
    year: at.getFullYear(), month: at.getMonth() + 1, day: at.getDate(),
    hour: at.getHours(), minute: at.getMinutes(),
  });
  const { month, day } = parseNongli(cal.nongli);
  const hIdx = shichenIdx(at.getHours());
  const res = cast(month, day, hIdx);
  const g = GONG[res.c];
  const vd = verdictXl(res);
  return [
    `【小六壬 · 掐指课】${fmt(at)}`,
    `农历：${cal.nongli} · ${ZHI[hIdx]}时`,
    `起课：${month}月落${GONG[res.a].name} → ${day}日落${GONG[res.b].name} → ${ZHI[hIdx]}时落${GONG[res.c].name}`,
    `方向：${vd.level.k} —— ${vd.level.d}`,
    `落宫：${g.name}（${g.wuxing}·${g.shen}·${g.luck}·${g.fang}）`,
    `掌诀：「${g.jue}」　占数：${g.shu}`,
    `诀曰：${g.song}`,
    `断语：${g.duan}`,
    `走向：${readPath(res)}`,
    `六神：${SHEN_MEAN[g.shen]}；${WX_MEAN[g.wuxing]}`,
    `宜：${g.yi}`,
    `忌：${g.ji}`,
    '',
    '课法：民间通行本《小六壬》（旧题诸葛武侯《马前课》）。掌诀只按三数落宫，不含随机。',
  ].join('\n');
}

export const xiaoLiuRenCode = () => '';
