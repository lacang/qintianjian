// 印度占星 · 吠陀 Jyotisha 本命盘子视图（v93）
// 恒星黄道 Lahiri · 整宫 Rashi(D1) · 九曜 · 二十七宿 · Panchanga 五要素 · D9/D10/D7 分盘（含 Navamsa Lagna）· Vimshottari 大运 · Graha Drishti · Yoga
// 只依赖本地 caelus（已打进 vendor），不接任何在线服务。
import { paipanVedic } from '../vendor/liuyao-core.js?v=133';
import { guard, renderWarnings , markRenderError } from './errors.js?v=133'; // 错误边界（P0-2）：渲染抛错不再白屏
import { birthArgs, $ } from './state.js?v=133';
import { gateHTML, stage, isCasted } from './ritual.js?v=133';

function escapeHtml(s){ return String(s).replace(/[&<>"']/g, c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c])); }

const SIGN_SHORT = ['羊','牛','双','蟹','狮','女','秤','蝎','射','羯','瓶','鱼'];
const SIGN_FULL  = ['白羊','金牛','双子','巨蟹','狮子','处女','天秤','天蝎','射手','摩羯','水瓶','双鱼'];
const SG_KEY = ['aries','taurus','gemini','cancer','leo','virgo','libra','scorpio','sagittarius','capricorn','aquarius','pisces'];
/** 九曜单字（复现码与分盘格内共用） */
const DIM_COPY = { sun:'日', moon:'月', mars:'火', mercury:'水', jupiter:'木', venus:'金', saturn:'土', rahu:'罗', ketu:'计' };
const G_COLOR = {
  sun:'#f2b24b', moon:'#dfe6f2', mars:'#e06b51', mercury:'#9fb4c7',
  jupiter:'#d9a86a', venus:'#e7a7c4', saturn:'#cbb98c', rahu:'#7d9be8', ketu:'#b08ad6' };
const DIGNITY = {
  exalted: { t: '庙旺', cls: 'dg-exalt', tip: 'vd-dignity' },
  own:      { t: '本宫', cls: 'dg-own', tip: 'vd-dignity' },
  debilitated: { t: '陷落', cls: 'dg-debil', tip: 'vd-dignity' },
  neutral:  { t: '', cls: '', tip: 'vd-dignity' },
};

function fmt(d){ return `${String(d.degree).padStart(2,'0')}°${String(d.minute).padStart(2,'0')}′`; }
const t = (key, text) => `<span class="gt" data-tip="${key}">${escapeHtml(text)}</span>`;

// 本视图新增段落的样式（不写进 vedic.css，避免与主样式表的版本对齐冲突）
const VD_EXTRA_CSS = `
<style>
.vd-pa-list{display:flex;flex-direction:column}
.vd-pa-row{display:flex;align-items:baseline;gap:10px;padding:8px 2px;border-top:1px solid rgba(255,255,255,.05);font-size:13px;flex-wrap:wrap}
.vd-pa-row:first-child{border-top:0}
.vd-pa-k{flex:0 0 96px;color:var(--ink-faint);font-size:12px}
.vd-pa-v{color:var(--ink)}
.vd-pa-v small{color:var(--ink-faint);font-size:11px;margin-left:5px}
.vd-pa-n{color:var(--ink-faint);font-size:11.5px;margin-left:auto;text-align:right}
</style>`;

function buildVedic(){
  const args = birthArgs();
  return { chart: paipanVedic(args), args };
}

// 实足年龄（用于定位当前大运）
function currentAge(a){
  const now = new Date();
  let age = now.getFullYear() - a.year;
  const m = now.getMonth() + 1 - a.month;
  if (m < 0 || (m === 0 && now.getDate() < a.day)) age--;
  return Math.max(0, age);
}
function ageLabel(y, birthYear){ // 大运岁数 → 大致公历年（用真实出生年加权，不再写死年份）
  const by = Number.isFinite(birthYear) ? birthYear : new Date().getFullYear();
  return Math.round(by + y);
}

function __renderVedic(){
  const body = $('#vedic-body'); if(!body) return;
  if (!isCasted('vedic')) { body.innerHTML = gateHTML('vedic'); return; }
  let chart, args;
  try { ({ chart, args } = buildVedic()); }
  catch(e){ markRenderError(e); body.innerHTML = errorHtml(e, '印度占星盘计算失败'); return; }

  const G = chart.bodies;
  const age = currentAge(args);
  const curDasa = chart.vimshottari.sequence.find(p => age >= p.startYear && age < p.endYear) || chart.vimshottari.sequence[chart.vimshottari.sequence.length-1];
  const moon = G.moon, ascIdx = chart.ascSignIndex;

  // ---------- 概览 ----------
  const overview = `
  <div class="vd-ov">
    <div class="vd-ov-row">
      <div class="vd-ov-item">
        <div class="vd-ov-k">${t('vd-lagna','上升 Lagna')}</div>
        <div class="vd-ov-v">${t('sg-'+(SG_KEY[ascIdx]), SIGN_FULL[ascIdx])} ${fmt(chart.asc)}</div>
      </div>
      <div class="vd-ov-item">
        <div class="vd-ov-k">${t('vd-lagnesh','命主星 Lagnesh')}</div>
        <div class="vd-ov-v" style="color:${G_COLOR[chart.lagnaLord]||'#e8c87a'}">${t('vd-lagnesh', chart.lagnaLordName)} <small>落 ${G[chart.lagnaLord] ? G[chart.lagnaLord].house+'宫' : ''}</small></div>
      </div>
    </div>
    <div class="vd-ov-row">
      <div class="vd-ov-item">
        <div class="vd-ov-k">${t('vd-nakshatra','月座 · 二十七宿')}</div>
        <div class="vd-ov-v">${t('sg-'+(SG_KEY[moon.signIndex]), moon.signName)} ·
          ${t('vd-nakshatra', chart.moonNakshatra.zh)} ${t('vd-pada','第'+chart.moonNakshatra.pada+'足')}
          <small>${chart.moonNakshatra.sa}</small></div>
      </div>
      <div class="vd-ov-item">
        <div class="vd-ov-k">${t('vd-lahiri','岁差 Ayanamsa')}</div>
        <div class="vd-ov-v">Lahiri ${chart.ayanamsaDeg.toFixed(2)}°</div>
      </div>
    </div>
    <div class="vd-ov-row">
      <div class="vd-ov-item vd-ov-wide">
        <div class="vd-ov-k">${t('vd-vimshottari','当前大运（你现 '+age+' 岁）')}</div>
        <div class="vd-ov-v" style="color:${G_COLOR[curDasa.graha]||'#e8c87a'}">${t('vd-vimshottari', curDasa.name+'大运')}
          ${curDasa.startYear.toFixed(1)}–${curDasa.endYear.toFixed(1)}岁
          <small>约 ${ageLabel(curDasa.startYear, args.year)}–${ageLabel(curDasa.endYear, args.year)} 年</small></div>
      </div>
    </div>
    ${guideBlock()}
  </div>`;

  // ---------- Panchanga 五要素 ----------
  const P = chart.panchanga;
  const riseMin = P.vara.sunrise ? Number(P.vara.sunrise.slice(0, 2)) * 60 + Number(P.vara.sunrise.slice(3, 5)) : null;
  const beforeRise = riseMin != null && (args.hour * 60 + args.minute) < riseMin;
  const varaTip = P.vara.basis === 'sunrise'
    ? `以当日日出 ${P.vara.sunrise} 为一日之始（出生在日出${beforeRise ? '之前，仍算前一日' : '之后'}，故记${P.vara.name}）`
    : '未取到当日日出，按钟面日期记日';
  const pRow = (k, v, note) => `<div class="vd-pa-row"><span class="vd-pa-k">${k}</span><span class="vd-pa-v">${v}</span>${note ? `<span class="vd-pa-n">${note}</span>` : ''}</div>`;
  const panchanga = `
  <div class="vd-card">
    <div class="vd-card-hd"><h3>五要素 Panchanga</h3>
      <span class="vd-hd-note">月日黄经差 ${P.elongation.toFixed(2)}°｜同一次计算同时得出，供逐项核对</span></div>
    <div class="vd-pa-list">
      ${pRow('月相日 Tithi',
        `<b>${P.tithi.name}</b> <small>${P.tithi.sa}</small>`,
        `${P.tithi.pakshaZh} 第 ${P.tithi.num} 日（共 30）· 已过 ${(P.tithi.elapsed * 100).toFixed(1)}%`)}
      ${pRow('宿 Nakshatra',
        `<b>${P.nakshatra.zh}</b> <small>${P.nakshatra.sa}</small>`,
        `第 ${P.nakshatra.pada} 足（共 4）· 宿主 ${G[P.nakshatra.lord] ? G[P.nakshatra.lord].name : ''}`)}
      ${pRow('瑜伽 Yoga',
        `<b>${P.yoga.sa}</b> <small>${P.yoga.zh}</small>`,
        `第 ${P.yoga.num} / 27 · 日+月黄经和所在段`)}
      ${pRow('卡拉纳 Karana',
        `<b>${P.karana.name}</b> <small>${P.karana.sa}</small>`,
        `第 ${P.karana.num} / 60（一个 Tithi = 两个 Karana，各 6°）`)}
      ${pRow('七曜日 Vara',
        `<b>${P.vara.name}</b> <small>${P.vara.sa}</small>`,
        `值日星 ${P.vara.lordName} · ${varaTip}`)}
    </div>
    <div class="vd-sub-note">Tithi 按 (月−日黄经差)/12° 取整 +1；Yoga 按 (日+月)/13°20′；Karana 按每 6° 一个；Vara 以日出换日。五项均用同一恒星黄经（Lahiri），可逐项与任何一本印度历对照。</div>
  </div>`;

  // ---------- D1 南印度风格 12 宫格（按星座顺序排，宫号从上升起） ----------
  const cells = [];
  for(let s=0;s<12;s++){
    const house = ((s-ascIdx+12)%12)+1;
    const h = chart.houses[house-1];
    const isAsc = s===ascIdx;
    const occ = h.bodies.map(id=>{
      const b=G[id], dg=DIGNITY[b.dignity];
      return `<button type="button" class="vd-g" data-tip="vd-graha@sg-${SG_KEY[s]}${b.dignity!=='neutral'?'@vd-dignity':''}${b.retrograde?'@vd-retro':''}"
        style="color:${G_COLOR[id]}" title="${b.sa}">${b.short}${b.retrograde?'<i>℞</i>':''}</button>`;
    }).join('');
    cells.push(`<div class="vd-cell${isAsc?' vd-cell-asc':''}">
      <div class="vd-cell-hd">
        <span class="vd-csign" data-tip="sg-${SG_KEY[s]}">${SIGN_SHORT[s]}</span>
        <span class="vd-chouse">${house}宫</span>
      </div>
      <div class="vd-cgrahas">${occ || '<span class="vd-empty">·</span>'}</div>
      <div class="vd-clord" data-tip="vd-lagnesh">主 ${G[h.lord]?G[h.lord].short:''}</div>
    </div>`);
  }
  const d1 = `
  <div class="vd-card">
    <div class="vd-card-hd"><h3>${t('vd-rashi','本命盘 D1 · 整宫 Rashi（南印度式宫格）')}</h3>
      <span class="vd-hd-note">按星座顺序排列，宫号从上升起；高亮为第 1 宫</span></div>
    <div class="vd-grid">${cells.join('')}</div>
    <div class="vd-grid-legend">
      <span><i class="vd-dot" style="background:${G_COLOR.rahu}"></i>${t('vd-rahu','罗睺=北交')}</span>
      <span><i class="vd-dot" style="background:${G_COLOR.ketu}"></i>${t('vd-rahu','计都=南交')}</span>
      <span><i class="vd-rx">℞</i>${t('vd-retro','逆行')}</span>
    </div>
  </div>`;

  // ---------- 分盘 D9 / D10 / D7：各以自身上升起，整宫十二宫 ----------
  const DIM = DIM_COPY;
  const vargaCell = (h, small) => {
    const isAsc = h.house === 1;
    const grahas = h.bodies.map(id => `<span class="vd-g" style="color:${G_COLOR[id]}" title="${G[id] ? G[id].sa : ''}">${DIM[id] || (G[id] ? G[id].short : '')}</span>`).join('');
    return `<div class="vd-cell${isAsc ? ' vd-cell-asc' : ''}"${small ? ' style="min-height:62px;padding:6px 7px"' : ''}>
      <div class="vd-cell-hd">
        <span class="vd-csign"${small ? ' style="font-size:12px"' : ''}>${SIGN_SHORT[h.signIndex]}</span>
        <span class="vd-chouse">${h.house}宫${isAsc ? ' ▲' : ''}</span>
      </div>
      <div class="vd-cgrahas">${grahas || '<span class="vd-empty">·</span>'}</div>
      <div class="vd-clord" style="font-size:9.5px">主 ${DIM[h.lord] || ''}</div>
    </div>`;
  };
  const vargaHd = (v) => `<b style="color:var(--gold)">${v.lagnaSignName}</b> ${fmt(v.lagnaDms)} <small>命主 ${DIM[v.houses[0].lord] || ''}</small>`;
  const d9 = chart.navamsha, d10 = chart.dasamsa, d7 = chart.saptamsa;
  const vargaCard = `
  <div class="vd-card">
    <div class="vd-card-hd"><h3>${t('vd-navamsha','九分盘 D9 · Navamsha')}</h3>
      <span class="vd-hd-note">D9 上升 Navamsa Lagna：${vargaHd(d9)}｜每宫 3°20′ 一分，整宫从 D9 上升起</span></div>
    <div class="vd-grid">${d9.houses.map(h => vargaCell(h, false)).join('')}</div>
    <div class="vd-sub-note">D9 是印度盘里看婚姻与「内在真实力量」的盘：D1 里显得有力的星，若在 D9 落陷，多半是虚旺。
      本盘第一格（▲）为 <b>D9 上升</b>，与 D1 上升是两回事——D1 上升 ${SIGN_FULL[chart.ascSignIndex]} ${fmt(chart.asc)}，D9 上升 ${SIGN_FULL[d9.lagnaSignIndex]} ${fmt(d9.lagnaDms)}。</div>
  </div>
  <div class="vd-card">
    <div class="vd-card-hd"><h3>事业盘 D10 · 子女盘 D7</h3>
      <span class="vd-hd-note">D10 上升 ${vargaHd(d10)}｜D7 上升 ${vargaHd(d7)}</span></div>
    <div style="display:grid;grid-template-columns:1fr;gap:10px">
      <div>
        <div class="vd-sub-note" style="margin:0 0 6px">${d10.vargaZh} · 每 3° 一分（阳宫起本宫、阴宫起第 9 宫）</div>
        <div class="vd-grid">${d10.houses.map(h => vargaCell(h, true)).join('')}</div>
      </div>
      <div>
        <div class="vd-sub-note" style="margin:0 0 6px">${d7.vargaZh} · 每 4°17′ 一分（阳宫起本宫、阴宫起第 7 宫）</div>
        <div class="vd-grid">${d7.houses.map(h => vargaCell(h, true)).join('')}</div>
      </div>
    </div>
    <div class="vd-sub-note">D10 看事业与「做的事能不能立住」，D7 看子女与创造力（也看后代缘）。两盘同为整宫制，每宫星座 = 该盘上升星座顺延。</div>
  </div>`;

  // ---------- 九曜明细表 ----------
  const order = ['sun','moon','mars','mercury','jupiter','venus','saturn','rahu','ketu'];
  const rows = order.map(id=>{
    const b=G[id], dg=DIGNITY[b.dignity];
    const sgk='sg-'+SG_KEY[b.signIndex];
    const plk = id==='rahu'||id==='ketu' ? 'vd-rahu' : ({sun:'pl-sun',moon:'pl-moon',mars:'pl-mars',mercury:'pl-mercury',jupiter:'pl-jupiter',venus:'pl-venus',saturn:'pl-saturn'}[id]);
    return `<div class="vd-graha-row">
      <span class="vd-glyph" style="background:${G_COLOR[id]};box-shadow:0 0 9px ${G_COLOR[id]}55;color:#101316" data-tip="${plk}">${b.short}</span>
      <span class="vd-gname" data-tip="${plk}">${b.name}<small>${b.sa}</small></span>
      <span class="vd-gpos" data-tip="${sgk}">${SIGN_SHORT[b.signIndex]} ${fmt(b.dms)}</span>
      <span class="vd-ghouse" data-tip="${houseTip(b.house)}">${b.house}宫</span>
      <span class="vd-gd9" data-tip="vd-navamsha">D9九分 ${SIGN_SHORT[b.navamshaSign]}</span>
      <span class="vd-gdg">${dg.t?`<span class="vd-tag ${dg.cls}" data-tip="${dg.tip}">${dg.t}</span>`:''}</span>
      <span class="vd-grx">${b.retrograde?`<span data-tip="vd-retro">℞ 逆</span>`:''}</span>
    </div>`;
  }).join('');
  const grahaTable = `
  <div class="vd-card">
    <div class="vd-card-hd"><h3>${t('vd-graha','九曜落位 · 尊贵 · D9')}</h3>
      <span class="vd-hd-note">点任意一处可看该星/星座/宫位含义</span></div>
    <div class="vd-graha-list">${rows}</div>
  </div>`;

  // ---------- 大运时间线 ----------
  const dasaRows = chart.vimshottari.sequence.map((p,i)=>{
    const isCur = p===curDasa;
    return `<div class="vd-dasa-row${isCur?' is-cur':''}">
      <span class="vd-dasa-g" style="color:${G_COLOR[p.graha]}">${t('vd-vimshottari', p.name)}</span>
      <span class="vd-dasa-age">${p.startYear.toFixed(1)}–${p.endYear.toFixed(1)} 岁</span>
      <span class="vd-dasa-year">${ageLabel(p.startYear, args.year)}–${ageLabel(p.endYear, args.year)}</span>
      ${isCur?'<span class="vd-dasa-now">现在</span>':''}
    </div>`;
  }).join('');
  const birthDasa = chart.vimshottari.sequence[0];
  const dasaCard = `
  <div class="vd-card">
    <div class="vd-card-hd"><h3>${t('vd-vimshottari','大运 Vimshottari（120 年制 · 二十七宿定运）')}</h3>
      <span class="vd-hd-note">出生二十七宿 ${chart.moonNakshatra.zh} 主 ${G[chart.moonNakshatra.lord]?G[chart.moonNakshatra.lord].name:''}，故首运 ${birthDasa.name}（${birthDasa.years.toFixed(1)} 年余量）</span></div>
    <div class="vd-dasa-list">${dasaRows}</div>
    <div class="vd-sub-note">出生时小限：${t('vd-antardasha', chart.vimshottari.antardasha.name+'小限')}（大运会再分九段小限看具体年份）</div>
  </div>`;

  // ---------- Drishti 相位 ----------
  const aspRows = chart.aspects.length ? chart.aspects.map(a=>{
    const A=G[a.from], B=G[a.to];
    const kind = a.house===7 ? '正照第7宫' : `专照第${a.house}宫`;
    return `<div class="vd-asp-row">
      <span class="vd-glyph vd-glyph-sm" style="background:${G_COLOR[a.from]};color:#101316">${A.short}</span>
      <span class="vd-asp-kind" data-tip="vd-drishti">${kind}</span>
      <span class="vd-asp-arrow">→</span>
      <span class="vd-glyph vd-glyph-sm" style="background:${G_COLOR[a.to]};color:#101316">${B.short}</span>
      <span class="vd-asp-note">${A.short} 在${A.house}宫照 ${B.short} 在${B.house}宫</span>
    </div>`;
  }).join('') : '<div class="vd-none">本盘无符合通行规则的星—星照临（仅有宫位照临未列）。</div>';
  const aspCard = `
  <div class="vd-card">
    <div class="vd-card-hd"><h3>${t('vd-drishti','行星照临 Graha Drishti')}</h3>
      <span class="vd-hd-note">所有星照正对面第7宫；火另照4/8、木5/9、土3/10</span></div>
    <div class="vd-asp-list">${aspRows}</div>
  </div>`;

  // ---------- 瑜伽 ----------
  const present = chart.yogas.filter(y=>y.present);
  const absent = chart.yogas.filter(y=>!y.present);
  const yogaItem = (y, ok)=>`<div class="vd-yoga-row ${ok?'is-ok':'is-no'}">
    <span class="vd-yoga-mark">${ok?'✔':'—'}</span>
    <div class="vd-yoga-txt">
      <div class="vd-yoga-name" data-tip="${y.key==='gajakesari'?'vd-gajakesari':y.key==='budhaditya'?'vd-budhaditya':'vd-yoga'}">${y.zh} <small>${y.sa}</small></div>
      <div class="vd-yoga-members">${y.members.map(id=>`<span style="color:${G_COLOR[id]}">${G[id]?G[id].name:id}</span>`).join(' · ')}</div>
      <div class="vd-yoga-note">${escapeHtml(y.note)}</div>
    </div>
  </div>`;
  const yogaCard = `
  <div class="vd-card">
    <div class="vd-card-hd"><h3>${t('vd-yoga','成格 Yoga')}</h3>
      <span class="vd-hd-note">通行简化判定；成格是组合倾向，非宿命，仍看主星强弱与大运</span></div>
    <div class="vd-yoga-list">
      ${present.map(y=>yogaItem(y,true)).join('')}
      ${absent.map(y=>yogaItem(y,false)).join('')}
    </div>
  </div>`;

  // ---------- 分层声明 ----------
  const foot = `
  <div class="vd-foot">
    <p>本盘为印度 <b>Parashari 吠陀占星</b>口径：恒星黄道 Lahiri 岁差 ${chart.ayanamsaDeg.toFixed(2)}°、整宫制、九曜（不含三王）、Vimshottari 大运、Panchanga 五要素、D9/D10/D7 分盘（各盘自身上升起、整宫十二宫）。
    与西方古典盘是两套坐标与体系，星座通常比回归盘退约一格，两者并列呈现、不混用。</p>
    <p>所列庙旺、照临、成格均为<b>客观成相/尊贵事实</b>；具体吉凶倾向由古法规则另卡给出。
    罗睺计都庙旺、部分 Yoga 判定流派分歧较大处，已标注「通行简化版」，不做唯一结论。</p>
    <p class="vd-src">依据：《Brihat Parashara Hora Shastra》《Brihat Jataka》(Varahamihira)《Surya Siddhanta》；岁差用印度官方 Lahiri 标准，星历本地计算，无联网。</p>
  </div>`;

  body.innerHTML = stage(renderWarnings(chart) + VD_EXTRA_CSS + overview + panchanga + d1 + vargaCard + grahaTable + dasaCard + aspCard + yogaCard + foot, 'vedic');
}

function houseTip(h){ return 'hs-'+h; }

function guideBlock(){
  return `<div class="vd-guide">
    <div class="vd-guide-hd">怎么读这张印度盘（3 步）</div>
    <ol>
      <li><b>看上升与命主星：</b>${t('vd-lagna','Lagna')}定人生框架，${t('vd-lagnesh','Lagnesh')}落哪宫，精力与重心就在那。</li>
      <li><b>看九曜落位与尊贵：</b>庙旺/本宫的星有力，陷落难发；${t('vd-drishti','照临')}看星与星之间的加持或压力。</li>
      <li><b>看大运：</b>${t('vd-vimshottari','Vimshottari')}由出生月宿启动，定"哪几年走哪颗星的运"，应期主要看它。</li>
    </ol>
    <div class="vd-guide-tip">所有带 <span class="gt">下划线</span> 的词都能点开看白话解释。</div>
  </div>`;
}

// ---------- 复现码 / 复制 ----------
export function vedicCopyText(){
  let chart;
  try { ({ chart } = buildVedic()); } catch(e){ return '印度占星盘计算失败：'+(e.message||e); }
  const G=chart.bodies, args=birthArgs();
  const age=currentAge(args);
  const cur=chart.vimshottari.sequence.find(p=>age>=p.startYear&&age<p.endYear);
  const L=[];
  L.push('【印度占星 · 吠陀本命盘（Lahiri/整宫/九曜）】');
  L.push(`出生：${args.year}-${args.month}-${args.day} ${String(args.hour).padStart(2,'0')}:${String(args.minute).padStart(2,'0')}（UTC+8）${args.place||''}`);
  L.push(`岁差 Lahiri ${chart.ayanamsaDeg.toFixed(2)}°｜上升 ${chart.ascSignName} ${fmt(chart.asc)}｜命主星 ${chart.lagnaLordName}`);
  L.push(`月座 ${G.moon.signName}｜月宿 ${chart.moonNakshatra.zh}(${chart.moonNakshatra.sa}) 第${chart.moonNakshatra.pada}足`);
  const pc = chart.panchanga;
  L.push(`五要素 Tithi ${pc.tithi.name}(${pc.tithi.sa})｜Yoga ${pc.yoga.sa}｜Karana ${pc.karana.sa}(第${pc.karana.num}/60)｜Vara ${pc.vara.name}(${pc.vara.basis === 'sunrise' ? '日出' + pc.vara.sunrise + '起算' : '钟面日'})`);
  const vg = (v) => `${v.varga} 上升 ${v.lagnaSignName} ${fmt(v.lagnaDms)}｜` + v.houses.map(h => `${h.house}:${SIGN_SHORT[h.signIndex]}${h.bodies.length ? '[' + h.bodies.map(id => DIM_COPY[id]).join('') + ']' : ''}`).join(' ');
  L.push('— 分盘 —');
  [chart.navamsha, chart.dasamsa, chart.saptamsa].forEach(v => L.push(vg(v)));
  L.push('— 九曜 —');
  ['sun','moon','mars','mercury','jupiter','venus','saturn','rahu','ketu'].forEach(id=>{
    const b=G[id];
    L.push(`${b.name}(${b.sa}) ${b.signName}${fmt(b.dms)} ${b.house}宫 D9-${SIGN_SHORT[b.navamshaSign]}${b.dignity==='exalted'?' 庙旺':b.dignity==='own'?' 本宫':b.dignity==='debilitated'?' 陷落':''}${b.retrograde?' 逆':''}`);
  });
  L.push('— Vimshottari 大运 —');
  chart.vimshottari.sequence.forEach(p=>{ L.push(`${p.name} ${p.startYear.toFixed(1)}-${p.endYear.toFixed(1)}岁 (${ageLabel(p.startYear, args.year)}-${ageLabel(p.endYear, args.year)})${p===cur?' ← 当前':''}`); });
  L.push(`出生小限：${chart.vimshottari.antardasha.name}`);
  const pres=chart.yogas.filter(y=>y.present).map(y=>y.zh).join('、')||'无所列成格';
  L.push('成格：'+pres);
  if(chart.aspects.length){ L.push('照临：'+chart.aspects.map(a=>`${G[a.from].short}→${G[a.to].short}(第${a.house}宫)`).join('，')); }
  return L.join('\n');
}

// v121：改为与其它盘同构的复现码契约（kind + data），并带上计算配置
export function vedicCode(){
  const a = birthArgs();
  const at = new Date(a.year, a.month - 1, a.day, a.hour, a.minute, 0, 0).getTime();
  let chart = null;
  try { chart = paipanVedic(a); } catch { /* 排盘失败时只给时刻与地点 */ }
  return {
    kind: 'vedic',
    data: { at, gender: a.gender, lon: a.longitude ?? a.lonEast, lat: a.latitude ?? a.lat },
    title: chart && chart.ascSignName ? `上升${chart.ascSignName} · 吠陀 D1` : '吠陀本命盘',
    sub: `${a.year}-${String(a.month).padStart(2, '0')}-${String(a.day).padStart(2, '0')} ${String(a.hour).padStart(2, '0')}:${String(a.minute).padStart(2, '0')}${a.place ? ' · ' + a.place : ''}`,
  };
}

/* P0-2 错误边界：以上渲染入口统一兜底（audit3 · r1/r4 实测这些文件 catch 数为 0） */
export const renderVedic = guard(__renderVedic, '吠陀排盘失败', '#vedic-body');
