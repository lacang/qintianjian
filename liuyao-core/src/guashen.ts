/**
 * 卦身计算（《增删卜易·卦身章》）
 *
 * 古法原文：「阳世还从子月起，阴世还从午月起，数至世爻即卦身也。」
 * 口诀里的「阳世 / 阴世」指【世爻这一爻本身的阴阳】，不是世位的奇偶：
 *   阳爻持世：初爻起子，顺数至世位（世1→子, 世2→丑, … 世6→巳）
 *   阴爻持世：初爻起午，顺数至世位（世1→午, 世2→未, … 世6→亥）
 * 即：卦身地支序号(0-based) = (世位 - 1) + (世爻为阳 ? 0 : 6)，mod 12。
 *
 * 历史 bug：旧实现按「世位奇偶」判阴阳（1/3/5 当阳世、2/4/6 当阴世），
 * 世爻阴阳与世位奇偶不一致的 32 卦全错（例：天风姤世在初爻、为阴爻，
 * 旧码给子，实为午）。
 */
import type { DiZhi, YinYang } from './types.js';

const DIZHI: DiZhi[] = ['子', '丑', '寅', '卯', '辰', '巳', '午', '未', '申', '酉', '戌', '亥'];

/**
 * 根据世爻位置与其阴阳计算卦身地支。
 * @param shiPosition 世爻位置 1-6
 * @param shiYinYang 世爻本身的阴阳（'阳' | '阴'）；六爻盘里取该位爻的 yinYang
 * @returns 卦身地支
 */
export function calcGuaShen(shiPosition: number, shiYinYang: YinYang): DiZhi {
  if (shiPosition < 1 || shiPosition > 6) {
    throw new Error(`世爻位置越界: ${shiPosition}`);
  }
  if (shiYinYang !== '阳' && shiYinYang !== '阴') {
    throw new Error(`世爻阴阳非法: ${String(shiYinYang)}`);
  }
  const isYangShi = shiYinYang === '阳';
  const index = ((shiPosition - 1) + (isYangShi ? 0 : 6)) % 12;
  return DIZHI[index];
}
