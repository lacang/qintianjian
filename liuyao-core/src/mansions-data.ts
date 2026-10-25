/**
 * 二十八宿 —— 距星常量、宿度文献与元数据
 *
 * 铁律（同全项目）：只做天文历法事实，不做星占吉凶、不排演休咎。
 *
 * 一、距星与坐标
 * 二十八宿以「距星」为每宿西界起点，天体入某宿看其赤经/黄经落在哪两颗相邻
 * 距星之间。本表取清代《仪象考成》系统的 28 距星（今通行中西对照口径），
 * 坐标为 ICRS/J2000.0 平位置（度），来源为公开星表观测事实：
 *   亮距星与 caelus 内联 HYG（Hipparcos/Tycho 归算）一致；
 *   暗距星（氐/箕/斗/奎/胃/鬼/柳/张）取自 Hipparcos/SIMBAD 公开坐标。
 * 注意：HYG 数据库本身为 CC BY-SA 4.0，本项目不打包其汇编；此处仅收录 28 颗
 * 距星的 J2000 坐标数值——单一恒星的坐标是公有观测事实，不构成数据库的原创选排。
 *
 * 二、坐标系（两套并列，不强行合一）
 * - 赤道宿度：中国传统天文正朔（《淮南子·天文训》《开元占经》《授时历》），
 *   以距星赤经分区；
 * - 黄道宿度：七政四余所用，以距星黄经分区。
 * 本模块对给定时刻把 J2000 距星用岁差章动旋转到「当日真赤道 / 真黄道」后再分区，
 * 故赤、黄两套都是「随岁差漂移的实测恒星宫界」，与古历以距星实测划宿一致。
 *
 * 三、觜参次序（重要事实，勿「修正」）
 * 因岁差与恒星自行，约公元 13 世纪后觜宿距星（λ Ori）赤经反超参宿距星（δ Ori），
 * 现代实测赤经、黄经升序皆为「…毕、参、觜、井…」，觜宿被挤成极窄一宿
 * （赤道约 0.9°、黄道约 1.4°）。清《时宪历》曾据实测删并觜宿，引发改历大争论。
 * 本模块保留全部 28 宿，按实测坐标分区，并在输出中标记 `inverted`，不替古人/今人
 * 二选一。
 *
 * 四、历代宿度流变（并列展示，不用来替代实测）
 * 古历一周天 365.25 度（岁实），《崇祯历书》始改 360° 制。下表收录《元史·历志·
 * 授时历经》赤道宿度与黄道宿度（一周天 365.2575 度），供与今日实测跨度对照；
 * 另注角宿等历代变迁。宿度随岁差缓变，文献值是「那个年代的实测」，本页主算仍以
 * 当代距星位置为准。
 */

/** 四象（七宿一组，按传统顺序：东→北→西→南） */
export type SiShou = '青龙' | '玄武' | '白虎' | '朱雀';

export interface MansionStar {
  /** 拜耳/弗兰斯蒂德编号（西方对照） */
  bayer: string;
  /** IAU/常用专名（无则空） */
  western: string;
  /** J2000 赤经（度） */
  ra0: number;
  /** J2000 赤纬（度） */
  dec0: number;
  /** 视星等（约，供绘制亮度） */
  mag: number;
}

export interface MansionMeta {
  /** 单字宿名（传统 28 序，角居首） */
  name: string;
  /** 拼音 */
  pinyin: string;
  /** 四象 */
  sishou: SiShou;
  /** 七曜（日/月/火/水/木/金/土）——二十八宿禽曜配属，仅作历法名物标注，不用于断语 */
  qiyao: string;
  /** 二十八禽（动物配属，名物资料） */
  qin: string;
  /** 距星 */
  star: MansionStar;
  /** 《授时历》赤道宿度（古度，365.2575 制），单位「度」；文献值 */
  shoushiEq: number;
  /** 《授时历》黄道宿度（古度）；文献值 */
  shoushiEc: number;
  /** 距星/宿度流变注记（有则列，纯文献事实） */
  note?: string;
}

