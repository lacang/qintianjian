// 占星全盘面类型库：36 种盘面模式（本命类 / 推运类 / 时限类 / 关系类）
// 命理 v100 · 本地算法，不接任何 AI。
// 三类算法本质：
//   A 选时刻起盘（本命/天象/日返/月返/次限/三限/时空盘…）
//   B 黄经变换（泛音×n / 12分盘 / 13分盘 / 日弧平移 / 龙首重宫 / 重置换地）
//   C 双轮叠加（比盘系：内本命 + 外推运/对方/合成盘）
import { paipanXingpan, shouyeTianxiang, guDianTuiYun } from '../vendor/liuyao-core.js?v=117';

const MS_DAY = 86400000;
const SIGN_ZH = ['白羊','金牛','双子','巨蟹','狮子','室女','天秤','天蝎','人马','摩羯','宝瓶','双鱼'];
const PL_ZH = { sun:'太阳', moon:'月亮', mercury:'水星', venus:'金星', mars:'火星', jupiter:'木星', saturn:'土星', uranus:'天王', neptune:'海王', pluto:'冥王', mean_node:'北交' };
// 传统七星主星（古典尊贵，用于时限类主星）
const TRAD_RULER = ['mars','venus','mercury','moon','sun','mercury','venus','mars','jupiter','saturn','saturn','jupiter'];

function normLon(x){ return ((x % 360) + 360) % 360; }
function angDist(a,b){ let d=Math.abs(a-b)%360; return d>180?360-d:d; }

// ---------- 基础 helper ----------
function dateToArgs(args, date){
  return { ...args, year:date.getFullYear(), month:date.getMonth()+1, day:date.getDate(), hour:date.getHours(), minute:date.getMinutes() };
}
function chartAt(args, date){ return paipanXingpan(dateToArgs(args, date)); }
function lonOf(chart, id){ const b=chart.bodies[id]; return b ? b.dms.lon : null; }
function midLon(a, b){ // 环绕中点（两黄经的圆中点）
  const d = ((b - a) % 360 + 360) % 360;
  return normLon(a + d / 2);
}
function dmsOf(lon){ const l = normLon(lon); const si = Math.floor(l/30); const inS = l - si*30; const d = Math.floor(inS); const m = Math.round((inS - d) * 60); return { degree:(d>=30?0:d), minute:(m>=60?0:m), lon:l }; }

// 从「黄经表」构造伪盘（变换类模式 B 复用渲染管线；尊贵不适用故置空）
function fakeChart(lons, ascLon, proto, keepAsc = true){
  const ascIdx = Math.floor(normLon(ascLon) / 30);
  const bodies = {};
  for (const [id, lon] of Object.entries(lons)) {
    if (lon == null) continue;
    const b = proto && proto.bodies && proto.bodies[id];
    const l = normLon(lon);
    const si = Math.floor(l / 30);
    bodies[id] = {
      id, name: PL_ZH[id] || id, signIndex: si, signName: SIGN_ZH[si],
      dms: dmsOf(l), retrograde: !!(b && b.retrograde), speed: b ? b.speed : 0,
      house: ((si - ascIdx) + 12) % 12 + 1,
    };
  }
  return {
    jdUt: proto ? proto.jdUt : 0, sect: proto ? proto.sect : '昼',
    asc: dmsOf(ascLon), mc: proto ? proto.mc : dmsOf(normLon(ascLon + 90)),
    ascSignIndex: ascIdx, ascSignName: SIGN_ZH[ascIdx],
    chartRuler: TRAD_RULER[ascIdx], chartRulerName: PL_ZH[TRAD_RULER[ascIdx]] || '',
    bodies, houses: [], dignities: {},
    lots: { fortune: proto ? proto.lots.fortune : dmsOf(0), spirit: proto ? proto.lots.spirit : dmsOf(0) },
    _fake: true,
  };
}

