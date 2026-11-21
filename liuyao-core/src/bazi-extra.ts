/**
 * 八字扩展层：神煞 · 刑冲合害 · 流年流月 · 旺衰依据
 *
 * 定位：只输出「可指认的事实 + 典籍出处」，不下吉凶断语。
 * 与 bazi.ts 的分工：bazi.ts 负责四柱本身（已验收），本文件只在其结果上叠加信息，不改任何柱。
 *
 * 口径与纪律：
 * 1. 神煞口诀一律照录原文并注明出处（《渊海子平》《三命通会》为主）；凡流派分歧的，
 *    note 里写明有哪几说、本盘取哪一说，并在文件内保留对照表，绝不静默选一种。
 * 2. 刑冲合害是确定性查表，输出带「柱位」的结构（positions），前端可据此画连线；
 *    同一柱位组合在 六合/六冲/相刑/相破 上可重叠（如寅亥既合又破），一律各算一条，不吞并。
 * 3. 流年干支复用 bazi.ts 的 liuNianGanZhiSequence（甲子=公元 4 年，60 循环），不另造表；
 *    流月的月干用五虎遁从流年干推出，月支按节气月（立春起寅）排列。
 * 4. 旺衰依据按「得令 / 得地 / 得生 / 得助 + 月令旺相休囚死」逐条列出，定强弱公式与
 *    app/js/verdicts.js judgeBazi 同型（月令同气/生我 +2、我生/我克 -1、克我 -2；
 *    日支同气或生我 +1；合计 >0 判偏旺）。
 *    consistent 字段是「漂移探针」：本文件独立复刻一遍 verdicts.js 的公式（legacy* 变量），
 *    与本节结论比对。两者不一致说明 app 侧公式又被改动，需同步——不是流派分歧。
 */
import { Solar } from 'lunar-javascript';
import type { BaziResult, HiddenGan } from './bazi.js';
import { tenGod, liuNianGanZhiSequence } from './bazi.js';
import { xunKongOf, listJieqiInRange } from './calendar.js';
import { lingTaiOf, type LingTai } from './wangshuai.js';
import { YANG_REN } from './shensha.js';
import type { DiZhi, TianGan, WuXing } from './types.js';

const GAN: TianGan[] = ['甲', '乙', '丙', '丁', '戊', '己', '庚', '辛', '壬', '癸'];
const ZHI: DiZhi[] = ['子', '丑', '寅', '卯', '辰', '巳', '午', '未', '申', '酉', '戌', '亥'];

const GAN_WX: Record<TianGan, WuXing> = {
  甲: '木', 乙: '木', 丙: '火', 丁: '火', 戊: '土',
  己: '土', 庚: '金', 辛: '金', 壬: '水', 癸: '水',
};
const ZHI_WX: Record<DiZhi, WuXing> = {
  子: '水', 丑: '土', 寅: '木', 卯: '木', 辰: '土', 巳: '火',
  午: '火', 未: '土', 申: '金', 酉: '金', 戌: '土', 亥: '水',
};
const SHENG: Record<WuXing, WuXing> = { 木: '火', 火: '土', 土: '金', 金: '水', 水: '木' };
const KE: Record<WuXing, WuXing> = { 木: '土', 土: '水', 水: '火', 火: '金', 金: '木' };

export const PILLAR_KEYS = ['year', 'month', 'day', 'time'] as const;
export type PillarPos = (typeof PILLAR_KEYS)[number];
/** 关系里的柱位：原局四柱 + 流年/流月（前端画连线时按此定位） */
export type RelPos = PillarPos | 'liuNian' | 'liuYue';

const PILLAR_CN: Record<PillarPos, string> = { year: '年柱', month: '月柱', day: '日柱', time: '时柱' };

// =====================================================================
// 一、神煞
// =====================================================================

/** 神煞查法起点：子平日法以日干/日支为主，年干/年支为古法（禄命法）遗存，两者并列不混；日柱＝整柱（旬空起点） */
export type ShenShaRef = '日干' | '日支' | '日柱' | '年干' | '年支' | '月支';

export interface ShenShaHit {
  name: string;
  ref: ShenShaRef;
  /** 起点值（如日干「己」） */
  refValue: string;
  /** 命中的字（干或支） */
  target: string;
  targetKind: '干' | '支';
  /** 命中在哪几柱 */
  positions: PillarPos[];
  /** 该支是否落日柱旬空（古法：贵人落空亡则减力） */
  luoKong: boolean;
  rule: string;
  source: string;
  note?: string;
}

export interface ShenShaSpec {
  name: string;
  source: string;
  rule: string;
  refs: ShenShaRef[];
  targetKind: '干' | '支' | '干支';
  note?: string;
}

export interface BaziShenSha {
  hits: ShenShaHit[];
  /** name → hits（同名多起点会合并） */
  byName: Record<string, ShenShaHit[]>;
  /** 命中的神煞名（按定义顺序去重） */
  present: string[];
  /** 未命中的神煞名 */
  absent: string[];
  /** 逐项定义（口诀/出处/查法），前端可作图例与口诀卡 */
  specs: ShenShaSpec[];
}

const SAN_HE_OF: Record<DiZhi, DiZhi[]> = {
  申: ['申', '子', '辰'], 子: ['申', '子', '辰'], 辰: ['申', '子', '辰'],
  巳: ['巳', '酉', '丑'], 酉: ['巳', '酉', '丑'], 丑: ['巳', '酉', '丑'],
  寅: ['寅', '午', '戌'], 午: ['寅', '午', '戌'], 戌: ['寅', '午', '戌'],
  亥: ['亥', '卯', '未'], 卯: ['亥', '卯', '未'], 未: ['亥', '卯', '未'],
};
/** 三合局五行：水/金/火/木（按三合组首支判） */
const SAN_HE_WX: Record<DiZhi, WuXing> = {
  申: '水', 子: '水', 辰: '水',
  巳: '金', 酉: '金', 丑: '金',
  寅: '火', 午: '火', 戌: '火',
  亥: '木', 卯: '木', 未: '木',
};
/** 三合局中神（帝旺）：半合必须见中神才算半合，否则只算拱合 */
const SAN_HE_MID: DiZhi[] = ['子', '午', '卯', '酉'];

/** 驿马：三合局长生之冲。申子辰马在寅、寅午戌马在申、巳酉丑马在亥、亥卯未马在巳 */
const YI_MA: Record<DiZhi, DiZhi> = {
  申: '寅', 子: '寅', 辰: '寅',
  巳: '亥', 酉: '亥', 丑: '亥',
  寅: '申', 午: '申', 戌: '申',
  亥: '巳', 卯: '巳', 未: '巳',
};
/** 桃花（咸池）：三合局沐浴位。申子辰在酉、寅午戌在卯、巳酉丑在午、亥卯未在子 */
const TAO_HUA: Record<DiZhi, DiZhi> = {
  申: '酉', 子: '酉', 辰: '酉',
  巳: '午', 酉: '午', 丑: '午',
  寅: '卯', 午: '卯', 戌: '卯',
  亥: '子', 卯: '子', 未: '子',
};
/** 华盖：三合局墓位。申子辰在辰、寅午戌在戌、巳酉丑在丑、亥卯未在未 */
const HUA_GAI: Record<DiZhi, DiZhi> = {
  申: '辰', 子: '辰', 辰: '辰',
  巳: '丑', 酉: '丑', 丑: '丑',
  寅: '戌', 午: '戌', 戌: '戌',
  亥: '未', 卯: '未', 未: '未',
};
/** 将星：三合局帝旺（中神）。申子辰在子、寅午戌在午、巳酉丑在酉、亥卯未在卯 */
const JIANG_XING: Record<DiZhi, DiZhi> = {
  申: '子', 子: '子', 辰: '子',
  巳: '酉', 酉: '酉', 丑: '酉',
  寅: '午', 午: '午', 戌: '午',
  亥: '卯', 卯: '卯', 未: '卯',
};

