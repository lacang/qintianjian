# 02 · 回归结果

> 环境：云主机 / Node ESM / `liuyao-core/dist/index.js`（2026-10-27 12:12 重建）
> 命令一律在仓库根 `每日六爻/` 下执行

---

## 第一章　三组独立审计脚本

### 1.1 总览

| 脚本 | 用例数 | 差异数 | 上轮结果 | 变化 |
|---|---|---|---|---|
| `01_calendar.mjs` | 598 | **0** | 598 / 0 | 未变（本轮不涉及历法） |
| `02_gua_paipan.mjs` | 3826 | **0** | 3826 / 1 | **1 → 0** |
| `03_ui.mjs` | 119 | **0** | 117 / 5 | **5 → 0**（用例数 117→119，见下） |
| 合计 | **4543** | **0** | 4541 / 6 | **6 → 0** |

> `03_ui.mjs` 用例数从 117 增到 119，是因为 U6 原 1 条恒失败断言被改为 3 条可判定断言（雷火丰/地火明夷/地水师三态）。属**扩大覆盖**，非删减。

### 1.2 `01_calendar.mjs`（598 例，0 差异）

```
T1 日柱:            90/90   差异 0
T2 日柱抽样:        120/120 差异 0
T3a 节气明确态-月柱: 96/96   差异 0
T3a 节气明确态-年柱: 96/96   差异 0
T4 时柱:            120/120 差异 0
T5 子时换日-日柱:     6/6    差异 0
T5 子时换日-时柱:     6/6    差异 0
T6 旬空:             60/60  差异 0
T7 跨日跨年:          4/4    差异 0
总用例 598，差异 0
```

### 1.3 `02_gua_paipan.mjs`（3826 例，0 差异）

```
T1 卦结构:     64/64    差异 0
T2 魂卦标记:   64/64    差异 0      ← 上轮唯一失败项，本轮转绿
T3 纳甲天干:  384/384   差异 0
T3 纳甲地支:  384/384   差异 0
T3 爻五行:    384/384   差异 0
T3 六亲:      384/384   差异 0
T3 世应:      384/384   差异 0
T3 六神:      384/384   差异 0
T4 首卦名:     64/64    差异 0
T5 伏神清单:   64/64    差异 0
T6 变卦名:    384/384   差异 0
T6 动爻位:    384/384   差异 0
T6 变爻纳甲:  384/384   差异 0
T7 多动变卦:   24/24    差异 0
T7 多动爻位:   24/24    差异 0
T7 静卦:        2/2     差异 0
T9 卦身:       64/64    差异 0
总用例 3826，差异 0
```

### 1.4 `03_ui.mjs`（119 例，0 差异）

```
U1 藏爻阴阳:      8/8    差异 0     ← 上轮 4/8 失败，本轮全绿
U2 藏爻干支:     48/48   差异 0
U4 行序:          1/1    差异 0
U4 行序(静态):     1/1    差异 0
U5 变卦非动爻:     1/1    差异 0
U6 魂卦三态:      3/3    差异 0     ← 上轮 0/1 失败，本轮扩为 3 条全绿
U7 旬空展示:       1/1    差异 0
U8 飞伏关系:     56/56   差异 0
总用例 119，差异 0
```

**实际渲染出的头部标签**（照抄 `panview.js:53` 模板）：

```
坎宫：雷火丰          | guaXu=6 世5应2   （无魂标签）
坎宫：地火明夷（游魂） | guaXu=7 世4应1
坎宫：地水师（归魂）   | guaXu=8 世3应6
```

---

## 第二章　项目门禁

```
$ bash tools/gates.sh
════════ 门禁汇总（模式 full，共 28s）════════
[gates] 全部通过 ✅
```

12 步逐项：

| # | 步骤 | 结果 |
|---|---|---|
| 1 | 静态 ESM 模块图 | ✅ |
| 2 | vendor 产物同步 | ✅ |
| 3 | 真实浏览器启动 | ✅ |
| 4 | SW 离线可用 | ✅ |
| 5 | 桩测 bundle 重建 | ✅ |
| 6 | 塔罗冒烟 | ✅ |
| 7 | v111 桩测 | ✅ |
| 8 | 复现码 e2e（含 v1 兼容） | ✅ |
| 9 | 塔罗数据 | ✅ |
| 10 | 塔罗视图 | ✅ |
| 11 | 塔罗 v119 回归 | ✅ |
| 12 | 塔罗 v120 回归 | ✅ |

> 第 2 步 `node tools/build-vendor.mjs --check` 直接证明「vendor 与当前 src 一致」——这是本轮最容易出问题的一步（只改 src 忘打 vendor 会在这里挂掉）。