// ---------- 推运时刻算法（A） ----------
function ageInYears(birth, now){ return (now - birth) / (365.25 * MS_DAY); }
// 次限：一日 = 一年（出生后第 N 天即第 N 年）
function progSecDate(birth, now){ const n = Math.max(0, Math.floor(ageInYears(birth, now))); return new Date(birth.getTime() + n * MS_DAY); }
// 三限：一日 = 一个太阴月（回归年 12.368 个太阴月）
function progTerDate(birth, now){ const m = ageInYears(birth, now) * 12.368; return new Date(birth.getTime() + Math.max(0, Math.floor(m)) * MS_DAY); }
// 太阳返照：太阳回到本命精确黄经的时刻（今年太阳历一次，二分迭代）
function solarReturnDate(args, natalSunLon, now){
  const approx = new Date(now.getFullYear(), 0, 1);
  for (let k = 0; k < 400; k++) {
    const t = new Date(approx.getTime() + k * MS_DAY);
    const s = shouyeTianxiang(t).bodies.find(b => b.id === 'sun');
    if (!s) continue;
    if (angDist(s.lon, natalSunLon) < 3) {
      // 二分收敛到 4 分钟精度
      let lo = t.getTime() - MS_DAY, hi = t.getTime() + MS_DAY;
      for (let i = 0; i < 18; i++) {
        const mid = (lo + hi) / 2;
        const sm = shouyeTianxiang(new Date(mid)).bodies.find(b => b.id === 'sun');
        const dNow = ((normLon(sm.lon) - natalSunLon + 540) % 360) - 180;
        if (dNow > 0) hi = mid; else lo = mid;
      }
      return new Date(Math.round((lo + hi) / 2));
    }
  }
  return null;
}
// 月亮返照：月亮回到本命黄经（取最近一次未来时刻）
function lunarReturnDate(args, natalMoonLon, now){
  let t = new Date(now.getTime() - 28 * MS_DAY);
  let prev = null;
  for (let k = 0; k < 60; k++) {
    const t2 = new Date(t.getTime() + 0.5 * MS_DAY);
    const m = shouyeTianxiang(t2).bodies.find(b => b.id === 'moon');
    if (!m) continue;
    const d = ((normLon(m.lon) - natalMoonLon + 540) % 360) - 180;
    if (prev !== null && prev < 0 && d >= 0) {
      let lo = t2.getTime() - 0.5 * MS_DAY, hi = t2.getTime();
      for (let i = 0; i < 18; i++) {
        const mid = (lo + hi) / 2;
        const mm = shouyeTianxiang(new Date(mid)).bodies.find(b => b.id === 'moon');
        const dm = ((normLon(mm.lon) - natalMoonLon + 540) % 360) - 180;
        if (dm < 0) lo = mid; else hi = mid;
      }
      return new Date(Math.round((lo + hi) / 2));
    }
    prev = d; t = t2;
  }
  return null;
}
// 日弧：次限太阳推进的弧度 ≈ 年龄 × 0.9855°
function solarArc(birth, now){ return ageInYears(birth, now) * 0.9855; }

// ---------- 时限类算法（文字轴） ----------
const ZR_YEARS = [12, 22, 28, 12, 22, 28, 12, 22, 28, 12, 22, 28]; // 白羊起：角12/续22/果28
// 黄道释放（Valens）：从释放点星座起 L1，逐星座累计；L2 为其内部十二分
function zrRelease(fromLon, birth, now){
  const startIdx = Math.floor(normLon(fromLon) / 30);
  let acc = 0; const segs = [];
  for (let cycle = 0; cycle < 3; cycle++) {
    for (let i = 0; i < 12; i++) {
      const si = (startIdx + i) % 12;
      const yrs = ZR_YEARS[si];
      segs.push({ idx: si, signName: SIGN_ZH[si], lord: TRAD_RULER[si], lordName: PL_ZH[TRAD_RULER[si]], start: acc, end: acc + yrs, years: yrs });
      acc += yrs;
    }
  }
  const age = ageInYears(birth, now);
  const cur = segs.find(s => age >= s.start && age < s.end) || segs[0];
  const l2Len = cur.years / 12;
  const inSeg = age - cur.start;
  const l2i = Math.min(11, Math.floor(inSeg / l2Len));
  const l2Idx = (cur.idx + l2i) % 12;
  // 邻近三段（前-当前-后）
  const ci = segs.indexOf(cur);
  const around = [segs[(ci - 1 + segs.length) % segs.length], cur, segs[(ci + 1) % segs.length]];
  return { cur, l2Idx, l2SignName: SIGN_ZH[l2Idx], l2Lord: TRAD_RULER[l2Idx], l2LordName: PL_ZH[TRAD_RULER[l2Idx]], l2Len, around, age };
}
// 希腊行星纪元（Valens 行星年表）：Chaldean 序，昼起太阳 / 夜起月亮
const DECE_YEARS = { sun:18, venus:8, mercury:20, moon:25, saturn:30, jupiter:12, mars:15 };
const CHALDEAN = ['saturn','jupiter','mars','sun','venus','mercury','moon'];
function greekDecennia(chart, birth, now){
  const start = (chart.sect === '昼') ? 'sun' : 'moon';
  const order = [];
  let i = CHALDEAN.indexOf(start);
  for (let k = 0; k < 7; k++) order.push(CHALDEAN[(i + k) % 7]);
  let acc = 0; const segs = [];
  for (let cyc = 0; cyc < 6; cyc++) for (const p of order) { segs.push({ lord: p, lordName: PL_ZH[p], start: acc, end: acc + DECE_YEARS[p], years: DECE_YEARS[p] }); acc += DECE_YEARS[p]; }
  const age = ageInYears(birth, now);
  const cur = segs.find(s => age >= s.start && age < s.end) || segs[0];
  return { cur, inYear: age - cur.start, left: cur.end - age, age };
}

