# -*- coding: utf-8 -*-
"""生成纠错节点、证据层、结论层与钦天监调用总包。"""
import json, os, re, datetime

# 路径一律相对本文件解析，不写机器绝对路径。
# 换设备、换目录、别人 clone 下来都能直接跑。
BASE = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT = os.path.join(BASE, 'data')
EV = os.path.join(OUT, 'evidence')
os.makedirs(EV, exist_ok=True)

thoughts = json.load(open(os.path.join(OUT,'lunyu-thoughts.json'), encoding='utf-8'))
net = json.load(open(os.path.join(OUT,'lunyu-network.json'), encoding='utf-8'))
byid = {t['id']: t for t in thoughts}

# ---- 群归属以 CLUSTERS 为唯一权威 ----
# thought.clusters 原先来自 build_nodes 的旧分组词（学习/修身/仁/…/德性/人性，共 12 个），
# 与 clusters 定义的 name（忠恕/仁/君子人格/义利之辨/学习/修身/处世/政治/人生与教育，共 9 个）
# 不是同一套词表：导致「义利之辨」「人生与教育」两个群匹配不到节点，LY-019、LY-026 整条从
# 探索页消失。现改为由 CLUSTERS.branches 反向推导，clusters 存群 id，cluster_names 存群名。
_node2clusters = {}
for _c in net['clusters']:
    for _b in _c.get('branches', []):
        _node2clusters.setdefault(_b['node'], []).append(_c['id'])
_clname = {c['id']: c['name'] for c in net['clusters']}
_missing = [t['id'] for t in thoughts if t['id'] not in _node2clusters]
assert not _missing, f'CLUSTERS 未覆盖节点: {_missing}'
for t in thoughts:
    t['clusters'] = _node2clusters[t['id']]
    t['cluster_names'] = [_clname[cid] for cid in t['clusters']]

