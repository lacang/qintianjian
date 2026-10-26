// v104 塔罗冒烟：--card-r 注入 + 渲染结构
const el = (id) => globalThis.__els[id];
globalThis.__els = {};
function mkEl(id) { return { id, innerHTML:'', textContent:'', value:'', attrs:{}, addEventListener(){}, classList:{add(){},remove(){},contains:()=>false,toggle(){}}, appendChild(){}, closest(){return null}, getAttribute(k){return this.attrs[k]||null}, setAttribute(k,v){this.attrs[k]=v} }; }
['tr-sheet','tr-term','tr-body','tr-result','tr-reveal-count','toast'].forEach(i => globalThis.__els[i] = mkEl(i));
globalThis.document = {
  getElementById: (i) => globalThis.__els[i] || null,
  querySelector: () => null,
  querySelectorAll: () => [],
  createElement: () => mkEl(),
  addEventListener(){}, body:{appendChild(){},classList:{add(){},remove(){}}},
};
globalThis.localStorage = { _m:{}, getItem(k){return this._m[k]??null}, setItem(k,v){this._m[k]=v}, removeItem(k){delete this._m[k]} };
Object.defineProperty(globalThis, 'navigator', { value:{}, configurable:true, writable:true });
globalThis.window = { innerWidth: 390, innerHeight: 800 };
const m = await import('./tarot_bundle.mjs');
const html = m.renderTarot();
const pass = [], fail = [];
const t = (name, cond) => (cond ? pass : fail).push(name);
// v109：主屏是极简容器（进视图即落座 fixed 牌桌），控制项全部移入牌桌 ☰ 设置抽屉
t('主屏根注入 --card-r:860/1433 (rws)', html.includes('style="--card-r:860/1433"'));
t('主屏只剩 #tr-result 容器', html.includes('id="tr-result"') && !html.includes('id="tr-draw"'));
globalThis.localStorage.setItem('qintian.tarot.deck', 'marseille');
t('切牌组后 --card-r:463/880', m.renderTarot().includes('--card-r:463/880'));
globalThis.localStorage.setItem('qintian.tarot.deck', 'visconti');
t('Visconti --card-r:440/880', m.renderTarot().includes('--card-r:440/880'));
globalThis.localStorage.setItem('qintian.tarot.deck', 'sb');
t('SB --card-r:474/877', m.renderTarot().includes('--card-r:474/877'));
globalThis.localStorage.setItem('qintian.tarot.deck', 'rws');
t('主屏无 undefined/NaN 泄漏', !/\bundefined\b|\bNaN\b/.test(html));

// v109：牌组/牌阵/抽法/逆位/提问/图鉴 全部在牌桌设置抽屉 menuHTML
m.tarotSetTableForTest('three-time', 'fan');
let menu = m.menuHTML();
t('菜单含牌组按钮', menu.includes('data-tr-deck="rws"'));
t('菜单含抽法自动/亲手', menu.includes('data-tr-mode="auto"') && menu.includes('data-tr-mode="manual"'));
t('菜单含逆位开关+提问框', menu.includes('id="tr-revtoggle"') && menu.includes('id="tr-question"'));
t('菜单含图鉴/说明入口', menu.includes('id="trm-gallery"') && menu.includes('id="trm-about"'));
t('菜单无塔罗/雷诺曼分类条（v120 已撤小雷诺曼）', !menu.includes('data-tr-cat'));
globalThis.localStorage.setItem('qintian.tarot.deck', 'vieville');
t('维埃维尔菜单有逆位开关', m.menuHTML().includes('id="tr-revtoggle"'));
globalThis.localStorage.setItem('qintian.tarot.deck', 'rws');

// v109：9 个经典牌阵全部在菜单牌阵选择器里
const SP = ['single','three-time','three-guidance','celtic-cross','star-six','relationship','choice','week-seven','houses-twelve'];
t('菜单牌阵含 9 经典阵', SP.every(id => menu.includes(`data-tr-spread="${id}"`)));

