# 钦天监 · 错误处理与降级审计（r4）

- 审计对象：`/opt/data/work/qintianjian/app`（纯静态 PWA，v133）
- 审计日期：2026-11-21
- 方法：**故障注入 + 真机浏览器实测**（`python3 -m http.server` 多端口隔离起站，Chromium 实测 DOM/截图/错误事件）+ 静态取证（对 76 个 `js/*.js` 做 AST 级正则统计）
- 只读审计，未改动任何项目文件；所有破坏性操作仅在 `/opt/data/cache/scratch/` 副本中进行
- 截图目录：`audit3/shots/`

## 总结论

一句话：**离线能力是 A 级，用户输入校验是 B 级，而"运行期出错"这一整层基本不存在——一旦模块加载失败或渲染抛错，界面上不会有任何一个字告诉用户。**

1. **单点资源 404 = 全站瘫痪且零提示**。`vendor/liuyao-core.js`、`vendor/three/three.module.js`、`js/astromodes.js` 任意一个失败，首页只剩 44 个字的空壳 + 3 个永不消失的骨架屏，29 个面板全空，**没有任何错误横幅、重试按钮或 toast**（`shots/01_vendor404_shell.png`）。
2. **全局错误捕获为 0**：76 个 js + `index.html` + `sw.js` 中 `window.onerror` / `unhandledrejection` / `addEventListener('error')` **一处都没有**。
3. **核心算完会给 7 类中文风险提示，前端一条都不显示**：core 里 11 处 `warnings.push(...)`（时区兜底、夏令时还原、真太阳时未校正、超出验证区间…），而 `warnings` 这个字段在 `js/`、`sw.js`、`index.html` 里**出现次数为 0**。
4. **23 个盘面渲染函数里只有 6 个有"出错给人看"的分支**，3 个 catch 后一声不响，14 个裸奔。
5. 反面是好的：**复现码校验、时间输入校验、定位失败、离线重载**这四条路径做得相当扎实，文案清楚、行为正确。

---

## 一、失败路径清单（全部实测）

| 编号 | 制造方式 | 实际表现 | 用户可见提示 | 判定 |
|---|---|---|---|---|
| R1 | `vendor/liuyao-core.js` 改名 → 404（8100 端口副本） | 首页空壳，29 个 `*-body` 全空，3 个骨架屏常驻 | **无** | ✗ 白屏级 |
| R2 | `vendor/three/three.module.js` 改名 → 404（8101） | 同 R1，且 `[data-view="cast"]` 点击后 `#view-cast` className 仍为 `"view"`（切不动） | **无** | ✗ 白屏级 |
| R3 | 删除 `js/astromodes.js`（8102） | 同 R1（`performance` 里甚至查不到该请求的 4xx） | **无** | ✗ 白屏级 |
| R4 | 出生时间填 `1582-10-10`（格里高利改历空档） | 紫微：盘面区红字「紫微排盘失败：invalid solar date.」；**同时**底部 toast「已按 1582-10-10 12:00 排盘」 | 有（但自相矛盾） | △ 文案/逻辑打架 |
| R5 | 出生时间填 `9999-12-31` / `0001-01-01` | 八字、紫微、吠陀、奇门、星盘**全部照常出盘**，无任何"超出可信范围"提示 | 无（但也没报错） | △ 静默算可疑 |
| R6 | 时间条清空后点「排盘」 | toast「时间无效，请重新选择」 | 有 | ✓ 合格 |
| R7 | 复现码粘「瞎写的码」/ 空 / `QT1-AAAA` / 400 字符 | 依次提示「码里有不认识的字符」「请先输入码」「码不完整」「码的版本 v0 本版不支持」，红字常驻不关弹层 | 有 | ✓ 优秀 |
| R8 | 直接调核心：`paipanXingpan(null)` 等 | `TypeError: Cannot read properties of null (reading 'lat' / 'city' / 'getTime')` —— 核心零入参校验 | 取决于调用方 | △ 见第三节 |
| R9 | CDP 断网后重载页面 | **完整可用**：首页 728 字全部渲染，骨架屏 0 个，无报错 | — | ✓ 优秀 |
| R10 | 拒绝定位权限 / 定位超时（读码取证） | 弹「你拒绝了定位权限，可改用手搜城市」/「定位超时，可改用手搜城市」；但 `refreshLocatedPlace` 内部 `catch` 后**沿用上次地点且不提示** | 部分 | △ 见 §2 |

