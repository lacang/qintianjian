# 01 范围与基线

## 1. 当前工作目录

```
/Coze/Drive/编程专家/每日六爻/
```

项目名「钦天监」：纯本地命理 PWA（无后端、无 AI 调用），`app/` 为站点根，`liuyao-core/` 为六爻排盘内核（TypeScript，tsup 打包为单 bundle）。

## 2. Git 分支与 HEAD

```
分支：main
HEAD：7a5bae4  audit(score-v2): 入墓双计专项审计（195/242）—— 只读，未修代码未推送未部署
前置：7656500  docs(score-v2): 合并准备与合并执行证据（本地 main，未推送未发版）
      51bd404  merge: 评分去重 V2 —— ①②③ 同批合并（未发版，线上仍 v121）
```

## 3. git status

```
?? aipack-samples/
?? app/js/aipack.js
?? tools/ai-pack-sample.mjs
?? tools/score-verify-v2/key-fact-audit/
?? tools/score-verify-v2/l0-fact-audit/     ← 本轮新增（本文件所在目录）
?? tools/score-verify-v2/output/analyzed-vall-510.csv
?? tools/score-verify/
```

**app/ 下已跟踪文件零改动**（`git status --porcelain` 无 `M` 项）。本轮审计全程只读，未产生任何生产代码变更。

## 4. 本地与远端版本关系

| 位置 | commit | 说明 |
|---|---|---|
| 本地 main | `7a5bae4` | 领先远端 3 个 commit（`51bd404` merge → `7656500` 证据 → `7a5bae4` 入墓审计） |
| origin/main | `0ed9e89` | 工程基线，未动 |
| github/main | `0ed9e89` | 同上 |
| 线上（GitHub Pages + coze.site） | app v121 | 与远端一致 |

**发布闸门**：`.github/workflows/deploy-pages.yml` 触发条件为 `on: push: branches:[main] paths:['app/**']` —— 即「push main 且含 app/ 改动」等于自动发布。本轮**未 push、未 commit、未部署**，线上仍 v121。

## 5. 项目目录结构（相关部分）

```
每日六爻/
├── AGENTS.md                    开发纪律唯一正式来源（门禁/发版/交接/已知坑）
├── CHANGELOG.md                 逐版根因记录
├── app/                         站点根（PWA）
│   ├── index.html
│   ├── sw.js                    Service Worker（缓存版本 qintian-v121）
│   ├── js/                      57 个前端模块
│   │   ├── main.js              应用主干、数据流调度
│   │   ├── cast.js              三种起卦入口
│   │   ├── zischool.js          paipan() 的唯一前端封装
│   │   ├── solartime.js         真太阳时校正
│   │   ├── panview.js           排盘视图渲染
│   │   ├── najiaview.js         纳甲视图
│   │   ├── verdict.js           判断层（吉凶评分，本轮不审）
│   │   └── ...
│   ├── vendor/liuyao-core.js    由 liuyao-core/src 打包（45,948 行，勿手改）
│   └── css/ assets/ icons/ manifest.webmanifest
├── liuyao-core/                 六爻内核
│   ├── src/                     28 个 .ts 源文件
│   │   ├── paipan.ts            装卦入口（纳甲/世应/六亲/六神/伏神/旬空）
│   │   ├── calendar.ts          四柱历法（lunar-javascript Exact API）
│   │   ├── constants.ts         BAGUA_BITS / LIU_HE_GUA / LIU_CHONG_GUA / GUI_HUN_OVERRIDE
│   │   ├── guaTable.ts          卦名、卦宫、specialType
│   │   ├── timecast.ts          梅花时间起卦 + XIANTIAN_LINES
│   │   ├── input.ts             castCoins / castManual / castTianji
│   │   ├── wangshuai.ts         旺衰五态（L1 层，本轮不审）
│   │   ├── najiaAnalysis.ts     用神/空破墓绝（L1 层，本轮不审）
│   │   ├── wuxing-rel.ts        五行关系与长生墓绝表
│   │   ├── guashen.ts           卦身
│   │   ├── format.ts            复制文本 / 屏幕视图模型
│   │   └── ...
│   ├── dist/index.js            打包产物（审计实际调用此文件）
│   ├── package.json
│   └── package-lock.json
├── tools/
│   ├── gates.sh                 12 步门禁（唯一入口）
│   ├── release.sh               发版
│   ├── deploy.sh                部署 + 线上核验
│   ├── build-vendor.mjs         src → app/vendor 打包
│   └── score-verify-v2/         评分/规则审计工作区（L1 + 本轮 L0）
└── releases/vNNN.json           发布证据
```

