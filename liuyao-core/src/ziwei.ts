/**
 * 紫微斗数排盘模块（M6）
 *
 * 算法底座：iztro（MIT, Copyright (c) 2023 Sylar Long），版本锁定于 package.json。
 * 本文件只做「输入归一化 → 调库排盘 → 输出纯 JSON」三件事，把第三方类实例（FunctionalAstrolabe/
 * FunctionalPalace/FunctionalStar）全部转成可序列化、可单测锁定的普通对象，
 * 使上层（前端/复制件/断言）不直接依赖 iztro 的 API 形态，便于日后换库或并列多流派。
 *
 * 红线（与全项目一致）：
 * - 只排盘：列宫位、星曜、庙旺平陷、生年四化、宫干四化（飞化）、大限/小限等「盘面事实」；
 * - 不输出任何吉凶、格局好坏、运势断语。解释权完全留给使用者。
 * - 流派分歧（起例、四化、闰月、晚子时）不强行合并：当前采用 iztro 默认（通行/全书口径），
 *   已用元亨利贞「china95」金标准（2026-10-18 寅时乾造）逐宫对账一致；
 *   闰月用 fixLeap（前后半月分算）；晚子时换日口径沿用全项目默认，TODO 待全局统一。
 *   十干四化表采 iztro 通行表（庚干「阳武阴同」、壬干「梁紫左武」），庚/壬各家或异，界面已标注。
 */
import { astro, data } from 'iztro';

export type ZiweiGender = '男' | '女';

export interface ZiweiInput {
  year: number;
  month: number; // 1-12（阳历）
  day: number; // 阳历日
  hour: number; // 北京时间 0-23
  minute?: number; // 0-59，仅记录，不影响时辰归属（时辰按整点分界）
  gender: ZiweiGender;
  /** 闰月是否前后半月分开算，默认 true */
  fixLeap?: boolean;
}

/** 四化 */
export type ZwMutagen = '禄' | '权' | '科' | '忌';

export interface ZwStar {
  name: string;
  /** 星曜类别：主星 | 吉星 | 煞星 | 杂耀 | 桃花星 | 解神 | 禄存 | 天马 */
  type: string;
  /** 庙旺平陷亮度；无亮度数据为空串 */
  brightness: string;
  /** 生年四化：禄/权/科/忌；无为空串 */
  mutagen: '' | ZwMutagen;
}

/** 宫干四化（飞化）的一条路径：本宫宫干 → 化× → 星 → 落宫 */
export interface ZwFlyHua {
  /** 四化类型 */
  mutagen: ZwMutagen;
  /** 化出的星名（中文） */
  star: string;
  /** 落宫地支；该星不在本盘时为空串 */
  toBranch: string;
  /** 落宫宫职名（iztro 原始名，如 "夫妻"）；同上 */
  toPalaceName: string;
  /** 自化：四化落回本宫 */
  isSelf: boolean;
}

/** 飞入本宫的一条路径（某宫宫干四化落到本宫） */
export interface ZwFlyIn {
  /** 起点宫地支 */
  fromBranch: string;
  /** 起点宫宫职名 */
  fromPalaceName: string;
  mutagen: ZwMutagen;
  star: string;
  /** 自化：本宫宫干四化落回本宫 */
  isSelf: boolean;
}

export interface ZwPalace {
  /** iztro 宫位索引：0=寅宫起，顺行至 11=丑宫 */
  index: number;
  /** 宫职名：命宫/兄弟/夫妻/子女/财帛/疾厄/迁移/仆役/官禄/田宅/福德/父母 */
  name: string;
  /** 宫干支，如 "丙申" */
  ganZhi: string;
  heavenlyStem: string;
  earthlyBranch: string;
  isSoulPalace: boolean; // 是否命宫
  isBodyPalace: boolean; // 是否身宫（可能与命宫同宫）
  isOriginalPalace: boolean; // 是否来因宫（仅作盘面信息列出）
  majorStars: ZwStar[];
  minorStars: ZwStar[];
  adjectiveStars: ZwStar[];
  /** 空宫：无十四主星 */
  isEmpty: boolean;
  changsheng12: string; // 长生十二神
  boshi12: string; // 博士十二神
  jiangqian12: string; // 将前十二神
  suiqian12: string; // 岁前十二神
  /** 本宫大限（十年）虚岁区间 [起, 止] */
  decadalRange: [number, number];
  /** 本宫大限干支 */
  decadalGanZhi: string;
  /** 本宫小限虚岁序列（约每 12 年一年落此宫） */
  ages: number[];
  /** 三方四正：对宫（六冲）+ 三合两宫；纯地支关系，无流派差异 */
  sanFang: { opposite: string; sanhe: [string, string] };
  /** 宫干四化（飞化）：本宫宫干飞出的四条路径（禄/权/科/忌） */
  flyHua: ZwFlyHua[];
  /** 飞入本宫：各宫宫干四化落到本宫的路径（含本宫自化） */
  flyIn: ZwFlyIn[];
}

