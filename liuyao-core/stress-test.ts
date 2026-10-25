/**
 * 综合压力测试：覆盖 64卦 × 60甲子 × 64动静组合 × 回归测试 × 100组随机
 *
 * 使用 tsx + node:assert 运行（FUSE沙箱 vitest 死锁）。
 * 所有测试数据有明确外部来源（tsumugi 交叉、历法规则、金标准 App）。
 *
 * 运行：cd liuyao-core && npx tsx stress-test.ts
 */
import assert from 'node:assert/strict';
import { castManual } from './src/input.js';
import { paipan } from './src/paipan.js';
import { solarToSiZhu } from './src/calendar.js';
import { getGuaMeta, getFullNajia } from './src/guaTable.js';
import { BAGUA_BITS } from './src/constants.js';
import { calcGuaShen } from './src/guashen.js';
import { computeYuanJiChou, wuXingToLiuQin, liuQinToWuXing, analyzeNajia } from './src/najiaAnalysis.js';
import { evalYao } from './src/wangshuai.js';
import type { BaGua, DiZhi, WuXing, YaoValue, LiuQin } from './src/types.js';

// ── tsumugi 交叉验证基准 ──
import { Hexagram, HexagramInfoTable, TrigramInfoTable } from 'liuyao';

// tsumugi 经卦 binary → 卦名映射
const TRI_BIN_TO_NAME = new Map<string, string>();
for (const t of TrigramInfoTable) {
  TRI_BIN_TO_NAME.set((t as any).binary, (t as any).id);
}

// 64卦 binary → 卦名 lookup（binary = lowerBinary + upperBinary, bottom-to-top）
const HEX_BIN_TO_ID = new Map<string, string>();
for (const info of HexagramInfoTable) {
  const h = Hexagram.fromId(info.id);
  HEX_BIN_TO_ID.set((h as any).binary, info.id);
}

// ── 统计 ──
let totalPass = 0;
let totalFail = 0;
let totalTests = 0;

function ok(name: string, fn: () => void) {
  totalTests++;
  try {
    fn();
    totalPass++;
    console.log(`  ✓ ${name}`);
  } catch (e: any) {
    totalFail++;
    console.log(`  ✗ ${name}`);
    console.log(`    ${e.message}`);
  }
}

// ── 常量 ──
const BAGUA_LIST: BaGua[] = ['乾', '兑', '离', '震', '巽', '坎', '艮', '坤'];
const DIZHI: DiZhi[] = ['子', '丑', '寅', '卯', '辰', '巳', '午', '未', '申', '酉', '戌', '亥'];
const TIANGAN = ['甲', '乙', '丙', '丁', '戊', '己', '庚', '辛', '壬', '癸'];
const WUXING_LIST: WuXing[] = ['金', '木', '水', '火', '土'];

// 六亲计算（与 mingpan LiuqinCalculator 一致）
function getExpectedLiuQin(gongWuXing: WuXing, yaoWuXing: WuXing): string {
  const SHENG: Record<string, string> = { 金: '水', 水: '木', 木: '火', 火: '土', 土: '金' };
  const KE: Record<string, string> = { 金: '木', 木: '土', 土: '水', 水: '火', 火: '金' };
  if (gongWuXing === yaoWuXing) return '兄弟';
  if (SHENG[gongWuXing] === yaoWuXing) return '子孙';
  if (KE[gongWuXing] === yaoWuXing) return '妻财';
  if (SHENG[yaoWuXing] === gongWuXing) return '父母';
  return '官鬼';
}

/**
 * 由上下卦构造静卦六爻值（7少阳/8少阴）。
 * BAGUA_BITS 实际是 [三爻,二爻,初爻]（top-to-bottom），
 * yaoValues 需要 [初爻,二爻,三爻]（bottom-to-top），所以要 reverse。
 */
function staticValues(upper: BaGua, lower: BaGua): YaoValue[] {
  const lowerBits = [...BAGUA_BITS[lower]].reverse(); // → [初,二,三]
  const upperBits = [...BAGUA_BITS[upper]].reverse();
  return [
    ...lowerBits.map(b => (b ? 7 : 8) as YaoValue),
    ...upperBits.map(b => (b ? 7 : 8) as YaoValue),
  ];
}

/**
 * 由上下卦算 tsumugi binary（bottom-to-top 拼接）。
 * BAGUA_BITS[卦] = [三爻,二爻,初爻] top-to-bottom，
 * 反转后 = [初爻,二爻,三爻] bottom-to-top，
 * true=yang→1, false=yin→0。
 */
