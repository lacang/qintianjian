/*
 * yangzhai-xuankong.js — 玄空飞星直断（结论层，与 yangzhai-judge.js 八宅层并列的另一体系）
 * 计算层全部走 vendor/xuankong-core.js（确定性下卦挨星，不接 AI）。
 * 每条判语挂古籍出处；流派差异在 SOURCE_NOTE 并列说明，不黑箱合成。
 *
 * 口径：
 *  - 只做「下卦」（坐向线正落本山 15° 之内、未出本卦）：±3° 山界仅警告，不自动改判兼向；
 *    替卦/兼向未做，流派差异见 SOURCE_NOTE。
 *  - 运界与蓝本一致按公历整年取运（严格口径以立春换运），见 vendor 注释。
 *  - 旺衰随时间流转：盘以「建造年之运」定，星之旺衰以「当下之运」论——当运为旺、
 *    未来一二运为生（进气）、刚过一运为退、余为死煞。
 */
import {
  chartFor, periodOfYear, mountainsAt, starLuckOf,
} from '../../vendor/xuankong-core.js?v=117';

/* 九宫格 index（罗盘固定、北向上）→ 宫 key；4=中宫。与 yangzhai-judge.js 完全一致 */
const CELL_KEY = ['qian', 'kan', 'gen', 'dui', 'center', 'zhen', 'kun', 'li', 'xun'];
const CELL_DIR = ['西北', '北', '东北', '西', '中', '东', '西南', '南', '东南'];
const ROOM_LABEL = { door: '大门', master: '主卧', second: '次卧', living: '客厅', kitchen: '厨房(灶)', bath: '卫生间' };

/* 典籍依据（弹层/折叠引用；引文均已核对通行本） */
export const SOURCES = {
  wangshuai: { t: '《紫白诀·上篇》', q: '紫白飞宫，辨生旺退煞之用；三元分运，判盛衰兴废之时。' },
  fourJu: { t: '《无常派玄空风水讲义》（沈氏玄空学一系）', q: '四大局断语：旺山旺向丁财两旺；上山下水丁财两败；双星到向旺财损丁；双星会坐旺丁耗财。' },
  shanlun: { t: '《青囊序》', q: '山上龙神不下水，水里龙神不上山。' },
  shengqi: { t: '《玄空秘旨》', q: '苟无生气入门，粮艰一宿；会有旺星到穴，富积千钟。' },
  qiu: { t: '《沈氏玄空学·卷二·论令星入囚》', q: '令星入中谓之囚，阴阳二宅逢囚即败；然前面有水放光者，此囚不住，反作悠久论。' },
  dajie: { t: '《沈氏玄空学·卷一·论七星打劫》（引《天玉经》）', q: '识得父母三般卦，便是真神路；北斗七星去打劫，离宫要相合。' },
  sanban: { t: '《沈氏玄空学·卷一·论父母三般卦》', q: '父母三般卦，即一四七、二五八、三六九，三般卦气相通为用。' },
  heShi: { t: '《沈氏玄空学》（合十通义）', q: '盘内星与运星两两合十，气机流通，衰气可借旺气相通而解，化煞为权。' },
  wenchang: { t: '《紫白诀·上篇》', q: '四一同宫，准发科名之显。' },
  huoluan: { t: '《紫白诀·上篇》', q: '七九合辙，常招回禄之灾。' },
  bingfu: { t: '《紫白诀·上篇》', q: '二五交加而损主，亦且重病。' },
  jiaodou: { t: '《紫白诀·上篇》', q: '交剑煞兴多劫掠，斗牛煞起惹官刑。（六七为交剑，三碧遇二黑五黄为斗牛）' },
  gongming: { t: '《紫白诀·上篇》', q: '六八主武科发迹，不外韬略荣身；八六文士参军，或则异途擢用。' },
  daozei: { t: '《紫白诀·上篇》', q: '三七叠至而盗劫，更见官刑。' },
  huanTianXin: { t: '《沈氏玄空学》（换天心通义）', q: '宅过运则旺星退气；大修翻新、揭顶动土可「换天心」，另起一运论。' },
};

