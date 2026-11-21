// 多盘合参（问事）视图 · v132
// 立场（写死在代码里，便于核对）：
//   本页只做机械对照，不把几盘缝成一个故事。对照**分轨**进行，跨轨不比：
//     · 问事轨：同一时刻起的时占盘（梅花 / 奇门），比的是「对所问之事的方向」；
//     · 本命轨：出生盘（八字 / 紫微 / 西方），比的是「对本命格局档位的判读」。
//   本命盘不回答「这周这笔款能不能到账」——这是口径，不是措辞。
//   每盘的可比维度一律取自该盘自己的结论卡（judgeXxx），不另造分数、不伪造强度。
//   未接入的盘（六爻需摇卦）明写「未接入」，不进任何一轨的计数。
// 不调用任何 AI，不请求外部接口：全部本地 liuyao-core + 各盘既有算法。
import { meiHuaByTime, paiQiMen, paiZiwei, paipanXingpan, resolvePaipanTime } from '../vendor/liuyao-core.js?v=136';
import { timeBasis } from './timebasis.js?v=136';
import { guard } from './errors.js?v=136'; // 错误边界（P0-2）：渲染抛错不再白屏
import {
  judgeMeiHua, judgeQiMen, judgeBazi, judgeZiwei, judgeAstro,
  comparePans, natalGradeOf, GRADE_ZH,
} from './verdicts.js?v=136';
import { paiBaziZi } from './zischool.js?v=136';
import {
  nowDate, nowGeoArgs, panTimeArgs, pad, escapeHtml, toLocalInputValue, parseLocalDateTime, birthArgs,
} from './state.js?v=136';

// 盘位固定：顺序即页面显示顺序。track=null 表示本阶段未接入。
const PAN_KEYS = ['meihua', 'qimen', 'bazi', 'ziwei', 'astro', 'liuyao'];
const PAN_META = {
  meihua: { name: '梅花易数', sub: '时间卦 · 体用', track: 'question', live: true },
  qimen: { name: '奇门遁甲', sub: '时家转盘 · 值符值使', track: 'question', live: true },
  bazi: { name: '八字', sub: '四柱 · 日主旺衰', track: 'natal', live: true },
  ziwei: { name: '紫微斗数', sub: '命宫 · 三方四正', track: 'natal', live: true },
  astro: { name: '西方古典占星', sub: '命主星 · 尊贵', track: 'natal', live: true },
  liuyao: { name: '六爻', sub: '摇卦 · 六亲用神', track: null, live: false },
};
const TRACK_ZH = { question: '问事轨', natal: '本命轨' };

// 问题域覆盖的机械判据：所问少于 4 字，时占盘无从对应，按「不覆盖」处理。
const MIN_Q = 4;
const Q_MAX = 40;

/* 本页状态：只存所问、起局时刻与各盘结果，不碰其它视图的全局状态 */
const HC = { q: '', at: null, castDate: null, ts: null, mh: null, qimen: null, bazi: null, ziwei: null, astro: null };

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

// 时间卦：与 meihuaview.currentMeiHua 同一条入口（panTimeArgs → 内核 civilForPaipan）
function computeMeiHua(at, geo = nowGeoArgs()) {
  const castDate = new Date(at.getTime());
  const args = panTimeArgs(castDate, geo);
  const ts = resolvePaipanTime(args);
  const { year, month, day, hour, minute, second, trueSolarTime, lateZiMode, ...geoOnly } = args;
  const mh = meiHuaByTime(castDate.getTime(), { ...geoOnly, lateZiMode, alreadyApparent: !trueSolarTime });
  return { castDate, ts, mh };
}

// 奇门：与 qimenview.currentQiMen 同一条入口，同一时刻出局，才能与梅花同轨比较
function computeQiMen(castDate, geo = nowGeoArgs()) {
  return paiQiMen(panTimeArgs(new Date(castDate.getTime()), geo));
}

// 本命三盘用同一个出生参数（birthArgs 已含时刻/经纬度覆盖）
function computeNatal() {
  const a = birthArgs();
  const out = { bazi: null, ziwei: null, astro: null };
  try { out.bazi = paiBaziZi({ ...a, lat: a.lat ?? a.latitude, lonEast: a.lonEast ?? a.longitude }); } catch { /* 缺数据即未接 */ }
  try { out.ziwei = paiZiwei(a); } catch { /* 同上 */ }
  try { out.astro = paipanXingpan(a); } catch { /* 同上 */ }
  return out;
}

