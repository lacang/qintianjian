#!/usr/bin/env node
/**
 * shots-v126.mjs — 观心 v126 阅读改造的视觉验收截图
 *
 * 只做一件事：用真实浏览器、真实点击、真实滚动，把用户会看到的每一屏拍下来。
 * 不做断言（断言在 test-classic-ui.mjs），不产出报告（报告在 acceptance-classic.mjs）。
 *
 * 两条踩过的坑，这里都按规则处理：
 *   1. 设备指标必须在**第一次截图之前**设置。否则前面几张是默认矮视口，
 *      构图全是错的，据此调样式会越调越歪。
 *   2. 每一步都先滚回顶部再拍，否则拍到的是上一屏的残留位置。
 *
 * 用法：node tools/shots-v126.mjs [--out 目录]
 */
import path from 'node:path';
import os from 'node:os';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import { startStaticServer } from './lib/static-server.mjs';
import { findChrome, parseArgs } from './lib/browser.mjs';
import { openPage } from './lib/cdp.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const APP = path.resolve(path.join(HERE, '..', 'app'));
const { has, opt } = parseArgs(process.argv.slice(2));
const OUT = opt('--out') || path.join(HERE, '..', 'acceptance', '观心阅读v126');
fs.mkdirSync(OUT, { recursive: true });

const chrome = findChrome();
if (!chrome) { console.error('找不到 Chrome'); process.exit(3); }

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const srv = await startStaticServer(APP);
const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'qt-shot-'));
let sess;

async function ev(expr) {
  const r = await sess.evaluate(expr);
  if (r && r.error) throw new Error(r.error);
  return r.value;
}

async function click(sel) {
  const r = await ev(`(() => { const e = document.querySelector(${JSON.stringify(sel)}); if (!e) return 'no-el'; e.click(); return 'ok'; })()`);
  if (r !== 'ok') console.warn('  ! 点不到', sel);
  return r;
}

async function capture(file) {
  const r = await sess.cdp.send('Page.captureScreenshot', { format: 'png' });
  fs.writeFileSync(file, Buffer.from(r.data, 'base64'));
  console.log('  · ' + path.basename(file));
}

// keepScroll=true 时不重置滚动位置：用来拍「推进之后用户实际看到的那一屏」，
// 这一屏才是判断「点了有没有反应」的唯一依据。
async function shot(name, keepScroll = false) {
  if (!keepScroll) await ev(`window.scrollTo(0, 0)`);
  await sleep(900);
  await capture(path.join(OUT, name + '.png'));
}

try {
  sess = await openPage({ chrome, profile, headless: true });
  // 坑 1：先定视口，再拍第一张。
  await sess.cdp.send('Emulation.setDeviceMetricsOverride', {
    width: 390, height: 844, deviceScaleFactor: 2, mobile: true,
  });

  await sess.goto(srv.url + '/', 30000);
  await sleep(2200);
  await ev(`localStorage.removeItem('qintian.classic.journal')`);

  await click('.tabbar .tab[data-view="classic"]');
  await sleep(700);
  await shot('01-首页第一屏');

  // 往下滚，看第一屏底部（推进动作是否在视线内）
  await ev(`window.scrollTo(0, document.body.scrollHeight)`);
  await sleep(400);
  await capture(path.join(OUT, '02-第一屏底部.png'));
  console.log('  · 02-第一屏底部.png');

  await ev(`window.scrollTo(0, 0)`);
  await click('#cl-body [data-act="step"][data-step="2"]');
  await sleep(600);
  await shot('03-第二步-语境', true);

  await click('#cl-body [data-act="step"][data-step="3"]');
  await sleep(600);
  await shot('04-第三步-注家', true);

  // 「我怎么看」：就地展开四段，不跳页
  await click('#cl-body [data-act="db-inline"]');
  await sleep(700);
  await ev(`(() => {
    const el = document.querySelector('#cl-body .cl-db-in');
    if (el) window.scrollTo(0, el.getBoundingClientRect().top + window.scrollY - 56);
    return 'ok';
  })()`);
  await sleep(400);
  await capture(path.join(OUT, '04b-我怎么看-展开.png'));
  console.log('  · 04b-我怎么看-展开.png');

  // 选一种读法（不是选项，是站位）
  await click('#cl-body .cl-st');
  await sleep(650);
  await ev(`(() => {
    const el = document.querySelector('#cl-body .cl-db-mine');
    if (el) window.scrollTo(0, el.getBoundingClientRect().top + window.scrollY - 56);
    return 'ok';
  })()`);
  await sleep(400);
  await capture(path.join(OUT, '04c-更接近哪一种.png'));
  console.log('  · 04c-更接近哪一种.png');

  await ev(`window.scrollTo(0, document.body.scrollHeight)`);
  await sleep(400);
  await capture(path.join(OUT, '05-第三步底部-完整资料.png'));
  console.log('  · 05-第三步底部-完整资料.png');

  await ev(`window.scrollTo(0, 0)`);
  await click('#cl-body [data-act="step"][data-step="4"]');
  await sleep(600);
  await shot('06-第四步-反馈', true);

  await click('#cl-body .cl-fb[data-fb="disagree"]');
  await sleep(600);
  await ev(`document.querySelector('#cl-body .cl-fb-echo').scrollIntoView({block:'center'})`);
  await sleep(300);
  await capture(path.join(OUT, '07-反馈后的回应.png'));
  console.log('  · 07-反馈后的回应.png');

  await click('#cl-body [data-act="step"][data-step="5"]');
  await sleep(600);
  await ev(`(() => {
    const t = document.querySelector('#cl-journal-input');
    t.value = '我一直以为克己是压抑自己。原来还有另一种读法。';
    t.dispatchEvent(new Event('input', { bubbles: true }));
  })()`);
  await sleep(300);
  await ev(`document.querySelector('#cl-journal-input').scrollIntoView({block:'center'})`);
  await sleep(300);
  await capture(path.join(OUT, '08-第五步-手记.png'));
  console.log('  · 08-第五步-手记.png');

  await click('#cl-body [data-act="journal-save"]');
  await sleep(700);
  await shot('09-读完之后', true);

  // 再次回到今日：旧记录回显
  await click('#classic-body .cl-tab[data-panel="today"]');
  await sleep(800);
  await shot('10-再次遇到时回显');

  await click('#classic-body .cl-tab[data-panel="notes"]');
  await sleep(600);
  await shot('11-思想手记');

  await click('#classic-body .cl-tab[data-panel="themes"]');
  await sleep(600);
  await shot('12-困惑探索');

  await click('#cl-body .cl-theme[data-id="work"]');
  await sleep(700);
  await shot('13-主题详情');

  await click('#cl-body .cl-tp-item');
  await sleep(700);
  await shot('14-从主题进入阅读');

  console.log('\n  截图已存到 ' + OUT);
} catch (e) {
  console.error('截图失败:', e && e.message);
  process.exitCode = 1;
} finally {
  try { await sess?.close(); } catch { /* ignore */ }
  try { await srv.close(); } catch { /* ignore */ }
  try { fs.rmSync(profile, { recursive: true, force: true }); } catch { /* ignore */ }
}
