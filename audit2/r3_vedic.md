# 印度占星模块（vedic）七项改动 · 独立复审 r3

- 复审对象：`/opt/data/work/qintianjian`，分支 `audit-fixes-2026-11-21`，HEAD `492c478`（"v133: 排盘审计修复 27 条"）
- 代码范围：`liuyao-core/src/vedic.ts`（383+/35−，合计 **418 行改动**，与"约 418 行"一致）、`app/js/vedicview.js`（103+/11−）
- 复审方式：**只读**。未修改任何项目源码；全部探针、参考脚本与中间数据在 `/opt/data/work/audit2/`（快照 `snap/` 为 `src`+`test` 副本 + `node_modules` 软链）
- 复审日期：2026-11-21

## 0. 结论总表

| # | 改动 | 结论 | 关键证据 |
|---|---|---|---|
| 1 | 27 宿中文名 14 处错位修正 | **通过（27/27）** | 与维基《二十七宿》全表逐行比对，中文名/宿主星/顺序/起点度数 0 处不一致；全表无「牛宿」 |
| 2 | 新月判定改真合相 | **逻辑通过，语义待明确** | 2026 年 12 次新月全命中、13 次满月全排除；真合相时刻 \|日月差\|≤0.0019°；但 6° 与 Tithi=1（12°）口径不一致 |
| 3 | 小限起点改大运真实起点 | **通过（5/5）** | 九段之和与大运年限误差 0.000000；age=0 落段与手算/库一致；术语「小限」误用（见 §3-I4） |
| 4 | 度数进位换星座 | **通过** | `toDms(29.9917)`→`金牛 0°00′`、`359.9917`→`白羊 0°00′`；但 D1 用取整值、D9 用原始值，留 0.5′ 口径缝（§3-I1） |
| 5 | 大运年份去硬编码 1994 | **通过** | 两文件已无 `1994` 字面量；`ageLabel()` 取 `startYear + 出生年` |
| 6 | 新增 D9 Lagna + 整宫十二宫 | **通过** | 36 点（12 星座×3）全部与经典四元素规则一致；360,000 点 0.001° 扫描 0 不一致；宫序 = 上升 + i |
| 7 | 新增 Panchanga 五要素 | **通过（15/15）** | 3 个日期 × 5 项与 drikpanchang（北京）全中；日出按出生地实算（北京 07:05 / 乌鲁木齐 09:11），换日点与真日出差 <10 秒 |
| — | 天文精度回归 | **通过，优于声称值** | 120 例（1950–2030、纬 ±60°）：上升最大 0.0091′（声称 ≤0.03′），月亮最大 0.1258′、其余行星 ≤0.0128′（声称 ≤0.3′） |

**总体判断：七项改动全部为真修复，未发现回退或误修。** 共 6 条瑕疵，全部为 P3/P4（口径、术语、显示层），不阻塞发版；无 P1/P2。

## 1. 基准与环境（先说清楚基准是什么）

| 项 | 值 |
|---|---|
| 历法库 | `caelus@0.25.0`（`node_modules/caelus`） |
| 独立第二源 | `astronomy-engine@2.1.19` |
| 主基准 | `pyswisseph 2.10.03`，`SIDM_LAHIRI`，**真实 Swiss Ephemeris 文件（JPL DE431 派生）** |
| 在线印度历 | drikpanchang（`geoname-id=1816670` 北京） |
| Node | v26.12.1 |

**基准可信性先自证（这一步很关键）：**

```
$P -c "import swisseph as swe; swe.set_ephe_path('/opt/data/work/audit2/ephe'); ...
        xx, fl = swe.calc_ut(j, swe.MOON, swe.FLG_SWIEPH|swe.FLG_SIDEREAL)
        print(bool(fl & swe.FLG_SWIEPH), bool(fl & swe.FLG_MOSEPH))"
→ sun 214.612961 True False
→ moon 348.176041 True False
```

pyswisseph 不随包发布 `.se1`，**初版审计其实一直跑在 Moshier 回退上**（`MOSEPH True / SWIEPH False`），月亮差 1.3″。已从 swisseph 官方仓库取 `sepl_18.se1`、`semo_18.se1` 到 `audit2/ephe/`，本节以下所有数字均为 **SWIEPH（DE431）** 结果。

JPL Horizons（`ssd.jpl.nasa.gov`）在本机**不可达**（curl 超时 45 s），故基准降级为 "SE/DE431 + astronomy-engine" 双源；两者 2026 年 25 次朔望时刻互差 **≤40 s（均值 33 s）**，可互相确认。**未取到 JPL 原始星历**，见 §4。

