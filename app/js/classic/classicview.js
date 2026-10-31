// classicview.js — 「观心」视图层（经典内容渲染器，不绑定某一部经典）
//
// 产品定位（董事长 2026-10-31 批示）：
//   「观心是一个以经典思想为材料，帮助现代人理解现实困惑、探索不同思想、
//     记录个人认知变化的产品。不是向古人求答案，而是借古人的思想重新看见自己。」
//
// 核心体验：遇见 → 触动 → 发现 → 表达 → 沉淀 → 再次发现。
//
// 结构（v126 重构，旧功能全部迁移，不删除）：
//   今日   打开即得一条完整内容：原文 / 出处 / 现代解读 / 值得想一下 / 继续深入
//          往下依次是 发现 → 探索 → 联系自己 → 留下收获（五步递进，每一步都有独立价值）
//   困惑   八个现实主题入口（零输入，可直接点，也可以不选）
//   手记   用户自己留下的所有想法，按时间倒序；再次遇到同一条时回显上次的记录
//
// 旧功能迁移去向（不删除，只换位置）：
//   今日相遇 → 今日页首屏
//   问心     → 困惑（八个现实主题，不再要求用户先写字）
//   一念三观 → 阅读第二步「发现」：同一个思想群里的其他说法
//   辩一辩   → 阅读第三步「探索」：历代注家在这一点上怎么分岔
//   思想探索 → 困惑页的主题浏览
//   五种反馈 → 阅读第四步「联系自己」，不强迫表态
//
// 产品原则落点：
//   · 现代编辑解读与古人原意严格分层，modern/think 字段来自 reading.js，明示为产品撰写
//   · 不得为了让页面丰富而制造思想关系：主题推荐 ≠ 原典关系，四类入口分开标注
//   · 不自动给用户做心理画像、不打思想分数、不替用户宣布成长
//   · 允许随时结束，不制造完成任务的压力
//
// 纯前端，无网络请求。跳转通过 qintian:classic-goto 事件交回 main.js。

import {
  dateKey, drawDaily, getNode, allNodes, allClusters, meta, capabilities,
  FEEDBACK, feedbackEffect, topicsOf, poolNodes,
  debateList, getDebate, debateFor, stanceOf, debateAfterword,
  exploreEntries, detailLayers, correctionsFor, visibleRelations,
} from './classic-core.js';
import { readingOf, THEMES, themeById, themeSeq, LINK_LABEL } from './reading.js';
import { $, $$, toast } from '../state.js?v=126';

const FAV_KEY = 'qintian.classic.fav';
const NOTE_KEY = 'qintian.classic.journal';   // 思想手记：{ nodeId: [{ text, at, fb }] }

// 主视图三页。旧版是五个并列面板（今日/问心/三观/辩一辩/探索），
// 用户打开后不知道从哪进；现在只剩三个，且第一页打开就是内容本身。
let panel = 'today';          // today | themes | notes
let readStep = 1;             // 1..5，当前展开到第几步
let readId = null;            // 当前正在读的条目；null 表示读今日那一条
let themeId = null;           // 困惑页当前主题
let readFb = null;            // 本条已选的反馈
let readDebate = false;       // 第 3 步「我怎么看」是否已展开
let readStance = null;        // 本条更接近哪一种读法（可不选）
let readStanceChanged = false;
let readDifferAt = 0;         // 刚刚把理由存进手记的时间戳（0 = 没存过）
let readDifferDraft = '';     // 理由草稿：点读法会重绘，不带走就会把用户写了一半的话吞掉

// 反馈文案按产品语言重写。core 里那份是机制名，这里是给用户看的字。
const FB_LABEL = {
  agree: '这句话触动了我',
  more: '我想进一步了解',
  disagree: '我有不同看法',
  unsure: '我还没想明白',
  recall: '我想留下自己的想法',
};

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

function cnDate(d = new Date()) {
  const w = '日一二三四五六'[d.getDay()];
  return `${d.getFullYear()}年${d.getMonth() + 1}月${d.getDate()}日 星期${w}`;
}

function shortDate(iso) {
  const s = String(iso || '');
  if (s.length < 10) return s;
  return `${Number(s.slice(5, 7))}月${Number(s.slice(8, 10))}日`;
}

// ---------------- 思想手记 ----------------

