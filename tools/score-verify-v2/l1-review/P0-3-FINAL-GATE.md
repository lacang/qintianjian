# P0-3 最终门禁与故障注入验证报告

> 生成时间：2026-10-28
> 对应批复：董事长 2026-10-28 10:05「批准方案 A，本批按现状推进，但暂不批准直接发版」
> 完成标准：**14/14 全绿，209 个测试通过，故障注入能阻断发版链路**
> 状态：**只读验证，未 commit / 未 push / 未 deploy**

---

## 0. 结论（先给结果）

| 验收项 | 要求 | 实测 | 判定 |
| --- | --- | --- | --- |
| 门禁步骤 | 14/14 全绿 | **14/14 全绿**，`GATES_EXIT=0`，总耗时 35s | ✅ |
| 单元测试 | 209 个通过 | **16 文件 / 209 用例全通过**，5.91s | ✅ |
| 故障注入阻断 | 能阻断发版链路 | **注入后 `deploy.sh` 中止、marker 未写出、exit=1**；恢复后放行、marker 写出、exit=0 | ✅ |
| 脏工作区保护 | —（附加验证） | 22 项未提交改动 → 拒绝部署，exit=1，marker 未写出 | ✅ |
| 门禁自测 `test-gates.mjs` | —（附加验证） | **被其自身保护拒绝运行**（详见 §5），本批无法执行 | ⚠️ 见 §5 |

一句话：**本批候选状态下的门禁体系是绿的，且不是「假绿」——注入故障后整条发版链路会被真实拦住。**

---

## 1. 门禁 14 步逐项结果

命令：`bash tools/gates.sh`（模式 full）

| # | 步骤 | 耗时 | 结果 |
| --- | --- | --- | --- |
| 1 | 静态 ESM 模块图 | 2s | ✅ |
| 2 | vendor 产物同步 | 12s | ✅ |
| 3 | 六爻核心正式测试（Vitest） | 7s | ✅ |
| 4 | 真实浏览器启动 | 7s | ✅ |
| 5 | SW 离线可用 | 4s | ✅ |
| 6 | 桩测 bundle 重建 | 1s | ✅ |
| 7 | 塔罗冒烟 | 0s | ✅ |
| 8 | v111 桩测 | 0s | ✅ |
| 9 | 复现码 e2e（含 v1 兼容） | 0s | ✅ |
| 10 | 塔罗数据 | 0s | ✅ |
| 11 | 塔罗视图 | 1s | ✅ |
| 12 | 塔罗 v119 回归 | 0s | ✅ |
| 13 | 塔罗 v120 回归 | 0s | ✅ |
| 14 | AI 资料包快照一致性 | 1s | ✅ |

汇总：`[gates] 全部通过 ✅` / `GATES_EXIT=0` / 共 35s。
原始日志：`evidence/gate-final-14x.log`

### 1.1 第 3 步（Vitest）实测输出

```
Test Files  16 passed (16)
     Tests  209 passed (209)
  Duration  5.91s (transform 496ms, setup 0ms, collect 2.14s, tests 481ms, environment 2ms, prepare 770ms)
```

### 1.2 第 2 步（vendor 同步）说明

本轮修正 `liuyao-core/src/guaTable.ts` 注释（坎宫归魂 = 地水师，非地火明夷）后，第 2 步按设计报 `不一致 ❌（需重建）`，执行 `node tools/build-vendor.mjs` 重建，`git diff` 确认 **仅 7 行注释变化、零代码变化**，随后门禁通过。
这条正好反向证明了门禁第 2 步是有效的：改 `src` 不重建 vendor 会被拦住。

### 1.3 第 14 步（快照一致性）说明

`aipack-snapshot-check` 四层校验全部通过：
- 19 个文件逐字节一致
- 魂卦关键事实独立断言 K1–K3（按卦名断言，非全文计数）
- `chart_data` 三模式深相等 K4
- `txt / json / html / index` 四格式交叉一致 K5

---

## 2. 故障注入实验设计

