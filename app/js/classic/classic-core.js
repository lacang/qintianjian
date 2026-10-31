// classic-core.js — 经典板块 · 核心逻辑层（纯函数，无 DOM、无网络、无副作用）
//
// 本文件对「当前经典」（默认《论语》）做全部内容判定。换成别的经典只需换 registry，
// 判定规则一行不用改——这是董事长 2026-10-31 批示第一部分第 4 条的要求。
//
// 四条硬约束（来自内容库综合批示）：
//   1. 随机性必须真实 —— 抽取只由「种子」决定，不由任何内容偏好决定。
//   2. 问心的用户问题不得影响抽取结果 —— drawAsk() 签名上就不接收问题文本。
//   3. 解释必须分层 —— 关系边一律按 status + display_class 判定展示权限，
//      编辑阐释即使 verified 也不得被当作原典关系。
//   4. 确定性 —— 同一日期 / 同一种子必得同一结果，符合钦天监「确定性」铁律。
//
// 三种抽取是三种不同机制，不是同一个随机函数换三个标题
// （董事长 2026-10-31 批示第一部分第 2 条明确要求）：
//   今日相遇 = 年度洗牌 + 按日序取    → 相邻两天必不同，一年内均匀走遍全池
//   问心     = 当日洗牌队列 + 按序号取 → 同日多次绝不重复，跨日重新洗牌
//   一念三观 = 分层抽样（按思想群）    → 三条来自不同群，构成多角度而非三条同质

import { activeClassic } from './classic-registry.js';
import { LAYER_KEYS, packCapabilities } from './classic-schema.js';

/** 当前经典内容包 */
function C() {
  const p = activeClassic();
  if (!p) throw new Error('没有已注册的经典内容包');
  return p;
}

// ---------------- 种子随机（确定性） ----------------

/** FNV-1a 32bit：把任意字符串映射为稳定整数种子 */
export function hash32(str) {
  let h = 2166136261 >>> 0;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 16777619) >>> 0;
  }
  return h >>> 0;
}

