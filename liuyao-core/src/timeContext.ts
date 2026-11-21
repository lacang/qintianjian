/**
 * 统一时间层（timeContext）—— 时区 / 夏令时 / 真太阳时
 *
 * 为什么要有这一层：
 *   以前每个盘各自「本地墙钟 + 写死 +8」，同一时刻标上海 / UTC / 纽约会出三张不同的盘，
 *   1986–1991 中国夏令时、真太阳时（经度差 + 均时差）更是完全没进来。
 *   这里把它收成唯一真相源：输入「用户看到的钟面时间 + 出生地」，输出
 *   UTC 绝对时刻、标准时、是否在夏令时、真太阳时、时区偏移与来源。
 *
 * 口径（勿改，改动要连带改 test/time-context.test.ts）：
 * 1. 中国境内（含新疆、西藏）1949-10-01 起一律 UTC+8 —— 这是官方时区，**不按经度拆**。
 *    所以乌鲁木齐钟面 12:00 的 UTC 时刻与北京一样，差的是真太阳时（约 2.1 小时），
 *    不是时区。**1949 年以前例外**：1912–1949 中国分五时区（中原 +8 / 陇蜀 +7 /
 *    新藏 +6 / 昆仑 +5.5 / 长白 +8.5），按城市历史表 `CHINA_HIST_TZ` 折算并写 warning，
 *    不再静默 +8（实测成都 1930、乌鲁木齐 1940、拉萨 1940 各差一个时辰）。
 * 2. 境外按城市查表（CITY_TZ_TABLE，150+ 城市）。夏令时规则硬编：
 *    EU / US / AU / NZ / CL / IL 六套，外加中国 1986–1991 专用表（chinaDstWindow）。
 *    EU 自 1996、US 自 2007 起才用现行起止规则，更早年份标 warnings（近似）。
 * 3. 夏令时的「命中」按**标准时墙钟**判定：民用钟面减 1 小时后落在窗口内即为夏令时。
 *    窗口一律写成标准时口径 [起 02:00, 止 01:00)——止点 01:00 标准时 = 02:00 夏令时，
 *    正是回拨那一刻。这样夏令时首日不存在的那一小时、末日重复的那一小时都有确定答案：
 *    重复的一小时按夏令时算（用户看的是回拨前的钟）。
 * 4. 真太阳时 = 标准时 + 经度差 + 均时差
 *      经度差 = (经度 − 时区中央经线) × 4 分
 *      均时差 = 真太阳 − 平太阳（astronomy-engine 视赤经推，年内约 −14 ~ +16 分）
 *    真太阳时是**命理口径**（四柱、时辰），不是天文排盘口径：占星/吠陀的宫位仍用
 *    UTC 绝对时刻 + 经纬度，绝不能拿真太阳时再去折算 UT（会把经度算两遍）。
 * 5. 纯函数、零依赖浏览器 API，Node / 浏览器 / Service Worker 均可直接调用。
 */
import { Body, Equator, Observer } from 'astronomy-engine';
import {
  validateDateTime, validateGeo, utcMsOf, type YearRangeId,
} from './validate.js';
import { tzOverrideWindow, tzOverrideNote } from './tz-data.js';

/** 民用时钟面分量（本地钟，即用户看到的时间） */
export interface CivilTime {
  year: number;
  month: number;   // 1..12
  day: number;     // 1..31
  hour: number;    // 0..23
  minute: number;  // 0..59
  second: number;  // 0..59
}

/** 夏令时规则标识 */
export type DstRuleId =
  | 'none' | 'CN1986' | 'EU' | 'US' | 'AU' | 'NZ' | 'CL' | 'IL'
  /** `TZ:<IANA 名>`：交给 tz-data.ts 的覆盖表（近年改过规则的国家） */
  | `TZ:${string}`;

/**
 * 晚子时（23:00–23:59）换日口径。四家用的是同一组传统分歧，不是各术数特有的：
 *  - '23' 子初换日（通行口径，也是本应用默认）：23:00 一交子时即进位次日，
 *         日柱/农历日/时柱一起提前换，奇门的三元符头也跟着走。
 *  - '00' 子正换日（夜子时留当日）：23:00–23:59 仍按出生当日算，时支取子、
 *         时干按当日日干起（等价于把这一段当成次日的早子时来排）。
 * 无论哪种，同一个盘面上「日柱」与「时柱」必须来自同一口径——这是硬约束。
 */
export type LateZiMode = '23' | '00';

/** 换日口径在人话里的名字（界面标注用） */
export function lateZiLabel(mode?: LateZiMode): string {
  return mode === '00' ? '0 点（子正）换日' : '23 点（子初）换日';
}

/** 城市 → 时区表的一行 */
export interface CityTimeZone {
  /** 中文名（界面展示、查表主键） */
  name: string;
  /** 英文名（查表别名） */
  en: string;
  /** 国家 / 地区 */
  country: string;
  /** IANA 时区名（展示与排查用，不参与换算） */
  tz: string;
  /** 纬度（北正） */
  lat: number;
  /** 经度（东正） */
  lon: number;
  /** 标准时偏移（小时，不含夏令时） */
  stdOffset: number;
  /** 夏令时规则 */
  dst: DstRuleId;
}

export interface TimeResolveInput {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute?: number;
  second?: number;
  /** 出生地城市（中/英文均可，也可直接给「辽宁沈阳」这类含城市的串） */
  city?: string;
  /** 地点描述（与 city 同等对待，作为城市查表的兜底输入） */
  place?: string;
  /** 纬度（北正） */
  lat?: number;
  latitude?: number;
  /** 经度（东正） */
  lon?: number;
  lonEast?: number;
  longitude?: number;
  /** 显式时区偏移（小时）：给了就**优先用它**，跳过城市查表（夏令时不再叠加） */
  utcOffsetHours?: number;
  /** 是否算真太阳时（默认 true） */
  trueSolarTime?: boolean;
  /**
   * 时区推断策略（只在「没给城市、也没给 utcOffsetHours」时起作用）：
   *  - 'estimate'（默认）按经纬度推算，返回 tzEstimated=true 并要求前端提示；
   *  - 'strict' 推算不可靠时直接抛错，宁可拒绝排盘也不静默算错。
   */
  tzPolicy?: 'estimate' | 'strict';
  /** true = 城市与经纬度冲突时以经纬度为准（默认以城市为准，因为时区由城市决定） */
  preferCoordinates?: boolean;
  /** 晚子时换日口径（默认 '23'） */
  lateZiMode?: LateZiMode;
  /**
   * 缺省 hour 时的行为（默认 true = 抛 InvalidTimeError）。
   * 传 false 则按 0 点排，并把「未提供小时，按 0 点计」写进 warnings。
   */
  strict?: boolean;
}

export interface TimeResolution {
  /** 本地民用时（用户录入的钟面时间，夏令时未扣） */
  civil: CivilTime;
  /** 民用时折成「墙钟当 UTC」的毫秒数（只用于比较，不是绝对时刻） */
  civilMs: number;
  /** 标准时（民用时扣掉夏令时后的钟面时间） */
  standard: CivilTime;
  /** 标准时折成墙钟毫秒（同上，仅比较用） */
  standardMs: number;
  /** UTC 绝对时刻（毫秒）—— 排盘、星历一律用它 */
  utcMs: number;
  /** UT 墙钟分量（caelus 等「吃 UT 分量」的引擎直接可用） */
  utc: CivilTime;
  /** 生效时区偏移（含夏令时，小时） */
  utcOffsetHours: number;
  /** 标准时区偏移（不含夏令时，小时） */
  baseUtcOffsetHours: number;
  /** 是否命中夏令时窗口 */
  inDst: boolean;
  /** 夏令时已从民用时扣掉的分（0 或 -60） */
  dstOffsetMinutes: number;
  /** 命中的夏令时窗口（标准时口径，含首尾日期与回拨时刻） */
  dstWindow: { startLocal: string; endLocal: string } | null;
  /** 时区来源 */
  tzSource: 'explicit' | 'city' | 'estimated' | 'fallback';
  /** 时区名（IANA；兜底/显式时给 UTC±HH:MM） */
  sourceTzName: string;
  /** true = 没查到城市、按东八区兜底（前端必须显示出来） */
  tzFallback: boolean;
  /**
   * true = 时区是由经纬度**推算**出来的（城市表没命中），不是权威值：
   * 前端必须显示「时区为估算」的警告，用户需要能补选城市/时区。
   */
  tzEstimated: boolean;
  /** 推算方式：最近城市 / 纯经度；没推算为 null */
  tzEstimateMethod: 'nearest-city' | 'longitude' | null;
  /** 推算依据离定位点多远（km，纯经度推算时为 null） */
  tzEstimateKm: number | null;
  /** 推算时参照的城市名（纯经度推算时为 null） */
  tzEstimateCity: string | null;
  /** true = 城市与经纬度互相矛盾（相距过远 / 经度与本时区不符），已按规则取舍 */
  geoConflict: boolean;
  /** 冲突说明（含两边的数值，便于用户判断该信哪一个） */
  geoConflictNote: string | null;
  /** 时区中央经线（东经为正，如北京时 120） */
  stdMeridian: number;
  /** 出生地经度（东正），缺省 null */
  longitude: number | null;
  /** 出生地纬度（北正），缺省 null */
  latitude: number | null;
  /** 真太阳时开关（入参，默认 true） */
  trueSolarTimeEnabled: boolean;
  /** 真太阳时（钟面分量），开关关掉或缺经度时为 null */
  trueSolar: CivilTime | null;
  /** 真太阳时相对标准时的总修正（分，含小数） */
  trueSolarOffsetMinutes: number | null;
  /** 其中经度差（分） */
  longitudeOffsetMinutes: number | null;
  /** 其中均时差（分） */
  equationOfTimeMinutes: number | null;
  /** 命中的城市名（未命中 null） */
  cityName: string | null;
  /** 需要提示给用户的口径说明（兜底、夏令时、近似规则等） */
  warnings: string[];
}

