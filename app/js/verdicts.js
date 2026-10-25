// verdicts.js — 五盘「古法直断」
// 定位：在盘面事实层之上，按古法规则直接给出这一盘的倾向（敢断吉凶），
//       每条信号挂典籍出处，规则全部写死、可溯源，不接 AI、不凭空编。
// 纯函数，无依赖；各盘 view 内联调用：verdictCardHtml(judgeXxx(盘))

const esc = (s) => String(s == null ? '' : s)
  .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

// ---------- 档位 ----------
const HEAD = {
  '2': { mark: '大吉倾向', cls: 'good', icon: '✓' },
  '1': { mark: '吉倾向', cls: 'good', icon: '✓' },
  '0': { mark: '平', cls: 'mid', icon: '～' },
  '-1': { mark: '谨慎', cls: 'bad', icon: '！' },
  '-2': { mark: '宜避', cls: 'bad', icon: '！' },
};
function levelOf(score) {
  if (score >= 4) return 2;
  if (score >= 1) return 1;
  if (score <= -4) return -2;
  if (score <= -1) return -1;
  return 0;
}

// ---------- 累加器 ----------
function newAcc() { return { s: 0, sig: [] }; }
function add(a, w, text, src, qk) {
  a.s += w;
  a.sig.push({ w, text, src, qk: qk || '' });
}

// ---------- 五行工具 ----------
const WX_SHENG = { 木: '火', 火: '土', 土: '金', 金: '水', 水: '木' };
const WX_KE = { 木: '土', 土: '水', 水: '火', 火: '金', 金: '木' };
/** a 对 b 的关系 */
function wxRel(a, b) {
  if (!a || !b) return 'none';
  if (a === b) return 'same';
  if (WX_SHENG[a] === b) return 'sheng';    // a 生 b
  if (WX_KE[a] === b) return 'ke';          // a 克 b
  if (WX_SHENG[b] === a) return 'beiSheng'; // b 生 a（a 受生）
  if (WX_KE[b] === a) return 'beiKe';       // b 克 a（a 受克）
  return 'none';
}

