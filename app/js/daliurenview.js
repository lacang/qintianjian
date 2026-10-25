// 大六壬 · 完整起课：月将加时 → 天地盘 → 四课 → 九宗门取三传 → 十二天将 → 旬空遁干神煞 → 课体与方向。
// 底本：《大六壬指南》（明·陈公献）课体与发用取法、《六壬大全》（明）天地盘·天将·神煞布法。
// 红线：只用课法本身推导，不掺现代心理话术；流派分歧处并列标注，不合成。
import { nowDate, BIRTH } from './state.js?v=120';
import { gateHTML, stage, foldVerdict, isCasted } from './ritual.js?v=120';
import { shouyeTianxiang, getDayCalendar, solarToSiZhu } from '../vendor/liuyao-core.js?v=120';
import { T } from './tipview.js?v=120';

const ZHI = ['子', '丑', '寅', '卯', '辰', '巳', '午', '未', '申', '酉', '戌', '亥'];
const GAN = ['甲', '乙', '丙', '丁', '戊', '己', '庚', '辛', '壬', '癸'];
const ZHI_WX = ['水', '土', '木', '木', '土', '火', '火', '土', '金', '金', '土', '水'];
const GAN_WX = { 甲: '木', 乙: '木', 丙: '火', 丁: '火', 戊: '土', 己: '土', 庚: '金', 辛: '金', 壬: '水', 癸: '水' };
// 十干寄宫（《六壬大全》）：甲寅乙辰丙戊巳，丁己未，庚申辛戌壬亥癸丑
const JIGONG = { 甲: 2, 乙: 4, 丙: 5, 丁: 7, 戊: 5, 己: 7, 庚: 8, 辛: 10, 壬: 11, 癸: 1 };
// 贵人起法：甲戊庚牛羊，乙己鼠猴乡，丙丁猪鸡位，壬癸蛇兔藏，六辛逢马虎（[昼贵,夜贵]）
const GUIREN = { 甲: [1, 7], 戊: [1, 7], 庚: [1, 7], 乙: [0, 8], 己: [0, 8], 丙: [11, 9], 丁: [11, 9], 壬: [5, 3], 癸: [5, 3], 辛: [6, 2] };
const JIANG = ['贵人', '螣蛇', '朱雀', '六合', '勾陈', '青龙', '天空', '白虎', '太常', '玄武', '太阴', '天后'];
const SHENG = { 木: '火', 火: '土', 土: '金', 金: '水', 水: '木' };
const KE = { 木: '土', 土: '水', 水: '火', 火: '金', 金: '木' };
// 十二支相刑：子卯互刑，寅巳申恃势，丑戌未无恩，辰午酉亥自刑
const XING = { 0: 3, 3: 0, 2: 5, 5: 8, 8: 2, 1: 10, 10: 7, 7: 1, 4: 4, 6: 6, 9: 9, 11: 11 };
const MENG = [2, 8, 5, 11], ZHONG = [0, 6, 3, 9], JI = [4, 10, 1, 7];
// 三合局：申子辰 / 寅午戌 / 巳酉丑 / 亥卯未
const SANHE = [[8, 0, 4], [2, 6, 10], [5, 9, 1], [11, 3, 7]];
// 神煞（以日支三合局起，见《六壬大全·神煞》）
const SS_MA = [2, 8, 11, 5];      // 驿马：申子辰马居寅、寅午戌马居申、巳酉丑马居亥、亥卯未马居巳
const SS_TAO = [9, 3, 6, 0];      // 桃花（咸池）
const SS_HUA = [4, 10, 1, 7];     // 华盖
const SS_JIE = [5, 11, 2, 8];     // 劫煞
// 十干日禄：甲禄寅、乙禄卯、丙戊禄巳、丁己禄午、庚禄申、辛禄酉、壬禄亥、癸禄子
const LU = { 甲: 2, 乙: 3, 丙: 5, 丁: 6, 戊: 5, 己: 6, 庚: 8, 辛: 9, 壬: 11, 癸: 0 };

const isKe = (a, b) => KE[ZHI_WX[a]] === ZHI_WX[b]; // a 克 b
const zhiIdx = (gz) => ZHI.indexOf(gz[1]);

function shichenIdx(h) { return Math.floor(((h + 1) % 24) / 2); }

// 月将：太阳所在星次（十二次），每 30° 一换，随中气过宫
function yueJiangOf(sunLon) {
  const l = ((sunLon % 360) + 360) % 360;
  return (((1 - Math.floor(((l - 270 + 360) % 360) / 30)) % 12) + 12) % 12;
}

function sanHeIdx(z) { return SANHE.findIndex((g) => g.includes(z)); }
function yiMa(z) { const i = sanHeIdx(z); return i < 0 ? 2 : SS_MA[i]; }

function sanHeNext(z) {
  const g = SANHE[sanHeIdx(z)];
  return g ? g[(g.indexOf(z) + 1) % 3] : z;
}

