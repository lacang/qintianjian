// 天象节气日历：极简流水时间线
// 红线：只报天文实算的时刻与事件名，不给宜忌吉凶。
// 设计：一行一件事；霜降与日入天蝎是同一瞬间（太阳黄经 210°），合并为一项；
//       默认只露最近 N 项，余者折叠；当前状态压成标题下一行小字。
import { shouyeTianxiang, getDayCalendar, listJieqiInRange } from '../vendor/liuyao-core.js?v=118';
import { $ } from './state.js?v=118';

const BJ_OFFSET = 8 * 3600 * 1000;
const WEEK = ['日', '一', '二', '三', '四', '五', '六'];
const SKIP_RETRO = new Set(['sun', 'moon', 'mercury', 'mean_node']);
const SHOW = 8; // 默认露出最近几项
// 事件 → 详解词条（点击任一条目都能翻出解释）
const Q_TIP = { '新月': 'ev-newmoon', '上弦月': 'ev-firstq', '上弦': 'ev-firstq', '满月': 'ev-fullmoon', '下弦月': 'ev-lastq', '下弦': 'ev-lastq' };
const DAY_MS = 86400000;

function esc(s) {
  return String(s == null ? '' : s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
}
const pad = (n) => String(n).padStart(2, '0');
const bj = (iso) => new Date(new Date(iso).getTime() + BJ_OFFSET);
const keyOf = (d) => `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`;
const hm = (d) => `${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())}`;
// 节气 JD → 北京时刻
const jdBj = (jd) => bj(new Date((jd - 2440587.5) * DAY_MS).toISOString());

function collect(from, days) {
  const startD = bj(from.toISOString());
  const startKey = keyOf(startD);
  const endKey = keyOf(new Date(startD.getTime() + days * DAY_MS));
  const inWin = (k) => k >= startKey && k < endKey;

  const byDay = new Map();
  const push = (k, it) => { if (inWin(k)) { (byDay.get(k) || byDay.set(k, []).get(k)).push(it); } };

  // 节气（JieqiItem 带 jd，可精确到分）
  try {
    for (const j of listJieqiInRange(
      { year: startD.getUTCFullYear(), month: startD.getUTCMonth() + 1, day: startD.getUTCDate() },
      days + 1,
    )) {
      const d = jdBj(j.jd);
      push(j.solarDate, { ord: 0, kind: j.kind === 'jie' ? 'jie' : 'qi', label: j.name, time: hm(d), tip: 'jieqi' });
    }
  } catch {}

  // 天象：两次调用覆盖约两个朔望月的月相
  const tx1 = shouyeTianxiang(from, days);
  const tx2 = shouyeTianxiang(new Date(from.getTime() + 32 * DAY_MS), 35);
  const qSeen = new Set();
  for (const tx of [tx1, tx2]) {
    for (const q of tx.moon?.nextQuarters || []) {
      if (qSeen.has(q.iso)) continue;
      qSeen.add(q.iso);
      const d = bj(q.iso);
      push(keyOf(d), { ord: 2, kind: 'moon', label: q.name, time: hm(d), tip: Q_TIP[q.name] || 'ev-newmoon' });
    }
  }
  for (const g of tx1.ingresses || []) {
    const d = bj(g.iso);
    push(keyOf(d), { ord: 1, kind: 'ing', label: `日入${g.signName}`, time: hm(d), tip: 'ev-ingress' });
  }

  // 水星留逆 / 留顺
  const mr = tx1.mercuryRetro;
  let retroChip = '';
  if (mr) {
    const rD = bj(mr.stationRetrogradeIso);
    const sD = bj(mr.stationDirectIso);
    push(keyOf(rD), { ord: 3, kind: 'r0', label: '水星始逆', time: hm(rD), tip: 'ev-mercretro' });
    push(keyOf(sD), { ord: 3, kind: 'r1', label: '水星复行', time: hm(sD), tip: 'ev-mercdirect' });
    if (mr.status === 'now') {
      retroChip = `水逆中·${sD.getUTCMonth() + 1}/${sD.getUTCDate()}复行`;
    } else if (inWin(keyOf(rD))) {
      const n = Math.round((rD.getTime() - new Date(startKey + 'T00:00:00Z').getTime()) / DAY_MS);
      retroChip = n <= 0 ? '水逆今日起' : `水逆${n}天后起`;
    }
  }

  // 合并：同一天节气 + 日入X座 = 同一天文瞬间，一项双名一个时刻
  for (const items of byDay.values()) {
    const jqIdx = items.findIndex((x) => x.kind === 'jie' || x.kind === 'qi');
    const ingIdx = items.findIndex((x) => x.kind === 'ing');
    if (jqIdx >= 0 && ingIdx >= 0) {
      items[jqIdx] = { ...items[jqIdx], sign: items[ingIdx].label.replace('日入', '') };
      items.splice(ingIdx, 1);
    }
    items.sort((a, b) => a.ord - b.ord);
  }

  // 当下状态（一行小字）
  const cal = getDayCalendar({
    year: startD.getUTCFullYear(), month: startD.getUTCMonth() + 1, day: startD.getUTCDate(), hour: 12,
  });
  const sun = tx1.bodies.find((b) => b.id === 'sun');
  const longRetro = tx1.bodies
    .filter((b) => b.retrograde && !SKIP_RETRO.has(b.id))
    .map((b) => b.name.replace('星', '')).join('');
  const state = [
    cal.daysToNextJieqi === 0 ? `今日交${cal.nextJieqi}` : `距${cal.nextJieqi}${cal.daysToNextJieqi}天`,
    `${tx1.moon.phaseName}${Math.round(tx1.moon.illumination * 100)}%`,
    sun ? `日在${sun.signName}` : '',
    retroChip,
    longRetro ? `${longRetro}逆行中` : '',
  ].filter(Boolean).join(' · ');

  return { byDay, state, startKey, startD };
}

export function renderTianxiangCalendar(from = new Date(), days = 60) {
  const host = $('#tianxiang-body');
  if (!host) return;
  const { byDay, state, startKey, startD } = collect(from, days);
  const startMonth = startD.getUTCMonth() + 1;

  const rows = [...byDay.keys()].sort().map((k, i) => {
    const [y, m, d] = k.split('-').map(Number);
    const wd = WEEK[new Date(Date.UTC(y, m - 1, d)).getUTCDay()];
    const dateTxt = m === startMonth ? d : `${m}/${d}`;
    const items = byDay.get(k).map((it) => {
      const sign = it.sign ? `<span class="ti-ing">日躔${esc(it.sign)}</span>` : '';
      return `<span class="ti t-${it.kind}" data-tip="${it.tip || ''}">${esc(it.label)}${sign}<em>${it.time}</em></span>`;
    }).join('');
    const hide = i >= SHOW ? ' hide' : '';
    return `<div class="tl${hide}"><span class="td">${dateTxt}<i>周${wd}</i></span><span class="te">${items || '<span class="te0">—</span>'}</span></div>`;
  }).join('');

  const total = byDay.size;
  host.innerHTML = `<div class="tcx-card glass-card collapsed" title="天文实算，不主吉凶">
    <div class="tcx-head">
      <span class="tcx-title">天象节气</span>
      <span class="tcx-state">${esc(state)}</span>
      <span class="tcx-tipin">点条目看解释</span>
    </div>
    <div class="tcx-lines">${rows}</div>
    ${total > SHOW ? `<button type="button" class="tcx-more">展开全部 ${total} 项 ›</button>` : ''}
  </div>`;

  // 折叠/展开：监听挂在常驻 host 上，inner 重渲染不丢
  if (!host.dataset.tcxBound) {
    host.dataset.tcxBound = '1';
    host.addEventListener('click', (e) => {
      const btn = e.target.closest('.tcx-more');
      if (!btn) return;
      const card = host.querySelector('.tcx-card');
      const willOpen = card.classList.contains('collapsed');
      card.classList.toggle('collapsed', !willOpen);
      btn.textContent = willOpen ? '收起 ‹' : `展开全部 ${total} 项 ›`;
    });
  }
}
