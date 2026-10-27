// 入墓双计专项审计（只读）
//
// 目的：查清规则「用神入墓」(基线 195 行 / 当前 203 行) 与「世爻入墓」(基线 242 行 / 当前 255 行)
//       是否对同一爻的同一入墓事实重复计分，并给出候选方案的反事实影响。
//
// 纪律：
//  - 不修改 app/** 任何文件；本脚本只读导入生产模块与原版模块。
//  - 不改权重、阈值、触发条件；候选方案只在内存里做反事实扣减。
//  - 分类与统计全部由本脚本现算，不读任何人工编辑的结果表。
//
// 运行：
//   node tools/score-verify-v2/tomb-audit/07_tomb-audit.mjs            # 全量 393,216 场景
//   node tools/score-verify-v2/tomb-audit/07_tomb-audit.mjs --quick    # 抽样自检（每 3 个月取 1）
//
// 产出（写入同目录）：
//   03_已知6例逐例复算.csv
//   04_全量场景审计.csv
//   05_全量统计报告.json
import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '../../..');
const QUICK = process.argv.includes('--quick');

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
const { judgeNajia } = await import(path.join(ROOT, 'app/js/verdict.js'));                                       // 生产（含①②③）
const { judgeNajia: judgeOrig } = await import(path.join(ROOT, 'tools/score-verify-v2/legacy/verdict.orig.mjs')); // 原版（无任何去重）
const { LEVEL_OF, LEVEL_CN } = await import(path.join(ROOT, 'tools/score-verify-v2/scripts/ref-apply.mjs'));

// ---- 与生产同口径的常量（从源码解析，避免另抄一份）----
const src = fs.readFileSync(path.join(ROOT, 'app/js/verdict.js'), 'utf8');
const DOMAIN_KEY = { career: '事业', wealth: '财运', love: '感情', health: '疾病', lost: '失物', people: '行人', decision: '合作', life: '其他' };
const SKIP_YONG_BODY = new Set(['health', 'decision', 'life', 'people']);
const DOMAINS = ['career', 'wealth', 'love', 'health', 'lost', 'decision', 'life', 'people'];
const MONTH_ZHI = ['寅', '卯', '辰', '巳', '午', '未', '申', '酉', '戌', '亥', '子', '丑'];
const WANG = new Set(['旺', '相']);
const SHUAI = new Set(['休', '囚', '死']);

// 十二长生墓库（与 liuyao-core.js CHANG_SHENG 表一致：土从火）
const MU = { 金: '丑', 木: '未', 水: '辰', 火: '戌', 土: '戌' };

// ---- 信号识别（按生产文案，不按权重猜）----
const RE_195 = /逢入墓——如人进了屋/;           // 用神入墓
const RE_242 = /^世爻入墓，人被困住/;            // 世爻入墓
const RE_LOST = /^财爻入墓——/;                  // lost 专项：财爻入墓
const RE_HEALTH = /^应爻（医生\/医院）空破墓绝/;  // health 专项：应爻空破墓绝
const RE_PEOPLE = /^用神墓绝空破/;               // people 专项：用神墓绝空破

// ---- 与生产同口径的取用复算（rank：持世8/发动4/不空破2/月日合1，平票取首）----
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

const esc = (s) => String(s ?? '').replace(/[,\r\n]/g, '、');

// 已知 6 例（戌月 love，来自 71 例专项复核清单）
const KNOWN6 = [[64, 'love'], [194, 'love'], [714, 'love'], [2274, 'love'], [2794, 'love'], [2664, 'love']];
const isKnown6 = (mask, monthZhi, domainId) => monthZhi === '戌' && domainId === 'love' && KNOWN6.some(([m, d]) => m === mask && d === domainId);

