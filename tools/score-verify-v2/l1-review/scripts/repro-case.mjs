// 单案例全链路复算：从原始六爻输入一路算到吉凶档位，PRE / POST 并排。
//
// 用途：董事长要求「是否有代表性案例可以从原始排盘事实一路复算到最终吉凶档位」。
// 本脚本输入 (mask, monthIdx, domain)，输出：
//   ① 原始输入（6 爻值 → 本卦/变卦）
//   ② 事实层：每爻干支/五行/世应/动静/月令状态/月破/日破/旬空（PRE vs POST）
//   ③ 判断层：PRE / POST 的全部计分信号（规则 id、古法出处、文本、分值）
//   ④ 汇总：总分 → 档位，以及两者的差值归因
//
// 用法：
//   node tools/score-verify-v2/l1-review/scripts/repro-case.mjs --mask=104 --month=8 --domain=love
//   node tools/score-verify-v2/l1-review/scripts/repro-case.mjs --idx=8352        # 也可用全枚举 idx
//   node tools/score-verify-v2/l1-review/scripts/repro-case.mjs --ruleKey=liuhunhun --n=3   # 自动挑案例

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
const DOMAIN_CN = { career: '事业', wealth: '财运', love: '婚姻', health: '疾病', lost: '失物', decision: '决策', life: '生活', people: '行人' };
const MONTH_ZHI = ['寅', '卯', '辰', '巳', '午', '未', '申', '酉', '戌', '亥', '子', '丑'];
const LEVEL_CN = { 2: '大吉倾向', 1: '吉倾向', 0: '平', '-1': '谨慎', '-2': '宜避' };

const VENDOR_PRE = '/tmp/vendor-pre.mjs';
const VENDOR_POST = path.join(ROOT, 'app/vendor/liuyao-core.js');
const VERDICT_PRE = path.join(ROOT, 'tools/score-verify-v2/l1-review/legacy/verdict-v2.mjs');
const VERDICT_POST = path.join(ROOT, 'app/js/verdict.js');

function makeCombo(verdictPath, vendorPath, tag) {
  let src = fs.readFileSync(verdictPath, 'utf8');
  const vendorUrl = pathToFileURL(vendorPath).href;
  src = src.replace(/from '[^']*state\.js[^']*'/, `from './state.js?v=121'`);
  src = src.replace(/from '[^']*liuyao-core\.js[^']*'/, `from '${vendorUrl}'`);
  const out = path.join(ROOT, 'app/js', `.tmprepro-${tag}.mjs`);
  fs.writeFileSync(out, src);
  return out;
}

const fPre = makeCombo(VERDICT_PRE, VENDOR_PRE, 'pre');
const fPost = makeCombo(VERDICT_POST, VENDOR_POST, 'post');
const modPre = await import(pathToFileURL(fPre).href + '?t=' + Date.now());
const modPost = await import(pathToFileURL(fPost).href + '?t=' + Date.now());
fs.rmSync(fPre, { force: true });
fs.rmSync(fPost, { force: true });
const corePre = await import(pathToFileURL(VENDOR_PRE).href + '?t=' + Date.now());
const corePost = await import(pathToFileURL(VENDOR_POST).href + '?t=' + Date.now());

function runOne(mask, mi, domain) {
  const vals = [];
  for (let i = 0; i < 6; i++) vals.push([6, 7, 8, 9][(mask >> (i * 2)) & 3]);
  const build = (core) => {
    const pan = core.paipan({ yaoValues: vals, gender: '男', question: 'x', year: 2026, month: 10, day: 26, hour: 17, minute: 35 });
    const dayGan = pan.siZhu.dayGanZhi[0], dayZhi = pan.siZhu.dayGanZhi[1];
    pan.siZhu.monthGanZhi = pan.siZhu.monthGanZhi[0] + MONTH_ZHI[mi];
    pan.siZhu.dayGanZhi = dayGan + dayZhi;
    const an = core.analyzeNajia(pan, { monthZhi: MONTH_ZHI[mi], dayZhi, sex: '男' });
    return { pan, an };
  };
  const PRE = build(corePre), POST = build(corePost);
  const rPre = modPre.judgeNajia(PRE.pan, domain);
  const rPost = modPost.judgeNajia(POST.pan, domain);
  return { vals, mi, domain, PRE, POST, rPre, rPost };
}

function lineTable(an, title) {
  const out = [`── ${title} ──`];
  out.push('爻 阴阳 干支 五行 六亲 世应 动 月令态 月破 日破 旬空');
  for (const o of an.lines) {
    const y = o.yao || {};
    const s = o.state || {};
    out.push([
      `${o.pos}`.padEnd(2),
      (y.yinYang || '').padEnd(3),
      (y.gan || '') + (y.zhi || ''),
      (s.wuXing || y.wuXing || '').padEnd(3),
      (o.liuQin || '').padEnd(3),
      (o.shi ? '世' : o.ying ? '应' : '  '),
      o.moving ? '动' : '静',
      (s.lingTai || '').padEnd(3),
      s.yuePo ? '破' : '  ',
      s.riPo ? '日破' : '    ',
      s.xunKong ? '空' : '',
    ].join(' '));
  }
  return out.join('\n');
}