export const SOURCE_NOTE =
  '本页玄空层只做「下卦」（坐向线在本山 15° 内不兼不替）。' +
  '另有一路「兼向替卦」起星法（沈氏玄空学：可用替者十三字），同一线度挨星结果不同，本版未接入，兼向宅两法都可参考；' +
  '连珠三般卦，沈氏一系断吉，中州派有「连茹格」断凶之说，此处依蓝本列吉、不合成；' +
  '上山下水本主丁财两败，沈氏卷三亦有「山上龙神已下水、盘内合十通气」反不作凶之例；' +
  '运界本页按整年取运，严格口径以立春换运，运界年初之宅可能差一运。' +
  '玄空与八宅（yangzhai-judge）为两套体系，结论并列展示，不下唯一断语。';

/* 同宫山向星组合判语——只收《紫白诀》《玄空秘旨》明文所载，未载之组合不编造。
   match 为排序后的 [小,大] 星组。 */
const PAIR_RULES = [
  { match: [1, 4], tone: 'good', title: '一四同宫（文昌）',
    body: '一白水生四绿木，主科名、学业、文书之喜，利读书、考试、文职。',
    advice: '此处宜作书房、书桌、儿童学习位；保持整洁明亮，忌污秽压文昌。', src: 'wenchang' },
  { match: [2, 5], tone: 'bad', title: '二五交加（病符）',
    body: '二黑病符与五黄大煞同宫，主疾病、损主，是最须化解的一组。',
    advice: '宜以六帝钱/铜铃等金性物泄土（挂于该宫），保持安静少动，忌再堆杂物、动土。', src: 'bingfu' },
  { match: [6, 8], tone: 'good', title: '六八相遇（功名富贵）',
    body: '《紫白诀》「六八主武科发迹，韬略荣身；八六文士参军，或则异途擢用」，主功名富贵、武职异途皆有发。',
    advice: '宜作大门、主卧、书房等要处；开门纳气、安床安桌皆利。', src: 'gongming' },
  { match: [7, 9], tone: 'bad', title: '七九合辙（回禄火灾）',
    body: '七赤金与九紫火相战，《紫白诀》明言「常招回禄之灾」，主火灾、口舌、呼吸之疾。',
    advice: '此宫忌灶火、忌大红大紫布置与电器密集；宜放置土性色调（黄、陶瓷）泄火，保持通风。', src: 'huoluan' },
  { match: [6, 7], tone: 'warn', title: '六七交剑煞',
    body: '六七两金相遇为交剑煞，《紫白诀》「交剑煞兴多劫掠」，主争斗、破财、刀伤。',
    advice: '宜以水色（蓝黑、水景画作）泄金，避免金属利器陈列于此。', src: 'jiaodou' },
  { match: [2, 3], tone: 'warn', title: '二三斗牛煞',
    body: '三碧木与二黑土相斗为斗牛煞，《紫白诀》「斗牛煞起惹官刑」，主官非、口舌、家宅不睦。',
    advice: '宜以火性红色装饰泄木生土化解（红地垫/灯），减少此宫争执冲突之事。', src: 'jiaodou' },
  { match: [3, 5], tone: 'bad', title: '三五斗牛叠煞',
    body: '三碧木克五黄土，斗牛带大煞，官非口舌之外更防病灾。',
    advice: '同斗牛煞化解（火性泄木），并保持此宫安静、少动土。', src: 'jiaodou' },
  { match: [3, 7], tone: 'bad', title: '三七叠临（盗劫官刑）',
    body: '《紫白诀》「三七叠至而盗劫，更见官刑」，主盗贼、官讼。',
    advice: '宜加强此宫防盗门锁，放置水性蓝色调泄金生木通关，忌贵重物品存放于此。', src: 'daozei' },
];

/* 一宫（cell ix）→ 玄空视角摘要 */
function palaceOf(chart, ix) {
  const key = CELL_KEY[ix];
  const p = chart.palaces.find((q) => q.key === key);
  return { ix, key, dir: CELL_DIR[ix], base: p.base, ms: p.ms, fs: p.fs };
}

