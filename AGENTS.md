# 钦天监 · 协作契约（AGENTS.md）

> 本文件是本仓库的**交接说明书 + 协作契约**。
> 任何模型、任何 Agent、任何人类开发者接手本项目：**先读本文件**，再读 `00_产品方向与路线图.md`，再读 `CHANGELOG.md` 最近几版，最后读记忆。
> 目的：换模型、换 Agent、换人，**不重读全部历史**也能安全接手，并保证多轮、多人、多模型并行开发不互相破坏。
> 维护方式：每次发版顺手补一行 `CHANGELOG.md`；若引入新的协作约定，追加进本文「§3 协作基因」并注明日期。

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
| `app/js/lenormandview.js` | 小雷诺曼 36 牌 + 大桌布 + 亲手抽牌 |
| `app/js/xiaoliurenview.js` | 小六壬掐指课 |
| `app/js/{meihua,qimen,daliuren,bazi,ziwei,vedic,astro,geomancy,yangzhai,mansion,jingzhuan,tibet,zhuyou}view.js` | 各术数盘面视图 |
| `app/js/{stars,globe,mansion3d,zodiac,astromodes}.js` | 星表/天球仪/星官 3D/星座/星盘模式 |
| `app/css/{style,tarot,lenormand,vedic,yangzhai,tibet,zhuyou}.css` | 样式；盘面专属样式分文件 |
| `app/vendor/liuyao-core.js` | 打好的核心引擎 bundle（`liuyao-core/src/**` 的产物） |
| `liuyao-core/src/**` | 核心计算层（TypeScript）：排盘、天文、纳甲、紫微、吠陀、玄空、牌阵数据 |
| `app/sw.js` | Service Worker：`CACHE=qintian-vNN`，networkFirst + `cache:no-cache` |
| `tools/bump-version.sh` | 一键改版本号（index.html 8 处、js import 164 处、sw CACHE） |
| `_lnsrc/ln_stub_test/**` | 桩测：塔罗/雷诺曼 冒烟测试（无浏览器） |
| `data/`、`本人出生配置.json` | 静态数据与出生配置（出生地沈阳） |

**改动影响面速查**
- 改排盘算法 → `liuyao-core/src/*` → 重新打包 `app/vendor/liuyao-core.js` → bump → 部署。
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
5. **单一职责 + 小文件**：一个模块一件事；超过约 600 行考虑拆分。
6. **不写隐式全局**：跨模块只经 `import`；模块级 `const` 优于全局变量。
7. **注释写"为什么"**：不写"做了什么"（代码自明），写清典据、权衡、取舍与坑。
8. **改动最小面**：只动与需求相关的文件，**不顺手重构无关代码**——便于回滚、评审与并行合并。
9. **同构接口**：同类功能用同一套命名与数据形状（例：所有盘面统一用 `state.xxx` + `renderXxx()` 返回 HTML 字符串）。这样换模型/换 Agent 时能照抄同构模块，不必重新理解。
10. **每次改动三件套**：①桩测/可执行断言 ②`CHANGELOG.md` 一行（为什么 + 怎么验）③记忆归档（`recent_memory/` 详情 + `MEMORY.md` 锚点）。
11. **可回滚**：发版靠 SW 版本号（`CACHE=qintian-vNN`）；改动前先备份或用 git。
12. **对外可交接**：写代码时假设"下一个人是另一个模型、只有本文档和仓库、没有你的对话记忆"。凡是口头解释过的设计，都要落成代码注释或本文档一行。

## 4. 交接检查清单（新模型/新 Agent 接手时按序做）

1. 读 `AGENTS.md`（本文）→ 2. 读 `00_产品方向与路线图.md` → 3. 读 `CHANGELOG.md` 最近 5 版 → 4. 读记忆：`MEMORY.md` 核心状态锚点 + `recent_memory/index.json` 命中的条目 → 5. 跑一遍桩测确认基线绿 → 6. 只改一个点，单独成版。
7. 动手前先复述一句需求与影响面，确认后再改（改错比改慢贵）。

## 5. 标准流程

### 5.1 新增一个术数 / 新页面（照抄同构模块）
计算层放 `liuyao-core/src/`（纯函数 + 类型 + 导出）→ 视图放 `app/js/xxxview.js` → 样式放 `app/css/xxx.css` → `app/index.html` 加 view 容器 → `app/js/main.js` 注册 → 桩测加断言 → 记忆归档 → bump → 部署 → 线上核验。

