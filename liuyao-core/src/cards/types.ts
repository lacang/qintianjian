// M7 通用可插拔卡牌框架——类型定义（框架无关、纯可序列化 JSON）
// 设计目标：新牌组＝一份 manifest+cards 数据（+可选图），不改引擎；版权牌走本地 inbox，不入包不分发。

/** 牌组类别：塔罗 / 利诺曼 / 神谕 / OH（图卡×字卡心理投射） */
export type DeckKind = 'tarot' | 'lenormand' | 'oracle' | 'oh';

/** OH 一副牌在“图卡×字卡”配对里扮演的角色 */
export type OHRole = 'image' | 'word';

/**
 * 单张牌的读法数据。
 * - scene：牌面画面/图意的中性描述（罗列式，不含判断）。
 * - keywords：中性关键词。
 * - upright/reversed：正位、逆位的中性含义词/短语；不使用“必/注定/你会/包你”等断语。
 * - classic*：公有领域典籍原文层（如 Waite《Pictorial Key to the Tarot》1910）。
 *   首版 RWS 结构化层为中性整理，典籍逐卡原文层待从核验过的 PD 文本摄入，故留空而不代写。
 */
export interface CardMeaning {
  scene: string;
  keywords: string[];
  upright: string[];
  reversed: string[];
  /** 典籍来源标注，如 'A.E. Waite《Pictorial Key to the Tarot》(1910, PD)'；无原文时留空 */
  classicSource?: string;
  /** 典籍原文摘录（逐字、可溯源）；首版留空，禁止以整理层冒充原文 */
  classicText?: string;
}

/** 单张牌（牌组内定义，不含一次抽牌的朝向/落位状态） */
export interface DeckCard {
  /** 牌组内稳定唯一 id，如 'major-00-fool' */
  id: string;
  /** 中文标准名 */
  name: string;
  /** 外文名（RWS 英文名等），便于核对底本 */
  nameAlt?: string;
  /** 分组：大阿尔卡那 / 权杖 / 圣杯 / 宝剑 / 星币 …… */
  group?: string;
  /** 展示牌序：大阿尔卡那罗马数字、小牌点数等 */
  label?: string;
  /** 是否参与随机正逆位（神谕卡/OH 通常为 false） */
  reversible: boolean;
  /** 可选牌面图相对路径；版权牌只指向本地 inbox，绝不指向随包资源 */
  image?: string;
  meaning: CardMeaning;
}

/** 牌组清单（manifest）＋整组牌数据 */
export interface DeckManifest {
  id: string;
  name: string;
  kind: DeckKind;
  /** OH 配对角色；仅 kind='oh' 使用 */
  ohRole?: OHRole;
  cardCount: number;
  /** 底本/作者说明 */
  author?: string;
  /** 许可，随包牌必须为公有领域或宽松许可，如 'Public Domain (RWS 1909, US)' */
  license: string;
  /** 底本来源（可溯源） */
  source?: string;
  description: string;
  /** 整组是否支持正逆位 */
  allowsReversal: boolean;
  /** true=随包分发（须 PD/MIT 等干净许可）；false=主人本地内参（版权牌，开源版本自动排除） */
  builtin: boolean;
  cards: DeckCard[];
}

/** 牌阵中的一个牌位：归一化坐标驱动布局，新增牌阵只加数据不改引擎 */
export interface SpreadPosition {
  /** 0..100，左上原点 */
  x: number;
  /** 0..100，左上原点 */
  y: number;
  /** 位置名，如“过去”“现状” */
  label: string;
  /** 位置含义/在此位要看什么（中性说明） */
  meaning: string;
  /** 牌面在此位的额外旋转角度（凯尔特十字的横压牌为 90） */
  rotate?: number;
}

/** 牌阵 */
export interface Spread {
  id: string;
  name: string;
  /** 用牌张数，须等于 positions.length */
  count: number;
  /** 类型标签：万能 / 爱情 / 事业 / 周运 / 关系 / 选择 / 深度 / 年运 */
  type: string;
  intro: string;
  /** 本阵是否启用随机正逆位 */
  reversal: boolean;
  /** 适用牌组类别 */
  deckKinds: DeckKind[];
  positions: SpreadPosition[];
}

/** 一次抽牌落到某阵位的结果 */
export interface DrawnCard {
  /** 抽到的牌在牌组 cards 中的下标 */
  cardIndex: number;
  /** 牌定义引用（纯数据，可直接 JSON 序列化） */
  card: DeckCard;
  /** true=逆位，false=正位 */
  reversed: boolean;
}

/** 阵位＋落到该位的牌 */
export interface ReadingPosition {
  index: number;
  position: SpreadPosition;
  drawn: DrawnCard | null;
}

/** 一次完整牌阵阅读 */
export interface CardReading {
  generator: string;
  deckId: string;
  deckName: string;
  spreadId: string;
  spreadName: string;
  /** ISO 时间戳（由调用环境决定；纯函数可注入 now） */
  drawnAt: string;
  question: string;
  reversal: boolean;
  positions: ReadingPosition[];
  /** 固定红线声明 */
  disclaimer: string;
}

/** OH 图卡×字卡组合（心理投射，不是预言） */
export interface OHPair {
  image: DeckCard;
  word: DeckCard;
}
