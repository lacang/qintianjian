# liuyao-core 审计报告

> 生成时间：2026-01-13  
> 审计范围：`/Coze/Drive/编程专家/每日六爻/liuyao-core/`  
> 审计方法：源码静态审查 + 已有测试覆盖率分析 + 交叉验证

---

## 一、项目架构概述

### 1.1 定位
六爻装卦引擎内核，纯 TypeScript 实现，框架无关，浏览器与 Node 均可离线运行。  
只做：历法 → 成卦 → 装卦 → 格式化；不做 UI、不联网、不做断卦吉凶。

### 1.2 技术栈
- **运行时依赖**：
  - `mingpan@0.1.8`（Apache-2.0）：卦宫/世应/纳甲地支/六亲/六神/伏神计算
  - `lunar-javascript@1.7.7`（MIT）：四柱/旬空/历法转换
  - `astronomy-engine@2.1.19`：西方占星天文计算
  - `iztro@2.6.2`（MIT）：紫微斗数底座
  - `caelus@0.25.0` + `auseklis@0.4.0`：占星辅助
- **开发依赖**：
  - `liuyao@0.5.1`（MIT，即 tsumugi）：64卦交叉验证基准
  - `vitest`：测试框架（FUSE沙箱中死锁，改用 tsx + node:assert）
  - `tsup`：打包工具

### 1.3 模块拓扑

```
types.ts          ← 类型定义（YaoValue/DiZhi/WuXing/LiuQin/LiuShen/Pan 等）
    ↑
constants.ts      ← 静态常量表（纳甲天干/八卦五行/地支五行/六合六冲/繁简转换）
    ↑
guaTable.ts       ← 64卦静态表（卦宫/世应/纳甲，mingpan + constants 组装）
    ↑
calendar.ts       ← 历法层（solarToSiZhu，lunar-javascript Exact API）
    ↑
shensha.ts        ← 14项神煞（日干支+月建→神煞行）
    ↑
paipan.ts         ← 主装卦引擎（组装完整 Pan 对象）
    ↑
wangshuai.ts      ← 旺衰/月日作用/动变关系
    ↑
wuxing-rel.ts     ← 五行/地支关系基础表
    ↑
najiaAnalysis.ts  ← 纳甲断卦事实层（取用神/伏神/动变分析）
    ↑
format.ts         ← 格式化层（屏显/文本输出）
    ↑
index.ts          ← 公共导出
```

附加模块（非六爻核心）：
- `bazi.ts`：八字排盘
- `meihua.ts`：梅花易数
- `qimen.ts`：奇门遁甲
- `astro.ts` / `astroTiming.ts` / `astroSky.ts`：西方占星
- `ziwei.ts`：紫微斗数
- `cards/`：通用卡牌框架
- `annotations/`：《周易》经传白文查表

---

## 二、各模块审计结果

### 2.1 types.ts ✅ 正确
- 类型定义完整，覆盖所有核心概念
- YaoValue 限定 6/7/8/9，符合铜钱法
- 所有术语用简体中文，设计原则清晰

### 2.2 constants.ts ✅ 正确
- 纳甲天干表（NAJIA_GAN）：与《增删卜易·纳甲歌》一致，来源 tsumugi（MIT）
- 八卦五行/地支五行：标准对照，无误
- BAGUA_BITS：经卦三爻阴阳表正确
- 六合卦（8个）/六冲卦（10个）：与 tsumugi 交叉验证零分歧
- GUI_HUN_OVERRIDE：雷火丰人工覆盖（详见风险点 §4）
- 繁简转换表：覆盖所有64卦名及六亲六神用字

### 2.3 guaTable.ts ✅ 正确
- getGuaMeta：mingpan guagong 数据表查询，繁体→简体转换正确
- getFullNajia：纳甲地支（mingpan）+ 天干（constants）组装，与 tsumugi 64卦全量交叉验证零分歧
- getTrigramsFromValues：爻值→上下卦转换，mingpan NajiaCalculator.getGuaFromYaoValues
- 变卦六亲恒用本卦宫五行（头号红线），在 paipan.ts L132 正确实现

### 2.4 calendar.ts ✅ 正确（含已知流派分歧）
- 使用 lunar-javascript Exact API（getYearInGanZhiExact/getMonthInGanZhiExact/getDayInGanZhiExact）
- 旬空用 getDayXunKong()，正确
- **晚子时（23:00-24:00）换日问题**：当前沿用 lunar-javascript 默认口径（不换日），存在流派分歧（详见风险点 §3）

