# -*- coding: utf-8 -*-
"""从 lunyu-content.json 生成 07_关系边审核清单.md，保证清单与数据完全一致。"""
import json, os

# 路径一律相对本文件解析，不写机器绝对路径。
# 换设备、换目录、别人 clone 下来都能直接跑。
BASE = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
d = json.load(open(os.path.join(BASE, 'data/lunyu-content.json'), encoding='utf-8'))
T = {t['id']: t for t in d['thoughts']}
R = d['relations']

ST = {'verified': '已核实', 'pending': '待核实', 'rejected': '不成立'}
TY = {'complement': '互补', 'extends': '延伸', 'same_theme': '同主题', 'contrast': '对照', 'belongs': '归属'}
FB = {'canon': '原典直证', 'canon+commentary': '原典+注疏', 'commentary': '注疏'}
RB = {'canon': '原典自带判语', 'commentary': '注家合观', 'editorial': '编辑阐释'}

from collections import Counter
CNT = Counter(r['status'] for r in R)
groups = [('A', 'verified', f"已核实 {CNT['verified']} 条（董事长逐条签字通过）"),
          ('B', 'pending', f"待核实 {CNT['pending']} 条（只能作探索推荐，须带「待考」）"),
          ('C', 'rejected', f"不成立 {CNT['rejected']} 条（不物理删除，保留审校记录）")]
ORPHANS = [t for t in d['thoughts'] if not t.get('relations')]

out = []
out.append('# 关系边审核清单（终版 · 25 条）\n')
out.append('> 2026-10-31 按董事长裁决落定。编号与 `data/lunyu-content.json` 的 `relations[].id` 一一对应，可直接按 R-编号裁决。\n')
out.append('> 每条记两层依据：**原典事实层**（这两句话本身出自哪里）与**关系层**（把两者连起来这件事依据是什么）。二者分开，是为了防止把编辑阐释说成原典事实。\n')
out.append('> 状态三值：已核实 4 / 待核实 12 / 不成立 9。不成立的不删除，保留「曾提出什么、为什么否定」的记录。\n')
out.append('> **`verified` 不等于原典关系。** 4 条已核实里只有 R-01 依据注疏明文，R-10、R-11、R-14 是经人工批准的编辑比较，展示时必须带「编辑阐释」标记。\n')

for tag, st, title in groups:
    out.append(f'\n---\n\n## {tag}. {title}\n')
    for r in [x for x in R if x['status'] == st]:
        f, t = T[r['from']], T[r['to']]
        out.append(f"**{r['id']}** ｜ {f['title']}（{f['location_text']}） → {t['title']}（{t['location_text']}） ｜ **{TY.get(r['type'], r['type'])} · {r['label']}**")
        out.append(f"原典事实层：{FB.get(r['fact_basis'], r['fact_basis'])} ｜ 关系层：{RB.get(r['relation_basis'], r['relation_basis'])} ｜ 状态：**{ST[st]}**" + (f" ｜ 人工批准：{r['approved_by']}" if r.get('approved_by') else ''))
        out.append(f"依据：{r['basis']}")
        out.append(f"判定：{r['review_note']}")
        out.append('')

out.append('\n---\n\n## D. 状态汇总\n')
out.append('| 状态 | 数量 | 产品表现 |')
out.append('|---|---|---|')
out.append(f"| 已核实 | {CNT['verified']} | 可作确定关系展示，陈述句 |")
out.append(f"| 待核实 | {CNT['pending']} | 只能作探索推荐，必须带「待考」 |")
out.append(f"| 不成立 | {CNT['rejected']} | 不展示，保留审校记录 |")
out.append('')
out.append(f"**{len(ORPHANS)} 个节点没有任何横向关系边：**" + '、'.join(f"{t['id']} {t['title']}" for t in ORPHANS) + '。')
out.append('不补造关系。产品上改用三个入口：同一思想群（原典归类）、同一篇章（文本位置）、主题推荐（编辑推荐，须标注「主题推荐，非思想关系」）。')
out.append('')
out.append('**`verified` 不等于原典关系。** 4 条已核实里，只有 R-01 依据注疏明文，其余 3 条是经人工批准的编辑比较。下游模块须读 `display_class` 与 `must_label`，不得只读 `status`。')
out.append('')
out.append('**人工批准的编辑阐释 3 条**：R-10、R-11、R-14（均 2026-10-31 董事长批准）。展示时必须先说原典事实，再说编辑阐释，不得把后者说成前者。')

open(os.path.join(BASE, '07_关系边审核清单.md'), 'w', encoding='utf-8').write('\n'.join(out))
print('已生成，行数', len('\n'.join(out).split('\n')))
print('\n'.join(out))