/* ============================================================
   一、城市 → 时区表
   ------------------------------------------------------------
   列：[中文名, 英文名, 国家/地区, IANA, 纬度, 经度, 标准偏移, 夏令时规则]
   坐标为城市中心近似值（误差 < 0.05°，真太阳时误差 < 15 秒），够命理用。
   ============================================================ */
type CityRow = [string, string, string, string, number, number, number, DstRuleId];

const CITY_ROWS: CityRow[] = [
  // —— 中国大陆：官方一律 +8（含新疆西藏），1986–1991 有夏令时 ——
  ['北京', 'beijing', '中国', 'Asia/Shanghai', 39.9042, 116.4074, 8, 'CN1986'],
  ['上海', 'shanghai', '中国', 'Asia/Shanghai', 31.2304, 121.4737, 8, 'CN1986'],
  ['广州', 'guangzhou', '中国', 'Asia/Shanghai', 23.1291, 113.2644, 8, 'CN1986'],
  ['深圳', 'shenzhen', '中国', 'Asia/Shanghai', 22.5431, 114.0579, 8, 'CN1986'],
  ['天津', 'tianjin', '中国', 'Asia/Shanghai', 39.0842, 117.2008, 8, 'CN1986'],
  ['重庆', 'chongqing', '中国', 'Asia/Shanghai', 29.5630, 106.5516, 8, 'CN1986'],
  ['成都', 'chengdu', '中国', 'Asia/Shanghai', 30.5728, 104.0668, 8, 'CN1986'],
  ['杭州', 'hangzhou', '中国', 'Asia/Shanghai', 30.2741, 120.1551, 8, 'CN1986'],
  ['南京', 'nanjing', '中国', 'Asia/Shanghai', 32.0603, 118.7969, 8, 'CN1986'],
  ['武汉', 'wuhan', '中国', 'Asia/Shanghai', 30.5928, 114.3055, 8, 'CN1986'],
  ['西安', 'xian', '中国', 'Asia/Shanghai', 34.3416, 108.9398, 8, 'CN1986'],
  ['沈阳', 'shenyang', '中国', 'Asia/Shanghai', 41.8057, 123.4315, 8, 'CN1986'],
  ['大连', 'dalian', '中国', 'Asia/Shanghai', 38.9140, 121.6147, 8, 'CN1986'],
  ['哈尔滨', 'harbin', '中国', 'Asia/Shanghai', 45.8038, 126.5349, 8, 'CN1986'],
  ['长春', 'changchun', '中国', 'Asia/Shanghai', 43.8171, 125.3235, 8, 'CN1986'],
  ['济南', 'jinan', '中国', 'Asia/Shanghai', 36.6512, 117.1201, 8, 'CN1986'],
  ['青岛', 'qingdao', '中国', 'Asia/Shanghai', 36.0671, 120.3826, 8, 'CN1986'],
  ['郑州', 'zhengzhou', '中国', 'Asia/Shanghai', 34.7466, 113.6254, 8, 'CN1986'],
  ['长沙', 'changsha', '中国', 'Asia/Shanghai', 28.2282, 112.9388, 8, 'CN1986'],
  ['南昌', 'nanchang', '中国', 'Asia/Shanghai', 28.6820, 115.8579, 8, 'CN1986'],
  ['合肥', 'hefei', '中国', 'Asia/Shanghai', 31.8206, 117.2272, 8, 'CN1986'],
  ['福州', 'fuzhou', '中国', 'Asia/Shanghai', 26.0745, 119.2965, 8, 'CN1986'],
  ['厦门', 'xiamen', '中国', 'Asia/Shanghai', 24.4798, 118.0894, 8, 'CN1986'],
  ['昆明', 'kunming', '中国', 'Asia/Shanghai', 25.0389, 102.7183, 8, 'CN1986'],
  ['贵阳', 'guiyang', '中国', 'Asia/Shanghai', 26.6470, 106.6302, 8, 'CN1986'],
  ['南宁', 'nanning', '中国', 'Asia/Shanghai', 22.8170, 108.3665, 8, 'CN1986'],
  ['海口', 'haikou', '中国', 'Asia/Shanghai', 20.0444, 110.1999, 8, 'CN1986'],
  ['三亚', 'sanya', '中国', 'Asia/Shanghai', 18.2528, 109.5119, 8, 'CN1986'],
  ['兰州', 'lanzhou', '中国', 'Asia/Shanghai', 36.0611, 103.8343, 8, 'CN1986'],
  ['西宁', 'xining', '中国', 'Asia/Shanghai', 36.6171, 101.7782, 8, 'CN1986'],
  ['银川', 'yinchuan', '中国', 'Asia/Shanghai', 38.4872, 106.2309, 8, 'CN1986'],
  ['乌鲁木齐', 'urumqi', '中国', 'Asia/Shanghai', 43.8256, 87.6168, 8, 'CN1986'],
  ['喀什', 'kashgar', '中国', 'Asia/Shanghai', 39.4704, 75.9898, 8, 'CN1986'],
  ['拉萨', 'lhasa', '中国', 'Asia/Shanghai', 29.6520, 91.1721, 8, 'CN1986'],
  ['呼和浩特', 'hohhot', '中国', 'Asia/Shanghai', 40.8414, 111.7519, 8, 'CN1986'],
  ['太原', 'taiyuan', '中国', 'Asia/Shanghai', 37.8706, 112.5489, 8, 'CN1986'],
  ['石家庄', 'shijiazhuang', '中国', 'Asia/Shanghai', 38.0428, 114.5149, 8, 'CN1986'],
  ['宁波', 'ningbo', '中国', 'Asia/Shanghai', 29.8683, 121.5440, 8, 'CN1986'],
  ['苏州', 'suzhou', '中国', 'Asia/Shanghai', 31.2989, 120.5853, 8, 'CN1986'],
  ['无锡', 'wuxi', '中国', 'Asia/Shanghai', 31.4912, 120.3119, 8, 'CN1986'],
  ['温州', 'wenzhou', '中国', 'Asia/Shanghai', 27.9938, 120.6994, 8, 'CN1986'],
  ['东莞', 'dongguan', '中国', 'Asia/Shanghai', 23.0207, 113.7518, 8, 'CN1986'],
  ['佛山', 'foshan', '中国', 'Asia/Shanghai', 23.0219, 113.1214, 8, 'CN1986'],
  ['珠海', 'zhuhai', '中国', 'Asia/Shanghai', 22.2710, 113.5767, 8, 'CN1986'],
  ['汕头', 'shantou', '中国', 'Asia/Shanghai', 23.3535, 116.6822, 8, 'CN1986'],
  ['洛阳', 'luoyang', '中国', 'Asia/Shanghai', 34.6197, 112.4540, 8, 'CN1986'],
  ['徐州', 'xuzhou', '中国', 'Asia/Shanghai', 34.2044, 117.2858, 8, 'CN1986'],
  ['烟台', 'yantai', '中国', 'Asia/Shanghai', 37.4638, 121.4479, 8, 'CN1986'],
  ['香港', 'hong kong', '中国香港', 'Asia/Hong_Kong', 22.3193, 114.1694, 8, 'none'],
  ['澳门', 'macau', '中国澳门', 'Asia/Macau', 22.1987, 113.5439, 8, 'none'],
  ['台北', 'taipei', '中国台湾', 'Asia/Taipei', 25.0330, 121.5654, 8, 'none'],
  ['高雄', 'kaohsiung', '中国台湾', 'Asia/Taipei', 22.6273, 120.3014, 8, 'none'],
  ['台中', 'taichung', '中国台湾', 'Asia/Taipei', 24.1477, 120.6736, 8, 'none'],

  // —— 东南亚（华人多） ——
  ['新加坡', 'singapore', '新加坡', 'Asia/Singapore', 1.3521, 103.8198, 8, 'none'],
  ['吉隆坡', 'kuala lumpur', '马来西亚', 'Asia/Kuala_Lumpur', 3.1390, 101.6869, 8, 'none'],
  ['槟城', 'penang', '马来西亚', 'Asia/Kuala_Lumpur', 5.4141, 100.3288, 8, 'none'],
  ['新山', 'johor bahru', '马来西亚', 'Asia/Kuala_Lumpur', 1.4927, 103.7414, 8, 'none'],
  ['曼谷', 'bangkok', '泰国', 'Asia/Bangkok', 13.7563, 100.5018, 7, 'none'],
  ['清迈', 'chiang mai', '泰国', 'Asia/Bangkok', 18.7883, 98.9853, 7, 'none'],
  ['雅加达', 'jakarta', '印度尼西亚', 'Asia/Jakarta', -6.2088, 106.8456, 7, 'none'],
  ['泗水', 'surabaya', '印度尼西亚', 'Asia/Jakarta', -7.2575, 112.7521, 7, 'none'],
  ['棉兰', 'medan', '印度尼西亚', 'Asia/Jakarta', 3.5952, 98.6722, 7, 'none'],
  ['马尼拉', 'manila', '菲律宾', 'Asia/Manila', 14.5995, 120.9842, 8, 'none'],
  ['宿务', 'cebu', '菲律宾', 'Asia/Manila', 10.3157, 123.8854, 8, 'none'],
  ['河内', 'hanoi', '越南', 'Asia/Ho_Chi_Minh', 21.0285, 105.8542, 7, 'none'],
  ['胡志明市', 'ho chi minh city', '越南', 'Asia/Ho_Chi_Minh', 10.8231, 106.6297, 7, 'none'],
  ['金边', 'phnom penh', '柬埔寨', 'Asia/Phnom_Penh', 11.5564, 104.9282, 7, 'none'],
  ['万象', 'vientiane', '老挝', 'Asia/Vientiane', 17.9757, 102.6331, 7, 'none'],
  ['仰光', 'yangon', '缅甸', 'Asia/Yangon', 16.8661, 96.1951, 6.5, 'none'],

  // —— 东亚 ——
  ['东京', 'tokyo', '日本', 'Asia/Tokyo', 35.6762, 139.6503, 9, 'none'],
  ['大阪', 'osaka', '日本', 'Asia/Tokyo', 34.6937, 135.5023, 9, 'none'],
  ['京都', 'kyoto', '日本', 'Asia/Tokyo', 35.0116, 135.7681, 9, 'none'],
  ['名古屋', 'nagoya', '日本', 'Asia/Tokyo', 35.1815, 136.9066, 9, 'none'],
  ['福冈', 'fukuoka', '日本', 'Asia/Tokyo', 33.5904, 130.4017, 9, 'none'],
  ['札幌', 'sapporo', '日本', 'Asia/Tokyo', 43.0618, 141.3545, 9, 'none'],
  ['那霸', 'naha', '日本', 'Asia/Tokyo', 26.2124, 127.6809, 9, 'none'],
  ['首尔', 'seoul', '韩国', 'Asia/Seoul', 37.5665, 126.9780, 9, 'none'],
  ['釜山', 'busan', '韩国', 'Asia/Seoul', 35.1796, 129.0756, 9, 'none'],
  ['平壤', 'pyongyang', '朝鲜', 'Asia/Pyongyang', 39.0392, 125.7625, 9, 'none'],
  ['乌兰巴托', 'ulaanbaatar', '蒙古', 'Asia/Ulaanbaatar', 47.8864, 106.9057, 8, 'none'],

  // —— 南亚 / 西亚 ——
  ['新德里', 'new delhi', '印度', 'Asia/Kolkata', 28.6139, 77.2090, 5.5, 'none'],
  ['孟买', 'mumbai', '印度', 'Asia/Kolkata', 19.0760, 72.8777, 5.5, 'none'],
  ['班加罗尔', 'bangalore', '印度', 'Asia/Kolkata', 12.9716, 77.5946, 5.5, 'none'],
  ['加尔各答', 'kolkata', '印度', 'Asia/Kolkata', 22.5726, 88.3639, 5.5, 'none'],
  ['加德满都', 'kathmandu', '尼泊尔', 'Asia/Kathmandu', 27.7172, 85.3240, 5.75, 'none'],
  ['达卡', 'dhaka', '孟加拉国', 'Asia/Dhaka', 23.8103, 90.4125, 6, 'none'],
  ['科伦坡', 'colombo', '斯里兰卡', 'Asia/Colombo', 6.9271, 79.8612, 5.5, 'none'],
  ['伊斯兰堡', 'islamabad', '巴基斯坦', 'Asia/Karachi', 33.6844, 73.0479, 5, 'none'],
  ['卡拉奇', 'karachi', '巴基斯坦', 'Asia/Karachi', 24.8607, 67.0011, 5, 'none'],
  ['迪拜', 'dubai', '阿联酋', 'Asia/Dubai', 25.2048, 55.2708, 4, 'none'],
  ['阿布扎比', 'abu dhabi', '阿联酋', 'Asia/Dubai', 24.4539, 54.3773, 4, 'none'],
  ['多哈', 'doha', '卡塔尔', 'Asia/Qatar', 25.2854, 51.5310, 3, 'none'],
  ['利雅得', 'riyadh', '沙特', 'Asia/Riyadh', 24.7136, 46.6753, 3, 'none'],
  ['吉达', 'jeddah', '沙特', 'Asia/Riyadh', 21.4858, 39.1925, 3, 'none'],
  ['德黑兰', 'tehran', '伊朗', 'Asia/Tehran', 35.6892, 51.3890, 3.5, 'TZ:Asia/Tehran'],
  ['特拉维夫', 'tel aviv', '以色列', 'Asia/Jerusalem', 32.0853, 34.7818, 2, 'IL'],
  ['安曼', 'amman', '约旦', 'Asia/Amman', 31.9454, 35.9284, 3, 'TZ:Asia/Amman'],
  ['大马士革', 'damascus', '叙利亚', 'Asia/Damascus', 33.5138, 36.2765, 3, 'TZ:Asia/Damascus'],
  ['贝鲁特', 'beirut', '黎巴嫩', 'Asia/Beirut', 33.8938, 35.5018, 2, 'TZ:Asia/Beirut'],

  // —— 非洲 ——
  ['开罗', 'cairo', '埃及', 'Africa/Cairo', 30.0444, 31.2357, 2, 'TZ:Africa/Cairo'],
  ['内罗毕', 'nairobi', '肯尼亚', 'Africa/Nairobi', -1.2921, 36.8219, 3, 'none'],
  ['约翰内斯堡', 'johannesburg', '南非', 'Africa/Johannesburg', -26.2041, 28.0473, 2, 'none'],
  ['开普敦', 'cape town', '南非', 'Africa/Johannesburg', -33.9249, 18.4241, 2, 'none'],
  ['拉各斯', 'lagos', '尼日利亚', 'Africa/Lagos', 6.5244, 3.3792, 1, 'none'],
  ['卡萨布兰卡', 'casablanca', '摩洛哥', 'Africa/Casablanca', 33.5731, -7.5898, 0, 'TZ:Africa/Casablanca'],
  ['拉巴特', 'rabat', '摩洛哥', 'Africa/Casablanca', 34.0209, -6.8416, 0, 'TZ:Africa/Casablanca'],
  ['亚的斯亚贝巴', 'addis ababa', '埃塞俄比亚', 'Africa/Addis_Ababa', 9.0300, 38.7400, 3, 'none'],

  // —— 欧洲 ——
  ['莫斯科', 'moscow', '俄罗斯', 'Europe/Moscow', 55.7558, 37.6173, 3, 'none'],
  ['圣彼得堡', 'saint petersburg', '俄罗斯', 'Europe/Moscow', 59.9311, 30.3609, 3, 'none'],
  ['基辅', 'kyiv', '乌克兰', 'Europe/Kyiv', 50.4501, 30.5234, 2, 'EU'],
  ['明斯克', 'minsk', '白俄罗斯', 'Europe/Minsk', 53.9006, 27.5590, 3, 'none'],
  ['华沙', 'warsaw', '波兰', 'Europe/Warsaw', 52.2297, 21.0122, 1, 'EU'],
  ['柏林', 'berlin', '德国', 'Europe/Berlin', 52.5200, 13.4050, 1, 'EU'],
  ['慕尼黑', 'munich', '德国', 'Europe/Berlin', 48.1351, 11.5820, 1, 'EU'],
  ['法兰克福', 'frankfurt', '德国', 'Europe/Berlin', 50.1109, 8.6821, 1, 'EU'],
  ['巴黎', 'paris', '法国', 'Europe/Paris', 48.8566, 2.3522, 1, 'EU'],
  ['里昂', 'lyon', '法国', 'Europe/Paris', 45.7640, 4.8357, 1, 'EU'],
  ['马赛', 'marseille', '法国', 'Europe/Paris', 43.2965, 5.3698, 1, 'EU'],
  ['伦敦', 'london', '英国', 'Europe/London', 51.5074, -0.1278, 0, 'EU'],
  ['曼彻斯特', 'manchester', '英国', 'Europe/London', 53.4808, -2.2426, 0, 'EU'],
  ['爱丁堡', 'edinburgh', '英国', 'Europe/London', 55.9533, -3.1883, 0, 'EU'],
  ['都柏林', 'dublin', '爱尔兰', 'Europe/Dublin', 53.3498, -6.2603, 0, 'EU'],
  ['阿姆斯特丹', 'amsterdam', '荷兰', 'Europe/Amsterdam', 52.3676, 4.9041, 1, 'EU'],
  ['布鲁塞尔', 'brussels', '比利时', 'Europe/Brussels', 50.8503, 4.3517, 1, 'EU'],
  ['苏黎世', 'zurich', '瑞士', 'Europe/Zurich', 47.3769, 8.5417, 1, 'EU'],
  ['维也纳', 'vienna', '奥地利', 'Europe/Vienna', 48.2082, 16.3738, 1, 'EU'],
  ['罗马', 'rome', '意大利', 'Europe/Rome', 41.9028, 12.4964, 1, 'EU'],
  ['米兰', 'milan', '意大利', 'Europe/Rome', 45.4642, 9.1900, 1, 'EU'],
  ['马德里', 'madrid', '西班牙', 'Europe/Madrid', 40.4168, -3.7038, 1, 'EU'],
  ['巴塞罗那', 'barcelona', '西班牙', 'Europe/Madrid', 41.3874, 2.1686, 1, 'EU'],
  ['里斯本', 'lisbon', '葡萄牙', 'Europe/Lisbon', 38.7223, -9.1393, 0, 'EU'],
  ['雅典', 'athens', '希腊', 'Europe/Athens', 37.9838, 23.7275, 2, 'EU'],
  ['斯德哥尔摩', 'stockholm', '瑞典', 'Europe/Stockholm', 59.3293, 18.0686, 1, 'EU'],
  ['奥斯陆', 'oslo', '挪威', 'Europe/Oslo', 59.9139, 10.7522, 1, 'EU'],
  ['哥本哈根', 'copenhagen', '丹麦', 'Europe/Copenhagen', 55.6761, 12.5683, 1, 'EU'],
  ['赫尔辛基', 'helsinki', '芬兰', 'Europe/Helsinki', 60.1699, 24.9384, 2, 'EU'],
  ['布达佩斯', 'budapest', '匈牙利', 'Europe/Budapest', 47.4979, 19.0402, 1, 'EU'],
  ['布拉格', 'prague', '捷克', 'Europe/Prague', 50.0755, 14.4378, 1, 'EU'],
  ['布加勒斯特', 'bucharest', '罗马尼亚', 'Europe/Bucharest', 44.4268, 26.1025, 2, 'EU'],
  ['索菲亚', 'sofia', '保加利亚', 'Europe/Sofia', 42.6977, 23.3219, 2, 'EU'],
  ['贝尔格莱德', 'belgrade', '塞尔维亚', 'Europe/Belgrade', 44.7866, 20.4489, 1, 'EU'],
  ['萨格勒布', 'zagreb', '克罗地亚', 'Europe/Zagreb', 45.8150, 15.9819, 1, 'EU'],
  ['卢森堡', 'luxembourg', '卢森堡', 'Europe/Luxembourg', 49.6116, 6.1319, 1, 'EU'],
  ['雷克雅未克', 'reykjavik', '冰岛', 'Atlantic/Reykjavik', 64.1466, -21.9426, 0, 'none'],
  ['伊斯坦布尔', 'istanbul', '土耳其', 'Europe/Istanbul', 41.0082, 28.9784, 3, 'none'],

  // —— 北美 ——
  ['纽约', 'new york', '美国', 'America/New_York', 40.7128, -74.0060, -5, 'US'],
  ['洛杉矶', 'los angeles', '美国', 'America/Los_Angeles', 34.0522, -118.2437, -8, 'US'],
  ['旧金山', 'san francisco', '美国', 'America/Los_Angeles', 37.7749, -122.4194, -8, 'US'],
  ['圣何塞', 'san jose', '美国', 'America/Los_Angeles', 37.3382, -121.8863, -8, 'US'],
  ['西雅图', 'seattle', '美国', 'America/Los_Angeles', 47.6062, -122.3321, -8, 'US'],
  ['波特兰', 'portland', '美国', 'America/Los_Angeles', 45.5152, -122.6784, -8, 'US'],
  ['圣迭戈', 'san diego', '美国', 'America/Los_Angeles', 32.7157, -117.1611, -8, 'US'],
  ['拉斯维加斯', 'las vegas', '美国', 'America/Los_Angeles', 36.1699, -115.1398, -8, 'US'],
  ['芝加哥', 'chicago', '美国', 'America/Chicago', 41.8781, -87.6298, -6, 'US'],
  ['休斯顿', 'houston', '美国', 'America/Chicago', 29.7604, -95.3698, -6, 'US'],
  ['达拉斯', 'dallas', '美国', 'America/Chicago', 32.7767, -96.7970, -6, 'US'],
  ['明尼阿波利斯', 'minneapolis', '美国', 'America/Chicago', 44.9778, -93.2650, -6, 'US'],
  ['波士顿', 'boston', '美国', 'America/New_York', 42.3601, -71.0589, -5, 'US'],
  ['华盛顿', 'washington dc', '美国', 'America/New_York', 38.9072, -77.0369, -5, 'US'],
  ['费城', 'philadelphia', '美国', 'America/New_York', 39.9526, -75.1652, -5, 'US'],
  ['亚特兰大', 'atlanta', '美国', 'America/New_York', 33.7490, -84.3880, -5, 'US'],
  ['迈阿密', 'miami', '美国', 'America/New_York', 25.7617, -80.1918, -5, 'US'],
  ['底特律', 'detroit', '美国', 'America/Detroit', 42.3314, -83.0458, -5, 'US'],
  ['丹佛', 'denver', '美国', 'America/Denver', 39.7392, -104.9903, -7, 'US'],
  ['凤凰城', 'phoenix', '美国', 'America/Phoenix', 33.4484, -112.0740, -7, 'none'],
  ['檀香山', 'honolulu', '美国', 'Pacific/Honolulu', 21.3069, -157.8583, -10, 'none'],
  ['安克雷奇', 'anchorage', '美国', 'America/Anchorage', 61.2181, -149.9003, -9, 'US'],
  ['温哥华', 'vancouver', '加拿大', 'America/Vancouver', 49.2827, -123.1207, -8, 'US'],
  ['多伦多', 'toronto', '加拿大', 'America/Toronto', 43.6532, -79.3832, -5, 'US'],
  ['蒙特利尔', 'montreal', '加拿大', 'America/Toronto', 45.5017, -73.5673, -5, 'US'],
  ['渥太华', 'ottawa', '加拿大', 'America/Toronto', 45.4215, -75.6972, -5, 'US'],
  ['卡尔加里', 'calgary', '加拿大', 'America/Edmonton', 51.0447, -114.0719, -7, 'US'],
  ['埃德蒙顿', 'edmonton', '加拿大', 'America/Edmonton', 53.5461, -113.4938, -7, 'US'],
  ['温尼伯', 'winnipeg', '加拿大', 'America/Winnipeg', 49.8951, -97.1384, -6, 'US'],
  ['哈利法克斯', 'halifax', '加拿大', 'America/Halifax', 44.6488, -63.5752, -4, 'US'],
  ['墨西哥城', 'mexico city', '墨西哥', 'America/Mexico_City', 19.4326, -99.1332, -6, 'TZ:America/Mexico_City'],
  ['瓜达拉哈拉', 'guadalajara', '墨西哥', 'America/Mexico_City', 20.6597, -103.3496, -6, 'TZ:America/Mexico_City'],
  ['蒂华纳', 'tijuana', '墨西哥', 'America/Tijuana', 32.5149, -117.0382, -8, 'US'],

  // —— 中南美 ——
  ['圣保罗', 'sao paulo', '巴西', 'America/Sao_Paulo', -23.5505, -46.6333, -3, 'none'],
  ['里约热内卢', 'rio de janeiro', '巴西', 'America/Sao_Paulo', -22.9068, -43.1729, -3, 'none'],
  ['布宜诺斯艾利斯', 'buenos aires', '阿根廷', 'America/Argentina/Buenos_Aires', -34.6037, -58.3816, -3, 'none'],
  ['圣地亚哥', 'santiago', '智利', 'America/Santiago', -33.4489, -70.6693, -4, 'TZ:America/Santiago'],
  ['利马', 'lima', '秘鲁', 'America/Lima', -12.0464, -77.0428, -5, 'none'],
  ['波哥大', 'bogota', '哥伦比亚', 'America/Bogota', 4.7110, -74.0721, -5, 'none'],
  ['基多', 'quito', '厄瓜多尔', 'America/Guayaquil', -0.1807, -78.4678, -5, 'none'],
  ['加拉加斯', 'caracas', '委内瑞拉', 'America/Caracas', 10.4806, -66.9036, -4, 'none'],
  ['蒙得维的亚', 'montevideo', '乌拉圭', 'America/Montevideo', -34.9011, -56.1645, -3, 'none'],
  ['亚松森', 'asuncion', '巴拉圭', 'America/Asuncion', -25.2637, -57.5759, -4, 'TZ:America/Asuncion'],
  ['拉巴斯', 'la paz', '玻利维亚', 'America/La_Paz', -16.4897, -68.1193, -4, 'none'],

  // —— 大洋洲 ——
  ['悉尼', 'sydney', '澳大利亚', 'Australia/Sydney', -33.8688, 151.2093, 10, 'AU'],
  ['墨尔本', 'melbourne', '澳大利亚', 'Australia/Melbourne', -37.8136, 144.9631, 10, 'AU'],
  ['堪培拉', 'canberra', '澳大利亚', 'Australia/Sydney', -35.2809, 149.1300, 10, 'AU'],
  ['霍巴特', 'hobart', '澳大利亚', 'Australia/Hobart', -42.8821, 147.3272, 10, 'AU'],
  ['阿德莱德', 'adelaide', '澳大利亚', 'Australia/Adelaide', -34.9285, 138.6007, 9.5, 'AU'],
  ['布里斯班', 'brisbane', '澳大利亚', 'Australia/Brisbane', -27.4698, 153.0251, 10, 'none'],
  ['珀斯', 'perth', '澳大利亚', 'Australia/Perth', -31.9505, 115.8605, 8, 'none'],
  ['达尔文', 'darwin', '澳大利亚', 'Australia/Darwin', -12.4634, 130.8456, 9.5, 'none'],
  ['奥克兰', 'auckland', '新西兰', 'Pacific/Auckland', -36.8485, 174.7633, 12, 'NZ'],
  ['惠灵顿', 'wellington', '新西兰', 'Pacific/Auckland', -41.2866, 174.7756, 12, 'NZ'],
  ['基督城', 'christchurch', '新西兰', 'Pacific/Auckland', -43.5321, 172.6362, 12, 'NZ'],
  ['苏瓦', 'suva', '斐济', 'Pacific/Fiji', -18.1416, 178.4419, 12, 'none'],
  ['关岛', 'guam', '美国关岛', 'Pacific/Guam', 13.4443, 144.7937, 10, 'none'],
  ['塞班', 'saipan', '北马里亚纳', 'Pacific/Saipan', 15.1778, 145.7509, 10, 'none'],
];

