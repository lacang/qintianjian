// 案例库：全盘面统一留档（自动保存 + 星标留存 + 超额顶掉），纯 localStorage。
// 设计：案例只存「复现码 + 元信息快照」，复现统一走 sharecode 解码，不存整盘对象。
//   - 每一卦 / 每一盘排出来即自动入库；
//   - 星标（★）的永不被顶掉、也不被「清未星标」清掉；
//   - 未星标的只保留最近 AUTO_KEEP 条，更早的自动顶掉。

const KEY = 'qintian.cases.v2';
export const AUTO_KEEP = 30;

export const KINDS = [
  { id: 'liuyao', label: '六爻', mark: '爻' },
  { id: 'meihua', label: '梅花', mark: '梅' },
  { id: 'qimen', label: '奇门', mark: '奇' },
  { id: 'bazi', label: '八字', mark: '命' },
  { id: 'astro', label: '星盘', mark: '星' },
  { id: 'ziwei', label: '紫微', mark: '紫' },
  { id: 'cards', label: '卡牌', mark: '占' },
  { id: 'sky', label: '天象', mark: '天' },
  // v121：这 7 类补齐复现码后也会自动留档，缺 label 会让码标题回退成「盘」（KIND_LABEL[kind] || '盘'）
  { id: 'daliuren', label: '大六壬', mark: '壬' },
  { id: 'xiaoliuren', label: '小六壬', mark: '小' },
  { id: 'geomancy', label: '地占', mark: '地' },
  { id: 'tibetan', label: '藏占', mark: '藏' },
  { id: 'vedic', label: '吠陀', mark: '吠' },
  { id: 'yangzhai', label: '阳宅', mark: '宅' },
  { id: 'zhuyou', label: '符箓', mark: '符' },
];
export const KIND_LABEL = Object.fromEntries(KINDS.map((k) => [k.id, k.label]));
export const KIND_MARK = Object.fromEntries(KINDS.map((k) => [k.id, k.mark]));

function read() {
  try {
    const raw = JSON.parse(localStorage.getItem(KEY) || '[]');
    return Array.isArray(raw) ? raw : [];
  } catch { return []; }
}

/** 全部案例，按时间倒序（新在前） */
// 同一毫秒内连续存档时保证时间戳严格递增，避免顶掉顺序不确定
let lastStamp = 0;
function nextStamp() {
  const t = Date.now();
  lastStamp = t > lastStamp ? t : lastStamp + 1;
  return lastStamp;
}

export function loadCases() {
  return read().sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
}

export function loadCase(id) {
  return read().find((c) => c.id === id) || null;
}

/** 星标全留；未星标只保留最近 keep 条 */
function trim(list, keep = AUTO_KEEP) {
  const pinned = list.filter((c) => c.pinned);
  const rest = list.filter((c) => !c.pinned).sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
  const kept = [...pinned, ...rest.slice(0, keep)];
  return { list: kept, dropped: list.length - kept.length };
}

function persist(list) {
  return persistInfo(list).list;
}

/**
 * 落库并回报「因为超额被顶掉几条」。
 * 以前是静默 trim，用户永远不知道旧案例没了（r6_compat.md P1-2）；
 * 现在调用方拿到 dropped 就能提示「案例已满，已删除最旧 N 条」。
 */
function persistInfo(list) {
  let { list: out, dropped } = trim(list);
  for (let i = 0; i < 8; i++) {
    try {
      localStorage.setItem(KEY, JSON.stringify(out));
      return { list: out, dropped };
    } catch {
      // 配额溢出：先砍未星标的一半再试
      const pinned = out.filter((c) => c.pinned);
      const rest = out.filter((c) => !c.pinned);
      if (!rest.length) break;
      const keep = Math.max(1, Math.floor(rest.length / 2));
      dropped += rest.length - keep;
      out = [...pinned, ...rest.slice(0, keep)];
    }
  }
  return { list: out, dropped };
}

function newId() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
}

/**
 * 保存一个案例（自动调用）
 * @param {{kind:string, code:string, title:string, sub?:string, question?:string, castAt?:number, dedupe?:boolean}} item
 * @returns {object} 落库后的案例；超额顶掉时带 `evicted`（被删条数，0 表示没有）
 */
export function saveCase({ kind, code, title, sub = '', question = '', castAt = 0, dedupe = true }) {
  const list = read();
  // 同一盘（码相同）短时间内重复排盘不重复入库，改为刷新时间
  if (dedupe && code) {
    const hit = list.find((c) => c.code === code);
    if (hit) {
      hit.createdAt = nextStamp();
      hit.title = title || hit.title;
      hit.sub = sub || hit.sub;
      if (question) hit.question = question;
      const { dropped } = persistInfo(list);
      return { ...hit, evicted: dropped };
    }
  }
  const item = {
    id: newId(),
    kind,
    code,
    title: title || KIND_LABEL[kind] || '案例',
    sub,
    question,
    castAt: castAt || Date.now(),
    pinned: false,
    createdAt: nextStamp(),
  };
  list.push(item);
  const { dropped } = persistInfo(list);
  return { ...item, evicted: dropped };
}

export function updateCase(id, patch) {
  const list = read();
  const hit = list.find((c) => c.id === id);
  if (!hit) return null;
  Object.assign(hit, patch);
  persist(list);
  return hit;
}

