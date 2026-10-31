// classicview.js — 「观心」视图层（经典内容渲染器，不绑定某一部经典）
//
// 产品定位（董事长 2026-10-31 批示第五部分第 1 条）：
//   「观心不能做成一个新的内容展示页，它应该逐渐成为钦天监内部一个独立的产品体验。
//     用户进入观心，不应该觉得自己进入了一个附属的国学栏目。
//     它需要有自己的首页节奏、交互逻辑、内容探索路径。
//     但底层继续共用钦天监的 PWA 外壳、导航、数据管理和视觉体系。」
//
// 因此本文件的结构是：
//   首页节奏：今日相遇 → 带着自己的事去问心 → 换几个角度看 → 与古人辩一场 → 随意探索
//   每一段都是独立入口，不是一个栏目里的子页面。
//
// 产品原则落点：
//   · 随机性必须真实：三种抽取是三种不同机制，见 classic-core.js
//   · 问心不根据问题挑答案：抽取签名不含问题；五种反馈只改阅读路径，不含重抽能力
//   · 解释必须分层：八层视觉区分，编辑阐释必带标记
//   · 用户拥有不同意的权利：辩一辩不问对错，只问你怎么想，且允许读完改主意
//   · 游戏体验不能损害知识真实性：牌阵明示是本产品设计，不是《论语》原有体系
//
// 纯前端，无网络请求。跳转通过 qintian:classic-goto 事件交回 main.js。

import {
  dateKey, drawDaily, drawAsk, drawThree, getNode,
  correctionsFor, exploreEntries, detailLayers,
  poolNodes, clusterName, allNodes, allClusters, meta, capabilities,
  FEEDBACK, feedbackEffect, topicsOf,
  debateList, getDebate, debateFor, stanceOf, debateAfterword,
} from './classic-core.js';
import { $, $$, toast } from '../state.js?v=123';

const FAV_KEY = 'qintian.classic.fav';
const SEQ_KEY = 'qintian.classic.askseq';
const FB_KEY = 'qintian.classic.feedback';
const NOTE_KEY = 'qintian.classic.notes';
const DEB_KEY = 'qintian.classic.debate';

let panel = 'today';
let askResult = null;
let askQuestion = '';        // 仅作阅读背景展示，永不参与抽取
let askFeedback = null;      // 五种反馈之一（只影响阅读路径）
let askNoteOpen = false;     // 「想起自己的某件事」的输入框
let askEmpty = false;        // 空问题点「静心一问」时的提示位（不抽，只提醒）
let threeCards = null;       // [{node, group, groupName, open}]
let debate = null;           // { id, stance, changed, revealed }
let currentId = null;

// ---------------- 小工具 ----------------

