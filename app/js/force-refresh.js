// force-refresh.js — 首页右下角的版本号与强制刷新
//
// 为什么需要它
// ------------
// PWA 的资源分三层缓存：HTTP 磁盘缓存 / Service Worker 的 Cache Storage / 页面内存。
// 正常情况下 SW 的 networkFirst + updateViaCache:'none' 已经能保证「打开即最新」，
// 但线上确实会碰到「HTML 是新的、JS 还是旧的」——托管侧不发 Cache-Control，
// 微信和部分 WebView 会启发式缓存，且旧 SW 可能在 controllerchange 之前又响应了一次。
// 这时用户看到的界面和行为对不上，退出重进也没用，只有清缓存才行。
//
// 这个按钮做的事很克制：清掉本机的 Cache Storage、注销 SW、带时间戳重载一次。
// **它绝不碰 localStorage** —— 出生配置、手记、留下/存疑标记、案例全在那里。
// 「清缓存」和「清用户数据」是两件事，不能顺手一起干。
//
// 版本号从 sw.js 里读，不写死
// --------------------------
// 写死的话发版时一定忘改，显示的版本就变成假的，比不显示更糟。
// 这里读的是**实际部署的 sw.js**，所以它同时是一个自检：
// 如果这里显示 v127 而你刚发了 v128，说明浏览器拿到的还是旧 SW——正是要按按钮的时刻。

const SKIP_KEY = 'qt:force-reload';
const BUST_PARAM = '_r';

/** 从实际部署的 sw.js 里读 CACHE 版本；失败则退回 index.html 的 ?v= */
async function readVersion() {
  try {
    const r = await fetch('./sw.js', { cache: 'no-store' });
    if (r.ok) {
      const txt = await r.text();
      const m = txt.match(/CACHE\s*=\s*['"]qintian-v(\d+)['"]/);
      if (m) return 'v' + m[1];
    }
  } catch { /* 离线或 SW 拦截失败，走兜底 */ }

  // 兜底：从模块入口的 ?v= 读。两者不一致时，说明 HTML 与 SW 已经不同步了。
  try {
    const s = document.querySelector('script[type="module"][src*="?v="]');
    const m = s && s.src.match(/\?v=(\d+)/);
    if (m) return 'v' + m[1];
  } catch { /* ignore */ }
  return 'v—';
}

/** 清掉上一次强刷留下的 _r 参数，避免地址栏变脏、也不让用户复制出带时间戳的链接 */
function cleanBustParam() {
  try {
    const u = new URL(location.href);
    if (!u.searchParams.has(BUST_PARAM)) return;
    u.searchParams.delete(BUST_PARAM);
    const q = u.searchParams.toString();
    history.replaceState(null, '', u.pathname + (q ? '?' + q : '') + u.hash);
  } catch { /* ignore */ }
}

/** 真正执行强制刷新。顺序不能反：先清缓存，再注销 SW，最后才重载。 */
async function forceRefresh(btn) {
  if (btn) { btn.disabled = true; btn.classList.add('busy'); }

  // 1. 清所有 Cache Storage（SW 预缓存 + 运行时缓存都在这里）
  try {
    if (typeof caches !== 'undefined') {
      const keys = await caches.keys();
      await Promise.all(keys.map((k) => caches.delete(k)));
    }
  } catch { /* 部分 WebView 不支持，继续 */ }

  // 2. 注销 SW。不清注册的话，重载后旧 SW 会立刻用旧逻辑再接管一次，
  //    清了缓存也没意义——它可能又把旧响应写回来。
  try {
    if ('serviceWorker' in navigator) {
      const regs = await navigator.serviceWorker.getRegistrations();
      await Promise.all(regs.map((r) => r.unregister()));
    }
  } catch { /* ignore */ }

  // 3. 告诉 main.js：这次重载后 SW 重新接管，不要再触发一次自动刷新，
  //    否则用户会看到页面连闪两下。
  try { sessionStorage.setItem(SKIP_KEY, '1'); } catch { /* ignore */ }

  // 4. 带时间戳重载，绕过 HTTP 磁盘缓存。用 replace 不留历史记录。
  try {
    const u = new URL(location.href);
    u.searchParams.set(BUST_PARAM, Date.now().toString(36));
    location.replace(u.toString());
  } catch {
    location.reload();
  }
}

/**
 * 初始化。幂等，重复调用无副作用。
 */
export function initForceRefresh() {
  cleanBustParam();

  const box = document.getElementById('home-refresh');
  const btn = document.getElementById('hr-btn');
  const ver = document.getElementById('hr-ver');
  if (!box || !btn) return;

  // 版本号异步填，不阻塞首屏
  readVersion().then((v) => { if (ver) ver.textContent = v; });

  btn.addEventListener('click', (e) => {
    e.preventDefault();
    forceRefresh(btn);
  });

  // 兜底：如果这次重载因为某些原因没触发 controllerchange，
  // 标记会一直留着，导致下一次真正的版本更新被跳过一次。
  // 4 秒后无条件清掉，代价是极小概率多刷一次，好过永久跳过。
  try {
    if (sessionStorage.getItem(SKIP_KEY)) {
      setTimeout(() => { try { sessionStorage.removeItem(SKIP_KEY); } catch { /* ignore */ } }, 4000);
    }
  } catch { /* ignore */ }
}

/** 给 main.js 判断用：这次 controllerchange 是否应当跳过自动重载 */
export function shouldSkipAutoReload() {
  try {
    if (sessionStorage.getItem(SKIP_KEY) === '1') {
      sessionStorage.removeItem(SKIP_KEY);
      return true;
    }
  } catch { /* ignore */ }
  return false;
}
