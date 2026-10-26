#!/usr/bin/env node
/**
 * 钦天监 · Service Worker 离线可用性门禁（P1）
 *
 * 用法: node tools/verify-offline.mjs [--root <仓库根>] [--expect-version NN] [--json] [--timeout 秒]
 *
 * 为什么需要它
 * ------------
 * 钦天监是纯本地 PWA，主人真正依赖它的场景恰恰是"没网也能看盘"。HTTP 200 只证明资源能被请求，
 * 完全不证明离线缓存可用。
 *
 * ⚠️ 这里有个必须绕开的陷阱（本项目踩过）：用 `--dump-dom` 跑两次、第二次把服务器停掉，
 * 页面照样能打开——但那次成功是**浏览器 HTTP 磁盘缓存**的功劳，不是 Service Worker 的。
 * 把 HTTP 缓存的功劳记到 SW 头上，就是典型的假证据。
 *
 * 所以本门禁通过 CDP 驱动，做四件 dump-dom 做不到的事：
 *   1) 等 `navigator.serviceWorker.ready`，数 `caches.open(CACHE).keys()` 是否等于 sw.js 里 ASSETS 的条数
 *      （这同时验证了"预缓存清单里的每个文件都真实存在"——addAll 是 all-or-nothing）；
 *   2) 确认页面被 SW 接管（navigator.serviceWorker.controller 非空）；
 *   3) **优雅关闭**浏览器，让 CacheStorage 真正落盘；
 *   4) 断网（静态服务对任何请求直接掐 socket，使 fetch reject）后同 profile 再开一次，
 *      两阶段都加 --disk-cache-size=1 压掉 HTTP 磁盘缓存，让"离线能打开"只能归因于 SW。
 * 任一不过 exit 1。缺浏览器时 exit 3。
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { startStaticServer } from './lib/static-server.mjs';
import { findChrome, readAppVersions, parseArgs } from './lib/browser.mjs';
import { openPage } from './lib/cdp.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const { opt, has } = parseArgs(process.argv.slice(2));
const ROOT = path.resolve(opt('--root', path.join(HERE, '..')));
const APP = path.join(ROOT, 'app');
const EXPECT = opt('--expect-version', null);
const AS_JSON = has('--json');
const KEEP = has('--keep-profile');

const findings = [];
const notes = [];
const addFail = (code, detail) => findings.push({ code, detail });

/** 从 sw.js 的 ASSETS 数组里解析出预缓存清单（相对路径集合）。 */
function readSwAssets(appDir) {
  const src = fs.readFileSync(path.join(appDir, 'sw.js'), 'utf8');
  const block = src.match(/const\s+ASSETS\s*=\s*\[([\s\S]*?)\];/);
  if (!block) return null;
  const list = [...block[1].matchAll(/['"]\.\/([^'"]*)['"]/g)].map((m) => m[1]).filter((p) => p && !p.startsWith('http'));
  return [...new Set(list)];
}

/** 页面里关键区块有内容 = 首屏真的渲染出来了。 */
const KEY_IDS = ['home-sizhu', 'now-gua-title', 'clock-time', 'home-nongli'];
/** 注意：比较缓存条目必须带 query（?v=121），否则会把"已缓存"误判成"缺失"。 */
const PROBE_KEYS = `(async () => {
  const reg = await navigator.serviceWorker.getRegistration();
  let keys = -1, list = [];
  try {
    const c = await caches.open(CACHE_NAME);
    const rs = await c.keys();
    keys = rs.length;
    list = rs.map((r) => { const u = new URL(r.url); return u.pathname.replace(/^\\//, '') + u.search; });
  } catch (e) { list = ['<open 失败: ' + e.message + '>']; }
  return JSON.stringify({ hasReg: !!reg, active: !!(reg && reg.active), controller: !!navigator.serviceWorker.controller, keys, list });
})()`;
const PROBE_RENDERED = `JSON.stringify(${JSON.stringify(KEY_IDS)}.map((id) => { const el = document.getElementById(id); return el ? (el.textContent || '').trim() : ''; }))`;

/**
 * 等到关键区块真的有内容再取 DOM。
 * 必须等：main.js 监听 SW 的 controllerchange 后会 location.reload()，
 * 抢在 reload 中间读 DOM 会读到"HTML 已解析、脚本还没跑"的半成品（本项目踩过）。
 */
