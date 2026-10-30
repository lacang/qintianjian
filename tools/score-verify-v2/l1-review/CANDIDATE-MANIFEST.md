# v122 候选提交范围清单（CANDIDATE-MANIFEST）

> 生成时间：2026-10-28
> 对应批复：董事长 2026-10-28 10:05「批准方案 A，本批按现状推进，但暂不批准直接发版」
> 用途：回答待办 P0「核对最终候选提交范围 —— 明确区分 L0、L1、V2、测试与门禁改动，列出文件及差异」
> 状态：**只读盘点，未 commit / 未 push / 未 deploy**

---

## 0. 一句话结论

候选版本 = **9 个已跟踪文件改动 + 127 个新增文件（4.45 MB）**。
（计数口径：`git status --porcelain --untracked-files=all`，即逐个文件展开、不折叠目录。2026-10-28 终校时修正两次：初版写「110 个 / 3.5 MB」用的是折叠目录统计，会漏算目录内文件；删除 1 个 0 字节 stderr 残留 `l1-fix/evidence/diff-err.log`（−1）；固化 P0-3 门禁与故障注入证据 `P0-3-FINAL-GATE.md` + 4 份原始日志（+5）。）
其中真正改变运行行为的是 **5 个文件**（L0 三项、L1 一项、判断层名单一项），其余为构建产物、测试入口、门禁、快照与审计证据。
**盘点过程中发现 3 个发布链路缺陷，已修复 2 个（.gitignore 静默吞文件），1 个需董事长裁决（aipack 属 v123 内容混入本批）。**

---

## 1. 三基线（复核全篇的坐标系）

| 基线 | verdict 层 | vendor 层 | 对应提交 |
| --- | --- | --- | --- |
| **线上 v121** | legacy（V2 之前） | V0（`0ed9e89` 产物） | `5552f09`（已双 push） |
| **本地 main** | V2（评分去重） | V0 | merge `51bd404` + `7a5bae4`（未 push） |
| **候选 v122** | V2 + 新名单 | cur（L0 + L1 重建） | 工作区未提交 |

关键事实：`0ed9e89..HEAD` 只改了 `app/js/verdict.js`（V2，26 增 7 删），`liuyao-core/src` 零改动，
因此 **V0 vendor 就是 HEAD vendor**，本地 main 与线上 v121 的差别纯在判断层。

---

## 2. A 类：已跟踪文件的改动（9 个）

| # | 文件 | 类别 | 改了什么 | 为什么 | 独立证据 |
| --- | --- | --- | --- | --- | --- |
| 1 | `liuyao-core/src/constants.ts` | **L0** | 删除 `GUI_HUN_OVERRIDE = new Set(['雷火丰'])` 及其注释 | 该覆盖把雷火丰同时标「坎宫归魂」+「世五应二」，标签与世位自相矛盾；归魂应为八宫第八卦 | 八宫 64 卦 `guaXu` 实测表（见 §6 命令 C3）；`golden.test.ts` 断言 |
| 2 | `liuyao-core/src/guaTable.ts` | **L0** | `isGuiHun: info.guaXu === 8 \|\| GUI_HUN_OVERRIDE.has(...)` → `info.guaXu === 8`；注释修正 | 同上，撤销特例覆盖，回归古法单一判定 | 坎宫八卦序实测：坎1 节2 屯3 既济4 革5 **丰6 明夷7（游魂）师8（归魂）** |
| 3 | `liuyao-core/src/paipan.ts` | **L0** | `yinYang: bits[i % 3]` → `bits[2 - (i % 3)]` | `BAGUA_BITS` 位序是 top-to-bottom，而 `yaoList` 的 i 是 bottom-to-top；原写法使兑/震/巽/艮 四宫八纯首卦藏爻阴阳整体颠倒（乾111/离101/坎010/坤000 为回文，两种读法同值，故只在 4/8 宫暴露） | `l0-fact-audit/data/paipan_yao_384.json` 384 爻全量核对 |
| 4 | `liuyao-core/src/wangshuai.ts` | **L1** | 新增 `lingTaiEff`（月破且旺 → 休）；`anDong` 改用它；`riPo` 改为「日冲且非旺相」（休态归日破）；标签按有效态展示，月破旺加「（失气）」 | ①「月破之爻如物已破」不当言旺，去掉错误 +2 旺相分（−3 破分照计）②休态静爻被日冲原「待定」不落分类，归日破 | `l1-review/evidence/yuepo-audit.md`（34560 例 A–F 八项断言） |
| 5 | `app/js/verdict.js` | **判断层·名单** | 六冲 8 → 10（补天雷无妄、雷天大壮）；六合 8 个改正（出 火地晋/山雷颐/地泽临，入 天地否/山火贲/火山旅） | 旧名单与卦体分类事实不符（火地晋、山雷颐实为乾宫/巽宫**游魂卦**，非六合） | `l1-review/evidence/gua64-audit.md`（手写纳甲表独立推导 384 爻 + 三对全冲/全合定义） |
| 6 | `liuyao-core/test/golden.test.ts` | 测试 | 雷火丰断言 `isGuiHun: true → false`，用例名同步 | 跟随 L0 修正；原断言锁定了错误事实 | `tools/test-core.sh` → 209 例通过 |
| 7 | `app/vendor/liuyao-core.js` | **构建产物** | 由 `node tools/build-vendor.mjs` 从 L0+L1 源码重建（22 行变化） | 禁止手改；`--check` 校验与 src 同步 | gates 第 2 步 `vendor 产物同步` |
| 8 | `tools/gates.sh` | **门禁** | 新增第 3 步「六爻核心正式测试」（`bash tools/test-core.sh`）；新增第 14 步「AI 资料包快照一致性」；后续步骤编号顺移 | ①Vitest 209 例首次进入门禁（此前从未跑过）②资料包快照防漂移 | 14/14 全绿 + 三态故障注入（见 §5） |
| 9 | `.gitignore` | **门禁/发版链路** | ①`!tools/**/evidence/*.log` 放行证据日志 ②忽略 3 份 >20 MB 可重跑中间快照 ③`!tools/score-verify-v2/l0-fact-audit/data/` 放行审计输入数据 | **本次盘点发现的发布链路缺陷**，详见 §4 | `git check-ignore` 逐条验证 |

