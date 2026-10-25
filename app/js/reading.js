/*
 * 古法读法层（v59）：梅花易数 / 奇门遁甲 的「看盘次第 + 盘上事实归位 + 典籍原文」。
 *
 * 铁律（与全产品一致）：
 *   本文件只提供 ① 传统读卦/读盘的方法与次第，② 盘面可确定性计算的事实归位，
 *   ③ 公有领域典籍原文（照录、带来源）。凡原文中“吉/凶/利/忌”等字样，均为
 *   该书的观点，不是本 App 对当前这一盘的综合判定；综合判断永远留给读卦人。
 *
 * 底本与源流（如实标注，不夸大门第）：
 *  - 梅花：《梅花易数》（题宋·邵雍撰，学界一般认为今本多经明清人编订增补）。
 *          引用据通行本《占卜总诀》《体用总诀》《衰旺论》等篇白文。
 *  - 奇门：《烟波钓叟歌》（传宋·赵普撰，收入明·程道生《遁甲演义》，《四库全书》本）。
 *          事类“类神取用”为时家奇门通行用法（散见《遁甲演义》《奇门五总龟》等），
 *          属方法层，非某一句古文；本文件不把现代整理文字冒充古文。
 *
 * 本文件不排盘，不碰引擎；所有判定函数输入纯数据、输出纯事实标签。
 */

import { wxKey } from './classical.js?v=117';

/* ============================================================
 * 一、梅花易数
 * ============================================================ */

/* 五行关系（生/克表与 classical/meihua 一致，独立自持以便复用） */
const SHENG = { 金: '水', 水: '木', 木: '火', 火: '土', 土: '金' };
const KE = { 金: '木', 木: '土', 土: '水', 水: '火', 火: '金' };

/**
 * 体用关系：只给客观生克标签，不附吉凶。
 * 吉凶解释见 MH_RELATIONS 中《体用总诀》原文（原书观点）。
 * @returns {{key:'same'|'in-gen'|'out-gen'|'in-ke'|'out-ke', text:string}}
 */
export function mhRelation(tiWx, yongWx) {
  if (tiWx === yongWx) return { key: 'same', text: `体用比和（${tiWx}＝${yongWx}）` };
  if (SHENG[yongWx] === tiWx) return { key: 'in-gen', text: `用生体（${yongWx}生${tiWx}）` };
  if (SHENG[tiWx] === yongWx) return { key: 'out-gen', text: `体生用（${tiWx}生${yongWx}）` };
  if (KE[yongWx] === tiWx) return { key: 'in-ke', text: `用克体（${yongWx}克${tiWx}）` };
  return { key: 'out-ke', text: `体克用（${tiWx}克${yongWx}）` };
}

/* 《梅花易数·体用总诀》对五种关系的原句（原书观点，非本 App 判定） */
export const MH_REL_QUOTE = {
  'same': '体克用，诸事吉；用克体，诸事凶。体生用，有耗失之患；用生体，有进益之喜；体用比和，则百事顺遂。',
  'in-gen': '体生用，有耗失之患；用生体，有进益之喜。',
  'out-gen': '体生用，有耗失之患。……体生用，为之泄气。',
  'in-ke': '用克体固不宜。……用克体，诸事凶。',
  'out-ke': '体克用，诸事吉。',
};
export const MH_REL_SOURCE = '《梅花易数·卷二·体用总诀》';

/* 本 / 互 / 变 三卦时序（《体用总诀》原文） */
export const MH_TIMELINE = [
  {
    key: 'ben', name: '本卦', stage: '事之始 / 当下',
    fact: '成卦之本体，动爻所在卦为「用」，不动之卦为「体」。',
    quote: '体卦为主，用卦为事。',
    source: '《梅花易数·体用总诀》',
  },
  {
    key: 'hu', name: '互卦', stage: '事之中 / 过程',
    fact: '去初、上两爻，以二三四爻为下互、三四五爻为上互，重为互卦。',
    quote: '互卦为事之中间。……互乃中间之应。',
    source: '《梅花易数·体用总诀》',
  },
  {
    key: 'bian', name: '变卦', stage: '事之终 / 趋向',
    fact: '动爻阴阳互变，单爻变所成之卦；其与体卦的生克看事之末后。',
    quote: '刻应变卦为事之终。……变乃末后之期。故用吉变凶者，先吉后凶；用凶变吉者，先凶后吉。',
    source: '《梅花易数·体用总诀》',
  },
];

