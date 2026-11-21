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
 * 1. 中国境内（含新疆、西藏）一律 UTC+8 —— 这是官方时区，**不按经度拆**。
 *    所以乌鲁木齐钟面 12:00 的 UTC 时刻与北京一样，差的是真太阳时（约 2.1 小时），
 *    不是时区。
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
export type DstRuleId = 'none' | 'CN1986' | 'EU' | 'US' | 'AU' | 'NZ' | 'CL' | 'IL';

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
  tzSource: 'explicit' | 'city' | 'fallback';
  /** 时区名（IANA；兜底/显式时给 UTC±HH:MM） */
  sourceTzName: string;
  /** true = 没查到城市、按东八区兜底（前端必须显示出来） */
  tzFallback: boolean;
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
  ['德黑兰', 'tehran', '伊朗', 'Asia/Tehran', 35.6892, 51.3890, 3.5, 'none'],
  ['特拉维夫', 'tel aviv', '以色列', 'Asia/Jerusalem', 32.0853, 34.7818, 2, 'IL'],

  // —— 非洲 ——
  ['开罗', 'cairo', '埃及', 'Africa/Cairo', 30.0444, 31.2357, 2, 'none'],
  ['内罗毕', 'nairobi', '肯尼亚', 'Africa/Nairobi', -1.2921, 36.8219, 3, 'none'],
  ['约翰内斯堡', 'johannesburg', '南非', 'Africa/Johannesburg', -26.2041, 28.0473, 2, 'none'],
  ['开普敦', 'cape town', '南非', 'Africa/Johannesburg', -33.9249, 18.4241, 2, 'none'],
  ['拉各斯', 'lagos', '尼日利亚', 'Africa/Lagos', 6.5244, 3.3792, 1, 'none'],
  ['卡萨布兰卡', 'casablanca', '摩洛哥', 'Africa/Casablanca', 33.5731, -7.5898, 1, 'none'],
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
  ['墨西哥城', 'mexico city', '墨西哥', 'America/Mexico_City', 19.4326, -99.1332, -6, 'none'],
  ['瓜达拉哈拉', 'guadalajara', '墨西哥', 'America/Mexico_City', 20.6597, -103.3496, -6, 'none'],
  ['蒂华纳', 'tijuana', '墨西哥', 'America/Tijuana', 32.5149, -117.0382, -8, 'US'],

  // —— 中南美 ——
  ['圣保罗', 'sao paulo', '巴西', 'America/Sao_Paulo', -23.5505, -46.6333, -3, 'none'],
  ['里约热内卢', 'rio de janeiro', '巴西', 'America/Sao_Paulo', -22.9068, -43.1729, -3, 'none'],
  ['布宜诺斯艾利斯', 'buenos aires', '阿根廷', 'America/Argentina/Buenos_Aires', -34.6037, -58.3816, -3, 'none'],
  ['圣地亚哥', 'santiago', '智利', 'America/Santiago', -33.4489, -70.6693, -4, 'CL'],
  ['利马', 'lima', '秘鲁', 'America/Lima', -12.0464, -77.0428, -5, 'none'],
  ['波哥大', 'bogota', '哥伦比亚', 'America/Bogota', 4.7110, -74.0721, -5, 'none'],
  ['基多', 'quito', '厄瓜多尔', 'America/Guayaquil', -0.1807, -78.4678, -5, 'none'],
  ['加拉加斯', 'caracas', '委内瑞拉', 'America/Caracas', 10.4806, -66.9036, -4, 'none'],
  ['蒙得维的亚', 'montevideo', '乌拉圭', 'America/Montevideo', -34.9011, -56.1645, -3, 'none'],
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
  return Date.UTC(y, mo - 1, d, h, mi, s);
}

const HOUR = 3600000;

/**
 * 某年的夏令时窗口（**标准时墙钟**口径）：[start, end)
 * - 起点 = 拨快那一刻的标准时（一般 02:00）
 * - 止点 = 回拨那一刻的标准时（一般 01:00，因为回拨发生在 02:00 夏令时）
 * 南半球（AU/NZ/CL）窗口跨年：[start(年), end(年+1))
 */
