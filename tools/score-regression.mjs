// 六爻评分 V2 重复计分修复 · 回归测试（不依赖浏览器、不依赖 30MB CSV）
//
// 做什么：
//  1) 全量逐盘对齐：393,216 场景，生产 judgeNajia 与"原版引擎信号 + 共享去重实现"现算的基线逐盘相同。
//     stage A（只上①②）对齐 v12；stage B（①②③）对齐 vall（vall=①②③④，而④只作用于 health，
//     故 health 域一律对齐 orig）。
//  2) 结构断言：①正常触发/边界不触发 ②真共现抑制/三例外保留/变卦不误删 ③同爻抑制/不同爻不误并/health不干预。
//  3) 固定夹具：mask322 寅月 career（仅 stage B），目标 0（平）——实测值打印，不写死冒充计算。
//
// 运行：node tools/score-regression.mjs [--stage=A|B] [--quick]
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const QUICK = process.argv.includes('--quick');
const STAGE = (process.argv.find((a) => a.startsWith('--stage=')) || '--stage=B').split('=')[1];
const REF_VARIANT = STAGE === 'A' ? 'v12' : 'vall';

// ---- 最小 DOM stub（verdict.js / state.js 需要）----
globalThis.document = {
  addEventListener() {}, querySelector: () => null, getElementById: () => null, querySelectorAll: () => [],
  head: { appendChild() {} },
  body: { appendChild() {}, classList: { add() {}, remove() {} } },
  createElement: () => ({ style: {}, classList: { add() {}, remove() {} }, appendChild() {}, setAttribute() {} }),
};
globalThis.window = globalThis;
globalThis.localStorage = { getItem: () => null, setItem() {}, removeItem() {} };

const core = await import(path.join(ROOT, 'app/vendor/liuyao-core.js'));
const { judgeNajia } = await import(path.join(ROOT, 'app/js/verdict.js'));            // 生产（待测）
const { judgeNajia: judgeOrig } = await import(path.join(ROOT, 'tools/score-verify-v2/legacy/verdict.orig.mjs')); // 原版（基线）
const { aggregate } = await import(path.join(ROOT, 'tools/score-verify-v2/scripts/ref-apply.mjs'));

