// yangzhai-jinsuo.js — 金锁玉关砂水断 + 三合十二长生水法（阳宅两派并列卡）
// 金锁玉关（过路阴阳）：二十四山归洛书宫，「一二三四要砂、六七八九要水」，
//   见砂得砂吉、见水得水吉，错位则凶。典籍：《金锁玉关》经文（清抄本，邵伟华整理本通行）。
// 三合水法：以坐山定三合局，从长生位起十二长生排二十四山，
//   「生旺方来水吉、墓绝方去水吉、沐浴方来水桃花」。典籍：赵九峰《地理五诀》（清乾隆十六年 1751）。
// 纯函数、不接 AI；流派与八宅/玄空并列，断语分歧不合成。

import { PALACES, MOUNTAINS_24, MOUNTAIN_PALACE, mountainsAt } from '../../vendor/bazhai-core.js?v=124';

const PALACE_BY_KEY = new Map(PALACES.map((p) => [p.key, p]));

const JINSUO_SOURCES = {
  gang: { t: '《金锁玉关》', q: '总纲：「一二三四要砂，六七八九要水」；二十四山挨星诀逐山断砂水吉凶，清代抄本、现代整理本通行' },
};

const SANHE_SOURCES = {
  wujue: { t: '《地理五诀》', q: '赵九峰（乾隆十六年 1751）卷二论水法：「生来会旺，发福悠长；旺去迎生，富贵双全」「墓库收藏，滚滚财源」；卷四十二水口断法' },
  cimu: { t: '《催官篇》', q: '赖文俊（宋）——三合长生水法之源流之一，后世水法多本此与《五诀》' },
};

/** 洛书宫要砂还是要水：1/2/3/4 要砂，6/7/8/9 要水 */
function wantShaOf(luoshu) {
  if ([1, 2, 3, 4].includes(luoshu)) return true;
  if ([6, 7, 8, 9].includes(luoshu)) return false;
  return null; // 中宫五
}

/** 金锁玉关：坐向砂水判
 * @param {number} facingDeg 朝向罗盘度数（0=北顺时针） */
export function judgeJinsuo({ facingDeg }) {
  if (!Number.isFinite(facingDeg)) throw new Error('缺少坐向');
  const { chao, zuo } = mountainsAt(facingDeg);
  const rowOf = (m) => {
    const pk = MOUNTAIN_PALACE.get(m);
    const p = PALACE_BY_KEY.get(pk);
    return { mountain: m, palace: p.name, dir: p.dir, luoshu: p.luoshu, wantSha: wantShaOf(p.luoshu) };
  };
  const zuoRow = rowOf(zuo);
  const chaoRow = rowOf(chao);
  // 「坐实朝空」：坐方要砂、向方要水为合局
  const sitGood = zuoRow.wantSha === true;   // 坐宫要砂 → 坐方有实（山/高楼）为吉
  const faceGood = chaoRow.wantSha === false; // 向宫要水 → 向方空（明堂/水/开阔）为吉
  const verdicts = [];
  if (sitGood && faceGood) {
    verdicts.push({
      title: '坐实朝空 · 合金锁局',
      tone: 'good',
      body: `坐${zuoRow.palace}宫（洛书${zuoRow.luoshu}，要砂）而向${chaoRow.palace}宫（洛书${chaoRow.luoshu}，要水）：背有实靠、面前虚空，正合「一二三四要砂、六七八九要水」的取用。`,
      advice: '保持坐后高实（楼、山、柜）、向首开阔低平（明堂、水面、空地）即可。',
      src: JINSUO_SOURCES.gang,
    });
  } else if (sitGood !== faceGood) {
    const bad = sitGood ? '向' : '坐';
    verdicts.push({
      title: `${bad}方错位 · 半合半破`,
      tone: 'warn',
      body: `坐${zuoRow.palace}宫要${zuoRow.wantSha ? '砂' : '水'}、向${chaoRow.palace}宫要${chaoRow.wantSha ? '砂' : '水'}，${bad}方与金锁取用相背，砂水易错位。`,
      advice: `重点补${bad}方：${bad === '向' ? '向首宜低平见水（明堂/空地），忌高大闭塞' : '坐后宜有高实之砂，忌低洼见水' }。`,
      src: JINSUO_SOURCES.gang,
    });
  } else {
    verdicts.push({
      title: '颠倒砂水 · 金锁所忌',
      tone: 'bad',
      body: `坐${zuoRow.palace}宫（要${zuoRow.wantSha ? '砂' : '水'}）而向${chaoRow.palace}宫（要${chaoRow.wantSha ? '砂' : '水'}），两方均与「一二三四要砂、六七八九要水」相反，为颠山倒水之局。`,
      advice: '金锁一派视此局为砂水颠倒；实务上可对照八宅、玄空两卡综合权衡，或以门窗布置补救（高柜补砂、明堂留空补水）。',
      src: JINSUO_SOURCES.gang,
    });
  }
  const table = MOUNTAINS_24.map((m) => {
    const pk = MOUNTAIN_PALACE.get(m);
    const p = PALACE_BY_KEY.get(pk);
    return { mountain: m, palace: p.name, luoshu: p.luoshu, wantSha: wantShaOf(p.luoshu) };
  });
  return { chao: chaoRow, zuo: zuoRow, verdicts, table };
}

