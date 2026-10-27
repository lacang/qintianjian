// 从校正基线矩阵 v2b-full-matrix.csv 提取指定变体的全部吉凶反转（完整清单，非抽样）。
// 用法：node extract-reversals-v2b.mjs v12|v3|v4|vall
import fs from 'node:fs'; import path from 'node:path'; import { fileURLToPath } from 'node:url';
const __dirname=path.dirname(fileURLToPath(import.meta.url)); const OUT=path.resolve(__dirname,'../output');
const variant=process.argv[2]||'vall';
const lines=fs.readFileSync(path.join(OUT,'v2b-full-matrix.csv'),'utf8').trim().split('\n');
const H=lines[0].split(','); const I={}; H.forEach((h,i)=>I[h]=i);
const rows=[];
for(let i=1;i<lines.length;i++){
  const c=lines[i].split(',');
  const ol=+c[I.origLevel], nl=+c[I[variant+'Level']], os=+c[I.origScore], ns=+c[I[variant+'Score']];
  const dir = ol<=-1&&nl>=1 ? '凶→吉' : ol>=1&&nl<=-1 ? '吉→凶' : null;
  if(!dir) continue;
  rows.push({month:c[I.month],mask:+c[I.mask],bengua:c[I.bengua],biangua:c[I.biangua],domain:c[I.domain],
    yongShi:+c[I.yongShi],origScore:os,origLevel:ol,newScore:ns,newLevel:nl,dir});
}
fs.writeFileSync(path.join(OUT,`reversals-${variant}-full.json`),JSON.stringify(rows,null,1));
const hdr=['month','mask','bengua','biangua','domain','yongShi','origScore','origLevel','newScore','newLevel','dir'];
fs.writeFileSync(path.join(OUT,`reversals-${variant}-full.csv`),hdr.join(',')+'\n'+rows.map(r=>hdr.map(h=>r[h]).join(',')).join('\n'));
const g={}; for(const r of rows){const k=r.dir+' '+r.origScore+'→'+r.newScore; g[k]=(g[k]||0)+1;}
console.log(variant,'反转',rows.length,JSON.stringify(g));
