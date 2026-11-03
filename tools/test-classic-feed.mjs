// test-classic-feed.mjs — 「遇见」抽取机制与状态迁移自测（纯 Node）
//
// 这个文件只测两件机器能证明的事：
//   1. 抽取真的是第四种机制，且守住了「一轮不重复 / 走完就耗尽 / 不被用户状态影响」；
//   2. 旧版收藏能无损迁移成「留下」，标记互斥、可撤销，重开一轮不碰手记。
//
// 手势不在这里测——手势只有真实浏览器能证明，见 test-classic-feed-ui.mjs。
//
// 用法：node tools/test-classic-feed.mjs

import {
  feedOrder, drawFeed, feedCapacity, poolNodes, drawDaily, allNodes,
} from '../app/js/classic/classic-core.js';
import {
  loadMarks, saveMarks, markOf, setMark, keptIds, doubtedIds, markStats,
  loadFeed, saveFeed, advanceFeed, nextFeedRound, resetFeed,
  MARK_KEY, LEGACY_FAV_KEY, FEED_KEY, MARK_KEEP, MARK_DOUBT,
} from '../app/js/classic/feed-state.js';

let pass = 0;
const fails = [];
function ok(cond, name, extra = '') {
  if (cond) { pass++; return; }
  fails.push(`${name}${extra ? ' — ' + extra : ''}`);
}

/** 最小 localStorage 替身：只实现 getItem / setItem / removeItem */
function fakeStorage(init = {}) {
  const m = new Map(Object.entries(init));
  return {
    getItem: (k) => (m.has(k) ? m.get(k) : null),
    setItem: (k, v) => { m.set(k, String(v)); },
    removeItem: (k) => { m.delete(k); },
    dump: () => Object.fromEntries(m),
  };
}

const POOL = poolNodes();
const N = POOL.length;

// ---------------- 1. 抽取：基本性质 ----------------

ok(N > 0, '抽签池非空', `实际 ${N}`);
ok(feedCapacity() === N, 'feedCapacity 等于抽签池大小');

const order0 = feedOrder(0);
ok(order0.length === N, '一轮队列覆盖全池', `实际 ${order0.length} / ${N}`);

const ids0 = order0.map((t) => t.id);
ok(new Set(ids0).size === ids0.length, '一轮内无重复');

const allIds = new Set(allNodes().map((t) => t.id));
ok(ids0.every((id) => allIds.has(id)), '队列里每一条都来自内容包全集');
ok(ids0.every((id) => POOL.some((t) => t.id === id)), '队列里每一条都在抽签池内');

// ---------------- 2. 确定性 ----------------

const order0b = feedOrder(0);
ok(
  order0b.map((t) => t.id).join(',') === ids0.join(','),
  '同轮次两次调用结果完全一致（确定性）',
);

const order1 = feedOrder(1);
ok(
  order1.map((t) => t.id).join(',') !== ids0.join(','),
  '不同轮次顺序不同（不是固定顺序）',
);

// ---------------- 3. 跨群交错：这是它区别于前三种机制的地方 ----------------

const groupOf = (t) => ((t.clusters || [])[0] || null);
const groupCount = new Set(POOL.map(groupOf).filter(Boolean)).size;
ok(groupCount >= 2, '至少两个思想群（交错才有意义）', `实际 ${groupCount}`);

const head = order0.slice(0, Math.min(groupCount, order0.length));
const headGroups = head.map(groupOf);
ok(
  new Set(headGroups).size === headGroups.length,
  '队列头部连续若干条来自互不相同的群',
  `前 ${head.length} 条群：${headGroups.join(',')}`,
);

// 相邻同群只允许出现在尾部（某个群比别的群大很多时，最后只剩它在供货）
let sameAdjacent = 0;
for (let i = 0; i + 1 < order0.length; i++) {
  const a = groupOf(order0[i]);
  const b = groupOf(order0[i + 1]);
  if (a && b && a === b) sameAdjacent++;
}
const maxGroupSize = Math.max(...Object.values(
  POOL.reduce((acc, t) => {
    const g = groupOf(t) || '_';
    acc[g] = (acc[g] || 0) + 1;
    return acc;
  }, {}),
));
ok(
  sameAdjacent <= Math.max(0, maxGroupSize - 1),
  '相邻同群次数不超过最大群长度减一',
  `实际 ${sameAdjacent} 次，上限 ${Math.max(0, maxGroupSize - 1)}`,
);

// ---------------- 4. 耗尽：不伪造下一条 ----------------

ok(drawFeed(0, 0) !== null, '第 0 张存在');
ok(drawFeed(N - 1, 0) !== null, `第 ${N - 1} 张存在（最后一张）`);
ok(drawFeed(N, 0) === null, '越界返回 null —— 耗尽信号');
ok(drawFeed(N + 5, 0) === null, '远超边界仍返回 null，不回绕取模');

// ---------------- 5. 与今日抽取互不干扰 ----------------

const daily = drawDaily('2026-11-04');
ok(daily && daily.id, '今日抽取正常工作');
ok(
  order0.every((t) => t.id !== undefined),
  '遇见队列每条都有 id',
);
// 同一轮里今日那一条只出现一次，不因为「今日」而被特殊对待
ok(
  ids0.filter((id) => id === daily.id).length === 1,
  '今日那一条在本轮队列里恰好出现一次',
);

// ---------------- 6. 用户标记不得影响抽取 ----------------

const st1 = fakeStorage();
setMark(ids0[0], MARK_KEEP, st1);
setMark(ids0[1], MARK_DOUBT, st1);
const orderAfterMarks = feedOrder(0);
ok(
  orderAfterMarks.map((t) => t.id).join(',') === ids0.join(','),
  '用户标记后重新抽取，队列一字不变（抽取不读用户状态）',
);

