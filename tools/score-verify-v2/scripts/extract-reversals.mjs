// 从全量 v2-full-matrix.csv 提取【全部】吉凶反转案例（orig 与某方案分跨正负），生成机器可读清单。
import fs from 'node:fs'; import path from 'node:path'; import { fileURLToPath } from 'node:url';
const __dirname=path.dirname(fileURLToPath(import.meta.url));
const ROOT=path.resolve(__dirname,'../../..');
const out=path.join(ROOT,'tools/score-verify-v2/output');
const lines=fs.readFileSync(path.join(out,'v2-full-matrix.csv'),'utf8').trim().split('\n');
const head=lines[0].split(',');
const rows=lines.slice(1).map(l=>{const c=l.split(',');const o={};head.forEach((h,i)=>o[h]=c[i]);return o;});
const pos=l=>l>0, neg=l=>l<0;
function reversals(vk){
  const arr=[];
  for(const r of rows){const ol=+r.origLevel,nl=+r[vk+'Level'];
    if((pos(ol)&&neg(nl))||(neg(ol)&&pos(nl)))
      arr.push({month:r.month,mask:+r.mask,bengua:r.bengua,biangua:r.biangua,domain:r.domain,yongShi:+r.yongShi,
        origScore:+r.origScore,origLevel:ol,newScore:+r[vk+'Score'],newLevel:nl,
        dir:pos(ol)&&neg(nl)?'吉→凶':'凶→吉',vallCut:r.vallCut});}
  return arr;
}
const sets={v3:reversals('v3'),v4:reversals('v4'),vall:reversals('vall')};
for(const [vk,arr] of Object.entries(sets)){
  const down=arr.filter(x=>x.dir==='吉→凶'),up=arr.filter(x=>x.dir==='凶→吉');
  fs.writeFileSync(path.join(out,`reversals-${vk}-full.json`),JSON.stringify(arr,null,1));
  let csv='month,mask,bengua,biangua,domain,yongShi,origScore,origLevel,newScore,newLevel,dir,vallCut\n';
  for(const x of arr)csv+=`${x.month},${x.mask},${x.bengua},${x.biangua},${x.domain},${x.yongShi},${x.origScore},${x.origLevel},${x.newScore},${x.newLevel},${x.dir},${x.vallCut}\n`;
  fs.writeFileSync(path.join(out,`reversals-${vk}-full.csv`),csv);
  console.log(`${vk}: 全部反转 ${arr.length} = 凶→吉 ${up.length} + 吉→凶 ${down.length}`);
}
// vall 分域
const byDom={};for(const x of sets.vall){byDom[x.domain]=byDom[x.domain]||{up:0,down:0};x.dir==='凶→吉'?byDom[x.domain].up++:byDom[x.domain].down++;}
console.log('vall 分域(凶→吉/吉→凶):',JSON.stringify(byDom));
