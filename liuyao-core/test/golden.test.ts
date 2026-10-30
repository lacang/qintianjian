/**
 * 验收 1：三个金标准盘逐字段一致。
 * 金标准来源：对标素材/标准卦例01、02-03（人工用「六爻排盘」App 排盘抄录）。
 */
import { describe, expect, it } from 'vitest';
import { castManual, paipan } from '../src/index.js';
import type { Pan } from '../src/types.js';

const GE_TIME = { year: 2026, month: 10, day: 18, hour: 2, minute: 46 };
const FENG_TIME = { year: 2026, month: 10, day: 18, hour: 4, minute: 6 };
const TAI_TIME = { year: 2026, month: 10, day: 18, hour: 4, minute: 5 };

/** 泽火革：下离（阳阴阳）上兑（阴阳阴），三/四/上动 */
function gePan(): Pan {
  return paipan({
    yaoValues: castManual([
      { yinYang: '阳' }, { yinYang: '阴' }, { yinYang: '阳', moving: true },
      { yinYang: '阳', moving: true }, { yinYang: '阳' }, { yinYang: '阴', moving: true },
    ]),
    ...GE_TIME,
  });
}

/** 雷火丰：下离（阳阴阳）上震（阴阴阳），静 */
function fengPan(): Pan {
  return paipan({
    yaoValues: castManual([
      { yinYang: '阳' }, { yinYang: '阴' }, { yinYang: '阳' },
      { yinYang: '阳' }, { yinYang: '阴' }, { yinYang: '阴' },
    ]),
    ...FENG_TIME,
  });
}

/** 地天泰：下乾（阳阳阳）上坤（阴阴阴），静，六合 */
function taiPan(): Pan {
  return paipan({
    yaoValues: castManual([
      { yinYang: '阳' }, { yinYang: '阳' }, { yinYang: '阳' },
      { yinYang: '阴' }, { yinYang: '阴' }, { yinYang: '阴' },
    ]),
    ...TAI_TIME,
  });
}

describe('金标准 01：泽火革 之风雷益（2026-10-18 02:46）', () => {
  const pan = gePan();

  it('四柱与旬空', () => {
    expect(pan.siZhu).toEqual({
      yearGanZhi: '丙午',
      monthGanZhi: '戊戌',
      dayGanZhi: '乙丑',
      timeGanZhi: '丁丑',
    });
    expect(pan.xunKong).toEqual(['戌', '亥']);
  });

  it('本卦：泽火革 坎宫四世应初', () => {
    expect(pan.benGua.name).toBe('泽火革');
    expect(pan.benGua.gong).toBe('坎');
    expect(pan.benGua.upper).toBe('兑');
    expect(pan.benGua.lower).toBe('离');
    expect(pan.benGua.shiPosition).toBe(4);
    expect(pan.benGua.yingPosition).toBe(1);
    expect(pan.benGua.isBaChun).toBe(false);
  });

  it('六爻本卦六亲纳甲/六神/世应（自下而上）', () => {
    const rows = pan.yaoList.map((y) => ({
      p: y.position,
      s: y.liuShen,
      q: y.liuQin,
      gz: y.gan + y.zhi,
      wx: y.wuXing,
      yy: y.yinYang,
      d: y.moving,
      sy: y.shiYing ?? null,
    }));
    expect(rows).toEqual([
      { p: 1, s: '青龙', q: '子孙', gz: '己卯', wx: '木', yy: '阳', d: false, sy: '应' },
      { p: 2, s: '朱雀', q: '官鬼', gz: '己丑', wx: '土', yy: '阴', d: false, sy: null },
      { p: 3, s: '勾陈', q: '兄弟', gz: '己亥', wx: '水', yy: '阳', d: true, sy: null },
      { p: 4, s: '螣蛇', q: '兄弟', gz: '丁亥', wx: '水', yy: '阳', d: true, sy: '世' },
      { p: 5, s: '白虎', q: '父母', gz: '丁酉', wx: '金', yy: '阳', d: false, sy: null },
      { p: 6, s: '玄武', q: '官鬼', gz: '丁未', wx: '土', yy: '阴', d: true, sy: null },
    ]);
  });

  it('伏神：妻财戊午火 伏三爻飞神己亥水（飞克伏）', () => {
    expect(pan.fuShenList).toHaveLength(1);
    const f = pan.fuShenList[0];
    expect(f.position).toBe(3);
    expect(f.liuQin).toBe('妻财');
    expect(f.gan + f.zhi).toBe('戊午');
    expect(f.wuXing).toBe('火');
    expect(f.feiGan + f.feiZhi).toBe('己亥');
    expect(f.feiLiuQin).toBe('兄弟');
    expect(f.relation).toBe('飞克伏');
  });

  it('变卦：风雷益 巽宫三世应上', () => {
    expect(pan.bianGua).toBeDefined();
    expect(pan.bianGua!.name).toBe('风雷益');
    expect(pan.bianGua!.gong).toBe('巽');
    expect(pan.bianGua!.upper).toBe('巽');
    expect(pan.bianGua!.lower).toBe('震');
    expect(pan.bianGua!.shiPosition).toBe(3);
    expect(pan.bianGua!.yingPosition).toBe(6);
  });

  it('变卦六亲恒按本卦宫（坎水），纳甲逐爻', () => {
    const rows = pan.bianYaoList!.map((y) => ({
      p: y.position,
      q: y.liuQin, // 必须按坎宫水
      gz: y.gan + y.zhi,
      yy: y.yinYang,
      d: y.moving,
      sy: y.shiYing ?? null,
    }));
    expect(rows).toEqual([
      { p: 1, q: '兄弟', gz: '庚子', yy: '阳', d: false, sy: null },
      { p: 2, q: '子孙', gz: '庚寅', yy: '阴', d: false, sy: null },
      { p: 3, q: '官鬼', gz: '庚辰', yy: '阴', d: true, sy: '世' },
      { p: 4, q: '官鬼', gz: '辛未', yy: '阴', d: true, sy: null },
      { p: 5, q: '妻财', gz: '辛巳', yy: '阳', d: false, sy: null },
      { p: 6, q: '子孙', gz: '辛卯', yy: '阳', d: true, sy: '应' },
    ]);
  });
});

