// v2b 全矩阵运行器（orig=legacy 原版引擎；分类器已修正「休」缺口）
// v2 全矩阵运行器：原算法 + 4 个单项修正 + 全部已确认项 + 折减敏感性（生产引擎只读引用）
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { classifySignal, groupActive, pickPrimary, GROUPS } from './classify-v2b.mjs';

globalThis.document = { addEventListener(){}, querySelector:()=>null, getElementById:()=>null, head:{appendChild(){}}, body:{appendChild(){},classList:{add(){},remove(){}}}, createElement:()=>({style:{},classList:{add(){},remove(){}},appendChild(){},setAttribute(){}}), querySelectorAll:()=>[] };
globalThis.window = globalThis;
globalThis.localStorage = { getItem:()=>null, setItem(){}, removeItem(){} };

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '../../..');
const core = await import(path.join(ROOT,'app/vendor/liuyao-core.js'));
const { judgeNajia } = await import(path.join(ROOT,'tools/score-verify-v2/legacy/verdict.orig.mjs'));

const DOMAINS = ['career','wealth','love','health','decision','life','people','lost'];
const MONTHS = ['寅','卯','辰','巳','午','未','申','酉','戌','亥','子','丑'];
const G = GROUPS;
const ALL_GROUPS = [G.G_SHI_WANG,G.G_CHONG,G.G_HE,G.G_HT_KE,G.G_HT_SHENG,G.G_HC_KE,G.G_HC_SHENG];
const DOM_CN = { career:'事业', wealth:'财运', love:'感情', health:'疾病', decision:'合作', life:'其他', people:'行人', lost:'失物' };
const LEVEL_OF = (s) => (s>=4?2: s>=1?1: s<=-4?-2: s<=-1?-1: 0);
const LN = { [-2]:'大凶', [-1]:'凶', 0:'平', 1:'吉', 2:'大吉' };

const VARIANTS = {
  orig: { label:'原算法(对照)', groups:[], k:0 },
  v1:   { label:'单项①用神持世旺衰归组', groups:[G.G_SHI_WANG], k:0 },
  v2:   { label:'单项②世应合冲与卦象归组', groups:[G.G_CHONG,G.G_HE], k:0 },
  v12:  { label:'提交A：①②（旺衰+合冲）', groups:[G.G_SHI_WANG,G.G_CHONG,G.G_HE], k:0 },
  v3:   { label:'单项③用神持世回头生克归组', groups:[G.G_HT_KE,G.G_HT_SHENG], k:0 },
  v4:   { label:'单项④health内部回头生克去重', groups:[G.G_HC_KE,G.G_HC_SHENG], k:0 },
  vall: { label:'全部已确认重复项归组', groups:ALL_GROUPS, k:0 },
  vfold:{ label:'折减k=0.5(仅敏感性·无古籍依据)', groups:ALL_GROUPS, k:0.5 },
};

function aggregate(signals, ctx, variant) {
  const cfg = VARIANTS[variant];
  const tagged = signals.map((s)=>({ ...s, _cls:classifySignal(s) }));
  if (variant === 'orig') return { score: tagged.reduce((a,s)=>a+s.w,0), cut:[], cutGroups:[] };
  const byGroup = new Map();
  for (const s of tagged) {
    for (const g of (s._cls.groups||[])) {
      if (!cfg.groups.includes(g)) continue;
      if (!byGroup.has(g)) byGroup.set(g, []);
      byGroup.get(g).push(s);
    }
  }
  const cut = new Set(); const cutGroups = [];
  for (const [g, members] of byGroup) {
    if (!groupActive(g, members, ctx)) continue;
    const primary = pickPrimary(g, members);
    let didCut = false;
    for (const m of members) if (m !== primary) { cut.add(m); didCut = true; }
    if (didCut) cutGroups.push(g);
  }
  let score = 0;
  for (const s of tagged) score += cut.has(s) ? (cfg.k===0.5 ? s.w*0.5 : 0) : s.w;
  return { score, cut:[...cut].map(s=>s._cls.sid), cutGroups:[...new Set(cutGroups)] };
}