function loadJournal() { return loadJSON(NOTE_KEY, {}); }

/** 写下一条。同一条可以反复写，形成时间线——这是「看见自己的变化」的原料。 */
function addJournal(nodeId, text, fb) {
  const all = loadJournal();
  const list = Array.isArray(all[nodeId]) ? all[nodeId] : [];
  list.push({ text: String(text || '').trim(), at: new Date().toISOString(), fb: fb || null });
  all[nodeId] = list;
  saveJSON(NOTE_KEY, all);
  return list;
}

/** 某条内容上我留下的所有记录（新的在后） */
function journalOf(nodeId) {
  const all = loadJournal();
  return Array.isArray(all[nodeId]) ? all[nodeId] : [];
}

/** 全部记录，按时间倒序，带内容节点 */
function journalAll() {
  const all = loadJournal();
  const rows = [];
  for (const id of Object.keys(all)) {
    const node = getNode(id);
    if (!node) continue;
    for (const r of all[id]) rows.push({ node, rec: r });
  }
  rows.sort((a, b) => String(b.rec.at).localeCompare(String(a.rec.at)));
  return rows;
}

// ---------------- 今日那一条 ----------------

function todayNode() {
  return drawDaily(dateKey());
}

/** 当前正在读的条目：显式点进来的优先，否则就是今天这条。 */
function readingNode() {
  if (readId) {
    const n = getNode(readId);
    if (n) return n;
  }
  return todayNode();
}

// ---------------- 阅读：第 1 步 看懂 ----------------

// 再次遇到旧内容时的温和提示。不评价、不宣布成长、不生成画像——
// 只把用户自己上次写的话原样摆出来，让他自己比较。
function journalEcho(nodeId) {
  const list = journalOf(nodeId);
  if (!list.length) return '';
  const last = list[list.length - 1];
  if (!last.text) return '';
  return `
  <div class="cl-echo">
    <div class="cl-echo-h">你曾经读过这一条</div>
    <div class="cl-echo-w">${shortDate(last.at)}，你留下过这样的话：</div>
    <div class="cl-echo-q">${esc(last.text)}</div>
    ${list.length > 1 ? `<div class="cl-echo-n">这条你一共记过 ${list.length} 次。</div>` : ''}
  </div>`;
}

function stepUnderstand(node) {
  const r = readingOf(node.id);
  const fav = loadFav().has(node.id);
  return `
  <article class="cl-read" data-id="${esc(node.id)}">
    <blockquote class="cl-read-o">${esc(node.original)}</blockquote>
    <div class="cl-read-src">${esc(node.location_text)}</div>

    <!-- 旧记录放在原文之后、解读之前：
         先认出这是哪一条，再想起自己上次写了什么，然后才看解读。
         放最上面会挡住原文，读者第一眼看到的应该是这句话本身。 -->
    ${journalEcho(node.id)}

    <section class="cl-block">
      <div class="cl-block-h">这句话在说什么</div>
      <p class="cl-modern">${esc(r ? r.modern : (node.idea || ''))}</p>
      <div class="cl-src-tag">现代解读 · 本产品编辑撰写，不是古人原意</div>
    </section>

    ${r && r.think ? `
    <section class="cl-block cl-think">
      <div class="cl-block-h">值得想一下</div>
      <p class="cl-modern">${esc(r.think)}</p>
    </section>` : ''}

    <!-- 推进按钮只在「你正停在这一步」时出现。
         展开后还留着它，用户往下读到第四步时，上方仍挂着一个
         「这句话背后还有什么」——已经点过了，看上去像没生效。 -->
    <div class="cl-read-acts">
      ${readStep === 1 ? `
      <button class="cl-more" data-act="step" data-step="2" type="button">
        这句话背后还有什么 ›
      </button>` : ''}
      <button class="btn ghost mini ${fav ? 'on' : ''}" data-act="fav" data-id="${esc(node.id)}" type="button">${fav ? '已收藏' : '收藏'}</button>
    </div>
  </article>`;
}

// ---------------- 阅读：第 2 步 发现 ----------------