### R1–R3：一个 2.6MB 的模块能把整个应用拖死

三份副本各自只坏一个文件，结果**完全一致**：

```
TITLE      🐴 钦天监 · 命理星象工作台     ← 标题还在
BODYLEN    44                           ← 正文只剩 44 字
SKELETONS  3                            ← 3 个骨架屏，等 4s 仍在
EMPTY      29 / 29 个 [id$="-body"] 全空
```

残留正文（三场景逐字相同）：

```
钦天监 / 复制 / · / 详细 › / 合 / 多盘合参 · 问事 / v— / 钦天监 观心 问问 起卦 案例
```

原因链清楚：全部视图模块经由 `main.js` 的静态 import 图加载（`main.js → astroview.js → astromodes.js`），**任意一个叶子模块 404，`main.js` 整体不执行**；而 `index.html` 里的静态骨架（壳层 + 3 个 `.qt-skeleton`）是 HTML 自带，所以永远定格在"加载中"。页面右下角版本号退化成 `v—`（`force-refresh.js` 的 `readVersion()` 兜底），这是失败时**唯一**露出的一丝异样，且没人会把它当报错。

> 截图：`shots/01_vendor404_shell.png`（Safari 风空壳，无任何文字说明）

### R4：报错与成功提示同时出现

```
紫微排盘失败：invalid solar date.        ← 盘面区，红字，中文前缀 + 英文库消息
已按 1582-10-10 12:00 排盘               ← 底部 toast，宣称成功
```

`ziweiview.js:599-602` 的 `try/catch` 做了正确的事（捕获 + 前缀 + esc），但 toast 由上层 `tb-go` 处理器在**调用渲染之前**无条件弹出，于是"失败"和"已排盘"同屏。截图：`shots/05_ziwei_invalid_date.png`。

### R9：离线是这块最硬的部分

`sw.js`：`CACHE='qintian-v133'`，实测缓存 **254 条**，含 `liuyao-core.js`；`.js/.css/.html/navigate` 走 `networkFirst`（先网后缓存），其余走 `cacheFirst`。断网重载后首页 728 字完整、四柱/卦象/节气/月相全在、骨架屏 0 个。**断网新开页面 = 正常可用，不是白屏。**

---

## 二、静默兜底全表

判定口径：这里的默认值是否会把"数据缺失/计算失败"伪装成"一切正常"。

