// 组合影响矩阵：V2（verdict 层去重）× L0（排盘/卦表修复）× L1（本批名单+失气+日破）
//
// 目的（对应董事长复核指令第 5 项）：把三类改动各自的影响与组合影响分开统计，
// 避免把旧算法基线差异误报为新回归，也避免把"预期变化"直接当成"正确性证明"。
//
// 两个正交维度：
//   vendor 层（liuyao-core）：v0 = 0ed9e89 产物；l0 = 仅 L0（constants/guaTable/paipan）；
//                            l1 = 仅 L1（wangshuai 失气+日破）；cur = L0+L1（当前 src 构建）
//   verdict 层（app/js）：legacy = V2 之前；v2 = V2 之后、L1 名单之前
//
// 枚举空间与 tools/score-regression.mjs 一致：4096 mask × 12 月令 × 8 域 = 393216。
// 每格只记录 (score, level)，用于两两比较。
//
// 用法：node tools/score-verify-v2/l1-review/scripts/combine-matrix.mjs --out=path.json
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import fs from 'node:fs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '../../../..');

globalThis.document = {
  addEventListener() {}, querySelector: () => null, getElementById: () => null, querySelectorAll: () => [],
  head: { appendChild() {} },
  body: { appendChild() {}, classList: { add() {}, remove() {} } },
  createElement: () => ({ style: {}, classList: { add() {}, remove() {} }, appendChild() {}, setAttribute() {} }),
};
globalThis.window = globalThis;
globalThis.localStorage = { getItem: () => null, setItem() {}, removeItem() {} };

const arg = (n) => { const a = process.argv.find((x) => x.startsWith(`--${n}=`)); return a ? a.split('=').slice(1).join('=') : null; };

const DOMAINS = ['career', 'wealth', 'love', 'health', 'lost', 'decision', 'life', 'people'];
const MONTH_ZHI = ['寅', '卯', '辰', '巳', '午', '未', '申', '酉', '戌', '亥', '子', '丑'];
const N = 4096 * 12 * 8;

const VENDORS = {
  v0: '/tmp/vendor-pre.mjs',                       // L0 前 + L1 前（0ed9e89 线上基线）
  l0: '/tmp/vout-L0/index.js',                     // 仅 L0
  l1: '/tmp/vout-L1/index.js',                     // 仅 L1
  cur: path.join(ROOT, 'app/vendor/liuyao-core.js'), // L0 + L1（当前）
};
const VERDICTS = {
  legacy: path.join(ROOT, 'tools/score-verify-v2/legacy/verdict.orig.mjs'),      // V2 之前
  v2: path.join(ROOT, 'tools/score-verify-v2/l1-review/legacy/verdict-v2.mjs'),  // V2 之后（旧名单）
  cur: path.join(ROOT, 'app/js/verdict.js'),                                     // 当前（V2 + 新名单）
};

// 生成"指定 vendor + 指定 verdict"的组合模块。
// 必须落在 app/js/ 下，才能让 `./state.js` 这类相对 import 继续成立。
function makeCombo(vKey, dKey) {
  const vPath = VENDORS[vKey];
  if (!fs.existsSync(vPath)) throw new Error(`缺少 vendor 产物：${vPath}`);
  let src = fs.readFileSync(VERDICTS[dKey], 'utf8');
  const vendorUrl = pathToFileURL(vPath).href;
  const before = src;
  // 两个 verdict 副本的 import 层级不同（legacy 在 tools/ 下用 ../../../app/），
  // 故按"结尾匹配 liuyao-core.js / state.js"统一改写，落到 app/js/ 下后相对路径仍成立。
  src = src.replace(/from '[^']*state\.js[^']*'/, `from './state.js?v=121'`);
  src = src.replace(/from '[^']*liuyao-core\.js[^']*'/, `from '${vendorUrl}'`);
  if (src === before) throw new Error(`verdict 源码里未找到 vendor import：${VERDICTS[dKey]}`);
  const out = path.join(ROOT, 'app/js', `.tmpcomb-${dKey}-${vKey}.mjs`);
  fs.writeFileSync(out, src);
  return out;
}

const combos = [];
for (const vKey of Object.keys(VENDORS)) {
  for (const dKey of Object.keys(VERDICTS)) {
    const f = makeCombo(vKey, dKey);
    const mod = await import(pathToFileURL(f).href + '?t=' + Date.now());
    combos.push({ id: `${dKey}+${vKey}`, vKey, dKey, judge: mod.judgeNajia });
    fs.rmSync(f, { force: true });
  }
}
console.error(`[combos] ${combos.map((c) => c.id).join('  ')}`);

