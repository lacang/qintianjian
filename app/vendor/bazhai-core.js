/*
 * bazhai-core.js — 钦天监·阳宅 八宅核心引擎（零依赖、纯本地、可离线）
 *
 * 算法依据（MIT 许可，@soul-atelier/core@0.6.1 + @soul-atelier/bazhai@0.2.1，
 *  已逐表核对，翻卦结果与《八宅明镜》大游年歌「乾六天五祸绝延生…」一致）：
 *  - 命卦：出生公历年数字根 s，男 11−s、女 4+s（再归 1–9）；得 5 中宫无卦，
 *    男寄坤(2)、女寄艮(8)。东四命＝坎1 震3 巽4 离9，其余西四命。
 *    （立春前出生本应归上一年，本产品只取出生整年，UI 已就此提示，不做节气回推。）
 *  - 宅卦：取坐山所在宫的洛书卦。
 *  - 大游年翻卦：以宅卦（或命卦）三爻与目标方位卦三爻做异或(XOR)得变爻掩码，
 *    bit0=初爻…bit2=上爻，掩码 0..7 对应 伏位/祸害/绝命/天医/生气/六煞/五鬼/延年。
 *
 * 仅做历法/术数层面的确定性计算，不接 AI、不联网。
 */

/* 后天八卦八宫：key / 卦名 / 方位 / 洛书数 / 角度(北0顺时针) / grid(row,col 南在上) */
export const PALACES = [
  { key: 'xun',  name: '巽', dir: '东南', luoshu: 4, angle: 135, row: 0, col: 0, mountains: ['辰', '巽', '巳'] },
  { key: 'li',   name: '离', dir: '南',   luoshu: 9, angle: 180, row: 0, col: 1, mountains: ['丙', '午', '丁'] },
  { key: 'kun',  name: '坤', dir: '西南', luoshu: 2, angle: 225, row: 0, col: 2, mountains: ['未', '坤', '申'] },
  { key: 'zhen', name: '震', dir: '东',   luoshu: 3, angle: 90,  row: 1, col: 0, mountains: ['甲', '卯', '乙'] },
  { key: 'dui',  name: '兑', dir: '西',   luoshu: 7, angle: 270, row: 1, col: 2, mountains: ['庚', '酉', '辛'] },
  { key: 'gen',  name: '艮', dir: '东北', luoshu: 8, angle: 45,  row: 2, col: 0, mountains: ['丑', '艮', '寅'] },
  { key: 'kan',  name: '坎', dir: '北',   luoshu: 1, angle: 0,   row: 2, col: 1, mountains: ['壬', '子', '癸'] },
  { key: 'qian', name: '乾', dir: '西北', luoshu: 6, angle: 315, row: 2, col: 2, mountains: ['戌', '乾', '亥'] },
];

/* 八卦三爻（底→顶，1阳0阴） */
export const TRIGRAM_LINES = {
  qian: [1, 1, 1], dui: [1, 1, 0], li: [1, 0, 1], zhen: [1, 0, 0],
  xun: [0, 1, 1], kan: [0, 1, 0], gen: [0, 0, 1], kun: [0, 0, 0],
};

/* XOR 变爻掩码 → 游年八星 */
export const STARS = [
  { key: 'fuwei',   name: '伏位', star: '左辅', elem: '木', good: true,  grade: '小吉', rank: 4, effect: '安稳守成、宜静不宜动' },
  { key: 'huohai',  name: '祸害', star: '禄存', elem: '土', good: false, grade: '小凶', rank: 5, effect: '是非耗损、小病小灾' },
  { key: 'jueming', name: '绝命', star: '破军', elem: '金', good: false, grade: '大凶', rank: 8, effect: '破财损丁、最忌主卧大门' },
  { key: 'tianyi',  name: '天医', star: '巨门', elem: '土', good: true,  grade: '次吉', rank: 2, effect: '利健康、贵人、养病' },
  { key: 'shengqi', name: '生气', star: '贪狼', elem: '木', good: true,  grade: '大吉', rank: 1, effect: '旺财旺丁、活力人缘' },
  { key: 'liusha',  name: '六煞', star: '文曲', elem: '水', good: false, grade: '次凶', rank: 6, effect: '口舌桃花、心烦不安' },
  { key: 'wugui',   name: '五鬼', star: '廉贞', elem: '火', good: false, grade: '大凶', rank: 7, effect: '官非火灾、意外虚惊' },
  { key: 'yannian', name: '延年', star: '武曲', elem: '金', good: true,  grade: '中吉', rank: 3, effect: '和睦长寿、利婚姻感情' },
];

