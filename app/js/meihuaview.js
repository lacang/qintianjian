// 梅花易数视图：指定时刻 本卦/互卦/变卦 + 体用（五行生克只列事实，不下吉凶）
// 统一北京时间；时刻可由「时间条」或复现码覆盖。
// v56：本/互/变三卦可点按、可左右滑动切换；经传面板随卦切换；体用生克图示 + 五行配色 + 动爻高亮。
import { meiHuaByTime, getGuaAnnotation, ZHOUYI_META } from '../vendor/liuyao-core.js?v=124';
import { judgeMeiHua, verdictCardHtml } from './verdicts.js?v=124';
import { resolveCastDate, nowDate, pad, toSec } from './state.js?v=124';
import { wxKey } from './classical.js?v=124';
import { guideHTML, T } from './tipview.js?v=124';
import { gateHTML, stage, foldVerdict, isCasted } from './ritual.js?v=124';
const isCastedMeiHua = () => isCasted('meihua');
import {
  mhRelation, mhGuaQi, MH_STEPS, MH_TIMELINE, MH_REL_QUOTE, MH_REL_SOURCE,
  MH_GUAQI_QUOTE, MH_GUAQI_SOURCE, MH_PARTY_QUOTE, MH_PARTY_SOURCE, MH_SOURCE_NOTE,
} from './reading.js?v=124';

// 八卦→三爻（上中下，自上而下显示）
const TRIGRAM_LINES = {
  乾: [1, 1, 1], 兑: [1, 1, 0], 离: [1, 0, 1], 震: [1, 0, 0],
  巽: [0, 1, 1], 坎: [0, 1, 0], 艮: [0, 0, 1], 坤: [0, 0, 0],
};
export function currentMeiHua(date = nowDate()) {
  const castDate = resolveCastDate(date); // 北京时间
  return { result: meiHuaByTime(castDate, { longitude: undefined, alreadyApparent: false }), castDate };
}

const POS_NAME = ['初', '二', '三', '四', '五', '上'];
const KEY_TITLE = { ben: '本卦', hu: '互卦', bian: '变卦' };

function trigramBlock(t, role, movingP) {
  const lines = TRIGRAM_LINES[t.gua]
    .map((v) => `<span class="mh-line ${v ? 'yang' : 'yin'} wx-bg-${wxKey(t.wuXing)}"></span>`)
    .join('');
  const flag = movingP ? `<span class="mh-moving-flag">动·${POS_NAME[movingP - 1]}</span>` : '';
  return `<div class="mh-tri">
    <div class="mh-lines">${lines}</div>
    <div class="mh-gname wx-txt-${wxKey(t.wuXing)}">${t.gua}${t.wuXing}</div>
    ${role ? `<div class="mh-role mh-role-${role}">${role}</div>` : ''}
    ${flag}
  </div>`;
}

function guaCard(key, h, movingSide, movingPosition, active) {
  const upperRole = movingSide === 'upper' ? '用' : '体';
  const lowerRole = movingSide === 'lower' ? '用' : '体';
  const upMove = movingSide === 'upper' ? movingPosition - 3 : 0;
  const lowMove = movingSide === 'lower' ? movingPosition : 0;
  const ann = getGuaAnnotation(h.name);
  return `<div class="mh-gua ${active ? 'active' : ''}" data-mh-card="${key}">
    <div class="mh-gua-title">${KEY_TITLE[key]}${ann ? ` <span class="mh-xu">第${ann.index}卦</span>` : ''}</div>
    <div class="mh-gua-name">${h.name}</div>
    <div class="mh-trigrams">
      ${trigramBlock(h.upper, movingSide ? upperRole : '', upMove)}
      <div class="mh-stack-sep">⋯</div>
      ${trigramBlock(h.lower, movingSide ? lowerRole : '', lowMove)}
    </div>
    <div class="mh-gua-sub">上<span class="wx-txt-${wxKey(h.upper.wuXing)}">${h.upper.gua}${h.upper.wuXing}</span> / 下<span class="wx-txt-${wxKey(h.lower.wuXing)}">${h.lower.gua}${h.lower.wuXing}</span></div>
  </div>`;
}