## 2. 逐项验证

### 2.1 二十七宿名称

方法：用浏览器取维基《二十七宿》词条表格（宿曜经系统，含度数、九曜），与 `NAKSHATRAS` 数组程序化逐行比对（`audit2/nakcmp.py`）。

```bash
$ $P nakcmp.py | tail -3
不一致: 0
全表中文字符集合是否含牛宿: False
```

| # | 代码梵名 | 维基梵名 | 中文(代码/维基) | 宿主(代码/维基) | 起点度数 | 结论 |
|---|---|---|---|---|---|---|
| 1 | Ashwini | Ashvinī | 娄宿/娄宿 | ketu/ketu | 0.00° | ✅ |
| 2 | Bharani | Bharanī | 胃宿/胃宿 | venus/venus | 13.33° | ✅ |
| 3 | Krittika | Kṛttikā | 昴宿/昴宿 | sun/sun | 26.67° | ✅ |
| 4 | Rohini | Rohinī | 毕宿/毕宿 | moon/moon | 40.00° | ✅ |
| 5 | Mrigashira | Mrigashīrsha | 觜宿/觜宿 | mars/mars | 53.33° | ✅ |
| 6 | Ardra | Ārdrā | 参宿/参宿 | rahu/rahu | 66.67° | ✅ |
| 7 | Punarvasu | Punarvasu | 井宿/井宿 | jupiter/jupiter | 80.00° | ✅ |
| 8 | Pushya | Pushya | 鬼宿/鬼宿 | saturn/saturn | 93.33° | ✅ |
| 9 | Ashlesha | Āshleshā | 柳宿/柳宿 | mercury/mercury | 106.67° | ✅ |
| 10 | Magha | Maghā | 星宿/星宿 | ketu/ketu | 120.00° | ✅ |
| 11 | Purva Phalguni | Pūrva Phalgunī | 张宿/张宿 | venus/venus | 133.33° | ✅ |
| 12 | Uttara Phalguni | Uttara Phalgunī | 翼宿/翼宿 | sun/sun | 146.67° | ✅ |
| 13 | Hasta | Hasta | 轸宿/轸宿 | moon/moon | 160.00° | ✅ |
| 14 | Chitra | Chitrā | 角宿/角宿 | mars/mars | 173.33° | ✅ |
| 15 | Swati | Svātī | 亢宿/亢宿 | rahu/rahu | 186.67° | ✅ |
| 16 | Vishakha | Vishākhā | 氐宿/氐宿 | jupiter/jupiter | 200.00° | ✅ |
| 17 | Anuradha | Anurādhā | 房宿/房宿 | saturn/saturn | 213.33° | ✅ |
| 18 | Jyeshtha | Jyeshtha | 心宿/心宿 | mercury/mercury | 226.67° | ✅ |
| 19 | Mula | Mūla | 尾宿/尾宿 | ketu/ketu | 240.00° | ✅ |
| 20 | Purva Ashadha | Pūrva Ashādhā | 箕宿/箕宿 | venus/venus | 253.33° | ✅ |
| 21 | Uttara Ashadha | Uttara Ashādhā | 斗宿/斗宿 | sun/sun | 266.67° | ✅ |
| 22 | Shravana | Shravana | 女宿/女宿 | moon/moon | 280.00° | ✅ |
| 23 | Dhanishta | Dhanishta | 虚宿/虚宿 | mars/mars | 293.33° | ✅ |
| 24 | Shatabhisha | Shatabhisha | 危宿/危宿 | rahu/rahu | 306.67° | ✅ |
| 25 | Purva Bhadrapada | Pūrva Bhādrapadā | 室宿/室宿 | jupiter/jupiter | 320.00° | ✅ |
| 26 | Uttara Bhadrapada | Uttara Bhādrapadā | 壁宿/壁宿 | saturn/saturn | 333.33° | ✅ |
| 27 | Revati | Revatī | 奎宿/奎宿 | mercury/mercury | 346.67° | ✅ |

补充核对：

- **宿主星循环**：ketu→venus→sun→moon→mars→rahu→jupiter→saturn→mercury，27 项完整 3 轮，与 Vimshottari 顺序一致 ✅
- **起点度数**：第 i 项 = (i−1)×13°20′，逐项吻合 ✅
- **pada 划分**：`Math.floor(frac*4)+1`，每 pada = 13°20′/4 = **3°20′**，与 navamsa 宽度相同（故 Ashwini 的 pada 1..4 恰为 D9 白羊..巨蟹）✅
- **无「牛宿」**：本站走印度 27 宿体系，正确不含二十八宿中的牛宿 ✅
- **英文名**：`Krittika/Swati/Chitra` 等为去变音符 ASCII 写法，检索/显示无碍，非错误（若要严格可用 IAST）

