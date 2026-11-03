#!/usr/bin/env node
/**
 * shots-feed.mjs — 观心 v128「遇见」本地实操截图
 *
 * 不是 mock，不是设计稿：真实 Chrome、真实 localStorage、真实指针拖动。
 * 每张图对应一条验收项，文件名就是验收项。
 *
 * 用法：node tools/shots-feed.mjs [--out <目录>]
 * 默认输出到 /Coze/Drive/编程专家/browser/screenshots/guanyin-v128
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
const { opt } = parseArgs(process.argv.slice(2));

const OUT = opt('--out') || '/Coze/Drive/编程专家/browser/screenshots/guanyin-v128';
fs.mkdirSync(OUT, { recursive: true });

const chrome = findChrome();
if (!chrome) { console.error('找不到 Chrome/Chromium（可用 QT_CHROME=<路径> 指定）'); process.exit(3); }

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const srv = await startStaticServer(APP);
const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'qt-shots-'));
let sess = null;

async function ev(expr) {
  const r = await sess.evaluate(expr);
  if (r && r.error) throw new Error(r.error);
  return r.value;
}

async function until(expr, timeout = 10000) {
  const t0 = Date.now();
  while (Date.now() - t0 < timeout) {
    if (await ev(expr)) return true;
    await sleep(120);
  }
  return false;
}

async function viewport(w, h, mobile = true) {
  await sess.cdp.send('Emulation.setDeviceMetricsOverride', {
    width: w, height: h, deviceScaleFactor: 2, mobile,
  });
  await sleep(300);
}

async function shot(name) {
  await sleep(450);
  const r = await sess.cdp.send('Page.captureScreenshot', { format: 'png', fromSurface: true });
  const p = path.join(OUT, name);
  fs.writeFileSync(p, Buffer.from(r.data, 'base64'));
  const kb = (fs.statSync(p).size / 1024).toFixed(0);
  console.log(`  · ${name} (${kb} KB)`);
  return p;
}

async function gotoApp() {
  await sess.goto(srv.url + '/', 30000);
  await until(`document.readyState === 'complete' && !!document.querySelector('.tabbar .tab')`, 20000);
  await sleep(1600);
  await until(`!!document.querySelector('.tabbar .tab[data-view="classic"]')`, 15000);
}

async function openPanel(id) {
  for (let i = 0; i < 3; i++) {
    await ev(`(() => { const t = document.querySelector('.tabbar .tab[data-view="classic"]'); if (t) t.click(); return 'ok'; })()`);
    if (!(await until(`!!document.querySelector('#classic-body .cl-tab[data-panel="${id}"]')`, 5000))) { await sleep(400); continue; }
    await ev(`(() => { const t = document.querySelector('#classic-body .cl-tab[data-panel="${id}"]'); if (t) t.click(); return 'ok'; })()`);
    await sleep(400);
    if (await ev(`!!document.querySelector('#cl-body')`)) return true;
  }
  return false;
}

async function swipe(dx, dy) {
  return ev(`(() => {
    const DX = ${Number(dx)}, DY = ${Number(dy)};
    const card = document.querySelector('#cl-body .cl-card');
    if (!card) return 'no-card';
    const r = card.getBoundingClientRect();
    const x0 = r.left + 60, y0 = r.top + 80;
    const mk = (t, x, y, b) => new PointerEvent(t, { bubbles: true, cancelable: true, pointerId: 1, pointerType: 'touch', clientX: x, clientY: y, isPrimary: true, button: 0, buttons: b });
    card.dispatchEvent(mk('pointerdown', x0, y0, 1));
    for (let i = 1; i <= 6; i++) card.dispatchEvent(mk('pointermove', x0 + DX * i / 6, y0 + DY * i / 6, 1));
    card.dispatchEvent(mk('pointerup', x0 + DX, y0 + DY, 0));
    return 'ok';
  })()`);
}

try {
  sess = await openPage({ chrome, profile });

  // ---- 移动端 390×844（手势的主场景）----
  await viewport(390, 844, true);
  await gotoApp();
  await ev(`['qintian.classic.mark.v2','qintian.classic.fav','qintian.classic.feed.v1','qintian.classic.journal'].forEach(k => localStorage.removeItem(k))`);
  await gotoApp();

  console.log('截图：');
  await openPanel('today');
  await shot('01-today-mobile.png');

  await openPanel('feed');
  const first = await ev(`(() => { const c = document.querySelector('#cl-body .cl-card'); return c ? c.dataset.id + ' | ' + (c.querySelector('.cl-card-idx') || {}).textContent : 'none'; })()`);
  console.log(`    首张：${first}`);
  await shot('02-feed-first-mobile.png');

  // 右滑 → 留下（拖动到一半时截一张，证明位移反馈真实存在）
  await ev(`(() => {
    const card = document.querySelector('#cl-body .cl-card');
    const r = card.getBoundingClientRect();
    const x0 = r.left + 60, y0 = r.top + 80;
    const mk = (t, x, y, b) => new PointerEvent(t, { bubbles: true, cancelable: true, pointerId: 1, pointerType: 'touch', clientX: x, clientY: y, isPrimary: true, button: 0, buttons: b });
    card.dispatchEvent(mk('pointerdown', x0, y0, 1));
    for (let i = 1; i <= 6; i++) card.dispatchEvent(mk('pointermove', x0 + 110 * i / 6, y0, 1));
    return 'dragging';
  })()`);
  await shot('03-feed-dragging-mobile.png');

  await ev(`(() => {
    const card = document.querySelector('#cl-body .cl-card');
    const r = card.getBoundingClientRect();
    const x0 = r.left + 60, y0 = r.top + 80;
    const mk = (t, x, y, b) => new PointerEvent(t, { bubbles: true, cancelable: true, pointerId: 1, pointerType: 'touch', clientX: x, clientY: y, isPrimary: true, button: 0, buttons: b });
    card.dispatchEvent(mk('pointerup', x0 + 110, y0, 0));
    return 'ok';
  })()`);
  await sleep(500);
  await shot('04-feed-after-swipe-mobile.png');

  // 再存疑一张，让手记页两种徽章都有
  await swipe(-120, 0);
  await sleep(500);

  await openPanel('notes');
  await shot('05-notes-mobile.png');

  await openPanel('explore');
  await shot('06-explore-mobile.png');

  // 耗尽态：把进度推到池尾
  const total = await ev(`(() => { const st = JSON.parse(localStorage.getItem('qintian.classic.feed.v1')||'{}'); const h = document.querySelector('#cl-body .cl-feed-hd-n'); return h ? h.textContent : String(st.seq); })()`);
  await ev(`(() => {
    const raw = localStorage.getItem('qintian.classic.feed.v1');
    const st = raw ? JSON.parse(raw) : { round: 0, seq: 0, seen: [] };
    st.seq = 9999;
    localStorage.setItem('qintian.classic.feed.v1', JSON.stringify(st));
    return 'ok';
  })()`);
  await gotoApp();
  await openPanel('feed');
  const endTxt = await ev(`(() => { const e = document.querySelector('#cl-body .cl-feed-end'); return e ? e.textContent.replace(/\\s+/g,' ').trim().slice(0,90) : 'none'; })()`);
  console.log(`    耗尽态：${endTxt}`);
  await shot('07-feed-end-mobile.png');

  // ---- 桌面端 1280×900 ----
  await viewport(1280, 900, false);
  await ev(`(() => { localStorage.setItem('qintian.classic.feed.v1', JSON.stringify({ round: 0, seq: 0, seen: [] })); return 'ok'; })()`);
  await gotoApp();
  await openPanel('feed');
  await shot('08-feed-desktop.png');

  await openPanel('notes');
  await shot('09-notes-desktop.png');

  const errs = [...(sess.exceptions || []).map((e) => e.text), ...(sess.consoleErrors || [])]
    .filter((t) => !/favicon/i.test(t));
  console.log(`\nconsole error：${errs.length ? errs.slice(0, 5).join(' | ') : '无'}`);
  console.log(`\n输出目录：${OUT}`);
} finally {
  try { await sess?.close(); } catch { /* ignore */ }
  try { await srv.close(); } catch { /* ignore */ }
  try { fs.rmSync(profile, { recursive: true, force: true }); } catch { /* ignore */ }
}
