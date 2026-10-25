// 压力测试：案例库顶掉机制 / 配额溢出 / 复现码批量往返 / 篡改拦截
// 纯 Node，不依赖浏览器；用桩替换 localStorage。
const store = new Map();
let quotaFailAt = Infinity; // 超过该字节数即模拟 QuotaExceededError
globalThis.localStorage = {
  getItem: (k) => (store.has(k) ? store.get(k) : null),
  setItem: (k, v) => {
    const size = (store.get(k) || '').length + String(v).length;
    if (size > quotaFailAt) { const e = new Error('QuotaExceededError'); e.name = 'QuotaExceededError'; throw e; }
    store.set(k, String(v));
  },
  removeItem: (k) => store.delete(k),
};

const cases = await import('../app/js/cases.js');
const code = await import('../app/js/sharecode.js');

let pass = 0, fail = 0;
const ok = (name, cond, extra = '') => {
  if (cond) { pass++; }
  else { fail++; console.log(`  ✗ ${name} ${extra}`); }
};

const mkCode = (i) => code.encodeCode('meihua', { at: 1700000000000 + i * 1000 });

console.log('【1】自动留档：未星标只留最近 30 条，星标全留');
store.clear();
const ids = [];
for (let i = 0; i < 200; i++) ids.push(cases.saveCase({ kind: 'meihua', code: mkCode(i), title: `卦${i}`, castAt: i }).id);
let list = cases.loadCases();
ok('200 条后总数=30', list.length === 30, `实际 ${list.length}`);
ok('留下的都是最新 30 条', list.every(c => Number(c.title.slice(1)) >= 170), list.map(c=>c.title).join(','));
// 对当前留存的案例里挑 5 条打星标
const keepIds = cases.loadCases().slice(-5).map(c => c.id);
keepIds.forEach(id => cases.togglePin(id));
for (let i = 200; i < 260; i++) cases.saveCase({ kind: 'meihua', code: mkCode(i), title: `卦${i}`, castAt: i });
list = cases.loadCases();
const st = cases.caseStats();
ok('星标 5 条仍在', keepIds.every(id => list.some(c => c.id === id)));
ok('总数 = 星标 + 30', list.length === 35, `实际 ${list.length}`);
ok('caseStats 自洽', st.total === 35 && st.pinned === 5 && st.auto === 30, JSON.stringify(st));

console.log('【2】清未星标');
const cleared = cases.clearUnpinned();
list = cases.loadCases();
ok('清掉 30 条', cleared === 30, `实际 ${cleared}`);
ok('只剩 5 条星标', list.length === 5 && list.every(c => c.pinned));

console.log('【3】配额溢出：写入超限时自动砍半重试，不崩');
store.clear();
quotaFailAt = 26000; // 约 130 条就写不下
let threw = null;
for (let i = 0; i < 400; i++) {
  try { cases.saveCase({ kind: 'meihua', code: mkCode(i), title: `压力${i}`, castAt: i }); }
  catch (e) { threw = e; break; }
}
quotaFailAt = Infinity;
list = cases.loadCases();
ok('配额压力下未抛异常', threw === null, threw && threw.message);
ok('本地仍留有数据', list.length > 0 && list.length <= 30, `实际 ${list.length}`);
ok('写回体积未超限', (store.get('qintian.cases.v2') || '').length <= 26000);

console.log('【4】复现码批量往返 2000 次');
store.clear();
const kinds = ['liuyao', 'meihua', 'qimen', 'bazi', 'astro', 'ziwei', 'cards', 'sky'];
const mkData = (k, i) => {
  const at = 1600000000000 + i * 137000;
  if (k === 'liuyao') return { at, source: ['coins','tianji','manual','time'][i % 4], yaoValues: Array.from({ length: 6 }, (_, j) => 6 + ((i >> j) & 3)), question: i % 3 === 0 ? `第${i}问：此事如何` : '' };
  if (k === 'bazi' || k === 'ziwei') return { at, gender: i % 2 ? '男' : '女' };
  if (k === 'astro') return { at, gender: i % 2 ? '男' : '女', lon: 73 + (i % 6200) / 100, lat: -55 + (i % 8000) / 100 };
  if (k === 'cards') return { at, spreadIndex: i % 12, cards: Array.from({ length: 1 + (i % 10) }, (_, j) => ({ index: (i * 7 + j * 13) % 78, reversed: ((i + j) % 2) === 1 })) };
  return { at };
};
let roundOk = 0, maxLen = 0;
for (let i = 0; i < 2000; i++) {
  const k = kinds[i % kinds.length];
  const d = mkData(k, i);
  const c = code.encodeCode(k, d);
  maxLen = Math.max(maxLen, c.length);
  const back = code.decodeCode(c);
  if (back.kind !== k || back.at !== d.at) continue;
  if (k === 'liuyao' && (back.yaoValues + '' !== d.yaoValues + '' || back.question !== d.question || back.source !== d.source)) continue;
  if ((k === 'bazi' || k === 'ziwei' || k === 'astro') && back.gender !== d.gender) continue;
  if (k === 'astro' && (Math.abs(back.lon - d.lon) > 0.001 || Math.abs(back.lat - d.lat) > 0.001)) continue;
  if (k === 'cards' && JSON.stringify(back.cards) !== JSON.stringify(d.cards)) continue;
  roundOk++;
}
ok('2000 次往返全部一致', roundOk === 2000, `实际 ${roundOk}`);
ok('最长码 < 120 字符', maxLen < 120, `实际 ${maxLen}`);