**改动行数**：`git diff --stat` = 9 files changed, 65 insertions(+), 40 deletions(-)（不含 `.gitignore` 新增 22 行）。

---

## 3. B 类：新增文件（127 个，4.45 MB）

> 统计命令：`git status --porcelain --untracked-files=all -z | tr '\0' '\n' | grep '^??'`
> 体积为 `stat -c%s` 逐文件求和。下表分项相加 = 127 个 / 4556 KB，与总量一致（2026-10-28 终校）。

| 目录 | 文件数 | 体积 | 类别 | 说明 |
| --- | --- | --- | --- | --- |
| `tools/score-verify-v2/l1-review/` | 35 | 1455 K | **本轮复核交付物** | `REVIEW-REPORT.txt`、`CANDIDATE-MANIFEST.md`、`LOVE-DEADCODE-TASK.md`、`P0-3-FINAL-GATE.md`、`ATTRIBUTION-678.md`（678 条归因报告）、`evidence/`（25 份：64卦核对表、月破审计、统计口径、Vitest 说明、门禁三态、门禁阻断、门禁 14 步全绿（两轮）、故障注入阻断、故障恢复放行、脏工作区拒绝、组合矩阵、交叉差异、678 条归因明细、全量 144 组合枚举、月令=日辰专项、分解结果）、`scripts/`（9 个可复算脚本，含 `attribution-678.mjs`、`full-enum-144.mjs`、`repro-case.mjs`）、`legacy/verdict-v2.mjs`（V2 基线） |
| `tools/score-verify-v2/l0-fact-audit/` | 32 | 782 K | L0 独立核验证据 | 01–10 十份核验报告 + `L0_审计合订本.md` + `ERRATA.md` + `README.md`（14）+ 3 个核验脚本 + 13 份输入数据（384 爻表、卦例 CSV）（15） |
| `tools/score-verify-v2/l0-fix-audit/` | 5 | 54 K | L0 修复审计 | 变更清单、回归结果、剩余风险、收尾 |
| `tools/score-verify-v2/l1-fix/` | 8 | 64 K | L1 实施证据 | 快照脚本 + `diff-PRE-POST.json` + diff/回归/事实校验日志 + 实施报告；两份 41 MB 全量快照已排除（见 §4） |
| `tools/score-verify-v2/l1-prep/` | 10 | 169 K | L1 方案设计 | 快照更新、规则清单、测试设计、优先级、开问题、合订本 |
| `tools/score-verify-v2/key-fact-audit/` | 2 | 33 K | 关键事实核验 | `verify-facts.mjs` + 结果 JSON |
| `tools/score-verify-v2/output/` | 1 | 87 K | V2 分析输出 | `analyzed-vall-510.csv` |
| `tools/score-verify/`（含 `scripts/` `output/` `baseline/`） | 10 | 1.0 M | V2 审计证据（历史） | `REPORT.md`、`SEMANTICS.md`、`baseline/verdict.orig.js`、3 个脚本、4 份输出（含 `fixed-month-xu-diff.json` 813 K、`xu-month-diff.csv` 76 K） |
| `aipack-samples/` | 20 | 786 K | **v123 内容**（见 §6 边界项） | 6 份资料包 × (txt/json/html) + `index.html`（304 K）+ `README.md` |
| `app/js/` | 1 | 66 K | **v123 内容**（见 §6 边界项） | `aipack.js`，纯函数资料包组装，**未被 index.html / sw.js 引用** |
| `tools/`（根，3 个） | 3 | 25 K | 测试入口 + 门禁 + 生成器 | `test-core.sh`（Vitest 稳定入口）、`aipack-snapshot-check.mjs`（门禁第 14 步）、`ai-pack-sample.mjs`（资料包样例生成器，确定性） |

