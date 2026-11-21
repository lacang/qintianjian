# fix_bundle · 修复 vendor 误裁 iztro locale 导致的紫微辅星全错位

- 仓库：`/opt/data/work/qintianjian`，分支 `audit-fixes-2026-11-21`（HEAD `492c478` v133）
- 环境：node v26.12.1，iztro 2.6.2，tsup 8.5.1
- 改动边界：只动 `tools/build-vendor.mjs`、新建 `tools/check-vendor.mjs`、`liuyao-core/package.json` 的 scripts、重建 `app/vendor/liuyao-core.js`。**未改 `liuyao-core/src/**`，未改 `app/js/**`**
- 快照时间：2026-11-21 13:34（vendor 重建）；此时其他组仍在改 src（见 §7 交接提示）

---

## 0. 一句话结论

**根因确认：`trimIztroLocales` 用"非 zh-CN 全裁"的黑名单，把 `en-US/earthlyBranch.js` 也清空了；而 iztro 的 `kot()` 要拿这张表把 lunar-lite 的罗马字地支（`xu`/`chen`/`woo`）反查回 key，缺表 → `EARTHLY_BRANCHES.indexOf('xu') === -1` → `fixEarthlyBranchIndex` 一律返回亥宫偏移 → 辅星错宫、杂曜扎堆。** 改成白名单（`zh-CN/**` + `en-US/earthlyBranch.js` + `en-US/heavenlyStem.js`）后，20 个命例 240 宫 1320 颗星、107,927 个叶子字段与 `src` 逐字段一致（0 差异）；代价仅 **+567 字节**。同时补上真校验器 `tools/check-vendor.mjs`（29 个函数 × 20 组输入 + 20 命例逐宫对拍），并把 `--check` 的自证逻辑改成"字节一致后再跑行为对拍"。

---

## 1. 根因证明（实测，不是推断）

### 1.1 失效链条

```
lunar-lite getHeavenlyStemAndEarthlyBranchBySolarDate()
   → 部分地支以**罗马字**（xu / chen / woo …）进入 iztro 星曜定位
        ↓
iztro utils/index.js:88  fixEarthlyBranchIndex(name)
   = fixIndex( EARTHLY_BRANCHES.indexOf( kot(name,'Earthly') ) - EARTHLY_BRANCHES.indexOf('yinEarthly') )
        ↓
iztro i18n/index.js:126  kot() 遍历 resources（en-US → ja-JP → ko-KR → zh-CN → zh-TW → vi-VN），
   命中 trans === value 时返回 transKey；**一张表都查不到就原样返回 value**
        ↓
en-US/earthlyBranch.js 被裁空 → 六张表里都没有 'xu' → kot('xu','Earthly') 返回 'xu'
        ↓
EARTHLY_BRANCHES.indexOf('xu') = -1        （表里存的是 'xuEarthly' 这种 key）
EARTHLY_BRANCHES.indexOf('yinEarthly') = 2 （'yinEarthly' 也不是任何翻译值，同样反查不到）
        ↓
fixIndex(-1 - 2) = fixIndex(-3) = **9** = 寅后第 9 位 = **亥**
        ↓
凡是"入参就是罗马字"的定位（`fixEarthlyBranchIndex('xu')` 这类）一律返回 **9 = 亥**；
凡是"基数 + `EARTHLY_BRANCHES.indexOf(kot(...))`"的定位则整体偏 1 宫（±1 取决于公式符号）。
实测 1990-05-17 14时男命：**天魁/天钺/禄存/天马四颗全部落到亥宫**，文昌卯→辰、擎羊酉→子、
火铃申戌→午午，杂曜因多处 −1 连加而塌缩——该盘亥宫挤了 **4 辅 + 17 杂**（正常 ≤ 8 杂）
```

> 这条算式解释了截图里最刺眼的两个现象：**命宫辅星全空/只剩一颗**（辅星被搬去别宫，实测命宫辅星由"铃星"变成"陀罗"）与**某一宫挤了天魁天钺禄存天马 + 一堆杂曜**（偏移量塌缩）。

