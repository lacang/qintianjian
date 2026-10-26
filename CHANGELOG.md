# 版本日志（CHANGELOG）

> 用途：**换模型、换 Agent、换人时靠它复盘**——每一版"改了什么、为什么这么改（根因）、怎么验"。
> 维护：每次发版补一节；纯修复也要记根因（同一坑别踩第二次）。
> v107 以前的记录在记忆 `recent_memory/project/` 与旧会话里，本文件从 v108 起。

---

## 工程基线 · 2026-10-26 · 门禁体系落地（app 版本不变，仍 v121；v122 不加功能）

- **背景**：主人把 v121 定为工程质量基线，要求下一步不做功能，先补三个工程闭环，并明确「最看重的是第二项」——**测试本身可以是绿的，但测试对象可能根本不是最新代码**，所以"构建失败阻止发布"必须做成**自动化的失败注入测试**，而不是靠人记得检查。
- **唯一入口**（绕过就等于没有门禁）：`bash tools/gates.sh`（改代码后）→ `bash tools/release.sh <旧> <新>`（发版）→ `git push` → `bash tools/deploy.sh`（部署；门禁不过绝不部署、工作区脏拒绝部署）。
- **12 步门禁**：静态 ESM 模块图 → vendor 产物同步 → 真实浏览器启动 → SW 离线可用 → 桩测 bundle 重建 → 塔罗冒烟 → v111 桩测 → 复现码 e2e（含 v1 兼容）→ 塔罗数据 → 塔罗视图 → v119 → v120。`--quick`（1–3）/`--no-tests`（1–4）/`--expect-version NN`；`QT_GATE_REPORT` 输出 JSON 报告。健康基线 12/12 绿，17s。
- **门禁本身被测**：`node tools/test-gates.mjs` 对每道门禁**故意注入故障**并断言必须红，同时跑"无故障必须绿"对照组 → 10/10。用例 A 现场打印 `node --check x.js`（假绿灯，rc=0）与 `node --check x.mjs`（rc=1）的对照证据。
- **真实浏览器启动门禁**（`tools/verify-browser.mjs`）：无头 Chrome 加载首页，断言 `#home-sizhu` / `#now-gua-title` 由 JS 写入、DOM 非空、无未捕获异常 / 模块加载失败 / 资源 404、`?v=` 唯一且 = SW CACHE。故障注入实测能精确报出 `js-not-executed` + `home-not-rendered` + `console-SyntaxError`。
- **SW 离线门禁**（`tools/verify-offline.mjs`，零依赖 CDP 驱动）：在线预热 → 断言 SW `active` + `controller` + **缓存条目 ⊇ sw.js ASSETS 全集**（239 项）→ 断网（`socket.destroy`，不是 503）→ 断言服务端送出 0 文件、页面仍由 SW 接管、关键区块有真实内容。两阶段都带 `--disk-cache-size=1`，**压掉浏览器 HTTP 磁盘缓存，让"离线可用"只能归因于 SW**。
- **根因记录（踩过的坑，别踩第二次）**：①`spawnSync` 阻塞事件循环 → 同进程静态服务无法响应 Chrome → 假"超时"；②`--timeout=N` 本机 Chrome 不识别；③503 不能模拟断网（`networkFirst` 只在 fetch reject 时回退）；④停服务器后页面能打开，可能是 HTTP 磁盘缓存而非 SW（**假证据**）；⑤`controllerchange` 触发 `location.reload()`，中途读 DOM 会拿到"脚本没跑"的半成品。
- **门禁当场抓出两处历史欠账（正是主人担心的"测试假绿"）**：①`v91_src/check_tarot_view.mjs` 的桩测依赖清单硬编码，v99 引入 `tarotdeck-sb.js`/`tarotdeck-hist.js` 后它就已经测不到真实视图（v120 删小雷诺曼后更是直接 `ERR_MODULE_NOT_FOUND`）；②它的断言还停留在 v92 菜单页架构，v109 全屏牌桌重构后全部过时。**已按模块自身 import 清单自动推导依赖 + 按牌桌架构重写断言（47 条），并补上"桩的 `innerHTML` 要模拟真实 DOM 替换"这条坑**（否则 `bindTable` 委托累积，同一按钮被处理两次而崩）。
- **发布记录**：`releases/vNNN.json`（`tools/release-record.mjs`）——提交哈希 / 门禁逐步结果 / 部署单号 / 线上地址 / 备注。已补记 `releases/v121.json`（含"该记录由 v122 工程闭环补记，记录的是用当前全套门禁对 5552f09 代码的复验结果"这条诚实标注）。
- **线上核验加固（`tools/deploy.sh` 第 5 节重写）**：原先用 `curl "$base/sw.js?qt=$RANDOM"` 只比版本号，实测在 coze.site 上**带 cache-buster / `no-cache` 头约一半概率挂 22.6s**（`http=000`），会得到假失败。改为**普通 GET + 最多 6 次重试 + `sha256` 内容比对**：远端 `sw.js` 字节必须等于本地 `app/sw.js`（版本号对但内容旧也算失败），再核 `index.html` 的 `?v=`；任一站点 mismatch 硬失败、两站都读不到也硬失败（"本次没有任何线上证据"）、只有单站读不到才降级为 ⚠️。新增 `--verify-only` 模式（不跑门禁、不部署、不要求工作区干净），可单独回答"线上到底是哪一版"。**实测两站线上 `sw.js` 与本地字节一致、`?v=121` 一致**（报告见 `releases/v121.json` 的 `deploy.remote_check`）。
- **纪律归属**：`AGENTS.md` 是开发纪律的唯一正式来源（§5.0 门禁与唯一入口 / §4 交接清单 / §6 已知坑）；记忆里的 `MEMORY.md` 只保存当前状态、重要决策和必要索引，历史细节下沉 `recent_memory/`。


---

## v121 · 2026-10-26 · 复现码 v2（带计算配置与规则版本）+ 7 类术数补码 + 工程债三清