/** 孤辰：所属三会方（亥子丑/寅卯辰/巳午未/申酉戌）进前一辰 */
const GU_CHEN: Record<DiZhi, DiZhi> = {
  亥: '寅', 子: '寅', 丑: '寅',
  寅: '巳', 卯: '巳', 辰: '巳',
  巳: '申', 午: '申', 未: '申',
  申: '亥', 酉: '亥', 戌: '亥',
};
/** 寡宿：同方退后一辰 */
const GUA_SU: Record<DiZhi, DiZhi> = {
  亥: '戌', 子: '戌', 丑: '戌',
  寅: '丑', 卯: '丑', 辰: '丑',
  巳: '辰', 午: '辰', 未: '辰',
  申: '未', 酉: '未', 戌: '未',
};

/** 天乙贵人（《三命通会》通行本）：甲戊庚牛羊、乙己鼠猴乡、丙丁猪鸡位、壬癸兔蛇藏、六辛逢马虎 */
const TIAN_YI: Record<TianGan, DiZhi[]> = {
  甲: ['丑', '未'], 戊: ['丑', '未'], 庚: ['丑', '未'],
  乙: ['子', '申'], 己: ['子', '申'],
  丙: ['亥', '酉'], 丁: ['亥', '酉'],
  壬: ['卯', '巳'], 癸: ['卯', '巳'],
  辛: ['午', '寅'],
};
/** 文昌：甲巳乙午、丙戊申、丁己酉、庚亥、辛子、壬寅、癸卯 */
const WEN_CHANG: Record<TianGan, DiZhi> = {
  甲: '巳', 乙: '午', 丙: '申', 丁: '酉', 戊: '申',
  己: '酉', 庚: '亥', 辛: '子', 壬: '寅', 癸: '卯',
};
// 羊刃表不在此定义：与六爻神煞层共用 shensha.ts 的 YANG_REN（出处《三命通会·论羊刃》）。
/** 金舆：禄前二位。甲辰 乙巳 丙戊未 丁己申 庚戌 辛亥 壬丑 癸寅 */
const JIN_YU: Record<TianGan, DiZhi> = {
  甲: '辰', 乙: '巳', 丙: '未', 丁: '申', 戊: '未',
  己: '申', 庚: '戌', 辛: '亥', 壬: '丑', 癸: '寅',
};
/** 天德：正月丁、二月申、三月壬、四月辛、五月亥、六月甲、七月癸、八月寅、九月丙、十月乙、冬月巳、腊月庚 */
const TIAN_DE: Record<DiZhi, string> = {
  寅: '丁', 卯: '申', 辰: '壬', 巳: '辛', 午: '亥', 未: '甲',
  申: '癸', 酉: '寅', 戌: '丙', 亥: '乙', 子: '巳', 丑: '庚',
};
/** 月德：寅午戌月在丙、申子辰月在壬、亥卯未月在甲、巳酉丑月在庚 */
const YUE_DE: Record<DiZhi, TianGan> = {
  寅: '丙', 午: '丙', 戌: '丙',
  申: '壬', 子: '壬', 辰: '壬',
  亥: '甲', 卯: '甲', 未: '甲',
  巳: '庚', 酉: '庚', 丑: '庚',
};

const SHEN_SHA_SPECS: ShenShaSpec[] = [
  {
    name: '天乙贵人',
    source: '《三命通会·论天乙贵人》（并见《渊海子平·论起玉堂天乙贵人》）',
    rule: '甲戊庚牛羊，乙己鼠猴乡，丙丁猪鸡位，壬癸兔蛇藏，六辛逢马虎，此是贵人方。',
    refs: ['日干', '年干'],
    targetKind: '支',
    note: '《渊海子平·论起玉堂天乙贵人》原文作「甲戊兼牛羊……庚辛逢马虎」，则甲戊同取丑未、庚辛同取午寅（庚不复取丑未，辛亦非丑未）；本盘从《三命通会》通行本「甲戊庚牛羊……六辛逢马虎」，庚并取丑未。辰戌为魁罡，天乙不临，两说皆然。',
  },
  {
    name: '文昌',
    source: '《渊海子平·论文昌》',
    rule: '甲乙巳午报君知，丙戊申宫丁己鸡，庚猪辛鼠壬逢虎，癸人见卯入云梯。',
    refs: ['日干', '年干'],
    targetKind: '支',
  },
  {
    name: '驿马',
    source: '《三命通会·论驿马》',
    rule: '申子辰马在寅，寅午戌马在申，巳酉丑马在亥，亥卯未马在巳。',
    refs: ['日支', '年支'],
    targetKind: '支',
    note: '查法有两派：以日支为主（子平日法，本盘先列日支）与以年支为主（古法）；两派结果并列，不互相覆盖。',
  },
  {
    name: '桃花',
    source: '《三命通会·论咸池》',
    rule: '申子辰在酉，寅午戌在卯，巳酉丑在午，亥卯未在子。',
    refs: ['日支', '年支'],
    targetKind: '支',
    note: '即咸池，又名败神；同样有「日支查」与「年支查」两派，本盘并列。',
  },
  {
    name: '羊刃',
    source: '《三命通会·论阳刃》《论羊刃》',
    rule: '羊刃常居禄前一辰：甲卯、乙辰、丙戊午、丁己未、庚酉、辛戌、壬子、癸丑。',
    refs: ['日干'],
    targetKind: '支',
    note: '子平论刃只以日干（年干不论刃，故不再并列年干）。表与六爻神煞层共用 shensha.ts 的 YANG_REN。「惟五阳干有刃」是《论阳刃》的阳刃格之说，不是本条神煞，详见 shensha.ts 表注。',
  },
  {
    name: '空亡',
    source: '《渊海子平·论旬空》',
    rule: '甲子旬中戌亥空，甲戌旬中申酉空，甲申旬中午未空，甲午旬中辰巳空，甲辰旬中寅卯空，甲寅旬中子丑空。',
    refs: ['日支'],
    targetKind: '支',
    note: '以日柱所在旬查四支（年空/月空/日空/时空）。本盘日空亡亦单列在盘头。',
  },
  {
    name: '孤辰',
    source: '《三命通会·论孤辰寡宿》',
    rule: '亥子丑人进前一辰见寅为孤，寅卯辰人见巳，巳午未人见申，申酉戌人见亥。',
    refs: ['年支', '日支'],
    targetKind: '支',
    note: '原法以年支查（年支所属三会方进一辰），亦有以日支查者，本盘并列。',
  },
  {
    name: '寡宿',
    source: '《三命通会·论孤辰寡宿》',
    rule: '亥子丑人退后一辰见戌为寡，寅卯辰人见丑，巳午未人见辰，申酉戌人见未。',
    refs: ['年支', '日支'],
    targetKind: '支',
    note: '同上，年支/日支两派并列。',
  },
  {
    name: '丧门',
    source: '《三命通会·总论诸神煞》（并见《协纪辨方书》引《纪岁历》）',
    rule: '丧门者，太岁前二辰（顺行二位）：子年见寅、丑年见卯，余仿此。',
    refs: ['年支'],
    targetKind: '支',
    note: '原为岁神（随流年太岁走），本命盘上以出生年支当太岁取位；流年部分的丧门另按当年太岁重算。',
  },
  {
    name: '吊客',
    source: '《三命通会·总论诸神煞》（并见《协纪辨方书》引《纪岁历》）',
    rule: '吊客者，太岁后二辰（逆行二位）：子年见戌、丑年见亥，余仿此。',
    refs: ['年支'],
    targetKind: '支',
    note: '同上，岁神；本命盘以出生年支当太岁取位。',
  },
  {
    name: '天德',
    source: '《三命通会·论天月二德》',
    rule: '正丁二申三壬四辛五亥六甲七癸八寅九丙十乙冬巳腊庚（正月起寅，按节气月）。',
    refs: ['月支'],
    targetKind: '干支',
    note: '天德所临或为天干或为地支（如二月申、五月亥、八月寅、冬月巳为支），故干支皆查。',
  },
  {
    name: '月德',
    source: '《三命通会·论天月二德》',
    rule: '寅午戌月在丙，申子辰月在壬，亥卯未月在甲，巳酉丑月在庚。',
    refs: ['月支'],
    targetKind: '干',
  },
  {
    name: '华盖',
    source: '《三命通会·论华盖》',
    rule: '申子辰见辰，寅午戌见戌，巳酉丑见丑，亥卯未见未（三合局墓位）。',
    refs: ['日支', '年支'],
    targetKind: '支',
  },
  {
    name: '将星',
    source: '《三命通会·论将星》',
    rule: '申子辰在子，寅午戌在午，巳酉丑在酉，亥卯未在卯（三合局帝旺）。',
    refs: ['日支', '年支'],
    targetKind: '支',
  },
  {
    name: '金舆',
    source: '《三命通会·论金舆》',
    rule: '甲龙乙蛇丙戊羊，丁己猴头庚狗当，辛猪壬牛癸逢虎，此是金舆贵人乡。',
    refs: ['日干', '年干'],
    targetKind: '支',
    note: '金舆为禄前二位：甲禄寅故舆辰、乙禄卯故舆巳，与羊刃「禄前一位」同源。',
  },
];

