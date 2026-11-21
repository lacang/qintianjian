/**
 * liuyao-core —— 六爻装卦引擎内核
 *
 * 纯 TypeScript、框架无关、浏览器与 Node 均可直接 import、离线运行。
 * 只做：历法 → 成卦 → 装卦 → 格式化；不做 UI、不联网、不做断卦。
 *
 * 许可：本包 MIT；运行时依赖 mingpan@0.1.8（Apache-2.0）、lunar-javascript（MIT）。
 */
export { solarToSiZhu, getDayCalendar, listJieqiInRange, type DayCalendar, type JieqiItem, type SiZhuWithTime } from './calendar.js';
// 统一时间层（时区 / 中国 1986–1991 夏令时 / 真太阳时）：核心与前端共用的唯一时间入口
export {
  resolveTime,
  utcParts,
  lookupCityTimeZone,
  listCityTimeZones,
  chinaDstWindow,
  chinaDstInEffect,
  chinaDstAppliesToCivil,
  equationOfTimeMinutes,
  formatOffsetName,
  formatCivilTime,
  civilForPaipan,
  applyLateZi,
  lateZiLabel,
  estimateTzFromCoords,
  offsetFromLongitude,
  nearestCityByCoords,
  haversineKm,
  CITY_TZ_TABLE,
  resolveChinaHistoricTz,
  isChinaCity,
  CHINA_TZ_UNIFIED_DATE,
} from './timeContext.js';
export type {
  CivilTime, CityTimeZone, DstRuleId, TimeResolveInput, TimeResolution,
  LateZiMode, PaipanCivil, TzEstimate, ChinaHistZone,
} from './timeContext.js';
export { castManual, castCoins, castTianji } from './input.js';
// 统一入参校验层（内校层）：所有排盘入口共用同一套日期/时间/坐标/性别规则
export {
  validateDateTime, validateDate, validateGeo, validateCastNumber, normalizeGender,
  highLatitudeWarnings, isLeapYear, daysInMonth, utcMsOf, showValue, mergeWarnings,
  YEAR_RANGES,
  InputValidationError, InvalidDateError, InvalidTimeError, OutOfRangeError,
  InvalidGenderError, InvalidNumberError,
} from './validate.js';
export type {
  Gender as InputGender, YearRangeId, ValidatedDateTime, ValidateDateTimeOptions, GeoPoint,
} from './validate.js';
export { castByTime, toApparentSolarTime, type TimeCastOptions, type TimeCastResult } from './timecast.js';
export { paipan, getShouGuaPan, type ShouGuaYao } from './paipan.js';
export * from './wuxing-rel.js';
export * from './wangshuai.js';
export { analyzeNajia, posName, computeYuanJiChou, wuXingToLiuQin, liuQinToWuXing, type NajiaAnalysis, type AnalyzeOptions, type Domain as NajiaDomain } from './najiaAnalysis.js';
export { calcGuaShen } from './guashen.js';
export { formatCopyText, formatScreen, type FormatOptions, type ScreenViewModel, type ScreenLine } from './format.js';
export { calcShenSha, SAN_HE } from './shensha.js';
export {
  getGuaMeta,
  getFullNajia,
  getTrigramsFromValues,
  getShouGuaName,
  type FullNajia,
  type RawGuaMeta,
} from './guaTable.js';
export { toSimplified } from './constants.js';

// 八字
export { paiBazi, tenGod, liuNianGanZhiSequence } from './bazi.js';
// 八字扩展层（神煞 / 刑冲合害 / 流年流月 / 旺衰依据）——只增一行，不动既有导出面
export * from './bazi-extra.js';
export type {
  BaziInput,
  BaziResult,
  Pillar,
  HiddenGan,
  DaYunItem,
  Gender,
} from './bazi.js';

// 子午流注（纳子法当令经络）
export { getMeridian, getMeridianByTime, meridianFromClock, shichenIndex } from './meridian.js';
export type { MeridianInfo, MeridianAtTime } from './meridian.js';