---

## 4. C 类：明确排除（不进版本库）

| 文件 | 体积 | 排除理由 | 重跑命令 |
| --- | --- | --- | --- |
| `tools/score-verify-v2/l1-fix/evidence/snap-PRE.json` | 41 M | 393216 判读全量导出，结论已固化在 `diff-PRE-POST.json` | `node tools/score-verify-v2/l1-fix/scripts/score-snapshot.mjs --out=... --tag=PRE` |
| `tools/score-verify-v2/l1-fix/evidence/snap-POST.json` | 41 M | 同上 | `... --tag=POST` |
| `tools/score-verify/output/full-matrix.csv` | 22 M | V2 全量矩阵，结论已在 `REPORT.md` / `analyzed-vall-510.csv` | `node tools/score-verify/scripts/run-matrix.mjs` |
| `tools/score-verify-v2/output/{v2,v2b}-full-matrix.csv`、`fixed-month-*-diff.csv` | 小 | **既有** `tools/score-verify-v2/.gitignore` 主动忽略（本批未改动该规则） | 同目录脚本 |

合计排除约 **104 MB**。若全部纳入，仓库体积将翻数倍，且这些文件 100% 可由脚本确定性重建。

---

## 5. 发布链路完整性检查（P0-4）

### 5.1 发现的缺陷（2 个已修，1 个待裁决）

**缺陷 ①（已修，高危）：证据日志被 `.gitignore` 静默吞掉**

- 根 `.gitignore` 第 17 行 `*.log` 会匹配 `tools/**/evidence/*.log`。
- 被吞掉的正是本批复核的门禁证据：`gate-tristate.log`（五态验证）、`gate-blocks-release.log`（端到端阻断）、`vitest-run.log`（209 例运行记录）。
- **危害**：`git status` 连 `??` 都不显示，`git add -A` 静默跳过 → 发版后「报告里说验证过，但证据文件不在仓库」，无法复算。这正是董事长担心的「遗漏未跟踪文件」。
- **修复**：新增 `!tools/**/evidence/*.log` 反向放行，逐条 `git check-ignore` 验证已放行。

**缺陷 ②（已修）：审计输入数据被 `data/` 规则误吞**

- 根 `.gitignore` 第 20 行 `data/` 本意只忽略古籍原文语料库（不带前导斜杠，会匹配任意层级）。
- 结果 `tools/score-verify-v2/l0-fact-audit/data/` 下 13 份核验输入（384 爻表、卦例 CSV）被忽略 → 「脚本在、输入数据不在」，别人无法复算 L0。
- **修复**：新增 `!tools/score-verify-v2/l0-fact-audit/data/` 与 `/**`，验证已放行；同时验证根 `data/`（古籍语料）仍被忽略，未误伤。

**缺陷 ③（待董事长裁决，见 §6）：`app/js/aipack.js` 属 v123 内容**

### 5.2 发版脚本与冻结快照

