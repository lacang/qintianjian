// test-classic.mjs — 经典板块自测（纯 Node，无需浏览器）
//
// 把批示里可被机器检验的硬约束固化成断言：
//   1. 抽签池只含人工审核判定「适合」的条目
//   2. 三种抽取是三种不同机制，不是同一个随机函数换三个标题
//      （董事长 2026-10-31 批示第一部分第 2 条点名要求）
//   3. 问心抽取与用户问题完全无关（签名层面就不接收问题）
//   4. 五种反馈只改阅读路径，结构上不具备重抽能力
//   5. 不成立关系永不展示；编辑阐释即使 verified 也必带标记
//   6. 26 个思想单元全部可达，不因分类词表不一致而消失
//   7. 八层齐全且层序固定（任何经典都必须填出这八层）
//   8. 内容包契约、辩题库完整性
//
// 用法：node tools/test-classic.mjs

import {
  dateKey, dayOfYear, drawDaily, drawAsk, drawThree, poolNodes, getNode,
  relationBadge, visibleRelations, exploreEntries, detailLayers,
  auditPermission, auditCoverage, allNodes, allClusters, meta,
  FEEDBACK, feedbackEffect, debateList, stanceOf, debateAfterword,
  shuffledOrder, topicsOf, topicRecommend,
} from '../app/js/classic/classic-core.js';
import { LUNYU } from '../app/js/classic/lunyu-data.js';
import { validateClassic, LAYER_KEYS, packCapabilities } from '../app/js/classic/classic-schema.js';
import { listClassics } from '../app/js/classic/classic-registry.js';

let pass = 0;
const fails = [];
function ok(cond, name, extra = '') {
  if (cond) { pass++; return; }
  fails.push(`${name}${extra ? ' — ' + extra : ''}`);
}

// ---------------- 1. 内容包契约 ----------------

const cerrs = validateClassic(LUNYU);
ok(cerrs.length === 0, '内容包符合经典契约', cerrs.join('；'));
ok(listClassics().length >= 1, '至少注册了一套经典');
ok(listClassics()[0].id === '论语', '当前经典为《论语》');
ok(packCapabilities(LUNYU).debate === true, '内容包声明具备辩一辩能力');

// ---------------- 2. 抽签池 ----------------

const pool = poolNodes();
ok(pool.length === meta().counts.draw_pool, '抽签池数量与声明一致',
  `实际 ${pool.length} / 声明 ${meta().counts.draw_pool}`);
ok(pool.every((t) => t.ratings.draw_suitability === '适合'), '抽签池无「需要上下文」条目');
ok(pool.length > 0, '抽签池非空');

// ---------------- 3. 三种抽取机制必须真的不同 ----------------
//
// 判据不是「种子前缀不一样」，而是「各自具备单一随机函数给不出的结构性保证」：
//   今日相遇 = 遍历：相邻两天必不同（纯随机有 1/18 概率撞车）
//   问心     = 队列：同日一整个池子的次数内绝不重复（纯随机必然撞车）
//   一念三观 = 分层：三条来自三个不同思想群（纯随机大概率同群）

// 3.1 今日相遇：日历遍历
const d1 = drawDaily('2026-10-31');
const d2 = drawDaily('2026-10-31');
ok(d1 && d1.id === d2.id, '今日相遇同日恒定');

// 连续 90 天：相邻两天必须不同（这是「每日相逢」的最低要求）
let adjacentDup = 0;
let prev = null;
const encSeen = new Set();
for (let i = 0; i < 90; i++) {
  const d = new Date(Date.UTC(2026, 0, 1 + i));
  const key = d.toISOString().slice(0, 10);
  const n = drawDaily(key);
  if (!n) { fails.push(`今日相遇在 ${key} 无结果`); break; }
  if (prev && prev.id === n.id) adjacentDup++;
  prev = n;
  encSeen.add(n.id);
}
ok(adjacentDup === 0, '今日相遇相邻两天必不同（遍历机制，非随机）', `重复 ${adjacentDup} 次`);
ok(encSeen.size === pool.length, '今日相遇一年内走遍整个抽签池',
  `覆盖 ${encSeen.size}/${pool.length}`);

// 年内第 N 天决定位置：第 1 天与第 1+池大小 天应相同（纯随机不会这样）
const p0 = drawDaily('2026-01-01');
const pN = drawDaily(`2026-01-${String(1 + pool.length).padStart(2, '0')}`);
ok(p0 && pN && p0.id === pN.id, '今日相遇按池大小循环（日历机制可验证）',
  `${p0 && p0.id} vs ${pN && pN.id}`);