const cat = {
  A_195only: 0, B_242only: 0, C_both_sameOcc: 0, D_both_diffOcc: 0,
  E_diffYao: 0, F_sameYao_diffSrc: 0, G_withOtherMuRule: 0, H_blockedByDomain: 0,
};
const trans = {};   // 候选方案下的档位迁移
const rows = [];    // 04 CSV 行（仅 195 或 242 触发的场景）
const caseRows = []; // 03 已知 6 例明细

const total = { scanned: 0, legalPans: 0, t195: 0, t242: 0, both: 0, sameOccBoth: 0, diffOccBoth: 0, otherMuRule: 0, lostTriple: 0, sameObjBoth: 0 };
const cByMonth = {}, cByLingTai = {}, gBreak = { lost: 0, health: 0, people: 0 }, eFrom = { y195: 0, s242: 0 }, aFlipByDomain = {};
const dayZhiSeen = new Set();
const monthMuHit = {};   // 月支 → 入墓触发数
const bump = (k) => { trans[k] = (trans[k] || 0) + 1; };

let maskDone = 0;
let DAY_GAN = '', DAY_ZHI = '';
for (let mask = 0; mask < 4096; mask++) {
  const vals = [];
  for (let i = 0; i < 6; i++) vals.push([6, 7, 8, 9][(mask >> (i * 2)) & 3]);
  let probe;
  try { probe = core.paipan({ yaoValues: vals, gender: '男', question: 'x', year: 2026, month: 10, day: 26, hour: 17, minute: 35 }); } catch { continue; }
  if (!probe?.benGua?.name) continue;
  maskDone++;
  const dayGan = probe.siZhu.dayGanZhi[0], dayZhi = probe.siZhu.dayGanZhi[1];
  DAY_GAN = dayGan; DAY_ZHI = dayZhi;
  dayZhiSeen.add(dayZhi);

  for (let mi = 0; mi < 12; mi++) {
    const monthZhi = MONTH_ZHI[mi];
    if (QUICK && mi % 3 !== 0) continue;
    let pan;
    try { pan = core.paipan({ yaoValues: vals, gender: '男', question: 'x', year: 2026, month: 10, day: 26, hour: 17, minute: 35 }); } catch { continue; }
    if (!pan?.benGua?.name) continue;
    pan.siZhu.monthGanZhi = pan.siZhu.monthGanZhi[0] + monthZhi;
    pan.siZhu.dayGanZhi = dayGan + dayZhi;
    total.legalPans++;

    for (const domainId of DOMAINS) {
      const v = judgeNajia(pan, domainId);            // 生产（①②③）
      const lo = judgeOrig(pan, domainId);            // 原版
      const an = core.analyzeNajia(pan, { monthZhi, dayZhi, sex: pan.gender === '女' ? '女' : '男' });
      const { ys, occ, bodyCounts, yongIsShi } = recompute(an, domainId);
      const st = an.shi ? an.shi.occ.state : null;
      total.scanned++;

      const has = (re) => v.signals.some((s) => re.test(s.text));
      const sig195 = has(RE_195), sig242 = has(RE_242);
      const sigLost = domainId === 'lost' && has(RE_LOST);
      const sigHealth = domainId === 'health' && has(RE_HEALTH);
      const sigPeople = domainId === 'people' && has(RE_PEOPLE);
      const otherMuRule = sigLost || sigHealth || sigPeople;

      // 独立复算入墓事实与来源（不看 verdict 内部，自己按十二长生表算）
      const yWX = occ ? occ.state.wuXing : null;
      const sWX = st ? st.wuXing : null;
      const yMu = yWX ? MU[yWX] : null;
      const sMu = sWX ? MU[sWX] : null;
      const yMuMonth = !!yMu && yMu === monthZhi;
      const yMuDay = !!yMu && yMu === dayZhi;
      const sMuMonth = !!sMu && sMu === monthZhi;
      const sMuDay = !!sMu && sMu === dayZhi;
      const sameYao = !!(occ && an.shi && occ.pos === an.shi.occ.pos);

      // 自算与生产信号一致性断言（防止口径漂移）
      if (bodyCounts && sameYao) {
        const expect195 = !!(yMuMonth || yMuDay);
        if (expect195 !== sig195) {
          console.error(`口径不一致 mask${mask} ${monthZhi}月 ${domainId}: 自算195=${expect195} 生产=${sig195}`);
          process.exitCode = 2;
        }
        if ((sMuMonth || sMuDay) !== sig242) {
          console.error(`口径不一致 mask${mask} ${monthZhi}月 ${domainId}: 自算242=${sMuMonth || sMuDay} 生产=${sig242}`);
          process.exitCode = 2;
        }
      }

      if (sig195) total.t195++;
      if (sig242) total.t242++;
      if (sig195 && sig242) total.both++;
      if (sig195 && sig242 && yongIsShi) total.sameOccBoth++;
      if (sig195 && sig242 && !yongIsShi) total.diffOccBoth++;
      if (sig195 && sig242 && occ === an.shi.occ) total.sameObjBoth++;
      if (otherMuRule) total.otherMuRule++;

      // ---- 分类 ----
      let catKey = null;
      if (sig195 && sig242) {
        if (yongIsShi && sameYao) {
          const srcDiff = (yMuMonth !== sMuMonth) || (yMuDay !== sMuDay);
          catKey = srcDiff ? 'F_sameYao_diffSrc' : 'C_both_sameOcc';
        } else if (sameYao) catKey = 'F_sameYao_diffSrc';
        else catKey = 'D_both_diffOcc';
      } else if (sig195) catKey = 'A_195only';
      else if (sig242) catKey = 'B_242only';
      if (catKey) cat[catKey]++;
      if (catKey === 'C_both_sameOcc') {
        cByMonth[monthZhi] = (cByMonth[monthZhi] || 0) + 1;
        const lt = occ.state.lingTai;
        cByLingTai[lt] = (cByLingTai[lt] || 0) + 1;
      }
      if (sigLost) gBreak.lost++;
      if (sigHealth) gBreak.health++;
      if (sigPeople) gBreak.people++;
      // E：两条规则涉及不同爻（D 的子集，独立计数）
      if (sig195 && sig242 && !sameYao) cat.E_diffYao++;
      // G：同时存在其他入墓相关规则
      if (catKey && otherMuRule) cat.G_withOtherMuRule++;
      // H：因域过滤导致 195 本应触发却不触发（用神本体块被 skip 的域）
      if (!sig195 && SKIP_YONG_BODY.has(domainId) && yMu && (yMuMonth || yMuDay)) cat.H_blockedByDomain++;

      if (sig195 || sig242) {
        const base = v.score;
        const L = v.level;
        const drop242 = (sig195 && sig242 && sameYao) ? base + 1 : base;
        const drop195 = (sig195 && sig242 && sameYao) ? base + 1 : base;
        const muWangSuppress = (() => {
          let s = base;
          if (sig195 && WANG.has(occ.state.lingTai)) s += 1;
          if (sig242 && st && WANG.has(st.lingTai)) s += 1;
          return s;
        })();
        const dropBoth = base + (sig195 ? 1 : 0) + (sig242 ? 1 : 0);
        const mk = (s) => `${L}${LEVEL_CN[L]}→${LEVEL_OF(s)}${LEVEL_CN[LEVEL_OF(s)]}`;
        if (drop242 !== base) { bump(`A:${mk(drop242)}`); if (LEVEL_OF(drop242) !== L) aFlipByDomain[domainId] = (aFlipByDomain[domainId] || 0) + 1; }
        if (drop195 !== base) { bump(`A2:${mk(drop195)}`); }
        if (muWangSuppress !== base) { bump(`E:${mk(muWangSuppress)}`); }
        if (sig195 && WANG.has(occ.state.lingTai) && base + 1 !== base) eFrom.y195++;
        if (sig242 && st && WANG.has(st.lingTai)) eFrom.s242++;
        if (dropBoth !== base) { bump(`X:${mk(dropBoth)}`); }

        rows.push({
          month: monthZhi, mask, domain: domainId,
          ben: pan.benGua.name, bian: pan.bianGua ? pan.bianGua.name : '',
          yongQin: occ ? occ.liuQin : '', yongPos: occ ? occ.pos : '', shiPos: an.shi ? an.shi.occ.pos : '',
          yongIsShi: yongIsShi ? 1 : 0, yongWX: yWX || '', shiWX: sWX || '',
          muYong: yMu || '', muShi: sMu || '',
          muSrc: [yMuMonth ? '月' : '', yMuDay ? '日' : ''].join('/'),
          sig195: sig195 ? 1 : 0, sig242: sig242 ? 1 : 0,
          cat: catKey || '', otherMuRule: otherMuRule ? [sigLost && 'lost财爻入墓', sigHealth && 'health应爻墓绝', sigPeople && 'people用神墓绝'].filter(Boolean).join('+') : '',
          prodScore: base, prodLevel: L,
          origScore: lo.score, origLevel: lo.level,
          drop242Score: drop242, drop242Level: LEVEL_OF(drop242),
          drop195Score: drop195, drop195Level: LEVEL_OF(drop195),
          muWangScore: muWangSuppress, muWangLevel: LEVEL_OF(muWangSuppress),
          dropBothScore: dropBoth, dropBothLevel: LEVEL_OF(dropBoth),
          flipA: LEVEL_OF(drop242) !== L ? 1 : 0,
          flipA2: LEVEL_OF(drop195) !== L ? 1 : 0,
          flipE: LEVEL_OF(muWangSuppress) !== L ? 1 : 0,
          flipX: LEVEL_OF(dropBoth) !== L ? 1 : 0,
        });

        if (isKnown6(mask, monthZhi, domainId)) {
          caseRows.push({
            case_id: `${monthZhi}|${mask}|${domainId}`,
            mask, month: monthZhi, domain: domainId,
            dayGanZhi: dayGan + dayZhi,
            ben: pan.benGua.name, bian: pan.bianGua ? pan.bianGua.name : '',
            yongQin: occ ? occ.liuQin : '', yongPos: occ ? occ.pos : '', yongNaJia: occ ? occ.naJia : '',
            yongWX: yWX, shiPos: an.shi ? an.shi.occ.pos : '', shiWX: sWX,
            yongIsShi: yongIsShi ? 1 : 0, muYong: yMu, muShi: sMu,
            muSrcYong: [yMuMonth ? '月建' : '', yMuDay ? '日辰' : ''].filter(Boolean).join('+'),
            lingTai: occ ? occ.state.lingTai : '',
            sig195, sig242,
            prodScore: base, prodLevel: L,
            origScore: lo.score, origLevel: lo.level,
            drop242Score: drop242, drop195Score: drop195, muWangScore: muWangSuppress, dropBothScore: dropBoth,
            signals: v.signals.map((s) => `${s.w}|${s.text}`),
            origSignals: lo.signals.map((s) => `${s.w}|${s.text}`),
          });
        }
      }
    }
  }
  if (mask % 512 === 0) process.stderr.write(`\r扫描 ${maskDone}/4096 盘，场景 ${total.scanned}`);
}

