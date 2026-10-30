#!/usr/bin/env node
/**
 * L0-A 历法事实独立核对（只读，不修改任何生产文件）
 *
 * 独立预期来源（不使用被测函数生成预期值）：
 *   1. 节气时刻：astronomy-engine 2.1.19 SunPosition().elon 地心视黄经二分求解
 *      —— 与被测的 lunar-javascript 是两套独立实现，互不依赖
 *   2. 日柱：儒略日数 JDN 公式 index = (JDN + 49) mod 60，锚点 1900-01-01 = 甲戌
 *   3. 年柱：以立春（太阳视黄经 315°）为界，年干支 index = (年 - 4) mod 60
 *   4. 月支：由太阳视黄经所在 30° 区间决定；月干：五虎遁
 *   5. 时支：由钟点决定；时干：五鼠遁
 *   6. 旬空：由日干支推旬首，旬首前两位地支为空亡
 *
 * 实际值来源：liuyao-core dist 的 paipan() 返回的 siZhu / xunKong
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '../../../../');       // 每日六爻/
const OUT = path.resolve(__dirname, '../output');
const DATA = path.resolve(__dirname, '../data');
const CORE = path.join(ROOT, 'liuyao-core');

const { paipan } = await import(path.join(CORE, 'dist/index.js'));
const ASTR = await import(path.join(CORE, 'node_modules/astronomy-engine/esm/astronomy.js'));

const GAN = ['甲', '乙', '丙', '丁', '戊', '己', '庚', '辛', '壬', '癸'];
const ZHI = ['子', '丑', '寅', '卯', '辰', '巳', '午', '未', '申', '酉', '戌', '亥'];
const JIEQI = ['立春', '惊蛰', '清明', '立夏', '芒种', '小暑', '立秋', '白露', '寒露', '立冬', '大雪', '小寒'];
// 12 节对应太阳视黄经（度）
const JIEQI_LON = [315, 345, 15, 45, 75, 105, 135, 165, 195, 225, 255, 285];

const cases = [];
let cid = 0;
function rec(category, input, expected, actual, note = '') {
  cid += 1;
  const pass = JSON.stringify(expected) === JSON.stringify(actual);
  cases.push({ id: `C${String(cid).padStart(4, '0')}`, category, input, expected, actual, pass, note });
  return pass;
}

/* ---------- 独立历法实现 ---------- */

// 公历 → 儒略日数（正午口径，Gregorian）
function jdn(y, m, d) {
  const a = Math.floor((14 - m) / 12);
  const y2 = y + 4800 - a;
  const m2 = m + 12 * a - 3;
  return d + Math.floor((153 * m2 + 2) / 5) + 365 * y2
    + Math.floor(y2 / 4) - Math.floor(y2 / 100) + Math.floor(y2 / 400) - 32045;
}

// 独立日干支：锚点 1900-01-01 = 甲戌
function dayGZ(y, m, d) {
  const idx = ((jdn(y, m, d) + 49) % 60 + 60) % 60;
  return GAN[idx % 10] + ZHI[idx % 12];
}

// 北京时间的年月日时分 → UTC Date
function bjDate(y, m, d, h, mi) {
  return new Date(Date.UTC(y, m - 1, d, h - 8, mi, 0));
}

// 太阳视黄经（度）
function sunLon(date) {
  return ASTR.SunPosition(date).elon;
}

// 归一化到 [-180, 180)
function norm180(x) {
  let v = ((x % 360) + 360) % 360;
  if (v >= 180) v -= 360;
  return v;
}

// 求该公历年内 12 个"节"的精确时刻（UTC Date）
function termsOfYear(year) {
  const start = Date.UTC(year, 0, 1);
  const end = Date.UTC(year + 1, 0, 1);
  const step = 6 * 3600 * 1000; // 6h
  const out = {};
  let t0 = start;
  let f0 = norm180(sunLon(new Date(t0)) - JIEQI_LON[0]);
  // 用"最接近的节气"判断：遍历目标 lon 找 f 变号
  for (let t = start; t < end; t += step) {
    for (let k = 0; k < 12; k++) {
      const L = JIEQI_LON[k];
      const fa = norm180(sunLon(new Date(t)) - L);
      const fb = norm180(sunLon(new Date(t + step)) - L);
      if (fa === 0) { out[JIEQI[k]] = out[JIEQI[k]] || new Date(t); continue; }
      if (fa * fb < 0 && Math.abs(fa) < 30) {
        // 二分到 1 秒
        let lo = t, hi = t + step;
        for (let i = 0; i < 60 && hi - lo > 1000; i++) {
          const mid = (lo + hi) / 2;
          const fm = norm180(sunLon(new Date(mid)) - L);
          if (fm * fa < 0) hi = mid; else lo = mid;
        }
        const tt = new Date(Math.round((lo + hi) / 2 / 1000) * 1000);
        if (!out[JIEQI[k]]) out[JIEQI[k]] = tt;
      }
    }
  }
  return out;
}