// 「发现」要给的是「过去没注意到的东西」。
// 两个来源：这条是在什么场合说的（语境），以及它最容易被读错的地方（误读纠错）。
function stepDiscover(node) {
  const ctx = node.context || {};
  const ctxRows = [
    ['谁说的', ctx.speaker],
    ['对谁说', ctx.interlocutor],
    ['当时在谈什么', ctx.occasion],
  ].filter((x) => x[1]);

  const cs = correctionsFor(node);

  return `
  <section class="cl-block cl-step2">
    <div class="cl-block-h">这句话是在什么场合说的</div>
    ${ctxRows.length ? `<dl class="cl-ctx">
      ${ctxRows.map(([k, v]) => `<dt>${esc(k)}</dt><dd>${esc(v)}</dd>`).join('')}
    </dl>` : '<div class="cl-foot">这一条的语境记录不完整，不补写。</div>'}
    <div class="cl-src-tag">出处：原文上下文，非编辑推断</div>
  </section>

  ${cs.length ? `
  <section class="cl-block cl-step2">
    <div class="cl-block-h">它最容易被读错的地方</div>
    ${cs.map((c) => `
      <div class="cl-cor">
        <div class="cl-cor-h">${esc(c.title)}<span>${esc(c.diff_type)}</span></div>
        <div class="cl-cor-p"><b>流行说法</b>${esc(c.popular)}</div>
        <div class="cl-cor-d"><b>差在哪</b>${esc(c.diff_detail)}</div>
      </div>`).join('')}
  </section>` : ''}

  ${readStep === 2 ? `
  <div class="cl-read-acts">
    <button class="cl-more" data-act="step" data-step="3" type="button">
      历代是怎么读它的 ›
    </button>
  </div>` : ''}`;
}

// ---------------- 阅读：第 3 步 探索 ----------------

// 旧「辩一辩」迁到这里：辩题本来就是 disputes 的展开，
// 现在不再单开一页，而是作为「这条被读成了几种意思」的一部分。
function stepExplore(node) {
  const cm = node.commentaries || [];
  const ds = node.disputes || [];
  const db = debateFor(node);

  return `
  ${cm.length ? `
  <section class="cl-block cl-step3">
    <div class="cl-block-h">历代注家怎么解</div>
    ${cm.map((c) => `
      <div class="cl-cm">
        <div class="cl-cm-h">${esc(c.author)}<span>${esc(c.work || '')}</span></div>
        <div class="cl-cm-t">${esc(c.text)}</div>
      </div>`).join('')}
    <div class="cl-src-tag">注疏 · 古人原话，与上面的现代解读不同来源</div>
  </section>` : ''}

  ${ds.length ? `
  <section class="cl-block cl-step3">
    <div class="cl-block-h">这一点上，古人也吵</div>
    ${ds.map((d) => `
      <div class="cl-disp">
        <div class="cl-disp-t">${esc(d.topic)}</div>
        <ul>${(d.positions || []).map((p) => `<li>${esc(p)}</li>`).join('')}</ul>
      </div>`).join('')}
    <div class="cl-src-tag">分歧 · 并列呈现，不合成单一答案</div>
  </section>` : '<div class="cl-foot">这一条目前没有记录到注家分歧——不为了显得丰富而补造。</div>'}

  ${db ? `
  <section class="cl-block cl-step3 cl-debate">
    <div class="cl-block-h">换成今天的处境，你怎么想</div>
    <div class="cl-db-q">${esc(db.question)}</div>
    ${!readDebate ? `
    <div class="cl-foot">${esc(db.preamble || '')}</div>
    <button class="btn ghost mini" data-act="db-inline" data-id="${esc(db.id)}" type="button">
      我怎么看 ›
    </button>` : debateInline(db, node)}` : ''}

  ${readStep === 3 ? `
  <div class="cl-read-acts">
    <button class="cl-more" data-act="step" data-step="4" type="button">
      这条和你有什么关系 ›
    </button>
    <!-- 完整资料是另一个维度，不是五步的一部分：
         想一次看完的人（查证、抄写、做研究）从这里走，
         不想一次看那么多的人继续往下就行。 -->
    <button class="btn ghost mini" data-act="open" data-id="${esc(node.id)}" type="button">
      完整资料 ›
    </button>
  </div>` : ''}`;
}

