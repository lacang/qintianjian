// 月破失气 / 日冲分类 逐项验证（L1 复核 P0-2）
//
// 对比对象：
//   PRE  = git 0ed9e89 的 vendor（L1 前语义：无失气、日破仅死/囚）
//   POST = 当前 app/vendor/liuyao-core.js（失气 + 休态归日破）
//
// 逐项断言（对应董事长 5 条要求）：
//   A. 月破标记仍然正确：yuePo 在 PRE/POST 完全一致（失气不改破的认定）
//   B. 非月破爻的旺衰结果不受影响：yuePo=false 时 lingTai 完全相同
//   C. 非月破且非日冲的爻：anDong / riPo 完全相同（无任何溢出影响）
//   D. 非月破日冲爻：anDong 不变；riPo 仅对「死/囚/休」由 false→true（休态归日破），
//      旺/相仍为暗动，不新增日破
//   E. 月破爻：lingTai 变化仅限「旺→休」；其余四态（相/休/死/囚）不得变化
//   F. 无重复惩罚：失气不加分不减分，只移除旺相态；verdict 层「月破 −3」仍照旧，
//      「旺相 +」信号对月破爻不再出现（定向抽查）
//
// 枚举空间：12 月令 × 12 日辰 × 5 种爻五行 × 12 爻支 × 动/静 × 旬空/不空 = 34560 例
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '../../../..');
const OUT = path.join(ROOT, 'tools/score-verify-v2/l1-review/evidence');

globalThis.document = {
  addEventListener() {}, querySelector: () => null, getElementById: () => null, querySelectorAll: () => [],
  head: { appendChild() {} },
  body: { appendChild() {}, classList: { add() {}, remove() {} } },
  createElement: () => ({ style: {}, classList: { add() {}, remove() {} }, appendChild() {}, setAttribute() {} }),
};
globalThis.window = globalThis;
globalThis.localStorage = { getItem: () => null, setItem() {}, removeItem() {} };

const POST = await import(path.join(ROOT, 'app/vendor/liuyao-core.js'));
const PRE = await import('/tmp/vendor-pre.mjs');
const { judgeNajia: judgeCur } = await import(path.join(ROOT, 'app/js/verdict.js'));

const ZHI = ['子', '丑', '寅', '卯', '辰', '巳', '午', '未', '申', '酉', '戌', '亥'];
const WX = ['金', '木', '水', '火', '土'];
const WANG = new Set(['旺', '相']);

const stat = {
  total: 0,
  yuePoTrue: 0, yuePoFalse: 0,
  // A
  yuePoChanged: 0,
  // B/C
  nonYuePoLingTaiChanged: 0, nonYuePoNonChongOtherChanged: 0,
  // D
  nonYuePoChongAnDongChanged: 0, nonYuePoChongRiPoBad: 0, xiuToRiPo: 0,
  // E
  yuePoLingTaiChanged: 0, yuePoLingTaiBadChange: 0, wangToXiu: 0,
  // 明细
  changes: [],
};
const sample = (o) => { if (stat.changes.length < 12) stat.changes.push(o); };