- **背景**：主人「把这几个都收了吧」——把积压的 3 项工程债与评审阶段遗留的 4 项功能债一次清掉。核心是让「复现码」真正等于「可复现」：v1 只带类型+时刻，同一时刻开不同开关（晚子时流派、真太阳时、观测地、牌组）会算出不同的盘，复现出来不是同一盘；且 15 类术数里 7 类根本没有码。
- **复现码 v2（`js/sharecode.js` 重写）**：
  1. 结构：`QT1-` 前缀不变（格式族），版本写进头字节高 4 位；v2 依次写 `规则版本 · 时间秒 · 配置标志 · [观测地] · [牌组] · 类型数据 · 校验`。
  2. 计算配置块：`F_LATE_ZI`（晚子时 23 点换日 / 子正 0 点换日）、`F_TST`（真太阳时）、`F_GEO`（观测地经纬度，astro/vedic 除外——它们的经纬度是本体数据）、`F_DECK`（牌组 id）。
  3. 规则版本 `RULE_VERSION=1`：解出的码若版本低于当前，toast 追加「此码规则 vN，当前 vM，结果或有差异」；v1 码 `ruleStale=false`（无此信息，不误报）。
  4. 向后兼容：v1 码仍可解，按默认配置复现。
  5. 主流程：`codeInfo(kind)` 统一注入配置；`openByCode` 新增 `applyCodeCfg()`，把码里的配置写回本地设置再排盘——复现的是同一盘。
- **7 类术数补码（B-P2-04）**：按数据来源分两类补齐，`KIND_ID` 用满 1–15。
  - 时刻确定型（起课不含随机，时刻即全部）：大六壬 `daLiuRenCode`、小六壬 `xiaoLiuRenCode`（原为 `() => ''` 占位）。
  - 随机型（记录随机结果本身）：地占 `geomancyCode`——母符 4×4 行的奇偶打包 16 位，女/侄/证人/法官全可重推（`castGeomancy` 拆出 `chartFromMothers`，随机与推演分离）；藏占 `tibetanCode`——骰式 3×2bit / 钱式 2×3bit + 所问。
  - 输入型：阳宅 `yangzhaiCode`——坐向 0.1° + 六类房间九宫掩码 + 建房年 + 居住人 + 门外形势勾选；吠陀 `vedicCode`——原实现返回裸对象（无 `data` 包装、kind 不在表内，实际会抛错被吞），改为与 astro 同构契约。
  - 无输入型：符箓 `zhuyouCode`——原返回统计对象（同上会抛错），改为只承载「回到这一页」。
- **B-P2-03 塔罗牌局接码（新旧双轨）**：新塔罗 `state.drawn` 是牌 id 字符串数组，旧卡牌码用数字 `cardIndex`。新增 `tarotCodeInfo()` / `restoreTarot()` 做互转，导出 `isTarotDeck()`；`openByCode` 的 cards 分支按 `deckId` 分双轨——带 deckId 走塔罗视图，否则走旧 `restoreCards`（老码不失效）。
- **B-P2-02 塔罗复制文案出处**：原先 6 副牌组里 4 副被误标「韦特」、且硬编码 RWS 1909。新增 `DECK_SRC` + `deckSrc(id)`，按实际牌组给牌面出处（RWS 公有领域 / 索拉·布斯卡 1491 米兰 Brera 藏 / 四副历史牌组指向文件级溯源清单）。
- **工程债三清**：
  1. `manifest.webmanifest` 描述去「只排盘，不解卦」——早已是多术数工作台。
  2. vitest 原生环境补跑：`cards.test.ts` 两处 `toBeGreaterEqual` 笔误 → `toBeGreaterThanOrEqual`；`engine.ts` 的 `readingToText` 末尾补回边界提示语（保留断言意图）；`reading.test.ts` 按现行八域结构全量重写（用神取值放宽、典籍篇名按 `zengshan_buyi.json` 的 `chapters[].title` 查表硬校验、引文前 10/16 字须在章内命中）。**16 套件 209 测试全绿**。
  3. 玄空 golden 包重建（`@soul-atelier/xuankong@0.3.0` + `core@0.6.1`），**18/18 全绿**。
  4. 桩测链路修好（此前已断，跑出来的"全绿"是假象）：`_lnsrc/ln_stub_test/build.sh` 自 v120 删小雷诺曼后必然失败（仍在 bundle 已删除的 `js/lenormandview.js`，`set -e` 直接退出）；且 `node_modules/.bin/esbuild` 的 shim 内容就是裸相对路径 `../esbuild/bin/esbuild`，只在 `CWD=node_modules/.bin` 时解析得到，从仓库根调用必然 `No such file or directory`——**结果 bundle 一直没重建，冒烟测试跑的是旧产物**（"77 通过"实为假绿）。现改为：esbuild 可执行位自愈 `chmod` + 直接用平台原生二进制 `@esbuild/linux-x64/bin/esbuild`。另 `tarot_smoke.mjs` 里 v115 时代的「菜单含塔罗/雷诺曼切换」断言在 v120 后已失效，改为「菜单无分类条」。**重建 bundle 后真跑：塔罗冒烟 77/0、v111 桩测 40/0、sharecode v2 99/0。**
