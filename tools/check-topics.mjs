#!/usr/bin/env node
/**
 * 主题标签正式数据校验
 *
 * 董事长 2026-10-31 裁决：「标签候选版 v0.2：通过」，批准转为正式数据，
 * 并保留三条约束：
 *   ① 标签允许交叉，不强制每条思想只属于一个主题。
 *   ② 标签相同不自动产生思想关系。
 *   ③ 跨经典标签可以提前建立，但没有真实内容时不得显示虚假的推荐。
 *
 * 这个脚本验三件事：
 *   A. 正式数据本身够格（覆盖 / 依据 / 边界 / 交叉 / 上限）
 *   B. 正式数据真的进了产品，且与源文件逐条一致（不允许两套词表各说各话）
 *   C. 三条约束在结构上成立，而不只是写在文档里
 *
 * 它**不**验「标签分得好不好」——那是人工审核的事，已经做完了。
 */
import fs from 'node:fs';
import path from 'node:path';
import { LUNYU } from '../app/js/classic/lunyu-data.js';
import { validateClassic } from '../app/js/classic/classic-schema.js';
import { topicRecommend, visibleRelations } from '../app/js/classic/classic-core.js';

const ROOT = path.resolve(import.meta.dirname, '..');
const SRC = path.resolve(ROOT, '..', '论语思想单元候选库', '_build', 'topics.json');
const ARCHIVE = path.resolve(ROOT, '..', '论语思想单元候选库', '_build', 'archive', 'topics-candidate-v0.2.json');

let pass = 0, fail = 0;
const ok = (cond, name, extra = '') => {
  if (cond) { pass++; console.log('  · ' + name); }
  else { fail++; console.log('  ✗ ' + name + (extra ? '  → ' + extra : '')); }
};

console.log('主题标签正式数据校验');

if (!fs.existsSync(SRC)) {
  console.log('  ✗ 找不到 _build/topics.json');
  process.exit(1);
}

const src = JSON.parse(fs.readFileSync(SRC, 'utf-8'));
const meta = src.meta || {};
const topics = src.topics || [];
const nodes = LUNYU.thoughts.map((t) => t.id);
const nodeSet = new Set(nodes);

// ---------- A. 正式数据本身 ----------

ok(meta.status === 'approved', '正式数据状态为 approved（未批准不得进入产品）', `status=${meta.status}`);
ok(!!meta.approved_by, '记录了批准人', meta.approved_by || '(空)');
ok(topics.length >= 15 && topics.length <= 25, '标签数量在 15—25 之间', `实际 ${topics.length}`);

const cover = new Map();
const perNode = new Map();
for (const tp of topics) {
  for (const nid of tp.nodes || []) cover.set(nid, (cover.get(nid) || 0) + 1);
  for (const nid of tp.nodes || []) perNode.set(nid, [...(perNode.get(nid) || []), tp.id]);
}
const missing = nodes.filter((id) => !cover.has(id));
ok(missing.length === 0, '覆盖全部 26 个思想单元', `未覆盖 ${missing.join(',')}`);

const thin = topics.filter((t) => (t.basis || '').length < 40);
ok(thin.length === 0, '每个标签都写了归属依据（≥40 字，可追问「它为什么属于这个主题」）', thin.map((t) => t.name).join('、'));

const noBoundary = topics.filter((t) => (t.boundary || '').length < 10);
ok(noBoundary.length === 0, '每个标签都写了边界（说清它不是什么）', noBoundary.map((t) => t.name).join('、'));

const maxPer = Math.max(...nodes.map((id) => (perNode.get(id) || []).length));
ok(maxPer <= 4, '单条内容最多归入 4 个标签（防止「什么都算」）', `最多 ${maxPer} 个`);

// 约束①：允许交叉。若所有节点都只有 1 个标签，这条约束形同虚设。
const multi = nodes.filter((id) => (perNode.get(id) || []).length >= 2);
ok(multi.length > 0, '约束①落地：确实存在归属多个标签的节点（允许交叉，不强制唯一）', `${multi.length}/${nodes.length} 条跨 2 个以上主题`);

const dupName = topics.length - new Set(topics.map((t) => t.name)).size;
ok(dupName === 0, '标签名不重复', `重复 ${dupName}`);

