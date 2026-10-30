// 紫微斗数 · 本命盘「交互式」回字格子视图
// 纯排盘：只列宫位/星曜/庙旺/生年四化/宫干四化/大限/三方四正等盘面事实，不作任何吉凶断语。
// 底座 iztro（MIT）经 liuyao-core 封装为纯 JSON（paiZiwei）。
// M8-a：点宫位→底部详情面板；三方四正高亮（本宫/对宫/三合三档）；只看重点；一键复制本宫。
// M8-b：宫干四化（飞化）路径追踪（起点→化×→星→落宫，自化/飞入区分，独立配色）；
//        飞入本宫清单；双宫对照台（只列客观事实，不做自然语言解读）。
import { paiZiwei } from '../vendor/liuyao-core.js?v=122';
import { judgeZiwei, verdictCardHtml } from './verdicts.js?v=122';
import { birthArgs, $, copyText } from './state.js?v=122';
import { guideHTML, T } from './tipview.js?v=122';
import { gateHTML, stage, foldVerdict, isCasted } from './ritual.js?v=122';

function esc(s) {
  return String(s == null ? '' : s).replace(/[&<>"']/g, (c) => (
    { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]
  ));
}

// 回字格阅读序：巳午未申（顶行左→右）、辰…酉、卯…戌、寅丑子亥（底行）。
const BR_ORDER = ['巳', '午', '未', '申', '辰', '卯', '寅', '丑', '子', '亥', '戌', '酉'];
const BR_AREA = { 巳: 'si', 午: 'wu', 未: 'wei', 申: 'shen', 辰: 'chen', 酉: 'you', 卯: 'mao', 戌: 'xu', 寅: 'yin', 丑: 'chou', 子: 'zi', 亥: 'hai' };

const MUTA_CLASS = { 禄: 'lu', 权: 'quan', 科: 'ke', 忌: 'ji' };
const SHA_STARS = new Set(['擎羊', '陀罗', '火星', '铃星', '地空', '地劫', '天马']);
const SIX_SHA = new Set(['擎羊', '陀罗', '火星', '铃星', '地空', '地劫']);
// 元素对照：主星 / 十二宫 / 四化 的含义 key
const STAR_KEY = {
  紫微:'zw-ziwei', 天机:'zw-tianji', 太阳:'zw-taiyang', 武曲:'zw-wuqu', 天同:'zw-tiantong',
  廉贞:'zw-lianzhen', 天府:'zw-tianfu', 太阴:'zw-taiyin', 贪狼:'zw-tanlang', 巨门:'zw-jumen',
  天相:'zw-tianxiang', 天梁:'zw-tianliang', 七杀:'zw-qisha', 破军:'zw-poqun',
};
const GONG_KEY = {
  命:'zw-gong-ming', 兄弟:'zw-gong-xiongdi', 夫妻:'zw-gong-fuqi', 子女:'zw-gong-zinv',
  财帛:'zw-gong-caibo', 疾厄:'zw-gong-jie', 迁移:'zw-gong-qianyi', 交友:'zw-gong-jiaoyou',
  奴仆:'zw-gong-jiaoyou', 官禄:'zw-gong-guanlu', 事业:'zw-gong-guanlu', 田宅:'zw-gong-tianzhai',
  福德:'zw-gong-fude', 父母:'zw-gong-fumu',
};
const HUA_KEY = { 禄:'zw-hua-lu', 权:'zw-hua-quan', 科:'zw-hua-ke', 忌:'zw-hua-ji' };

const BRIGHT_CLASS = (b) => ({ 庙: 'b-miao', 旺: 'b-wang', 得: 'b-de', 利: 'b-li', 平: 'b-ping', 不: 'b-bu', 陷: 'b-xian' }[b] || '');

// ---- 视图状态 ----
let CHART = null; // 当前盘（paiZiwei 结果）
let SEL = null; // 当前选中宫位地支
let FLY = null; // 当前飞化路径 { fromBr, mutagen, star, toBr }
let CMP = []; // 对照台（最多 2 个地支）
let ONLY_KEY = false; // 只看重点
let NAV = []; // 浏览历史（面包屑）

const palaceByBr = (br) => (CHART ? CHART.palaces.find((p) => p.earthlyBranch === br) : null);
const brMap = () => {
  const m = {};
  if (CHART) for (const p of CHART.palaces) m[p.earthlyBranch] = p;
  return m;
};
const gongName = (p) => (!p ? '' : (p.name.endsWith('宫') ? p.name : `${p.name}宫`));

function starHtml(s, major) {
  const muta = s.mutagen ? `<i class="zw-muta ${MUTA_CLASS[s.mutagen]}" data-tip="${HUA_KEY[s.mutagen] || ''}">${esc(s.mutagen)}</i>` : '';
  const bright = s.brightness && major ? `<i class="zw-bright ${BRIGHT_CLASS(s.brightness)}">${esc(s.brightness)}</i>` : '';
  const cls = major
    ? (SIX_SHA.has(s.name) ? 'zw-star major sha' : 'zw-star major')
    : `zw-star minor ${SIX_SHA.has(s.name) ? 'sha' : SHA_STARS.has(s.name) ? 'tianma' : 'ji'}`;
  const k = major ? STAR_KEY[s.name] : null;
  const inner = esc(s.name) + bright + muta;
  return k
    ? `<span class="${cls}" data-tip="${k}">${inner}</span>`
    : `<span class="${cls}">${inner}</span>`;
}