export const CITY_TZ_TABLE: CityTimeZone[] = CITY_ROWS.map(
  ([name, en, country, tz, lat, lon, stdOffset, dst]) => ({ name, en, country, tz, lat, lon, stdOffset, dst }),
);

/** 别名（旧称 / 常见拼写），键为规范化后的串 */
const CITY_ALIASES: Record<string, string> = {
  peking: '北京',
  canton: '广州',
  amoy: '厦门',
  'hongkong': '香港',
  macao: '澳门',
  saigon: '胡志明市',
  bombay: '孟买',
  calcutta: '加尔各答',
  'kuala lumpur malaysia': '吉隆坡',
  'new york city': '纽约',
  nyc: '纽约',
  la: '洛杉矶',
  'san francisco bay area': '旧金山',
  washington: '华盛顿',
  'washington, dc': '华盛顿',
  'sydney, australia': '悉尼',
  '江西省': '南昌',
};

function normKey(s: unknown): string {
  return String(s == null ? '' : s)
    .toLowerCase()
    .replace(/[\s·・,，.。'’\-_/]/g, '')
    .replace(/(特别行政区|自治区|省|市|县|区)$/g, '');
}

/**
 * 城市 → 时区。支持中文名、英文名、别名，以及「辽宁沈阳」这种含城市的串（取最长命中）。
 * 找不到返回 null（由调用方决定兜底策略，别在这里悄悄给 +8）。
 */
export function lookupCityTimeZone(query: unknown): CityTimeZone | null {
  const raw = String(query == null ? '' : query).trim();
  if (!raw) return null;
  const key = normKey(raw);
  if (!key) return null;

  // 1) 精确命中（中文名 / 英文名 / 别名）
  const alias = CITY_ALIASES[key];
  const exact = CITY_TZ_TABLE.find(
    (c) => normKey(c.name) === key || normKey(c.en) === key || (alias && c.name === alias),
  );
  if (exact) return exact;

  // 2) 包含命中：取「被包含的名字最长」的那个，避免「上海」误吃「上海关」之类
  let best: CityTimeZone | null = null;
  let bestLen = 0;
  for (const c of CITY_TZ_TABLE) {
    const nk = normKey(c.name);
    if (nk.length >= 2 && key.includes(nk) && nk.length > bestLen) {
      best = c;
      bestLen = nk.length;
    }
  }
  if (best) return best;

  // 3) 英文长名包含（如 "new york, usa"）
  for (const c of CITY_TZ_TABLE) {
    const ek = normKey(c.en);
    if (ek.length >= 4 && key.includes(ek) && ek.length > bestLen) {
      best = c;
      bestLen = ek.length;
    }
  }
  return best;
}

/** 供前端做城市下拉（按国家分组） */
export function listCityTimeZones(): CityTimeZone[] {
  return CITY_TZ_TABLE.map((c) => ({ ...c }));
}

/* ============================================================
   一·五、经纬度 → 时区推算（没有城市名时的兜底，绝不静默 +8）
   ------------------------------------------------------------
   历史缺陷：只要给了经纬度、没给城市，旧实现一律按 +8 兜底。
   纽约 (-74.01, 40.71) 11:45 被算成 UTC+8 → 真太阳时前移 13 小时，
   日柱都错了一天。这里改成两级推算，并把「这是估算」一路标出去。
   ============================================================ */

/** 球面距离（km，haversine，地球平均半径 6371） */
export function haversineKm(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371;
  const rad = Math.PI / 180;
  const dLat = (lat2 - lat1) * rad;
  const dLon = (lon2 - lon1) * rad;
  const a = Math.sin(dLat / 2) ** 2
    + Math.cos(lat1 * rad) * Math.cos(lat2 * rad) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(a)));
}