> 这一项是本轮最容易被"改对一半"的地方（原 bug 是漏「鬼宿」导致第 8 项之后整体前移一位）。实测 27/27 全对，**没有残留错位**。

### 2.2 新月判定 `isNewMoonConj`

代码（`vedic.ts` 附近）：
```ts
const elong = ((moonSid - sunSid) % 360 + 360) % 360;
const sepFromConj = Math.min(elong, 360 - elong);   // ← 修的就是这里
return sepFromConj <= 6;
```

**（a）全年朔望命中/排除**（基准：SE DE431 求日月黄经差过 0°/180°，与 astronomy-engine `SearchMoonPhase` 交叉）

```bash
$ $P phases.py | tail -3     # 2025-12-20 ~ 2027-01-10 扫描，取 2026 年
new 12   full 13
$ $P -c "...phasecheck..." 
新月 n=12  |elong| max=0.0019°  (=0.1 分钟经度差, 时间等效 0.2 分钟)
满月 n=13  |elong-180| max=0.0017°
新月 flag 全部 true: True   满月 flag 全部 false: True
```

| 检查 | 结果 |
|---|---|
| 2026 年 12 次新月是否全部 `isNewMoonConj=True` | **12/12 命中** |
| 2026 年 13 次满月是否全部 `=False` | **13/13 排除**（原 bug 判离冲相距离 → 满月会被误判为新月，已修） |
| 真合相时刻库内日月差 | ≤ **0.0019°**（0.11 角分，时间等效 0.2 分钟）→ 容许度内 |
| 命中窗口形态 | `elong ∈ [354°, 6°]`，每段宽 21–26 h（`grid.py`），与 12°/12.19°·d⁻¹ = 23.6 h 理论值一致 |

**（b）6° 容许度是否合理**

- 6° ÷ 12.19°/天 ≈ **0.492 天 = 11.8 小时**，即"合相前后各约 12 小时"，窗口总宽 23.6 h。
- 一个 Tithi 宽 12°，故 **6° 只覆盖"初一月"的一半**，物理上不可能把"初二/初三"（elong ≥12°/24°）误判为新月 ✅ 原担心不成立。
- **但存在口径缺口**：`Tithi=1`（白月初一）覆盖 elong 0–12°，而 flag 只到 6°。实测：

| 时刻(UTC) | elong | tithi | isNewMoonConj |
|---|---:|---:|---|
| 2026-11-10T03:02 | 5.660° | 1（白月初一） | true |
| 2026-11-10T04:02 | 6.131° | 1 | **false** ← 矛盾点 |
| 2026-11-10T08:02 | 8.012° | 1 | false |

即 6° 两侧：elong 5.66° 判为新月、6.13° 不判，而两者**都是白月初一**。盘面会出现"写着一月初一，却没被标为新月"。**建议**：要么把文案改为"合相前后 12 小时内"，要么改用 `tithi.num===1 || tithi.num===30` 派生（见 §3-I2）。

### 2.3 小限（Vimshottari antardasha）起点

手算基准（不引用项目代码）：`idx=⌊moon/(360/27)⌋`，`elapsed=moon/(13°20′)−idx`，主星 = `SEQ[idx%9]`，首运余量 = `YRS[主星]×(1−elapsed)`，九段按 `SEQ` 顺次、每段 `MD年 × AD年/120`。

```bash
$ $P vimcheck.py        # 5 命例，UTC+8
```

