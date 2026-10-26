// M7 卡牌引擎：加密安全随机 + Fisher-Yates 洗牌 + 牌组注册表 + 抽牌/牌阵
// 纯函数、框架无关；不接网络、不接模型，结果只列牌面事实与该自问的问题，不替用户断吉凶。
import type {
  DeckManifest, DrawnCard, Spread, CardReading, ReadingPosition,
  DeckCard, OHPair,
} from './types.js';

export const CARDS_GENERATOR = 'liuyao-core/cards';
export const CARDS_DISCLAIMER = '';

/** 取 [0, max) 的加密安全随机整数（拒绝采样，消除取模偏差）；浏览器/Node 均可用 */
export function secureRandomInt(max: number): number {
  if (!Number.isInteger(max) || max <= 0) throw new Error(`secureRandomInt 要求正整数，收到 ${max}`);
  const cryptoObj: Crypto | undefined =
    (typeof globalThis !== 'undefined' && (globalThis as { crypto?: Crypto }).crypto) || undefined;
  if (cryptoObj && typeof cryptoObj.getRandomValues === 'function') {
    const limit = Math.floor(0xffffffff / max) * max; // 只接受 <limit 的值
    const buf = new Uint32Array(1);
    let v: number;
    do { cryptoObj.getRandomValues(buf); v = buf[0]; } while (v >= limit);
    return v % max;
  }
  // 极端无 Web Crypto 环境的兜底（非加密安全，仅保证可用）
  return Math.floor(Math.random() * max);
}