// =====================================================================
// 一、梅花易数
// 《梅花易数·体用总诀》：体为主、用为事
// =====================================================================
const MH_TQ = '《梅花易数·体用总诀》';
export function judgeMeiHua(mh) {
  const a = newAcc();
  if (!mh || !mh.ti || !mh.yong) return null;
  const ti = mh.ti, yong = mh.yong;

  // ① 体用生克（总诀核心）
  const rel = wxRel(yong.wuXing, ti.wuXing);
  if (rel === 'sheng') add(a, 2, `用卦（${yong.gua}·${yong.wuXing}）生体卦（${ti.gua}·${ti.wuXing}）——外来之力助你，主有进益之喜。`, MH_TQ, 'MH_YONG_SHENG_TI');
  else if (rel === 'ke') add(a, -2, `用卦（${yong.gua}·${yong.wuXing}）克体卦（${ti.gua}·${ti.wuXing}）——外来之力压你，有祸患之忧。`, MH_TQ, 'MH_YONG_KE_TI');
  else if (rel === 'beiKe') add(a, 1, `体卦克用卦（${ti.wuXing}克${yong.wuXing}）——诸事可成，但须你亲力亲为、成之稍迟。`, MH_TQ, 'MH_TI_KE_YONG');
  else if (rel === 'beiSheng') add(a, -1, `体卦生用卦（${ti.wuXing}生${yong.wuXing}）——你付出、往外耗，有耗失之患。`, MH_TQ, 'MH_TI_SHENG_YONG');
  else if (rel === 'same') add(a, 1, `体用比和（同属${ti.wuXing}）——彼此同气，百事顺遂。`, MH_TQ, 'MH_BIHE');

  // ② 体党：互卦两卦 + 变卦之「用侧」新卦，看对体卦的生克
  const vote = (t, tag) => {
    const r = wxRel(t.wuXing, ti.wuXing);
    if (r === 'sheng' || r === 'same') return 1;
    if (r === 'ke' || r === 'beiSheng') return -1;
    return 0;
  };
  const huU = mh.huGua && mh.huGua.upper, huL = mh.huGua && mh.huGua.lower;
  let party = 0;
  if (huU) party += vote(huU);
  if (huL) party += vote(huL);
  if (party > 0) add(a, 1, `互卦（${huU.gua}${huL.gua}）于体卦多生扶、比和——事中得助，体势偏盛。`, '《梅花易数·互卦》', 'MH_HU_SHENG');
  else if (party < 0) add(a, -1, `互卦（${huU.gua}${huL.gua}）于体卦多克泄——事中受牵制，体势偏衰。`, '《梅花易数·互卦》', 'MH_HU_KE');

  // ③ 变卦（终局）：变卦中用侧新卦对体的生克
  if (mh.bianGua) {
    const newYongSide = mh.movingSide === 'upper' ? mh.bianGua.upper : mh.bianGua.lower;
    const r = wxRel(newYongSide.wuXing, ti.wuXing);
    if (r === 'sheng' || r === 'same') add(a, 1, `变卦（${mh.bianGua.name}）之${mh.movingSide === 'upper' ? '上' : '下'}卦（${newYongSide.gua}·${newYongSide.wuXing}）生扶体卦——终局转向有利，后段渐吉。`, '《梅花易数·变卦》', 'MH_BIAN_SHENG');
    else if (r === 'ke' || r === 'beiSheng') add(a, -1, `变卦（${mh.bianGua.name}）之${mh.movingSide === 'upper' ? '上' : '下'}卦（${newYongSide.gua}·${newYongSide.wuXing}）克泄体卦——终局转不利，后段须防。`, '《梅花易数·变卦》', 'MH_BIAN_KE');
  }

  const level = levelOf(a.s);
  const tiDesc = rel === 'sheng' ? '外来助力' : rel === 'ke' ? '外来阻力' : rel === 'beiKe' ? '你可控但费力' : rel === 'beiSheng' ? '你在外耗' : '同气顺遂';
  const HEADLINE = {
    '2': `体用得生，大势偏吉——${tiDesc}，你所求之事有外来之助，宜进。`,
    '1': `体用尚可，事在人为——${tiDesc}，稳步推进可有成。`,
    '0': `体用相平，吉凶两可——${tiDesc}，宜守正、看后续变化再定。`,
    '-1': `体用偏耗，宜谨慎——${tiDesc}，有损耗之象，不宜强求。`,
    '-2': `体用受克，宜避——${tiDesc}，此事恐有祸患之忧，能退则退。`,
  }[String(level)];
  const TAKE = {
    '2': '这卦的气是向着你的。可以动手，但记住「用生体」是外来的助力，别把功劳全揽在自己身上，顺着势头走最省力。',
    '1': '总体不算差，属于「能成但要花力气」的格局。别等天上掉馅饼，主动推一把，事就成了。',
    '0': '吉凶各半，看不出明确的偏向。这时候最好的动作是「不动」——先把手里的信息攒够，等局面自己明朗。',
    '-1': '有往外漏气的迹象，你越使劲可能越亏。先收一收，把已经投进去的止损，别加码。',
    '-2': '这一卦是明确叫你小心的。如果是投资、签约、表白这类不可逆的事，建议先缓；能躲开的坑就别踩。',
  }[String(level)];

  return {
    level, title: '梅花易数 · 体用直断',
    headline: HEADLINE, takeaway: TAKE,
    timing: null,
    signals: a.sig,
    quotes: [
      { t: '体用之说：体为主，用为事。用生体，有进益之喜；体生用，有耗失之患；体克用，诸事可成，但成之迟；用克体，有祸患之忧；体用比和，百事顺遂。', s: '《梅花易数·体用总诀》（节引）' },
    ],
    note: `本卦${mh.benGua.name}｜互卦${mh.huGua.name}｜变卦${mh.bianGua.name}｜体${ti.gua}（${ti.wuXing}）用${yong.gua}（${yong.wuXing}）`,
  };
}

