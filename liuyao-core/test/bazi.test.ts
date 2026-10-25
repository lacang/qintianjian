import { describe, it, expect } from 'vitest';
import { paiBazi, tenGod } from '../src/bazi.js';

// 主人本人：1994-08-01 11:45 沈阳（这里按北京时间分量测历算；真太阳时在上层）
const bz = paiBazi({ year: 1994, month: 8, day: 1, hour: 11, minute: 45, gender: '男' });

describe('八字 paiBazi · 本人命盘', () => {
  it('四柱 = 甲戌 / 辛未 / 己未 / 庚午', () => {
    expect(bz.year.ganZhi).toBe('甲戌');
    expect(bz.month.ganZhi).toBe('辛未');
    expect(bz.day.ganZhi).toBe('己未');
    expect(bz.time.ganZhi).toBe('庚午');
  });

  it('日主己土，日空亡子丑', () => {
    expect(bz.dayMaster).toBe('己');
    expect(bz.dayMasterWuXing).toBe('土');
    expect(bz.xunKong).toEqual(['子', '丑']);
  });

  it('天干十神：年甲正官、月辛食神、时庚伤官', () => {
    expect(bz.year.ganTenGod).toBe('正官');
    expect(bz.month.ganTenGod).toBe('食神');
    expect(bz.time.ganTenGod).toBe('伤官');
  });

  it('地支藏干十神（未=己比肩/丁偏印/乙七杀；午=丁偏印/己比肩）', () => {
    const dayHide = bz.day.hidden.map((h) => h.gan + h.tenGod);
    expect(dayHide).toEqual(['己比肩', '丁偏印', '乙七杀']);
    const timeHide = bz.time.hidden.map((h) => h.gan + h.tenGod);
    expect(timeHide).toEqual(['丁偏印', '己比肩']);
    expect(bz.day.hidden[0].role).toBe('本气');
  });

  it('纳音 山头火/路旁土/天上火/路旁土', () => {
    expect(bz.year.naYin).toBe('山头火');
    expect(bz.month.naYin).toBe('路旁土');
    expect(bz.day.naYin).toBe('天上火');
    expect(bz.time.naYin).toBe('路旁土');
  });

  it('胎元壬戌、命宫戊辰、身宫丙寅', () => {
    expect(bz.taiYuan).toBe('壬戌');
    expect(bz.mingGong).toBe('戊辰');
    expect(bz.shenGong).toBe('丙寅');
  });

  it('五行统计（含藏干）：此盘水=0（缺水）', () => {
    expect(bz.wuXingCount['水']).toBe(0);
    expect(bz.wuXingCount['土']).toBe(5);
  });

  it('大运阳男顺行，2岁起运，1996起壬申、2026入乙亥', () => {
    expect(bz.daYun.direction).toBe('顺行');
    expect(bz.daYun.list[0].ganZhi).toBe('壬申');
    expect(bz.daYun.list[0].startYear).toBe(1996);
    const yiHai = bz.daYun.list.find((d) => d.ganZhi === '乙亥')!;
    expect(yiHai.startYear).toBe(2026);
    expect(yiHai.startAge).toBe(33);
  });
});

describe('十神 tenGod 单元', () => {
  it('以己（阴土）为我', () => {
    expect(tenGod('己', '己')).toBe('比肩');
    expect(tenGod('己', '戊')).toBe('劫财');
    expect(tenGod('己', '甲')).toBe('正官'); // 甲木克己土，阴阳异
    expect(tenGod('己', '乙')).toBe('七杀');
    expect(tenGod('己', '庚')).toBe('伤官'); // 土生金，阴阳异
    expect(tenGod('己', '辛')).toBe('食神');
    expect(tenGod('己', '壬')).toBe('正财'); // 土克水，阴阳异
    expect(tenGod('己', '癸')).toBe('偏财');
    expect(tenGod('己', '丙')).toBe('正印'); // 火生土，阴阳异
    expect(tenGod('己', '丁')).toBe('偏印');
  });
});
