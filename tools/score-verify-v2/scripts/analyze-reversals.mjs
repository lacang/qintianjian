// 反转案例逐条复算：对 reversals-*.json 的每条，用原版引擎重跑该盘该域，
// 校验 (a) 原分数/档位与清单一致；(b) 去重后分数/档位与清单一致；(c) 被剔除信号的规则与权重；
// (d) 分数差 = 被剔除权重之和。输出统计与明细 CSV，供人工逐条审计。
import path from 'node:path'; import fs from 'node:fs'; import { fileURLToPath } from 'node:url';
const __dirname=path.dirname(fileURLToPath(import.meta.url)); const ROOT=path.resolve(__dirname,'../../..');
globalThis.document={addEventListener(){},querySelector:()=>null,getElementById:()=>null,head:{appendChild(){}},body:{appendChild(){},classList:{add(){},remove(){}}},createElement:()=>({style:{},classList:{add(){},remove(){}},appendChild(){},setAttribute(){}}),querySelectorAll:()=>[]};
globalThis.window=globalThis;globalThis.localStorage={getItem:()=>null,setItem(){},removeItem(){}};
const core=await import(path.join(ROOT,'app/vendor/liuyao-core.js'));
const {judgeNajia}=await import('../legacy/verdict.orig.mjs');
const { aggregate, LEVEL_CN } = await import('./ref-apply.mjs');
const SKIP=new Set(['health','decision','life','people']);
const DOMCN={career:'事业',wealth:'财运',love:'感情',health:'健康',lost:'失物',decision:'决策',life:'生活',people:'人际'};
const POS=['初','二','三','四','五','上'];
const [file, variant] = process.argv.slice(2);
const cases=JSON.parse(fs.readFileSync(path.resolve(__dirname,'../output',file),'utf8'));

const cache=new Map();
function run(monthZhi, mask, domainId){
  const key=monthZhi+'|'+mask;
  if(!cache.has(key)){
    const vals=[];for(let i=0;i<6;i++)vals.push([6,7,8,9][(mask>>(i*2))&3]);
    const pan=core.paipan({yaoValues:vals,gender:'男',question:'x',year:2026,month:10,day:26,hour:17,minute:35});
    const oM=pan.siZhu.monthGanZhi,oD=pan.siZhu.dayGanZhi;
    pan.siZhu.monthGanZhi=oM[0]+monthZhi; pan.siZhu.dayGanZhi=oD[0]+'酉';
    const an=core.analyzeNajia(pan,{monthZhi,dayZhi:'酉',sex:'男'});
    cache.set(key,{pan,an});
  }
  return cache.get(key);
}
function occOf(an,domainId){
  const ys=an.yongshen[DOMCN[domainId]]; if(!ys) return {ys:null,occ:null};
  if(ys.useYing&&an.ying) return {ys,occ:an.ying.occ};
  let pool=ys.occurrences.filter(o=>!o.hidden);
  if(pool.length>1){const rk=(o)=>(o.shi?8:0)+(o.moving?4:0)+(!o.state.xunKong&&!o.state.yuePo?2:0)+(o.state.yueHe||o.state.riHe?1:0);const mx=Math.max(...pool.map(rk));pool=pool.filter(o=>rk(o)===mx);}
  return {ys,occ:pool[0]||null};
}

const rows=[]; let bad=0;
for(const c of cases){
  const {pan,an}=run(c.month,c.mask,c.domain);
  const {ys,occ}=occOf(an,c.domain);
  const v=judgeNajia(pan,c.domain);
  const ctx={domain:c.domain,yongHoldsShi:!!(occ&&occ.shi)};
  const base=aggregate(v.signals,ctx,'orig');
  const r=aggregate(v.signals,ctx,variant);
  const cutSignals=r.cutIdx.map(i=>v.signals[i]);
  const cutW=cutSignals.reduce((a,s)=>a+s.w,0);
  const okBase = base.score===c.origScore && base.level===c.origLevel;
  const okNew  = r.score===c.newScore && r.level===c.newLevel;
  const okDelta= (r.score-base.score)===-cutW;
  if(!(okBase&&okNew&&okDelta)) bad++;
  const t=v.signals.map(s=>s.text).join('\n');
  rows.push({
    month:c.month, mask:c.mask, bengua:pan.benGua.name, biangua:pan.bianGua?.name||'',
    domain:c.domain, yong:occ?`${POS[occ.pos-1]}爻${occ.liuQin}${occ.naJia}`:'-',
    yongHoldsShi: ctx.yongHoldsShi?1:0,
    origScore:base.score, origLevel:LEVEL_CN[base.level],
    newScore:r.score, newLevel:LEVEL_CN[r.level],
    cutGroups:r.cutGroups.join('+'),
    cutSignals:cutSignals.map(s=>`${s.w}:${s.text.slice(0,26)}`).join(' ⏐ '),
    yongWang:/得月令之气/.test(t)?1:0,
    yongShuai:/用神.{0,20}[休囚死]于月/.test(t)?1:0,
    yongHuiKe:/却被变爻回头克/.test(t)?1:0,
    shiWang:/世爻[旺]于月/.test(t)?1:0,
    ok:(okBase&&okNew&&okDelta)?'OK':'FAIL'
  });
}
const bad2=rows.filter(r=>r.ok!=='OK');
console.log(`复算 ${rows.length} 例，逐条一致 ${rows.length-bad2.length}，不一致 ${bad2.length}`);
const g={},d={},m={},tr={};
for(const r of rows){g[r.cutGroups]=(g[r.cutGroups]||0)+1;d[r.domain]=(d[r.domain]||0)+1;m[r.month]=(m[r.month]||0)+1;tr[r.origScore+'→'+r.newScore]=(tr[r.origScore+'→'+r.newScore]||0)+1;}
console.log('分数迁移',tr); console.log('域',d); console.log('月',m); console.log('归组',g);
const out=path.resolve(__dirname,'../output',`analyzed-${variant}-${cases.length}.csv`);
const hdr=Object.keys(rows[0]);
fs.writeFileSync(out,hdr.join(',')+'\n'+rows.map(r=>hdr.map(h=>String(r[h]).replace(/,/g,'、')).join(',')).join('\n'));
console.log('明细 ->',out);
if(bad2.length){console.log('不一致样例',bad2.slice(0,3));process.exitCode=1;}