const SHENG = { 金: '水', 水: '木', 木: '火', 火: '土', 土: '金' };
const KE = { 金: '木', 木: '土', 土: '水', 水: '火', 火: '金' };

function relOf(ti, yong) {
  if (ti.wuXing === yong.wuXing) return { text: '体用比和', kind: 'same', arrow: '＝' };
  if (SHENG[yong.wuXing] === ti.wuXing) return { text: `用生体（${yong.wuXing}→${ti.wuXing}）`, kind: 'in-gen', arrow: '生' };
  if (SHENG[ti.wuXing] === yong.wuXing) return { text: `体生用（${ti.wuXing}→${yong.wuXing}）`, kind: 'out-gen', arrow: '生' };
  if (KE[yong.wuXing] === ti.wuXing) return { text: `用克体（${yong.wuXing}→${ti.wuXing}）`, kind: 'in-ke', arrow: '克' };
  return { text: `体克用（${ti.wuXing}→${yong.wuXing}）`, kind: 'out-ke', arrow: '克' };
}

// 月令卦气徽章（只标旺相休囚死事实，不附吉凶）
function guaQiBadge(gua, date, cls = '') {
  const q = mhGuaQi(gua.wuXing, date);
  return `<span class="mh-qi ${cls}"><b class="mh-qi-${q.state}">${q.state}</b><i>${q.season}令·${gua.gua}${gua.wuXing}</i></span>`;
}

// 作用于「体」的诸卦归位：用卦 / 体互·用互 / 变（体变·用变），逐卦给与体的生克事实
function actingRows(mh, date) {
  const ti = mh.ti;
  const tiSide = mh.movingSide === 'upper' ? 'lower' : 'upper'; // 体在不动的那个重卦
  const yongSide = mh.movingSide;
  const guaOf = (h, side) => (side === 'upper' ? h.upper : h.lower);
  const rows = [];
  const push = (tag, sub, gua, party) => {
    const r = relOf(ti, gua);
    const isTi = party === 'ti';
    rows.push(`<div class="mh-act-row ${isTi ? 'is-ti' : ''} mh-rel-${isTi ? 'same' : r.kind}">
      <span class="mh-act-tag">${tag}</span>
      <span class="mh-act-gua wx-txt-${wxKey(gua.wuXing)}">${gua.gua}${gua.wuXing}</span>
      ${guaQiBadge(gua, date, 'mh-act-qi')}
      <span class="mh-act-rel">${isTi ? '体党（与体比和）' : r.text}</span>
      <i class="mh-act-sub">${sub}</i>
    </div>`);
  };
  push('用卦', '本卦·动爻所在（事之端）', guaOf(mh.benGua, yongSide), 'yong');
  push('体互', `互卦之${tiSide === 'upper' ? '上互' : '下互'}`, guaOf(mh.huGua, tiSide), 'ti');
  push('用互', `互卦之${yongSide === 'upper' ? '上互' : '下互'}（中程之用）`, guaOf(mh.huGua, yongSide), 'yong');
  push('体变', `变卦之${tiSide === 'upper' ? '上卦' : '下卦'}`, guaOf(mh.bianGua, tiSide), 'ti');
  push('用变', `变卦之${yongSide === 'upper' ? '上卦' : '下卦'}（终局之用）`, guaOf(mh.bianGua, yongSide), 'yong');
  return rows.join('');
}

