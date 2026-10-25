/**
 * M5 问事读法手册验收。
 * 红线：只给传统读法 + 典籍原文 + 自问问题，不替用户下吉凶结论。
 *  1. 五域齐全、id 合法、各字段非空且结构完整；
 *  2. 用神取值限定在六亲/世应范围；
 *  3. 典籍引文必须能在《增删卜易》结构化原文中溯源（防手录错字）；
 *  4. 焦点/自问清单是中性方法与第二人称提问，不含 App 视角的吉凶预言。
 */
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import {
  READING_DOMAINS,
  listReadingDomains,
  getReadingDomain,
  type ReadingDomain,
} from '../src/annotations/reading.js';

const _dir = dirname(fileURLToPath(import.meta.url));
const zsb = JSON.parse(
  readFileSync(resolve(_dir, '../data/annotations/zengshan_buyi.json'), 'utf8'),
) as { chapters: Array<{ num: string; paras: string[] }> };

const norm = (s: string) =>
  s.replace(/[\s，。、；：？！·“”‘’（）《》O．.,:;?!'"()　]/g, '');

const chapterBody: Record<string, string> = {};
for (const c of zsb.chapters) chapterBody[c.num] = c.paras.map(norm).join('');

function cnToInt(s: string): number {
  const m: Record<string, number> = {
    零: 0, 一: 1, 二: 2, 两: 2, 三: 3, 四: 4, 五: 5,
    六: 6, 七: 7, 八: 8, 九: 9,
  };
  let r = 0;
  if (s.includes('百')) {
    const [a, b] = s.split('百');
    r += (a ? m[a] ?? 1 : 1) * 100;
    const rest = b ?? '';
    if (rest === '十') r += 10;
    else if (rest.startsWith('十')) r += 10 + (m[rest[1]!] ?? 0);
    else if (rest) r += m[rest] ?? 0;
  } else if (s.includes('十')) {
    const [a, b] = s.split('十');
    r += (a ? m[a] : 1) * 10 + (b ? m[b]! : 0);
  } else {
    for (const ch of s) r = r * 10 + (m[ch] ?? 0);
  }
  return r;
}

const IDS: ReadingDomain['id'][] = [
  'career', 'wealth', 'relationship', 'travel', 'decision',
];

describe('M5 问事读法手册', () => {
  it('五个问事域齐全且顺序稳定，API 可按 id 取', () => {
    expect(READING_DOMAINS.map((d) => d.id)).toEqual(IDS);
    expect(listReadingDomains()).toHaveLength(5);
    for (const id of IDS) {
      const d = getReadingDomain(id);
      expect(d?.name).toBeTruthy();
      expect(getReadingDomain('nope')).toBeUndefined();
    }
  });

  it('每域结构完整：用神/焦点≥3，典籍≥3，自问≥5', () => {
    for (const d of READING_DOMAINS) {
      expect(d.yongShen.length, `${d.id}用神`).toBeGreaterThanOrEqual(3);
      expect(d.focus.length, `${d.id}焦点`).toBeGreaterThanOrEqual(3);
      expect(d.classics.length, `${d.id}典籍`).toBeGreaterThanOrEqual(3);
      expect(d.questions.length, `${d.id}自问`).toBeGreaterThanOrEqual(5);
      for (const y of d.yongShen) {
        expect(y.yao.length).toBeGreaterThan(0);
        expect(y.forWhom.length).toBeGreaterThan(0);
      }
    }
  });

  it('用神取值限定在六亲五爻与世应', () => {
    const allowed = ['官鬼', '妻财', '父母', '兄弟', '子孙', '世爻', '应爻'];
    for (const d of READING_DOMAINS) {
      for (const y of d.yongShen) {
        expect(allowed.some((a) => y.yao.includes(a)), `${d.id}:${y.yao}`).toBe(true);
      }
    }
  });

  it('每条典籍引文均可在《增删卜易》对应章原文中溯源', () => {
    for (const d of READING_DOMAINS) {
      for (const q of d.classics) {
        const m = q.source.match(/第([一二三四五六七八九十百零两]+)[章》]/);
        expect(m, q.source).not.toBeNull();
        const num = cnToInt(m![1]!);
        const body = chapterBody[String(num)] ?? '';
        expect(body.length, `第${num}章存在`).toBeGreaterThan(0);
        const probe = norm(q.text);
        expect(
          body.includes(probe.slice(0, 16)) || body.includes(probe.slice(0, 10)),
          `${d.id} 第${num}章 引文溯源失败: ${q.text.slice(0, 20)}`,
        ).toBe(true);
        expect(q.source).toContain('《增删卜易');
      }
    }
  });

  it('焦点/自问为中性方法与第二人称提问，不含 App 吉凶预言', () => {
    const banned = /此卦必|你会|你将|必定发|必定成|注定|包你|稳赚|必离|必成|必死|预测结果|帮你算/;
    for (const d of READING_DOMAINS) {
      for (const f of d.focus) expect(banned.test(f), f).toBe(false);
      for (const q of d.questions) {
        expect(q.includes('？'), `自问应为问句(含？): ${q}`).toBe(true);
        expect(banned.test(q), q).toBe(false);
      }
    }
  });

  it('自问清单是第二人称（含「我」），把判断权留给用户', () => {
    for (const d of READING_DOMAINS) {
      const selfCount = d.questions.filter((q) => q.includes('我')).length;
      expect(selfCount, d.id).toBeGreaterThanOrEqual(d.questions.length - 1);
    }
  });
});