/** 现存法定时区偏移（含半小时 / 三刻钟地区），用于把经度吸附到真实时区 */
const VALID_UTC_OFFSETS: number[] = [
  -11, -10, -9.5, -9, -8, -7, -6, -5, -4, -3.5, -3, -2, -1, 0, 1, 2, 3, 3.5, 4, 4.5,
  5, 5.5, 5.75, 6, 6.5, 7, 8, 8.75, 9, 9.5, 10, 10.5, 11, 12, 12.75, 13, 14,
];

/** 经度 → 最接近的法定时区偏移（round(lon/15) 再吸附到真实存在的偏移上） */
export function offsetFromLongitude(lon: number): number {
  const raw = lon / 15;
  let best = VALID_UTC_OFFSETS[0];
  for (const o of VALID_UTC_OFFSETS) {
    if (Math.abs(o - raw) < Math.abs(best - raw)) best = o;
  }
  return best;
}

export interface TzEstimate {
  offset: number;
  method: 'nearest-city' | 'longitude';
  km: number | null;
  city: CityTimeZone | null;
}

/** 经纬度 600km 内最近的已知城市（用于判定「这地方大概属于哪个时区」） */
export function nearestCityByCoords(lat: number, lon: number, maxKm = 600): { city: CityTimeZone; km: number } | null {
  let best: { city: CityTimeZone; km: number } | null = null;
  for (const c of CITY_TZ_TABLE) {
    const km = haversineKm(lat, lon, c.lat, c.lon);
    if (!best || km < best.km) best = { city: c, km };
  }
  if (!best || best.km > maxKm) return null;
  return best;
}