function cellHtml(p) {
  const majors = p.majorStars.length
    ? p.majorStars.map((s) => starHtml(s, true)).join('')
    : '<span class="zw-empty">空宫</span>';
  const minors = p.minorStars.map((s) => starHtml(s, false)).join('');
  const adj = p.adjectiveStars.map((s) => esc(s.name)).join(' ');
  const marks = [];
  if (p.isSoulPalace) marks.push('<b class="zw-mark soul">命</b>');
  if (p.isBodyPalace) marks.push('<b class="zw-mark body">身</b>');
  return `
  <div class="zw-cell${p.isSoulPalace ? ' is-soul' : ''}${p.isBodyPalace ? ' is-body' : ''}" data-br="${esc(p.earthlyBranch)}" style="grid-area:${BR_AREA[p.earthlyBranch]}" role="button" tabindex="0" aria-label="${esc(gongName(p))}">
    <div class="zw-cell-hd">
      <span class="zw-gz">${esc(p.ganZhi)}</span>
      <span class="zw-gname" data-tip="${GONG_KEY[p.name.replace('宫','')] || ''}">${esc(p.name)}${marks.join('')}</span>
      <span class="zw-decadal">${p.decadalRange[0]}–${p.decadalRange[1]}</span>
    </div>
    <div class="zw-majors">${majors}</div>
    <div class="zw-minors">${minors}</div>
    <div class="zw-adj">${esc(adj)}</div>
    <div class="zw-12gods"><span>${esc(p.changsheng12)}</span><span>${esc(p.boshi12)}</span></div>
  </div>`;
}

function centerHtml(c) {
  return `
  <div class="zw-center" style="grid-area:center">
    <div class="zw-c-title">紫微斗数 · 天盘</div>
    <div class="zw-c-row"><b>四柱</b>${esc(c.siZhu)}</div>
    <div class="zw-c-row"><b>局</b>${esc(c.fiveElementsClass)}<i class="zw-c-dot"></i><b>命主</b>${esc(c.soul)}<i class="zw-c-dot"></i><b>身主</b>${esc(c.body)}</div>
    <div class="zw-c-row"><b>命宫</b>${esc(c.soulBranch)}<i class="zw-c-dot"></i><b>身宫</b>${esc(c.bodyBranch)}</div>
    <div class="zw-c-row zw-c-sub">${esc(c.lunarDate)} · ${esc(c.time)}（${esc(c.timeRange)}）</div>
    <div class="zw-c-row zw-c-sub">${esc(c.zodiac)} · ${esc(c.sign)} · ${esc(c.gender)}命</div>
  </div>`;
}

function boardHtml(c) {
  const byBr = Object.fromEntries(c.palaces.map((p) => [p.earthlyBranch, p]));
  const cells = BR_ORDER.map((br) => cellHtml(byBr[br]));
  cells.push(centerHtml(c));
  return `<div class="zw-board" id="zw-board">${cells.join('')}</div>`;
}

// 三方四正档位判定：self / opp / san / dim（纯函数，便于无 DOM 环境测试）
function hlOf(selBr, br) {
  const p = palaceByBr(selBr);
  if (!p) return '';
  if (br === selBr) return 'self';
  if (br === p.sanFang.opposite) return 'opp';
  if (p.sanFang.sanhe.includes(br)) return 'san';
  return 'dim';
}

// 飞化路径档位判定：fly-from / fly-to / fly-self / dim（与三方四正配色区分）
function hlFlyOf(fly, br) {
  if (!fly) return '';
  if (fly.fromBr === fly.toBr && br === fly.fromBr) return 'fly-self';
  if (br === fly.fromBr) return 'fly-from';
  if (br === fly.toBr) return 'fly-to';
  return 'dim';
}

// 高亮：有飞化路径时用飞化档位，否则用三方四正档位（两套视觉，不混用）
function applyHighlight() {
  const board = $('#zw-board');
  if (!board) return;
  board.classList.toggle('zw-relating', !!SEL || !!FLY);
  board.classList.toggle('zw-flying', !!FLY);
  board.querySelectorAll('.zw-cell').forEach((el) => {
    el.classList.remove('hl-self', 'hl-opp', 'hl-san', 'hl-dim', 'hl-fly-from', 'hl-fly-to', 'hl-fly-self');
    if (FLY) {
      const k = hlFlyOf(FLY, el.dataset.br);
      if (k) el.classList.add(`hl-${k}`);
    } else if (SEL) {
      const k = hlOf(SEL, el.dataset.br);
      if (k) el.classList.add(`hl-${k}`);
    }
  });
}

// 由宫位 + 飞化条目生成路径对象（纯函数）
function flyPathOf(p, f) {
  if (!p || !f || !f.toBranch) return null;
  return { fromBr: p.earthlyBranch, mutagen: f.mutagen, star: f.star, toBr: f.toBranch };
}

