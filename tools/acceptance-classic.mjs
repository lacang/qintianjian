#!/usr/bin/env node
/**
 * acceptance-classic.mjs — 观心 P0 产品体验验收记录生成器
 *
 * 为什么需要它
 * ------------
 * 董事长无法访问本机 localhost，也就无法亲手走完三个核心流程。
 * 技术验收（门禁 17/17、三组测试全绿）证明的是「代码按设计工作」，
 * 不能替代「产品体验是否成立」。两者之间必须有一座桥：**可被审查的体验记录**。
 *
 * 本文件就是那座桥。它做三件事：
 *   1. 用真实浏览器、真实点击、真实 localStorage 走完三个核心流程，每步留截图；
 *   2. 逐条对照董事长给出的验收标准与失败标准，把「实际观察到的行为」写成结构化数据；
 *   3. 主动制造异常状态（空输入、坏 localStorage、不存在的内容 id、缺失字段的关系），
 *      观察产品是「显式失败」还是「猜一个看起来合理的结果」。
 *
 * 它不判定通过与否——那是董事长的权力。它只负责把事实摆清楚：
 * 每一步点了什么、看到什么、数据是什么。
 *
 * 与 test-classic-ui.mjs 的分工
 * ----------------------------
 * test-classic-ui 是**回归测试**：钉住已知的结构性保证，红了就阻断发版，断言锚 data-* 结构。
 * 本文件是**验收记录**：不钉结论，产出截图与观察数据，供人逐项验收。两者不重复。
 *
 * 用法：
 *   node tools/acceptance-classic.mjs [--out 目录] [--keep-profile]
 * 产物：
 *   <out>/01-*.png …      关键页面截图
 *   <out>/report.json     结构化观察数据
 *   <out>/report.md       人可读的逐项记录
 * 退出码：0 记录完成 / 1 记录过程本身出错 / 3 环境不具备
 */
import path from 'node:path';
import os from 'node:os';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import { startStaticServer } from './lib/static-server.mjs';
import { findChrome, parseArgs } from './lib/browser.mjs';
import { openPage } from './lib/cdp.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(path.join(HERE, '..'));
const APP = path.join(ROOT, 'app');
const { has, opt } = parseArgs(process.argv.slice(2));

const chrome = findChrome();
if (!chrome) {
  console.error('[acceptance] 找不到 Chrome/Chromium（可用 QT_CHROME=<路径> 指定）');
  process.exit(3);
}

const stamp = new Date().toISOString().replace(/[-:]/g, '').replace(/\..+/, '').replace('T', '-');
const OUT = path.resolve(opt('--out') || path.join(ROOT, '..', '验收记录', `观心P0体验-${stamp}`));
fs.mkdirSync(OUT, { recursive: true });

const steps = [];      // 逐项观察记录
const notes = [];      // 供 report.md 用的分组标题
let shotNo = 0;

function section(title) { notes.push({ type: 'section', title }); }
/**
 * 记录一条观察。expect 表示「这条期望看到的结果」：
 *   expect=true  —— value 为假就是问题（✗）
 *   expect=false —— value 为真才是问题（✗）
 *   expect=null  —— 只记录事实，不判好坏（异常状态探针用这个）
 * 不判好坏的项在 report.md 里统一标「·」，把判断权留给董事长。
 */
