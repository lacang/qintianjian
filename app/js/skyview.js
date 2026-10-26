// 当下天象 · 钦天监首页条 + 天象子视图（纯展示，只报事实）
// 现代星空风：精确 SVG 月相、行星主题色光点、玻璃卡片。全程中文，不依赖任何符号字体。
// 观测时刻可由「时间条」或复现码覆盖
import { shouyeTianxiang } from '../vendor/liuyao-core.js?v=121';
import { $, nowDate, pad, toSec } from './state.js?v=121';
import { zodiacMapSVG } from './zodiac.js?v=121';
import { planetaryHour, planetaryHoursOfDay, PLANET_HR } from './solartime.js?v=121';

function escapeHtml(s){ return String(s).replace(/[&<>"']/g, c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c])); }

const P_COLOR = {
  sun:'#f2b24b', moon:'#dfe6f2', mercury:'#9fb4c7', venus:'#e7a7c4',
  mars:'#e06b51', jupiter:'#d9a86a', saturn:'#cbb98c', uranus:'#7fd0d6',
  neptune:'#7d9be8', pluto:'#b08ad6',
};
const P_CN = { sun:'太阳', moon:'月亮', mercury:'水星', venus:'金星', mars:'火星',
  jupiter:'木星', saturn:'土星', uranus:'天王星', neptune:'海王星', pluto:'冥王星' };

function pct(v){ return Math.round(v*100); }
const TIP_ID = { mean_node: 'node' };
function beijing(iso){ try{ return new Date(iso).toLocaleString('zh-CN',{timeZone:'Asia/Shanghai',month:'numeric',day:'numeric',hour:'2-digit',minute:'2-digit',hour12:false}); }catch{ return iso; } }
function momentText(d){ return `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`; }

// 写实月相：程序化绘制月面——月海暗斑、环形山与射线、临边昏暗、
// 明暗界线柔化（mask+blur）、暗面微弱地球反照。北半球视角：盈在右、亏在左。
let moonUid = 0;
export function moonSVG(phase01, size=44){
  const uid = 'mn' + (++moonUid);
  const R = 44, C = 50;
  // 明暗界线（月相几何，与此前一致）
  let lit = null;
  if (phase01 >= 0.995) {
    lit = `M ${C} ${C-R} A ${R} ${R} 0 1 1 ${C} ${C+R} A ${R} ${R} 0 1 1 ${C} ${C-R} Z`;
  } else if (phase01 > 0.005) {
    const waxing = phase01 < 0.5;
    const e = Math.abs(Math.cos(2*Math.PI*phase01)) * R;
    const sOuter = waxing ? 0 : 1;
    const sTerm = waxing ? (phase01 < 0.25 ? 1 : 0) : (phase01 < 0.75 ? 1 : 0);
    const termArc = e < 1.5 ? `A 0 ${R} 0 0 ${sTerm} ${C} ${C+R}` : `A ${e.toFixed(2)} ${R} 0 0 ${sTerm} ${C} ${C+R}`;
    lit = `M ${C} ${C-R} ${termArc} A ${R} ${R} 0 0 ${sOuter} ${C} ${C-R} Z`;
  }
  const TEX = './assets/moon-tex.jpg?v=121';
  // 真实近月面纹理（等距圆柱月图，方形裁切居中即近地面）
  const tex = `<image href="${TEX}" x="${C-R}" y="${C-R}" width="${2*R}" height="${2*R}" preserveAspectRatio="xMidYMid slice" clip-path="url(#${uid}c)"/>`;
  return `<svg class="moon-svg" width="${size}" height="${size}" viewBox="0 0 100 100" aria-hidden="true">
    <defs>
      <clipPath id="${uid}c"><circle cx="${C}" cy="${C}" r="${R}"/></clipPath>
      <mask id="${uid}m"><rect x="0" y="0" width="100" height="100" fill="#000"/>${lit ? `<path d="${lit}" fill="#fff"/>` : ''}</mask>
      <radialGradient id="${uid}h" cx="50%" cy="50%" r="50%">
        <stop offset="80%" stop-color="rgba(255,255,255,0)"/>
        <stop offset="97%" stop-color="rgba(206,200,180,.30)"/>
        <stop offset="100%" stop-color="rgba(120,116,100,.55)"/>
      </radialGradient>
      <radialGradient id="${uid}s" cx="38%" cy="30%" r="80%">
        <stop offset="0%" stop-color="rgba(255,255,255,.16)"/>
        <stop offset="55%" stop-color="rgba(255,255,255,0)"/>
      </radialGradient>
    </defs>
    <g clip-path="url(#${uid}c)">
      <!-- 暗部：地球反照微光下的同一真实月面 -->
      <rect x="${C-R}" y="${C-R}" width="${2*R}" height="${2*R}" fill="#10131a"/>
      <g opacity=".10">${tex}</g>
      <!-- 亮部：真实月面 -->
      <g mask="url(#${uid}m)">${tex}</g>
      <!-- 亮部球面临边渐亮/晨昏柔化 -->
      <rect x="${C-R}" y="${C-R}" width="${2*R}" height="${2*R}" fill="url(#${uid}s)" mask="url(#${uid}m)"/>
    </g>
    <circle cx="${C}" cy="${C}" r="${R}" fill="url(#${uid}h)"/>
    <circle class="mn-rim" cx="${C}" cy="${C}" r="${R}"/>
    <circle class="mn-halo" cx="${C}" cy="${C}" r="${R + 3.5}"/>
  </svg>`;
}

// 首页紧凑条：月相图 + 月相名% + 日星座 + 逆行星（中文名，点号分隔）—— 首页永远实时
export function renderHomeSky(now=new Date()){
  const el=$('#home-sky'); if(!el) return;
  try{
    const t=shouyeTianxiang(now);
    const ret=t.bodies.filter(b=>b.retrograde && !['sun','moon','mean_node'].includes(b.id)).map(b=>P_CN[b.id]||b.name);
    const sun=t.bodies.find(b=>b.id==='sun');
    el.innerHTML=`
      <span class="hs-moon">${moonSVG(t.moon.phase01,38)}</span>
      <span class="hs-mid">
        <span class="hs-phase">${t.moon.phaseName} · ${pct(t.moon.illumination)}%</span>
        <span class="hs-sub">月在${t.moon.signName} · 日在${sun?sun.signName:''}</span>
      </span>
      <span class="hs-retro ${ret.length?'':'none'}">${ret.length?'逆行<br>'+ret.map(n=>n.replace('星','')).join(' · '):'顺行'}</span>`;
    el.classList.remove('skeleton');
  }catch(e){ el.innerHTML='<span class="hs-err">天象暂不可用</span>'; }
}

export function renderSky(now=nowDate()){
  const body=$('#sky-body'); if(!body) return;
  let t;
  try{ t=shouyeTianxiang(now); }
  catch(e){ body.innerHTML=`<div class="empty">天象计算失败：${escapeHtml(String(e.message||e))}</div>`; return; }

  const planets=t.bodies.filter(b=>b.id!=='moon');
  const rows=planets.map(b=>`
    <div class="pl-row ${b.retrograde?'is-retro':''}" data-tip="pl-${TIP_ID[b.id]||b.id}">
      <span class="pl-dot" style="--pc:${P_COLOR[b.id]||'#ccc'};box-shadow:0 0 10px ${P_COLOR[b.id]||'#ccc'}66"></span>
      <span class="pl-name">${P_CN[b.id]||b.name}</span>
      <span class="pl-sign">${b.signName}</span>
      <span class="pl-state">${b.retrograde?'逆行':'顺行'}</span>
    </div>`).join('');

  const moon=t.moon;
  // 近期天时：汇总后按时间排序，渲染为胶囊
  const Q_TIP={'新月':'ev-newmoon','上弦月':'ev-firstq','上弦':'ev-firstq','满月':'ev-fullmoon','下弦月':'ev-lastq','下弦':'ev-lastq'};
  const evs=[];
  for(const q of (moon.nextQuarters||[]).slice(0,4)) evs.push({iso:q.iso,name:q.name,type:'moon',tip:Q_TIP[q.name]||'ev-newmoon'});
  for(const g of t.ingresses) evs.push({iso:g.iso,name:'日入'+g.signName,type:'sun',tip:'ev-ingress'});
  const mr=t.mercuryRetro;
  if(mr){
    if(mr.status==='now') evs.push({iso:mr.stationDirectIso,name:'水逆留顺',type:'merc',hot:true,tip:'ev-mercdirect'});
    else { evs.push({iso:mr.stationRetrogradeIso,name:'水逆起逆',type:'merc',tip:'ev-mercretro'}); evs.push({iso:mr.stationDirectIso,name:'水逆留顺',type:'merc',tip:'ev-mercdirect'}); }
  }
  evs.sort((a,b)=>new Date(a.iso)-new Date(b.iso));
  const chips=evs.map(e=>`<span class="tc-chip t-${e.type}${e.hot?' hot':''}" data-tip="${e.tip}"><i class="tc-dot ${e.type}"></i><b>${e.name}</b><em>${beijing(e.iso)}</em></span>`).join('');
  const ret=t.bodies.filter(b=>b.retrograde && !['sun','moon','mean_node'].includes(b.id));

  // 行星时（迦勒底秩序）：日出为日界，昼夜各十二等分
  const PH_CID={ '土星':'saturn','木星':'jupiter','火星':'mars','太阳':'sun','金星':'venus','水星':'mercury','月亮':'moon' };
  const PH_TIP={ '土星':'pl-saturn','木星':'pl-jupiter','火星':'pl-mars','太阳':'pl-sun','金星':'pl-venus','水星':'pl-mercury','月亮':'pl-moon' };
  const hr = planetaryHour(now);
  let phBlock='';
  if (hr && PLANET_HR[hr.hourPlanet]) {
    const col=P_COLOR[PH_CID[hr.hourPlanet]]||'#ccc';
    const fmt=d=>`${pad(d.getHours())}:${pad(d.getMinutes())}`;
    phBlock=`
  <div class="sky-sec-h">行星时 · 昼夜各十二时</div>
  <div class="ph-card">
    <div class="ph-now">
      <span class="ph-dot" style="--pc:${col}"></span>
      <div class="ph-mid">
        <b><span data-tip="${PH_TIP[hr.dayRuler]}">${hr.dayRuler}</span>司日 · <span data-tip="${PH_TIP[hr.hourPlanet]}">${hr.hourPlanet}</span>时（${hr.phase}间第 ${hr.hourNo} 时）</b>
        <span class="ph-rg">${fmt(hr.start)} – ${fmt(hr.end)} · ${hr.isDay?`昼时约 ${hr.dayHours} 分`:`夜时约 ${hr.nightHours} 分`}</span>
        <span class="ph-sun">日出 ${fmt(hr.sunrise)} · 日落 ${fmt(hr.sunset)}</span>
      </div>
    </div>
    <div class="ph-use"><span data-tip="ph-rule">此时宜：${PLANET_HR[hr.hourPlanet].k}<i class="ph-i">ⓘ</i></span></div>
    <div class="ph-src">${PLANET_HR[hr.hourPlanet].s}</div>
  </div>`;
  }

  const map=zodiacMapSVG(now, moonSVG);
  body.innerHTML=`
  <div class="zm-card">
    <div class="zm-scroll" id="zm-scroll">${map.svg}</div>
    <div class="zm-hint">‹ 左右滑动 · 点星座/行星看详解 ›<span class="zm-jumps"><span class="zm-jump" data-jump="sun">定位·日</span><span class="zm-jump" data-jump="moon">定位·月</span></span></div>
    <div class="sh-strip" data-tip="pl-moon">
      <span class="sh-moon">${moonSVG(moon.phase01,28)}</span>
      <span class="sh-mid">
        <span class="sh-phase-name">${moon.phaseName}</span>
        <span class="sh-illum">${pct(moon.illumination)}% 被照亮 · 月在${moon.signName} · 月龄 ${moon.ageDays.toFixed(1)} 天</span>
      </span>
    </div>
    <div class="sh-time">${momentText(now)} · 北京时间</div>
  </div>

  <div class="sky-sec-h">行星 · 该时刻黄道</div>
  <div class="pl-grid">${rows}</div>
  <div class="pl-retro-note">${ret.length?('逆行：'+ret.map(b=>P_CN[b.id]).join('、')):'该时刻七政与三王皆顺行'}</div>
  ${phBlock}
  <div id="ph-pick">${phPanelHTML(now)}</div>
  <div class="sky-sec-h">近期天时</div>
  <div class="tc-chips">${chips}</div>
  <div class="sky-foot">时刻均为北京时间 · 本地天文计算，离线可查</div>`;

  // 初始把太阳放在视口中央；日/月跳转（viewBox 坐标→实际渲染像素）
  const sc=$('#zm-scroll');
  const MAPW=1520;
  const locate=(tx,smooth)=>{
    if(!sc||!sc.scrollTo) return;
    const cw=sc.clientWidth||360;
    const svg=sc.querySelector&&sc.querySelector('.zm-svg');
    const mapW=(svg&&svg.getBoundingClientRect&&svg.getBoundingClientRect().width)||MAPW;
    const k=mapW/MAPW, max=Math.max(0,mapW-cw);
    const left=Math.max(0,Math.min(tx*k-cw/2,max));
    try{ sc.scrollTo(smooth?{left,behavior:'smooth'}:{left}); }catch(e){ sc.scrollLeft=left; }
  };
  bindPhPick(now);
  requestAnimationFrame(()=>locate(map.sunX,false));
  body.querySelectorAll('.zm-jump').forEach((b)=>b.addEventListener('click',()=>{
    locate(b.dataset.jump==='moon'?map.moonX:map.sunX,true);
  }));
}

// 一键复制（AI 易读，格式宽松）
export function skyCopyText(now=nowDate()){
  const t=shouyeTianxiang(now);
  const m=t.moon;
  const L=['【当下天象】'];
  L.push(`北京时间 ${momentText(now)}`);
  L.push(`月相：${m.phaseName}，照亮 ${pct(m.illumination)}%，月龄 ${m.ageDays.toFixed(1)} 天，月在${m.signName}`);
  L.push('—— 该时刻行星 ——');
  for(const b of t.bodies){
    if(b.id==='mean_node') continue;
    L.push(`${P_CN[b.id]||b.name} ${b.signName}${b.retrograde?' 逆行':' 顺行'}`);
  }
  const mr=t.mercuryRetro;
  if(mr){
    if(mr.status==='now') L.push(`水星逆行中，${beijing(mr.stationDirectIso)} 留顺`);
    else L.push(`水星 ${beijing(mr.stationRetrogradeIso)} 起逆（${mr.startSignName}），${beijing(mr.stationDirectIso)} 留顺`);
  }
  if(t.ingresses && t.ingresses.length){
    L.push('—— 近期太阳入座 ——');
    for(const g of t.ingresses.slice(0,4)) L.push(`太阳入${g.signName} · ${beijing(g.iso)}`);
  }
  if(m.nextQuarters && m.nextQuarters.length){
    L.push('—— 月相时刻 ——');
    for(const q of m.nextQuarters.slice(0,4)) L.push(`${q.name} · ${beijing(q.iso)}`);
  }
  return L.join('\n');
}

// 复现码数据 + 案例标题（时刻即全部）
export function skyCode(now=nowDate()){
  let title='当下天象', sub=momentText(now);
  try{
    const t=shouyeTianxiang(now);
    const sun=t.bodies.find(b=>b.id==='sun');
    title=`${t.moon.phaseName} · 日在${sun?sun.signName:''}`;
    sub=`${momentText(now)} · 月${pct(t.moon.illumination)}%`;
  }catch{ /* 计算失败时给默认标题 */ }
  return { kind:'sky', data:{ at: toSec(now.getTime()) }, title, sub };
}


// ---------- 行星时 · 择时（v111） ----------
// 主人 v99 记过"行星时（择时）"，v110 前只是被动显示"此刻第几时"，这里升级为可选日期+时刻的择时对照表。
// 规则出处同 solartime.js：迦勒底次序时主（自土星由远及近），行星日以当地日出为界。
const SHICHEN = ['子', '丑', '寅', '卯', '辰', '巳', '午', '未', '申', '酉', '戌', '亥'];
const PH_CID_MAP = { '土星': 'saturn', '木星': 'jupiter', '火星': 'mars', '太阳': 'sun', '金星': 'venus', '水星': 'mercury', '月亮': 'moon' };
let phDay = '', phTime = '';
function localDayStr(d) { return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`; }
function localTimeStr(d) { return `${pad(d.getHours())}:${pad(d.getMinutes())}`; }
function shichenIdx(d) { return Math.floor(((d.getHours() + 1) % 24) / 2) % 12; }

function phPanelHTML(ref) {
  const real = new Date();
  const day = phDay || localDayStr(real);
  const hh = phTime || localTimeStr(real);
  const d = new Date(`${day}T${hh}:00`);
  const table = planetaryHoursOfDay(d);
  if (!table) {
    return `<div class="sky-sec-h">行星时 · 择时对照</div>
      <div class="php-card"><div class="php-note">按当前观测地，此日极昼或极夜，行星时不可用。</div></div>`;
  }
  const fmt = x => `${pad(x.getHours())}:${pad(x.getMinutes())}`;
  const cur = table.hours.find(h => d >= h.start && d < h.end) || null;
  const rows = table.hours.map(h => {
    const on = cur && h.no === cur.no && h.isDay === cur.isDay;
    return `<div class="php-row${on ? ' is-cur' : ''}">
      <span class="php-no">${h.isDay ? '昼' : '夜'}${h.no}</span>
      <span class="php-time">${fmt(h.start)}–${fmt(h.end)}</span>
      <span class="php-planet" style="--pc:${P_COLOR[PH_CID_MAP[h.planet]] || '#ccc'}">${h.planet}</span>
      <span class="php-key">${(PLANET_HR[h.planet] || { k: '' }).k}</span>
    </div>`;
  }).join('');
  const ruler = table.hours[0].dayRuler;
  return `<div class="sky-sec-h">行星时 · 择时对照</div>
  <div class="php-card">
    <div class="php-ctl">
      <input type="date" id="ph-date" value="${day}">
      <input type="time" id="ph-time" value="${hh}">
    </div>
    <div class="php-cur">${cur
      ? `所选 <b>${day} ${hh}</b> 属${cur.isDay ? '昼' : '夜'}时第 ${cur.no} 时 · 时主星 <b>${cur.planet}</b> · 宜 ${(PLANET_HR[cur.planet] || { k: '' }).k} · 十二时辰 ${SHICHEN[shichenIdx(d)]}时`
      : `所选 ${day} ${hh} 不在该日行星时范围内`}</div>
    <div class="php-head">${ruler}司日 · 日出 ${fmt(table.sunrise)} · 日落 ${fmt(table.sunset)}（按当前观测地经纬）</div>
    <div class="php-list">${rows}</div>
    <div class="php-note">时主按迦勒底次序（自土星由远及近：土木火日金水月）；行星日以当地日出为界，日落后的夜时仍属当日那个行星日。宜忌为古典时主宜忌通行说法。</div>
  </div>`;
}

function bindPhPick(ref) {
  const box = document.getElementById('ph-pick');
  const dEl = document.getElementById('ph-date');
  const tEl = document.getElementById('ph-time');
  if (!box || !dEl || !tEl) return;
  const upd = () => {
    phDay = dEl.value; phTime = tEl.value;
    box.innerHTML = phPanelHTML(ref);
    bindPhPick(ref);
  };
  dEl.addEventListener('change', upd);
  tEl.addEventListener('change', upd);
}
