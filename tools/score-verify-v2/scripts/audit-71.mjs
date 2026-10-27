// 71 例吉→凶 专项复核（只读，不改任何生产代码）
// 方法：不依赖既有 CSV 统计——直接用"基线引擎(0ed9e89)"与"提交A引擎(b634b8f)"两套真实代码，
//      对 393,216 条场景各自实算，按档位差独立重新筛出反转案例，再与既有清单交叉比对。
//      逐例做"信号多重集差分"：修复后信号 = 原始信号 − 被抑制信号（逐条文本+顺序完全一致），
//      从而证明被抑制的到底是哪几条、有没有别的信号被顺手改掉。
import path from 'node:path'; import fs from 'node:fs'; import crypto from 'node:crypto'; import { fileURLToPath } from 'node:url';
const __dirname=path.dirname(fileURLToPath(import.meta.url)); const ROOT=path.resolve(__dirname,'../../..'); const OUT=path.resolve(__dirname,'../output');
globalThis.document={addEventListener(){},querySelector:()=>null,getElementById:()=>null,head:{appendChild(){}},body:{appendChild(){},classList:{add(){},remove(){}}},createElement:()=>({style:{},classList:{add(){},remove(){}},appendChild(){},setAttribute(){}}),querySelectorAll:()=>[]};
globalThis.window=globalThis;globalThis.localStorage={getItem:()=>null,setItem(){},removeItem(){}};

const LOG=[];
const log=(s)=>{LOG.push(s);console.log(s);};
log('# 71 例吉→凶 专项复核日志');
log('时间：'+new Date().toISOString());
log('node '+process.version);
log('基线引擎：tools/score-verify-v2/legacy/verdict.orig.mjs（= git show 0ed9e89:app/js/verdict.js）');
log('提交A引擎：tools/score-verify-v2/legacy/verdict.stageA.mjs（= git show b634b8f:app/js/verdict.js）');

const core=await import(path.join(ROOT,'app/vendor/liuyao-core.js'));
const { aggregate, LEVEL_CN:LC } = await import('./ref-apply.mjs');
const base=(await import('../legacy/verdict.orig.mjs')).judgeNajia;
const stageA=(await import('../legacy/verdict.stageA.mjs')).judgeNajia;
const sha=(p)=>crypto.createHash('sha256').update(fs.readFileSync(p)).digest('hex');
log('基线引擎 sha256：'+sha(path.resolve(__dirname,'../legacy/verdict.orig.mjs')));
log('提交A引擎 sha256：'+sha(path.resolve(__dirname,'../legacy/verdict.stageA.mjs')));
log('当前生产引擎 sha256：'+sha(path.join(ROOT,'app/js/verdict.js')));

const SKIP=new Set(['health','decision','life','people']);
const DOMS=['career','wealth','love','health','lost','decision','life','people'];
const DOMCN={career:'事业',wealth:'财运',love:'感情',health:'健康',lost:'失物',decision:'决策',life:'生活',people:'人际'};
const MONTHS=['子','丑','寅','卯','辰','巳','午','未','申','酉','戌','亥'];
const POS=['初','二','三','四','五','上'];
const LEVEL_CN={'-2':'大凶','-1':'凶','0':'平','1':'吉','2':'大吉'};

function occOf(an,domainId){
  const ys=an.yongshen[DOMCN[domainId]]; if(!ys) return {ys:null,occ:null};
  if(ys.useYing&&an.ying) return {ys,occ:an.ying.occ};
  let pool=ys.occurrences.filter(o=>!o.hidden);
  if(pool.length>1){const rk=(o)=>(o.shi?8:0)+(o.moving?4:0)+(!o.state.xunKong&&!o.state.yuePo?2:0)+(o.state.yueHe||o.state.riHe?1:0);const mx=Math.max(...pool.map(rk));pool=pool.filter(o=>rk(o)===mx);}
  return {ys,occ:pool[0]||null};
}