function signalTable(r, title) {
  const out = [`── ${title} ──`];
  out.push(`总分 ${r.score}  →  档位 ${r.level}（${LEVEL_CN[r.level]}）  用神 ${r.ysName || '-'}`);
  out.push('  分  规则id        出处                        文本');
  for (const s of r.signals || []) {
    const rid = s.rule?.id || '-';
    const book = (s.rule?.book || s.src || '').slice(0, 26);
    out.push(`${String(s.w).padStart(4)}  ${rid.padEnd(13)} ${book.padEnd(28)} ${(s.text || '').slice(0, 46)}`);
  }
  return out.join('\n');
}

function report(mask, mi, domain) {
  const { vals, PRE, POST, rPre, rPost } = runOne(mask, mi, domain);
  const L = [];
  L.push('══════════════════════════════════════════════════════════════');
  L.push(`案例复算：mask=${mask}  月令=${MONTH_ZHI[mi]}  域=${DOMAIN_CN[domain]}（${domain}）`);
  L.push('══════════════════════════════════════════════════════════════');
  L.push('');
  L.push('【① 原始输入】');
  L.push(`  六爻值（初→上）：${vals.join(' ')}   （6=老阴动 7=少阳 8=少阴 9=老阳动）`);
  L.push(`  本卦：${POST.pan.benGua?.name}   变卦：${POST.pan.bianGua?.name || '（无动爻）'}`);
  L.push(`  四柱：${POST.pan.siZhu.yearGanZhi} ${POST.pan.siZhu.monthGanZhi} ${POST.pan.siZhu.dayGanZhi} ${POST.pan.siZhu.hourGanZhi}`);
  L.push(`  月令：${MONTH_ZHI[mi]}   日辰：${POST.pan.siZhu.dayGanZhi}`);
  L.push('');
  L.push('【② 事实层】');
  L.push(lineTable(PRE.an, 'PRE 事实（V0 vendor：月破不失气）'));
  L.push('');
  L.push(lineTable(POST.an, 'POST 事实（cur vendor：月破失气 + 休态归日破）'));
  L.push('');
  L.push('【③ 判断层】');
  L.push(signalTable(rPre, 'PRE 判读（V2 verdict + 旧名单 + V0 vendor）'));
  L.push('');
  L.push(signalTable(rPost, 'POST 判读（V2 verdict + 新名单 + cur vendor）'));
  L.push('');
  L.push('【④ 汇总】');
  L.push(`  PRE : 总分 ${rPre.score}  →  档位 ${rPre.level}（${LEVEL_CN[rPre.level]}）`);
  L.push(`  POST: 总分 ${rPost.score}  →  档位 ${rPost.level}（${LEVEL_CN[rPost.level]}）`);
  L.push(`  差值: ${rPost.score - rPre.score} 分，档位 ${rPre.level} → ${rPost.level}`);
  L.push('');
  return L.join('\n');
}

// ── 入口 ──
const idxArg = arg('idx'), maskArg = arg('mask'), monthArg = arg('month'), domainArg = arg('domain');
const ruleKeyArg = arg('ruleKey'), nArg = parseInt(arg('n') || '2', 10);

if (maskArg != null && monthArg != null && domainArg) {
  console.log(report(parseInt(maskArg, 10), parseInt(monthArg, 10), domainArg));
} else if (idxArg != null) {
  const i = parseInt(idxArg, 10);
  const di = i % 8, mi = Math.floor(i / 8) % 12, mask = Math.floor(i / 96);
  console.log(report(mask, mi, DOMAINS[di]));
} else if (ruleKeyArg) {
  const jf = path.join(ROOT, 'tools/score-verify-v2/l1-review/evidence/attribution-678.json');
  if (!fs.existsSync(jf)) { console.error(`缺少 ${jf}，先跑 attribution-678.mjs`); process.exit(2); }
  const d = JSON.parse(fs.readFileSync(jf, 'utf8'));
  const pick = d.hits.filter((h) => h.ruleKey === ruleKeyArg).slice(0, nArg);
  if (!pick.length) { console.error(`ruleKey=${ruleKeyArg} 无匹配`); process.exit(1); }
  for (const h of pick) console.log(report(h.mask, h.monthIdx, h.domain));
} else {
  console.error('用法：--mask=&--month=&--domain=  |  --idx=  |  --ruleKey=&--n=');
  process.exit(2);
}
