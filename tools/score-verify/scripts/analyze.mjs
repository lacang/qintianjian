// 从 full-matrix.csv 重新独立统计（绕开 runner 计数器），并抽查主人卦例 + 双向变化案例合理性
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '../../..');
const csv = fs.readFileSync(path.join(ROOT,'tools/score-verify/output/full-matrix.csv'),'utf8').trim().split('\n').slice(1);

const LN={'-2':'大凶','-1':'凶','0':'平','1':'吉','2':'大吉'};
const stat={A:{scoreMoved:0,lvMoved:0,up:0,down:0,mat:{},byDom:{}},B:{scoreMoved:0,lvMoved:0,up:0,down:0,mat:{},byDom:{}}};
const upExamples=[], downExamples=[];
const master=[];
for(const line of csv){
  const [month,mask,ben,bian,domain,yShi,o,ol,a,al,b,bl,cut]=line.split(',');
  const oN=+o,aN=+a,bN=+b,oLv=+ol,aLv=+al,bLv=+bl;
  stat.A.byDom[domain]=stat.A.byDom[domain]||{moved:0,lv:0};
  stat.B.byDom[domain]=stat.B.byDom[domain]||{moved:0,lv:0};
  if(aN!==oN){stat.A.scoreMoved++;stat.A.byDom[domain].moved++;}
  if(bN!==oN){stat.B.scoreMoved++;stat.B.byDom[domain].moved++;}
  if(aLv!==oLv){stat.A.lvMoved++;stat.A.byDom[domain].lv++; const k=`${LN[oLv]}→${LN[aLv]}`;stat.A.mat[k]=(stat.A.mat[k]||0)+1; if(aLv>oLv){stat.A.up++; if(upExamples.length<8)upExamples.push({month,ben,bian,domain,yShi,o,a,cut});}else{stat.A.down++; if(downExamples.length<8)downExamples.push({month,ben,bian,domain,yShi,o,a,cut});}}
  if(bLv!==oLv){stat.B.lvMoved++; const k=`${LN[oLv]}→${LN[bLv]}`;stat.B.mat[k]=(stat.B.mat[k]||0)+1; bLv>oLv?stat.B.up++:stat.B.down++;}
  // 主人卦例：雷火丰之噬嗑 mask 对应 yaoValues[7,8,9,7,8,6]
  if(ben==='雷火丰'&&bian==='火雷噬嗑') master.push({month,domain,yShi,o,a,b,ol:LN[ol],al:LN[al],bl:LN[bl],cut});
}
console.log('=== 方案A 证据归组（副信号置0）===');
console.log('分数改变:',stat.A.scoreMoved,' 档位改变:',stat.A.lvMoved,' 升档:',stat.A.up,' 降档:',stat.A.down);
console.log('迁移矩阵:',JSON.stringify(stat.A.mat));
console.log('分域档位变化:',JSON.stringify(Object.fromEntries(Object.entries(stat.A.byDom).map(([k,v])=>[k,v.lv]))));
console.log('\n=== 方案B 折减k=0.5 ===');
console.log('分数改变:',stat.B.scoreMoved,' 档位改变:',stat.B.lvMoved,' 升档:',stat.B.up,' 降档:',stat.B.down);
console.log('迁移矩阵:',JSON.stringify(stat.B.mat));
console.log('\n=== 降档样例（修正虚高）==='); for(const e of downExamples.slice(0,6))console.log(JSON.stringify(e));
console.log('\n=== 升档样例（消除负向重复，需核验是否合理）==='); for(const e of upExamples.slice(0,8))console.log(JSON.stringify(e));
console.log('\n=== 主人卦例（雷火丰之噬嗑）12令×8域中 career/love 摘要 ===');
for(const m of master.filter(x=>x.domain==='career'||x.domain==='love')) console.log(`${m.month}月 ${m.domain} 用神持世=${m.yShi} | 原${m.o}(${m.ol}) A${m.a}(${m.al}) B${m.b}(${m.bl}) 折减[${m.cut||''}]`);
