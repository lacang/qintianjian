/**
 * 八字（四柱）模块
 *
 * 历算与大运仍以 lunar-javascript（MIT）为底座；四柱采用精确节气口径（与 calendar.ts 一致）。
 * 十神、地支藏干、五行统计为本文件自算（京房/子平通行规则），便于单测锁定、不依赖库内命名。
 *
 * 口径：
 * - 真太阳时由上层校正后传入（本模块直接按北京时间分量解释 input）。
 * - 节气换月用 Exact；晚子时沿用 lunar 默认（未 setSect(2)），TODO 见 calendar.ts。
 * - 大运：阳男阴女顺排、阴男阳女逆排，起运岁数取 lunar Yun；本模块每步大运附干支与起止年份/岁数。
 */
import { Solar } from 'lunar-javascript';
import type { SolarDateInput, TianGan, DiZhi, WuXing } from './types.js';

export type Gender = '男' | '女';

export interface BaziInput extends SolarDateInput {
  gender: Gender;
}

export interface HiddenGan {
  gan: TianGan;
  tenGod: string; // 相对日主的十神
  role: '本气' | '中气' | '余气';
}

export interface Pillar {
  ganZhi: string;
  gan: TianGan;
  zhi: DiZhi;
  ganWuXing: WuXing;
  zhiWuXing: WuXing;
  ganTenGod: string; // 天干十神；日柱为「日主」
  hidden: HiddenGan[];
  naYin: string;
}

export interface DaYunItem {
  ganZhi: string;
  startYear: number;
  endYear: number;
  startAge: number;
  endAge: number;
}

export interface BaziResult {
  solar: BaziInput;
  gender: Gender;
  year: Pillar;
  month: Pillar;
  day: Pillar;
  time: Pillar;
  dayMaster: TianGan; // 日主（日元）天干
  dayMasterWuXing: WuXing;
  xunKong: [DiZhi, DiZhi]; // 日空亡
  taiYuan: string; // 胎元
  taiXi: string; // 胎息
  mingGong: string; // 命宫
  shenGong: string; // 身宫
  daYun: {
    direction: '顺行' | '逆行';
    startSolar: string; // 起运公历日
    startText: string; // 起运描述
    list: DaYunItem[];
  };
  wuXingCount: Record<WuXing, number>; // 含天干本气+地支藏干（本中余各计1）
}

const TIANGAN = ['甲', '乙', '丙', '丁', '戊', '己', '庚', '辛', '壬', '癸'] as const;
const DIZHI = ['子', '丑', '寅', '卯', '辰', '巳', '午', '未', '申', '酉', '戌', '亥'] as const;

const GAN_WX: Record<TianGan, WuXing> = {
  甲: '木', 乙: '木', 丙: '火', 丁: '火', 戊: '土',
  己: '土', 庚: '金', 辛: '金', 壬: '水', 癸: '水',
};
const GAN_YIN_YANG: Record<TianGan, '阳' | '阴'> = {
  甲: '阳', 丙: '阳', 戊: '阳', 庚: '阳', 壬: '阳',
  乙: '阴', 丁: '阴', 己: '阴', 辛: '阴', 癸: '阴',
};
// 地支本气五行（用于五行旺相/统计的本气列）
const ZHI_WX: Record<DiZhi, WuXing> = {
  子: '水', 丑: '土', 寅: '木', 卯: '木', 辰: '土', 巳: '火',
  午: '火', 未: '土', 申: '金', 酉: '金', 戌: '土', 亥: '水',
};
// 地支藏干（本气、中气、余气；通行表）
const ZHI_HIDE: Record<DiZhi, TianGan[]> = {
  子: ['癸'],
  丑: ['己', '癸', '辛'],
  寅: ['甲', '丙', '戊'],
  卯: ['乙'],
  辰: ['戊', '乙', '癸'],
  巳: ['丙', '庚', '戊'],
  午: ['丁', '己'],
  未: ['己', '丁', '乙'],
  申: ['庚', '壬', '戊'],
  酉: ['辛'],
  戌: ['戊', '辛', '丁'],
  亥: ['壬', '甲'],
};

/** 十神：以日干为我，比较与目标干的阴阳同异与五行生克。 */
export function tenGod(dayGan: TianGan, target: TianGan): string {
  if (target === dayGan) return '比肩';
  const sameYY = GAN_YIN_YANG[dayGan] === GAN_YIN_YANG[target];
  const mine = GAN_WX[dayGan];
  const other = GAN_WX[target];

  if (other === mine) return sameYY ? '比肩' : '劫财';
  // 我生者（食伤）
  if (SHENG[mine] === other) return sameYY ? '食神' : '伤官';
  // 克我者（官杀）
  if (KE[other] === mine) return sameYY ? '七杀' : '正官';
  // 我克者（财）
  if (KE[mine] === other) return sameYY ? '偏财' : '正财';
  // 生我者（印）
  if (SHENG[other] === mine) return sameYY ? '偏印' : '正印';
  return '';
}