function tsumugiBinary(upper: BaGua, lower: BaGua): string {
  const lowerBits = [...BAGUA_BITS[lower]].reverse();
  const upperBits = [...BAGUA_BITS[upper]].reverse();
  const lowerBin = lowerBits.map(b => b ? '1' : '0').join('');
  const upperBin = upperBits.map(b => b ? '1' : '0').join('');
  return lowerBin + upperBin;
}

// ══════════════════════════════════════
// A. 64卦完整测试（64组）
// ══════════════════════════════════════
console.log('\n══════════════════════════════════════');
console.log('A. 64卦完整遍历测试');
console.log('══════════════════════════════════════');

let aPass = 0;

for (const upper of BAGUA_LIST) {
  for (const lower of BAGUA_LIST) {
    const label = `${upper}上${lower}下`;

    ok(label, () => {
      // 1. getGuaMeta 基本验证
      const meta = getGuaMeta(upper, lower);
      assert.ok(meta.name.length >= 2, `卦名不能为空`);
      assert.ok(BAGUA_LIST.includes(meta.gong), `宫必须为八卦之一: ${meta.gong}`);
      assert.ok(meta.shiPosition >= 1 && meta.shiPosition <= 6, `世爻位置越界`);
      assert.ok(meta.yingPosition >= 1 && meta.yingPosition <= 6, `应爻位置越界`);
      assert.equal(Math.abs(meta.shiPosition - meta.yingPosition), 3, `世应间距应为3`);

      // 2. getFullNajia 验证
      const najia = getFullNajia(upper, lower);
      assert.equal(najia.length, 6, `纳甲必须6爻`);
      for (let i = 0; i < 6; i++) {
        assert.ok(TIANGAN.includes(najia[i].gan), `第${i + 1}爻天干非法`);
        assert.ok(DIZHI.includes(najia[i].zhi), `第${i + 1}爻地支非法`);
        assert.ok(WUXING_LIST.includes(najia[i].wuXing), `第${i + 1}爻五行非法`);
      }

      // 3. castManual 构造静卦 + paipan
      const values = staticValues(upper, lower);
      const pan = paipan({ yaoValues: values, year: 2026, month: 1, day: 15, hour: 10 });
      assert.equal(pan.yaoList.length, 6, `yaoList 长度应为6`);
      assert.equal(pan.benGua.name, meta.name, `paipan卦名与getGuaMeta不一致`);
      assert.equal(pan.benGua.gong, meta.gong, `paipan宫与getGuaMeta不一致`);

      // 4. tsumugi 交叉验证：卦名+宫
      const bin = tsumugiBinary(upper, lower);
      const tsumugiId = HEX_BIN_TO_ID.get(bin);
      assert.ok(tsumugiId, `tsumugi 找不到卦 (binary=${bin})`);
      assert.equal(meta.name, tsumugiId, `卦名与tsumugi分歧: ${meta.name} vs ${tsumugiId}`);

      const hex = Hexagram.fromId(tsumugiId!);
      const tPalace = (hex as any).palace as BaGua;
      assert.equal(meta.gong, tPalace, `宫与tsumugi分歧: ${meta.gong} vs ${tPalace}`);

      // 5. 静卦无变卦
      assert.equal(pan.bianGua, undefined, `静卦不应有变卦`);
      assert.equal(pan.movingPositions.length, 0, `静卦动爻应为空`);

      // 6. 纳甲五行与卦宫五行→六亲 与 tsumugi kins 交叉
      const tKins = (hex as any).kins as string[];
      for (let i = 0; i < 6; i++) {
        const tQin = tKins[i].slice(0, 2);
        const myQin = getExpectedLiuQin(meta.gongWuXing, najia[i].wuXing);
        assert.equal(myQin, tQin, `第${i + 1}爻六亲与tsumugi分歧: ${myQin} vs ${tQin}`);
      }

      aPass++;
    });
  }
}
console.log(`\n  A部分: ${aPass}/64 卦通过`);

// ══════════════════════════════════════
// B. 60甲子日测试（60组）
// ══════════════════════════════════════
console.log('\n══════════════════════════════════════');
console.log('B. 60甲子日遍历测试（2026-01-01 起60天）');
console.log('══════════════════════════════════════');

/**
 * 根据日干支算旬空（独立实现，用于交叉验证 solarToSiZhu）。
 * 旬空 = 该旬缺失的两个地支。
 * 甲子旬(甲子~癸酉)空戌亥，甲戌旬空申酉，甲申旬空午未，
 * 甲午旬空辰巳，甲辰旬空寅卯，甲寅旬空子丑。
 */
function calcXunKong(dayGan: string, dayZhi: string): [DiZhi, DiZhi] {
  const ganIdx = TIANGAN.indexOf(dayGan);
  const zhiIdx = DIZHI.indexOf(dayZhi);
  // 旬首地支 = 日支 - 日干序号 (mod 12)
  const xunStartZhi = ((zhiIdx - ganIdx) % 12 + 12) % 12;
  // 旬空 = 旬首地支往前推2位和1位（即该旬10个地支之后的两个）
  const kong1 = DIZHI[(xunStartZhi + 10) % 12];
  const kong2 = DIZHI[(xunStartZhi + 11) % 12];
  return [kong1, kong2];
}

