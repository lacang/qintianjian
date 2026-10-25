// 起卦：摇铜钱 / 天机（梅花易数时间起卦）/ 手录。完成后产出 yaoValues 交 main 排盘。
import { $, $$, cfg, saveCfg, toast, parseLocalDateTime, toLocalInputValue } from './state.js?v=120';
import { castCoins, castByTime, castManual } from '../vendor/liuyao-core.js?v=120';
import { toTrueSolar, trueSolarOffsetMin } from './solartime.js?v=120';
import { siZhuZi, ziMode } from './zischool.js?v=120';
import { getPlace, isPlaceSet, refreshLocatedPlace } from './geo.js?v=120';
import { openPlacePicker } from './placeui.js?v=120';

let coinTosses = []; // 6 轮
let manualYaos = defaultManual();

const ZHI = ['子', '丑', '寅', '卯', '辰', '巳', '午', '未', '申', '酉', '戌', '亥'];
const TRI = ['', '乾', '兑', '离', '震', '巽', '坎', '艮', '坤']; // 先天卦序

function defaultManual() {
  return Array.from({ length: 6 }, () => ({ yinYang: '阳', moving: false }));
}

export function resetCast() {
  coinTosses = [];
  manualYaos = defaultManual();
  resetManualTime();
  resetTianjiTime();
  renderCoinStage();
  renderManual();
  $$('.cast-tab').forEach((t) => t.classList.toggle('active', t.dataset.tab === 'coins'));
  $$('.cast-pane').forEach((p) => p.classList.toggle('active', p.dataset.pane === 'coins'));
}