function liuqin(gan, z) {
  const me = GAN_WX[gan], o = ZHI_WX[z];
  if (o === me) return '兄弟';
  if (SHENG[o] === me) return '父母';
  if (SHENG[me] === o) return '子孙';
  if (KE[me] === o) return '妻财';
  if (KE[o] === me) return '官鬼';
  return '—';
}

// 旬空与旬遁：日干支定旬，旬首甲X起，余二支为空亡
function xunKong(gan, dz) {
  const xunShou = (((dz - GAN.indexOf(gan)) % 12) + 12) % 12;
  return {
    xunName: '甲' + ZHI[xunShou],
    xunShou,
    kong: [(xunShou + 10) % 12, (xunShou + 11) % 12],
  };
}

// 涉害深浅：自所落地盘之位顺数至本家，途中天盘支克地盘支者计数
function sheHai(s, tian) {
  const k0 = tian.indexOf(s);
  if (k0 < 0) return 0;
  let cnt = 0;
  for (let step = 0; step <= 12; step++) {
    const k = (k0 + step) % 12;
    if (isKe(tian[k], k)) cnt++;
    if (k === s) break;
  }
  return cnt;
}

const MENG_RANK = (z) => (MENG.includes(z) ? 2 : ZHONG.includes(z) ? 1 : 0);

function pickByYang(list, yangDay) {
  const same = list.filter((z) => (z % 2 === 0) === yangDay);
  return same.length ? same : list;
}

// 发用取法（九宗门，本诸《大六壬指南·课经》）
const FA_YONG = {
  元首: '一上克下，取上克下之神为初传',
  重审: '一下贼上，取下贼上之神为初传',
  比用: '两课俱克，取与日干阴阳相比者为初传',
  涉害: '俱克且相比者多，取涉害最深者为初传',
  蒿矢: '四课无克，取克日干之遥神为初传',
  弹射: '四课无克，取日干所克之遥神为初传',
  昴星: '无克无遥，阳日取酉上神、阴日取酉下神为初传',
  别责: '四课不全且无克，借合干或三合前位为初传',
  八专: '干支同位，就本位顺逆数取初传',
  伏吟: '天地盘重合，取干阳或支阳为初传，中末以刑推',
  返吟: '天地盘相冲，取贼克之神或马星为初传',
};

