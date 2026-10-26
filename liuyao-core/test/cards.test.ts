import { describe, it, expect } from 'vitest';
import {
  getDeck, listDecks, getSpread, listSpreads,
  secureRandomInt, shuffle, drawCards, drawSpread, drawSingle, drawOHPair,
  readingToText, registerDeck, CARDS_DISCLAIMER,
  type DeckManifest,
} from '../src/index.js';

describe('cards rng & shuffle', () => {
  it('secureRandomInt 落在 [0,max)', () => {
    for (let i = 0; i < 2000; i++) {
      const v = secureRandomInt(78);
      expect(Number.isInteger(v)).toBe(true);
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThan(78);
    }
  });
  it('shuffle 不丢元素且不改入参', () => {
    const a = [1, 2, 3, 4, 5];
    const s = shuffle(a);
    expect(s.slice().sort((x, y) => x - y)).toEqual(a);
    expect(a).toEqual([1, 2, 3, 4, 5]);
  });
});

describe('RWS deck', () => {
  const d = getDeck('rws');
  it('78 张且许可干净', () => {
    expect(d.cardCount).toBe(78);
    expect(d.cards).toHaveLength(78);
    expect(d.builtin).toBe(true);
    expect(d.license).toMatch(/Public Domain/i);
    expect(d.cards.filter((c) => c.id.startsWith('major-'))).toHaveLength(22);
    for (const suit of ['wands', 'cups', 'swords', 'pentacles']) {
      expect(d.cards.filter((c) => c.id.startsWith(suit + '-'))).toHaveLength(14);
    }
  });
  it('id 唯一且每张牌字段完整（红线：正逆位中性词非空）', () => {
    const ids = new Set(d.cards.map((c) => c.id));
    expect(ids.size).toBe(78);
    for (const c of d.cards) {
      expect(c.reversible).toBe(true);
      expect(c.meaning.scene.length).toBeGreaterThan(0);
      expect(c.meaning.upright.length).toBeGreaterThanOrEqual(3);
      expect(c.meaning.reversed.length).toBeGreaterThanOrEqual(2);
    }
  });
  it('牌义不含绝对断语', () => {
    const blob = JSON.stringify(d.cards);
    for (const b of ['必将', '注定', '包你', '稳赚']) expect(blob).not.toContain(b);
  });
});

describe('spreads', () => {
  it('注册 9 个塔罗牌阵且张数=牌位数、坐标合法', () => {
    const ss = listSpreads('tarot');
    expect(ss).toHaveLength(9);
    for (const s of ss) {
      expect(s.count).toBe(s.positions.length);
      for (const p of s.positions) {
        expect(p.x).toBeGreaterThanOrEqual(0);
        expect(p.x).toBeLessThanOrEqual(100);
        expect(p.label.length).toBeGreaterThan(0);
        expect(p.meaning.length).toBeGreaterThan(0);
      }
    }
  });
  it('关键牌阵张数与凯尔特十字横压牌', () => {
    expect(getSpread('single').count).toBe(1);
    expect(getSpread('three-time').count).toBe(3);
    expect(getSpread('celtic-cross').count).toBe(10);
    expect(getSpread('houses-twelve').count).toBe(12);
    expect(getSpread('celtic-cross').positions[1].rotate).toBe(90);
  });
});

describe('draw', () => {
  const d = getDeck('rws');
  it('不放回抽牌，张数正确', () => {
    const seeds = drawCards(d, 10);
    expect(seeds).toHaveLength(10);
    expect(new Set(seeds.map((x) => x.cardIndex)).size).toBe(10);
  });
  it('drawSpread 落位、免责语、注入时间', () => {
    const r = drawSpread(d, getSpread('three-time'), { question: '问', reversal: true, now: '2026-10-19T20:00' });
    expect(r.positions).toHaveLength(3);
    expect(new Set(r.positions.map((p) => p.drawn.cardIndex)).size).toBe(3);
    expect(r.disclaimer).toBe('');
    expect(r.drawnAt).toBe('2026-10-19T20:00');
  });
  it('关闭正逆位时全部正位', () => {
    const r = drawSpread(d, getSpread('single'), { reversal: false });
    expect(r.reversal).toBe(false);
    expect(r.positions[0].drawn.reversed).toBe(false);
  });
  it('超抽抛错', () => {
    expect(() => drawCards(d, 79)).toThrow();
  });
  it('单张日抽正逆位字段齐全', () => {
    const c = drawSingle(d, { reversal: false });
    expect(typeof c.reversed).toBe('boolean');
    expect(c.card.name).toBeTruthy();
  });
  it('复制文本含牌位/牌名/外部AI提示/免责语', () => {
    const r = drawSpread(d, getSpread('three-time'), { reversal: false });
    const t = readingToText(r);
    expect(t).toContain('过去');
    expect(t).toContain('韦特塔罗');
    expect(t).toContain('不要替我预测');
    expect(t).toContain(CARDS_DISCLAIMER);
  });
});

describe('OH pair & registry layering', () => {
  const mk = (id: string, role: 'image' | 'word'): DeckManifest => ({
    id, name: id, kind: 'oh', ohRole: role, cardCount: 2, license: 'LOCAL',
    description: '', allowsReversal: false, builtin: false,
    cards: [
      { id: id + '1', name: 'a', reversible: false, meaning: { scene: '', keywords: [], upright: [], reversed: [] } },
      { id: id + '2', name: 'b', reversible: false, meaning: { scene: '', keywords: [], upright: [], reversed: [] } },
    ],
  });
  it('图×字配对，角色错误时抛错；builtin 列表排除本地牌组', () => {
    registerDeck(mk('t-img', 'image'));
    registerDeck(mk('t-wd', 'word'));
    const pair = drawOHPair(getDeck('t-img'), getDeck('t-wd'));
    expect(pair.image.id).toContain('img');
    expect(pair.word.id).toContain('wd');
    expect(() => drawOHPair(getDeck('t-wd'), getDeck('t-img'))).toThrow();
    expect(listDecks(true).some((x) => x.id === 't-img')).toBe(false);
  });
});