/* 同宫山向星组合 */
function pairRuleAt(cell) {
  const sorted = [cell.ms, cell.fs].sort((a, b) => a - b);
  return PAIR_RULES.find((r) => r.match[0] === sorted[0] && r.match[1] === sorted[1]) || null;
}

function luckOfNow(star, nowPeriod) { return starLuckOf(star, nowPeriod); }

/* 房间跨宫汇总：门看向星（水管财）、主卧看山星（山管人丁），其余两者并看 */
function roomCells(chart, cells) {
  const list = (Array.isArray(cells) ? cells : [])
    .filter((ix) => Number.isInteger(ix) && ix >= 0 && ix <= 8)
    .map((ix) => palaceOf(chart, ix));
  return list.length ? list : null;
}

function cellsText(cells, pick) {
  return cells.map((c) => `${c.dir}宫（${pick(c)}）`).join('、');
}

/* ---------- 判语构造 ---------- */

function buildPeriodVerdict(chart, nowPeriod) {
  const p = chart.period;
  const [s, e] = chart.periodRange;
  /* rel = (盘运 - 当下运) mod 9：0=当运；8=刚退一运（上一步）；1..2=未来一二运；其余=久失运 */
  const rel = ((p - nowPeriod) % 9 + 9) % 9;
  let tone, title, body, advice;
  if (rel === 0) {
    tone = 'good';
    title = `${chart.yuan}${p}运宅（${s}-${e}年建），正值当运`;
    body = `${chart.label}为${chart.yuan}${p}运之盘，当下仍是${p}运当令，旺星得令而用事，是为「旺运宅」。`;
    advice = '当运之宅以「用旺」为先：把门路、动线、使用最频繁的房间安排在旺星、生气星所在之宫。';
  } else if (rel === 8) {
    tone = 'warn';
    title = `${chart.yuan}${p}运宅（${s}-${e}年建），刚退一运`;
    body = `此宅成盘于${p}运，当下已交${nowPeriod}运：原当令旺星退气，「退气」之星由盛转衰，吉力减半。`;
    advice = '退运宅不必遽断为凶：大门若纳当下旺气仍可续用；若欲续旺，可择机大修「换天心」另起一运。';
  } else if (rel === 1 || rel === 2) {
    tone = 'neutral';
    title = `${chart.yuan}${p}运宅（${s}-${e}年建），运尚未至`;
    body = `此盘属${p}运，当下为${nowPeriod}运，${p}运之星尚属未来生气之星，目前力弱。`;
    advice = `可作「待运」之宅看：当下先借${nowPeriod}运旺星之宫用事，${p}运到时其星自旺。`;
  } else {
    tone = 'warn';
    title = `${chart.yuan}${p}运宅（${s}-${e}年建），已失运`;
    body = `此盘成于${p}运，距当下${nowPeriod}运已久，当令之星久退为死煞之气，《玄空秘旨》所谓「苟无生气入门，粮艰一宿」。`;
    advice = '失运宅以「引当下旺气」为要：门路、动处移至当下旺星生气之宫；久失运而欲翻新，须大修换天心另起一运论。';
  }
  return { tone, title, body, advice, src: rel === 0 || rel === 1 || rel === 2 || rel === 8 ? SOURCES.wangshuai : SOURCES.shengqi };
}

