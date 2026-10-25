# 雷诺曼 36 符号牌·历史原版真图调研报告

> 任务：为钦天监「世界占卜典籍库」补齐雷诺曼 36 张历史原版真图（公有领域/权利干净）。
> 结论：**本目录暂不放任何卡图**。经全面调研，在当前网络环境与版权核验标准下，
> 没有任何一套来源能同时满足四个硬性条件：①36 张完整 ②同一历史牌组 ③版权干净
> （PD 或 CC BY-SA / CC0 等开放许可）④可实际下载（≥360px 高）。
> 按任务规则「找不到完整、版权干净的一套就写调研报告、不留半套图」执行，本 README 即全部产出。

调研日期：2026 年（沙箱网络环境）

---

## 一、候选牌组清单（按推荐度排序）

### 1. BnF Gallica 数字化 Petit Lenormand ⭐内容最全，网络被墙

法国国家图书馆至少 4 套 1875–1899 年 Petit Lenormand 完整数字化（石版水彩印，原作已过版权期）：

| ark（Gallica） | 标题 | 年代 | 视图数 | 权利 |
| --- | --- | --- | --- | --- |
| btv1b10522499m | Jeu de cartes divinatoire, dit Petit Lenormand | 1875–1899 | 72 | NoC-OKLR |
| btv1b105431946 | Jeu de cartes divinatoire, dit Petit Lenormand | 1875–1899 | ~38 | NoC-OKLR |
| btv1b10529584r | Jeu de cartes divinatoire, dit Petit Lenormand | 1875–1899 | ~38 | NoC-OKLR |
| btv1b105433047 | Die achten Wahrsagekarten des Kartenschlägerin Melle Lenormand in Paris（Ensslin et Laiblin, Reutlingen 德国版） | 1875–1899 | 38 | NoC-OKLR |

- 下载模板（在能访问 Gallica 的网络下直接可用）：
  `https://gallica.bnf.fr/iiif/ark:/12148/<ark>/f<N>/full/360,/0/native.jpg`
  其中 `<N>` = 1..36+（含牌盒、说明书页），需人工核对哪 N 张是 36 张卡。
- **⚠ 牌序疑点**：btv1b105433047 的 catalogue.bnf.fr 记录（cb40918845b）注明
  「36 号卡画着猫」（Mention de responsabilité sur la carte numérotée 36, représentant un chat），
  与标准序 36=十字 不符——若用这套需重新排牌序，勿直接按 f1..f36 顺序命名。
- **网络结论（本次实测）**：gallica.bnf.fr 全站 Cloudflare 403；wsrv.nl 图片代理（欧洲出口）同样被 403；
  i0.wp.com Photon、allorigins、codetabs、corsproxy、IPv6 直连全部失败；
  Europeana API（api2demo key）能查元数据但 thumbnail 服务只缓存每藏品首图 f1，
  f2 及以后一律返回 2319 字节占位图——**36 张全套无法通过 Europeana 取回**。
- **版权注意**：NoC-OKLR（rightsstatements.org/vocab/NoC-OKLR/1.0/）= 原作无版权
  但数字化方主张「其他已知法律限制」（Gallica 再复制用途限制）。严格按本项目
  「博物馆开放扫描」标准，这是灰色地带：自用可辩护，公开发布需谨慎标注。

### 2. Stadtmuseum Einbeck（下萨克森文化遗产门户）⭐许可最干净，只有 2 张图

- 藏品：**Wahrsage-Karten nach Marie Anne Lenormand**，编号 SME A 10184，
  年代 **1843 年前（frühes 19. Jahrhundert）**，36 张彩色印刷卡（8.7×5.5 cm），
  卡背纹饰带 B / D 字母。
- 门户：kulturerbe.niedersachsen.de（Goobi viewer，IIIF 可用），record ID `record_kuniweb_675501`。
- 许可：**数字化件 CC BY-SA 4.0，元数据 CC0** —— 全部候选中唯一完全开放的一套。
- 下载模板（已实测可达，1747×2759 高清）：
  `https://kulturerbe.niedersachsen.de/api/v1/records/record_kuniweb_675501/files/images/00000001.jpg/full/full/0/default.jpg`
  （00000002.jpg 为第二张；Goobi viewer REST API：/api/v1/records/<id>/manifest 可取 canvas 列表）
