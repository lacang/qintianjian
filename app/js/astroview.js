// 西方古典占星 · 本命星盘子视图（纯排盘展示，只列事实不解读）
// v60：对标 Astro Gold / TimePassages 的同心环星轮——星座环 / 宫位环 / 行星带（碰撞避让+引线）
//      / 中央五大主相位弦线；点星体或相位联动高亮；相位清单、元素·模式分布。
// 全盘中文化：行星/交点用单字，星座环用「羊牛蟹狮…」，不依赖占星专用符号字体。
// 出生时刻可由「时间条」或复现码覆盖。
import { paipanXingpan, guDianTuiYun, shouyeTianxiang } from '../vendor/liuyao-core.js?v=122';
import { judgeAstro, verdictCardHtml } from './verdicts.js?v=122';
import { birthArgs, $ } from './state.js?v=122';
import { guideHTML, T } from './tipview.js?v=122';
import { foldVerdict } from './ritual.js?v=122';
import { ASTRO_MODES, curAstroMode, modeNeedsB2, CITIES, B2_KEY, RESET_KEY, readB2Public } from './astromodes.js?v=122';

function escapeHtml(s){ return String(s).replace(/[&<>"']/g, c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c])); }

const SIGN_SHORT = ['羊','牛','双','蟹','狮','女','秤','蝎','射','羯','瓶','鱼'];
const SIGN_FULL  = ['白羊','金牛','双子','巨蟹','狮子','处女','天秤','天蝎','射手','摩羯','水瓶','双鱼'];
// 星座三特质（三方四正），仅作元素/模式客观统计
const SIGN_EL = ['火','土','风','水','火','土','风','水','火','土','风','水'];
const SIGN_MD = ['基','固','变','基','固','变','基','固','变','基','固','变'];
const P_SHORT = { sun:'日', moon:'月', mercury:'水', venus:'金', mars:'火',
  jupiter:'木', saturn:'土', uranus:'天', neptune:'海', pluto:'冥', mean_node:'交' };
const P_COLOR = {
  sun:'#f2b24b', moon:'#dfe6f2', mercury:'#9fb4c7', venus:'#e7a7c4',
  mars:'#e06b51', jupiter:'#d9a86a', saturn:'#cbb98c', uranus:'#7fd0d6',
  neptune:'#7d9be8', pluto:'#b08ad6', mean_node:'#8fa3c0' };
const ORDER = ['sun','moon','mercury','venus','mars','jupiter','saturn','uranus','neptune','pluto','mean_node'];
// 元素对照：星曜 / 星座 / 宫位 / 相位 的含义 key（供点读弹「这一处是什么意思」）
const PL_KEY = { sun:'pl-sun', moon:'pl-moon', mercury:'pl-mercury', venus:'pl-venus', mars:'pl-mars',
  jupiter:'pl-jupiter', saturn:'pl-saturn', uranus:'pl-uranus', neptune:'pl-neptune', pluto:'pl-pluto', mean_node:'pl-node' };
const SG_KEY = ['sg-aries','sg-taurus','sg-gemini','sg-cancer','sg-leo','sg-virgo','sg-libra','sg-scorpio','sg-sagittarius','sg-capricorn','sg-aquarius','sg-pisces'];
const ASP_KEY = { conj:'as-conj', opp:'as-opp', tri:'as-trine', sq:'as-square', sex:'as-sextile' };
function tipOf(id,b){
  return PL_KEY[id] + '@' + SG_KEY[b.signIndex] + '@hs-' + b.house + (b.retrograde ? '@pl-retro' : '');
}
// Big Three 视觉权重最高
const BIG3 = new Set(['sun','moon']);

// 五大主相位（Ptolemaic aspects）。orb 为通行容许度（光体日月+1.5°），只作客观成相判定
const ASPECTS = [
  { key:'conj', name:'合相', sym:'☌', angle:0,   orb:7,  cls:'conj' },
  { key:'opp',  name:'对分', sym:'☍', angle:180, orb:7,  cls:'opp' },
  { key:'tri',  name:'三分', sym:'△', angle:120, orb:6,  cls:'tri' },
  { key:'sq',   name:'四分', sym:'□', angle:90,  orb:6,  cls:'sq' },
  { key:'sex',  name:'六分', sym:'⚹', angle:60,  orb:4,  cls:'sex' },
];

function fmt(d){ return `${String(d.degree).padStart(2,'0')}°${String(d.minute).padStart(2,'0')}′`; }
const ang = (lon) => 180 - lon; // 黄经 → 盘上方位角（白羊0°在中左，逆时针为黄道正向）
function pt(cx,cy,r,deg){ const a=deg*Math.PI/180; return { x:cx+r*Math.cos(a), y:cy-r*Math.sin(a) }; }
function angDist(a,b){ let d=Math.abs(a-b)%360; return d>180?360-d:d; }
function arcPath(cx,cy,rOuter,rInner,a0,a1){
  const P=(r,a)=>pt(cx,cy,r,ang(a));
  const large=(a1-a0)%360>180?1:0;
  const p0=P(rOuter,a0), p1=P(rOuter,a1), p2=P(rInner,a1), p3=P(rInner,a0);
  return `M${p0.x.toFixed(1)},${p0.y.toFixed(1)} A${rOuter},${rOuter} 0 ${large} 1 ${p1.x.toFixed(1)},${p1.y.toFixed(1)} L${p2.x.toFixed(1)},${p2.y.toFixed(1)} A${rInner},${rInner} 0 ${large} 0 ${p3.x.toFixed(1)},${p3.y.toFixed(1)} Z`;
}

// ---------- 行运成相（transits）：此刻天上行星 vs 本命盘 ----------
// 行运行星（此刻真实位置）与本命星点（七政+北交+上升+天顶）之间的五大主相位。
// 容许度：行运相位通行取本命的一半再稍紧——合冲 3°、三分四分 2.5°、六分 1.5°（光体日月 +0.5°）。
// 渐成/渐出：比较此刻与 6 小时后的容许差，缩小=渐成（applying），放大=渐出（separating）。
function calcTransitAspects(chart, now = new Date()){
  const orbBase = { conj:3, opp:3, tri:2.5, sq:2.5, sex:1.5 };
  const t1 = shouyeTianxiang(now), t2 = shouyeTianxiang(new Date(now.getTime() + 6*3600*1000));
  const nowMap = {}, nextMap = {};
  t1.bodies.forEach(b => nowMap[b.id] = b.lon);
  t2.bodies.forEach(b => nextMap[b.id] = b.lon);
  const natal = [];
  ORDER.forEach(id => { const b = chart.bodies[id]; if (b) natal.push({ key:id, name:b.name, lon:b.dms.lon, sign:b.signName, tip:PL_KEY[id] }); });
  natal.push({ key:'asc', name:'上升', lon:chart.asc.lon, sign:chart.ascSignName, tip:'hs-1' });
  natal.push({ key:'mc', name:'天顶', lon:chart.mc.lon, sign:SIGN_FULL[Math.floor(chart.mc.lon/30)], tip:'hs-10' });
  const out = [];
  for (const tb of t1.bodies) {
    if (!(tb.id in nowMap)) continue;
    for (const n of natal) {
      for (const a of ASPECTS) {
        const orb = orbBase[a.key] + ((tb.id==='sun'||tb.id==='moon'||n.key==='sun'||n.key==='moon') ? 0.5 : 0);
        const d = angDist(nowMap[tb.id], n.lon);
        const dev = Math.abs(d - a.angle);
        if (dev <= orb) {
          const dNext = Math.abs(angDist(nextMap[tb.id] || nowMap[tb.id], n.lon) - a.angle);
          out.push({
            tid: tb.id, tName: tb.name, tSign: tb.signName,
            nKey: n.key, nName: n.name, nSign: n.sign, nTip: n.tip,
            key: a.key, name: a.name, sym: a.sym, cls: a.cls,
            orb: dev, applying: dNext <= dev, retro: tb.retrograde,
          });
        }
      }
    }
  }
  out.sort((x, y) => x.orb - y.orb);
  return out;
}

// 客观计算五大主相位；tight=成相紧密度（0 最紧→1 临界），仅用于线的透明度
function calcAspects(chart){
  const out=[];
  for(let i=0;i<ORDER.length;i++){
    const a=chart.bodies[ORDER[i]]; if(!a) continue;
    for(let j=i+1;j<ORDER.length;j++){
      const b=chart.bodies[ORDER[j]]; if(!b) continue;
      const d=angDist(a.dms.lon,b.dms.lon);
      for(const asp of ASPECTS){
        let orb=asp.orb;
        if(ORDER[i]==='sun'||ORDER[i]==='moon'||ORDER[j]==='sun'||ORDER[j]==='moon') orb+=1.5;
        const diff=Math.abs(d-asp.angle);
        if(diff<=orb){
          out.push({ a:ORDER[i], b:ORDER[j], asp, gap:+diff.toFixed(2),
            tight:+(diff/orb).toFixed(2), lonA:a.dms.lon, lonB:b.dms.lon });
          break;
        }
      }
    }
  }
  return out.sort((x,y)=>x.gap-y.gap);
}

function birthText(){
  const a=birthArgs();
  return `${a.year}-${String(a.month).padStart(2,'0')}-${String(a.day).padStart(2,'0')} ${String(a.hour).padStart(2,'0')}:${String(a.minute).padStart(2,'0')}`;
}

function dignityTags(d){
  if(!d) return '<i class="dg dg-per">游</i>';
  const out=[];
  if(d.rulership) out.push('<i class="dg dg-dom">庙</i>');
  if(d.exaltation) out.push('<i class="dg dg-ex">旺</i>');
  if(d.triplicity) out.push('<i class="dg dg-tri">三分</i>');
  if(d.term) out.push('<i class="dg dg-term">界</i>');
  if(d.face) out.push('<i class="dg dg-face">面</i>');
  if(d.detriment) out.push('<i class="dg dg-bad">陷</i>');
  if(d.fall) out.push('<i class="dg dg-bad">落</i>');
  return out.length?out.join(''):'<i class="dg dg-per">游</i>';
}

// ===== 主星轮 SVG =====
// ---------- 盘面样式库（12 风格）----------
const ASTRO_STYLES = [
  { key:'bronze', name:'青铜纪', sub:'黑底鎏金 · 默认',
    vars:{bg:'#0d1318', ring:'rgba(200,163,92,.34)', ring2:'rgba(233,228,216,.14)', sep:'rgba(233,228,216,.16)', hsep:'rgba(233,228,216,.10)', hsepF:'rgba(200,163,92,.55)', tick:'rgba(233,228,216,.12)', axis:'rgba(233,228,216,.28)', axisAsc:'#d6b66e', axisMc:'rgba(224,138,120,.8)', axlab:'#d6b66e', axlabMc:'#e08a78', elF:'#e06b51', elE:'#d3a85f', elA:'#7fd0d6', elW:'#6fa3c9', houseF:'#d6b66e', aspOpp:'#e08a78', aspTri:'#7fa98b', aspSq:'#e06b51', aspSex:'#7fc4d6', center:'#aab3c8', glow:0 } },
  { key:'vellum', name:'羊皮卷', sub:'中世纪手稿 · 棕墨米黄',
    vars:{bg:'#e9dcc3', ring:'rgba(107,79,50,.5)', ring2:'rgba(107,79,50,.25)', sep:'rgba(107,79,50,.4)', hsep:'rgba(107,79,50,.22)', hsepF:'rgba(146,64,14,.7)', tick:'rgba(107,79,50,.35)', axis:'rgba(107,79,50,.5)', axisAsc:'#8a3e0e', axisMc:'#7a2818', axlab:'#8a3e0e', axlabMc:'#7a2818', elF:'#a63d21', elE:'#8a6d3b', elA:'#3f7a80', elW:'#33608c', houseF:'#8a3e0e', aspOpp:'#a63d21', aspTri:'#5c7a52', aspSq:'#962d15', aspSex:'#3f7a80', center:'#5a4630', glow:0 } },
  { key:'nightblue', name:'夜航蓝', sub:'天文台 · 深蓝青白',
    vars:{bg:'#0a1424', ring:'rgba(122,168,220,.4)', ring2:'rgba(150,190,235,.16)', sep:'rgba(150,190,235,.2)', hsep:'rgba(150,190,235,.12)', hsepF:'rgba(122,200,255,.6)', tick:'rgba(150,190,235,.15)', axis:'rgba(180,210,240,.3)', axisAsc:'#7fc4ff', axisMc:'#9fb8e8', axlab:'#7fc4ff', axlabMc:'#9fb8e8', elF:'#ff9b7a', elE:'#e8c98a', elA:'#8adfe8', elW:'#7fb0e8', houseF:'#7fc4ff', aspOpp:'#e08a78', aspTri:'#7fd0a8', aspSq:'#e06b51', aspSex:'#7fc4d6', center:'#9db8d6', glow:0 } },
  { key:'silk', name:'素绢', sub:'宣纸白底 · 玄墨线',
    vars:{bg:'#f4f0e6', ring:'rgba(40,38,35,.5)', ring2:'rgba(40,38,35,.2)', sep:'rgba(40,38,35,.4)', hsep:'rgba(40,38,35,.18)', hsepF:'rgba(160,32,24,.65)', tick:'rgba(40,38,35,.3)', axis:'rgba(40,38,35,.5)', axisAsc:'#a02018', axisMc:'#5a5040', axlab:'#a02018', axlabMc:'#5a5040', elF:'#b0341f', elE:'#8a6d3b', elA:'#3f7a80', elW:'#33608c', houseF:'#a02018', aspOpp:'#b0341f', aspTri:'#4a7a50', aspSq:'#962d15', aspSex:'#3f7a80', center:'#4a463c', glow:0 } },
  { key:'rose', name:'玫瑰窗', sub:'教堂彩窗 · 深底彩嵌',
    vars:{bg:'#151022', ring:'rgba(216,181,255,.35)', ring2:'rgba(216,181,255,.15)', sep:'rgba(216,181,255,.2)', hsep:'rgba(216,181,255,.12)', hsepF:'rgba(230,170,255,.6)', tick:'rgba(216,181,255,.16)', axis:'rgba(230,210,255,.3)', axisAsc:'#e8b8ff', axisMc:'#ffb8d8', axlab:'#e8b8ff', axlabMc:'#ffb8d8', elF:'#ff8a7a', elE:'#e8c98a', elA:'#8adfff', elW:'#9a8aff', houseF:'#e8b8ff', aspOpp:'#ff9b8a', aspTri:'#9be8b0', aspSq:'#ff7a6a', aspSex:'#8ae8ff', center:'#c8b8e8', glow:0 } },
  { key:'modern', name:'现代派', sub:'白底细线 · 软件风',
    vars:{bg:'#ffffff', ring:'rgba(30,34,40,.4)', ring2:'rgba(30,34,40,.15)', sep:'rgba(30,34,40,.35)', hsep:'rgba(30,34,40,.16)', hsepF:'rgba(21,101,192,.6)', tick:'rgba(30,34,40,.25)', axis:'rgba(30,34,40,.4)', axisAsc:'#1565c0', axisMc:'#5a5f6a', axlab:'#1565c0', axlabMc:'#5a5f6a', elF:'#e65100', elE:'#8d6e63', elA:'#00838f', elW:'#1565c0', houseF:'#1565c0', aspOpp:'#d84315', aspTri:'#2e7d32', aspSq:'#c62828', aspSex:'#0097a7', center:'#5a5f6a', glow:0 } },
  { key:'gilt', name:'鎏金', sub:'黑底金线 · 满描',
    vars:{bg:'#0b0a07', ring:'rgba(224,188,110,.55)', ring2:'rgba(224,188,110,.22)', sep:'rgba(224,188,110,.35)', hsep:'rgba(224,188,110,.2)', hsepF:'rgba(240,205,130,.8)', tick:'rgba(224,188,110,.28)', axis:'rgba(224,188,110,.4)', axisAsc:'#f0cd82', axisMc:'#d8a86a', axlab:'#f0cd82', axlabMc:'#d8a86a', elF:'#e8a06a', elE:'#e8cc8a', elA:'#cfe8d8', elW:'#c8d8e8', houseF:'#f0cd82', aspOpp:'#e8b08a', aspTri:'#c8e0a0', aspSq:'#e8a07a', aspSex:'#a0d8e0', center:'#d8ccA0', glow:1 } },
  { key:'ink', name:'玄墨', sub:'纯黑白 · 高对比',
    vars:{bg:'#0a0a0a', ring:'rgba(255,255,255,.5)', ring2:'rgba(255,255,255,.2)', sep:'rgba(255,255,255,.4)', hsep:'rgba(255,255,255,.2)', hsepF:'rgba(255,255,255,.9)', tick:'rgba(255,255,255,.3)', axis:'rgba(255,255,255,.5)', axisAsc:'#ffffff', axisMc:'#d0d0d0', axlab:'#ffffff', axlabMc:'#d0d0d0', elF:'#ffffff', elE:'#c8c8c8', elA:'#a8a8a8', elW:'#e8e8e8', houseF:'#ffffff', aspOpp:'#ffffff', aspTri:'#c0c0c0', aspSq:'#e8e8e8', aspSex:'#989898', center:'#c0c0c0', glow:0 } },
  { key:'jade', name:'翡翠', sub:'墨绿玉色 · 幽光',
    vars:{bg:'#0a1512', ring:'rgba(140,220,180,.4)', ring2:'rgba(140,220,180,.16)', sep:'rgba(140,220,180,.22)', hsep:'rgba(140,220,180,.13)', hsepF:'rgba(160,240,200,.65)', tick:'rgba(140,220,180,.18)', axis:'rgba(180,240,210,.32)', axisAsc:'#9fe8c0', axisMc:'#c8e8a0', axlab:'#9fe8c0', axlabMc:'#c8e8a0', elF:'#e8a06a', elE:'#e8cc8a', elA:'#8adfff', elW:'#7fc4d6', houseF:'#9fe8c0', aspOpp:'#e8b08a', aspTri:'#9be8b0', aspSq:'#e88a7a', aspSex:'#8ae8e0', center:'#a8c8b8', glow:0 } },
  { key:'crimson', name:'绯颜', sub:'暗红胭脂 · 夜宴',
    vars:{bg:'#1a0d10', ring:'rgba(232,148,148,.4)', ring2:'rgba(232,148,148,.16)', sep:'rgba(232,148,148,.22)', hsep:'rgba(232,148,148,.13)', hsepF:'rgba(255,170,150,.65)', tick:'rgba(232,148,148,.18)', axis:'rgba(255,190,170,.32)', axisAsc:'#ffb0a0', axisMc:'#e8a8c0', axlab:'#ffb0a0', axlabMc:'#e8a8c0', elF:'#ff9b7a', elE:'#e8cc8a', elA:'#8adfff', elW:'#c8a8e8', houseF:'#ffb0a0', aspOpp:'#ff8a7a', aspTri:'#c8e8a0', aspSq:'#ff7a6a', aspSex:'#8ae8ff', center:'#d8b0b8', glow:0 } },
  { key:'nebula', name:'星轨', sub:'紫青渐变 · 星野',
    vars:{bg:'#100c1e', ring:'rgba(178,160,255,.4)', ring2:'rgba(150,190,235,.18)', sep:'rgba(178,160,255,.24)', hsep:'rgba(150,190,235,.15)', hsepF:'rgba(200,190,255,.7)', tick:'rgba(178,160,255,.2)', axis:'rgba(200,190,255,.35)', axisAsc:'#b8a8ff', axisMc:'#8adfff', axlab:'#b8a8ff', axlabMc:'#8adfff', elF:'#ff9b7a', elE:'#e8cc8a', elA:'#8adfff', elW:'#7fb0e8', houseF:'#b8a8ff', aspOpp:'#ff9b8a', aspTri:'#9be8d0', aspSq:'#ff7a6a', aspSex:'#8ae8ff', center:'#b0b0d8', glow:1 } },
  { key:'obsidian', name:'曜石', sub:'近纯黑 · 微光极简',
    vars:{bg:'#060708', ring:'rgba(160,175,190,.28)', ring2:'rgba(160,175,190,.1)', sep:'rgba(160,175,190,.16)', hsep:'rgba(160,175,190,.09)', hsepF:'rgba(200,215,230,.45)', tick:'rgba(160,175,190,.12)', axis:'rgba(160,175,190,.2)', axisAsc:'#c8d8e8', axisMc:'#8a9db0', axlab:'#c8d8e8', axlabMc:'#8a9db0', elF:'#c8a898', elE:'#b8a888', elA:'#98b0b8', elW:'#8a98b0', houseF:'#c8d8e8', aspOpp:'#c8a898', aspTri:'#98b8a8', aspSq:'#b89a90', aspSex:'#98a8b8', center:'#788898', glow:0 } },
];
const ASTRO_STYLE_KEY = 'qintian.astro.style';
function curAstroStyle(){ try{ const k=localStorage.getItem(ASTRO_STYLE_KEY); return ASTRO_STYLES.find(x=>x.key===k)||ASTRO_STYLES[0]; }catch{ return ASTRO_STYLES[0]; } }
function styleVarsAttr(st){
  return Object.entries(st.vars).map(([k,v])=>`--cw-${k}:${v}`).join(';');
}

function wheelSVG(chart, aspects, outer, outerAsp, hl, hlHouse){
  const cx=280, cy=280;
  const st=curAstroStyle();
  const rSignO=262, rSignI=228;     // 星座环
  const rHouseO=228, rHouseI=188;  // 宫位环（随 ASC 旋转）
  const rP0=172, rLabelBase=150;   // 相位线终点 / 行星真实点；标签基准
  let s='';

  // 外环底
  s+=`<circle class="cw-disc" cx="${cx}" cy="${cy}" r="${rSignO}"/>`;
  // 星座 12 等分扇面（白羊0°固定在中左）
  const EL_FILL={火:'#e06b51',土:'#d3a85f',风:'#7fd0d6',水:'#6fa3c9'};
  for(let i=0;i<12;i++){
    s+=`<path class="cw-signseg" d="${arcPath(cx,cy,rSignO,rSignI,i*30,(i+1)*30)}" style="fill:var(--cw-el${SIGN_EL[i]==='火'?'F':SIGN_EL[i]==='土'?'E':SIGN_EL[i]==='风'?'A':'W'})" fill-opacity="0.07"/>`;
    const g=pt(cx,cy,(rSignO+rSignI)/2,ang(i*30+15));
    s+=`<text class="cw-sign cw-el-${SIGN_EL[i]}" x="${g.x.toFixed(1)}" y="${(g.y+6).toFixed(1)}" text-anchor="middle">${SIGN_SHORT[i]}</text>`;
    const a=pt(cx,cy,rSignO,ang(i*30)), b=pt(cx,cy,rHouseI,ang(i*30));
    s+=`<line class="cw-sep" x1="${a.x.toFixed(1)}" y1="${a.y.toFixed(1)}" x2="${b.x.toFixed(1)}" y2="${b.y.toFixed(1)}"/>`;
    // 每 10° 细刻度
    for(const q of [10,20]){
      const t0=pt(cx,cy,rSignO,ang(i*30+q)), t1=pt(cx,cy,rSignO-7,ang(i*30+q));
      s+=`<line class="cw-tick" x1="${t0.x.toFixed(1)}" y1="${t0.y.toFixed(1)}" x2="${t1.x.toFixed(1)}" y2="${t1.y.toFixed(1)}"/>`;
    }
  }
  // 环边界
  [rSignO,rSignI,rHouseO,rHouseI,rP0].forEach((r)=>{ s+=`<circle class="cw-ring${r===rP0?' thin':''}" cx="${cx}" cy="${cy}" r="${r}"/>`; });

  // 宫位：整宫，ASC 星座 0° 为 1 宫起点；宫界=星座界(随ASC定位)
  const ascLon=chart.asc.lon, mcLon=chart.mc.lon;
  const ascSign0=chart.ascSignIndex*30;
  for(let h=1;h<=12;h++){
    const lon0=ascSign0+(h-1)*30;
    const g=pt(cx,cy,(rHouseO+rHouseI)/2,ang(lon0+15));
    s+=`<text class="cw-house ${h===1?'first':''}" x="${g.x.toFixed(1)}" y="${(g.y+5).toFixed(1)}" text-anchor="middle">${h}</text>`;
    const a=pt(cx,cy,rHouseO,ang(lon0)), b=pt(cx,cy,rP0,ang(lon0));
    s+=`<line class="cw-hsep ${h===1?'first':''}" x1="${a.x.toFixed(1)}" y1="${a.y.toFixed(1)}" x2="${b.x.toFixed(1)}" y2="${b.y.toFixed(1)}"/>`;
  }

  // 四角轴线 ASC / DSC / MC / IC（轴点所在精确经度）
  const axes=[['命',ascLon,'asc'],['迁',(ascLon+180)%360,''],['顶',mcLon,'mc'],['底',(mcLon+180)%360,'']];
  axes.forEach(([lab,lon,cls])=>{
    const p1=pt(cx,cy,rHouseI,ang(lon)), p2=pt(cx,cy,0,ang(lon));
    s+=`<line class="cw-axis ${cls}" x1="${p1.x.toFixed(1)}" y1="${p1.y.toFixed(1)}" x2="${p2.x.toFixed(1)}" y2="${p2.y.toFixed(1)}"/>`;
  });

  // 相位弦线（中央，低对比度；合相两星重合不画线）
  aspects.forEach((ap,idx)=>{
    if(ap.asp.key==='conj') return;
    const p1=pt(cx,cy,rP0,ang(ap.lonA)), p2=pt(cx,cy,rP0,ang(ap.lonB));
    const op=0.55-ap.tight*0.32; // 越成相越实
    const dash=ap.asp.key==='sex' ? '4 4' : (ap.asp.key==='tri' ? 'none':'none');
    s+=`<line class="cw-asp cw-asp-${ap.asp.cls}" data-apair="${ap.a}|${ap.b}" data-aspkey="${ap.asp.key}" data-tip="${ASP_KEY[ap.asp.key]}@${PL_KEY[ap.a]}@${PL_KEY[ap.b]}"
      x1="${p1.x.toFixed(1)}" y1="${p1.y.toFixed(1)}" x2="${p2.x.toFixed(1)}" y2="${p2.y.toFixed(1)}"
      stroke-opacity="${op.toFixed(2)}" stroke-dasharray="${dash}"/>`;
  });

  // 行星真实点 + 碰撞避让的标签（引线）
  const ruler=chart.chartRuler;
  const placed=[]; // {deg,layer}
  const placedMap={};
  const LAYER_D=15;
  const GAP_DEG=7.2;
  function place(lon){
    let layer=0;
    const busy=(d,lv)=>placed.some(p=>p.layer===lv && angDist(p.deg,d)<GAP_DEG);
    while(busy(lon,layer)) layer++;
    placed.push({deg:lon,layer});
    return layer;
  }
  ORDER.forEach((id)=>{
    const b=chart.bodies[id]; if(!b) return;
    const lon=b.dms.lon, layer=place(lon);
    placedMap[id]={lon,layer};
    const rDot=rP0+4, rLab=rLabelBase-layer*LAYER_D;
    const dot=pt(cx,cy,rDot,ang(lon));
    const lp=pt(cx,cy,rLab,ang(lon));
    const col=P_COLOR[id]||'#cfd8ea';
    const big=BIG3.has(id);
    // 引线（仅当发生避让）
    if(layer>0){
      const p0=pt(cx,cy,rDot+2,ang(lon));
      s+=`<line class="cw-lead" x1="${p0.x.toFixed(1)}" y1="${p0.y.toFixed(1)}" x2="${lp.x.toFixed(1)}" y2="${(lp.y-2).toFixed(1)}" stroke="${col}"/>`;
    }
    // 命中高亮用的透明大触点
    s+=`<g class="cw-planet ${id===ruler?'is-ruler':''} ${big?'is-big':''}" data-ap="${id}" data-tip="${tipOf(id,b)}">`;
    s+=`<circle class="cw-hit" cx="${lp.x.toFixed(1)}" cy="${(lp.y-1).toFixed(1)}" r="15" fill="transparent"/>`;
    s+=`<circle class="cw-dot" cx="${dot.x.toFixed(1)}" cy="${dot.y.toFixed(1)}" r="${big?3.6:2.6}" fill="${col}"/>`;
    s+=`<text class="cw-pglyph" x="${lp.x.toFixed(1)}" y="${(lp.y+1).toFixed(1)}" text-anchor="middle" fill="${col}">${P_SHORT[id]||'·'}${b.retrograde?'<tspan class="cw-rx">℞</tspan>':''}</text>`;
    s+=`<text class="cw-pdeg" x="${lp.x.toFixed(1)}" y="${(lp.y+12).toFixed(1)}" text-anchor="middle">${b.dms.degree}°</text>`;
    s+=`</g>`;
  });

  // 福点
  const lf=pt(cx,cy,rLabelBase,ang(chart.lots.fortune.lon));
  s+=`<text class="cw-fortune" x="${lf.x.toFixed(1)}" y="${(lf.y+5).toFixed(1)}" text-anchor="middle">⊕</text>`;

  // 轴点外标签（双轮模式下让位给外圈星）
  if (!outer || !outer.length){
    const la=pt(cx,cy,rSignO+14,ang(ascLon)), lm=pt(cx,cy,rSignO+14,ang(mcLon));
    s+=`<text class="cw-axlab asc" x="${la.x.toFixed(1)}" y="${(la.y+4).toFixed(1)}" text-anchor="middle">ASC</text>`;
    s+=`<text class="cw-axlab mc" x="${lm.x.toFixed(1)}" y="${(lm.y+4).toFixed(1)}" text-anchor="middle">MC</text>`;
  }

  // 中心
  s+=`<text class="cw-center" x="${cx}" y="${cy-6}" text-anchor="middle">${chart.sect}盘</text>`;
  s+=`<text class="cw-center sub" x="${cx}" y="${cy+16}" text-anchor="middle">命主·${P_SHORT[ruler]||chart.chartRulerName}</text>`;

  // —— 双轮外圈（行运/推运/对方星）——
  if (outer && outer.length){
    s+=`<circle cx="${cx}" cy="${cy}" r="268" fill="none" stroke="var(--cw-ring)" stroke-width=".8" stroke-dasharray="2 3" opacity=".7"/>`;
    if (outerAsp && outerAsp.length){
      for (const oa of outerAsp){
        const op=Math.max(.18, .55-(oa.dev/oa.orbMax)*.34);
        const p1=pt(cx,cy,rP0,ang(oa.nLon)), p2=pt(cx,cy,rSignI,ang(oa.oLon));
        s+=`<line class="cw-asp cw-asp-${oa.cls}" x1="${p1.x.toFixed(1)}" y1="${p1.y.toFixed(1)}" x2="${p2.x.toFixed(1)}" y2="${p2.y.toFixed(1)}" stroke-opacity="${op.toFixed(2)}" ${oa.key==='sex'?'stroke-dasharray="3 3"':''}/>`;
      }
    }
    const so=[...outer].sort((x,y)=>x.lon-y.lon);
    let last=null; const adjLons=[];
    for (const o of so){
      let L=o.lon;
      if (last!=null){ let d=L-last; if(d<0)d+=360; if(d<7) L=(last+7)%360; }
      last=L; adjLons.push({o,L});
    }
    for (const {o,L} of adjLons){
      const p1=pt(cx,cy,rSignO,ang(o.lon)), p2=pt(cx,cy,267,ang(L)), p3=pt(cx,cy,273,ang(L));
      const col=P_COLOR[o.id]||'#cfd8ea';
      s+=`<line x1="${p1.x.toFixed(1)}" y1="${p1.y.toFixed(1)}" x2="${p2.x.toFixed(1)}" y2="${p2.y.toFixed(1)}" stroke="${col}" stroke-width=".8" stroke-opacity=".7"/>`;
      s+=`<text class="cw-oglyph" x="${p3.x.toFixed(1)}" y="${(p3.y+3).toFixed(1)}" text-anchor="middle" fill="${col}">${P_SHORT[o.id]||'·'}${o.rx?'℞':''}</text>`;
    }
  }
  // —— 时限高亮环（法达主限/希腊纪元主星）——
  if (hl && (hl.major || hl.sub)){
    for (const id of [hl.major, hl.sub]){
      if (!id || !placedMap[id]) continue;
      const {lon,layer}=placedMap[id];
      const lp=pt(cx,cy,rLabelBase-layer*LAYER_D,ang(lon));
      s+=`<circle cx="${lp.x.toFixed(1)}" cy="${(lp.y-1).toFixed(1)}" r="16.5" fill="none" stroke="var(--gold)" stroke-width="1.3" stroke-dasharray="3 2" opacity=".9"/>`;
    }
  }
  // —— 小限年宫高亮扇面 ——
  if (hlHouse){
    const lon0=ascSign0+(hlHouse-1)*30;
    s+=`<path d="${arcPath(cx,cy,rHouseO,rHouseI,lon0,lon0+30)}" fill="var(--gold)" fill-opacity=".15" stroke="var(--gold)" stroke-opacity=".45" stroke-width="1"/>`;
  }

  return `<svg class="cw-svg" viewBox="0 0 560 560" role="img" aria-label="本命星盘" style="${styleVarsAttr(st)}">${s}</svg>`;
}

// 元素 / 模式分布（七政+三王+北交，整宫客观计数）
function balance(chart){
  const el={火:0,土:0,风:0,水:0}, md={基:0,固:0,变:0};
  let n=0;
  ORDER.forEach((id)=>{
    const b=chart.bodies[id]; if(!b) return;
    el[SIGN_EL[b.signIndex]]++; md[SIGN_MD[b.signIndex]]++; n++;
  });
  const elHtml=Object.entries(el).map(([k,v])=>
    `<span class="cb-cell cw-el-${k}" style="flex-grow:${Math.max(v,0.15)}"><i>${k}</i>${v}</span>`).join('');
  const mdHtml=Object.entries(md).map(([k,v])=>
    `<span class="cb-cell cb-md-cell" style="flex-grow:${Math.max(v,0.15)}"><i>${k}</i>${v}</span>`).join('');
  return { elHtml, mdHtml, n };
}

const ASTRO_GUIDE = {
  title: '怎么看这一盘',
  intro: '这是西方古典占星的本命盘：把出生时刻的行星位置画在一个圆轮上。<b>盘上任何一个符号、任何一条线都可以点开</b>，点开会告诉你「它是什么、代表人生哪一块、传统上算吉还是算凶」。',
  steps: [
    { t: '先找太阳和月亮', d: '太阳＝你要成为的那个人（自我、意志、荣誉）；月亮＝你真实的感受（情绪、安全感）。点它们，卡里写清这颗星管什么、落在哪个星座意味着用什么方式表达。', tip: 'qizheng', sel: '.ab-list' },
    { t: '每颗星落在哪个星座', d: '星座是「方式」：同一颗金星，落狮子是张扬地爱，落处女是挑剔地爱。点行星，卡里把「星曜＋星座＋宫位」三层含义分开列给你看。', sel: '.ab-list' },
    { t: '每颗星落在第几宫', d: '宫位是「哪一块人生」：1宫是自己、7宫是伴侣、10宫是事业。宫位含义卡里写了每个宫到底管什么。', sel: '.cw-wrap' },
    { t: '盘中连线＝相位（角度）', d: '相位就是两颗星的夹角：合 0°＝两股力量叠在一起；拱 120°＝顺畅好走；六合 60°＝有机会但要主动用；刑 90°＝互相卡住、硬碰硬；冲 180°＝正面对拉。点任意一条线，会同时列出「这个角度代表什么」＋「这两颗星各自管什么」。', tip: 'xiangwei', sel: '.ax-list' },
    { t: '庙旺陷弱＝顺还是憋', d: '同一颗金星，落在金牛（庙）就顺畅，落在天蝎（陷）就憋屈。卡里「庙旺」一栏写的就是这颗星在这个星座里是顺还是憋。', sel: '.ab-list' },
    { t: '最后看整体分布', d: '下面的卡片是元素／模式分布、主相位清单、七政落位尊贵，用来找「这张盘整体偏重什么」。', sel: '.astro-card' },
  ],
  note: '盘上只列传统体系里的通行含义与古籍出处，不替你下「你会怎样」的结论；吉凶倾向一律标为「古籍所载」，供你自己衡量。',
};

export function setAstroStyle(key){
  try{ localStorage.setItem(ASTRO_STYLE_KEY, key); }catch{ /* 隐私模式 */ }
  renderAstro();
}

// ---------- 盘面模式（36 种）辅助 ----------
function b2ArgsOf(base){
  const b2 = readB2Public(); if (!b2) return null;
  const city = CITIES.find(c=>c.name===b2.city) || CITIES[0];
  return { ...base, year:+b2.year, month:+b2.month, day:+b2.day, hour:+b2.hour, minute:+b2.minute||0, lat:city.lat, lonEast:city.lonEast, place:city.name };
}
function modeBarHTML(mode){
  const GROUPS=[['natal','本命类'],['prog','推运类'],['time','时限类'],['rel','关系类']];
  return `<div class="am-bar">${GROUPS.map(([g,gn])=>`<div class="am-group"><div class="am-gh">${gn}</div><div class="am-row">${ASTRO_MODES.filter(m=>m.group===g).map(m=>`<button type="button" class="am-btn ${m.key===mode.key?'on':''}" data-amode="${m.key}">${m.name}</button>`).join('')}</div></div>`).join('')}</div>`;
}
function styleBarHTML(){
  return `<div class="cw-stylebar" id="astro-stylebar">${ASTRO_STYLES.map((x)=>`<button type="button" class="cw-stylebtn ${x.key===curAstroStyle().key?'on':''}" data-astyle="${x.key}"><b>${x.name}</b><i>${x.sub}</i></button>`).join('')}</div>`;
}
// 城市下拉：按省分组（citydata 全量 360+ 城市，本地拼音可搜）
function cityOptions(sel){
  const byProv = new Map();
  CITIES.forEach(c => { const k = c.prov || '其他'; if (!byProv.has(k)) byProv.set(k, []); byProv.get(k).push(c); });
  return [...byProv.entries()].map(([prov, list]) =>
    `<optgroup label="${prov}">${list.map(c => `<option value="${c.name}"${c.name === sel ? ' selected' : ''}>${c.name}</option>`).join('')}</optgroup>`
  ).join('');
}
function b2FormHTML(){
  const b2 = readB2Public() || { year:'', month:'', day:'', hour:'', minute:'', city:'北京' };
  return `<div class="astro-card">
    <div class="ac-title">本命2 · 第二人出生信息</div>
    <div class="b2-form">
      <label class="b2-f"><i>年</i><input type="number" data-b2k="year" placeholder="1990" min="1900" max="2100" value="${b2.year??''}"></label>
      <label class="b2-f"><i>月</i><input type="number" data-b2k="month" min="1" max="12" value="${b2.month??''}"></label>
      <label class="b2-f"><i>日</i><input type="number" data-b2k="day" min="1" max="31" value="${b2.day??''}"></label>
      <label class="b2-f"><i>时</i><input type="number" data-b2k="hour" min="0" max="23" value="${b2.hour??''}"></label>
      <label class="b2-f"><i>分</i><input type="number" data-b2k="minute" min="0" max="59" value="${b2.minute??''}"></label>
      <label class="b2-f"><i>城</i><select data-b2k="city">${cityOptions(b2.city)}</select></label>
      <button type="button" class="btn btn-primary" data-b2save>保存并起盘</button>
    </div>
    <div class="cb-note">比较盘 / 组合盘 / 时空盘 / 马克思盘及合盘推运均基于第二人生辰计算，数据只存本机，不上传任何服务器。</div>
  </div>`;
}
function relocBarHTML(){
  let g=null; try{ g=JSON.parse(localStorage.getItem(RESET_KEY)||'null'); }catch{}
  const cur=(g&&g.city)||'北京';
  return `<div class="am-bar"><div class="am-group"><div class="am-gh">重置城市（换地重排宫位）</div><div class="am-row"><select class="am-select" id="reloc-city">${cityOptions(cur)}</select></div></div></div>`;
}
// 外圈星 vs 内圈星成相（行运级容许度）
function calcOuterAspects(chart, outer){
  const orbBase={conj:3,opp:3,tri:2.5,sq:2.5,sex:1.5};
  const natal=[]; ORDER.forEach(id=>{ const b=chart.bodies[id]; if(b) natal.push({key:id,name:b.name,lon:b.dms.lon}); });
  const out=[];
  for (const o of outer){
    for (const n of natal){
      for (const a of ASPECTS){
        const orb=orbBase[a.key]+(((o.id==='sun'||o.id==='moon')||(n.key==='sun'||n.key==='moon'))?0.5:0);
        const d=angDist(o.lon,n.lon), dev=Math.abs(d-a.angle);
        if (dev<=orb) out.push({ tid:o.id, tName:o.name, tRx:o.rx, nKey:n.key, nName:n.name, key:a.key, name:a.name, sym:a.sym, cls:a.cls, dev, orbMax:orb, oLon:o.lon, nLon:n.lon });
      }
    }
  }
  out.sort((x,y)=>x.dev-y.dev);
  return out;
}

export function renderAstro(){
  const body=$('#astro-body'); if(!body) return;
  const args=birthArgs();
  let chart, timing;
  try{ chart=paipanXingpan(args); timing=guDianTuiYun(args); }
  catch(e){ body.innerHTML=`<div class="empty">星盘计算失败：${escapeHtml(String(e.message||e))}</div>`; return; }

  const mode=curAstroMode();
  const b2a=b2ArgsOf(args);
  if (modeNeedsB2(mode) && !b2a){
    body.innerHTML=`${guideHTML(ASTRO_GUIDE)}${modeBarHTML(mode)}${b2FormHTML()}${styleBarHTML()}`;
    return;
  }
  const birth=new Date(args.year, args.month-1, args.day, args.hour, args.minute||0);
  const now=new Date();
  let R;
  try{ R=mode.calc({ args, chart, birth, now, b2args:b2a, timing }); }
  catch(e){ R={ chart, label:`${mode.name} · 计算失败，已回退本命`, note:String(e.message||e) }; }
  if (!R || !R.chart) R={ chart, label:'本命盘 · 出生日落定时' };
  const ch=R.chart;
  const ruler=ch.chartRuler;
  const aspects=calcAspects(ch);
  const aspCount={}; ASPECTS.forEach(a=>{ aspCount[a.key]=0; }); aspects.forEach(a=>{ aspCount[a.asp.key]++; });
  const outerAsp = R.outer ? calcOuterAspects(ch, R.outer) : [];
  const isFake=!!ch._fake;
  const isNatal=mode.key==='natal';
  const showTiming=['natal','firdaria','profection','medprof','zr','greekdec'].includes(mode.key);

  const f=timing.firdaria, p=timing.profection;
  const fort=ch.lots.fortune;
  const fortHouse=((Math.floor(fort.lon/30)-ch.ascSignIndex+12)%12)+1;
  const bal=balance(ch);

  const planetRows=ORDER.map((id)=>{
    const b=ch.bodies[id]; if(!b) return '';
    const pc=P_COLOR[id]||'#cfd8ea';
    return `<button type="button" class="ab-row ${id===ruler?'is-ruler':''} ${BIG3.has(id)?'is-big':''}" data-ap="${id}" data-tip="${tipOf(id,b)}">
      <span class="ab-glyph" style="background:${pc};box-shadow:0 0 9px ${pc}66;color:#101316">${P_SHORT[id]||'·'}</span>
      <span class="ab-name">${b.name}${b.retrograde?'<i class="ab-rx">℞</i>':''}</span>
      <span class="ab-pos">${b.signName} ${fmt(b.dms)}</span>
      <span class="ab-dg">${isFake?'<span class="cb-note" style="font-size:10px">变换盘</span>':dignityTags(ch.dignities[id])}</span>
      <span class="ab-house">${b.house}宫</span>
    </button>`;
  }).join('');

  const aspRows=aspects.map((ap)=>{
    const A=ch.bodies[ap.a], B=ch.bodies[ap.b];
    return `<button type="button" class="ax-row" data-apair="${ap.a}|${ap.b}" data-aspkey="${ap.asp.key}" data-tip="${ASP_KEY[ap.asp.key]}@${PL_KEY[ap.a]}@${PL_KEY[ap.b]}">
      <span class="ax-p" style="color:${P_COLOR[ap.a]}">${P_SHORT[ap.a]}</span>
      <span class="ax-sym cw-asp-${ap.asp.cls}">${ap.asp.sym}<i>${ap.asp.name}</i></span>
      <span class="ax-p" style="color:${P_COLOR[ap.b]}">${P_SHORT[ap.b]}</span>
      <span class="ax-pos">${A.signName}·${B.signName}</span>
      <span class="ax-orb">容许 ${ap.gap}°</span>
    </button>`;
  }).join('');

  const outerRows=outerAsp.slice(0,16).map(oa=>`
    <button type="button" class="ax-row" data-tip="${ASP_KEY[oa.key]}@${PL_KEY[oa.tid]}@${PL_KEY[oa.nKey]}">
      <span class="ax-p" style="color:${P_COLOR[oa.tid]}">${P_SHORT[oa.tid]||'·'}${oa.tRx?'℞':''}</span>
      <span class="ax-sym cw-asp-${oa.cls}">${oa.sym}<i>${oa.name}</i></span>
      <span class="ax-p" style="color:${P_COLOR[oa.nKey]}">${P_SHORT[oa.nKey]}</span>
      <span class="ax-pos">外圈·本命</span>
      <span class="ax-orb">容许 ${oa.dev.toFixed(1)}°</span>
    </button>`).join('');

  // 行运成相卡（本命模式：此刻天上对本命）
  let trCard='';
  if (isNatal){
    try{
      const trs=calcTransitAspects(chart);
      if (trs.length){
        const trRows=trs.slice(0,14).map(t=>`
        <button type="button" class="ax-row" data-tip="${ASP_KEY[t.key]}@${PL_KEY[t.tid]}@${t.nTip}">
          <span class="ax-p" style="color:${P_COLOR[t.tid]}">${P_SHORT[t.tid]||t.tName}</span>
          <span class="ax-sym cw-asp-${t.cls}">${t.sym}<i>${t.name}</i></span>
          <span class="ax-p">${t.nName}</span>
          <span class="ax-pos">${t.tSign}${t.retro?'℞':''}·本命${t.nSign}</span>
          <span class="ax-orb">容许 ${t.orb.toFixed(1)}° · ${t.applying?'渐成':'渐出'}</span>
        </button>`).join('');
        trCard=`<div class="astro-card">
          <div class="ac-title">行运成相（${trs.length}）· 此刻天上对本命</div>
          <div class="ax-list">${trRows}</div>
          <div class="cb-note">行运＝此刻真实行星位置对本命星点的相位；渐成＝误差渐小、事象渐近，渐出＝渐远。日月约 1-2 天走过 1°，慢星一次四分相可盘桓数月。行运容许度取本命之半（合冲3°/三二分2.5°/六分1.5°，光体+0.5°），按成相紧密度排序。</div>
        </div>`;
      }
    }catch(e){ trCard=''; }
  }

  const timeAxisCard = R.timeAxis ? `<div class="astro-card">
    <div class="ac-title">${R.timeAxis.title}</div>
    ${R.timeAxis.rows.map(r=>`<div class="at-row"><span class="at-k">${r.a}</span><span class="at-v">${r.b} · ${r.c}</span></div>`).join('')}
  </div>` : '';
  const modeNote = R.note ? `<div class="astro-card"><div class="ac-title">${R.label||mode.name}</div><div class="cb-note">${R.note}</div></div>` : '';
  const b2Edit = (modeNeedsB2(mode) && b2a) ? b2FormHTML() : '';
  const relocBar = (mode.key==='reloc') ? relocBarHTML() : '';

  body.innerHTML=`
  ${guideHTML(ASTRO_GUIDE)}
  ${modeBarHTML(mode)}
  ${relocBar}
  ${styleBarHTML()}

  <div class="astro-head">
    <div class="astro-title">${R.label||'本命星盘'}</div>
    <div class="astro-sub">${isNatal?`${birthText()} · ${args.place||''}`:mode.name+' · '+mode.sub}</div>
    <div class="astro-angles">
      <span class="ax-line"><span class="ax-k">上升</span>${ch.ascSignName} ${fmt(ch.asc)}　<span class="ax-k">天顶</span>${fmt(ch.mc)}</span>
      <span class="ax-line">${ch.sect}盘 · 命主星 ${ch.chartRulerName}${ch.bodies[ruler]?`（${ch.bodies[ruler].signName}${ch.bodies[ruler].house}宫）`:''} · 整宫制${R.outer?' · 双轮':''}</span>
    </div>
  </div>

  <div class="cw-wrap">
    ${wheelSVG(ch, aspects, R.outer, outerAsp, R.highlight, R.highlightHouse)}
    <div class="cw-asplegend">
      ${ASPECTS.map(a=>`<span class="axlg"><i class="axlg-line cw-asp-${a.cls}"></i>${a.sym} ${a.name} ${aspCount[a.key]}</span>`).join('')}
    </div>
    <div class="cw-taphint">${R.outer?'外圈为'+(mode.key==='transit'?'此刻行运星':'对应推进/对方星')+'；点星体 / 相位联动高亮':'点星体 / 相位可在轮盘与清单间联动高亮'}</div>
  </div>

  ${modeNote}
  ${timeAxisCard}
  ${outerAsp.length?`<div class="astro-card">
    <div class="ac-title">外圈成相（${outerAsp.length}）· ${mode.name}</div>
    <div class="ax-list">${outerRows}</div>
    <div class="cb-note">外圈星（${R.outer?'行运/推进/对方':'—'}）与本命星的主相位，行运级容许度（合冲3°/三二分2.5°/六分1.5°，光体+0.5°）。越紧的相线越实。</div>
  </div>`:''}

  <div class="astro-card">
    <div class="ac-title">元素 · 模式分布（${bal.n} 点）${isFake?'· 变换盘':''}</div>
    <div class="cb-bar cb-el">${bal.elHtml}</div>
    <div class="cb-bar cb-md">${bal.mdHtml}</div>
    <div class="cb-note">${isFake?'黄经经变换映射，仅作分布格局观察，不作实天解读。':'仅按行星所落星座客观计数，不作强弱、性格解读。'}</div>
  </div>

  <div class="astro-card">
    <div class="ac-title">主相位（${aspects.length}）· 依成相紧密度</div>
    <div class="ax-list">${aspRows || '<div class="cb-note">本盘主相位较少。</div>'}</div>
  </div>

  ${!isFake?`<div class="astro-card">
    <div class="ac-title">七政与三王 · 落位尊贵</div>
    <div class="ab-list">${planetRows}</div>
  </div>`:`<div class="astro-card">
    <div class="ac-title">行星落位（变换盘）</div>
    <div class="ab-list">${planetRows}</div>
  </div>`}

  ${showTiming?`<div class="astro-card">
    <div class="ac-title">古典推运</div>
    <div class="at-row"><span class="at-k">年度小限</span><span class="at-v">${p.ageYears}岁 · 年主 ${p.annual.signName}（第${p.annual.house}宫）· 小限主星 ${p.annual.lordName}</span></div>
    <div class="at-row"><span class="at-k">本月小限</span><span class="at-v">${p.monthly.signName}（第${p.monthly.house}宫）· 主星 ${p.monthly.lordName}</span></div>
    <div class="at-row"><span class="at-k">Firdaria 主限</span><span class="at-v">${f.majorName}${f.day?' · 昼生序':' · 夜生序'}</span></div>
    <div class="at-row"><span class="at-k">Firdaria 次限</span><span class="at-v">${f.subName||'—'}</span></div>
    <div class="at-row"><span class="at-k">福点 Fortuna</span><span class="at-v">${SIGN_FULL[Math.floor(fort.lon/30)]} ${fmt(fort)} · 第${fortHouse}宫</span></div>
  </div>`:''}
  ${trCard}
  ${b2Edit}
  <div class="astro-note">${isFake?'当前为变换类盘面：黄经经数学映射重排，宫位与黄道以变换后黄经计，与实天不一一对应，用于观察格局。':'整宫制 · 七政为古典核心，三王与北交仅列位不参与尊贵。相位为合/冲/刑/拱/六合五大主相位，通行容许度（日月加 1.5°），仅作客观成相呈现。尊贵：庙=入庙、旺=旺相、三分/界/面为次级尊贵，陷/落为失位，游为无尊贵。本地天文计算，对 JPL 级星历亚角分精度。'}</div>
  ${foldVerdict(verdictCardHtml(judgeAstro(chart)))}`;
}

// 一键复制
export function astroCopyText(){
  const args=birthArgs();
  const chart=paipanXingpan(args), timing=guDianTuiYun(args);
  const f=timing.firdaria, p=timing.profection;
  const fort=chart.lots.fortune;
  const fortHouse=((Math.floor(fort.lon/30)-chart.ascSignIndex+12)%12)+1;
  const aspects=calcAspects(chart);
  const L=['【本命星盘 · 西方古典占星】'];
  L.push(`${birthText()} · ${args.place||''}`);
  L.push(`上升 ${chart.ascSignName} ${fmt(chart.asc)} · 天顶 ${fmt(chart.mc)} · ${chart.sect}盘 · 整宫制`);
  L.push(`命主星 ${chart.chartRulerName}（${chart.bodies[chart.chartRuler].signName}${chart.bodies[chart.chartRuler].house}宫）`);
  L.push('—— 行星落位 / 尊贵 / 宫位 ——');
  for(const id of ORDER){
    const b=chart.bodies[id]; if(!b) continue;
    const dg=chart.dignities[id];
    const tags=[];
    if(dg){ if(dg.rulership)tags.push('庙'); if(dg.exaltation)tags.push('旺'); if(dg.triplicity)tags.push('三分'); if(dg.term)tags.push('界'); if(dg.face)tags.push('面'); if(dg.detriment)tags.push('陷'); if(dg.fall)tags.push('落'); if(dg.peregrine)tags.push('游'); }
    L.push(`${b.name} ${b.signName} ${fmt(b.dms)} ${b.house}宫${b.retrograde?' 逆行':''}${tags.length?' ['+tags.join('/')+']':''}`);
  }
  L.push('—— 主相位（五大·按容许度）——');
  aspects.forEach((a)=>{ L.push(`${chart.bodies[a.a].name} ${a.asp.name} ${chart.bodies[a.b].name}（差 ${a.gap}°）`); });
  L.push(`福点 ${SIGN_FULL[Math.floor(fort.lon/30)]} ${fmt(fort)} 第${fortHouse}宫`);
  L.push('—— 古典推运 ——');
  L.push(`年度小限 ${p.ageYears}岁 · 年主${p.annual.signName}(${p.annual.house}宫) · 小限主星${p.annual.lordName}`);
  L.push(`本月小限 ${p.monthly.signName}(${p.monthly.house}宫) · 主星${p.monthly.lordName}`);
  L.push(`Firdaria 主限 ${f.majorName}（${f.day?'昼生序':'夜生序'}） · 次限 ${f.subName||'—'}`);
  L.push('热带黄道 · 整宫制 · 本地天文计算');
  return L.join('\n');
}

// 复现码数据 + 案例标题
export function astroCode(){
  const a=birthArgs();
  let chart=null;
  try{ chart=paipanXingpan(a); }catch{ /* 排盘失败时只给时刻 */ }
  const at=new Date(a.year,a.month-1,a.day,a.hour,a.minute,0,0).getTime();
  return {
    kind:'astro',
    data:{ at, gender:a.gender, lon:a.longitude, lat:a.latitude },
    title: chart ? `上升${chart.ascSignName} · ${chart.sect}盘` : '本命星盘',
    sub: `${birthText()} · ${a.place||''}${chart?` · 命主${chart.chartRulerName}`:''}`,
  };
}
