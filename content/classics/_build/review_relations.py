# -*- coding: utf-8 -*-
"""P1：关系边逐条审核（2026-10-31 董事长裁决后终版）。

三层分离：
  fact_basis    原典事实层的依据类型：canon 原典直证 / canon+commentary 原典+注疏 / commentary 注疏
  relation_basis 关系本身的依据类型：canon 原典自带判语 / commentary 注家明确合观 / editorial 编辑阐释
  status         verified 已核实 / pending 待核实 / rejected 不成立（保留审校记录，不物理删除）

硬约束：relation_basis == 'editorial' 时默认不得 verified；
人工批准者必须同时有 approved_by 与 editorial_note，且产品措辞须标明「这是阐释，非原典事实」。
"""
import json, os

# 路径一律相对本文件解析，不写机器绝对路径。
# 换设备、换目录、别人 clone 下来都能直接跑。
BASE = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT = os.path.join(BASE, 'data')

# (from, to, type, label, fact_basis, relation_basis, status, basis, note, approved_by)
R = [
("LY-004","LY-015","complement","忠恕互补","canon+commentary","commentary","verified",
 "《里仁》15「吾道一以贯之」，曾子释为「夫子之道，忠恕而已矣」；朱熹《集注》「尽己之谓忠，推己之谓恕」。恕是消极面（勿施），忠是积极面（立人达人）。",
 "两端同属「忠恕」这一原典概念。但「忠恕」作为统合名目，出自曾子对「一以贯之」的解释，非孔子自道，故关系层依据记为注疏。",None),

("LY-004","LY-003","belongs","仁之方","canon","canon","verified",
 "《颜渊》2 仲弓问仁，孔子答以「己所不欲，勿施于人」；《雍也》30「能近取譬，可谓仁之方也已」。",
 "孔子本人在答「问仁」时给出此条，故为求仁之方而非仁之定义。方向不是推的。",None),

("LY-015","LY-003","belongs","仁之方","canon","canon","verified",
 "《雍也》30「夫仁者，己欲立而立人，己欲达而达人。能近取譬，可谓仁之方也已」——「仁之方」三字出自原文。",
 "全库最硬的一条，原文自带判语。",None),

("LY-003","LY-011","complement","工夫与本质","canon","editorial","pending",
 "《颜渊》1 颜渊问仁→「克己复礼为仁」；《颜渊》22 樊迟问仁→「爱人」。同篇两问两答。",
 "两章并置是文本事实，但「工夫/本质」的分判是编辑解释，注家未如此直说。需人工确认是否作为定论展示。",None),

("LY-003","LY-023","complement","礼的严格面与和的一面","canon","commentary","verified",
 "朱熹注《学而》12：「礼之为体虽严，而皆出于自然之理，故其为用，必从容而不迫」；又「严而泰，和而节，此理之自然，礼之全体也」。",
 "朱熹自己用「严而泰、和而节」把两面合起来，不是我们的拼合。",None),

("LY-001","LY-006","extends","学的终身展开","canon","editorial","pending",
 "《学而》1「学而时习之」；《为政》4「吾十有五而志于学……七十而从心所欲，不逾矩」。两章之「学」同指成德之学。",
 "「前者是原则、后者是一生展开」的结构是我们加的；两章无共同注疏支持这一递进。",None),

("LY-006","LY-024","same_theme","修养进程与中庸","canon","editorial","pending",
 "《为政》4「七十而从心所欲，不逾矩」；朱熹注为「随其心之所欲，而自不过于法度」，与《雍也》29「中庸之为德」的「不偏不倚」有呼应。",
 "「从心所欲不逾矩即中庸境界」是编辑类比，注家未直接等同。原 note 写「正是中庸境界的现身说法」过强，已改弱。",None),

("LY-012","LY-025","extends","义利之辨到君子结构","canon","canon","verified",
 "《里仁》16「君子喻于义，小人喻于利」；《卫灵公》18「君子义以为质，礼以行之，孙以出之，信以成之」。",
 "后者把「义」确立为君子的质干，是前者分判之后的正面建构。两章都以「义」为君子判准。",None),

("LY-020","LY-012","same_theme","「宜」的两个场景","canon","editorial","pending",
 "《宪问》34「以直报怨」；《里仁》16「君子喻于义」。朱熹注「直」为「至公而无私」，与「义」训「宜」可通。",
 "把「直」与「义」打通是借朱熹注做的引申，注家未把两章并论。",None),

("LY-021","LY-017","complement","以人为镜的两种说法","canon","canon","verified",
 "《里仁》17「见贤思齐焉，见不贤而内自省也」；《述而》22「三人行，必有我师焉。择其善者而从之，其不善者而改之」。",
 "两章句式与义理高度平行：见善则从、见不善则改。原典内部的互文。",None),

("LY-021","LY-002","complement","自省的两条路径","canon","editorial","pending",
 "《学而》4「吾日三省吾身：为人谋而不忠乎？与朋友交而不信乎？传不习乎？」；《里仁》17「见不贤而内自省」。",
 "同属「自省」无疑，但「逐条检点 vs 见人反己」的对举是编辑概括。",None),

("LY-021","LY-014","complement","内省与坦荡","canon","editorial","rejected",
 "《里仁》17「内自省」；《述而》37「君子坦荡荡，小人长戚戚」。",
 "**2026-10-31 董事长裁决：删除。** 不能仅凭「修身工夫」与「人格表现」之间的逻辑推演建立思想关系。注家无此说，原关系为编辑推演。保留审校记录，不物理删除。",None),

("LY-018","LY-023","contrast","两个「和」的语境差异","canon","editorial","pending",
 "《子路》23「君子和而不同」；《学而》12「礼之用，和为贵」，朱熹注「和者，从容不迫之意」。",
 "**2026-10-31 董事长裁决：由「互补」改为「对照」。** 两处「和」的语境与含义不同——一为人际差异中的协调，一为礼之施行的从容。对照只说明两条值得放在一起比较，不意味着表达同一个意思。",None),

("LY-020","LY-011","contrast","仁爱与正直回应之间的边界","canon","editorial","verified",
 "原典事实：《颜渊》22「仁者爱人」；《宪问》34「或曰：以德报怨，何如？子曰：何以报德？以直报怨，以德报德」——孔子明确否定「以德报怨」。",
 "编辑阐释：两者体现仁爱与正直回应之间的张力——仁爱不等于无原则的宽容，也不意味着对怨恨一概以恩德回应。此张力值得并列讨论，不应被强行调和。**这是编辑阐释，不是孔子本人建立的一套理论关系。产品展示必须标明这一层。**",
 "董事长 2026-10-31"),

("LY-005","LY-022","extends","德治的根据与机制","canon","canon","verified",
 "《为政》1「为政以德，譬如北辰，居其所而众星共之」；《颜渊》19「君子之德风，小人之德草，草上之风，必偃」。",
 "一为原则一为机制，同属德治论，递进明确。",None),

("LY-008","LY-025","same_theme","君子人格的整体性","canon","editorial","pending",
 "《为政》12「君子不器」；《卫灵公》18「君子义以为质，礼以行之，孙以出之，信以成之」。",
 "「不器」讲不限于一才一艺，「义以为质」讲以义为质干，角度不同，是否同主题需人工判断。",None),

("LY-009","LY-002","same_theme","信的两个层面","canon","canon","verified",
 "《为政》22「人而无信，不知其可也」；《学而》4「与朋友交而不信乎」。",
 "同一德目的两个层面，文本明确，非引申。",None),

("LY-026","LY-006","extends","人性论前提与修养进程","canon","editorial","pending",
 "《阳货》2「性相近也，习相远也」；《为政》4 六阶段。",
 "「六阶段是习的展开」是把两章接起来的编辑构造，注家未如此读。",None),

("LY-010","LY-001","same_theme","学之乐","canon","editorial","pending",
 "《雍也》20「知之者不如好之者，好之者不如乐之者」；《学而》1「学而时习之，不亦说乎」。",
 "两章共享「学之乐」主题，但无注疏并论。此边为新增，替代原「学而不思→知之好之者」。",None),

("LY-007","LY-001","complement","学与习、学与思","canon","editorial","pending",
 "《学而》1「学而时习之」重实践；《为政》15「学而不思则罔，思而不学则殆」重反思。",
 "「习」与「思」分属两端，合看才是完整学习过程——这个框定是编辑判断。",None),

("LY-019","LY-001","same_theme","学的乐趣与生活的舒展","canon","editorial","rejected",
 "《先进》26 曾皙「浴乎沂，风乎舞雩，咏而归」，孔子叹「吾与点也」；《学而》1「学而时习之，不亦说乎」。",
 "**2026-10-31 董事长裁决：删除。** 两者可以分别讨论，但目前缺少足够直接的关联依据。曾皙言志讲的是政治理想与生活境界，不是「学之乐」。保留审校记录，不物理删除。",None),

("LY-007","LY-010","extends","学思到乐学","canon","editorial","rejected",
 "《为政》15「学而不思则罔，思而不学则殆」；《雍也》20「知之者不如好之者，好之者不如乐之者」。",
 "**判定不成立**：一讲认知方法（学与思的配比），一讲情感层次（知/好/乐），不是同一问题的展开。原边仅因都含「学」字而设。",None),

("LY-014","LY-016","same_theme","君子的心境与情态","canon","editorial","rejected",
 "《述而》37「君子坦荡荡，小人长戚戚」；《雍也》23「知者乐水，仁者乐山」。",
 "**判定不成立**：一为心境描述，一为审美隐喻，无共同文本依据，无注家并论。原 note「乐山乐水是坦荡荡的外显」是臆断。",None),

("LY-026","LY-024","same_theme","性与德","canon","editorial","rejected",
 "《阳货》2「性相近也，习相远也」；《雍也》29「中庸之为德也，其至矣乎」。",
 "**判定不成立**：仅因都涉及人的本性与成德而设，无文本或注疏支撑。",None),

("LY-013","LY-024","same_theme","道与中庸","canon","editorial","rejected",
 "《里仁》8「朝闻道，夕死可矣」；《雍也》29「中庸之为德」。",
 "**判定不成立**：原 note「闻道是目标，中庸是抵达的方式」是拼凑，两章无关联。",None),
]

