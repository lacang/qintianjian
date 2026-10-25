// 经传视图（M5）：在排盘下方展示《周易》经传原文事实，不做吉凶解释。
// 内容全部来自 liuyao-core 的白文查表层（getGuaAnnotation / getMovingLineAnnotation）。
import { $ } from './state.js?v=117';
import {
  getGuaAnnotation,
  getMovingLineAnnotation,
} from '../vendor/liuyao-core.js?v=117';

function esc(s) {
  return String(s ?? '').replace(/[&<>"]/g, (c) => (
    { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]
  ));
}

function block(label, text, cls = '') {
  if (!text) return '';
  return `<div class="jz-block ${cls}">
    <div class="jz-label">${label}</div>
    <div class="jz-text">${esc(text)}</div>
  </div>`;
}

/**
 * 渲染经传事实区。
 * @param {object} pan current.pan（含 benGua.name / bianGua?.name / movingPositions）
 */
export function renderJingZhuan(pan) {
  const host = $('#jingzhuan-body');
  if (!host) return;
  if (!pan || !pan.benGua || !pan.benGua.name) { host.innerHTML = ''; return; }

  const benName = pan.benGua.name;
  const a = getGuaAnnotation(benName);
  if (!a) { host.innerHTML = ''; return; }

  const moving = getMovingLineAnnotation(benName, pan.movingPositions || []);

  // 动爻经传：仅在有动爻时展示，逐条给爻辞 + 小象
  let movingHtml = '';
  if (moving.length) {
    movingHtml = `
      <div class="jz-section jz-moving">
        <div class="jz-section-title">动爻经传（${moving.length} 爻动）</div>
        ${moving.map((ln) => `
          <div class="jz-block">
            <div class="jz-label">${esc(ln.position)} 爻辞</div>
            <div class="jz-text">${esc(ln.text)}</div>
            ${ln.xiaoxiang ? `<div class="jz-sub jz-text"><span class="jz-chuan">小象传</span> ${esc(ln.xiaoxiang)}</div>` : ''}
          </div>`).join('')}
      </div>`;
  } else {
    movingHtml = `
      <div class="jz-section">
        <div class="jz-hint">无动爻（静卦）。占法多以本卦卦辞、彖传为主，此处仅列经传原文，不作断语。</div>
      </div>`;
  }

  // 用九/用六（乾坤多爻动或六爻全动时相关），只要存在就附上以备查
  const yongHtml = a.yong ? block(a.yong.position, a.yong.text, 'jz-yong') : '';

  // 之卦（变卦）：给出卦名与卦辞，供“动则观其变”自行参看，不替用户解释
  let bianHtml = '';
  if (pan.bianGua && pan.bianGua.name && moving.length) {
    const b = getGuaAnnotation(pan.bianGua.name);
    if (b) {
      bianHtml = `
        <div class="jz-section jz-bian">
          <div class="jz-section-title">之卦 · ${esc(pan.bianGua.name)} ${esc(b.symbol)}（第 ${b.index} 卦）</div>
          ${block('卦辞', b.judgment)}
        </div>`;
    }
  }

  host.innerHTML = `
    <div class="jz-card glass-card">
      <div class="jz-head">
        <span class="jz-gua-name">${esc(a.name)} ${esc(a.symbol)}</span>
        <span class="jz-gua-idx">周易上经／下经 · 第 ${a.index} 卦</span>
      </div>

      <div class="jz-section">
        <div class="jz-section-title">本卦经传</div>
        ${block('卦辞', a.judgment)}
        ${block('彖传', a.tuan)}
        ${block('大象传', a.daxiang)}
        ${yongHtml}
        ${a.wenyan ? block('文言传', a.wenyan, 'jz-wenyan') : ''}
      </div>

      ${movingHtml}
      ${bianHtml}

      <details class="jz-alllines">
        <summary>查看六爻全文（爻辞 · 小象）</summary>
        ${a.lines.map((ln) => `
          <div class="jz-block ${moving.some((m) => m.position === ln.position) ? 'is-dong' : ''}">
            <div class="jz-label">${esc(ln.position)}${moving.some((m) => m.position === ln.position) ? '（动）' : ''}</div>
            <div class="jz-text">${esc(ln.text)}</div>
            ${ln.xiaoxiang ? `<div class="jz-sub jz-text"><span class="jz-chuan">小象传</span> ${esc(ln.xiaoxiang)}</div>` : ''}
          </div>`).join('')}
      </details>

      <div class="jz-foot">经传为白文事实，仅供参看；本应用只排盘、不解卦。</div>
    </div>`;
}
