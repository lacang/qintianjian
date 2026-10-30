/**
 * 爻的旺衰 / 月日作用 / 动变关系（纳甲断卦事实层）
 *
 * 只输出《增删卜易》体系下的确定性事实标签，绝不下吉凶结论。
 * 月建、日辰对一爻的作用是断卦的基本盘：
 *   月令：当令为旺、令生为相、克令为囚、令克为死、同我(生令)为休。
 *   日辰：按五行关系给出 比和/日生/日克/生日/克日。
 *   另有 月破、旬空、入墓、逢绝、长生、帝旺、伏吟/反吟、
 *         回头生/回头克/化进化退 等事实标记。
 */
import { ZHI_WUXING } from './constants.js';
import type { DiZhi, WuXing } from './types.js';
import {
  CHANG_SHENG, LIU_CHONG, huaJinTui, relationOf,
} from './wuxing-rel.js';

/** 月令旺衰五态 */
export type LingTai = '旺' | '相' | '休' | '囚' | '死';

/** 日辰对爻的作用 */
export type RiRole = '日建比和' | '日建生爻' | '日建克爻' | '爻生日建' | '爻克日建';

/** 一爻相对月日与（可选）变爻的全部事实标记 */
export interface YaoState {
  wuXing: WuXing;
  /** 月令状态（本判旺衰，依月令五行关系；月破不改写。五行关系明细见 monthRole） */
  lingTai: LingTai;
  /** 月建对爻五行关系明细 */
  monthRole: string;
  /** 日辰作用 */
  riRole: RiRole;
  /** 月破：爻支被月建冲 */
  yuePo: boolean;
  /** 旬空：爻支在日辰旬空内 */
  xunKong: boolean;
  /** 日破/暗动候选：静爻被日辰冲（是否暗动取决于旺衰，事实层只标记） */
  riChong: boolean;
  /** 暗动：静爻被日辰冲且本判旺或相 */
  anDong: boolean;
  /** 日破：静爻被日辰冲且非旺相（死/囚/休；休态 2026-10-28 起归入日破） */
  riPo: boolean;
  /** 日建/月建合爻支 */
  riHe: boolean;
  yueHe: boolean;
  /** 长生 / 帝旺 / 入墓 / 逢绝（对月建或日辰取） */
  changSheng: boolean;
  diWang: boolean;
  ruMu: boolean;
  fengJue: boolean;
  /** 动而化伏吟：变爻地支 == 本位地支 */
  fuYin: boolean;
  /** 动而化反吟：变爻地支冲本位地支 */
  fanYin: boolean;
  /** 动变：回头生 / 回头克 / 化进神 / 化退神 */
  huaTouSheng: boolean;
  huaTouKe: boolean;
  huaJin: boolean;
  huaTui: boolean;
  /** 汇总的可读标签（中性，仅描述） */
  tags: string[];
}

/**
 * 月令旺衰（以月建五行论）。
 * 爻五行 == 令 → 旺；令生爻 → 相；爻生令 → 休；令克爻 → 死；爻克令 → 囚。
 */
export function lingTaiOf(yaoWx: WuXing, lingWx: WuXing): LingTai {
  if (yaoWx === lingWx) return '旺';
  const sheng: Record<WuXing, WuXing> = { 金: '水', 水: '木', 木: '火', 火: '土', 土: '金' };
  const ke: Record<WuXing, WuXing> = { 金: '木', 木: '土', 土: '水', 水: '火', 火: '金' };
  if (sheng[lingWx] === yaoWx) return '相';   // 令生爻（如春木令，火为相）
  if (sheng[yaoWx] === lingWx) return '休';   // 爻生令（如水生木，水为休）
  if (ke[lingWx] === yaoWx) return '死';      // 令克爻（如木克土，土为死）
  return '囚';                                // 爻克令（如金克木，金为囚）
}

export interface YaoStateInput {
  zhi: DiZhi;
  wuXing: WuXing;
  moving: boolean;
  /** 月建、日辰地支（Pan.siZhu 不含，由上层从 solarToSiZhu 透传，见 analyzeNajia） */
  monthZhi: DiZhi;
  dayZhi: DiZhi;
  xunKong: [DiZhi, DiZhi];
  /** 变爻地支（仅动爻有） */
  bianZhi?: DiZhi;
}

/** 六合判断（放本地小表，避免与关系表循环依赖顾虑） */
const HE: Partial<Record<DiZhi, DiZhi>> = {
  子: '丑', 丑: '子', 寅: '亥', 亥: '寅', 卯: '戌', 戌: '卯',
  辰: '酉', 酉: '辰', 巳: '申', 申: '巳', 午: '未', 未: '午',
};

