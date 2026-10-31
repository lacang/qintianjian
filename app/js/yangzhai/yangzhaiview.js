/*
 * yangzhaiview.js — 钦天监·阳宅（八宅实用版）
 * 五步：定坐向 → 九宫标房(门主灶) → 元运与居住者 → 门外形势 → 八宅直断
 * 纯本地：vendor/bazhai-core.js 翻卦 + yangzhai-judge.js 直断，不接 AI、不联网。
 */
import { $, $$, cfg, birthDate, escapeHtml } from '../state.js?v=124';
import {
  DIR8_LIST, MOUNTAINS_24, dir8At, mountainsAt, lifeGua, GROUP_NAME, chartFor,
} from '../../vendor/bazhai-core.js?v=124';
import {
  judgeYangzhai, fourJiDirs, ROOM_LABEL, SOURCES, SOURCE_NOTE,
} from './yangzhai-judge.js?v=124';
import { judgeXuankong, SOURCES as XK_SOURCES, SOURCE_NOTE as XK_NOTE } from './yangzhai-xuankong.js?v=124';
import { judgeJinsuo, judgeSanheWater, JINSUO_NOTE, SANHE_NOTE } from './yangzhai-jinsuo.js?v=124';

const DIRS9 = ['西北', '北', '东北', '西', '中', '东', '西南', '南', '东南'];
const ROOM_KINDS = ['door', 'master', 'second', 'living', 'kitchen', 'bath'];
const REQUIRED = ['door', 'master', 'kitchen'];

function freshState() {
  const y = birthDate().getFullYear();
  const g = (cfg.gender === '女') ? 'f' : 'm';
  return {
    step: 1,
    mount: { deg: null, locked: false, via: null },
    rooms: { door: [], master: [], second: [], living: [], kitchen: [], bath: [] },
    year: { built: null, move: null },
    person: { g, y },
    shapes: [],
    _curKind: null,
  };
}
let S = freshState();

/* ============================ 骨架 ============================ */
export function renderYangzhai() {
  return `
  <div class="yz-wrap">
    <div class="yz-hero">
      <h2>阳宅 · 看房子</h2>
      <p>站在屋里对大门，走四步就出结论：这套房对你吉不吉、门主卧厨房好不好、该怎么调。</p>
    </div>
    <div class="yz-steps" id="yz-steps">
      ${['坐向', '房间', '居住人', '形势', '直断'].map((t, i) =>
        `<div class="yz-step${i === 0 ? ' on' : ''}" data-s="${i + 1}">${['一', '二', '三', '四', '五'][i]}·${t}</div>`).join('')}
    </div>
    <div id="yz-panel"></div>
    <div class="yz-nav">
      <button class="yz-btn ghost" id="yz-prev">上一步</button>
      <button class="yz-btn primary" id="yz-next" disabled>下一步</button>
    </div>
    <details class="yz-note">
      <summary>这是什么算法？准吗？</summary>
      <p>${escapeHtml(SOURCE_NOTE)}</p>
      <p class="yz-muted">结论只供参考。风水是传统居住经验，遇到漏水、甲醛、采光通风、结构安全等实际问题，请优先按现代建筑与卫生标准处理。</p>
    </details>
  </div>`;
}

export function initYangzhai() {
  closeSheet();
  const root = $('#yangzhai-body');
  if (!root) return;
  // 事件只绑一次（#yangzhai-body 是常驻节点，重复 addEventListener 会让处理函数叠加）。
  // 但每次进入都必须走 goStep()：openSubview 每次都用 renderYangzhai() 把面板重置成空壳，
  // 若这里提前 return，二次进入就会停在空白面板（v121 真机验收发现，v120 同样存在）。
  if (root.dataset.yzBound !== '1') {
    root.dataset.yzBound = '1';
    root.addEventListener('click', onClick);
    root.addEventListener('input', onInput);
    root.addEventListener('change', onChange);
  }
  goStep(S.step);
}

