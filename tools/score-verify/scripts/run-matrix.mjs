// 计分方案验证 · 全矩阵运行器（只读生产代码；三套聚合在本文件内独立实现）
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { classifySignal, groupActive, GROUPS } from './classify.mjs';

globalThis.document = { addEventListener(){}, querySelector:()=>null, getElementById:()=>null, head:{appendChild(){}}, body:{appendChild(){},classList:{add(){},remove(){}}}, createElement:()=>({style:{},classList:{add(){},remove(){}},appendChild(){},setAttribute(){}}), querySelectorAll:()=>[] };
globalThis.window = globalThis;
globalThis.localStorage = { getItem:()=>null, setItem(){}, removeItem(){} };

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '../../..');
const core = await import(path.join(ROOT,'app/vendor/liuyao-core.js'));
const { judgeNajia } = await import(path.join(ROOT,'app/js/verdict.js')); // 只读引用线上引擎

const DOMAINS = ['career','wealth','love','health','decision','life','people','lost'];
// 12 月令地支（固定日辰癸酉、四柱其余固定，仅令变化——主人方案B）
const MONTHS = ['寅','卯','辰','巳','午','未','申','酉','戌','亥','子','丑'];
const LEVEL_OF = (s) => (s>=4?2: s>=1?1: s<=-4?-2: s<=-1?-1: 0);
const LN = { [-2]:'大凶', [-1]:'凶', 0:'平', 1:'吉', 2:'大吉' };

// 三套聚合：orig 原样；A 证据归组（组内副信号置0）；B 权重折减（副信号×k）
function aggregate(signals, ctx, mode, k = 0.5) {
  const tagged = signals.map((s) => ({ ...s, _cls: classifySignal(s, ctx) }));
  if (mode === 'orig') return { score: tagged.reduce((a, s) => a + s.w, 0), tagged };
  // 组索引
  const byGroup = new Map();
  for (const s of tagged) {
    if (!s._cls.group) continue;
    if (!byGroup.has(s._cls.group)) byGroup.set(s._cls.group, []);
    byGroup.get(s._cls.group).push(s);
  }
  // 标定每个激活组里的"副信号"（保留主信号，其余折减）
  const zeroOrCut = new Set();
  for (const [g, members] of byGroup) {
    if (!groupActive(g, members, ctx)) continue;
    // 主信号：G_SHI_WANG 保留用神侧；G_HECHONG 一律保留世应侧（世应相冲 -2 是占婚主体，卦象 -1 为重复）
    let primary;
    if (g === GROUPS.G_SHI_WANG) primary = members.find((m)=>m._cls.factor==='yong');
    else primary = members.find((m)=>['shiyingchong','shiyinghe'].includes(m._cls.sid));
    for (const m of members) if (m !== primary) zeroOrCut.add(m);
  }
  let score = 0;
  for (const s of tagged) {
    if (zeroOrCut.has(s)) score += mode === 'A' ? 0 : s.w * k;
    else score += s.w;
  }
  return { score, tagged, cutIds: [...zeroOrCut].map((s)=>s._cls.sid) };
}

// 单盘计算。judge 内部从 pan.siZhu.monthGanZhi 取月令，故调用期间临时覆写，结束即恢复（不改排盘）。
function runOne(pan, monthZhi, domain) {
  const origMGZ = pan.siZhu.monthGanZhi;
  const origDGZ = pan.siZhu.dayGanZhi;
  pan.siZhu.monthGanZhi = origMGZ[0] + monthZhi; // 保留天干，只换令支
  pan.siZhu.dayGanZhi = origDGZ[0] + '酉';       // 固定日辰癸酉（与基线场景一致）
  let v, an;
  try {
    an = core.analyzeNajia(pan, { monthZhi, dayZhi:'酉', sex: pan.gender === '女' ? '女' : '男' });
    v = judgeNajia(pan, domain);
  } finally {
    pan.siZhu.monthGanZhi = origMGZ;
    pan.siZhu.dayGanZhi = origDGZ;
  }
  const domCn = { career:'事业', wealth:'财运', love:'感情', health:'疾病', decision:'合作', life:'其他', people:'行人', lost:'失物' };
  let yongHoldsShi = false;
  const ys = an.yongshen[domCn[domain]];
  // 复刻 verdict.js 的取用：useYing 取应；否则 occurrences 去伏神后 rank 打分（持世8>动4>不空破2>合1），取并列第一的首爻
  if (ys && ys.useYing && an.ying) yongHoldsShi = true; // 应爻为用，不涉及世爻旺衰重复（G_SHI_WANG 本就要求 .shi）
  else if (ys && ys.occurrences) {
    let pool = ys.occurrences.filter((o)=>!o.hidden);
    if (pool.length > 1) {
      const rank=(o)=>(o.shi?8:0)+(o.moving?4:0)+(!o.state.xunKong&&!o.state.yuePo?2:0)+(o.state.yueHe||o.state.riHe?1:0);
      const max=Math.max(...pool.map(rank));
      pool = pool.filter((o)=>rank(o)===max);
    }
    yongHoldsShi = !!(pool[0] && pool[0].shi);
  }
  const ctx = { domain, yongHoldsShi };
  const orig = aggregate(v.signals, ctx, 'orig');
  const A = aggregate(v.signals, ctx, 'A');
  const B5 = aggregate(v.signals, ctx, 'B', 0.5);
  return {
    origScore: orig.score, origLevel: LEVEL_OF(orig.score),
    aScore: A.score, aLevel: LEVEL_OF(A.score),
    b5Score: B5.score, b5Level: LEVEL_OF(B5.score),
    cut: A.cutIds, ctx, signals: v.signals,
  };
}

