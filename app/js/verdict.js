// 古法直断结论层（v69 · 2026-10-22 主人定铁律：可以断吉凶、给倾向）
//
// 本模块不做任何"自由发挥"：所有结论只由两类东西推出——
//   1) analyzeNajia 已经算好的确定性盘面事实（用神/旺衰/空破/动变/原神忌神/世应关系）；
//   2) 写死在本文件里的《增删卜易》《卜筮正宗》通行规则与原文。
// 每条加减都可在本文件逐条核对，不接 AI、不联网、不留存。
//
// 问事域按"现代人的问题"设计（求财/事业学业/感情/健康/抉择/人生大势/找人/失物），
// 不按术数分类——先有人的问题，再让古法用神为问题服务。
import { $, current } from './state.js?v=124';
import { analyzeNajia, getReadingDomain } from '../vendor/liuyao-core.js?v=124';

const POS = ['初', '二', '三', '四', '五', '上'];

// 前端现代域 → 引擎纳甲 Domain（用神取用在引擎里）
const DOMAIN_MAP = {
  wealth: '财运',
  career: '事业',
  love: '感情',
  health: '疾病',
  decision: '合作',
  life: '其他',
  people: '行人',
  lost: '失物',
};
// 旧版本 id 兼容
DOMAIN_MAP.travel = '行人';
DOMAIN_MAP.relationship = '感情';

const WANG = new Set(['旺', '相']);
const SHUAI = new Set(['休', '囚', '死']);
const SHENG = { 金: '水', 水: '木', 木: '火', 火: '土', 土: '金' };
const KE = { 金: '木', 木: '土', 土: '水', 水: '火', 火: '金' };
const CHONG = { 子: '午', 午: '子', 丑: '未', 未: '丑', 寅: '申', 申: '寅', 卯: '酉', 酉: '卯', 辰: '戌', 戌: '辰', 巳: '亥', 亥: '巳' };
const LIUHE = { 子: '丑', 丑: '子', 寅: '亥', 亥: '寅', 卯: '戌', 戌: '卯', 辰: '酉', 酉: '辰', 巳: '申', 申: '巳', 午: '未', 未: '午' };
const MU = { 木: '未', 火: '戌', 金: '丑', 水: '辰' };
// 卦名单与 liuyao-core/src/constants.ts 的 LIU_CHONG_GUA / LIU_HE_GUA 逐字一致
// （来源：tsumugi specialType，MIT；六冲 10 个含八纯+大壮+无妄，六合 8 个）。
// 2026-10-28 L1 第一批修复：六冲补「天雷无妄、雷天大壮」；六合按 constants 改正
// （旧名单误列 火地晋/山雷颐/地泽临，漏 天地否/山火贲/火山旅）。
const LIU_CHONG_GUA = ['乾为天', '坤为地', '坎为水', '离为火', '震为雷', '艮为山', '巽为风', '兑为泽', '天雷无妄', '雷天大壮'];
const LIU_HE_GUA = ['地雷复', '地天泰', '雷地豫', '水泽节', '泽水困', '山火贲', '火山旅', '天地否'];