// 由太阳视黄经得月支（寅=立春）
function monthZhiByLon(lon) {
  const k = Math.floor((((lon - 315) % 360) + 360) % 360 / 30); // 0=寅
  return ZHI[(2 + k) % 12];
}

// 五虎遁：年干 → 寅月月干
function monthGan(yearGan, monthZhi) {
  const yg = GAN.indexOf(yearGan);
  const start = ((yg % 5) * 2 + 2) % 10;
  const offset = ((ZHI.indexOf(monthZhi) - 2) % 12 + 12) % 12;
  return GAN[(start + offset) % 10];
}

// 五鼠遁：日干 → 子时时干
function hourGan(dayGan, hourZhi) {
  const dg = GAN.indexOf(dayGan);
  const start = (dg % 5) * 2;
  return GAN[(start + ZHI.indexOf(hourZhi)) % 10];
}

function hourZhiOf(hour) {
  return ZHI[Math.floor(((hour + 1) % 24) / 2) % 12];
}

// 独立旬空
function xunKong(dayGZStr) {
  const g = GAN.indexOf(dayGZStr[0]);
  const z = ZHI.indexOf(dayGZStr[1]);
  // 旬首：日干支序 - (干序)，即干=0（甲）的位置
  const idx = ((z - g) % 12 + 12) % 12; // 旬首地支
  const k1 = ZHI[(idx + 10) % 12];
  const k2 = ZHI[(idx + 11) % 12];
  return [k1, k2];
}

function callPaipan(y, m, d, h, mi) {
  return paipan({
    yaoValues: [7, 7, 7, 7, 7, 7],
    year: y, month: m, day: d, hour: h, minute: mi,
    gender: 1, question: '',
  });
}

function bjStr(dt) {
  const t = new Date(dt.getTime() + 8 * 3600 * 1000);
  const p = (n) => String(n).padStart(2, '0');
  return `${t.getUTCFullYear()}-${p(t.getUTCMonth() + 1)}-${p(t.getUTCDate())} ${p(t.getUTCHours())}:${p(t.getUTCMinutes())}`;
}

/* ---------- T1 日柱：连续 90 天（覆盖 1.5 个六十甲子循环） ---------- */
{
  const start = Date.UTC(2020, 0, 1);
  let diff = 0;
  for (let i = 0; i < 90; i++) {
    const dt = new Date(start + i * 86400000);
    const y = dt.getUTCFullYear(), m = dt.getUTCMonth() + 1, d = dt.getUTCDate();
    const exp = dayGZ(y, m, d);
    const act = callPaipan(y, m, d, 12, 0).siZhu.dayGanZhi;
    if (!rec('T1 日柱', `${y}-${m}-${d}`, exp, act)) diff += 1;
  }
  console.log(`T1 日柱连续 90 天：差异 ${diff}`);
}

/* ---------- T2 日柱：跨 2000~2035 抽样 120 天 ---------- */
{
  let diff = 0;
  let seed = 20260101;
  const rnd = () => (seed = (seed * 1103515245 + 12345) % 2147483648) / 2147483648;
  for (let i = 0; i < 120; i++) {
    const y = 2000 + Math.floor(rnd() * 36);
    const m = 1 + Math.floor(rnd() * 12);
    const d = 1 + Math.floor(rnd() * 28);
    const exp = dayGZ(y, m, d);
    const act = callPaipan(y, m, d, 12, 0).siZhu.dayGanZhi;
    if (!rec('T2 日柱抽样', `${y}-${m}-${d}`, exp, act)) diff += 1;
  }
  console.log(`T2 日柱随机抽样 120 天：差异 ${diff}`);
}

