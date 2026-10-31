# 钦天监 · 协作契约（AGENTS.md）

> 本文件是本仓库的**交接说明书 + 协作契约**，也是**开发纪律的唯一正式来源**。
> 任何模型、任何 Agent、任何人类开发者接手本项目：**先读本文件**，再读 `00_产品方向与路线图.md`，再读 `CHANGELOG.md` 最近几版，最后读记忆。
> 目的：换模型、换 Agent、换人，**不重读全部历史**也能安全接手，并保证多轮、多人、多模型并行开发不互相破坏。
> 维护方式：每次发版顺手补一行 `CHANGELOG.md`；若引入新的协作约定，追加进本文「§3 协作基因」并注明日期。
>
> **纪律与状态分离（2026-10-26 定）**：纪律（该怎么做、红线、门禁、发版顺序）一律写在本文件；
> `MEMORY.md` 只保存**当前状态锚点、已定决策、必要索引**，不再堆积历史过程与临时细节。
> 历史细节下沉到 `recent_memory/`（详情文件 + `index.json` 索引）。两者冲突时，**以本文件为准**。

---

## 0. 一句话定位

纯本地、**确定性**的个人命理星象工作台：中式术数（梅花/奇门/大六壬/小六壬/八字/紫微/六爻…）+ 西方古典占星 + 吠陀 + 阳宅玄空 + 世界占卜典籍库（塔罗/雷诺曼/藏占/…）。
单页 PWA：无后端、无账号、不接 AI 生成、不发网络请求（除首屏静态资源）。

## 1. 产品铁律（任何改动不得违背）

1. **纯本地**：不调用外部 AI/接口；所有判断由**编码好的规则与典籍**推出。
2. **确定性**：同一输入（盘面 + 时刻 + 地点）必须给出同一结果与同一文案；不引入随机、不引入时间相关的不确定性（"今天"除外）。
3. **权威可溯源**：每条术语/断语挂出处（`app/js/meaning.js`、`src` 字段、模块头「底本/出处」注释）。
4. **流派分歧并列，不合成**：遇分歧并列展示，不私自取平均或杜撰统一口径。
5. **依赖只用 MIT/Apache**；禁 AGPL、禁 Swiss Ephemeris（星历用 caelus/自研算法）。
6. **用户亲手参与**：占不是"点开出结果"。起盘门 → 亲手起 → 亲手排 → 亲手翻牌，仪式感是产品核心（v106 主人定）。
7. **单人自用**：不做多租户/登录/付费/社交。
8. **古法直断可以给倾向**（v106 主人改规则：允许断吉凶、给倾向，不要死守"不下断语"），但结论必须由规则推导 + 挂古籍，不许编。
9. **标签不是思想关系**（2026-10-31 董事长批示，适用范围＝**整个钦天监知识体系**，不止《论语》）。标签回答"它属于什么主题"，关系回答"它与另一条思想有什么联系"。**不能用标签相似度推导思想关系，也不能因为没有共同标签就否定已经有依据的关系。** 实证反例：LY-006 与 LY-013 同属「人生志向」却无关系边；R-14 两端标签零交集却是 verified 的对照关系。
10. **宁可入口为空，也不编造关联**（2026-10-31 董事长批示）。入口为空可以接受，编造不行。标签体系完善后，孤立节点可以获得更多入口，但**四类入口必须明确区分、不得混为一谈**：原典关系 / 注疏关系 / 编辑比较 / 主题推荐。落地要求：性质必须写进结构（`display_class` 或 `entry.kind`），能被样式与测试直接选中，不能只靠一句小字说明。
11. **未知身份不推测，缺失依据不展示，非法数据不进入用户视野**（2026-10-31 董事长正式批准）。这条来自 `relationBadge()` 的事故：`display_class` 缺失或拼错时，旧代码会一路 fallthrough 到「原典有据」——等于「我不知道这是什么关系，但我先把它当成原典有据」。**这是知识产品绝对不能接受的默认行为。** 落地要求：任何"判断内容身份"的函数，必须显式枚举合法值，其余一律返回不可展示（`ok:false`），由展示层过滤；**宁可看不见，也不能误标**。与第 10 条的区别：第 10 条管"没有内容时怎么办"，第 11 条管"内容身份不明时怎么办"。

## 2. 架构地图

