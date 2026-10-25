/*
 * test_xuankong.mjs — 玄空飞星 vendor（xuankong-core.js）+ 判定层（yangzhai-xuankong.js）测试
 *
 * 金标准：npm 包 @soul-atelier/xuankong@0.3.0（MIT）dist 逐宫对照。
 *   运行前提：/tmp/xk/package（解包的 npm 包）、/tmp/xk/node_modules/@soul-atelier/core → /tmp/xk/core/package（symlink）。
 *   若 /tmp/xk 已被清理，先执行：
 *     mkdir -p /tmp/xk && cd /tmp/xk && npm pack @soul-atelier/xuankong && tar xzf soul-atelier-xuankong-*.tgz
 *     npm pack @soul-atelier/core && mkdir -p core && tar xzf soul-atelier-core-*.tgz -C core
 *     mkdir -p node_modules/@soul-atelier && ln -s /tmp/xk/core/package node_modules/@soul-atelier/core
 *
 * 运行：node xuankong_tests/test_xuankong.mjs
 */
import { existsSync } from 'node:fs';

const VENDOR = '/Coze/Drive/编程专家/每日六爻/app/vendor/xuankong-core.js';
const JUDGE = '/Coze/Drive/编程专家/每日六爻/app/js/yangzhai/yangzhai-xuankong.js';
const GOLDEN = '/tmp/xk/package/dist/index.mjs';

const v = await import(VENDOR);
const j = await import(JUDGE);
const g = existsSync(GOLDEN) ? await import(GOLDEN) : null;

/* ---------- 极简测试跑器 ---------- */
const tests = [];
function test(name, fn) { tests.push([name, fn]); }
const FORMATIONS = ['旺山旺向', '上山下水', '双星到向', '双星会坐'];

/* ---------- 1. 三元九运边界 ---------- */
test('三元九运：1864 起上元一运，20 年一运', () => {
  const expect = [[1864, 1], [1883, 1], [1884, 2], [1903, 2], [1904, 3], [1923, 3],
    [1924, 4], [1943, 4], [1944, 5], [1963, 5], [1964, 6], [1983, 6],
    [1984, 7], [2003, 7], [2004, 8], [2023, 8], [2024, 9], [2043, 9]];
  for (const [year, p] of expect) {
    if (v.periodOfYear(year) !== p) throw new Error(`${year} 应为 ${p} 运，得 ${v.periodOfYear(year)}`);
  }
  // 跨元周而复始
  if (v.periodOfYear(1863) !== 9) throw new Error('1863 应为上轮九运');
  if (v.periodOfYear(2044) !== 1) throw new Error('2044 应为新一运');
  // 运区间
  deepEq(v.periodYearRange(2024), [2024, 2043], '九运区间');
  deepEq(v.periodYearRange(1864), [1864, 1883], '一运区间');
  deepEq(v.periodYearRange(2008), [2004, 2023], '八运区间');
  // 三元
  if (v.yuanOfPeriod(2) !== '上元' || v.yuanOfPeriod(5) !== '中元' || v.yuanOfPeriod(9) !== '下元') throw new Error('三元归属错误');
});

/* ---------- 2. 二十四山经典角度约定（统一边界：山 M[k] 覆盖 (15k-7.5, 15k+7.5]，
 *  分界点 b=7.5+15k 归角度较小的山 M[k]，北 0° 顺时针） ---------- */
test('24 山：子居正北 0°，每山 15°', () => {
  const cases = [[0, '子'], [7.4, '子'], [352.6, '子'],
    [7.5, '子'], [14.9, '癸'], [15, '癸'], [22.4, '癸'], [22.5, '癸'], [30, '丑'], [37.4, '丑'],
    [37.5, '丑'], [45, '艮'], [52.4, '艮'], [52.5, '艮'], [90, '卯'], [135, '巽'],
    [180, '午'], [187.4, '午'], [187.5, '午'], [225, '坤'], [270, '酉'], [315, '乾'], [345, '壬'], [352.4, '壬']];
  for (const [deg, name] of cases) {
    const got = v.MOUNTAINS_24[v.mountainIndexAt(deg)];
    if (got !== name) throw new Error(`${deg}° 应为 ${name}，得 ${got}`);
  }
  if (v.MOUNTAINS_24.length !== 24) throw new Error('24 山数量错误');
  if (v.MOUNTAINS_24[v.mountainIndexAt(0)] !== '子') throw new Error('0° 应为子山');
  // MOUNTAINS_24[i] 中心角 = 15×i（供 UI 按钮 data-deg=i*15 回环）
  v.MOUNTAINS_24.forEach((m, i) => {
    if (v.mountainDef(m).centerDeg !== i * 15) throw new Error(`${m} 中心角应为 ${i * 15}`);
  });
});