// v108 牌桌：9 阵槽位数 + 三式展牌结构
for (const [id, n] of [['single',1],['three-time',3],['star-six',6],['relationship',5],['choice',5],['week-seven',7],['houses-twelve',12],['celtic-cross',10]]) {
  m.tarotSetTableForTest(id, 'fan');
  const th = m.tableHTML();
  t(`v108 ${id} 全屏桌面+切换钮`, th.includes('tr-table') && th.includes('trt-layout'));
  t(`v108 ${id} 槽位数=${n}`, th.split('data-trt-slot=').length === n + 1);
  t(`v108 ${id} 扇面有牌项`, (th.match(/trf-item/g)||[]).length >= n);
  t(`v108 ${id} 米边牌背 trpc`, th.includes('trpc'));
}
// 三式各自结构
m.tarotSetTableForTest('three-time', 'stack');
const thS = m.tableHTML();
t('牌堆式含切牌提示+牌堆', thS.includes('trt-stack"') && thS.includes('点牌堆切牌'));
m.tarotSetTableForTest('three-time', 'fan');
const thF0 = m.tableHTML();
t('v110 扇面基角居中（中牌≈0°，非旧 -90°）', thF0.includes('--a:-1.05deg') && thF0.includes('--a:1.05deg') && !thF0.includes('-168'));
const stF = m.tarotState(); stF.tablePick = { idx: 39 };
const thF = m.tableHTML();
t('v110 点选牌只探出 is-pick（不飞出）', (thF.match(/is-pick/g)||[]).length >= 1 && thF.includes('trt-stage-fan') && thF.includes('空白处左右滑动整副'));
stF.tablePick = null;
// v115：拱桥式已撤下，只剩 stack/fan 两式；渲染分支不再产出任何拱桥结构
m.tarotSetTableForTest('three-time', 'stack');
const thB = m.tableHTML();
t('v115 拱桥撤下（无 trg-rail / trt-stage-bridge）', !thB.includes('trg-rail') && !thB.includes('trt-stage-bridge') && thB.includes('trt-stack'));
// v115 牌堆切牌提示文案更新
m.tarotSetTableForTest('three-time', 'stack');
const thCut = m.tableHTML();
t('v115 牌堆切牌提示（一张牌从上面切到底下）', thCut.includes('点牌堆切牌（一张牌从上面切到底下）'));
// v115 扇面选中只轻抬：pick-lift 上限 46px（旧版 130px）
m.tarotSetTableForTest('three-time', 'fan');
const thLift = m.tableHTML();
t('v115 扇面选中轻抬（pick-lift≤46px）', /--pick-lift:(?:[0-9]|[1-3][0-9]|4[0-6])px/.test(thLift) && !/--pick-lift:(?:[5-9][0-9]|[1-9][0-9]{2,})px/.test(thLift));
// hint 在顶部胶囊（不再与牌堆重叠）
t('hint 顶部胶囊', m.tableHTML().includes('trt-hint') && m.tableHTML().includes('点选一张牌，亲手拖到发光的位置'));
// v109：顶栏 ☰ 设置 + ↺ 重发；舞台为独立 fixed 容器 trt-stagepos（修扇面圆心）；无旧 flex 底栏
t('v109 顶栏菜单+重发按钮', thF.includes('id="trt-menu"') && thF.includes('data-tr-reshuffle'));
t('v109 独立舞台容器', thF.includes('trt-stagepos') && !thF.includes('trt-bottom'));
// 凯尔特第二张横置水印
m.tarotSetTableForTest('celtic-cross', 'fan');
const thX = m.tableHTML();
t('凯尔特第二槽横置', thX.includes('trt-slotmark is-h'));
// 落一张牌后该槽出现 fcb 牌背
m.tarotSetTableForTest('three-time', 'fan'); m.tarotLandForTest(1);
const th2 = m.tableHTML();
t('v108 落位后槽1 filled+牌背', th2.includes('trt-filled') && th2.includes('trt-back'));
t('v108 落位后进度 1/3', th2.includes('1/3'));
t('v108 空槽仍是虚线水印', (th2.match(/trt-slotmark/g)||[]).length === 2);
// 结果解读：通用坐标阵（六芒星）无 undefined
m.tarotSetTableForTest('star-six', 'fan');
const st = m.tarotState();
st.tableSlots = st.pickDeck.slice(0,6); st.tableFlip = st.tableSlots.map(()=>true);
// 直接构造 drawn 走 readResult 不易访问，改为验证 tableHTML 全翻后出现开牌解局
const thFull = m.tableHTML();
t('v108 全翻出现开牌解局', thFull.includes('trt-read'));

// v108 9 阵结果解读均无 undefined / NaN / [object Object]
for (const [id, n] of [['single',1],['three-time',3],['three-guidance',3],['celtic-cross',10],['star-six',6],['relationship',5],['choice',5],['week-seven',7],['houses-twelve',12]]) {
  m.tarotSetTableForTest(id, 'fan');
  const st0 = m.tarotState();
  st0.drawn = st0.pickDeck.slice(0, n).map((c,i)=>({id:c.id, rev:i%3===0}));
  const draw = st0.drawn;
  let h = '';
  try { h = m.readResult(draw).html || ''; } catch(e){ h = 'THROW:'+e.message; }
  t(`readResult ${id} 无空值异常`, h && !/undefined|NaN|\[object Object\]|THROW:/.test(h));
  t(`readResult ${id} 含逐位牌义`, h.includes('tr-detail') && (h.match(/class="tr-line"/g)||[]).length >= n);
}
console.log(pass.map(p=>'+ '+p).join('\n')); if (fail.length) { console.log(fail.map(f=>'- '+f).join('\n')); process.exit(1); }
console.log(`===== 塔罗冒烟: ${pass.length} 通过 / ${fail.length} 失败 =====`);