async function waitRendered(page, timeoutMs = 20000) {
  return page.waitFor(PROBE_RENDERED, (v) => {
    try { const a = JSON.parse(v); return Array.isArray(a) && a.every((t) => t && t.length > 0); } catch { return false; }
  }, timeoutMs);
}

function assertPageRendered(tag, dom, exceptions, consoleErrors, loadFailed) {
  const title = (dom.match(/<title>([^<]*)<\/title>/) || [])[1] || '';
  if (!/钦天监/.test(title)) addFail(`${tag}-title`, `${tag} 阶段页面标题不是钦天监（"${title}"）→ 很可能是浏览器错误页`);
  for (const id of KEY_IDS) {
    const re = new RegExp(`<([a-zA-Z0-9-]+)[^>]*id=["']${id}["'][^>]*>([\\s\\S]*?)</\\1>`);
    const m = dom.match(re);
    const txt = m ? m[2].replace(/<[^>]*>/g, '').replace(/\s+/g, ' ').trim() : '';
    if (!txt) addFail(`${tag}-empty-${id}`, `${tag} 阶段关键区块 #${id} 为空 → 该阶段页面没渲染出来`);
  }
  if (exceptions.length) {
    addFail(`${tag}-uncaught`, `${tag} 阶段有未捕获异常 ×${exceptions.length}：\n` + exceptions.slice(0, 5).map((e) => `  ${e.text}${e.url ? ' @' + e.url + ':' + (e.line + 1) : ''}`).join('\n'));
  }
  const hardErrors = consoleErrors.filter((t) => !/favicon/i.test(t));
  if (hardErrors.length) {
    addFail(`${tag}-console-error`, `${tag} 阶段 console.error ×${hardErrors.length}：\n` + hardErrors.slice(0, 6).map((t) => '  ' + t).join('\n'));
  }
  const hardFailed = loadFailed.filter((t) => !/favicon/i.test(t));
  if (hardFailed.length) {
    addFail(`${tag}-load-failed`, `${tag} 阶段资源加载失败 ×${hardFailed.length}：` + hardFailed.slice(0, 8).join('; '));
  }
  return title;
}

// ---------- 准备 ----------
const { idxVersions, swVersion } = readAppVersions(APP);
const assets = readSwAssets(APP);
if (!assets) {
  console.error('[verify-offline] 无法从 app/sw.js 解析 ASSETS 清单，门禁无法运行。');
  process.exit(1);
}
if (EXPECT && idxVersions.length === 1 && idxVersions[0] !== String(EXPECT)) {
  addFail('version-unexpected', `期望 v${EXPECT}，实际 index.html ?v=${idxVersions[0]} / sw.js qintian-v${swVersion}`);
}
const CACHE_NAME = `qintian-v${swVersion}`;
const offlineFile = path.join(os.tmpdir(), `qt-offline-${process.pid}-${Date.now()}.flag`);
fs.rmSync(offlineFile, { force: true });
const srv = await startStaticServer(APP, { offlineFile });
const chrome = findChrome();
if (!chrome) {
  console.error('[verify-offline] 找不到 Chrome/Chromium（可用 QT_CHROME=<路径> 指定）。无法执行离线门禁。');
  await srv.close();
  process.exit(3);
}
const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'qt-offline-'));
const chromeArgs = ['--disk-cache-size=1'];
let page = null;

