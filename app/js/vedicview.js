// 印度占星 · 吠陀 Jyotisha 本命盘子视图（v93）
// 恒星黄道 Lahiri · 整宫 Rashi(D1) · 九曜 · 二十七宿 · D9 Navamsha · Vimshottari 大运 · Graha Drishti · Yoga
// 只依赖本地 caelus（已打进 vendor），不接任何在线服务。
import { paipanVedic } from '../vendor/liuyao-core.js?v=120';
import { birthArgs, $ } from './state.js?v=120';
import { gateHTML, stage, isCasted } from './ritual.js?v=120';

function escapeHtml(s){ return String(s).replace(/[&<>"']/g, c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c])); }

const SIGN_SHORT = ['羊','牛','双','蟹','狮','女','秤','蝎','射','羯','瓶','鱼'];
const SIGN_FULL  = ['白羊','金牛','双子','巨蟹','狮子','处女','天秤','天蝎','射手','摩羯','水瓶','双鱼'];
const SG_KEY = ['aries','taurus','gemini','cancer','leo','virgo','libra','scorpio','sagittarius','capricorn','aquarius','pisces'];
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
function ageLabel(y){ // 大运岁数 → 大致公历年
  return Math.round(1994 + y);
}

export function renderVedic(){
  const body = $('#vedic-body'); if(!body) return;
  if (!isCasted('vedic')) { body.innerHTML = gateHTML('vedic'); return; }
  let chart, args;
  try { ({ chart, args } = buildVedic()); }
  catch(e){ body.innerHTML = `<div class="empty">印度占星盘计算失败：${escapeHtml(String(e.message||e))}</div>`; return; }

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
          <small>约 ${ageLabel(curDasa.startYear)}–${ageLabel(curDasa.endYear)} 年</small></div>
      </div>
    </div>
    ${guideBlock()}
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
      <span class="vd-dasa-year">${ageLabel(p.startYear)}–${ageLabel(p.endYear)}</span>
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
    <p>本盘为印度 <b>Parashari 吠陀占星</b>口径：恒星黄道 Lahiri 岁差 ${chart.ayanamsaDeg.toFixed(2)}°、整宫制、九曜（不含三王）、Vimshottari 大运。
    与西方古典盘是两套坐标与体系，星座通常比回归盘退约一格，两者并列呈现、不混用。</p>
    <p>所列庙旺、照临、成格均为<b>客观成相/尊贵事实</b>；具体吉凶倾向由古法规则另卡给出。
    罗睺计都庙旺、部分 Yoga 判定流派分歧较大处，已标注「通行简化版」，不做唯一结论。</p>
    <p class="vd-src">依据：《Brihat Parashara Hora Shastra》《Brihat Jataka》(Varahamihira)《Surya Siddhanta》；岁差用印度官方 Lahiri 标准，星历本地计算，无联网。</p>
  </div>`;

  body.innerHTML = stage(overview + d1 + grahaTable + dasaCard + aspCard + yogaCard + foot, 'vedic');
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
  L.push('— 九曜 —');
  ['sun','moon','mars','mercury','jupiter','venus','saturn','rahu','ketu'].forEach(id=>{
    const b=G[id];
    L.push(`${b.name}(${b.sa}) ${b.signName}${fmt(b.dms)} ${b.house}宫 D9-${SIGN_SHORT[b.navamshaSign]}${b.dignity==='exalted'?' 庙旺':b.dignity==='own'?' 本宫':b.dignity==='debilitated'?' 陷落':''}${b.retrograde?' 逆':''}`);
  });
  L.push('— Vimshottari 大运 —');
  chart.vimshottari.sequence.forEach(p=>{ L.push(`${p.name} ${p.startYear.toFixed(1)}-${p.endYear.toFixed(1)}岁 (${ageLabel(p.startYear)}-${ageLabel(p.endYear)})${p===cur?' ← 当前':''}`); });
  L.push(`出生小限：${chart.vimshottari.antardasha.name}`);
  const pres=chart.yogas.filter(y=>y.present).map(y=>y.zh).join('、')||'无所列成格';
  L.push('成格：'+pres);
  if(chart.aspects.length){ L.push('照临：'+chart.aspects.map(a=>`${G[a.from].short}→${G[a.to].short}(第${a.house}宫)`).join('，')); }
  return L.join('\n');
}

export function vedicCode(){
  const a=birthArgs();
  return { kind:'vedic', year:a.year, month:a.month, day:a.day, hour:a.hour, minute:a.minute,
    lat:a.latitude ?? a.lat, lonEast:a.longitude ?? a.lonEast, place:a.place||'' };
}
