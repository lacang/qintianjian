/**
 * 装卦引擎：成卦六爻 + 起卦时间 → 标准盘 Pan
 *
 * 组装方式（mingpan 不直接吐"变卦整盘"，见对账报告五节，所需底层计算器它都提供）：
 * 1. 四柱/旬空：本包 calendar.ts（lunar-javascript Exact API），不用 mingpan service
 *    （其内部 EightChar 非 Exact 且忽略分钟，节气边界当天会错柱）。
 * 2. 卦宫/世应/卦序：guaTable.getGuaMeta（mingpan guagong 数据表）。
 * 3. 本卦纳甲地支：mingpan NajiaCalculator；天干由本包 NAJIA_GAN 补齐（tsumugi MIT）。
 * 4. 六亲：mingpan LiuqinCalculator，固定传本卦宫五行；
 *    ⚠️ 变卦六亲同样恒用本卦宫五行（头号红线，见 README/对账报告 3.3）。
 * 5. 六神：mingpan LiushenCalculator（按日干）。
 * 6. 伏神：mingpan FushenCalculator（只列卦中缺失六亲，飞伏关系出《增删卜易》），
 *    伏神天干取本宫首卦纳甲。
 * 7. 变卦：动爻阴阳翻转 → 新上下卦 → getGuaMeta + getFullNajia 装整盘六爻。
 * 8. 神煞：本包 shensha.ts（金标准 14 项）。
 */
import {
  FushenCalculator,
  LiushenCalculator,
  LiuqinCalculator,
} from 'mingpan/dist/services/liuyao/index.js';
import type { BaGua as MpBaGua2 } from 'mingpan/dist/services/liuyao/index.js';
import { solarToSiZhu } from './calendar.js';
import { BAGUA_BITS, NAJIA_GAN, toSimplified } from './constants.js';
import { getFullNajia, getGuaMeta, getShouGuaName, getTrigramsFromValues, type RawGuaMeta } from './guaTable.js';
import { calcShenSha } from './shensha.js';
import { calcGuaShen } from './guashen.js';
import type {
  BaGua,
  BenYao,
  BianYao,
  FuShen,
  CastResult,
  GuaMeta,
  LiuQin,
  LiuShen,
  PaipanInput,
  Pan,
  ShiYing,
  TianGan,
  WuXing,
  YaoValue,
} from './types.js';

const MP_YIN_YANG: Record<string, '阴' | '阳'> = { 陽: '阳', 陰: '阴' };
const MP_LIU_QIN: Record<string, LiuQin> = {
  父母: '父母', 兄弟: '兄弟', 子孫: '子孙', 妻財: '妻财', 官鬼: '官鬼',
};
const MP_LIU_SHEN: Record<string, LiuShen> = {
  青龍: '青龙', 朱雀: '朱雀', 勾陳: '勾陈', 螣蛇: '螣蛇',
  白虎: '白虎', 玄武: '玄武',
};
const MP_RELATION: Record<string, string> = {
  飛克伏: '飞克伏', 飛生伏: '飞生伏', 伏克飛: '伏克飞',
  伏生飛: '伏生飞', 比和: '比和',
};

function shiYingOf(position: number, meta: RawGuaMeta): ShiYing {
  if (position === meta.shiPosition) return '世';
  if (position === meta.yingPosition) return '应';
  return undefined;
}

function withShouGua(meta: RawGuaMeta): GuaMeta {
  return { ...meta, shouGuaName: getShouGuaName(meta.gong) };
}