function runOne(pan, monthZhi, domain) {
  const origMGZ=pan.siZhu.monthGanZhi, origDGZ=pan.siZhu.dayGanZhi;
  pan.siZhu.monthGanZhi=origMGZ[0]+monthZhi; pan.siZhu.dayGanZhi=origDGZ[0]+'酉';
  let v, an;
  try {
    an = core.analyzeNajia(pan,{monthZhi,dayZhi:'酉',sex:pan.gender==='女'?'女':'男'});
    v = judgeNajia(pan, domain);
  } finally { pan.siZhu.monthGanZhi=origMGZ; pan.siZhu.dayGanZhi=origDGZ; }
  let yongHoldsShi=false, selYong=null;
  const ys=an.yongshen[DOM_CN[domain]];
  if (ys && ys.useYing && an.ying) { selYong={via:'ying'}; }
  else if (ys && ys.occurrences) {
    let pool=ys.occurrences.filter(o=>!o.hidden);
    if (pool.length>1) {
      const rank=(o)=>(o.shi?8:0)+(o.moving?4:0)+(!o.state.xunKong&&!o.state.yuePo?2:0)+(o.state.yueHe||o.state.riHe?1:0);
      const mx=Math.max(...pool.map(rank)); pool=pool.filter(o=>rank(o)===mx);
    }
    yongHoldsShi=!!(pool[0]&&pool[0].shi);
    selYong=pool[0]?{liuQin:pool[0].liuQin,naJia:pool[0].naJia,pos:pool[0].pos,shi:!!pool[0].shi,moving:!!pool[0].moving}:null;
  }
  const ctx={domain,yongHoldsShi};
  const out={};
  for (const vk of Object.keys(VARIANTS)) {
    const r=aggregate(v.signals,ctx,vk);
    out[vk]={score:r.score,level:LEVEL_OF(r.score),cut:r.cut,cutGroups:r.cutGroups};
  }
  const txt=v.signals.map(s=>s.text);
  const flags={
    yongNotShi: !yongHoldsShi && !!selYong && selYong.via!=='ying',
    // 用神与世爻都有回头克/生、但用神不持世（不同爻）→ 必须独立，绝不可并
    htDifferentYao: (()=>{
      const yk=txt.some(t=>t.includes('却被变爻回头克')||t.startsWith('用神动化回头克'));
      const sk=txt.some(t=>/^世爻动化回头克——/.test(t));
      const ys2=txt.some(t=>t.includes('反过来生它（回头生）'));
      const ss=txt.some(t=>t.startsWith('世爻动化回头生，行动有人帮'));
      return !yongHoldsShi && ((yk&&sk)||(ys2&&ss));
    })(),
    // 用神侧回头克与 health 世爻克共现（可能同爻也可能不同，单列给专业判断）
    healthHt: domain==='health' && txt.some(t=>t.startsWith('世爻动化回头克、或化官鬼')),
    // 六合卦但世应非合非冲（三例外：火地晋/山雷颐/地泽临）
    liuheExcept: domain==='love' && txt.some(t=>t.startsWith('本卦是六合卦'))
      && !txt.some(t=>t.startsWith('世应相合')||t.startsWith('世应相冲')),
    // 合冲互变（313/314）信号存在：任何变体都不得切它
    chongheBian: txt.some(t=>t.includes('六冲变六合')||t.includes('六合变六冲')),
  };
  return {ctx,selYong,signals:v.signals,out,flags};
}

const t0=Date.now();
const outDir=path.join(ROOT,'tools/score-verify-v2/output');
fs.mkdirSync(outDir,{recursive:true});
const VK=Object.keys(VARIANTS);
const stats={total:0,legalPans:0,illegal:[],byVariant:{},byDomain:{},cutFreq:{},flags:{}};
for (const vk of VK) stats.byVariant[vk]={scoreMoved:0,levelChanged:0,reverse:0,matrix:{}};
const FLAGDEFS=[
  ['yongNotShi','用神不持世(旺衰/回头组都不应动)'],
  ['htDifferentYao','回头生克用神与世在不同爻(必须独立)'],
  ['healthHt','health世爻化官鬼回头克(专项处理,不入用神组)'],
  ['liuheExcept','六合卦世应非合非冲(3例外,不并)'],
  ['chongheBian','存在六冲变六合/六合变六冲信号(任何变体不得切)'],
];
for (const [fk] of FLAGDEFS) stats.flags[fk]={n:0,wronglyMerged:0,examples:[]};
const csv=fs.createWriteStream(path.join(outDir,'v2b-full-matrix.csv'));
csv.write('month,mask,bengua,biangua,domain,yongShi,'+VK.map(v=>`${v}Score,${v}Level`).join(',')+',vallCut\n');
const reverseCases=[];