const seenDayGanZhi = new Set<string>();
let bPass = 0;
const startDate = new Date(2026, 0, 1);

for (let d = 0; d < 60; d++) {
  const dt = new Date(startDate.getTime() + d * 86400000);
  const y = dt.getFullYear();
  const m = dt.getMonth() + 1;
  const day = dt.getDate();
  const label = `${y}-${String(m).padStart(2, '0')}-${String(day).padStart(2, '0')}`;

  ok(label, () => {
    const sz = solarToSiZhu({ year: y, month: m, day, hour: 12 });
    const dayGZ = sz.dayGanZhi;
    const dayGan = dayGZ.charAt(0);
    const dayZhi = dayGZ.charAt(1);

    assert.ok(TIANGAN.includes(dayGan), `日干非法: ${dayGan}`);
    assert.ok(DIZHI.includes(dayZhi), `日支非法: ${dayZhi}`);

    // 旬空验证
    const xk = sz.xunKong;
    assert.equal(xk.length, 2, `旬空长度应为2`);
    const expectedXK = calcXunKong(dayGan, dayZhi);
    assert.deepEqual(xk, expectedXK,
      `旬空不一致: got [${xk}] expected [${expectedXK}] (日柱${dayGZ})`);

    // 四柱完整性
    assert.equal(sz.yearGanZhi.length, 2, `年柱长度2`);
    assert.equal(sz.monthGanZhi.length, 2, `月柱长度2`);
    assert.equal(sz.timeGanZhi.length, 2, `时柱长度2`);

    seenDayGanZhi.add(dayGZ);
    bPass++;
  });
}
console.log(`\n  B部分: ${bPass}/60 天通过，${seenDayGanZhi.size} 个不重复日柱`);

// ══════════════════════════════════════
// C. 64种动静组合测试（64组）
// ══════════════════════════════════════
console.log('\n══════════════════════════════════════');
console.log('C. 64种动静组合测试（乾为天基准）');
console.log('══════════════════════════════════════');

let cPass = 0;

for (let mask = 0; mask < 64; mask++) {
  const movingBits: boolean[] = [];
  for (let bit = 0; bit < 6; bit++) {
    movingBits.push((mask & (1 << bit)) !== 0);
  }
  const movingLabel = movingBits.map((m, i) => m ? `${i + 1}` : '').filter(Boolean).join(',');
  const label = movingLabel ? `动爻[${movingLabel}]` : '静卦';

  ok(label, () => {
    // 乾为天：六爻皆阳。动→9(老阳)，静→7(少阳)
    const values: YaoValue[] = movingBits.map(m => (m ? 9 : 7) as YaoValue);

    const pan = paipan({ yaoValues: values, year: 2026, month: 1, day: 15, hour: 10 });

    // 本卦应为乾为天
    assert.equal(pan.benGua.name, '乾为天', `本卦应为乾为天`);
    assert.equal(pan.benGua.gong, '乾');
    assert.equal(pan.benGua.gongWuXing, '金');

    // 动爻位置
    const expectedMoving = movingBits.map((m, i) => m ? i + 1 : -1).filter(p => p > 0);
    assert.deepEqual([...pan.movingPositions].sort((a, b) => a - b),
      [...expectedMoving].sort((a, b) => a - b), `动爻位置不匹配`);

    // yaoList 完整性
    assert.equal(pan.yaoList.length, 6);
    for (let i = 0; i < 6; i++) {
      assert.equal(pan.yaoList[i].moving, movingBits[i], `第${i + 1}爻动标记不匹配`);
      assert.equal(pan.yaoList[i].yinYang, '阳', `乾为天各爻应为阳`);
    }

    if (expectedMoving.length === 0) {
      // 静卦
      assert.equal(pan.bianGua, undefined, `静卦不应有变卦`);
      assert.equal(pan.bianYaoList, undefined, `静卦不应有变爻`);
    } else {
      // 有变卦
      assert.ok(pan.bianGua, `有动爻应有变卦`);
      assert.ok(pan.bianYaoList, `有动爻应有变爻`);
      assert.equal(pan.bianYaoList!.length, 6, `变爻长度6`);

      // 变爻阴阳验证：阳动→阴
      for (let i = 0; i < 6; i++) {
        if (movingBits[i]) {
          assert.equal(pan.bianYaoList![i].yinYang, '阴', `第${i + 1}爻变爻应为阴`);
          assert.equal(pan.bianYaoList![i].moving, true, `第${i + 1}爻应标记为动`);
        } else {
          assert.equal(pan.bianYaoList![i].yinYang, '阳', `第${i + 1}爻静爻应保持阳`);
          assert.equal(pan.bianYaoList![i].moving, false, `第${i + 1}爻不应标记为动`);
        }
      }

      // 变卦合法性
      assert.ok(pan.bianGua!.name.length >= 2, `变卦名非空`);
      assert.ok(BAGUA_LIST.includes(pan.bianGua!.gong), `变卦宫合法`);
      assert.equal(Math.abs(pan.bianGua!.shiPosition - pan.bianGua!.yingPosition), 3, `变卦世应间距3`);

      // ★ 头号红线：变卦六亲恒用本卦宫五行（金）
      for (const by of pan.bianYaoList!) {
        const expectedQin = getExpectedLiuQin('金', by.wuXing);
        assert.equal(by.liuQin, expectedQin,
          `变卦第${by.position}爻六亲应按本卦宫(金)算: got ${by.liuQin} expected ${expectedQin}`);
      }
    }

    cPass++;
  });
}
console.log(`\n  C部分: ${cPass}/64 组合通过`);

