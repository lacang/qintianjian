#!/usr/bin/env node
/**
 * test-classic-feed-ui.mjs — 「遇见」的真实浏览器验收
 *
 * 为什么必须单独一个文件
 * ----------------------
 * 抽取可以在 Node 里证明（test-classic-feed.mjs），但「遇见」的产品承诺有一半
 * 只在真实浏览器里成立：
 *
 *   · 左右滑动真的能滑走，不是只有按钮能点；
 *   · 纵向滚动不被手势吃掉 —— 这是移动端最容易做坏、也最容易让用户以为卡死的地方；
 *   · 刷新之后还在原来的位置，不是每次都从第一条重新开始；
 *   · 走完一轮说的是真话，不是回绕取模假装还有内容。
 *
 * 这四条渲染测试证明不了，只能靠真实指针事件和真实 localStorage。
 *
 * 覆盖：
 *   A 四入口（今日 / 遇见 / 探索 / 手记）
 *   B 卡片五项齐全，且原典与现代解读在视觉上分层
 *   C 三个动作按钮常驻（不依赖手势）
 *   D 按钮：留下 → 记标记 + 前进
 *   E 按钮：存疑 → 记标记 + 前进
 *   F 刷新后进度恢复（不是回到第一条）
 *   G 手势：右滑 → 留下
 *   H 手势：左滑 → 存疑
 *   I 手势：小幅拖动 → 回弹，不前进
 *   J 手势：纵向拖动 → 交还给滚动，不前进
 *   K 手记页能看见标记，且能撤销
 *   L 耗尽态：真实数字 + 明确「没有更多」+ 可重开一轮
 *   M 重开一轮：回到第一条，手记与标记都还在
 *   N 今日与探索未被破坏
 *   O 无新增 console error
 *
 * 用法：node tools/test-classic-feed-ui.mjs [--keep-profile]
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
  console.error('[test-classic-feed-ui] 找不到 Chrome/Chromium（可用 QT_CHROME=<路径> 指定）');
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
  ? path.join(os.tmpdir(), 'qt-classic-feed-profile')
  : fs.mkdtempSync(path.join(os.tmpdir(), 'qt-classic-feed-'));

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
    if (await ev(expr)) return true;
    await sleep(120);
  }
  return false;
}

async function click(sel) {
  return ev(`(() => { const e = document.querySelector(${JSON.stringify(sel)}); if (!e) return 'no-el'; e.click(); return 'ok'; })()`);
}

async function gotoApp() {
  await sess.goto(srv.url + '/', 30000);
  await until(`document.readyState === 'complete' && !!document.querySelector('.tabbar .tab')`, 20000);
  await sleep(1500);
  await until(`!!document.querySelector('.tabbar .tab[data-view="classic"]')`, 15000);
}

/** 进入观心并切到指定分段；返回 'ok' 或失败原因 */
async function openPanel(panelId) {
  for (let attempt = 0; attempt < 3; attempt++) {
    await click('.tabbar .tab[data-view="classic"]');
    const ready = await until(`!!document.querySelector('#classic-body .cl-tab[data-panel="${panelId}"]')`, 5000);
    if (!ready) { await sleep(500); continue; }
    const r = await click(`#classic-body .cl-tab[data-panel="${panelId}"]`);
    if (r !== 'ok') { await sleep(300); continue; }
    await sleep(300);
    const done = await ev(`!!document.querySelector('#cl-body') && document.querySelector('#cl-body').textContent.trim().length > 20`);
    if (done) return 'ok';
    await sleep(300);
  }
  return 'no-panel';
}

