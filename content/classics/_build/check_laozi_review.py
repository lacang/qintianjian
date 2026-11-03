"""老子 181 条核校结果的结构检查。

职责：独立核对 laozi-variant-review.json 是否满足本轮验收标准——
      181 条逐条有结论、有证据、有状态，且各字段互不矛盾。
判据来源：主人第七轮裁决「全量验收」五条 + 前六轮累积的分类纪律。
对外接口：`python3 check_laozi_review.py`，退出码 0 表示全过。
副作用：只读。

**为什么单独写检查、不在生成脚本里顺手断言**：生成脚本的断言只能证明
它自己按自己的逻辑跑完了；这里的判据来自裁决要求，两者不能是同一套代码。
"""
import io
import json
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import build_laozi_variant_ledger as G

P = os.path.join(G.BASE, 'raw', 'commentary', 'index', 'laozi-variant-review.json')
SRC = os.path.join(G.BASE, 'raw', 'commentary', 'index', 'laozi-variant-ledger.json')

OK, BAD = [], []


def ck(cond, msg):
    (OK if cond else BAD).append(msg)


def main():
    v = json.load(io.open(P, encoding='utf-8'))
    src = json.load(io.open(SRC, encoding='utf-8'))
    items = v['items']
    st = v['stats']

    # 1 条目数与来源台账一致
    ck(len(items) == 181 == src['count'],
       '条目数 181（实际 %d / 来源台账 %d）' % (len(items), src['count']))

    # 2 ledger_id 唯一且与来源台账逐一对应
    ids = [i['ledger_id'] for i in items]
    ck(len(set(ids)) == 181, 'ledger_id 唯一（%d 个）' % len(set(ids)))
    ck(set(ids) == {x['ledger_id'] for x in src['items']},
       'ledger_id 与来源台账完全一致')

    # 3 逐条四要素齐全
    miss = [i['ledger_id'] for i in items
            if not all(i.get(k) for k in ('diff_type', 'error_source', 'impact',
                                          'evidence_level', 'status', 'verify_note'))]
    ck(not miss, '逐条都有 diff_type/error_source/impact/evidence_level/status/verify_note'
                 + ('，缺：%s' % miss[:5] if miss else ''))

    # 4 枚举值合法
    DT = {'char_level', 'omission', 'addition', 'word_order', 'mixed'}
    ES = {'textual_variant', 'orthographic_variant', 'phonetic_loan', 'commentator_error',
          'ocr_defect', 'source_excerpt_issue', 'font_normalization', 'mixed', 'unknown'}
    EV = {'strong', 'medium', 'none'}
    IM = {'font', 'orthography', 'syntax', 'lexical', 'meaning'}
    ck(all(i['diff_type'] in DT for i in items), 'diff_type 取值合法')
    ck(all(i['error_source'] in ES for i in items), 'error_source 取值合法')
    ck(all(i['evidence_level'] in EV for i in items), 'evidence_level 取值合法')
    ck(all(i['impact'] in IM for i in items), 'impact 取值合法')

    # 5 confirmed 与 evidence_level 双向一致
    a = [i['ledger_id'] for i in items if i['confirmed'] and i['evidence_level'] != 'strong']
    b = [i['ledger_id'] for i in items if i['evidence_level'] == 'strong' and not i['confirmed']]
    ck(not a, 'confirmed=true 的条目证据都是 strong' + ('，例外：%s' % a[:5] if a else ''))
    ck(not b, 'strong 证据的条目都已 confirmed' + ('，例外：%s' % b[:5] if b else ''))

    # 6 status 与 confirmed 一致
    ck(all((i['status'] == 'confirmed') == bool(i['confirmed']) for i in items),
       'status 与 confirmed 一致')

    # 7 字体层差异：确认是字体层，且不能混进异文影响度
    fo = [i for i in items if i['error_source'] == 'font_normalization']
    ck(all(i['confirmed'] and i['impact'] == 'font' for i in fo),
       'font_normalization 均 confirmed 且 impact=font（%d 条）' % len(fo))

    # 8 用字差异的影响度必须是 orthography
    og = [i for i in items if i['error_source'] == 'orthographic_variant']
    ck(all(i['impact'] == 'orthography' for i in og),
       'orthographic_variant 均 impact=orthography（%d 条）' % len(og))

    # 9 unknown 不得 confirmed
    un = [i for i in items if i['error_source'] == 'unknown']
    ck(not any(i['confirmed'] for i in un),
       'unknown 均未 confirmed（%d 条）' % len(un))

    # 10 语序条目必须有回查说明
    wo = [i for i in items if i['diff_type'] == 'word_order']
    ck(all(i.get('word_order_note') for i in wo),
       'word_order 均有 word_order_note（%d 条）' % len(wo))

    # 11 大段脱/衍必须有源文件回查记录
    big = [i for i in items if i['variant_scope'] in ('脱句', '衍句')]
    ck(all(i.get('source_checked') for i in big),
       '脱句/衍句 均有源文件回查记录（%d 条）' % len(big))

    # 12 needs_human 与证据强度自洽
    ck(all((not i['needs_human']) or i['evidence_level'] == 'none' for i in items),
       'needs_human 只出现在 none 证据的条目上')

    # 13 本轮不代签
    ck(not any(i.get('confirmed_by') for i in items),
       '未写 confirmed_by（本轮由 Agent 归类，不代主人签字）')

    # 14 统计口径与条目一致
    ck(st['total'] == len(items), 'stats.total 一致')
    ck(st['confirmed'] == sum(1 for i in items if i['confirmed']), 'stats.confirmed 一致')
    ck(st['pending'] == sum(1 for i in items if not i['confirmed']), 'stats.pending 一致')
    ck(st['needs_human'] == sum(1 for i in items if i['needs_human']),
       'stats.needs_human 一致')
    ck(sum(st['by_evidence'].values()) == 181, 'by_evidence 合计 181')
    ck(sum(st['by_source'].values()) == 181, 'by_source 合计 181')

    # 15 不与注疏层合并统计
    ck('lunyu' not in json.dumps(v, ensure_ascii=False)[:2000],
       '未把注疏层条目混进老子结果')

    # ---------- 以下检查台账回写 ----------
    led = json.load(io.open(SRC, encoding='utf-8'))
    L = {x['ledger_id']: x for x in led['items']}
    R = {x['ledger_id']: x for x in items}

    # 16 台账每条都有 review，且条目数未变
    ck(len(led['items']) == 181, '台账条目数仍为 181（回写没有增删条目）')
    ck(all('review' in x for x in led['items']), '台账 181 条都带 review 结论层')

    # 17 原始候选字段一个没改
    KEEP = ('kind', 'chapter', 'canon_snippet', 'differs', 'wangbi_side',
            'canon_classic', 'source_file', 'loc_start', 'loc_end',
            'occurrences', 'occurrence_locs')
    bad = []
    for lid, x in L.items():
        r = R.get(lid)
        if not r:
            continue
        for k in KEEP:
            if x.get(k) != r.get(k):
                bad.append('%s.%s' % (lid, k))
    ck(not bad, '原始候选字段未被改写（differs/wangbi_side/occurrence_locs 等）'
                + ('，异常：%s' % bad[:5] if bad else ''))

    # 18 顶层结论字段仍是空的：结论不能污染候选层
    dirty = [x['ledger_id'] for x in led['items']
             if x.get('confirmed') or x.get('diff_type') or x.get('verify_note')]
    ck(not dirty, '顶层 confirmed/diff_type/verify_note 仍为空（结论只在 review 里）'
                  + ('，被写了：%s' % dirty[:5] if dirty else ''))

    # 19 review 层与结论文件逐条一致
    diff = [x['ledger_id'] for x in led['items']
            if x['review']['status'] != R[x['ledger_id']]['status']
            or x['review']['evidence_level'] != R[x['ledger_id']]['evidence_level']
            or x['review']['error_source'] != R[x['ledger_id']]['error_source']]
    ck(not diff, '台账 review 与核校结论文件逐条一致'
                 + ('，不一致：%s' % diff[:5] if diff else ''))

    # 20 confirmed 语义被写死在数据里
    ck(all(x['review']['confirmed_scope'] == 'difference_nature'
           for x in led['items']),
       'review.confirmed_scope 全为 difference_nature（只确认差异性质）')

    # 21 不代签
    ck(all(x['review']['confirmed_by'] is None for x in led['items']),
       'review.confirmed_by 全为空（签字待主人）')

    # 22 字体层独立，不计入异文总量
    rs = led['stat']['review']
    ck(len(rs['font_layer_excluded']) == 3,
       '字体层差异单列 3 条：%s' % '、'.join(rs['font_layer_excluded']))
    ck(rs['in_variant_ledger'] == 181 - 3,
       '异文台账内 %d 条（181 − 字体层 3）' % rs['in_variant_ledger'])
    ck(all(L[i]['review']['impact'] == 'font' for i in rs['font_layer_excluded']),
       '字体层条目 impact 全为 font')

    # 23 pending 没被升级
    ck(rs['confirmed'] == 25 and rs['pending'] == 156,
       'confirmed 25 / pending 156（medium、none 未被升级）')
    ck(not any(x['review']['confirmed'] and x['review']['evidence_level'] != 'strong'
               for x in led['items']),
       '台账内 confirmed 条目证据均为 strong')

    print('通过 %d 项' % len(OK))
    for m in OK:
        print('  ✓', m)
    if BAD:
        print('\n失败 %d 项' % len(BAD))
        for m in BAD:
            print('  ✗', m)
        return 1
    print('\n全部通过')
    return 0


if __name__ == '__main__':
    sys.exit(main())
