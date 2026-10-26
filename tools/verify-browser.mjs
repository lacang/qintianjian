#!/usr/bin/env node
/**
 * 钦天监 · 真实浏览器模块图启动验证（P0 门禁）
 *
 * 用法: node tools/verify-browser.mjs [--root <仓库根>] [--expect-version NN] [--json] [--keep-profile] [--timeout 秒]
 *
 * 为什么需要它
 * ------------
 * 静态检查（语法 + import 图）只能证明"看起来对"。v121 的教训是：真正决定应用能不能用的，
 * 是**真实浏览器能不能把整个模块图加载并执行起来**——语法对、导出名对，仍可能因为运行时
 * 依赖、MIME、路径大小写、SW 抢缓存等原因在浏览器里失败。
 * 所以发版前必须用真实浏览器加载一次关键页面，确认"JS 真的跑起来了"。
 *
 * 做四件事：
 *   A. 起本地静态服务托管 app/（MIME 与线上一致）
 *   B. 无头 Chrome 加载首页，dump DOM + 收 stderr 日志
 *   C. 断言：main.js 真的执行（首页四柱/卦名被 JS 写入）、无未捕获异常、无模块加载失败、无 404
 *   D. 断言：index.html 的 ?v=NN 与 sw.js 的 CACHE=qintian-vNN 一致（可选与 --expect-version 对齐）
 * 任一不过 exit 1。缺浏览器时 exit 3（环境不具备，非代码问题）。
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { startStaticServer } from './lib/static-server.mjs';
import { findChrome, runChrome, innerTextOf, readAppVersions, scanBrowserLogs, parseArgs } from './lib/browser.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const { opt, has } = parseArgs(process.argv.slice(2));
const ROOT = path.resolve(opt('--root', path.join(HERE, '..')));
const APP = path.join(ROOT, 'app');
const EXPECT = opt('--expect-version', null);
const AS_JSON = has('--json');
const KEEP = has('--keep-profile');
const TIMEOUT_MS = Number(opt('--timeout', '120')) * 1000;

const findings = [];
const notes = [];
const addFail = (code, detail) => findings.push({ code, detail });

// ---------- A. 静态服务 ----------
const srv = await startStaticServer(APP);
const chrome = findChrome();
if (!chrome) {
  console.error('[verify-browser] 找不到 Chrome/Chromium（可用 QT_CHROME=<路径> 指定）。无法执行浏览器门禁。');
  await srv.close();
  process.exit(3);
}

// ---------- B. 真实浏览器加载 ----------
const profile = KEEP ? path.join(os.tmpdir(), 'qt-verify-profile') : fs.mkdtempSync(path.join(os.tmpdir(), 'qt-verify-'));
let res = await runChrome({ chrome, url: srv.url + '/', profile, timeoutMs: TIMEOUT_MS, tag: 'verify-browser' });
if (!res.stdout && !res.timedOut) {
  res = await runChrome({ chrome, url: srv.url + '/', profile, timeoutMs: TIMEOUT_MS, headlessFlag: '--headless=new', tag: 'verify-browser' });
}
const dom = res.stdout || '';
const logs = res.stderr || '';

if (!dom || dom.length < 2000) {
  addFail('no-dom', `Chrome 未产出可用 DOM（exit=${res.status}${res.timedOut ? ', 超时被强杀' : ''}, domLen=${dom.length}）。` +
    (res.timedOut ? `Chrome 在 ${TIMEOUT_MS / 1000}s 内没有退出。` : '') +
    `\nstderr 摘要：\n${logs.split('\n').slice(-12).join('\n')}`);
}

// ---------- C. JS 真的执行了吗 ----------
if (dom) {
  const sizhu = innerTextOf(dom, 'home-sizhu');
  const guaTitle = innerTextOf(dom, 'now-gua-title');
  if (!sizhu) addFail('js-not-executed', '首页 #home-sizhu 为空 → main.js 没跑起来（模块图很可能没加载成功）');
  if (!guaTitle) addFail('home-not-rendered', '首页 #now-gua-title 为空 → 首页渲染函数未执行');
  const skel = (dom.match(/qt-skeleton/g) || []).length;
  notes.push(`DOM ${dom.length}B；#home-sizhu="${sizhu || ''}"；#now-gua-title="${guaTitle || ''}"；剩余骨架占位 ${skel} 个；耗时 ${res.ms}ms`);
  if (skel > 0) notes.push(`仍有 ${skel} 个 qt-skeleton（异步区块未完成，仅提示不阻断）`);
}

// ---------- C2. 日志里的硬错误 ----------
const { findings: logFindings, warnCount } = scanBrowserLogs(logs);
findings.push(...logFindings);
if (warnCount) notes.push(`console.warn ×${warnCount}（不阻断）`);

// ---------- C3. 静态服务侧 404 ----------
// favicon.ico 是浏览器自动发起的，站点本来就没放，不计入失败。
const realNotFound = srv.stats.notFound.filter((p) => !/^\/favicon\.ico$/i.test(p));
if (realNotFound.length) {
  addFail('http-404', `静态服务返回 404 的路径 ×${realNotFound.length}：` + realNotFound.slice(0, 10).join(', '));
}
if (realNotFound.length !== srv.stats.notFound.length) notes.push('favicon.ico 404（浏览器自动请求，站点未提供，忽略）');

// ---------- D. 版本一致性 ----------
const { idxVersions, swVersion } = readAppVersions(APP);
if (idxVersions.length !== 1) addFail('version-mixed', `index.html 里出现 ${idxVersions.length} 种 ?v= 版本号：${idxVersions.join(', ')}`);
if (!swVersion) addFail('version-sw', 'sw.js 里找不到 qintian-vNN');
if (idxVersions.length === 1 && swVersion && idxVersions[0] !== swVersion) addFail('version-mismatch', `index.html ?v=${idxVersions[0]} 与 sw.js CACHE=qintian-v${swVersion} 不一致`);
if (EXPECT && idxVersions.length === 1 && idxVersions[0] !== String(EXPECT)) addFail('version-unexpected', `期望 v${EXPECT}，实际 index.html ?v=${idxVersions[0]} / sw.js qintian-v${swVersion}`);

await srv.close();
if (!KEEP) fs.rmSync(profile, { recursive: true, force: true });

const summary = {
  root: ROOT, chrome, url: srv.url, domLen: dom.length, servedFiles: srv.stats.served,
  version: idxVersions.length === 1 ? idxVersions[0] : null, swVersion,
  notes, failures: findings, ok: findings.length === 0,
};

if (AS_JSON) {
  console.log(JSON.stringify(summary, null, 2));
} else if (findings.length === 0) {
  console.log(`[verify-browser] 真实浏览器启动通过（v${summary.version}，${res.ms}ms）`);
  for (const n of notes) console.log('  · ' + n);
  console.log('[verify-browser] PASS');
} else {
  console.error(`\n========== 浏览器启动门禁未通过（${findings.length} 项）==========`);
  for (const f of findings) console.error(`[FAIL:${f.code}] ${f.detail}`);
  for (const n of notes) console.error('  · ' + n);
  process.exit(1);
}
