// v123 阶段二 · 第一步样例生成器（六份真实资料包）
//
// 用途：用真实的排盘/抽牌数据，跑 buildAiPack() 的三种模式 × 六爻/塔罗，
//      把结果同时落成「可读文本(.txt)」与「结构化 JSON(.json)」，供人工验收。
//
// 用法：node tools/ai-pack-sample.mjs [输出目录]
// 默认输出到 aipack-samples/。
//
// 说明：
//  - 本脚本只做"准备输入 + 调 buildAiPack + 落盘"，不含任何资料组织逻辑。
//  - verdict.js 依赖 state.js（含 DOM），故在 Node 里先补最小 stub 再 import；
//    浏览器侧不需要这层 stub。
//  - 塔罗的倾向值来自 tarotval_rws.js 的 RWS_VAL 机械合参；五档阈值与
//    app/js/tarotview.js:102 verdictOf() 一致（那边是模块内私有函数，未导出）。

import fs from 'node:fs';
import path from 'node:path';

// ---- 最小 DOM stub（仅为在 Node 里 import app/js/verdict.js） ----
globalThis.document = {
  addEventListener() {}, removeEventListener() {},
  getElementById() { return null; },
  querySelector() { return null; },
  querySelectorAll() { return []; },
  createElement() { return { style: {}, classList: { add() {}, remove() {} }, appendChild() {}, setAttribute() {} }; },
  body: { appendChild() {}, classList: { add() {}, remove() {} } },
};
globalThis.window = globalThis;
globalThis.localStorage = { getItem() { return null; }, setItem() {}, removeItem() {} };

const ROOT = path.resolve(import.meta.dirname, '..');
const OUT = path.resolve(process.argv[2] || path.join(ROOT, 'aipack-samples'));

const core = await import(path.join(ROOT, 'app/vendor/liuyao-core.js'));
const { judgeNajia } = await import(path.join(ROOT, 'app/js/verdict.js'));
const { rwsVal } = await import(path.join(ROOT, 'app/js/tarotval_rws.js'));
const { buildAiPack, renderAiPackText, renderAiPackJson, renderAiPackHtml, AI_PACK_CSS, MODES } = await import(path.join(ROOT, 'app/js/aipack.js'));

fs.mkdirSync(OUT, { recursive: true });

const written = [];
const packs = { liuyao: {}, tarot: {} };

const BOM = '﻿'; // UTF-8 BOM：避免 Windows 记事本等工具按本地编码打开时乱码

function emit(domain, mode, pack) {
  const base = path.join(OUT, `${domain}-${mode}`);
  fs.writeFileSync(base + '.txt', BOM + renderAiPackText(pack) + '\n', 'utf8');
  fs.writeFileSync(base + '.json', renderAiPackJson(pack) + '\n', 'utf8');
  fs.writeFileSync(base + '.html', renderAiPackHtml(pack), 'utf8');
  const bytes = Buffer.byteLength(fs.readFileSync(base + '.json'));
  written.push({
    file: `${domain}-${mode}`,
    text_lines: renderAiPackText(pack).split('\n').length,
    json_bytes: bytes,
    html_bytes: Buffer.byteLength(fs.readFileSync(base + '.html')),
  });
  packs[domain][mode] = pack;
}

// ===========================================================================
// 六爻：固定一盘，三种模式
// ===========================================================================
// 起卦输入固定，保证样例可复现：丙午年 戊戌月 癸酉日 辛酉时，雷火丰 → 火雷噬嗑
const liuyaoPan = core.paipan({
  yaoValues: [7, 8, 9, 7, 8, 6],   // 自下而上：少阳/少阴/老阳(动)/少阳/少阴/老阴(动)
  gender: '男',
  question: '这份工作要不要接',
  year: 2026, month: 10, day: 26, hour: 17, minute: 35,
});
const liuyaoNajia = core.analyzeNajia(liuyaoPan, {
  monthZhi: '戌', dayZhi: '酉', sex: '男',
});
const DOMAIN_ID = 'career';
const liuyaoVerdict = judgeNajia(liuyaoPan, DOMAIN_ID);
const liuyaoReading = core.getReadingDomain(DOMAIN_ID);

const liuyaoCtx = {
  pan: liuyaoPan,
  najia: liuyaoNajia,
  verdict: liuyaoVerdict,
  reading: liuyaoReading,
  meta: {
    appVersion: 'v123',
    ruleVersion: 1,
    castAt: '2026-10-26 17:35',
    castMethod: '手工指定六爻值（少阳/少阴/老阳动/少阳/少阴/老阴动）',
  },
};

