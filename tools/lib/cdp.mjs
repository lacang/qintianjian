/**
 * 钦天监 · 极简 CDP 客户端（零依赖）
 *
 * 为什么需要它
 * ------------
 * `--dump-dom` 只能拿到"load 事件那一刻"的 DOM，浏览器随即退出。这对 Service Worker 场景是致命的：
 *  · 无法等待 SW 完成 install / 预缓存（dump 完就退，CacheStorage 里连 blob 都没落盘）；
 *  · 无法区分"离线能打开"到底是 SW 缓存还是浏览器 HTTP 磁盘缓存——这两者会被混为一谈，
 *    等于把 HTTP 缓存的功劳记到 SW 头上（正是"假证据"）。
 * 所以离线门禁必须能：等 SW ready → 数缓存条目 → 优雅关闭（让缓存落盘）→ 断网 → 再开一次。
 * 这些只有通过 DevTools 协议（CDP）才能做到。
 *
 * 实现说明：Node 22 自带全局 WebSocket（undici），因此不需要任何 npm 依赖。
 * 直接连到 page target 的 ws 端点（不经 browser 端点 + sessionId），少一层转发。
 */
import http from 'node:http';
import { spawn } from 'node:child_process';

const LAUNCH_ARGS = [
  '--headless', '--no-sandbox', '--disable-gpu', '--disable-dev-shm-usage',
  '--no-proxy-server', '--no-first-run', '--no-default-browser-check',
  '--disable-extensions', '--hide-scrollbars', '--mute-audio',
  '--remote-debugging-port=0', '--remote-allow-origins=*',
];

function httpJson(port, urlPath, timeoutMs = 8000) {
  return new Promise((resolve, reject) => {
    const req = http.get({ host: '127.0.0.1', port, path: urlPath, timeout: timeoutMs }, (res) => {
      let body = '';
      res.on('data', (d) => { body += d; });
      res.on('end', () => {
        try { resolve(JSON.parse(body)); } catch (e) { reject(new Error(`DevTools HTTP ${urlPath} 返回非 JSON: ${body.slice(0, 200)}`)); }
      });
    });
    req.on('timeout', () => { req.destroy(new Error('DevTools HTTP 超时')); });
    req.on('error', reject);
  });
}

/** 启动一个带调试端口的 Chrome，返回 { child, port, stderrTail, close }。 */
export function launchChromeCdp({ chrome, profile, extraArgs = [], startUrl = 'about:blank', readyTimeoutMs = 30000 }) {
  return new Promise((resolve, reject) => {
    const child = spawn(chrome, [...LAUNCH_ARGS, '--user-data-dir=' + profile, ...extraArgs, startUrl], { stdio: ['ignore', 'pipe', 'pipe'] });
    let err = '', settled = false;
    const timer = setTimeout(() => {
      if (settled) return;
      settled = true;
      try { child.kill('SIGKILL'); } catch { /* ignore */ }
      reject(new Error(`Chrome 未在 ${readyTimeoutMs / 1000}s 内输出 DevTools 端点。stderr 尾部：\n${err.slice(-800)}`));
    }, readyTimeoutMs);
    child.stderr.on('data', (d) => {
      err += d;
      const m = /DevTools listening on (ws:\/\/[^\s]+)/.exec(err);
      if (m && !settled) {
        settled = true;
        clearTimeout(timer);
        const port = Number(new URL(m[1]).port);
        resolve({
          child,
          port,
          stderrTail: () => err.slice(-4000),
          /** 优雅关闭：等进程自己退出（缓存才会落盘）；超时才强杀。 */
          close: (graceMs = 8000) => new Promise((res) => {
            if (child.exitCode !== null || child.signalCode) return res();
            const t = setTimeout(() => { try { child.kill('SIGKILL'); } catch { /* ignore */ } }, graceMs);
            child.once('close', () => { clearTimeout(t); res(); });
            try { child.kill('SIGTERM'); } catch { /* ignore */ }
          }),
        });
      }
    });
    child.on('error', (e) => { if (!settled) { settled = true; clearTimeout(timer); reject(e); } });
  });
}

