// 历史塔罗牌组四副（钦天监·世界占卜典籍库 · 历史原版真图系列）
// 图源：Wikimedia Commons 公有领域原版扫描，经 mixvlad/TarotCards GitHub 仓库获取，
//       720px 版统一缩放至高 880px、JPEG q82，逐张校验完整性。
// 文件级溯源：assets/cards-hist-manifest.json（每张卡的 Commons 源文件名与授权页）。
// 大牌序映射：马赛传统 VIII=正义、XI=力量（与韦特相反），本页按「牌面语义」映射到韦特
//       牌义体系（正义牌→major-11-justice、力量牌→major-08-strength），并在牌组说明中声明。
// 牌义判词：全部沿用 Waite 1910 现代对照（与索拉·布斯卡同法），非各原版年代语境，特此声明。
// v105：四副历史牌组开启逆位——牌义判词本为 Waite 1910 现代对照，逆位义同源映射；
// 历史原版年代早于逆位读法传统（18 世纪 Etteilla 之后），分层声明、不冒充原版语境。
import { getDeck, registerDeck } from '../vendor/liuyao-core.js?v=125';

let registered = false;

// 各副大牌法语名 → 韦特义位对照（用于牌组首页的源流注记）
const HIST_DEFS = [
  {
    id: 'marseille',
    dir: './assets/cards-marseille/',
    name: '马赛塔罗 Tarot de Marseille',
    era: '17–18 世纪·巴黎/瑞士各木刻版',
    cardCount: 78,
    author: '佚名（多雕版师承袭的共同图式）',
    license: 'Public Domain（PD-old；Wikimedia Commons 扫描）',
    description: '所有现代塔罗的直系祖先。木刻线条加 stencil 上色的工艺风：小牌只画花色符号排列、不画场景（韦特之前的通行做法）。大牌为马赛历史序：VIII 正义、XI 力量。',
    source: '经典马赛塔罗（Tarot de Marseille）原版扫描，Public Domain，经 Wikimedia Commons 获取（mixvlad/TarotCards 仓库 720px 版，压缩至高 880px）。大牌序为历史序（VIII=正义、XI=力量），与韦特相反；本页按牌面语义映射到韦特义位。牌义判词为 Waite 1910 现代对照。文件级溯源见 assets/cards-hist-manifest.json。',
  },
  {
    id: 'vieville',
    dir: './assets/cards-vieville/',
    name: '维埃维尔塔罗 Tarot de Viéville',
    era: '约 1650·巴黎',
    cardCount: 78,
    author: 'Jacques Viéville（巴黎牌商）',
    license: 'Public Domain（PD-old；巴黎国立图书馆藏）',
    description: '现存最早的完整巴黎系塔罗之一（约 1650）。图式比马赛更古拙：愚人被狗追、月亮下两工匠。大牌序又是另一套老序（VII 正义、IX 力量）。',
    source: '维埃维尔塔罗（约 1650，巴黎）原版扫描，Public Domain，经 Wikimedia Commons 获取。其大牌序为巴黎老序（VII=正义、IX=力量、XI=隐士），本页按牌面语义映射到韦特义位。牌义判词为 Waite 1910 现代对照。文件级溯源见 assets/cards-hist-manifest.json。',
  },
  {
    id: 'visconti',
    dir: './assets/cards-visconti/',
    name: '维斯康提-斯福尔扎塔罗 Visconti-Sforza',
    era: '约 1450–1470·米兰',
    cardCount: 73,
    author: 'Bonifacio Bembo 等（米兰宫廷画师）',
    license: 'Public Domain（PD-old；Pierpont Morgan 图书馆等多馆藏）',
    description: '世上最古老的塔罗牌组之一，米兰公爵婚礼级手绘金卡。存世 73 张：恶魔、塔、钱币骑士、宝剑三、圣杯国王已佚（本副抽牌池相应少 5 张，成阵照常）。',
    source: '维斯康提-斯福尔扎塔罗（约 1450–1470，米兰，Bembo）AGMuller 复刻版扫描（David Madore 2003），Public Domain。存世 73 张（恶魔/塔/钱币骑士/宝剑三佚失），抽牌池少 4 张。牌义判词为 Waite 1910 现代对照，非 15 世纪宫廷语境。文件级溯源见 assets/cards-hist-manifest.json。',
  },
  {
    id: 'wirth',
    dir: './assets/cards-wirth/',
    name: '奥斯瓦尔德·维尔塔罗 Oswald Wirth',
    era: '1889·巴黎',
    cardCount: 22,
    author: 'Oswald Wirth（绘）／Stanislas de Guaita（指导）',
    license: 'Public Domain（PD-old）',
    description: '玫瑰十字会神秘学复刻马赛：1889 年维尔只画 22 张大牌、线条承马赛而图式带卡巴拉意图，是「神秘学塔罗」的先声（早韦特二十年）。本副仅大牌 22 张，抽牌池亦仅大牌。',
    source: '奥斯瓦尔德·维尔塔罗（1889，巴黎，Le Tarot des imagiers du moyen-âge 前身）22 张大牌原版，Public Domain。仅大牌，抽牌池仅 22 张。牌义判词为 Waite 1910 现代对照。文件级溯源见 assets/cards-hist-manifest.json。',
  },
];

export function ensureHistDecks() {
  if (registered) return;
  const rws = getDeck('rws');
  for (const def of HIST_DEFS) {
    const cards = rws.cards
      .filter((c) => (def.cardCount === 22 ? c.id.startsWith('major-') : true))
      .filter((c) => !(def.id === 'visconti' &&
        ['major-15-devil', 'major-16-tower', 'cups-king', 'pentacles-knight', 'swords-03'].includes(c.id)))
      .map((c) => ({ ...c, image: `${def.dir}${c.id}.jpg` }));
    registerDeck({
      id: def.id,
      name: def.name,
      kind: 'tarot',
      cardCount: cards.length,
      author: def.author,
      license: def.license,
      source: def.source,
      description: def.description,
      allowsReversal: true,
      builtin: false,
      cards,
    });
  }
  registered = true;
}
