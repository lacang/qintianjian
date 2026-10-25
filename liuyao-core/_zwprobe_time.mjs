// 手录起卦时间 探针：parseLocalDateTime / toLocalInputValue / 时辰映射 / 天火同人复现
globalThis.localStorage = {
  _d: {},
  getItem(k) { return Object.prototype.hasOwnProperty.call(this._d, k) ? this._d[k] : null; },
  setItem(k, v) { this._d[k] = String(v); },
  removeItem(k) { delete this._d[k]; },
};

const { parseLocalDateTime, toLocalInputValue } = await import('../app/js/state.js');
const core = await import('../app/vendor/liuyao-core.js');

let pass = 0, fail = 0;
function ok(cond, label, extra = '') {
  if (cond) { pass++; console.log(`  ✓ ${label}`); }
  else { fail++; console.log(`  ✗ ${label}  ${extra}`); }
}

const ZHI = ['子', '丑', '寅', '卯', '辰', '巳', '午', '未', '申', '酉', '戌', '亥'];
const shichenOf = (h) => ZHI[Math.floor(((h + 1) % 24) / 2)];

console.log('\n[1] parseLocalDateTime');
{
  const d = parseLocalDateTime('2026-10-21T15:00');
  ok(d instanceof Date && d.getFullYear() === 2026 && d.getMonth() === 9 && d.getDate() === 21
    && d.getHours() === 15 && d.getMinutes() === 0, '2026-10-21T15:00 → 本地 Date');
  ok(parseLocalDateTime('') === null, '空串 → null');
  ok(parseLocalDateTime('abc') === null, '乱码 → null');
  ok(parseLocalDateTime(undefined) === null, 'undefined → null');
  ok(parseLocalDateTime('2026-02-30T10:00') === null, '2026-02-30 → null（回读校验）');
  ok(parseLocalDateTime('2026-13-01T10:00') === null, '13 月 → null');
  ok(parseLocalDateTime('2026-10-21T25:00') === null, '25 时 → null');
  ok(parseLocalDateTime('2026-10-21T15:75') === null, '75 分 → null');
  ok(parseLocalDateTime('2026-10-21T23:30')?.getHours() === 23, '23:30 可解析');
}

console.log('\n[2] toLocalInputValue');
{
  ok(toLocalInputValue(new Date(2026, 9, 21, 15, 0)) === '2026-10-21T15:00', '15:00 → 2026-10-21T15:00');
  ok(toLocalInputValue(new Date(2026, 0, 5, 9, 7)) === '2026-01-05T09:07', '补零 → 2026-01-05T09:07');
  // 往返一致
  const now = new Date(2026, 9, 21, 15, 0);
  ok(parseLocalDateTime(toLocalInputValue(now)).getTime() === now.getTime(), '往返一致');
}

console.log('\n[3] 时辰映射 vs 引擎时柱');
{
  const cases = [[23, '子'], [0, '子'], [1, '丑'], [2, '丑'], [7, '辰'], [11, '午'], [15, '申'], [22, '亥']];
  for (const [h, exp] of cases) {
    ok(shichenOf(h) === exp, `UI 映射 ${h} 时 → ${exp} 时`);
  }
  for (const h of [0, 1, 7, 11, 15, 23]) {
    const s = core.solarToSiZhu({ year: 2026, month: 10, day: 21, hour: h, minute: 0 });
    ok(s.timeGanZhi.charAt(1) === shichenOf(h), `引擎时柱地支 h=${h} → ${shichenOf(h)}（得 ${s.timeGanZhi}）`);
  }
}

console.log('\n[4] 四柱复现（目标：丙午 戊戌 戊辰 庚申，旬空戌亥）');
{
  const sz = core.solarToSiZhu({ year: 2026, month: 10, day: 21, hour: 15, minute: 0 });
  ok(sz.yearGanZhi === '丙午' && sz.monthGanZhi === '戊戌'
    && sz.dayGanZhi === '戊辰' && sz.timeGanZhi === '庚申',
    `四柱 = ${sz.yearGanZhi} ${sz.monthGanZhi} ${sz.dayGanZhi} ${sz.timeGanZhi}`);
  ok(sz.xunKong.join('') === '戌亥', `旬空 = ${sz.xunKong.join('')}`);
}

console.log('\n[5] 晚子时口径实测（记录现行行为，流派待主人确认）');
{
  const a = core.solarToSiZhu({ year: 2026, month: 10, day: 21, hour: 23, minute: 30 });
  const b = core.solarToSiZhu({ year: 2026, month: 10, day: 22, hour: 0, minute: 30 });
  const c = core.solarToSiZhu({ year: 2026, month: 10, day: 21, hour: 22, minute: 30 });
  console.log(`  10-21 22:30 → ${c.dayGanZhi}日 ${c.timeGanZhi}时`);
  console.log(`  10-21 23:30 → ${a.dayGanZhi}日 ${a.timeGanZhi}时`);
  console.log(`  10-22 00:30 → ${b.dayGanZhi}日 ${b.timeGanZhi}时`);
  ok(a.timeGanZhi.charAt(1) === '子', '晚子时时柱地支为子');
  ok(a.dayGanZhi === b.dayGanZhi, '晚子时与次日早子时同日柱（即 23:00 换日口径）');
}

console.log('\n[6] 天火同人复现（手录：只把二爻点成阴，六爻全不动）');
{
  const manual = [
    { yinYang: '阳', moving: false }, // 初
    { yinYang: '阴', moving: false }, // 二
    { yinYang: '阳', moving: false },
    { yinYang: '阳', moving: false },
    { yinYang: '阳', moving: false },
    { yinYang: '阳', moving: false }, // 上
  ];
  const cast = core.castManual(manual);
  ok(JSON.stringify(cast.yaoValues) === JSON.stringify([7, 8, 7, 7, 7, 7]),
    `castManual → [${cast.yaoValues.join(',')}]`);

  const pan = core.paipan({
    yaoValues: cast.yaoValues,
    year: 2026, month: 10, day: 21, hour: 15, minute: 0,
    gender: '女', question: '',
  });
  console.log('  pan keys: ' + Object.keys(pan).join(', '));
  const g = pan.benGua || pan.bengua || {};
  ok(g.name === '天火同人', `本卦 = ${g.name}`);
  ok(g.isGuiHun === true, '归魂卦');
  ok(g.shouGuaName === '离为火', `宫首卦 = ${g.shouGuaName}`);
  ok(g.shiPosition === 3 && g.yingPosition === 6, `世 ${g.shiPosition} 应 ${g.yingPosition}`);

  const lines = pan.yaos || pan.lines || pan.yaoList || [];
  const desc = lines.map((l) => `${l.position}:${l.liuShen}${l.liuQin}${l.gan}${l.zhi}${l.shiYing || ''}`);
  console.log('  六爻（初→上）: ' + desc.join(' | '));
  const expect = ['勾陈父母己卯', '螣蛇子孙己丑', '白虎官鬼己亥世', '玄武兄弟壬午', '青龙妻财壬申', '朱雀子孙壬戌应'];
  const got = lines.map((l) => `${l.liuShen}${l.liuQin}${l.gan}${l.zhi}${l.shiYing || ''}`);
  ok(JSON.stringify(got) === JSON.stringify(expect), '六爻六亲六神世应逐项一致');
}

console.log(`\n===== 探针结果：${pass} 通过 / ${fail} 失败 =====`);
if (fail > 0) process.exit(1);