`kot()` 源码（`liuyao-core/node_modules/iztro/lib/i18n/index.js:126-143`，逐字抄录）：

```js
var kot = function (value, k) {
    var res = value;
    var aliasKey = starAliases_1.STAR_ALIASES[value];
    if (aliasKey) {
        return aliasKey;
    }
    for (var _i = 0, _a = Object.entries(resources); _i < _a.length; _i++) {
        var _b = _a[_i], item = _b[1];
        for (var _c = 0, _d = Object.entries(item.translation); _c < _d.length; _c++) {
            var _e = _d[_c], transKey = _e[0], trans = _e[1];
            if (((k && transKey.includes(k)) || !k) && trans === value) {
                res = transKey;
                return res;
            }
        }
    }
    return res;           // ← 查不到就原样返回，静默失败
};
```

`resources` 的遍历顺序（同文件 41-58 行）是 `en-US → ja-JP → ko-KR → zh-CN → zh-TW → vi-VN`——
**en-US 排在 zh-CN 前面，所以 en-US 的表一旦被清空，反查链在最后也补不回来**（zh-CN 里没有 `xu` 这种值）。

### 1.2 插桩证据：谁在被 kot 反查

给 vendor 里的 `kot` 插桩，跑 4 个命例（**913 次 kot 调用**）与 1 次八字（**0 次**），记录全部入参：

| 入参形态 | k 过滤 | 实际传入值 |
|---|---|---|
| **罗马字地支** | `Earthly` | `chen chou hai mao shen si wei woo xu yin you zi`（12 支全部出现） |
| 中文字支 | `Earthly` | 午 未 戌 丑 辰 巳 子 卯 寅 |
| 中文天干 | `Heavenly` | 庚 丙 乙 壬 辛 癸（**没有任何罗马字天干**） |
| 中文星名/五行局/性别/生肖/星座 | 无 | 紫微…破军、土五局、男/女、马/牛… |

结论：**只有 `Earthly` 这一路会拿到罗马字**，因此只有 `en-US/earthlyBranch.js` 属于硬依赖。

### 1.3 逐文件必要性实测

以 `src` 编译出的完整 bundle 为基准（无裁剪），对 20 命例 + 西方/吠陀/八字/奇门/六爻 8 例逐字段对拍，只改白名单：

| 白名单 | 裁空块数 | 紫微不一致命例 | 不一致叶子字段（共 26,160） | 其他系统 |
|---|---|---|---|---|
| 仅 `zh-CN/`（旧规则） | 45 | **20/20** | **8,053** | 0 |
| `zh-CN/` + `en-US/heavenlyStem.js` | 44 | **20/20** | 8,053 | 0 |
| `zh-CN/` + `en-US/fiveElementsClass.js` | 44 | **20/20** | 8,053 | 0 |
| `zh-CN/` + `en-US/star.js` | 44 | **20/20** | 8,053 | 0 |
| `zh-CN/` + `en-US/common.json` | 44 | **20/20** | 8,053 | 0 |
| `zh-CN/` + `en-US/earthlyBranch.js` | 44 | **0/20** | **0** | 0 |
| `zh-CN/` + `en-US/{earthlyBranch,heavenlyStem}`（**采用**） | 43 | 0/20 | 0 | 0 |
| `zh-CN/` + 整个 `en-US/` | 36 | 0/20 | 0 | 0 |

> 逐文件替换的结果是"要么 20/20 全错、要么 0/20 全对"的硬开关，说明**只有 `earthlyBranch` 是开关位**；
> 其余 en-US 文件全部与命例结果无关（`star.js`/`common.json` 也试过）。一致性由 `tools/check-vendor.mjs` 复核，不是肉眼判读。

