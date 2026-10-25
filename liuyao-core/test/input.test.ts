/**
 * 验收 5：三种成卦入口（手录 / 摇铜钱 / 天机随机）。
 */
import { describe, expect, it } from 'vitest';
import { castCoins, castManual, castTianji, paipan } from '../src/index.js';

describe('(a) castManual 手录六爻', () => {
  it('阳静=7 阴静=8 阳动=9 阴动=6，自下而上', () => {
    const r = castManual([
      { yinYang: '阳' }, { yinYang: '阴' }, { yinYang: '阳', moving: true },
      { yinYang: '阳', moving: true }, { yinYang: '阳' }, { yinYang: '阴', moving: true },
    ]);
    expect(r.yaoValues).toEqual([7, 8, 9, 9, 7, 6]);
    expect(r.movingPositions).toEqual([3, 4, 6]);
    expect(r.source).toBe('manual');
  });

  it('必须恰好 6 爻', () => {
    expect(() => castManual([{ yinYang: '阳' }])).toThrow();
  });

  it('手录革盘可直接进 paipan', () => {
    const pan = paipan({
      yaoValues: castManual([
        { yinYang: '阳' }, { yinYang: '阴' }, { yinYang: '阳', moving: true },
        { yinYang: '阳', moving: true }, { yinYang: '阳' }, { yinYang: '阴', moving: true },
      ]),
      year: 2026, month: 10, day: 18, hour: 2, minute: 46,
    });
    expect(pan.benGua.name).toBe('泽火革');
    expect(pan.bianGua!.name).toBe('风雷益');
  });
});

describe('(b) castCoins 摇铜钱', () => {
  it('背数 0/1/2/3 → 老阴6/少阳7/少阴8/老阳9', () => {
    // 每次三枚（1=背 0=字面）；前四掷覆盖四象，后两掷补足 6 掷
    const r = castCoins([
      [0, 0, 0], [1, 0, 0], [1, 1, 0], [1, 1, 1], [1, 0, 0], [1, 0, 0],
    ]);
    expect(r.yaoValues[0]).toBe(6);
    expect(r.yaoValues[1]).toBe(7);
    expect(r.yaoValues[2]).toBe(8);
    expect(r.yaoValues[3]).toBe(9);
  });

  it('全三背（老阳）三个动爻', () => {
    const r = castCoins([
      [1, 1, 1], [0, 0, 0], [1, 1, 1], [0, 0, 0], [1, 1, 1], [0, 0, 0],
    ]);
    expect(r.yaoValues).toEqual([9, 6, 9, 6, 9, 6]);
    expect(r.movingPositions).toEqual([1, 2, 3, 4, 5, 6]);
    expect(r.source).toBe('coins');
  });

  it('必须恰好 6 掷', () => {
    expect(() => castCoins([])).toThrow();
  });

  it('静卦（无三字/三背）可装盘且无变卦', () => {
    const pan = paipan({
      yaoValues: castCoins([
        [1, 0, 0], [1, 1, 0], [1, 0, 0],
        [1, 0, 0], [1, 1, 0], [1, 1, 0],
      ]),
      year: 2026, month: 10, day: 18, hour: 4, minute: 6,
    });
    expect(pan.benGua.name).toBe('雷火丰');
    expect(pan.bianGua).toBeUndefined();
  });
});

describe('(c) castTianji 天机随机（种子可复现）', () => {
  it('同种子两次结果完全一致', () => {
    const a = castTianji(1760726760000);
    const b = castTianji(1760726760000);
    expect(a).toEqual(b);
    expect(a.source).toBe('tianji');
  });

  it('不同种子大概率不同', () => {
    const a = castTianji(1);
    const b = castTianji(2);
    expect(a.yaoValues).not.toEqual(b.yaoValues);
  });

  it('结果合法（6 个 6/7/8/9，动爻数 0~6）', () => {
    for (let seed = 0; seed < 200; seed++) {
      const r = castTianji(seed);
      expect(r.yaoValues).toHaveLength(6);
      for (const v of r.yaoValues) expect([6, 7, 8, 9]).toContain(v);
      expect(r.movingPositions.length).toBeGreaterThanOrEqual(0);
      expect(r.movingPositions.length).toBeLessThanOrEqual(6);
      expect(r.movingPositions.every((p) => p >= 1 && p <= 6)).toBe(true);
    }
  });

  it('随机盘可以装盘且本/变卦合法', () => {
    const r = castTianji(42);
    const pan = paipan({
      yaoValues: r,
      year: 2026, month: 10, day: 18, hour: 12, minute: 0,
    });
    expect(pan.benGua.name.length).toBeGreaterThan(0);
    if (r.movingPositions.length > 0) {
      expect(pan.bianGua).toBeDefined();
      expect(pan.bianYaoList!.filter((y) => y.moving)).toHaveLength(r.movingPositions.length);
    } else {
      expect(pan.bianGua).toBeUndefined();
    }
  });
});
