// RWS（Rider–Waite–Smith，1909，美国公有领域）卡牌数据构造助手
// 结构化层（画面/关键词/正逆位）为自建中性整理；不使用任何在版权保护期内的现代中译本。
// 典籍逐卡原文层（Waite《Pictorial Key to the Tarot》1910, PD）后续从核验过的 PD 文本摄入，首版留空。
import type { DeckCard } from '../types.js';

export const RWS_CLASSIC_SOURCE = 'A.E. Waite《Pictorial Key to the Tarot》(1910, 美国公有领域)';

interface CardSeed {
  id: string;
  name: string;
  nameAlt: string;
  group: string;
  label: string;
  scene: string;
  keywords: string[];
  upright: string[];
  reversed: string[];
  /** 典籍逐卡原文来源（Waite《Pictorial Key to the Tarot》1910, PD） */
  classicSource?: string;
  /** 典籍逐卡原文摘录：正位 Divinatory Meanings，逆位前缀 “Reversed: ”；逐字不译 */
  classicText?: string;
}

/** 大阿尔卡那与小牌都可正逆位 */
export function rwsCard(s: CardSeed): DeckCard {
  return {
    id: s.id,
    name: s.name,
    nameAlt: s.nameAlt,
    group: s.group,
    label: s.label,
    reversible: true,
    meaning: {
      scene: s.scene,
      keywords: s.keywords,
      upright: s.upright,
      reversed: s.reversed,
      ...(s.classicSource ? { classicSource: s.classicSource } : {}),
      ...(s.classicText ? { classicText: s.classicText } : {}),
    },
  };
}

/** 小牌 factory：统一命名/分组，减少样板 */
export function rwsMinor(
  suitId: string,
  group: string,
  rankLabel: string,
  id: string,
  name: string,
  nameAlt: string,
  scene: string,
  keywords: string[],
  upright: string[],
  reversed: string[],
  classicSource?: string,
  classicText?: string,
): DeckCard {
  return rwsCard({
    id: `${suitId}-${id}`,
    name,
    nameAlt,
    group,
    label: rankLabel,
    scene,
    keywords,
    upright,
    reversed,
    classicSource,
    classicText,
  });
}