// 梅花易数
export {
  meiHuaByTime,
  meiHuaByNumbers,
  BAGUA_WUXING as MEIHUA_BAGUA_WUXING,
} from './meihua.js';
export type { MeiHuaResult, Trigram, HexagramInfo } from './meihua.js';

// 奇门遁甲（时家·转盘·拆补）
export { paiQiMen } from './qimen.js';
export type { QiMenInput, QiMenPan } from './qimen.js';

// 西方古典占星
export { paipanXingpan } from './astro.js';
// 印度吠陀占星（Jyotisha：Lahiri 恒星黄道 + 整宫 + 九曜 + 27宿 + D9 + Vimshottari）
export {
  paipanVedic,
  GRAHA_ORDER, GRAHA_ZH, GRAHA_SANSKRIT, GRAHA_SHORT,
  RASHI_SANSKRIT, NAKSHATRAS,
} from './vedic.js';
export type {
  VedicChart, Graha, GrahaId, GrahaDrishti, NakshatraPos,
  NakshatraInfo, Vimshottari, DasaPeriod, YogaInfo,
} from './vedic.js';
export { guDianTuiYun, listFirdariaPeriods, listProfectionYears } from './astroTiming.js';
export type { FirdariaPeriod } from './astroTiming.js';
export { shouyeTianxiang } from './astroSky.js';
export {
  PLANET_ORDER,
  PLANET_ZH,
  SIGN_ZH,
  DIGNITY_ZH,
  moonPhaseName,
} from './astro-constants.js';
export type {
  AstroInput, NatalChart, AstroBody, Dms, Dignity,
} from './astro.js';
export type {
  TimingInput, ProfectionInfo, FirdariaInfo,
} from './astroTiming.js';
export type {
  Tianxiang, SkyBody, QuarterEvent, IngressEvent, MercuryRetro,
} from './astroSky.js';
export type { PlanetId } from './astro-constants.js';

// 实时中国传统星象：二十八宿躔次（纯天文历法事实，不作吉凶）
export { mansionSnapshot, riChan, yueLi, zhiSu } from './mansion.js';
export type {
  MansionSnapshot, BodyInMansion, MansionFrame,
  MansionObserver, ZhiSu,
} from './mansion.js';
export {
  MANSIONS, MANSION_BY_NAME, mansionIndex, SISHOU_COLOR,
  guDuToDeg, GU_DU_ZHOUTIAN,
} from './mansions-data.js';
export type { MansionMeta, MansionStar, SiShou } from './mansions-data.js';

// M5 经传事实层（《周易》白文查表层：只报原文，不做吉凶解释）
export {
  resolveGua,
  getGuaAnnotation,
  getMovingLineAnnotation,
  listWings,
  getWing,
  ZHOUYI_META,
} from './annotations/index.js';
export type { GuaAnnotation, YaoAnnotation } from './annotations/index.js';
export {
  listReadingDomains,
  getReadingDomain,
  READING_DOMAINS,
} from './annotations/reading.js';
export type { ReadingDomain, YongShenRef, ClassicQuote } from './annotations/reading.js';

// M6 紫微斗数（iztro 底座，MIT；只排盘列星曜/四化/大限，不作吉凶断语）
export { paiZiwei, hourToTimeIndex, ziweiYunXian } from './ziwei.js';
export type {
  ZiweiInput,
  ZiweiChart,
  ZwPalace,
  ZwStar,
  ZwMutagen,
  ZwFlyHua,
  ZwFlyIn,
  ZiweiGender,
  ZwYunHua,
  ZwYunScope,
  ZwYunMonthly,
  ZiweiYunTarget,
  ZiweiYunXian,
} from './ziwei.js';

// M7 通用可插拔卡牌框架（韦特 RWS 1909 PD 为默认牌组；只给牌义/位置/自问方向，不替用户断结果）
export * from './cards/index.js';

export type * from './types.js';