- **缺口**：全馆只数字化了 2 张图（1 张卡面 + 1 张卡背/盒），**缺 34 张**。
- **后续路径**：若 Einbeck 补全数字化，此套为首选——年代早（1843 前）、CC BY-SA 4.0、IIIF 直链。

### 3. Tarot Taxi 博客 · Altenburger 1892–1931 PD 包（站点已私有化）

- 页面：tarottaxi.wordpress.com/2012/04/04/lenormand-free-course-deck-download/
  （Marcus Katz / Tarosophy 团队 2012 年发布，声明整套 PD，9 页×4 卡 = 36 张完整）。
- 版权评估：Altenburger und Stralsunder Spielkartenfabrik 1892–1931 印次；
  按德国匿名/法人作品 70 年出版期，最迟 2001 年底进入公有领域，2012 年 PD 声明在法律上成立；
  但「1892–1931」跨 1900 年线且扫描者权利链条不明，与本项目「1900 年前原作」金标准有出入。
- **现状**：博客已转 "Private Site"（此站已私密），页面与图片（tarottaxi.files.wordpress.com）全部 403。
- **后续路径**：注册 wordpress.com 账号申请访问，或向 Tarosophy/Tarot Professionals 社区索取。

### 4. 德国其他博物馆（NC 许可，排除）

| 博物馆 | 藏品 | 许可 | 缺口 |
| --- | --- | --- | --- |
| Museum Europäischer Kulturen (Berlin) | Lenormand Wahrsage-Karten mit Kartenbildern | CC BY-NC-SA 3.0 | museum-digital object/447436 仅 1 张总览图 |
| Stadtgeschichtliches Museum Leipzig | Wahrsagekarten, zusammengestellt aus den Papieren der berühmten Kartenleger（1800/1850，36 张） | CC BY-NC-SA 4.0 | NC 条款禁商用，不符合「版权干净」 |

### 5. 大英博物馆（版权排除）

- Schreiber Collection 藏 Hechtel 1799《Das Spiel der Hoffnung》（Petit Lenormand 的桌游前身，36 张完整）。
- 图片 © Trustees of the British Museum，未经许可禁止商业使用（多来源核验一致）。**排除**。

### 6. 商业图库与私人站（版权或条款排除）

- **Bridgeman Images**：Dondorf 19 世纪套图 9 张×4 卡（编号 KJN336533–336541），RM 授权付费带水印。排除。
- **lenormand1.de**：10 套历史版本 36 卡大图（610×1000，Dondorf 1880–1926 / 巴黎 1840 / Geuens-Seaux 1880 /
  Stralsunder 1885–1920 / Piatnik 1880–1920 等）**全部可下载且牌序与本项目 36 序完全一致**，
  但 Impressum 明确声明「所有图片版权保留、未经许可不得使用（即使节选）」。**排除**。
- **learnlenormand.com**：36 张单卡附件页可访问，但图仅 114×185（尺寸不足）且无许可声明。排除。
- **mir-taro-run.ru**（俄语，声称引用 Commons 自由图像）：403 不可达。排除。

## 二、网络通道实测记录（沙箱环境，供未来重试）

**可达**：github.com / raw.githubusercontent.com / codeload（GitHub 全线，但已排查无完整 PD 套图仓库）；
live.staticflickr.com（Flickr 图片 CDN，但 flickr.com 与 api.flickr.com 被墙，无法搜索定位图片）；
kulturerbe.niedersachsen.de（Goobi viewer + IIIF + REST API）；api.europeana.eu（搜索/记录 API，
demo key=api2demo，thumbnail 仅首图）；catalogue.bnf.fr（-L 跟随 302 可用）；api.si.edu（域可达）；
wsrv.nl（仅 Wikimedia 域图片有效）；learnlenormand.com；公开 wordpress.com 站点及其
wp-content/uploads 图片；dbpedia.org；e-rara.ch 内容页（搜索页有验证盾）；burningserpent 等
公开 wordpress 博客图片。

