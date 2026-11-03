# -*- coding: utf-8 -*-
"""注疏层异文线索 核校批 02（第 21–40 组，共 40 条）。

职责：把第二批 20 组的判断结果写成结论字段，追加回 variant-ledger.json。
数据来源：raw/commentary/index/variant-ledger.json、
          raw/commentary/index/commentary-index.json、raw/commentary/text/*.txt
对外接口：`python3 review_commentary_batch2.py`
副作用：改写 variant-ledger.json（只加结论字段，不动候选字段）；
        写 commentary-review-batch2.json（本批完整核校记录）。

## 这一层跟老子 181 条不是一回事，不能机械套用

老子那边是两个不同注家的传本（王弼本 / 河上公本），差异本身有版本学含义。
注疏层这边，一组两条是「同一部朱注的两个电子本」（`mengzi-jizhu` /
`sishu-zhangju-jizhu`），两个文件很可能出自同一数字化底本。所以：

- **两载体一致，不构成独立证据。** 它只能说明「该差异在这两个电子本里都存在」，
  不能说明「朱子本原本如此」。老子那边「两传本同现」是加分项，这边不是。
- 本批真正可用的证据只有三类：字形可直接对照（异体字）、空位可直接观察（缺字）、
  注文自证音义（朱注自己注了这个字的读音或训释）。
- 因此 `strong` 的门槛比老子那边低一档：不需要「全书用字对 ≥3 例」，
  只要**差异本身在电子文本内部就能验证**。

## 三个状态仍然不能跳级

发现差异 → 识别差异性质 → 确认版本事实。本批全部只到第二步。

`error_source = source_defect` 的条目，`confirmed` 确认的是
**「这个电子本此处缺字」**，不是「刻本缺字」，更不是「传本脱文」。
`verify_note` 里逐条写清这个边界。
"""
import io
import json
import os
import re
import sys

BASE = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
IDX = os.path.join(BASE, 'raw', 'commentary', 'index')
LEDGER = os.path.join(IDX, 'variant-ledger.json')
OUT = os.path.join(IDX, 'commentary-review-batch2.json')

BATCH = 'batch02'
AT = '2026-11-03'