# ============ 纠错节点 ============
C = [
 dict(id="COR-001", title="以德报怨", location="《论语·宪问》第34章",
   original="或曰：「以德报怨，何如？」子曰：「何以报德？以直报怨，以德报德。」",
   popular="「以德报怨」是孔子主张的处世态度——用恩惠回报怨恨，是最高境界的宽容。",
   diff_type="严重误读（立场反转）",
   diff_detail="「以德报怨」在原文中是**提问者**的话，不是孔子的主张。孔子用「何以报德」反问，明确否定了它，并给出自己的方案：以直报怨、以德报德。把提问当成结论，等于让孔子为自己反对的观点背书。",
   commentary_note="朱熹《集注》：直谓「爱憎取舍，一以至公而无私」。何晏《集解》：怨以直报之，德以德报之。",
   commentary_status="朱熹注已核（ctext/古诗文网），何晏注待核底本",
   modern_debate="「直」的解释存在实质分歧：一说至公无私（朱熹），一说正直不曲，一说读为「值」即对等回报（部分当代学者），一说依理而行。这不是训诂细节，而是决定「如何面对伤害」的不同伦理方案。",
   related_thought="LY-020", relation="corrects", risk="high",
   sources=[dict(url="http://m.news.cctv.com/2018/09/28/ARTIo47hUK2tZNNzP9lIUW5E180928.shtml", name="央视新闻"),
            dict(url="https://news.gmw.cn/2022-03/07/content_35567055.htm", name="光明网")]),
 dict(id="COR-002", title="三十而立", location="《论语·为政》第4章",
   original="子曰：「吾十有五而志于学，三十而立……」（全章为孔子自述修养进程）",
   popular="三十岁要成家立业、买房立足、事业有基础。",
   diff_type="语义改写（世俗化）",
   diff_detail="「立」在《论语》中有确定含义：《泰伯》「立于礼」、《尧曰》「不知礼，无以立也」。指人格独立、言行合于礼，与买房成家无直接关系。原文也非普遍要求，而是孔子自述。",
   commentary_note="历代注家多训「立」为「有所成立」「立于礼」，无一家解为成家立业。",
   commentary_status="概括性表述，未逐条核对注文原文",
   modern_debate=None,
   related_thought="LY-006", relation="corrects", risk="high",
   sources=[dict(url="https://zsrbapp.zsnews.cn/mobile/news/viewNews/2/746950", name="中山日报/刘强讲座")]),
 dict(id="COR-003", title="言必信，行必果", location="《论语·子路》第20章",
   original="言必信，行必果，硁硁然小人哉！",
   popular="说话算话、做事果断，是对人可靠程度的最高评价。",
   diff_type="褒贬颠倒",
   diff_detail="原文紧接着「硁硁然小人哉」——孔子评价的是「一味死守诺言、不问是非」的固执，属贬义。孟子亦言「大人者，言不必信，行不必果，惟义所在」（《离娄下》），可互证。",
   commentary_note="「硁硁」形容小石坚硬之貌，喻固执而不通义。",
   commentary_status="概括性表述，未逐字核对注文",
   modern_debate=None,
   related_thought=None, soft_related="LY-009", relation="corrects", risk="high",
   sources=[dict(url="http://m.toutiao.com/group/7642477909357117962/", name="今日头条（自媒体，可靠性低）"),
            dict(url="https://zsrbapp.zsnews.cn/mobile/news/viewNews/2/746950", name="中山日报/刘强讲座")]),
 dict(id="COR-004", title="愚不可及", location="《论语·公冶长》第17章",
   original="子曰：「宁武子邦有道则知，邦无道则愚。其知可及也，其愚不可及也。」",
   popular="形容一个人愚蠢到了极点。",
   diff_type="语义完全翻转",
   diff_detail="孔子在称赞宁武子：世道清明时显露才智，世道昏乱时装傻避祸。「其愚不可及」意为「他那种装傻的境界，别人赶不上」——是极高的赞美，不是贬低。",
   commentary_note="注家多解「愚」为「佯愚」「沈晦以免患」，非真愚。",
   commentary_status="概括性表述，未逐字核对注文",
   modern_debate=None,
   related_thought=None, relation="corrects", risk="high",
   sources=[dict(url="http://m.news.cctv.com/2018/09/28/ARTIo47hUK2tZNNzP9lIUW5E180928.shtml", name="央视新闻")]),
 dict(id="COR-005", title="老而不死，是为贼", location="《论语·宪问》第46章",
   original="「幼而不孙弟，长而无述焉，老而不死，是为贼。」以杖叩其胫。（原壤夷俟章）",
   popular="老年人是祸害、是没用的人。",
   diff_type="断章取义（对象丢失）",
   diff_detail="全章是孔子对老朋友原壤的责备，且是坐着伸腿不守礼的具体场景。批评对象是「幼不孝悌、长无建树」的这个人，不是对老年人群体的判断。",
   commentary_note="注家多指出此为「责原壤」之辞，属朋友间的戏责。",
   commentary_status="概括性表述，未逐字核对注文",
   modern_debate=None,
   related_thought=None, relation="corrects", risk="high",
   sources=[dict(url="http://m.toutiao.com/group/7642477909357117962/", name="今日头条（自媒体，可靠性低）")]),
 dict(id="COR-006", title="学而优则仕", location="《论语·子张》第13章",
   original="子夏曰：「仕而优则学，学而优则仕。」",
   popular="学习优秀就去做官。",
   diff_type="语义倒置 + 归属错误",
   diff_detail="「优」意为「有余力」，不是「优秀」。原意是：做官有余力就去学习，学习有余力就去做官——讲的是学与仕的互补循环，不是选拔逻辑。且此句出自子夏，非孔子原话。",
   commentary_note="注家多训「优」为「有余力」。",
   commentary_status="概括性表述，未逐字核对注文",
   modern_debate=None,
   related_thought=None, soft_related="LY-001", relation="corrects", risk="medium",
   sources=[dict(url="http://m.news.cctv.com/2018/09/28/ARTIo47hUK2tZNNzP9lIUW5E180928.shtml", name="央视新闻")]),
 dict(id="COR-007", title="民可使由之，不可使知之", location="《论语·泰伯》第9章",
   original="子曰：「民可使由之，不可使知之。」",
   popular="老百姓只要照做就行，不必让他们明白道理——被视为孔子「愚民」的证据。",
   diff_type="句读争议（非单纯误读）",
   diff_detail="原文无标点。传统句读如上；另有学者主张断为「民可，使由之；不可，使知之」（百姓认可就让他们去做，不认可就让他们明白）。断句不同，含义完全相反。这一条应作为「争议」呈现，而不是直接判定谁对谁错。",
   commentary_note="历代主流注本多从传统句读；改读之说在近代以来影响较大，但缺乏版本依据。",
   commentary_status="概括性表述，未逐条核对注文与版本",
   modern_debate="争议焦点：改读是否有版本/训诂支撑，还是出于为孔子辩护的现代需要。这是典型的「学术分歧应并列呈现」条目。",
   related_thought=None, relation="disputed", risk="high",
   sources=[dict(url="http://m.toutiao.com/group/7642477909357117962/", name="今日头条（自媒体，可靠性低）")]),
 dict(id="COR-008", title="小不忍则乱大谋", location="《论语·卫灵公》第27章",
   original="子曰：「巧言乱德。小不忍，则乱大谋。」",
   popular="小事上不能忍耐，就会坏了大事。",
   diff_type="词义误读",
   diff_detail="有学者考证，先秦至汉代「忍」不带宾语且受否定时，多表「忍心」而非「忍耐」。若如此，「小不忍」指「在小事上不忍心（心太软）」，而非「不能忍耐」。此说尚未成为定论，应作为分歧并列。",
   commentary_note="传统注本多解为「忍耐」。",
   commentary_status="概括性表述，未逐条核对注文",
   modern_debate="「忍」释为「忍心」属当代学者的训诂新说，影响不小但未获普遍接受。",
   related_thought=None, soft_related="LY-024", relation="corrects", risk="medium",
   sources=[dict(url="http://m.toutiao.com/group/7642477909357117962/", name="今日头条（自媒体，可靠性低）")]),
 dict(id="COR-009", title="君子固穷", location="《论语·卫灵公》第2章",
   original="「君子固穷，小人穷斯滥矣。」（在陈绝粮章）",
   popular="君子安于贫穷、甘于清贫。",
   diff_type="词义误读",
   diff_detail="「固」在此为副词「固然」「本来」：「君子固然也有困顿的时候，但不像小人一困顿就胡作非为」。不是「固守贫穷」。孔子并不否定求富——《述而》「富而可求也，虽执鞭之士，吾亦为之」。",
   commentary_note="注家多解「固」为「固有」「固然」。",
   commentary_status="概括性表述，未逐字核对注文",
   modern_debate=None,
   related_thought=None, soft_related="LY-014", relation="corrects", risk="medium",
   sources=[dict(url="http://m.toutiao.com/group/7642477909357117962/", name="今日头条（自媒体，可靠性低）")]),
]
for c in C:
    c['type'] = 'correction'
    c['classic'] = '论语'
    if c.get('related_thought'):
        assert c['related_thought'] in byid, c['id']
    if c.get('soft_related'):
        assert c['soft_related'] in byid, c['id']

