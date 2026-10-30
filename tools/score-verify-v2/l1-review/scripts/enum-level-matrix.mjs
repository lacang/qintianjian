// 全量档位流转矩阵（回答董事长 P0-3：核对 7,590 的统计范围）
//
// 目的：证明 7,590（吉→凶）与 97,492（全部档位变化）来自
//   同一空间（4096×12×12×8 = 4,718,592）、同一基线（PRE=v121 legacy+V0 vendor）、
//   同一档位定义（level = score>=4?2 : >=1?1 : <=-4?-2 : <=-1?-1 : 0）。
//
// 输出：
//   ① levelPre × levelPost 完整 5×5 矩阵
//   ② 分域吉→凶 / 凶→吉 / 升档 / 降档
//   ③ 与 flips-positive-to-negative.json 的 key 集合比对（应完全一致）
//
// 输出：evidence/enum-level-matrix.json / .txt

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
const VENDOR_POST = path.join(ROOT, 'app/vendor/liuyao-core.js');

const corePre = await import(pathToFileURL(VENDOR_PRE).href);
const corePost = await import(pathToFileURL(VENDOR_POST).href);

async function makeMod(file, vendorPath, tag) {
  let src = fs.readFileSync(file, 'utf8');
  src = src.replace(/from '[^']*state\.js[^']*'/, `from './state.js?v=121'`);
  src = src.replace(/from '[^']*liuyao-core\.js[^']*'/, `from '${pathToFileURL(vendorPath).href}'`);
  const out = path.join(ROOT, 'app/js', `.tmpmx-${tag}.mjs`);
  fs.writeFileSync(out, src);
  return out;
}
// PRE 必须绑定 VENDOR_PRE，POST 绑定 VENDOR_POST；混用会抹平旺衰差异。
const fPre = await makeMod(path.join(ROOT, 'tools/score-verify-v2/l1-review/legacy/verdict-v2.mjs'), VENDOR_PRE, 'pre');
const fPost = await makeMod(path.join(ROOT, 'app/js/verdict.js'), VENDOR_POST, 'post');
const modPre = await import(pathToFileURL(fPre).href + '?t=' + Date.now());
const modPost = await import(pathToFileURL(fPost).href + '?t=' + Date.now());
for (const f of [fPre, fPost]) fs.rmSync(f, { force: true });

const MASKVALS = [];
for (let mask = 0; mask < 4096; mask++) {
  const v = [];
  for (let i = 0; i < 6; i++) v.push([6, 7, 8, 9][(mask >> (i * 2)) & 3]);
  MASKVALS.push(v);
}
const BASE = (mask) => ({ yaoValues: MASKVALS[mask], gender: '男', question: 'x', year: 2026, month: 10, day: 26, hour: 17, minute: 35 });
const PAN_PRE = [], PAN_POST = [];
for (let mask = 0; mask < 4096; mask++) {
  PAN_PRE.push(corePre.paipan(BASE(mask)));
  PAN_POST.push(corePost.paipan(BASE(mask)));
}
function clonePan(src, mz, dz) {
  const pan = { ...src, siZhu: { ...src.siZhu } };
  pan.siZhu.monthGanZhi = pan.siZhu.monthGanZhi[0] + mz;
  pan.siZhu.dayGanZhi = DAY_GAN[(mz.charCodeAt(0) + dz.charCodeAt(0)) % 10] + dz;
  return pan;
}

const LV = [-2, -1, 0, 1, 2];
const mat = {}; for (const a of LV) for (const b of LV) mat[`${a}>${b}`] = 0;
const S = {
  space: 0, levelDiff: 0, up: 0, down: 0,
  ji2xiong: 0, xiong2ji: 0,
  byDomain: {},
  keys: new Set(),
};
for (const d of DOMAINS) S.byDomain[d] = { space: 0, diff: 0, j2x: 0, x2j: 0 };

