// 问事读法视图：按"现代人的问题"分八域，古法用神与典籍原文对照。
// 吉凶倾向在 verdict.js 的「古法直断」卡里给；这里是逐条依据库。
import { $, current, copyText } from './state.js?v=123';
import {
  listReadingDomains,
  getReadingDomain,
  analyzeNajia,
} from '../vendor/liuyao-core.js?v=123';

function esc(s) {
  return String(s ?? '').replace(/[&<>"]/g, (c) => (
    { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]
  ));
}

const STORE_KEY = 'qintian.readingDomain.v1';
let activeId = loadId();

export function getActiveReadingDomain() {
  return activeId;
}

function loadId() {
  const d = listReadingDomains()[0];
  try {
    const saved = localStorage.getItem(STORE_KEY);
    return getReadingDomain(saved || '') ? saved : d.id;
  } catch { return d.id; }
}

/**
 * 渲染问事读法区。
 * @param {object} pan current.pan
 */
export function renderReading(pan) {
  const host = $('#reading-body');
  if (!host) return;
  if (!pan || !pan.benGua || !pan.benGua.name) { host.innerHTML = ''; return; }
  const dom = getReadingDomain(activeId) || listReadingDomains()[0];

  const chips = listReadingDomains().map((d) => `
    <button class="rd-chip ${d.id === dom.id ? 'on' : ''}" data-rd="${d.id}">${esc(d.name)}</button>
  `).join('');

  // 按流派分组的典籍原文
  const sourceGroups = new Map();
  dom.classics.forEach((q) => {
    const s = q.source;
    if (!sourceGroups.has(s)) sourceGroups.set(s, []);
    sourceGroups.get(s).push(q.text);
  });

  host.innerHTML = `
    <div class="rd-card glass-card">
      <div class="rd-head">
        <div class="rd-head-l">
          <span class="rd-title">问事读法</span>
          <span class="rd-sub">传统思路 · 多流派典籍原文（上方「古法直断」结论卡的依据库）</span>
        </div>
        <div class="rd-head-r">
          <button class="copy-btn sm rd-copy-toggle" type="button">选择复制</button>
          <button class="btn btn-primary sm rd-copy" type="button">复制选中</button>
        </div>
      </div>

      <div class="rd-copy-select" hidden>
        <label class="rd-copy-opt"><input type="checkbox" data-copy="pan" checked> 原始排盘</label>
        <label class="rd-copy-opt"><input type="checkbox" data-copy="najia" checked> 纳甲事实</label>
        <label class="rd-copy-opt"><input type="checkbox" data-copy="yongshen" checked> 用神落位</label>
        <label class="rd-copy-opt"><input type="checkbox" data-copy="relations" checked> 世应关系</label>
        <label class="rd-copy-opt"><input type="checkbox" data-copy="reading" checked> 读法指引</label>
        <label class="rd-copy-opt"><input type="checkbox" data-copy="classics" checked> 典籍原文</label>
      </div>

      <div class="rd-chips">${chips}</div>
      <div class="rd-hint">${esc(dom.hint)}</div>

      <div class="rd-section">
        <div class="rd-section-title">一、取用神（这一问传统上看哪一爻）</div>
        <div class="rd-yongshen">
          ${dom.yongShen.map((y) => `
            <div class="rd-ys"><span class="rd-ys-yao">${esc(y.yao)}</span><span class="rd-ys-for">${esc(y.forWhom)}</span></div>
          `).join('')}
        </div>
      </div>

      <div class="rd-section">
        <div class="rd-section-title">二、传统观察点（中性方法，不是结论）</div>
        <ul class="rd-focus">
          ${dom.focus.map((f) => `<li>${esc(f)}</li>`).join('')}
        </ul>
      </div>

      <details class="rd-classics" open>
        <summary>三、典籍原文（按流派分列）</summary>
        ${Array.from(sourceGroups.entries()).map(([src, texts]) => `
          <div class="rd-source-group">
            <div class="rd-source-name">${esc(src)}</div>
            ${texts.map((t) => `
              <blockquote class="rd-quote">
                <p>${esc(t)}</p>
              </blockquote>
            `).join('')}
          </div>
        `).join('')}
        <div class="rd-note">上方「古法直断」卡里的每一条加减，都可以回到这里找到对应的典籍原文核对。</div>
      </details>

      <div class="rd-foot">结论由写死的古法规则对你这一盘的事实推出，不接 AI、不凭空编；最终怎么选，仍在你。</div>
    </div>`;

  host.querySelectorAll('.rd-chip').forEach((btn) => {
    btn.addEventListener('click', () => {
      activeId = btn.dataset.rd;
      try { localStorage.setItem(STORE_KEY, activeId); } catch { /* ignore */ }
      renderReading(pan);
      document.dispatchEvent(new CustomEvent('qintian:reading-domain', { detail: activeId }));
    });
  });

  const selectBox = host.querySelector('.rd-copy-select');
  const toggleBtn = host.querySelector('.rd-copy-toggle');
  if (toggleBtn && selectBox) {
    toggleBtn.addEventListener('click', () => {
      const open = selectBox.hasAttribute('hidden');
      if (open) { selectBox.removeAttribute('hidden'); toggleBtn.textContent = '收起选项'; }
      else { selectBox.setAttribute('hidden', ''); toggleBtn.textContent = '选择复制'; }
    });
  }

  const copyBtn = host.querySelector('.rd-copy');
  if (copyBtn) copyBtn.addEventListener('click', () => {
    const checks = host.querySelectorAll('.rd-copy-opt input[type=checkbox]');
    const selected = new Set();
    checks.forEach((cb) => { if (cb.checked) selected.add(cb.dataset.copy); });
    copyAllMaterials(pan, dom, copyBtn, selected);
  });
}

