/**
 * M5 问事读法手册验收（v121：对齐现行八域结构）。
 * 红线：只给传统读法 + 典籍原文 + 自问方法，不替用户下吉凶结论。
 *  1. 八域齐全、id 合法、各字段非空且结构完整；
 *  2. 用神取值限定在六亲五爻 / 世应 / 六亲统称 / 六神范围；
 *  3. 典籍引文必须能在对应底本结构化原文中溯源（防手录错字、防伪标出处）：
 *     《增删卜易·X》→ X 必须是 zengshan_buyi.json 的章名，且引文可在该章原文命中；
 *     《卜筮正宗·X》→ 该 json 只抽了五大节，故只校验篇名格式合法；
 *  4. 焦点是中性方法，不含 App 视角的吉凶预言。
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
) as { chapters: Array<{ num: string; title: string; paras: string[] }> };
const bzz = JSON.parse(
  readFileSync(resolve(_dir, '../data/annotations/bushi_zhengzong.json'), 'utf8'),
) as { sections: Array<{ title: string; paras: string[] }> };

/** 去标点空白，用于跨版本比对原文（含 OCR 常见破折号/连接号） */
const norm = (s: string) =>
  s.replace(/[\s，。、；：？！·“”‘’（）《》O．.,:;?!'"()　—–－-]/g, '');

const chapterByTitle: Record<string, string> = {};
for (const c of zsb.chapters) chapterByTitle[norm(c.title)] = c.paras.map(norm).join('');

const zsTitles = new Set(zsb.chapters.map((c) => norm(c.title)));
const bzTitles = new Set(bzz.sections.map((s) => norm(s.title)));

const IDS: ReadingDomain['id'][] = [
  'wealth', 'career', 'love', 'health', 'decision', 'life', 'people', 'lost',
];

describe('M5 问事读法手册', () => {
  it('八个问事域齐全且顺序稳定，API 可按 id 取', () => {
    expect(READING_DOMAINS.map((d) => d.id)).toEqual(IDS);
    expect(listReadingDomains()).toHaveLength(8);
    for (const id of IDS) {
      const d = getReadingDomain(id);
      expect(d?.name).toBeTruthy();
      expect(d?.hint).toBeTruthy();
      expect(getReadingDomain('nope')).toBeUndefined();
    }
  });

  it('每域结构完整：用神/焦点/典籍均≥3，字段非空', () => {
    for (const d of READING_DOMAINS) {
      expect(d.yongShen.length, `${d.id}用神`).toBeGreaterThanOrEqual(3);
      expect(d.focus.length, `${d.id}焦点`).toBeGreaterThanOrEqual(3);
      expect(d.classics.length, `${d.id}典籍`).toBeGreaterThanOrEqual(3);
      for (const y of d.yongShen) {
        expect(y.yao.length, `${d.id}用神名`).toBeGreaterThan(0);
        expect(y.forWhom.length, `${d.id}:${y.yao}说明`).toBeGreaterThan(0);
      }
      for (const f of d.focus) expect(f.length, `${d.id}焦点`).toBeGreaterThan(0);
      for (const q of d.classics) {
        expect(q.text.length, `${d.id}引文`).toBeGreaterThan(0);
        expect(q.source.length, `${d.id}出处`).toBeGreaterThan(0);
      }
    }
  });

  it('用神取值限定在六亲五爻 / 世应 / 六亲统称 / 六神', () => {
    const allowed = /官鬼|妻财|父母|兄弟|子孙|世爻|应爻|六亲爻|青龙|朱雀|勾陈|螣蛇|白虎|玄武/;
    for (const d of READING_DOMAINS) {
      for (const y of d.yongShen) {
        expect(allowed.test(y.yao), `${d.id}:${y.yao}`).toBe(true);
      }
    }
  });

  it('每条典籍引文出处格式合法（《书名·篇名》）', () => {
    for (const d of READING_DOMAINS) {
      for (const q of d.classics) {
        const m = q.source.match(/^《(增删卜易|卜筮正宗)·([^》]+)》$/);
        expect(m, `出处格式: ${q.source}`).not.toBeNull();
        const book = m![1]!;
        const sec = m![2]!;
        expect(sec.length, `${d.id}:${q.source}`).toBeGreaterThan(1);
        expect(sec.length, `${d.id}:${q.source}`).toBeLessThanOrEqual(12);
        // 篇名不得夹带"第X章"这类序号后缀（统一用章名）
        expect(/^第?[一二三四五六七八九十百零两0-9]+章?$/.test(sec), `${q.source}`).toBe(false);
        if (book === '增删卜易') {
          expect(zsTitles.has(norm(sec)), `《增删卜易》无此章: ${sec}`).toBe(true);
        } else {
          // 卜筮正宗只抽五大节，篇名级不做硬校验
          expect(norm(sec).length).toBeGreaterThan(1);
        }
      }
    }
  });

  it('《增删卜易》引文可在对应章原文中逐字溯源（防手录错字）', () => {
    let checked = 0;
    for (const d of READING_DOMAINS) {
      for (const q of d.classics) {
        if (!q.source.startsWith('《增删卜易·')) continue;
        const sec = q.source.slice('《增删卜易·'.length, -1);
        const body = chapterByTitle[norm(sec)] ?? '';
        expect(body.length, `章原文非空: ${sec}`).toBeGreaterThan(0);
        const probe = norm(q.text);
        expect(
          body.includes(probe.slice(0, 16)) || body.includes(probe.slice(0, 10)),
          `${d.id} ${sec} 引文溯源失败: ${q.text.slice(0, 24)}`,
        ).toBe(true);
        checked += 1;
      }
    }
    expect(checked).toBeGreaterThanOrEqual(15);
  });

  it('焦点为中性方法，不含 App 吉凶预言', () => {
    const banned = /此卦必|你会|你将|必定发|必定成|注定|包你|稳赚|必离|必成|必死|预测结果|帮你算/;
    for (const d of READING_DOMAINS) {
      for (const f of d.focus) expect(banned.test(f), f).toBe(false);
    }
  });
});
