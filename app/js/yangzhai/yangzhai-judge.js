/*
 * yangzhai-judge.js — 八宅实用直断（结论层）
 * 输入来自 yangzhaiview 的四步入驻，输出"这房子怎么断、怎么调"，每条挂典籍。
 * 计算层全部走 vendor/bazhai-core.js（确定性古法，不接 AI）。
 * 流派：本模块采用《八宅明镜》《阳宅三要》"坐山起游年、门主灶配吉凶、东四西四命"
 *      一系；另一派"门起伏位"的差异在 SOURCE_NOTE 中并列说明，不黑箱合成。
 */
import {
  PALACES, lifeGua, houseGuaByMountain, mountainsAt, dir8At,
  chartFor, GROUP_NAME,
} from '../../vendor/bazhai-core.js?v=124';

/* 九宫格 index（罗盘固定、北向上）→ 宫 key；4=中宫无卦 */
const CELL_KEY = ['qian', 'kan', 'gen', 'dui', null, 'zhen', 'kun', 'li', 'xun'];
const CELL_DIR = ['西北', '北', '东北', '西', '中', '东', '西南', '南', '东南'];
const ROOM_LABEL = { door: '大门', master: '主卧', second: '次卧', living: '客厅', kitchen: '厨房(灶)', bath: '卫生间' };

/* 典籍依据（弹层/折叠引用） */
export const SOURCES = {
  younian: { t: '《八宅明镜》', q: '大游年翻卦，以坐山为本，分生气、延年、天医、伏位四吉，绝命、五鬼、六煞、祸害四凶。' },
  sanYao: { t: '《阳宅三要》', q: '阳宅孰为大？门、主、灶是也。门主灶三者各得其所，又须两两相生、阴阳配合，斯为大吉。' },
  siMing: { t: '《八宅明镜·东西四命》', q: '人命亦有东四西四之殊，宅有东四西四之别；命宅相宜则吉，相违则否。' },
  zao: { t: '《阳宅三要·灶座》', q: '灶宜坐凶向吉，以火压凶方，而灶口（司命出入）宜向吉方。' },
  zhonggong: { t: '传统阳宅通说', q: '中宫为立极之所，宜静、宜净；厨卫厕污居中，多主不安。' },
  xingshi: { t: '《阳宅十书》', q: '阳宅来龙、形势、门向各有宜忌；门前忌冲射、尖角、反弓，喜开阔、有靠。' },
};
export const SOURCE_NOTE =
  '本页采用「坐山起大游年、门主灶配吉凶、东四西四命」一系（《八宅明镜》《阳宅三要》）。' +
  '另有一派以「大门」起伏位布游年（《阳宅爱众篇》部分注本），同一坐向在两门派下个别宫位吉凶会不同，' +
  '此处不下唯一结论，门向与坐山分歧大时两套都可参考。玄空飞星（三元九运）属另一体系，本版未接入。';

/* 游年星的白话"宜/忌 + 怎么用" */
const STAR_ADVICE = {
  shengqi: { use: '宜开门、安主卧、设书房/主要活动区，最旺财气与活力', avoid: '不宜作卫生间、杂物堆压' },
  yannian: { use: '宜安主卧、婚房，利夫妻感情、健康长寿', avoid: '不宜被厕所、厨房火口直冲' },
  tianyi:  { use: '宜安床、养病、老人房，利健康与贵人', avoid: '忌污秽、缺角' },
  fuwei:   { use: '宜静，可作卧室/书房，平稳守成', avoid: '忌频繁动火、堆放杂乱' },
  huohai:  { use: '可作储物、过道等次要用途', avoid: '不宜安主卧、大门，主口舌小病小耗' },
  liusha:  { use: '宜作卫浴、储物等"压"在次位', avoid: '不宜安主卧、大门，主心烦、是非、桃花纠纷' },
  wugui:   { use: '宜以厨房火口、卫浴或重物"压煞"', avoid: '最忌安主卧、大门、常开火乱动，主官非意外虚惊' },
  jueming: { use: '宜以厨房灶座、卫生间或储物"压煞"，保持安静少动', avoid: '最忌大门、主卧在此，主破财损丁，务必避开' },
};

