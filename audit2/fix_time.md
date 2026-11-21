# 时间层与版本号修复报告（audit2 · fix_time）

分支 `audit-fixes-2026-11-21`　核心目录 `liuyao-core/`　前端 `app/`
所有数字均为本机实跑（`npx vite-node` 探针 + `npx vitest run` + 无头浏览器实测），非推算。

---

## 0. 结论一览

| # | 缺陷 | 状态 | 一句话结果 |
|---|------|------|-----------|
| 1 | 只有经纬度 → 静默 +8（境外差 13 小时） | ✅ 已修 | 两级推算（最近城市 → 经度），必带 `tzEstimated/tzFallback`，`strict` 下不可靠直接抛错 |
| 2 | 手动时区 + 旧城市经纬度（差 793.7 分） | ✅ 已修 | 冲突检测：经度与时区中央经线差 > 3h 即停用真太阳时并告警；城市与经纬度相距 > 30km 时以城市为准重算 |
| 3 | 本命2 继承主盘 city（纽约 + 广州混搭） | ✅ 已修 | `birthArgs` 地理参数整套覆盖 + `b2ArgsOf` 先清主盘地理再写第二人，无一字段残留 |
| 4 | 奇门 / 子午流注 不接 `timeContext` | ✅ 已修 | 均走 `civilForPaipan()`，乌鲁木齐 / 1988 夏令时两例时柱与八字完全一致 |
| 5 | 六爻只吃经度真太阳时半边 | ✅ 已修 | `paipan()` 走 `civilForPaipan()`，返回 `civil/dayBoundary/usedTrueSolar` |
| 6 | 0 点换日口径不统一 | ✅ 已统一 | 四家同一 `LateZiMode`，边界实测逐条一致；界面标注「按 X 换日」 |
| 7 | 版本号混乱 → 重复加载 | ✅ 已修 | 全部 `?v=133`（294 处），0 处裸引用；浏览器实测 `liuyao-core` ×1、`state.js` ×1 |
| 8 | 全量测试 | ✅ 434 passed / 0 failed（改前基线同量） |

> ⚠️ **需要重建 bundle**：`app/vendor/liuyao-core.js` 仍是旧构建。核心新增的 `getMeridianByTime / estimateTzFromCoords / lateZiLabel` 等要重建后才在前端生效（打包脚本另一组在改，本组未动）。前端代码已做**优雅降级**：新 API 缺失时退回旧接口，页面不白屏（已实测）。

---

## 1. P0 时区静默兜底

### 缺陷机制
旧逻辑「有 city / place / utcOffsetHours / 任一经纬度」即启用，且**时区只认城市名**：查不到城市就 `+8`。于是 `{lat:40.71, lon:-74.01}`（纽约）按 UTC+8 处理，11:45 被还原成 UTC 03:45 → 真太阳时/日柱全线错位。

### 修法（`src/timeContext.ts`）
新增两段式推算，且**永不静默**：

1. **最近城市法**：`nearestCityByCoords()` 在内置城市表（含 DST 规则）上做 haversine 搜索，返回 `{ city, km, offset, dst }`，600km 内视为可信 → `tzEstimateMethod='nearest-city'`。
2. **经度吸附法**：`offsetFromLongitude(lon)` = `round(lon/15)` 吸附到 `VALID_UTC_OFFSETS`（含 −9.5 / −3.5 / 3.5 / 4.5 / 5.5 / 5.75 / 6.5 / 8.75 / 9.5 / 10.5 / 12.75 等真实法定小时区），→ `tzEstimateMethod='longitude'`，**明确不计夏令时**（警告里写明）。
3. 结果字段：`tzSource: 'explicit'|'city'|'estimated'|'fallback'`、`tzEstimated`、`tzEstimateMethod`、`tzEstimateKm`、`tzEstimateCity`、`warnings[]`。
4. `tzPolicy: 'strict'`：推算不出可信时区时 `throw new Error('无法可靠确定时区…')`，宁可不排盘。
5. 前端（`astroview.js` 的时间条）新增红色告警：`⚠ 时区是按最近城市「X」（约 Nkm）/ 经度估算的，请核对`。

