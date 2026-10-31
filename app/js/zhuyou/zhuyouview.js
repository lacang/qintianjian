// 符箓祝由 · 视图（v99 实用化重做）纯本地、只展示原典文献事实；不生成新符、不编写咒语。
// v99 重做要点（主人 2026-10-24 拍板）：
//   ① 处境入口为默认（按"我想办的事"进，典籍浏览退居第二）
//   ② 每条自动分三态：张口能做（口诀手诀空手可行）/ 需备物（列出原典所载物件）/ 含吞服⚠（红标，仅文献研究）
//   ③ 白话"怎么用"导读一句话（依原典文字机械归纳，不创作新内容）
//   ④ 学术内容（考据/辨伪/传承）折叠进条目内层，不打断使用
//   ⑤ 吞服与急病安全提示：页顶红带 + 条目级红标
import { ZHUYOU_ITEMS } from './zhuyou-data.js?v=125';
import { JINJING_ITEMS } from './zhuyou-data-jinjing.js?v=125';
import { SHISANKE_ITEMS } from './zhuyou-data-shisanke.js?v=125';
import {
  EVIDENCE, STATE, LINEAGE, SITUATIONS, FU_PARTS, SOURCES,
  PSEUDO_LAYERS, OFFICE_ANCHORS,
} from './zhuyou-meta.js?v=125';
import { $, esc } from './zhuyou-util.js?v=125';

const EV_KLASS = { HIGH: 'zy-ev-h', MEDIUM: 'zy-ev-m', LOW: 'zy-ev-l' };
const ST_KLASS = { THEORY: 'zy-st-t', RITUAL: 'zy-st-r', REPRO: 'zy-st-p' };

// ── 合并 + 排序键 ──────────────────────────────
function groupOf(it) {
  if (it.sourceKey === 'qianjin_jinjing') {
    return { book: `千金翼方·禁经（卷${it.juan === '上' ? '二十九·上' : '三十·下'}）`, pian: it.pian || '', order: it.juan === '上' ? 0 : 1 };
  }
  if (it.sourceKey === 'zhuyou13') {
    return { book: '祝由十三科（元明坊本·秘字条）', pian: '', order: 2 };
  }
  const s = SOURCES[it.sourceKey] || {};
  return { book: s.title || it.sourceKey, pian: '', order: 3 };
}

const SIT_NAME = Object.fromEntries(SITUATIONS.map(s => [s.id, s.name]));
const SIT_RISK = Object.fromEntries(SITUATIONS.map(s => [s.id, !!s.risk]));

// ── 三态用法归类（依原典文字机械判定，不加入任何原典以外的操作建议） ──────────────────────────────
const ING_RE = /吞之|吞服|吞符|服之|服灰|饮之|饮符|吞墨|服墨|噙/;
const MAT_RE = /朱砂|朱|墨|纸|笔|桃符|桃木|烧香|香|酒|净席|席|艾|镜|剑|印|佩|贴|书于|系于|彩|丝|钱|灰/;
const MAT_CANON = [
  ['朱砂', '朱砂'], ['桃符', '桃符'], ['桃木', '桃木'], ['烧香', '香'], ['净席', '净席'],
  ['朱', '朱'], ['墨', '墨'], ['纸', '纸'], ['笔', '笔'], ['香', '香'], ['酒', '酒'],
  ['席', '净席'], ['艾', '艾'], ['镜', '镜'], ['剑', '剑'], ['印', '印'], ['灰', '纸灰'],
  ['佩', '佩绳'], ['贴', '贴用'], ['彩', '彩缯'], ['丝', '丝线'], ['钱', '钱'],
];