| # | 位置 | 默认值 / 写法 | 掩盖了什么 | 风险 | 备注 |
|---|---|---|---|---|---|
| 1 | `rhythmview.js:41` | `gender: birth.gender \|\| cfg.gender \|\| '男'` | 性别缺失 → 一律按男命。**大运顺逆由性别+年干阴阳决定，判反则整条大运反向** | **高** | 命盘节律页无任何"性别未定"提示 |
| 2 | `rhythmview.js:47` | `try{ bazi = paiBazi({...}) } catch {}` | 八字失败 → `bazi=null` → `daYunList=[]` → **大运整块静默消失**，页面其余部分照常 | **高** | 空 catch，无 console 也无 UI |
| 3 | `rhythmview.js:52` | `try{ firdaria = listFirdariaPeriods(...) } catch {}` | Firdaria 段落静默缺失 | 中 | 同上 |
| 4 | `rhythmview.js:56` | `try{ profection = ... } catch {}` | Profection 段落静默缺失 | 中 | 同上 |
| 5 | `tianxiangcalendar.js:44` | `} catch {}`（节气批量计算） | 节气列表静默为空/缺项，首页节气卡只剩标题 | 中 | 无日志 |
| 6 | `state.js:18-20` | `loadCfg()` catch 后返回全默认 `{gender:'男', lateZi:'23', trueSolarTime:true, ...}` | localStorage 配置损坏 → **静默重置为男命 + 新配置**，用户以为设置还在 | 中 | 无提示、无备份 |
| 7 | `sharecode.js:147-148` | `lon ?? 120`、`lat ?? 30` | 编码时缺经纬度 → **凭空写入上海(120E,30N)**。实测：`encodeCode('astro',{y:1990,…,gender:'女'})` 解码得 `lon:120, lat:30` | 中高 | 复现码还不带城市名，对方打开后地点=自己的城市 + 上海经纬度混合 |
| 8 | `geo.js:104` | `catch { /* 拿不到就沿用上次的定位 */ return cur; }` | 定位失败后沿用旧地点，地点胶囊仍显示上次的"当前位置" | 中低 | **有注释说明**，但无 UI 提示；按验收标准可接受 |
| 9 | `astroview.js:202` | `prompt(..., 当前值 \|\| 8)` | 手动时区输入框的**预填值**为 8 | 低 | 仅预填文本，非计算兜底 |
| 10 | `vedicview.js:328` | 文案硬编码 `（UTC+8）` | 分享/复制文本对任何地点都写 UTC+8，纽约盘也写 UTC+8 | 中 | 静态字符串，`grep UTC+8` 全项目仅此一处 |
| 11 | `globe.js:77` | `b.lon ?? b.eclLon ?? 0` | 缺经度 → 0°，星体画到春分点方向 | 低 | 纯视觉 |
| 12 | `main.js:212 / 225` | `catch(e){ console.warn('[qintian] 生成码失败'/'自动留档失败') ; return null }` | 点「码」没反应、案例不留档，用户看不到原因 | 中 | console-only |
| 13 | `main.js:781-783` | `safeHome/safeSky/safeBars` → `console.warn('[home] 刷新失败' …)` | **首页渲染失败只剩骨架屏，一个字都不说** | **高** | R1–R3 的直接成因 |
| 14 | `tarotview.js` 等 12 处 | `try{ localStorage.setItem(...) }catch{}` | 配额满/隐私模式 → 设置、牌阵、牌组不落盘，下次打开回到默认 | 低 | 可接受，但无一次性提示 |
| 15 | `baziview.js:33` | 缓存键用 `a.lat \|\| ''`、`a.city \|\| ''` | 缺字段时缓存键退化，可能命中另一份盘 | 低 | 只影响缓存 |
| 16 | `yangzhaiview.js:528` | `S.person.g = t.value \|\| null` | 未选性别 → null，后续判语按中性处理 | 低 | 有 null 语义注释 |

**会被静默算错的具体位置（结论）：#1、#6、#7 三处最危险**——分别对应"大运顺逆反了"、"配置丢了以为还在"、"复现码把地点变成上海"。

---

## 三、错误捕获与未捕获异步清单

### 3.1 全局层：零

对 76 个 `js/*.js` + `index.html` + `sw.js` 检索 `window.onerror` / `self.onerror` / `addEventListener('error')` / `unhandledrejection` / `onunhandledrejection`：

```
命中数：0
```

这意味着：任何未捕获异常、任何模块加载失败、任何未处理 Promise，**都只进浏览器控制台**。

### 3.2 捕获了但不说（console-only，用户侧全静默）

| 位置 | 文案 | 输出通道 | 用户感知 |
|---|---|---|---|
| `main.js:781` | `[home] 刷新失败` | `console.warn` | 首页空着，无提示 |
| `main.js:782` | `[sky] 天象条失败` | `console.warn` | 天象条空白 |
| `main.js:783` | `[timebars] 同步失败` | `console.warn` | 时间条不跟随 |
| `main.js:798` | `[place] 重算失败` | `console.warn` | 换地点后画面不变 |
| `main.js:801` | `[refresh] 初始化失败` | `console.warn` | 版本号永远 `v—` |
| `main.js:212` | `[qintian] 生成码失败` | `console.warn` | 点「码」无反应 |
| `main.js:225` | `[qintian] 自动留档失败` | `console.warn` | 案例列表少一条 |

这 7 条是**开发者视角的文案**，对自用工具可以接受，但它们同时是"用户侧唯一可得的线索"，因此构成静默。