const RANK_OF = {}; PALACES.forEach(() => {});
function starAt(chart, key) { return chart.find((p) => p.key === key).star; }

/* 一组宫位（房间可能跨多宫）→ 汇总 */
function roomSummary(chart, cells) {
  const parts = cells
    .filter((ix) => ix !== 4 && CELL_KEY[ix])
    .map((ix) => ({ ix, dir: CELL_DIR[ix], star: starAt(chart, CELL_KEY[ix]) }));
  if (!parts.length) return null;
  // 跨宫：以最差星为主判，另标是否含吉
  const worst = parts.reduce((a, b) => (b.star.rank > a.star.rank ? b : a));
  const best = parts.reduce((a, b) => (b.star.rank < a.star.rank ? b : a));
  const hasJi = parts.some((p) => p.star.good);
  const hasXiong = parts.some((p) => !p.star.good);
  let level;
  if (parts.every((p) => p.star.good)) level = 'good';
  else if (parts.every((p) => !p.star.good)) level = 'bad';
  else level = 'mixed';
  return { parts, worst, best, hasJi, hasXiong, level };
}

function levelOf(parts) {
  if (!parts) return null;
  return parts.level;
}

/* 主入口：根据入驻状态产出完整直断对象 */
export function judgeYangzhai(st) {
  const deg = st.mount.deg;
  const { chao, zuo } = mountainsAt(deg);
  const chaoDir = dir8At(deg);
  const zuoDir = dir8At((deg + 180) % 360);
  const house = houseGuaByMountain(zuo);           // 宅卦（坐山）
  const chart = chartFor(house.key);               // 坐山游年盘
  const out = {
    mount: { deg: Math.round(deg), chao, zuo, chaoDir, zuoDir, house, via: st.mount.via },
    person: null, zhaiMing: null,
    rooms: {}, door: null, master: null, kitchen: null,
    issues: [], highlights: [],
    bathCenter: st.rooms.bath.includes(4),
    kitchenCenter: st.rooms.kitchen.includes(4),
    shapes: (st.shapes || []).slice(),
    builtYear: st.year && st.year.built,
  };

  /* 居住者命卦 + 宅命相配 */
  if (st.person && st.person.y && st.person.g) {
    const life = lifeGua(st.person.y, st.person.g === 'm' ? 'male' : 'female');
    out.person = life;
    out.zhaiMing = {
      match: life.group === house.group,
      lifeGroup: life.group, houseGroup: house.group,
    };
  }

  /* 门、主、灶 */
  out.door = roomSummary(chart, st.rooms.door);
  out.master = roomSummary(chart, st.rooms.master);
  out.kitchen = roomSummary(chart, st.rooms.kitchen);
  out.rooms.second = roomSummary(chart, st.rooms.second);
  out.rooms.living = roomSummary(chart, st.rooms.living);

  buildDoorVerdict(out);
  buildMasterVerdict(out);
  buildKitchenVerdict(out);
  buildZhaiMingVerdict(out);
  buildStructureVerdict(out, chart);
  buildShapeVerdict(out);

  /* 总评（最差主结论优先） */
  out.score = scoreHouse(out);
  return out;
}

function starsText(sum) {
  return sum ? sum.parts.map((p) => `${p.dir}·${p.star.name}`).join('、') : '';
}