// 宫干四化（飞化）区块
function flyHuaHtml(p) {
  const byBr = brMap();
  const rows = p.flyHua.map((f, i) => {
    const t = byBr[f.toBranch];
    const on = FLY && FLY.fromBr === p.earthlyBranch && FLY.mutagen === f.mutagen ? ' on' : '';
    const self = f.isSelf ? '<i class="zw-fly-self-tag">自化</i>' : '';
    const dest = f.toBranch
      ? `${esc(f.toBranch)}·${esc(t ? gongName(t) : '')}`
      : '<span class="zw-empty">不在盘上</span>';
    return `<button class="zw-fly${on}" data-fly="${i}"><i class="zw-muta ${MUTA_CLASS[f.mutagen]}">${esc(f.mutagen)}</i>${esc(f.star)}<s>→</s>${dest}${self}</button>`;
  }).join('');
  return `<div class="zw-d-row zw-d-fly"><b>宫干四化</b><span class="zw-fly-list">${rows}</span></div>`;
}

// 飞入本宫区块
function flyInHtml(p) {
  if (!p.flyIn.length) return '';
  const items = p.flyIn.map((x) => `<button class="zw-nav sm" data-goto="${esc(x.fromBranch)}"><i class="zw-muta ${MUTA_CLASS[x.mutagen]}">${esc(x.mutagen)}</i>${esc(x.fromBranch)}·${esc(gongName({ name: x.fromPalaceName }))}${esc(x.star)}</button>`).join('');
  return `<div class="zw-d-row zw-d-flyin"><b>飞入本宫</b><span class="zw-d-navlist">${items}</span></div>`;
}

// 飞化路径卡（选中某条飞化时显示在面板顶部）
function flyCardHtml() {
  if (!FLY) return '';
  const byBr = brMap();
  const from = byBr[FLY.fromBr];
  const to = byBr[FLY.toBr];
  const isSelf = FLY.fromBr === FLY.toBr;
  return `
  <div class="zw-path">
    <span class="zw-path-tag">飞化路径</span>
    <span class="zw-path-i">${esc(FLY.fromBr)}·${esc(gongName(from))}</span>
    <i>—<b class="zw-muta ${MUTA_CLASS[FLY.mutagen]}">${esc(FLY.mutagen)}</b>→</i>
    <span class="zw-path-i">${esc(FLY.star)}</span>
    <i>—落→</i>
    <span class="zw-path-i">${esc(FLY.toBr)}·${esc(gongName(to))}${isSelf ? '<i class="zw-fly-self-tag">自化</i>' : ''}</span>
    <button class="zw-path-x" id="zw-fly-clear" aria-label="取消路径">×</button>
  </div>`;
}

// 底部详情面板
function detailHtml(p) {
  if (!p) return '';
  const byBr = brMap();
  const opp = byBr[p.sanFang.opposite];
  const mutaList = [...p.majorStars, ...p.minorStars].filter((s) => s.mutagen);
  const muta = mutaList.length ? mutaList.map((s) => `${esc(s.name)}化${esc(s.mutagen)}`).join('、') : '无';
  let borrow = '';
  if (p.isEmpty && opp && opp.majorStars.length) {
    borrow = `<div class="zw-d-row zw-d-borrow"><b>空宫</b>本宫无十四主星，借对宫（${esc(opp.earthlyBranch)}·${esc(gongName(opp))}）${opp.majorStars.map((s) => esc(s.name)).join('、')}</div>`;
  }
  const navBtns = [
    `<button class="zw-nav" data-goto="${esc(p.sanFang.opposite)}"><i>对宫</i>${esc(p.sanFang.opposite)}·${esc(opp ? gongName(opp) : '')}</button>`,
    ...p.sanFang.sanhe.map((br) => {
      const q = byBr[br];
      return `<button class="zw-nav" data-goto="${esc(br)}"><i>三合</i>${esc(br)}·${esc(q ? gongName(q) : '')}</button>`;
    }),
  ].join('');
  const inCmp = CMP.includes(p.earthlyBranch);
  return `
  ${flyCardHtml()}
  <div class="zw-d-hd">
    <span class="zw-d-title">${esc(gongName(p))}</span>
    <span class="zw-d-gz">${esc(p.ganZhi)}</span>
    ${p.isSoulPalace ? '<b class="zw-mark soul">命</b>' : ''}${p.isBodyPalace ? '<b class="zw-mark body">身</b>' : ''}
    <span class="zw-d-dec">大限 ${p.decadalRange[0]}–${p.decadalRange[1]}（${esc(p.decadalGanZhi)}）</span>
  </div>
  <div class="zw-d-row"><b>主星</b><span class="zw-d-stars">${p.majorStars.length ? p.majorStars.map((s) => starHtml(s, true)).join('') : '<span class="zw-empty">空宫</span>'}</span></div>
  ${p.minorStars.length ? `<div class="zw-d-row"><b>辅星</b><span class="zw-d-stars">${p.minorStars.map((s) => starHtml(s, false)).join('')}</span></div>` : ''}
  ${p.adjectiveStars.length ? `<div class="zw-d-row"><b>杂曜</b>${p.adjectiveStars.map((s) => esc(s.name)).join(' ')}</div>` : ''}
  <div class="zw-d-row"><b>生年四化</b>${muta}</div>
  ${borrow}
  ${flyHuaHtml(p)}
  ${flyInHtml(p)}
  <div class="zw-d-row zw-d-nav"><b>三方四正</b>${navBtns}</div>
  <div class="zw-d-foot">
    <button class="copy-btn sm" id="zw-copy-palace">复制本宫</button>
    <button class="zw-tgl sm${inCmp ? ' on' : ''}" id="zw-cmp-add">${inCmp ? '移出对照' : '加入对照'}</button>
    <span class="zw-d-hint">只列盘面事实，不作吉凶判断</span>
  </div>`;
}