describe('金标准 02：雷火丰 静卦（2026-10-18 04:06）', () => {
  const pan = fengPan();

  it('四柱（戊寅时）与旬空', () => {
    expect(pan.siZhu).toEqual({
      yearGanZhi: '丙午', monthGanZhi: '戊戌', dayGanZhi: '乙丑', timeGanZhi: '戊寅',
    });
    expect(pan.xunKong).toEqual(['戌', '亥']);
  });

  it('本卦：雷火丰 坎宫五世卦（非归魂） 世五应二', () => {
    expect(pan.benGua.name).toBe('雷火丰');
    expect(pan.benGua.gong).toBe('坎');
    expect(pan.benGua.upper).toBe('震');
    expect(pan.benGua.lower).toBe('离');
    // 雷火丰是坎宫第六卦（五世卦），归魂是第八卦地水师；见《增删卜易·归魂游魂章》
    expect(pan.benGua.isGuiHun).toBe(false);
    expect(pan.benGua.isYouHun).toBe(false);
    expect(pan.benGua.shiPosition).toBe(5);
    expect(pan.benGua.yingPosition).toBe(2);
  });

  it('静卦无变卦、无伏神（妻财午火在卦）', () => {
    expect(pan.bianGua).toBeUndefined();
    expect(pan.bianYaoList).toBeUndefined();
    expect(pan.fuShenList).toHaveLength(0);
  });

  it('六爻六亲纳甲/世应', () => {
    const rows = pan.yaoList.map((y) => ({
      p: y.position, q: y.liuQin, gz: y.gan + y.zhi, yy: y.yinYang, sy: y.shiYing ?? null,
    }));
    expect(rows).toEqual([
      { p: 1, q: '子孙', gz: '己卯', yy: '阳', sy: null },
      { p: 2, q: '官鬼', gz: '己丑', yy: '阴', sy: '应' },
      { p: 3, q: '兄弟', gz: '己亥', yy: '阳', sy: null },
      { p: 4, q: '妻财', gz: '庚午', yy: '阳', sy: null },
      { p: 5, q: '父母', gz: '庚申', yy: '阴', sy: '世' },
      { p: 6, q: '官鬼', gz: '庚戌', yy: '阴', sy: null },
    ]);
  });

  it('神煞 14 项（乙丑日/戊戌月）与 App 金标准一致', () => {
    expect(pan.shenSha).toEqual({
      yiMa: '亥',
      taoHua: '午',
      riLu: '卯',
      guiRen: ['子', '申'],
      wenChang: '午',
      yangRen: '寅',
      jiangXing: '酉',
      mouXing: '未',
      jieSha: '寅',
      zaiSha: '卯',
      huaGai: '丑',
      riDe: '申',
      tianMa: '戌',
      tianYi: '酉',
    });
  });
});

describe('金标准 03：地天泰 六合静卦（2026-10-18 04:05）', () => {
  const pan = taiPan();

  it('四柱（戊寅时）', () => {
    expect(pan.siZhu.timeGanZhi).toBe('戊寅');
    expect(pan.xunKong).toEqual(['戌', '亥']);
  });

  it('本卦：地天泰 坤宫 六合 世三应上', () => {
    expect(pan.benGua.name).toBe('地天泰');
    expect(pan.benGua.gong).toBe('坤');
    expect(pan.benGua.upper).toBe('坤');
    expect(pan.benGua.lower).toBe('乾');
    expect(pan.benGua.specialType).toBe('六合');
    expect(pan.benGua.shiPosition).toBe(3);
    expect(pan.benGua.yingPosition).toBe(6);
    expect(pan.bianGua).toBeUndefined();
  });
});
