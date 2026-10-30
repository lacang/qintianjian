#!/usr/bin/env node
/**
 * 关键项识别层·独立核对脚本（只读）
 *
 * 目的：对「排盘事实层 + 旺衰事实层」的关键识别项，用**独立预期来源**重算一遍，
 *      再与生产实现比对。独立预期不得由被测函数自己生成：
 *        - 八卦爻位/卦画：按《易经》卦画定义（自下而上）人工固定，用第三方
 *          getTrigramsFromValues（经 vendor 暴露）反查卦名做交叉确认。
 *        - 六冲卦/六合卦：古法定义（初四/二五/三上 两两相冲 / 两两相合），
 *          地支取第三方 NajiaCalculator（经 getFullNajia 暴露），判定规则由本脚本实现。
 *        - 世应：京房八宫标准映射（八纯世六 / 一世初二世二…五世五 / 游魂世四 / 归魂世三，应=世±3）。
 *        - 六神：日干起六神（甲乙青龙、丙丁朱雀、戊勾陈、己螣蛇、庚辛白虎、壬癸玄武，自初爻上排）。
 *        - 旬空：六十甲子独立推旬首，空亡取旬首后两位。
 *        - 旺衰五态：古法「当令旺 / 令生相 / 生令休 / 令克死 / 克令囚」逐对枚举。
 *      本脚本不修改任何生产文件，只输出 JSON 供 05_test_results.md 引用。
 *
 * 运行：node tools/score-verify-v2/key-fact-audit/scripts/verify-facts.mjs
 */
import { writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, '../../../..');
const VENDOR = resolve(ROOT, 'app/vendor/liuyao-core.js');

const L = await import(VENDOR);
const {
  CHANG_SHENG, LIU_CHONG, LIU_HE, paipan, getGuaMeta, getFullNajia,
  getTrigramsFromValues, getShouGuaPan, castByTime, analyzeNajia, lingTaiOf,
} = L;

const out = { generatedAt: new Date().toISOString(), vendor: VENDOR, tests: {} };
const BAGUA8 = ['乾', '兑', '离', '震', '巽', '坎', '艮', '坤'];
const WX = ['金', '木', '水', '火', '土'];
const SHENG = { 金: '水', 水: '木', 木: '火', 火: '土', 土: '金' };
const KE = { 金: '木', 木: '土', 土: '水', 水: '火', 火: '金' };
const WANG = new Set(['旺', '相']);
const ZHI_WX = { 子: '水', 丑: '土', 寅: '木', 卯: '木', 辰: '土', 巳: '火', 午: '火', 未: '土', 申: '金', 酉: '金', 戌: '土', 亥: '水' };
const GAN = ['甲', '乙', '丙', '丁', '戊', '己', '庚', '辛', '壬', '癸'];
const ZHI = ['子', '丑', '寅', '卯', '辰', '巳', '午', '未', '申', '酉', '戌', '亥'];

/* ================= T1 八卦爻位表方向 ================= */
const EXPECT_BITS = {
  乾: '阳阳阳', 兑: '阳阳阴', 离: '阳阴阳', 震: '阳阴阴',
  巽: '阴阳阳', 坎: '阴阳阴', 艮: '阴阴阳', 坤: '阴阴阴',
};
const t1 = { expect: EXPECT_BITS, actualShouGuaPan: {}, mismatch: [], crossCheck: {} };
for (const g of BAGUA8) {
  const pan = getShouGuaPan(g);
  const yy = pan.yaoList.map((y) => y.yinYang).join('');
  t1.actualShouGuaPan[g] = { name: pan.meta.name, yinYang: yy };
  const exp = EXPECT_BITS[g] + EXPECT_BITS[g];
  if (yy !== exp) t1.mismatch.push({ gua: g, guaName: pan.meta.name, expect: exp, actual: yy });
  const vals = (exp).split('').map((c) => (c === '阳' ? 7 : 8));
  const t = getTrigramsFromValues(vals);
  t1.crossCheck[g] = `${t.upper}上${t.lower}下`;
  if (t.upper !== g || t.lower !== g) t1.mismatch.push({ crossCheck: g, got: t1.crossCheck[g] });
}
out.tests.T1_bagua_bits = t1;

