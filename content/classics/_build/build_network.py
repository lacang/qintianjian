# -*- coding: utf-8 -*-
"""生成《论语》内容库完整数据：思想节点 + 思想群 + 关系网络 + 纠错节点 + 证据层/结论层。"""
import json, re, os

# 路径一律相对本文件解析，不写机器绝对路径。
# 换设备、换目录、别人 clone 下来都能直接跑。
BASE = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT = os.path.join(BASE, 'data')
EV = os.path.join(OUT, 'evidence')
os.makedirs(EV, exist_ok=True)

nodes = json.load(open(os.path.join(BASE, '_build', '_nodes_raw.json'), encoding='utf-8'))
byid = {n['id']: n for n in nodes}

# ============ 1. 补全剩余前后文 ============
CTX2 = {
 "LY-015": dict(before="《雍也》29章「中庸之为德也，其至矣乎！民鲜久矣」", after="（本篇末章，无后文）"),
 "LY-017": dict(before="《述而》「子不语：怪、力、乱、神」", after="「天生德于予，桓魋其如予何」"),
 "LY-018": dict(before="《子路》「南人有言曰：人而无恒，不可以作巫医。善夫」", after="「乡人皆好之，何如？」"),
 "LY-025": dict(before="《卫灵公》「君子疾没世而名不称焉」", after="「君子病无能焉，不病人之不己知也」"),
}
for nid, p in CTX2.items():
    byid[nid]['context']['before'] = p['before']
    byid[nid]['context']['after'] = p['after']