/* ============================ 步骤切换 ============================ */
function goStep(n) {
  closeSheet();
  S.step = n;
  $$('#yangzhai-body .yz-step').forEach((el) => {
    const i = +el.dataset.s;
    el.classList.toggle('on', i === n);
    el.classList.toggle('done', i < n);
  });
  $('#yz-prev').disabled = n === 1;
  const next = $('#yz-next');
  if (n === 4) { next.textContent = '看结果'; next.disabled = false; }
  else if (n === 5) { next.style.display = 'none'; $('#yz-prev').style.display = 'none'; }
  else { next.style.display = ''; $('#yz-prev').style.display = ''; next.textContent = '下一步'; next.disabled = !stepReady(n); }
  refresh();
  window.scrollTo(0, 0);
}
function stepReady(n) {
  if (n === 1) return S.mount.locked;
  if (n === 2) return REQUIRED.every((k) => S.rooms[k].length > 0);
  return true;
}

/* ============================ 渲染各步 ============================ */
function refresh() {
  const p = $('#yz-panel');
  if (!p) return;
  if (S.step === 1) p.innerHTML = step1();
  else if (S.step === 2) p.innerHTML = step2();
  else if (S.step === 3) p.innerHTML = step3();
  else if (S.step === 4) p.innerHTML = step4();
  else p.innerHTML = step5();
  if (S.step === 3) renderMingHint();
}

function step1() {
  const m = S.mount;
  const sel8 = (d) => (m.locked && m.deg === d && m.via === '手动8方位') ? 'sel' : '';
  return `
  <div class="yz-card">
    <h4>① 大门朝哪边？</h4>
    <p class="yz-small">人站屋里、<b>脸朝大门外</b>，你面对的方向就是这套房的「朝向」。选一个大方向就够用，不用测。</p>
    <div class="yz-sel yz-sel8">
      ${DIR8_LIST.map((d, i) => `<button data-deg="${i * 45}" data-via="8方位" class="${sel8(i * 45)}">${d}</button>`).join('')}
    </div>
    <details class="yz-more">
      <summary>要更精确？24山 · 输度数 · 手机实测</summary>
      <div class="yz-sel yz-sel24" style="margin-top:10px">
        ${MOUNTAINS_24.map((mn, i) => `<button data-deg="${i * 15}" data-via="24山">${mn}</button>`).join('')}
      </div>
      <label class="yz-field"><span>或直接输朝向度数（0-359）</span>
        <input type="number" id="yz-deg" min="0" max="359" placeholder="例如 180 = 正南" value="${m.deg ?? ''}" /></label>
      <div class="yz-sensor">
        <p class="yz-small">手机平放、<b>顶端（听筒那边）朝门外</b>，红针尖对门外，读数→锁定。室内钢筋电器会干扰，不稳就用手选上面。</p>
        <div id="yz-sensor-fb" class="yz-warn" style="display:none"></div>
        <div class="yz-compass"><div class="yz-needle" id="yz-needle"></div><div class="yz-north">北</div></div>
        <div class="yz-readout"><span id="yz-degread">--</span>°</div>
        <p class="yz-small" style="text-align:center;margin:0 0 8px;color:#c9b97a">针尖朝向 ＝ 房门朝向</p>
        <div class="yz-row2"><button class="yz-btn ghost" id="yz-measure">开始测量</button>
          <button class="yz-btn ghost" id="yz-lock" disabled>锁定读数</button></div>
      </div>
    </details>
  </div>
  <div class="yz-read">${mountReadout()}</div>`;
}
function mountReadout() {
  const m = S.mount;
  if (!m.locked) return '<span class="yz-muted">还没定坐向，选好上方任一方位即可。</span>';
  const mm = mountainsAt(m.deg);
  return `✔ 已定：朝<b>${dir8At(m.deg)} · ${mm.chao}</b>　坐<b>${dir8At((m.deg + 180) % 360)} · ${mm.zuo}</b>　<span class="yz-muted">(${m.via})</span>`;
}