/* ================= T1b castByTime 自洽 ================= */
const XT_NAME = { 1: '乾', 2: '兑', 3: '离', 4: '震', 5: '巽', 6: '坎', 7: '艮', 8: '坤' };
const t1b = { total: 400, samples: [], mismatchCount: 0, mismatch: [] };
for (let i = 0; i < 400; i++) {
  const d = new Date(Date.UTC(2020, 0, 1) + i * 37 * 3600_000);
  const r = castByTime(d);
  const t = getTrigramsFromValues(r.cast.yaoValues);
  const ok = t.upper === XT_NAME[r.upperNumber] && t.lower === XT_NAME[r.lowerNumber];
  if (i < 12) t1b.samples.push({ upperNumber: r.upperNumber, lowerNumber: r.lowerNumber, got: `${t.upper}/${t.lower}`, ok });
  if (!ok) { t1b.mismatchCount++; if (t1b.mismatch.length < 10) t1b.mismatch.push({ upperNumber: r.upperNumber, lowerNumber: r.lowerNumber, got: `${t.upper}/${t.lower}` }); }
}
out.tests.T1b_timecast_selfconsistency = t1b;

/* ================= T2/T3 六冲卦、六合卦 ================= */
// 2026-10-28 L1 第一批修复后：与 app/js/verdict.js 现行名单一致（修复前六冲缺无妄/大壮、六合 3 出 3 入）
const VERDICT_LIU_CHONG = ['乾为天', '坤为地', '坎为水', '离为火', '震为雷', '艮为山', '巽为风', '兑为泽', '天雷无妄', '雷天大壮'];
const VERDICT_LIU_HE = ['地雷复', '地天泰', '雷地豫', '水泽节', '泽水困', '山火贲', '火山旅', '天地否'];

const gua64 = [];
for (const up of BAGUA8) for (const lo of BAGUA8) {
  const meta = getGuaMeta(up, lo);
  const zhi = getFullNajia(up, lo).map((x) => x.zhi);
  const chong = [0, 1, 2].every((i) => LIU_CHONG[zhi[i]] === zhi[i + 3]);
  const he = [0, 1, 2].every((i) => LIU_HE[zhi[i]] === zhi[i + 3]);
  gua64.push({ name: meta.name, up, lo, zhi: zhi.join(''), chong, he, specialType: meta.specialType || null, guaXu: meta.guaXu, shi: meta.shiPosition, ying: meta.yingPosition });
}
const indepChong = gua64.filter((g) => g.chong).map((g) => g.name).sort();
const indepHe = gua64.filter((g) => g.he).map((g) => g.name).sort();
const constChong = gua64.filter((g) => g.specialType === '六冲').map((g) => g.name).sort();
const constHe = gua64.filter((g) => g.specialType === '六合').map((g) => g.name).sort();
const diff = (a, b) => ({ onlyInA: a.filter((x) => !b.includes(x)), onlyInB: b.filter((x) => !a.includes(x)) });

out.tests.T2_liuchong_gua = {
  indep: indepChong, constants: constChong, verdictJs: [...VERDICT_LIU_CHONG].sort(),
  indepVsConstants: diff(indepChong, constChong),
  indepVsVerdict: diff(indepChong, [...VERDICT_LIU_CHONG].sort()),
  countIndep: indepChong.length, countConstants: constChong.length, countVerdict: VERDICT_LIU_CHONG.length,
};
out.tests.T3_liuhe_gua = {
  indep: indepHe, constants: constHe, verdictJs: [...VERDICT_LIU_HE].sort(),
  indepVsConstants: diff(indepHe, constHe),
  indepVsVerdict: diff(indepHe, [...VERDICT_LIU_HE].sort()),
  countIndep: indepHe.length, countConstants: constHe.length, countVerdict: VERDICT_LIU_HE.length,
};
out.tests.T3b_he_chong_overlap = constHe.filter((x) => constChong.includes(x));

/* ================= T16 世应位置（京房八宫映射） ================= */
const SHI_BY_GUAXU = { 1: 6, 2: 1, 3: 2, 4: 3, 5: 4, 6: 5, 7: 4, 8: 3 };
const t16 = { checked: 0, mismatch: [], byGuaXu: {} };
for (const g of gua64) {
  const expShi = SHI_BY_GUAXU[g.guaXu];
  const expYing = expShi > 3 ? expShi - 3 : expShi + 3;
  t16.checked++;
  t16.byGuaXu[g.guaXu] = (t16.byGuaXu[g.guaXu] || 0) + 1;
  if (g.shi !== expShi || g.ying !== expYing) {
    t16.mismatch.push({ gua: g.name, gong: gua64.find((x) => x.name === g.name) && getGuaMeta(g.up, g.lo).gong, guaXu: g.guaXu, expShi, expYing, actShi: g.shi, actYing: g.ying });
  }
}
out.tests.T16_shiying = t16;