→ `earthlyBranch` 是唯一必需项；`heavenlyStem`/`fiveElementsClass`/`star`/`mutagen`/`gender`/`palace`/`brightness`/`common.json` 均可裁。`heavenlyStem.js` 源码仅 340B，与 `earthlyBranch` 同属"罗马字反查表"一类，保留作防御（防止将来某条路径把罗马字天干喂进 `kot`）。

### 1.4 为什么 `--check` 没拦住

旧 `--check` 只做 `重建结果 === 现有文件` 的逐字节比对。**产物本身就是用错误规则构建的，字节当然一致**——这是"可复现"而非"正确"的自证。事故期间 gates 第 2 步（`tools/gates.sh:78`）一路绿灯。

### 1.5 修前/修后对照（同一份 src，20 命例 × 12 宫）

| 指标 | 修前（旧规则） | 修后（白名单） |
|---|---|---|
| 错盘命例 | **20 / 20** | 0 / 20 |
| 错宫位数 | **236 / 240** | 0 / 240 |
| 辅星落宫错误 | **223 / 280**（全部为"错宫"，无丢失） | 0 / 280 |
| 单宫杂曜最多 | **25 颗**（正常 ≤ 8） | 8 颗 |
| 每盘辅星总数 | 14（总数对，位置全错） | 14 |
| 命宫/身宫地支、宫名、宫干支 | 0 错（未受影响） | 0 错 |
| 大限四化（宫上 decadalHua） | **118 / 240 宫错** | 0 |
| `ziweiYunXian`（大限/流年/流月） | **17 / 20 结果不同 + 3 / 20 直接抛异常**（`Cannot read properties of undefined (reading 'mutagen')`） | 20/20 一致 |
| └ 其中 大限 / 流年 / 流月 | 12 / 9 / 6 处不同 | 0 |
| 检查器判定 | 21 组失败（20 命例 + ziweiYunXian） | 0 失败 |

> 也就是说：**宫位骨架（命宫/身宫地支、宫名、宫干支）与主星没错，错的是所有靠地支序号定位的量——辅星、杂曜、长生十二神，以及由此派生的大限四化/流年/流月**，严重时 `ziweiYunXian` 直接抛 `Cannot read properties of undefined (reading 'mutagen')`（命例页的"运限"区会白屏）。与用户截图"命宫辅星全空、夫妻宫挤了一堆"完全吻合。

---

## 2. 改了什么

### 2.1 `tools/build-vendor.mjs`（黑名单 → 白名单 + 结构自检）

```js
const KEEP_LOCALES = ['zh-CN/', 'en-US/earthlyBranch.js', 'en-US/heavenlyStem.js'];
const MUST_EXIST = ['en-US/earthlyBranch.js', 'en-US/heavenlyStem.js'];
```

- `trimIztroLocales` 改为 `KEEP_LOCALES.some(k => file === k || file.startsWith(k))`；
- **白名单存在性断言**：`MUST_EXIST` 里任一文件没出现在 bundle 注释块中 → 直接抛错（iztro 升级换路径时立刻炸，而不是静默裁成空表）；
- **计数自洽断言**：`裁空 + 保留 + 免裁 === locale 块总数`；免裁块只允许是各语言 `index.js`（它们是 `exports.default = __assign({}, …)` 组装器，本就不在裁剪范围），出现其他免裁块 → 抛错；
- `--no-dts`：vendor 只要 JS 单文件，`.d.ts` 对浏览器无意义。原来 DTS 一起跑，**`src` 里任何类型错误都会硬阻塞 vendor 重建**（本次首次重建时就撞上了：`src` 正被其他组编辑，DTS 阶段报类型错误，vendor 一个字都没写出来；该错误现在已被那组修掉，`npx tsc --noEmit` 干净）。类型检查归 `npm run typecheck`，不该挡离线包；
- `--check` 语义重写：字节一致 → **继续 spawn `tools/check-vendor.mjs` 做行为对拍**，以行为结果作为退出码（`tools/gates.sh` 第 2 步因此自动升级为真校验，无需改 gates.sh）。