/* 四时当令五行（公历月份近似；见 mhGuaQi 注释）。
 * 春木、夏火、秋金、冬水；土王四季月末十八日不并入四正，土另给提示。 */
function seasonLing(date) {
  const m = date.getMonth() + 1;
  if (m >= 2 && m <= 4) return { ling: '木', season: '春' };
  if (m >= 5 && m <= 7) return { ling: '火', season: '夏' };
  if (m >= 8 && m <= 10) return { ling: '金', season: '秋' };
  return { ling: '水', season: '冬' };
}

/**
 * 卦气旺相休囚死（月令卦气）。纯五行事实，按“当令者旺、我生相、生我休、克我囚、我克死”。
 * 注意：以公历月份近似划分春夏秋冬，未按节气交节精确切分；土王四季月末十八日不并入，
 *       仅对土另给提示——宁可标注近似，也不做看似精确实则含混的旺衰。
 * @returns {{state:'旺'|'相'|'休'|'囚'|'死', ling:string, season:string, note?:string}}
 */
export function mhGuaQi(wx, date) {
  const { ling, season } = seasonLing(date);
  let state;
  if (wx === ling) state = '旺';
  else if (SHENG[ling] === wx) state = '相';      // 当令所生
  else if (SHENG[wx] === ling) state = '休';      // 生当令
  else if (KE[wx] === ling) state = '囚';         // 克当令
  else state = '死';                              // 当令所克
  const note = wx === '土'
    ? '土王于四季月末十八日（辰戌丑未月），公历月份近似，精确旺衰请以交节核对。'
    : '依《衰旺论》以月令推卦气；公历月份近似，未按交节精确切分。';
  return { state, ling, season, note };
}

export const MH_GUAQI_QUOTE =
  '盛者，如春震、巽，秋乾、兑，夏离，冬坎，四季之月坤、艮是也。衰者，春坤、艮，秋震、巽，夏乾、兑，冬离，四季之月坎是也。';
export const MH_GUAQI_SOURCE = '《梅花易数·衰旺论》';

/* 《梅花易数·占卜总诀》古法读卦四步次第。
 * present: 'auto' 表示本 App 已据盘面呈现；'manual' 表示须占者临事自察，App 不代劳。 */
export const MH_STEPS = [
  {
    n: 1, title: '先看《周易》卦爻辞', present: 'auto',
    desc: '成卦之后，先读本卦卦辞与动爻爻辞（已在「经传原文」区白文列出，动爻高亮）。',
    quote: '大抵占卜之法，成卦之后，先看《周易》爻辞，以断吉凶。如乾初九「潜龙勿用」，则诸事未可为，宜隐伏之类。',
    source: '《梅花易数·卷二·占卜总诀》',
  },
  {
    n: 2, title: '次分体用，论五行生克', present: 'auto',
    desc: '动爻所在卦为用、不动卦为体；看本卦体用，再看互卦、变卦对体卦是生是克是比和，并参月令卦气之盛衰。',
    quote: '次看卦之体用，以论五行生克。体用即动静之说，体为主，用为事。……更详观互卦、变卦，以断吉凶；复究盛衰，以明休咎。',
    source: '《梅花易数·占卜总诀》《人事占》',
  },
  {
    n: 3, title: '又次看克应（外应）', present: 'manual',
    desc: '起卦当时耳闻目见之吉凶征兆、方圆缺全之物。此属临事外应，须占者自察，App 不代替、不虚构。',
    quote: '又次看克应。如闻吉说见吉兆则吉，闻凶说见凶兆则凶；见圆物事易成，见缺物事终毁之类。',
    source: '《梅花易数·占卜总诀》',
  },
  {
    n: 4, title: '复验己身动静（应期迟速）', present: 'manual',
    desc: '以占时自身坐、行、走、卧推事应迟速；具体应期另以生体/克体之卦的卦气时日推。须临事而断。',
    quote: '复验己身之动静。坐则事应迟，行则事应速，走则愈速，卧则愈迟之类。……要在圆机，不可执滞。',
    source: '《梅花易数·占卜总诀》',
  },
];

export const MH_PARTY_QUOTE =
  '体党多而体势盛，用党多则体势衰。如卦体是金，而互变皆金，则是体之党多；如用卦是金，而互变皆金，则是用之党多。';
export const MH_PARTY_SOURCE = '《梅花易数·体用总诀》';

export const MH_SOURCE_NOTE =
  '体用、本互变、卦气诸说据《梅花易数》（题宋·邵雍，今本多经明清编订）。其中吉/凶/利/忌皆原书观点，本 App 只列事实与原文，不作综合吉凶判定。';