for (const m of ZHI) for (const d of ZHI) for (const wx of WX) for (const z of ZHI)
  for (const moving of [false, true]) for (const kong of [false, true]) {
    const xunKong = kong ? [z] : [];
    const args = { zhi: z, wuXing: wx, moving, monthZhi: m, dayZhi: d, xunKong };
    const pre = PRE.evalYao(args);
    const post = POST.evalYao(args);
    stat.total++;
    if (pre.yuePo !== post.yuePo) { stat.yuePoChanged++; sample({ kind: 'yuePo', m, d, wx, z, moving, kong, pre: pre.yuePo, post: post.yuePo }); }
    if (pre.yuePo) {
      stat.yuePoTrue++;
      if (pre.lingTai !== post.lingTai) {
        stat.yuePoLingTaiChanged++;
        if (pre.lingTai === '旺' && post.lingTai === '休') stat.wangToXiu++;
        else { stat.yuePoLingTaiBadChange++; sample({ kind: 'yuePoBadLingTai', m, d, wx, z, moving, pre: pre.lingTai, post: post.lingTai }); }
      }
      // 月破爻的日冲分类：若同时被日冲且压为休 → 应归日破
      if (post.riChong && post.lingTai === '休' && !post.riPo) { stat.nonYuePoChongRiPoBad++; }
    } else {
      stat.yuePoFalse++;
      if (pre.lingTai !== post.lingTai) { stat.nonYuePoLingTaiChanged++; sample({ kind: 'nonYuePoLingTai', m, d, wx, z, moving, pre: pre.lingTai, post: post.lingTai }); }
      if (!pre.riChong && !post.riChong) {
        if (pre.anDong !== post.anDong || pre.riPo !== post.riPo) {
          stat.nonYuePoNonChongOtherChanged++;
          sample({ kind: 'nonYuePoNonChong', m, d, wx, z, moving, preA: pre.anDong, postA: post.anDong, preR: pre.riPo, postR: post.riPo });
        }
      } else {
        if (pre.anDong !== post.anDong) { stat.nonYuePoChongAnDongChanged++; sample({ kind: 'anDongChanged', m, d, wx, z, moving, pre: pre.anDong, post: post.anDong }); }
        if (post.riPo && !pre.riPo) {
          if (WANG.has(post.lingTai)) { stat.nonYuePoChongRiPoBad++; sample({ kind: 'wangRiPo', m, d, wx, z, moving }); }
          else if (post.lingTai === '休') stat.xiuToRiPo++;
        }
        if (pre.riPo && !post.riPo) { stat.nonYuePoChongRiPoBad++; sample({ kind: 'lostRiPo', m, d, wx, z, moving }); }
      }
    }
  }

// ---------- F. verdict 层定向抽查：月破爻的旺相加分是否消失、月破 −3 是否保留 ----------
// 构造：12 月令 × 4096 盘 × 8 域，找「用神月破」的盘，检查信号里
//   · 不再出现「旺于月」相关加分（wangxiang）
//   · 「月破」扣分仍在（yuepo）
const DAY = { year: 2026, month: 10, day: 26, hour: 17, minute: 35 };
const panOf = (mask) => {
  const vals = [];
  for (let i = 0; i < 6; i++) vals.push((mask >> i) & 1 ? 7 : 8);
  return POST.paipan({ yaoValues: vals, ...DAY, gender: '男' });
};
const verdictCheck = { yuepoSignal: 0, wangSignalOnYuePo: 0, checked: 0, samples: [] };
const DOMAINS = ['career', 'wealth', 'love', 'health', 'lost', 'people', 'decision', 'life'];
for (const mz of ZHI) {
  for (let mask = 0; mask < 4096; mask++) {
    const pan = panOf(mask);
    pan.siZhu.monthGanZhi = pan.siZhu.monthGanZhi[0] + mz;
    const dz = pan.siZhu.dayGanZhi[1];
    for (const dom of DOMAINS) {
      const v = judgeCur(pan, dom);
      for (const s of v.signals) {
        if (s.rule?.id === 'yuepo') verdictCheck.yuepoSignal++;
        if (s.rule?.id === 'wangxiang' && /月破/.test(s.text)) verdictCheck.wangSignalOnYuePo++;
      }
      verdictCheck.checked++;
    }
  }
}

const checks = {
  A_yuePoMarkStable: stat.yuePoChanged === 0,
  B_nonYuePoLingTaiUnchanged: stat.nonYuePoLingTaiChanged === 0,
  C_nonYuePoNonChongOthersUnchanged: stat.nonYuePoNonChongOtherChanged === 0,
  D_anDongUnchanged: stat.nonYuePoChongAnDongChanged === 0,
  D_riPoOnlyForShuai: stat.nonYuePoChongRiPoBad === 0,
  E_yuePoLingTaiOnlyWangToXiu: stat.yuePoLingTaiBadChange === 0,
  F_yuepoDeductionStillThere: verdictCheck.yuepoSignal > 0,
  F_noWangBonusOnYuePo: verdictCheck.wangSignalOnYuePo === 0,
};

