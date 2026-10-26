// 复现码 v2 桩测：v2 往返 + 配置块 + 校验 + v1 向后兼容
// 运行：node v91_src/check_sharecode_v2.mjs
import { encodeCode, decodeCode, looksLikeCode, RULE_VERSION, KIND_ID } from '../app/js/sharecode.js';

let pass = 0; let fail = 0;
const eq = (a, b, msg) => {
  const sa = JSON.stringify(a); const sb = JSON.stringify(b);
  if (sa === sb) { pass++; } else { fail++; console.log(`✗ ${msg}\n   得到 ${sa}\n   期望 ${sb}`); }
};
const ok = (c, msg) => { if (c) { pass++; } else { fail++; console.log(`✗ ${msg}`); } };
const throws = (fn, msg) => { try { fn(); fail++; console.log(`✗ 应抛错但没抛: ${msg}`); } catch { pass++; } };

/* 复刻 v1 编码器（只用于构造历史码，验证向后兼容） */
const B64 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_';
function b64url(bytes) {
  let out = '';
  for (let i = 0; i < bytes.length; i += 3) {
    const b0 = bytes[i]; const b1 = bytes[i + 1]; const b2 = bytes[i + 2];
    out += B64[b0 >> 2];
    out += B64[((b0 & 3) << 4) | ((b1 === undefined ? 0 : b1) >> 4)];
    if (b1 === undefined) break;
    out += B64[((b1 & 15) << 2) | ((b2 === undefined ? 0 : b2) >> 6)];
    if (b2 === undefined) break;
    out += B64[b2 & 63];
  }
  return out;
}
function v1Code(kindId, atSec, tail) {
  const body = [((1 << 4) | kindId), (atSec >>> 24) & 255, (atSec >>> 16) & 255, (atSec >>> 8) & 255, atSec & 255, ...tail];
  const sum = body.reduce((a, b) => (a + b) & 255, 0);
  return 'QT1-' + b64url([...body, sum]);
}

/* ---------- 1. 基础往返 ---------- */
{
  const at = Date.UTC(2026, 9, 26, 3, 0, 0);
  const code = encodeCode('meihua', { at });
  const d = decodeCode(code);
  eq(d.kind, 'meihua', 'meihua 类型');
  eq(d.version, 2, 'meihua 版本=2');
  eq(d.at, at, 'meihua 时间还原');
  eq(d.ruleVersion, RULE_VERSION, 'meihua 规则版本');
  eq(d.ruleStale, false, 'meihua 规则版本不过期');
  ok(looksLikeCode(code), 'looksLikeCode 认自家码');
  ok(code.startsWith('QT1-'), '前缀仍为 QT1-');
}

/* ---------- 2. 计算配置块 ---------- */
{
  const at = Date.UTC(2026, 0, 2, 1, 0, 0);
  const code = encodeCode('qimen', { at, lateZi: '00', apparentSolarTime: true, lon: 123.43, lat: 41.81 });
  const d = decodeCode(code);
  eq(d.lateZi, '00', '晚子时流派 = 子正换日');
  eq(d.apparentSolarTime, true, '真太阳时开关');
  eq(d.geo, { lon: 123.43, lat: 41.81 }, '观测地经纬度');
  // 默认配置：不置位
  const d2 = decodeCode(encodeCode('qimen', { at }));
  eq(d2.lateZi, '23', '默认晚子时 = 23 点换日');
  eq(d2.apparentSolarTime, false, '默认关真太阳时');
  eq(d2.geo, undefined, '默认不带观测地');
}

/* ---------- 3. 牌组 id（cards） ---------- */
{
  const at = Date.UTC(2026, 5, 1, 10, 0, 0);
  const cards = [{ index: 0, reversed: false }, { index: 13, reversed: true }, { index: 77, reversed: false }];
  const code = encodeCode('cards', { at, spreadIndex: 3, cards, deckId: 'sb' });
  const d = decodeCode(code);
  eq(d.spreadIndex, 3, '牌阵下标');
  eq(d.deckId, 'sb', '牌组 id');
  eq(d.cards, cards, '牌序与逆位');
  // 非 cards 型不写牌组位
  eq(decodeCode(encodeCode('liuyao', { at, deckId: 'sb' })).deckId, undefined, '非 cards 型忽略 deckId');
}

