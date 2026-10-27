// 单盘审核：寅月 mask322 career 泽地萃之天风姤。只读生产，输出排盘事实/取用/逐条信号/三套分数。
import path from 'node:path'; import { fileURLToPath } from 'node:url';
const __dirname=path.dirname(fileURLToPath(import.meta.url)); const ROOT=path.resolve(__dirname,'../../..');
globalThis.document={addEventListener(){},querySelector:()=>null,getElementById:()=>null,head:{appendChild(){}},body:{appendChild(){},classList:{add(){},remove(){}}},createElement:()=>({style:{},classList:{add(){},remove(){}},appendChild(){},setAttribute(){}}),querySelectorAll:()=>[]};
globalThis.window=globalThis;globalThis.localStorage={getItem:()=>null,setItem(){},removeItem(){}};
const core=await import(path.join(ROOT,'app/vendor/liuyao-core.js'));
const {judgeNajia}=await import(path.join(ROOT,'app/js/verdict.js'));
const { classifySignal, groupActive, pickPrimary, GROUPS } = await import('./classify-v2.mjs');

// 1) 复现 mask322 六爻值
const mask=322; const vals=[];for(let i=0;i<6;i++)vals.push([6,7,8,9][(mask>>(i*2))&3]);
console.log('mask322 六爻值(初→上):',vals.join(' '),'(6老阴× 7少阳 8少阴× 9老阳○)');
const pan=core.paipan({yaoValues:vals,gender:'男',question:'x',year:2026,month:10,day:26,hour:17,minute:35});
console.log('主卦:',pan.benGua.name,' 变卦:',pan.bianGua?.name,' 世爻位置:',pan.benGua.shiYao,' 应爻位置:',pan.benGua.yingYao);

// 2) 寅月、固定日辰酉
const MZ='寅';
const origMGZ=pan.siZhu.monthGanZhi, origDGZ=pan.siZhu.dayGanZhi;
pan.siZhu.monthGanZhi=origMGZ[0]+MZ; pan.siZhu.dayGanZhi=origDGZ[0]+'酉';
const an=core.analyzeNajia(pan,{monthZhi:MZ,dayZhi:'酉',sex:'男'});
const v=judgeNajia(pan,'career');
pan.siZhu.monthGanZhi=origMGZ; pan.siZhu.dayGanZhi=origDGZ;

console.log('\n=== 六爻排盘事实（初→上）===');
const POS=['初','二','三','四','五','上'];
(an.lines||an.yaos||[]).forEach?.((x,i)=>console.log(i,x));
// 直接从 yongshen 与 shi/ying 取
const ys=an.yongshen['事业'];
console.log('\n=== 事业 用神取用 ===');
console.log('useYing:',ys.useYing,' absent:',ys.absent,' note:',ys.note);
console.log('原神:',ys.yuanShen,' 忌神:',ys.jiShen,' 仇神:',ys.chouShen);
console.log('occurrences:');
for(const o of ys.occurrences){
  const rank=(o.shi?8:0)+(o.moving?4:0)+(!o.state.xunKong&&!o.state.yuePo?2:0)+(o.state.yueHe||o.state.riHe?1:0);
  console.log(`  ${POS[o.pos-1]}爻 ${o.liuQin} ${o.naJia||(o.yao?.gan+o.yao?.zhi)} 持世=${!!o.shi} 应=${!!o.ying} 动=${!!o.moving} 伏=${!!o.hidden} rank=${rank} lingTai=${o.state.lingTai} 五行=${o.state.wuXing} 旬空=${!!o.state.xunKong} 月破=${!!o.state.yuePo} 回头克=${!!o.state.huaTouKe} 回头生=${!!o.state.huaTouSheng} 反吟=${!!o.state.fanYin} 长生=${!!o.state.changSheng}`);
}
// 复刻 rank 选用神
let pool=ys.occurrences.filter(o=>!o.hidden);
if(pool.length>1){const rank=(o)=>(o.shi?8:0)+(o.moving?4:0)+(!o.state.xunKong&&!o.state.yuePo?2:0)+(o.state.yueHe||o.state.riHe?1:0);const mx=Math.max(...pool.map(rank));pool=pool.filter(o=>rank(o)===mx);}
const sel=pool[0];
console.log('>> 选中用神:',POS[sel.pos-1]+'爻',sel.liuQin,sel.naJia||(sel.yao?.gan+sel.yao?.zhi),' 持世=',!!sel.shi,' 动=',!!sel.moving);
console.log('\n=== 世爻事实 ===');
console.log('世',POS[an.shi.occ.pos-1]+'爻',an.shi.occ.liuQin,an.shi.occ.naJia||(an.shi.occ.yao?.gan+an.shi.occ.yao?.zhi),'动=',an.shi.occ.moving,'lingTai=',an.shi.occ.state.lingTai,'回头克=',!!an.shi.occ.state.huaTouKe,'回头生=',!!an.shi.occ.state.huaTouSheng,'反吟=',!!an.shi.occ.state.fanYin);
console.log('应',an.ying? POS[an.ying.occ.pos-1]+'爻 '+an.ying.occ.liuQin+' '+(an.ying.occ.naJia||(an.ying.occ.yao?.gan+an.ying.occ.yao?.zhi)):'无');