// ---------------- 7. 标记：迁移 ----------------

const s0 = fakeStorage();
ok(Object.keys(loadMarks(s0)).length === 0, '空 storage 读出空标记');

// 旧版收藏：数组
const legacy = ['LY-A', 'LY-B', 'LY-C'];
const s1 = fakeStorage({ [LEGACY_FAV_KEY]: JSON.stringify(legacy) });
const m1 = loadMarks(s1);
ok(Object.keys(m1).length === 3, '旧版收藏 3 条全部迁移');
ok(legacy.every((id) => m1[id] === MARK_KEEP), '旧版收藏迁移为「留下」');
ok(s1.getItem(LEGACY_FAV_KEY) !== null, '旧键保留不删（回滚安全）');
ok(s1.getItem(MARK_KEY) !== null, '新版键已写入');

// 幂等：再读一次不重复迁移、不覆盖已有新数据
setMark('LY-A', MARK_DOUBT, s1);
const m1b = loadMarks(s1);
ok(m1b['LY-A'] === MARK_DOUBT, '迁移后改标记，再读仍以新版为准');
ok(m1b['LY-B'] === MARK_KEEP, '未被改动的迁移项保持「留下」');

// 新版键优先于旧键
const s2 = fakeStorage({
  [LEGACY_FAV_KEY]: JSON.stringify(['X']),
  [MARK_KEY]: JSON.stringify({ Y: MARK_DOUBT }),
});
const m2 = loadMarks(s2);
ok(!m2.X && m2.Y === MARK_DOUBT, '新版键存在时不再从旧键迁移');

// 坏数据不炸
const s3 = fakeStorage({ [LEGACY_FAV_KEY]: 'not json' });
ok(Object.keys(loadMarks(s3)).length === 0, '旧键是坏 JSON 时降级为空标记，不抛错');
const s4 = fakeStorage({ [MARK_KEY]: JSON.stringify([1, 2, 3]) });
ok(typeof loadMarks(s4) === 'object' && !Array.isArray(loadMarks(s4)), '新版键是数组时按无效处理');

// ---------------- 8. 标记：互斥、撤销、统计 ----------------

const s5 = fakeStorage();
setMark('N1', MARK_KEEP, s5);
ok(markOf('N1', s5) === MARK_KEEP, '设置「留下」');
setMark('N1', MARK_DOUBT, s5);
ok(markOf('N1', s5) === MARK_DOUBT, '同一 id 后设的标记覆盖先设的（互斥）');
setMark('N1', null, s5);
ok(markOf('N1', s5) === null, '传 null 撤销标记');

setMark('N2', MARK_KEEP, s5);
setMark('N3', MARK_KEEP, s5);
setMark('N4', MARK_DOUBT, s5);
ok(keptIds(s5).length === 2, 'keptIds 只返回留下');
ok(doubtedIds(s5).length === 1, 'doubtedIds 只返回存疑');
const stats = markStats(s5);
ok(stats.keep === 2 && stats.doubt === 1 && stats.total === 3, 'markStats 计数正确', JSON.stringify(stats));

// 空 id 不得写入
setMark('', MARK_KEEP, s5);
ok(markStats(s5).total === 3, '空 id 不产生标记');

// ---------------- 9. 遇见进度 ----------------

const s6 = fakeStorage();
const f0 = loadFeed(s6);
ok(f0.round === 0 && f0.seq === 0 && f0.seen.length === 0, '初始进度为第 0 轮第 0 张');

advanceFeed('LY-A', s6);
advanceFeed('LY-B', s6);
const f1 = loadFeed(s6);
ok(f1.seq === 2, 'advanceFeed 前进序号', `实际 ${f1.seq}`);
ok(f1.seen.join(',') === 'LY-A,LY-B', 'advanceFeed 记录已见 id', f1.seen.join(','));

// 重复记同一个 id 不产生重复项
advanceFeed('LY-A', s6);
const f2 = loadFeed(s6);
ok(f2.seen.length === 2, '同一 id 不重复进 seen', f2.seen.join(','));

// 重开一轮：轮次 +1、序号归零、seen 清空
const f3 = nextFeedRound(s6);
ok(f3.round === 1 && f3.seq === 0 && f3.seen.length === 0, 'nextFeedRound 重置本轮');

// 关键：重开一轮不能碰标记，也不能碰手记
setMark('LY-A', MARK_KEEP, s6);
s6.setItem('qintian.classic.journal', JSON.stringify({ 'LY-A': [{ text: '我的话', at: 1 }] }));
nextFeedRound(s6);
resetFeed(s6);
ok(markOf('LY-A', s6) === MARK_KEEP, '重开一轮后标记仍在');
ok(
  JSON.parse(s6.getItem('qintian.classic.journal'))['LY-A'][0].text === '我的话',
  '重开一轮后手记仍在（不偷偷清除）',
);

// 坏进度数据不炸
const s7 = fakeStorage({ [FEED_KEY]: '{bad json' });
const f4 = loadFeed(s7);
ok(f4.round === 0 && f4.seq === 0, '进度数据损坏时降级为初始值');

// 负数与字符串归一
saveFeed({ round: -3, seq: 'abc', seen: 'oops' }, s7);
const f5 = loadFeed(s7);
ok(f5.round === 0 && f5.seq === 0 && Array.isArray(f5.seen), '非法进度值被归一', JSON.stringify(f5));

// ---------------- 汇总 ----------------

if (fails.length) {
  console.error('\n[test-classic-feed] 失败项：');
  for (const f of fails) console.error('  ✗ ' + f);
  console.error(`\n通过 ${pass} 项，失败 ${fails.length} 项`);
  process.exit(1);
}
console.log(`遇见板块自测全部通过（${pass} 项）`);