export function initCast(onCast) {
  // tabs
  $$('.cast-tab').forEach((tab) => tab.addEventListener('click', () => {
    $$('.cast-tab').forEach((t) => t.classList.remove('active'));
    $$('.cast-pane').forEach((p) => p.classList.remove('active'));
    tab.classList.add('active');
    $(`.cast-pane[data-pane="${tab.dataset.tab}"]`).classList.add('active');
  }));

  // 摇铜钱
  $('#btn-toss').addEventListener('click', async () => {
    if (coinTosses.length >= 6) {
      // 已摇完 6 轮，主动成卦
      if (cfg.apparentSolarTime) await refreshLocatedPlace();
      onCast(castCoins(coinTosses), 'coins');
    } else {
      doToss(onCast);
    }
  });
  $('#coins-stage').addEventListener('click', () => doToss(onCast));

  // ---------- 天机：梅花易数·时间起卦 ----------
  // 只由时刻决定（年月日时 → 上卦/下卦/动爻），不含随机数，同一时刻必得同一卦。
  // 未手动改时间 → 用按下这一刻；改过 → 用所填时刻（可复现旧卦，也可先占未来时刻）。
  const tjInput = $('#tianji-time');
  let tjTouched = false;
  if (tjInput) {
    tjInput.value = toLocalInputValue(new Date());
    tjInput.addEventListener('input', () => { tjTouched = true; syncTianjiTime(); });
    tjInput.addEventListener('change', () => { tjTouched = true; syncTianjiTime(); });
    syncTianjiTime();
  }
  const tjNow = $('#tianji-time-now');
  if (tjNow) tjNow.addEventListener('click', () => {
    if (tjInput) tjInput.value = toLocalInputValue(new Date());
    tjTouched = false; // 回到实时
    syncTianjiTime();
    toast('已回到此刻');
  });

  $('#btn-tianji').addEventListener('click', async () => {
    const seal = $('#tianji-seal');
    seal.classList.remove('rolling'); void seal.offsetWidth; seal.classList.add('rolling');
    let d;
    if (tjTouched && tjInput) {
      d = parseLocalDateTime(tjInput.value);
      if (!d) { toast('起卦时间无效，请重新选择'); tjInput.focus(); return; }
    } else {
      d = new Date();
      if (tjInput) { tjInput.value = toLocalInputValue(d); syncTianjiTime(); }
    }
    const dt = await applyTstAt(d);            // 起卦当时取一次定位，再按真太阳时校正
    const r = castByTime(dt.getTime());
    setTimeout(() => onCast(r.cast, 'tianji', dt), 350);
  });

  // ---------- 手录：复现旧卦用 ----------
  const tInput = $('#manual-time');
  if (tInput) {
    tInput.value = toLocalInputValue();
    tInput.addEventListener('input', syncManualTime);
    tInput.addEventListener('change', syncManualTime);
    syncManualTime();
  }
  const tNow = $('#manual-time-now');
  if (tNow) tNow.addEventListener('click', () => { resetManualTime(); toast('已回到此刻'); });

  // 晚子时口径切换（23 点换日 / 0 点换日，全局生效，六爻/八字/日课/首页四柱统一）
  const ziRow = $('#zi-row');
  if (ziRow && !ziRow._ziBound) {
    ziRow._ziBound = true;
    const sync = () => {
      ziRow.querySelectorAll('.zi-opt').forEach((b) => b.classList.toggle('on', b.dataset.zi === ziMode()));
      const note = ziRow.querySelector('.zi-note');
      if (note) note.textContent = ziMode() === '00' ? '日柱 0 点换（子正）' : '日柱 23 点换';
    };
    ziRow.addEventListener('click', (e) => {
      const b = e.target.closest('.zi-opt');
      if (!b) return;
      cfg.lateZi = b.dataset.zi;
      saveCfg();
      sync();
      syncTianjiTime();
      syncManualTime();
      toast(ziMode() === '00' ? '已切换：0 点换日（子正）' : '已切换：23 点换日');
    });
    sync();
  }

  // 真太阳时开关（起卦时刻按均时差+经度差校正；出生八字/星盘仍按钟面时刻）
  // v111：开真太阳时必须先有观测地（定位或手选城市），不再默认沈阳
  const tstRow = $('#tst-row');
  if (tstRow && !tstRow._tstBound) {
    tstRow._tstBound = true;
    const sync = () => {
      tstRow.querySelectorAll('.zi-opt').forEach((b) => b.classList.toggle('on', (b.dataset.tst === 'on') === !!cfg.apparentSolarTime));
      const note = tstRow.querySelector('.zi-note');
      if (note) {
        const off = trueSolarOffsetMin(new Date());
        const s = off >= 0 ? '+' : '−';
        const p = getPlace();
        note.textContent = cfg.apparentSolarTime
          ? `此刻校正 ${s}${Math.abs(Math.round(off))} 分 · 观测地 ${p.name}`
          : '按钟表北京时间';
      }
    };
    tstRow.addEventListener('click', async (e) => {
      const b = e.target.closest('.zi-opt');
      if (!b) return;
      const want = b.dataset.tst === 'on';
      if (want && !isPlaceSet()) {
        toast('真太阳时需要先选观测地');
        const p = await openPlacePicker();
        if (!p) { sync(); return; }
      }
      cfg.apparentSolarTime = want;
      saveCfg();
      sync();
      syncTianjiTime();
      syncManualTime();
      toast(cfg.apparentSolarTime ? '已开真太阳时：按观测地经度校正起卦时刻' : '已关真太阳时：按钟表时间');
    });
    sync();
  }

  $('#btn-manual-cast').addEventListener('click', async () => {
    const raw = tInput ? tInput.value : '';
    let d = parseLocalDateTime(raw);
    if (!d && raw) { toast('起卦时间无效，请重新选择'); if (tInput) tInput.focus(); return; }
    if (!d) d = new Date(); // 留空 = 此刻
    const dt = await applyTstAt(d);
    onCast(castManual(manualYaos), 'manual', dt);
  });

  renderCoinStage();
  renderManual();
}

// ---------- 时间回显 ----------

// 真太阳时：开启后起卦时刻先做均时差+经度差校正（NOAA 算法，见 solartime.js）
// 起卦当时取一次定位（仅"定位"来源；手选城市尊重用户选择），再按真太阳时校正
async function applyTstAt(d) {
  if (cfg.apparentSolarTime) await refreshLocatedPlace();
  return applyTst(d);
}

