// L1 第一批 · 改前/改后评分快照对比工具
//
// 目的：把本批 4 类改动造成的每一处评分变化量化、归因。
//   P1-1 六冲卦名单补 2（天雷无妄、雷天大壮）
//   P1-2 六合卦名单改正（3 出 3 入）
//   P2-a 月破破即失气（月破+旺 → 压为休：去掉错误的 +2 旺相分，月破 -3 照计）
//   P2-b 休态静爻被日冲归日破（riPo = riChong && 非旺相）
//
// 枚举与 tools/score-regression.mjs 完全相同的空间：
//   4096 个六爻 mask × 12 月令 × 8 域（固定 2026-10-26 17:35 的日辰），合法盘全量。
//
// 用法：
//   node tools/score-verify-v2/l1-fix/scripts/score-snapshot.mjs --out=path.json [--tag=PRE|POST]
//   node tools/score-verify-v2/l1-fix/scripts/score-snapshot.mjs --diff=A.json --diff=B.json
//
// 每条判读保存紧凑签名：score/level + signals 的 (w, ruleId) 列表 + 受关注标签计数。
// 独立预期来源：不依赖被测代码生成"应该得几分"，只做改前改后 A/B 对照，
// 差异归因由 diff 模式按规则 ID 与卦名分类，再由报告引用古法依据。

import path from 'node:path';
import { fileURLToPath } from 'node:url';
import fs from 'node:fs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '../../../..');

// ---- 最小 DOM stub（verdict.js / state.js 需要，与 score-regression 一致）----
globalThis.document = {
  addEventListener() {}, querySelector: () => null, getElementById: () => null, querySelectorAll: () => [],
  head: { appendChild() {} },
  body: { appendChild() {}, classList: { add() {}, remove() {} } },
  createElement: () => ({ style: {}, classList: { add() {}, remove() {} }, appendChild() {}, setAttribute() {} }),
};
globalThis.window = globalThis;
globalThis.localStorage = { getItem: () => null, setItem() {}, removeItem() {} };

const core = await import(path.join(ROOT, 'app/vendor/liuyao-core.js'));
const { judgeNajia } = await import(path.join(ROOT, 'app/js/verdict.js'));

const DOMAINS = ['career', 'wealth', 'love', 'health', 'lost', 'decision', 'life', 'people'];
const MONTH_ZHI = ['寅', '卯', '辰', '巳', '午', '未', '申', '酉', '戌', '亥', '子', '丑'];

function arg(name) {
  const a = process.argv.find((x) => x.startsWith(`--${name}=`));
  return a ? a.split('=').slice(1).join('=') : null;
}

