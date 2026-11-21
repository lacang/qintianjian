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
 *   闰月用 fixLeap（前后半月分算）。
 *   十干四化表采 iztro 通行表（庚干「阳武阴同」、壬干「梁紫左武」），庚/壬各家或异，界面已标注。
 *
 * 晚子时（23:00–23:59）换日口径 —— 本文件在此处**绕过 iztro 的半截换日**：
 *   iztro 的 bySolar 对 timeIndex=12（晚子时）只做了一半：日柱（lunar-javascript 的 getDayGanExact）
 *   按次日算、紫微起例的「日数」也按次日（utils.fixLunarDayIndex 对 timeIndex>=12 不加 -1），
 *   但**农历月索引不换日**（utils.fixLunarMonthIndex 用 solar2lunar(生日当天) 取月），于是
 *   农历标签与命宫所在月停在前一天 —— 月末与闰月后半月会自相矛盾（农历三十 23:30 与次日 00:30
 *   一个命宫子、一个命宫丑）。上游另有 `timeIndex !== 12` 把晚子时排除在「闰月后半月归次月」之外，
 *   方向正好反了（晚子时已属次日，理应计入归次月）。
 *   绕过方式：不改 node_modules，在传参层把 23 点生人折算成「次日 + timeIndex=0（早子时）」再交给 iztro，
 *   使 农历、命宫月、日柱、月柱 由同一个「有效日」推出；回填时把 timeIndex/时辰名改回晚子时。
 *   该折算只对 hour>=23 生效，其余时刻的入参与返回值与旧实现逐字节相同（安星零差异）。
 *
 * 年柱口径：紫微以**农历年（春节为界）**定年（iztro yearDivide='normal'），八字以**立春**为界，
 *   两者会冲突（例 2026-02-10：紫微乙巳、八字丙午）。本项目不强行统一，只在盘上标注一行
 *   `yearGanZhiNote`，把口径写明，供使用者自行对表。
 */
import { astro, data } from 'iztro';
import { civilForPaipan, lateZiLabel, type LateZiMode, type TimeResolveInput } from './timeContext.js';
import { normalizeGender, mergeWarnings } from './validate.js';

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
  /** 晚子时换日口径（默认 '23' 子初换日；'00' = 子正换日，23:00–23:59 留当日） */
  lateZiMode?: LateZiMode;
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

/**
 * 运限四化的一条：化× → 星 → 落宫。
 * 与 ZwFlyHua 同形（去掉 isSelf），保证生年/大限/流年/流月四化在界面上可同一套渲染。
 */