const t0 = Date.now();
for (let mi = 0; mi < 12; mi++) {
  const mz = MONTH_ZHI[mi];
  for (let di = 0; di < 12; di++) {
    const dz = MONTH_ZHI[di];
    for (let mask = 0; mask < 4096; mask++) {
      const panPre = clonePan(PAN_PRE[mask], mz, dz);
      const panPost = clonePan(PAN_POST[mask], mz, dz);
      for (const domain of DOMAINS) {
        const rPre = modPre.judgeNajia(panPre, domain);
        const rPost = modPost.judgeNajia(panPost, domain);
        S.space++; S.byDomain[domain].space++;
        mat[`${rPre.level}>${rPost.level}`]++;
        if (rPre.level !== rPost.level) {
          S.levelDiff++; S.byDomain[domain].diff++;
          if (rPost.level > rPre.level) S.up++; else S.down++;
          if (rPre.level > 0 && rPost.level < 0) {
            S.ji2xiong++; S.byDomain[domain].j2x++;
            S.keys.add(`${mask}|${mz}|${dz}|${domain}`);
          }
          if (rPre.level < 0 && rPost.level > 0) { S.xiong2ji++; S.byDomain[domain].x2j++; }
        }
      }
    }
  }
  process.stderr.write(`[${mi + 1}/12] ${mz} 已用 ${((Date.now() - t0) / 1000).toFixed(0)}s diff=${S.levelDiff} j2x=${S.ji2xiong}\n`);
}

// 与 flips json 比对
const flips = JSON.parse(fs.readFileSync(path.join(EV, 'flips-positive-to-negative.json'), 'utf8'));
const fKeys = new Set(flips.records.map((r) => `${r.mask}|${r.monthZhi}|${r.dayZhi}|${r.domain}`));
let onlyMatrix = 0, onlyFlips = 0;
for (const k of S.keys) if (!fKeys.has(k)) onlyMatrix++;
for (const k of fKeys) if (!S.keys.has(k)) onlyFlips++;

const OUT = {
  space: S.space, levelDiff: S.levelDiff, up: S.up, down: S.down,
  ji2xiong: S.ji2xiong, xiong2ji: S.xiong2ji,
  matrix: mat, byDomain: S.byDomain,
  flipsFile: flips.records.length,
  crossCheck: { onlyMatrix, onlyFlips, matched: S.ji2xiong - onlyMatrix },
};
fs.writeFileSync(path.join(EV, 'enum-level-matrix.json'), JSON.stringify(OUT, null, 1), 'utf8');

const L = [];
L.push('全量档位流转矩阵（P0-3 口径核对）');
L.push('='.repeat(76));
L.push(`空间 ${S.space.toLocaleString()} 判读 = 4096 × 12 月令 × 12 日辰 × 8 域`);
L.push(`档位变化 ${S.levelDiff.toLocaleString()} 条（升档 ${S.up} / 降档 ${S.down}）`);
L.push('');
L.push('levelPre × levelPost 矩阵（行=PRE，列=POST）：');
L.push('         POST-2   POST-1    POST0   POST+1   POST+2');
for (const a of LV) {
  const row = LV.map((b) => String(mat[`${a}>${b}`]).padStart(8)).join(' ');
  L.push(`PRE${String(a).padStart(3)}  ${row}`);
}
L.push('');
L.push('方向分解：');
L.push(`  吉→凶（PRE>0 且 POST<0）  ${S.ji2xiong.toLocaleString()} 条  ← 即报告中的 7,590`);
L.push(`  凶→吉（PRE<0 且 POST>0）  ${S.xiong2ji.toLocaleString()} 条`);
L.push(`  其他档位变化              ${(S.levelDiff - S.ji2xiong - S.xiong2ji).toLocaleString()} 条`);
L.push('');
L.push('分域：');
for (const d of DOMAINS) {
  const v = S.byDomain[d];
  L.push(`  ${d.padEnd(9)} 判读 ${String(v.space).padStart(8)}  变化 ${String(v.diff).padStart(6)}  吉→凶 ${String(v.j2x).padStart(5)}  凶→吉 ${String(v.x2j).padStart(4)}`);
}
L.push('');
L.push('与 flips-positive-to-negative.json 交叉：');
L.push(`  文件记录 ${flips.records.length} 条`);
L.push(`  矩阵算出 ${S.ji2xiong} 条`);
L.push(`  仅矩阵有 ${onlyMatrix} / 仅文件有 ${onlyFlips} / 匹配 ${S.ji2xiong - onlyMatrix}`);
L.push(`  结论：${onlyMatrix === 0 && onlyFlips === 0 && flips.records.length === S.ji2xiong ? '完全一致 ✅' : '存在差异 ❌'}`);
fs.writeFileSync(path.join(EV, 'enum-level-matrix.txt'), L.join('\n'), 'utf8');
console.log(L.join('\n'));