import fs from 'node:fs';
// 卦组常量直接从生产源码解析，避免测试里另抄一份口径
const src = fs.readFileSync(path.join(ROOT, 'app/js/verdict.js'), 'utf8');
const grab = (name) => {
  const m = src.match(new RegExp(`const\\s+${name}\\s*=\\s*\\[([^\\]]*)\\]`));
  if (!m) throw new Error(`未找到 ${name}`);
  return m[1].split(',').map((s) => s.trim().replace(/^['"]|['"]$/g, '')).filter(Boolean);
};
const LIU_CHONG_GUA = grab('LIU_CHONG_GUA');
const LIU_HE_GUA = grab('LIU_HE_GUA');

const DOMAIN_KEY = { career: '事业', wealth: '财运', love: '感情', health: '疾病', lost: '失物', people: '行人', decision: '合作', life: '其他' };
const SKIP_YONG_BODY = new Set(['health', 'decision', 'life', 'people']);
const DOMAINS = ['career', 'wealth', 'love', 'health', 'lost', 'decision', 'life', 'people'];
const MONTH_ZHI = ['寅', '卯', '辰', '巳', '午', '未', '申', '酉', '戌', '亥', '子', '丑'];
const WANG = new Set(['旺', '相']);
const SHUAI = new Set(['休', '囚', '死']);

let fail = 0, checks = 0;
const ok = (cond, msg) => { checks++; if (!cond) { fail++; if (fail <= 20) console.error('FAIL: ' + msg); } };

// ---- 独立复算：选中用神是否即世爻（同生产 rank：持世8/发动4/不空破2/月日合1，平票取首）----
function recompute(an, domainId) {
  const ys = an.yongshen[DOMAIN_KEY[domainId]] || an.yongshen['其他'];
  let occ = null;
  if (ys.useYing && an.ying) occ = an.ying.occ;
  else {
    let pool = ys.occurrences.filter((o) => !o.hidden);
    if (pool.length > 1) {
      const rank = (o) => (o.shi ? 8 : 0) + (o.moving ? 4 : 0) + (!o.state.xunKong && !o.state.yuePo ? 2 : 0) + (o.state.yueHe || o.state.riHe ? 1 : 0);
      const max = Math.max(...pool.map(rank));
      pool = pool.filter((o) => rank(o) === max);
    }
    occ = pool[0] || null;
  }
  const bodyCounts = !!occ && !SKIP_YONG_BODY.has(domainId);
  const yongIsShi = !!(bodyCounts && !ys.useYing && an.shi && occ.pos === an.shi.occ.pos);
  return { ys, occ, bodyCounts, yongIsShi };
}

const stat = { legal: 0, pans: 0, aligned: 0, mismatch: 0, c1: 0, c2: 0, c3: 0, c4: 0, c5: 0, c6: 0, c7: 0, sanli: 0, bianSig: 0, healthDup: 0 };
const mismatches = [];
let fixture = null;

for (let mask = 0; mask < 4096; mask++) {
  const vals = [];
  for (let i = 0; i < 6; i++) vals.push([6, 7, 8, 9][(mask >> (i * 2)) & 3]);
  let probe;
  try { probe = core.paipan({ yaoValues: vals, gender: '男', question: 'x', year: 2026, month: 10, day: 26, hour: 17, minute: 35 }); } catch { continue; }
  if (!probe?.benGua?.name) continue;
  const dayGan = probe.siZhu.dayGanZhi[0], dayZhi = probe.siZhu.dayGanZhi[1];

  for (let mi = 0; mi < 12; mi++) {
    const monthZhi = MONTH_ZHI[mi];
    if (QUICK && mi % 3 !== 0 && monthZhi !== '寅') continue;
    let pan;
    try { pan = core.paipan({ yaoValues: vals, gender: '男', question: 'x', year: 2026, month: 10, day: 26, hour: 17, minute: 35 }); } catch { continue; }
    if (!pan?.benGua?.name) continue;
    // 固定其他条件，只变月令：起盘月固定，判断期覆写月令/日辰
    pan.siZhu.monthGanZhi = pan.siZhu.monthGanZhi[0] + monthZhi;
    pan.siZhu.dayGanZhi = dayGan + dayZhi;
    stat.legal++;

    for (const domainId of DOMAINS) {
      const v = judgeNajia(pan, domainId);
      const texts = v.signals.map((s) => s.text);
      const has = (re) => texts.some((t) => (typeof re === 'string' ? t.includes(re) : re.test(t)));
      stat.pans++;

      // ---- 基线现算：原版引擎信号 + 共享去重 ----
      const lo = judgeOrig(pan, domainId);
      const an = core.analyzeNajia(pan, { monthZhi, dayZhi, sex: pan.gender === '女' ? '女' : '男' });
      const { occ, bodyCounts, yongIsShi } = recompute(an, domainId);
      const ctx = { domain: domainId, yongHoldsShi: !!(occ && occ.shi) };
      const exp = domainId === 'health'
        ? { score: lo.score, level: lo.level }                     // ①②③ 均不作用于 health → 对齐原算法
        : aggregate(lo.signals, ctx, REF_VARIANT);
      if (v.score === exp.score && v.level === exp.level) stat.aligned++;
      else { stat.mismatch++; if (mismatches.length < 8) mismatches.push({ mask, monthZhi, domainId, got: [v.score, v.level], want: [exp.score, exp.level] }); }

      const st = an.shi ? an.shi.occ.state : null;
      const stW = st ? (WANG.has(st.lingTai) ? 1 : SHUAI.has(st.lingTai) ? -1 : 0) : 0;
      const shiWangSig = has(/^世爻[旺相休囚死]于月/);

      // ① 正常触发：用神持世 → 世爻月建旺衰必须被抑制
      if (yongIsShi && stW !== 0) { stat.c1++; ok(!shiWangSig, `①未抑制 mask${mask} ${monthZhi}月 ${domainId}`); }
      // ① 边界不触发：用神不持世（且用神本体块计分）→ 世爻月建旺衰必须保留
      if (!yongIsShi && bodyCounts && stW !== 0) { stat.c2++; ok(shiWangSig, `①误抑制(非持世) mask${mask} ${monthZhi}月 ${domainId}`); }
      // ① 边界不触发：skipYongBody 四域 → 世爻月建旺衰必须保留
      if (SKIP_YONG_BODY.has(domainId) && stW !== 0) { stat.c3++; ok(shiWangSig, `①误抑制(skip域) mask${mask} ${monthZhi}月 ${domainId}`); }

      if (STAGE === 'B') {
        // ③ 正常触发：用神持世且发动 → 世爻回头克/生必须被抑制
        if (yongIsShi && occ.moving && (st.huaTouKe || st.huaTouSheng)) {
          stat.c4++;
          ok(!has(/^世爻动化回头克——/), `③未抑制回头克 mask${mask} ${monthZhi}月 ${domainId}`);
          ok(!has(/^世爻动化回头生，行动有人帮/), `③未抑制回头生 mask${mask} ${monthZhi}月 ${domainId}`);
        }
        // ③ 边界不误并：用神不持世时世爻化回头克必须保留
        if (!yongIsShi && st && st.huaTouKe) { stat.c5++; ok(has(/^世爻动化回头克——/), `③误并(非持世) mask${mask} ${monthZhi}月 ${domainId}`); }
        // ③ 不干预 health：通用 + 专项应同时存在（④未做）
        if (domainId === 'health' && st && st.huaTouKe) {
          const both = has(/^世爻动化回头克——/) && has(/^世爻动化回头克、或化官鬼/);
          if (both) stat.healthDup++;
          ok(both, `③误动health mask${mask} ${monthZhi}月`);
        }
      }

      // ② 真共现抑制
      if (domainId === 'love' && has(/^世应相冲/)) { stat.c6++; ok(!has(/^本卦是六冲卦/), `②未抑制六冲卦 mask${mask} ${monthZhi}月`); }
      if (domainId === 'love' && has(/^世应相合/)) { stat.c7++; ok(!has(/^本卦是六合卦/), `②未抑制六合卦 mask${mask} ${monthZhi}月`); }
      // ② 三例外保留：本卦属六合卦但世应既不合也不冲 → +1 必须保留
      const ben = pan.benGua.name;
      if (domainId === 'love' && LIU_HE_GUA.includes(ben) && !has(/^世应相合/) && !has(/^世应相冲/)) {
        stat.sanli++; ok(has(/^本卦是六合卦/), `②误删六合三例外 ${ben} mask${mask} ${monthZhi}月`);
      }
      // ② 变卦走向不误删
      if (domainId === 'love' && pan.bianGua) {
        const bian = pan.bianGua.name;
        if (LIU_CHONG_GUA.includes(ben) && LIU_HE_GUA.includes(bian)) { stat.bianSig++; ok(has(/六冲变六合/), `②误删313 mask${mask} ${monthZhi}月`); }
        if (LIU_HE_GUA.includes(ben) && LIU_CHONG_GUA.includes(bian)) { stat.bianSig++; ok(has(/六合变六冲/), `②误删314 mask${mask} ${monthZhi}月`); }
      }

      if (STAGE === 'B' && mask === 322 && monthZhi === '寅' && domainId === 'career') {
        fixture = { score: v.score, level: v.level, yongIsShi, occPos: occ?.pos, shiPos: an.shi?.occ.pos, texts };
      }
    }
  }
}

console.log(`=== 六爻评分 V2 回归（stage ${STAGE}，基线 ${REF_VARIANT}）===`);
if (STAGE === 'B') {
  if (!fixture) { console.error('FAIL: mask322 夹具未命中'); fail++; }
  else {
    const t = fixture.texts.join(' | ');
    console.log(`mask322 寅月 career：score=${fixture.score} level=${fixture.level}（目标 0/平）`);
    console.log(`  用神持世=${fixture.yongIsShi}（用神${fixture.occPos}爻 / 世${fixture.shiPos}爻）｜用神侧回头克在=${/却被变爻回头克/.test(t)}｜世爻侧回头克在=${/^世爻动化回头克——/m.test(t)}｜用神旺相在=${/得月令之气/.test(t)}｜世爻月建旺衰在=${/^世爻[旺相休囚死]于月/m.test(t)}`);
    ok(fixture.score === 0 && fixture.level === 0, `mask322 实测 ${fixture.score}/${fixture.level}，目标 0/0`);
    ok(/却被变爻回头克/.test(t), 'mask322 用神侧回头克应保留');
    ok(!/^世爻动化回头克——/m.test(t), 'mask322 世爻侧回头克应被抑制');
    ok(!/^世爻[旺相休囚死]于月/m.test(t), 'mask322 世爻月建旺衰应被抑制');
  }
}
console.log(`扫描：合法盘 ${stat.legal}，判读 ${stat.pans} 条${QUICK ? '（quick）' : ''}`);
console.log(`逐盘对齐：${stat.aligned} 通过 / ${stat.mismatch} 不一致`);
if (mismatches.length) console.log('不一致样例：', JSON.stringify(mismatches, null, 1));
console.log(`结构断言：①持世抑制 ${stat.c1}｜①非持世保留 ${stat.c2}｜①skip域保留 ${stat.c3}｜③持世抑制 ${stat.c4}｜③非持世保留 ${stat.c5}｜②冲共现 ${stat.c6}｜②合共现 ${stat.c7}｜②三例外 ${stat.sanli}｜②变卦 ${stat.bianSig}｜health双计保留 ${stat.healthDup}`);
console.log(`断言 ${checks} 条，失败 ${fail} 条`);
if (stat.mismatch === 0 && fail === 0) { console.log('RESULT: PASS'); process.exit(0); }
console.log('RESULT: FAIL'); process.exit(1);