// ══════════════════════════════════════
// D. 回归测试（用户指定案例）
// ══════════════════════════════════════
console.log('\n══════════════════════════════════════');
console.log('D. 回归测试：丙午年戊戌月丁卯日戊申时 乾为天静卦');
console.log('══════════════════════════════════════');

// 找丙午年戊戌月中丁卯日的公历日期
// 丙午年=2026，戊戌月=寒露后到立冬前（约10月8日~11月7日）
let targetDate: Date | null = null;
for (let d = 0; d < 40; d++) {
  const dayNum = 8 + d; // 10月8日起
  // 需要处理跨月
  const dt = new Date(2026, 9, dayNum); // 月份0-based: 9=October
  const sz = solarToSiZhu({ year: 2026, month: dt.getMonth() + 1, day: dt.getDate(), hour: 16 });
  if (sz.dayGanZhi === '丁卯' && sz.monthGanZhi === '戊戌' && sz.yearGanZhi === '丙午') {
    targetDate = dt;
    break;
  }
}

if (targetDate) {
  const pan = paipan({
    yaoValues: castManual([
      { yinYang: '阳' }, { yinYang: '阳' }, { yinYang: '阳' },
      { yinYang: '阳' }, { yinYang: '阳' }, { yinYang: '阳' },
    ]),
    year: 2026,
    month: targetDate.getMonth() + 1,
    day: targetDate.getDate(),
    hour: 16, // 申时 15:00-17:00
  });

  ok('四柱：丙午年戊戌月丁卯日戊申时', () => {
    assert.equal(pan.siZhu.yearGanZhi, '丙午');
    assert.equal(pan.siZhu.monthGanZhi, '戊戌');
    assert.equal(pan.siZhu.dayGanZhi, '丁卯');
    assert.equal(pan.siZhu.timeGanZhi, '戊申');
  });

  ok('旬空：戌亥', () => {
    // 丁卯日：丁=天干3，卯=地支3
    // 旬首地支 = (3-3+12)%12 = 0 = 子 → 甲子旬 → 空戌亥
    assert.deepEqual(pan.xunKong, ['戌', '亥']);
  });

  ok('本卦：乾为天 乾宫 六冲 八纯', () => {
    assert.equal(pan.benGua.name, '乾为天');
    assert.equal(pan.benGua.gong, '乾');
    assert.equal(pan.benGua.gongWuXing, '金');
    assert.equal(pan.benGua.specialType, '六冲');
    assert.equal(pan.benGua.isBaChun, true);
    assert.equal(pan.benGua.shiPosition, 6);
    assert.equal(pan.benGua.yingPosition, 3);
  });

  ok('六爻纳甲六亲世应（自下而上）', () => {
    // 乾为天纳甲：内卦甲子/甲寅/甲辰，外卦壬午/壬申/壬戌
    // 宫五行=金：子水→子孙, 寅木→妻财, 辰土→父母, 午火→官鬼, 申金→兄弟, 戌土→父母
    const rows = pan.yaoList.map(y => ({
      p: y.position, q: y.liuQin, gz: y.gan + y.zhi, wx: y.wuXing,
      sy: y.shiYing ?? null,
    }));
    assert.deepEqual(rows, [
      { p: 1, q: '子孙', gz: '甲子', wx: '水', sy: null },
      { p: 2, q: '妻财', gz: '甲寅', wx: '木', sy: null },
      { p: 3, q: '父母', gz: '甲辰', wx: '土', sy: '应' },
      { p: 4, q: '官鬼', gz: '壬午', wx: '火', sy: null },
      { p: 5, q: '兄弟', gz: '壬申', wx: '金', sy: null },
      { p: 6, q: '父母', gz: '壬戌', wx: '土', sy: '世' },
    ]);
  });

  ok('六神：丁日初爻起朱雀', () => {
    // 丙丁日起朱雀：初朱雀→二勾陈→三螣蛇→四白虎→五玄武→上青龙
    const ls = pan.yaoList.map(y => `${y.position}:${y.liuShen}`);
    assert.deepEqual(ls, [
      '1:朱雀', '2:勾陈', '3:螣蛇',
      '4:白虎', '5:玄武', '6:青龙',
    ]);
  });

  ok('静卦：无动爻无变卦', () => {
    assert.equal(pan.movingPositions.length, 0);
    assert.equal(pan.bianGua, undefined);
    assert.equal(pan.bianYaoList, undefined);
  });

  ok('卦身：乾为天世6（阴世位）→亥', () => {
    // 乾为天世爻=6（阴世位），卦身 = DIZHI[6+5] = DIZHI[11] = 亥
    assert.equal(pan.guaShen, '亥');
  });

  ok('原神/忌神/仇神：乾宫(金) 财运域用神妻财', () => {
    const analysis = analyzeNajia(pan, { monthZhi: '戌', dayZhi: '卯' });
    const ysc = analysis.yongshen['财运'];
    // 妻财(木)：原神=子孙(水生木)、忌神=兄弟(金克木)、仇神=父母(土生金)
    assert.equal(ysc.yuanShen, '子孙');
    assert.equal(ysc.jiShen, '兄弟');
    assert.equal(ysc.chouShen, '父母');
  });
} else {
  ok('找到丙午年戊戌月丁卯日', () => {
    assert.fail('未能在2026年10月寒露后找到丁卯日');
  });
}

