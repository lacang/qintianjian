"""核校写回与源文件缺陷台账的局部结构检查。

职责：核对条目数、关联 ID、状态一致性、审校依据、两种缺陷类型的必填字段。
数据来源：variant-ledger.json、commentary-index.json、source-defect-ledger.json。
对外接口：`python3 check_review_writeback.py`，异常退出 1。
副作用：无（只读）。

**为什么单独一个脚本**：写回脚本自己检查自己等于没检查。
这里的判据来自主人的裁决要求，不是写回脚本的实现细节。
"""
import io, json, os
from collections import defaultdict

BASE = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
IDX = os.path.join(BASE, 'raw', 'commentary', 'index')

# 两种缺陷类型各自必填的字段。missing_char 记单字，missing_passage 记连续文本，
# 不能用同一套字段糊过去——修复、定位、验证方式都不一样。
KIND_FIELDS = {
    'missing_char': ('char_expected', 'char_present'),
    'missing_passage': ('anchor_before', 'anchor_after',
                        'expected_text', 'estimated_missing_chars'),
}


def main():
    v = json.load(io.open(os.path.join(IDX, 'variant-ledger.json'), encoding='utf-8'))
    idx = json.load(io.open(os.path.join(IDX, 'commentary-index.json'), encoding='utf-8'))
    d = json.load(io.open(os.path.join(IDX, 'source-defect-ledger.json'), encoding='utf-8'))
    items, ids = v['items'], {e['id'] for e in idx['entries']}
    by_lid = {it['ledger_id']: it for it in items}
    bad = []

    # 1 条目数没被写回动作改变
    if len(items) != 142:
        bad.append('条目数变了：%d（应为 142）' % len(items))
    if v['count'] != len(items):
        bad.append('count 字段 %s 与实际 %d 不符' % (v['count'], len(items)))

    # 2 关联 ID 存在、ledger_id 唯一
    miss = [it['ledger_id'] for it in items if it['entry_id'] not in ids]
    if miss:
        bad.append('entry_id 找不到：%s' % ', '.join(miss[:5]))
    lid = [it['ledger_id'] for it in items]
    if len(lid) != len(set(lid)):
        bad.append('ledger_id 有重复')

    # 3 confirmed 三件套 / 反向自洽
    for it in items:
        if it.get('confirmed'):
            for k in ('confirmed_by', 'confirmed_at', 'verify_note', 'error_source'):
                if not it.get(k):
                    bad.append('%s confirmed=true 但缺 %s' % (it['ledger_id'], k))
        elif it.get('confirmed_by'):
            bad.append('%s confirmed=false 却填了 confirmed_by' % it['ledger_id'])

    # 4 状态与来源自洽
    for it in items:
        s, es = it.get('status'), it.get('error_source')
        if s == 'source_defect':
            if es != 'ocr_defect':
                bad.append('%s source_defect 但 error_source=%s' % (it['ledger_id'], es))
            if not it.get('moved_to'):
                bad.append('%s source_defect 但没写 moved_to' % it['ledger_id'])
            # 源文件缺陷不是传本异文，不得套用异文形态分类
            if it.get('diff_type') is not None:
                bad.append('%s source_defect 不应填 diff_type（不是传本异文）' % it['ledger_id'])

    # 5 同组同判
    g = defaultdict(list)
    for it in items:
        if it.get('review_batch') == 'batch01':
            g[it.get('group_id') or it['ledger_id']].append(it)
    for gid, grp in g.items():
        for f in ('status', 'error_source', 'confirmed', 'moved_to'):
            vals = {x.get(f) for x in grp}
            if len(vals) > 1:
                bad.append('组 %s 内 %s 不一致：%s' % (gid, f, vals))

    # 6 缺陷记录：结构约束
    seen = set()
    for rec in d['items']:
        did, kind = rec['defect_id'], rec.get('kind')
        if did in seen:
            bad.append('缺陷 ID 重复：%s' % did)
        seen.add(did)
        if kind not in KIND_FIELDS:
            bad.append('%s 未知 kind：%s' % (did, kind))
            continue
        for f in KIND_FIELDS[kind]:
            if rec.get(f) in (None, ''):
                bad.append('%s（%s）缺必填字段 %s' % (did, kind, f))
        for f in ('status', 'error_source', 'classic', 'commentary', 'chapter',
                  'source_file', 'source_location', 'evidence',
                  'related_entries', 'related_groups', 'fix'):
            if rec.get(f) in (None, '', []):
                if f in ('related_entries', 'related_groups'):
                    bad.append('%s 缺 %s，关联关系不能丢' % (did, f))
                else:
                    bad.append('%s 缺必填字段 %s' % (did, f))
        # expected_text 是推定文本，必须显式标明，不能让人当成已核实的底本文字
        if rec.get('expected_text') and rec.get('expected_text_is_inferred') is not True:
            bad.append('%s expected_text 未标 expected_text_is_inferred=true' % did)
        if kind == 'missing_passage' and not isinstance(rec.get('estimated_missing_chars'), int):
            bad.append('%s estimated_missing_chars 必须是整数估算值' % did)
        # fix 三格：open 时全空，不许提前填「已修好」
        fx = rec.get('fix') or {}
        if set(fx) != {'before', 'after', 'basis'}:
            bad.append('%s fix 必须是 before/after/basis 三格' % did)
        if rec.get('status') == 'open' and any(fx.values()):
            bad.append('%s status=open 但 fix 已填内容' % did)
        # 关联条目必须真实存在，且确实标了 source_defect 并指回本条
        for rl in rec['related_entries']:
            it = by_lid.get(rl)
            if not it:
                bad.append('%s 关联的 %s 不存在' % (did, rl))
                continue
            if it.get('status') != 'source_defect':
                bad.append('%s 关联的 %s 状态不是 source_defect' % (did, rl))
            if (it.get('moved_to') or '').split('#')[-1] != did:
                bad.append('%s 关联的 %s 的 moved_to 没指回本条' % (did, rl))

    # 7 没有缺陷记录漏接：所有 source_defect 条目都得被某条记录收下
    covered = {rl for rec in d['items'] for rl in rec['related_entries']}
    for it in items:
        if it.get('status') == 'source_defect' and it['ledger_id'] not in covered:
            bad.append('%s 标了 source_defect 但没进任何缺陷记录' % it['ledger_id'])

    # 8 只动了本批涉及的经典
    touched = {it['canon_classic'] for it in items if it.get('review_batch') == 'batch01'}
    allowed = {'lunyu', 'mengzi', 'lunyu+mengzi+daxue+zhongyong'}
    if touched - allowed:
        bad.append('本批波及了其他经典：%s' % (touched - allowed))

    # 9 统计口径：源文件缺陷不算异文
    st = v.get('stats') or {}
    if st.get('in_variant_ledger') != len(items) - (st.get('source_defect') or 0):
        bad.append('stats.in_variant_ledger 口径不对')
    if st.get('confirmed') != sum(1 for it in items if it.get('status') == 'confirmed'):
        bad.append('stats.confirmed 与实际 confirmed 状态数不符')
    if st.get('confirmed_any') != sum(1 for it in items if it.get('confirmed')):
        bad.append('stats.confirmed_any 口径不对')
    if d.get('count') != len(d['items']):
        bad.append('缺陷台账 count 与实际条数不符')

    print('核校写回结构检查')
    print('  线索 %d 条 / 组 %d 个 / 本批 %d 条'
          % (len(items), len({it.get('group_id') or it['ledger_id'] for it in items}),
             sum(1 for it in items if it.get('review_batch') == 'batch01')))
    print('  状态 %s' % dict(st.get('by_status') or {}))
    print('  进入异文台账 %s 条；源文件缺陷 %s 条 → 缺陷记录 %d 条 %s'
          % (st.get('in_variant_ledger'), st.get('source_defect'), d['count'],
             dict(d.get('by_kind') or {})))
    print('  性质可确认：台账内 %s 条，含缺陷共 %s 条'
          % (st.get('confirmed'), st.get('confirmed_any')))
    if bad:
        print('\n  不一致 %d 处：' % len(bad))
        for b in bad:
            print('    ✗', b)
        raise SystemExit(1)
    print('  一致')


if __name__ == '__main__':
    main()