/* ---------------- 三合十二长生水法 ---------------- */

// 四局三合：申子辰水局（长生申）、寅午戌火局（长生寅）、巳酉丑金局（长生巳）、亥卯未木局（长生亥）
const BUREAUS = [
  { name: '水局', branches: ['申', '子', '辰'], changsheng: '申' },
  { name: '火局', branches: ['寅', '午', '戌'], changsheng: '寅' },
  { name: '金局', branches: ['巳', '酉', '丑'], changsheng: '巳' },
  { name: '木局', branches: ['亥', '卯', '未'], changsheng: '亥' },
];

// 地支山定局（三合派以坐山地支入局；四维乾坤艮巽随兼向地支）
const ZHI_BUREAU = {
  子: 0, 申: 0, 辰: 0,
  寅: 1, 午: 1, 戌: 1,
  巳: 2, 酉: 2, 丑: 2,
  亥: 3, 卯: 3, 未: 3,
};

// 十二长生序
const STAGES = ['长生', '沐浴', '冠带', '临官', '帝旺', '衰', '病', '死', '墓', '绝', '胎', '养'];

/** 地支顺时针序（长生于四生山，阳顺阴逆；三合阳局一律顺布为通行简法） */
const ZHI_ORDER = ['子', '丑', '寅', '卯', '辰', '巳', '午', '未', '申', '酉', '戌', '亥'];

export function judgeSanheWater({ facingDeg }) {
  if (!Number.isFinite(facingDeg)) throw new Error('缺少坐向');
  const { zuo } = mountainsAt(facingDeg);
  // 坐山定局：地支直接定；四维（乾坤艮巽）取后一山地支（艮→寅、巽→巳、坤→申、乾→亥）
  const SIWEI = { 艮: '寅', 巽: '巳', 坤: '申', 乾: '亥' };
  const zhi = ZHI_BUREAU[zuo] != null ? zuo : SIWEI[zuo];
  const bIdx = ZHI_BUREAU[zhi];
  if (bIdx == null) throw new Error('坐山无法定三合局');
  const bureau = BUREAUS[bIdx];
  // 从长生山顺排十二长生（每阶段跨一个地支山）
  const csIdx = ZHI_ORDER.indexOf(bureau.changsheng);
  const cycle = STAGES.map((stage, i) => {
    const m = ZHI_ORDER[(csIdx + i) % 12];
    return { stage, mountain: m };
  });
  const byStage = Object.fromEntries(cycle.map((c) => [c.stage, c.mountain]));
  const verdicts = [
    {
      title: `${bureau.name} · 生旺来水`,
      tone: 'good',
      body: `坐${zuo}入${bureau.name}（${bureau.branches.join('')}三合），长生在${bureau.changsheng}、临官在${byStage['临官']}、帝旺在${byStage['帝旺']}。此三方来水（或开门见活水）为「生来会旺」。`,
      advice: `来水/动线宜自${bureau.changsheng}、${byStage['临官']}、${byStage['帝旺']}方来；水口（去水）宜出${byStage['墓']}（墓库）或${byStage['绝']}（绝位），谓「墓库收藏」。`,
      src: SANHE_SOURCES.wujue,
    },
    {
      title: '沐浴桃花水',
      tone: 'warn',
      body: `沐浴位在${byStage['沐浴']}。此方来水，三合派谓「桃花水」——主情缘纷扰、酒色耗散。`,
      advice: `${byStage['沐浴']}方不宜见动水（喷泉、鱼缸冲门、长流水）；静水或无水不论。`,
      src: SANHE_SOURCES.wujue,
    },
    {
      title: '绝方去水 · 冲破',
      tone: 'bad',
      body: `绝位在${byStage['绝']}、死位在${byStage['死']}。来水冲绝（自绝方逆来）或去水冲生（从${bureau.changsheng}方流出）为大忌，谓「冲生」「冲旺」。`,
      advice: `去水忌自${bureau.changsheng}（长生）、${byStage['帝旺']}（帝旺）方流出——旺气随水走。城市无真水时以大路、动线视之。`,
      src: SANHE_SOURCES.wujue,
    },
  ];
  return { zuo, bureau, cycle, verdicts };
}

export const JINSUO_NOTE = '金锁玉关又称「过路阴阳」，以洛书宫定砂水：一（坎北）、二（坤西南）、三（震东）、四（巽东南）四宫要砂（高实之物），六（乾西北）、七（兑西）、八（艮东北）、九（离南）四宫要水（低洼流动之物），中五不论。断法只看二十四山方位上「实为砂、虚为水」的分布，与宅主命卦无关。本卡按总纲与坐向合局直断；逐山细断（如「亥山一四砂」类经文）未逐条展开，取舍在人。';
export const SANHE_NOTE = '三合水法以坐山地支定三合局（申子辰水、寅午戌火、巳酉丑金、亥卯未木），从长生位起十二长生顺布十二地支山。核心口诀：「生来会旺，发福悠长；旺去迎生，富贵双全」——生旺方来水、墓绝方去水为吉；沐浴来水为桃花，冲生冲旺为大忌。城市住宅以大路、街道、动线代水视之。四维山（乾坤艮巽）随兼向地支入局，本页按通行简法取生方地支（艮→寅、巽→巳、坤→申、乾→亥）。';
