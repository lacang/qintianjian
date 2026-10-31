# 版本日志（CHANGELOG）

> 用途：**换模型、换 Agent、换人时靠它复盘**——每一版"改了什么、为什么这么改（根因）、怎么验"。
> 维护：每次发版补一节；纯修复也要记根因（同一坑别踩第二次）。
> v107 以前的记录在记忆 `recent_memory/project/` 与旧会话里，本文件从 v108 起。

---

## v122 · 2026-10-31 · 月破旺衰基线定案 + 六合六冲名单修正 + 归魂位序修复（已上线）

- **改了什么**（四个 commit，共 177 文件）：① `167f9e7` L0 排盘事实修复——删除 `GUI_HUN_OVERRIDE`（雷火丰不再被强行标为坎宫归魂，归魂只认 `guaXu === 8`）、修正 `paipan.ts` 纳甲阴阳位序（`bits[i % 3]` → `bits[2 - (i % 3)]`，BAGUA_BITS 是 top-to-bottom 而 yaoList 是 bottom-to-top，缺陷只在兑/震/巽/艮 四宫八纯首卦暴露）、同步 golden 断言；② `c0103ee` L1 规则修正——六冲名单补「天雷无妄·雷天大壮」，六合名单由 8 卦改为正确 8 卦（地雷复/地天泰/雷地豫/水泽节/泽水困/山火贲/火山旅/天地否），行人域六冲文案加「须结合用神旺衰与其他判据，不宜单独据此断定归期」；③ `1a1a8d8` 方案 A——月破不再改写本判旺衰，`riPo` 由 `(死||囚)` 扩为 `!(旺||相)`（休态自 2026-10-28 董事长裁决归入日破），移除「日冲（休态，暗动/日破待定）」标签，源码+vendor+测试同一 commit；④ `3ca1cab` 工程化、AI 资料包基线与六爻审计证据归档（168 文件）。
- **根因**：① 归魂判定被一个人工覆盖集污染，导致标签与世位自相矛盾（雷火丰既「坎宫归魂」又「世五应二」）；纳甲位序把卦象字节序当成爻序，回文卦（乾离坎坤）碰巧正确所以长期未被发现。② 六合六冲名单凭印象手写，与纳甲世应规则推导结果不一致。③ 月建之「破」是功能性失效（《增删卜易·月建章》「爻逢月破而无功」），不等于旺衰状态改变；旺衰仍依月令五行关系判定（《占病章》「值月破须看用神之衰旺，旺则愈于实破之日及出月而愈」），月破由 verdict 的 yuepo 规则单独计分。
- **口径（必须照此引用）**：v121 主干**原本就没有** `lingTaiEff` 压旺逻辑，方案 A 的落地形式是「确认不引入」而非「删除已有」；A1（注入 `yuePo && lingTai==='旺' → '休'`）是审计构造的**假设对照版本**，从未入库。本轮实际改变运行时行为的只有**休态日破**及名单等已批准修复。687 = 654（名单修正及其他已批准修复）+ 33（休态日破），口径＝**指定版本基线下的吉→凶档位变化数**，不是用户数、不是独立卦例数。固定表述：方案 A 本身没有贡献新增的档位变化；其价值在于阻止假设性压旺规则进入主干，避免由此产生额外的误判。
- **验证**：`bash tools/test-core.sh` 225/225（17 文件）；`bash tools/gates.sh` 14/14（39s）；vendor `--check` 逐字节一致（2,493,169 字节，sha256 `406a073d…`）；`bash tools/release.sh 121 122` 起点/终点门禁全过；`bash tools/deploy.sh` 门禁全过 → deploy_history_id `7702498319854993471` → Succeeded；两站 curl 独立核验 `?v=122` / `qintian-v122`。验收记录见 `tools/score-verify-v2/l1-review/ACCEPTANCE-v122.txt`（含六条规则迭代标准 + 一项独立权限边界）。

## 观心第五轮 · 主题标签正式接入 + 三条约束变成校验 · 2026-10-31 · **未发版、未 commit、未 push、未部署**

