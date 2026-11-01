# 《论语》内容库数据结构说明 v0.1

> 本文件描述 `data/` 下各 JSON 的结构、字段含义与使用约束。目标读者：后续接入钦天监的开发者、以及需要审核内容的人工审校。

## 一、文件清单

| 文件 | 用途 | 是否给产品调用 |
|---|---|---|
| `data/lunyu-content.json` | 总包：meta + 思想群 + 关系 + 思想节点 + 纠错节点 + 三入口配置 | 是（唯一入口） |
| `data/lunyu-thoughts.json` | 26 个思想节点（分片） | 否，供审校 |
| `data/lunyu-network.json` | 思想群 + 关系边（分片） | 否，供审校 |
| `data/lunyu-corrections.json` | 9 条误读纠错节点（分片） | 否，供审校 |
| `data/evidence/sources.json` | **证据层**：全部 40 条原始链接及归属 | 否 |
| `data/evidence/claims-audit.json` | **结论层**：关键论断的溯源审计（含三个数字的核验结果） | 否 |

分片文件与总包内容一致，改数据时应以总包为准，分片由脚本重新生成，不要手工双写。

## 二、两类节点

### 2.1 `thought`（思想单元，26 条）

一个相对完整的思想表达，不是单句。字段：

| 字段 | 说明 |
|---|---|
| `id` | `LY-001` ~ `LY-026` |
| `title` | 短标题，用于随机卡片 |
| `full_title` | 带解释的完整标题 |
| `original` | 原文（可含多个出处，用空行分隔） |
| `location` / `location_text` | 篇章定位，结构化 + 文本双份 |
| `context` | **原典上下文五要素**，见下 |
| `idea` | 独立思想表达（这一条到底在说什么） |
| `commentaries` | 历代注家：`author` / `work` / `text` |
| `disputes` | 学术分歧：`topic` + `positions[]`（**并列呈现，不合成**） |
| `evidence` | 四维来源证据：`popular` / `academic` / `commentary` / `modern`，各含 `text` + `urls[]` |
| `ratings` | 七项交叉评价（**研究判断，非计量结果**） |
| `verify` | 原典核验状态 |
| `clusters` | 所属思想群名称 |
| `tags` | 检索标签 |
| `evidence_quality` | `strong` / `medium` / `weak` |
| `supplement` | 本次补充核验的证据（仅 6 条原研究缺来源的条目有） |
| `relations` | 与该节点相关的全部关系（正向 + 反向） |
| `corrections` | 指向该节点的纠错条目 id（如有） |

### 2.2 `correction`（误读纠错，9 条）

| 字段 | 说明 |
|---|---|
| `id` | `COR-001` ~ `COR-009` |
| `title` | 被误读的说法 |
| `original` | 原文（含语境） |
| `location` | 出处 |
| `popular` | **现代流行说法** |
| `diff_type` | 差异性质：严重误读 / 语义改写 / 褒贬颠倒 / 断章取义 / 词义误读 / 句读争议 |
| `diff_detail` | 差异到底在哪 |
| `commentary_note` / `commentary_status` | 历代解释 + **该解释本身的核验状态**（防止用未核实的注文当论据） |
| `modern_debate` | 现代争议（无则 null） |
| `related_thought` | 关联的思想节点 id |
| `soft_related` | 弱关联（无直接对应思想节点时） |
| `relation` | `corrects`（纠错）/ `disputed`（争议，需并列呈现） |
| `risk` | `high` / `medium` |
| `sources` | 来源链接 |

## 三、原典上下文五要素（`context`）

这是本库与「名句库」的根本区别。**五项缺一不可**，缺任一项产品上应提示「上下文不完整」，不得硬编：

| 字段 | 问的问题 |
|---|---|
| `speaker` | 谁说的？（孔子 / 有子 / 曾子 / 子夏 / 提问者） |
| `interlocutor` | 对谁说的？谁在问？ |
| `occasion` | 当时在讨论什么？ |
| `before` | 前一章是什么？ |
| `after` | 后一章是什么？ |

`after` 为「（本篇末章，无后文）」是合法值，表示确实没有后文，不是缺失。

## 四、关系类型（`relations`）

| type | 含义 | 用法 |
|---|---|---|
| `complement` | 互补 | 两面合成一个完整原则（忠/恕） |
| `extends` | 延伸 | 前者是原则，后者是展开 |
| `same_theme` | 同主题 | 讲同一件事的不同侧面 |
| `contrast` | 张力 | 两条并存但存在真实紧张，不调和 |
| `belongs` | 归属 | 前者是后者的方法/分支 |
| `corrects` | 纠错 | correction → thought |