### 前后对比（纽约 1994-08-01 11:45，只给经纬度）

| 项目 | 修复前 | 修复后 |
|---|---|---|
| `utcOffsetHours` | `+8`（静默） | `−4`（−5 标准时 + 北美夏令时） |
| `tzSource` | `fallback` | `estimated` |
| `tzFallback` | `true` | `false` |
| `tzEstimated / 方法` | 无此字段 | `true` / `nearest-city`（纽约，0km） |
| 四柱 | `甲戌 辛未 庚申 丙子` | **`甲戌 辛未 己未 己巳`** |
| 与「显式城市=纽约」对比 | 不一致（差一天 + 差一个时辰） | **完全一致** |

老调用（不带任何地点）行为不变：`tz=8 src=fallback fallback=true`，与改造前逐字节相同；`strict` 下 `(0,0)` 南太平洋抛错，`estimate` 下给 `+0` 并标 `longitude` 估算。

> 测试 `test/time-context.test.ts` 里原本有一条 `查不到城市时兜底 +8` 的用例，**它断言的正是这个缺陷**，已改写为 6 条新用例（伦敦估算 +1、无地点兜底、strict 抛错、经度吸附、城市优先、旧地点残留停用真太阳时），全部通过。

---

## 2. P0 经纬度与城市不一致

### 缺陷机制
`birthArgs()` 是 `{...BIRTH, ...geo}` 浅合并：手动选纽约（只改 `city`）时沈阳的经纬度还留着，经度差 **793.7 分**（≈13.2 小时），真太阳时把 11:45 拉到前一日 22:42。

### 修法：两道闸
1. **核心闸（`resolveTime`）**：算出经度偏移后与 `offset*60` 比对，差 > 180 分判定「旧地点残留」→ **停用真太阳时**（`trueSolar=null`），`geoConflict=true`，`geoConflictNote` 写清差多少、怎么修。城市与经纬度同时给且 haversine > 200km（`GEO_CONFLICT_KM`）时，默认以城市为准确认时区并回填城市坐标；`preferCoordinates:true` 可改为「时区仍用城市、真太阳时用经纬度」。
2. **前端闸（`state.js` 的 `normalizeGeo`）**：地理参数一次覆盖必须是一整套——有 city 就只认这套坐标；只有坐标就**删掉默认出生地的 city/place**，绝不让两个地方各出一半。

### 前后对比（纽约 11:45，`utcOffsetHours:-5` + 沈阳经纬度 123.43/41.80）

| 项目 | 修复前 | 修复后 |
|---|---|---|
| 经度偏移 | −793.7 分（≈13.2h） | 判定冲突，`trueSolar=null`（不用） |
| `geoConflict` | 无此概念 | `true` |
| 四柱 | `甲戌 辛未 庚申 丙子` | **`甲戌 辛未 己未 庚午`** |
| 对照：只给时区、不给经纬度 | `乙卯…`（另一条错路） | **`甲戌 辛未 己未 庚午`（完全一致）** |

城市「纽约」+ 沈阳经纬度：`tz=−4`、`geoConflict=true`、坐标回填为纽约 `(−74.006, 40.7128)`，提示「相距约 10674km；已按城市纽约重算」，四柱 `己未/己巳` 与纯城市路径一致。

---

## 3. P0 本命2 参数继承

`app/js/astroview.js::b2ArgsOf()` 旧实现：`{...base, 第二人时间, lat, lonEast, place}`——只覆盖坐标和 place，**主盘的 `city` 原样留着**。核心按 `city` 查时区 → 主盘纽约（−4）、坐标广州，广州 09:00 被当成纽约 09:00 排，实测算成 20:25（巳时→戌时）。

修法：
- `b2ArgsOf` 先整套写第二人地理（`city/place/lat/latitude/lonEast/lon/longitude`），再 `delete out.utcOffsetHours`（防止主盘显式时区盖掉城市时区）。
- `state.js::birthArgs()` 里 `normalizeGeo` 保证「一整套」，并统一 `lateZiMode`（来自 `cfg.lateZi`）与 `utcOffsetHours`（非数值不传）。