> 董事长 2026-10-31 12:27 正式判定观心 P0 产品体验验收通过，并批准标签候选版 v0.2 转正：「批准将 v0.2 转为正式标签数据。但保留三条约束：1. 标签允许交叉，不强制每条思想只属于一个主题。2. 标签相同不自动产生思想关系。3. 跨经典标签可以提前建立，但没有真实内容时不得显示虚假的推荐。」边界照旧：v122、不 bump、不 commit、不 push、不部署。

- **改了什么**：① 新建 `_build/topics.json` v1.0（`status=approved`、`approved_by`、三条 constraints 原样入档、`future_classics` 只留在源文件），v0.2 候选版归档到 `_build/archive/topics-candidate-v0.2.json`；② `_build/export_web.py` 接入——先校验 `status=approved`（否则 `SystemExit`，未批准的版本进不了产品数据），再校验 id/名唯一、节点存在、覆盖全量、单节点 ≤4，**产品 payload 只保留 `{id,name,nodes,basis,boundary}`，`future_classics` 一律不导出**，最后反推 `thought.topics`；③ `classic-schema.js` 标签校验全面加强（含「标签不得成为关系依据」的结构性断言）；④ `check-topics-candidate.mjs` → `check-topics.mjs` 整篇重写为 32 项；⑤ `gates.sh` 4c 步改名并改写注释；⑥ `classic-core.js` 主题入口 label「主题推荐」→「同一主题」（与 `KIND_LABEL.topic` 同名会渲染成「主题推荐主题推荐」）。
- **根因**：三条约束如果只写在批示里、靠人记，下一次改代码就可能破。所以三条约束全部下沉成**机器能红的东西**：约束①→ 只校验「有归属」不校验「唯一归属」；约束②→ schema 断言 `relation_basis ∈ {canon, commentary, editorial}` 且**标签 id 不得出现在任何关系边两端**；约束③→ 生成阶段就把 `future_classics` 挡在产品数据之外，推荐只能从 `topics[].nodes`（本经典真实节点）里取。**「人性」当前《论语》内只有 LY-026 一条，推荐入口为空是正确结果**——宁可空，不拿《孟子》《荀子》的意向去填。
- **验证**：`test-classic.mjs` **76 项**（新增 9b 节 14 项标签断言，并把「未入库时推荐必须为空」的反向断言改成「入库后推荐必须有据」）；`test-classic-ui.mjs` **68 项**（孤立节点主题断言改为锚 `data-kind` 结构，并新增「★主题推荐区一个关系徽标都不许有」）；`check-topics.mjs` **32 项**；`bash tools/gates.sh` **17/17** 全绿（52s）。导出结果 131.2 KB：思想 26 / 纠错 9 / 群 9 / 关系 25 / 抽签池 18 / 辩题 8 / 主题标签 17。两条最有信息量的断言：**存在「同标签但无关系」的节点对**（LY-006 与 LY-013 同属「人生志向」，无边）、**存在「有关系但标签零交集」的节点对**（R-14 两端 LY-020/LY-011）——这两条同时成立，才证明标签与关系是两个正交维度，不是换个说法的同一件事。
- **踩到的坑**：① 入口名字重复——topic entry 的 label 与 `KIND_LABEL.topic` 都是「主题推荐」，页面上渲染成「主题推荐主题推荐」，改 label 为「同一主题」并注明「名字重复比多改一个词更伤可读性」；② **验收截图截错了视图**——`renderClassicDetail('LY-013')` 只往 `#classic-detail-body` 注入 HTML，渲染函数确实跑到了，但视图没切过去，截出来 1479px 长图全是问心面板，孤立节点根本没出现在画面里。改为走真实入口（探索面板 → 点 `.cl-node[data-act="open"][data-id="LY-013"]`）才截对。**教训：验收要验用户走的那条路，不是验函数被调用过。**

## 观心（《论语》）接入 · 2026-10-31 · **未发版、未 commit、未 push、未部署**

> 依据《论语》内容库与产品化建设综合批示执行。批示原文：「本批示授权开始本地产品开发和必要的局部验证，不授权 Git commit、push、GitHub Pages 发布或 Coze 正式部署。」故 app 版本仍为 v122，改动只在工作区。