**被墙/被挡**：gallica.bnf.fr（Cloudflare，含所有代理出口）；Wikimedia 全系
（commons / upload / api / wikipedia / wikidata，连镜像站 wikiwand/wikizero 也全挡）；
archive.org 与 web.archive.org（含 s3 / iaXXXX 节点）；Google 全系；LoC / NYPL / Rijksmuseum /
Delpher / BDH / HathiTrust；digitaltmuseum.no/.se；finna.fi；museum-digital.de 主站
（nat./berlin. 子域可达，已全站搜过 Lenormand 仅 447436 一件）；picryl.com；api.pop.culture.gouv.fr；
api.github.com（403 限流，网页版可用）；flickr.com 主站。

**Wikimedia Commons 结论**：经多轮搜索引擎索引核查，Commons 上不存在完整的雷诺曼历史牌组
36 卡文件（仅有 Marie Anne Lenormand 人物像、现代牌组照片等零散文件），且沙箱无法直连 Commons API。

## 三、推荐后续路线

1. **首选**：在无 Cloudflare 拦截的网络（家用宽带/海外 VPS/云电脑）访问 Gallica，取
   btv1b105431946 或 btv1b10529584r（法国原版，避开「36 号猫」的德国版），按 IIIF 模板拉 36 张
   `/full/360,/` 缩图，版权标注 NoC-OKLR（自用没问题；若日后开源发布需改为注明「BnF/Gallica 来源，
   NoC-OKLR」并接受再复制限制，或换 Einbeck 套）。
2. **次选**：跟进 Einbeck（kulturerbe.niedersachsen.de, record_kuniweb_675501）数字化进度——
   CC BY-SA 4.0 是最干净的许可，唯缺 34 张图。
3. **备选**：向 Tarosophy 社区（Tarot Taxi 博客作者团队）索取 Altenburger 1892–1931 PD 图包。

## 四、附：本项目 36 牌序（与 app/js/lendata.js 一致，命名 len-01 ~ len-36 时用）

1 骑手 Rider / 2 三叶草 Clover / 3 船 Ship / 4 房屋 House / 5 树 Tree / 6 云 Clouds /
7 蛇 Snake / 8 棺材 Coffin / 9 花束 Bouquet / 10 镰刀 Scythe / 11 鞭 Whip / 12 鸟 Birds /
13 孩童 Child / 14 狐 Fox / 15 熊 Bear / 16 星 Stars / 17 鹳 Stork / 18 狗 Dog / 19 塔 Tower /
20 花园 Garden / 21 山 Mountain / 22 岔路 Crossroads / 23 鼠 Mice / 24 心 Heart / 25 戒指 Ring /
26 书 Book / 27 信 Letter / 28 男士 Man / 29 女士 Woman / 30 百合 Lilies / 31 太阳 Sun /
32 月亮 Moon / 33 钥匙 Key / 34 鱼 Fish / 35 锚 Anchor / 36 十字 Cross

（德语原名、skat 花色对应、关键词与古法牌义见 app/js/lendata.js，此处不重复。）

## 五、v102 落地记录（2026-10-25）

前述「本目录暂不放任何卡图」的保守结论，在 v100 曾被绕开（临时采用 lenormand1.de 扫描件，
每张带 4 处 www.Lenormand1.de 水印，主人真机验收指出「显示异常」；旧图回退备份于
`每日六爻/_lnsrc/backup_lenormand1_dondorf/`）。

v102 正式落地图源：**Dondorf 印制 Gibson 版（1920s），来源 wopc.co.uk「Cartes Lenormand」页**
（https://www.wopc.co.uk/uk/cartes-lenormand ，The World of Playing Cards 收藏扫描；本项目仅
主人单人自用研习、不公开分发、不商用）。

- 36 张全套、同一副牌、无水印；编号 1-36 与 lendata.js 完全一致（已逐张核验内容）
- 原始成套图 4 张（gibson-lenormand-1/2/3/4.jpg，870×535×3 与 522×531），按白色间隙投影
  切割为单张，统一画布 180×282 JPEG（q86）共 618KB，存于 `app/assets/lenormand-gibson/`
- 牌组信息：H.P. Gibson & Sons（伦敦）出品、B. Dondorf（法兰克福）石印，与 dotpattern
  所示 c.1900 德文第二版同厂同源；切割与核验中间产物保留于 `每日六爻/_lnsrc/`
- 同时修复：lenormand.css 补全 .ln-img 尺寸规则（此前真图无约束按自然尺寸渲染、撑爆布局，
  为「显示异常」直接根因之一）；index.html title 更新为「钦天监 · 命理星象工作台」。