/* ============================================================
 * 二、奇门遁甲（时家·转盘·拆补）
 * ============================================================ */

/* 洛书九宫对冲（后天八卦对宫）：1↔9, 2↔8, 3↔7, 4↔6, 5 居中 */
const OPPOSITE = { 1: 9, 9: 1, 2: 8, 8: 2, 3: 7, 7: 3, 4: 6, 6: 4 };

/* 九星 / 八门 的“本宫”（本位洛书数）：伏吟=归本宫，反吟=落对宫 */
const STAR_HOME = { 天蓬: 1, 天芮: 2, 天冲: 3, 天辅: 4, 天禽: 5, 天心: 6, 天柱: 7, 天任: 8, 天英: 9 };
const DOOR_HOME = { 休门: 1, 死门: 2, 伤门: 3, 杜门: 4, 开门: 6, 惊门: 7, 生门: 8, 景门: 9 };

/**
 * 伏吟 / 反吟 检测（纯几何事实，不判吉凶）。
 * - 伏吟：星/门落回本宫（歌：“天蓬加着地天蓬”）。
 * - 反吟：星/门落本宫对冲之宫（歌：“天蓬若到天英上”）。
 * 天禽寄中五，不参与伏反吟判定。
 */
export function qmFuFan(q) {
  const fuyin = { stars: [], doors: [] };
  const fanyin = { stars: [], doors: [] };
  q.palaces.forEach((p) => {
    const n = p.palaceNumber;
    if (p.star && STAR_HOME[p.star]) {
      if (STAR_HOME[p.star] === n) fuyin.stars.push({ name: p.star, palace: n });
      else if (OPPOSITE[STAR_HOME[p.star]] === n) fanyin.stars.push({ name: p.star, palace: n, home: STAR_HOME[p.star] });
    }
    if (p.door && DOOR_HOME[p.door]) {
      if (DOOR_HOME[p.door] === n) fuyin.doors.push({ name: p.door, palace: n });
      else if (OPPOSITE[DOOR_HOME[p.door]] === n) fanyin.doors.push({ name: p.door, palace: n, home: DOOR_HOME[p.door] });
    }
  });
  return { fuyin, fanyin };
}

export const QM_FUYIN_QUOTE = '就中伏吟为最凶，天蓬加着地天蓬。';
export const QM_FANYIN_QUOTE = '天蓬若到天英上，须知即是反吟宫。八门反复皆如此，生在生兮死在死。纵有吉宿得奇门，万事皆凶不堪使。';
export const QM_FUFAN_SOURCE = '《烟波钓叟歌》（《遁甲演义》本）';
export const QM_FUFAN_QUOTE = { fuyin: QM_FUYIN_QUOTE, fanyin: QM_FANYIN_QUOTE, source: QM_FUFAN_SOURCE };

/* 盘面标记（引擎已算）的中性释义；歌诀原文附“原书观点” */
export const QM_MARK_DEF = [
  {
    mark: '空', label: '旬空（时空）',
    fact: '该宫地盘地支落入本时旬空亡（四柱旬空）。',
    quote: null,
  },
  {
    mark: '马', label: '驿马',
    fact: '依时辰地支三合驿马（申子辰马在寅、寅午戌马在申、巳酉丑马在亥、亥卯未马在巳）所落之宫。',
    quote: '太冲天马最为贵，卒然有难宜逃避，但当乘取天马行。',
    source: '《烟波钓叟歌》',
  },
  {
    mark: '墓', label: '入墓',
    fact: '天盘六仪入其五行墓库，或临十二长生墓位。',
    quote: '又有时干入墓宫，课中时下忌相逢：戊戌壬辰兼丙戌，癸未丁丑一同凶。',
    source: '《烟波钓叟歌》',
  },
  {
    mark: '刑', label: '六仪击刑',
    fact: '天盘六仪与所落宫地支相刑（如甲子戊临震三宫，子卯相刑）。',
    quote: '六仪击刑何太凶，甲子直符愁向东；戌刑在未申刑虎，寅巳辰辰午刑午。',
    source: '《烟波钓叟歌》',
  },
  {
    mark: '迫', label: '门迫（门制其宫）',
    fact: '门五行克所落宫五行（门制宫）。',
    quote: '宫制其门则不迫，门制其宫是迫雄。',
    source: '《烟波钓叟歌》',
  },
];