test('24 山：坐向取对宫同元', () => {
  const t1 = v.mountainsAt(180); // 朝午（坎宫天元）→ 坐子（离宫天元）
  if (t1.chao.name !== '午' || t1.zuo.name !== '子') throw new Error('180° 应为子山午向');
  const t2 = v.mountainsAt(225); // 朝坤 → 坐艮（同天元）
  if (t2.chao.name !== '坤' || t2.zuo.name !== '艮') throw new Error('225° 应为艮山坤向');
  const t3 = v.mountainsAt(210); // 朝未（坤宫地元）→ 坐丑（艮宫地元）
  if (t3.chao.name !== '未' || t3.zuo.name !== '丑') throw new Error('210° 应为丑山未向');
  const t4 = v.mountainsAt(60); // 朝寅 → 坐申
  if (t4.chao.name !== '寅' || t4.zuo.name !== '申') throw new Error('60° 应为申山寅向');
});

/* ---------- 3. 金标准全量对照：24 山 × 9 运 = 216 盘 ---------- */
test('金标准全量：24 坐山 × 9 运逐宫对照 npm @soul-atelier/xuankong', () => {
  if (!g) throw new Error(`金标准包不存在：${GOLDEN}（重建方法见文件头注释）`);
  let count = 0;
  const formationCount = {};
  for (const m of v.MOUNTAINS_24) {
    const def = v.mountainDef(m);
    for (let p = 1; p <= 9; p++) {
      const year = 1864 + (p - 1) * 20; // 每运首年
      const golden = g.buildChart(year, m); // npm：以坐山名直接建盘
      const facingDeg = (def.centerDeg + 180) % 360; // vendor：向首角度（对宫同元）
      const mine = v.chartFor(facingDeg, year);
      /* 局型名映射：npm 称「双星到坐」，本 vendor 依任务规范与《无常派讲义》称「双星会坐」 */
      const goldenFormation = golden.formation === '双星到坐' ? '双星会坐' : golden.formation;
      count++;
      if (mine.label !== golden.label) throw new Error(`${year} ${m}: 标签 ${mine.label} ≠ ${golden.label}`);
      if (mine.period !== p || golden.period !== p) throw new Error(`${year} ${m}: 运数错误`);
      if (mine.pattern !== goldenFormation) throw new Error(`${year} ${m}: 局型 ${mine.pattern} ≠ ${goldenFormation}`);
      if (mine.mountain !== golden.sitting.name || mine.facing !== golden.facing.name) throw new Error(`${year} ${m}: 坐向名不符`);
      if (mine.sittingInfo.yuan !== golden.sitting.yuan || mine.sittingInfo.yinYang !== golden.sitting.yinYang) throw new Error(`${year} ${m}: 坐山元龙/阴阳不符`);
      if (mine.facingInfo.yuan !== golden.facing.yuan || mine.facingInfo.yinYang !== golden.facing.yinYang) throw new Error(`${year} ${m}: 向山元龙/阴阳不符`);
      const gBy = new Map(golden.palaces.map((x) => [x.key, x]));
      if (mine.palaces.length !== 9) throw new Error(`${year} ${m}: 宫数错误`);
      for (const cell of mine.palaces) {
        const gp = gBy.get(cell.key);
        if (!gp) throw new Error(`${year} ${m}: 缺宫 ${cell.key}`);
        if (cell.base !== gp.period) throw new Error(`${year} ${m} ${cell.key}: 运盘 ${cell.base} ≠ ${gp.period}`);
        if (cell.ms !== gp.mountain) throw new Error(`${year} ${m} ${cell.key}: 山星 ${cell.ms} ≠ ${gp.mountain}`);
        if (cell.fs !== gp.water) throw new Error(`${year} ${m} ${cell.key}: 向星 ${cell.fs} ≠ ${gp.water}`);
        if (cell.earth !== gp.earth) throw new Error(`${year} ${m} ${cell.key}: 地盘 ${cell.earth} ≠ ${gp.earth}`);
      }
      const gNames = golden.combinations.map((c) => c.name).sort().join('|');
      const mNames = mine.combinations.map((c) => c.name).sort().join('|');
      if (gNames !== mNames) throw new Error(`${year} ${m}: 格局 [${mNames}] ≠ [${gNames}]`);
      if (!FORMATIONS.includes(mine.pattern)) throw new Error(`${year} ${m}: 局型不完备 ${mine.pattern}`);
      formationCount[mine.pattern] = (formationCount[mine.pattern] || 0) + 1;
    }
  }
  if (count !== 216) throw new Error(`应扫 216 盘，实扫 ${count}`);
  console.log(`    （216 盘局型分布：${FORMATIONS.map((f) => `${f}×${formationCount[f] || 0}`).join('，')}）`);
});