const trig = (t) => `${t.gua}${t.wuXing}`;
const fmtDate = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const fmtDT = (d) => `${fmtDate(d)} ${pad(d.getHours())}:${pad(d.getMinutes())}`;

/* ============================ 各盘结论卡 ============================ */
// 每盘给出 { verdict, level } —— 直接复用该盘自己的古法直断，不另立判据
function verdictOf(key) {
  try {
    if (key === 'meihua') return HC.mh ? judgeMeiHua(HC.mh) : null;
    if (key === 'qimen') return HC.qimen ? judgeQiMen(HC.qimen) : null;
    if (key === 'bazi') return HC.bazi ? judgeBazi(HC.bazi, { age: new Date().getFullYear() - birthArgs().year + 1 }) : null;
    if (key === 'ziwei') return HC.ziwei ? judgeZiwei(HC.ziwei) : null;
    if (key === 'astro') return HC.astro ? judgeAstro(HC.astro) : null;
  } catch { /* 某盘算不出就按未接入处理，不编结论 */ }
  return null;
}

/* ============================ 合参模型 ============================ */
// 每一盘产出一条 { key, name, track, covered, answered, stance|grade, dim }
//   covered：本盘是否答得了「这句所问」（本命盘一律否——不是不愿答，是答不了）
//   answered：本盘是否真的出了结果（进了对应轨的计数）
function panModels() {
  const qOk = HC.q.trim().length >= MIN_Q;
  return PAN_KEYS.map((key) => {
    const meta = PAN_META[key];
    const v = meta.live ? verdictOf(key) : null;
    const answered = !!v;
    const level = v ? v.level : null;
    if (meta.track === 'question') {
      return {
        key, name: meta.name, track: 'question',
        covered: qOk, answered,
        stance: level == null ? null : (level > 0 ? 'yes' : level < 0 ? 'no' : 'flat'),
        grade: null, level,
      };
    }
    if (meta.track === 'natal') {
      return {
        key, name: meta.name, track: 'natal',
        covered: false, answered,
        stance: null,
        grade: answered ? natalGradeOf(level) : null, level,
      };
    }
    return { key, name: meta.name, track: null, covered: false, answered: false, stance: null, grade: null, level: null };
  });
}

function compare() {
  return comparePans(panModels().filter((p) => p.track));
}

// 可证伪条件：由本期盘面直接生成，写清「什么发生了，这条就错」
function falsifiers() {
  const fs = [];
  if (HC.mh && HC.castDate) {
    const d = new Date(HC.castDate.getTime());
    d.setDate(d.getDate() + 10);
    fs.push(`若 ${fmtDate(d)} 之前，所问之事没有任何可核对的变化（既未出现${HC.mh.benGua.name}所示的起势，也未出现${HC.mh.bianGua.name}所示的转向），则问事轨的判断错。`);
    fs.push(`若所问之事在 ${fmtDT(HC.castDate)} 之前就已发生，时间卦的前提不成立，则问事轨的判断错。`);
  } else {
    fs.push('若在起局之前所问之事已了结，则本盘的时刻前提不成立，问事轨的判断错。');
  }
  fs.push('若问事轨的梅花与奇门给出相反方向（见「冲突」栏），则「弱」以下的强度判断被本页自己推翻。');
  fs.push('本命轨比的是出生盘的格局档位，与所问之事的成败无对应关系；若把它当作「此事能不能成」的依据，即属误用。');
  return fs;
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
#view-hecan .hc-card-h{display:flex;align-items:center;gap:8px;margin-bottom:9px;flex-wrap:wrap}
#view-hecan .hc-card-h b{font-size:15px;color:var(--ink);letter-spacing:2px}
#view-hecan .hc-card-h i{font-size:11.5px;color:var(--ink-faint);font-style:normal}
#view-hecan .hc-trk{font-size:10.5px;padding:1px 7px;border-radius:999px;border:1px solid rgba(200,163,92,.35);
  color:var(--gold);font-style:normal}
#view-hecan .hc-trk.natal{border-color:rgba(127,169,139,.4);color:var(--jade)}
#view-hecan .hc-trk.none{border-color:var(--line);color:var(--ink-faint)}
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
#view-hecan .hc-line{margin:9px 0 0;font-size:12.5px;line-height:1.75;color:var(--ink-dim)}
#view-hecan .hc-line b{color:var(--ink)}
#view-hecan .hc-lv{display:inline-block;margin-left:4px;padding:1px 8px;border-radius:999px;font-size:11px;
  border:1px solid var(--line);color:var(--ink-faint)}