# 反向：思想节点记录自己被哪些纠错条目指向
for c in C:
    if c.get('related_thought'):
        byid[c['related_thought']].setdefault('corrections', []).append(c['id'])
        # 纠错边只登记在 corrections 字段。
        # 早期这里还往 thought.relations 里塞了一条 type='corrects' 的边，后果是：
        # 它没有 peer 字段，产品端 relationBadge() 拿不到 status 与 display_class，
        # 会一路 fallthrough 到「原典有据」——一条 AI 初筛的纠错边被当成原典关系展示给用户，
        # 点进去还会跳到 undefined。纠错不是思想关系，不该混进关系索引。

json.dump(C, open(os.path.join(OUT,'lunyu-corrections.json'),'w',encoding='utf-8'), ensure_ascii=False, indent=1)
json.dump(thoughts, open(os.path.join(OUT,'lunyu-thoughts.json'),'w',encoding='utf-8'), ensure_ascii=False, indent=1)

# ============ 证据层：全部来源清单 ============
URL_RE = re.compile(r'https?://[^\s\)\]，。；]+')
src = {}
def add(url, kind, used_by, note=''):
    if not url: return
    src.setdefault(url, dict(url=url, kind=set(), used_by=set(), note=''))
    src[url]['kind'].add(kind); src[url]['used_by'].add(used_by)
    if note: src[url]['note'] = note

