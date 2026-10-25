import { describe, it, expect } from 'vitest';
import { paiZiwei, hourToTimeIndex } from '../src/ziwei.js';

// 金标准：元亨利贞 china95「2026-10-18 03时50分 男 天盘」逐宫对账截图
// （对标素材/china95_04_紫微排盘结果_20261018寅时.png）
const GOLD = paiZiwei({
  year: 2026, month: 10, day: 18, hour: 3, minute: 50, gender: '男',
});

// 主人本命：1994-08-01 11:45 沈阳 男（午时），四柱与八字模块交叉验证
const ME = paiZiwei({
  year: 1994, month: 8, day: 1, hour: 11, minute: 45, gender: '男',
});

describe('hourToTimeIndex 时辰索引', () => {
  it('早子/晚子与十二时辰边界', () => {
    expect(hourToTimeIndex(0)).toBe(0); // 早子时
    expect(hourToTimeIndex(1)).toBe(1); // 丑
    expect(hourToTimeIndex(2)).toBe(1);
    expect(hourToTimeIndex(3)).toBe(2); // 寅
    expect(hourToTimeIndex(11)).toBe(6); // 午
    expect(hourToTimeIndex(12)).toBe(6);
    expect(hourToTimeIndex(22)).toBe(11); // 亥
    expect(hourToTimeIndex(23)).toBe(12); // 晚子时
  });
  it('分钟不改变时辰归属', () => {
    expect(hourToTimeIndex(3, 50)).toBe(2);
    expect(hourToTimeIndex(11, 45)).toBe(6);
  });
  it('非法小时抛错', () => {
    expect(() => hourToTimeIndex(-1)).toThrow();
    expect(() => hourToTimeIndex(24)).toThrow();
  });
});

