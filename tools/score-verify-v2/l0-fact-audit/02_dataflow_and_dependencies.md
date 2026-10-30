# 02 数据链路与依赖

## 1. 19 步数据链路（从用户操作到屏幕像素）

| # | 步骤 | 输入 | 输出 | 实现位置 | 外部依赖 | 可独立验证 | 本轮结果 | 风险 |
|---|---|---|---|---|---|---|---|---|
| 1 | 选择起卦方式 | 用户点击 | `source ∈ {coins, tianji, manual}` | `app/js/cast.js` tab 事件 | — | 静态审查 | ✅ 三方式齐备 | 无 |
| 2 | 取起卦时刻 | `new Date()` 或用户手选 | 本地 `Date` | `cast.js`（`parseLocalDateTime`） | 浏览器时区 | 静态 | ✅ | 用户手改时间可任意，属预期 |
| 3 | 真太阳时校正 | `Date` + 观测地经度 | 校正后 `Date` | `cast.js:applyTstAt` → `state.js:resolveCastDate` → `solartime.js:toTrueSolar` | 无 | 静态 + 公式复核 | ✅ 均时差 + 经度差，与 core 的 `toApparentSolarTime`（仅经度差）**不冲突**，因为 core 路径未被调用 | 开关默认值影响结果，见 03 文档 §5 |
| 4 | 生成 6 个爻值 | 背数 / 时间 / 手录 | `yaoValues: (6\|7\|8\|9)[6]`，自下而上 | `input.ts:castCoins / castManual / castTianji`、`timecast.ts:castByTime` | 无 | 可（穷举） | ✅ 映射正确 | `castTianji` 四象均匀 25%，与真实摇钱二项分布不同，见 04 文档 §5 |
| 5 | 晚子时流派调整 | `yaoValues` + `hour` | 23:00→00:00（`'00'` 流派时） | `app/js/zischool.js:adj` | — | 可 | ✅ 只改 hour 不改 day，日柱自然落当天 | 若节气恰在当日 22:00-24:00 交节，月柱按同日 0 点取（注释已警示） |
| 6 | 装卦入口 | 上一步全部 | `Pan` 对象 | `paipan.ts:paipan()` | — | — | ✅ | 无 |
| 7 | 四柱 | 年月日时分 | `siZhu.{year,month,day,time}GanZhi` | `calendar.ts` | lunar-javascript 1.7.7 Exact API | **可**（astronomy-engine + JDN 独立） | ✅ 598/598 | 节气时刻与独立天文算法差 60~120 秒，见 03 §4 |
| 8 | 旬空 | 日干支 | `xunKong: [支,支]` | `calendar.ts:getDayXunKong` | lunar-javascript | **可**（六十甲子推旬首） | ✅ 60/60 | **只输出日旬空，无时空亡**（F6 流派） |
| 9 | 卦名 / 上下卦 | 6 爻阴阳 | `benGua.{name,upper,lower}` | `guaTable.ts` + `paipan.ts` | mingpan | **可**（8×8 卦名表） | ✅ 64/64 | 无 |
| 10 | 卦宫 / 宫五行 / 八宫序 | 卦名 | `gong`、`gongWuXing`、`guaXu` | `guaTable.ts` | mingpan | **可**（变爻规则现场生成八宫） | ✅ 64/64 | 无 |
| 11 | 世应 | 八宫序 | `shiPosition`、`yingPosition` | `paipan.ts`（mingpan） | mingpan | **可**（世位映射 + 应=世+3） | ✅ 64/64 | 无 |
| 12 | 纳甲 | 上下卦 | 每爻 `gan`、`zhi` | `paipan.ts`（mingpan） | mingpan | **可**（纳甲口诀表） | ✅ 384/384 | 无 |
| 13 | 爻五行 | 地支 | 每爻 `wuXing` | `paipan.ts` | mingpan | **可**（地支五行表） | ✅ 384/384 | 无 |
| 14 | 六亲 | 宫五行 + 爻五行 | 每爻 `liuQin` | `paipan.ts` | mingpan | **可**（生克关系推） | ✅ 384/384 | 无 |
| 15 | 六神 | 日干 | 每爻 `liuShen` | `paipan.ts` | mingpan | **可**（日干起法） | ✅ 384/384 | 无 |
| 16 | 伏神 / 飞神 / 飞伏关系 | 本卦 + 本宫首卦 | `fuShenList[]` | `paipan.ts` | mingpan | **可**（缺六亲补首卦同位） | ✅ 64/64 清单 + 56/56 关系 | 无 |
| 17 | 变卦 | 动爻位 | `bianGua`、`bianYaoList` | `paipan.ts` | mingpan | **可**（阴阳反转 + 重排） | ✅ 384/384 变卦名 + 动爻位 + 变爻纳甲 | **变爻六亲恒用本卦宫五行**（F6 设计选择，见 05 §6） |
| 18 | 卦身 / 神煞 | 世位 / 日干支等 | `guaShen`、`shenSha` | `guashen.ts`、`shensha.ts` | mingpan | 卦身可，神煞部分可 | ✅ 卦身 64/64；神煞本轮未逐项验证 | 神煞属辅助信息，不在 L0 必审清单 |
| 19 | 序列化 → 前端渲染 | `Pan` 对象 | 屏幕 HTML | `panview.js:renderPan`、`format.ts` | — | 部分可（`formatScreen`/`formatCopyText` 可运行时验证；DOM 渲染只能静态审查） | ⚠️ 5 处差异，见 06 文档 | `BAGUA_BITS` 错误在此暴露 |