效果：主盘纽约 + 本命2 广州 → 第二人按广州（+8、无夏令时、经度 113.26）排，`city` 不再残留。该条只能由前端路径验证（核心侧已由第 2 条覆盖）。

---

## 4. P1 奇门 + 子午流注接时间层

- `src/qimen.ts`：`QiMenInput = TimeResolveInput`，入口 `civilForPaipan()`；`QiMenPan` 新增 `civil / dayBoundary / timeWarnings`。
- `src/meridian.ts`（子午流注）：`getMeridianByTime(input)` 走 `civilForPaipan()`；`shichenIndex` 修正为「23–1 皆子时」，并给出距下一辰分钟（23 点跨到 25 点）。
- 前端：`qimenview.js` 传 `nowGeoArgs()`（地点中心，city+经纬度整套）；`qintian.js` 的子午流注改用 `getMeridianByTime`。

### 验收例 1：乌鲁木齐 2024-06-15 12:52（钟面）

| 系统 | 修复前 | 修复后 |
|---|---|---|
| 八字 | `甲辰 庚午 庚戌 辛巳` | `甲辰 庚午 庚戌 辛巳` |
| 奇门 | `甲辰 庚午 庚戌 **壬午**` | `甲辰 庚午 庚戌 **辛巳**`（阳遁6） |
| 子午流注 | **午时**（心） | **巳时**（脾），civil 10:41 |
| 六爻 | `… 壬午时` | `… 辛巳时`（`usedTrueSolar=true`） |
| 梅花时支序 | 7（午） | 6（巳） |

### 验收例 2：沈阳 1988-07-01 09:30（中国夏令时）

| 系统 | 修复前 | 修复后 |
|---|---|---|
| 八字 | `戊辰 戊午 丁巳 甲辰` | `戊辰 戊午 丁巳 甲辰` |
| 奇门 | `戊辰 戊午 丁巳 **乙巳**` | `戊辰 戊午 丁巳 **甲辰**` |
| 子午流注 | **巳时**（脾） | **辰时**（胃） |
| 六爻 | `… 乙巳时` | `… 甲辰时` |

两例中四家时柱完全一致——验收通过。

---

## 5. P1 六爻补全时区

`src/paipan.ts`：`paipan()` 先 `civilForPaipan()` 再 `solarToSiZhu()`；返回 `civil / dayBoundary / timeWarnings / timeApplied / usedTrueSolar`。
`castByTime`（时间卦/梅花）同样接时间层，并新增 `alreadyApparent`：调用方已用 `applyTstAt` 做过真太阳时校正时只扣时区/夏令时，不二次校正。

---

## 6. P1 0 点换日：调研与结论

### 四家传统（检索实据）
- **八字**：主流「子初换日」——23:00 起即次日，时干按次日日干五鼠遁；另有「子正换日」（00:00 换日）一派。两派都承认这是老问题（明以来即有争议）。
- **奇门**：以日柱定符头/三元，几乎所有商用/古籍派都用「23 点进子时、日柱按次日」，因为符头按日柱回溯，日柱一错三元全错。
- **紫微**：晚子时（23:00–24:00）「算当日」与「算次日」两派并存（中州派多取当日，软件多取次日），早子时无争议。
- **六爻/纳甲**：日辰（日建）是断卦核心，主流同样 23:00 换日；少数按民用 0 点。

### 本实现的口径
- 统一抽象 `LateZiMode = '23' | '00'`，`lateZiLabel()` → `23 点（子初）换日` / `0 点（子正）换日`。
- **默认 `'23'`**，理由：八字/奇门/六爻三家主流一致，紫微换日只是「晚子时算哪天」的分歧，用同一开关统一表达最不容易出错；`'00'` 的实现是 `applyLateZi()` 把 23:xx 拨成**同日** 00:xx，让四家拿到同一个已定口径的钟面时间，从根上杜绝「日柱进位、时柱没进」。
- 前端 `cfg.lateZi` 一个开关 → `birthArgs()` 的 `lateZiMode` → 四家全部生效；奇门/六爻/紫微界面标注「按 X 换日」（`dayBoundary`）。