- **改了什么**：新增 PWA 第 2 个 tab「观心」，四个分段 + 原典详情八层。文件：`app/js/classic/{lunyu-data,classic-core,classicview}.js`、`app/css/classic.css`；`index.html` 加两个 section（`view-classic`、`view-classic-detail`）与 tab；`main.js` 接 `TAB_VIEWS`/`switchView`/事件；`sw.js` ASSETS 加 4 项。数据由内容库 `_build/export_web.py` 生成 `lunyu-data.js`，**不在前端手改**。
- **根因/要点**：① 「今日相遇」以日期为种子，同日恒定、跨日变化——既满足"每天一次相遇"的产品感，也不破坏本仓的确定性铁律；② 「问心」抽取种子只有「日期 + 当日序号」，`drawAsk()` **签名上就不接收问题文本**，从结构上杜绝"按问题挑答案"；③ 关系展示按 `display_class` 分层：`editorial_relation` 即使 `verified` 也必带「编辑阐释」标记（`must_label`），`rejected` 永不展示；④ 孤立节点用三入口回退，无标签交集时**如实说明未生成推荐，不补造**。
- **修的三处数据契约缺陷**（终审看清单看不出来，接入界面才暴露）：① `thought.relations` 索引缺 `display_class`/`must_label`/`relation_basis`/`approved_by`，导致详情页只能把所有 verified 边当原典关系；② `thought.clusters` 存的是建库早期 12 个分组词，与 9 个群名不同源，致「义利之辨」「人生与教育」两群为空、LY-019/LY-026 整条从探索页消失（改为由 `CLUSTERS.branches` 反推，加 assert 保证 26 节点全覆盖）；③ `meta` 仍写"未经人工终审，不得直接上线"，`counts.relations` 还按 27 计。
- **验证**：`bash tools/gates.sh` **16/16** 全绿（新增两步：`test-classic.mjs` 52 项纯函数断言、`test-classic-ui.mjs` 31 项真实点击断言）。关键断言：同一序号 + 两个完全不同的问题必须抽到同一条；探索页真的列出 26 节点 / 9 群 / 5 个「独立」；LY-001 详情不出现已删除关系的对端；`verify-browser` 巡检扩到 12 主视图 + 3 页复入（含观心与原典详情）。
- **踩到的坑**：① 门禁一度"假绿"——`verify-browser` 的 PAGES 没加新页，绿了但没测新模块，补页后才真验；② 探索页整页为空而正文长度断言仍通过，因为提示文字就有 60 字——**长度断言不能代替结构断言**，已改为断言节点数/群数；③ 断言用正文子串判断「主题推荐」时被新文案「跨主题的推荐」误命中，改为按入口名结构化判断。

## 观心第二轮 · 三种抽取拆开 + 内容包契约 + 辩一辩 + 标签候选 · 2026-10-31 · **未发版、未 commit、未 push、未部署**

> 依据董事长正式批示（P0/P1 原则通过）执行。批示原文：「当前所有工作继续留在工作区。不允许 commit、push、bump 版本号或部署。」app 版本仍 v122。