// ══════════════════════════════════════
// E. 组合压力测试（100组随机）
// ══════════════════════════════════════
console.log('\n══════════════════════════════════════');
console.log('E. 组合压力测试：100组随机排盘');
console.log('══════════════════════════════════════');

// Mulberry32 PRNG（确定性随机，可复现）
function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const rand = mulberry32(42);
const YAO_OPTIONS: YaoValue[] = [6, 7, 8, 9];
let ePass = 0;

for (let i = 0; i < 100; i++) {
  // 随机日期：2020-01-01 ~ 2030-12-31
  const startMs = new Date(2020, 0, 1).getTime();
  const endMs = new Date(2030, 11, 31).getTime();
  const randomMs = startMs + rand() * (endMs - startMs);
  const dt = new Date(randomMs);
  const y = dt.getFullYear();
  const m = dt.getMonth() + 1;
  const d = dt.getDate();
  const h = Math.floor(rand() * 24);
  const min = Math.floor(rand() * 60);

  // 随机6爻值
  const values: YaoValue[] = Array.from({ length: 6 }, () => YAO_OPTIONS[Math.floor(rand() * 4)]);

  ok(`#${i + 1} ${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')} ${String(h).padStart(2, '0')}:${String(min).padStart(2, '0')} [${values.join(',')}]`, () => {
    // paipan 不抛异常
    const pan = paipan({
      yaoValues: values,
      year: y, month: m, day: d, hour: h, minute: min,
    });

    // 基本结构一致性
    assert.equal(pan.yaoList.length, 6);
    assert.equal(pan.xunKong.length, 2);

    // 四柱完整性
    for (const col of [pan.siZhu.yearGanZhi, pan.siZhu.monthGanZhi, pan.siZhu.dayGanZhi, pan.siZhu.timeGanZhi]) {
      assert.equal(col.length, 2, `四柱长度2: ${col}`);
      assert.ok(TIANGAN.includes(col.charAt(0)), `天干合法: ${col.charAt(0)}`);
      assert.ok(DIZHI.includes(col.charAt(1)), `地支合法: ${col.charAt(1)}`);
    }

    // 本卦完整性
    assert.ok(pan.benGua.name.length >= 2);
    assert.ok(BAGUA_LIST.includes(pan.benGua.gong));
    assert.ok(pan.benGua.shiPosition >= 1 && pan.benGua.shiPosition <= 6);
    assert.ok(pan.benGua.yingPosition >= 1 && pan.benGua.yingPosition <= 6);
    assert.equal(Math.abs(pan.benGua.shiPosition - pan.benGua.yingPosition), 3, `世应间距3`);

    // 卦身合法性
    assert.ok(DIZHI.includes(pan.guaShen!), `卦身应为地支: ${pan.guaShen}`);
    assert.equal(pan.guaShen, calcGuaShen(pan.benGua.shiPosition), `卦身与世位一致`);

    // 每爻完整性
    for (const yao of pan.yaoList) {
      assert.ok(yao.position >= 1 && yao.position <= 6);
      assert.ok(['阴', '阳'].includes(yao.yinYang));
      assert.ok(['青龙', '朱雀', '勾陈', '螣蛇', '白虎', '玄武'].includes(yao.liuShen));
      assert.ok(TIANGAN.includes(yao.gan));
      assert.ok(DIZHI.includes(yao.zhi));
      assert.ok(WUXING_LIST.includes(yao.wuXing));
      assert.ok(['父母', '兄弟', '子孙', '妻财', '官鬼'].includes(yao.liuQin));
    }

    // 动爻与变卦一致性
    const movingCount = values.filter(v => v === 6 || v === 9).length;
    assert.equal(pan.movingPositions.length, movingCount, `动爻数量一致`);

    if (movingCount > 0) {
      assert.ok(pan.bianGua, `有动爻应有变卦`);
      assert.ok(pan.bianYaoList, `有动爻应有变爻`);
      assert.equal(pan.bianYaoList!.length, 6);

      // 变卦六亲恒用本卦宫五行
      for (const by of pan.bianYaoList!) {
        const expectedQin = getExpectedLiuQin(pan.benGua.gongWuXing, by.wuXing);
        assert.equal(by.liuQin, expectedQin,
          `变爻#${by.position}六亲应按本卦宫(${pan.benGua.gongWuXing})算`);
      }

      // 变卦世应间距
      assert.equal(Math.abs(pan.bianGua!.shiPosition - pan.bianGua!.yingPosition), 3);
    } else {
      assert.equal(pan.bianGua, undefined, `静卦无变卦`);
      assert.equal(pan.bianYaoList, undefined, `静卦无变爻`);
    }

    // 旬空合法性
    assert.ok(DIZHI.includes(pan.xunKong[0]));
    assert.ok(DIZHI.includes(pan.xunKong[1]));
    assert.notEqual(pan.xunKong[0], pan.xunKong[1], `旬空两个不同`);

    // 神煞完整性（14项）
    const ss = pan.shenSha;
    for (const [name, val] of [
      ['驿马', ss.yiMa], ['桃花', ss.taoHua], ['日禄', ss.riLu],
      ['文昌', ss.wenChang], ['羊刃', ss.yangRen], ['将星', ss.jiangXing],
      ['谋星', ss.mouXing], ['劫煞', ss.jieSha], ['灾煞', ss.zaiSha],
      ['华盖', ss.huaGai], ['日德', ss.riDe], ['天马', ss.tianMa], ['天医', ss.tianYi],
    ] as [string, DiZhi][]) {
      assert.ok(DIZHI.includes(val), `${name}应为地支: ${val}`);
    }
    assert.equal(ss.guiRen.length, 2, `贵人两支`);
    assert.ok(DIZHI.includes(ss.guiRen[0]));
    assert.ok(DIZHI.includes(ss.guiRen[1]));

    ePass++;
  });
}
console.log(`\n  E部分: ${ePass}/100 组通过`);

