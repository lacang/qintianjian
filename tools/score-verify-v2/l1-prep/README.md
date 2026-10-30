# l1-prep · L1 关键事实识别准备

本目录是 L1 阶段的准备工作产物。**只做盘点、归档、测试设计，未修改任何 L1 生产代码。**

## 文件清单

| 文件 | 对应交付 | 内容 |
|---|---|---|
| `01_snapshot_update.md` | 交付 1 | AI 资料包快照更新报告（生成器来源确认 / 10 文件变更 / 5 项核验 / 自检缺陷如实报告 / 剩余风险） |
| `02_l1_inventory.md` | 交付 2 | L1 现状盘点表（5 类：有充分测试 / 证据不足 / 有已知缺陷 / 未实现 / 口径未定） |
| `03_l1_rule_catalog.md` | 交付 3 | L1 规则目录与证据来源（9 大类，含古籍来源、实现位置、状态、待定项） |
| `04_l1_test_design.md` | 交付 4 | L1 独立测试设计（12 项，含输入/独立预期/正反例/边界/来源/实现/测试/风险） |
| `05_l1_priority.md` | 交付 5 | L1 实施优先级（P1 立即 / P2 紧接 / 暂缓 / 待考证 / 不做，含依赖关系） |
| `06_snapshot_gate.md` | 交付 6 | 快照回归门禁方案（四层检查，只给方案不改门禁） |
| `07_open_issues.md` | 交付 7 | 未解决问题清单（Q1-Q7 需裁决 / Q8-Q24 待处理 / 已解决 5 项） |
| `verify-facts-after-l0fix.json` | 支撑数据 | L0 修复后重跑的 key-fact 核对结果 |

## 关键支撑数据

- `../key-fact-audit/output/verify-facts.json` —— **旧审计结果已原样保留**（`generatedAt` 2026-10-27T02:36:29，T1 mismatch=4），未覆盖
- `verify-facts-after-l0fix.json` —— 本轮重跑结果（T1 mismatch=0，T7 isGuiHun=false）

## 本轮做了什么 / 没做什么

**做了**：
- 确认 `tools/ai-pack-sample.mjs` 使用工作区代码、不联网、不调线上
- 运行生成器更新 `aipack-samples/`（10 个文件变更，10 个不变，文件总数仍 20）
- 5 项关键事实核验（雷火丰不标魂 / 明夷游魂 / 师归魂 / 三模式一致 / 四格式无矛盾）
- git 与文件清单核对（`git status` 逐行相同，HEAD `7a5bae4`，远端 `0ed9e89`）
- 重跑 `verify-facts.mjs` 确认 L0 两项修复生效
- 盘点 9 大类规则、12 项测试设计、5 级优先级、四层门禁方案

**没做（按限制条款）**：
- 未修改任何 L1 生产代码（`wangshuai.ts` / `najiaAnalysis.ts` / `verdict.js` / `aipack.js` 零改动）
- 未修改评分算法
- 未改天机起卦概率 / 真太阳时 / 晚子时 / 神煞
- 未新增术数功能
- 未覆盖旧审计报告（旧 `verify-facts.json` 已还原）
- 未删除历史资料或未跟踪文件
- 未执行 commit / push / deploy
- 未改 `tools/gates.sh`

## 三个最需要关注的结论

1. **`verdict.js` 六冲/六合卦名单是确定的错**（六冲缺 2、六合错 6），影响 love/people 两域评分。这属于数据错误而非算法分歧，修起来最简单。
2. **`tools/gates.sh` 12 步完全不跑六爻测试**（16 文件 1784 行 vitest、`score-regression.mjs` 393216 场景、`verify-facts.mjs` 全部不在门禁里）。这是结构性风险：`golden.test.ts:146` 的过期断言因此长期存活。
3. **月破与旺相并存占 8.33%**（24576/294912），且已有实际评分反转案例，需要口径裁决。

## 下一步

等人工验收。未获批准前不进入 L1 生产代码修改。