/** 极简 CDP 会话。 */
export class CDP {
  constructor(ws) {
    this.ws = ws;
    this.seq = 0;
    this.pending = new Map();
    this.handlers = new Map();
    ws.addEventListener('message', (ev) => {
      let msg;
      try { msg = JSON.parse(typeof ev.data === 'string' ? ev.data : String(ev.data)); } catch { return; }
      if (msg.id && this.pending.has(msg.id)) {
        const { resolve, reject } = this.pending.get(msg.id);
        this.pending.delete(msg.id);
        if (msg.error) reject(new Error(`${msg.error.message || 'CDP 错误'} (${JSON.stringify(msg.error)})`));
        else resolve(msg.result);
        return;
      }
      if (msg.method) {
        const list = this.handlers.get(msg.method) || [];
        for (const fn of list) { try { fn(msg.params || {}); } catch { /* ignore */ } }
        const any = this.handlers.get('*') || [];
        for (const fn of any) { try { fn(msg); } catch { /* ignore */ } }
      }
    });
  }

  static async connect(wsUrl, timeoutMs = 10000) {
    const ws = new WebSocket(wsUrl);
    await new Promise((resolve, reject) => {
      const t = setTimeout(() => reject(new Error('WebSocket 连接 CDP 超时')), timeoutMs);
      ws.addEventListener('open', () => { clearTimeout(t); resolve(); }, { once: true });
      ws.addEventListener('error', (e) => { clearTimeout(t); reject(new Error('WebSocket 连接 CDP 失败: ' + (e.message || 'error'))); }, { once: true });
    });
    return new CDP(ws);
  }

  send(method, params = {}, timeoutMs = 30000) {
    const id = ++this.seq;
    return new Promise((resolve, reject) => {
      const t = setTimeout(() => { this.pending.delete(id); reject(new Error(`CDP ${method} 超时`)); }, timeoutMs);
      this.pending.set(id, { resolve: (r) => { clearTimeout(t); resolve(r); }, reject: (e) => { clearTimeout(t); reject(e); } });
      try { this.ws.send(JSON.stringify({ id, method, params })); } catch (e) { clearTimeout(t); this.pending.delete(id); reject(e); }
    });
  }

  on(method, fn) {
    if (!this.handlers.has(method)) this.handlers.set(method, []);
    this.handlers.get(method).push(fn);
  }

  close() { try { this.ws.close(); } catch { /* ignore */ } }
}

/**
 * 打开一个"可编程页面"：连上 page target，开启 Runtime/Page/Log/Network，
 * 并把未捕获异常、console.error、加载失败都收集到数组里。
 */