// ============ diff 模式 ============
const dA = arg('diffA') || (process.argv.find((x) => x.startsWith('--diff=')) ? process.argv.filter((x) => x.startsWith('--diff='))[0].split('=')[1] : null);
const dB = arg('diffB');
if (dA && dB) {
  const A = JSON.parse(fs.readFileSync(dA, 'utf8'));
  const B = JSON.parse(fs.readFileSync(dB, 'utf8'));
  const keys = new Set([...Object.keys(A.rows), ...Object.keys(B.rows)]);
  const diffs = [];
  const gSame = (a, b) => a.length === b.length && a.every((x, i) => x === b[i]);
  for (const k of keys) {
    const a = A.rows[k], b = B.rows[k];
    if (!a || !b) { diffs.push({ k, reason: a ? 'onlyA' : 'onlyB' }); continue; }
    if (a.s !== b.s || a.l !== b.l || !gSame(a.g, b.g)) diffs.push({ k, pre: a, post: b });
  }

  // ---- 独立事实重算：paipan 重算卦名、lingTaiOf（未改动的纯历法函数）算用神原始旺衰态 ----
  const ZHI_WX = { 子: '水', 丑: '土', 寅: '木', 卯: '木', 辰: '土', 巳: '火', 午: '火', 未: '土', 申: '金', 酉: '金', 戌: '土', 亥: '水' };
  const CHONG = { 子: '午', 午: '子', 丑: '未', 未: '丑', 寅: '申', 申: '寅', 卯: '酉', 酉: '卯', 辰: '戌', 戌: '辰', 巳: '亥', 亥: '巳' };
  // 修复前 verdict 旧名单（审计基线）
  const OLD_CHONG = ['乾为天', '坤为地', '坎为水', '离为火', '震为雷', '艮为山', '巽为风', '兑为泽'];
  const OLD_HE = ['地天泰', '雷地豫', '火地晋', '水泽节', '山雷颐', '地雷复', '泽水困', '地泽临'];
  const NEW_CHONG = ['乾为天', '坤为地', '坎为水', '离为火', '震为雷', '艮为山', '巽为风', '兑为泽', '天雷无妄', '雷天大壮'];
  const NEW_HE = ['地雷复', '地天泰', '雷地豫', '水泽节', '泽水困', '山火贲', '火山旅', '天地否'];
  const YS_KEY = { career: '事业', wealth: '财运', love: '感情', health: '疾病', lost: '失物', people: '行人', decision: '合作', life: '其他' };
  const facts = {}; // k -> 事实位标记
  for (let mask = 0; mask < 4096; mask++) {
    const vals = [];
    for (let i = 0; i < 6; i++) vals.push([6, 7, 8, 9][(mask >> (i * 2)) & 3]);
    let probe;
    try { probe = core.paipan({ yaoValues: vals, gender: '男', question: 'x', year: 2026, month: 10, day: 26, hour: 17, minute: 35 }); } catch { continue; }
    if (!probe?.benGua?.name) continue;
    const dayGan = probe.siZhu.dayGanZhi[0], dayZhi = probe.siZhu.dayGanZhi[1];
    for (const monthZhi of MONTH_ZHI) {
      const pan = core.paipan({ yaoValues: vals, gender: '男', question: 'x', year: 2026, month: 10, day: 26, hour: 17, minute: 35 });
      pan.siZhu.monthGanZhi = pan.siZhu.monthGanZhi[0] + monthZhi;
      pan.siZhu.dayGanZhi = dayGan + dayZhi;
      const ben = pan.benGua.name, bian = pan.bianGua ? pan.bianGua.name : null;
      const guaSwitch = {
        benChong: OLD_CHONG.includes(ben) !== NEW_CHONG.includes(ben) && NEW_CHONG.includes(ben), // 新进入六冲
        benChongOut: OLD_CHONG.includes(ben) !== NEW_CHONG.includes(ben) && OLD_CHONG.includes(ben),
        benHe: OLD_HE.includes(ben) !== NEW_HE.includes(ben) && NEW_HE.includes(ben),
        benHeOut: OLD_HE.includes(ben) !== NEW_HE.includes(ben) && OLD_HE.includes(ben),
      };
      // 变卦组合（六冲变六合 / 六合变六冲）的新旧切换
      guaSwitch.c2h = (NEW_CHONG.includes(ben) && NEW_HE.includes(bian)) !== (OLD_CHONG.includes(ben) && OLD_HE.includes(bian));
      guaSwitch.h2c = (NEW_HE.includes(ben) && NEW_CHONG.includes(bian)) !== (OLD_HE.includes(ben) && OLD_CHONG.includes(bian));
      const an = core.analyzeNajia(pan, { monthZhi, dayZhi, sex: '男' });
      for (const domainId of DOMAINS) {
        const f = {
          // —— 卦象名单切换（独立事实：paipan 卦名 vs 新旧名单）——
          benChongNew: NEW_CHONG.includes(ben), benChongOld: OLD_CHONG.includes(ben),
          benHeNew: NEW_HE.includes(ben), benHeOld: OLD_HE.includes(ben),
          bianChongNew: NEW_CHONG.includes(bian), bianChongOld: OLD_CHONG.includes(bian),
          bianHeNew: NEW_HE.includes(bian), bianHeOld: OLD_HE.includes(bian),
          // —— 失气/日破事实面（独立：lingTaiOf 原始态 + 冲支）——
          yongWangPo: false, yongXiuChong: false,
          anyWangPoLine: false,   // 卦中是否存在原始旺/相且月破的静爻（verdict 任何旺衰消费点都可能被波及）
          anyXiuChongLine: false, // 卦中是否存在原始休态且被日冲的静爻
          useYing: false,
        };
        // 全卦扫描：明爻（含动爻）+ 伏神——覆盖 verdict 所有旺衰消费点
        // （用神/原神/忌神 wangDong、世应、伏神旺衰、life/lost 旺相判定等）
        for (const ln of an.lines) {
          const raw = core.lingTaiOf(ln.state.wuXing, ZHI_WX[monthZhi]);
          if ((raw === '旺' || raw === '相') && ln.state.yuePo) f.anyWangPoLine = true;
          // 日冲/日破只对静爻成立（riChong = !moving）
          if (!ln.moving && raw === '休' && CHONG[dayZhi] === ln.yao.zhi) f.anyXiuChongLine = true;
        }
        for (const q of Object.values(an.byLiuQin)) {
          for (const o of q) {
            if (!o.hidden) continue;
            const raw = core.lingTaiOf(o.state.wuXing, ZHI_WX[monthZhi]);
            if ((raw === '旺' || raw === '相') && o.state.yuePo) f.anyWangPoLine = true;
            if (raw === '休' && CHONG[dayZhi] === o.yao.zhi) f.anyXiuChongLine = true;
          }
        }
        const ys = an.yongshen[YS_KEY[domainId]];
        if (ys && !ys.useYing && ys.occurrences) {
          const pool = ys.occurrences.filter((o) => !o.hidden);
          if (pool.length) {
            const rank = (o) => (o.shi ? 8 : 0) + (o.moving ? 4 : 0) + (!o.state.xunKong && !o.state.yuePo ? 2 : 0) + (o.state.yueHe || o.state.riHe ? 1 : 0);
            const mx = Math.max(...pool.map(rank));
            const y = pool.filter((o) => rank(o) === mx)[0];
            if (y?.state) {
              const raw = core.lingTaiOf(y.state.wuXing, ZHI_WX[monthZhi]);
              f.yongWangPo = (raw === '旺' || raw === '相') && y.state.yuePo;
              f.yongXiuChong = raw === '休' && !y.yao.moving && CHONG[dayZhi] === y.yao.zhi;
            }
          }
        } else if (ys?.useYing) f.useYing = true;
        facts[`${mask}|${monthZhi}|${domainId}`] = f;
      }
    }
  }

  // ---- 归因 ----
  // 主键：信号 rule id。本批只允许三类 id 发生变化：
  //   liuhunhun（love 卦象/people 行人）→ 卦名单；wangxiang → 月破失气；ribo/andong → 休态归日破。
  // 出现任何其他 id 差异（如 chishi）必须能用「该爻旺衰态因失气翻转」解释，否则 other。
  const GUA_DOMAINS = new Set(['love', 'people']);
  const bucket = { chong_gua: 0, he_gua: 0, yuepo_wang: 0, xiutai_ribo: 0, gua_mixed: 0, state_mixed: 0, all_mixed: 0, other: 0, only: 0 };
  const byDomain = {};
  const levelFlip = { up: 0, down: 0 };
  const scoreDelta = {};
  const otherIdStats = {};
  // 桶 × 变化类型 交叉表：区分「分数/档位变化」与「仅信号构成变化（分数档位不变）」
  const crossTab = {};
  const examples = { chong_gua: [], he_gua: [], yuepo_wang: [], xiutai_ribo: [], gua_mixed: [], state_mixed: [], all_mixed: [], other: [] };
  for (const d of diffs) {
    if (d.reason) { bucket.only++; (examples.other.length < 5) && examples.other.push({ k: d.k, reason: d.reason }); continue; }
    const f = facts[d.k];
    const [, , domain] = d.k.split('|');
    byDomain[domain] = (byDomain[domain] || 0) + 1;
    if (d.post.l !== d.pre.l) { if (d.post.l > d.pre.l) levelFlip.up++; else levelFlip.down++; }
    const ds = d.post.s - d.pre.s;
    scoreDelta[ds] = (scoreDelta[ds] || 0) + 1;
    // 多重集差：同一 (w:id) 可能多次出现，按计数比较而不是 Set
    const count = (arr) => arr.reduce((m, x) => (m[x] = (m[x] || 0) + 1, m), {});
    const ca = count(d.pre.g), cb = count(d.post.g);
    const added = [], removed = [];
    for (const [x, n] of Object.entries(cb)) for (let i = 0; i < n - (ca[x] || 0); i++) added.push(x);
    for (const [x, n] of Object.entries(ca)) for (let i = 0; i < n - (cb[x] || 0); i++) removed.push(x);
    const idOf = (x) => x.split(':')[1];
    const ids = new Set([...added.map(idOf), ...removed.map(idOf)]);
    // people 域行人六冲卦信号（verdict 行人章本卦六冲 -1，rule id=xingren）归六冲名单桶
    const guaExtra = domain === 'people' && new Set([...ids]).has('xingren') && (f.benChongNew !== f.benChongOld);
    const stateIds = new Set([...ids].filter((x) => x === 'wangxiang' || x === 'ribo' || x === 'andong'));
    const guaIds = new Set([...ids].filter((x) => x === 'liuhunhun' || guaExtra));
    const otherIds = new Set([...ids].filter((x) => x !== 'wangxiang' && x !== 'ribo' && x !== 'andong' && x !== 'liuhunhun' && !(guaExtra && x === 'xingren')));

    // 卦象类必须落在 love/people 且卦名事实确实发生新旧名单切换
    const benSwitched = f.benChongNew !== f.benChongOld || f.benHeNew !== f.benHeOld;
    const bianSwitched = (f.benChongNew && f.bianHeNew) !== (f.benChongOld && f.bianHeOld) ||
                         (f.benHeNew && f.bianChongNew) !== (f.benHeOld && f.bianChongOld);
    const guaFactOk = GUA_DOMAINS.has(domain) && (benSwitched || bianSwitched);
    // 旺衰/日破类必须卦中确实存在对应事实面（任一旺衰消费点被波及都成立）
    const stateFactOk = f.anyWangPoLine || f.anyXiuChongLine;

    let cat;
    const hasState = stateIds.size > 0;
    const hasGua = guaIds.size > 0;
    if (otherIds.size > 0) {
      // 允许的"其他 id"：旺衰衍生信号——chishi（持世）、shituo（失物财爻持世/旺相未散/休囚，
      // verdict 439-441 行按 lingTai 分支）等，只要同行信号含 wangxiang 且卦中确有失气面即可解释
      const DERIVED = new Set(['chishi', 'shituo', 'xingren', 'zisunzhiguan']);
      const allowed = [...otherIds].every((x) => DERIVED.has(x)) && (stateIds.has('wangxiang') || added.concat(removed).some((x) => idOf(x) === 'wangxiang')) && f.anyWangPoLine;
      cat = allowed ? (hasGua ? 'all_mixed' : 'yuepo_wang') : 'other';
      if (allowed && !hasGua) stateIds.add('wangxiang'); // 归到失气桶
    } else if (hasState && hasGua) cat = 'all_mixed';
    else if (hasGua) {
      if (!guaFactOk) cat = 'other';
      else {
        // 细分六冲 / 六合：看切换方向
        const chongDir = f.benChongNew !== f.benChongOld || (f.benChongNew && f.bianHeNew) !== (f.benChongOld && f.bianHeOld);
        const heDir = f.benHeNew !== f.benHeOld || (f.benHeNew && f.bianChongNew) !== (f.benHeOld && f.bianChongOld);
        cat = (heDir && !chongDir) ? 'he_gua' : (chongDir && !heDir ? 'chong_gua' : 'gua_mixed');
      }
    } else if (hasState) {
      // 失气 vs 日破：信号面含 ribo/andong 且卦中有休态日冲→日破桶；否则失气桶；两者都有→state_mixed
      const ri = stateIds.has('ribo') || stateIds.has('andong');
      cat = ri && f.anyWangPoLine && f.anyXiuChongLine ? 'state_mixed'
          : ri && !f.anyWangPoLine ? 'xiutai_ribo'
          : (f.anyWangPoLine ? 'yuepo_wang' : 'other');
    } else cat = 'other';
    bucket[cat]++;
    {
      const ct = crossTab[cat] || (crossTab[cat] = { total: 0, scoreChanged: 0, levelChanged: 0, scoreOrLevel: 0, sigOnly: 0 });
      ct.total++;
      const sCh = d.post.s !== d.pre.s, lCh = d.post.l !== d.pre.l;
      if (sCh) ct.scoreChanged++;
      if (lCh) ct.levelChanged++;
      if (sCh || lCh) ct.scoreOrLevel++; else ct.sigOnly++;
    }
    if (cat === 'other') {
      for (const x of [...added, ...removed]) {
        const id = x.split(':')[1];
        otherIdStats[id] = (otherIdStats[id] || 0) + 1;
      }
    }
    const ex = { k: d.k, pre: [d.pre.s, d.pre.l], post: [d.post.s, d.post.l], delta: ds, added, removed, facts: f };
    if (examples[cat].length < 8) examples[cat].push(ex);
  }

  const unexpected = bucket.other;
  const report = {
    mode: 'diff',
    a: { tag: A.tag, generatedAt: A.generatedAt, rows: A.stats },
    b: { tag: B.tag, generatedAt: B.generatedAt, rows: B.stats },
    totalKeys: keys.size,
    changed: diffs.filter((d) => !d.reason).length,
    onlyA: diffs.filter((d) => d.reason === 'onlyA').length,
    onlyB: diffs.filter((d) => d.reason === 'onlyB').length,
    bucket,
    unexpectedOther: unexpected,
    otherIdStats,
    attributionComplete: unexpected === 0,
    scoreDelta,
    byDomain,
    levelFlip,
    crossTab,
    totalScoreOrLevelChanged: Object.values(crossTab).reduce((a, c) => a + c.scoreOrLevel, 0),
    examples,
  };
  console.log(JSON.stringify(report, null, 2));
  process.exit(unexpected === 0 ? 0 : 3);
}