export interface ZwYunHua {
  mutagen: ZwMutagen;
  star: string;
  /** 落宫地支；该星不在本盘时为空串 */
  toBranch: string;
  /** 落宫宫职名（本命宫职，如 "夫妻"）；同上 */
  toPalaceName: string;
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
  /** 本宫大限四化：以大限宫天干套十干四化表，落宫相对本命盘（与生年/流年四化同形） */
  decadalHua: ZwYunHua[];
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
  solarDate: string; // 出生阳历（用户输入那一天），iztro 原始形如 "2026-10-18"
  /** 实际排盘所用阳历日：晚子时为次日，其余同 solarDate */
  effectiveSolarDate: string;
  /** 晚子时（23:00–23:59）：农历/命宫月/日柱已统一按次日折算 */
  lateZi: boolean;
  lunarDate: string; // 农历中文（晚子时已换到次日）
  timeIndex: number; // 0-12（晚子时始终为 12）
  time: string; // 时辰名，如 "寅时"
  timeRange: string; // 时辰钟点，如 "03:00~05:00"
  gender: string;
  sign: string; // 星座
  zodiac: string; // 生肖
  siZhu: string; // 四柱整串 "丙午 戊戌 乙丑 戊寅"
  yearGanZhi: string;
  /** 年柱口径标注：紫微取农历年（春节为界），四柱另有立春口径 */
  yearGanZhiNote: string;
  /** 换日口径标注（如「23 点（子初）换日」） */
  dayBoundary?: string;
  /** 时间口径提示（时区估算、经纬度冲突、夏令时…） */
  timeWarnings?: string[];
  /** 入参校验/口径提示（小数时间取整、历史时区、strict:false 的 0 点回退） */
  warnings: string[];
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

/** 某层运限（大限/流年/流月）的命宫与四化 */
export interface ZwYunScope {
  /** 该层命宫在本命盘的宫位索引（0=寅起） */
  index: number;
  /** 该层命宫在本命盘的宫职名 */
  palaceName: string;
  /** 该层命宫地支 */
  branch: string;
  /** 该层命宫所在本命宫的干支 */
  palaceGanZhi: string;
  /** 该层运限干支（大限干支 / 流年干支 / 流月月柱干支） */
  ganZhi: string;
  heavenlyStem: string;
  earthlyBranch: string;
  /** 该层四化（禄/权/科/忌）与落宫，落宫为本命盘宫位 */
  hua: ZwYunHua[];
}

/** 流月补充信息 */
export interface ZwYunMonthly extends ZwYunScope {
  /** 农历月序 1-12 */
  lunarMonth: number;
  /** 农历日 */
  lunarDay: number;
  /** 是否闰月 */
  isLeapMonth: boolean;
  /** 农历月标签，如 "正月" / "闰四月" */
  monthLabel: string;
}

/** 运限查询入参：给一个阳历时刻（默认该月 15 日 12 时），取那一刻所属的 大限/流年/流月 */
export interface ZiweiYunTarget {
  year: number;
  month: number;
  day?: number;
  hour?: number;
}

export interface ZiweiYunXian {
  /** 查询时刻（阳历） */
  solarDate: string;
  /** 查询时刻的农历 */
  lunarDate: string;
  /** 虚岁（农历年界） */
  nominalAge: number;
  decadal: ZwYunScope & { range: [number, number]; isChildhood: boolean };
  yearly: ZwYunScope;
  monthly: ZwYunMonthly;
  /** 本命盘（同一输入的 paiZiwei 结果，避免上层重复排盘） */
  chart: ZiweiChart;
}

const IZTRO_VERSION = '2.6.2';

/** 地支序列（iztro 索引序：0=寅 顺行至 11=丑） */
const ZW_BR_SEQ = ['寅', '卯', '辰', '巳', '午', '未', '申', '酉', '戌', '亥', '子', '丑'];

/** 时辰钟点（晚子时与早子时同属子时，钟点不同） */
const ZW_TIME_LATE = '晚子时';
const ZW_TIME_LATE_RANGE = '23:00~24:00';

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

/** 天干 → 四条四化路径（禄/权/科/忌 + 星 + 落宫） */
function huaOfStem(palaces: ZwPalace[], stem: string): ZwYunHua[] {
  return stemMutagenStars(stem).map((star, i) => {
    const t = starPalace(palaces, star);
    return {
      mutagen: ZW_MUTAGEN_SEQ[i],
      star,
      toBranch: t ? t.earthlyBranch : '',
      toPalaceName: t ? t.name : '',
    };
  });
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

/** 阳历日期 +1 天（纯 UTC 算日期，不受宿主时区影响）；输出与 iztro 同风格的不补零串 */
function nextSolarDate(year: number, month: number, day: number): string {
  const dt = new Date(Date.UTC(year, month - 1, day));
  dt.setUTCDate(dt.getUTCDate() + 1);
  return `${dt.getUTCFullYear()}-${dt.getUTCMonth() + 1}-${dt.getUTCDate()}`;
}

/**
 * 出生时刻 → 交给 iztro 的「有效阳历日 + 时辰索引」，以及对外显示用的时辰索引。
 *
 * 晚子时（23:00–23:59）折算成「次日 + 早子时(0)」：
 *  - 日柱：次日 + 早子时 = 当日 + 晚子时（lunar-javascript 的 getDayGanExact 对 23 点即换日），值不变；
 *  - 农历日期 / 命宫所在月 / 月柱：由「次日」推出，跟着换日（这正是 iztro 半截换日缺的那一半）；
 *  - 闰月后半月：timeIndex=0 时 iztro 的 fixLunarMonthIndex 会正常 +1 月（上游对 timeIndex=12 排除，
 *    方向反了），故闰四月十六及以后的晚子时归次月，与次日早子时一致；
 *  - 时辰地支仍是子，命宫/身宫的「数生时」结果与晚子时相同，唯一差异是月索引被修正。
 * 其余时刻原样直传，保证与旧实现零差异。
 *
 * displayTimeIndex 始终是用户真实时辰（晚子时 = 12），只用于对外字段与界面，
 * 不再喂给 iztro —— 两者混用会立刻退回「半截换日」。
 */
function effectiveBirth(input: ZiweiInput): {
  solar: string; timeIndex: number; displayTimeIndex: number; lateZi: boolean;
} {
  const { year, month, day } = input;
  const hour = input.hour ?? 12;
  const displayTimeIndex = hourToTimeIndex(hour, input.minute ?? 0);
  const inputSolar = `${year}-${month}-${day}`;
  if (displayTimeIndex < 12) {
    return { solar: inputSolar, timeIndex: displayTimeIndex, displayTimeIndex, lateZi: false };
  }
  return { solar: nextSolarDate(year, month, day), timeIndex: 0, displayTimeIndex, lateZi: true };
}

function toStar(s: { name?: string; type?: string; brightness?: string; mutagen?: string }): ZwStar {
  return {
    name: s.name ?? '',
    type: s.type ?? '',
    brightness: s.brightness ?? '',
    mutagen: (s.mutagen ?? '') as ZwStar['mutagen'],
  };
}

/** iztro FunctionalAstrolabe → 纯 JSON 宫位数组（含飞化与出宫四化，依赖完整星曜落宫，故两轮） */
function toPalaces(a: ReturnType<typeof astro.bySolar>): ZwPalace[] {
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
    decadalHua: [],
    ages: [...p.ages],
    sanFang: sanFangOf(p.earthlyBranch),
    flyHua: [],
    flyIn: [],
  }));
  // 四化均需先有完整星曜落宫：大限四化按大限宫天干，宫干四化按本宫天干
  for (const p of palaces) p.decadalHua = huaOfStem(palaces, p.decadalGanZhi[0] ?? '');
  for (const p of palaces) p.flyHua = flyHuaOf(palaces, p);
  for (const p of palaces) p.flyIn = flyInOf(palaces, p);
  return palaces;
}

