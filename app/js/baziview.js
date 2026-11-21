// 八字本命视图：指定出生时刻 四柱十神/藏干（本中余气）/纳音/五行分布 + 大运（只排事实，不做断语）
import { tenGod, baziExtra, liuNianList, liuYueList } from '../vendor/liuyao-core.js?v=133';
import { guard, renderWarnings } from './errors.js?v=133'; // 错误边界（P0-2）：渲染抛错不再白屏
import { paiBaziZi, ziMode } from './zischool.js?v=133';
import { judgeBazi, verdictCardHtml } from './verdicts.js?v=133';
import { birthArgs, cfg, pad } from './state.js?v=133';
import { GAN_WX, QI_WEIGHT, wxKey } from './classical.js?v=133';
// 元素对照：十神 / 纳音 的含义 key
const BZ_GOD_KEY = { 比肩:'bz-god-bijian', 劫财:'bz-god-jiecai', 食神:'bz-god-shishen', 伤官:'bz-god-shangguan',
  偏财:'bz-god-piancai', 正财:'bz-god-zhengcai', 七杀:'bz-god-qisha', 正官:'bz-god-zhengguan',
  偏印:'bz-god-pianyin', 正印:'bz-god-zhengyin' };

import { guideHTML, T } from './tipview.js?v=133';
import { gateHTML, stage, foldVerdict, isCasted } from './ritual.js?v=133';

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
  // 缓存键必须含地点/时区/真太阳时：出生地一改，真太阳时与夏令时折算随之变，四柱可能换时辰
  const key = `${a.year}-${a.month}-${a.day}-${a.hour}-${a.minute}-${a.gender}-${a.city || ''}-${a.lat || ''}-${a.lonEast || a.longitude || ''}-${a.utcOffsetHours ?? ''}-${a.trueSolarTime ? 1 : 0}-${cfg.lateZi || '23'}`;
  if (!cache || cacheKey !== key) {
    // 完整透传 birthArgs：city/place/lat/lonEast/utcOffsetHours/trueSolarTime 由内核 timeContext 折算
    // （夏令时 −1h + 经度差 + 均时差），与六爻盘同一口径；只传年月日时会漏掉真太阳时。
    cache = paiBaziZi({ ...a, lat: a.lat ?? a.latitude, lonEast: a.lonEast ?? a.longitude });
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

/* ===== 八字扩展层：神煞 / 刑冲合害 / 流年流月 / 旺衰依据 =====
   规则全部在 liuyao-core/src/bazi-extra.ts（口诀+出处），此处只负责呈现。
   呈现纪律：只列「可指认的事实 + 典籍出处」，不下吉凶断语。 */
const POS_BRIEF = { year: '年', month: '月', day: '日', time: '时' };
const REL_COLOR = {
  六冲: '#c0524a', 相冲: '#c0524a', 六合: '#3f7d6a', 五合: '#3f7d6a',
  三合: '#4a6f8c', 半合: '#4a6f8c', 拱合: '#6d8fa6',
  三刑: '#7a5aa8', 相刑: '#7a5aa8', 自刑: '#7a5aa8',
  六害: '#b5763f', 相破: '#7d8896',
};
const esc = (s) => String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const relPosText = (positions) => positions.map((p) => POS_BRIEF[p] || p).join('');
const relShort = (r) => r.name.replace(/(年柱|月柱|日柱|时柱|流年|流月)/g, '');

/* 柱位连线图：固定几何（不量 DOM），两柱关系画弧、多柱关系画横跨线 */
function relMapSVG(bz, rel) {
  const NODE_X = { year: 50, month: 150, day: 250, time: 350 };
  const all = [...rel.zhi, ...rel.gan].filter((r) => r.positions.length >= 2);
  if (!all.length) return '';
  const parts = [];
  all.forEach((r, i) => {
    const xs = r.positions.map((p) => NODE_X[p]).sort((a, b) => a - b);
    const h = 16 + (i % 5) * 9;
    const color = REL_COLOR[r.kind] || '#7d8896';
    const title = `${r.name}　${r.source}`;
    if (xs.length === 2) {
      const mx = (xs[0] + xs[1]) / 2;
      parts.push(`<path d="M ${xs[0]} 64 Q ${mx} ${64 - h * 2} ${xs[1]} 64" fill="none" stroke="${color}" stroke-width="1.3" opacity=".85"><title>${esc(title)}</title></path>`);
    } else {
      const y = 14 + (i % 5) * 6;
      parts.push(`<path d="M ${xs[0]} 64 L ${xs[0]} ${y} L ${xs[xs.length - 1]} ${y} L ${xs[xs.length - 1]} 64" fill="none" stroke="${color}" stroke-width="1.1" stroke-dasharray="4 3" opacity=".8"><title>${esc(title)}</title></path>`);
      for (const x of xs.slice(1, -1)) parts.push(`<circle cx="${x}" cy="${y}" r="2" fill="${color}" opacity=".8"/>`);
    }
  });
  const nodes = POS.map((k) => `
    <text x="${NODE_X[k]}" y="80" text-anchor="middle" font-size="19" fill="currentColor">${bz[k].zhi}</text>
    <text x="${NODE_X[k]}" y="96" text-anchor="middle" font-size="9.5" fill="currentColor" opacity=".45">${TITLE[k]}</text>`).join('');
  return `<svg viewBox="0 0 400 104" width="100%" height="104" role="img" aria-label="四柱刑冲合害连线">${parts.join('')}${nodes}</svg>`;
}

function shenShaBlock(bz, ss) {
  const kongNote = ss.present.includes('空亡') ? ''
    : `<div class="bz-chip" title="空亡｜旬空：甲子旬戌亥空、甲戌旬申酉空、甲申旬午未空、甲辰旬寅卯空、甲午旬辰巳空、甲寅旬子丑空。四柱地支落此二支者为「坐空」；本盘四柱无支落空，故不列坐空柱。"><b>空亡</b> 日空${bz.xunKong.join('')} · 四柱无支落空</div>`;
  const hit = ss.present.map((n) => {
    const spec = ss.specs.find((s) => s.name === n);
    const hs = ss.byName[n] || [];
    // 空亡的起点是「日柱」整柱（丙申），不是「日支」；只显示干支，避免「日支丙申」这种干支混称
    const brief = n === '空亡'
      ? hs.map((h) => `${h.refValue}→${h.target}·${relPosText(h.positions)}${h.luoKong ? '（落空）' : ''}`).join('；')
      : hs.map((h) => `${h.ref}${h.refValue}→${h.target}·${relPosText(h.positions)}${h.luoKong ? '（落空）' : ''}`).join('；');
    const tip = `${n}｜${spec.rule}｜出处：${spec.source}${spec.note ? `｜${spec.note}` : ''}`;
    return `<div class="bz-chip" title="${esc(tip)}"><b>${n}</b> ${brief}</div>`;
  }).join('');
  return `
    <div class="bz-section-title">神煞 <span class="bz-sec-hint">（查法以日干/日支为主、年柱为辅；点格看口诀与出处）</span></div>
    <div class="bz-extras">${hit}${kongNote}</div>
    <div class="bz-sec-hint">未见：${ss.absent.filter((n) => n !== '空亡').join('、') || '—'}</div>`;
}

function relBlock(bz, rel) {
  const group = (list) => {
    const by = {};
    for (const r of list) (by[r.kind] ||= []).push(r);
    return Object.keys(by).map((kind) => {
      const items = by[kind];
      const color = REL_COLOR[kind] || '#7d8896';
      const cells = items.map((r) => `<span class="ln-pill">${(r.zhis || r.gans || []).join('')}（${relPosText(r.positions)}）${r.huaWuXing ? `→${r.huaWuXing}` : ''}</span>`).join('');
      return `<div class="liunian-row"><span class="ln-pill" style="color:${color};border-color:${color}">${kind}</span>${cells}<span class="ln-pill" style="opacity:.6">${items[0].source}</span></div>`;
    }).join('');
  };
  const zhiRows = group(rel.zhi);
  const ganRows = group(rel.gan);
  return `
    <div class="bz-section-title">刑冲合害 <span class="bz-sec-hint">（连线＝柱位关系；同两柱可兼合、刑、破，各算一条不吞并）</span></div>
    ${relMapSVG(bz, rel)}
    ${zhiRows || '<div class="bz-sec-hint">四支之间无冲、合、刑、害、破</div>'}
    ${ganRows ? `<div class="liunian-row"><span class="ln-pill" style="opacity:.6">天干</span></div>${ganRows}` : '<div class="bz-sec-hint">四干之间无五合、相冲</div>'}`;
}

function wangShuaiBlock(bz, ws) {
  const items = ws.items.map((it) => {
    const tag = `${it.label}${it.pillar ? POS_BRIEF[it.pillar] + it.char : ''}`;
    const body = it.text.startsWith(tag) ? it.text.slice(tag.length).replace(/^[：:，,\s]+/, '') : it.text;
    return `<div class="bz-chip" title="${esc(it.src)}"><b>${tag}</b> ${body}</div>`;
  }).join('');
  const warn = ws.consistent ? '' : `<div class="bz-extras"><div class="bz-chip" style="border-color:var(--cinnabar);color:var(--cinnabar)" title="本节的复刻公式与 app/js/verdicts.js judgeBazi 已不一致（漂移探针触发）。这属于两处公式分叉，不是流派差异；本页先用本节结果，请把该盘时间报修。">口径提示：断语卡判「${ws.legacyConclusion}」，本节判「${ws.conclusion}」，两处旺衰公式已分叉（以本节为准，待同步）</div></div>`;
  return `
    <div class="bz-section-title">旺衰依据 <span class="bz-sec-hint">（得令/得地/得生/得助 + 月令五态；只把推导露出来，不改断语结论）</span></div>
    <div class="liunian-row">
      <span class="ln-pill now">日主 ${bz.dayMaster}${bz.dayMasterWuXing} · ${ws.conclusion}</span>
      <span class="ln-pill">月令 ${ws.monthState.zhi}${ws.monthState.wuXing}：${ws.monthState.state}</span>
      <span class="ln-pill">合计 ${ws.score > 0 ? '+' : ''}${ws.score}</span>
      <span class="ln-pill">得令${ws.counts.得令} 得地${ws.counts.得地} 得生${ws.counts.得生} 得助${ws.counts.得助}</span>
      <span class="ln-pill">通根 ${ws.tongGen} 支</span>
    </div>
    ${warn}
    <div class="bz-extras">${items}</div>
    <div class="bz-sec-hint">${ws.note}</div>`;
}

/* 当前「立春年」：立春前仍算上一年（与年柱口径一致） */
function liChunYear(bz) {
  const now = new Date();
  const y = now.getFullYear();
  const first = liuYueList(bz, y)[0];
  const cut = new Date(first.startText.replace(' ', 'T'));
  return now >= cut ? y : y - 1;
}

function liuNianBlock(bz, list, curYear) {
  const rows = list.map((y) => {
    const seen = new Map();
    for (const r of [...y.zhiRelations, ...y.ganRelations]) {
      const k = relShort(r);
      seen.set(k, (seen.get(k) || 0) + 1);
    }
    const rels = [...seen].map(([k, n]) => (n > 1 ? `${k}×${n}` : k)).join('、');
    return `<div class="liunian-row">
      <span class="ln-pill ${y.year === curYear ? 'now' : ''}">${y.year} ${y.ganZhi}</span>
      <span class="ln-pill">${y.ganTenGod}/${y.zhiTenGod}</span>
      <span class="ln-pill">${y.naYin}</span>
      <span class="ln-pill">空${y.xunKong.join('')}</span>
      ${y.taiSui.kinds.length ? `<span class="ln-pill">${y.taiSui.kinds.join('·')}</span>` : ''}
      ${rels ? `<span class="ln-pill">${rels}</span>` : '<span class="ln-pill" style="opacity:.55">与原局无刑冲合害</span>'}
      <span class="ln-pill" style="opacity:.7">${y.daYun ? `大运 ${y.daYun.ganZhi}` : '未入大运'}</span>
      ${y.suiYunBingLin ? '<span class="ln-pill now">岁运并临</span>' : ''}
    </div>`;
  }).join('');
  return `
    <div class="bz-section-title">流年 · 立春换年 <span class="bz-sec-hint">（干支复用 60 甲子序列；高亮＝当前流年）</span></div>
    ${rows}`;
}

function liuYueBlock(bz, months, year) {
  const today = new Date();
  const pills = months.map((m) => {
    const cur = today >= new Date(m.startText.replace(' ', 'T')) && (m.index === 12 || today < new Date(months[m.index].startText.replace(' ', 'T')));
    return `<span class="ln-pill ${cur ? 'now' : ''}" title="${m.jieqi} ${m.startText} 交节 · ${m.naYin}">${m.ganZhi} ${m.ganTenGod.slice(0, 2)} ${m.startDate.slice(5)}</span>`;
  }).join('');
  const curIdx = months.findIndex((m) => today >= new Date(m.startText.replace(' ', 'T')) && (m.index === 12 || today < new Date(months[m.index].startText.replace(' ', 'T'))));
  const cm = curIdx >= 0 ? months[curIdx] : null;
  const cmRel = cm ? [...cm.zhiRelations, ...cm.ganRelations].map(relShort).join('、') : '';
  return `
    <div class="bz-section-title">流月 · ${year} <span class="bz-sec-hint">（立春起寅，五虎遁排月干；点格看节气时刻与纳音）</span></div>
    <div class="liunian-row">${pills}</div>
    ${cm ? `<div class="liunian-row"><span class="ln-pill now">本月 ${cm.ganZhi}（${cm.jieqi}起）</span><span class="ln-pill">${cm.ganTenGod}/${cm.zhiTenGod}</span>${cmRel ? `<span class="ln-pill">${cmRel}</span>` : '<span class="ln-pill" style="opacity:.55">与原局无刑冲合害</span>'}</div>` : ''}`;
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
    { t: '神煞＝按口诀查出来的「标记」', d: '天乙、文昌、驿马、桃花、羊刃、空亡这些，都是拿日干/日支去对照固定口诀查出来的位置。点一格能看到它依据哪句口诀、出自哪本书；流派不同的（比如天乙贵人庚辛是取午寅还是丑未）会直接写在格子里，不偷偷挑一种。', sel: '.bz-extras' },
    { t: '连线＝四柱之间的刑冲合害', d: '把四根柱子当成四个点，冲、合、刑、害、破就是点与点之间的线。同一对柱子既合又破时，两条线都画出来，不合并、不吞掉。', sel: '.liunian-row' },
    { t: '流年流月＝今年、这个月走到哪一步', d: '流年按立春换年，流月按节气换月、月干用五虎遁推。每行都给出干支、十神、纳音、空亡、与四柱的刑冲合害，还有太岁关系。', sel: '.ln-pill' },
  ],
  note: '盘上只列传统体系里的通行含义与古籍出处，不替你下断语；吉凶倾向一律标为「古籍所载」，供你自己衡量。',
};

