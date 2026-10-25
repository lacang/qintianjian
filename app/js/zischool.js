// 晚子时流派开关：23 点换日（默认）/ 0 点换日（子正）
// 0 点流派实现：把 23:00-23:59 的输入原样改为同日 00:00-00:59 再排——
// 日柱自然落在当天、时柱自然是当日日干所遁之子（五鼠遁），一次调用全对齐，不做字段拼合。
// 边界注：若节气恰在当日 22:00-24:00 之间交节，月柱按同日 0 点口径取（极小概率，
// 流派内亦有分歧，不自动裁定，详见盘面 SOURCE_NOTE）。
import { paipan, solarToSiZhu, paiBazi } from '../vendor/liuyao-core.js';
import { cfg } from './state.js';

export function ziMode() { return cfg.lateZi === '00' ? '00' : '23'; }

function adj(input) {
  if (ziMode() === '00' && input.hour === 23) return { ...input, hour: 0 };
  return input;
}

export function siZhuZi(input) {
  return solarToSiZhu(adj(input));
}

export function paipanZi(input) {
  const p = paipan(adj(input));
  if (p.solar && input.hour === 23 && ziMode() === '00') {
    p.solar = { ...p.solar, hour: 23, minute: input.minute }; // 回显真实钟点
  }
  return p;
}

export function paiBaziZi(input) {
  const b = paiBazi(adj(input));
  if (b.solar && input.hour === 23 && ziMode() === '00') {
    b.solar = { ...b.solar, hour: 23, minute: input.minute };
  }
  return b;
}