| 位置 | 职责 |
|---|---|
| `app/index.html` | 单页外壳：view 容器、底部导航、版本号 |
| `app/js/main.js` | 路由/tab 注册、页面挂载与初始化 |
| `app/js/state.js` | 全局状态、localStorage、出生配置、排盘时刻覆盖 |
| `app/js/ritual.js` | 起盘仪式三幕式（门 → 起 → 排），`RITUAL_PAGES`/`GATES` |
| `app/js/cast.js` | 起卦输入、真太阳时开关（`cfg.apparentSolarTime`） |
| `app/js/solartime.js` | 真太阳时/均时差/日出日落/**行星时**（纯本地 NOAA 算法） |
| `app/js/geo.js` | **地点中心唯一真相源**：当前观测地（default/locate/manual）、拼音搜城市、定位反查 |
| `app/js/citydata.js` | 离线城市库 `{n,py,ini,lat,lon,prov}`（363 城，纯本地无网络） |
| `app/js/placeui.js` | 各盘面页顶栏"观测地"胶囊 + `openPlacePicker()` 选点弹层 |
| `app/js/skyview.js` | 天象页：行星时卡片、二十八宿、近期天时 |
| `app/js/meaning.js` | 术语/词条与出处字典 |
| `app/js/verdicts.js` | 五盘古法直断（梅花体用/奇门格局/八字日主/命主星/紫微命宫） |
| `app/js/askview.js` | "问问"入口：选问题 → 推荐术数 → 跳盘 |
| `app/js/tarotview.js` | 塔罗牌桌：三式展牌（扇/桥/堆）、点选跳出→拖放、78 图鉴；扇面舞台为全屏透明层，牌悬空其上、overflow:visible 不裁切 |
| `app/js/xiaoliurenview.js` | 小六壬掐指课 |
| `app/js/{meihua,qimen,daliuren,bazi,ziwei,vedic,astro,geomancy,yangzhai,mansion,jingzhuan,tibet,zhuyou}view.js` | 各术数盘面视图 |
| `app/js/{stars,globe,mansion3d,zodiac,astromodes}.js` | 星表/天球仪/星官 3D/星座/星盘模式 |
| `app/css/{style,tarot,vedic,yangzhai,tibet,zhuyou}.css` | 样式；盘面专属样式分文件 |
| `app/vendor/liuyao-core.js` | 打好的核心引擎 bundle（`liuyao-core/src/**` 的产物，由 `tools/build-vendor.mjs` 重建；含 iztro 非中文 locale 裁剪） |
| `liuyao-core/src/**` | 核心计算层（TypeScript）：排盘、天文、纳甲、紫微、吠陀、玄空、牌阵数据 |
| `app/sw.js` | Service Worker：`CACHE=qintian-vNN`，networkFirst + `cache:no-cache` |
| `tools/bump-version.sh` | 一键改版本号（index.html 8 处、js import 164 处、sw CACHE） |
| `tools/gates.sh` | **统一门禁（17 步）**：静态 ESM 模块图 → 经典板块纯函数自测 → vendor 同步 → 六爻核心测试 → 真实浏览器启动 → 经典板块交互测试 → 主题标签正式数据合规 → SW 离线 → 桩测 bundle 重建 → 塔罗冒烟 → v111 桩测 → 复现码 e2e → 塔罗数据/视图/v119/v120 回归 → AI 资料包快照。任一步失败立即中止。`QT_GATE_REPORT=path` 输出 JSON 报告 |
| `tools/test-classic.mjs` | **经典板块（《论语》）纯函数自测（76 项）**：**三种抽取机制的结构性保证**（今日相遇＝年度遍历，相邻两天必不同；问心＝当日队列，同日一轮内不重复且与问题文本无关；一念三观＝分层抽样，三条必来自三个不同群）、**五种反馈无重抽能力**（逐字段断言返回对象不含 redraw/resample/newSeed/seq/node/pick）、关系展示权限（不成立边不可展示 / 编辑阐释必带标记）、八层层序、26 节点覆盖、辩题完整性、**展示层不猜内容身份**（缺/非法 `display_class` 一律不展示，绝不兜底成「原典有据」）、**四类入口不借用彼此名字**（非关系入口只许 cluster/chapter/topic）、**标签正式数据 14 项**（每节点必有归属且 ≤4、`topicsOf` 与标签 `nodes` 双向一致、推荐不推自己且必共享主题、**存在同标签无边节点对**、**存在有关系但标签零交集节点对**、标签 id 不得出现在关系边两端、产品数据不含 `future_classics`）。 |
| `tools/check-topics.mjs` | **主题标签正式数据合规（32 项，董事长 2026-10-31 批准转正）**：A 正式数据够格（`status=approved` 且留批准人、15—25 个、覆盖 26/26、每标签 ≥40 字归属依据与 ≥10 字边界、单条最多 4 个标签、约束①成立）、B 真的进了产品（条数与源一致、逐条一致、每节点双向一致、`validateClassic(strict)` 通过）、C 三条约束结构成立（**无关系边以标签为依据**、**标签 id 不在关系边两端**、**存在「同标签但无关系」的节点对**、**存在「有关系但标签零交集」的节点对**、源文件保留 `future_classics` 而产品数据无、推荐不含自己且必共享标签、孤立节点仍能拿到入口）、D 审核留痕（归档 v0.2 在案、两条原则、四条纪律、红线写明未获批准不得写入与跨经典只声明意图）。 |
| `tools/test-classic-ui.mjs` | **经典板块交互测试（真实点击，68 项）**：同一序号 + 两个完全不同的问题必须抽到同一条；**★点完全部五种反馈当前抽到的条目一次都不变**；**★辩题未选立场时不展示任何注疏**；**★三张牌群名互不相同**；辩一辩不判定立场对错且可改主意；探索页真的列出 26 节点 / 9 群 / 5 个「独立」；已判不成立的关系不出现在详情页；**★空问题点「静心一问」不抽取、不消耗当日序号、不残留上次结果卡，并给出另一条路（今日相遇）**；**★孤立节点的主题推荐不冒充关系**（入口 `data-kind=topic`、显式写「主题推荐，非思想关系」、该区一个关系徽标都不许有）。断言一律用结构选择器（`data-act`/`data-fb`/`data-layer`/`data-kind`），不依赖中文文案（**改文案挂测试已发生三次，这是硬教训**）。 |
| `tools/acceptance-classic.mjs` | **观心 P0 体验记录生成器（不进网关，人工验收用）**：真实浏览器、真实点击、真实 localStorage、移动端 390×844@2x 走完三个核心流程并逐步截图；逐条对照董事长给出的验收标准记录**实际观察到的行为**（不做通过判定）；主动制造异常状态（空输入、2000 字输入、坏 localStorage、跨日序号、不存在的 id、缺失/非法 display_class）；逐节点验证 26 个思想单元都能渲染八层且无空层。产物：`验收记录/观心P0体验-<时间>/`（截图 + report.md + report.json + nodes.json）。整页截图会先把视口拉到整页高度，避免 `position:fixed` 的底部导航浮在长图中间被误认为产品截断。 |
| `tools/check-modules.mjs` | 静态 ESM 模块图：`.mjs` 副本语法检查（躲开 `node --check` 的 CommonJS 假绿灯）+ import 目标存在 + 具名导入确有导出 |
| `tools/verify-browser.mjs` | **真实无头 Chrome 逐页巡检门禁**：起本地静态服务 → 单实例加载首页（断言四柱/卦名进 DOM、无异常、无模块加载失败、无真实 404、版本号自洽）→ 逐页进入 12 个页面（10 个原有视图 + 观心 classic / classic-detail）+ 3 页二次进入（yangzhai / tarot / classic），每页断言视图已激活/关键容器有内容/无未捕获异常/无 console error/无资源加载失败。`--page-timeout 秒` 调单页等待上限（默认 10s） |
| `tools/verify-offline.mjs` | **SW 离线门禁（CDP 驱动）**：在线预热断言 SW active/controller + ASSETS 全集进缓存；断网阶段断言服务端送出 0 文件且页面仍由 SW 接管、关键区块有内容。两阶段都加 `--disk-cache-size=1` 压掉 HTTP 磁盘缓存，使离线成功只能归因于 SW |
| `tools/lib/static-server.mjs` | 门禁专用零依赖静态服务（离线模式用 `socket.destroy()` 真断网，不是返 503） |
| `tools/lib/browser.mjs` | 无头 Chrome 启动/日志扫描/版本读取共享库（**必须异步 spawn**，见 §6） |
| `tools/lib/cdp.mjs` | 零依赖 CDP 客户端（Node 22 自带全局 WebSocket）：起 Chrome → `/json/list` 直连 page target → 取 DOM/缓存条目/异常 |
| `tools/test-gates.mjs` | **门禁故障注入自测**：对每道门禁故意注入故障并断言它必须红，同时配"无故障必须绿"的对照组；跑完自动 `git checkout --` 还原 |
| `tools/release.sh` | **发版唯一入口**：起点门禁 → bump → 终点门禁 → 写发布记录 → 打印提交/部署指引 |
| `tools/deploy.sh` | **部署唯一入口**：脏工作区检查 → 门禁（失败即中止，绝不部署）→ `coze-dev deploy` → 轮询部署单 → 线上 sw.js 版本收敛核验 → 写部署报告 |
| `tools/release-record.mjs` | 写 `releases/vNNN.json`：提交哈希/分支/远端、门禁逐步结果、部署单号与线上核验、版本号、备注 |
| `releases/vNNN.json` | 每次发布留档的证据文件（"当时到底发了什么"） |
| `tools/build-vendor.mjs` | 重建 `app/vendor/liuyao-core.js`（tsup 打 ESM 单 bundle + 裁 iztro 非中文 locale、保留 zh-CN）；`--check` 校验是否与 `liuyao-core/src/**` 漂移 |
| `_lnsrc/ln_stub_test/**` | 桩测：塔罗/雷诺曼 冒烟测试（无浏览器） |
| `data/`、`本人出生配置.json` | 静态数据与出生配置（出生地沈阳） |

**改动影响面速查**
- **改任何 `app/**` → 提交前先 `bash tools/gates.sh`（全绿才算改完）**；发版走 `bash tools/release.sh <旧> <新>`，部署走 `bash tools/deploy.sh`（见 §5.0）。
- 改排盘算法 → `liuyao-core/src/*` → `node tools/build-vendor.mjs` 重建 `app/vendor/liuyao-core.js`（不要直接 cp `liuyao-core/dist/index.js`：脚本会裁掉 iztro 非中文 locale 且保留 zh-CN；`--check` 可先看是否漂移）→ bump → 部署。
- 改盘面 UI → 对应 `app/js/*view.js` + `app/css/*.css`。
- 改真太阳时/行星时 → `app/js/solartime.js`（注意：所有经纬度默认值**不得写死**）。
- 改起盘流程 → `app/js/ritual.js` + `app/js/cast.js`。
- 改词条/出处 → `app/js/meaning.js`。

## 3. 协作基因（写代码时的硬约定 ⭐ 核心）

> 这一节是"让不同模型/不同 Agent 能一起干活"的工程基础。**每次写代码都按此自查。**

1. **文件头契约**：每个模块文件头写清三件事——①职责（一句话）②底本/出处或数据来源 ③对外接口与副作用。已有文件已按此写好，**新文件必须照做**。
2. **纯函数优先**：计算逻辑写成纯函数（输入→输出），不读全局；状态集中放在所属 view 的 state 对象里。
3. **数据驱动优先**：牌阵/神煞/宫位/断语/星表用**数据表**表达，新增条目只加数据、不改引擎。范例：`liuyao-core/src/cards/spreads.ts` 的九阵。
4. **显式失败**：查不到数据就抛错或返回明确空值并给兜底文案。**禁止把 `undefined` 拼进 HTML**（历史 bug：`xiaoliurenview.js` 漏 `return`，整页显示 "undefined"）。
4.1 **数据结构四条纪律**（2026-10-31 董事长批示，源自纠错边被标成「原典有据」的事故）：
    ① **不合法的数据结构直接报错**，不进入后续流程（例：`_norm_positions()` 对 `positions` 非列表直接 `SystemExit`）。
    ② **缺失必要字段不能进入正式导出**（例：`export_web.py` 校验每个 stance 必须有 `lineage`）。
    ③ **纠错记录与思想关系使用不同的数据类型**，不得混存于同一索引（纠错只走 `corrections`，绝不进 `thought.relations`）。
    ④ **展示层不允许通过默认分支猜测内容身份**——拿不到 `status`/`display_class` 必须显式判为不可展示，**不能 fallback 成一个看起来合理的标签**（`relationBadge()` 曾因此把 AI 初筛的纠错边标成「原典有据」）。
5. **单一职责 + 小文件**：一个模块一件事；超过约 600 行考虑拆分。
6. **不写隐式全局**：跨模块只经 `import`；模块级 `const` 优于全局变量。
7. **注释写"为什么"**：不写"做了什么"（代码自明），写清典据、权衡、取舍与坑。
8. **改动最小面**：只动与需求相关的文件，**不顺手重构无关代码**——便于回滚、评审与并行合并。
9. **同构接口**：同类功能用同一套命名与数据形状（例：所有盘面统一用 `state.xxx` + `renderXxx()` 返回 HTML 字符串）。这样换模型/换 Agent 时能照抄同构模块，不必重新理解。
10. **每次改动四件套**：①跑 `bash tools/gates.sh` 全绿（含桩测/可执行断言）②`CHANGELOG.md` 一行（为什么 + 怎么验）③记忆归档（`recent_memory/` 详情 + `MEMORY.md` 锚点）④涉及新门禁/新纪律时补 `AGENTS.md`。
10.1 **不许只有"看起来在跑"的测试**：任何测试都必须**先确认它测的是当前产物**（重建 bundle 再跑、按模块自身 import 清单取依赖，别硬编码文件列表）。加门禁时用 `node tools/test-gates.mjs` 注入故障确认它真的会红。
11. **可回滚**：发版靠 SW 版本号（`CACHE=qintian-vNN`）；改动前先备份或用 git。
12. **对外可交接**：写代码时假设"下一个人是另一个模型、只有本文档和仓库、没有你的对话记忆"。凡是口头解释过的设计，都要落成代码注释或本文档一行。

## 4. 交接检查清单（新模型/新 Agent 接手时按序做）

1. 读 `AGENTS.md`（本文）→ 2. 读 `00_产品方向与路线图.md` → 3. 读 `CHANGELOG.md` 最近 5 版 → 4. 读记忆：`MEMORY.md` 核心状态锚点 + `recent_memory/index.json` 命中的条目 → 5. **跑 `bash tools/gates.sh` 确认基线绿**（不是"看一眼能不能打开"）→ 6. 跑一次 `node tools/test-gates.mjs` 确认门禁本身没坏（11/11）→ 7. 只改一个点，单独成版。
8. 动手前先复述一句需求与影响面，确认后再改（改错比改慢贵）。

## 5. 标准流程

### 5.0 工程门禁与唯一入口（2026-10-26 v122 工程基线 ⭐ 必读）

**唯一路径**（禁止绕过，绕过就等于没有门禁）：

```
改代码 → bash tools/gates.sh            # 12 步门禁，全绿才算改完
发版   → bash tools/release.sh 121 122  # 起点门禁 → bump → 终点门禁 → 写 releases/v122.json
提交   → git push origin main && git push github main
部署   → bash tools/deploy.sh           # 门禁不过就绝不部署
```

**门禁清单（`tools/gates.sh`，退出码 0=全绿 / 1=有红 / 2=参数错 / 3=环境不具备）**

| # | 门禁 | 拦住什么 |
|---|---|---|
| 1 | 静态 ESM 模块图 `check-modules.mjs` | 重复顶层声明、import 断链、具名导入不存在（v121 事故类型） |
| 2 | vendor 产物同步 `build-vendor.mjs --check` | 改了 `liuyao-core/src` 忘了重建 `app/vendor/liuyao-core.js` |
| 3 | 真实浏览器**逐页**巡检 `verify-browser.mjs` | 静态全绿但真机整站不启动、**某一页**初始化失败/运行时异常/资源缺失、二次进入空白、资源 404、版本号不自洽 |
| 4 | SW 离线可用 `verify-offline.mjs` | 预缓存清单缺项、断网后打不开、离线页面其实靠 HTTP 缓存 |
| 5–7 | 桩测 bundle 重建 + 塔罗冒烟 + v111 桩测 | 测旧产物、bundle 构建失败 |
| 8 | 复现码 e2e（含 v1 兼容） | 复现码生成/导入/还原断裂、老码不兼容 |
| 9–12 | 塔罗数据 / 视图 / v119 / v120 回归 | 数据契约、视图架构、历史修复回归 |

`bash tools/gates.sh --quick` 只跑 1–3（发版 bump 前后用，约 30s——第 3 步逐页巡检要真开一次浏览器巡 10 页）；`--no-tests` 跑 1–4；`--expect-version NN` 额外断言版本号一致。

`bash tools/deploy.sh --verify-only` 只做线上核验（不跑门禁、不部署、不要求工作区干净），用来单独确认两个站点的线上内容与本地是否一致——排查"线上到底是哪一版"时先用它，不要为了核验而重新部署。

**门禁本身也要被测**：`node tools/test-gates.mjs` 会对每道门禁**故意注入故障**并断言它必须红（11 个注入用例 A–K，含一条"无故障必须绿"的对照组）。任何一次"门禁全绿"的结论，都要以这个自测为前提——**没红过的门禁等于没有门禁**。

**测试分层与执行时机**（每层只负责它能负责的风险，不要指望一层兜住所有问题）：

| 层 | 命令 | 覆盖的风险 | 什么时候跑 |
|---|---|---|---|
| 静态 | `check-modules.mjs` + `build-vendor --check` | 模块图断裂、具名导出不存在、vendor 与 src 漂移 | 每次改代码 |
| 首页启动 | `verify-browser.mjs`（首页段） | JS 整站没跑、模块加载失败、真实 404、版本号不自洽 | 每次改代码 |
| **逐页巡检** | `verify-browser.mjs`（10 页 + 2 页复入） | **单页**初始化失败、单页未捕获异常、单页资源缺失、二次进入空白 | 每次改代码（已并入门禁第 3 步，无需单独跑） |
| 离线 | `verify-offline.mjs` | SW 预缓存清单缺项、断网打不开 | 每次改代码 |
| 纯逻辑桩测 | `build.sh` + tarot/v111 冒烟 + `v91_src` 四套 | 纯函数/渲染逻辑回归（无浏览器，快） | 每次改代码 |
| 门禁自测 | `test-gates.mjs` | **门禁本身失效**（假绿灯） | 改门禁时 + 发版前 |
| 线上核验 | `deploy.sh --verify-only` | 线上跑的不是这次代码 | 排查"线上到底是哪一版"时 |
| 真机验收 | 手工（iOS Safari / 微信内置浏览器） | 无头 Chrome 覆盖不到的引擎与容器差异 | 涉及 SW / 分享 / 缓存 / 页面生命周期的改动后 |

**逐页巡检覆盖的是**：10 个主视图（首页/阳宅/符箓/塔罗/地占/藏占/大六壬/小六壬/吠陀/六爻排盘）各自的 `page-not-active`（视图没切过去）、`page-not-rendered`（关键容器字数低于下限）、`page-exception`（未捕获异常）、`page-console-error`、`page-resource-failed`，外加阳宅/塔罗的**二次进入**回归（v121 阳宅空白、v109 牌桌重构）。**它不覆盖**：交互流程（拖牌、选盘、表单提交）、视觉正确性、iOS Safari 与微信内置浏览器——这些仍靠真机人工验收，不要用"门禁全绿"宣称它们已被覆盖。

**逐页巡检的两条实现约束**（改这个脚本前必读）：① 必须**复用同一个浏览器实例 + 同一套构建产物**逐页 `switchView`，禁止每页重启浏览器（10 页重启会让门禁从 7s 变成 60s+）；② `goto` 之后必须**先等 `navigator.serviceWorker.controller` 非空**再取 DOM——首次访问会走 SW `claim` → `controllerchange` → `location.reload()`，撞上这次 reload 会读到空壳 DOM，产生"随机某页没渲染"的假红（2026-10-26 实际踩过）。

**为什么部署入口必须唯一**：如果还能手工 `coze-dev deploy`，门禁就形同虚设。所以 `tools/deploy.sh` 是唯一部署入口，且部署前**再跑一遍门禁**；工作区脏（有未提交改动）直接拒绝部署，因为"部署的产物必须能追溯到某个提交"。

### 5.1 新增一个术数 / 新页面（照抄同构模块）
计算层放 `liuyao-core/src/`（纯函数 + 类型 + 导出）→ 视图放 `app/js/xxxview.js` → 样式放 `app/css/xxx.css` → `app/index.html` 加 view 容器 → `app/js/main.js` 注册 → 桩测加断言 → 记忆归档 → bump → 部署 → 线上核验。

### 5.2 发版固定动作顺序（不可跳步）

**现在只需两条命令**（细节都在脚本里，脚本自己会中止）：

```
bash tools/release.sh 121 122     # ① 起点门禁 ② bump ③ 终点门禁 ④ 写 releases/v122.json ⑤ 打印后续
git add <本次改动路径> && git commit && git push origin main && git push github main
bash tools/deploy.sh              # 脏工作区拒绝 → 门禁 → coze-dev deploy → 部署单轮询 → 线上 sw.js 收敛核验 → 写部署报告
```

`tools/release.sh` 里的 `tools/bump-version.sh` 内含三闸门：写回读回断言 / 旧版本号残留 / import 闭包 ⊆ SW ASSETS，+卫生闸+ESM 语法自检，任一失败 `exit 1` 不得发版。**语法自检必须走 `.mjs` 副本**：`node --check x.js` 会按 CommonJS 解析、放过 ESM 的重复顶层声明——v121 就因两处 `xxxCode` 重复声明静默过闸，真机整个模块图崩、应用完全不启动。

**双路部署与线上核验**：①`coze-dev deploy`（coze.site，备用 CDN）；②推 main 到 github 触发 GitHub Pages Actions（见 5.4/5.5）。两路都要核验 SW 版本号 + 关键资源内容 + 老代码已消失。`tools/deploy.sh` 的核验方式是**普通 GET（不带 cache-buster、不带 no-cache 头）+ 最多 6 次重试 + sha256 内容比对**：比对远端 `sw.js` 与本地 `app/sw.js` 的**字节**（版本号对但内容旧也算失败），再核 `index.html` 的 `?v=`；任一站点 mismatch 直接硬失败，两站都读不到也硬失败（"本次没有任何线上证据"），只有单站读不到才降级为 ⚠️ + 人工确认。最后**双远端 git 同步哈希对齐** → 记忆归档 → 汇报（结论先行 + 真机待验收项）。

**每次发版必须留下 `releases/vNNN.json`**：提交哈希、门禁逐步结果、部署单号、线上核验、版本号。出问题先看这个文件，不要靠"某个 AI 还记得"。

### 5.4 Git 双远端同步（2026-10-25 起）
项目纳管平台云 Git，并有 GitHub 远端，**两个远端都要推、保持同一 commit**：
- `origin` = 平台云 Git（`code.coze.cn/.../240117402398084017.git`，权威主远端，`main` 的 upstream 指它）
- `github` = `https://github.com/lacang/qintianjian.git`（**公开 public** 仓库，用 gh CLI 凭据推送）
- 每次发版提交后执行：`git push origin main && git push github main`，推完用两边 `rev-parse`/`ls-remote` 哈希对齐核验。
- 只 `git add` 本次实际改动的路径，禁止 `git add .` / `git add -A` / `force push`。
- GitHub 仓库为 public，提交信息/代码里**绝不能出现任何 token/密钥/私有凭据**（发版前可用密钥正则扫一遍）。`本人出生配置.json` 与 `app/js/state.js` 的 BIRTH 默认值含主人真实生辰，**主人已明确知情并同意公开（仅生日生时，非敏感）**，保留入库。

### 5.5 GitHub Pages 部署（2026-10-25 起，主用对外地址）
- **背景**：`page.coze.site` 是 Coze 共享域名，被微信整体封禁（申诉无果，连坐与本项目内容无关）。GitHub Pages 走 `github.io` 域名，微信可直接打开，作为**主用对外地址**；coze.site 降级为备用 CDN。
- 线上地址：**https://lacang.github.io/qintianjian/**
- 机制：`.github/workflows/deploy-pages.yml` 在 main 分支 `app/**` 变更时，把 **`app/` 目录发布到 Pages 根路径**（Pages 设置 build_type=workflow）。推 main 到 github 即自动部署；查看 `gh run list --repo lacang/qintianjian`，失败用 `gh run view <id> --log-failed`。
- PWA 全部用相对路径（`./sw.js`、ASSETS `./`、manifest `start_url/scope=./`），适配 `/qintianjian/` 子路径，**禁止改成根绝对路径**。
- 免费账户 GitHub Pages 仅支持 public 仓库（账号 lacang，free）。

### 5.3 桩测
`_lnsrc/ln_stub_test/`：塔罗 `node tarot_smoke.mjs`；**v111 起新增 `node v111_smoke.mjs`**（地址中心/真太阳时/择时/小六壬/三维兜底）。另有 `v91_src/check_sharecode_v2.mjs`（复现码 99 断言）、`v91_src/check_tarot_data.mjs`、`v91_src/check_tarot_view.mjs`、`v91_src/check_tarot_v119.mjs`、`v91_src/check_tarot_v120.mjs`。**先跑 `bash _lnsrc/ln_stub_test/build.sh` 重建两个 bundle（tarot / v111）**（拷 /tmp 剥 `?v=` 再 esbuild），脚本内自愈 esbuild 可执行位并直接用 `liuyao-core/node_modules/@esbuild/linux-x64/bin/esbuild`（`app/` 下无 esbuild；`node_modules/.bin/esbuild` 那个 shim 是裸相对路径，从仓库根调用会 `No such file or directory`），无 jsdom（用 localStorage/document 桩 + `globalThis.window`）。
**`.gitignore` 与桩测资产的关系（2026-10-26 核实）**：`_lnsrc/ln_stub_test/*.mjs` 默认被忽略，但 `.gitignore` 用 `!` 白名单**已经放行了手写测试**——`tarot_smoke.mjs`、`v111_smoke.mjs`、`v111_entry.js`、`build.sh` 都在版本库里（`git ls-files _lnsrc/ln_stub_test/` 可验证）。真正被忽略的是 esbuild **产物** `tarot_bundle.mjs` / `v111_bundle.mjs`（1.9MB + 2.8MB）——它们由 `app/js/**` 打包生成，每次改 app 都会变，进版本库只会制造无意义 diff。**换设备后 bundle 不存在是正常的，先跑 `bash _lnsrc/ln_stub_test/build.sh` 重建**，不需要为它改 `.gitignore`。v120 删小雷诺曼后 `ln_bundle.mjs` / `run.mjs` 已废弃（保留未删，同样被忽略）。
**假绿警告**：不重建 bundle 就跑冒烟，测的是旧产物——v121 就踩过（build.sh 因引用已删文件而静默失败，冒烟仍报"77 通过"）。**改完 `app/js/**` 先 `bash build.sh` 看有没有报错，再跑冒烟。**
**桩测依赖必须由模块自己的 import 清单推导，禁止硬编码文件名**：v92 版 `check_tarot_view.mjs` 只拷了 `tarotval_rws.js`，v99 引入 `tarotdeck-sb.js` / `tarotdeck-hist.js` 后这套断言就再也测不到真实视图（先报 `ERR_MODULE_NOT_FOUND`，更早的时候是断言过时静默失效）。v122 已改为按 `tarotview.js` 的 import 清单自动拷依赖，并按 v109+ 牌桌架构重写断言（`tarotSetTableForTest` / `tarotLandForTest` 驱动落牌 → 开牌解局 → 结果页）。

## 6. 已知坑（踩过就别再踩）

- **esbuild 桩测 bundle**：`app/js` 与 `app/vendor` 必须先拷到临时目录并 `sed` 去掉所有 `?v=` 后缀再打包，否则 vendor 与 app 拆成两个模块实例，出现"未注册 marseille"之类的假错。
- **旋转 + 平移的组合**：`rotate(θ) translateY(-R)` 的位移方向是**旋转后的局部坐标**；θ = -90° 会把"向上"变成"向左"。扇面基角必须是 0（中牌竖直向上）。
- **固定覆盖层里的 50%**：`position:fixed` 元素内的 `left:50%` 以视口为基准，不是父容器；绝对定位元素同理要配 `margin-left`。
- **渲染函数必须 return 字符串**：`renderXxx()` 忘了 `return` → `innerHTML = undefined` → 页面出现字面量 "undefined"。
- **微信内置浏览器缓存**：SW 走 networkFirst + `cache:no-cache`；改完要让用户强刷或等 SW 更新，否则看到旧版。
- **经纬度不得写死**：真太阳时/行星时/日出日落/二十八宿都依赖所在地。v111 起统一走 `app/js/geo.js` 的当前地点（`getPlace()`），需要新地点能力时**扩展 geo.js，不要再各自写一份**。
- **同一文件并行 `edit_file` 会互相覆盖**：改同一文件必须串行，或一次性写完；改完立刻复核（整文件重写易打错天文常数）。
- **`node --check` 对 `.js` 是假绿灯**：Node 对无 `package.json` type=module 的 `.js` 按 CommonJS 解析，**会放过 ESM 的重复顶层声明**（v121 事故：两处 `xxxCode` 重复声明，node --check 全绿、真机整个模块图崩、应用不启动）。校验 app 侧 ESM 一律先 `cp x.js /tmp/x.mjs && node --check /tmp/x.mjs`；`tools/check-modules.mjs` 已含此项 + import 目标存在 + 具名导出存在。`tools/test-gates.mjs` 用例 A 会现场打印这条"假绿灯"对照证据。
- **`spawnSync` 会阻塞 Node 事件循环**：门禁脚本里用 `spawnSync` 跑 Chrome，同进程的静态服务无法响应浏览器请求 → Chrome 一直等 → 表现为"卡 120s 超时、DOM 为空"（排查了很久的真根因）。跑浏览器一律用异步 `spawn`（`tools/lib/browser.mjs` 的 `runChrome`）。
- **`--timeout=N` 本机 Chrome 不识别**（elapsed 仍 1s）；`--virtual-time-budget=N` 才有效。CDP 方案下都不需要。
- **503 不能模拟断网**：`sw.js` 的 `networkFirst` 只在 `fetch` **reject** 时才回退缓存，返回 503 会被当正常响应透传。离线模拟必须 `req.socket.destroy()`（`tools/lib/static-server.mjs` 已如此实现）。
- **离线测试最容易出假证据**：停掉服务器后页面照样能打开，很可能只是**浏览器 HTTP 磁盘缓存**的功劳，不是 SW。必须加 `--disk-cache-size=1` 压掉 HTTP 缓存 + 用 CDP 断言 `navigator.serviceWorker.controller` 非空、缓存条目覆盖 ASSETS 全集。早期用 `--dump-dom` 两次跑出来的"离线通过"就是这类假证据。
- **SW 预缓存是 all-or-nothing**：`caches.addAll(ASSETS)` 有一个 404 就整批失败（SW 直接不激活）。所以"缓存条目 ⊇ ASSETS 全集"这条断言同时验证了清单里每个文件都真实存在。
- **CDP 断言要等渲染稳定**：`main.js` 监听 SW `controllerchange` 后会 `location.reload()`，一次导航实际加载两次，中途读 DOM 会读到"HTML 已解析、脚本没跑"的半成品（关键区块全空）。要等到关键区块有内容再取 DOM。
- **桩测里 `innerHTML =` 要模拟真实 DOM 替换**：真实 DOM 换子树时旧节点上的委托会一起消失，桩里如果让 `#tr-table` 长驻，`bindTable` 的点击委托会不断累积、同一个按钮被处理多次（第二次就 `state.tableSlots` 为 null 崩）。桩的 `innerHTML` setter 里要把 `#tr-table` 重建。
- **coze.site CDN 对带 cache-buster / `no-cache` 的请求会挂起**：实测请求 `sw.js` 时带 `?qt=<随机数>` 或带 `Cache-Control: no-cache` / `Pragma: no-cache` 头，约一半概率挂 **22.6s**（curl `http=000`）；普通 GET（无 query、无 no-cache 头）3/3 都是 0.1–0.2s 且内容正确。所以线上核验**不要**加 cache-buster、不要加 no-cache 头，否则会得到假失败（HTTP 缓存这一层由 sha256 内容比对兜住）。
- **线上核验要比内容、不比版本号**：只有 `sha256(远端 sw.js) == sha256(本地 app/sw.js)` 才能证明"线上跑的是这次的代码"；只比 `qintian-vNNN` 会漏掉"版本号 bump 了、内容还是旧的"。
- **`memory_edit` 的 replace 若原文不完全一致会把文件清空**；改记忆前先 `memory_read`，必要时用 `write_file` 写全量。单文件上限 2048 字节（`MEMORY.md` 5120）。
- **`grep`/`find` 找不到记忆文件**：记忆由 memory 服务托管，不在 bash 可见路径，只能用 `memory_read`/`memory_list`/`memory_edit`。

## 7. 边界

- 生产发版需主人明确指令；线上 https://8xjmbcxsf9.page.coze.site（`app_id 7697839050836901888`）。
- `app/.coze` 里的 `project_id`/`app_id` 保留复用，**禁止手改**。
- 主人单人自用；涉及"删文件/改线上配置/对外发布"等不可逆动作，先确认。