for (const mode of [MODES.QUICK, MODES.CLASSIC, MODES.RESEARCH]) {
  emit('liuyao', mode, buildAiPack('liuyao', liuyaoCtx, mode));
}

// ===========================================================================
// 塔罗：固定三张，三种模式
// ===========================================================================
const tarotDeck = core.getDeck('rws');
const tarotSpread = core.getSpread('three-time');
const TAROT_DRAWN = [
  { id: 'major-10-wheel', rev: false },   // 过去
  { id: 'swords-08', rev: true },         // 现在
  { id: 'major-19-sun', rev: false },     // 未来
];
// 与 tarotview.js:157-159 相同的机械合参：等权平均
const scores = TAROT_DRAWN.map((d) => rwsVal(d.id, d.rev));
const tarotScore = +(scores.reduce((a, b) => a + b, 0) / scores.length).toFixed(2);
// 五档阈值与 tarotview.js:102 verdictOf 一致
function verdictOf(score) {
  if (score >= 0.8) return { cls: 'v-good', text: '吉 · 势头明朗', desc: '牌象相互扶持，倾向积极，宜顺势主动。塔罗所示为当下之势与功课，非定命。' };
  if (score >= 0.25) return { cls: 'v-mild', text: '小吉 · 缓进可期', desc: '整体偏正面，间有阻滞，宜稳步推进、留意提示的功课。' };
  if (score <= -0.8) return { cls: 'v-bad', text: '滞 · 宜守待时', desc: '牌象呈阻滞或收束之象，宜谨慎、先理隐患、另待时机。' };
  if (score <= -0.25) return { cls: 'v-warn', text: '谨慎 · 多有周折', desc: '变数与牵绊偏多，重大决定宜缓，先看清局面。' };
  return { cls: 'v-flat', text: '平 · 吉凶未定', desc: '牌象彼此牵制，走向取决于你接下来的选择，勿急于下定论。' };
}
const tv = verdictOf(tarotScore);

const tarotCtx = {
  deck: tarotDeck,
  spread: tarotSpread,
  drawn: TAROT_DRAWN,
  verdict: { score: tarotScore, level: tv.cls, text: tv.text, desc: tv.desc },
  meta: {
    appVersion: 'v123',
    question: '这段合作还要不要继续',
    drawnAt: '2026-10-26 17:35',
    reversalUsed: true,
  },
};

for (const mode of [MODES.QUICK, MODES.CLASSIC, MODES.RESEARCH]) {
  emit('tarot', mode, buildAiPack('tarot', tarotCtx, mode));
}

// ===========================================================================
// 合集页：一个 URL 发出去，另一个 AI 就能读到六份资料包的全部内容
// ===========================================================================
const ORDER = [
  ['liuyao', 'quick'], ['liuyao', 'classic'], ['liuyao', 'research'],
  ['tarot', 'quick'], ['tarot', 'classic'], ['tarot', 'research'],
];
const frags = ORDER.map(([d, m]) => renderAiPackHtml(packs[d][m], { fragment: `${d}-${m}` })).join('\n');
const bundle = {
  generated_by: 'qintianjian ai-pack samples',
  schema_version: 1,
  inputs: {
    liuyao: { cast_at: '2026-10-26 17:35', question: '这份工作要不要接', values: [7, 8, 9, 7, 8, 6], domain: 'career' },
    tarot: { deck: 'rws', spread: 'three-time', question: '这段合作还要不要继续', drawn: TAROT_DRAWN },
  },
  packs: ORDER.map(([d, m]) => packs[d][m]),
};
const bundleJson = JSON.stringify(bundle, null, 2).replace(/</g, '\\u003c');
const indexHtml = `<!DOCTYPE html>
<html lang="zh-CN">
<head>
<meta charset="UTF-8">
<meta http-equiv="Content-Type" content="text/html; charset=UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>钦天监 AI 协作资料包 · 六份样例合集（六爻×3 · 塔罗×3）</title>
<meta name="description" content="钦天监 v123 AI 协作资料包六份样例合集，供大模型直接读取：排盘事实、程序分析、规则判断、典籍出处分层。">
<meta name="ai-content-kind" content="qintianjian-ai-pack-collection">
<meta name="ai-pack-schema-version" content="1">
<style>${AI_PACK_CSS}
.pack-fragment{padding-bottom:24px}
#bundle-nav{position:sticky;top:0;background:#fbfaf7;padding:10px 0;border-bottom:1px solid var(--line);z-index:2}
#bundle-nav a{margin-right:12px;font-size:13.5px;color:var(--accent);text-decoration:none;white-space:nowrap}
</style>
</head>
<body>
<main>
<h1>钦天监 AI 协作资料包 · 六份样例合集</h1>
<p class="sub">六爻纳甲 × 三种模式 ＋ 塔罗 × 三种模式　·　静态页面，无需 JavaScript 即可完整阅读</p>
<section class="notice"><strong>致阅读本页的 AI 助手：</strong>本页纵向收录了同一盘（六爻：雷火丰之噬嗑，问事业）与同一阵（塔罗：命运之轮正 / 宝剑八逆 / 太阳正）在<strong>快速解读 / 古法推演 / 深度研究</strong>三种模式下的完整资料包。每份资料包分四层：排盘事实（直接采用，不要重算）、程序分析事实（可验证的计算结果）、依规则生成的判断（程序输出，非客观事实、非预测准确率）、资料出处（古籍原文 / 白话整理 / 自建惯例严格分层）。页面底部有六份资料包的完整结构化 JSON。同一术数三种模式的排盘事实逐字节一致，差别只在资料详略与研究对照。请按每个资料包末尾的「请你做的事」作答，并遵守「使用约束」。</section>
<nav id="bundle-nav">
${ORDER.map(([d, m]) => `<a href="#frag-${d}-${m}">${d === 'liuyao' ? '六爻' : '塔罗'}·${packs[d][m].mode_name}</a>`).join('')}
<a href="#bundle-json">合集 JSON</a>
</nav>
${frags}
<details id="bundle-json"><summary>六份资料包完整结构化数据（application/json 数组，共 ${bundleJson.length} 字符）</summary>
<script type="application/json" id="ai-pack-bundle-json">${bundleJson}</script>
<pre>${bundleJson.replace(/&/g, '&amp;').replace(/</g, '&lt;')}</pre>
</details>
<footer>钦天监 · 纯本地命理工具 · 本资料包仅组织排盘结果与可追溯资料，不代替人的判断。</footer>
</main>
</body>
</html>`;
fs.writeFileSync(path.join(OUT, 'index.html'), indexHtml, 'utf8');

