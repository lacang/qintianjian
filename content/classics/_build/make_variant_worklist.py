# -*- coding: utf-8 -*-
"""把异文线索整理成人工核校工作单。

不判差异类型——我试过自动判，中段定位会命中偶然匹配
（出过「注本『者可程子』vs 原典『诲汝之乎』」这种明显不相干的结果）。
差异类型属于版本学判断，自动猜会把真异文误判成排印差异。

工作单只做一件事：把原典侧和注本侧的原文摆在一起，
让人一眼能看出「这是通假字还是真的换了说法」。

用法：python3 make_variant_worklist.py
"""
import io
import json
import os
import sys
from collections import defaultdict

import locate_snippet as LOC

BASE = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT = os.path.join(BASE, 'raw', 'commentary', 'index', 'variant-review-worklist.md')


def main():
    v = json.load(io.open(os.path.join(BASE, 'raw', 'commentary', 'index',
                                       'variant-ledger.json'), encoding='utf-8'))
    idx = json.load(io.open(os.path.join(BASE, 'raw', 'commentary', 'index',
                                         'commentary-index.json'), encoding='utf-8'))
    by_id = {e['id']: e for e in idx['entries']}

    # 注本侧原文直接从源文件按行号取。
    # 不能只给 note_text：note_text 为空时工作单就成了单边材料，
    # 人看不到注本到底写的是什么字，等于没法判。
    #
    # 定位逻辑在 locate_snippet.py，与核校批共用一份——
    # 两处各写一套，改了一处忘了另一处，同一组线索在两个文件里
    # 会定位到不同句子，人看到就开始怀疑数据本身。
    groups = defaultdict(list)
    for it in v['items']:
        groups[it.get('group_id') or it['ledger_id']].append(it)

    rows = []
    for gid, grp in groups.items():
        books = sorted({x['commentary_key'] for x in grp})
        rows.append((gid, grp, books))
    # 多本同时命中的排前面：说明不是单一底本的孤立写法
    rows.sort(key=lambda r: (-len(r[2]), r[1][0]['chapter']))

    L = []
    L.append('# 异文线索 人工核校工作单\n')
    L.append('**这不是校勘结论。** 142 条线索全部 `confirmed = false`，'
             '本单只把原典侧与注本侧的原文并列，供人工判断。\n')
    L.append('差异类型（字词 / 脱文 / 衍文 / 语序 / 结构性）**留空待填**——'
             '自动判类型会命中偶然匹配，已实测失败，不能用来下结论。\n')
    L.append('线索 %d 条，归并为 %d 组；多本同时命中 %d 组。\n'
             % (v['count'], len(rows), sum(1 for r in rows if len(r[2]) > 1)))

    L.append('\n## 判读提示\n')
    L.append('- **字词**：字数相同、只差一两个字，多为通假或异体'
             '（女/汝、鼃/蛙、锺/钟、餽/馈）。属版本差异，不是错误。')
    L.append('- **脱文 / 衍文**：一边多出或少了一段。')
    L.append('- **语序**：字都在，顺序不同。')
    L.append('- **结构性**：整段归属、断句或章节划分不同。')
    L.append('- 判完把结论写回 `variant-ledger.json` 的 '
             '`diff_type` / `variant_scope` / `confirmed` / `confirmed_by`。\n')

    for n, (gid, grp, books) in enumerate(rows, 1):
        it = grp[0]
        e = by_id.get(it['entry_id']) or {}
        L.append('\n---\n')
        L.append('### %d. `%s` %s · %s\n' % (n, gid, it['book'], it['chapter']))
        L.append('- 线索编号：%s' % ', '.join(x['ledger_id'] for x in grp))
        L.append('- 涉及注本（%d）：%s' % (len(books), ', '.join(books)))
        L.append('- 源文件：`%s` L%s–L%s'
                 % (it['source_file'], it['loc_start'], it['loc_end']))
        L.append('- 原典归属：`%s`' % it['canon_classic'])
        L.append('')
        L.append('**原典句**（%s）\n' % it['canon_classic'])
        L.append('> %s\n' % (e.get('canon_text') or it['canon_snippet']))
        _raw = LOC.read_span(BASE, it['source_file'], it['loc_start'], it['loc_end'])
        _seg, _probe = LOC.locate(_raw, e.get('canon_text'), it.get('canon_snippet'),
                                it['differs'][0], width=110)
        L.append('**注本侧原文**（%s，源文件 L%s–L%s，%s）\n'
                 % (it['commentary_key'], it['loc_start'], it['loc_end'],
                    '按「%s」定位' % _probe if _probe
                    else '未能定位到该句，请按行号回源核对'))
        L.append('> %s\n' % (_seg or _raw[:220] + '…'))
        L.append('**差异片段**：`%s`\n' % '` / `'.join(it['differs']))
        L.append('**判断**：☐ 字词　☐ 脱文　☐ 衍文　☐ 语序　☐ 结构性　☐ 非异文（归一表应补）\n')
        L.append('**备注**：\n')

    io.open(OUT, 'w', encoding='utf-8').write('\n'.join(L))
    print('工作单 → %s（%d 组 / %d 条线索）'
          % (os.path.relpath(OUT, BASE), len(rows), v['count']))
    print('  多本命中 %d 组，单本独有 %d 组'
          % (sum(1 for r in rows if len(r[2]) > 1),
             sum(1 for r in rows if len(r[2]) == 1)))


if __name__ == '__main__':
    main()