/** 12 项验收神煞（丧门/吊客、天德/月德、孤辰/寡宿按「一项两名」合并计数） */
const SHEN_SHA_ITEMS: string[][] = [
  ['天乙贵人'], ['文昌'], ['驿马'], ['桃花'], ['羊刃'], ['空亡'],
  ['孤辰', '寡宿'], ['丧门', '吊客'], ['天德', '月德'], ['华盖'], ['将星'], ['金舆'],
];

function refValueOf(bz: BaziResult, ref: ShenShaRef): { value: string; kind: '干' | '支' } {
  switch (ref) {
    case '日干': return { value: bz.day.gan, kind: '干' };
    case '日支': return { value: bz.day.zhi, kind: '支' };
    case '日柱': return { value: bz.day.ganZhi, kind: '支' };
    case '年干': return { value: bz.year.gan, kind: '干' };
    case '年支': return { value: bz.year.zhi, kind: '支' };
    case '月支': return { value: bz.month.zhi, kind: '支' };
  }
}

/** 神煞取值的总表：name → 起点值 → 目标字[] */
function targetsOf(name: string, refValue: string, refKind: '干' | '支'): string[] {
  const key = refValue as TianGan & DiZhi;
  switch (name) {
    case '天乙贵人': return refKind === '干' ? TIAN_YI[key as TianGan] : [];
    case '文昌': return refKind === '干' ? [WEN_CHANG[key as TianGan]] : [];
    case '羊刃': return refKind === '干' ? [YANG_REN[key as TianGan]] : [];
    case '金舆': return refKind === '干' ? [JIN_YU[key as TianGan]] : [];
    case '驿马': return refKind === '支' ? [YI_MA[key as DiZhi]] : [];
    case '桃花': return refKind === '支' ? [TAO_HUA[key as DiZhi]] : [];
    case '华盖': return refKind === '支' ? [HUA_GAI[key as DiZhi]] : [];
    case '将星': return refKind === '支' ? [JIANG_XING[key as DiZhi]] : [];
    case '孤辰': return refKind === '支' ? [GU_CHEN[key as DiZhi]] : [];
    case '寡宿': return refKind === '支' ? [GUA_SU[key as DiZhi]] : [];
    case '丧门': return refKind === '支' ? [ZHI[(ZHI.indexOf(key as DiZhi) + 2) % 12]] : [];
    case '吊客': return refKind === '支' ? [ZHI[(ZHI.indexOf(key as DiZhi) + 10) % 12]] : [];
    case '天德': return refKind === '支' ? [TIAN_DE[key as DiZhi]] : [];
    case '月德': return refKind === '支' ? [YUE_DE[key as DiZhi]] : [];
    case '空亡': return []; // 由旬空单独算
    default: return [];
  }
}

export function baziShenSha(bz: BaziResult): BaziShenSha {
  const hits: ShenShaHit[] = [];
  const xunKong = bz.xunKong;

  for (const spec of SHEN_SHA_SPECS) {
    if (spec.name === '空亡') {
      // 旬空：日柱所在旬的两个空支，看四支谁落在空亡
      const positions = PILLAR_KEYS.filter((k) => xunKong.includes(bz[k].zhi));
      if (positions.length) {
        hits.push({
          name: '空亡',
          ref: '日柱',
          refValue: bz.day.ganZhi,
          target: positions.map((k) => bz[k].zhi).join('、'),
          targetKind: '支',
          positions: [...positions],
          luoKong: false,
          rule: spec.rule,
          source: spec.source,
          note: spec.note,
        });
      }
      continue;
    }
    for (const ref of spec.refs) {
      const rv = refValueOf(bz, ref);
      const targets = targetsOf(spec.name, rv.value, rv.kind);
      for (const t of targets) {
        const isGan = GAN.includes(t as TianGan);
        const positions = PILLAR_KEYS.filter((k) =>
          (isGan ? bz[k].gan : bz[k].zhi) === t);
        if (!positions.length) continue;
        hits.push({
          name: spec.name,
          ref,
          refValue: rv.value,
          target: t,
          targetKind: isGan ? '干' : '支',
          positions: [...positions],
          luoKong: !isGan && xunKong.includes(t as DiZhi),
          rule: spec.rule,
          source: spec.source,
          note: spec.note,
        });
      }
    }
  }

  const byName: Record<string, ShenShaHit[]> = {};
  for (const h of hits) (byName[h.name] ||= []).push(h);

  const present: string[] = [];
  for (const group of SHEN_SHA_ITEMS) {
    present.push(...group.filter((n) => byName[n] && byName[n].length));
  }
  // absent 按「名」逐项列（同组内命中其一，另一名仍算未见，便于直播时一句话交代）
  const absent = SHEN_SHA_SPECS.map((s) => s.name).filter((n) => !present.includes(n));

  return { hits, byName, present, absent, specs: SHEN_SHA_SPECS };
}