// 古法读卦次第（《梅花易数·占卜总诀》四步）+ 卦气、体用党说明
function methodBlock(mh, castDate, rel) {
  const steps = MH_STEPS.map((s) => `
    <div class="rd-step ${s.present === 'manual' ? 'is-manual' : ''}" data-rdstep="${s.n}">
      <div class="rd-step-h"><span class="rd-step-n">${s.n}</span><b>${s.title}</b>
        <i class="rd-step-badge ${s.present === 'manual' ? 'manual' : 'auto'}">${s.present === 'manual' ? '临事自察' : '盘上已列'}</i>
      </div>
      <div class="rd-step-body">
        <p class="rd-step-desc">${s.desc}</p>
        ${s.quote ? `<blockquote class="rd-quote">${s.quote}<cite>—— ${s.source}</cite></blockquote>` : ''}
      </div>
    </div>`).join('');

  const tiQi = mhGuaQi(mh.ti.wuXing, castDate);
  const yongQi = mhGuaQi(mh.yong.wuXing, castDate);

  return `<section class="rd-method mh-method">
    <div class="rd-method-h" data-rdtoggle>
      <span class="rd-method-ttl">古法读卦次第</span>
      <i class="rd-method-src">《梅花易数·占卜总诀》</i>
      <span class="rd-method-chevron">展开</span>
    </div>
    <div class="rd-method-body">
      <div class="rd-steps">${steps}</div>

      <div class="rd-sub-h">体用卦气（月令旺衰）</div>
      <div class="mh-qi-row">
        <div class="mh-qi-node"><span class="mh-node-tag">体</span>
          <b class="wx-txt-${wxKey(mh.ti.wuXing)}">${mh.ti.gua}${mh.ti.wuXing}</b>
          <span class="mh-qi-big mh-qi-${tiQi.state}">${tiQi.state}</span></div>
        <div class="mh-qi-node"><span class="mh-node-tag yong">用</span>
          <b class="wx-txt-${wxKey(mh.yong.wuXing)}">${mh.yong.gua}${mh.yong.wuXing}</b>
          <span class="mh-qi-big mh-qi-${yongQi.state}">${yongQi.state}</span></div>
      </div>
      <blockquote class="rd-quote">${MH_GUAQI_QUOTE}<cite>—— ${MH_GUAQI_SOURCE}</cite></blockquote>
      <p class="rd-note">${tiQi.note} 旺/相/休/囚/死为月令卦气的五种状态名，仅述气之盛衰，非吉凶结论。</p>

      <div class="rd-sub-h">本互变诸卦对「体」的生克归位</div>
      <div class="mh-act-list">${actingRows(mh, castDate)}</div>
      <blockquote class="rd-quote">${MH_PARTY_QUOTE}<cite>—— ${MH_PARTY_SOURCE}</cite></blockquote>
      <p class="rd-note">体用关系现盘：<b class="mh-rel-${rel.kind}">${rel.text}</b>。原书云「${MH_REL_QUOTE[rel.kind]}」<cite>—— ${MH_REL_SOURCE}</cite>；此为《梅花易数》一家之言，综合判断在人。</p>

      <p class="rd-source-note">${MH_SOURCE_NOTE}</p>
    </div>
  </section>`;
}

function classicPanel(key, h, isBen, movingPosition) {
  const ann = getGuaAnnotation(h.name);
  if (!ann) return `<div class="mh-panel" data-mh-panel="${key}"><div class="mh-classic-empty">该卦暂无经传白文。</div></div>`;
  const movingPosName = isBen && movingPosition ? (ann.lines[movingPosition - 1] || {}).position : '';
  // 本卦：六爻全列（动爻高亮置顶感），互/变：列六爻爻辞可展开；彖传/文言默认折叠（原文较长）
  const lineRows = ann.lines.map((x, idx) => {
    const isMoving = isBen && idx + 1 === movingPosition;
    return `<div class="mh-classic-row ${isMoving ? 'is-moving' : ''}">
      <span class="mh-juan">${x.position}${isMoving ? '<em>动</em>' : ''}</span>
      <div class="mh-juan-body">
        <p>${x.text}</p>
        ${x.xiaoxiang ? `<p class="mh-xiaoxiang"><b>小象</b>${x.xiaoxiang}</p>` : ''}
      </div>
    </div>`;
  }).join('');

  const tuanBlock = `
    <details class="mh-fold">
      <summary><b>彖传</b><i>释卦辞</i></summary>
      <p class="mh-fold-body">${ann.tuan}</p>
    </details>`;

  let extra = '';
  if (ann.yong) extra += `
    <div class="mh-classic-row"><span class="mh-juan">${ann.yong.position}</span><p>${ann.yong.text}</p></div>`;
  if (ann.wenyan) extra += `
    <details class="mh-fold mh-wenyan">
      <summary><b>文言传</b><i>仅乾坤二卦</i></summary>
      <p class="mh-fold-body">${ann.wenyan}</p>
    </details>`;

  return `<div class="mh-panel" data-mh-panel="${key}">
    <div class="mh-panel-tag">${ann.symbol} ${ann.name}　《周易》第${ann.index}卦 · ${KEY_TITLE[key]}</div>
    <div class="mh-classic-row"><span class="mh-juan">卦辞</span><p>${ann.judgment}</p></div>
    <div class="mh-classic-row"><span class="mh-juan">大象</span><p>${ann.daxiang}</p></div>
    ${tuanBlock}
    <div class="mh-lines-h">${isBen ? '六爻经传（动爻为所占之爻）' : '六爻经传（白文备览）'}</div>
    ${lineRows}
    ${extra}
  </div>`;
}

