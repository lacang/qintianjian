#!/usr/bin/env node
/**
 * test-force-refresh-ui.mjs — 首页版本号与强制刷新的真实浏览器验收
 *
 * 这个功能只有一个风险点，也只需要证明一件事：
 *
 *   清缓存的时候，**不能把用户的数据一起清掉**。
 *
 * 出生配置（qintian.cfg.v1）、手记（qintian.classic.journal）、
 * 留下/存疑（qintian.classic.mark.v2）全在 localStorage 里。
 * Cache Storage 和 localStorage 是两套东西，但「强制刷新」这四个字
 * 很容易被实现成 location.reload() + 各种 clear()，一不小心就顺手清了。
 *
 * 所以这里的核心用例是：预置三类真实数据 → 按强刷 → 重载后逐项核对。
 * 另外用一个探针 cache 证明「Cache Storage 确实被清了」（探针不在 ASSETS 里，
 * SW 重装不会把它建回来，所以它消失就只能是清缓存干的）。
 *
 * 用法：node tools/test-force-refresh-ui.mjs
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
  console.error('[test-force-refresh-ui] 找不到 Chrome/Chromium（可用 QT_CHROME=<路径> 指定）');
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
  ? path.join(os.tmpdir(), 'qt-force-refresh-profile')
  : fs.mkdtempSync(path.join(os.tmpdir(), 'qt-force-refresh-'));

let sess = null;

async function ev(expr) {
  const r = await sess.evaluate(expr);
  if (r && r.error) throw new Error(r.error);
  return r.value;
}

/** 导航期间 evaluate 会因 context 销毁而报错，这里吞掉错误继续轮询 */
async function until(expr, timeout = 15000) {
  const t0 = Date.now();
  while (Date.now() - t0 < timeout) {
    try {
      if (await ev(expr)) return true;
    } catch { /* context 正在销毁，继续等 */ }
    await sleep(150);
  }
  return false;
}

/**
 * 等页面真正稳定。
 *
 * 这里有个必须等的东西：SW 第一次接管页面时会触发 controllerchange，
 * main.js 收到就 location.reload() 一次。这一刷是设计好的（保证首访即最新），
 * 但它意味着「首屏加载完」不等于「页面稳定」——在那几百毫秒里读到的
 * 版本号是初始的 v—，布局也还没落位。用 timeOrigin 连续不变来判稳定，
 * 比任何固定 sleep 都可靠。
 */
async function settlePage(minStableMs = 1500) {
  let last = null;
  let stableSince = 0;
  const t0 = Date.now();
  while (Date.now() - t0 < 30000) {
    let cur = null;
    try { cur = await ev(`performance.timeOrigin`); } catch { /* 正在导航 */ }
    if (cur !== null && cur === last) {
      if (!stableSince) stableSince = Date.now();
      if (Date.now() - stableSince >= minStableMs) {
        const ready = await ev(`document.readyState === 'complete' && (() => { const v = document.getElementById('hr-ver'); return !!v && /^v\\d+$/.test(v.textContent.trim()); })()`).catch(() => false);
        if (ready) { await sleep(200); return true; }
      }
    } else {
      last = cur;
      stableSince = 0;
    }
    await sleep(200);
  }
  return false;
}

async function gotoApp() {
  for (let attempt = 0; attempt < 3; attempt++) {
    await sess.goto(srv.url + '/', 30000);
    await until(`document.readyState === 'complete' && !!document.querySelector('#home-refresh')`, 25000);
    if (await settlePage()) return true;
  }
  return false;
}

/** 点击强刷并等到「真的换了一页」。
 *  不能用「版本号变成 v127」判导航：旧页面本来就是 v127，条件立刻为真，
 *  后续断言会读到导航中途的页面，结论全乱。performance.timeOrigin 每次导航必变，
 *  用它判最干净。 */
async function clickAndWaitReload() {
  const t0 = await ev(`performance.timeOrigin`);
  await ev(`(() => { document.getElementById('hr-btn').click(); return 'ok'; })()`);
  const navved = await until(`performance.timeOrigin !== ${t0}`, 25000);
  if (!navved) return false;
  await until(`document.readyState === 'complete'`, 25000);
  await until(`(() => { const v = document.getElementById('hr-ver'); return !!v && /^v\\d+$/.test(v.textContent.trim()); })()`, 20000);
  await sleep(300);
  return true;
}