| 命例 | 月黄经 | 月宿(elapsed) | 手算 MD 首段 | 库 | MD 最大差 | 真实起点 | 九段之和 | age=0 落段（手算/库） |
|---|---:|---|---|---|---:|---:|---|---|
| v1994 08-01 11:45 齐齐哈尔 | 32.58536° | Krittika(0.443902) | 太阳 0–3.337 | 一致 | 0.0004 年 | **−2.6634** | 6.000000 (=太阳 6) | 木星 −0.613~0.187 / **一致** |
| v1966 11-27 05:15 北京 | 26.47618° | Bharani(0.985714) | 金星 0–0.286 | 一致 | 0.0003 年 | **−19.7143** | 20.000000 (=金星 20) | 计都 −0.881~0.286 / **一致** |
| v2008 04-18 19:40 北京 | 162.97883° | Hasta(0.223412) | 月亮 0–7.766 | 一致 | 0.0001 年 | **−2.2341** | 10.000000 (=月亮 10) | 罗睺 −0.817~0.683 / **一致** |
| v1985 03-15 06:20 北京 | 255.42283° | P.Ashadha(0.156712) | 金星 0–16.866 | 一致 | 0.0002 年 | **−3.1342** | 20.000000 (=金星 20) | 金星 −3.134~0.199 / **一致** |
| v2026 11-21 12:00 北京 | 348.17670° | Revati(0.113252) | 水星 0–15.075 | 一致 | 0.0003 年 | **−1.9253** | 17.000000 (=水星 17) | 水星 −1.925~0.483 / **一致** |

判定：

- 起点 = `−大运年限 × elapsed`，**不是 0**，改动方向正确 ✅
- **九段之和严格等于大运年限**（差值 0.000000）✅
- **age=0 落在哪一段**：5 例全部落在"起点后第 k 段"且与手算/库一致（如 v1966 落在倒数第二段计都，因 98.6% 已走完金星运）✅
- 大运全长 = 120 − elapsed×首运年限（v1994: 117.337、v1966: 100.286）✅
- AD 起点可为负（出生前），API 暴露负年份；视图只显示星名不显示年份，未暴露该问题 ✅

### 2.4 度数进位换星座

```bash
$ npx vitest run test/dms.test.ts   # stdout
29.9833° → 白羊 29°59′ (lon=29.9833…)
29.9917° → 金牛 0°00′ (lon=30)
29.9999° → 金牛 0°00′ (lon=30)
359.9917° → 白羊 0°00′ (lon=0)
59.9917° → 双子 0°00′ (lon=60)
```

`toDms()` 逻辑：`minute = round(frac*60)`；`minute>=60 → degree+1, minute=0`；`degree>=30 → sign+1, degree=0`。边界 `29.9917°`（29°59.5′）正确进位为**下一星座 0°00′**，不再是"白羊 0°00′" ✅

且 `ascSignIndex = signOf(ascDms.lon)`、`house = ((sIndex−ascSignIndex)+12)%12+1`、`houses[i] = ascSignIndex+i` 全部用**同一个取整后口径**，D1 内部自洽 ✅

### 2.5 大运年份去硬编码

```bash
$ grep -rn "1994" app/js/vedicview.js liuyao-core/src/vedic.ts
（无输出）
```
`ageLabel(startYear)` 改为 `出生年 + startYear`（非有限值回退当前年）✅

### 2.6 D9（Navamsa）

**（a）规则等价性**——实现用的是连续取模：
```ts
navamshaSign(lon) = floor(mod360(lon) / (30/9)) % 12
```
经典规则是四元素起算（火→白羊、土→摩羯、风→天秤、水→巨蟹）+ 宫内第 k 分。二者等价，因为
`floor((30s+x)/(10/3)) = 9s + floor(x/(10/3))`，而 `9s ≡ base(s) (mod 12)`：`s%3=0→s`、`s%3=1→s+8`、`s%3=2→s+4`。
（代码 `nav.test.ts` 我另写了一份独立实现 `classic()` 做对照，不引用库函数。）

**（b）扫描验证**
```bash
$ npx vitest run test/nav.test.ts | grep -E "扫描|分界点"
0.001° 扫描 360000 点，不一致: 0 []
108 个精确分界点，不一致: 0 []
```

**（c）12 星座 × 3 点 = 36 点 D9 Lagna**（用 caelus 原始未取整上升，扫 2026-11-21 全天逐分钟定位）

