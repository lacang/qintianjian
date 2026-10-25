// 钦天监首页：干支信息条 + 天时卦钟（纯钟面）+ 独立卦画卡
// 全应用统一北京时间（八字牌另走自身口径）。只排事实，不做断语。
import { castByTime, getDayCalendar, getMeridian, paipanXingpan } from '../vendor/liuyao-core.js?v=119';
import { paipanZi, siZhuZi } from './zischool.js?v=119';
import { $, pad, cfg, BIRTH } from './state.js?v=119';
import { renderTodayCard } from './todaycard.js?v=119';
import { renderRhythm } from './rhythmview.js?v=119';
import { renderTianxiangCalendar } from './tianxiangcalendar.js?v=119';

const ZHI = ['子','丑','寅','卯','辰','巳','午','未','申','酉','戌','亥'];
const ZHI_RANGE = ['23-1','1-3','3-5','5-7','7-9','9-11','11-13','13-15','15-17','17-19','19-21','21-23'];
// 十二经当令（子午流注）：与时辰一一对应，表里经互为阴阳配对
const MD_FULL = ['足少阳胆经','足厥阴肝经','手太阴肺经','手阳明大肠经','足阳明胃经','足太阴脾经',
  '手少阴心经','手太阳小肠经','足太阳膀胱经','足少阴肾经','手厥阴心包经','手少阳三焦经'];

// 子午流注气血带：十二时辰一线铺开，气血由子时起依次灌注，当前时辰发光脉冲
function meridianBand(md, shIdx) {
  const i0 = ZHI.indexOf(md.zhi);
  const idx = i0 >= 0 ? i0 : (shIdx % 12);
  const N = 12, W = 360, H = 70, x0 = 24, x1 = 336, yb = 36;
  const step = (x1 - x0) / (N - 1);
  const px = (i) => x0 + i * step;
  let seg = '', dots = '', labs = '';
  for (let i = 0; i < N; i++) {
    const cx = px(i).toFixed(1);
    if (i < N - 1) seg += `<line class="mdb-seg${i < idx ? ' on' : ''}" x1="${cx}" y1="${yb}" x2="${px(i + 1).toFixed(1)}" y2="${yb}"/>`;
    dots += (i === idx)
      ? `<circle class="mdb-pulse" cx="${cx}" cy="${yb}" r="8"/><circle class="mdb-dot cur" cx="${cx}" cy="${yb}" r="4.4"/>`
      : `<circle class="mdb-dot${i < idx ? ' on' : ''}" cx="${cx}" cy="${yb}" r="${i < idx ? 2.8 : 2.1}"/>`;
    labs += `<text class="mdb-zhi${i === idx ? ' cur' : ''}" x="${cx}" y="${yb + 21}">${ZHI[i]}</text>`;
  }
  const lx = Math.max(x0 + 34, Math.min(x1 - 34, px(idx))).toFixed(1);
  const range = ZHI_RANGE[idx] || '';
  return `<div class="md-wrap">
    <svg class="md-band" viewBox="0 0 ${W} ${H}" preserveAspectRatio="xMidYMid meet" aria-hidden="true">
      <text class="mdb-organ" x="${lx}" y="13">${MD_FULL[idx]}</text>
      ${seg}${dots}${labs}
    </svg>
    <div class="md-cap">
      <span class="md-zhi">${md.zhi}时</span>
      <span class="md-range">${range} 点</span>
      <span class="md-organ">气血注 ${md.meridian}</span>
      <span class="md-pair">表里 · ${md.paired}</span>
      <span class="md-next">距${md.nextZhi}时换经 ${md.minutesToNext} 分</span>
    </div>
  </div>`;
}
const TRI = ['', '乾','兑','离','震','巽','坎','艮','坤'];

let lastShichen = -1;
let lastR = null;
let lastHeavyDate = '';      // 重卡（日课星历/节律/60天天象日历）按自然日只算一次
let heavyScheduled = false;  // 防重入

// 让浏览器在空闲时执行重任务；不支持时退化为短延时，始终让出主线程保证可点
const idle = (fn) => {
  if (typeof requestIdleCallback === 'function') return requestIdleCallback(fn, { timeout: 1500 });
  return setTimeout(fn, 60);
};
function dayKey(d) { return `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`; }