function esc(s){ return String(s ?? '').replace(/[&<>"]/g,(c)=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c])); }
function zhiOf(gz){ return gz ? gz.charAt(1) : ''; }
function pName(o){ return (o.hidden ? '伏神' : POS[o.pos-1]+'爻'); }
function movingList(an, qin){ return (an.byLiuQin[qin]||[]).filter((o)=>o.moving && !o.hidden); }
function wangDong(l){ return l.filter((o)=>WANG.has(o.state.lingTai) && !o.state.xunKong && !o.state.yuePo); }
function anyWang(l){ return l.some((o)=>WANG.has(o.state.lingTai)); }
function guaName(g){ return g && g.name ? g.name.replace(/[()（）]/g,'') : ''; }

/* ============================================================================
 * 古法规则库（v75 可信度重构）
 * 每条加减都必须能指回一条「规则」：ruleId -> { book 篇目, gu 古文原文, hua 白话 }
 *   · gu 取《增删卜易》（野鹤老人，清·康熙）/《卜筮正宗》（王洪绪，清）通行口诀；
 *   · 凡字句不能逐字确证者，不硬造逐字引文，改用该篇通行要旨，并在文内以「要旨」
 *     字样诚实标注，宁可保守，不冒充原文——这是"不断章取义"的底线。
 * 渲染时每条盘面信号强制三段：①盘面事实 ②古法规则(原文+篇目+白话) ③所以怎么断。
 * ========================================================================== */
const RULES = {
  yuepo:  { book:'《增删卜易·月破章》', gu:'月破之爻，用神逢之，如物已破，诸事不宜；出月、实破、逢合则可补。', hua:'被当月月建正冲的爻叫「月破」，像东西这个月碎了，根基受损；过了这个月或逢合补，才谈得上成。' },
  xunkong:{ book:'《增删卜易·旬空章》', gu:'爻逢旬空，静而空者为真空，动而空者不为空；待出旬填实，方有用。', hua:'十天一旬，轮空的两个地支叫旬空。安静的爻落空多为「真空」（眼下落不到实处）；动爻落空不算真空，等本旬过后填实仍有用。' },
  wangxiang:{ book:'《增删卜易·四时旺相章》', gu:'当令者旺，我生者相，生我者休，克我者囚，我克者死。用神旺相则事有根，休囚死则力不足。', hua:'爻在当前月令所处的状态分旺、相、休、囚、死五种。用神旺/相是得时得气、事情有底气；休囚死是失时、力不从心。这是断旺衰的总纲。' },
  mu:     { book:'《增删卜易·生旺墓绝章》', gu:'入墓者，如人归家、物入库，闭塞不通；逢冲墓之月日则开。', hua:'爻逢入墓，像人进了屋、东西锁进库，力量施展不开；等到冲开墓库的月日才有动静。' },
  jue:    { book:'《增删卜易·生旺墓绝章》', gu:'逢绝地，气尽也；须待长生之月日，方有生意。', hua:'爻走到十二长生的「绝」地，这股气到头了，要等它重新长生之时。' },
  changsheng:{ book:'《增删卜易·生旺墓绝章》', gu:'长生者，物之始生，如草木萌蘖，后来有气。', hua:'爻逢长生，像刚发芽，后劲足、是往上长的象。' },
  diwang: { book:'《增删卜易·生旺墓绝章》', gu:'帝旺者，气之盛极，如日中天。', hua:'爻临帝旺，气到了最盛的时候。' },
  liuhe:  { book:'《增删卜易·六合章》', gu:'相合者，和顺扶持之象；用神得月日合，有人提携，事易成。', hua:'两支相合代表拉一把、促成。用神被月建或日辰合，是有外力成全。' },
  andong: { book:'《增删卜易·暗动章》', gu:'静爻旺相而被日辰冲者，为暗动，福来而不知，祸来而不觉。', hua:'本来安静、但自身旺又被日辰冲的爻叫「暗动」——表面没动静，底下已经在悄悄变化。' },
  ribo:   { book:'《增删卜易·日辰章》', gu:'日辰冲旺相之静爻为暗动，冲休囚之静爻为日破。', hua:'同样被日辰冲：旺爻被冲是暗动（好事），衰爻被冲就是「日破」（近期被冲散）。' },
  dongbian:{ book:'《增删卜易·动变章》', gu:'动为事之机，变为事之终。变出之爻生我、比和者吉，克我、化退化墓者凶。', hua:'动爻是事情的发动处，变出的爻是走向。变爻回头生本爻是有人帮、越变越好；回头克是一动就坏、自己伤自己。' },
  jintui: { book:'《增删卜易·进化退神章》', gu:'动化进神，其势方张，事在必行；动化退神，逆而渐退，事将废坠。', hua:'动爻化进神是势头往前奔；化退神是看着要成、势却在往后缩。' },
  fanfu:  { book:'《增删卜易·反伏吟章》', gu:'反吟者，反复呻吟、去来不定；伏吟者，伏枥哀鸣、停滞不行。', hua:'化反吟主反反复复、折腾；化伏吟主原地踏步、愁苦难进。' },
  yuanji: { book:'《增删卜易·原神忌神章》', gu:'原神者，生用神之爻也，宜旺动；忌神者，克用神之爻也，忌旺动。原神旺而忌神静，事乃可成。', hua:'生用神的叫原神（帮手/源头），克用神的叫忌神（阻力）。原神旺动是助力源源不断；忌神旺动是真实而有力的阻碍，最该防。' },
  shiying:{ book:'《增删卜易·世应章》', gu:'世为我，应为彼。世应相生相合则相得，相冲相克则相伤；用生世者，事来就我。', hua:'世爻代表自己，应爻代表对方、地头、所问的对象。相生相合则彼此成全，相冲相克则顶着来；用神来生世，是事情主动来成就你。' },
  qiucai: { book:'《增删卜易·求财章》', gu:'财为用神，子孙为元神，兄弟为劫财之忌。子动生子、子动生财其利厚；兄弟交重无子孙通关，则分夺破耗。', hua:'求财以妻财为用神、子孙为财源、兄弟为分财之神。子孙和兄弟一起动，反而兄生子、子生财，是长久大生意；兄弟单动没子孙通关，就是被分利、破财、竞争。' },
  caishengshi:{ book:'《增删卜易·求财章》', gu:'财来克世，财来赶人；财爻生合世爻，求谋易得。', hua:'古法里财爻来「克」世爻反而是好事——像钱主动找上门；财爻生合世，更是伸手就够得着。' },
  qiuming:{ book:'《卜筮正宗·求名章》', gu:'占功名以官星为用、父母为文章文书。最忌子孙持世发动，盖子孙乃剥官之神，遇之百无一成。', hua:'考学、求职、升迁看官星（职位）和父母爻（考卷/文书/批文）。子孙是克官的「剥官之神」，它持世或旺动，最伤功名，常应在名额取消、政策生变。' },
  hunyin: { book:'《增删卜易·婚姻章》', gu:'占婚宜六合、忌六冲，更要财官旺相。六合变六冲，始亲终疏；六冲变六合，眼下不允，日后必成。', hua:'占感情婚姻最看重合与冲：六合卦关系黏得住，六冲卦易散易吵。先六冲后六合是先难后成；先六合后六冲是现在再好以后也会变。' },
  qubi:   { book:'《增删卜易·趋避章》', gu:'凡占防患，宜子孙持世、福神旺动，飞殃横祸化为尘；独鬼爻克世更凶，宜豫为趋避。', hua:'问防不防得住祸，喜子孙（解忧之神）旺动，凶事能化；最怕官鬼旺动还来克世爻，预示实患会冲自己来，占卜的用处就是提前躲开。' },
  jibing: { book:'《增删卜易·疾病章》', gu:'自占病以世为病人、官鬼为病、子孙为医药。官鬼旺动病重，子孙旺动药灵；近病逢空即愈，久病逢空则凶。', hua:'自占病：世爻是病人，官鬼是病，子孙是药和医生。鬼旺病重、子旺药到病除；要分新病久病——急病逢旬空往往不治而愈，久病逢空反而是元气已空的险象。' },
  yanyi:  { book:'《增删卜易·延医章》', gu:'应爻为医、为药之所。子孙临应，谓之明医；应爻空破墓绝，药不奏效。', hua:'占求医，应爻代表医生、医院、这味药。子孙临应是「明医」对症；应爻落空破墓绝，是这个方案不得力，宜换。' },
  xingren:{ book:'《增删卜易·行人章》', gu:'用克世兮人即至，世克用兮人未动；用神安静、墓绝空破，归信杳然；动化退神则归，化进神则往。卦逢六冲，行人无定而不返。', hua:'占人何时回来：用神来克世，人很快就到；世爻去克用神，人还没动身。用神安静或入墓逢空破，一时半会儿没信；动化退神是往回走，化进神是越走越远。卦逢六冲，古法认为行人行踪不定、难以落定归期——但六冲只是单一卦象信号，须结合用神旺衰与其他判据参看。原文同章另有「问行人之否泰，另占一卦，不可一卦而兼断」，即归期与在外平安古法主张分占。' },
  shituo:{ book:'《卜筮正宗·黄金策·失脱》', gu:'失物以财为物，以官鬼玄武为贼。官鬼兴动临玄武，多系盗失；官鬼不兴，自失非盗。财静持世，物尚在；财空入墓，难寻。', hua:'丢东西以妻财为所失之物，官鬼临玄武为小偷。官鬼发动尤其带玄武，多是被人偷走；官鬼不动多半是自己放错。财爻安静持世说明东西还在身边；逢空、入墓就难找。' },
  feifu: { book:'《增删卜易·飞伏神章》', gu:'卦无用神，看伏神。伏而旺者，待冲飞、引拔、值月日而用；伏而休囚空破，终难出现。', hua:'卦面上找不到用神，就看它藏在哪一爻（伏神）。伏神本身旺，等冲去盖住它的「飞神」或它当值之时能成；伏神又休囚空破，短期难露头。' },
  yongshenbuxian:{ book:'《增删卜易·用神章》', gu:'卦无用神又无伏神，事无着落，占吉不吉、占凶不凶，宜待时再占。', hua:'整卦既找不到用神、也没有伏神，说明所问之事眼下在生活里没有落点，先收劲、等它上卦。' },
  chishi:{ book:'《卜筮正宗·诸爻持世诀》', gu:'占身命以世爻为主：官鬼持世事难安，父母持世主身劳，财爻持世益财荣，子孙持世事无忧，兄弟持世莫求财。', hua:'看一生大势，世爻临哪个六亲，定一生主基调——临官鬼责任压力重、临父母靠学问文书且劳碌、临财近利、临子孙好自由清福、临兄弟重朋友但财易散。' },
  // 旧 quoteKeys 八键（保留，并入规则库）
  caishenghui:{ book:'《增删卜易·求财章》', gu:'财旺福兴，公私称意；财空福绝，上下违心。子孙乃生财之元神，俱宜旺而化吉，又宜生合世爻。', hua:'财爻旺、子孙（财源）也旺，公私事都顺；财空、财源绝则处处别扭。子孙旺动来生财、又生合世爻，是求财最正的好结构。' },
  xiongdong:{ book:'《增删卜易·求财章》', gu:'有福无财，兄弟交重偏有望。兄弟乃劫财之神，占财之忌；若得子孙与兄弟同动，又为可喜，兄动生子、子动生财，其利甚厚。', hua:'兄弟本是分财的忌神，单动主破财；但若子孙同时发动，就成了兄生子、子生财的流通，反而是源远流长的厚利大生意。' },
  guanfu:{ book:'《增删卜易·终身功名有无章》', gu:'官父兴隆，文章见用。旺父持世、官动生之，或官星持世、父爻旺动，或官父旺动生合世爻，皆主成名。', hua:'功名的正路结构是「官星（职位）+ 父母（文书考卷）」双双旺动相生、又来生合世爻——有名额、有文书、有靠山，古法主成名。' },
  zisunzhiguan:{ book:'《卜筮正宗·求名章》', gu:'凡占功名，最忌子孙持世、子孙发动，盖子孙乃剥官之神，占官者遇之，百无一成。', hua:'求功名最怕子孙持世或旺动——子孙克官星，是「剥官之神」，遇之机会容易被推翻，常应在名额取消、政策变动、自己也抗拒受管束。' },
  liuhunhun:{ book:'《增删卜易·婚姻章》', gu:'爻逢六合占婚最宜，更要财官旺相为吉；六冲变六合者更吉，眼下不允，日后必成。忌六冲、卦无财官；六合变六冲，虽许允后必变。', hua:'占婚以六合为美、六冲为忌。六冲变六合是先吵先难、日后反成；六合变六冲是现在再好以后也会变心（始亲终疏）。' },
  zisunjieyou:{ book:'《增删卜易·趋避章》', gu:'凡一切忧疑惊恐、防灾防患者，皆宜子孙持世，或福神动于卦中。但得子孙乘旺动，飞殃横祸化为尘。', hua:'子孙是解忧、化灾、医药之神。占防患、占病，子孙持世或旺动，古法认为横祸都能化解。' },
  guihui:{ book:'《增删卜易·趋避章》', gu:'凡占防患，克世者皆不为吉，独鬼爻克世更凶。', hua:'占防患，凡有爻来克世都不算好，其中尤其以官鬼（忧患、盗贼、疾病）克世最凶——所防的实患会真的冲自己来。' },
  shiyingke:{ book:'《增删卜易·出行章》', gu:'世伤应位，不拘远近相宜；应克世，公私皆主不利。我去克他，所向通达；应来刑冲克世，不可行之。', hua:'出行/合作看世应：世爻去克应（我占主动、压得住局面）反而通达；应爻来克世，则无论公事私事都主不利，不宜前往。' },
};

// 旧的「书名标签」→ 规则库默认条目（让绝大多数信号零改动即获得原文+白话）
const S2R = {
  '《增删卜易·月破章》':'yuepo',
  '《增删卜易·旬空章》':'xunkong',
  '《增删卜易·四时旺相章》':'wangxiang',
  '《增删卜易·生旺墓绝章》':'wangxiang',
  '《增删卜易·六合章》':'liuhe',
  '《增删卜易·六冲章》':'liuchong',
  '《增删卜易·暗动章》':'andong',
  '《增删卜易·日辰章》':'ribo',
  '《增删卜易·动变章》':'dongbian',
  '《增删卜易·进退章》':'jintui',
  '《增删卜易·反伏章》':'fanfu',
  '《增删卜易·元神忌神章》':'yuanji',
  '《增删卜易·世应章》':'shiying',
  '《增删卜易·求财章》':'qiucai',
  '《卜筮正宗·求名章》':'qiuming',
  '《增删卜易·婚姻章》':'hunyin',
  '《增删卜易·趋避章》':'qubi',
  '《增删卜易·疾病章》':'jibing',
  '《增删卜易·延医章》':'yanyi',
  '《增删卜易·出行章》':'qubi',
  '《增删卜易·行人章》':'xingren',
  '《卜筮正宗·黄金策·失脱》':'shituo',
  '《增删卜易·飞伏神章》':'feifu',
  '《增删卜易·用神章》':'yongshenbuxian',
  '《卜筮正宗·诸爻持世诀》':'chishi',
  '《卜筮正宗·身命》':'chishi',
  '《增删卜易·学业章》':'qiuming',
  '《增删卜易·终身功名有无章》':'qiuming',
};
// 把一条信号解析成规则对象：显式 qk 优先，其次书名映射
function resolveRule(ruleId, srcLabel) {
  const id = ruleId || S2R[srcLabel];
  if (id && RULES[id]) return { id, ...RULES[id] };
  return null; // 找不到也不硬编：只显示书名字签（诚实降级）
}

/**
 * 对一张盘、一个现代问事域跑固定古法规则。
 * @returns {level, headline, takeaway, signals[], quotes[], timing, ysName, score}
 */
export function judgeNajia(pan, domainId) {
  const monthZhi = zhiOf(pan.siZhu.monthGanZhi);
  const dayZhi = zhiOf(pan.siZhu.dayGanZhi);
  const an = analyzeNajia(pan, { monthZhi, dayZhi, sex: pan.gender === '女' ? '女' : '男' });
  const dKey = DOMAIN_MAP[domainId] || '其他';
  const ys = an.yongshen[dKey] || an.yongshen['其他'];
  const dom = getReadingDomain(domainId) || getReadingDomain('decision');

  const signals = [];
  const quoteKeys = new Set();
  let score = 0;
  // 每条加减都强制挂一条古法规则（原文+篇目+白话）；解析不到规则就只留书名字签，不硬编
  const add = (w, text, src, qk) => { signals.push({ w, text, src, rule: resolveRule(qk, src) }); score += w; if (qk) quoteKeys.add(qk); };

  // 这几个域不走"用神本体旺衰"的通用加减：
  // health/decision/life 用神是世爻或反用神（鬼=病、子=药），全部由专项块统算；
  // people 以应爻为用，应爻的旺衰空破在「世应关系」块和行人专项块里已断，不重复计分。
  const skipYongBody = new Set(['health','decision','life','people']);

  // ---------- 取用（多现固定法：持世>发动>不空破>月日合；平票取最上爻）----------
  let yongOccs = [], ysName = '', yn = '';
  if (ys.useYing && an.ying) { yongOccs=[an.ying.occ]; ysName='应爻'; yn='应爻'; }
  else {
    let pool = ys.occurrences.filter((o)=>!o.hidden);
    if (pool.length > 1) {
      const rank=(o)=>(o.shi?8:0)+(o.moving?4:0)+(!o.state.xunKong&&!o.state.yuePo?2:0)+(o.state.yueHe||o.state.riHe?1:0);
      const max=Math.max(...pool.map(rank));
      pool = pool.filter((o)=>rank(o)===max);
    }
    yongOccs = pool;
    ysName = ys.primary.join('、');
    if (yongOccs.length) yn = yongOccs[0].liuQin;
  }
  const y = yongOccs[0];

  // ---------- 重复计分闸门（V2）----------
  // bodyCounts：用神本体块（一、）确实参与计分；health/decision/life/people 的用神是世爻或反用神，
  //   旺衰/动变全部由专项块统算，故这些域不触发下列去重，避免误删唯一的世爻分。
  // yongIsShi：选中的用神就是世爻同一爻（此时"用神"与"世爻"是同一基础因素，不是两条独立证据）。
  //   应爻为用（useYing）不适用：应爻与世爻必然不同爻。
  const bodyCounts = yongOccs.length > 0 && !skipYongBody.has(domainId);
  const yongIsShi = !!(bodyCounts && y && !ys.useYing && an.shi && y.pos === an.shi.occ.pos);

  // ---------- 一、用神本体（通用）----------
  if (!yongOccs.length && !skipYongBody.has(domainId)) {
    const hidden = ys.occurrences.filter((o)=>o.hidden);
    if (hidden.length) {
      const h = hidden[0];
      add(-1, `卦面上找不到${ysName}，它藏在「${esc(h.hiddenUnder)}」这一爻下面——事情的苗头在，但还没露头，要等引拔、冲飞或临值的月日。`, '《增删卜易·飞伏神章》');
      if (WANG.has(h.state.lingTai)) add(1, '不过这个伏神本身得月令之气，是"伏而旺"，等到冲去飞神或它值日值月时仍能成。', '《增删卜易·飞伏神章》');
      if (h.state.xunKong || h.state.yuePo || SHUAI.has(h.state.lingTai)) add(-1, '伏神又休囚或空破，无人提携，短期内难以出现。', '《增删卜易·飞伏神章》');
    } else {
      add(-3, `全卦找不到${ysName}，也没有伏神可查——所问的这件事眼下在你生活里基本没有落点。古法：用神不现，事多不成，先收着劲、等它上卦（或换个时间再占）。`, '《增删卜易·用神章》');
    }
  } else if (yongOccs.length && !skipYongBody.has(domainId)) {
    const who = `${yn}（${esc(y.naJia)}，${pName(y)}${y.shi?'、持世':''}${y.ying?'、临应':''}）`;
    if (y.state.yuePo) add(-3, `${who}被月建相冲，叫「月破」——用神逢月破，如同东西碎了，眼下这件事的根基是坏的，纵有机会也难落实。`, '《增删卜易·月破章》');
    if (y.state.xunKong) {
      if (y.moving) add(-1, `${who}正逢旬空，但它发动了——古法「动不为空」，等到出空、填实的月日事情仍有转机，不是全空。`, '《增删卜易·旬空章》');
      else add(-2, `${who}逢「旬空」且安静不动——静而空多为真空，所问之事暂时落不到实处，出空（本旬过后）才见分晓。`, '《增删卜易·旬空章》');
    }
    if (WANG.has(y.state.lingTai)) add(2, `${who}得月令之气（${y.state.lingTai}于月），这是断卦最要紧的一条：用神旺，事情本身有底气、撑得住。`, '《增删卜易·四时旺相章》');
    else if (y.state.lingTai==='休') add(-1, `${who}月令休态，气不足，事能成也要多费周折。`, '《增删卜易·四时旺相章》');
    else if (SHUAI.has(y.state.lingTai)) add(-2, `${who}被月令${y.state.lingTai==='死'?'克（死于月）':'制（囚于月）'}——用神衰弱，事多力不从心。`, '《增删卜易·四时旺相章》');
    if (y.state.diWang) add(1, `${who}临帝旺，气最盛。`, '《增删卜易·生旺墓绝章》');
    if (y.state.changSheng) add(1, `${who}逢长生，事情像刚发芽，有后劲。`, '《增删卜易·生旺墓绝章》');
    if (y.state.ruMu) add(-1, `${who}逢入墓——如人进了屋，力量施展不开，冲墓之月日才有动静。`, '《增删卜易·生旺墓绝章》');
    if (y.state.fengJue) add(-1, `${who}逢绝地，气走到头了。`, '《增删卜易·生旺墓绝章》');
    if (y.state.yueHe || y.state.riHe) add(1, `${who}得${y.state.yueHe?'月建':''}${y.state.yueHe&&y.state.riHe?'、':''}${y.state.riHe?'日辰':''}来合，有外力拉一把、促成它。`, '《增删卜易·六合章》');
    if (y.state.anDong) add(1, `${who}是静爻被日辰冲、自身又旺，叫「暗动」——表面没动静，底下已经在变，事会自己起变化。`, '《增删卜易·暗动章》');
    if (y.state.riPo) add(-1, `${who}被日辰冲又衰，是「日破」，近期被冲散。`, '《增删卜易·日辰章》');
    if (y.moving) {
      if (y.state.huaTouSheng) add(2, `${who}发动，变出之爻反过来生它（回头生）——动中有人帮、越变越好。`, '《增删卜易·动变章》');
      if (y.state.huaTouKe) add(-2, `${who}发动却被变爻回头克——事情一动就出岔子、自己坏自己，动不如静。`, '《增删卜易·动变章》');
      if (y.state.huaJin) add(1, `${who}动化进神——势头往前奔，事在必行。`, '《增删卜易·进退章》');
      if (y.state.huaTui) add(-1, `${who}动化退神——看着要成，势头却在往后退。`, '《增删卜易·进退章》');
      if (y.state.fanYin) add(-1, `${who}动化反吟——反反复复、去而又来，事情折腾。`, '《增删卜易·反伏章》');
      if (y.state.fuYin) add(-1, `${who}动化伏吟——原地呻吟、停滞不动，有愁苦之象。`, '《增删卜易·反伏章》');
    }
  }

  // ---------- 二、用神与世爻（我）的关系（应爻为用/反用神域由专项块统算）----------
  if (an.shi && yongOccs.length && !ys.useYing && !skipYongBody.has(domainId)) {
    const st = an.shi.occ.state;
    const yz = y.yao.zhi, sz = an.shi.occ.yao.zhi;
    if (!y.shi && yz!==sz) {
      if (LIUHE[yz]===sz) add(2, `${yn}与世爻（你）相合——事来就你，顺。`, '《增删卜易·世应章》');
      else if (CHONG[yz]===sz) add(-1, `${yn}冲世爻——事情跟你顶着来，多冲击、变动。`, '《增删卜易·世应章》');
      else if (SHENG[y.state.wuXing]===st.wuXing) add(2, `${yn}来生世爻——事情主动来成就你（古法"用神生世，求谋易得"）。`, '《增删卜易·世应章》');
      else if (KE[y.state.wuXing]===st.wuXing) {
        if (domainId==='wealth' || domainId==='lost') add(1, `财爻克世——求财古法反以为喜：「财来克世，财来赶人」，钱/东西朝你来。`, '《增删卜易·求财章》');
        else add(-1, `${yn}来克世爻——事来压你，你比较被动吃力。`, '《增删卜易·世应章》');
      }
      else if (SHENG[st.wuXing]===y.state.wuXing) add(-1, `世爻去生${yn}——得你主动去追、去付出才够得着（"我去寻事"）。`, '《增删卜易·世应章》');
      else if (KE[st.wuXing]===y.state.wuXing) add(-1, `世爻去克${yn}——你跟这件事相克，硬拿两伤。`, '《增删卜易·世应章》');
    }
  }

  // ---------- 三、世爻自身（所有域通用：你自己的状态）----------
  if (an.shi) {
    const st = an.shi.occ.state;
    if (st.yuePo) add(-2, `世爻（你自己）月破，当下的状态、根基先坏了一截，宜守不宜攻。`, '《增删卜易·月破章》');
    if (st.xunKong) {
      if (an.shi.occ.moving) add(-1, `世爻旬空但发动，动不为空，出空便落实。`, '《增删卜易·旬空章》');
      else add(-2, `世爻逢旬空——你自己心里没底、劲使不上，事情容易落空。`, '《增删卜易·旬空章》');
    }
    // ① 用神持世时，"用神得月令之气"与"世爻相于月"是同一爻的同一个基础因素（月建旺衰），
    //    只保留用神侧（一、190/191/192），世爻侧不再重复计分。用神不持世时两者分属不同爻，照常各计。
    if (!yongIsShi && WANG.has(st.lingTai)) add(1, `世爻${st.lingTai}于月，你自己有底气、扛得住事。`, '《增删卜易·四时旺相章》');
    else if (!yongIsShi && SHUAI.has(st.lingTai)) add(-1, `世爻${st.lingTai}于月，你当下气弱，不宜强出头。`, '《增删卜易·四时旺相章》');
    // ③ 同一根发动爻既是用神又是世爻时，变爻回头克/生只成立一次：保留用神侧（一、201/202），
    //    世爻侧不再重复。用神不持世（不同爻）时两条独立，照常各计；health 走专项块，此处不干预。
    const htDup = yongIsShi && y.moving;
    if (!htDup && st.huaTouKe) add(-2, `世爻动化回头克——自己的动作反伤自己，最近别做大决策。`, '《增删卜易·动变章》');
    if (!htDup && st.huaTouSheng) add(1, `世爻动化回头生，行动有人帮、越动越顺。`, '《增删卜易·动变章》');
    if (st.huaJin) add(1, `世动化进神，你正处在往上走的势头。`, '《增删卜易·进退章》');
    if (st.huaTui) add(-1, `世动化退神，你自己正在打退堂鼓。`, '《增删卜易·进退章》');
    if (st.fanYin) add(-1, `世动化反吟，你这边反复摇摆。`, '《增删卜易·反伏章》');
    if (st.ruMu) add(-1, `世爻入墓，人被困住、施展不开。`, '《增删卜易·生旺墓绝章》', 'mu');
  }

  // ---------- 四、原神/忌神（求财等单一用神域；多用神与反用神域走专项）----------
  if (!ys.useYing && ys.yuanShen && ys.jiShen && yongOccs.length
      && !['career','health','decision','life','love'].includes(domainId)) {
    const yuanDong=movingList(an,ys.yuanShen), jiDong=movingList(an,ys.jiShen), chouDong=ys.chouShen?movingList(an,ys.chouShen):[];
    if (wangDong(yuanDong).length) add(2, `原神${ys.yuanShen}旺动来生用神——事情有源源不断的助力。`, '《增删卜易·元神忌神章》');
    else if (yuanDong.length) add(0, `原神${ys.yuanShen}虽动，但自身不旺或逢空破，助力使不全。`, '《增删卜易·元神忌神章》');
    if (wangDong(jiDong).length) add(-2, `忌神${ys.jiShen}旺动来克用神——阻力是真实而有力的，这是盘里最该防的一条。`, '《增删卜易·元神忌神章》');
    else if (jiDong.length) add(-1, `忌神${ys.jiShen}发动但不旺，有阻力但撑不久。`, '《增删卜易·元神忌神章》');
    if (wangDong(chouDong).length) add(-1, `仇神${ys.chouShen}又旺动去生忌神——阻力后面还跟着撑腰的，麻烦会连环。`, '《增删卜易·元神忌神章》');
    if (jiDong.some((o)=>o.state.huaTouKe||o.state.huaTui||o.state.fanYin||o.state.yuePo)) add(1, `好在忌神${ys.jiShen}动而化坏（回头克/化退/月破）——阻力自己出问题，挡不久。`, '《增删卜易·动变章》');
    if (yuanDong.some((o)=>o.state.huaTouKe||o.state.huaTui)) add(-1, `原神${ys.yuanShen}动而化坏——帮手使不上劲或中途退场。`, '《增删卜易·动变章》');
  }

  // ---------- 五、世应关系（合作/对方/地头/伴侣）----------
  // life 占的是自己一生，应爻不代表具体对象，加减无意义；
  // people 以应爻为用神，空破墓绝与生克全由行人专项块按"归信"口径断，避免重复。
  // ② 记录世应是否真共现相合/相冲，供爱情域与"本卦六合/六冲卦"去重（只有真共现才归并）。
  let shiYingHe = false, shiYingChong = false;
  if (an.shi && an.ying && domainId !== 'life' && domainId !== 'people') {
    const yz=an.shi.occ.yao.zhi, yz2=an.ying.occ.yao.zhi;
    const sw=an.shi.occ.state.wuXing, yw=an.ying.occ.state.wuXing;
    if (LIUHE[yz]===yz2) { shiYingHe = true; add(1, `世应相合——你和对方合得来、彼此接受。`, '《增删卜易·六合章》'); }
    else if (CHONG[yz]===yz2) {
      shiYingChong = true;
      const w = domainId==='love' ? -2 : -1;
      add(w, `世应相冲——你和对方/地头${domainId==='love'?'顶着来，占婚最忌相冲，主易散、易吵翻':'相冲，多冲突、变动'}。`, '《增删卜易·六冲章》', domainId==='love'?'liuhunhun':undefined);
    } else {
      if (SHENG[sw]===yw) add(1, `世爻生应爻——你愿意付出、迁就对方。`, '《增删卜易·世应章》');
      if (SHENG[yw]===sw) add(1, `应爻生世爻——对方/地头愿意成就你。`, '《增删卜易·世应章》');
      if (KE[sw]===yw) add(domainId==='decision'?1:0, `世爻克应爻——你占主动、压得住局面${domainId==='decision'?'（出行/合作古法看作"我去克他，所向通达"）':''}。`, '《增删卜易·世应章》', domainId==='decision'?'shiyingke':undefined);
      if (KE[yw]===sw) add(-1, `应爻克世爻——对方/地头压你一头，你被动吃力${domainId==='decision'?'，古法明言"应克世，公私皆主不利"':''}。`, '《增删卜易·世应章》', domainId==='decision'?'shiyingke':undefined);
    }
    const yst=an.ying.occ.state;
    if (yst.xunKong) add(-1, `应爻逢旬空——对方那边还没定、心里没底或人不实在，事情悬着。`, '《增删卜易·旬空章》');
    if (yst.yuePo) add(-1, `应爻月破——对方/地头的根基有亏。`, '《增删卜易·月破章》');
    if (yst.huaTui) add(-1, `应爻动化退神——对方在往后缩、要变卦。`, '《增删卜易·进退章》');
  }

  const zisunDong=movingList(an,'子孙'), xiongdiDong=movingList(an,'兄弟'),
        guanguiDong=movingList(an,'官鬼'), fumuDong=movingList(an,'父母'), qicaiDong=movingList(an,'妻财');

  // ---------- 六、各现代问事域专项 ----------
  if (domainId==='wealth') {
    if (xiongdiDong.length) {
      if (zisunDong.length) add(1, `兄弟虽动（分钱、竞争、成本），但子孙同动——兄生子、子生财，古法认为这反而是源远流长的大生意、厚利。`, '《增删卜易·求财章》','xiongdong');
      else add(-1, `兄弟发动而无子孙通关——劫财之神当道，主分利、破耗、竞争，这笔钱容易被分走、花出去或赚得很辛苦。`, '《增删卜易·求财章》','xiongdong');
    }
    if (wangDong(zisunDong).length) add(1, `子孙旺动，财源有根——客户、产品、流量、技能这些"生钱的东西"在发力。`, '《增删卜易·求财章》','caishenghui');
    if (fumuDong.length && !qicaiDong.length) add(-1, `父母爻独动克子孙——传统认为伤财源（文书、手续、平台规则拖累了生财的根）。`, '《增删卜易·求财章》');
  }

  if (domainId==='career') {
    if (an.shi && an.shi.occ.liuQin==='子孙' && (an.shi.occ.moving || WANG.has(an.shi.occ.state.lingTai)))
      add(-2, `子孙持世——占工作考试最忌这个：子孙是"剥官之神"，主与编制、考核、管束无缘，或你心里其实抗拒这份差事。`, '《卜筮正宗·求名章》','zisunzhiguan');
    else if (wangDong(zisunDong).length) add(-2, `子孙旺动，克伤官星——升迁、录取、审批的传统大忌，机会容易被推翻（也常应在政策变动、名额取消）。`, '《卜筮正宗·求名章》','zisunzhiguan');
    const guanHao=wangDong(guanguiDong).length, fuHao=wangDong(fumuDong).length;
    if (guanHao && fuHao) add(2, `官星（职位）与父母（文书/考卷/合同）双双旺动相生——功名的正路格局：有名额、有文书、有靠山，古法主成名。`, '《增删卜易·终身功名有无章》','guanfu');
    else if (guanHao) add(1, `官星旺动——职位、上级、考核的能量在动，偏有机会（再看父母文书是否跟得上）。`, '《增删卜易·终身功名有无章》');
    else if (fuHao && !guanHao) add(0, `父母旺而官星不动——文书、考试、准备是足的，但职位/结果这一环还没动，像是"备好了等机会"。`, '《增删卜易·学业章》');
    // 考试特重父母爻（成绩文章）
    const fumuAll = an.byLiuQin['父母']||[];
    if (fumuAll.some((o)=>o.state.xunKong||o.state.yuePo)) add(-1, `父母爻（考卷、成绩、通知）逢空破——文书环节容易出问题：漏通知、材料出错、成绩延迟。`, '《增删卜易·学业章》');
  }

  if (domainId==='love') {
    if (pan.gender!=='女' && wangDong(xiongdiDong).length) add(-1, `兄弟旺动——男占感情为劫财之象，主竞争者、情敌，或朋友、同辈作梗。`, '《增删卜易·婚姻章》');
    if (pan.gender==='女' && wangDong(zisunDong).length) add(-1, `子孙旺动——女占克官，对男方/婚姻不利，或主自由、子女、个人发展之事绊住感情。`, '《增删卜易·婚姻章》');
    const ben=guaName(pan.benGua), bian=guaName(pan.bianGua);
    // ② 六冲卦与世应相冲是同一"离散"事实的两种表述，真共现时只计世应相冲（-2），卦象不再重复扣。
    //    六合卦同理：只有世应真相合时才归并（六合卦里火地晋/山雷颐/地泽临 世应既不合也不冲，其 +1 独立保留）。
    //    313/314 描述的是"变卦走向"，与世应、本卦卦象都不是同一因素，一律照常计分。
    if (LIU_CHONG_GUA.includes(ben) && !shiYingChong) add(-1, `本卦是六冲卦，占婚最忌，主易散、易吵翻。`, '《增删卜易·婚姻章》','liuhunhun');
    if (LIU_HE_GUA.includes(ben) && !shiYingHe) add(1, `本卦是六合卦，占婚最宜，主易合、关系黏得住。`, '《增删卜易·婚姻章》','liuhunhun');
    if (pan.bianGua) {
      if (LIU_CHONG_GUA.includes(ben)&&LIU_HE_GUA.includes(bian)) add(2, `六冲变六合——眼下不成、先吵先难，日后反而成，别太早放弃。`, '《增删卜易·婚姻章》','liuhunhun');
      if (LIU_HE_GUA.includes(ben)&&LIU_CHONG_GUA.includes(bian)) add(-2, `六合变六冲——现在再好，往后也会生变，古法叫"始亲终疏"。`, '《增删卜易·婚姻章》','liuhunhun');
    }
  }

  if (domainId==='health') {
    // 自占病：世=病人，官鬼=病，子孙=药/医生
    const guiAll=an.byLiuQin['官鬼']||[];
    const ziAll=an.byLiuQin['子孙']||[];
    const guiDong=guanguiDong, ziDong=zisunDong;
    if (an.shi) {
      const st=an.shi.occ.state;
      // 近病逢空逢冲
      if (st.xunKong) add(1, `世爻逢旬空——若是新得的急病，古法主"不药而愈"；若是多年久病，逢空反为凶险。请先分清新久。`, '《增删卜易·疾病章》');
      if (an.shi.occ.moving && st.huaTouKe) add(-2, `世爻动化回头克、或化官鬼——自占病这是最险的信号之一，古法主张速治、别拖。`, '《增删卜易·疾病章》');
      if (an.shi.occ.moving && st.huaTouSheng) add(1, `世爻动化回头生，得生得救。`, '《增删卜易·疾病章》');
    }
    if (an.shi && an.shi.occ.liuQin==='官鬼') add(-2, `官鬼持世——病/忧缠身之象，病症正压在自己身上。`, '《增删卜易·疾病章》');
    else if (wangDong(guiDong).length) add(-2, `官鬼旺动——病症正在发作、势头重（鬼为病）；再看有没有子孙来制。`, '《增删卜易·疾病章》');
    else if (guiAll.some((o)=>o.state.xunKong||o.state.yuePo) || (!guiDong.length && guiAll.every((o)=>SHUAI.has(o.state.lingTai))))
      add(1, `官鬼安静或空破——病势没力气，多为虚惊、小病。`, '《增删卜易·疾病章》');
    if (an.shi && an.shi.occ.liuQin==='子孙') add(2, `子孙持世——药与解忧之神在你身上，古法主不拘新久，服药即安。`, '《增删卜易·疾病章》','zisunjieyou');
    else if (wangDong(ziDong).length) add(2, `子孙旺动——药/医生有力，能制住病，古法"但得子孙乘旺动，飞殃横祸化为尘"。`, '《增删卜易·延医章》','zisunjieyou');
    else if (ziDong.some((o)=>o.state.huaTouKe||o.state.huaTui)) add(-1, `子孙动而化坏——药不对路、治疗反复或医生使不上劲。`, '《增删卜易·延医章》');
    if (an.ying) {
      const yst=an.ying.occ.state;
      if (yst.xunKong||yst.yuePo||yst.ruMu||yst.fengJue) add(-1, `应爻（医生/医院）空破墓绝——古法主"药不见效"，这个治疗方案或医生不太得力，宜换。`, '《增删卜易·延医章》');
      else if (ziAll.some((o)=>o.ying)) add(1, `子孙临应爻——古法谓之"明医"，这个医生/这味药对症。`, '《增删卜易·延医章》');
    }
    if (an.shi && an.shi.occ.liuQin==='父母' && !ziDong.length) add(-1, `父母持世而卦无子孙——古法云"父持世妙药难调"，药物一时难建功，宜静养、息气恼远色欲，从生活方式调。`, '《增删卜易·延医章》');
  }

  if (domainId==='decision') {
    // 抉择/出行/合作/防患：世旺宜行、子动消灾、鬼动有患、应空落空
    if (wangDong(zisunDong).length) add(2, `子孙旺动——百祸潜消的信号，出行、合作、动手都逢凶有化。`, '《增删卜易·出行章》','zisunjieyou');
    if (wangDong(guanguiDong).length) {
      add(-2, `官鬼旺动——主盗贼、风波、疾病、是非一类的实患，行程宜缓、合作宜查、这事宜避。`, '《增删卜易·出行章》');
      if (an.shi) {
        const guiKeShi=guanguiDong.some((o)=>KE[o.state.wuXing]===an.shi.occ.state.wuXing);
        if (guiKeShi) add(-1, `而且这官鬼正冲克世爻——所防的事会真的冲你来，必须主动趋避（古法趋避的价值就在这里）。`, '《增删卜易·趋避章》','guihui');
      }
    }
    if (an.shi && an.shi.occ.liuQin==='子孙') add(1, `子孙持世，无往不利的静底气。`, '《增删卜易·趋避章》');
  }

  if (domainId==='life') {
    // 一生大势：看世爻临何六亲、旺衰、财官父何旺来生世
    if (an.shi) {
      const qin=an.shi.occ.liuQin;
      const CHI={
        官鬼:'官鬼持世事难安——一生压力与责任重，占身"不病也遭官"，但也主在体制、功名、专业权威上有位置，是"背着东西往上走"的命。',
        父母:'父母持世主身劳——一生靠文书、学问、资格、靠山立身，操心劳碌，易得长辈/平台荫庇。',
        妻财:'财爻持世益财荣——一生与资源、经营、现实利益贴得近，求财相对顺手；最忌兄弟交重劫夺。',
        子孙:'子孙持世事无忧——一生重自由、兴趣、儿孙与清福，不喜受人管；占功名则不宜走仕途。',
        兄弟:'兄弟持世莫求财——一生重朋友义气、合作分利，钱财易聚易散，靠合伙与同辈成事也受累于此。',
      };
      add(0, CHI[qin], '《卜筮正宗·诸爻持世诀》');
    }
    // 财官何旺定一生偏向
    const caiWang=(an.byLiuQin['妻财']||[]).some((o)=>WANG.has(o.state.lingTai));
    const guanWang=(an.byLiuQin['官鬼']||[]).some((o)=>WANG.has(o.state.lingTai));
    const ziWang=(an.byLiuQin['子孙']||[]).some((o)=>WANG.has(o.state.lingTai));
    if (caiWang) add(1, `财爻旺相——一生的资源线（财、经营、物质）相对厚。`, '《卜筮正宗·身命》');
    if (guanWang) add(1, `官鬼旺相——一生的功名线（地位、责任、专业影响力）有支撑，也主操劳。`, '《卜筮正宗·身命》');
    if (ziWang) add(1, `子孙旺相——福德有根，一生有解忧、自得的福气与后辈缘。`, '《卜筮正宗·身命》');
    const liuQinKong=['妻财','官鬼','父母','兄弟','子孙'].filter((q)=>(an.byLiuQin[q]||[]).some((o)=>o.state.xunKong||o.state.yuePo));
    if (liuQinKong.length) add(-1, `${liuQinKong.join('、')}逢空破——这一生在这几类事上容易有缺口或大起大落（空则不着力）。`, '《卜筮正宗·身命》');
  }

  if (domainId==='people') {
    // 行人/消息：以应为用（至亲引擎里取了六亲，这里也适用）
    if (y) {
      if (y.state.anDong) add(2, `用神（人/消息）暗动——已经在路上、背地里已经有动作，近期会有信。`, '《增删卜易·行人章》');
      if (y.moving && y.state.huaTui) add(1, `用神动化退神——行人往回走、事情往你这边来。`, '《增删卜易·行人章》');
      if (y.moving && y.state.huaJin) add(-1, `用神动化进神——人还在往外走，归期未到。`, '《增删卜易·行人章》');
      if (y.state.ruMu||y.state.fengJue||y.state.xunKong||y.state.yuePo) add(-2, `用神墓绝空破——古法"归信杳然"，人/消息一时半会儿回不来；若问在外平安，这叫用神"有病"，需要挂念。`, '《增删卜易·行人章》');
      if (y.state.huaTouKe) add(-2, `用神动化回头克——在外有阻、有灾或回程出变故。`, '《增删卜易·行人章》');
    }
    if (an.shi && y && !y.hidden) {
      const sw=an.shi.occ.state.wuXing, yw=y.state.wuXing;
      const yz=y.yao.zhi, sz=an.shi.occ.yao.zhi;
      if (KE[sw]===yw) add(-1, `世爻克用神——古法"世克用兮人未动"，对方还没有动身/回复的打算。`, '《增删卜易·行人章》');
      if (KE[yw]===sw) add(2, `用神来克世——古法"用爻克世必然归"，近日就有消息/人到。`, '《增删卜易·行人章》');
      if (LIUHE[yz]===sz) add(-1, `用神逢合——被事绊住了，想回回不来。`, '《增删卜易·行人章》');
    }
    if (an.shi && an.shi.occ.state.xunKong) add(1, `世爻空——古法"世爻空者行人即至"，等待反而快要结束。`, '《增删卜易·行人章》');
    const ben=guaName(pan.benGua);
    if (LIU_CHONG_GUA.includes(ben)) add(-1, `六冲卦——古法视六冲为行踪不定的信号。此为单一卦象提示，须结合用神、旺衰及其他判据综合参看，不宜单独据此断定归期或在外安危。`, '《增删卜易·行人章》');
  }

  if (domainId==='lost') {
    // 失物：财为物，官鬼玄武为贼
    const guiDong=guanguiDong;
    if (guiDong.length) {
      const xuanwu=guiDong.some((o)=>o.liuShen==='玄武');
      add(-1, `官鬼${xuanwu?'临玄武':''}发动——多为人为窃走、冒领、暗中侵占，不是自己遗失${xuanwu?'（玄武主暗昧偷盗）':''}，宜尽快报、追、查。`, '《卜筮正宗·黄金策·失脱》');
      if (an.shi && guiDong.some((o)=>KE[o.state.wuXing]===an.shi.occ.state.wuXing)) add(-1, `鬼来克世，追讨过程会伤到你（硬碰有风险），宜借规则/平台/官方之力。`, '《卜筮正宗·黄金策·失脱》');
    } else {
      add(1, `卦中官鬼不兴——多半不是被偷，是自己遗忘、放错，东西还在。`, '《卜筮正宗·黄金策·失脱》');
    }
    if (y) {
      if (y.state.xunKong) add(-2, `财爻（失物）逢空——自空化空，古法"置而不问"，找回希望小。`, '《卜筮正宗·黄金策·失脱》');
      else if (y.state.ruMu) add(-1, `财爻入墓——东西被深深盖住、藏起，"财深藏而不见"，要等冲开墓库才有线索。`, '《卜筮正宗·黄金策·失脱》');
      else if (!y.moving && y.shi) add(2, `财爻安静持世——"静临世上，物尚在而何妨"，东西没丢，就在你身边/家里，仔细找。`, '《卜筮正宗·黄金策·失脱》');
      else if (WANG.has(y.state.lingTai)) add(1, `财爻旺相未散——东西还没被销赃/毁坏，抓紧找能寻回。`, '《卜筮正宗·黄金策·失脱》');
      else if (SHUAI.has(y.state.lingTai)) add(-1, `财爻休囚——东西已被转移、耗散，追回难度大。`, '《卜筮正宗·黄金策·失脱》');
      // 方位提示（内/外卦）
      if (y.pos<=3) add(0, `财在内卦本宫——往家里、办公室、常用的近处翻找。`, '《卜筮正宗·黄金策·失脱》');
      else add(0, `财在外卦他宫——东西在外面、别处、邻里或途经之地，往那个方向问。`, '《卜筮正宗·黄金策·失脱》');
      if (y.hidden && y.hiddenUnder) add(0, `财伏在「${esc(y.hiddenUnder)}」之下——被这类东西盖住：伏父母在文书、箱柜、包里；伏子孙在儿童、宠物、娱乐处；伏官鬼在暗处、被人扣下。`, '《卜筮正宗·黄金策·失脱》');
    }
    if (wangDong(zisunDong).length) add(1, `子孙旺动制鬼——盗占者/赖账者会被制住，报警、申诉、追讨有用。`, '《卜筮正宗·黄金策·失脱》');
    if (xiongdiDong.length) add(-1, `兄弟交重劫财——东西已被分散转手，起赃、全额追回较难。`, '《卜筮正宗·黄金策·失脱》');
  }

  // ---------- 七、定档 ----------
  let level = score>=4?2: score>=1?1: score<=-4?-2: score<=-1?-1:0;
  const HEAD={
    2:'吉：倾向「能成」，而且助力实',
    1:'小吉：倾向「可成」，但有条件、要顺着来',
    0:'平：吉凶不明显，重在人为选择、等时机',
    [-1]:'小凶：倾向「难成或反复」，宜缓、宜守',
    [-2]:'凶：眼下倾向「不成 / 有实阻」，宜避、宜等',
  };
  const TAKE={
    wealth:{2:'这钱/这单买卖卦象支持你推进：财有力、又来生合你，是「财来就我」。大胆接，同时避开忌神点出的具体风险即可。',
      1:'可以争取，但不是躺赢：财有气，却要你主动凑条件。宜小步快走、落袋为安，别把杠杆加满。',
      0:'财象不显，进与守差别不大。这时候最值钱的动作是等——等财爻临值、或财源发动的时间窗再出手。',
      [-1]:'求财费劲：有分利、竞争或时机不对的象。宜收缩，别投大钱、别担保，守住已有现金。',
      [-2]:'这一卦明确不支持现在求财：财空破或忌神旺动，投入容易被套、被骗、被分走。先停手，等换月出空后再重新看。'},
    career:{2:'正路格局：职位、文书、你自己都有力，求职/升迁/考试可以全力推进，该报名报名、该谈就谈。',
      1:'有机会但还缺一环（文书、名额或状态）。把缺的补上再动，别裸辞、别硬冲。',
      0:'盘面没给明显的「上」或「下」。适合做准备、攒作品、修关系，不宜在此时押注式变动。',
      [-1]:'阻力大于助力：要么自己状态空落，要么有明显的克制因素。宜隐忍、保住现有位置，别在此时翻脸或跳。',
      [-2]:'这一卦对求名不利：官星受重伤或剥官之神当道，强动自取其辱。宜守成、避开考核风险，等下一个时间窗。'},
    love:{2:'两情相得、财官旺相生合之象：该表白表白、该联系联系、该谈婚嫁就谈，势头是成的。',
      1:'倾向能成，但要靠一方主动或等一个契机。别急逼，顺着生合的方向走。',
      0:'关系处在可进可退的中性地带，卦没替你做决定——这时候人的选择比象更重要。',
      [-1]:'有冲、有退、对方不旺：容易吵、容易凉、容易一方退缩。宜降速、给空间，别在情绪头上做决裂决定。',
      [-2]:'难合之象：用神空破、世应相冲或六冲当家。先放下执念、保全自己；若是六冲变六合，机缘在日后，不在当下。'},
    health:{2:'医药有力、病势被制：子孙持世或旺动，古法主不拘新久，治疗对路、可以安心。',
      1:'病势可控、有解，坚持正确治疗、作息配合即可；不必恐慌。',
      0:'病象不重不轻，卦给的信息有限。规律作息、遵医嘱，别自己吓自己。',
      [-1]:'要当回事：有化坏、医生方不得力或世爻受克的信号。宜尽快复查、换个治疗方案或更积极处理，别拖。',
      [-2]:'这一卦示险：病神旺动克身、或世动化克。古法的态度不是吓你，而是催你立刻认真就医、抓住治疗窗口，同时把该安排的事安排好。'},
    decision:{2:'世旺有扶、福神护持：这一步可以迈出去，去、签、动，整体顺。',
      1:'总体可行，小有周折，备好应变、避开点出的坑就行。',
      0:'行止两可，没有明显的凶也没有明显的助力，按现实条件权衡即可。',
      [-1]:'自身气弱或对方/地头不靠谱：宜改期、降低承诺、留后手，别把自己放进点出的那类场景。',
      [-2]:'不宜动：世空破、应受伤或官鬼旺动克身。古法"空亡宜止"——这一步取消或推迟，躲过去不丢人，这正是占卜的用处。'},
    life:{2:'世爻得地、财官福有神助：这一生的底盘是往上走的，顺着旺的那条线（财/官/福）去立身。',
      1:'总体是能立得住的命，有明确的助力来源，也有要修的短板，扬长即可。',
      0:'一生起伏靠人为：旺衰不偏，选择与努力就是这张盘的主旋律。',
      [-1]:'命里有明显吃力的一两类事（空破所在），一生要在这些地方多费心、早做准备；避开硬扛。',
      [-2]:'这张盘世爻受克较重、助力少——古法给这种盘的建议从来不是认输，而是降低欲求、守成蓄力、把身体和安全放在第一位，等大运转好。'},
    people:{2:'归象明确：用神来就你或暗动，人/消息很快就有下文，近期等得到。',
      1:'会有消息，但要稍等或经人中转，不用太催。',
      0:'卦象中性，何时回来不明显，按正常节奏联络即可。',
      [-1]:'一时半会儿回不来：人未动、被绊住或在外面有事；若问平安，多联系、确认状态。',
      [-2]:'归信杳然或在外有阻（用神空破化克）：短期等不到，要有长期打算，必要时求助能直接联系到他的渠道。'},
    lost:{2:'东西能找回：多为遗忘在近处，财静持世"物尚在"，马上按提示方位翻找。',
      1:'找回希望较大，东西还没散，抓紧时间、按内外卦方位去找或追问经手人。',
      0:'线索不明确，一半在人一半在天，立刻固定监控、聊天记录等证据再说。',
      [-1]:'追回有难度：东西已被转移或有人为侵占，靠自己难，尽早走平台、报警、正式申诉。',
      [-2]:'找回希望小：财空或入墓、兄弟劫夺。当务之急是止损（挂失、改密码、冻结），把损失降到最低，再谈追回。'},
  };

  // ---------- 八、时间窗（固定规则，只给方向）----------
  let timing=null;
  if (yongOccs.length && !skipYongBody.has(domainId)) {
    const o=y;
    if (!o.hidden) {
      const z=o.yao.zhi;
      if (o.state.xunKong) timing=`关键点在「出空」之后——本旬过后，到${esc(z)}日、${esc(z)}月填实之时见分晓。`;
      else if (o.state.yuePo) timing=`出月（过了${monthZhi}月）破而复合，到${esc(CHONG[z]||'')}月或${esc(z)}月才谈得上成。`;
      else if (o.state.ruMu) timing=`用神入墓，冲开墓库（${MU[o.state.wuXing]||''}月/日附近）事情才有实质进展。`;
      else if (o.moving && o.state.huaJin) timing=`动化进神，应在加速——${esc(z)}月/日前后势头最明。`;
      else if (SHUAI.has(o.state.lingTai) && !o.moving) timing=`用神静而衰，宜等它旺起来的月份（${o.state.wuXing}当令之月）。`;
    } else {
      timing='伏神待引：冲去飞神、或它临值的月日，事情才露头。';
    }
  }
  if (!timing && domainId==='people' && y && y.state && (y.state.xunKong||y.state.ruMu||y.state.yuePo)) {
    timing='人/消息应在「冲空、冲墓、实破」的月日有信。';
  }

  // 同一条规则在多条信号里出现时，只在第一条下展示完整「原文+白话」，
  // 其余只保留书名字签，避免同一段古文反复刷屏。
  const seenRule = new Set();
  for (const g of signals) {
    if (g.rule) {
      if (seenRule.has(g.rule.id)) { g.ruleRepeat = true; }
      else seenRule.add(g.rule.id);
    }
  }

  return { level, headline:HEAD[level], takeaway:(TAKE[domainId]&&TAKE[domainId][level])||TAKE.decision[level],
    signals: signals.sort((a,b)=>Math.abs(b.w)-Math.abs(a.w)), timing, ysName, score,
    domainName: dom.name, dongCount: an.dong.length };
}

/** 渲染结论卡到 #verdict-body */
export function renderVerdict(pan, domainId) {
  const host=$('#verdict-body');
  if (!host) return;
  if (!pan||!pan.benGua||!pan.benGua.name){ host.innerHTML=''; return; }
  let v;
  try { v=judgeNajia(pan,domainId); } catch(e){ host.innerHTML=''; return; }
  const lc=v.level>=1?'vd-good':v.level<=-1?'vd-bad':'vd-mid';
  const mark=v.level===2?'大吉倾向':v.level===1?'吉倾向':v.level===0?'平':v.level===-1?'谨慎':'宜避';
  const icon=v.level>=1?'✓':v.level<=-1?'！':'～';
  host.innerHTML=`
    <div class="vd-card glass-card ${lc}">
      <div class="vd-head">
        <span class="vd-kicker">古法直断 · ${esc(v.domainName)}</span>
        <span class="vd-badge vd-badge-${lc}">${icon} ${mark}</span>
      </div>
      <div class="vd-headline">${esc(v.headline)}</div>
      <div class="vd-takeaway">${esc(v.takeaway)}</div>
      ${v.timing?`<div class="vd-timing"><span class="vd-timing-k">什么时候有分晓？</span>${esc(v.timing)}</div>`:''}
      <details class="vd-why" open>
        <summary>为什么这么断？（${v.signals.length} 条盘象，每条都引古法原文）</summary>
        <div class="vd-chain-note">断法三步：先看<b>这一卦的事实</b> → 再引<b>古法规则原文</b>判断成立与否 → 最后落到<b>对你这事的断语</b>。不是挑一句卦辞硬套。</div>
        <ol class="vd-signals">
          ${v.signals.map((g)=>{
            const r = g.rule;
            const ruleBlock = r && !g.ruleRepeat ? `
              <div class="vd-rule">
                <div class="vd-rule-gu">「${esc(r.gu)}」<cite>${esc(r.book)}</cite></div>
                <div class="vd-rule-hua">${esc(r.hua)}</div>
              </div>` : (r ? `<div class="vd-rule-rep">规则同上 · ${esc(r.book)}</div>` : `<div class="vd-rule-rep">${esc(g.src)}</div>`);
            return `<li class="vd-sig ${g.w>0?'is-plus':g.w<0?'is-minus':'is-zero'}">
              <div class="vd-sig-line"><span class="vd-sig-mark">${g.w>0?'＋':g.w<0?'－':'·'}</span><span class="vd-sig-txt">${esc(g.text)}</span></div>
              ${ruleBlock}
            </li>`;
          }).join('')}
        </ol>
        <div class="vd-disclaimer">每条结论都由「盘象事实 → 古法规则 → 断语」推出，规则写死自《增删卜易》（清·野鹤老人）《卜筮正宗》（清·王洪绪），不是 AI 现编；引文不能逐字确证处从阙、只述要旨，不冒充原文。
          卦象给倾向，人事在人为——${v.level>=1?'吉卦别浪，点出的坑照样要避。':v.level<=-1?'凶卦的用处是让你提前躲开，不是吓你。':'平卦时，你的选择就是结果。'}</div>
      </details>
    </div>`;
}

document.addEventListener('qintian:reading-domain',(e)=>{
  if (current.pan) renderVerdict(current.pan,e.detail);
});