// 旧「辩一辩」的页面搬进阅读流程里。
// 原来点「说说我的立场」会跳到一个独立页面：用户刚进入阅读状态就被送走，
// 回来还得重新找位置。现在就地展开，四段都在同一条内容里：
//   原文在说什么 → 历代注家怎么理解 → 我更接近哪一种 → 我有不同看法
// 关键约束：不制造两个对立阵营。这里列的是四种站位，不是正反方；
// 可以都不选，也可以只看不选——没有需要完成的动作。
function debateInline(db, node) {
  const chosen = readStance ? stanceOf(db, readStance) : null;
  const after = chosen ? debateAfterword(db) : null;
  const justSaved = readDifferAt && Date.now() - readDifferAt < 120000;

  return `
  <div class="cl-db-in">
    <div class="cl-db-sec">
      <div class="cl-db-sec-h">原文在说什么</div>
      <div class="cl-db-sec-t">${esc(db.canon_note || '')}</div>
    </div>

    <div class="cl-db-sec">
      <div class="cl-db-sec-h">历代注家怎么理解这一点</div>
      ${(db.stances || []).map((st) => `
        <button class="cl-st ${readStance === st.id ? 'on' : ''}" data-act="db-stance" data-id="${esc(st.id)}" type="button">
          <span class="cl-st-l">${esc(st.label)}</span>
          <span class="cl-st-t">${esc(st.text)}</span>
        </button>`).join('')}
      <div class="cl-foot">这几种不是选项，是站位。可以都不选，只看。</div>
    </div>

    ${chosen ? `
    <div class="cl-db-sec cl-db-mine">
      <div class="cl-db-sec-h">你更接近「${esc(chosen.label)}」</div>
      <div class="cl-db-sec-t">${esc(chosen.lineage)}</div>
      ${readStanceChanged ? '<div class="cl-db-changed">你改过。改主意不算反悔——读完再想，本来就是这件事的目的。</div>' : ''}
      ${after && after.text ? `
      <div class="cl-db-alt-h">如果你站在另一边</div>
      <div class="cl-db-after">${esc(after.text)}</div>` : ''}
      <div class="cl-foot">这只是位置对照，不是对错判定。你的选择属于你自己，不必是哪一家的注脚。</div>
    </div>` : ''}

    <div class="cl-db-sec">
      <div class="cl-db-sec-h">我有不同看法</div>
      <textarea id="cl-differ" class="cl-journal is-short" rows="2"
        placeholder="一句也行。只留在你自己的设备上。">${esc(readDifferDraft)}</textarea>
      <div class="cl-read-acts">
        <button class="btn ghost mini" data-act="db-save" data-id="${esc(node.id)}" type="button">存进手记</button>
        <button class="btn ghost mini" data-act="db-close" type="button">收起</button>
      </div>
      ${justSaved ? '<div class="cl-foot">已存进手记。以后读到这一条，你会看到今天写的这句。</div>' : ''}
    </div>
  </div>`;
}

// ---------------- 阅读：第 4 步 联系自己 ----------------

// 五种反馈，不强迫表态。选了一个才给回应——回应是「接下来给你看什么」，
// 不是夸奖，也不是评分。
function stepSelf(node) {
  const eff = readFb ? feedbackEffect(readFb) : null;
  return `
  <section class="cl-block cl-step4">
    <div class="cl-block-h">读完这条，你是什么感觉</div>
    <div class="cl-fb-row">
      ${FEEDBACK.map((f) => `
        <button class="cl-fb ${readFb === f.id ? 'on' : ''}" data-act="fb" data-fb="${f.id}" type="button">
          ${esc(FB_LABEL[f.id] || f.label)}
        </button>`).join('')}
    </div>
    ${eff ? `
    <div class="cl-fb-echo">
      <div class="cl-fb-echo-t">${esc(eff.note || '')}</div>
      ${eff.openLayers && eff.openLayers.length ? `
        <button class="btn ghost mini" data-act="open-with" data-id="${esc(node.id)}"
          data-layers="${esc(eff.openLayers.join(','))}" type="button">看看古人怎么吵的 ›</button>` : ''}
      ${eff.gotoDetail ? `
        <button class="btn ghost mini" data-act="open" data-id="${esc(node.id)}" type="button">读完整八层 ›</button>` : ''}
      ${eff.compose ? '<div class="cl-foot">往下写一句就行，不用写得完整。</div>' : ''}
    </div>` : ''}

    <div class="cl-foot">可以不选。也可以随时离开，这里没有需要完成的任务。</div>
  </section>

  ${readStep < 5 ? `
  <div class="cl-read-acts">
    <button class="cl-more" data-act="step" data-step="5" type="button">
      留下一句我自己的话 ›
    </button>
  </div>` : ''}`;
}