- **改了什么**：① **三种抽取拆成三种机制**——今日相遇＝年度洗牌 + 按年内日序取模（遍历）；问心＝当日洗牌队列 + 按序号取（队列）；一念三观＝打乱群序取三群、每群抽一条（分层）。② 新增 `classic-schema.js`（内容包契约：`REQUIRED_*`、`LAYER_KEYS`、`validateClassic`、`packCapabilities`）与 `classic-registry.js`（注册表，模块加载时校验，不合格抛错）。③ 新增**辩一辩**：`_build/debates.json` 8 条辩题 + 完整三段式交互。④ 问心新增**五种反馈**（认同/不认同/没看懂/想起自己的事/想继续了解）。⑤ 视图层重写为 5 面板 + 首页引导区 `cl-flow`。⑥ 新增**主题标签候选版**（18 标签，覆盖 26/26）与校验脚本。
- **根因**：① 原实现的 `drawDaily`/`drawAsk`/`drawThree` 都是 `pickIndex(不同种子前缀)`——**同一个随机函数换了三个标题**，批示点名要拆。真正的区别不在种子，而在各自具备单一随机函数给不出的结构性保证：遍历保证相邻两天不撞车、队列保证同日一轮内不重复、分层保证三条不同群。② 批示要求「不是只为《论语》做一套特殊页面」，所以先立契约再谈第二套经典；`registerClassic()` 在模块加载时校验，不合格就抛错而不是静默降级。③ 批示要求「不是让用户回答标准答案」——所以 `stanceOf()` 返回值里**没有** `correct` 字段，`canon_note`（原典实际说了什么）与辩题（你怎么做）严格分开。④ 批示要求「交互不能反过来影响这一次的抽取结果」——`feedbackEffect()` 的返回对象里**根本不存在** `redraw`/`resample`/`newSeed`/`seq`/`node`/`pick` 字段。不是承诺不重抽，是**没有重抽这个能力**。
- **修的两处数据缺陷（都在生成源头）**：① `build_nodes.py:34` LY-003「汉宋分歧」的 `positions` 第二个元素写成了字符串而非列表 → `(d.positions || []).join()` 直接 TypeError，**用户点开 LY-003 详情页会白屏**，而此前所有测试都没覆盖到这条。改为两元素列表，并新增 `_norm_positions()` 硬校验（list 照收、单字符串自动包裹、其余显式报错）。② `build_content.py:136-139` 往 `thought.relations` 里塞了 `type='corrects'` 的纠错边，这些边没有 `peer` 字段，`relationBadge()` 拿不到 `status`/`display_class` 会一路 fallthrough 到 `return { badge: '原典有据' }`——**一条 AI 初筛的纠错边被标成「原典有据」展示给用户，点进去还跳到 undefined**。删除该追加（纠错只登记在 `corrections` 字段），并在 `auditCoverage()` 加检查拒绝关系索引里出现 `corrects`。
- **验证**：`bash tools/gates.sh` **17/17** 全绿（新增「主题标签候选版合规」一步）。三组断言：`test-classic.mjs` 53 项（三种机制的结构性保证：连续 90 天相邻两天必不同、一年走遍全池、第 1 天与第 1+池大小 天相同、问心同日一轮内绝不重复、一念三观 20 个日期三条必来自三个不同群；`feedbackEffect` 逐字段断言无重抽能力；26 节点覆盖与八层构造）；`test-classic-ui.mjs` **57 项**真实点击（★点完全部五种反馈当前条目一次都没变；★未选立场时不展示注疏；★三张牌来自三个不同群；不判定立场对错；读完可改主意）；`check-topics-candidate.mjs` 11 项（18 标签在 15—25 区间、覆盖 26/26、每标签有 ≥40 字归属依据与边界、单条最多 4 个标签、★候选版未流入 `pack.topics`、关系边未携带标签字段）。
- **踩到的坑**：① **测试覆盖不到数据缺陷**——LY-003 的 `positions` 类型错误、纠错边混进关系索引，都是"界面一碰就崩/就错"的问题，但纯函数测试跑的是内存数据，只有真实点击才会暴露。结论：数据层的硬校验（`_norm_positions`、`auditCoverage`）比"把测试写全"更可靠，**能在生成源头拦住就别指望测试兜底**。② **文案改动打破基于文案的断言**——上一轮 1 项 UI 测试失败，原因只是我改了提示措辞。本轮新增断言全部改用结构选择器（`data-act`/`data-fb`/`data-id`/`data-layer`），不依赖中文文案。③ **preamble 与批示流程冲突**——初版辩题 preamble 写「先别急着看孔子怎么说」，但批示规定原文就是第一屏，改为「原文在上面。先别找解释，说说你自己会怎么做。」

## 观心第四轮 · 空问题守卫 + P0 体验记录 + 身份不明不推测 · 2026-10-31 · **未发版、未 commit、未 push、未部署**

> 依据董事长 2026-10-31「标签候选版 v0.2 通过、fallthrough 修复通过、四类入口通过；只剩真实产品体验验收」的裁决。董事长明确无法访问本机 localhost，因此本轮把「技术验收」与「产品体验验收」之间的缺口用**可审查的体验记录**补上。app 版本仍 v122。