/** mulberry32：小而稳定的 PRNG，同种子同序列 */
export function rng(seed) {
  let a = seed >>> 0;
  return function next() {
    a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** 本地日期键 YYYY-MM-DD（不用 UTC，避免跨时区「今日」错位） */
export function dateKey(d = new Date()) {
  const p = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

/** 年内第几天（1 起）。只按日历算，不依赖时区偏移。 */
export function dayOfYear(dk = dateKey()) {
  const [y, m, d] = String(dk).split('-').map(Number);
  if (!y || !m || !d) return 1;
  const t = Date.UTC(y, m - 1, d);
  const start = Date.UTC(y, 0, 1);
  return Math.floor((t - start) / 86400000) + 1;
}

/** 按种子把数组洗成确定性顺序（Fisher-Yates，同种子同结果） */
export function shuffledOrder(seed, arr) {
  const a = arr.slice();
  const next = rng(hash32(seed));
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(next() * (i + 1));
    const tmp = a[i]; a[i] = a[j]; a[j] = tmp;
  }
  return a;
}

// ---------------- 抽取池 ----------------

/** 抽签池：只含人工审核判定 draw_suitability === '适合' 的条目 */
export function poolNodes() {
  return C().thoughts.filter((t) => t.ratings && t.ratings.draw_suitability === '适合');
}

/**
 * 今日相遇 —— 机制：年度洗牌 + 按日序取。
 *
 * 为什么不用「随机取一条」：18 条池子里纯随机抽，相邻两天撞同一条的概率是 1/18，
 * 一年会撞二十来次。而「每日相逢」要的是每天都遇见新的，不该连着两天见同一句。
 * 所以把全池按「年」洗成一条固定长队，每天往前走一格——同一天恒定，相邻天必不同，
 * 一年走完全池若干轮，节奏均匀。这是日历，不是抽签。
 */
export function drawDaily(dk = dateKey()) {
  const pool = poolNodes();
  if (!pool.length) return null;
  const year = String(dk).slice(0, 4);
  const order = shuffledOrder(`encounter-year::${year}`, pool);
  return order[(dayOfYear(dk) - 1) % order.length];
}

/**
 * 问心 —— 机制：当日洗牌队列 + 按序号取。
 *
 * 为什么不用「按序号随机」：同一天连问三次可能撞到同一条，体验上像系统坏了。
 * 这里把全池按「当日」洗成一条队列，第 1 次取第 1 张、第 2 次取第 2 张——
 * 同日之内绝不重复；跨日种子变化，重新洗牌。池子走完一轮后换轮次种子再洗。
 *
 * @param {number} seq 当日第几次问心（从 0 起）
 * @param {string} dk  日期键
 *
 * 注意：签名刻意不含问题文本。用户写的问题只用于事后对照阅读，
 * 永远不参与种子，因此不可能影响抽到哪一条。
 */
export function drawAsk(seq, dk = dateKey()) {
  const pool = poolNodes();
  if (!pool.length) return null;
  const n = Math.max(0, Math.floor(Number(seq)) || 0);
  const round = Math.floor(n / pool.length);
  const idx = n % pool.length;
  const order = shuffledOrder(`ask-queue::${dk}::${round}`, pool);
  return order[idx];
}

/**
 * 一念三观 —— 机制：分层抽样。
 *
 * 为什么不用「抽三条不重复」：那样三条常常来自同一个群，读起来是同一种话换三句。
 * 「连续探索」要的是三个不同角度。所以先按种子把思想群打乱，取三个不同的群，
 * 再从每个群里各抽一条。三条必然来自三个不同思想群。
 *
 * @returns {{node:object, group:string, groupName:string}[]}
 */
export function drawThree(seq, dk = dateKey()) {
  const pool = poolNodes();
  if (!pool.length) return [];

  const byGroup = new Map();
  for (const t of pool) {
    for (const cid of t.clusters || []) {
      if (!byGroup.has(cid)) byGroup.set(cid, []);
      byGroup.get(cid).push(t);
    }
  }
  const groupIds = [...byGroup.keys()].sort();
  const gOrder = shuffledOrder(`three-groups::${dk}::${seq}`, groupIds);

  const out = [];
  const used = new Set();
  for (const gid of gOrder) {
    if (out.length >= 3) break;
    const cands = byGroup.get(gid).filter((t) => !used.has(t.id));
    if (!cands.length) continue;
    const pick = shuffledOrder(`three-pick::${dk}::${seq}::${gid}`, cands)[0];
    used.add(pick.id);
    out.push({ node: pick, group: gid, groupName: clusterName(gid) });
  }
  return out;
}

// ---------------- 节点与关系 ----------------

export function getNode(id) {
  return C().thoughts.find((t) => t.id === id) || null;
}

export function getCorrection(id) {
  return C().corrections.find((c) => c.id === id) || null;
}

export function allNodes() {
  return C().thoughts;
}

export function clusterName(id) {
  const c = C().clusters.find((x) => x.id === id);
  return c ? c.name : id;
}

export function meta() {
  return C().meta;
}

export function allClusters() {
  return C().clusters;
}

/** 当前内容包具备哪些能力（缺少的能力对应入口不显示，而不是显示空壳） */
export function capabilities() {
  return packCapabilities(C());
}

/**
 * 关系展示权限判定 —— 产品端的唯一出口。
 * 任何地方要展示一条关系，都必须经过这里拿 badge，不得直接读 status。
 *
 * 返回 { ok, badge, tone, wording }
 *   ok=false  → 不得展示（rejected）
 *   tone      → 'canon' | 'commentary' | 'editorial' | 'pending'
 */
export function relationBadge(r) {
  if (!r) return { ok: false, badge: '', tone: 'none', wording: '' };
  if (r.status === 'rejected') {
    return { ok: false, badge: '不成立', tone: 'rejected', wording: '此关系经审校不成立，仅存档' };
  }

  // 硬规则：must_label 为真时，无论 status 是什么，都必须标「编辑阐释」
  if (r.must_label || r.display_class === 'editorial_relation') {
    return {
      ok: true,
      badge: r.status === 'pending' ? '编辑阐释 · 待考' : '编辑阐释',
      tone: 'editorial',
      wording: '这是我们今天的理解，不是原典直接建立的关系',
    };
  }
  if (r.display_class === 'commentary_relation') {
    return {
      ok: true,
      badge: r.status === 'pending' ? '注家合观 · 待考' : '注家合观',
      tone: 'commentary',
      wording: '此联系出自历代注家，非孔子自述',
    };
  }
  if (r.display_class === 'canon_relation') {
    if (r.status === 'pending') {
      return { ok: true, badge: '原典有据 · 待考', tone: 'pending', wording: '原典本文可见此联系，但尚未通过终审' };
    }
    return { ok: true, badge: '原典有据', tone: 'canon', wording: '此联系见于原典本文' };
  }

  // 走到这里说明 display_class 缺失或不在契约里。
  // 董事长 2026-10-31 批示：「展示层不允许通过默认分支猜测内容身份。」
  // 所以这里不猜、不兜底——显式标成不可展示。ok:false 会被 visibleRelations 过滤掉，
  // 也就是说这类边宁可看不见，也不能被标成「原典有据」端到用户面前。
  return { ok: false, badge: '展示分类缺失', tone: 'none', wording: '这条关系缺少展示分类，无法判断性质，暂不展示' };
}

/** 节点可用于展示的关系（已按权限过滤） */
export function visibleRelations(node) {
  if (!node || !node.relations) return [];
  return node.relations
    .filter((r) => r.status !== 'rejected')
    .map((r) => ({ ...r, badge: relationBadge(r) }))
    .filter((r) => r.badge.ok);
}

/** 该节点被哪些纠错条目指向 */
export function correctionsFor(node) {
  if (!node || !node.corrections) return [];
  return node.corrections.map(getCorrection).filter(Boolean);
}

// ---------------- 孤立节点三入口 ----------------

/** 同一思想群：展示同群其他节点（依据=原典归类，不构成思想关系） */
export function sameCluster(node, limit = 6) {
  const ids = node.clusters || [];
  const out = [];
  for (const t of allNodes()) {
    if (t.id === node.id) continue;
    if ((t.clusters || []).some((c) => ids.includes(c))) out.push(t);
    if (out.length >= limit) break;
  }
  return out;
}

/** 同一篇章：展示同一篇内其他章（依据=文本位置） */
export function sameChapter(node, limit = 6) {
  const books = (node.location || []).map((l) => l.book);
  const out = [];
  for (const t of allNodes()) {
    if (t.id === node.id) continue;
    if ((t.location || []).some((l) => books.includes(l.book))) out.push(t);
    if (out.length >= limit) break;
  }
  return out;
}

/**
 * 主题推荐：走审核通过的「主题标签」，不是走原始 tags。
 * 原始 tags 是内容描述词（102 个里 89 个单条专属），承担不了跨条目探索；
 * 主题标签是人工审核过的思想主题，未审核时不返回任何内容（宁可空，不编造）。
 */
export function topicRecommend(node, limit = 6) {
  const topics = C().topics || [];
  if (!topics.length) return [];
  const mine = node.topics || [];
  if (!mine.length) return [];
  const out = [];
  const seen = new Set([node.id]);
  for (const tp of topics) {
    if (!mine.includes(tp.id)) continue;
    for (const nid of tp.nodes || []) {
      if (seen.has(nid)) continue;
      const n = getNode(nid);
      if (!n) continue;
      seen.add(nid);
      out.push(n);
      if (out.length >= limit) return out;
    }
  }
  return out;
}

/** 该节点所属主题（审核通过的） */
export function topicsOf(node) {
  const topics = C().topics || [];
  const mine = node.topics || [];
  return topics.filter((tp) => mine.includes(tp.id));
}

/**
 * 探索入口：有可靠关系时走关系；无关系时走三入口，绝不编造关系补全。
 * 返回 { mode: 'relations'|'fallback', relations, entries }
 */
export function exploreEntries(node) {
  const rels = visibleRelations(node);
  if (rels.length) return { mode: 'relations', relations: rels, entries: [] };

  // kind 是入口的性质标识。董事长 2026-10-31 批示原则二：
  // 「未来标签体系完善后，孤立节点可以获得更多探索入口，但这些入口必须明确区分：
  //   原典关系 / 注疏关系 / 编辑比较 / 主题推荐。用户可以看到它们，但不能把它们混为一谈。」
  // 关系边那一侧的 kind 用 display_class（canon/commentary/editorial），
  // 非关系入口在这里用 cluster / chapter / topic，互不借用名字。
  const entries = [];
  const sc = sameCluster(node);
  if (sc.length) entries.push({ id: 'same_cluster', kind: 'cluster', label: '同一思想群', basis: '原典归类', nodes: sc });
  const sp = sameChapter(node);
  if (sp.length) entries.push({ id: 'same_chapter', kind: 'chapter', label: '同一篇章', basis: '文本位置', nodes: sp });
  const tr = topicRecommend(node);
  if (tr.length) {
    entries.push({
      // label 用「同一主题」而不是「主题推荐」：后者是**入口性质**的名字（KIND_LABEL.topic），
      // 两处同名会渲染成「主题推荐主题推荐」。名字重复比多改一个词更伤可读性。
      id: 'topic_recommend', kind: 'topic', label: '同一主题', basis: '编辑推荐',
      mustLabel: '主题推荐，非思想关系', nodes: tr,
    });
  }
  return { mode: 'fallback', relations: [], entries };
}

// ---------------- 原典详情八层 ----------------

/**
 * 八层结构。每层带 layer 标签，界面必须视觉区分，
 * 不得把现代人的理解伪装成古人的原意。
 *
 * 层序由 classic-schema 的 LAYER_KEYS 固定：任何一套经典都必须填出这八层，
 * 无内容时给占位说明，不允许跳层（跳层等于让读者以为「这层不存在」）。
 */
export function detailLayers(node) {
  const ctx = node.context || {};
  const ev = node.evidence || {};
  const layers = {
    original: {
      layer: '一 · 原文', kind: 'canon',
      note: '原典本文，未作改动',
      items: [{ label: '', text: node.original }],
    },
    plain: {
      layer: '二 · 白话', kind: 'modern',
      note: '现代白话串讲，帮助我们读懂字面意思',
      items: [{ label: '思想要旨', text: node.idea || '（此条暂无白话串讲）' }],
    },
    source: {
      layer: '三 · 出处', kind: 'canon',
      note: '文本位置',
      items: [{ label: '位置', text: node.location_text || '' }],
    },
    person: {
      layer: '四 · 人物背景', kind: 'canon',
      note: '谁在说、对谁说、当时在讨论什么',
      items: [
        { label: '说话人', text: ctx.speaker || '（未记）' },
        { label: '对话者', text: ctx.interlocutor || '（未记）' },
        { label: '缘起', text: ctx.occasion || '（未记）' },
      ],
    },
    nearby: {
      layer: '五 · 前后章', kind: 'canon',
      note: '同一篇中的上下文位置',
      items: [
        { label: '前文', text: ctx.before || '（未记）' },
        { label: '后文', text: ctx.after || '（未记）' },
      ],
    },
    commentary: {
      layer: '六 · 历代注疏', kind: 'commentary',
      note: '古人怎么解，逐条注明注家与注本',
      items: (node.commentaries || []).length
        ? node.commentaries.map((c) => ({ label: `${c.author}《${c.work}》`, text: c.text }))
        : [{ label: '', text: '（此条暂无收录注疏）' }],
    },
    dispute: {
      layer: '七 · 注家分歧', kind: 'dispute',
      note: '存在分歧时并列，不合成单一答案',
      items: (node.disputes || []).length
        ? node.disputes.map((d) => ({ label: d.topic, text: (d.positions || []).join('\n') }))
        : [{ label: '', text: '（此条未见明显分歧）' }],
    },
    modern: {
      layer: '八 · 现代编辑解读', kind: 'editorial',
      note: '这是今人的研究与我们自己的理解，不是古人的原意',
      items: modernItems(ev),
    },
  };
  return LAYER_KEYS.map((k) => ({ key: k, ...layers[k] }));
}

function modernItems(ev) {
  const out = [];
  const map = [
    ['popular', '大众传播'], ['academic', '学术研究'],
    ['commentary', '注疏脉络'], ['modern', '现代跨学科'],
  ];
  for (const [k, label] of map) {
    const v = ev[k];
    if (v && v.text) out.push({ label, text: stripMd(v.text) });
  }
  if (!out.length) out.push({ label: '', text: '（此条暂无现代解读材料）' });
  return out;
}

/** 去掉研究稿里的 Markdown 记号，只留可读文字 */
function stripMd(s) {
  return String(s)
    .replace(/^[-*]\s*/gm, '')
    .replace(/\*\*/g, '')
    .replace(/\[([^\]]+)\]\((https?:\/\/[^)]+)\)/g, '$1')
    .trim();
}

