# -*- coding: utf-8 -*-
"""从 02_思想单元候选总表.md 的解析结果 + 人工核定的元数据，生成结构化内容库节点。"""
import json, re, os

# 路径一律相对本文件解析，不写机器绝对路径。
# 换设备、换目录、别人 clone 下来都能直接跑。
BASE = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT = os.path.join(BASE, 'data')
os.makedirs(OUT, exist_ok=True)

# 研究文档是唯一事实源。parsed/ 由 parse_md.py 从 02_思想单元候选总表.md 生成，
# 必须随仓库走。原来这里读 /tmp/ly_parsed.json，机器重启或换机就断链，
# 而且那份临时快照会过期——实测它已经落后于 md 的两处内容修正。
PARSED_PATH = os.path.join(BASE, 'parsed', 'lunyu.json')
if not os.path.exists(PARSED_PATH):
    raise SystemExit(f'缺少 {PARSED_PATH}。先跑：python3 _build/parse_md.py --md 02_思想单元候选总表.md --out parsed/lunyu.json')
PARSED = json.load(open(PARSED_PATH, encoding='utf-8'))

# ---------------- 人工核定元数据 ----------------
M = {
"LY-001": dict(short="学而时习之", speaker="孔子", interlocutor="泛论（无特定对话者）",
  occasion="论学之乐：学而实践、友来共学、人不知而不愠，三层递进",
  clusters=["学习","修身"], tags=["学习","实践","悦","君子","开篇"],
  commentaries=[("朱熹","论语集注","学之为言效也。……习，鸟数飞也。学之不已，如鸟数飞也。既学而又时时习之，则所学者熟而中心喜说。"),
                ("程子","论语集注引","习，重习也。时复思绎，浃洽于中，则说也。学者将以行之也，时习之则所学者在我，故说。")],
  disputes=[("「时」字训释",["王肃/孔安国：以时诵习","朱熹：时时习之","钱穆：时时反复习","杨伯峻：按一定的时间实习","李泽厚：经常实践"])],
  quality="strong"),
"LY-002": dict(short="吾日三省吾身", speaker="曾子", interlocutor="门人（自述修养工夫）",
  occasion="曾子自述每日以三事自省：为人谋是否忠、与友交是否信、传是否习",
  clusters=["修身"], tags=["自省","忠","信","习","曾子"],
  commentaries=[("朱熹","论语集注","省，察也。……传，谓受之于师；习，谓熟之于己。曾子以此三者日省其身，有则改之，无则加勉。"),
                ("邢昺","论语注疏","此章论曾子自省其身也。")],
  disputes=[("「传不习乎」的解释",["受之于师、己是否复习","己所传授于人者、是否先行实践"])],
  quality="medium"),
"LY-003": dict(short="克己复礼为仁", speaker="孔子", interlocutor="颜渊（颜渊问仁）",
  occasion="颜渊问仁，孔子答以「克己复礼」，并应颜渊「请问其目」之问给出四勿",
  clusters=["仁","修身"], tags=["仁","礼","四勿","颜渊","工夫"],
  commentaries=[("朱熹","论语集注","克，胜也。己，谓身之私欲也。复，反也。礼者，天理之节文也。……此章问答，乃传授心法切要之言。"),
                ("程子","论语集注引","非礼处便是私意。既是私意，如何得仁？"),
                ("刘宝楠","论语正义","引宋翔凤辑郑注本，「仁」作「人」，谓仁即人之本性。")],
  disputes=[("「克己」之「己」",["朱熹：身之私欲","清儒：己即身，克己谓约束自身，非专指私欲"]),
            ("「复礼」之「复」",["朱熹：反于礼（回归天理）","另一读：复，行也，践履礼"]),
            ("汉宋分歧",["朱熹将「仁」提升为「心之德、爱之理」，与《论语》原意有距离","黄宗羲批评朱子「先名而后实」"])],
  quality="strong"),
"LY-004": dict(short="己所不欲，勿施于人", speaker="孔子", interlocutor="子贡（卫灵公24）；仲弓（颜渊2）",
  occasion="子贡问「有一言而可以终身行之者乎」，孔子答以「恕」；另处为仲弓问仁，孔子以「出门如见大宾」并举此句",
  clusters=["忠恕","仁","处世"], tags=["恕","金规则","人际关系","终身行之","子贡","仲弓"],
  commentaries=[("何晏","论语集解","言己之所恶，勿加施于人也。"),
                ("邢昺","论语注疏","己之所恶，勿欲施于人，即恕也。"),
                ("朱熹","论语集注","推己及物，其施不穷，故可以终身行之。")],
  disputes=[("忠恕是否等同",["冯友兰：此句即「恕」的定义，与「己欲立而立人」合为忠恕之道","钱穆：忠恕一贯，恕是消极面，忠是积极面"])],
  quality="strong"),
"LY-005": dict(short="为政以德", speaker="孔子", interlocutor="泛论（论为政者）",
  occasion="论治国之道：以德为本，如北辰安居其所而众星环绕",
  clusters=["政治"], tags=["德治","为政","北辰","领导力"],
  commentaries=[("包咸","论语集解引","德者无为，犹北辰之不移而众星共之。"),
                ("朱熹","论语集注","政之为言正也，所以正人之不正也。德之为言得也，得于心而不失也。……为政以德，则不动而化、不言而信、无为而成。")],
  disputes=[("德治与法治的关系",["传统注家：德为政本，政刑为辅","现代研究：与「道之以政，齐之以刑」构成德治/法治比较框架，非简单对立"])],
  quality="medium"),
"LY-006": dict(short="吾十有五而志于学", speaker="孔子", interlocutor="自述（无特定对话者）",
  occasion="孔子自述一生修养进程的六个阶段，非对弟子训诫，而是现身说法",
  clusters=["修身","人生"], tags=["人生阶段","三十而立","知天命","耳顺","从心所欲"],
  commentaries=[("孔安国","论语集解引","志于学，成童之岁，识虑方明。"),
                ("郑玄","论语集解引","耳顺，耳闻其言，而知其微旨。"),
                ("马融","论语集解引","矩，法也。"),
                ("邢昺","论语注疏","此章明夫子隐圣同凡，所以劝人也。")],
  disputes=[("「三十而立」之「立」",["立谓立于礼（《泰伯》「立于礼」、《尧曰》「不知礼无以立」）","世俗误读：成家立业、买房立足（非原意）"]),
            ("「耳顺」的解释",["郑玄：耳闻其言而知其微旨","另一说：所闻皆顺，无违逆于心"])],
  quality="strong"),
"LY-007": dict(short="学而不思则罔", speaker="孔子", interlocutor="泛论（论学）",
  occasion="论学与思不可偏废：只学不思则迷惘，只思不学则危殆",
  clusters=["学习"], tags=["学","思","辩证","方法论"],
  commentaries=[("包咸","论语集解引","学不寻思其义，则罔然无所得。"),
                ("包咸","论语集解引","不学而思，终卒不得，徒使人精神疲殆。")],
  disputes=[],
  quality="medium"),
"LY-008": dict(short="君子不器", speaker="孔子", interlocutor="泛论（论君子）",
  occasion="论君子人格不应局限于单一用途，与「器之」相对",
  clusters=["君子人格"], tags=["君子","不器","通才","反工具化"],
  commentaries=[("包咸","论语集解引","器者各周其用，至于君子，无所不施。"),
                ("邢昺","论语注疏","君子之德，则不如器物各守一用，言见几而作，无所不施也。"),
                ("朱熹","论语集注","器者，各适其用而不能相通。成德之士，体无不具，故用无不周，非特为一才一艺而已。")],
  disputes=[],
  quality="medium"),
"LY-009": dict(short="人而无信，不知其可", speaker="孔子", interlocutor="泛论（论立身）",
  occasion="以车之輗軏为喻，论人无信则无法立身行事",
  clusters=["处世","修身"], tags=["信","诚信","立身","輗軏"],
  commentaries=[("孔安国","论语集解引","言人而无信，其余终无可。"),
                ("朱熹","论语集注","輗，辕端横木，缚轭以驾牛者。軏，辕端上曲，钩衡以驾马者。车无此二者，则不可以行，人而无信，亦犹是也。")],
  disputes=[],
  quality="medium"),
"LY-010": dict(short="知之者不如好之者", speaker="孔子", interlocutor="泛论（论学）",
  occasion="论为学的三层境界：知之→好之→乐之，以乐为极",
  clusters=["学习"], tags=["学习","兴趣","内在动机","乐"],
  commentaries=[("朱熹","论语集注","好，去声。乐，音洛。……知之者，知有此道也；好之者，好而未得也；乐之者，有所得而乐之也。")],
  disputes=[],
  quality="medium"),
"LY-011": dict(short="仁者爱人（樊迟问仁）", speaker="孔子", interlocutor="樊迟（樊迟问仁）",
  occasion="樊迟问仁，孔子以「爱人」二字作答，为《论语》中对仁最简洁的定义",
  clusters=["仁"], tags=["仁","爱人","樊迟","定义"],
  commentaries=[("朱熹","论语集注","爱人，仁之施也。……爱者，仁之用，而其所爱之理，则仁也。"),
                ("邢昺","论语注疏","樊迟问仁，子曰爱人者，言仁之道在于爱利他人也。")],
  disputes=[("「爱人」是否等于墨家「兼爱」",["儒家：爱有差等，由亲及疏","墨家：兼爱无差等。二者不同"])],
  quality="medium"),
"LY-012": dict(short="君子喻于义，小人喻于利", speaker="孔子", interlocutor="泛论（论义利）",
  occasion="以「喻」（知晓、看重）为分判，论君子与小人所关注的根本不同",
  clusters=["义利","君子人格"], tags=["义","利","义利之辨","商业伦理"],
  commentaries=[("朱熹","论语集注","喻，犹晓也。义者，天理之所宜；利者，人情之所欲。"),
                ("董仲舒","春秋繁露","仁之法在爱人，不在爱我；义之法在正我，不在正人。")],
  disputes=[("是否否定利益",["原意：确立义先于利的价值排序，非否定利","世俗误读：孔子反对追求利益（非原意）"])],
  quality="medium"),
"LY-013": dict(short="朝闻道，夕死可矣", speaker="孔子", interlocutor="泛论（论道）",
  occasion="论道的价值高于生命本身",
  clusters=["修身"], tags=["道","生死","求道"],
  commentaries=[("朱熹","论语集注","道者，事物当然之理。苟得闻之，则生顺死安，无复遗恨矣。"),
                ("何晏","论语集解","言将至死，不闻世之有道也。")],
  disputes=[("「闻道」之「道」",["朱熹：事物当然之理","何晏：世之有道（天下有道）","另一说：闻道即领悟真理，不必限定"])],
  quality="medium"),
"LY-014": dict(short="君子坦荡荡，小人长戚戚", speaker="孔子", interlocutor="泛论（论心境）",
  occasion="以心境对比分判君子与小人：君子循理故舒泰，小人役于物故多忧",
  clusters=["君子人格"], tags=["坦荡荡","戚戚","心境","心理健康"],
  commentaries=[("朱熹","论语集注","坦，平也。荡荡，宽广貌。程子曰：君子循理，故常舒泰；小人役于物，故多忧戚。"),
                ("皇侃","论语义疏引江熙","君子坦而夷任，荡然无私；小人驰兢于荣利，耿介于得失，故长为愁府也。")],
  disputes=[],
  quality="medium"),
"LY-015": dict(short="己欲立而立人，己欲达而达人", speaker="孔子", interlocutor="子贡（子贡问仁）",
  occasion="子贡问「如有博施于民而能济众，何如」，孔子答以仁之方法：能近取譬，推己及人",
  clusters=["忠恕","仁","处世"], tags=["忠","忠道","推己及人","子贡","能近取譬"],
  commentaries=[("朱熹","论语集注","以己之欲立，而知人之亦欲立；以己之欲达，而知人之亦欲达。……此仁之方也。"),
                ("邢昺","论语注疏","己欲立身，先立他人；己欲通达，先达他人。")],
  disputes=[("忠与恕的分判",["朱熹：尽己之谓忠，推己之谓恕；此句为忠，己所不欲为恕","冯友兰：忠恕为一贯之道之两面"])],
  quality="medium"),
"LY-016": dict(short="知者乐水，仁者乐山", speaker="孔子", interlocutor="泛论（论人格与自然）",
  occasion="以山水、动静、乐寿三组对举，描摹智者与仁者的生命情态",
  clusters=["君子人格"], tags=["山水","智者","仁者","美学","隐喻"],
  commentaries=[("朱熹","论语集注","知者达于事理而周流无滞，有似于水，故乐水；仁者安于义理而厚重不迁，有似于山，故乐山。动静以体言，乐寿以效言也。动而不括故乐，静而有常故寿。")],
  disputes=[("「乐」的读音与词性",["乐，五教反（yào），喜爱之义","另一读为「快乐」之乐"])],
  quality="medium"),
"LY-017": dict(short="三人行必有我师", speaker="孔子", interlocutor="泛论（论学）",
  occasion="论随处可学：择善而从，见不善而改",
  clusters=["学习","修身"], tags=["师","择善","改过","终身学习"],
  commentaries=[("朱熹","论语集注","三人同行，其一我也。彼二人者，一善一恶，则我从其善而改其恶焉，是二人者皆我师也。")],
  disputes=[],
  quality="medium"),
"LY-018": dict(short="君子和而不同", speaker="孔子", interlocutor="泛论（论处世）",
  occasion="论君子能与人和谐相处而不盲从苟同，小人则相反",
  clusters=["处世","君子人格"], tags=["和","同","差异","多元"],
  commentaries=[("朱熹","论语集注","和者，无乖戾之心；同者，有阿比之意。……和而不同，如晏婴论和与同之辨。"),
                ("何晏","论语集解","君子心和，然其所见各异，故曰不同；小人所嗜好者同，然各争利，故曰不和。")],
  disputes=[],
  quality="medium"),
"LY-019": dict(short="曾皙言志（侍坐章）", speaker="孔子与子路、曾皙、冉有、公西华", interlocutor="四位弟子（侍坐）",
  occasion="孔子问志，四人各言其志，孔子独叹「吾与点也」",
  clusters=["教育","人生"], tags=["曾皙","吾与点也","教育理想","生活境界","侍坐"],
  commentaries=[("朱熹","论语集注","曾点之学，盖有以见夫人欲尽处，天理流行，随处充满，无少欠阙。故其动静之际，从容如此。而其言志，则又不过即其所居之位，乐其日用之常，初无舍己为人之意。而其胸次悠然，直与天地万物上下同流，各得其所之妙，隐然自见于言外。"),
                ("何晏","论语集解","周曰：善点独知时也。")],
  disputes=[("孔子「吾与点也」何指",["朱熹：赞其胸次悠然、与天地万物同流","另一说：赞其知时（生不逢时，故退而自乐）","现代研究：教育理想的象征，非政治主张"])],
  quality="medium"),
"LY-020": dict(short="以直报怨，以德报德", speaker="孔子", interlocutor="「或曰」（有人设问）",
  occasion="有人问「以德报怨，何如」，孔子反问「何以报德」，提出以直报怨、以德报德",
  clusters=["处世","义利"], tags=["以直报怨","以德报德","正义","宽容","误读高发"],
  commentaries=[("朱熹","论语集注","于其所怨者，爱憎取舍，一以至公而无私，所谓直也。"),
                ("何晏","论语集解","怨以直报之，德以德报之。")],
  disputes=[("「直」的解释",["朱熹：至公无私","一说：直=正直、不曲","一说：读为「值」，即对等回报","另一说：直即「直道」，依理而行"])],
  quality="strong"),
"LY-021": dict(short="见贤思齐", speaker="孔子", interlocutor="泛论（论修养）",
  occasion="论以他人为镜：见贤思齐，见不贤而内自省",
  clusters=["修身"], tags=["见贤思齐","自省","榜样","参照"],
  commentaries=[("朱熹","论语集注","省，悉井反。思齐者，冀己亦有是善；内自省者，恐己亦有是恶。胡氏曰：见人之善恶不同，而无不反诸身者，则不徒羡人而甘自弃，不徒责人而忘自责矣。"),
                ("包咸","论语集解引","思与贤者等。"),
                ("邢昺","论语注疏","此章勉人为高行也。见彼贤则思与之齐等，见彼不贤则内自省察得无如彼人乎。"),
                ("尹焞","论语解（转引）","见贤思齐，见不贤而内自省，则善恶皆我之师，进善其有穷乎？")],
  disputes=[],
  quality="strong"),
"LY-022": dict(short="君子之德风", speaker="孔子", interlocutor="季康子（季康子问政）",
  occasion="季康子患盗而问政，孔子答以在上者之德如风、在下者之德如草",
  clusters=["政治"], tags=["德风","领导力","示范","季康子","教化"],
  commentaries=[("朱熹","论语集注","季康子，鲁大夫季孙肥也。……君子之德，风也；小人之德，草也。草上之风，必偃。")],
  disputes=[("「偃」的强度",["朱熹：言其必然","现代研究：强调上行下效，非绝对决定论"])],
  quality="medium"),
"LY-023": dict(short="礼之用，和为贵", speaker="有子（有若）", interlocutor="泛论（论礼）",
  occasion="论礼之运用以和谐为贵，但不可一味求和而失节",
  clusters=["处世"], tags=["礼","和","节","有子","原则与灵活"],
  commentaries=[("朱熹","论语集注","礼者，天理之节文，人事之仪则也。和者，从容不迫之意。盖礼之为体虽严，而皆出于自然之理，故其为用，必从容而不迫，乃为可贵。……愚谓严而泰，和而节，此理之自然，礼之全体也。"),
                ("程子","论语集注引","礼胜则离，故礼之用和为贵……乐胜则流，故有所不行者，知和而和，不以礼节之，亦不可行。"),
                ("范氏","论语集注引","凡礼之体主于敬，而其用则以和为贵。敬者，礼之所以立也；和者，乐之所由生也。")],
  disputes=[("「和」的解释",["朱熹：从容不迫","《礼记·中庸》：发而皆中节谓之和","杨树达：和谓调适，非一味迁就"])],
  quality="strong"),
"LY-024": dict(short="中庸之为德，其至矣乎", speaker="孔子", interlocutor="泛论（论德）",
  occasion="叹中庸为最高之德，而民已少能之久",
  clusters=["德性","修身"], tags=["中庸","过犹不及","不偏不倚","误读高发"],
  commentaries=[("朱熹","论语集注","中者，无过无不及之名也。庸，平常也。至，极也。鲜，少也。言民少此德，今已久矣。"),
                ("程子","中庸章句引","不偏之谓中，不易之谓庸。中者，天下之正道；庸者，天下之定理。")],
  disputes=[("中庸是否等于折中",["原意：不偏不倚、无过不及、恒常可行","世俗误读：折中妥协、和稀泥（非原意）"]),
            ("「庸」的解释",["朱熹：平常","程子：不易（恒常不变）","郑玄：用（庸，用也）"])],
  quality="medium"),
"LY-025": dict(short="君子义以为质", speaker="孔子", interlocutor="泛论（论君子）",
  occasion="论君子人格的完整结构：以义为质干，以礼行之，以逊出之，以信成之",
  clusters=["君子人格","义利"], tags=["义","礼","逊","信","君子四德"],
  commentaries=[("朱熹","论语集注","义者，制事之本，故以为质干；而行之必有节文，出之必以退逊，成之必在诚实，乃君子之道也。")],
  disputes=[],
  quality="medium"),
"LY-026": dict(short="性相近也，习相远也", speaker="孔子", interlocutor="泛论（论人性）",
  occasion="论人性本相近，因习染而相远，故君子慎所习",
  clusters=["人性","教育"], tags=["性","习","人性论","教育","慎习"],
  commentaries=[("朱熹","论语集注","此所谓性，兼气质而言者也。气质之性，固有美恶之不同矣。然以其初而言，则皆不甚相远也。但习于善则善，习于恶则恶，于是始相远耳。"),
                ("程子","论语集注引","此言气质之性，非言性之本也。若言性之本，则性即是理，理无不善，孟子之言性善是也。何相近之有哉？"),
                ("孔安国","论语集解引","君子慎所习。"),
                ("邢昺","论语注疏","此章言君子当慎其所习也。……若习于善则为君子，若习于恶则为小人，是相远也。"),
                ("张居正","四书直解","天之生人，本同一性……习于善的，便为圣为贤；习于恶的，便为愚为不肖。"),
                ("钱穆","论语新解","本章孔子责习不责性，以勉人为学。")],
  disputes=[("性之善恶",["孔子：只言「相近」，未判善恶","孟子：性善","荀子：性恶","朱熹/程子：气质之性有善有不善，性之本即理无不善"])],
  quality="strong"),
}

