#!/usr/bin/env node
/**
 * test-classic-ui.mjs — 观心阅读改造的真实浏览器验收
 *
 * 为什么需要它
 * ------------
 * 这个产品最核心的承诺不在渲染上，而在两条因果上：
 *
 *   1. 用户打开观心的第一分钟，必须能获得一次完整体验
 *      —— 原文、出处、现代解释、一个能联系现实的思考角度，都在第一屏。
 *   2. 用户留下的任何东西，下次必须能被认出来
 *      —— 写过手记的条目，再次遇到时要回显上次写了什么。
 *
 * 这两条只有真实浏览器能证明。渲染通过不等于体验成立。
 *
 * 覆盖：
 *   A 第一屏完整性（原文/出处/现代解读/来源标注/值得想一下/推进入口）
 *   B 分段结构（三个分段，旧五个分段入口全部消失）
 *   C 阅读五步逐步展开（语境 → 注家分歧 → 反馈 → 手记）
 *   D 反馈的即时响应（选了有回应，不是点了没反应）
 *   E 思想手记（写入、列表、再次遇到时回显）
 *   F 困惑探索（八个现实主题、条目列表、主题推荐标注）
 *   G 原典八层详情仍可进入且完整
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
async function openPanel(panelId) {
  for (let attempt = 0; attempt < 3; attempt++) {
    await click('.tabbar .tab[data-view="classic"]');
    const ready = await until(`!!document.querySelector('#classic-body .cl-tab[data-panel="${panelId}"]')`, 5000);
    if (!ready) { await sleep(500); continue; }
    const r = await click(`#classic-body .cl-tab[data-panel="${panelId}"]`);
    if (r !== 'ok') { await sleep(300); continue; }
    await sleep(260);
    const done = await ev(`!!document.querySelector('#cl-body') && document.querySelector('#cl-body').textContent.trim().length > 20`);
    if (done) return 'ok';
    await sleep(300);
  }
  return 'no-panel';
}

try {
  sess = await openPage({ chrome, profile, headless: true });
  const errors = [];
  sess.onConsole?.((m) => { if (m.type === 'error') errors.push(m.text); });

  await gotoApp();

  // 清掉上一轮留下的手记，从干净状态开始
  await ev(`localStorage.removeItem('qintian.classic.journal')`);

  /* ---------- A 第一屏完整性 ---------- */
  await openPanel('today');
  await until(`!!document.querySelector('#cl-body .cl-read')`, 8000);

  const first = await ev(`(() => {
    const b = document.querySelector('#cl-body');
    const q = (s) => b.querySelector(s);
    const txt = (s) => (q(s) || { textContent: '' }).textContent.trim();
    return {
      hasRead: !!q('.cl-read'),
      id: (q('.cl-read') || { dataset: {} }).dataset.id || '',
      original: txt('.cl-read-o'),
      src: txt('.cl-read-src'),
      modern: txt('.cl-modern'),
      modernTag: txt('.cl-src-tag'),
      think: txt('.cl-think'),
      blocks: [...b.querySelectorAll('.cl-block-h')].map((e) => e.textContent.trim()),
      more: txt('.cl-more'),
      steps: b.querySelectorAll('.cl-step2, .cl-step3, .cl-step4, .cl-step5').length,
    };
  })()`);

  ok(first.hasRead, 'A1 打开观心直接进入一条内容（不是列表页）');
  ok(first.original.length >= 8, 'A2 第一屏有原文', `len=${first.original.length}`);
  ok(/论语/.test(first.src), 'A3 第一屏有出处', first.src);
  // 现代解读的产品定义是「一句白话直译」，深度在「思考角度」里。
  // 原来卡 40 字是错的：26 条里 16 条不足 40 字（最短 20），那不是内容缺陷，
  // 是设计如此。真正的「给足信息」标准应该是：解读不是占位符 + 思考角度确实展开。
  // 而且这条断言会随当日条目变化而假失败——跨天跑门禁结果不同，门禁就不可信了。
  ok(first.modern.length >= 12, 'A4 第一屏有现代解读正文', `len=${first.modern.length}`);
  ok(/现代解读/.test(first.modernTag) && /不是古人原意/.test(first.modernTag), 'A5 现代解读标注了不是古人原意', first.modernTag);
  ok(first.blocks.includes('这句话在说什么'), 'A6 有「这句话在说什么」小标题');
  ok(first.blocks.includes('值得想一下'), 'A7 第一屏有联系现实的思考角度');
  ok(first.think.length >= 40, 'A4b 思考角度确实展开（不是一句话打发）', `len=${first.think.length}`);
  ok(first.more.length > 0, 'A8 第一屏有继续深入的入口', first.more);
  ok(first.steps === 0, 'A9 初次进入后续步骤不预先展开（一次只给一步）', `展开=${first.steps}`);

  /* ---------- B 分段结构 ---------- */
  const seg = await ev(`(() => {
    const b = document.querySelector('#classic-body');
    return {
      tabs: [...b.querySelectorAll('.cl-tab')].map((e) => e.dataset.panel),
      names: [...b.querySelectorAll('.cl-tab')].map((e) => e.textContent.trim()),
      flow: b.querySelectorAll('.cl-flow').length,
      stats: b.querySelectorAll('.cl-stats').length,
      body: b.textContent,
    };
  })()`);

  // v128：从三入口扩到四入口（新增「遇见」），「困惑」改名为「探索」。
  // 旧五入口（问心/三观/辩一辩/思想探索）仍然必须消失——这是 v126 的产品决定，不回退。
  ok(seg.tabs.length === 4, 'B1 观心有四个入口', seg.tabs.join(','));
  ok(seg.tabs.join(',') === 'today,feed,explore,notes', 'B2 入口为 今日/遇见/探索/手记', seg.tabs.join(','));
  ok(!seg.tabs.some((t) => ['ask', 'three', 'debate', 'themes'].includes(t)),
    'B3 旧五个分段入口全部消失', seg.tabs.join(','));
  ok(seg.flow === 0, 'B4 旧的三个跳转入口块已移除');
  ok(seg.stats === 0, 'B5 编辑后台指标（抽签池/待考关系）不再暴露给用户');

  /* ---------- C 阅读五步 ---------- */
  await click('#cl-body .cl-more[data-step="2"]');
  await sleep(400);
  const s2 = await ev(`(() => {
    const b = document.querySelector('#cl-body');
    return {
      step2: b.querySelectorAll('.cl-step2').length,
      heads: [...b.querySelectorAll('.cl-step2 .cl-block-h')].map((e) => e.textContent.trim()),
      ctx: b.querySelectorAll('.cl-ctx').length,
      cor: b.querySelectorAll('.cl-cor').length,
    };
  })()`);
  ok(s2.step2 >= 1, 'C1 点「往下看」展开第二步', `blocks=${s2.step2}`);
  ok(s2.heads.some((h) => /场合/.test(h)), 'C2 第二步讲这句话是在什么场合说的', s2.heads.join('|'));
  ok(s2.ctx >= 1 || s2.cor >= 1, 'C3 第二步有语境或常见误读的实证内容');

  await click('#cl-body .cl-more[data-step="3"]');
  await sleep(400);
  const s3 = await ev(`(() => {
    const b = document.querySelector('#cl-body');
    return {
      step3: b.querySelectorAll('.cl-step3').length,
      cm: b.querySelectorAll('.cl-cm').length,
      cmAuthor: (b.querySelector('.cl-cm-h') || { textContent: '' }).textContent.trim(),
      disp: b.querySelectorAll('.cl-disp').length,
      tags: [...b.querySelectorAll('.cl-step3 .cl-src-tag')].map((e) => e.textContent.trim()),
      debate: b.querySelectorAll('.cl-debate').length,
    };
  })()`);
  ok(s3.step3 >= 1, 'C4 第三步展开');
  ok(s3.cm >= 1, 'C5 第三步有历代注家原话', `注家=${s3.cm}`);
  ok(s3.tags.some((t) => /注疏/.test(t)), 'C6 注疏被明确标注为与现代解读不同来源', s3.tags.join('|'));

  await click('#cl-body .cl-more[data-step="4"]');
  await sleep(400);
  const s4 = await ev(`(() => {
    const b = document.querySelector('#cl-body');
    return {
      step4: b.querySelectorAll('.cl-step4').length,
      fbs: [...b.querySelectorAll('.cl-fb')].map((e) => e.dataset.fb),
      labels: [...b.querySelectorAll('.cl-fb')].map((e) => e.textContent.trim()),
    };
  })()`);
  ok(s4.step4 >= 1, 'C7 第四步展开');
  ok(s4.fbs.length === 5, 'C8 五个反馈选项齐全', s4.fbs.join(','));
  ok(s4.labels.some((l) => /不同看法/.test(l)), 'C9 反馈不是同意/不同意二选一（允许不同意）', s4.labels.join('|'));

  /* ---------- D 反馈的即时响应 ---------- */
  await click('#cl-body .cl-fb[data-fb="disagree"]');
  await sleep(400);
  const fb = await ev(`(() => {
    const b = document.querySelector('#cl-body');
    const echo = b.querySelector('.cl-fb-echo');
    return {
      on: b.querySelectorAll('.cl-fb.on').length,
      echo: !!echo,
      text: echo ? echo.textContent.trim() : '',
    };
  })()`);
  ok(fb.on === 1, 'D1 选中的反馈有可见状态');
  ok(fb.echo, 'D2 反馈后有即时回应（不是点了没反应）');
  ok(fb.text.length > 10, 'D3 回应是有内容的一句话', fb.text.slice(0, 40));

  /* ---------- E 思想手记 ---------- */
  await click('#cl-body .cl-more[data-step="5"]');
  await sleep(400);
  const s5 = await ev(`(() => {
    const b = document.querySelector('#cl-body');
    return {
      step5: b.querySelectorAll('.cl-step5').length,
      ta: !!b.querySelector('#cl-journal-input'),
      save: !!b.querySelector('[data-act="journal-save"]'),
    };
  })()`);
  ok(s5.step5 >= 1 && s5.ta, 'E1 第五步提供手记输入');
  ok(s5.save, 'E2 手记有保存动作');

  await ev(`(() => {
    const t = document.querySelector('#cl-journal-input');
    t.value = '我一直以为克己是压抑自己，看完才知道还有另一种读法。';
    t.dispatchEvent(new Event('input', { bubbles: true }));
    return 'ok';
  })()`);
  await sleep(200);
  await click('#cl-body [data-act="journal-save"]');
  await sleep(500);

  const saved = await ev(`(() => {
    const raw = localStorage.getItem('qintian.classic.journal') || '{}';
    const all = JSON.parse(raw);
    const keys = Object.keys(all);
    return { keys, n: keys.length, first: keys.length ? all[keys[0]] : [] };
  })()`);
  ok(saved.n === 1, 'E3 手记写入了本地存储', JSON.stringify(saved.keys));
  ok(saved.first.length === 1 && /克己/.test(saved.first[0].text), 'E4 手记内容完整保存', JSON.stringify(saved.first).slice(0, 80));

  const nodeId = saved.keys[0];

  /* ---------- E5 再次遇到同一条时回显 ---------- */
  await openPanel('today');
  await sleep(500);
  const echo = await ev(`(() => {
    const e = document.querySelector('#cl-body .cl-echo');
    return { on: !!e, text: e ? e.textContent.trim() : '' };
  })()`);
  ok(echo.on, 'E5 再次遇到读过的条目，首页就回显上次的记录');
  ok(/克己/.test(echo.text), 'E6 回显的是用户自己写过的话', echo.text.slice(0, 50));

  /* ---------- E7 手记列表 ---------- */
  await openPanel('notes');
  await sleep(400);
  const jl = await ev(`(() => {
    const b = document.querySelector('#cl-body');
    return {
      rows: b.querySelectorAll('.cl-jrow').length,
      text: b.textContent,
      title: (b.querySelector('.cl-jrow-t') || { textContent: '' }).textContent.trim(),
    };
  })()`);
  ok(jl.rows === 1, 'E7 手记分段列出了这条记录', `rows=${jl.rows}`);
  ok(jl.text.includes('克己') || jl.title.length > 0, 'E8 手记列表显示内容或条目名');

  /* ---------- F 困惑探索 ---------- */
  await openPanel('explore');
  await sleep(400);
  const th = await ev(`(() => {
    const b = document.querySelector('#cl-body');
    return {
      themes: [...b.querySelectorAll('.cl-theme')].map((e) => e.dataset.id),
      names: [...b.querySelectorAll('.cl-theme-n')].map((e) => e.textContent.trim()),
      intro: (b.querySelector('.cl-themes-intro') || { textContent: '' }).textContent.trim(),
    };
  })()`);
  ok(th.themes.length === 8, 'F1 探索页有八个现实主题', th.themes.join(','));
  ok(th.names.includes('工作与选择') && th.names.includes('人际关系'), 'F2 主题用的是现实说法不是学术分类', th.names.join('|'));
  ok(th.intro.length > 10, 'F3 困惑探索有一句说明它是什么', th.intro.slice(0, 40));

  await click('#cl-body .cl-theme[data-id="work"]');
  await sleep(500);
  const tp = await ev(`(() => {
    const b = document.querySelector('#cl-body');
    return {
      items: b.querySelectorAll('.cl-tp-item').length,
      note: (b.querySelector('.cl-tp-note') || { textContent: '' }).textContent.trim(),
      first: (b.querySelector('.cl-tp-item-t') || { textContent: '' }).textContent.trim(),
    };
  })()`);
  ok(tp.items >= 1, 'F4 主题下有可读的条目', `items=${tp.items}`);
  ok(/不代表/.test(tp.note) && /原典|联系/.test(tp.note), 'F5 主题推荐被标注为不等于原典关系', tp.note.slice(0, 50));

  if (tp.items >= 1) {
    await click('#cl-body .cl-tp-item');
    await sleep(500);
    const rd = await ev(`(() => {
      const b = document.querySelector('#cl-body');
      const r = b.querySelector('.cl-read');
      return { has: !!r, original: (b.querySelector('.cl-read-o') || { textContent: '' }).textContent.trim() };
    })()`);
    ok(rd.has && rd.original.length >= 8, 'F6 从主题点进去能直接开始读一条', rd.original.slice(0, 20));
  }

  /* ---------- J 八个主题是人工编排，不是标签自动取 ---------- */
  await openPanel('explore');
  await sleep(400);
  const themeAudit = [];
  for (const id of ['work', 'people', 'self', 'desire', 'direction', 'mood', 'principle', 'meaning']) {
    await ev(`(() => { const b = document.querySelector('#cl-body [data-act="back-themes"]'); if (b) b.click(); return 'ok'; })()`);
    await sleep(180);
    await click(`#cl-body .cl-theme[data-id="${id}"]`);
    await sleep(320);
    const d = await ev(`(() => {
      const b = document.querySelector('#cl-body');
      const items = [...b.querySelectorAll('.cl-tp-item')];
      return {
        n: items.length,
        nums: items.map((e) => (e.querySelector('.cl-tp-item-n') || { textContent: '' }).textContent.trim()),
        whys: items.filter((e) => (e.querySelector('.cl-tp-item-w') || { textContent: '' }).textContent.trim().length > 8).length,
        tags: items.map((e) => [...e.querySelectorAll('.cl-tp-item-b i')].map((x) => x.textContent.trim())),
        path: (b.querySelector('.cl-tp-path') || { textContent: '' }).textContent.trim(),
        note: (b.querySelector('.cl-tp-note') || { textContent: '' }).textContent.trim(),
        full: b.textContent,
      };
    })()`);
    themeAudit.push({ id, ...d });
  }
  const allSeq = themeAudit.every((t) => t.n >= 6);
  ok(allSeq, 'J1 八个主题都有人工编排的阅读序列', themeAudit.map((t) => `${t.id}:${t.n}`).join(' '));
  ok(themeAudit.every((t) => t.whys === t.n), 'J2 每一条都写了推荐理由（为什么排在这个位置）',
    themeAudit.map((t) => `${t.id}:${t.whys}/${t.n}`).join(' '));
  ok(themeAudit.every((t) => t.tags.every((g) => g.length === 2)), 'J3 每一条都标了关联类型和是否适合初读',
    themeAudit.map((t) => `${t.id}:${t.tags.filter((g) => g.length === 2).length}/${t.n}`).join(' '));
  ok(themeAudit.every((t) => t.nums.every((x, i) => x === String(i + 1))), 'J4 序列带推荐顺序（1..n 连续）',
    themeAudit[0].nums.join(','));
  ok(themeAudit.every((t) => /阅读路径/.test(t.path)), 'J5 每个主题写明了阅读路径', themeAudit[0].path.slice(0, 34));
  ok(themeAudit.every((t) => /编辑|不是原典主张/.test(t.note)), 'J6 推荐被标注为编辑判断，不是原典主张', themeAudit[0].note.slice(0, 30));
  ok(new Set(themeAudit.map((t) => t.n)).size > 1, 'J7 各主题数量不必均匀（宁可少而准）',
    [...new Set(themeAudit.map((t) => t.n))].join('/'));
  ok(themeAudit.every((t) => !/正方|反方/.test(t.full)), 'J8 主题序列不制造对立阵营');

  /* ---------- I 「我怎么看」在阅读流程内展开 ---------- */
  await openPanel('today');
  await sleep(400);
  await click('#cl-body .cl-more[data-step="2"]');
  await sleep(300);
  await click('#cl-body .cl-more[data-step="3"]');
  await sleep(400);

  const beforeInline = await ev(`(() => ({
    hasBtn: !!document.querySelector('#cl-body [data-act="db-inline"]'),
    label: (document.querySelector('#cl-body [data-act="db-inline"]') || { textContent: '' }).textContent.trim(),
    inReading: !document.querySelector('#view-classic-detail').classList.contains('on'),
  }))()`);
  ok(beforeInline.hasBtn, 'I1 第三步有「我怎么看」入口（不再叫「说说我的立场」）', beforeInline.label);
  ok(/我怎么看/.test(beforeInline.label), 'I2 按钮文案是「我怎么看」', beforeInline.label);

  await click('#cl-body [data-act="db-inline"]');
  await sleep(500);
  const inline = await ev(`(() => {
    const b = document.querySelector('#cl-body');
    const secs = [...b.querySelectorAll('.cl-db-in .cl-db-sec-h')].map((e) => e.textContent.trim());
    const st = [...b.querySelectorAll('.cl-db-in .cl-st')].map((e) => e.textContent.trim());
    const detailOn = !!document.querySelector('#view-classic-detail') && document.querySelector('#view-classic-detail').classList.contains('on');
    return {
      secs, st,
      stillInClassic: !detailOn && !!b.querySelector('.cl-read'),
      hasDiffer: !!b.querySelector('#cl-differ'),
      hasSave: !!b.querySelector('[data-act="db-save"]'),
      hasClose: !!b.querySelector('[data-act="db-close"]'),
      foot: [...b.querySelectorAll('.cl-db-in .cl-foot')].map((e) => e.textContent.trim()).join(' | '),
    };
  })()`);
  ok(inline.stillInClassic, 'I3 点开后不跳页，仍在这一条内容里');
  ok(inline.secs.some((h) => /原文在说什么/.test(h)), 'I4 第一段：原文在说什么', inline.secs.join('|'));
  ok(inline.secs.some((h) => /历代注家怎么理解/.test(h)), 'I5 第二段：历代注家怎么理解这一点', inline.secs.join('|'));
  ok(inline.secs.some((h) => /我有不同看法/.test(h)), 'I6 第四段：我有不同看法', inline.secs.join('|'));
  ok(inline.st.length >= 3, 'I7 列出多种读法，不是正反两方', `读法=${inline.st.length}`);
  ok(!/正方|反方|支持方|反对方/.test(inline.st.join('')), 'I8 不制造对立阵营', inline.st.slice(0, 2).join(' / '));
  ok(/不是选项|可以都不选/.test(inline.foot), 'I9 明确写了可以都不选', inline.foot.slice(0, 40));
  ok(inline.hasDiffer && inline.hasSave, 'I10 不选任何读法也能写自己的理由');
  ok(inline.hasClose, 'I11 展开后可以收起');

  // 选一种读法
  await click('#cl-body .cl-db-in .cl-st');
  await sleep(450);
  const chosen = await ev(`(() => {
    const b = document.querySelector('#cl-body');
    const mine = b.querySelector('.cl-db-mine');
    return {
      has: !!mine,
      head: (b.querySelector('.cl-db-mine .cl-db-sec-h') || { textContent: '' }).textContent.trim(),
      text: mine ? mine.textContent.replace(/\s+/g, ' ').trim() : '',
      alt: (b.querySelector('.cl-db-alt-h') || { textContent: '' }).textContent.trim(),
      on: b.querySelectorAll('.cl-st.on').length,
    };
  })()`);
  ok(chosen.has && /你更接近/.test(chosen.head), 'I12 选了之后显示「你更接近哪一种理解」', chosen.head);
  ok(/不是对错判定|不必是哪一家/.test(chosen.text), 'I13 明确写了这只是位置对照，不是对错判定', chosen.text.slice(-40));
  ok(/另一边/.test(chosen.alt), 'I14 另一种读法被标为「如果你站在另一边」，不是「正确答案」', chosen.alt);
  ok(chosen.on === 1, 'I15 选中的读法有可见状态');

  // 再点一次取消
  await click('#cl-body .cl-db-in .cl-st');
  await sleep(400);
  const unset = await ev(`(() => ({
    mine: !!document.querySelector('#cl-body .cl-db-mine'),
    on: document.querySelectorAll('#cl-body .cl-st.on').length,
  }))()`);
  ok(!unset.mine && unset.on === 0, 'I16 再点一次可以取消，不必非得站队');

  /* ---------- G 原典八层仍可进入 ---------- */
  await openPanel('today');
  await sleep(400);
  // 展开到第三步，那里有「读完整八层」的入口
  await click('#cl-body .cl-more[data-step="2"]');
  await sleep(300);
  await click('#cl-body .cl-more[data-step="3"]');
  await sleep(300);
  await click('#cl-body .cl-more[data-step="4"]');
  await sleep(300);
  await click('#cl-body .cl-fb[data-fb="more"]');
  await sleep(400);
  const openBtn = await ev(`(() => {
    const b = document.querySelector('#cl-body [data-act="open"]');
    if (!b) return 'no-btn';
    b.click(); return 'ok';
  })()`);
  if (openBtn === 'ok') {
    await sleep(700);
    const det = await ev(`(() => {
      const d = document.querySelector('#classic-detail-body');
      if (!d) return { layers: 0, text: '' };
      return {
        layers: d.querySelectorAll('.cl-layer').length,
        text: d.textContent,
      };
    })()`);
    ok(det.layers >= 6, 'G1 原典八层详情仍可从阅读页进入且完整', `layers=${det.layers}`);
  } else {
    ok(false, 'G1 原典八层详情入口丢失');
  }

  /* ---------- H 无脚本错误 ---------- */
  ok(errors.length === 0, 'H1 全程无控制台报错', errors.slice(0, 3).join(' | '));

  /* ---------- 汇总 ---------- */
  console.log('');
  for (const p of pass) console.log('  \x1b[32m✓\x1b[0m ' + p);
  for (const f of fails) console.log('  \x1b[31m✗\x1b[0m ' + f);
  console.log('');
  console.log(`  通过 ${pass.length} 项，失败 ${fails.length} 项`);
  if (fails.length) {
    exitCode = 1;
    console.log('  失败项：\n' + fails.map((f) => '    · ' + f).join('\n'));
  }
} catch (e) {
  console.error('[test-classic-ui] 运行失败:', e && e.message);
  exitCode = 1;
} finally {
  try { await sess?.close(); } catch { /* ignore */ }
  try { await srv.close(); } catch { /* ignore */ }
  if (!has('--keep-profile')) {
    try { fs.rmSync(profile, { recursive: true, force: true }); } catch { /* ignore */ }
  }
}

process.exit(exitCode);