function applyTst(d) {
  return cfg.apparentSolarTime ? toTrueSolar(d) : d;
}

// 真太阳时换算标注：北京时间 → 真太阳时
function tstNote(d) {
  if (!cfg.apparentSolarTime) return '';
  const off = trueSolarOffsetMin(d);
  const t = toTrueSolar(d);
  const s = off >= 0 ? '+' : '−';
  return ` · <span class="mt-sub">真太阳时 ${String(t.getHours()).padStart(2, '0')}:${String(t.getMinutes()).padStart(2, '0')}（${s}${Math.abs(Math.round(off))}分）</span>`;
}

// 四柱 + 时辰 + 晚子时提示（天机与手录共用）
function siZhuEcho(d) {
  const hour = d.getHours();
  const sz = siZhuZi({
    year: d.getFullYear(), month: d.getMonth() + 1, day: d.getDate(),
    hour, minute: d.getMinutes(),
  });
  const shichen = ZHI[Math.floor(((hour + 1) % 24) / 2)];
  const tail = hour === 23
    ? (ziMode() === '00'
      ? ' · <span class="mt-sub">晚子时：按 0 点换日（子正），日柱留在当日</span>'
      : ' · <span class="mt-sub">晚子时：按 23 点换日，日柱已进次日</span>')
    : '';
  return `${sz.yearGanZhi}年 ${sz.monthGanZhi}月 ${sz.dayGanZhi}日 ${sz.timeGanZhi}时 · ${shichen}时${tail}`;
}

function resetManualTime() {
  const input = $('#manual-time');
  if (!input) return;
  input.value = toLocalInputValue();
  syncManualTime();
}

// 手录：所选时刻 → 四柱回显，便于确认是不是要复现的那个时辰
function syncManualTime() {
  const input = $('#manual-time');
  const echo = $('#manual-time-echo');
  if (!input || !echo) return;
  const d = parseLocalDateTime(input.value);
  if (!d) { echo.innerHTML = '<span class="mt-bad">时间无效，请重新选择</span>'; return; }
  echo.innerHTML = `${siZhuEcho(applyTst(d))}${tstNote(d)}`;
}

function resetTianjiTime() {
  const input = $('#tianji-time');
  if (!input) return;
  input.value = toLocalInputValue(new Date());
  syncTianjiTime();
}

// 天机：所选时刻 → 四柱 + 该时刻的时间卦（上下卦与动爻），先看清再起卦
function syncTianjiTime() {
  const input = $('#tianji-time');
  const echo = $('#tianji-time-echo');
  if (!input || !echo) return;
  const d = parseLocalDateTime(input.value);
  if (!d) { echo.innerHTML = '<span class="mt-bad">时间无效，请重新选择</span>'; return; }
  const dT = applyTst(d);
  const r = castByTime(dT.getTime());
  echo.innerHTML = `${siZhuEcho(dT)} · 上${TRI[r.upperNumber]}下${TRI[r.lowerNumber]} · 动${r.movingPosition}爻${tstNote(d)}`;
}

// ---------- 摇铜钱 ----------

function randCoins() {
  return [0, 1, 2].map(() => (Math.random() < 0.5 ? 0 : 1));
}

function tossName(backs) {
  if (backs === 3) return '老阳 · 三背（阳爻动）';
  if (backs === 2) return '少阴 · 二背一字（阴爻）';
  if (backs === 1) return '少阳 · 一背二字（阳爻）';
  return '老阴 · 三字（阴爻动）';
}