function step2() {
  return `
  <div class="yz-card">
    <h4>把房间摆进九宫</h4>
    <p class="yz-small">像拼豆：<b>直接点格子</b>，弹出选单选房间；想连摆就先点下面的功能豆、再连点几格。<b>大门、主卧、厨房必填</b>；一格可以放多个功能。</p>
    <div class="yz-funcs">
      ${ROOM_KINDS.map((k) => `<button class="yz-func ${S._curKind === k ? 'sel' : ''} ${S.rooms[k].length ? 'placed' : ''}" data-func="${k}" data-n="${S.rooms[k].length}"><span class="yz-dot yz-${k}"></span>${ROOM_LABEL[k]}</button>`).join('')}
    </div>
    <p class="yz-hint" id="yz-gridhint">${gridHint()}</p>
    <div class="yz-grid">
      ${DIRS9.map((d, ix) => `<div class="yz-cell ${S._curKind && S.rooms[S._curKind].includes(ix) ? 'hl' : ''}" data-ix="${ix}"><span class="yz-clabel">${d}</span><div class="yz-chips" id="yz-chips-${ix}">${chipsOf(ix)}</div></div>`).join('')}
    </div>
    <p class="yz-compass-n">北 ↑（按真实方位摆）</p>
    <button class="yz-btn ghost" id="yz-clear">清空重标</button>
  </div>`;
}
function chipsOf(ix) {
  return ROOM_KINDS.filter((k) => S.rooms[k].includes(ix))
    .map((k) => `<span class="yz-chip yz-${k}">${ROOM_LABEL[k]}</span>`).join('');
}
function gridHint() {
  const miss = REQUIRED.filter((k) => S.rooms[k].length === 0).map((k) => ROOM_LABEL[k]);
  if (S._curKind) return `连摆「${ROOM_LABEL[S._curKind]}」：点格子放置，再点功能豆结束`;
  return miss.length ? '还差必填：' + miss.join('、') : '门 / 主卧 / 厨房已齐，可进下一步';
}

/* ---------- 拼豆选单：点格子弹出，挂 body ---------- */
let sheetEl = null;
function closeSheet() { if (sheetEl) { try { sheetEl.remove(); } catch { } sheetEl = null; } }
function sheetGridHtml(ix) {
  return ROOM_KINDS.map((k) => {
    const on = S.rooms[k].includes(ix);
    return `<button class="yz-sheet-item ${on ? 'on' : ''}" data-sk="${k}"><span class="yz-dot yz-${k}"></span>${ROOM_LABEL[k]}${on ? '<em>✓</em>' : ''}</button>`;
  }).join('');
}
function openCellSheet(ix) {
  closeSheet();
  sheetEl = document.createElement('div');
  sheetEl.className = 'yz-sheet-mask';
  sheetEl._cellIx = ix;
  sheetEl.innerHTML = `<div class="yz-sheet">
    <div class="yz-sheet-h"><span>${ix === 4 ? '中宫' : DIRS9[ix] + '方'} · 放什么？</span><span class="yz-sheet-x" data-sx="1">✕</span></div>
    <div class="yz-sheet-grid">${sheetGridHtml(ix)}</div>
    <button class="yz-sheet-clear" data-sx="1">清空此格</button>
  </div>`;
  sheetEl.addEventListener('click', onSheetClick);
  (document.body || document.documentElement).appendChild(sheetEl);
}
function onSheetClick(e) {
  const ix = sheetEl ? sheetEl._cellIx : null;
  if (ix == null) return;
  const t = e.target;
  const item = t.closest ? t.closest('[data-sk]') : null;
  if (item) {
    const k = item.dataset.sk, arr = S.rooms[k], p = arr.indexOf(ix);
    if (p >= 0) arr.splice(p, 1); else arr.push(ix);
    const g = sheetEl.querySelector('.yz-sheet-grid'); if (g) g.innerHTML = sheetGridHtml(ix);
    const cell = document.getElementById('yz-chips-' + ix); if (cell) cell.innerHTML = chipsOf(ix);
    return;
  }
  const x = t.closest ? t.closest('[data-sx]') : null;
  if (x) {
    if (x.classList.contains('yz-sheet-clear')) ROOM_KINDS.forEach((k) => { S.rooms[k] = S.rooms[k].filter((v) => v !== ix); });
    closeSheet(); refresh();
    const nx = $('#yz-next'); if (nx) nx.disabled = !stepReady(S.step);
    return;
  }
  if (t === sheetEl) {
    closeSheet(); refresh();
    const nx = $('#yz-next'); if (nx) nx.disabled = !stepReady(S.step);
  }
}

