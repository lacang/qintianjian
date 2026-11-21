/* ============================================================================
   钦天监 · 应用主体
   ----------------------------------------------------------------------------
   审计 r4 · R1–R3：旧版这里是一大排静态 import，任意叶子模块 404 会让整个模块图
   解析失败，main.js 一行都不执行 → 首页空壳、骨架屏永转、零提示。
   现在：顶层零静态依赖（只动态装错误钩子），全部模块在 boot() 里用 import() 逐个
   加载并收齐失败清单；真正断链的文件由 probeBroken() 顺着 import 图找出来
   （报 /vendor/liuyao-core.js，而不是被牵连的 20 个 view）。
   ========================================================================== */

/* P0-3 全局错误捕获：模块一执行就装，早于任何视图渲染 */
import('./errors.js?v=133').then((m) => m.installGlobalErrorHooks()).catch(() => { /* boot.js 兜底 */ });

/** 视图模块清单：键名用于 boot() 里解构，值是可被 tools/check-modules.mjs 校验的字面量 */
const SPECS = {
  'state.js': './state.js?v=133',
  'zischool.js': './zischool.js?v=133',
  'qintian.js': './qintian.js?v=133',
  'panview.js': './panview.js?v=133',
  'baziview.js': './baziview.js?v=133',
  'meihuaview.js': './meihuaview.js?v=133',
  'hecanview.js': './hecanview.js?v=133',
  'qimenview.js': './qimenview.js?v=133',
  'astroview.js': './astroview.js?v=133',
  'astromodes.js': './astromodes.js?v=133',
  'vedicview.js': './vedicview.js?v=133',
  'zhuyou/zhuyouview.js': './zhuyou/zhuyouview.js?v=133',
  'yangzhai/yangzhaiview.js': './yangzhai/yangzhaiview.js?v=133',
  'ziweiview.js': './ziweiview.js?v=133',
  'interact.js': './interact.js?v=133',
  'cardsview.js': './cardsview.js?v=133',
  'skyview.js': './skyview.js?v=133',
  'globe.js': './globe.js?v=133',
  'mansionview.js': './mansionview.js?v=133',
  'cast.js': './cast.js?v=133',
  'sharecode.js': './sharecode.js?v=133',
  'force-refresh.js': './force-refresh.js?v=133',
  'tipview.js': './tipview.js?v=133',
  'cases.js': './cases.js?v=133',
  'askview.js': './askview.js?v=133',
  'classic/classicview.js': './classic/classicview.js?v=133',
  'placeui.js': './placeui.js?v=133',
  'geo.js': './geo.js?v=133',
  'ritual.js': './ritual.js?v=133',
  'homecards.js': './homecards.js?v=133',
  'daliurenview.js': './daliurenview.js?v=133',
  'xiaoliurenview.js': './xiaoliurenview.js?v=133',
  'geomancyview.js': './geomancyview.js?v=133',
  'tibetview.js': './tibetview.js?v=133',
  'tarotview.js': './tarotview.js?v=133',
};

/**
 * 顺着失败的模块往下 find「真正 404 的那个文件」。
 * 动态 import 的报错只会说「你让我加载的 X 失败了」，而 X 往往只是受害人：
 * 真正断链的可能是它 import 的 ../vendor/liuyao-core.js。这里把失败模块的源码取回来，
 * 逐条 import 路径 probe 两跳，把 HTTP 非 2xx 的文件名捞出来 —— 报错才有指向性。
 */
