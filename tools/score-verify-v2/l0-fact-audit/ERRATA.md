# L0 审计报告勘误（ERRATA）

> 本文件只追加、不修改原审计文件，保证「当时的判断」可追溯。
> 勘误日期：2026-10-27（L0 收尾轮）
> 依据：`../l0-fix-audit/01_changes.md` §1.1（根因重新裁定）、§2（雷火丰）
> 状态：ERRATA-1 已修复；ERRATA-2 为原报告笔误（非代码缺陷），随 ERRATA-1 一并说明。

---

## ERRATA-1：P1「改 BAGUA_BITS 表」的方案是错的，正确修复是改消费方

**原报告位置**：`10_recommendations.md` 第 36-50 行（P1 项）

**原结论**：
> `BAGUA_BITS` 表里兑/震/巽/艮四个卦的阴阳位写反了，应直接改表的 4 个布尔值。

**为什么错**：

原报告在根因定位时混淆了数组位序约定。重新核实 6 件事（见 `../l0-fix-audit/01_changes.md` §1.1 六项前置确认表）后确认：

1. `BAGUA_BITS` 的数组位序是 **top-to-bottom（index 0 = 三爻/上爻，index 2 = 初爻）**，按此约定读 8/8 全对。
2. 真正的缺陷在 `liuyao-core/src/paipan.ts` 的 `getShouGuaPan()`：它把 `bits[i % 3]` 当成「index 0 = 初爻」消费（`i` 来自纳甲列表，i=0 即初爻）。**消费方向与存储方向相反**。
3. 若照原方案改表，会立刻破坏 `liuyao-core/stress-test.ts`——该文件第 73 行注释明确写「BAGUA_BITS 实际是 [三爻,二爻,初爻]（top-to-bottom）」，第 77-78、92-93 行用 `[...BAGUA_BITS[lower]].reverse()` 正确消费。

**数学解释（为何恰好 4/8 宫暴露）**：兑 110/011、震 100/001、巽 011/110、艮 001/100 是互为镜像的非回文卦，两种读法结果相反；乾 111、离 101、坎 010、坤 000 是回文串，正读反读同值，缺陷不暴露。

**正确修复（已实施）**：
- 改 `paipan.ts:253`：`bits[i % 3]` → `bits[2 - (i % 3)]`（1 行 + 位序陷阱注释）
- `constants.ts` 的 `BAGUA_BITS` **零改动**
- 证据：修复后 `03_ui.mjs` U1 藏爻阴阳 8/8；新旧 vendor 对 64 卦 × 45 字段 = 2880 个字段值全量 diff，除雷火丰 isGuiHun 外零差异。

---

## ERRATA-2：原表格中艮卦「现状值」抄错（笔误）

**原报告位置**：`10_recommendations.md` 第 43 行与第 49 行的修正对照表

**原文两处**：

```
3. 艮：修正前 [false,false,true]，修正后 [false,false,true]
   艮 [false,false,true]  [false,false,true]
```

**问题**：

1. 修正前后同值，表格自相矛盾——这正是主人在执行指令中点名要求重新核实的破绽。
2. 「修正前 [false,false,true]」与源码不符。`constants.ts:36` 艮的真实定义是 `[true,false,false]`（top-to-bottom = 三爻阳、二爻阴、初爻阴），按 index0=初爻的错误读法会得到 100（即 [true,false,false] 的镜像），修复前 `getShouGuaPan` 给出的艮宫藏爻正是错误的 100/100。

**说明**：这是原审计报告的抄写/推导笔误，不是产品缺陷。产品侧的真实状况以 ERRATA-1 为准：表对、消费错，已改消费方。

---

## 不受勘误影响的部分

`10_recommendations.md` 同页的 **P0 雷火丰项（第 22-34 行）结论正确**：雷火丰是坎宫第六卦（五世，世5应2），不应标归魂；坎宫归魂为第八卦地水师、游魂为第七卦地火明夷。该项已按方案 B 修复（`isGuiHun: info.guaXu === 8`，删除按卦名的人工覆盖），详见 `../l0-fix-audit/01_changes.md` 第二章。

本目录其余 9 份报告（00 执行摘要、01~09 各层结果）的事实数据、差异清单（6 项差异本身）均有效；受影响的只是 10_recommendations 里 P1 的**根因与方案**，以及上述笔误。