// 两宫客观关系（只陈述结构事实，不做解释）
function relateOf(a, b) {
  if (!a || !b) return '';
  if (a.earthlyBranch === b.earthlyBranch) return '同一宫位';
  const out = [];
  if (a.sanFang.opposite === b.earthlyBranch) out.push('互为对宫（六冲）');
  if (a.sanFang.sanhe.includes(b.earthlyBranch)) out.push('互为三合');
  const ab = a.flyHua.filter((f) => f.toBranch === b.earthlyBranch).map((f) => `${f.mutagen}${f.star}`);
  if (ab.length) out.push(`${gongName(a)} 宫干飞化入 ${gongName(b)}（${ab.join('、')}）`);
  const ba = b.flyHua.filter((f) => f.toBranch === a.earthlyBranch).map((f) => `${f.mutagen}${f.star}`);
  if (ba.length) out.push(`${gongName(b)} 宫干飞化入 ${gongName(a)}（${ba.join('、')}）`);
  return out.length ? out.join('；') : '无直接对宫／三合／宫干飞化往来';
}

// 双宫对照台（并排客观事实表）
function compareHtml() {
  if (CMP.length < 1) return '';
  const byBr = brMap();
  const ps = CMP.map((br) => byBr[br]).filter(Boolean);
  if (!ps.length) return '';
  const cell = (p) => (p ? p : null);
  const row = (label, fn) => `<tr><th>${esc(label)}</th>${ps.map((p) => `<td>${cell(p) ? fn(p) : '—'}</td>`).join('')}</tr>`;
  const rows = [
    row('宫职', (p) => `${esc(gongName(p))}${p.isSoulPalace ? ' 〔命〕' : ''}${p.isBodyPalace ? ' 〔身〕' : ''}`),
    row('干支', (p) => esc(p.ganZhi)),
    row('主星', (p) => (p.majorStars.length ? p.majorStars.map((s) => starHtml(s, true)).join('') : '<span class="zw-empty">空宫</span>')),
    row('辅星', (p) => (p.minorStars.length ? p.minorStars.map((s) => starHtml(s, false)).join('') : '—')),
    row('杂曜', (p) => (p.adjectiveStars.length ? p.adjectiveStars.map((s) => esc(s.name)).join(' ') : '—')),
    row('生年四化', (p) => {
      const m = [...p.majorStars, ...p.minorStars].filter((s) => s.mutagen);
      return m.length ? m.map((s) => `${esc(s.name)}化${esc(s.mutagen)}`).join('、') : '—';
    }),
    row('宫干四化', (p) => p.flyHua.map((f) => `<span class="zw-fly-mini">${esc(f.mutagen)}${esc(f.star)}→${esc(f.toBranch)}${f.isSelf ? '<i>自</i>' : ''}</span>`).join('')),
    row('三方四正', (p) => `${esc(p.sanFang.opposite)}｜${p.sanFang.sanhe.map((b) => esc(b)).join('、')}`),
    row('大限', (p) => `${p.decadalRange[0]}–${p.decadalRange[1]}（${esc(p.decadalGanZhi)}）`),
  ].join('');
  const rel = ps.length === 2 ? `<div class="zw-cmp-rel"><b>结构关系</b>${esc(relateOf(ps[0], ps[1]))}</div>` : '';
  return `
  <div class="zw-cmp">
    <div class="zw-cmp-hd">
      <span class="zw-cmp-t">对照台</span>
      <button class="zw-tgl sm" id="zw-cmp-copy">复制对照</button>
      <button class="zw-tgl sm" id="zw-cmp-clear">清空</button>
    </div>
    <table class="zw-cmp-tb"><tbody>${rows}</tbody></table>
    ${rel}
    <div class="zw-cmp-note">只并排陈列两宫盘面事实，不生成任何解读。</div>
  </div>`;
}