function classifyHow(it) {
  const t = [it.name, it.summary, it.originalText || '',
    ...(it.applyMethod || []), ...(it.ritualSteps || []).map(s => s.text || ''),
    it.medicine || ''].join(' ');
  if (ING_RE.test(t)) {
    const hit = (t.match(ING_RE) || ['吞服'])[0];
    return { k: 'ingest', mats: [], hit, plain: `⚠ 原典含「${hit}」类吞服内容——历史上确有此法，但吞符纸、服纸灰、和酒服药符均有毒性与窒息风险，仅供文献研究，切勿模仿；相关急症请立即就医。` };
  }
  if (MAT_RE.test(t)) {
    const mats = [];
    for (const [kw, name] of MAT_CANON) {
      if (t.includes(kw) && !mats.includes(name)) mats.push(name);
      if (mats.length >= 5) break;
    }
    return { k: 'object', mats, plain: `原典载需备物件：${mats.slice(0, 5).join('、')}等——属"需备物"一路，非空手可行。` };
  }
  return {
    k: 'mouth', mats: [],
    plain: it.ritualSteps && it.ritualSteps.length
      ? '原典所载只用口与手：诵禁文、捻掌诀、噀水存想，皆空手可行（无物件门槛）。'
      : '原典所载以口诵禁文为主，不假外物——属"张口能做"一路。',
  };
}

const ALL_ITEMS = [
  ...JINJING_ITEMS,
  ...SHISANKE_ITEMS,
  ...ZHUYOU_ITEMS,
].map(it => ({ ...it, _g: groupOf(it), _how: classifyHow(it) }));

const HOW_META = {
  mouth: { t: '张口能做', cls: 'zy-how-mouth', tip: 'zy-how' },
  object: { t: '需备物', cls: 'zy-how-object', tip: 'zy-how' },
  ingest: { t: '吞服⚠', cls: 'zy-how-ingest', tip: 'zy-how' },
};

// 处境 → 白话场景（贴合传统名目，不用现代心理标签）
const SIT_ASK = {
  zonggang: '想学受禁持法的人', anzhen: '家宅不安 · 新居入宅', bixie: '觉得不干净 · 怕冲撞',
  bibing: '要进危险之地 · 护身', yuanxing: '要出远门', liaobing: '身上有病（须先就医）',
  zhixue: '受了外伤出血（先急救！）', cuisheng: '产难相关（先送医！）', xiaoer: '小孩夜啼惊风',
  yanmu: '眼睛不舒服', kouchi: '牙痛 · 骨鲠 · 咽喉（先就医）', chuangzhong: '疮肿毒疮（先就医）',
  jinchong: '虫蛇犬兽所伤（先就医）', qingyu: '求晴求雨', quhuang: '蝗灾虫害',
  sangzang: '丧葬镇墓解注', qita: '其他书禁杂事',
};

function src(key) { return SOURCES[key] || {}; }
function lineT(v) { return (v && typeof v === 'object') ? v : (LINEAGE[v] || LINEAGE.UNKNOWN); }
function evBadge(e) {
  const o = EVIDENCE[e] || { t: e };
  return `<span class="zy-badge ${EV_KLASS[e] || ''}" data-tip="zy-evidence">${esc(o.t)}</span>`;
}
function stBadge(s) {
  const o = STATE[s] || { t: s };
  return `<span class="zy-badge ${ST_KLASS[s] || ''}" data-tip="zy-state">${esc(o.t)}</span>`;
}