/** 内部：排一次盘，同时保留 iztro 实例（运限用），避免二次排盘 */
function buildZiwei(rawInput: ZiweiInput): { chart: ZiweiChart; astrolabe: ReturnType<typeof astro.bySolar> } {
  // 性别：与八字同一口径（缺省即抛、六种写法归一）。旧实现一个默认女命、一个报错，行为不一致。
  const gender = normalizeGender(rawInput.gender, { required: true });
  // 时区 / 夏令时 / 真太阳时统一折算：折算后的钟面时间再进 effectiveBirth（23 点折次日），
  // 两者不冲突——真太阳时可能把 23:50 推到次日 00:05，换日自然发生。
  // 内部先过 validate.ts：紫微星表只覆盖 1900–2100，越界抛 OutOfRangeError 而不是排出空盘。
  const eff = civilForPaipan(rawInput as unknown as TimeResolveInput, { yearRange: 'ziwei', label: '出生时间' });
  // eff.civil 恒为已定口径的钟面时间：无地点时原样返回；'00' 口径下 23:xx 已成同日 00:xx，
  // effectiveBirth 自然不会再把日期推到次日——日柱/命宫与时柱同一口径。
  const input: ZiweiInput = {
    ...rawInput,
    year: eff.civil.year, month: eff.civil.month, day: eff.civil.day,
    hour: eff.civil.hour, minute: eff.civil.minute,
  };
  const { fixLeap = true } = input;
  const { solar: effectiveSolarDate, timeIndex, displayTimeIndex, lateZi } = effectiveBirth(input);
  const inputSolar = `${input.year}-${input.month}-${input.day}`;

  const a = astro.bySolar(effectiveSolarDate, timeIndex, gender, fixLeap, 'zh-CN');

  const [ygz, mgz, dgz, tgz] = a.chineseDate.split(/\s+/);

  // 晚子时：星座按真实出生日（太阳黄经只认那一天），生肖按换日后的年支（与年柱同源）
  const sign = lateZi ? astro.getSignBySolarDate(inputSolar, 'zh-CN') : a.sign;
  const zodiac = a.zodiac;

  return {
    astrolabe: a,
    chart: {
      generator: `iztro@${IZTRO_VERSION}`,
      solarDate: lateZi ? inputSolar : a.solarDate,
      effectiveSolarDate,
      lateZi,
      lunarDate: a.lunarDate,
      timeIndex: displayTimeIndex,
      time: lateZi ? ZW_TIME_LATE : a.time,
      timeRange: lateZi ? ZW_TIME_LATE_RANGE : a.timeRange,
      gender: a.gender ?? gender,
      sign,
      zodiac,
      siZhu: a.chineseDate,
      yearGanZhi: ygz ?? '',
      yearGanZhiNote: `年柱：${ygz ?? ''}（农历年，春节为界；四柱另有立春口径）`,
      dayBoundary: lateZiLabel(eff.lateZiMode),
      timeWarnings: eff.resolution ? eff.resolution.warnings : [],
      warnings: mergeWarnings(eff.warnings, eff.resolution?.warnings),
      monthGanZhi: mgz ?? '',
      dayGanZhi: dgz ?? '',
      timeGanZhi: tgz ?? '',
      fiveElementsClass: a.fiveElementsClass,
      soulBranch: a.earthlyBranchOfSoulPalace,
      bodyBranch: a.earthlyBranchOfBodyPalace,
      soul: a.soul,
      body: a.body,
      palaces: toPalaces(a),
      disclaimer: '',
    },
  };
}