// 复制对照文本（结构化纯文本）
function copyCompareContext() {
  const byBr = brMap();
  const ps = CMP.map((br) => byBr[br]).filter(Boolean);
  if (!ps.length) return '';
  const L = ['【紫微斗数·本命盘｜双宫对照】'];
  L.push(`四柱 ${CHART.siZhu}｜${CHART.fiveElementsClass}｜命宫在${CHART.soulBranch} 身宫在${CHART.bodyBranch}`);
  const sline = (s, major) => s.name + (major && s.brightness ? s.brightness : '') + (s.mutagen ? '化' + s.mutagen : '');
  for (const p of ps) {
    L.push(`—— ${gongName(p)}（${p.ganZhi}）${p.isSoulPalace ? '〔命〕' : ''}${p.isBodyPalace ? '〔身〕' : ''} ——`);
    L.push(`主星：${p.majorStars.length ? p.majorStars.map((s) => sline(s, true)).join('、') : '空宫'}`);
    if (p.minorStars.length) L.push(`辅星：${p.minorStars.map((s) => sline(s, false)).join('、')}`);
    if (p.adjectiveStars.length) L.push(`杂曜：${p.adjectiveStars.map((s) => s.name).join('、')}`);
    const m = [...p.majorStars, ...p.minorStars].filter((s) => s.mutagen);
    L.push(`生年四化：${m.length ? m.map((s) => `${s.name}化${s.mutagen}`).join('、') : '无'}`);
    L.push(`宫干四化：${p.flyHua.map((f) => `${f.mutagen}${f.star}→${f.toBranch}${f.isSelf ? '(自化)' : ''}`).join('、')}`);
    L.push(`三方四正：对宫 ${p.sanFang.opposite}；三合 ${p.sanFang.sanhe.join('、')}`);
    L.push(`大限：${p.decadalRange[0]}–${p.decadalRange[1]}（${p.decadalGanZhi}）`);
  }
  if (ps.length === 2) L.push(`结构关系：${relateOf(ps[0], ps[1])}`);
  return L.join('\n');
}

function renderDetail() {
  const el = $('#zw-detail');
  if (!el) return;
  if (!SEL) {
    el.innerHTML = '<div class="zw-d-empty">点选宫位查看详情 · 再点一次取消 · 三方四正自动高亮</div>';
    return;
  }
  el.innerHTML = detailHtml(palaceByBr(SEL));
}

function renderCompare() {
  const el = $('#zw-compare');
  if (!el) return;
  el.innerHTML = compareHtml();
}

function renderCrumb() {
  const el = $('#zw-crumb');
  if (!el) return;
  if (!NAV.length && !SEL) { el.hidden = true; el.innerHTML = ''; return; }
  const byBr = brMap();
  const parts = [...NAV, SEL].filter(Boolean).map((br) => {
    const p = byBr[br];
    return `<span class="zw-crumb-i">${esc(br)}·${esc(p ? gongName(p) : '')}</span>`;
  });
  el.hidden = false;
  el.innerHTML = `<button class="zw-crumb-back" id="zw-crumb-back" aria-label="返回">‹ 返回</button><span class="zw-crumb-path">${parts.join('<i>›</i>')}</span>`;
}

function selectPalace(br, pushHist = true) {
  if (br && pushHist && br !== SEL) NAV.push(SEL);
  if (br === SEL && pushHist) br = null; // 再点同一宫=取消
  SEL = br;
  FLY = null; // 换宫位即退出飞化路径
  applyHighlight();
  renderDetail();
  renderCrumb();
}

function setFly(path) {
  if (!path) { FLY = null; } else if (FLY && FLY.fromBr === path.fromBr && FLY.mutagen === path.mutagen) {
    FLY = null; // 再点同一条=取消
  } else {
    FLY = path;
  }
  applyHighlight();
  renderDetail();
}

function goBack() {
  const prev = NAV.length ? NAV.pop() : null;
  selectPalace(prev, false);
}

function toggleCompare(br) {
  const i = CMP.indexOf(br);
  if (i >= 0) CMP.splice(i, 1);
  else { CMP.push(br); while (CMP.length > 2) CMP.shift(); }
  renderDetail();
  renderCompare();
}

// 复制当前宫位上下文（结构化纯文本；只复制所选局部，不导出整盘）
function copyPalaceContext(br) {
  const p = palaceByBr(br);
  if (!p) return '';
  const byBr = brMap();
  const opp = byBr[p.sanFang.opposite];
  const sline = (s, major) => s.name + (major && s.brightness ? s.brightness : '') + (s.mutagen ? '化' + s.mutagen : '');
  const L = [];
  L.push(`【紫微斗数·本命盘｜${gongName(p)}（${p.ganZhi}）${p.isSoulPalace ? '〔命〕' : ''}${p.isBodyPalace ? '〔身〕' : ''}】`);
  L.push(`四柱 ${CHART.siZhu}｜${CHART.fiveElementsClass}｜命宫在${CHART.soulBranch} 身宫在${CHART.bodyBranch}`);
  L.push(`主星：${p.majorStars.length ? p.majorStars.map((s) => sline(s, true)).join('、') : '空宫'}`);
  if (p.minorStars.length) L.push(`辅星：${p.minorStars.map((s) => sline(s, false)).join('、')}`);
  if (p.adjectiveStars.length) L.push(`杂曜：${p.adjectiveStars.map((s) => s.name).join('、')}`);
  const mutaList = [...p.majorStars, ...p.minorStars].filter((s) => s.mutagen);
  L.push(`生年四化：${mutaList.length ? mutaList.map((s) => `${s.name}化${s.mutagen}`).join('、') : '无'}`);
  if (p.isEmpty && opp && opp.majorStars.length) {
    L.push(`空宫：借对宫（${opp.earthlyBranch}·${gongName(opp)}）${opp.majorStars.map((s) => s.name).join('、')}`);
  }
  L.push(`宫干四化：${p.flyHua.map((f) => `${f.mutagen}${f.star}→${f.toBranch ? `${f.toBranch}·${gongName(byBr[f.toBranch])}` : '不在盘上'}${f.isSelf ? '(自化)' : ''}`).join('、')}`);
  if (p.flyIn.length) {
    L.push(`飞入本宫：${p.flyIn.map((x) => `${x.fromBranch}·${gongName({ name: x.fromPalaceName })}${x.mutagen}${x.star}`).join('、')}`);
  }
  L.push(`三方四正：对宫 ${p.sanFang.opposite}·${opp ? gongName(opp) : ''}；三合 ${p.sanFang.sanhe.map((br) => `${br}·${byBr[br] ? gongName(byBr[br]) : ''}`).join('、')}`);
  L.push(`大限：${p.decadalRange[0]}–${p.decadalRange[1]}（${p.decadalGanZhi}）`);
  return L.join('\n');
}