- **引文溯源修正（顺带清出的 4 条伪标）**：`《增删卜易·岁考章》` → 真实章名 `岁科考章`；`《增删卜易·全书通论》`（数据中不存在此章）→ 换为身命章真实原文；疾病章 / 延医章 / 出行章 3 条编者改写 → 逐条换回 `zengshan_buyi.json` 原文照录。**这 4 条改的是 `liuyao-core/src/annotations/reading.ts`，必须重建 vendor 才会在 app 里生效**（见下条）。
- **src/vendor 漂移修复 + 重建脚本（`tools/build-vendor.mjs`）**：
  1. 发现 `app/vendor/liuyao-core.js` 与 `liuyao-core/src/**` 早已漂移：vendor 里 `ANY_DIVINATION` 已是 v120 的 `["tarot","oracle"]`，而 `src/cards/spreads.ts` 仍含 `lenormand`——v120 只落了 bundle 没落源码，任何人按 AGENTS.md 重建都会把已删牌组带回来。已同步源码并留注释说明。
  2. 新增 `tools/build-vendor.mjs`：`node tools/build-vendor.mjs` 构建并写入，`--check` 只比对（退出码 1 = 需重建）。流程 = tsup 打 ESM 单 bundle → 裁剪 iztro **非中文** locale → 写入 `app/vendor/liuyao-core.js`。
  3. 裁剪规则：`zh-TW / en-US / ja-JP / ko-KR / vi-VN` 共 45 个 json 模块体清空为 `{}`（省约 33KB 离线体积）；**zh-CN 必须保留**——iztro 靠它把星曜/宫位/五行局 key 翻成中文，裁掉会让紫微页整页显示 key。脚本对 zh-CN 整块跳过，并断言裁剪块数 ≥40，防止构建产物结构变化后静默失效。
  4. 本次已用该脚本重建 vendor（2492785 字节），`--check` 与 `liuyao-core/src/**` 一致。
- **真机验收拦下的致命 bug（发版前堵住）**：首次真机加载时应用**完全不启动**——`js/yangzhai/yangzhaiview.js` 的 `yangzhaiCode`、`js/tibetview.js` 的 `tibetanCode` 各被声明了两次（补码时只在文件末尾追加了实现，没删旧的 `() => null` 占位）。ESM 的重复顶层声明是语法错误 → `main.js` 的静态 import 链整体解析失败 → main.js 一行都不执行 → 首页只剩空骨架、**Service Worker 也注册不上**。修复 = 删掉两行残留占位。
- **同时修掉一个验证工具假绿灯（教训）**：`tools/_bump_impl.py` 的语法自检原本对 `.js` 直接跑 `node --check`；而 Node 对 `.js`（无 `package.json` type=module）按 **CommonJS** 解析，**会放过 ESM 的重复顶层声明**——上面两处 bug 就是在"全量 node --check 通过"下静默进到磁盘的。现改为复制成临时 `.mjs` 再 check，强制 ESM 解析。**以后凡是用 node 校验 app 侧 ESM，一律走 `.mjs` 副本**。
- **怎么验**：
  1. `v91_src/check_sharecode_v2.mjs` 扩到 **99 断言全绿**：v2 往返、配置块、牌组 id、v1 向后兼容、篡改/截断/未知类型/v3 拒绝、15 类全类型冒烟、新增 7 类逐字段往返。
  2. `liuyao-core` vitest **16 套件 209 测试全绿**；`xuankong_tests` **18/18**。
  3. 全量 `node --check`（app/js + vendor + sw）通过。
  4. `node tools/build-vendor.mjs --check` → 一致 ✅（vendor 与 `liuyao-core/src/**` 无漂移）；用 node 直读 vendor 的 `listReadingDomains()`：38 条引文 0 条含 `岁考章`/`全书通论`，`life` 域含 `《增删卜易·身命章》`。
  5. ESM 语法 + 导入绑定静态校验：把每个 js 复制为 `.mjs` 后 `node --check`（**js 65 + vendor 4 + sw.js 共 70 个文件 0 失败**）；并静态校验所有 `import { … }` 的名字在目标模块确有导出（**171 条 import 语句 0 处不匹配**）——这两项专门拦「重复声明」「导入了不存在的名字」这类 `node --check` 假绿灯漏掉的错。
  6. 云浏览器真机实测（修掉致命 bug 后复跑，A–E 全通过）：干净加载（注销 SW + 清缓存 + 硬刷）后 `body.innerText.length=752`、console error=0、SW controller 非空、`caches=['qintian-v121']` 246 条含 `index.html`；逐页巡检 10 页（首页/阳宅/符箓/塔罗/地占/藏占/大六壬/小六壬/吠陀/六爻）均有内容、**0 error**；复现码真机往返 **8/8**（六爻 `QT1-IQFq3qYQAAIFegAAoQ` → 天山遁之天地否；塔罗 `QT1-JwFq3qvlCAADcndzAQMEABYBKAGv` → rws/three-time 且正逆位一致；大六壬/小六壬/地占/藏占/阳宅/符箓 逐字段一致）；真离线（CDP `Network.emulateNetworkConditions` offline，`onLine=false` 贯穿导航）硬刷后页面完整加载、**失败请求 0**；塔罗复制出处正确（韦特→RWS 1909 公有领域、索拉·布斯卡→1491 米兰 Brera 藏，未误标韦特）。截图 `/Coze/Drive/编程专家/browser/screenshots/qt-v121b/`。
  7. 真机复验（修完上面 3 处后重跑，A–F 全通过）：干净加载 `bodyLen=749`、SW controller 非空、`caches=['qintian-v121']`、console error=0；**阳宅首次进入 `#yz-panel` 长度 2858、坐向按钮 `[data-deg]` 32 个；二次、三次进入同样是 2858/32（修复前为 0/0）**；符箓码面板标题 `#cs-title` = `符箓 · 复现码`；阳宅还原后 `#yz-prev`/`#yz-next` 的 `display` 均为 `none`（修复前可见）；回归：六爻摇 6 轮成卦「离宫：风水涣」、首页 736、塔罗 9338、地占 30375，全程 0 error。截图 `/Coze/Drive/编程专家/browser/screenshots/qt-v121d/`。
