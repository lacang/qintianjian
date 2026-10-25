/**
 * M5 经传事实层验收。
 * 原则：只查表报原文，不判吉凶。覆盖：
 *  1. 64 卦全部可由装卦全名解析（含八纯「坎为水」、复名「既济」）；
 *  2. 每卦卦辞/彖/大象/六爻爻辞齐备，乾坤含用九用六与文言；
 *  3. 动爻取辞与爻位对应正确；
 *  4. 十翼目录与取文可用。
 */
import { describe, expect, it } from 'vitest';
import {
  resolveGua,
  getGuaAnnotation,
  getMovingLineAnnotation,
  listWings,
  getWing,
} from '../src/annotations/index.js';
import { getGuaMeta } from '../src/guaTable.js';
import type { BaGua } from '../src/types.js';

const BAGUA: BaGua[] = ['乾', '兑', '离', '震', '巽', '坎', '艮', '坤'];
const ALL_64_NAMES = BAGUA.flatMap((upper) =>
  BAGUA.map((lower) => getGuaMeta(upper, lower).name),
);

describe('M5 周易白文查表层', () => {
  it('装卦 64 全名 100% 可解析到周易条目', () => {
    expect(ALL_64_NAMES.length).toBe(64);
    const missing: string[] = [];
    for (const name of ALL_64_NAMES) {
      const g = resolveGua(name);
      if (!g) missing.push(name);
    }
    expect(missing).toEqual([]);
  });

  it('64 卦去重后恰为 64 个不同周易卦序', () => {
    const idx = new Set(
      ALL_64_NAMES.map((n) => resolveGua(n)!.i),
    );
    expect(idx.size).toBe(64);
    // 卦序覆盖 1..64
    expect([...idx].sort((a, b) => a - b)).toEqual(
      Array.from({ length: 64 }, (_, k) => k + 1),
    );
  });

  it('八纯与复名卦解析正确（坎为水→习坎29，水火既济→63）', () => {
    expect(resolveGua('坎为水')?.i).toBe(29);
    expect(resolveGua('乾为天')?.i).toBe(1);
    expect(resolveGua('坤为地')?.i).toBe(2);
    expect(resolveGua('水火既济')?.i).toBe(63);
    expect(resolveGua('火水未济')?.i).toBe(64);
    expect(resolveGua('天水讼')?.i).toBe(6);
    expect(resolveGua('地天泰')?.i).toBe(11);
  });

  it('每卦经传齐备：卦辞/彖/大象/六爻爻辞非空', () => {
    for (const name of ALL_64_NAMES) {
      const a = getGuaAnnotation(name)!;
      expect(a.judgment.length, `${name}卦辞`).toBeGreaterThan(0);
      expect(a.tuan.length, `${name}彖`).toBeGreaterThan(0);
      expect(a.daxiang.length, `${name}大象`).toBeGreaterThan(0);
      expect(a.lines.length, `${name}六爻`).toBe(6);
      for (const ln of a.lines) {
        expect(ln.position.length, `${name}爻位`).toBeGreaterThan(0);
        expect(ln.text.length, `${name}${ln.position}爻辞`).toBeGreaterThan(0);
      }
    }
  });

  it('乾卦含用九+文言，坤卦含用六+文言，其余卦无', () => {
    const qian = getGuaAnnotation('乾为天')!;
    const kun = getGuaAnnotation('坤为地')!;
    expect(qian.yong?.position).toContain('用九');
    expect(kun.yong?.position).toContain('用六');
    expect(qian.wenyan && qian.wenyan.length).toBeTruthy();
    expect(kun.wenyan && kun.wenyan.length).toBeTruthy();
    const song = getGuaAnnotation('天水讼')!;
    expect(song.yong).toBeUndefined();
    expect(song.wenyan).toBeUndefined();
  });

  it('动爻取辞按 1..6（初→上）对应', () => {
    const a = getGuaAnnotation('水雷屯')!; // 卦3
    const [chu] = getMovingLineAnnotation('水雷屯', [1]);
    expect(chu.position).toBe(a.lines[0]!.position);
    expect(chu.text).toBe(a.lines[0]!.text);
    const top = getMovingLineAnnotation('水雷屯', [6]);
    expect(top[0]!.position).toBe(a.lines[5]!.position);
    const two = getMovingLineAnnotation('水雷屯', [1, 3]);
    expect(two.map((x) => x.position)).toEqual([
      a.lines[0]!.position,
      a.lines[2]!.position,
    ]);
  });

  it('爻位命名：阳爻初九/九五，阴爻六二/六三', () => {
    const qian = getGuaAnnotation('乾为天')!;
    expect(qian.lines.map((l) => l.position)).toEqual([
      '初九', '九二', '九三', '九四', '九五', '上九',
    ]);
    const kun = getGuaAnnotation('坤为地')!;
    expect(kun.lines.map((l) => l.position)).toEqual([
      '初六', '六二', '六三', '六四', '六五', '上六',
    ]);
  });

  it('小象传与爻位一一对齐（抽样乾卦）', () => {
    const qian = getGuaAnnotation('乾为天')!;
    const xs = qian.lines.filter((l) => l.xiaoxiang && l.xiaoxiang.length > 0);
    expect(xs.length).toBe(6);
  });

  it('十翼目录与取文：系辞/说卦/序卦/杂卦可读', () => {
    const wings = listWings();
    const ids = wings.map((w) => w.id);
    for (const id of ['xici-shang', 'xici-xia', 'shuogua', 'xugua', 'zagua']) {
      expect(ids).toContain(id);
      const w = getWing(id)!;
      expect(w.chapters.length).toBeGreaterThan(0);
      expect(w.chapters[0]!.text.length).toBeGreaterThan(0);
    }
  });

  it('经传为白文事实：不含派生命理标签', () => {
    // 数据层不允许混入断语/六亲解释，仅经传原文
    const song = getGuaAnnotation('天水讼')!;
    const blob = song.judgment + song.tuan + song.daxiang + song.lines.map((l) => l.text).join('');
    expect(blob).not.toMatch(/大吉大利|此卦必|帮你算|运势预测/);
  });

  it('数据完整性：64 卦卦符合法，且正文文本无杂散卦符/替换符', () => {
    const GUA = /[\u4DC0-\u4DFF]/;
    for (const name of ALL_64_NAMES) {
      const a = getGuaAnnotation(name)!;
      expect(GUA.test(a.symbol), `${name}卦符`).toBe(true);
      // 卦符只能出现在 symbol 字段
      const texts = [
        a.judgment, a.tuan, a.daxiang, a.wenyan ?? '',
        ...a.lines.flatMap((l) => [l.text, l.xiaoxiang ?? '']),
        a.yong?.text ?? '',
      ];
      for (const t of texts) {
        expect(GUA.test(t), `${name}正文杂散卦符:${t.slice(0, 12)}`).toBe(false);
        expect(t.includes('\uFFFD'), `${name}替换符`).toBe(false);
      }
    }
  });
});