export interface ZiweiChart {
  generator: string; // 算法底座标识，如 "iztro@2.6.2"
  solarDate: string; // 阳历，iztro 原始形如 "2026-10-18"
  lunarDate: string; // 农历中文
  timeIndex: number; // 0-12
  time: string; // 时辰名，如 "寅时"
  timeRange: string; // 时辰钟点，如 "03:00~05:00"
  gender: string;
  sign: string; // 星座
  zodiac: string; // 生肖
  siZhu: string; // 四柱整串 "丙午 戊戌 乙丑 戊寅"
  yearGanZhi: string;
  monthGanZhi: string;
  dayGanZhi: string;
  timeGanZhi: string;
  fiveElementsClass: string; // 五行局，如 "火六局"
  soulBranch: string; // 命宫地支
  bodyBranch: string; // 身宫地支
  soul: string; // 命主星
  body: string; // 身主星
  palaces: ZwPalace[];
  /** 固定声明：本结果只列盘面事实，不作吉凶判断 */
  disclaimer: string;
}

const IZTRO_VERSION = '2.6.2';

/** 地支序列（iztro 索引序：0=寅 顺行至 11=丑） */
const ZW_BR_SEQ = ['寅', '卯', '辰', '巳', '午', '未', '申', '酉', '戌', '亥', '子', '丑'];

/**
 * 地支三方四正：对宫 +6；三合 +4 / +8。
 * 纯地支关系（寅午戌、申子辰、亥卯未、巳酉丑），无流派差异。
 * 以命宫在申为例：对宫寅(迁移)、三合子/辰(财帛/官禄)，与宫职顺布一致。
 */
function sanFangOf(earthlyBranch: string): { opposite: string; sanhe: [string, string] } {
  const i = ZW_BR_SEQ.indexOf(earthlyBranch);
  if (i < 0) return { opposite: '', sanhe: ['', ''] };
  return {
    opposite: ZW_BR_SEQ[(i + 6) % 12],
    sanhe: [ZW_BR_SEQ[(i + 4) % 12], ZW_BR_SEQ[(i + 8) % 12]],
  };
}

/** iztro 星曜 key → 中文名（仅十干四化涉及的星：十二主星 + 文昌/文曲/左辅/右弼） */
const ZW_STAR_KEY_NAME: Record<string, string> = {
  lianzhenMaj: '廉贞', pojunMaj: '破军', wuquMaj: '武曲', taiyangMaj: '太阳',
  tianjiMaj: '天机', tianliangMaj: '天梁', ziweiMaj: '紫微', taiyinMaj: '太阴',
  tiantongMaj: '天同', wenchangMin: '文昌', jumenMaj: '巨门', tanlangMaj: '贪狼',
  youbiMin: '右弼', wenquMin: '文曲', zuofuMin: '左辅',
};

/** 天干 → iztro heavenlyStems 键 */
const ZW_STEM_KEY: Record<string, string> = {
  甲: 'jiaHeavenly', 乙: 'yiHeavenly', 丙: 'bingHeavenly', 丁: 'dingHeavenly', 戊: 'wuHeavenly',
  己: 'jiHeavenly', 庚: 'gengHeavenly', 辛: 'xinHeavenly', 壬: 'renHeavenly', 癸: 'guiHeavenly',
};

/** 四化顺序：禄 → 权 → 科 → 忌 */
const ZW_MUTAGEN_SEQ: ZwMutagen[] = ['禄', '权', '科', '忌'];

/**
 * 按天干取四化星名序列（顺序 禄/权/科/忌）。
 * 表源：iztro data.heavenlyStems（通行/全书口径）。
 * 甲【廉破武阳】乙【机梁紫阴】丙【同机昌廉】丁【阴同机巨】戊【贪月弼机】
 * 己【武贪梁曲】庚【阳武阴同】辛【巨日曲昌】壬【梁紫左武】癸【破巨阴贪】
 */
function stemMutagenStars(stem: string): string[] {
  const k = ZW_STEM_KEY[stem];
  if (!k) return [];
  const tbl = data.heavenlyStems as unknown as Record<string, { mutagen?: string[] } | undefined>;
  const list = tbl[k]?.mutagen;
  if (!Array.isArray(list)) return [];
  return list.map((key) => ZW_STAR_KEY_NAME[key] ?? '');
}

/** 定位某星所在宫（主星或辅星；找不到返回 null） */
function starPalace(palaces: ZwPalace[], name: string): ZwPalace | null {
  if (!name) return null;
  return palaces.find(
    (q) => q.majorStars.some((s) => s.name === name) || q.minorStars.some((s) => s.name === name),
  ) ?? null;
}

/** 本宫宫干飞出的四条四化路径（纯查表 + 定位，无吉凶判断） */
function flyHuaOf(palaces: ZwPalace[], p: ZwPalace): ZwFlyHua[] {
  return stemMutagenStars(p.heavenlyStem).map((star, i) => {
    const t = starPalace(palaces, star);
    return {
      mutagen: ZW_MUTAGEN_SEQ[i],
      star,
      toBranch: t ? t.earthlyBranch : '',
      toPalaceName: t ? t.name : '',
      isSelf: !!t && t.earthlyBranch === p.earthlyBranch,
    };
  });
}