// =====================================================================
// 二、刑冲合害（地支 / 天干）
// =====================================================================

export type ZhiRelKind =
  | '六冲' | '六合' | '三合' | '半合' | '拱合'
  | '三刑' | '相刑' | '自刑' | '六害' | '相破';

export interface ZhiRelation {
  kind: ZhiRelKind;
  zhis: DiZhi[];
  positions: RelPos[];
  /** 合化五行（仅六合/三合/半合/拱合有） */
  huaWuXing?: WuXing;
  name: string;
  source: string;
}

export type GanRelKind = '五合' | '相冲';

export interface GanRelation {
  kind: GanRelKind;
  gans: [TianGan, TianGan];
  positions: [RelPos, RelPos];
  huaWuXing?: WuXing;
  name: string;
  source: string;
}

export interface GanZhiUnit { pos: RelPos; gan?: TianGan; zhi?: DiZhi }
export interface ZhiUnit { pos: RelPos; zhi: DiZhi }
export interface GanUnit { pos: RelPos; gan: TianGan }

const LIU_CHONG: Record<DiZhi, DiZhi> = {
  子: '午', 午: '子', 丑: '未', 未: '丑', 寅: '申', 申: '寅',
  卯: '酉', 酉: '卯', 辰: '戌', 戌: '辰', 巳: '亥', 亥: '巳',
};
/** 六合（附化气）：子丑合土、寅亥合木、卯戌合火、辰酉合金、巳申合水、午未合土 */
const LIU_HE: Record<DiZhi, { zhi: DiZhi; wx: WuXing }> = {
  子: { zhi: '丑', wx: '土' }, 丑: { zhi: '子', wx: '土' },
  寅: { zhi: '亥', wx: '木' }, 亥: { zhi: '寅', wx: '木' },
  卯: { zhi: '戌', wx: '火' }, 戌: { zhi: '卯', wx: '火' },
  辰: { zhi: '酉', wx: '金' }, 酉: { zhi: '辰', wx: '金' },
  巳: { zhi: '申', wx: '水' }, 申: { zhi: '巳', wx: '水' },
  午: { zhi: '未', wx: '土' }, 未: { zhi: '午', wx: '土' },
};
/** 六害（穿）：子未、丑午、寅巳、卯辰、申亥、酉戌 */
const LIU_HAI: Record<DiZhi, DiZhi> = {
  子: '未', 未: '子', 丑: '午', 午: '丑', 寅: '巳', 巳: '寅',
  卯: '辰', 辰: '卯', 申: '亥', 亥: '申', 酉: '戌', 戌: '酉',
};
/** 相破：子酉、丑辰、寅亥、卯午、巳申、未戌 */
const XIANG_PO: Record<DiZhi, DiZhi> = {
  子: '酉', 酉: '子', 丑: '辰', 辰: '丑', 寅: '亥', 亥: '寅',
  卯: '午', 午: '卯', 巳: '申', 申: '巳', 未: '戌', 戌: '未',
};
/** 三刑三组（子卯另列无礼之刑；辰午酉亥为自刑） */
const SAN_XING_GROUPS: Array<{ zhis: DiZhi[]; name: string }> = [
  { zhis: ['寅', '巳', '申'], name: '无恩之刑' },
  { zhis: ['丑', '戌', '未'], name: '恃势之刑' },
];
const WU_LI_XING: [DiZhi, DiZhi] = ['子', '卯'];
const ZI_XING: DiZhi[] = ['辰', '午', '酉', '亥'];

const SAN_HE_GROUPS: Array<{ zhis: DiZhi[]; wx: WuXing }> = [
  { zhis: ['申', '子', '辰'], wx: '水' },
  { zhis: ['亥', '卯', '未'], wx: '木' },
  { zhis: ['寅', '午', '戌'], wx: '火' },
  { zhis: ['巳', '酉', '丑'], wx: '金' },
];

/** 天干五合：甲己合土、乙庚合金、丙辛合水、丁壬合木、戊癸合火 */
const GAN_HE: Array<{ pair: [TianGan, TianGan]; wx: WuXing }> = [
  { pair: ['甲', '己'], wx: '土' },
  { pair: ['乙', '庚'], wx: '金' },
  { pair: ['丙', '辛'], wx: '水' },
  { pair: ['丁', '壬'], wx: '木' },
  { pair: ['戊', '癸'], wx: '火' },
];
/** 天干相冲（四冲，戊己居中不冲）：甲庚、乙辛、丙壬、丁癸 */
const GAN_CHONG: Array<[TianGan, TianGan]> = [
  ['甲', '庚'], ['乙', '辛'], ['丙', '壬'], ['丁', '癸'],
];

const posCN = (p: RelPos): string =>
  p === 'liuNian' ? '流年' : p === 'liuYue' ? '流月' : PILLAR_CN[p];

/**
 * 地支关系全查：六冲 / 六合 / 三合 / 半合 / 拱合 / 三刑 / 相刑 / 自刑 / 六害 / 相破。
 * 输入按「柱位 + 地支」给，输出每条带 positions，前端可直接连线。
 */