// ---------------- 起课核心 ----------------
export function qiKe(at = nowDate()) {
  const y = at.getFullYear(), mo = at.getMonth() + 1, d = at.getDate(), h = at.getHours(), mi = at.getMinutes();
  const sz = solarToSiZhu({ year: y, month: mo, day: d, hour: h, minute: mi });
  const cal = getDayCalendar({ year: y, month: mo, day: d, hour: h, minute: mi });
  const gan = sz.dayGanZhi[0], dz = zhiIdx(sz.dayGanZhi);
  const t = shichenIdx(h);

  let sunLon = 0, sunSign = '';
  try {
    const tx = shouyeTianxiang(at);
    const sun = tx.bodies.find((b) => b.id === 'sun');
    if (sun) { sunLon = sun.lon; sunSign = sun.signName; }
  } catch (e) { /* 天文不可用时退回近似：按节气月 */ }
  const yj = yueJiangOf(sunLon);

  // 天地盘：月将加时（月将压占时之支，余支顺布）
  const tian = [];
  for (let k = 0; k < 12; k++) tian[k] = (((yj + k - t) % 12) + 12) % 12;

  const g = JIGONG[gan];
  const u1 = tian[g], u2 = tian[u1], u3 = tian[dz], u4 = tian[u3];
  const ke4 = [
    { down: g, up: u1, label: '一课' },
    { down: u1, up: u2, label: '二课' },
    { down: dz, up: u3, label: '三课' },
    { down: u3, up: u4, label: '四课' },
  ];
  ke4.forEach((c) => {
    if (isKe(c.down, c.up)) c.rel = '下贼上';
    else if (isKe(c.up, c.down)) c.rel = '上克下';
    else c.rel = '比和';
  });

  const yangDay = GAN.indexOf(gan) % 2 === 0;
  const zei = [], ke = [];
  ke4.forEach((c, i) => {
    if (isKe(c.down, c.up)) zei.push(i);       // 下贼上
    else if (isKe(c.up, c.down)) ke.push(i);   // 上克下
  });

  let ti = '', first = 0, mid = null, last = null, note = '', faKe = -1;
  const chuanOf = (f) => [f, tian[f], tian[tian[f]]];

  if (yj === t) {
    // 伏吟：天地盘同位，事主停滞
    ti = '伏吟';
    const hasKe = zei.length || ke.length;
    if (hasKe) { first = u1; faKe = 0; }
    else { first = yangDay ? u1 : u3; faKe = yangDay ? 0 : 2; }
    mid = XING[first]; last = XING[mid];
    note = '天地盘重合，动而不动。';
  } else if (((yj - t + 12) % 12) === 6) {
    // 返吟：天地盘相冲，事主反覆
    ti = '返吟';
    if (zei.length || ke.length) {
      const pool = zei.length ? zei : ke;
      const ups = pickByYang(pool.map((i) => ke4[i].up), yangDay);
      first = ups[0];
      faKe = ke4.findIndex((c) => c.up === first);
    } else {
      first = yiMa(dz);
    }
    mid = u3; last = u1;
    note = '天地盘相冲，事多反覆。';
  } else if (g === dz) {
    // 八专：干支同位
    ti = '八专';
    if (zei.length || ke.length) {
      const pool = zei.length ? zei : ke;
      first = pickByYang(pool.map((i) => ke4[i].up), yangDay)[0];
      faKe = ke4.findIndex((c) => c.up === first);
      [first, mid, last] = chuanOf(first);
    } else {
      first = yangDay ? (u1 + 2) % 12 : (((u4 - 2) % 12) + 12) % 12;
      mid = u1; last = u1;
    }
    note = '干支同位，事有重叠。';
  } else if ((u1 === dz || u3 === g) && !zei.length && !ke.length) {
    // 别责：四课不全且无贼克
    ti = '别责';
    if (yangDay) {
      const heGan = { 甲: '己', 己: '甲', 乙: '庚', 庚: '乙', 丙: '辛', 辛: '丙', 丁: '壬', 壬: '丁', 戊: '癸', 癸: '戊' }[gan];
      first = tian[JIGONG[heGan]];
    } else {
      first = sanHeNext(dz);
    }
    mid = u1; last = u1;
    note = '四课只有三课（不备），须借他人之力。阴日取支三合前一位——别责阴日取用流派分歧（一说取支之六合），此处从《六壬大全》三合说。';
  } else if (zei.length === 1) {
    ti = '重审'; first = ke4[zei[0]].up; faKe = zei[0];
    [first, mid, last] = chuanOf(first);
  } else if (ke.length === 1 && !zei.length) {
    ti = '元首'; first = ke4[ke[0]].up; faKe = ke[0];
    [first, mid, last] = chuanOf(first);
  } else if (zei.length > 1 || ke.length > 1) {
    const pool = zei.length ? zei : ke;
    const ups = pickByYang(pool.map((i) => ke4[i].up), yangDay);
    if (ups.length === 1) { ti = '比用'; first = ups[0]; }
    else {
      ti = '涉害';
      let best = ups[0], bc = -1, br = -1;
      for (const z of ups) {
        const c = sheHai(z, tian), r = MENG_RANK(z);
        if (c > bc || (c === bc && r > br)) { best = z; bc = c; br = r; }
      }
      first = best;
    }
    faKe = ke4.findIndex((c) => c.up === first);
    [first, mid, last] = chuanOf(first);
  } else {
    // 无贼克：遥克 → 昴星
    const meWx = GAN_WX[gan];
    const ups = ke4.map((c) => c.up);
    const keMe = ups.filter((z) => KE[ZHI_WX[z]] === meWx);
    const meKe = ups.filter((z) => KE[meWx] === ZHI_WX[z]);
    if (keMe.length) { ti = '蒿矢'; first = pickByYang(keMe, yangDay)[0]; }
    else if (meKe.length) { ti = '弹射'; first = pickByYang(meKe, yangDay)[0]; }
    else {
      ti = '昴星';
      const YOU = 9;
      if (yangDay) { first = tian[YOU]; mid = u3; last = u1; }
      else { first = tian.indexOf(YOU); mid = u1; last = u3; }
    }
    faKe = ke4.findIndex((c) => c.up === first);
    if (mid === null) [first, mid, last] = chuanOf(first);
  }

  const chuan = [
    { pos: '初传', z: first },
    { pos: '中传', z: mid },
    { pos: '末传', z: last },
  ];

  // 十二天将：昼贵/夜贵定贵人，贵人临地盘亥子丑寅卯辰顺布，余者逆布
  const isDay = [3, 4, 5, 6, 7, 8].includes(t);
  const grZhi = GUIREN[gan][isDay ? 0 : 1];
  const grPos = tian.indexOf(grZhi);
  const fwd = [11, 0, 1, 2, 3, 4].includes(grPos);
  const jiang = new Array(12).fill('');
  for (let i = 0; i < 12; i++) {
    const pos = fwd ? (grPos + i) % 12 : (((grPos - i) % 12) + 12) % 12;
    jiang[pos] = JIANG[i];
  }
  const jiangOfZhi = (z) => { const k = tian.indexOf(z); return k < 0 ? '' : jiang[k]; };

  // 旬空、遁干
  const xk = xunKong(gan, dz);
  const dunGan = (z) => {
    const d0 = (((z - xk.xunShou) % 12) + 12) % 12;
    return d0 <= 9 ? GAN[d0] : '';
  };

  // 神煞（以日支起）
  const hi = sanHeIdx(dz);
  const ss = {
    旬空: xk.kong,
    驿马: SS_MA[hi],
    桃花: SS_TAO[hi],
    华盖: SS_HUA[hi],
    劫煞: SS_JIE[hi],
    日禄: LU[gan],
  };

  // 年命（生年地支）
  let nianMing = null;
  try {
    if (BIRTH && BIRTH.year) nianMing = (((BIRTH.year - 4) % 12) + 12) % 12;
  } catch (e) { nianMing = null; }

  // 三传各传的落宫、天将、六亲、遁干、空亡、神煞标记
  const chuanInfo = chuan.map((c, i) => {
    const gong = tian.indexOf(c.z);          // 天盘支所压地盘宫
    return {
      ...c,
      phase: ['起因', '过程', '结局'][i],
      gong,
      jiang: jiangOfZhi(c.z),
      qin: liuqin(gan, c.z),
      dun: dunGan(c.z),
      kong: xk.kong.includes(c.z),
      ss: Object.keys(ss).filter((k) => k !== '旬空' && (Array.isArray(ss[k]) ? ss[k].includes(c.z) : ss[k] === c.z)),
    };
  });

  return {
    at, sz, cal, gan, dz, t, tian, g, ke4, chuan: chuanInfo, ti, note, faYong: FA_YONG[ti] || '', faKe,
    yj, sunLon, sunSign, isDay, grZhi, grPos, fwd, jiang, jiangOfZhi,
    xun: xk, dunGan, ss, nianMing,
    liuqin: (z) => liuqin(gan, z),
    yangDay,
  };
}