/* ---------- 4. 六爻原始输入 ---------- */
{
  const at = Date.UTC(2026, 3, 9, 2, 30, 0);
  const code = encodeCode('liuyao', { at, source: 'coins', yaoValues: [6, 7, 8, 9, 7, 8], question: '问工作' });
  const d = decodeCode(code);
  eq(d.source, 'coins', '起卦来源');
  eq(d.yaoValues, [6, 7, 8, 9, 7, 8], '六爻值');
  eq(d.question, '问工作', '所问');
}

/* ---------- 5. astro 自带经纬度，不吃 geo 位 ---------- */
{
  const at = Date.UTC(2026, 2, 3, 4, 0, 0);
  const d = decodeCode(encodeCode('astro', { at, gender: '男', lon: 116.4, lat: 39.9 }));
  eq(d.lon, 116.4, 'astro 经度');
  eq(d.lat, 39.9, 'astro 纬度');
  eq(d.geo, undefined, 'astro 不重复带 geo');
}

/* ---------- 6. 校验：篡改/截断/未知类型 ---------- */
{
  const code = encodeCode('meihua', { at: Date.UTC(2026, 0, 1) });
  const bad = code.slice(0, -2) + (code.slice(-2, -1) === 'A' ? 'B' : 'A') + code.slice(-1);
  throws(() => decodeCode(bad), '篡改码应校验失败');
  throws(() => decodeCode('QT1-AAA'), '过短码应报不完整');
  throws(() => decodeCode(''), '空码应报错');
  throws(() => encodeCode('nope', {}), '未知类型应抛错');
  // 头字节高 4 位 = 3 → 版本不支持
  const v3 = (() => {
    const body = [((3 << 4) | 2), 0, 0, 0, 0];
    const sum = body.reduce((a, b) => (a + b) & 255, 0);
    return 'QT1-' + b64url([...body, sum]);
  })();
  throws(() => decodeCode(v3), 'v3 码应报版本不支持');
}

/* ---------- 7. v1 向后兼容 ---------- */
{
  // v1 liuyao：head(1) + at(4) + src(1) + packed(2) + strLen(2)+bytes + check
  const atSec = Math.floor(Date.UTC(2026, 6, 1, 5, 0, 0) / 1000);
  const q = '旧码问题';
  const qb = [...new TextEncoder().encode(q)];
  const packed = 0b11_10_01_00_11_10; // 6,7,8,9,6,7 之类
  const v1 = v1Code(1, atSec, [1, (packed >> 8) & 255, packed & 255, (qb.length >> 8) & 255, qb.length & 255, ...qb]);
  const d = decodeCode(v1);
  eq(d.version, 1, 'v1 码版本识别');
  eq(d.kind, 'liuyao', 'v1 类型');
  eq(d.at, atSec * 1000, 'v1 时间');
  eq(d.source, 'coins', 'v1 起卦来源');
  eq(d.question, q, 'v1 所问');
  eq(d.ruleStale, false, 'v1 不报规则过期（无此信息）');
  // v1 meihua 最短码
  const d2 = decodeCode(v1Code(2, atSec, []));
  eq(d2.kind, 'meihua', 'v1 梅花最短码');
  eq(d2.version, 1, 'v1 梅花版本');
}

/* ---------- 8. 全类型冒烟 ---------- */
{
  const at = Date.UTC(2026, 8, 9, 12, 0, 0);
  for (const k of Object.keys(KIND_ID)) {
    const d = decodeCode(encodeCode(k, { at }));
    eq(d.kind, k, `类型往返 ${k}`);
    eq(d.at, at, `时间往返 ${k}`);
  }
}