export function zhiRelations(units: ZhiUnit[]): ZhiRelation[] {
  const out: ZhiRelation[] = [];
  const seen = new Set<string>();
  const push = (r: ZhiRelation) => {
    const key = `${r.kind}|${r.zhis.slice().sort().join('')}|${r.positions.slice().sort().join(',')}`;
    if (!seen.has(key)) { seen.add(key); out.push(r); }
  };

  // —— 两两关系 ——
  for (let i = 0; i < units.length; i++) {
    for (let j = i + 1; j < units.length; j++) {
      const a = units[i], b = units[j];
      const pair = `${posCN(a.pos)}${a.zhi}${posCN(b.pos)}${b.zhi}`;
      if (LIU_CHONG[a.zhi] === b.zhi) {
        push({ kind: '六冲', zhis: [a.zhi, b.zhi], positions: [a.pos, b.pos], name: `${pair}冲`, source: '《三命通会·论支冲》' });
      }
      if (LIU_HE[a.zhi].zhi === b.zhi) {
        push({ kind: '六合', zhis: [a.zhi, b.zhi], positions: [a.pos, b.pos], huaWuXing: LIU_HE[a.zhi].wx, name: `${pair}合${LIU_HE[a.zhi].wx}`, source: '《三命通会·论支合》' });
      }
      if (LIU_HAI[a.zhi] === b.zhi) {
        push({ kind: '六害', zhis: [a.zhi, b.zhi], positions: [a.pos, b.pos], name: `${pair}相害`, source: '《三命通会·论六害》' });
      }
      if (XIANG_PO[a.zhi] === b.zhi) {
        push({ kind: '相破', zhis: [a.zhi, b.zhi], positions: [a.pos, b.pos], name: `${pair}相破`, source: '《三命通会·论支破》' });
      }
      // 相刑（两两）：寅巳/巳申/寅申、丑戌/戌未/丑未、子卯；同支不在此列（自刑另算）
      if (a.zhi !== b.zhi) {
        for (const g of SAN_XING_GROUPS) {
          if (g.zhis.includes(a.zhi) && g.zhis.includes(b.zhi)) {
            push({ kind: '相刑', zhis: [a.zhi, b.zhi], positions: [a.pos, b.pos], name: `${pair}相刑（${g.name}）`, source: '《三命通会·论三刑》' });
          }
        }
        if ((a.zhi === WU_LI_XING[0] && b.zhi === WU_LI_XING[1]) || (a.zhi === WU_LI_XING[1] && b.zhi === WU_LI_XING[0])) {
          push({ kind: '相刑', zhis: [a.zhi, b.zhi], positions: [a.pos, b.pos], name: `${pair}相刑（无礼之刑）`, source: '《三命通会·论三刑》' });
        }
      }
    }
  }

  // —— 三合 / 半合 / 拱合 ——
  for (const g of SAN_HE_GROUPS) {
    const found = g.zhis.map((z) => units.filter((u) => u.zhi === z));
    const presentCount = found.filter((f) => f.length > 0).length;
    if (presentCount === 3) {
      push({
        kind: '三合',
        zhis: [...g.zhis],
        positions: found.map((f) => f[0].pos),
        huaWuXing: g.wx,
        name: `${g.zhis.join('')}三合${g.wx}局`,
        source: '《三命通会·论三合》',
      });
    } else if (presentCount === 2) {
      const presentZhis = g.zhis.filter((z) => units.some((u) => u.zhi === z));
      const hasMid = presentZhis.some((z) => SAN_HE_MID.includes(z));
      const positions = presentZhis.map((z) => units.find((u) => u.zhi === z)!.pos);
      push({
        kind: hasMid ? '半合' : '拱合',
        zhis: presentZhis,
        positions,
        huaWuXing: g.wx,
        name: `${presentZhis.join('')}${hasMid ? '半合' : '拱'}${g.wx}局`,
        source: '《三命通会·论三合》（半合须见中神，无中神只作拱合）',
      });
    }
  }

  // —— 三刑（三支齐全）——
  for (const g of SAN_XING_GROUPS) {
    if (g.zhis.every((z) => units.some((u) => u.zhi === z))) {
      push({
        kind: '三刑',
        zhis: [...g.zhis],
        positions: g.zhis.map((z) => units.find((u) => u.zhi === z)!.pos),
        name: `${g.zhis.join('')}三刑（${g.name}）`,
        source: '《三命通会·论三刑》',
      });
    }
  }

  // —— 自刑 ——
  for (const z of ZI_XING) {
    const same = units.filter((u) => u.zhi === z);
    if (same.length >= 2) {
      push({
        kind: '自刑',
        zhis: [z, z],
        positions: same.map((u) => u.pos),
        name: `${z}${z}自刑`,
        source: '《三命通会·论三刑》（辰午酉亥自刑）',
      });
    }
  }

  return out;
}

/** 天干关系：五合（附化气）/ 相冲 */
export function ganRelations(units: GanUnit[]): GanRelation[] {
  const out: GanRelation[] = [];
  const seen = new Set<string>();
  const push = (r: GanRelation) => {
    const key = `${r.kind}|${r.gans.slice().sort().join('')}|${r.positions.slice().sort().join(',')}`;
    if (!seen.has(key)) { seen.add(key); out.push(r); }
  };
  for (let i = 0; i < units.length; i++) {
    for (let j = i + 1; j < units.length; j++) {
      const a = units[i], b = units[j];
      for (const h of GAN_HE) {
        if ((a.gan === h.pair[0] && b.gan === h.pair[1]) || (a.gan === h.pair[1] && b.gan === h.pair[0])) {
          push({
            kind: '五合',
            gans: [a.gan, b.gan],
            positions: [a.pos, b.pos],
            huaWuXing: h.wx,
            name: `${a.gan}${b.gan}合${h.wx}`,
            source: '《三命通会·论天干合》',
          });
        }
      }
      for (const [x, y] of GAN_CHONG) {
        if ((a.gan === x && b.gan === y) || (a.gan === y && b.gan === x)) {
          push({
            kind: '相冲',
            gans: [a.gan, b.gan],
            positions: [a.pos, b.pos],
            name: `${a.gan}${b.gan}冲`,
            source: '《三命通会·论天干相冲》',
          });
        }
      }
    }
  }
  return out;
}

/** 原局四柱 → 关系查表输入 */
export function natalUnits(bz: BaziResult): { zhi: ZhiUnit[]; gan: GanUnit[] } {
  return {
    zhi: PILLAR_KEYS.map((k) => ({ pos: k, zhi: bz[k].zhi })),
    gan: PILLAR_KEYS.map((k) => ({ pos: k, gan: bz[k].gan })),
  };
}

export interface BaziRelations {
  zhi: ZhiRelation[];
  gan: GanRelation[];
}

export function baziRelations(bz: BaziResult): BaziRelations {
  const u = natalUnits(bz);
  return { zhi: zhiRelations(u.zhi), gan: ganRelations(u.gan) };
}

// =====================================================================
// 三、流年 / 流月
// =====================================================================

/** 六十甲子纳音（两两一组，30 名） */
const NA_YIN_60 = [
  '海中金', '炉中火', '大林木', '路旁土', '剑锋金', '山头火',
  '涧下水', '城头土', '白蜡金', '杨柳木', '泉中水', '屋上土',
  '霹雳火', '松柏木', '长流水', '砂中金', '山下火', '平地木',
  '壁上土', '金箔金', '覆灯火', '天河水', '大驿土', '钗钏金',
  '桑柘木', '大溪水', '沙中土', '天上火', '石榴木', '大海水',
];

/** 六十甲子序号（甲子=0） */
function jiaZiIndex(ganZhi: string): number {
  const g = GAN.indexOf(ganZhi.charAt(0) as TianGan);
  const z = ZHI.indexOf(ganZhi.charAt(1) as DiZhi);
  if (g < 0 || z < 0) throw new Error(`非法干支: ${ganZhi}`);
  for (let i = 0; i < 60; i++) {
    if (i % 10 === g && i % 12 === z) return i;
  }
  throw new Error(`非法干支组合: ${ganZhi}`);
}

export function naYinOf(ganZhi: string): string {
  return NA_YIN_60[Math.floor(jiaZiIndex(ganZhi) / 2)];
}

const ZHI_HIDE: Record<DiZhi, TianGan[]> = {
  子: ['癸'], 丑: ['己', '癸', '辛'], 寅: ['甲', '丙', '戊'], 卯: ['乙'],
  辰: ['戊', '乙', '癸'], 巳: ['丙', '庚', '戊'], 午: ['丁', '己'],
  未: ['己', '丁', '乙'], 申: ['庚', '壬', '戊'], 酉: ['辛'],
  戌: ['戊', '辛', '丁'], 亥: ['壬', '甲'],
};
const HIDE_ROLES: HiddenGan['role'][] = ['本气', '中气', '余气'];

function hiddenOf(zhi: DiZhi, dayGan: TianGan): HiddenGan[] {
  return ZHI_HIDE[zhi].map((g, i) => ({ gan: g, tenGod: tenGod(dayGan, g), role: HIDE_ROLES[i] }));
}