CTX_PATCH = {
 "LY-014": dict(before="《述而》36章「奢则不孙，俭则固。与其不孙也，宁固」", after="38章「子温而厉，威而不猛，恭而安」"),
 "LY-016": dict(before="《雍也》22章「务民之义，敬鬼神而远之，可谓知矣」", after="24章「齐一变，至于鲁；鲁一变，至于道」"),
 "LY-021": dict(before="《里仁》16章「君子喻于义，小人喻于利」", after="18章「事父母几谏，见志不从，又敬不违，劳而不怨」"),
 "LY-023": dict(before="《学而》11章「父在，观其志；父没，观其行」", after="13章「信近于义，言可复也；恭近于礼，远耻辱也」"),
 "LY-024": dict(before="《雍也》28章「子见南子，子路不说」", after="30章「夫仁者，己欲立而立人，己欲达而达人」"),
 "LY-026": dict(before="《阳货》1章「阳货欲见孔子，孔子不见」", after="3章「唯上知与下愚不移」"),
}

def parse_ratings(raw):
    r = {}
    for line in raw.splitlines():
        m = re.match(r'\|\s*([^|]+?)\s*\|\s*([^|]+?)\s*\|', line)
        if not m: continue
        k, v = m.group(1).strip(), m.group(2).strip()
        if k == '维度': continue
        r[k] = v
    return dict(
        popular=r.get('大众传播','未知'),
        academic=r.get('学术研究','未知'),
        commentary=r.get('历史注疏','未知'),
        modern=r.get('现代关联','未知'),
        authenticity=r.get('原典可靠性','待核实'),
        reading_value=r.get('独立阅读价值','中'),
        draw_suitability=r.get('抽签适用性','需要上下文'),
    )