/**
 * 按阳历出生时间排紫微斗数盘，输出纯 JSON。
 * 只做排盘（含宫干四化飞化路径、大限四化），不含任何吉凶断语。
 */
export function paiZiwei(input: ZiweiInput): ZiweiChart {
  return buildZiwei(input).chart;
}

/**
 * 排盘并同时返回 iztro 原始星盘实例。
 * 用途：运限计算与回归测试复用同一次排盘（iztro 单次排盘约 40ms，重复排两次会拖慢测试）；
 * 返回的 astrolabe 是第三方对象，**不属于稳定契约**，业务代码请用 paiZiwei / ziweiYunXian。
 */
export function paiZiweiWithAstrolabe(input: ZiweiInput): {
  chart: ZiweiChart; astrolabe: ReturnType<typeof astro.bySolar>;
} {
  return buildZiwei(input);
}

/** 农历串里的月标签：'二〇二六年闰四月十六' → { month: 4, isLeap: true, label: '闰四月' } */
const ZW_MONTH_NUM: Record<string, number> = {
  正: 1, 一: 1, 二: 2, 三: 3, 四: 4, 五: 5, 六: 6, 七: 7, 八: 8, 九: 9, 十: 10, 冬: 11, 十一: 11, 腊: 12, 十二: 12,
};

export function lunarMonthOfText(text: string): { month: number; isLeap: boolean; label: string } | null {
  const m = /(闰)?([正一二三四五六七八九十冬腊]{1,2})月/.exec(String(text ?? ''));
  if (!m) return null;
  const num = ZW_MONTH_NUM[m[2]];
  if (!num) return null;
  const isLeap = m[1] === '闰';
  return { month: num, isLeap, label: `${isLeap ? '闰' : ''}${m[2]}月` };
}

