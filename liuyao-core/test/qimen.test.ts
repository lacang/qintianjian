import { describe, it, expect } from 'vitest';
import { paiQiMen } from '../src/qimen.js';

// 金标准＝元亨利贞网在线奇门（时家·转盘·拆补·中五寄坤二），
// 见 对标素材/引擎对账报告_奇门.md 第三/四节（bigfish 7 盘逐格 100% 命中）。

describe('奇门遁甲 时家转盘拆补', () => {
  it('GS-1 2026-10-18 12时：寒露 阴遁六局 上元', () => {
    const q = paiQiMen({ year: 2026, month: 10, day: 18, hour: 12 });
    expect(q.siZhu).toEqual({ year: '丙午', month: '戊戌', day: '乙丑', time: '壬午' });
    expect(q.jieQi).toBe('寒露');
    expect(q.dun).toBe('阴遁');
    expect(q.ju).toBe(6);
    expect(q.yuan).toBe('上元');
    // 时柱壬午，甲戌旬，旬空申酉
    expect(q.timeKongWang).toEqual(['申', '酉']);
  });

  it('GS-2 伏吟局 2026-01-05 08时：冬至阳一局，值使休门落中5显示坤2，开门在9', () => {
    const q = paiQiMen({ year: 2026, month: 1, day: 5, hour: 8 });
    expect(q.jieQi).toBe('冬至'); // 交节当天 08:00 尚未到 16:23，整日归冬至
    expect(q.dun).toBe('阳遁');
    expect(q.ju).toBe(1);
    expect(q.zhiFu.star).toBe('天蓬');
    expect(q.zhiFu.palace).toBe(1);
    // 伏吟难点：值使休门转宫落中五、显示在坤二
    expect(q.zhiShi.door).toBe('休门');
    expect(q.zhiShi.palace).toBe(2);
    const g9 = q.palaces.find((p) => p.palaceNumber === 9)!;
    expect(g9.door).toBe('开门');
  });

  it('同一交节日 20:00 已过 16:23 → 归小寒（日归属边界）', () => {
    const q = paiQiMen({ year: 2026, month: 1, day: 5, hour: 20 });
    expect(q.jieQi).toBe('小寒');
  });

  it('压力抽样 2026-04-02 14时：春分 阳遁六局下元，值符天英@2 值使景门@1', () => {
    const q = paiQiMen({ year: 2026, month: 4, day: 2, hour: 14 });
    expect(q.jieQi).toBe('春分');
    expect(q.dun).toBe('阳遁');
    expect(q.ju).toBe(6);
    expect(q.yuan).toBe('下元');
    expect(q.zhiFu).toEqual({ star: '天英', palace: 2 });
    expect(q.zhiShi).toEqual({ door: '景门', palace: 1 });
    expect(q.timeKongWang).toEqual(['辰', '巳']);
  });

  it('压力抽样 2026-06-25 10时：夏至 阴遁三局中元，值符天芮@9 值使死门@4', () => {
    const q = paiQiMen({ year: 2026, month: 6, day: 25, hour: 10 });
    expect(q.jieQi).toBe('夏至');
    expect(q.dun).toBe('阴遁');
    expect(q.ju).toBe(3);
    expect(q.yuan).toBe('中元');
    expect(q.zhiFu).toEqual({ star: '天芮', palace: 9 });
    expect(q.zhiShi).toEqual({ door: '死门', palace: 4 });
    expect(q.timeKongWang).toEqual(['申', '酉']);
  });

  it('压力抽样 2026-07-20 16时：小暑 阴遁八局上元，值符天心@6 值使开门@6', () => {
    const q = paiQiMen({ year: 2026, month: 7, day: 20, hour: 16 });
    expect(q.jieQi).toBe('小暑');
    expect(q.dun).toBe('阴遁');
    expect(q.ju).toBe(8);
    expect(q.yuan).toBe('上元');
    expect(q.zhiFu).toEqual({ star: '天心', palace: 6 });
    expect(q.zhiShi).toEqual({ door: '开门', palace: 6 });
    expect(q.timeKongWang).toEqual(['午', '未']);
  });

  it('九宫恒为 1..9 且中五不排门/神，天禽随坤二', () => {
    const q = paiQiMen({ year: 2026, month: 10, day: 18, hour: 12 });
    expect(q.palaces.map((p) => p.palaceNumber)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9]);
    const center = q.palaces.find((p) => p.palaceNumber === 5)!;
    expect(center.door).toBe('');
    expect(center.god).toBe('');
  });
});