- **导航备忘（真机验收踩到）**：阳宅/符箓等入口**不在首页**，在**起卦页** `#view-cast` 底部的 `.more-pan > #more-cards` 里（`[data-open="yangzhai"]` / `[data-open="zhuyou"]`）；进子视图后 tabbar 隐藏，用右下角 `#global-back` 返回，而它回的是**上一个主 tab**（`switchView(lastTab || 'home')`）而非首页——这是既有设计，非缺陷。
- **真机验收顺手清出的 3 处缺陷（已修）**：
  1. **阳宅「二次进入」面板空白**（既有缺陷，v120 同样存在，与 v121 改动无关）：`initYangzhai()` 以 `root.dataset.yzBound === '1'` 提前 return，而 `openSubview` 每次进入都 `b.innerHTML = renderYangzhai()`（只重置成空壳）+ `initYangzhai()` → 二次进入时 init 被跳过、面板再也不 refresh（实测 `#yz-panel` 长度 0、坐向按钮 0）。修法 = **监听仍只绑一次**（`#yangzhai-body` 是常驻节点，重复 `addEventListener` 会让处理函数叠加），但**每次进入都走 `goStep(S.step)`**。
  2. **阳宅还原后多出「上一步/下一步」**：`restoreYangzhai` 设 `S.step = 5` 但没走 `goStep(5)`，故结果页比正常流程多两个按钮。上面第 1 条的修法（进入时统一 `goStep(S.step)`）同时把它解决。
  3. **符箓复现码标题显示「盘 · 复现码」**：`js/cases.js` 的 `KINDS` 只列了 8 类，v121 补码的 7 类（大六壬/小六壬/地占/藏占/吠陀/阳宅/符箓）没有 label，`KIND_LABEL[kind] || '盘'` 回退成「盘」。已补齐到 15 类（案例库筛选 chip 也随之正确显示这 7 类）。
- **影响面**：复现码格式升级但向后兼容；7 类术数首次具备可复现能力；塔罗与旧卡牌双轨并存；`app/vendor/liuyao-core.js` 因引文修正 + 漂移修复而重建（体积 −35 字节，zh-CN locale 与全部排盘算法不变）；阳宅页二次进入恢复可用（此前必须整页刷新）；案例库种类标签补齐到 15 类；其余排盘逻辑零改动。

---

## v120 · 2026-10-26 · 删除小雷诺曼、塔罗页回归纯塔罗（去分类分流死代码）

- **背景**：主人定「雷诺曼删了，重构逻辑」。v115 把小雷诺曼并入塔罗页做「塔罗 / 雷诺曼」分类栏，属过渡形态；现整体撤下，代码回归纯塔罗，不留分类分流与悬挂引用。历史牌图与代码 git 可恢复。
- **删除（4 代码 + 2 资产目录，704K+16K）**：`js/lenormandview.js`、`js/lendata.js`、`js/lenicons.js`、`css/lenormand.css`；`assets/lenormand-gibson/`（Gibson 19 世纪版 36 图）、`assets/lenormand-historic/`（Hechtel 约1799 历史版）。均 `git rm`，历史可溯。
- **重构（去分类分流）**：
  1. `js/tarotview.js`：删 `import renderLenormand`、state.cat、`CAT_KEY/curCat()/catBarHTML()`、设置抽屉 `.trm-cat` 塔罗/雷诺曼切换块；`renderTarot()` 去掉 `curCat()==='lenormand'` 分流与 `catBarHTML()` 拼接，直接返回纯塔罗壳；`mountTarot()` 去掉 lenormand 提前 return；document 委托整块删除 data-tr-cat 分支（含 v119 落座补丁——分类既已不存在，补丁随之退场）。
  2. `js/main.js`：删雷诺曼 import/视图渲染分支/`copy-lenormand` 绑定/`safe('lenormand')` 初始化；`copy-tarot` 由 `curCat()?lenormand:tarot` 三元简化为直接 `tarotCopyText`。
  3. `index.html`：删 `lenormand.css` link；更新 view-tarot 注释。
  4. `css/tarot.css`：删 `.tr-catbar` 整块与 `.trm-cat` 三条；清理 2 处「雷诺曼」字样注释。**v119 的 `.trt-stagepos` pointer-events:none 与两按钮 auto 修复原样保留。**
  5. `js/homecards.js` 塔罗卡文案去「雷诺曼」（改为「韦特/索拉·布斯卡/马赛等历代牌组」）；`js/cardsview.js` 自由排阵 deckKinds 去 'lenormand'；`css/style.css` 牌背注释清理。
  6. `vendor/liuyao-core.js`：`ANY_DIVINATION` 由 `["tarot","lenormand","oracle"]` → `["tarot","oracle"]`（single/three-time/three-guidance 三万能牌阵经展开引用，一处改全覆盖；编辑后 node --check + 云浏览器实测兜底）。
  7. `sw.js`：手动删 ASSETS 4 条悬挂条目（lenormandview/lendata/lenicons/lenormand.css）；牌图本就懒加载不入 ASSETS。
- **怎么验**：
  1. 新增桩测 `v91_src/check_tarot_v120.mjs`（17 断言）：纯塔罗壳/无分类条/无雷诺曼字样、mountTarot 落座、不写 `qintian.cards.cat`、tarotview 与 main 零残留、v119 委托链与 pointer-events 修复不回归、CSS 已删 catbar/trm-cat、SW 无悬挂条目、vendor 去 lenormand —— **17/17 全绿**。
  2. 全量 `node --check`（js 55 个 + vendor + sw）全过；js/ 卫生闸无非 .js 文件；删后全仓 `grep -i lenormand`（限定 js/css/html）零命中。
  3. 云浏览器真机实测纯塔罗全流程（见下条实测记录）。
- **影响面**：小雷诺曼整套功能下线；塔罗牌桌与其他术数页行为不变。若日后要恢复，从 v119 tag 检出 4 文件 + 2 资产目录并还原分类分流即可。

---

## v119 · 2026-10-26 · 修塔罗三连点击硬 bug（切不回塔罗 / 全部翻开 / 开牌解局）

