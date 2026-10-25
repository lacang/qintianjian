# liuyao-core

纯自用命理工作台的**六爻装卦引擎内核**。纯 TypeScript、框架无关、零 UI 依赖、可离线运行（浏览器与 Node 均可直接 import）。只做排盘，不做断卦、不联网、不接大模型。

## 能力

- 公历 → 四柱干支（精确节气）+ 日旬空
- 三种成卦：手录六爻 / 摇三枚铜钱 / 天机随机（时间戳种子、可复现）
- 装卦：本卦宫名卦名、六合/六冲/归魂/游魂/八纯标记、纳甲、六亲、六神、世应、伏神（飞伏关系）、变卦整盘（**变卦六亲恒按本卦宫**）、神煞 14 项
- 格式化：与「六爻排盘」App「复制卦例」逐字一致的纯文本 `formatCopyText`；供界面使用的结构化视图模型 `formatScreen`

## 安装与构建

```bash
npm install
npm run typecheck   # tsc --noEmit
npm test            # vitest run，100 用例
npm run build       # tsup 出 ESM/CJS + .d.ts 到 dist/
```

## 快速使用（ESM）

```ts
import { paipan, castManual, formatCopyText, formatScreen } from './dist/index.js';

// 手录：自下而上六爻；泽火革 三/四/上爻动（2026-10-18 02:46）
const pan = paipan({
  yaoValues: castManual([
    { yinYang: '阳' },
    { yinYang: '阴' },
    { yinYang: '阳', moving: true },
    { yinYang: '阳', moving: true },
    { yinYang: '阳' },
    { yinYang: '阴', moving: true },
  ]),
  year: 2026, month: 10, day: 18, hour: 2, minute: 46,
  gender: '男', question: '',
});

console.log(pan.benGua.name, pan.benGua.gong);   // 泽火革 坎
console.log(pan.bianGua.name);                    // 风雷益
console.log(formatCopyText(pan));                 // App「复制卦例」同款文本
const vm = formatScreen(pan);                     // UI 视图模型（自上而下 6 行）
```

摇铜钱：`castCoins([{backs:2},{backs:2},{backs:3}, ...])`（每爻三枚，backs=字面/背数）；
天机随机：`castTianji(seed)`，同一种子结果可复现。

## 核心 API

| API | 说明 |
|---|---|
| `solarToSiZhu(date)` | 公历→{年柱,月柱,日柱,时柱,旬空}，lunar Exact 精确节气 |
| `castManual(yaos)` | 手录六爻 → 成卦值 |
| `castCoins(tosses)` | 摇三枚铜钱×6 → 成卦值 |
| `castTianji(seed)` | 种子化随机成卦 |
| `paipan(input)` | 成卦值+时间 → 标准盘对象 `Pan` |
| `getShouGuaPan(gong)` | 本宫首卦（八纯卦）藏爻盘 |
| `formatCopyText(pan,{showHidden})` | App 同款复制文本 |
| `formatScreen(pan,{showHidden})` | 界面视图模型 `ScreenViewModel` |
| `calcShenSha(dayGanZhi, monthBranch)` | 神煞 14 项 |

类型见 `src/types.ts`。

## 运行时依赖与许可

- `mingpan@0.1.8`（Apache-2.0）、`lunar-javascript@1.7.7`（MIT）；开发期 `liuyao@0.5.1`（MIT）用于数据表与对账。
- 本包自身 MIT。**不含任何 GPL/AGPL 代码，不含 Swiss Ephemeris。**

## 已知限制

- 晚子时（23–24 点）日柱口径未定（TODO，默认 lunar 行为）。
- 真太阳时/经度校正由上层应用处理。
- 神煞目前为金标准所列 14 项；隐藏藏爻时复制文本是否保留本宫列待补 App 样本。
- 详见 `构建与验收报告.md`。