// =====================================================================
// 二、奇门遁甲（时局格局倾向）
// 《烟波钓叟歌》：三吉门、九星吉凶、伏吟反吟、空亡
// =====================================================================
const YB = '《烟波钓叟歌》';
const JMEN_GOOD = new Set(['开门', '休门', '生门']);
const JMEN_BAD = new Set(['死门', '惊门', '伤门']);
const QSTAR_GOOD = new Set(['天心', '天任', '天辅', '天禽']);
const QSTAR_BAD = new Set(['天蓬', '天芮', '天柱', '天英']);
export function judgeQiMen(q) {
  const a = newAcc();
  if (!q || !q.palaces) return null;
  const ps = q.palaces.filter((p) => p.palaceNumber !== 5);

  // ① 值使门（用事的门户）
  const zsDoor = q.zhiShi && q.zhiShi.door;
  if (zsDoor && JMEN_GOOD.has(zsDoor)) add(a, 1, `值使门为${zsDoor}（三吉门）——门户开，事可为。`, YB, 'QM_ZHI_SHI_JI');
  else if (zsDoor && JMEN_BAD.has(zsDoor)) add(a, -1, `值使门为${zsDoor}（凶门）——门户不利，事多阻。`, YB, 'QM_ZHI_SHI_XIONG');

  // ② 值符星
  const zfStar = q.zhiFu && q.zhiFu.star;
  if (zfStar && QSTAR_GOOD.has(zfStar)) add(a, 1, `值符星为${zfStar}（吉星）——主事之星得地，贵人有应。`, YB, 'QM_ZHI_FU_JI');
  else if (zfStar && QSTAR_BAD.has(zfStar)) add(a, -1, `值符星为${zfStar}（凶星）——主事之星带煞，防虚惊。`, YB, 'QM_ZHI_FU_XIONG');

  // ③ 三吉门 / 凶门分布
  const good = ps.filter((p) => JMEN_GOOD.has(p.door)).length;
  const bad = ps.filter((p) => JMEN_BAD.has(p.door)).length;
  if (good >= 3) add(a, 1, `八宫中有 ${good} 宫临三吉门（开休生）——吉门布广，此局可乘。`, YB, 'QM_SAN_JI_MEN');
  else if (good <= 1) add(a, -1, `三吉门仅现 ${good} 宫——吉门稀，行动多阻。`, YB, 'QM_JI_MEN_SHAO');
  if (bad >= 3) add(a, -1, `八宫中有 ${bad} 宫临凶门（死惊伤）——凶门布广，宜守。`, YB, 'QM_XIONG_MEN_DUO');

  // ④ 门迫（门克宫）
  const po = ps.filter((p) => (p.marks || []).some((m) => String(m).includes('门迫')));
  if (po.length) add(a, -1, `第 ${po.map((p) => p.palaceNumber).join('、')} 宫门迫（门克宫）——所行之事受宫位所制，用力难成。`, '《奇门遁甲统宗》', 'QM_MEN_PO');

  // ⑤ 空亡
  const kong = ps.filter((p) => (p.marks || []).some((m) => String(m).includes('空')));
  if (kong.length >= 3) add(a, -1, `第 ${kong.map((p) => p.palaceNumber).join('、')} 宫落空亡——多处落空，事易虚而不实。`, YB, 'QM_KONG_WANG');

  // ⑥ 三奇（乙丙丁）临吉门
  const sanQi = ps.filter((p) => ['乙', '丙', '丁'].includes(p.skyStem) && JMEN_GOOD.has(p.door));
  if (sanQi.length) add(a, 1, `第 ${sanQi.map((p) => p.palaceNumber).join('、')} 宫三奇（${sanQi.map((p) => p.skyStem).join('/')}）临吉门——三奇得使，遇难得解。`, YB, 'QM_SAN_QI_DE_SHI');

  const level = levelOf(a.s);
  const HEADLINE = {
    '2': '此局格局清吉——吉门吉星当值，是难得的可为之时。',
    '1': '此局偏吉——有吉门吉星可用，顺着有利方位行事较为顺。',
    '0': '此局吉凶互见——没有一边倒，宜择吉方、避凶门而动。',
    '-1': '此局偏凶——凶门凶星当值，宜守不宜攻。',
    '-2': '此局凶象明显——伏吟空迫交加，动则多阻，能缓则缓。',
  }[String(level)];
  const TAKE = {
    '2': '眼下的时间窗口是有利的，想启动的事可以趁现在推。留意吉门所在的方位，往那边走、往那边谈。',
    '1': '整体还行，属于「选对方向就顺」的局。行动前先看哪个方位是开休生，朝那个方向发力。',
    '0': '看不出明显偏向，属于「怎么做都行、也都不太行」的中间态。这种时候按计划走、别临时改主意。',
    '-1': '这一时段的势不太好。如果要谈事、签约、出行，建议换一个吉门当值的时段，或至少避开凶门方位。',
    '-2': '格局明确不利。如果不是非做不可，建议推迟；非做不可的话，务必走吉方、找贵人（值符所临）帮你兜。',
  }[String(level)];

  return {
    level, title: '奇门遁甲 · 时局直断',
    headline: HEADLINE, takeaway: TAKE,
    timing: `${q.dun}${q.ju}局 · ${q.yuan} · ${q.jieQi}｜值符${zfStar || '—'}临第${q.zhiFu ? q.zhiFu.palace : '—'}宫、值使${zsDoor || '—'}临第${q.zhiShi ? q.zhiShi.palace : '—'}宫`,
    signals: a.sig,
    quotes: [
      { t: '吉门吉星吉格逢，诸事可为；凶门凶星凶格见，百事不宜。', s: '《烟波钓叟歌》（节引）' },
      { t: '就中伏吟为最凶，天蓬加著地天蓬。', s: '《烟波钓叟歌》' },
    ],
    note: '奇门重在按事取用；此处给的是这一时刻的整体格局倾向。',
  };
}