| 检查项 | 结论 |
| --- | --- |
| `tools/release.sh` 顺序 | 起点门禁 → bump 版本 → 终点门禁 → 写发布记录；任一步失败立即中止，不跳过 |
| `tools/deploy.sh` 脏工作区 | **要求 `git status --porcelain` 为 0**，未跟踪文件同样计入 → 127 个新增文件必须全部纳入或显式忽略，否则无法部署。本清单已做到「要么纳入、要么有理由排除」 |
| `tools/deploy.sh` 门禁 | 部署前强制重跑 `gates.sh --expect-version`，失败即中止 |
| `tools/deploy.sh` 线上核验 | 两站 `sw.js` **字节 sha256** 比对 + `index.html ?v=` 版本比对，不是只比版本号 |
| 快照门禁 | gates 第 14 步 `aipack-snapshot-check.mjs`：19 文件逐字节一致 + K1–K5 独立断言 |
| `sw.js` 版本 | `qintian-v121`，与 `index.html ?v=121` 一致（发版时由 `bump-version.sh` 同步 bump） |
| `sw.js` ASSETS | **不含 aipack.js** —— 与「未被引用」一致，本批不改变离线清单 |
| 测试文件是否随发布纳入 | `tools/test-core.sh`（新增）在 `tools/` 下，不随 `app/` 部署，但必须进仓库；已纳入 |

### 5.3 部署产物与仓库的关系（澄清一个易误解点）

`deploy.sh` 用 `--source-root .` 且 `cd app`，因此**只有 `app/` 下内容会上线**。
`tools/`、`aipack-samples/`、`liuyao-core/` 全部只进仓库、不上线。
线上会新增的唯一文件是 `app/js/aipack.js`（未被引用，无入口可触达）。

---

## 6. 需董事长知悉 / 裁决的边界项

### 6.1 aipack 相关文件 —— **已裁决：A1 保留**（2026-10-28 董事长批复）

**`app/js/aipack.js` + `aipack-samples/` + `tools/ai-pack-sample.mjs` + `tools/aipack-snapshot-check.mjs` + gates 第 14 步，属于 v123「AI 协作资料包」的内容，不是 v122 的规则修复。**

事实：

- `app/js/aipack.js` 是 `app/js/` 下**唯一**未被 `index.html` / `sw.js` 引用的模块（已逐文件排查）。
- 因此对现有页面**零行为影响**，用户无任何入口可触达；但它会作为静态文件存在于线上 URL。
- gates 第 14 步「AI 资料包快照一致性」依赖它 + `aipack-samples/` 才能运行。

| 选项 | 做法 | 代价 |
| --- | --- | --- |
| **A1（董事长已批准）保留** | 按现状纳入，明确标注为「未启用模块，不构成 v122 功能」 | 线上多一个未被引用的静态文件；不改变任何用户可见行为 |
| A2 严格剔除 | 移出 `app/js/aipack.js`、`aipack-samples/`、两个 tools 脚本，删除 gates 第 14 步 | 本批改动面更纯；但会丢掉资料包快照门禁，v123 需重新挂载 |

**董事长裁决原文要点**：保留。理由——aipack.js 零引用不代表对工程无价值；它已被第 14 步依赖；删除并同步拆除门禁会降低本批验证能力；纳入版本库可保证快照校验与复算工具能随版本复现。**边界**：「本批纳入 aipack 相关工具和快照，不等于批准新增 AI 解读功能进入线上。」三类文件边界见 §10。

---

## 7. 可复算命令（任何人拿到仓库都能重跑）

```bash
cd 每日六爻

# C1 三基线判读差异（18758 / 5088 口径）
node tools/score-verify-v2/l1-review/scripts/combine-matrix.mjs \
  --out=tools/score-verify-v2/l1-review/evidence/combine-matrix.json

# C2 六冲六合独立推导（手写纳甲表 + 三对全冲/全合定义，不引用 constants.ts）
node tools/score-verify-v2/l1-review/scripts/gua64-audit.mjs \
  --out=tools/score-verify-v2/l1-review/evidence/gua64-audit.json

# C3 八宫 64 卦 guaXu / 游魂 / 归魂实测表（本清单 §2 第 1–2 行依据）
node -e "import('./app/vendor/liuyao-core.js').then(m=>{
  const B=['乾','兑','离','震','巽','坎','艮','坤'];const g={};
  for(const u of B)for(const l of B){const x=m.getGuaMeta(u,l);(g[x.gong]??=[]).push(x)}
  for(const k of Object.keys(g)){g[k].sort((a,b)=>a.guaXu-b.guaXu);
    console.log(k+'宫: '+g[k].map(x=>x.guaXu+':'+x.name+(x.isYouHun?'(游)':'')+(x.isGuiHun?'(归)':'')).join(' '))}
})"

# C4 月破失气 34560 例逐项断言（A–F 八项）
node tools/score-verify-v2/l1-review/scripts/yuepo-audit.mjs \
  --out=tools/score-verify-v2/l1-review/evidence/yuepo-audit.json

# C5 正式测试 209 例
bash tools/test-core.sh

# C6 全量门禁 14 步
bash tools/gates.sh
```