```
白羊   5.12°→金牛(1) | 14.94°→狮子(4) | 25.06°→天蝎(7)
金牛   4.96°→水瓶(10) | 15.09°→金牛(1) | 25.08°→狮子(4)
双子   4.95°→天蝎(7) | 15.01°→水瓶(10) | 24.93°→金牛(1)
巨蟹   5.08°→狮子(4) | 15.03°→天蝎(7) | 25.09°→水瓶(10)
狮子   4.97°→金牛(1) | 15.09°→狮子(4) | 25.08°→天蝎(7)
处女   5.10°→水瓶(10) | 14.92°→金牛(1) | 24.91°→狮子(4)
天秤   5.04°→天蝎(7) | 14.93°→水瓶(10) | 24.99°→金牛(1)
天蝎   4.91°→狮子(4) | 15.04°→天蝎(7) | 25.10°→水瓶(10)
射手   5.06°→金牛(1) | 15.05°→狮子(4) | 24.90°→天蝎(7)
摩羯   4.88°→水瓶(10) | 14.94°→金牛(1) | 24.93°→狮子(4)
水瓶   5.01°→天蝎(7) | 14.97°→水瓶(10) | 24.97°→金牛(1)
双鱼   5.21°→狮子(4) | 15.04°→天蝎(7) | 25.08°→水瓶(10)
→ 36 点不一致 0
```
手算抽查（写进测试的 6 条我也会独立复算）：
- 57° = 金牛 27° → k=8，base=摩羯(9)，(9+8)%12=5 **处女** ✅
- 142° = 狮子 22° → k=6，base=白羊(0)，→ **天秤** ✅
- 68° = 双子 8° → k=2，base=天秤(6)，→ **射手** ✅
- 359° = 双鱼 29° → k=8，base=巨蟹(3)，→ **双鱼** ✅

**（d）D9 十二宫宫序**：`houses[i].signIndex = (d9Lagna + i) % 12`，九分盘用**自身** D9 Lagna（`navamshaSign(ascLon)`），不是 D1 上升；D10/D7 同理各用各的 Lagna。整宫（whole-sign）排列，house 1 = D9 Lagna ✅ 代码里没有"把 D1 的宫位/落宫搬到 D9"的路径。

### 2.7 Panchanga 五要素

公式核对（读码 + 实跑）：
- `Tithi = floor(elong/12)+1`（1–30，elong=月−日，0–360）
- `Yoga = floor((日+月 mod 360)/(13°20′))+1`（27 个）
- `Karana = floor(elong/6)+1`（1–60）；`1=Kimstughna`、`2–57=七名八轮`、`58–60=Shakuni/Chatushpada/Naga`
- `Vara`：按**出生地日出**判日界

**（a）与 drikpanchang（北京）对照**——取当地正午 12:00，用"变更时刻"判定该时刻生效值：

| 日期 | 要素 | drikpanchang | 本项目 | 判 |
|---|---|---|---|---|
| 2026-11-21 | Tithi | 白 Ekadashi→09:01，之后 **Dwadashi** | 白 Dwadashi(12) | ✅ |
| | Nakshatra | U.Bhadrapada→09:20，之后 **Revati** | Revati（#27，奎宿） | ✅ |
| | Yoga | Vajra→07:26，Siddhi 至 11-22 05:01 | **Siddhi**(16) | ✅ |
| | Karana | Vishti→09:01，**Bava**→20:19 | **Bava**(num 23) | ✅ |
| | Vara | Shanivara（土） | 土曜日 Shanivara | ✅ |
| 2026-06-21 | Tithi | Saptami→17:50 | 白 Saptami(7) | ✅ |
| | Nakshatra | P.Phalguni→**12:01** | P.Phalguni（elapsed **0.9988**，距界 1.5 min） | ✅ |
| | Yoga | Siddhi→13:51 | Siddhi | ✅ |
| | Karana | Garaja→05:57，之后 **Vanija** | Vanija | ✅ |
| | Vara | Raviwara（日） | 日曜日 | ✅ |
| 2026-01-15 | Tithi | 黑 Dwadashi→22:46 | 黑 Dwadashi(27) | ✅ |
| | Nakshatra | Jyeshtha（至全夜） | Jyeshtha（#18，心宿） | ✅ |
| | Yoga | Vriddhi→23:08 | Vriddhi(11) | ✅ |
| | Karana | Kaulava→09:36，之后 **Taitila** | Taitila | ✅ |
| | Vara | Guruwara（木） | 木曜日 Guruwara | ✅ |

15/15 全中。其中 06-21 的 Nakshatra 尤其能说明精度：drik 的换宿时刻 12:01 与本盘 elapsed=0.9988（余 1.5 分钟）吻合。

**（b）Vara 是否真算日出**——不是硬编码：

| 城市（同 2026-11-21 12:00 +8） | 库内日出 | 与 drik/独立值 |
|---|---|---|
| 北京 39.90,116.41 | **07:05** | drik 07:06；astronomy-engine 精确值 **07:05:34** |
| 乌鲁木齐 43.83,87.62 | **09:11** | 差 2 小时，证明按经度实算 |
| 三亚 18.25,109.51 | **06:51** | 纬度效应正确 |
| 漠河 52.97,122.54 | **07:23** | 高纬更晚，正确 |