- **背景**：主人真机三连报：①塔罗牌桌 ☰ 切雷诺曼后，分类栏点「塔罗」回不去，只能回主页重进；②选完牌「全部翻开」按钮点了没反应；③「开牌解局」按钮同样哑火。实测后确认**三个症状是两个独立 bug**。
- **Bug A（切不回塔罗）根因**：分类切换的 document 委托（`tarotview.js` data-tr-cat 分支）只做 `body.innerHTML = renderTarot()`。切到雷诺曼时其自带完整 UI 与 document 委托所以能抽牌；但塔罗首屏依赖 `mountTarot()→enterTable()` 主动落座牌桌，重绘静态壳后**没人调 mountTarot**，只剩空 `#tr-result`，表现为白屏/回不去。v115「雷诺曼撤独立页并入塔罗分类栏」时漏了反向切换的落座。
- **Bug A 修法（1 行）**：切换处理里记下 `cat`，`if (cat === 'tarot') mountTarot();`——重绘壳后补落座。
- **Bug B（全部翻开/开牌解局/自动抽牌三按钮全哑火）根因**：牌桌 `.trt-stagepos` 是盖满全屏的手势透传层（`position:absolute;inset:0;z-index:6;pointer-events:none`，为让空白处触摸落到下层画布拖牌），而 `#trt-flipall`（全部翻开）、`#trt-read`（开牌解局）、`#trt-autodraw`（自动抽牌）三个按钮直接渲染在这层内，**自身没声明 pointer-events:auto**，点击全部穿透到画布，root 的 click 委托收不到 → 三个按钮形同摆设。v108 全屏牌桌改版引入，一直存在。
- **Bug B 修法（2 行 CSS）**：`.trt-flipallbtn{pointer-events:auto;…}`、`.trt-readbtn{pointer-events:auto;…}`；透传层本身保持 `pointer-events:none`（牌堆/扇面触摸逻辑不回归）。
- **怎么验**：
  1. 新增桩测 `v91_src/check_tarot_v119.mjs`（14 断言）：修复前 Bug A 断言先红（切回无 .tr-table），修复后 14/14 全绿；CSS 契约锁死「层 none / 两按钮 auto」+ 委托链完整。
  2. **云浏览器真机路径实测**（Chrome/146，390×844 移动视口，本地修复版 8919）：塔罗→☰→雷诺曼→分类栏切回，连测 3 次往返不白屏（eval 取证 `.tr-table` 在、cat=tarot、分类栏 on 态正确）；切 auto 抽法→金按钮探针 computedStyle `{layer:"none",btn:"auto"}`→点「自动抽牌」进翻牌幕（3 牌背+全部翻开）→点「全部翻开」自动跳解局页（圣杯十/太阳/权杖十 + 逐位牌义 + Waite 原判词 + 再抽一局），「再抽一局」可回桌；全程 console/page error 为 0。截图归档 `browser/screenshots/tarot-v119/01~07.png`。
  3. 手动模式「开牌解局」与「全部翻开」共用同一透传层根因与同一 CSS 修复，解局渲染函数在验收3全链路已覆盖。
- **影响面**：只动塔罗牌桌；雷诺曼视图、其他术数页零改动。

---

## v118 · 2026-10-25 · 修阳宅/玄空 24 山半度边界（B-P2-01，评审止血第⑤步）

- **背景**：审计 B-P2-01 + 评审《工程化整改基线》第 3 节点名的唯一真实计算红灯。24 山每山 15°，山 M[k] 中线 = 15k，分界点 b_k = 7.5+15k 位于山 k 与山 k+1 几何正中。两套 core 都用 `Math.floor((d+7.5)/15)%24`，导致**分界点被归到角度较大的下一山**，与项目自定金标准 `edge.mjs`（172.5° 必须=坐壬向丙）相反；352.5° 也错判成子（应壬）。
- **统一边界约定（先定约、再写测试、最后改算法，不许只改 floor 让单测变绿）**：山 M[k] 覆盖 `(15k-7.5, 15k+7.5]`，**分界点归角度较小的山 M[k]（含上界、不含下界）**。
- **改了什么**（最小面，只动取整一行 + 修正自相矛盾的注释）：
  1. `app/vendor/bazhai-core.js`、`app/vendor/xuankong-core.js` 两处 `mountainIndexAt`：
     `floor((d+7.5)/15)%24` → `((ceil((d-7.5)/15)%24)+24)%24`（环回归一，处理负数与浮点）。
  2. 新增 `yangzhai_tests/edge24.mjs`：24 分界点×(idx/朝/坐) + 24 中线 + 边界左右微扰 + 172.5/352.5 金标准 + 坐向对宫恒等(96点) + 全周 0.37° 细扫，**同时锁两套 core，共 298 断言**；修复前先红 148（且 148 条全是分界点本身，证明区间内本就正确、改动只翻边界格不平移整盘），修复后 298/298。
  3. 同步修正 `xuankong_tests/test_xuankong.mjs` 里按旧约定写的边界硬编码表与「187.5° 换丁山」断言，统一到新约定。
  4. 删除 v117 bump 残留的 0 字节垃圾 `app/js/sedNdYgMZ`（审计 B-P2-06）——本次发版**卫生闸首次实战拦截**，删后闸门全绿。
- **怎么验**：edge24 298/298、edge 金标准 12/12、test_yangzhai 视图全流程 PASS、test_xuankong 17 passed（唯一 fail 是 npm 金标准包 `@soul-atelier/xuankong@0.3.0` 未安装，与本次改动无关）；发版三闸门 + 卫生 + 语法全过（SW 248 资源 0 断链，版本号唯一 v118）；部署 Succeeded（deploy 7700616462452637731，commit 05f5eb89），线上 SW 核验 `qintian-v118`。
- **影响面**：仅当输入朝向恰好落在半度分界点（如 7.5/22.5/…/352.5）时山名变化；区间内（含中线）结果不变。阳宅坐山定宅卦、玄空起盘、金锁玉关在边界角度的断语会随之修正。

---