// ---------------- 阅读：第 5 步 留下收获 ----------------

function stepKeep(node) {
  const list = journalOf(node.id);
  return `
  <section class="cl-block cl-step5">
    <div class="cl-block-h">留下一句</div>
    <div class="cl-foot">
      只存在你自己的设备上，不上传，也不参与任何推荐。
      以后再遇到这一条，你会看到今天写的这句。
    </div>
    <textarea id="cl-journal-input" class="cl-journal" rows="4"
      placeholder="想到什么就写什么，一句话也行。"></textarea>
    <div class="cl-read-acts">
      <button class="cl-more" data-act="journal-save" data-id="${esc(node.id)}" type="button">存进手记</button>
      <button class="btn ghost mini" data-act="step" data-step="6" type="button">不写，就这样</button>
    </div>
    ${list.length ? `
    <div class="cl-jhist">
      <div class="cl-jhist-h">这一条你记过 ${list.length} 次</div>
      ${list.map((r) => `
        <div class="cl-jhist-i">
          <div class="cl-jhist-d">${shortDate(r.at)}</div>
          <div class="cl-jhist-t">${esc(r.text || '（没有写字）')}</div>
        </div>`).join('')}
    </div>` : ''}
  </section>`;
}

// ---------------- 阅读：结束 ----------------

function stepEnd(node) {
  const themes = THEMES.slice(0, 4);
  const last = journalOf(node.id).slice(-1)[0];
  return `
  <section class="cl-block cl-end">
    <div class="cl-end-h">今天这一条读完了</div>
    ${last && last.text ? `
    <div class="cl-end-note">你今天留下一句：<br>「${esc(last.text)}」</div>` : ''}
    <div class="cl-foot">明天还有下一条。不必现在就看下一条。</div>
    <div class="cl-end-acts">
      <button class="cl-more" data-act="goto" data-panel="themes" type="button">最近有件事让我为难 ›</button>
      <button class="btn ghost mini" data-act="goto" data-panel="notes" type="button">看我的手记</button>
    </div>
    <div class="cl-end-themes">
      ${themes.map((t) => `
        <button class="cl-end-t" data-act="theme" data-id="${esc(t.id)}" type="button">${esc(t.name)}</button>`).join('')}
    </div>
  </section>`;
}

// ---------------- 今日页 ----------------

function panelToday() {
  const node = readingNode();
  if (!node) return '<div class="cl-hint">内容库为空。</div>';
  const isToday = !readId || readId === todayNode().id;
  const steps = [];
  steps.push(stepUnderstand(node));
  if (readStep >= 2) steps.push(stepDiscover(node));
  if (readStep >= 3) steps.push(stepExplore(node));
  if (readStep >= 4) steps.push(stepSelf(node));
  // 第 5 步的输入框只在「还没写」时出现。
  // 写完进第 6 步后，留下的话改由结束块展示——否则用户会看到一个
  // 已经存过、却还在等他的空输入框，不知道还要不要写第二遍。
  if (readStep === 5) steps.push(stepKeep(node));
  if (readStep >= 6) steps.push(stepEnd(node));

  return `
  <div class="cl-day">${isToday ? cnDate() + ' · 今日一条' : '正在读'}</div>
  ${!isToday ? `<button class="cl-back" data-act="back-today" type="button">‹ 回到今天这一条</button>` : ''}
  ${steps.join('')}`;
}

// ---------------- 困惑页（旧「问心」+「思想探索」迁移） ----------------

function panelThemes() {
  if (themeId) return panelThemeDetail();
  return `
  <div class="cl-day">此刻，你更接近哪一种</div>
  <div class="cl-themes-intro">
    不用写，也不用说得清楚，点一个就好。<br>
    不选也可以——「今日」那一条本来就不问你任何事。
  </div>
  <div class="cl-themes">
    ${THEMES.map((t) => `
      <button class="cl-theme" data-act="theme" data-id="${esc(t.id)}" type="button">
        <span class="cl-theme-n">${esc(t.name)}</span>
        <span class="cl-theme-h">${esc(t.hint)}</span>
      </button>`).join('')}
  </div>`;
}