/* ---------- T3 节气边界 ---------- */
{
  const termRows = [];
  const driftRows = [];
  let diffM = 0, diffY = 0, n = 0;
  const MIN = 60000;
  for (let year = 2024; year <= 2027; year++) {
    const terms = termsOfYear(year);
    const lichun = terms['立春'];
    for (const name of JIEQI) {
      const t = terms[name];
      if (!t) { console.log(`  ! 未求出 ${year} ${name}`); continue; }
      termRows.push({ year, name, bj: bjStr(t) });

      // --- T3a 明确态：节前 10 分钟 / 节后 10 分钟 ---
      for (const [delta, tag] of [[-10 * MIN, '-10min'], [10 * MIN, '+10min']]) {
        const tt = new Date(t.getTime() + delta);
        const bj = new Date(tt.getTime() + 8 * 3600 * 1000);
        const y = bj.getUTCFullYear(), mo = bj.getUTCMonth() + 1, dd = bj.getUTCDate();
        const hh = bj.getUTCHours(), mi = bj.getUTCMinutes();
        const p = callPaipan(y, mo, dd, hh, mi);
        const lon = sunLon(tt);
        const expZhi = monthZhiByLon(lon);
        const expYearNum = tt >= lichun ? year : year - 1;
        const expYear = GAN[((expYearNum - 4) % 10 + 10) % 10] + ZHI[((expYearNum - 4) % 12 + 12) % 12];
        const expMonth = monthGan(expYear[0], expZhi) + expZhi;
        n += 1;
        if (!rec('T3a 节气明确态-月柱', `${year} ${name} ${tag} (${bjStr(tt)})`,
          expMonth, p.siZhu.monthGanZhi, `太阳视黄经=${lon.toFixed(4)}`)) diffM += 1;
        if (!rec('T3a 节气明确态-年柱', `${year} ${name} ${tag} (${bjStr(tt)})`,
          expYear, p.siZhu.yearGanZhi, `独立立春=${bjStr(lichun)}`)) diffY += 1;
      }

      // --- T3b 量化两套节气算法偏差：二分实测月柱切换点（分钟精度） ---
      if (name !== '立春') {
        const lo0 = new Date(t.getTime() - 30 * MIN);
        const hi0 = new Date(t.getTime() + 30 * MIN);
        const mz = (dt) => {
          const b = new Date(dt.getTime() + 8 * 3600 * 1000);
          return callPaipan(b.getUTCFullYear(), b.getUTCMonth() + 1, b.getUTCDate(), b.getUTCHours(), b.getUTCMinutes()).siZhu.monthGanZhi;
        };
        const mlo = mz(lo0), mhi = mz(hi0);
        if (mlo !== mhi) {
          let lo = lo0.getTime(), hi = hi0.getTime();
          while (hi - lo > MIN) {
            const mid = lo + Math.floor((hi - lo) / 2 / MIN) * MIN;
            if (mid === lo || mid === hi) break;
            if (mz(new Date(mid)) === mlo) lo = mid; else hi = mid;
          }
          const tLib = hi;
          driftRows.push({ year, name, mine: bjStr(t), lib: bjStr(new Date(tLib)), deltaSec: Math.round((tLib - t.getTime()) / 1000) });
        } else {
          driftRows.push({ year, name, mine: bjStr(t), lib: null, deltaSec: null });
        }
      }
    }
  }
  console.log(`T3a 节气明确态 ${n} 例：月柱差异 ${diffM}，年柱差异 ${diffY}`);
  const ds = driftRows.filter((r) => r.deltaSec !== null).map((r) => Math.abs(r.deltaSec));
  console.log(`T3b 节气切换时刻偏差：可测 ${ds.length}/48，最大 |Δ|=${Math.max(...ds)}s，中位=${ds.sort((a,b)=>a-b)[Math.floor(ds.length/2)]}s`);
  fs.writeFileSync(path.join(DATA, 'calendar_terms.json'), JSON.stringify(termRows, null, 2));
  fs.writeFileSync(path.join(DATA, 'calendar_term_drift.json'), JSON.stringify(driftRows, null, 2));
}

/* ---------- T4 时柱：24 小时 × 5 个日干起点 ---------- */
{
  let diff = 0;
  // 找 5 个不同日干的日子（2026-10 内）
  const days = [];
  for (let d = 1; d <= 20 && days.length < 5; d++) {
    const gz = dayGZ(2026, 10, d);
    if (!days.some((x) => x[0] === gz[0])) days.push([gz[0], d]);
  }
  for (const [dg, d] of days) {
    for (let h = 0; h <= 23; h++) {
      const z = hourZhiOf(h);
      // 晚子时 23 点换日：23 点的时干按次日日干起（五鼠遁以日干为基准）
      const effDay = h >= 23 ? dayGZ(2026, 10, d + 1) : dayGZ(2026, 10, d);
      const exp = hourGan(effDay[0], z) + z;
      const act = callPaipan(2026, 10, d, h, 30).siZhu.timeGanZhi;
      if (!rec('T4 时柱', `2026-10-${d} ${dg}日 ${h}:30`, exp, act)) diff += 1;
    }
  }
  console.log(`T4 时柱 ${days.length * 24} 例：差异 ${diff}`);
}