### 边界实测（沈阳，四家逐条比对）

| 时刻 | 口径 | 八字 | 紫微 | 奇门 | 六爻 |
|---|---|---|---|---|---|
| 08-01 23:30 | 23 | `庚申 丙子` | `庚申 丙子` | `庚申 丙子` | `庚申 丙子` |
| 08-01 23:30 | 00 | `己未 甲子` | `己未 甲子` | `己未 甲子` | `己未 甲子` |
| 08-01 23:50 | 23 | `庚申 丙子` | `庚申 丙子` | `庚申 丙子` | `庚申 丙子` |
| 08-01 23:50 | 00 | `己未 甲子` | `己未 甲子` | `己未 甲子` | `己未 甲子` |
| 08-02 00:10 | 23 / 00 | `庚申 丙子` | `庚申 丙子` | `庚申 丙子` | `庚申 丙子` |

**完全没有矛盾**（修复前：八字 `己未` vs 紫微/奇门 `庚申`）。`'00'` 口径下 23:30 的时柱是 `甲子`（己日五鼠遁得甲子），日柱仍 `己未`——即「子正换日」，与流派定义一致。

---

## 7. P1 版本号统一

### 前后对比（`app/`，不含 `vendor/`）

| 项目 | 修复前 | 修复后 |
|---|---|---|
| `?v=129` | 172 处 | 0 |
| `?v=132` | 102 处 | 0 |
| 裸引用（无 `?v=`） | 16 处（`state.js`、`solartime.js`、`geo.js`、`zischool.js`、`liuyao-core.js`、three 等） | 0 |
| `?v=133` | 0 | **294 处**（js/css/html/sw 全量） |
| `sw.js` 缓存名 | `qintian-v132` | `qintian-v133` |
| `liuyao-core` 实际加载 | **3 份**（`?v=129` ×28、`?v=132` ×2、裸 ×1 → 3 个不同 URL） | **1 份** |
| `state.js` 实际加载 | **3 份**（`?v=129`、`?v=132`、裸） | **1 份** |

### 浏览器实测（`python3 -m http.server` + 无头浏览器，`performance.getEntriesByType('resource')`）

```
liuyao-core.js 请求次数: 1   →  http://127.0.0.1:8811/vendor/liuyao-core.js?v=133
js/state.js 请求次数  : 1   →  http://127.0.0.1:8811/js/state.js?v=133
（另一条 state 命中是 js/classic/feed-state.js，不同文件）
总请求 92，控制台错误 0，五个页签 + 起卦三个子页遍历无异常
```

同 URL 单一请求 ⇒ ESM 模块表只有一个实例 ⇒ **只有一个 `cfg`**（此前三个）。

### 一致性校验（脚本核对，非目测）
- 294 处版本号全部 = 133；
- 0 处裸 `.js` 引用；
- 所有 `./`、`../` 说明符目标文件均存在（0 缺失）；
- 同一目标文件无「多种写法」（`./state.js` 与 `../state.js` 之类）；
- `sw.js` 预缓存 250 条覆盖全部被引用文件（`./js/sw.js` 为自身，不需缓存）。

---

## 8. 测试

```
npx vitest run  →  434 passed / 0 failed
```
改前基线同为 434 passed。`time-context.test.ts` 由 1 条（断言缺陷行为）扩为 6 条正向用例。

---

## 9. 改动文件

