/**
 * 验收 3（上半）：64 卦全量与 tsumugi(liuyao@0.5.1, MIT) 静态表交叉。
 * 本卦宫 / 卦名 / 世应 / 六亲 / 纳甲（天干+地支）必须 0 分歧。
 * liuyao 仅作为开发期对账基准（devDependency），不进运行时产物。
 */
import { describe, expect, it } from 'vitest';
import { Hexagram, HexagramInfoTable, TrigramInfoTable } from 'liuyao';
import { LiuqinCalculator } from 'mingpan/dist/services/liuyao/index.js';
import { getFullNajia, getGuaMeta } from '../src/guaTable.js';
import type { BaGua, WuXing } from '../src/types.js';

/** tsumugi 经卦 id 需由 binary（上→下三位）查 TrigramInfoTable */
const TRI_BY_BINARY = new Map(TrigramInfoTable.map((t) => [t.binary, t.id as BaGua]));

const MP_QIN: Record<string, string> = {
  父母: '父母', 兄弟: '兄弟', 子孫: '子孙', 妻財: '妻财', 官鬼: '官鬼',
};

describe('64 卦 × tsumugi 静态表交叉', () => {
  const rows: { name: string; errors: string[] }[] = [];

  for (const info of HexagramInfoTable) {
    const g = Hexagram.fromId(info.id);
    // binary 六码：上爻在首；前三位为下卦、后三位为上卦
    const lower = TRI_BY_BINARY.get(g.binary.slice(0, 3))!;
    const upper = TRI_BY_BINARY.get(g.binary.slice(3, 6))!;

    // liuyao@0.5.1：palace 是简体经卦名字符串；generation=0八纯(世上爻)、
    // 1~5 世在 1~5 爻、6 游魂(世4)、7 归魂(世3)；应与世隔三爻。
    const palace = g.palace as unknown as BaGua;
    const gen = g.generation as number;
    const tShi = gen === 0 ? 6 : gen <= 5 ? gen : gen === 6 ? 4 : 3;
    const tYing = tShi <= 3 ? tShi + 3 : tShi - 3;

    const meta = getGuaMeta(upper, lower);
    const nj = getFullNajia(upper, lower);
    const errors: string[] = [];

    if (meta.name !== info.id) errors.push(`卦名 ${meta.name} != ${info.id}`);
    if (meta.gong !== palace) errors.push(`宫 ${meta.gong} != ${palace}`);
    if (meta.shiPosition !== tShi) errors.push(`世 ${meta.shiPosition} != ${tShi}`);
    if (meta.yingPosition !== tYing) errors.push(`应 ${meta.yingPosition} != ${tYing}`);

    // liuyao@0.5.1 的 Hexagram.kins 是 6 个完整字符串（自下而上），
    // 形如 "子孙己卯木"（六亲2字 + 天干1字 + 地支1字 + 五行1字）。
    const tKins = g.kins as unknown as string[];
    for (let i = 0; i < 6; i++) {
      const pos = i + 1;
      const t = tKins[i];
      const tQin = t.slice(0, 2);
      const tGan = t.charAt(2);
      const tZhi = t.charAt(3);
      const mine = nj[i];
      const qin = MP_QIN[LiuqinCalculator.calculate(
        meta.gongWuXing as WuXing,
        mine.wuXing as WuXing,
      )];
      if (qin !== tQin) errors.push(`p${pos}六亲 ${qin} != ${tQin}`);
      if (mine.gan !== tGan) errors.push(`p${pos}干 ${mine.gan} != ${tGan}`);
      if (mine.zhi !== tZhi) errors.push(`p${pos}支 ${mine.zhi} != ${tZhi}`);
    }
    rows.push({ name: info.id, errors });
  }

  it('覆盖全部 64 卦', () => {
    expect(rows).toHaveLength(64);
  });

  it.each(rows)('$name 与 tsumugi 零分歧', ({ errors }) => {
    expect(errors).toEqual([]);
  });
});