function buildDoorVerdict(out) {
  const d = out.door;
  if (!d) { out.doorVerdict = null; return; }
  const w = d.worst.star;
  if (d.level === 'good') {
    out.doorVerdict = { tone: 'good', title: `大门开在${starsText(d)}，纳吉气`,
      body: `大门落在${d.parts.map((p) => p.star.name).join('、')}吉方，是这套房的加分项，保持门口明亮、整洁、通畅即可。`,
      advice: '门口勿堆杂物、勿正对镜/电梯，让吉气顺畅进宅。', src: SOURCES.younian };
  } else {
    const big = d.parts.find((p) => ['jueming', 'wugui'].includes(p.star.key));
    out.doorVerdict = {
      tone: big ? 'bad' : 'warn',
      title: `大门在${starsText(d)}${big ? '（' + big.star.name + '，重点处理）' : '（吉凶相杂/偏凶）'}`,
      body: big
        ? `大门落在${big.dir}${big.star.name}（${big.star.grade}）方，传统认为纳的是衰气，${big.star.effect}。这是本宅最值得优先处理的一处。`
        : `大门所跨宫位吉凶不一，整体偏耗：${w.effect}。`,
      advice: doorFix(d, big),
      src: SOURCES.younian,
    };
  }
}
function doorFix(d, big) {
  // 找游年盘上的吉方（生气/延年/天医）作为改门/引水引气建议
  return '若条件允许，可在装修时把门的中轴线偏向最近的吉方（见下方「四吉方位」）；不能改门时，在进门处设玄关/屏风转气、保持明亮，门外可铺一块与吉方同色系地垫，并让门常关、纳气缓和。';
}

function buildMasterVerdict(out) {
  const m = out.master;
  if (!m) { out.masterVerdict = null; return; }
  if (m.level === 'good') {
    const best = m.best.star;
    out.masterVerdict = { tone: 'good', title: `主卧在${starsText(m)}（${best.name}），安床得位`,
      body: `主卧落在吉方，${best.effect}。床头靠实墙、避开房门与卫生间门直冲即可。`,
      advice: STAR_ADVICE[best.key].use, src: SOURCES.younian };
  } else {
    const w = m.worst;
    out.masterVerdict = { tone: w.star.key === 'jueming' || w.star.key === 'wugui' ? 'bad' : 'warn',
      title: `主卧在${starsText(m)}（最差 ${w.star.name}）`,
      body: `主卧主要落在${w.dir}${w.star.name}方，${w.star.effect}。卧室是每天停留最久之处，传统阳宅对卧室方位最看重。`,
      advice: masterFix(out, w), src: SOURCES.younian };
  }
}
function masterFix(out, w) {
  // 优先建议换到吉方卧室；若有次卧/客厅在吉方可换
  const cand = [];
  if (out.rooms.second && out.rooms.second.level === 'good') cand.push('现有次卧正落在吉方，可考虑主次卧对调');
  if (out.rooms.living && out.rooms.living.level === 'good') cand.push('客厅所在为吉方，条件允许可把睡眠区往吉方挪');
  const ji = jiDirsText(out);
  return (cand.length ? cand[0] + '；' : '') +
    `暂不能换房时，把床头朝向/靠实墙一侧对准宅内吉方（${ji}），并在${w.star.name}方位减少镜子、电器、红色与尖锐摆设，保持安静整洁，以此缓解。`;
}

function buildKitchenVerdict(out) {
  const k = out.kitchen;
  if (!k) { out.kitchenVerdict = null; return; }
  // 灶：传统"坐凶向吉"——灶座（炉灶本体/人炒菜时背后所靠）压凶方为得位，灶口（火门/人面向）朝吉
  const onXiong = k.parts.some((p) => !p.star.good);
  const onJi = k.parts.some((p) => p.star.good);
  let tone, title, body, advice;
  if (onXiong) {
    tone = 'good';
    title = `厨房在${starsText(k)}，灶可"坐凶压煞"，得位`;
    body = '《阳宅三要》以灶宜坐凶向吉：炉灶压在凶方（火克其气）反为得用。只要让炒菜时人面向、灶口朝向吉方即可。';
    advice = `把灶口/操作时面向调到吉方（${jiDirsText(out)}），背后靠凶方实墙；水火（水槽与灶）不要紧邻相对。`;
  } else {
    tone = 'warn';
    title = `厨房在${starsText(k)}（吉方），与"灶压凶"一说相反`;
    body = '这处方位本是吉方，按"灶宜坐凶向吉"的说法，把炉灶压在吉方会"烧吉气"；但门/主卧用吉方、灶另安置才理想，若无法挪动也不必紧张。';
    advice = '优先保证大门、主卧占据更强的生气/延年方；厨房在此则让灶口朝向凶方之外的吉方、常保持清洁、用浅色与通风化解火气，流派不同不必强求。';
  }
  out.kitchenVerdict = { tone, title, body, advice, src: SOURCES.zao };
  // 若厨房既在凶又被门/主需要，记一条权衡
  if (onXiong && onJi) out.kitchenVerdict.body += '（厨房跨吉凶两宫，灶座压在凶宫一侧即可。）';
}