URL_RE = re.compile(r'\((https?://[^\)]+)\)')
def split_evidence(text):
    out = {}
    keys = {'大众传播':'popular','学术研究':'academic','历史注疏':'commentary','现代关联':'modern'}
    for b in re.split(r'\n(?=- \*\*)', text):
        for zh, en in keys.items():
            if b.startswith('- **'+zh+'**'):
                out[en] = dict(text=b.strip(), urls=URL_RE.findall(b))
    for en in keys.values():
        out.setdefault(en, dict(text='', urls=[]))
    return out

LOC_RE = re.compile(r'《论语·([^》]+)》第(\d+)章')
def parse_location(loc):
    return [dict(book=m.group(1), chapter=int(m.group(2))) for m in LOC_RE.finditer(loc)]

def _norm_positions(nid, topic, p):
    """disputes 的 positions 必须是字符串列表。

    早期 LY-003「汉宋分歧」把两个并列陈述写成了一个字符串，
    前端 (d.positions || []).join() 直接 TypeError——用户点开 LY-003 详情页就白屏。
    这类错误不能等界面上暴露，数据层就该拦住，所以这里硬校验：
    传 list 照收；传单个字符串自动包成单元素列表；其余一律显式报错。
    """
    if isinstance(p, str):
        return [p]
    if not isinstance(p, (list, tuple)):
        raise SystemExit('disputes 类型错误：%s / %s 的 positions 不是列表：%r' % (nid, topic, p))
    out = []
    for x in p:
        if not isinstance(x, str) or not x.strip():
            raise SystemExit('disputes 内容错误：%s / %s 含非字符串或空条目：%r' % (nid, topic, x))
        out.append(x.strip())
    if not out:
        raise SystemExit('disputes 内容错误：%s / %s 的 positions 为空' % (nid, topic))
    return out


