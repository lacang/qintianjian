#!/usr/bin/env node
/**
 * test-classic-ui.mjs — 经典板块真实浏览器交互测试
 *
 * 为什么需要它
 * ------------
 * verify-browser 只证明「页面能渲染、无异常」。但《论语》板块最核心的产品承诺
 * 恰恰不在渲染上，而在交互的因果上：
 *
 *   「用户问题只作个人阅读背景，不能决定抽取结果。」
 *
 * 这句话能不能被证明，只有一个办法：**在同一个抽取序号下，用两个完全不同的问题，
 * 看是否抽到同一条**。这是本文件存在的唯一理由。
 *
 * 覆盖：
 *   1. 问心：同一序号 + 不同问题 → 同一条目（问题不影响抽取）
 *   2. 问心：不同序号 → 不同条目（抽取确实在抽）
 *   3. 一念三观：洗牌出三张、逐张可翻、三条互不重复
 *   4. 原典详情：八层齐全，第八层标为今人理解
 *   5. 编辑阐释：LY-021 的关系显示「编辑阐释」而非原典有据
 *   6. 孤立节点：LY-013 走三入口，主题推荐带「非思想关系」标注
 *   7. 四个分段面板均可渲染，无异常
 *
 * 用法：node tools/test-classic-ui.mjs [--keep-profile]
 * 退出码：0 通过 / 1 失败 / 3 环境不具备
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
const { has } = parseArgs(process.argv.slice(2));

const chrome = findChrome();
if (!chrome) {
  console.error('[test-classic-ui] 找不到 Chrome/Chromium（可用 QT_CHROME=<路径> 指定）');
  process.exit(3);
}

const pass = [];
const fails = [];
function ok(cond, name, extra = '') {
  if (cond) { pass.push(name); return true; }
  fails.push(`${name}${extra ? ' — ' + extra : ''}`);
  return false;
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const srv = await startStaticServer(APP);
const profile = has('--keep-profile')
  ? path.join(os.tmpdir(), 'qt-classic-profile')
  : fs.mkdtempSync(path.join(os.tmpdir(), 'qt-classic-'));

let sess = null;
let exitCode = 0;

/** 在页面里跑一段表达式，返回 value 或抛错 */
async function ev(expr) {
  const r = await sess.evaluate(expr);
  if (r && r.error) throw new Error(r.error);
  return r.value;
}

/** 等某个条件成立（页面内表达式返回真） */
async function until(expr, timeout = 8000) {
  const t0 = Date.now();
  while (Date.now() - t0 < timeout) {
    const v = await ev(expr);
    if (v) return true;
    await sleep(120);
  }
  return false;
}

/** 点一个选择器（真实 click，走用户手势） */
async function click(sel) {
  return ev(`(() => { const e = document.querySelector(${JSON.stringify(sel)}); if (!e) return 'no-el'; e.click(); return 'ok'; })()`);
}

async function gotoApp() {
  await sess.goto(srv.url + '/', 30000);
  await until(`document.readyState === 'complete' && !!document.querySelector('.tabbar .tab')`, 20000);
  // main.js 在 SW controllerchange 后会 location.reload() 一次，
  // 这期间 DOM 会被重建。必须等 reload 落定，否则首次点击打在旧 DOM 上。
  await sleep(1500);
  await until(`!!document.querySelector('.tabbar .tab[data-view="classic"]')`, 15000);
}

/** 进入观心，并切到指定分段 */
async function openNode(id) {
  await openPanel('explore');
  const clicked = await ev(`(() => {
    const b = document.querySelector('#classic-body .cl-node[data-id="${id}"]');
    if (!b) return 'no-node';
    b.click(); return 'ok';
  })()`);
  if (clicked !== 'ok') return null;
  await sleep(300);
  return ev(`(() => {
    const rels = document.querySelectorAll('#classic-detail-body .cl-rel');
    const relBox = document.querySelector('#classic-detail-body .cl-rels');
    return {
      relations: rels.length,
      relText: relBox ? relBox.textContent : '',
      text: (document.querySelector('#classic-detail-body') || { textContent: '' }).textContent,
    };
  })()`);
}