function buildZhaiMingVerdict(out) {
  if (!out.zhaiMing) { out.zhaiMingVerdict = null; return; }
  const { match } = out.zhaiMing;
  const life = out.person, house = out.mount.house;
  if (match) {
    out.zhaiMingVerdict = { tone: 'good', title: `宅命相配：你是${GROUP_NAME[life.group]}命，房是${GROUP_NAME[house.group]}宅`,
      body: `你的命卦「${life.name}」与宅卦「${house.name}」同属${GROUP_NAME[life.group]}，命宅同气，住起来顺、易安顿，这是选房时最基本也最重要的一条相合。`,
      advice: '按本宅四吉方安排主卧与大门即可，命宅已合，不必大动。', src: SOURCES.siMing };
  } else {
    out.zhaiMingVerdict = { tone: 'warn', title: `命宅不同组：你${GROUP_NAME[life.group]}命，房${GROUP_NAME[house.group]}宅`,
      body: `你的命卦「${life.name}」属${GROUP_NAME[life.group]}，而此宅坐「${house.name}」属${GROUP_NAME[house.group]}，命宅不同组。传统认为此类房更需要靠"门、主卧落在你本人的吉方"来调和。`,
      advice: `命宅不同组时，以你的命卦游年盘为准安排床位与常用房（可在结果中以命卦查看四吉方），让主卧靠你本命的生气/延年/天医方；租房影响较轻，自有长住房更讲究。`,
      src: SOURCES.siMing };
  }
}

function buildStructureVerdict(out, chart) {
  if (out.bathCenter) {
    out.issues.push({ tone: 'warn', title: '卫生间落在正中宫',
      body: '中宫是全屋立极中心，传统认为宜静宜净；卫生间在正中央，秽气居中、不利整体。',
      advice: '保持该卫生间强排风、常关门、马桶盖常合；可用浅色/明黄灯光与干净地垫提气，中宫勿堆杂物。', src: SOURCES.zhonggong });
  }
  if (out.kitchenCenter) {
    out.issues.push({ tone: 'warn', title: '厨房/灶在正中宫',
      body: '中宫属土，厨房属火，火居中宫传统称"火烧心"，多主家宅不宁、心脑血管方面的联想。',
      advice: '灶台不要紧靠中宫中心、保持油烟强排；中宫位置用土黄/米色（土色）泄火，少用大红，保持通透。', src: SOURCES.zhonggong });
  }
}