// ---------- 关系盘（本命2 / 中点 / 时空 / 马盘） ----------
export const B2_KEY = 'qintian.astro.b2';
export const RESET_KEY = 'qintian.astro.geo';
// 城市表：接全量离线库（citydata.js），保持 { name, lat, lonEast } 契约，citydata 里北京排第一（默认兜底仍是北京）
import { CITIES as ALL_CITIES } from './citydata.js?v=117';
export const CITIES = ALL_CITIES.map(c => ({ name: c.n, lat: c.lat, lonEast: c.lon, py: c.py, ini: c.ini, prov: c.prov }));
function readB2(){ try{ const raw = localStorage.getItem(B2_KEY); return raw ? JSON.parse(raw) : null; }catch{ return null; } }
function b2Args(base){
  const b2 = readB2();
  if (!b2) return null;
  const city = CITIES.find(c => c.name === b2.city) || CITIES[0];
  return { ...base, year:+b2.year, month:+b2.month, day:+b2.day, hour:+b2.hour, minute:+b2.minute||0, lat:city.lat, lonEast:city.lonEast, place:city.name };
}
function outerFromChart(c){
  if (!c) return null;
  const o = [];
  for (const id of Object.keys(PL_ZH)) { const b = c.bodies[id]; if (b) o.push({ id, lon: b.dms.lon, rx: !!b.retrograde, name: b.name }); }
  return o;
}

