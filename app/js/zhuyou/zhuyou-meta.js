// 符箓祝由 · 元数据模型 + 处境分类 + 文献底本表（v94）
// 钦天监铁律：纯本地 / 只展示原典已有、不生成新符不编咒 / 文献事实与灵验宣称严格分层 / 每条可复核出处。
// 本文件只放"骨架与受控词表"，具体条目在 zhuyou-data.js。

// ───────────── 受控词表（枚举） ─────────────

// 证据等级：依文献权威性与学界断代
export const EVIDENCE = {
  HIGH:   { k: 'HIGH',   t: '高可信', d: '成书年代与性质有学界共识、底本可靠（医家经典/正统道藏/出土原件）' },
  MEDIUM: { k: 'MEDIUM', t: '中可信', d: '文献价值确凿但有托名/汇编/正统性争议（元明以后民间坊本）' },
  LOW:    { k: 'LOW',    t: '低可信', d: '来源混杂、断代不清或为后世拼装，仅作民俗样本，不作正统依据' },
};

// 三态标注：该条目"能复原到什么程度"
export const STATE = {
  THEORY:  { k: 'THEORY',  t: '理论说明', d: '只有原理/名相记载，无法复原操作' },
  RITUAL:  { k: 'RITUAL',  t: '仪式描述', d: '有仪式/符式的描述性记载，但步骤不完整，不能照做' },
  REPRO:   { k: 'REPRO',   t: '可复现流程', d: '原典有相对完整的步骤序列（仅作文献复原展示，不鼓励实操）' },
};

// 材料性质分类
export const NATURE = {
  MEDICAL: '医家祝由',
  DAOIST:  '道教科仪',
  FOLK:    '民间坊本',
  EXCAVA:  '出土文献',
};

// 传承资格（传统上所需）
export const LINEAGE = {
  LU:       { k: 'LU',      t: '授箓法师' },
  CHUANDU:  { k: 'CHUANDU', t: '传度道士' },
  FOLK:     { k: 'FOLK',    t: '民间术者' },
  COMMON:   { k: 'COMMON',  t: '通用（无资格门槛记载）' },
  UNKNOWN:  { k: 'UNKNOWN', t: '不详' },
};

// 施符方式（原典所载）
export const APPLY = ['贴', '佩', '焚', '服（吞符/服灰）', '压藏', '烧化', '镇', '书于身/物', '虚书（意念空书）'];

// ───────────── 处境反查分类（贴合传统文献自身名目，不用现代心理标签） ─────────────
// 综合《千金翼方·禁经》16 类 + 《圣济总录·符禁门》22 篇 + 《祝由十三科》13 科合并
export const SITUATIONS = [
  { id: 'zonggang',name: '受禁持法·总纲', subs: ['斋戒', '受法', '掌诀', '禁法大例'], risk: false },
  { id: 'anzhen',  name: '安镇',     subs: ['镇宅', '安龙奠土', '安床', '安镇十方'], risk: false },
  { id: 'bixie',   name: '辟邪',     subs: ['驱鬼缚鬼', '辟瘟斩邪', '禁鬼魅'], risk: false },
  { id: 'bibing',  name: '辟兵护身', subs: ['避兵凶', '入山护身', '渡海涉险'], risk: false },
  { id: 'yuanxing',name: '远行',     subs: ['出行择日', '涉江渡海', '急出不择日'], risk: false },
  { id: 'liaobing',name: '疗病',     subs: ['伤寒痰喘', '疟疾', '瘟疫时气', '蛊毒'], risk: true },
  { id: 'zhixue',  name: '止血疗伤', subs: ['金疮', '止血', '续筋骨'], risk: true },
  { id: 'cuisheng',name: '催生',     subs: ['难产', '胎衣不下', '安胎'], risk: true },
  { id: 'xiaoer',  name: '小儿',     subs: ['夜啼', '夜惊', '疳疾'], risk: true },
  { id: 'yanmu',   name: '眼目',     subs: ['眼病', '时疫眼'], risk: true },
  { id: 'kouchi',  name: '口齿咽喉', subs: ['牙痛', '骨鲠', '喉痹'], risk: true },
  { id: 'chuangzhong', name: '疮肿', subs: ['恶疮', '癞疥', '无名肿毒'], risk: true },
  { id: 'jinchong',name: '禁虫兽',   subs: ['蛇蝎', '虎狼', '犬咬', '蜂虿'], risk: true },
  { id: 'qingyu',  name: '求晴雨',   subs: ['祈雨', '祈晴', '止风散云'], risk: false },
  { id: 'quhuang', name: '驱蝗',     subs: ['蝗灾', '驱虫害'], risk: false },
  { id: 'sangzang',name: '丧葬',     subs: ['镇墓', '解注', '炼度'], risk: false },
  { id: 'qita',    name: '其他书禁', subs: ['镇邪书禁', '杂禁', '和合'], risk: false },
];