const SHAPE_RULES = {
  '路冲': { tone: 'bad', body: '大路/长巷直冲大门，传统称"枪煞"，主气流直冲不聚。', advice: '进门设玄关、屏风或高大绿植缓冲，门内铺厚地垫、门常关；门外可置"泰山石"类稳重物（心理与遮挡作用）。' },
  '反弓': { tone: 'warn', body: '道路或河流弯弓外侧对房，传统认为气反向外、不聚。', advice: '受冲一侧多种常绿植物、设围栏或水景向内环抱；窗帘常合以减其势。' },
  '尖角壁刀': { tone: 'warn', body: '邻楼墙角、楼缝正对门窗，传统称"尖角煞/壁刀"。', advice: '正对处挂厚帘、置圆叶植物或凸面镜把冲势化散（属传统说法，实质是遮挡视线与心理缓冲）。' },
  '缺角': { tone: 'warn', body: '户型某方位明显缺失，传统以该方位所对应的家庭成员/事项偏弱。', advice: '缺角一侧用灯光、镜子（向外延伸感）或高柜补齐视觉，无需大拆改。' },
  '临近水体': { tone: 'neutral', body: '水在风水里主财，但吉凶要看在何方位、水清浊与动静，单凭"近水"不断吉凶。', advice: '喜水在宅之生气、旺财方且水清缓；水浊、急、臭反为不利，可结合下方四吉方判断。' },
  '电梯楼梯冲门': { tone: 'warn', body: '电梯门/楼梯口正对大门，传统认为开合带动气流直冲、隐私也弱。', advice: '设玄关或门帘遮挡，门内放绿植，进门不要一眼望穿全屋与阳台。' },
  '电杆大树正对': { tone: 'warn', body: '门前孤立高耸物正对，传统称"穿心/顶心"，也实际影响采光与出入。', advice: '门上方挂山海镇/凸面镜一类传统化煞物，或用门廊、绿植在视觉上错开。' },
  '背后有靠': { tone: 'good', body: '屋后有更高建筑或山体为靠，传统称"有靠山"，主稳固。', advice: '这是有利形势，保持屋后不被强行开凿/冲射即可。' },
  '明堂开阔': { tone: 'good', body: '门前开阔无压迫，传统称"明堂开阔"，主气局舒展、利前程。', advice: '保持门前整洁通畅，勿乱搭建遮挡。' },
};
function buildShapeVerdict(out) {
  out.shapeVerdicts = out.shapes.map((name) => {
    const r = SHAPE_RULES[name];
    if (!r) return null;
    return { name, ...r, src: SOURCES.xingshi };
  }).filter(Boolean);
}

function jiDirsText(out) {
  // 坐山游年盘上四吉方位
  const ji = ['shengqi', 'yannian', 'tianyi', 'fuwei'].map((k) => {
    const p = fullChartSafe(out, k);
    return p ? `${p.dir}${p.star.name.replace('生气', '生气').replace('天医', '天医')}` : '';
  }).filter(Boolean);
  return ji.join('、');
}
function fullChartSafe(out, starKey) {
  // 用宅卦重算（chart 未直接挂在 out，这里用 mount.house.key）
  const c = chartFor(out.mount.house.key);
  return c.find((p) => p.star.key === starKey);
}

/* 四吉/四凶方位清单（结果页"四吉方位"卡用） */
export function fourJiDirs(out) {
  const c = chartFor(out.mount.house.key);
  return {
    ji: ['shengqi', 'yannian', 'tianyi', 'fuwei'].map((k) => c.find((p) => p.star.key === k)),
    xiong: ['jueming', 'wugui', 'liusha', 'huohai'].map((k) => c.find((p) => p.star.key === k)),
  };
}

function scoreHouse(out) {
  let score = 70; const tags = [];
  if (out.zhaiMing) { if (out.zhaiMing.match) { score += 8; tags.push('命宅相合'); } else { score -= 8; tags.push('命宅不同组'); } }
  const addRoom = (v, wGood, wBad) => {
    if (!v) return;
    if (v.level === 'good') score += wGood;
    else if (v.level === 'bad') score -= wBad;
    else score -= Math.round(wBad / 2);
  };
  addRoom(out.door, 8, 12);
  addRoom(out.master, 10, 14);
  if (out.kitchen && out.kitchen.parts.some((p) => !p.star.good)) score += 4; // 灶压凶得位
  if (out.bathCenter) { score -= 6; tags.push('厕居中宫'); }
  if (out.kitchenCenter) { score -= 6; tags.push('火烧心'); }
  out.shapeVerdicts.forEach((s) => { if (s.tone === 'good') score += 3; if (s.tone === 'bad') score -= 6; if (s.tone === 'warn') score -= 2; });
  score = Math.max(20, Math.min(98, score));
  let level = score >= 80 ? '吉宅，可住且利于你' : score >= 62 ? '中平，小调整后宜居' : score >= 45 ? '偏弱，需要针对性化解' : '问题较多，慎重长住';
  return { score, level, tags };
}

export { ROOM_LABEL, CELL_DIR, STAR_ADVICE };
