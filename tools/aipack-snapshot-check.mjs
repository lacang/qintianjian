#!/usr/bin/env node
// AI 资料包快照一致性门禁（L1 第一批 · 2026-10-28 董事长批复第④项）
//
// 职责：重跑生成器到临时目录 → 与已冻结的 aipack-samples/ 做四层独立核验 → 按结果退出。
// 不写 aipack-samples/、不改任何生产文件、不联网。
//
// 四层：
//   1. 文件集一致（相对路径集合完全相同）
//   2. 内容逐字节一致（sha256；生成器已验证确定性）
//   3. 关键魂卦事实独立断言（K1-K3 按卦名断言，不复用生成器自检）
//   4. 三模式 chart_data 深相等 + txt/json/html/index 四格式事实串交叉一致（K4-K5）
//
// 退出码：0 全绿；1 有失败；2 环境/用法错误。
//
// 依据：tools/score-verify-v2/l1-prep/06_snapshot_gate.md
import { execFileSync } from 'node:child_process';
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const FROZEN = path.join(ROOT, 'aipack-samples');
const LIUYAO_MODES = ['quick', 'classic', 'research'];
const ALL_MODES = ['liuyao-quick', 'liuyao-classic', 'liuyao-research',
  'tarot-quick', 'tarot-classic', 'tarot-research'];
const EXTS = ['txt', 'json', 'html'];

const fail = [];
const note = (m) => console.log(`  · ${m}`);

if (!fs.existsSync(FROZEN)) { console.error('找不到冻结快照目录 aipack-samples/'); process.exit(2); }

// ---- 重跑生成器到临时目录（argv[2] = 输出目录，见 ai-pack-sample.mjs:32）----
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'aipack-snap-'));
try {
  execFileSync('node', [path.join(ROOT, 'tools', 'ai-pack-sample.mjs'), tmp], {
    cwd: ROOT, stdio: ['ignore', 'ignore', 'inherit'],
  });
} catch (e) {
  console.error('快照生成器本身运行失败（不是快照漂移）：', e.message);
  fs.rmSync(tmp, { recursive: true, force: true });
  process.exit(2);
}

const walk = (dir) => {
  const out = [];
  for (const ent of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, ent.name);
    if (ent.isDirectory()) out.push(...walk(p));
    else out.push(path.relative(dir, p));
  }
  return out.sort();
};

// README.md 不参与逐字节比对（人手维护），但两边都应存在
const frozenFiles = walk(FROZEN).filter((f) => f !== 'README.md');
const tmpFiles = walk(tmp);

console.log('[1/4] 文件集一致');
{
  const fsSet = new Set(frozenFiles), tsSet = new Set(tmpFiles);
  const onlyFrozen = frozenFiles.filter((f) => !tsSet.has(f));
  const onlyTmp = tmpFiles.filter((f) => !fsSet.has(f));
  if (onlyFrozen.length || onlyTmp.length) {
    fail.push(`文件集不一致：冻结多出 ${JSON.stringify(onlyFrozen)}，新生成多出 ${JSON.stringify(onlyTmp)}`);
  } else {
    note(`${frozenFiles.length} 个文件，集合一致`);
  }
  for (const m of ALL_MODES) if (!fs.existsSync(path.join(FROZEN, 'README.md'))) { /* noop */ }
}

console.log('[2/4] 内容逐字节一致（sha256）');
const changed = [];
{
  for (const rel of frozenFiles) {
    const a = fs.readFileSync(path.join(FROZEN, rel));
    const b = fs.readFileSync(path.join(tmp, rel));
    const ha = crypto.createHash('sha256').update(a).digest('hex');
    const hb = crypto.createHash('sha256').update(b).digest('hex');
    if (ha !== hb) changed.push(rel);
  }
  if (changed.length) {
    fail.push(`${changed.length} 个文件与冻结快照不一致：\n      ${changed.map((f) => `- ${f}`).join('\n      ')}\n      （若改动是有意的，重跑 node tools/ai-pack-sample.mjs 并人工确认后再发版）`);
  } else {
    note(`${frozenFiles.length} 个文件全部逐字节一致`);
  }
}