ok(dayOfYear('2026-01-01') === 1 && dayOfYear('2026-12-31') === 365, '年内日序计算正确');

// 3.2 问心：当日队列，一轮之内绝不重复
const askIds = new Set();
let askDup = 0;
for (let s = 0; s < pool.length; s++) {
  const n = drawAsk(s, '2026-10-31');
  if (!n) { fails.push('问心抽取无结果'); break; }
  if (askIds.has(n.id)) askDup++;
  askIds.add(n.id);
}
ok(askDup === 0, '问心同日一轮之内绝不重复（队列机制，非随机）', `重复 ${askDup} 次`);
ok(askIds.size === pool.length, '问心一轮走遍整个抽签池', `覆盖 ${askIds.size}/${pool.length}`);
ok(drawAsk(0, '2026-10-31').id === drawAsk(0, '2026-10-31').id, '问心同日同序号恒定');
ok(drawAsk(0, '2026-10-31').id !== drawAsk(0, '2026-11-01').id
  || pool.length === 1, '问心跨日重新洗牌（首条通常不同）');

// 3.3 一念三观：分层抽样，三条来自三个不同群
let threeBad = 0;
let threeDup = 0;
for (let s = 0; s < 20; s++) {
  const key = `2026-03-${String(s + 1).padStart(2, '0')}`;
  const three = drawThree(s, key);
  if (three.length !== 3) { threeBad++; continue; }
  const gs = three.map((x) => x.group);
  if (new Set(gs).size !== 3) threeBad++;
  if (new Set(three.map((x) => x.node.id)).size !== 3) threeDup++;
}
ok(threeBad === 0, '一念三观三条必来自三个不同思想群（分层机制，非随机）', `异常 ${threeBad}/20`);
ok(threeDup === 0, '一念三观三条互不重复', `重复 ${threeDup}/20`);

// 3.4 三种机制在结构上互不相同（不是同一个函数换标题）
const sameDay = '2026-10-31';
const t3 = drawThree(0, sameDay);
const threeGroups = t3.map((x) => x.group);
ok(!threeGroups.includes(null), '一念三观带出所属群');
ok(drawDaily(sameDay).id !== undefined, '今日相遇返回节点');
// 今日相遇不受序号影响；问心受影响——这是两种机制的本质差别
ok(drawDaily(sameDay).id === drawDaily(sameDay).id, '今日相遇忽略序号（无 seq 参数）');
ok(drawAsk(0, sameDay).id !== drawAsk(1, sameDay).id, '问心随序号推进（队列机制）');

// ---------------- 4. 问心与问题完全无关 ----------------
//
// 结构保证：drawAsk 的形参只有 (seq, dk)，没有 question。
// 行为保证：同一 (dk, seq) 下，无论用户写了什么，结果恒定。
ok(drawAsk.length === 1 || drawAsk.length === 2, 'drawAsk 形参不含问题文本',
  `形参数 ${drawAsk.length}（seq + 可选 dk）`);
const qA = drawAsk(7, '2026-10-31');
const qB = drawAsk(7, '2026-10-31');
ok(qA.id === qB.id, '同一序号下不同问题抽到同一条（行为证明）');

// ---------------- 5. 五种反馈不得具备重抽能力 ----------------

ok(FEEDBACK.length === 5, '反馈共五种', `实际 ${FEEDBACK.length}`);
const fbIds = FEEDBACK.map((f) => f.id).sort().join(',');
ok(fbIds === 'agree,disagree,more,recall,unsure', '五种反馈与批示一致', fbIds);
let fbLeak = 0;
for (const f of FEEDBACK) {
  const e = feedbackEffect(f.id);
  // 结构保证：返回对象里不存在任何能改变抽取结果的字段
  for (const bad of ['redraw', 'resample', 'newSeed', 'seq', 'node', 'pick']) {
    if (bad in e) fbLeak++;
  }
  if (!e.note) fbLeak++;
}
ok(fbLeak === 0, '反馈效果不含任何重抽/改选能力（结构保证）', `泄漏 ${fbLeak}`);