### 2.5 shensha.ts ⚠️ 部分存疑
- **已验证正确（金标准乙丑日/戌月）**：
  - 驿马/桃花/日禄/贵人/文昌/羊刃/将星/谋星/劫煞/灾煞/华盖/日德/天医
- **天马实现存疑**（L153）：`const tianMa = monthZhi;` 直接返回月建本位
  - 与通行"月建驿马"口诀不符（戌月寅午戌局马在申，但金标准给"天马-戌"）
  - 仅有单一数据点验证，待补其他月份真实盘确认规则
- **羊刃阴干处理**：全干按"禄前一位"实现
  - 传统"阳刃"只配阳干（甲卯/丙午/戊午/庚酉/壬子），阴干无刃
  - 金标准 App 乙日给"羊刃-寅"，故全干按禄前一位实现
  - TODO：若后续拿到阴干真实盘与此不符，再以新金标准修订

### 2.6 paipan.ts ✅ 正确
- 组装流程完整：历法→本卦→六爻→变卦→伏神→神煞
- 六亲计算：mingpan LiuqinCalculator，固定传本卦宫五行
- 变卦六亲：恒用本卦宫五行（L132），非 bianMeta.gongWuXing（头号红线）
- 六神：mingpan LiushenCalculator（按日干）
- 伏神：mingpan FushenCalculator，天干取本宫首卦纳甲
- 输入校验：6爻值/合法值(6-9)检查完备

### 2.7 wuxing-rel.ts ✅ 正确
- 五行相生相克：标准对照无误
- 六冲/六合/三刑/三合/六害：全部对照《增删卜易》正确
- 长生十二宫：火土同宫，与《增删卜易》一致
- 进神退神：JIN_TUI 表正确

### 2.8 wangshuai.ts ✅ 正确
- 月令旺衰五态（旺/相/休/囚/死）：标准定义
- 日辰作用五种关系：正确
- 月破/旬空/入墓/逢绝/长生/帝旺：事实标记完整
- 伏吟/反吟：化同位=伏吟，化冲=反吟
- 回头生/回头克/化进/化退：动变关系正确

### 2.9 najiaAnalysis.ts ✅ 正确
- 取用神：9域（财运/感情/健康/事业/考试/合作/出行/家宅/官司）
- 用神选择逻辑：按六亲对应关系
- 伏神分析：不上卦的六亲，列出伏神及飞伏关系
- 动变分析：动爻变爻的五行关系/旺衰状态

---

## 三、已知风险点

### 3.1 天马实现存疑 🟡
- **现状**：`shensha.ts` L153 `const tianMa = monthZhi;`
- **问题**：直接返回月建本位，与通行"月马"口诀（按月建取驿马）不同
- **金标准**：乙丑日/戌月 → 天马-戌，与月建本位一致
- **验证缺口**：仅有单一数据点，无法确认其他月份是否也是"月建本位"
- **建议**：补 3-5 个不同月份的真实盘例，确认 App 天马规则后修订

### 3.2 羊刃阴干处理 🟡
- **现状**：全干按"禄前一位"实现（甲卯/乙寅/丙午/丁巳/戊午/己巳/庚酉/辛申/壬子/癸亥）
- **传统规则**：阳刃只配阳干（甲卯/丙午/戊午/庚酉/壬子），阴干无刃
- **金标准**：乙日 App 给"羊刃-寅"，与"禄前一位"一致
- **风险**：部分术数流派阴干不设羊刃，若后续有不同口径的金标准需调整
- **建议**：标记为 App 特有口径，文档中注明与传统阳刃的区别

### 3.3 晚子时（23:00-24:00）换日 🟡
- **现状**：沿用 lunar-javascript 默认口径，日柱不换日
- **流派分歧**：
  - 一派认为 23:00 后即进入次日子时，日柱应换为次日
  - 一派认为 23:00-24:00 仍属当日"晚子时"，日柱不换
- **代码注释**：TODO(流派待定) 已标记
- **建议**：由主人确认使用哪个流派后全项目统一

### 3.4 雷火丰归魂覆盖 🟡
- **现状**：`constants.ts` GUI_HUN_OVERRIDE 对雷火丰做人工覆盖
- **冲突**：
  - mingpan/tsumugi/通行京房体系：雷火丰 = 坎宫五世卦
  - 金标准 App：雷火丰 = 坎宫归魂（世五应二）
  - App 同时取了"归魂"标签和"世五"位（与标准归魂世三不同）