console.log('【5】篡改 / 乱码必须被拦下（1000 次）');
let caught = 0, harmless = 0, leaked = 0;
const B64 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_';
for (let i = 0; i < 1000; i++) {
  const d = mkData('liuyao', i);
  const c = code.encodeCode('liuyao', d);
  const body = c.slice(4).split('');
  const pos = i % body.length;
  body[pos] = B64[(B64.indexOf(body[pos]) + 1 + (i % 3)) % 64];
  const tampered = 'QT1-' + body.join('');
  try {
    const back = code.decodeCode(tampered);
    // 只有「数据其实没变」（改到 base64 填充位）才算无害漏过
    if (back.at === d.at && back.yaoValues + '' === d.yaoValues + '' && back.question === d.question) harmless++;
    else leaked++;
  } catch { caught++; }
}
ok('篡改数据必被拦下（改到填充位则数据未变，无害）', leaked === 0, `真漏过 ${leaked}`);
ok('绝大多数篡改被直接拒绝', caught > 850, `实际拦下 ${caught}`);
let badCaught = 0;
for (const bad of ['', '   ', 'QT1-', 'QT1-!!!!', 'QT1-AAAA', '你好世界', 'QT1-' + 'A'.repeat(500), null, undefined, 12345]) {
  try { code.decodeCode(bad); } catch { badCaught++; }
}
ok('10 种非法输入全部报错', badCaught === 10, `实际 ${badCaught}`);
ok('looksLikeCode 不误判中文', code.looksLikeCode('你好') === false && code.looksLikeCode('') === false && code.looksLikeCode(mkCode(1)) === true);

console.log('【6】码长度体检（含边界）');
const len = (k, d) => code.encodeCode(k, d).length;
const table = [
  ['梅花/奇门（时间即全部）', len('meihua', { at: 4102444800000 })],
  ['紫微（+性别）', len('ziwei', { at: 4102444800000, gender: '男' })],
  ['六爻（无问句）', len('liuyao', { at: 4102444800000, source: 4, yaoValues: [6, 6, 6, 6, 6, 6], question: '' })],
  ['六爻（含 30 字问句）', len('liuyao', { at: 4102444800000, source: 1, yaoValues: [9, 9, 9, 9, 9, 9], question: '我这次换工作能不能顺利，什么时候会有确定的消息呢，请明示' })],
  ['卡牌 1 张', len('cards', { at: 4102444800000, spreadIndex: 0, cards: [{ index: 0, reversed: 0 }] })],
  ['卡牌 10 张', len('cards', { at: 4102444800000, spreadIndex: 3, cards: Array.from({ length: 10 }, (_, j) => ({ index: j * 7, reversed: (j % 2) === 1 })) })],
  ['卡牌 78 张（全摊）', len('cards', { at: 4102444800000, spreadIndex: 255, cards: Array.from({ length: 78 }, (_, j) => ({ index: j, reversed: (j % 2) === 1 })) })],
];
table.forEach(([n, l]) => console.log(`  ${n.padEnd(24)} ${String(l).padStart(3)} 字符`));
ok('至少 5 类盘面码在 12–45 字符', table.filter(([, l]) => l >= 12 && l <= 45).length >= 5, JSON.stringify(table));
ok('含长问句的六爻码 <=140', table[3][1] <= 140);
ok('78 张全摊（极端）<=240', table[6][1] <= 240, `实际 ${table[6][1]}`);

console.log(`\n===== 压测结果：${pass} 通过 / ${fail} 失败 =====`);
process.exit(fail ? 1 : 0);
