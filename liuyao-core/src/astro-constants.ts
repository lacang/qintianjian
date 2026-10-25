/**
 * 西方古典占星 —— 中英映射与常量
 *
 * 内部一律以 caelus/astronomy-engine 的英文 id 计算，此处仅做展示层中文映射。
 * 七政（日月五星）为古典核心；三王（天王/海王/冥王）与北交点作为扩展点一并展示。
 */

export type PlanetId =
  | 'sun' | 'moon' | 'mercury' | 'venus' | 'mars'
  | 'jupiter' | 'saturn' | 'uranus' | 'neptune' | 'pluto' | 'mean_node';

/** 本命盘/行运盘输出的星体顺序：七政在前，三王、北交在后 */
export const PLANET_ORDER: PlanetId[] = [
  'sun', 'moon', 'mercury', 'venus', 'mars', 'jupiter', 'saturn',
  'uranus', 'neptune', 'pluto', 'mean_node',
];

/** 七政（用于五尊贵/sect 等古典判定，外行星与交点不参与） */
export const SEVEN: PlanetId[] = [
  'sun', 'moon', 'mercury', 'venus', 'mars', 'jupiter', 'saturn',
];

export const PLANET_ZH: Record<PlanetId, string> = {
  sun: '太阳',
  moon: '月亮',
  mercury: '水星',
  venus: '金星',
  mars: '火星',
  jupiter: '木星',
  saturn: '土星',
  uranus: '天王星',
  neptune: '海王星',
  pluto: '冥王星',
  mean_node: '北交点',
};

/** 0..11 = 白羊..双鱼 */
export const SIGN_ZH = [
  '白羊', '金牛', '双子', '巨蟹', '狮子', '处女',
  '天秤', '天蝎', '射手', '摩羯', '水瓶', '双鱼',
] as const;

export const SIGN_EN = [
  'Aries', 'Taurus', 'Gemini', 'Cancer', 'Leo', 'Virgo',
  'Libra', 'Scorpio', 'Sagittarius', 'Capricorn', 'Aquarius', 'Pisces',
] as const;

/** dignityScore 字段 → 中文 */
export const DIGNITY_ZH = {
  rulership: '庙',
  exaltation: '旺',
  triplicity: '三分',
  term: '界',
  face: '面',
  detriment: '陷',
  fall: '落',
  peregrine: '游民',
} as const;

/**
 * 按日月黄经差（0..360）命名月相（报告 §6 坑7：caelus 月相标签有枚举瑕疵，
 * 故此处按角距自行命名，时刻用 auseklis 的 nextQuarters）。
 */
export function moonPhaseName(angle: number): string {
  const a = ((angle % 360) + 360) % 360;
  if (a < 22.5 || a >= 337.5) return '新月';
  if (a < 67.5) return '蛾眉月';
  if (a < 112.5) return '上弦月';
  if (a < 157.5) return '盈凸月';
  if (a < 202.5) return '满月';
  if (a < 247.5) return '亏凸月';
  if (a < 292.5) return '下弦月';
  return '残月';
}

/** auseklis quarter 英文标签 → 中文 */
export const QUARTER_ZH: Record<string, string> = {
  'New Moon': '新月',
  'First Quarter': '上弦',
  'Full Moon': '满月',
  'Last Quarter': '下弦',
};
