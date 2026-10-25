import { paiZiwei } from './src/ziwei.ts';
const c = paiZiwei({ year: 1994, month: 8, day: 1, hour: 11, minute: 45, gender: '男' });
console.log('命宫:', c.soulBranch, '身宫:', c.bodyBranch, '局:', c.fiveElementsClass);
for (const p of c.palaces) {
  const f = p.flyHua.map((x) => `${x.mutagen}${x.star}→${x.toBranch}${x.isSelf ? '(自化)' : ''}`).join(' ');
  const i = p.flyIn.map((x) => `${x.fromBranch}${x.mutagen}${x.star}${x.isSelf ? '(自)' : ''}`).join(' ');
  console.log(`${p.ganZhi} ${p.name}\t飞出: ${f}\t飞入: ${i}`);
}
console.log('命宫丑 飞入明细:', JSON.stringify(c.palaces.find((p) => p.earthlyBranch === '丑')!.flyIn));