// ── 条目行：用法在前 · 原文居中 · 考据折叠 ──────────────────────────────
function itemRow(it) {
  const s = src(it.sourceKey);
  const hm = HOW_META[it._how.k];
  const howChip = `<span class="zy-how ${hm.cls}" data-tip="${hm.tip}">${hm.t}</span>`;
  const apply = (it.applyMethod && it.applyMethod.length)
    ? it.applyMethod.map(a => `<span class="zy-chip">${esc(a)}</span>`).join('') : '';
  const fu = it.fuStructure
    ? `<div class="zy-fumini">${FU_PARTS.map(p => it.fuStructure[p.id] ? `<div class="zy-fumini-i"><b>${esc(p.name)}</b><span>${esc(it.fuStructure[p.id])}</span></div>` : '').filter(Boolean).join('')}</div>` : '';
  const steps = (it.ritualSteps && it.ritualSteps.length)
    ? `<div class="zy-steps">${it.ritualSteps.map(st => `<div class="zy-step"><span class="zy-step-n">${st.seq}</span><span class="zy-step-t">${esc(st.text)}</span></div>`).join('')}<div class="zy-risk">仅作文献复原展示，不建议也不应据此实际操作。</div></div>` : '';
  const orig = it.originalText
    ? `<div class="zy-orig"><div class="zy-orig-h">原典逐字${it._incant ? '（含咒辞）' : ''}</div><div class="zy-orig-b">${esc(it.originalText)}</div>${it.originalTextNote ? `<div class="zy-orig-n">${esc(it.originalTextNote)}</div>` : ''}</div>`
    : `<div class="zy-orig zy-orig-pend"><div class="zy-orig-h">原文 / 符图</div><div class="zy-orig-b">${esc(it.originalTextNote || '待据公版原刻影像校补，本系统不转录二手咒辞、不重绘符图。')}</div>${it.imgStatus ? `<div class="zy-orig-n">影像状态：${esc(it.imgStatus)}</div>` : ''}</div>`;

  return `<details class="zy-row${it._how.k === 'ingest' ? ' is-ingest' : ''}${it.modernMedicine ? ' is-risk' : ''}">
  <summary class="zy-row-s">
    <span class="zy-row-t">${esc(it.name)}</span>
    <span class="zy-row-badges">${howChip}${evBadge(it.evidence)}${stBadge(it.state)}${it._incant ? '<span class="zy-flag zy-flag-inc">咒</span>' : ''}${it.modernMedicine ? '<span class="zy-flag zy-flag-med" data-tip="zy-health">医</span>' : ''}</span>
    <span class="zy-row-loc">${esc(it._g.book)}${it._g.pian ? ' · ' + esc(it._g.pian) : ''}${it.locator && it.sourceKey !== 'qianjin_jinjing' ? ' · ' + esc(it.locator) : ''}</span>
    <span class="zy-row-sum">${esc(it.summary || '')}</span>
  </summary>
  <div class="zy-row-b">
    ${it._how.k === 'ingest' ? `<div class="zy-band zy-band-ingest"><b>吞服警告</b><span>${esc(it._how.plain)}</span></div>` : ''}
    <div class="zy-usage"><b>怎么用（白话导读）</b><p>${esc(it._how.plain)}</p>
      ${(it.state === 'REPRO' || it.state === 'RITUAL') ? '' : `<p class="zy-usage-dim">此条为「${(STATE[it.state] || {}).t || it.state}」——原典只存名目/原理，无完整步骤可循。</p>`}
    </div>
    ${it.state === 'REPRO' ? steps : ''}
    ${orig}${fu}
    ${it.state !== 'REPRO' ? steps : ''}
    ${apply ? `<div class="zy-apply"><b>原典施符方式：</b>${apply}</div>` : ''}
    ${it.medicine ? `<div class="zy-med"><b>并用药引：</b>${esc(it.medicine)}</div>` : ''}
    <details class="zy-schol"><summary>考据 · 辨伪 · 传承</summary>
      ${it.detail ? `<p class="zy-detail">${esc(it.detail)}</p>` : ''}
      ${it.pseudonym ? `<div class="zy-pseudo"><b>辨伪：</b>${esc(it.pseudonym)}</div>` : ''}
      <div class="zy-row-foot">
        <span class="zy-line" data-tip="zy-lineage">传承：${esc(lineT(it.lineage).t)}</span>
        ${it.tags && it.tags.length ? `<span class="zy-tags">${it.tags.map(t => `<span class="zy-tag">#${esc(t)}</span>`).join('')}</span>` : ''}
      </div>
    </details>
    ${it.modernMedicine ? `<div class="zy-medi"><span class="zy-medi-k">现代医学</span><span>${esc(it.modernMedicine)}</span></div>` : ''}
  </div>
</details>`;
}

// ── 分组渲染 ──────────────────────────────
function groupByBook(items) {
  const groups = [];
  const map = new Map();
  for (const it of items) {
    const key = it._g.book;
    if (!map.has(key)) { const g = { book: key, order: it._g.order, pian: new Map(), flat: [] }; map.set(key, g); groups.push(g); }
    const g = map.get(key);
    g.flat.push(it);
    if (it._g.pian) {
      if (!g.pian.has(it._g.pian)) g.pian.set(it._g.pian, []);
      g.pian.get(it._g.pian).push(it);
    }
  }
  groups.sort((a, b) => a.order - b.order);
  return groups;
}