// ===========================================================================
// 自检 + 汇总
// ===========================================================================
const problems = [];

// 1) 文本与 JSON 必须同源：JSON 里的每个关键值都应能在文本中找到
for (const f of written) {
  const base = path.join(OUT, f.file);
  const txt = fs.readFileSync(base + '.txt', 'utf8');
  const pack = JSON.parse(fs.readFileSync(base + '.json', 'utf8'));
  if (pack.schema_version !== 1) problems.push(`${f.file}: schema_version 不是 1`);
  if (!pack.layer_status || !pack.interpretation_constraints?.length || !pack.user_task) problems.push(`${f.file}: 缺 layer_status / constraints / user_task`);
  // 排盘事实不得因模式而变
  if (pack.chart_data?.lines && pack.chart_data.lines.length !== 6) problems.push(`${f.file}: 六爻爻数不是 6`);
  if (pack.chart_data?.cards && pack.chart_data.cards.length !== 3) problems.push(`${f.file}: 塔罗牌数不是 3`);
  // 三种模式的 user_task 必须不同
  // 原文/整理/惯例必须可区分
  const kinds = new Set((pack.source_materials || []).map((s) => s.kind));
  if (!kinds.size) problems.push(`${f.file}: source_materials 为空`);
  // 2026-10-28：null 是合法 JSON 值（资料包约定"字段为 null 处表示底本无此条"），
  // 全文 includes('null') 会误报说明文字；只保留 undefined 裸值检测（undefined 不该出现在产物里）。
  if (/\bundefined\b/.test(txt)) problems.push(`${f.file}: 文本里出现 undefined`);

  // HTML 单页：编码声明、内嵌 JSON 可解析且与 .json 一致、零 <script src>（纯静态无外部依赖）
  const html = fs.readFileSync(base + '.html', 'utf8');
  if (!html.includes('charset="UTF-8"') || !html.includes('charset=UTF-8')) problems.push(`${f.file}: HTML 缺 UTF-8 编码声明`);
  if (/<script\s+src/i.test(html)) problems.push(`${f.file}: HTML 含外部脚本，违背纯静态要求`);
  const m = html.match(/<script type="application\/json" id="ai-pack-json">([\s\S]*?)<\/script>/);
  if (!m) problems.push(`${f.file}: HTML 未内嵌 application/json`);
  else {
    try {
      const embedded = JSON.parse(m[1].replace(/\\u003c/g, '<'));
      if (JSON.stringify(embedded) !== JSON.stringify(pack)) problems.push(`${f.file}: HTML 内嵌 JSON 与 .json 文件不同源`);
    } catch (e) { problems.push(`${f.file}: HTML 内嵌 JSON 解析失败：${e.message}`); }
  }
  if (html.includes('undefined') || html.includes('>null<')) problems.push(`${f.file}: HTML 出现 undefined 裸值/渲染态 null`);
}