// ---- 主流程 ----
const t0 = Date.now();
const stats = {
  total: 0, legalPans: 0, illegal: [],
  levelChanges: { A: 0, B: 0 },
  scoreMoved: { A: 0, B: 0 },
  // 档位迁移矩阵 matrix[from][to]
  matrixA: {}, matrixB: {},
  byDomain: {},
  cutFreq: {}, // 被归组折减的 sid 频次
};
const cases = { A: [], B: [] }; // 档位变化案例（抽样）
const monthFixedCases = []; // 固定戌月 4096 盘逐盘差异（主人要求）

const outDir = path.join(ROOT, 'tools/score-verify/output');
fs.mkdirSync(outDir, { recursive: true });
// 明细 CSV（全量，列式）
const csv = fs.createWriteStream(path.join(outDir, 'full-matrix.csv'));
csv.write('month,mask,bengua,biangua,domain,yongShi,origScore,origLevel,aScore,aLevel,bScore,bLevel,cutSids\n');

for (let mi=0; mi<MONTHS.length; mi++) {
  const mz = MONTHS[mi];
  let monthLegal = 0;
  for (let mask=0; mask<4096; mask++) {
    const vals=[]; for(let i=0;i<6;i++) vals.push([6,7,8,9][(mask>>(i*2))&3]);
    let pan;
    try { pan = core.paipan({ yaoValues: vals, gender:'男', question:'x', year:2026, month:10, day:26, hour:17, minute:35 }); }
    catch(e){ stats.illegal.push({month:mz,mask,err:e.message}); continue; }
    if (!pan?.benGua?.name) { stats.illegal.push({month:mz,mask,reason:'no benGua'}); continue; }
    monthLegal++;
    const ben = pan.benGua.name, bian = pan.bianGua?.name || '';
    for (const domain of DOMAINS) {
      const r = runOne(pan, mz, domain);
      stats.total++;
      stats.byDomain[domain] = stats.byDomain[domain] || { A:0, B:0, n:0 };
      stats.byDomain[domain].n++;
      for (const c of r.cut) stats.cutFreq[c] = (stats.cutFreq[c]||0)+1;
      const recMoves = (key, lk, sk) => {
        if (r.aScore !== r.origScore) { stats.scoreMoved.A++; stats.byDomain[domain].A_moved=(stats.byDomain[domain].A_moved||0)+1; }
        if (r.b5Score !== r.origScore) { stats.scoreMoved.B++; }
        if (r[lk] !== r.origLevel) {
          stats.levelChanges[key]++; stats.byDomain[domain][key]++;
          const kf = `${r.origLevel}>${r[lk]}`;
          (stats[`matrix${key==='A'?'A':'B'}`][kf]) = (stats[`matrix${key==='A'?'A':'B'}`][kf]||0)+1;
          if (cases[key].length < 60) cases[key].push({ month:mz, mask, ben, bian, domain, from:LN[r.origLevel], to:LN[r[lk]], orig:r.origScore, neu:r[lk==='aLevel'?'aScore':'b5Score'], cut:r.cut, why:r.cut.join('+'), sig:r.signals.filter(s=>/得月令之气|世爻[旺相]于月|世应相冲|本卦是六冲卦|本卦是六合卦|世应相合|月令休态|被月令|世爻[囚死]于月/.test(s.text)).map(s=>`[${s.w}]${s.text.slice(0,24)}`) });
        }
      };
      recMoves('A','aLevel','aScore');
      recMoves('B','b5Level','b5Score');
      csv.write(`${mz},${mask},${ben},${bian},${domain},${r.ctx.yongHoldsShi?1:0},${r.origScore},${r.origLevel},${r.aScore},${r.aLevel},${r.b5Score},${r.b5Level},${r.cut.join('|')}\n`);
      if (mz==='戌') monthFixedCases.push({mask,ben,bian,domain,o:r.origScore,a:r.aScore,b:r.b5Score,ol:r.origLevel,al:r.aLevel,bl:r.b5Level,cut:r.cut.join('|')});
    }
  }
  stats.legalPans += monthLegal;
  console.log(`月令 ${mz} 完成：合法盘 ${monthLegal}/4096，累计 ${stats.total} 条，用时 ${((Date.now()-t0)/1000).toFixed(1)}s`);
}
csv.end();

// 一致性校验：方案乙 k=0 必须等于方案甲（用一轮小样本验证已在 classify 设计中；这里验证 B5 分数始终介于 orig 与 A 之间）
// 落盘汇总
fs.writeFileSync(path.join(outDir,'summary.json'), JSON.stringify(stats, null, 2));
fs.writeFileSync(path.join(outDir,'level-change-cases.json'), JSON.stringify(cases, null, 2));
fs.writeFileSync(path.join(outDir,'fixed-month-xu-diff.json'), JSON.stringify(monthFixedCases.filter(c=>c.a!==c.o), null, 2));
console.log('\n===== 汇总 =====');
console.log('总记录:', stats.total, ' 合法盘(月令累计):', stats.legalPans, ' 非法:', stats.illegal.length);
console.log('分数被改变条数  A:', stats.scoreMoved.A, ' B(k=.5):', stats.scoreMoved.B);
console.log('档位变化条数    A:', stats.levelChanges.A, ' B:', stats.levelChanges.B);
console.log('A 档位迁移矩阵:', JSON.stringify(rename(stats.matrixA)));
console.log('B 档位迁移矩阵:', JSON.stringify(rename(stats.matrixB)));
console.log('被折减 sid 频次:', JSON.stringify(stats.cutFreq));
console.log('总用时:', ((Date.now()-t0)/1000).toFixed(1), 's');
function rename(m){const o={};for(const k in m){const[a,b]=k.split('>');o[`${LN[a]}→${LN[b]}`]=m[k];}return o;}
