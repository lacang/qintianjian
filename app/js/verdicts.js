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
  const benYong = `体${ti.gua}（${ti.wuXing}）·用${yong.gua}（${yong.wuXing}）`;
  const HEADLINE = {
    '2': `${benYong}：用生体，大势偏吉——${tiDesc}，你所求之事有外来之助，宜进。`,
    '1': `${benYong}：${tiDesc}，事在人为——稳步推进可有成。`,
    '0': `${benYong}：体用相平，吉凶两可——${tiDesc}，宜守正、看后续变化再定。`,
    '-1': `${benYong}：体用偏耗，宜谨慎——${tiDesc}，有损耗之象，不宜强求。`,
    '-2': `${benYong}：体用受克，宜避——${tiDesc}，此事阻力大于助力，能缓则缓、能退则退。`,
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
      { t: '体克用，诸事吉；用克体，诸事凶。体生用，有耗失之患；用生体，有进益之喜；体用比和，则百事顺遂。', s: '《梅花易数·卷二·体用总诀》' },
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
  const juTxt = `${q.dun}${q.ju}局·值符${zfStar || '—'}·值使${zsDoor || '—'}`;
  // -2 断语按盘面实况生成（v134 修 D2 同类硬编码）：凶门/空亡/门迫各报实数，不预设「伏吟空迫交加」
  const badTxt = `八宫凶门 ${bad}、空亡 ${kong.length} 宫、门迫 ${po.length} 宫`;
  const HEADLINE = {
    '2': `${juTxt}：吉门吉星当值——此局格局清吉，是难得的可为之时。`,
    '1': `${juTxt}：有吉门吉星可用——此局偏吉，顺着有利方位行事较为顺。`,
    '0': `${juTxt}：吉凶互见——没有一边倒，宜择吉方、避凶门而动。`,
    '-1': `${juTxt}：凶门凶星当值（${badTxt}）——此局偏凶，宜守不宜攻。`,
    '-2': `${juTxt}：${badTxt}——凶象集中，动则多阻，能缓则缓。`,
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
      { t: '八门若遇开休生，诸事逢之总称情。', s: '《烟波钓叟歌》（《遁甲演义》本）' },
      { t: '急则从神缓从门，三五反复天道亨。', s: '《烟波钓叟歌》（《遁甲演义》本）' },
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
// —— 旺衰：档位与判词同一口径（v134 修 D3/D4）——
// 古法内核 liuyao-core/bazi-extra.ts 明写「得势（五行占比）仅参考，不参与定强弱」。
// 本层与之同口径：只由「得令（月令）+ 得地（日支）」定强弱；得势、五行缺只作参考项，
// 权重 0、不进档位。判词一律由本函数返回的 level 派生（headline / 综合判断 / 喜忌同源），
// 不再各自看条件——这样就不会出现「帮身者众」与「偏弱」同卡并存。
// 本命档位只看本命盘：大运（BZ_DA_YUN）权重 0，另在 dayun 字段单列，绝不改写 level。
const BZ_MONTH_WORD = { same: '同气', sheng: '生我', beiSheng: '泄气', ke: '克我', beiKe: '耗气' };
const BZ_DAY_WORD = { same: '同气', sheng: '生扶', beiSheng: '泄气', ke: '克制', beiKe: '耗身' };
const sgn = (n) => (n > 0 ? '+' + n : String(n));

function baziStrength(bz) {
  const me = bz.dayMasterWuXing || '';
  const mZhi = bz.month && bz.month.zhi ? bz.month.zhi : '';
  const mWx = WX_ZHI[mZhi] || '';
  const relMonth = wxRel(mWx, me); // 月令 对 日主
  let deling = 0;
  if (relMonth === 'same' || relMonth === 'sheng') deling = 2;
  else if (relMonth === 'beiSheng' || relMonth === 'beiKe') deling = -1;
  else if (relMonth === 'ke') deling = -2;

  const dZhi = bz.day && bz.day.zhi ? bz.day.zhi : '';
  const dWx = WX_ZHI[dZhi] || '';
  const relDay = wxRel(dWx, me);
  const dedi = relDay === 'same' || relDay === 'sheng' ? 1 : relDay === 'ke' || relDay === 'beiKe' ? -1 : 0;

  const cnt = bz.wuXingCount || {};
  const shengMe = Object.keys(WX_SHENG).find((k) => WX_SHENG[k] === me) || '';
  const mine = (cnt[me] || 0) + (shengMe ? cnt[shengMe] || 0 : 0);
  const total = Object.values(cnt).reduce((x, y) => x + y, 0) || 1;
  const ratio = mine / total;

  const score = deling + dedi;
  // 档位（本命，唯一来源）：≤-2 失令失地 / -1 根气稍薄 / 0 相抵 / 1 偏旺 / ≥2 得令得地
  const level = score >= 2 ? 2 : score === 1 ? 1 : score === 0 ? 0 : score === -1 ? -1 : -2;
  return { me, mZhi, relMonth, dZhi, dWx, relDay, deling, dedi, cnt, shengMe, mine, total, ratio, score, level };
}

export function judgeBazi(bz, opt = {}) {
  const a = newAcc();
  if (!bz || !bz.dayMaster) return null;
  const st = baziStrength(bz);
  const { me, mZhi, relMonth, dZhi, dWx, relDay, deling, dedi, shengMe, mine, total, ratio, score, level } = st;
  const YZP = '《渊海子平》';
  const DTJ = '《滴天髓》';
  const tier = level >= 1 ? '偏旺' : level <= -1 ? '偏弱' : '中和';

  // ① 得令：月支（单项事实，用词只描述这一项）
  if (relMonth === 'same') add(a, 2, `日主${me}生于${mZhi}月，月令同气（得令 +2）——根基得时。`, DTJ, 'BZ_DE_LING');
  else if (relMonth === 'sheng') add(a, 2, `日主${me}生于${mZhi}月，月令生我（得令 +2）——印星当令，有生扶。`, DTJ, 'BZ_DE_LING_SHENG');
  else if (relMonth === 'beiSheng') add(a, -1, `日主${me}生于${mZhi}月，我生月令（泄气 -1）——身被泄。`, DTJ, 'BZ_XIE_QI');
  else if (relMonth === 'ke') add(a, -2, `日主${me}生于${mZhi}月，月令克我（失令 -2）——身受克。`, DTJ, 'BZ_SHI_LING');
  else if (relMonth === 'beiKe') add(a, -1, `日主${me}生于${mZhi}月，我克月令（耗气 -1）——身被耗。`, DTJ, 'BZ_HAO_QI');

  // ② 得地：日支
  if (dedi === 1) add(a, 1, `日主坐${dZhi}（${dWx}）——日支生扶（得地 +1）。`, YZP, 'BZ_DE_DI');
  else if (dedi === -1) add(a, -1, `日主坐${dZhi}（${dWx}）——日支克耗（失地 -1）。`, YZP, 'BZ_SHI_DI');

  // ③ 得势：五行占比（参考项，权重 0，不进档位——与内核「仅参考，不参与定强弱」同口径）
  const pct = Math.round(ratio * 100);
  // 措辞不得与档位打架：偏弱者即便印比占比高，也不能写「得势」（那是反证）；偏旺者占比低亦不写「失势」
  const shiWord = level <= -1 && ratio >= 0.25 ? '占比虽多' : level >= 1 && ratio <= 0.5 ? '占比偏少' : ratio >= 0.5 ? '得势' : ratio <= 0.25 ? '失势' : '势均';
  add(a, 0, `全局五行中比劫+印星共 ${mine}/${total}（${pct}%，${shiWord}）——此为参考项，按古法与内核口径不参与定强弱；强弱只看月令与日支。`, YZP, 'BZ_DE_SHI');

  // ④ 综合判断：档位在这里唯一确定，判词由此派生（与 headline 同一来源）
  const xiJi = level >= 1
    ? '喜财（我克）、官（克我）、食伤（我生）来克泄，忌再添印比'
    : level <= -1
      ? '喜印（生我）、比劫（同我）来生扶，忌财官食伤再耗'
      : '强弱相抵、喜忌不固定，宜按行运逐年取舍，不宜死守一偏';
  add(a, 0, `综合判断：日主${me}${tier}（得令 ${sgn(deling)}、得地 ${sgn(dedi)}，合计 ${sgn(score)}）——${xiJi}。`, '《三命通会·论日主强弱》', 'BZ_QIANG_RUO');

  // ⑤ 当前大运：只论行运，权重 0，单列 dayun，不改写本命档位（v134 修 D4）
  const age = opt.age;
  let dayun = null;
  if (age && bz.daYun && Array.isArray(bz.daYun.list)) {
    const cur = bz.daYun.list.find((d) => age >= d.startAge && age <= d.endAge);
    if (cur && cur.ganZhi) {
      const dGanWx = WX_GAN[cur.ganZhi[0]] || '';
      const dZhiWx = WX_ZHI[cur.ganZhi[1]] || '';
      const good = (r) => r === 'same' || r === 'sheng';
      const bad = (r) => r === 'ke' || r === 'beiKe' || r === 'beiSheng';
      let dw = 0;
      if (good(wxRel(dGanWx, me))) dw += 1; else if (bad(wxRel(dGanWx, me))) dw -= 1;
      if (good(wxRel(dZhiWx, me))) dw += 1; else if (bad(wxRel(dZhiWx, me))) dw -= 1;
      const favor = level >= 1 ? dw < 0 : level <= -1 ? dw > 0 : null;
      const judge = dw === 0 ? '与本命喜忌关系不显'
        : favor === null ? '本命中和，此运偏' + (dw > 0 ? '生扶' : '克泄') + '，宜按运调整'
          : favor ? '与喜忌方向相合，主此运顺手' : '与喜忌方向相悖，主此运多磨';
      dayun = { ganZhi: cur.ganZhi, range: `${cur.startAge}–${cur.endAge}`, dw, judge };
      add(a, 0, `当前大运${cur.ganZhi}（${dGanWx}${dZhiWx}，虚岁 ${age}）对日主为「${dw > 0 ? '生扶' : dw < 0 ? '克泄耗' : '无生无克'}」——${judge}。此条只论行运，不计入本命档位。`,
        '《渊海子平·论大运》', 'BZ_DA_YUN');
    }
  }

  // ⑥ 五行缺项（参考，不改强弱档位：缺什么与日主强弱是两件事）
  const missing = ['木', '火', '土', '金', '水'].filter((w) => !st.cnt[w]);
  if (missing.length) {
    const xi = missing.filter((w) => w === me || w === shengMe);
    add(a, 0, `命局五行缺 ${missing.join('、')}${xi.length ? `（其中 ${xi.join('、')} 为日主同类或印星，主后天可补）` : '（非日主同类或印星，影响有限）'}——此条论五行配置，不改日主强弱档位。`,
      '《穷通宝鉴》', 'BZ_WU_XING_QUE');
  }

  // headline：每条都带本盘变量（日主干、月支、得令/得地分），不再是与盘无关的模板句
  const HEADLINE = {
    '2': `日主${bz.dayMaster}${me}生于${mZhi}月，得令得地（${sgn(deling)}${sgn(dedi)}）——先天根气足，属可为之人。`,
    '1': `日主${bz.dayMaster}${me}生于${mZhi}月，得令 ${sgn(deling)}、得地 ${sgn(dedi)}，合计 ${sgn(score)}——先天偏旺，顺势而为有成。`,
    '0': `日主${bz.dayMaster}${me}生于${mZhi}月，月令${BZ_MONTH_WORD[relMonth] || '无涉'} ${sgn(deling)}、日支${dZhi}${BZ_DAY_WORD[relDay] || '无涉'} ${sgn(dedi)}，两相抵消——强弱居中，一生少大起大落。`,
    '-1': `日主${bz.dayMaster}${me}生于${mZhi}月（月令${BZ_MONTH_WORD[relMonth] || '无涉'}），日支${dZhi}${BZ_DAY_WORD[relDay] || '无涉'}，合计 ${sgn(score)}——先天根气稍薄，须借运、借力。`,
    '-2': `日主${bz.dayMaster}${me}生于${mZhi}月，月令${BZ_MONTH_WORD[relMonth] || '无涉'} ${sgn(deling)}、日支${dZhi}${BZ_DAY_WORD[relDay] || '无涉'} ${sgn(dedi)}——先天根基偏弱，宜谨慎行事、善用贵人。`,
  }[String(level)];
  const TAKE = {
    '2': `本命${mZhi}月得令、日支${dZhi}又生扶（合计 ${sgn(score)}），底子是厚的。性格上有主见、扛得住事，属于「自己就能立起来」的命。用力的方向是：把精力放在能积累的事上，别乱折腾。`,
    '1': `本命月令${BZ_MONTH_WORD[relMonth] || '无涉'}、日支${BZ_DAY_WORD[relDay] || '无涉'}（合计 ${sgn(score)}），属能成事的格局，但需要顺着自己的喜用来走。命里喜什么（见上面用神方向），就往那个方向找机会、找搭档。`,
    '0': `本命月令与日支一正一负相抵（合计 ${sgn(score)}），没有明显短板也没有明显天赋溢出。这类命最靠后天：选对行业、跟对人，比八字本身更重要。`,
    '-1': `本命月令${BZ_MONTH_WORD[relMonth] || '无涉'}、日支${BZ_DAY_WORD[relDay] || '无涉'}（合计 ${sgn(score)}），先天根气偏薄，意味着你比一般人更需要「借力」——找靠山、找搭档、找平台。单打独斗会很累。`,
    '-2': `本命月令${BZ_MONTH_WORD[relMonth] || '无涉'}、日支${BZ_DAY_WORD[relDay] || '无涉'}（合计 ${sgn(score)}），日主受制较重，早年和独立闯荡会辛苦。关键在「守」和「等」：守住基本盘，等行运转好再发力。`,
  }[String(level)];

  return {
    level, title: '八字 · 日主直断',
    headline: HEADLINE, takeaway: TAKE,
    timing: age ? `当前虚岁 ${age}${dayun ? `，行${dayun.ganZhi}运（${dayun.range} 岁）` : ''}｜本命档位只看本命盘，行运另计` : null,
    dayun,
    signals: a.sig,
    quotes: [
      { t: '日主最宜健旺，用神不可损伤。', s: '义近《渊海子平》（原书归属存疑，不标为原文）' },
      { t: '能知衰旺之真机，其于三命之奥，思过半矣。', s: '《滴天髓·衰旺》' },
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
  let rulerTxt = '命主星未定';

  // ① 命主星：尊贵（得位）/ 失位二选一，不再出现同一星既「得位」又「游」
  if (ruler && b[ruler]) {
    const rb = b[ruler];
    const d = dig[ruler];
    const tot = d ? (d.total || 0) : 0;
    const houseTxt = `第${rb.house}宫`;
    // headline 只放中性事实（星、座、宫、尊贵总分），得位/失位这种定性留在该条的 signal 里，
    // 免得「命主星失位」与「本命偏吉」在同一张卡上打架。
    rulerTxt = `命主星${rb.name}居${rb.signName}${houseTxt}（尊贵总分 ${tot > 0 ? '+' + tot : tot}）`;
    if (tot > 0) {
      add(a, 2, `命主星${rb.name}居${rb.signName}${houseTxt}，必然尊贵得位（总分 +${tot}，含庙旺/三合/界/面）——身主有力，主本人有格局。`, ASTRO_CA, 'AS_RULER_STRONG');
    } else if (tot < 0) {
      add(a, -2, `命主星${rb.name}居${rb.signName}${houseTxt}，失位（总分 ${tot}，落陷/失势）——身主无力，主本人多受牵制。`, ASTRO_CA, 'AS_RULER_WEAK');
    } else {
      add(a, 0, `命主星${rb.name}居${rb.signName}${houseTxt}，无庙旺亦无陷落——身主中平，成败多在后天。`, ASTRO_CA, 'AS_RULER_MID');
    }
    if (rb.retrograde) add(a, -1, `命主星${rb.name}逆行——主行事多反复、迟滞。`, ASTRO_CA, 'AS_RULER_RX');
    if (ANGULAR.has(rb.house)) add(a, 1, `命主星落${houseTxt}（角宫）——身主得势，主本人有主张、能掌局。`, ASTRO_TB, 'AS_RULER_ANG');
  }

  // ② 吉星：每颗吉星只出一条结论（取「宫位」与「尊贵」两项中较好的那个），避免同星两条互斥
  BENEFIC.forEach((id) => {
    const p = b[id]; if (!p) return;
    const d = dig[id]; const tot = d ? (d.total || 0) : 0;
    const ang = ANGULAR.has(p.house);
    const weak = WEAK_HOUSE.has(p.house);
    if (ang || tot > 0) {
      add(a, 1, `吉星${p.name}居${p.signName}第${p.house}宫${tot > 0 ? `、必然尊贵（+${tot}）` : '（角宫）'}——吉曜得地，主福泽、贵人、和顺。`, ASTRO_CA, 'AS_BENEFIC_GOOD_' + id);
    } else if (weak && tot < 0) {
      add(a, -1, `吉星${p.name}居${p.signName}第${p.house}宫（弱宫）且失位（${tot}）——吉曜失势，其福不显。`, ASTRO_CA, 'AS_BENEFIC_WEAK_' + id);
    } else if (weak) {
      add(a, 0, `吉星${p.name}居${p.signName}第${p.house}宫（弱宫）——宫位不显，但其星本身无伤，福泽打折而非全无。`, ASTRO_CA, 'AS_BENEFIC_MID_' + id);
    } else {
      add(a, 0, `吉星${p.name}居${p.signName}第${p.house}宫，非角非弱——吉性平平。`, ASTRO_CA, 'AS_BENEFIC_MID_' + id);
    }
  });

  // ③ 凶星：每颗只出一条（落命宫优先），不再「落命宫」与「角宫失位」重复计
  const maleficNames = [];
  MALEFIC.forEach((id) => {
    const p = b[id]; if (!p) return;
    const d = dig[id]; const tot = d ? (d.total || 0) : 0;
    if (p.house === 1) {
      maleficNames.push(p.name);
      add(a, -1, `凶星${p.name}居${p.signName}落命宫（第1宫）——身带煞，主性刚、多劳、易起冲突。`, ASTRO_CA, 'AS_MALEFIC_1_' + id);
    } else if (ANGULAR.has(p.house) && tot <= 0) {
      maleficNames.push(p.name);
      add(a, -1, `凶星${p.name}居第${p.house}宫（角宫）且失位（${tot}）——煞星当权，主波折、破耗。`, ASTRO_CA, 'AS_MALEFIC_ANG_' + id);
    }
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
  const shaTxt = maleficNames.length ? `凶星${maleficNames.join('、')}当位` : '凶星不入命、不当权';
  const HEADLINE = {
    '2': `${rulerTxt}，${shaTxt}——本命格局清贵，属有福之盘。`,
    '1': `${rulerTxt}，${shaTxt}——本命偏吉，际遇多有助力。`,
    '0': `${rulerTxt}，${shaTxt}——吉凶各得其位，本命中平。`,
    '-1': `${rulerTxt}，${shaTxt}——本命偏劳，须防波折破耗。`,
    '-2': `${rulerTxt}，${shaTxt}——本命格局多艰，宜守宜稳。`,
  }[String(level)];
  const TAKE = {
    '2': `${rulerTxt}，这是张好盘。性格上有光彩、容易被人看见，机会也偏向你。要做的只是别浪费这份天资。`,
    '1': `${rulerTxt}，整体是有福的盘，属于「顺境多、逆境少」的类型。可以大胆一点，你的运气撑得住。`,
    '0': `${rulerTxt}，吉凶相当，属于「命由己造」的盘。星盘只给底色，怎么画看你自己——这类盘最忌讳躺平。`,
    '-1': `${rulerTxt}，盘上煞星偏重，意味着你会比一般人多吃些苦、多遇些阻力。但煞星也主历练，扛过去就是你的资本。`,
    '-2': `${rulerTxt}，本命确实偏艰，早年尤其容易碰壁。关键在「选对赛道」——避开高风险、选能长期积累的方向，稳扎稳打。`,
  }[String(level)];


  return {
    level, title: '古典占星 · 本命直断',
    headline: HEADLINE, takeaway: TAKE,
    timing: null,
    signals: a.sig,
    quotes: [
      { t: 'The Lord of the Ascendant signifies the party enquiring; if strong and well dignified, the party is in good estate. （命主星代表本人；有力且得尊贵，则其人处境良好。此句为依 Lilly 命主星体系所作的规范化转述，未核到 1647 年版原句，不作原文引用。）', s: '义近 William Lilly《Christian Astrology》(1647)' },
      { t: 'The benefics are the causes of good, the malefics of evil. （吉星为善之因，凶星为恶之因。此为 Tetrabiblos 吉凶星基本命题的转述，未核到 Ashmand 译本原句。）', s: '义近 托勒密《占星四书·Tetrabiblos》' },
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
const starDesc = (p) => ((p && p.majorStars) || []).map((s) => `${s.name}${s.brightness ? '（' + s.brightness + '）' : ''}`).join('、') || '空宫';
export function judgeZiwei(c) {
  const a = newAcc();
  if (!c || !c.palaces) return null;
  const soul = c.palaces.find((p) => p.isSoulPalace);
  if (!soul) return null;

  // 命宫实际取星：空宫借对宫（借来的星全程标「借」，不得称「命宫主星」——v134 修 D5/D11）
  const useEmpty = !!soul.isEmpty;
  const borrow = useEmpty ? palByBranch(c, soul.sanFang && soul.sanFang.opposite) : null;
  const starPal = useEmpty ? (borrow || soul) : soul;
  const borrowedFrom = borrow ? `${borrow.name}（${borrow.earthlyBranch}）` : '对宫';
  const soulStarTxt = useEmpty
    ? `命宫在${soul.earthlyBranch}无正曜（空宫），借对宫${borrowedFrom}之${starDesc(starPal)}`
    : `命宫在${soul.earthlyBranch}坐${starDesc(soul)}`;
  if (useEmpty) add(a, 0, `命宫无十四主星（空宫），借对宫${borrowedFrom}安星看——借来的星只作参考，主性格随环境而变、易受外影响。`, ZW_QS, 'ZW_KONG_GONG');

  let plus = 0; let minus = 0;
  const addZ = (w, text, qk) => { add(a, w, text, ZW_QS, qk); if (w > 0) plus++; else if (w < 0) minus++; };

  // ① 命宫取星庙旺（空宫时主语是「借对宫X之星」，不是「命宫主星」）
  const pfx = useEmpty ? `借对宫${borrowedFrom}之星` : '命宫主星';
  (starPal.majorStars || []).forEach((s) => {
    const g = BRIGHT_GOOD[s.brightness], bd = BRIGHT_BAD[s.brightness];
    const nm = `${s.name}${s.brightness ? '（' + s.brightness + '）' : ''}`;
    const tail = useEmpty ? '——借星入命，' : '——';
    if (g >= 2) addZ(2, `${pfx}${nm}${tail}星得庙旺，主格局高、能力显。`, 'ZW_MIAO');
    else if (g === 1) addZ(1, `${pfx}${nm}${tail}星得地利，主平顺有为之才。`, 'ZW_DE');
    else if (bd <= -2) addZ(-2, `${pfx}${nm}${tail}星落陷地，主才华受抑、多波折。`, 'ZW_XIAN');
    else if (bd === -1) addZ(-1, `${pfx}${nm}${tail}星不得地，主费力而有成。`, 'ZW_BU');
    else addZ(0, `${pfx}${nm}${tail}星性平和，吉凶不显。`, 'ZW_PING');
  });

  // ② 生年四化落命/三方四正
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
      if (p.isSoulPalace) addZ(1, `生年化${k}（${s.name}）坐命宫——命带化${k}，主此方向有先天之利。`, 'ZW_MUTA_' + k + '_MING');
      else if (sanFangSet.has(p.earthlyBranch)) addZ(1, `生年化${k}（${s.name}）落${p.name}宫（命之三方四正）——助力及身。`, 'ZW_MUTA_' + k + '_SF');
    });
  });
  const jiHits = findMutagen('忌');
  jiHits.forEach(({ p, s }) => {
    if (p.isSoulPalace) addZ(-2, `生年化忌（${s.name}）坐命宫——命带化忌，主此方向为一生功课，多牵绊。`, 'ZW_JI_MING');
    else if (sanFangSet.has(p.earthlyBranch)) addZ(-1, `生年化忌（${s.name}）落${p.name}宫（命之三方四正）——牵绊及身，须留意。`, 'ZW_JI_SF');
    else addZ(0, `生年化忌（${s.name}）落${p.name}宫，不在命宫、亦不入命之三方四正——此忌与本命格局无直接关系，不作命宫论断。`, 'ZW_JI_OUT');
  });

  // ③ 煞星
  let shaMing = []; const shaSf = [];
  (c.palaces || []).forEach((p) => {
    const names = (p.majorStars || []).concat(p.minorStars || []).filter((s) => SHA.includes(s.name)).map((s) => s.name);
    if (!names.length) return;
    if (p.isSoulPalace) { shaMing = names; addZ(-1, `煞星${names.join('、')}坐命宫——命带煞，主性刚、多劳、易起冲突。`, 'ZW_SHA_MING'); }
    else if (sanFangSet.has(p.earthlyBranch)) { shaSf.push(...names); addZ(-1, `煞星${names.join('、')}落${p.name}宫（命之三方四正）——煞气及身，须防波折。`, 'ZW_SHA_SF'); }
  });

  // ④ 三方四正吉星
  let jiCount = 0;
  sanFangSet.forEach((br) => {
    const p = palByBranch(c, br); if (!p) return;
    (p.majorStars || []).concat(p.minorStars || []).forEach((s) => {
      if (['左辅', '右弼', '天魁', '天钺', '文昌', '文曲', '禄存', '天马'].includes(s.name)) jiCount++;
    });
  });
  if (jiCount >= 3) addZ(1, `命之三方四正吉星共 ${jiCount} 颗（辅弼魁钺昌曲禄马）——吉曜拱命，主一生多贵人。`, 'ZW_JI_XING_GONG');

  const level = levelOf(a.s);

  // 化忌落宫事实（headline/takeaway 只按实际落宫说话，不再硬编码「化忌煞星交加」——v134 修 D2）
  const jiSoul = jiHits.find((h) => h.p.isSoulPalace);
  const jiSf = jiHits.find((h) => sanFangSet.has(h.p.earthlyBranch));
  const shaAll = shaMing.concat(shaSf);
  const shaClause = shaAll.length ? `三方四正见 ${shaAll.length} 煞（${shaAll.join('、')}）` : '三方四正无煞';
  const jiClause = jiSoul ? `生年化忌（${jiSoul.s.name}）坐命`
    : jiSf ? `生年化忌（${jiSf.s.name}）落${jiSf.p.name}宫（命之三方）`
      : jiHits.length ? `生年化忌（${jiHits[0].s.name}）落${jiHits[0].p.name}宫、不入命之三方` : '四化中无化忌入命';
  // 减分项必须说清楚「哪几条」——取负分信号的事实前缀，不再拿「三方四正无煞」这类正向描述充当减分项（v134 修）
  const negs = a.sig.filter((x) => x.w < 0).map((x) => x.text.split('——')[0]);
  const borrowPref = negs.length && negs.every((t) => /^借对宫.*之星/.test(t)) ? negs[0].match(/^借对宫.*之星/)[0] : '';
  const minusWhy = borrowPref
    ? `${borrowPref}${negs.map((t) => t.replace(borrowPref, '')).join('、')}`
    : (negs.slice(0, 3).join('；') || shaClause);

  const HEADLINE = {
    '2': `${soulStarTxt}，${shaClause}——本命格局上乘，属有为之命。`,
    '1': `${soulStarTxt}，${shaClause}——本命偏吉，一生多助。`,
    '0': `${soulStarTxt}，${shaClause}、${jiClause}——吉凶相抵，本命中平，成败系于后天取舍。`,
    '-1': `${soulStarTxt}，${shaClause}——本命偏劳，须防波折。`,
    '-2': `${soulStarTxt}，${shaClause}、${jiClause}——本命多艰，宜守宜稳、忌冒进。`,
  }[String(level)];
  const TAKE = {
    '2': `命宫${soul.earthlyBranch}${useEmpty ? '（空宫借星）' : ''}星曜得力、三方吉星 ${jiCount} 颗拱命，这是很好的底子。性格上容易有存在感、被委以重任。要做的就是别辜负。`,
    '1': `命宫${soul.earthlyBranch}${useEmpty ? `（借对宫${borrowedFrom}安星）` : ''}，${shaClause}、吉星 ${jiCount} 颗。属于「遇事有人拉一把」的类型，多经营人脉、多借力。`,
    '0': `命宫${soul.earthlyBranch}吉凶参半（${plus} 项加分、${minus} 项减分），属于「全看自己怎么走」的命。星盘给的是原材料，成品靠你自己做。`,
    '-1': `命宫${soul.earthlyBranch}${useEmpty ? '（空宫借星）' : ''}的减分项 ${minus} 条：${minusWhy}。意味着你会比别人多绕些弯。这类命的特点是「大器晚成」，别急。`,
    '-2': `命宫${soul.earthlyBranch}${useEmpty ? `（借对宫${borrowedFrom}安星）` : ''}：${shaClause}，${jiClause}。早年的确会辛苦些。关键在「守」：守住本业与身体，等大限转好再谈扩张。`,
  }[String(level)];

  return {
    level, title: '紫微斗数 · 命宫直断',
    headline: HEADLINE, takeaway: TAKE,
    timing: soul.decadalRange ? `命宫大限 ${soul.decadalRange[0]}–${soul.decadalRange[1]} 岁` : null,
    signals: a.sig,
    quotes: [
      { t: '星临庙旺，再观生克之机；命坐强宫，细察制化之理。', s: '《太微赋》（《紫微斗数全书》所收赋文）' },
      { t: '诸星所居庙旺则吉，落陷则凶。', s: '通行口诀（未见于《紫微斗数全书》成句，姑且义近）' },
    ],
    note: `命宫在${c.soulBranch}、身宫在${c.bodyBranch}${useEmpty ? '（空宫借对宫安星）' : ''}｜${c.fiveElementsClass}｜命主${c.soul}｜${c.generator}`,
  };
}

// =====================================================================
// 六、多盘合参的「可比维度」与机械对照（纯函数，供 hecanview 调用）
// 立场：
//   合参不是把几盘缝成一个故事，而是**分轨**各比各的：
//   · 问事轨：同一时刻起的时占盘（梅花 / 奇门 / 六爻），比的是「对所问之事的方向」；
//   · 本命轨：出生盘（八字 / 紫微 / 西方 / 吠陀），比的是「对本命格局档位的判读」。
//   跨轨不比——本命盘不回答「这周这笔款能不能到账」，这是口径，不是态度。
//   每盘的可比维度一律取自该盘自己的结论卡（judgeXxx 的 level），不另造分数。
// =====================================================================

/** 本命结论档位（-2..2）→ 命轨可比档 */
export function natalGradeOf(level) {
  if (level == null) return null;
  if (level >= 1) return 'strong';
  if (level <= -1) return 'weak';
  return 'mid';
}
export const GRADE_ZH = { strong: '格局偏厚', mid: '格局中平', weak: '格局偏薄' };
export const TRACK_LABEL = { question: '问事轨', natal: '本命轨' };

const YES_NO = { yes: '肯定', no: '否定', flat: '平' };

/**
 * 分轨机械对照。
 * pans: [{ key, name, track:'question'|'natal', answered, stance:'yes'|'no'|null, grade:'strong'|'mid'|'weak'|null }]
 * 返回 { tracks:[...], same, none, clash, strength, why, strongest }
 */
export function comparePans(pans) {
  const list = Array.isArray(pans) ? pans.filter((p) => p && p.answered) : [];
  const tracks = [];

  for (const key of ['question', 'natal']) {
    const group = list.filter((p) => p.track === key);
    const same = [];
    const none = [];
    const clash = [];

    if (group.length < 2) {
      none.push(`本轨仅 ${group.length} 盘有结果，无法交叉`);
    } else {
      for (let i = 0; i < group.length; i++) {
        for (let j = i + 1; j < group.length; j++) {
          const a = group[i], b = group[j];
          const tag = `${a.name} × ${b.name}`;
          if (key === 'question') {
            if (!a.stance || !b.stance) { none.push(`${tag}：一方只列事实，未给方向`); continue; }
            if (a.stance === 'flat' || b.stance === 'flat') {
              if (a.stance === b.stance) same.push(`${tag}：均判「平」，无明显方向`);
              else none.push(`${tag}：一方判平，与另一方的方向不构成对照`);
              continue;
            }
            if (a.stance === b.stance) same.push(`${tag}：方向相同（${YES_NO[a.stance]}）`);
            else clash.push(`${tag}：方向相反（${YES_NO[a.stance]} 对 ${YES_NO[b.stance]}）`);
          } else {
            if (!a.grade || !b.grade) { none.push(`${tag}：一方未给档位`); continue; }
            if (a.grade === b.grade) same.push(`${tag}：档位相同（${GRADE_ZH[a.grade]}）`);
            else if (a.grade !== 'mid' && b.grade !== 'mid') clash.push(`${tag}：档位相反（${GRADE_ZH[a.grade]} 对 ${GRADE_ZH[b.grade]}）`);
            else none.push(`${tag}：一方中平，无可比方向`);
          }
        }
      }
    }

    const pairs = group.length < 2 ? 0 : (group.length * (group.length - 1)) / 2;
    let strength = '弱';
    if (group.length >= 3 && clash.length === 0 && same.length >= 3) strength = '强';
    else if (group.length >= 2 && clash.length === 0 && same.length >= 1) strength = '中';

    // 本命轨最高只记「中」：八字/紫微/西方同出同一生辰、判据相互重叠（都看庙旺得地），
    // 三盘一致不等于三方独立互证，不能凭此把强度抬到「强」。
    let why = `${TRACK_LABEL[key]} 有效盘 ${group.length} 个 · 对子 ${pairs} 组 · 冲突 ${clash.length} 条`;
    if (key === 'natal' && strength === '强') {
      strength = '中';
      why += ' · 三盘同源同数据、判据重叠，不构成独立互证，本轨最高记「中」';
    }

    tracks.push({
      key, label: TRACK_LABEL[key], answered: group.length, pairs, same, none, clash, strength,
      why,
    });
  }

  // 总强度取各轨中最高的那一档，且必须说清是哪一轨撑起来的
  const rank = { 弱: 0, 中: 1, 强: 2 };
  const top = tracks.slice().sort((a, b) => rank[b.strength] - rank[a.strength])[0];
  const strength = top ? top.strength : '弱';
  const strongest = top && rank[top.strength] > 0 ? top.label : null;

  return {
    tracks,
    same: tracks.flatMap((t) => t.same.map((x) => `〔${t.label}〕${x}`)),
    none: tracks.flatMap((t) => t.none.map((x) => `〔${t.label}〕${x}`)),
    clash: tracks.flatMap((t) => t.clash.map((x) => `〔${t.label}〕${x}`)),
    strength,
    strongest,
    why: `${tracks.map((t) => `${t.label} ${t.answered} 盘/冲突 ${t.clash.length}`).join(' · ')}${strongest ? ` · 由${strongest}支撑` : ' · 无可交叉项'}`,
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