function step3() {
  return `
  <div class="yz-card">
    <h4>居住者（算你本人的命卦用）</h4>
    <p class="yz-small">填<b>实际住在房里的人</b>（通常是房主/夫妻），不是房东也不是盖房的人；租房按现在住的人算。</p>
    <label class="yz-field"><span>性别</span>
      <select id="yz-gender">
        <option value="">请选择</option>
        <option value="m" ${S.person.g === 'm' ? 'selected' : ''}>男</option>
        <option value="f" ${S.person.g === 'f' ? 'selected' : ''}>女</option>
      </select></label>
    <label class="yz-field"><span>出生年</span>
      <input type="number" id="yz-birth" min="1920" max="2020" value="${S.person.y ?? ''}" placeholder="例如 1994" /></label>
    <div id="yz-ming" class="yz-okbox"></div>
  </div>
  <div class="yz-card">
    <h4>房屋年份（可不填）</h4>
    <p class="yz-small">八宅用不到年份；这里只做记录，将来上「玄空飞星」时才用。不确定可留空。</p>
    <label class="yz-field"><span>建造 / 最近大装修年</span>
      <input type="number" id="yz-built" min="1800" max="2100" value="${S.year.built ?? ''}" placeholder="例如 2003" /></label>
  </div>`;
}
function renderMingHint() {
  const box = $('#yz-ming');
  if (!box) return;
  const { y, g } = S.person;
  if (!y || !g) { box.style.display = 'none'; return; }
  try {
    const lg = lifeGua(y, g === 'm' ? 'male' : 'female');
    box.style.display = 'block';
    box.innerHTML = `你的命卦：<b>${lg.name}</b>（洛书${lg.luoshu}）· <b>${GROUP_NAME[lg.group]}命</b>`;
  } catch (e) { box.style.display = 'none'; }
}

const SHAPES = [
  ['背后有靠', '屋后有更高楼 / 山体', true],
  ['明堂开阔', '门前开阔不压抑', true],
  ['临近水体', '河、湖、大水池', null],
  ['路冲', '大路 / 长巷直冲大门', false],
  ['反弓', '道路河流弯弓外侧对房', false],
  ['尖角壁刀', '邻楼墙角、楼缝正对', false],
  ['缺角', '户型某方位明显缺失', false],
  ['电梯楼梯冲门', '电梯 / 楼梯口正对大门', false],
  ['电杆大树正对', '门前孤立高耸物正对', false],
];
function step4() {
  return `
  <div class="yz-card">
    <h4>门外形势（看到就勾，没有就跳过）</h4>
    <p class="yz-small">客观勾选即可，每项都会给传统说法和怎么处理，不吓唬人。</p>
    <div class="yz-checklist">
      ${SHAPES.map(([name, desc]) => `
        <label><input type="checkbox" data-shape="${name}" ${S.shapes.includes(name) ? 'checked' : ''}/>
        <div><b>${name}</b><span class="yz-muted">　${desc}</span></div></label>`).join('')}
    </div>
  </div>`;
}