const EAST = new Set([1, 3, 4, 9]);
const PALACE_BY_KEY = new Map(PALACES.map((p) => [p.key, p]));
const PALACE_BY_LUOSHU = new Map(PALACES.map((p) => [p.luoshu, p]));
export const MOUNTAIN_PALACE = new Map();
for (const p of PALACES) p.mountains.forEach((m) => MOUNTAIN_PALACE.set(m, p.key));
export const MOUNTAINS_24 = ['子', '癸', '丑', '艮', '寅', '甲', '卯', '乙', '辰', '巽', '巳',
  '丙', '午', '丁', '未', '坤', '申', '庚', '酉', '辛', '戌', '乾', '亥', '壬'];

function digitalRoot(n) { return ((n - 1) % 9) + 1; }
function linesMask(key) { const l = TRIGRAM_LINES[key]; return l[0] | (l[1] << 1) | (l[2] << 2); }

function guaOf(key) {
  const p = PALACE_BY_KEY.get(key);
  return { key, name: p.name, luoshu: p.luoshu, dir: p.dir, group: EAST.has(p.luoshu) ? 'east' : 'west' };
}

/** 命卦：公历年 + 性别('male'|'female') */
export function lifeGua(year, gender) {
  if (!Number.isInteger(year) || year < 1) throw new Error('无效出生年份: ' + year);
  const s = digitalRoot(year);
  let raw = gender === 'male' ? digitalRoot(11 - s) : digitalRoot(4 + s);
  if (raw === 5) raw = gender === 'male' ? 2 : 8; // 中宫无卦：男寄坤、女寄艮
  return guaOf(PALACE_BY_LUOSHU.get(raw).key);
}

/** 坐山(24山名) → 宅卦 */
export function houseGuaByMountain(mountain) {
  const key = MOUNTAIN_PALACE.get(mountain);
  if (!key) throw new Error('未知山名: ' + mountain);
  return guaOf(key);
}

/** 角度(0北顺时针) → 朝向所在24山索引 */
export function mountainIndexAt(deg) {
  const d = ((deg % 360) + 360) % 360;
  return Math.floor((d + 7.5) / 15) % 24;
}
/** 角度 → {chaoMountain 朝山, zuoMountain 坐山(对宫)} */
export function mountainsAt(deg) {
  const ci = mountainIndexAt(deg);
  return { chao: MOUNTAINS_24[ci], zuo: MOUNTAINS_24[(ci + 12) % 24] };
}
/** 8 方位名（按45°）：0北 */
const DIR8 = ['北', '东北', '东', '东南', '南', '西南', '西', '西北'];
export function dir8At(deg) { return DIR8[Math.round((((deg % 360) + 360) % 360) / 45) % 8]; }
export const DIR8_LIST = DIR8;

/** 宫 key → 该方位上的游年星（相对卦 baseKey） */
export function wanderingStar(baseKey, targetKey) {
  return STARS[linesMask(baseKey) ^ linesMask(targetKey)];
}

/** 某卦（命/宅）的八方位游年盘：[{key,name,dir,angle,row,col,star}] */
export function chartFor(baseKey) {
  return PALACES.map((p) => ({ ...p, star: wanderingStar(baseKey, p.key) }));
}

/** 东四/西四 组名 */
export const GROUP_NAME = { east: '东四', west: '西四' };

/* 大游年歌（坐山/伏位卦 → 顺时针六乾五艮…顺序），用于 UI 旁证，不参与计算 */
export const DAYOU_NIAN_GE = {
  qian: '乾六天五祸绝延生', kan: '坎五天生延绝祸六', gen: '艮六绝祸生延天五', zhen: '震延生祸绝五天六',
  xun: '巽天五六祸生绝延', li: '离六五绝延祸生天', kun: '坤天延绝生祸五六', dui: '兑生祸延绝六五天',
};
