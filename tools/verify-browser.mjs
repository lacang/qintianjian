#!/usr/bin/env node
/**
 * 钦天监 · 真实浏览器门禁（P0）
 *
 * 用法: node tools/verify-browser.mjs [--root <仓库根>] [--expect-version NN] [--json]
 *                                     [--keep-profile] [--page-timeout 秒]
 *
 * 为什么需要它
 * ------------
 * 静态检查（语法 + import 图）只能证明"看起来对"。v121 的教训是：真正决定应用能不能用的，
 * 是**真实浏览器能不能把整个模块图加载并执行起来**——语法对、导出名对，仍可能因为运行时
 * 依赖、MIME、路径大小写、SW 抢缓存等原因在浏览器里失败。
 *
 * 为什么还要逐页巡检（2026-10-26 补）
 * ----------------------------------
 * 只巡首页有一个明显盲区：首页正常不代表阳宅页正常；语法通过不代表塔罗页能正确初始化；
 * 桩测通过不代表页面在浏览器里没有运行时异常。而"阳宅二次进入空白"（v121 修）恰恰是
 * 页面生命周期问题——这类问题只有真实浏览器 + 真实交互才能覆盖。
 * 所以本门禁在首页断言之后，用**同一个浏览器实例、同一套构建产物**逐页走一遍：
 * 通过真实点击（tabbar / #more-cards 卡片 / 起卦按钮）进入每个页面，检查
 *   ① 视图真的切过去了  ② 关键容器渲染出了内容  ③ 本页没有未捕获异常
 *   ④ 本页没有 console.error  ⑤ 本页没有关键资源加载失败
 * 并对"二次进入"做定向回归（v121 真机 bug 的直接防线）。
 *
 * 边界：本门禁覆盖"页面能加载、能初始化、无运行时异常"，**不覆盖** iOS Safari、
 * 微信内置浏览器、以及需要人判断的交互体验——那些仍走真机验收。
 *
 * 退出码：0 通过 / 1 有失败 / 3 环境不具备（找不到 Chrome）
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
const PAGE_TIMEOUT = Number(opt('--page-timeout', '10')) * 1000;

const findings = [];
const notes = [];
const pageResults = [];
const addFail = (code, detail, page = null) => findings.push({ code, detail, page });

/**
 * 逐页巡检清单（数据驱动：加页面只加一行，不要写新流程）。
 *  enter: 'tab:<view>'     点 tabbar
 *         'card:<data-open>' 点起卦页「更多排盘」里的卡片（真实用户路径）
 *         'tianji'          点起卦页「天机」按钮，出六爻排盘
 *  sel:   该页的关键容器；min: 渲染后 textContent 的最小长度（防"渲染函数没跑但容器在"）
 */
const PAGES = [
  // min 是"渲染后 textContent 的最小字数"，按 2026-10-26 实测值往下留余量校准：
  // 目的不是卡字数，而是区分"渲染函数真的跑了"和"只渲染出一个空壳/标题"。
  { id: 'home', name: '首页', enter: 'tab:home', sel: '#home-sizhu', min: 8 },
  // 经典板块（《论语》）：主视图走 tab；详情页走「点第一条读原典」的真实用户路径
  // 观心首页是「今日相遇」单条：品牌+分段+一条原文+出处+要旨+统计，正常约 198 字，
  // 阈值取 150 只用于区分「渲染了」与「空壳」，不用于卡内容量。
  { id: 'classic', name: '观心', enter: 'tab:classic', sel: '#classic-body', min: 150 },
  { id: 'classic-detail', name: '原典详情', enter: 'detail', sel: '#classic-detail-body', min: 400 },
  { id: 'yangzhai', name: '阳宅', enter: 'card:yangzhai', sel: '#yangzhai-body', min: 200 },
  { id: 'zhuyou', name: '符箓', enter: 'card:zhuyou', sel: '#zhuyou-body', min: 20000 },
  { id: 'tarot', name: '塔罗', enter: 'card:tarot', sel: '#tarot-body', min: 40 },
  { id: 'geomancy', name: '地占', enter: 'card:geomancy', sel: '#geomancy-body', min: 800 },
  { id: 'tibetan', name: '藏占', enter: 'card:tibetan', sel: '#tibetan-body', min: 400 },
  { id: 'daliuren', name: '大六壬', enter: 'card:daliuren', sel: '#daliuren-body', min: 40 },
  { id: 'xiaoliuren', name: '小六壬', enter: 'card:xiaoliuren', sel: '#xiaoliuren-body', min: 40 },
  { id: 'vedic', name: '吠陀', enter: 'card:vedic', sel: '#vedic-body', min: 40 },
  { id: 'pan', name: '六爻排盘', enter: 'tianji', sel: '#pan-body', min: 250 },
];