// 合集页：六个片段锚点齐全 + 合集 JSON 为 6 个 pack
{
  const idx = fs.readFileSync(path.join(OUT, 'index.html'), 'utf8');
  for (const [d, m] of [['liuyao', 'quick'], ['liuyao', 'classic'], ['liuyao', 'research'], ['tarot', 'quick'], ['tarot', 'classic'], ['tarot', 'research']]) {
    if (!idx.includes(`id="frag-${d}-${m}"`)) problems.push(`index.html: 缺片段 frag-${d}-${m}`);
  }
  const bm = idx.match(/<script type="application\/json" id="ai-pack-bundle-json">([\s\S]*?)<\/script>/);
  if (!bm) problems.push('index.html: 缺合集 JSON');
  else {
    try {
      const bundle = JSON.parse(bm[1].replace(/\\u003c/g, '<'));
      if (!Array.isArray(bundle.packs) || bundle.packs.length !== 6) problems.push('index.html: 合集 JSON 的 packs 不是 6 份');
    } catch (e) { problems.push(`index.html: 合集 JSON 解析失败：${e.message}`); }
  }
}

// 2) 同术数三种模式的 chart_data 必须完全一致（快速模式不得改变原始事实）
for (const domain of ['liuyao', 'tarot']) {
  const packs = ['quick', 'classic', 'research'].map((m) =>
    JSON.parse(fs.readFileSync(path.join(OUT, `${domain}-${m}.json`), 'utf8')));
  const sig = packs.map((p) => JSON.stringify(p.chart_data));
  if (new Set(sig).size !== 1) problems.push(`${domain}: 三种模式的 chart_data 不一致（违反"精简不改变原始事实"）`);
  const tasks = packs.map((p) => p.user_task);
  if (new Set(tasks).size !== 3) problems.push(`${domain}: 三种模式的 user_task 没有区分`);
  // 依据条数应递增（quick ≤ classic = research）
  const n = packs.map((p) => p.computed_analysis?.rule_based_judgments?.signals?.length ?? 0);
  if (!(n[0] <= n[1] && n[1] === n[2])) problems.push(`${domain}: 依据条数不符合 quick ≤ classic = research（${n.join('/')}）`);
  // 引文条数应递增
  const q = packs.map((p) => (p.source_materials || []).filter((s) => s.kind === 'classic_quote').length);
  if (!(q[0] <= q[1] && q[1] <= q[2])) problems.push(`${domain}: 引文条数不符合 quick ≤ classic ≤ research（${q.join('/')}）`);
}

// 3) 六爻 facts/judgments 必须分层且都非空
const ly = JSON.parse(fs.readFileSync(path.join(OUT, 'liuyao-classic.json'), 'utf8'));
if (!ly.computed_analysis?.facts) problems.push('liuyao: facts 为空');
if (!ly.computed_analysis?.rule_based_judgments) problems.push('liuyao: rule_based_judgments 为空');
if (!ly.computed_analysis.rule_based_judgments.basis_note) problems.push('liuyao: judgments 缺 basis_note');

// 4) 塔罗必须明确区分整理层与原文
const tt = JSON.parse(fs.readFileSync(path.join(OUT, 'tarot-classic.json'), 'utf8'));
for (const c of tt.computed_analysis?.facts?.cards || []) {
  if (c.meaning_nature !== 'rule_digest') problems.push(`tarot: ${c.card} 的整理层未标 rule_digest`);
  if (c.classic_text && !c.classic_source) problems.push(`tarot: ${c.card} 有原文无出处`);
}
const tarotJ = tt.computed_analysis?.rule_based_judgments;
if (tarotJ && tarotJ.basis !== 'convention') problems.push('tarot: 倾向值未标 convention');

console.log('\n=== 生成结果 ===');
for (const f of written) console.log(`  ${f.file.padEnd(18)} 文本 ${String(f.text_lines).padStart(3)} 行 · JSON ${f.json_bytes}B · HTML ${f.html_bytes}B`);
console.log(`\n输出目录：${OUT}`);
if (problems.length) {
  console.log(`\n自检：${problems.length} 项不通过`);
  for (const p of problems) console.log('  ✗ ' + p);
  process.exit(1);
} else {
  console.log('\n自检：12 项断言全部通过（同源 / 事实不变 / 模式有区分 / 原文与整理分层 / 依据递增）');
}