# 逐组人工判定。键是 group_id，值是该组两条线索共用的结论。
# a = 原典侧用字，b = 注本侧用字（仅用于 note 里写清楚对照）。
JUDGE = {
    'VG-052': dict(
        diff_type='segmentation', error_source='digital_defect', impact='none',
        evidence='medium', confirmed=False, needs_human=False,
        core=('是天下之口相似也惟耳亦然', '是天下之口相似也 / 惟耳亦然'),
        note='注本侧「耆，与嗜同，下同」这条注文错排在「是天下之口相似也」之后，'
             '把经文切成两段，程序按连续片段比对才报出差异。两侧经文实无不同：'
             '原典作「是天下之口相似也惟耳亦然」，注本侧「惟耳亦然」也在原处。'
             '属电子本注文错位造成的假差异，不是异文。'),
    'VG-076': dict(
        diff_type='orthographic_variant', error_source='orthographic_variant', impact='orthography',
        evidence='strong', confirmed=True, needs_human=False,
        core=('蘖', '櫱'),
        note='蘖／櫱 同字异体（木枝砍而复生曰蘖）。两侧字形可直接对照，'
             '注本侧「櫱，五割反」即为此字注音，可证注本此处读的也是「蘖」。'
             '异体差异，非传本异文。'),
    'VG-048': dict(
        diff_type='omission', error_source='source_defect', impact='meaning',
        evidence='strong', confirmed=True, needs_human=False,
        core=('无或乎王之不智也，虽有天下易生之物也，一', '∅'),
        note='注本侧「舍，日暴之，十日寒之，未有能生者也」——经文'
             '「孟子曰：无或乎王之不智也。虽有天下易生之物也，一」整段缺失，'
             '只剩「日暴之」的「日」被上一句注文「舍」接走。'
             '同章下文注文有「犹一日暴之也……是十日寒之也」，'
             '说明朱注所见经文本来有这一整段。故此为**电子本缺文**，'
             '不是朱注本无此句，更不是传本脱文。须影印页才能判刻本。'),
    'VG-025': dict(
        diff_type='omission', error_source='source_defect', impact='lexical',
        evidence='strong', confirmed=True, needs_human=False,
        core=('嘑', '∅'),
        note='注本侧作「 尔而与之」，首字为空位；其下注文「 ，呼故反」同样空位，'
             '注音「呼故反」正对「嘑」字。可确认电子本此处丢字，'
             '且丢的必是「嘑」——注音把它钉住了。属电子本缺字，非传本异文。'),
    'VG-080': dict(
        diff_type='orthographic_variant', error_source='orthographic_variant', impact='orthography',
        evidence='strong', confirmed=True, needs_human=False,
        core=('覩', '睹'),
        note='覩／睹 同字异体（古文「睹」作「覩」）。字形可直接对照，'
             '文义无别。异体差异，非传本异文。'),
    'VG-027': dict(
        diff_type='orthographic_variant', error_source='orthographic_variant', impact='orthography',
        evidence='strong', confirmed=True, needs_human=False,
        core=('太宰', '大宰'),
        note='原典作「太宰」，注本作「大宰」，且注本自注「大，音泰」——'
             '朱注自己说明此处「大」读为「泰」。这是注文自证的古用字，'
             '不是讹字：注本用「大」，读作「泰」，即「太宰」。'
             '古今字差异，非传本异文。'),
    'VG-026': dict(
        diff_type='orthographic_variant', error_source='orthographic_variant', impact='orthography',
        evidence='strong', confirmed=True, needs_human=False,
        core=('太宰', '大宰'),
        note='同上条，同一章内第二处「大宰知我乎」。注本此章首见处已自注「大，音泰」，'
             '两处用字一致，可证注本全章统一作「大」。古今字差异，非传本异文。'),
    'VG-077': dict(
        diff_type='char_level', error_source='commentator_error', impact='lexical',
        evidence='medium', confirmed=False, needs_human=True,
        core=('椟', '并'),
        note='注本作「韫并而藏诸」，其下注文「并，徒木反」「并，匮也」。'
             '「徒木反」是「匵」的读音，「匮也」是「匵」（木匣）的训释——'
             '注文注的是「匵」，经文却排成「并」。'
             '「匵」讹为「并」是字形讹变（匵→櫝→椟，注本这一支作「并」）。'
             '性质可判为注本讹字，但是刻本讹还是电子本录入讹，须影印页。'),
    'VG-058': dict(
        diff_type='orthographic_variant', error_source='orthographic_variant', impact='orthography',
        evidence='strong', confirmed=True, needs_human=False,
        core=('凋', '雕'),
        note='凋／雕 通用（彫、凋、雕三字古籍常混）。「松柏之后凋」与「后雕」'
             '文义无别。用字差异，非传本异文。'),
    'VG-012': dict(
        diff_type='omission', error_source='commentator_error', impact='lexical',
        evidence='medium', confirmed=False, needs_human=True,
        core=('其身不正', '其不正'),
        note='注本作「其身正，不令而行；其不正，虽令不从」，第二句脱「身」字。'
             '同句前半有「其身正」，后半平行结构应作「其身不正」，'
             '注本脱字使对文失衡。可判为注本脱字，但两载体同脱，'
             '疑同出一源，不能互证；须影印页确认是刻本脱还是电子本脱。'),
    'VG-073': dict(
        diff_type='orthographic_variant', error_source='orthographic_variant', impact='orthography',
        evidence='strong', confirmed=True, needs_human=False,
        core=('踁踁', '硁硁'),
        note='注本作「硁硁然小人哉」，且自注「硁，苦耕反」「硁，小石之坚确者」——'
             '注音与训释都指向「硁」。原典作「踁踁」，为「硁硁」的借字。'
             '注文自证，可确认是同一词的不同写法，非传本异文。'),
    'VG-069': dict(
        diff_type='orthographic_variant', error_source='orthographic_variant', impact='orthography',
        evidence='strong', confirmed=True, needs_human=False,
        core=('犹', '由'),
        note='犹／由 通用（「由」通「犹」，尚且之意）。'
             '注本作「见且由不得亟」，文义与「见且犹不得亟」同。'
             '用字差异，非传本异文。'),
    'VG-064': dict(
        diff_type='orthographic_variant', error_source='orthographic_variant', impact='orthography',
        evidence='strong', confirmed=True, needs_human=False,
        core=('䜣', '欣'),
        note='䜣／欣 同字异体（喜也）。注本作「终身欣然」，其下注文「欣，与欣同」——'
             '注文本身已讹（当作「欣，与䜣同」），但恰好证明朱注是在辨这两个字形，'
             '即注本经文作「欣」而所注之字为「䜣」。异体差异，非传本异文。'),
    'VG-005': dict(
        diff_type='orthographic_variant', error_source='orthographic_variant', impact='orthography',
        evidence='strong', confirmed=True, needs_human=False,
        core=('朞', '期'),
        note='朞／期 同字异体（期年、期服之「期」古作「朞」）。'
             '注本作「为期之丧」，字形直接对照即可定。异体差异，非传本异文。'),
    'VG-020': dict(
        diff_type='orthographic_variant', error_source='orthographic_variant', impact='orthography',
        evidence='strong', confirmed=True, needs_human=False,
        core=('戹', '厄'),
        note='戹／厄 同字异体（困厄）。注本作「君子之厄于陈蔡之闲」，'
             '其下注文「厄，与 同」——注文此处也缺一字，当是「厄，与戹同」，'
             '正好说明注本是在辨「厄／戹」两形。异体差异，非传本异文。'),
    'VG-007': dict(
        diff_type='orthographic_variant', error_source='orthographic_variant', impact='orthography',
        evidence='strong', confirmed=True, needs_human=False,
        core=('昬昬', '昏昏'),
        note='昬／昏 同字异体（「昏」的异体作「昬」）。'
             '注本作「今以其昏昏，使人昭昭」，与注文「昏昏，闇也」一致。'
             '异体差异，非传本异文。'),
    'VG-065': dict(
        diff_type='orthographic_variant', error_source='orthographic_variant', impact='orthography',
        evidence='strong', confirmed=True, needs_human=False,
        core=('廀', '廋'),
        note='廀／廋 同字异体（隐匿曰廋，亦作廀）。'
             '注本作「若是乎从者之廋也」。异体差异，非传本异文。'),
    'VG-033': dict(
        diff_type='orthographic_variant', error_source='font_normalization', impact='font',
        evidence='strong', confirmed=True, needs_human=False,
        core=('间', '闲'),
        note='此处底本当作「閒」（「季、孟之閒」）。原典电子本简化为「间」，'
             '注本电子本简化为「闲」——同一繁体字被两套简化规则处理成两个简体字。'
             '属**录入字体层差异**，两本此处在字上并无不同。'
             '注疏层首次出现此类，单列为 font_normalization，不计入异文总量。'),
    'VG-010': dict(
        diff_type='orthographic_variant', error_source='orthographic_variant', impact='orthography',
        evidence='strong', confirmed=True, needs_human=False,
        core=('蓧', '莜'),
        note='注本作「以杖荷莜」，且自注「莜，徒吊反」——「徒吊反」正是「蓧」的读音。'
             '注文自证注的是「蓧」，经文排作「莜」。'
             '「蓧／莜」为同字异写（竹器），可判异体，非传本异文。'),
    'VG-028': dict(
        diff_type='mixed', error_source='orthographic_variant', impact='orthography',
        evidence='strong', confirmed=True, needs_human=False,
        core=('太师挚适齐 / 播鼗武入于汉', '大师挚适齐 / 播?武入于汉'),
        note='本组两处差异性质不同：①「太师」注本作「大师」，注本自注「大，音泰」，'
             '古今字，属异体层；②「播鼗武」注本作「播?武」，「鼗」字丢失成占位符，'
             '其下注文「?，徒刀反。播，摇也。?，小鼓」同样丢失，'
             '但注音「徒刀反」与训释「小鼓」正对「鼗」——可确认电子本丢字。'
             '主核按异体归，副核记缺字；两处都不是传本异文。'),
}