// =====================================================================
// 三、八字（日主旺衰 + 大运喜忌）
// 《渊海子平》《滴天髓》
// =====================================================================
const WX_GAN = { 甲: '木', 乙: '木', 丙: '火', 丁: '火', 戊: '土', 己: '土', 庚: '金', 辛: '金', 壬: '水', 癸: '水' };
const WX_ZHI = { 子: '水', 丑: '土', 寅: '木', 卯: '木', 辰: '土', 巳: '火', 午: '火', 未: '土', 申: '金', 酉: '金', 戌: '土', 亥: '水' };
export function judgeBazi(bz, opt = {}) {
  const a = newAcc();
  if (!bz || !bz.dayMaster) return null;
  const me = bz.dayMasterWuXing;
  const YZP = '《渊海子平》';
  const DTJ = '《滴天髓》';

  // ① 得令：月支
  const mZhi = bz.month && bz.month.zhi ? bz.month.zhi : '';
  const mWx = WX_ZHI[mZhi] || '';
  const relMonth = wxRel(mWx, me); // 月令 对 日主
  let deling = 0;
  if (relMonth === 'same') { deling = 2; add(a, 2, `日主${me}生于${mZhi}月，月令同气（得令）——根基得时，主自身有力。`, DTJ, 'BZ_DE_LING'); }
  else if (relMonth === 'beiSheng') { deling = 2; add(a, 2, `日主${me}生于${mZhi}月，月令生我（得令）——印星当令，主有靠山、有生扶。`, DTJ, 'BZ_DE_LING_SHENG'); }
  else if (relMonth === 'sheng') { deling = -1; add(a, -1, `日主${me}生于${mZhi}月，我生月令（泄气）——身被泄，主劳心费力。`, DTJ, 'BZ_XIE_QI'); }
  else if (relMonth === 'ke') { deling = -2; add(a, -2, `日主${me}生于${mZhi}月，月令克我（失令）——身受克，主根基不稳。`, DTJ, 'BZ_SHI_LING'); }
  else if (relMonth === 'beiKe') { deling = -1; add(a, -1, `日主${me}生于${mZhi}月，我克月令（耗气）——身被耗，主得财而身疲。`, DTJ, 'BZ_HAO_QI'); }

  // ② 得地：日支
  const dZhi = bz.day && bz.day.zhi ? bz.day.zhi : '';
  const dWx = WX_ZHI[dZhi] || '';
  const relDay = wxRel(dWx, me);
  if (relDay === 'same' || relDay === 'beiSheng') add(a, 1, `日主坐${dZhi}（${dWx}）——日支生扶，主自身有根、有底气。`, YZP, 'BZ_DE_DI');
  else if (relDay === 'ke' || relDay === 'beiKe') add(a, -1, `日主坐${dZhi}（${dWx}）——日支克耗，主自身受制、易疲。`, YZP, 'BZ_SHI_DI');

  // ③ 得势：五行力量统计（日主同类 + 印星）
  const cnt = bz.wuXingCount || {};
  const shengMe = Object.keys(WX_SHENG).find((k) => WX_SHENG[k] === me) || '';
  const mine = (cnt[me] || 0) + (shengMe ? (cnt[shengMe] || 0) : 0);
  const total = Object.values(cnt).reduce((x, y) => x + y, 0) || 1;
  if (mine / total >= 0.5) add(a, 1, `全局五行中比劫+印星共 ${mine}/${total}，占半以上（得势）——帮身者众。`, YZP, 'BZ_DE_SHI');
  else if (mine / total <= 0.25) add(a, -1, `全局五行中比劫+印星仅 ${mine}/${total}（失势）——帮身者寡，多靠自己。`, YZP, 'BZ_SHI_SHI');

  // ④ 定强弱
  const strong = deling + (relDay === 'same' || relDay === 'beiSheng' ? 1 : 0) > 0;
  add(a, 0, strong
    ? `综合判断：日主${me}偏旺——喜财（克我）、官（克我）、食伤（我生）来克泄，忌再添印比。`
    : `综合判断：日主${me}偏弱——喜印（生我）、比劫（同我）来生扶，忌财官食伤再耗。`,
    strong ? '《三命通会·论日主强弱》' : '《三命通会·论日主强弱》', 'BZ_QIANG_RUO');

  // ⑤ 当前大运（若给了虚岁）
  const age = opt.age;
  if (age && bz.daYun && Array.isArray(bz.daYun.list)) {
    const cur = bz.daYun.list.find((d) => age >= d.startAge && age <= d.endAge);
    if (cur && cur.ganZhi) {
      const dGanWx = WX_GAN[cur.ganZhi[0]] || '';
      const dZhiWx = WX_ZHI[cur.ganZhi[1]] || '';
      const rG = wxRel(dGanWx, me);
      const good = (r) => r === 'same' || r === 'beiSheng';
      const bad = (r) => r === 'ke' || r === 'beiKe' || r === 'sheng';
      let dw = 0;
      if (good(rG)) dw += 1; else if (bad(rG)) dw -= 1;
      if (good(wxRel(dZhiWx, me))) dw += 1; else if (bad(wxRel(dZhiWx, me))) dw -= 1;
      const favor = strong ? (dw < 0) : (dw > 0);
      if (dw !== 0) {
        add(a, favor ? 1 : -1,
          `当前大运${cur.ganZhi}（${dGanWx}${dZhiWx}）对日主为「${dw > 0 ? '生扶' : '克泄耗'}」——与喜忌方向${favor ? '相合，主此运顺遂' : '相悖，主此运多磨'}。`,
          '《渊海子平·论大运》', 'BZ_DA_YUN');
      }
    }
  }

  // ⑥ 五行偏枯
  const missing = ['木', '火', '土', '金', '水'].filter((w) => !cnt[w]);
  if (missing.length) {
    const isXi = (w) => strong ? false : (w === me || w === shengMe);
    const hit = missing.filter(isXi);
    add(a, hit.length ? -1 : 0,
      `命局五行缺 ${missing.join('、')}${hit.length ? `（其中 ${hit.join('、')} 恰为所喜，主所缺即所需，须靠后天补）` : '（非所喜，影响不大）'}。`,
      '《穷通宝鉴》', 'BZ_WU_XING_QUE');
  }

  const level = levelOf(a.s);
  const HEADLINE = {
    '2': `日主${me}${strong ? '偏旺' : '偏弱'}而根气足——先天格局有底气，属可为之人。`,
    '1': `日主${me}${strong ? '偏旺' : '偏弱'}，格局尚可——根基不弱，顺势而为有成。`,
    '0': `日主${me}强弱居中，格局平和——无明显偏枯，一生少大起大落。`,
    '-1': `日主${me}${strong ? '偏旺' : '偏弱'}而根气稍薄——先天略有不足，须借运、借力。`,
    '-2': `日主${me}失令失地——先天根基偏弱，一生须谨慎行事、善用贵人。`,
  }[String(level)];
  const TAKE = {
    '2': '你的底子是厚的。性格上有主见、扛得住事，属于「自己就能立起来」的命。用力的方向是：把精力放在能积累的事上，别乱折腾。',
    '1': '整体是能成事的格局，只是需要顺着自己的喜用来走。命里喜什么（见上面用神方向），就往那个方向找机会、找搭档。',
    '0': '命局比较中和，没有明显的短板也没有明显的天赋溢出。这类命最靠后天：选对行业、跟对人，比八字本身更重要。',
    '-1': '先天根气偏薄，意味着你比一般人更需要「借力」——找靠山、找搭档、找平台。单打独斗会很累。',
    '-2': '日主受制较重，早年和独立闯荡会辛苦。这类命的关键是「守」和「等」：守住基本盘，等大运转好再发力。',
  }[String(level)];

  return {
    level, title: '八字 · 日主直断',
    headline: HEADLINE, takeaway: TAKE,
    timing: age ? `当前虚岁 ${age}` : null,
    signals: a.sig,
    quotes: [
      { t: '日主最宜健旺，用神不可损伤。', s: '《渊海子平》（节引）' },
      { t: '衰旺之真机，必先观月令。', s: '《滴天髓》（节引）' },
    ],
    note: `日主${bz.dayMaster}（${me}）｜四柱 ${bz.year.ganZhi} ${bz.month.ganZhi} ${bz.day.ganZhi} ${bz.time.ganZhi}`,
  };
}