- **改了什么**：
  ① **空问题守卫**（`classicview.js`）：空或纯空白点「静心一问」不再抽取，改为显示一行提示「还没写。先写一句此刻的事……如果只是想随便看看，去『今日相遇』——那里不问你任何事」，同时清掉上一次的结果卡；用户一开始写字，提示立刻撤掉（只改 DOM 不重绘，避免重建 textarea 丢输入）。`data-act="ask-again"` 同样加守卫。
  ② **新增 `tools/acceptance-classic.mjs`**：P0 体验记录生成器。真实浏览器 / 真实点击 / 真实 localStorage / 移动端 390×844@2x，走完问心、一念三观、辩一辩三个核心流程并逐步截图；主动制造异常状态（空输入、2000 字输入、坏 localStorage、跨日序号、不存在的 id、缺失与非法 `display_class`）；逐节点验证 26 个思想单元都能渲染八层且无空层。产物 `验收记录/观心P0体验-<时间>/`（21 张截图 + `report.md` + `report.json` + `nodes.json`）。**不做通过判定**——只记录实际观察到的行为，判断权留给董事长。
  ③ **产品铁律 11**（`AGENTS.md`）：未知身份不推测，缺失依据不展示，非法数据不进入用户视野。
  ④ 测试从 59 项扩到 65 项（空问题提示 / 不消耗当日序号 / 不残留结果卡 / 提示给出另一条路 / 写字即撤提示 / 纯空白按没写处理）。
- **根因**：问心的产品前提是「带着困惑遇见」。空着点也能抽，用户拿到的只是一条随机内容，与「今日相遇」再无区别——「相遇→投射→观照→探索→辩论」里的**投射**这一环就断了。这不是 bug，是产品骨架的缺口，只有真按用户路径点一遍才会暴露（纯函数测试和门禁都不会红，因为代码确实「正常工作」）。
- **验证**：`bash tools/gates.sh` 17/17；`test-classic.mjs` 59 项；`test-classic-ui.mjs` **65 项**；`check-topics-candidate.mjs` 16 项；`acceptance-classic.mjs` 产出 21 张截图 / 55 条观察项，无未捕获异常、无 console.error、无资源加载失败、26/26 节点八层齐全无空层。
- **踩到的坑**：
  ① **整页截图的假象**：直接用 `captureBeyondViewport + clip` 截长图，`position:fixed` 的底部导航会浮在长图正中间，看上去像页面被硬切断。把工具的伪影当成产品缺陷，是审查里最不该发生的事。修法：先把视口临时拉到整页高度让 fixed 元素自然落底，截完恢复。
  ② **验收脚本自己的判据错了一次**：第一版用「有没有结果卡」判断「是否抽取」，但空点击时旧结果卡还在，于是判成「抽了」。真相是守卫已生效、只是没清旧结果。查清后才意识到这本身就是体验缺陷（既显示提示又显示内容，用户会以为「不写也照样给」），于是顺手改成空点击清结果。
  ③ 记录脚本的 ✅/❌ 标记一度把「期望为 false 的项」标反，改成显式 `expect` 三态（真/假/不判），不判好坏的项统一标「·」。

## 观心第三轮 · 三项裁决落地 + 两条原则固定 + 展示层去兜底 · 2026-10-31 · **未发版、未 commit、未 push、未部署**

> 依据董事长 2026-10-31 三项标签裁决与两条设计原则批示。app 版本仍 v122。

