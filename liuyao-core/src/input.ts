/**
 * 成卦输入层：三种入口统一产出 yaoValues（6/7/8/9，自下而上）
 *
 * 爻值约定（京房钱法通行口径）：
 * - 7 少阳（一背两字，阳爻静）
 * - 8 少阴（两背一字，阴爻静）
 * - 9 老阳（三背，阳爻动）
 * - 6 老阴（三字，阴爻动）
 * 注：tsumugi 的 yangs（0老阴/1少阳/2少阴/3老阳）即"背数"，与本文件一致。
 */
import type { CastResult, ManualYao, YaoValue } from './types.js';

export function normalizeValuesToCast(values: number[], source: CastResult['source']): CastResult {
  return normalize(values, source);
}

function normalize(values: number[], source: CastResult['source']): CastResult {
  if (values.length !== 6) {
    throw new Error(`成卦必须恰好 6 爻，收到 ${values.length} 爻`);
  }
  for (const v of values) {
    if (v !== 6 && v !== 7 && v !== 8 && v !== 9) {
      throw new Error(`非法爻值 ${v}，只允许 6/7/8/9`);
    }
  }
  const yaoValues = values as YaoValue[] as CastResult['yaoValues'];
  const movingPositions = yaoValues
    .map((v, i) => ((v === 6 || v === 9) ? i + 1 : -1))
    .filter((p) => p > 0);
  return { yaoValues, movingPositions, source };
}

/** (a) 手录六爻：自下而上，每爻指定阴阳与是否动 */
export function castManual(yaos: ManualYao[]): CastResult {
  if (yaos.length !== 6) {
    throw new Error(`手录必须恰好 6 爻，收到 ${yaos.length} 爻`);
  }
  return normalize(
    yaos.map((y) => {
      const moving = y.moving ?? false;
      if (y.yinYang === '阳') return moving ? 9 : 7;
      return moving ? 6 : 8;
    }),
    'manual',
  );
}

/**
 * (b) 摇铜钱：6 次，每次三枚铜钱的"背"数（0 字面 / 1 背）。
 * 背数合计 0=老阴(动)、1=少阳、2=少阴、3=老阳(动)。
 */
export function castCoins(tosses: ReadonlyArray<readonly [0 | 1, 0 | 1, 0 | 1]>): CastResult {
  if (tosses.length !== 6) {
    throw new Error(`摇铜钱必须恰好 6 次，收到 ${tosses.length} 次`);
  }
  const YANGS_TO_VALUE: YaoValue[] = [6, 7, 8, 9];
  return normalize(
    tosses.map((coins) => {
      const backs = coins[0] + coins[1] + coins[2];
      return YANGS_TO_VALUE[backs];
    }),
    'coins',
  );
}

/**
 * Mulberry32 —— 极小确定性 PRNG（公共领域常见实现）。
 * 天机起卦只用其"可复现的均匀随机"，不承担安全随机用途。
 */
function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function hashSeed(seed: number): number {
  // 时间戳可能很大（毫秒），做一次 mix 避免连续时间种子落在 PRNG 相邻轨道。
  let h = seed >>> 0;
  h = Math.imul(h ^ (h >>> 16), 0x85ebca6b);
  h = Math.imul(h ^ (h >>> 13), 0xc2b2ae35);
  return (h ^ (h >>> 16)) >>> 0;
}

/**
 * (c) 天机随机：以传入时间戳（或任意整数种子）做随机种子，
 * 产出 6 爻（动爻数 0~6 个）。同一种子结果完全可复现。
 *
 * 每爻先按四象均匀（6/7/8/9 各 25%）。调用方若希望限制动爻数可自行重投，
 * 本函数不做人为干预（金标准未限定天机起卦的动爻概率分布，均匀最中立）。
 */
export function castTianji(seedInput: number | Date): CastResult {
  const ts = typeof seedInput === 'number' ? seedInput : seedInput.getTime();
  if (!Number.isFinite(ts)) {
    throw new Error('天机起卦需要有效的时间戳或 Date');
  }
  const rand = mulberry32(hashSeed(Math.trunc(ts)));
  const table: YaoValue[] = [7, 8, 9, 6]; // 少阳/少阴/老阳/老阴
  return normalize(
    Array.from({ length: 6 }, () => table[Math.floor(rand() * 4)]),
    'tianji',
  );
}
