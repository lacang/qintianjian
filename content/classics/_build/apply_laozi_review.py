"""把老子 181 条核校结论追加式回写到原台账。

职责：读 laozi-variant-review.json，把每条结论写进
      laozi-variant-ledger.json 的 `review` 子对象，并补 stats.review 口径。
数据来源：laozi-variant-review.json（结论层）、laozi-variant-ledger.json（候选层）。
对外接口：`python3 apply_laozi_review.py`；幂等。
副作用：改写 laozi-variant-ledger.json。

**为什么是追加式，而不是把结论填进顶层字段**：
顶层 `differs` / `wangbi_side` / `diff_type` / `confirmed` 是**原始候选记录**——
它记录的是「程序在源文件里发现了这处不同」，这个事实不随核校结论改变。
一旦把核校结论写进顶层 `confirmed`，原始候选就被改造成了结论，
以后再也分不清「当初发现了什么」和「后来判成了什么」。
所以：原始字段一个不动，结论全部放进 `review`，两层各自可查。

**`review.confirmed` 的语义只有一个**：差异性质已确认。
它不表示 A 本或 B 本更接近原本，也不表示两边文字已经匹配上。
`confirmed_scope = "difference_nature"` 把这条写死在数据里，
免得下游误读成版本裁定。
"""
import io
import json
import os
import sys
from collections import Counter

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import build_laozi_variant_ledger as G

IDX = os.path.join(G.BASE, 'raw', 'commentary', 'index')
LEDGER = os.path.join(IDX, 'laozi-variant-ledger.json')
REVIEW = os.path.join(IDX, 'laozi-variant-review.json')

AT = '2026-11-03'
METHOD = 'batch-laizi-01'


def build_review(it):
    """一条核校结论 → review 子对象。"""
    d = it['diff_core']
    ev = []
    for s in it.get('systematic') or []:
        ev.append(dict(kind='systematic_pair', a=s['a'], b=s['b'],
                       count=s['count'], chapters=s['chapters']))
    if it.get('note_cited'):
        ev.append(dict(kind='note_citation', text=it['note_cited']))
    if it.get('source_checked'):
        ev.append(dict(kind='source_file_check',
                       fragment=it['source_checked']['fragment'],
                       found_other_side=it['source_checked']['found_other_side']))
    if it.get('word_order_note'):
        ev.append(dict(kind='word_order', note=it['word_order_note']))
    return dict(
        reviewed_at=AT,
        method=METHOD,
        # 最小差异核：原始 a_seg/b_seg 在顶层 differs/wangbi_side，这里只放细分结果
        diff_core=dict(block_a=d['block_a'], block_b=d['block_b'],
                       cores=[dict(op=c['op'], a=c['a'], b=c['b']) for c in d['cores']]),
        diff_type=it['diff_type'],
        variant_scope=it['variant_scope'],
        error_source=it['error_source'],
        impact=it['impact'],
        evidence_level=it['evidence_level'],
        evidence=ev,
        evidence_note=it['verify_note'],
        status=it['status'],
        confirmed=bool(it['confirmed']),
        # 只确认差异性质。不表示某版本正确，也不表示两边已匹配。
        confirmed_scope='difference_nature',
        confirmed_by=None,
        needs_human=bool(it['needs_human']),
    )


def main():
    rev = json.load(io.open(REVIEW, encoding='utf-8'))
    led = json.load(io.open(LEDGER, encoding='utf-8'))
    by_id = {i['ledger_id']: i for i in rev['items']}

    miss = [x['ledger_id'] for x in led['items'] if x['ledger_id'] not in by_id]
    if miss:
        raise SystemExit('台账有条目没有核校结论：%s' % miss[:5])

    for x in led['items']:
        x['review'] = build_review(by_id[x['ledger_id']])

    items = led['items']
    st = Counter(x['review']['status'] for x in items)
    ev = Counter(x['review']['evidence_level'] for x in items)
    sr = Counter(x['review']['error_source'] for x in items)
    font = [x['ledger_id'] for x in items if x['review']['error_source'] == 'font_normalization']

    led['stat']['review'] = dict(
        reviewed=len(items),
        confirmed=st.get('confirmed', 0),
        pending=st.get('pending', 0),
        needs_human=sum(1 for x in items if x['review']['needs_human']),
        by_status=dict(st),
        by_evidence=dict(ev),
        by_source=dict(sr),
        # 字体层差异不是传本异文，跨版本比较时必须排除，不能计入异文总量
        font_layer_excluded=font,
        in_variant_ledger=len(items) - len(font),
        confirmed_scope='difference_nature',
        confirmed_by=None,
        note=('review 是核校层，顶层 differs/wangbi_side/diff_type/confirmed 是候选层，'
              '两层不互相覆盖。confirmed 只表示差异性质已确认，不表示某版本正确；'
              'confirmed_by 留空待主人签字。font_normalization 不计入异文总量。'),
    )

    io.open(LEDGER, 'w', encoding='utf-8').write(
        json.dumps(led, ensure_ascii=False, indent=1) + '\n')

    print('回写 %d 条' % len(items))
    print('状态', dict(st))
    print('证据', dict(ev))
    print('来源', dict(sr))
    print('字体层排除 %d 条：%s' % (len(font), '、'.join(font)))
    print('异文台账内 %d 条' % (len(items) - len(font)))


if __name__ == '__main__':
    main()
