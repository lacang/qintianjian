# 01 · AI 资料包快照更新报告

生成时间：2026-10-27
执行范围：`aipack-samples/`（20 个文件）
未执行：commit / push / deploy

---

## 1. 生成器来源确认（任务要求 2）

读 `tools/ai-pack-sample.mjs` 全 281 行，第 31-37 行是数据来源的唯一入口：

```js
const ROOT = path.resolve(import.meta.dirname, '..');
const OUT = path.resolve(process.argv[2] || path.join(ROOT, 'aipack-samples'));
const core = await import(path.join(ROOT, 'app/vendor/liuyao-core.js'));
const { judgeNajia } = await import(path.join(ROOT, 'app/js/verdict.js'));
const { rwsVal } = await import(path.join(ROOT, 'app/js/tarotval_rws.js'));
const { buildAiPack, renderAiPackText, ... } = await import(path.join(ROOT, 'app/js/aipack.js'));
```

结论：

| 检查项 | 结果 |
|---|---|
| 是否联网 | 否，全文件无 fetch / http / 远程 URL |
| 是否调用线上旧版本 | 否，全部 `import(path.join(ROOT, ...))` 指向工作区文件 |
| 排盘引擎来源 | `app/vendor/liuyao-core.js`（工作区 vendor） |
| 判断层来源 | `app/js/verdict.js`（工作区） |
| 打包层来源 | `app/js/aipack.js`（工作区） |
| vendor 与 src 是否同步 | `node tools/build-vendor.mjs --check` → 2492900 字节 / 一致 |

**结论：生成器使用当前工作区最新代码，不联网、不调线上。**

---

## 2. 修改文件清单（任务要求 1、5）

用 `md5sum` 记录更新前 20 个文件指纹，更新后逐项对比：

### 2.1 已修改（10 个）

| 文件 | 差异行数 |
|---|---|
| `aipack-samples/index.html` | 194 |
| `aipack-samples/liuyao-quick.html` | 82 |
| `aipack-samples/liuyao-classic.html` | 60 |
| `aipack-samples/liuyao-research.html` | 56 |
| `aipack-samples/liuyao-quick.json` | 36 |
| `aipack-samples/liuyao-classic.json` | 25 |
| `aipack-samples/liuyao-research.json` | 23 |
| `aipack-samples/liuyao-quick.txt` | 13 |
| `aipack-samples/liuyao-research.txt` | 12 |
| `aipack-samples/liuyao-classic.txt` | 10 |

### 2.2 未修改（10 个）

`aipack-samples/README.md`（生成器不产出此文件，人工维护，原样保留）

`tarot-{quick,classic,research}.{txt,json,html}` 共 9 个 —— **md5 完全一致，零字节变化**。塔罗链路未受本轮任何改动影响。

### 2.3 文件总数

更新前 20 → 更新后 20，无新增、无丢失。

### 2.4 生成物可复现性

先在 `/tmp/aipack-verify` 试跑，再正式生成到 `aipack-samples/`。两次产物 19 个生成文件 **逐字节一致**（`cmp -s` 全 SAME），证明生成器确定性。

---

## 3. 修改原因（三类，逐项溯源）

### 原因一：L0 魂卦标签修复（本轮预期改动）

```diff
- chart_data.ben_gua.flags[0] : "归魂"
+ chart_data.ben_gua.flags[0] : undefined
```

溯源：`liuyao-core/src/guaTable.ts` L0 修复撤销了 `GUI_HUN_OVERRIDE`：

```diff
- isGuiHun: info.guaXu === 8 || GUI_HUN_OVERRIDE.has(toSimplified(info.name)),
+ // 归魂 = 八宫第八卦（《增删卜易·归魂游魂章》：「归魂卦为各宫之第八卦」）。
+ // 雷火丰是坎宫第六卦（五世卦），不标归魂；坎宫归魂是地水师。
+ isGuiHun: info.guaXu === 8,
```

雷火丰 guaXu=6（五世），故 `isGuiHun=false`。文本侧同步消失：

```diff
- 本卦：雷火丰（震上离下，坎宫水，归魂，世5应2）
+ 本卦：雷火丰（震上离下，坎宫水，世5应2）
```

### 原因二：评分去重 V2 修复（**未发版**）