function doToss(onCast) {
  if (coinTosses.length >= 6) return;
  const coins = randCoins();
  const backs = coins[0] + coins[1] + coins[2];
  // 动画：三枚错峰抛起、空中翻转，落定后再亮出正/背面
  const coinEls = $$('#coins-stage .coin');
  coinEls.forEach((el, i) => {
    el.classList.remove('rolling'); void el.offsetWidth;
    el.style.setProperty('--sdly', (i * 0.09) + 's');
    el.classList.add('rolling');
    const isTail = coins[i] === 1; // 背=满文面（阳）
    // 真金币 3D 翻转：起角=当前面，落角=目标面 + 整两圈（720°）
    const from = el.classList.contains('tail') ? 180 : 0;
    const to = isTail ? 900 : 720;
    el.style.setProperty('--sf', from + 'deg');
    el.style.setProperty('--st', to + 'deg');
    setTimeout(() => {
      el.classList.toggle('tail', isTail);
      el.setAttribute('aria-label', isTail ? '背' : '字');
    }, 320 + i * 90);
    setTimeout(() => { el.classList.remove('rolling'); }, 900 + i * 90);
  });
  $('#coin-result').textContent = tossName(backs);
  coinTosses.push(coins);
  renderCoinStack();

  if (coinTosses.length === 6) {
    $('#btn-toss').textContent = '成卦';
  } else {
    $('#btn-toss').textContent = `摇第 ${coinTosses.length + 1} 轮`;
  }
}

// 乾隆通宝真图：正面汉文四字对读，背面满文「宝泉」局名（assets/coin/）
const COIN_IMG = './assets/coin/coin-z.jpg?v=120';
const COIN_IMG_B = './assets/coin/coin-b.jpg?v=120';
function coinHTML() {
  return `<span class="coin-inner">
    <span class="coin-face cf"><img class="coin-img" src="${COIN_IMG}" alt="字面（乾隆通宝）" draggable="false"></span>
    <span class="coin-face cb"><img class="coin-img" src="${COIN_IMG_B}" alt="背面（满文宝泉）" draggable="false"></span>
  </span>`;
}

function renderCoinStage() {
  $$('#coins-stage .coin').forEach((el) => { el.classList.remove('tail', 'rolling'); el.innerHTML = coinHTML(); });
  $('#coin-result').textContent = '';
  $('#btn-toss').textContent = '摇第 1 轮';
  renderCoinStack();
}

function renderCoinStack() {
  // 用已投轮次重建爻（自下而上）
  const wrap = $('#coin-yaos');
  wrap.innerHTML = '';
  for (let i = 0; i < 6; i++) {
    const row = document.createElement('div');
    row.className = 'yao-row';
    const toss = coinTosses[i];
    let yang = true, moving = false, bar = '';
    if (toss) {
      const backs = toss[0] + toss[1] + toss[2];
      yang = backs === 1 || backs === 3;
      moving = backs === 0 || backs === 3;
      bar = yang
        ? '<span class="seg yang"></span>'
        : '<span class="seg yin"></span><span class="seg yin"></span>';
    }
    if (moving) row.classList.add('moving');
    row.innerHTML = `<span class="pos">${['初','二','三','四','五','上'][i]}爻</span>
      <span class="yao-bar">${bar}</span>`;
    wrap.appendChild(row);
  }
}

function renderManual() {
  const list = $('#manual-list');
  list.innerHTML = '';
  // 自上而下展示
  for (let i = 5; i >= 0; i--) {
    const y = manualYaos[i];
    const row = document.createElement('div');
    row.className = 'manual-row';
    row.innerHTML = `
      <span class="pos">${['初','二','三','四','五','上'][i]}爻</span>
      <span class="m-bar" data-act="yy">${barHtml(y.yinYang)}</span>
      <button class="move-btn ${y.moving ? 'on' : ''}" data-act="move">动</button>`;
    row.querySelector('[data-act="yy"]').addEventListener('click', () => {
      y.yinYang = y.yinYang === '阳' ? '阴' : '阳';
      renderManual();
    });
    row.querySelector('[data-act="move"]').addEventListener('click', () => {
      y.moving = !y.moving;
      renderManual();
    });
    list.appendChild(row);
  }
}

function barHtml(yy) {
  return yy === '阳'
    ? '<span class="seg yang"></span>'
    : '<span class="seg yin"></span><span class="seg yin"></span>';
}