// ---------------- 课体断语（本诸《大六壬指南·课体》） ----------------
const TI_DUAN = {
  元首: { jue: '一上克下', duan: '事起于外，主尊长、上级得势。诸事顺遂，宜先发制人、主动出手；求谋多成，但须防我强彼弱、过刚生怨。', src: '《大六壬指南·元首课》' },
  重审: { jue: '一下贼上', duan: '事起于内，主卑幼谋上、下属有异。宜后动、宜审慎，先察其由再决进退；急则生变。', src: '《大六壬指南·重审课》' },
  比用: { jue: '择比而用', duan: '同类相扶，事有同伴可依。宜择人合作、择善而从；独断则力薄。', src: '《大六壬指南·比用课》' },
  涉害: { jue: '涉害取用', duan: '涉害深者发用，主事多艰险、途有阻滞。宜退守缓图、先避其锋；硬进则伤。', src: '《大六壬指南·涉害课》' },
  蒿矢: { jue: '神克日', duan: '外来之侵，主外人暗算、上有压制。宜防口舌与暗损，凡事宜低调、留退路。', src: '《大六壬指南·蒿矢课》' },
  弹射: { jue: '日克神', duan: '我攻彼之势，主我可主动、可进取。宜果断出手、抢先机；但用力过猛则耗己。', src: '《大六壬指南·弹射课》' },
  昴星: { jue: '无克无遥', duan: '事不明朗、两不相干。宜静守待时、先观后动；强求无应，缓则有信。', src: '《大六壬指南·昴星课》' },
  别责: { jue: '四课不全', duan: '事有欠缺、力不能独任。宜求助他人、借力成事；自专则不成。', src: '《大六壬指南·别责课》' },
  八专: { jue: '干支同位', duan: '事有重叠、两事相缠。宜专一守正、先理其绪；三心二意则两失。', src: '《大六壬指南·八专课》' },
  伏吟: { jue: '天地重合', duan: '动而不动，事主停滞、去而复返。宜守不宜行，凡事缓议；急则空走一趟。', src: '《大六壬指南·伏吟课》' },
  返吟: { jue: '天地相冲', duan: '事多反覆、去者复来。宜随机应变、勿执一途；定约则易变，宜留弹性。', src: '《大六壬指南·返吟课》' },
};
// 课体基调：据《大六壬指南》各课断语所主顺逆定调（+顺 −阻 0平）
const TI_TONE = { 元首: 2, 重审: 0, 比用: 1, 涉害: -2, 蒿矢: -1, 弹射: 1, 昴星: 0, 别责: -1, 八专: 0, 伏吟: -2, 返吟: -1 };