/* 古法读盘次第（方法层，附歌诀；present 同梅花） */
export const QM_STEPS = [
  {
    n: 1, title: '辨阴阳遁、定局元与节气', present: 'auto',
    desc: '先明冬至后阳遁顺布、夏至后阴遁逆布；本局为拆补法定局（盘头已列遁/局/元/节气）。',
    quote: '阴阳二遁分顺逆，一气三元人莫测。五日都来换一元，接气超神为准的。',
    source: '《烟波钓叟歌》',
  },
  {
    n: 2, title: '认九宫、布九星八门', present: 'auto',
    desc: '洛书九宫，星门逐宫而布；宫底色为宫卦五行。',
    quote: '认取九宫分九星，八门又逐九星行。',
    source: '《烟波钓叟歌》',
  },
  {
    n: 3, title: '定直符、直使（一局主客之纲）', present: 'auto',
    desc: '直符为本旬旬头所随之星、随时干而转；直使为旬头本宫之门、随宫顺逆而行。盘内「符/使」徽标即其落宫。',
    quote: '九星逢甲为直符，八门直使自分明。符上之门为直使，十时一位堪凭据。直符常遣加时干，直使逆顺遁宫去。',
    source: '《烟波钓叟歌》',
  },
  {
    n: 4, title: '按所问事类取「类神」，看其落宫', present: 'auto',
    desc: '时家通行：以日干为人、时干为事，专项事各有类神（求财重生门、疾病重天芮、婚姻重乙庚六合等）。点下方事类，可在盘上高亮其落宫。',
    quote: null,
    source: '时家奇门通行取用法（参《遁甲演义》《奇门五总龟》类神诸法）',
  },
  {
    n: 5, title: '察星门神仪组合与格局', present: 'auto',
    desc: '看类神落宫所乘之星、门、神、奇仪，及伏吟反吟、击刑、入墓、门迫、空亡、马星等盘面标记；十干克应（如太白入荧、龙回首等）另附歌诀备查。',
    quote: '吉门偶尔合三奇，值此须云百事宜；更合从旁加检点，余宫不可有微疵。',
    source: '《烟波钓叟歌》',
  },
  {
    n: 6, title: '参月令旺衰与主客，缓急从神从门', present: 'manual',
    desc: '以节气定星门神宫旺相休囚，分动静主客（动为客、静为主，天盘为客、地盘为主）；急则从神、缓则从门。须临事权衡，App 不代断。',
    quote: '急则从神缓从门，三五反复天道亨。……若见三奇在五阳，偏宜为客自高强；忽然逢着五阴位，又宜为主好裁详。',
    source: '《烟波钓叟歌》',
  },
];

/* 事类类神取用表（时家通行法）。match 在视图层用 qmFind 解析为落宫。
 * type: door / star / god / stem（stem 指天盘奇仪，取 earthStem 字段——引擎字段 earthStem 实装为天盘干）。 */
export const QM_YONGSHEN = [
  {
    id: 'wealth', name: '求财 · 经营',
    items: [
      { what: '生门', type: 'door', val: '生门', note: '利息、利润、得财之路' },
      { what: '戊（甲子戊）', type: 'stem', val: '戊', note: '资本、本钱' },
      { what: '值符', type: 'god', val: '值符', note: '货主 / 物主、银行' },
      { what: '值使门', type: 'zhishi', val: null, note: '购货、借贷之人' },
      { what: '六合', type: 'god', val: '六合', note: '经纪、中介、合伙人' },
    ],
  },
  {
    id: 'health', name: '疾病 · 医药',
    items: [
      { what: '天芮', type: 'star', val: '天芮', note: '病星、病症所主' },
      { what: '天心', type: 'star', val: '天心', note: '医药、救治（传统多应西医/综合医治）' },
      { what: '乙奇', type: 'stem', val: '乙', note: '医药（传统多应中医、方药）' },
      { what: '死门', type: 'door', val: '死门', note: '兼看病势轻重' },
    ],
  },
  {
    id: 'marriage', name: '婚姻 · 感情',
    items: [
      { what: '乙奇', type: 'stem', val: '乙', note: '女方' },
      { what: '庚', type: 'stem', val: '庚', note: '男方' },
      { what: '六合', type: 'god', val: '六合', note: '媒人、婚姻关系' },
      { what: '太阴/六合', type: 'god', val: '太阴', note: '男婚女嫁传统以临太阴、六合为美' },
    ],
  },
  {
    id: 'career', name: '事业 · 功名',
    items: [
      { what: '开门', type: 'door', val: '开门', note: '公职、事业、门面' },
      { what: '值符', type: 'god', val: '值符', note: '上级、官长、贵人' },
      { what: '天辅', type: 'star', val: '天辅', note: '文教、贵人、考学' },
      { what: '景门', type: 'door', val: '景门', note: '文书、名声、奏章' },
    ],
  },
  {
    id: 'travel', name: '出行 · 行人',
    items: [
      { what: '开门/休门/生门', type: 'door', val: '开门', note: '吉门，传统利出行' },
      { what: '九天', type: 'god', val: '九天', note: '远方、张扬、出行' },
      { what: '驿马宫', type: 'mark', val: '马', note: '动象、速行' },
      { what: '杜门', type: 'door', val: '杜门', note: '阻滞、隐藏' },
    ],
  },
  {
    id: 'litigation', name: '官非 · 争讼',
    items: [
      { what: '惊门', type: 'door', val: '惊门', note: '官非、口舌、讼狱' },
      { what: '开门', type: 'door', val: '开门', note: '官长、审判之所' },
      { what: '值符', type: 'god', val: '值符', note: '官长、原告/债主之象' },
      { what: '白虎', type: 'god', val: '白虎', note: '刑伤、凶险' },
    ],
  },
];