- **改了什么**：① **标签候选版 18 → 17**——「处世」（3 条）与「人际关系」（3 条）按裁决合并为「处世」（6 条：LY-004/009/015/018/020/023）；「人性」独立保留，依据改写为「未来接《孟子》性善 /《荀子》性恶的跨经典长期主题」；「人生志向」与「自由与选择」都保留，边界补「标签允许交叉，关系不允许因此自动成立」。② **`relationBadge()` 去掉最后一处 fallthrough**——原实现 `display_class` 缺失或拼错时会一路落到 `return { badge: '原典有据' }`，现改为显式判断 `display_class === 'canon_relation'` 才给「原典有据」，其余一律返回 `ok:false`（被 `visibleRelations` 过滤，宁可看不见也不误标）。③ **`exploreEntries()` 给每个入口加 `kind`**（`cluster`/`chapter`/`topic`），与关系边的 `display_class`（`canon_relation`/`commentary_relation`/`editorial_relation`）互不借用名字；视图按 `kind` 输出 `data-kind` 与 `.cl-entry--*` 类，CSS 用左标区分三类非关系入口。④ `auditCoverage()` 新增检查：关系边必须有合法 `display_class`。⑤ 校验脚本 11 → 16 项，新增「两条设计原则在案」「P1 覆盖整个知识体系」「P2 写明四类入口」「四条数据纪律在案」。
- **根因**：① 批示裁决三项标签问题，其中「处世/人际关系」原分界（对世界的姿态 vs 对具体某人的准则）我自己也觉得不够硬，用户不会关心「和而不同」算哪边。② 批示原则二「宁可入口为空，也不编造关联」+ 四条数据纪律第 4 条「展示层不允许通过默认分支猜测内容身份」——上一轮已修了纠错边混入关系索引的源头，但 `relationBadge()` 的默认分支还在，等于同一个坑留了半扇门。③ 四类入口若只靠一句小字说明区分，样式和测试都没法可靠选中它们；性质必须写进结构。
- **验证**：`bash tools/gates.sh` **17/17** 全绿；`test-classic.mjs` **59 项**（新增：缺 `display_class` 不被展示、非法 `display_class` 不被展示、缺失/非法分类不会被误标「原典有据」、只有 `canon_relation`+`verified` 才给「原典有据」、无关系节点入口都带合法 `kind`、非关系入口不借用关系类名字）；`test-classic-ui.mjs` **59 项**（新增：每个入口带合法性质标识、性质标识数量与入口数量一致）；`check-topics-candidate.mjs` **16 项**。
- **踩到的坑**：改 entry 头部时把 `依据：${e.basis}` 换成了 `KIND_LABEL[e.kind]`，旧断言（找「依据：原典归类」）立刻红。**这已经是第三次因为改文案挂测试**——所以这次连断言一起改成锚 `data-kind` 结构，而不是再找新的中文措辞。教训固化：UI 断言只锚 `data-*` 与类名，不锚中文。

## 评分去重 V2 · 2026-10-27 · 已并入本地 main（`51bd404`），**未推送、未发版**，app 仍 v121

- **六爻评分三组重复计分修复**（已 `merge --no-ff` 并入本地 main，**未 push 远端、未部署**——`deploy-pages.yml` 会在 push main 时自动发布，故发布须单独审批）：① 用神持世时世爻侧月建旺衰不再重复计（原 235/236，保留用神侧 190/191/192）；② 爱情域仅在世应真共现相冲/相合时抑制本卦六冲/六合卦分（原 310/311，保留六合三例外「火地晋·山雷颐·地泽临」与 313/314 变卦走向）；③ 同一发动世爻既为用神时，变爻回头生克只计用神侧一次（原 237/238）。**验证**：`node tools/score-regression.mjs`（393,216 条逐盘对齐 + 结构断言 + mask322=0 平）PASS；`bash tools/gates.sh` 12/12 绿。**已知影响**：①② 组合在 love 域产生 71 例吉→凶，③ 产生 294 例凶→吉，完整清单与逐条复算见 `tools/score-verify-v2/output/07_提交B_③反转294例分析.md`、`08_提交A_①②组合71例吉凶反转说明.md`。**根因**：同一基础因素被两条规则各计一次（月令旺衰 / 世应合象 / 变爻回头生克），不是权重问题。

## 工程基线 · 2026-10-26 · 门禁体系落地（app 版本不变，仍 v121；v122 不加功能）