/** 太岁与生年支的关系（值/冲/刑/害/破/合，可并存：如 未戌 既破又刑） */
export type TaiSuiKind = '值太岁' | '冲太岁' | '刑太岁' | '害太岁' | '破太岁' | '合太岁';

function taiSuiKinds(natalYearZhi: DiZhi, yearZhi: DiZhi): TaiSuiKind[] {
  const kinds: TaiSuiKind[] = [];
  if (natalYearZhi === yearZhi) kinds.push('值太岁');
  if (LIU_CHONG[natalYearZhi] === yearZhi) kinds.push('冲太岁');
  for (const g of SAN_XING_GROUPS) {
    if (natalYearZhi !== yearZhi && g.zhis.includes(natalYearZhi) && g.zhis.includes(yearZhi)) kinds.push('刑太岁');
  }
  if ((natalYearZhi === '子' && yearZhi === '卯') || (natalYearZhi === '卯' && yearZhi === '子')) kinds.push('刑太岁');
  if (ZI_XING.includes(natalYearZhi) && natalYearZhi === yearZhi) kinds.push('刑太岁');
  if (LIU_HAI[natalYearZhi] === yearZhi) kinds.push('害太岁');
  if (XIANG_PO[natalYearZhi] === yearZhi) kinds.push('破太岁');
  if (LIU_HE[natalYearZhi].zhi === yearZhi) kinds.push('合太岁');
  return kinds;
}

export interface DaYunRef {
  ganZhi: string;
  startYear: number;
  endYear: number;
  startAge: number;
  endAge: number;
  ganTenGod: string;
}

export interface LiuNianInfo {
  year: number;
  ganZhi: string;
  gan: TianGan;
  zhi: DiZhi;
  naYin: string;
  ganTenGod: string;
  zhiTenGod: string;
  hidden: HiddenGan[];
  xunKong: [DiZhi, DiZhi];
  zhiRelations: ZhiRelation[];
  ganRelations: GanRelation[];
  taiSui: { zhi: DiZhi; kinds: TaiSuiKind[]; text: string };
  shenSha: { sangMen: DiZhi; diaoKe: DiZhi };
  daYun: DaYunRef | null;
  /** 岁运并临：流年干支与所在大运干支相同 */
  suiYunBingLin: boolean;
  note: string;
}

export function liuNian(bz: BaziResult, year: number): LiuNianInfo {
  // 复用 bazi.ts 的 60 甲子序列（不另造表）：甲子 = 公元 4 年
  const ganZhi = liuNianGanZhiSequence(year, 1)[0].ganZhi;
  const gan = ganZhi.charAt(0) as TianGan;
  const zhi = ganZhi.charAt(1) as DiZhi;
  const dayGan = bz.dayMaster;

  const zhiUnits: ZhiUnit[] = [
    ...PILLAR_KEYS.map((k) => ({ pos: k as RelPos, zhi: bz[k].zhi })),
    { pos: 'liuNian' as RelPos, zhi },
  ];
  const ganUnits: GanUnit[] = [
    ...PILLAR_KEYS.map((k) => ({ pos: k as RelPos, gan: bz[k].gan })),
    { pos: 'liuNian' as RelPos, gan },
  ];

  const kind = taiSuiKinds(bz.year.zhi, zhi);
  const daYun = bz.daYun.list.find((d) => year >= d.startYear && year <= d.endYear);
  const daYunRef: DaYunRef | null = daYun
    ? { ...daYun, ganTenGod: tenGod(dayGan, daYun.ganZhi.charAt(0) as TianGan) }
    : null;

  return {
    year,
    ganZhi,
    gan,
    zhi,
    naYin: naYinOf(ganZhi),
    ganTenGod: tenGod(dayGan, gan),
    zhiTenGod: tenGod(dayGan, ZHI_HIDE[zhi][0]),
    hidden: hiddenOf(zhi, dayGan),
    xunKong: xunKongOf(ganZhi),
    zhiRelations: zhiRelations(zhiUnits).filter((r) => r.positions.includes('liuNian')),
    ganRelations: ganRelations(ganUnits).filter((r) => r.positions.includes('liuNian')),
    taiSui: {
      zhi,
      kinds: kind,
      text: kind.length
        ? `流年太岁${zhi}与生年${bz.year.zhi}：${kind.join('、')}`
        : `流年太岁${zhi}与生年${bz.year.zhi}无值、冲、刑、害、破、合`,
    },
    shenSha: {
      sangMen: ZHI[(ZHI.indexOf(zhi) + 2) % 12],
      diaoKe: ZHI[(ZHI.indexOf(zhi) + 10) % 12],
    },
    daYun: daYunRef,
    suiYunBingLin: !!daYun && daYun.ganZhi === ganZhi,
    note: '流年干支按 60 甲子连续（立春为界）；太岁关系以生年支为准，古法另有以日支论者。',
  };
}

export function liuNianList(bz: BaziResult, fromYear: number, count: number): LiuNianInfo[] {
  const out: LiuNianInfo[] = [];
  for (let i = 0; i < count; i++) out.push(liuNian(bz, fromYear + i));
  return out;
}

/** 五虎遁：年干 → 寅月月干 */
const WU_HU_DUN: Record<TianGan, TianGan> = {
  甲: '丙', 己: '丙',
  乙: '戊', 庚: '戊',
  丙: '庚', 辛: '庚',
  丁: '壬', 壬: '壬',
  戊: '甲', 癸: '甲',
};
/** 节气月名（立春起寅）与对应的「节」 */
const JIE_OF_MONTH: string[] = ['立春', '惊蛰', '清明', '立夏', '芒种', '小暑', '立秋', '白露', '寒露', '立冬', '大雪', '小寒'];

/**
 * 取某年某「节」的交节时刻。
 * 首选 lunar-javascript 的节气表（精确到分）；本项目 vendor.d.ts 只补了该库的最小声明，
 * 未声明 getJieQiTable，故此处按运行时真实 API 做一次窄类型断言（不改声明文件）。
 * 若取不到（库升级改名等），退回 calendar.listJieqiInRange（日精度，kind='jie'），不让上层崩。
 */
function jieqiMoment(year: number, name: string): { ymd: string; text: string } {
  try {
    const lunar = Solar.fromYmdHms(year, 6, 15, 12, 0, 0).getLunar() as unknown as {
      getJieQiTable(): Record<string, { toYmd(): string; toYmdHms(): string; getYear(): number }>;
    };
    const table = lunar.getJieQiTable();
    const s = table[name];
    if (s && s.getYear() === year) {
      return { ymd: s.toYmd(), text: s.toYmdHms().slice(0, 16) };
    }
  } catch { /* 落回日精度 */ }
  const jie = listJieqiInRange({ year, month: 2, day: 1 }, 400)
    .filter((i) => i.kind === 'jie' && i.name === name && Number(i.solarDate.slice(0, 4)) === year);
  if (jie.length) return { ymd: jie[0].solarDate, text: `${jie[0].solarDate}（日精度）` };
  throw new Error(`节气表缺 ${year} ${name}`);
}

export interface LiuYueInfo {
  index: number; // 1..12（寅=1）
  jieqi: string;
  startDate: string; // YYYY-MM-DD
  startText: string; // YYYY-MM-DD HH:mm
  ganZhi: string;
  gan: TianGan;
  zhi: DiZhi;
  naYin: string;
  ganTenGod: string;
  zhiTenGod: string;
  zhiRelations: ZhiRelation[];
  ganRelations: GanRelation[];
}

