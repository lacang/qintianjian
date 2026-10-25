/*
 * xuankong-core.js — 钦天监·阳宅 玄空飞星（下卦）核心引擎（零依赖、纯函数、纯本地、可离线）
 *
 * 算法蓝本（MIT 许可，@soul-atelier/xuankong@0.3.0 + @soul-atelier/core@0.6.1，已逐行通读重写；
 * 飞星结果与原包 24 坐山 × 9 运全量 216 盘逐一比对一致，测试见 xuankong_tests/test_xuankong.mjs）：
 *  - 三元九运：1864 年（甲子）起上元一运，每运 20 年，180 年一周：
 *      上元 一运1864-1883 / 二运1884-1903 / 三运1904-1923
 *      中元 四运1924-1943 / 五运1944-1963 / 六运1964-1983
 *      下元 七运1984-2003 / 八运2004-2023 / 九运2024-2043
 *    严格口径以「立春」换运（如 2024 年立春后方入九运）；本模块与蓝本一致按公历整年取运，
 *    运界年份 1~2 月（立春前）的宅可能差一运，由判定层 SOURCE_NOTE 提示，不做节气回推。
 *  - 二十四山：每山 15°，罗盘北 0° 顺时针（与八宅 vendor bazhai-core 同款分山）。
 *    天元山居卦宫正中（子山 352.5°~7.5°、午山 172.5°~187.5°……），地元山在宫逆时针侧、
 *    人元山在顺时针侧（与蓝本 palaces.mountains=[地,天,人] 一致）。山之阴阳：
 *    四正卦（坎离震兑）地元阳、天元阴、人元阴；四隅卦（乾坤艮巽）地元阴、天元阳、人元阳——
 *    即甲庚壬丙、乾坤艮巽、寅申巳亥为阳（顺飞），子午卯酉、乙辛丁癸、辰戌丑未为阴（逆飞）。
 *  - 下卦挨星（只做「下卦」；替卦/兼向未做，流派差异见判定层 SOURCE_NOTE）：
 *    ① 运盘（天盘）：当运之星入中宫，沿洛书轨迹顺飞九宫；
 *    ② 山盘（地卦，管人丁）：取「坐山所在宫的运盘星」入中；向盘（天卦，管财禄）：取「向首所在宫的运盘星」入中；
 *    ③ 顺逆：入中之星（非五）以其本宫卦下、与坐/向山同元之山的阴阳定向——阳顺飞、阴逆飞；
 *       入中为五（五黄无卦，寄于坐/向）则径用坐/向山本身的阴阳；
 *    ④ 洛书轨迹：宫之洛书数 L 距中宫步数 offset=(L-5) mod 9（0..8），顺飞星=入中星+offset、
 *       逆飞星=入中星−offset，得数按 1~9 循环。
 *  - 局型：山旺到坐+水旺到向=旺山旺向；山旺到向+水旺到坐=上山下水；山旺、水旺同到向=双星到向；
 *    同到坐=双星会坐（蓝本称「双星到坐」）。下卦数学上必属四局之一，「其他」仅作残盘兜底。
 *
 * 本文件只做确定性术数计算，不接 AI、不联网；判语与古籍出处一律在判定层 yangzhai-xuankong.js。
 */

/* 九宫：索引 0-8 = [西北,北,东北,西,中,东,西南,南,东南]（罗盘北向上、南在上 3×3 网格行优先），
   与 yangzhai-judge.js 的 CELL_KEY/CELL_DIR（bazhai DIRS9）完全一致。
   luoshu=元旦盘（地盘）数，中宫=5；kind: cardinal=四正卦 / corner=四隅卦（定二十四山阴阳）。 */
