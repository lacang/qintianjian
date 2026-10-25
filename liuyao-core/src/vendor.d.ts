/**
 * 第三方库的最小类型补丁
 */

/** lunar-javascript 未随包提供 .d.ts（MIT，6tail）；此处只声明本项目实际用到的 API。 */
declare module 'lunar-javascript' {
  export class Solar {
    static fromYmdHms(
      year: number,
      month: number,
      day: number,
      hour: number,
      minute: number,
      second: number,
    ): Solar;
    getLunar(): Lunar;
    toYmd(): string;
    /** 相对本日加减天数，返回新的 Solar（运行时确实存在，原包无 .d.ts 故此处补声明） */
    next(days: number): Solar;
  }

  export class Lunar {
    toString(): string;
    getYearInGanZhiExact(): string;
    getMonthInGanZhiExact(): string;
    getDayInGanZhiExact(): string;
    getTimeInGanZhi(): string;
    getDayXunKong(): string;
    /** 农历月（1-12；闰月为负数） */
    getMonth(): number;
    /** 农历日（1-30） */
    getDay(): number;
    getMonthInChinese(): string;
    getDayInChinese(): string;
    /** 建除十二神 */
    getZhiXing(): string;
    getPrevJieQi(): JieQi;
    getNextJieQi(): JieQi;
    getEightChar(): EightChar;
  }

  export class EightChar {
    setSect(sect: 1 | 2): void;
    getYear(): string;
    getMonth(): string;
    getDay(): string;
    getTime(): string;
    // 天干十神（相对日主）
    getYearShiShenGan(): string;
    getMonthShiShenGan(): string;
    getDayShiShenGan(): string;
    getTimeShiShenGan(): string;
    // 地支藏干十神（本气→中气→余气）
    getYearShiShenZhi(): string[];
    getMonthShiShenZhi(): string[];
    getDayShiShenZhi(): string[];
    getTimeShiShenZhi(): string[];
    // 纳音
    getYearNaYin(): string;
    getMonthNaYin(): string;
    getDayNaYin(): string;
    getTimeNaYin(): string;
    // 旬空
    getDayXun(): string;
    getDayXunKong(): string;
    getYearXunKong(): string;
    // 胎元 / 胎息 / 命宫 / 身宫
    getTaiYuan(): string;
    getTaiXi(): string;
    getMingGong(): string;
    getShenGong(): string;
    /** gender: 1 男 / 0 女 */
    getYun(gender: 0 | 1, sect?: number): Yun;
  }

  export class Yun {
    getStartYear(): number;
    getStartMonth(): number;
    getStartDay(): number;
    getStartSolar(): Solar;
    /** 返回约 n 步大运；索引 0 为起运前（干支同月柱），1 起为正式大运 */
    getDaYun(n?: number): DaYun[];
  }

  export class DaYun {
    getGanZhi(): string;
    getStartYear(): number;
    getEndYear(): number;
    getStartAge(): number;
    getEndAge(): number;
    getLiuNian(n?: number): LiuNian[];
  }

  export class LiuNian {
    getYear(): number;
    getGanZhi(): string;
  }

  export class JieQi {
    getName(): string;
    toString(): string;
  }
}