/**
 * 格式化纳甲分析事实为可复制文本。
 */
function formatNajiaForCopy(pan) {
  const siZhu = pan.siZhu;
  const monthZhi = siZhu.monthGanZhi[1];
  const dayZhi = siZhu.dayGanZhi[1];
  const sex = pan.gender;
  const a = analyzeNajia(pan, { monthZhi, dayZhi, sex });
  const lines = [];

  // 世应（analyzeNajia 的 shi/ying 为 {pos, occ} 结构，状态在 occ 上）
  if (a.shi && a.shi.occ) {
    const s = a.shi.occ;
    const tags = (s.state && s.state.tags ? s.state.tags : []).join('、');
    lines.push(`世爻 · 第${a.shi.pos}爻 ${s.naJia} ${s.liuQin}${tags ? '（' + tags + '）' : ''}`);
  }
  if (a.ying && a.ying.occ) {
    const y = a.ying.occ;
    const tags = (y.state && y.state.tags ? y.state.tags : []).join('、');
    lines.push(`应爻 · 第${a.ying.pos}爻 ${y.naJia} ${y.liuQin}${tags ? '（' + tags + '）' : ''}`);
  }

  // 动爻与变爻
  if (a.dong.length) {
    lines.push('');
    lines.push('动与变爻：');
    a.dong.forEach((d) => {
      const dTags = d.state.tags.join('、');
      const dNa = d.naJia || `${d.yao.gan}${d.yao.zhi}`;
      let line = `第${d.pos}爻 ${dNa} ${d.liuQin}发动`;
      if (dTags) line += '（' + dTags + '）';
      if (d.bian) {
        const bTags = d.bian.state?.tags?.join('、') || '';
        const bNa = d.bian.naJia || `${d.bian.gan}${d.bian.zhi}`;
        line += ` → 变${bNa} ${d.bian.liuQin}`;
        if (bTags) line += '（' + bTags + '）';
      }
      lines.push(line);
    });
  } else {
    lines.push('');
    lines.push('静卦，无动爻。');
  }

  // 用神落位
  const domainMap = {
    career: '事业', wealth: '财运', relationship: '感情',
    travel: '行人', decision: '疾病',
  };
  const najiaDomain = domainMap[activeId] || '事业';
  const ys = a.yongshen?.[najiaDomain];
  if (ys) {
    lines.push('');
    lines.push(`本问用神域：${najiaDomain}`);
    if (ys.useYing) {
      lines.push('  以应爻为用神。');
    }
    ys.primary.forEach((qin) => {
      lines.push(`  ${qin}爻出现情况：`);
      if (ys.absent) {
        lines.push('    不上卦，查伏神。');
      }
      ys.occurrences.forEach((o) => {
        const tags = o.state.tags.join('、');
        const posLabel = o.hidden ? `伏于第${o.pos}爻` : `第${o.pos}`;
        const note = o.hidden ? `（伏神，飞神${o.hiddenUnder || ''}${o.feiFuRelation ? '，' + o.feiFuRelation : ''}）` : '';
        lines.push(`    ${posLabel} ${o.naJia}${tags ? '（' + tags + '）' : ''}${note}`);
      });
    });
    if (ys.note && ys.note.length) {
      ys.note.forEach((n) => lines.push(`  ${n}`));
    }
  }

  // 五亲全表
  lines.push('');
  lines.push('五亲旺衰总览：');
  Object.values(a.byLiuQin).forEach((group) => {
    if (!group.length) return;
    const qin = group[0].liuQin;
    lines.push(`  ${qin}：`);
    group.forEach((o) => {
      const tags = o.state.tags.join('、');
      const posLabel = o.hidden ? `伏于第${o.pos}` : `第${o.pos}爻`;
      const shiYing = o.shi ? '[世]' : (o.ying ? '[应]' : '');
      const mov = o.moving ? '[动]' : '';
      const note = o.hidden ? `（伏神，飞${o.hiddenUnder || ''}）` : '';
      lines.push(`    ${posLabel}${shiYing}${mov} ${o.naJia}${tags ? '（' + tags + '）' : ''}${note}`);
    });
  });

  // 世应关系
  if (a.relations && a.relations.length) {
    lines.push('');
    lines.push('世应关系：');
    a.relations.forEach((r) => lines.push(`  ${r.desc}`));
  }

  return lines.join('\n');
}