export async function openPage({ chrome, profile, extraArgs = [], tag = 'cdp' }) {
  const browser = await launchChromeCdp({ chrome, profile, extraArgs, startUrl: 'about:blank' });
  const list = await httpJson(browser.port, '/json/list');
  const page = (list || []).find((t) => t.type === 'page');
  if (!page || !page.webSocketDebuggerUrl) {
    await browser.close();
    throw new Error('CDP /json/list 里没有 page target');
  }
  const cdp = await CDP.connect(page.webSocketDebuggerUrl);
  const exceptions = [];
  const consoleErrors = [];
  const loadFailed = [];
  const reqUrls = new Map();
  cdp.on('Runtime.exceptionThrown', (p) => {
    const d = p.exceptionDetails || {};
    const text = (d.exception && (d.exception.description || d.exception.value)) || d.text || 'unknown';
    exceptions.push({ text: String(text).split('\n')[0], url: d.url || '', line: d.lineNumber });
  });
  cdp.on('Runtime.consoleAPICalled', (p) => {
    if (p.type === 'error') consoleErrors.push((p.args || []).map((a) => a.value ?? a.description ?? a.type).join(' '));
  });
  cdp.on('Log.entryAdded', (p) => {
    const e = p.entry || {};
    if (e.level === 'error' && !/favicon/i.test(e.text || '')) consoleErrors.push(`[${e.source}] ${e.text}${e.url ? ' @' + e.url : ''}`);
  });
  cdp.on('Network.requestWillBeSent', (p) => { if (p.requestId && p.request) reqUrls.set(p.requestId, p.request.url); });
  cdp.on('Network.loadingFailed', (p) => {
    if (p.type === 'Document' || p.type === 'Script' || p.type === 'Stylesheet' || p.type === 'Fetch' || p.type === 'XHR') {
      const u = reqUrls.get(p.requestId) || '(未知 URL)';
      loadFailed.push(`${p.type} ${p.errorText} → ${u}${p.blockedReason ? ' (' + p.blockedReason + ')' : ''}`);
    }
  });
  await cdp.send('Runtime.enable');
  await cdp.send('Page.enable');
  await cdp.send('Log.enable');
  await cdp.send('Network.enable');

  const session = {
    cdp, browser, exceptions, consoleErrors, loadFailed, tag,
    /**
     * 导航并等待页面真正稳定。
     * 注意：本项目 main.js 监听 SW 的 controllerchange 后会 location.reload()，
     * 于是"一次导航"实际会发生两次加载；期间 execution context 被销毁，
     * 此刻发 Runtime.evaluate 会报 "Inspected target navigated or closed"。
     * 所以 load 事件之后还要等一次"能连续读到 complete"的稳定窗口。
     */
    async goto(url, waitMs = 20000) {
      let loaded = false;
      cdp.on('Page.loadEventFired', () => { loaded = true; });
      await cdp.send('Page.navigate', { url });
      const t0 = Date.now();
      while (!loaded && Date.now() - t0 < waitMs) await new Promise((r) => setTimeout(r, 100));
      let stable = 0;
      while (Date.now() - t0 < waitMs + 15000) {
        const r = await session.evaluate('document.readyState');
        if (!r.error && r.value === 'complete') { stable++; if (stable >= 3) break; } else { stable = 0; }
        await new Promise((r2) => setTimeout(r2, 200));
      }
      return loaded;
    },
    /** 在页面里求值（支持 await）。任何失败都返回 { error }，不抛异常。 */
    async evaluate(expression, { awaitPromise = true } = {}) {
      let r;
      try {
        r = await cdp.send('Runtime.evaluate', { expression, awaitPromise, returnByValue: true, userGesture: true });
      } catch (e) {
        return { error: (e && e.message) || String(e) };
      }
      if (r.exceptionDetails) {
        const d = r.exceptionDetails;
        return { error: String((d.exception && (d.exception.description || d.exception.value)) || d.text || 'eval error').split('\n')[0] };
      }
      return { value: r.result && r.result.value };
    },
    async dom() {
      const r = await session.evaluate('document.documentElement.outerHTML');
      return r.value || '';
    },
    /** 轮询直到 fn(value) 为真或超时。 */
    async waitFor(expression, predicate, timeoutMs = 20000, intervalMs = 250) {
      const t0 = Date.now();
      let last;
      while (Date.now() - t0 < timeoutMs) {
        const r = await session.evaluate(expression);
        last = r.error ? r.error : r.value;
        if (!r.error && predicate(r.value)) return { ok: true, value: r.value, ms: Date.now() - t0 };
        await new Promise((r2) => setTimeout(r2, intervalMs));
      }
      return { ok: false, value: last, ms: Date.now() - t0 };
    },
    async close() {
      try { await cdp.send('Browser.close', {}, 5000); } catch { /* ignore */ }
      cdp.close();
      await browser.close();
    },
  };
  return session;
}