/* ---------- 4. 教科书盘抽查 ---------- */
test('教科书盘：八运子山午向（2008）＝双星到向＋七星真打劫', () => {
  const c = v.chartFor(180, 2008);
  if (c.period !== 8 || c.label !== '子山午向') throw new Error('应为八运子山午向');
  if (c.pattern !== '双星到向') throw new Error('应为双星到向，得 ' + c.pattern);
  const by = (key) => c.palaces.find((p) => p.key === key);
  // 向首离宫：山星8向星8（双八到向）；坐山坎宫：9-7；巽宫 3-7-4（山-运-向）
  if (!(by('li').ms === 8 && by('li').fs === 8)) throw new Error('离宫应双八到向');
  if (!(by('kan').ms === 9 && by('kan').fs === 7)) throw new Error('坎宫应 9-7');
  if (!(by('xun').ms === 3 && by('xun').base === 7 && by('xun').fs === 4)) throw new Error('巽宫应 3-7-4');
  if (!(by('qian').ms === 5 && by('qian').base === 9 && by('qian').fs === 2)) throw new Error('乾宫应 5-9-2');
  if (!c.combinations.some((x) => x.name === '七星真打劫')) throw new Error('应含七星真打劫');
  if (!c.combinations.some((x) => x.name === '单宫反吟（山星）')) throw new Error('应含单宫反吟（山星）');
  if (!c.combinations.some((x) => x.name === '单宫伏吟（向星）')) throw new Error('应含单宫伏吟（向星）');
});

test('教科书盘：八运丑山未向（2004）＝旺山旺向', () => {
  const c = v.chartFor(210, 2004);
  if (c.label !== '丑山未向' || c.period !== 8) throw new Error('应为八运丑山未向');
  if (c.pattern !== '旺山旺向') throw new Error('应为旺山旺向，得 ' + c.pattern);
  const by = (key) => c.palaces.find((p) => p.key === key);
  if (by('gen').ms !== 8) throw new Error('坐宫（艮）山星应 8');
  if (by('kun').fs !== 8) throw new Error('向宫（坤）向星应 8');
});

test('教科书盘：九运子山午向（2024）＝双星会坐', () => {
  const c = v.chartFor(180, 2024);
  if (c.label !== '子山午向' || c.period !== 9) throw new Error('应为九运子山午向');
  if (c.pattern !== '双星会坐') throw new Error('应为双星会坐，得 ' + c.pattern);
  const by = (key) => c.palaces.find((p) => p.key === key);
  if (!(by('kan').ms === 9 && by('kan').fs === 9)) throw new Error('坐宫（坎）应双九会坐');
});

test('教科书盘：八运乾山巽向（2004）＝旺山旺向（天元龙父母）', () => {
  const c = v.chartFor(135, 2004); // 朝巽（巽宫天元）→ 坐乾
  if (c.label !== '乾山巽向') throw new Error('应为乾山巽向，得 ' + c.label);
  if (c.pattern !== '旺山旺向') throw new Error('八运乾山巽向应为旺山旺向，得 ' + c.pattern);
});

/* ---------- 5. 旺衰 ---------- */
test('starLuckOf：当运旺、未来生、刚退退、其余死', () => {
  const eq = (star, period, luck) => {
    if (v.starLuckOf(star, period) !== luck) throw new Error(`${star} 于 ${period} 运应为 ${luck}，得 ${v.starLuckOf(star, period)}`);
  };
  eq(9, 9, '旺'); eq(8, 8, '旺'); eq(1, 9, '生'); eq(2, 9, '生'); eq(8, 9, '退'); eq(9, 1, '退'); eq(5, 9, '死'); eq(4, 9, '死'); eq(7, 9, '死'); eq(6, 9, '死');
});

/* ---------- 6. 判定层 judgeXuankong ---------- */

/* 深扫：任何路径上不允许 undefined / NaN 值 */
function assertClean(obj, path) {
  path = path || '$';
  if (obj === undefined) throw new Error('undefined @ ' + path);
  if (typeof obj === 'number' && Number.isNaN(obj)) throw new Error('NaN @ ' + path);
  if (obj && typeof obj === 'object') {
    for (const k of Object.keys(obj)) assertClean(obj[k], `${path}.${k}`);
  }
}

