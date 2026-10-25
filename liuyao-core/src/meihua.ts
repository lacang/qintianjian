/**
 * 梅花易数模块（排盘事实层，不做体用生克吉凶推断）
 *
 * 在 timecast.ts 的时间起卦之上，补齐梅花易数的卦局结构：
 *   本卦（体/用）、互卦、变卦，以及各自的八卦五行与动爻。
 *
 * 约定：
 * - 动爻所在的三爻卦为「用」，另一卦为「体」（梅花定则）。
 * - 互卦：本卦 2/3/4 爻为下互，3/4/5 爻为上互（自下而上，index 1,2,3 / 2,3,4）。
 * - 变卦：本卦仅动爻阴阳翻转后重组成卦。
 * - 八卦五行：乾兑金、震巽木、坎水、离火、艮坤土。
 * - 本模块只排出结构与五行归属；生克比和、旺衰、吉凶属解卦层，不做。
 */
import type { BaGua, WuXing } from './types.js';
import { getGuaMeta } from './guaTable.js';
import { castByTime, toApparentSolarTime, type TimeCastOptions, type TimeCastResult } from './timecast.js';
import type { YaoValue } from './types.js';

const NUM_BAGUA: BaGua[] = ['乾', '兑', '离', '震', '巽', '坎', '艮', '坤']; // 先天数 1..8

export const BAGUA_WUXING: Record<BaGua, WuXing> = {
  乾: '金', 兑: '金', 离: '火', 震: '木',
  巽: '木', 坎: '水', 艮: '土', 坤: '土',
};

// 先天数 → 三爻（index0=初爻；true 阳）
const LINES: Record<number, boolean[]> = {
  1: [true, true, true],
  2: [true, true, false],
  3: [true, false, true],
  4: [true, false, false],
  5: [false, true, true],
  6: [false, true, false],
  7: [false, false, true],
  8: [false, false, false],
};

export interface Trigram {
  gua: BaGua;
  number: number; // 先天数
  wuXing: WuXing;
}

export interface HexagramInfo {
  name: string; // 六爻简体全名（如「泽火革」）
  upper: Trigram;
  lower: Trigram;
}

export interface MeiHuaResult {
  benGua: HexagramInfo;
  huGua: HexagramInfo;
  bianGua: HexagramInfo;
  /** 体卦（不动者） */
  ti: Trigram;
  /** 用卦（含动爻者） */
  yong: Trigram;
  movingPosition: number; // 1-6，自下而上
  /** 六爻值（自下而上，6/7/8/9），可直接喂 paipan 装六爻盘 */
  yaoValues: YaoValue[];
  /** 动爻在上卦还是下卦 */
  movingSide: 'upper' | 'lower';
  /** 时间起卦的原始分解（数字起卦时缺省为 null） */
  timeDetail: TimeCastResult | null;
}

function numToTrigram(n: number): Trigram {
  const num = ((n - 1) % 8 + 8) % 8 + 1; // 归一到 1..8
  const gua = NUM_BAGUA[num - 1];
  return { gua, number: num, wuXing: BAGUA_WUXING[gua] };
}

function trigramOfLines(lines: boolean[]): Trigram {
  for (let n = 1; n <= 8; n++) {
    const l = LINES[n];
    if (l[0] === lines[0] && l[1] === lines[1] && l[2] === lines[2]) return numToTrigram(n);
  }
  throw new Error('无法识别经卦爻形');
}

function makeHex(upperNum: number, lowerNum: number): HexagramInfo {
  const upper = numToTrigram(upperNum);
  const lower = numToTrigram(lowerNum);
  return { name: getGuaMeta(upper.gua, lower.gua).name, upper, lower };
}

function build(upperNum: number, lowerNum: number, moving: number, timeDetail: TimeCastResult | null): MeiHuaResult {
  const yaoValues = valuesFrom(upperNum, lowerNum, moving);

  // 六爻布尔（自下而上）
  const lowerLines = LINES[lowerNum];
  const upperLines = LINES[upperNum];
  const all = [...lowerLines, ...upperLines];

  // 互卦：下互=index1,2,3；上互=index2,3,4
  const huLower = trigramOfLines([all[1], all[2], all[3]]);
  const huUpper = trigramOfLines([all[2], all[3], all[4]]);
  const huName = getGuaMeta(huUpper.gua, huLower.gua).name;

  // 变卦：动爻翻转
  const changed = all.map((v, i) => (i + 1 === moving ? !v : v));
  const bianLower = trigramOfLines(changed.slice(0, 3));
  const bianUpper = trigramOfLines(changed.slice(3, 6));
  const bianName = getGuaMeta(bianUpper.gua, bianLower.gua).name;

  const movingSide: 'upper' | 'lower' = moving >= 4 ? 'upper' : 'lower';
  const ti = movingSide === 'upper' ? numToTrigram(lowerNum) : numToTrigram(upperNum);
  const yong = movingSide === 'upper' ? numToTrigram(upperNum) : numToTrigram(lowerNum);

  return {
    benGua: makeHex(upperNum, lowerNum),
    huGua: { name: huName, upper: huUpper, lower: huLower },
    bianGua: { name: bianName, upper: bianUpper, lower: bianLower },
    ti,
    yong,
    movingPosition: moving,
    yaoValues,
    movingSide,
    timeDetail,
  };
}

function valuesFrom(upperNum: number, lowerNum: number, moving: number): YaoValue[] {
  const lines = [...LINES[lowerNum], ...LINES[upperNum]];
  return lines.map((isYang, i) => {
    const isMoving = i + 1 === moving;
    if (isYang) return (isMoving ? 9 : 7) as YaoValue;
    return (isMoving ? 6 : 8) as YaoValue;
  });
}

/**
 * 梅花·时间起卦（本项目钦天监首页卦钟同源），返回完整梅花卦局。
 */
export function meiHuaByTime(dateInput: number | Date, options: TimeCastOptions = {}): MeiHuaResult {
  const r = castByTime(dateInput, options);
  return build(r.upperNumber, r.lowerNumber, r.movingPosition, r);
}

/**
 * 梅花·双数起卦（报两个数 / 物数 + 时辰等可由调用方折算后传入）：
 *   上卦 = a % 8，下卦 = b % 8，动爻 = (a+b) % 6；余 0 取 8 / 6。
 * 单数/字数起卦需结合当时时辰序数，请直接用 meiHuaByTime。
 */
export function meiHuaByNumbers(a: number, b: number): MeiHuaResult {
  const norm8 = (n: number) => (n % 8 === 0 ? 8 : ((n - 1) % 8 + 8) % 8 + 1);
  const norm6 = (n: number) => (n % 6 === 0 ? 6 : ((n - 1) % 6 + 6) % 6 + 1);
  const upperNum = norm8(a);
  const lowerNum = norm8(b);
  const moving = norm6(a + b);
  return build(upperNum, lowerNum, moving, null);
}

export { toApparentSolarTime };
