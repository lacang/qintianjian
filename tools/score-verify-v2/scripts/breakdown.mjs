// 汇总二次加工：分域/分月档位变化、固定戌月 4096 盘逐盘差异、跨档与反转清单
import fs from 'node:fs'; import path from 'node:path'; import { fileURLToPath } from 'node:url';
const __dirname=path.dirname(fileURLToPath(import.meta.url));
const ROOT=path.resolve(__dirname,'../../..');
const out=path.join(ROOT,'tools/score-verify-v2/output');
const csv=fs.readFileSync(path.join(out,'v2-full-matrix.csv'),'utf8').trim().split('\n');
const head=csv[0].split(',');
const rows=csv.slice(1).map(l=>{const c=l.split(',');const o={};head.forEach((h,i)=>o[h]=c[i]);return o;});
const VK=['v1','v2','v3','v4','vall','vfold'];
const domName={career:'事业',wealth:'财运',love:'感情',health:'疾病',decision:'合作',life:'其他',people:'行人',lost:'失物'};
// 分域档位变化（vall）
const byDom={};
for(const r of rows){const d=r.domain;(byDom[d]??={n:0,score:0,level:0,reverse:0}).n++;
  if(r.vallScore!==r.origScore)byDom[d].score++;
  if(r.vallLevel!==r.origLevel){byDom[d].level++;if((r.origLevel>0&&r.vallLevel<0)||(r.origLevel<0&&r.vallLevel>0))byDom[d].reverse++;}}
// 分月档位变化（vall）
const byMonth={};
for(const r of rows){const m=r.month;(byMonth[m]??={level:0,score:0}).score+=r.vallScore!==r.origScore?1:0;byMonth[m].level+=r.vallLevel!==r.origLevel?1:0;}
// 各变体 分域档位变化
const variantDomain={};
for(const v of VK){variantDomain[v]={};for(const r of rows){if(r[v+'Level']!==r.origLevel)variantDomain[v][r.domain]=(variantDomain[v][r.domain]||0)+1;}}
// 固定戌月逐盘差异（任一方案分数变），输出 CSV（mask,卦,域,持世,orig→各方案level,cut）
const xu=rows.filter(r=>r.month==='戌'&&(r.v1Score!==r.origScore||r.v2Score!==r.origScore||r.v3Score!==r.origScore||r.v4Score!==r.origScore));
let s='mask,bengua,biangua,domain,yongShi,orig,origL,v1,v1L,v2,v2L,v3,v3L,v4,v4L,vall,vallL,vfold,vfoldL,vallCut\n';
for(const r of xu){s+=[r.mask,r.bengua,r.biangua,r.domain,r.yongShi,r.origScore,r.origLevel,r.v1Score,r.v1Level,r.v2Score,r.v2Level,r.v3Score,r.v3Level,r.v4Score,r.v4Level,r.vallScore,r.vallLevel,r.vfoldScore,r.vfoldLevel,r.vallCut].join(',')+'\n';}
fs.writeFileSync(path.join(out,'fixed-month-xu-v2-diff.csv'),s);
fs.writeFileSync(path.join(out,'v2-breakdown.json'),JSON.stringify({byDomain:byDom,byMonth,variantDomain,xuChanged:xu.length},null,2));
console.log('vall 分域档位变化:');
for(const d of Object.keys(byDom))console.log(`  ${domName[d].padEnd(3)} ${d.padEnd(9)} n=${byDom[d].n} 分数变${String(byDom[d].score).padStart(5)} 档位变${String(byDom[d].level).padStart(5)} 反转${byDom[d].reverse}`);
console.log('\n各变体分域档位变化:');
for(const v of VK)console.log(`  ${v.padEnd(6)}`,JSON.stringify(Object.fromEntries(Object.entries(variantDomain[v]).map(([k,x])=>[domName[k],x]))));
console.log('\nvall 分月档位变化:',JSON.stringify(byMonth));
console.log('戌月逐盘差异条数:',xu.length);
