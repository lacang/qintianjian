// 奇门遁甲视图：指定时刻 时家·转盘·拆补 局（只排事实，不做格局吉凶）
// 统一北京时间；时刻可由「时间条」或复现码覆盖。
// v55：九宫按卦五行分层底色、加方位标注、值符值使/空亡马星强化、补图例与典籍依据。
import { paiQiMen } from '../vendor/liuyao-core.js?v=125';
import { judgeQiMen, verdictCardHtml } from './verdicts.js?v=125';
import { resolveCastDate, nowDate, pad, toSec } from './state.js?v=125';
import { gateHTML, stage, foldVerdict, isCasted } from './ritual.js?v=125';
import { QM_PALACE_DIR, wxKey } from './classical.js?v=125';
import { guideHTML, T } from './tipview.js?v=125';
import {
  qmFuFan, qmFind, QM_STEPS, QM_YONGSHEN, QM_FUFAN_QUOTE,
} from './reading.js?v=125';

export function currentQiMen(date = nowDate()) {
  const d = resolveCastDate(date); // 北京时间
  const q = paiQiMen({ year: d.getFullYear(), month: d.getMonth() + 1, day: d.getDate(), hour: d.getHours(), minute: d.getMinutes() });
  return { q, castDate: d };
}

// 洛书九宫在 3×3 网格中的位置：4 9 2 / 3 5 7 / 8 1 6
const GRID = [4, 9, 2, 3, 5, 7, 8, 1, 6];

// 元素对照：八门 / 九星 / 八神 的含义 key
const MEN_KEY = { 休门:'qm-men-xiu', 生门:'qm-men-sheng', 伤门:'qm-men-shang', 杜门:'qm-men-du',
  景门:'qm-men-jing', 死门:'qm-men-si', 惊门:'qm-men-jing2', 开门:'qm-men-kai' };
const QMSTAR_KEY = { 天蓬:'qm-star-peng', 天任:'qm-star-ren', 天冲:'qm-star-chong', 天辅:'qm-star-fu',
  天英:'qm-star-ying', 天芮:'qm-star-rui', 天柱:'qm-star-zhu', 天心:'qm-star-xin', 天禽:'qm-star-qin' };
const QMGOD_KEY = { 值符:'qm-god-fu', 腾蛇:'qm-god-she', 太阴:'qm-god-yin', 六合:'qm-god-liuhe',
  白虎:'qm-god-baihu', 玄武:'qm-god-xuan', 九地:'qm-god-jiudi', 九天:'qm-god-jiutian' };

const MARK_CLS = { 空: 'm-kong', 墓: 'm-mu', 马: 'm-ma', 击刑: 'm-xing', 入墓: 'm-mu', 门迫: 'm-po' };

function cell(p, zhiFuPalace, zhiShiPalace) {
  const isCenter = p.palaceNumber === 5;
  const isZF = p.palaceNumber === zhiFuPalace;
  const isZS = p.palaceNumber === zhiShiPalace;
  const dir = QM_PALACE_DIR[p.palaceNumber] || '';
  const marks = p.marks || [];
  const marksHtml = marks.map((m) => `<span class="qm-mark ${MARK_CLS[m] || ''}">${m}</span>`).join('');
  const ji = p.jiGanStem ? `<span class="qm-ji" title="中五寄坤二寄干">寄${p.jiGanStem}</span>` : '';
  return `<div class="qm-cell qm-wx-${wxKey(p.palaceElement)} ${isZF ? 'is-zf' : ''} ${isZS ? 'is-zs' : ''}"
      data-palace="${p.palaceNumber}" data-zf="${isZF ? 1 : 0}" data-zs="${isZS ? 1 : 0}" data-marks="${marks.join(',')}">
    <div class="qm-corner">
      <span class="qm-num">${p.palaceNumber}</span>
      <span class="qm-tri wx-txt-${wxKey(p.palaceElement)}">${p.palaceName}</span>
      <i>${dir}</i>${ji}
    </div>
    <div class="qm-stems"><span class="qm-sky">${p.skyStem || ''}</span><span class="qm-earth">${p.earthStem || ''}</span></div>
    ${p.star
      ? `<div class="qm-star ${isZF ? 'zf' : ''}" data-tip="${QMSTAR_KEY[p.star] || ''}">${isZF ? '<span class="qm-badge zf">符</span>' : ''}${p.star}<i class="qm-el wx-txt-${wxKey(p.starElement)}">${p.starElement}</i></div>`
      : '<div class="qm-star qm-qin" data-tip="qm-star-qin">天禽<i class="qm-el wx-txt-earth">土</i></div>'}
    ${p.door
      ? `<div class="qm-door ${isZS ? 'zs' : ''}" data-tip="${MEN_KEY[p.door] || ''}">${isZS ? '<span class="qm-badge zs">使</span>' : ''}${p.door}<i class="qm-el wx-txt-${wxKey(p.doorElement)}">${p.doorElement}</i></div>`
      : '<div class="qm-door"></div>'}
    ${p.god ? `<div class="qm-god" data-tip="${QMGOD_KEY[p.god] || ''}">${p.god}${p.godShort ? `<i class="qm-gods">（${p.godShort}）</i>` : ''}</div>` : '<div class="qm-god"></div>'}
    ${marksHtml ? `<div class="qm-marks">${marksHtml}</div>` : ''}
  </div>`;
}