const SHENG: Record<WuXing, WuXing> = { 木: '火', 火: '土', 土: '金', 金: '水', 水: '木' };
const KE: Record<WuXing, WuXing> = { 木: '土', 土: '水', 水: '火', 火: '金', 金: '木' };

function buildPillar(ganZhi: string, dayGan: TianGan, naYin: string, isDay: boolean): Pillar {
  const gan = ganZhi.charAt(0) as TianGan;
  const zhi = ganZhi.charAt(1) as DiZhi;
  const hides = ZHI_HIDE[zhi];
  const roles: HiddenGan['role'][] = ['本气', '中气', '余气'];
  return {
    ganZhi,
    gan,
    zhi,
    ganWuXing: GAN_WX[gan],
    zhiWuXing: ZHI_WX[zhi],
    ganTenGod: isDay ? '日主' : tenGod(dayGan, gan),
    hidden: hides.map((g, i) => ({ gan: g, tenGod: tenGod(dayGan, g), role: roles[i] })),
    naYin,
  };
}

export function paiBazi(input: BaziInput): BaziResult {
  const { year, month, day, hour, gender } = input;
  const minute = input.minute ?? 0;
  const lunar = Solar.fromYmdHms(year, month, day, hour, minute, 0).getLunar();
  const ec = lunar.getEightChar();

  const yearGZ = lunar.getYearInGanZhiExact();
  const monthGZ = lunar.getMonthInGanZhiExact();
  const dayGZ = lunar.getDayInGanZhiExact();
  const timeGZ = lunar.getTimeInGanZhi();
  const dayGan = dayGZ.charAt(0) as TianGan;

  const xk = lunar.getDayXunKong();
  const xunKong = [xk.charAt(0), xk.charAt(1)] as [DiZhi, DiZhi];

  const pillars = {
    year: buildPillar(yearGZ, dayGan, ec.getYearNaYin(), false),
    month: buildPillar(monthGZ, dayGan, ec.getMonthNaYin(), false),
    day: buildPillar(dayGZ, dayGan, ec.getDayNaYin(), true),
    time: buildPillar(timeGZ, dayGan, ec.getTimeNaYin(), false),
  };

  // 五行统计：四个天干各计本气 1；四支藏干（本/中/余）各计 1
  const count: Record<WuXing, number> = { 金: 0, 木: 0, 水: 0, 火: 0, 土: 0 };
  [pillars.year, pillars.month, pillars.day, pillars.time].forEach((p) => {
    count[p.ganWuXing] += 1;
    p.hidden.forEach((h) => { count[GAN_WX[h.gan]] += 1; });
  });

  // 大运
  const genderCode: 0 | 1 = gender === '男' ? 1 : 0;
  // 顺逆：阳年男/阴年女 顺；阴年男/阳年女 逆。年干阴阳定。
  const yearGan = yearGZ.charAt(0) as TianGan;
  const yearYang = GAN_YIN_YANG[yearGan] === '阳';
  const forward = gender === '男' ? yearYang : !yearYang;

  const yun = ec.getYun(genderCode);
  const raw = yun.getDaYun(11);
  const list: DaYunItem[] = [];
  for (let i = 1; i < raw.length; i++) {
    const d = raw[i];
    const gz = d.getGanZhi();
    if (!gz) continue;
    list.push({
      ganZhi: gz,
      startYear: d.getStartYear(),
      endYear: d.getEndYear(),
      startAge: d.getStartAge(),
      endAge: d.getEndAge(),
    });
  }

  return {
    solar: input,
    gender,
    year: pillars.year,
    month: pillars.month,
    day: pillars.day,
    time: pillars.time,
    dayMaster: dayGan,
    dayMasterWuXing: GAN_WX[dayGan],
    xunKong,
    taiYuan: ec.getTaiYuan(),
    taiXi: ec.getTaiXi(),
    mingGong: ec.getMingGong(),
    shenGong: ec.getShenGong(),
    daYun: {
      direction: forward ? '顺行' : '逆行',
      startSolar: yun.getStartSolar().toYmd(),
      startText: `${yun.getStartYear()}年${yun.getStartMonth()}月${yun.getStartDay()}天`,
      list,
    },
    wuXingCount: count,
  };
}

// 流年干支序列：按 60 甲子循环，从指定起始年向前推 years 个。
export function liuNianGanZhiSequence(fromYear: number, years: number): Array<{ year: number; ganZhi: string }> {
  // 已知基准：甲子年 4 (AD), 60 甲子循环
  const TG: TianGan[] = ['甲','乙','丙','丁','戊','己','庚','辛','壬','癸'];
  const DZ: DiZhi[] = ['子','丑','寅','卯','辰','巳','午','未','申','酉','戌','亥'];
  const idx0 = ((fromYear - 4) % 60 + 60) % 60;
  const out: Array<{ year: number; ganZhi: string }> = [];
  for (let i = 0; i < years; i++) {
    const idx = (idx0 + i + 60) % 60;
    out.push({ year: fromYear + i, ganZhi: `${TG[idx % 10]}${DZ[idx % 12]}` });
  }
  return out;
}