/* ---------- 9. v121 补齐的 7 类术数 ---------- */
{
  const at = Date.UTC(2026, 9, 26, 7, 30, 0);

  // 大六壬 / 小六壬：起课不含随机，时刻（+配置）即全部
  for (const k of ['daliuren', 'xiaoliuren']) {
    const d = decodeCode(encodeCode(k, { at }));
    eq(d.kind, k, `${k} 类型`);
    eq(d.at, at, `${k} 时间`);
  }

  // 地占：母符 16 位 + 所问宫 + 问题
  const dg = decodeCode(encodeCode('geomancy', { at, mothers: 0b1011_0101_1100_0011, qHouse: 7, question: '此事成否' }));
  eq(dg.kind, 'geomancy', '地占 类型');
  eq(dg.mothers, 0b1011_0101_1100_0011, '地占 母符位');
  eq(dg.qHouse, 7, '地占 所问宫');
  eq(dg.question, '此事成否', '地占 所问');

  // 藏占：骰式（1..4 ×3）
  const d1 = decodeCode(encodeCode('tibetan', { at, mode: 'dice', dice: [3, 1, 4], question: '出行' }));
  eq(d1.mode, 'dice', '藏占 骰模式');
  eq(d1.dice, [3, 1, 4], '藏占 骰式');
  eq(d1.question, '出行', '藏占 所问');
  // 藏占：钱式（1..8 索引 ×2）
  const d2 = decodeCode(encodeCode('tibetan', { at, mode: 'coin', coin: [8, 1] }));
  eq(d2.mode, 'coin', '藏占 钱模式');
  eq(d2.coin, [8, 1], '藏占 钱式');

  // 吠陀：出生时刻 + 经纬度（本体数据，不另占 geo 标志位）
  const dv = decodeCode(encodeCode('vedic', { at, gender: '女', lon: 116.4074, lat: 39.9042 }));
  eq(dv.kind, 'vedic', '吠陀 类型');
  eq(dv.gender, '女', '吠陀 性别');
  eq(dv.lon, 116.41, '吠陀 经度');
  eq(dv.lat, 39.9, '吠陀 纬度');
  ok(!dv.geo, '吠陀 经纬度走本体数据、不重复置 geo 位');

  // 阳宅：坐向 + 六类房间九宫掩码 + 建房年 + 居住人 + 门外形势
  const dy = decodeCode(encodeCode('yangzhai', {
    at, facingDeg: 152.5,
    rooms: { door: [8], master: [0, 3], second: [], living: [4], kitchen: [1], bath: [5] },
    built: 2003, personY: 1994, personG: 'm', shapes: [0, 1, 3, 4],
  }));
  eq(dy.kind, 'yangzhai', '阳宅 类型');
  eq(dy.facingDeg, 152.5, '阳宅 坐向');
  eq(dy.rooms.master, [0, 3], '阳宅 主卧方位');
  eq(dy.rooms.second, [], '阳宅 次卧空');
  eq(dy.rooms.kitchen, [1], '阳宅 厨房方位');
  eq(dy.built, 2003, '阳宅 建房年');
  eq(dy.personY, 1994, '阳宅 居住人年');
  eq(dy.personG, 'm', '阳宅 居住人性别');
  eq(dy.shapes, [0, 1, 3, 4], '阳宅 形势勾选');

  // 符箓：纯文献页，码只带时刻
  const dz = decodeCode(encodeCode('zhuyou', { at }));
  eq(dz.kind, 'zhuyou', '符箓 类型');
  eq(dz.at, at, '符箓 时间');

  // 配置块对新增类型同样生效
  const dc = decodeCode(encodeCode('daliuren', { at, lateZi: '00', apparentSolarTime: true, lon: 123.43, lat: 41.81 }));
  eq(dc.lateZi, '00', '大六壬 晚子时流派');
  eq(dc.apparentSolarTime, true, '大六壬 真太阳时');
  eq(dc.geo.lon, 123.43, '大六壬 观测地经度');
  eq(dc.geo.lat, 41.81, '大六壬 观测地纬度');
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
