import {
  $, $$, cfg, saveCfg, current, panAt, setPanAt, resetPanAt,
  birthDate, nowDate, resolveCastDate, copyText, toast, pad,
  parseLocalDateTime, toLocalInputValue, fmtMoment, escapeHtml, toSec,
} from './state.js?v=123';
import { paipanZi } from './zischool.js?v=123';
import { updateHome, currentTimeGua, homeCopyText } from './qintian.js?v=123';
import { renderPan, copyCurrent } from './panview.js?v=123';
import { renderBazi, baziCopyText, baziCode } from './baziview.js?v=123';
import { renderMeiHua, meiHuaCopyText, meiHuaCode } from './meihuaview.js?v=123';
import { renderQiMen, qiMenCopyText, qiMenCode } from './qimenview.js?v=123';
import { renderAstro, astroCopyText, astroCode, setAstroStyle } from './astroview.js?v=123';
import { ASTRO_MODE_KEY, B2_KEY, RESET_KEY } from './astromodes.js?v=123';
import { renderVedic, vedicCopyText, vedicCode } from './vedicview.js?v=123';
import { renderZhuyou, zhuyouCopyText, zhuyouCode } from './zhuyou/zhuyouview.js?v=123';
import { renderYangzhai, initYangzhai, yangzhaiCopyText, yangzhaiCode, restoreYangzhai } from './yangzhai/yangzhaiview.js?v=123';
import { renderZiwei, ziweiCopyText, ziweiCode } from './ziweiview.js?v=123';
import { initInteract } from './interact.js?v=123';
import { renderCards, cardsCopyText, cardsCode, restoreCards } from './cardsview.js?v=123';
import { renderSky, renderHomeSky, skyCopyText, skyCode } from './skyview.js?v=123';
import { renderGlobe, globeCopyText } from './globe.js?v=123';
import { renderMansion, initMansionInteract, mansionCopyText, mansionCode } from './mansionview.js?v=123';
import { initCast, resetCast } from './cast.js?v=123';
import { encodeCode, decodeCode, RULE_VERSION } from './sharecode.js?v=123';
import { initTips, initGuides } from './tipview.js?v=123';
import {
  loadCases, loadCase, saveCase, updateCase, togglePin, removeCase,
  clearUnpinned, caseStats, fmtAt, KINDS, KIND_LABEL, KIND_MARK, AUTO_KEEP,
} from './cases.js?v=123';
import { renderAsk, bindAsk } from './askview.js?v=123';
import { renderClassic, bindClassic, renderClassicDetail, bindClassicDetail } from './classic/classicview.js?v=123';
import { mountPlaceBars, bindPlaceChip } from './placeui.js?v=123';
import { onPlaceChange } from './geo.js?v=123';
import { initRitual, castDone, RITUAL_PAGES } from './ritual.js?v=123';
import { renderMoreCards } from './homecards.js?v=123';
import { renderDaLiuRen, daLiuRenCopyText, daLiuRenCode } from './daliurenview.js?v=123';
import { renderXiaoLiuRen, xiaoLiuRenCopyText, xiaoLiuRenCode } from './xiaoliurenview.js?v=123';
import { renderGeomancy, geomancyCopyText, initGeomancy, geomancyCode, restoreGeomancy } from './geomancyview.js?v=123';
import { renderTibetan, tibetanCopyText, initTibetan, tibetanCode, restoreTibetan } from './tibetview.js?v=123';
import { renderTarot, tarotCopyText, tarotCodeInfo, restoreTarot, isTarotDeck, initTarot, mountTarot } from './tarotview.js?v=123';

const SRC_LABEL = { coins: '摇铜钱', tianji: '天机', manual: '手录', time: '天时' };
const NO_Q = '未填写所占之事';

// 主 tab（底部栏对应）与全屏子视图分开
const TAB_VIEWS = ['home', 'classic', 'ask', 'cast', 'history'];
let lastTab = 'home';
let caseFilter = 'all';
let sheetKind = null;