### 2.2 `tools/check-vendor.mjs`（新建，行为级对拍）

| 能力 | 实现 |
|---|---|
| ① 参考实现 | 用 `liuyao-core/node_modules/esbuild` 直接编译 **`liuyao-core/src/index.ts`** 到临时目录（bundle/esm/platform:browser/target:es2020，与 tsup 的 noExternal 内联链路同构），动态 import；用完删临时目录 |
| ② 待测实现 | import `app/vendor/liuyao-core.js` |
| ③ 覆盖 | **29 个导出函数 × 20 组确定性输入 = 580 次调用（累计比对 107,927 个叶子字段）**，逐字段深度比较（对象键并集、数组长度与逐元素、`Object.is` 语义的 NaN/-0、Date 按时间戳）；另校验 **导出面 127 个导出一个不少** |
| ④ 紫微专项 | **20 命例 × 12 宫 = 240 宫 / 1320 颗星**逐字段（主星/辅星/杂曜的 name+type+brightness+mutagen、宫名、宫干支、命宫/身宫标记、长生/博士/将前/岁前十二神、大限区间与四化、小限、三方四正），并断言命宫/身宫各唯一、`soulBranch`/`bodyBranch` 与标记宫一致、`isEmpty` 与主星数自洽 |
| ⑤ 分布合理性 | 单宫杂曜 > 12 颗、或全盘辅星 < 12 颗 → 判失败（专门兜住本次这类"全挤一宫/全丢"的形态） |
| ⑥ 失败行为 | 任何一处不一致 → 打印路径级差异（前 4 条 + 剩余条数），**退出码 1** |

覆盖的系统：紫微（paiZiwei/ziweiYunXian）、印度（paipanVedic）、八字（paiBazi/baziExtra/baziShenSha/baziRelations/tenGod/liuNianGanZhiSequence）、奇门（paiQiMen）、梅花（meiHuaByNumbers/meiHuaByTime）、六爻（paipan/analyzeNajia/getFullNajia/calcShenSha/calcGuaShen/castByTime）、西方（paipanXingpan/guDianTuiYun/listFirdariaPeriods/listProfectionYears/shouyeTianxiang）、历法与星次（getDayCalendar/solarToSiZhu/resolveTime/mansionSnapshot/riChan/yueLi/zhiSu）。

**负向对照（证明校验器不是空转）**：拿修复前的 bundle 跑 → 恰好 21 组失败（20 个命例 + `ziweiYunXian`），其余 28 个函数 20/20 通过。定位精准，无假阳性。

### 2.3 `liuyao-core/package.json` scripts

```json
"build:vendor": "node ../tools/build-vendor.mjs",
"check:vendor": "node ../tools/check-vendor.mjs",
"verify:vendor": "node ../tools/build-vendor.mjs --check"
```

（仓库内只有 `liuyao-core/package.json` 这一个 package.json，根目录没有。）

---

## 3. 实测结果（全部真实执行）

```
$ node tools/build-vendor.mjs
[build-vendor] 已写入 /opt/data/work/qintianjian/app/vendor/liuyao-core.js
[build-vendor] iztro locale 60 块：保留 12（zh-CN + 罗马字反查表）/ 裁空 43，产物 2594579 字节

$ node tools/check-vendor.mjs
[check-vendor] 导出面：127 个导出全部存在
[check-vendor] paipanXingpan 20/20 一致 …（27 行，略）
[check-vendor] 紫微专项：20 命例 / 240 宫 / 1320 颗星逐字段对拍，20 命例一致
[check-vendor] ✅ 全部一致：580 次调用 / 29 个函数 / 20 个紫微命例 / 累计 107,927 个叶子字段，参考侧与 vendor 逐字段相同
EXIT=0

$ node tools/build-vendor.mjs --check      # 字节一致 → 自动接力行为对拍
… ✅ 全部一致 …  EXIT=0

$ cd liuyao-core && npm run check:vendor    # 同上，EXIT=0
```