function assertVerdictShape(vd, path) {
  if (!vd) return;
  if (!['good', 'warn', 'bad', 'neutral'].includes(vd.tone)) throw new Error(`${path}.tone 非法: ${vd.tone}`);
  for (const f of ['title', 'body', 'advice']) {
    if (typeof vd[f] !== 'string' || !vd[f].length) throw new Error(`${path}.${f} 缺失`);
  }
  if (!vd.src || typeof vd.src.t !== 'string' || typeof vd.src.q !== 'string' || !vd.src.t.length || !vd.src.q.length) {
    throw new Error(`${path}.src 缺 t/q`);
  }
}

test('judgeXuankong：完整房屋（八运子山午向，2026 年断）结构完整、无 undefined/NaN', () => {
  const r = j.judgeXuankong({
    facingDeg: 180, buildYear: 2008, nowYear: 2026,
    rooms: { door: [0], master: [5], kitchen: [2], living: [7], second: [8], bath: [4] },
  });
  assertClean(r);
  const s = JSON.stringify(r);
  if (/undefined|NaN/.test(s)) throw new Error('序列化出现 undefined/NaN');
  if (r.chart.pattern !== '双星到向') throw new Error('局型错误');
  if (r.facing.label !== '子山午向' || r.facing.facing !== '午' || r.facing.mountain !== '子') throw new Error('坐向错误');
  // 八运宅于 2026（九运）：刚退一运
  if (r.period.status !== '退气') throw new Error('应为退气，得 ' + r.period.status);
  if (r.period.number !== 8 || r.period.nowPeriod !== 9) throw new Error('运数错误');
  for (const [i, vd] of r.verdicts.entries()) assertVerdictShape(vd, `verdicts[${i}]`);
  if (r.verdicts.length < 5) throw new Error('verdicts 数量异常: ' + r.verdicts.length);
  if (!r.doorVerdict || !r.masterVerdict || !r.kitchenVerdict) throw new Error('门主灶判语缺失');
  if (typeof r.sourceNote !== 'string' || !r.sourceNote.includes('兼向')) throw new Error('SOURCE_NOTE 应说明兼向未做');
});

test('judgeXuankong：门在乾宫（5-2 二五交加）应出病符凶卡', () => {
  const r = j.judgeXuankong({ facingDeg: 180, buildYear: 2008, nowYear: 2026, rooms: { door: [0] } });
  const d = r.doorVerdict;
  if (d.tone !== 'bad') throw new Error('乾宫 5-2 门应为 bad，得 ' + d.tone);
  if (!d.title.includes('西北')) throw new Error('门判语应含方位');
  if (!d.src.t.includes('紫白诀') || !d.src.q.includes('二五')) throw new Error('应挂紫白诀二五交加');
  if (!d.body.includes('二五')) throw new Error('正文应说明病符组合');
});

test('judgeXuankong：灶在艮宫（7-9 合辙）应出回禄火灾凶卡', () => {
  const r = j.judgeXuankong({ facingDeg: 180, buildYear: 2008, nowYear: 2026, rooms: { kitchen: [2] } });
  const k = r.kitchenVerdict;
  if (k.tone !== 'bad') throw new Error('艮宫 7-9 灶应为 bad，得 ' + k.tone);
  if (!k.src.q.includes('回禄')) throw new Error('应挂紫白诀回禄之灾');
});

test('judgeXuankong：当运九运宅总评为当运、tone=good', () => {
  const r = j.judgeXuankong({ facingDeg: 180, buildYear: 2030, nowYear: 2026, rooms: {} });
  if (r.period.status !== '当运') throw new Error('九运宅于 2026 应当运');
  if (r.periodVerdict.tone !== 'good') throw new Error('当运总评应为 good');
  if (!r.doorVerdict && !r.masterVerdict && !r.kitchenVerdict) { /* 空房间，正常 */ }
  if (r.verdicts.length !== (r.combinationVerdict ? 3 : 2)) throw new Error('空房间时 verdicts 应只有总评/局型/格局');
  assertClean(r); for (const [i, vd] of r.verdicts.entries()) assertVerdictShape(vd, `v[${i}]`);
});

test('judgeXuankong：失运老宅（六运）总评为失运', () => {
  const r = j.judgeXuankong({ facingDeg: 180, buildYear: 1970, nowYear: 2026, rooms: { door: [7] } });
  if (r.period.status !== '失运') throw new Error('六运宅于 2026 应失运，得 ' + r.period.status);
  if (!r.periodVerdict.body.includes('粮艰一宿')) throw new Error('失运应引玄空秘旨');
});