// ---------------- 问心反馈（五种，只影响后续阅读，不影响本次抽取） ----------------
//
// 董事长 2026-10-31 批示第一部分第 3 条：
//   「这些交互可以影响后续的阅读体验，但不能反过来影响这一次的抽取结果，
//     也不能让 AI 根据用户情绪重新挑选经典。」
//
// 结构上的保证：feedbackEffect() 返回的对象里根本不存在「重新抽取」这类字段。
// 它不是「我们承诺不重抽」，而是「这里没有重抽这个能力」。

export const FEEDBACK = [
  { id: 'agree', label: '我认同', hint: '记下你的态度' },
  { id: 'disagree', label: '我不认同', hint: '看看历代注家在这一点上怎么分岔' },
  { id: 'unsure', label: '我没看懂', hint: '先把字面读通' },
  { id: 'recall', label: '这让我想起了自己的某件事', hint: '写一句只留在你这一屏的话' },
  { id: 'more', label: '我想继续了解', hint: '进入原典详情' },
];

/**
 * 反馈 → 阅读体验动作。
 * 返回 { openLayers?, gotoDetail?, compose?, note }
 * 绝不返回任何可以改变本次抽取结果的东西。
 */
export function feedbackEffect(id) {
  switch (id) {
    case 'disagree':
      return {
        openLayers: ['dispute', 'commentary'],
        note: '不认同是正当的。这一层把历代注家的分岔摆出来——你会发现，古人也未必只有一种读法。',
      };
    case 'unsure':
      return {
        openLayers: ['plain', 'commentary'],
        note: '没看懂很正常。先看白话把字面读通，再看注家怎么一句一句解。',
      };
    case 'recall':
      return {
        compose: true,
        note: '把它写下来。这段话只存在你自己的设备上，不上传，也不参与任何抽取。',
      };
    case 'more':
      return {
        gotoDetail: true,
        openLayers: ['commentary', 'dispute', 'modern'],
        note: '往下读。原文、注疏、分歧、今人的理解都在那里。',
      };
    case 'agree':
    default:
      return {
        note: '记下了。认同不必急着说理由，但值得过几天回头看看还认不认。',
      };
  }
}

