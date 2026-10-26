/**
 * 钦天监 · 无头浏览器门禁共享库
 *
 * 供 tools/verify-browser.mjs（启动验证）与 tools/verify-offline.mjs（离线验证）复用。
 *
 * 两个必须记住的坑（都踩过）：
 *  1. **必须用异步 spawn，不能用 spawnSync**。spawnSync 会阻塞 Node 事件循环，而同进程的
 *     静态服务就没机会响应浏览器请求，表现为"Chrome 卡 120s 不退出、DOM 为空"。
 *  2. **不要用 --virtual-time-budget 之外的等待手段**；`--timeout=N` 在本机 Chrome 上不被识别。
 *     需要"等异步区块跑完"时用 --virtual-time-budget（虚拟时间快进，不真的等 N 秒）。
 */
import fs from 'node:fs';
import path from 'node:path';
import { spawn, spawnSync } from 'node:child_process';

export function findChrome() {
  const cands = [process.env.QT_CHROME, 'google-chrome', 'google-chrome-stable', 'chromium', 'chromium-browser', '/usr/bin/google-chrome'].filter(Boolean);
  for (const c of cands) {
    const r = spawnSync('bash', ['-lc', `command -v ${JSON.stringify(c)}`], { encoding: 'utf8' });
    if (r.status === 0 && r.stdout.trim()) return r.stdout.trim();
  }
  return null;
}

const BASE_ARGS = [
  '--no-sandbox', '--disable-gpu', '--disable-dev-shm-usage', '--no-proxy-server',
  '--no-first-run', '--no-default-browser-check', '--disable-extensions',
  '--disable-background-networking', '--hide-scrollbars', '--mute-audio',
  '--enable-logging=stderr', '--log-level=0', '--window-size=1280,900',
];

/**
 * 跑一次无头 Chrome，dump DOM 并回收 stderr 日志。
 * @returns {Promise<{status:number, stdout:string, stderr:string, timedOut:boolean, ms:number}>}
 */
export function runChrome({ chrome, url, profile, args = [], timeoutMs = 120000, headlessFlag = '--headless', tag = 'browser' }) {
  const full = [headlessFlag, ...BASE_ARGS, '--user-data-dir=' + profile, '--dump-dom', ...args, url];
  const t0 = Date.now();
  return new Promise((resolve) => {
    const child = spawn(chrome, full, { stdio: ['ignore', 'pipe', 'pipe'] });
    let out = '', err = '', timedOut = false, settled = false;
    const finish = (status, extra = '') => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      resolve({ status, stdout: out, stderr: err + extra, timedOut, ms: Date.now() - t0 });
    };
    const timer = setTimeout(() => {
      timedOut = true;
      try { child.kill('SIGKILL'); } catch { /* ignore */ }
      setTimeout(() => finish(-1, `\n[${tag}] Chrome 超过 ${timeoutMs / 1000}s 未退出，已强杀。`), 1500);
    }, timeoutMs);
    child.stdout.on('data', (d) => { out += d; });
    child.stderr.on('data', (d) => { err += d; });
    child.on('error', (e) => finish(-1, `\n[${tag}] 无法启动 Chrome: ${e.message}`));
    child.on('close', (code) => finish(code === null ? -1 : code));
  });
}

/** 取某个 id 元素的可见文本（去标签、压空白）；找不到返回 null。 */
export function innerTextOf(html, id) {
  const re = new RegExp(`<([a-zA-Z0-9-]+)[^>]*id=["']${id}["'][^>]*>([\\s\\S]*?)</\\1>`);
  const m = html.match(re);
  if (!m) return null;
  return m[2].replace(/<[^>]*>/g, '').replace(/\s+/g, ' ').trim();
}

/** 从 app/index.html 与 app/sw.js 读出资源版本号，用于一致性断言。 */
export function readAppVersions(appDir) {
  const idx = fs.readFileSync(path.join(appDir, 'index.html'), 'utf8');
  const sw = fs.readFileSync(path.join(appDir, 'sw.js'), 'utf8');
  const idxVersions = [...new Set([...idx.matchAll(/\?v=(\d+)/g)].map((m) => m[1]))];
  const swVersion = (sw.match(/qintian-v(\d+)/) || [])[1] || null;
  return { idxVersions, swVersion };
}

/** 浏览器日志里的硬错误扫描（无头 Chrome 会把 console 与网络错误打到 stderr）。 */
export function scanBrowserLogs(logs) {
  const findings = [];
  const keep = (l) => !/favicon/i.test(l);
  const grab = (re) => (logs.match(new RegExp(re.source, re.flags.includes('m') ? re.flags : re.flags + 'm')) || []).filter(keep);
  const rules = [
    [/Uncaught/, '未捕获异常'],
    [/Failed to load module script/, '模块脚本加载失败'],
    [/SyntaxError/, 'SyntaxError'],
    [/net::ERR_/, '网络层请求失败'],
    [/Failed to load resource[^\n]*(404|500|403)/, '资源加载失败(4xx/5xx)'],
  ];
  for (const [re, label] of rules) {
    const hit = grab(re);
    if (hit.length) findings.push({ code: 'console-' + label, detail: `${label} ×${hit.length}：\n` + hit.slice(0, 6).map((s) => '  ' + s.trim()).join('\n') });
  }
  const consoleErrors = grab(/:ERROR:CONSOLE/);
  if (consoleErrors.length) findings.push({ code: 'console-error', detail: `浏览器 console.error ×${consoleErrors.length}：\n` + consoleErrors.slice(0, 8).map((s) => '  ' + s.trim()).join('\n') });
  const warns = grab(/:WARNING:CONSOLE/);
  return { findings, warnCount: warns.length };
}

/** 通用参数解析：--key value / --flag */
export function parseArgs(argv) {
  const opt = (name, dflt = null) => {
    const i = argv.indexOf(name);
    return i >= 0 && argv[i + 1] ? argv[i + 1] : dflt;
  };
  return { opt, has: (f) => argv.includes(f) };
}