/** 农历串里的日：'二〇二〇年闰四月廿五' → 25 */
const ZW_DAY_NUM: Record<string, number> = {
  初一: 1, 初二: 2, 初三: 3, 初四: 4, 初五: 5, 初六: 6, 初七: 7, 初八: 8, 初九: 9, 初十: 10,
  十一: 11, 十二: 12, 十三: 13, 十四: 14, 十五: 15, 十六: 16, 十七: 17, 十八: 18, 十九: 19,
  二十: 20, 廿一: 21, 廿二: 22, 廿三: 23, 廿四: 24, 廿五: 25, 廿六: 26, 廿七: 27, 廿八: 28, 廿九: 29,
  三十: 30,
};

export function lunarDayOfText(text: string): number {
  const m = /(初[一二三四五六七八九十]|十[一二三四五六七八九]|二十|廿[一二三四五六七八九]|三十)/.exec(String(text ?? ''));
  return m ? ZW_DAY_NUM[m[1]] ?? 0 : 0;
}

/** 运限某一层 → ZwYunScope */
function yunScopeOf(palaces: ZwPalace[], index: number, stem: string, branch: string): ZwYunScope {
  const p = palaces.find((q) => q.index === index);
  return {
    index,
    palaceName: p ? p.name : '',
    branch: p ? p.earthlyBranch : '',
    palaceGanZhi: p ? p.ganZhi : '',
    ganZhi: `${stem}${branch}`,
    heavenlyStem: stem,
    earthlyBranch: branch,
    hua: huaOfStem(palaces, stem),
  };
}

/**
 * 取某一阳历时刻的运限（大限 / 流年 / 流月）。
 *
 * 数据源：iztro 的 `horoscope(targetDate, timeIndex)` —— 大限/流年/流月宫位索引与干支均由它算出，
 * 本函数只做「偏移量 → 本命宫位」「干支 → 十干四化 → 落宫」的映射，不重算起例。
 * 流月按农历月（闰月后半月归次月，与 iztro 一致），入参只给年月时默认取该月 15 日 12 时，
 * 落在哪个农历月就报哪个月，并把农历月标签一起返回，避免"公历月 ≠ 农历月"的误读。
 */
export function ziweiYunXian(input: ZiweiInput, target: ZiweiYunTarget): ZiweiYunXian {
  const { chart, astrolabe: a } = buildZiwei(input);
  const ty = target.year;
  const tm = target.month;
  const td = target.day ?? 15;
  const solarStr = `${ty}-${tm}-${td}`;
  // 显式给 timeIndex，避免不同宿主时区下 dayjs 取到不同时辰
  const h = a.horoscope(solarStr, hourToTimeIndex(target.hour ?? 12));

  const decadalPalace = chart.palaces.find((p) => p.index === h.decadal.index);
  const decadal = {
    ...yunScopeOf(chart.palaces, h.decadal.index, h.decadal.heavenlyStem, h.decadal.earthlyBranch),
    range: (decadalPalace ? decadalPalace.decadalRange : [0, 0]) as [number, number],
    isChildhood: h.decadal.name !== '大限',
  };
  const yearly = yunScopeOf(chart.palaces, h.yearly.index, h.yearly.heavenlyStem, h.yearly.earthlyBranch);
  const lunarMonth = lunarMonthOfText(h.lunarDate) ?? { month: 0, isLeap: false, label: '' };
  const monthly: ZwYunMonthly = {
    ...yunScopeOf(chart.palaces, h.monthly.index, h.monthly.heavenlyStem, h.monthly.earthlyBranch),
    lunarMonth: lunarMonth.month,
    lunarDay: lunarDayOfText(h.lunarDate),
    isLeapMonth: lunarMonth.isLeap,
    monthLabel: lunarMonth.label,
  };

  return {
    solarDate: solarStr,
    lunarDate: h.lunarDate,
    nominalAge: h.age.nominalAge,
    decadal,
    yearly,
    monthly,
    chart,
  };
}