- **背景**：全站审计（报告 `钦天监全站审计_v115_20261025.md`）实锤的唯一 P1。v115/v116 两次全仓版本 bump 的 glob 只覆盖 `js/*.js` 顶层，漏掉 `js/yangzhai/`、`js/zhuyou/` 两个**子目录**；叠加 FUSE 云盘这些文件 mtime 为 epoch、`cat >`/sed 写回静默失败但脚本不判错，导致这 8 个文件**内部**的相对 import 仍指向 `?v=114`，而 SW 预缓存清单（正常更新）里只有对应文件的 `?v=116`。
- **影响**：在线网络优先可侥幸加载；一旦离线，阳宅（金锁玉关/玄空/三合）与符箓（金晶/十三科）两整页请求的 `?v=114` URL 在缓存中不存在 → import 链失败 → 整页不可用。这是纯本地 PWA 的核心承诺（离线可用）被破坏。
- **改了什么**：
  1. 用 Python（read→replace→fsync→读回断言，绕开 FUSE 静默失败）先把 8 文件内部 `v=114→v=116`，再把**全仓**（含 `js/**` 子目录、`vendor/**`、css、index、sw.js）`v=116→v=117`、SW 常量 `qintian-v116→qintian-v117`，共 48 文件；保证已缓存 v116 的老用户能真正刷新（否则 SW 命中旧缓存不重拉）。
  2. **固化发版三闸门**（新增 `tools/_bump_impl.py` + 重写 `tools/bump-version.sh` 封装，本脚本在 /tmp 副本上完成 4 个场景冒烟：正常放行、幽灵 import 阻断、垃圾文件阻断、语法自检）：
     - ① **写回读回断言**：每个文件改写后 fsync+读回，与内存比对；FUSE epoch 文件再静默失败会被捕获。
     - ② **旧版本号残留闸**：发版后全仓 `js/css/index.html` 不得有任何 `?v=旧` 或 `qintian-v旧` 残留，且 sw.js 的 CACHE 常量必须等于新版本，否则 `exit 1`。
     - ③ **模块图离线闸**：解析全部相对 `.js` 的静态/动态/副作用 import，断言其路径全部存在于 sw.js ASSETS 缓存键集合（v117 实测 248 资源 0 断链）。
     - 另含卫生闸（js/ 下非 .js 杂文件）+ 全量 `node --check` 语法自检。
  3. **配套 `.gitignore`**（为即将接入的 Git 基线做准备）：忽略 node_modules、dist、87M 古籍语料、25M 旧 zip、历史 `_src` 快照、桩测产物 bundle、sed 临时文件；入库约 90MB（源码+牌图+测试+文档）。
- **受影响 8 文件**：yangzhai 4（yangzhaiview / yangzhai-judge / yangzhai-xuankong / yangzhai-jinsuo）+ zhuyou 4（zhuyouview / zhuyou-data / zhuyou-data-jinjing / zhuyou-data-shisanke）。
- **根因（别再踩）**：①版本 bump 的文件枚举必须 `find js -name '*.js'` 递归，不能用 `js/*.js`；②FUSE 上批量改写后必须逐个读回断言，写命令返回成功不等于落盘；③发版脚本必须判旧版本号残留非 0 即 `exit 1`，不能只 echo 不退出。
- **怎么验**：桩测 77/0、47/0、40/0（重打三个 bundle）；**额外用 esbuild 单打 yangzhaiview（114KB）/zhuyouview（575KB）入口，两页完整 import 闭包解析成功**；全仓 grep 无 `v=11[0-6]` 残留；import 闭包 vs SW 清单 diff 为空。
- **审计同批 P2 未在本版处理**（按主人"先说明、等确认再改"边界）：阳宅 24 山半度边界取整（352.5° 应"壬/丙"实得"子/午"，唯一真实计算红灯）、新牌占无复现码/不进案例库、历史牌组复制文案误标"韦特"、新旧卡牌双轨。

---


## v116 · 2026-10-25 · 扇面选中改「半抽出定格」+ 修复 home 键与展牌钮重叠

- **改了什么**：
  1. **扇面选中牌由「整张贴出」改为「半抽出定格」**（占星猫式，主人对照参考图定调）：`.trf-item.is-pick` 的 `z-index` 由 25 改为 **0**（普通牌为 1），使选中牌沿自身轴向扇面外探（保持原 `--a` 角度、只 translateY 约 34px、scale 1.02）后，**牌身下半截被相邻牌盖住、底部仍埋在扇面里，只有上半截越过弧顶探出、倾斜独立**，定格在「已抽出、未翻面」状态；不再突然整张贴到扇面上方。
  2. **修复 home 键与右下「展牌形式」圆钮重叠**：v115 全局返回钮按 `bottom:78px` 避让，但漏算 `.tr-table` 自身 `bottom:calc(56px + safe-area)`——两钮实际投影重叠。新增 `.global-back.tarot-table{bottom:calc(126px + safe-area)}`，main.js 的 switchView 在 `name==='tarot'` 时给 home 键加 `tarot-table` 类；其他子视图仍用 78px。
- **根因**：①v115 的 is-pick 用高 z-index + 大位移，选中牌压在所有牌之上，视觉是"飘在牌堆上方"而非"夹在牌列里抽出一半"；半抽出的关键不是位移动画，而是**反转层叠关系让邻牌盖住牌身下半**。②全局返回钮定位只看了圆钮的 10px 底距，没算全屏牌桌相对视口又抬高的 56px。
- **怎么验**：桩测 77/0、47/0、40/0（无计算改动）；线上 SW=`qintian-v116`，`tarot.css` 含 `.trf-item.is-pick{z-index:0`，`style.css` 含 `.global-back.tarot-table{bottom:calc(126px...`，`main.js` 含 `tarot-table` 切换。
- **主人原话**："让牌还夹在原位，保留角度，不能让他突然出现在牌堆上面，还夹在原处。单张卡牌从扇形牌堆中向上突出、倾斜独立、底部与牌堆重叠，定格于已抽出但尚未翻面的状态。"；"home键有和切换重叠的情况"。