/* ============================ 第5步：直断结果 ============================ */
function step5() {
  const r = judgeYangzhai(S);
  const fj = fourJiDirs(r);
  const toneCls = (t) => t === 'good' ? 'good' : t === 'bad' ? 'bad' : 'warn';
  const vcard = (v) => v ? `
    <div class="yz-vcard ${toneCls(v.tone)}">
      <div class="yz-vt">${v.title}</div>
      <p>${v.body}</p>
      <p class="yz-do">👉 ${v.advice}</p>
      <div class="yz-src">依据：${v.src.t}·${v.src.q}</div>
    </div>` : '';
  // 门外形势卡字段为 name（不是 title）
  const scard = (s) => s ? `
    <div class="yz-vcard ${toneCls(s.tone)}">
      <div class="yz-vt">${s.name}</div>
      <p>${s.body}</p>
      <p class="yz-do">👉 ${s.advice}</p>
      <div class="yz-src">依据：${s.src.t}·${s.src.q}</div>
    </div>` : '';

  // 本人命卦四吉方（命宅不同组时尤其有用）
  let lifeJi = '';
  if (r.person) {
    const lc = chartFor(r.person.key);
    const ji = ['shengqi', 'yannian', 'tianyi', 'fuwei'].map((k) => {
      const p = lc.find((x) => x.star.key === k);
      return `${p.dir}${p.star.name}`;
    });
    lifeJi = `
      <div class="yz-jibox">
        <b>你本命（${r.person.name}${GROUP_NAME[r.person.group]}命）的四吉方：</b>
        <div class="yz-jitags">${ji.map((t) => `<span>${t}</span>`).join('')}</div>
        <p class="yz-small yz-muted">命宅不同组时，主卧/床头优先靠你本命的生气、延年方，比单纯迁就宅卦更贴合你本人。</p>
      </div>`;
  }

  const issues = (r.issues || []).map(vcard).join('');
  const shapesGood = (r.shapeVerdicts || []).filter((x) => x.tone === 'good');
  const shapesBad = (r.shapeVerdicts || []).filter((x) => x.tone !== 'good' && x.tone !== 'neutral');
  const shapesNeutral = (r.shapeVerdicts || []).filter((x) => x.tone === 'neutral');

  return `
  <div class="yz-score yz-score-${toneCls(scoreTone(r.score.score))}">
    <div class="yz-score-num">${r.score.score}<span>分</span></div>
    <div class="yz-score-txt">${r.score.level}</div>
    <div class="yz-score-meta">坐${r.mount.zuoDir}${r.mount.zuo}向${r.mount.chaoDir}${r.mount.chao} · ${r.mount.house.name}宅${r.person ? ' · ' + r.person.name + GROUP_NAME[r.person.group] + '命' : ''}</div>
  </div>

  <div class="yz-sec-title">① 门、主卧、厨房（最关键三样）</div>
  ${vcard(r.doorVerdict)}
  ${vcard(r.masterVerdict)}
  ${vcard(r.kitchenVerdict)}

  ${r.zhaiMingVerdict ? `<div class="yz-sec-title">② 这房子和你合不合</div>${vcard(r.zhaiMingVerdict)}` : ''}

  ${issues ? `<div class="yz-sec-title">③ 结构上要注意</div>${issues}` : ''}

  <div class="yz-sec-title">${r.zhaiMingVerdict ? '四' : '三'}·这套房的四吉 / 四凶方位</div>
  <div class="yz-jibox">
    <b>本宅（${r.mount.house.name}宅）四吉方：</b>
    <div class="yz-jitags good">${fj.ji.map((p) => `<span>${p.dir}·${p.star.name}</span>`).join('')}</div>
    <b class="yz-xiongt">四凶方（宜压不宜住/开门）：</b>
    <div class="yz-jitags bad">${fj.xiong.map((p) => `<span>${p.dir}·${p.star.name}</span>`).join('')}</div>
    <p class="yz-small yz-muted">大门、主卧优先占生气/延年/天医；伏位宜静；绝命、五鬼最忌门与主卧，宜用厨房、卫浴或储物压住。</p>
  </div>
  ${lifeJi}

  ${shapesGood.length || shapesBad.length || shapesNeutral.length ? `
  <div class="yz-sec-title">门外形势</div>
  ${shapesGood.map(scard).join('')}
  ${shapesBad.map(scard).join('')}
  ${shapesNeutral.map(scard).join('')}` : ''}

  <details class="yz-note">
    <summary>算法与典籍依据（${r.person ? '坐山游年 + 东西四命' : '坐山游年'}）</summary>
    <p>${escapeHtml(SOURCE_NOTE)}</p>
    <ul class="yz-srclist">
      ${Object.values(SOURCES).slice(0, 5).map((s) => `<li><b>${s.t}</b>：${s.q}</li>`).join('')}
    </ul>
  </details>

  ${xuankongHTML()}

  ${jinsuoHTML()}

  ${sanheHTML()}

  <button class="yz-btn primary" id="yz-restart">重新测一套</button>`;
}