## 6. 实际运行入口

**前端运行链路**（唯一）：

```
app/index.html
  → app/js/main.js  (ES module, ?v=121)
      L644  initCast((cast, source, castDate) => goPan(cast, source, castDate))
      L474  goPan() → paipanZi({ yaoValues, year, month, day, hour, minute, gender, question })
                      → current.pan = pan
                      → renderPan()  (panview.js)
                      → switchView('pan')
                      → autoSave('liuyao')
```

`paipan()` 在 `app/js/` 内的**唯一直接调用点**是 `app/js/zischool.js:21`（封装为 `paipanZi`，叠加晚子时流派开关）。

**审计脚本运行入口**（本轮实际调用）：

```
liuyao-core/dist/index.js  →  paipan() / getShouGuaPan() / formatCopyText() / formatScreen()
```

`dist/index.js` 与 `app/vendor/liuyao-core.js` 同源（由 `tools/build-vendor.mjs` 从 `liuyao-core/src/**` 打包）。本轮审计以 `dist` 为准，因为它是 `src` 的直接编译产物；`vendor` 的漂移风险单列在 02 文档 §5。

## 7. 排盘核心源文件（本轮读过的）

| 文件 | 行数 | 本轮关注点 |
|---|---|---|
| `liuyao-core/src/paipan.ts` | 260 | 装卦全流程、`BAGUA_BITS` 唯一使用点（L243）、变卦六亲恒用本卦宫五行 |
| `liuyao-core/src/calendar.ts` | 148 | 四柱（lunar-javascript Exact）、旬空只取日空、晚子时 23:00 换日 |
| `liuyao-core/src/constants.ts` | 108 | `BAGUA_BITS`、`LIU_HE_GUA`、`LIU_CHONG_GUA`、`GUI_HUN_OVERRIDE` |
| `liuyao-core/src/guaTable.ts` | 106 | 卦名/宫/`specialType`（先六合后六冲） |
| `liuyao-core/src/timecast.ts` | 133 | 梅花时间起卦、`XIANTIAN_LINES`（正确）、`toApparentSolarTime`（仅经度差） |
| `liuyao-core/src/input.ts` | 130+ | `castCoins`（背数→6/7/8/9）、`castManual`、`castTianji`（均匀 25%） |
| `liuyao-core/src/guashen.ts` | 25 | 卦身（阳世从子、阴世从午） |
| `liuyao-core/src/format.ts` | 250+ | `formatCopyText` / `formatScreen`，`showHidden` 默认 true |
| `app/js/zischool.js` | 40 | 晚子时两流派（`adj`：23→0） |
| `app/js/cast.js` | 357 | 三起卦入口、`applyTstAt` 真太阳时 |
| `app/js/solartime.js` | 164 | `toTrueSolar` = 均时差 + 经度差 |
| `app/js/panview.js` | 165 | 排盘渲染、藏爻列、`getShouGuaPan` |
| `app/js/main.js` | 700+ | `goPan` 数据流 |

## 8. 测试脚本与历史审计文件

**项目自带**：

| 文件 | 作用 |
|---|---|
| `tools/gates.sh` | 12 步门禁（唯一入口） |
| `tools/test-gates.mjs` | 门禁自测（11/11） |
| `tools/release.sh` / `tools/deploy.sh` | 发版 / 部署 + 线上核验 |
| `liuyao-core` 内 `vitest` 用例 | 内核单元测试（`package.json` devDeps 有 vitest ^2.1.8） |

