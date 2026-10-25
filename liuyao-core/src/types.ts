/**
 * liuyao-core 公共类型定义
 *
 * 设计原则：装卦层只输出确定性结构，不含任何 UI、不联网、不做断卦。
 * 术语一律用简体中文；底层 mingpan 输出的繁体在边界层转换。
 */

/** 爻值（铜钱法/三枚铜钱的标准爻值）：6=老阴(动) 7=少阳(静) 8=少阴(静) 9=老阳(动) */
export type YaoValue = 6 | 7 | 8 | 9;

/** 阴阳 */
export type YinYang = '阴' | '阳';

/** 五行 */
export type WuXing = '金' | '木' | '水' | '火' | '土';

/** 六亲（简体） */
export type LiuQin = '父母' | '兄弟' | '子孙' | '妻财' | '官鬼';

/** 六神（简体） */
export type LiuShen = '青龙' | '朱雀' | '勾陈' | '螣蛇' | '白虎' | '玄武';

/** 天干 */
export type TianGan = '甲' | '乙' | '丙' | '丁' | '戊' | '己' | '庚' | '辛' | '壬' | '癸';

/** 地支 */
export type DiZhi =
  | '子' | '丑' | '寅' | '卯' | '辰' | '巳'
  | '午' | '未' | '申' | '酉' | '戌' | '亥';

/** 八卦（简体） */
export type BaGua = '乾' | '兑' | '离' | '震' | '巽' | '坎' | '艮' | '坤';

/** 世应角色 */
export type ShiYing = '世' | '应' | undefined;

/** 六爻自下而上的成卦输入（每爻 6/7/8/9） */
export type YaoValues = [YaoValue, YaoValue, YaoValue, YaoValue, YaoValue, YaoValue];

/** 起卦公历时间（北京时间；真太阳时校正留给上层） */
export interface SolarDateInput {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute?: number;
}

/** 四柱 + 旬空（solarToSiZhu 的返回） */
export interface SiZhu {
  /** 公历年月日时分（北京时间） */
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
  /** 农历日期串（lunar-javascript toString，仅展示用） */
  lunarText: string;
  yearGanZhi: string;
  monthGanZhi: string;
  dayGanZhi: string;
  timeGanZhi: string;
  dayGan: TianGan;
  dayZhi: DiZhi;
  monthZhi: DiZhi;
  /** 日旬空两个地支 */
  xunKong: [DiZhi, DiZhi];
}

/** 手录六爻输入：自下而上每爻指定阴阳与是否动 */
export interface ManualYao {
  yinYang: YinYang;
  moving?: boolean;
}

/** 一次摇铜钱：三枚铜钱各自的背数（字面=0，背=1），合计 0~3 */
export interface CoinToss {
  coinBacks: [0 | 1, 0 | 1, 0 | 1];
}

/** 成卦来源 */
export type CastSource = 'manual' | 'coins' | 'tianji' | 'time';

/** 成卦结果（三种入口统一产出） */
export interface CastResult {
  /** 六爻值，自下而上（初→上） */
  yaoValues: YaoValues;
  /** 动爻位置（1-6，初爻=1） */
  movingPositions: number[];
  /** 成卦入口：手录 / 摇铜钱 / 天机随机 */
  source: CastSource;
}

/** 排盘输入：成卦六爻 + 起卦时间 + 人事信息 */
export interface PaipanInput extends SolarDateInput {
  /** 六爻值（自下而上），也可直接传 castManual/castCoins/castTianji 的返回 */
  yaoValues: number[] | CastResult;
  gender?: '男' | '女';
  /** 所问之事，空则复制文本输出"未填写所占之事" */
  question?: string;
}

