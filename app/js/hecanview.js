// 多盘合参（问事）视图 · v132
// 立场（写死在代码里，便于核对）：
//   本页只做机械对照，不把几盘缝成一个故事。每盘先自报「问题域是否覆盖」，
//   不覆盖就明写「本盘不答此类问题」并退出计数；再由 compare() 逐对比较各盘的「方向」，
//   三态分别落到 同向 / 无关 / 冲突。只有一盘出结果时，不补、不猜、不引申，
//   直接记「无法交叉」，结论强度降为弱，并给出可证伪条件。
// 本阶段只接入梅花（时间卦）；奇门、六爻是占位卡片，不进计数。
// 不调用任何 AI，不请求外部接口：起卦只用本地 liuyao-core 的时间卦。
import { meiHuaByTime } from '../vendor/liuyao-core.js?v=132';
import {
  resolveCastDate, nowDate, pad, escapeHtml, toLocalInputValue, parseLocalDateTime,
} from './state.js?v=132';

// 盘位固定三格：顺序即页面显示顺序
const PAN_KEYS = ['meihua', 'qimen', 'liuyao'];
const PAN_META = {
  meihua: { name: '梅花易数', sub: '时间卦 · 体用', live: true },
  qimen: { name: '奇门遁甲', sub: '时家转盘 · 用神', live: false },
  liuyao: { name: '六爻', sub: '摇卦 · 六亲用神', live: false },
};

// 问题域覆盖的机械判据：所问少于 4 字，盘面无从对应，按「不覆盖」处理。
const MIN_Q = 4;
const Q_MAX = 40;

/* 本页状态：只存所问、起局时刻与梅花盘结果，不碰其它视图的全局状态 */
const HC = { q: '', at: null, castDate: null, mh: null };

/* ============================ 盘面计算 ============================ */

// 体用生克表与 meihuaview.js 保持一致（只取关系名，不下吉凶）
const SHENG = { 金: '水', 水: '木', 木: '火', 火: '土', 土: '金' };
const KE = { 金: '木', 木: '土', 土: '水', 水: '火', 火: '金' };

function relOf(ti, yong) {
  if (ti.wuXing === yong.wuXing) return '体用比和';
  if (SHENG[yong.wuXing] === ti.wuXing) return `用生体（${yong.wuXing}→${ti.wuXing}）`;
  if (SHENG[ti.wuXing] === yong.wuXing) return `体生用（${ti.wuXing}→${yong.wuXing}）`;
  if (KE[yong.wuXing] === ti.wuXing) return `用克体（${yong.wuXing}→${ti.wuXing}）`;
  return `体克用（${ti.wuXing}→${yong.wuXing}）`;
}

// 时间卦：与 meihuaview.currentMeiHua 同口径（先过真太阳时开关，再按年月日时起卦）
function computeMeiHua(at) {
  const castDate = resolveCastDate(at);
  const mh = meiHuaByTime(castDate, { longitude: undefined, alreadyApparent: false });
  return { castDate, mh };
}

const trig = (t) => `${t.gua}${t.wuXing}`;
const fmtDate = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const fmtDT = (d) => `${fmtDate(d)} ${pad(d.getHours())}:${pad(d.getMinutes())}`;

/* ============================ 合参模型 ============================ */
// 每一盘产出一条 { key, name, covered, hasResult, stance }
// stance：'yes' 表示该盘就本问给出肯定方向，'no' 表示否定方向，null 表示只列事实、未给方向。
// 梅花在本阶段只出体用事实，stance 恒为 null —— 所以它进不了同向/冲突计票，
// 页面上的「无法交叉」正是这个事实的直接产物，而不是措辞。
function panModels() {
  const out = [];
  const qOk = HC.q.trim().length >= MIN_Q;

  out.push({
    key: 'meihua',
    name: '梅花易数',
    covered: qOk,
    hasResult: !!HC.mh,
    stance: null,
  });
  // 未接入的盘：不覆盖、不出结果、不进计数
  out.push({ key: 'qimen', name: '奇门遁甲', covered: false, hasResult: false, stance: null });
  out.push({ key: 'liuyao', name: '六爻', covered: false, hasResult: false, stance: null });
  return out;
}