// 重量计算：首帧渲染后异步、分块执行，每块之间让出主线程，避免整页卡死、按钮无响应
function scheduleHeavy(castDate) {
  if (heavyScheduled) return;
  heavyScheduled = true;
  idle(() => {
    try { renderTodayCard(castDate); } catch (e) { console.warn('today card failed', e); }
    idle(() => {
      try {
        const birthForAstro = { year: BIRTH.year, month: BIRTH.month, day: BIRTH.day, hour: BIRTH.hour, minute: BIRTH.minute, lat: BIRTH.latitude, lonEast: BIRTH.longitude };
        const astroChart = paipanXingpan(birthForAstro);
        renderRhythm(BIRTH, astroChart.ascSignIndex, astroChart.sect === 'day');
      } catch (e) { console.warn('rhythm render failed', e); }
      idle(() => {
        try { renderTianxiangCalendar(castDate, 60); } catch (e) { console.warn('tianxiang calendar failed', e); }
        heavyScheduled = false;
      });
    });
  });
}

function shichenIndex(hour) {
  if (hour === 23 || hour === 0) return 0;
  return Math.floor((hour + 1) / 2);
}

function nextBoundary(date) {
  const d = new Date(date.getTime());
  d.setSeconds(0, 0);
  const h = d.getHours();
  if (h === 23) { d.setHours(23, 0, 0, 0); if (date >= d) { d.setDate(d.getDate() + 1); d.setHours(1, 0, 0, 0); } return d; }
  if (h === 0) { d.setHours(1, 0, 0, 0); return d; }
  let nextH = h + 1;
  if (nextH % 2 === 0) nextH += 1;
  d.setHours(nextH, 0, 0, 0);
  return d;
}

function compute(now) {
  const castDate = new Date(now.getTime()); // 北京时间
  const r = castByTime(castDate, { alreadyApparent: false });
  return { r, castDate };
}

export function updateHome() {
  const now = new Date();
  const { r, castDate } = compute(now);
  const shIdx = shichenIndex(castDate.getHours());

  if (shIdx !== lastShichen) {
    lastShichen = shIdx;
    const cy = castDate.getFullYear(), cm = castDate.getMonth() + 1, cd = castDate.getDate();
    const ch = castDate.getHours(), cmi = castDate.getMinutes();
    const sz = siZhuZi({ year: cy, month: cm, day: cd, hour: ch, minute: cmi });
    const cal = getDayCalendar({ year: cy, month: cm, day: cd, hour: ch, minute: cmi });
    $('#home-sizhu').textContent = `${sz.yearGanZhi}年 ${sz.monthGanZhi}月 ${sz.dayGanZhi}日 ${sz.timeGanZhi}时`;
    $('#home-nongli').textContent = cal.nongli;
    $('#home-jianchu').textContent = `建除·${cal.jianchu}`;
    const jqEl = $('#home-jieqi');
    if (jqEl) {
      jqEl.textContent = cal.daysToNextJieqi > 0
        ? `${cal.prevJieqi} → ${cal.nextJieqi}（还有${cal.daysToNextJieqi}天·${cal.nextJieqiDate}）`
        : `今日交节·${cal.nextJieqi}（${cal.nextJieqiDate}）`;
    }
    renderGua(r, castDate);
    // 重量卡（日课星历 / 节律 / 60天天象日历）：异步分块、按自然日只算一次，不阻塞首帧与点击
    const dk = dayKey(castDate);
    if (dk !== lastHeavyDate) { lastHeavyDate = dk; scheduleHeavy(castDate); }
  }

  $('#clock-time').textContent = `${pad(now.getHours())}:${pad(now.getMinutes())}:${pad(now.getSeconds())}`;
  const md = getMeridian(castDate);
  $('#home-meridian').innerHTML = meridianBand(md, shIdx);

  const nb = nextBoundary(castDate);
  const secs = Math.max(0, Math.round((nb - castDate) / 1000));
  $('#now-gua-countdown').textContent = `距${ZHI[(shIdx + 1) % 12]}时换卦 ${pad(Math.floor(secs / 60))}:${pad(secs % 60)}`;
}