// ---------------- 辩一辩 ----------------
//
// 董事长 2026-10-31 批示第三部分：
//   「系统展示原文之后，不要急着解释，而是先问：你觉得一个人应该如何对待伤害过自己的人？
//     用户选择自己的立场，然后再进入原文语境、注疏和不同理解。」
//   「不是让用户回答标准答案，而是让他意识到，古人的思想也可以被质疑、讨论和重新理解。」
//
// 产品上的关键区分：「你怎么做」和「孔子说什么」是两回事。
// 辩题问的是前者（关于用户自己的选择，没有标准答案）；
// 读完之后给出的注疏与分歧是后者（关于文本的知识，有真伪之别）。
// 两者不能混为一谈，否则要么变成道德考试，要么变成相对主义。

export function debateList() {
  return C().debates || [];
}

export function getDebate(id) {
  return debateList().find((d) => d.id === id) || null;
}

/** 该节点是否有辩题 */
export function debateFor(node) {
  if (!node) return null;
  return debateList().find((d) => d.node === node.id) || null;
}

/**
 * 立场对照：用户选的立场对应哪一条注家脉络。
 * 这是「位置对照」，不是「对错判定」——返回值里没有 correct 字段。
 */
export function stanceOf(debate, stanceId) {
  if (!debate) return null;
  return (debate.stances || []).find((s) => s.id === stanceId) || null;
}