// ---------- B. 正式数据真的进了产品 ----------

ok(Array.isArray(LUNYU.topics) && LUNYU.topics.length === topics.length,
  '★ pack.topics 已正式启用，条数与源文件一致', `产品 ${(LUNYU.topics || []).length} / 源 ${topics.length}`);

const prodMap = new Map((LUNYU.topics || []).map((t) => [t.id, t]));
const drift = [];
for (const tp of topics) {
  const p = prodMap.get(tp.id);
  if (!p) { drift.push(`${tp.id} 缺失`); continue; }
  if (p.name !== tp.name) drift.push(`${tp.id} 名称不一致`);
  const a = [...(tp.nodes || [])].sort().join(',');
  const b = [...(p.nodes || [])].sort().join(',');
  if (a !== b) drift.push(`${tp.id} 节点不一致`);
}
ok(drift.length === 0, '产品数据与源文件逐条一致（不允许两套词表各说各话）', drift.join('；'));

// 反向：每个节点的 topics 字段必须与标签声明一致
const mismatch = [];
for (const t of LUNYU.thoughts) {
  const declared = new Set();
  for (const tp of LUNYU.topics || []) {
    if ((tp.nodes || []).includes(t.id)) declared.add(tp.id);
  }
  const mine = new Set(t.topics || []);
  if (declared.size !== mine.size || [...declared].some((x) => !mine.has(x))) {
    mismatch.push(`${t.id} 声明[${[...mine]}] vs 标签[${[...declared]}]`);
  }
}
ok(mismatch.length === 0, '每个节点的 topics 与标签的 nodes 双向一致', mismatch.slice(0, 3).join('；'));

const schemaErrs = validateClassic(LUNYU, { strict: true });
ok(schemaErrs.length === 0, '内容包契约校验通过（含标签归属完整性）', schemaErrs.slice(0, 3).join('；'));

// ---------- C. 三条约束在结构上成立 ----------

// 约束②：标签相同不自动产生思想关系。
// 这条不能靠"约定"，要靠结构：关系边的依据里不许出现标签/主题，
// 关系边两端不许是标签 id，且标签推荐结果不得被当成关系边展示。
const badBasis = (LUNYU.relations || []).filter((r) => /topic|tag|label|主题标签/.test(String(r.relation_basis || '')));
ok(badBasis.length === 0, '★ 约束②落地：没有任何关系边以标签为依据', badBasis.map((r) => r.id).join(','));

const tagIds = new Set((LUNYU.topics || []).map((t) => t.id));
const tagAsEnd = (LUNYU.relations || []).filter((r) => tagIds.has(r.from) || tagIds.has(r.to));
ok(tagAsEnd.length === 0, '★ 标签 id 从未出现在关系边两端（标签不是思想单元）', tagAsEnd.map((r) => r.id).join(','));

// 同标签但无边：这是正常状态，不是缺陷。反过来要证明它确实存在，
// 否则"标签≠关系"就只是口号。
let sameTagNoEdge = 0;
const relPairs = new Set();
for (const r of LUNYU.relations || []) {
  relPairs.add([r.from, r.to].sort().join('|'));
}
for (const tp of LUNYU.topics || []) {
  const ns = tp.nodes || [];
  for (let i = 0; i < ns.length; i++) {
    for (let j = i + 1; j < ns.length; j++) {
      if (!relPairs.has([ns[i], ns[j]].sort().join('|'))) sameTagNoEdge++;
    }
  }
}
ok(sameTagNoEdge > 0, '★ 确实存在「同标签但无关系」的节点对（标签与关系是两个独立维度）', `${sameTagNoEdge} 对`);

// 反过来：存在「有关系但标签零交集」的节点对
let relNoSharedTag = 0;
for (const r of LUNYU.relations || []) {
  if (r.status === 'rejected') continue;
  const a = new Set((LUNYU.thoughts.find((t) => t.id === r.from) || {}).topics || []);
  const b = (LUNYU.thoughts.find((t) => t.id === r.to) || {}).topics || [];
  if (!b.some((x) => a.has(x))) relNoSharedTag++;
}
ok(relNoSharedTag > 0, '★ 确实存在「有关系但标签零交集」的节点对（没有共同标签不代表没有关系）', `${relNoSharedTag} 条`);

