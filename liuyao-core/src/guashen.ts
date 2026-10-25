/**
 * 卦身计算（《增删卜易·卦身章》）
 *
 * 阳世位（1,3,5）：卦身地支序号 = 世位 - 1（0-based）
 *   世1→子, 世3→寅, 世5→辰
 * 阴世位（2,4,6）：卦身地支序号 = 世位 + 5（0-based，等价于世位-1+6）
 *   世2→未, 世4→酉, 世6→亥
 */
import type { DiZhi } from './types.js';

const DIZHI: DiZhi[] = ['子', '丑', '寅', '卯', '辰', '巳', '午', '未', '申', '酉', '戌', '亥'];

/**
 * 根据世爻位置计算卦身地支。
 * @param shiPosition 世爻位置 1-6
 * @returns 卦身地支
 */
export function calcGuaShen(shiPosition: number): DiZhi {
  if (shiPosition < 1 || shiPosition > 6) {
    throw new Error(`世爻位置越界: ${shiPosition}`);
  }
  const isYang = shiPosition % 2 === 1; // 1,3,5 为阳世位
  const index = isYang ? shiPosition - 1 : shiPosition + 5;
  return DIZHI[index];
}
