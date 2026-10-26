// 钦天监 PWA 离线缓存（单用户本地工具）
// 策略：应用代码（HTML/JS/CSS/manifest/sw 自身）网络优先——一上线立刻拿到新版；
//       图标/字体等静态资源缓存优先；离线一律回退缓存。
const CACHE = 'qintian-v121';
const ASSETS = [
  './',
  './index.html',
  './manifest.webmanifest',
  './css/style.css?v=121',
  './js/main.js?v=121',
  './js/state.js?v=121',
  './js/classical.js?v=121',
  './js/interact.js?v=121',
  './js/reading.js?v=121',
  './js/qintian.js?v=121',
  './js/panview.js?v=121',
  './js/cast.js?v=121',
  './js/sharecode.js?v=121',
  './js/cases.js?v=121',
  './js/baziview.js?v=121',
  './js/meihuaview.js?v=121',
  './js/qimenview.js?v=121',
  './js/astroview.js?v=121',
  './js/vedicview.js?v=121',
  './js/zhuyou/zhuyou-meta.js?v=121',
  './js/zhuyou/zhuyou-data.js?v=121',
  './js/zhuyou/zhuyou-util.js?v=121',
  './js/zhuyou/zhuyouview.js?v=121',
  './js/zhuyou/zhuyou-data-jinjing.js?v=121',
  './js/zhuyou/zhuyou-data-shisanke.js?v=121',
  './vendor/bazhai-core.js?v=121',
  './js/yangzhai/yangzhai-judge.js?v=121',
  './js/yangzhai/yangzhaiview.js?v=121',
  './css/yangzhai.css?v=121',
  './js/skyview.js?v=121',
  './js/zodiac.js?v=121',
  './js/mansionview.js?v=121',
  './js/daliurenview.js?v=121',
  './js/xiaoliurenview.js?v=121',
  './js/geomancyview.js?v=121',
  './js/tibetview.js?v=121',
  './js/tibetdata_dice.js?v=121',
  './js/tibetdata_coin.js?v=121',
  './css/tibet.css?v=121',
  './js/tarotview.js?v=121',
  './js/tarotval_rws.js?v=121',
  './css/tarot.css?v=121',
  './css/vedic.css?v=121',
  './css/zhuyou.css?v=121',
  './js/globe.js?v=121',
  './js/stars.js?v=121',
  './vendor/three/three.module.js',
  './js/glossary.js?v=121',
  './js/meaning.js?v=121',
  './js/tipview.js?v=121',
  './js/jingzhuanview.js?v=121',
  './js/readingview.js?v=121',
  './js/najiaview.js?v=121',
  './js/verdict.js?v=121',
  './js/verdicts.js?v=121',
  './js/askview.js?v=121',
  './assets/moon-tex.jpg?v=121',
  './js/zischool.js?v=121',
  './js/solartime.js?v=121',
  './js/tarotdeck-sb.js?v=121',
  './assets/cards-sb/cups-02.jpg',
  './assets/cards-sb/cups-03.jpg',
  './assets/cards-sb/cups-04.jpg',
  './assets/cards-sb/cups-05.jpg',
  './assets/cards-sb/cups-06.jpg',
  './assets/cards-sb/cups-07.jpg',
  './assets/cards-sb/cups-08.jpg',
  './assets/cards-sb/cups-09.jpg',
  './assets/cards-sb/cups-10.jpg',
  './assets/cards-sb/cups-ace.jpg',
  './assets/cards-sb/cups-king.jpg',
  './assets/cards-sb/cups-knight.jpg',
  './assets/cards-sb/cups-page.jpg',
  './assets/cards-sb/cups-queen.jpg',
  './assets/cards-sb/major-00-fool.jpg',
  './assets/cards-sb/major-01-magician.jpg',
  './assets/cards-sb/major-02-priestess.jpg',
  './assets/cards-sb/major-03-empress.jpg',
  './assets/cards-sb/major-04-emperor.jpg',
  './assets/cards-sb/major-05-hierophant.jpg',
  './assets/cards-sb/major-06-lovers.jpg',
  './assets/cards-sb/major-07-chariot.jpg',
  './assets/cards-sb/major-08-strength.jpg',
  './assets/cards-sb/major-09-hermit.jpg',
  './assets/cards-sb/major-10-wheel.jpg',
  './assets/cards-sb/major-11-justice.jpg',
  './assets/cards-sb/major-12-hanged.jpg',
  './assets/cards-sb/major-13-death.jpg',
  './assets/cards-sb/major-14-temperance.jpg',
  './assets/cards-sb/major-15-devil.jpg',
  './assets/cards-sb/major-16-tower.jpg',
  './assets/cards-sb/major-17-star.jpg',
  './assets/cards-sb/major-18-moon.jpg',
  './assets/cards-sb/major-19-sun.jpg',
  './assets/cards-sb/major-20-judgement.jpg',
  './assets/cards-sb/major-21-world.jpg',
  './assets/cards-sb/manifest.json',
  './assets/cards-sb/pentacles-02.jpg',
  './assets/cards-sb/pentacles-03.jpg',
  './assets/cards-sb/pentacles-04.jpg',
  './assets/cards-sb/pentacles-05.jpg',
  './assets/cards-sb/pentacles-06.jpg',
  './assets/cards-sb/pentacles-07.jpg',
  './assets/cards-sb/pentacles-08.jpg',
  './assets/cards-sb/pentacles-09.jpg',
  './assets/cards-sb/pentacles-10.jpg',
  './assets/cards-sb/pentacles-ace.jpg',
  './assets/cards-sb/pentacles-king.jpg',
  './assets/cards-sb/pentacles-knight.jpg',
  './assets/cards-sb/pentacles-page.jpg',
  './assets/cards-sb/pentacles-queen.jpg',
  './assets/cards-sb/swords-02.jpg',
  './assets/cards-sb/swords-03.jpg',
  './assets/cards-sb/swords-04.jpg',
  './assets/cards-sb/swords-05.jpg',
  './assets/cards-sb/swords-06.jpg',
  './assets/cards-sb/swords-07.jpg',
  './assets/cards-sb/swords-08.jpg',
  './assets/cards-sb/swords-09.jpg',
  './assets/cards-sb/swords-10.jpg',
  './assets/cards-sb/swords-ace.jpg',
  './assets/cards-sb/swords-king.jpg',
  './assets/cards-sb/swords-knight.jpg',
  './assets/cards-sb/swords-page.jpg',
  './assets/cards-sb/swords-queen.jpg',
  './assets/cards-sb/wands-02.jpg',
  './assets/cards-sb/wands-03.jpg',
  './assets/cards-sb/wands-04.jpg',
  './assets/cards-sb/wands-05.jpg',
  './assets/cards-sb/wands-06.jpg',
  './assets/cards-sb/wands-07.jpg',
  './assets/cards-sb/wands-08.jpg',
  './assets/cards-sb/wands-09.jpg',
  './assets/cards-sb/wands-10.jpg',
  './assets/cards-sb/wands-ace.jpg',
  './assets/cards-sb/wands-king.jpg',
  './assets/cards-sb/wands-knight.jpg',
  './assets/cards-sb/wands-page.jpg',
  './assets/cards-sb/wands-queen.jpg',
  './js/todaycard.js?v=121',
  './js/rhythmview.js?v=121',
  './js/tianxiangcalendar.js?v=121',
  './js/ziweiview.js?v=121',
  './js/cardsview.js?v=121',
  './vendor/liuyao-core.js?v=121',
  './vendor/xuankong-core.js?v=121',
  './js/yangzhai/yangzhai-xuankong.js?v=121',
  './icons/icon-192.png',
  './icons/icon-512.png',
  './assets/cards/cups-02.jpg',
  './assets/cards/cups-03.jpg',
  './assets/cards/cups-04.jpg',
  './assets/cards/cups-05.jpg',
  './assets/cards/cups-06.jpg',
  './assets/cards/cups-07.jpg',
  './assets/cards/cups-08.jpg',
  './assets/cards/cups-09.jpg',
  './assets/cards/cups-10.jpg',
  './assets/cards/cups-ace.jpg',
  './assets/cards/cups-king.jpg',
  './assets/cards/cups-knight.jpg',
  './assets/cards/cups-page.jpg',
  './assets/cards/cups-queen.jpg',
  './assets/cards/major-00-fool.jpg',
  './assets/cards/major-01-magician.jpg',
  './assets/cards/major-02-priestess.jpg',
  './assets/cards/major-03-empress.jpg',
  './assets/cards/major-04-emperor.jpg',
  './assets/cards/major-05-hierophant.jpg',
  './assets/cards/major-06-lovers.jpg',
  './assets/cards/major-07-chariot.jpg',
  './assets/cards/major-08-strength.jpg',
  './assets/cards/major-09-hermit.jpg',
  './assets/cards/major-10-wheel.jpg',
  './assets/cards/major-11-justice.jpg',
  './assets/cards/major-12-hanged.jpg',
  './assets/cards/major-13-death.jpg',
  './assets/cards/major-14-temperance.jpg',
  './assets/cards/major-15-devil.jpg',
  './assets/cards/major-16-tower.jpg',
  './assets/cards/major-17-star.jpg',
  './assets/cards/major-18-moon.jpg',
  './assets/cards/major-19-sun.jpg',
  './assets/cards/major-20-judgement.jpg',
  './assets/cards/major-21-world.jpg',
  './assets/cards/pentacles-02.jpg',
  './assets/cards/pentacles-03.jpg',
  './assets/cards/pentacles-04.jpg',
  './assets/cards/pentacles-05.jpg',
  './assets/cards/pentacles-06.jpg',
  './assets/cards/pentacles-07.jpg',
  './assets/cards/pentacles-08.jpg',
  './assets/cards/pentacles-09.jpg',
  './assets/cards/pentacles-10.jpg',
  './assets/cards/pentacles-ace.jpg',
  './assets/cards/pentacles-king.jpg',
  './assets/cards/pentacles-knight.jpg',
  './assets/cards/pentacles-page.jpg',
  './assets/cards/pentacles-queen.jpg',
  './assets/cards/swords-02.jpg',
  './assets/cards/swords-03.jpg',
  './assets/cards/swords-04.jpg',
  './assets/cards/swords-05.jpg',
  './assets/cards/swords-06.jpg',
  './assets/cards/swords-07.jpg',
  './assets/cards/swords-08.jpg',
  './assets/cards/swords-09.jpg',
  './assets/cards/swords-10.jpg',
  './assets/cards/swords-ace.jpg',
  './assets/cards/swords-king.jpg',
  './assets/cards/swords-knight.jpg',
  './assets/cards/swords-page.jpg',
  './assets/cards/swords-queen.jpg',
  './assets/cards/wands-02.jpg',
  './assets/cards/wands-03.jpg',
  './assets/cards/wands-04.jpg',
  './assets/cards/wands-05.jpg',
  './assets/cards/wands-06.jpg',
  './assets/cards/wands-07.jpg',
  './assets/cards/wands-08.jpg',
  './assets/cards/wands-09.jpg',
  './assets/cards/wands-10.jpg',
  './assets/cards/wands-ace.jpg',
  './assets/cards/wands-king.jpg',
  './assets/cards/wands-knight.jpg',
  './assets/cards/wands-page.jpg',
  './assets/cards/wands-queen.jpg',
  './js/astromodes.js?v=121',
  './js/homecards.js?v=121',
  './js/mansion3d.js?v=121',
  './js/ritual.js?v=121',
  './js/tarotdata_marseille.js?v=121',
  './js/tarotdeck-hist.js?v=121',
  './js/taroticons_marseille.js?v=121',
  './js/yangzhai/yangzhai-jinsuo.js?v=121',
  // v111 新增：地址中心（离线城市库 / 地点条 / 选点弹层）与行星时择时样式
  './js/geo.js?v=121',
  './js/placeui.js?v=121',
  './js/citydata.js?v=121',
  './css/place.css?v=121',
  './css/planet-hour.css?v=121',];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(ASSETS)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
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

// 静态资源缓存优先
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
    path.endsWith('sw.js') ||
    path === '/' || path.endsWith('/');
  e.respondWith(isAppCode ? networkFirst(e) : cacheFirst(e));
});
