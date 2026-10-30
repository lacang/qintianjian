// 六合卦 / 六冲卦 名单的纳甲独立验证
// 判定：初-四、二-五、三-上 三对地支全部六合 → 六合卦；全部六冲 → 六冲卦
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import fs from 'node:fs';
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '../../../..');
globalThis.document = { addEventListener(){}, querySelector:()=>null, getElementById:()=>null, querySelectorAll:()=>[], head:{appendChild(){}}, body:{appendChild(){},classList:{add(){},remove(){}}}, createElement:()=>({style:{},classList:{add(){},remove(){}},appendChild(){},setAttribute(){}}) };
globalThis.window = globalThis;
globalThis.localStorage = { getItem:()=>null, setItem(){}, removeItem(){} };
const core = await import(pathToFileURL(path.join(ROOT,'app/vendor/liuyao-core.js')).href);

const HE = {'子':'丑','丑':'子','寅':'亥','亥':'寅','卯':'戌','戌':'卯','辰':'酉','酉':'辰','巳':'申','申':'巳','午':'未','未':'午'};
const CHONG = {'子':'午','午':'子','丑':'未','未':'丑','寅':'申','申':'寅','卯':'酉','酉':'卯','辰':'戌','戌':'辰','巳':'亥','亥':'巳'};

const heList = [], chongList = [], all = [];
for (let m = 0; m < 64; m++) {
  const v = [];
  for (let i = 0; i < 6; i++) v.push((m >> i) & 1 ? 7 : 8);   // 1=阳 0=阴
  const p = core.paipan({ yaoValues: v, gender: '男', question: 'x', year: 2026, month: 10, day: 26, hour: 17, minute: 35 });
  const an = core.analyzeNajia(p, { monthZhi: '寅', dayZhi: '子', sex: '男' });
  const zhi = an.lines.map((o) => o.state && o.yao ? o.yao.zhi : (o.yao && o.yao.zhi));
  const z = an.lines.map((o) => o.yao.zhi);
  if (z.length !== 6) continue;
  const pairs = [[0,3],[1,4],[2,5]];
  const isHe = pairs.every(([a,b]) => HE[z[a]] === z[b]);
  const isChong = pairs.every(([a,b]) => CHONG[z[a]] === z[b]);
  const name = p.benGua.name;
  all.push({ name, zhi: z.join(''), isHe, isChong });
  if (isHe) heList.push(name);
  if (isChong) chongList.push(name);
}

const postSrc = fs.readFileSync(path.join(ROOT,'app/js/verdict.js'),'utf8');
const preSrc = fs.readFileSync(path.join(ROOT,'tools/score-verify-v2/l1-review/legacy/verdict-v2.mjs'),'utf8');
const NEW_HE = JSON.parse(postSrc.match(/const LIU_HE_GUA = (\[[^\]]*\]);/)[1].replace(/'/g,'"'));
const NEW_CH = JSON.parse(postSrc.match(/const LIU_CHONG_GUA = (\[[^\]]*\]);/)[1].replace(/'/g,'"'));
const OLD_HE = JSON.parse(preSrc.match(/const LIU_HE_GUA = (\[[^\]]*\]);/)[1].replace(/'/g,'"'));
const OLD_CH = JSON.parse(preSrc.match(/const LIU_CHONG_GUA = (\[[^\]]*\]);/)[1].replace(/'/g,'"'));

const L = [];
L.push('六合卦 / 六冲卦 名单纳甲独立验证');
L.push('='.repeat(70));
L.push('判定标准：初-四、二-五、三-上 三对地支全部六合（或全部六冲）');
L.push('');
L.push(`纳甲实测六合卦 ${heList.length} 个：${heList.join('、')}`);
L.push(`纳甲实测六冲卦 ${chongList.length} 个：${chongList.join('、')}`);
L.push('');
const cmp = (label, a, b) => {
  const extra = a.filter((x) => !b.includes(x));
  const miss = b.filter((x) => !a.includes(x));
  L.push(`${label}`);
  L.push(`  名单 ${a.length} 个：${a.join('、')}`);
  L.push(`  纳甲实测 ${b.length} 个：${b.join('、')}`);
  L.push(`  名单多出（非真六合/六冲却列入）：${extra.length ? extra.join('、') : '无'}`);
  L.push(`  名单遗漏（真六合/六冲却未列）：${miss.length ? miss.join('、') : '无'}`);
  L.push(`  判定：${extra.length === 0 && miss.length === 0 ? '完全正确 ✅' : '存在错误 ❌'}`);
  L.push('');
};
cmp('【旧六合名单 v121】', OLD_HE, heList);
cmp('【新六合名单 v122】', NEW_HE, heList);
cmp('【旧六冲名单 v121】', OLD_CH, chongList);
cmp('【新六冲名单 v122】', NEW_CH, chongList);
L.push('逐卦地支（供复核）：');
for (const g of all.filter((x) => x.isHe || x.isChong)) L.push(`  ${g.name.padEnd(6)} ${g.zhi}  ${g.isHe?'六合':''}${g.isChong?'六冲':''}`);

fs.writeFileSync(path.join(ROOT,'tools/score-verify-v2/l1-review/evidence/verify-gua-lists.txt'), L.join('\n'), 'utf8');
console.log(L.join('\n'));
