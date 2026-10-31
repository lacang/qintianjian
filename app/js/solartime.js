// 真太阳时 / 均时差 / 日出日落 / 行星时 —— 纯本地天文算法（NOAA 太阳位置算法）
// 铁律：不接 AI、无外部请求。均时差 = 真太阳时 − 平太阳时，主要来自地球轨道偏心率与黄赤交角。
// 出处：NOAA Global Monitoring Division 太阳计算器算法（NOAA Solar Calculator），
// 系 Meeus《Astronomical Algorithms》低阶展开的通行工程版本，误差约 ±1 分钟内（对命理时刻判定足够）。
// v111：观测地不再写死沈阳 —— 优先用调用方传入的经纬，否则取"当前地点"（geo.js，定位或手选城市）
import { getPlace } from './geo.js?v=123';

const rad = Math.PI / 180;

function norm360(x) { const r = x % 360; return r < 0 ? r + 360 : r; }

// 观测地兜底：没传就用当前地点（不再有硬编码沈阳）
function obsOf(lat, lon) {
  const p = getPlace();
  return { lat: Number.isFinite(lat) ? lat : p.lat, lon: Number.isFinite(lon) ? lon : p.lon };
}

// 太阳几何参数：黄经、赤纬、均时差（分钟）
export function solarParams(date) {
  const jd = date.getTime() / 86400000 + 2440587.5;
  const T = (jd - 2451545.0) / 36525.0; // 儒略世纪数
  const L0 = norm360(280.46646 + T * (36000.76983 + T * 0.0003032)); // 平黄经
  const M = rad * norm360(357.52911 + T * (35999.05029 - 0.0001537 * T)); // 平近点角
  const e = 0.016708634 - T * (0.000042037 + 0.0000001267 * T); // 轨道偏心率
  const C = Math.sin(M) * (1.914602 - T * (0.004817 + 0.000014 * T))
    + Math.sin(2 * M) * (0.019993 - 0.000101 * T)
    + Math.sin(3 * M) * 0.000289; // 中心差
  const omega = 125.04 - 1934.136 * T; // 升交点黄经
  const appLong = L0 + C - 0.00569 - 0.00478 * Math.sin(rad * omega); // 视黄经
  const meanObliq = 23 + (26 + (21.448 - T * (46.815 + T * (0.00059 - T * 0.001813))) / 60) / 60; // 平黄赤交角
  const obliq = meanObliq + 0.00256 * Math.cos(rad * omega); // 真黄赤交角
  const decl = Math.asin(Math.sin(rad * obliq) * Math.sin(rad * appLong)) / rad; // 太阳赤纬
  const varY = Math.tan(rad * obliq / 2) ** 2;
  // 均时差（分钟）：视太阳 − 平太阳
  const eqTime = 4 * (
    varY * Math.sin(2 * rad * L0)
    - 2 * e * Math.sin(M)
    + 4 * e * varY * Math.sin(M) * Math.cos(2 * rad * L0)
    - 0.5 * varY * varY * Math.sin(4 * rad * L0)
    - 1.25 * e * e * Math.sin(2 * rad * M)
  ) / rad;
  return { T, eqTime, decl, appLong, obliq };
}

// 真太阳时总改正（分钟）= 均时差 + 经度差（东经每偏东 1° 早 4 分钟）
export function trueSolarOffsetMin(date, lon, stdMeridian = 120) {
  const { eqTime } = solarParams(date);
  const lo = Number.isFinite(lon) ? lon : getPlace().lon;
  return eqTime + 4 * (lo - stdMeridian);
}

export function toTrueSolar(date, lon, stdMeridian = 120) {
  return new Date(date.getTime() + trueSolarOffsetMin(date, lon, stdMeridian) * 60000);
}

// 日出日落（北京时间 Date → 当地当日；太阳高度 -0.833°，含大气折射与视半径）
export function sunTimes(date, lat, lon) {
  const o = obsOf(lat, lon);
  const noon = new Date(date); noon.setHours(12, 0, 0, 0);
  const { eqTime, decl } = solarParams(noon);
  const solarNoonUtcMin = 720 - 4 * o.lon - eqTime; // UTC 分钟
  const cosH = (Math.sin(rad * -0.833) - Math.sin(rad * o.lat) * Math.sin(rad * decl)) / (Math.cos(rad * o.lat) * Math.cos(rad * decl));
  if (cosH > 1 || cosH < -1) return null; // 极夜 / 极昼
  const H = Math.acos(cosH) / rad;
  const utcMidnight = Date.UTC(date.getFullYear(), date.getMonth(), date.getDate());
  return {
    sunrise: new Date(utcMidnight + (solarNoonUtcMin - 4 * H) * 60000),
    sunset: new Date(utcMidnight + (solarNoonUtcMin + 4 * H) * 60000),
  };
}

// ---------- 行星时（古典占星迦勒底秩序） ----------
// 行星日：以日出为日界；司日星＝该日第一时主。星期名即由七政轮值而来。
// 时主序（迦勒底次序，自土星由远及近）：土木火日金水月。
// 出处：行星日时制见古典占星文献通行记述，如 Firmicus Maternus《Matheseos Libri VIII》、
// Vettius Valens《Anthologiae》之时主（chronocrator）体系。
const CHALDEAN = ['土星', '木星', '火星', '太阳', '金星', '水星', '月亮'];
const DAY_RULER = { 0: '太阳', 1: '月亮', 2: '火星', 3: '水星', 4: '木星', 5: '金星', 6: '土星' }; // getDay():0=周日

