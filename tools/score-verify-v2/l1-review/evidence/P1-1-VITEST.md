# P1-1 · Vitest 环境定位与恢复

## 一、结论先说

**正式测试环境已恢复，209 个测试全部真实运行并通过。** 之前"Vitest 无法运行"不是 vitest 本身坏了，也不是依赖缺失，而是 `node_modules/.bin/*` 里的 bin shim 被云盘同步破坏。绕开 shim 后一切正常。

## 二、故障现象与根因

### 现象

```bash
cd liuyao-core
npx vitest run
# /…/liuyao-core/node_modules/.bin/vitest: 1: ../vitest/vitest.mjs: not found
# exit 127
```

### 根因

```bash
file node_modules/.bin/vitest
# node_modules/.bin/vitest: ASCII text, with no line terminators
ls -la node_modules/.bin/vitest
# -rwxr-xr-x 1 root root 20 Oct 25 22:21 node_modules/.bin/vitest   ← 普通文件，不是符号链接
cat node_modules/.bin/vitest
# ../vitest/vitest.mjs
```

正常 `npm install` 会在 `.bin/` 下建**符号链接**（指向 `../vitest/vitest.mjs`），或 Windows 下建带 shebang 的 sh shim。本工作区在云盘挂载上，同步机制把符号链接压成了"只有一行相对路径的纯文本文件"。

于是 `npx`/`npm test` 把这个文件当 shell 脚本执行，第一行 `../vitest/vitest.mjs` 被当作命令，按**当前工作目录**解析成 `每日六爻/vitest/vitest.mjs`（不存在）→ `not found`，退出码 127。

`.bin/` 下 18 个 shim 全是这个状态（`tsc`、`tsup`、`esbuild` 同样），不只 vitest。依赖包本身完好：`node_modules/vitest/` 有 `vitest.mjs`、`dist/`、`index.cjs`，`du -sh node_modules` = 251M，200 个顶层包齐全。

### 为什么之前误判为"环境不可用"

只在 `npx` / `npm test` 这一条路径上试过，没绕过 shim 直接调真实入口，就把 shim 损坏当成了 vitest 不可用。

## 三、恢复方式（已落地，非临时手段）

新增 `tools/test-core.sh`：

```bash
cd liuyao-core
exec node node_modules/vitest/vitest.mjs run --reporter=basic "$@"
```

直接用 node 调 vitest 的真实入口，不经过 `.bin/` shim。若依赖确实缺失（`vitest.mjs` 不存在），脚本显式 `exit 2` 并提示先 `npm install`，不静默跳过。

已挂进 `tools/gates.sh` 第 3 步（vendor 同步之后、浏览器验证之前）：

```
──────── [3] 六爻核心正式测试 ────────
✓ test/najia-analysis.test.ts (20 tests)
✓ test/golden.test.ts (13 tests)
✓ test/ziwei.test.ts (12) ✓ test/astro.test.ts (12) ✓ test/annotations.test.ts (11)
✓ test/reading.test.ts (6) ✓ test/cards.test.ts (14) ✓ test/timecast.test.ts (7)
✓ test/input.test.ts (11) ✓ test/qimen.test.ts (7) ✓ test/cross64.test.ts (65)
✓ test/bazi.test.ts (9) ✓ test/format.test.ts (5) ✓ test/meihua.test.ts (5)
✓ test/calendar.test.ts (6) ✓ test/meridian.test.ts (6)

Test Files  16 passed (16)
     Tests  209 passed (209)
  Duration  6.55s
✅ 六爻核心正式测试（7s）
```

## 四、逐条回答董事长的五个问题

| 问题 | 回答 |
|---|---|
| Vitest 无法运行的具体原因 | `node_modules/.bin/*` 符号链接被云盘同步压成纯文本，`npx` 当 shell 脚本执行 → 127。vitest 包本身完好 |
| 哪些测试已由独立脚本覆盖 | 不再需要以替代验证为主：**209 个正式测试全部真实执行**。独立脚本（`verify-facts` T1–T15、`yuepo-audit`、`gua64-audit`、`combine-matrix`）保留为交叉证据，不作为唯一证据 |
| 哪些测试仍然没有执行 | **无**。16 个测试文件、209 个用例全跑，0 skip、0 fail |
| CI 中能否实际运行相关测试 | 目前**不能**：`.github/workflows/` 只有 `deploy-pages.yml`，没有任何测试 job。CI 用 `npm ci` 会重建 `.bin`，不会遇到本地这种 shim 损坏，所以补一个 test job 即可运行（需 push 才生效 → 属于发布动作，未做，等审批） |
| `golden.test.ts` 的修正能否在正式环境通过 | **能**。`golden.test.ts` 13 个用例全通过，含本次修正的「雷火丰 坎宫五世卦（非归魂） 世五应二」→ `expect(pan.benGua.isGuiHun).toBe(false)` |

## 五、遗留事项（不影响复核结论，需董事长定夺）

1. **CI 缺测试 job**：建议新增 `.github/workflows/test.yml`（`npm ci` → `bash tools/test-core.sh`），在 push 时与 Pages 部署并行。因 CI 改动必须 push 才生效，且 push main = 发布，未擅自添加。
2. **`.bin/` shim 损坏是环境问题，不是仓库问题**：重新 `npm install` 可修，但只要还在云盘挂载上工作，随时可能再次被压平。`tools/test-core.sh` 是稳定的绕行方案，已固化进门禁，不依赖 `.bin`。
3. 分体 vendor（`/tmp/vout-L0`、`/tmp/vout-L1`）由 `build-split-vendors.sh` 用 tsup 直接构建，**未做 iztro 非中文 locale 裁剪**（体积略大）。裁剪只影响离线包大小，不影响任何六爻判读逻辑，故用于差异对比是等价的；正式产物仍走 `tools/build-vendor.mjs`。