async function openPanel(panelId) {
  for (let attempt = 0; attempt < 3; attempt++) {
    await click('.tabbar .tab[data-view="classic"]');
    const ready = await until(`!!document.querySelector('#classic-body .cl-tab[data-panel="${panelId}"]')`, 5000);
    if (!ready) { await sleep(500); continue; }
    const r = await click(`#classic-body .cl-tab[data-panel="${panelId}"]`);
    if (r !== 'ok') { await sleep(300); continue; }
    await sleep(200);
    const done = await ev(`!!document.querySelector('#cl-body') && document.querySelector('#cl-body').textContent.trim().length > 20`);
    if (done) return 'ok';
    await sleep(300);
  }
  return 'no-panel';
}

/** 取当前问心结果卡的标题与原文 */
const ASK_RESULT = `(() => {
  const q = document.querySelector('#cl-body .cl-vot');
  if (!q) return null;
  const t = q.querySelector('.cl-vot-t');
  const o = q.querySelector('.cl-vot-o');
  return { id: q.dataset.id, title: t ? t.textContent.trim() : '', original: o ? o.textContent.trim() : '' };
})()`;

try {
  sess = await openPage({ chrome, profile, tag: 'classic' });
  await gotoApp();

  // ---------- 1. 四个分段面板 ----------
  for (const p of ['today', 'ask', 'three', 'explore']) {
    const r = await openPanel(p);
    const hasBody = await ev(`!!document.querySelector('#cl-body') && document.querySelector('#cl-body').textContent.trim().length > 20`);
    ok(r === 'ok' && hasBody, `分段「${p}」可渲染`);
  }

  // ---------- 2. 问心：同一序号 + 不同问题 → 同一条 ----------
  // 直接把当日序号钉死在同一个值，排除序号递增的干扰
  const pinSeq = (n) => ev(`(() => {
    const d = new Date();
    const k = d.getFullYear() + '-' + String(d.getMonth()+1).padStart(2,'0') + '-' + String(d.getDate()).padStart(2,'0');
    localStorage.setItem('qintian.classic.askseq', JSON.stringify({ d: k, n: ${n} }));
    return k;
  })()`);

  // 抽完之后输入框收起（避免「改了字结果不变」的误解），要再写必须先回到书写态。
  async function toWriteState() {
    const hasInput = await ev(`!!document.querySelector('#cl-ask-input')`);
    if (!hasInput) {
      await click('[data-act="ask-new"]');
      await sleep(140);
    }
  }

  async function askWith(question, seq = 7) {
    await pinSeq(seq);              // 每次都在同一序号上抽，才能证明问题不参与
    await openPanel('ask');
    await toWriteState();
    await ev(`(() => { const t = document.querySelector('#cl-ask-input'); t.value = ${JSON.stringify(question)}; return 'ok'; })()`);
    const r = await click('#cl-ask-go');
    if (r !== 'ok') throw new Error('静心一问按钮不可用');
    // 抽取仪式 2.4 秒后才换屏，这里等结果真的出现，不是等一个固定时长。
    await until(`!!document.querySelector('#cl-body .cl-vot')`, 6000);
    return ev(ASK_RESULT);
  }

  const A = await askWith('我在犹豫要不要辞掉现在的工作，怕后悔。', 7);
  const B = await askWith('我和家里人已经三年没说过话了，该不该先低头？', 7);
  ok(A && B, '问心两次都出了结果卡');
  ok(A && B && A.id === B.id, '★ 同一序号下，两个完全不同的问题抽到同一条（问题不影响抽取）',
    `A=${A && A.id} B=${B && B.id}`);
  ok(A && B && A.original === B.original, '两次的原文完全一致', '原文不一致说明抽取受问题影响');

  // 声明条必须在
  const notice = await ev(`(() => { const n = document.querySelector('#cl-body .cl-vot-note'); return n ? n.textContent.replace(/\\s+/g,'') : ''; })()`);
  ok(/不由你的问题挑选/.test(notice) && /不会替你的问题作答/.test(notice),
    '结果页明确声明「这一条不由你的问题挑选，也不会替你的问题作答」');

  // ---------- 3. 问心：不同序号 → 结果会变 ----------
  const C = await askWith('随便写点别的。', 8);
  ok(C && A && C.id !== A.id, '不同序号给出不同条目（抽取确实在抽）', `seq7=${A && A.id} seq8=${C && C.id}`);

  // ---------- 3a. 抽取仪式：点下去先静，不是立刻糊结果 ----------
  //
  // 董事长 2026-10-31 14:36：「输入问题，点击确认，页面哗啦啦一变，就出来了一句箴言。」
  // 这不是审美偏好，是「抽」和「读」被挤在了同一秒。仪式层必须在，且必须是先仪式后结果。
  await pinSeq(6);
  await openPanel('ask');
  await toWriteState();
  await ev(`(() => { const t = document.querySelector('#cl-ask-input'); t.value = '仪式检查'; return 'ok'; })()`);
  await click('#cl-ask-go');
  await sleep(320);
  const rite = await ev(`(() => {
    const r = document.querySelector('#cl-body .cl-rite');
    return {
      rite: !!r,
      card: document.querySelectorAll('#cl-body .cl-vot').length,
      word: (document.querySelector('.cl-rite-word') || {}).textContent || '',
      rings: r ? r.querySelectorAll('.cl-rite-ring').length : 0,
      core: r ? r.querySelectorAll('.cl-rite-core').length : 0,
      ms: r ? (r.style.getPropertyValue('--rite') || '').trim() : ''
    };
  })()`);
  ok(rite.rite && rite.card === 0,
    '★ 点「静心一问」先进入抽取仪式，此时结果卡还没出现', JSON.stringify(rite));
  ok(/容它一会儿/.test(rite.word), '仪式层给出静默提示，不是加载进度条', rite.word);
  ok(rite.rings === 3 && rite.core === 1,
    '仪式层是三圈错相 + 一颗落定的芯（不是单一进度圈）', `rings=${rite.rings} core=${rite.core}`);
  ok(rite.ms === '2400ms', '首问仪式时长 2.4s，由 --rite 传入而不是写死在 CSS 里', rite.ms);
  const riteDone = await until(`!!document.querySelector('#cl-body .cl-vot')`, 6000);
  ok(riteDone, '仪式走完才出现箴言（抽与读分成两段）');

  // 结果整块必须包在 handoff 容器里。换屏是 innerHTML 整体重绘，
  // 没有这一层就是硬切——仪式收得再好，切过去那一下仍然像「页面跳了一下」。
  const wrap = await ev(`(() => {
    const w = document.querySelector('#cl-body .cl-vot-wrap');
    if (!w) return null;
    return { anim: getComputedStyle(w).animationName, hasVot: !!w.querySelector('.cl-vot') };
  })()`);
  ok(wrap && wrap.anim === 'handoff' && wrap.hasVot,
    '★ 结果整块包一层 handoff，仪式收与结果起落在同一节奏上', JSON.stringify(wrap));

  // 「再问一次」已经知道接下来会发生什么，等满 2.4 秒就从「静」变成「拖」。
  await click('[data-act="ask-again"]');
  await sleep(300);
  const againMs = await ev(`(() => {
    const r = document.querySelector('#cl-body .cl-rite');
    return r ? (r.style.getPropertyValue('--rite') || '').trim() : 'missing';
  })()`);
  ok(againMs === '1500ms', '「再问一次」仪式缩短到 1.5s（重复已知流程不该再等满）', againMs);
  await until(`!!document.querySelector('#cl-body .cl-vot')`, 6000);

  // 抽完之后输入框收起，必须有回到书写态的路
  const backBtn = await ev(`(() => { const b = document.querySelector('[data-act="ask-new"]'); if (!b) return false; b.click(); return true; })()`);
  await sleep(180);
  const writeState = await ev(`(() => ({
    input: !!document.querySelector('#cl-ask-input'),
    go: !!document.querySelector('#cl-ask-go'),
    card: document.querySelectorAll('#cl-body .cl-vot').length,
    q: (document.querySelector('#cl-ask-input') || {}).value || ''
  }))()`);
  ok(backBtn && writeState.input && writeState.go && writeState.card === 0,
    '★ 抽完后「换一个问题」能回到书写态（输入框收起不等于没有第二条路）', JSON.stringify(writeState));
  ok(writeState.q.length > 0, '回到书写态时原问题还在，方便改，不用重打', writeState.q.slice(0, 20));

  // 主次：箴言是全屏最大字号，免责声明只是注脚
  await pinSeq(6);
  await askWith('主次检查。', 6);
  const hierarchy = await ev(`(() => {
    const o = document.querySelector('#cl-body .cl-vot-o');
    const n = document.querySelector('#cl-body .cl-vot-note');
    const q = document.querySelector('#cl-body .cl-vot-q');
    const px = (e) => e ? parseFloat(getComputedStyle(e).fontSize) : 0;
    return { original: px(o), note: px(n), question: px(q) };
  })()`);
  ok(hierarchy.original > hierarchy.note && hierarchy.original > hierarchy.question,
    '★ 箴言字号大于免责声明与用户问题（主次分明）',
    `箴言 ${hierarchy.original}px / 免责 ${hierarchy.note}px / 问题 ${hierarchy.question}px`);

  // ---------- 3b. 空问题不得抽取 ----------
  //
  // 问心的前提是「带着困惑遇见」。空着点，用户拿到的只是一条随机内容，
  // 与「今日相遇」再无区别——「投射」这一环就断了。所以这里必须拦住。
  // 但也不能把人堵在原地，提示里要给出另一条路（今日相遇本来就允许空手）。
  await pinSeq(5);
  await openPanel('ask');
  await toWriteState();
  await ev(`(() => { const t = document.querySelector('#cl-ask-input'); if (t) t.value = ''; return 'ok'; })()`);
  await click('#cl-ask-go');
  await sleep(260);
  const emptyState = await ev(`(() => {
    const w = document.querySelector('#cl-ask-warn');
    let n = null;
    try { n = JSON.parse(localStorage.getItem('qintian.classic.askseq') || 'null'); } catch (e) {}
    return { warnOn: !!(w && w.classList.contains('is-on')), warnText: w ? w.textContent.replace(/\\s+/g, '') : '', n: n && n.n, quote: document.querySelectorAll('#cl-body .cl-vot').length };
  })()`);
  ok(emptyState.warnOn, '★ 空问题点「静心一问」给出提示，而不是直接抽一条');
  ok(emptyState.n === 5, '空问题不消耗当日序号（没有偷偷抽）', `n=${emptyState.n}`);
  ok(emptyState.quote === 0, '空问题点完不残留上一次的结果卡（不制造「没写也给」的错觉）', `结果卡 ${emptyState.quote} 张`);
  ok(/今日相遇/.test(emptyState.warnText), '提示里给出另一条路（今日相遇），不把人堵在原地');

  // 一开始写字，提示就撤掉——规则不在用户动手前解释
  await ev(`(() => { const t = document.querySelector('#cl-ask-input'); t.value = '写点东西'; t.dispatchEvent(new Event('input', { bubbles: true })); return 'ok'; })()`);
  await sleep(140);
  const warnAfter = await ev(`(() => { const w = document.querySelector('#cl-ask-warn'); return w ? w.classList.contains('is-on') : null; })()`);
  ok(warnAfter === false, '一开始写字，空输入提示立刻撤掉（不预先解释规则）');

  // 纯空白同样不算写了
  await pinSeq(5);
  await openPanel('ask');
  await toWriteState();
  await ev(`(() => { const t = document.querySelector('#cl-ask-input'); if (t) t.value = '   \\n  \\t '; return 'ok'; })()`);
  await click('#cl-ask-go');
  await sleep(240);
  const blankState = await ev(`(() => {
    let n = null;
    try { n = JSON.parse(localStorage.getItem('qintian.classic.askseq') || 'null'); } catch (e) {}
    const w = document.querySelector('#cl-ask-warn');
    return { n: n && n.n, warnOn: !!(w && w.classList.contains('is-on')) };
  })()`);
  ok(blankState.n === 5 && blankState.warnOn, '纯空白输入按「没写」处理', `n=${blankState.n}`);

  // ---------- 4. 一念三观 ----------
  await openPanel('three');
  await click('#cl-three-go');
  const backs = await ev(`document.querySelectorAll('#cl-body .cl-card3.back').length`);
  ok(backs === 3, '洗牌后出现三张牌背', `实际 ${backs}`);

  const opened = [];
  for (let i = 0; i < 3; i++) {
    await click(`#cl-body .cl-card3.back[data-i="${i}"]`);
    await sleep(120);
  }
  const opens = await ev(`(() => Array.from(document.querySelectorAll('#cl-body .cl-card3.open'))
    .map(e => { const t = e.querySelector('.cl-original'); const h = e.querySelector('.cl-card3-h');
      return { h: h ? h.textContent.trim() : '', o: t ? t.textContent.trim() : '' }; }))()`);
  ok(opens.length === 3, '三张牌都能翻开', `实际 ${opens.length}`);
  ok(opens.every((x) => x.o && x.o.length > 5), '三张牌都有原文');
  ok(new Set(opens.map((x) => x.o)).size === 3, '三张牌内容互不重复');

  const threeNote = await ev(`(() => { const b = document.querySelector('#cl-body'); return b ? b.textContent.replace(/\\s+/g,'') : ''; })()`);
  ok(/(不是《论语》原有的占卜体系|非《论语》原有占卜体系)/.test(threeNote),
    '牌阵明确声明不是《论语》原有占卜体系');

  // ---------- 5. 原典详情八层 ----------
  await openPanel('today');
  await click('#cl-body .cl-quote [data-act="open"]');
  await until(`!!document.querySelector('#classic-detail-body .cl-layer')`);
  const layers = await ev(`(() => Array.from(document.querySelectorAll('#classic-detail-body .cl-layer'))
    .map(e => e.dataset.layer))()`);
  ok(layers.length === 8, '详情八层齐全', `实际 ${layers.length}：${layers.join(',')}`);
  ok(layers[0] === 'original' && layers[7] === 'modern', '八层层序为原文→…→现代解读');
  const modernNote = await ev(`(() => { const e = document.querySelector('#classic-detail-body .cl-layer[data-layer="modern"] .cl-layer-note'); return e ? e.textContent : ''; })()`);
  ok(/不是古人的原意/.test(modernNote), '第八层标注「不是古人的原意」');

  // ---------- 5a. 思想探索页必须真的列出节点（防「只有提示文字也算渲染」） ----------
  await openPanel('explore');
  const explore = await ev(`(() => ({
    nodes: document.querySelectorAll('#classic-body .cl-node').length,
    groups: document.querySelectorAll('#classic-body .cl-group').length,
    orphans: document.querySelectorAll('#classic-body .cl-node .cl-node-tag').length,
  }))()`);
  ok(explore.nodes >= 26, '探索页列出全部思想节点', `实际 ${explore.nodes} 个`);
  ok(explore.groups >= 9, '探索页按思想群分组', `实际 ${explore.groups} 组`);
  ok(explore.orphans >= 5, '无关系的条目标「独立」', `实际 ${explore.orphans} 个`);

  // ---------- 5b. 已判不成立的关系不得出现在详情页 ----------
  // LY-001 ↔ LY-006（终身学习）已在终审中删除关系，只保留审校记录，不进产品。
  // 这里验的是「数据层排除」真的落到了界面上，而不是只写在 JSON 里。
  const ly001 = await openNode('LY-001');
  ok(ly001 && ly001.relations === 2, 'LY-001 只展示 2 条经审校保留的关系',
    ly001 && `实际 ${ly001.relations} 条`);
  ok(ly001 && !ly001.text.includes('LY-006'), 'LY-001 详情不出现已删除关系的对端');
  ok(ly001 && !/已核实/.test(ly001.relText), 'LY-001 无 verified 边，不得出现「已核实」字样');
  ok(ly001 && /待考/.test(ly001.relText), 'LY-001 的 pending 边标注「待考」');

  // ---------- 6. 编辑阐释标记（LY-021 有 R-10 / R-11 两条人工批准的编辑阐释） ----------
  const ly021 = await ev(`(async () => {
    const m = await import('./js/classic/classicview.js?v=122');
    document.querySelector('#classic-detail-body').innerHTML = m.renderClassicDetail('LY-021');
    await new Promise(r => setTimeout(r, 60));
    return Array.from(document.querySelectorAll('#classic-detail-body .cl-rel')).map(e => ({
      badge: (e.querySelector('.cl-badge') || {}).textContent || '',
      peer: (e.querySelector('.cl-rel-peer') || {}).textContent || '',
    }));
  })()`);
  ok(Array.isArray(ly021) && ly021.length >= 2, 'LY-021 展示出关系边', JSON.stringify(ly021));
  const hasEditorial = (ly021 || []).some((r) => /编辑阐释/.test(r.badge));
  ok(hasEditorial, 'LY-021 的关系标注为「编辑阐释」，未冒充原典关系',
    JSON.stringify(ly021));

  // ---------- 7. 孤立节点三入口（LY-013 朝闻道） ----------
  const orphan = await ev(`(async () => {
    const m = await import('./js/classic/classicview.js?v=122');
    document.querySelector('#classic-detail-body').innerHTML = m.renderClassicDetail('LY-013');
    await new Promise(r => setTimeout(r, 60));
    const b = document.querySelector('#classic-detail-body');
    return {
      text: b.textContent.replace(/\\s+/g,''),
      entries: Array.from(b.querySelectorAll('.cl-entry-h')).map(e => e.textContent.trim()),
      kinds: Array.from(b.querySelectorAll('.cl-entry')).map(e => e.dataset.kind),
      entryCount: b.querySelectorAll('.cl-entry').length,
    };
  })()`);
  ok(orphan && /没有经审校成立的思想关系/.test(orphan.text), '孤立节点说明「没有经审校成立的思想关系」');
  ok(orphan && orphan.entries.length >= 2, '孤立节点给出多个入口', JSON.stringify(orphan && orphan.entries));
  // 批示原则二：四类入口必须明确区分。这里验的是性质写进了结构（data-kind），
  // 而不是只靠一句小字说明——否则样式和测试都没法可靠区分它们。
  ok(orphan && /同一思想群/.test(orphan.text) && /原典归类/.test(orphan.text),
    '入口标注各自的性质（原典归类 / 文本位置 / 主题推荐）');
  ok(orphan && orphan.kinds.every((k) => ['cluster', 'chapter', 'topic'].includes(k)),
    '每个入口都带合法的性质标识', JSON.stringify(orphan && orphan.kinds));
  ok(orphan && orphan.kinds.length === orphan.entryCount,
    '性质标识数量与入口数量一致（没有漏标的入口）',
    `${orphan && orphan.kinds.length} / ${orphan && orphan.entryCount}`);
  // 主题标签 2026-10-31 已转正（17 个，覆盖 26/26），所以孤立节点必然拿到主题推荐。
  // 这里验的不是"有没有推荐"，而是"推荐有没有冒充关系"：
  //   · 入口性质必须是 topic（结构上可选中，不是靠一句小字）
  //   · 必须显式写「主题推荐，非思想关系」
  //   · 主题推荐区不得出现关系徽标（原典有据 / 注家合观 / 编辑阐释）
  ok(orphan && orphan.kinds.includes('topic'), '孤立节点从主题标签拿到探索入口（标签已正式启用）',
    JSON.stringify(orphan && orphan.entries));
  ok(orphan && orphan.kinds.includes('topic'), '主题入口的性质标识为 topic');
  ok(orphan && /主题推荐，非思想关系/.test(orphan.text), '主题推荐带「非思想关系」显式标注');
  const orphanBadges = await ev(`(() => Array.from(document.querySelectorAll('#classic-detail-body .cl-badge')).map(e => e.textContent.trim()))()`);
  ok(Array.isArray(orphanBadges) && orphanBadges.length === 0,
    '★ 主题推荐区不出现任何关系徽标（不冒充原典有据 / 注家合观 / 编辑阐释）',
    JSON.stringify(orphanBadges));

  // ---------- 8. 三种抽取机制互不混淆 ----------
  //
  // 批示第一部分第 2 条：「今日相遇和问心的随机机制要分开……一念三观则强调连续探索。
  // 三者不能只是同一个随机函数换了三个标题。」
  // 这一段从界面侧验证三种机制的可观察差异。

  await openPanel('today');
  const todayA = await ev(`(() => { const q = document.querySelector('#cl-body .cl-quote'); return q ? q.dataset.id : null; })()`);
  const todayActs = await ev(`(() => Array.from(document.querySelectorAll('#cl-body [data-act]')).map(e => e.dataset.act))()`);
  ok(!todayActs.some((a) => /again|reroll|next/i.test(a)), '今日相遇不提供「换一条」入口（相遇不能挑）',
    JSON.stringify(todayActs));

  // 刷新后同一天仍是同一条（日期种子，而非每次进入重抽）
  await gotoApp();
  await openPanel('today');
  const todayB = await ev(`(() => { const q = document.querySelector('#cl-body .cl-quote'); return q ? q.dataset.id : null; })()`);
  ok(todayA && todayA === todayB, '刷新后今日相遇仍是同一条（日期决定，不随进入次数变化）',
    `${todayA} vs ${todayB}`);

  // 问心：同日连续两次不同（队列机制）；与今日相遇也不必相同（两套独立机制）
  const Q0 = await askWith('第一件事。', 0);
  const Q1 = await askWith('第二件事。', 1);
  ok(Q0 && Q1 && Q0.id !== Q1.id, '问心同日连续两次抽到不同条目（队列机制，不是随机重抽）',
    `seq0=${Q0 && Q0.id} seq1=${Q1 && Q1.id}`);
  ok(Q0 && Q0.id !== todayA, '问心与今日相遇互不牵连（两套机制、两套种子）',
    `ask=${Q0 && Q0.id} today=${todayA}`);

  // 一念三观：三条带所属群名，且群名互不相同（分层机制）
  await openPanel('three');
  await click('#cl-three-go');
  await sleep(150);
  for (let i = 0; i < 3; i++) { await click(`#cl-body .cl-card3.back[data-i="${i}"]`); await sleep(100); }
  const threeGroups = await ev(`(() => Array.from(document.querySelectorAll('#cl-body .cl-card3.open .cl-card3-g')).map(e => e.textContent.trim()))()`);
  ok(threeGroups.length === 3, '三张牌都标出所属思想群', JSON.stringify(threeGroups));
  ok(new Set(threeGroups).size === 3, '★ 三张牌来自三个不同思想群（分层抽样，不是抽三条不重复）',
    JSON.stringify(threeGroups));

  // ---------- 8b. 五种反馈：只改阅读路径，绝不改本次抽取 ----------
  //
  // 批示第一部分第 3 条：「这些交互可以影响后续的阅读体验，但不能反过来影响这一次的抽取结果。」

  await askWith('我想验证反馈会不会让系统换一条给我。', 3);
  const fbBefore = await ev(`(() => { const q = document.querySelector('#cl-body .cl-vot'); return q ? q.dataset.id : null; })()`);
  const fbIds = await ev(`(() => Array.from(document.querySelectorAll('#cl-body .cl-fb-b')).map(b => b.dataset.fb))()`);
  ok(fbIds.length === 5, '五种反馈全部呈现', JSON.stringify(fbIds));
  ok(['agree', 'disagree', 'unsure', 'recall', 'more'].every((x) => fbIds.includes(x)),
    '五种反馈与批示列举的完全一致', JSON.stringify(fbIds));

  let fbChanged = 0;
  for (const fb of ['agree', 'disagree', 'unsure', 'recall', 'more']) {
    await ev(`(() => { const b = document.querySelector('#cl-body .cl-fb-b[data-fb="${fb}"]'); if (!b) return 'no'; b.click(); return 'ok'; })()`);
    await sleep(140);
    const now = await ev(`(() => { const q = document.querySelector('#cl-body .cl-vot'); return q ? q.dataset.id : null; })()`);
    if (now !== fbBefore) fbChanged++;
  }
  ok(fbChanged === 0, '★ 点完全部五种反馈，当前抽到的条目一次都没有变（反馈不影响本次抽取）',
    `变了 ${fbChanged} 次`);

  // 「我不认同」必须导向注家分歧，而不是导向重抽
  await ev(`(() => { document.querySelector('#cl-body .cl-fb-b[data-fb="disagree"]').click(); return 'ok'; })()`);
  await sleep(140);
  const disagreeOut = await ev(`(() => {
    const o = document.querySelector('#cl-body .cl-fb-out');
    const go = document.querySelector('#cl-body [data-act="open-with"]');
    return { text: o ? o.textContent : '', layers: go ? go.dataset.layers : '' };
  })()`);
  ok(/不认同是正当的/.test(disagreeOut.text), '「我不认同」给出不当场否定的回应');
  ok(/dispute/.test(disagreeOut.layers), '「我不认同」导向注家分歧层（不是重新抽取）', disagreeOut.layers);

  // 点进去必须真的展开分歧层
  await ev(`(() => { document.querySelector('#cl-body [data-act="open-with"]').click(); return 'ok'; })()`);
  await sleep(400);
  const disputeOpen = await ev(`(() => {
    const s = document.querySelector('#classic-detail-body .cl-layer[data-layer="dispute"]');
    return s ? s.classList.contains('open') : null;
  })()`);
  ok(disputeOpen === true, '「我不认同」跳转后注家分歧层已展开');

  // ---------- 9. 辩一辩：先原文，再立场，最后才给注疏 ----------
  //
  // 批示第三部分：「系统展示原文之后，不要急着解释，而是先问……
  // 用户选择自己的立场，然后再进入原文语境、注疏和不同理解。」

  await openPanel('debate');
  const dbCount = await ev(`document.querySelectorAll('#cl-body .cl-db-item').length`);
  ok(dbCount >= 8, '辩一辩列出全部辩题', `实际 ${dbCount}`);

  await ev(`(() => { const b = document.querySelector('#cl-body .cl-db-item[data-id="D-01"]'); if (!b) return 'no'; b.click(); return 'ok'; })()`);
  await sleep(250);
  const dbFirst = await ev(`(() => {
    const b = document.querySelector('#cl-body');
    return {
      text: b.textContent.replace(/\\s+/g, ''),
      hasOriginal: !!b.querySelector('.cl-original'),
      stances: b.querySelectorAll('.cl-st').length,
      hasCommentary: !!b.querySelector('.cl-layer[data-layer="commentary"]'),
      hasCanon: !!b.querySelector('.cl-db-canon'),
      hasQuestion: !!b.querySelector('.cl-db-q2'),
    };
  })()`);
  ok(dbFirst.hasOriginal, '辩题首屏先展示原典原文');
  ok(dbFirst.hasQuestion, '辩题首屏给出面向用户的问题');
  ok(dbFirst.stances >= 2, '辩题首屏给出立场选项', `实际 ${dbFirst.stances}`);
  ok(!dbFirst.hasCommentary, '★ 未选立场时不展示历代注疏（先有你的判断，再看古人）');
  ok(!dbFirst.hasCanon, '未选立场时不给「原典实际说了什么」的结论');

  // 选第一个立场
  await ev(`(() => { document.querySelectorAll('#cl-body .cl-st')[0].click(); return 'ok'; })()`);
  await sleep(250);
  const dbAfter = await ev(`(() => {
    const b = document.querySelector('#cl-body');
    return {
      text: b.textContent.replace(/\\s+/g, ''),
      hasCommentary: !!b.querySelector('.cl-layer[data-layer="commentary"]'),
      hasDispute: !!b.querySelector('.cl-layer[data-layer="dispute"]'),
      hasCanon: !!b.querySelector('.cl-db-canon'),
      hasLineage: !!b.querySelector('.cl-db-lineage'),
    };
  })()`);
  ok(dbAfter.hasCommentary, '选完立场后才展开历代注疏');
  ok(dbAfter.hasDispute, '选完立场后才展开注家分歧');
  ok(dbAfter.hasCanon, '选完立场后给出「原典实际说了什么」');
  ok(dbAfter.hasLineage, '给出「这一路历史上谁走过」的位置对照');
  ok(!/答对|答错|你选错|你答对|正确答案是/.test(dbAfter.text),
    '不判定用户立场的对错（辩一辩不是考试）');

  // 改主意：读完可以改，且被明确记录
  await ev(`(() => { const bs = document.querySelectorAll('#cl-body .cl-st'); if (bs.length < 2) return 'no'; bs[1].click(); return 'ok'; })()`);
  await sleep(200);
  const changedText = await ev(`(() => document.querySelector('#cl-body').textContent.replace(/\\s+/g, ''))()`);
  ok(/改过主意/.test(changedText), '读完可以改主意，且界面如实记录');

  // 详情页应有辩题入口
  const invite = await ev(`(async () => {
    const m = await import('./js/classic/classicview.js?v=122');
    document.querySelector('#classic-detail-body').innerHTML = m.renderClassicDetail('LY-020');
    await new Promise(r => setTimeout(r, 60));
    const b = document.querySelector('#classic-detail-body .cl-db-invite');
    return b ? b.textContent.replace(/\\s+/g, '') : '';
  })()`);
  ok(/这一条可以辩/.test(invite), '有辩题的条目在详情页给出入口');

  // ---------- 8. 全程无异常 ----------
  ok(sess.exceptions.length === 0, '无未捕获异常',
    sess.exceptions.map((e) => e.text).slice(0, 3).join(' | '));
  const realErrors = sess.consoleErrors.filter((t) => !/favicon/i.test(t));
  ok(realErrors.length === 0, '无 console.error', realErrors.slice(0, 3).join(' | '));

} catch (e) {
  fails.push(`执行中断：${e && e.message}`);
} finally {
  if (sess) { try { await sess.close(); } catch { /* 忽略关闭失败 */ } }
  await srv.close();
}

console.log('');
console.log(`通过 ${pass.length} 项`);
if (fails.length) {
  console.log(`失败 ${fails.length} 项：`);
  for (const f of fails) console.log('  ✗ ' + f);
  exitCode = 1;
} else {
  console.log('✅ 经典板块交互测试全部通过');
  for (const p of pass) console.log('  · ' + p);
}
process.exit(exitCode);
