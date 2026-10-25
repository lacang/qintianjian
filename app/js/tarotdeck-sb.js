// Sola Busca 塔罗牌组（1491，米兰，Brera 美术馆藏全套 78 张真图）
// 图源：Wikimedia Commons「Sola-Busca tarot deck」Public Domain（1491 年，PD-old），
// 经 mixvlad/TarotCards GitHub 仓库获取的 Commons 原图（474×877，无重压缩），逐张校验 JPEG 完整性。
// 与 RWS 同文件名一一对应（内容映射），manifest 见 assets/cards-sb/manifest.json。
// 大阿卡纳对应依 Di Vincenzo/Berti 学术研究：星=4 Mario、正义=8 Nerone、倒吊人=14 Bocho、
// 力量=15 Metelo、太阳=16 Olivo、恶魔=17 Ipeo、隐士=18 Lentulo、塔=20 Nenbroto；
// 学术未定 5 张（Postumio→女祭司、Lenpio→皇后、Falco→皇帝、Tulio→审判、Sabino→教皇）按位置序+研究界推测分配，manifest 标注「推测」。
// 1491 年原版无逆位传统（逆位系统为 18 世纪 Etteilla 之后），故本牌组关闭逆位。
import { getDeck, registerDeck } from '../vendor/liuyao-core.js?v=118';

const SB_DIR = './assets/cards-sb/';

// 大阿卡纳 SB 源流注记：id → [SB人物名, 对应依据]
const SB_MAJOR_NOTES = {
  'major-00-fool': ['Mato', '学界公认为愚者'],
  'major-01-magician': ['Panfilio', 'Bagatto/魔术师（学术鉴定）'],
  'major-02-priestess': ['Postumio', '推测：C 序位置 2＝女祭司'],
  'major-03-empress': ['Lenpio', '推测：C 序位置 3＝皇后'],
  'major-04-emperor': ['Falco', '推测：论坛研究 Chess-King＝皇帝'],
  'major-05-hierophant': ['Sabino', '推测：剩余分配 Papa/教皇'],
  'major-06-lovers': ['Sesto', '学术：Amore/恋人（持火炬）'],
  'major-07-chariot': ['Deo Tauro', '确定：Carro/战车，位置一致'],
  'major-08-strength': ['Metelo', '学术：Fortezza/力量持柱（RWS 序 8）'],
  'major-09-hermit': ['Lentulo', '学术：Tempo-Eremita/隐士'],
  'major-10-wheel': ['Venturio', '确定：Fortuna/命运之轮，位置一致'],
  'major-11-justice': ['Nerone', '确定：Giustizia/正义（RWS 序 11）'],
  'major-12-hanged': ['Bocho', '确定：Traditore/倒吊人'],
  'major-13-death': ['Catone', '确定：Morte/死神，位置一致'],
  'major-14-temperance': ['Catulo', '学术：Temperanza/节制（持 groma）'],
  'major-15-devil': ['Ipeo', '学术：Diavolo/恶魔'],
  'major-16-tower': ['Nenbroto', '确定：Sagitta/箭＝塔，天火焚城'],
  'major-17-star': ['Mario', '确定：Stelle/星（Di Vincenzo）'],
  'major-18-moon': ['Carbone', '确定：Luna/月亮'],
  'major-19-sun': ['Olivo', '确定：Sol/太阳'],
  'major-20-judgement': ['Tulio', '推测：举火炬仰视如 Angelo/审判'],
  'major-21-world': ['Nabuchodenasor', '确定：Mondo/世界，位置一致'],
};

let registered = false;

export function ensureSolaBusca() {
  if (registered) return;
  const rws = getDeck('rws');
  const cards = rws.cards.map((c) => ({
    ...c,
    image: `${SB_DIR}${c.id}.jpg`,
    sbNote: SB_MAJOR_NOTES[c.id] || null,
  }));
  registerDeck({
    id: 'sb',
    name: '索拉·布斯卡塔罗（1491）',
    kind: 'tarot',
    cardCount: 78,
    author: '佚名（米兰，1491 年制）',
    license: 'Public Domain（1491 年，PD-old；Brera 美术馆藏全套）',
    source: '牌面为 1491 年 Sola Busca 塔罗全套原版真图（Wikimedia Commons，PD），经 GitHub TarotCards 仓库获取的 Commons 原图，逐张校验；文件级溯源见 assets/cards-sb/manifest.json。其王牌序列与现代塔罗不同，此 deck 按 Di Vincenzo/Berti 学术研究做内容映射（如 major-19-sun.jpg 放 Olivo 太阳图）；学术未定 5 张按位置序推测分配。牌义判词仍为 Waite 1910 现代对照，非 1491 年原始语境，特此声明。',
    description: '现存最古老完整塔罗（1491，米兰）。78 张文艺复兴真图，木质雕版风。1491 原版早于逆位读法传统，逆位义为 Waite 1910 现代对照，分层声明。',
    allowsReversal: true,
    builtin: false,
    cards,
  });
  registered = true;
}