**历史审计（L1 层，本轮未改）**：

| 目录 | 内容 |
|---|---|
| `tools/score-verify-v2/key-fact-audit/` | 关键项识别层审计（18 项 T1~T18，`verify-facts.mjs`） |
| `tools/score-verify-v2/tomb-audit/` | 入墓双计专项（195/242） |
| `tools/score-verify-v2/output/` | 评分去重 V2 证据（01~10） |
| `tools/score-verify-v2/legacy/` | 早期脚本 |
| `tools/score-verify-v2/scripts/` | 评分回归脚本（`score-regression.mjs`，尚未接入门禁） |

## 9. 第三方依赖及版本

来自 `liuyao-core/package.json`：

| 依赖 | 版本 | 用途 | 本轮可验证程度 |
|---|---|---|---|
| **mingpan** | 0.1.8 | 纳甲、世应、六亲、六神、伏神、旬空、神煞 | **源码可读**（dist 为 tsc 编译产物、未压缩、带 JSDoc），已用独立表 384 爻全量交叉验证 |
| **lunar-javascript** | 1.7.7 | 四柱干支、农历、节气 | 黑盒，已用 astronomy-engine + JDN 公式独立交叉验证 |
| astronomy-engine | 2.1.19 | 天文位置（本轮用作**独立基准**） | 独立源，非被测对象 |
| auseklis | 0.4.0 | 占星（本轮无关） | 未审 |
| caelus | 0.25.0 | 占星（本轮无关） | 未审 |
| iztro | 2.6.2 | 紫微斗数（本轮无关） | 未审 |
| liuyao（dev） | 0.5.1 | 对照参考（devDependency） | 未使用 |
| tsup（dev） | ^8.3.5 | 打包 | — |
| typescript（dev） | ~5.6.3 | 编译 | — |
| vitest（dev） | ^2.1.8 | 单测 | — |

锁文件 `liuyao-core/package-lock.json` 中的完整性校验：

```
mingpan 0.1.8            registry.npmmirror.com/mingpan/-/mingpan-0.1.8.tgz
                         integrity sha512-y+pan41PGsQeYmZh1bHPbE7AQfM44b+a3Sgzg934B8cKQwveBYpBg+h5N3qmIqRiVmrFyfSS8kAJuiC+jx3QCg==
lunar-javascript 1.7.7   integrity sha512-u/KYiwPIBo/0bT+WWfU7qO1d+aqeB90Tuy4ErXenr2Gam0QcWeezUvtiOIyXR7HbVnW2I1DKfU0NBvzMZhbVQw==
```

`mingpan` 的 dist 结构（`node_modules/mingpan/dist/services/liuyao/`）：`LiuyaoService.js`(9,003B)、`index.js`(1,390B)、`calculators/`、`data/`、`types.d.ts`(4,628B) —— 全部为 `tsc` 输出，**未压缩、带注释、算法可读**。因此 F4「第三方不可验证」在本轮被大幅降级为「已读源码 + 独立算法交叉验证」。

## 10. 本轮明确没做的事

- ❌ 未修改 `app/` 下任何生产代码
- ❌ 未修改 `liuyao-core/src/` 任何文件
- ❌ 未修改 `package.json` / `package-lock.json`
- ❌ 未重构、未新增功能、未改依赖
- ❌ 未 `git add` / `git commit` / `git push`
- ❌ 未部署（线上仍 v121）
- ❌ 未为了让测试通过而调整预期值（本轮有 3 处**修正的是我自己的预期错误**，见 07 文档 §5，修正过程全部留痕）
- ❌ 未审计吉凶评分（verdict.js 的加减分）、古法规则适用性、机器解卦 —— 属 L1 层
- ❌ 未审计旺衰五态、空破墓绝的**吉凶语义**（只审计其**计算事实**是否输出，属 L1）
- ❌ 未删除、未覆盖任何既有 L1 审计成果
