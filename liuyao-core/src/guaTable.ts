/**
 * 64 卦静态表封装
 *
 * - 卦宫/卦序/世应/卦名/纳甲地支：mingpan@0.1.8（Apache-2.0）data/guagong + NajiaCalculator。
 * - 纳甲天干：本项目 constants.ts 的 NAJIA_GAN（来源 tsumugi，MIT）。
 * - 六合/六冲：constants.ts（来源 tsumugi specialType，MIT）。
 * mingpan 直接返回繁体（兌/離/為…），本层统一转简体后再向上暴露。
 */
import { getGua64Info } from 'mingpan/dist/services/liuyao/data/guagong.js';
import { NajiaCalculator } from 'mingpan/dist/services/liuyao/index.js';
import {
  BAGUA_WUXING,
  LIU_CHONG_GUA,
  LIU_HE_GUA,
  NAJIA_GAN,
  ZHI_WUXING,
  toSimplified,
} from './constants.js';
import type { BaGua as MpBaGua } from 'mingpan/dist/services/liuyao/index.js';
import type { BaGua, DiZhi, TianGan, WuXing, YaoValue } from './types.js';

/** mingpan 使用繁体经卦名 */
const TO_MP_BAGUA: Record<BaGua, MpBaGua> = {
  乾: '乾', 兑: '兌', 离: '離', 震: '震',
  巽: '巽', 坎: '坎', 艮: '艮', 坤: '坤',
};
const FROM_MP_BAGUA: Record<MpBaGua, BaGua> = {
  乾: '乾', 兌: '兑', 離: '离', 震: '震',
  巽: '巽', 坎: '坎', 艮: '艮', 坤: '坤',
};

export interface RawGuaMeta {
  name: string;
  upper: BaGua;
  lower: BaGua;
  gong: BaGua;
  gongWuXing: WuXing;
  shiPosition: number;
  yingPosition: number;
  /** mingpan guaXu：1本宫 2一世…6五世 7游魂 8归魂 */
  guaXu: number;
  isYouHun: boolean;
  isGuiHun: boolean;
  isBaChun: boolean;
  specialType?: '六合' | '六冲';
}

/** 由上下卦（简体）查 64 卦静态信息 */
export function getGuaMeta(upper: BaGua, lower: BaGua): RawGuaMeta {
  const info = getGua64Info(TO_MP_BAGUA[upper], TO_MP_BAGUA[lower]);
  const name = toSimplified(info.name);
  return {
    name,
    upper,
    lower,
    gong: FROM_MP_BAGUA[info.gong],
    gongWuXing: BAGUA_WUXING[FROM_MP_BAGUA[info.gong]],
    shiPosition: info.shiYao,
    yingPosition: info.yingYao,
    // mingpan guaXu：京房八宫序号（1本宫/八纯，2一世…6五世，7游魂，8归魂）
    guaXu: info.guaXu,
    isYouHun: info.guaXu === 7,
    // 归魂 = 八宫第八卦（《增删卜易·归魂游魂章》：「归魂卦为各宫之第八卦」）。
    // 雷火丰是坎宫第六卦（五世卦），不标归魂。
    // 坎宫八卦序（2026-10-28 用 mingpan guaXu 实测复核）：坎为水1 / 水泽节2 / 水雷屯3 /
    //   水火既济4 / 泽火革5 / 雷火丰6 / 地火明夷7（游魂）/ 地水师8（归魂）。
    //   故坎宫归魂是「地水师」，地火明夷是游魂——勿混。
    // 原 GUI_HUN_OVERRIDE 人工覆盖已在 L0 修复轮撤销（标签与世五应二自相矛盾）。
    isGuiHun: info.guaXu === 8,
    isBaChun: info.guaXu === 1,
    specialType: LIU_HE_GUA.has(name) ? '六合' : LIU_CHONG_GUA.has(name) ? '六冲' : undefined,
  };
}

/** 某宫八纯首卦名（简体"坎为水"式） */
export function getShouGuaName(gong: BaGua): string {
  const meta = getGuaMeta(gong, gong);
  return meta.name;
}

/**
 * 全卦六爻纳甲（自下而上），补齐 mingpan 不直接给的天干。
 * 返回 gan/zhi/wuXing。
 */
export interface FullNajia {
  gan: TianGan;
  zhi: DiZhi;
  wuXing: WuXing;
}

export function getFullNajia(upper: BaGua, lower: BaGua): FullNajia[] {
  // mingpan ESM 下计算器入参为繁体卦名
  const mp = NajiaCalculator.calculateAll(TO_MP_BAGUA[upper], TO_MP_BAGUA[lower]);
  const ganInner = NAJIA_GAN[lower].inner;
  const ganOuter = NAJIA_GAN[upper].outer;
  return mp.map((item, i) => {
    const zhi = item.diZhi as DiZhi;
    return {
      gan: i < 3 ? ganInner[i] : ganOuter[i - 3],
      zhi,
      wuXing: ZHI_WUXING[zhi],
    };
  });
}

/** 由六爻值求上下卦（简体卦名），自下而上 */
export function getTrigramsFromValues(values: readonly number[]): { upper: BaGua; lower: BaGua } {
  const g = NajiaCalculator.getGuaFromYaoValues(values as YaoValue[]);
  return { upper: FROM_MP_BAGUA[g.upper], lower: FROM_MP_BAGUA[g.lower] };
}