function bindEvents() {
  const board = $('#zw-board');
  if (board) {
    board.addEventListener('click', (e) => {
      const cell = e.target.closest('.zw-cell');
      if (cell) selectPalace(cell.dataset.br);
    });
    board.addEventListener('keydown', (e) => {
      if (e.key !== 'Enter' && e.key !== ' ') return;
      const cell = e.target.closest('.zw-cell');
      if (cell) { e.preventDefault(); selectPalace(cell.dataset.br); }
    });
  }
  const onlyKey = $('#zw-only-key');
  if (onlyKey) {
    onlyKey.addEventListener('click', () => {
      ONLY_KEY = !ONLY_KEY;
      onlyKey.classList.toggle('on', ONLY_KEY);
      onlyKey.setAttribute('aria-pressed', String(ONLY_KEY));
      const b = $('#zw-board');
      if (b) b.classList.toggle('zw-onlykey', ONLY_KEY);
    });
  }
  const detail = $('#zw-detail');
  if (detail) {
    detail.addEventListener('click', (e) => {
      if (e.target.closest('#zw-fly-clear')) { setFly(null); return; }
      const flyBtn = e.target.closest('[data-fly]');
      if (flyBtn) {
        const p = palaceByBr(SEL);
        if (p) setFly(flyPathOf(p, p.flyHua[Number(flyBtn.dataset.fly)]));
        return;
      }
      const nav = e.target.closest('[data-goto]');
      if (nav) { selectPalace(nav.dataset.goto); return; }
      const cp = e.target.closest('#zw-copy-palace');
      if (cp) { copyText(copyPalaceContext(SEL), cp); return; }
      const cadd = e.target.closest('#zw-cmp-add');
      if (cadd) toggleCompare(SEL);
    });
  }
  const cmp = $('#zw-compare');
  if (cmp) {
    cmp.addEventListener('click', (e) => {
      if (e.target.closest('#zw-cmp-clear')) { CMP = []; renderDetail(); renderCompare(); return; }
      if (e.target.closest('#zw-cmp-copy')) { copyText(copyCompareContext(), e.target.closest('#zw-cmp-copy')); }
    });
  }
  const crumb = $('#zw-crumb');
  if (crumb) {
    crumb.addEventListener('click', (e) => {
      if (e.target.closest('#zw-crumb-back')) goBack();
    });
  }
}

const ZW_GUIDE = {
  title: '怎么看这一盘',
  intro: '紫微斗数按出生年月日时定盘，把十四主星与诸星排进十二宫。 本盘每一个星名、宫名、四化标记都可以点开——卡里会告诉你它是什么、代表什么、古籍怎么论。',
  steps: [
    { t: '十二个格子', d: '每格是一个「宫」，各管人生一个领域（命、兄弟、夫妻、子女…）。', tip: 'shiergong', sel: '.zw-board' },
    { t: '命宫', d: '十二宫的核心，代表本人的性格与总体格局。', tip: 'minggong', sel: '.zw-board' },
    { t: '宫里的星', d: '紫微、天机、太阳…等十四主星是主角，小字是辅星。', tip: 'zhuXing', sel: '.zw-board' },
    { t: '禄 / 权 / 科 / 忌', d: '是「四化」，给星曜加上变化的含义，是分析的关键。', tip: 'sihua', sel: '.zw-board' },
    { t: '点任一宫', d: '看该宫详情，三方四正自动高亮；宫干四化可点出飞化落点。', sel: '.zw-adj' },
    { t: '格子里的大限数字', d: '是该宫对应的十年虚岁区间。', sel: '.zw-board' },
  ],
  note: '盘上只列传统体系里的通行含义与古籍出处，不替你下断语；吉凶倾向一律标为「古籍所载」，供你自己衡量。',
};