// ══════════════════════════════════════
// F. 新功能专项测试：卦身 / 原神忌神仇神 / 暗动日破
// ══════════════════════════════════════
console.log('\n══════════════════════════════════════');
console.log('F. 新功能专项测试');
console.log('══════════════════════════════════════');

// F1. 卦身：6个世位全验证
ok('卦身：世1(阳)→子', () => { assert.equal(calcGuaShen(1), '子'); });
ok('卦身：世2(阴)→未', () => { assert.equal(calcGuaShen(2), '未'); });
ok('卦身：世3(阳)→寅', () => { assert.equal(calcGuaShen(3), '寅'); });
ok('卦身：世4(阴)→酉', () => { assert.equal(calcGuaShen(4), '酉'); });
ok('卦身：世5(阳)→辰', () => { assert.equal(calcGuaShen(5), '辰'); });
ok('卦身：世6(阴)→亥', () => { assert.equal(calcGuaShen(6), '亥'); });

// F2. 卦身在排盘中赋值正确（不同世位的卦）
// 乾为天(世6)→亥，坎为水(世6)→亥，震为雷(世6)→亥
ok('排盘卦身：乾为天(世6)→亥', () => {
  const pan = paipan({ yaoValues: [7, 7, 7, 7, 7, 7] as YaoValue[], year: 2026, month: 1, day: 15, hour: 10 });
  assert.equal(pan.benGua.shiPosition, 6);
  assert.equal(pan.guaShen, '亥');
});
// 泽火革（坎宫四世卦，世4）→酉
ok('排盘卦身：泽火革(世4)→酉', () => {
  // 泽火革：上兑下离
  const vals = staticValues('兑', '离');
  const pan = paipan({ yaoValues: vals, year: 2026, month: 1, day: 15, hour: 10 });
  assert.equal(pan.benGua.name, '泽火革');
  assert.equal(pan.benGua.shiPosition, 4);
  assert.equal(pan.guaShen, '酉');
});