// ---------- 模式表 ----------
// calc(ctx) → { chart, outer, label, note, timeAxis }
// ctx = { args, chart(本命), birth(Date), now(Date), b2args }
export const ASTRO_MODES = [
  // ===== 本命类 =====
  { key:'natal', name:'本命盘', sub:'出生时刻起盘', group:'natal',
    calc:(c)=>({ chart:c.chart, label:'本命盘 · 出生日落定时' }) },
  { key:'sky', name:'天象盘', sub:'此刻天象即时盘', group:'natal',
    calc:(c)=>({ chart:chartAt(c.args, c.now), label:'天象盘 · 此刻实况', note:'以当下时刻、出生地经纬起盘，即问即天。卜卦占星常以问事时刻的这种「天象盘」为体。' }) },
  { key:'harmonic', name:'泛音盘', sub:'四倍谐波变换', group:'natal',
    calc:(c)=>{
      const n = 4, lons = {};
      for (const [id,b] of Object.entries(c.chart.bodies)) lons[id] = normLon(b.dms.lon * n);
      const asc = normLon(c.chart.asc.lon * n);
      return { chart:fakeChart(lons, asc, c.chart), label:'泛音盘 · 4 倍谐波', note:'泛音（Harmonic）技法：把黄经乘以 4 取模 360°，凸显四分相结构与「张力—整合」主题。宫位与黄道按变换后黄经重排，与实天不对应，仅看格局。' };
    } },
  { key:'dwad', name:'12分盘', sub:'每星座12等分映射', group:'natal',
    calc:(c)=>{
      const lons = {};
      for (const [id,b] of Object.entries(c.chart.bodies)) {
        const l = normLon(b.dms.lon), si = Math.floor(l/30), sub = Math.floor((l%30)/2.5);
        lons[id] = normLon(((si + sub) % 12) * 30 + ((l%30)/2.5 - sub) * 30);
      }
      const asc = (()=>{ const l = normLon(c.chart.asc.lon), si = Math.floor(l/30), sub = Math.floor((l%30)/2.5); return normLon(((si+sub)%12)*30 + ((l%30)/2.5 - sub)*30); })();
      return { chart:fakeChart(lons, asc, c.chart), label:'12分盘 · Dwadasamsa', note:'D12 分盘：把每星座十二等分，每份 2.5° 各归一星座（双鱼分盘旧法用于父母/家族脉络）。变换后黄经仅供看行星分布格局，非实天。' };
    } },
  { key:'d13', name:'13分盘', sub:'13倍谐波映射', group:'natal',
    calc:(c)=>{
      const lons = {};
      for (const [id,b] of Object.entries(c.chart.bodies)) lons[id] = normLon(b.dms.lon * 13);
      const asc = normLon(c.chart.asc.lon * 13);
      return { chart:fakeChart(lons, asc, c.chart), label:'13分盘 · 13 倍谐波', note:'13 倍谐波映射：黄经乘 13 取模 360°，现代泛音技法的 13 分变体，用于观察隐微连结（13 谐波常关联细密协作与暗流）。非实天位置。' };
    } },
  { key:'dragon', name:'龙首盘', sub:'北交点为升重排宫', group:'natal',
    calc:(c)=>{
      const node = lonOf(c.chart, 'mean_node'); if (node == null) return null;
      return { chart:fakeChart(c.chart, node, c.chart, true) && (()=>{ // 行星黄经不变，仅以龙首为上升重排整宫
        const ch = fakeChart(Object.fromEntries(Object.entries(c.chart.bodies).map(([id,b])=>[id,b.dms.lon])), node, c.chart);
        ch.bodies = {}; // 保留原始体（含真实逆行与落座），只重算宫位
        for (const [id,b] of Object.entries(c.chart.bodies)) { const bb = { ...b }; bb.house = ((b.signIndex - Math.floor(node/30)) + 12) % 12 + 1; ch.bodies[id] = bb; }
        return ch; })(), label:'龙首盘 · 北交为命', note:'以本命北交点（龙首）替代上升重排整宫十二宫——印度占星的 Rahu 盘，观「灵魂走向/此生功课」用。行星实天黄经不变。' };
    } },
  { key:'reloc', name:'重置盘', sub:'换城市重置宫位', group:'natal',
    calc:(c)=>{
      let g = null; try{ g = JSON.parse(localStorage.getItem(RESET_KEY) || 'null'); }catch{}
      const city = (g && CITIES.find(x=>x.name===g.city)) || CITIES[0];
      const ch = paipanXingpan({ ...c.args, lat:city.lat, lonEast:city.lonEast, place:city.name });
      return { chart:ch, label:`重置盘 · ${city.name}`, note:'出生时刻不变、换观测地点重排 ASC/天顶与整宫——占星重置（Relocation）技法，看「换个地方生活，盘会怎么走」。行星黄经不变，宫位全变。' };
    } },
  // ===== 推运类 =====
  { key:'transit', name:'行运盘', sub:'内本命 · 外此刻', group:'prog',
    calc:(c)=>{
      const outer = shouyeTianxiang(c.now).bodies.map(b=>({ id:b.id, lon:b.lon, rx:!!b.retrograde, name:b.name }));
      return { chart:c.chart, outer, label:'行运盘 · 此刻天上 vs 本命', note:'内圈本命、外圈此刻真实行星。外圈引线终点即行运星当前黄经；外圈星与本命星的成相线即「行运触发的时刻」。' };
    } },
  { key:'sec', name:'次限盘', sub:'一日一年推运', group:'prog',
    calc:(c)=>{ const d = progSecDate(c.birth, c.now); return { chart:chartAt(c.args, d), label:`次限盘 · 出生后第 ${Math.floor(ageInYears(c.birth,c.now))} 天`, note:'次限推运（Secondary Progressions）：出生后第 N 天的天象即第 N 年的推运盘。次限太阳/月亮看人生大势节律，次限 ASC/MC 为逐日宫位法（Quotidian）。' }; } },
  { key:'secCmp', name:'次限比盘', sub:'内本命 · 外次限', group:'prog',
    calc:(c)=>{ const d = progSecDate(c.birth, c.now); const oc = chartAt(c.args, d); return { chart:c.chart, outer:outerFromChart(oc), label:'次限比盘 · 本命 vs 次限', note:'内圈本命、外圈次限。外圈推进星与本命星的成相线＝推运对基盘的触发点，是看「这一年推运落在哪」的直接盘面。' }; } },
  { key:'ter', name:'三限盘', sub:'一日一月推运', group:'prog',
    calc:(c)=>{ const d = progTerDate(c.birth, c.now); return { chart:chartAt(c.args, d), label:'三限盘 · 出生后第 N 月', note:'三限推运（Tertiary Progressions）：一日＝一个太阴月。次限看年际大势，三限看数月内的中程节奏，月亮变化尤其灵敏。' }; } },
  { key:'terCmp', name:'三限比盘', sub:'内本命 · 外三限', group:'prog',
    calc:(c)=>{ const d = progTerDate(c.birth, c.now); const oc = chartAt(c.args, d); return { chart:c.chart, outer:outerFromChart(oc), label:'三限比盘 · 本命 vs 三限', note:'内圈本命、外圈三限推进星。看当前数月推运对本命基盘的成相触发。' }; } },
  { key:'solar', name:'日返盘', sub:'太阳归位时刻盘', group:'prog',
    calc:(c)=>{
      const d = solarReturnDate(c.args, lonOf(c.chart,'sun'), c.now); if (!d) return null;
      return { chart:chartAt(c.args, d), label:`日返盘 · ${d.getFullYear()}年太阳回归`, note:`太阳返照（Solar Return）：太阳回到本命精确黄经的时刻起盘——今年「太阳生日」的天象，看这一个太阳年的年度主题。今年回归时刻：${d.toLocaleString('zh-CN')}` };
    } },
  { key:'solarCmp', name:'日返比盘', sub:'内本命 · 外日返', group:'prog',
    calc:(c)=>{
      const d = solarReturnDate(c.args, lonOf(c.chart,'sun'), c.now); if (!d) return null;
      const oc = chartAt(c.args, d);
      return { chart:c.chart, outer:outerFromChart(oc), label:'日返比盘 · 本命 vs 今年日返', note:'内圈本命、外圈今年日返盘。返照星对本命星的成相线＝今年年度主题落在基盘何处。' };
    } },
  { key:'lunar', name:'月返盘', sub:'月亮归位时刻盘', group:'prog',
    calc:(c)=>{
      const d = lunarReturnDate(c.args, lonOf(c.chart,'moon'), c.now); if (!d) return null;
      return { chart:chartAt(c.args, d), label:`月返盘 · ${d.toLocaleDateString('zh-CN')}`, note:`月亮返照（Lunar Return）：月亮回到本命精确黄经的时刻起盘——约 27.3 天一次，看「月亮月」的居家/情绪/日常节律。本次回归时刻：${d.toLocaleString('zh-CN')}` };
    } },
  { key:'lunarCmp', name:'月返比盘', sub:'内本命 · 外月返', group:'prog',
    calc:(c)=>{
      const d = lunarReturnDate(c.args, lonOf(c.chart,'moon'), c.now); if (!d) return null;
      const oc = chartAt(c.args, d);
      return { chart:c.chart, outer:outerFromChart(oc), label:'月返比盘 · 本命 vs 本月月返', note:'内圈本命、外圈本次月返。看本月月亮主题对本命盘的触发点。' };
    } },
  { key:'arc', name:'日弧盘', sub:'太阳弧整体推进', group:'prog',
    calc:(c)=>{
      const arc = solarArc(c.birth, c.now);
      const lons = {}; for (const [id,b] of Object.entries(c.chart.bodies)) lons[id] = normLon(b.dms.lon + arc);
      const asc = normLon(c.chart.asc.lon + arc);
      return { chart:fakeChart(lons, asc, c.chart), label:`日弧盘 · 弧度 ${arc.toFixed(2)}°`, note:'太阳弧（Solar Arc）：全部星与轴点按「次限太阳推进弧」整体平移（约每年 0.9855°）。日弧星与本命星成相＝该年人生节点。变换后黄经为推运黄经，非实天。' };
    } },
  { key:'arcCmp', name:'日弧比盘', sub:'内本命 · 外日弧', group:'prog',
    calc:(c)=>{
      const arc = solarArc(c.birth, c.now);
      const outer = Object.entries(c.chart.bodies).map(([id,b])=>({ id, lon:normLon(b.dms.lon + arc), rx:!!b.retrograde, name:b.name }));
      return { chart:c.chart, outer, label:'日弧比盘 · 本命 vs 日弧', note:'内圈本命、外圈日弧推进星。外圈星与内圈星的成相线即当前人生节点的精确触发。' };
    } },
  // ===== 时限类 =====
  { key:'firdaria', name:'法达盘', sub:'七政轮主限', group:'time',
    calc:(c)=>{
      const f = c.timing.firdaria;
      const hl = f.major; const hlSub = f.sub;
      return { chart:c.chart, label:'法达盘 · 主限 ' + f.majorName, highlight:{ major:hl, sub:hlSub },
        note:'法达星限（Firdaria，波斯—中世纪）：昼生自太阳、夜生自月亮起，七政按固定年序轮值主限，主限内再细分副限。当前主限星与副限星在盘上加环高亮。年表见下方推运卡。' };
    } },
  { key:'profection', name:'小限盘', sub:'年宫递进高亮', group:'time',
    calc:(c)=>{
      const p = c.timing.profection;
      return { chart:c.chart, label:`小限盘 · ${p.annual.house}宫 ${p.annual.signName}`, highlightHouse:p.annual.house,
        note:`岁限小法（Annual Profections，希腊—中世纪）：每年自命宫顺进一宫，年主星（${p.annual.lordName}）领一年之事；月限同法再分。当前 ${p.annual.house} 宫小限、${p.monthly.house} 宫月限。年宫在盘上加环高亮。` };
    } },
  { key:'medprof', name:'中世小限盘', sub:'宫主星链详注', group:'time',
    calc:(c)=>{
      const p = c.timing.profection;
      const hIdx = p.annual.house - 1;
      const hs = c.chart.houses[hIdx];
      const inStar = (hs && hs.bodies && hs.bodies.length) ? hs.bodies.map(id=>c.chart.bodies[id].name).join('、') : '空宫';
      return { chart:c.chart, label:`中世小限 · ${p.annual.house}宫 ${p.annual.signName}`, highlightHouse:p.annual.house,
        note:`中世纪小限法（参照 Bonatti / Lilly 传统）：年宫第 ${p.annual.house} 宫 ${p.annual.signName}，宫主 ${p.annual.lordName} 为年主星，宫内星：${inStar}。年主星状态（庙旺陷落）与宫内星定一年基调；月限第 ${p.monthly.house} 宫（${p.monthly.lordName}）定当月事。` };
    } },
  { key:'zr', name:'黄道释放', sub:'Valens 十年释放', group:'time',
    calc:(c)=>{
      const zr = zrRelease(c.chart.lots.fortune.lon, c.birth, c.now);
      return { chart:c.chart, label:`黄道释放 · ${zr.cur.signName} ${zr.cur.lordName}限`, highlight:{ major:zr.cur.lord },
        timeAxis:{ title:'黄道释放（自福点）· L1 段', rows:[
          { a:zr.around[0].lordName, b:zr.around[0].signName, c:`${zr.around[0].start}–${zr.around[0].end}岁` },
          { a:zr.cur.lordName + '（当前）', b:zr.cur.signName, c:`${zr.cur.start}–${zr.cur.end}岁 · L2：${zr.l2SignName} ${zr.l2LordName}` },
          { a:zr.around[2].lordName, b:zr.around[2].signName, c:`${zr.around[2].start}–${zr.around[2].end}岁` },
        ] },
        note:'黄道释放（Zodiacal Releasing，Vettius Valens《文集》）：自福点所在星座起算，角宫星座 12 年、续宫 22 年、果宫 28 年逐段释放，段主星=星座主星；段内再分十二子段（L2）。看人生大运起落段落。' };
    } },
  { key:'greekdec', name:'希腊十年盘', sub:'行星纪元年表', group:'time',
    calc:(c)=>{
      const g = greekDecennia(c.chart, c.birth, c.now);
      return { chart:c.chart, label:`希腊纪元 · ${g.cur.lordName}主 ${g.inYear.toFixed(1)}/${g.cur.years}年`, highlight:{ major:g.cur.lord },
        timeAxis:{ title:'行星纪元（Valens 年表）', rows:[
          { a:g.cur.lordName + '（当前）', b:`${g.cur.years} 年一纪`, c:`已入 ${g.inYear.toFixed(1)} 年 · 余 ${g.left.toFixed(1)} 年` },
        ] },
        note:'希腊行星纪元（Chaldean 次序）：昼生自太阳、夜生自月亮起，按土—木—火—日—金—水—月次序轮值（日18/金8/水20/月25/土30/木12/火15 年，Valens《文集》卷二）。当前纪元主星在盘上加环高亮。' };
    } },
  // ===== 关系类（需本命2）=====
  { key:'natal2', name:'本命2盘', sub:'第二人本命', group:'rel',
    calc:(c)=>{ const a2 = c.b2args; if (!a2) return null; return { chart:paipanXingpan(a2), label:'本命2 · 第二人本命盘', note:'第二人（本命2）的独立本命盘。先在下方录入其出生信息，比较/组合/时空/马盘等关系技法均以其为本。' }; } },
  { key:'synastry', name:'比较盘', sub:'内本命 · 外对方', group:'rel',
    calc:(c)=>{ const a2 = c.b2args; if (!a2) return null; const c2 = paipanXingpan(a2);
      return { chart:c.chart, outer:outerFromChart(c2), label:'比较盘 · 双人星对照', note:'合盘技法之一（Synastry）：内圈本命、外圈对方星。对方星落进本命哪个宫、成什么相——两人互动的直接对照。' }; } },
  { key:'composite', name:'组合盘', sub:'两盘中点合成', group:'rel',
    calc:(c)=>{ const a2 = c.b2args; if (!a2) return null; const c2 = paipanXingpan(a2);
      const lons = {};
      for (const id of Object.keys(PL_ZH)) { const a = lonOf(c.chart, id), b = lonOf(c2, id); if (a != null && b != null) lons[id] = midLon(a, b); }
      const asc = midLon(c.chart.asc.lon, c2.asc.lon);
      return { chart:fakeChart(lons, asc, c.chart), label:'组合盘 · 中点合成', note:'组合盘（Composite， midpoint 法）：两人每颗行星黄经取圆中点、ASC 亦然——「这段关系本身」作为一个独立实体的盘。看关系特质而非两人各自。' }; } },
  { key:'davison', name:'时空盘', sub:'时刻地点双中点', group:'rel',
    calc:(c)=>{ const a2 = c.b2args; if (!a2) return null;
      const midT = new Date((c.birth.getTime() + new Date(a2.year, a2.month-1, a2.day, a2.hour||0, a2.minute||0).getTime()) / 2);
      const ch = paipanXingpan({ ...a2, year:midT.getFullYear(), month:midT.getMonth()+1, day:midT.getDate(), hour:midT.getHours(), minute:midT.getMinutes(), lat:(c.args.lat + a2.lat)/2, lonEast:(c.args.lonEast + a2.lonEast)/2, place:'时空中点' });
      return { chart:ch, label:'时空盘 · Davison 中点', note:'时空盘（Davison Relationship Chart）：两人出生时刻取中点、出生地经纬各取中点，在这个「真实的中点时刻与地点」起一张实际天象盘——关系作为独立实体的「真实盘」。' }; } },
  { key:'marks', name:'马克思盘', sub:'一人时刻一人地点', group:'rel',
    calc:(c)=>{ const a2 = c.b2args; if (!a2) return null;
      const ch = paipanXingpan({ ...a2, year:c.args.year, month:c.args.month, day:c.args.day, hour:c.args.hour, minute:c.args.minute, lat:a2.lat, lonEast:a2.lonEast, place:'马克斯合成' });
      return { chart:ch, label:'马克思盘 · Marks 合成', note:'马克思盘（Marks Chart）：本命一的时间 + 本命二的地点合成——「我在你的世界如何运转」。看单向视角的关系体验（与比较盘对照使用）。' }; } },
  { key:'synSec', name:'比较次限盘', sub:'内本命 · 外对方次限', group:'rel',
    calc:(c)=>{ const a2 = c.b2args; if (!a2) return null;
      const b2d = new Date(a2.year, a2.month-1, a2.day, a2.hour||0, a2.minute||0);
      const n2 = Math.max(0, Math.floor(ageInYears(b2d, c.now)));
      const oc = chartAt(a2, new Date(b2d.getTime() + n2 * MS_DAY));
      return { chart:c.chart, outer:outerFromChart(oc), label:'比较次限 · 对方推进 vs 本命', note:'关系推运：对方次限推进星 vs 本命基盘——对方当前人生阶段落在你盘上的位置。' }; } },
  { key:'synTer', name:'比较三限盘', sub:'内本命 · 外对方三限', group:'rel',
    calc:(c)=>{ const a2 = c.b2args; if (!a2) return null;
      const b2d = new Date(a2.year, a2.month-1, a2.day, a2.hour||0, a2.minute||0);
      const m2 = Math.max(0, Math.floor(ageInYears(b2d, c.now) * 12.368));
      const oc = chartAt(a2, new Date(b2d.getTime() + m2 * MS_DAY));
      return { chart:c.chart, outer:outerFromChart(oc), label:'比较三限 · 对方三限 vs 本命', note:'对方三限（一日一月）推进星对本命盘的成相——关系里对方近几月的动向触点。' }; } },
  { key:'compSec', name:'组合次限盘', sub:'组合盘次限', group:'rel',
    calc:(c)=>{ const a2 = c.b2args; if (!a2) return null; const c2 = paipanXingpan(a2);
      const lons = {};
      for (const id of Object.keys(PL_ZH)) { const a = lonOf(c.chart, id), b = lonOf(c2, id); if (a != null && b != null) lons[id] = midLon(a, b); }
      const asc = midLon(c.chart.asc.lon, c2.asc.lon);
      const arc = solarArc(c.birth, c.now);
      const o = Object.entries(lons).map(([id,lon])=>({ id, lon:normLon(lon + arc), rx:false, name:PL_ZH[id] }));
      return { chart:c.chart, outer:o, label:'组合次限 · 关系推进', note:'组合盘中点星再按日弧整体推进——关系实体随时间演进的位置。外圈=组合盘行星+日弧，内圈=本命。' }; } },
  { key:'compTer', name:'组合三限盘', sub:'组合盘三限', group:'rel',
    calc:(c)=>{ const a2 = c.b2args; if (!a2) return null; const c2 = paipanXingpan(a2);
      const lons = {};
      for (const id of Object.keys(PL_ZH)) { const a = lonOf(c.chart, id), b = lonOf(c2, id); if (a != null && b != null) lons[id] = midLon(a, b); }
      const t = progTerDate(c.birth, c.now);
      const base = chartAt(c.args, t);
      const o = [];
      for (const [id, lon] of Object.entries(lons)) { const tb = base.bodies[id]; o.push({ id, lon:normLon(midLon(lon, tb ? tb.dms.lon : lon)), rx:!!(tb && tb.retrograde), name:PL_ZH[id] }); }
      return { chart:c.chart, outer:o, label:'组合三限 · 关系近期', note:'组合盘中点星按三限节奏取序推进——关系近期数月的动态（外圈），对照本命内圈。' }; } },
  { key:'davSec', name:'时空次限盘', sub:'时空盘次限', group:'rel',
    calc:(c)=>{ const a2 = c.b2args; if (!a2) return null;
      const midT = new Date((c.birth.getTime() + new Date(a2.year, a2.month-1, a2.day, a2.hour||0, a2.minute||0).getTime()) / 2);
      const n = Math.max(0, Math.floor(ageInYears(midT, c.now)));
      const oc = paipanXingpan({ ...a2, year:(midT.getFullYear()+n), month:midT.getMonth()+1, day:midT.getDate(), hour:midT.getHours(), minute:midT.getMinutes(), lat:(c.args.lat + a2.lat)/2, lonEast:(c.args.lonEast + a2.lonEast)/2, place:'时空次限' });
      return { chart:c.chart, outer:outerFromChart(oc), label:'时空次限 · 关系年进', note:'时空中点盘再按次限（一日一年）推进——关系实体这一年的推进盘（外圈），对照本命内圈。' }; } },
  { key:'davTer', name:'时空三限盘', sub:'时空盘三限', group:'rel',
    calc:(c)=>{ const a2 = c.b2args; if (!a2) return null;
      const midT = new Date((c.birth.getTime() + new Date(a2.year, a2.month-1, a2.day, a2.hour||0, a2.minute||0).getTime()) / 2);
      const m = Math.max(0, Math.floor(ageInYears(midT, c.now) * 12.368));
      const oc = paipanXingpan({ ...a2, year:(midT.getFullYear()+Math.floor(m/365.25)), month:midT.getMonth()+1, day:midT.getDate(), hour:midT.getHours(), minute:midT.getMinutes(), lat:(c.args.lat + a2.lat)/2, lonEast:(c.args.lonEast + a2.lonEast)/2, place:'时空三限' });
      return { chart:c.chart, outer:outerFromChart(oc), label:'时空三限 · 关系月进', note:'时空中点盘按三限（一日一月）推进——关系近期数月的动态（外圈）。' }; } },
  { key:'marksSec', name:'马盘次限盘', sub:'马盘次限', group:'rel',
    calc:(c)=>{ const a2 = c.b2args; if (!a2) return null;
      const n = Math.max(0, Math.floor(ageInYears(c.birth, c.now)));
      const oc = paipanXingpan({ ...a2, year:(c.args.year+n), month:c.args.month, day:c.args.day, hour:c.args.hour, minute:c.args.minute, lat:a2.lat, lonEast:a2.lonEast, place:'马盘次限' });
      return { chart:c.chart, outer:outerFromChart(oc), label:'马盘次限 · 单向推进', note:'马克思盘按次限（一日一年）推进——「我在你的世界」随年份演进的位置（外圈）。' }; } },
  { key:'marksTer', name:'马盘三限盘', sub:'马盘三限', group:'rel',
    calc:(c)=>{ const a2 = c.b2args; if (!a2) return null;
      const m = Math.max(0, Math.floor(ageInYears(c.birth, c.now) * 12.368));
      const oc = paipanXingpan({ ...a2, year:(c.args.year+Math.floor(m/365.25)), month:c.args.month, day:c.args.day, hour:c.args.hour, minute:c.args.minute, lat:a2.lat, lonEast:a2.lonEast, place:'马盘三限' });
      return { chart:c.chart, outer:outerFromChart(oc), label:'马盘三限 · 单向近期', note:'马克思盘按三限（一日一月）推进——单向视角关系近期数月的动态（外圈）。' }; } },
];

export const ASTRO_MODE_KEY = 'qintian.astro.mode';
export function curAstroMode(){
  try{ const k = localStorage.getItem(ASTRO_MODE_KEY); return ASTRO_MODES.find(m=>m.key===k) || ASTRO_MODES[0]; }catch{ return ASTRO_MODES[0]; }
}
export function modeNeedsB2(mode){ return mode.group === 'rel'; }
export function readB2Public(){ return readB2(); }