/** Fisher-Yates 洗牌，返回新数组，不改入参 */
export function shuffle<T>(items: readonly T[]): T[] {
  const a = items.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = secureRandomInt(i + 1);
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

/** 抽到但尚未决定朝向的牌 */
export interface DrawnSeed {
  cardIndex: number;
  card: DeckCard;
}

/** 不放回地从牌组抽 n 张（先整副洗牌再取前 n，保证不重复）；朝向由上层决定 */
export function drawCards(deck: DeckManifest, n: number): DrawnSeed[] {
  if (n > deck.cards.length) throw new Error(`抽牌数 ${n} 超过牌组张数 ${deck.cards.length}`);
  return shuffle(deck.cards.map((card, cardIndex) => ({ card, cardIndex }))).slice(0, n);
}

// ---------- 牌组注册表（显式注册，避免依赖 import 副作用顺序） ----------
const REGISTRY = new Map<string, DeckManifest>();

export function registerDeck(deck: DeckManifest): void {
  if (deck.cards.length !== deck.cardCount) {
    throw new Error(`牌组 ${deck.id} cardCount=${deck.cardCount} 与实际 ${deck.cards.length} 不一致`);
  }
  const ids = new Set<string>();
  for (const c of deck.cards) {
    if (ids.has(c.id)) throw new Error(`牌组 ${deck.id} 内有重复牌 id：${c.id}`);
    ids.add(c.id);
  }
  REGISTRY.set(deck.id, deck);
}

export function getDeck(id: string): DeckManifest {
  const d = REGISTRY.get(id);
  if (!d) throw new Error(`未注册的牌组：${id}`);
  return d;
}

export function listDecks(builtinOnly = false): DeckManifest[] {
  const all = Array.from(REGISTRY.values());
  return builtinOnly ? all.filter((d) => d.builtin) : all;
}

// ---------- 牌阵注册表 ----------
const SPREAD_REGISTRY = new Map<string, Spread>();

export function registerSpread(spread: Spread): void {
  if (spread.positions.length !== spread.count) {
    throw new Error(`牌阵 ${spread.id} count=${spread.count} 与牌位数 ${spread.positions.length} 不一致`);
  }
  SPREAD_REGISTRY.set(spread.id, spread);
}

export function getSpread(id: string): Spread {
  const s = SPREAD_REGISTRY.get(id);
  if (!s) throw new Error(`未注册的牌阵：${id}`);
  return s;
}

export function listSpreads(deckKind?: DeckManifest['kind']): Spread[] {
  const all = Array.from(SPREAD_REGISTRY.values());
  return deckKind ? all.filter((s) => s.deckKinds.includes(deckKind)) : all;
}

function pad2(n: number): string { return String(n).padStart(2, '0'); }

/** 默认 ISO 时间（本地时区 YYYY-MM-DDTHH:mm）；允许注入 now 便于测试 */
function defaultNow(): string {
  const d = new Date();
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}T${pad2(d.getHours())}:${pad2(d.getMinutes())}`;
}

/**
 * 在某牌阵下抽牌。
 * - 不放回整副洗牌；牌位按顺序落牌。
 * - reversal=true 且牌组与该张牌均支持正逆位时，逐张随机朝向；否则全部正位。
 */
export function drawSpread(
  deck: DeckManifest,
  spread: Spread,
  opts: { question?: string; reversal?: boolean; now?: string } = {},
): CardReading {
  if (!spread.deckKinds.includes(deck.kind)) {
    throw new Error(`牌阵 ${spread.id} 不适用于牌组类别 ${deck.kind}`);
  }
  const useReversal = opts.reversal ?? (spread.reversal && deck.allowsReversal);
  const drawn = drawCards(deck, spread.count);
  const positions: ReadingPosition[] = spread.positions.map((position, index) => {
    const d = drawn[index];
    const reversed = useReversal && deck.allowsReversal && d.card.reversible && secureRandomInt(2) === 1;
    return { index, position, drawn: { ...d, reversed } };
  });
  return {
    generator: CARDS_GENERATOR,
    deckId: deck.id,
    deckName: deck.name,
    spreadId: spread.id,
    spreadName: spread.name,
    drawnAt: opts.now ?? defaultNow(),
    question: (opts.question ?? '').trim(),
    reversal: useReversal,
    positions,
    disclaimer: CARDS_DISCLAIMER,
  };
}

/** 单张日抽（正逆位可选） */
export function drawSingle(deck: DeckManifest, opts: { reversal?: boolean; now?: string } = {}): DrawnCard {
  const d = drawCards(deck, 1)[0];
  const reversed =
    (opts.reversal ?? deck.allowsReversal) && deck.allowsReversal && d.card.reversible && secureRandomInt(2) === 1;
  return { ...d, reversed };
}

/** 把一次牌阵阅读格式化为可一键复制（带去外部 AI）的纯文本 */
export function readingToText(r: CardReading): string {
  const lines: string[] = [];
  lines.push(`【${r.deckName} · ${r.spreadName}】`);
  if (r.question) lines.push(`所问：${r.question}`);
  lines.push(`时间：${r.drawnAt}`);
  lines.push('');
  for (const rp of r.positions) {
    const d = rp.drawn;
    if (!d) continue;
    const rev = d.reversed ? '（逆位）' : '';
    lines.push(`${rp.index + 1}. ${rp.position.label}：${d.card.name}${rev}`);
    lines.push(`   此位看：${rp.position.meaning}`);
    const m = d.card.meaning;
    const pick = d.reversed ? m.reversed : m.upright;
    if (pick && pick.length) lines.push(`   ${d.reversed ? '逆位牌义' : '正位牌义'}：${pick.join('、')}`);
    if (m.keywords && m.keywords.length) lines.push(`   关键词：${m.keywords.join('、')}`);
    lines.push('');
  }
  lines.push('——牌局只给自省用：不要替我预测，也不要把它交给外部 AI 代解。');
  return lines.join('\n');
}

/**
 * OH 卡：图卡组抽一张 × 字卡组抽一张（各自独立洗牌、均为正位）。
 * 定位为心理投射/联想工具，不是预言。
 */
export function drawOHPair(imageDeck: DeckManifest, wordDeck: DeckManifest): OHPair {
  if (imageDeck.kind !== 'oh' || imageDeck.ohRole !== 'image') throw new Error('图卡组须为 kind=oh、ohRole=image');
  if (wordDeck.kind !== 'oh' || wordDeck.ohRole !== 'word') throw new Error('字卡组须为 kind=oh、ohRole=word');
  const image: DeckCard = drawCards(imageDeck, 1)[0].card;
  const word: DeckCard = drawCards(wordDeck, 1)[0].card;
  return { image, word };
}