```diff
- computed_analysis.rule_based_judgments.score : 5
+ computed_analysis.rule_based_judgments.score : 4

- computed_analysis.rule_based_judgments.signals_total : 4
+ computed_analysis.rule_based_judgments.signals_total : 3

- signals[2].rule.id : "wangxiang"（世爻相于月）
+ signals[2].rule.id : "shiying"（应爻生世爻）
```

溯源：`app/js/verdict.js` 的 V2 去重闸门 `yongIsShi`。雷火丰该盘中用神（妻财）与世爻不是同一爻 → 世爻侧「相于月」保留；但用神侧与世爻侧的去重规则使总分由 5 降为 4、信号由 4 条并为 3 条。

**重要提示：这套评分逻辑当前只在本地 main，未 push、未部署，线上仍是 v121。快照现在反映的是「工作区当前代码」的评分结果，与线上不一致。** 这是任务要求（用当前工作区代码更新）的直接后果，但必须在验收时知情。

### 原因三：`aipack.js` 在旧快照生成后的演进

| 变化 | 说明 |
|---|---|
| `zhouyi_text: undefined → null` | 新增字段 |
| `layer_status.zhouyi_text: "not_included"` | 新增层状态 |
| `interpretation_constraints[4]`、`[5]` 新增 | 第 5 条 zhouyi_text 体系说明、第 6 条底本说明 |
| `source_materials[1].kind: "classic_quote" → "rule_digest"` | 新增「规则·整理」类素材 |
| quick 模式 `data_gaps[2]` 由「快速模式只附 3 条」改为 zhouyi_text 说明 | 说明文案调整 |

旧快照的 `interpretation_constraints` 只有 4 条，新产物有 6 条 —— 这是**为什么旧快照不触发自检误报、新产物触发**的直接原因（见第 6 节）。

---

## 4. 关键字段核验结果（任务要求 4）

### 4.1 雷火丰：不标归魂、不标游魂

| 模式 | `ben_gua.flags` | 文本「归魂/游魂」计数 |
|---|---|---|
| quick | `[]` | 0 |
| classic | `[]` | 0 |
| research | `[]` | 0 |

三模式本卦行统一为：`本卦：雷火丰（震上离下，坎宫水，世5应2）`

### 4.2 地火明夷：正确标游魂

样例集只含雷火丰，地火明夷/地水师用同一 aipack 链路单独复算（`/tmp/verify_3gua.mjs`，只读，不写仓库）：

| 卦 | 宫 | guaXu | 世应 | flags（三模式） | 本卦行 | 判定 |
|---|---|---|---|---|---|---|
| 雷火丰 | 坎 | 6 | 世5应2 | `[] / [] / []` | 雷火丰（震上离下，坎宫水，世5应2） | PASS |
| 地火明夷 | 坎 | 7 | 世4应1 | `["游魂"] / ["游魂"] / ["游魂"]` | 地火明夷（坤上离下，坎宫水，游魂，世4应1） | PASS |
| 地水师 | 坎 | 8 | 世3应6 | `["归魂"] / ["归魂"] / ["归魂"]` | 地水师（坤上坎下，坎宫水，归魂，世3应6） | PASS |

### 4.3 三模式基础事实一致

```json
{"chart_data quick==classic": true,
 "chart_data classic==research": true,
 "user_task 三者互异": true}
```

### 4.4 四格式之间无矛盾

抽取全部 10 个六爻文件（3 模式 × txt/json/html + index.html）中所有「雷火丰（…）」事实串：

```
唯一取值：雷火丰（震上离下，坎宫水，世5应2）
```

20 个文件全量「归魂」「游魂」计数均为 0（塔罗文件本就为 0，六爻文件更新后为 0）。

`index.html` 中出现的 `雷火丰之噬嗑` 是变卦表述（雷火丰之噬嗑），与卦名事实不冲突。

### 4.5 五项核验汇总

| # | 核验项 | 结果 |
|---|---|---|
| 1 | 雷火丰不标归魂/游魂 | PASS（三模式 flags=[]、0 处标签） |
| 2 | 地火明夷标游魂 | PASS（世4应1） |
| 3 | 地水师标归魂 | PASS（世3应6） |
| 4 | 三模式基础事实一致 | PASS（chart_data 全等） |
| 5 | 四格式无互相矛盾 | PASS（事实串唯一） |

---

## 5. git 与文件清单核对（任务要求 5）