### 4.1 状态三值（`status`）

原设计用 `confirmed` 布尔，2026-10-31 改为三值。**推荐关系不得写成思想史事实。**

| status | 数量 | 产品表现 | 措辞要求 |
|---|---|---|---|
| `verified` | 4 | 可作确定关系展示 | 陈述句 |
| `pending` | 12 | 只能作探索推荐 | 必须带「待考」标记，疑问或并列 |
| `rejected` | 9 | 不展示 | **不物理删除**，保留审校记录，供追溯「我们曾提出什么、为什么否定」 |

`rejected` 必须保留。价值在于防止下一轮研究重新提出同一条错误关系。

**注意：`verified` 只表示「这条关系可以展示」，不表示「这是原典关系」。** 4 条已核实里只有 R-01 的依据是注疏明文，其余 3 条（R-10、R-11、R-14）是经人工批准的编辑比较。下游模块必须读 `display_class`，不能只读 `status`。

### 4.2 三层分离：原典事实 / 注疏解释 / 编辑判断

一条关系涉及两层依据，必须分开记，否则会把现代阐释伪装成原典事实。

| 字段 | 回答的问题 | 取值 |
|---|---|---|
| `fact_basis` | **这两句话本身**出自哪里？ | `canon` 原典直证 / `canon+commentary` / `commentary` 注疏 |
| `relation_basis` | **把两者连起来**这件事，依据是什么？ | `canon` 原典自带判语 / `commentary` 注家明确合观 / `editorial` 编辑阐释 |

当前分布：原典事实层 canon 24、canon+commentary 1；关系层 canon 5、commentary 1、**editorial 19**。

**原典自带判语，不等于原典自带关系。** 例如《雍也》30 确实有「可谓仁之方也已」，但它是给「己欲立而立人」一段下的判语，不代表原典建立了这一段与《颜渊》1「克己复礼」的关系。这两件事必须分开，否则会把「原文说了 X」偷换成「原文建立了 X 与 Y 的关系」。R-02、R-03 就是按这条标准从已核实降为待核实的。

**硬约束：`relation_basis == 'editorial'` 时默认不得 `verified`。** 人工批准者必须同时具备 `approved_by` 与 `review_note`（写明展示措辞），且产品上必须标明「这是阐释，不是原典事实」。`validate.py` 强制检查，缺任一即报错。

**人工批准只能批准一种编辑展示方式，不能把编辑推断变成原典事实。** 目前人工批准 3 条：**R-10 以人为镜的两种说法**、**R-11 自省的两条路径**、**R-14 仁爱与正直回应之间的边界**（均 2026-10-31 董事长批准）。三条都保留 `relation_basis = editorial`，`must_label = true`，展示时必须出现「编辑阐释」标记。

### 4.3 互补与对照的区别（不得混用）

- **`complement` 互补**：两条思想之间存在**可以说明的共同结构**，合起来构成一个更完整的命题（如忠/恕合成忠恕之道）。
- **`contrast` 对照**：两条思想**值得放在一起比较**，但**不意味着表达同一个意思**（如两处「和」语境不同）。

用 `complement` 必须有共同结构可指认；指不出就降为 `contrast`，或判 `rejected`。

### 4.4 展示类别（`display_class` / `must_label`）

为防止下游模块因 `status == verified` 就把编辑阐释当作原典关系，每条边额外带两个派生字段：

| display_class | 数量 | 含义 | 展示要求 |
|---|---|---|---|
| `canon_relation` | 5 | 原典自带判语 | 可直接作事实陈述 |
| `commentary_relation` | 1 | 注家明确合观 | 须注明注家与注文 |
| `editorial_relation` | 19 | 编辑阐释 | **`must_label = true`，必须显示「编辑阐释」标记** |

`must_label` 为 true 时，无论 `status` 是什么，产品都不得把它呈现为原典关系。

### 4.5 字段

`id` / `from` / `to` / `type` / `label` / `fact_basis` / `relation_basis` / `display_class` / `must_label` / `status` / `basis`（文本依据，必填）/ `review_note`（判定理由与存疑点）/ `approved_by` / `decided` / `reviewed_at`。

## 五、思想群（`clusters`）

9 个群：忠恕、仁、君子人格、义利之辨、学习、修身、处世、政治、人生与教育。

结构（以忠恕为例，即董事长给的结构）：

```
忠恕（name）
├─ LY-004 己所不欲，勿施于人 —— 推己及人（恕·消极面）
└─ LY-015 己欲立而立人，己欲达而达人 —— 积极成就他人（忠·积极面）
        ↓ converge
     人际关系
```