---

## 第三章　构建产物与一致性

### 3.1 重建过程

```
# 1) dist（审计脚本 import 的目标）
$ cd liuyao-core && node node_modules/tsup/dist/cli-default.js
  ESM dist/index.js  2.41 MB
  CJS dist/index.cjs 2.41 MB
  DTS dist/index.d.ts 48.79 KB
  → 2533847 → 2533962 字节（Oct 27 12:12）

# 2) vendor（浏览器实际运行的入口）
$ node tools/build-vendor.mjs
  [build-vendor] 已写入 app/vendor/liuyao-core.js
  [build-vendor] 裁剪 iztro 非中文 locale 45 块，产物 2492900 字节
  → 2492785 → 2492900 字节（Oct 27 12:12）

# 3) 一致性校验
$ node tools/build-vendor.mjs --check
  [build-vendor] check: 裁剪 45 块 / 2492900 字节；当前 vendor 2492900 字节
  [build-vendor] 一致 ✅
```

> 注：`npm run build` 首次报 `tsup: Permission denied`（云盘挂载丢可执行位，属已知环境问题，`build-vendor.mjs` 内的 `ensureExec()` 就是为此写的）。已 `chmod 755` 修复后正常构建。

### 3.2 产物指纹

| 文件 | 字节 | sha256（前 16 位） |
|---|---|---|
| `liuyao-core/dist/index.js` | 2533962 | `e0da6cfea55850be` |
| `app/vendor/liuyao-core.js` | 2492900 | `ce591a3fb9581492` |

### 3.3 vendor 内容验证（不只看字节数）

```bash
$ grep -n "isGuiHun: info.guaXu" app/vendor/liuyao-core.js
32410:    isGuiHun: info.guaXu === 8,

$ grep -n "2 - i % 3" app/vendor/liuyao-core.js
32831:      yinYang: bits[2 - i % 3] ? "\u9633" : "\u9634",

$ grep -c "GUI_HUN_OVERRIDE" app/vendor/liuyao-core.js
1     ← 仅剩注释中的历史说明，无任何可执行引用
```

**结论：vendor 确实来自当前源码，不是旧产物。**

---

## 第四章　原 6 个失败案例逐条复测

| 编号 | 案例 | 预期 | 修复前实际 | **复测结果** |
|---|---|---|---|---|
| FAIL-L0-01 | `G0078` 雷火丰魂卦标记 | guaXu=6，非归魂 | guaXu=6，isGuiHun=true ❌ | **通过**：guaXu=6，isGuiHun=false |
| FAIL-U1-01 | 兑宫藏爻阴阳 | 110/110 | 011/011 ❌ | **通过**：110/110 |
| FAIL-U1-02 | 震宫藏爻阴阳 | 100/100 | 001/001 ❌ | **通过**：100/100 |
| FAIL-U1-03 | 巽宫藏爻阴阳 | 011/011 | 110/110 ❌ | **通过**：011/011 |
| FAIL-U1-04 | 艮宫藏爻阴阳 | 001/001 | 100/100 ❌ | **通过**：001/001 |
| FAIL-U6-01 | 雷火丰头部标签 | 无归魂、世五应二 | 标归魂、世五应二 ❌ | **通过**：`坎宫：雷火丰`、世5应2 |

**6 / 6 全部转通过，无新增失败。**

---

## 第五章　是否影响其他 63 卦（全量字段 diff）

### 5.1 方法

用 `git show HEAD:app/vendor/liuyao-core.js` 取出**修复前的 vendor**，与新 vendor 在同一进程内分别 import，对 64 卦（`yaoValues` 遍历 2⁶ 全组合）排盘，把 `Pan` 对象**递归展平**后逐字段字符串比对。

```
扫描：64 卦 × 45 字段 = 2880 个字段值
差异总数：1
  字段 benGua.isGuiHun：1 处 → 雷火丰

差异明细：
  雷火丰 benGua.isGuiHun：true → false
```

### 5.2 藏爻（`getShouGuaPan`）单独比对

```
藏爻（getShouGuaPan）八纯首卦差异：4/8 宫
  兑（兑为泽） 旧 阴阳阳阴阳阳 → 新 阳阳阴阳阳阴
  震（震为雷） 旧 阴阴阳阴阴阳 → 新 阳阴阴阳阴阴
  巽（巽为风） 旧 阳阳阴阳阳阴 → 新 阴阳阳阴阳阳
  艮（艮为山） 旧 阳阴阴阳阴阴 → 新 阴阴阳阴阴阳
```