function dstWindowForYear(rule: DstRuleId, stdOffset: number, year: number): { start: number; end: number } | null {
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

function mod360(x: number): number {
  return ((x % 360) + 360) % 360;
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

function assertValidCivil(t: CivilTime): void {
  const { year, month, day, hour, minute, second } = t;
  if (![year, month, day, hour, minute, second].every((n) => Number.isFinite(n))) {
    throw new Error('时间入参必须是有限数值（year/month/day/hour…）');
  }
  if (month < 1 || month > 12 || day < 1 || day > 31 || hour < 0 || hour > 23 || minute < 0 || minute > 59 || second < 0 || second > 59) {
    throw new Error(`时间入参越界：${year}-${month}-${day} ${hour}:${minute}:${second}`);
  }
  const probe = new Date(Date.UTC(year, month - 1, day));
  if (probe.getUTCFullYear() !== year || probe.getUTCMonth() !== month - 1 || probe.getUTCDate() !== day) {
    throw new Error(`不存在的日期：${year}-${month}-${day}`);
  }
}

/**
 * 统一时间解析：本地民用时 + 出生地 → UTC 绝对时刻 / 夏令时 / 真太阳时。
 *
 * 优先级：utcOffsetHours（显式） > 城市查表 > 东八区兜底（tzFallback = true）。
 * 纯函数：同一个入参永远同一结果，不读时钟、不读存储、不碰 DOM。
 */
export function resolveTime(input: TimeResolveInput): TimeResolution {
  const civil: CivilTime = {
    year: input.year,
    month: input.month,
    day: input.day,
    hour: input.hour,
    minute: input.minute ?? 0,
    second: input.second ?? 0,
  };
  assertValidCivil(civil);

  const warnings: string[] = [];
  const lonRaw = input.lon ?? input.lonEast ?? input.longitude;
  const latRaw = input.lat ?? input.latitude;

  // ---- 1) 城市与时区 ----
  const cityHit = lookupCityTimeZone(input.city) ?? lookupCityTimeZone(input.place);
  let longitude = Number.isFinite(lonRaw as number) ? (lonRaw as number) : null;
  let latitude = Number.isFinite(latRaw as number) ? (latRaw as number) : null;
  if (cityHit && (longitude == null || latitude == null)) {
    // 只选了城市、没给经纬度：用城市中心补上（真太阳时才有得算）
    longitude = longitude ?? cityHit.lon;
    latitude = latitude ?? cityHit.lat;
  }

  let tzSource: TimeResolution['tzSource'];
  let baseOffset: number;
  let sourceTzName: string;
  let tzFallback = false;

  if (Number.isFinite(input.utcOffsetHours as number)) {
    baseOffset = input.utcOffsetHours as number;
    tzSource = 'explicit';
    sourceTzName = cityHit ? cityHit.tz : formatOffsetName(baseOffset);
  } else if (cityHit) {
    baseOffset = cityHit.stdOffset;
    tzSource = 'city';
    sourceTzName = cityHit.tz;
  } else {
    baseOffset = 8;
    tzSource = 'fallback';
    sourceTzName = formatOffsetName(8);
    tzFallback = true;
    warnings.push('未识别出生地时区，已按东八区（UTC+8）兜底——请补选城市或手动指定时区');
  }

  // ---- 2) 夏令时：显式偏移视为「已含夏令时」，不再叠加 ----
  const civilMs = wallEpoch(civil.year, civil.month, civil.day, civil.hour, civil.minute, civil.second);
  const rule: DstRuleId = cityHit ? cityHit.dst : 'none';

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
      warnings.push('缺出生地经度，真太阳时未校正');
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

/** 排盘层统一入口的返回：折算后的钟面时间（年月日时分） */
export interface PaipanCivil {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
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
export function civilForPaipan(input: TimeResolveInput): {
  civil: PaipanCivil;
  applied: boolean;
  usedTrueSolar: boolean;
  crossedDay: boolean;
  resolution: TimeResolution | null;
} {
  const num = (v: unknown): boolean => typeof v === 'number' && Number.isFinite(v);
  const hasTzHint = input.city != null || input.place != null || num(input.utcOffsetHours);
  const hasGeo = num(input.lat) || num(input.latitude) || num(input.lon) || num(input.lonEast) || num(input.longitude);
  const raw: PaipanCivil = {
    year: input.year, month: input.month, day: input.day,
    hour: input.hour, minute: input.minute ?? 0,
  };
  if (!hasTzHint && !hasGeo) {
    return { civil: raw, applied: false, usedTrueSolar: false, crossedDay: false, resolution: null };
  }
  const r = resolveTime(input);
  const useSolar = !!(r.trueSolar && r.trueSolarTimeEnabled);
  const t = useSolar ? r.trueSolar! : r.standard;
  const civil: PaipanCivil = { year: t.year, month: t.month, day: t.day, hour: t.hour, minute: t.minute };
  const crossedDay = civil.year !== raw.year || civil.month !== raw.month || civil.day !== raw.day;
  return { civil, applied: true, usedTrueSolar: useSolar, crossedDay, resolution: r };
}

