// P0 方案A · 全量档位矩阵（董事长 2026-10-30 验收标准第 3 项）
// 空间 4096 卦 × 12 月 × 12 日 × 8 域 = 4,718,592
// 路径：A0 = legacy verdict + V0 vendor；A2 = 当前 verdict + 当前 vendor（方案A）
// 对照：A1（压旺版）的 7,590 由 enum-level-matrix.json 提供，脚本内一并复核
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import fs from 'node:fs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '../../../..');
const EV = path.join(ROOT, 'tools/score-verify-v2/l1-review/evidence');

globalThis.document = {
  addEventListener() {}, querySelector: () => null, getElementById: () => null, querySelectorAll: () => [],
  head: { appendChild() {} },
  body: { appendChild() {}, classList: { add() {}, remove() {} } },
  createElement: () => ({ style: {}, classList: { add() {}, remove() {} }, appendChild() {}, setAttribute() {} }),
};
globalThis.window = globalThis;
globalThis.localStorage = { getItem: () => null, setItem() {}, removeItem() {} };

const DOMAINS = ['career', 'wealth', 'love', 'health', 'lost', 'decision', 'life', 'people'];
const MONTH_ZHI = ['寅', '卯', '辰', '巳', '午', '未', '申', '酉', '戌', '亥', '子', '丑'];
const DAY_GAN = ['甲', '乙', '丙', '丁', '戊', '己', '庚', '辛', '壬', '癸'];
const VENDOR_PRE = '/tmp/vendor-pre.mjs';
const VENDOR_CUR = path.join(ROOT, 'app/vendor/liuyao-core.js');

function mk(tag, verdictPath, vendorPath) {
  let src = fs.readFileSync(verdictPath, 'utf8');
  src = src.replace(/from '[^']*state\.js[^']*'/, `from './state.js?v=121'`);
  src = src.replace(/from '[^']*liuyao-core\.js[^']*'/, `from '${pathToFileURL(vendorPath).href}'`);
  const out = path.join(ROOT, 'app/js', `.tmpfm-${tag}.mjs`);
  fs.writeFileSync(out, src);
  return out;
}
const fA0 = mk('a0', path.join(ROOT, 'tools/score-verify-v2/l1-review/legacy/verdict-v2.mjs'), VENDOR_PRE);
const fA2 = mk('a2', path.join(ROOT, 'app/js/verdict.js'), VENDOR_CUR);
const modA0 = await import(pathToFileURL(fA0).href + '?t=' + Date.now());
const modA2 = await import(pathToFileURL(fA2).href + '?t=' + Date.now());
for (const f of [fA0, fA2]) fs.rmSync(f, { force: true });

const corePre = await import(pathToFileURL(VENDOR_PRE).href + '?t=' + Date.now());
const coreCur = await import(pathToFileURL(VENDOR_CUR).href + '?t=' + Date.now());

const MASKVALS = [];
for (let mask = 0; mask < 4096; mask++) {
  const v = [];
  for (let i = 0; i < 6; i++) v.push([6, 7, 8, 9][(mask >> (i * 2)) & 3]);
  MASKVALS.push(v);
}
const BASE = (m) => ({ yaoValues: MASKVALS[m], gender: '男', question: 'x', year: 2026, month: 10, day: 26, hour: 17, minute: 35 });
const PAN_PRE = [], PAN_CUR = [];
for (let m = 0; m < 4096; m++) { PAN_PRE.push(corePre.paipan(BASE(m))); PAN_CUR.push(coreCur.paipan(BASE(m))); }
function clonePan(src, mz, dz) {
  const p = { ...src, siZhu: { ...src.siZhu } };
  p.siZhu.monthGanZhi = p.siZhu.monthGanZhi[0] + mz;
  p.siZhu.dayGanZhi = DAY_GAN[(mz.charCodeAt(0) + dz.charCodeAt(0)) % 10] + dz;
  return p;
}

// 逐域统计
const stat = {};
for (const d of DOMAINS) stat[d] = { jixiong0: 0, jixiong2: 0, up: 0, down: 0, changed: 0, total: 0 };
const mat0 = {}; // A0 level → A2 level
let total = 0, jx0 = 0, jx2 = 0;
const t0 = Date.now();
for (let m = 0; m < 4096; m++) {
  for (const mz of MONTH_ZHI) {
    for (const dz of MONTH_ZHI) {
      const pPre = clonePan(PAN_PRE[m], mz, dz);
      const pCur = clonePan(PAN_CUR[m], mz, dz);
      for (const d of DOMAINS) {
        const a = modA0.judgeNajia(pPre, d);
        const b = modA2.judgeNajia(pCur, d);
        total++; stat[d].total++;
        const k = `${a.level}>${b.level}`;
        mat0[k] = (mat0[k] || 0) + 1;
        if (a.level >= 1 && b.level <= -1) { jx0++; stat[d].jixiong0++; }
        if (b.level >= 1 && a.level <= -1) stat[d].down++;
        if (b.level > a.level) stat[d].up++;
        if (a.level !== b.level) stat[d].changed++;
        // A2 相对 A0 的吉→凶（反向）
      }
    }
  }
  if (m % 512 === 0) console.error(`  mask ${m}/4096  用时 ${((Date.now() - t0) / 1000).toFixed(0)}s`);
}

const L = [];
L.push('P0 方案A · 全量档位矩阵');
L.push('生成时间：' + new Date().toISOString());
L.push('');
L.push('空间：4096 卦 × 12 月 × 12 日 × 8 域 = ' + total.toLocaleString());
L.push('A0 = v121 基线（legacy verdict + V0 vendor）');
L.push('A2 = 候选（当前 verdict + 当前 vendor，方案A：月破不改写本判旺衰）');
L.push('');
L.push('【全量档位迁移矩阵 A0 → A2】（行=A0，列=A2）');
const lvls = [-2, -1, 0, 1, 2];
L.push('       ' + lvls.map(v => String(v).padStart(10)).join(''));
for (const a of lvls) {
  L.push(String(a).padStart(5) + '  ' + lvls.map(b => String(mat0[`${a}>${b}`] || 0).padStart(10)).join(''));
}
L.push('');
L.push('【分域统计】');
L.push('域 | 总数 | A0吉→A2凶 | A2吉→A0凶 | 升档 | 降档 | 档位变化');
for (const d of DOMAINS) {
  const s = stat[d];
  L.push(`${d} | ${s.total} | ${s.jixiong0} | ${s.down} | ${s.up} | ${s.changed - s.up} | ${s.changed}`);
}
L.push('');
const sumUp = DOMAINS.reduce((a, d) => a + stat[d].up, 0);
const sumChanged = DOMAINS.reduce((a, d) => a + stat[d].changed, 0);
L.push(`合计：A0→A2 档位变化 ${sumChanged} 条，其中升档 ${sumUp}、降档 ${sumChanged - sumUp}`);
L.push(`A0 吉→A2 凶：${jx0} 条`);
L.push('');
L.push('【与历史基线对照】');
try {
  const old = JSON.parse(fs.readFileSync(path.join(EV, 'enum-level-matrix.json'), 'utf8'));
  L.push('  enum-level-matrix.json（A0 → A1 压旺版）：' + JSON.stringify(old.stat || old).slice(0, 600));
} catch (e) { L.push('  （未读到 enum-level-matrix.json）'); }

fs.writeFileSync(path.join(EV, 'p0-full-matrix.txt'), L.join('\n'), 'utf8');
fs.writeFileSync(path.join(EV, 'p0-full-matrix.json'), JSON.stringify({ total, jx0, stat, mat0 }, null, 1), 'utf8');
console.log(L.join('\n'));