恰好 4 宫，且都是整体镜像翻转，与 §1.1 的数学推导完全吻合。

### 5.3 结论

| 问题 | 答案 |
|---|---|
| 是否影响其他 63 卦？ | **不影响。** 2880 个字段值里，除雷火丰的 `isGuiHun` 外全部逐字相同 |
| 是否影响纳甲/六亲/世应/六神/伏神/变卦/卦身？ | **不影响。** 这些字段全部零差异，且 `02_gua_paipan.mjs` 3826 例全绿 |
| 藏爻改动是否波及非八纯卦？ | **不波及。** `getShouGuaPan` 只用于「藏爻列」（八纯首卦视角），与主卦排盘是两条独立路径 |

---

## 第六章　是否影响评分与机器解卦

### 6.1 静态证据：评分层零引用

```bash
$ grep -n "GuiHun\|YouHun\|BaChun\|guaXu\|归魂\|游魂\|八纯\|getShouGuaPan\|BAGUA_BITS" \
    app/js/verdict.js app/js/verdicts.js
（无任何输出）
```

`verdict.js` / `verdicts.js` 完全不读 `isGuiHun` / `isYouHun` / `isBaChun` / `guaXu`，也不调用 `getShouGuaPan`。

### 6.2 动态证据：评分回归全绿

```
$ node tools/score-regression.mjs --quick
=== 六爻评分 V2 回归（stage B，基线 vall）===
mask322 寅月 career：score=0 level=0（目标 0/平）
扫描：合法盘 16384，判读 131072 条（quick）
逐盘对齐：131072 通过 / 0 不一致
结构断言：①持世抑制 17408｜①非持世保留 35584｜①skip域保留 65536
          ③持世抑制 3680｜③非持世保留 12256
          ②冲共现 2560｜②合共现 2048｜②三例外 768｜②变卦 512
          health双计保留 1760
断言 145796 条，失败 0 条
RESULT: PASS
```

### 6.3 机器解卦（AI 打包）影响

`app/js/aipack.js:159` 有 `flags: [g.isYouHun && '游魂', g.isGuiHun && '归魂', g.isBaChun && '八纯']`。雷火丰的 flags 会从 `['归魂']` 变为 `[]`。

- 这是**修正后的正确值**，不是回归
- `aipack.js` 目前是未跟踪文件（`?? app/js/aipack.js`），未纳入门禁；本轮未改它
- 若未来 AI 侧有依赖「雷火丰=归魂」的提示词，需同步检查（记入 `03_remaining_risks.md`）

---

## 第七章　Git 状态

```
$ git log --oneline -1
7a5bae4 audit(score-v2): 入墓双计专项审计（195/242）—— 只读，未修代码未推送未部署

$ git status --porcelain
 M app/vendor/liuyao-core.js
 M liuyao-core/src/constants.ts
 M liuyao-core/src/guaTable.ts
 M liuyao-core/src/paipan.ts
?? aipack-samples/                              ← 本轮之前既有
?? app/js/aipack.js                             ← 本轮之前既有
?? tools/ai-pack-sample.mjs                     ← 本轮之前既有
?? tools/score-verify-v2/key-fact-audit/        ← 本轮之前既有（L1 成果）
?? tools/score-verify-v2/l0-fact-audit/         ← 本轮之前既有（L0 审计成果）
?? tools/score-verify-v2/output/analyzed-vall-510.csv  ← 本轮之前既有
?? tools/score-verify/                          ← 本轮之前既有

$ git diff --stat
 app/vendor/liuyao-core.js    |  9 +++++----
 liuyao-core/src/constants.ts | 12 +++++-------
 liuyao-core/src/guaTable.ts  |  7 ++++---
 liuyao-core/src/paipan.ts    |  7 ++++++-
 4 files changed, 20 insertions(+), 15 deletions(-)

$ git rev-parse origin/main github/main
origin/main: 0ed9e89
github/main: 0ed9e89
```

| 项 | 状态 |
|---|---|
| 已跟踪文件改动 | **4 个**（3 src + 1 vendor） |
| 新增未跟踪文件 | `tools/score-verify-v2/l0-fix-audit/`（本轮报告） |
| 删除文件 | **0 个** |
| 提交 | **未执行** |
| 推送 | **未执行**（双远端均仍 `0ed9e89`） |
| 部署 | **未执行** |
| GitHub Pages 自动部署 | **未触发**（push main 才会触发，本轮未 push） |
| L1 成果完整性 | `key-fact-audit/`、`output/`、`tomb-audit` 相关文件全部原样 |
