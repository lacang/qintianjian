/**
 * 验收 2：formatCopyText 与《复制卦例模板.md》两段金标准
 * （雷火丰静卦、泽火革动卦）逐字段/顺序/爻线/世应/动标一致（空白归一比较）。
 */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { castManual, formatCopyText, formatScreen, paipan } from '../src/index.js';

const here = dirname(fileURLToPath(import.meta.url));
const tpl = readFileSync(resolve(here, '../../对标素材/复制卦例模板.md'), 'utf8');
const blocks = [...tpl.matchAll(/```\n([\s\S]*?)\n```/g)]
  .map((m) => m[1])
  .filter((t) => t.includes('男测'));

const norm = (s: string): string =>
  s
    .split('\n')
    .map((l) => l.trim().replace(/[ \t　]+/g, ' '))
    .filter(Boolean)
    .join('\n');

const GOLDEN_FENG = norm(blocks[0]);
const GOLDEN_GE = norm(blocks[1]);

const feng = paipan({
  yaoValues: castManual([
    { yinYang: '阳' }, { yinYang: '阴' }, { yinYang: '阳' },
    { yinYang: '阳' }, { yinYang: '阴' }, { yinYang: '阴' },
  ]),
  year: 2026, month: 10, day: 18, hour: 4, minute: 6,
  question: '',
});

const ge = paipan({
  yaoValues: castManual([
    { yinYang: '阳' }, { yinYang: '阴' }, { yinYang: '阳', moving: true },
    { yinYang: '阳', moving: true }, { yinYang: '阳' }, { yinYang: '阴', moving: true },
  ]),
  year: 2026, month: 10, day: 18, hour: 2, minute: 46,
});

describe('formatCopyText 逐字一致（空白归一）', () => {
  it('雷火丰 静卦（藏爻两列 + 世应）', () => {
    expect(norm(formatCopyText(feng))).toBe(GOLDEN_FENG);
  });

  it('泽火革 动卦（藏爻/本卦/变卦三列、动标、真伏神）', () => {
    expect(norm(formatCopyText(ge))).toBe(GOLDEN_GE);
  });

  it('女测/所问头部', () => {
    const p = paipan({
      yaoValues: castManual([
        { yinYang: '阳' }, { yinYang: '阴' }, { yinYang: '阳' },
        { yinYang: '阳' }, { yinYang: '阴' }, { yinYang: '阴' },
      ]),
      year: 2026, month: 10, day: 18, hour: 4, minute: 6,
      gender: '女', question: '事业',
    });
    const out = formatCopyText(p);
    expect(out.startsWith('女测：事业\n')).toBe(true);
  });
});

describe('formatScreen 视图模型（不渲染 UI）', () => {
  it('静卦行结构', () => {
    const vm = formatScreen(feng);
    expect(vm.header.benGuaName).toBe('雷火丰');
    expect(vm.header.bianGuaName).toBeUndefined();
    expect(vm.lines).toHaveLength(6);
    expect(vm.lines[0].position).toBe(6); // 自上而下
    expect(vm.lines[0].ben.name).toBeTruthy();
  });

  it('动卦带变卦字段且只动爻有变爻名', () => {
    const vm = formatScreen(ge);
    expect(vm.header.benGuaName).toBe('泽火革');
    expect(vm.header.bianGuaName).toBe('风雷益');
    const changedPositions = vm.lines.filter((l) => l.bian?.name).map((l) => l.position);
    expect(changedPositions.sort()).toEqual([3, 4, 6]);
  });
});