目标不是「跑一遍门禁看绿不绿」，而是**证明门禁失败时发版链路真的会被切断**。
因此四组实验都走真实的 `tools/deploy.sh`（而不是模拟脚本），用 `QT_DRY_RUN=1` + `QT_DRY_RUN_MARKER` 作为「是否走到部署环节」的探针：

- **marker 不存在** = 流程根本没走到部署 → 阻断成功
- **marker 存在** = 走到了部署环节（dry-run 不真部署）→ 放行

### 2.1 实验矩阵

| # | 场景 | 注入方式 | 预期 | 实测 |
| --- | --- | --- | --- | --- |
| A | 门禁通过（基线） | 无 | exit 0 + marker 写出 | ✅ `RESTORE_EXIT=0`，marker 存在 |
| B | 第 14 步失败 | 在 `aipack-samples/liuyao-quick.txt` 尾部追加 1 字节 `X` | 门禁失败 → deploy 中止 → marker 不存在 → exit 1 | ✅ `INJECT_EXIT=1`，marker 不存在 |
| C | 脏工作区 | 不设 `QT_ALLOW_DIRTY`（当前工作区本身有 22 项未提交） | 拒绝部署 → marker 不存在 → exit 1 | ✅ `DIRTY_EXIT=1`，marker 不存在 |
| D | 恢复后复验 | 还原快照文件 | 文件 sha256 复原 → 门禁全绿 → marker 写出 | ✅ sha256 一致，marker 存在 |

### 2.2 实验 B 的关键输出（故障注入 → 阻断）

```
❌ aipack-snapshot-check: 1 项失败
❌ AI 资料包快照一致性 失败（exit=1，2s）
[gates] 未通过：AI 资料包快照一致性
[gates] 已中止后续步骤（发版/部署不得继续）
[deploy] ❌ 门禁未通过，已中止部署。线上仍是旧版本，不会被本次改动影响。
INJECT_EXIT=1
marker-inj 存在？ 否 ✅ 未走到部署
```

原始日志：`evidence/gate-fault-inject.log`

### 2.3 实验 D 的关键输出（恢复 → 放行）

```
恢复后 sha256=41ca5abac62e8649a650e88905c5284d8b17b1ad1e2b8df0152d55b6b0f60f30  一致？ 是 ✅
[gates] 全部通过 ✅
[deploy] DRY-RUN：门禁全绿，将执行（未真正执行）：
RESTORE_EXIT=0
marker-ok 存在？ 是 ✅ 走到部署环节（dry-run）
```

原始日志：`evidence/gate-fault-restore.log`

> 实验 B 与 D 构成对照组：同一份 `deploy.sh`、同一个 marker 探针，只有「快照文件是否被篡改」一个变量不同，结果一个是阻断、一个是放行。这就排除了「marker 没写是因为别的原因」的可能。

### 2.4 实验 C 的关键输出（脏工作区保护）

```
[deploy] 待部署版本：index.html ?v=121 / sw.js qintian-v121
[deploy] ❌ 工作区有 22 项未提交改动，拒绝部署。
[deploy]    先提交推送，再部署；确实要临时部署可设 QT_ALLOW_DIRTY=1。
DIRTY_EXIT=1
marker-dirty 存在？ 否 ✅
```

原始日志：`evidence/gate-dirty-refuse.log`

> 这层保护与本批直接相关：`deploy.sh` 统计的是 `git status --porcelain` 的全部行，**未跟踪文件也计入**。本批 111 个新增文件若有一个没纳入版本库，真实发版时就会在这里被拦下——这也是 P0-4 要修 `.gitignore` 的原因（见 `CANDIDATE-MANIFEST.md` §5）。

---

## 3. 证据文件索引