async function probeBroken(specs, depth = 2) {
  const seen = new Set();
  const broken = [];
  // SPECS 里的 './x.js' 是相对 main.js 所在目录（/js/）的，不能当成相对页面路径
  const abs = (u) => { const x = new URL(u, import.meta.url); return x.pathname + x.search; };
  let queue = specs.map(abs);
  for (let d = 0; d < depth && queue.length; d += 1) {
    const next = [];
    await Promise.all(queue.map(async (spec) => {
      if (seen.has(spec)) return;
      seen.add(spec);
      try {
        const res = await fetch(spec, { cache: 'no-store' });
        if (!res.ok) { broken.push(`${spec.replace(/\?v=\d+$/, '')}（HTTP ${res.status}）`); return; }
        const txt = await res.text();
        const re = /(?:\bfrom\s*|\bimport\s*\(\s*)['"]([^'"]+)['"]/g;
        let m;
        while ((m = re.exec(txt))) {
          const rel = m[1];
          if (!rel || !/^\.{1,2}\//.test(rel)) continue; // 只跟相对路径
          try { const u = new URL(rel, new URL(spec, location.href)); next.push(u.pathname + u.search); } catch { /* ignore */ }
        }
      } catch { /* fetch 本身失败（离线/被拦）就不深究，退回原清单 */ }
    }));
    queue = next;
  }
  return [...new Set(broken)];
}

/**
 * ============================ 懒加载（P0-1 首屏瘦身）============================
 * SPECS 仍是**全量清单**（tools/check-modules.mjs 用它校验每个模块文件都在），
 * 但 boot() 只装 CORE_KEYS 里的核心壳，其余 18 个视图模块等用户点开那页时才 import。
 *
 * 依据（audit3/r5_perf.md）：首屏 93 请求 / 6.09MB，其中 12 个单一视图专属文件
 * 共 2.06MB（482KB gzip）占 25.8%，而用户一次可能一个都不点。
 */
const CORE_KEYS = new Set([
  'state.js', 'zischool.js', 'qintian.js', 'panview.js', 'interact.js', 'cast.js',
  'sharecode.js', 'force-refresh.js', 'tipview.js', 'cases.js', 'askview.js',
  'placeui.js', 'geo.js', 'ritual.js', 'homecards.js', 'classical.js', 'reading.js',
  // 首页天象条：skyview 必须随首屏装（zodiac / solartime 随之而来）
  'skyview.js', 'zodiac.js',
]);

/** 视图名 → SPECS 键（懒加载的入口表；一个视图只多拉它自己那一坨） */
const VIEW_KEY = {
  bazi: 'baziview.js', meihua: 'meihuaview.js', hecan: 'hecanview.js', qimen: 'qimenview.js',
  astro: 'astroview.js', vedic: 'vedicview.js', zhuyou: 'zhuyou/zhuyouview.js',
  yangzhai: 'yangzhai/yangzhaiview.js', ziwei: 'ziweiview.js', cards: 'cardsview.js',
  globe: 'globe.js', mansion: 'mansionview.js', daliuren: 'daliurenview.js',
  xiaoliuren: 'xiaoliurenview.js', geomancy: 'geomancyview.js', tibetan: 'tibetview.js',
  tarot: 'tarotview.js', classic: 'classic/classicview.js',
};

/** 视图专属样式：跟模块一起懒装（首屏只留 style.css + place.css + planet-hour.css） */
const VIEW_CSS = {
  classic: './css/classic.css?v=133', tarot: './css/tarot.css?v=133',
  tibet: './css/tibet.css?v=133', vedic: './css/vedic.css?v=133',
  zhuyou: './css/zhuyou.css?v=133', yangzhai: './css/yangzhai.css?v=133',
};

/** 已装视图模块：视图名 → 模块命名空间 */
const VM = {};
/** 正在装的视图：视图名 → Promise（连点两下只装一次；失败清掉可重试） */
const VPENDING = {};
/** 视图级一次性初始化：容器级事件委托，装一次就够（原来是 bind() 里无条件调一遍） */
const VIEW_INIT = {
  mansion: (m) => m.initMansionInteract(),
  geomancy: (m) => m.initGeomancy(),
  tibetan: (m) => m.initTibetan(),
  tarot: (m) => m.initTarot(),
  classic: (m) => { m.bindClassic(); m.bindClassicDetail(); },
};
/** 视图 → 渲染。参数是模块命名空间，避免顶层引用尚未安装的导出 */
const RENDER = {
  bazi: (m) => { const b = $('#bazi-body'); if (b) b.innerHTML = m.renderBazi(); },
  meihua: (m) => { const b = $('#meihua-body'); if (b) b.innerHTML = m.renderMeiHua(); },
  qimen: (m) => { const b = $('#qimen-body'); if (b) b.innerHTML = m.renderQiMen(); },
  hecan: (m) => { const b = $('#hecan-body'); if (b) { b.innerHTML = m.renderHeCan(); m.initHeCan(b); } },
  astro: (m) => m.renderAstro(),
  vedic: (m) => m.renderVedic(),
  zhuyou: (m) => m.renderZhuyou(),
  yangzhai: (m) => { const b = $('#yangzhai-body'); if (b) { b.innerHTML = m.renderYangzhai(); m.initYangzhai(); } },
  ziwei: (m) => m.renderZiwei(),
  cards: (m) => m.renderCards(),
  sky: (m) => m.renderSky(),
  globe: (m) => m.renderGlobe(nowDate()),
  mansion: (m) => m.renderMansion(),
  daliuren: (m) => { const b = $('#daliuren-body'); if (b) b.innerHTML = m.renderDaLiuRen(nowDate()); },
  xiaoliuren: (m) => { const b = $('#xiaoliuren-body'); if (b) b.innerHTML = m.renderXiaoLiuRen(nowDate()); },
  geomancy: (m) => { const b = $('#geomancy-body'); if (b) b.innerHTML = m.renderGeomancy(); },
  tibetan: (m) => { const b = $('#tibetan-body'); if (b) b.innerHTML = m.renderTibetan(); },
  tarot: (m) => { const b = $('#tarot-body'); if (b) { b.innerHTML = m.renderTarot(); m.mountTarot(); } },
};
/** 视图 → 复现码导出的名字（在已装模块上取，未装返回 null，不炸） */
const CODE_NAME = {
  bazi: 'baziCode', meihua: 'meiHuaCode', qimen: 'qiMenCode', astro: 'astroCode',
  vedic: 'vedicCode', zhuyou: 'zhuyouCode', yangzhai: 'yangzhaiCode', ziwei: 'ziweiCode',
  cards: 'cardsCode', sky: 'skyCode', mansion: 'mansionCode', daliuren: 'daLiuRenCode',
  xiaoliuren: 'xiaoLiuRenCode', geomancy: 'geomancyCode', tibetan: 'tibetanCode',
  tarot: 'tarotCodeInfo', globe: null,
};

const CSS_LOADED = new Set();
/** 视图专属样式只插一次（插失败不拦渲染，最差是少点装饰） */
function loadViewCss(name) {
  const href = VIEW_CSS[name];
  if (!href || CSS_LOADED.has(name)) return Promise.resolve();
  CSS_LOADED.add(name);
  return new Promise((res) => {
    const l = document.createElement('link');
    l.rel = 'stylesheet';
    l.href = href;
    l.onload = () => res();
    l.onerror = () => { CSS_LOADED.delete(name); res(); };
    document.head.appendChild(l);
  });
}

/** 懒装一个视图：模块 + 专属样式 + 一次性容器级绑定 */
function loadView(name) {
  if (VM[name]) return Promise.resolve(VM[name]);
  // sky 不是视图模块而是首屏就装好的天象组件（首页天象条要用）
  if (name === 'sky') return VM.sky ? Promise.resolve(VM.sky) : Promise.reject(new Error('天象模块未就绪'));
  const key = VIEW_KEY[name];
  if (!key) return Promise.reject(new Error(`未知视图：${name}`));
  if (!VPENDING[name]) {
    VPENDING[name] = Promise.all([loadViewCss(name), import(SPECS[key])])
      .then(([, m]) => {
        VM[name] = m;
        try { if (VIEW_INIT[name]) VIEW_INIT[name](m); }
        catch (e) { console.warn('[qintian] 视图初始化失败', name, e); }
        return m;
      })
      .catch((e) => { delete VPENDING[name]; throw e; });
  }
  return VPENDING[name];
}

/** astromodes（36 盘型键 / 本命2 / 重置城市）只在占星页用得到，跟着 astro 一起懒装 */
let _astroMods = null;
function astroMods() {
  if (!_astroMods) _astroMods = import('./astromodes.js?v=133');
  return _astroMods;
}

/** 重排当前视图（时间条 / 复现码 / 地点变更都走这里；模块没装完就先装） */
async function rerender(name) {
  try {
    const m = await loadView(name);
    const fn = RENDER[name];
    if (!fn) return;
    try { fn(m); } catch (e) {
      console.warn('[qintian] 视图渲染失败', name, e);
      showError(e, { title: `${PANE_LABEL[name] || '这一页'}没能渲染出来`, container: paneBody(name) });
    }
  } catch (e) {
    console.warn('[qintian] 视图模块加载失败', name, e);
    showError(e, { title: `${PANE_LABEL[name] || '这一页'}没能加载出来`, container: paneBody(name) });
  }
}

/** 逐个动态加载：失败不收摊，全部收齐后一次性报出失败文件清单 */
async function loadModules() {
  const out = {};
  const fails = [];
  await Promise.all(Object.entries(SPECS).filter(([k]) => CORE_KEYS.has(k)).map(async ([k, spec]) => {
    try { out[k] = await import(spec); }
    catch (e) { fails.push({ spec, e }); }
  }));
  if (fails.length) {
    const err = new Error(fails.map((f) => `${f.spec}: ${(f.e && f.e.message) || f.e}`).join(' | '));
    // 追究根因：真 404 的那个文件比「被牵连的 20 个视图」有用得多
    let root = [];
    try { root = await probeBroken(fails.map((f) => f.spec)); } catch { /* ignore */ }
    err.files = root.length ? root : fails.map((f) => f.spec.replace(/\?v=\d+$/, ''));
    throw err;
  }
  return out;
}

/* 模块导出在这里先声明、boot() 里赋值：顶层函数都闭包引用它们，boot 之前不会被调用 */
let civilDate, civilFromAt, tzSnapshotFor, tzSnapshotOfCivil, civilInCity, birthArgs, nowGeoArgs, panTimeArgs, buildCode, LEGACY_NOTICE, exportCaseBundle, importCaseBundle, exportFileName,
  $, $$, cfg, saveCfg, current, panAt, setPanAt, resetPanAt, birthDate, nowDate, resolveCastDate, copyText, toast, pad, parseLocalDateTime, toLocalInputValue, fmtMoment, escapeHtml, toSec, paipanZi, updateHome, currentTimeGua, homeCopyText, renderPan, copyCurrent, renderBazi, baziCopyText, baziCode, renderMeiHua, meiHuaCopyText, meiHuaCode, renderHeCan, initHeCan, renderQiMen, qiMenCopyText, qiMenCode, renderAstro, astroCopyText, astroCode, setAstroStyle, ASTRO_MODE_KEY, B2_KEY, RESET_KEY, renderVedic, vedicCopyText, vedicCode, renderZhuyou, zhuyouCopyText, zhuyouCode, renderYangzhai, initYangzhai, yangzhaiCopyText, yangzhaiCode, restoreYangzhai, renderZiwei, ziweiCopyText, ziweiCode, initInteract, renderCards, cardsCopyText, cardsCode, restoreCards, renderSky, renderHomeSky, skyCopyText, skyCode, renderGlobe, globeCopyText, renderMansion, initMansionInteract, mansionCopyText, mansionCode, initCast, resetCast, encodeCode, decodeCode, RULE_VERSION, initForceRefresh, shouldSkipAutoReload, initTips, initGuides, loadCases, loadCase, saveCase, updateCase, togglePin, removeCase, clearUnpinned, caseStats, fmtAt, KINDS, KIND_LABEL, KIND_MARK, AUTO_KEEP, renderAsk, bindAsk, renderClassic, bindClassic, renderClassicDetail, bindClassicDetail, mountPlaceBars, bindPlaceChip, onPlaceChange, initRitual, isCasted, castDone, resetGate, RITUAL_PAGES, renderMoreCards, renderDaLiuRen, daLiuRenCopyText, daLiuRenCode, renderXiaoLiuRen, xiaoLiuRenCopyText, xiaoLiuRenCode, renderGeomancy, geomancyCopyText, initGeomancy, geomancyCode, restoreGeomancy, renderTibetan, tibetanCopyText, initTibetan, tibetanCode, restoreTibetan, renderTarot, tarotCopyText, tarotCodeInfo, restoreTarot, isTarotDeck, initTarot, mountTarot;
let PANES = null;
/* 错误边界（js/errors.js）：与视图模块一起在 boot() 里装入 */
let showError, errorHtml, renderWarnings, esc, showLoading, hideLoading, refreshScrollLock, clearRenderError, takeRenderError;

const SRC_LABEL = { coins: '摇铜钱', tianji: '天机', manual: '手录', time: '天时' };
const NO_Q = '未填写所占之事';

// 主 tab（底部栏对应）与全屏子视图分开
const TAB_VIEWS = ['home', 'classic', 'ask', 'cast', 'history'];
let lastTab = 'home';
let caseFilter = 'all';
let sheetKind = null;
let currentCodeWarns = [];
/* 案例满额顶掉的条数：等「已按码复现」那条 toast 播完再一起说，
   否则刚弹出来就被下一句 toast 顶掉，用户永远看不到（r6_compat.md P1-2） */
let pendingEvicted = 0;
/**
 * toast 出口统一拼尾巴：不管下一步弹的是「已按码复现」还是「已还原牌局」，
 * 只要这一轮顶掉过旧案例，就必须在同一句里说出来，不能被下一句 toast 冲掉。
 */
function wrapToast(fn) {
  return (msg) => {
    const tail = pendingEvicted ? ` · 案例已满，已删除最旧 ${pendingEvicted} 条（星标不删）` : '';
    pendingEvicted = 0;
    return fn(tail ? `${msg}${tail}` : msg);
  };
}

// 各盘：码数据提供者 + 重渲染（时间条 / 复现码统一走这里）

/* ============================ 视图切换 ============================ */
function switchView(name) {
  if (TAB_VIEWS.includes(getActiveView())) lastTab = getActiveView();
  $$('.view').forEach((v) => v.classList.toggle('active', v.id === `view-${name}`));
  $$('.tabbar .tab').forEach((t) => t.classList.toggle('active', t.dataset.view === name));
  $('.tabbar').style.display = TAB_VIEWS.includes(name) ? '' : 'none';
  // v115：子视图/全屏牌桌显示右下角返回主页悬浮按钮，四个主 tab 页隐藏
  const gback = $('#global-back');
  if (gback) {
    gback.classList.toggle('show', !TAB_VIEWS.includes(name));
    // 塔罗全屏牌桌右下自带展牌切换圆钮且牌桌底抬高 56px，home 键需再上移避让
    gback.classList.toggle('tarot-table', name === 'tarot');
  }
  window.scrollTo(0, 0);
  if (name === 'home') { updateHome(); refreshHomeSky(); }
  if (name === 'history') renderHistory();
  if (name === 'cast') resetCast();
  if (name === 'ask') renderAsk();
  if (name === 'classic') {
    const b = $('#classic-body');
    if (VM.classic) { if (b) b.innerHTML = VM.classic.renderClassic(); }
    else if (b && !b.innerHTML.trim()) b.innerHTML = '<div class="view-loading">正在打开</div>';
    if (!VM.classic) loadView('classic').then((m) => { if (b) b.innerHTML = m.renderClassic(); }).catch((e) => {
      console.warn('[qintian] 观心模块加载失败', e);
      showError(e, { title: '观心没能加载出来', container: b });
    });
  }
}

const PANE_LABEL = {
  bazi: '八字', meihua: '梅花', qimen: '奇门', hecan: '多盘合参', astro: '星盘', vedic: '印度占星',
  zhuyou: '祝由', yangzhai: '阳宅', ziwei: '紫微', cards: '卡牌', sky: '星空', globe: '天球仪',
  mansion: '星官', daliuren: '大六壬', xiaoliuren: '小六壬', geomancy: '地占', tibetan: '藏占',
  tarot: '塔罗', pan: '六爻', liuyao: '六爻', history: '案例', ask: '问问', classic: '观心', cast: '起卦',
};

/** 这一页是不是还停在「起盘门」上（没动手就没结果，别留档） */
function atGate(name) {
  if (!RITUAL_PAGES.includes(name)) return false;
  try { if (isCasted(name)) return false; } catch { return false; }
  return true;
}

/** 该页的结果容器（错误贴回各自的盘面区，而不是全屏盖掉） */
function paneBody(name) {
  return document.getElementById(`${name}-body`) || null;
}

/**
 * 打开子视图（P0-1 懒加载）：先切页给出反馈，再装模块、渲染。
 * 只有被点开的那个视图才会 import 它自己的模块与专属样式。
 */
async function openSubview(name, opts = {}) {
  syncTimeBars();
  let m = null;
  try {
    m = await loadView(name);
  } catch (e) {
    // 模块没到：贴回该盘面区，别白屏
    console.warn('[qintian] 视图模块加载失败', name, e);
    try { switchView(name); } catch { /* ignore */ }
    showError(e, { title: `${PANE_LABEL[name] || '这一页'}没能加载出来`, container: paneBody(name) });
    return;
  }
  try {
    RENDER[name](m);
  } catch (e) {
    // P0-2：视图抛错不得白屏、不得把这次点击整个吞掉——贴回该盘面区，再切过去
    console.warn('[qintian] 视图渲染失败', name, e);
    showError(e, { title: `${PANE_LABEL[name] || '这一页'}没能渲染出来`, container: paneBody(name) });
  }
  try { switchView(name); } catch (e) {
    showError(e, { title: '页面切换失败', container: paneBody(name) });
    $$('.view').forEach((v) => v.classList.toggle('active', v.id === `view-${name}`));
  }
  // P1-2：只在真正排到结果时才留档；停在起盘门 / 渲染出错都不写案例
  const renderFailed = takeRenderError();
  if (name !== 'cards' && opts.save !== false && !atGate(name) && !renderFailed) autoSave(name); // 每排一盘即自动留档
}

function getActiveView() {
  const a = $('.view.active');
  return a ? a.id.replace('view-', '') : 'home';
}

function refreshHomeSky() {
  // renderHomeSky 内部直接写入 #home-sky，无返回值
  renderHomeSky();
}

/* ============================ 时间条 ============================ */
function syncTimeBars() {
  $$('.time-bar').forEach((bar) => {
    const scope = bar.dataset.scope;
    const input = bar.querySelector('.tb-input');
    if (!input) return;
    const d = scope === 'birth' ? birthDate() : nowDate();
    input.value = toLocalInputValue(d);
  });
}

function bindTimeBars() {
  $$('.time-bar').forEach((bar) => {
    const name = bar.id.replace('tb-', '');
    const scope = bar.dataset.scope;
    const input = bar.querySelector('.tb-input');
    const pane = PANES[name];
    if (!pane || !input) return;

    /** 排一次盘并归类：noCast（还在起盘门）/ failed / ok */
    const render = async () => {
      if (atGate(name)) {
        toast('这一盘还没起——请点页面中间的「起盘」按钮');
        const g = document.querySelector(`#${name}-body [data-rt-start]`);
        if (g) { g.classList.add('qt-nudge'); setTimeout(() => g.classList.remove('qt-nudge'), 1600); try { g.focus(); } catch { /* ignore */ } }
        return 'noCast';
      }
      clearRenderError();
      try {
        // await：视图是懒加载的，渲染在 promise 里跑；不等它，下面的 takeRenderError 一定读不到
        await pane.render();
      } catch (e) {
        showError(e, { title: `${PANE_LABEL[name] || '这一盘'}没能排出来`, container: paneBody(name) });
        return 'failed';
      }
      // 视图内部自带 try/catch 的（紫微/星盘/吠陀）在这里留下标记
      if (takeRenderError()) return 'failed';
      return 'ok';
    };

    bar.querySelector('[data-act="reset"]').addEventListener('click', async () => {
      clearTzWarn();
      resetPanAt(scope);
      if (scope === 'birth') panAt.geo = null;
      syncTimeBars();
      if ((await render()) === 'ok') {
        autoSave(name);
        toast(scope === 'birth' ? '已回到默认出生时刻' : '已回到此刻');
      }
    });

    bar.querySelector('[data-act="go"]').addEventListener('click', async () => {
      const d = parseLocalDateTime(input.value);
      if (!d) { toast('时间无效，请重新选择'); input.focus(); return; }
      clearTzWarn();
      setPanAt(scope, d);
      if (scope === 'birth') panAt.geo = null; // 手动改时刻即放弃码里带的经纬度
      const st = await render();
      // P1-2：失败时不弹「已按…排盘」的成功 toast（紫微非法日期曾红字 + 成功提示并存）
      if (st === 'ok') {
        autoSave(name);
        toast(`已按 ${fmtMoment(d)} 排盘`);
      } else if (st === 'failed') {
        toast('这个时刻排不出来，看盘面上的红色说明');
      }
    });
  });
}

/* ============================ 复现码 ============================ */
function liuyaoCode() {
  const p = current.pan;
  const m = current.meta;
  if (!p || !m) return null;
  const ys = m.yaoValues || p.yaoValues || null;
  if (!ys || ys.length !== 6) return null;
  const q = (p.question && p.question !== NO_Q) ? p.question : '';
  return {
    kind: 'liuyao',
    data: { at: toSec(m.castAt), source: m.source, yaoValues: ys, question: q },
    title: `${p.benGua.name}${p.bianGua ? ` 之 ${p.bianGua.name}` : ''}`,
    sub: `${fmtMoment(new Date(m.castAt))} · ${SRC_LABEL[m.source] || m.source}${q ? ' · ' + q : ''}`,
  };
}

// v121 复现码 v2：把码里携带的计算配置写回本地设置，让「复现」复现的是同一盘
function applyCodeCfg(d) {
  if (!d || d.version < 2) return;
  if (d.lateZi && cfg.lateZi !== d.lateZi) { cfg.lateZi = d.lateZi; saveCfg(); }
  if (cfg.apparentSolarTime !== !!d.apparentSolarTime) { cfg.apparentSolarTime = !!d.apparentSolarTime; saveCfg(); }
  if (d.geo) panAt.geo = { longitude: d.geo.lon, latitude: d.geo.lat, place: `${d.geo.lon.toFixed(2)}°E ${d.geo.lat.toFixed(2)}°N` };
}

const BIRTH_KINDS = new Set(['bazi', 'ziwei', 'astro', 'vedic']);

/**
 * 把「这次排盘用的城市 / 时区 / 经纬度」整份补进码里。
 * 只存绝对秒的 v2 码换台机器打开就是另一个盘（r6_compat.md P0），
 * 所以钟面分量 + 城市 + 时区 + 偏移 + 经纬度一项都不能少。
 * 视图自己算出的经纬度优先，这里只补空缺。
 */
function withTzSnapshot(info, kind) {
  const d = info && info.data;
  if (!d) return info;
  const birth = BIRTH_KINDS.has(kind);
  const atSec = Number.isFinite(d.at) ? (d.at < 1e11 ? d.at : Math.round(d.at / 1000)) : null;
  // 出生盘：钟面就是排盘实际吃进去的年月日时分——它跨时区也不能变，
  // 所以绝不能用 new Date(at) 在本机时区里反推（这正是旧码的病根）。
  const geo = birth ? birthArgs() : nowGeoArgs();
  let civil = null;
  if (birth && geo && Number.isInteger(geo.year)) {
    civil = { y: geo.year, mo: geo.month, d: geo.day, h: geo.hour, mi: geo.minute };
  } else if (atSec != null) {
    civil = civilFromAt(atSec);
  }
  const snap = civil ? tzSnapshotOfCivil(civil, geo || {}) : null;
  if (civil && d.civil == null) d.civil = civil;
  if (snap) {
    if (d.city == null) d.city = snap.city;
    if (d.tz == null) d.tz = snap.tz;
    if (d.tzOffsetMinutes == null) d.tzOffsetMinutes = snap.tzOffsetMinutes;
    if (d.tzEstimated == null) d.tzEstimated = snap.tzEstimated;
    if (d.inDst == null) d.inDst = !!snap.inDst;
    if (d.lon == null && Number.isFinite(snap.lon) && Number.isFinite(snap.lat)) { d.lon = snap.lon; d.lat = snap.lat; }
    info.tzWarnings = snap.warnings || [];
  }
  return info;
}

/** 码里的地理/时区 → panAt.geo（birthArgs/nowGeoArgs 会原样交给核心） */
function codeGeo(d) {
  if (!d) return null;
  const hasLL = Number.isFinite(d.lon) && Number.isFinite(d.lat);
  if (!d.city && !hasLL) return null;
  const g = {
    city: d.city || undefined,
    place: d.city || (hasLL ? `${d.lon.toFixed(2)}°E ${d.lat.toFixed(2)}°N` : undefined),
    // 用码里记下的生效偏移，不再按城市重新查一遍（查表可能和当年规则不一致）
    utcOffsetHours: Number.isFinite(d.tzOffsetMinutes) ? d.tzOffsetMinutes / 60 : undefined,
  };
  if (hasLL) { g.lat = d.lat; g.latitude = d.lat; g.lon = d.lon; g.lonEast = d.lon; g.longitude = d.lon; }
  return g;
}

function codeInfo(kind) {
  const src = kind === 'liuyao' ? liuyaoCode : (PANES[kind] && PANES[kind].code);
  if (!src) return null;
  try {
    const info = src();
    // v121 复现码 v2：统一注入计算配置（晚子时流派 / 真太阳时 / 观测地）
    if (info && info.data) {
      if (info.data.lateZi == null) info.data.lateZi = cfg.lateZi;
      if (info.data.apparentSolarTime == null) info.data.apparentSolarTime = !!cfg.apparentSolarTime;
      if (kind !== 'astro' && info.data.lon == null && panAt.geo && Number.isFinite(panAt.geo.longitude)) {
        info.data.lon = panAt.geo.longitude;
        info.data.lat = panAt.geo.latitude;
      }
      withTzSnapshot(info, kind);
    }
    return info;
  } catch (e) { console.warn('[qintian] 生成码失败', kind, e); return null; }
}

/** 每排一盘自动留档；星标的不会被顶掉 */
function autoSave(kind) {
  const info = codeInfo(kind);
  if (!info) return null;
  try {
    const code = encodeCode(info.kind, info.data);
    const c = saveCase({ kind: info.kind, code, title: info.title, sub: info.sub, castAt: info.data.at });
    current.caseId = c.id;
    updatePinBtn();
    // 不再静默淘汰：案例满额顶掉最旧一条时必须说一声（r6_compat.md P1-2）
    if (c.evicted) pendingEvicted += c.evicted;
    return c;
  } catch (e) { console.warn('[qintian] 自动留档失败', kind, e); return null; }
}

function openSheet(kind) {
  sheetKind = kind;
  $('#cs-hint').textContent = '';
  $('#cs-hint').classList.remove('err');
  $('#cs-input').value = '';
  const curBlock = $('#cs-cur-block');
  if (kind && kind !== 'input') {
    const info = codeInfo(kind);
    let code = '—';
    let warns = [];
    if (info) {
      try {
        const b = buildCode(info.kind, info.data);
        code = b.code;
        warns = b.warnings.concat(info.tzWarnings || []);
      } catch { code = '—'; }
    }
    currentCodeWarns = warns;
    $('#cs-cur').textContent = code;
    setHint(warns.length ? warns.join('；') : '', false);
    $('#cs-title').textContent = `${KIND_LABEL[kind] || '盘'} · 复现码`;
    curBlock.style.display = '';
    $('#cs-pin').style.display = code === '—' ? 'none' : '';
  } else {
    $('#cs-title').textContent = '输入复现码';
    curBlock.style.display = 'none';
  }
  $('#code-sheet').classList.add('open');
}

function closeSheet() {
  $('#code-sheet').classList.remove('open');
}

function setHint(msg, isErr = false) {
  const h = $('#cs-hint');
  h.textContent = msg || '';
  h.classList.toggle('err', !!isErr);
}

/* ============================ 时区提示横幅 ============================ */
// 旧码（QT1）没有时区信息、码里的时区是估算值、经纬度是兜底值……
// 这些都必须「写在页面上」，不能只弹一个转头就没的 toast（r6_compat.md P0/P1-1）。
let tzWarnRetz = null;

function setTzWarn(msg, retz = null) {
  const box = $('#tz-warn');
  if (!box) return;
  $('#tz-warn-text').textContent = msg || '';
  tzWarnRetz = retz;
  const form = $('#tz-warn-form');
  if (form) form.style.display = retz ? '' : 'none';
  box.hidden = !msg;
  box.classList.toggle('on', !!msg);
}

function clearTzWarn() {
  tzWarnRetz = null;
  const box = $('#tz-warn');
  if (!box) return;
  box.hidden = true;
  box.classList.remove('on');
  const t = $('#tz-warn-text');
  if (t) t.textContent = '';
}

/** 旧码带上城市后重算：解出该城市的钟面 → 生成 QT2 码 → 走正常打开流程 */
async function retzLegacy() {
  const d = tzWarnRetz;
  if (!d) return;
  const city = (($('#tz-warn-city') && $('#tz-warn-city').value) || '').trim();
  if (!city) { toast('先填一个城市，如 上海 / 纽约 / 开罗'); return; }
  // 旧码只知道「绝对秒」，先按城市解出这一刻的钟面
  const r = civilInCity(d.utcMs, city);
  if (!r) { toast(`查不到「${city}」的时区，换个写法试试`); return; }
  // 时区、偏移、经纬度一起补：只补时区的话，真太阳时/上升点仍会按本机默认地算
  const snap = tzSnapshotOfCivil(r.civil, { ...(d.extra || {}), city });
  let code;
  try {
    code = buildCode(d.kind, {
      ...d.extra,
      civil: snap.civil,
      city: snap.city || city,
      tz: snap.tz,
      tzOffsetMinutes: snap.tzOffsetMinutes,
      tzEstimated: snap.tzEstimated,
      inDst: snap.inDst,
      lon: snap.lon ?? undefined,
      lat: snap.lat ?? undefined,
    }).code;
  } catch (e) { toast(`重算失败：${e.message || e}`); return; }
  await openByCode(code);
  toast(`已按 ${snap.city || city} ${snap.tz} 重算为 QT2 码`);
}

/** 旧码里能带到新码的字段（性别/经纬度/卦象…） */
function legacyExtra(d) {
  const keys = ['gender', 'lon', 'lat', 'geoFallback', 'source', 'yaoValues', 'question',
    'deckId', 'spreadIndex', 'cards', 'mothers', 'qHouse', 'mode', 'coin', 'dice',
    'facingDeg', 'rooms', 'built', 'personY', 'personG', 'shapes', 'lateZi', 'apparentSolarTime'];
  const out = {};
  for (const k of keys) if (d[k] != null) out[k] = d[k];
  return out;
}

/* ============================ 星标备注弹窗 ============================ */
let noteTargetId = null;
function openNoteSheet(id) {
  const c = loadCase(id);
  if (!c) return;
  noteTargetId = id;
  $('#nt-title').textContent = c.pinned ? '星标备注' : '星标此案例';
  $('#nt-label').textContent = c.pinned
    ? '备注（星标案例永久保留，改完点保存星标）'
    : '星标案例会永久保留，先写个备注方便日后辨认（必填）';
  $('#nt-input').value = c.note || c.question || '';
  $('#nt-hint').textContent = '';
  $('#nt-hint').classList.remove('err');
  $('#nt-ok').textContent = c.pinned ? '保存星标' : '★ 星标留存';
  $('#nt-unpin').style.display = c.pinned ? '' : 'none';
  $('#note-sheet').classList.add('open');
  try { $('#nt-input').focus(); } catch { /* 桩环境无 focus */ }
}
function closeNoteSheet() {
  $('#note-sheet').classList.remove('open');
  noteTargetId = null;
}
function confirmNote() {
  const v = $('#nt-input').value.trim();
  if (!v) {
    $('#nt-hint').textContent = '星标案例必须写个备注，不然时间长了认不出来';
    $('#nt-hint').classList.add('err');
    return;
  }
  const c0 = loadCase(noteTargetId);
  if (!c0) { closeNoteSheet(); return; }
  // 六爻案例：备注同时写进事由并重算复现码，保证「码=案例」仍可复现
  if (c0.kind === 'liuyao') {
    try {
      const d = decodeCode(c0.code);
      // 钟面以码为准（QT1 老码没有钟面，才退回本机时区）
      const at = civilDate(d.civil) || new Date(d.at);
      const pan = paipanZi({
        yaoValues: d.yaoValues,
        ...panTimeArgs(at), // 复现码的钟面 + 码里观测地（applyCodeCfg 已落地）→ 与当初同盘
        gender: cfg.gender, question: v,
      });
      // 重排后必须仍是 QT2 码：钟面 + 时区一起带上，别把复现码打回「只存绝对秒」
      const code = buildCode('liuyao', {
        at: d.at, source: d.source, yaoValues: d.yaoValues, question: v,
        civil: d.civil || undefined,
        city: d.city || undefined, tz: d.tz || undefined,
        tzOffsetMinutes: Number.isFinite(d.tzOffsetMinutes) ? d.tzOffsetMinutes : undefined,
        tzEstimated: d.tzEstimated, inDst: d.inDst,
      }).code;
      updateCase(noteTargetId, {
        note: v, question: v, pinned: true, code,
        title: `${pan.benGua.name}${pan.bianGua ? ` 之 ${pan.bianGua.name}` : ''}`,
        sub: `${fmtMoment(at)} · ${SRC_LABEL[d.source] || d.source} · ${v}`,
      });
    } catch {
      updateCase(noteTargetId, { note: v, question: v, pinned: true });
    }
    if (current.caseId === noteTargetId && current.pan) {
      current.pan.question = v;
      $('#question-input').value = v;
    }
  } else {
    updateCase(noteTargetId, { note: v, pinned: true });
  }
  if (current.caseId === noteTargetId) updatePinBtn();
  renderHistory();
  closeNoteSheet();
  toast('已星标，不会被顶掉');
}

/** 粘贴一个码，还原对应的整盘 */
/** 按复现码还原（P0-1 懒加载后改为 async：先装对应视图模块再还原） */
async function openByCode(raw) {
  let d;
  try { d = decodeCode(raw); }
  catch (e) { setHint(e.message || '码无法识别', true); return; }
  // QT2 码自带钟面：一律按码里的年月日时分复现，与本机时区无关。
  // QT1 码只有绝对秒，只能按本机时区还原（钟面会跟着设备时区变），必须挂横幅。
  const at = civilDate(d.civil) || new Date(d.at);
  clearTzWarn();
  applyCodeCfg(d); // 码里的计算配置（晚子时/真太阳时/观测地/时区）先落地再排盘
  const staleNote = d.ruleStale ? `（此码规则 v${d.ruleVersion}，当前 v${RULE_VERSION}，结果或有差异）` : '';
  if (d.warnings && d.warnings.length) {
    const needCity = d.legacy && BIRTH_KINDS.has(d.kind);
    setTzWarn(
      d.warnings.join('；') + (needCity ? '。补一个出生城市可精确重算：' : ''),
      needCity ? { utcMs: d.at, kind: d.kind, extra: legacyExtra(d) } : null,
    );
  }

  if (d.kind === 'liuyao') {
    if (!d.yaoValues) { setHint('码里没有六爻数据', true); return; }
    const pan = paipanZi({
      yaoValues: d.yaoValues,
      ...panTimeArgs(at), // 同上：钟面 + 码里观测地 → 与当初同盘（改前只给钟面，天文时异地的盘会漂）
      gender: cfg.gender, question: d.question || NO_Q,
    });
    current.pan = pan;
    current.meta = { source: d.source || 'manual', castAt: d.at, yaoValues: d.yaoValues };
    current.caseId = null;
    renderPan();
    switchView('pan');
    $('#question-input').value = d.question || '';
    autoSave('liuyao');
    closeSheet();
    toast('已按码复现此卦' + staleNote);
    return;
  }

  if (BIRTH_KINDS.has(d.kind)) {
    setPanAt('birth', at);
    panAt.geo = null;
    if (d.gender) { cfg.gender = d.gender; saveCfg(); }
    // 城市 + 时区 + 经纬度一起写回，八字/紫微/星盘/吠陀才按原盘算（缺时区就会各算各的）
    const geo = codeGeo(d);
    if (geo) panAt.geo = geo;
  } else if (d.kind === 'meihua' || d.kind === 'qimen' || d.kind === 'daliuren' || d.kind === 'xiaoliuren' || d.kind === 'sky') {
    // 时刻类：钟面按码还原；观测地/时区也照码，否则节气与时辰会按本机算
    setPanAt('now', at);
    const geo = codeGeo(d);
    if (geo) panAt.geo = geo;
  }

  closeSheet();
  if (d.kind === 'cards') {
    // v121 双轨：带 deckId 的是新塔罗牌局 → 塔罗视图；否则按旧卡牌视图还原
    if (d.deckId) {
      // P0-1 懒加载：先装 tarot 模块再判牌组（isTarotDeck / restoreTarot 都在它里面）
      const tm = await loadView('tarot').catch(() => null);
      if (!tm) { toast('塔罗模块没能加载，稍后再试'); return; }
      if (tm.isTarotDeck(d.deckId)) {
        if (!tm.restoreTarot(d.spreadIndex, d.cards || [], d.deckId)) { toast('牌局还原失败'); return; }
        await openSubview('tarot');
        autoSave('cards');
        toast('已还原牌局' + staleNote);
        return;
      }
    }
    await openSubview('cards');
    const ok = VM.cards && VM.cards.restoreCards(d.spreadIndex, d.cards || []);
    if (!ok) { toast('牌局还原失败'); return; }
    autoSave('cards');
    toast('已还原牌局' + staleNote);
    return;
  }
  if (d.kind === 'geomancy') {
    const gm = await loadView('geomancy').catch(() => null);
    if (!gm) { toast('地占模块没能加载，稍后再试'); return; }
    if (!gm.restoreGeomancy(d.mothers, d.qHouse, d.question)) { toast('地占还原失败'); return; }
    await openSubview('geomancy');
    autoSave('geomancy');
    toast('已还原地占盘' + staleNote);
    return;
  }
  if (d.kind === 'tibetan') {
    const tb = await loadView('tibetan').catch(() => null);
    if (!tb) { toast('藏占模块没能加载，稍后再试'); return; }
    if (!tb.restoreTibetan(d.mode, d.dice, d.coin, d.question)) { toast('藏占还原失败'); return; }
    await openSubview('tibetan');
    autoSave('tibetan');
    toast('已还原藏占' + staleNote);
    return;
  }
  if (d.kind === 'yangzhai') {
    const yz = await loadView('yangzhai').catch(() => null);
    if (!yz) { toast('阳宅模块没能加载，稍后再试'); return; }
    if (!yz.restoreYangzhai(d)) { toast('宅盘还原失败'); return; }
    await openSubview('yangzhai');
    autoSave('yangzhai');
    toast('已还原宅盘' + staleNote);
    return;
  }
  if (RITUAL_PAGES.includes(d.kind)) castDone(d.kind); // 复现码直入，不走起盘门
  await openSubview(d.kind === 'sky' ? 'mansion' : d.kind);
  toast('已按码复现' + staleNote);
}

/* ============================ 案例库 ============================ */
function renderHistory() {
  const list = loadCases();
  const box = $('#history-list');
  const st = caseStats();

  $('#case-stat').textContent =
    `共 ${st.total} 条 · 星标 ${st.pinned} 条（星标不会被顶掉）· 其余自动保留最近 ${st.keep} 条`;

  const counts = {};
  list.forEach((c) => { counts[c.kind] = (counts[c.kind] || 0) + 1; });
  const chips = [{ id: 'all', label: '全部', n: list.length }];
  if (st.pinned) chips.push({ id: '★', label: '★ 星标', n: st.pinned });
  KINDS.forEach((k) => { if (counts[k.id]) chips.push({ id: k.id, label: k.label, n: counts[k.id] }); });
  if (!chips.some((c) => c.id === caseFilter)) caseFilter = 'all';

  $('#case-filter').innerHTML = chips
    .map((c) => `<button class="cf-chip ${caseFilter === c.id ? 'on' : ''}" data-f="${c.id}">${c.label}<span class="cf-n">${c.n}</span></button>`)
    .join('');

  const show = list.filter((c) => (
    caseFilter === 'all' ? true : caseFilter === '★' ? c.pinned : c.kind === caseFilter
  ));

  if (!show.length) {
    box.innerHTML = `<div class="h-empty">还没有案例<br/>排任意一盘都会自动留档<br/>点 ★ 的会永久保留</div>`;
    return;
  }

  box.innerHTML = show.map((c) => `
    <div class="h-item ${c.pinned ? 'pinned' : ''}" data-id="${c.id}">
      <div class="h-top">
        <span class="h-kind">${KIND_MARK[c.kind] || ''} ${KIND_LABEL[c.kind] || c.kind}</span>
        <span class="h-gua">${escapeHtml(c.title)}</span>
        <span class="h-time">${fmtAt(c.createdAt)}</span>
      </div>
      ${c.note ? `<div class="h-note">★ ${escapeHtml(c.note)}</div>` : ''}
      ${(!c.note && c.sub) ? `<div class="h-sub"><span class="h-q">${escapeHtml(c.sub)}</span></div>` : ''}
      <div class="h-acts">
        <button class="h-act star ${c.pinned ? 'on' : ''}" data-act="pin">${c.pinned ? '★ 已星标' : '☆ 星标'}</button>
        <button class="h-act" data-act="code">复制码</button>
        <button class="h-act" data-act="del">删除</button>
      </div>
    </div>`).join('');
}

function onHistoryClick(e) {
  const chip = e.target.closest('.cf-chip');
  if (chip) { caseFilter = chip.dataset.f; renderHistory(); return; }

  const item = e.target.closest('.h-item');
  if (!item) return;
  const id = item.dataset.id;
  const act = e.target.closest('[data-act]');

  if (act) {
    const a = act.dataset.act;
    if (a === 'pin') {
      openNoteSheet(id);
    } else if (a === 'code') {
      const c = loadCase(id);
      if (c) copyText(c.code, act);
    } else if (a === 'del') {
      if (confirm('删除这条案例？（星标与否都会被删）')) { removeCase(id); renderHistory(); }
    }
    return;
  }

  const c = loadCase(id);
  if (c) openByCode(c.code);
}

/* ============================ 排盘 ============================ */
// cast = 引擎 CastResult {yaoValues,...}；source 标识入口；castDate=录入钟面（折算交内核）
function goPan(cast, source, castDate) {
  // 六爻的时间入口（audit4 · fix_r4）：castDate 是**录入钟面**，
  // 真太阳时/历史时区/夏令时/23 点换日一律由 panTimeArgs → 内核 civilForPaipan 折算一次。
  // 改前这里只传钟面分量、不给观测地，六爻的日月建与八字/大六壬/奇门各说各话。
  const d = new Date((castDate || new Date()).getTime());
  const pan = paipanZi({
    yaoValues: cast.yaoValues,
    ...panTimeArgs(d),
    gender: cfg.gender, question: NO_Q,
  });
  current.pan = pan;
  current.meta = { source, castAt: d.getTime(), yaoValues: cast.yaoValues };
  current.caseId = null;
  renderPan();
  switchView('pan');
  $('#question-input').value = '';
  autoSave('liuyao'); // 每一卦自动留档
}

function updatePinBtn() {
  const btn = $('#btn-pin');
  if (!btn) return;
  const c = current.caseId ? loadCase(current.caseId) : null;
  const on = !!(c && c.pinned);
  btn.textContent = on ? '★ 已星标' : '☆ 星标留存';
  btn.classList.toggle('copied', on);
}

/* ============================ 绑定 ============================ */
function bind() {
  // P1-2 统一 ESC：复现码面板 / 星标备注 / 地点弹层，一个键全关（此前只有观测地弹层能关）
  document.addEventListener('keydown', (e) => {
    if (e.key !== 'Escape' && e.key !== 'Esc') return;
    let handled = false;
    const sheet = document.querySelector('#code-sheet.open');
    if (sheet) { closeSheet(); handled = true; }
    const note = document.querySelector('#note-sheet.open');
    if (note) { note.classList.remove('open'); handled = true; }
    const pm = document.querySelector('.place-modal');
    if (pm) {
      const x = pm.querySelector('.pm-x, [data-pm-close]');
      if (x) x.click(); else pm.remove();
      handled = true;
    }
    refreshScrollLock();
    if (handled) e.preventDefault();
  });
  // 弹层打开时锁背景滚动（sheet/弹层增删后同步一次；计算遮罩由 showLoading 自己锁）
  document.addEventListener('click', () => setTimeout(refreshScrollLock, 0), true);
  refreshScrollLock();

  $$('.tabbar .tab').forEach((t) => t.addEventListener('click', () => switchView(t.dataset.view)));
  $('#pan-back').addEventListener('click', () => switchView(lastTab || 'cast'));
  // v115 全局右下角返回：主 tab 页回首页（隐藏不显示），子视图回上次主 tab
  const gb = $('#global-back');
  if (gb) gb.addEventListener('click', () => {
    if (TAB_VIEWS.includes(getActiveView())) switchView('home');
    else switchView(lastTab || 'home');
  });

  // 「问问」：选问题 → 推荐术数 → 跳到对应盘（不自动留档）
  bindAsk($('#view-ask'));
  // 经典板块（《论语》）：主视图与详情视图各自绑定一次，内部用事件委托
  // P0-1 懒加载：bindClassic/bindClassicDetail 随 classic 模块一起装（VIEW_INIT）
  document.addEventListener('qintian:classic-goto', (e) => {
    const v = e.detail && e.detail.view;
    if (v) switchView(v);
  });
  // 三幕式排盘：点「起盘」后进入盘面（再起一盘时重走门）
  initRitual(async (key) => {
    // 再起一盘：ritual 已清标记，render 回到起盘门；正常起盘：直接渲染盘面
    if (!PANES[key] || !PANES[key].render) return;
    clearRenderError();
    try {
      await PANES[key].render();
    } catch (e) {
      showError(e, { title: `${PANE_LABEL[key] || '这一盘'}没能排出来`, container: paneBody(key) });
      toast('这个时刻排不出来，看盘面上的红色说明');
      return;
    }
    // P0-2：视图内部兜住的错误（1582 这类越界年份）也要给一句提示，别让人以为排成功了
    if (takeRenderError()) {
      try { resetGate(key); } catch { /* ignore */ }
      toast('这个时刻排不出来，看盘面上的红色说明');
      return;
    }
    autoSave(key);
  });
  // 占星盘面样式切换（12 风格，document 级委托防 innerHTML 冲掉）
  document.addEventListener('click', (e) => {
    const btn = e.target.closest('[data-astyle]');
    if (btn) loadView('astro').then((m) => m.setAstroStyle(btn.dataset.astyle)).catch((err) => {
      showError(err, { title: '星盘样式没能切换', container: paneBody('astro') });
    });
  });
  // 占星盘面模式（36 种）/ 本命2 / 重置城市
  document.addEventListener('click', async (e) => {
    const mb = e.target.closest('[data-amode]');
    if (mb) {
      const mode = mb.dataset.amode;
      const { ASTRO_MODE_KEY } = await astroMods();
      try { localStorage.setItem(ASTRO_MODE_KEY, mode); } catch { /* 隐私模式 */ }
      // P1-1：日返盘要逐日比对太阳回归，十几秒的主线程计算。先画 loading 再让出一帧去算，
      // 否则用户看到的是「点了没反应」（审计 r3 实测 6.2s 后 1+1 探活超时）。
      const heavy = mode === 'solar' || mode === 'lunar' || mode === 'profection';
      if (heavy) {
        mb.classList.add('is-busy');
        showLoading(mode === 'solar' ? '正在算日返盘…' : '正在算盘…', '日返要逐日比对太阳回归时刻，通常十几秒，别关页面');
        setTimeout(() => {
          rerender('astro').finally(() => { hideLoading(); mb.classList.remove('is-busy'); });
        }, 60);
      } else {
        rerender('astro');
      }
      return;
    }
    const rs = e.target.closest('[data-areloc]');
    if (rs) {
      const { RESET_KEY } = await astroMods();
      try { localStorage.setItem(RESET_KEY, JSON.stringify({ city: rs.dataset.areloc })); } catch { /* ignore */ }
      if (rs.dataset.areloc !== '重置') {
        showLoading('正在按新地点重算…', '');
        setTimeout(() => { rerender('astro').finally(() => hideLoading()); }, 40);
      } else {
        rerender('astro');
      }
      return;
    }
    const sv = e.target.closest('[data-b2save]');
    if (sv) {
      const data = {};
      document.querySelectorAll('[data-b2k]').forEach((el) => { data[el.dataset.b2k] = el.value; });
      const { B2_KEY } = await astroMods();
      try{ localStorage.setItem(B2_KEY, JSON.stringify(data)); }catch{}
      rerender('astro');
    }
  });

  // 占星"重置城市"下拉（v111 起为全量城市选择）
  document.addEventListener('change', async (e) => {
    const rc = e.target.closest('#reloc-city');
    if (rc) {
      const { RESET_KEY } = await astroMods();
      try { localStorage.setItem(RESET_KEY, JSON.stringify({ city: rc.value })); } catch {}
      rerender('astro');
    }
  });

  document.addEventListener('qintian:ask-goto', (e) => {
    const v = e.detail && e.detail.view;
    if (!v) return;
    if (TAB_VIEWS.includes(v)) { switchView(v); return; }
    if (PANES[v]) openSubview(v, { save: false });
  });

  // 首页 / 各子视图入口与返回
  $$('.quick-btn').forEach((b) => b.addEventListener('click', () => openSubview(b.dataset.open)));
  // 起卦页「更多排盘」卡片（分组导航，委托绑定）
  renderMoreCards();
  const mcHost = $('#more-cards');
  if (mcHost) mcHost.addEventListener('click', (e) => {
    const btn = e.target.closest('[data-open]');
    if (btn) openSubview(btn.dataset.open);
  });
  $$('[data-back]').forEach((b) => b.addEventListener('click', () => switchView(lastTab || 'home')));

  // 各页一键复制（成功在按钮上即时反馈）；复制文本强制带复现码，
  // 顺手粘给 AI 后随时能在系统内还原这一盘。
  // P0-1 懒加载后这些函数不该在 bind() 时被解构（模块还没装），
  // 改为点击那一刻从 VM 里取——点「复制」时必然已经打开过那页。
  const copyBind = (id, view, textName, codeName) => {
    const el = document.getElementById(id);
    if (!el) return;
    el.addEventListener('click', () => {
      const m = VM[view];
      if (!m || typeof m[textName] !== 'function') { toast('这一页还没打开，先点开再复制'); return; }
      let text = m[textName]();
      if (codeName && m[codeName]) {
        try {
          const info = m[codeName]();
          if (info) text += `\n复现码：${encodeCode(info.kind, info.data)}\n`;
        } catch { /* 码不可用则忽略 */ }
      }
      copyText(text, el);
    });
  };
  copyBind('copy-bazi', 'bazi', 'baziCopyText', 'baziCode');
  copyBind('copy-meihua', 'meihua', 'meiHuaCopyText', 'meiHuaCode');
  copyBind('copy-qimen', 'qimen', 'qiMenCopyText', 'qiMenCode');
  copyBind('copy-astro', 'astro', 'astroCopyText', 'astroCode');
  copyBind('copy-vedic', 'vedic', 'vedicCopyText', 'vedicCode');
  copyBind('copy-zhuyou', 'zhuyou', 'zhuyouCopyText', 'zhuyouCode');
  copyBind('copy-yangzhai', 'yangzhai', 'yangzhaiCopyText', null);
  copyBind('copy-ziwei', 'ziwei', 'ziweiCopyText', 'ziweiCode');
  copyBind('copy-cards', 'cards', 'cardsCopyText', 'cardsCode');
  copyBind('copy-sky', 'sky', 'skyCopyText', 'skyCode');
  copyBind('copy-globe', 'globe', 'globeCopyText', null);
  copyBind('copy-mansion', 'mansion', 'mansionCopyText', 'mansionCode');
  copyBind('copy-daliuren', 'daliuren', 'daLiuRenCopyText', 'daLiuRenCode');
  copyBind('copy-xiaoliuren', 'xiaoliuren', 'xiaoLiuRenCopyText', 'xiaoLiuRenCode');
  copyBind('copy-geomancy', 'geomancy', 'geomancyCopyText', null);
  copyBind('copy-tibetan', 'tibetan', 'tibetanCopyText', null);
  copyBind('copy-tarot', 'tarot', 'tarotCopyText', null);
  const hc = document.getElementById('copy-home');
  if (hc) hc.addEventListener('click', () => copyText(homeCopyText(), hc));

  // 复现码按钮
  $$('.code-btn').forEach((b) => b.addEventListener('click', () => openSheet(b.dataset.code)));
  const cp = document.getElementById('btn-code-pan');
  if (cp) cp.addEventListener('click', () => openSheet('liuyao'));
  $('#cs-close').addEventListener('click', closeSheet);
  $('#cs-mask').addEventListener('click', closeSheet);
  $('#cs-copy').addEventListener('click', () => {
    const t = $('#cs-cur').textContent;
    if (t && t !== '—') copyText(t, $('#cs-copy'));
  });
  $('#cs-pin').addEventListener('click', () => {
    if (!current.caseId) { autoSave(sheetKind || 'liuyao'); }
    if (!current.caseId) { setHint('这一盘还没能生成案例', true); return; }
    closeSheet();
    openNoteSheet(current.caseId);
  });
  $('#cs-open').addEventListener('click', () => openByCode($('#cs-input').value));
  $('#cs-input').addEventListener('keydown', (e) => { if (e.key === 'Enter') openByCode($('#cs-input').value); });

  // 案例库
  $('#history-list').addEventListener('click', onHistoryClick);
  $('#case-filter').addEventListener('click', onHistoryClick);
  // 导出全部（JSON 下载，含版本号与生成时间）
  $('#case-export').addEventListener('click', () => {
    const bundle = exportCaseBundle();
    if (!bundle.count) { toast('还没有案例可导出'); return; }
    try {
      const blob = new Blob([JSON.stringify(bundle, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = exportFileName();
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 4000);
      toast(`已导出 ${bundle.count} 条案例`);
    } catch (e) {
      toast(`导出失败：${e.message || e}`);
    }
  });

  // 导入（去重合并，同码/同 id 以导入的为准）
  $('#case-import').addEventListener('click', () => {
    const f = $('#case-file');
    if (f) { f.value = ''; f.click(); }
  });
  const fileInput = $('#case-file');
  if (fileInput) {
    fileInput.addEventListener('change', () => {
      const file = fileInput.files && fileInput.files[0];
      if (!file) return;
      const fr = new FileReader();
      fr.onload = () => {
        let bundle;
        try { bundle = JSON.parse(String(fr.result || '')); }
        catch (e) { toast('这个文件不是有效的 JSON'); return; }
        try {
          const r = importCaseBundle(bundle);
          renderHistory();
          const bits = [`新增 ${r.added} 条`];
          if (r.updated) bits.push(`覆盖 ${r.updated} 条`);
          if (r.skipped) bits.push(`跳过 ${r.skipped} 条（格式不对）`);
          if (r.evicted) bits.push(`已满额删除最旧 ${r.evicted} 条`);
          toast(`导入完成：${bits.join('，')}`);
        } catch (e) {
          toast(`导入失败：${e.message || e}`);
        }
      };
      fr.readAsText(file);
    });
  }

  // 时区提示横幅
  $('#tz-warn-x').addEventListener('click', () => clearTzWarn());
  const retzBtn = $('#tz-warn-go');
  if (retzBtn) retzBtn.addEventListener('click', () => retzLegacy());
  const retzInput = $('#tz-warn-city');
  if (retzInput) retzInput.addEventListener('keydown', (e) => { if (e.key === 'Enter') retzLegacy(); });

  $('#case-clear').addEventListener('click', () => {
    const st = caseStats();
    const n = st.total - st.pinned;
    if (!n) { toast('没有未星标的案例'); return; }
    if (confirm(`清掉 ${n} 条未星标案例？星标的 ${st.pinned} 条会留下。`)) {
      const k = clearUnpinned();
      toast(`已清掉 ${k} 条未星标案例`);
      renderHistory();
    }
  });

  // 首页卦钟 → 看这一卦的完整排盘（首页本身保持纯展示）
  $('#btn-cast-now').addEventListener('click', () => {
    const { pan, cast, castDate } = currentTimeGua();
    current.pan = pan;
    current.meta = { source: 'time', castAt: castDate.getTime(), yaoValues: cast.yaoValues };
    current.caseId = null;
    renderPan();
    switchView('pan');
    $('#question-input').value = '';
    autoSave('liuyao');
  });

  // 摇铜钱 / 天机 / 手录
  initCast((cast, source, castDate) => goPan(cast, source, castDate));

  // 性别 & 所问
  $('#gender-male').addEventListener('click', () => setGender('男'));
  $('#gender-female').addEventListener('click', () => setGender('女'));
  // 输入时只更新盘面显示，点「保存」才落档并重算复现码
  $('#question-input').addEventListener('input', (e) => {
    if (current.pan) current.pan.question = e.target.value || NO_Q;
  });
  $('#btn-q-save').addEventListener('click', () => {
    if (!current.pan) { toast('先起一卦'); return; }
    const v = $('#question-input').value.trim();
    current.pan.question = v || NO_Q;
    let id = current.caseId;
    if (!id) { const c = autoSave('liuyao'); id = c && c.id; }
    if (id) {
      const info = liuyaoCode();
      const patch = { question: v };
      if (info) patch.code = encodeCode(info.kind, info.data);
      updateCase(id, patch);
      toast(v ? '事由已保存' : '已清空事由');
    } else {
      toast('保存失败');
    }
  });

  $('#toggle-shensha').addEventListener('click', () => { cfg.showShensha = !cfg.showShensha; saveCfg(); renderPan(); });
  $('#toggle-cangyao').addEventListener('click', () => { cfg.showCangyao = !cfg.showCangyao; saveCfg(); renderPan(); });

  $('#btn-copy').addEventListener('click', async (ev) => {
    // 复制内容强制带复现码：以当前盘面（含刚补的事由）现算；先确保已留档
    if (!current.caseId) autoSave('liuyao');
    let code = '';
    const info = liuyaoCode();
    if (info) {
      try { code = encodeCode(info.kind, info.data); } catch { code = ''; }
    }
    if (!code && current.caseId) { const c = loadCase(current.caseId); code = c ? c.code : ''; }
    await copyCurrent(ev, code);
  });

  // 星标留存：每卦已自动留档，星标时强制写备注（时间长了才知道是哪一卦）
  $('#btn-pin').addEventListener('click', () => {
    if (!current.caseId) autoSave('liuyao');
    if (!current.caseId) { toast('这一卦还没能生成案例'); return; }
    openNoteSheet(current.caseId);
  });
  const goto = document.getElementById('btn-goto-cases');
  if (goto) goto.addEventListener('click', () => switchView('history'));

  // 星标备注弹窗
  $('#nt-close').addEventListener('click', closeNoteSheet);
  $('#nt-mask').addEventListener('click', closeNoteSheet);
  $('#nt-ok').addEventListener('click', confirmNote);
  $('#nt-unpin').addEventListener('click', () => {
    if (!noteTargetId) return;
    togglePin(noteTargetId);
    if (current.caseId === noteTargetId) updatePinBtn();
    renderHistory();
    closeNoteSheet();
    toast('已取消星标（备注保留，案例仍在最近 30 条内）');
  });
  $('#nt-input').addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); confirmNote(); }
  });

  // 各子系统独立容错：任何一个绑定出错都不能炸穿整个 bind()，
  // 否则其后的时间条/各盘点选/宿盘切换会全部失效（v64 skyCode 事故教训）。
  const safe = (name, fn) => { try { fn(); } catch (e) { console.warn('[' + name + '] 绑定失败', e); } };
  safe('timebars', bindTimeBars);
  safe('pin', updatePinBtn);

  // 容器级手势/点选交互（八字/梅花/奇门），重渲染后监听不丢
  safe('interact', initInteract);
  // 二十八宿 / 地占 / 藏占 / 塔罗的容器级绑定随各自模块懒装（VIEW_INIT），
  // 不再在 bind() 里无条件调一遍——否则未装模块时这里必然 TypeError。
  // 点读笔 + 解盘思路：全局「点哪解释哪」与引导块折叠（document 级，绑定一次）
  safe('tips', initTips);
  safe('guides', initGuides);
}