/* ================= T4 土墓库 ================= */
out.tests.T4_tumu = {
  engine: Object.fromEntries(Object.entries(CHANG_SHENG).map(([k, v]) => [k, { zhangsheng: v.zhangsheng, diwang: v.diwang, mu: v.mu, jue: v.jue }])),
  note: 'wuxing-rel.ts 头注释(行5)称"土爻…墓在辰"，同文件行68 又称"土…墓在戌"，CHANG_SHENG 实现为戌；《增删卜易》正文行933 为"土水同墓于辰"。三处口径不一致。',
};

/* ================= 多日期扫描工具 ================= */
const DAYS = [];
for (let d = 0; d < 12; d++) {
  const dt = new Date(Date.UTC(2026, 9, 26 + d, 9, 35));
  DAYS.push({ year: dt.getUTCFullYear(), month: dt.getUTCMonth() + 1, day: dt.getUTCDate(), hour: 17, minute: 35 });
}
function panOfMask(mask, day) {
  const vals = [];
  for (let i = 0; i < 6; i++) {
    const bit = (mask >> i) & 1;
    const mov = (mask >> (i + 6)) & 1;
    vals.push(bit ? (mov ? 9 : 7) : (mov ? 6 : 8));
  }
  return paipan({ yaoValues: vals, ...day, gender: '男' });
}

/* ================= T5/T8/T9/T11 多日期全量扫描 ================= */
const t5 = { days: [], total: 0, muTrueCount: 0, byMonthOnly: 0, byDayOnly: 0, both: 0 };
const t8 = { movingChongByDay: 0, samples: [] };
const t9 = { huaMu: 0, dongMuYi: 0, samples: [] };
const t11 = { total: 0,
  // —— 独立理论面（只用未修改的 lingTaiOf + LIU_CHONG 常量，不调用被测 evalYao 的判定）——
  rawWangPo: 0,       // 原始旺衰态为旺/相 且 月破（修复前的冲突面；古法只可能出现「旺+破」）
  rawXiuRiChong: 0,   // 原始休态静爻被日冲（修复前无归属面）
  rawDeadQiuRiChong: 0, // 原始死/囚静爻被日冲（本就应是日破）
  rawWangPoRipressed: 0, // 「旺+破」中同时被日冲者（修复后双重归入 riPo 的部分）
  rawWangRiChong: 0,  // 原始旺/相静爻被日冲且不月破（应为暗动）
  // —— 引擎实际输出 ——
  engWangAndPo: 0,    // 输出态旺/相 且 月破：修复后必须 0
  engRiPo: 0, engAnDong: 0, engRiChongNoTag: 0,
  // —— 逐例对照 ——
  xiuAllMarkedRipo: true,  // 每个理论「休态日冲」引擎都必须标 riPo
  wangpoAllPressed: true,  // 每个理论「旺+破」引擎输出态都必须不是旺/相
  anDongMismatch: 0 };     // 理论暗动面与引擎 anDong 不符数
const t17 = { bianXunKong: 0, bianYuePo: 0, samples: [] }; // 变爻自身旬空/月破（程序未计算）