// F3. 原神/忌神/仇神：穷举验证（五行×五亲 = 25种组合）
const SHENG_MAP: Record<string, string> = { 金: '水', 水: '木', 木: '火', 火: '土', 土: '金' };
const KE_MAP: Record<string, string> = { 金: '木', 木: '土', 土: '水', 水: '火', 火: '金' };

// 预计算每个宫五行下各六亲的五行
function expectedLiuQinWuXing(lq: string, gwx: string): string {
  if (lq === '兄弟') return gwx;
  if (lq === '子孙') return SHENG_MAP[gwx];
  if (lq === '妻财') return KE_MAP[gwx];
  if (lq === '父母') {
    for (const wx of WUXING_LIST) { if (SHENG_MAP[wx] === gwx) return wx; }
  }
  if (lq === '官鬼') {
    for (const wx of WUXING_LIST) { if (KE_MAP[wx] === gwx) return wx; }
  }
  return '';
}

let f3Count = 0;
for (const gwx of WUXING_LIST) {
  for (const lq of ['官鬼', '父母', '兄弟', '子孙', '妻财'] as LiuQin[]) {
    const label = `原忌仇：${gwx}宫${lq}`;
    ok(label, () => {
      const result = computeYuanJiChou(lq, gwx as WuXing);
      const yongWx = expectedLiuQinWuXing(lq, gwx);

      // 原神五行 = 生用神五行者
      let yuanWx = '';
      for (const wx of WUXING_LIST) { if (SHENG_MAP[wx] === yongWx) { yuanWx = wx; break; } }
      const expectedYuan = wuXingToLiuQin(yuanWx as WuXing, gwx as WuXing);
      assert.equal(result.yuanShen, expectedYuan,
        `原神: got ${result.yuanShen} expected ${expectedYuan} (${gwx}宫${lq}=${yongWx}, 原神wx=${yuanWx})`);

      // 忌神五行 = 克用神五行者
      let jiWx = '';
      for (const wx of WUXING_LIST) { if (KE_MAP[wx] === yongWx) { jiWx = wx; break; } }
      const expectedJi = wuXingToLiuQin(jiWx as WuXing, gwx as WuXing);
      assert.equal(result.jiShen, expectedJi,
        `忌神: got ${result.jiShen} expected ${expectedJi} (${gwx}宫${lq}=${yongWx}, 忌神wx=${jiWx})`);

      // 仇神五行 = 生忌神五行者
      let chouWx = '';
      for (const wx of WUXING_LIST) { if (SHENG_MAP[wx] === jiWx) { chouWx = wx; break; } }
      const expectedChou = wuXingToLiuQin(chouWx as WuXing, gwx as WuXing);
      assert.equal(result.chouShen, expectedChou,
        `仇神: got ${result.chouShen} expected ${expectedChou} (${gwx}宫${lq}, 仇神wx=${chouWx})`);

      f3Count++;
    });
  }
}

// F4. 暗动/日破：构造特定场景验证
// 暗动：静爻被日冲 + 旺/相
ok('暗动：酉月(金) 卯日冲酉爻(金) → 旺极被冲=暗动', () => {
  // 酉月(金令)，酉爻(金) → 旺于月；卯日冲酉 → riChong=true; lingTai=旺 → anDong=true
  const state = evalYao({
    zhi: '酉', wuXing: '金', moving: false,
    monthZhi: '酉', dayZhi: '卯', xunKong: ['午', '未'],
  });
  assert.equal(state.riChong, true, '应riChong=true');
  assert.equal(state.anDong, true, '应anDong=true(旺+日冲)');
  assert.equal(state.riPo, false, '不应riPo');
  assert.ok(state.tags.includes('暗动'), 'tags应含暗动');
});

ok('日破：午月(火) 子日冲午爻(火) → 旺被冲=暗动（非日破）', () => {
  const state = evalYao({
    zhi: '午', wuXing: '火', moving: false,
    monthZhi: '午', dayZhi: '子', xunKong: ['戌', '亥'],
  });
  assert.equal(state.riChong, true);
  assert.equal(state.anDong, true, '旺+日冲=暗动');
  assert.equal(state.riPo, false);
});

ok('日破：寅月(木) 申日冲寅爻(木) → 旺被冲=暗动', () => {
  const state = evalYao({
    zhi: '寅', wuXing: '木', moving: false,
    monthZhi: '寅', dayZhi: '申', xunKong: ['戌', '亥'],
  });
  assert.equal(state.riChong, true);
  assert.equal(state.anDong, true, '旺+日冲=暗动');
  assert.equal(state.riPo, false);
});