/* ============================ 玄空飞星（流派并列） ============================ */
function xuankongHTML() {
  const built = Number(S.year.built);
  if (!Number.isFinite(built) || built < 1900 || built > 2100) {
    return `<div class="yz-xk-off">
      <b>玄空飞星 · 另一派断法</b>
      <p>上一步没填「建成年份」，玄空飞星按元运排盘、必须知道房龄才断。想知道这一派怎么看这套房，回去第 3 步补一个大致年份即可。</p>
    </div>`;
  }
  let x;
  try {
    x = judgeXuankong({ facingDeg: S.mount.deg, buildYear: built, rooms: S.rooms, nowYear: new Date().getFullYear() });
  } catch (e) {
    return `<div class="yz-xk-off"><b>玄空飞星</b><p>排盘失败：${escapeHtml(String(e.message || e))}</p></div>`;
  }
  const toneCls = (t) => t === 'good' ? 'good' : t === 'bad' ? 'bad' : 'warn';
  const vcard = (v) => v ? `
    <div class="yz-vcard ${toneCls(v.tone)}">
      <div class="yz-vt">${v.title}</div>
      <p>${v.body}</p>
      <p class="yz-do">👉 ${v.advice || ''}</p>
      <div class="yz-src">依据：${v.src ? v.src.t + '·' + v.src.q : ''}</div>
    </div>` : '';
  // 飞星盘：九宫按 (西北北东北/西中东/西南南东南) 排，ms 山星上、fs 向星下
  const cell = (pc) => {
    const wang = (n) => Number(n) === x.period.number ? ' wang' : '';
    return `<div class="yz-xkcell"><span class="ms${wang(pc.ms)}">${pc.ms}</span><span class="fs${wang(pc.fs)}">${pc.fs}</span><em>${pc.palace}</em></div>`;
  };
  return `
  <div class="yz-xk">
    <div class="yz-sec-title">玄空飞星 · 另一派怎么看这套房</div>
    <div class="yz-xk-meta">${x.facing.label} · ${x.period.yuan}${x.period.number}运宅（${x.period.range[0]}–${x.period.range[1]}年建）· 现值${x.period.number === x.period.number ? '' : ''}当令为${x.period.status}</div>
    <div class="yz-xkboard">${x.chart.palaces.map(cell).join('')}</div>
    <p class="yz-small yz-muted">上排数字＝山星（管人丁健康），下排＝向星（管财路），高亮为当运旺星（${x.period.number}）。玄空与上面八宅是两套独立流派，看法可能不一致——并列呈现，取舍在你。</p>
    ${x.verdicts.map(vcard).join('')}
    <details class="yz-note">
      <summary>玄空算法与典籍依据</summary>
      <p>${escapeHtml(XK_NOTE)}</p>
      <ul class="yz-srclist">
        ${Object.values(XK_SOURCES).map((t) => `<li><b>${t.t}</b>：${t.q}</li>`).join('')}
      </ul>
    </details>
  </div>`;
}
/* ============================ 金锁玉关（流派并列） ============================ */
function jinsuoHTML() {
  let j;
  try {
    j = judgeJinsuo({ facingDeg: S.mount.deg });
  } catch (e) {
    return '';
  }
  const toneCls = (t) => t === 'good' ? 'good' : t === 'bad' ? 'bad' : 'warn';
  const vcard = (v) => `
    <div class="yz-vcard ${toneCls(v.tone)}">
      <div class="yz-vt">${v.title}</div>
      <p>${v.body}</p>
      <p class="yz-do">👉 ${v.advice}</p>
      <div class="yz-src">依据：${v.src.t}·${v.src.q}</div>
    </div>`;
  return `
  <div class="yz-xk">
    <div class="yz-sec-title">金锁玉关 · 第三派只看砂水</div>
    <div class="yz-xk-meta">坐${j.zuo.mountain}（${j.zuo.palace}宫·洛书${j.zuo.luoshu}·要${j.zuo.wantSha ? '砂' : '水'}） · 向${j.chao.mountain}（${j.chao.palace}宫·洛书${j.chao.luoshu}·要${j.chao.wantSha ? '砂' : '水'}）</div>
    <p class="yz-small yz-muted">砂＝高实之物（山、楼、柜、塔），水＝低虚流动（河、路、明堂、空地）。一派口诀「一二三四要砂、六七八九要水」，只看方位上砂水分布，与命卦无关——又与八宅、玄空两派并列，说法可能不一，取舍在你。</p>
    ${j.verdicts.map(vcard).join('')}
    <details class="yz-note">
      <summary>二十四山砂水表</summary>
      <div class="yz-jsgrid">
        ${j.table.map((r) => `<span class="yz-jscell ${r.wantSha ? 'wsha' : 'wshui'}">${r.mountain}<i>${r.palace}${r.luoshu}</i><b>${r.wantSha ? '要砂' : '要水'}</b></span>`).join('')}
      </div>
      <p>${escapeHtml(JINSUO_NOTE)}</p>
    </details>
  </div>`;
}

