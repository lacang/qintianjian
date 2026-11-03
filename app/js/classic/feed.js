// feed.js — 「遇见」：连续思想发现
//
// 产品意图（董事长 2026-11-04）：
//   「让我打开观心，就能遇见一段陌生的思想；我愿意，就继续深入；
//     我不认同，可以存疑；我被触动，可以留下自己的思考。」
//
// 这一层只做三件事：把一张卡片画出来、把手势翻译成动作、把进度说清楚。
// 抽取在 classic-core（纯函数），状态与迁移在 feed-state（无 DOM），
// 三个文件各自可测，不把逻辑堆回 classicview.js。
//
// 五条不做的事：
//   1. 不做红心、叉号、匹配成功这类交友软件的视觉语言——这里是读书，不是配对。
//   2. 不在池子耗尽后回绕取模假装还有内容。走完就说走完，给真实数字。
//   3. 不因为用户存疑或留下而改变后面抽到什么（抽取种子只含轮次）。
//   4. 不改写任何原典、注疏、现代解读文本，只做排列与标注。
//   5. 不把「现代解读」和「原典」放在同一个视觉层级里——卡片上必须分得开。

import { drawFeed, feedOrder, feedCapacity } from './classic-core.js';
import { readingOf } from './reading.js';
import {
  loadFeed, advanceFeed, nextFeedRound, setMark, markOf,
  MARK_KEEP, MARK_DOUBT, markStats,
} from './feed-state.js';
import { toast } from '../state.js?v=128';

function esc(s) {
  return String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  }[c]));
}

/** 系统是否要求减少动态效果。尊重它，不是可选项。 */
function reduceMotion() {
  return !!(window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches);
}

// ---------------- 卡片 ----------------

/**
 * 一张卡片的正面。五项内容全部来自已审核的思想单元，没有一项是现场生成的：
 *   1. 原典内容      node.original
 *   2. 作者 / 人物    node.context.speaker（谁说的）
 *   3. 经典与出处     node.location_text
 *   4. 现代解读      readingOf().modern（产品编辑撰写，明示来源）
 *   5. 值得思考的问题 readingOf().think
 *
 * 第 4 项与第 1 项之间有一条硬分隔线 + 一行来源标注：
 * 「现代解读」和「原典」必须一眼分得开，这是整个产品的知识信用底线。
 */
function cardHtml(node, idx, total) {
  const r = readingOf(node.id);
  const modern = (r && r.modern) || node.idea || '';
  const think = (r && r.think) || '';
  const speaker = (node.context && node.context.speaker) || '';
  const mark = markOf(node.id);

  return `
  <article class="cl-card${mark ? ' is-' + esc(mark) : ''}" data-id="${esc(node.id)}">
    <div class="cl-card-top">
      <span class="cl-card-idx">${idx + 1} / ${total}</span>
      ${speaker ? `<span class="cl-card-who">${esc(speaker)}</span>` : ''}
    </div>

    <blockquote class="cl-card-orig">${esc(node.original)}</blockquote>
    <div class="cl-card-src">${esc(node.location_text || '')}</div>

    ${modern ? `
    <div class="cl-card-rule"></div>
    <p class="cl-card-modern">${esc(modern)}</p>
    <div class="cl-card-tag">现代解读 · 本产品编辑撰写，不是古人原意</div>` : ''}

    ${think ? `
    <div class="cl-card-think">
      <div class="cl-card-think-h">值得想一下</div>
      <p>${esc(think)}</p>
    </div>` : ''}
  </article>`;
}

/** 三个动作。按钮常驻，不依赖手势——手势是加速器，不是唯一入口。 */
function actsHtml(node) {
  const mark = markOf(node.id);
  return `
  <div class="cl-card-acts">
    <button class="cl-act cl-act-doubt${mark === MARK_DOUBT ? ' on' : ''}"
      data-act="feed-mark" data-kind="doubt" data-id="${esc(node.id)}" type="button">存疑</button>
    <button class="cl-act cl-act-deep" data-act="feed-deep" data-id="${esc(node.id)}" type="button">深入阅读</button>
    <button class="cl-act cl-act-keep${mark === MARK_KEEP ? ' on' : ''}"
      data-act="feed-mark" data-kind="keep" data-id="${esc(node.id)}" type="button">留下</button>
  </div>
  <div class="cl-feed-hint">左右滑动，或用上面的按钮。滑走的只是卡片，不会丢东西。</div>`;
}