// ---------- 全量独立重扫 ----------
const t0=Date.now();
const found=[]; let scanned=0;
for(const mz of MONTHS){
  for(let mask=0;mask<4096;mask++){
    const vals=[];for(let i=0;i<6;i++)vals.push([6,7,8,9][(mask>>(i*2))&3]);
    const pan=core.paipan({yaoValues:vals,gender:'男',question:'x',year:2026,month:10,day:26,hour:17,minute:35});
    const oM=pan.siZhu.monthGanZhi,oD=pan.siZhu.dayGanZhi;
    pan.siZhu.monthGanZhi=oM[0]+mz; pan.siZhu.dayGanZhi=oD[0]+'酉';
    const an=core.analyzeNajia(pan,{monthZhi:mz,dayZhi:'酉',sex:'男'});
    for(const dom of DOMS){
      const a=base(pan,dom), b=stageA(pan,dom);
      scanned++;
      const rev = (a.level<=-1&&b.level>=1)?'凶→吉' : (a.level>=1&&b.level<=-1)?'吉→凶' : null;
      if(rev) found.push({month:mz,mask,dom,bengua:pan.benGua.name,biangua:pan.bianGua?.name||'',
        origScore:a.score,origLevel:a.level,newScore:b.score,newLevel:b.level,dir:rev,
        sigA:a.signals,sigB:b.signals,an});
    }
    pan.siZhu.monthGanZhi=oM; pan.siZhu.dayGanZhi=oD;
  }
}
log(`\n## 一、全量独立重扫\n扫描判读 ${scanned} 条，耗时 ${((Date.now()-t0)/1000).toFixed(1)}s`);
const byDir={}; found.forEach(f=>byDir[f.dir]=(byDir[f.dir]||0)+1);
log('重扫反转分布：'+JSON.stringify(byDir));
const seventyOne=found.filter(f=>f.dir==='吉→凶');
log(`吉→凶 ${seventyOne.length} 例`);

// 与既有清单交叉比对
const old=JSON.parse(fs.readFileSync(path.join(OUT,'reversals-v12-full.json'),'utf8'));
const key=(m,mask,d)=>`${m}|${mask}|${d}`;
const oldSet=new Set(old.map(o=>key(o.month,o.mask,o.domain)));
const newSet=new Set(seventyOne.map(f=>key(f.month,f.mask,f.dom)));
const onlyOld=[...oldSet].filter(k=>!newSet.has(k)), onlyNew=[...newSet].filter(k=>!oldSet.has(k));
log(`既有清单 reversals-v12-full.json：${old.length} 例；仅旧有 ${onlyOld.length}；仅重扫有 ${onlyNew.length}`);
if(onlyOld.length) log('  仅旧有样例：'+onlyOld.slice(0,5).join(' , '));
if(onlyNew.length) log('  仅重扫有样例：'+onlyNew.slice(0,5).join(' , '));