| 文件 | 内容 |
| --- | --- |
| `evidence/gate-final-14x.log` | 14/14 全绿完整输出（35s） |
| `evidence/gate-fault-inject.log` | 实验 B：注入故障 → 阻断 |
| `evidence/gate-fault-restore.log` | 实验 D：恢复 → 放行 |
| `evidence/gate-dirty-refuse.log` | 实验 C：脏工作区拒绝部署 |
| `evidence/gate-tristate.log` | 门禁三态（pass / fail / blocked）历史验证 |
| `evidence/gate-blocks-release.log` | 门禁失败 → 发布中止的历史原始输出 |
| `evidence/vitest-run.log` | Vitest 单次运行原始输出 |

---

## 4. 复现命令

```bash
cd 每日六爻

# ① 完整门禁
bash tools/gates.sh
# 期望：[gates] 全部通过 ✅ / GATES_EXIT=0 / 14 步

# ② 单元测试单独跑
bash tools/test-core.sh
# 期望：Test Files 16 passed (16) / Tests 209 passed (209)

# ③ 故障注入 → 阻断（实验 B）
cp aipack-samples/liuyao-quick.txt /tmp/bak.txt
printf 'X' >> aipack-samples/liuyao-quick.txt
rm -f /tmp/marker-inj
QT_ALLOW_DIRTY=1 QT_DRY_RUN=1 QT_DRY_RUN_MARKER=/tmp/marker-inj bash tools/deploy.sh; echo "exit=$?"
test -f /tmp/marker-inj && echo "❌ 不该存在" || echo "✅ 未走到部署"

# ④ 恢复 → 放行（实验 D）
cp /tmp/bak.txt aipack-samples/liuyao-quick.txt
sha256sum aipack-samples/liuyao-quick.txt   # 应为 41ca5aba...0f60f30
rm -f /tmp/marker-ok
QT_ALLOW_DIRTY=1 QT_DRY_RUN=1 QT_DRY_RUN_MARKER=/tmp/marker-ok bash tools/deploy.sh; echo "exit=$?"
test -f /tmp/marker-ok && echo "✅ 走到部署（dry-run）" || echo "❌ 没走到"

# ⑤ 脏工作区保护（实验 C）
QT_DRY_RUN=1 QT_DRY_RUN_MARKER=/tmp/marker-dirty bash tools/deploy.sh; echo "exit=$?"
# 期望：工作区有 N 项未提交改动，拒绝部署 / exit=1
```

---

## 5. 未完成项与如实说明：`test-gates.mjs` 本批无法运行

`node tools/test-gates.mjs` 是「门禁本身有没有坏」的自测（给每道门禁注入对应故障，看是否都被拦住），设计上要求开跑前目标文件**没有未提交改动**，否则拒绝运行（防止覆盖主人的工作）。

当前实测：

```
[test-gates] ❌ 以下文件有未提交改动，为避免覆盖你的工作，拒绝运行：
 M app/vendor/liuyao-core.js
```

**原因**：本批 L0 修正了 `liuyao-core/src/guaTable.ts`，随之重建了 `app/vendor/liuyao-core.js`，该文件处于未提交状态，正好落在它的保护名单里。

**这不是门禁失效，而是它自己的保护生效。** 但它确实意味着：

- 本批**没有**「门禁自身自测」这一层证据；
- 替代证据是 §2 的四组真实 `deploy.sh` 实验——比自测更直接（用的是真发版脚本，不是模拟）；
- **建议在 commit 之后、push 之前补跑一次 `node tools/test-gates.mjs`**，把「门禁自身 11/11 自测」这一层也补齐，再进入最终发版审批。

---

## 6. 边界声明

- 本报告全部为只读验证，**未 `git add` / 未 `commit` / 未 `push` / 未 `deploy`**。
- 实验 B 注入的 1 字节已完全还原，文件 sha256 与注入前逐字节一致（`41ca5aba…0f60f30`）。
- `QT_DRY_RUN=1` 保证实验 A/B/C/D 均未真正部署，线上仍是 **v121**（`sw.js = qintian-v121`）。
- 门禁全绿只说明「程序符合当前测试与断言」，**不构成传统规则正确性的证明**。规则正确性另见 `REVIEW-REPORT.txt` 与 `LOVE-DEADCODE-TASK.md` 的原典依据部分。