test('judgeXuankong：±3° 山界只警告不换山', () => {
  // 午山界 172.5/187.5：185.6° 距山心 5.6°（距山界 1.9°）→ 警告，但仍按午
  const r = j.judgeXuankong({ facingDeg: 185.6, buildYear: 2008, nowYear: 2026, rooms: {} });
  if (!r.facing.boundary.warn) throw new Error('185.6° 应触发山界警告');
  if (r.facing.facing !== '午') throw new Error('仍应按午山下卦');
  if (!r.facing.boundary.verdict || r.facing.boundary.verdict.tone !== 'warn') throw new Error('山界警告卡缺失');
  if (!r.verdicts[r.verdicts.length - 1].title.includes('山界')) throw new Error('山界卡应在 verdicts 末尾');
  // 187.4 仍属午（山界 187.5），距山心 7.4 → 警告
  const r2 = j.judgeXuankong({ facingDeg: 187.4, buildYear: 2008, nowYear: 2026, rooms: {} });
  if (!r2.facing.boundary.warn || r2.facing.facing !== '午') throw new Error('187.4° 应警告且仍按午');
  // 183° 距山心 3°（距山界 4.5°）→ 不警告
  const r3 = j.judgeXuankong({ facingDeg: 183, buildYear: 2008, nowYear: 2026, rooms: {} });
  if (r3.facing.boundary.warn) throw new Error('183° 不应触发山界警告');
  // 187.5° 为午/丁山界，按统一边界约定归角度较小的午（金标准 edge.mjs 同约定）
  const r4 = j.judgeXuankong({ facingDeg: 187.5, buildYear: 2008, nowYear: 2026, rooms: {} });
  if (r4.facing.facing !== '午' || r4.facing.mountain !== '子') throw new Error('187.5° 应按统一边界归子山午向');
});

test('judgeXuankong：跨宫房间与非法输入容错', () => {
  const r = j.judgeXuankong({
    facingDeg: 180, buildYear: 2008, nowYear: 2026,
    rooms: { door: [0, 1], master: [5, 99, -1, 4.5, '7'], living: [8], bath: [3] },
  });
  assertClean(r);
  if (r.rooms.door.length !== 2) throw new Error('门应跨 2 宫');
  if (r.rooms.master.length !== 1) throw new Error('非法索引应被过滤');
  if (!r.rooms.livingVerdict) throw new Error('客厅判语缺失');
  const s = JSON.stringify(r);
  if (/undefined|NaN/.test(s)) throw new Error('序列化出现 undefined/NaN');
});

test('judgeXuankong：九运全房间示例（2024 年建、2026 年断）无异常', () => {
  const r = j.judgeXuankong({
    facingDeg: 210, buildYear: 2024, nowYear: 2026,
    rooms: { door: [6], master: [2], kitchen: [8], living: [1], second: [5], bath: [3] },
  });
  assertClean(r);
  if (r.period.status !== '当运') throw new Error('九运宅应当运');
  for (const [i, vd] of r.verdicts.entries()) assertVerdictShape(vd, `v[${i}]`);
});

/* ---------- 7. 古籍出处与流派并列 ---------- */
test('SOURCES 典籍条目齐全、SOURCE_NOTE 并列流派差异', () => {
  const need = ['wangshuai', 'fourJu', 'shanlun', 'shengqi', 'qiu', 'dajie', 'sanban', 'heShi',
    'wenchang', 'huoluan', 'bingfu', 'jiaodou', 'gongming', 'daozei', 'huanTianXin'];
  for (const k of need) {
    const s = j.SOURCES[k];
    if (!s || !s.t || !s.q) throw new Error('缺典籍条目: ' + k);
  }
  const note = j.SOURCE_NOTE;
  for (const kw of ['下卦', '替卦', '连珠', '立春', '八宅']) {
    if (!note.includes(kw)) throw new Error('SOURCE_NOTE 应提及: ' + kw);
  }
});

/* ---------- 工具 ---------- */
function deepEq(a, b, msg) {
  if (JSON.stringify(a) !== JSON.stringify(b)) throw new Error(`${msg}: ${JSON.stringify(a)} ≠ ${JSON.stringify(b)}`);
}

/* ---------- 运行 ---------- */
let pass = 0, fail = 0;
for (const [name, fn] of tests) {
  try {
    await fn();
    pass++;
    console.log(`✓ ${name}`);
  } catch (e) {
    fail++;
    console.error(`✗ ${name}\n    ${e.message}`);
  }
}
console.log(`\n${pass} passed, ${fail} failed${g ? '（金标准: @soul-atelier/xuankong@0.3.0）' : '（⚠ 金标准包缺失，跳过对照）'}`);
process.exitCode = fail ? 1 : 0;