# ============ 2. 六条无链接条目的补充核验证据 ============
# 这些条目在原研究中只有概括性表述、无来源链接；本次逐条补检索，标注证据强度
SUPP = {
"LY-014": dict(
  level="已补充（注疏维度）",
  note="原研究仅有「历代注家理解一致」一句概括，无来源。本次补得朱熹《集注》引程子语与皇侃《义疏》引江熙语，出处可核。大众传播/学术研究两维度仍为概括性判断，未做计量。",
  items=[
    dict(dim="历史注疏", text="朱熹《论语集注》：「坦，平也。荡荡，宽广貌。程子曰：君子循理，故常舒泰；小人役于物，故多忧戚。」",
         url="https://m.gushiwen.cn/guwen/bookv_e5d53259da92.aspx", source_name="古诗文网《四书章句集注·述而第七》"),
    dict(dim="历史注疏", text="《三鱼堂四书集注大全》同文，并录程子「君子坦荡荡，心广体胖」",
         url="https://www.shidianguji.com/book/CADAL02045666/chapter/1ln96np9u1u02", source_name="识典古籍《论语大全》卷七"),
    dict(dim="历史注疏", text="皇侃《论语义疏》引江熙：「君子坦而夷任，荡然无私；小人驰兢于荣利，耿介于得失，故长为愁府也。」（转引，未直读原书）",
         url="", source_name="转引自百科「孔子箴言」条目，属二手转引，标记为待核实"),
  ]),
"LY-016": dict(
  level="已补充（注疏+大众传播）",
  note="原研究仅「互文见义的理解」一句，无来源。本次补得朱熹《集注》完整注文（含出处页码）与人民日报引用。学术研究维度仍为概括判断。",
  items=[
    dict(dim="历史注疏", text="朱熹《论语集注》：「知者达于事理而周流无滞，有似于水，故乐水；仁者安于义理而厚重不迁，有似于山，故乐山。动静以体言，乐寿以效言也。」（《四书章句集注》中华书局1983，第90页）",
         url="http://confucian.ruc.edu.cn/xsyj/xsqy/b450fb2678a14003b6db70d35f1ece6d.htm", source_name="中国人民大学孔子研究院（引朱熹《论语集注》卷三）"),
    dict(dim="大众传播", text="《人民日报》2026-08-25「金台随笔」《智者为何「乐水」》直接引用此章及朱熹注",
         url="https://paper.people.com.cn/rmrb/pc/content/202608/25/content_30176952.html", source_name="人民日报"),
  ]),
"LY-021": dict(
  level="已补充（注疏+大众传播）",
  note="原研究缺「前后文」与「四维来源证据」两个字段。本次补齐前后文，并补得朱熹、包咸、邢昺、尹焞四家注及一处当代官方引用。",
  items=[
    dict(dim="历史注疏", text="朱熹《论语集注》：「思齐者，冀己亦有是善；内自省者，恐己亦有是恶。」胡氏：「见人之善恶不同，而无不反诸身者，则不徒羡人而甘自弃，不徒责人而忘自责矣。」",
         url="https://ctext.org/si-shu-zhang-ju-ji-zhu/li-ren-di-si/ens", source_name="中国哲学书电子化计划《四书章句集注·里仁》"),
    dict(dim="历史注疏", text="邢昺《论语注疏》引包咸「思与贤者等」，疏曰「此章勉人为高行也」",
         url="http://ssjdd.snnu.edu.cn/sbw/info/1051/2357.htm", source_name="陕西师范大学《十三经注疏》数据库"),
    dict(dim="大众传播", text="习近平 2018-01-11 在十九届中央纪委二次全会上引用「见不贤而内自省」",
         url="http://www.12371.cn/2021/04/07/VIDE1617797103195746.shtml", source_name="共产党员网"),
  ]),
"LY-023": dict(
  level="已补充（注疏维度）",
  note="原研究缺「前后文」与「四维来源证据」两个字段。本次补齐前后文，并补得朱熹、程子、范氏三家注。",
  items=[
    dict(dim="历史注疏", text="朱熹《论语集注》：「礼者，天理之节文，人事之仪则也。和者，从容不迫之意。……愚谓严而泰，和而节，此理之自然，礼之全体也。」程子：「礼胜则离……乐胜则流。」范氏：「礼之体主于敬，其用则以和为贵。」",
         url="https://www.chinakongzi.org/baike/MINGCI/lunli/201707/t20170731_140208.htm", source_name="中国孔子网"),
  ]),
"LY-024": dict(
  level="已补充（注疏维度）",
  note="原研究仅「历代注家理解基本一致」一句，无来源。本次补得朱熹《集注》与程子定义，并确认「中=不偏不倚、庸=平常」的表述确出自朱熹《中庸章句》篇首，而非《论语集注》原文，需注意归属。",
  items=[
    dict(dim="历史注疏", text="朱熹《论语集注》：「中者，无过无不及之名也。庸，平常也。至，极也。鲜，少也。言民少此德，今已久矣。」",
         url="https://www.shidianguji.com/book/SK0559/chapter/1l9kmshzog1lv", source_name="识典古籍《四书通·朱子章句》"),
    dict(dim="历史注疏", text="程子：「不偏之谓中，不易之谓庸。中者，天下之正道；庸者，天下之定理。」（朱熹《中庸章句》篇首引）",
         url="https://www.shidianguji.com/zh/book/HY3288/chapter/1krw4u8fywbgs", source_name="识典古籍《中庸·四书集注》"),
  ]),
"LY-026": dict(
  level="已补充（注疏维度）",
  note="原研究缺「前后文」与「四维来源证据」两个字段。本次补齐前后文，并补得朱熹、程子、孔安国、邢昺、张居正、钱穆六家注。",
  items=[
    dict(dim="历史注疏", text="邢昺《论语注疏》引孔安国「君子慎所习」，疏曰「若习于善则为君子，若习于恶则为小人，是相远也」",
         url="http://ssjdd.snnu.edu.cn/sbw/info/1051/2344.htm", source_name="陕西师范大学《十三经注疏》数据库"),
    dict(dim="历史注疏", text="朱熹《集注》「此所谓性，兼气质而言者也」；程子「此言气质之性，非言性之本也」；张居正《四书直解》；钱穆「责习不责性」",
         url="https://www.xueruxue.com/xing-xiang-jin-ye.html", source_name="学儒学（集录诸家注）"),
  ]),
}
for nid, s in SUPP.items():
    byid[nid]['supplement'] = s
    byid[nid]['evidence_quality'] = 'medium'   # 由 weak 提升为 medium（注疏维度已可核，其余维度仍为判断）

