/* ============================================================================
   钦天监 · 错误边界（零依赖，必须最先可用）
   ----------------------------------------------------------------------------
   本模块刻意不 import 任何其它模块：它是「程序出错时唯一还活着的东西」，
   一旦它也依赖 state.js / vendor 内核，那些文件 404 时连报错面板都起不来。

   对外提供：
     esc(s)                     HTML 转义（& < > " '）
     errorHtml(err, title)      盘面内联错误块（返回值拼进 innerHTML）
     showError(err, opts)       统一错误出口：内联 + 顶部横幅 + toast（5 秒去重）
     fatalPanel(title, detail)  全屏致命错误面板（带「刷新重试」+ 版本号）
     renderWarnings(result)     内核 warnings / timeWarnings → 黄色可折叠提示条
     guardHtml / guardDom       视图渲染兜底包装
     showLoading / hideLoading  长计算遮罩
   ========================================================================== */

const LAST = { key: '', at: 0 };
const DEDUPE_MS = 5000;

/** HTML 转义：所有把用户/存储数据拼进模板字符串的地方都必须过这一层 */
export function esc(s) {
  return String(s == null ? '' : s).replace(/[&<>"']/g, (c) => (
    { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]
  ));
}

/** 从任意 err 里取出可读的原始消息 */
export function errMessage(err) {
  if (!err) return '未知错误';
  if (typeof err === 'string') return err;
  if (err.message) return String(err.message);
  try { return String(err); } catch { return '未知错误'; }
}

/** 英文库异常 / 浏览器异常 → 人话（原始消息仍以小字附在后面） */
export function humanize(msg) {
  const m = String(msg || '');
  if (/invalid solar date/i.test(m)) {
    return '这个日期在该历法里不存在：1582 年 10 月改历，10 月 5 日至 14 日被跳过。请换一天（例如 1582-10-15 之后，或 1582-10-04 之前）。';
  }
  if (/wrong solar year/i.test(m)) {
    return '这个年份超出了核心历法可计算的范围（民用太阳历在 1582 年改历前后不连续，更早/更晚的年份无法定位）。请换一个日期，常见可信区间是 1900–2100。';
  }
  if (/Cannot read propert(?:y|ies) of (?:null|undefined)/i.test(m)) {
    return '排盘缺了必需的输入（时间、地点或性别之一没拿到）。这通常是程序缺陷，请点「刷新重试」，仍复现请把下面的原始信息发给我。';
  }
  if (/is not a function|not a constructor/i.test(m)) {
    return '程序内部调用出错（某个计算模块没加载完整）。请点「刷新重试」。';
  }
  if (/Failed to fetch dynamically imported module|error loading dynamically imported module|Importing a module script failed/i.test(m)) {
    return '有程序文件没能加载（网络或缓存问题）。请点「刷新重试」；仍不行就强制刷新一次。';
  }
  if (/Failed to fetch|NetworkError|Load failed|Network request failed/i.test(m)) {
    return '本地资源请求失败，可能是离线/缓存没命中。请点「刷新重试」。';
  }
  if (/QuotaExceeded|quota/i.test(m)) {
    return '浏览器本地存储已满，这一步没存下来。清一些案例后重试。';
  }
  if (/Script error\.?$/i.test(m)) {
    return '脚本出错了（浏览器出于安全限制没给细节）。请刷新重试。';
  }
  return m || '未知错误';
}

/** 盘面内联错误块：中文标题 + 原始消息小字 + 复制/重试 */
export function errorHtml(err, title = '这一步没算出来') {
  const raw = errMessage(err);
  const human = humanize(raw);
  const t = title || '这一步没算出来';
  return `<div class="qt-err" role="alert" data-qt-err>
  <div class="qt-err-head"><span class="qt-err-ico">⚠</span><b>${esc(t)}</b></div>
  <div class="qt-err-msg">${esc(human)}</div>
  ${human !== raw ? `<div class="qt-err-raw">原始信息：<code>${esc(raw)}</code></div>` : ''}
  <div class="qt-err-acts">
    <button type="button" class="qt-err-btn" data-qt-report="${esc(raw)}">报告问题（复制信息）</button>
    <button type="button" class="qt-err-btn" data-qt-retry>刷新重试</button>
  </div>
</div>`;
}