function observe(name, value, extra = '', expect = true) {
  const rec = { name, value, extra, expect, at: new Date().toISOString() };
  steps.push(rec);
  notes.push({ type: 'item', ...rec });
  const bad = expect === null ? false : (expect ? value === false : value === true);
  console.log(`  ${bad ? '✗' : '·'} ${name} = ${typeof value === 'object' ? JSON.stringify(value) : value}${extra ? '  — ' + extra : ''}`);
  return value;
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const srv = await startStaticServer(APP);
const profile = has('--keep-profile')
  ? path.join(os.tmpdir(), 'qt-accept-profile')
  : fs.mkdtempSync(path.join(os.tmpdir(), 'qt-accept-'));

let sess = null;
let exitCode = 0;

async function ev(expr) {
  const r = await sess.evaluate(expr);
  if (r && r.error) throw new Error(r.error);
  return r.value;
}
async function until(expr, timeout = 8000) {
  const t0 = Date.now();
  while (Date.now() - t0 < timeout) {
    const v = await ev(expr);
    if (v) return true;
    await sleep(120);
  }
  return false;
}
async function click(sel) {
  return ev(`(() => { const e = document.querySelector(${JSON.stringify(sel)}); if (!e) return 'no-el'; e.click(); return 'ok'; })()`);
}

/** 截当前视口，返回相对文件名 */
async function shot(label) {
  shotNo += 1;
  const name = `${String(shotNo).padStart(2, '0')}-${label}.png`;
  const r = await sess.cdp.send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: false });
  fs.writeFileSync(path.join(OUT, name), Buffer.from(r.data, 'base64'));
  notes.push({ type: 'shot', name, label });
  console.log(`  📷 ${name}`);
  return name;
}

/**
 * 截整页（长图），用于「八层是否都在」这类需要看全的场合。
 *
 * 不能直接用 captureBeyondViewport + clip：底部导航是 position:fixed，
 * 那样截出来它会浮在长图正中间，看上去像页面被硬切断——把工具的伪影
 * 当成产品缺陷，是审查里最不该发生的事。所以先把视口临时拉到整页高度，
 * 让 fixed 元素自然落到最底下，截完再恢复。
 */
async function shotFull(label) {
  shotNo += 1;
  const name = `${String(shotNo).padStart(2, '0')}-${label}.png`;
  const m1 = await sess.cdp.send('Page.getLayoutMetrics');
  const h = Math.min(Math.ceil((m1.cssContentSize || m1.contentSize || {}).height || 1200), 6000);
  await sess.cdp.send('Emulation.setDeviceMetricsOverride', { width: 390, height: h, deviceScaleFactor: 2, mobile: true });
  await sleep(260);
  const m2 = await sess.cdp.send('Page.getLayoutMetrics');
  const h2 = Math.min(Math.ceil((m2.cssContentSize || m2.contentSize || {}).height || h), 6000);
  const r = await sess.cdp.send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: false });
  fs.writeFileSync(path.join(OUT, name), Buffer.from(r.data, 'base64'));
  await sess.cdp.send('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 2, mobile: true });
  await sleep(200);
  notes.push({ type: 'shot', name, label });
  console.log(`  📷 ${name}（整页 ${h2}px）`);
  return name;
}

async function gotoApp() {
  await sess.goto(srv.url + '/', 30000);
  await until(`document.readyState === 'complete' && !!document.querySelector('.tabbar .tab')`, 20000);
  await sleep(1500);
  await until(`!!document.querySelector('.tabbar .tab[data-view="classic"]')`, 15000);
}

async function openPanel(panelId) {
  for (let attempt = 0; attempt < 3; attempt++) {
    await click('.tabbar .tab[data-view="classic"]');
    const ready = await until(`!!document.querySelector('#classic-body .cl-tab[data-panel="${panelId}"]')`, 5000);
    if (!ready) { await sleep(500); continue; }
    const r = await click(`#classic-body .cl-tab[data-panel="${panelId}"]`);
    if (r !== 'ok') { await sleep(300); continue; }
    await sleep(220);
    const done = await ev(`!!document.querySelector('#cl-body') && document.querySelector('#cl-body').textContent.trim().length > 20`);
    if (done) return 'ok';
    await sleep(300);
  }
  return 'no-panel';
}

const ASK_RESULT = `(() => {
  const q = document.querySelector('#cl-body .cl-quote');
  if (!q) return null;
  const t = q.querySelector('.cl-quote-title');
  const o = q.querySelector('.cl-original');
  return { id: q.dataset.id, title: t ? t.textContent.trim() : '', original: o ? o.textContent.trim() : '' };
})()`;