/**
 * 经纬度 → 时区估算。
 * 先找 600km 内最近的城市（能带上该城市的夏令时规则与 IANA 名），
 * 找不到才退回「经度吸附法定时区」（拿不到夏令时规则，只能给标准时）。
 */
export function estimateTzFromCoords(lat: number, lon: number): TzEstimate {
  const near = nearestCityByCoords(lat, lon);
  if (near) return { offset: near.city.stdOffset, method: 'nearest-city', km: Math.round(near.km), city: near.city };
  return { offset: offsetFromLongitude(lon), method: 'longitude', km: null, city: null };
}

/** 城市与经纬度相差多远才算「矛盾」（km）。200km 内按用户经纬度（更精细），超出按城市 */
export const GEO_CONFLICT_KM = 200;
/** 经度与本时区中央经线相差多少才算矛盾（分）。180 分 = 45°，超出必是旧地点残留 */
export const GEO_MERIDIAN_TOLERANCE_MIN = 180;

/* ============================================================
   一·六、中国历史时区（1912–1949 五时区）
   ------------------------------------------------------------
   1949-10-01 起全国统一 UTC+8，这是现在的官方口径。
   但 1912–1949 中国**分五时区**（1918 年中央观象台颁行，各地实施有出入）：
     中原标准时 +8（120°E） 华北/华东/华中/华南/东北西部
     陇蜀时区   +7（105°E） 四川/云南/贵州/陕西/甘肃东部/青海东部/宁夏
     新藏时区   +6（90°E）  新疆大部分
     昆仑时区   +5.5（82.5°E） 新疆西部/西藏西部
     长白时区   +8.5（127.5°E） 东北东部（吉黑）
   旧实现一律 +8，实测成都 1930、乌鲁木齐 1940、拉萨 1940 各错一个时辰且
   warnings 为空（r2_stability.md P0-2）。这里补一张「城市 + 年份」紧凑表，
   覆盖主要城市，并在命中/未命中时都写 warning——绝不再静默 +8。
   ============================================================ */

export interface ChinaHistZone {
  /** 时区名（1912–1949 官方五时区名） */
  name: string;
  /** 相对 UTC 的小时偏移 */
  offset: number;
}

const ZY: ChinaHistZone = { name: '中原标准时区', offset: 8 };
const LS: ChinaHistZone = { name: '陇蜀时区', offset: 7 };
const XZ: ChinaHistZone = { name: '新藏时区', offset: 6 };
const KL: ChinaHistZone = { name: '昆仑时区', offset: 5.5 };
const CB: ChinaHistZone = { name: '长白时区', offset: 8.5 };

/** 城市 → 1912–1949 所属时区（按 normKey 归一后的中文名建索引） */
const CHINA_HIST_TZ: Record<string, ChinaHistZone> = {};
function assignHist(zone: ChinaHistZone, names: string[]): void {
  for (const n of names) CHINA_HIST_TZ[normKey(n)] = zone;
}

// 中原标准时区（+8）：华北、华东、华中、华南、东北西部
assignHist(ZY, [
  '北京', '上海', '天津', '重庆', '南京', '广州', '武汉', '杭州', '福州',
  '长沙', '郑州', '济南', '青岛', '太原', '石家庄', '南昌', '合肥', '南宁',
  '海口', '沈阳', '大连', '呼和浩特', '宁波', '苏州', '无锡', '厦门', '深圳',
  '洛阳', '开封', '徐州', '温州', '桂林', '汕头',
]);
// 陇蜀时区（+7）：川滇黔陕甘宁青东
assignHist(LS, [
  '成都', '昆明', '贵阳', '西安', '兰州', '银川', '西宁', '天水', '宝鸡',
  '汉中', '绵阳', '宜宾', '泸州', '遵义', '曲靖', '大理', '康定', '延安',
]);
// 新藏时区（+6）：新疆大部
assignHist(XZ, ['乌鲁木齐', '吐鲁番', '库尔勒', '哈密', '伊宁', '阿克苏', '克拉玛依']);
// 昆仑时区（+5.5）：新疆西部 / 西藏西部
assignHist(KL, ['喀什', '和田', '拉萨', '日喀则', '阿里', '格尔木']);
// 长白时区（+8.5）：东北东部
assignHist(CB, ['长春', '哈尔滨', '吉林', '齐齐哈尔', '牡丹江', '佳木斯', '延吉']);

/** 全国统一东八区的起点（1949-10-01 00:00 地方标准时） */
export const CHINA_TZ_UNIFIED_DATE = '1949-10-01';
const CN_TZ_UNIFIED_MS = utcMsOf(1949, 10, 1);
/** 五时区颁行起点（1912-01-01）。更早年份中国尚无标准时区 */
const CN_TZ_ZONES_FROM_MS = utcMsOf(1912, 1, 1);

/** 是否「中国境内」城市（历史时区与相关提示只对境内城市生效） */
export function isChinaCity(c: CityTimeZone | null): boolean {
  if (!c) return false;
  return c.country.startsWith('中国') && c.lat >= 18 && c.lat <= 54 && c.lon >= 73 && c.lon <= 136;
}

/**
 * 历史时区解析：城市 + 年月日 → 1912–1949 的时区偏移。
 *
 * 返回 null 表示「无需/无法使用历史表」（境外、1949-10-01 之后）。
 * 命中与否都会把口径写进 warnings（调用方负责 push），做到「不静默」。
 */
export function resolveChinaHistoricTz(
  city: CityTimeZone | null,
  y: number,
  mo: number,
  d: number,
): { offset: number; zone: string | null; warning: string } | null {
  if (!isChinaCity(city)) return null;
  const ms = utcMsOf(y, mo, d);
  if (ms >= CN_TZ_UNIFIED_MS) return null; // 1949-10-01 起统一 +8，走现行表
  const zone = CHINA_HIST_TZ[normKey(city!.name)] ?? null;
  if (ms < CN_TZ_ZONES_FROM_MS) {
    return {
      offset: zone ? zone.offset : 8,
      zone: zone ? zone.name : null,
      warning: `历史时区：${y} 年中国尚未颁行标准时区（1912 年才有五时区），`
        + `按 ${formatOffsetName(zone ? zone.offset : 8)} 处理；各地实际用地方平太阳时，`
        + '可能有数十分钟差异，如需精确请手动指定 utcOffsetHours',
    };
  }
  if (!zone) {
    return {
      offset: 8,
      zone: null,
      warning: `历史时区：「${city!.name}」在 1912–1949 的分区数据缺失，按中原标准时区 ${formatOffsetName(8)} 处理；`
        + '当时中国分五时区（+5.5/+6/+7/+8/+8.5），可能偏 1–2.5 小时，建议手动指定 utcOffsetHours',
    };
  }
  return {
    offset: zone.offset,
    zone: zone.name,
    warning: `历史时区：${y}-${pad2(mo)}-${pad2(d)} 的「${city!.name}」按 ${zone.name}（${formatOffsetName(zone.offset)}）折算；`
      + `1949-10-01 起才全国统一 +8，1912–1949 各地实施有出入，如需精确请手动指定 utcOffsetHours`,
  };
}