function renderBooks(items) {
  const groups = groupByBook(items);
  return groups.map(g => {
    let body;
    if (g.pian.size) {
      body = [...g.pian.entries()].map(([pian, list]) =>
        `<div class="zy-pian"><div class="zy-pian-h">${esc(pian)}<span class="zy-pian-n">${list.length}</span></div><div class="zy-rows">${list.map(itemRow).join('')}</div></div>`).join('');
    } else {
      body = `<div class="zy-rows">${g.flat.map(itemRow).join('')}</div>`;
    }
    return `<section class="zy-book"><div class="zy-book-h" id="zybk-${esc(g.book)}">${esc(g.book)}<span class="zy-book-n">${g.flat.length} 条</span></div>${body}</section>`;
  }).join('');
}

function renderBySituation(items) {
  return SITUATIONS.map(sit => {
    const list = items.filter(it => it.situation === sit.id);
    if (!list.length) return '';
    const nMouth = list.filter(it => it._how.k === 'mouth').length;
    return `<section class="zy-book"><div class="zy-book-h">${esc(sit.name)}${sit.risk ? '<i class="zy-dot"></i>' : ''}<span class="zy-book-n">${list.length} 条 · 张口能做 ${nMouth}</span></div>
    ${SIT_ASK[sit.id] ? `<div class="zy-ask">${esc(SIT_ASK[sit.id])}${sit.risk ? '——此类急症请先就医 / 拨打急救电话，符禁文献仅作文化了解' : ''}</div>` : ''}
    <div class="zy-rows">${list.map(itemRow).join('')}</div></section>`;
  }).join('');
}