/** 真实流程问心：不 pin 序号，完全走用户路径 */
async function askReal(question) {
  const panelOk = await openPanel('ask');
  let typed = null;
  if (question != null) {
    typed = await ev(`(() => {
      const t = document.querySelector('#cl-ask-input');
      if (!t) return { found: false };
      t.value = ${JSON.stringify(question)};
      return { found: true, len: t.value.length };
    })()`);
  }
  const r = await click('#cl-ask-go');
  await sleep(420);
  const warnOn = await ev(`(() => { const w = document.querySelector('#cl-ask-warn'); return w ? w.classList.contains('is-on') : null; })()`);
  return { panelOk, typed, clicked: r, warnOn, result: await ev(ASK_RESULT) };
}

try {
  sess = await openPage({ chrome, profile, tag: 'accept' });
  // 移动端视口：这是 PWA 的真实使用形态，桌面视口看不出产品问题
  await sess.cdp.send('Emulation.setDeviceMetricsOverride', {
    width: 390, height: 844, deviceScaleFactor: 2, mobile: true,
  });
  await gotoApp();

  // 从干净状态开始：任何残留的当日序号都会让「连续抽取不重复」这条无法验证
  await ev(`(() => { localStorage.clear(); return 'ok'; })()`);
  await gotoApp();

  // ══════════════════════════════════════════════════════════════════
  section('一、三个核心流程（董事长验收标准）');
  // ══════════════════════════════════════════════════════════════════

  // ---------- 1. 问心 ----------
  section('1. 问心 —— 失败标准：重复抽取、顺序丢失');

  const emptyAsk = await askReal(null);   // 一个字都不写直接点
  const emptyWarn = await ev(`(() => {
    const w = document.querySelector('#cl-ask-warn');
    let n = null;
    try { n = JSON.parse(localStorage.getItem('qintian.classic.askseq') || 'null'); } catch (e) {}
    return { on: !!(w && w.classList.contains('is-on')), text: w ? w.textContent.replace(/\\s+/g, '') : '', n: n && n.n };
  })()`);
  await shot('ask-01-空输入点静心一问');
  observe('空问题点「静心一问」：是否给出提示', emptyWarn.on);
  observe('空问题点「静心一问」：是否消耗当日序号（不应消耗）', emptyWarn.n === 0 || emptyWarn.n === null, `n=${emptyWarn.n}`);
  observe('提示是否给出另一条路（今日相遇）', /今日相遇/.test(emptyWarn.text), emptyWarn.text.slice(0, 60));
  observe('空问题时是否仍然抽出了结果（不应抽）', !emptyAsk.result, emptyAsk.result ? '抽出了 ' + emptyAsk.result.id : '未抽取');

  const A = await askReal('我在犹豫要不要辞掉现在的工作，怕后悔。');
  await shot('ask-02-写下困惑后的结果');
  observe('问心第一次抽到', A.result ? A.result.id + '｜' + A.result.title : '无结果');

  const B = await askReal('我和家里人已经三年没说过话了，该不该先低头？');
  await shot('ask-03-同一天第二次问心');
  observe('问心同一天第二次抽到', B.result ? B.result.id + '｜' + B.result.title : '无结果');
  observe('★ 同一天连续两次不重复',
    !!(A.result && B.result && A.result.id !== B.result.id),
    `${A.result && A.result.id} vs ${B.result && B.result.id}`);

  const seqBefore = await ev(`(() => { try { return JSON.parse(localStorage.getItem('qintian.classic.askseq') || 'null'); } catch (e) { return 'bad'; } })()`);
  observe('抽两次后的当日序号状态', JSON.stringify(seqBefore));

  // 退出重进：真实 reload，不是手工改 localStorage
  await gotoApp();
  await openPanel('ask');
  const afterReentryText = await ev(`(() => { const t = document.querySelector('#cl-ask-input'); return t ? String(t.value || '') : 'no-input'; })()`);
  observe('退出重进后输入框是否残留上次的问题', afterReentryText === '' ? '已清空（每次重新问）' : `残留「${afterReentryText}」`);

  const C = await askReal('第三个问题，验证重进之后会不会从头开始。');
  await shot('ask-04-退出重进后再问一次');
  observe('退出重进后第三次抽到', C.result ? C.result.id + '｜' + C.result.title : '无结果');
  const seqAfter = await ev(`(() => { try { return JSON.parse(localStorage.getItem('qintian.classic.askseq') || 'null'); } catch (e) { return 'bad'; } })()`);
  observe('重进并再问一次后的当日序号状态', JSON.stringify(seqAfter));
  observe('★ 退出重进后顺序延续（序号递增，不是回到开头）',
    !!(seqBefore && seqAfter && typeof seqAfter.n === 'number' && typeof seqBefore.n === 'number' && seqAfter.n === seqBefore.n + 1),
    `重进前 n=${seqBefore && seqBefore.n}，重进后再问 n=${seqAfter && seqAfter.n}`);
  const ids3 = [A.result && A.result.id, B.result && B.result.id, C.result && C.result.id].filter(Boolean);
  observe('★ 三次抽取互不重复', new Set(ids3).size === ids3.length, ids3.join(' / '));

  // ---------- 2. 一念三观 ----------
  section('2. 一念三观 —— 失败标准：仅仅保证三条内容不同');

  await openPanel('three');
  await shot('three-01-三观初始');
  await click('#cl-three-go');
  await sleep(250);
  const backs = await ev(`document.querySelectorAll('#cl-body .cl-card3.back').length`);
  await shot('three-02-洗出三张牌背');
  observe('洗出牌背数量', backs);

  for (let i = 0; i < 3; i++) { await click(`#cl-body .cl-card3.back[data-i="${i}"]`); await sleep(140); }
  await sleep(200);
  const three = await ev(`(() => Array.from(document.querySelectorAll('#cl-body .cl-card3.open')).map(e => {
    const o = e.querySelector('.cl-original');
    const g = e.querySelector('.cl-card3-g');
    const t = e.querySelector('.cl-quote-title');
    return { group: g ? g.textContent.trim() : '', original: o ? o.textContent.trim() : '', title: t ? t.textContent.trim() : '' };
  }))()`);
  await shotFull('three-03-三张全翻开');
  observe('三张牌各自的原文首句', three.map((x) => x.original.slice(0, 18)).join(' ｜ '));
  observe('三张牌各自所属思想群', three.map((x) => x.group).join(' ｜ '));
  observe('★ 三条来自三个不同思想群（分层抽样）',
    new Set(three.map((x) => x.group)).size === 3,
    `不同群数 ${new Set(three.map((x) => x.group)).size}`);
  observe('三条内容互不重复', new Set(three.map((x) => x.original)).size === 3);

  // ---------- 3. 辩一辩 ----------
  section('3. 辩一辩 —— 失败标准：提前泄露解释、出现正确答案、无法修改立场');

  await openPanel('debate');
  await sleep(200);
  await shot('debate-01-辩题列表');
  const dbList = await ev(`(() => Array.from(document.querySelectorAll('#cl-body .cl-db-item')).map(e => ({
    id: e.dataset.id, text: e.textContent.replace(/\\s+/g,'').slice(0, 40)
  })))()`);
  observe('辩题数量', dbList.length);
  observe('辩题清单', dbList.map((x) => x.id).join(' '));

  await ev(`(() => { const b = document.querySelector('#cl-body .cl-db-item[data-id="D-01"]'); if (b) b.click(); return 'ok'; })()`);
  await sleep(300);
  const before = await ev(`(() => {
    const b = document.querySelector('#cl-body');
    return {
      text: b.textContent.replace(/\\s+/g, ''),
      hasOriginal: !!b.querySelector('.cl-original'),
      hasQuestion: !!b.querySelector('.cl-db-q2'),
      stances: Array.from(b.querySelectorAll('.cl-st')).map(e => e.textContent.replace(/\\s+/g,'')),
      hasCommentary: !!b.querySelector('.cl-layer[data-layer="commentary"]'),
      hasCanon: !!b.querySelector('.cl-db-canon'),
      hasLineage: !!b.querySelector('.cl-db-lineage'),
    };
  })()`);
  await shot('debate-02-选立场前');
  observe('选立场前：是否展示原文', before.hasOriginal);
  observe('选立场前：是否给出面向用户的问题', before.hasQuestion);
  observe('选立场前：立场选项', before.stances.join(' / '));
  observe('★ 选立场前不出现历代注疏', !before.hasCommentary);
  observe('★ 选立场前不出现「原典实际说了什么」', !before.hasCanon);
  observe('★ 选立场前不出现「这一路历史上谁走过」', !before.hasLineage);

  await ev(`(() => { const bs = document.querySelectorAll('#cl-body .cl-st'); if (bs.length) bs[0].click(); return 'ok'; })()`);
  await sleep(320);
  const after = await ev(`(() => {
    const b = document.querySelector('#cl-body');
    return {
      text: b.textContent.replace(/\\s+/g, ''),
      hasCommentary: !!b.querySelector('.cl-layer[data-layer="commentary"]'),
      hasDispute: !!b.querySelector('.cl-layer[data-layer="dispute"]'),
      hasCanon: !!b.querySelector('.cl-db-canon'),
      hasLineage: !!b.querySelector('.cl-db-lineage'),
      canonText: (b.querySelector('.cl-db-canon') || { textContent: '' }).textContent.replace(/\\s+/g,'').slice(0, 80),
    };
  })()`);
  await shotFull('debate-03-选完立场后的依据');
  observe('选立场后：展开历代注疏', after.hasCommentary);
  observe('选立场后：展开注家分歧', after.hasDispute);
  observe('选立场后：给出「原典实际说了什么」', after.hasCanon, after.canonText);
  observe('选立场后：给出「这一路历史上谁走过」', after.hasLineage);
  observe('★ 全程不出现对错判定',
    !/答对|答错|你选错|你答对|正确答案是|标准答案是/.test(after.text),
    '扫「答对/答错/你选错/你答对/正确答案是/标准答案是」');

  await ev(`(() => { const bs = document.querySelectorAll('#cl-body .cl-st'); if (bs.length > 1) bs[1].click(); return 'ok'; })()`);
  await sleep(260);
  const changed = await ev(`(() => {
    const b = document.querySelector('#cl-body');
    return { text: b.textContent.replace(/\\s+/g,''), on: Array.from(b.querySelectorAll('.cl-st.on')).map(e => e.textContent.replace(/\\s+/g,'')) };
  })()`);
  await shot('debate-04-改主意后');
  observe('★ 允许改立场，且界面如实记录', /改过主意/.test(changed.text), '当前选中：' + changed.on.join('/'));
  observe('改主意后未被评价（不出现「前后不一 / 立场不稳 / 你之前说」）',
    !/前后不一|立场不稳|你之前说/.test(changed.text));

  // ══════════════════════════════════════════════════════════════════
  section('二、辅助检查');
  // ══════════════════════════════════════════════════════════════════

  // ---------- 4. 五种反馈 ----------
  const F = await askReal('我想验证点完反馈会不会把这一条换掉。');
  const fbBefore = F.result && F.result.id;
  const fbIds = await ev(`(() => Array.from(document.querySelectorAll('#cl-body .cl-fb-b')).map(b => b.dataset.fb))()`);
  observe('五种反馈全部呈现', fbIds.length === 5, JSON.stringify(fbIds));
  let fbChanged = 0;
  for (const fb of ['agree', 'disagree', 'unsure', 'recall', 'more']) {
    await ev(`(() => { const b = document.querySelector('#cl-body .cl-fb-b[data-fb="${fb}"]'); if (b) b.click(); return 'ok'; })()`);
    await sleep(150);
    const now = await ev(`(() => { const q = document.querySelector('#cl-body .cl-quote'); return q ? q.dataset.id : null; })()`);
    if (now !== fbBefore) fbChanged++;
  }
  await shot('fb-01-点完五种反馈');
  observe('★ 点完全部五种反馈后当前条目保持不变', fbChanged === 0,
    `原条目 ${fbBefore}，变化 ${fbChanged} 次`);

  // ---------- 5. 孤立节点 ----------
  //
  // 走真实入口：探索面板 → 点 LY-013 → 详情页。
  // 第一版是直接往 #classic-detail-body 注入 HTML，渲染函数验到了，
  // 但视图没切过去，截出来还是问心面板——孤立节点根本没出现在画面里。
  // 验收截图必须走用户真正走的那条路。
  await openPanel('explore');
  const orphanClick = await click('.cl-node[data-act="open"][data-id="LY-013"]');
  await sleep(520);
  observe('从探索面板进入 LY-013 详情页（真实入口）', orphanClick === 'ok', orphanClick);
  const orphan = await ev(`(() => {
    const b = document.querySelector('#classic-detail-body');
    return {
      text: b.textContent.replace(/\\s+/g, ''),
      entries: Array.from(b.querySelectorAll('.cl-entry')).map(e => ({ kind: e.dataset.kind, head: (e.querySelector('.cl-entry-h') || {}).textContent || '' })),
    };
  })()`);
  await shotFull('orphan-01-孤立节点LY-013');
  observe('孤立节点的入口及其性质', orphan.entries.map((e) => `${e.kind}｜${e.head.replace(/\s+/g, '')}`).join(' ; '));
  const topicEmpty = /暂无主题推荐/.test(orphan.text);
  const topicFilled = orphan.entries.some((e) => e.kind === 'topic');
  // 两种结果都合格：有内容就给「同一主题」入口并标注非思想关系；没内容就如实说暂无。
  // 不合格的只有第三种——既没推荐也没说明，那才是编造或漏做。
  observe('★ 孤立节点的主题入口有据可查（有内容给入口，无内容如实说明）', topicEmpty || topicFilled,
    topicEmpty ? '显示「暂无主题推荐」（本节点所属主题下没有其他内容）'
      : (topicFilled ? '给出「同一主题」入口，并标注「主题推荐，非思想关系」' : '既无推荐也无说明——这才是问题'));

  // ══════════════════════════════════════════════════════════════════
  section('三、异常状态与交互反馈');
  // ══════════════════════════════════════════════════════════════════

  // 6a. 空输入
  await ev(`(() => { localStorage.removeItem('qintian.classic.askseq'); return 'ok'; })()`);
  const empty2 = await askReal('');
  await shot('err-01-空输入');
  observe('空字符串输入点静心一问：不抽取', !empty2.result,
    `panel=${empty2.panelOk} typed=${JSON.stringify(empty2.typed)} clicked=${empty2.clicked} warn=${empty2.warnOn} result=${empty2.result && empty2.result.id}`);

  // 6b. 只有空白
  const blank = await askReal('   \n  \t ');
  observe('纯空白输入按「没写」处理（不抽取）', !blank.result,
    `panel=${blank.panelOk} typed=${JSON.stringify(blank.typed)} clicked=${blank.clicked} warn=${blank.warnOn} result=${blank.result && blank.result.id}`);

  // 6c. 超长输入
  const longQ = '我'.repeat(2000);
  const longRes = await askReal(longQ);
  await shot('err-02-超长输入');
  observe('2000 字输入是否崩溃', longRes.result ? '正常抽出 ' + longRes.result.id : '未抽出');
  observe('2000 字输入后页面是否仍可读',
    await ev(`document.querySelector('#cl-body').textContent.trim().length > 20`));

  // 6d. 坏 localStorage
  await ev(`(() => { localStorage.setItem('qintian.classic.askseq', '{这不是JSON'); return 'ok'; })()`);
  const bad = await askReal('序号数据被写坏了，还能不能正常用。');
  await shot('err-03-当日序号被写坏后');
  observe('当日序号是坏 JSON 时是否仍能抽取', !!bad.result, bad.result ? bad.result.id : '未抽出');

  // 6e. 跨日重洗
  await ev(`(() => { localStorage.setItem('qintian.classic.askseq', JSON.stringify({ d: '1999-01-01', n: 17 })); return 'ok'; })()`);
  const crossDay = await askReal('换一天会怎么表现。');
  const crossSeq = await ev(`(() => { try { return JSON.parse(localStorage.getItem('qintian.classic.askseq') || 'null'); } catch (e) { return 'bad'; } })()`);
  observe('旧日期序号（1999-01-01 n=17）跨日后的处理', JSON.stringify(crossSeq),
    crossDay.result ? '抽出 ' + crossDay.result.id : '未抽出');

  // 6f. 不存在的内容 id
  const notFound = await ev(`(async () => {
    const m = await import('./js/classic/classicview.js?v=122');
    const box = document.querySelector('#classic-detail-body');
    box.innerHTML = m.renderClassicDetail('LY-999');
    const t = box.textContent.replace(/\\s+/g, '');
    return { len: t.length, text: t.slice(0, 120), layers: box.querySelectorAll('.cl-layer').length };
  })()`);
  await shot('err-04-不存在的内容id');
  observe('渲染不存在的内容 id（LY-999）', `正文 ${notFound.len} 字 / ${notFound.layers} 层`,
    notFound.text || '（空白）', null);
  observe('★ 不存在的内容 id 不猜身份、不白屏', notFound.layers === 0 && notFound.len > 0);

  // 6g. undefined id
  const undef = await ev(`(async () => {
    const m = await import('./js/classic/classicview.js?v=122');
    const box = document.querySelector('#classic-detail-body');
    try { box.innerHTML = m.renderClassicDetail(undefined); } catch (e) { return { threw: true, msg: String(e.message || e) }; }
    const t = box.textContent.replace(/\\s+/g, '');
    return { threw: false, len: t.length, text: t.slice(0, 120), layers: box.querySelectorAll('.cl-layer').length };
  })()`);
  observe('渲染 undefined id 的处理', undef.threw ? '抛错（显式失败）' : `正文 ${undef.len} 字 / ${undef.layers} 层`,
    undef.threw ? undef.msg : (undef.text || '（空白）'), null);

  // 6h. 缺失 display_class 的关系不得出现在界面
  const missing = await ev(`(async () => {
    const core = await import('./js/classic/classic-core.js?v=122');
    const bad = core.relationBadge({ id: 'X-TEST', status: 'verified' });
    const bad2 = core.relationBadge({ id: 'Y-TEST', status: 'verified', display_class: 'something_else' });
    return { bad, bad2 };
  })()`);
  observe('缺 display_class 的关系的展示判定', JSON.stringify(missing.bad));
  observe('非法 display_class 的关系的展示判定', JSON.stringify(missing.bad2));
  observe('★ 两者都不会被标成「原典有据」',
    !/原典有据/.test((missing.bad && missing.bad.badge) || '') && !/原典有据/.test((missing.bad2 && missing.bad2.badge) || ''));

  // ══════════════════════════════════════════════════════════════════
  section('四、26 个思想节点完整可达');
  // ══════════════════════════════════════════════════════════════════

  const nodes = await ev(`(async () => {
    const core = await import('./js/classic/classic-core.js?v=122');
    return core.allNodes().map(n => n.id);
  })()`);
  observe('内容库节点总数', nodes.length);

  const reach = [];
  for (const id of nodes) {
    const r = await ev(`(async () => {
      const m = await import('./js/classic/classicview.js?v=122');
      const box = document.querySelector('#classic-detail-body');
      try { box.innerHTML = m.renderClassicDetail(${JSON.stringify(id)}); }
      catch (e) { return { id: ${JSON.stringify(id)}, threw: String(e.message || e) }; }
      const t = box.textContent.replace(/\\s+/g, '');
      return {
        id: ${JSON.stringify(id)},
        layers: Array.from(box.querySelectorAll('.cl-layer')).map(e => e.dataset.layer),
        rels: box.querySelectorAll('.cl-rel').length,
        entries: box.querySelectorAll('.cl-entry').length,
        len: t.length,
        emptyLayer: Array.from(box.querySelectorAll('.cl-layer')).filter(e => e.textContent.replace(/\\s+/g,'').length < 8).map(e => e.dataset.layer),
      };
    })()`);
    reach.push(r);
    await sleep(20);
  }
  const unreachable = reach.filter((r) => r.threw || !r.layers || r.layers.length !== 8 || r.len < 80);
  const emptyLayers = reach.filter((r) => (r.emptyLayer || []).length > 0);
  observe('每个节点都能渲染出八层', unreachable.length === 0,
    unreachable.length ? unreachable.map((b) => `${b.id}:${b.threw || (b.layers || []).length + '层/' + b.len + '字'}`).join(' | ') : `${reach.length}/${reach.length} 均 8 层`);
  observe('没有空层（某层渲染成空白）', emptyLayers.length === 0,
    emptyLayers.length ? emptyLayers.map((r) => `${r.id}:${r.emptyLayer.join(',')}`).join(' | ') : '无空层');

  // 逐节点表格写进 report.json，供董事长抽查任意一条
  fs.writeFileSync(path.join(OUT, 'nodes.json'), JSON.stringify(reach, null, 2));

  // 抽样截图：首条、一条有关系多的、一条孤立的、末条
  const rich = reach.slice().sort((a, b) => b.rels - a.rels)[0];
  for (const pick of [reach[0], rich, reach.find((r) => r.rels === 0) || reach[3], reach[reach.length - 1]]) {
    if (!pick) continue;
    await ev(`(async () => {
      const m = await import('./js/classic/classicview.js?v=122');
      document.querySelector('#classic-detail-body').innerHTML = m.renderClassicDetail(${JSON.stringify(pick.id)});
      return 'ok';
    })()`);
    await sleep(250);
    await shotFull(`node-${pick.id}`);
  }

  // ══════════════════════════════════════════════════════════════════
  // 异常收集
  // ══════════════════════════════════════════════════════════════════
  section('五、运行期异常');
  observe('未捕获异常数', sess.exceptions.length, sess.exceptions.map((e) => e.text).slice(0, 3).join(' | '));
  const realErrors = sess.consoleErrors.filter((t) => !/favicon/i.test(t));
  observe('console.error 数', realErrors.length, realErrors.slice(0, 3).join(' | '));
  observe('资源加载失败数', sess.loadFailed.length, sess.loadFailed.slice(0, 3).join(' | '));

} catch (e) {
  console.error('[acceptance] 记录过程中断：', e && e.message);
  notes.push({ type: 'item', name: '记录过程中断', value: String(e && e.message), extra: '' });
  exitCode = 1;
} finally {
  if (sess) { try { await sess.close(); } catch { /* 忽略 */ } }
  await srv.close();
}