// 九宫详情面板：点宫位即看该宫完整落宫要素（九态预渲染，data-pane 切换）
function palacePanes(q, byNum) {
  return GRID.map((n) => {
    const p = byNum[n];
    const tri = QM_PALACE_DIR[n];
    const rows = [
      ['方位', `${p.palaceName}卦 · ${QM_PALACE_DIR[n]} · 五行${p.palaceElement}`],
      ['天地盘', `${p.skyStem || '—'} / ${p.earthStem || '—'}${p.jiGanStem ? `（中寄 ${p.jiGanStem}）` : ''}`],
      ['九星', p.star ? `${p.star}（${p.starElement}）` : '天禽寄宫'],
      ['八门', p.door ? `${p.door}（${p.doorElement}）` : '中宫无门'],
      ['八神', p.god ? `${p.god}（${p.godShort || p.god}）` : '—'],
      ['标记', p.marks && p.marks.length ? p.marks.join('、') : '无'],
    ];
    const tag = [];
    if (n === q.zhiFu.palace) tag.push('值符落宫');
    if (n === q.zhiShi.palace) tag.push('值使落宫');
    return `<div class="qm-pane ${n === q.zhiFu.palace ? 'active' : ''}" data-pane="${n}" data-pane-group="palace">
      <div class="qm-pane-h">${n}宫 · ${p.palaceName} ${tag.length ? `<span class="qm-pane-tag">${tag.join(' · ')}</span>` : ''}</div>
      ${rows.map(([k, v]) => `<div class="qm-pane-row"><span class="pp-k">${k}</span><span class="pp-v">${v}</span></div>`).join('')}
    </div>`;
  }).join('');
}

// 单个事类：类神项 + 客观落宫 chips（chip 可点，联动上方九宫）
function yongshenCategory(cat, q, byNum) {
  const chips = cat.items.map((it) => {
    const hit = qmFind(q, byNum, it);
    const hits = hit
      .map((n) => {
        const p = byNum[n];
        return `<span class="rd-pal-chip" data-qmpal="${n}">${n}宫·${p.palaceName}</span>`;
      })
      .join('');
    return `<div class="rd-ys-item">
      <div class="rd-ys-what"><b>${it.what}</b>${it.note ? `<i>${it.note}</i>` : ''}</div>
      <div class="rd-ys-hit">${hits || '<span class="rd-ys-none">本时未落宫</span>'}</div>
    </div>`;
  }).join('');
  return `<div class="rd-ys-cat" data-qycat="${cat.id}"><div class="rd-ys-cat-h"><span>${cat.name}</span></div>${chips}</div>`;
}