// 每个组合跑一遍全枚举。pan/analyzeNajia 来自该组合自己的 vendor 实例，
// 保证 L0（排盘/卦表）与 L1（旺衰）的影响都真实进入。
const results = {};
for (const c of combos) {
  const core = await import(pathToFileURL(VENDORS[c.vKey]).href + '?t=' + Date.now());
  const score = new Int32Array(N).fill(-99999);
  const level = new Int8Array(N).fill(-9);
  let n = 0;
  for (let mask = 0; mask < 4096; mask++) {
    const vals = [];
    for (let i = 0; i < 6; i++) vals.push([6, 7, 8, 9][(mask >> (i * 2)) & 3]);
    let probe;
    try { probe = core.paipan({ yaoValues: vals, gender: '男', question: 'x', year: 2026, month: 10, day: 26, hour: 17, minute: 35 }); } catch { continue; }
    if (!probe?.benGua?.name) continue;
    const dayGan = probe.siZhu.dayGanZhi[0], dayZhi = probe.siZhu.dayGanZhi[1];
    for (let mi = 0; mi < 12; mi++) {
      const monthZhi = MONTH_ZHI[mi];
      const pan = core.paipan({ yaoValues: vals, gender: '男', question: 'x', year: 2026, month: 10, day: 26, hour: 17, minute: 35 });
      pan.siZhu.monthGanZhi = pan.siZhu.monthGanZhi[0] + monthZhi;
      pan.siZhu.dayGanZhi = dayGan + dayZhi;
      let an;
      try { an = core.analyzeNajia(pan, { monthZhi, dayZhi, sex: '男' }); } catch { continue; }
      for (let di = 0; di < 8; di++) {
        let r;
        try { r = c.judge(pan, DOMAINS[di]); } catch { continue; }  // 签名：(pan, domainId)，内部自行算 analyzeNajia
        if (!r) continue;
        const idx = (mask * 12 + mi) * 8 + di;
        score[idx] = r.score;
        level[idx] = r.level;
        n++;
      }
    }
  }
  results[c.id] = { score, level, n };
  console.error(`[run] ${c.id} 判读 ${n}`);
}

// 两两比较
const PAIRS = [
  ['v2+v0', 'cur+v0', '名单修正单独（同 vendor=v0）'],
  ['v2+cur', 'cur+cur', '名单修正单独（同 vendor=cur）'],
  ['v2+v0', 'cur+cur', '候选 vs 本地 main（=快照 18758 口径，仅分数/档位）'],
  ['legacy+v0', 'cur+cur', '候选 vs 线上 v121'],
  ['legacy+v0', 'legacy+l0', 'L0 单独（无 V2）'],
  ['legacy+v0', 'legacy+l1', 'L1 单独（无 V2）'],
  ['legacy+v0', 'legacy+cur', 'L0+L1（无 V2）'],
  ['legacy+v0', 'v2+v0', 'V2 单独'],
  ['v2+v0', 'v2+l0', 'L0（叠加 V2）'],
  ['v2+v0', 'v2+l1', 'L1（叠加 V2）'],
  ['v2+v0', 'v2+cur', 'L0+L1（叠加 V2）'],
  ['legacy+v0', 'v2+cur', '全组合 vs 线上基线'],
  ['legacy+cur', 'v2+cur', 'V2（叠加 L0+L1）'],
];
const table = [];
for (const [a, b, label] of PAIRS) {
  const A = results[a], B = results[b];
  if (!A || !B) { table.push({ label, a, b, error: 'missing' }); continue; }
  let diff = 0, scoreOnly = 0, levelOnly = 0, both = 0;
  const flow = {};
  let up = 0, down = 0;
  for (let i = 0; i < N; i++) {
    if (A.score[i] === -99999 || B.score[i] === -99999) continue;
    const ds = A.score[i] !== B.score[i];
    const dl = A.level[i] !== B.level[i];
    if (!ds && !dl) continue;
    diff++;
    if (ds && dl) both++; else if (ds) scoreOnly++; else levelOnly++;
    if (dl) {
      const k = `${A.level[i]}→${B.level[i]}`;
      flow[k] = (flow[k] || 0) + 1;
      if (B.level[i] > A.level[i]) up++; else down++;
    }
  }
  table.push({ label, a, b, diff, scoreOnly, levelOnly, both, levelUp: up, levelDown: down, flow });
}

const out = { generatedAt: new Date().toISOString(), N, verdicts: VERDICTS, vendors: VENDORS, counts: Object.fromEntries(Object.entries(results).map(([k, v]) => [k, v.n])), table };
const target = arg('out');
if (target) fs.writeFileSync(target, JSON.stringify(out, null, 1));
for (const r of table) {
  if (r.error) { console.log(`${r.label}\tERROR`); continue; }
  console.log(`${r.label}\tdiff=${r.diff}\tscoreOnly=${r.scoreOnly}\tlevelOnly=${r.levelOnly}\t吉升=${r.levelUp}\t吉降=${r.levelDown}\tflow=${JSON.stringify(r.flow)}`);
}