#view-hecan .hc-lv.good{border-color:rgba(127,169,139,.5);color:var(--jade)}
#view-hecan .hc-lv.bad{border-color:rgba(224,118,92,.5);color:#e0765c}
#view-hecan .hc-plain{margin:10px 0 0;font-size:11.5px;line-height:1.7;color:var(--ink-faint)}
#view-hecan .hc-na{margin:8px 0 0;font-size:12.5px;line-height:1.7;color:var(--ink-faint)}
#view-hecan .hc-merge{border:1px solid rgba(200,163,92,.28);border-radius:14px;padding:14px;
  background:linear-gradient(180deg,rgba(200,163,92,.06),rgba(200,163,92,.015))}
#view-hecan .hc-qecho{margin:0 0 12px;font-size:12.5px;color:var(--ink-dim);line-height:1.7}
#view-hecan .hc-qecho b{color:var(--ink)}
#view-hecan .hc-track{border:1px solid var(--line);border-radius:11px;padding:10px 12px;background:rgba(0,0,0,.18);margin-bottom:10px}
#view-hecan .hc-track-h{display:flex;align-items:baseline;gap:8px;margin-bottom:8px}
#view-hecan .hc-track-h b{font-size:13px;letter-spacing:2px;color:var(--gold)}
#view-hecan .hc-track-h i{font-size:11px;color:var(--ink-faint);font-style:normal}
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

function trkTag(track) {
  if (track === 'question') return '<i class="hc-trk">问事轨</i>';
  if (track === 'natal') return '<i class="hc-trk natal">本命轨</i>';
  return '<i class="hc-trk none">未入轨</i>';
}

function lvTag(level) {
  if (level == null) return '';
  const cls = level >= 1 ? 'good' : level <= -1 ? 'bad' : '';
  const txt = { 2: '大吉倾向', 1: '吉倾向', 0: '平', '-1': '谨慎', '-2': '宜避' }[String(level)] || '平';
  return `<span class="hc-lv ${cls}">${txt}</span>`;
}

function factRows(rows) {
  return `<dl class="hc-facts">${rows.map(([k, v]) => `<div><dt>${k}</dt><dd>${v}</dd></div>`).join('')}</dl>`;
}

// 各盘的「可比维度」fact 行
function dimRows(key) {
  if (key === 'meihua' && HC.mh) {
    const { mh, castDate } = HC;
    return [
      ['起卦时刻', `${fmtDT(castDate)} · 时间口径 ${timeBasis(HC.ts)}`],
      ['本卦', `${mh.benGua.name}（上${trig(mh.benGua.upper)} / 下${trig(mh.benGua.lower)}）`],
      ['互卦', `${mh.huGua.name}（上${trig(mh.huGua.upper)} / 下${trig(mh.huGua.lower)}）`],
      ['变卦', `${mh.bianGua.name}（上${trig(mh.bianGua.upper)} / 下${trig(mh.bianGua.lower)}）`],
      ['动爻', `第 ${mh.movingPosition} 爻动（${mh.movingSide === 'upper' ? '上卦' : '下卦'}）`],
      ['体用', `体 ${trig(mh.ti)} ｜ 用 ${trig(mh.yong)} ｜ ${relOf(mh.ti, mh.yong)}`],
      ['可比维度', '卦象吉凶（体用生克）'],
    ];
  }
  if (key === 'qimen' && HC.qimen) {
    const q = HC.qimen;
    const byNum = Object.fromEntries((q.palaces || []).map((p) => [p.palaceNumber, p]));
    const zf = q.zhiFu ? `${q.zhiFu.star}（${(byNum[q.zhiFu.palace] || {}).palaceName || ''}${q.zhiFu.palace}宫）` : '—';
    const zs = q.zhiShi ? `${q.zhiShi.door}（${(byNum[q.zhiShi.palace] || {}).palaceName || ''}${q.zhiShi.palace}宫）` : '—';
    return [
      ['定局', `${q.dun}${q.ju}局 · ${q.yuan || ''} · ${q.jieQi || ''}`],
      ['四柱', `${q.siZhu.year} ${q.siZhu.month} ${q.siZhu.day} ${q.siZhu.time}`],
      ['值符', zf],
      ['值使', zs],
      ['可比维度', '卦象吉凶（值使门 / 三吉门 / 空迫）'],
    ];
  }
  if (key === 'bazi' && HC.bazi) {
    const b = HC.bazi;
    const gz = (p) => (p ? `${p.gan}${p.zhi}` : '—');
    return [
      ['四柱', `${gz(b.year)} ${gz(b.month)} ${gz(b.day)} ${gz(b.time)}`],
      ['日主', `${b.dayMaster}（${b.dayMasterWuXing}）`],
      ['空亡 / 命宫', `${(b.xunKong || []).join('') || '—'} / ${b.mingGong || '—'}`],
      ['可比维度', '格局强弱（日主旺衰三得）'],
    ];
  }
  if (key === 'ziwei' && HC.ziwei) {
    const c = HC.ziwei;
    return [
      ['命宫', `${c.soulBranch} · 身宫 ${c.bodyBranch}`],
      ['五行局', c.fiveElementsClass],
      ['命主 / 身主', `${c.soul} / ${c.body}`],
      ['可比维度', '格局强弱（命宫星曜庙旺 + 三方四正）'],
    ];
  }
  if (key === 'astro' && HC.astro) {
    const ch = HC.astro;
    return [
      ['上升', `${ch.ascSignName} ${String(ch.asc.degree).padStart(2, '0')}°${String(ch.asc.minute).padStart(2, '0')}′`],
      ['命主星', `${ch.chartRulerName || '—'}${ch.bodies && ch.bodies[ch.chartRuler] ? `（${ch.bodies[ch.chartRuler].signName}）` : ''}`],
      ['盘型', `${ch.sect}盘 · 整宫制`],
      ['可比维度', '格局强弱（命主星尊贵 + 吉凶星落宫）'],
    ];
  }
  return null;
}

