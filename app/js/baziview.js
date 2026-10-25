// 八字本命视图：指定出生时刻 四柱十神/藏干（本中余气）/纳音/五行分布 + 大运（只排事实，不做断语）
import { tenGod } from '../vendor/liuyao-core.js?v=117';
import { paiBaziZi, ziMode } from './zischool.js?v=117';
import { judgeBazi, verdictCardHtml } from './verdicts.js?v=117';
import { birthArgs, cfg, pad } from './state.js?v=117';
import { GAN_WX, QI_WEIGHT, wxKey } from './classical.js?v=117';
// 元素对照：十神 / 纳音 的含义 key
const BZ_GOD_KEY = { 比肩:'bz-god-bijian', 劫财:'bz-god-jiecai', 食神:'bz-god-shishen', 伤官:'bz-god-shangguan',
  偏财:'bz-god-piancai', 正财:'bz-god-zhengcai', 七杀:'bz-god-qisha', 正官:'bz-god-zhengguan',
  偏印:'bz-god-pianyin', 正印:'bz-god-zhengyin' };

import { guideHTML, T } from './tipview.js?v=117';
import { gateHTML, stage, foldVerdict, isCasted } from './ritual.js?v=117';

const POS = ['year', 'month', 'day', 'time'];
const TITLE = { year: '年柱', month: '月柱', day: '日柱', time: '时柱' };

/* 十神五分类配色：比劫/印星/食伤/财星/官杀（只分类上色，不分吉凶） */
const TEN_GOD_CAT = {
  比肩: 'bi', 劫财: 'bi',
  正印: 'yin', 偏印: 'yin',
  食神: 'shi', 伤官: 'shi',
  正财: 'cai', 偏财: 'cai',
  正官: 'guan', 七杀: 'guan',
};
const tgCat = (t) => TEN_GOD_CAT[t] || '';

let cache = null;
let cacheKey = '';
function getBazi() {
  const a = birthArgs();
  const key = `${a.year}-${a.month}-${a.day}-${a.hour}-${a.minute}-${a.gender}-${cfg.lateZi || '23'}`;
  if (!cache || cacheKey !== key) {
    cache = paiBaziZi({
      year: a.year, month: a.month, day: a.day,
      hour: a.hour, minute: a.minute, gender: a.gender,
    });
    cacheKey = key;
  }
  return cache;
}

function birthText() {
  const a = birthArgs();
  return `${a.year}-${pad(a.month)}-${pad(a.day)} ${pad(a.hour)}:${pad(a.minute)}`;
}

/* 五行力量（展示近似）：天干记满分，地支藏干按本/中/余气 60/30/10 拆，归一化为百分比 */
function wuxingBars(bz) {
  const total = { 金: 0, 木: 0, 水: 0, 火: 0, 土: 0 };
  POS.forEach((k) => {
    const p = bz[k];
    total[p.ganWuXing] += 100;
    p.hidden.forEach((h) => { total[GAN_WX[h.gan]] += QI_WEIGHT[h.role] ?? 30; });
  });
  const sum = Object.values(total).reduce((a, b) => a + b, 0) || 1;
  return ['金', '木', '水', '火', '土'].map((wx) => ({
    wx, v: total[wx], pct: Math.round((total[wx] / sum) * 100),
  }));
}

const BZ_GUIDE = {
  title: '怎么看这一盘',
  intro: '八字把出生的年、月、日、时各排成一组干支，共八个字，以日干（日主）为中心。 本盘每一个十神、藏干、纳音都可以点开——卡里会告诉你它是什么、代表什么。',
  steps: [
    { t: '四根柱子＝年、月、日、时', d: '从左到右是年柱、月柱、日柱、时柱。每根柱子上面是地支、下面是天干，再往下是藏干和纳音。', tip: 'sizhu', sel: '.bazi-grid' },
    { t: '发亮的那根是「日柱」', d: '日柱的天干叫「日主」，代表本人，是整张盘的坐标原点——其他七个字都是相对它来说的。这张盘日主是己土。', tip: 'tiangan', sel: '.bz-col.day' },
    { t: '柱子顶部的小字＝十神', d: '「正官」「食神」「伤官」这类叫十神，就是拿每个字去和日主比，得出的关系名称。', tip: 'shishen', sel: '.bz-col .bz-god' },
    { t: '地支下面藏着的字＝藏干', d: '每个地支里暗藏一到三个天干（本气／中气／余气），是这一支的「内涵成分」，右边标的是它对日主的关系。', tip: 'canggan', sel: '.bz-col .bz-hide' },
    { t: '五行分布条＝全盘五行有多少', d: '把八个字加藏干一起按五行计数，点某一行会把含该五行的柱子高亮出来。', tip: 'wuxing', sel: '.wx-bars' },
    { t: '最下面＝大运', d: '每十年换一步大运，是人生的大阶段。高亮的那一格就是现在走的这一步。', tip: 'dayun', sel: '.dayun-row' },
  ],
  note: '盘上只列传统体系里的通行含义与古籍出处，不替你下断语；吉凶倾向一律标为「古籍所载」，供你自己衡量。',
};