---

## v115 · 2026-10-25 · 塔罗整合 + 全局返回 + 展牌交互五项调整

- **改了什么**：
  1. **雷诺曼并入塔罗**：撤下独立 `view-lenormand` 页面与 PANES/openSubview 独立入口（雷诺曼本就通过塔罗页顶部分类栏 `塔罗｜雷诺曼` 内嵌完整牌桌，`lenormandview` 的 rerender 早按「写进当前可见容器 #tarot-body」实现三合一）。`copy-lenormand` 独立复制按钮随之撤下，`copy-tarot` 按 `curCat()` 分流复制文案；`initLenormand` 文档级委托保留（内嵌牌桌仍用）。
  2. **全局右下角返回主页悬浮按钮**：`#global-back`（小房子图标），四个主 tab 页隐藏、所有子视图/全屏牌桌显示；点击回上次主 tab。置于 `bottom:78px` 避让塔罗牌桌右下展牌圆钮（10px/48px）与底部安全区。
  3. **扇面点选不再大跳**：`pickLift` 由 18vh/上限 130px 收到 **7vh/上限 46px**，`scale(1.09)→1.05`，过渡更轻；**保持该牌在扇面中的原始 `--a` 角度**（CSS 本来就 `rotate(var(--a))`，抬起只改 translateY，不转正）。
  4. **撤下「拱桥」展牌式**：`LAYOUTS` 只剩 stack/fan，删除 bridge 渲染分支、`trg-*` CSS、`brShift` 状态与横拖逻辑；`curLayout()` 对旧 localStorage 存的 `bridge` 回落到 fan。
  5. **牌堆切牌动画**：点牌堆时新增 `.trt-cutfly` 飞行牌——顶牌抬起、越过牌堆划弧落到堆底（`@keyframes trt-cut` 460ms），480ms 后才轮转 `pickDeck`（首牌 push 到尾）并重绘；连点有 `cutting` 锁。
- **根因**：主人真机反馈——①雷诺曼占独立入口没必要，本就算塔罗牌组的一种；②看完牌义必须回左上角才能返回，单手操作太远；③v113 跳出幅度过大且观感像「换了个角度」；④拱桥式不想要；⑤切牌应有「一张牌从上面切到底下」的实感而非瞬间轮转。
- **怎么验**：桩测 **77/0**（塔罗，新增 3 条 v115 断言：拱桥撤下/切牌文案/pick-lift≤46px，删 1 条旧拱桥断言，75→77）、47/0（雷诺曼）、40/0（v111）；线上 SW=`qintian-v115`，`index` 含 `id="global-back"` 且无 `view-lenormand`，`tarot.css` 含 `trt-cutfly`、无 `trt-stage-bridge`，`tarotview.js` 无 `trg-rail`。
- **主人原话**："雷诺曼不单独跟塔罗分开，就算到塔罗里面"；"所有的页面在右下角增加一个返回按钮"；"跳出来的那张牌有点太过了……跳出来是哪个角度就给他那个角度，不要把它的角度统一"；"拱桥你把那个删了吧"；"切牌……一张牌从上面切到底下去，有这样一个动画的感觉"。

---

## v114 · 2026-10-25 · 塔罗扇面舞台全屏：牌悬空其上、不再被裁

- **改了什么**：按主人要求把扇面舞台改为**全屏透明舞台**——`.tr-table` 去掉 `overflow:hidden`，`.trt-stagepos` 改为占满整个牌桌（`inset:0`），`.trt-stage-fan` 改为 `absolute inset:0` 且 `overflow:visible`。扇面牌整体向上偏移 30px 给底部提示文字留空，点选跳出牌可飞到屏幕上半区而不被任何容器裁切。同时细化 pointer-events：舞台容器 `none`，只有 `.trf-item/.trt-stack/.trg-item` 等具体交互元素 `auto`，避免全屏舞台挡住上方槽位点击。
- **根因**：v112/v113 试图用动态高度 `R+牌高+余量` 解决顶部被裁，但 `.tr-table{overflow:hidden}` + `.trt-stage-fan{overflow:hidden}` 双重裁切仍导致扇面顶部牌背被截成直线；点选牌跳出距离受限于矮容器。
- **怎么验**：桩测 75/0（塔罗）、47/0（雷诺曼）、40/0（v111）；线上 SW=`qintian-v114`、`tarot.css?v=114` 含 `trt-stagepos inset:0/trt-stage-fan absolute inset:0/overflow:visible/trf-item bottom:30px`。
- **主人原话**："我说了，你把舞台做全屏，然后把这个牌整个放到舞台的上面。"

## v113 · 2026-10-25 · 塔罗扇面：点选明显跳出 + 牌面完整显示

- **改了什么**：①扇面点选牌由"微微探出 16px"改为**明显跳出扇面**（参考占星猫交互）：CSS 用 `--pick-lift` 动态抬起约 18vh/最大 130px，`z-index:25` 确保在最上层；互斥单选逻辑保持不变（`state.tablePick` 唯一）。②修复 v112 仍存在的**扇面顶部牌背被裁**：`.trt-stage-fan` 高度由固定 `2.5*牌宽` 改为按 `R + 牌高 + 24px` 动态计算，`overflow:hidden` 不再裁掉跳出的牌。③顺手修底部提示文字被右下角「扇面」切换按钮压住的问题（`.trt-stage-label` 右侧留 70px）。
- **根因**：`.trt-stage-fan` 高度不够 → 扇面半径 R 最大 `1.5*cw`、牌高约 `1.67*cw`，最高点 `≈3.17*cw`，原容器仅 `2.5*cw`；牌背上半段被 `overflow:hidden` 截断。
- **怎么验**：桩测 75/0（塔罗）、47/0（雷诺曼）、40/0（v111）；线上 SW=`qintian-v113`、`tarotview.js?v=113` 含 `pickLift/--fan-h/跳出扇面`、`tarot.css?v=113` 含 `pick-lift`。
- **主人原话**："就是这个牌透明的在上面，整个屏幕都是舞台，然后让这个牌在舞台上面透明悬空"、"点一下跳出来，再确认抽出，每次只能跳出一张，另一张收回去"。

