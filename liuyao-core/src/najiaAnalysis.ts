/**
 * 纳甲断卦·事实分析层
 *
 * 在 paipan() 的原始排盘（六神/六亲/纳甲/世应/动变/伏神/旬空）之上，
 * 针对当前这一卦给出《增删卜易》取用神所需的**确定性事实**：
 *   - 每一爻相对月建、日辰的旺衰/月破/旬空/墓绝等状态（见 wangshuai.ts）
 *   - 按六亲索引类神（妻财/官鬼/父母/兄弟/子孙），含爻位、动静、世应、伏神
 *   - 按问事域选出目标用神（多现/不上卦时如实罗列，不替占者取舍）
 *   - 类神与世爻、应爻之间的五行生克冲合关系（中性陈列）
 *
 * 严格不输出吉凶、成败、应期等断语；只把"盘面事实"摆出来，
 * 配合 annotations/reading.ts 的《增删卜易》原文与自问清单使用。
 */
import type {
  BenYao, BianYao, DiZhi, FuShen, LiuQin, LiuShen, Pan, WuXing,
} from './types.js';
import { evalYao, type YaoState } from './wangshuai.js';
import { LIU_CHONG, LIU_HE, relationOf, WUXING_SHENG, WUXING_KE, type ShengKe } from './wuxing-rel.js';

export type Sex = '男' | '女';
export type Domain =
  | '财运' | '事业' | '感情' | '疾病' | '考试' | '合作'
  | '行人' | '失物' | '其他';

export interface AnalyzeOptions {
  /** 月建、日辰地支（Pan 不直接存，由上层 solarToSiZhu 透传） */
  monthZhi: DiZhi;
  dayZhi: DiZhi;
  /** 占者性别，用于感情域取财/官；默认取盘上 gender */
  sex?: Sex;
}

/** 一个六亲类神在盘上的全部客观信息 */
export interface LiuQinOccurrence {
  liuQin: LiuQin;
  /** 爻位（初爻=1 … 上爻=6）；伏神为所伏爻位 */
  pos: number;
  yao: BenYao;
  naJia: string;
  liuShen: LiuShen;
  moving: boolean;
  shi: boolean;
  ying: boolean;
  /** 是否为伏神（本宫六亲不上卦而伏） */
  hidden: boolean;
  hiddenUnder?: string;
  /** 伏神专用的飞伏关系 */
  feiFuRelation?: string;
  state: YaoState;
}

export interface DongYao {
  pos: number;
  yao: BenYao;
  liuQin: LiuQin;
  liuShen: LiuShen;
  shi: boolean;
  ying: boolean;
  state: YaoState;
  bian?: BianYao;
}

export interface YongShenResult {
  /** 目标六亲（"应爻"为用者此数组为空，以 useYing=true 表示） */
  primary: LiuQin[];
  useYing: boolean;
  /** 该六亲在本卦的出现情况（含伏神） */
  occurrences: LiuQinOccurrence[];
  absent: boolean;
  /** 多现/不上卦时的中性提示（援引《增删卜易》取法，非断语） */
  note: string[];
  /** 原神（生用神者）；useYing=true 或 primary 为空时为 undefined */
  yuanShen?: LiuQin;
  /** 忌神（克用神者） */
  jiShen?: LiuQin;
  /** 仇神（生忌神者，即忌神的原神） */
  chouShen?: LiuQin;
}

export interface RelFact {
  from: string;
  to: '世爻' | '应爻';
  rel: ShengKe | '冲' | '合';
  desc: string;
}

export interface LineState {
  pos: number;
  yao: BenYao;
  liuQin: LiuQin;
  naJia: string;
  liuShen: LiuShen;
  moving: boolean;
  shi: boolean;
  ying: boolean;
  state: YaoState;
}

export interface NajiaAnalysis {
  lines: LineState[];
  byLiuQin: Record<LiuQin, LiuQinOccurrence[]>;
  shi: { pos: number; occ: LiuQinOccurrence } | null;
  ying: { pos: number; occ: LiuQinOccurrence } | null;
  dong: DongYao[];
  shiState: YaoState | null;
  relations: RelFact[];
  yongshen: Record<Domain, YongShenResult>;
  meta: {
    gong: Pan['benGua']['gong'];
    gongWuXing: WuXing;
    shiPos: number | null;
    yingPos: number | null;
    monthZhi: DiZhi;
    dayZhi: DiZhi;
    xunKong: [DiZhi, DiZhi];
  };
}