字段：`branches[]`（分支，指向节点）+ `converge`（汇聚点）。`converge` 不是节点，是「这一群共同指向什么」的一句话，用于抽到任一条后提示「还可以走向哪」。

## 六、三个阅读入口（`entrypoints`）

| 入口 | 取什么字段 | 约束 |
|---|---|---|
| `random_encounter` 随机遇见 | `title` / `original` / `idea` / `location_text` | 只在 `draw_suitability == '适合'` 的 **18 条**中抽 |
| `understand_original` 理解原典 | `context` 五要素 + `commentaries` + `disputes` + `supplement` | 五项缺一即提示不完整 |
| `explore_relations` 探索关联 | `relations` + `clusters` | `verified` 作事实陈述；`pending` 带「待考」标记作推荐；`rejected` 不展示 |

`draw_suitability` 三值：`适合` 18 条、`需要上下文` 8 条、`不适合` 0 条。取值为「需要上下文」的条目不能单独抽，必须先展开上下文。

## 七、使用约束（写进产品逻辑，不是建议）

1. **`ratings` 是研究判断，不是客观排名。** 未系统使用知网/万方计量，「高/中/低」不得用于排序、推荐权重或对外宣传。产品 UI 上不要把它显示成客观评级。
2. **`evidence_quality` 三级必须可见。** `medium` 的 21 条中，有 6 条（LY-014/016/021/023/024/026）原研究缺来源，本次只补了注疏维度，大众传播与学术研究维度仍是概括判断。审校时优先看这 6 条。
3. **`disputes` 必须并列。** 不得由 AI 选一个答案。有分歧的 17 条，产品上应显示「存在不同解释」，并列出各家。
4. **`pending` 边不得写成事实。** 12 条待核实边的关系层依据全部是编辑阐释，产品上必须带「待考」措辞。`relation_basis == editorial` 默认不得 `verified`，人工批准者须有 `approved_by` 与展示措辞，`validate.py` 已强制。
5. **人工批准的编辑阐释必须标明层次。** 当前 3 条（R-10、R-11、R-14）。展示时应先说原典事实（孔子说过什么），再说编辑阐释（这两句构成什么关系），不得把后者说成前者。
6. **`verified` 不等于原典关系。** 下游模块必须读 `display_class` 与 `must_label`，不得只读 `status`。
7. **探索关联不等于关系网络跳转。** 5 个节点（LY-013、LY-014、LY-016、LY-019、LY-026）没有可靠关系边，不得编造关系补全，改用 `entrypoints.explore_relations.orphan_fallback` 的三个入口：同一思想群（原典归类）、同一篇章（文本位置）、主题推荐（编辑推荐，须标注「主题推荐，非思想关系」）。
5. **`commentary_status` 不是「已核」的注文，不得作为论据引用。** 9 条纠错中，只有「以德报怨」的朱熹注已核对底本，其余为概括性表述。
6. **`claims-audit.json` 中的三个数字已按审计意见处置（2026-10-31）。** 「86 万」已从全部文件删除（修正说明中保留原表述作审计痕迹）；「308」已改为部分中介作用并更正作者顺序；「1263」已更正四维度名称并注明四子样本合计。

## 八、校验规则（改数据后应跑）

```
python3 _build/validate.py
```

校验项：JSON 可解析；id 唯一；关系两端 id 存在；cluster 分支 id 存在；context 五要素非空；correction 的 related_thought 存在；抽签池数量与 `pool_size` 一致。

---

## 九、多经典扩展（五百条阶段，v1.0 新增）

单经典时代整库只有《论语》，不需要标出处。扩到 14 部之后，「这条出自哪本书」必须写在数据里——不靠 ID 前缀猜，也不靠约定俗成。

### 9.1 新增顶层字段 `classics`

```json
"classics": [
  {"id": "lunyu",     "name": "论语",   "code": "LY", "order": 1},
  {"id": "mengzi",    "name": "孟子",   "code": "MZ", "order": 2},
  {"id": "daodejing", "name": "老子",   "code": "DD", "order": 3},
  {"id": "zhuangzi",  "name": "庄子",   "code": "ZZ", "order": 4},
  {"id": "xunzi",     "name": "荀子",   "code": "XZ", "order": 5},
  {"id": "daxue",     "name": "大学",   "code": "DX", "order": 6},
  {"id": "zhongyong", "name": "中庸",   "code": "ZY", "order": 7},
  {"id": "shijing",   "name": "诗经",   "code": "SJ", "order": 8},
  {"id": "zhouyi",    "name": "周易",   "code": "ZYi","order": 9},
  {"id": "chuanxilu", "name": "传习录", "code": "CXL","order": 10},
  {"id": "liji",      "name": "礼记",   "code": "LJ", "order": 11},
  {"id": "tanjing",   "name": "坛经",   "code": "TJ", "order": 12},
  {"id": "xiaojing",  "name": "孝经",   "code": "XJ", "order": 13},
  {"id": "zuozhuan",  "name": "左传",   "code": "ZZu","order": 14}
]
```