/** 读当前卡片状态 */
async function cardState() {
  return ev(`(() => {
    const card = document.querySelector('#cl-body .cl-card');
    if (!card) {
      const end = document.querySelector('#cl-body .cl-feed-end');
      return end ? { end: true, text: end.textContent } : { none: true };
    }
    const t = (s) => { const e = card.querySelector(s); return e ? e.textContent.trim() : ''; };
    const hd = document.querySelector('#cl-body .cl-feed-hd-n');
    const idx = t('.cl-card-idx');
    const m = idx.match(/(\\d+)\\s*\\/\\s*(\\d+)/);
    return {
      id: card.dataset.id,
      idxText: idx,
      hdText: hd ? hd.textContent.trim() : '',
      seq: m ? Number(m[1]) : -1,
      total: m ? Number(m[2]) : -1,
      orig: t('.cl-card-orig'),
      who: t('.cl-card-who'),
      src: t('.cl-card-src'),
      modern: t('.cl-card-modern'),
      tag: t('.cl-card-tag'),
      think: t('.cl-card-think'),
      hasRule: !!card.querySelector('.cl-card-rule'),
      cls: card.className,
    };
  })()`);
}

async function marksRaw() {
  return ev(`(() => { try { return JSON.parse(localStorage.getItem('qintian.classic.mark.v2') || '{}'); } catch { return {}; } })()`);
}

async function feedRaw() {
  return ev(`(() => { try { return JSON.parse(localStorage.getItem('qintian.classic.feed.v1') || 'null'); } catch { return null; } })()`);
}

/** 合成一次真实指针拖动（走的是页面里同一套 Pointer Events 处理） */
async function swipe(dx, dy) {
  return ev(`(() => {
    const DX = ${Number(dx)};
    const DY = ${Number(dy)};
    const card = document.querySelector('#cl-body .cl-card');
    if (!card) return 'no-card';
    const r = card.getBoundingClientRect();
    const x0 = r.left + 60, y0 = r.top + 80;
    const mk = (t, x, y, buttons) => new PointerEvent(t, {
      bubbles: true, cancelable: true, pointerId: 1, pointerType: 'touch',
      clientX: x, clientY: y, isPrimary: true, button: 0, buttons: buttons,
    });
    card.dispatchEvent(mk('pointerdown', x0, y0, 1));
    const steps = 6;
    for (let i = 1; i <= steps; i++) {
      card.dispatchEvent(mk('pointermove', x0 + DX * i / steps, y0 + DY * i / steps, 1));
    }
    card.dispatchEvent(mk('pointerup', x0 + DX, y0 + DY, 0));
    return 'ok';
  })()`);
}

const errors = [];