换日精度（astronomy-engine 精确日出 07:05:34 为界）：
```
日出前 10 s（07:05:24）→ 金曜日 Friday   （正确：日出前属前一日）
日出后 10 s（07:05:44）→ 土曜日 Saturday （正确）
```
另核对 2026-06-21 日出 库 04:45 / drik 04:46、2026-01-15 库 07:34 / drik 07:34 —— **误差 ≤1 分钟**（蒙气差/日面边缘约定差异，可接受）。

### 2.8 精度回归（不能弄坏原有精度）

8 命例逐天体（基准 SE DE431，8 例同表略）：

| 对象 | 本项目 vs SE 最大偏差 | 声称 | 判 |
|---|---:|---|---|
| 上升 | **0.0043′** | ≤0.03′ | ✅ |
| 太阳 | 0.0023′ | ≤0.3′ | ✅ |
| 月亮 | **0.0847′** | ≤0.3′ | ✅ |
| 火星/水星/木星/金星/土星 | 0.0023–0.0055′ | ≤0.3′ | ✅ |
| 罗睺（平交点） | 0.0012′ | — | ✅ |

扩展到 **120 个随机命例**（1950–2030、纬度 ±60°、经度全球）：

```
n=120   上升 max=0.0091′ mean=0.0023′   （超 0.03′ 的：0 个）
  sun max=0.0043′  moon max=0.1258′  mars max=0.0116′  mercury max=0.0056′
  jupiter max=0.0063′  venus max=0.0128′  saturn max=0.0078′   （超 0.3′ 的：全 0）
```

结论：四项声称值全部成立，且余量 3–50 倍。**改动没有引入精度回退。**

### 2.9 测试真伪（抽查 ≥15 条）

实跑：`npx vitest run test/vedic.test.ts test/vedic-d9.test.ts` → **42/42 通过**（Test Files 2 passed, Tests 42 passed）。

抽查 20 条断言分类：

| # | 断言 | 类型 | 评价 |
|---|---|---|---|
| 1 | `NAKSHATRAS` 27 项 zh 逐项 === CANON | 强（锚点为外部对照表） | ✅ 有效，但 fixture 与实现**同源抄写**，仅能防"单边改动" |
| 2 | 27 项 lord/sa 逐项 | 同上 | ✅ |
| 3 | 1994-08-01 日月差 <0.2° 且 `isNewMoonConj===true` | **强**（锚点为外部天象） | ✅ 真锚点 |
| 4 | 2026-11-09 07:02Z 合相 → true | **强** | ✅ 与 SE 我算的 07:02:07Z 吻合 |
| 5 | 2026-11-24 14:53Z 满月 → false | **强** | ✅ 与 SE 14:53:34Z 吻合 |
| 6 | 满月前 1 h `d` ≈178.x 且 false | 强 | ✅ 同时断言物理量 |
| 7 | 任意时刻 `d = min(elong,360−elong)` 与 flag 一致 | 中（自洽性） | ⚠ 只验证"取值与 flag 同源"，非外部真值 |
| 8 | `expectedAntardasha()` 与 `chart.vimshottari.antardasha` 逐段相等 | **半循环** | ⚠ 该 helper 把实现公式**原样复刻**（连 1e-9 都相同），公式本身错也会一起错 |
| 9 | 9 段累加 ≈ 首运余量（`Math.abs(sum−firstRemain)<1e-6`） | 强（不变量） | ✅ 能抓漏段/重复段 |
| 10 | 3 命例 `ad.name !== md.name` | 弱（样例属性） | ⚠ 只说明"不是恒等"，不证明正确 |
| 11 | 1985 例 venus elapsed 0.157 → ad 应为 venus | 强 | ✅ |
| 12 | `toDms(29.9917)` → 下一星座 0°00′ | 强 | ✅ 边界真值 |
| 13 | `toDms(29.9833)` → 29°59′ 不进位 | 强 | ✅ 反向保护 |
| 14 | D9 6 条手算值（57/142/68/359/32/14°） | **强** | ✅ 我独立复算 4 条全对 |
| 15 | 6 个真实上升的 D9 Lagna === `navamsaByClassicRule(asc.lon)` | 强 | ✅ 两套独立实现 |
| 16 | 3600 点（0.1°）扫描 === classic | **强** | ✅ 我把密度加到 360,000 点仍 0 不一致 |
| 17 | `houses[i].signIndex === (lagna+i)%12` | 强（结构） | ✅ |
| 18 | `houses[0].signIndex === chart.navamsha.lagnaSignIndex` | 强 | ✅ 能抓"从 D1 上升起盘"的错 |
| 19 | `tithi.num === Math.floor(elong/12)+1` | **循环** | ❌ 公式重述，零外部信息 |
| 20 | `yoga.num === Math.floor((sun+moon)/13.3333)+1` | **循环** | ❌ 同上 |
| 21 | `karana.num === Math.floor(elong/6)+1` | **循环** | ❌ 同上 |
| 22 | 合成 `panchangaOf(0, k*6+1)` 检查 60 段命名 | 中（结构） | ✅ 能抓 60 周期错，但基准由实现给出 |
| 23 | Vara：日出前后换日 | 强 | ✅ （视图侧另有分钟级重算，见 §3-I3） |