for (const day of DAYS) {
  const pan0 = panOfMask(0, day);
  const monthZhi = pan0.siZhu.monthGanZhi.charAt(1);
  const dayZhi = pan0.siZhu.dayGanZhi.charAt(1);
  t5.days.push({ date: `${day.year}-${day.month}-${day.day}`, monthZhi, dayZhi });
  for (let mask = 0; mask < 4096; mask++) {
    const pan = panOfMask(mask, day);
    const xk = pan.xunKong;
    const an = analyzeNajia(pan, { monthZhi, dayZhi, sex: '男' });
    for (const y of pan.yaoList) {
      const mu = CHANG_SHENG[y.wuXing].mu;
      const bm = mu === monthZhi, bd = mu === dayZhi;
      if (bm || bd) {
        t5.muTrueCount++;
        if (bm && bd) t5.both++; else if (bm) t5.byMonthOnly++; else t5.byDayOnly++;
      }
      if (y.moving && LIU_CHONG[dayZhi] === y.zhi) {
        t8.movingChongByDay++;
        if (t8.samples.length < 3) t8.samples.push({ date: `${day.month}-${day.day}`, dayZhi, pos: y.position, zhi: y.zhi });
      }
      if (y.moving && pan.bianYaoList) {
        const bz = pan.bianYaoList[y.position - 1].zhi;
        if (CHANG_SHENG[y.wuXing].mu === bz) {
          t9.huaMu++;
          if (t9.samples.length < 3) t9.samples.push({ date: `${day.month}-${day.day}`, pos: y.position, zhi: y.zhi, bianZhi: bz, wuXing: y.wuXing });
        }
        // 变爻自身逢旬空 / 被月建冲（化空、化破）——生产 state 未包含这些字段
        if (xk.includes(bz)) { t17.bianXunKong++; if (t17.samples.length < 3) t17.samples.push({ kind: 'bianXunKong', date: `${day.month}-${day.day}`, pos: y.position, bianZhi: bz, xunKong: xk.join('') }); }
        if (LIU_CHONG[monthZhi] === bz) t17.bianYuePo++;
      }
      // —— T11 独立理论面（lingTaiOf 原始旺衰 + 冲支常量，不调用 evalYao 判定）——
      if (!y.moving) {
        t11.total++;
        const raw = lingTaiOf(y.wuXing, ZHI_WX[monthZhi]);
        const s = an.lines[y.position - 1].state; // 引擎实际输出
        const chongYue = LIU_CHONG[monthZhi] === y.zhi;
        const chongRi = LIU_CHONG[dayZhi] === y.zhi;
        if (WANG.has(raw) && chongYue) {
          t11.rawWangPo++;
          if (chongRi) t11.rawWangPoRipressed++;
          if (WANG.has(s.lingTai)) t11.wangpoAllPressed = false;
        }
        if (raw === '休' && chongRi) {
          t11.rawXiuRiChong++;
          if (!s.riPo) t11.xiuAllMarkedRipo = false;
        }
        if ((raw === '死' || raw === '囚') && chongRi) t11.rawDeadQiuRiChong++;
        if (WANG.has(raw) && chongRi && !chongYue) t11.rawWangRiChong++;
        // —— 引擎实际输出 ——
        if (WANG.has(s.lingTai) && s.yuePo) t11.engWangAndPo++;
        if (s.anDong) t11.engAnDong++;
        if (s.riPo) t11.engRiPo++;
        if (s.riChong && !s.anDong && !s.riPo) t11.engRiChongNoTag++;
        if (s.anDong !== (chongRi && (WANG.has(raw)) && !chongYue)) t11.anDongMismatch++;
      }
    }
    // 动墓（动爻本身入月/日墓）——古法三墓之一"入动墓"指用神被发动之爻墓住，程序无实现
    for (const d of an.dong) { if (d.state.ruMu) t9.dongMuYi++; }
  }
}
t5.total = DAYS.length * 4096 * 6;
out.tests.T5_rumu_source = t5;
out.tests.T8_dong_chong_by_day = t8;
out.tests.T9_hua_mu = t9;
out.tests.T11_state_conflict = t11;
out.tests.T17_bian_state = t17;

/* ================= T6 用神取用平票 ================= */
const DOMAIN_MAP = { wealth: '财运', career: '事业', love: '感情', health: '疾病', decision: '合作', life: '其他', people: '行人', lost: '失物' };
const rankOf = (o) => (o.shi ? 8 : 0) + (o.moving ? 4 : 0) + (!o.state.xunKong && !o.state.yuePo ? 2 : 0) + (o.state.yueHe || o.state.riHe ? 1 : 0);
const t6 = { ties: 0, sameQinTies: 0, sameQinChoseLowest: 0, crossQinTies: 0, crossQinChoseLowest: 0, samples: [] };
{
  const day = DAYS[0];
  const pan0 = panOfMask(0, day);
  const monthZhi = pan0.siZhu.monthGanZhi.charAt(1), dayZhi = pan0.siZhu.dayGanZhi.charAt(1);
  for (let mask = 0; mask < 4096; mask++) {
    const pan = panOfMask(mask, day);
    const an = analyzeNajia(pan, { monthZhi, dayZhi, sex: '男' });
    for (const [dId, dKey] of Object.entries(DOMAIN_MAP)) {
      const ys = an.yongshen[dKey];
      if (!ys || ys.useYing) continue;
      const pool = ys.occurrences.filter((o) => !o.hidden);
      if (pool.length <= 1) continue;
      const max = Math.max(...pool.map(rankOf));
      const tied = pool.filter((o) => rankOf(o) === max);
      if (tied.length <= 1) continue;
      t6.ties++;
      const chosen = tied[0].pos;
      const lowest = Math.min(...tied.map((o) => o.pos));
      const highest = Math.max(...tied.map((o) => o.pos));
      const sameQin = new Set(tied.map((o) => o.liuQin)).size === 1;
      if (sameQin) { t6.sameQinTies++; if (chosen === lowest) t6.sameQinChoseLowest++; }
      else { t6.crossQinTies++; if (chosen === lowest) t6.crossQinChoseLowest++; }
      if (t6.samples.length < 5) t6.samples.push({ dId, tiePositions: tied.map((o) => `${o.liuQin}${o.pos}`), chosen, lowest, highest, gua: pan.benGua.name });
    }
  }
}
out.tests.T6_yongshen_tie = t6;