/** 二次进入回归：这些页面的生命周期最容易坏（v121 阳宅空白、v109 牌桌重构）。 */
const REVISITS = ['yangzhai', 'tarot', 'classic'];

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const probeExpr = (sel) => `(() => {
  const e = document.querySelector(${JSON.stringify(sel)});
  if (!e) return { found: false };
  const t = (e.textContent || '').replace(/\\s+/g, ' ').trim();
  return { found: true, len: t.length, sample: t.slice(0, 60) };
})()`;
const ACTIVE = `(() => { const v = document.querySelector('.view.active'); return v ? v.id : '' })()`;

// ---------- A. 静态服务 ----------
const srv = await startStaticServer(APP);
const chrome = findChrome();
if (!chrome) {
  console.error('[verify-browser] 找不到 Chrome/Chromium（可用 QT_CHROME=<路径> 指定）。无法执行浏览器门禁。');
  await srv.close();
  process.exit(3);
}

const profile = KEEP ? path.join(os.tmpdir(), 'qt-verify-profile') : fs.mkdtempSync(path.join(os.tmpdir(), 'qt-verify-'));
let sess = null;
let domLen = 0;
let homeMs = 0;

const cleanup = async () => {
  if (sess) { try { await sess.close(); } catch { /* ignore */ } }
  await srv.close();
  if (!KEEP) fs.rmSync(profile, { recursive: true, force: true });
};