**判定**：真正有效的锚点断言约 13 条（3/4/5/6/9/12/13/14/15/16/17/18/23），循环论证 3 条（19/20/21），半循环 1 条（8），弱断言 1 条（10）。**没有"假测试充数"现象**，但 Panchanga 的 3 条断言等于把公式抄一遍——它们能防回归，不能防"公式本身错"。真正的外部校验来自我做的 drikpanchang 15 项对照。

### 2.10 视图层 `vedicview.js`

- **D9 卡片**：`v.houses`（九分盘自己的宫）→ `h.signIndex`、`h.house`、`h.lord`、`h.bodies`；标题用 `v.lagnaSignName` + `v.lagnaDms`；并明确写出"D9 上升 ≠ D1 上升"及两者数值 ✅ **没有把 D1 数据串到 D9 盘**
- **D9 宫格**：12 格按 house 1→12 顺序渲染，house 1 标 `▲`，无"按星座序"混排 ✅
- **Panchanga 卡**：Tithi 用 `tithi.name/sa/num/elapsed`；Nakshatra 用 `nakshatra.zh/sa/pada/lord`；Yoga 用 `yoga.sa/zh/num`；Karana 用 `karana.name/sa/num`；Vara 用 `vara.name/sa/lordName/sunrise` ✅ 字段一一对应
- **D1 星格**：`house = (signIndex − ascSignIndex + 12) % 12 + 1`，用的就是 `houses[]` 同一口径 ✅
- 瑕疵 2 处见 §3-I1、I3。

## 3. 缺陷清单

| 编号 | 级别 | 位置 | 问题 | 证据 | 建议 |
|---|---|---|---|---|---|
| I1 | P3 | `vedic.ts` D1 vs D9 | D1 星座用**取整后**经度（`signOf(dms.lon)`），D9 用**原始**经度（`navamshaSign(lon)`）。在每个星座最后 0.5′ 内二者矛盾 | `toDms(29.9995)` → D1 显示"金牛 0°00′"，但 `navamshaSign(29.9995)`=射手（应为摩羯） | D9 也传 `dms.lon`，或 D1 用原始值分星座、仅显示取整 |
| I2 | P3 | `isNewMoonConj` | 6° 窗口 = Tithi 1（12°）的一半，"初一但非新月"的盘面自相矛盾 | 2026-11-10T04:02Z：elong 6.131°，`tithi=1` 而 `flag=false` | 改判 `tithi.num∈{1,30}`，或把文案写成"合相 ±12 h" |
| I3 | P3 | `vedicview.js` Panchanga | 视图自行用 `hour*60+minute < riseMin` 重算"日出前后"，与内核秒级判定可能冲突 | 出生 07:05:24、日出 07:05:34：内核判**金曜日**，文案写"出生在日出之后，故记金曜日" | 直接读 `panchanga.vara.beforeRise`（内核已算好） |
| I4 | P4 | 全模块 | 把 Vimshottari **antardasha** 叫「小限」。紫微斗数里「小限」是岁限，站内另有紫微模块，同名不同义 | `vedicview.js` "出生时小限"、"小限（大运会再分九段…）" | 改「中运/小运（Antardasha）」 |
| I5 | P4 | API | `karana.num` 是 1–60 序号、`karana.index` 是 0–10 名称索引，同名不同义易误用 | `{num:23, index:0, name:'Bava'}` | 注释或改名 `num60/nameIdx` |
| I6 | P4 | API | `NAKSHATRAS` 元素无 `index` 字段（序号靠数组下标），`Nakshatra` 类型与导出数组不一致 | `JSON.stringify(NAKSHATRAS[0])` → `{"zh","sa","lord"}` | 补 `index` 或文档说明按下标 |

**无 P1/P2 缺陷。** 七项改动没有一项是"改错了方向"或"修好 A 弄坏 B"。