## 2. 链路上的关键分支

```
                    ┌─ castCoins(背数×6) ──┐
用户起卦 ─→ 取时间 ─→├─ castByTime(梅花时间)─┼─→ yaoValues ─→ adj(晚子时) ─→ paipan() ─→ Pan
                    └─ castManual(手录)  ──┘                                        │
                                                                                    ↓
                              resolveCastDate(真太阳时) ────────────────→ current.pan ─→ renderPan()
```

**两条时间路径的差异（已核对，非缺陷）**：

| 路径 | 时间校正实现 | 是否含均时差 |
|---|---|---|
| 摇卦 / 手录 | `state.js:resolveCastDate` → `solartime.js:toTrueSolar` | ✅ 含（`eqTime + 4×(lon-120)` 分钟） |
| 天机时间起卦 | `cast.js:applyTstAt` → `toTrueSolar`，再 `castByTime(dt.getTime())` **不传 longitude** | ✅ 含（同一函数） |

`timecast.ts:toApparentSolarTime` 只校正经度差、不含均时差，但它在 app 路径下**不会被触发**（因为 `castByTime` 调用时没传 `options.longitude`）。这是正确的"不双计"设计。若未来有人给 `castByTime` 传了 `longitude`，就会与 `applyTstAt` 重复校正 —— 记为潜在风险（F4 级，非当前缺陷）。

## 3. 第三方依赖盘点（10 项）

| # | 依赖 | 版本 | 引入位置 | 承担的职责 | 是否在关键路径 | 本轮验证方式 | 结论 |
|---|---|---|---|---|---|---|---|
| 1 | mingpan | 0.1.8 | `paipan.ts` | 纳甲、世应、六亲、六神、伏神、旬空、神煞、卦宫 | **是**（步骤 9-18） | dist 为 tsc 产物、源码可读；用独立表 384 爻全量比对 | ✅ 零差异 |
| 2 | lunar-javascript | 1.7.7 | `calendar.ts` | 四柱干支、农历、节气表 | **是**（步骤 7-8） | astronomy-engine 视黄经 + JDN 公式独立交叉 | ✅ 598/598，节气偏差 ≤120s |
| 3 | astronomy-engine | 2.1.19 | 占星模块（本轮用作基准） | 太阳视黄经 | 否（本轮） | 作为**独立基准**使用 | ✅ 立春实测 2026-02-04 04:01 与权威历书一致 |
| 4 | auseklis | 0.4.0 | `astro.ts` | 占星 | 否 | 未审（不在 L0 范围） | — |
| 5 | caelus | 0.25.0 | `astro.ts` | 占星 | 否 | 未审 | — |
| 6 | iztro | 2.6.2 | `ziwei.ts` | 紫微斗数 | 否 | 未审 | — |
| 7 | liuyao（dev） | 0.5.1 | 未在 src 中 import | 对照参考 | 否 | 未使用 | — |
| 8 | tsup（dev） | ^8.3.5 | 构建 | 打包单 bundle | 构建期 | `dist` 与 `vendor` 同源 | — |
| 9 | typescript（dev） | ~5.6.3 | 构建 | 编译 | 构建期 | — | — |
| 10 | vitest（dev） | ^2.1.8 | 测试 | 单测 | 否 | 本轮未运行项目自带单测 | — |