// ---------------- 呈现 ----------------
// 十二天将主事（《大六壬指南·天将》通行义）
const JIANG_MEAN = {
  贵人: '尊长、贵助、文书喜庆', 螣蛇: '虚惊、缠绕、怪异不安',
  朱雀: '口舌、文书、消息是非', 六合: '和合、中介、婚姻交易',
  勾陈: '田土、勾连、迟滞争讼', 青龙: '财喜、庆贺、酒色官禄',
  天空: '虚诈、落空、徒劳无功', 白虎: '道路、疾病、凶丧刚猛',
  太常: '衣食、宴会、印信平稳', 玄武: '盗贼、暗昧、私情欺瞒',
  太阴: '阴私、女性、暗中相助', 天后: '妇女、恩泽、婚姻暗昧',
};
// 六亲主事（以日干为我）
const LIUQIN_MEAN = {
  父母: '长辈、文书、房宅，主庇护依托', 兄弟: '同辈、伙伴、竞争，主分夺耗散',
  子孙: '福神、解忧、喜庆，主宽解顺遂', 妻财: '财物、妻室、交易，主实利可得',
  官鬼: '官职、忧患、疾病，主约束牵制',
};
const KE_TAG = { 一课: '我·外显', 二课: '我·隐微', 三课: '彼·外显', 四课: '彼·隐微' };
const GOOD_J = ['贵人', '青龙', '六合', '太常', '天后', '太阴'];
const BAD_J = ['螣蛇', '朱雀', '勾陈', '天空', '白虎', '玄武'];
const GOOD_Q = ['子孙', '妻财', '父母'];
// 方盘方位：地盘十二支固定（子下北上、卯左酉右）
const GRID_POS = { 5: [1, 1], 6: [1, 2], 7: [1, 3], 8: [1, 4], 4: [2, 1], 9: [2, 4], 3: [3, 1], 10: [3, 4], 2: [4, 1], 1: [4, 2], 0: [4, 3], 11: [4, 4] };
// 神煞一句话（见《六壬大全·神煞》）
const SS_MEAN = {
  旬空: '本旬所空的两支，凡落空之神主虚、主迟、主不成。',
  驿马: '主奔走、迁移、出行、变动，入传则事必有动。',
  桃花: '主情爱、交往、酒色，入传则事涉人情。',
  华盖: '主孤高、宗教、艺术、独处，入传则事多独任。',
  劫煞: '主劫夺、损耗、意外，入传宜防。',
  日禄: '主俸禄、正财、衣食之实，入传主实利可得。',
};

function panGrid(r) {
  const mark = {};
  r.chuan.forEach((c) => { mark[c.z] = c.pos[0]; });
  let cells = '';
  for (let k = 0; k < 12; k++) {
    const pos = GRID_POS[k];
    const tp = r.tian[k];
    const cls = [k === r.dz ? 'dz' : '', k === r.g ? 'jg' : '', r.xun.kong.includes(tp) ? 'kong' : ''].filter(Boolean).join(' ');
    cells += `<div class="dl-cell ${cls}" style="grid-area:${pos[0]}/${pos[1]}" data-tip="dl-${k}">
      <span class="dlc-j">${T(r.jiang[k], 'dl-j-' + r.jiang[k])}</span>
      <span class="dlc-t">${T(ZHI[tp], 'dl-' + k)}</span>
      <span class="dlc-d">${ZHI[k]}</span>
      ${mark[tp] ? `<b class="dlc-c">${mark[tp]}</b>` : ''}
    </div>`;
  }
  const td = TI_DUAN[r.ti] || {};
  return `<div class="dl-grid">
    ${cells}
    <div class="dl-core" style="grid-area:2/2/4/4">
      <span class="dlc-ti">${T(r.ti + '课', 'dl-ti-' + r.ti)}</span>
      <span class="dlc-jue">${td.jue || ''}</span>
      <span class="dlc-yj">月将${ZHI[r.yj]}加${ZHI[r.t]}时</span>
      <span class="dlc-day">${r.sz.dayGanZhi}日 · ${r.isDay ? '昼占' : '夜占'}</span>
    </div>
  </div>`;
}

// 三传读法：逐传取六亲与天将之义，再按吉凶神数量与课体倾向合参
function readPan(r) {
  const items = r.chuan.map((c) => ({
    pos: c.pos, z: ZHI[c.z], zi: c.z, j: c.jiang, q: c.qin, phase: c.phase,
    dun: c.dun, kong: c.kong, gong: c.gong,
  }));
  let good = 0, bad = 0;
  items.forEach((it) => {
    if (GOOD_J.includes(it.j)) good++;
    if (BAD_J.includes(it.j)) bad++;
    if (GOOD_Q.includes(it.q)) good++;
    if (it.q === '官鬼' || it.q === '兄弟') bad++;
  });
  return { items, good, bad };
}