// ───────────── 一道符的四段结构（道教学界共识，据《道法会元》《上清灵宝大法》） ─────────────
export const FU_PARTS = [
  { id: 'tou', name: '符头（符座）', desc: '上部/左部，代表请召对象：三清、雷令、三台星、雨字头、鬼字头等。' },
  { id: 'fu',  name: '符腹（符身）', desc: '中部主体：秘字、星相、云气、神真讳字等的排布。' },
  { id: 'qiao',name: '符窍（符胆）', desc: '最紧要处，符的"灵力所系"，常见罡、井、马、化等秘字组合；入符胆即请祖师镇座。' },
  { id: 'jiao',name: '符脚（符尾）', desc: '下部/右部收尾：律令、敕、急、奉行等，聚精会神一气立断。' },
];

// ───────────── 文献底本表（学术断代 + 版权 + 可信等级） ─────────────
export const SOURCES = {
  neijing_suwen: {
    title: '黄帝内经·素问·移精变气论', nature: NATURE.MEDICAL, era: '战国—西汉成书',
    evidence: 'HIGH', publicDomain: true,
    note: '"古之治病，惟其移精变气，可祝由而已。"王冰注"祝说病由"——本义为以言语开导、解析病由、安定情志的上古疗法，不涉符箓鬼神。',
  },
  neijing_lingshu: {
    title: '黄帝内经·灵枢·贼风', nature: NATURE.MEDICAL, era: '战国—西汉成书',
    evidence: 'HIGH', publicDomain: true,
    note: '"先巫者，因知百病之胜，先知其病之所从生者，可祝而已也。"同属调神疏导；经文明示"贼风虚邪，内至五脏骨髓，祝由不能已"。',
  },
  wushier: {
    title: '马王堆帛书·五十二病方（附杂禁方）', nature: NATURE.EXCAVA, era: '西汉初（前168年入葬）',
    evidence: 'HIGH', publicDomain: true,
    note: '现存最早禁咒治病实物文献。与禁咒相关方剂约38种，含汤药送符最早记载（羊臀汤送符治蛊）；《杂禁方》专记禁咒。',
  },
  qianjin_jinjing: {
    title: '千金翼方·禁经（卷二十九—三十）', nature: NATURE.MEDICAL, era: '唐·孙思邈（约682）',
    evidence: 'HIGH', publicDomain: true,
    note: '医籍中对禁咒之术的第一次系统整理。上下两卷22篇、约24000字、16类禁法；记咒语、禹步、掌诀三要素。来源民间祝由为主、道禁为辅、少量佛教色彩。孙思邈持"实录保存而非信仰认同"态度。最权威整理本：人民卫生出版社影印本。',
  },
  waitai: {
    title: '外台秘要', nature: NATURE.MEDICAL, era: '唐·王焘（752）',
    evidence: 'HIGH', publicDomain: true,
    note: '40卷收方6000余，咒禁符印仅25条（约0.4%），反映唐代主流医学对咒禁已趋冷淡。',
  },
  shengji_fujin: {
    title: '圣济总录·符禁门（卷195—197）', nature: NATURE.MEDICAL, era: '北宋政和敕撰（约1111—1117）',
    evidence: 'HIGH', publicDomain: true,
    note: '22篇禁咒法、收符箓300余道、六万余字、引书11种；《千金翼方·禁经》内容几乎全被收录，多符取自《灵宝方》。官方医书收符禁的最高峰。',
  },
  zhubing: {
    title: '诸病源候论', nature: NATURE.MEDICAL, era: '隋·巢元方（610）',
    evidence: 'HIGH', publicDomain: true,
    note: '收录大量祝由内容，将导引祝由与针灸等并列为治疗方法。',
  },
  daofa: {
    title: '道法会元（268卷）', nature: NATURE.DAOIST, era: '元末明初集成',
    evidence: 'HIGH', publicDomain: true,
    note: '正统道藏正一部，最大符箓法术总集，收宋元各派（清微/神霄/天心/酆都/正一）法术150余篇。卷109论"窍"为机要；含神将谱系、符式、咒诀、存思、科仪与传度谱系。',
  },
  lingbao_dafa: {
    title: '上清灵宝大法（66卷）', nature: NATURE.DAOIST, era: '南宋·甯全真授、王契真编',
    evidence: 'HIGH', publicDomain: true,
    note: '正一部27门，含符箓结构分解实例（如《玉曹仙伯追魂符》以三台露为符头、急速奉行为符脚），是学术可引的拆符范本。',
  },
  dongyuan: {
    title: '太上洞渊神咒经', nature: NATURE.DAOIST, era: '东晋末刘宋初（403—420起）',
    evidence: 'HIGH', publicDomain: true,
    note: '敦煌唐写本十卷/道藏二十卷本（前十卷六朝古本，后十卷中晚唐增补）。含誓魔、遣鬼、缚鬼、杀鬼、禁鬼、斩鬼诸品及制鬼符箓。早期天师道符水禁咒代表。',
  },
  taiping: {
    title: '太平经（含复文、神祝文诀）', nature: NATURE.DAOIST, era: '东汉（约1—2世纪）',
    evidence: 'HIGH', publicDomain: true,
    note: '《兴上除害复文》等四篇复文为原始道符结集；《神祝文诀》第75论咒语治病，称咒为"天上神本文"，须正呼神名。',
  },
  baopu: {
    title: '抱朴子内篇·遐览', nature: NATURE.DAOIST, era: '东晋·葛洪（约317—370）',
    evidence: 'HIGH', publicDomain: true,
    note: '最早道教符箓著录目录，载晋代大符600余卷及数十符名（三皇文、五岳真形图最受重）。"符出于老君，皆天文也。"',
  },
  lu: {
    title: '太上三五正一盟威箓（6卷）', nature: NATURE.DAOIST, era: '正一道授箓文献',
    evidence: 'HIGH', publicDomain: true,
    note: '授箓制度核心文献。箓为神将名册，受箓后方可行符箓法术——符箓与授箓/科仪资格绑定的直接文献依据。',
  },
  dunhuang: {
    title: '敦煌医药写卷（P./S.编号）', nature: NATURE.EXCAVA, era: '隋唐五代抄本',
    evidence: 'HIGH', publicDomain: true,
    note: 'P.2661v《诸杂略得要抄子》、P.3835v+S.2615v《大部禁方》、P.2666v《单药方残卷》、S.1307、P.3236 等，含小儿夜啼/夜惊、催产、脐下书"贵"字等，巫医并行、针对妇儿急症、咒药并用。',
  },
  zhuyou13: {
    title: '轩辕碑记医学祝由十三科', nature: NATURE.FOLK, era: '托名黄帝·实成于元明以后',
    evidence: 'MEDIUM', publicDomain: true,
    note: '民间祝由代表坊本。序中"宋淳熙戊申"系年代误读，"掘碑得书"为典型托名叙事；十三科仿元明太医院分科，内容多取自《灵宝领教济度金书》。以"尚"为符将、"食"为符兵。版本：明末清初钞本、空青洞天藏板刊本、《藏外道书》第26册（有版权）。文献价值有，正统性不足。',
  },
  wanfa: {
    title: '万法归宗', nature: NATURE.FOLK, era: '明清民间坊刻',
    evidence: 'LOW', publicDomain: true,
    note: '民间法术汇编，混杂道教科仪、民间巫术与数术，非正统道教传承，仅作民俗样本。',
  },
};

// 辨伪三层层级（金栋框架）
export const PSEUDO_LAYERS = [
  { layer: 1, name: '《内经》之"祝由"', core: '移精变气、言语疏导、调神开导', basis: '《素问·移精变气论》《灵枢·贼风》', era: '战国—西汉' },
  { layer: 2, name: '后世之"祝由术"', core: '符箓、禁咒、存思、驱禳仪式', basis: '《千金翼方·禁经》以下', era: '隋唐以后' },
  { layer: 3, name: '民间之"祝由科"', core: '托名黄帝、融道符与民间巫术', basis: '《祝由十三科》等坊本', era: '元明以后' },
];

// 官制时间锚点（断代用：隋咒禁博士→唐咒禁师→宋金镞兼书禁→元祝由书禁科→明祝由科→清废）
export const OFFICE_ANCHORS = [
  { era: '隋', office: '太医署咒禁博士' },
  { era: '唐', office: '太医署咒禁师/咒禁科' },
  { era: '宋', office: '太医局金镞兼书禁科' },
  { era: '元', office: '太医院祝由书禁科（"祝由科"名始此）' },
  { era: '明', office: '太医院祝由科' },
  { era: '清', office: '太医院废除祝由科，官方传承中断' },
];