**mingpan 可读性证据**（决定 F4 等级的关键）：

```
liuyao-core/node_modules/mingpan/
├── package.json          main: dist/index.js, files: ["dist"], version 0.1.8
└── dist/services/liuyao/
    ├── LiuyaoService.js  9,003 B   ← tsc 输出，"use strict" + JSDoc，未压缩
    ├── index.js          1,390 B
    ├── calculators/
    ├── data/
    └── types.d.ts        4,628 B
```

因此「第三方排盘依赖不可验证」这一 F4 风险，本轮从"不可验证"降级为"**可读源码 + 独立算法交叉验证已通过**"。剩余 F4 只涉及：mingpan 的**神煞**（本轮未逐项验证）与 lunar-javascript 的**节气时刻绝对精度**（需更高精度历表做基准）。

## 4. vendor 与 src 的一致性风险

`app/vendor/liuyao-core.js`（45,948 行）由 `tools/build-vendor.mjs` 从 `liuyao-core/src/**` 打包。历史上出现过"只改 vendor 不改 src"的漂移（v120 删小雷诺曼）。

本轮核对方式：`grep -c "BAGUA_BITS" app/vendor/liuyao-core.js` = 2，与 `src/constants.ts` 定义 + `paipan.ts` 使用一致；`getShouGuaPan` 在 vendor 中出现在 L32822（定义）、L33359/L33404（`formatCopyText`/`formatScreen` 调用）、L45855（导出），与 `src/format.ts` 结构一致。

**结论**：本轮审计以 `dist/index.js` 为被测对象（`src` 的直接编译产物），抽查确认 `vendor` 与 `src` 同构，未发现漂移。

## 5. 数据流中"计算 → 传递 → 展示"的三段分界

任务书要求区分 A（计算错）/ B（传递映射错）/ C（展示错）。本轮的分界判据：

| 段 | 边界 | 判据 |
|---|---|---|
| **A 计算** | `paipan()` 返回的 `Pan` 对象字段值 | 与独立预期表逐字段比对 |
| **B 传递映射** | `Pan` → `formatScreen`/`formatCopyText` 的视图模型 → `panview.js` 的 HTML 片段 | 视图模型字段与 `Pan` 是否一一对应、有无字段名/顺序/方向错位 |
| **C 展示** | HTML 最终呈现（列顺序、标签叠加、单位、文案） | 静态审查 DOM 结构与文案逻辑 |

本轮实际发生的问题定位：

| 问题 | A 计算 | B 传递 | C 展示 |
|---|---|---|---|
| 藏爻阴阳错 | ❌ 计算正确（纳甲干支全对） | ✅ `getShouGuaPan` 用 `BAGUA_BITS` 生成 `yinYang` | ✅ 渲染成阴阳爻线 |
| 雷火丰「归魂 + 五世」 | ⚠️ 计算按覆盖表输出（设计选择） | ✅ 原样传递 | ✅ 头部标签与世应同时显示，肉眼可见矛盾 |
| 变卦六亲用本卦宫 | ⚠️ 设计选择（注释明示） | ✅ | ✅ |

即：**计算层（A）没有发现任何真实错误**，问题全部在 B/C 段或"设计选择"。