function buildPatternVerdict(chart, nowPeriod) {
  const pat = chart.pattern;
  const good = pat === '旺山旺向';
  const map = {
    旺山旺向: {
      tone: 'good',
      body: `坐山之宫山星得令、向首之宫向星得令——「山管人丁水管财」，山旺于坐、水旺于向，丁财两旺之局。`,
      advice: '宅后有靠（楼房、实墙）、宅前开阔或有水路，形理相配，则尽收其利。',
    },
    上山下水: {
      tone: 'bad',
      body: `当令山星飞到向首、当令向星飞到坐山，《青囊序》「山上龙神不下水，水里龙神不上山」——山神下水损丁、水神上山破财，丁财两败之局。`,
      advice: '此局须以形局补救：宅后（坐方）见水放光、宅前（向方）有高实之物为山，可「颠山倒水」反收其效；若形局再顺局而犯，则凶性尽显。',
    },
    双星到向: {
      tone: 'neutral',
      body: `当令山星与向星双双飞临向首：向首旺则财旺（水神得位），但山神亦到向而不坐，主旺财而损丁（人丁、健康弱一线）。`,
      advice: '向首宜有水（路、明堂）兼有小山或高物（「水中有山」），则财丁两得；纯见水则财旺丁弱，见山无水则财弱。',
    },
    双星会坐: {
      tone: 'neutral',
      body: `当令山向二星同到坐山：山神归坐主人丁旺、健康稳，但水神不上向，旺财之气郁于坐方，主旺丁而耗财。`,
      advice: '坐方（宅后）宜有水路、池湖放光，把会坐之财星引动出来；宅前向首保持整洁勿倾倒污秽。',
    },
    其他: {
      tone: 'warn',
      body: '盘面局型不在四大局之列（残盘），须请明师覆核坐向度数。',
      advice: '重新核对罗盘坐向与建造年份后重排。',
    },
  };
  const conf = map[pat];
  /* 局型断语出处：《宅运新案》载双星到向验案；余局挂无常派讲义（沈氏玄空学一系）四大局断语 */
  const src = pat === '双星到向'
    ? { t: '《宅运新案》', q: '二运壬山丙向，双星到向，旺财之局，验案甚多（该书载沈氏玄空学断例）。' }
    : SOURCES.fourJu;
  const extra = nowPeriod !== chart.period ? `（此局以${chart.period}运成盘论；当下已交${nowPeriod}运，须先看上面总评之旺衰，再论局型。）` : '';
  return { tone: conf.tone, title: `${chart.label} · ${pat}`, body: conf.body + extra, advice: conf.advice, src };
}

function buildCombinationVerdict(chart) {
  const list = chart.combinations;
  if (!list.length) return null;
  const head = list[0];
  const big = list.find((c) => c.kind === 'inauspicious' && /入囚|全盘/.test(c.name)) ||
              list.find((c) => c.kind === 'inauspicious') || head;
  const ji = list.filter((c) => c.kind === 'auspicious').map((c) => c.name);
  const xiong = list.filter((c) => c.kind === 'inauspicious').map((c) => c.name);
  const body = `全盘格局：${list.map((c) => c.name).join('、')}。` +
    (ji.length ? `吉者：${ji.join('、')}，宜顺势引动；` : '') +
    (xiong.length ? `须防：${xiong.join('、')}，相应宫位宜静不宜动。` : '');
  const ruQiu = list.some((c) => /入囚/.test(c.name));
  return {
    tone: big.kind === 'inauspicious' ? 'warn' : 'good',
    title: `盘面格局：${list.map((c) => c.name).join('、')}`,
    body: body + (ruQiu ? '令星入中为囚，「阴阳二宅逢囚即败；然前面有水放光者，此囚不住，反作悠久论」。' : ''),
    advice: ruQiu
      ? '入囚之解：宅前（向方）有水放光、明堂开阔则囚不住；中宫宜见光通气。'
      : '格局之吉凶依宫位落实：吉局之宫开门安床，凶局之宫宜静、宜泄、不宜动土。',
    src: ruQiu ? SOURCES.qiu : (list.some((c) => /打劫/.test(c.name)) ? SOURCES.dajie
      : (list.some((c) => /三般卦/.test(c.name)) ? SOURCES.sanban
      : (list.some((c) => /合十/.test(c.name)) ? SOURCES.heShi : SOURCES.sanban))),
  };
}