const MH_GUIDE = {
  title: '怎么看这一盘',
  intro: '梅花易数用时间起卦，核心是看「体」和「用」两个卦的关系。',
  steps: [
    { t: '体＝你自己，用＝你问的事', d: '不动的那个卦叫「体」，代表你自己；带动爻的那个卦叫「用」，代表你要问的这件事。这张盘里体是震木、用是巽木。', tip: 'tiyong', sel: '.mh-tiyong-diagram' },
    { t: '中间那个符号＝两者的关系', d: '符号写的就是「体」和「用」的五行关系。出现「＝」表示两边五行相同（比和），谁也克不了谁；出现箭头就是一方生/克另一方。', tip: 'wuxing', sel: '.mh-tiyong-detail' },
    { t: '三张卦卡＝事情的三段时间', d: '左边本卦＝现在，中间互卦＝过程／内情，右边变卦＝结果。点哪张卡，下面的《周易》原文就换成哪一张。', tip: 'hugua', sel: '.mh-three' },
    { t: '横条＝把三段时间连成一条线', d: '本→互→变，点任意一段可切换上面的卦卡；底下引的是《梅花易数》体用总诀原文。', sel: '.mh-timeline' },
    { t: '最下面＝《周易》原文', d: '每卦的卦辞、大象、六爻原文都在这里，有动爻的那一行会被单独标出来。', tip: 'guaci', sel: '.mh-classic' },
  ],
  note: '体用生克是梅花判断的地基；这张盘目前先给事实，综合直断即将接入。',
};

export function renderMeiHua(date = nowDate()) {
  if (!isCastedMeiHua()) return gateHTML('meihua');
  const { result: mh, castDate } = currentMeiHua(date);
  const ti = mh.ti, yong = mh.yong;
  const rel = relOf(ti, yong);

  const hh = `${castDate.getFullYear()}年${castDate.getMonth() + 1}月${castDate.getDate()}日 ${pad(castDate.getHours())}:${pad(castDate.getMinutes())} · 北京时间`;

  const html = `
    ${guideHTML(MH_GUIDE)}
    <div class="mh-wrap">
    <div class="mh-meta">${hh} · 第${mh.movingPosition}爻动（${mh.movingSide === 'upper' ? '上卦' : '下卦'}）</div>

    <div class="mh-tabs">
      <button type="button" class="mh-tab active" data-mh-tab="ben">本卦 · ${mh.benGua.name}</button>
      <button type="button" class="mh-tab" data-mh-tab="hu">互卦 · ${mh.huGua.name}</button>
      <button type="button" class="mh-tab" data-mh-tab="bian">变卦 · ${mh.bianGua.name}</button>
    </div>

    <div class="mh-three" data-mh-stage>
      ${guaCard('ben', mh.benGua, mh.movingSide, mh.movingPosition, true)}
      ${guaCard('hu', mh.huGua, null, 0, false)}
      ${guaCard('bian', mh.bianGua, null, 0, false)}
    </div>

    <div class="mh-tiyong-diagram">
      <div class="mh-node wx-bg-soft-${wxKey(ti.wuXing)}">
        <span class="mh-node-tag">体</span><b class="wx-txt-${wxKey(ti.wuXing)}">${ti.gua}</b>
        <span class="mh-node-wx wx-txt-${wxKey(ti.wuXing)}">${ti.wuXing}</span>
      </div>
      <div class="mh-rel-arrow mh-rel-${rel.kind}"><i>${rel.arrow}</i><span>${rel.text.replace(/（.*$/,'')}</span></div>
      <div class="mh-node wx-bg-soft-${wxKey(yong.wuXing)}">
        <span class="mh-node-tag yong">用</span><b class="wx-txt-${wxKey(yong.wuXing)}">${yong.gua}</b>
        <span class="mh-node-wx wx-txt-${wxKey(yong.wuXing)}">${yong.wuXing}</span>
      </div>
    </div>
    <div class="mh-tiyong-detail mh-rel-${rel.kind}">${rel.text}</div>

    <div class="mh-timeline">
      ${MH_TIMELINE.map((t, i) => `
        <button type="button" class="mh-tl ${t.key === 'ben' ? 'active' : ''}" data-mh-tab="${t.key}">
          <span class="mh-tl-dot">${i + 1}</span>
          <span class="mh-tl-name">${t.name}</span>
          <span class="mh-tl-stage">${t.stage}</span>
        </button>`).join('')}
      <p class="mh-tl-quote">「体卦为主，用卦为事；互卦为事之中间，刻应变卦为事之终。」<cite>《梅花易数·体用总诀》</cite></p>
    </div>

    ${methodBlock(mh, castDate, rel)}

    <div class="mh-classic">
      <div class="mh-classic-h">《周易》经传原文 <span class="mh-hint">点上方卦卡或左右滑动切换</span></div>
      ${classicPanel('ben', mh.benGua, true, mh.movingPosition)}
      ${classicPanel('hu', mh.huGua, false, 0)}
      ${classicPanel('bian', mh.bianGua, false, 0)}
      <div class="mh-classic-src">原文：${ZHOUYI_META.book}（${ZHOUYI_META.edition}）。象数体用依《梅花易数》起卦/体用说；只列经传原文与生克事实，不作吉凶断语。</div>
    </div>
    </div>
    ${foldVerdict(verdictCardHtml(judgeMeiHua(mh)))}`;
  return stage(html, 'meihua');
}


