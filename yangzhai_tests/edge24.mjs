// 24山边界统一回归（评审 B-P2-01 /《工程化整改基线》第3节）
// ------------------------------------------------------------------
// 统一边界约定（金标准 edge.mjs:8-10 已定：172.5° = 坐壬向丙）：
//   山 M[k] 中线 = 15k，覆盖区间 (15k-7.5, 15k+7.5]，
//   即分界点 b_k = 7.5 + 15k 归【角度较小】的山 M[k]（含上界、不含下界）。
// 本文件只测纯函数，同时锁 bazhai-core 与 xuankong-core 两套实现，
// 不依赖 DOM / state / judge，可直接进 CI。
// 用法：node --loader ./yangzhai_tests/loader.mjs ./yangzhai_tests/edge24.mjs [appdir]
import { pathToFileURL } from 'node:url';
import path from 'node:path';

const APP = process.argv[2] || path.resolve('app');
const B = await import(pathToFileURL(path.join(APP, 'vendor/bazhai-core.js')).href);
const X = await import(pathToFileURL(path.join(APP, 'vendor/xuankong-core.js')).href);

let bad = 0, total = 0;
const fails = [];
const ok = (c, m) => {
  total++;
  if (!c) { bad++; fails.push(m); }
};

// 两套 24 山必须同名、同序、同锚点
ok(JSON.stringify(B.MOUNTAINS_24) === JSON.stringify(X.MOUNTAINS_24),
  '两套 MOUNTAINS_24 名称/顺序一致');
const M = B.MOUNTAINS_24;
ok(M.length === 24 && M[0] === '子' && M[11] === '丙' && M[23] === '壬',
  '24山锚点正确（M0=子 M11=丙 M23=壬）: ' + M.join(''));

// 适配两套返回结构：bazhai 返回山名字符串，xuankong 返回山信息对象
const nameOf = (v) => (typeof v === 'string' ? v : v && v.name);
const facingOf  = (src, d) => nameOf(src.mountainsAt(d).chao);
const sittingOf = (src, d) => nameOf(src.mountainsAt(d).zuo);

const EPS = 0.001;
for (const [tag, src] of [['bazhai', B], ['xuankong', X]]) {
  for (let k = 0; k < 24; k++) {
    const b = 7.5 + 15 * k;                 // 分界点 → 归 M[k]
    const c = 15 * k;                        // 中线   → 归 M[k]
    const exp  = M[k];
    const next = M[(k + 1) % 24];
    const opp  = M[(k + 12) % 24];
    const bl = +(b - EPS).toFixed(3);
    const br = +(b + EPS).toFixed(3);

    // 核心：24 个分界点本身必须归角度较小的山（这条在修复前必红）
    ok(src.mountainIndexAt(b) === k,
      `${tag} idx(${b}°)=${k}（实得${src.mountainIndexAt(b)}）`);
    ok(facingOf(src, b) === exp,
      `${tag} 分界${b}° 朝=${exp}（实得${facingOf(src, b)}）`);
    ok(sittingOf(src, b) === opp,
      `${tag} 分界${b}° 坐(对宫)=${opp}（实得${sittingOf(src, b)}）`);

    // 中线归本山
    ok(facingOf(src, c) === exp,
      `${tag} 中线${c}° 朝=${exp}（实得${facingOf(src, c)}）`);

    // 边界两侧：左侧仍属本山，右侧进入下一山（防止公式整体平移一格）
    ok(facingOf(src, bl) === exp,
      `${tag} ${b}° 左微扰=${exp}（实得${facingOf(src, bl)}）`);
    ok(facingOf(src, br) === next,
      `${tag} ${b}° 右微扰=${next}（实得${facingOf(src, br)}）`);
  }

  // 金标准案例（与 edge.mjs 同一约定）
  ok(facingOf(src, 172.5) === '丙' && sittingOf(src, 172.5) === '壬',
    `${tag} 172.5° 应坐壬向丙（实得 坐${sittingOf(src, 172.5)}向${facingOf(src, 172.5)}）`);
  ok(facingOf(src, 352.5) === '壬' && sittingOf(src, 352.5) === '丙',
    `${tag} 352.5° 应坐丙向壬（实得 坐${sittingOf(src, 352.5)}向${facingOf(src, 352.5)}）`);

  // 坐向对宫恒等：坐(向 d) === 向(d+180)，全周每 3.75° 扫 96 点
  let symOk = true;
  for (let d = 0; d < 360; d += 3.75) {
    if (sittingOf(src, d) !== facingOf(src, (d + 180) % 360)) { symOk = false; break; }
  }
  ok(symOk, `${tag} 坐向对宫恒等（每3.75°×96点）`);

  // 不抛、不脏：整周细扫无空名/越界
  let clean = true;
  for (let d = 0; d < 360; d += 0.37) {
    const f = facingOf(src, d), s = sittingOf(src, d);
    if (!f || !s || !M.includes(f) || !M.includes(s)) { clean = false; break; }
  }
  ok(clean, `${tag} 全周0.37°细扫 山名均合法非空`);
}

// 只打印前 30 条失败，避免刷屏
if (bad) { console.log('--- 失败明细（前30条）---'); fails.slice(0, 30).forEach((m) => console.log('❌', m)); }
console.log(`\n${bad ? '[FAIL]' : '[PASS]'} 24山边界回归 ${total - bad}/${total} 通过（失败 ${bad}）`);
process.exit(bad ? 1 : 0);