/**
 * 读完之后，把「文本说了什么」与「你选了什么」分开呈现。
 * canon 段只陈述原典与注家的实际情况，不评价用户。
 */
export function debateAfterword(debate) {
  if (!debate) return null;
  return {
    text: debate.afterword || '',
    canonNote: debate.canon_note || '',
    disputeRef: debate.dispute_ref || '',
    // 刻意不提供「你的选择是否正确」这类结论
  };
}

// ---------------- 自检 ----------------

/**
 * 内容权限自检：产品上线前必须全绿。
 * 任何一条不通过，说明权限控制被破坏，不得发布。
 */
export function auditPermission() {
  const errs = [];
  const pack = C();
  const pool = poolNodes();
  if (pool.length !== pack.meta.counts.draw_pool) {
    errs.push(`抽签池数量不符：实际 ${pool.length}，数据声明 ${pack.meta.counts.draw_pool}`);
  }
  for (const t of pack.thoughts) {
    for (const r of t.relations || []) {
      if (r.status === 'rejected') errs.push(`节点 ${t.id} 的关系索引仍含不成立边 ${r.id}`);
      if (r.must_label && relationBadge(r).tone !== 'editorial') {
        errs.push(`关系 ${r.id} 标记 must_label 却未被判为编辑阐释`);
      }
    }
  }
  for (const r of pack.relations) {
    // 不成立边优先：永不展示，因此不再要求它带展示标记
    if (r.status === 'rejected') {
      if (relationBadge(r).ok) errs.push(`关系 ${r.id} 已判不成立却仍可展示`);
      continue;
    }
    if (r.display_class === 'editorial_relation' && relationBadge(r).tone !== 'editorial') {
      errs.push(`关系 ${r.id} 为编辑阐释却未按编辑阐释展示`);
    }
  }
  return errs;
}