# ===== 2026-10-31 董事长逐条终审裁决 =====
# 键 = (from, to)，避免依赖编号；值 = 需覆盖的字段
DECISIONS = {
 # 通过 4 条
 ("LY-004","LY-015"): dict(status="verified", relation_basis="commentary",
   review_note="**2026-10-31 董事长裁决：通过。** 保留「互补」，并注明：「忠恕」作为统合名目，出自曾子对「一以贯之」的解释（《里仁》15「夫子之道，忠恕而已矣」），非孔子自道；「尽己之谓忠，推己之谓恕」为朱熹《集注》语。关系层依据记为注疏，不记原典。"),
 ("LY-021","LY-017"): dict(relation_basis="editorial", status="verified",
   approved_by="董事长 2026-10-31",
   review_note="**2026-10-31 董事长裁决：通过，但关系依据改标为编辑比较。** 两章句式与义理高度平行（见善则从、见不善则改），但原典无一处把两章并提；「互补」这一关系本身是编辑比较的结果，不是原典自带判语。经人工批准作已核实关系展示，产品须标明其依据是编辑比较。"),
 ("LY-021","LY-002"): dict(relation_basis="editorial", status="verified",
   approved_by="董事长 2026-10-31",
   review_note="**2026-10-31 董事长裁决：通过。** 《学而》4「吾日三省吾身」与《里仁》17「见不贤而内自省」，两处文本直接出现自省行为，归为同主题不需复杂思想史推演。但关系性质仍是编辑比较，不得升级为孔子专门提出的「两条自省路径」理论。"),
 # R-14 仁爱与正直回应：维持 2026-10-31 上一轮裁决（editorial + verified + approved_by）
 # 降为待核实 8 条
 ("LY-004","LY-003"): dict(status="pending",
   review_note="**2026-10-31 董事长裁决：降为待核实。** 「仁之方」不能直接作为「恕」与「克己复礼」之间的关系依据——《雍也》30 的「仁之方」是对「己欲立而立人，己欲达而达人」一段所下的判语，不是对《颜渊》2「己所不欲，勿施于人」的判语。原判把两处「仁之方」视作同一，属编辑连接。"),
 ("LY-015","LY-003"): dict(status="pending",
   review_note="**2026-10-31 董事长裁决：降为待核实。** 「仁之方」描述的是「己欲立、己欲达」这一段，不能直接证明它与「克己复礼」存在归属关系。原典给「仁之方」下判语，不等于原典建立了它与《颜渊》1 的关系——这是两个层次。"),
 ("LY-003","LY-023"): dict(status="pending", relation_basis="editorial",
   review_note="**2026-10-31 底本核对：降为待核实。** 朱熹《论语集注·学而》12 原文：「礼者，天理之节文，人事之仪则也……盖礼之为体虽严，而皆出于自然之理，故其为用，必从容而不迫」；「愚谓严而泰，和而节，此理之自然，礼之全体也」——「严而泰，和而节」确为朱熹本人按语（「愚谓」）。但朱熹讲的是《学而》12 一章内部「礼之体严 / 礼之用和」的体用关系，**并未把《颜渊》1「克己复礼」与本篇并论**。把「克己复礼」对接「礼之体严」这一面，是我们做的。另《颜渊》1 注「礼者，天理之节文也」与《学而》12 注同一表述，可证朱熹对「礼」的定义一贯，但定义一致不等于两章合观。故关系层依据由「注家合观」改为「编辑阐释」。"),
 ("LY-012","LY-025"): dict(status="pending",
   review_note="**2026-10-31 董事长裁决：降为待核实。** 两章都谈「义」，不等于原典直接建立了递进关系。「前者分判、后者正面建构」的递进是我们读出来的。"),
 ("LY-005","LY-022"): dict(status="pending",
   review_note="**2026-10-31 董事长裁决：降为待核实。** 德治原则与德风比喻可以联系，但「原则与机制」的分判是解释，非原典判语。"),
 ("LY-009","LY-002"): dict(status="pending",
   review_note="**2026-10-31 董事长裁决：降为待核实。** 两处都谈「信」，但不能仅凭同一个德目就认定关系已核实。"),
 # 删除关系 3 条（改 rejected，不物理删除）
 ("LY-001","LY-006"): dict(status="rejected",
   review_note="**2026-10-31 董事长裁决：删除关系。** 终身学习的联系过于宽泛，缺乏足够独特性。保留审校记录，不物理删除。"),
 ("LY-020","LY-012"): dict(status="rejected",
   review_note="**2026-10-31 董事长裁决：删除关系。** 以直报怨与义利之辨之间的联系太绕，朱熹训诂不足以证明两章互相关联。保留审校记录，不物理删除。"),
 ("LY-026","LY-006"): dict(status="rejected",
   review_note="**2026-10-31 董事长裁决：删除关系。** 把「性相近、习相远」直接接到人生六阶段，属于编辑构造。保留审校记录，不物理删除。"),
}