// ---------- 逐例审计 ----------
const IS_SHI_WANG=/^世爻[旺相休囚死]于月/;
const IS_GUA=/^本卦是(六冲卦|六合卦)/;
const rows=[]; const issues=[]; let pass=0,fail=0,insufficient=0;
const rules={};
for(const f of seventyOne){
  const {an,dom}=f;
  const {ys,occ}=occOf(an,dom);
  const yongIsShi=!!(occ&&!SKIP.has(dom)&&!ys?.useYing&&an.shi&&occ.pos===an.shi.occ.pos);
  // 信号多重集差分：按顺序把 B 的每条在 A 里消耗掉
  const pool=f.sigA.map((s,i)=>({s,i,used:false}));
  const removed=[]; let sameOrder=true; let lastIdx=-1;
  for(const sb of f.sigB){
    const hit=pool.find(p=>!p.used&&p.s.text===sb.text&&p.s.w===sb.w);
    if(!hit){ issues.push({case_id:key(f.month,f.mask,dom),type:'修复后出现原始没有的信号',detail:sb.text}); continue; }
    hit.used=true;
  }
  pool.filter(p=>!p.used).forEach(p=>removed.push(p.s));
  // 顺序一致性：B 必须是 A 去掉 removed 后的子序列
  const kept=f.sigA.filter(s=>!removed.includes(s));
  if(kept.length!==f.sigB.length||kept.some((s,i)=>s.text!==f.sigB[i].text)) sameOrder=false;

  const cutShi=removed.filter(s=>IS_SHI_WANG.test(s.text));
  const cutGua=removed.filter(s=>IS_GUA.test(s.text));
  const cutOther=removed.filter(s=>!IS_SHI_WANG.test(s.text)&&!IS_GUA.test(s.text));

  // 公式核验
  const formula=f.origScore-cutShi.reduce((a,s)=>a+s.w,0)-cutGua.reduce((a,s)=>a+s.w,0)-cutOther.reduce((a,s)=>a+s.w,0);
  const formulaOk=formula===f.newScore;

  // 条件核验 A（①）
  const cA={
    domainOk: !SKIP.has(dom),
    yongIsShi,
    notUseYing: !ys?.useYing,
    onlyShiSide: cutShi.every(s=>IS_SHI_WANG.test(s.text)),
    yongSideKept: f.sigB.some(s=>/得月令之气|用神.{0,30}[休囚死]于月|旺于月|相于月/.test(s.text)&&!IS_SHI_WANG.test(s.text))
  };
  // 条件核验 B（②）
  const shiZhi=an.shi?.occ?.yao?.zhi, yingZhi=an.ying?.occ?.yao?.zhi;
  const hasShiYingHe=f.sigA.some(s=>/^世应相合/.test(s.text));
  const hasShiYingChong=f.sigA.some(s=>/^世应相冲/.test(s.text));
  const LIUHE_EXC=['火地晋','山雷颐','地泽临'];
  const cB={
    loveOnly: dom==='love',
    hitChong: cutGua.some(s=>/六冲卦/.test(s.text)),
    hitHe: cutGua.some(s=>/六合卦/.test(s.text)),
    onlyGuaSide: cutGua.every(s=>IS_GUA.test(s.text)),
    coOccur: cutGua.every(s=>/六合卦/.test(s.text)?hasShiYingHe:/六冲卦/.test(s.text)?hasShiYingChong:false),
    notException: !(LIUHE_EXC.includes(f.bengua)&&cutGua.some(s=>/六合卦/.test(s.text))),
    bianKept: !f.sigA.some(s=>/六冲变六合|六合变六冲/.test(s.text)) || f.sigB.some(s=>/六冲变六合|六合变六冲/.test(s.text))
  };
  // ① 保留侧必须仍在：被剔 +1「世爻旺于月」时，用神侧 +2「得月令之气」必须存在；被剔 -1「世爻休囚死」时，用神侧 -1 必须存在
  const yongSideStill=f.sigB.some(s=>/得月令之气/.test(s.text))||f.sigB.some(s=>/^用神.{0,40}[休囚死]于月/.test(s.text));
  const cA2={ yongSideStill };
  const okA = cutShi.length===0 || (cA.domainOk&&cA.yongIsShi&&cA.notUseYing&&cA.onlyShiSide);
  const okB = cutGua.length===0 || (cB.loveOnly&&cB.onlyGuaSide&&cB.bianKept&&cB.coOccur&&cB.notException&&(cB.hitChong||cB.hitHe));
  const okAll = sameOrder&&formulaOk&&cutOther.length===0&&okA&&okB&&cA2.yongSideStill;
  let verdict = okAll ? '通过' : '不通过';
  if(!sameOrder&&formulaOk) verdict='证据不足';
  if(verdict==='通过')pass++; else if(verdict==='不通过')fail++; else insufficient++;
  if(!okAll) issues.push({case_id:key(f.month,f.mask,dom),type:okAll?'':'审计不通过',
    detail:JSON.stringify({sameOrder,formulaOk,cutOther:cutOther.map(s=>s.text),okA,okB})});
  // 规则编号统计
  for(const s of removed) rules[s.rule?.id||s.src||'?']=(rules[s.rule?.id||s.src||'?']||0)+1;

  rows.push({
    case_id:key(f.month,f.mask,dom), month:f.month, mask:f.mask, domain:dom,
    bengua:f.bengua, biangua:f.biangua,
    yong:occ?`${POS[occ.pos-1]}爻${occ.liuQin}${occ.naJia}`:'-', yongIsShi:yongIsShi?1:0,
    allSignalsOrig:f.sigA.map(s=>`${s.w}|${s.text}`).join(' ⏐ '),
    cut1Shi:cutShi.map(s=>`${s.w}|${s.text}`).join(' ⏐ '),
    cut2Gua:cutGua.map(s=>`${s.w}|${s.text}`).join(' ⏐ '),
    cutOther:cutOther.map(s=>`${s.w}|${s.text}`).join(' ⏐ '),
    origScore:f.origScore, origLevel:LEVEL_CN[String(f.origLevel)],
    newScore:f.newScore, newLevel:LEVEL_CN[String(f.newLevel)],
    formulaScore:formula, progScore:f.newScore,
    cond1:cA.domainOk&&cA.yongIsShi&&cA.notUseYing&&cA.onlyShiSide&&cA2.yongSideStill?'OK':'-',
    cond2:cB.loveOnly&&cB.onlyGuaSide&&cB.coOccur&&cB.notException&&cB.bianKept?'OK':'-',
    sameOrder:sameOrder?1:0, verdict,
    scoreAfter3:aggregate(f.sigA,{domain:dom,yongHoldsShi:!!(occ&&occ.shi)},'vall').score,
    levelAfter3:LC[aggregate(f.sigA,{domain:dom,yongHoldsShi:!!(occ&&occ.shi)},'vall').level],
    note:''
  });
}
log(`\n## 二、逐例审计\n通过 ${pass}｜不通过 ${fail}｜证据不足 ${insufficient}`);
log('被抑制信号来源分布：'+JSON.stringify(rules));
log('额外被抑制（非①②）信号条数：'+rows.reduce((a,r)=>a+(r.cutOther?r.cutOther.split(' ⏐ ').length:0),0));
log('公式不一致：'+rows.filter(r=>r.formulaScore!==r.progScore).length);
log('顺序/多重集不一致：'+rows.filter(r=>r.sameOrder!==1).length);