```
$ git status --porcelain
 M app/vendor/liuyao-core.js
 M liuyao-core/src/constants.ts
 M liuyao-core/src/guaTable.ts
 M liuyao-core/src/paipan.ts
?? aipack-samples/
?? app/js/aipack.js
?? tools/ai-pack-sample.mjs
?? tools/score-verify-v2/key-fact-audit/
?? tools/score-verify-v2/l0-fact-audit/
?? tools/score-verify-v2/l0-fix-audit/
?? tools/score-verify-v2/output/analyzed-vall-510.csv
?? tools/score-verify/
```

- 与更新前**逐行相同**：4 个已跟踪改动 + 8 个未跟踪项，本轮未新增、未改动任何已跟踪文件
- `aipack-samples/` 整体仍是未跟踪目录（`git ls-files aipack-samples/` = 0）
- HEAD 仍 `7a5bae4`；`origin/main` 与 `github/main` 均仍 `0ed9e89`
- 未 commit / 未 push / 未 deploy

---

## 6. 生成器自检缺陷（必须如实报告）

### 6.1 现象

正式运行 `node tools/ai-pack-sample.mjs` 后自检报 2 项不通过：

```
自检：2 项不通过
  ✗ liuyao-classic: 文本里出现 undefined/null
  ✗ liuyao-research: 文本里出现 undefined/null
```

### 6.2 定位

`tools/ai-pack-sample.mjs:208`：

```js
if (txt.includes('undefined') || txt.includes('null')) problems.push(`${f.file}: 文本里出现 undefined/null`);
```

命中位置是 `liuyao-classic.txt` 第 99 行 / `liuyao-research.txt` 第 109 行，内容是**说明文字本身**：

> 「字段为 null 处表示底本无此条或本盘不适用，不要自行补写或用记忆中的其他版本替换。」

该句来自 `app/js/aipack.js:423` 的 `base.push(...)`，是给人看的约束说明，**不是空值泄漏**。

### 6.3 根因

1. 自检用朴素 `includes('null')`，未排除正常语义中出现的 "null" 一词；
2. 旧快照的 `interpretation_constraints` 只有 4 条，不含该句，所以**旧版生成器跑旧代码时不触发**；
3. `aipack.js` 后续新增了第 5、6 条约束（含 "null" 字样），使自检**必然误报**。

即：**既有自检缺陷被新增文案触发**，不是本轮修复引入，也不是产物内容错误。

### 6.4 处置说明

- **未修改生成器**（属 L1 范围外，用户限制 1「不修改 L1 生产代码」）；
- **未做任何字符串替换**掩盖（未改文案、未改自检、未 sed）；
- 产物经独立核验（第 4 节五项全 PASS）确认正确，且旧快照含**确凿错误事实**（雷火丰标归魂），不更新的危害大于更新；
- 故完成更新并如实记录该缺陷，列为未解决问题（见 `07_open_issues.md` 第 1 条）。

**若主人认为该缺陷应阻断更新，可用 `/tmp` 中的更新前 md5 清单与旧文件回滚，但旧文件已被覆盖，需从 git 外的备份恢复 —— 实际上 `aipack-samples/` 是未跟踪目录，无 git 历史可回退。这一点请在验收时确认。**

---

## 7. 剩余风险

| # | 风险 | 等级 | 说明 |
|---|---|---|---|
| 1 | 快照反映**未发版**的评分去重 V2 | 中 | 快照 score=4 与线上 v121 的 score=5 不一致。若把快照喂给模型，模型看到的是未来版本的评分 |
| 2 | 生成器自检误报未修 | 中 | 每次跑生成器都会 exit≠0，无法用于自动化门禁，直到修复 |
| 3 | research 模式 `interpretation_constraints[4]` 被覆盖 | 中 | 原「研究模式要求说明每条规则的适用条件与彼此冲突时的取舍理由」被 zhouyi_text 说明顶掉，疑似数组索引写死 |
| 4 | `appVersion` 硬编码 `v123` | 低 | 线上仍是 v121，快照 meta 标 v123 |
| 5 | 快照无版本戳 | 低 | 文件内未记录生成时的 commit / vendor hash，无法自证与哪个代码版本对应 |
| 6 | 地火明夷/地水师不在样例集内 | 低 | 本轮用临时脚本核验，样例本身只覆盖雷火丰一盘；魂卦三态没有常驻样例 |
