/**
 * 复现码跨时区对拍夹具（由 test/sharecode-qt2.test.ts 以不同 TZ 子进程调用）
 *
 * 用法：node test/fixtures/qt2-plate.mjs <code>
 * 输出：一行 JSON，含该码解出的盘面 + 解出的钟面/时区
 *
 * 关键点：这里**不读设备时区**，一切从码里的钟面 + 时区偏移出发——
 * 如果哪天有人把 `new Date(d.at).getHours()` 又写回视图里，这个夹具就会在两个 TZ 下
 * 输出不同的盘，测试立刻红。
 */
import { decodeCode, civilFromAt } from '../../../app/js/sharecode.js';
import { paipanZi } from '../../../app/js/zischool.js';
import { cfg } from '../../../app/js/state.js';
import * as CORE from '../../../app/vendor/liuyao-core.js';

const code = process.argv[2];
if (!code) {
  console.error('usage: node qt2-plate.mjs <code>');
  process.exit(2);
}

const d = decodeCode(code);
// QT1 码没有钟面：只能按**本机时区**还原（这正是旧码的缺陷，夹具如实照做）
const civil = d.civil || civilFromAt(d.at);
if (d.lateZi) cfg.lateZi = d.lateZi;
const args = {
  year: civil.y, month: civil.mo, day: civil.d, hour: civil.h, minute: civil.mi,
  gender: d.gender || '男',
  city: d.city || undefined,
  place: d.city || undefined,
  lat: d.lat, latitude: d.lat,
  lon: d.lon, lonEast: d.lon, longitude: d.lon,
  utcOffsetHours: Number.isFinite(d.tzOffsetMinutes) ? d.tzOffsetMinutes / 60 : undefined,
  trueSolarTime: !!d.apparentSolarTime,
  lateZiMode: d.lateZi === '00' ? '00' : '23',
};

const out = {
  deviceTz: process.env.TZ || '(system)',
  kind: d.kind,
  civil: d.civil,
  tzOffsetMinutes: d.tzOffsetMinutes,
  city: d.city,
  tz: d.tz,
  warnings: d.warnings,
  plate: null,
};

try {
  if (d.kind === 'ziwei') {
    const z = CORE.paiZiwei(args);
    // 大限/流年四化：固定一个目标时刻（2026-11-21 12:00），只验「两个时区算出来一致」
    const yun = CORE.ziweiYunXian(args, { year: 2026, month: 11, day: 21, hour: 12 });
    out.plate = { ziwei: z, yun };
  } else if (d.kind === 'bazi') {
    out.plate = { bazi: CORE.paiBazi(args) };
  } else if (d.kind === 'astro') {
    out.plate = { astro: CORE.paipanXingpan(args) };
  } else if (d.kind === 'vedic') {
    out.plate = { vedic: CORE.paipanVedic(args) };
  } else if (d.kind === 'liuyao') {
    out.plate = {
      liuyao: paipanZi({
        yaoValues: d.yaoValues,
        year: civil.y, month: civil.mo, day: civil.d, hour: civil.h, minute: civil.mi,
        gender: args.gender, question: d.question || '',
      }),
    };
  } else {
    out.plate = { note: '该类型不在跨时区对拍范围内' };
  }
} catch (e) {
  out.error = String((e && e.message) || e);
}

process.stdout.write(JSON.stringify(out));