---

## 8. 本清单未做的事（边界声明）

- 未 `git add`、未 `commit`、未 `push`、未 `deploy`。
- 未删除任何文件（3 份大快照仅加入忽略规则，文件仍在磁盘）。
- 未修改 `verdict.js` 的 love 域两条闸门（按裁决单独立项，见 `LOVE-DEADCODE-TASK.md`）。
- 未修改 `.github/workflows/`（CI 无测试 job 一事仍在未解决风险清单 R6 中，等董事长决定是否本批处理）。

---

## 9. 证据固化校验（P0-1）

> 回答待办 P0「固化本轮复核报告及证据文件 —— 报告、64卦核对表、统计口径、Vitest 说明均纳入版本管理」。
> 关键前提：本批**不能 commit**，所以本节验证的是「一旦执行 `git add -A`，这些文件会不会真的被纳入」，而不是「已经纳入」。两者的差别正是 §5.1 缺陷① 的成因——被 `.gitignore` 吞掉的文件，`git status` 连 `??` 都不显示，`git add -A` 会静默跳过。

### 9.1 董事长点名的四类文件

| 要求 | 实际文件 | 大小 | 内容要点 | 纳入状态 |
| --- | --- | --- | --- | --- |
| 报告 | `l1-review/REVIEW-REPORT.txt` | 31 K | 六项复核全记录（P0-1 六冲六合、P0-2 月破失气、P0-3 统计口径、P0-4 门禁三态、P1-1 Vitest、P1-2 组合矩阵），含结论、证据、遗留问题 | ✅ tracked |
| 64 卦核对表 | `l1-review/evidence/gua64-audit.md` | 12 K | 8 宫 64 卦逐卦核对表：卦名 / 宫 / 序 / 世应 / 游魂归魂 / 六冲六合 / 判定依据 | ✅ tracked |
| 64 卦核对表（机读） | `l1-review/evidence/gua64-audit.json` | 100 K | 同上的结构化版本，供脚本复算比对 | ✅ tracked |
| 统计口径 | `l1-review/evidence/STATS-CALIBER.md` | 8.7 K | 18,758 / 5,088 / 14 条净分抵消 / 5,240 条重叠的互斥分类定义与复算方法 | ✅ tracked |
| Vitest 说明 | `l1-review/evidence/P1-1-VITEST.md` | 4.8 K | 测试入口选型（为何绕开 `.bin` shim）、16 文件 209 例清单、断言与传统规则的边界声明 | ✅ tracked |
| Vitest 原始输出 | `l1-review/evidence/vitest-run.log` | 578 B | 一次完整运行的 `Test Files 16 passed / Tests 209 passed` | ✅ tracked（**曾被 `*.log` 吞掉，已修**） |

### 9.2 门禁证据（本批最易遗漏的一类）

| 文件 | 内容 | 纳入状态 |
| --- | --- | --- |
| `l1-review/evidence/gate-tristate.log` | 门禁三态验证（pass / fail / blocked） | ✅ tracked（**曾被 `*.log` 吞掉，已修**） |
| `l1-review/evidence/gate-blocks-release.log` | 门禁失败 → `deploy.sh` 中止的原始输出 | ✅ tracked（**曾被 `*.log` 吞掉，已修**） |
| `l1-review/evidence/combine-matrix.json` | 8 组合 × 393216 判读的交叉矩阵结果 | ✅ tracked |
| `l1-review/evidence/diff-cross.json` | 候选 vs 各基线的交叉差异明细 | ✅ tracked |

### 9.3 全量纳入状态（逐文件核验，非抽样）

用 `git check-ignore -q` 逐文件判定，结果：

- `l1-review/`：24 / 24 全部 tracked
- `l1-fix/`：8 / 8 全部 tracked（2 份 41 MB 快照按 §4 显式忽略，有重跑命令）
- `l0-fact-audit/`：32 / 32 全部 tracked（含 13 份 `data/` 输入，**曾被裸 `data/` 规则吞掉，已修**）
- `l0-fix-audit/`、`l1-prep/`、`key-fact-audit/`、`score-verify/`、`score-verify-v2/output/`：全部 tracked
- 唯一 `IGNORED` 的两项即 §4 的 `snap-PRE.json` / `snap-POST.json`，均附确定性重跑命令

### 9.4 终校时发现并处理的问题