export function evalYao(input: YaoStateInput): YaoState {
  const { zhi, wuXing, moving, monthZhi, dayZhi, xunKong, bianZhi } = input;
  const lingWx = ZHI_WUXING[monthZhi];
  const riWx = ZHI_WUXING[dayZhi];
  const lingTai = lingTaiOf(wuXing, lingWx);

  const relMonth = relationOf(wuXing, lingWx);
  const monthRoleMap: Record<string, string> = {
    同: '与月建比和', 生: '生月建（泄）', 克: '克月建', 被生: '得月建生', 被克: '被月建克',
  };
  const relRi = relationOf(wuXing, riWx);
  const riRoleMap: Record<string, RiRole> = {
    同: '日建比和', 被生: '日建生爻', 被克: '日建克爻', 生: '爻生日建', 克: '爻克日建',
  };

  const yuePo = LIU_CHONG[monthZhi] === zhi;
  const xk = xunKong.includes(zhi);
  const riChong = !moving && LIU_CHONG[dayZhi] === zhi;
  // 暗动：静爻被日冲且本判旺/相。日破：静爻被日冲而非本判旺/相
  //   （死/囚为衰破，休态经 2026-10-28 董事长裁决归入日破）。
  // 月破不改写本判旺衰（2026-10-30 董事长裁决·方案 A）：
  //   月建之「破」是功能性失效——《增删卜易·月建章》「爻逢月破而无功」「月破乃无用之爻」，
  //   由 verdict 的 yuepo 规则单独计分表达；旺衰仍依月令五行关系判定
  //   （《占病章》「值月破须看用神之衰旺，旺则愈于实破之日及出月而愈」）。
  //   日冲的暗动/日破一律按本判旺衰执行，不因月破人工降态。
  //   相冲两支五行必为比和（辰戌、丑未→旺）或相克（子午、巳亥、寅申、卯酉→死/囚），
  //   故月破爻本判只可能为 旺/囚/死，「相」「休」在月破条件下不可达。
  const anDong = riChong && (lingTai === '旺' || lingTai === '相');
  const riPo = riChong && !(lingTai === '旺' || lingTai === '相');
  const riHe = HE[dayZhi] === zhi;
  const yueHe = HE[monthZhi] === zhi;

  const cs = CHANG_SHENG[wuXing];
  const at = (slot: DiZhi, z: DiZhi) => slot === z;
  const changSheng = at(cs.zhangsheng, monthZhi) || at(cs.zhangsheng, dayZhi);
  const diWang = at(cs.diwang, monthZhi) || at(cs.diwang, dayZhi);
  const ruMu = at(cs.mu, monthZhi) || at(cs.mu, dayZhi);
  const fengJue = at(cs.jue, monthZhi) || at(cs.jue, dayZhi);

  const fuYin = moving && !!bianZhi && bianZhi === zhi;
  const fanYin = moving && !!bianZhi && LIU_CHONG[zhi] === bianZhi;
  let huaTouSheng = false, huaTouKe = false, huaJin = false, huaTui = false;
  if (moving && bianZhi) {
    const bianWx = ZHI_WUXING[bianZhi];
    const r = relationOf(bianWx, wuXing); // 变爻对本位爻
    if (r === '生') huaTouSheng = true;   // 变爻生本位 = 回头生
    if (r === '克') huaTouKe = true;      // 变爻克本位 = 回头克
    const jt = huaJinTui(zhi, bianZhi);
    if (jt === '进神') huaJin = true;
    if (jt === '退神') huaTui = true;
  }

  const tags: string[] = [];
  tags.push(`${lingTai}于月`);
  tags.push(riRoleMap[relRi]);
  if (yueHe) tags.push('月合');
  if (riHe) tags.push('日合');
  if (yuePo) tags.push('月破');
  if (xk) tags.push('旬空');
  if (riChong) {
    if (anDong) tags.push('暗动');
    else if (riPo) tags.push('日破');
  }
  if (changSheng) tags.push('长生');
  if (diWang) tags.push('帝旺');
  if (ruMu) tags.push('入墓');
  if (fengJue) tags.push('逢绝');
  if (huaTouSheng) tags.push('动化回头生');
  if (huaTouKe) tags.push('动化回头克');
  if (huaJin) tags.push('化进神');
  if (huaTui) tags.push('化退神');
  if (fuYin) tags.push('化伏吟');
  if (fanYin) tags.push('化反吟');

  return {
    // lingTai 输出本判旺衰（月破不改写）；月令五行关系原值保留在 monthRole。
    wuXing, lingTai, monthRole: monthRoleMap[relMonth],
    riRole: riRoleMap[relRi],
    yuePo, xunKong: xk, riChong, anDong, riPo, riHe, yueHe,
    changSheng, diWang, ruMu, fengJue,
    fuYin, fanYin, huaTouSheng, huaTouKe, huaJin, huaTui,
    tags,
  };
}