function panelThemeDetail() {
  const t = themeById(themeId);
  if (!t) return panelThemes();
  const seq = themeSeq(t.id);

  // 有人工序列就按人工序列走。
  // 没排过的主题（将来新增的）才退回标签过滤——标签给的是「沾边」，
  // 人工序列给的是「从这个角度读，先读哪条」。两者不能混着显示：
  // 混了之后，用户分不清哪条是编辑挑的、哪条是机器凑的。
  const items = seq
    ? seq.items.map((it) => ({ node: getNode(it.id), it })).filter((x) => x.node)
    : allNodes()
        .filter((n) => (n.topics || []).some((id) => t.topics.includes(id)))
        .map((n, i) => ({ node: n, it: { id: n.id, why: '', link: '', first: i < 3 } }));

  return `
  <button class="cl-back" data-act="back-themes" type="button">‹ 换一个</button>
  <div class="cl-tp-h">${esc(t.name)}</div>
  <div class="cl-tp-note">
    下面的顺序和理由，是本产品编辑挑的，不是原典主张，也不是注家说法。<br>
    同属一个主题，也不代表这些条目之间在《论语》里互相引用。
  </div>
  ${seq && seq.path ? `<div class="cl-tp-path">阅读路径：${esc(seq.path)}</div>` : ''}
  <div class="cl-tp-list">
    ${items.map(({ node, it }, i) => {
      const r = readingOf(node.id);
      return `
      <button class="cl-tp-item" data-act="read" data-id="${esc(node.id)}" type="button">
        <span class="cl-tp-item-n">${i + 1}</span>
        <span class="cl-tp-item-t">${esc(node.title)}</span>
        <span class="cl-tp-item-s">${esc(node.location_text)}</span>
        ${r ? `<span class="cl-tp-item-p">${esc(r.modern.slice(0, 40))}…</span>` : ''}
        ${it.why ? `<span class="cl-tp-item-w">${esc(it.why)}</span>` : ''}
        <span class="cl-tp-item-b">
          ${it.link && LINK_LABEL[it.link] ? `<i>${esc(LINK_LABEL[it.link])}</i>` : ''}
          ${it.first ? '<i>适合初读</i>' : '<i>读过两条再看</i>'}
        </span>
      </button>`;
    }).join('') || '<div class="cl-foot">这个主题下暂时没有条目。</div>'}
  </div>`;
}

// ---------------- 手记页 ----------------

function panelNotes() {
  const rows = journalAll();
  const withText = rows.filter((r) => r.rec.text);
  return `
  <div class="cl-day">我的思想手记</div>
  <div class="cl-themes-intro">只放你自己写的东西${withText.length ? `，一共 ${withText.length} 条` : ''}。不评分，也不替你总结。</div>
  ${withText.length ? `
  <div class="cl-jlist">
    ${withText.map((r) => `
      <div class="cl-jrow">
        <div class="cl-jrow-d">${shortDate(r.rec.at)}</div>
        <button class="cl-jrow-t" data-act="read" data-id="${esc(r.node.id)}" type="button">
          ${esc(r.node.title)}
        </button>
        <div class="cl-jrow-x">${esc(r.rec.text)}</div>
      </div>`).join('')}
  </div>` : `
  <div class="cl-empty">
    还没有记过东西。<br>
    读完一条，在最后一步可以留下一句——一句话也行。
  </div>`}`;
}

// ---------------- 主视图 ----------------

const PANEL_NAMES = { today: '今日', themes: '困惑', notes: '手记' };

function panelIds() { return ['today', 'themes', 'notes']; }

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
  if (panel === 'themes') return panelThemes();
  if (panel === 'notes') return panelNotes();
  return panelToday();
}

// ---------------- 详情视图（八层，原样保留） ----------------