for (const mz of MONTHS){
  let ml=0;
  for (let mask=0;mask<4096;mask++){
    const vals=[];for(let i=0;i<6;i++)vals.push([6,7,8,9][(mask>>(i*2))&3]);
    let pan;
    try{pan=core.paipan({yaoValues:vals,gender:'男',question:'x',year:2026,month:10,day:26,hour:17,minute:35});}
    catch(e){stats.illegal.push({month:mz,mask,err:e.message});continue;}
    if(!pan?.benGua?.name){stats.illegal.push({month:mz,mask,reason:'no benGua'});continue;}
    ml++;
    const ben=pan.benGua.name,bian=pan.bianGua?.name||'';
    for (const domain of DOMAINS){
      const r=runOne(pan,mz,domain);
      stats.total++;
      (stats.byDomain[domain]??={n:0}).n++;
      for (const c of r.out.vall.cut) stats.cutFreq[c]=(stats.cutFreq[c]||0)+1;
      for (const [fk] of FLAGDEFS){
        if(!r.flags[fk])continue;
        stats.flags[fk].n++;
        let bad=false;
        const cg=r.out.vall.cutGroups;
        if(fk==='yongNotShi') bad=cg.includes(G.G_SHI_WANG)||cg.includes(G.G_HT_KE)||cg.includes(G.G_HT_SHENG);
        if(fk==='htDifferentYao') bad=cg.includes(G.G_HT_KE)||cg.includes(G.G_HT_SHENG);
        if(fk==='healthHt') bad=cg.includes(G.G_HT_KE)||cg.includes(G.G_HT_SHENG); // health 用神持世组不该自动动
        if(fk==='liuheExcept') bad=cg.includes(G.G_HE)||cg.includes(G.G_CHONG);
        if(fk==='chongheBian') bad=r.out.vall.cut.includes('chonghebian'); // 变卦冲合信号绝不被切
        if(bad){stats.flags[fk].wronglyMerged++;if(stats.flags[fk].examples.length<10)stats.flags[fk].examples.push({month:mz,mask,ben,bian,domain,cut:cg});}
      }
      for (const vk of VK){
        const o=r.out[vk];
        if(o.score!==r.out.orig.score)stats.byVariant[vk].scoreMoved++;
        if(o.level!==r.out.orig.level){
          stats.byVariant[vk].levelChanged++;
          const kf=`${r.out.orig.level}>${o.level}`;stats.byVariant[vk].matrix[kf]=(stats.byVariant[vk].matrix[kf]||0)+1;
          if((r.out.orig.level>0&&o.level<0)||(r.out.orig.level<0&&o.level>0)){
            stats.byVariant[vk].reverse++;
            if(reverseCases.length<40)reverseCases.push({variant:vk,month:mz,mask,ben,bian,domain,yongShi:r.ctx.yongHoldsShi?1:0,orig:r.out.orig.score,neu:o.score,from:LN[r.out.orig.level],to:LN[o.level],cut:o.cutGroups,sig:r.signals.map(s=>`[${s.w}]${s.text.slice(0,30)}`)});
          }
        }
      }
      csv.write(`${mz},${mask},${ben},${bian},${domain},${r.ctx.yongHoldsShi?1:0},`+VK.map(v=>`${r.out[v].score},${r.out[v].level}`).join(',')+`,${r.out.vall.cut.join('|')}\n`);
    }
  }
  stats.legalPans+=ml;
  console.log(`月令${mz} 合法${ml}/4096 累计${stats.total} ${((Date.now()-t0)/1000).toFixed(1)}s`);
}
csv.end();
for (const vk of VK){const m={};for(const k in stats.byVariant[vk].matrix){const[a,b]=k.split('>');m[`${LN[a]}→${LN[b]}`]=stats.byVariant[vk].matrix[k];}stats.byVariant[vk].matrixCN=m;}
fs.writeFileSync(path.join(outDir,'v2b-summary.json'),JSON.stringify(stats,null,2));
fs.writeFileSync(path.join(outDir,'v2b-reverse-cases.json'),JSON.stringify(reverseCases,null,2));
console.log('\n===== v2 汇总 =====');
console.log('总记录',stats.total,'非法',stats.illegal.length);
for (const vk of VK){const s=stats.byVariant[vk];console.log(`${vk.padEnd(6)} 分数变${String(s.scoreMoved).padStart(6)} 档位变${String(s.levelChanged).padStart(5)} 吉凶反转${String(s.reverse).padStart(4)}  ${VARIANTS[vk].label}`);}
console.log('\n特殊场景（命中 / 被错误归并，应为0）:');
for (const [fk,desc] of FLAGDEFS) console.log(`  ${fk.padEnd(15)} 命中${String(stats.flags[fk].n).padStart(6)}  错误归并${String(stats.flags[fk].wronglyMerged).padStart(4)}  ${desc}`);
console.log('\nvall 被并 sid 频次:',JSON.stringify(stats.cutFreq));
console.log('用时',((Date.now()-t0)/1000).toFixed(1),'s');
