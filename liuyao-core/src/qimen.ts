/**
 * 奇门遁甲（时家·转盘·拆补法·中五永远寄坤二）
 *
 * 排盘底座 vendoring 自 bigfishmarquis-qimen@1.0.0（MIT，鲲侯），零第三方运行时依赖，
 * 见 src/vendor/bigfish-qimen/LICENSE。该引擎在元亨利贞网在线金标准 7 盘（含伏吟局
 * 值使转宫难点）逐格 100% 命中，详见 对标素材/引擎对账报告_奇门.md。
 *
 * 历算仍统一用 lunar-javascript：
 * - 四柱走 Exact（与六爻 calendar.ts 一致）；
 * - 定局节气走【日归属】口径——交节当天整日归新节气，用非 Exact getPrevJieQi()。
 *   这正是元亨利贞在线默认（例：2026-01-05 16:23 交小寒，当天 08:00 仍排冬至阳一局，
 *   当天 20:00 才排小寒）。注意与四柱的 Exact 口径不同，二者用途不同，不可混用。
 *
 * 首版只做时家转盘拆补；不做置闰/茅山/飞盘/日月年家；不做格局吉凶解读（只排盘报事实）。
 */
import { Solar } from 'lunar-javascript';
import { chaiBuJuByGanZhi } from './vendor/bigfish-qimen/engines/chaibuquju.js';
import { shiJiaGenerate } from './vendor/bigfish-qimen/engines/shijia.js';
import type { QimenChart, QimenPalace } from './vendor/bigfish-qimen/types.js';

export interface QiMenInput {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute?: number;
}

export interface QiMenPan {
  siZhu: { year: string; month: string; day: string; time: string };
  /** 定局所用节气（日归属） */
  jieQi: string;
  dun: '阳遁' | '阴遁';
  ju: number;
  yuan: string; // 上元/中元/下元
  zhiFu: { star: string; palace: number };
  zhiShi: { door: string; palace: number };
  timeKongWang: string[];
  /** 九宫，按 palaceNumber 1..9（洛书：坎1坤2震3巽4中5乾6兑7艮8离9） */
  palaces: QimenPalace[];
  _chart: QimenChart;
}

/**
 * 时家奇门排盘（转盘·拆补）。
 * 真太阳时校正由上层完成后传入对应北京墙钟分量（与六爻一致）。
 */
export function paiQiMen(input: QiMenInput): QiMenPan {
  const { year, month, day, hour } = input;
  const minute = input.minute ?? 0;

  const lunar = Solar.fromYmdHms(year, month, day, hour, minute, 0).getLunar();
  const y = lunar.getYearInGanZhiExact();
  const m = lunar.getMonthInGanZhiExact();
  const d = lunar.getDayInGanZhiExact();
  const t = lunar.getTimeInGanZhi();

  // 定局节气：日归属口径（非 Exact）。
  const jieQi = lunar.getPrevJieQi().getName();

  // 拆补定局（bigfish 内部已处理 23:00+ 换日；本项目晚子时统一口径见 TODO）
  const ju = chaiBuJuByGanZhi(jieQi, d.charAt(0), d.charAt(1), hour);

  const chart = shiJiaGenerate(
    t.charAt(0),
    t.charAt(1),
    ju.juNumber,
    ju.isYangDun ? 'yang' : 'yin',
    {
      year: { gan: y.charAt(0), zhi: y.charAt(1) },
      month: { gan: m.charAt(0), zhi: m.charAt(1) },
      day: { gan: d.charAt(0), zhi: d.charAt(1) },
      hour: { gan: t.charAt(0), zhi: t.charAt(1) },
    },
    jieQi,
  );

  return {
    siZhu: { year: y, month: m, day: d, time: t },
    jieQi,
    dun: ju.isYangDun ? '阳遁' : '阴遁',
    ju: ju.juNumber,
    yuan: `${ju.yuan}元`,
    zhiFu: { star: chart.zhiFuStar, palace: chart.zhiFuPalace },
    zhiShi: { door: chart.zhiShiDoor, palace: chart.zhiShiPalace },
    timeKongWang: chart.kongWang,
    palaces: [...chart.palaces].sort((a, b) => a.palaceNumber - b.palaceNumber),
    _chart: chart,
  };
}