// 各盘：码数据提供者 + 重渲染（时间条 / 复现码统一走这里）
const PANES = {
  bazi:   { code: baziCode,   render: () => { const b = $('#bazi-body'); if (b) b.innerHTML = renderBazi(); } },
  meihua: { code: meiHuaCode, render: () => { const b = $('#meihua-body'); if (b) b.innerHTML = renderMeiHua(); } },
  qimen:  { code: qiMenCode,  render: () => { const b = $('#qimen-body'); if (b) b.innerHTML = renderQiMen(); } },
  astro:  { code: astroCode,  render: () => renderAstro() },
  vedic:  { code: vedicCode,  render: () => renderVedic() },
  zhuyou: { code: zhuyouCode, render: () => renderZhuyou() },
  yangzhai: { code: yangzhaiCode, render: () => { const b = $('#yangzhai-body'); if (b) b.innerHTML = renderYangzhai(); initYangzhai(); } },
  ziwei:  { code: ziweiCode,  render: () => renderZiwei() },
  cards:  { code: cardsCode,  render: () => renderCards() },
  sky:    { code: null,      render: () => renderSky() },
  globe:  { code: null,      render: () => renderGlobe(nowDate()) },
  mansion:{ code: mansionCode,render: () => renderMansion() },
  daliuren:  { code: daLiuRenCode,  render: () => { const b = $('#daliuren-body');   if (b) b.innerHTML = renderDaLiuRen(nowDate()); } },
  xiaoliuren:{ code: xiaoLiuRenCode,render: () => { const b = $('#xiaoliuren-body'); if (b) b.innerHTML = renderXiaoLiuRen(nowDate()); } },
  geomancy: { code: geomancyCode, render: () => { const b = $('#geomancy-body'); if (b) b.innerHTML = renderGeomancy(); } },
  tibetan: { code: tibetanCode, render: () => { const b = $('#tibetan-body'); if (b) b.innerHTML = renderTibetan(); } },
  tarot: { code: tarotCodeInfo, render: () => { const b = $('#tarot-body'); if (b) { b.innerHTML = renderTarot(); mountTarot(); } } },
};

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
    if (b) { b.innerHTML = renderClassic(); bindClassic(); }
  }
}