const SIX_QIN: LiuQin[] = ['官鬼', '父母', '兄弟', '妻财', '子孙'];

/** 各问事域的用神六亲（《增删卜易·取用章》通行口径）；'应' 表示以应爻为用 */
const DOMAIN_YONGSHEN: Record<Domain, Array<LiuQin | '应'>> = {
  财运: ['妻财'],
  事业: ['官鬼', '父母'],
  感情: ['官鬼', '妻财'], // 男占妻财、女占官鬼，见下
  疾病: ['官鬼', '子孙'],
  考试: ['父母', '官鬼'],
  合作: ['应', '兄弟'],
  行人: ['应'],
  失物: ['妻财'],
  其他: ['应'],
};

/**
 * 五行→六亲反向映射：给定卦宫五行 X 和目标五行 Y，返回 Y 对应的六亲。
 * 规则：Y===X→兄弟, sheng[X]===Y→子孙, sheng[Y]===X→父母, ke[X]===Y→妻财, ke[Y]===X→官鬼
 */
export function wuXingToLiuQin(targetWx: WuXing, gongWuXing: WuXing): LiuQin {
  if (targetWx === gongWuXing) return '兄弟';
  if (WUXING_SHENG[gongWuXing] === targetWx) return '子孙';
  if (WUXING_KE[gongWuXing] === targetWx) return '妻财';
  if (WUXING_SHENG[targetWx] === gongWuXing) return '父母';
  return '官鬼'; // WUXING_KE[targetWx] === gongWuXing
}

/**
 * 六亲→五行：给定卦宫五行和六亲，返回该六亲对应的五行。
 */
export function liuQinToWuXing(lq: LiuQin, gongWuXing: WuXing): WuXing {
  switch (lq) {
    case '兄弟': return gongWuXing;
    case '子孙': return WUXING_SHENG[gongWuXing];
    case '妻财': return WUXING_KE[gongWuXing];
    case '父母': {
      // 生我者：找 Y 使得 sheng[Y] === gongWuXing
      for (const wx of ['金', '木', '水', '火', '土'] as WuXing[]) {
        if (WUXING_SHENG[wx] === gongWuXing) return wx;
      }
      return gongWuXing; // unreachable
    }
    case '官鬼': {
      // 克我者：找 Y 使得 ke[Y] === gongWuXing
      for (const wx of ['金', '木', '水', '火', '土'] as WuXing[]) {
        if (WUXING_KE[wx] === gongWuXing) return wx;
      }
      return gongWuXing; // unreachable
    }
  }
}

/**
 * 计算原神、忌神、仇神。
 * - 原神 = 其五行生用神五行的六亲
 * - 忌神 = 其五行克用神五行的六亲
 * - 仇神 = 其五行生忌神五行的六亲（忌神的原神）
 */
export function computeYuanJiChou(
  yongShenLiuQin: LiuQin,
  gongWuXing: WuXing,
): { yuanShen: LiuQin; jiShen: LiuQin; chouShen: LiuQin } {
  const yongWx = liuQinToWuXing(yongShenLiuQin, gongWuXing);

  // 原神五行：生用神五行者
  let yuanShenWx: WuXing = '金';
  for (const wx of ['金', '木', '水', '火', '土'] as WuXing[]) {
    if (WUXING_SHENG[wx] === yongWx) { yuanShenWx = wx; break; }
  }
  const yuanShen = wuXingToLiuQin(yuanShenWx, gongWuXing);

  // 忌神五行：克用神五行者
  let jiShenWx: WuXing = '金';
  for (const wx of ['金', '木', '水', '火', '土'] as WuXing[]) {
    if (WUXING_KE[wx] === yongWx) { jiShenWx = wx; break; }
  }
  const jiShen = wuXingToLiuQin(jiShenWx, gongWuXing);

  // 仇神五行：生忌神五行者（忌神的原神）
  let chouShenWx: WuXing = '金';
  for (const wx of ['金', '木', '水', '火', '土'] as WuXing[]) {
    if (WUXING_SHENG[wx] === jiShenWx) { chouShenWx = wx; break; }
  }
  const chouShen = wuXingToLiuQin(chouShenWx, gongWuXing);

  return { yuanShen, jiShen, chouShen };
}