function liveCard(key) {
  const meta = PAN_META[key];
  const v = verdictOf(key);
  const rows = dimRows(key);
  const qLen = HC.q.trim().length;
  const covered = meta.track === 'question' ? qLen >= MIN_Q : false;
  const note = meta.track === 'question'
    ? (covered ? `所问 ${qLen} 字，可对应盘面` : (qLen ? `所问仅 ${qLen} 字，盘面无从对应` : '所问为空'))
    : '本命盘不答具体所问';
  const blunt = meta.track === 'question' ? '本盘不答此类问题' : '本命盘只比格局档位，不答此事成败';

  const body = rows
    ? `${factRows(rows)}
       ${v ? `<p class="hc-line">本盘自断：<b>${escapeHtml(v.title)}</b>${lvTag(v.level)}<br />${escapeHtml(v.headline || '')}</p>` : '<p class="hc-na">本盘未算出结论（数据或排盘缺失），按未接入处理。</p>'}
       <p class="hc-plain">此断定与「${TRACK_ZH[meta.track]}」内其它盘同一口径比较，不跨轨比。</p>`
    : '<p class="hc-na">本期未出盘。</p>';

  return `<section class="hc-card" data-pan="${key}">
    <div class="hc-card-h"><b>${meta.name}</b><i>${meta.sub}</i>${trkTag(meta.track)}<span class="hc-badge ok">已接入</span></div>
    ${coverRow(covered, note, blunt)}
    ${body}
  </section>`;
}

function stubCard(key) {
  const meta = PAN_META[key];
  return `<section class="hc-card off" data-pan="${key}">
    <div class="hc-card-h"><b>${meta.name}</b><i>${meta.sub}</i>${trkTag(null)}<span class="hc-badge">未接入</span></div>
    ${coverRow(false, '本阶段未接入该盘', '本盘不答此类问题')}
    <p class="hc-na">六爻须由人摇卦（三枚铜钱六次）才有卦，本页不做随机代摇，故留空位；接入后走同一套分轨对照规则。</p>
  </section>`;
}

function cardsHtml() {
  return PAN_KEYS.map((k) => (PAN_META[k].live ? liveCard(k) : stubCard(k))).join('');
}

function listHtml(arr, emptyText) {
  if (!arr.length) return `<p class="hc-empty">${emptyText}</p>`;
  return `<ul>${arr.map((x) => `<li>${escapeHtml(x)}</li>`).join('')}</ul>`;
}

function trackHtml(t) {
  return `<div class="hc-track">
    <div class="hc-track-h"><b>${t.label}</b><i>${escapeHtml(t.why)}</i></div>
    <div class="hc-tri">
      <div class="hc-tri-col same"><h4>同向</h4>${listHtml(t.same, '（空）没有两盘给出相同方向')}</div>
      <div class="hc-tri-col none"><h4>无关</h4>${listHtml(t.none, '（空）')}</div>
      <div class="hc-tri-col clash"><h4>冲突</h4>${listHtml(t.clash, '（空）没有两盘给出相反方向')}</div>
    </div>
  </div>`;
}