function __renderBazi() {
  if (!isCasted('bazi')) return gateHTML('bazi');
  const bz = getBazi();
  const nowYear = new Date().getFullYear();
  const ex = baziExtra(bz);
  const lcYear = liChunYear(bz);
  const lnList = liuNianList(bz, lcYear - 1, 6);
  const lyList = liuYueList(bz, lcYear);

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
    ${renderWarnings(bz)}
    ${guideHTML(BZ_GUIDE)}
    <div class="bazi-head">
      <div class="bz-title">${birthText()} · ${bz.gender}命 · ${birthArgs().place || ''}</div>
      <div class="bz-sub">日主 <b class="wx-txt-${wxKey(bz.dayMasterWuXing)}">${bz.dayMaster}${bz.dayMasterWuXing}</b> · 日空亡 ${bz.xunKong.join('')} · 胎元${bz.taiYuan} · 命宫${bz.mingGong} · 身宫${bz.shenGong}</div>
      <div class="bz-sub" style="opacity:.75" title="八字年柱以立春为界；紫微斗数另有「农历正月初一换年」口径，两处不可混用"><span class="ln-pill">${ex.yearPillarNote}</span></div>
    </div>
    <div class="bazi-grid">${cols}</div>

    <div class="bz-pane-wrap">${pillarPanes}</div>
    <div class="bz-tap-hint">点四柱看干支 / 藏干 / 十神 / 纳音</div>

    ${shenShaBlock(bz, ex.shenSha)}

    <div class="bz-section-title">五行分布 <span class="bz-sec-hint">（藏干加权 · 点一行可高亮含该行的柱）</span></div>
    <div class="wx-bars">${bars}</div>

    <div class="bz-section-title">大运 · ${bz.daYun.direction} · ${bz.daYun.startText}起运（公历 ${bz.daYun.startSolar}）</div>
    <div class="dayun-scroll"><div class="dayun-row">${cells}</div></div>

    ${wangShuaiBlock(bz, ex.wangShuai)}

    ${relBlock(bz, ex.relations)}

    ${liuNianBlock(bz, lnList, lcYear)}

    ${liuYueBlock(bz, lyList, lcYear)}

    <div class="bazi-footnote">
      排法依节气换月柱、${ziMode() === '00' ? '子正（0 点）换日柱' : '23 点（晚子时）换日柱'}。干支五行本《五行大义》《三命通会·干支总论》；
      藏干本/中/余气本《渊海子平·论地支藏干》，力量条按天干满分、藏干 60/30/10 的展示近似换算，非旺衰/格局断语；
      纳音本《三命通会·纳音五行》。
      神煞口诀本《渊海子平》《三命通会》（流派分歧在格内注明所取之说）；刑冲合害为确定性查表，同两柱兼合/刑/破各算一条不吞并；
      流年按立春换年、复用 60 甲子序列，流月按节气月＋五虎遁排月干；旺衰只列得令/得地/得生/得助与月令五态的推导，不改断语结论。
      本页只列盘式与五行事实，不作格局、吉凶判断。
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
  const ex = baziExtra(bz);
  const ws = ex.wangShuai;
  L.push(`年柱口径：${ex.yearPillarNote}`);
  L.push('神煞：' + (ex.shenSha.present.map((n) => {
    const hs = ex.shenSha.byName[n].map((h) => `${h.ref}${h.refValue}→${h.target}(${relPosText(h.positions)}${h.luoKong ? '空' : ''})`);
    return `${n}[${hs.join(';')}]`;
  }).join(' ') || '无'));
  L.push('未见神煞：' + (ex.shenSha.absent.join('、') || '—'));
  const relText = [...ex.relations.zhi, ...ex.relations.gan].map((r) => `${r.name}(${relPosText(r.positions)})`);
  L.push('刑冲合害：' + (relText.join(' ') || '无'));
  L.push(`旺衰依据：月令${ws.monthState.zhi}${ws.monthState.wuXing}为「${ws.monthState.state}」｜得令${ws.counts.得令} 得地${ws.counts.得地} 得生${ws.counts.得生} 得助${ws.counts.得助}｜通根${ws.tongGen}支｜合计${ws.score > 0 ? '+' : ''}${ws.score}→${ws.conclusion}${ws.consistent ? '' : `（断语卡判「${ws.legacyConclusion}」，两处旺衰公式已分叉）`}`);
  const lc = liChunYear(bz);
  L.push('流年：' + liuNianList(bz, lc - 1, 6).map((y) => {
    const rs = [...y.zhiRelations, ...y.ganRelations].map(relShort).join('/');
    return `${y.year}${y.ganZhi}(${y.ganTenGod}/${y.zhiTenGod}${y.taiSui.kinds.length ? ',' + y.taiSui.kinds.join('') : ''}${rs ? ',' + rs : ''})`;
  }).join(' '));
  L.push(`流月 ${lc}：` + liuYueList(bz, lc).map((m) => `${m.ganZhi}(${m.startDate.slice(5)}${m.jieqi},${m.ganTenGod})`).join(' '));
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

/* P0-2 错误边界：以上渲染入口统一兜底（audit3 · r1/r4 实测这些文件 catch 数为 0） */
export const renderBazi = guard(__renderBazi, '八字排盘失败', '#bazi-body');