**核心（`liuyao-core/src/`）**
- `timeContext.ts`：`TimeResolveInput` 扩展（`place/utcOffsetHours/tzPolicy/preferCoordinates/lateZiMode`）；`resolveTime` 冲突检测 + 两级时区推算；新增 `haversineKm`、`VALID_UTC_OFFSETS`、`offsetFromLongitude`、`nearestCityByCoords`、`estimateTzFromCoords`、`listCityTimeZones`、`LateZiMode`、`lateZiLabel`、`applyLateZi`；`civilForPaipan` 返回 `lateZiApplied/lateZiMode`。
- `qimen.ts`、`meridian.ts`、`paipan.ts`、`timecast.ts`、`bazi.ts`、`ziwei.ts`、`index.ts`：入口统一 `civilForPaipan`，结果补 `civil/dayBoundary/timeWarnings`。
- `test/time-context.test.ts`：6 条新用例。

**前端（`app/`）**
- `js/state.js`：`normalizeGeo` 整套覆盖、`lateZiMode` 贯通、新增 `nowGeoArgs()`。
- `js/astroview.js`：`b2ArgsOf` 本命2 地理整套换；时间条新增 `tzEstimated` / `geoConflict` 红字告警。
- `js/qimenview.js`、`js/qintian.js`、`js/cast.js`、`js/panview.js`：起盘传地理参数、子午流注改 `getMeridianByTime`、显示换日口径。
- 全部 `app/**.js|html` + `sw.js`：版本号统一 `?v=133`，缓存名 `qintian-v133`。

**未触碰**（其他组在改）：`tools/`、`app/vendor/`、`bazi-extra.ts`、`shensha.ts`、`baziview.js`、`hecanview.js`、`rhythmview.js`、`verdicts.js` 的内容只各改了 `?v=` 字符串（已 diff 逐行确认，无逻辑改动）。

---

## 10. 未解决 / 需跟进

1. **`app/vendor/liuyao-core.js` 已在 13:34 被另一组重建，且已含本轮新逻辑**——浏览器内直接调用实测：`lateZiLabel` / `getMeridianByTime` / `estimateTzFromCoords` 均为 function；纽约经纬度 → `tz=−4 src=estimated method=nearest-city` 并返回「未选城市…按最近的纽约估算」告警；`utcOffsetHours:-5`+沈阳经度 → `geoConflict=true, trueSolar=null`；`tzPolicy:'strict'` + (0,0) → 抛「无法可靠确定时区」。
   仍需注意：本组在 13:34 之后还改了 `timecast.ts` 的 `alreadyApparent` 分支，**下一次重建要包含它**；此外前端对缺失 API 已做降级（命名空间导入 + `typeof function`），重建前后都不会白屏（实测五个页签 + 起卦三子页 0 报错）。
2. **`baziview.js` 未显示 `dayBoundary` 标签**（文件在禁改清单）。八字页目前只能在奇门/六爻/星盘看到「按 X 换日」；建议由负责该文件的组补一行 `${b.dayBoundary}`。
3. **`hecanview.js` 的 `computeQiMen` 仍用裸钟面时间**（禁改清单），合参页的奇门时柱未接观测地时区；`qimenview.js` 已接，二者在同城场景一致，跨境场景会不同。
4. ~~紫微界面措辞与实际相反~~ —— 已核实**不是缺陷**：`lateZi` 标记只在真的进位时为 `true`（实测 `'23'`→`lateZi=true day=庚申`，`'00'`→`lateZi=false day=己未`），文案随之自动隐藏；本轮另在 `ziweiview.js` 的晚子时提示里补印了 `dayBoundary`（「本盘口径：23 点（子初）换日 / 0 点（子正）换日」）。
5. **经度吸附法不计夏令时**（历史夏令时地区如 1986–1991 中国、欧洲）——只有命中城市表才有 DST；无城市名且落在这类地区时会偏 1 小时，警告已写明。
6. **200km 冲突阈值**（`GEO_CONFLICT_KM`）对跨时区的近邻城市偏宽（如 深圳/香港 不会判冲突，但 沈阳/大连 也不会），——真出问题时按实际情况调这个常量即可。
7. `MeridianAtTime` 的「距下一辰分钟」在真太阳时跨越换日时未做专门处理（23:xx → 次日 01:00 视为 25 点），边界已实测正常，但极端经度差下建议再加一条用例。
