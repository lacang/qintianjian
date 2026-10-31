// classic-schema.js — 经典内容包契约（纯函数，无 DOM、无网络）
//
// 存在理由（董事长 2026-10-31 批示，第一部分第 4 条）：
//   「我希望以后每一种内容体系都能继承这套结构，而不是只为《论语》做一套特殊页面。」
//
// 因此「观心」不是《论语》专属页面，而是「经典内容渲染器」。
// 任何一套内容（道德经 / 庄子 / 孟子 / 传习录 / 佛典 / 古希腊 / 斯多葛）
// 只要满足本契约，就能接入，且自动继承全部产品规则：
//   · 八层详情结构
//   · 关系展示权限（原典有据 / 注家合观 / 编辑阐释 / 待考 / 不成立）
//   · 孤立节点三入口回退，绝不编造关系
//
// 契约只约束「结构」，不约束「内容」。内容真实性由各内容库自己的终审负责。

export const PACK_VERSION = 1;

/** 内容包顶层必备字段 */
export const REQUIRED_TOP = ['meta', 'clusters', 'relations', 'thoughts', 'corrections', 'entrypoints'];

/** 单个思想单元必备字段 */
export const REQUIRED_THOUGHT = [
  'id', 'classic', 'title', 'original', 'location_text', 'idea',
];

/** meta 必备字段 */
export const REQUIRED_META = ['name', 'classic', 'version', 'status', 'counts'];

/** counts 必备字段（统计口径必须与终审一致，不得含糊） */
export const REQUIRED_COUNTS = ['thoughts', 'relations', 'relations_verified', 'relations_pending', 'relations_rejected'];

/**
 * 八层结构的稳定标识。
 * 顺序即展示顺序，任何一种经典都必须能填出这八层；
 * 某层无内容时填占位说明，不得跳过层级（否则「解释必须分层」就落空了）。
 */
export const LAYER_KEYS = [
  'original', 'plain', 'source', 'person', 'nearby', 'commentary', 'dispute', 'modern',
];

/** 关系展示分类的合法取值 */
export const DISPLAY_CLASSES = ['canon_relation', 'commentary_relation', 'editorial_relation'];

/**
 * 校验一个内容包是否符合契约。
 * @returns {string[]} 错误列表，空数组表示通过
 */