/* ============================ 三合水法（流派并列） ============================ */
function sanheHTML() {
  let w;
  try {
    w = judgeSanheWater({ facingDeg: S.mount.deg });
  } catch (e) {
    return '';
  }
  const toneCls = (t) => t === 'good' ? 'good' : t === 'bad' ? 'bad' : 'warn';
  const vcard = (v) => `
    <div class="yz-vcard ${toneCls(v.tone)}">
      <div class="yz-vt">${v.title}</div>
      <p>${v.body}</p>
      <p class="yz-do">👉 ${v.advice}</p>
      <div class="yz-src">依据：${v.src.t}·${v.src.q}</div>
    </div>`;
  return `
  <div class="yz-xk">
    <div class="yz-sec-title">三合水法 · 第四派论来去水</div>
    <div class="yz-xk-meta">坐${w.zuo}入${w.bureau.name}（${w.bureau.branches.join('')}三合） · 长生在${w.bureau.changsheng}</div>
    <p class="yz-small yz-muted">三合派以坐山定局、十二长生排山：生旺方来水、墓绝方去水为吉。城市无真水，以大路、街道、动线视之。</p>
    <div class="yz-shcycle">
      ${w.cycle.map((c) => `<span class="yz-shc ${/长生|临官|帝旺|墓/.test(c.stage) ? 'hi' : (/沐浴|绝/.test(c.stage) ? 'lo' : '')}"><b>${c.stage}</b>${c.mountain}</span>`).join('')}
    </div>
    ${w.verdicts.map(vcard).join('')}
    <details class="yz-note">
      <summary>三合水法算法与典籍</summary>
      <p>${escapeHtml(SANHE_NOTE)}</p>
    </details>
  </div>`;
}

function scoreTone(s) { return s >= 80 ? 'good' : s >= 62 ? 'warn' : s >= 45 ? 'warn' : 'bad'; }

/* ============================ 事件 ============================ */
function onClick(e) {
  const t = e.target.closest('button, .yz-cell, .yz-func');
  if (!t) return;
  const id = t.id || '';

  if (id === 'yz-prev') { if (S.step > 1 && S.step < 5) goStep(S.step - 1); return; }
  if (id === 'yz-next') {
    if (S.step === 4) { goStep(5); return; }
    if (stepReady(S.step)) goStep(S.step + 1);
    return;
  }
  if (id === 'yz-restart') { S = freshState(); $('#yz-prev').style.display = ''; $('#yz-next').style.display = ''; goStep(1); return; }
  if (id === 'yz-clear') {
    ROOM_KINDS.forEach((k) => (S.rooms[k] = [])); S._curKind = null; refresh();
    $('#yz-next').disabled = !stepReady(2); return;
  }

  // step1 方位（8方位/24山按钮自带 via）
  if (t.dataset.deg != null && S.step === 1) { pickMount(+t.dataset.deg, '手动' + (t.dataset.via || '方位')); return; }

  // step2 功能豆 & 格子
  if (t.classList.contains('yz-func')) {
    const k = t.dataset.func;
    S._curKind = S._curKind === k ? null : k;
    refresh(); $('#yz-next').disabled = !stepReady(2); return;
  }
  if (t.classList.contains('yz-cell') && S.step === 2) {
    const ix = +t.dataset.ix, k = S._curKind;
    if (!k) { openCellSheet(ix); return; }
    const arr = S.rooms[k];
    const p = arr.indexOf(ix); if (p >= 0) arr.splice(p, 1); else arr.push(ix);
    refresh(); $('#yz-next').disabled = !stepReady(2); return;
  }

  // 磁力计
  if (id === 'yz-measure') { startMeasure(); return; }
  if (id === 'yz-lock') { lockMeasure(); return; }
}

function onInput(e) {
  const t = e.target;
  if (t.id === 'yz-deg') { const v = +t.value; if (v >= 0 && v <= 359) pickMount(v, '手动度数'); }
  if (t.id === 'yz-birth') { S.person.y = t.value ? +t.value : null; renderMingHint(); }
  if (t.id === 'yz-built') { S.year.built = t.value ? +t.value : null; }
}
function onChange(e) {
  const t = e.target;
  if (t.id === 'yz-gender') { S.person.g = t.value || null; renderMingHint(); }
  if (t.dataset.shape) {
    const name = t.dataset.shape;
    if (t.checked) { if (!S.shapes.includes(name)) S.shapes.push(name); }
    else S.shapes = S.shapes.filter((x) => x !== name);
  }
}

function pickMount(deg, via) {
  S.mount.deg = Math.round(deg); S.mount.locked = true; S.mount.via = via;
  refresh();
  const nx = $('#yz-next'); if (nx) nx.disabled = false;
}