/* 门：向星（水神）为重——门纳气，水管财 */
function buildDoorVerdict(chart, cells, nowPeriod) {
  if (!cells) return null;
  const best = cells.reduce((a, b) => rankOf(b.fs, nowPeriod) < rankOf(a.fs, nowPeriod) ? b : a);
  const luck = luckOfNow(best.fs, nowPeriod);
  const combos = cells.map((c) => ({ c, r: pairRuleAt(c) })).filter((x) => x.r);
  const bad = combos.find((x) => x.r.tone === 'bad');
  let tone = luck === '旺' ? 'good' : (luck === '生' ? 'good' : (luck === '退' ? 'warn' : 'warn'));
  if (bad) tone = 'bad';
  const starList = cells.map((c) => `向星${c.fs}（${luckOfNow(c.fs, nowPeriod)}）`).join('、');
  const rule = pairRuleAt(best);
  const src = rule ? SOURCES[rule.src] : SOURCES.shengqi;
  const comboBody = rule
    ? `且此宫${rule.title}：${rule.body}`
    : (bad ? `门所在宫有${bad.r.title}之嫌，${bad.r.body}` : '');
  return {
    tone,
    title: `大门在${cellsText(cells, (c) => `向星${c.fs}·${luckOfNow(c.fs, nowPeriod)}`)}`,
    body: `玄空以门为纳气之口，向星（水神）管财：大门所临${starList}。` +
      (luck === '旺' ? '向星当旺，开门纳旺气，财源之口正佳。'
        : luck === '生' ? '向星属生气（未来之星），目前渐旺，可先用。'
        : luck === '退' ? '向星已退气，财口之力减半，宜以门路动线补旺。'
        : '向星失令为死煞之气，《玄空秘旨》「苟无生气入门，粮艰一宿」，须设法改纳旺气。') + comboBody,
    advice: bad
      ? bad.r.advice + '另可设玄关转气、把动线引向当下旺星之宫，以补门气。'
      : (luck === '旺' || luck === '生')
        ? '保持门口明亮通畅，勿堆杂物勿设镜对门，让旺气顺畅入宅。'
        : '若不能改门位，宜在门内设玄关转气、引动宅内当下旺星之宫（见下方各宫星盘），并以动线（常走动）补其气。',
    src,
  };
}

/* 主卧：山星（山神）为重——山管人丁健康 */
function buildMasterVerdict(chart, cells, nowPeriod) {
  if (!cells) return null;
  const best = cells.reduce((a, b) => rankOf(b.ms, nowPeriod) < rankOf(a.ms, nowPeriod) ? b : a);
  const luck = luckOfNow(best.ms, nowPeriod);
  const rule = pairRuleAt(best);
  const bad = cells.map((c) => pairRuleAt(c)).find((r) => r && r.tone === 'bad');
  let tone = (luck === '旺' || luck === '生') ? 'good' : 'warn';
  if (bad) tone = 'bad';
  const comboBody = rule ? `此宫${rule.title}：${rule.body}` : '';
  return {
    tone,
    title: `主卧在${cellsText(cells, (c) => `山星${c.ms}·${luckOfNow(c.ms, nowPeriod)}`)}`,
    body: `卧室安床以山星（山神）论人丁健康：主卧所临${cells.map((c) => `山星${c.ms}（${luckOfNow(c.ms, nowPeriod)}）`).join('、')}。` +
      (luck === '旺' ? '山星当旺，安床得位，健康人丁皆稳。'
        : luck === '生' ? '山星属生气，目前渐旺，安床尚宜。'
        : '山星失令，卧于此处健康人丁之力偏弱。') + comboBody,
    advice: (tone === 'bad')
      ? '优先考虑换至山星当旺之宫安床；不能换时，床头靠实墙、此宫安静整洁、少电器少镜，以稳其气。'
      : '床头宜靠实墙、避开门冲与厕冲；此宫保持整洁安静即可。',
    src: rule ? SOURCES[rule.src] : SOURCES.wangshuai,
  };
}

