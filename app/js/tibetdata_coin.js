// 敦煌古藏文金钱神课 · PT 1055（伯希和劫经，巴黎BnF）＋ IOL Tib J 744（斯坦因劫经，伦敦BL）
// 二者本为同卷，被伯希和/斯坦因撕裂分藏两馆。敦煌藏经洞，约9–10世纪。
// 首行：「金钱神课，王法本者：卦字单，母字本……」——以8枚铜钱符号＋卦数演64卦。
// 据 OTDO 公开转写（otdo.aa-ken.jp/archives?p=Pt_1055 / p=ITJ_0744）整理。
// 学术依据：王尧·陈践《敦煌吐蕃文献选辑·文化卷》(1987/2011) 收 PT1055 金钱神课；
// Brandon Dotson, 'Divination and Law in the Tibetan Empire'（2007）指出其以8符号配卦数演64卦，
// 与骰占 ITJ740 同属一套64繇卦系（64卦在8世纪已为藏人所知）。
// 故不硬造原卷残缺的12类细分判词；卦繇与骰占62繇通用，另以「总断」给出该卦倾向。

export const COIN_SOURCE = {
  ms: 'Pelliot tibétain 1055（1–66行）＋ IOL Tib J 744（续卷）',
  lib: 'PT1055 藏巴黎法国国家图书馆；ITJ744 藏英国国家图书馆（原同卷撕裂分藏）',
  date: '约9–10世纪（敦煌藏经洞出土）',
  otdo: 'otdo.aa-ken.jp/archives?p=Pt_1055 ， p=ITJ_0744',
  refs: '王尧·陈践《敦煌吐蕃文献选辑·文化卷·P.T.1055 金钱神课》；Dotson (2007,2019)',
  note: '汉名「金钱神课」「王法本」，以8枚铜钱符号演卦。学者认为其受汉地《易经》六十四卦与金钱卜影响（出现孔子 Kong-rtse、鬼王 Ki-wang 等汉地名号），是汉藏占卜合流的实物。'
};

// 8枚铜钱符号（藏文名据PT1055转写；象征与身份参王尧·陈践整理，原卷未明者标"原卷未详"）
// tone: 该符号在繇辞中的常倾向 +吉 -凶 ~平；仅作总断倾向，非逐卦定论。
export const COIN_MARKS = [
  { key: 'dbyar', wylie: 'dbyar zla', zh: '夏月（夏卦）', mark: '夏', tone: '+',
    mean: '夏、生长、滋茂之象', note: '原卷列为铜钱符号之一，属四时卦。' },
  { key: 'dgun', wylie: 'dgun zla', zh: '冬月（冬卦）', mark: '冬', tone: '~',
    mean: '冬、闭藏、伏隐之象', note: '四时卦之一。' },
  { key: 'dmu', wylie: 'dmu skar', zh: 'dmu 天星（天卦）', mark: '天', tone: '+',
    mean: '天绳、天星，天神降世与上升之径', note: '苯教 dmu 绳为天地交通。' },
  { key: 'g.yu', wylie: 'g.yu dang / g.yu phran', zh: '松石（玉卦）', mark: '玉', tone: '+',
    mean: '绿松石，藏地最上珍宝，辟邪吉祥', note: '繇中多见"松石用金镶"。' },
  { key: 'srang', wylie: 'srang / gser srang', zh: '金两（金卦）', mark: '金', tone: '+',
    mean: '称量之金两，财货之象', note: '与汉地金钱卜"金"名相应。' },
  { key: 'phye', wylie: 'phye zhu', zh: 'phye 帛（帛卦）', mark: '帛', tone: '~',
    mean: '绢帛、衣货，原卷字形或释为"丝/帛"', note: '名物释义学界尚有异说，从王尧·陈践。' },
  { key: 'kong', wylie: 'kong rtse', zh: '孔子（孔夫子卦）', mark: '孔', tone: '+',
    mean: '汉地先圣，原卷尊为占卜之祖、智慧之神', note: '藏文文献中的孔子形象已苯教化/神化。' },
  { key: 'ki', wylie: 'ki wang／shing rta rgyab kyi ki wang', zh: '鬼王（车后鬼王卦）', mark: '鬼', tone: '-',
    mean: '鬼王，主丧亡、惊恐、耗损之象', note: '原卷车后之 Ki-wang，或与汉地"鬼王/魍魉"观念有关。' }
];

// 卦数说明（原卷以卦数配8符号演64卦）
export const COIN_RULE = {
  title: '金钱神课演卦法',
  body: [
    '原卷首行称「金钱神课，王法本者」，以 8 枚铜钱符号（夏、冬、天、玉、金、帛、孔、鬼）配「卦数」推演，合为 8×8＝64 卦。',
    '每卦繇辞按占问门类分述：寿命、行人、谋事（事功）、疾病、客人（来使）、财物、邪魔 gdon、梦魇、敌寇、家事、口舌、失畜走失等（各卦条目数量不一，部分残损）。',
    '据 Dotson(2007) 与王尧·陈践考证，这套 64 卦与骰占 ITJ740 同属一个卦繇体系——64 卦之制 8 世纪已为吐蕃所知，且明显受汉地《周易》六十四卦与掷钱起卦影响。',
    '原卷细分门类判词多有残缺，本典籍库不作臆补；起卦后调取同卦骰占繇辞与总断，以呈现古法倾向。要查某一卦门类的原卷原文，可依手稿行号核 PT1055/ITJ744 转写。'
  ]
};

// 8符号两两成卦→总断倾向（仅给组合的古典倾向，取铜钱繇常见吉凶；不冒充逐字原卷）
// 用 8 进制式 a-b（1..8）映射骰占四值不便，故独立给一个 8×8 倾向表；
// 为避免逐格硬造64条，采用"符号 tone 相加"机械规则，并在 view 明示其为倾向提示。
export function coinTonePair(a, b) {
  const ta = COIN_MARKS[a - 1].tone, tb = COIN_MARKS[b - 1].tone;
  if (ta === '+' && tb === '+') return { lvl: 'g', zh: '大吉' };
  if (ta === '-' && tb === '-') return { lvl: 'b', zh: '凶' };
  if (ta === '+' || tb === '+') return { lvl: 'g', zh: '小吉' };
  if (ta === '-' || tb === '-') return { lvl: 'b', zh: '小凶' };
  return { lvl: 'n', zh: '平' };
}
