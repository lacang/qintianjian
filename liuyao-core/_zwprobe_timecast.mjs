/**
 * 时间起卦（梅花易数）探针：可复现性 / 未来时刻 / 时辰粒度 / 23 点换日 / 结构一致
 * 运行：cd liuyao-core && node _zwprobe_timecast.mjs
 */
globalThis.localStorage = {
  _d: {},
  getItem(k) { return Object.prototype.hasOwnProperty.call(this._d, k) ? this._d[k] : null; },
  setItem(k, v) { this._d[k] = String(v); },
  removeItem(k) { delete this._d[k]; },
  clear() { this._d = {}; },
};

const { castByTime, castManual, paipan } = await import('../app/vendor/liuyao-core.js');

let pass = 0, fail = 0;
const ok = (name, cond, extra = '') => {
  if (cond) { pass++; console.log('  ✓', name); }
  else { fail++; console.log('  ✗', name, '|', extra); }
};
const dt = (s) => {
  const [y, mo, da, h, mi] = s.split(/[-: ]/).map(Number);
  return new Date(y, mo - 1, da, h, mi, 0, 0);
};
const guaName = (r) => paipan({ yaoValues: r.cast.yaoValues, year: 2026, month: 1, day: 1, hour: 12, minute: 0 }).benGua.name;
const yaoStr = (r) => r.cast.yaoValues.map((v) => (v === 7 || v === 9 ? '阳' : '阴')).join('');
const brief = (r) =>
  `上${r.upperNumber}下${r.lowerNumber}动${r.movingPosition} 农历${r.lunarMonth}月${r.lunarDay}日 年支${r.yearBranchOrder} 时支${r.hourBranchOrder} [${r.cast.yaoValues.join(',')}]`;
const same = (x, y) => JSON.stringify(x.cast) === JSON.stringify(y.cast);

console.log('[1] 可复现：同一时刻两次结果完全一致');
const a1 = castByTime(dt('2026-11-11 10:00'));
const a2 = castByTime(dt('2026-11-11 10:00'));
ok('同刻同卦（cast 全等）', same(a1, a2));
ok('同刻同参数', brief(a1) === brief(a2));

console.log('[2] 未来时刻可起卦（2026-11-11 10:00）');
ok('正常出卦', !!(a1.cast && a1.cast.yaoValues && a1.cast.yaoValues.length === 6));
console.log('    →', guaName(a1), '|', brief(a1));

console.log('[3] 时辰粒度：9:00 / 10:00 / 10:59 同卦，11:00 换卦');
const t0900 = castByTime(dt('2026-11-11 09:00'));
const t1000 = castByTime(dt('2026-11-11 10:00'));
const t1059 = castByTime(dt('2026-11-11 10:59'));
const t1100 = castByTime(dt('2026-11-11 11:00'));
ok('9:00 = 10:00（同巳时）', same(t0900, t1000));
ok('10:00 = 10:59（同巳时）', same(t1000, t1059));
ok('11:00 换卦（巳→午）', !same(t1059, t1100), `${brief(t1059)} vs ${brief(t1100)}`);
console.log('    9:00', guaName(t0900), '| 11:00', guaName(t1100), '|', brief(t1100));

console.log('[4] 23 点换日：10-21 23:30 与 10-22 00:30 应同');
const n1 = castByTime(dt('2026-10-21 23:30'));
const n2 = castByTime(dt('2026-10-22 00:30'));
ok('农历月日同', n1.lunarMonth === n2.lunarMonth && n1.lunarDay === n2.lunarDay,
  `${n1.lunarMonth}/${n1.lunarDay} vs ${n2.lunarMonth}/${n2.lunarDay}`);
ok('年支同', n1.yearBranchOrder === n2.yearBranchOrder);
ok('卦同', same(n1, n2), `${brief(n1)} vs ${brief(n2)}`);
console.log('    23:30', guaName(n1), '|', brief(n1));

console.log('[5] 22:30 与 23:30 分属两日');
const e1 = castByTime(dt('2026-10-21 22:30'));
ok('农历日不同', e1.lunarDay !== n1.lunarDay, `${e1.lunarDay} vs ${n1.lunarDay}`);
ok('时支：22:30 亥(12) / 23:30 子(1)', e1.hourBranchOrder === 12 && n1.hourBranchOrder === 1,
  `${e1.hourBranchOrder} / ${n1.hourBranchOrder}`);
console.log('    22:30', guaName(e1), brief(e1), '| 23:30', guaName(n1), brief(n1));

console.log('[6] cast 结构与手录同源（同爻值 → 同卦）');
const vals = a1.cast.yaoValues;
const m = castManual(vals.map((v) => ({
  yinYang: v === 7 || v === 9 ? '阳' : '阴',
  moving: v === 6 || v === 9,
})));
ok('六爻逐位一致', JSON.stringify(m.yaoValues) === JSON.stringify(a1.cast.yaoValues));
ok('动爻一致', JSON.stringify(m.movingPositions) === JSON.stringify(a1.cast.movingPositions));
ok('同卦名', paipan({ yaoValues: m.yaoValues, year: 2026, month: 1, day: 1, hour: 12, minute: 0 }).benGua.name === guaName(a1));

console.log('[7] 边界：闰月 / 跨年 / 月末不炸');
for (const s of ['2028-06-15 12:00', '2026-12-31 23:40', '2027-01-01 00:20', '2026-02-28 23:10']) {
  const r = castByTime(dt(s));
  ok(`${s} → ${r.cast.yaoValues.join(',')}`,
    !!(r.cast && r.cast.yaoValues.length === 6 && r.lunarMonth >= 1 && r.lunarMonth <= 12 && r.lunarDay >= 1 && r.lunarDay <= 30));
}

console.log(`\n=== 时间起卦探针：${pass}/${pass + fail} 通过 ===`);
process.exit(fail ? 1 : 0);
