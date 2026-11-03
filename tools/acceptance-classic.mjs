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
import { execSync } from 'node:child_process';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(path.join(HERE, '..'));
const APP = path.join(ROOT, 'app');
const { has, opt } = parseArgs(process.argv.slice(2));

// 版本号与提交号必须从真实文件读，绝不写死。
// 2026-10-31 发版后跑本脚本，report 里仍写着 v122 —— 因为这一行原来硬编码了字符串。
// 归档证据标错版本，比没有证据更糟：它看起来像证据。
function readAppVersion() {
  try {
    const m = fs.readFileSync(path.join(APP, 'sw.js'), 'utf8').match(/qintian-v(\d+)/);
    return m ? `v${m[1]}` : 'unknown';
  } catch { return 'unknown'; }
}
function readGitHead() {
  try {
    const head = execSync('git rev-parse --short HEAD', { cwd: ROOT, encoding: 'utf8' }).trim();
    const dirty = execSync('git status --porcelain', { cwd: ROOT, encoding: 'utf8' }).trim();
    return { head, dirty: dirty.length > 0 };
  } catch { return { head: 'unknown', dirty: null }; }
}
const APP_VERSION = readAppVersion();
const GIT = readGitHead();

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

// 默认起本地静态服务跑本地产物。
// --url <线上地址> 时直接打线上，用于发版后两站真实浏览器验收：
// 本地 73 项全过不代表线上全过——SW 抢缓存、CDN 回源、MIME、路径大小写
// 这些问题只在真站上才暴露。
const ONLINE = opt('--url') || '';
const srv = ONLINE ? { url: ONLINE.replace(/\/$/, ''), close: async () => {} } : await startStaticServer(APP);
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
    // 导航进行中 evaluate 会因 context 销毁而失败，那是预期内的，继续等就行。
    try { if (await ev(expr)) return true; } catch { /* 正在导航 */ }
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
  // coze.site 是共享域，被反爬限流时会先回 444 再重试。
  // 关键一点：Page.navigate 的**响应**超时，不代表导航没发生——请求可能已经在路上，
  // 页面正在加载。所以 send 超时不要当成失败直接放弃，接着看 readyState 就行。
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      await sess.cdp.send('Page.navigate', { url: srv.url + '/' });
    } catch { /* 响应超时 ≠ 导航失败，下面用 readyState 判真伪 */ }
    const ready = await until(`document.readyState === 'complete' && !!document.querySelector('.tabbar .tab')`, 30000);
    if (!ready) { await sleep(1500); continue; }
    await sleep(1200);
    if (await until(`!!document.querySelector('.tabbar .tab[data-view="classic"]')`, 15000)) return;
  }
  throw new Error('页面三次都没就绪');
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

  // 从干净状态开始：残留的手记会让「再次遇到时提示上次想法」这条无法验证
  await ev(`(() => { localStorage.clear(); return 'ok'; })()`);
  await gotoApp();

  const VH = 844;

  // ══════════════════════════════════════════════════════════════════
  // 一、打开观心：第一屏给全了吗
  // ══════════════════════════════════════════════════════════════════
  section('一、打开观心：第一屏给全了吗（产品文件「第一阶段」）');
  const tabOk = await click('.tabbar .tab[data-view="classic"]');
  await sleep(700);
  observe('从底部导航进入观心', tabOk === 'ok', tabOk);

  const first = await ev(`(() => {
    const b = document.querySelector('#cl-body');
    if (!b) return null;
    const q = (s) => b.querySelector(s);
    const inView = (el) => { if (!el) return false; const r = el.getBoundingClientRect(); return r.top < ${VH} && r.bottom > 0; };
    const o = q('.cl-read-o'), src = q('.cl-read-src'), mod = q('.cl-modern'), think = q('.cl-think'), more = q('.cl-more');
    return {
      original: o ? o.textContent.trim() : '',
      location: src ? src.textContent.trim() : '',
      modern: mod ? mod.textContent.trim() : '',
      think: think ? think.textContent.trim() : '',
      moreLabel: more ? more.textContent.trim() : '',
      srcTag: q('.cl-src-tag') ? q('.cl-src-tag').textContent.trim() : '',
      inView: { original: inView(o), location: inView(src), modern: inView(mod), think: inView(think), more: inView(more) },
      tabs: [...document.querySelectorAll('#view-classic .cl-tab')].map((t) => t.textContent.trim()),
      hasFav: !!q('[data-act="fav"]'),
      fullText: b.textContent.replace(/\\s+/g, ' ').trim(),
    };
  })()`);
  if (!first) throw new Error('观心首页没有渲染出 #cl-body');

  observe('第一屏有原文', first.original.length > 0, `「${first.original.slice(0, 22)}…」`);
  observe('第一屏有出处', first.location.length > 0, first.location);
  observe('第一屏有现代解释', first.modern.length > 0, `「${first.modern.slice(0, 30)}…」`);
  observe('第一屏有思考角度', first.think.length > 0, `「${first.think.slice(0, 24)}…」`);
  observe('第一屏有继续探索入口', first.moreLabel.length > 0, first.moreLabel);
  observe('★ 原文不用滚动就在首屏', first.inView.original === true);
  observe('★ 现代解释不用滚动就在首屏', first.inView.modern === true);
  observe('★ 继续探索入口不用滚动就在首屏', first.inView.more === true);
  observe('现代解释被标注为编辑撰写、不是古人原意', /不是古人原意|编辑撰写/.test(first.srcTag), first.srcTag);
  // v128：三入口扩到四入口，新增「遇见」，「困惑」改名为「探索」
  observe('四个入口是「今日 / 遇见 / 探索 / 手记」',
    JSON.stringify(first.tabs) === JSON.stringify(['今日', '遇见', '探索', '手记']), first.tabs.join('/'));
  observe('收藏仍可用（旧功能未删）', first.hasFav === true);

  // 编辑后台词汇不该出现在用户面前
  const jargon = ['抽取', '随机', '今日第', '序号', '节点', '数据集', '置信度', 'relation', 'cluster'];
  const hit = jargon.filter((w) => first.fullText.includes(w));
  observe('★ 首屏不出现编辑后台词汇', hit.length === 0, hit.join('/'));
  await shot('打开观心第一屏');

  // ══════════════════════════════════════════════════════════════════
  // 二、阅读五步
  // ══════════════════════════════════════════════════════════════════
  section('二、阅读五步：看懂 → 发现 → 探索 → 联系自己 → 留下收获');

  const stepClick = async (n) => {
    const r = await ev(`(() => {
      const b = document.querySelector('#cl-body [data-act="step"][data-step="${n}"]');
      if (!b) return 'no-btn';
      b.click();
      return 'ok';
    })()`);
    await sleep(650);
    return r;
  };

  // 第 2 步
  const s2 = await stepClick(2);
  observe('第 1 步可以往下展开', s2 === 'ok', s2);
  const d2 = await ev(`(() => {
    const b = document.querySelector('#cl-body');
    const g = (s) => { const e = b.querySelector(s); return e ? e.textContent.replace(/\\s+/g, ' ').trim() : ''; };
    return { block: !!b.querySelector('.cl-step2'), ctx: g('.cl-step2 .cl-ctx, .cl-step2 .cl-modern, .cl-step2 p'), all: g('.cl-step2') };
  })()`);
  observe('第 2 步给出「这句话是在什么场合说的」', d2.all.includes('场合') || d2.all.length > 40, d2.all.slice(0, 40));
  await shot('第2步发现');

  // 第 3 步
  const s3 = await stepClick(3);
  observe('第 2 步可以继续往下展开', s3 === 'ok', s3);
  const d3 = await ev(`(() => {
    const b = document.querySelector('#cl-body');
    const t = (s) => { const e = b.querySelector(s); return e ? e.textContent.replace(/\\s+/g, ' ').trim() : ''; };
    return {
      hasStep3: !!b.querySelector('.cl-step3'),
      hasOpen: !!b.querySelector('[data-act="open"]'),
      all: t('.cl-step3'),
    };
  })()`);
  observe('第 3 步有「历代注家怎么解」', /注家|注疏|历代/.test(d3.all), d3.all.slice(0, 36));
  observe('第 3 步有「完整资料」入口（原典八层仍可达）', d3.hasOpen === true);
  await shot('第3步探索');

  // 「我怎么看」：就地展开，不跳页
  const dbOpen = await ev(`(() => {
    const b = document.querySelector('#cl-body [data-act="db-inline"]');
    if (!b) return { found: false };
    b.click();
    return { found: true, label: b.textContent.trim() };
  })()`);
  await sleep(550);
  const dbIn = await ev(`(() => {
    const b = document.querySelector('#cl-body');
    const secs = [...b.querySelectorAll('.cl-db-in .cl-db-sec-h')].map((e) => e.textContent.trim());
    const st = [...b.querySelectorAll('.cl-db-in .cl-st')].map((e) => e.textContent.trim());
    const detailOn = !!document.querySelector('#view-classic-detail') && document.querySelector('#view-classic-detail').classList.contains('on');
    return {
      secs, st,
      stillHere: !detailOn && !!b.querySelector('.cl-read'),
      hasDiffer: !!b.querySelector('#cl-differ'),
    };
  })()`);
  observe('第 3 步有「我怎么看」入口', dbOpen.found === true, dbOpen.label || '');
  observe('★ 点开后不跳页，仍在这一条内容里', dbIn.stillHere === true);
  observe('四段齐全（原文在说什么/历代注家/我有不同看法）',
    dbIn.secs.some((h) => /原文在说什么/.test(h)) && dbIn.secs.some((h) => /历代注家/.test(h)) && dbIn.secs.some((h) => /我有不同看法/.test(h)),
    dbIn.secs.join(' / '));
  observe('★ 列的是多种读法，不是正反两方', dbIn.st.length >= 3 && !/正方|反方/.test(dbIn.st.join('')), `读法 ${dbIn.st.length} 种`);
  observe('★ 不选任何读法也能写自己的理由', dbIn.hasDiffer === true);
  await shot('我怎么看-展开');

  // 选一种读法，看是不是「对错判定」
  await ev(`(() => { const b = document.querySelector('#cl-body .cl-db-in .cl-st'); if (b) b.click(); return 'ok'; })()`);
  await sleep(450);
  const dbChosen = await ev(`(() => {
    const b = document.querySelector('#cl-body');
    const mine = b.querySelector('.cl-db-mine');
    return {
      head: (b.querySelector('.cl-db-mine .cl-db-sec-h') || { textContent: '' }).textContent.trim(),
      text: mine ? mine.textContent.replace(/\s+/g, ' ').trim() : '',
      alt: (b.querySelector('.cl-db-alt-h') || { textContent: '' }).textContent.trim(),
    };
  })()`);
  observe('选了之后显示「你更接近哪一种理解」', /你更接近/.test(dbChosen.head), dbChosen.head);
  observe('★ 明确写着这不是对错判定', /不是对错判定/.test(dbChosen.text), dbChosen.text.slice(-30));
  observe('另一种读法被标为「如果你站在另一边」', /另一边/.test(dbChosen.alt), dbChosen.alt);
  await shot('我怎么看-更接近哪一种');

  // 第 4 步
  const s4 = await stepClick(4);
  observe('第 3 步可以继续往下展开', s4 === 'ok', s4);
  const d4 = await ev(`(() => {
    const b = document.querySelector('#cl-body');
    const fb = [...b.querySelectorAll('[data-act="fb"]')].map((e) => e.textContent.trim());
    return { fb, hasFoot: !!b.querySelector('.cl-step4 .cl-foot') };
  })()`);
  observe('★ 五种反馈全部在（触动/了解/不同看法/没想明白/留下想法）', d4.fb.length === 5, d4.fb.join(' / '));
  observe('★ 明确写了「可以不选」', d4.hasFoot === true);
  await shot('第4步联系自己');

  // 点「我有不同看法」，看是否有即时回应
  const fbClick = await ev(`(() => {
    const b = document.querySelector('#cl-body [data-act="fb"][data-fb="disagree"]');
    if (!b) return 'no-btn';
    b.click();
    return 'ok';
  })()`);
  await sleep(500);
  const fbEcho = await ev(`(() => {
    const e = document.querySelector('#cl-body .cl-fb-echo');
    if (!e) return null;
    return { text: e.textContent.replace(/\\s+/g, ' ').trim(), btns: [...e.querySelectorAll('button')].map((x) => x.textContent.trim()) };
  })()`);
  observe('★ 表达「有不同看法」后立刻得到回应', !!fbEcho, fbEcho ? fbEcho.text.slice(0, 40) : '没有回应');
  observe('回应里给了下一步（不是一句「收到」）', !!(fbEcho && fbEcho.btns.length), fbEcho ? fbEcho.btns.join(' / ') : '');
  observe('★ 回应文案不含「层」这类内部术语', !(fbEcho && /这一层|第.层|层数/.test(fbEcho.text)), fbEcho ? fbEcho.text : '');
  await shot('表达不同看法后的回应');

  // 第 5 步
  const s5 = await stepClick(5);
  observe('第 4 步可以继续往下展开', s5 === 'ok', s5);
  const hasInput = await ev(`!!document.querySelector('#cl-journal-input')`);
  observe('第 5 步有手记输入框', hasInput === true);
  await shot('第5步留下收获');

  const NOTE = '我一直以为克己是压抑自己。原来还有另一种读法。';
  await ev(`(() => { const t = document.querySelector('#cl-journal-input'); if (!t) return 'no-input'; t.value = ${JSON.stringify(NOTE)}; return 'ok'; })()`);
  const saveClick = await ev(`(() => { const b = document.querySelector('#cl-body [data-act="journal-save"]'); if (!b) return 'no-btn'; b.click(); return 'ok'; })()`);
  await sleep(800);
  observe('点「存进手记」', saveClick === 'ok', saveClick);

  const afterSave = await ev(`(() => {
    const b = document.querySelector('#cl-body');
    const end = b.querySelector('.cl-end');
    return {
      hasEnd: !!end,
      endText: end ? end.textContent.replace(/\\s+/g, ' ').trim() : '',
      inputLeft: !!b.querySelector('#cl-journal-input'),
      noteShown: end ? end.textContent.includes('我一直以为克己是压抑自己') : false,
      stored: (() => { try { const j = JSON.parse(localStorage.getItem('qintian.classic.journal') || '{}'); const k = Object.keys(j)[0]; return k ? j[k].length : 0; } catch { return -1; } })(),
    };
  })()`);
  observe('★ 存完自动进入结束态（不是停在输入框）', afterSave.hasEnd === true);
  observe('★ 结束态把刚写的那句话显示出来', afterSave.noteShown === true);
  observe('★ 存完后不再留着空输入框等人写第二遍', afterSave.inputLeft === false);
  observe('手记真的写进了本地存储', afterSave.stored === 1, `条数 ${afterSave.stored}`);
  observe('结束态给了下一步（不是「已完成」就没了）', /为难|手记|主题|下一条/.test(afterSave.endText), afterSave.endText.slice(0, 40));
  await shot('读完之后');

  // ══════════════════════════════════════════════════════════════════
  // 三、思想手记
  // ══════════════════════════════════════════════════════════════════
  section('三、思想手记（产品文件称「最重要的长期功能」）');

  const notesOk = await openPanel('notes');
  observe('能进入手记页', notesOk === 'ok', notesOk);
  const notesView = await ev(`(() => {
    const b = document.querySelector('#cl-body');
    const rows = [...b.querySelectorAll('.cl-jrow')];
    return {
      count: rows.length,
      text: rows.length ? rows[0].textContent.replace(/\\s+/g, ' ').trim() : '',
      intro: (b.querySelector('.cl-themes-intro') || {}).textContent || '',
    };
  })()`);
  observe('★ 手记页能看到刚写的那条', notesView.count >= 1, `${notesView.count} 条：${notesView.text.slice(0, 40)}`);
  observe('手记页说明了它是什么', notesView.intro.length > 0, notesView.intro.trim());
  await shot('手记页');

  // 回到今日，确认「再次遇到时提示上次想法」
  const backToday = await openPanel('today');
  observe('能回到今日', backToday === 'ok', backToday);
  const echo = await ev(`(() => {
    const b = document.querySelector('#cl-body');
    const e = b.querySelector('.cl-echo');
    return { has: !!e, text: e ? e.textContent.replace(/\\s+/g, ' ').trim() : '', hasOriginal: !!b.querySelector('.cl-read-o') };
  })()`);
  observe('★ 再次遇到同一条时，提示「你曾经读过」', echo.has === true, echo.text.slice(0, 40));
  observe('★ 提示里带着上次写的话', /我一直以为克己/.test(echo.text), echo.text.slice(0, 60));
  observe('旧记录没有挤掉原文（原文仍在）', echo.hasOriginal === true);
  await shot('再次遇到同一条');

  // ══════════════════════════════════════════════════════════════════
  // 四、困惑探索
  // ══════════════════════════════════════════════════════════════════
  section('四、探索：8 个现实问题入口，零输入可用');

  const themesOk = await openPanel('explore');
  observe('能进入探索页', themesOk === 'ok', themesOk);
  const themesView = await ev(`(() => {
    const b = document.querySelector('#cl-body');
    const ts = [...b.querySelectorAll('[data-act="theme"]')].map((e) => e.textContent.replace(/\\s+/g, ' ').trim());
    return { count: ts.length, names: ts, intro: (b.querySelector('.cl-themes-intro') || {}).textContent || '' };
  })()`);
  observe('★ 8 个现实问题入口都在', themesView.count === 8, themesView.names.join(' / '));
  observe('★ 不需要写任何东西就能用（页面没有输入框）', !(await ev(`!!document.querySelector('#cl-body textarea, #cl-body input')`)));
  await shot('困惑入口');

  // 逐个点开，看每个主题下有没有内容。
  // 不用固定 sleep：详情页渲染快慢取决于网络，慢站上 350ms 读到的还是列表，
  // 数出来是 0，报「空入口」这种假红。两个方向都轮询到状态确定为止。
  async function backToThemeList() {
    for (let i = 0; i < 40; i++) {
      const st = await ev(`(() => {
        const back = document.querySelector('#cl-body [data-act="back-themes"]');
        if (back) { back.click(); return 'clicked'; }
        return document.querySelector('#cl-body [data-act="theme"]') ? 'list' : 'wait';
      })()`);
      if (st === 'list') return true;
      await sleep(200);
    }
    return false;
  }

  const themeFill = [];
  for (const id of ['work', 'people', 'self', 'desire', 'direction', 'mood', 'principle', 'meaning']) {
    // 回到列表失败（多点了一次 back 会退出探索面板）时，直接重开面板兜底，
    // 否则后面每轮都点不到主题，会把「面板被自己点出去了」误记成「主题是空入口」。
    if (!(await backToThemeList())) await openPanel('explore');
    const opened = await ev(`(() => {
      const b = document.querySelector('#cl-body [data-act="theme"][data-id="${id}"]');
      if (!b) return 'no-btn';
      b.click();
      return 'ok';
    })()`);
    const got = await until(`document.querySelectorAll('#cl-body .cl-tp-item').length > 0`, 8000);
    const n = await ev(`document.querySelectorAll('#cl-body .cl-tp-item').length`);
    themeFill.push({ id, opened, n, got });
    if (!got) await openPanel('explore');
  }
  observe('★ 每个主题下都有可读条目（没有空入口）', themeFill.every((t) => t.n > 0),
    themeFill.map((t) => `${t.id}:${t.n}${t.opened !== 'ok' ? '(' + t.opened + ')' : ''}`).join(' '));

  // 人工编排：顺序、理由、关联类型、初读建议
  await until(`!!document.querySelector('#cl-body')`, 8000);
  const seqAudit = await ev(`(() => {
    const b = document.querySelector('#cl-body');
    if (!b) return { n: 0, nums: [], whys: 0, tags: 0, path: '' };
    const items = [...b.querySelectorAll('.cl-tp-item')];
    return {
      n: items.length,
      nums: items.map((e) => (e.querySelector('.cl-tp-item-n') || { textContent: '' }).textContent.trim()),
      whys: items.filter((e) => (e.querySelector('.cl-tp-item-w') || { textContent: '' }).textContent.trim().length > 8).length,
      tags: items.filter((e) => e.querySelectorAll('.cl-tp-item-b i').length === 2).length,
      path: (b.querySelector('.cl-tp-path') || { textContent: '' }).textContent.trim(),
    };
  })()`);
  observe('★ 主题内容带推荐顺序', seqAudit.nums.join(',') === Array.from({ length: seqAudit.n }, (_, i) => String(i + 1)).join(','), seqAudit.nums.join(','));
  observe('★ 每一条都有推荐理由', seqAudit.whys === seqAudit.n, `${seqAudit.whys}/${seqAudit.n}`);
  observe('★ 每一条都标了关联类型与是否适合初读', seqAudit.tags === seqAudit.n, `${seqAudit.tags}/${seqAudit.n}`);
  observe('主题写明了阅读路径', /阅读路径/.test(seqAudit.path), seqAudit.path.slice(0, 40));
  observe('主题页说明了「同主题≠原典关系」', /不代表|不是原典/.test(await ev(`(document.querySelector('#cl-body .cl-tp-note')||{}).textContent||''`)));
  await shot('主题详情');

  const intoRead = await ev(`(() => {
    const b = document.querySelector('#cl-body .cl-tp-item');
    if (!b) return 'no-item';
    b.click();
    return 'ok';
  })()`);
  // 点进阅读页时 #cl-body 会被整体重绘，中间有一段它不存在。轮询到原文出现再读，
  // 不要用固定 sleep —— 慢站上 600ms 读到的还是空壳，会报「点不进去」这种假红。
  await until(`!!(document.querySelector('#cl-body') && document.querySelector('#cl-body .cl-read-o'))`, 8000);
  const readFromTheme = await ev(`(() => {
    const b = document.querySelector('#cl-body');
    if (!b) return { hasOriginal: false, original: '', step1Only: false };
    const o = b.querySelector('.cl-read-o');
    return { hasOriginal: !!o, original: o ? o.textContent.trim().slice(0, 24) : '', step1Only: !b.querySelector('.cl-step4') };
  })()`);
  observe('★ 从主题点进去能直接开始读一条', intoRead === 'ok' && readFromTheme.hasOriginal, readFromTheme.original);
  observe('从主题进入时回到第 1 步（不是接着上一条的进度）', readFromTheme.step1Only === true);
  await shot('从主题开始读');

  // ══════════════════════════════════════════════════════════════════
  // 五、异常与边界
  // ══════════════════════════════════════════════════════════════════
  section('五、异常与边界：显式失败，不猜一个看起来合理的结果');

  // 空手记
  // openPanel 的返回值必须检查：慢网络下它可能失败，页面停在首页，
  // 后面「找不到输入框 → 点不到按钮 → 没有 toast」会被误读成产品缺陷。
  const opEmpty = await openPanel('today');
  observe('（前置）能回到今日面板做空手记测试', opEmpty === 'ok', opEmpty);
  await stepClick(2); await stepClick(3); await stepClick(4); await stepClick(5);
  const emptySave = await ev(`(() => {
    const t = document.querySelector('#cl-journal-input');
    if (!t) return { found: false };
    t.value = '   ';
    const b = document.querySelector('#cl-body [data-act="journal-save"]');
    if (!b) return { found: true, btn: 'no-btn' };
    b.click();
    return { found: true, btn: 'ok' };
  })()`);
  // toast 是短命元素：固定等 400ms 在慢站上可能已经错过它弹出的瞬间，
  // 报出「静默不提示」这种假红。轮询到它出现（或确实没出现）再读。
  await until(`(() => { const t = document.querySelector('#toast'); return !!t && t.textContent.trim().length > 0; })()`, 4000);
  const emptyAfter = await ev(`(() => {
    const toastEl = document.querySelector('#toast');
    const j = JSON.parse(localStorage.getItem('qintian.classic.journal') || '{}');
    const total = Object.values(j).reduce((a, b) => a + b.length, 0);
    return { toast: toastEl ? toastEl.textContent.trim() : '', total };
  })()`);
  observe('空手记不会存成一条空记录', emptyAfter.total === 1, `总条数 ${emptyAfter.total}`);
  observe('空手记给出提示而不是静默', emptyAfter.toast.length > 0, emptyAfter.toast);
  await shot('空手记');

  // 坏 localStorage
  await ev(`(() => { localStorage.setItem('qintian.classic.journal', '{{{坏数据'); return 'ok'; })()`);
  await gotoApp();
  // 不用固定 sleep：GitHub Pages 的 CDN 首包比 coze 站慢，700ms 会读到还没渲染的空壳，
  // 报出「坏存储下页面打不开」这种假红。改成轮询到真的渲染出来为止。
  await openPanel('today');
  await until(`(() => { const b = document.querySelector('#cl-body'); return !!b && b.textContent.trim().length > 20; })()`, 8000);
  const broken = await ev(`(() => {
    const b = document.querySelector('#cl-body');
    return { rendered: !!b && b.textContent.trim().length > 20, hasOriginal: !!(b && b.querySelector('.cl-read-o')) };
  })()`);
  observe('坏 localStorage 下页面仍能打开', broken.rendered === true);
  observe('坏数据下不崩、原文照常显示', broken.hasOriginal === true);
  await shot('坏存储');
  await ev(`(() => { localStorage.removeItem('qintian.classic.journal'); return 'ok'; })()`);

  // 不存在的内容 id
  // 原来先 `location.hash = ''` 再 dispatch——但清 hash 本身就会触发路由回首页，
  // 于是 600ms 后 `#cl-body` 已经不存在，测出来的「观心页面不可用」是测试自己造成的。
  // GitHub 站只是因为切换慢才侥幸通过，coze 站快一点就红。改成先回到观心再 dispatch。
  const opBad = await openPanel('today');
  observe('（前置）能回到今日面板做异常 id 测试', opBad === 'ok', opBad);
  const badId = await ev(`(() => {
    try {
      document.dispatchEvent(new CustomEvent('qintian:classic-goto', { detail: { view: 'classic-detail', id: 'LY-999' } }));
      return 'dispatched';
    } catch (e) { return 'threw: ' + e.message; }
  })()`);
  await sleep(600);
  const badIdView = await ev(`(() => {
    const d = document.querySelector('#classic-detail-body');
    const c = document.querySelector('#cl-body');
    return { detail: d ? d.textContent.replace(/\\s+/g, ' ').trim().slice(0, 60) : null, classicAlive: !!c && c.textContent.trim().length > 20 };
  })()`);
  observe('不存在的内容 id 不抛异常', badId === 'dispatched', badId);
  observe('不存在的内容 id 时观心页面仍可用', badIdView.classicAlive === true, badIdView.detail || '');
  await shot('不存在的内容');

  // ══════════════════════════════════════════════════════════════════
  // 六、正反馈六维
  // ══════════════════════════════════════════════════════════════════
  section('六、六维正反馈自查（产品文件检查表）');

  // 六维不重新抓一遍 DOM 来凑答案——上面每一步都留下了真实观察，
  // 这里只做汇总。重新抓一次只会抓到「刚刷新、还在第 1 步」的空页面，
  // 那不是产品没做到，是探针看错了地方。
  observe('① 被理解：打开就有现代解释 + 思考角度', first.modern.length > 0 && first.think.length > 0, `解读 ${first.modern.length} 字 / 思考 ${first.think.length} 字`);
  observe('② 发现新东西：给出场合、易读错处、历代注家', d2.all.length > 0 && /注家|注疏|历代/.test(d3.all), `第2步 ${d2.all.length} 字 / 第3步 ${d3.all.length} 字`);
  observe('③ 想法更清晰：能写下自己的话并回看', notesView.count >= 1, `手记 ${notesView.count} 条`);
  observe('④ 表达后有回应：反馈立刻得到回应与下一步', !!fbEcho && fbEcho.btns.length > 0, fbEcho ? fbEcho.btns.join(' / ') : '');
  observe('⑤ 带走收获：读完有结束、有下一步', /读完了/.test(afterSave.endText), afterSave.endText.slice(0, 30));
  observe('⑥ 回来有新理解：再次遇到时提示上次想法', echo.has === true, echo.text.slice(0, 30));

  // ══════════════════════════════════════════════════════════════════
  // 七、运行期异常
  // ══════════════════════════════════════════════════════════════════
  section('七、运行期异常');
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
  app_version: APP_VERSION,
  git: GIT,
  observations: steps,
}, null, 2));

const md = [];
md.push(`# 观心 P0 体验记录（${new Date().toLocaleString('zh-CN', { timeZone: 'Asia/Shanghai' })}）`);
md.push('');
md.push(`- 版本：${APP_VERSION}（工作区 commit ${GIT.head}${GIT.dirty === true ? '，**有未提交改动**' : GIT.dirty === false ? '，工作区干净' : ''}）`);
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
