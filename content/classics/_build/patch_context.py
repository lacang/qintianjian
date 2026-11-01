# -*- coding: utf-8 -*-
"""补齐 16 条节点的后文，规范抽签适用性取值，重建总包。"""
import json, os

# 路径一律相对本文件解析，不写机器绝对路径。
# 换设备、换目录、别人 clone 下来都能直接跑。
BASE = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT = os.path.join(BASE, 'data')

AFTER = {
 "LY-001": "《学而》2章「有子曰：其为人也孝弟，而好犯上者，鲜矣」",
 "LY-002": "《学而》5章「道千乘之国，敬事而信，节用而爱人，使民以时」",
 "LY-003": "《颜渊》2章「仲弓问仁。子曰：出门如见大宾，使民如承大祭……己所不欲，勿施于人」（与 LY-004 互见）",
 "LY-004": "《卫灵公》25章「吾之于人也，谁毁谁誉？如有所誉者，其有所试矣」",
 "LY-005": "《为政》2章「诗三百，一言以蔽之，曰：思无邪」",
 "LY-006": "《为政》5章「孟懿子问孝。子曰：无违」",
 "LY-007": "《为政》16章「攻乎异端，斯害也已」",
 "LY-008": "《为政》13章「子贡问君子。子曰：先行其言而后从之」",
 "LY-009": "《为政》23章「子张问：十世可知也？」",
 "LY-010": "《雍也》21章「中人以上，可以语上也；中人以下，不可以语上也」",
 "LY-011": "《颜渊》23章「子贡问友。子曰：忠告而善道之，不可则止，毋自辱焉」",
 "LY-012": "《里仁》17章「见贤思齐焉，见不贤而内自省也」（与 LY-021 互见）",
 "LY-013": "《里仁》9章「士志于道，而耻恶衣恶食者，未足与议也」",
 "LY-019": "（《先进》末章，无后文）",
 "LY-020": "《宪问》35章「骥不称其力，称其德也」",
 "LY-022": "《颜渊》20章「子张问：士何如斯可谓之达矣？」",
}
BEFORE_FIX = {
 "LY-004": "《卫灵公》23章「君子不以言举人，不以人废言」",
}

for fn, key in [('lunyu-thoughts.json','thoughts'), ('lunyu-content.json','thoughts')]:
    p = os.path.join(OUT, fn)
    d = json.load(open(p, encoding='utf-8'))
    T = d['thoughts'] if key == 'thoughts' and isinstance(d, dict) and 'thoughts' in d else d
    for t in T:
        if t['id'] in AFTER:
            t['context']['after'] = AFTER[t['id']]
        if t['id'] in BEFORE_FIX:
            t['context']['before'] = BEFORE_FIX[t['id']]
        if 'gold rule' in t.get('idea',''):
            t['idea'] = t['idea'].replace('gold rule的消极形式','金规则的消极形式')
        # 规范抽签适用性
        ds = t['ratings']['draw_suitability']
        if ds not in ('适合','需要上下文','不适合'):
            t['ratings']['draw_note'] = ds
            t['ratings']['draw_suitability'] = '需要上下文'
    json.dump(d, open(p,'w',encoding='utf-8'), ensure_ascii=False, indent=1)

# 重算抽签池
p = os.path.join(OUT,'lunyu-content.json')
d = json.load(open(p, encoding='utf-8'))
d['entrypoints']['random_encounter']['pool_size'] = sum(1 for t in d['thoughts'] if t['ratings']['draw_suitability']=='适合')
json.dump(d, open(p,'w',encoding='utf-8'), ensure_ascii=False, indent=1)

miss = [(t['id'],k) for t in d['thoughts'] for k in ('speaker','interlocutor','occasion','before','after') if not t['context'].get(k)]
print('上下文缺失:', miss if miss else '无')
print('抽签池:', d['entrypoints']['random_encounter']['pool_size'])
import collections
print(dict(collections.Counter(t['ratings']['draw_suitability'] for t in d['thoughts'])))
