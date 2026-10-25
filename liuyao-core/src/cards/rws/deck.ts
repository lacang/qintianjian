// RWS（Rider–Waite–Smith）牌组清单：78 张，1909 年版在美国属公有领域，默认随包牌组
import type { DeckManifest } from '../types.js';
import { RWS_MAJOR } from './major.js';
import { RWS_WANDS, RWS_CUPS } from './wandsCups.js';
import { RWS_SWORDS, RWS_PENTACLES } from './swordsPentacles.js';
import { RWS_IMAGES } from './images.js';

export const RWS_DECK_ID = 'rws';

const CARDS_WITH_IMG = [
  ...RWS_MAJOR,
  ...RWS_WANDS,
  ...RWS_CUPS,
  ...RWS_SWORDS,
  ...RWS_PENTACLES,
].map((c) => (RWS_IMAGES[c.id] ? { ...c, image: RWS_IMAGES[c.id] } : c));

export const RWS_DECK: DeckManifest = {
  id: RWS_DECK_ID,
  name: '韦特塔罗（RWS）',
  kind: 'tarot',
  cardCount: 78,
  author: 'Arthur Edward Waite 文 / Pamela Colman Smith 绘',
  license: 'Public Domain（1909 Rider–Waite–Smith，美国公有领域）',
  source:
    '牌面与基础牌名据 1909 年 Rider–Waite–Smith 牌；结构化牌义（画面/关键词/正逆位）为自建中性整理，' +
    '未使用任何在版权保护期内的现代中译本。典籍逐卡原文层拟据 A.E. Waite《Pictorial Key to the Tarot》(1910, PD)，' +
    '将从核验过的公有领域文本摄入，首版留空、不以整理层冒充原文。',
  description:
    '默认塔罗牌组，22 张大阿尔卡那＋权杖/圣杯/宝剑/星币四花色各 14 张，共 78 张。支持正逆位。',
  allowsReversal: true,
  builtin: true,
  cards: CARDS_WITH_IMG,
};