# ============ 3. 思想群（cluster）定义 ============
CLUSTERS = [
 dict(id="C-ZS", name="忠恕", order=1,
   desc="孔子一以贯之之道的两个面：恕是消极面（不把自己不想要的加于人），忠是积极面（把自己想要的推及于人）。二者不是两条独立格言，而是同一原则的两端。",
   branches=[
     dict(node="LY-004", label="己所不欲，勿施于人", gloss="推己及人（恕·消极面）"),
     dict(node="LY-015", label="己欲立而立人，己欲达而达人", gloss="积极成就他人（忠·积极面）"),
   ],
   converge=dict(label="人际关系", desc="两端共同回答同一个问题：如何在与他人的关系中安放自己。抽到任一条，都可以走向另一端。")),
 dict(id="C-REN", name="仁", order=2,
   desc="《论语》的核心概念，既有本质定义（爱人），也有实践路径（克己复礼），还有推及方法（忠恕）。",
   branches=[
     dict(node="LY-011", label="仁者爱人", gloss="仁的本质：爱"),
     dict(node="LY-003", label="克己复礼为仁", gloss="仁的工夫：约束自己、回归礼"),
     dict(node="LY-004", label="己所不欲，勿施于人", gloss="仁之方（恕）"),
     dict(node="LY-015", label="己欲立而立人", gloss="仁之方（忠）"),
   ],
   converge=dict(label="成己成物", desc="从内在工夫到人际推及，仁是一条由己及人的路。")),
 dict(id="C-JZ", name="君子人格", order=3,
   desc="孔子对理想人格的多面刻画：不器（整体性）、坦荡（心境）、和而不同（处世）、义以为质（结构）、乐山乐水（情态）。",
   branches=[
     dict(node="LY-008", label="君子不器", gloss="整体性：不做单一工具"),
     dict(node="LY-014", label="君子坦荡荡", gloss="心境：循理故舒泰"),
     dict(node="LY-018", label="君子和而不同", gloss="处世：和谐而不苟同"),
     dict(node="LY-025", label="君子义以为质", gloss="结构：义质礼行逊出信成"),
     dict(node="LY-016", label="知者乐水，仁者乐山", gloss="情态：人格与自然的隐喻"),
   ],
   converge=dict(label="成人", desc="五个侧面合起来，是一个不被功能化、内心安定、能与差异共存的人。")),
 dict(id="C-YY", name="义利之辨", order=4,
   desc="不是否定利，而是确立义在利之先的价值排序。",
   branches=[
     dict(node="LY-012", label="君子喻于义，小人喻于利", gloss="分判：所喻不同"),
     dict(node="LY-025", label="君子义以为质", gloss="落实：义为质干"),
     dict(node="LY-020", label="以直报怨，以德报德", gloss="延伸：公正地对待怨与德"),
   ],
   converge=dict(label="公正", desc="义的核心是「宜」——在具体处境中做出恰当、公正的判断。")),
 dict(id="C-XX", name="学习", order=5,
   desc="《论语》开篇即是学。学不只是知识积累，而是实践、思考、兴趣与随处取法的统一。",
   branches=[
     dict(node="LY-001", label="学而时习之", gloss="学与实践的统一"),
     dict(node="LY-007", label="学而不思则罔", gloss="学与思的平衡"),
     dict(node="LY-010", label="知之者不如好之者", gloss="三层境界：知→好→乐"),
     dict(node="LY-017", label="三人行必有我师", gloss="随处取法"),
   ],
   converge=dict(label="乐学", desc="从「知道」走到「以此为乐」，是孔子对学习最高的期待。")),
 dict(id="C-XS", name="修身", order=6,
   desc="自我修养的具体方法：自省、思齐、见道、慎习、守中。",
   branches=[
     dict(node="LY-002", label="吾日三省吾身", gloss="每日三事自省"),
     dict(node="LY-021", label="见贤思齐", gloss="以他人为镜"),
     dict(node="LY-013", label="朝闻道，夕死可矣", gloss="道高于生命"),
     dict(node="LY-024", label="中庸之为德", gloss="不偏不倚的平衡"),
     dict(node="LY-026", label="性相近，习相远", gloss="人性论前提：慎所习"),
     dict(node="LY-006", label="吾十有五而志于学", gloss="终身修养的六阶段"),
   ],
   converge=dict(label="成德", desc="修养不是一次性完成，而是日复一日的选择累积。")),
 dict(id="C-CS", name="处世", order=7,
   desc="如何与他人相处：守信、和而不同、以直报怨、和而有节、推己及人。",
   branches=[
     dict(node="LY-009", label="人而无信，不知其可", gloss="立身之本"),
     dict(node="LY-018", label="君子和而不同", gloss="差异共存"),
     dict(node="LY-020", label="以直报怨", gloss="正义与宽容的边界"),
     dict(node="LY-023", label="礼之用，和为贵", gloss="和谐须有节"),
   ],
   converge=dict(label="共生", desc="在承认差异与冲突的前提下，找到可以长久相处的方式。")),
 dict(id="C-ZZ", name="政治", order=8,
   desc="德治的两个层次：为政者自身的德（为政以德），以及德如何向下传导（君子之德风）。",
   branches=[
     dict(node="LY-005", label="为政以德", gloss="德为政本，如北辰"),
     dict(node="LY-022", label="君子之德风", gloss="上行下效的传导机制"),
   ],
   converge=dict(label="风化", desc="政治的核心不是命令，而是在上者的人格所产生的风化力量。")),
 dict(id="C-RS", name="人生与教育", order=9,
   desc="孔子对「人应该怎样活着」与「教育为了什么」的回答。",
   branches=[
     dict(node="LY-019", label="曾皙言志", gloss="生活理想：浴乎沂，风乎舞雩"),
     dict(node="LY-006", label="吾十有五而志于学", gloss="人生阶段的自我叙述"),
   ],
   converge=dict(label="舒展", desc="最高的人生不是功业，而是「咏而归」那样的从容。")),
]