// 一键复制（始终含本卦经传）
export function meiHuaCopyText(date = nowDate()) {
  const { result: mh, castDate } = currentMeiHua(date);
  const fmt = (h) => `${h.gua}${h.wuXing}`;
  const L = [
    '【梅花易数 · 时间起卦】',
    `北京时间 ${castDate.getFullYear()}-${pad(castDate.getMonth() + 1)}-${pad(castDate.getDate())} ${pad(castDate.getHours())}:${pad(castDate.getMinutes())}`,
    `第${mh.movingPosition}爻动（${mh.movingSide === 'upper' ? '上卦' : '下卦'}）`,
    `本卦：${mh.benGua.name}（上${fmt(mh.benGua.upper)} 下${fmt(mh.benGua.lower)}）`,
    `互卦：${mh.huGua.name}（上${fmt(mh.huGua.upper)} 下${fmt(mh.huGua.lower)}）`,
    `变卦：${mh.bianGua.name}（上${fmt(mh.bianGua.upper)} 下${fmt(mh.bianGua.lower)}）`,
    `体 ${fmt(mh.ti)} ｜ 用 ${fmt(mh.yong)}`,
  ];
  ['ben', 'hu', 'bian'].forEach((k) => {
    const h = k === 'ben' ? mh.benGua : k === 'hu' ? mh.huGua : mh.bianGua;
    const ann = getGuaAnnotation(h.name);
    if (ann) {
      L.push(`—${KEY_TITLE[k]}《周易·${ann.name}》第${ann.index}卦—`);
      L.push(`卦辞：${ann.judgment}`);
      L.push(`大象：${ann.daxiang}`);
      if (k === 'ben') {
        const ml = ann.lines[mh.movingPosition - 1];
        if (ml) {
          L.push(`动爻 ${ml.position}：${ml.text}`);
          if (ml.xiaoxiang) L.push(`小象：${ml.xiaoxiang}`);
        }
      }
    }
  });
  return L.join('\n');
}

// 复现码数据 + 案例标题（时刻即全部，码极短）
export function meiHuaCode(date = nowDate()) {
  const { result: mh, castDate } = currentMeiHua(date);
  return {
    kind: 'meihua',
    data: { at: toSec(castDate.getTime()) },
    title: `${mh.benGua.name} 之 ${mh.bianGua.name}`,
    sub: `${castDate.getFullYear()}-${pad(castDate.getMonth() + 1)}-${pad(castDate.getDate())} ${pad(castDate.getHours())}:${pad(castDate.getMinutes())} · 第${mh.movingPosition}爻动`,
  };
}