## 4. 未验证 / 局限（务必连同结论一起看）

1. **没有拿到 JPL 原始星历**：`ssd.jpl.nasa.gov`（Horizons API）与 `naif.jpl.nasa.gov`（DE440s .bsp）在本机均连接超时。基准为 **Swiss Ephemeris 2.10.03 + DE431 文件**（JPL DE431 的官方衍生实现）+ astronomy-engine 双源交叉（互差 ≤40 s）。若要求字面意义的"JPL 直连"，需换一台能出网的机器重跑 §2.8。
2. **本审计第一版实际跑在 Moshier 回退上**（pyswisseph 未自带 `.se1`）。发现后已补 DE431 文件并全部重算，本文所有数字均为 SWIEPH 结果；月亮基准差从 1.3″ 修正。
3. **上升精度只在 8 例详表 + 120 例随机**验证；未做全球高纬（>66.5°，含极昼极夜）系统扫描。`SearchRiseSet` 失败分支回退到"按钟表日"（`basis:'clock'`）的路径**未触发测试**。
4. **pada 无外部逐例基准**：drikpanchang 页面不显示 pada，我按定义（4 等分、各 3°20′）+ 与 navamsa 边界的同构关系核对，属"定义核对"而非"第三方数据核对"。
5. **端到端未找到真实命例触发 0.5′ 进位窗口**（§3-I1）：该窗口概率约 1/3600 每星，8 例×8 天体不足以命中；I1 是构造值证明 + 代码路径分析，不是实盘复现。
6. **未做 UI 实际渲染截图比对**：§2.10 是代码路径 + 字段名核对，未在浏览器里点开 D9/Panchanga 面板确认视觉布局（宫格顺序、中文省略号、移动端换行）。
7. **未验证历史时区/夏令时**：`paipanVedic` 接受显式 `utcOffsetHours`，中国 1986–1991 夏令时、1949 前地方时等由上层决定，不在本次范围。
8. **未审 7 项之外的函数**：yogas、aspects、dignity、shadbala、nakshatra 合婚等未覆盖。
9. **drikpanchang 只取 3 个日期**（均北京），未跨城市/跨月抽样；15 项全中不能推出"全年无误差"，只能说"公式与约定正确"。

## 5. 复现命令

```bash
P=/opt/hermes/tools/python-3.14.9+202****1021-linux-x64/bin/python3
cd /opt/data/work/audit2

# 基准自证：必须看到 SWIEPH True / MOSEPH False
$P -c "import swisseph as swe; swe.set_ephe_path('/opt/data/work/audit2/ephe'); swe.set_sid_mode(swe.SIDM_LAHIRI); \
xx,fl=swe.calc_ut(swe.julday(2026,11,21,4.0),swe.MOON,swe.FLG_SWIEPH|swe.FLG_SIDEREAL); print(bool(fl&swe.FLG_SWIEPH),bool(fl&swe.FLG_MOSEPH))"

$P nakcmp.py        # 27 宿全表比对 → 不一致: 0
$P prec.py          # 8 命例上升/七政 vs SE（角分）
$P vimcheck.py      # 5 命例 Vimshottari MD/AD 手算对照
$P phases.py        # 2026 全年朔望（SE DE431）→ phases.json
$P grid.py          # 朔望 vs isNewMoonConj 命中窗口

cd snap
npx vitest run test/nav.test.ts        # 360,000 点 D9 扫描 / 108 分界点
npx vitest run test/d9.test.ts         # 36 点 D9 Lagna 定位 → d9.json
npx vitest run test/vim.test.ts        # 分盘边界 + 5 命例 → vim.json
npx vitest run test/pan.test.ts        # 3 日期 Panchanga → panchanga.json
npx vitest run test/phasecheck.test.ts # 朔望时刻库内 elong → phasecheck.json
npx vitest run test/edge.test.ts       # 4 城日出 + 换日 10 秒边界 → edge.json
npx vitest run test/asc2.test.ts       # 120 例随机盘 → asc2.csv
npx vitest run test/dms.test.ts        # 度数进位边界
cd /opt/data/work/qintianjian/liuyao-core
npx vitest run test/vedic.test.ts test/vedic-d9.test.ts   # 42/42
```

数据产物：`dump.json`、`d9.json`、`vim.json`、`panchanga.json`、`phasecheck.json`、`phases.json`、`phases_ae.json`、`edge.json`、`asc2.csv`、`nak.json`、`nak_table.md`。
