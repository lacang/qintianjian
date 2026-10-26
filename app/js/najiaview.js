// 纳甲类神落位事实视图（M7）：
// 在原始排盘（六神/六亲/纳甲/世应/动变/伏神/旬空）之上，针对当前卦给出
// 《增删卜易》取用神所需的确定性事实——五亲与世应各落第几爻、动静、
// 旺相休囚死、月破/旬空/月合日合/长生帝旺/入墓逢绝/日冲、动变回头生克/
// 化进化退/伏吟反吟，以及类神与世应的生克冲合。
// 红线：只陈列盘面事实，绝不下吉凶/成败/应期断语；多现、不上卦只罗列，
//       取舍与判断交给占者（配合问事读法的典籍原文与自问清单）。
import { $, current } from './state.js?v=121';
import { analyzeNajia } from '../vendor/liuyao-core.js?v=121';

const POS = ['初', '二', '三', '四', '五', '上'];

// reading 五域 → 纳甲分析 Domain
const DOMAIN_MAP = {
  career: '事业',
  wealth: '财运',
  relationship: '感情',
  travel: '行人',
  decision: '疾病', // 防患/是非：官鬼为患、子孙解忧，取用口径同疾病域
};

function esc(s) {
  return String(s ?? '').replace(/[&<>"]/g, (c) => (
    { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]
  ));
}

/** 干支串取地支（第二字） */
function zhiOf(ganzhi) {
  return ganzhi ? ganzhi.charAt(1) : '';
}

/** 标签按性质上色（仅视觉归类，不含吉凶措辞） */
function tagClass(t) {
  if (/月破|旬空|逢绝|回头克|反吟|日冲/.test(t)) return 't-bad';
  if (/回头生|进神|月合|日合|长生|帝旺/.test(t)) return 't-good';
  if (/^[旺相休囚死]于月/.test(t)) return 't-ling';
  if (/入墓|退神|伏吟/.test(t)) return 't-warn';
  return 't-plain';
}

function tagsHtml(tags) {
  return tags.map((t) => `<span class="nj-tag ${tagClass(t)}">${esc(t)}</span>`).join('');
}

/** 渲染一个类神（含伏神）行 */
function occHtml(o) {
  const roles = [o.shi ? '世' : '', o.ying ? '应' : '', o.moving ? '动' : '', o.hidden ? '伏' : ''].filter(Boolean);
  const role = roles.length ? `<span class="nj-role">${roles.join('')}</span>` : '';
  const dongTo = o.moving && !o.hidden ? '　' : '';
  return `
    <div class="nj-occ ${o.hidden ? 'is-hidden' : ''}">
      <div class="nj-occ-head">
        <span class="nj-pos">${POS[o.pos - 1]}爻</span>
        <span class="nj-najia">${esc(o.naJia)}</span>
        <span class="nj-shen">${esc(o.liuShen)}</span>
        ${role}
        ${o.hidden ? `<span class="nj-fei">伏于 ${esc(o.hiddenUnder)}（${esc(o.feiFuRelation || '')}）</span>` : ''}
      </div>
      <div class="nj-tags">${tagsHtml(o.state.tags)}</div>
    </div>${dongTo}`;
}

/**
 * @param {object} pan current.pan
 * @param {string} readingDomainId 当前问事读法域 id
 */
