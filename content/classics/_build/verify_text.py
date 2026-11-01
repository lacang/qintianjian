# -*- coding: utf-8 -*-
"""用已人工核验的条目原文，反向校验原典数据源是否可靠。

思路：
    抽样 20 条去比对纸质书，是「人工校勘」；
    但更硬的一步是：拿已经人工核验过的 26 条原文，去和数据集切出的 512 章逐字比。
    如果对得上，说明数据源可信；如果对不上，差异本身就是要查的东西。

    这一步不能替代人工校勘，但能在人力之前先抓出系统性问题。

比对口径：
    - 去空白后逐字比（古籍排版空格无意义）
    - 引号统一后再比（「」"" 只是排版差异）
    - 标点差异如实报出，不视为等价——标点会影响句读
    - 一条对应多章的（如某条同时引卫灵公与颜渊），按最长匹配，报出未能整段命中的情况

输出：
    raw/reports/verify-lunyu.md
"""
import io
import json
import os
import re
import sys
import difflib

BASE = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
PARSED = os.path.join(BASE, 'parsed', 'lunyu.json')
CANON = os.path.join(BASE, 'parsed', 'canon', 'lunyu.json')
REPORT = os.path.join(BASE, 'raw', 'reports', 'verify-lunyu.md')

QUOTE_MAP = str.maketrans({
    '「': '“', '」': '”', '『': '‘', '』': '’',
    '﹁': '“', '﹂': '”', '‘': '“', '’': '”',
})


PUNCT_RE = re.compile(r'[，。；：？！、“”‘’（）《》〈〉—…·\-－\[\]【】]')


def norm(s):
    """去掉空白、统一引号。保留标点。"""
    s = s.translate(QUOTE_MAP)
    s = re.sub(r'\s+', '', s)
    return s


def bare(s):
    """再去掉标点。用于把「标点差异」和「字词差异」分开。

    这一步很关键：不同整理本的标点本来就不同（句号还是逗号、加不加顿号），
    那属于版本差异，不是数据错误。真正要抓的是字词脱漏或改写。
    """
    return PUNCT_RE.sub('', norm(s))


def main():
    with io.open(PARSED, encoding='utf-8') as f:
        items = json.load(f)
    with io.open(CANON, encoding='utf-8') as f:
        canon = json.load(f)

    chapters = canon['chapters']
    normed = [(c, norm(c['text'])) for c in chapters]
    bare_normed = [(c, bare(c['text'])) for c in chapters]

    exact, punct_only, excerpt, real_diff = [], [], [], []

    for it in items:
        raw = it.get('original', '')
        o = norm(raw)
        if not o:
            real_diff.append((it['id'], '原文为空', '', ''))
            continue
        ob = bare(raw)

        # 一级：逐字相同（含标点）
        hit = [c for c, n in normed if n == o]
        if hit:
            exact.append((it['id'], hit[0]['ref'], hit[0].get('chapter_system', '')))
            continue

        # 二级：只差标点
        hit2 = [c for c, n in bare_normed if n == ob]
        if hit2:
            punct_only.append((it['id'], hit2[0]['ref']))
            continue

        # 三级：条目是某章的节选（标点归一化后是子串）
        hit3 = [(c, n) for c, n in bare_normed if ob and ob in n]
        if hit3:
            best = max(hit3, key=lambda x: len(x[1]))
            excerpt.append((it['id'], best[0]['ref'], f'{len(ob)}/{len(best[1])}'))
            continue

        # 四级：真有差异，逐条人工查
        near = max(normed, key=lambda x: difflib.SequenceMatcher(None, ob, bare(x[0]['text'])).ratio())
        real_diff.append((it['id'], near[0]['ref'],
                          f'相似度 {difflib.SequenceMatcher(None, ob, bare(near[0]["text"])).ratio():.0%}',
                          it.get('location', '')))

    total = len(items)
    lines = [
        '# 论语原典数据源校验报告', '',
        f'- 校验对象：`parsed/canon/lunyu.json`（{len(chapters)} 章）',
        f'- 校验基准：`parsed/lunyu.json`（{total} 条已人工核验原文）',
        '- 四级判定：逐字相同 → 只差标点 → 条目为章节节选 → 实质差异', '',
        '## 汇总', '',
        '| 结果 | 条数 | 含义 |',
        '|---|---:|---|',
        f'| 逐字完全相同 | {len(exact)} | 字词标点全对 |',
        f'| 只差标点 | {len(punct_only)} | 字词全对，整理本标点不同，属版本差异 |',
        f'| 条目为章节节选 | {len(excerpt)} | 条目只引了该章的一部分，不是差异 |',
        f'| **实质差异** | {len(real_diff)} | **必须逐条查清** |',
        '',
        f'字词层面（去掉标点后）不一致的条目：**{len(real_diff)} / {total}**',
        '',
    ]

    def table(title, rows, cols, note=''):
        out = [f'## {title}', '']
        if note:
            out += [note, '']
        out += ['| ' + ' | '.join(cols) + ' |', '|' + '---|' * len(cols)]
        for r in rows:
            out.append('| ' + ' | '.join(str(x) for x in r) + ' |')
        out.append('')
        return out

    if exact:
        lines += table('逐字完全相同', exact, ['条目', '对应章', '分章系统'])
    if punct_only:
        lines += table('只差标点', punct_only, ['条目', '对应章'],
                       '字词一致，标点不同。不同整理本标点本来就不统一，'
                       '这不是数据错误，但产品引用时须与所选底本一致。')
    if excerpt:
        lines += table('条目为章节节选', excerpt, ['条目', '所属章', '条目字数/章节字数'],
                       '条目只引了该章的一部分，属正常引用，不是文字差异。')
    if real_diff:
        lines += table('实质差异（必须逐条查清）', real_diff,
                       ['条目', '最接近的章', '相似度', '条目标注位置'],
                       '**这些是字词层面真的对不上，必须人工判断：**'
                       '是条目引文跨章合并、是底本版本不同，还是数据源有问题。')

    os.makedirs(os.path.dirname(REPORT), exist_ok=True)
    with io.open(REPORT, 'w', encoding='utf-8') as f:
        f.write('\n'.join(lines))

    print(f'[verify] 逐字相同 {len(exact)} / 只差标点 {len(punct_only)} / '
          f'节选 {len(excerpt)} / 实质差异 {len(real_diff)}')
    print(f'[verify] 报告 → {os.path.relpath(REPORT, BASE)}')
    if real_diff:
        print('[verify] 实质差异条目：', ', '.join(m[0] for m in real_diff))


if __name__ == '__main__':
    main()