/** 顶部横幅：非阻塞，出错时页面还能用 */
function errBar(title, msg) {
  let bar = document.getElementById('qt-errbar');
  if (!bar) {
    bar = document.createElement('div');
    bar.id = 'qt-errbar';
    bar.className = 'qt-errbar';
    document.body.appendChild(bar);
  }
  bar.innerHTML = `<span class="qt-errbar-ico">⚠</span><span class="qt-errbar-t">${esc(title)}</span><span class="qt-errbar-m">${esc(msg)}</span><button type="button" class="qt-errbar-x" aria-label="关闭">✕</button>`;
  bar.classList.add('show');
  clearTimeout(errBar._t);
  errBar._t = setTimeout(() => bar.classList.remove('show'), 8000);
}

function toastSoft(msg) {
  const t = document.getElementById('toast');
  if (!t) return;
  t.textContent = msg;
  t.classList.add('show');
  clearTimeout(t._timer);
  t._timer = setTimeout(() => t.classList.remove('show'), 2400);
}

/**
 * 统一错误出口。
 * @param {any} err
 * @param {{title?:string, container?:string|Element, quiet?:boolean}} opts
 */
export function showError(err, opts = {}) {
  const title = opts.title || '出错了';
  const raw = errMessage(err);
  const human = humanize(raw);
  try {
    if (opts.container) {
      const el = typeof opts.container === 'string' ? document.querySelector(opts.container) : opts.container;
      if (el) el.innerHTML = errorHtml(err, title);
      else if (!document.getElementById('qt-errbar')?.classList.contains('show')) fatalPanel(title, human);
    }
  } catch { /* 渲染错误块本身失败也不能再抛 */ }

  const key = `${title}|${raw}`;
  const now = Date.now();
  if (key === LAST.key && now - LAST.at < DEDUPE_MS) return; // 5 秒内同一错误只提示一次
  LAST.key = key; LAST.at = now;

  if (opts.quiet) return;
  try { errBar(title, human); toastSoft(`${title}：${human.slice(0, 60)}`); } catch { /* ignore */ }
}

/** 全屏致命错误面板（模块加载失败 / 启动超时） */
export function fatalPanel(title, detail, files) {
  if (document.getElementById('qt-fatal')) return;
  const v = (function () {
    try {
      const s = document.querySelector('script[type="module"]');
      const m = s && /[?&]v=(\d+)/.exec(s.src);
      return m ? 'v' + m[1] : 'v—';
    } catch { return 'v—'; }
  })();
  const uniq = Array.isArray(files) ? [...new Set(files)] : [];
  const show = uniq.slice(0, 4);
  // 只有一个坏文件且说明里已经点名了，就别再列一遍（否则面板上同一行出现两次）
  const mentioned = uniq.length === 1 && String(detail || '').includes(uniq[0]);
  const list = uniq.length && !mentioned
    ? `<ul class="qt-fatal-list">${show.map((f) => `<li><code>${esc(f)}</code></li>`).join('')}${uniq.length > show.length ? `<li>…另有 ${uniq.length - show.length} 个文件受同一问题影响</li>` : ''}</ul>`
    : '';
  const box = document.createElement('div');
  box.id = 'qt-fatal';
  box.className = 'qt-fatal';
  box.setAttribute('role', 'alertdialog');
  box.innerHTML = `
    <div class="qt-fatal-card">
      <div class="qt-fatal-ico">⚠</div>
      <h2 class="qt-fatal-t">${esc(title || '程序没能加载')}</h2>
      <p class="qt-fatal-d">${esc(detail || '有程序文件没能加载，页面停在了加载中。')}</p>
      ${list}
      <div class="qt-fatal-acts">
        <button type="button" class="qt-fatal-btn primary" onclick="location.reload()">刷新重试</button>
        <button type="button" class="qt-fatal-btn" data-qt-report="启动失败：${esc(detail || '')}${show.length ? ' ｜ ' + esc(show.join('、')) : ''}">复制问题信息</button>
      </div>
      <p class="qt-fatal-hint">若反复出现：请确认网络正常，或在浏览器里强制刷新（Ctrl/⌘ + Shift + R）。</p>
      <p class="qt-fatal-v">${esc(v)}</p>
    </div>`;
  document.body.appendChild(box);
  document.body.classList.add('qt-lock');
}