## v112 · 2026-10-25 · 塔罗扇面顶部被裁初修

- **改了什么**：把 `.trt-stage-fan` 高度从固定 `2.5*牌宽` 改为按 `R + 牌高 + 余量` 动态计算（初版修复）。
- **遗留**：只修到"不裁"，但点选探出距离仍只有 16px，主人验收后要求参考占星猫改成明显跳出 → 在 v113 完整解决。

---

## v111 · 2026-10-25 · 地址中心 + 真太阳时绑地点 + 行星时择时 + 三维兜底

- **改了什么**（一次修完主人 15:00 汇总的 8 条）：
  ①**全盘地址**：新增 `app/js/geo.js`（唯一真相源，localStorage `qintian.place.v1`，src=default|locate|manual）、`app/js/placeui.js`（18 个盘面页顶栏注入"观测地"胶囊 + Promise 化选点弹层）、`app/js/citydata.js`（363 城离线库，拼音全拼/首字母/中文检索）；`solartime/globe/mansion/astromodes` 全部改走当前地点。②**真太阳时可关闭**，开启前必须先选观测地（`cast.js`）；起卦取"起卦当时定位"（`applyTstAt` + `refreshLocatedPlace`），排盘取定位或手选城市。③**小六壬坏页**修好（`xiaoliurenview.js` 缺 `return html`，页面直接吐字面量 `undefined`）。④**塔罗拖牌跟手**修好（`onMove` 的 pull 分支以前只改 `transform`，从不写 `left/top`，牌卡在按下点原地）。⑤**二十八宿**：3D 画布全黑根因＝`renderMansion` 重渲染用 innerHTML 冲掉 `#ms-globe3d` 宿主、而 `initMansion3D` 只 init 一次 → 改为宿主搬家（保留 WebGL 上下文）+ ResizeObserver + rAF 等可见；宿名加 `paint-order:stroke` 描边提升可读性。⑥**真星天球仪**：OBS 改当前地点、弱机降级（关抗锯齿/限像素比）、WebGL 失败与 `webglcontextlost/restored` 兜底文案、显示观测地。⑦**行星时升级为择时工具**：天象页新增"日期+时刻"选择器与 24 时昼夜对照表；**司日星修正**（行星日=日出到次日日出，原来"日落后夜时"错取前一天主）。⑧**占星城市表**接全量离线库（按省分组下拉）。
- **怎么验**：桩测三套全绿——塔罗 75/0、雷诺曼 47/0、**新增 v111 桩测 40/0**（`_lnsrc/ln_stub_test/v111_smoke.mjs`，含构建脚本 `build.sh`）；线上核验 SW=`qintian-v111`、全部 `?v=111`、新资源 200、`citydata.js` 363 条。
- **教训**：①同一文件**并行 edit_file 会互相覆盖**，改一处就要串行或一次写完；②整文件重写易打错天文常数（`2451545.0`/`0.0000754`/`60616000`），必须 `node --check` + 常数复核；③esbuild 不认 `?v=` query，桩测前要拷 /tmp 剥版本号（`build.sh` 已固化）；④子任务空跑不产文件时，**自己写数据**比等更靠谱（城市库用 pypinyin 生成 py/ini）。
- **主人原话**："全盘都是可以去选地址的……定位最方便，手动选择用拼音的方式"、"不要写死沈阳"（**本命出生地仍沈阳**）。

## v110 · 2026-10-25 · 塔罗牌桌：点选→探出→亲手拖放

- **改了什么**：扇面/拱桥/牌堆三种展牌统一改为"点一下只探出（`is-pick`）→ 手指拖到发光槽位（`is-near`）→ 松手才落位"；牌拖起时用 ghost 实时跟手；扇面几何重算（基角 0、±72°、`R=min(h*.24, cw*1.5)`）。
- **根因**：①扇面整扇跑到屏幕左下——CSS 基角误用 `-90°`，`rotate(-90deg) translateY(-R)` 实际是**向左平移 R**（v109 归因为"容器塌宽"是误判）；②"点牌即飞"——旧 `onUp` 中 tap 单张直接 `landFromTable()` 自动落槽。
- **怎么验**：桩测 75/0（塔罗）、47/0（雷诺曼）；线上核验 SW=v110、`tarotview.js?v=110` 含 `tablePick/is-pick/is-near`、旧 `-90` 与 `landFromTable(wasPidx` 计数为 0。
- **主人原话（交互铁律）**："点它一下，它直接就飞出去，不是这样的。它应该是探出来……然后我亲自动手，用手指头把它挪到我需要它放到的位置。"
- **铁律**：**严禁点牌即飞**；占卜仪式每一步由用户亲手完成。

## v109 · 2026-10-25 · 塔罗牌桌：进塔罗即落座、☰ 设置抽屉

- **改了什么**：进入塔罗直接进入牌桌；新增 ☰ 设置抽屉（布局切换等）。
- **遗留**：扇面圆心问题当时判断为"flex 舞台容器宽度塌成 0"，改造未解决 → 真根因在 v110 修正。**教训：几何问题先算清变换链再改，别靠猜。**

## v108 · 2026-10-25 · 三式展牌 + 九牌阵

- **改了什么**：塔罗牌桌支持扇形 / 拱形 / 牌堆三种展牌；牌阵扩到九阵（数据驱动，见 `liuyao-core/src/cards/spreads.ts`）。
- **意义**："新增牌阵只加数据不改引擎"是协作基因 §3-3 的首个落地。

## v107 · 2026-10-25 · 十三件事补齐（见记忆）

- 详见 `recent_memory/project/命理v108三式展牌与九牌阵.md` 与 `MEMORY.md` 核心状态锚点。