| # | 问题 | 处理 |
| --- | --- | --- |
| 1 | `l1-fix/evidence/diff-err.log` 为 **0 字节**（`2>` 重定向产物，命令成功时 stderr 为空，无任何脚本引用） | 已删除。保留会让审计者误以为「有错误日志但内容丢了」 |
| 2 | §0 / §3 / §5.2 原写「110 个新增文件 / 3.5 MB」，用的是 `git status --porcelain` 折叠目录口径，会漏算目录内文件 | 已改为 `--untracked-files=all` 口径，并让 §3 表分项相加与总量对上。**最终：127 个 / 4556 KB / 4.45 MB**（2026-10-28 第二轮补入 678 条归因证据 11 个 / 1082 KB） |
| 3 | 总大小易被误算 | 澄清：9 个已跟踪改动 2.47 MB 中 2.38 MB 是 `app/vendor/liuyao-core.js`（本来就在库里，不是新增）；真正新增 **3.39 MB**，其中 `aipack-samples/` 20 个占 786 K、`tools/score-verify/output/` 4 个占 946 K |

### 9.5 任何人如何复验本节

```bash
cd 每日六爻

# ① 逐文件确认「不会被忽略」
git status --porcelain --untracked-files=all -z | tr '\0' '\n' | grep '^??' | sed 's/^?? //' \
  | while read -r f; do git check-ignore -q "$f" && echo "IGNORED $f"; done
# 期望：无输出

# ② 确认总账对得上
git status --porcelain --untracked-files=all -z | tr '\0' '\n' | grep -c '^??'   # 期望 127
git status --porcelain --untracked-files=all -z | tr '\0' '\n' | grep -c '^ M'   # 期望 9

# ③ 确认三份门禁日志真的会进库（缺陷① 的回归检查）
#    注意：不要用 `git check-ignore -v` 的退出码判定——命中 `!` 白名单规则时它同样返回 0 并打印该规则，
#    看起来像「被忽略」，实际含义正相反。最权威的判定是看它们是否出现在 git status 里。
git status --porcelain --untracked-files=all | grep -E 'vitest-run\.log|gate-tristate\.log|gate-blocks-release\.log'
# 期望：3 行，均以 `?? ` 开头

# ④ 确认 L0 输入数据真的会进库（缺陷② 的回归检查）
git status --porcelain --untracked-files=all | grep 'l0-fact-audit/data/'
# 期望：13 行，均以 `?? ` 开头

# ⑤ 确认大快照仍被排除（防止误纳 104 MB）
git check-ignore -v tools/score-verify-v2/l1-fix/evidence/snap-PRE.json
# 期望：命中 .gitignore 中 `tools/score-verify-v2/l1-fix/evidence/snap-*.json` 规则（此处 exit 0 = 确被忽略）
```

---

## 10. 三类文件边界（董事长 A1 裁决的执行结果）

董事长要求：「请在最终文件清单中明确区分：运行时实际加载的文件；仅供资料包生成、快照校验和测试使用的文件；本次真正改变排盘或评分行为的文件。不要为了保住门禁而顺带扩大线上功能范围。」

以下三类**互斥且穷尽**，全部经脚本实测，非人工归类。

### 10.1 第一类：运行时实际加载的文件（本批 2 个，全部为「改动」，无「新增」）

运行时可达集合的判定方法：从 `index.html` 的 `<script type="module" src>` 出发，递归解析所有 `from` / `import` 相对说明符，得到完整 import 图。

- `index.html` 的模块入口只有 1 个：`./js/main.js?v=121`（另有 8 个 CSS `<link>`）
- 递归结果：**67 个文件**可达（含 vendor）

本批改动/新增文件中，落在该集合内的：

| 文件 | 状态 | 在 import 图 | 在 sw.js ASSETS |
| --- | --- | --- | --- |
| `app/js/verdict.js` | 改动 | ✅ | ✅ |
| `app/vendor/liuyao-core.js` | 改动 | ✅ | ✅ |

其余 7 个改动文件（`.gitignore`、`liuyao-core/src/*.ts` 4 个、`liuyao-core/test/golden.test.ts`、`tools/gates.sh`）与全部新增文件，**均不在运行时 import 图内**。

**新增文件中，`app/` 目录下只有 1 个：`app/js/aipack.js`，且它不在 import 图、不在 sw.js ASSETS。** —— 这就是 A1 裁决「不扩大线上功能范围」的实测依据。

### 10.2 第二类：仅供资料包生成、快照校验和测试使用