function renderGua(r, castDate) {
  const p = paipanZi({
    yaoValues: r.cast.yaoValues,
    year: castDate.getFullYear(), month: castDate.getMonth() + 1, day: castDate.getDate(),
    hour: castDate.getHours(), minute: castDate.getMinutes(),
  });
  lastR = { r, castDate, p };
  $('#now-gua-title').textContent =
    `本时辰天时卦 · ${TRI[r.upperNumber]}上${TRI[r.lowerNumber]}下 · 第${r.movingPosition}爻动`;
  $('#now-gua-names').innerHTML = p.bianGua
    ? `<span class="ben">${p.benGua.name}</span><span class="arrow">之</span><span class="bian">${p.bianGua.name}</span>`
    : `<span class="ben">${p.benGua.name}</span>`;
  const hex = $('#now-gua-hex');
  if (hex) hex.innerHTML = hexHtml(r.cast.yaoValues);
}

// 六爻 HTML：自上而下（初爻在底），动爻朱砂高亮+右点
function hexHtml(yaoValues) {
  let out = '';
  for (let i = 5; i >= 0; i--) {
    const v = yaoValues[i];
    const yang = v === 7 || v === 9;
    const moving = v === 6 || v === 9;
    const pos = ['初','二','三','四','五','上'][i];
    out += `<div class="ng-line${moving ? ' moving' : ''}">
      <span class="ng-pos">${pos}</span>
      <span class="ng-bar">${yang ? '<i class="seg yang"></i>' : '<i class="seg yin"></i><i class="seg yin"></i>'}</span>
      <span class="ng-mark">${moving ? '●' : ''}</span>
    </div>`;
  }
  return out;
}

/* ---------------- 首页一键复制文本（AI 易读，不追求排版严谨） ---------------- */
export function homeCopyText() {
  const now = new Date();
  const { r, castDate } = compute(now);
  const shIdx = shichenIndex(castDate.getHours());
  const sz = siZhuZi({
    year: castDate.getFullYear(), month: castDate.getMonth() + 1, day: castDate.getDate(),
    hour: castDate.getHours(), minute: castDate.getMinutes(),
  });
  const cal = getDayCalendar({
    year: castDate.getFullYear(), month: castDate.getMonth() + 1, day: castDate.getDate(),
    hour: castDate.getHours(), minute: castDate.getMinutes(),
  });
  const p = paipanZi({
    yaoValues: r.cast.yaoValues,
    year: castDate.getFullYear(), month: castDate.getMonth() + 1, day: castDate.getDate(),
    hour: castDate.getHours(), minute: castDate.getMinutes(),
  });
  const md = getMeridian(castDate);
  const yaoTxt = r.cast.yaoValues.map((v, i) => {
    const yy = (v === 7 || v === 9) ? '阳' : '阴';
    const mv = (v === 6 || v === 9) ? '·动' : '';
    return `${['初','二','三','四','五','上'][i]}爻${yy}${mv}`;
  }).reverse().join('，');
  return [
    '【钦天监 · 此刻天时】',
    `北京时间 ${castDate.getFullYear()}-${pad(castDate.getMonth()+1)}-${pad(castDate.getDate())} ${pad(castDate.getHours())}:${pad(castDate.getMinutes())}（${ZHI[shIdx]}时 ${ZHI_RANGE[shIdx]}）`,
    `干支：${sz.yearGanZhi}年 ${sz.monthGanZhi}月 ${sz.dayGanZhi}日 ${sz.timeGanZhi}时`,
    `农历：${cal.nongli}；建除·${cal.jianchu}；${cal.daysToNextJieqi > 0 ? `距${cal.nextJieqi} ${cal.daysToNextJieqi} 天（${cal.nextJieqiDate}）` : `今日交节·${cal.nextJieqi}`}`,
    `当令经络：${md.meridian}（表里 ${md.paired}）`,
    `本时辰天时卦：${p.benGua.name}${p.bianGua ? ' 之 ' + p.bianGua.name : ''}（${TRI[r.upperNumber]}上${TRI[r.lowerNumber]}下，第${r.movingPosition}爻动）`,
    `六爻（自上而下）：${yaoTxt}`,
  ].join('\n');
}

export function currentTimeGua() {
  const now = new Date();
  const { r, castDate } = compute(now);
  const pan = paipanZi({
    yaoValues: r.cast.yaoValues,
    year: castDate.getFullYear(), month: castDate.getMonth() + 1, day: castDate.getDate(),
    hour: castDate.getHours(), minute: castDate.getMinutes(),
    gender: cfg.gender,
  });
  return { pan, cast: r, castDate, source: 'time' };
}