export function renderBazi() {
  if (!isCasted('bazi')) return gateHTML('bazi');
  const bz = getBazi();
  const nowYear = new Date().getFullYear();

  const cols = POS.map((k) => {
    const p = bz[k];
    const wxList = Array.from(new Set([p.ganWuXing, ...p.hidden.map((h) => GAN_WX[h.gan])]));
    const hide = p.hidden.map((h) => `
      <div class="hd-line">
        <span class="hd hd-${h.role === '本气' ? 'ben' : h.role === '中气' ? 'zhong' : 'yu'}">${h.gan}<i class="hd-qi">${h.role.replace('气', '')}</i></span>
        <span class="hgod tg-${tgCat(h.tenGod)}" data-tip="${BZ_GOD_KEY[h.tenGod] || ''}">${h.tenGod}</span>
      </div>`).join('');
    return `
      <div class="bz-col ${k === 'day' ? 'day' : ''} ${k === 'day' ? 'active' : ''}" data-pi="${k}" data-wxlist="${wxList.join(',')}">
        <div class="bz-god tg-${tgCat(p.ganTenGod)}" data-tip="${BZ_GOD_KEY[p.ganTenGod] || ''}">${p.ganTenGod}</div>
        <div class="bz-gan wx-txt-${wxKey(p.ganWuXing)}">${p.gan}</div>
        <div class="bz-zhi wx-txt-${wxKey(p.zhiWuXing)}">${p.zhi}</div>
        <div class="bz-hide">${hide}</div>
        <div class="bz-nayin" data-tip="bz-nayin">${p.naYin}</div>
      </div>`;
  }).join('');

  // 四柱点选详情（四态预渲染，data-pane 切换）
  const pillarPanes = POS.map((k) => {
    const p = bz[k];
    const rows = [
      ['天干', `${p.gan}（${p.ganWuXing}）`, `对日主：${p.ganTenGod}`],
      ['地支', `${p.zhi}（${p.zhiWuXing}）`, ''],
      ...p.hidden.map((h) => [`藏干·${h.role}`, `${h.gan}（${GAN_WX[h.gan]}）`, `对日主：${h.tenGod}`]),
      ['纳音', p.naYin, ''],
    ];
    return `<div class="bz-pane ${k === 'day' ? 'active' : ''}" data-pane="${k}" data-pane-group="pillar">
      <div class="bz-pane-h">${TITLE[k]} · ${p.gan}${p.zhi}</div>
      ${rows.map(([a, b, c]) => `<div class="bz-pane-row"><span class="pp-k">${a}</span><span class="pp-v">${b}</span>${c ? `<span class="pp-t tg-${tgCat(c.replace('对日主：',''))}">${c}</span>` : ''}</div>`).join('')}
    </div>`;
  }).join('');

  const bars = wuxingBars(bz).map((b) => `
    <div class="wx-bar-row ${b.wx === bz.dayMasterWuXing ? 'is-dm' : ''}" data-wx="${b.wx}">
      <span class="wx-name wx-txt-${wxKey(b.wx)}">${b.wx}</span>
      <span class="wx-track"><span class="wx-fill wx-bg-${wxKey(b.wx)}" style="width:${b.pct}%"></span></span>
      <span class="wx-pct">${b.pct}%<i>·${bz.wuXingCount[b.wx]}个</i></span>
    </div>`).join('');

  const cells = bz.daYun.list.slice(0, 9).map((d) => {
    const active = nowYear >= d.startYear && nowYear <= d.endYear;
    const dyGod = tenGod(bz.dayMaster, d.ganZhi[0]);
    return `<div class="dy-cell ${active ? 'current' : ''}">
      <div class="dy-gz wx-txt-${wxKey(GAN_WX[d.ganZhi[0]])}">${d.ganZhi}</div>
      <div class="dy-god tg-${tgCat(dyGod)}">${dyGod}</div>
      <div class="dy-age">${d.startAge}–${d.endAge}岁</div>
      <div class="dy-year">${d.startYear}–${d.endYear}</div>
    </div>`;
  }).join('');

  return stage(`
    ${guideHTML(BZ_GUIDE)}
    <div class="bazi-head">
      <div class="bz-title">${birthText()} · ${bz.gender}命 · ${birthArgs().place || ''}</div>
      <div class="bz-sub">日主 <b class="wx-txt-${wxKey(bz.dayMasterWuXing)}">${bz.dayMaster}${bz.dayMasterWuXing}</b> · 日空亡 ${bz.xunKong.join('')} · 胎元${bz.taiYuan} · 命宫${bz.mingGong} · 身宫${bz.shenGong}</div>
    </div>
    <div class="bazi-grid">${cols}</div>

    <div class="bz-pane-wrap">${pillarPanes}</div>
    <div class="bz-tap-hint">点四柱看干支 / 藏干 / 十神 / 纳音</div>

    <div class="bz-section-title">五行分布 <span class="bz-sec-hint">（藏干加权 · 点一行可高亮含该行的柱）</span></div>
    <div class="wx-bars">${bars}</div>

    <div class="bz-section-title">大运 · ${bz.daYun.direction} · ${bz.daYun.startText}起运（公历 ${bz.daYun.startSolar}）</div>
    <div class="dayun-scroll"><div class="dayun-row">${cells}</div></div>

    <div class="bazi-footnote">
      排法依节气换月柱、${ziMode() === '00' ? '子正（0 点）换日柱' : '23 点（晚子时）换日柱'}。干支五行本《五行大义》《三命通会·干支总论》；
      藏干本/中/余气本《渊海子平·论地支藏干》，力量条按天干满分、藏干 60/30/10 的展示近似换算，非旺衰/格局断语；
      纳音本《三命通会·纳音五行》。本页只列盘式与五行事实，不作格局、旺衰、吉凶判断。
    </div>
    ${foldVerdict(verdictCardHtml(judgeBazi(bz, { age: new Date().getFullYear() - birthArgs().year + 1 })))}`, 'bazi');
}

