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
import { civilForPaipan, lateZiLabel, type PaipanCivil, type TimeResolveInput } from './timeContext.js';
import { mergeWarnings } from './validate.js';

/**
 * 奇门入参 = 统一时间层入参。
 * 老调用方只给年月日时，与以前逐字节一致；给 city/经纬度/utcOffsetHours 就自动吃
 * 夏令时 + 真太阳时 + 时区（以前完全不接，乌鲁木齐 12:52 会按钟面直接当时辰）。
 */
export type QiMenInput = TimeResolveInput;

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
  /** 实际用于起局的钟面时间（真太阳时/夏令时/换日口径已生效） */
  civil: PaipanCivil;
  /** 换日口径标注（如「23 点（子初）换日」） */
  dayBoundary: string;
  /** 时间口径提示（时区估算、经纬度冲突、夏令时…），界面应显示 */
  timeWarnings: string[];
  /** 入参校验/口径提示（小数时间取整、历史时区、strict:false 的 0 点回退） */
  warnings: string[];
  _chart: QimenChart;
}

/**
 * 时家奇门排盘（转盘·拆补）。
 * 时间统一走 civilForPaipan：给城市/经纬度就算真太阳时与夏令时，与八字、六爻同口径。
 */
export function paiQiMen(input: QiMenInput): QiMenPan {
  const eff = civilForPaipan(input, { yearRange: 'calendar', label: '起局时间' });
  const { year, month, day, hour } = eff.civil;
  const minute = eff.civil.minute ?? 0;
  // 秒必须透传：节气交节精确到秒（虽本模块定局按日归属，但四柱 Exact 用得到）
  const second = eff.civil.second ?? 0;

  const lunar = Solar.fromYmdHms(year, month, day, hour, minute, second).getLunar();
  const y = lunar.getYearInGanZhiExact();
  const m = lunar.getMonthInGanZhiExact();
  const d = lunar.getDayInGanZhiExact();
  const t = lunar.getTimeInGanZhi();

  // 定局节气：日归属口径（非 Exact）。
  const jieQi = lunar.getPrevJieQi().getName();

  // 拆补定局。口径（唯一换日点）：
  // - 拆补按「日」取符头，晚子时（23:00 起）归次日——这一步由 vendor 按 hour>=23 内部 +1；
  // - 因此这里必须传【未换日】的普通日柱 getDayInGanZhi()（00:00 换日），
  //   绝不能传上面已按 23:00 换日的 d（getDayInGanZhiExact），否则 23:00–23:59 会位移两次
  //   （癸日尤其明显：同一子时 23:30 与次日 00:30 会给出不同的元/局）。
  // - 四柱仍用 Exact（与六爻 calendar.ts 一致），二者用途不同。
  // lunar-javascript 的 .d.ts 补丁未声明 getDayInGanZhi，运行时存在；按 calendar.ts 既有写法做断言。
  const lunarAny = lunar as unknown as { getDayInGanZhi(): string };
  const dayPlain = lunarAny.getDayInGanZhi();
  const ju = chaiBuJuByGanZhi(jieQi, dayPlain.charAt(0), dayPlain.charAt(1), hour);

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
    civil: eff.civil,
    dayBoundary: lateZiLabel(eff.lateZiMode),
    timeWarnings: eff.resolution ? eff.resolution.warnings : [],
    warnings: mergeWarnings(eff.warnings, eff.resolution?.warnings),
    _chart: chart,
  };
}