### 3.3 23 个盘面渲染函数的容错覆盖

| 覆盖情况 | 数量 | 函数 |
|---|---|---|
| 有 try + 有用户可读错误文案 | 6 | `renderAstro`、`renderMansion`、`renderHomeSky`、`renderSky`、`renderVedic`、`renderZiwei` |
| 有 try 但**无**用户可读文案（静默） | 3 | `renderHeCan`、`renderNajia`、`renderRhythm` |
| **完全裸奔**（无 try） | 14 | `renderAsk`、`renderBazi`、`renderCards`、`renderDaLiuRen`、`renderGeomancy`、`renderJingZhuan`、`renderMeiHua`、`renderPan`、`renderQiMen`、`renderReading`、`renderTarot`、`renderTibetan`、`renderXiaoLiuRen`、`renderYangzhai` |

裸奔现场：`switchView()`（`main.js:75-96`）里 `updateHome()`/`renderHistory()`/`resetCast()`/`renderAsk()`/`renderClassic()` 都是直接调用，没有 try。**渲染一抛错 → 该次点击整体中断，视图停在半截或停在原视图，控制台之外无任何痕迹。** R2 里"点 tab 切不动"就是这个表现的极端版（模块没起来）。

### 3.4 未捕获的异步 / 关键裸调用点

| # | 位置 | 为什么危险 |
|---|---|---|
| A1 | `cast.js:81` `const dt = await applyTstAt(d)`（在 async 点击处理器内，**无 try**） | 一旦 reject 就是 `unhandledrejection`，按钮点了没反应。当前因 `refreshLocatedPlace` 内部吞错而未暴露（见 §2-#8），属于"靠下游兜底掩盖"的运气型安全 |
| A2 | `cast.js:83` `castByTime(dt.getTime(), …)` | 核心对 `undefined`/非法 `getTime` 会抛 `TypeError`（实测 `castByTime(null)` → `Cannot read properties of null (reading 'getTime')`），此处无 try |
| A3 | `main.js:334+` `openByCode` 内各分支的 `paipanZi(...)` / `paipanXingpan(...)` | 只有 `decodeCode` 在 try 里，**真正排盘那几行没有**。码合法但内容触发核心异常时，粘贴后静默无反应 |
| A4 | `main.js:332` `applyCodeCfg(d)` | 无 try；码里的非法 geo 会污染 `panAt`，后续所有盘跟着错，且无提示 |
| A5 | `force-refresh.js:122` `readVersion().then(...)` | `.then` 无 `.catch`（`readVersion` 内部全 try，实际不会 reject，**风险极低**，仅记录） |
| A6 | `force-refresh.js` 其余链（`caches.delete` / `unregister`） | 已用 `withTimeout(...).catch(()=>{})` 包裹，2.5s/2s 上限，**合格** |

**结论**：全项目无 `unhandledrejection` 兜底，未捕获异步错误 = 静默；真正的隐患集中在 A1–A4 四个"用户点了按钮"的位置。

---

## 四、降级标记是否真的可见

core 里生成了大量降级信息，逐个追踪消费者：

| 标记 | 产生处 | 消费处 | 是否显示 | 结论 |
|---|---|---|---|---|
| `warnings[]`（7 类中文风险） | `vendor/liuyao-core.js` 11 处 `warnings.push` | **无**（`js/`、`sw.js`、`index.html` 检索 `warnings` = 0 处） | **否** | ✗ 全丢 |
| └ 未识别出生地时区，已按东八区兜底 | 同上 | 无 | 否 | ✗ |
| └ 出生时值夏令时：钟面时间已减 1 小时 | 同上 | 无 | 否 | ✗ |
| └ 缺出生地经度，真太阳时未校正 | 同上 | 无 | 否 | ✗ |
| └ 超出验证区间 `outside_validated_range` / `delta_t_uncertain` | 同上 | 无 | 否 | ✗（R5 的极端年份正落在此处） |
| `tzFallback` | core（3 处） | `astroview.js:145` | **是**（红字 `⚠ 出生地时区未识别，按东八区兜底`） | △ 仅星盘一页 |
| `tzEstimated` | core（3 处） | `astroview.js:146` | **是**（实测可见：`⚠ 时区是按经度估算的，请核对`，`shots/04_tz_warn_visible.png`） | △ 仅星盘一页 |
| `ruleStale`（复现码规则版本） | `sharecode.js:229` | `main.js:330` | **是**（提示尾部追加「此码规则 v1，当前 v1，结果或有差异」） | ✓ 合格 |
| `geoConflict/geoConflictNote` | core | 无（只进 warnings） | 否 | ✗ |
| `app_version` | `aipack.js:126` | 资料包 JSON 内 | 否（导出物里，界面无） | — |