for t in thoughts:
    for dim, blk in t['evidence'].items():
        for u in blk['urls']: add(u, dim, t['id'])
    for s in t.get('supplement',{}).get('items',[]):
        add(s.get('url'), s['dim'], t['id']+'（补充核验）', s.get('source_name',''))
for c in C:
    for s in c['sources']: add(s['url'], 'correction', c['id'], s['name'])

# 数字核验补充来源
EXTRA = [
 ("https://m.sohu.com/a/1085738059_122973919/", "claim-86w", "搜狐自媒体原文（孤证）", "作者「飞海麻雀」，2026-10-10 发布；文中「八十六万人在看」为唯一出处，未附知乎问题链接"),
 ("https://jps.ecnu.edu.cn/CN/Y2017/V40/I3/657", "claim-308", "《心理科学》官网条目页（原始）", "张瑞平、李庆安《大学生人格特质与主观幸福感的关系：儒家心理资产的中介作用》2017,40(3):657-663"),
 ("http://dianda.cqvip.com/Qikan/Article/Detail?id=672253568", "claim-308", "维普条目（第二入口）", "同上，标注被引量 8"),
 ("https://pdf.hanspub.org/ap_1135944.pdf", "claim-1263", "论文 PDF 全文（原始）", "杨倩、张莹《仁人理想人格的心理学测量及其应用》《心理学进展》2025,15(8):50-57"),
 ("http://m.qikan.cqvip.com/Article/ArticleDetail?id=HS723912025008008", "claim-1263", "维普条目（第二入口）", "同上"),
]
for u,k,n,note in EXTRA:
    src.setdefault(u, dict(url=u, kind=set(), used_by=set(), note=''))
    src[u]['kind'].add(k); src[u]['used_by'].add(n); src[u]['note'] = note

sources = [dict(url=v['url'], kind=sorted(v['kind']), used_by=sorted(v['used_by']), note=v['note']) for v in src.values()]
sources.sort(key=lambda x: (x['kind'][0], x['url']))
json.dump(dict(generated_at=datetime.date.today().isoformat(), total=len(sources), sources=sources),
          open(os.path.join(EV,'sources.json'),'w',encoding='utf-8'), ensure_ascii=False, indent=1)