- **背景**：主人把 v121 定为工程质量基线，要求下一步不做功能，先补三个工程闭环，并明确「最看重的是第二项」——**测试本身可以是绿的，但测试对象可能根本不是最新代码**，所以"构建失败阻止发布"必须做成**自动化的失败注入测试**，而不是靠人记得检查。
- **唯一入口**（绕过就等于没有门禁）：`bash tools/gates.sh`（改代码后）→ `bash tools/release.sh <旧> <新>`（发版）→ `git push` → `bash tools/deploy.sh`（部署；门禁不过绝不部署、工作区脏拒绝部署）。
- **12 步门禁**：静态 ESM 模块图 → vendor 产物同步 → 真实浏览器逐页巡检 → SW 离线可用 → 桩测 bundle 重建 → 塔罗冒烟 → v111 桩测 → 复现码 e2e（含 v1 兼容）→ 塔罗数据 → 塔罗视图 → v119 → v120。`--quick`（1–3）/`--no-tests`（1–4）/`--expect-version NN`；`QT_GATE_REPORT` 输出 JSON 报告。健康基线 12/12 绿，17s。
- **门禁本身被测**：`node tools/test-gates.mjs` 对每道门禁**故意注入故障**并断言必须红，同时跑"无故障必须绿"对照组 → 11/11（A–K）。用例 A 现场打印 `node --check x.js`（假绿灯，rc=0）与 `node --check x.mjs`（rc=1）的对照证据。
- **真实浏览器门禁**（`tools/verify-browser.mjs`，v122 补丁后已升级为逐页巡检，见下）：无头 Chrome 加载首页，断言 `#home-sizhu` / `#now-gua-title` 由 JS 写入、DOM 非空、无未捕获异常 / 模块加载失败 / 资源 404、`?v=` 唯一且 = SW CACHE。故障注入实测能精确报出 `js-not-executed` + `home-not-rendered` + `console-SyntaxError`。
- **SW 离线门禁**（`tools/verify-offline.mjs`，零依赖 CDP 驱动）：在线预热 → 断言 SW `active` + `controller` + **缓存条目 ⊇ sw.js ASSETS 全集**（239 项）→ 断网（`socket.destroy`，不是 503）→ 断言服务端送出 0 文件、页面仍由 SW 接管、关键区块有真实内容。两阶段都带 `--disk-cache-size=1`，**压掉浏览器 HTTP 磁盘缓存，让"离线可用"只能归因于 SW**。
- **根因记录（踩过的坑，别踩第二次）**：①`spawnSync` 阻塞事件循环 → 同进程静态服务无法响应 Chrome → 假"超时"；②`--timeout=N` 本机 Chrome 不识别；③503 不能模拟断网（`networkFirst` 只在 fetch reject 时回退）；④停服务器后页面能打开，可能是 HTTP 磁盘缓存而非 SW（**假证据**）；⑤`controllerchange` 触发 `location.reload()`，中途读 DOM 会拿到"脚本没跑"的半成品。
- **门禁当场抓出两处历史欠账（正是主人担心的"测试假绿"）**：①`v91_src/check_tarot_view.mjs` 的桩测依赖清单硬编码，v99 引入 `tarotdeck-sb.js`/`tarotdeck-hist.js` 后它就已经测不到真实视图（v120 删小雷诺曼后更是直接 `ERR_MODULE_NOT_FOUND`）；②它的断言还停留在 v92 菜单页架构，v109 全屏牌桌重构后全部过时。**已按模块自身 import 清单自动推导依赖 + 按牌桌架构重写断言（47 条），并补上"桩的 `innerHTML` 要模拟真实 DOM 替换"这条坑**（否则 `bindTable` 委托累积，同一按钮被处理两次而崩）。
- **发布记录**：`releases/vNNN.json`（`tools/release-record.mjs`）——提交哈希 / 门禁逐步结果 / 部署单号 / 线上地址 / 备注。已补记 `releases/v121.json`（含"该记录由 v122 工程闭环补记，记录的是用当前全套门禁对 5552f09 代码的复验结果"这条诚实标注）。
- **线上核验加固（`tools/deploy.sh` 第 5 节重写）**：原先用 `curl "$base/sw.js?qt=$RANDOM"` 只比版本号，实测在 coze.site 上**带 cache-buster / `no-cache` 头约一半概率挂 22.6s**（`http=000`），会得到假失败。改为**普通 GET + 最多 6 次重试 + `sha256` 内容比对**：远端 `sw.js` 字节必须等于本地 `app/sw.js`（版本号对但内容旧也算失败），再核 `index.html` 的 `?v=`；任一站点 mismatch 硬失败、两站都读不到也硬失败（"本次没有任何线上证据"）、只有单站读不到才降级为 ⚠️。新增 `--verify-only` 模式（不跑门禁、不部署、不要求工作区干净），可单独回答"线上到底是哪一版"。**实测两站线上 `sw.js` 与本地字节一致、`?v=121` 一致**（报告见 `releases/v121.json` 的 `deploy.remote_check`）。
- **真实浏览器门禁升级为「逐页巡检」（2026-10-26 补）**：原来只巡首页，盲区很实——首页正常不代表阳宅页正常，`check-modules` 通过不代表塔罗页能初始化。改为**单实例 + 单套产物**逐页进入 10 个主视图（首页/阳宅/符箓/塔罗/地占/藏占/大六壬/小六壬/吠陀/六爻排盘）+ 2 页二次进入（阳宅、塔罗，对应 v121 阳宅空白与 v109 牌桌重构），每页五项断言：`page-not-active`（视图没切过去）/ `page-not-rendered`（关键容器字数低于下限）/ `page-exception`（未捕获异常）/ `page-console-error` / `page-resource-failed`，失败时直接点名"哪一页、哪项检查"。`min` 阈值按实测值留余量校准（如塔罗 94 字→40、符箓 100653 字→20000），目的是区分"渲染函数真跑了"与"只渲染出空壳"，不是卡字数。总耗时约 7s（首页 1.1s + 10 页 3.2s + 复入 0.5s + 浏览器启动），比原单页方案多约 6s，换来 9 个页面的覆盖。
- **逐页巡检踩到的假红（根因值得记）**：首版跑 10 页时符箓页随机报 `no-card`，重跑失败页会变。探针发现点击后 `#more-cards` 短暂为空、400ms 后又恢复 16 张 —— 首次访问会走 SW `install → activate → claim → controllerchange → location.reload()`，巡检恰好撞上这次 reload 就读到刚解析的空壳 DOM。**修法**：`goto` 之后先 `waitFor(navigator.serviceWorker.controller 非空, 12s)` 再取 DOM（controller 非空即代表 reload 之后那次加载），点击类操作再加 3×400ms 重试。**这与 v121 时期"CDP 断言要等渲染稳定"是同一类坑**：门禁自己抖了，不能当成产品坏了。
- **门禁自测补用例 K（11/11）**：原来 10 个用例都是"整站级"故障（模块图断、语法错、版本不符），**没有一条证明"只坏一个页面时门禁会红"**。新增 K：注入让 `renderTarot()` 返回空壳（语法正确、静态检查全绿、首页正常），断言 `verify-browser` 必红、报错类型为 `[FAIL:page-not-rendered]`、且报错文本**点名到"塔罗"**、其余 9 页不连带误报。实测 12.8s（故障注入下每页会等满 `--page-timeout 3` 才判失败，正常路径不受影响）。
- **桩测资产归属澄清（第 2 项核实结论：`.gitignore` 不用改）**：核查发现 `.gitignore` 早已用 `!` 白名单放行了手写测试——`tarot_smoke.mjs`、`v111_smoke.mjs`、`v111_entry.js`、`build.sh` 都在版本库里（`git ls-files _lnsrc/ln_stub_test/` 可验证）；被忽略的只是 esbuild **产物** `tarot_bundle.mjs` / `v111_bundle.mjs`（1.9MB + 2.8MB），它们由 `app/js/**` 打包生成、每次改 app 都变，进版本库只会制造无意义 diff。实跑 `bash build.sh` + 两个冒烟（77 + 40 断言）全通过，证明换设备后"先跑 build.sh 重建"即可，不存在测试资产丢失。**原先 `AGENTS.md` §5.3 说"手写测试改动不会进版本库"是错的，已修正**。
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