export function validateClassic(pack, opts = {}) {
  const errs = [];
  if (!pack || typeof pack !== 'object') return ['内容包不是对象'];

  for (const k of REQUIRED_TOP) {
    if (!(k in pack)) errs.push(`缺少顶层字段 ${k}`);
  }
  if (errs.length) return errs;

  const meta = pack.meta || {};
  for (const k of REQUIRED_META) {
    if (!(k in meta)) errs.push(`meta 缺少 ${k}`);
  }
  const counts = meta.counts || {};
  for (const k of REQUIRED_COUNTS) {
    if (!(k in counts)) errs.push(`meta.counts 缺少 ${k}`);
  }

  if (!Array.isArray(pack.thoughts) || !pack.thoughts.length) {
    errs.push('thoughts 必须是非空数组');
    return errs;
  }

  const ids = new Set();
  for (const t of pack.thoughts) {
    for (const k of REQUIRED_THOUGHT) {
      if (t[k] == null || t[k] === '') errs.push(`思想单元 ${t.id || '(无 id)'} 缺少 ${k}`);
    }
    if (ids.has(t.id)) errs.push(`思想单元 id 重复：${t.id}`);
    ids.add(t.id);
  }

  // 群归属必须指向真实存在的群，且由群定义反推——不允许两套词表各说各话
  const clusterIds = new Set((pack.clusters || []).map((c) => c.id));
  for (const t of pack.thoughts) {
    for (const cid of t.clusters || []) {
      if (!clusterIds.has(cid)) errs.push(`思想单元 ${t.id} 的群 ${cid} 不存在`);
    }
  }
  // 反向：每个群声明的分支必须都能落到真实节点
  for (const c of pack.clusters || []) {
    for (const b of c.branches || []) {
      if (!ids.has(b.node)) errs.push(`群 ${c.id} 的分支 ${b.node} 不是真实节点`);
    }
  }

  // 关系边必须有可判定的展示权限
  for (const r of pack.relations || []) {
    if (r.status === 'rejected') continue;   // 不成立边只存档，不要求展示分类
    if (!DISPLAY_CLASSES.includes(r.display_class)) {
      errs.push(`关系 ${r.id} 的 display_class 非法：${r.display_class}`);
    }
    if (r.display_class === 'editorial_relation' && !r.must_label) {
      errs.push(`关系 ${r.id} 为编辑阐释却未标 must_label`);
    }
  }

  // 辩题（可选能力）：若提供，必须能落到真实节点
  for (const d of pack.debates || []) {
    if (!ids.has(d.node)) errs.push(`辩题 ${d.id} 指向不存在的节点 ${d.node}`);
    if (!Array.isArray(d.stances) || d.stances.length < 2) errs.push(`辩题 ${d.id} 至少需要两个立场`);
  }

  // ---------- 主题标签（可选能力） ----------
  //
  // 董事长 2026-10-31 批准 v0.2 转正，并保留三条约束。三条约束都在这里变成硬校验：
  //   ① 标签允许交叉 —— 所以不校验"唯一归属"，只校验"有归属"；
  //   ② 标签相同不自动产生思想关系 —— 见下方"标签不得成为关系依据"；
  //   ③ 跨经典标签可以提前建立，但没有真实内容时不得显示虚假推荐
  //      —— 所以标签的 nodes 必须全部是本经典真实节点，不允许占位 id。
  const topicList = pack.topics || [];
  const tagIds = new Set();
  const tagNames = new Set();
  for (const tp of topicList) {
    if (!tp.id) errs.push('主题标签缺少 id');
    if (tagIds.has(tp.id)) errs.push(`主题标签 id 重复：${tp.id}`);
    tagIds.add(tp.id);
    if (!tp.name) errs.push(`主题标签 ${tp.id} 缺少 name`);
    if (tagNames.has(tp.name)) errs.push(`主题标签名重复：${tp.name}`);
    tagNames.add(tp.name);
    if (!Array.isArray(tp.nodes) || !tp.nodes.length) errs.push(`主题 ${tp.id} 没有节点清单`);
    for (const nid of tp.nodes || []) {
      if (!ids.has(nid)) errs.push(`主题 ${tp.id} 指向不存在的节点 ${nid}`);
    }
  }

  // 归属完整性：标签一旦启用，就不允许有节点落在所有主题之外。
  // 「宁可入口为空」说的是**推荐结果**可以为空，不是「这条内容没有主题」。
  const owned = new Map();
  for (const t of pack.thoughts) {
    const mine = t.topics || [];
    if (!Array.isArray(mine)) { errs.push(`思想单元 ${t.id} 的 topics 不是数组`); continue; }
    if (tagIds.size && !mine.length) errs.push(`思想单元 ${t.id} 没有归入任何主题`);
    if (mine.length > 4) errs.push(`思想单元 ${t.id} 归入 ${mine.length} 个主题，超过上限 4（防止"什么都算"）`);
    for (const tid of mine) {
      if (!tagIds.has(tid)) errs.push(`思想单元 ${t.id} 的主题 ${tid} 不存在`);
    }
    owned.set(t.id, mine);
  }
  // 反向：标签声明的节点，必须自己也承认这个归属（两套词表不得各说各话）
  for (const tp of topicList) {
    for (const nid of tp.nodes || []) {
      if (!(owned.get(nid) || []).includes(tp.id)) {
        errs.push(`主题 ${tp.id} 声明包含 ${nid}，但该节点没有反向声明这个主题`);
      }
    }
  }

  // ★ 标签不得成为思想关系的依据。
  // 这是"标签相同不自动产生思想关系"的结构性保证：只要有人拿标签去生成关系边，
  // 这里就会红。不是靠约定，是靠校验。
  for (const r of pack.relations || []) {
    const rb = String(r.relation_basis || '');
    if (rb && !['canon', 'commentary', 'editorial'].includes(rb)) {
      errs.push(`关系 ${r.id} 的 relation_basis 非法：${rb}`);
    }
    if (/topic|tag|label|主题标签/.test(rb)) {
      errs.push(`关系 ${r.id} 以标签/主题为依据——标签不得作为思想关系的依据`);
    }
    const fromTopic = tagIds.has(r.from) || tagIds.has(r.to);
    if (fromTopic) errs.push(`关系 ${r.id} 的两端是主题标签而不是思想单元`);
  }

  if (opts.strict && errs.length) return errs;
  return errs;
}

/**
 * 内容包能力自述：产品据此决定显示哪些入口。
 * 缺少某项能力时，对应入口不显示——而不是显示一个空壳。
 */
export function packCapabilities(pack) {
  return {
    debate: Array.isArray(pack.debates) && pack.debates.length > 0,
    topics: Array.isArray(pack.topics) && pack.topics.length > 0,
    corrections: Array.isArray(pack.corrections) && pack.corrections.length > 0,
    relations: Array.isArray(pack.relations) && pack.relations.length > 0,
  };
}