### 关键实测对比

同一份"无城市、只有经纬度 (0,0)"的出生地：

- **星盘**：`… UTC+00:00 · ⚠ 时区是按经度估算的，请核对` —— 红字，可读，可见。
- **八字**：`1994-08-01 11:45 · 男命 · 日主 己土 …` —— **一个字都没有**。同一份时区不确定性，在八字页完全不可见。

也就是说：**时区兜底的提示只存在于 1/16 个面板**，而八字/紫微/六爻/奇门这些对时柱更敏感的盘，恰恰不提示。

> 补充：`tzFallback`/`tzEstimated` 在 core 里只由 `paipanXingpan` 返回，八字/紫微的返回结构里根本没有这两个字段 —— 想显示也得先让 core 把它们吐出来。

---

## 五、错误文案质量评级

### A 级（合格，可给人看）

| 文案 | 位置 | 评价 |
|---|---|---|
| 请先输入码 / 码不完整 / 码校验失败，可能抄错了 / 码里有不认识的字符 / 码的版本 vN 本版不支持 | `sharecode.js:202-216` | 精准、可执行、有红字态 |
| 时间无效，请重新选择 | `main.js:163` | 简洁明确 |
| 起卦时间无效，请重新选择 | `cast.js:76` | 同上 |
| 时刻无法识别，请重新选择 | `hecanview.js:440` | 同上 |
| 你拒绝了定位权限，可改用手搜城市 / 定位超时，可改用手搜城市 | `geo.js:89,79` | 给了下一步动作，优秀 |
| 本机浏览器不支持定位 | `geo.js:77` | 说明限制而非归咎用户 |
| 这个浏览器不支持方向传感器，请用手动选方位 | `yangzhaiview.js:551` | 替代路径清楚 |
| 复制失败，请长按选择 | `state.js:165` | 兜底动作明确 |
| 时区须为 −12 ~ +14 之间的小时数 | `astroview.js:205` | 约束明确 |
| 此码规则 vN，当前 vM，结果或有差异 | `main.js:330` | 版本错位有交代 |
| 地占：无法生成合法法官（偶数点），已重试 64 次 | `geomancyview.js:177` | 连重试次数都给了 |
| 牌局还原失败 / 地占还原失败 / 藏占还原失败 / 宅盘还原失败 | `main.js:370-398` | 中文可读，但无"怎么办" |

### B 级（能看懂，但信息不足）

| 文案 | 位置 | 问题 |
|---|---|---|
| 紫微排盘失败：invalid solar date. | `ziweiview.js:602` | 中文前缀 + **英文库原文**，用户不知道"是我输错了还是程序坏了" |
| 印度占星盘计算失败：… | `vedicview.js:322` | 同款，后半段取决于 `e.message` |
| 计算失败，已回退本命 | `astroview.js:535` | 没说是哪个盘、为什么回退 |
| 本轨仅 N 盘有结果，无法交叉 | `verdicts.js:522` | 半技术话术 |

### C 级（开发者文案泄漏到用户视野 / 只进控制台）

| 内容 | 位置 | 性质 |
|---|---|---|
| `[home] 刷新失败`、`[sky] 天象条失败`、`[timebars] 同步失败`、`[place] 重算失败`、`[refresh] 初始化失败`、`[qintian] 生成码失败`、`[qintian] 自动留档失败` | `main.js` | console-only，用户永远看不到 |
| `TypeError: Cannot read properties of null (reading 'lat')` 等 | core 抛出的原生英文异常 | 若被 B 级文案的 `${e.message}` 透传，就是"undefined is not a function"式体验（紫微/吠陀/星盘三处均透传） |
| `定位失败：${err.message}` | `geo.js:89` | `message` 为浏览器英文原文（如 `User denied Geolocation`）时不可读 |

