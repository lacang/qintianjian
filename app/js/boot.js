/* ============================================================================
   钦天监 · 启动引导（唯一的入口脚本）
   ----------------------------------------------------------------------------
   为什么要有这一层：
   旧版 index.html 直接 <script type="module" src="js/main.js">，而 main.js 顶部
   有 37 条静态 import。任意一个叶子模块（vendor/liuyao-core.js、three.module.js、
   js/astromodes.js…）404，整个模块图解析失败，main.js 一行都不执行 —— 于是首页
   只剩 HTML 骨架、三个骨架屏永远转、零提示（审计 r4 · R1–R3）。

   现在：入口只依赖零依赖的 errors.js；用动态 import() 启 main.js，失败时把
   「哪个文件失败」全屏告诉用户，并给「刷新重试」。
   ========================================================================== */
import { installGlobalErrorHooks, fatalPanel } from './errors.js?v=136';

installGlobalErrorHooks();

/** 从动态 import 的报错里抽出失败的文件名（Chrome/FF/Safari 文案不同，逐个兜） */
function failedFiles(err) {
  const msg = String((err && (err.message || err.stack)) || err || '');
  const hits = new Set();
  const re = /(https?:\/\/[^\s)'"]+?\.js(?:\?[^\s)'"]*)?)/g;
  let m;
  while ((m = re.exec(msg))) hits.add(m[1].replace(/^https?:\/\/[^/]+/, '').replace(/\?v=\d+$/, ''));
  // 「Failed to fetch dynamically imported module: X」优先用 X
  const one = /dynamically imported module:\s*(\S+)/i.exec(msg);
  if (one) hits.add(one[1].replace(/^https?:\/\/[^/]+/, '').replace(/\?v=\d+$/, ''));
  return [...hits];
}

// 启动看门狗：15 秒还没进入应用 → 直接给可读错误，别让骨架屏永远转
const WATCHDOG_MS = 15000;
const watchdog = setTimeout(() => {
  if (window.__QT_BOOTED) return;
  const sk = document.querySelectorAll('.qt-skeleton').length;
  fatalPanel(
    '程序没能加载',
    sk ? `启动超时：有程序文件一直没加载完（页面上还留着 ${sk} 个「加载中」占位）。` : '启动超时：程序没有跑起来。'
  );
}, WATCHDOG_MS);

import('./main.js?v=136')
  .then((m) => (typeof m.boot === 'function' ? m.boot() : null))
  .then(() => {
    window.__QT_BOOTED = true;
    clearTimeout(watchdog);
  })
  .catch((err) => {
    // main.js 的 loadModules 已经顺着 import 图找到了真 404 的文件（err.files）；
    // 拿不到才退回从报错文案里抠 URL。
    const fromMain = err && Array.isArray(err.files) ? err.files : [];
    const files = fromMain.length ? fromMain : failedFiles(err);
    const detail = files.length
      ? `这些程序文件没能加载：${files.slice(0, 4).join('、')}`
      : `启动时出错：${(err && (err.message || err)) || '未知原因'}`;
    try { console.error('[qintian] 启动失败', err); } catch { /* ignore */ }
    fatalPanel('程序没能加载', detail, files);
  });