**向后兼容**：现有 26 条没有 `classic` 字段，缺省视为 `lunyu`。一旦 `classics` 字段出现，`validate.py` 转入严格模式，此后每条必须显式标注。

### 9.2 思想节点新增字段

| 字段 | 必填 | 说明 |
|---|---|---|
| `classic` | 严格模式必填 | 所属经典 id，必须在 `classics` 名单内 |
| `quality_tier` | 严格模式必填 | `A` 深度层 / `B` 标准层 / `C` 简释层 |
| `chapter_system` | 建议 | 分章所依据的版本，如「杨伯峻《论语译注》本」 |

**ID 前缀必须与 `classic` 一致**：`LY-*` 必须 `classic=lunyu`，`MZ-*` 必须 `classic=mengzi`。

### 9.3 三层质量模型

| 层 | 定位 | 核心要求 | 关系边 |
|---|---|---|---|
| **A** | 值得深入探索 | 原典、语境、注家分歧、充分证据、可追溯关系 | 有依据则展示，**没有就留空** |
| **B** | 可以独立阅读 | 原典、五要素、注疏依据、现代解读 | 至少一条经审核的关系，**或明确标「暂无可靠关联」** |
| **C** | 提供基本理解 | 原典、出处、白话、一条注疏 | 不要求 |

**层级必须在产品上明示。** 不能让用户以为所有内容都经过同等深度的学术考证。

**C 层不得有 `evidence.academic`** —— 标了 C 层却堆学术证据，说明层级标错了，`validate.py` 会报错。

**关系边不设数量硬指标。** 设了会反过来逼内容生产者凑关系，直接违背「宁可入口为空也不编造」。

### 9.4 分章系统差异必须保留

《论语》两套通行分章，总数都是 512，篇内分布不同：

| 篇 | 朱熹《集注》本 | 杨伯峻《译注》本 |
|---|---:|---:|
| 雍也 | 28 | 30 |
| 述而 | 37 | 38 |
| 宪问 | 47 | 44 |

**这不是谁对谁错，是版本差异。** 产品显示「雍也第几章」时必须标明依据哪套，否则就是错引。

其他经典同理：《老子》有王弼本 81 章、帛书本、郭店楚简本；《庄子》有内七外十五杂十一的分篇差异。**版本差异如实记录，不强行统一。**

### 9.5 跨经典关系三层严格分离

| 层 | `relation_basis` | 含义 | 例 |
|---|---|---|---|
| 原典事实 | `canon` | 原典自带判语 | 同一部书内部的呼应 |
| 注家解释 | `commentary` | 注家明确合观 | 朱熹把《大学》「格物」与《论语》「学」合讲 |
| 编辑比较 | `editorial` | 本产品建立的对照 | 孟子性善 ↔ 荀子性恶 |

**跨经典关系一律不得标 `canon`** —— 没有哪部原典自带跨书判语。`validate.py` 已强制。

孟子性善与荀子性恶可以建立对照，但不能包装成「孟子与荀子之间的思想关系」。产品上必须显示「编辑阐释」。

**思想网络不是和谐关系图。** `contrast` 不得被软化成 `same_theme`。让用户发现「两个看起来说同一件事的人，其实根本不是一个意思」，比强行找共同点有价值。

### 9.6 新增校验项（`validate.py` 已实现）

- 每条思想的 `classic` 在 `classics` 名单内
- ID 前缀与 `classic` 一致
- `quality_tier` 只能是 A/B/C
- C 层不得有 `evidence.academic`
- 跨经典关系 `relation_basis` 不得为 `canon`

### 9.7 原典层文件（新增）

| 路径 | 用途 |
|---|---|
| `raw/SOURCES.json` | 数据来源登记：数据集、版本、许可、抓取时间、SHA256 |
| `raw/canon/<classic>.json` | 篇/卷级原始记录 |
| `parsed/canon/<classic>.json` | 章级切分结果，带 `chapter_system` |
| `raw/reports/split-<classic>.md` | 切分报告，含异常清单 |
| `raw/reports/verify-<classic>.md` | 用已核验条目反查数据源的报告 |

**口径**：切分经过结构校验与抽样比对，**不等于全量校勘**。引用前仍须核对纸质通行本。