/**
 * 流月：给定「立春年」，输出寅月…丑月共 12 个月。
 * 月干用五虎遁从流年干起，月支按节气月固定（立春=寅），交节日期取 exact 节气。
 */
export function liuYueList(bz: BaziResult, year: number): LiuYueInfo[] {
  const yearGanZhi = liuNianGanZhiSequence(year, 1)[0].ganZhi;
  const yearGan = yearGanZhi.charAt(0) as TianGan;
  const firstGan = WU_HU_DUN[yearGan];
  const firstIdx = GAN.indexOf(firstGan);
  const out: LiuYueInfo[] = [];

  for (let i = 0; i < 12; i++) {
    const zhi = ZHI[(2 + i) % 12] as DiZhi; // 寅卯辰…亥子丑
    const gan = GAN[(firstIdx + i) % 10] as TianGan;
    const ganZhi = `${gan}${zhi}`;
    // 小寒落在立春年的次年 1 月
    const jieYear = i === 11 ? year + 1 : year;
    const moment = jieqiMoment(jieYear, JIE_OF_MONTH[i]);
    const zhiUnits: ZhiUnit[] = [
      ...PILLAR_KEYS.map((k) => ({ pos: k as RelPos, zhi: bz[k].zhi })),
      { pos: 'liuYue' as RelPos, zhi },
    ];
    const ganUnits: GanUnit[] = [
      ...PILLAR_KEYS.map((k) => ({ pos: k as RelPos, gan: bz[k].gan })),
      { pos: 'liuYue' as RelPos, gan },
    ];
    out.push({
      index: i + 1,
      jieqi: JIE_OF_MONTH[i],
      startDate: moment.ymd,
      startText: moment.text,
      ganZhi,
      gan,
      zhi,
      naYin: naYinOf(ganZhi),
      ganTenGod: tenGod(bz.dayMaster, gan),
      zhiTenGod: tenGod(bz.dayMaster, ZHI_HIDE[zhi][0]),
      zhiRelations: zhiRelations(zhiUnits).filter((r) => r.positions.includes('liuYue')),
      ganRelations: ganRelations(ganUnits).filter((r) => r.positions.includes('liuYue')),
    });
  }
  return out;
}

// =====================================================================
// 四、旺衰依据（只拆推导，不改柱、不改断语卡）
// =====================================================================

export interface WangShuaiItem {
  /** 得令 / 失令 / 得地 / 失地 / 得生 / 得助 / 得势 / 失势 */
  label: string;
  pillar?: PillarPos;
  char?: string;
  text: string;
  src: string;
  /** 对日主是生扶（true）/ 克泄耗（false）/ 中性（null） */
  good: boolean | null;
}

export interface WangShuaiEvidence {
  /** 月令状态：旺相休囚死（《增删卜易》月令五态，与六爻同源 lingTaiOf） */
  monthState: { zhi: DiZhi; wuXing: WuXing; state: LingTai; text: string };
  deling: { hit: boolean; score: number; text: string; src: string };
  dedi: { hit: boolean; score: number; text: string; src: string };
  /** 得令/得地各 0|1 条；得生/得助为「天干+地支本气」里的条数 */
  counts: { 得令: number; 得地: number; 得生: number; 得助: number };
  /** 通根：四支中与日主同五行（含本气）的支数 */
  tongGen: number;
  /** 五行占比（比劫+印星，与断语卡同口径，仅作参考，不参与定强弱） */
  deshi: { ratio: number; mine: number; total: number; text: string };
  items: WangShuaiItem[];
  /** 定强弱分：得令分 + 日支生扶 1 分（与 verdicts.judgeBazi 同型） */
  score: number;
  conclusion: '偏旺' | '偏弱';
  conclusionText: string;
  /** 与 app/js/verdicts.js judgeBazi 的定强弱是否一致（漂移探针，非流派比对） */
  consistent: boolean;
  /** 复刻 verdicts.js 公式得出的结论；与 conclusion 不等即表示两处公式已分叉 */
  legacyConclusion: '偏旺' | '偏弱';
  note: string;
}

/** 月令/日支 对 日主 的五行关系（正理：a 为我） */
function relOfMe(me: WuXing, other: WuXing): 'same' | 'woSheng' | 'shengWo' | 'woKe' | 'keWo' {
  if (me === other) return 'same';
  if (SHENG[me] === other) return 'woSheng';   // 我生（泄）
  if (SHENG[other] === me) return 'shengWo';   // 生我（印）
  if (KE[me] === other) return 'woKe';         // 我克（耗）
  return 'keWo';                               // 克我（官杀）
}