/* ============================================================
   二、夏令时规则
   ============================================================ */

/** 中国 1986–1991 夏令时（timeanddate 逐年核对；均 02:00 起、02:00 止） */
const CN_DST_WINDOWS: Record<number, [number, number, number, number]> = {
  // 年: [起月, 起日, 止月, 止日]
  1986: [5, 4, 9, 14],
  1987: [4, 12, 9, 13],
  1988: [4, 17, 9, 11],
  1989: [4, 16, 9, 17],
  1990: [4, 15, 9, 16],
  1991: [4, 14, 9, 15],
};

/** 某年某月的第 n 个周日（n=1..5），返回日 */
function nthSunday(year: number, month: number, n: number): number {
  const firstDow = new Date(Date.UTC(year, month - 1, 1)).getUTCDay(); // 0=周日
  const firstSunday = 1 + ((7 - firstDow) % 7);
  return firstSunday + (n - 1) * 7;
}

/** 某年某月最后一个周日 */
function lastSunday(year: number, month: number): number {
  const lastDay = new Date(Date.UTC(year, month, 0)).getUTCDate();
  const lastDow = new Date(Date.UTC(year, month - 1, lastDay)).getUTCDay();
  return lastDay - lastDow;
}

/** 把墙钟分量折成「当 UTC 用」的毫秒（纯比较，不代表绝对时刻） */
function wallEpoch(y: number, mo: number, d: number, h = 0, mi = 0, s = 0): number {
  // 不用 Date.UTC：它把 0–99 年映射成 1900+year（ES 规范历史行为）。
  return utcMsOf(y, mo, d, h, mi, s);
}

const HOUR = 3600000;

/**
 * 某年的夏令时窗口（**标准时墙钟**口径）：[start, end)
 * - 起点 = 拨快那一刻的标准时（一般 02:00）
 * - 止点 = 回拨那一刻的标准时（一般 01:00，因为回拨发生在 02:00 夏令时）
 * 南半球（AU/NZ/CL）窗口跨年：[start(年), end(年+1))
 */
function dstWindowForYear(rule: DstRuleId, stdOffset: number, year: number): { start: number; end: number } | null {
  // 近年改过规则的国家/地区交给 tz-data.ts 的覆盖表（埃及/摩洛哥/墨西哥/伊朗/
  // 约旦/叙利亚/巴拉圭/智利/黎巴嫩）。表里没有的年份按表中给出的口径返回。
  if (rule.startsWith('TZ:')) {
    const w = tzOverrideWindow(rule.slice(3), year);
    return w === undefined ? null : w;
  }
  switch (rule) {
    case 'CN1986': {
      const w = CN_DST_WINDOWS[year];
      if (!w) return null;
      return {
        start: wallEpoch(year, w[0], w[1], 2, 0, 0),
        end: wallEpoch(year, w[2], w[3], 1, 0, 0),
      };
    }
    case 'EU': {
      // 欧盟：3 月最后一个周日 01:00 UTC 起，10 月最后一个周日 01:00 UTC 止
      // 换成当地标准时 => 01:00 + stdOffset
      const hStart = 1 + stdOffset;
      return {
        start: wallEpoch(year, 3, lastSunday(year, 3), hStart, 0, 0),
        end: wallEpoch(year, 10, lastSunday(year, 10), hStart, 0, 0),
      };
    }
    case 'US': {
      // 美国/加拿大：3 月第二个周日 02:00 标准时起，11 月第一个周日 02:00 夏令时（=01:00 标准时）止
      return {
        start: wallEpoch(year, 3, nthSunday(year, 3, 2), 2, 0, 0),
        end: wallEpoch(year, 11, nthSunday(year, 11, 1), 1, 0, 0),
      };
    }
    case 'AU': {
      // 澳洲东南部：10 月第一个周日 02:00 标准时起，次年 4 月第一个周日 03:00 夏令时（=02:00 标准时）止
      return {
        start: wallEpoch(year, 10, nthSunday(year, 10, 1), 2, 0, 0),
        end: wallEpoch(year + 1, 4, nthSunday(year + 1, 4, 1), 2, 0, 0),
      };
    }
    case 'NZ': {
      // 新西兰：9 月最后一个周日 02:00 标准时起，次年 4 月第一个周日 03:00 夏令时（=02:00 标准时）止
      return {
        start: wallEpoch(year, 9, lastSunday(year, 9), 2, 0, 0),
        end: wallEpoch(year + 1, 4, nthSunday(year + 1, 4, 1), 2, 0, 0),
      };
    }
    case 'CL': {
      // 智利：9 月第一个周日 00:00 起，次年 4 月第一个周日 00:00 止（2022 起口径，近似）
      return {
        start: wallEpoch(year, 9, nthSunday(year, 9, 1), 0, 0, 0),
        end: wallEpoch(year + 1, 4, nthSunday(year + 1, 4, 1), 0, 0, 0),
      };
    }
    case 'IL': {
      // 以色列：3 月最后一个周日前的周五 02:00 起，10 月最后一个周日 02:00 止（近似）
      return {
        start: wallEpoch(year, 3, lastSunday(year, 3) - 2, 2, 0, 0),
        end: wallEpoch(year, 10, lastSunday(year, 10), 2, 0, 0),
      };
    }
    default:
      return null;
  }
}

/** 给定「标准时墙钟毫秒」，判断是否落在夏令时窗口内 */
function dstActiveAtStdWall(rule: DstRuleId, stdOffset: number, stdWallMs: number): boolean {
  if (rule === 'none') return false;
  const y = new Date(stdWallMs).getUTCFullYear();
  for (const yy of [y - 1, y, y + 1]) {
    const w = dstWindowForYear(rule, stdOffset, yy);
    if (w && stdWallMs >= w.start && stdWallMs < w.end) return true;
  }
  return false;
}

/**
 * 中国 1986–1991 夏令时窗口（对外，标准时口径）。
 * 例：chinaDstWindow(1988) => { startLocal: '1988-04-17 02:00', endLocal: '1988-09-11 01:00' }
 */
export function chinaDstWindow(year: number): { startLocal: string; endLocal: string } | null {
  const w = CN_DST_WINDOWS[year];
  if (!w) return null;
  const fmt = (mo: number, d: number, h: number) =>
    `${year}-${String(mo).padStart(2, '0')}-${String(d).padStart(2, '0')} ${String(h).padStart(2, '0')}:00`;
  return { startLocal: fmt(w[0], w[1], 2), endLocal: fmt(w[2], w[3], 1) };
}

/**
 * 中国 1986–1991 是否处于夏令时（传入**标准时**的年月日时分）
 */
export function chinaDstInEffect(year: number, month: number, day: number, hour = 12, minute = 0): boolean {
  return dstActiveAtStdWall('CN1986', 8, wallEpoch(year, month, day, hour, minute));
}

/**
 * 中国 1986–1991：给定**民用钟面时间**，是否要按夏令时扣 1 小时。
 *
 * 与 chinaDstInEffect 的区别：那个吃标准时，这个吃用户看到的钟面时间。
 * 先假设「已是夏令时」（钟面 -1h 落窗口内），再退回「不是夏令时」，
 * 于是回拨后重复的那一小时按夏令时算（用户看的是回拨前的钟），
 * 拨快当天不存在的那一小时也能给出确定答案。
 */
export function chinaDstAppliesToCivil(year: number, month: number, day: number, hour = 12, minute = 0): boolean {
  const civilMs = wallEpoch(year, month, day, hour, minute);
  if (dstActiveAtStdWall('CN1986', 8, civilMs - HOUR)) return true;
  return dstActiveAtStdWall('CN1986', 8, civilMs);
}

/* ============================================================
   三、均时差与真太阳时
   ============================================================ */

const OBSERVER_AT_ORIGIN = new Observer(0, 0, 0);

/**
 * 角度归一到 [0, 360)。
 *
 * 旧写法 `((x % 360) + 360) % 360` 对正数会多走一次 +360/−360，双精度下把
 * x = 3.33 变成 3.3299999999999999（审计实测 2e-14 级偏差）。正数直接取模即可，
 * 负数才需要补一圈。负零（-0）也归成 +0，避免 Object.is 比较出意外。
 */
function mod360(x: number): number {
  const r = x % 360;
  const v = r < 0 ? r + 360 : r;
  return v === 0 ? 0 : v;
}

/** 太阳平黄经 L0（Meeus 28.2；精度 0.0003°） */
function meanSolarLongitude(jdUt: number): number {
  const T = (jdUt - 2451545.0) / 36525.0;
  return mod360(280.46646 + T * (36000.76983 + T * 0.0003032));
}

/**
 * 均时差（分钟）= 真太阳时 − 平太阳时。
 * 口径：E = L0 − α（视赤经），Meeus《Astronomical Algorithms》第 28 章；
 * α 由 astronomy-engine 取「当日视赤经」（含章动与光行差），年内极值约
 * 2 月中 −14.2 分、5 月中 +3.7 分、7 月底 −6.5 分、11 月初 +16.4 分。
 */