function compare(pans) {
  const answered = pans.filter((p) => p.hasResult);
  const same = [];
  const none = [];
  const clash = [];

  if (answered.length < 2) {
    none.push(`仅 ${answered.length} 盘有结果，无法交叉`);
  } else {
    for (let i = 0; i < answered.length; i++) {
      for (let j = i + 1; j < answered.length; j++) {
        const a = answered[i];
        const b = answered[j];
        const tag = `${a.name} × ${b.name}`;
        if (!a.stance || !b.stance) { none.push(`${tag}：一方只列事实，未给方向`); continue; }
        if (a.stance === b.stance) same.push(`${tag}：方向相同（${a.stance === 'yes' ? '肯定' : '否定'}）`);
        else clash.push(`${tag}：方向相反（${a.stance === 'yes' ? '肯定' : '否定'} 对 ${b.stance === 'yes' ? '肯定' : '否定'}）`);
      }
    }
  }

  // 结论强度只有三档，判据全在盘数上：盘越多、方向越齐，才可能往上走
  const pairs = answered.length < 2 ? 0 : (answered.length * (answered.length - 1)) / 2;
  let strength = '弱';
  if (answered.length >= 3 && clash.length === 0 && same.length >= 3) strength = '强';
  else if (answered.length >= 2 && clash.length === 0 && same.length >= 1) strength = '中';

  return {
    same, none, clash, strength,
    why: `有效盘 ${answered.length} 个 · 可对照的对子 ${pairs} 组 · 冲突 ${clash.length} 条`,
  };
}

// 可证伪条件：由本期盘面直接生成，写清「什么发生了，这条就错」
function falsifiers() {
  if (!HC.mh || !HC.castDate) {
    return ['若在起局之前所问之事已了结，则本盘的时刻前提不成立，本条判断错。'];
  }
  const d = new Date(HC.castDate.getTime());
  d.setDate(d.getDate() + 10);
  const ben = HC.mh.benGua.name;
  const bian = HC.mh.bianGua.name;
  return [
    `若 ${fmtDate(d)} 之前，所问之事没有任何可核对的变化（既未出现${ben}所示的起势，也未出现${bian}所示的转向），则本条判断错。`,
    `若补入第二个盘（奇门或六爻）后，该盘对本问给出与本盘相反的事实，则本条「弱」的强度判断错。`,
    `若所问之事在 ${fmtDT(HC.castDate)} 之前就已发生，时间卦的前提不成立，则本条判断错。`,
  ];
}

/* ============================ 渲染 ============================ */