// 一键复制（AI 易读，格式宽松）
export function baziCopyText() {
  const bz = getBazi();
  const L = [];
  L.push('【八字 · 本命】');
  L.push(`${birthText()} · ${bz.gender}命 · ${birthArgs().place || ''}`);
  for (const k of POS) {
    const p = bz[k];
    const cang = p.hidden.map((h) => `${h.gan}(${h.tenGod}${h.role === '本气' ? '/本气' : ''})`).join(' ');
    L.push(`${TITLE[k]}：${p.ganTenGod || ''} ${p.gan}${p.zhi}（${p.naYin}）藏干：${cang}`);
  }
  L.push(`日主 ${bz.dayMaster}${bz.dayMasterWuXing} · 日空亡 ${bz.xunKong.join('')} · 胎元${bz.taiYuan} · 命宫${bz.mingGong} · 身宫${bz.shenGong}`);
  L.push('五行：' + ['金', '木', '水', '火', '土'].map((w) => `${w}${bz.wuXingCount[w]}`).join(' '));
  L.push(`大运：${bz.daYun.direction}，${bz.daYun.startText}起运（公历 ${bz.daYun.startSolar}）`);
  L.push(bz.daYun.list.slice(0, 9).map((d) => `${d.ganZhi}(${d.startAge}-${d.endAge}岁,${d.startYear}-${d.endYear})`).join(' '));
  return L.join('\n');
}

// 复现码数据 + 案例标题
export function baziCode() {
  const bz = getBazi();
  const a = birthArgs();
  const siZhu = POS.map((k) => `${bz[k].gan}${bz[k].zhi}`).join(' ');
  return {
    kind: 'bazi',
    data: { at: new Date(a.year, a.month - 1, a.day, a.hour, a.minute, 0, 0).getTime(), gender: a.gender },
    title: siZhu,
    sub: `${birthText()} · ${bz.gender}命 · 日主${bz.dayMaster}${bz.dayMasterWuXing}`,
  };
}