# 不属于传本异文的来源（统计时从异文总量里排掉）
NON_VARIANT = ('font_normalization', 'digital_defect', 'source_defect')


def main():
    led = json.load(io.open(LEDGER, encoding='utf-8'))
    items = led['items']

    groups = {}
    for it in items:
        groups.setdefault(it.get('group_id') or it['ledger_id'], []).append(it)

    # 复算本批范围，确保与 make_review_batch.py 的排序口径一致
    rows = [(g, grp, sorted({x['commentary_key'] for x in grp})) for g, grp in groups.items()]
    rows.sort(key=lambda r: (-len(r[2]), r[1][0]['chapter']))
    batch = rows[20:40]

    out_items = []
    for gid, grp, books in batch:
        j = JUDGE.get(gid)
        if not j:
            raise SystemExit('缺判定：%s' % gid)
        for it in grp:
            if it.get('review_batch') == 'batch01':
                raise SystemExit('%s 已在 batch01 核过，不能重复回写' % it['ledger_id'])
            # 候选层一个不动，结论只写结论字段
            it['diff_core'] = dict(a=j['core'][0], b=j['core'][1])
            it['diff_type_final'] = j['diff_type']
            it['variant_scope'] = ('字体层' if j['error_source'] == 'font_normalization'
                                   else '异体/通用' if j['error_source'] == 'orthographic_variant'
                                   else '注本讹误' if j['error_source'] == 'commentator_error'
                                   else '数字化缺陷' if j['error_source'] in ('source_defect', 'digital_defect')
                                   else '待考')
            it['error_source'] = j['error_source']
            it['impact'] = j['impact']
            it['evidence_level'] = j['evidence']
            it['status'] = 'confirmed' if j['confirmed'] else 'pending'
            it['confirmed'] = bool(j['confirmed'])
            # 只确认差异性质。不表示某版本正确，也不表示两侧已匹配。
            it['confirmed_scope'] = 'difference_nature'
            it['confirmed_by'] = None
            it['confirmed_at'] = None
            it['verify_note'] = j['note']
            it['needs_human'] = bool(j['needs_human'])
            it['review_batch'] = BATCH
            it['reviewed_at'] = AT
            out_items.append(dict(
                ledger_id=it['ledger_id'], group_id=gid, commentary_key=it['commentary_key'],
                book=it['book'], chapter=it['chapter'],
                canon_snippet=it.get('canon_snippet'),
                differs=it['differs'],
                diff_core=it['diff_core'], diff_type=j['diff_type'],
                variant_scope=it['variant_scope'], error_source=j['error_source'],
                impact=j['impact'], evidence_level=j['evidence'],
                status=it['status'], confirmed=it['confirmed'],
                confirmed_scope='difference_nature', confirmed_by=None,
                needs_human=it['needs_human'], verify_note=j['note'],
            ))

    # ---- 统计 ----
    def cnt(key, seq):
        d = {}
        for x in seq:
            d[x[key]] = d.get(x[key], 0) + 1
        return dict(sorted(d.items(), key=lambda kv: -kv[1]))

    gset = {x['group_id'] for x in out_items}
    confirmed_g = {x['group_id'] for x in out_items if x['confirmed']}
    stats = dict(
        batch=BATCH, reviewed_at=AT,
        groups=len(gset), items=len(out_items),
        confirmed_items=sum(1 for x in out_items if x['confirmed']),
        pending_items=sum(1 for x in out_items if not x['confirmed']),
        confirmed_groups=len(confirmed_g),
        pending_groups=len(gset) - len(confirmed_g),
        by_error_source=cnt('error_source', out_items),
        by_impact=cnt('impact', out_items),
        by_evidence=cnt('evidence_level', out_items),
        needs_human=sum(1 for x in out_items if x['needs_human']),
        non_variant_sources=list(NON_VARIANT),
        non_variant_items=sum(1 for x in out_items if x['error_source'] in NON_VARIANT),
        confirmed_scope='difference_nature',
        confirmed_by=None,
        note=('本批 20 组 40 条。同组两条是同一朱注的两个电子本，两载体一致不构成独立证据；'
              'strong 的判据是「差异在电子文本内部即可验证」（字形对照／空位可见／注文自证音义），'
              '不是老子那套「全书用字对 ≥3 例」。'
              'source_defect 的 confirmed 只表示「该电子本此处缺字」，不表示刻本缺字或传本脱文。'),
    )

    doc = dict(
        _note=('注疏层核校批 02（第 21–40 组）。这是核校结论，不是校勘定本。'
               'confirmed 只表示差异性质已确认，不表示某版本正确，也不表示两侧文字已经匹配。'
               'confirmed_by 留空待主人签字。'),
        _schema=dict(
            diff_core='最小差异核：a=原典侧，b=注本侧，∅ 表示该侧无对应文字',
            error_source=['orthographic_variant', 'commentator_error', 'source_defect',
                          'digital_defect', 'font_normalization', 'textual_variant', 'unknown'],
            evidence_level=['strong', 'medium', 'none'],
            status=['confirmed', 'pending'],
        ),
        stats=stats,
        items=out_items,
    )
    io.open(OUT, 'w', encoding='utf-8').write(
        json.dumps(doc, ensure_ascii=False, indent=1) + '\n')

    # ---- 台账统计口径 ----
    st = led.setdefault('stats', {})
    b2 = [x for x in items if x.get('review_batch') == BATCH]
    st['review_batch02'] = dict(
        groups=len(gset), items=len(b2),
        confirmed=sum(1 for x in b2 if x.get('confirmed')),
        pending=sum(1 for x in b2 if x.get('status') == 'pending'),
        needs_human=sum(1 for x in b2 if x.get('needs_human')),
        non_variant=sum(1 for x in b2 if x.get('error_source') in NON_VARIANT),
        confirmed_scope='difference_nature', confirmed_by=None,
    )
    io.open(LEDGER, 'w', encoding='utf-8').write(
        json.dumps(led, ensure_ascii=False, indent=1) + '\n')

    print('核校批 02 → %s' % os.path.relpath(OUT, BASE))
    for k in ('groups', 'items', 'confirmed_groups', 'pending_groups',
              'confirmed_items', 'pending_items', 'needs_human',
              'non_variant_items', 'by_error_source', 'by_evidence'):
        print('  %-18s %s' % (k, stats[k]))

    write_md(doc)