function openSubview(name) {
  syncTimeBars();
  if (name === 'bazi') $('#bazi-body').innerHTML = renderBazi();
  if (name === 'meihua') $('#meihua-body').innerHTML = renderMeiHua();
  if (name === 'qimen') $('#qimen-body').innerHTML = renderQiMen();
  if (name === 'astro') renderAstro();
  if (name === 'vedic') renderVedic();
  if (name === 'zhuyou') renderZhuyou();
  if (name === 'yangzhai') { const b = $('#yangzhai-body'); if (b) b.innerHTML = renderYangzhai(); initYangzhai(); }
  if (name === 'ziwei') renderZiwei();
  if (name === 'cards') renderCards();
  if (name === 'sky') renderSky();
  if (name === 'globe') renderGlobe(nowDate());
  if (name === 'mansion') renderMansion();
  if (name === 'daliuren') { const b = $('#daliuren-body'); if (b) b.innerHTML = renderDaLiuRen(nowDate()); }
  if (name === 'xiaoliuren') { const b = $('#xiaoliuren-body'); if (b) b.innerHTML = renderXiaoLiuRen(nowDate()); }
  if (name === 'geomancy') { const b = $('#geomancy-body'); if (b) b.innerHTML = renderGeomancy(); }
  if (name === 'tibetan') { const b = $('#tibetan-body'); if (b) b.innerHTML = renderTibetan(); }
  if (name === 'tarot') { const b = $('#tarot-body'); if (b) { b.innerHTML = renderTarot(); mountTarot(); } }
  switchView(name);
  if (name !== 'cards') autoSave(name); // 每排一盘即自动留档
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

    bar.querySelector('[data-act="reset"]').addEventListener('click', () => {
      resetPanAt(scope);
      if (scope === 'birth') panAt.geo = null;
      syncTimeBars();
      pane.render();
      autoSave(name);
      toast(scope === 'birth' ? '已回到默认出生时刻' : '已回到此刻');
    });

    bar.querySelector('[data-act="go"]').addEventListener('click', () => {
      const d = parseLocalDateTime(input.value);
      if (!d) { toast('时间无效，请重新选择'); input.focus(); return; }
      setPanAt(scope, d);
      if (scope === 'birth') panAt.geo = null; // 手动改时刻即放弃码里带的经纬度
      pane.render();
      autoSave(name);
      toast(`已按 ${fmtMoment(d)} 排盘`);
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
    if (info) { try { code = encodeCode(info.kind, info.data); } catch { code = '—'; } }
    $('#cs-cur').textContent = code;
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
      const at = new Date(d.at);
      const pan = paipanZi({
        yaoValues: d.yaoValues,
        year: at.getFullYear(), month: at.getMonth() + 1, day: at.getDate(),
        hour: at.getHours(), minute: at.getMinutes(),
        gender: cfg.gender, question: v,
      });
      const code = encodeCode('liuyao', { at: d.at, source: d.source, yaoValues: d.yaoValues, question: v });
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
function openByCode(raw) {
  let d;
  try { d = decodeCode(raw); }
  catch (e) { setHint(e.message || '码无法识别', true); return; }
  const at = new Date(d.at);
  applyCodeCfg(d); // v121：码里的计算配置（晚子时/真太阳时/观测地）先落地再排盘
  const staleNote = d.ruleStale ? `（此码规则 v${d.ruleVersion}，当前 v${RULE_VERSION}，结果或有差异）` : '';

  if (d.kind === 'liuyao') {
    if (!d.yaoValues) { setHint('码里没有六爻数据', true); return; }
    const pan = paipanZi({
      yaoValues: d.yaoValues,
      year: at.getFullYear(), month: at.getMonth() + 1, day: at.getDate(),
      hour: at.getHours(), minute: at.getMinutes(),
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

  if (d.kind === 'bazi' || d.kind === 'ziwei' || d.kind === 'astro' || d.kind === 'vedic') {
    setPanAt('birth', at);
    panAt.geo = null;
    if (d.gender) { cfg.gender = d.gender; saveCfg(); }
    if (d.lon != null && d.lat != null) {
      panAt.geo = { longitude: d.lon, latitude: d.lat, place: `${d.lon.toFixed(2)}°E ${d.lat.toFixed(2)}°N` };
    }
  } else if (d.kind === 'meihua' || d.kind === 'qimen' || d.kind === 'daliuren' || d.kind === 'xiaoliuren') {
    setPanAt('now', at);
  } else if (d.kind === 'sky') {
    // sky 码只含时刻；还原到二十八宿实时躔次（天象旧页的时间语义一致）
    setPanAt('now', at);
  }

  closeSheet();
  if (d.kind === 'cards') {
    // v121 双轨：带 deckId 的是新塔罗牌局 → 塔罗视图；否则按旧卡牌视图还原
    if (d.deckId && isTarotDeck(d.deckId)) {
      if (!restoreTarot(d.spreadIndex, d.cards || [], d.deckId)) { toast('牌局还原失败'); return; }
      openSubview('tarot');
      autoSave('cards');
      toast('已还原牌局' + staleNote);
      return;
    }
    openSubview('cards');
    const ok = restoreCards(d.spreadIndex, d.cards || []);
    if (!ok) { toast('牌局还原失败'); return; }
    autoSave('cards');
    toast('已还原牌局' + staleNote);
    return;
  }
  if (d.kind === 'geomancy') {
    if (!restoreGeomancy(d.mothers, d.qHouse, d.question)) { toast('地占还原失败'); return; }
    openSubview('geomancy');
    autoSave('geomancy');
    toast('已还原地占盘' + staleNote);
    return;
  }
  if (d.kind === 'tibetan') {
    if (!restoreTibetan(d.mode, d.dice, d.coin, d.question)) { toast('藏占还原失败'); return; }
    openSubview('tibetan');
    autoSave('tibetan');
    toast('已还原藏占' + staleNote);
    return;
  }
  if (d.kind === 'yangzhai') {
    if (!restoreYangzhai(d)) { toast('宅盘还原失败'); return; }
    openSubview('yangzhai');
    autoSave('yangzhai');
    toast('已还原宅盘' + staleNote);
    return;
  }
  if (RITUAL_PAGES.includes(d.kind)) castDone(d.kind); // 复现码直入，不走起盘门
  openSubview(d.kind === 'sky' ? 'mansion' : d.kind);
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
// cast = 引擎 CastResult {yaoValues,...}；source 标识入口；castDate=排盘所用时刻（全北京时）
function goPan(cast, source, castDate) {
  const d = castDate || resolveCastDate(new Date());
  const pan = paipanZi({
    yaoValues: cast.yaoValues,
    year: d.getFullYear(), month: d.getMonth() + 1, day: d.getDate(),
    hour: d.getHours(), minute: d.getMinutes(),
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
  bindClassic();
  bindClassicDetail();
  document.addEventListener('qintian:classic-goto', (e) => {
    const v = e.detail && e.detail.view;
    if (v) switchView(v);
  });
  // 三幕式排盘：点「起盘」后进入盘面（再起一盘时重走门）
  initRitual((key) => {
    // 再起一盘：ritual 已清标记，render 回到起盘门；正常起盘：直接渲染盘面
    if (PANES[key] && PANES[key].render) PANES[key].render();
  });
  // 占星盘面样式切换（12 风格，document 级委托防 innerHTML 冲掉）
  document.addEventListener('click', (e) => {
    const btn = e.target.closest('[data-astyle]');
    if (btn) setAstroStyle(btn.dataset.astyle);
  });
  // 占星盘面模式（36 种）/ 本命2 / 重置城市
  document.addEventListener('click', (e) => {
    const mb = e.target.closest('[data-amode]');
    if (mb) { try{ localStorage.setItem(ASTRO_MODE_KEY, mb.dataset.amode); }catch{} renderAstro(); return; }
    const rs = e.target.closest('[data-areloc]');
    if (rs) { try{ localStorage.setItem(RESET_KEY, JSON.stringify({ city: rs.dataset.areloc })); }catch{} renderAstro(); return; }
    const sv = e.target.closest('[data-b2save]');
    if (sv) {
      const data = {};
      document.querySelectorAll('[data-b2k]').forEach((el) => { data[el.dataset.b2k] = el.value; });
      try{ localStorage.setItem(B2_KEY, JSON.stringify(data)); }catch{}
      renderAstro();
    }
  });

  // 占星"重置城市"下拉（v111 起为全量城市选择）
  document.addEventListener('change', (e) => {
    const rc = e.target.closest('#reloc-city');
    if (rc) { try { localStorage.setItem(RESET_KEY, JSON.stringify({ city: rc.value })); } catch {} renderAstro(); }
  });

  document.addEventListener('qintian:ask-goto', (e) => {
    const v = e.detail && e.detail.view;
    if (!v) return;
    if (TAB_VIEWS.includes(v)) { switchView(v); return; }
    if (PANES[v]) { syncTimeBars(); PANES[v].render(); switchView(v); }
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
  // 顺手粘给 AI 后随时能在系统内还原这一盘
  const copyBind = (id, fn, codeFn) => {
    const el = document.getElementById(id);
    if (!el) return;
    el.addEventListener('click', () => {
      let text = fn();
      if (codeFn) {
        try {
          const info = codeFn();
          if (info) text += `\n复现码：${encodeCode(info.kind, info.data)}\n`;
        } catch { /* 码不可用则忽略 */ }
      }
      copyText(text, el);
    });
  };
  copyBind('copy-bazi', baziCopyText, baziCode);
  copyBind('copy-meihua', meiHuaCopyText, meiHuaCode);
  copyBind('copy-qimen', qiMenCopyText, qiMenCode);
  copyBind('copy-astro', astroCopyText, astroCode);
  copyBind('copy-vedic', vedicCopyText, vedicCode);
  copyBind('copy-zhuyou', zhuyouCopyText, zhuyouCode);
  copyBind('copy-yangzhai', yangzhaiCopyText, null);
  copyBind('copy-ziwei', ziweiCopyText, ziweiCode);
  copyBind('copy-cards', cardsCopyText, cardsCode);
  copyBind('copy-sky', skyCopyText, skyCode);
  copyBind('copy-globe', globeCopyText, null);
  copyBind('copy-mansion', mansionCopyText, mansionCode);
  copyBind('copy-daliuren', daLiuRenCopyText, daLiuRenCode);
  copyBind('copy-xiaoliuren', xiaoLiuRenCopyText, xiaoLiuRenCode);
  copyBind('copy-geomancy', geomancyCopyText, null);
  copyBind('copy-tibetan', tibetanCopyText, null);
  copyBind('copy-tarot', tarotCopyText, null);
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
  // 二十八宿宿盘：赤道/黄道切换（容器级，绑定一次）
  safe('mansion', initMansionInteract);
  // 阿拉伯地占：撒点/选宫/点符详情（容器级委托，绑定一次）
  safe('geomancy', initGeomancy);
  safe('tibetan', initTibetan);
  safe('tarot', initTarot);
  // 点读笔 + 解盘思路：全局「点哪解释哪」与引导块折叠（document 级，绑定一次）
  safe('tips', initTips);
  safe('guides', initGuides);
}

function setGender(g) {
  cfg.gender = g; saveCfg();
  if (current.pan) { current.pan.gender = g; renderPan(); }
}

if ('serviceWorker' in navigator) {
  // 新 SW 接管（skipWaiting+claim）后自动刷新一次，确保打开即最新，无需手动强刷
  let reloaded = false;
  navigator.serviceWorker.addEventListener('controllerchange', () => {
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
    else if (v === 'globe') renderGlobe(nowDate());
    else if (v === 'mansion') renderMansion();
    else if (v === 'home') { updateHome(); refreshHomeSky(); }
    syncTimeBars();
  } catch (e) { console.warn('[place] 重算失败', e); }
});
safeHome();
setTimeout(safeSky, 0); // 星历较重，延迟到首帧之后，不阻塞首屏与点击
safeBars();
setInterval(safeHome, 1000);
setInterval(safeSky, 5 * 60 * 1000);