const HC_CSS = `
#view-hecan .hc-wrap{padding:14px 16px 40px}
#view-hecan .hc-lede{margin:0 0 10px;font-size:13.5px;line-height:1.85;color:var(--ink-dim)}
#view-hecan .hc-lede b{color:var(--gold);font-weight:600}
#view-hecan .hc-rules{margin:0 0 16px;padding:10px 14px;border-left:2px solid rgba(200,163,92,.5);
  background:rgba(200,163,92,.05);border-radius:0 10px 10px 0;font-size:12px;line-height:1.9;color:var(--ink-faint)}
#view-hecan .hc-form{display:grid;grid-template-columns:1fr;gap:8px;padding:14px;border:1px solid var(--line);
  border-radius:14px;background:var(--bg-2)}
#view-hecan .hc-lab{font-size:12px;letter-spacing:1px;color:var(--ink-dim)}
#view-hecan .hc-q,#view-hecan .hc-at{width:100%;box-sizing:border-box;background:var(--bg-3);border:1px solid var(--line);
  border-radius:9px;color:var(--ink);padding:10px 12px;font-size:14px;font-family:inherit;color-scheme:dark}
#view-hecan .hc-q::placeholder{color:var(--ink-faint)}
#view-hecan .hc-row{display:flex;gap:8px;margin-top:2px}
#view-hecan .hc-row .btn{flex:1;padding:11px;font-size:14px;letter-spacing:2px}
#view-hecan .hc-tip{margin:8px 0 0;font-size:12px;color:var(--ink-faint);min-height:16px}
#view-hecan .hc-tip.err{color:#e0765c}
#view-hecan .hc-sec-h{display:flex;align-items:baseline;gap:8px;margin:20px 0 10px}
#view-hecan .hc-sec-h b{font-size:15px;letter-spacing:3px;color:var(--ink)}
#view-hecan .hc-sec-h i{font-size:11.5px;color:var(--ink-faint);font-style:normal}
#view-hecan .hc-cards{display:grid;grid-template-columns:1fr;gap:10px}
#view-hecan .hc-card{border:1px solid var(--line);border-radius:14px;background:var(--bg-2);padding:13px 14px}
#view-hecan .hc-card.off{opacity:.72;border-style:dashed}
#view-hecan .hc-card-h{display:flex;align-items:center;gap:8px;margin-bottom:9px}
#view-hecan .hc-card-h b{font-size:15px;color:var(--ink);letter-spacing:2px}
#view-hecan .hc-card-h i{font-size:11.5px;color:var(--ink-faint);font-style:normal}
#view-hecan .hc-badge{margin-left:auto;font-size:11px;padding:2px 8px;border-radius:999px;
  border:1px solid var(--line);color:var(--ink-faint);font-style:normal}
#view-hecan .hc-badge.ok{border-color:rgba(127,169,139,.5);color:var(--jade)}
#view-hecan .hc-cover{font-size:12.5px;color:var(--ink-dim);padding:7px 10px;border-radius:9px;
  background:rgba(255,255,255,.03);line-height:1.7}
#view-hecan .hc-cover b{color:var(--ink)}
#view-hecan .hc-cover.on b{color:var(--jade)}
#view-hecan .hc-cover.off b{color:#e0765c}
#view-hecan .hc-cover i{font-style:normal;color:var(--ink-faint);margin-left:6px}
#view-hecan .hc-cover em{display:block;font-style:normal;color:#e0765c;margin-top:2px}
#view-hecan .hc-facts{margin:10px 0 0;padding:0;font-size:13px}
#view-hecan .hc-facts>div{display:flex;gap:10px;padding:5px 0;border-top:1px dashed rgba(255,255,255,.06)}
#view-hecan .hc-facts>div:first-child{border-top:0}
#view-hecan .hc-facts dt{flex:0 0 62px;color:var(--ink-faint);font-size:12px;padding-top:1px}
#view-hecan .hc-facts dd{margin:0;color:var(--ink);line-height:1.6}
#view-hecan .hc-plain{margin:10px 0 0;font-size:11.5px;line-height:1.7;color:var(--ink-faint)}
#view-hecan .hc-na{margin:8px 0 0;font-size:12.5px;line-height:1.7;color:var(--ink-faint)}
#view-hecan .hc-merge{border:1px solid rgba(200,163,92,.28);border-radius:14px;padding:14px;
  background:linear-gradient(180deg,rgba(200,163,92,.06),rgba(200,163,92,.015))}
#view-hecan .hc-qecho{margin:0 0 12px;font-size:12.5px;color:var(--ink-dim);line-height:1.7}
#view-hecan .hc-qecho b{color:var(--ink)}
#view-hecan .hc-tri{display:grid;grid-template-columns:1fr;gap:8px}
#view-hecan .hc-tri-col{border:1px solid var(--line);border-radius:11px;padding:9px 12px;background:rgba(0,0,0,.18)}
#view-hecan .hc-tri-col h4{margin:0 0 6px;font-size:12.5px;letter-spacing:2px;color:var(--ink-dim);font-weight:600}
#view-hecan .hc-tri-col.same h4{color:var(--jade)}
#view-hecan .hc-tri-col.none h4{color:var(--gold)}
#view-hecan .hc-tri-col.clash h4{color:#e0765c}
#view-hecan .hc-tri-col p{margin:0;font-size:13px;line-height:1.75;color:var(--ink)}
#view-hecan .hc-tri-col p.hc-empty{color:var(--ink-faint);font-size:12.5px}
#view-hecan .hc-tri-col ul{margin:0;padding-left:18px;font-size:13px;line-height:1.8;color:var(--ink)}
#view-hecan .hc-strength{display:flex;align-items:center;gap:10px;margin-top:10px;padding:10px 12px;
  border-radius:11px;background:rgba(0,0,0,.18);border:1px solid var(--line)}
#view-hecan .hc-strength span{font-size:12.5px;color:var(--ink-dim);letter-spacing:2px}
#view-hecan .hc-strength b{font-size:20px;letter-spacing:2px}
#view-hecan .hc-str-strong{color:var(--jade)}
#view-hecan .hc-str-mid{color:var(--gold)}
#view-hecan .hc-str-weak{color:#e0765c}
#view-hecan .hc-strength i{margin-left:auto;font-size:11px;color:var(--ink-faint);font-style:normal;text-align:right}
#view-hecan .hc-falsify{margin-top:10px;padding:10px 12px;border-radius:11px;background:rgba(0,0,0,.18);border:1px solid var(--line)}
#view-hecan .hc-falsify>span{display:block;font-size:12.5px;color:var(--ink-dim);letter-spacing:2px;margin-bottom:6px}
#view-hecan .hc-falsify ul{margin:0;padding-left:18px;font-size:12.5px;line-height:1.85;color:var(--ink)}
`;

