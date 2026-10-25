/**
 * 子午流注（纳子法 / 十二正经当令）
 *
 * 只做历法事实：给出某时刻所处十二辰、当令经络（气血旺经）与对应脏腑表里。
 * 不做纳子法开穴（五输穴按时取穴）——那属于治疗操作，本工作台只排盘/报事实。
 *
 * 十二辰对应（北京时间，23:00 入次日子时；真太阳时由上层先校正再传入小时）：
 *   子 23-1 胆 ｜ 丑 1-3 肝 ｜ 寅 3-5 肺 ｜ 卯 5-7 大肠
 *   辰 7-9 胃 ｜ 巳 9-11 脾 ｜ 午 11-13 心 ｜ 未 13-15 小肠
 *   申 15-17 膀胱 ｜ 酉 17-19 肾 ｜ 戌 19-21 心包 ｜ 亥 21-23 三焦
 */

export interface MeridianInfo {
  /** 时辰支名 */
  zhi: string;
  /** 时辰序号 子0…亥11 */
  zhiIndex: number;
  /** 该时辰钟点区间串，如 "23:00–01:00" */
  range: string;
  /** 当令经络（全名，手/足+阴阳+五行+经） */
  meridian: string;
  /** 简称经名，如 胆 */
  jing: string;
  /** 对应脏腑（脏/腑） */
  organ: string;
  /** 五行 */
  wuXing: string;
  /** 表里配对经络名 */
  paired: string;
  /** 下一辰（换经）支名 */
  nextZhi: string;
  /** 距下一辰换经的分钟数（基于传入时刻） */
  minutesToNext: number;
}

const ZHI = ['子', '丑', '寅', '卯', '辰', '巳', '午', '未', '申', '酉', '戌', '亥'];
const RANGE = ['23-1', '1-3', '3-5', '5-7', '7-9', '9-11', '11-13', '13-15', '15-17', '17-19', '19-21', '21-23'];

interface Row { jing: string; meridian: string; organ: string; wuXing: string; paired: string }
const TABLE: Row[] = [
  { jing: '胆', meridian: '足少阳胆经', organ: '胆（腑）', wuXing: '木', paired: '足厥阴肝经' },
  { jing: '肝', meridian: '足厥阴肝经', organ: '肝（脏）', wuXing: '木', paired: '足少阳胆经' },
  { jing: '肺', meridian: '手太阴肺经', organ: '肺（脏）', wuXing: '金', paired: '手阳明大肠经' },
  { jing: '大肠', meridian: '手阳明大肠经', organ: '大肠（腑）', wuXing: '金', paired: '手太阴肺经' },
  { jing: '胃', meridian: '足阳明胃经', organ: '胃（腑）', wuXing: '土', paired: '足太阴脾经' },
  { jing: '脾', meridian: '足太阴脾经', organ: '脾（脏）', wuXing: '土', paired: '足阳明胃经' },
  { jing: '心', meridian: '手少阴心经', organ: '心（脏）', wuXing: '火', paired: '手太阳小肠经' },
  { jing: '小肠', meridian: '手太阳小肠经', organ: '小肠（腑）', wuXing: '火', paired: '手少阴心经' },
  { jing: '膀胱', meridian: '足太阳膀胱经', organ: '膀胱（腑）', wuXing: '水', paired: '足少阴肾经' },
  { jing: '肾', meridian: '足少阴肾经', organ: '肾（脏）', wuXing: '水', paired: '足太阳膀胱经' },
  { jing: '心包', meridian: '手厥阴心包经', organ: '心包（脏）', wuXing: '火', paired: '手少阳三焦经' },
  { jing: '三焦', meridian: '手少阳三焦经', organ: '三焦（腑）', wuXing: '火', paired: '手厥阴心包经' },
];

/** 由小时（0-23）求时辰序号：23 与 0 都属子(0)，其余 floor((h+1)/2) */
export function shichenIndex(hour: number, minute = 0): number {
  const h = hour + minute / 60;
  if (h >= 23 || h < 1) return 0;
  return Math.floor((h + 1) / 2);
}

/**
 * 取某时刻当令经络。
 * @param date 时刻（真太阳时校正请在调用前完成）
 */
export function getMeridian(date: Date): MeridianInfo {
  const idx = shichenIndex(date.getHours(), date.getMinutes());
  const row = TABLE[idx];

  // 计算距下一辰换经的分钟
  const h = date.getHours();
  const m = date.getMinutes();
  // 当前辰的结束整点：子跨 23→1
  let endHour: number;
  if (h === 23) endHour = 25; // 次日 1 点
  else if (h === 0) endHour = 1;
  else endHour = (Math.floor((h + 1) / 2) + 1) * 2 - 1; // 丑(1-3)->3 …
  const endTotal = endHour * 60;
  const curTotal = h * 60 + m;
  let minutesToNext = endTotal - curTotal;
  if (minutesToNext < 0) minutesToNext += 24 * 60;

  return {
    zhi: ZHI[idx],
    zhiIndex: idx,
    range: RANGE[idx].replace('-', ':00–') + ':00',
    jing: row.jing,
    meridian: row.meridian,
    organ: row.organ,
    wuXing: row.wuXing,
    paired: row.paired,
    nextZhi: ZHI[(idx + 1) % 12],
    minutesToNext,
  };
}