/** 伏神信息 */
export interface FuShen {
  /** 伏神所在爻位（1-6） */
  position: number;
  /** 伏神六亲（按本卦宫五行） */
  liuQin: LiuQin;
  /** 伏神纳甲天干（本宫首卦该位天干） */
  gan: TianGan;
  /** 伏神纳甲地支 */
  zhi: DiZhi;
  /** 伏神五行 */
  wuXing: WuXing;
  /** 飞神（该爻位本卦爻）纳甲天干 */
  feiGan: TianGan;
  /** 飞神地支 */
  feiZhi: DiZhi;
  /** 飞神六亲 */
  feiLiuQin: LiuQin;
  /** 飞伏关系（简体）：飞克伏/飞生伏/伏克飞/伏生飞/比和 */
  relation: string;
}

/** 本卦六爻中的一爻 */
export interface BenYao {
  /** 爻位 1-6（1=初爻，6=上爻） */
  position: number;
  yinYang: YinYang;
  moving: boolean;
  liuShen: LiuShen;
  gan: TianGan;
  zhi: DiZhi;
  wuXing: WuXing;
  liuQin: LiuQin;
  shiYing: ShiYing;
}

/** 变卦（之卦）整盘，六爻全列；仅 moving=true 的爻是真正的"变爻" */
export interface BianYao {
  position: number;
  /** 该位是否由动爻变来 */
  moving: boolean;
  yinYang: YinYang;
  gan: TianGan;
  zhi: DiZhi;
  wuXing: WuXing;
  /** 六亲恒按本卦宫五行（头号红线，见 README） */
  liuQin: LiuQin;
  shiYing: ShiYing;
}

/** 卦体信息（本卦/变卦共用） */
export interface GuaMeta {
  /** 简体卦名（如"泽火革"） */
  name: string;
  /** 八纯首卦名（如"坎为水"） */
  shouGuaName: string;
  upper: BaGua;
  lower: BaGua;
  /** 所属宫 */
  gong: BaGua;
  gongWuXing: WuXing;
  /** 世爻位置 1-6 */
  shiPosition: number;
  /** 应爻位置 1-6 */
  yingPosition: number;
  /** 八宫卦序 1-8（1本宫…5五世，7游魂，8归魂；mingpan 口径） */
  guaXu: number;
  isYouHun: boolean;
  isGuiHun: boolean;
  /** 八纯卦（本宫首卦） */
  isBaChun: boolean;
  specialType?: '六合' | '六冲';
}

/** 神煞行（按日干支/月建，14 项，取值以金标准 App 为唯一口径） */
export interface ShenSha {
  yiMa: DiZhi;
  taoHua: DiZhi;
  riLu: DiZhi;
  /** 天乙贵人（昼夜不分，按日干两支，如乙日 ['子','申']） */
  guiRen: [DiZhi, DiZhi];
  wenChang: DiZhi;
  yangRen: DiZhi;
  jiangXing: DiZhi;
  mouXing: DiZhi;
  jieSha: DiZhi;
  zaiSha: DiZhi;
  huaGai: DiZhi;
  riDe: DiZhi;
  /** 天马：按月建驿马（与日支驿马同口诀，基准为月支） */
  tianMa: DiZhi;
  /** 天医：月建后退一位 */
  tianYi: DiZhi;
}

/** 标准盘对象（paipan 的返回） */
export interface Pan {
  /** 起卦公历时间 */
  solar: { year: number; month: number; day: number; hour: number; minute: number };
  gender: '男' | '女';
  question: string;
  siZhu: {
    yearGanZhi: string;
    monthGanZhi: string;
    dayGanZhi: string;
    timeGanZhi: string;
  };
  xunKong: [DiZhi, DiZhi];
  benGua: GuaMeta;
  /** 自下而上 */
  yaoList: BenYao[];
  /** 变卦；无动爻时为 undefined（静卦） */
  bianGua?: GuaMeta;
  /** 自下而上；有动爻时存在，六爻全列 */
  bianYaoList?: BianYao[];
  movingPositions: number[];
  /** 卦中缺失六亲对应的伏神（mingpan 口径：只列真正不上卦者） */
  fuShenList: FuShen[];
  shenSha: ShenSha;
  /** 卦身地支（《增删卜易·卦身章》，由世爻位置推算） */
  guaShen?: DiZhi;
}