// 约束③：跨经典标签只声明意图，不带占位内容。
// 「人性」在源文件里有 future_classics，产品侧必须看不到它——
// 没有真实内容时不得显示虚假的推荐。
const srcFuture = topics.filter((t) => t.future_classics && t.future_classics.length);
ok(srcFuture.length > 0, '源文件里保留了跨经典意图声明（如「人性」→ 孟子/荀子）', srcFuture.map((t) => t.name).join('、'));

const leakFuture = (LUNYU.topics || []).filter((t) => 'future_classics' in t);
ok(leakFuture.length === 0, '★ 约束③落地：跨经典意图不进入产品数据（没有内容就没有推荐位）', leakFuture.map((t) => t.name).join('、'));

// 推荐结果必须全部来自本经典真实节点，且不含自己
const selfIn = [];
const ghost = [];
for (const t of LUNYU.thoughts) {
  for (const r of topicRecommend(t, 99)) {
    if (r.id === t.id) selfIn.push(t.id);
    if (!nodeSet.has(r.id)) ghost.push(`${t.id}→${r.id}`);
  }
}
ok(selfIn.length === 0, '主题推荐不把自己推荐给自己', selfIn.join(','));
ok(ghost.length === 0, '★ 主题推荐里没有不存在的节点（没有为了填满而编造）', ghost.join(','));

// 推荐只走"同标签"，不走关系：随机抽若干节点核对
const wrongSource = [];
for (const t of LUNYU.thoughts) {
  const mine = new Set(t.topics || []);
  for (const r of topicRecommend(t, 99)) {
    const peer = new Set(r.topics || []);
    if (![...peer].some((x) => mine.has(x))) wrongSource.push(`${t.id}→${r.id}`);
  }
}
ok(wrongSource.length === 0, '★ 主题推荐的每一条都确实与本节点共享标签（推荐有据，不是随机凑数）', wrongSource.slice(0, 3).join('；'));

// 孤立节点必须仍能拿到入口（有关系时走关系，无关系时三入口）
const orphan = LUNYU.thoughts.filter((t) => visibleRelations(t).length === 0);
const orphanNoEntry = orphan.filter((t) => topicRecommend(t, 6).length === 0);
ok(orphanNoEntry.length === 0, '孤立节点（无可见关系）仍能从主题拿到探索入口', orphanNoEntry.map((t) => t.id).join(','));
ok(orphan.length > 0, '确实存在无可见关系的节点（三入口回退有真实适用场景）', `${orphan.length} 个：${orphan.map((t) => t.id).join(',')}`);

// ---------- D. 审核留痕仍在 ----------

ok(fs.existsSync(ARCHIVE), '候选版 v0.2 已归档留痕（转正不等于抹掉审核过程）', ARCHIVE);
const arch = fs.existsSync(ARCHIVE) ? JSON.parse(fs.readFileSync(ARCHIVE, 'utf-8')) : {};
ok(arch.meta && arch.meta.version === '0.2', '归档的正是 v0.2', arch.meta && arch.meta.version);

ok((src.design_principles || []).length >= 2, '两条设计原则在案（标签≠关系 / 宁可入口为空）');
const p1 = (src.design_principles || []).find((p) => p.id === 'P1');
ok(p1 && /整个钦天监/.test(p1.scope || ''), '原则一明确覆盖整个钦天监知识体系，不止《论语》', p1 && p1.scope);
const p2 = (src.design_principles || []).find((p) => p.id === 'P2');
ok(p2 && /原典关系/.test(p2.statement || '') && /注疏关系/.test(p2.statement || '')
  && /编辑比较/.test(p2.statement || '') && /主题推荐/.test(p2.statement || ''),
  '原则二写明四类入口必须分开');
ok((src.data_discipline || []).length >= 4, '四条数据纪律在案');
ok((src.red_lines || []).some((r) => /未获批准/.test(r)), '红线里写明「未获批准的版本不得写入产品」');
ok((src.red_lines || []).some((r) => /跨经典/.test(r)), '红线里写明「跨经典只声明意图，不携带占位内容」');

console.log(`\n通过 ${pass} 项，失败 ${fail} 项`);
process.exit(fail ? 1 : 0);