# ============ 结论层：数字与关键论断的溯源审计 ============
claims = [
 dict(id="CLM-001", claim="知乎「曾皙言志」相关讨论有 86 万人围观", where="report / 26条中 LY-019 的大众传播证据",
   status="未溯源（孤证，建议删除数字）",
   finding="追到底只有一篇搜狐自媒体文章（署名「飞海麻雀」，2026-10-10）。该文是一手创作，未附知乎问题链接，也未标注任何指标读取时刻。「86万」无指标名（知乎显示的是「被浏览」「关注者」「回答数」，无「在看」）。知乎域名被 robots.txt 明确禁止自动访问，原始页面无法核实。",
   action="删除「86万」与「热榜」这类量化断言。可改写为「知乎上关于此章的讨论长期存在，近年仍被反复提起」。",
   evidence=["https://m.sohu.com/a/1085738059_122973919/"]),
 dict(id="CLM-002", claim="李庆安团队（《心理科学》2017）以 308 名被试验证儒家心理资产对幸福感的正向预测", where="report / LY-003 的学术研究证据",
   status="部分溯源（论文真实、样本量吻合，结论表述被改写）",
   finding="论文真实：张瑞平、李庆安《大学生人格特质与主观幸福感的关系：儒家心理资产的中介作用》，《心理科学》2017,40(3):657-663，308 名大学生（北师大，平均 18.77 岁，209 名女性）。但原文模型是「人格特质 →（儒家心理资产中介）→ 主观幸福感」，核心发现是**部分中介作用**；报告写成「正向预测」，改变了模型结构。另：第一作者是张瑞平，李庆安为第二作者。",
   action="保留 308 与文献信息，结论改写为「儒家心理资产在人格特质与主观幸福感之间起部分中介作用，其八个维度与主观幸福感总分呈正相关」。不得保留「正向预测」。",
   evidence=["https://jps.ecnu.edu.cn/CN/Y2017/V40/I3/657","http://dianda.cqvip.com/Qikan/Article/Detail?id=672253568"]),
 dict(id="CLM-003", claim="仁人理想人格实证研究（样本 1263）将克己复礼列为四个维度之一", where="report / LY-003 的现代关联证据",
   status="部分溯源（论文真实、样本量吻合、四维度名称有错）",
   finding="论文真实：杨倩、张莹《仁人理想人格的心理学测量及其应用》，《心理学进展》2025,15(8):50-57，总有效样本量 1263。但报告的四个维度名称有两个是错的：论文实际四维度为「爱人行善、自省为仁、克己复礼、忠恕之道」；报告写的「己欲立而立人」「恭宽信敏惠」在原文中均不作为维度名出现，是把《雍也》《阳货》两处原文误植为因子名。另：1263 是四个子样本（600+309+285+69）之和，不是一次 1263 人的调查。期刊层级：《心理学进展》是汉斯出版社开放获取期刊，非 CSSCI/北大核心。",
   action="四维度名称改为「爱人行善、自省为仁、克己复礼、忠恕之道」；说明 1263 为四子样本合计；注明期刊层级，不与《心理科学》并列作为同等强度的实证支持。",
   evidence=["https://pdf.hanspub.org/ap_1135944.pdf","http://m.qikan.cqvip.com/Article/ArticleDetail?id=HS723912025008008"]),
 dict(id="CLM-004", claim="至少 6 处严重误读已深度嵌入当代话语", where="report key_findings",
   status="已核实（本条为定性判断，非量化结论）",
   finding="9 条误读条目均有原文与差异说明；但除「以德报怨」外，多数条目的外部来源为自媒体（今日头条），可靠性低。差异本身可由原文直接判定，不依赖外部来源。",
   action="保留结论，但对外表述时不引用自媒体作为权威依据；应补权威来源或直接引用原文自证。",
   evidence=[]),
 dict(id="CLM-005", claim="传播热度/学术价值的高中低评级", where="26 条候选的七项交叉评价",
   status="未溯源（研究判断，非客观排名）",
   finding="报告自承未系统使用知网/万方做计量。所有「高/中/低」均为检索过程中的印象判断，无计量支撑。",
   action="在产品中不得以「高/中/低」作为排序或推荐依据；字段应重命名为 `research_judgement` 并在 UI 上不展示为客观评级。已在本数据结构中将该字段标注为 judgement 性质。",
   evidence=[]),
]
json.dump(dict(generated_at=datetime.date.today().isoformat(), note="结论层与证据层分离：本文件只记论断及其溯源状态，原始链接见 evidence/sources.json",
               claims=claims), open(os.path.join(EV,'claims-audit.json'),'w',encoding='utf-8'), ensure_ascii=False, indent=1)