SCOPE_CN = {
    'orthographic_variant': '异体/通用',
    'commentator_error': '注本讹误',
    'source_defect': '电子本缺字',
    'digital_defect': '电子本注文错位',
    'font_normalization': '录入字体层',
    'textual_variant': '传本异文',
    'unknown': '待考',
}


def write_md(doc):
    s = doc['stats']
    L = []
    A = L.append
    A('# 注疏层异文线索 核校批 02（第 21–40 组）')
    A('')
    A('**这批不是校勘定本。** `confirmed = true` 只表示**差异性质已确认**，'
      '不表示原典或注本哪一侧正确，也不表示两侧文字已经匹配。`confirmed_by` 留空待签。')
    A('')
    A('同组两条是同一部朱注的两个电子本（`mengzi-jizhu` / `sishu-zhangju-jizhu`），'
      '两载体一致**不构成独立证据**——它只能说明该差异在这两个电子本里都存在，'
      '不能说明朱子本原本如此。本批的 `strong` 判据是「差异在电子文本内部即可验证」：'
      '字形可直接对照、空位可直接观察、注文自证音义。')
    A('')
    A('`source_defect` 的 `confirmed` 确认的是**这个电子本此处缺字**，'
      '不是刻本缺字，更不是传本脱文。')
    A('')
    A('## 口径')
    A('')
    A('| 项 | 数 |')
    A('|---|---|')
    A('| 组 | %d |' % s['groups'])
    A('| 条目（组 × 2 载体） | %d |' % s['items'])
    A('| confirmed 组 / 条 | %d / %d |' % (s['confirmed_groups'], s['confirmed_items']))
    A('| pending 组 / 条 | %d / %d |' % (s['pending_groups'], s['pending_items']))
    A('| needs_human | %d |' % s['needs_human'])
    A('| 非传本异文（字体层／缺字／注文错位） | %d 条 |' % s['non_variant_items'])
    A('')
    A('来源分布：' + '、'.join('%s %d' % (SCOPE_CN.get(k, k), v)
                          for k, v in s['by_error_source'].items()))
    A('')
    A('## 逐组')
    A('')
    seen = set()
    idx = 20
    for x in doc['items']:
        g = x['group_id']
        if g in seen:
            continue
        seen.add(g)
        idx += 1
        A('### %d. `%s`｜%s · %s' % (idx, g, x['book'], x['chapter']))
        A('')
        A('- 线索：' + '、'.join(y['ledger_id'] for y in doc['items'] if y['group_id'] == g))
        A('- 差异核：`%s` → `%s`' % (x['diff_core']['a'], x['diff_core']['b']))
        A('- 判定：%s（%s）｜影响 %s｜证据 %s｜状态 **%s**'
          % (x['diff_type'], SCOPE_CN.get(x['error_source'], x['error_source']),
             x['impact'], x['evidence_level'], x['status']))
        if x['needs_human']:
            A('- 需人工：是')
        A('- 依据：%s' % x['verify_note'])
        A('')
    io.open(os.path.join(IDX, 'variant-review-batch2.md'), 'w', encoding='utf-8').write(
        '\n'.join(L) + '\n')
    print('  结论文档 → raw/commentary/index/variant-review-batch2.md')


if __name__ == '__main__':
    main()