locale 块账目：**总计 60 块** = 保留 12（zh-CN 10 + en-US 2）+ 裁空 43 + 免裁 5（各语言 `index.js`）。旧注释里写的"45 块"= 旧的裁空数（60 − 10 zh-CN − 5 index），并非总数，已在新注释中说明。

---

## 4. 手工抽查 3 个命例（辅星是否符合常理）

修复后（与 `src` 逐字段等价，20 命例 JSON 全等；下列为 `tools/check-vendor.mjs` 同源数据的打印）：

**① 1990-05-17 14:00 男**，命宫戌（贪狼+铃星）、身宫子，土五局
- 辅星每宫 0,1,1,0,1,4,3,1,1,1,0,1（总 14）；杂曜每宫 3,4,5,3,3,2,3,3,4,3,4,1（总 38）
- 命宫 丙戌：贪狼 + 铃星（铃贪同宫）+ 解神/龙池/华盖/旬空 —— 有星、不空
- 夫妻宫 甲申：紫微天府 + 禄存/天马/火星 + 天贵/孤辰/阴煞 —— 3 颗辅星，正常

**② 1985-11-03 08:00 女**，命宫午（破军+文昌）、身宫寅，木三局
- 辅星每宫 3,2,1,0,1,2,2,0,0,1,2,0；杂曜 4,2,2,4,6,3,3,4,4,2,0,4
- 命宫 壬午：破军 + 文昌 + 咸池/八座/封诰/天厨/月德/截路
- 夫妻宫 庚辰：武曲 + 擎羊 + 解神/天官

**③ 2001-02-28 23:00 男（晚子时）**，命宫卯=身宫，木三局
- 辅星每宫 1,1,1,1,1,0,1,2,3,3,0,0；杂曜 3,2,3,5,4,1,6,5,4,2,1,2
- 命宫辛卯：太阳天梁 + 火星 + 八座/恩光
- 夫妻宫辛丑：天同巨门（辅星为空——该盘天魁天钺禄存天马各在别宫，属正常，不是"丢星"）

三盘共同点：辅星总数恒为 14、杂曜总数恒为 38、单宫杂曜最多 8，**没有任何一宫被塞进 17~25 颗杂曜**，命宫不再空、夫妻宫不再"堆山"。

---

## 5. 体积变化

| 项 | 字节 |
|---|---|
| 保留 `en-US/earthlyBranch.js` 块 | 600（块全文） |
| 保留 `en-US/heavenlyStem.js` 块 | 558 |
| 同位置裁空后应为 | ≈ 277 × 2 |
| **locale 修复净增（同源实测：2,593,857 → 2,594,424）** | **+567 字节** |
| 修复前 vendor（HEAD 提交版 v133） | 2,584,580 |
| 修复后 vendor（本次重建） | 2,594,579 |

- locale 部分只占 **+567 字节**（0.022%），远低于 100KB 阈值，**无需按字段裁剪**，保持整表（整表还能兜住 `kot` 的任意罗马字入参）。
- 裁剪本身省多少：未裁剪的 tsup 产物 2,625,726 字节 → 裁剪后 2,594,579 字节，**约 −31KB**（未裁剪数字取自 13:25 的 tsup 产物，与裁剪后相隔 5 分钟，含少量 src 漂移，按整数量级看待）。
- 2,584,580 → 2,594,579 的 **+9,999** 差额来自**同一天其他组对 `src` 的改动**（羊刃表、时间层、奇门、二十八宿等），与本次 locale 修复无关。

---

## 6. 回归

```
$ cd liuyao-core && npx tsc --noEmit
（无输出 = 类型干净）

$ npx vitest run
 Test Files  24 passed (24)
      Tests  434 passed (434)     Duration 36.03s
```

