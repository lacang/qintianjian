# -*- coding: utf-8 -*-
"""把注疏层异文线索按批切成人工核校包。

职责：从 variant-ledger.json 取线索，按「多本命中优先」排序后切前 N 组，
      每组并列原典句与注本侧原文，供人逐组判断差异性质。
数据来源：raw/commentary/index/variant-ledger.json、commentary-index.json、
          raw/commentary/text/*.txt（行号来自线索的 loc_start/loc_end）。
对外接口：`python3 make_review_batch.py [组数]` → variant-review-batch1.md
副作用：只写这一个 md 文件。

跟 variant-review-worklist.md 的区别只有窗口大小：全量单给 110 字（看整段上下文），
核校批收到 40 字（在聊天窗口里逐组读得完）。窗口小了不算裁剪证据——
源文件行号照给，要看整章随时回源。

不判差异类型。程序只把两侧原文并排放好。判类型会命中偶然匹配，
已实测失败（出过「注本『者可程子』vs 原典『诲汝之乎』」这种完全不相干的结果）。
"""
import io
import json
import os
import sys
from collections import defaultdict

import locate_snippet as L

BASE = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
IDX = os.path.join(BASE, 'raw', 'commentary', 'index')
OUT = os.path.join(IDX, 'variant-review-batch1.md')
WIDTH = 40


def main(n_batch=20):
    v = json.load(io.open(os.path.join(IDX, 'variant-ledger.json'), encoding='utf-8'))
    idx = json.load(io.open(os.path.join(IDX, 'commentary-index.json'), encoding='utf-8'))
    by_id = {e['id']: e for e in idx['entries']}

    groups = defaultdict(list)
    for it in v['items']:
        groups[it.get('group_id') or it['ledger_id']].append(it)
    rows = [(g, grp, sorted({x['commentary_key'] for x in grp}))
            for g, grp in groups.items()]
    # 多本同时命中的排前面：说明不是单一底本的孤立写法
    rows.sort(key=lambda r: (-len(r[2]), r[1][0]['chapter']))
    batch = rows[:n_batch]

    L_ = []
    L_.append('# 注疏层异文线索 核校批 01（前 %d 组）\n' % len(batch))
    L_.append('**不是校勘结论。** 全部 `confirmed = false`。'
              '程序只做「发现两侧不同」和「定位到源文件行」，性质由人判断。\n')
    L_.append('判读时三个状态别混：**发现差异** → **识别差异性质** → **确认版本事实**。'
              '三者不能跳级，`confirmed = true` 只代表有核校依据，不代表两边文字匹配成功。\n')
    L_.append('注本侧窗口取差异点前后各 %d 字；要看整章按行号回源文件。\n' % WIDTH)

    for n, (gid, grp, books) in enumerate(batch, 1):
        it = grp[0]
        e = by_id.get(it['entry_id']) or {}
        raw = L.read_span(BASE, it['source_file'], it['loc_start'], it['loc_end'])
        wins, probe = L.locate_all(raw, e.get('canon_text'), it.get('canon_snippet'),
                                   it['differs'][0], width=WIDTH)
        seg = ' ／ '.join(wins)
        L_.append('\n---\n')
        L_.append('### %d. `%s`｜%s · %s\n' % (n, gid, it['book'], it['chapter']))
        L_.append('- 线索：%s' % '、'.join(x['ledger_id'] for x in grp))
        L_.append('- 注本（%d）：%s' % (len(books), '、'.join(books)))
        L_.append('- 源文件：`%s` L%s–L%s'
                  % (it['source_file'], it['loc_start'], it['loc_end']))
        L_.append('- 原典：`%s`' % it['canon_classic'])
        L_.append('')
        L_.append('**原典**：%s' % (e.get('canon_text') or it['canon_snippet']))
        L_.append('')
        L_.append('**注本侧**（%s）：%s'
                  % ('按「%s」定位' % probe if probe
                     else '未能定位到该句，请按行号回源核对——不给章首冒充位置',
                     seg or raw[:WIDTH * 2] + '…'))
        L_.append('')
        L_.append('**差异**：`%s`' % '` / `'.join(it['differs']))
        L_.append('')
        L_.append('判断：☐字词 ☐脱文 ☐衍文 ☐语序 ☐结构性 ☐非异文（归一表应补）')
        L_.append('依据：')
        L_.append('能否确认：☐可确认 ☐待考')

    io.open(OUT, 'w', encoding='utf-8').write('\n'.join(L_) + '\n')
    print('核校批 01 → %s（%d 组）' % (os.path.relpath(OUT, BASE), len(batch)))


if __name__ == '__main__':
    main(int(sys.argv[1]) if len(sys.argv) > 1 else 20)