ok('日破：申月(金) 寅日冲申爻(金) → 旺被冲=暗动', () => {
  const state = evalYao({
    zhi: '申', wuXing: '金', moving: false,
    monthZhi: '申', dayZhi: '寅', xunKong: ['戌', '亥'],
  });
  assert.equal(state.riChong, true);
  assert.equal(state.anDong, true);
  assert.equal(state.riPo, false);
});

ok('日破：卯月(木) 酉日冲酉爻(金) → 囚+日冲=日破', () => {
  // 卯月(木令)，酉爻(金) → 金克木=囚；酉日被卯日冲？不对，酉日不会冲酉。
  // 换：卯月(木令)，酉爻(金) → 金克木=囚；日支冲酉=卯日
  const state = evalYao({
    zhi: '酉', wuXing: '金', moving: false,
    monthZhi: '卯', dayZhi: '卯', xunKong: ['戌', '亥'],
  });
  // 卯日不冲酉？卯冲酉！LIU_CHONG[卯]=酉 → 是的
  // 但是 dayZhi=卯，LIU_CHONG[卯]=酉=zhi → riChong=true
  // lingTai: 金在木月 → 金克木=囚
  assert.equal(state.riChong, true);
  assert.equal(state.lingTai, '囚');
  assert.equal(state.riPo, true, '囚+日冲=日破');
  assert.equal(state.anDong, false);
  assert.ok(state.tags.includes('日破'), 'tags应含日破');
});

ok('日破：巳月(火) 亥日冲巳爻(火) → 旺+日冲=暗动', () => {
  const state = evalYao({
    zhi: '巳', wuXing: '火', moving: false,
    monthZhi: '巳', dayZhi: '亥', xunKong: ['戌', '亥'],
  });
  assert.equal(state.riChong, true);
  assert.equal(state.lingTai, '旺');
  assert.equal(state.anDong, true);
  assert.equal(state.riPo, false);
});

ok('日破：子月(水) 午日冲午爻(火) → 死+日冲=日破', () => {
  // 子月(水令)，午爻(火) → 水克火=死；午日被日冲？dayZhi=子，LIU_CHONG[子]=午 → riChong
  const state = evalYao({
    zhi: '午', wuXing: '火', moving: false,
    monthZhi: '子', dayZhi: '子', xunKong: ['戌', '亥'],
  });
  // 子日冲午 → riChong=true; 火在水月 → 水克火=死
  assert.equal(state.riChong, true);
  assert.equal(state.lingTai, '死');
  assert.equal(state.riPo, true, '死+日冲=日破');
  assert.equal(state.anDong, false);
});

ok('暗动/日破：休态不标记（辰月土爻被日冲）', () => {
  // 辰月(土令)，辰爻(土) → 旺...不行，要休态
  // 休 = 爻生令。如：巳月(火令)，土爻 → 火生土=相... 也不对
  // 休 = 爻生令，即 sheng[yaoWx] === lingWx
  // 例：木爻在火月 → sheng[木]=火 → 休
  // 木爻被日冲 → 日支冲木爻地支
  // 寅爻(木)在巳月(火) → 休；申日冲寅 → riChong
  const state = evalYao({
    zhi: '寅', wuXing: '木', moving: false,
    monthZhi: '巳', dayZhi: '申', xunKong: ['戌', '亥'],
  });
  assert.equal(state.lingTai, '休');
  assert.equal(state.riChong, true);
  assert.equal(state.anDong, false, '休态不标记暗动');
  assert.equal(state.riPo, false, '休态不标记日破');
});

// F5. 六亲↔五行互逆一致性验证
let f5Count = 0;
for (const gwx of WUXING_LIST) {
  for (const lq of ['官鬼', '父母', '兄弟', '子孙', '妻财'] as LiuQin[]) {
    ok(`六亲→五行→六亲 一致性：${gwx}宫${lq}`, () => {
      const wx = liuQinToWuXing(lq, gwx as WuXing);
      const recoveredLq = wuXingToLiuQin(wx, gwx as WuXing);
      assert.equal(recoveredLq, lq,
        `${gwx}宫: ${lq}→${wx}→${recoveredLq} 应回到 ${lq}`);
      f5Count++;
    });
  }
}

// ══════════════════════════════════════
// 总统计
// ══════════════════════════════════════
console.log('\n══════════════════════════════════════');
console.log(`总计: ${totalTests} 项测试, ${totalPass} 通过, ${totalFail} 失败`);
console.log('══════════════════════════════════════');

if (totalFail > 0) {
  console.log(`\n⚠️  有 ${totalFail} 项测试失败`);
  process.exit(1);
} else {
  console.log('\n✅ 全部测试通过');
  process.exit(0);
}