export function renderZhuyou() {
  const root = $('#zhuyou-body');
  if (!root) return;

  // 处境计数（与过滤同源，杜绝计数/高亮不一致）
  const sitCounts = {};
  ALL_ITEMS.forEach(it => { sitCounts[it.situation] = (sitCounts[it.situation] || 0) + 1; });
  const sitChips = SITUATIONS
    .filter(s => sitCounts[s.id])
    .map(s => `<button class="zy-sit" data-sit="${s.id}">${esc(s.name)}${s.risk ? '<i class="zy-dot"></i>' : ''}<span class="zy-sit-n">${sitCounts[s.id]}</span></button>`).join('');
  const nHow = { mouth: 0, object: 0, ingest: 0 };
  ALL_ITEMS.forEach(it => { nHow[it._how.k]++; });

  root.innerHTML = `
  <div class="zy-intro">
    <h3>符箓 · 祝由</h3>
    <p>历代<strong>公版原典</strong>中符箓、祝由、禁咒文献的<strong>整理与实用化查阅</strong>。按「我想办的事」进入；每条标注能不能空手做、要备什么、有无吞服风险。现录 <b>${ALL_ITEMS.length}</b> 条，主干为唐·孙思邈《千金翼方·禁经》二十二篇逐字原文。</p>
    <div class="zy-intro-tags">
      <span class="zy-tag" data-tip="zy-how">张口能做 ${nHow.mouth} 条</span>
      <span class="zy-tag" data-tip="zy-how">需备物 ${nHow.object} 条</span>
      <span class="zy-tag" data-tip="zy-how">含吞服⚠ ${nHow.ingest} 条</span>
      <span class="zy-tag" data-tip="zy-layer">名同实异·三层辨伪</span>
      <span class="zy-tag" data-tip="zy-evidence">每条标可信等级</span>
    </div>
  </div>

  <div class="zy-band zy-band-risk">
    <b>健康与安全提示</b>
    <span>吞符、服纸灰、朱砂/雄黄/附子等均有毒性或安全风险；难产、出血、骨折、异物卡喉、蛇犬咬伤、婴幼急症等请立即就医或拨打急救电话。本页所载为历史文献的实用化陈列，<strong>不构成任何治疗建议</strong>；"张口能做"仅指原典所载不需外物，不代表有效或安全。</span>
  </div>

  <div class="zy-toolbar">
    <div class="zy-search">
      <input id="zy-q" type="search" placeholder="搜处境 / 病名 / 篇名 / 咒辞，如 疟、蛇、金疮、夜啼" autocomplete="off" />
      <span class="zy-search-n" id="zy-count"></span>
    </div>
    <div class="zy-quick">
      <button class="zy-qk is-on" data-how="__all">全部<span class="zy-sit-n">${ALL_ITEMS.length}</span></button>
      <button class="zy-qk" data-how="mouth">张口能做<span class="zy-sit-n">${nHow.mouth}</span></button>
      <button class="zy-qk" data-how="object">需备物<span class="zy-sit-n">${nHow.object}</span></button>
      <button class="zy-qk zy-qk-warn" data-how="ingest">含吞服⚠<span class="zy-sit-n">${nHow.ingest}</span></button>
    </div>
    <div class="zy-tabs">
      <button class="zy-tab is-on" data-view="sits">按处境</button>
      <button class="zy-tab" data-view="books">按典籍</button>
    </div>
    <div class="zy-sits" id="zy-sits">
      <button class="zy-sit is-on" data-sit="__all">全部<span class="zy-sit-n">${ALL_ITEMS.length}</span></button>
      ${sitChips}
    </div>
  </div>

  <div id="zy-result"></div>
  <div class="zy-empty" id="zy-empty" hidden>没有匹配的条目，换个关键词试试。</div>

  <details class="zy-framework">
    <summary>学术框架：符的结构 · 三层辨伪 · 官制锚点 · 底本来源</summary>
    <section class="zy-sec">
      <div class="zy-sec-h"><h4>一道符的结构（道教学界共识）</h4></div>
      <div class="zy-fuparts">${FU_PARTS.map((p, i) => `
        <div class="zy-fupart"><span class="zy-fu-n">${i + 1}</span><div><b>${esc(p.name)}</b><p>${esc(p.desc)}</p></div></div>`).join('')}
      </div>
      <p class="zy-funote">据《道法会元》《上清灵宝大法》；符图一律取自公版原刻影像，本系统不自绘。</p>
    </section>
    <section class="zy-sec">
      <div class="zy-sec-h"><h4>辨伪：三层“祝由”名同实异</h4></div>
      <div class="zy-layers">${PSEUDO_LAYERS.map(l => `
        <div class="zy-layer"><div class="zy-layer-h"><span class="zy-layer-n">${l.layer}</span><b>${esc(l.name)}</b><span class="zy-era">${esc(l.era)}</span></div>
        <p>${esc(l.core)}</p><div class="zy-loc">${esc(l.basis)}</div></div>`).join('')}
      </div>
    </section>
    <section class="zy-sec">
      <div class="zy-sec-h"><h4>官制时间锚点（断代用）</h4></div>
      <div class="zy-tl">${OFFICE_ANCHORS.map(a => `<div class="zy-tl-i"><span class="zy-tl-e">${esc(a.era)}</span><span>${esc(a.office)}</span></div>`).join('')}</div>
    </section>
    <section class="zy-sec">
      <div class="zy-sec-h"><h4>底本来源（${Object.keys(SOURCES).length} 部）</h4></div>
      <div class="zy-srcs">${Object.values(SOURCES).map(s => `
        <details class="zy-src"><summary>${evBadge(s.evidence)}<b>${esc(s.title)}</b><span class="zy-era">${esc(s.era)}</span></summary>
        <div class="zy-src-b">
          <div class="zy-src-t"><span>${esc(s.nature)}</span><span>公版：${s.publicDomain ? '是' : '否/待个案确认'}</span></div>
          <p>${esc(s.note)}</p>
        </div></details>`).join('')}
      </div>
    </section>
  </details>

  <footer class="zy-foot">
    <p>分层声明：① 文献事实（书名/卷次/年代/性质）与 ② 古人灵验主张严格分开；本系统只陈列①并转述②为“古人如此主张”，不预设超自然效力，也不替你下真假结论。三态用法（张口能做/需备物/含吞服⚠）依原典文字所载物件与服食内容机械判定，为阅读便利之归纳，非操作指引。</p>
    <p>咒辞、符图无公版原刻影像者标“待校补”，不据二手转述拼造；《禁经》正文据元大德刊本影刻系统转录并参校多本，个别异体字保留原样；涉《藏外道书》等现代版权本不复制其扫描图。</p>
  </footer>`;

  // ── 单一状态 + 单一渲染 ──
  const state = { view: 'sits', q: '', sit: '__all', how: '__all' };
  const result = $('#zy-result');
  const empty = $('#zy-empty');
  const countEl = $('#zy-count');
  const q = $('#zy-q');
  const tabs = root.querySelectorAll('.zy-tab');
  const sitsWrap = $('#zy-sits');
  const qks = root.querySelectorAll('.zy-qk');

  function applyFilter() {
    const kws = state.q.trim().toLowerCase().split(/\s+/).filter(Boolean);
    let items = ALL_ITEMS.slice();
    if (state.sit !== '__all') items = items.filter(it => it.situation === state.sit);
    if (state.how !== '__all') items = items.filter(it => it._how.k === state.how);
    if (kws.length) {
      items = items.filter(it => {
        const hay = [it.name, it.summary, it.originalText, it.locator, it._g.book, it._g.pian,
          it.medicine, (it.tags || []).join(' '), SIT_NAME[it.situation] || ''].join(' ').toLowerCase();
        return kws.every(k => hay.includes(k));
      });
    }
    countEl.textContent = `${items.length} / ${ALL_ITEMS.length}`;
    empty.hidden = items.length !== 0;
    result.innerHTML = state.view === 'books' ? renderBooks(items) : renderBySituation(items);
  }

  q.addEventListener('input', () => { state.q = q.value; applyFilter(); });
  tabs.forEach(t => t.addEventListener('click', () => {
    tabs.forEach(x => x.classList.remove('is-on'));
    t.classList.add('is-on');
    state.view = t.dataset.view;
    sitsWrap.hidden = state.view !== 'sits';
    applyFilter();
  }));
  qks.forEach(b => b.addEventListener('click', () => {
    qks.forEach(x => x.classList.remove('is-on'));
    b.classList.add('is-on');
    state.how = b.dataset.how;
    applyFilter();
  }));
  sitsWrap.querySelectorAll('.zy-sit').forEach(ch => ch.addEventListener('click', () => {
    sitsWrap.querySelectorAll('.zy-sit').forEach(x => x.classList.remove('is-on'));
    ch.classList.add('is-on');
    state.sit = ch.dataset.sit;
    applyFilter();
  }));

  // 默认"按处境 · 全部"，首屏即处境入口
  applyFilter();
}