/**
 * 节点覆盖自检：26 个（或任何数量的）思想单元必须全部可达，
 * 不允许因为分类词表不一致就从产品里消失。
 *
 * 董事长 2026-10-31 批示第一部分第 5 条：
 *   「26 个节点必须完整进入产品，不能因为分类词表不一致就让节点消失。」
 */
export function auditCoverage() {
  const errs = [];
  const pack = C();
  const all = pack.thoughts;

  // 1. 每个节点都必须归入至少一个真实存在的群
  const clusterIds = new Set((pack.clusters || []).map((c) => c.id));
  for (const t of all) {
    const cs = t.clusters || [];
    if (!cs.length) errs.push(`节点 ${t.id} 未归入任何思想群`);
    for (const cid of cs) if (!clusterIds.has(cid)) errs.push(`节点 ${t.id} 的群 ${cid} 不存在`);
  }

  // 2. 探索页可达性：每个节点必须能被「按群浏览」或「独立条目」列出
  const listed = new Set();
  for (const c of pack.clusters || []) {
    for (const t of all) if ((t.clusters || []).includes(c.id)) listed.add(t.id);
  }
  for (const t of all) if (!(t.relations || []).length) listed.add(t.id);
  for (const t of all) if (!listed.has(t.id)) errs.push(`节点 ${t.id} 在探索页不可达`);

  // 3. 关系索引只允许装思想关系：对端必须存在，且不得混入纠错边
  for (const t of all) {
    for (const r of t.relations || []) {
      if (!getNode(r.peer)) errs.push(`节点 ${t.id} 的关系对端 ${r.peer} 不存在`);
      if (r.type === 'corrects') {
        errs.push(`节点 ${t.id} 的关系索引混入纠错边 ${r.id}（纠错不是思想关系，只能走 corrections）`);
      }
      // 展示层不再兜底猜身份，所以数据层必须保证每条边都有合法的展示分类。
      // 缺了它，这条边在界面上会直接消失——比被误标成「原典有据」好，但仍然是个缺陷。
      if (!['canon_relation', 'commentary_relation', 'editorial_relation'].includes(r.display_class)) {
        errs.push(`节点 ${t.id} 的关系 ${r.id} 缺少合法的 display_class（当前：${r.display_class}）`);
      }
    }
  }

  // 4. 每条都必须能构造出契约规定的八层，且层序一致
  for (const t of all) {
    const ls = detailLayers(t);
    if (ls.length !== 8) errs.push(`节点 ${t.id} 的层数为 ${ls.length}，应为 8`);
    const keys = ls.map((l) => l.key).join(',');
    if (keys !== LAYER_KEYS.join(',')) errs.push(`节点 ${t.id} 的层序不符契约：${keys}`);
  }

  // 5. 抽签池必须是全集的子集且非空
  const pool = poolNodes();
  if (!pool.length) errs.push('抽签池为空');
  for (const t of pool) if (!all.includes(t)) errs.push(`抽签池含非全集条目 ${t.id}`);

  // 6. 辩题必须落到真实节点，且立场不少于两个
  for (const d of pack.debates || []) {
    if (!getNode(d.node)) errs.push(`辩题 ${d.id} 指向不存在的节点 ${d.node}`);
    if ((d.stances || []).length < 2) errs.push(`辩题 ${d.id} 立场少于两个`);
  }

  return errs;
}