function esc(s) {
  return String(s == null ? '' : s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function loadJSON(key, fallback) {
  try {
    const v = JSON.parse(localStorage.getItem(key) || 'null');
    return v == null ? fallback : v;
  } catch { return fallback; }
}
function saveJSON(key, v) {
  try { localStorage.setItem(key, JSON.stringify(v)); } catch { /* 忽略配额错误 */ }
}

function loadFav() { return new Set(loadJSON(FAV_KEY, [])); }
function saveFav(set) { saveJSON(FAV_KEY, [...set]); }

/** 当日问心/三观序号：只用于让同一日的多次抽取互不相同，不参与任何内容判断 */
function bumpSeq() {
  const today = dateKey();
  const rec = loadJSON(SEQ_KEY, null);
  const n = (rec && rec.d === today) ? (rec.n || 0) : 0;
  saveJSON(SEQ_KEY, { d: today, n: n + 1 });
  return n;
}

function cnDate(d = new Date()) {
  const w = '日一二三四五六'[d.getDay()];
  return `${d.getFullYear()}年${d.getMonth() + 1}月${d.getDate()}日 星期${w}`;
}

/** 记录一次反馈（只用于「后续阅读体验」，绝不回流到抽取） */
function recordFeedback(nodeId, fbId) {
  const all = loadJSON(FB_KEY, {});
  const key = `${nodeId}`;
  all[key] = all[key] || [];
  all[key].push({ fb: fbId, at: new Date().toISOString().slice(0, 10) });
  saveJSON(FB_KEY, all);
}

// ---------------- 通用卡片 ----------------

function quoteCard(node, opts = {}) {
  if (!node) return '';
  const fav = loadFav().has(node.id);
  return `
  <article class="cl-quote" data-id="${esc(node.id)}">
    <div class="cl-quote-title">${esc(node.title)}</div>
    <blockquote class="cl-original">${esc(node.original)}</blockquote>
    <div class="cl-src">${esc(node.location_text)}</div>
    <p class="cl-idea">${esc(node.idea || '')}</p>
    <div class="cl-acts">
      <button class="btn ghost mini" data-act="open" data-id="${esc(node.id)}" type="button">读原典 ›</button>
      <button class="btn ghost mini ${fav ? 'on' : ''}" data-act="fav" data-id="${esc(node.id)}" type="button">${fav ? '已收藏' : '收藏'}</button>
    </div>
    ${opts.foot ? `<div class="cl-foot">${opts.foot}</div>` : ''}
  </article>`;
}

// ---------------- 主视图 ----------------

const PANEL_NAMES = {
  today: '今日相遇', ask: '问心', three: '一念三观', debate: '辩一辩', explore: '思想探索',
};

function panelIds() {
  const caps = capabilities();
  const out = ['today', 'ask', 'three'];
  if (caps.debate) out.push('debate');
  out.push('explore');
  return out;
}

export function renderClassic() {
  const m = meta();
  const ids = panelIds();
  if (!ids.includes(panel)) panel = 'today';
  const tabs = ids.map((id) =>
    `<button class="cl-tab ${id === panel ? 'on' : ''}" data-panel="${id}" type="button">${PANEL_NAMES[id]}</button>`
  ).join('');

  return `
  <header class="topbar">
    <div class="brand">观心</div>
    <div class="top-right"><span class="cl-ver">${esc(m.classic)} · v${esc(m.version)}</span></div>
  </header>

  <div class="cl-tabs">${tabs}</div>
  <div class="cl-body" id="cl-body">${renderPanel()}</div>`;
}

function renderPanel() {
  if (panel === 'today') return panelToday();
  if (panel === 'ask') return panelAsk();
  if (panel === 'three') return panelThree();
  if (panel === 'debate') return panelDebate();
  return panelExplore();
}

// ---------------- 今日相遇 ----------------

function panelToday() {
  const dk = dateKey();
  const node = drawDaily(dk);
  const cnt = meta().counts;
  return `
  <div class="cl-hint">${cnDate()} · 今日一条</div>
  ${quoteCard(node, { foot: '今日相遇每日一条，由日期决定，不可更换——相遇不是挑选。' })}

  <div class="cl-flow">
    <div class="cl-flow-h">今天还可以</div>
    <button class="cl-flow-i" data-act="goto-panel" data-panel="ask" type="button">
      <span class="cl-flow-t">带着一件自己的事去问心</span>
      <span class="cl-flow-s">写下它，然后随机遇见一条——抽到哪条与你的问题无关</span>
    </button>
    <button class="cl-flow-i" data-act="goto-panel" data-panel="three" type="button">
      <span class="cl-flow-t">换三个角度看看</span>
      <span class="cl-flow-s">一念三观：三条来自不同思想群，各自成章</span>
    </button>
    ${capabilities().debate ? `
    <button class="cl-flow-i" data-act="goto-panel" data-panel="debate" type="button">
      <span class="cl-flow-t">和古人辩一场</span>
      <span class="cl-flow-s">先看原文，再选你自己的立场，然后才读注疏</span>
    </button>` : ''}
  </div>

  <div class="cl-stats">
    <span>抽签池 ${cnt.draw_pool}</span><span>思想 ${cnt.thoughts}</span>
    <span>已核实关系 ${cnt.relations_verified}</span><span>待考 ${cnt.relations_pending}</span>
  </div>`;
}

// ---------------- 问心 ----------------

function panelAsk() {
  const result = askResult;
  const fb = askFeedback ? feedbackEffect(askFeedback) : null;

  return `
  <div class="cl-hint">写下一件此刻压在心里的事。不必写清楚，写下来就行。</div>
  <textarea id="cl-ask-input" class="cl-input" rows="4"
    placeholder="例如：我在犹豫要不要辞掉现在的工作。">${esc(askQuestion)}</textarea>
  <button class="btn btn-primary big" id="cl-ask-go" type="button">静心一问</button>
  <div class="cl-ask-warn ${askEmpty ? 'is-on' : ''}" id="cl-ask-warn" role="status">
    还没写。先写一句此刻的事，再点「静心一问」。<br>
    如果只是想随便看看，去「今日相遇」——那里不问你任何事。
  </div>
  ${result ? `
  ${askQuestion ? `
  <div class="cl-myq">
    <div class="cl-myq-h">你写下的</div>
    <div class="cl-myq-t">${esc(askQuestion)}</div>
    <div class="cl-myq-n">这段字只留在你这一屏，不参与抽取，也不上传。</div>
  </div>` : ''}
  <div class="cl-notice">
    <strong>你抽到的这条，与你写下的问题无关。</strong>
    它不由你的问题挑选，也不会替你的问题作答。你可以带着自己的问题去读它——
    真正需要被看见的，往往不是答案，而是你提问时站的位置。
  </div>
  ${quoteCard(result, { foot: '问心只提供原典、注疏与分歧，不判断、不预测、不给结论。' })}

  <div class="cl-fb">
    <div class="cl-fb-h">读完之后，你怎么看它</div>
    <div class="cl-fb-note">你的回答只会改变接下来给你看什么。它不会改变你刚才抽到的这一条，也不会让系统替你重新挑一条。</div>
    <div class="cl-fb-row">
      ${FEEDBACK.map((f) => `
        <button class="cl-fb-b ${askFeedback === f.id ? 'on' : ''}" data-act="fb" data-fb="${f.id}" type="button">
          ${esc(f.label)}
        </button>`).join('')}
    </div>
    ${fb && fb.note ? `<div class="cl-fb-out">${esc(fb.note)}</div>` : ''}
    ${fb && fb.compose ? `
      <textarea id="cl-note-input" class="cl-input sm" rows="3"
        placeholder="只写给你自己。不上传，不参与抽取，也不会出现在别处。">${esc(loadJSON(NOTE_KEY, {})[result.id] || '')}</textarea>
      <button class="btn ghost mini" data-act="save-note" data-id="${esc(result.id)}" type="button">存下这段话</button>` : ''}
    ${fb && fb.openLayers ? `
      <button class="btn ghost mini" data-act="open-with" data-id="${esc(result.id)}" data-layers="${esc(fb.openLayers.join(','))}" type="button">展开对应的那一层 ›</button>` : ''}
  </div>

  <div class="cl-acts-row">
    <button class="btn ghost mini" data-act="ask-again" type="button">再问一次</button>
  </div>` : ''}
  <div class="cl-rules">
    <div class="cl-rules-h">问心不做三件事</div>
    <ul>
      <li>不根据你的问题挑选条目——抽取只由日期与序号决定</li>
      <li>不预测结果、不给吉凶、不替你做决定</li>
      <li>不把今人的理解说成古人的原意</li>
    </ul>
  </div>`;
}

// ---------------- 一念三观 ----------------

function panelThree() {
  if (!threeCards) {
    return `
    <div class="cl-hint">一次抽三张，三条来自三个不同的思想群。</div>
    <button class="btn btn-primary big" id="cl-three-go" type="button">洗牌</button>
    <div class="cl-rules">
      <div class="cl-rules-h">关于牌阵</div>
      <ul>
        <li>牌阵是本产品的阅读设计，<strong>不是《论语》原有的占卜体系</strong></li>
        <li>三条分别来自不同的思想群，各自独立，互不推导</li>
        <li>不要把它们读成一个连贯的预言</li>
      </ul>
    </div>`;
  }
  const cards = threeCards.map((c, i) => c.open ? `
    <div class="cl-card3 open">
      <div class="cl-card3-h">第 ${i + 1} 张 · ${esc(c.node.title)}</div>
      <div class="cl-card3-g">${esc(c.groupName)}</div>
      <blockquote class="cl-original sm">${esc(c.node.original)}</blockquote>
      <div class="cl-src">${esc(c.node.location_text)}</div>
      <p class="cl-idea">${esc(c.node.idea || '')}</p>
      <button class="btn ghost mini" data-act="open" data-id="${esc(c.node.id)}" type="button">读原典 ›</button>
    </div>` : `
    <button class="cl-card3 back" data-act="flip" data-i="${i}" type="button">
      <span>第 ${i + 1} 张</span><span class="cl-flip">翻开</span>
    </button>`).join('');
  const allOpen = threeCards.every((c) => c.open);
  const groups = threeCards.map((c) => c.groupName);
  return `
  <div class="cl-hint">三条来自三个不同思想群，逐张翻开。</div>
  <div class="cl-cards3">${cards}</div>
  <div class="cl-acts-row">
    <button class="btn ghost mini" data-act="three-again" type="button">重新洗牌</button>
  </div>
  ${allOpen ? `<div class="cl-foot">三张分别出自「${groups.map(esc).join('」「')}」——三个角度，不是一个结论。</div>` : ''}
  <div class="cl-foot">牌阵为本产品设计，非《论语》原有占卜体系。</div>`;
}

// ---------------- 辩一辩 ----------------
//
// 顺序严格按批示：先展示原文 → 立刻问立场（不解释）→ 用户选 → 再进语境注疏分歧。
// 选完之后不给「对/错」，只做「位置对照」：你这个选择，历史上哪一路走过。
// 允许读完改主意——这才是「古人的思想可以被质疑、讨论和重新理解」。

function panelDebate() {
  const list = debateList();
  if (!list.length) {
    return '<div class="cl-hint">当前内容包暂无辩题。</div>';
  }

  if (!debate) {
    const rows = list.map((d) => {
      const n = getNode(d.node);
      return `
      <button class="cl-db-item" data-act="db-open" data-id="${esc(d.id)}" type="button">
        <span class="cl-db-q">${esc(d.question)}</span>
        <span class="cl-db-s">${esc(n ? n.location_text : '')} · ${esc(n ? n.title : '')}</span>
      </button>`;
    }).join('');
    return `
    <div class="cl-hint">挑一句你本来就有想法的话。先看原文，再说你怎么想。</div>
    <div class="cl-db-list">${rows}</div>
    <div class="cl-rules">
      <div class="cl-rules-h">这里不问对错</div>
      <ul>
        <li>你的立场是关于<strong>你自己怎么做</strong>，不是关于孔子什么意思</li>
        <li>选完之后才给注疏——先有你的判断，再看古人怎么解</li>
        <li>读完可以改主意，改主意本身也是这一场的一部分</li>
      </ul>
    </div>`;
  }

  const d = getDebate(debate.id);
  const node = d ? getNode(d.node) : null;
  if (!d || !node) return '<div class="cl-hint">辩题数据缺失。</div>';

  const chosen = debate.stance ? stanceOf(d, debate.stance) : null;

  const stanceBtns = (d.stances || []).map((s) => `
    <button class="cl-st ${debate.stance === s.id ? 'on' : ''}" data-act="db-stance" data-id="${esc(s.id)}" type="button">
      <span class="cl-st-l">${esc(s.label)}</span>
      <span class="cl-st-t">${esc(s.text)}</span>
    </button>`).join('');

  // 第一屏：原文 + 问题 + 立场（不给任何解释）
  const head = `
  <div class="cl-db-head">
    <div class="cl-db-loc">${esc(node.full_title || node.title)} · ${esc(node.location_text)}</div>
    <blockquote class="cl-original lg">${esc(node.original)}</blockquote>
  </div>
  <div class="cl-db-q2">${esc(d.question)}</div>
  <div class="cl-hint">${esc(d.preamble || '')}</div>
  <div class="cl-st-row">${stanceBtns}</div>`;

  if (!chosen) {
    return `
    ${head}
    <div class="cl-acts-row">
      <button class="btn ghost mini" data-act="db-back" type="button">‹ 换一题</button>
    </div>
    <div class="cl-foot">选一个之后，才会展开原文语境、历代注疏与注家分歧。</div>`;
  }

  // 第二屏：你的选择 + 这一路谁走过 + 原文语境 + 注疏 + 分歧 + 改主意
  const after = debateAfterword(d);
  const layers = detailLayers(node).filter((L) => ['person', 'commentary', 'dispute', 'modern'].includes(L.key));
  const layerHtml = layers.map((L) => `
    <section class="cl-layer k-${L.kind} open" data-layer="${L.key}">
      <div class="cl-layer-h static"><span class="cl-layer-n">${esc(L.layer)}</span></div>
      <div class="cl-layer-b">
        <div class="cl-layer-note">${esc(L.note)}</div>
        ${L.items.map((it) => `
          <div class="cl-item">
            ${it.label ? `<div class="cl-item-l">${esc(it.label)}</div>` : ''}
            <div class="cl-item-t">${esc(it.text).replace(/\n/g, '<br>')}</div>
          </div>`).join('')}
      </div>
    </section>`).join('');

  return `
  ${head}
  <div class="cl-db-mine">
    <div class="cl-db-mine-h">你的立场</div>
    <div class="cl-db-mine-t">${esc(chosen.label)}</div>
    <div class="cl-db-mine-d">${esc(chosen.text)}</div>
    ${debate.changed ? '<div class="cl-db-changed">你改过主意。改主意不算反悔——读完再想，本来就是这一场的目的。</div>' : ''}
  </div>

  <div class="cl-db-lineage">
    <div class="cl-db-lineage-h">这一路，历史上谁走过</div>
    <div class="cl-db-lineage-t">${esc(chosen.lineage)}</div>
    <div class="cl-db-lineage-n">这只是位置对照，不是对错判定。你的选择属于你自己，不必是哪一家的注脚。</div>
  </div>

  ${after && after.canonNote ? `
  <div class="cl-db-canon">
    <div class="cl-db-canon-h">原典实际说了什么</div>
    <div class="cl-db-canon-t">${esc(after.canonNote)}</div>
  </div>` : ''}

  ${layerHtml}

  ${after && after.text ? `<div class="cl-db-after">${esc(after.text)}</div>` : ''}

  <div class="cl-acts-row">
    <button class="btn ghost mini" data-act="db-open" data-id="${esc(d.id)}" type="button">重新选一次</button>
    <button class="btn ghost mini" data-act="open" data-id="${esc(node.id)}" type="button">读完整八层 ›</button>
    <button class="btn ghost mini" data-act="db-back" type="button">换一题</button>
  </div>`;
}

// ---------------- 思想探索 ----------------

function panelExplore() {
  const clusters = allClusters().map((c) => {
    // thought.clusters 存群 id（C-XX），由数据层从 CLUSTERS.branches 反推。
    // 早期它存的是另一套旧分组词，曾导致两群为空、两条整条消失；数据层已统一。
    const nodes = allNodes().filter((t) => (t.clusters || []).includes(c.id));
    if (!nodes.length) return '';
    return `
    <section class="cl-group">
      <div class="cl-group-h">${esc(c.name)}<span>${nodes.length}</span></div>
      ${nodes.map((t) => `
        <button class="cl-node" data-act="open" data-id="${esc(t.id)}" type="button">
          <span class="cl-node-t">${esc(t.title)}</span>
          <span class="cl-node-s">${esc(t.location_text)}</span>
          ${(t.relations || []).length ? '' : '<span class="cl-node-tag">独立</span>'}
        </button>`).join('')}
    </section>`;
  }).join('');

  const orphans = allNodes().filter((t) => !(t.relations || []).length);
  const total = allNodes().length;
  return `
  <div class="cl-hint">
    按思想群浏览，共 ${total} 条。关系边只展示经审校成立的；
    没有可靠关系的条目照实标「独立」，不补造联系。
  </div>
  ${clusters}
  ${orphans.length ? `
  <div class="cl-rules">
    <div class="cl-rules-h">独立条目 ${orphans.length} 条</div>
    <p class="cl-rules-p">
      ${orphans.map((o) => esc(o.title)).join('、')}<br>
      这些条目目前没有经审校成立的思想关系。点开后用「同一思想群 / 同一篇章 / 主题推荐」
      入口继续读——三者依据不同，都不是思想关系；某一入口没有可用内容时不显示，也不补造。
    </p>
  </div>` : ''}`;
}

// ---------------- 详情视图（八层） ----------------

export function renderClassicDetail(id, opts = {}) {
  const node = getNode(id);
  if (!node) return '<div class="cl-hint">未找到该条目。</div>';
  currentId = id;

  const forceOpen = new Set(opts.openLayers || []);
  const layers = detailLayers(node).map((L, i) => {
    const open = forceOpen.has(L.key) || (i < 2 && !forceOpen.size) ? 'open' : '';
    const items = L.items.map((it) => `
      <div class="cl-item">
        ${it.label ? `<div class="cl-item-l">${esc(it.label)}</div>` : ''}
        <div class="cl-item-t">${esc(it.text).replace(/\n/g, '<br>')}</div>
      </div>`).join('');
    return `
    <section class="cl-layer k-${L.kind} ${open}" data-layer="${L.key}">
      <button class="cl-layer-h" data-act="layer" type="button">
        <span class="cl-layer-n">${esc(L.layer)}</span>
        <span class="cl-layer-x">${open ? '−' : '+'}</span>
      </button>
      <div class="cl-layer-b">
        <div class="cl-layer-note">${esc(L.note)}</div>
        ${items}
      </div>
    </section>`;
  }).join('');

  const db = debateFor(node);
  return `
  <header class="topbar">
    <div class="brand">${esc(node.title)}</div>
  </header>
  <div class="cl-detail-src">${esc(node.full_title)}<br>${esc(node.location_text)}</div>
  ${db ? `
  <button class="cl-db-invite" data-act="db-open" data-id="${esc(db.id)}" type="button">
    <span class="cl-db-invite-h">这一条可以辩</span>
    <span class="cl-db-invite-q">${esc(db.question)}</span>
    <span class="cl-db-invite-s">先说你自己的立场，再看注疏 ›</span>
  </button>` : ''}
  <div class="cl-layers">${layers}</div>
  ${renderTopicsBlock(node)}
  ${renderRelationsBlock(node)}
  ${renderCorrectionsBlock(node)}`;
}

function renderTopicsBlock(node) {
  const tps = topicsOf(node);
  if (!tps.length) return '';
  return `
  <section class="cl-sec">
    <div class="cl-sec-h">所属主题</div>
    <div class="cl-sec-note">主题是探索入口，不是思想关系。同属一个主题不代表两条内容之间有原典联系。</div>
    <div class="cl-tp-row">
      ${tps.map((t) => `<span class="cl-tp">${esc(t.name)}</span>`).join('')}
    </div>
  </section>`;
}

function renderRelationsBlock(node) {
  const ex = exploreEntries(node);

  if (ex.mode === 'relations') {
    const rows = ex.relations.map((r) => `
      <button class="cl-rel tone-${r.badge.tone}" data-act="open" data-id="${esc(r.peer)}" type="button">
        <div class="cl-rel-top">
          <span class="cl-rel-peer">${esc(r.peer_title)}</span>
          <span class="cl-badge tone-${r.badge.tone}">${esc(r.badge.badge)}</span>
        </div>
        <div class="cl-rel-label">${esc(r.label)} · ${r.type === 'complement' ? '互补' : '对照'}</div>
        <div class="cl-rel-why">${esc(r.badge.wording)}</div>
      </button>`).join('');
    return `
    <section class="cl-sec cl-rels">
      <div class="cl-sec-h">思想关联</div>
      <div class="cl-sec-note">
        「原典有据」指原典本文直接建立了这一联系；「注家合观」出自历代注家；
        「编辑阐释」是我们今天的理解，即使经人工批准，也不是原典关系。
      </div>
      ${rows}
    </section>`;
  }

  // 每个入口都带自己的性质类与 data-kind。批示原则二要求四类入口不得混为一谈，
  // 所以这里不靠一句小字说明去区分，而是让性质成为结构本身（可被样式和测试直接选中）。
  const KIND_LABEL = { cluster: '原典归类', chapter: '文本位置', topic: '主题推荐', unknown: '性质未标注' };
  const entries = ex.entries.map((e) => `
    <div class="cl-entry cl-entry--${esc(e.kind || 'unknown')}" data-kind="${esc(e.kind || 'unknown')}">
      <div class="cl-entry-h">${esc(e.label)}<span>${esc(KIND_LABEL[e.kind] || '性质未标注')}</span></div>
      ${e.mustLabel ? `<div class="cl-entry-warn">${esc(e.mustLabel)}</div>` : ''}
      <div class="cl-entry-list">
        ${e.nodes.map((n) => `
          <button class="cl-node sm" data-act="open" data-id="${esc(n.id)}" type="button">
            <span class="cl-node-t">${esc(n.title)}</span>
            <span class="cl-node-s">${esc(n.location_text)}</span>
          </button>`).join('')}
      </div>
    </div>`).join('');

  return `
  <section class="cl-sec">
    <div class="cl-sec-h">探索关联</div>
    <div class="cl-sec-note">
      这一条目前没有经审校成立的思想关系。以下入口依据各不相同——
      原典归类、文本位置、编辑推荐——三者都不构成思想关系。
    </div>
    ${entries || '<div class="cl-foot">暂无可供推荐的条目。</div>'}
    ${ex.entries.some((e) => e.id === 'topic_recommend') ? '' :
      '<div class="cl-foot">该条暂无主题推荐——主题标签体系尚未定稿，不为了凑满入口而编造。</div>'}
  </section>`;
}

function renderCorrectionsBlock(node) {
  const cs = correctionsFor(node);
  if (!cs.length) return '';
  return `
  <section class="cl-sec">
    <div class="cl-sec-h">常见误读</div>
    ${cs.map((c) => `
      <div class="cl-cor">
        <div class="cl-cor-h">${esc(c.title)}<span>${esc(c.diff_type)}</span></div>
        <div class="cl-cor-p"><b>流行说法</b>${esc(c.popular)}</div>
        <div class="cl-cor-d"><b>差在哪</b>${esc(c.diff_detail)}</div>
        ${c.commentary_note ? `<div class="cl-cor-n"><b>注家</b>${esc(c.commentary_note)}</div>` : ''}
        ${c.modern_debate ? `<div class="cl-cor-n"><b>今人分歧</b>${esc(c.modern_debate)}</div>` : ''}
      </div>`).join('')}
  </section>`;
}

// ---------------- 事件 ----------------

function repaint() {
  const body = $('#cl-body');
  if (body) body.innerHTML = renderPanel();
}

export function bindClassic() {
  const root = $('#view-classic');
  if (!root || root.dataset.bound) return;
  root.dataset.bound = '1';

  // 用户一开始写字，空输入的提示就撤掉。这里只改 DOM 不重绘——
  // 重绘会重建 textarea，正在输入的内容和光标位置都会丢。
  root.addEventListener('input', (e) => {
    if (e.target && e.target.id === 'cl-ask-input' && askEmpty) {
      askEmpty = false;
      const w = $('#cl-ask-warn');
      if (w) w.classList.remove('is-on');
    }
  });

  root.addEventListener('click', (e) => {
    const tab = e.target.closest('[data-panel]');
    if (tab && !e.target.closest('[data-act]')) {
      panel = tab.dataset.panel;
      repaint();
      $$('.cl-tab', root).forEach((t) => t.classList.toggle('on', t.dataset.panel === panel));
      window.scrollTo(0, 0);
      return;
    }

    const go = e.target.closest('#cl-ask-go');
    if (go) {
      const q = $('#cl-ask-input');
      // 关键：q.value 只写入 askQuestion 供展示，绝不传入 drawAsk()。
      // 抽取种子只有「日期 + 当日序号」，与问题内容完全无关。
      askQuestion = q ? String(q.value || '').trim() : '';
      // 空问题不抽。问心的前提是「带着困惑遇见」——什么都没写就发一条，
      // 用户拿到的只是一条随机内容，与「今日相遇」再无区别，「投射」这一环就断了。
      // 但也不把人堵在原地：提示里给出另一条路，今日相遇本来就允许空手。
      if (!askQuestion) {
        askEmpty = true;
        // 同时清掉上一次的结果。否则用户空着点一下，看到提示的同时还看到一条内容，
        // 会以为「不写也照样给」——提示就白说了。空着点，就该停在「还没写」这里。
        askResult = null;
        askFeedback = null;
        repaint();
        return;
      }
      askEmpty = false;
      askResult = drawAsk(bumpSeq());
      askFeedback = null;
      repaint();
      window.scrollTo(0, 0);
      return;
    }

    const three = e.target.closest('#cl-three-go');
    if (three) {
      threeCards = drawThree(bumpSeq()).map((x) => ({ ...x, open: false }));
      repaint();
      return;
    }

    const act = e.target.closest('[data-act]');
    if (!act) return;
    const a = act.dataset.act;

    if (a === 'goto-panel') {
      panel = act.dataset.panel;
      repaint();
      $$('.cl-tab', root).forEach((t) => t.classList.toggle('on', t.dataset.panel === panel));
      window.scrollTo(0, 0);
      return;
    }

    if (a === 'flip') {
      const i = Number(act.dataset.i);
      if (threeCards && threeCards[i]) { threeCards[i].open = true; repaint(); }
      return;
    }
    if (a === 'three-again') { threeCards = null; repaint(); return; }
    if (a === 'ask-again') {
      // 「再问一次」同样要求先有问题。否则从结果页连点几次，
      // 问心就退化成第二个「今日相遇」——机制不同，前提也不能丢。
      if (!askQuestion) { askEmpty = true; repaint(); return; }
      askResult = drawAsk(bumpSeq());
      askFeedback = null;
      repaint();
      return;
    }

    // 五种反馈：只改阅读路径，绝不重抽。feedbackEffect 的返回值里没有重抽能力。
    if (a === 'fb') {
      askFeedback = act.dataset.fb;
      if (askResult) recordFeedback(askResult.id, askFeedback);
      repaint();
      return;
    }
    if (a === 'save-note') {
      const id = act.dataset.id;
      const input = $('#cl-note-input');
      const notes = loadJSON(NOTE_KEY, {});
      notes[id] = input ? String(input.value || '').trim() : '';
      saveJSON(NOTE_KEY, notes);
      toast('已存在你自己的设备上');
      return;
    }
    if (a === 'open-with') {
      const id = act.dataset.id;
      const layers = String(act.dataset.layers || '').split(',').filter(Boolean);
      const body = $('#classic-detail-body');
      if (body) body.innerHTML = renderClassicDetail(id, { openLayers: layers });
      document.dispatchEvent(new CustomEvent('qintian:classic-goto', { detail: { view: 'classic-detail' } }));
      return;
    }

    if (a === 'db-open') {
      debate = { id: act.dataset.id, stance: null, changed: false };
      panel = 'debate';
      repaint();
      window.scrollTo(0, 0);
      return;
    }
    if (a === 'db-stance') {
      const sid = act.dataset.id;
      if (debate && debate.stance && debate.stance !== sid) debate.changed = true;
      if (debate) debate.stance = sid;
      repaint();
      return;
    }
    if (a === 'db-back') { debate = null; repaint(); window.scrollTo(0, 0); return; }

    if (a === 'fav') {
      const id = act.dataset.id;
      const fav = loadFav();
      if (fav.has(id)) { fav.delete(id); toast('已取消收藏'); }
      else { fav.add(id); toast('已收藏'); }
      saveFav(fav);
      repaint();
      return;
    }
    if (a === 'open') {
      const id = act.dataset.id;
      const body = $('#classic-detail-body');
      if (body) body.innerHTML = renderClassicDetail(id);
      document.dispatchEvent(new CustomEvent('qintian:classic-goto', { detail: { view: 'classic-detail' } }));
      return;
    }
  });
}

export function bindClassicDetail() {
  const root = $('#view-classic-detail');
  if (!root || root.dataset.bound) return;
  root.dataset.bound = '1';

  root.addEventListener('click', (e) => {
    const layer = e.target.closest('[data-act="layer"]');
    if (layer) {
      const sec = layer.closest('.cl-layer');
      if (!sec) return;
      const open = sec.classList.toggle('open');
      const x = $('.cl-layer-x', sec);
      if (x) x.textContent = open ? '−' : '+';
      return;
    }
    const db = e.target.closest('[data-act="db-open"]');
    if (db) {
      debate = { id: db.dataset.id, stance: null, changed: false };
      panel = 'debate';
      document.dispatchEvent(new CustomEvent('qintian:classic-goto', { detail: { view: 'classic' } }));
      // 切回主视图后重绘一次，确保辩题首屏是干净的（未选状态）
      setTimeout(() => {
        const body = $('#cl-body');
        if (body) body.innerHTML = renderPanel();
      }, 0);
      return;
    }
    const act = e.target.closest('[data-act="open"]');
    if (act) {
      const body = $('#classic-detail-body');
      if (body) body.innerHTML = renderClassicDetail(act.dataset.id);
      window.scrollTo(0, 0);
    }
  });
}

/** 供自检与调试 */
export function classicAudit() {
  return {
    pool: poolNodes().length,
    total: allNodes().length,
    debates: debateList().length,
    fav: loadFav().size,
    panel,
  };
}