// 总方向：课体基调 + 三传吉凶 + 空亡 + 神煞入传 合参
function verdict(r) {
  const { items, good, bad } = readPan(r);
  const td = TI_DUAN[r.ti] || {};
  const pros = [], cons = [];
  let score = TI_TONE[r.ti] || 0;

  if (TI_TONE[r.ti] > 0) pros.push(`课体「${r.ti}」本主${td.jue}，大势偏顺`);
  else if (TI_TONE[r.ti] < 0) cons.push(`课体「${r.ti}」本主${td.jue}，大势偏阻`);
  else pros.push(`课体「${r.ti}」吉凶两平，成败在人`);

  score += (good - bad) * 0.6;
  if (good > bad) pros.push(`三传吉神 ${good} 位多于凶神 ${bad} 位`);
  else if (bad > good) cons.push(`三传凶神 ${bad} 位多于吉神 ${good} 位`);

  const kongPos = items.filter((it) => it.kong).map((it) => it.pos);
  if (kongPos.length) {
    score -= kongPos.length * 0.7;
    cons.push(`${kongPos.join('、')}落${T('旬空', 'dl-ss-旬空')}，${kongPos.includes('末传') ? '结局易落空，务必落到实处' : '中途有虚耗空转'}`);
  }

  const zs = items.map((it) => it.z);
  const hit = (arr) => arr.filter((x) => zs.includes(ZHI[x])).length > 0;
  if (hit([r.ss.驿马])) pros.push(`驿马（${ZHI[r.ss.驿马]}）入传，事必有走动、变动`);
  if (hit([r.ss.桃花])) pros.push(`桃花（${ZHI[r.ss.桃花]}）入传，事涉人情、交往、婚姻`);
  if (hit([r.ss.劫煞])) { cons.push(`劫煞（${ZHI[r.ss.劫煞]}）入传，防意外损耗、口舌是非`); score -= 0.5; }
  if (hit([r.ss.日禄])) pros.push(`日禄（${ZHI[r.ss.日禄]}）入传，主正财俸禄、实利可图`);
  if (r.nianMing !== null && zs.includes(r.nianMing)) pros.push(`本命（${ZHI[r.nianMing]}）入传，此事与自身关系直接`);

  const vv = items.map((it) => (GOOD_J.includes(it.j) ? 1 : 0) + (BAD_J.includes(it.j) ? -1 : 0) + (it.kong ? -1 : 0));
  let rhythm;
  if (vv[2] > vv[0]) rhythm = '初传偏阻、末传转好——先难后易，熬过开头就有转机。';
  else if (vv[2] < vv[0]) rhythm = '初传顺、末传转阻——先易后难，宜在顺时收手，别拖到后面。';
  else rhythm = '三传起伏不大——节奏平稳，按部就班走即可。';

  const level = score >= 2 ? { k: '可进', d: '大势偏顺，可以主动推进。', cls: 'good' }
    : score >= 0.5 ? { k: '可缓进', d: '大方向不差，但宜稳着来、别抢快。', cls: 'mild' }
      : score >= -0.5 ? { k: '宜守', d: '吉凶两平，守住现状、别做大变动。', cls: 'flat' }
        : score >= -2 ? { k: '宜退', d: '阻力明显，宜退一步、缓一缓再说。', cls: 'warn' }
          : { k: '宜止', d: '阻力很重，这件事现在不宜强推。', cls: 'bad' };

  return { level, pros, cons, rhythm, score };
}