/* 灶：明火之位，最忌七九回禄；亦看山向星组合 */
function buildKitchenVerdict(chart, cells, nowPeriod) {
  if (!cells) return null;
  const huoluan = cells.find((c) => {
    const s = [c.ms, c.fs].sort((a, b) => a - b);
    return s[0] === 7 && s[1] === 9;
  });
  const rule = pairRuleAt(cells[0]);
  const bestLuck = cells.map((c) => luckOfNow(c.fs, nowPeriod)).sort(rankSort)[0];
  let tone = huoluan ? 'bad' : (bestLuck === '旺' || bestLuck === '生' ? 'good' : 'neutral');
  const comboBody = huoluan
    ? '灶属火，落七九合辙之宫，《紫白诀》「常招回禄之灾」，明火再助火煞，火患之虞最须防范。'
    : rule ? `此宫${rule.title}：${rule.body}` : '';
  return {
    tone,
    title: `厨房(灶)在${cellsText(cells, (c) => `${c.ms}-${c.fs}`)}`,
    body: `灶位看山向星组合（${cells.map((c) => `${c.dir}宫${c.ms}-${c.fs}`).join('、')}）。` + comboBody,
    advice: huoluan
      ? '此灶宜移；不能移则以土性色调（黄、米色）布置灶台四周泄火，灶具勤检修、离可燃物，务防火患。'
      : '灶口（操作时面向）宜朝向当下旺星之方；灶台背靠实墙即可。',
    src: huoluan ? SOURCES.huoluan : (rule ? SOURCES[rule.src] : SOURCES.wangshuai),
  };
}

/* 通用房间（客厅/次卧/卫生间等）：山向星并看 */
function buildRoomVerdict(chart, kind, cells, nowPeriod) {
  if (!cells) return null;
  const rules = cells.map((c) => ({ c, r: pairRuleAt(c) })).filter((x) => x.r);
  const bad = rules.find((x) => x.r.tone === 'bad');
  const good = rules.find((x) => x.r.tone === 'good');
  const luck = cells.map((c) => [luckOfNow(c.ms, nowPeriod), luckOfNow(c.fs, nowPeriod)]).flat().sort(rankSort)[0];
  const tone = bad ? 'bad' : (good || luck === '旺' || luck === '生') ? 'good' : 'neutral';
  const label = ROOM_LABEL[kind] || kind;
  const body = `${label}所在：${cells.map((c) => `${c.dir}宫 ${c.ms}(山)-${c.fs}(向)（${luckOfNow(c.ms, nowPeriod)}/${luckOfNow(c.fs, nowPeriod)}）`).join('、')}。` +
    (rules.length ? `组合：${rules.map((x) => x.r.title).join('、')}。${rules.map((x) => x.r.body).join(' ')}` : '');
  return {
    tone,
    title: `${label}在${cellsText(cells, (c) => `${c.ms}-${c.fs}`)}`,
    body,
    advice: bad ? bad.r.advice : (good ? good.r.advice : '此位平稳，按常布置即可；旺星所在宜作主要活动区。'),
    src: bad ? SOURCES[bad.r.src] : (good ? SOURCES[good.r.src] : SOURCES.wangshuai),
  };
}

/* 旺衰排序：旺 < 生 < 退 < 死 */
function rankOf(star, period) { return rankIdx(starLuckOf(star, period)); }
function rankIdx(luck) { return { 旺: 0, 生: 1, 退: 2, 死: 3 }[luck] ?? 3; }
function rankSort(a, b) { return rankIdx(a) - rankIdx(b); }

/* 山界检测：偏离山心 >4.5°（即距 7.5° 山界不足 3°）仅警告，仍按下卦排 */
function boundaryCheck(facingDeg) {
  const { chao } = mountainsAt(facingDeg);
  let dev = Math.abs(((facingDeg % 360) + 360) % 360 - chao.centerDeg);
  if (dev > 180) dev = 360 - dev;
  if (dev > 4.5) {
    return {
      dev: Math.round(dev * 10) / 10,
      mountain: chao.name,
      warn: true,
      verdict: {
        tone: 'warn',
        title: `向线偏离${chao.name}山中心 ${Math.round(dev * 10) / 10}°，已近山界`,
        body: `本盘仍按${chao.name}山下卦直排。距山界不足3°之线，传统认为有「出卦/阴阳差错」之嫌，兼向与否各家起星不同。`,
        advice: '若能量得更准的度数最好；本版不做替卦，近界之盘建议请明师以罗盘覆核，或与八宅层结论并列参考。',
        src: SOURCES.fourJu,
      },
    };
  }
  return { dev: Math.round(dev * 10) / 10, mountain: chao.name, warn: false, verdict: null };
}