期间曾有 1 例失败（`test/golden.test.ts` 羊刃断言 `乙→寅`，而 `src/shensha.ts` 已被另一组改成"禄前一辰" `乙→辰`）。
那是**另一个组的 src 改动与金标准不同步**，与本次 vendor 修复无关（该测试 import `../src`，不走 vendor）；
到本报告收尾时那组已把金标准同步过来，现在 434/434 全绿。

专项佐证：`test/ziwei-fix.test.ts` 里那条"736 张抽样盘对 iztro 逐宫逐星零差异"在本次改动的同一工作树上通过。

## 7. 未解决项 / 交接提示

1. **vendor 会随其他组继续改 `src` 而漂移**。本次重建基于 13:34 的工作树快照；其他组收尾后必须再跑一次
   `node tools/build-vendor.mjs`（或 `npm --prefix liuyao-core run verify:vendor`，字节不一致会直接报 1）。
   `tools/gates.sh` 第 2 步现在等于"字节同步 + 行为对拍"，能兜住漂移和语义错两类问题。
2. **本次 bundle 已包含其他组未提交的 src 改动**（羊刃表等）。若那些改动后续被回退/改写，vendor 必须跟着重建，否则 gates 会红。
3. **`zh-TW/ja-JP/ko-KR/vi-VN` 的 `index.js` 组装器仍保留**（本就不在裁剪范围）。若将来要把 iztro 多语言彻底移除，需要连同 `i18n/index.js` 的 `resources` 表和 `LANGUAGES` 一起改，属于换库级别的工作，本次未做。
4. **`en-US/heavenlyStem.js` 属防御性保留**：实测当前所有 `kot(…,'Heavenly')` 入参都是中文，裁掉也不影响 20 命例。保留它是为了"罗马字反查表"这一类不被未来改动悄悄破坏。若要再压体积，可单独裁掉它（省 ~560 字节，收益可忽略）。
5. `check-vendor.mjs` 每次跑都要 esbuild 编译一次 src（约 1.5s）+ 载入两个 2.5MB bundle，全量耗时约 7s，适合进 gates/CI，不适合放进 `vitest` 单测循环。

---

## 8. 对照验收项

| # | 要求 | 结果 | 证据 |
|---|---|---|---|
| 1 | 找到裁剪规则并改成白名单；实测 heavenlyStem / fiveElementsClass 等是否同样必需 | ✅ 白名单 `zh-CN/**` + `en-US/earthlyBranch.js` + `en-US/heavenlyStem.js`(防御)；实测**只有 earthlyBranch 必需** | §1.3 矩阵（star.js / common.json 也试过，均 20/20 错） |
| 2 | 新建 `tools/check-vendor.mjs`：src 参考 vs vendor 待测、≥15 函数 × 20 输入、紫微 ≥20 命例逐宫 | ✅ **29 个函数 × 20 组 = 580 次调用**，107,927 个叶子字段；紫微 20 命例 / 240 宫 / 1320 颗星 | §2.2、§3（EXIT=0） |
| 3 | 接进 package.json scripts；废掉旧 `--check` 自证 | ✅ `check:vendor` / `verify:vendor` / `build:vendor`；`--check` 字节一致后强制跑行为对拍 | §2.3、§3 |
| 4 | 重建 bundle + 新校验器全绿 + 手工抽查 3 命例 | ✅ 2,594,579 字节；EXIT=0；三盘命宫/夫妻宫辅星分布正常（14 辅 / 38 杂，单宫 ≤ 8 杂） | §3、§4 |
| 5 | 体积变化，超 100KB 则按字段裁剪 | ✅ **+567 字节**（0.022%），远低于阈值，不做字段裁剪 | §5 |
| 6 | `npx vitest run` 无回归 | ✅ 24 files / **434 tests passed**（13:35 复跑） | §6 |

> 校验器自身也做过负向对照：对修复前的 bundle 跑 → 恰好 21 组失败（20 命例 + ziweiYunXian），其余 28 函数全过 —— 既不空转，也不假阳性。