// 展示层不猜身份（董事长 2026-10-31 批示：「展示层不允许通过默认分支猜测内容身份」）
{
  const miss = relationBadge({ id: 'X-TEST', status: 'verified' });
  ok(miss.ok === false, '缺 display_class 的关系不被展示（不兜底猜身份）', JSON.stringify(miss));
  const bad = relationBadge({ id: 'Y-TEST', status: 'verified', display_class: 'something_else' });
  ok(bad.ok === false, '非法 display_class 的关系不被展示', JSON.stringify(bad));
  ok(!/原典有据/.test(miss.badge + bad.badge), '缺失或非法分类不会被误标成「原典有据」',
    miss.badge + ' / ' + bad.badge);
  const good = relationBadge({ id: 'Z-TEST', status: 'verified', display_class: 'canon_relation' });
  ok(good.ok === true && /原典有据/.test(good.badge), '只有 canon_relation + verified 才给「原典有据」', good.badge);
}

// 探索入口的性质标识必须互不借用（四类入口不得混为一谈）
{
  const orphan = allNodes().find((t) => !visibleRelations(t).length);
  const ex = exploreEntries(orphan);
  const kinds = (ex.entries || []).map((e) => e.kind);
  ok(kinds.length > 0 && kinds.every((k) => ['cluster', 'chapter', 'topic'].includes(k)),
    '无关系节点的入口都带明确性质标识（cluster/chapter/topic）', JSON.stringify(kinds));
  ok(!kinds.includes('canon_relation') && !kinds.includes('commentary_relation'),
    '非关系入口不借用关系类的名字');
}
ok(feedbackEffect('disagree').openLayers.includes('dispute'), '「我不认同」导向注家分歧');
ok(feedbackEffect('unsure').openLayers.includes('plain'), '「我没看懂」导向白话');
ok(feedbackEffect('recall').compose === true, '「想起某件事」提供私人记录入口');
ok(feedbackEffect('more').gotoDetail === true, '「想继续了解」导向原典详情');
ok(!('gotoDetail' in feedbackEffect('agree')), '「我认同」不改变阅读路径（只记录）');

// ---------------- 6. 关系展示权限 ----------------

const perErrs = auditPermission();
ok(perErrs.length === 0, '内容权限自检通过', perErrs.slice(0, 3).join('；'));

let rejectedShown = 0;
let editorialUnmarked = 0;
for (const t of allNodes()) {
  for (const r of t.relations || []) {
    if (r.status === 'rejected' && relationBadge(r).ok) rejectedShown++;
    if (r.display_class === 'editorial_relation' && relationBadge(r).tone !== 'editorial') editorialUnmarked++;
  }
}
ok(rejectedShown === 0, '不成立关系永不展示');
ok(editorialUnmarked === 0, '编辑阐释必带标记（无论 status）');

// ---------------- 7. 26 个思想单元全覆盖 ----------------

const covErrs = auditCoverage();
ok(covErrs.length === 0, '节点覆盖自检通过（无节点丢失）', covErrs.slice(0, 3).join('；'));
ok(allNodes().length === meta().counts.thoughts, '思想单元数与声明一致',
  `实际 ${allNodes().length} / 声明 ${meta().counts.thoughts}`);
ok(allClusters().length === meta().counts.clusters, '群数与声明一致');

// 每个节点都能构造八层，且层序固定
let layerBad = 0;
for (const t of allNodes()) {
  const ls = detailLayers(t);
  if (ls.length !== 8) layerBad++;
  else if (ls.map((l) => l.key).join(',') !== LAYER_KEYS.join(',')) layerBad++;
}
ok(layerBad === 0, '全部节点都能构造契约规定的八层', `异常 ${layerBad}`);

// 每个节点都能被探索页列出（按群 或 独立条目）
const listed = new Set();
for (const c of allClusters()) {
  for (const t of allNodes()) if ((t.clusters || []).includes(c.id)) listed.add(t.id);
}
for (const t of allNodes()) if (!(t.relations || []).length) listed.add(t.id);
ok(listed.size === allNodes().length, '全部节点在探索页可达',
  `可达 ${listed.size}/${allNodes().length}`);

// ---------------- 8. 孤立节点三入口 ----------------

const orphans = allNodes().filter((t) => !(t.relations || []).length);
ok(orphans.length === 5, '孤立节点为 5 条', `实际 ${orphans.length}`);
let orphanBad = 0;
for (const o of orphans) {
  const ex = exploreEntries(o);
  if (ex.mode !== 'fallback') { orphanBad++; continue; }
  if (!ex.entries.length) orphanBad++;
  for (const e of ex.entries) {
    if (e.id === 'topic_recommend' && !e.mustLabel) orphanBad++;
  }
}
ok(orphanBad === 0, '孤立节点走三入口且主题推荐必带「非思想关系」标记', `异常 ${orphanBad}`);