try {
  sess = await openPage({ chrome, profile, headless: true });
  sess.onConsole?.((m) => { if (m.type === 'error') errors.push(m.text); });

  await gotoApp();

  // 从干净状态开始：只清观心自己的四个键，不碰术数的本地数据
  await ev(`['qintian.classic.mark.v2','qintian.classic.fav','qintian.classic.feed.v1','qintian.classic.journal'].forEach(k => localStorage.removeItem(k))`);
  await gotoApp();

  // ---------------- A. 四入口 ----------------
  const tabInfo = await ev(`(() => {
    const ts = [...document.querySelectorAll('#classic-body .cl-tab')];
    return { n: ts.length, names: ts.map(t => t.textContent.trim()), panels: ts.map(t => t.dataset.panel) };
  })()`).catch(() => null);

  // 还没进观心时 tabs 可能不在 DOM 里，先切进去再读
  await click('.tabbar .tab[data-view="classic"]');
  await until(`!!document.querySelector('#classic-body .cl-tab')`, 6000);
  const tabs = await ev(`(() => {
    const ts = [...document.querySelectorAll('#classic-body .cl-tab')];
    return { n: ts.length, names: ts.map(t => t.textContent.trim()), panels: ts.map(t => t.dataset.panel) };
  })()`);

  ok(tabs.n === 4, '四个入口', `实际 ${tabs.n}：${tabs.names.join('/')}`);
  ok(tabs.names.join('/') === '今日/遇见/探索/手记', '入口名称与顺序正确', tabs.names.join('/'));
  ok(tabs.panels.join(',') === 'today,feed,explore,notes', '入口 id 正确', tabs.panels.join(','));
  ok(!tabs.names.includes('困惑'), '「困惑」不再出现在入口上（改为「探索」）');

  // ---------------- B. 卡片五项 ----------------
  ok((await openPanel('feed')) === 'ok', '能切到「遇见」');
  let s = await cardState();
  ok(!s.none && !s.end, '遇见首屏有卡片');
  ok(!!s.id, '卡片带 data-id', String(s.id));
  ok(!!s.orig && s.orig.length >= 4, '① 原典内容非空', String(s.orig).slice(0, 20));
  ok(!!s.who, '② 作者或人物非空', String(s.who));
  ok(!!s.src, '③ 经典及篇章出处非空', String(s.src));
  ok(!!s.modern && s.modern.length >= 10, '④ 现代解读非空', String(s.modern).slice(0, 20));
  ok(!!s.think && s.think.length >= 4, '⑤ 值得思考的问题非空', String(s.think).slice(0, 20));
  ok(s.hasRule, '原典与现代解读之间有硬分隔线（分层不是靠留白）');
  ok(/现代解读/.test(s.tag) && /不是古人原意|编辑/.test(s.tag), '现代解读有来源标注，未被伪装成原典', String(s.tag));
  ok(s.seq === 1 && s.total > 0, '序号从 1 开始且总数真实', s.idxText);

  const TOTAL = s.total;
  ok(TOTAL > 1, '内容池不止一条', `总数 ${TOTAL}`);

  // ---------------- C. 三个动作按钮 ----------------
  const acts = await ev(`(() => {
    const q = (s) => document.querySelectorAll(s).length;
    return { doubt: q('#cl-body .cl-act-doubt'), deep: q('#cl-body .cl-act-deep'), keep: q('#cl-body .cl-act-keep') };
  })()`);
  ok(acts.doubt === 1 && acts.deep === 1 && acts.keep === 1, '存疑 / 深入阅读 / 留下 三个按钮常驻', JSON.stringify(acts));

  // ---------------- D. 按钮：留下 ----------------
  const id1 = s.id;
  await click('#cl-body .cl-act-keep');
  await sleep(350);
  s = await cardState();
  let marks = await marksRaw();
  ok(s.id !== id1, '点「留下」后换到下一张', `仍是 ${s.id}`);
  ok(marks[id1] === 'keep', '「留下」写入了 keep 标记', JSON.stringify(marks[id1]));
  ok(s.seq === 2, '序号前进到 2', s.idxText);

  // ---------------- E. 按钮：存疑 ----------------
  const id2 = s.id;
  await click('#cl-body .cl-act-doubt');
  await sleep(350);
  s = await cardState();
  marks = await marksRaw();
  ok(s.id !== id2, '点「存疑」后换到下一张', `仍是 ${s.id}`);
  ok(marks[id2] === 'doubt', '「存疑」写入了 doubt 标记', JSON.stringify(marks[id2]));
  ok(s.seq === 3, '序号前进到 3', s.idxText);

  // ---------------- F. 刷新后恢复 ----------------
  await gotoApp();
  ok((await openPanel('feed')) === 'ok', '刷新后能再次进入「遇见」');
  s = await cardState();
  ok(s.seq === 3, '刷新后停在原来位置，不从第一条重来', s.idxText);
  const fState = await feedRaw();
  ok(fState && fState.seq === 2 && Array.isArray(fState.seen) && fState.seen.length === 2, '进度结构完整（seq + seen）', JSON.stringify(fState));

  // ---------------- G. 手势：右滑留下 ----------------
  const id3 = s.id;
  ok((await swipe(120, 0)) === 'ok', '右滑事件已派发');
  await sleep(450);
  s = await cardState();
  marks = await marksRaw();
  ok(s.id !== id3, '右滑后卡片被推走', `仍是 ${s.id}`);
  ok(marks[id3] === 'keep', '右滑 = 留下', JSON.stringify(marks[id3]));
  const seqAfterRight = s.seq;

  // ---------------- H. 手势：左滑存疑 ----------------
  const id4 = s.id;
  await swipe(-120, 0);
  await sleep(450);
  s = await cardState();
  marks = await marksRaw();
  ok(s.id !== id4, '左滑后卡片被推走', `仍是 ${s.id}`);
  ok(marks[id4] === 'doubt', '左滑 = 存疑', JSON.stringify(marks[id4]));
  ok(s.seq === seqAfterRight + 1, '左滑后序号 +1', s.idxText);

  // ---------------- I. 小幅拖动回弹 ----------------
  const id5 = s.id;
  await swipe(30, 0);
  await sleep(400);
  s = await cardState();
  ok(s.id === id5, '位移不足阈值时卡片回弹，不前进', `变成了 ${s.id}`);
  ok(!(await marksRaw())[id5], '小幅拖动不产生标记');

  // ---------------- J. 纵向拖动不前进 ----------------
  await swipe(90, 160);
  await sleep(400);
  s = await cardState();
  ok(s.id === id5, '纵向占优时交还给滚动，不前进', `变成了 ${s.id}`);
  ok(!(await marksRaw())[id5], '纵向拖动不产生标记');

  // ---------------- K. 手记页看见标记并撤销 ----------------
  ok((await openPanel('notes')) === 'ok', '能切到「手记」');
  const noteInfo = await ev(`(() => {
    const q = (s) => document.querySelectorAll(s).length;
    return {
      keep: q('#cl-body .cl-jm-keep'),
      doubt: q('#cl-body .cl-jm-doubt'),
      undo: q('#cl-body .cl-jrow-u'),
      filters: q('#cl-body .cl-jf'),
      rows: q('#cl-body .cl-jlist > *'),
      text: document.querySelector('#cl-body').textContent,
    };
  })()`);
  ok(noteInfo.keep >= 1, '手记页显示「留下」徽章', `keep=${noteInfo.keep}`);
  ok(noteInfo.doubt >= 1, '手记页显示「存疑」徽章', `doubt=${noteInfo.doubt}`);
  ok(noteInfo.undo >= 1, '手记页有撤销入口', `undo=${noteInfo.undo}`);
  ok(noteInfo.filters === 3, '手记页有全部/留下/存疑三个筛选', `实际 ${noteInfo.filters}`);
  ok(/全部/.test(noteInfo.text) && /留下/.test(noteInfo.text) && /存疑/.test(noteInfo.text), '筛选文案齐全');

  const beforeUndo = Object.keys(await marksRaw()).length;
  await click('#cl-body .cl-jrow-u');
  await sleep(350);
  const afterUndo = Object.keys(await marksRaw()).length;
  ok(afterUndo === beforeUndo - 1, '撤销真的删掉了一条标记', `${beforeUndo} → ${afterUndo}`);

  // ---------------- L. 耗尽态 ----------------
  // 直接把进度推到池尾：这比连滑 26 次快，且测的是同一段耗尽逻辑。
  await ev(`(() => {
    const st = JSON.parse(localStorage.getItem('qintian.classic.feed.v1') || '{}');
    st.seq = ${TOTAL};
    localStorage.setItem('qintian.classic.feed.v1', JSON.stringify(st));
    return 'ok';
  })()`);
  await gotoApp();
  await openPanel('feed');
  const endState = await ev(`(() => {
    const end = document.querySelector('#cl-body .cl-feed-end');
    const btn = document.querySelector('#cl-body .cl-more[data-act="feed-next-round"]');
    return {
      hasEnd: !!end,
      text: end ? end.textContent : '',
      hasBtn: !!btn,
      hasCard: !!document.querySelector('#cl-body .cl-card'),
      hasHd: !!document.querySelector('#cl-body .cl-feed-hd'),
    };
  })()`);
  ok(endState.hasEnd, '走完一轮时显示耗尽态');
  ok(!endState.hasCard, '耗尽时不显示空壳卡片');
  ok(endState.text.includes(String(TOTAL)), '耗尽提示给出真实数字', `期望含 ${TOTAL}`);
  ok(/都见过|走完|没有/.test(endState.text), '耗尽提示说清楚「没有更多」，不假装还有', endState.text.slice(0, 60));
  ok(!/加载|失败|错误|重试/.test(endState.text), '耗尽不是被说成错误');
  ok(endState.hasBtn, '耗尽态提供「再走一轮」');
  ok(endState.hasHd, '耗尽态仍显示进度抬头');

  // ---------------- M. 重开一轮 ----------------
  const marksBeforeRound = Object.keys(await marksRaw()).length;
  await ev(`localStorage.setItem('qintian.classic.journal', JSON.stringify({ '__probe__': [{ text: '保留测试', at: 1 }] }))`);
  await click('#cl-body .cl-more[data-act="feed-next-round"]');
  await sleep(400);
  s = await cardState();
  ok(s.seq === 1, '重开一轮回到第一条', s.idxText);
  const fRound = await feedRaw();
  ok(fRound && fRound.round === 1, '轮次 +1', JSON.stringify(fRound && fRound.round));
  ok(Object.keys(await marksRaw()).length === marksBeforeRound, '重开一轮不清标记');
  const journalKept = await ev(`(() => { try { return !!JSON.parse(localStorage.getItem('qintian.classic.journal'))['__probe__']; } catch { return false; } })()`);
  ok(journalKept, '重开一轮不清手记');
  ok(s.hdText.includes('第 2 轮'), '抬头标明这是第 2 轮', s.hdText);

  // ---------------- N. 今日与探索未被破坏 ----------------
  ok((await openPanel('today')) === 'ok', '「今日」仍可进入');
  const todayInfo = await ev(`(() => {
    const b = document.querySelector('#cl-body');
    return { len: b ? b.textContent.trim().length : 0, hasQuote: !!document.querySelector('#cl-body .cl-read-o'), text: b ? b.textContent.slice(0, 120) : '' };
  })()`);
  ok(todayInfo.len > 40, '今日首屏有内容', `长度 ${todayInfo.len}`);
  ok(todayInfo.hasQuote, '今日仍以原典引文开屏（五步入口未变）');

  ok((await openPanel('explore')) === 'ok', '「探索」仍可进入');
  const themeInfo = await ev(`(() => ({
    themes: document.querySelectorAll('#cl-body .cl-theme').length,
    text: document.querySelector('#cl-body').textContent,
  }))()`);
  ok(themeInfo.themes === 8, '探索页 8 个主题齐全', `实际 ${themeInfo.themes}`);
  ok(/按主题找思想/.test(themeInfo.text), '探索页表达已改为主题浏览', themeInfo.text.slice(0, 40));
  ok(!/你更接近哪一种|你的困惑/.test(themeInfo.text), '探索页不再要求用户先承认有困惑');

  // 主题下钻：51 条人工序列仍可用
  await click('#cl-body .cl-theme');
  await sleep(350);
  const seqInfo = await ev(`(() => {
    const b = document.querySelector('#cl-body');
    return { len: b ? b.textContent.trim().length : 0, items: document.querySelectorAll('#cl-body .cl-tp-item').length, text: b ? b.textContent.slice(0, 80) : '' };
  })()`);
  ok(seqInfo.items > 0, '主题下钻后有条目可读', `条目 ${seqInfo.items}`);

  // ---------------- O. console error ----------------
  const realErrors = errors.filter((t) => !/favicon|Failed to load resource.*404/i.test(t));
  ok(realErrors.length === 0, '无新增 console error', realErrors.slice(0, 3).join(' | '));

} catch (e) {
  fails.push('执行异常：' + (e && e.message ? e.message : String(e)));
  exitCode = 1;
} finally {
  try { await sess?.close(); } catch { /* ignore */ }
  try { await srv.close(); } catch { /* ignore */ }
  if (!has('--keep-profile')) { try { fs.rmSync(profile, { recursive: true, force: true }); } catch { /* ignore */ } }
}

console.log('');
if (fails.length) {
  console.error(`[test-classic-feed-ui] 通过 ${pass.length} 项，失败 ${fails.length} 项：`);
  for (const f of fails) console.error('  ✗ ' + f);
  process.exit(1);
}
console.log(`[test-classic-feed-ui] 全部通过（${pass.length} 项）`);
process.exit(exitCode);