function coverRow(covered, note, extra) {
  const cls = covered ? 'on' : 'off';
  const hint = note ? `<i>${escapeHtml(note)}</i>` : '';
  const blunt = covered ? '' : `<em>${extra || '本盘不答此类问题'}</em>`;
  return `<div class="hc-cover ${cls}">问题域是否覆盖：<b>${covered ? '是' : '否'}</b>${hint}${blunt}</div>`;
}

function meihuaCard() {
  const meta = PAN_META.meihua;
  const qLen = HC.q.trim().length;
  const covered = qLen >= MIN_Q;
  const note = covered ? `所问 ${qLen} 字，可对应盘面` : (qLen ? `所问仅 ${qLen} 字，盘面无从对应` : '所问为空');

  let body;
  if (!HC.mh) {
    body = `<p class="hc-na">本期未起卦。</p>`;
  } else {
    const { mh, castDate } = HC;
    const rows = [
      ['起卦时刻', `${fmtDT(castDate)} · 北京时间`],
      ['本卦', `${mh.benGua.name}（上${trig(mh.benGua.upper)} / 下${trig(mh.benGua.lower)}）`],
      ['互卦', `${mh.huGua.name}（上${trig(mh.huGua.upper)} / 下${trig(mh.huGua.lower)}）`],
      ['变卦', `${mh.bianGua.name}（上${trig(mh.bianGua.upper)} / 下${trig(mh.bianGua.lower)}）`],
      ['动爻', `第 ${mh.movingPosition} 爻动（${mh.movingSide === 'upper' ? '上卦' : '下卦'}）`],
      ['体用', `体 ${trig(mh.ti)} ｜ 用 ${trig(mh.yong)} ｜ ${relOf(mh.ti, mh.yong)}`],
    ].map(([k, v]) => `<div><dt>${k}</dt><dd>${v}</dd></div>`).join('');
    body = `<dl class="hc-facts">${rows}</dl>
      <p class="hc-plain">本盘只列盘面事实与体用生克，不落方向判断；计票时按「未给方向」处理。</p>`;
  }

  return `<section class="hc-card" data-pan="meihua">
    <div class="hc-card-h"><b>${meta.name}</b><i>${meta.sub}</i><span class="hc-badge ok">已接入</span></div>
    ${coverRow(covered, note)}
    ${body}
  </section>`;
}

function stubCard(key) {
  const meta = PAN_META[key];
  return `<section class="hc-card off" data-pan="${key}">
    <div class="hc-card-h"><b>${meta.name}</b><i>${meta.sub}</i><span class="hc-badge">未接入</span></div>
    ${coverRow(false, '本阶段未接入该盘', '本盘不答此类问题')}
    <p class="hc-na">卡片位已留，接入后走同一套对照规则（覆盖判定 → 方向 → 计票），不需要改合参区。</p>
  </section>`;
}

function cardsHtml() {
  return PAN_KEYS.map((k) => (k === 'meihua' ? meihuaCard() : stubCard(k))).join('');
}

function listHtml(arr, emptyText) {
  if (!arr.length) return `<p class="hc-empty">${emptyText}</p>`;
  return `<ul>${arr.map((x) => `<li>${escapeHtml(x)}</li>`).join('')}</ul>`;
}

function mergeHtml() {
  const pans = panModels();
  const { same, none, clash, strength, why } = compare(pans);
  const strCls = strength === '强' ? 'hc-str-strong' : strength === '中' ? 'hc-str-mid' : 'hc-str-weak';
  const fs = falsifiers();
  const qLine = HC.q.trim()
    ? `${escapeHtml(HC.q.trim())}（${HC.q.trim().length} 字）`
    : '（未填）';

  return `<section class="hc-merge" id="hecan-merge-body">
    <p class="hc-qecho">所问：<b>${qLine}</b></p>
    <div class="hc-tri">
      <div class="hc-tri-col same"><h4>同向</h4>${listHtml(same, '（空）没有两盘给出相同方向')}</div>
      <div class="hc-tri-col none"><h4>无关</h4>${listHtml(none, '（空）')}</div>
      <div class="hc-tri-col clash"><h4>冲突</h4>${listHtml(clash, '（空）没有两盘给出相反方向')}</div>
    </div>
    <div class="hc-strength">
      <span>结论强度</span><b class="${strCls}">${strength}</b><i>${escapeHtml(why)}</i>
    </div>
    <div class="hc-falsify">
      <span>可证伪条件</span>
      <ul>${fs.map((x) => `<li>${escapeHtml(x)}</li>`).join('')}</ul>
    </div>
  </section>`;
}