// =====================================================================
// 四、古典占星（命主星 + 吉凶星 + 光体 + 福点）
// Ptolemy《Tetrabiblos》/ William Lilly《Christian Astrology》
// =====================================================================
const ASTRO_TB = '托勒密《占星四书·Tetrabiblos》';
const ASTRO_CA = 'William Lilly《Christian Astrology》(1647)';
const BENEFIC = ['jupiter', 'venus'];
const MALEFIC = ['mars', 'saturn'];
const ANGULAR = new Set([1, 4, 7, 10]);
const WEAK_HOUSE = new Set([6, 8, 12]);
export function judgeAstro(chart) {
  const a = newAcc();
  if (!chart || !chart.bodies) return null;
  const b = chart.bodies;
  const dig = chart.dignities || {};
  const ruler = chart.chartRuler;

  // ① 命主星
  if (ruler && b[ruler]) {
    const rb = b[ruler];
    const d = dig[ruler];
    const tot = d ? (d.total || 0) : 0;
    if (tot > 0) add(a, 2, `命主星${rb.name}居${rb.signName}，必然尊贵为「${d && d.peregrine ? '游' : '得位'}」（总分 +${tot}）——身主有力，主本人有格局。`, ASTRO_CA, 'AS_RULER_STRONG');
    else if (tot < 0) add(a, -2, `命主星${rb.name}居${rb.signName}失位（总分 ${tot}）——身主无力，主本人多受牵制。`, ASTRO_CA, 'AS_RULER_WEAK');
    else add(a, 0, `命主星${rb.name}居${rb.signName}，无庙旺亦无陷落（游）——身主中平。`, ASTRO_CA, 'AS_RULER_MID');
    if (rb.retrograde) add(a, -1, `命主星${rb.name}逆行——主行事多反复、迟滞。`, ASTRO_CA, 'AS_RULER_RX');
    if (ANGULAR.has(rb.house)) add(a, 1, `命主星落第${rb.house}宫（角宫）——身主得势，主本人有主张、能掌局。`, ASTRO_TB, 'AS_RULER_ANG');
  }

  // ② 吉星
  BENEFIC.forEach((id) => {
    const p = b[id]; if (!p) return;
    const d = dig[id]; const tot = d ? (d.total || 0) : 0;
    if (ANGULAR.has(p.house) || tot > 0) add(a, 1, `吉星${p.name}居${p.signName}第${p.house}宫${tot > 0 ? '、且得尊贵' : ''}——吉曜得地，主福泽、贵人、和顺。`, ASTRO_CA, 'AS_BENEFIC_GOOD_' + id);
    if (WEAK_HOUSE.has(p.house)) add(a, -1, `吉星${p.name}落第${p.house}宫（弱宫）——吉曜失位，其福不显。`, ASTRO_CA, 'AS_BENEFIC_WEAK_' + id);
  });

  // ③ 凶星
  MALEFIC.forEach((id) => {
    const p = b[id]; if (!p) return;
    const d = dig[id]; const tot = d ? (d.total || 0) : 0;
    if (p.house === 1) add(a, -1, `凶星${p.name}落命宫（第1宫）——身带煞，主性刚、多劳、易起冲突。`, ASTRO_CA, 'AS_MALEFIC_1_' + id);
    else if (ANGULAR.has(p.house) && tot <= 0) add(a, -1, `凶星${p.name}居第${p.house}宫（角宫）且失位——煞星当权，主波折、破耗。`, ASTRO_CA, 'AS_MALEFIC_ANG_' + id);
  });

  // ④ 光体（日月）
  ['sun', 'moon'].forEach((id) => {
    const p = b[id]; if (!p) return;
    if (WEAK_HOUSE.has(p.house)) add(a, -1, `${id === 'sun' ? '太阳' : '月亮'}落第${p.house}宫（弱宫）——光体失位，主志气或情绪受抑。`, ASTRO_TB, 'AS_LIGHT_WEAK_' + id);
    else if (ANGULAR.has(p.house)) add(a, 1, `${id === 'sun' ? '太阳' : '月亮'}居第${p.house}宫（角宫）——光体有力，主声名、心志得彰。`, ASTRO_TB, 'AS_LIGHT_ANG_' + id);
  });

  // ⑤ 福点
  if (chart.lots && chart.lots.fortune && typeof chart.ascSignIndex === 'number') {
    const fh = ((Math.floor(chart.lots.fortune.lon / 30) - chart.ascSignIndex + 12) % 12) + 1;
    if ([1, 2, 10, 11].includes(fh)) add(a, 1, `福点落第${fh}宫——福泽所在，主财运、际遇得宜。`, ASTRO_CA, 'AS_FORTUNE_GOOD');
    else if (WEAK_HOUSE.has(fh)) add(a, -1, `福点落第${fh}宫——福泽受抑，主财与际遇多阻。`, ASTRO_CA, 'AS_FORTUNE_WEAK');
  }

  const level = levelOf(a.s);
  const HEADLINE = {
    '2': '命主星得位、吉曜得力——本命格局清贵，属有福之盘。',
    '1': '命主星不弱、吉星有位——本命偏吉，际遇多有助力。',
    '0': '吉凶星各得其位——本命中平，成败多在后天作为。',
    '-1': '命主星失位、凶星当权——本命偏劳，须防波折破耗。',
    '-2': '命主星弱、煞曜交攻——本命格局多艰，宜守宜稳。',
  }[String(level)];
  const TAKE = {
    '2': '这张盘给你的底子是好的。性格上有光彩、容易被人看见，机会也偏向你。要做的只是别浪费这份天资。',
    '1': '整体是有福的盘，属于「顺境多、逆境少」的类型。可以大胆一点，你的运气撑得住。',
    '0': '吉凶相当，属于「命由己造」的盘。星盘只给底色，怎么画看你自己——这类盘最忌讳躺平。',
    '-1': '盘上煞星偏重，意味着你会比一般人多吃些苦、多遇些阻力。但煞星也主历练，扛过去就是你的资本。',
    '-2': '本命确实偏艰，早年尤其容易碰壁。这类盘的关键是「选对赛道」——避开高风险、选能长期积累的方向，稳扎稳打。',
  }[String(level)];

  return {
    level, title: '古典占星 · 本命直断',
    headline: HEADLINE, takeaway: TAKE,
    timing: null,
    signals: a.sig,
    quotes: [
      { t: 'The Lord of the Ascendant signifies the party enquiring; if strong and well dignified, the party is in good estate. （命主星代表本人；若有力且得尊贵，则其人处境良好。）', s: ASTRO_CA },
      { t: 'The benefics are the causes of good, the malefics of evil. （吉星为善之因，凶星为恶之因。）', s: ASTRO_TB },
    ],
    note: `${chart.sect}盘 · 上升${chart.ascSignName} · 命主星${chart.chartRulerName} · 整宫制`,
  };
}