export function wangShuaiEvidence(bz: BaziResult): WangShuaiEvidence {
  const me = bz.dayMasterWuXing;
  const mZhi = bz.month.zhi;
  const dZhi = bz.day.zhi;
  const mWx = ZHI_WX[mZhi];
  const dWx = ZHI_WX[dZhi];
  const items: WangShuaiItem[] = [];

  const monthState: WangShuaiEvidence['monthState'] = {
    zhi: mZhi,
    wuXing: mWx,
    state: lingTaiOf(me, mWx),
    text: '',
  };
  const STATE_MEAN: Record<LingTai, string> = {
    旺: '同气当令，自身最有力',
    相: '月令生我，得气之助（相）',
    休: '我生月令，气泄于外（休）',
    囚: '我克月令，力困于耗（囚）',
    死: '月令克我，受制无气（死）',
  };
  monthState.text = `月令${mZhi}（${mWx}）对日主${me}：${monthState.state}——${STATE_MEAN[monthState.state]}`;
  items.push({
    label: '月令',
    text: monthState.text,
    src: '《增删卜易·月建》月令五态（旺相休囚死）',
    good: monthState.state === '旺' || monthState.state === '相' ? true : monthState.state === '休' ? null : false,
  });

  // ① 得令（月支）
  const rm = relOfMe(me, mWx);
  let delingScore = 0;
  let delingHit = false;
  let delingText = '';
  if (rm === 'same') { delingScore = 2; delingHit = true; delingText = `日主${me}生于${mZhi}月，月令同气（得令）——根基得时，主自身有力。`; }
  else if (rm === 'shengWo') { delingScore = 2; delingHit = true; delingText = `日主${me}生于${mZhi}月（${mWx}生${me}），月令生我（得令）——印星当令，主有靠山、有生扶。`; }
  else if (rm === 'woSheng') { delingScore = -1; delingText = `日主${me}生于${mZhi}月（${me}生${mWx}），我生月令（泄气）——身被泄，主劳心费力。`; }
  else if (rm === 'keWo') { delingScore = -2; delingText = `日主${me}生于${mZhi}月（${mWx}克${me}），月令克我（失令）——身受克，主根基不稳。`; }
  else { delingScore = -1; delingText = `日主${me}生于${mZhi}月（${me}克${mWx}），我克月令（耗气）——身被耗，主得财而身疲。`; }
  const deling = { hit: delingHit, score: delingScore, text: delingText, src: '《滴天髓·衰旺》' };
  items.push({ label: delingHit ? '得令' : '失令', text: delingText, src: deling.src, good: delingHit });

  // ② 得地（日支）
  const rd = relOfMe(me, dWx);
  const dediHit = rd === 'same' || rd === 'shengWo';
  const dediScore = dediHit ? 1 : (rd === 'keWo' || rd === 'woKe' ? -1 : 0);
  const DEDI: Record<string, string> = {
    same: `日主坐${dZhi}（${dWx}），与日主同气——日支为根，自身有底气。`,
    shengWo: `日主坐${dZhi}（${dWx}），日支生扶——坐下有印，主自身得力。`,
    woSheng: `日主坐${dZhi}（${dWx}），日主生日支——坐下泄气，主自身易于付出。`,
    woKe: `日主坐${dZhi}（${dWx}），日主克日支——坐下耗力，主自身受耗。`,
    keWo: `日主坐${dZhi}（${dWx}），日支克日主——坐下受制，主自身易疲。`,
  };
  const dedi = { hit: dediHit, score: dediScore, text: DEDI[rd], src: '《渊海子平·论日主强弱》' };
  items.push({ label: dediHit ? '得地' : '失地', text: dedi.text, src: dedi.src, good: dediHit });

  // 通根（四支本气与日主同五行）
  const genZhis = PILLAR_KEYS.filter((k) => ZHI_WX[bz[k].zhi] === me);
  const tongGen = genZhis.length;
  if (tongGen > 1) {
    items.push({
      label: '通根',
      text: `四支中与日主同属${me}的有 ${tongGen} 支（${genZhis.map((k) => `${PILLAR_CN[k]}${bz[k].zhi}`).join('、')}）——根气不孤。`,
      src: '《渊海子平·论通根》',
      good: true,
    });
  }

  // ④ 得生 / 得助：按四干 + 四支本气（八字的「明字」）逐条数
  let shengCount = 0;
  let zhuCount = 0;
  for (const k of PILLAR_KEYS) {
    if (k !== 'day') {
      const tg = tenGod(bz.dayMaster, bz[k].gan);
      if (tg === '正印' || tg === '偏印') { shengCount++; items.push({ label: '得生', pillar: k, char: bz[k].gan, text: `${PILLAR_CN[k]}天干${bz[k].gan}为${tg}（印星生我）`, src: '《渊海子平·论十神》', good: true }); }
      else if (tg === '比肩' || tg === '劫财') { zhuCount++; items.push({ label: '得助', pillar: k, char: bz[k].gan, text: `${PILLAR_CN[k]}天干${bz[k].gan}为${tg}（同我帮身）`, src: '《渊海子平·论十神》', good: true }); }
    }
    const zhiTg = tenGod(bz.dayMaster, ZHI_HIDE[bz[k].zhi][0]);
    if (zhiTg === '正印' || zhiTg === '偏印') { shengCount++; items.push({ label: '得生', pillar: k, char: bz[k].zhi, text: `${PILLAR_CN[k]}地支${bz[k].zhi}本气为${zhiTg}（印星生我）`, src: '《渊海子平·论十神》', good: true }); }
    else if (zhiTg === '比肩' || zhiTg === '劫财') { zhuCount++; items.push({ label: '得助', pillar: k, char: bz[k].zhi, text: `${PILLAR_CN[k]}地支${bz[k].zhi}本气为${zhiTg}（同我帮身）`, src: '《渊海子平·论十神》', good: true }); }
  }

  // ⑤ 得势（五行占比，仅参考，不参与定强弱）
  const cnt = bz.wuXingCount;
  const total = Object.values(cnt).reduce((a, b) => a + b, 0) || 1;
  const shengWoWx = (Object.keys(SHENG) as WuXing[]).find((w) => SHENG[w] === me) as WuXing;
  const mine = (cnt[me] || 0) + (cnt[shengWoWx] || 0);
  const ratio = mine / total;
  const deshiText = `比劫+印星（${me}+${shengWoWx}）共 ${mine}/${total}，占 ${Math.round(ratio * 100)}%${ratio >= 0.5 ? '（得势）' : ratio <= 0.25 ? '（失势）' : '（势均）'}`;
  items.push({ label: ratio >= 0.5 ? '得势' : ratio <= 0.25 ? '失势' : '势均', text: deshiText, src: '《渊海子平·论日主强弱》（参考项，不参与定强弱）', good: ratio >= 0.5 ? true : ratio <= 0.25 ? false : null });

  // ⑥ 定强弱：与 verdicts.judgeBazi 同型（得令分 + 日支生扶 1 分 > 0 判旺）
  const score = delingScore + (dediHit ? 1 : 0);
  const conclusion: '偏旺' | '偏弱' = score > 0 ? '偏旺' : '偏弱';

  // 漂移探针：独立复刻 app/js/verdicts.js judgeBazi 的公式（月令：同气/生我 +2、我生/我克 -1、
  // 克我 -2；日支：同气/生我 +1），与本文件结论比对。verdicts.js 已修正「生」两支的方向，
  // 此处必须同步——两处公式一旦再次分叉，consistent=false 会在页面上显式报出。
  const legacySheng = SHENG[mWx] === me ? 2 : SHENG[me] === mWx ? -1 : null;
  const legacyDeling = mWx === me ? 2
    : legacySheng !== null ? legacySheng
      : KE[mWx] === me ? -2
        : KE[me] === mWx ? -1 : 0;
  const legacyDayGood = dWx === me || SHENG[dWx] === me; // 日支同气或日支生我 → 生扶
  const legacyScore = legacyDeling + (legacyDayGood ? 1 : 0);
  const legacyConclusion: '偏旺' | '偏弱' = legacyScore > 0 ? '偏旺' : '偏弱';

  const conclusionText = conclusion === '偏旺'
    ? `日主${me}偏旺——喜财（我克）、官杀（克我）、食伤（我生）来克泄，忌再添印比。`
    : `日主${me}偏弱——喜印（生我）、比劫（同我）来生扶，忌财官食伤再耗。`;

  return {
    monthState,
    deling,
    dedi,
    counts: { 得令: delingHit ? 1 : 0, 得地: dediHit ? 1 : 0, 得生: shengCount, 得助: zhuCount },
    tongGen,
    deshi: { ratio, mine, total, text: deshiText },
    items,
    score,
    conclusion,
    conclusionText,
    consistent: conclusion === legacyConclusion,
    legacyConclusion,
    note: '定强弱：得令（同气/生我 +2，我生/我克 -1，克我 -2）＋ 日支生扶 +1，合计 >0 判偏旺，与 app/js/verdicts.js judgeBazi 同型公式；日支克耗不减分，只作依据列出。',
  };
}

export interface BaziExtra {
  shenSha: BaziShenSha;
  relations: BaziRelations;
  wangShuai: WangShuaiEvidence;
  /** 年柱口径标注（八字按立春，紫微按春节） */
  yearPillarNote: string;
}

/** 一次算齐扩展信息（视图层单次调用，避免多处派生不一致） */
export function baziExtra(bz: BaziResult): BaziExtra {
  return {
    shenSha: baziShenSha(bz),
    relations: baziRelations(bz),
    wangShuai: wangShuaiEvidence(bz),
    yearPillarNote: `年柱：${bz.year.ganZhi}（立春为界；紫微另有春节口径）`,
  };
}