/* ---------- T5 子时边界（晚子时 23 点换日口径） ---------- */
{
  const rows = [];
  for (const [h, mi, expectNextDay] of [[22, 59, false], [23, 0, true], [23, 59, true]]) {
    const exp = dayGZ(2026, 10, expectNextDay ? 28 : 27);
    const p = callPaipan(2026, 10, 27, h, mi);
    const act = p.siZhu.dayGanZhi;
    const z = hourZhiOf(h);
    const expHour = hourGan(exp[0], z) + z;
    rows.push({ h, mi, expDay: exp, actDay: act, expHour, actHour: p.siZhu.timeGanZhi });
    rec('T5 子时换日-日柱', `2026-10-27 ${h}:${String(mi).padStart(2, '0')}`, exp, act, '默认晚子时 23:00 换日');
    rec('T5 子时换日-时柱', `2026-10-27 ${h}:${String(mi).padStart(2, '0')}`, expHour, p.siZhu.timeGanZhi);
  }
  for (const [h, mi] of [[0, 0], [0, 59], [1, 0]]) {
    const exp = dayGZ(2026, 10, 27);
    const p = callPaipan(2026, 10, 27, h, mi);
    const z = hourZhiOf(h);
    rec('T5 子时换日-日柱', `2026-10-27 ${h}:${String(mi).padStart(2, '0')}`, exp, p.siZhu.dayGanZhi);
    rec('T5 子时换日-时柱', `2026-10-27 ${h}:${String(mi).padStart(2, '0')}`, hourGan(exp[0], z) + z, p.siZhu.timeGanZhi);
  }
  fs.writeFileSync(path.join(DATA, 'calendar_zishi.json'), JSON.stringify(rows, null, 2));
  console.log('T5 子时边界：已记录');
}

/* ---------- T6 旬空：60 甲子全量 ---------- */
{
  let diff = 0, hit = 0;
  for (let i = 0; i < 60; i++) {
    // 找该日干支对应的日期（从 2026-01-01 起扫 60 天）
    const dt = new Date(Date.UTC(2026, 0, 1 + i));
    const y = dt.getUTCFullYear(), m = dt.getUTCMonth() + 1, d = dt.getUTCDate();
    const gz = dayGZ(y, m, d);
    const exp = xunKong(gz);
    const p = callPaipan(y, m, d, 12, 0);
    const act = p.xunKong;
    hit += 1;
    if (!rec('T6 旬空', `${y}-${m}-${d} ${gz}日`, exp, act)) diff += 1;
  }
  console.log(`T6 旬空 ${hit} 例：差异 ${diff}`);
}

/* ---------- T7 跨日/跨年：年末 23:59 与年初 00:01 ---------- */
{
  for (const [y, m, d, h, mi] of [[2026, 12, 31, 23, 59], [2027, 1, 1, 0, 1], [2026, 2, 3, 23, 30], [2026, 2, 4, 10, 0]]) {
    const p = callPaipan(y, m, d, h, mi);
    const expDay = h >= 23 ? dayGZ(y, m, d + 1) : dayGZ(y, m, d);
    rec('T7 跨日跨年', `${y}-${m}-${d} ${h}:${mi}`, expDay, p.siZhu.dayGanZhi,
      h >= 23 ? '晚子时 23:00 换日 → 预期次日日柱' : '');
  }
  console.log('T7 跨日跨年：已记录');
}

/* ---------- 汇总 ---------- */
const byCat = {};
for (const c of cases) {
  byCat[c.category] = byCat[c.category] || { total: 0, fail: 0 };
  byCat[c.category].total += 1;
  if (!c.pass) byCat[c.category].fail += 1;
}
const fails = cases.filter((c) => !c.pass);
fs.writeFileSync(path.join(OUT, '01_calendar.json'), JSON.stringify({
  generatedAt: new Date().toISOString(),
  summary: byCat,
  totalCases: cases.length,
  totalFail: fails.length,
  failures: fails,
}, null, 2));

// CSV
const csv = ['id,category,input,expected,actual,pass,note'];
for (const c of cases) {
  const esc = (s) => `"${String(s).replace(/"/g, '""')}"`;
  csv.push([c.id, esc(c.category), esc(c.input), esc(c.expected), esc(c.actual), c.pass, esc(c.note)].join(','));
}
fs.writeFileSync(path.join(DATA, '01_calendar_cases.csv'), csv.join('\n'));

console.log('\n=== 分类汇总 ===');
for (const [k, v] of Object.entries(byCat)) console.log(`${k}: ${v.total - v.fail}/${v.total} 通过, 差异 ${v.fail}`);
console.log(`\n总用例 ${cases.length}，差异 ${fails.length}`);