### 总评

**文案底子很好（A 级 12 条），坏在"该说话的地方没有人写文案"**：不是文案质量差，是失败路径压根没有文案位。凡是开发者想到过的错误（码、时间、定位、传感器），文案都是 A 级；凡是没想到的（模块加载、渲染抛错、核心异常、降级警告），一律静默。

---

## 六、修复优先级（建议，未改代码）

**P0 — 立刻有"声音"**
1. 在 `index.html` 的**内联**脚本（不能是 module，否则模块挂了自己也挂）里装三件套：`window.addEventListener('error', cb, true)`（捕获阶段可拿到 script 的 404）、`unhandledrejection`、加载超时（如 10s 后 `.qt-skeleton` 仍在 → 显示"资源加载失败，请点右下角刷新"）。
2. 把 `safeHome/safeSky/safeBars` 的 `console.warn` 升级为可见降级条（顶部细红条 + 重试按钮），至少首页一处。
3. `.qt-skeleton` 加超时态：>8s 未卸载 → 显示"加载失败"而非一直转。

**P1 — 别静默算错**
4. 消费 core 的 `warnings[]`：八字/紫微/奇门页顶部加"计算提示"折叠条（尤其是时区兜底、DST 还原、真太阳时未校正）。
5. `rhythmview.js` 三处空 catch 加"本段计算失败"占位；`gender` 默认不要写死 `'男'`，改成未设置时显式提示。
6. `sharecode` 去掉 `lon ?? 120 / lat ?? 30`，改为"无坐标 = 不带坐标"，并在码里带上城市/地名（否则对方打开=别人的城市）。
7. `vedicview.js:328` 的 `（UTC+8）` 改成实际时区。

**P2 — 文案与一致性**
8. 紫微/吠陀/星盘三处 `e.message` 透传前做一层映射（英文库异常 → 中文，"invalid solar date" → "这个日期在该历法里不存在（1582 年 10 月缺 10 天），请换一天"）。
9. `openByCode` 里排盘调用包 try；`cast.js:81,83` 包 try 并把失败 toast 出来。
10. R4 的"失败 + 已排盘"双提示：失败时不要再弹成功 toast。
11. 极端年份（<1900 或 >2100）入口处给"超出天文算法可信区间"提示 —— 现在 9999 年能排出完整八字，看起来一样可信。

---

## 附录 · 证据与复现

| 项 | 值 |
|---|---|
| 基线端口 | 8099 → `app/`（200） |
| 故障副本 | 8100 `liuyao-core.js→.BAK`、8101 `three.module.js→.BAK`、8102 `rm astromodes.js` |
| 降级态 | `BODYLEN=44`、`SKELETONS=3`、`EMPTY=29/29` |
| SW | `qintian-v133`、254 条缓存、`controller=true`、断网重载 `BODYLEN=728` |
| 静态统计 | 76 个 js、`try` 143 / `catch` 146、空 `catch` 30、import 195 条（**全部带 `?v=133`**）、全局错误处理器 **0** |
| 截图 | `shots/00_home_ok.png`、`shots/01_vendor404_shell.png`、`shots/04_tz_warn_visible.png`、`shots/05_ziwei_invalid_date.png`、`shots/06_toast_time_invalid.png` |

关于版本错位（第 7 项审计点）：`?v=133` 在 195 条 import 里**无遗漏**，`sw.js` 对 `.js` 走 `networkFirst`，`force-refresh.js` 会清 Cache Storage + 注销 SW + 带 `_r` 时间戳重载（2.5s/2s 双超时，且明确不碰 localStorage）。因此"新旧 JS 混跑"的真正风险只剩一种：**发版时忘记同时递增 `?v=` 与 `CACHE` 版本**——这是流程风险，代码侧已做到能做的最好。