function methodBlock(q) {
  const byNum = Object.fromEntries(q.palaces.map((p) => [p.palaceNumber, p]));
  const fu = q.zhiFu.palace, shi = q.zhiShi.palace;
  const ff = qmFuFan(q);
  const isFu = ff.fuyin.stars.length > 0 || ff.fuyin.doors.length > 0;
  const isFan = ff.fanyin.stars.length > 0 || ff.fanyin.doors.length > 0;
  const ffPals = [...new Set([
    ...ff.fuyin.stars.map((x) => x.palace), ...ff.fuyin.doors.map((x) => x.palace),
    ...ff.fanyin.stars.map((x) => x.palace), ...ff.fanyin.doors.map((x) => x.palace),
  ])];

  const steps = QM_STEPS.map((s) => {
    let pals = '', badge = 'manual';
    if (s.n === 3 || s.n === 4) { pals = [fu, shi].join(','); badge = 'auto'; }
    else if (s.n === 5) { pals = ffPals.join(','); badge = ffPals.length ? 'auto' : 'manual'; }
    else if (s.n === 6) {
      pals = q.palaces.filter((p) => (p.marks || []).length).map((p) => p.palaceNumber).join(',');
      badge = pals ? 'auto' : 'manual';
    }
    return `<div class="rd-step ${badge === 'manual' ? 'is-manual' : ''}" data-rdstep="${s.n}"${pals ? ` data-rdpals="${pals}"` : ''}>
      <div class="rd-step-h"><span class="rd-step-n">${s.n}</span><b>${s.title}</b>
        <i class="rd-step-badge ${badge}">${badge === 'manual' ? '临事自察' : '盘上可点'}</i></div>
      <div class="rd-step-body">
        <p class="rd-step-desc">${s.desc}</p>
        ${s.quote ? `<blockquote class="rd-quote">${s.quote}<cite>—— ${s.source}</cite></blockquote>` : ''}
      </div>
    </div>`;
  }).join('');

  const geJu = `
    <div class="rd-sub-h">本盘星门神仪组合</div>
    ${isFu ? `<div class="rd-ge-row is-hit">
      <div class="rd-ge-h"><b>伏吟</b><span class="rd-ge-badge">本盘：星门归本宫</span></div>
      <p class="rd-ge-desc">${ff.fuyin.stars.map((x) => x.name).join('、')}${ff.fuyin.doors.length ? '；' + ff.fuyin.doors.map((x) => x.name).join('、') : ''} 落回本宫，盘静。</p>
      <blockquote class="rd-quote">就中伏吟为最凶，天蓬加着地天蓬。<cite>—— ${QM_FUFAN_QUOTE.source}</cite></blockquote>
    </div>` : ''}
    ${isFan ? `<div class="rd-ge-row is-hit">
      <div class="rd-ge-h"><b>反吟</b><span class="rd-ge-badge">本盘：星门落对宫</span></div>
      <p class="rd-ge-desc">${ff.fanyin.stars.map((x) => x.name).join('、')}${ff.fanyin.doors.length ? '；' + ff.fanyin.doors.map((x) => x.name).join('、') : ''} 落于对宫相冲。</p>
      <blockquote class="rd-quote">${QM_FUFAN_QUOTE.fanyin}<cite>—— ${QM_FUFAN_QUOTE.source}</cite></blockquote>
    </div>` : ''}
    <div class="rd-ge-row">
      <div class="rd-ge-h"><b>十干克应·三诈五假等格</b><span class="rd-ge-badge manual">逐宫看天地盘干</span></div>
      <p class="rd-ge-desc">逐宫看天盘干加临地盘干，依《烟波钓叟歌》十干克应及诸格局取用。下举二格原文为例，余格见原书；App 只客观列「某干加某干」，不代判吉凶。</p>
      <blockquote class="rd-quote">太白入荧：太白（庚）入荧惑（丙）之宫，金入火乡。<br>荧入太白：荧惑（丙）入太白（庚）之宫，火入金乡。<cite>—— 《烟波钓叟歌》（《遁甲演义》本）</cite></blockquote>
    </div>
    <p class="rd-note">空亡、门迫、击刑、入墓、马星已在上方九宫逐格标出。诸格于所主事上或利或不利，原书语境各异，App 只列名称与原文，不作统一吉凶合成。</p>`;

  return `<section class="rd-method qm-method">
    <div class="rd-method-h" data-rdtoggle>
      <span class="rd-method-ttl">古法读盘次第</span>
      <i class="rd-method-src">《烟波钓叟歌》·时家转盘</i>
      <span class="rd-method-chevron">展开</span>
    </div>
    <div class="rd-method-body">
      <div class="rd-steps">${steps}</div>
      ${geJu}
      <div class="rd-sub-h">事类类神落宫（点落宫可在上方定位）</div>
      <div class="rd-ys-tabs">
        ${QM_YONGSHEN.map((c, i) => `<button type="button" class="rd-ys-tab ${i === 0 ? 'active' : ''}" data-qytab="${c.id}">${c.name}</button>`).join('')}
      </div>
      ${QM_YONGSHEN.map((c, i) => `<div class="rd-ys-panel ${i === 0 ? 'active' : ''}" data-qypanel="${c.id}">${yongshenCategory(c, q, byNum)}</div>`).join('')}
      <p class="rd-note">类神取用为时家奇门通行法（参见《奇门遁甲秘笈大全》《遁甲演义》），各家或有出入；落宫只作客观定位，星门神仪与本宫生克、空墓迫击之综合判断在人。</p>
    </div>
  </section>`;
}