function stateOf(
  zhi: DiZhi, wuXing: WuXing, moving: boolean,
  monthZhi: DiZhi, dayZhi: DiZhi, xunKong: [DiZhi, DiZhi], bianZhi?: DiZhi,
): YaoState {
  return evalYao({ zhi, wuXing, moving, monthZhi, dayZhi, xunKong, bianZhi });
}

export function analyzeNajia(pan: Pan, opts: AnalyzeOptions): NajiaAnalysis {
  const { monthZhi, dayZhi } = opts;
  const sex: Sex = opts.sex ?? pan.gender;
  const xunKong = pan.xunKong;

  const byLiuQin = {} as Record<LiuQin, LiuQinOccurrence[]>;
  for (const q of SIX_QIN) byLiuQin[q] = [];

  const bianAt = (pos: number): BianYao | undefined =>
    pan.bianYaoList ? pan.bianYaoList[pos - 1] : undefined;

  const lines: LineState[] = [];

  pan.yaoList.forEach((yao) => {
    const pos = yao.position;
    const bianZhi = yao.moving ? bianAt(pos)?.zhi : undefined;
    const state = stateOf(yao.zhi, yao.wuXing, yao.moving, monthZhi, dayZhi, xunKong, bianZhi);
    const naJia = `${yao.gan}${yao.zhi}`;
    const occ: LiuQinOccurrence = {
      liuQin: yao.liuQin, pos, yao, naJia,
      liuShen: yao.liuShen, moving: yao.moving,
      shi: yao.shiYing === '世', ying: yao.shiYing === '应',
      hidden: false, state,
    };
    byLiuQin[yao.liuQin].push(occ);
    lines.push({
      pos, yao, liuQin: yao.liuQin, naJia, liuShen: yao.liuShen,
      moving: yao.moving, shi: occ.shi, ying: occ.ying, state,
    });
  });

  // 世/应：循环后从行数据派生（避免在 forEach 闭包内赋值导致类型窄化）
  const shiLine = lines.find((l) => l.shi);
  const yingLine = lines.find((l) => l.ying);
  const shi = shiLine ? { pos: shiLine.pos, occ: byLiuQin[shiLine.liuQin].find((o) => o.pos === shiLine.pos && !o.hidden)! } : null;
  const ying = yingLine ? { pos: yingLine.pos, occ: byLiuQin[yingLine.liuQin].find((o) => o.pos === yingLine.pos && !o.hidden)! } : null;

  // 伏神
  const hiddenOccs: LiuQinOccurrence[] = [];
  for (const h of pan.fuShenList as FuShen[]) {
    const fei = pan.yaoList[h.position - 1];
    const state = stateOf(h.zhi, h.wuXing, false, monthZhi, dayZhi, xunKong);
    const occ: LiuQinOccurrence = {
      liuQin: h.liuQin, pos: h.position,
      yao: fei, // 伏于该飞神爻之下
      naJia: `${h.gan}${h.zhi}`,
      liuShen: fei.liuShen, moving: false,
      shi: fei.shiYing === '世', ying: fei.shiYing === '应',
      hidden: true,
      hiddenUnder: `${fei.gan}${fei.zhi}${fei.liuQin}`,
      feiFuRelation: h.relation,
      state,
    };
    byLiuQin[h.liuQin].push(occ);
    hiddenOccs.push(occ);
  }

  // 动爻与变爻
  const dong: DongYao[] = pan.yaoList
    .filter((y) => y.moving)
    .map((yao) => {
      const pos = yao.position;
      const bian = bianAt(pos);
      const state = stateOf(yao.zhi, yao.wuXing, true, monthZhi, dayZhi, xunKong, bian?.zhi);
      return {
        pos, yao, liuQin: yao.liuQin, liuShen: yao.liuShen,
        shi: yao.shiYing === '世', ying: yao.shiYing === '应', state, bian,
      };
    });

  // 类神与世/应关系（客观五行；明神与伏神都列）
  const relations: RelFact[] = [];
  const pushRel = (occ: LiuQinOccurrence, target: '世爻' | '应爻', t: LiuQinOccurrence) => {
    const occZhi: DiZhi = occ.hidden
      ? (pan.fuShenList.find((f) => f.position === occ.pos && f.liuQin === occ.liuQin)?.zhi ?? occ.yao.zhi)
      : occ.yao.zhi;
    const isChong = LIU_CHONG[occZhi] === t.yao.zhi;
    const isHe = LIU_HE[occZhi] === t.yao.zhi;
    const rel = relationOf(occ.state.wuXing, t.state.wuXing);
    const base = isChong ? '冲' : isHe ? '合' : rel;
    // 组中性关系句：用主动语态 + 五行，如"世(卯木) 生 父母乙巳(火)"
    let desc: string;
    const label = `${occ.liuQin}${occ.naJia}`;
    const labelWx = occ.state.wuXing;
    const targetWx = t.state.wuXing;
    if (isChong || isHe) desc = `${label}(${labelWx})${base}${target}(${targetWx})`;
    else if (rel === '同') desc = `${label}(${labelWx}) 与 ${target}(${targetWx}) 比和`;
    else if (rel === '生' || rel === '克') desc = `${label}(${labelWx}) ${rel} ${target}(${targetWx})`;
    else {
      const action = rel === '被生' ? '生' : '克';
      desc = `${target}(${targetWx}) ${action} ${label}(${labelWx})`;
    }
    relations.push({
      from: `${occ.liuQin}（${posName(occ.pos)}${occ.hidden ? '·伏' : ''}）`,
      to: target, rel: base, desc,
    });
  };
  const allOcc = SIX_QIN.flatMap((q) => byLiuQin[q]);
  if (shi) for (const o of allOcc) {
    if (!o.hidden && o.pos === shi.pos) continue;
    pushRel(o, '世爻', shi.occ);
  }
  if (ying) for (const o of allOcc) {
    if (!o.hidden && o.pos === ying.pos) continue;
    pushRel(o, '应爻', ying.occ);
  }

  // 用神选取（分域）
  const yongshen = {} as Record<Domain, YongShenResult>;
  (Object.keys(DOMAIN_YONGSHEN) as Domain[]).forEach((d) => {
    let wanted = DOMAIN_YONGSHEN[d];
    if (d === '感情') wanted = sex === '女' ? ['官鬼'] : ['妻财'];
    const useYing = wanted.includes('应');
    const qinWanted = wanted.filter((w): w is LiuQin => w !== '应');
    const occs: LiuQinOccurrence[] = useYing && ying
      ? [ying.occ]
      : qinWanted.flatMap((w) => byLiuQin[w]);
    const absent = occs.length === 0;
    const note: string[] = [];
    if (useYing) {
      note.push('此域以应爻为用神（应爻为对方 / 所占之事）。');
    } else if (absent) {
      note.push(`${qinWanted.join('、')}不上卦，当查伏神；伏神亦无时再借象审察（见《增删卜易·用神不上卦章》）。`);
    } else if (occs.filter((o) => !o.hidden).length > 1) {
      note.push(`${qinWanted.join('、')}多现。《增删卜易》取用神之法：舍其闲爻而用持世、舍其安静而用发动、舍其月破而用不破、舍其旬空而用不空；此处仅罗列，不替占者定取。`);
    }
    if (occs.some((o) => o.hidden)) note.push('含伏神：本宫六亲不上卦而伏于飞神之下，需看飞伏生克与月日提携。');
    // 原神/忌神/仇神：仅当有明确六亲用神时计算（useYing=true 时不计算）
    let yuanShen: LiuQin | undefined;
    let jiShen: LiuQin | undefined;
    let chouShen: LiuQin | undefined;
    if (!useYing && qinWanted.length > 0) {
      // 多用神域取第一个用神计算（事业/疾病/考试等有两个用神，以首取者为主）
      const ysc = computeYuanJiChou(qinWanted[0], pan.benGua.gongWuXing);
      yuanShen = ysc.yuanShen;
      jiShen = ysc.jiShen;
      chouShen = ysc.chouShen;
    }
    yongshen[d] = { primary: qinWanted, useYing, occurrences: occs, absent, note, yuanShen, jiShen, chouShen };
  });

  return {
    lines, byLiuQin, shi, ying, dong,
    shiState: shi ? shi.occ.state : null,
    relations,
    yongshen,
    meta: {
      gong: pan.benGua.gong, gongWuXing: pan.benGua.gongWuXing,
      shiPos: shi ? shi.pos : null, yingPos: ying ? ying.pos : null,
      monthZhi, dayZhi, xunKong,
    },
  };
}

export function posName(pos: number): string {
  return ['初爻', '二爻', '三爻', '四爻', '五爻', '上爻'][pos - 1] ?? `${pos}爻`;
}
