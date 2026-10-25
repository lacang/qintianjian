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
  return [...pinned, ...rest.slice(0, keep)];
}

function persist(list) {
  let out = trim(list);
  for (let i = 0; i < 8; i++) {
    try {
      localStorage.setItem(KEY, JSON.stringify(out));
      return out;
    } catch {
      // 配额溢出：先砍未星标的一半再试
      const pinned = out.filter((c) => c.pinned);
      const rest = out.filter((c) => !c.pinned);
      if (!rest.length) break;
      out = [...pinned, ...rest.slice(0, Math.max(1, Math.floor(rest.length / 2)))];
    }
  }
  return out;
}

function newId() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
}

/**
 * 保存一个案例（自动调用）
 * @param {{kind:string, code:string, title:string, sub?:string, question?:string, castAt?:number, dedupe?:boolean}} item
 * @returns {object} 落库后的案例
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
      persist(list);
      return hit;
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
  persist(list);
  return item;
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

/** 时间戳 → 08-01 11:45 / 2025-08-01 11:45（跨年才带年份） */
export function fmtAt(ms) {
  if (!ms) return '';
  const d = new Date(ms);
  const p = (n) => String(n).padStart(2, '0');
  const md = `${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`;
  return d.getFullYear() === new Date().getFullYear() ? md : `${d.getFullYear()}-${md}`;
}