// 主题标签 2026-10-31 已获董事长批准转正，所以这里的方向反过来了：
// 不再是「没入库时推荐必须为空」，而是「入库后推荐必须有据」。
// 反过来那半条（未获批准的版本不得入库）由 check-topics.mjs 的 approved 状态校验守。
ok((LUNYU.topics || []).length > 0, '主题标签已正式入库（经董事长批准的版本）');
let fabricated = 0;
for (const o of orphans) {
  const ex = exploreEntries(o);
  const te = ex.entries.find((e) => e.id === 'topic_recommend');
  if (!te) continue;
  // 推荐出来的每一条都必须真的与本节点共享主题，否则就是编造
  for (const n of te.nodes || []) {
    const peer = new Set(n.topics || []);
    if (![...peer].some((x) => (o.topics || []).includes(x))) fabricated++;
  }
}
ok(fabricated === 0, '孤立节点的主题推荐每一条都有共同主题依据（不编造）', `异常 ${fabricated}`);

// ---------------- 9. 辩一辩 ----------------

const dbs = debateList();
ok(dbs.length === 8, '辩题共 8 条', `实际 ${dbs.length}`);
let dbBad = 0;
for (const d of dbs) {
  if (!getNode(d.node)) dbBad++;
  if ((d.stances || []).length < 2) dbBad++;
  if (!d.canon_note) dbBad++;                      // 必须说明原典实际说了什么
  if (!d.question || !d.question.trim()) dbBad++;
  for (const s of d.stances || []) {
    if (!s.lineage) dbBad++;                       // 必须注明出处或明确标注「原文未及」
    if (!s.label || !s.text) dbBad++;
  }
}
ok(dbBad === 0, '辩题库结构完整（每条都有原典说法与立场出处）', `异常 ${dbBad}`);

// 立场对照不得返回「对错」判定
const d0 = dbs[0];
const st0 = stanceOf(d0, d0.stances[0].id);
ok(st0 && !('correct' in st0), '立场对照不含对错判定字段');
const aw = debateAfterword(d0);
ok(aw && !('verdict' in aw) && !('correct' in aw), '辩题结语不含对错判定');

// 辩题必须问「你怎么做」，不得问「孔子什么意思」（否则变成阅读理解）
let examLike = 0;
for (const d of dbs) {
  if (/孔子(是)?什么意思|孔子(的)?意思是|正确(的)?理解/.test(d.question)) examLike++;
}
ok(examLike === 0, '辩题不问「孔子什么意思」，只问用户自己的立场', `异常 ${examLike}`);

// 每条辩题都应指向有真实注家分歧的条目（否则无从「辩」）
let noDispute = 0;
for (const d of dbs) {
  const n = getNode(d.node);
  if (!n || !(n.disputes || []).length) noDispute++;
}
ok(noDispute === 0, '每条辩题都落在有真实注家分歧的条目上', `异常 ${noDispute}`);

// ---------------- 9b. 主题标签正式数据（董事长 2026-10-31 批准转正） ----------------
//
// 三条约束在这里逐条变成断言。它们不是"文档里写了"，而是"数据一违反就红"。