/** 内核降级提示：timeWarnings / warnings / chart.warnings 统一收敛成一组文本 */
export function collectWarnings(res) {
  if (!res || typeof res !== 'object') return [];
  const out = [];
  const push = (w) => {
    if (!w) return;
    if (typeof w === 'string') {
      const t = w.replace(/\*\*/g, '').trim();
      if (t) out.push({ text: t, raw: '' });
      return;
    }
    if (typeof w === 'object') {
      const kind = w.kind || '';
      let text = w.text || w.message || w.note || '';
      if (kind === 'outside_validated_range') {
        const body = w.body || '某星体';
        const va = w.validated || {};
        text = `星历在该年份未经实测校验（${body}${va.from ? `，可信区间 ${va.from}–${va.to}` : ''}）：位置能算出来，但不能当作已验证结果`;
      } else if (kind === 'delta_t_uncertain') {
        text = `远古/远未来时刻 ΔT 不确定度约 ${w.sigmaSeconds} 秒：上升点/天顶约有 ${w.angleSmearDeg}° 偏差、月亮约 ${w.moonSmearArcmin}′，慢速星体不受影响`;
      }
      const rawText = (w.text && w.text !== text) ? String(w.text) : '';
      if (text) out.push({ text: String(text).replace(/\*\*/g, ''), raw: rawText });
    }
  };
  const arrs = [res.timeWarnings, res.warnings, res.time && res.time.warnings, res.chart && res.chart.warnings, res._chart && res._chart.warnings];
  arrs.forEach((a) => { if (Array.isArray(a)) a.forEach(push); });
  // 去重（同一句只在最上面出现一次）
  const seen = new Set();
  return out.filter((w) => (seen.has(w.text) ? false : (seen.add(w.text), true)));
}

/**
 * 在每个盘面结果区顶部渲染内核 warnings（黄色、可折叠）。
 * 无 warnings 时返回空字符串 —— 不占位、不产生空条。
 */
export function renderWarnings(res, opts = {}) {
  let list;
  try { list = collectWarnings(res); } catch { list = []; }
  if (!list.length) return '';
  const open = opts.open ? ' open' : '';
  const label = opts.label || '计算提示';
  return `<details class="qt-warn"${open} data-qt-warn>
  <summary class="qt-warn-sum"><span class="qt-warn-ico">⚠</span>${label} ${list.length} 条 · 点开看细节</summary>
  <ul class="qt-warn-list">
    ${list.map((w) => `<li>${esc(w.text)}${w.raw ? `<i class="qt-warn-raw">${esc(w.raw)}</i>` : ''}</li>`).join('')}
  </ul>
</details>`;
}

/* ---------------------------- 渲染错误标记 ---------------------------- */
/** 视图内自带 try/catch 的地方调它，供上层决定「别弹成功 toast」 */
export function markRenderError(err) {
  try { window.__qtRenderError = err || new Error('渲染失败'); } catch { /* ignore */ }
}
export function clearRenderError() {
  try { window.__qtRenderError = null; } catch { /* ignore */ }
}
export function takeRenderError() {
  let e = null;
  try { e = window.__qtRenderError; window.__qtRenderError = null; } catch { /* ignore */ }
  return e;
}

/** 返回 HTML 字符串的渲染函数兜底 */
export function guardHtml(fn, title) {
  return function guardedHtml(...args) {
    try { return fn.apply(this, args); }
    catch (e) { markRenderError(e); return errorHtml(e, title); }
  };
}

/**
 * 通用兜底：既适合「return HTML 字符串」的渲染函数，也适合「自己写 DOM」的渲染函数。
 * 出错时把 errorHtml 写进该盘的结果容器（能写到就写），同时把 HTML 返回给调用方
 * —— 于是 `el.innerHTML = renderX()` 和 `renderX()` 两种调用形态都不会白屏。
 */
export function guard(fn, title, sel) {
  return function guarded(...args) {
    try { return fn.apply(this, args); }
    catch (e) {
      markRenderError(e);
      const html = errorHtml(e, title);
      try {
        const el = typeof sel === 'string' ? document.querySelector(sel) : sel;
        if (el) el.innerHTML = html;
        else showError(e, { title });
      } catch { showError(e, { title }); }
      return html;
    }
  };
}

/** 自己写 DOM 的渲染函数兜底（renderAstro / renderVedic / renderZiwei ...） */
export function guardDom(fn, title, sel) {
  return function guardedDom(...args) {
    try { return fn.apply(this, args); }
    catch (e) {
      markRenderError(e);
      try {
        const el = typeof sel === 'string' ? document.querySelector(sel) : sel;
        if (el) el.innerHTML = errorHtml(e, title);
        else showError(e, { title });
      } catch { showError(e, { title }); }
    }
  };
}

