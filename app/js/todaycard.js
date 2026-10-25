// 今日日课卡（M5 场景1）：把钦天监首页已显示的四柱/农历/节气/子午流注/当下天象
// 合成一张可读的"日课"卡，一键复制给外部 AI 或存档。
// 红线：只报事实与典籍口径的中性描述，不给"今日宜/忌""吉凶"判断。
import { getDayCalendar, getMeridian, shouyeTianxiang } from '../vendor/liuyao-core.js?v=119';
import { siZhuZi } from './zischool.js?v=119';
import { $ } from './state.js?v=119';

const P_CN = { sun:'太阳', moon:'月亮', mercury:'水星', venus:'金星', mars:'火星',
  jupiter:'木星', saturn:'土星', uranus:'天王星', neptune:'海王星', pluto:'冥王星' };

function pct(v){ return Math.round(v*100); }
function beijing(iso){ try{ return new Date(iso).toLocaleString('zh-CN',{timeZone:'Asia/Shanghai',month:'numeric',day:'numeric',hour:'2-digit',minute:'2-digit',hour12:false}); }catch{ return iso; } }
function pad(n){ return String(n).padStart(2,'0'); }
function esc(s){ return String(s).replace(/[&<>"]/g, c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c])); }

function dateStr(d){
  return `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}`;
}

// 合成一份"日课"纯文本，供"复制"按钮使用；也作为卡内渲染的源数据。
function buildRike(now){
  const d = new Date(now.getTime());
  const y=d.getFullYear(), m=d.getMonth()+1, day=d.getDate(), h=d.getHours(), mi=d.getMinutes();
  const sz = siZhuZi({ year:y, month:m, day, hour:h, minute:mi });
  const cal = getDayCalendar({ year:y, month:m, day, hour:h, minute:mi });
  const md = getMeridian(d);
  let tx = null;
  try { tx = shouyeTianxiang(d); } catch { /* 天象不可用时降级 */ }

  const retro = tx ? tx.bodies.filter(b => b.retrograde && !['sun','moon','mean_node'].includes(b.id)).map(b=>P_CN[b.id]||b.name) : [];
  const sun = tx ? tx.bodies.find(b=>b.id==='sun') : null;
  const moon = tx ? tx.moon : null;

  return {
    date: dateStr(d),
    sizhu: `${sz.yearGanZhi}年 ${sz.monthGanZhi}月 ${sz.dayGanZhi}日 ${sz.timeGanZhi}时`,
    nongli: cal.nongli,
    jianchu: cal.jianchu,
    prevJieqi: cal.prevJieqi,
    nextJieqi: cal.nextJieqi,
    meridian: `${md.zhi}时·气血注 ${md.meridian}（表里 ${md.paired}）`,
    minutesToNext: md.minutesToNext,
    moon: moon ? { phase: moon.phaseName, illum: pct(moon.illumination), sign: moon.signName } : null,
    sunSign: sun ? sun.signName : null,
    retro,
    nextQuarters: moon && moon.nextQuarters ? moon.nextQuarters.slice(0, 2) : [],
    ingresses: tx && tx.ingresses ? tx.ingresses.slice(0, 3) : [],
    mercuryRetro: tx ? tx.mercuryRetro : null,
  };
}

// 渲染今日日课卡。now 可选，缺省为当前时间。
export function renderTodayCard(now = new Date()){
  const host = $('#today-card-body');
  if (!host) return;
  let r;
  try { r = buildRike(now); } catch (e) {
    host.innerHTML = `<div class="tc-card glass-card"><div class="tc-err">今日日课暂不可用：${esc(String(e.message||e))}</div></div>`;
    return;
  }

  const skyRows = [];
  if (r.moon) skyRows.push(`<div class="tc-row"><span class="tc-k">月相</span><span class="tc-v">${r.moon.phase} · 照亮 ${r.moon.illum}% · 月在${r.moon.sign}</span></div>`);
  if (r.sunSign) skyRows.push(`<div class="tc-row"><span class="tc-k">日躔</span><span class="tc-v">太阳在${r.sunSign}</span></div>`);
  skyRows.push(`<div class="tc-row"><span class="tc-k">逆行</span><span class="tc-v ${r.retro.length?'':'ok'}">${r.retro.length ? r.retro.join(' · ') + ' 逆行中' : '七政三王皆顺行'}</span></div>`);

  let upcomingRows = '';
  if (r.nextQuarters.length) {
    upcomingRows += r.nextQuarters.map(q=>`<div class="tc-row"><span class="tc-k">${q.name}</span><span class="tc-v">${beijing(q.iso)}</span></div>`).join('');
  }
  if (r.mercuryRetro) {
    const mr = r.mercuryRetro;
    upcomingRows += mr.status === 'now'
      ? `<div class="tc-row hot"><span class="tc-k">水逆</span><span class="tc-v">逆行中，${beijing(mr.stationDirectIso)} 留顺（${mr.startSignName}→${mr.endSignName}）</span></div>`
      : `<div class="tc-row"><span class="tc-k">水逆</span><span class="tc-v">${beijing(mr.stationRetrogradeIso)} 起逆（${mr.startSignName}），${beijing(mr.stationDirectIso)} 留顺</span></div>`;
  }
  for (const g of r.ingresses) {
    upcomingRows += `<div class="tc-row"><span class="tc-k">太阳入${g.signName}</span><span class="tc-v">${beijing(g.iso)}</span></div>`;
  }

  host.innerHTML = `
    <div class="tc-card glass-card">
      <div class="tc-head">
        <span class="tc-title">今日日课</span>
        <span class="tc-date">${r.date}</span>
        <button type="button" class="tc-copy">复制</button>
      </div>
      <div class="tc-row"><span class="tc-k">四柱</span><span class="tc-v sizhu">${esc(r.sizhu)}</span></div>
      <div class="tc-row"><span class="tc-k">历法</span><span class="tc-v">${esc(r.nongli)} · 建除${esc(r.jianchu)}</span></div>
      <div class="tc-row"><span class="tc-k">节气</span><span class="tc-v">${esc(r.prevJieqi)} → ${esc(r.nextJieqi)}</span></div>
      <div class="tc-row"><span class="tc-k">流注</span><span class="tc-v">${esc(r.meridian)}，距换经 ${r.minutesToNext} 分</span></div>

      <div class="tc-sec-h">当下天象</div>
      ${skyRows.join('')}

      ${upcomingRows ? `<div class="tc-sec-h">近期天时</div>${upcomingRows}` : ''}

      <div class="tc-foot">只列事实与天文时刻，不判断宜忌吉凶；时刻均为北京时间。</div>
    </div>`;

  const copyBtn = host.querySelector('.tc-copy');
  if (copyBtn) copyBtn.addEventListener('click', () => copyRike(r, copyBtn));
}

async function copyRike(r, btn){
  const lines = [
    `【今日日课】${r.date}`,
    `四柱：${r.sizhu}`,
    `农历：${r.nongli} · 建除${r.jianchu}`,
    `节气：${r.prevJieqi} → ${r.nextJieqi}`,
    `子午流注：${r.meridian}（距换经 ${r.minutesToNext} 分）`,
    '',
    '—— 当下天象 ——',
  ];
  if (r.moon) lines.push(`月相：${r.moon.phase}，照亮 ${r.moon.illum}%，月在${r.moon.sign}`);
  if (r.sunSign) lines.push(`太阳：在${r.sunSign}`);
  lines.push('逆行：' + (r.retro.length ? r.retro.join('、') : '无，七政三王皆顺行'));
  if (r.nextQuarters.length) {
    lines.push('', '—— 近期月相 ——');
    for (const q of r.nextQuarters) lines.push(`${q.name} · ${beijing(q.iso)}`);
  }
  if (r.mercuryRetro) {
    const mr = r.mercuryRetro;
    lines.push('', '—— 水星逆行 ——');
    lines.push(mr.status === 'now'
      ? `水星逆行中，${beijing(mr.stationDirectIso)} 留顺（${mr.startSignName}→${mr.endSignName}）`
      : `水星 ${beijing(mr.stationRetrogradeIso)} 起逆（${mr.startSignName}），${beijing(mr.stationDirectIso)} 留顺`);
  }
  if (r.ingresses.length) {
    lines.push('', '—— 近期太阳入座 ——');
    for (const g of r.ingresses) lines.push(`太阳入${g.signName} · ${beijing(g.iso)}`);
  }
  lines.push('', '以上时刻均为北京时间（Asia/Shanghai）。');

  let ok = false;
  try { await navigator.clipboard.writeText(lines.join('\n')); ok = true; }
  catch {
    try {
      const ta = document.createElement('textarea');
      ta.value = lines.join('\n');
      ta.style.position = 'fixed'; ta.style.opacity = '0';
      document.body.appendChild(ta); ta.focus(); ta.select();
      ok = document.execCommand('copy');
      ta.remove();
    } catch { ok = false; }
  }
  if (ok) {
    const old = btn.textContent;
    btn.dataset._busy = '1'; btn.classList.add('copied'); btn.textContent = '✓ 已复制';
    setTimeout(() => { btn.textContent = old; btn.classList.remove('copied'); btn.dataset._busy = ''; }, 1300);
  } else {
    const t = $('#toast');
    if (t) { t.textContent = '复制失败，请长按选择'; t.classList.add('show'); clearTimeout(t._timer); t._timer = setTimeout(()=>t.classList.remove('show'), 1800); }
  }
}