/**
 * 28 宿，传统顺序（角→轸）。
 * 授时历宿度按《元史·卷五十四·历三·授时历经上》：
 *   赤道（分百进制，如「角十二一十」=12.10 度）；
 *   黄道（如「角十二八十七」=12.87 度）。
 * 虚宿「八九十五太」=8.9575 度（太=3/4），黄道「九分空太」=9.0075。
 */
export const MANSIONS: MansionMeta[] = [
  { name: '角', pinyin: 'Jiǎo', sishou: '青龙', qiyao: '木', qin: '蛟',
    shoushiEq: 12.10, shoushiEc: 12.87,
    star: { bayer: 'α Vir', western: 'Spica 角宿一', ra0: 201.29825, dec0: -11.16132, mag: 0.98 },
    note: '角宿距星：唐宋用左角（角宿二 ζ Vir），明清《仪象考成》改角宿一 α Vir(Spica)。汉永元铜仪赤道 13 度，唐开元游仪/宋景祐 12 度，《授时历》12.10，明《崇祯历书》360°制 11°44′。' },
  { name: '亢', pinyin: 'Kàng', sishou: '青龙', qiyao: '金', qin: '龙',
    shoushiEq: 9.20, shoushiEc: 9.56,
    star: { bayer: 'κ Vir', western: 'Kang 亢宿一', ra0: 213.22394, dec0: -10.27370, mag: 4.18 } },
  { name: '氐', pinyin: 'Dī', sishou: '青龙', qiyao: '土', qin: '貉',
    shoushiEq: 16.30, shoushiEc: 16.40,
    star: { bayer: 'α² Lib', western: 'Zubenelgenubi 氐宿一', ra0: 222.71964, dec0: -16.04178, mag: 2.75 } },
  { name: '房', pinyin: 'Fáng', sishou: '青龙', qiyao: '日', qin: '兔',
    shoushiEq: 5.60, shoushiEc: 5.48,
    star: { bayer: 'π Sco', western: 'Fang 房宿一', ra0: 239.71300, dec0: -26.11404, mag: 2.89 } },
  { name: '心', pinyin: 'Xīn', sishou: '青龙', qiyao: '月', qin: '狐',
    shoushiEq: 6.50, shoushiEc: 6.27,
    star: { bayer: 'σ Sco', western: 'Alniyat 心宿一', ra0: 245.29714, dec0: -25.59281, mag: 2.89 },
    note: '心宿二即大火（Antares α Sco）；本宿距星取心宿一 σ Sco（《仪象考成》）。' },
  { name: '尾', pinyin: 'Wěi', sishou: '青龙', qiyao: '火', qin: '虎',
    shoushiEq: 19.10, shoushiEc: 17.95,
    star: { bayer: 'μ¹ Sco', western: 'Xamidimura 尾宿一', ra0: 252.96766, dec0: -38.04733, mag: 3.00 } },
  { name: '箕', pinyin: 'Jī', sishou: '青龙', qiyao: '水', qin: '豹',
    shoushiEq: 10.40, shoushiEc: 9.59,
    star: { bayer: 'γ² Sgr', western: 'Alnasl 箕宿一', ra0: 271.45202, dec0: -30.42403, mag: 2.96 } },

  { name: '斗', pinyin: 'Dǒu', sishou: '玄武', qiyao: '木', qin: '獬',
    shoushiEq: 25.20, shoushiEc: 23.47,
    star: { bayer: 'φ Sgr', western: '斗宿一', ra0: 281.41411, dec0: -26.99078, mag: 3.17 },
    note: '南斗六星之斗宿一 φ Sgr（27 Sgr），勿与北斗混。' },
  { name: '牛', pinyin: 'Niú', sishou: '玄武', qiyao: '金', qin: '牛',
    shoushiEq: 7.20, shoushiEc: 6.90,
    star: { bayer: 'β Cap', western: 'Dabih 牛宿一', ra0: 305.25272, dec0: -14.78138, mag: 3.05 } },
  { name: '女', pinyin: 'Nǚ', sishou: '玄武', qiyao: '土', qin: '蝠',
    shoushiEq: 11.35, shoushiEc: 11.12,
    star: { bayer: 'ε Aqr', western: 'Albali 女宿一', ra0: 311.91896, dec0: -9.49577, mag: 3.78 } },
  { name: '虚', pinyin: 'Xū', sishou: '玄武', qiyao: '日', qin: '鼠',
    shoushiEq: 8.9575, shoushiEc: 9.0075,
    star: { bayer: 'β Aqr', western: 'Sadalsuud 虚宿一', ra0: 322.88977, dec0: -5.57118, mag: 2.91 },
    note: '虚宿宿度历代流变最大：古 14 度，西汉后 10 度，《授时历》赤道 8.9575、《崇祯历书》8°41′。' },
  { name: '危', pinyin: 'Wēi', sishou: '玄武', qiyao: '月', qin: '燕',
    shoushiEq: 15.40, shoushiEc: 15.95,
    star: { bayer: 'α Aqr', western: 'Sadalmelik 危宿一', ra0: 331.44598, dec0: 0.31985, mag: 2.95 } },
  { name: '室', pinyin: 'Shì', sishou: '玄武', qiyao: '火', qin: '猪',
    shoushiEq: 17.10, shoushiEc: 18.32,
    star: { bayer: 'α Peg', western: 'Markab 室宿一', ra0: 346.19606, dec0: 15.20525, mag: 2.48 } },
  { name: '壁', pinyin: 'Bì', sishou: '玄武', qiyao: '水', qin: '貐',
    shoushiEq: 8.60, shoushiEc: 9.34,
    star: { bayer: 'γ Peg', western: 'Algenib 壁宿一', ra0: 3.30918, dec0: 15.18364, mag: 2.83 } },

  { name: '奎', pinyin: 'Kuí', sishou: '白虎', qiyao: '木', qin: '狼',
    shoushiEq: 16.60, shoushiEc: 17.87,
    star: { bayer: 'ζ And', western: '奎宿二', ra0: 11.83469, dec0: 24.26718, mag: 4.08 },
    note: '奎宿距星各本不一：《仪象考成》取奎宿二 ζ And，亦有本作奎宿一 η And（J2000 RA≈0h57m, dec≈+23°25′）。此处取 ζ And 口径。' },
  { name: '娄', pinyin: 'Lóu', sishou: '白虎', qiyao: '金', qin: '狗',
    shoushiEq: 11.80, shoushiEc: 12.36,
    star: { bayer: 'β Ari', western: 'Sheratan 娄宿一', ra0: 28.66005, dec0: 20.80803, mag: 2.64 } },
  { name: '胃', pinyin: 'Wèi', sishou: '白虎', qiyao: '土', qin: '雉',
    shoushiEq: 15.60, shoushiEc: 15.81,
    star: { bayer: '35 Ari', western: '胃宿二', ra0: 40.86296, dec0: 27.70717, mag: 4.65 } },
  { name: '昴', pinyin: 'Mǎo', sishou: '白虎', qiyao: '日', qin: '鸡',
    shoushiEq: 11.30, shoushiEc: 11.08,
    star: { bayer: '17 Tau', western: 'Electra 昴宿一', ra0: 56.21891, dec0: 24.11334, mag: 3.72 },
    note: '昴宿即昴星团（七姊妹，M45）；距星取 17 Tau (Electra)。' },
  { name: '毕', pinyin: 'Bì', sishou: '白虎', qiyao: '月', qin: '乌',
    shoushiEq: 17.40, shoushiEc: 16.50,
    star: { bayer: 'ε Tau', western: 'Ain 毕宿一', ra0: 67.15417, dec0: 19.18028, mag: 3.53 } },
  { name: '觜', pinyin: 'Zī', sishou: '白虎', qiyao: '火', qin: '猴',
    shoushiEq: 0.05, shoushiEc: 0.05,
    star: { bayer: 'λ Ori', western: 'Meissa 觜宿一', ra0: 83.86002, dec0: 9.93342, mag: 3.39 },
    note: '觜宿：《授时历》宿度仅 0.05 古度；元代以降其距星赤经反超参宿，现代实测赤道/黄道升序皆为「参前觜后」，清《时宪历》曾据删并，参宿改历之争。' },
  { name: '参', pinyin: 'Shēn', sishou: '白虎', qiyao: '水', qin: '猿',
    shoushiEq: 11.10, shoushiEc: 10.28,
    star: { bayer: 'δ Ori', western: 'Mintaka 参宿一', ra0: 83.00167, dec0: -0.29909, mag: 2.23 },
    note: '参宿距星《仪象考成》取参宿一 δ Ori(Mintaka)；《中西对照恒星图表》或作参宿三 ζ Ori(Alnitak)。' },
  { name: '井', pinyin: 'Jǐng', sishou: '白虎', qiyao: '木', qin: '犴',
    shoushiEq: 33.30, shoushiEc: 31.03,
    star: { bayer: 'μ Gem', western: 'Tejat 井宿一', ra0: 95.74011, dec0: 22.51356, mag: 2.86 } },

  { name: '鬼', pinyin: 'Guǐ', sishou: '朱雀', qiyao: '金', qin: '羊',
    shoushiEq: 2.20, shoushiEc: 2.11,
    star: { bayer: 'θ Cnc', western: '鬼宿一', ra0: 127.89890, dec0: 18.09441, mag: 5.32 },
    note: '鬼宿四星中有「积尸气」(M44 蜂巢星团)；距星 θ Cnc 偏暗(约 5.3 等)。' },
  { name: '柳', pinyin: 'Liǔ', sishou: '朱雀', qiyao: '土', qin: '獐',
    shoushiEq: 13.30, shoushiEc: 13.00,
    star: { bayer: 'δ Hya', western: 'Lisan al Shudja 柳宿一', ra0: 129.41403, dec0: 5.70378, mag: 4.15 } },
  { name: '星', pinyin: 'Xīng', sishou: '朱雀', qiyao: '日', qin: '马',
    shoushiEq: 6.30, shoushiEc: 6.31,
    star: { bayer: 'α Hya', western: 'Alphard 星宿一', ra0: 141.89685, dec0: -8.65860, mag: 1.99 } },
  { name: '张', pinyin: 'Zhāng', sishou: '朱雀', qiyao: '月', qin: '鹿',
    shoushiEq: 17.25, shoushiEc: 17.79,
    star: { bayer: 'υ¹ Hya', western: 'Zhang 张宿一', ra0: 147.86956, dec0: -14.84660, mag: 4.12 } },
  { name: '翼', pinyin: 'Yì', sishou: '朱雀', qiyao: '火', qin: '蛇',
    shoushiEq: 18.75, shoushiEc: 20.09,
    star: { bayer: 'α Crt', western: 'Alkes 翼宿一', ra0: 164.94361, dec0: -18.29878, mag: 4.07 } },
  { name: '轸', pinyin: 'Zhěn', sishou: '朱雀', qiyao: '水', qin: '蚓',
    shoushiEq: 17.30, shoushiEc: 18.75,
    star: { bayer: 'γ Crv', western: 'Gienah 轸宿一', ra0: 183.95154, dec0: -17.54193, mag: 2.58 } },
];

/** 宿名 → 元数据 */
export const MANSION_BY_NAME: Readonly<Record<string, MansionMeta>> = Object.fromEntries(
  MANSIONS.map((m) => [m.name, m]),
);

/** 传统 28 序索引（角=0） */
export function mansionIndex(name: string): number {
  return MANSIONS.findIndex((m) => m.name === name);
}

/** 四象配色（不含吉凶暗示，仅分组色） */
export const SISHOU_COLOR: Record<SiShou, string> = {
  青龙: '#3f9d6e',
  玄武: '#4f7fb0',
  白虎: '#b0a48f',
  朱雀: '#c05a4a',
};

/**
 * 《授时历》周天岁实（古度制），用于古度↔360°换算。
 * 365.2575 古度 = 360°，故 1 古度 = 360/365.2575 度。
 */
export const GU_DU_ZHOUTIAN = 365.2575;
export function guDuToDeg(g: number): number {
  return g * (360 / GU_DU_ZHOUTIAN);
}