/* ================= T14 六神起法 ================= */
const LIUSHEN = ['青龙', '朱雀', '勾陈', '螣蛇', '白虎', '玄武'];
const LS_START = { 甲: 0, 乙: 0, 丙: 1, 丁: 1, 戊: 2, 己: 3, 庚: 4, 辛: 4, 壬: 5, 癸: 5 };
const t14 = { checkedDays: 0, mismatch: [] };
for (const day of DAYS) {
  const pan = panOfMask(0x0, day);
  const dg = pan.siZhu.dayGanZhi.charAt(0);
  t14.checkedDays++;
  for (let i = 0; i < 6; i++) {
    const exp = LIUSHEN[(LS_START[dg] + i) % 6];
    if (pan.yaoList[i].liuShen !== exp) t14.mismatch.push({ dayGanZhi: pan.siZhu.dayGanZhi, pos: i + 1, exp, act: pan.yaoList[i].liuShen });
  }
}
out.tests.T14_liushen = t14;

/* ================= T15 旬空 ================= */
const t15 = { checked: 0, mismatch: [] };
const idxOf = (gz) => { const g = GAN.indexOf(gz[0]), z = ZHI.indexOf(gz[1]); for (let i = 0; i < 60; i++) if (i % 10 === g && i % 12 === z) return i; return -1; };
for (let d = 0; d < 60; d++) {
  const dt = new Date(Date.UTC(2026, 9, 1 + d, 9, 35));
  const pan = paipan({ yaoValues: [7, 7, 7, 7, 7, 7], year: dt.getUTCFullYear(), month: dt.getUTCMonth() + 1, day: dt.getUTCDate(), hour: 17, minute: 35, gender: '男' });
  const gz = pan.siZhu.dayGanZhi;
  const i = idxOf(gz);
  const exp = [ZHI[(i - (i % 10) + 10) % 12], ZHI[(i - (i % 10) + 11) % 12]];
  t15.checked++;
  if (pan.xunKong[0] !== exp[0] || pan.xunKong[1] !== exp[1]) t15.mismatch.push({ dayGanZhi: gz, exp: exp.join(''), act: pan.xunKong.join('') });
}
out.tests.T15_xunkong = t15;

/* ================= T7 雷火丰 ================= */
const feng = getGuaMeta('震', '离');
out.tests.T7_leihuofeng = {
  name: feng.name, gong: feng.gong, guaXu: feng.guaXu,
  isYouHun: feng.isYouHun, isGuiHun: feng.isGuiHun,
  shiPosition: feng.shiPosition, yingPosition: feng.yingPosition,
  note: '京房八宫：坎宫第七卦（游魂）为地火明夷、第八卦（归魂）为地水师；雷火丰为第六卦（五世）。当前 guaXu=6 且 isGuiHun=true、shi=5，构成"归魂标签 + 五世爻位"并存。',
};

/* ================= T10 旺衰五态 ================= */
const t10 = { checked: 25, mismatch: [] };
for (const yao of WX) for (const ling of WX) {
  let exp;
  if (yao === ling) exp = '旺';
  else if (SHENG[ling] === yao) exp = '相';
  else if (SHENG[yao] === ling) exp = '休';
  else if (KE[ling] === yao) exp = '死';
  else exp = '囚';
  const got = lingTaiOf(yao, ling);
  if (got !== exp) t10.mismatch.push({ yao, ling, exp, got });
}
out.tests.T10_lingtai = t10;

/* ================= T18 日墓/月墓可达性专项（按日支逐日验证） ================= */
const t18 = { byDayZhi: {} };
for (const day of DAYS) {
  const pan = panOfMask(0, day);
  const dayZhi = pan.siZhu.dayGanZhi.charAt(1), monthZhi = pan.siZhu.monthGanZhi.charAt(1);
  const key = `${monthZhi}月${dayZhi}日`;
  if (!t18.byDayZhi[key]) {
    const reachable = WX.filter((w) => CHANG_SHENG[w].mu === dayZhi);
    t18.byDayZhi[key] = { dayIsMuOf: reachable, dayIsMu: reachable.length > 0 };
  }
}
out.tests.T18_mu_reachability = t18;