export function zhuyouCopyText() {
  const lines = [];
  lines.push(`【符箓·祝由 原典实用化查阅】共 ${ALL_ITEMS.length} 条（张口能做 ${ALL_ITEMS.filter(i => i._how.k === 'mouth').length} / 需备物 ${ALL_ITEMS.filter(i => i._how.k === 'object').length} / 含吞服⚠ ${ALL_ITEMS.filter(i => i._how.k === 'ingest').length}）`);
  lines.push('（仅文献整理，不构成治疗建议；吞服类切勿模仿）');
  const groups = groupByBook(ALL_ITEMS);
  for (const g of groups) {
    lines.push(`\n■ ${g.book}（${g.flat.length} 条）`);
    for (const it of g.flat) {
      const so = src(it.sourceKey);
      lines.push(`· ${it.name}｜${it._g.pian || so.title} [${(EVIDENCE[it.evidence] || {}).t || it.evidence}/${(STATE[it.state] || {}).t || it.state}/${HOW_META[it._how.k].t}]`);
      if (it.originalText) lines.push(`  原文：${String(it.originalText).replace(/\s+/g, ' ').slice(0, 220)}`);
      if (it.modernMedicine) lines.push(`  〔现代医学〕${it.modernMedicine}`);
    }
  }
  lines.push('\n— 文献事实与古人灵验主张分层陈列；不预设超自然效力；无公版影像者标待校补。');
  return lines.join('\n');
}

// v121：符箓是纯文献查阅页（无排盘、无个人输入），码只承载「回到这一页」
export function zhuyouCode() {
  return {
    kind: 'zhuyou',
    data: { at: Date.now() },
    title: '符箓 · 祝由',
    sub: `原典条目 ${ALL_ITEMS.length} 条 · 文献层查阅`,
  };
}