process.stderr.write('\n');

// ---- 写 04 ----
const cols04 = ['month', 'mask', 'domain', 'ben', 'bian', 'yongQin', 'yongPos', 'shiPos', 'yongIsShi', 'yongWX', 'shiWX', 'muYong', 'muShi', 'muSrc', 'sig195', 'sig242', 'cat', 'otherMuRule', 'prodScore', 'prodLevel', 'origScore', 'origLevel', 'drop242Score', 'drop242Level', 'drop195Score', 'drop195Level', 'muWangScore', 'muWangLevel', 'dropBothScore', 'dropBothLevel', 'flipA', 'flipA2', 'flipE', 'flipX'];
fs.writeFileSync(path.join(__dirname, '04_全量场景审计.csv'), cols04.join(',') + '\n' + rows.map((r) => cols04.map((c) => esc(r[c])).join(',')).join('\n') + '\n');

// ---- 写 03 ----
const cols03 = ['case_id', 'month', 'mask', 'domain', 'dayGanZhi', 'ben', 'bian', 'yongQin', 'yongPos', 'yongNaJia', 'yongWX', 'shiPos', 'shiWX', 'yongIsShi', 'muYong', 'muShi', 'muSrcYong', 'lingTai', 'sig195', 'sig242', 'origScore', 'origLevel', 'prodScore', 'prodLevel', 'drop242Score', 'drop195Score', 'muWangScore', 'dropBothScore', 'signals', 'origSignals'];
fs.writeFileSync(path.join(__dirname, '03_已知6例逐例复算.csv'), cols03.join(',') + '\n' + caseRows.map((r) => cols03.map((c) => esc(Array.isArray(r[c]) ? r[c].join(' ; ') : r[c])).join(',')).join('\n') + '\n');

