// M7 通用可插拔卡牌框架——模块入口：注册内建（随包、许可干净）牌组与牌阵
// 版权牌（神谕卡/OH/现代塔罗/利诺曼现代版）走本地 inbox 动态注册，不由此处随包。
import { RWS_DECK } from './rws/deck.js';
import { BUILTIN_SPREADS } from './spreads.js';
import { registerDeck, registerSpread } from './engine.js';

let registered = false;

/** 注册内建牌组与牌阵（幂等）。首次调用任意卡牌 API 前会自动执行一次。 */
export function ensureBuiltinCards(): void {
  if (registered) return;
  registerDeck(RWS_DECK);
  for (const s of BUILTIN_SPREADS) registerSpread(s);
  registered = true;
}

ensureBuiltinCards();

export * from './types.js';
export {
  CARDS_GENERATOR, CARDS_DISCLAIMER,
  secureRandomInt, shuffle, drawCards,
  registerDeck, getDeck, listDecks,
  registerSpread, getSpread, listSpreads,
  drawSpread, drawSingle, drawOHPair, readingToText,
} from './engine.js';
export { RWS_DECK, RWS_DECK_ID } from './rws/deck.js';
export { BUILTIN_SPREADS } from './spreads.js';