/** 本轮走完。说清真实数字，给两个出口，不伪造下一条。 */
function endHtml(total, st) {
  const marks = markStats();
  return `
  <div class="cl-feed-end">
    <div class="cl-feed-end-h">这一轮 ${total} 条，你都见过了</div>
    <div class="cl-feed-end-p">
      内容池现在是 ${total} 条，不重复地滑一遍就走完了。<br>
      不给你造更多——没有的内容就是没有。
    </div>
    ${marks.total ? `<div class="cl-feed-end-n">你已经留下 ${marks.keep} 条、存疑 ${marks.doubt} 条。</div>` : ''}
    <div class="cl-feed-end-acts">
      <button class="cl-more" data-act="feed-next-round" type="button">再走一轮（顺序会重新排）</button>
      <button class="btn ghost mini" data-act="goto" data-panel="notes" type="button">看我的手记</button>
    </div>
    <div class="cl-foot">你的手记和标记都还在，重新走一轮不会清掉它们。</div>
  </div>`;
}

// ---------------- 面板 ----------------

/**
 * 遇见面板。三种状态：
 *   有卡   → 当前一张 + 动作
 *   耗尽   → 走完提示 + 重开
 *   空池   → 明确说没有内容，不显示空壳卡片
 */
export function renderFeedPanel() {
  const total = feedCapacity();
  if (!total) {
    return `
    <div class="cl-feed-empty">
      <div class="cl-feed-end-h">内容池是空的</div>
      <div class="cl-feed-end-p">没有可遇见的内容。这不是加载失败，是确实没有。</div>
    </div>`;
  }

  const st = loadFeed();
  const node = drawFeed(st.seq, st.round);

  if (!node) {
    return `
    <div class="cl-feed-hd">
      <span class="cl-feed-hd-t">遇见</span>
      <span class="cl-feed-hd-n">${total} / ${total}</span>
    </div>
    ${endHtml(total, st)}`;
  }

  return `
  <div class="cl-feed-hd">
    <span class="cl-feed-hd-t">遇见</span>
    <span class="cl-feed-hd-n">第 ${st.seq + 1} / ${total} 条${st.round ? ` · 第 ${st.round + 1} 轮` : ''}</span>
  </div>
  <div class="cl-feed-stage">
    ${cardHtml(node, st.seq, total)}
  </div>
  ${actsHtml(node)}`;
}

// ---------------- 动作 ----------------

/**
 * 执行一个动作并把卡片推走。
 *
 * kind:
 *   'keep'   留下 —— 记标记，前进一张
 *   'doubt'  存疑 —— 记标记，前进一张
 *   'skip'   划过但不标记（暂未开放给按钮，保留给手势误触后的静默前进）
 *
 * 顺序很关键：先写状态，再动 DOM，最后 repaint。
 * 反过来的话，动画途中刷新页面会丢记录。
 */
export function doFeedAction(kind, id, repaint) {
  const st = loadFeed();
  const cur = drawFeed(st.seq, st.round);
  if (!cur) return;

  const targetId = id || cur.id;

  if (kind === MARK_KEEP || kind === MARK_DOUBT) {
    // 再点一次同一个标记 = 撤销。用户不必去手记里才能反悔。
    const now = markOf(targetId);
    setMark(targetId, now === kind ? null : kind);
    toast(now === kind ? '已撤销' : (kind === MARK_KEEP ? '已留下' : '已存疑'));
  }

  advanceFeed(targetId);
  if (typeof repaint === 'function') repaint();
}

export function startNextRound(repaint) {
  nextFeedRound();
  toast('重新开始一轮');
  if (typeof repaint === 'function') repaint();
}

// ---------------- 手势 ----------------

