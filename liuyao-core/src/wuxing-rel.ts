/**
 * 五行 / 地支关系基础表（纳甲断卦事实层用）
 *
 * 只提供确定性的传统术数关系，不含任何吉凶判定。
 * 依据《增删卜易》通行口径（火土同宫：土爻长生在寅、墓在辰、绝在巳）。
 */
import type { DiZhi, WuXing } from './types.js';

/** 五行相生：生我者 / 我生者 */
export const WUXING_SHENG: Record<WuXing, WuXing> = {
  金: '水', 水: '木', 木: '火', 火: '土', 土: '金',
};
/** 五行相克：我克者 */
export const WUXING_KE: Record<WuXing, WuXing> = {
  金: '木', 木: '土', 土: '水', 水: '火', 火: '金',
};

export type ShengKe = '生' | '克' | '同' | '被生' | '被克';

/** a 相对 b 的五行关系（a 生 b / a 克 b / 同我 / b 生 a / b 克 a） */
export function relationOf(a: WuXing, b: WuXing): ShengKe {
  if (a === b) return '同';
  if (WUXING_SHENG[a] === b) return '生';
  if (WUXING_KE[a] === b) return '克';
  if (WUXING_SHENG[b] === a) return '被生';
  return '被克';
}

/** 地支六冲（对宫） */
export const LIU_CHONG: Record<DiZhi, DiZhi> = {
  子: '午', 午: '子', 丑: '未', 未: '丑', 寅: '申', 申: '寅',
  卯: '酉', 酉: '卯', 辰: '戌', 戌: '辰', 巳: '亥', 亥: '巳',
};

/** 地支六合（合化五行仅作参考，取用神时主要看"合"） */
export const LIU_HE: Partial<Record<DiZhi, DiZhi>> = {
  子: '丑', 丑: '子', 寅: '亥', 亥: '寅', 卯: '戌', 戌: '卯',
  辰: '酉', 酉: '辰', 巳: '申', 申: '巳', 午: '未', 未: '午',
};

/** 三合局 */
export const SAN_HE_JU: ReadonlyArray<{ zhi: ReadonlyArray<DiZhi>; ju: WuXing }> = [
  { zhi: ['申', '子', '辰'], ju: '水' },
  { zhi: ['寅', '午', '戌'], ju: '火' },
  { zhi: ['巳', '酉', '丑'], ju: '金' },
  { zhi: ['亥', '卯', '未'], ju: '木' },
];

/**
 * 三刑（无恩之刑寅巳申、恃势之刑丑戌未、无礼之刑子卯、自刑辰午酉亥）。
 * 返回该地支作为"刑"关系对象的集合。
 */
export const SAN_XING: Record<DiZhi, DiZhi[]> = {
  寅: ['巳', '申'], 巳: ['申', '寅'], 申: ['寅', '巳'],
  丑: ['戌', '未'], 戌: ['未', '丑'], 未: ['丑', '戌'],
  子: ['卯'], 卯: ['子'],
  辰: ['辰'], 午: ['午'], 酉: ['酉'], 亥: ['亥'],
};

/** 六害（穿心） */
export const LIU_HAI: Partial<Record<DiZhi, DiZhi>> = {
  子: '未', 未: '子', 丑: '午', 午: '丑', 寅: '巳', 巳: '寅',
  卯: '辰', 辰: '卯', 申: '亥', 亥: '申', 酉: '戌', 戌: '酉',
};

/**
 * 五行长生十二宫（只取纳甲断卦常用的 长生 / 帝旺 / 墓 / 绝 四个节点）。
 * 《增删卜易》火土同宫：土与火并，长生在寅、帝旺在午、墓在戌、绝在亥。
 * 爻论长生墓绝只按爻五行，不分阴阳顺逆（与"水土同宫长生于申"的另一流派并列，
 * 本包从《增删卜易》取火土同宫）。
 */
export interface ChangSheng {
  zhangsheng: DiZhi;
  diwang: DiZhi;
  mu: DiZhi;
  jue: DiZhi;
}
export const CHANG_SHENG: Record<WuXing, ChangSheng> = {
  金: { zhangsheng: '巳', diwang: '酉', mu: '丑', jue: '寅' },
  木: { zhangsheng: '亥', diwang: '卯', mu: '未', jue: '申' },
  水: { zhangsheng: '申', diwang: '子', mu: '辰', jue: '巳' },
  火: { zhangsheng: '寅', diwang: '午', mu: '戌', jue: '亥' },
  土: { zhangsheng: '寅', diwang: '午', mu: '戌', jue: '亥' },
};

/**
 * 进神 / 退神：动爻本位地支 → 变爻地支。
 * 同类五行按地支序顺行为进神、逆行为退神（《增删卜易·进神退神章》）。
 */
const JIN_TUI: Array<[DiZhi, DiZhi]> = [
  ['寅', '卯'], ['巳', '午'], ['申', '酉'], ['亥', '子'],
  ['丑', '辰'], ['辰', '未'], ['未', '戌'], ['戌', '丑'],
];
export function huaJinTui(from: DiZhi, to: DiZhi): '进神' | '退神' | null {
  for (const [a, b] of JIN_TUI) {
    if (from === a && to === b) return '进神';
    if (from === b && to === a) return '退神';
  }
  return null;
}
