# -*- coding: utf-8 -*-
"""注疏层核校批 02 结构检查。

职责：独立验证 review_commentary_batch2.py 的产物是否满足裁决要求。
判据来自主人第八轮裁决与注疏层既有 schema，不来自生成脚本的实现细节。
对外接口：`python3 check_commentary_review2.py`（通过退出码 0／1）
副作用：只读。打印每项判据与失败明细。
"""
import hashlib
import io
import json
import os
import sys

BASE = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
IDX = os.path.join(BASE, 'raw', 'commentary', 'index')
LEDGER = os.path.join(IDX, 'variant-ledger.json')
BAK = os.path.join(BASE, '_build', '_bak', 'variant-ledger.pre-batch02.json')
REVIEW = os.path.join(IDX, 'commentary-review-batch2.json')
LAOZI = os.path.join(IDX, 'laozi-variant-ledger.json')

ERRS = []
N = [0]


def ck(ok, label, detail=None):
    N[0] += 1
    if ok:
        print('  ok   %s' % label)
    else:
        print('  FAIL %s' % label)
        ERRS.append(label + (('：' + str(detail)) if detail else ''))


def main():
    led = json.load(io.open(LEDGER, encoding='utf-8'))
    rev = json.load(io.open(REVIEW, encoding='utf-8'))
    bak = json.load(io.open(BAK, encoding='utf-8'))
    items = led['items']
    b2 = [x for x in items if x.get('review_batch') == 'batch02']
    b1 = [x for x in items if x.get('review_batch') == 'batch01']
    rit = rev['items']
    L = {x['ledger_id']: x for x in items}
    R = {x['ledger_id']: x for x in rit}
    BK = {x['ledger_id']: x for x in bak['items']}

    print('\n[一] 范围与条目')
    ck(len(rit) == 40, '核校记录 40 条（20 组 × 2 载体）', len(rit))
    ck(len(b2) == 40, '台账本批 40 条', len(b2))
    ck(set(R) == {x['ledger_id'] for x in b2}, '记录与台账逐条对应，无多无缺')
    ck(len({x['group_id'] for x in rit}) == 20, '本批 20 组')
    ck(all(len([y for y in b2 if y['group_id'] == g]) == 2 for g in {x['group_id'] for x in b2}),
       '每组恰好 2 条（两个注本载体）')
    ck(not (set(R) & {x['ledger_id'] for x in b1}), '未与 batch01 条目重叠')

    print('\n[二] 候选层未被改写')
    KEEP = ('kind', 'entry_id', 'group_id', 'commentary_key', 'book', 'chapter',
            'canon_snippet', 'differs', 'note_side', 'note_side_missing',
            'canon_side_verified', 'source_file', 'loc_start', 'loc_end', 'diff_type')
    bad = []
    for lid, x in BK.items():
        y = L.get(lid)
        if not y:
            bad.append('%s 缺失' % lid)
            continue
        for k in KEEP:
            if x.get(k) != y.get(k):
                bad.append('%s.%s' % (lid, k))
    ck(not bad, '全部 %d 条候选字段与回写前逐字一致' % len(BK), bad[:6])
    # 备份点必须是「本批尚未回写」。batch01 的 56 条本来就有 review_batch，
    # 所以只校验本批 40 条在备份里是干净的。
    b2ids = {x['ledger_id'] for x in b2}
    ck(all('review_batch' not in BK[i] for i in b2ids),
       '备份点正确：本批 40 条回写前无任何结论字段')
    b1ids = [i for i in BK if BK[i].get('review_batch') == 'batch01']
    ck(all(L[i].get('review_batch') == 'batch01' for i in b1ids),
       'batch01 的 %d 条结论未被本批覆盖' % len(b1ids),
       [i for i in b1ids if L[i].get('review_batch') != 'batch01'][:5])

    print('\n[三] 枚举与语义')
    ck(all(x['error_source'] in rev['_schema']['error_source'] for x in rit),
       'error_source 取值合法')
    ck(all(x['evidence_level'] in ('strong', 'medium', 'none') for x in rit),
       'evidence_level 取值合法')
    ck(all(x['status'] in ('confirmed', 'pending') for x in rit), 'status 只有两档')
    ck(all((x['status'] == 'confirmed') == bool(x['confirmed']) for x in rit),
       'status 与 confirmed 双向一致')
    ck(all(x['confirmed_scope'] == 'difference_nature' for x in rit),
       'confirmed_scope 一律 difference_nature（只确认差异性质）')
    ck(all(x['confirmed_by'] is None for x in rit), 'confirmed_by 全部留空（不代签）')
    ck(all(L[x['ledger_id']].get('confirmed_at') is None for x in rit),
       'confirmed_at 未擅自填写')

    print('\n[四] 证据等级与确认')
    ck(all(x['evidence_level'] == 'strong' for x in rit if x['confirmed']),
       'confirmed 的条目证据全为 strong')
    ck(all(not x['confirmed'] for x in rit if x['evidence_level'] == 'medium'),
       'medium 一律未升级为 confirmed')
    ck(all(not x['needs_human'] for x in rit if x['confirmed']),
       '已确认条目不占人工')

    print('\n[五] 分类与影响一致')
    ck(all(x['impact'] == 'font' for x in rit if x['error_source'] == 'font_normalization'),
       'font_normalization 的 impact 一律为 font')
    ck(all(x['impact'] == 'orthography' for x in rit
           if x['error_source'] == 'orthographic_variant'),
       'orthographic_variant 的 impact 一律为 orthography')
    ck(all(x['impact'] == 'none' for x in rit if x['error_source'] == 'digital_defect'),
       'digital_defect 的 impact 为 none（不是异文）')
    ck(all(x['diff_type'] == 'segmentation' for x in rit
           if x['error_source'] == 'digital_defect'),
       'digital_defect 的 diff_type 记为 segmentation（注文错位）')

    print('\n[六] 同组两条结论一致')
    gbad = []
    for g in {x['group_id'] for x in rit}:
        xs = [x for x in rit if x['group_id'] == g]
        for k in ('error_source', 'impact', 'evidence_level', 'status',
                  'confirmed', 'needs_human', 'diff_core', 'diff_type'):
            if xs[0][k] != xs[1][k]:
                gbad.append('%s.%s' % (g, k))
    ck(not gbad, '每组两载体的结论逐字段相同', gbad[:6])

    print('\n[七] 统计口径')
    s = rev['stats']
    ck(s['items'] == 40 and s['groups'] == 20, 'stats 条目／组数正确')
    ck(s['confirmed_items'] == sum(1 for x in rit if x['confirmed']),
       'confirmed_items 与逐条统计一致', (s['confirmed_items'],))
    ck(s['pending_items'] == sum(1 for x in rit if not x['confirmed']),
       'pending_items 与逐条统计一致')
    ck(s['confirmed_groups'] + s['pending_groups'] == 20, '组级 confirmed＋pending 等于 20')
    ck(s['needs_human'] == sum(1 for x in rit if x['needs_human']), 'needs_human 口径一致')
    ck(s['non_variant_items'] == sum(1 for x in rit
                                     if x['error_source'] in ('font_normalization',
                                                              'digital_defect', 'source_defect')),
       '非传本异文条目数口径一致')
    ck(led['stats']['review_batch02']['items'] == 40, '台账 stats.review_batch02 已登记')

    print('\n[八] 分层不串')
    ck(all('review_batch' not in x for x in
           json.load(io.open(LAOZI, encoding='utf-8'))['items']),
       '老子台账未被本批写入')
    ck(all(x['commentary_key'] in ('lunyu-jizhu', 'mengzi-jizhu', 'sishu-zhangju-jizhu')
           for x in b2), '本批只含注疏层三个注本载体')
    ck(not any(x.get('book') in ('老子',) for x in b2), '未混入老子条目')

    print('\n[九] 幂等基线')
    h = hashlib.sha256(io.open(LEDGER, 'rb').read()).hexdigest()[:16]
    print('  台账 sha256[:16] = %s' % h)
    print('  记录 sha256[:16] = %s'
          % hashlib.sha256(io.open(REVIEW, 'rb').read()).hexdigest()[:16])

    print('\n共 %d 项，失败 %d 项' % (N[0], len(ERRS)))
    if ERRS:
        for e in ERRS:
            print('  - %s' % e)
        return 1
    return 0


if __name__ == '__main__':
    sys.exit(main())