const QM_GUIDE = {
  title: '怎么看这一盘',
  intro: '奇门遁甲把时间排进九宫，看某一时刻各方位的格局。 本盘每一个门、星、神都可以点开——卡里会告诉你它是什么、主什么事、古法列为吉还是凶。',
  steps: [
    { t: '最上面一行', d: '「X遁X局」是这一时刻的定局；值符、值使是全局的两个主角。', tip: 'zhifu', sel: '.qm-head' },
    { t: '中间九宫格', d: '每格是一个方位，叠着天盘干、地盘干、九星、八门、八神。', tip: 'jiugong', sel: '.qm-grid' },
    { t: '八门', d: '休生伤杜景死惊开，各代表一类事态。', tip: 'bamen', sel: '.qm-grid' },
    { t: '九星 / 八神', d: '给格局补充性质与细节。', tip: 'jiuxing', sel: '.qm-grid' },
    { t: '点任一宫', d: '看该宫完整落宫；上方按钮可按值符／值使／空亡／马星／入墓筛宫。', sel: '.qm-filters' },
  ],
  note: '盘上只列传统体系里的通行含义与古籍出处，不替你下断语；吉凶倾向一律标为「古籍所载」，供你自己衡量。',
};

export function renderQiMen(date = nowDate()) {
  if (!isCasted('qimen')) return gateHTML('qimen');
  const { q, castDate } = currentQiMen(date);
  const hh = `${castDate.getFullYear()}年${pad(castDate.getMonth() + 1)}月${pad(castDate.getDate())}日 ${pad(castDate.getHours())}:${pad(castDate.getMinutes())} · 北京时间`;
  const byNum = Object.fromEntries(q.palaces.map((p) => [p.palaceNumber, p]));

  const html = `
  ${guideHTML(QM_GUIDE)}
  <div class="qm-head">
    <div class="qm-title">${q.dun}${q.ju}局 · ${q.yuan} · ${q.jieQi}</div>
    <div class="qm-sizhu">${q.siZhu.year} ${q.siZhu.month} ${q.siZhu.day} ${q.siZhu.time} · 旬空${q.timeKongWang.join('')}</div>
    <div class="qm-sub">${hh}</div>
    <div class="qm-zs">值符 ${q.zhiFu.star}（${byNum[q.zhiFu.palace].palaceName}${q.zhiFu.palace}宫） · 值使 ${q.zhiShi.door}（${byNum[q.zhiShi.palace].palaceName}${q.zhiShi.palace}宫）</div>
  </div>
  <div class="qm-grid">
    ${GRID.map((n) => cell(byNum[n], q.zhiFu.palace, q.zhiShi.palace)).join('')}
  </div>
  <div class="qm-pane-wrap">${palacePanes(q, byNum)}</div>
  <div class="qm-tap-hint">点任一宫看该宫完整落宫</div>

  ${methodBlock(q)}

  <div class="qm-filters">
    <button type="button" class="qm-filter" data-qmfilter="zf">值符</button>
    <button type="button" class="qm-filter" data-qmfilter="zs">值使</button>
    <button type="button" class="qm-filter" data-qmfilter="kong">空亡</button>
    <button type="button" class="qm-filter" data-qmfilter="ma">马星</button>
    <button type="button" class="qm-filter" data-qmfilter="mu">入墓</button>
  </div>
  <div class="qm-legend">
    <span><i class="lg-dot wx-bg-water"></i>坎水</span>
    <span><i class="lg-dot wx-bg-wood"></i>震巽木</span>
    <span><i class="lg-dot wx-bg-fire"></i>离火</span>
    <span><i class="lg-dot wx-bg-earth"></i>坤艮中土</span>
    <span><i class="lg-dot wx-bg-metal"></i>乾兑金</span>
  </div>
  <div class="qm-note">
    每宫：宫数·宫名·方位（底色为宫卦五行）｜天盘干/地盘干｜九星(星五行)｜八门(门五行)｜八神。上方按钮可高亮筛宫。
    排法依《烟波钓叟歌》时家转盘、拆补定局，中五寄坤二宫；超神接气与置闰流派暂未并列（待接）。
    「空/墓/马」等标记为旬空、入墓、马星等盘面事实，不作趋避吉凶断语。
  </div>
  ${foldVerdict(verdictCardHtml(judgeQiMen(q)))}`;
  return stage(html, 'qimen');
}