export function equationOfTimeMinutes(date: Date): number {
  const jdUt = date.getTime() / 86400000 + 2440587.5;
  const eq = Equator(Body.Sun, date, OBSERVER_AT_ORIGIN, true, true);
  const alpha = mod360(eq.ra * 15);
  let diff = meanSolarLongitude(jdUt) - alpha;
  diff = ((diff + 180) % 360 + 360) % 360 - 180;
  return 4 * diff;
}

function partsFromMs(ms: number): CivilTime {
  const d = new Date(ms);
  return {
    year: d.getUTCFullYear(),
    month: d.getUTCMonth() + 1,
    day: d.getUTCDate(),
    hour: d.getUTCHours(),
    minute: d.getUTCMinutes(),
    second: d.getUTCSeconds(),
  };
}

function pad2(n: number): string {
  return String(n).padStart(2, '0');
}

/** 时区偏移 → 展示名（+8 → "UTC+08:00"，5.75 → "UTC+05:45"） */
export function formatOffsetName(offsetHours: number): string {
  const sign = offsetHours < 0 ? '-' : '+';
  const abs = Math.abs(offsetHours);
  const h = Math.floor(abs + 1e-9);
  const m = Math.round((abs - h) * 60);
  return `UTC${sign}${pad2(h)}:${pad2(m)}`;
}

/* ============================================================
   四、主入口
   ============================================================ */

/**
 * 统一时间解析：本地民用时 + 出生地 → UTC 绝对时刻 / 夏令时 / 真太阳时。
 *
 * 优先级：utcOffsetHours（显式） > 城市查表 > 东八区兜底（tzFallback = true）。
 * 纯函数：同一个入参永远同一结果，不读时钟、不读存储、不碰 DOM。
 */
export function resolveTime(input: TimeResolveInput): TimeResolution {
  // 统一校验（validate.ts）：日期越界抛 InvalidDateError（不再静默滚动）、
  // 小时缺省/脏值抛 InvalidTimeError（strict:false 才回退 0 点并写 warning）、
  // 小数时间向下取整并写 warning。
  const v = validateDateTime(input as unknown as Record<string, unknown>, {
    yearRange: 'calendar',
    label: '时间',
  });
  const civil: CivilTime = {
    year: v.year, month: v.month, day: v.day,
    hour: v.hour, minute: v.minute, second: v.second,
  };

  // 坐标统一校验：只给一个即抛（不许默认 lon=0 落到几内亚湾），越界即抛（不夹紧）。
  // 城市查表拿到的坐标另行夹紧，这里只管调用方显式给的。
  validateGeo(
    input.lat ?? input.latitude,
    input.lonEast ?? input.longitude ?? input.lon,
    { required: false, label: '出生地' },
  );

  const warnings: string[] = [...v.warnings];
  const lonRaw = input.lon ?? input.lonEast ?? input.longitude;
  const latRaw = input.lat ?? input.latitude;

  // ---- 1) 城市与时区 ----
  const cityHit = lookupCityTimeZone(input.city) ?? lookupCityTimeZone(input.place);
  let longitude = Number.isFinite(lonRaw as number) ? (lonRaw as number) : null;
  let latitude = Number.isFinite(latRaw as number) ? (latRaw as number) : null;
  let geoConflict = false;
  let geoConflictNote: string | null = null;

  if (cityHit && (longitude == null || latitude == null)) {
    // 只选了城市、没给经纬度：用城市中心补上（真太阳时才有得算）
    longitude = longitude ?? cityHit.lon;
    latitude = latitude ?? cityHit.lat;
  }

  // 城市与经纬度互相矛盾：不许静默混搭，按规则取舍并留痕
  if (cityHit && longitude != null && latitude != null) {
    const km = haversineKm(latitude, longitude, cityHit.lat, cityHit.lon);
    if (km > GEO_CONFLICT_KM) {
      geoConflict = true;
      const head = `经纬度（${longitude.toFixed(2)}, ${latitude.toFixed(2)}）与城市「${cityHit.name}」相距约 ${Math.round(km)}km`;
      if (input.preferCoordinates) {
        geoConflictNote = `${head}；已按经纬度算真太阳时，但时区仍用「${cityHit.name}」的 ${formatOffsetName(cityHit.stdOffset)}——请确认哪一个才是出生地`;
      } else {
        // 城市才是时区的权威来源，经纬度当旧地点残留
        longitude = cityHit.lon;
        latitude = cityHit.lat;
        geoConflictNote = `${head}；已按城市「${cityHit.name}」的坐标与时区重算（城市决定时区，经纬度视为旧地点残留）`;
      }
      warnings.push(geoConflictNote);
    }
  }

  let tzSource: TimeResolution['tzSource'];
  let baseOffset: number;
  let sourceTzName: string;
  let tzFallback = false;
  let tzEstimated = false;
  let tzEstimateMethod: TimeResolution['tzEstimateMethod'] = null;
  let tzEstimateKm: number | null = null;
  let tzEstimateCity: string | null = null;
  /** 时区所依据的城市（用于取夏令时规则）：显式查表命中，或估算时参照的最近城市 */
  let tzCity: CityTimeZone | null = cityHit;

  if (Number.isFinite(input.utcOffsetHours as number)) {
    baseOffset = input.utcOffsetHours as number;
    tzSource = 'explicit';
    sourceTzName = cityHit ? cityHit.tz : formatOffsetName(baseOffset);
  } else if (cityHit) {
    baseOffset = cityHit.stdOffset;
    tzSource = 'city';
    sourceTzName = cityHit.tz;
  } else if (longitude != null && latitude != null) {
    // 只有经纬度：按坐标推算时区（**绝不**静默按 +8）
    const est = estimateTzFromCoords(latitude, longitude);
    if (est.method !== 'nearest-city' && input.tzPolicy === 'strict') {
      throw new Error(
        `无法可靠确定时区：定位点（${longitude.toFixed(2)}, ${latitude.toFixed(2)}）600km 内没有内置城市，`
        + '经度推算法在 strict 模式下不作数。请补选城市，或直接给 utcOffsetHours。',
      );
    }
    baseOffset = est.offset;
    tzSource = 'estimated';
    tzEstimated = true;
    tzEstimateMethod = est.method;
    tzEstimateKm = est.km;
    tzEstimateCity = est.city ? est.city.name : null;
    tzCity = est.city;
    sourceTzName = est.city ? est.city.tz : formatOffsetName(est.offset);
    warnings.push(
      est.city
        ? `未选城市：时区按最近的「${est.city.name}」（约 ${est.km}km）估算为 ${formatOffsetName(est.offset)}，夏令时规则沿用该城市——如不符请补选城市`
        : `未选城市：时区按经度 ${longitude.toFixed(2)}° 估算为 ${formatOffsetName(est.offset)}（已吸附到法定偏移，**未计夏令时**）——请核对`,
    );
  } else {
    if (input.tzPolicy === 'strict') {
      throw new Error('无法确定时区：既没有城市，也没有经纬度或 utcOffsetHours。请补齐出生地后再排盘。');
    }
    baseOffset = 8;
    tzSource = 'fallback';
    sourceTzName = formatOffsetName(8);
    tzFallback = true;
    warnings.push('未识别出生地时区，已按东八区（UTC+8）兜底——请补选城市或手动指定时区');
  }

  // ---- 1.5) 中国历史时区（1912–1949 五时区）----
  // 只在「城市 / 最近城市」决定时区时生效；显式 utcOffsetHours 是用户权威，不覆盖
  // （用户既然手填了偏移，就该按他填的算）。
  if (tzSource !== 'explicit') {
    const histCity = cityHit ?? tzCity;
    const hist = resolveChinaHistoricTz(histCity, civil.year, civil.month, civil.day);
    if (hist) {
      if (hist.offset !== baseOffset) {
        baseOffset = hist.offset;
      }
      warnings.push(hist.warning);
    }
  }

  // 显式时区 + 经纬度互相矛盾（旧地点残留，如「手动选纽约、经纬度还是沈阳」）：
  // 真太阳时按 793 分钟算能把 11:45 推到次日 00:42，必须停用，不能将错就错。
  let trueSolarBlockedByConflict = false;
  if (tzSource === 'explicit' && longitude != null) {
    const lonOffsetMin = 4 * (longitude - baseOffset * 15);
    if (Math.abs(lonOffsetMin) > GEO_MERIDIAN_TOLERANCE_MIN) {
      geoConflict = true;
      trueSolarBlockedByConflict = true;
      geoConflictNote = `经度 ${longitude.toFixed(2)}° 与所设时区 ${formatOffsetName(baseOffset)} 的中央经线差 ${(lonOffsetMin / 60).toFixed(1)} 小时；`
        + '判定为旧地点残留，真太阳时已停用（改用标准时）——请重选城市，或补填该地真实经度';
      warnings.push(geoConflictNote);
      longitude = null;
    }
  }

  // ---- 2) 夏令时：显式偏移视为「已含夏令时」，不再叠加 ----
  const civilMs = wallEpoch(civil.year, civil.month, civil.day, civil.hour, civil.minute, civil.second);
  const rule: DstRuleId = tzCity ? tzCity.dst : 'none';

  let inDst = false;
  if (tzSource !== 'explicit' && rule !== 'none') {
    // 先按「已是夏令时」试（回拨后重复的那一小时算夏令时，符合用户看到的钟）
    if (dstActiveAtStdWall(rule, baseOffset, civilMs - HOUR)) inDst = true;
    else if (dstActiveAtStdWall(rule, baseOffset, civilMs)) inDst = true;
  }
  const dstOffsetMinutes = inDst ? -60 : 0;
  const standardMs = civilMs + dstOffsetMinutes * 60000;
  const offset = baseOffset + (inDst ? 1 : 0);
  const utcMs = civilMs - offset * HOUR;

  if (inDst) {
    warnings.push('出生时值夏令时：钟面时间已减 1 小时还原为标准时，时柱/日柱按标准时定');
  }

  // 历史规则近似提示（EU 1996、US 2007 起才是现行规则）
  if (tzSource !== 'explicit' && rule !== 'none') {
    const y = civil.year;
    if (rule === 'EU' && y < 1996) warnings.push('EU 夏令时 1996 年才统一为现行起止规则，此年按现行规则近似');
    if (rule === 'US' && y < 2007) warnings.push('北美夏令时 2007 年才改为现行起止规则，此年按现行规则近似');
    if (rule === 'AU' && y < 2008) warnings.push('澳洲夏令时 2008 年才统一为现行起止规则，此年按现行规则近似');
    // 覆盖表（tz-data.ts）覆盖的时区：无论是否在夏令时，都把「这份数据的口径」说出来，
    // 不允许出现「用过期规则算出结果却零告警」（r6_compat.md P1-1）。
    if (rule.startsWith('TZ:')) {
      const note = tzOverrideNote(rule.slice(3), y);
      if (note) warnings.push(note);
    }
  }

  // ---- 3) 真太阳时 ----
  const trueSolarTimeEnabled = input.trueSolarTime !== false;
  const stdMeridian = baseOffset * 15;
  let trueSolar: CivilTime | null = null;
  let trueSolarOffsetMinutes: number | null = null;
  let longitudeOffsetMinutes: number | null = null;
  let equationOfTime: number | null = null;

  if (trueSolarTimeEnabled) {
    if (longitude == null) {
      if (!trueSolarBlockedByConflict) warnings.push('缺出生地经度，真太阳时未校正');
    } else {
      const eot = equationOfTimeMinutes(new Date(utcMs));
      const lonOffset = 4 * (longitude - stdMeridian);
      const total = lonOffset + eot;
      longitudeOffsetMinutes = lonOffset;
      equationOfTime = eot;
      trueSolarOffsetMinutes = total;
      trueSolar = partsFromMs(standardMs + Math.round(total * 60000));
    }
  }

  // ---- 4) 夏令时窗口（命中时给出，便于界面标注）----
  let dstWindow: TimeResolution['dstWindow'] = null;
  if (inDst) {
    const y = new Date(standardMs).getUTCFullYear();
    for (const yy of [y, y - 1, y + 1]) {
      const w = dstWindowForYear(rule, baseOffset, yy);
      if (w && standardMs >= w.start && standardMs < w.end) {
        const s = partsFromMs(w.start);
        const e = partsFromMs(w.end);
        const fmt = (p: CivilTime) => `${p.year}-${pad2(p.month)}-${pad2(p.day)} ${pad2(p.hour)}:${pad2(p.minute)}`;
        dstWindow = { startLocal: fmt(s), endLocal: fmt(e) };
        break;
      }
    }
  }

  return {
    civil,
    civilMs,
    standard: partsFromMs(standardMs),
    standardMs,
    utcMs,
    utc: partsFromMs(utcMs),
    utcOffsetHours: offset,
    baseUtcOffsetHours: baseOffset,
    inDst,
    dstOffsetMinutes,
    dstWindow,
    tzSource,
    sourceTzName,
    tzFallback,
    tzEstimated,
    tzEstimateMethod,
    tzEstimateKm,
    tzEstimateCity,
    geoConflict,
    geoConflictNote,
    stdMeridian,
    longitude,
    latitude,
    trueSolarTimeEnabled,
    trueSolar,
    trueSolarOffsetMinutes,
    longitudeOffsetMinutes,
    equationOfTimeMinutes: equationOfTime,
    cityName: cityHit ? cityHit.name : null,
    warnings,
  };
}