### 5.2 发版固定动作顺序（不可跳步）
`tools/bump-version.sh NN+1 NN`（内含三闸门：写回读回断言/旧版本号残留/import闭包⊆SW ASSETS，+卫生闸+node --check，任一失败 exit 1 不得发版）→ 全链 `?v=NN` + `sw.js CACHE=qintian-vNN` → 桩测 → `coze-dev deploy` → 轮询到 `Succeeded` → **线上核验**（SW 版本号 + 关键资源内容 + 老代码已消失）→ 发部署卡片 → **双远端 git 同步**（见 5.4）→ 记忆归档 → 汇报（结论先行 + 真机待验收项）。

### 5.4 Git 双远端同步（2026-10-25 起）
项目已纳管平台云 Git，并有 GitHub 镜像，**两个远端都要推、保持同一 commit**：
- `origin` = 平台云 Git（`code.coze.cn/.../240117402398084017.git`，权威主远端，`main` 的 upstream 指它）
- `github` = `https://github.com/lacang/qintianjian.git`（**私有**仓库，用 gh CLI 凭据推送）
- 每次发版提交后执行：`git push origin main && git push github main`，推完用两边 `rev-parse`/`ls-remote` 哈希对齐核验。
- 只 `git add` 本次实际改动的路径，禁止 `git add .` / `git add -A` / `force push`。
- `本人出生配置.json` 含主人真实生辰，**仅因 GitHub 仓库私有才保留入库**；若将来要把仓库改公开，必须先从全部历史中移除该文件再谈。
- Git 提交信息和发版闸门只记录路径/数据，不得写入任何 token 或密钥。

### 5.3 桩测
`_lnsrc/ln_stub_test/`：塔罗 `node tarot_smoke.mjs`；雷诺曼 `node run.mjs ./ln_bundle.mjs`；**v111 起新增 `node v111_smoke.mjs`**（地址中心/真太阳时/择时/小六壬/三维兜底）。**先跑 `bash _lnsrc/ln_stub_test/build.sh` 重建三个 bundle**（拷 /tmp 剥 `?v=` 再 esbuild），构建用 `./liuyao-core/node_modules/.bin/esbuild`（`app/` 下无 esbuild），无 jsdom（用 localStorage/document 桩 + `globalThis.window`）。

## 6. 已知坑（踩过就别再踩）

- **esbuild 桩测 bundle**：`app/js` 与 `app/vendor` 必须先拷到临时目录并 `sed` 去掉所有 `?v=` 后缀再打包，否则 vendor 与 app 拆成两个模块实例，出现"未注册 marseille"之类的假错。
- **旋转 + 平移的组合**：`rotate(θ) translateY(-R)` 的位移方向是**旋转后的局部坐标**；θ = -90° 会把"向上"变成"向左"。扇面基角必须是 0（中牌竖直向上）。
- **固定覆盖层里的 50%**：`position:fixed` 元素内的 `left:50%` 以视口为基准，不是父容器；绝对定位元素同理要配 `margin-left`。
- **渲染函数必须 return 字符串**：`renderXxx()` 忘了 `return` → `innerHTML = undefined` → 页面出现字面量 "undefined"。
- **微信内置浏览器缓存**：SW 走 networkFirst + `cache:no-cache`；改完要让用户强刷或等 SW 更新，否则看到旧版。
- **经纬度不得写死**：真太阳时/行星时/日出日落/二十八宿都依赖所在地。v111 起统一走 `app/js/geo.js` 的当前地点（`getPlace()`），需要新地点能力时**扩展 geo.js，不要再各自写一份**。
- **同一文件并行 `edit_file` 会互相覆盖**：改同一文件必须串行，或一次性写完；改完立刻 `node --check` 复核（整文件重写易打错天文常数）。
- **记忆服务**：`memory_edit` 的 replace 若原文不完全一致会把文件清空；改记忆前先 `memory_read`，必要时用 `write_file` 写全量。
- **`grep`/`find` 找不到记忆文件**：记忆由 memory 服务托管，不在 bash 可见路径，只能用 `memory_read`/`memory_list`/`memory_edit`。

## 7. 边界

- 生产发版需主人明确指令；线上 https://8xjmbcxsf9.page.coze.site（`app_id 7697839050836901888`）。
- `app/.coze` 里的 `project_id`/`app_id` 保留复用，**禁止手改**。
- 主人单人自用；涉及"删文件/改线上配置/对外发布"等不可逆动作，先确认。