// 一键复制：按洛书九宫逐格列事实（AI 易读，格式宽松）
export function qiMenCopyText(date = nowDate()) {
  const { q, castDate } = currentQiMen(date);
  const byNum = Object.fromEntries(q.palaces.map((p) => [p.palaceNumber, p]));
  const lines = [
    '【奇门遁甲 · 时辰局】',
    `北京时间 ${castDate.getFullYear()}-${pad(castDate.getMonth() + 1)}-${pad(castDate.getDate())} ${pad(castDate.getHours())}:${pad(castDate.getMinutes())}`,
    `${q.dun}${q.ju}局 · ${q.yuan} · ${q.jieQi}`,
    `四柱 ${q.siZhu.year} ${q.siZhu.month} ${q.siZhu.day} ${q.siZhu.time} · 旬空${q.timeKongWang.join('')}`,
    `值符 ${q.zhiFu.star}（${byNum[q.zhiFu.palace].palaceName}${q.zhiFu.palace}宫） · 值使 ${q.zhiShi.door}（${byNum[q.zhiShi.palace].palaceName}${q.zhiShi.palace}宫）`,
    '—— 洛书九宫（4·9·2 / 3·5·7 / 8·1·6）——',
  ];
  for (const n of GRID) {
    const p = byNum[n];
    const seg = [
      `${n}宫${p.palaceName}`,
      p.skyStem || p.earthStem ? `天地盘 ${p.skyStem || ''}/${p.earthStem || ''}` : '',
      p.star ? p.star : '', p.door ? p.door : '', p.god ? p.god : '',
      (p.marks && p.marks.length) ? `[${p.marks.join(',')}]` : '',
    ].filter(Boolean).join(' ');
    lines.push(seg);
  }
  lines.push('时家·转盘·拆补·中五寄坤二。');
  return lines.join('\n');
}

// 复现码数据 + 案例标题
export function qiMenCode(date = nowDate()) {
  const { q, castDate } = currentQiMen(date);
  return {
    kind: 'qimen',
    data: { at: toSec(castDate.getTime()) },
    title: `${q.dun}${q.ju}局 · ${q.jieQi}`,
    sub: `${castDate.getFullYear()}-${pad(castDate.getMonth() + 1)}-${pad(castDate.getDate())} ${pad(castDate.getHours())}:${pad(castDate.getMinutes())} · ${q.yuan}`,
  };
}