// =====================================================================
// 五、紫微斗数（命宫星曜庙旺 + 三方四正 + 生年四化 + 煞星）
// 《紫微斗数全书》
// =====================================================================
const ZW_QS = '《紫微斗数全书》';
const BRIGHT_GOOD = { 庙: 2, 旺: 2, 得: 1, 利: 1, 平: 0 };
const BRIGHT_BAD = { 不: -1, 陷: -2 };
const SHA = ['擎羊', '陀罗', '火星', '铃星', '地空', '地劫'];
function palByName(c, name) { return (c.palaces || []).find((p) => p.name === name); }
function palByBranch(c, br) { return (c.palaces || []).find((p) => p.earthlyBranch === br); }
export function judgeZiwei(c) {
  const a = newAcc();
  if (!c || !c.palaces) return null;
  const soul = c.palaces.find((p) => p.isSoulPalace);
  if (!soul) return null;

  // 命宫实际取星：空宫借对宫
  const useEmpty = soul.isEmpty;
  const borrow = useEmpty ? palByBranch(c, soul.sanFang && soul.sanFang.opposite) : null;
  const starPal = useEmpty ? (borrow || soul) : soul;
  if (useEmpty) add(a, 0, `命宫无十四主星（空宫），借对宫${starPal ? starPal.name + '（' + starPal.earthlyBranch + '）' : ''}安星看——主性格随环境而变、易受外影响。`, ZW_QS, 'ZW_KONG_GONG');

  // ① 命宫主星庙旺
  (starPal.majorStars || []).forEach((s) => {
    const g = BRIGHT_GOOD[s.brightness], bd = BRIGHT_BAD[s.brightness];
    if (g >= 2) add(a, 2, `命宫主星${s.name}${s.brightness ? '（' + s.brightness + '）' : ''}——星得庙旺，主格局高、能力显。`, ZW_QS, 'ZW_MIAO');
    else if (g === 1) add(a, 1, `命宫主星${s.name}（${s.brightness}）——星得地利，主平顺有为之才。`, ZW_QS, 'ZW_DE');
    else if (bd <= -2) add(a, -2, `命宫主星${s.name}（${s.brightness}）——星落陷地，主才华受抑、多波折。`, ZW_QS, 'ZW_XIAN');
    else if (bd === -1) add(a, -1, `命宫主星${s.name}（${s.brightness}）——星不得地，主费力而有成。`, ZW_QS, 'ZW_BU');
  });

  // ② 生年四化落命宫/三方四正
  const sanFangSet = new Set([soul.earthlyBranch, soul.sanFang && soul.sanFang.opposite, ...(soul.sanFang ? soul.sanFang.sanhe : [])].filter(Boolean));
  const findMutagen = (kind) => {
    const hits = [];
    (c.palaces || []).forEach((p) => {
      (p.majorStars || []).concat(p.minorStars || []).forEach((s) => {
        if (s.mutagen === kind) hits.push({ p, s });
      });
    });
    return hits;
  };
  ['禄', '权', '科'].forEach((k) => {
    findMutagen(k).forEach(({ p, s }) => {
      if (p.isSoulPalace) add(a, 1, `生年化${k}（${s.name}）坐命宫——命带化${k}，主此方向有先天之利。`, ZW_QS, 'ZW_MUTA_' + k + '_MING');
      else if (sanFangSet.has(p.earthlyBranch)) add(a, 1, `生年化${k}（${s.name}）落${p.name}宫（命之三方四正）——助力及身。`, ZW_QS, 'ZW_MUTA_' + k + '_SF');
    });
  });
  findMutagen('忌').forEach(({ p, s }) => {
    if (p.isSoulPalace) add(a, -2, `生年化忌（${s.name}）坐命宫——命带化忌，主此方向为一生功课，多牵绊。`, ZW_QS, 'ZW_JI_MING');
    else if (sanFangSet.has(p.earthlyBranch)) add(a, -1, `生年化忌（${s.name}）落${p.name}宫（命之三方四正）——牵绊及身，须留意。`, ZW_QS, 'ZW_JI_SF');
  });

  // ③ 煞星
  let shaCount = 0;
  (c.palaces || []).forEach((p) => {
    const has = (p.majorStars || []).concat(p.minorStars || []).some((s) => SHA.includes(s.name));
    if (!has) return;
    const names = (p.majorStars || []).concat(p.minorStars || []).filter((s) => SHA.includes(s.name)).map((s) => s.name).join('、');
    if (p.isSoulPalace) { shaCount++; add(a, -1, `煞星${names}坐命宫——命带煞，主性刚、多劳、易起冲突。`, ZW_QS, 'ZW_SHA_MING'); }
    else if (sanFangSet.has(p.earthlyBranch)) { shaCount++; add(a, -1, `煞星${names}落${p.name}宫（命之三方四正）——煞气及身，须防波折。`, ZW_QS, 'ZW_SHA_SF'); }
  });

  // ④ 三方四正吉星
  let jiCount = 0;
  sanFangSet.forEach((br) => {
    const p = palByBranch(c, br); if (!p) return;
    (p.majorStars || []).concat(p.minorStars || []).forEach((s) => {
      if (['左辅', '右弼', '天魁', '天钺', '文昌', '文曲', '禄存', '天马'].includes(s.name)) jiCount++;
    });
  });
  if (jiCount >= 3) add(a, 1, `命之三方四正吉星共 ${jiCount} 颗（辅弼魁钺昌曲禄马）——吉曜拱命，主一生多贵人。`, ZW_QS, 'ZW_JI_XING_GONG');

  const level = levelOf(a.s);
  const HEADLINE = {
    '2': '命宫星曜庙旺、吉化拱命——本命格局上乘，属有为之命。',
    '1': '命宫得地、吉星相助——本命偏吉，一生多助。',
    '0': '命宫吉凶相当——本命中平，成败系于后天取舍。',
    '-1': '命宫星不得地或带煞——本命偏劳，须防波折。',
    '-2': '命宫落陷、化忌煞星交加——本命多艰，宜守宜稳、忌冒进。',
  }[String(level)];
  const TAKE = {
    '2': '你的命宫星是亮的、也坐对了位置，这是很好的底子。性格上容易有存在感、被委以重任。要做的就是别辜负。',
    '1': '整体命格不错，吉星在关键位置帮你。属于「遇事有人拉一把」的类型，多经营人脉、多借力。',
    '0': '命宫吉凶参半，属于「全看自己怎么走」的命。星盘给的是原材料，成品靠你自己做。',
    '-1': '命宫有煞或星不得地，意味着你会比别人多绕些弯。这类命的特点是「大器晚成」，别急。',
    '-2': '命宫落陷、化忌又逢煞，早年确实会比较难。关键在「守」：守住健康、守住本业，等大限转好再谈扩张。',
  }[String(level)];

  return {
    level, title: '紫微斗数 · 命宫直断',
    headline: HEADLINE, takeaway: TAKE,
    timing: soul.decadalRange ? `命宫大限 ${soul.decadalRange[0]}–${soul.decadalRange[1]} 岁` : null,
    signals: a.sig,
    quotes: [
      { t: '凡看命，先看命宫星曜庙旺，次看三方四正吉凶。', s: '《紫微斗数全书》（节引）' },
      { t: '诸星所居庙旺则吉，落陷则凶。', s: '《紫微斗数全书》（节引）' },
    ],
    note: `命宫在${c.soulBranch}、身宫在${c.bodyBranch}｜${c.fiveElementsClass}｜命主${c.soul}｜${c.generator}`,
  };
}