export function renderDaLiuRen(at = nowDate()) {
  if (!isCasted('daliuren')) return gateHTML('daliuren');
  const r = qiKe(at);
  const td = TI_DUAN[r.ti] || { jue: '', duan: '', src: '' };
  const { items, good, bad } = readPan(r);
  const vd = verdict(r);

  const keHtml = r.ke4.slice().reverse().map((c) => `
    <div class="dl-ke${r.faKe === r.ke4.indexOf(c) ? ' fa' : ''}" data-tip="dl-ke-${c.label}">
      <span class="dl-ke-lab">${c.label}${r.faKe === r.ke4.indexOf(c) ? ' · 发用' : ''}</span>
      <span class="dl-ke-up">${T(ZHI[c.up], 'dl-' + c.up)}</span>
      <span class="dl-ke-line"></span>
      <span class="dl-ke-down">${ZHI[c.down]}</span>
      <span class="dl-ke-tag">${KE_TAG[c.label]}</span>
      <span class="dl-ke-rel">${c.rel}</span>
    </div>`).join('');

  const chuanHtml = r.chuan.map((c) => `
    <div class="dl-ch" data-tip="dl-ch-${c.pos}">
      <span class="dl-ch-pos">${c.pos}</span>
      <span class="dl-ch-z">${T(ZHI[c.z], 'dl-' + c.z)}</span>
      <span class="dl-ch-j">${T(c.jiang, 'dl-j-' + c.jiang)}</span>
      <span class="dl-ch-q">${T(c.qin, 'dl-q-' + c.qin)}</span>
      <span class="dl-ch-note">${c.phase}</span>
      <span class="dl-ch-dun">${c.dun ? '遁' + c.dun : '空亡'}</span>
    </div>`).join('');

  const readHtml = items.map((it) => `
    <div class="dlr">
      <span class="dlr-ph">${it.phase[0]}</span>
      <div class="dlr-body">
        <b>${it.pos}「${T(it.z, 'dl-' + it.zi)}」· ${T(it.q, 'dl-q-' + it.q)} · ${T(it.j, 'dl-j-' + it.j)}${it.kong ? ' · <i class="dl-kong">落空</i>' : ''}</b>
        <p>${LIUQIN_MEAN[it.q] || ''}；${JIANG_MEAN[it.j] || ''}。</p>
        <p class="dim">此字压地盘${ZHI[it.gong]}宫${it.dun ? '，遁干为' + it.dun : '，本旬空亡无遁干'}。</p>
      </div>
    </div>`).join('');

  const ssHtml = ['旬空', '驿马', '桃花', '华盖', '劫煞', '日禄'].map((k) => {
    const v = r.ss[k];
    const txt = Array.isArray(v) ? v.map((z) => ZHI[z]).join(' ') : ZHI[v];
    const inChuan = Array.isArray(v) ? v.some((z) => r.chuan.some((c) => c.z === z)) : r.chuan.some((c) => c.z === v);
    return `<div class="dlss-row${inChuan ? ' hit' : ''}" data-tip="dl-ss-${k}">
      <span class="dlss-n">${k}</span>
      <span class="dlss-v">${txt}</span>
      <span class="dlss-i">${SS_MEAN[k]}${inChuan ? '<b>（已入三传）</b>' : ''}</span>
    </div>`;
  }).join('');

  const jiangLine = r.jiang.map((j, i) => `<span class="dlj" data-tip="dl-j-${j}"><i>${ZHI[i]}</i>${j}</span>`).join('');

  const vdBlock = `
    <div class="dl-verdict glass-card v-${vd.level.cls}">
      <div class="dv-top">
        <span class="dv-k">这一课的方向</span>
        <span class="dv-level">${vd.level.k}</span>
      </div>
      <p class="dv-main">${vd.level.d}</p>
      ${vd.pros.length ? `<div class="dv-list pro">${vd.pros.map((x) => `<p>${x}</p>`).join('')}</div>` : ''}
      ${vd.cons.length ? `<div class="dv-list con">${vd.cons.map((x) => `<p>${x}</p>`).join('')}</div>` : ''}
      <p class="dv-rhythm"><b>节奏</b>${vd.rhythm}</p>
      <p class="dv-src">此方向由课体基调（《大六壬指南》各课断语）、三传六亲天将吉凶数、旬空与神煞入传四项合参得出，只作倾向。</p>
    </div>`;

  const html = `
  <div class="dl-wrap">

    <div class="dl-head glass-card">
      <div class="dl-head-top">
        <span class="dl-tag">大六壬 · 起课</span>
        <span class="dl-time">${fmt(at)}</span>
      </div>
      <div class="dl-meta">
        <span>月将 <b>${T(ZHI[r.yj], 'dl-yuejiang')}</b>（太阳在${r.sunSign || '—'}）</span>
        <span class="dot">·</span>
        <span>占时 <b>${T(ZHI[r.t] + '时', 'dl-zhanshi')}</b></span>
        <span class="dot">·</span>
        <span>${T(r.isDay ? '昼占' : '夜占', 'dl-guiren')}（用${r.isDay ? '昼' : '夜'}贵）</span>
      </div>
      <div class="dl-meta dim">
        <span>四柱 ${r.sz.yearGanZhi} ${r.sz.monthGanZhi} ${r.sz.dayGanZhi} ${r.sz.timeGanZhi} · ${r.cal.nongli}</span>
      </div>
      <div class="dl-meta dim">
        <span>${T('旬', 'dl-xun')} ${r.xun.xunName} · ${T('旬空', 'dl-ss-旬空')} ${r.xun.kong.map((z) => ZHI[z]).join(' ')}${r.nianMing !== null ? ' · 本命 ' + ZHI[r.nianMing] : ''}</span>
      </div>
    </div>

    <div class="dl-pan-card glass-card">
      ${panGrid(r)}
      <div class="dl-pan-hint">每格三行：上为${T('天将', 'dl-jiang')}、中为${T('天盘', 'dl-tianpan')}支、下为${T('地盘', 'dl-dipan')}支。<br>红框＝日支宫，绿框＝日干寄宫，灰字＝本旬空亡，角标初/中/末＝三传落宫。<b>点格内任一字都有详解。</b></div>
    </div>

    <div class="dl-sec">四课</div>
    <div class="dl-ke-row glass-card">${keHtml}</div>
    <div class="dl-ke-note">四课由「日干寄宫」与「日支」各起一课、再各带一课而来。<b>上为天盘所加之神，下为地盘本位</b>。一课主我自己外显的一面，二课主我隐微的一面，三课主对方（所占之事）外显的一面，四课主对方隐微的一面。看上下神之间的生克（下贼上 / 上克下 / 比和），就是取三传的依据。标「发用」的那一课，就是初传的出处。</div>

    <div class="dl-sec">三传</div>
    <div class="dl-ch-row glass-card">${chuanHtml}</div>
    <div class="dl-ke-note">三传是这一课最终取用的三个字。<b>初传＝起因与发端，中传＝过程中的转折，末传＝最终归宿</b>。每传带四样东西：<b>六亲</b>（对日干的关系）、<b>天将</b>（上乘哪一位神）、<b>遁干</b>（本旬所配天干，落空则无）、<b>落宫</b>（压在地盘哪一宫）。本课发用取法：${r.faYong}。</div>

    <div class="dl-sec">这一课说了什么</div>
    <div class="dl-read glass-card">
      ${readHtml}
      <div class="dlr dlr-sum">
        <span class="dlr-ph">合</span>
        <div class="dlr-body">
          <b>课体「${r.ti}课」——${td.jue}</b>
          <p>${td.duan}</p>
          <p class="dim">三传吉神 ${good} · 凶神 ${bad}${r.note ? '　' + r.note : ''}</p>
        </div>
      </div>
      <div class="dl-read-src">读法：六亲、天将各取其本义（《大六壬指南·天将》《六壬大全》六亲），课体断语取《大六壬指南·课体》。两处并看即为倾向，不作定论。底本：${td.src}。</div>
    </div>

    <div class="dl-sec">神煞速查</div>
    <div class="dl-ss glass-card">${ssHtml}</div>

    <div class="dl-jiang glass-card">
      <div class="dl-jiang-h">十二天将临地盘</div>
      <div class="dl-jiang-line">${jiangLine}</div>
      <div class="dl-jiang-note">${T('贵人', 'dl-j-贵人')}临${ZHI[r.grPos]}宫（${r.fwd ? '顺布' : '逆布'}）。天将随天盘走，故三传所乘之将如上表。点任一将看其主事。</div>
    </div>

    <div class="dl-foot">起课只由「月将加时」与日干支决定，不含随机；同一时刻必得同一课。</div>
  </div>
  ${foldVerdict(vdBlock)}`;
  return stage(html, 'daliuren');
}

