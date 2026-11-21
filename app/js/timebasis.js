/**
 * 「时间口径」一行的唯一格式化器。
 *
 * 由来（audit4 · r2_crosspan P0-1/P0-2）：各盘曾各写一份时间逻辑，界面上也各说各话——
 * 同一个时刻，用户在八字页看到「真太阳时 10:04」、在奇门页看到「12:00」既没解释也不告警。
 * 现在所有盘的时间都由内核 `resolvePaipanTime()`（liuyao-core/src/timeSync.ts）算完，
 * 这行文案只负责把那份结果说清楚：钟面 / 真太阳时（或标准时）/ 夏令时 / 时区 / 跨日 / 换日。
 *
 * 只做展示，不参与任何计算；传入的必须是 `PaipanTimeState`。
 */
const p2 = (n) => String(n).padStart(2, '0');

/**
 * @param {object} ts   resolvePaipanTime() 的返回值
 * @param {{boundary?: string}} [opts] boundary：换日口径标注（如「23 点（子初）换日」）
 * @returns {string} 如「钟面 13:30 · 真太阳时 12:37 · 夏令时已还原 · UTC+9」
 */
export function timeBasis(ts, opts = {}) {
  if (!ts || !ts.clock) return '';
  const bits = [`钟面 ${p2(ts.clock.hour)}:${p2(ts.clock.minute)}`];
  if (ts.usedTrueSolar && ts.trueSolar) {
    bits.push(`真太阳时 ${p2(ts.trueSolar.hour)}:${p2(ts.trueSolar.minute)}`);
  } else if (ts.standard && (ts.standard.hour !== ts.clock.hour || ts.standard.minute !== ts.clock.minute)) {
    bits.push(`标准时 ${p2(ts.standard.hour)}:${p2(ts.standard.minute)}`);
  } else {
    bits.push('未折真太阳时');
  }
  if (ts.inDst) bits.push('夏令时已还原');
  if (typeof ts.utcOffsetHours === 'number') {
    bits.push(`UTC${ts.utcOffsetHours >= 0 ? '+' : ''}${ts.utcOffsetHours}`);
  }
  if (ts.crossedDay) bits.push(`折算后已跨日（${ts.civil.year}-${p2(ts.civil.month)}-${p2(ts.civil.day)}）`);
  if (ts.dayAdvanced) bits.push('过 23:00 子初换日，日柱已进次日');
  if (ts.lateZiApplied) bits.push('23 点按子正口径归当日早子');
  if (opts.boundary) bits.push(opts.boundary);
  return bits.join(' · ');
}

export default timeBasis;