export const PALACES9 = [
  { key: 'qian',   name: '乾', dir: '西北', luoshu: 6, kind: 'corner',   angle: 315, mountains: ['戌', '乾', '亥'] },
  { key: 'kan',    name: '坎', dir: '北',   luoshu: 1, kind: 'cardinal', angle: 0,   mountains: ['壬', '子', '癸'] },
  { key: 'gen',    name: '艮', dir: '东北', luoshu: 8, kind: 'corner',   angle: 45,  mountains: ['丑', '艮', '寅'] },
  { key: 'dui',    name: '兑', dir: '西',   luoshu: 7, kind: 'cardinal', angle: 270, mountains: ['庚', '酉', '辛'] },
  { key: 'center', name: '中', dir: '中',   luoshu: 5, kind: null,       angle: null, mountains: [] },
  { key: 'zhen',   name: '震', dir: '东',   luoshu: 3, kind: 'cardinal', angle: 90,  mountains: ['甲', '卯', '乙'] },
  { key: 'kun',    name: '坤', dir: '西南', luoshu: 2, kind: 'corner',   angle: 225, mountains: ['未', '坤', '申'] },
  { key: 'li',     name: '离', dir: '南',   luoshu: 9, kind: 'cardinal', angle: 180, mountains: ['丙', '午', '丁'] },
  { key: 'xun',    name: '巽', dir: '东南', luoshu: 4, kind: 'corner',   angle: 135, mountains: ['辰', '巽', '巳'] },
];

/* 洛书对宫（和为 10）：坐向必居对宫 */
const OPPOSITE = { qian: 'xun', xun: 'qian', kan: 'li', li: 'kan', gen: 'kun', kun: 'gen', dui: 'zhen', zhen: 'dui', center: 'center' };
const PALACE_BY_KEY = new Map(PALACES9.map((p) => [p.key, p]));
const PALACE_BY_LUOSHU = new Map(PALACES9.map((p) => [p.luoshu, p]));

/* 二十四山阴阳（元龙分阴阳）：四正卦 [地元,天元,人元] = 阳阴阴；四隅卦 = 阴阳阳 */
const YIN_YANG = { cardinal: ['yang', 'yin', 'yin'], corner: ['yin', 'yang', 'yang'] };
export const YUAN_NAMES = ['地元', '天元', '人元'];

/* 二十四山表：山名 → { palaceKey, yuan(0地/1天/2人), yuanName, yinYang, centerDeg }
   地元山在卦宫逆时针 −15°，天元山居中，人元山 +15°（如坎宫：壬345°/子0°/癸15°） */
const MOUNTAIN_DEFS = new Map();
for (const p of PALACES9) {
  p.mountains.forEach((name, yuan) => {
    MOUNTAIN_DEFS.set(name, {
      name,
      palaceKey: p.key,
      yuan,
      yuanName: YUAN_NAMES[yuan],
      yinYang: YIN_YANG[p.kind][yuan],
      centerDeg: norm360(p.angle + (yuan - 1) * 15),
    });
  });
}
/* 按中心角 0°,15°,…,345° 排列的二十四山（子=0°，山界 352.5°~7.5°） */
export const MOUNTAINS_24 = [...MOUNTAIN_DEFS.values()].sort((a, b) => a.centerDeg - b.centerDeg).map((m) => m.name);

function norm360(deg) { return ((deg % 360) + 360) % 360; }
function wrap1to9(n) { return ((((n - 1) % 9) + 9) % 9) + 1; }
/* 宫之洛书数 L 距中宫（洛书 5）的洛书轨迹步数 0..8：中0→乾1→兑2→艮3→离4→坎5→坤6→震7→巽8 */
function offsetOf(luoshu) { return (((luoshu - 5) % 9) + 9) % 9; }

/** 入中星沿洛书轨迹飞泊九宫（forward=true 顺飞 / false 逆飞），返回 {宫key: 星数} */
function flyChart(center, forward) {
  const out = {};
  for (const p of PALACES9) {
    out[p.key] = wrap1to9(forward ? center + offsetOf(p.luoshu) : center - offsetOf(p.luoshu));
  }
  return out;
}

/* ============ 三元九运 ============ */

/** 公历年 → 运数 1-9（1864 起上元一运，20 年一运；立春换运的严格口径见文件头注释） */
export function periodOfYear(year) {
  if (!Number.isFinite(year)) throw new Error('无效年份: ' + year);
  const offset = Math.floor((year - 1864) / 20);
  return (((offset % 9) + 9) % 9) + 1;
}