function fmt(d) {
  const p = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`;
}

export function daLiuRenCopyText(at = nowDate()) {
  const r = qiKe(at);
  const td = TI_DUAN[r.ti] || { jue: '', duan: '', src: '' };
  const { items, good, bad } = readPan(r);
  const vd = verdict(r);
  const lines = [
    `【大六壬 · 起课】${fmt(at)}`,
    `四柱：${r.sz.yearGanZhi} ${r.sz.monthGanZhi} ${r.sz.dayGanZhi} ${r.sz.timeGanZhi} · ${r.cal.nongli}`,
    `月将：${ZHI[r.yj]}（太阳在${r.sunSign || '—'}） · 占时：${ZHI[r.t]}时 · ${r.isDay ? '昼占' : '夜占'}`,
    `旬：${r.xun.xunName} · 旬空：${r.xun.kong.map((z) => ZHI[z]).join(' ')}${r.nianMing !== null ? ' · 本命：' + ZHI[r.nianMing] : ''}`,
    `天地盘：月将${ZHI[r.yj]}加${ZHI[r.t]}时`,
    '',
    `方向：${vd.level.k} —— ${vd.level.d}`,
    ...vd.pros.map((x) => `  顺：${x.replace(/<[^>]+>/g, '')}`),
    ...vd.cons.map((x) => `  忌：${x.replace(/<[^>]+>/g, '')}`),
    `  节奏：${vd.rhythm}`,
    '',
    `四课（四→一）：${r.ke4.slice().reverse().map((c) => `${ZHI[c.up]}/${ZHI[c.down]}(${c.rel}${r.faKe === r.ke4.indexOf(c) ? '·发用' : ''})`).join('  ')}`,
    '三传：',
  ];
  items.forEach((it) => {
    lines.push(`  ${it.pos}「${it.z}」${it.q}·${it.j}${it.kong ? '·落空' : ''} —— ${LIUQIN_MEAN[it.q] || ''}；${JIANG_MEAN[it.j] || ''}`);
  });
  lines.push(`课体：${r.ti}课（${td.jue}）· 发用取法：${r.faYong}`);
  lines.push(`断语：${td.duan}`);
  lines.push(`合参：三传吉神 ${good} · 凶神 ${bad}`);
  lines.push('');
  lines.push(`神煞：旬空 ${r.xun.kong.map((z) => ZHI[z]).join(' ')} · 驿马 ${ZHI[r.ss.驿马]} · 桃花 ${ZHI[r.ss.桃花]} · 华盖 ${ZHI[r.ss.华盖]} · 劫煞 ${ZHI[r.ss.劫煞]} · 日禄 ${ZHI[r.ss.日禄]}`);
  lines.push(`十二天将临地盘：${r.jiang.map((j, i) => ZHI[i] + j).join(' ')}`);
  lines.push('');
  lines.push('底本：《大六壬指南》课体发用与天将，《六壬大全》天地盘·寄宫·神煞。起课不含随机。');
  return lines.join('\n');
}

export const daLiuRenCode = () => '';
