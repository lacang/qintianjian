/**
 * 注解事实层（M5）
 *
 * 只做「给定卦/爻 → 返回经传原文」的确定性查询，不做任何吉凶解释、不联网、不调模型。
 * 数据为《周易》白文（阮元校刻《周易正义》系统本）离线精简包，构建时内联。
 *
 * 铁律：只排盘、报事实。前端展示的读法/自问清单也仅是经传原文与结构化提示，
 * 不输出“此卦必吉/必凶”之类断语。
 */
import zhouyiLite from './data/zhouyi.lite';

interface LiteLine {
  /** [爻位（初九/六二…）, 爻辞] */
  0: string;
  1: string;
}
interface LiteHex {
  i: number;            // 周易卦序 1..64
  n: string;            // 周易单字卦名（坎/既济…）
  sym: string;          // Unicode 卦符
  j: string;            // 卦辞
  l: Array<[string, string]>; // 六爻爻辞（初→上）
  dx: string;           // 大象传
  tuan: string;         // 彖传
  yong?: [string, string];    // 用九/用六（仅乾坤）
  wy?: string;          // 文言传（仅乾坤）
  xx?: Array<[string, string]>; // 小象传（初→上）
}
interface LiteWing {
  id: string;
  t: string;
  tt: string;
  c: Array<[string, string]>;
}
interface LiteDB {
  meta: { book: string; edition: string; note: string };
  gua: LiteHex[];
  wings: LiteWing[];
}

const DB = zhouyiLite as unknown as LiteDB;

/** 八卦名 */
export type BaGuaName = '乾' | '兑' | '离' | '震' | '巽' | '坎' | '艮' | '坤';

/**
 * 装卦全名（mingpan 简体，如「坎为水」「天水讼」「水火既济」）→ 《周易》卦序条目。
 * 64 卦全名末位即周易卦名；八纯卦为「X为X」取首字（坎为水→习坎，名为「坎」）。
 */
const BY_NAME = new Map<string, LiteHex>();
for (const g of DB.gua) {
  BY_NAME.set(g.n, g);
  // 周易原名为「習坎/习坎」（卦29），装卦体系作「坎」，二者互认
  if (g.n === '习坎') BY_NAME.set('坎', g);
  // 卦33：经文用字「遯」，装卦简体作「遁」
  if (g.n === '遯') BY_NAME.set('遁', g);
}

/** 八纯全名「坎为水」等 → 八纯单名（坎/离…） */
const PURE_FULL: Record<string, string> = {
  乾为天: '乾', 兑为泽: '兑', 离为火: '离', 震为雷: '震',
  巽为风: '巽', 坎为水: '坎', 艮为山: '艮', 坤为地: '坤',
};

/** 余卦：全名（三字）取后两字即周易卦名，如 天水讼→讼、水火既济→既济、地天泰→泰 */
export function resolveGua(fullName: string): LiteHex | undefined {
  if (!fullName) return undefined;
  if (BY_NAME.has(fullName)) return BY_NAME.get(fullName);
  if (PURE_FULL[fullName]) return BY_NAME.get(PURE_FULL[fullName]);
  // 三字/四字全名：剥掉首字（上卦）与“为”后，取卦名部分
  const tail2 = fullName.slice(-2);
  if (BY_NAME.has(tail2)) return BY_NAME.get(tail2);
  const tail1 = fullName.slice(-1);
  return BY_NAME.get(tail1);
}

export interface YaoAnnotation {
  position: string; // 初九/六二…
  text: string;     // 爻辞
  xiaoxiang?: string; // 小象传
}

export interface GuaAnnotation {
  index: number;
  name: string;
  symbol: string;
  judgment: string;       // 卦辞
  tuan: string;           // 彖传
  daxiang: string;        // 大象传
  lines: YaoAnnotation[]; // 初→上
  yong?: { position: string; text: string };
  wenyan?: string;
}

/** 由装卦全名取该卦经传事实（卦辞/彖/大象/六爻爻辞及小象/用九用六/文言）。 */
export function getGuaAnnotation(fullName: string): GuaAnnotation | undefined {
  const g = resolveGua(fullName);
  if (!g) return undefined;
  const xxMap = new Map(g.xx ?? []);
  return {
    index: g.i,
    name: g.n,
    symbol: g.sym,
    judgment: g.j,
    tuan: g.tuan,
    daxiang: g.dx,
    lines: g.l.map(([position, text]) => ({
      position,
      text,
      xiaoxiang: xxMap.get(position),
    })),
    yong: g.yong ? { position: g.yong[0], text: g.yong[1] } : undefined,
    wenyan: g.wy,
  };
}

/** 动爻（1..6，初=1）对应经传；返回该爻爻辞+小象，以及所在爻位名。无动爻返回 undefined。 */
export function getMovingLineAnnotation(
  fullName: string,
  movingPositions: number[],
): YaoAnnotation[] {
  const a = getGuaAnnotation(fullName);
  if (!a) return [];
  return movingPositions
    .filter((p) => p >= 1 && p <= 6)
    .map((p) => a.lines[p - 1])
    .filter(Boolean);
}

/** 十翼目录（id/标题），供“传文”浏览。 */
export function listWings(): Array<{ id: string; title: string; titleTraditional: string }> {
  return DB.wings.map((w) => ({ id: w.id, title: w.t, titleTraditional: w.tt }));
}

/** 取某一传全文（章节数组）。 */
export function getWing(id: string): { title: string; chapters: Array<{ chapter: string; text: string }> } | undefined {
  const w = DB.wings.find((x) => x.id === id);
  if (!w) return undefined;
  return { title: w.t, chapters: w.c.map(([chapter, text]) => ({ chapter, text })) };
}

export const ZHOUYI_META = DB.meta;