/* ================= 输出 ================= */
const outPath = resolve(__dirname, '../output/verify-facts.json');
writeFileSync(outPath, JSON.stringify(out, null, 2));

const line = (k, v) => console.log(`${k}: ${v}`);
console.log('=== 关键项识别层·独立核对 ===');
line('T1  BAGUA_BITS 八纯卦阴阳不符', `${t1.mismatch.length} 项`);
for (const m of t1.mismatch) console.log('     ', JSON.stringify(m));
line('T1b castByTime 自洽失败', `${t1b.mismatchCount}/400`);
line('T2  六冲卦 独立/constants/verdict', `${indepChong.length} / ${constChong.length} / ${VERDICT_LIU_CHONG.length}`);
console.log('      verdict 缺:', out.tests.T2_liuchong_gua.indepVsVerdict.onlyInA.join('、') || '无', '| 多:', out.tests.T2_liuchong_gua.indepVsVerdict.onlyInB.join('、') || '无');
line('T3  六合卦 独立/constants/verdict', `${indepHe.length} / ${constHe.length} / ${VERDICT_LIU_HE.length}`);
console.log('      独立:', indepHe.join('、'));
console.log('      verdict 缺:', out.tests.T3_liuhe_gua.indepVsVerdict.onlyInA.join('、') || '无', '| 多:', out.tests.T3_liuhe_gua.indepVsVerdict.onlyInB.join('、') || '无');
line('T16 世应位置不符', `${t16.mismatch.length}/64`);
for (const m of t16.mismatch) console.log('     ', JSON.stringify(m));
line('T4  土墓库(引擎)', CHANG_SHENG['土'].mu);
line('T5  ruMu 命中爻', `${t5.muTrueCount}  仅月墓 ${t5.byMonthOnly} / 仅日墓 ${t5.byDayOnly} / 两者皆 ${t5.both}`);
console.log('      日支覆盖:', t5.days.map((d) => `${d.month}/${d.day}${d.monthZhi}月${d.dayZhi}日`).join(' '));
line('T6  用神平票', `${t6.ties}（同六亲 ${t6.sameQinTies} 取最低 ${t6.sameQinChoseLowest}；跨六亲 ${t6.crossQinTies} 取最低 ${t6.crossQinChoseLowest}）`);
line('T7  雷火丰', `guaXu=${feng.guaXu} isGuiHun=${feng.isGuiHun} 世=${feng.shiPosition} 应=${feng.yingPosition}`);
line('T8  动爻被日冲(古法"散")', `${t8.movingChongByDay} 爻次，无标记`);
line('T9  动而化墓', `${t9.huaMu} 爻次，无标记；动爻自身入墓 ${t9.dongMuYi}`);
line('T10 lingTaiOf 不符', `${t10.mismatch.length}/25`);
line('T11 独立理论面（lingTaiOf+冲支，不依赖 evalYao）',
  `静爻 ${t11.total}；旺/相+月破 ${t11.rawWangPo}（其中又被日冲 ${t11.rawWangPoRipressed}）；休态日冲 ${t11.rawXiuRiChong}；死/囚日冲 ${t11.rawDeadQiuRiChong}；旺相日冲(暗动面) ${t11.rawWangRiChong}`);
line('T11b 引擎输出 vs 理论期望',
  `旺+破 ${t11.engWangAndPo}(应0,破即失气${t11.wangpoAllPressed ? '逐例✓' : '✗有漏'})；暗动 ${t11.engAnDong}(应${t11.rawWangRiChong},不符${t11.anDongMismatch})；日破 ${t11.engRiPo}(应${t11.rawDeadQiuRiChong + t11.rawXiuRiChong + t11.rawWangPoRipressed})；日冲无归属 ${t11.engRiChongNoTag}(应0)；休态全归日破 ${t11.xiuAllMarkedRipo ? '✓' : '✗'}`);
line('T14 六神起法不符', `${t14.mismatch.length}`);
line('T15 旬空不符', `${t15.mismatch.length}/${t15.checked}`);
line('T17 变爻自身旬空/月破', `化空 ${t17.bianXunKong} 爻次、化破 ${t17.bianYuePo} 爻次，state 无对应字段`);
console.log(`\n结果已写入 ${outPath}`);