// =====================================================================
// 统一渲染
// =====================================================================
export function verdictCardHtml(v) {
  if (!v) return '';
  const h = HEAD[String(v.level)] || HEAD['0'];
  const sigs = (v.signals || []).slice().sort((x, y) => Math.abs(y.w) - Math.abs(x.w));
  const sigHtml = sigs.map((g) => `<li class="vd-sig ${g.w > 0 ? 'is-plus' : g.w < 0 ? 'is-minus' : 'is-zero'}">
      <span class="vd-sig-mark">${g.w > 0 ? '＋' : g.w < 0 ? '－' : '·'}</span>
      <span class="vd-sig-txt">${esc(g.text)}</span>
      <span class="vd-sig-src">${esc(g.src)}</span>
    </li>`).join('');
  const quoteHtml = (v.quotes || []).length
    ? `<div class="vd-quotes">${v.quotes.map((q) => `<blockquote class="vd-quote"><p>${esc(q.t)}</p><cite>${esc(q.s)}</cite></blockquote>`).join('')}</div>`
    : '';
  return `<div class="vd-card glass-card ${h.cls}">
    <div class="vd-head">
      <span class="vd-kicker">古法直断 · ${esc(v.title || '')}</span>
      <span class="vd-badge vd-badge-${h.cls}">${h.icon} ${h.mark}</span>
    </div>
    <div class="vd-headline">${esc(v.headline)}</div>
    <div class="vd-takeaway">${esc(v.takeaway)}</div>
    ${v.timing ? `<div class="vd-timing"><span class="vd-timing-k">什么时候有分晓？</span>${esc(v.timing)}</div>` : ''}
    <details class="vd-why" open>
      <summary>为什么这么断？逐条依据</summary>
      <ol class="vd-signals">${sigHtml}</ol>
      ${quoteHtml}
      <div class="vd-disclaimer">这是按古法写死的规则，对你这一盘的事实逐条加减得出的倾向；每条附典籍出处，流派有异处并列，不作唯一真理。吉凶为倾向，不是命定。${v.note ? '　' + esc(v.note) : ''}</div>
    </details>
  </div>`;
}