/* ---------- 磁力计（容错降级） ---------- */
let measuring = false, samples = [], handler = null;
function sensorFail(msg) {
  const fb = $('#yz-sensor-fb');
  if (fb) { fb.style.display = 'block'; fb.textContent = '⚠ ' + msg; }
  const b = $('#yz-measure'); if (b) b.disabled = true;
}
function startMeasure() {
  if (!window.isSecureContext) { sensorFail('需要 https 安全环境才能调指南针，请直接用上方手动选方位。'); return; }
  if (!('DeviceOrientationEvent' in window)) { sensorFail('这个浏览器不支持方向传感器，请用手动选方位。'); return; }
  const D = window.DeviceOrientationEvent;
  const begin = () => {
    measuring = true; samples = [];
    const b = $('#yz-measure'); if (b) b.textContent = '测量中…';
    handler = (ev) => {
      let a = (ev.webkitCompassHeading != null) ? ev.webkitCompassHeading : (ev.alpha == null ? null : (360 - ev.alpha) % 360);
      if (a == null) return;
      samples.push(a); if (samples.length > 30) samples.shift();
      const avg = samples.reduce((x, y) => x + y, 0) / samples.length;
      const rd = $('#yz-degread'); if (rd) rd.textContent = avg.toFixed(1);
      const nd = $('#yz-needle'); if (nd) nd.style.transform = `rotate(${avg}deg)`;
      const lk = $('#yz-lock');
      if (lk) lk.disabled = samples.length < 8;
    };
    window.addEventListener('deviceorientation', handler);
  };
  if (typeof D.requestPermission === 'function') {
    D.requestPermission().then((p) => { if (p === 'granted') begin(); else sensorFail('未获得指南针授权，请用手动选方位。'); })
      .catch(() => sensorFail('调用传感器出错，请用手动选方位。'));
  } else begin();
}
function lockMeasure() {
  const rd = $('#yz-degread');
  const v = parseFloat(rd && rd.textContent);
  if (isNaN(v)) return;
  pickMount(v, '手机实测');
  const b = $('#yz-measure'); if (b) b.textContent = '重新测量';
}

/* ============================ 复制 ============================ */
export function yangzhaiCopyText() {
  if (S.step !== 5) return '阳宅：尚未完成测算。';
  const r = judgeYangzhai(S);
  const L = [];
  L.push(`【钦天监·阳宅直断】${r.score.score}分 ${r.score.level}`);
  L.push(`坐${r.mount.zuoDir}${r.mount.zuo}向${r.mount.chaoDir}${r.mount.chao}，${r.mount.house.name}宅${r.person ? '，居住者' + r.person.name + GROUP_NAME[r.person.group] + '命' : ''}`);
  const pull = (v) => v ? `· ${v.title}\n  ${v.body}\n  建议：${v.advice}` : null;
  [r.doorVerdict, r.masterVerdict, r.kitchenVerdict, r.zhaiMingVerdict, ...(r.issues || [])]
    .map(pull).filter(Boolean).forEach((x) => L.push(x));
  (r.shapeVerdicts || []).forEach((s) => L.push(`· 形势·${s.name}：${s.body}`));
  return L.join('\n');
}

/* ============================ v121 复现码 ============================ */
// 阳宅的全部输入都能紧凑记录：坐向、六类房间的九宫掩码、建房年、居住人、门外形势勾选
export function yangzhaiCode() {
  const names = SHAPES.map(([n]) => n);
  return {
    kind: 'yangzhai',
    data: {
      at: Date.now(),
      facingDeg: S.mount.deg ?? 0,
      rooms: S.rooms,
      built: S.year.built ?? 1800,
      personY: S.person.y,
      personG: S.person.g,
      shapes: S.shapes.map((n) => names.indexOf(n)).filter((i) => i >= 0),
    },
    title: '阳宅 · 宅盘',
    sub: S.mount.deg == null
      ? '坐向未定'
      : `坐向 ${Math.round(S.mount.deg)}° · ${S.year.built ? S.year.built + ' 年建' : '建年未填'}`,
  };
}

export function restoreYangzhai(d) {
  S = freshState();
  if (d.facingDeg > 0) S.mount = { deg: d.facingDeg, locked: true, via: 'code' };
  if (d.rooms) for (const k of ROOM_KINDS) S.rooms[k] = Array.isArray(d.rooms[k]) ? d.rooms[k].slice() : [];
  S.year.built = d.built && d.built !== 1800 ? d.built : null;
  if (d.personY) S.person.y = d.personY;
  if (d.personG) S.person.g = d.personG;
  const names = SHAPES.map(([n]) => n);
  S.shapes = (d.shapes || []).map((i) => names[i]).filter(Boolean);
  S.step = 5;
  return true;
}