- **实现**：`guaTable.ts` L65 `isGuiHun: info.guaXu === 8 || GUI_HUN_OVERRIDE.has(name)`
- **世应位置**：mingpan 给世五应二，与 App 一致，无需修改
- **建议**：仅此一卦做覆盖，若后续发现其他类似冲突再扩展 GUI_HUN_OVERRIDE

---

## 四、已有测试覆盖率分析

### 4.1 测试文件清单

| 文件 | 类型 | 覆盖范围 |
|------|------|---------|
| `test/golden.test.ts` | 金标准验证 | 3个完整盘例（泽火革/雷火丰/地天泰） |
| `test/cross64.test.ts` | 交叉验证 | 64卦与tsumugi静态表全量比对 |
| `selfcheck.ts` | 集成测试 | 20项断言（五行/旺衰/纳甲分析/伏神/用神） |
| `test/calendar.test.ts` | 历法层 | 四柱/旬空/节气 |
| `test/bazi.test.ts` | 八字 | 排盘/十神/大运 |
| `test/format.test.ts` | 格式化 | 屏显/文本 |
| `test/input.test.ts` | 成卦入口 | castManual/castCoins/castTianji |
| `test/meihua.test.ts` | 梅花易数 | 时间起卦/数字起卦 |
| `test/qimen.test.ts` | 奇门遁甲 | 时家转盘拆补 |
| `test/ziwei.test.ts` | 紫微斗数 | 排盘/四化/大限 |
| `test/astro.test.ts` | 西方占星 | 本命盘/推运 |
| `test/cards.test.ts` | 卡牌框架 | 韦特牌组/牌阵 |
| `test/najia-analysis.test.ts` | 纳甲分析 | 用神/伏神/动变 |
| `test/reading.test.ts` | 读卦域 | 9域用神 |
| `test/annotations.test.ts` | 经传注解 | 卦爻辞/翼传 |
| `test/timecast.test.ts` | 时间起卦 | 天机/真太阳时 |
| `test/meridian.test.ts` | 子午流注 | 当令经络 |

### 4.2 六爻核心覆盖率

| 维度 | 覆盖情况 | 缺口 |
|------|---------|------|
| **64卦静态表** | ✅ cross64.test.ts 全量覆盖 | 无 |
| **60甲子日** | ⚠️ 间接覆盖（金标准3个日期） | 缺系统性遍历验证 |
| **64种动静组合** | ⚠️ 间接覆盖（金标准含动爻） | 缺全排列测试 |
| **世应位置** | ✅ cross64.test.ts 与tsumugi交叉 | 无 |
| **纳甲（天干+地支）** | ✅ cross64.test.ts 全量覆盖 | 无 |
| **六亲** | ✅ cross64.test.ts + golden.test.ts | 无 |
| **六神** | ✅ golden.test.ts 逐爻验证 | 无 |
| **伏神** | ✅ golden.test.ts + selfcheck.ts | 无 |
| **变卦六亲（本宫五行）** | ✅ golden.test.ts 泽火革验证 | 无 |
| **旬空** | ⚠️ 金标准3个日期验证 | 缺60甲子遍历 |
| **神煞14项** | ✅ golden.test.ts 雷火丰全量验证 | 仅1个数据点 |
| **旺衰/动变** | ✅ selfcheck.ts 20项断言 | 无 |

### 4.3 覆盖率总结
- **高覆盖**：64卦静态表、纳甲、六亲、六神、伏神、变卦六亲、旺衰
- **中覆盖**：旬空（仅金标准日期）、神煞（仅1个数据点）
- **低覆盖**：60甲子日遍历、64种动静组合全排列

---

## 五、审计结论

### 5.1 总体评价
liuyao-core 核心引擎实现质量高，架构清晰，依赖选型合理（MIT/Apache-2.0），与金标准 App 高度一致。

### 5.2 关键验证
- ✅ 64卦与 tsumugi（MIT）交叉验证零分歧
- ✅ 3个金标准盘例逐字段一致
- ✅ 20项集成断言全部通过
- ✅ 变卦六亲恒用本卦宫五行（头号红线）正确实现

### 5.3 待解决事项
1. **天马规则确认**：需补 3-5 个不同月份真实盘例
2. **晚子时流派**：需主人确认换日/不换日
3. **羊刃阴干**：已按金标准 App 实现，与传统阳刃有差异，文档注明即可

### 5.4 测试补充建议
- 增加 60甲子日遍历测试（验证 dayGanZhi + xunKong 连续性）
- 增加 64种动静组合测试（验证变卦逻辑完备性）
- 增加 100组随机压力测试（验证引擎鲁棒性）
