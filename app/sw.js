// 钦天监 PWA 离线缓存（单用户本地工具）
// 策略：应用代码（HTML/JS/CSS/manifest/sw 自身）网络优先——一上线立刻拿到新版；
//       图片/牌图等静态资源缓存优先（首次访问那页时才缓存）；离线一律回退缓存。
//
// ============================ r4 改动（audit3/r5_perf.md P0-2）============================
// 旧版把 251 条资源（含 159 张牌图/图标共 33.86MB）全塞进 install 预缓存：
// 首访要下 39.63MB，Fast 3G 安装实测 261 秒，用户会以为装机失败。
// 现在预缓存只留「核心壳」：HTML + 核心 js（首屏闭包 33 个文件）+ 必需 css + 图标，
// 共约 3.3MB；牌图/月球贴图等大件改走 fetch 的 cacheFirst（访问到才缓存，离线仍可用
// ——前提是那个页面此前打开过一次）。
// 旧版本的图片缓存会在 activate 时随整库删除，不会在磁盘上堆到几十 MB。
const CACHE = 'qintian-v134';

/** 核心壳：能画出首页 + 起一卦 + 打开案例库 + 天象条所必需的文件 */
const ASSETS = [
  './',
  './index.html',
  './manifest.webmanifest',
  './css/style.css?v=133',
  './css/place.css?v=133',
  './css/planet-hour.css?v=133',
  './js/boot.js?v=133',
  './js/main.js?v=133',
  './js/errors.js?v=133',
  './js/state.js?v=133',
  './js/qintian.js?v=133',
  './js/zischool.js?v=133',
  './js/panview.js?v=133',
  './js/interact.js?v=133',
  './js/cast.js?v=133',
  './js/sharecode.js?v=133',
  './js/force-refresh.js?v=133',
  './js/tipview.js?v=133',
  './js/cases.js?v=133',
  './js/askview.js?v=133',
  './js/placeui.js?v=133',
  './js/geo.js?v=133',
  './js/citydata.js?v=133',
  './js/ritual.js?v=133',
  './js/homecards.js?v=133',
  './js/skyview.js?v=133',
  './js/zodiac.js?v=133',
  './js/solartime.js?v=133',
  './js/glossary.js?v=133',
  './js/meaning.js?v=133',
  './js/verdict.js?v=133',
  './js/astromodes.js?v=133',
  // 起卦与六爻装配的引擎（cast.js 静态依赖，首屏必用）
  './vendor/liuyao-core.js?v=133',
  './icons/icon-192.png',
  './icons/icon-512.png',
  // 下面这些是**视图模块**与牌图，删掉了预缓存，改由运行时 cacheFirst 缓存：
  // js/tarotview.js、js/ziweiview.js、js/astroview.js、js/globe.js、js/mansionview.js…
  // vendor/three/three.module.js、assets/cards*/*.jpg、assets/moon-tex.jpg
  // 想离线用某个视图，联网打开它一次即可（之后 even 断网也能开）。
];

self.addEventListener('install', (e) => {
  e.waitUntil(
    caches.open(CACHE)
      // 逐条 add 而不是 addAll：某一个文件 404 不该让整个安装失败（否则离线能力全丢）
      .then((c) => Promise.all(ASSETS.map((u) => c.add(u).catch(() => null))))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    // 旧版（v133 及更早）缓存里存着 39MB 的牌图，整库删掉，避免磁盘堆积
    caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

// 应用代码网络优先：在线始终取最新，并顺手更新缓存；离线才用缓存
function networkFirst(e) {
  // 绕过 HTTP 缓存直连源站：托管侧不发 Cache-Control，避免微信/浏览器 WebView 死缓存旧 JS
  const req = new Request(e.request, { cache: 'no-cache' });
  return fetch(req)
    .then((res) => {
      if (res && res.ok) {
        const copy = res.clone();
        caches.open(CACHE).then((c) => c.put(e.request, copy));
      }
      return res;
    })
    .catch(() => caches.match(e.request).then((hit) => hit || caches.match('./index.html')));
}

// 静态资源缓存优先（牌图、贴图、three.js 等：第一次用到才落盘）
function cacheFirst(e) {
  return caches.match(e.request).then((hit) =>
    hit ||
    fetch(e.request).then((res) => {
      if (res.ok) {
        const copy = res.clone();
        caches.open(CACHE).then((c) => c.put(e.request, copy));
      }
      return res;
    })
  );
}

self.addEventListener('fetch', (e) => {
  if (e.request.method !== 'GET') return;
  const url = new URL(e.request.url);
  if (url.origin !== self.location.origin) return;
  const path = url.pathname;
  const isAppCode =
    e.request.mode === 'navigate' ||
    path.endsWith('.html') ||
    path.endsWith('.js') ||
    path.endsWith('.css') ||
    path.endsWith('.webmanifest') ||
    path.endsWith('sw.js?v=133') ||
    path === '/' || path.endsWith('/');
  e.respondWith(isAppCode ? networkFirst(e) : cacheFirst(e));
});