export function renderClassicDetail(id, opts = {}) {
  const node = getNode(id);
  if (!node) return '<div class="cl-hint">未找到该条目。</div>';

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
  const r = readingOf(node.id);
  return `
  <header class="topbar">
    <div class="brand">${esc(node.title)}</div>
  </header>
  <div class="cl-detail-src">${esc(node.full_title)}<br>${esc(node.location_text)}</div>
  ${r ? `
  <section class="cl-sec">
    <div class="cl-sec-h">这句话在说什么</div>
    <p class="cl-modern">${esc(r.modern)}</p>
    <div class="cl-src-tag">现代解读 · 本产品编辑撰写，不是古人原意</div>
  </section>` : ''}
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

/** 进入某一条的阅读（重置到第一步） */
function openReading(id) {
  readId = id || null;
  readStep = 1;
  readFb = null;
  readDebate = false;
  readStance = null;
  readStanceChanged = false;
  readDifferAt = 0;
  readDifferDraft = '';
  panel = 'today';
  repaint();
  syncTabs();
  window.scrollTo(0, 0);
}

/** 滚到某个元素。展开的新内容在下方，屏幕不动用户会以为没反应。 */
function scrollToSel(sel) {
  requestAnimationFrame(() => {
    const el = $(sel);
    if (!el) return;
    const y = el.getBoundingClientRect().top + window.scrollY - 56;
    window.scrollTo({ top: Math.max(0, y), behavior: 'smooth' });
  });
}

function syncTabs() {
  $$('#view-classic .cl-tab').forEach((t) => t.classList.toggle('on', t.dataset.panel === panel));
}

export function bindClassic() {
  const root = $('#view-classic');
  if (!root || root.dataset.bound) return;
  root.dataset.bound = '1';

  root.addEventListener('click', (e) => {
    const tab = e.target.closest('[data-panel]');
    if (tab && !e.target.closest('[data-act]')) {
      panel = tab.dataset.panel;
      themeId = null;
      repaint();
      syncTabs();
      window.scrollTo(0, 0);
      return;
    }

    const act = e.target.closest('[data-act]');
    if (!act) return;
    const a = act.dataset.act;

    if (a === 'goto') {
      panel = act.dataset.panel;
      themeId = null;
      repaint();
      syncTabs();
      window.scrollTo(0, 0);
      return;
    }

    // 推进阅读步骤。已经展开的保持展开——用户往回翻还能看到。
    if (a === 'step') {
      const target = Number(act.dataset.step) || 1;
      readStep = Math.max(readStep, target);
      repaint();
      // 必须滚到**刚展开的那一步**，不是页面底部。
      // 展开的新内容在按钮下方，如果屏幕不动，用户看到的就是「点了没反应」。
      // 用 offsetTop 精确定位而不是 scrollIntoView：后者在内容刚插入、
      // 布局还没稳定时算出来的位置经常偏一屏，用户会看到「滚到了上一段」。
      requestAnimationFrame(() => {
        const fresh = $(`#cl-body .cl-step${target}`) || $('#cl-body .cl-end');
        if (!fresh) return;
        const y = fresh.getBoundingClientRect().top + window.scrollY - 56;
        window.scrollTo({ top: Math.max(0, y), behavior: 'smooth' });
      });
      return;
    }

    if (a === 'read') {
      openReading(act.dataset.id);
      return;
    }
    if (a === 'back-today') {
      openReading(null);
      return;
    }
    if (a === 'theme') {
      themeId = act.dataset.id;
      panel = 'themes';
      repaint();
      syncTabs();
      window.scrollTo(0, 0);
      return;
    }
    if (a === 'back-themes') {
      themeId = null;
      repaint();
      window.scrollTo(0, 0);
      return;
    }

    // 反馈：只改接下来给什么看，不改内容、不重抽、不评分。
    if (a === 'fb') {
      readFb = act.dataset.fb;
      repaint();
      return;
    }

    if (a === 'journal-save') {
      const id = act.dataset.id;
      const input = $('#cl-journal-input');
      const text = input ? String(input.value || '').trim() : '';
      if (!text) {
        toast('还没写。写一句就行，也可以点「不写，就这样」。');
        return;
      }
      addJournal(id, text, readFb);
      readStep = Math.max(readStep, 6);
      repaint();
      // 不弹 toast：全局 toast 固定在底部 110px，正好盖住结束态的按钮。
      // 结束态本身已经把刚写的那句话显示出来了，那就是最好的确认。
      requestAnimationFrame(() => {
        const end = $('#cl-body .cl-end');
        if (!end) return;
        const y = end.getBoundingClientRect().top + window.scrollY - 56;
        window.scrollTo({ top: Math.max(0, y), behavior: 'smooth' });
      });
      return;
    }

    // 「我怎么看」：就地展开，不跳页。
    if (a === 'db-inline') {
      readDebate = true;
      repaint();
      scrollToSel('#cl-body .cl-debate');
      return;
    }

    // 选一种读法。再点一次取消——允许「我只是看看，不想站队」。
    if (a === 'db-stance') {
      const draft = $('#cl-differ');
      if (draft) readDifferDraft = draft.value;   // 重绘前把草稿带走
      const sid = act.dataset.id;
      if (readStance && readStance !== sid) readStanceChanged = true;
      readStance = readStance === sid ? null : sid;
      repaint();
      scrollToSel('#cl-body .cl-db-in');
      return;
    }

    if (a === 'db-close') {
      const draft = $('#cl-differ');
      if (draft) readDifferDraft = draft.value;
      readDebate = false;
      repaint();
      scrollToSel('#cl-body .cl-debate');
      return;
    }

    // 把「我有不同看法」写进手记——和第五步的手记是同一个存储，
    // 所以之后再遇到这一条，两条都会回显。
    if (a === 'db-save') {
      const box = $('#cl-differ');
      const text = box ? String(box.value || '').trim() : '';
      if (!text) {
        toast('还没写。写一句就行。');
        return;
      }
      addJournal(act.dataset.id, text, 'differ');
      readDifferDraft = '';
      readDifferAt = Date.now();
      repaint();
      scrollToSel('#cl-body .cl-db-in');
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

// 辩题内联页（旧「辩一辩」的完整交互保留，只是不再有独立 tab）
function renderDebateInline(debateId) {
  const d = getDebate(debateId);
  if (!d) return '<div class="cl-hint">辩题数据缺失。</div>';
  const node = getNode(d.node);
  if (!node) return '<div class="cl-hint">辩题对应的原典条目缺失。</div>';
  const chosen = debate.stance ? stanceOf(d, debate.stance) : null;
  const after = chosen ? debateAfterword(d) : null;

  const stanceBtns = (d.stances || []).map((s) => `
    <button class="cl-st ${debate.stance === s.id ? 'on' : ''}" data-act="db-stance" data-id="${esc(s.id)}" type="button">
      <span class="cl-st-l">${esc(s.label)}</span>
      <span class="cl-st-t">${esc(s.text)}</span>
    </button>`).join('');

  return `
  <header class="topbar"><div class="brand">辩一辩</div></header>
  <div class="cl-db-head">
    <div class="cl-db-loc">${esc(node.full_title || node.title)} · ${esc(node.location_text)}</div>
  </div>
  <blockquote class="cl-original">${esc(node.original)}</blockquote>
  <div class="cl-db-q2">${esc(d.question)}</div>
  <div class="cl-hint">${esc(d.preamble || '')}</div>
  <div class="cl-st-row">${stanceBtns}</div>
  ${!chosen ? `<div class="cl-foot">选一个之后，才会展开原文语境、历代注疏与注家分歧。</div>` : ''}
  ${chosen ? `
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
  ${after ? `
  <div class="cl-db-canon">
    <div class="cl-db-canon-h">原典实际说了什么</div>
    <div class="cl-db-canon-t">${esc(after.canonNote || '')}</div>
  </div>
  ${after.text ? `<div class="cl-db-after">${esc(after.text)}</div>` : ''}` : ''}
  <div class="cl-acts-row">
    <button class="btn ghost mini" data-act="db-open" data-id="${esc(d.id)}" type="button">重新选一次</button>
    <button class="btn ghost mini" data-act="open" data-id="${esc(node.id)}" type="button">读完整八层 ›</button>
  </div>` : ''}`;
}

let debate = { id: null, stance: null, changed: false };

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
    // 从详情页进辩题：就地渲染，不再跳回主视图（旧版跳 panel='debate' 已不存在）
    const db = e.target.closest('[data-act="db-open"]');
    if (db) {
      debate = { id: db.dataset.id, stance: null, changed: false };
      const body = $('#classic-detail-body');
      if (body) body.innerHTML = renderDebateInline(db.dataset.id);
      window.scrollTo(0, 0);
      return;
    }
    const st = e.target.closest('[data-act="db-stance"]');
    if (st) {
      const sid = st.dataset.id;
      if (debate.stance && debate.stance !== sid) debate.changed = true;
      debate.stance = sid;
      const body = $('#classic-detail-body');
      if (body) body.innerHTML = renderDebateInline(debate.id);
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
    journal: journalAll().length,
    panel,
    readStep,
  };
}