/** 该运的公历起止年（含端点），如 2024 → [2024, 2043] */
export function periodYearRange(year) {
  const start = 1864 + Math.floor((year - 1864) / 20) * 20;
  return [start, start + 19];
}

/** 运数 → 上元/中元/下元（一至三运上元、四至六中元、七至九下元） */
export function yuanOfPeriod(period) {
  if (period >= 1 && period <= 3) return '上元';
  if (period >= 4 && period <= 6) return '中元';
  return '下元';
}

/* ============ 二十四山 ============ */

/** 角度（北 0° 顺时针）→ 山序号 0-23（子=0，山界 352.5°~7.5°；与 bazhai 同款 floor((deg+7.5)/15) 取整） */
export function mountainIndexAt(deg) {
  if (!Number.isFinite(deg)) throw new Error('无效角度: ' + deg);
  return Math.floor((norm360(deg) + 7.5) / 15) % 24;
}

/** 山名 → 山信息（palaceKey/yuan/yinYang/centerDeg） */
export function mountainDef(name) {
  const def = MOUNTAIN_DEFS.get(name);
  if (!def) throw new Error('未知的山: ' + name);
  return def;
}

/** 角度 → 所在山信息 */
export function mountainAt(deg) {
  return mountainDef(MOUNTAINS_24[mountainIndexAt(deg)]);
}

/** 角度 → { chao 朝山, zuo 坐山 }（坐山取对宫同元之山，故坐向必同元） */
export function mountainsAt(deg) {
  const chao = mountainAt(deg);
  const zuoPalace = PALACE_BY_KEY.get(OPPOSITE[chao.palaceKey]);
  return { chao, zuo: mountainDef(zuoPalace.mountains[chao.yuan]) };
}

/* ============ 下卦挨星 ============ */

/** 入中星的顺逆：非五 → 取其本宫卦下与来源山同元之山的阴阳；五（无卦寄于坐/向）→ 用来源山本身阴阳。阳=true 顺飞 */
function directionFor(centerStar, source) {
  const yinYang = centerStar === 5
    ? source.yinYang
    : mountainDef(PALACE_BY_LUOSHU.get(centerStar).mountains[source.yuan]).yinYang;
  return yinYang === 'yang';
}

function mountainInfo(def) {
  const palace = PALACE_BY_KEY.get(def.palaceKey);
  return {
    name: def.name,
    palaceKey: def.palaceKey,
    palaceName: palace.name,
    palaceDir: palace.dir,
    yuan: def.yuan,
    yuanName: def.yuanName,
    yinYang: def.yinYang,
    centerDeg: def.centerDeg,
  };
}

/**
 * 下卦飞星盘：向首角度 + 建造年份 → 完整玄空盘。
 * 返回 { year, period, periodRange, yuan, mountain(坐山名), facing(向名), label,
 *        sittingInfo/facingInfo, sittingKey/facingKey, flying, palaces[9], pattern, combinations }
 * palaces 索引 0-8 = [西北,北,东北,西,中,东,西南,南,东南]，每宫
 * { palace:宫位名, key, luoshu, earth(元旦盘数), base(运盘星), ms(山星), fs(向星) }。
 */
export function chartFor(facingDeg, buildYear) {
  const period = periodOfYear(buildYear);
  const { chao: facing, zuo: sitting } = mountainsAt(facingDeg);

  const periodChart = flyChart(period, true); // 运盘：当运星入中顺飞
  const mountainCenter = periodChart[sitting.palaceKey]; // 坐宫运星入中山盘
  const waterCenter = periodChart[facing.palaceKey]; // 向宫运星入中向盘
  const mountainForward = directionFor(mountainCenter, sitting);
  const waterForward = directionFor(waterCenter, facing);
  const mountainChart = flyChart(mountainCenter, mountainForward);
  const waterChart = flyChart(waterCenter, waterForward);

  const palaces = PALACES9.map((p) => ({
    palace: p.dir,
    key: p.key,
    luoshu: p.luoshu,
    earth: p.luoshu,
    base: periodChart[p.key],
    ms: mountainChart[p.key],
    fs: waterChart[p.key],
  }));

  const chart = {
    year: buildYear,
    period,
    periodRange: periodYearRange(buildYear),
    yuan: yuanOfPeriod(period),
    mountain: sitting.name,
    facing: facing.name,
    label: `${sitting.name}山${facing.name}向`,
    sittingInfo: mountainInfo(sitting),
    facingInfo: mountainInfo(facing),
    sittingKey: sitting.palaceKey,
    facingKey: facing.palaceKey,
    flying: { mountainCenter, waterCenter, mountainForward, waterForward },
    palaces,
  };
  chart.pattern = patternOf(chart);
  chart.combinations = combinationsOf(chart);
  return chart;
}