/* ---------------------------- 长计算遮罩 ---------------------------- */
/* 引用计数：重盘型可能被「外层点击处理」和「视图自己」各 show 一次，
   任何一方先 hide 都不该把还在算的遮罩撤掉（否则用户又看到冻住的界面） */
let _loadingDepth = 0;
export function showLoading(msg = '正在计算…', sub = '') {
  _loadingDepth += 1;
  let el = document.getElementById('qt-loading');
  if (!el) {
    el = document.createElement('div');
    el.id = 'qt-loading';
    el.className = 'qt-loading';
    el.innerHTML = '<div class="qt-loading-card"><span class="qt-spin"></span><span class="qt-loading-t"></span><span class="qt-loading-s"></span></div>';
    document.body.appendChild(el);
  }
  el.querySelector('.qt-loading-t').textContent = msg;
  el.querySelector('.qt-loading-s').textContent = sub;
  el.style.display = 'flex';
  document.body.classList.add('qt-lock');
}
export function hideLoading() {
  _loadingDepth = Math.max(0, _loadingDepth - 1);
  if (_loadingDepth > 0) return;
  const el = document.getElementById('qt-loading');
  if (el) el.style.display = 'none';
  refreshScrollLock();
}

/* ---------------------------- 弹层滚动锁 ---------------------------- */
export function refreshScrollLock() {
  try {
    const openModal = !!document.querySelector('.code-sheet.open, .place-modal');
    const loading = (() => { const el = document.getElementById('qt-loading'); return !!el && el.style.display !== 'none'; })();
    document.body.classList.toggle('qt-lock', openModal || loading);
  } catch { /* ignore */ }
}

/* ---------------------------- 全局捕获 ---------------------------- */
function shortUrl(u) {
  const s = String(u || '');
  const m = /([^/]+\/[^/?]+)(\?[^#]*)?$/.exec(s);
  return m ? m[1] + (m[2] || '') : s;
}

export function installGlobalErrorHooks() {
  if (typeof window === 'undefined' || window.__QT_ERR_HOOKED) return;
  window.__QT_ERR_HOOKED = true;

  // ① 资源加载失败（script/link/img）走捕获阶段，冒泡阶段拿不到 target
  // ② 运行期未捕获异常
  window.addEventListener('error', (e) => {
    try {
      const t = e && e.target;
      if (t && t !== window && t.tagName && /^(SCRIPT|LINK|IMG)$/.test(t.tagName)) {
        const url = shortUrl(t.src || t.href || '');
        if (!window.__QT_BOOTED) {
          fatalPanel('程序没能加载', `有一个程序文件没能加载：${url || '未知文件'}`, url ? [url] : []);
        } else {
          showError(new Error(`资源加载失败：${url}`), { title: '有个资源没加载上' });
        }
        return;
      }
      if (!e || (!e.message && !e.error)) return;
      showError(e.error || new Error(e.message), { title: '页面出错了' });
    } catch { /* 捕获器自身绝不能再抛 */ }
  }, true);

  window.addEventListener('unhandledrejection', (e) => {
    try {
      const r = e && e.reason;
      showError(r instanceof Error ? r : new Error(errMessage(r)), { title: '后台任务出错了' });
    } catch { /* ignore */ }
  });

  // 错误块上的两个按钮（委托，一次绑好）
  document.addEventListener('click', (e) => {
    const t = e.target;
    if (!t || !t.closest) return;
    const rep = t.closest('[data-qt-report]');
    if (rep) {
      const txt = `钦天监 · 问题报告\n页面：${location.href}\n浏览器：${navigator.userAgent}\n信息：${rep.getAttribute('data-qt-report') || ''}`;
      try {
        if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(txt);
        else {
          const ta = document.createElement('textarea');
          ta.value = txt; document.body.appendChild(ta); ta.select();
          document.execCommand && document.execCommand('copy'); ta.remove();
        }
        toastSoft('问题信息已复制');
      } catch { toastSoft('复制失败，请长按选择'); }
      return;
    }
    if (t.closest('[data-qt-retry]')) { location.reload(); return; }
    if (t.closest('#qt-errbar .qt-errbar-x')) {
      const bar = document.getElementById('qt-errbar');
      if (bar) bar.classList.remove('show');
    }
  });
  window.__QT_HANDLE_ERROR = showError;
}