/** 整页骨架：每次打开视图按「此刻」起一局（所问保留上一次输入），再渲染一次 */
export function renderHeCan() {
  HC.at = nowDate();
  const r = computeMeiHua(HC.at);
  HC.mh = r.mh;
  HC.castDate = r.castDate;
  return `
  <style>${HC_CSS}</style>
  <div class="hc-wrap">
    <p class="hc-lede">同一句所问，分别交给几门术数各自出盘。本页只把各盘的盘面事实摆在一起，按
      <b>同向 / 无关 / 冲突</b> 三态逐对核对；不合并几盘、不解释矛盾、不替你把它们说成一件事。</p>
    <div class="hc-rules">
      一、每盘先答「问题域是否覆盖」；不覆盖的盘写「本盘不答此类问题」，不计入任何一态。<br />
      二、两盘都给出方向且相同，记一条同向；方向相反，记一条冲突；一方只列事实，记一条无关。<br />
      三、只有一盘出结果时，不补、不猜，直接记「无法交叉」，结论强度降为弱。<br />
      四、全部计算在本机完成，不联网、不调用任何模型。
    </div>

    <div class="hc-form">
      <label class="hc-lab" for="hc-q">所问（一句话，最多 ${Q_MAX} 字）</label>
      <input class="hc-q" id="hc-q" type="text" maxlength="${Q_MAX}" autocomplete="off" spellcheck="false"
             placeholder="例：这周内这笔款能不能到账" value="${escapeHtml(HC.q)}" />
      <label class="hc-lab" for="hc-at">起局时刻（默认此刻，可手改）</label>
      <input class="hc-at" id="hc-at" type="datetime-local" value="${toLocalInputValue(HC.at)}" />
      <div class="hc-row">
        <button class="btn" id="hc-now" type="button">此刻</button>
        <button class="btn btn-primary" id="hc-go" type="button">起盘</button>
      </div>
      <p class="hc-tip" id="hc-tip"></p>
    </div>

    <div class="hc-sec-h"><b>盘位</b><i>三格：梅花已接入，奇门与六爻占位</i></div>
    <div class="hc-cards" id="hecan-cards">${cardsHtml()}</div>

    <div class="hc-sec-h"><b>合参</b><i>机械对照，不做叙事合并</i></div>
    <div id="hecan-merge">${mergeHtml()}</div>
  </div>`;
}

/** 起盘：读输入 → 重算梅花 → 只重画盘位与合参区（输入框保持原样） */
function cast(host) {
  const qEl = host.querySelector('#hc-q');
  const atEl = host.querySelector('#hc-at');
  const tip = host.querySelector('#hc-tip');
  const q = ((qEl && qEl.value) || '').trim().slice(0, Q_MAX);
  const d = parseLocalDateTime(atEl && atEl.value);

  if (!d) {
    if (tip) { tip.textContent = '时刻无法识别，请重新选择'; tip.className = 'hc-tip err'; }
    return false;
  }

  HC.q = q;
  HC.at = d;
  const r = computeMeiHua(d);
  HC.mh = r.mh;
  HC.castDate = r.castDate;

  const cards = host.querySelector('#hecan-cards');
  const merge = host.querySelector('#hecan-merge');
  if (cards) cards.innerHTML = cardsHtml();
  if (merge) merge.innerHTML = mergeHtml();

  if (tip) {
    tip.textContent = q.length >= MIN_Q
      ? `已按 ${fmtDT(r.castDate)} 起盘：梅花出盘，奇门与六爻仍是占位。`
      : `已按 ${fmtDT(r.castDate)} 起盘：所问不足 ${MIN_Q} 字，梅花按「不覆盖」处理。`;
    tip.className = 'hc-tip';
  }
  return true;
}

/** 容器级委托绑定：只绑一次，DOM 重画后监听不丢 */
export function initHeCan(root = document) {
  const host = typeof root === 'string' ? document.querySelector(root) : root;
  if (!host || host.dataset.hcBound) return;
  host.dataset.hcBound = '1';

  host.addEventListener('click', (e) => {
    const t = e.target && e.target.closest ? e.target.closest('#hc-go,#hc-now') : null;
    if (!t) return;
    if (t.id === 'hc-go') { cast(host); return; }
    const atEl = host.querySelector('#hc-at');
    if (atEl) atEl.value = toLocalInputValue(nowDate());
  });
}

// 供页面外调用（例如测试）取得当前合参结果，避免二次实现判据
export function heCanSnapshot() {
  const pans = panModels();
  return { q: HC.q, at: HC.at ? HC.at.getTime() : null, pans, compare: compare(pans), falsifiers: falsifiers() };
}