// 3) 逐条信号
console.log('\n=== judgeNajia 逐条信号（按引擎顺序）===');
v.signals.forEach((s,i)=>console.log(String(i+1).padStart(2),`[${String(s.w).padStart(2)}]`,s.rule||'-',s.text));
const orig=v.signals.reduce((a,s)=>a+s.w,0);
console.log('\n原始总分 orig =',orig,' 档位',JSON.stringify({score:v.score,level:v.level,headline:v.headline}));

// 4) 三套归组复算
function agg(variantGroups){
  const ctx={domain:'career',yongHoldsShi:!!sel.shi};
  const tagged=v.signals.map(s=>({...s,_cls:classifySignal(s)}));
  const byGroup=new Map();
  for(const s of tagged)for(const g of (s._cls.groups||[])){if(!variantGroups.includes(g))continue;if(!byGroup.has(g))byGroup.set(g,[]);byGroup.get(g).push(s);}
  const cut=new Set();const why=[];
  for(const [g,members]of byGroup){if(!groupActive(g,members,ctx))continue;const primary=pickPrimary(g,members);for(const m of members)if(m!==primary){cut.add(m);why.push(`${g}: 剔「${m.text.slice(0,18)}…」(${m.w})`);}}
  let score=0;for(const s of tagged)score+=cut.has(s)?0:s.w;
  return {score,cut:[...cut].map(s=>s.rule||s._cls.sid),why};
}
const LV=s=>s>=4?'大吉(2)':s>=1?'吉(1)':s<=-4?'大凶(-2)':s<=-1?'凶(-1)':'平(0)';
const g3=[GROUPS.G_HT_KE,GROUPS.G_HT_SHENG];
const gall=[GROUPS.G_SHI_WANG,GROUPS.G_CHONG,GROUPS.G_HE,GROUPS.G_HT_KE,GROUPS.G_HT_SHENG,GROUPS.G_HC_KE,GROUPS.G_HC_SHENG];
const r3=agg(g3),rall=agg(gall);
console.log('\n=== 三套分数 ===');
console.log('orig =',orig,LV(orig));
console.log('v3   =',r3.score,LV(r3.score),' 被并:',JSON.stringify(r3.cut));r3.why.forEach(x=>console.log('   ',x));
console.log('vall =',rall.score,LV(rall.score),' 被并:',JSON.stringify(rall.cut));rall.why.forEach(x=>console.log('   ',x));
console.log('\n阈值核对: orig',orig,'→ v3',r3.score,'；跨 -1→0? ',orig<=-1&&r3.score===0,'；0→1(吉)? ',r3.score>=1);
