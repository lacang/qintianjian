// 分享码编解码探针
import { encodeCode, decodeCode, looksLikeCode } from '../app/js/sharecode.js';

let pass = 0, fail = 0;
const eq = (name, a, b) => {
  const ok = JSON.stringify(a) === JSON.stringify(b);
  if (ok) { pass++; } else { fail++; console.log(`  ✗ ${name}\n    got ${JSON.stringify(a)}\n    exp ${JSON.stringify(b)}`); }
};
const ok = (name, v) => { if (v) pass++; else { fail++; console.log(`  ✗ ${name}`); } };
const throws = (name, fn, kw) => {
  try { fn(); fail++; console.log(`  ✗ ${name} 未抛错`); }
  catch (e) { if (!kw || e.message.includes(kw)) pass++; else { fail++; console.log(`  ✗ ${name} 错误信息不符: ${e.message}`); } }
};

const AT = new Date('2026-11-11T10:00:00+08:00').getTime();

console.log('[1] 六爻往返');
const c1 = encodeCode('liuyao', { at: AT, source: 'tianji', yaoValues: [7, 9, 8, 7, 8, 8], question: '此事可成否' });
console.log('  码:', c1, `(${c1.length} 字符)`);
const d1 = decodeCode(c1);
eq('kind', d1.kind, 'liuyao');
eq('at', d1.at, AT);
eq('source', d1.source, 'tianji');
eq('yaoValues', d1.yaoValues, [7, 9, 8, 7, 8, 8]);
eq('question', d1.question, '此事可成否');

console.log('[2] 六爻无问句');
const c2 = encodeCode('liuyao', { at: AT, source: 'manual', yaoValues: [6, 6, 6, 6, 6, 6] });
const d2 = decodeCode(c2);
eq('yaoValues 全6', d2.yaoValues, [6, 6, 6, 6, 6, 6]);
eq('question 空', d2.question, '');
console.log('  码:', c2, `(${c2.length} 字符)`);

console.log('[3] 梅花/奇门：时间即全部（最短码）');
const c3 = encodeCode('meihua', { at: AT });
console.log('  码:', c3, `(${c3.length} 字符)`);
eq('梅花 at', decodeCode(c3).at, AT);
eq('奇门 at', decodeCode(encodeCode('qimen', { at: AT })).at, AT);

console.log('[4] 八字/紫微/星盘');
const c4 = encodeCode('bazi', { at: AT, gender: '男' });
eq('八字', { k: decodeCode(c4).kind, g: decodeCode(c4).gender, at: decodeCode(c4).at }, { k: 'bazi', g: '男', at: AT });
const c5 = encodeCode('astro', { at: AT, gender: '女', lon: 123.4328, lat: 41.8057 });
const d5 = decodeCode(c5);
console.log('  星盘码:', c5, `(${c5.length} 字符)`);
eq('星盘经度', d5.lon, 123.43);
eq('星盘纬度', d5.lat, 41.81);
eq('星盘性别', d5.gender, '女');

console.log('[5] 卡牌：牌阵 + 牌序 + 正逆');
const drawn = Array.from({ length: 10 }, (_, i) => ({ index: (i * 7) % 78, reversed: i % 3 === 0 }));
const c6 = encodeCode('cards', { at: AT, spreadIndex: 2, cards: drawn });
const d6 = decodeCode(c6);
console.log('  10 张牌码:', c6, `(${c6.length} 字符)`);
eq('牌阵', d6.spreadIndex, 2);
eq('牌数', d6.cards.length, 10);
eq('牌序一致', d6.cards, drawn);

console.log('[6] 健壮性');
throws('空码', () => decodeCode(''), '请先输入');
throws('乱字符', () => decodeCode('QT1-!!!!'), '不认识的字符');
throws('截断', () => decodeCode(c1.slice(0, 10)), '');
throws('版本不支持', () => decodeCode('QT1-' + Buffer.from([0x21, 0, 0, 0, 0, 0]).toString('base64url')), '');
ok('篡改被校验拦下', (() => {
  const t = c1.slice(0, -1) + (c1.slice(-1) === 'A' ? 'B' : 'A');
  try { decodeCode(t); return false; } catch { return true; }
})());
ok('带前缀可解', decodeCode('QT1-' + c3.slice(4)).kind === 'meihua');
ok('不带前缀也可解', decodeCode(c3.slice(4)).kind === 'meihua');
ok('带空格可解', decodeCode('  ' + c3 + '  ').kind === 'meihua');
ok('looksLikeCode 真', looksLikeCode(c1));
ok('looksLikeCode 假(中文)', !looksLikeCode('你好'));
ok('looksLikeCode 假(空)', !looksLikeCode(''));

console.log('[7] 长度体检');
for (const [k, d] of [['meihua', { at: AT }], ['qimen', { at: AT }], ['liuyao', { at: AT, yaoValues: [7, 8, 8, 7, 8, 8] }], ['ziwei', { at: AT }], ['astro', { at: AT, lon: 123.4328, lat: 41.8057 }], ['cards', { at: AT, cards: drawn }]]) {
  const c = encodeCode(k, d);
  console.log(`  ${k.padEnd(7)} ${c.length} 字符`);
  ok(`${k} 长度合理`, c.length >= 10 && c.length <= 120);
}

console.log(`\n结果: ${pass}/${pass + fail} 通过`);
process.exit(fail ? 1 : 0);
