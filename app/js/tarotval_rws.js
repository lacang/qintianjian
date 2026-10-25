// 韦特 RWS 78 张 · 传统倾向表（钦天监）
// 作用：典籍库"这一牌阵的综合倾向"机械合参用。RWS 数据本身只给中性牌义、不标吉凶，
//      这里按塔罗读牌的长期惯例给每张一个基础倾向（+2 很吉 / +1 偏吉 / 0 中性 / -1 偏滞），
//      依据＝大阿尔卡纳传统意象＋四元素花色基调（权杖火主行动、杯水文情感、宝剑风主思虑阻滞、
//      星币土主物质务实）与点数的通行读法；逆位作"能量受阻/过度/内化"处理，普遍减分。
// 声明：这是为机械合参而编码的中性惯例值，不是某本古籍对每张牌的固定判决，更非命定；
//      只用于给倾向，牌义仍以画面(scene)与 Waite 1910 原著判词(classicText)为准。取舍由人。

export const RWS_VAL = {
  // 大阿尔卡纳
  'major-00-fool': 0, 'major-01-magician': 1, 'major-02-priestess': 0, 'major-03-empress': 1,
  'major-04-emperor': 1, 'major-05-hierophant': 1, 'major-06-lovers': 1, 'major-07-chariot': 1,
  'major-08-strength': 1, 'major-09-hermit': 0, 'major-10-wheel': 1, 'major-11-justice': 1,
  'major-12-hanged': 0, 'major-13-death': 0, 'major-14-temperance': 1, 'major-15-devil': -1,
  'major-16-tower': -1, 'major-17-star': 1, 'major-18-moon': -1, 'major-19-sun': 2,
  'major-20-judgement': 1, 'major-21-world': 2,
  // 权杖（火）
  'wands-ace': 1, 'wands-02': 0, 'wands-03': 1, 'wands-04': 1, 'wands-05': -1,
  'wands-06': 1, 'wands-07': 0, 'wands-08': 1, 'wands-09': -1, 'wands-10': -1,
  'wands-page': 0, 'wands-knight': 0, 'wands-queen': 1, 'wands-king': 1,
  // 圣杯（水）
  'cups-ace': 1, 'cups-02': 1, 'cups-03': 1, 'cups-04': 0, 'cups-05': -1,
  'cups-06': 1, 'cups-07': 0, 'cups-08': 0, 'cups-09': 1, 'cups-10': 1,
  'cups-page': 0, 'cups-knight': 0, 'cups-queen': 1, 'cups-king': 1,
  // 宝剑（风，多主思虑与阻滞）
  'swords-ace': 0, 'swords-02': 0, 'swords-03': -1, 'swords-04': 0, 'swords-05': -1,
  'swords-06': 0, 'swords-07': -1, 'swords-08': -1, 'swords-09': -1, 'swords-10': -1,
  'swords-page': 0, 'swords-knight': 0, 'swords-queen': 0, 'swords-king': 0,
  // 星币（土）
  'pentacles-ace': 1, 'pentacles-02': 0, 'pentacles-03': 1, 'pentacles-04': 0, 'pentacles-05': -1,
  'pentacles-06': 1, 'pentacles-07': 0, 'pentacles-08': 1, 'pentacles-09': 1, 'pentacles-10': 1,
  'pentacles-page': 1, 'pentacles-knight': 0, 'pentacles-queen': 1, 'pentacles-king': 1
};

// 逆位：能量受阻/过度/内化——正向牌减分、负向牌减苦（转向恢复期）、中性牌轻微受阻
export function rwsVal(id, reversed) {
  const v = Object.prototype.hasOwnProperty.call(RWS_VAL, id) ? RWS_VAL[id] : 0;
  if (!reversed) return v;
  if (v > 0) return +(v * 0.4 - 0.25).toFixed(2);
  if (v < 0) return +(v * 0.4 + 0.25).toFixed(2);
  return -0.15;
}