function mergeHtml() {
  const c = compare();
  const strCls = c.strength === '强' ? 'hc-str-strong' : c.strength === '中' ? 'hc-str-mid' : 'hc-str-weak';
  const fs = falsifiers();
  const qLine = HC.q.trim()
    ? `${escapeHtml(HC.q.trim())}（${HC.q.trim().length} 字）`
    : '（未填）';

  return `<section class="hc-merge" id="hecan-merge-body">
    <p class="hc-qecho">所问：<b>${qLine}</b></p>
    ${c.tracks.map(trackHtml).join('')}
    <div class="hc-strength">
      <span>结论强度</span><b class="${strCls}">${c.strength}</b><i>${escapeHtml(c.why)}</i>
    </div>
    <div class="hc-falsify">
      <span>可证伪条件</span>
      <ul>${fs.map((x) => `<li>${escapeHtml(x)}</li>`).join('')}</ul>
    </div>
  </section>`;
}

/** 整页骨架：每次打开视图按「此刻」起一局（所问保留上一次输入），再渲染一次 */
function __renderHeCan() {
  HC.at = nowDate();
  const r = computeMeiHua(HC.at);
  HC.mh = r.mh;
  HC.castDate = r.castDate;
  HC.ts = r.ts;
  try { HC.qimen = computeQiMen(r.castDate); } catch { HC.qimen = null; }
  const n = computeNatal();
  HC.bazi = n.bazi; HC.ziwei = n.ziwei; HC.astro = n.astro;

  return `
  <style>${HC_CSS}</style>
  <div class="hc-wrap">
    <p class="hc-lede">同一句所问，分别交给几门术数各自出盘。本页只把各盘的<b>可比维度</b>摆在一起，
      按 <b>同向 / 无关 / 冲突</b> 三态逐对核对；不合并几盘、不解释矛盾、不替你把它们说成一件事。</p>
    <div class="hc-rules">
      一、<b>分轨对照，跨轨不比</b>：时占盘（梅花、奇门）同属「问事轨」，答的是所问之事的方向；
      出生盘（八字、紫微、西方）同属「本命轨」，答的只是本命格局档位——它们答不了「这周这笔款能不能到账」。<br />
      二、每盘先答「问题域是否覆盖」；不覆盖的盘写「本盘不答此类问题」，不计入任何一态。<br />
      三、同一轨内：两盘方向/档位相同记同向，相反记冲突，一方只列事实或中平记无关。<br />
      四、某一轨不足两盘出结果，直接记「无法交叉」，该轨强度为弱；总强度取各轨最高档，并标明由哪一轨支撑。<br />
      五、全部计算在本机完成，不联网、不调用任何模型。
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

    <div class="hc-sec-h"><b>盘位</b><i>六格：梅花 / 奇门 / 八字 / 紫微 / 西方已接入，六爻待摇卦</i></div>
    <div class="hc-cards" id="hecan-cards">${cardsHtml()}</div>

    <div class="hc-sec-h"><b>合参</b><i>分轨机械对照，不做叙事合并</i></div>
    <div id="hecan-merge">${mergeHtml()}</div>
  </div>`;
}

/** 起盘：读输入 → 重算各盘 → 只重画盘位与合参区（输入框保持原样） */
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
  HC.ts = r.ts;
  try { HC.qimen = computeQiMen(r.castDate); } catch { HC.qimen = null; }
  const n = computeNatal();
  HC.bazi = n.bazi; HC.ziwei = n.ziwei; HC.astro = n.astro;

  const cards = host.querySelector('#hecan-cards');
  const merge = host.querySelector('#hecan-merge');
  if (cards) cards.innerHTML = cardsHtml();
  if (merge) merge.innerHTML = mergeHtml();

  if (tip) {
    tip.textContent = q.length >= MIN_Q
      ? `已按 ${fmtDT(r.castDate)} 起盘：问事轨出梅花与奇门，本命轨出八字、紫微、西方；六爻仍待摇卦。`
      : `已按 ${fmtDT(r.castDate)} 起盘：所问不足 ${MIN_Q} 字，时占盘按「不覆盖」处理。`;
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
  return { q: HC.q, at: HC.at ? HC.at.getTime() : null, pans, compare: compare(), falsifiers: falsifiers() };
}

/* P0-2 错误边界：以上渲染入口统一兜底（audit3 · r1/r4 实测这些文件 catch 数为 0） */
export const renderHeCan = guard(__renderHeCan, '多盘合参失败', '#hecan-body');