# ============ 钦天监调用总包 ============
content = dict(
  meta=dict(
    name="论语思想内容库", classic="论语", version="1.0.0",
    generated_at=datetime.date.today().isoformat(),
    status="已终审（2026-10-31 董事长两轮逐条签字），可接入产品；关系边须按 display_class 与 status 分层展示",
    counts=dict(thoughts=len(thoughts), corrections=len(C), clusters=len(net['clusters']),
                relations=len(net['relations']),
                relations_verified=sum(1 for r in net['relations'] if r['status']=='verified'),
                relations_pending=sum(1 for r in net['relations'] if r['status']=='pending'),
                relations_rejected=sum(1 for r in net['relations'] if r['status']=='rejected'),
                draw_pool=sum(1 for t in thoughts if t.get('ratings',{}).get('draw_suitability')=='适合')),
    principles=[
      "证据层与结论层分离：claims 记录论断及溯源状态，sources 记录原始链接，二者不混写。",
      "学术分歧并列呈现，不合成单一答案（disputes 字段）。",
      "评级字段为研究判断，非客观计量结果，不得作为排序依据。",
      "误读内容独立为 correction 类型，与思想节点以 corrects 边关联。",
    ],
    caveats=[
      "26 条候选全部来自一次四维检索实验，样本不代表《论语》全貌（全书 492 章）。",
      "6 条候选（LY-014/016/021/023/024/026）原研究缺来源，已补注疏维度，但大众传播/学术研究维度仍为概括判断。",
      "9 条误读中 6 条的外部来源为自媒体，可靠性低；差异判定本身依据原文，不依赖这些来源。",
      "关系网络已于 2026-10-31 完成人工逐条终审：verified 4 / pending 12 / rejected 9。rejected 不展示但保留审校记录；pending 只能作探索推荐并带「待考」；editorial_relation 即使 verified 也必须显示「编辑阐释」标记。",
    ],
  ),
  clusters=net['clusters'],
  relations=net['relations'],
  thoughts=thoughts,
  corrections=C,
  entrypoints=dict(
    random_encounter=dict(
      desc="随机遇见：随机出现一条箴言",
      filter="ratings.draw_suitability == '适合'",
      fields=["title","original","idea","location_text"],
      pool_size=sum(1 for t in thoughts if t['ratings']['draw_suitability']=='适合'),
      next_action="可继续「理解原典」或「探索关联」",
      note="随机池由已审核内容资产决定，不允许 AI 根据用户问题临时挑选。池子成员 = draw_suitability == '适合' 的条目，该字段为人工审核项。",
    ),
    understand_original=dict(
      desc="理解原典：阅读完整上下文、注释和思想背景",
      fields=["context.speaker","context.interlocutor","context.occasion","context.before","context.after",
              "original","commentaries","disputes","supplement"],
      note="六要素缺一不可：谁说的、对谁说、当时讨论什么、前后文、历代注家、现存分歧。缺任一项即视为「上下文不完整」，产品上应提示而非硬编。",
    ),
    explore_relations=dict(
      desc="探索关联：发现其他作者、经典及相似或相反思想",
      fields=["relations","clusters"],
      display_rules=dict(
        verified="可作为确定关系展示，措辞为陈述句",
        pending="只能作为探索推荐展示，必须带「待考」标记，措辞为疑问或并列",
        rejected="不展示。保留在数据中作审校记录，供追溯为何不采用",
      ),
      type_rules=dict(
        complement="互补：两条思想之间存在可以说明的共同结构，合起来构成更完整的命题。用互补必须能指认这个结构；指不出就降为对照或判不成立。",
        contrast="对照：两条思想值得放在一起比较，不意味着表达同一个意思。语境不同即用对照，不得当互补用。",
      ),
      display_class_rules=dict(
        canon_relation="原典自带判语，可直接作事实陈述",
        commentary_relation="注家明确合观，展示时须注明是哪位注家、哪条注",
        editorial_relation="编辑阐释。即使 status 为 verified，也不得当作原典关系；必须显示「编辑阐释」标记（数据字段 must_label=true）",
      ),
      current_state=dict(
        verified=sum(1 for r in net['relations'] if r['status']=='verified'),
        pending=sum(1 for r in net['relations'] if r['status']=='pending'),
        rejected=sum(1 for r in net['relations'] if r['status']=='rejected'),
        total=len(net['relations']),
        editorial_approved=[r['id'] for r in net['relations'] if r.get('approved_by')],
      ),
      orphan_fallback=dict(
        desc="探索关联不等于关系网络跳转。节点无可靠关系边时，不得成为死胡同，也不得编造关系补全。",
        applies_to=[t['id'] for t in thoughts if not t.get('relations')],
        entries=[
          dict(id="same_cluster", label="同一思想群", basis="原典归类", desc="展示同思想群的其他节点"),
          dict(id="same_chapter", label="同一篇章", basis="文本位置", desc="展示《论语》同一篇内的其他章"),
          dict(id="topic_recommend", label="主题推荐", basis="编辑推荐", desc="编辑推荐的相关主题", must_label="主题推荐，非思想关系"),
        ],
        note="三个入口的依据分别是原典归类、文本位置、编辑推荐，三者都不构成思想关系。主题推荐必须显式标注，不得伪装成关系边。",
      ),
      note="关系类型：complement 互补 / extends 延伸 / same_theme 同主题 / contrast 对照 / belongs 归属。current_classic 仅《论语》，跨经典关联待后续经典接入后启用。",
    ),
  ),
)
json.dump(content, open(os.path.join(OUT,'lunyu-content.json'),'w',encoding='utf-8'), ensure_ascii=False, indent=1)

print('corrections:', len(C))
print('sources:', len(sources))
print('claims:', len(claims))
print('content.json size:', os.path.getsize(os.path.join(OUT,'lunyu-content.json')))
print('无关系节点:', [t['id'] for t in thoughts if not t['relations']])