try {
  // ================= 阶段 1：在线预热，把整套资源缓存进 SW =================
  page = await openPage({ chrome, profile, extraArgs: chromeArgs, tag: 'offline-online' });
  await page.goto(srv.url + '/');

  const ready = await page.waitFor(PROBE_KEYS.replace('CACHE_NAME', JSON.stringify(CACHE_NAME)), (v) => {
    if (!v) return false;
    try { const o = JSON.parse(v); return o.keys >= assets.length; } catch { return false; }
  }, 30000);

  let probe = null;
  try { probe = JSON.parse(ready.value); } catch { /* ignore */ }
  if (!probe) {
    addFail('sw-probe-failed', `在线阶段无法读取 Service Worker 状态：${ready.value}`);
  } else {
    if (!probe.hasReg || !probe.active) addFail('sw-not-active', `在线阶段 SW 未激活（hasReg=${probe.hasReg}, active=${probe.active}）`);
    if (!probe.controller) addFail('sw-not-controlling', '在线阶段页面未被 SW 接管（navigator.serviceWorker.controller 为空）');
    const have = new Set(probe.list || []);
    const missing = assets.filter((p) => !have.has(p));
    if (missing.length) {
      addFail('precache-missing',
        `SW 预缓存清单里 ${missing.length} 项没进缓存（缓存共 ${probe.keys} 项 / sw.js ASSETS ${assets.length} 项）。` +
        `addAll 是 all-or-nothing，缺一个整批失败，离线必然缺资源。\n  缺失：${missing.slice(0, 12).join(', ')}${missing.length > 12 ? ` …共 ${missing.length} 个` : ''}`);
    }
    notes.push(`在线预热：SW active=${probe.active} / controller=${probe.controller} / 缓存 ${probe.keys} 项，ASSETS ${assets.length} 项全命中=${missing.length === 0}，等待 ${ready.ms}ms`);
  }

  const rendered1 = await waitRendered(page);
  const dom1 = await page.dom();
  assertPageRendered('online', dom1, page.exceptions, page.consoleErrors, page.loadFailed);
  if (!rendered1.ok) notes.push(`在线阶段关键区块等待超时（${rendered1.ms}ms）：${rendered1.value}`);
  notes.push(`在线首屏：DOM ${dom1.length}B，服务端送出 ${srv.stats.served} 个文件`);
  await page.close();   // 优雅关闭，让 CacheStorage 落盘
  page = null;

  // ================= 阶段 2：断网后再打开 =================
  fs.writeFileSync(offlineFile, 'offline');
  const servedBefore = srv.stats.served;

  page = await openPage({ chrome, profile, extraArgs: chromeArgs, tag: 'offline-offline' });
  await page.goto(srv.url + '/');
  const rendered2 = await waitRendered(page);
  const dom2 = await page.dom();
  assertPageRendered('offline', dom2, page.exceptions, page.consoleErrors, page.loadFailed);
  if (!rendered2.ok) notes.push(`断网阶段关键区块等待超时（${rendered2.ms}ms）：${rendered2.value}`);

  const servedOffline = srv.stats.served - servedBefore;
  if (servedOffline > 0) {
    addFail('offline-served', `断网阶段服务端仍成功送出 ${servedOffline} 个文件 → 断网没生效，本次离线结论不成立`);
  }
  const ctl = await page.evaluate('JSON.stringify({ controller: !!navigator.serviceWorker.controller, title: document.title })');
  let ctlInfo = {};
  try { ctlInfo = JSON.parse(ctl.value || '{}'); } catch { /* ignore */ }
  if (!ctlInfo.controller) addFail('offline-not-controlled', '断网阶段页面未被 SW 接管 → 这次"离线能打开"不是 SW 缓存提供的');
  notes.push(`断网阶段：请求 ${srv.stats.offlineDropped} 次全部被掐断、服务端送出 ${servedOffline} 个文件（应为 0）；controller=${!!ctlInfo.controller}`);
  const sizhu = (dom2.match(/id="home-sizhu"[^>]*>([\s\S]*?)<\//) || [])[1] || '';
  notes.push(`离线首屏：DOM ${dom2.length}B，#home-sizhu="${sizhu.replace(/<[^>]*>/g, '').trim()}"`);
} catch (e) {
  addFail('exception', `离线门禁执行异常：${e && e.message ? e.message : e}`);
} finally {
  if (page) { try { await page.close(); } catch { /* ignore */ } }
  fs.rmSync(offlineFile, { force: true });
  await srv.close();
  if (!KEEP) fs.rmSync(profile, { recursive: true, force: true });
}

const summary = {
  root: ROOT, chrome, version: idxVersions.length === 1 ? idxVersions[0] : null,
  swVersion, swAssets: assets.length, notes, failures: findings, ok: findings.length === 0,
};

if (AS_JSON) {
  console.log(JSON.stringify(summary, null, 2));
} else if (findings.length === 0) {
  console.log(`[verify-offline] Service Worker 离线可用性通过（v${summary.version}，预缓存 ${assets.length} 项）`);
  for (const n of notes) console.log('  · ' + n);
  console.log('[verify-offline] PASS');
} else {
  console.error(`\n========== 离线门禁未通过（${findings.length} 项）==========`);
  for (const f of findings) console.error(`[FAIL:${f.code}] ${f.detail}`);
  for (const n of notes) console.error('  · ' + n);
  process.exit(1);
}