nodes = []
for it in PARSED:
    nid = it['id']; m = M[nid]
    patch = CTX_PATCH.get(nid, {})
    ctx = dict(
        speaker=m['speaker'], interlocutor=m['interlocutor'], occasion=m['occasion'],
        before=patch.get('before', it['context']),
        after=patch.get('after',''),
    )
    nodes.append(dict(
        id=nid, type='thought', classic='论语',
        title=m['short'], full_title=it['title'],
        original=it['original'],
        location=parse_location(it['location']),
        location_text=it['location'],
        context=ctx,
        idea=it['idea'],
        commentaries=[dict(author=a, work=w, text=t) for a,w,t in m['commentaries']],
        disputes=[dict(topic=t, positions=_norm_positions(nid, t, p)) for t,p in m['disputes']],
        evidence=split_evidence(it['evidence']),
        ratings=parse_ratings(it['ratings_raw']),
        verify=dict(status='已核实' if '已核实' in it['verify'] else '待核实', note=it['verify']),
        clusters=m['clusters'], tags=m['tags'],
        evidence_quality=m['quality'],
    ))

print('nodes:', len(nodes))
print('empty context.before:', [n['id'] for n in nodes if not n['context']['before']])
print('no url at all:', [n['id'] for n in nodes if not any(n['evidence'][k]['urls'] for k in ('popular','academic','commentary','modern'))])
print('no commentary:', [n['id'] for n in nodes if not n['commentaries']])
print('ratings sample:', json.dumps(nodes[0]['ratings'], ensure_ascii=False))
json.dump(nodes, open(os.path.join(BASE,'_build','_nodes_raw.json'),'w',encoding='utf-8'), ensure_ascii=False, indent=1)
print('written')