// ============ 快照模式 ============
const outPath = arg('out');
const tag = arg('tag') || 'SNAP';
if (!outPath) { console.error('需要 --out=path.json'); process.exit(2); }

const rows = {};
const stats = { legal: 0, pans: 0 };
const watch = {
  yuepo_and_wang: 0,   // 月破且得 +2 旺相（本批应消失或转为休态）
  xiutai_riChong: 0,   // 休态静爻被日冲（本批应归日破）
};

for (let mask = 0; mask < 4096; mask++) {
  const vals = [];
  for (let i = 0; i < 6; i++) vals.push([6, 7, 8, 9][(mask >> (i * 2)) & 3]);
  let probe;
  try { probe = core.paipan({ yaoValues: vals, gender: '男', question: 'x', year: 2026, month: 10, day: 26, hour: 17, minute: 35 }); } catch { continue; }
  if (!probe?.benGua?.name) continue;
  const dayGan = probe.siZhu.dayGanZhi[0], dayZhi = probe.siZhu.dayGanZhi[1];

  for (let mi = 0; mi < 12; mi++) {
    const monthZhi = MONTH_ZHI[mi];
    let pan;
    try { pan = core.paipan({ yaoValues: vals, gender: '男', question: 'x', year: 2026, month: 10, day: 26, hour: 17, minute: 35 }); } catch { continue; }
    if (!pan?.benGua?.name) continue;
    pan.siZhu.monthGanZhi = pan.siZhu.monthGanZhi[0] + monthZhi;
    pan.siZhu.dayGanZhi = dayGan + dayZhi;
    stats.legal++;

    for (const domainId of DOMAINS) {
      const v = judgeNajia(pan, domainId);
      stats.pans++;
      const sig = v.signals.map((s) => `${s.w}:${s.rule?.id ?? '-'}`);
      rows[`${mask}|${monthZhi}|${domainId}`] = {
        s: v.score, l: v.level, g: sig,
      };
      // 关注项（用 analyzeNajia 独立看事实标签）
      const an = core.analyzeNajia(pan, { monthZhi, dayZhi, sex: '男' });
      const ysKey = { career: '事业', wealth: '财运', love: '感情', health: '疾病', lost: '失物', people: '行人', decision: '合作', life: '其他' }[domainId];
      const ys = an.yongshen[ysKey] || an.yongshen['其他'];
      if (ys && !ys.useYing && ys.occurrences) {
        const pool = ys.occurrences.filter((o) => !o.hidden);
        if (pool.length) {
          const rank = (o) => (o.shi ? 8 : 0) + (o.moving ? 4 : 0) + (!o.state.xunKong && !o.state.yuePo ? 2 : 0) + (o.state.yueHe || o.state.riHe ? 1 : 0);
          const mx = Math.max(...pool.map(rank));
          const y = pool.filter((o) => rank(o) === mx)[0];
          if (y && y.state) {
            if (y.state.yuePo && (y.state.lingTai === '旺' || y.state.lingTai === '相')) watch.yuepo_and_wang++;
            if (y.state.riChong && y.state.lingTai === '休' && !y.state.anDong && !y.state.riPo) watch.xiutai_riChong++;
          }
        }
      }
    }
  }
}

const payload = {
  tag,
  generatedAt: new Date().toISOString(),
  vendorSha: (() => { try { return require?.('crypto')?.createHash?.('sha256')?.update(fs.readFileSync(path.join(ROOT, 'app/vendor/liuyao-core.js')))?.digest('hex')?.slice(0, 16); } catch { return null; } })(),
  stats,
  watch,
  rows,
};
fs.writeFileSync(outPath, JSON.stringify(payload));
console.log(`[snapshot] tag=${tag} legal=${stats.legal} pans=${stats.pans} → ${outPath}`);
console.log(`[watch] 月破且旺相(用神)=${watch.yuepo_and_wang}  休态日冲未标(用神)=${watch.xiutai_riChong}`);