// ---------------- 落盘 ----------------
fs.writeFileSync(path.join(OUT, 'report.json'), JSON.stringify({
  generated_at: new Date().toISOString(),
  viewport: '390x844 @2x（移动端）',
  app_version: 'v122',
  observations: steps,
}, null, 2));

const md = [];
md.push(`# 观心 P0 体验记录（${new Date().toLocaleString('zh-CN', { timeZone: 'Asia/Shanghai' })}）`);
md.push('');
md.push('- 版本：v122（未提交、未推送、未部署）');
md.push('- 视口：390×844 @2x（移动端真实形态）');
md.push('- 方式：真实浏览器、真实点击、真实 localStorage，未 pin 任何序号');
md.push('- 说明：本文件只记录**实际观察到的行为**，通过与否由董事长判定');
md.push('');
for (const n of notes) {
  if (n.type === 'section') { md.push(''); md.push(`## ${n.title}`); md.push(''); }
  else if (n.type === 'shot') { md.push(`![${n.label}](${n.name})`); md.push(''); }
  else {
    const mark = n.expect === null
      ? '·'
      : ((n.expect ? n.value === false : n.value === true) ? '❌' : '✅');
    const shown = typeof n.value === 'object' ? JSON.stringify(n.value) : n.value;
    md.push(`- ${mark} **${n.name}**：${shown}${n.extra ? `　_${n.extra}_` : ''}`);
  }
}
fs.writeFileSync(path.join(OUT, 'report.md'), md.join('\n'));

console.log('');
console.log(`✅ 体验记录已生成：${OUT}`);
console.log(`   截图 ${shotNo} 张，观察项 ${steps.length} 条`);
console.log(`   重点看 report.md`);
process.exit(exitCode);