describe('金标准 2026-10-18 寅时乾造', () => {
  it('四柱 / 局 / 命身 / 命身主', () => {
    expect(GOLD.siZhu).toBe('丙午 戊戌 乙丑 戊寅');
    expect(GOLD.fiveElementsClass).toBe('火六局');
    expect(GOLD.soulBranch).toBe('申');
    expect(GOLD.bodyBranch).toBe('子');
    expect(GOLD.soul).toBe('廉贞');
    expect(GOLD.body).toBe('火星');
    expect(GOLD.time).toBe('寅时');
    expect(GOLD.zodiac).toBe('马');
  });

  it('命宫在申（丙申），身宫在子（官禄），命身不同宫', () => {
    const soul = GOLD.palaces.find((p) => p.isSoulPalace)!;
    const body = GOLD.palaces.find((p) => p.isBodyPalace)!;
    expect(soul.earthlyBranch).toBe('申');
    expect(soul.ganZhi).toBe('丙申');
    expect(soul.name).toBe('命宫');
    expect(body.earthlyBranch).toBe('子');
    expect(body.name).toBe('官禄');
    expect(soul.isBodyPalace).toBe(false);
  });

  it('命宫三方四正：对宫（六冲）+ 三合', () => {
    const soul = GOLD.palaces.find((p) => p.isSoulPalace)!;
    expect(soul.sanFang).toEqual({ opposite: '寅', sanhe: ['子', '辰'] });
    // 申子辰三合水局 ✓；寅申冲 ✓
    const meSoul = ME.palaces.find((p) => p.isSoulPalace)!;
    expect(meSoul.sanFang).toEqual({ opposite: '未', sanhe: ['巳', '酉'] });
    // 巳酉丑三合金局 ✓；丑未冲 ✓
  });

  it('主星落宫（14主星关键宫）', () => {
    const at = (br: string) => GOLD.palaces.find((p) => p.earthlyBranch === br)!;
    const majorNames = (br: string) => at(br).majorStars.map((s) => s.name);
    expect(majorNames('申')).toEqual(['武曲', '天相']);
    expect(majorNames('辰')).toEqual(['廉贞', '天府']);
    expect(majorNames('子')).toEqual(['紫微']);
    expect(majorNames('午')).toEqual(['贪狼']);
    expect(majorNames('巳')).toEqual(['太阴']);
    expect(majorNames('未')).toEqual(['天同', '巨门']);
    expect(majorNames('酉')).toEqual(['太阳', '天梁']);
    expect(majorNames('亥')).toEqual(['天机']);
    // 空宫：疾厄（卯）、仆役（丑）无主星
    expect(at('卯').isEmpty).toBe(true);
    expect(at('丑').isEmpty).toBe(true);
    expect(GOLD.palaces.filter((p) => p.isEmpty).length).toBeGreaterThanOrEqual(2);
  });

  it('丙年四化：天同禄在未 / 天机权在亥 / 文昌科在申 / 廉贞忌在辰', () => {
    const findMut = (br: string, m: string) => {
      const p = GOLD.palaces.find((x) => x.earthlyBranch === br)!;
      return [...p.majorStars, ...p.minorStars].find((s) => s.mutagen === m);
    };
    expect(findMut('未', '禄')!.name).toBe('天同');
    expect(findMut('亥', '权')!.name).toBe('天机');
    expect(findMut('申', '科')!.name).toBe('文昌');
    expect(findMut('辰', '忌')!.name).toBe('廉贞');
    // 全盘恰有禄权科忌各一
    for (const m of ['禄', '权', '科', '忌']) {
      const n = GOLD.palaces.reduce(
        (acc, p) => acc + [...p.majorStars, ...p.minorStars].filter((s) => s.mutagen === m).length,
        0,
      );
      expect(n).toBe(1);
    }
  });

  it('大限阳男顺行，命宫 6-15 起九段衔接', () => {
    const soul = GOLD.palaces.find((p) => p.isSoulPalace)!;
    expect(soul.decadalRange).toEqual([6, 15]);
    // 顺行下一宫父母 16-25；末段兄弟 116-125
    const parents = GOLD.palaces.find((p) => p.name === '父母')!;
    const brothers = GOLD.palaces.find((p) => p.name === '兄弟')!;
    expect(parents.decadalRange).toEqual([16, 25]);
    expect(brothers.decadalRange).toEqual([116, 125]);
    // 长生十二神命宫在病（火六局阳男，截图：申 病）
    expect(soul.changsheng12).toBe('病');
  });

  it('输出为可序列化纯 JSON，无函数/类实例', () => {
    const clone = JSON.parse(JSON.stringify(GOLD));
    expect(clone.palaces).toHaveLength(12);
    expect(typeof clone.palaces[0].majorStars[0].name).toBe('string');
    expect(clone.disclaimer).toBe('');
  });
});

describe('主人本命 1994-08-01 午时（与八字交叉验证）', () => {
  it('四柱一致、甲年命宫在丑命身同宫', () => {
    expect(ME.siZhu).toBe('甲戌 辛未 己未 庚午');
    expect(ME.fiveElementsClass).toBe('水二局');
    expect(ME.soulBranch).toBe('丑');
    expect(ME.bodyBranch).toBe('丑');
    const soul = ME.palaces.find((p) => p.isSoulPalace)!;
    expect(soul.isBodyPalace).toBe(true);
    expect(soul.majorStars.map((s) => s.name)).toEqual(['紫微', '破军']);
    expect(soul.decadalRange).toEqual([2, 11]);
  });
  it('甲年四化：廉贞禄·破军权·武曲科·太阳忌', () => {
    const findMut = (br: string, m: string) => {
      const p = ME.palaces.find((x) => x.earthlyBranch === br)!;
      return [...p.majorStars, ...p.minorStars].find((s) => s.mutagen === m);
    };
    expect(findMut('巳', '禄')!.name).toBe('廉贞');
    expect(findMut('丑', '权')!.name).toBe('破军');
    expect(findMut('酉', '科')!.name).toBe('武曲');
    expect(findMut('戌', '忌')!.name).toBe('太阳');
  });
});