export const PLANET_HR = {
  太阳: { k: '求名、见贵、公开事务、向权威争取', s: '古典谓太阳时宜为日光所照之事：求名见官、公开宣言、开始被看见的事。' },
  月亮: { k: '家宅、亲人、日常起居、流动之事', s: '古典谓月亮时宜居家安顿、走动亲友、处理随日子流动的日常。' },
  水星: { k: '文书、交易、学习、沟通谈判', s: '古典谓水星时宜写、算、谈、学——一切以文字与消息为主的事。' },
  金星: { k: '感情、和好、宴饮、美化修饰', s: '古典谓金星时宜结好、和解、订盟、裁衣修饰与一切使人愉悦之事。' },
  火星: { k: '行动、竞争、拆解、攻坚', s: '古典谓火星时宜速战速决与体力之事，忌签约和好——古人以为其性刚急。' },
  木星: { k: '扩张、贵人、远行、法律、求财', s: '古典谓木星时宜求人扶助、启程远行、立约兴事——古人以为其性宽缓主吉。' },
  土星: { k: '整理、了结、长期积累、清偿旧事', s: '古典谓土星时宜收不宜放：清旧账、断舍离、为长事打地基，忌启新求快。' },
};

export function planetaryHour(date, lat, lon) {
  const o = obsOf(lat, lon);
  const today = sunTimes(date, o.lat, o.lon);
  if (!today) return null;
  const next = sunTimes(new Date(date.getTime() + 86400000), o.lat, o.lon);
  const prev = sunTimes(new Date(date.getTime() - 86400000), o.lat, o.lon);
  if (!next || !prev) return null;
  const { sunrise, sunset } = today;
  const dayHourMs = (sunset - sunrise) / 12;
  const nightLen = next.sunrise - sunset;
  const nightHourMs = nightLen / 12;

  let isDay, baseStart, hourMs, idx;
  if (date >= sunrise && date < sunset) {
    isDay = true; baseStart = sunrise; hourMs = dayHourMs;
    idx = Math.min(11, Math.floor((date - sunrise) / dayHourMs));
  } else {
    isDay = false; hourMs = nightHourMs;
    const inNight = date >= sunset;
    baseStart = inNight ? sunset : prev.sunset;
    const segLen = inNight ? nightLen : (sunrise - prev.sunset);
    idx = Math.min(11, Math.floor((date - baseStart) / (segLen / 12)));
  }
  // 司日星＝该行星日第一时主。行星日从"当地日出"起算、到次日日出止（古典通行定义）：
  //   昼时用当日日出那一日的星期主；日落后的夜时仍是"当日日出起算的那个行星日"的第 13–24 时；
  //   次日日出前的夜时则属于前一日日出起算的行星日。
  const rulerDate = isDay ? sunrise : (date >= sunset ? sunrise : prev.sunrise);
  const dayRuler = DAY_RULER[rulerDate.getDay()];
  const startIdx = CHALDEAN.indexOf(dayRuler);
  const globalHour = isDay ? idx : 12 + idx;
  const hourPlanet = CHALDEAN[(startIdx + globalHour) % 7];
  const start = new Date(baseStart.getTime() + idx * hourMs);
  const end = new Date(start.getTime() + hourMs);
  return {
    isDay, dayRuler, hourPlanet,
    hourNo: idx + 1, start, end,
    sunrise, sunset,
    phase: isDay ? '昼' : '夜',
    dayHours: Math.round(dayHourMs / 60000), nightHours: Math.round(nightHourMs / 60000),
  };
}

// 行星时择时：列出某日从日出到次日日出的 24 个时（12 昼 + 12 夜）及其时主
// 出处同 planetaryHour：迦勒底次序时主；日界为当地日出。
export function planetaryHoursOfDay(date, lat, lon) {
  const o = obsOf(lat, lon);
  const day0 = new Date(date); day0.setHours(0, 0, 0, 0);
  const t = sunTimes(day0, o.lat, o.lon);
  const tNext = sunTimes(new Date(day0.getTime() + 86400000), o.lat, o.lon);
  const tPrev = sunTimes(new Date(day0.getTime() - 86400000), o.lat, o.lon);
  if (!t || !tNext || !tPrev) return null;
  const out = [];
  const mk = (isDay, baseStart, segLen, dayRuler) => {
    const startIdx = CHALDEAN.indexOf(dayRuler);
    const hourMs = segLen / 12;
    for (let i = 0; i < 12; i++) {
      const start = new Date(baseStart.getTime() + i * hourMs);
      const end = new Date(start.getTime() + hourMs);
      const planet = CHALDEAN[(startIdx + (isDay ? i : 12 + i)) % 7];
      out.push({ no: i + 1, isDay, planet, start, end, dayRuler });
    }
  };
  mk(true, t.sunrise, t.sunset - t.sunrise, DAY_RULER[t.sunrise.getDay()]);
  mk(false, t.sunset, tNext.sunrise - t.sunset, DAY_RULER[t.sunrise.getDay()]);
  return { hours: out, sunrise: t.sunrise, sunset: t.sunset };
}

// 四余：罗睺（黄白升交点）/ 计都（降交点）/ 月孛（月球轨道远地点）——平均根数（Meeus）
export function siyuLongitudes(date) {
  const jd = date.getTime() / 86400000 + 2440587.5;
  const T = (jd - 2451545.0) / 36525.0;
  const omega = norm360(125.0445479 - 1934.1362891 * T + 0.0000754 * T * T + T * T * T / 503361 - T * T * T * T / 60616000);
  const perigee = norm360(83.3532465 + 4069.0137287 * T - 0.0103200 * T * T - T * T * T / 80053 + T * T * T * T / 18999000);
  return { luohou: omega, jidu: norm360(omega + 180), yuebei: norm360(perigee + 180) };
}