/** 便捷：UT 墙钟分量（caelus / 星历引擎直接吃的形态） */
export function utcParts(input: TimeResolveInput): CivilTime {
  return resolveTime(input).utc;
}

/** 便捷：真太阳时的细分（用于界面文案，如 12:13.4） */
export function formatCivilTime(t: CivilTime, withSeconds = false): string {
  const base = `${t.year}-${pad2(t.month)}-${pad2(t.day)} ${pad2(t.hour)}:${pad2(t.minute)}`;
  return withSeconds ? `${base}:${pad2(t.second)}` : base;
}

/** 排盘层统一入口的返回：折算后的钟面时间（年月日时分秒） */
export interface PaipanCivil {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
  /** 秒：节气交节判定必须要秒（否则 09:13:04 交清明，09:13:59 的盘会晚一柱） */
  second?: number;
}

/**
 * 晚子时口径落到底层钟面上：
 *  - '23' → 原样返回（23:40 仍是 23:40，下游按「23 点换日」进位，是通行口径）；
 *  - '00' → 23:40 拨成**同日** 00:40（早子时），日柱不进阶、时干按当日日干起。
 * 这样四家（八字/紫微/奇门/六爻）拿到的都是同一个已定好口径的钟面时间，
 * 不会出现「日柱进位了、时柱没进」的自相矛盾。
 */
export function applyLateZi(t: PaipanCivil, mode?: LateZiMode): { civil: PaipanCivil; applied: boolean } {
  if (mode !== '00' || t.hour !== 23) return { civil: t, applied: false };
  return { civil: { ...t, hour: 0 }, applied: true };
}

/**
 * 把「用户录入的民用时」折成「排盘该用的钟面时间」。
 *
 * 规则：
 *  - 入参没有任何时间线索（city/place/utcOffsetHours/经纬度）→ applied=false，原样返回，
 *    与旧实现逐字节一致（保证既有 424 条测试与不传地点的调用方零影响）。
 *  - 有时区/地点 → 先扣夏令时得 standard；trueSolarTime 开着且有经度就取真太阳时，否则用 standard。
 *  - 折算可能跨日（如 23:50 → 次日 00:05），四柱/紫微的换日逻辑自然跟着走，不需要另加特判。
 *  - 与 astro 的换算**不叠加**：astro 内部用 resolveTime，本函数只给四柱/紫微这类「吃钟面时分」的模块用。
 */
export function civilForPaipan(
  input: TimeResolveInput,
  opts: { yearRange?: YearRangeId; label?: string } = {},
): {
  civil: PaipanCivil;
  /**
   * 年柱/月柱（节气）判定专用钟面：**绝对时刻**换算到东八区，绝不折真太阳时。
   *
   * 节气（立春、惊蛰…）是一个物理瞬间，全国（乃至全球）在同一 UTC 时刻交节。
   * 真太阳时是「同一瞬间在不同经度上的日晷读数」，只能用来定日柱/时柱，
   * 拿它去比节气时刻会让月柱切点随经度平移 —— 实测漠河/乌鲁木齐差 139 分钟。
   * 所以这里的口径是混合的（这是正确做法，不是降级，故不进 warnings）：
   *   年柱、月柱 → switchCivil（钟面＝东八区，与节气的绝对时刻同口径）
   *   日柱、时柱 → civil（真太阳时，传统日晷口径）
   * 无地点线索时没有绝对时刻可言，switchCivil 退化为原样输入的钟面时间。
   */
  switchCivil: PaipanCivil;
  applied: boolean;
  usedTrueSolar: boolean;
  crossedDay: boolean;
  /** 是否按 0 点子正口径把 23:00–23:59 拨回当日早子时 */
  lateZiApplied: boolean;
  /** 本次生效的换日口径（界面标注用） */
  lateZiMode: LateZiMode;
  resolution: TimeResolution | null;
  /** 入参校验产生的提示（小数时间取整、strict:false 的 0 点回退等），必须回传给调用方 */
  warnings: string[];
} {
  // 统一校验（validate.ts）：所有吃钟面时间的排盘入口都从这里过，
  // 日期越界抛 InvalidDateError、时辰缺省抛 InvalidTimeError、小数时间取整写 warning。
  const v = validateDateTime(input as unknown as Record<string, unknown>, {
    yearRange: opts.yearRange ?? 'calendar',
    label: opts.label ?? '排盘时间',
  });
  const num = (v2: unknown): boolean => typeof v2 === 'number' && Number.isFinite(v2);
  const hasTzHint = input.city != null || input.place != null || num(input.utcOffsetHours);
  const hasGeo = num(input.lat) || num(input.latitude) || num(input.lon) || num(input.lonEast) || num(input.longitude);
  const lateZiMode: LateZiMode = input.lateZiMode === '00' ? '00' : '23';
  const raw: PaipanCivil = {
    year: v.year, month: v.month, day: v.day,
    hour: v.hour, minute: v.minute, second: v.second,
  };
  if (!hasTzHint && !hasGeo) {
    // 没有任何地点线索：仍按调用方给的钟面时间排，但换日口径照样统一执行
    const z = applyLateZi(raw, lateZiMode);
    return {
      civil: z.civil, switchCivil: raw, applied: false, usedTrueSolar: false,
      crossedDay: false, lateZiApplied: z.applied, lateZiMode, resolution: null,
      warnings: v.warnings,
    };
  }
  const r = resolveTime(input);
  const useSolar = !!(r.trueSolar && r.trueSolarTimeEnabled);
  const t = useSolar ? r.trueSolar! : r.standard;
  const conv: PaipanCivil = {
    year: t.year, month: t.month, day: t.day, hour: t.hour, minute: t.minute, second: t.second,
  };
  const z = applyLateZi(conv, lateZiMode);
  const civil = z.civil;
  const crossedDay = civil.year !== raw.year || civil.month !== raw.month || civil.day !== raw.day;
  // 节气判定用的绝对时刻钟面：UTC 瞬时 + 8h（东八区），与 lunar-javascript 的节气表同口径。
  // 不折真太阳时、不做晚子时拨动 —— 交节是物理瞬间，23:00 换日那条规则不参与。
  const bjMs = r.utcMs + 8 * 3600_000;
  const jq = partsFromMs(bjMs);
  const switchCivil: PaipanCivil = {
    year: jq.year, month: jq.month, day: jq.day, hour: jq.hour, minute: jq.minute, second: jq.second,
  };
  return {
    civil, switchCivil, applied: true, usedTrueSolar: useSolar, crossedDay,
    lateZiApplied: z.applied, lateZiMode, resolution: r,
    warnings: v.warnings,
  };
}

