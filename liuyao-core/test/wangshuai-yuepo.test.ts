/**
 * 月破与旺衰的关系（2026-10-30 董事长裁决·方案 A 回归）
 *
 * 裁决口径：
 *   1. 月破作为独立信号，保留既定权重（由 verdict 的 yuepo 规则计分，本层不涉及）
 *   2. 月破不自动把原本旺相的爻改判为休
 *   3. 旺衰仍依据月令五行关系判定
 *   4. 日破必须依照其自身适用条件判定，不得仅凭月破造成的人工降态触发
 *   5. 暗动与日破的互斥关系，必须依据实际旺衰状态执行
 *
 * 原典：
 *   《增删卜易·月建章》「爻之强旺者能冲之克之、刑之、破之，旺而亦衰」
 *                       「爻逢月破而无功」「月建冲爻即为月破，乃无用之爻也」
 *   《增删卜易·占病章》「若值月破须看用神之衰旺，旺则愈于实破之日及出月而愈」
 *   《增删卜易·日辰章》「冲旺相之静爻，既为暗动，冲衰弱之静爻为日破」
 *   《增删卜易·暗动章》「静爻旺相日辰冲之为暗动，静爻休囚日辰冲之为破」
 *   《增删卜易·六冲章》「休囚而遇日冲谓之日破」
 */
import { describe, expect, it } from 'vitest';
import { evalYao } from '../src/wangshuai.js';
import { ZHI_WUXING } from '../src/constants.js';
import type { DiZhi } from '../src/types.js';

const XK: [DiZhi, DiZhi] = ['戌', '亥'];
function st(zhi: DiZhi, monthZhi: DiZhi, dayZhi: DiZhi, moving = false) {
  return evalYao({
    zhi, wuXing: ZHI_WUXING[zhi], moving,
    monthZhi, dayZhi, xunKong: XK,
  });
}

describe('月破不改写本判旺衰（方案 A）', () => {
  it('未月丑土：比和本判为旺，月破后仍为旺（不压为休）', () => {
    const s = st('丑', '未', '子');
    expect(s.yuePo).toBe(true);
    expect(s.lingTai).toBe('旺');
    expect(s.tags).toContain('旺于月');
    expect(s.tags).toContain('月破');
    expect(s.tags).not.toContain('月破（失气）');
  });

  it('辰月戌土：比和本判为旺，月破后仍为旺', () => {
    const s = st('戌', '辰', '子');
    expect(s.yuePo).toBe(true);
    expect(s.lingTai).toBe('旺');
  });

  it('子月午火：月克爻本判为死，月破后仍为死', () => {
    const s = st('午', '子', '丑');
    expect(s.yuePo).toBe(true);
    expect(s.lingTai).toBe('死');
  });

  it('寅月申金：爻克月本判为囚，月破后仍为囚', () => {
    const s = st('申', '寅', '丑');
    expect(s.yuePo).toBe(true);
    expect(s.lingTai).toBe('囚');
  });

  it('巳月亥水：爻克月本判为囚，月破后仍为囚', () => {
    const s = st('亥', '巳', '丑');
    expect(s.yuePo).toBe(true);
    expect(s.lingTai).toBe('囚');
  });

  it('非月破的旺相爻不受影响（对照组）', () => {
    const s = st('丑', '辰', '子'); // 辰月丑土比和→旺，丑辰不冲
    expect(s.yuePo).toBe(false);
    expect(s.lingTai).toBe('旺');
  });
});

describe('月破爻的旺衰取值域：「相」「休」不可达', () => {
  // 六对相冲地支，五行关系只有比和（辰戌/丑未）与相克（子午/巳亥/寅申/卯酉）两种，
  // 因此月破爻的本判旺衰只能是 旺/囚/死。
  const PAIRS: Array<[DiZhi, DiZhi]> = [
    ['子', '午'], ['丑', '未'], ['寅', '申'], ['卯', '酉'], ['辰', '戌'], ['巳', '亥'],
  ];
  const seen = new Set<string>();
  for (const [m, y] of PAIRS) {
    seen.add(st(y, m, '子').lingTai);   // 月支 m、爻支 y（相冲）
    seen.add(st(m, y, '子').lingTai);   // 反向
  }
  it('六对相冲正反 12 组，只出现 旺/囚/死', () => {
    expect([...seen].sort()).toEqual(['囚', '旺', '死']);
  });
  it('不出现「相」', () => {
    expect(seen.has('相')).toBe(false);
  });
  it('不出现「休」', () => {
    expect(seen.has('休')).toBe(false);
  });
});

describe('日冲的暗动/日破依本判旺衰判定', () => {
  it('月破+旺+日冲：判暗动，不判日破（方案 A 核心回归）', () => {
    const s = st('丑', '未', '未'); // 未月丑土旺、丑未双冲
    expect(s.yuePo).toBe(true);
    expect(s.lingTai).toBe('旺');
    expect(s.riChong).toBe(true);
    expect(s.anDong).toBe(true);
    expect(s.riPo).toBe(false);
    expect(s.tags).toContain('暗动');
  });

  it('月破+死+日冲：判日破', () => {
    const s = st('午', '子', '子'); // 子月午火死、子午双冲
    expect(s.yuePo).toBe(true);
    expect(s.lingTai).toBe('死');
    expect(s.riPo).toBe(true);
    expect(s.anDong).toBe(false);
  });

  it('相+日冲：判暗动（相与旺同等，不因月破压相）', () => {
    // 卯月午火：木生火→相；子日冲午
    const s = st('午', '卯', '子');
    expect(s.yuePo).toBe(false);
    expect(s.lingTai).toBe('相');
    expect(s.riChong).toBe(true);
    expect(s.anDong).toBe(true);
    expect(s.riPo).toBe(false);
  });

  it('休+日冲：判日破（2026-10-28 批复③，休态归日破）', () => {
    // 寅月亥水：水生木→休；巳日冲亥
    const s = st('亥', '寅', '巳');
    expect(s.lingTai).toBe('休');
    expect(s.riChong).toBe(true);
    expect(s.riPo).toBe(true);
    expect(s.anDong).toBe(false);
    expect(s.tags).toContain('日破');
  });

  it('囚+日冲：判日破', () => {
    // 寅月申金：金克木→囚；寅日冲申
    const s = st('申', '寅', '寅');
    expect(s.lingTai).toBe('囚');
    expect(s.riPo).toBe(true);
  });

  it('动爻被日冲不判暗动/日破（动不为静）', () => {
    const s = st('丑', '未', '未', true);
    expect(s.riChong).toBe(false);
    expect(s.anDong).toBe(false);
    expect(s.riPo).toBe(false);
  });

  it('旺而无日冲：暗动日破皆不成立', () => {
    const s = st('丑', '未', '子');
    expect(s.riChong).toBe(false);
    expect(s.anDong).toBe(false);
    expect(s.riPo).toBe(false);
  });
});