/* ============ 局型判定 ============ */

/** 局型：旺山旺向 / 上山下水 / 双星会坐 / 双星到向 / 其他（残盘兜底；下卦必属四局之一） */
export function patternOf(chart) {
  const byKey = new Map(chart.palaces.map((p) => [p.key, p]));
  const sit = byKey.get(chart.sittingKey);
  const face = byKey.get(chart.facingKey);
  if (!sit || !face) return '其他';
  const p = chart.period;
  const msSit = sit.ms === p, msFace = face.ms === p, wsSit = sit.fs === p, wsFace = face.fs === p;
  if (msSit && wsFace) return '旺山旺向';
  if (msFace && wsSit) return '上山下水';
  if (msFace && wsFace) return '双星到向';
  if (msSit && wsSit) return '双星会坐';
  return '其他';
}

/* ============ 全盘格局检测（照蓝本 detectCombinations 移植，palaces 用方位名） ============ */

const SANBAN_GROUPS = [[1, 4, 7], [2, 5, 8], [3, 6, 9]];
const TRUE_TRIAD = ['qian', 'zhen', 'li']; // 乾震离
const FALSE_TRIAD = ['kan', 'xun', 'dui']; // 坎巽兑

function isParentGroup(nums) {
  const sorted = [...nums].sort((a, b) => a - b);
  return SANBAN_GROUPS.some((g) => g[0] === sorted[0] && g[1] === sorted[1] && g[2] === sorted[2]);
}
function isConsecutive(nums) {
  const set = new Set(nums);
  if (set.size !== 3) return false;
  return [...set].some((s) => set.has(wrap1to9(s + 1)) && set.has(wrap1to9(s + 2)));
}

function detectSanban(palaces, byKey, out) {
  const triples = palaces.map((p) => [p.base, p.ms, p.fs]);
  if (triples.every(isParentGroup)) {
    out.push({ name: '父母三般卦', kind: 'auspicious', note: '全局九宫皆成 1-4-7 / 2-5-8 / 3-6-9，综合三元旺气，大吉。2-5-8 宫位防二黑五黄。' });
    return; // 父母三般与连珠互斥
  }
  if (triples.every(isConsecutive)) {
    const c = byKey.get('center');
    const star = c.fs === wrap1to9(c.base - 1)
      ? '向星连珠：运、山、向顺飞相连，主财富、名声、事业。'
      : c.ms === wrap1to9(c.base - 1)
        ? '山星连珠：运、山、向逆飞相连，主健康、人丁、家庭。'
        : '运、山、向三盘相连，凶位不凶，上山下水亦不忌。';
    out.push({ name: '连珠三般卦', kind: 'auspicious', note: star });
  }
}

function detectHeshi(palaces, out) {
  if (palaces.every((p) => p.ms + p.base === 10)) {
    out.push({ name: '山星合十', kind: 'auspicious', note: '全盘山星与运盘合十，主人丁，通关化煞；当旺或刚退运时有力。' });
  }
  if (palaces.every((p) => p.fs + p.base === 10)) {
    out.push({ name: '向星合十', kind: 'auspicious', note: '全盘向星与运盘合十，主财禄，通关化煞；当旺或刚退运时有力。' });
  }
}