function setGender(g) {
  cfg.gender = g; saveCfg();
  if (current.pan) { current.pan.gender = g; renderPan(); }
}

/* ============================ 启动 ============================ */
/**
 * 由 js/boot.js 调用：所有视图模块在这一步才真正加载。
 * 任一模块失败 → boot.js 渲染全屏「哪个文件失败」面板，而不是白屏。
 */
export async function boot() {
  const M = await loadModules();
  const E = await import('./errors.js?v=133');
  ({ showError, errorHtml, renderWarnings, esc, showLoading, hideLoading, refreshScrollLock, clearRenderError, takeRenderError } = E);

  ({ $, $$, cfg, saveCfg, current, panAt, setPanAt, resetPanAt, birthDate, nowDate, resolveCastDate, copyText, toast, pad, parseLocalDateTime, toLocalInputValue, fmtMoment, escapeHtml, toSec,
    civilInCity, tzSnapshotFor, tzSnapshotOfCivil, birthArgs, nowGeoArgs, panTimeArgs } = M['state.js']);
  toast = wrapToast(toast); // 案例满额要跟成功提示合并成一句（见 wrapToast）
  ({ paipanZi } = M['zischool.js']);
  ({ updateHome, currentTimeGua, homeCopyText } = M['qintian.js']);
  ({ renderPan, copyCurrent } = M['panview.js']);
  ({ initInteract } = M['interact.js']);
  // P0-1：视图模块不再在这里解构——它们由 loadView() 按需装，
  // 渲染/复制/取码一律从 VM[视图名] 上取，未装的模块不会被误用。
  VM.sky = M['skyview.js'];
  ({ renderSky, renderHomeSky, skyCopyText, skyCode } = M['skyview.js']);
  ({ initCast, resetCast } = M['cast.js']);
  ({ encodeCode, decodeCode, buildCode, civilDate, civilFromAt, LEGACY_NOTICE, RULE_VERSION } = M['sharecode.js']);
  ({ initForceRefresh, shouldSkipAutoReload } = M['force-refresh.js']);
  ({ initTips, initGuides } = M['tipview.js']);
  ({ loadCases, loadCase, saveCase, updateCase, togglePin, removeCase, clearUnpinned, caseStats, fmtAt, KINDS, KIND_LABEL, KIND_MARK, AUTO_KEEP,
    exportCaseBundle, importCaseBundle, exportFileName } = M['cases.js']);
  ({ renderAsk, bindAsk } = M['askview.js']);
  ({ mountPlaceBars, bindPlaceChip } = M['placeui.js']);
  ({ onPlaceChange } = M['geo.js']);
  ({ initRitual, castDone, resetGate, RITUAL_PAGES } = M['ritual.js']);
  ({ renderMoreCards } = M['homecards.js']);
  ({ isCasted } = M['ritual.js']);

  // PANES 仍是「视图名 → 渲染 / 取码」的统一入口（时间条、起盘回调、复现码都查它），
  // 只是 render 变成「没装先装再渲染」，code 变成点击时才去 VM 里取函数。
  PANES = {};
  for (const name of Object.keys(VIEW_KEY)) {
    PANES[name] = {
      render: () => rerender(name), // 返回 promise：时间条 / 起盘回调要等它算完才知道成没成
      code: CODE_NAME[name] ? () => {
        const m = VM[name];
        const fn = m && CODE_NAME[name] ? m[CODE_NAME[name]] : null;
        return fn ? fn() : null;
      } : null,
    };
  }
  PANES.sky = { render: () => { try { renderSky(); } catch (e) { console.warn('[sky] 渲染失败', e); } }, code: null };

  if ('serviceWorker' in navigator) {
    // 新 SW 接管（skipWaiting+claim）后自动刷新一次，确保打开即最新，无需手动强刷
    let reloaded = false;
    navigator.serviceWorker.addEventListener('controllerchange', () => {
      // 用户刚按过「强制刷新」：这次重载已经是新资源，再刷一次只会让页面连闪两下。
      if (shouldSkipAutoReload()) return;
      if (!reloaded) { reloaded = true; window.location.reload(); }
    });
    // updateViaCache:'none' 强制每次注册都绕过 HTTP 缓存去检查 sw.js：
    // 托管侧不发 Cache-Control，微信/浏览器会启发式缓存旧 SW，导致新版长期下不去
    window.addEventListener('load', () => {
      navigator.serviceWorker.register('./sw.js', { updateViaCache: 'none' })
        .then((reg) => { try { reg.update(); } catch { /* ignore */ } })
        .catch(() => {});
    });
  }

  // 全局轻触反馈：全盘可点元素按下即轻微震动一下（iOS Safari 不支持 vibrate，用视觉反馈兜底）
  function initHaptics() {
    const SEL = 'button,a,.btn,.tab,.chip,[data-tip],[data-act],[data-sel-body],[data-sel-mansion],.pl-row,.tc-chip,.zm-jump,.zs-const,.zm-pl,input,select,label';
    document.addEventListener('pointerdown', (e) => {
      const t = e.target;
      const el = t && t.closest ? t.closest(SEL) : null;
      if (!el) return;
      try { if (navigator.vibrate) navigator.vibrate(8); } catch (_) {}
      el.classList.add('tap-on');
      setTimeout(() => el.classList.remove('tap-on'), 110);
    }, { passive: true });
  }

  // 每帧独立容错：渲染或星历单次抛错不应中断整秒定时器，也不应拖死点击
  function safeHome() { try { updateHome(); } catch (e) { console.warn('[home] 刷新失败', e); } }
  function safeSky() { try { refreshHomeSky(); } catch (e) { console.warn('[sky] 天象条失败', e); } }
  function safeBars() { try { syncTimeBars(); } catch (e) { console.warn('[timebars] 同步失败', e); } }

  initHaptics();
  bind();
  mountPlaceBars();   // v111：各盘面页顶栏注入"观测地"胶囊（定位 / 拼音搜城市）
  bindPlaceChip();
  // 观测地变更 → 重算"当下/天象"类视图；排盘按起卦当时的地点定，不回溯改盘
  onPlaceChange(() => {
    try {
      const v = getActiveView();
      if (v === 'sky') renderSky();
      else if (v === 'globe') rerender('globe');
      else if (v === 'mansion') rerender('mansion');
      else if (v === 'home') { updateHome(); refreshHomeSky(); }
      syncTimeBars();
    } catch (e) { console.warn('[place] 重算失败', e); }
  });
  // 首页右下角的版本号与强制刷新。异步读版本，不阻塞首屏。
  try { initForceRefresh(); } catch (e) { console.warn('[refresh] 初始化失败', e); }

  safeHome();
  setTimeout(safeSky, 0); // 星历较重，延迟到首帧之后，不阻塞首屏与点击
  safeBars();
  setInterval(safeHome, 1000);
  setInterval(safeSky, 5 * 60 * 1000);

  // P0-3：首屏画完后的空闲时间里，把最常点的两张盘（紫微 / 西占）的模块先装掉。
  // 好处：点开时不再付模块解析的钱（实测紫微 25ms / 西占 14ms 落在点击这一拍里），
  // 用户也不会先看到 200ms 空白。省流量模式下不预热，避免动用户的流量。
  const idle = window.requestIdleCallback || ((fn) => setTimeout(fn, 1200));
  idle(() => {
    const conn = navigator.connection || {};
    if (conn.saveData || /^(slow-)?2g$/.test(conn.effectiveType || '')) return;
    loadView('ziwei').catch(() => {});
    loadView('astro').catch(() => {});
  }, { timeout: 3000 });

}