/** 各宫宫干四化落到本宫的路径（含本宫自化） */
function flyInOf(palaces: ZwPalace[], p: ZwPalace): ZwFlyIn[] {
  const out: ZwFlyIn[] = [];
  for (const q of palaces) {
    for (const f of q.flyHua) {
      if (f.toBranch !== p.earthlyBranch) continue;
      out.push({
        fromBranch: q.earthlyBranch,
        fromPalaceName: q.name,
        mutagen: f.mutagen,
        star: f.star,
        isSelf: q.earthlyBranch === p.earthlyBranch,
      });
    }
  }
  return out;
}

/**
 * 北京时间小时(0-23) → iztro 时辰索引。
 * iztro：0=早子时(00:00~01:00)，1=丑，2=寅 … 6=午 … 11=亥，12=晚子时(23:00~24:00)。
 * 统一公式 floor((hour+1)/2)：h0→0，h1/2→1，h3/4→2 … h21/22→11，h23→12。
 * 分钟不改变时辰归属（按整点换时辰）。
 */
export function hourToTimeIndex(hour: number, minute = 0): number {
  void minute;
  if (!Number.isInteger(hour) || hour < 0 || hour > 23) {
    throw new Error(`hour 须为 0-23 的整数，收到: ${hour}`);
  }
  return Math.floor((hour + 1) / 2);
}

function toStar(s: { name?: string; type?: string; brightness?: string; mutagen?: string }): ZwStar {
  return {
    name: s.name ?? '',
    type: s.type ?? '',
    brightness: s.brightness ?? '',
    mutagen: (s.mutagen ?? '') as ZwStar['mutagen'],
  };
}

/**
 * 按阳历出生时间排紫微斗数盘，输出纯 JSON。
 * 只做排盘（含宫干四化飞化路径），不含任何吉凶断语。
 */
export function paiZiwei(input: ZiweiInput): ZiweiChart {
  const { year, month, day, gender, fixLeap = true } = input;
  const hour = input.hour ?? 12;
  const timeIndex = hourToTimeIndex(hour, input.minute ?? 0);
  const solarDateStr = `${year}-${month}-${day}`;

  const a = astro.bySolar(solarDateStr, timeIndex, gender, fixLeap, 'zh-CN');

  const [ygz, mgz, dgz, tgz] = a.chineseDate.split(/\s+/);

  const palaces: ZwPalace[] = a.palaces.map((p) => ({
    index: p.index,
    name: p.name,
    ganZhi: `${p.heavenlyStem}${p.earthlyBranch}`,
    heavenlyStem: p.heavenlyStem,
    earthlyBranch: p.earthlyBranch,
    isSoulPalace: p.earthlyBranch === a.earthlyBranchOfSoulPalace,
    isBodyPalace: !!p.isBodyPalace,
    isOriginalPalace: !!p.isOriginalPalace,
    majorStars: (p.majorStars ?? []).map(toStar),
    minorStars: (p.minorStars ?? []).map(toStar),
    adjectiveStars: (p.adjectiveStars ?? []).map(toStar),
    isEmpty: (p.majorStars ?? []).length === 0,
    changsheng12: p.changsheng12,
    boshi12: p.boshi12,
    jiangqian12: p.jiangqian12,
    suiqian12: p.suiqian12,
    decadalRange: [p.decadal.range[0], p.decadal.range[1]] as [number, number],
    decadalGanZhi: `${p.decadal.heavenlyStem}${p.decadal.earthlyBranch}`,
    ages: [...p.ages],
    sanFang: sanFangOf(p.earthlyBranch),
    flyHua: [],
    flyIn: [],
  }));

  // 宫干四化（飞化）：需先有完整星曜落宫，故在宫位数组建好后再算一轮
  for (const p of palaces) p.flyHua = flyHuaOf(palaces, p);
  for (const p of palaces) p.flyIn = flyInOf(palaces, p);

  return {
    generator: `iztro@${IZTRO_VERSION}`,
    solarDate: a.solarDate,
    lunarDate: a.lunarDate,
    timeIndex,
    time: a.time,
    timeRange: a.timeRange,
    gender: a.gender ?? gender,
    sign: a.sign,
    zodiac: a.zodiac,
    siZhu: a.chineseDate,
    yearGanZhi: ygz ?? '',
    monthGanZhi: mgz ?? '',
    dayGanZhi: dgz ?? '',
    timeGanZhi: tgz ?? '',
    fiveElementsClass: a.fiveElementsClass,
    soulBranch: a.earthlyBranchOfSoulPalace,
    bodyBranch: a.earthlyBranchOfBodyPalace,
    soul: a.soul,
    body: a.body,
    palaces,
    disclaimer: '',
  };
}