// ---------- 运限（大限 / 流年）----------
// 大限＝十年运（虚岁起限，命宫起 2-11 岁阴阳男女顺逆各异）；流年命宫＝年支所在宫。
// 依《紫微斗数全书》卷二「定大限」「定流年」古法；本视图只排事实并挂出处，不作吉凶断语。
const SI_HUA_NIAN = { // 十干四化（通行表）
  甲: { 禄:'廉贞', 权:'破军', 科:'武曲', 忌:'太阳' },
  乙: { 禄:'天机', 权:'天梁', 科:'紫微', 忌:'太阴' },
  丙: { 禄:'天同', 权:'天机', 科:'文昌', 忌:'廉贞' },
  丁: { 禄:'太阴', 权:'天同', 科:'天机', 忌:'巨门' },
  戊: { 禄:'贪狼', 权:'太阴', 科:'右弼', 忌:'天机' },
  己: { 禄:'武曲', 权:'贪狼', 科:'天梁', 忌:'文曲' },
  庚: { 禄:'太阳', 权:'武曲', 科:'太阴', 忌:'天同' },
  辛: { 禄:'巨门', 权:'太阳', 科:'文曲', 忌:'文昌' },
  壬: { 禄:'天梁', 权:'紫微', 科:'左辅', 忌:'武曲' },
  癸: { 禄:'破军', 权:'巨门', 科:'太阴', 忌:'贪狼' },
};

function yunXianCard(c, now = new Date()) {
  const curYear = now.getFullYear();
  const curGanZhi = yearGanZhi(curYear); // 流年干支
  const birthYear = parseInt(String(c.solarDate).split('-')[0], 10) || birthArgs().year;
  const xuSui = curYear - birthYear + 1; // 虚岁（生年即 1 岁；以公历年差近似，跨春节数日误差已声明）
  // 大限宫：decadalRange 覆盖当前虚岁
  const dp = c.palaces.find((p) => p.decadalRange && xuSui >= p.decadalRange[0] && xuSui <= p.decadalRange[1]);
  // 流年命宫：年支所在宫
  const yz = curGanZhi[1];
  const lp = c.palaces.find((p) => p.earthlyBranch === yz);
  const ngan = curGanZhi[0];
  const sihua = SI_HUA_NIAN[ngan];
  // 流年四化落宫
  const findStarPalace = (star) => {
    for (const p of c.palaces) {
      const names = [...(p.majorStars || []), ...(p.minorStars || [])].map((x) => x.name);
      if (names.includes(star)) return p;
    }
    return null;
  };
  const shRows = Object.entries(sihua).map(([k, star]) => {
    const pp = findStarPalace(star);
    return `<div class="yx-sihua"><i class="zw-muta ${ {禄:'lu',权:'quan',科:'ke',忌:'ji'}[k] }">${k}</i>${star}${pp ? ` → ${pp.name}（${pp.ganZhi}）` : ''}</div>`;
  }).join('');
  const dMajor = dp ? (dp.majorStars || []).map((x) => x.name).join('、') : '';
  const lMajor = lp ? (lp.majorStars || []).map((x) => x.name).join('、') : '';
  return `
  <div class="astro-card yx-card">
    <div class="ac-title">运限 · 大限与流年（${curGanZhi}年 · 虚岁 ${xuSui}）</div>
    ${dp ? `
    <div class="at-row"><span class="at-k">当前大限</span><span class="at-v">虚岁 ${dp.decadalRange[0]}–${dp.decadalRange[1]} · 走「${dp.name}」（${dp.ganZhi}）${dMajor ? ' · 坐 ' + dMajor : ' · 空宫借对宫'}</span></div>` : ''}
    ${lp ? `
    <div class="at-row"><span class="at-k">流年命宫</span><span class="at-v">${curGanZhi}年年支${yz} → 本命「${lp.name}」（${lp.ganZhi}）${lMajor ? ' · 坐 ' + lMajor : ' · 空宫借对宫'}</span></div>` : ''}
    <div class="at-row"><span class="at-k">流年四化</span><span class="at-v yx-sihua-list">${shRows}</span></div>
    <div class="cb-note">大限＝十年运限，古法虚岁起限（生年干支顺逆依阴阳男女而异）；流年命宫＝太岁地支落宫；流年四化＝年干十干四化表飞入本命盘。断限须合参本命格局与大限三方四正，本卡只排盘面事实。出处：《紫微斗数全书》卷二「定大限」「定流年」。</div>
  </div>`;
}

// 以公历年推年干支（紫微流年通用农历年，立春前后数日之差如实声明，不影响宫位判定）
function yearGanZhi(y) {
  const G = '甲乙丙丁戊己庚辛壬癸', Z = '子丑寅卯辰巳午未申酉戌亥';
  return G[(((y - 4) % 10) + 10) % 10] + Z[(((y - 4) % 12) + 12) % 12];
}