| 分组 | 文件数 | 说明 |
| --- | --- | --- |
| `app/js/aipack.js` | 1 | 资料包纯函数模块。**运行时不可达**：不在 `index.html`→`main.js` 的 import 图，也不在 `sw.js` 的 240 项 ASSETS 中（`aipack` 在 ASSETS 中出现 **0** 次）。它只是作为静态文件随部署上传，无任何入口可触达 |
| `aipack-samples/` | 20 | 资料包样本（liuyao/tarot × classic/quick/research × txt/json/html + index.html + README）。不被任何运行时文件引用 |
| `tools/ai-pack-sample.mjs`、`tools/aipack-snapshot-check.mjs` | 2 | 资料包生成与快照校验脚本 |
| gates 第 14 步 | — | 「AI 资料包快照一致性」，依赖上述两项 |
| `liuyao-core/test/golden.test.ts` | 1（改动） | Vitest 用例（209 例之一），非运行时 |
| `tools/test-core.sh` | 1 | 测试入口 |
| `tools/score-verify/` | 10 | V2 审计脚本与产出 |
| `tools/score-verify-v2/` | 87 | L0/L1 审计、归因、复算脚本与证据（含本报告数据） |
| `.gitignore`、`tools/gates.sh` | 2（改动） | 版本控制规则与门禁编排 |

**边界确认**：这一整类**不参与任何用户可见行为**。aipack 相关的唯一线上影响是「多一个未被引用的静态文件」，这与 A1 裁决的预期完全一致。

### 10.3 第三类：本次真正改变排盘或评分行为的文件

这一类必须再分两小类，因为**改动同一产物、但作用层不同**：

#### 3a 改变吉凶判读（评分层）

| 源文件 | 产物 | 改动内容 |
| --- | --- | --- |
| `liuyao-core/src/wangshuai.ts` | `app/vendor/liuyao-core.js` | ① 月破失气：`lingTaiEff = yuePo && lingTai==='旺' ? '休' : lingTai`；② `anDong`/`riPo` 改用 `lingTaiEff`（休态静爻被日冲归日破） |
| `app/js/verdict.js` | 同文件（直接运行） | 六冲名单补「天雷无妄、雷天大壮」；六合名单改正 3 出 3 入 |

**这两项就是 678 条跨分界变化的全部来源**（归因见 `ATTRIBUTION-678.md`：623 + 46 + 9 = 678，异常 0）。

#### 3b 改变排盘展示、不参与判读（展示层）

| 源文件 | 产物 | 改动内容 | 为什么不影响判读 |
| --- | --- | --- | --- |
| `liuyao-core/src/paipan.ts` | 同上 vendor | L0-002：八纯首卦藏爻阴阳位序修正（`bits[i%3]` → `bits[2-(i%3)]`）。原写法把 top-to-bottom 的数组位序当 bottom-to-top 消费，导致兑/震/巽/艮 四宫八纯首卦藏爻阴阳整体颠倒 | `getShouGuaPan` 的唯一消费点是 `format.ts` 的文本格式化与 `app/js/panview.js:59` 的「首卦」展示表；**不进入 `judgeNajia`** |
| `liuyao-core/src/constants.ts` | 同上 vendor | 撤销 `GUI_HUN_OVERRIDE = new Set(['雷火丰'])` | 该覆盖曾把雷火丰同时标成「坎宫归魂」+「世五应二」，标签与世位自相矛盾；归魂标记不参与判读 |
| `liuyao-core/src/guaTable.ts` | 同上 vendor | `isGuiHun` 改为只由 `guaXu === 8` 判定（去掉 override 分支） | 同上 |

**判定依据（可复验）**：`verdict.js` 实际消费的 `state` 字段全集为

```
anDong changSheng diWang fanYin fengJue fuYin huaJin huaTouKe huaTouSheng
huaTui lingTai riHe riPo ruMu wuXing xunKong yueHe yuePo
```

其中**不含** `isGuiHun` / `isYouHun` / `isBaChun` / `specialType` / `shouGuaName`；在 `verdict.js` 中 grep 这些字段名零命中（仅第 38 行注释提到 `specialType` 的来源说明）。故 3b 三个源文件的改动对吉凶档位**无任何影响**。

复验命令：