function detectFanFuYin(palaces, out) {
  for (const [label, pick] of [['山星', (p) => p.ms], ['向星', (p) => p.fs]]) {
    const harm = label === '山星' ? '健康、人丁、家庭' : '财富、事业、名声';
    if (palaces.every((p) => pick(p) === p.earth)) {
      out.push({ name: `全盘伏吟（${label}）`, kind: 'inauspicious', note: `${label}与元旦盘全盘相同，主忧虑滞涩、顽疾，影响${harm}。` });
    } else if (palaces.every((p) => pick(p) + p.earth === 10)) {
      out.push({ name: `全盘反吟（${label}）`, kind: 'inauspicious', note: `${label}与元旦盘全盘合十，主突发灾祸、破败，影响${harm}。` });
    } else {
      const fu = palaces.filter((p) => pick(p) === p.earth);
      const fan = palaces.filter((p) => pick(p) + p.earth === 10);
      if (fu.length) out.push({ name: `单宫伏吟（${label}）`, kind: 'inauspicious', palaces: fu.map((p) => p.palace), note: `${label}与元旦盘相同；除非外有形煞引动，破坏不大。` });
      if (fan.length) out.push({ name: `单宫反吟（${label}）`, kind: 'inauspicious', palaces: fan.map((p) => p.palace), note: `${label}与元旦盘合十；除非外有形煞引动，破坏不大。` });
    }
  }
}

function detectRuQiu(period, byKey, out) {
  const c = byKey.get('center');
  if (c.ms === period) out.push({ name: '山星入囚', kind: 'inauspicious', note: '当运山星入中宫受囚，主人丁不旺、健康受损；中宫见光、动气可破囚。' });
  if (c.fs === period) out.push({ name: '向星入囚', kind: 'inauspicious', note: '当运向星入中宫受囚，主财源受阻、事业不顺；中宫见光、动气可破囚。' });
}

function detectDaJie(pattern, facingKey, byKey, palaces, out) {
  if (pattern !== '双星到向') return;
  const waterOf = (keys) => keys.map((k) => byKey.get(k).fs);
  const blocked = palaces.every((p) => p.ms === p.earth); // 山星5入中顺飞犯全盘伏吟，打劫不可用
  const blockNote = blocked ? '（山星5入中顺飞犯全盘伏吟，打劫不可用）' : '';
  if (TRUE_TRIAD.includes(facingKey) && isParentGroup(waterOf(TRUE_TRIAD))) {
    out.push({ name: '七星真打劫', kind: blocked ? 'inauspicious' : 'auspicious', palaces: TRUE_TRIAD.map((k) => byKey.get(k).palace), note: `双星到向，乾·震·离三宫向星连成 147/258/369，劫取未来旺气，力强。布水、开门、通气引动。${blockNote}` });
  } else if (FALSE_TRIAD.includes(facingKey) && isParentGroup(waterOf(FALSE_TRIAD))) {
    out.push({ name: '七星假打劫', kind: blocked ? 'inauspicious' : 'auspicious', palaces: FALSE_TRIAD.map((k) => byKey.get(k).palace), note: `双星到向，坎·巽·兑三宫向星连成 147/258/369；力不及真打劫，仍可引动旺气。${blockNote}` });
  }
}

/** 全盘格局：三般卦 / 合十 / 伏吟反吟 / 入囚 / 七星打劫（palaces 字段为方位名列表） */
export function combinationsOf(chart) {
  const palaces = chart.palaces;
  const byKey = new Map(palaces.map((p) => [p.key, p]));
  const out = [];
  detectSanban(palaces, byKey, out);
  detectHeshi(palaces, out);
  detectFanFuYin(palaces, out);
  detectRuQiu(chart.period, byKey, out);
  detectDaJie(chart.pattern, chart.facingKey, byKey, palaces, out);
  return out;
}

/* ============ 旺衰 ============ */

/** 星数相对当运的旺衰：《紫白诀·上篇》「紫白飞宫，辨生旺退煞之用，三元分运，判盛衰兴废之时」。
    当运=旺；未来一、二运=生（近旺/远旺之进气）；刚过一运=退（由盛转衰）；其余=死（衰败之气）。 */
export function starLuckOf(star, period) {
  const diff = (((star - period) % 9) + 9) % 9;
  if (diff === 0) return '旺';
  if (diff === 1 || diff === 2) return '生';
  if (diff === 8) return '退';
  return '死';
}
