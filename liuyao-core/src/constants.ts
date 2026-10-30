/**
 * 静态常量表
 *
 * 数据来源（均为 MIT/Apache-2.0，可自由使用）：
 * - 纳甲天干表、六合/六冲卦清单：baendlorel/tsumugi-lib（npm: liuyao@0.5.1，MIT）
 *   的 TrigramInfoTable / Hexagram.specialType，经 64 卦全量比对与 mingpan 0 分歧。
 * - 纳甲地支、卦宫世应：运行时取 mingpan@0.1.8（Apache-2.0）计算器/数据表。
 * 本文件只放两个上游库不直接给、或为减少跨库耦合而自建的小表。
 */
import type { BaGua, DiZhi, TianGan, WuXing } from './types.js';

/** 地支五行 */
export const ZHI_WUXING: Record<DiZhi, WuXing> = {
  子: '水', 丑: '土', 寅: '木', 卯: '木', 辰: '土', 巳: '火',
  午: '火', 未: '土', 申: '金', 酉: '金', 戌: '土', 亥: '水',
};

/** 八卦五行（简体键） */
export const BAGUA_WUXING: Record<BaGua, WuXing> = {
  乾: '金', 兑: '金', 离: '火', 震: '木',
  巽: '木', 坎: '水', 艮: '土', 坤: '土',
};

/**
 * 八经卦三爻阴阳（自下而上 [初,二,三]，true=阳）。
 * tsumugi Hexagram.toBinary 给的是"上爻在首"的三位串（如坎 '010' = 上阴/中阳/初阴），
 * 本表按自下而上排列。来源：tsumugi（MIT）。
 */
export const BAGUA_BITS: Record<BaGua, readonly [boolean, boolean, boolean]> = {
  乾: [true, true, true], // ☰ 111
  兑: [false, true, true], // ☱ binary 110
  离: [true, false, true], // ☲ binary 101
  震: [false, false, true], // ☳ binary 100
  巽: [true, true, false], // ☴ binary 011
  坎: [false, true, false], // ☵ binary 010
  艮: [true, false, false], // ☶ binary 001
  坤: [false, false, false], // ☷ 000
};

/**
 * 纳甲天干表（浑天甲子，乾内甲外壬、坤内乙外癸、艮丙、兑丁、坎戊、离己、震庚、巽辛）
 * 来源：tsumugi TrigramInfoTable（MIT），与《增删卜易·纳甲歌》一致。
 * key 为经卦（简体），inner=下卦三爻（初→三），outer=上卦三爻（四→上）。
 */
export const NAJIA_GAN: Record<BaGua, { inner: TianGan[]; outer: TianGan[] }> = {
  乾: { inner: ['甲', '甲', '甲'], outer: ['壬', '壬', '壬'] },
  坤: { inner: ['乙', '乙', '乙'], outer: ['癸', '癸', '癸'] },
  艮: { inner: ['丙', '丙', '丙'], outer: ['丙', '丙', '丙'] },
  兑: { inner: ['丁', '丁', '丁'], outer: ['丁', '丁', '丁'] },
  坎: { inner: ['戊', '戊', '戊'], outer: ['戊', '戊', '戊'] },
  离: { inner: ['己', '己', '己'], outer: ['己', '己', '己'] },
  震: { inner: ['庚', '庚', '庚'], outer: ['庚', '庚', '庚'] },
  巽: { inner: ['辛', '辛', '辛'], outer: ['辛', '辛', '辛'] },
};

/**
 * 六合卦（8 个），简体全名。
 * 来源：tsumugi Hexagram.specialType==='六合'（MIT），即：
 * 地雷复、地天泰、雷地豫、水泽节、泽水困、山火贲、火山旅、天地否。
 */
export const LIU_HE_GUA: ReadonlySet<string> = new Set([
  '地雷复', '地天泰', '雷地豫', '水泽节',
  '泽水困', '山火贲', '火山旅', '天地否',
]);

/**
 * 六冲卦（10 个，含八个八纯卦加大壮、无妄），简体全名。
 * 来源：tsumugi Hexagram.specialType==='六冲'（MIT）。
 */
export const LIU_CHONG_GUA: ReadonlySet<string> = new Set([
  '坤为地', '震为雷', '雷天大壮', '坎为水', '兑为泽',
  '艮为山', '离为火', '巽为风', '天雷无妄', '乾为天',
]);

// 游魂/归魂/八纯判定：mingpan guaXu 即京房八宫序号（1本宫八纯 / 2一世…6五世 / 7游魂 / 8归魂），
// 与 tsumugi generation（6游魂/7归魂）在 16 个魂卦上完全一致。
//
// 口径决策（L0 修复轮，2026-10-27）：原 `GUI_HUN_OVERRIDE = new Set(['雷火丰'])` 已撤销。
// 该覆盖曾把雷火丰同时标成「坎宫归魂」+「世五应二」，而按八宫生成规则雷火丰是坎宫第六卦
// （五世卦），归魂应为第八卦地火明夷 —— 标签与世位自相矛盾，属显示错误。
// 现统一回归古法：魂卦标记一律由 guaXu 判定，不做任何按卦名的特例覆盖。

/** 地支顺序（用于天医"月建后退一位"等） */
export const ZHI_ORDER: DiZhi[] = [
  '子', '丑', '寅', '卯', '辰', '巳', '午', '未', '申', '酉', '戌', '亥',
];

/** mingpan（繁体）→ 简体字表，覆盖 64 卦名、六亲、六神、飞伏关系中出现的字 */
const FAN_JIAN_MAP: Record<string, string> = {
  為: '为', 謙: '谦', 師: '师', 風: '风', 復: '复', 臨: '临',
  剝: '剥', 蠱: '蛊', 頤: '颐', 賁: '贲', 損: '损', 畜: '畜',
  蹇: '蹇', 濟: '济', 節: '节', 觀: '观', 漸: '渐', 渙: '涣',
  恆: '恒', 豐: '丰', 歸: '归', 壯: '壮', 晉: '晋', 噬: '噬',
  嗑: '嗑', 睽: '睽', 鹹: '咸', 隨: '随', 遯: '遁', 訟: '讼',
  姤: '姤', 無: '无', 妄: '妄', 澤: '泽', 兌: '兑', 夬: '夬',
  離: '离', 過: '过', 龍: '龙', 陳: '陈', 孫: '孙', 財: '财',
  龜: '龟', 飛: '飞', 剋: '克', 動: '动', 變: '变', 應: '应',
  爾: '尔', 與: '与', 於: '于', 後: '后', 陽: '阳', 陰: '阴',
};

/** 繁体 → 简体（仅处理本领域用字，不引第三方繁简库以保持零依赖） */
export function toSimplified(text: string): string {
  let out = '';
  for (const ch of text) out += FAN_JIAN_MAP[ch] ?? ch;
  return out;
}