```bash
cd 每日六爻
# ① 运行时可达集合（67 个文件）
python3 - <<'PY'
import re,os
html=open('app/index.html',encoding='utf-8').read()
q=[os.path.normpath(e.split('?')[0].lstrip('./')) for e in re.findall(r'<script[^>]+src="([^"]+)"',html)]
seen=set()
while q:
    f=q.pop()
    if f in seen or not os.path.exists('app/'+f): continue
    seen.add(f)
    for spec in re.findall(r'''(?:from|import)\s*['"]([^'"]+)['"]''',open('app/'+f,encoding='utf-8',errors='ignore').read()):
        if spec.startswith('.'): q.append(os.path.normpath(os.path.join(os.path.dirname(f),spec.split('?')[0])))
print(len(seen)); print('aipack in graph:', any('aipack' in f for f in seen))
PY
# 期望：67 / False

# ② aipack 是否在 SW ASSETS
grep -c "aipack" app/sw.js          # 期望 0

# ③ verdict.js 消费的 state 字段
grep -o "state\.[a-zA-Z]*" app/js/verdict.js | sort -u | tr '\n' ' '

# ④ verdict.js 是否引用魂卦/首卦字段
grep -n "isGuiHun\|isYouHun\|isBaChun\|shouGua" app/js/verdict.js
# 期望：仅第 38 行注释，无实际取值
```

---

## 11. 发布版本号升级影响面（P0 实测，非推断）

**做法**：把 `app/` 完整复制到 `/tmp/bumptest/app`，在副本上真实执行 `python3 tools/_bump_impl.py /tmp/bumptest/app 121 122`，然后 `diff -rq` 原目录与副本。**不动工作区**。

### 11.1 结果

| 项 | 结果 |
| --- | --- |
| bump 输出 | `改写 47 个文件 v121 -> v122`；`[gate3] 模块图离线校验通过（SW ASSETS 244 条，0 断链）`；`[all gates] 三闸门 + 卫生 + 语法全部通过` |
| 被改文件数 | **47** |
| 改动分布 | `app/index.html` 1 + `app/js/**` 45 + `app/sw.js` 1 —— **全部落在预期三处，无一处越界** |
| 文件增删 | **0**（`find | sort` 逐文件比对一致） |

### 11.2 逐项排除（字节级确认）

| 对象 | 是否被 bump 触碰 | 结论 |
| --- | --- | --- |
| `app/js/aipack.js` | **字节一致** | ✅ 第 14 步资料包快照门禁**不受版本升级影响** |
| `app/vendor/liuyao-core.js` | **字节一致** | ✅ vendor 内无 `?v=` 引用，判读逻辑不会因 bump 改变 |
| `app/css/**` | **字节一致** | ✅ CSS 文件内部无版本号，仅被 `index.html` / `sw.js` 以 `?v=` 引用 |
| `aipack-samples/` | 不在 `app/` 内 | ✅ 不参与 bump |
| `app/vendor/three/three.module.js` | 字节一致 | ✅ 无版本号引用 |

### 11.3 `verdict.js` 在 bump 中的实际改动（全文，仅 2 行）

```diff
- import { $, current } from './state.js?v=121';
- import { analyzeNajia, getReadingDomain } from '../vendor/liuyao-core.js?v=121';
+ import { $, current } from './state.js?v=122';
+ import { analyzeNajia, getReadingDomain } from '../vendor/liuyao-core.js?v=122';
```

→ 六冲/六合名单、月破失气消费逻辑、全部计分规则**零变化**。版本升级不会二次改变任何吉凶档位。

### 11.4 当前版本号落点（发版前状态）

| 位置 | 当前值 |
| --- | --- |
| `app/sw.js` `CACHE` | `qintian-v121` |
| `app/index.html` 模块入口 | `./js/main.js?v=121` |
| `app/index.html` CSS 引用 | 8 处 `?v=121` |
| `liuyao-core/package.json` | `0.1.0`（独立包版本，与站点版本无关，bump 不改） |
| 仓库根 `package.json` | 不存在 |

`bash tools/release.sh 121 122` 的四阶段：①起点门禁（`--expect-version 121`）→ ②`bump-version.sh 121 122` → ③终点门禁（`--expect-version 122`）→ ④`release-record.mjs` 写 `releases/v122.json`。

### 11.5 复验命令

```bash
cd 每日六爻
rm -rf /tmp/bumptest && mkdir -p /tmp/bumptest && cp -a app /tmp/bumptest/app
python3 tools/_bump_impl.py /tmp/bumptest/app 121 122
diff -rq app /tmp/bumptest/app | wc -l                      # 期望 47
diff -rq app /tmp/bumptest/app | grep -c '^Files'           # 期望 47（全部为修改，无 Only in）
cmp -s app/js/aipack.js /tmp/bumptest/app/js/aipack.js && echo "aipack 未变 ✅"
cmp -s app/vendor/liuyao-core.js /tmp/bumptest/app/vendor/liuyao-core.js && echo "vendor 未变 ✅"
rm -rf /tmp/bumptest
```