try {
  sess = await openPage({ chrome, profile });

  ok(await gotoApp(), '首页加载完成且版本号已渲染');

  // ---------------- A. 存在性与版本号 ----------------
  const info = await ev(`(() => {
    const box = document.getElementById('home-refresh');
    const btn = document.getElementById('hr-btn');
    const ver = document.getElementById('hr-ver');
    const home = document.getElementById('view-home');
    return {
      hasBox: !!box,
      hasBtn: !!btn,
      verText: ver ? ver.textContent.trim() : '',
      inHome: !!(box && home && home.contains(box)),
      homeActive: !!(home && home.classList.contains('active')),
      btnTag: btn ? btn.tagName : '',
      title: btn ? btn.getAttribute('title') : '',
    };
  })()`);

  if (process.env.QT_DEBUG) {
    console.log('[debug] info', info);
    console.log('[debug] direct fetch', await ev(`fetch('./sw.js',{cache:'no-store'}).then(r=>r.text()).then(t=>({ok:true,head:t.slice(0,60)})).catch(e=>({err:String(e)}))`));
    console.log('[debug] fallback src', await ev(`(()=>{const s=document.querySelector('script[type="module"][src*="?v="]'); return s? s.src : 'null';})()`));
    console.log('[debug] consoleErrors', sess.consoleErrors.slice(0,6));
    console.log('[debug] exceptions', sess.exceptions.slice(0,4));
  }
  ok(info.hasBox && info.hasBtn, '首页有版本号与刷新按钮');
  ok(info.inHome, '按钮在首页（#view-home）内部');
  ok(info.homeActive, '打开时首页就是当前视图');
  ok(/^v\d+$/.test(info.verText), '版本号已渲染且是 v+数字', info.verText);

  // 版本号必须与实际部署的 sw.js 一致——不一致就说明「显示的版本」是假的
  const swVer = await ev(`fetch('./sw.js', { cache: 'no-store' }).then(r => r.text()).then(t => { const m = t.match(/CACHE\\s*=\\s*['"]qintian-v(\\d+)['"]/); return m ? 'v' + m[1] : 'none'; })`);
  ok(info.verText === swVer, '版本号与 sw.js 的 CACHE 一致（不是写死的）', `显示 ${info.verText} / sw ${swVer}`);

  // ---------------- B. 位置：右下、低调 ----------------
  const pos = await ev(`(() => {
    const b = document.getElementById('home-refresh');
    const r = b.getBoundingClientRect();
    const cs = getComputedStyle(b);
    const tb = document.querySelector('.tabbar').getBoundingClientRect();
    const app = document.getElementById('app').getBoundingClientRect();
    return {
      right: innerWidth - r.right,
      appRight: innerWidth - app.right,
      bottom: innerHeight - r.bottom,
      tabbarTop: tb.top,
      boxBottom: r.bottom,
      opacity: Number(cs.opacity),
      fontSize: parseFloat(getComputedStyle(document.getElementById('hr-ver')).fontSize),
      w: r.width, h: r.height,
    };
  })()`);
  // 右侧对齐的是 #app 的内容边界（宽屏时 #app 居中，不能按屏幕边缘算），
  // 留 8–20px 内边距，既不贴边也不飘到内容区中间。
  const inset = pos.right - pos.appRight;
  ok(inset >= 6 && inset <= 22, '右侧对齐 #app 内容边界（内缩 6–22px）',
    `距屏幕右 ${pos.right.toFixed(0)}px / 距 #app 右 ${inset.toFixed(0)}px`);
  ok(pos.bottom > 0 && pos.bottom <= 140, '在右下方（距底 ≤140px）', `距底 ${pos.bottom.toFixed(0)}px`);
  ok(pos.boxBottom <= pos.tabbarTop + 2, '没有压在 tabbar 上', `按钮底 ${pos.boxBottom.toFixed(0)} / tabbar 顶 ${pos.tabbarTop.toFixed(0)}`);
  ok(pos.opacity < 0.6, '刻意低调（默认透明度 <0.6）', String(pos.opacity));
  ok(pos.fontSize <= 12, '版本号字号小于正文（≤12px）', `${pos.fontSize}px`);

  // ---------------- C. 只在首页出现 ----------------
  // 切换 tab 的监听是 main.js 里同步绑的，但首屏之后还有内容包异步加载，
  // 早期点击可能被吞。这里重试到真的切过去为止——既容忍初始化时序，
  // 又顺带验证「tab 绑定最终一定可用」。
  async function switchTo(view) {
    for (let i = 0; i < 30; i++) {
      await ev(`(() => { const t = document.querySelector('.tabbar .tab[data-view="${view}"]'); if (t) t.click(); return 'ok'; })()`);
      await sleep(150);
      const done = await ev(`document.getElementById('view-${view}').classList.contains('active')`);
      if (done) return true;
    }
    return false;
  }

  ok(await switchTo('classic'), '点观心 tab 能切走');
  const onClassic = await ev(`(() => {
    const box = document.getElementById('home-refresh');
    const r = box.getBoundingClientRect();
    return { w: r.width, h: r.height, active: document.getElementById('view-home').classList.contains('active'),
      shown: getComputedStyle(box).display };
  })()`);
  ok(!onClassic.active, '切走后首页不再是当前视图');
  ok(onClassic.w === 0 && onClassic.h === 0, '切到观心后按钮不渲染（不跟着串页）', `${onClassic.w}×${onClassic.h}`);

  ok(await switchTo('home'), '能切回首页');
  const backHome = await ev(`(() => { const r = document.getElementById('home-refresh').getBoundingClientRect(); return r.width > 0; })()`);
  ok(backHome, '切回首页后按钮重新出现');

  // ---------------- D. 预置真实用户数据 ----------------
  await ev(`(() => {
    localStorage.setItem('qintian.cfg.v1', JSON.stringify({ gender: '男', showShensha: false, showCangyao: true, lateZi: '23', apparentSolarTime: true }));
    localStorage.setItem('qintian.classic.journal', JSON.stringify({ 'LY-001': [{ text: '强刷前写下的一句话', at: 1730000000000 }] }));
    localStorage.setItem('qintian.classic.mark.v2', JSON.stringify({ 'LY-002': 'keep', 'LY-004': 'doubt' }));
    localStorage.setItem('qintian.classic.feed.v1', JSON.stringify({ round: 2, seq: 7, seen: ['LY-001', 'LY-002'] }));
    return 'ok';
  })()`);

  // 探针 cache：不在 ASSETS 里，SW 重装不会建回来。
  // 它消失 = 缓存确实被清了；它还在 = 强刷没清干净。
  const probeOk = await ev(`caches.open('qt-probe-cache').then(c => c.put('/__probe__', new Response('probe'))).then(() => true).catch(() => false)`);
  ok(probeOk === true, '已放入探针缓存（用于证明缓存被清）');

  const cacheBefore = await ev(`caches.keys().then(ks => ks.length)`);
  ok(cacheBefore >= 1, '点击前存在缓存', `${cacheBefore} 个`);

  // ---------------- E. 点击强刷 ----------------
  const clicked = await ev(`(() => { const b = document.getElementById('hr-btn'); const has = !!b; b && b.click(); return has ? 'ok' : 'no-btn'; })()`);
  ok(clicked === 'ok', '按钮可点击');

  // 等导航真的发生 + 新页面就绪
  const reloaded = await clickAndWaitReload();
  ok(reloaded, '强刷后页面确实重新加载（timeOrigin 已变）');

  // ---------------- F. 数据必须全在 ----------------
  const data = await ev(`(() => {
    const g = (k) => { try { return JSON.parse(localStorage.getItem(k) || 'null'); } catch { return 'BAD'; } };
    return {
      cfg: g('qintian.cfg.v1'),
      journal: g('qintian.classic.journal'),
      marks: g('qintian.classic.mark.v2'),
      feed: g('qintian.classic.feed.v1'),
    };
  })()`);

  ok(data.cfg && data.cfg.showShensha === false && data.cfg.apparentSolarTime === true, '出生/显示配置未被清除', JSON.stringify(data.cfg));
  ok(data.journal && data.journal['LY-001'] && data.journal['LY-001'][0].text === '强刷前写下的一句话', '手记未被清除', JSON.stringify(data.journal && Object.keys(data.journal || {})));
  ok(data.marks && data.marks['LY-002'] === 'keep' && data.marks['LY-004'] === 'doubt', '留下/存疑标记未被清除', JSON.stringify(data.marks));
  ok(data.feed && data.feed.round === 2 && data.feed.seq === 7, '遇见进度未被清除', JSON.stringify(data.feed));

  // ---------------- G. 缓存确实被清 ----------------
  const cacheState = await ev(`caches.keys().then(ks => ({ n: ks.length, keys: ks, probe: ks.includes('qt-probe-cache') }))`);
  ok(cacheState.probe === false, '探针缓存已消失（Cache Storage 确实被清）', JSON.stringify(cacheState.keys));

  // ---------------- H. 地址栏干净 ----------------
  const urlState = await ev(`(() => ({ href: location.href, hasBust: new URL(location.href).searchParams.has('_r') }))()`);
  ok(!urlState.hasBust, '强刷留下的 _r 参数已被清掉', urlState.href);

  // ---------------- I. 页面正常、无报错 ----------------
  const alive = await ev(`(() => {
    const home = document.getElementById('view-home');
    const sizhu = document.getElementById('home-sizhu');
    return {
      homeActive: !!(home && home.classList.contains('active')),
      sizhu: sizhu ? sizhu.textContent.trim() : '',
      ver: document.getElementById('hr-ver').textContent.trim(),
      btnEnabled: !document.getElementById('hr-btn').disabled,
    };
  })()`);
  ok(alive.homeActive, '强刷后仍停在首页');
  ok(alive.sizhu.length > 0, '强刷后首页正常渲染（不是白屏）', alive.sizhu);
  ok(/^v\d+$/.test(alive.ver), '强刷后版本号重新渲染', alive.ver);
  ok(alive.btnEnabled, '刷新后按钮恢复可用（不是永久禁用）');

  const realErrors = [...sess.consoleErrors, ...sess.exceptions.map((e) => e.text)]
    .filter((t) => !/favicon|Failed to load resource.*404/i.test(t));
  ok(realErrors.length === 0, '无 console error', realErrors.slice(0, 3).join(' | '));

  // ---------------- J. 二次强刷仍然可用 ----------------
  const probe2 = await ev(`caches.open('qt-probe-cache').then(c => c.put('/__probe__', new Response('p'))).then(() => true).catch(() => false)`);
  ok(probe2 === true, '再次放入探针缓存');
  const reloaded2 = await clickAndWaitReload();
  ok(reloaded2, '第二次强刷同样完成');
  const cache2 = await ev(`caches.keys().then(ks => ks.includes('qt-probe-cache'))`);
  ok(cache2 === false, '第二次强刷同样清掉了缓存');
  const data2 = await ev(`(() => { try { return JSON.parse(localStorage.getItem('qintian.classic.journal') || 'null'); } catch { return null; } })()`);
  ok(data2 && data2['LY-001'], '第二次强刷后手记仍在');

} catch (e) {
  fails.push('执行异常：' + (e && e.message ? e.message : String(e)));
} finally {
  try { await sess?.close(); } catch { /* ignore */ }
  try { await srv.close(); } catch { /* ignore */ }
  if (!has('--keep-profile')) { try { fs.rmSync(profile, { recursive: true, force: true }); } catch { /* ignore */ } }
}

console.log('');
if (fails.length) {
  console.error(`[test-force-refresh-ui] 通过 ${pass.length} 项，失败 ${fails.length} 项：`);
  for (const f of fails) console.error('  ✗ ' + f);
  process.exit(1);
}
console.log(`[test-force-refresh-ui] 全部通过（${pass.length} 项）`);
