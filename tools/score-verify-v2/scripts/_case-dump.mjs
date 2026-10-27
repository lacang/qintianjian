// 通用单盘探针：给定 月支 / mask / 域，输出排盘、取用、逐条信号与 orig/v12/v3/vall 分数。
// 用法：node _case-dump.mjs <月支> <mask> <域> [legacy|cur]   legacy=原版引擎(与全量矩阵一致)
import path from 'node:path'; import { fileURLToPath } from 'node:url';
const __dirname=path.dirname(fileURLToPath(import.meta.url)); const ROOT=path.resolve(__dirname,'../../..');
globalThis.document={addEventListener(){},querySelector:()=>null,getElementById:()=>null,head:{appendChild(){}},body:{appendChild(){},classList:{add(){},remove(){}}},createElement:()=>({style:{},classList:{add(){},remove(){}},appendChild(){},setAttribute(){}}),querySelectorAll:()=>[]};
globalThis.window=globalThis;globalThis.localStorage={getItem:()=>null,setItem(){},removeItem(){}};
const core=await import(path.join(ROOT,'app/vendor/liuyao-core.js'));
const { aggregate, LEVEL_CN } = await import('./ref-apply.mjs');
const SKIP_YONG_BODY=new Set(['health','decision','life','people']);

const [MZ, maskS, domainId, eng='legacy'] = process.argv.slice(2);
const judge = eng==='legacy'
  ? (await import('../legacy/verdict.orig.mjs')).judgeNajia
  : (await import(path.join(ROOT,'app/js/verdict.js'))).judgeNajia;
const mask=Number(maskS);
const vals=[];for(let i=0;i<6;i++)vals.push([6,7,8,9][(mask>>(i*2))&3]);
const pan=core.paipan({yaoValues:vals,gender:'男',question:'x',year:2026,month:10,day:26,hour:17,minute:35});
const oM=pan.siZhu.monthGanZhi,oD=pan.siZhu.dayGanZhi;
pan.siZhu.monthGanZhi=oM[0]+MZ; pan.siZhu.dayGanZhi=oD[0]+'酉';
const an=core.analyzeNajia(pan,{monthZhi:MZ,dayZhi:'酉',sex:'男'});
const v=judge(pan,domainId);
pan.siZhu.monthGanZhi=oM; pan.siZhu.dayGanZhi=oD;
const POS=['初','二','三','四','五','上'];
const ys=an.yongshen[{career:'事业',wealth:'财运',love:'感情',health:'健康',lost:'失物',decision:'决策',life:'生活',people:'人际'}[domainId]]||null;
let occ=null;
if(ys){ if(ys.useYing&&an.ying) occ=an.ying.occ; else { let pool=ys.occurrences.filter(o=>!o.hidden);
  if(pool.length>1){const rk=(o)=>(o.shi?8:0)+(o.moving?4:0)+(!o.state.xunKong&&!o.state.yuePo?2:0)+(o.state.yueHe||o.state.riHe?1:0);const mx=Math.max(...pool.map(rk));pool=pool.filter(o=>rk(o)===mx);} occ=pool[0]||null; } }
const bodyCounts=!!occ&&!SKIP_YONG_BODY.has(domainId);
const yongIsShi=!!(bodyCounts&&!ys?.useYing&&an.shi&&occ.pos===an.shi.occ.pos);
console.log('月',MZ,'mask',mask,'六爻',vals.join(' '),'|',pan.benGua.name,'之',pan.bianGua?.name);
console.log('世',POS[an.shi.occ.pos-1]+'爻',an.shi.occ.liuQin,an.shi.occ.naJia,'lingTai=',an.shi.occ.state.lingTai,'动=',!!an.shi.occ.moving,'回头克=',!!an.shi.occ.state.huaTouKe,'回头生=',!!an.shi.occ.state.huaTouSheng);
console.log('应',an.ying?POS[an.ying.occ.pos-1]+'爻 '+an.ying.occ.liuQin+' '+an.ying.occ.naJia:'无');
console.log('用神',occ?POS[occ.pos-1]+'爻 '+occ.liuQin+' '+occ.naJia+' 持世='+!!occ.shi+' 动='+!!occ.moving:'无','| yongIsShi=',yongIsShi);
console.log('--- 逐条信号（'+eng+'）---');
v.signals.forEach((s,i)=>console.log(String(i+1).padStart(2),`[${String(s.w).padStart(2)}]`,s.text));
const ctx={domain:domainId,yongHoldsShi:!!(occ&&occ.shi)};
console.log('--- 归组复算（yongHoldsShi='+ctx.yongHoldsShi+'）---');
for(const k of ['orig','v1','v2','v12','v3','vall']){
  const r=aggregate(v.signals,ctx,k);
  console.log(k.padEnd(5),'score',String(r.score).padStart(3),LEVEL_CN[r.level],'| 剔',r.cut.length?r.cut.join(','):'无','| 组',r.cutGroups.join('+')||'-');
}