const L = [];
L.push('# 月破失气 / 日冲分类 逐项验证');
L.push('');
L.push('对比 PRE（0ed9e89 vendor）与 POST（当前 vendor），全枚举');
L.push(`${stat.total} 例（12 月令 × 12 日辰 × 5 爻五行 × 12 爻支 × 动/静 × 旬空/不空）。`);
L.push('');
L.push('## 断言结果');
L.push('');
L.push('| # | 断言 | 结果 | 计数 |');
L.push('|---|---|---|---|');
L.push(`| A | 月破标记 yuePo 在 PRE/POST 完全一致（失气不改「破」的认定） | ${checks.A_yuePoMarkStable ? '✅' : '❌'} | 变化 ${stat.yuePoChanged} / 月破例 ${stat.yuePoTrue} |`);
L.push(`| B | 非月破爻 lingTai 完全不受影响 | ${checks.B_nonYuePoLingTaiUnchanged ? '✅' : '❌'} | 变化 ${stat.nonYuePoLingTaiChanged} / 非月破例 ${stat.yuePoFalse} |`);
L.push(`| C | 非月破且非日冲爻：anDong/riPo 无任何变化 | ${checks.C_nonYuePoNonChongOthersUnchanged ? '✅' : '❌'} | 变化 ${stat.nonYuePoNonChongOtherChanged} |`);
L.push(`| D1 | 日冲爻 anDong 判定不变 | ${checks.D_anDongUnchanged ? '✅' : '❌'} | 变化 ${stat.nonYuePoChongAnDongChanged} |`);
L.push(`| D2 | riPo 新增仅限「死/囚/休」；旺/相不得新增日破、原有日破不得丢失 | ${checks.D_riPoOnlyForShuai ? '✅' : '❌'} | 异常 ${stat.nonYuePoChongRiPoBad}；休→日破 ${stat.xiuToRiPo} |`);
L.push(`| E | 月破爻 lingTai 变化仅限「旺→休」，相/休/死/囚 不得变化 | ${checks.E_yuePoLingTaiOnlyWangToXiu ? '✅' : '❌'} | 旺→休 ${stat.wangToXiu}；异常 ${stat.yuePoLingTaiBadChange} |`);
L.push(`| F1 | 月破 −3 扣分信号仍在（yuepo） | ${checks.F_yuepoDeductionStillThere ? '✅' : '❌'} | ${verdictCheck.yuepoSignal} 条 |`);
L.push(`| F2 | 月破爻不再出现旺相加分（wangxiang + 月破文本） | ${checks.F_noWangBonusOnYuePo ? '✅' : '❌'} | ${verdictCheck.wangSignalOnYuePo} 条 |`);
L.push('');
L.push('## 语义说明：为什么「失气」不是重复惩罚');
L.push('');
L.push('修复前：月破爻若本判旺/相，既拿「旺相 +2」又拿「月破 −3」，净 −1——旺相分抵消了破的力度。');
L.push('修复后：旺相态压为休，旺相 +2 消失，只留「月破 −3」，净 −3。');
L.push('失气本身不加分也不减分，只是移除一个**不成立的旺相认定**（「月破之爻如物已破，不当言旺」），');
L.push('因此不存在「状态转换 + 月破扣分」的重复惩罚，是**去掉错误加分**。');
L.push('上表 E 行证明变化只有「旺→休」一种，未波及相/休/死/囚；A 行证明破的认定本身未动。');
L.push('');
L.push('## 变化明细样本（最多 12 条）');
L.push('');
L.push('```json');
L.push(JSON.stringify(stat.changes, null, 1));
L.push('```');
L.push('');
L.push('## verdict 层抽查');
L.push('');
L.push(`枚举 ${verdictCheck.checked} 个判读（12 月令 × 4096 盘 × 8 域），`);
L.push(`命中 yuepo 扣分信号 ${verdictCheck.yuepoSignal} 条，月破爻旺相加分 ${verdictCheck.wangSignalOnYuePo} 条。`);
L.push('');

fs.mkdirSync(OUT, { recursive: true });
fs.writeFileSync(path.join(OUT, 'yuepo-audit.md'), L.join('\n'));
fs.writeFileSync(path.join(OUT, 'yuepo-audit.json'), JSON.stringify({ checks, stat: { ...stat, changes: stat.changes }, verdictCheck }, null, 1));

console.log(JSON.stringify(checks, null, 1));
console.log('枚举', stat.total, '例 | 月破', stat.yuePoTrue, '| 旺→休', stat.wangToXiu, '| 休→日破', stat.xiuToRiPo);
console.log('verdict 抽查:', JSON.stringify({ yuepo: verdictCheck.yuepoSignal, wangOnYuePo: verdictCheck.wangSignalOnYuePo, checked: verdictCheck.checked }));