rel = []
for i, (f, t, ty, label, fb, rb, st, basis, note, appr) in enumerate(R, 1):
    rel.append({"id": f"R-{i:02d}", "from": f, "to": t, "type": ty, "label": label,
                "fact_basis": fb, "relation_basis": rb, "status": st,
                "basis": basis, "review_note": note,
                "approved_by": appr, "reviewed_at": "2026-10-31"})

# 应用终审裁决
for r in rel:
    d = DECISIONS.get((r['from'], r['to']))
    if d:
        r.update(d)
        r['decided'] = '2026-10-31 董事长逐条终审'

# 展示类别：防止下游模块因 status==verified 就把编辑阐释当作原典关系
for r in rel:
    if r['relation_basis'] == 'canon':
        r['display_class'] = 'canon_relation'
    elif r['relation_basis'] == 'commentary':
        r['display_class'] = 'commentary_relation'
    else:
        r['display_class'] = 'editorial_relation'
    r['must_label'] = (r['display_class'] == 'editorial_relation')


p = os.path.join(OUT, 'lunyu-network.json')
net = json.load(open(p, encoding='utf-8'))
net['relations'] = rel
json.dump(net, open(p, 'w', encoding='utf-8'), ensure_ascii=False, indent=1)

p = os.path.join(OUT, 'lunyu-thoughts.json')
th = json.load(open(p, encoding='utf-8'))
T = {t['id']: t for t in th}
for t in T.values():
    t['relations'] = []
for r in rel:
    if r['status'] == 'rejected':
        continue
    for a, b, direction in ((r['from'], r['to'], 'out'), (r['to'], r['from'], 'in')):
        if a in T:
            T[a]['relations'].append({"id": r['id'], "direction": direction,
                                      "peer": b, "peer_title": T[b]['title'],
                                      "peer_location": T[b].get('location_text',''),
                                      "type": r['type'], "label": r['label'],
                                      "status": r['status'],
                                      "fact_basis": r.get('fact_basis'),
                                      "relation_basis": r.get('relation_basis'),
                                      "display_class": r.get('display_class'),
                                      "must_label": r.get('must_label', False),
                                      "approved_by": r.get('approved_by')})
json.dump(th, open(p, 'w', encoding='utf-8'), ensure_ascii=False, indent=1)

from collections import Counter
print('关系边', len(rel), dict(Counter(r['status'] for r in rel)))
print('关系层依据', dict(Counter(r['relation_basis'] for r in rel)))
print('展示类别', dict(Counter(r['display_class'] for r in rel)))
print('人工批准', [r['id'] for r in rel if r['approved_by']])
print('孤立节点', [i for i, t in T.items() if not t['relations']])