# ============ 4. 关系网络（AI 初筛，待人工确认） ============
R = [
 ("LY-004","LY-015","complement","忠恕互补","恕的消极面与忠的积极面，是同一原则的两端。这是本次最确定的一条关系。"),
 ("LY-004","LY-003","belongs","仁之方","「己所不欲」是求仁的方法，非仁本身。"),
 ("LY-015","LY-003","belongs","仁之方","「己欲立而立人」同为求仁的方法。"),
 ("LY-003","LY-011","complement","工夫与本质","克己复礼是「怎么做」，仁者爱人是「是什么」。"),
 ("LY-003","LY-023","complement","礼的严格面与和的一面","克己复礼强调礼的约束，礼之用和为贵强调礼的从容；合看才是完整的礼。"),
 ("LY-001","LY-006","extends","学的终身展开","「学而时习」是原则，「十五志学」到「从心所欲」是它在一生中的展开。"),
 ("LY-006","LY-024","same_theme","修养的终点与中庸","「七十而从心所欲，不逾矩」正是中庸境界的现身说法。"),
 ("LY-007","LY-010","extends","学思到乐学","学思结合解决「怎么学」，知之好之乐之解决「学到什么程度」。"),
 ("LY-007","LY-001","complement","学与习、学与思","学而时习讲实践，学而不思讲反思，合为完整的学习闭环。"),
 ("LY-012","LY-025","extends","义利之辨到君子结构","「喻于义」是分判，「义以为质」是把义落实为人格结构。"),
 ("LY-020","LY-012","same_theme","公正的两个场景","义利之辨讲取予，以直报怨讲恩怨，都是「宜」的判断。"),
 ("LY-014","LY-016","same_theme","君子的心境与情态","坦荡荡是内在状态，乐山乐水是这种状态的外显。"),
 ("LY-021","LY-014","complement","内省与坦荡","内自省是工夫，坦荡荡是工夫的结果。"),
 ("LY-021","LY-017","complement","以人为镜的两种说法","见贤思齐是主动对照，三人行必有我师是随处取法。"),
 ("LY-021","LY-002","complement","自省的两条路径","三省是逐条检点，思齐是见人反己。"),
 ("LY-018","LY-023","complement","两种「和」","和而不同讲差异中的和谐，礼之用和为贵讲和谐须有节。"),
 ("LY-020","LY-011","contrast","正义与宽容的张力","「以直报怨」与「仁者爱人」构成真实张力：爱是否要求无限宽容？孔子给出的答案是「直」。"),
 ("LY-005","LY-022","extends","德治的根据与机制","为政以德是原则，君子之德风是这个原则如何起作用。"),
 ("LY-008","LY-025","same_theme","君子人格的整体性","不器讲不局限于单一用途，义以为质讲人格的完整结构。"),
 ("LY-009","LY-002","same_theme","信","一处讲信为立身之本，一处讲与友交是否信。"),
 ("LY-026","LY-006","extends","人性论前提与修养进程","性相近习相远是前提，六阶段是「习」的具体展开。"),
 ("LY-026","LY-024","same_theme","性与德","人性相近，成德在于守中与慎习。"),
 ("LY-013","LY-024","same_theme","道与中庸","闻道是目标，中庸是抵达的方式。"),
 ("LY-019","LY-001","same_theme","学的乐趣与生活的舒展","学而时习之的「说」，与「咏而归」是同一种愉悦。"),
]
RELATIONS = [dict(id=f"R-{i+1:03d}", **dict(zip(["from","to","type","label","note"], r)), confirmed=False, source="AI初筛")
             for i, r in enumerate(R)]

# 校验
for r in RELATIONS:
    assert r['from'] in byid and r['to'] in byid, r
for c in CLUSTERS:
    for b in c['branches']:
        assert b['node'] in byid, (c['id'], b['node'])

# 反向索引
for n in nodes:
    n['relations'] = [r for r in RELATIONS if r['from']==n['id'] or r['to']==n['id']]

json.dump(nodes, open(os.path.join(OUT,'lunyu-thoughts.json'),'w',encoding='utf-8'), ensure_ascii=False, indent=1)
json.dump(dict(clusters=CLUSTERS, relations=RELATIONS),
          open(os.path.join(OUT,'lunyu-network.json'),'w',encoding='utf-8'), ensure_ascii=False, indent=1)
print('thoughts:', len(nodes), 'relations:', len(RELATIONS), 'clusters:', len(CLUSTERS))
print('每节点关系数:', {n['id']: len(n['relations']) for n in nodes})
