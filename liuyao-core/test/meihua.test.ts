import { describe, it, expect } from 'vitest';
import { meiHuaByTime, meiHuaByNumbers } from '../src/meihua.js';

describe('梅花易数 meiHuaByTime', () => {
  it('2026-10-18 04:06 = 天雷无妄，四爻动；互风山渐，变风雷益；体震木用乾金', () => {
    const mh = meiHuaByTime(new Date(2026, 9, 18, 4, 6, 0));
    expect(mh.benGua.name).toBe('天雷无妄');
    expect(mh.benGua.upper.gua).toBe('乾');
    expect(mh.benGua.lower.gua).toBe('震');
    expect(mh.movingPosition).toBe(4);
    expect(mh.movingSide).toBe('upper');
    // 互卦：下互 234 爻、上互 345 爻
    expect(mh.huGua.name).toBe('风山渐');
    expect(mh.huGua.upper.gua).toBe('巽');
    expect(mh.huGua.lower.gua).toBe('艮');
    // 变卦：四爻动，乾→巽
    expect(mh.bianGua.name).toBe('风雷益');
    expect(mh.bianGua.upper.gua).toBe('巽');
    // 体用：动在上卦，上为用、下为体
    expect(mh.ti.gua).toBe('震');
    expect(mh.ti.wuXing).toBe('木');
    expect(mh.yong.gua).toBe('乾');
    expect(mh.yong.wuXing).toBe('金');
  });

  it('02:46 丁丑时 = 天火同人，三爻动（动在下卦，体上乾、用下离）', () => {
    const mh = meiHuaByTime(new Date(2026, 9, 18, 2, 46, 0));
    expect(mh.benGua.name).toBe('天火同人');
    expect(mh.movingPosition).toBe(3);
    expect(mh.movingSide).toBe('lower');
    expect(mh.ti.gua).toBe('乾');
    expect(mh.yong.gua).toBe('离');
    expect(mh.bianGua.name).toBe('天雷无妄'); // 离初爻不变、三爻阳动变阴→震
  });

  it('yaoValues 可直接喂 paipan（与 timecast/六爻口径一致）', () => {
    const mh = meiHuaByTime(new Date(2026, 9, 18, 4, 6, 0));
    expect(mh.yaoValues).toHaveLength(6);
    expect(mh.yaoValues.join(',')).toBe('7,8,8,9,7,7');
  });
});

describe('梅花易数 meiHuaByNumbers', () => {
  it('(8,8)：上坤下坤 坤为地，动爻(16%6=4)，变雷地豫', () => {
    const mh = meiHuaByNumbers(8, 8);
    expect(mh.benGua.name).toBe('坤为地');
    expect(mh.movingPosition).toBe(4);
    expect(mh.bianGua.name).toBe('雷地豫'); // 上坤四爻阳变→震
    expect(mh.ti.gua).toBe('坤');
    expect(mh.yong.gua).toBe('坤');
  });

  it('余0取8/6：(1,7) 上乾下艮，动(8%6=2)', () => {
    const mh = meiHuaByNumbers(1, 7);
    expect(mh.benGua.upper.gua).toBe('乾');
    expect(mh.benGua.lower.gua).toBe('艮');
    expect(mh.movingPosition).toBe(2);
  });
});