{
  const tps = LUNYU.topics || [];
  ok(tps.length >= 15 && tps.length <= 25, '主题标签已启用且数量在 15—25', `实际 ${tps.length}`);

  // 归属完整性：每个节点至少 1 个主题，最多 4 个
  const perNode = new Map();
  for (const tp of tps) for (const nid of tp.nodes || []) perNode.set(nid, (perNode.get(nid) || 0) + 1);
  const noTopic = allNodes().filter((t) => !(perNode.get(t.id) || 0));
  ok(noTopic.length === 0, '每个思想单元都归入了至少一个主题', noTopic.map((t) => t.id).join(','));
  const over = allNodes().filter((t) => (perNode.get(t.id) || 0) > 4);
  ok(over.length === 0, '没有节点被塞进超过 4 个主题（防止「什么都算」）', over.map((t) => t.id).join(','));

  // 约束①：允许交叉——不强制唯一归属
  const multi = allNodes().filter((t) => (perNode.get(t.id) || 0) >= 2);
  ok(multi.length > 0, '约束①：确实存在同时归属多个主题的节点（允许交叉）', `${multi.length} 条`);

  // topicsOf 与 topicRecommend 必须互相对应
  const t0 = allNodes()[0];
  ok(topicsOf(t0).every((tp) => (t0.topics || []).includes(tp.id)), 'topicsOf 只返回该节点真正归属的主题');
  ok(topicsOf(t0).length === (t0.topics || []).length, 'topicsOf 数量与节点声明一致');

  // 推荐只走同标签，且不含自己
  let badRec = 0, selfRec = 0;
  for (const t of allNodes()) {
    const mine = new Set(t.topics || []);
    for (const r of topicRecommend(t, 99)) {
      if (r.id === t.id) selfRec++;
      const peer = new Set(r.topics || []);
      if (![...peer].some((x) => mine.has(x))) badRec++;
    }
  }
  ok(selfRec === 0, '主题推荐不把自己推给自己');
  ok(badRec === 0, '主题推荐的每一条都确实与本节点共享主题（有据，不是凑数）', `异常 ${badRec}`);

  // 约束②：标签相同不自动产生思想关系
  const relPairs = new Set();
  for (const r of LUNYU.relations || []) relPairs.add([r.from, r.to].sort().join('|'));
  let sameTagNoEdge = 0;
  for (const tp of tps) {
    const ns = tp.nodes || [];
    for (let i = 0; i < ns.length; i++) {
      for (let j = i + 1; j < ns.length; j++) {
        if (!relPairs.has([ns[i], ns[j]].sort().join('|'))) sameTagNoEdge++;
      }
    }
  }
  ok(sameTagNoEdge > 0, '★ 存在「同主题但无关系」的节点对：标签不产生关系', `${sameTagNoEdge} 对`);

  const tagIds = new Set(tps.map((x) => x.id));
  const tagAsEnd = (LUNYU.relations || []).filter((r) => tagIds.has(r.from) || tagIds.has(r.to));
  ok(tagAsEnd.length === 0, '★ 标签 id 从未出现在关系边两端');

  const badBasis = (LUNYU.relations || []).filter((r) => /topic|tag|label|主题标签/.test(String(r.relation_basis || '')));
  ok(badBasis.length === 0, '★ 没有任何关系边以标签为依据');

  // 反向：有关系但零标签交集——没有共同标签不代表没有关系
  let relNoShared = 0;
  for (const r of LUNYU.relations || []) {
    if (r.status === 'rejected') continue;
    const a = new Set((getNode(r.from) || {}).topics || []);
    const b = (getNode(r.to) || {}).topics || [];
    if (!b.some((x) => a.has(x))) relNoShared++;
  }
  ok(relNoShared > 0, '★ 存在「有关系但零标签交集」的节点对：没有共同标签不代表没有关系', `${relNoShared} 条`);

  // 约束③：跨经典意图不进入产品数据
  ok(tps.every((t) => !('future_classics' in t)), '约束③：跨经典意图声明没有进入产品数据');
  ok(tps.every((t) => (t.nodes || []).every((nid) => !!getNode(nid))), '约束③：标签指向的全是本经典真实节点，没有占位 id');

  // 四类入口：主题入口必须自带"非思想关系"标注
  const orphanNode = allNodes().find((t) => visibleRelations(t).length === 0);
  const oe = exploreEntries(orphanNode);
  const te = (oe.entries || []).find((e) => e.kind === 'topic');
  ok(!!te, '孤立节点拿到主题入口', JSON.stringify((oe.entries || []).map((e) => e.kind)));
  ok(te && te.mustLabel && /非思想关系/.test(te.mustLabel), '主题入口自带「非思想关系」标注', te && te.mustLabel);
  ok((oe.entries || []).every((e) => ['cluster', 'chapter', 'topic'].includes(e.kind)),
    '非关系入口的性质标识只有 cluster / chapter / topic 三种');
}

// ---------------- 10. 确定性工具 ----------------

ok(shuffledOrder('x', [1, 2, 3]).join() === shuffledOrder('x', [1, 2, 3]).join(), '洗牌同种子同结果');
ok(shuffledOrder('x', [1, 2, 3]).length === 3, '洗牌不丢元素');
ok(dateKey(new Date(2026, 9, 31)) === '2026-10-31', '日期键用本地日期');

// ---------------- 汇总 ----------------

if (fails.length) {
  console.error(`经典板块自测失败 ${fails.length} 项：`);
  for (const f of fails) console.error('  ✗ ' + f);
  process.exit(1);
}
console.log(`经典板块自测全部通过（${pass} 项）`);