export function renderZiwei() {
  if (!isCasted('ziwei')) { $('#ziwei-body').innerHTML = gateHTML('ziwei'); return; }
  let c;
  try {
    c = paiZiwei(birthArgs());
  } catch (e) {
    $('#ziwei-body').innerHTML = `<div class="zw-err">紫微排盘失败：${esc(e && e.message)}</div>`;
    return;
  }
  CHART = c; SEL = null; FLY = null; CMP = []; NAV = []; ONLY_KEY = false;
  $('#ziwei-body').innerHTML = stage(`
    ${guideHTML(ZW_GUIDE)}
    <div class="zw-toolbar">
      <button class="zw-tgl" id="zw-only-key" aria-pressed="false">只看重点</button>
      <span class="zw-hint">点宫位看详情 · 三方四正自动高亮</span>
    </div>
    <div class="zw-crumb" id="zw-crumb" hidden></div>
    ${boardHtml(c)}
    ${yunXianCard(c)}
    <div id="zw-compare"></div>
    <div class="zw-legend">
      <span><i class="zw-muta lu">禄</i>化禄</span>
      <span><i class="zw-muta quan">权</i>化权</span>
      <span><i class="zw-muta ke">科</i>化科</span>
      <span><i class="zw-muta ji">忌</i>化忌</span>
      <span class="zw-lg-sep">庙旺得利平不陷为星曜亮度</span>
    </div>
    <div class="zw-legend zw-legend-rel">
      <span><i class="zw-dot self"></i>本宫</span>
      <span><i class="zw-dot opp"></i>对宫</span>
      <span><i class="zw-dot san"></i>三合</span>
      <span class="zw-lg-sep">选中宫位时按此三档高亮</span>
    </div>
    <div class="zw-legend zw-legend-fly">
      <span><i class="zw-dot fly-from"></i>飞化起点</span>
      <span><i class="zw-dot fly-to"></i>飞化落点</span>
      <span><i class="zw-dot fly-self"></i>自化</span>
      <span class="zw-lg-sep">点「宫干四化」任一条，按此三档高亮（与三方四正配色区分）</span>
    </div>
    <div class="zw-note">大限数字为该宫十年虚岁区间；空宫＝本宫无十四主星，借对宫安星。三方四正为纯地支关系（对宫＋三合），无流派差异。宫干四化为本宫宫干按十干四化表飞出的星与落宫（自化＝落回本宫）；庚干「阳武阴同」、壬干「梁紫左武」采通行表，各家或异。底座 ${esc(c.generator)}（MIT），本地离线排盘，只列盘面事实。<span class="zw-ver">v44</span></div>
    ${foldVerdict(verdictCardHtml(judgeZiwei(c)))}
    <div class="zw-detail" id="zw-detail"></div>`, 'ziwei');
  bindEvents();
  renderDetail();
  renderCompare();
  renderCrumb();
}

// 一键复制全盘（文本盘，AI/笔记易读）
export function ziweiCopyText() {
  const c = paiZiwei(birthArgs());
  const L = ['【紫微斗数 · 天盘（本命）】'];
  L.push(`${c.solarDate}（${c.lunarDate}）${c.time} ${c.gender}命`);
  L.push(`四柱 ${c.siZhu}｜${c.fiveElementsClass}｜命宫在${c.soulBranch} 身宫在${c.bodyBranch}｜命主${c.soul} 身主${c.body}`);
  L.push('—— 十二宫 ——');
  const order = ['子', '丑', '寅', '卯', '辰', '巳', '午', '未', '申', '酉', '戌', '亥'];
  const byBr = Object.fromEntries(c.palaces.map((p) => [p.earthlyBranch, p]));
  const sline = (s, major) => s.name + (major && s.brightness ? s.brightness : '') + (s.mutagen ? '化' + s.mutagen : '');
  for (const br of order) {
    const p = byBr[br];
    const tag = `${p.isSoulPalace ? '〔命〕' : ''}${p.isBodyPalace ? '〔身〕' : ''}`;
    const major = p.majorStars.length ? p.majorStars.map((s) => sline(s, true)).join('、') : '空宫';
    const minor = p.minorStars.length ? '｜辅：' + p.minorStars.map((s) => sline(s, false)).join('、') : '';
    const adj = p.adjectiveStars.length ? '｜杂：' + p.adjectiveStars.map((s) => s.name).join('、') : '';
    L.push(`${p.ganZhi} ${gongName(p)}${tag}（大限${p.decadalRange[0]}-${p.decadalRange[1]}）：${major}${minor}${adj}`);
  }
  return L.join('\n');
}

// 复现码数据 + 案例标题
export function ziweiCode() {
  const a = birthArgs();
  let c = null;
  try { c = paiZiwei(a); } catch { /* 排盘失败时只给时刻 */ }
  const at = new Date(a.year, a.month - 1, a.day, a.hour, a.minute, 0, 0).getTime();
  return {
    kind: 'ziwei',
    data: { at, gender: a.gender },
    title: c ? `命宫${c.soulBranch} · 身宫${c.bodyBranch}` : '紫微天盘',
    sub: c ? `${c.solarDate} ${c.time} ${c.gender}命 · ${c.fiveElementsClass}` : '',
  };
}

// —— 无 DOM 环境下的单元测试钩子（不参与运行时逻辑）——
export const __zwTest = {
  setChart: (c) => { CHART = c; },
  setSel: (br) => { SEL = br; },
  setFly: (f) => { FLY = f; },
  setCompare: (arr) => { CMP = arr; },
  getCompare: () => [...CMP],
  detailHtml,
  copyPalaceContext,
  hlOf,
  hlFlyOf,
  flyPathOf,
  relateOf,
  compareHtml,
  copyCompareContext,
  boardHtml,
  gongName,
};