/**
 * 绑定左右滑。
 *
 * 几条必须守住的：
 *   · 不能吃掉页面纵向滚动 —— 卡片上 `touch-action: pan-y`，
 *     一旦判定为纵向手势就立刻放弃接管，把控制权还给浏览器。
 *   · 不能误触 —— 位移超过阈值才算，且横向分量必须大于纵向。
 *   · 不能重复记录 —— 动画期间上锁，第二次 pointerdown 直接忽略。
 *   · 尊重 prefers-reduced-motion —— 关掉位移动画，直接切卡。
 *
 * 上滑不做手势：卡片区域本身要能纵向滚动，上滑手势和滚动冲突，
 * 冲突时用户会以为页面卡住。「深入阅读」用常驻按钮，比猜手势可靠。
 *
 * @param {HTMLElement} root  观心视图根节点（事件委托挂这里）
 * @param {Function} repaint  状态变化后重绘
 */
export function bindFeedGesture(root, repaint) {
  if (!root || root.dataset.feedBound) return;
  root.dataset.feedBound = '1';

  const THRESHOLD = 76;     // px：超过才触发
  const AXIS_LOCK = 9;      // px：超过才判定方向
  const MAX_TILT = 12;      // deg：最大倾斜，不做得像翻牌

  let card = null;
  let pid = null;
  let sx = 0;
  let sy = 0;
  let dx = 0;
  let axis = null;
  let busy = false;

  function stageEl() {
    return root.querySelector('.cl-feed-stage');
  }

  function settle(el, animated) {
    if (!el) return;
    el.style.transition = animated
      ? 'transform .22s cubic-bezier(.22,.61,.36,1), opacity .22s'
      : 'none';
    el.style.transform = '';
    el.style.opacity = '';
  }

  function fly(el, dir, kind) {
    if (!el) return;
    busy = true;
    if (reduceMotion()) {
      doFeedAction(kind, el.dataset.id, repaint);
      busy = false;
      return;
    }
    el.style.transition = 'transform .26s cubic-bezier(.4,0,.6,1), opacity .26s';
    el.style.transform = `translateX(${dir * 130}%) rotate(${dir * 10}deg)`;
    el.style.opacity = '0';
    setTimeout(() => {
      doFeedAction(kind, el.dataset.id, repaint);
      busy = false;
    }, 250);
  }

  root.addEventListener('pointerdown', (e) => {
    if (busy) return;
    if (e.pointerType === 'mouse' && e.button !== 0) return;
    const c = e.target.closest('.cl-card');
    if (!c) return;
    // 卡片里的按钮、链接、输入框不参与拖拽
    if (e.target.closest('button, a, textarea, input, select')) return;
    if (!stageEl()) return;

    card = c;
    pid = e.pointerId;
    sx = e.clientX;
    sy = e.clientY;
    dx = 0;
    axis = null;
    card.style.transition = 'none';
    try { root.setPointerCapture(pid); } catch { /* 老浏览器忽略 */ }
  });

  root.addEventListener('pointermove', (e) => {
    if (!card || e.pointerId !== pid) return;
    const mx = e.clientX - sx;
    const my = e.clientY - sy;

    if (!axis) {
      if (Math.abs(mx) < AXIS_LOCK && Math.abs(my) < AXIS_LOCK) return;
      axis = Math.abs(mx) > Math.abs(my) ? 'x' : 'y';
      // 纵向：立刻交还给浏览器，后面不再碰这张卡
      if (axis === 'y') {
        settle(card, false);
        card = null;
        pid = null;
        return;
      }
    }
    if (axis !== 'x') return;

    dx = mx;
    const tilt = Math.max(-MAX_TILT, Math.min(MAX_TILT, dx / 12));
    card.style.transform = `translateX(${dx}px) rotate(${tilt}deg)`;
    card.style.opacity = String(Math.max(0.55, 1 - Math.abs(dx) / 520));
  });

  function finish(e) {
    if (!card || (e && e.pointerId !== pid)) return;
    const el = card;
    const moved = dx;
    card = null;
    pid = null;
    axis = null;

    if (Math.abs(moved) >= THRESHOLD) {
      fly(el, moved < 0 ? -1 : 1, moved < 0 ? MARK_DOUBT : MARK_KEEP);
    } else {
      settle(el, true);
    }
  }

  root.addEventListener('pointerup', finish);
  root.addEventListener('pointercancel', finish);
  root.addEventListener('pointerleave', finish);
}
