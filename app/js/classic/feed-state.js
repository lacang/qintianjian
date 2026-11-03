// feed-state.js — 「遇见」与用户标记的状态层
//
// 为什么单独一层：抽取是纯函数（classic-core），渲染和手势依赖 DOM（feed），
// 夹在中间的「什么存下来、怎么迁移旧数据」既不该混进纯函数，也不该混进视图。
// 这一层不碰 DOM、不碰 window，storage 由调用方注入（默认 localStorage），
// 因此 Node 里可以传一个假 storage 直接测迁移逻辑。
//
// 三条数据边界：
//   · 全部只存本机，不上传，不参与任何抽取或推荐；
//   · 旧版「收藏」（qintian.classic.fav 里的数组）自动迁移为「留下」，原键保留不删；
//   · 手记（qintian.classic.journal）不归这一层管，任何重置都不会碰它。

export const MARK_KEY = 'qintian.classic.mark.v2';
export const LEGACY_FAV_KEY = 'qintian.classic.fav';
export const FEED_KEY = 'qintian.classic.feed.v1';

/** 两种标记，语义不同，不能合并 */
export const MARK_KEEP = 'keep';   // 留下：我认为值得保留
export const MARK_DOUBT = 'doubt'; // 存疑：我暂时不认同、没读懂，或想继续研究

function S(storage) {
  return storage || (typeof localStorage !== 'undefined' ? localStorage : null);
}

function readJSON(storage, key, fallback) {
  const s = S(storage);
  if (!s) return fallback;
  try {
    const raw = s.getItem(key);
    if (raw == null) return fallback;
    const v = JSON.parse(raw);
    return v == null ? fallback : v;
  } catch {
    return fallback;
  }
}

function writeJSON(storage, key, value) {
  const s = S(storage);
  if (!s) return false;
  try {
    s.setItem(key, JSON.stringify(value));
    return true;
  } catch {
    return false;
  }
}

// ---------------- 标记（留下 / 存疑） ----------------

/**
 * 读取全部标记：{ [nodeId]: 'keep' | 'doubt' }
 *
 * 迁移规则（只做一次，幂等）：
 *   新版键存在 → 直接用。
 *   新版键不存在、旧版收藏键存在 → 把旧数组里每个 id 映射为 'keep' 写入新版键。
 *   两个都不存在 → 空对象。
 *
 * 旧键刻意不删：万一要回滚到 v127，旧代码还能读到原来的收藏。
 * 代价是同一份数据存两处，但「回滚后收藏全没了」比「多占几百字节」严重得多。
 */
export function loadMarks(storage) {
  const s = S(storage);
  if (!s) return {};
  const cur = readJSON(s, MARK_KEY, null);
  if (cur && typeof cur === 'object' && !Array.isArray(cur)) return cur;

  const legacy = readJSON(s, LEGACY_FAV_KEY, null);
  const out = {};
  if (Array.isArray(legacy)) {
    for (const id of legacy) {
      if (typeof id === 'string' && id) out[id] = MARK_KEEP;
    }
    writeJSON(s, MARK_KEY, out);
  }
  return out;
}

export function saveMarks(marks, storage) {
  return writeJSON(storage, MARK_KEY, marks || {});
}

/** 单条标记；没有标记返回 null */
export function markOf(id, storage) {
  if (!id) return null;
  const m = loadMarks(storage);
  return m[id] || null;
}

/**
 * 设置标记。kind 传 null 表示撤销。
 * 同一个 id 只能有一种标记：留下和存疑互斥，后设的覆盖先设的。
 */
export function setMark(id, kind, storage) {
  if (!id) return {};
  const m = loadMarks(storage);
  if (kind === MARK_KEEP || kind === MARK_DOUBT) m[id] = kind;
  else delete m[id];
  saveMarks(m, storage);
  return m;
}

/** 已在「留下」里的 id 列表（旧版 loadFav 的等价物） */
export function keptIds(storage) {
  const m = loadMarks(storage);
  return Object.keys(m).filter((k) => m[k] === MARK_KEEP);
}

export function doubtedIds(storage) {
  const m = loadMarks(storage);
  return Object.keys(m).filter((k) => m[k] === MARK_DOUBT);
}

export function markStats(storage) {
  const m = loadMarks(storage);
  let keep = 0;
  let doubt = 0;
  for (const k of Object.keys(m)) {
    if (m[k] === MARK_KEEP) keep++;
    else if (m[k] === MARK_DOUBT) doubt++;
  }
  return { keep, doubt, total: keep + doubt };
}

// ---------------- 遇见进度 ----------------

/**
 * 遇见进度：{ round, seq, seen[] }
 *   round —— 第几轮（0 起）。一轮滑完，用户主动重开才 +1。
 *   seq   —— 本轮已滑到第几张（下一张的序号）。
 *   seen  —— 本轮已遇见过的 id，按顺序。用于「你已经遇见 N 条」和防重。
 *
 * 为什么要显式存 seen 而不是用 seq 推：内容包升级后池子会变，
 * 用旧 seq 去新队列里定位会错位，用户会突然又看到已经看过的条目。
 */
export function loadFeed(storage) {
  const v = readJSON(storage, FEED_KEY, null);
  if (!v || typeof v !== 'object' || Array.isArray(v)) return { round: 0, seq: 0, seen: [] };
  return {
    round: Math.max(0, Math.floor(Number(v.round) || 0)),
    seq: Math.max(0, Math.floor(Number(v.seq) || 0)),
    seen: Array.isArray(v.seen) ? v.seen.filter((x) => typeof x === 'string') : [],
  };
}

export function saveFeed(state, storage) {
  return writeJSON(storage, FEED_KEY, {
    round: Math.max(0, Math.floor(Number(state.round) || 0)),
    seq: Math.max(0, Math.floor(Number(state.seq) || 0)),
    seen: Array.isArray(state.seen) ? state.seen : [],
  });
}

/** 记一张已见，seq 前进一格 */
export function advanceFeed(id, storage) {
  const st = loadFeed(storage);
  if (id && !st.seen.includes(id)) st.seen.push(id);
  st.seq += 1;
  saveFeed(st, storage);
  return st;
}

/** 重开一轮：轮次 +1、序号归零、已见清空。手记与标记一概不动。 */
export function nextFeedRound(storage) {
  const st = loadFeed(storage);
  const next = { round: st.round + 1, seq: 0, seen: [] };
  saveFeed(next, storage);
  return next;
}

/** 从第一轮重新开始（调试与「清空遇见记录」用）。同样不碰手记与标记。 */
export function resetFeed(storage) {
  const next = { round: 0, seq: 0, seen: [] };
  saveFeed(next, storage);
  return next;
}