export function renderNajia(pan, readingDomainId) {
  const host = $('#najia-body');
  if (!host) return;
  if (!pan || !pan.benGua || !pan.benGua.name) { host.innerHTML = ''; return; }

  const monthZhi = zhiOf(pan.siZhu.monthGanZhi);
  const dayZhi = zhiOf(pan.siZhu.dayGanZhi);
  let an;
  try {
    an = analyzeNajia(pan, { monthZhi, dayZhi, sex: pan.gender === '女' ? '女' : '男' });
  } catch (e) {
    host.innerHTML = '';
    return;
  }

  const domainKey = DOMAIN_MAP[readingDomainId] || '其他';
  const ys = an.yongshen[domainKey];

  // 用神落位（随问事域）
  let ysHtml;
  if (ys.useYing && an.ying) {
    ysHtml = occHtml(an.ying.occ);
  } else if (ys.occurrences.length) {
    ysHtml = ys.occurrences.map(occHtml).join('');
  } else {
    ysHtml = '<div class="nj-empty">本卦六亲中不见用神，且无伏神可查，当借象审察（见《增删卜易·用神不上卦章》）。</div>';
  }
  const ysName = ys.useYing ? '应爻' : ys.primary.join('、');
  const ysNote = ys.note.length ? `<div class="nj-note">${ys.note.map(esc).join('　')}</div>` : '';

  // 五亲 + 世应全表（客观罗列）
  const order = ['官鬼', '妻财', '父母', '兄弟', '子孙'];
  const groups = order.map((q) => {
    const list = an.byLiuQin[q] || [];
    const body = list.length
      ? list.map(occHtml).join('')
      : '<div class="nj-empty">不上卦（查伏神）</div>';
    return `<div class="nj-group"><div class="nj-qin">${q}</div><div class="nj-occs">${body}</div></div>`;
  }).join('');

  // 世爻 / 应爻状态
  const shiCard = an.shi
    ? `<div class="nj-sy"><div class="nj-sy-h">世爻 · ${POS[an.shi.pos - 1]}爻 ${esc(an.shi.occ.naJia)} ${esc(an.shi.occ.liuQin)}</div><div class="nj-tags">${tagsHtml(an.shi.occ.state.tags)}</div></div>`
    : '';
  const yingCard = an.ying
    ? `<div class="nj-sy"><div class="nj-sy-h">应爻 · ${POS[an.ying.pos - 1]}爻 ${esc(an.ying.occ.naJia)} ${esc(an.ying.occ.liuQin)}</div><div class="nj-tags">${tagsHtml(an.ying.occ.state.tags)}</div></div>`
    : '';

  // 动爻变爻
  const dongHtml = an.dong.length
    ? an.dong.map((d) => {
      const bt = d.bian ? `→ ${esc(d.bian.gan)}${esc(d.bian.zhi)} ${esc(d.bian.liuQin)}` : '';
      return `<div class="nj-dong"><span class="nj-pos">${POS[d.pos - 1]}爻</span> ${esc(d.yao.gan)}${esc(d.yao.zhi)} ${esc(d.liuQin)} ${bt}　<span class="nj-tags-inline">${tagsHtml(d.state.tags)}</span></div>`;
    }).join('')
    : '<div class="nj-empty">静卦，无动爻。</div>';

  // 类神与世应关系（中性）
  const relHtml = an.relations.length
    ? an.relations.map((r) => `<span class="nj-rel">${esc(r.desc)}</span>`).join('')
    : '';

  host.innerHTML = `
    <div class="nj-card glass-card">
      <div class="nj-head">
        <span class="nj-title">纳甲类神落位</span>
        <span class="nj-sub">${esc(monthZhi)}月 ${esc(dayZhi)}日 · 旬空 ${esc(pan.xunKong.join(''))}　盘面事实（上方结论卡按古法给倾向，此处是它逐条依据）</span>
      </div>

      <div class="nj-section">
        <div class="nj-section-title">本问用神 · ${esc(ysName)}</div>
        ${ysHtml}
        ${ysNote}
      </div>

      <details class="nj-details" open>
        <summary>世爻 / 应爻</summary>
        <div class="nj-sywrap">${shiCard}${yingCard}</div>
        ${relHtml ? `<div class="nj-rels">${relHtml}</div>` : ''}
      </details>

      <details class="nj-details">
        <summary>动爻与变爻</summary>
        <div class="nj-dongwrap">${dongHtml}</div>
      </details>

      <details class="nj-details">
        <summary>五亲全表（逐爻旺衰 · 月日作用 · 空破墓绝）</summary>
        <div class="nj-groups">${groups}</div>
      </details>

      <div class="nj-foot">旺相休囚死按月令，月破/旬空/月合日合/长生帝旺/墓绝/日冲按月日地支，
        动变看回头生克、化进化退、伏吟反吟；皆《增删卜易》通行口径（火土同宫）。多现、伏否只罗列，取舍得你定。</div>
    </div>`;
}

// 问事读法切换问事域时，联动刷新本问用神
document.addEventListener('qintian:reading-domain', (e) => {
  if (current.pan) renderNajia(current.pan, e.detail);
});