/**
 * 统一复制：排盘原始数据 + 纳甲事实 + 读法指引，合成一份。
 */
async function copyAllMaterials(pan, dom, btn, selected) {
  if (!selected || selected.size === 0) {
    copyText('请至少选择一项复制内容', btn);
    return;
  }
  const siZhu = pan.siZhu;
  const guaTitle = pan.bianGua
    ? `${pan.benGua.name} 之 ${pan.bianGua.name}`
    : pan.benGua.name;
  const moving = (pan.movingPositions || []).length
    ? `动爻：${(pan.movingPositions || []).map((p) => ['初', '二', '三', '四', '五', '上'][p - 1]).join('、')}爻`
    : '静卦（无动爻）';
  const question = pan.question && pan.question !== '未填写所占之事' ? pan.question : '（未填事由）';
  const xunKong = (pan.xunKong || []).join('');

  const parts = [];

  // ── 第一部分：原始排盘 ──
  if (selected.has('pan')) {
  parts.push(`【所占之事】${question}`);
  parts.push(`【干支】${siZhu.yearGanZhi}年 ${siZhu.monthGanZhi}月 ${siZhu.dayGanZhi}日 ${siZhu.timeGanZhi}时（旬空：${xunKong}）`);
  parts.push(`【卦象】${guaTitle}（${pan.benGua.gong || ''}宫）${moving}`);
  parts.push('');

  // 六爻原始排盘
  parts.push('── 原始排盘（六神 / 纳甲 / 世应 / 动变 / 伏神）──');
  const posNames = ['上', '五', '四', '三', '二', '初'];
  for (let pos = 6; pos >= 1; pos--) {
    const i = pos - 1;
    const ben = pan.yaoList[i];
    const bian = pan.bianYaoList?.[i];
    const lineSym = ben.yinYang === '阳' ? '━━━' : '━ ━';
    let line = `  ${posNames[6 - pos]}爻  ${ben.liuShen}  ${ben.gan}${ben.zhi} ${ben.liuQin} ${lineSym}`;
    if (ben.shiYing) line += ` ${ben.shiYing}`;
    // 动爻标记：阳动○、阴动Ｘ（标在本卦列，世应之后）
    if (ben.moving) line += ben.yinYang === '阳' ? ' ○' : ' Ｘ';
    // 变爻只在真正发动的爻行出现，静爻不附变爻（避免六行全带变爻造成错位错觉）
    if (ben.moving && bian) {
      line += `  → 变 ${bian.gan}${bian.zhi} ${bian.liuQin} ${bian.yinYang === '阳' ? '━━━' : '━ ━'}${bian.shiYing ? ' ' + bian.shiYing : ''}`;
    }
    const fu = (pan.fuShenList || []).find((f) => f.position === pos);
    if (fu) line += `  [伏: ${fu.gan}${fu.zhi} ${fu.liuQin}]`;
    parts.push(line);
  }
  if (pan.guaShen) parts.push(`\n【卦身】${pan.guaShen}`);
  parts.push('');
  }

  // ── 第二部分：纳甲分析事实 ──
  if (selected.has('najia')) {
  parts.push('── 纳甲类神落位事实 ──');
  parts.push(formatNajiaForCopy(pan));
  parts.push('');
  }

  // ── 第三部分：读法指引 ──
  if (selected.has('reading') || selected.has('yongshen') || selected.has('classics')) {
  parts.push('── 问事读法指引 ──');
  parts.push(`【问事域】${dom.name}`);
  parts.push('');
  }
  if (selected.has('yongshen')) {
  parts.push('一、传统取用神');
  dom.yongShen.forEach((y) => parts.push(`· ${y.yao}——${y.forWhom}`));
  parts.push('');
  }
  if (selected.has('relations')) {
  parts.push('二、传统观察点');
  dom.focus.forEach((f, i) => parts.push(`${i + 1}. ${f}`));
  parts.push('');
  }
  if (selected.has('classics')) {
  parts.push('三、典籍原文（只供参考，其中吉凶为典籍观点）');
  dom.classics.forEach((q) => parts.push(`· ${q.text}\n  — ${q.source}`));
  }

  const text = parts.join('\n');
  await copyText(text, btn);
}
