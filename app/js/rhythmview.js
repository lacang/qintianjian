// 个人节律轴（M5 场景3）：八字大运 + 占星 Firdaria 主限 + 流年干支
// 红线：只列事实，不给吉凶断语。
import {
  liuNianGanZhiSequence,
  listFirdariaPeriods,
  listProfectionYears,
  paiBazi,
} from '../vendor/liuyao-core.js?v=118';
import { $ } from './state.js?v=118';

const PLANET_COLOR = {
  sun: 'var(--cinnabar)', moon: 'var(--ink)',
  mercury: '#8a9', venus: '#c9a0c0', mars: 'var(--cinnabar)',
  jupiter: 'var(--gold)', saturn: 'var(--jade)',
  uranus: 'var(--jade)', neptune: '#68a', pluto: '#a66',
};

function esc(s){ return String(s).replace(/[&<>"]/g, c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c])); }

// 渲染节律轴。birth: {year, month, day, hour, minute, lat, lonEast}
// ascSignIndex: 占星 ASC 宫位 index (0=Aries)
// day: 占星昼/夜盘
export function renderRhythm(birth, ascSignIndex, day){
  const host = $('#rhythm-body');
  if (!host) return;
  const now = new Date();
  const currentYear = now.getFullYear();
  const age = currentYear - birth.year;
  const ageMin = Math.max(0, age - 10);
  const ageMax = age + 40;
  // 窄屏轨道估算宽度（px），用于标签防重叠筛选；宁稀疏不堆叠
  const TRACK_PX = 300;

  // 八字大运
  let bazi = null;
  try {
    bazi = paiBazi({
      year: birth.year, month: birth.month, day: birth.day,
      hour: birth.hour, minute: birth.minute,
      lat: birth.lat, lonEast: birth.lonEast,
    });
  } catch {}
  const daYunList = bazi?.daYun?.list || [];

  // 占星 Firdaria
  let firdaria = [];
  try { firdaria = listFirdariaPeriods(!!day, birth.year); } catch {}

  // 占星 Profection
  let profection = [];
  try { profection = listProfectionYears(ascSignIndex, birth.year, ageMin, ageMax); } catch {}

  // 流年干支：从时间轴左边界年龄 ageMin 对应年份起，覆盖整个轨道
  const axisStartYear = birth.year + ageMin;
  const liuNian = liuNianGanZhiSequence(axisStartYear, ageMax - ageMin + 1);

  // --- 构建时间轴段 ---
  // 统一坐标系：轨道覆盖 ageMin→ageMax 岁（共 span 年），0%=最左年龄，100%=最右年龄。
  // 用年龄（年份 - birth.year）定位，避免之前岁数与年份混减导致的负分母 bug。
  const span = ageMax - ageMin; // 50 年
  const pctAge = (a) => ((a - ageMin) / span) * 100;
  const pxAge = (a) => pctAge(a) / 100 * TRACK_PX;
  const ageNow = currentYear - birth.year;
  const nowPct = pctAge(ageNow);
  const nowPx = pxAge(ageNow);

  // 把 [起岁,止岁] 裁剪到轨道范围并返回 left%/width%；越界返回 null
  const segRect = (a0, a1) => {
    const c0 = Math.max(a0, ageMin), c1 = Math.min(a1, ageMax);
    if (c1 <= c0) return null;
    return { left: pctAge(c0), width: pctAge(c1) - pctAge(c0), px: (pctAge(c1) - pctAge(c0)) / 100 * TRACK_PX };
  };

  // 八字大运：每段都标干支（段太窄才省略），当前段金边高亮
  const dayunHtml = daYunList.map(d => {
    const rect = segRect(d.startYear - birth.year, d.endYear - birth.year);
    if (!rect) return '';
    const isNow = currentYear >= d.startYear && currentYear < d.endYear;
    const label = rect.px >= 26 ? esc(d.ganZhi) : '';
    return `<div class="rv-seg dayun${isNow ? ' rv-now' : ''}" style="left:${rect.left}%;width:${rect.width}%" title="${esc(d.ganZhi)} ${d.startYear}-${d.endYear}">${label}</div>`;
  }).join('');

  // Firdaria：每段标主星名，当前段金边高亮
  const firdariaHtml = firdaria.map(p => {
    const rect = segRect(p.startYear - birth.year, p.startYear - birth.year + p.years);
    if (!rect) return '';
    const isNow = currentYear >= p.startYear && currentYear < p.endYear;
    const color = PLANET_COLOR[p.lord] || 'var(--gold)';
    const label = rect.px >= 26 ? esc(p.lordName) : '';
    return `<div class="rv-seg firdaria${isNow ? ' rv-now' : ''}" style="left:${rect.left}%;width:${rect.width}%;background:${color}" title="${esc(p.lordName)} ${p.startYear}-${p.endYear}">${label}</div>`;
  }).join('');

  // 当前状态
  const currentDaYun = daYunList.find(d => currentYear >= d.startYear && currentYear < d.endYear);
  const currentFirdaria = firdaria.find(p => currentYear >= p.startYear && currentYear < p.endYear);
  const currentProfection = profection.find(p => p.year === currentYear);
  const currentLiuNian = liuNian.find(l => l.year === currentYear);

  // 整十年对齐的刻度（30/40/50/60/70…），与流年干支位置一一对应
  const decadeStart = Math.ceil(ageMin / 10) * 10;
  const tickHtml = [];
  for (let a = decadeStart; a <= ageMax; a += 10) {
    if (Math.abs(pxAge(a) - nowPx) < 30) continue; // 给当前徽章让位
    tickHtml.push(`<div class="rv-tick" style="left:${pctAge(a)}%">${a}</div>`);
  }

  // 流年干支：整十年一个（与年龄刻度对齐），当前年用金色徽章单独显示
  const liuNianHtml = [];
  for (let a = decadeStart; a <= ageMax; a += 10) {
    const yr = birth.year + a;
    const ln = liuNian.find(l => l.year === yr);
    if (!ln || ln.year === currentYear) continue;
    liuNianHtml.push(`<div class="rv-liu" style="left:${pctAge(a)}%" title="${ln.year} ${ln.ganZhi}">${esc(ln.ganZhi)}</div>`);
  }
  liuNianHtml.push(`<div class="rv-liu-now${nowPct > 75 ? ' is-left' : ''}" style="left:${nowPct}%">${currentLiuNian ? esc(currentLiuNian.ganZhi) : ''}</div>`);



  host.innerHTML = `
    <div class="rv-card glass-card collapsed">
      <div class="rv-head" role="button" tabindex="0">
        <span class="rv-title">命盘节律</span>
        <span class="rv-sub">当前 ${currentYear} · 年龄 ${age} 岁<b class="rv-caret">展开 ›</b></span>
      </div>

      <div class="rv-status">
        <div class="rv-status-item"><span class="rv-k">大运</span><span class="rv-v">${currentDaYun ? esc(currentDaYun.ganZhi) + '运 (' + currentDaYun.startYear + '–' + currentDaYun.endYear + ')' : '—'}</span></div>
        <div class="rv-status-item"><span class="rv-k">Firdaria</span><span class="rv-v" style="color:${currentFirdaria ? PLANET_COLOR[currentFirdaria.lord] : ''}">${currentFirdaria ? esc(currentFirdaria.lordName) + ' 主限 (' + currentFirdaria.startYear + '–' + currentFirdaria.endYear + ')' : '—'}</span></div>
        <div class="rv-status-item"><span class="rv-k">小限</span><span class="rv-v">${currentProfection ? currentProfection.signName + ' 年' : '—'}</span></div>
        <div class="rv-status-item"><span class="rv-k">流年</span><span class="rv-v">${currentLiuNian ? esc(currentLiuNian.ganZhi) + ' 年' : '—'}</span></div>
      </div>

      <div class="rv-chart">
        <div class="rv-ruler"><div class="rv-ruler-label">大运</div><div class="rv-track">${dayunHtml}<div class="rv-now-line" style="left:${nowPct}%"></div></div></div>
        <div class="rv-ruler"><div class="rv-ruler-label">Firdaria</div><div class="rv-track">${firdariaHtml}<div class="rv-now-line" style="left:${nowPct}%"></div></div></div>
        <div class="rv-ruler"><div class="rv-ruler-label">流年</div><div class="rv-track rv-track-liu">${liuNianHtml.join('')}<div class="rv-now-line" style="left:${nowPct}%"></div></div></div>
        <div class="rv-ruler"><div class="rv-ruler-label">年龄</div><div class="rv-track rv-track-liu">${tickHtml.join('')}<div class="rv-age-now${nowPct > 75 ? ' is-left' : ''}" style="left:${nowPct}%">${age}</div><div class="rv-now-line" style="left:${nowPct}%"></div></div></div>
      </div>

      <div class="rv-foot">各体系起运年份参考。大运按八字排盘，Firdaria 按占星${day?'昼':'夜'}盘主限序列，小限从 ASC ${currentProfection?currentProfection.signName:''} 起算整宫旋转。节律以年/十年为单位，故默认收起。</div>
    </div>`;

  // 折叠开关：绑在常驻 host 上，innerHTML 重渲染不丢
  if (!host.dataset.rvBound) {
    host.dataset.rvBound = '1';
    host.addEventListener('click', (e) => {
      const head = e.target.closest('.rv-head');
      if (!head) return;
      const card = host.querySelector('.rv-card');
      if (!card) return;
      const nowCollapsed = card.classList.toggle('collapsed');
      const c = host.querySelector('.rv-caret');
      if (c) c.textContent = nowCollapsed ? '展开 ›' : '收起 ‹';
    });
  }
}