console.log('[3/4] 魂卦关键事实独立断言（按卦名，非全文计数）');
// 样例盘固定为雷火丰（震上离下，坎宫水，世5应2），不是归魂/游魂。
// 断言按卦名写死：若将来样例加入明夷/师，应在此补「明夷→游魂、师→归魂」的对称断言。
const FACT_STR = '雷火丰（震上离下，坎宫水，世5应2）';
{
  for (const mode of LIUYAO_MODES) {
    const base = `liuyao-${mode}`;
    const txt = fs.readFileSync(path.join(FROZEN, `${base}.txt`), 'utf8');
    const json = JSON.parse(fs.readFileSync(path.join(FROZEN, `${base}.json`), 'utf8'));
    const bg = json.chart_data?.ben_gua;

    // K1：雷火丰本卦行不得带 归魂/游魂 标签（其他卦名若出现该标签不在本断言范围）
    const benLine = txt.split('\n').find((l) => l.startsWith('本卦：雷火丰'));
    if (!benLine) fail.push(`${base}.txt K1：找不到「本卦：雷火丰」行`);
    else if (/归魂|游魂/.test(benLine)) fail.push(`${base}.txt K1：雷火丰被错标魂卦（${benLine}）`);

    // K2：事实串必须逐字正确
    if (!txt.includes(`本卦：${FACT_STR}`)) fail.push(`${base}.txt K2：事实串不是「本卦：${FACT_STR}」`);

    // K3：JSON 结构化字段
    if (!bg) fail.push(`${base}.json K3：缺 chart_data.ben_gua`);
    else {
      const checks = [
        ['name', '雷火丰'], ['upper', '震'], ['lower', '离'],
        ['palace', '坎'], ['palace_wu_xing', '水'],
        ['shi_pos', 5], ['ying_pos', 2],
      ];
      for (const [k, v] of checks) if (bg[k] !== v) fail.push(`${base}.json K3：ben_gua.${k} 应为 ${JSON.stringify(v)}，实为 ${JSON.stringify(bg[k])}`);
      if (!Array.isArray(bg.flags) || bg.flags.some((x) => /归魂|游魂/.test(String(x)))) {
        fail.push(`${base}.json K3：ben_gua.flags 不应含魂卦标记，实为 ${JSON.stringify(bg.flags)}`);
      }
    }
  }
  note('K1 魂卦标签 / K2 事实串 / K3 JSON 字段，3 模式 × 各断言通过');
}

console.log('[4/4] 三模式 chart_data 深相等 + 四格式事实串交叉');
{
  // K4：三模式 chart_data 必须逐字节深相等（模式只改详略，不改排盘事实）
  const charts = LIUYAO_MODES.map((m) =>
    JSON.stringify(JSON.parse(fs.readFileSync(path.join(FROZEN, `liuyao-${m}.json`), 'utf8')).chart_data));
  if (!charts.every((c) => c === charts[0])) fail.push('K4：三模式 chart_data 不深相等（排盘事实不应因模式而变）');

  // 事实串在 txt、html 内嵌 JSON、index.html 三处都必须一致
  for (const mode of LIUYAO_MODES) {
    const base = `liuyao-${mode}`;
    const html = fs.readFileSync(path.join(FROZEN, `${base}.html`), 'utf8');
    const m = html.match(/<script type="application\/json" id="ai-pack-json">([\s\S]*?)<\/script>/);
    if (!m) { fail.push(`${base}.html K5：未内嵌 application/json`); continue; }
    let embedded;
    try { embedded = JSON.parse(m[1].replace(/\\u003c/g, '<')); }
    catch (e) { fail.push(`${base}.html K5：内嵌 JSON 解析失败 ${e.message}`); continue; }
    const eb = embedded.chart_data?.ben_gua;
    const factFromJson = eb && `${eb.name}（${eb.upper}上${eb.lower}下，${eb.palace}宫${eb.palace_wu_xing}，世${eb.shi_pos}应${eb.ying_pos}）`;
    if (factFromJson !== FACT_STR) fail.push(`${base}.html K5：内嵌 JSON 事实串为 ${factFromJson}`);
    const txt = fs.readFileSync(path.join(FROZEN, `${base}.txt`), 'utf8');
    if (!txt.includes(`本卦：${factFromJson}`)) fail.push(`${base} K5：txt 与内嵌 JSON 事实串不一致`);
  }
  // index.html 必须含同一事实串且只出现六爻三模式锚点
  const idx = fs.readFileSync(path.join(FROZEN, 'index.html'), 'utf8');
  for (const [d, mm] of [['liuyao', 'quick'], ['liuyao', 'classic'], ['liuyao', 'research']]) {
    if (!idx.includes(`id="frag-${d}-${mm}"`)) fail.push(`index.html K5：缺锚点 frag-${d}-${mm}`);
  }
  if (!idx.includes(FACT_STR)) fail.push('index.html K5：不含唯一事实串 ' + FACT_STR);
  note('K4 chart_data 三模式深相等 / K5 txt·json·html·index 四格式交叉一致');
}

fs.rmSync(tmp, { recursive: true, force: true });

console.log('');
if (fail.length) {
  console.error(`❌ aipack-snapshot-check: ${fail.length} 项失败`);
  for (const f of fail) console.error(`  - ${f}`);
  process.exit(1);
}
const total = frozenFiles.length;
console.log(`✅ aipack-snapshot-check: OK（${total} 文件逐字节一致，K1-K5 独立断言通过）`);
process.exit(0);