// ---- 写 05 ----
const out = {
  generatedAt: new Date().toISOString(),
  baseline: { branch: 'main', head: process.env.AUDIT_HEAD || '', verdictSha: process.env.AUDIT_SHA || '' },
  method: '生产 judgeNajia（①②③）与原版 judgeOrig 双引擎对同一场景实算；入墓事实按十二长生墓库表独立复算并与生产信号交叉校验；候选方案只在内存中做反事实扣减，不落盘改码。',
  scenarioSpace: {
    masks: 4096, months: MONTH_ZHI.length, domains: DOMAINS.length,
    legalPans: total.legalPans, scanned: total.scanned,
    fixedDayGanZhi: DAY_GAN + DAY_ZHI,
    coverageBoundary: [
      '日辰固定为起盘日（癸酉），且酉不属于任何五行的墓库（辰戌丑未），故本测试空间中「日墓」永不成立，入墓 100% 来自月建。',
      '因此「同一爻不同来源入墓」（月墓+日墓并存）在现有测试空间内不可构造，情况C/F 只能标记为覆盖不足。',
      '月支 12 值、六爻动静 4096 组合、8 个问事域全枚举；未覆盖真实随机日辰、旬空旬首随日变化、以及人工指定变卦。',
    ],
  },
  counts: total,
  categories: cat,
  catC_detail: { byMonth: cByMonth, byLingTai: cByLingTai, sameObjectIdentity: total.sameObjBoth },
  gBreakdown: gBreak,
  candA_flipByDomain: aFlipByDomain,
  candE_suppressSide: eFrom,
  levelTransitions: trans,
  muByMonth: monthMuHit,
  rowsIn04: rows.length,
  known6: caseRows.map((c) => ({ case_id: c.case_id, origScore: c.origScore, prodScore: c.prodScore, prodLevel: c.prodLevel, drop242: c.drop242Score, drop195: c.drop195Score, muWang: c.muWangScore, dropBoth: c.dropBothScore })),
};
fs.writeFileSync(path.join(__dirname, '05_全量统计报告.json'), JSON.stringify(out, null, 2));

console.log(`扫描场景 ${total.scanned}（合法盘 ${total.legalPans}）`);
console.log(`195 触发 ${total.t195}｜242 触发 ${total.t242}｜双触发 ${total.both}（同爻 ${total.sameOccBoth}／不同爻 ${total.diffOccBoth}）`);
console.log('分类：', JSON.stringify(cat));
console.log('候选方案档位迁移：', JSON.stringify(trans, null, 0));
console.log(`04 行数 ${rows.length}｜03 行数 ${caseRows.length}`);
if (process.exitCode === 2) console.error('!! 存在口径不一致，见上方错误行');