export function paipan(input: PaipanInput): Pan {
  const values = Array.isArray(input.yaoValues)
    ? input.yaoValues
    : (input.yaoValues as CastResult).yaoValues;
  if (!Array.isArray(values) || values.length !== 6) {
    throw new Error(`paipan 需要 6 个爻值（自下而上），收到 ${Array.isArray(values) ? values.length : values}`);
  }
  for (const v of values) {
    if (v !== 6 && v !== 7 && v !== 8 && v !== 9) {
      throw new Error(`非法爻值 ${v}，只允许 6/7/8/9`);
    }
  }
  const yaoValues = values as YaoValue[];

  // 1. 历法
  const sz = solarToSiZhu(input);

  // 2. 本卦
  const { upper, lower } = getTrigramsFromValues(yaoValues);
  const benMeta = withShouGua(getGuaMeta(upper, lower));
  const benNajia = getFullNajia(upper, lower);
  const liuShenRaw = LiushenCalculator.calculateAll(sz.dayGan);

  const movingPositions: number[] = [];
  const changedValues: number[] = [];
  yaoValues.forEach((v, i) => {
    const moving = v === 6 || v === 9;
    if (moving) movingPositions.push(i + 1);
    // 动则阴阳翻转：6(老阴)→7(少阳)，9(老阳)→8(少阴)；静则原值
    changedValues.push(moving ? (v === 6 ? 7 : 8) : v);
  });

  // 3. 本卦六爻
  const yaoList: BenYao[] = benNajia.map((nj, i) => {
    const position = i + 1;
    const v = yaoValues[i];
    const mpQin = LiuqinCalculator.calculate(benMeta.gongWuXing, nj.wuXing);
    return {
      position,
      yinYang: MP_YIN_YANG[NajiaYinYang(v)],
      moving: v === 6 || v === 9,
      liuShen: MP_LIU_SHEN[liuShenRaw[i]],
      gan: nj.gan,
      zhi: nj.zhi,
      wuXing: nj.wuXing,
      liuQin: MP_LIU_QIN[mpQin],
      shiYing: shiYingOf(position, benMeta),
    };
  });

  // 4. 变卦整盘（六亲恒用本卦宫五行）
  let bianMeta: GuaMeta | undefined;
  let bianYaoList: BianYao[] | undefined;
  if (movingPositions.length > 0) {
    const bg = getTrigramsFromValues(changedValues);
    bianMeta = withShouGua(getGuaMeta(bg.upper, bg.lower));
    const bianNajia = getFullNajia(bg.upper, bg.lower);
    bianYaoList = bianNajia.map((nj, i) => ({
      position: i + 1,
      moving: movingPositions.includes(i + 1),
      yinYang: MP_YIN_YANG[NajiaYinYang(changedValues[i] as YaoValue)],
      gan: nj.gan,
      zhi: nj.zhi,
      wuXing: nj.wuXing,
      // ⚠️ 头号红线：变卦六亲按本卦宫五行，不用 bianMeta.gongWuXing
      liuQin: MP_LIU_QIN[LiuqinCalculator.calculate(benMeta.gongWuXing, nj.wuXing)],
      shiYing: shiYingOf(i + 1, bianMeta!),
    }));
  }

  // 5. 伏神（mingpan 口径：只列不上卦的缺失六亲）
  const presentLiuQin = yaoList.map((y) => toMpQin(y.liuQin));
  const benNaJiaArg = yaoList.map((y) => ({ diZhi: y.zhi, wuXing: y.wuXing }));
  const fuRaw = FushenCalculator.calculate(
    benMeta.gongWuXing,
    toMpBagua(benMeta.gong),
    presentLiuQin as never,
    benNaJiaArg as never,
    sz.monthZhi,
    sz.dayZhi,
  );
  // 本宫首卦（八纯）全纳甲，用于伏神天干
  const shouNajia = getFullNajia(benMeta.gong, benMeta.gong);
  const fuShenList: FuShen[] = fuRaw.map((f) => {
    const idx = f.position - 1;
    const fei = yaoList[idx];
    const fuNj = shouNajia[idx];
    return {
      position: f.position,
      liuQin: MP_LIU_QIN[f.liuQin],
      gan: fuNj.gan,
      zhi: f.diZhi as FuShen['zhi'],
      wuXing: f.wuXing as WuXing,
      feiGan: fei.gan,
      feiZhi: fei.zhi,
      feiLiuQin: fei.liuQin,
      relation: MP_RELATION[f.relation] ?? toSimplified(f.relation),
    };
  });

  // 6. 神煞
  const shenSha = calcShenSha(sz.dayGan, sz.dayZhi, sz.monthZhi);

  // 7. 卦身（由世爻位置推算）
  const guaShen = calcGuaShen(benMeta.shiPosition);

  return {
    solar: {
      year: sz.year,
      month: sz.month,
      day: sz.day,
      hour: sz.hour,
      minute: sz.minute,
    },
    gender: input.gender ?? '男',
    question: input.question ?? '',
    siZhu: {
      yearGanZhi: sz.yearGanZhi,
      monthGanZhi: sz.monthGanZhi,
      dayGanZhi: sz.dayGanZhi,
      timeGanZhi: sz.timeGanZhi,
    },
    xunKong: sz.xunKong,
    benGua: benMeta,
    yaoList,
    bianGua: bianMeta,
    bianYaoList,
    movingPositions,
    fuShenList,
    shenSha,
    guaShen,
  };
}

/** 6/8 为阴，7/9 为阳（mingpan 繁体阴阳名） */
function NajiaYinYang(v: YaoValue): '陽' | '陰' {
  return v === 7 || v === 9 ? '陽' : '陰';
}

function toMpQin(q: LiuQin): string {
  return q === '子孙' ? '子孫' : q === '妻财' ? '妻財' : q;
}

function toMpBagua(g: BaGua): MpBaGua2 {
  const mp: Record<BaGua, MpBaGua2> = {
    乾: '乾', 兑: '兌', 离: '離', 震: '震',
    巽: '巽', 坎: '坎', 艮: '艮', 坤: '坤',
  };
  return mp[g];
}

function benGongWuXing(gong: BaGua): WuXing {
  const mp: Record<BaGua, WuXing> = {
    乾: '金', 兑: '金', 离: '火', 震: '木',
    巽: '木', 坎: '水', 艮: '土', 坤: '土',
  };
  return mp[gong];
}

/** 本宫首卦（八纯卦）整盘六爻，供格式化层"藏爻列"使用。
 *  八纯卦由两个相同经卦相重，三爻卦自下而上恒为 阳/阴/阳。 */
export interface ShouGuaYao {
  position: number;
  yinYang: '阴' | '阳';
  gan: TianGan;
  zhi: import('./types.js').DiZhi;
  wuXing: WuXing;
  liuQin: LiuQin;
  shiYing: ShiYing;
}

export function getShouGuaPan(gong: BaGua): { meta: GuaMeta; yaoList: ShouGuaYao[] } {
  const meta = withShouGua(getGuaMeta(gong, gong));
  const gx = benGongWuXing(gong);
  // 八纯首卦：上卦=下卦=本宫卦，六爻阴阳直接取经卦三爻表（下卦=初~三，上卦=四~上）
  const bits = BAGUA_BITS[gong];
  const yaoList: ShouGuaYao[] = getFullNajia(gong, gong).map((nj, i) => {
    const position = i + 1;
    return {
      position,
      yinYang: bits[i % 3] ? '阳' : '阴',
      gan: nj.gan,
      zhi: nj.zhi,
      wuXing: nj.wuXing,
      liuQin: MP_LIU_QIN[LiuqinCalculator.calculate(gx, nj.wuXing)],
      shiYing: shiYingOf(position, meta),
    };
  });
  return { meta, yaoList };
}

// 保持 NAJIA_GAN 在本模块的显式依赖说明（伏神天干表实际经 getFullNajia 使用）。
void NAJIA_GAN;