try {
  // ---------- B. 真实浏览器加载首页 ----------
  try {
    sess = await openPage({ chrome, profile, tag: 'verify-browser' });
  } catch (e) {
    addFail('no-page', `无法打开可编程页面：${e.message}`);
    throw e;
  }
  const t0 = Date.now();
  const loaded = await sess.goto(srv.url + '/', PAGE_TIMEOUT + 20000);
  homeMs = Date.now() - t0;

  // 首次访问会走 SW install → activate → claim → controllerchange → location.reload()。
  // 如果巡检正好撞上这次 reload，DOM 会被重置成空壳（#more-cards 空、子视图 body 空），
  // 门禁就会假红——2026-10-26 首版逐页巡检就踩到了（符箓页随机 no-card）。
  // 所以必须**等 SW 接管完成**（controller 非空 = reload 之后的那次加载）再开始巡检。
  const swReady = await sess.waitFor(
    `(() => { try { return !!(navigator.serviceWorker && navigator.serviceWorker.controller); } catch (e) { return false; } })()`,
    (v) => v === true, 12000,
  );
  if (swReady.ok) {
    notes.push(`SW 已接管（${swReady.ms}ms），页面不会再被 controllerchange 重载`);
  } else {
    notes.push('SW 未在 12s 内接管（页面可能被 reload 打断；逐页巡检已带重试）');
  }
  // reload 之后 main.js 要重跑一遍 init，首页内容需要重新等待。
  await sess.waitFor(probeExpr('#home-sizhu'), (v) => v && v.found && v.len >= 5, PAGE_TIMEOUT);
  // reload 之后 init 还要跑一遍（异步区块如天象/节气）。给一个很短的静默窗口，
  // 避免把首页异步渲染的抖动算进第一页的异常统计。
  await sleep(800);
  const home = await sess.evaluate(probeExpr('#home-sizhu'));
  const gua = await sess.evaluate(probeExpr('#now-gua-title'));
  const sizhu = home.value && home.value.found ? (home.value.sample || '') : '';
  const guaTitle = gua.value && gua.value.found ? (gua.value.sample || '') : '';
  const bodyLen = (await sess.evaluate('document.body ? document.body.innerText.length : 0')).value || 0;
  domLen = (await sess.evaluate('document.documentElement.outerHTML.length')).value || 0;

  if (!loaded) addFail('no-dom', `首页 ${(PAGE_TIMEOUT + 20000) / 1000}s 内没有触发 load 事件（服务端送出 ${srv.stats.served} 个文件）。`);
  if (!bodyLen) addFail('no-dom', '首页 body 文本为空 → 页面没有渲染任何内容。');

  // ---------- C. JS 真的执行了吗 ----------
  if (!sizhu) addFail('js-not-executed', '首页 #home-sizhu 为空 → main.js 没跑起来（模块图很可能没加载成功）');
  if (!guaTitle) addFail('home-not-rendered', '首页 #now-gua-title 为空 → 首页渲染函数未执行');
  const skel = (await sess.evaluate(`(document.documentElement.outerHTML.match(/qt-skeleton/g) || []).length`)).value || 0;
  notes.push(`首页 DOM ${domLen}B / body 文本 ${bodyLen} 字；#home-sizhu="${sizhu}"；#now-gua-title="${guaTitle}"；剩余骨架占位 ${skel} 个；耗时 ${homeMs}ms`);
  if (skel > 0) notes.push(`仍有 ${skel} 个 qt-skeleton（异步区块未完成，仅提示不阻断）`);

  // ---------- D. 逐页巡检 ----------
  // 首页都没跑起来时（js-not-executed），逐页巡检只会产出一堆噪声，直接跳过。
  const canWalk = !!sizhu && !!bodyLen;
  if (!canWalk) {
    notes.push('首页未渲染，跳过逐页巡检（先修首页启动问题）。');
  } else {
    const mark = () => ({ e: sess.exceptions.length, c: sess.consoleErrors.length, l: sess.loadFailed.length });
    const since = (m) => ({
      exceptions: sess.exceptions.slice(m.e),
      consoleErrors: sess.consoleErrors.slice(m.c),
      loadFailed: sess.loadFailed.slice(m.l),
    });

    // 点击类操作带重试：偶发的 DOM 重绘 / SW reload 会让目标节点短暂消失，
    // 重试 3 次（间隔 400ms）可以吸收抖动，同时不掩盖真正缺失的入口。
    const clickRetry = async (expr, failCode) => {
      for (let i = 0; i < 3; i++) {
        const r = await sess.evaluate(expr);
        if (r.value === 'ok') return 'ok';
        await sleep(400);
      }
      return failCode;
    };
    const tabClick = (view) => clickRetry(
      `(() => { const t = document.querySelector('.tabbar .tab[data-view=${JSON.stringify(view)}]'); if (!t) return 'no-tab'; t.click(); return 'ok'; })()`,
      'no-tab',
    ).then((v) => ({ value: v }));

    async function enter(page) {
      if (page.enter.startsWith('tab:')) {
        const r = await tabClick(page.enter.slice(4));
        return r.value === 'ok' ? 'ok' : String(r.value || r.error);
      }
      if (page.enter === 'detail') {
        const tc = await tabClick('classic');
        if (tc.value !== 'ok') return 'no-classic-tab';
        await sleep(250);
        return clickRetry(
          `(() => { const b = document.querySelector('#classic-body [data-act="open"]'); if (!b) return 'no-node'; b.click(); return 'ok'; })()`,
          'no-node',
        );
      }
      // 子视图卡片都在起卦页；先切过去，等一帧让 #more-cards 有内容
      const t = await tabClick('cast');
      if (t.value !== 'ok') return 'no-cast-tab';
      await sleep(250);
      if (page.enter.startsWith('card:')) {
        const id = page.enter.slice(5);
        return clickRetry(
          `(() => { const b = document.querySelector('#more-cards [data-open=${JSON.stringify(id)}]'); if (!b) return 'no-card'; b.click(); return 'ok'; })()`,
          'no-card',
        );
      }
      if (page.enter === 'tianji') {
        const r = await clickRetry(
          `(() => { const b = document.querySelector('#btn-tianji'); if (!b) return 'no-btn'; b.click(); return 'ok'; })()`,
          'no-btn',
        );
        if (r !== 'ok') return r;
        await sleep(500); // cast.js 里 onCast 有 350ms 延迟
        return 'ok';
      }
      return 'bad-enter';
    }

    /** 走一遍某页并断言；返回 {ok, len, ms, why} */
    async function walk(page, phase = '首巡') {
      const m = mark();
      const t = Date.now();
      const enterR = await enter(page);
      if (enterR !== 'ok') {
        addFail('page-enter-failed', `${phase} ${page.name}：入口不可用（${enterR}）`, page.id);
        pageResults.push({ page: page.id, name: page.name, phase, ok: false, why: `入口不可用(${enterR})`, ms: Date.now() - t });
        return { ok: false };
      }
      const w = await sess.waitFor(probeExpr(page.sel), (v) => v && v.found && v.len >= page.min, PAGE_TIMEOUT);
      const active = (await sess.evaluate(ACTIVE)).value || '';
      const d = since(m);
      const ms = Date.now() - t;
      const why = [];
      if (active !== `view-${page.id}`) why.push(`当前视图是 ${active || '(空)'}，期望 view-${page.id}`);
      if (!w.ok) why.push(`关键容器 ${page.sel} ${w.value && w.value.found ? `内容只有 ${w.value.len} 字（要求 ≥${page.min}）` : '不存在'}`);
      if (d.exceptions.length) why.push(`未捕获异常 ×${d.exceptions.length}：${d.exceptions.map((x) => x.text).slice(0, 2).join(' | ')}`);
      if (d.consoleErrors.length) why.push(`console.error ×${d.consoleErrors.length}：${d.consoleErrors.slice(0, 2).join(' | ')}`);
      if (d.loadFailed.length) why.push(`资源加载失败 ×${d.loadFailed.length}：${d.loadFailed.slice(0, 2).join(' | ')}`);

      const len = w.value && w.value.found ? w.value.len : 0;
      if (d.exceptions.length) addFail('page-exception', `${phase} ${page.name}（${page.id}）：\n` + d.exceptions.slice(0, 4).map((x) => `  ${x.text}${x.url ? ' @' + x.url : ''}`).join('\n'), page.id);
      if (d.consoleErrors.length) addFail('page-console-error', `${phase} ${page.name}（${page.id}）：\n` + d.consoleErrors.slice(0, 4).map((s) => '  ' + s).join('\n'), page.id);
      if (d.loadFailed.length) addFail('page-resource-failed', `${phase} ${page.name}（${page.id}）：\n` + d.loadFailed.slice(0, 4).map((s) => '  ' + s).join('\n'), page.id);
      if (active !== `view-${page.id}`) addFail('page-not-active', `${phase} ${page.name}：${why[0]}`, page.id);
      if (!w.ok) addFail('page-not-rendered', `${phase} ${page.name}：关键容器 ${page.sel} ${w.value && w.value.found ? `只渲染出 ${w.value.len} 字（要求 ≥${page.min}）` : '不存在'}`, page.id);

      pageResults.push({ page: page.id, name: page.name, phase, ok: why.length === 0, len, ms, why: why.join('；') });
      return { ok: why.length === 0, len, ms };
    }

    for (const page of PAGES) {
      if (!AS_JSON) process.stdout.write(`[verify-browser]   ${page.name}… `);
      const r = await walk(page);
      if (!AS_JSON) console.log(r.ok ? `✅ ${r.len} 字 ${r.ms}ms` : `❌ ${r.ms}ms`);
    }

    // ---------- D2. 二次进入回归（页面生命周期） ----------
    for (const id of REVISITS) {
      const page = PAGES.find((p) => p.id === id);
      if (!page) continue;
      if (!AS_JSON) process.stdout.write(`[verify-browser]   ${page.name}二次进入… `);
      const r = await walk(page, '复入');
      if (!AS_JSON) console.log(r.ok ? `✅ ${r.len} 字 ${r.ms}ms` : `❌ ${r.ms}ms`);
    }
  }

  // ---------- E. 日志里的硬错误（全局兜底） ----------
  const errs = sess.consoleErrors.filter((s) => !/favicon/i.test(s));
  if (errs.length && !canWalk) {
    addFail('console-error', `浏览器 console.error ×${errs.length}：\n` + errs.slice(0, 8).map((s) => '  ' + s).join('\n'));
  }

  // ---------- F. 静态服务侧 404 ----------
  // favicon.ico 是浏览器自动发起的，站点本来就没放，不计入失败。
  const realNotFound = srv.stats.notFound.filter((p) => !/^\/favicon\.ico$/i.test(p));
  if (realNotFound.length) {
    addFail('http-404', `静态服务返回 404 的路径 ×${realNotFound.length}：` + realNotFound.slice(0, 10).join(', '));
  }
  if (realNotFound.length !== srv.stats.notFound.length) notes.push('favicon.ico 404（浏览器自动请求，站点未提供，忽略）');

  // ---------- G. 版本一致性 ----------
  const { idxVersions, swVersion } = readAppVersions(APP);
  if (idxVersions.length !== 1) addFail('version-mixed', `index.html 里出现 ${idxVersions.length} 种 ?v= 版本号：${idxVersions.join(', ')}`);
  if (!swVersion) addFail('version-sw', 'sw.js 里找不到 qintian-vNN');
  if (idxVersions.length === 1 && swVersion && idxVersions[0] !== swVersion) addFail('version-mismatch', `index.html ?v=${idxVersions[0]} 与 sw.js CACHE=qintian-v${swVersion} 不一致`);
  if (EXPECT && idxVersions.length === 1 && idxVersions[0] !== String(EXPECT)) addFail('version-unexpected', `期望 v${EXPECT}，实际 index.html ?v=${idxVersions[0]} / sw.js qintian-v${swVersion}`);

  await cleanup();
  sess = null;

  const walked = pageResults.filter((p) => p.phase === '首巡');
  const revised = pageResults.filter((p) => p.phase === '复入');
  const summary = {
    root: ROOT, chrome, url: srv.url, domLen, servedFiles: srv.stats.served, homeMs,
    version: idxVersions.length === 1 ? idxVersions[0] : null, swVersion,
    pages: pageResults, pagesWalked: walked.length, pagesOk: walked.filter((p) => p.ok).length,
    revisits: revised.map((p) => ({ page: p.page, ok: p.ok })),
    notes, failures: findings, ok: findings.length === 0,
  };

  if (AS_JSON) {
    console.log(JSON.stringify(summary, null, 2));
  } else if (findings.length === 0) {
    console.log(`[verify-browser] 通过：首页 ${homeMs}ms + 逐页巡检 ${walked.length}/${PAGES.length} 页 + 复入 ${revised.length} 页（v${summary.version}）`);
    for (const n of notes) console.log('  · ' + n);
    console.log('[verify-browser] PASS');
  } else {
    console.error(`\n========== 浏览器门禁未通过（${findings.length} 项）==========`);
    for (const f of findings) console.error(`[FAIL:${f.code}] ${f.detail}`);
    if (pageResults.length) {
      console.error('--- 逐页结果 ---');
      for (const p of pageResults) console.error(`  ${p.ok ? '✅' : '❌'} ${p.phase} ${p.name}（${p.page}）${p.ok ? ` ${p.len} 字 ${p.ms}ms` : '：' + p.why}`);
    }
    for (const n of notes) console.error('  · ' + n);
    process.exit(1);
  }
} catch (e) {
  await cleanup();
  if (!findings.length) addFail('internal', `门禁脚本异常：${e && e.message}`);
  console.error(`\n========== 浏览器门禁未通过（${findings.length} 项）==========`);
  for (const f of findings) console.error(`[FAIL:${f.code}] ${f.detail}`);
  process.exit(1);
}
