/**
 * 生成复现码夹具（跨时区一致性用）：走**应用真实路径** state.tzSnapshotOfCivil → buildCode。
 *
 * 用法：node test/fixtures/qt2-encode.mjs <kind> <city> <y> <mo> <d> <h> <mi> <geoJson>
 * 输出：一行 JSON { code, warnings, snap }
 *
 * 断言点：同一个出生输入，在 TZ=Asia/Shanghai 与 TZ=America/New_York 下必须产出**逐字节相同**的码。
 * 只要码里还残留任何来自设备时区的量（比如 getTimezoneOffset），这条就立刻红。
 */
import { tzSnapshotOfCivil } from '../../../app/js/state.js';
import { buildCode } from '../../../app/js/sharecode.js';

const [kind, city, y, mo, d, h, mi, geoJson] = process.argv.slice(2);
if (!kind || !city) {
  console.error('usage: node qt2-encode.mjs <kind> <city> <y> <mo> <d> <h> <mi> <geoJson>');
  process.exit(2);
}
const geo = geoJson ? JSON.parse(geoJson) : {};
const civil = { y: +y, mo: +mo, d: +d, h: +h, mi: +mi };

const snap = tzSnapshotOfCivil(civil, { ...geo, city });
const extra = kind === 'liuyao'
  ? { yaoValues: [7, 8, 9, 6, 7, 8], source: 'manual', question: '' }
  : { gender: '男' };

const b = buildCode(kind, {
  civil,
  city: snap.city,
  tz: snap.tz,
  tzOffsetMinutes: snap.tzOffsetMinutes,
  tzEstimated: snap.tzEstimated,
  inDst: snap.inDst,
  lon: snap.lon,
  lat: snap.lat,
  ...extra,
});

process.stdout.write(JSON.stringify({
  code: b.code,
  warnings: b.warnings,
  snap: { tz: snap.tz, offsetMinutes: snap.tzOffsetMinutes, inDst: snap.inDst, estimated: snap.tzEstimated },
}));