/** 星标 / 取消星标，返回最新状态 */
export function togglePin(id) {
  const list = read();
  const hit = list.find((c) => c.id === id);
  if (!hit) return null;
  hit.pinned = !hit.pinned;
  persist(list);
  return hit;
}

export function removeCase(id) {
  persist(read().filter((c) => c.id !== id));
}

/** 清空所有未星标案例，返回清掉的条数 */
export function clearUnpinned() {
  const list = read();
  const keep = list.filter((c) => c.pinned);
  const n = list.length - keep.length;
  persist(keep);
  return n;
}

export function caseStats() {
  const list = read();
  const pinned = list.filter((c) => c.pinned).length;
  return { total: list.length, pinned, auto: list.length - pinned, keep: AUTO_KEEP };
}

/* ============================================================
   导出 / 导入（r6_compat.md P1-2）
   ------------------------------------------------------------
   案例只存在 localStorage：清缓存、换浏览器、换手机就全没了，而且超额是静默淘汰。
   导出 = 一份带版本号的 JSON（含生成时间、条数、每条案例的完整字段）；
   导入 = 去重合并（同码或同 id 视为同一条，**以导入的新数据为准**），
          并回报覆盖 / 新增 / 跳过 / 顶掉的条数，让调用方如实提示。
   ============================================================ */

export const EXPORT_SCHEMA = 'qintianjian.cases';
export const EXPORT_VERSION = 2;

/** 打包成可下载的对象（不含 DOM，纯数据） */
export function exportCaseBundle() {
  const cases = loadCases().map((c) => ({
    id: c.id,
    kind: c.kind,
    code: c.code,
    title: c.title,
    sub: c.sub || '',
    question: c.question || '',
    castAt: c.castAt || 0,
    pinned: !!c.pinned,
    createdAt: c.createdAt || 0,
  }));
  return {
    schema: EXPORT_SCHEMA,
    version: EXPORT_VERSION,
    kindLabel: KIND_LABEL,
    exportedAt: new Date().toISOString(),
    exportedAtLocal: fmtAt(Date.now()),
    count: cases.length,
    cases,
  };
}

/** 导入前的体检：返回可用条目与问题条目（不写库） */
export function inspectBundle(bundle) {
  if (!bundle || typeof bundle !== 'object') throw new Error('不是有效的 JSON 对象');
  if (bundle.schema && bundle.schema !== EXPORT_SCHEMA) throw new Error(`不是案例文件（schema=${bundle.schema}）`);
  if (bundle.version && Number(bundle.version) > EXPORT_VERSION) {
    throw new Error(`文件版本 v${bundle.version} 高于本版支持的 v${EXPORT_VERSION}，请先升级应用`);
  }
  const raw = Array.isArray(bundle.cases) ? bundle.cases : Array.isArray(bundle) ? bundle : null;
  if (!raw) throw new Error('文件里没有 cases 数组');
  const valid = [];
  const bad = [];
  for (const item of raw) {
    const kind = String(item?.kind || '');
    const code = String(item?.code || '').trim();
    if (!KIND_LABEL[kind] || !code) { bad.push(item); continue; }
    valid.push({
      id: String(item.id || ''),
      kind,
      code,
      title: String(item.title || KIND_LABEL[kind]),
      sub: String(item.sub || ''),
      question: String(item.question || ''),
      castAt: Number(item.castAt) || 0,
      pinned: !!item.pinned,
      createdAt: Number(item.createdAt) || Date.now(),
    });
  }
  return { valid, bad, exportedAt: bundle.exportedAt || null, count: valid.length };
}

/**
 * 合并入库：同 code 或同 id → 覆盖（以新为准）；否则新增。
 * @returns {{added:number, updated:number, skipped:number, evicted:number, total:number}}
 */
export function importCaseBundle(bundle) {
  const { valid, bad } = inspectBundle(bundle);
  const list = read();
  let added = 0;
  let updated = 0;
  for (const item of valid) {
    const hit = list.find((c) => (item.code && c.code === item.code) || (item.id && c.id === item.id));
    if (hit) {
      Object.assign(hit, item, { id: hit.id });
      updated += 1;
    } else {
      list.push({ ...item, id: item.id || newId() });
      added += 1;
    }
  }
  // 导入前先给「同码不同 id」的重复项去重，避免一份文件导入两次变成两份
  const { dropped } = persistInfo(list);
  return {
    added, updated, skipped: bad.length, evicted: dropped,
    total: read().length,
  };
}

/** 导出文件的默认文件名：qintianjian-cases-20261121-1645.json */
export function exportFileName(now = new Date()) {
  const p = (n) => String(n).padStart(2, '0');
  return `qintianjian-cases-${now.getFullYear()}${p(now.getMonth() + 1)}${p(now.getDate())}-${p(now.getHours())}${p(now.getMinutes())}.json`;
}

/** 时间戳 → 08-01 11:45 / 2025-08-01 11:45（跨年才带年份） */
export function fmtAt(ms) {
  if (!ms) return '';
  const d = new Date(ms);
  const p = (n) => String(n).padStart(2, '0');
  const md = `${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`;
  return d.getFullYear() === new Date().getFullYear() ? md : `${d.getFullYear()}-${md}`;
}