/**
 * 按类神 match 解析落宫（只做客观定位，不判吉凶）。
 * @returns {number[]} 命中的宫号数组（可能多宫；中五天禽无门时不命中）
 */
export function qmFind(q, byNum, item) {
  const hit = [];
  q.palaces.forEach((p) => {
    const n = p.palaceNumber;
    if (item.type === 'door') { if (p.door === item.val) hit.push(n); }
    else if (item.type === 'star') { if (p.star === item.val) hit.push(n); }
    else if (item.type === 'god') { if (p.god === item.val) hit.push(n); }
    else if (item.type === 'stem') { if (p.earthStem === item.val) hit.push(n); } // earthStem=天盘干（引擎字段约定）
    else if (item.type === 'zhishi') { if (n === q.zhiShi.palace) hit.push(n); }
    else if (item.type === 'mark') { if ((p.marks || []).includes(item.val)) hit.push(n); }
  });
  return hit;
}

/* 十干克应 / 常用格局歌诀备查（只列歌诀原文供自查；App 不自动点名某宫为某吉/凶格）。
 * 原因：诸家对中五寄宫、飞盘/转盘、星门神干合局的判定口径不一，自动合成易误导，
 *       故仅提供原文，由读卦人对照「天盘干 + 地盘干」自行查检。 */
export const QM_GEJU_QUOTES = [
  { names: '太白入荧 / 荧入太白', text: '庚为太白丙荧惑……六庚加丙白入荧，六丙加庚荧入白。白入荧兮贼即来，荧入白兮贼须灭。' },
  { names: '青龙返首 / 飞鸟跌穴', text: '丙加甲兮鸟跌穴，甲加丙兮龙回首。只此二者是吉神，为事如意十八九。' },
  { names: '龙逃走 / 虎猖狂 / 雀投江 / 蛇跃蹻', text: '六癸加丁蛇跃蹻，六丁加癸雀入江；六乙加辛龙逃走，六辛加乙虎猖狂。请观四者是凶神，百事逢之莫措手。' },
  { names: '五不遇时', text: '五不遇时龙不精，号为日月损光明。时干来克日干上，甲日须知时忌庚。' },
  { names: '三奇得使', text: '三奇得使诚堪使，六甲遇之非小补。乙逢犬马丙鼠猴，六丁玉女骑龙虎。' },
  { names: '三遁（天/地/人遁）', text: '生门六丙合六丁，此为天遁自分明；开门六乙合六己，地遁如斯而已矣；休门六丁共太阴，欲求人遁无过此。' },
  { names: '吉门', text: '八门若遇开休生，诸事逢之总称情。伤宜捕猎，杜好邀遮及隐形，景上投书并破阵，惊能擒讼有声名，若问死门何所主，只宜吊死与行刑。' },
  { names: '主客动静', text: '天目为客地为主……若见三奇在五阳，偏宜为客自高强；忽然逢着五阴位，又宜为主好裁详。' },
];

export const QM_SOURCE_NOTE =
  '排法与歌诀据《烟波钓叟歌》（《遁甲演义》四库本，时家转盘拆补、中五寄坤二）；事类类神为时家通行取用，散见《遁甲演义》《奇门五总龟》。超神接气/置闰、飞盘及各家格局分判暂未并列。歌诀中吉凶皆原书观点，本 App 只排盘、归位、列原文，不代断。';

export { wxKey };