/**
 * 主入口：玄空飞星直断。
 * @param {Object} st
 * @param {number} st.facingDeg  宅门/向首罗盘角度（北0°顺时针）
 * @param {number} st.buildYear  建造（或大装修）年份
 * @param {Object} st.rooms      {door:[0-8], master:[...], kitchen:[...], living:[...], second:[...], bath:[...]}，
 *                               ix 为九宫索引：0西北 1北 2东北 3西 4中 5东 6西南 7南 8东南
 * @param {number} [st.nowYear]  断事之年份（默认取当前年份；测试可显式传入）
 */
export function judgeXuankong(st) {
  const facingDeg = st.facingDeg;
  const buildYear = st.buildYear;
  if (!Number.isFinite(facingDeg) || !Number.isFinite(buildYear)) {
    throw new Error('judgeXuankong 需要 facingDeg 与 buildYear');
  }
  const nowYear = Number.isFinite(st.nowYear) ? st.nowYear : new Date().getFullYear();
  const nowPeriod = periodOfYear(nowYear);
  const chart = chartFor(facingDeg, buildYear);
  const boundary = boundaryCheck(facingDeg);
  const rooms = st.rooms || {};

  const out = {
    facing: {
      deg: Math.round((((facingDeg % 360) + 360) % 360) * 10) / 10,
      facing: chart.facing,
      mountain: chart.mountain,
      label: chart.label,
      facingYuan: chart.facingInfo.yuanName,
      boundary,
    },
    period: {
      number: chart.period,
      range: chart.periodRange,
      yuan: chart.yuan,
      nowYear,
      nowPeriod,
      status: (() => {
        const rel = ((chart.period - nowPeriod) % 9 + 9) % 9;
        if (rel === 0) return '当运';
        if (rel === 8) return '退气';
        if (rel === 1 || rel === 2) return '待运';
        return '失运';
      })(),
    },
    chart,
    periodVerdict: buildPeriodVerdict(chart, nowPeriod),
    patternVerdict: buildPatternVerdict(chart, nowPeriod),
    combinationVerdict: buildCombinationVerdict(chart),
    rooms: {},
    verdicts: [],
    issues: [],
    highlights: [],
    sourceNote: SOURCE_NOTE,
  };

  /* 逐房间注记 */
  const doorCells = roomCells(chart, rooms.door);
  const masterCells = roomCells(chart, rooms.master);
  const kitchenCells = roomCells(chart, rooms.kitchen);
  out.rooms.door = doorCells;
  out.rooms.master = masterCells;
  out.rooms.kitchen = kitchenCells;
  out.doorVerdict = buildDoorVerdict(chart, doorCells, nowPeriod);
  out.masterVerdict = buildMasterVerdict(chart, masterCells, nowPeriod);
  out.kitchenVerdict = buildKitchenVerdict(chart, kitchenCells, nowPeriod);
  for (const kind of ['living', 'second', 'bath']) {
    const cells = roomCells(chart, rooms[kind]);
    out.rooms[kind] = cells;
    out.rooms[kind + 'Verdict'] = cells ? buildRoomVerdict(chart, kind, cells, nowPeriod) : null;
  }

  /* 汇总 verdict 列表（顺序：总评→局型→格局→门主灶→其他房→山界） */
  out.verdicts.push(out.periodVerdict, out.patternVerdict);
  if (out.combinationVerdict) out.verdicts.push(out.combinationVerdict);
  if (out.doorVerdict) out.verdicts.push(out.doorVerdict);
  if (out.masterVerdict) out.verdicts.push(out.masterVerdict);
  if (out.kitchenVerdict) out.verdicts.push(out.kitchenVerdict);
  for (const kind of ['living', 'second', 'bath']) {
    const v = out.rooms[kind + 'Verdict'];
    if (v) out.verdicts.push(v);
  }
  if (boundary.warn) out.verdicts.push(boundary.verdict);

  /* issues / highlights */
  for (const v of out.verdicts) {
    if (!v) continue;
    if (v.tone === 'bad') out.issues.push(v.title);
    else if (v.tone === 'good') out.highlights.push(v.title);
    else if (v.tone === 'warn') out.issues.push(v.title);
  }
  return out;
}