// 敏感性：叠加 ③ 后（love 域 vall 与 ①②③ 等价，④ 只作用于 health）
const sens={};
for(const r of rows){const k=`A凶(${r.newLevel}) → +③${r.levelAfter3}`;sens[k]=(sens[k]||0)+1;}
log('\n## 三之二、敏感性：叠加③后这71例的档位\n'+JSON.stringify(sens));

// ---------- 统计 ----------
const dom={},mon={},delta={},combo={};
for(const r of rows){
  dom[r.domain]=(dom[r.domain]||0)+1;
  mon[r.month]=(mon[r.month]||0)+1;
  delta[`${r.origScore}→${r.newScore}`]=(delta[`${r.origScore}→${r.newScore}`]||0)+1;
  const k=`${r.cut1Shi?'①':''}${r.cut2Gua?'②':''}`;
  combo[k]=(combo[k]||0)+1;
}
log('\n## 三、统计\n分域：'+JSON.stringify(dom));
log('分月：'+JSON.stringify(mon));
log('分值迁移：'+JSON.stringify(delta));
log('去重组合：'+JSON.stringify(combo));

// ---------- 重点案例：辰月 mask72 love ----------
const target=rows.find(r=>r.month==='辰'&&r.mask===72&&r.domain==='love');
log('\n## 四、关键案例 辰月 mask72 love 雷地豫之天火同人');
if(target){
  log('原始信号账目：');
  target.allSignalsOrig.split(' ⏐ ').forEach((s,i)=>log(`  ${i+1}. ${s}`));
  log('①被抑制：'+(target.cut1Shi||'无'));
  log('②被抑制：'+(target.cut2Gua||'无'));
  log('③（本提交未启用）应在原始账目中的世爻侧回头克：'+(/世爻动化回头克/.test(target.allSignalsOrig)?'存在':'不存在'));
  log(`原始分 ${target.origScore}（${target.origLevel}）→ 修复后 ${target.newScore}（${target.newLevel}）｜公式 ${target.formulaScore}｜程序 ${target.progScore}`);
} else log('未命中该案例');

// ---------- 输出 ----------
const hdr=['case_id','month','mask','domain','bengua','biangua','yong','yongIsShi','allSignalsOrig','cut1Shi','cut2Gua','cutOther','origScore','origLevel','newScore','newLevel','formulaScore','progScore','cond1','cond2','sameOrder','verdict','scoreAfter3','levelAfter3','note'];
const esc=(v)=>String(v).replace(/,/g,'，').replace(/\n/g,' ');
fs.writeFileSync(path.join(OUT,'71-reversal-audit.csv'),hdr.join(',')+'\n'+rows.map(r=>hdr.map(h=>esc(r[h])).join(',')).join('\n'));
fs.writeFileSync(path.join(OUT,'71-reversal-audit.json'),JSON.stringify({
  generatedAt:new Date().toISOString(),
  method:'基线引擎与提交A引擎对 393,216 条场景各自实算，按档位差独立重扫；逐例做信号多重集差分与公式核验。',
  engines:{baseline:'legacy/verdict.orig.mjs (=0ed9e89)', stageA:'legacy/verdict.stageA.mjs (=b634b8f)', sha:{baseline:sha(path.resolve(__dirname,'../legacy/verdict.orig.mjs')),stageA:sha(path.resolve(__dirname,'../legacy/verdict.stageA.mjs')),prod:sha(path.join(ROOT,'app/js/verdict.js'))}},
  scanned, reversals:{'吉→凶':seventyOne.length,'凶→吉':found.filter(f=>f.dir==='凶→吉').length},
  crossCheck:{existingList:old.length, onlyInExisting:onlyOld.length, onlyInRescan:onlyNew.length},
  summary:{pass,fail,insufficient,domains:dom,months:mon,scoreTransitions:delta,dedupCombos:combo,suppressedRules:rules,afterDedup3:sens},
  cases:rows.map(r=>({case_id:r.case_id,verdict:r.verdict,origScore:r.origScore,newScore:r.newScore,cut1:r.cut1Shi,cut2:r.cut2Gua,formula:r.formulaScore,prog:r.progScore,sameOrder:r.sameOrder===1})),
  issues
},null,1));
fs.writeFileSync(path.join(OUT,'71-reversal-audit.log'),LOG.join('\n')+'\n');
console.log('\n已输出 71-reversal-audit.csv / .json / .log');
if(fail||insufficient||issues.length) process.exitCode=1;
